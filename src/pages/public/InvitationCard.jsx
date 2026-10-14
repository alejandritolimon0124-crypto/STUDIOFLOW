import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bell, CalendarDays, Check, Clock3, Gift, Heart, MapPin, Share2, Sparkles, Star, X } from 'lucide-react'
import facebookIcon from '../../assets/social/facebook.png'
import instagramIcon from '../../assets/social/instagram.png'
import tiktokIcon from '../../assets/social/tiktok.png'
import whatsappIcon from '../../assets/social/whatsapp.png'
import { useApp } from '../../contexts/appContextCore'
import { requireSupabase } from '../../lib/supabaseClient'
import { fetchMarketplaceAvailability } from '../../services/availabilityService'
import { paths } from '../../routes/paths'
import PongInvitationGame from '../../components/PongInvitationGame'
import './invitation-page.css'

const money = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value) || 0)
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const socialUrl = (value, base) => {
  const input = String(value || '').trim()
  if (!input) return ''
  if (/^https?:\/\//i.test(input)) return input
  if (/^www\./i.test(input)) return `https://${input}`
  return `${base}${input.replace(/^@/, '')}`
}
const portfolioUrl = (image) => typeof image === 'string' ? image : image?.url || image?.path || image?.photoUrl || ''
const isDisplayableImage = (url) => /^https?:\/\//i.test(url) || /^data:image\/(jpeg|png|webp);base64,/i.test(url)
const challengeRequestHref = (phone, name) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  const recipient = digits.length === 10 ? `52${digits}` : digits
  const message = `Hola ${name || 'Studio Flow'}, supe de tu dinámica de premio por jugar Pong. ¿Me puedes enviar el reto? ¡Quiero intentar ganar un descuento en uno de tus servicios!`
  return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`
}

function offerText(card, pong) {
  if (pong) {
    const service = card.services?.find((item) => item.id === pong.serviceId)?.name || 'un servicio'
    if (pong.redeemed) return 'Ya disfrutaste tu premio'
    if (pong.won) return `Ganaste ${pong.discountPercent}% en ${service}`
    if (pong.remaining === 0) return 'Este reto ya tuvo ganadora'
    if (pong.playEndsAt && new Date(pong.playEndsAt) <= new Date()) return 'Este reto ya cerró'
    return `Juega Pong por ${pong.discountPercent}% en ${service}`
  }
  if (card.benefitType === 'discount') {
    const service = card.services?.find((item) => item.id === card.discountServiceId)?.name
    return `${card.discountPercent}% ${service ? `en ${service}` : 'en el servicio que elijas'}`
  }
  if (card.benefitType === 'free_service') {
    const paid = card.services?.find((service) => service.id === card.paidServiceId)?.name || 'tu servicio'
    const free = card.services?.find((service) => service.id === card.freeServiceId)?.name || 'un servicio'
    return `Reserva ${paid} y recibe ${free}`
  }
  if (card.benefitType === 'referral') return 'Ven con una amiga y recibe 50%'
  return 'Tu próxima cita empieza aquí'
}

export default function InvitationCard() {
  const { code } = useParams()
  const [searchParams] = useSearchParams()
  const referralToken = searchParams.get('ref') || ''
  const { isAuthenticated, isAuthLoading, session } = useApp()
  const reviewingFromCards = searchParams.get('origen') === 'mis-tarjetas'
    && ((searchParams.get('entorno') === 'artista' && session.role === 'artist')
      || (searchParams.get('entorno') === 'estudio' && session.role === 'admin'))
  const cardsPath = searchParams.get('entorno') === 'estudio' ? paths.studioAccounting : paths.artistAccounting
  const [card, setCard] = useState(null)
  const [closedCard, setClosedCard] = useState(null)
  const confirmRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState(today)
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [slotBusy, setSlotBusy] = useState(true)
  const [bookingBusy, setBookingBusy] = useState(false)
  const [booked, setBooked] = useState(false)
  const [friendLink, setFriendLink] = useState('')
  const [selectedImage, setSelectedImage] = useState('')
  const [pong, setPong] = useState(null)
  const [shareState, setShareState] = useState(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [pendingShareLink, setPendingShareLink] = useState('')
  const [claimError, setClaimError] = useState('')

  useEffect(() => {
    let active = true
    requireSupabase().rpc('studio_flow_get_invitation_card', { p_code: code }).then(async ({ data, error }) => {
      if (error) throw error
      if (!data) {
        const { data: closed } = await requireSupabase().rpc('studio_flow_closed_pong_card', { p_code: code })
        if (active) { setCard(null); setClosedCard(closed) }
        return
      }
      if (active) {
        setCard(data)
        setClosedCard(null)
        setServiceId(data?.expiresAt && new Date(data.expiresAt) <= new Date() && data.freeEarned
          ? data.freeServiceId : data?.discountServiceId || data?.paidServiceId || data?.services?.[0]?.id || '')
      }
    }).catch((error) => { if (active) setNotice(error.message || 'No pudimos abrir la invitación.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [code, isAuthenticated])

  useEffect(() => {
    let active = true
    const load = async () => {
      const token = localStorage.getItem(`studio-flow-pong-${code}`)
      if (isAuthenticated && session.role === 'client' && token) {
        const { data: guest } = await requireSupabase().rpc('studio_flow_get_guest_pong_status', { p_code: code, p_guest_token: token })
        if (guest?.won) {
          const { error } = await requireSupabase().rpc('studio_flow_claim_guest_pong', { p_code: code, p_guest_token: token })
          if (!active) return
          if (error) setClaimError(error.message || 'No pudimos guardar tu premio.')
          else { localStorage.removeItem(`studio-flow-pong-${code}`); setClaimError('') }
        }
      }
      const guestToken = !isAuthenticated ? localStorage.getItem(`studio-flow-pong-${code}`) : null
      const { data, error } = await requireSupabase().rpc(guestToken ? 'studio_flow_get_guest_pong_status' : 'studio_flow_get_pong_status', {
        p_code: code, ...(guestToken ? { p_guest_token: guestToken } : {}),
      })
      if (error) throw error
      if (active) { setPong(data); if (data?.won && isAuthenticated) setServiceId(data.serviceId) }
    }
    load().catch(() => { if (active) setPong(null) })
    return () => { active = false }
  }, [code, isAuthenticated, session.role])

  const refreshPong = async () => {
    const token = !isAuthenticated ? localStorage.getItem(`studio-flow-pong-${code}`) : null
    const { data, error } = await requireSupabase().rpc(token ? 'studio_flow_get_guest_pong_status' : 'studio_flow_get_pong_status', {
      p_code: code, ...(token ? { p_guest_token: token } : {}),
    })
    if (!error) { setPong(data); if (data?.won && isAuthenticated) setServiceId(data.serviceId) }
  }

  useEffect(() => {
    if (!pong) return
    let active = true
    const token = localStorage.getItem(`studio-flow-pong-${code}`)
    requireSupabase().rpc('studio_flow_pong_share_state', {
      p_code: code, p_guest_token: token || null,
    }).then(({ data, error }) => {
      if (error) throw error
      if (active) setShareState(data)
    }).catch(() => { if (active) setShareState(null) })
    return () => { active = false }
  }, [code, pong])

  const listingId = card?.listingId || null
  const publicProfile = card?.publicProfile || {}
  const expired = card?.expiresAt && new Date(card.expiresAt) <= new Date()
  const services = useMemo(() => (card?.services || []).filter((service) =>
    (card?.benefitType !== 'discount' || !card.discountServiceId || service.id === card.discountServiceId)
    && (card?.benefitType !== 'free_service' || (!expired && service.id === card.paidServiceId) || (card.freeEarned && service.id === card.freeServiceId))
    && (!pong?.won || service.id === pong.serviceId)), [card, expired, pong])

  useEffect(() => {
    if (!listingId || !serviceId || !date) return
    let active = true
    fetchMarketplaceAvailability({ listingId, serviceOfferingId: serviceId, date })
      .then((data) => { if (active) setSlots(data.slots.filter((slot) => slot.available)) })
      .catch((error) => { if (active) { setSlots([]); setNotice(error.message || 'No pudimos consultar horarios.') } })
      .finally(() => { if (active) setSlotBusy(false) })
    return () => { active = false }
  }, [listingId, serviceId, date])

  useEffect(() => {
    if (!selectedSlot) return undefined
    const frame = window.requestAnimationFrame(() => confirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    return () => window.cancelAnimationFrame(frame)
  }, [selectedSlot])

  const reserve = async (slot) => {
    setNotice('')
    setBookingBusy(true)
    try {
      const gameReward = pong?.won && serviceId === pong.serviceId
      const { error } = await requireSupabase().rpc(gameReward ? 'studio_flow_book_pong_reward' : 'studio_flow_book_with_invitation', {
        p_code: code,
        p_availability_slot_ids: slot.availabilitySlotIds?.length ? slot.availabilitySlotIds : [slot.availabilitySlotId || slot.id],
        p_service_offering_id: serviceId,
        p_notes: null,
        ...(gameReward ? {} : { p_referral_token: referralToken || null }),
      })
      if (error) throw error
      setBooked(true)
      if (card?.benefitType === 'referral') refreshCard()
    } catch (error) {
      setNotice(error.message || 'No se pudo reservar este horario.')
    } finally {
      setBookingBusy(false)
    }
  }

  const next = encodeURIComponent(`/invitacion/${code}${referralToken ? `?ref=${referralToken}` : ''}`)
  const refreshCard = async () => {
    try {
      const { data, error } = await requireSupabase().rpc('studio_flow_get_invitation_card', { p_code: code })
      if (error) throw error
      if (data) setCard(data)
    } catch {
      setNotice('No pudimos actualizar el estado. Intenta de nuevo.')
    }
  }
  const getFriendLink = async () => {
    if (friendLink) return friendLink
    const { data, error } = await requireSupabase().rpc('studio_flow_get_invitation_referral', { p_code: code })
    if (error) throw error
    const link = `${window.location.origin}/invitacion/${code}?ref=${data}`
    setFriendLink(link)
    return link
  }
  const inviteFriend = async () => {
    setNotice('')
    try {
      const link = await getFriendLink()
      if (navigator.share) await navigator.share({ title: 'Ven conmigo a Studio Flow', text: 'Te invito a reservar conmigo. Abre este enlace, crea tu perfil si aún no lo tienes y elige tu cita. Cuando las dos reservemos, se activa mi regalo del 50%.', url: link })
      else { await navigator.clipboard.writeText(link); setNotice('Enlace para tu amiga copiado.') }
    } catch (error) {
      if (error?.name !== 'AbortError') setNotice(error.message || 'No pudimos crear el enlace para tu amiga.')
    }
  }
  const remindFriend = async () => {
    try {
      const link = referralToken ? `${window.location.origin}/invitacion/${code}` : await getFriendLink()
      const text = referralToken
        ? `Ya reservé mi cita en Studio Flow. Reserva la tuya para activar tu regalo del 50%: ${link}`
        : `Ya reservé mi cita en Studio Flow. Falta la tuya para activar mi regalo del 50%. Abre tu enlace de amiga y elige tu horario: ${link}`
      if (navigator.share) await navigator.share({ title: 'Nuestra cita en Studio Flow', text })
      else { await navigator.clipboard.writeText(text); setNotice('Recordatorio copiado para enviarlo a tu amiga.') }
    } catch (error) {
      if (error?.name !== 'AbortError') setNotice('No pudimos preparar el recordatorio.')
    }
  }
  const shareCard = async () => {
    if (card?.benefitType === 'referral' && isAuthenticated && session.role === 'client') {
      await inviteFriend()
      return
    }
    setNotice('')
    setShareBusy(true)
    try {
      let link = window.location.href
      let text = `Mira esta invitación de ${card?.name || 'Studio Flow'}. Conoce sus servicios y reserva tu cita desde aquí.`
      if (pong) {
        if (!pendingShareLink && !shareState?.canShare) return
        if (pendingShareLink) link = pendingShareLink
        else {
          const token = localStorage.getItem(`studio-flow-pong-${code}`)
          const { data, error } = await requireSupabase().rpc('studio_flow_share_pong_card', {
            p_code: code, p_guest_token: token || null,
          })
          if (error) throw error
          link = `${window.location.origin}/invitacion/${data.code}`
          setPendingShareLink(link)
          setShareState((current) => ({ ...current, remaining: data.remaining, canShare: data.remaining > 0 }))
        }
        text = `Te comparto un nuevo reto de ${card?.name || 'Studio Flow'}. Juega Pong para intentar ganar ${pong.discountPercent}% en uno de sus servicios. Esta liga tiene una sola ganadora.`
      }
      if (navigator.share) await navigator.share({ title: `Una invitación de ${card?.name || 'Studio Flow'}`, text, url: link })
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(`${text}\n${link}`); setNotice('Invitación copiada para enviarla a tu amiga.') }
      else setNotice(`Comparte este enlace con tu amiga: ${link}`)
      setPendingShareLink('')
    } catch (error) {
      if (error?.name !== 'AbortError') setNotice(error.message || 'No pudimos preparar una nueva oportunidad. Intenta de nuevo.')
    } finally {
      setShareBusy(false)
    }
  }
  const selectedService = card?.services?.find((service) => service.id === serviceId)
  const discountPercent = card?.benefitType === 'discount' && (!card.discountServiceId || serviceId === card.discountServiceId) ? Number(card.discountPercent) || 0
    : card?.benefitType === 'free_service' && serviceId === card.freeServiceId && card.freeEarned ? 100
      : card?.benefitType === 'referral' && card.referralFriendBooked && !referralToken ? 50
        : pong?.won && isAuthenticated && serviceId === pong.serviceId ? Number(pong.discountPercent) : 0
  const finalPrice = selectedService ? Math.round(Number(selectedService.price) * (100 - discountPercent)) / 100 : 0
  const portrait = publicProfile.photoUrl || ''
  const portfolio = (publicProfile.portfolioPaths || [])
    .map(portfolioUrl).filter(isDisplayableImage).slice(0, 8)
  const serviceNames = [...new Set((card?.services || [])
    .slice()
    .sort((a, b) => Number(b.price) - Number(a.price) || String(a.name).localeCompare(String(b.name), 'es'))
    .map((service) => service.name).filter(Boolean))]
  const contact = publicProfile.contactLinks || {}
  const whatsappNumber = String(contact.whatsapp || '').replace(/\D/g, '')
  const requestNumber = whatsappNumber || ''
  const requestHref = challengeRequestHref(requestNumber, card?.name)
  const pongClosedForVisitor = pong && !pong.won && (pong.remaining === 0 || (pong.playEndsAt && new Date(pong.playEndsAt) <= new Date()))
  const cardUrl = `${window.location.origin}/invitacion/${code}${referralToken ? `?ref=${encodeURIComponent(referralToken)}` : ''}`
  const whatsappMessage = `Hola, vi la tarjeta digital de ${card?.name || 'tu espacio'} en Studio Flow y me interesan tus servicios. ¿Me puedes dar más información?\n\n${cardUrl}`
  const socialLinks = [
    ['WhatsApp', whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}` : '', whatsappIcon],
    ['Instagram', socialUrl(contact.instagram, 'https://instagram.com/'), instagramIcon],
    ['Facebook', socialUrl(contact.facebook, 'https://facebook.com/'), facebookIcon],
    ['TikTok', socialUrl(contact.tiktok, 'https://www.tiktok.com/@'), tiktokIcon],
  ].filter(([, url]) => Boolean(url))
  const location = publicProfile.professionalLocation || {}
  const address = [location.addressLine || location.address_line, location.city, location.state].filter(Boolean).join(', ')
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : ''
  return <main className="invitation-page">
    <header className="invitation-top">{reviewingFromCards && <Link className="invitation-return" to={`${cardsPath}?tarjeta=1&vista=guardadas`}><ArrowLeft size={18} /> Volver a Mis tarjetas</Link>}<img src="/studioflow-wordmark-960.png" alt="Studio Flow" /></header>
    {loading ? <p role="status">Preparando tu invitación...</p> : card?.private ? <section className="invitation-missing"><h1>Esta tarjeta es personal.</h1><p>Entra con la cuenta de Studio Flow a la que fue enviada para descubrirla.</p><Link to={`${paths.login}?next=${next}`}>Entrar a mi cuenta</Link></section> : !card ? closedCard ? <section className="invitation-pong-closed invitation-pong-closed-page"><Gift size={29} /><div><h1>{closedCard.winnerTaken ? 'Este premio ya tiene ganadora' : 'Este reto ya cerró'}</h1><p>Pídele a {closedCard.name} una tarjeta de juego especial para ti.</p>{challengeRequestHref(closedCard.phone, closedCard.name) ? <a href={challengeRequestHref(closedCard.phone, closedCard.name)} target="_blank" rel="noreferrer">Pedir mi reto por WhatsApp</a> : <small>Este negocio aún no agregó un WhatsApp de contacto.</small>}</div></section> : <section className="invitation-missing"><h1>Esta invitación ya no está disponible.</h1><Link to={paths.clientsWelcome}>Descubre Studio Flow</Link></section> : <>
      <section className="invitation-main">{portfolio[0] && <img className="invitation-hero-image" src={portfolio[0]} alt="" />}{portrait && <img className="invitation-portrait" src={portrait} alt="" />}<span><Sparkles size={17} /> UNA INVITACIÓN PARA TI</span><h1>{card.name}</h1><p>{offerText(card, pong)}</p>{socialLinks.length > 0 && <small>Presiona cada icono para explorar mis redes.</small>}{socialLinks.length > 0 && <nav className="invitation-hero-social" aria-label="Redes sociales de la artista">{socialLinks.map(([name, url, icon]) => <a key={name} href={url} target="_blank" rel="noreferrer" title={name} aria-label={`Abrir ${name}`}><img src={icon} alt="" /></a>)}</nav>}{address && <div className="invitation-location"><MapPin size={19} aria-hidden="true" /><span>{address}</span><a href={mapsUrl} target="_blank" rel="noreferrer">Cómo llegar</a></div>}</section>
      <section className="invitation-body">
        <div className="invitation-perks" aria-label="Beneficios de Studio Flow"><div><Star size={20} /><span>FlowPoints para canjear en servicios participantes</span></div><div><Gift size={20} /><span>Promociones exclusivas en la app</span></div><div><Bell size={20} /><span>Sorpresas y sorteos a través de la app</span></div><div><CalendarDays size={20} /><span>Citas fáciles, a tu horario</span></div></div>
        {pong && <>{pongClosedForVisitor && !pong.redeemed ? <section className="invitation-pong-closed"><Gift size={26} /><div><h2>{pong.remaining === 0 ? 'Este premio ya tiene ganadora' : 'Este reto ya cerró'}</h2><p>Pídele a {card.name} una tarjeta de juego especial para ti.</p>{requestHref ? <a href={requestHref} target="_blank" rel="noreferrer">Pedir mi reto por WhatsApp</a> : <small>Este negocio aún no agregó un WhatsApp de contacto.</small>}</div></section> : isAuthenticated && session.role === 'client' && pong.won ? <div className="invitation-game-won"><Gift size={24} /><strong>Ganaste el {pong.discountPercent}%. Reserva {card.services?.find((service) => service.id === pong.serviceId)?.name || 'tu servicio'} aquí abajo dentro de {pong.rewardValidDays || 30} días de haber ganado.</strong></div> : !pong.redeemed ? <PongInvitationGame code={code} offer={pong} serviceName={card.services?.find((service) => service.id === pong.serviceId)?.name || 'el servicio elegido'} isGuest={!isAuthenticated} isDemo={isAuthenticated && session.role !== 'client'} onComplete={refreshPong} /> : null}{!isAuthenticated && pong.won && <div className="invitation-game-won"><Gift size={24} /><strong>¡Ganaste! Crea tu perfil y reserva dentro de {pong.rewardValidDays || 30} días para usar tu {pong.discountPercent}%.</strong><Link to={`${paths.register}?tipo=client&next=${next}`}>Conservar mi premio</Link></div>}{claimError && <p className="invitation-warning" role="alert">{claimError}</p>}</>}
        {serviceNames.length > 0 && <section className="invitation-showcase" id="invitation-services"><div className="invitation-section-title"><h2>Conoce mis servicios</h2></div><div className="invitation-service-list">{serviceNames.slice(0, 8).map((name) => <span key={name}>{name}</span>)}</div>{serviceNames.length > 8 && <details className="invitation-more-services"><summary>Ver los {serviceNames.length} servicios</summary><div className="invitation-service-list">{serviceNames.slice(8).map((name) => <span key={name}>{name}</span>)}</div></details>}</section>}
        {portfolio.length > 0 && <section className="invitation-showcase"><div className="invitation-section-title"><span>MI PASIÓN EN IMÁGENES</span><h2>Te invito a conocer mi mundo</h2></div><div className="invitation-gallery">{portfolio.map((url, index) => <button key={index} type="button" onClick={() => setSelectedImage(url)} aria-label={`Ver trabajo ${index + 1}`}><img src={url} alt={`Trabajo de ${card.name} ${index + 1}`} loading="lazy" /></button>)}</div></section>}
        {card.benefitType === 'referral' ? <section className="invitation-referral-benefit" aria-label="Tu regalo con una amiga">
          <div className="invitation-referral-heading"><Gift size={30} /><div><span>PARA COMPARTIR</span><h2>Dos citas. Un regalo especial.</h2></div></div>
          <strong>{referralToken ? 'Ayuda a tu amiga a desbloquear su 50%' : '50% para ti cuando las dos reserven'}</strong>
          <p>{referralToken ? 'Crea tu perfil si aún no lo tienes y agenda desde este enlace. Studio Flow reconocerá que vienes invitada por tu amiga.' : 'Reserva desde tu perfil y envía a tu amiga su enlace personal. Ella crea su perfil si aún no lo tiene y agenda desde ese enlace. Studio Flow une las dos citas automáticamente.'}</p>
          {isAuthenticated && session.role === 'client' && !referralToken && <div className="invitation-referral-progress">
            <span className={card.referralOwnBooked ? 'done' : ''}>{card.referralOwnBooked ? <Check size={17} /> : '1'} Tu cita {card.referralOwnBooked ? 'reservada' : 'pendiente'}</span>
            <span className={card.referralFriendBooked ? 'done' : ''}>{card.referralFriendBooked ? <Check size={17} /> : '2'} Cita de tu amiga {card.referralFriendBooked ? 'reservada' : 'pendiente'}</span>
          </div>}
          {isAuthenticated && session.role === 'client' && !referralToken && card.referralOwnBooked && !card.referralFriendBooked && <div className="invitation-referral-next"><strong>Ya apartaste tu momento. Falta tu amiga.</strong><p>Envíale su enlace para que reserve y se active tu regalo.</p><button type="button" onClick={inviteFriend}><Share2 size={17} /> Enviar enlace a mi amiga</button><button type="button" className="invitation-referral-secondary" onClick={remindFriend}>Recordarle que reserve</button></div>}
          {isAuthenticated && session.role === 'client' && !referralToken && !card.referralOwnBooked && card.referralFriendBooked && <div className="invitation-referral-next"><strong>Tu amiga ya reservó.</strong><p>Ahora elige tu cita para activar el 50%.</p></div>}
          {isAuthenticated && session.role === 'client' && !referralToken && card.referralOwnBooked && card.referralFriendBooked && <div className="invitation-referral-next complete"><Check size={21} /><div><strong>¡Ya reservaron las dos!</strong><p>El 50% quedó aplicado a tu cita.</p></div></div>}
          {referralToken && isAuthenticated && session.role === 'client' && <div className="invitation-referral-next"><strong>{card.referralOwnBooked ? 'Tu cita ya está reservada.' : 'Tu amiga te espera.'}</strong><p>{card.referralOwnBooked ? 'Avísale para que también reserve y se active su regalo.' : 'Crea tu cita desde este enlace para que Studio Flow reconozca que vas con ella.'}</p>{card.referralOwnBooked && <button type="button" onClick={remindFriend}><Share2 size={17} /> Avisarle que ya reservé</button>}</div>}
          {!isAuthenticated && <small>El enlace de amiga conserva la referencia al crear tu perfil.</small>}
          {isAuthenticated && session.role === 'client' && <button type="button" className="invitation-referral-refresh" onClick={refreshCard}>Actualizar estado de las citas</button>}
        </section> : !pong && <div className="invitation-benefit invitation-benefit-highlight"><Gift size={27} /><div><strong>{card.benefitType === 'none' ? '¡Tu próxima cita comienza aquí!' : card.benefitType === 'discount' ? `¡Tu ${card.discountPercent}% de descuento te espera!` : '¡Tu servicio de regalo te espera!'}</strong><p>{card.benefitType === 'free_service' ? 'Crea tu perfil o inicia sesión y reserva tu servicio pagado desde esta invitación. Al completar esa cita, se activará el servicio de menor costo sin cargo. Solo la cita pagada genera FlowPoints.' : card.benefitType === 'discount' ? 'Para hacer válido tu descuento, crea tu perfil o inicia sesión y reserva desde esta invitación. Verás el descuento antes de confirmar tu cita.' : 'Crea tu perfil o inicia sesión y reserva desde esta invitación para elegir tu servicio y horario. Esta tarjeta no ofrece un descuento adicional.'}</p></div></div>}
        {expired && card.freeEarned && <p className="invitation-warning">Tu recompensa ganada sigue disponible durante 30 días desde la cita que la activó.</p>}
        {!card.available && card.benefitType !== 'referral' && <p className="invitation-warning">Esta tarjeta ya fue utilizada.</p>}
        {card.alreadyRedeemed && !referralToken && <p className="invitation-warning">Ya disfrutaste este beneficio. Puedes seguir reservando desde tu perfil de Studio Flow.</p>}
        {!pongClosedForVisitor && !isAuthLoading && (!isAuthenticated || session.role !== 'client') && <div className="invitation-auth" id="invitation-reserve"><h2>Tu lugar te espera</h2><p>Crea tu perfil gratis para reservar y usar el beneficio.</p><Link to={`${paths.register}?tipo=client&next=${next}`}>Crear mi perfil</Link><Link to={`${paths.login}?next=${next}`}>Ya tengo cuenta</Link></div>}
        {isAuthenticated && session.role === 'client' && card.benefitType === 'referral' && !expired && !referralToken && !card.referralFriendBooked && !card.alreadyRedeemed && !card.referralOwnBooked && <div className="invitation-friend"><h2>Invita a tu amiga</h2><p>Compártele su enlace personal. Puede crear su perfil y reservar desde ahí.</p><button type="button" onClick={inviteFriend}><Share2 size={18} /> Crear enlace para mi amiga</button>{friendLink && <input readOnly value={friendLink} aria-label="Enlace para tu amiga" onFocus={(event) => event.target.select()} />}</div>}
        {isAuthenticated && session.role === 'client' && !pongClosedForVisitor && !booked && (!card.alreadyRedeemed || referralToken) && (card.benefitType !== 'referral' || !card.referralOwnBooked) && <section className="invitation-booking" id="invitation-reserve"><h2>Elige tu momento</h2>{!listingId && <p>La agenda de este perfil no está disponible ahora.</p>}{listingId && <><label>Servicio<select value={serviceId} onChange={(event) => { setSelectedSlot(null); setSlotBusy(true); setServiceId(event.target.value) }}>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {money(service.price)}</option>)}</select></label>{selectedService && <p className="invitation-price">{money(selectedService.price)} · {selectedService.minutes} min</p>}<label>Fecha<input type="date" min={today()} value={date} onChange={(event) => { setSelectedSlot(null); setSlotBusy(true); setDate(event.target.value) }} /></label>{!selectedSlot && <div className="invitation-slots" aria-label="Horarios disponibles">{slotBusy ? <p>Buscando horarios...</p> : slots.length ? slots.map((slot) => <button type="button" key={slot.id} disabled={bookingBusy || (card.benefitType !== 'referral' && !card.available)} onClick={() => setSelectedSlot(slot)}><Clock3 size={17} />{slot.time || new Date(slot.startsAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })}</button>) : <p>Sin horarios disponibles este día.</p>}</div>}{selectedSlot && <div className="invitation-confirm" ref={confirmRef}><div><strong>{selectedService?.name}</strong><span>{date} · {selectedSlot.time || 'Horario seleccionado'}</span>{discountPercent > 0 && <small>{discountPercent}% de beneficio: {money(selectedService.price)} → {money(finalPrice)}</small>}{discountPercent === 0 && <small>Total: {money(finalPrice)}</small>}</div><button type="button" className="invitation-change-time" onClick={() => setSelectedSlot(null)}>Cambiar horario</button><button type="button" disabled={bookingBusy} onClick={() => reserve(selectedSlot)}>{bookingBusy ? 'Confirmando...' : 'Confirmar cita'}</button></div>}</>}</section>}
        {booked && <div className="invitation-success"><Check size={28} /><h2>Tu cita está reservada</h2><p>Encuentra los detalles en Mis citas.</p><Link to={paths.clientAppointments}>Ver mi cita</Link></div>}
        {card.benefitType === 'referral' && !isAuthenticated && !referralToken ? <Link className="invitation-share-friend" to={`${paths.register}?tipo=client&next=${next}`}><Share2 size={21} aria-hidden="true" /> Crea tu perfil para invitar a tu amiga</Link> : card.benefitType === 'referral' && isAuthenticated && session.role === 'client' && !referralToken && !card.referralFriendBooked ? <button type="button" className="invitation-share-friend" onClick={inviteFriend}><Share2 size={21} aria-hidden="true" /> Enviar invitación personal a mi amiga</button> : pong && (shareState?.canShare || pendingShareLink) ? <button type="button" className="invitation-share-friend" disabled={shareBusy} onClick={shareCard}><Share2 size={21} aria-hidden="true" /> {shareBusy ? 'Preparando otra oportunidad...' : 'Compartir un reto nuevo con una amiga'}</button> : !pong && card.benefitType === 'none' && <button type="button" className="invitation-share-friend" onClick={shareCard}><Share2 size={21} aria-hidden="true" /> Compartir esta tarjeta con una amiga</button>}
        <footer className="invitation-footer"><div><CalendarDays size={18} /> Reserva en Studio Flow <Heart size={17} /></div><small>Powered by AXM Tech</small></footer>
      </section>
    </>}
    {notice && <p role="alert" className="invitation-error">{notice}</p>}
    {selectedImage && <div className="invitation-image-viewer" role="presentation" onClick={() => setSelectedImage('')}><button type="button" onClick={() => setSelectedImage('')} aria-label="Cerrar imagen"><X size={24} /></button><img src={selectedImage} alt={`Trabajo de ${card?.name || 'la artista'}`} /></div>}
  </main>
}
