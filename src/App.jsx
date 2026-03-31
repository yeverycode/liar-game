import { useEffect, useMemo, useState } from 'react'
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  runTransaction,
  collection,
} from 'firebase/firestore'
import './App.css'
import { db } from './firebase'

const TOPICS = [
  {
    id: 'language',
    label: '프로그래밍언어',
    en: 'Programming',
    words: ['Python', 'C', 'JavaScript', 'Java'],
  },
  {
    id: 'color',
    label: '색깔',
    en: 'Color',
    words: ['빨강', '파랑', '초록', '노랑', '보라', '검정', '흰색', '주황'],
  },
  {
    id: 'sports',
    label: '스포츠',
    en: 'Sports',
    words: ['축구', '농구', '야구', '배구', '테니스', '수영', '배드민턴', '탁구'],
  },
  {
    id: 'food',
    label: '음식',
    en: 'Food',
    words: ['떡볶이', '김치찌개', '비빔밥', '냉면', '삼겹살', '치킨', '초밥', '라멘'],
  },
  {
    id: 'job',
    label: '직업',
    en: 'Job',
    words: ['의사', '소방관', '교사', '셰프', '개발자', '기자', '디자이너', '파일럿'],
  },
  {
    id: 'webapp',
    label: '웹/앱',
    en: 'Web/App',
    words: ['디스코드', '카카오톡', '티스토리', '인스타그램'],
  },
]

const STAGES = {
  LOBBY: 'lobby',
  REVEAL: 'reveal',
  DISCUSSION: 'discussion',
  VOTING: 'voting',
  RESULT: 'result',
}

const randomItem = (list) => list[Math.floor(Math.random() * list.length)]

const shuffle = (list) => {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => randomItem(chars.split(''))).join('')
}

