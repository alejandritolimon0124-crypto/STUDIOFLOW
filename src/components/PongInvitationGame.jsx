import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Gift, Play, Volume2, VolumeX } from 'lucide-react'
import { requireSupabase } from '../lib/supabaseClient'
import './pong-invitation.css'

const durationForMisses = (misses) => [1600, 1250, 980][Math.min(misses, 2)]
const nextTarget = (seed) => {
  const nextSeed = (seed * 48271) % 2147483647
  return { seed: nextSeed, x: 0.08 + (nextSeed % 840) / 1000 }
}
const clamp = (value) => Math.max(0.12, Math.min(0.88, value))

export default function PongInvitationGame({ code, offer, serviceName, isGuest = false, isDemo = false, previewWon = false, onComplete }) {
  const [phase, setPhase] = useState('ready')
  const [score, setScore] = useState(0)
  const [misses, setMisses] = useState(0)
  const [ball, setBall] = useState({ x: 0.5, y: 0.1, visible: true })
  const [paddle, setPaddle] = useState(0.5)
  const [message, setMessage] = useState('')
  const [soundOn, setSoundOn] = useState(true)
  const boardRef = useRef(null)
  const paddleRef = useRef(0.5)
  const runRef = useRef(null)
  const audioRef = useRef(null)

  useEffect(() => () => { audioRef.current?.close().catch(() => {}) }, [])

  const enableAudio = async () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    if (!audioRef.current || audioRef.current.state === 'closed') audioRef.current = new AudioContext()
    if (audioRef.current.state === 'suspended') await audioRef.current.resume()
  }

  const toggleSound = async () => {
    if (!soundOn) {
      try { await enableAudio() } catch { /* The game remains playable if audio is unavailable. */ }
    }
    setSoundOn((value) => !value)
  }

  const beep = useCallback((frequency) => {
    if (!soundOn || !audioRef.current || audioRef.current.state !== 'running') return
    const audio = audioRef.current
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    const now = audio.currentTime
    oscillator.type = 'square'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.11, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.09)
  }, [soundOn])

  const setPaddlePosition = (value) => {
    paddleRef.current = clamp(value)
    setPaddle(paddleRef.current)
  }

  const finish = useCallback(async (run) => {
    try {
      if (isDemo) {
        setPhase(run.score >= 10 ? 'won' : 'lost')
        return
      }
      const { data, error } = await requireSupabase().rpc(isGuest ? 'studio_flow_finish_guest_pong' : 'studio_flow_finish_pong', {
        p_run_id: run.id,
        p_moves: run.moves,
        ...(isGuest ? { p_guest_token: run.token } : {}),
      })
      if (error) throw error
      setScore(data.score)
      setMisses(data.misses)
      setPhase(data.won ? 'won' : 'lost')
      onComplete?.(data.won)
    } catch (error) {
      setPhase('error')
      setMessage(error.message || 'No pudimos validar esta partida.')
    }
  }, [isDemo, isGuest, onComplete])

  useEffect(() => {
    if (phase !== 'playing') return undefined
    let frame
    const tick = (now) => {
      const run = runRef.current
      if (!run || run.finished) return
      const progress = Math.min((now - run.segmentStart) / run.duration, 1)
      if (progress >= 0.75 && !run.collided) {
        run.collided = true
        const hit = Math.abs(paddleRef.current - run.target) <= 0.12
        run.moves.push({ x: Number(paddleRef.current.toFixed(4)), t: run.elapsed + Math.round(run.duration * 0.75) })
        if (hit) { run.score += 1; beep(460) }
        else run.misses += 1
        setScore(run.score)
        setMisses(run.misses)
        if (run.score >= 10 || run.misses >= 3) {
          run.finished = true
          setPhase('verifying')
          finish(run)
          return
        }
      }
      const descent = Math.min(progress / 0.75, 1)
      setBall({
        x: run.from + (run.target - run.from) * descent,
        y: progress < 0.75 ? 0.1 + 0.78 * descent : 0.88 - 0.78 * ((progress - 0.75) / 0.25),
        visible: !run.collided || Math.abs(paddleRef.current - run.target) <= 0.12,
      })
      if (progress >= 1) {
        beep(620)
        run.elapsed += run.duration
        run.segmentStart += run.duration
        run.duration = durationForMisses(run.misses)
        run.from = run.target
        const next = nextTarget(run.seed)
        run.seed = next.seed
        run.target = next.x
        run.collided = false
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, finish, beep])

  const start = async () => {
    setMessage('')
    setPhase('starting')
    try {
      if (soundOn) await enableAudio()
      let token = null
      let data
      if (isDemo) data = { runId: 'preview', seed: crypto.getRandomValues(new Uint32Array(1))[0] % 2000000000 + 1 }
      else {
        const key = `studio-flow-pong-${code}`
        token = isGuest ? localStorage.getItem(key) : null
        if (isGuest && !token) {
          token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
          localStorage.setItem(key, token)
        }
        const response = await requireSupabase().rpc(isGuest ? 'studio_flow_start_guest_pong' : 'studio_flow_start_pong', {
          p_code: code,
          ...(isGuest ? { p_guest_token: token } : {}),
        })
        if (response.error) throw response.error
        data = response.data
      }
      const first = nextTarget(Number(data.seed))
      runRef.current = {
        id: data.runId, token, seed: first.seed, from: 0.5, target: first.x,
        segmentStart: performance.now(), elapsed: 0, duration: durationForMisses(0),
        moves: [], score: 0, misses: 0, collided: false, finished: false,
      }
      setScore(0)
      setMisses(0)
      setBall({ x: 0.5, y: 0.1, visible: true })
      setPhase('playing')
    } catch (error) {
      setPhase('ready')
      setMessage(error.message || 'No pudimos comenzar la partida.')
    }
  }

  const movePointer = (event) => {
    if (phase !== 'playing' || !boardRef.current) return
    const bounds = boardRef.current.getBoundingClientRect()
    setPaddlePosition((event.clientX - bounds.left) / bounds.width)
  }

  const moveKeyboard = (event) => {
    if (phase !== 'playing') return
    if (event.key === 'ArrowLeft') { event.preventDefault(); setPaddlePosition(paddleRef.current - 0.07) }
    if (event.key === 'ArrowRight') { event.preventDefault(); setPaddlePosition(paddleRef.current + 0.07) }
  }

  const displayPhase = (isDemo && previewWon) || (!isDemo && offer.won) ? 'won' : phase

  return <section className="invitation-pong" aria-label="Juego de Pong por un descuento">
    <div className="invitation-pong-heading"><span>RETO STUDIO FLOW{isDemo ? ' · VISTA PREVIA' : ''}</span><h2>Juega por tu {offer.discountPercent}%</h2><p>En {serviceName}. Diez rebotes, tres pelotas. Cada pelota perdida aumenta la velocidad.</p><button type="button" className="invitation-pong-sound" onClick={toggleSound} aria-label={soundOn ? 'Silenciar juego' : 'Activar sonido'} title={soundOn ? 'Silenciar juego' : 'Activar sonido'}>{soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button></div>
    {displayPhase !== 'won' && <p className="invitation-pong-instruction">¡Puedes ganar {offer.discountPercent}% de descuento! Juega esta partida. Si ganas, crea tu perfil o inicia sesión y reserva desde esta tarjeta antes de que venza tu premio.</p>}
    <div className="invitation-pong-status"><strong>{score} / 10 rebotes</strong><span aria-label={`${3 - misses} pelotas restantes`}>{[0, 1, 2].map((index) => <i key={index} className={index < 3 - misses ? 'live' : ''} />)}</span></div>
    <div className={`invitation-pong-board${displayPhase === 'won' ? ' is-won' : ''}`} ref={boardRef} tabIndex={0} role="application" aria-label="Mueve la barra con el dedo, ratón o flechas" onPointerDown={movePointer} onPointerMove={movePointer} onKeyDown={moveKeyboard}>
      <div className="invitation-pong-ceiling" />
      {ball.visible && <div className="invitation-pong-ball" style={{ left: `${ball.x * 100}%`, top: `${ball.y * 100}%` }} />}
      <div className="invitation-pong-paddle" style={{ left: `${paddle * 100}%` }} />
      {displayPhase !== 'playing' && <div className="invitation-pong-overlay">{displayPhase === 'won' ? <div className="invitation-pong-prize"><Gift size={29} /><small>{isDemo ? 'ASÍ SE VERÁ EL PREMIO' : 'PREMIO DESBLOQUEADO'}</small><strong>{offer.discountPercent}%</strong><span>de descuento en {serviceName}</span><p>{isDemo ? 'Vista previa: no genera un beneficio real.' : isGuest ? `Crea tu perfil y reserva dentro de ${offer.rewardValidDays || 7} días.` : `Reserva desde esta tarjeta dentro de ${offer.rewardValidDays || 7} días.`}</p>{isDemo && !previewWon && <button type="button" onClick={start}><Play size={17} /> Repetir</button>}</div> : displayPhase === 'lost' ? <><strong>Terminó tu partida</strong><span>{isDemo ? 'La demostración no afecta premios reales.' : 'Puedes seguir conociendo sus servicios.'}</span>{isDemo && <button type="button" onClick={start}><Play size={17} /> Repetir</button>}</> : displayPhase === 'verifying' ? <span>Validando tus rebotes...</span> : <><strong>¿Lista para jugar?</strong><span>Mueve la barra para devolver la pelota.</span>{isDemo || offer.canPlay || offer.playing ? <button type="button" onClick={start} disabled={phase === 'starting'}><Play size={17} /> {phase === 'starting' ? 'Preparando...' : 'Comenzar'}</button> : <span>{offer.played ? 'Esta tarjeta ya tuvo su partida.' : 'Los premios ya no están disponibles.'}</span>}</>}</div>}
    </div>
    <div className="invitation-pong-controls"><button type="button" onClick={() => setPaddlePosition(paddleRef.current - 0.08)} disabled={phase !== 'playing'} aria-label="Mover izquierda"><ArrowLeft size={21} /></button><button type="button" onClick={() => setPaddlePosition(paddleRef.current + 0.08)} disabled={phase !== 'playing'} aria-label="Mover derecha"><ArrowRight size={21} /></button></div>
    {message && <p role="alert" className="invitation-pong-error">{message}</p>}
  </section>
}
