import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Check, Gift, RefreshCw, Share2, Sparkles, Ticket } from 'lucide-react'
import { requireSupabase } from '../../lib/supabaseClient'
import { paths } from '../../routes/paths'
import './client-rewards.css'

const formatDate = (value) => value ? new Intl.DateTimeFormat('es-MX', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City',
}).format(new Date(value)) : ''

async function claimLocalPongPrizes() {
  let keys
  try { keys = Object.keys(localStorage).filter((key) => /^studio-flow-pong-[a-f0-9]{24}$/.test(key)).slice(0, 20) } catch { return }
  for (const key of keys) {
    const token = localStorage.getItem(key)
    if (!token) continue
    const { error } = await requireSupabase().rpc('studio_flow_claim_guest_pong', {
      p_code: key.slice('studio-flow-pong-'.length), p_guest_token: token,
    })
    if (!error) localStorage.removeItem(key)
  }
}

export default function ClientRewards() {
  const [rewards, setRewards] = useState({ cards: [], campaigns: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [shareStates, setShareStates] = useState({})
  const [pendingShareLinks, setPendingShareLinks] = useState({})
  const [sharingCode, setSharingCode] = useState('')
  const [receivedCards, setReceivedCards] = useState([])

  const refresh = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      await claimLocalPongPrizes()
      const { data, error: failure } = await requireSupabase().rpc('studio_flow_client_reward_center')
      if (failure) throw failure
      setRewards({ cards: data?.cards || [], campaigns: data?.campaigns || [] })
      const { data: notices } = await requireSupabase().rpc('studio_flow_client_get_notifications')
      setReceivedCards((notices?.notifications || []).filter((notice) =>
        notice.target_url?.startsWith('/invitacion/') || notice.target_url?.startsWith('/felicitacion/')).slice(0, 12))
      const pongCards = (data?.cards || []).filter((reward) => reward.kind === 'pong')
      const states = await Promise.all(pongCards.map(async (reward) => {
        const { data: state } = await requireSupabase().rpc('studio_flow_pong_share_state', { p_code: reward.code })
        return [reward.code, state]
      }))
      setShareStates(Object.fromEntries(states))
    } catch (failure) {
      setError(failure.message || 'No pudimos cargar tus premios.')
    } finally {
      setBusy(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => { Promise.resolve().then(refresh) }, [refresh])

  const shareCard = async (reward) => {
    setSharingCode(reward.code)
    try {
      let url = `${window.location.origin}/invitacion/${reward.code}`
      let text = `Te comparto la tarjeta de ${reward.businessName} en Studio Flow. Conoce sus servicios y reserva desde aquí.`
      if (reward.kind === 'pong') {
        if (pendingShareLinks[reward.code]) url = pendingShareLinks[reward.code]
        else {
          if (!shareStates[reward.code]?.canShare) throw new Error('Esta tarjeta ya compartió sus tres oportunidades.')
          const { data, error: failure } = await requireSupabase().rpc('studio_flow_share_pong_card', { p_code: reward.code })
          if (failure) throw failure
          url = `${window.location.origin}/invitacion/${data.code}`
          setPendingShareLinks((current) => ({ ...current, [reward.code]: url }))
          setShareStates((current) => ({ ...current, [reward.code]: { ...current[reward.code], remaining: data.remaining, canShare: data.remaining > 0 } }))
        }
        text = `Te comparto un nuevo reto de ${reward.businessName}. Juega Pong para intentar ganar un descuento. Esta liga tiene una sola ganadora.`
      }
      if (navigator.share) await navigator.share({ title: `Tarjeta de ${reward.businessName}`, text, url })
      else { await navigator.clipboard.writeText(`${text}\n${url}`); setNotice('Tarjeta copiada para compartir.') }
      setPendingShareLinks((current) => ({ ...current, [reward.code]: '' }))
    } catch (failure) {
      if (failure?.name !== 'AbortError') setNotice(failure.message || 'No pudimos compartir la tarjeta.')
    } finally {
      setSharingCode('')
    }
  }

  const pending = rewards.cards.filter((reward) => !reward.used && reward.available)
  const history = rewards.cards.filter((reward) => reward.used || !reward.available)

  return <main className="client-rewards-page">
    <header className="client-rewards-intro"><span><Sparkles size={18} /> TUS BUENAS NOTICIAS</span><h1>Premios y recompensas</h1><p>Lo que ganaste y lo que aún puedes disfrutar.</p><button type="button" onClick={refresh} disabled={busy} aria-label="Actualizar premios" title="Actualizar premios"><RefreshCw size={19} /></button></header>
    {error && <p className="client-rewards-error" role="alert">{error}</p>}
    {notice && <p className="client-rewards-notice" role="status">{notice}</p>}
    {loading ? <p className="client-rewards-loading" role="status">Buscando tus premios...</p> : <>
      {receivedCards.length > 0 && <section className="client-rewards-section"><div className="client-rewards-heading"><span>ENVIADAS PARA TI</span><h2>Tus tarjetas especiales</h2></div><div className="client-rewards-list">{receivedCards.map((notice) => <article key={notice.id} className="client-reward-item"><div className="client-reward-icon"><Sparkles size={24} /></div><div className="client-reward-copy"><h3>{notice.title}</h3><p>{notice.body}</p></div><div className="client-reward-actions"><Link to={notice.target_url}>Abrir tarjeta <ArrowRight size={17} /></Link></div></article>)}</div></section>}
      {pending.length > 0 && <section className="client-rewards-section"><div className="client-rewards-heading"><span>LISTOS PARA TI</span><h2>Que no se te escapen</h2></div><div className="client-rewards-list">{pending.map((reward, index) => <article key={`${reward.kind}-${reward.code}-${index}`} className="client-reward-item"><div className="client-reward-icon"><Gift size={25} /></div><div className="client-reward-copy"><small>{reward.businessName}</small><h3>{reward.kind === 'pong' ? `¡Ganaste ${reward.discountPercent}%!` : 'Tu servicio de regalo'}</h3><p>{reward.title}</p><span><CalendarDays size={15} /> Reserva antes del {formatDate(reward.expiresAt)}</span></div><div className="client-reward-actions"><Link to={`/invitacion/${reward.code}`}>Reservar <ArrowRight size={17} /></Link>{reward.kind === 'pong' && (shareStates[reward.code]?.canShare || pendingShareLinks[reward.code]) && <button type="button" disabled={sharingCode === reward.code} onClick={() => shareCard(reward)}><Share2 size={17} /> Compartir nuevo reto</button>}</div></article>)}</div></section>}
      {rewards.campaigns.length > 0 && <section className="client-rewards-section"><div className="client-rewards-heading"><span>SORTEOS</span><h2>Tu nombre salió ganador</h2></div><div className="client-rewards-list">{rewards.campaigns.map((reward, index) => <article key={`${reward.campaignName}-${reward.folio}-${index}`} className="client-reward-item campaign"><div className="client-reward-icon"><Ticket size={25} /></div><div className="client-reward-copy"><small>{reward.businessName} · {reward.campaignName}</small><h3>{reward.prizeName}</h3><p>Folio {reward.folio} · Sorteo del {formatDate(reward.wonAt)}</p><span>Conserva tu folio y consulta con el negocio cómo recibir tu premio.</span></div></article>)}</div></section>}
      {history.length > 0 && <section className="client-rewards-section"><div className="client-rewards-heading"><span>HISTORIAL</span><h2>También fue para ti</h2></div><div className="client-rewards-list">{history.map((reward, index) => <article key={`${reward.kind}-${reward.code}-${index}`} className="client-reward-item past"><div className="client-reward-icon"><Check size={23} /></div><div className="client-reward-copy"><small>{reward.businessName}</small><h3>{reward.discountPercent}% en {reward.title}</h3><p>{reward.used ? 'Beneficio aplicado a tu cita' : `Venció el ${formatDate(reward.expiresAt)}`}</p></div></article>)}</div></section>}
      {!pending.length && !history.length && !rewards.campaigns.length && !receivedCards.length && !error && <section className="client-rewards-empty"><Gift size={34} /><h2>Tu próximo premio te espera</h2><p>Explora artistas, estudios y sus tarjetas para descubrir nuevas experiencias.</p><Link to={paths.clientSearch}>Explorar servicios <ArrowRight size={17} /></Link></section>}
      <p className="client-rewards-footnote">Los FlowPoints de tus citas están en <Link to={paths.clientFlowPoints}>FP</Link>. Los sorteos se muestran cuando participaste con el correo verificado de tu cuenta.</p>
    </>}
  </main>
}
