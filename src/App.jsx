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
    id: 'food',
    label: '음식',
    en: 'Food',
    words: ['떡볶이', '김치찌개', '비빔밥', '냉면', '삼겹살', '치킨', '초밥', '라멘'],
  },
  {
    id: 'animal',
    label: '동물',
    en: 'Animal',
    words: ['강아지', '고양이', '토끼', '사자', '코끼리', '호랑이', '판다', '여우'],
  },
  {
    id: 'place',
    label: '장소',
    en: 'Place',
    words: ['도서관', '놀이공원', '해변', '지하철', '카페', '공항', '박물관', '학교'],
  },
  {
    id: 'job',
    label: '직업',
    en: 'Job',
    words: ['의사', '소방관', '교사', '셰프', '개발자', '기자', '디자이너', '파일럿'],
  },
  {
    id: 'movie',
    label: '영화/드라마',
    en: 'Movie/Drama',
    words: ['어벤져스', '기생충', '이터널 선샤인', '스폰지밥', '오징어 게임', '미스터 선샤인'],
  },
  {
    id: 'sports',
    label: '스포츠',
    en: 'Sports',
    words: ['축구', '농구', '야구', '배구', '테니스', '수영', '배드민턴', '탁구'],
  },
  {
    id: 'fruit',
    label: '과일',
    en: 'Fruit',
    words: ['사과', '바나나', '딸기', '포도', '복숭아', '오렌지', '체리', '수박'],
  },
  {
    id: 'drink',
    label: '음료',
    en: 'Drink',
    words: ['아메리카노', '라떼', '레몬에이드', '콜라', '사이다', '녹차', '우유', '주스'],
  },
  {
    id: 'country',
    label: '국가',
    en: 'Country',
    words: ['한국', '미국', '일본', '프랑스', '영국', '캐나다', '호주', '이탈리아'],
  },
  {
    id: 'brand',
    label: '브랜드',
    en: 'Brand',
    words: ['나이키', '애플', '삼성', '구글', '스타벅스', '코카콜라', '아디다스'],
  },
  {
    id: 'character',
    label: '캐릭터',
    en: 'Character',
    words: ['피카츄', '미키마우스', '둘리', '스폰지밥', '짱구', '헬로키티'],
  },
  {
    id: 'instrument',
    label: '악기',
    en: 'Instrument',
    words: ['피아노', '기타', '바이올린', '드럼', '플루트', '색소폰'],
  },
  {
    id: 'kpop',
    label: 'K-POP',
    en: 'K-POP',
    words: ['BTS', '블랙핑크', '아이유', '세븐틴', '뉴진스', '아이브'],
  },
  {
    id: 'game',
    label: '게임',
    en: 'Game',
    words: ['마리오', '리그오브레전드', '메이플스토리', '오버워치', '발로란트', '마인크래프트'],
  },
  {
    id: 'celebrity',
    label: '연예인',
    en: 'Celebrity',
    words: ['유재석', '손흥민', '아이유', '봉준호', '톰 크루즈', '테일러 스위프트'],
  },
  {
    id: 'fashion',
    label: '패션',
    en: 'Fashion',
    words: ['청바지', '후드티', '스니커즈', '선글라스', '가죽자켓', '원피스'],
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
    if (!trimmedName) return
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
      setError('방 생성에 실패했습니다.')
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

    if (roomData.topicMode === 'custom') {
      topic = roomData.customTopic.trim() || '커스텀 주제'
      word = roomData.customWord.trim() || '커스텀 제시어'
    } else if (roomData.topicMode === 'random') {
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
      <header className="hero">
        <div>
          <p className="eyebrow">Liar Game</p>
          <h1>라이어게임</h1>
          <p className="subhead">
            링크로 방을 공유하고 각자 역할을 확인하세요. 바보 모드로만 진행됩니다.
          </p>
          <div className="cta-row">
            <a className="btn primary" href="#game">게임 시작하기</a>
            <button className="btn" onClick={copyLink} disabled={!shareLink}>친구 초대하기</button>
          </div>
        </div>
        <div className="hero-card">
          <div>
            <p className="label">방 코드</p>
            <p className="room">{roomData?.name ? roomData.name : generateRoomCode()}</p>
          </div>
          <div className="pill">바보 모드</div>
          <p className="helper">라이어는 단어를 전혀 모릅니다.</p>
        </div>
      </header>

      <section className="section" id="game">
        <h2>게임 시작하기</h2>
        <p className="muted">방을 만들고 링크를 공유해 팀원이 접속하세요.</p>

        <section className="panel">
          <div className="panel-header">
            <h3>방 만들기 / 입장</h3>
            <p>방 이름을 입력하고 링크를 공유하세요.</p>
          </div>
          <div className="grid">
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
                <button className="btn primary" onClick={createRoom} disabled={loading}>방 만들기</button>
              </div>
            </div>
            <div className="card">
              <h3>방 입장</h3>
              <div className="stack">
                <input
                  type="text"
                  placeholder="현재 링크에 자동 입력"
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value.trim())}
                />
                <input
                  type="text"
                  placeholder="내 닉네임"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                />
                <button className="btn" onClick={joinRoom} disabled={loading || !roomId}>입장</button>
              </div>
              {shareLink && (
                <div className="share-link">
                  <p className="label">방 링크</p>
                  <p>{shareLink}</p>
                  <button className="ghost" onClick={copyLink}>링크 복사</button>
                </div>
              )}
            </div>
          </div>
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
                  <label className={roomData?.topicMode === 'custom' ? 'radio active' : 'radio'}>
                    <input
                      type="radio"
                      name="topicMode"
                      value="custom"
                      checked={roomData?.topicMode === 'custom'}
                      onChange={() => updateRoomSettings({ topicMode: 'custom' })}
                      disabled={!isHost}
                    />
                    커스텀 입력
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

                {roomData?.topicMode === 'custom' && (
                  <div className="stack">
                    <input
                      type="text"
                      placeholder="주제"
                      value={roomData?.customTopic || ''}
                      onChange={(event) => updateRoomSettings({ customTopic: event.target.value })}
                      disabled={!isHost}
                    />
                    <input
                      type="text"
                      placeholder="제시어"
                      value={roomData?.customWord || ''}
                      onChange={(event) => updateRoomSettings({ customWord: event.target.value })}
                      disabled={!isHost}
                    />
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
    </div>
  )
}

export default App