function App() {
  const [roomName, setRoomName] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [roomId, setRoomId] = useState(
    () => new URLSearchParams(window.location.search).get('room') || ''
  )
  const [playerId, setPlayerId] = useState('')
  const [isHost, setIsHost] = useState(false)
  const [roomData, setRoomData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [revealOpen, setRevealOpen] = useState(false)
  const [liarGuess, setLiarGuess] = useState('')

  const shareLink = roomId
    ? `${window.location.origin}${window.location.pathname}?room=${roomId}`
    : ''

  useEffect(() => {
    if (!roomId) return
    const roomRef = doc(db, 'rooms', roomId)
    const unsub = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) {
        setRoomData(null)
        setError('방을 찾을 수 없습니다.')
        return
      }
      setRoomData({ id: snap.id, ...snap.data() })
      setError('')
    })
    return () => unsub()
  }, [roomId])

  const roomPlayers = roomData?.players || []
  const playerCount = roomPlayers.length
  const roomStage = roomData?.stage || STAGES.LOBBY

  const currentPlayer = roomPlayers.find((player) => player.id === playerId)
  const liarId = roomData?.liarId
  const isLiar = liarId && playerId === liarId

  const totalTurns = useMemo(
    () => (roomData ? roomData.rounds * playerCount : 0),
    [roomData, playerCount]
  )
  const turnIndex = roomData?.turnIndex || 0
  const currentSpeakerId = roomData?.turnOrder?.[turnIndex % Math.max(playerCount, 1)]
  const currentSpeaker = roomPlayers.find((player) => player.id === currentSpeakerId)
  const currentRound = playerCount === 0 ? 0 : Math.floor(turnIndex / playerCount) + 1

  const votes = roomData?.votes || {}
  const votesComplete = playerCount > 0 && Object.keys(votes).length === playerCount

  const tally = useMemo(() => {
    const counts = {}
    Object.values(votes).forEach((choice) => {
      if (!choice) return
      counts[choice] = (counts[choice] || 0) + 1
    })
    return counts
  }, [votes])

  const topSuspects = useMemo(() => {
    const entries = Object.entries(tally)
    if (entries.length === 0) return []
    const maxVotes = Math.max(...entries.map(([, count]) => count))
    return entries.filter(([, count]) => count === maxVotes).map(([id]) => id)
  }, [tally])

  const liarCaught = topSuspects.length === 1 && topSuspects[0] === liarId
  const voteTie = topSuspects.length > 1
  const liarWinsByVote = topSuspects.length === 1 && topSuspects[0] !== liarId

  const createRoom = async () => {
    const trimmedName = playerName.trim()
    if (!trimmedName) {
      setError('닉네임을 입력하세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const newRoomRef = doc(collection(db, 'rooms'))
      const newRoomId = newRoomRef.id
      const newPlayerId = crypto.randomUUID()

      const initialRoom = {
        name: roomName.trim() || '라이어게임 방',
        hostId: newPlayerId,
        players: [{ id: newPlayerId, name: trimmedName }],
        stage: STAGES.LOBBY,
        createdAt: serverTimestamp(),
        topicMode: 'random',
        topicId: TOPICS[0].id,
        customTopic: '',
        customWord: '',
        rounds: 1,
        randomOrder: true,
        selectedTopic: '',
        selectedWord: '',
        liarId: null,
        turnOrder: [],
        turnIndex: 0,
        votes: {},
        liarGuess: '',
        guessResult: null,
      }

      await setDoc(newRoomRef, initialRoom)
      setRoomId(newRoomId)
      setPlayerId(newPlayerId)
      setIsHost(true)
      window.history.replaceState(null, '', `?room=${newRoomId}`)
    } catch (err) {
      setError('방 생성에 실패했습니다. Firestore 규칙을 확인하세요.')
    } finally {
      setLoading(false)
    }
  }

  const joinRoom = async () => {
    const trimmedName = playerName.trim()
    if (!trimmedName || !roomId) return
    setLoading(true)
    setError('')
    try {
      const joinPlayerId = crypto.randomUUID()
      const roomRef = doc(db, 'rooms', roomId)

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef)
        if (!snap.exists()) {
          throw new Error('not-found')
        }
        const data = snap.data()
        const players = data.players || []
        if (players.some((player) => player.name === trimmedName)) {
          throw new Error('duplicate')
        }
        tx.update(roomRef, {
          players: [...players, { id: joinPlayerId, name: trimmedName }],
        })
      })

      setPlayerId(joinPlayerId)
      setIsHost(false)
    } catch (err) {
      if (err.message === 'duplicate') {
        setError('이미 사용 중인 이름입니다.')
      } else {
        setError('방에 입장할 수 없습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  const startGame = async () => {
    if (!roomData || playerCount < 3) return
    const roomRef = doc(db, 'rooms', roomId)

    let topic = ''
    let word = ''

    if (roomData.topicMode === 'random') {
      const pickedTopic = randomItem(TOPICS)
      topic = pickedTopic.label
      word = randomItem(pickedTopic.words)
    } else {
      const pickedTopic = TOPICS.find((item) => item.id === roomData.topicId)
      topic = pickedTopic?.label || '랜덤 주제'
      word = pickedTopic ? randomItem(pickedTopic.words) : '랜덤 제시어'
    }

    const shuffledPlayers = roomData.randomOrder ? shuffle(roomPlayers) : [...roomPlayers]
    const liarPick = randomItem(shuffledPlayers)

    await updateDoc(roomRef, {
      stage: STAGES.REVEAL,
      selectedTopic: topic,
      selectedWord: word,
      liarId: liarPick.id,
      turnOrder: shuffledPlayers.map((player) => player.id),
      turnIndex: 0,
      votes: {},
      liarGuess: '',
      guessResult: null,
    })
  }

  const updateRoomSettings = async (payload) => {
    if (!isHost || !roomId) return
    const roomRef = doc(db, 'rooms', roomId)
    await updateDoc(roomRef, payload)
  }

  const advanceTurn = async () => {
    if (!roomData || !isHost) return
    const roomRef = doc(db, 'rooms', roomId)
    if (turnIndex + 1 >= totalTurns) {
      await updateDoc(roomRef, { stage: STAGES.VOTING })
      return
    }
    await updateDoc(roomRef, { turnIndex: turnIndex + 1 })
  }

  const updateVote = async (suspectId) => {
    if (!roomId || !playerId) return
    const roomRef = doc(db, 'rooms', roomId)
    await updateDoc(roomRef, { [`votes.${playerId}`]: suspectId })
  }

  const submitGuess = async () => {
    if (!roomId || !isLiar) return
    const normalizedGuess = liarGuess.trim()
    if (!normalizedGuess) return
    const success = normalizedGuess === roomData.selectedWord
    const roomRef = doc(db, 'rooms', roomId)
    await updateDoc(roomRef, {
      liarGuess: normalizedGuess,
      guessResult: success,
    })
  }

  const resetGame = async () => {
    if (!roomId || !isHost) return
    const roomRef = doc(db, 'rooms', roomId)
    await updateDoc(roomRef, {
      stage: STAGES.LOBBY,
      selectedTopic: '',
      selectedWord: '',
      liarId: null,
      turnOrder: [],
      turnIndex: 0,
      votes: {},
      liarGuess: '',
      guessResult: null,
    })
    setRevealOpen(false)
    setLiarGuess('')
  }

  const copyLink = async () => {
    if (!shareLink) return
    await navigator.clipboard.writeText(shareLink)
  }

  const enterLobby = roomData && playerId

  return (
    <div className="app">
      <header className="home-actions">
        <a className="btn primary" href="#create">방 만들기</a>
        <a className="btn" href="#how-to-play">플레이 방법</a>
      </header>

      <section className="section" id="create">
        <h2>방 만들기</h2>
        <p className="muted">방을 만들고 링크를 공유해 팀원이 접속하세요.</p>

        <section className="panel">
          <div className="panel-header">
            <h3>{roomId ? '방 입장' : '방 만들기'}</h3>
            <p>{roomId ? '닉네임을 입력하고 입장하세요.' : '방 이름을 입력하고 링크를 공유하세요.'}</p>
          </div>
          <div className="grid">
            {!roomId && (
              <div className="card">
                <h3>방 만들기</h3>
                <div className="stack">
                  <input
                    type="text"
                    placeholder="방 이름"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="내 닉네임"
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                  />
                  <button className="btn primary" onClick={createRoom} disabled={loading}>
                    방 만들기
                  </button>
                </div>
              </div>
            )}

            {roomId && !playerId && (
              <div className="card">
                <h3>방 입장</h3>
                <div className="stack">
                  <input
                    type="text"
                    placeholder="내 닉네임"
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                  />
                  <button className="btn primary" onClick={joinRoom} disabled={loading}>
                    입장
                  </button>
                </div>
              </div>
            )}
          </div>
          {shareLink && (
            <div className="share-link">
              <p className="label">방 링크</p>
              <p>{shareLink}</p>
              <button className="ghost" onClick={copyLink}>링크 복사</button>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </section>

        {enterLobby && (
          <section className="panel">
            <div className="panel-header">
              <h3>대기실</h3>
              <p>모든 팀원이 입장하면 게임을 시작하세요.</p>
            </div>
            <div className="grid">
              <div className="card">
                <h3>참가자</h3>
                <div className="player-list">
                  {roomPlayers.map((player, index) => (
                    <div key={player.id} className="player-item">
                      <span>{index + 1}. {player.name}</span>
                      {roomData?.hostId === player.id && <span className="badge success">HOST</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <h3>제시어 설정</h3>
                <div className="radio-group">
                  <label className={roomData?.topicMode === 'random' ? 'radio active' : 'radio'}>
                    <input
                      type="radio"
                      name="topicMode"
                      value="random"
                      checked={roomData?.topicMode === 'random'}
                      onChange={() => updateRoomSettings({ topicMode: 'random' })}
                      disabled={!isHost}
                    />
                    랜덤 주제
                  </label>
                  <label className={roomData?.topicMode === 'select' ? 'radio active' : 'radio'}>
                    <input
                      type="radio"
                      name="topicMode"
                      value="select"
                      checked={roomData?.topicMode === 'select'}
                      onChange={() => updateRoomSettings({ topicMode: 'select' })}
                      disabled={!isHost}
                    />
                    주제 선택
                  </label>
                </div>

                {roomData?.topicMode === 'select' && (
                  <div className="select-row">
                    <select
                      value={roomData?.topicId || TOPICS[0].id}
                      onChange={(event) => updateRoomSettings({ topicId: event.target.value })}
                      disabled={!isHost}
                    >
                      {TOPICS.map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topic.label}
                        </option>
                      ))}
                    </select>
                    <p className="hint">선택한 주제 내에서 제시어가 랜덤으로 지정됩니다.</p>
                  </div>
                )}

                <div className="stack">
                  <label className="inline">
                    설명 라운드 수
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={roomData?.rounds || 1}
                      onChange={(event) => updateRoomSettings({ rounds: Number(event.target.value) })}
                      disabled={!isHost}
                    />
                  </label>
                  <label className="inline">
                    <input
                      type="checkbox"
                      checked={roomData?.randomOrder ?? true}
                      onChange={(event) => updateRoomSettings({ randomOrder: event.target.checked })}
                      disabled={!isHost}
                    />
                    순서 랜덤
                  </label>
                </div>
              </div>
            </div>

            <div className="panel-footer">
              <div>
                <p className="muted">최소 3명 이상 필요</p>
                <p className="count">현재 {playerCount}명</p>
              </div>
              <button className="btn primary" onClick={startGame} disabled={!isHost || playerCount < 3}>
                게임 시작
              </button>
            </div>
          </section>
        )}

        {roomStage === STAGES.REVEAL && enterLobby && (
          <section className="panel">
            <div className="panel-header">
              <h3>정체 공개</h3>
              <p>각자 자신의 화면에서만 확인하세요.</p>
            </div>

            <div className="reveal">
              <div>
                <p className="label">플레이어</p>
                <h3>{currentPlayer?.name}</h3>
                <p className="hint">주제: {roomData?.selectedTopic}</p>
              </div>

              {!revealOpen ? (
                <button className="btn primary" onClick={() => setRevealOpen(true)}>
                  정체 보기
                </button>
              ) : (
                <div className="reveal-card">
                  {isLiar ? (
                    <>
                      <p className="badge danger">당신은 라이어</p>
                      <p className="emphasis">주제만 알고 제시어는 모릅니다.</p>
                    </>
                  ) : (
                    <>
                      <p className="badge success">당신은 시민</p>
                      <p className="emphasis">제시어: {roomData?.selectedWord}</p>
                    </>
                  )}
                  <button className="ghost" onClick={() => setRevealOpen(false)}>다시 가리기</button>
                </div>
              )}
            </div>

            <div className="panel-footer">
              <button
                className="btn primary"
                onClick={() => updateRoomSettings({ stage: STAGES.DISCUSSION })}
                disabled={!isHost}
              >
                토론 시작
              </button>
            </div>
          </section>
        )}

        {roomStage === STAGES.DISCUSSION && enterLobby && (
          <section className="panel">
            <div className="panel-header">
              <h3>설명 라운드</h3>
              <p>주제: {roomData?.selectedTopic} · 라운드 {currentRound}/{roomData?.rounds}</p>
            </div>

            <div className="discussion">
              <div className="turn-card">
                <p className="label">현재 차례</p>
                <h3>{currentSpeaker?.name}</h3>
                <p className="hint">차례가 끝나면 다음 버튼을 눌러주세요.</p>
                <button className="btn primary" onClick={advanceTurn} disabled={!isHost}>
                  다음 사람
                </button>
              </div>

              <div className="order">
                <p className="label">진행 순서</p>
                <ul>
                  {roomData?.turnOrder?.map((id, index) => {
                    const player = roomPlayers.find((item) => item.id === id)
                    return (
                      <li key={id} className={index === turnIndex % playerCount ? 'active' : ''}>
                        <span>{index + 1}</span>
                        {player?.name}
                      </li>
                    )
                  })}
                </ul>
                <button
                  className="ghost"
                  onClick={() => updateRoomSettings({ stage: STAGES.VOTING })}
                  disabled={!isHost}
                >
                  투표 시작
                </button>
              </div>
            </div>
          </section>
        )}

        {roomStage === STAGES.VOTING && enterLobby && (
          <section className="panel">
            <div className="panel-header">
              <h3>라이어 투표</h3>
              <p>모든 플레이어가 의심되는 사람을 선택합니다.</p>
            </div>

            <div className="vote-grid">
              {roomPlayers.map((player) => (
                <div key={player.id} className="vote-card">
                  <p className="label">{player.name}의 선택</p>
                  <select
                    value={votes[player.id] || ''}
                    onChange={(event) => updateVote(event.target.value)}
                    disabled={player.id !== playerId}
                  >
                    <option value="" disabled>선택하기</option>
                    {roomPlayers.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="panel-footer">
              <button
                className="btn"
                onClick={() => updateRoomSettings({ stage: STAGES.DISCUSSION })}
                disabled={!isHost}
              >
                토론으로 돌아가기
              </button>
              <button
                className="btn primary"
                onClick={() => updateRoomSettings({ stage: STAGES.RESULT })}
                disabled={!isHost || !votesComplete}
              >
                결과 보기
              </button>
            </div>
          </section>
        )}

        {roomStage === STAGES.RESULT && enterLobby && (
          <section className="panel">
            <div className="panel-header">
              <h3>결과</h3>
              <p>투표 결과와 라이어의 변론을 확인하세요.</p>
            </div>

            <div className="result">
              <div className="result-card">
                <p className="label">투표 결과</p>
                {voteTie && (
                  <p className="emphasis">동률입니다. 재투표를 진행하세요.</p>
                )}
                {!voteTie && liarWinsByVote && (
                  <p className="emphasis">라이어가 들키지 않았습니다. 라이어 승리!</p>
                )}
                {liarCaught && (
                  <p className="emphasis">라이어가 지목되었습니다. 변론 단계로 이동합니다.</p>
                )}

                <div className="tally">
                  {roomPlayers.map((player) => (
                    <div key={player.id}>
                      <span>{player.name}</span>
                      <span>{tally[player.id] || 0}표</span>
                    </div>
                  ))}
                </div>

                {voteTie && (
                  <button
                    className="btn"
                    onClick={() => updateRoomSettings({ stage: STAGES.VOTING, votes: {} })}
                    disabled={!isHost}
                  >
                    재투표
                  </button>
                )}
              </div>

              <div className="result-card">
                <p className="label">라이어 변론</p>
                {liarCaught ? (
                  <>
                    <p className="hint">라이어는 제시어를 맞히면 승리합니다.</p>
                    <input
                      type="text"
                      placeholder="제시어 입력"
                      value={liarGuess}
                      onChange={(event) => setLiarGuess(event.target.value)}
                      disabled={!isLiar}
                    />
                    <button className="btn primary" onClick={submitGuess} disabled={!isLiar}>
                      정답 제출
                    </button>
                    {roomData?.guessResult !== null && (
                      <p className={roomData?.guessResult ? 'badge success' : 'badge danger'}>
                        {roomData?.guessResult ? '정답입니다. 라이어 승리!' : '틀렸습니다. 시민 승리!'}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="hint">라이어가 지목되지 않아 변론 단계가 없습니다.</p>
                )}
                <div className="answer">
                  <p className="label">제시어</p>
                  <p>{roomData?.selectedWord}</p>
                  <p className="hint">주제: {roomData?.selectedTopic}</p>
                </div>
              </div>
            </div>

            <div className="panel-footer">
              <button className="btn" onClick={resetGame} disabled={!isHost}>새 게임</button>
            </div>
          </section>
        )}
      </section>

      <section className="section" id="how-to-play">
        <h2>플레이 방법</h2>
        <div className="panel">
          <p>방을 만들고 모든 플레이어가 참가하면 게임을 시작합니다.</p>
          <p>랜덤으로 한 사람이 라이어로 선택됩니다. (자신의 화면에 표시됩니다.)</p>
          <p>모든 플레이어에게 제시어의 주제가 공개됩니다. 단, 라이어는 제시어를 알 수 없습니다.</p>
          <p>차례대로 돌아가며 제시어를 설명합니다. 너무 구체적이면 라이어가 알아챌 수 있고, 너무 두루뭉술하면 라이어로 의심받을 수 있습니다.</p>
          <p>충분히 정보가 모이면 전원 동의하에 라이어를 투표할 수 있습니다.</p>
          <p>가장 많은 표를 받은 플레이어가 라이어가 아니라면 라이어의 승리입니다. 라이어가 지목되면 변론 기회가 있으며, 제시어를 맞히면 라이어 승리, 틀리면 라이어 패배입니다.</p>
        </div>
      </section>
    </div>
  )
}

export default App
