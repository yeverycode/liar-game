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
import Header from './components/Header'
import Footer from './components/Footer'
import TeamCards from './components/TeamCards'
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
  const [view, setView] = useState('home')
  const [playerId, setPlayerId] = useState('')
  const [isHost, setIsHost] = useState(false)
  const [roomData, setRoomData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hostTab, setHostTab] = useState('stage')
  const [localVote, setLocalVote] = useState('')

  const [revealOpen, setRevealOpen] = useState(false)

  const shareLink = roomId
    ? `${window.location.origin}${window.location.pathname}?room=${roomId}`
    : ''

  useEffect(() => {
    if (!roomId) return
    setView('create')
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


  const votes = roomData?.votes || {}
  const votesComplete = playerCount > 0 && Object.keys(votes).length === playerCount
  const revealedCount = roomData?.revealed ? Object.keys(roomData.revealed).length : 0

  useEffect(() => {
    if (roomStage !== STAGES.VOTING) return
    if (!votesComplete) return
    setStage(STAGES.RESULT)
  }, [roomStage, votesComplete, roomId])

  useEffect(() => {
    if (!playerId) return
    setLocalVote(votes[playerId] || '')
  }, [playerId, votes])

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
        liarHistory: [],
        turnOrder: [],
        turnIndex: 0,
        votes: {},
        revealed: {},
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
      let existingId = ''
      let hostId = ''

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef)
        if (!snap.exists()) {
          throw new Error('not-found')
        }
        const data = snap.data()
        hostId = data.hostId
        const players = data.players || []
        const found = players.find((player) => player.name === trimmedName)
        if (found) {
          existingId = found.id
          return
        }
        tx.update(roomRef, {
          players: [...players, { id: joinPlayerId, name: trimmedName }],
        })
      })

      if (existingId) {
        setPlayerId(existingId)
        setIsHost(existingId === hostId)
      } else {
        setPlayerId(joinPlayerId)
        setIsHost(false)
      }
    } catch (err) {
      if (err.message === 'not-found') {
        setError('방에 입장할 수 없습니다.')
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

    const shuffledPlayers = shuffle(roomPlayers)
    const activePlayerIds = shuffledPlayers.map((player) => player.id)
    const existingHistory = Array.isArray(roomData.liarHistory) ? roomData.liarHistory : []
    const filteredHistory = existingHistory.filter((id) => activePlayerIds.includes(id))
    const remaining = activePlayerIds.filter((id) => !filteredHistory.includes(id))
    const liarPool = remaining.length > 0 ? remaining : activePlayerIds
    const liarId = randomItem(liarPool)
    const nextHistory = remaining.length > 0 ? [...filteredHistory, liarId] : [liarId]

    await updateDoc(roomRef, {
      stage: STAGES.REVEAL,
      selectedTopic: topic,
      selectedWord: word,
      liarId,
      liarHistory: nextHistory,
      turnOrder: shuffledPlayers.map((player) => player.id),
      turnIndex: 0,
      votes: {},
      revealed: {},
      liarGuess: '',
      guessResult: null,
    })
  }

  const updateRoomSettings = async (payload) => {
    if (!isHost || !roomId) return
    const roomRef = doc(db, 'rooms', roomId)
    await updateDoc(roomRef, payload)
  }

  const setStage = async (nextStage) => {
    if (!roomId) return
    const roomRef = doc(db, 'rooms', roomId)
    await updateDoc(roomRef, { stage: nextStage })
  }


  const updateVote = async (suspectId) => {
    if (!roomId || !playerId) return
    const roomRef = doc(db, 'rooms', roomId)
    await updateDoc(roomRef, { [`votes.${playerId}`]: suspectId })
  }

  const resetGame = async () => {
    if (!roomId) return
    const roomRef = doc(db, 'rooms', roomId)
    await updateDoc(roomRef, {
      stage: STAGES.LOBBY,
      selectedTopic: '',
      selectedWord: '',
      liarId: null,
      turnOrder: [],
      turnIndex: 0,
      votes: {},
      revealed: {},
      liarGuess: '',
      guessResult: null,
    })
    setRevealOpen(false)
  }

  const removePlayer = async (removeId) => {
    if (!roomId || !isHost || !roomData) return
    if (removeId === roomData.hostId) return
    const roomRef = doc(db, 'rooms', roomId)
    const nextPlayers = roomPlayers.filter((player) => player.id !== removeId)
    await updateDoc(roomRef, { players: nextPlayers })
  }

  const copyLink = async () => {
    if (!shareLink) return
    await navigator.clipboard.writeText(shareLink)
  }

  const enterLobby = roomData && playerId

  return (
    <div className="app">
      <Header view={view} onNavigate={setView} />
      {view === 'home' && (
        <section className="section">
          <TeamCards />
          <div className="home-cta">
            <button className="btn primary" type="button" onClick={() => setView('create')}>
              시작하기
            </button>
          </div>
        </section>
      )}

      {view === 'create' && (
        <section className="section" id="create">
          {enterLobby ? (
            <p className="muted">
              {roomData?.hostId === playerId ? `${currentPlayer?.name}님이 만든 ${roomData?.name}방입니다.` : `${roomData?.name}방입니다.`}
              <br />
              링크를 공유해 팀원을 추가해보세요.
            </p>
          ) : (
            <p className="muted">방을 만들고 링크를 공유해 팀원이 접속하세요.</p>
          )}

          <section className="panel">
            <div className="panel-header">
              <h3>{roomId ? '방 입장' : '방 만들기'}</h3>
              {!enterLobby && (
                <p>{roomId ? '닉네임을 입력하고 입장하세요.' : '방 이름을 입력하고 링크를 공유하세요.'}</p>
              )}
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
                <div className="share-row">
                  <input type="text" value={shareLink} readOnly />
                  <button className="btn primary" type="button" onClick={copyLink}>링크 복사</button>
                </div>
                <p className="hint">이 링크를 공유하면 바로 같은 방으로 입장합니다.</p>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </section>

          {enterLobby && isHost && (
            <div className="host-tabs">
              <button
                className={hostTab === 'lobby' ? 'tab active' : 'tab'}
                type="button"
                onClick={() => setHostTab('lobby')}
              >
                대기실
              </button>
              <button
                className={hostTab === 'stage' ? 'tab active' : 'tab'}
                type="button"
                onClick={() => setHostTab('stage')}
              >
                게임 진행
              </button>
            </div>
          )}

          {enterLobby && (roomStage === STAGES.LOBBY || (isHost && hostTab === 'lobby')) && (
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
                        <div className="player-actions">
                          {roomData?.hostId === player.id && <span className="badge success">HOST</span>}
                          {isHost && player.id !== roomData?.hostId && (
                            <button className="ghost danger" onClick={() => removePlayer(player.id)}>
                              삭제
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <h3>제시어 설정</h3>
                  <p className="muted">주제 선택과 게임 시작은 방장만 가능합니다.</p>
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
                    <p className="muted">게임은 기본 1라운드, 랜덤 순서로 진행됩니다.</p>
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
        {roomStage === STAGES.REVEAL && enterLobby && (!isHost || hostTab === 'stage') && (
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
                <button
                  className="btn primary"
                  onClick={async () => {
                    setRevealOpen(true)
                    if (roomId && playerId) {
                      const roomRef = doc(db, 'rooms', roomId)
                      await updateDoc(roomRef, { [`revealed.${playerId}`]: true })
                    }
                  }}
                >
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
              <p className="muted">투표 시작 버튼은 방장만 누를 수 있습니다.</p>
              <button
                className="btn primary"
                onClick={() => setStage(STAGES.VOTING)}
                disabled={!isHost}
              >
                투표 시작
              </button>
            </div>
          </section>
        )}

        {roomStage === STAGES.VOTING && enterLobby && (!isHost || hostTab === 'stage') && (
          <section className="panel">
            <div className="panel-header">
              <h3>라이어 투표</h3>
              <p>모든 플레이어가 의심되는 사람을 선택합니다.</p>
            </div>

            <div className="vote-grid">
              {currentPlayer && (
                <div className="vote-card">
                  <p className="label">{currentPlayer.name}의 선택</p>
                  <select
                    value={localVote}
                    onChange={(event) => setLocalVote(event.target.value)}
                  >
                    <option value="" disabled>선택하기</option>
                    {roomPlayers.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="panel-footer">
              <button
                className="btn primary"
                onClick={() => updateVote(localVote)}
                disabled={!localVote}
              >
                투표하기
              </button>
            </div>
          </section>
        )}

        {roomStage === STAGES.RESULT && enterLobby && (!isHost || hostTab === 'stage') && (
          <section className="panel">
            <div className="panel-header">
              <h3>결과</h3>
              <p>투표 결과와 라이어의 변론을 확인하세요.</p>
            </div>

            <div className="result">
              <div className="result-card">
                <p className="label">가장 많이 받은 사람</p>
                <p className="emphasis">
                  {topSuspects.length === 0
                    ? '투표 없음'
                    : topSuspects
                        .map((id) => roomPlayers.find((player) => player.id === id)?.name || '알 수 없음')
                        .join(', ')}
                </p>
                <p className="label" style={{ marginTop: 12 }}>진짜 라이어</p>
                <p className="emphasis">
                  {roomPlayers.find((player) => player.id === liarId)?.name || '알 수 없음'}
                </p>
              </div>

              <div className="result-card">
                <p className="label">전체 투표 결과</p>
                <div className="tally">
                  {roomPlayers.map((player) => (
                    <div key={player.id}>
                      <span>{player.name}</span>
                      <span>{tally[player.id] || 0}표</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel-footer">
              <button className="btn" onClick={resetGame}>게임 다시하기</button>
            </div>
          </section>
        )}
      </section>
      )}

      {view === 'how' && (
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
      )}
      <Footer />
    </div>
  )
}

export default App
