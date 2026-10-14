import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, ExternalLink, Gamepad2, Gift, Pencil, Percent, Share2, Sparkles, Trash2, Trophy, UsersRound, X } from 'lucide-react'
import { requireSupabase } from '../lib/supabaseClient'
import PongInvitationGame from './PongInvitationGame'
import { sharePreviewUrl } from '../utils/sharePreviewUrl'
import CardRecipientPicker from './CardRecipientPicker'
import './invitation-card.css'

const options = [
  { value: 'none', label: 'Solo invitar', detail: 'Tu mundo beauty, sin fecha de vencimiento.', Icon: Sparkles },
  { value: 'discount', label: 'Descuento', detail: 'Un detalle especial para su próxima cita.', Icon: Percent },
  { value: 'free_service', label: 'Un servicio de regalo', detail: 'Un gesto que se disfruta después de su cita.', Icon: Gift },
  { value: 'referral', label: 'Ven con una amiga', detail: 'Una experiencia para vivir juntas.', Icon: UsersRound },
  { value: 'pong', label: 'Juega y gana', detail: 'Un reto con premio para una ganadora.', Icon: Gamepad2 },
]

const invitationMessage = (name, offer, url, pong = false) => pong ? [
  `Hola, te invito a conocer ${name || 'mi espacio de belleza'} en Studio Flow.`,
  'Aquí tienes una dinámica para desbloquear un descuento exclusivo para ti. ¡El reto es jugar y ganar en PONG! ¿Lo podrás lograr?',
  'Inténtalo en este enlace. Además, descubre mis servicios, explora mis redes sociales y elige tu cita el día y la hora que más te convengan.',
  url ? `Juega aquí: ${url}` : '',
].filter(Boolean).join('\n\n') : [
  `Hola, te invito a conocer ${name || 'mi espacio de belleza'} en Studio Flow.`,
  `Preparé una invitación para ti: ${offer}.`,
  'Descubre mis servicios, mira mi trabajo y elige tu cita cuando mejor te venga.',
  url ? `Abre tu volante aquí: ${url}` : '',
].filter(Boolean).join('\n\n')

export default function InvitationCardBuilder({ studioId = null, businessName = '', initialMode = 'create', initialClient = null, onClose }) {
  const [services, setServices] = useState([])
  const [cards, setCards] = useState([])
  const [mode, setMode] = useState(initialMode)
  const [benefit, setBenefit] = useState('none')
  const [discount, setDiscount] = useState(null)
  const [discountServiceId, setDiscountServiceId] = useState('')
  const [paidServiceId, setPaidServiceId] = useState('')
  const [freeServiceId, setFreeServiceId] = useState('')
  const [gameServiceId, setGameServiceId] = useState('')
  const [gameDiscount, setGameDiscount] = useState(null)
  const [result, setResult] = useState(null)
  const [editingCode, setEditingCode] = useState(null)
  const [preview, setPreview] = useState(false)
  const [previewPrize, setPreviewPrize] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [notice, setNotice] = useState('')
  const [recipient, setRecipient] = useState(initialClient)
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [winnerCardCode, setWinnerCardCode] = useState('')
  const [cardWinners, setCardWinners] = useState([])
  const [winnerLoading, setWinnerLoading] = useState(false)
  const [winnerError, setWinnerError] = useState('')
  const [autoPreviewArmed, setAutoPreviewArmed] = useState(true)
  const scrollRef = useRef(null)
  const selectedOptionRef = useRef(null)
  const deleteCancelRef = useRef(null)
  const deleteTriggerRef = useRef(null)

  useEffect(() => {
    if (deleteTarget) deleteCancelRef.current?.focus()
  }, [deleteTarget])

  useEffect(() => {
    let active = true
    requireSupabase().rpc('studio_flow_get_invitation_services', { p_studio_id: studioId })
      .then(({ data, error }) => {
        if (error) throw error
        if (active) setServices(Array.isArray(data) ? data : [])
      })
      .catch((error) => { if (active) setNotice(error.message || 'No se pudieron cargar tus servicios.') })
    return () => { active = false }
  }, [studioId])

  const refreshCards = async () => {
    const { data, error } = await requireSupabase().rpc('studio_flow_list_invitation_cards', { p_studio_id: studioId })
    if (error) throw error
    setCards(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    let active = true
    requireSupabase().rpc('studio_flow_list_invitation_cards', { p_studio_id: studioId })
      .then(({ data, error }) => { if (error) throw error; if (active) setCards(Array.isArray(data) ? data : []) })
      .catch(() => {})
    return () => { active = false }
  }, [studioId])

  const url = result ? sharePreviewUrl(`${window.location.origin}/invitacion/${result.code}`) : ''
  const reviewUrl = result ? `${url}&origen=mis-tarjetas&entorno=${studioId ? 'estudio' : 'artista'}` : ''
  const label = benefit === 'discount' ? `${discount}% de descuento${discountServiceId && discountServiceId !== 'all' ? ` en ${services.find((service) => service.id === discountServiceId)?.name || 'tu servicio'}` : ' en el servicio que elijas'}`
    : benefit === 'free_service' ? 'Un servicio de regalo'
      : benefit === 'referral' ? 'Ven con una amiga'
        : benefit === 'pong' ? `Juega Pong y gana ${gameDiscount}%` : 'Te espero en Studio Flow'
  const message = invitationMessage(businessName, label, url, benefit === 'pong')

  const validate = () => {
    setNotice('')
    if (benefit === 'discount' && (![10, 20, 30].includes(discount) || !discountServiceId)) {
      setNotice('Elige el descuento y si aplica a un servicio o a cualquiera.')
      return false
    }
    if (benefit === 'free_service' && (!paidServiceId || !freeServiceId || paidServiceId === freeServiceId)) {
      setNotice('Elige dos servicios distintos para esta invitación.')
      return false
    }
    if (benefit === 'free_service' && Number(services.find((service) => service.id === freeServiceId)?.price) >= Number(services.find((service) => service.id === paidServiceId)?.price)) {
      setNotice('El servicio de regalo debe costar menos que el comprado.')
      return false
    }
    if (benefit === 'pong' && !gameServiceId) {
      setNotice('Elige el servicio que tendrá el descuento si gana.')
      return false
    }
    if (benefit === 'pong' && ![10, 20, 30, 50].includes(gameDiscount)) {
      setNotice('Elige el descuento del premio.')
      return false
    }
    return true
  }

  const save = async () => {
    if (!validate()) return
    setBusy(true)
    try {
      const updateConfig = {
        benefitType: benefit,
        discountPercent: benefit === 'pong' ? gameDiscount : benefit === 'discount' ? discount : null,
        paidServiceId: benefit === 'free_service' ? paidServiceId : null,
        freeServiceId: benefit === 'free_service' ? freeServiceId : null,
        gameServiceId: benefit === 'pong' ? gameServiceId : null,
        maxRedemptions: 1,
      }
      const { data, error } = editingCode ? await requireSupabase().rpc(benefit === 'discount' ? 'studio_flow_update_discount_card' : 'studio_flow_update_invitation_card', benefit === 'discount' ? {
        p_code: editingCode, p_discount_percent: discount,
        p_service_id: discountServiceId === 'all' ? null : discountServiceId,
      } : { p_code: editingCode, p_config: updateConfig }) : await requireSupabase().rpc(benefit === 'pong' ? 'studio_flow_create_pong_card' : benefit === 'discount' ? 'studio_flow_create_discount_card' : 'studio_flow_create_invitation_card', benefit === 'pong' ? {
        p_studio_id: studioId,
        p_service_id: gameServiceId,
        p_max_winners: 1,
        p_discount_percent: gameDiscount,
      } : benefit === 'discount' ? {
        p_studio_id: studioId, p_discount_percent: discount,
        p_service_id: discountServiceId === 'all' ? null : discountServiceId,
      } : {
        p_studio_id: studioId,
        p_benefit_type: benefit,
        p_discount_percent: benefit === 'discount' ? discount : null,
        p_paid_service_id: benefit === 'free_service' ? paidServiceId : null,
        p_free_service_id: benefit === 'free_service' ? freeServiceId : null,
        p_max_redemptions: 1,
      })
      if (error) throw error
      setResult(data)
      setSentTo('')
      setEditingCode(null)
      setPreview(false)
      refreshCards().catch(() => {})
    } catch (error) {
      setNotice(error.message || 'No pudimos crear la tarjeta.')
    } finally {
      setBusy(false)
    }
  }

  const previewCard = () => {
    if (validate()) openPreview()
  }

  const openPreview = () => {
    setNotice('')
    setPreviewPrize(false)
    setPreview(true)
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' }))
  }

  const completeDraft = (changes = {}) => {
    if (!autoPreviewArmed) return
    const draft = { benefit, discount, discountServiceId, paidServiceId, freeServiceId, gameServiceId, gameDiscount, ...changes }
    const paidPrice = Number(services.find((service) => service.id === draft.paidServiceId)?.price)
    const freePrice = Number(services.find((service) => service.id === draft.freeServiceId)?.price)
    const complete = draft.benefit === 'none'
      || (draft.benefit === 'discount' && [10, 20, 30].includes(draft.discount) && Boolean(draft.discountServiceId))
      || (draft.benefit === 'free_service' && draft.paidServiceId && draft.freeServiceId && freePrice < paidPrice)
      || draft.benefit === 'referral'
      || (draft.benefit === 'pong' && draft.gameServiceId && [10, 20, 30, 50].includes(draft.gameDiscount))
    if (complete) {
      setAutoPreviewArmed(false)
      openPreview()
    }
  }

  const selectBenefit = (value) => {
    if (value === benefit) return
    if (editingCode) return
    setBenefit(value)
    setDiscount(null)
    setDiscountServiceId('')
    setPaidServiceId('')
    setFreeServiceId('')
    setGameServiceId('')
    setGameDiscount(null)
    setAutoPreviewArmed(true)
    setNotice('')
    if (value === 'none') openPreview()
  }

  const editDraft = () => {
    setPreview(false)
    requestAnimationFrame(() => selectedOptionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  const createAnother = () => {
    setResult(null)
    setEditingCode(null)
    setPreview(false)
    setBenefit('none')
    setDiscount(null)
    setDiscountServiceId('')
    setPaidServiceId('')
    setFreeServiceId('')
    setGameServiceId('')
    setGameDiscount(null)
    setAutoPreviewArmed(true)
    setNotice('')
    setRecipient(null)
    setSentTo('')
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' }))
  }

  const loadSavedCard = (card) => {
    setBenefit(card.benefitType)
    setDiscount(card.benefitType === 'discount' ? Number(card.discountPercent) : null)
    setDiscountServiceId(card.benefitType === 'discount' ? card.discountServiceId || 'all' : '')
    setPaidServiceId(card.paidServiceId || '')
    setFreeServiceId(card.freeServiceId || '')
    setGameServiceId(card.gameServiceId || '')
    setGameDiscount(card.benefitType === 'pong' ? Number(card.discountPercent) : null)
    setResult({ code: card.code, expiresAt: card.expiresAt })
    setEditingCode(null)
    setPreview(false)
    setMode('create')
    setNotice('')
    setRecipient(null)
    setSentTo('')
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' }))
  }

  const editSavedCard = () => {
    const saved = cards.find((card) => card.code === result?.code)
    if (saved?.editable === false) {
      setNotice('Esta tarjeta ya tiene actividad. Para cambiar el premio, crea una nueva.')
      return
    }
    setEditingCode(result.code)
    setResult(null)
    setPreview(false)
    setAutoPreviewArmed(false)
    setNotice('')
    requestAnimationFrame(() => selectedOptionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  const ensureCardAvailable = async (code) => {
    try {
      const { data, error } = await requireSupabase().rpc('studio_flow_get_invitation_card', { p_code: code })
      if (error) throw error
      if (data) return true
      setCards((current) => current.filter((card) => card.code !== code))
      if (result?.code === code) {
        setResult(null)
        setPreview(false)
        setEditingCode(null)
        setMode('saved')
      }
      setNotice('Esta tarjeta ya no está disponible para compartir.')
    } catch {
      setNotice('No pudimos comprobar la tarjeta. Intenta de nuevo.')
    }
    return false
  }

  const copyInvitation = async (code, textToCopy, successMessage) => {
    if (!await ensureCardAvailable(code)) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      setNotice(successMessage)
    } catch {
      setNotice('No pudimos copiar la invitación. Intenta de nuevo.')
    }
  }

  const openCardLink = async (code, destination) => {
    if (await ensureCardAvailable(code)) window.location.assign(destination)
  }

  const share = async () => {
    if (!result || !await ensureCardAvailable(result.code)) return
    const data = { title: `Una invitación de ${businessName || 'Studio Flow'}`, text: invitationMessage(businessName, label, '', benefit === 'pong'), url }
    try {
      if (navigator.share) await navigator.share(data)
      else { await navigator.clipboard.writeText(message); setNotice('Invitación copiada para compartir.') }
    } catch (error) {
      if (error?.name !== 'AbortError') setNotice('No pudimos compartir. Copia el enlace.')
    }
  }

  const shareSaved = async (card) => {
    if (!await ensureCardAvailable(card.code)) return
    const savedOffer = card.benefitType === 'discount' ? `${card.discountPercent}% de descuento`
      : card.benefitType === 'free_service' ? 'un servicio de regalo'
        : card.benefitType === 'referral' ? '50% al traer a una amiga'
          : card.benefitType === 'pong' ? `jugar Pong por ${card.discountPercent || 50}%` : 'conocer mi trabajo'
    const savedUrl = sharePreviewUrl(`${window.location.origin}/invitacion/${card.code}`)
    const savedMessage = invitationMessage(businessName, savedOffer, savedUrl, card.benefitType === 'pong')
    try {
      if (navigator.share) await navigator.share({ title: `Una invitación de ${businessName || 'Studio Flow'}`, text: invitationMessage(businessName, savedOffer, '', card.benefitType === 'pong'), url: savedUrl })
      else { await navigator.clipboard.writeText(savedMessage); setNotice('Invitación copiada para compartir.') }
    } catch (error) {
      if (error?.name !== 'AbortError') setNotice('No pudimos compartir esta invitación.')
    }
  }

  const sendInsideStudioFlow = async () => {
    if (!result?.code || !recipient || sending) return
    setSending(true)
    setNotice('')
    try {
      const { error } = await requireSupabase().rpc('studio_flow_send_invitation_card', {
        p_code: result.code, p_client_id: recipient.id,
      })
      if (error) throw error
      setSentTo(recipient.id)
      setNotice(`Tarjeta enviada a ${recipient.name} dentro de Studio Flow.`)
    } catch (error) { setNotice(error.message || 'No pudimos enviar la tarjeta.') }
    finally { setSending(false) }
  }

  const showWinners = async (card) => {
    if (winnerCardCode === card.code) { setWinnerCardCode(''); return }
    setWinnerCardCode(card.code)
    setCardWinners([])
    setWinnerError('')
    setWinnerLoading(true)
    try {
      const { data, error } = await requireSupabase().rpc('studio_flow_invitation_card_winners', {
        p_code: card.code, p_studio_id: studioId,
      })
      if (error) throw error
      setCardWinners(Array.isArray(data) ? data : [])
    } catch (error) {
      setWinnerError(error.message || 'No pudimos consultar las ganadoras.')
    } finally {
      setWinnerLoading(false)
    }
  }

  const reminderLink = (winner, code) => {
    const phone = String(winner.phone || '').replace(/\D/g, '')
    if (!phone) return ''
    const expiry = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' }).format(new Date(winner.expiresAt))
    const message = `Hola ${winner.name}, soy de ${businessName || 'Studio Flow'}. Ganaste ${winner.discountPercent}% en ${winner.serviceName}. Tu premio está disponible para reservar hasta el ${expiry}. Puedes elegir tu cita aquí: ${sharePreviewUrl(`${window.location.origin}/invitacion/${code}`)}`
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
  }

  const cancelDelete = () => {
    if (deleting) return
    setDeleteTarget(null)
    setDeleteError('')
    requestAnimationFrame(() => deleteTriggerRef.current?.focus())
  }

  const removeCard = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setDeleteError('')
    setNotice('')
    try {
      const { error } = await requireSupabase().rpc('studio_flow_delete_invitation_card', { p_code: deleteTarget.code })
      if (error) throw error
      await refreshCards()
      if (result?.code === deleteTarget.code) {
        setResult(null)
        setPreview(false)
        setEditingCode(null)
        setMode('saved')
      }
      setDeleteTarget(null)
      setNotice('Tarjeta eliminada.')
    } catch (error) {
      setDeleteError(error.message || 'No se pudo eliminar la tarjeta.')
    } finally {
      setDeleting(false)
    }
  }

  return <div className="invitation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="invitation-modal" role="dialog" aria-modal="true" aria-labelledby="invitation-title" inert={deleteTarget ? true : undefined}>
      <div className="invitation-modal-scroll" ref={scrollRef}>
      <header><div><small><Sparkles size={15} /> TU ESTUDIO · TU ESTILO</small><h2 id="invitation-title">Crea algo que quieran abrir</h2></div><button type="button" className="invitation-close" aria-label="Cerrar" onClick={onClose}><X size={23} /></button></header>
      <div className="invitation-modes"><button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Crear</button><button type="button" className={mode === 'saved' ? 'active' : ''} onClick={() => setMode('saved')}>Mis tarjetas</button></div>
      {mode === 'saved' ? <div className="invitation-saved">{cards.length ? cards.map((card) => <Fragment key={card.code}>
        <article><button type="button" className="invitation-saved-name" onClick={() => loadSavedCard(card)}><strong>{card.benefitType === 'discount' ? `${card.discountPercent}% de descuento` : card.benefitType === 'free_service' ? 'Servicio de regalo' : card.benefitType === 'referral' ? 'Ven con una amiga' : card.benefitType === 'pong' ? `Juega por ${card.discountPercent || 50}%` : 'Solo invitar'}</strong><small>{card.benefitType === 'none' ? 'Sin límite de uso' : `Activa · ${card.redemptions}/${card.maxRedemptions} usos`}</small></button><button type="button" onClick={() => shareSaved(card)} title="Compartir invitación" aria-label="Compartir invitación"><Share2 size={18} /></button><button type="button" onClick={() => copyInvitation(card.code, invitationMessage(businessName, 'una invitación especial', sharePreviewUrl(`${window.location.origin}/invitacion/${card.code}`)), 'Invitación copiada.')} title="Copiar invitación" aria-label="Copiar invitación"><Copy size={18} /></button><button type="button" onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setDeleteError(''); setDeleteTarget(card) }} title="Eliminar tarjeta" aria-label="Eliminar tarjeta"><X size={18} /></button></article>
        {card.benefitType === 'pong' && <><button type="button" className="invitation-winners-toggle" onClick={() => showWinners(card)} aria-expanded={winnerCardCode === card.code}><Trophy size={18} /> {winnerCardCode === card.code ? 'Ocultar ganadora' : 'Ver ganadora y premio pendiente'}</button>{winnerCardCode === card.code && <div className="invitation-winners-panel">{winnerLoading ? <p>Buscando el premio...</p> : winnerError ? <p role="alert">{winnerError}</p> : cardWinners.length ? cardWinners.map((winner, index) => { const expired = new Date(winner.expiresAt).getTime() <= Date.now(); const canRemind = winner.claimed && !winner.used && !expired && winner.phone; return <div className="invitation-winner" key={`${card.code}-${index}`}><div><strong>{winner.name}</strong><small>{winner.used ? 'Premio usado' : expired ? 'Premio vencido' : winner.claimed ? 'Pendiente de reservar' : 'Ganó · falta crear su perfil'}</small><span>{winner.discountPercent}% en {winner.serviceName}</span></div>{canRemind && <a href={reminderLink(winner, card.code)} target="_blank" rel="noreferrer">Recordar por WhatsApp</a>}</div> }) : <p>Esta tarjeta aún no tiene ganadora.</p>}</div>}</>}
      </Fragment>) : <p>No tienes tarjetas activas.</p>}</div> : !result && !preview ? <>
        <CardRecipientPicker studioId={studioId} selected={recipient} onSelect={(client) => { setRecipient(client); setSentTo('') }} />
        <div className="invitation-game-heading"><span>01 · ELIGE TU JUGADA</span><strong>¿Qué quieres regalarles hoy?</strong></div>
        <div className="invitation-options" role="group" aria-label="Beneficio de la invitación">
          {options.filter((option) => !editingCode || option.value === benefit).map((option) => <button key={option.value} ref={benefit === option.value ? selectedOptionRef : null} type="button" className={`invitation-option-${option.value}${benefit === option.value ? ' selected' : ''}`} onClick={() => selectBenefit(option.value)}><span className="invitation-option-icon"><option.Icon size={22} /></span><strong>{option.label}</strong><small>{option.detail}</small>{benefit === option.value && <Check className="invitation-option-check" size={17} />}</button>)}
        </div>
        {benefit === 'discount' && <div className="invitation-discount-setup"><span className="invitation-setup-eyebrow">02 · DALE FORMA</span><fieldset className="invitation-discounts"><legend>¿Cuánto quieres regalar?</legend>{[10, 20, 30].map((value) => <label key={value}><input type="radio" name="invitation-discount" checked={discount === value} onChange={() => { setDiscount(value); completeDraft({ discount: value }) }} />{value}%</label>)}</fieldset><label className="invitation-discount-service">¿En qué servicio?<select value={discountServiceId} onChange={(event) => { setDiscountServiceId(event.target.value); completeDraft({ discountServiceId: event.target.value }) }}><option value="">Elige el alcance del descuento</option><option value="all">Cualquier servicio · ella decide</option>{services.filter((service) => Number(service.price) > 0).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><small>El beneficio es personal y se aplica al reservar en Studio Flow.</small></div>}
        {benefit === 'free_service' && <div className="invitation-fields"><label>Servicio que compra<select value={paidServiceId} onChange={(event) => { setPaidServiceId(event.target.value); setFreeServiceId('') }}><option value="">Selecciona un servicio</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · ${Number(service.price).toFixed(2)}</option>)}</select></label><label>Servicio de regalo<select value={freeServiceId} onChange={(event) => { setFreeServiceId(event.target.value); completeDraft({ freeServiceId: event.target.value }) }}><option value="">Selecciona un servicio de menor costo</option>{services.filter((service) => service.id !== paidServiceId && Number(service.price) < Number(services.find((paid) => paid.id === paidServiceId)?.price)).map((service) => <option key={service.id} value={service.id}>{service.name} · ${Number(service.price).toFixed(2)}</option>)}</select></label><small>El regalo se activa cuando completes la cita pagada. Los FlowPoints corresponden solo a esa cita.</small></div>}
        {benefit === 'pong' && <div className="invitation-fields"><label>Servicio del premio<select value={gameServiceId} onChange={(event) => { setGameServiceId(event.target.value); completeDraft({ gameServiceId: event.target.value }) }}><option value="">Selecciona un servicio</option>{services.filter((service) => Number(service.price) > 0).map((service) => <option key={service.id} value={service.id}>{service.name} · ${Number(service.price).toFixed(2)}</option>)}</select></label><fieldset className="invitation-discounts"><legend>Descuento al ganar</legend>{[10, 20, 30, 50].map((value) => <label key={value}><input type="radio" name="pong-discount" checked={gameDiscount === value} onChange={() => { setGameDiscount(value); completeDraft({ gameDiscount: value }) }} />{value}%</label>)}</fieldset><small>Se juega sin cuenta. Al ganar, crea su perfil para conservar el premio y reservar.</small></div>}
        {benefit === 'referral' && <div className="invitation-referral-note"><Gift size={24} /><div><strong>Un regalo para compartir entre dos</strong><p>La clienta crea su perfil, reserva y envía desde la tarjeta un enlace personal a su amiga. Cuando ambas reserven, se activa el 50% para la primera clienta.</p></div></div>}
        <p className="invitation-note">{benefit === 'none' ? 'Tu tarjeta de presentación no vence.' : benefit === 'pong' ? 'El juego abre durante 7 días. Cada ganadora tiene 7 días desde que gana para hacer su reserva.' : benefit === 'free_service' || benefit === 'referral' ? 'Válida por 30 días.' : 'Válida por 7 días.'} La reserva se hace con perfil de clienta dentro de Studio Flow.</p>
      </> : !result ? <div className="invitation-preview-stage">
        <div className="invitation-stage-nav"><button type="button" onClick={onClose}><ArrowLeft size={17} /> Mi negocio</button><button type="button" onClick={editDraft}><Pencil size={16} /> Editar configuración</button></div>
        <div className="invitation-preview"><small>VISTA PREVIA · AÚN NO GUARDADA</small><strong>{businessName || 'Tu espacio de belleza'}</strong><span>{label}</span><small>Servicios · trabajos · redes · reserva</small></div>
        {benefit === 'pong' && <><button type="button" className="invitation-prize-preview" onClick={() => setPreviewPrize((value) => !value)}>{previewPrize ? 'Volver al juego' : 'Ver cómo luce el premio'}</button><PongInvitationGame code="preview" offer={{ discountPercent: gameDiscount, canPlay: true }} serviceName={services.find((service) => service.id === gameServiceId)?.name || 'tu servicio'} isDemo previewWon={previewPrize} /></>}
      </div> : <>
        <div className="invitation-stage-nav"><button type="button" onClick={onClose}><ArrowLeft size={17} /> Mi negocio</button><button type="button" onClick={editSavedCard}><Pencil size={16} /> Editar configuración</button></div>
        <div className="invitation-preview"><small>STUDIO FLOW · INVITACIÓN</small><strong>{businessName || 'Tu espacio de belleza'}</strong><span>{label}</span><small>Servicios · trabajos · redes · reserva</small></div>
        <CardRecipientPicker studioId={studioId} selected={recipient} onSelect={(client) => { setRecipient(client); setSentTo('') }} />
        {recipient && <button type="button" className="invitation-primary" disabled={sending || sentTo === recipient.id} onClick={sendInsideStudioFlow}>{sending ? 'Enviando...' : sentTo === recipient.id ? `Enviada a ${recipient.name}` : `Enviar a ${recipient.name} dentro de Studio Flow`}</button>}
        <div className="invitation-saved-actions"><button type="button" onClick={() => openCardLink(result.code, `https://wa.me/?text=${encodeURIComponent(message)}`)}><Share2 size={20} /> Enviar por WhatsApp</button><button type="button" onClick={() => openCardLink(result.code, reviewUrl)}><ExternalLink size={20} /> Ver tarjeta interactiva</button></div>
        <button type="button" className="invitation-new" onClick={createAnother}>Crear otra tarjeta</button>
      </>}
      {notice && <p role="status" className="invitation-status">{notice}</p>}
      </div>
      {mode === 'create' && <div className="invitation-modal-footer">
        {!result && !preview && <button type="button" className="invitation-primary" onClick={previewCard}>Vista previa</button>}
        {!result && preview && <button type="button" className="invitation-primary" disabled={busy} onClick={save}>{busy ? 'Guardando...' : editingCode ? 'Guardar cambios' : 'Guardar tarjeta'}</button>}
        {result && <div className="invitation-share"><button type="button" className="invitation-primary" onClick={share}><Share2 size={18} /> Compartir tarjeta</button><button type="button" onClick={() => copyInvitation(result.code, url, 'Enlace copiado.')} aria-label="Copiar enlace"><Copy size={19} /></button></div>}
      </div>}
    </section>
    {deleteTarget && <div className="invitation-delete-backdrop" role="presentation"><section className="invitation-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="invitation-delete-title" aria-describedby="invitation-delete-description" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancelDelete() } if (event.key === 'Tab') { const buttons = [deleteCancelRef.current, event.currentTarget.querySelector('.invitation-delete-confirm')]; if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[1]?.focus() } else if (!event.shiftKey && document.activeElement === buttons[1]) { event.preventDefault(); buttons[0]?.focus() } } }}>
      <div className="invitation-delete-symbol"><Trash2 size={26} aria-hidden="true" /></div>
      <span className="invitation-delete-eyebrow">TU INVITACIÓN</span>
      <h2 id="invitation-delete-title">¿Eliminar esta tarjeta?</h2>
      <strong className="invitation-delete-card-name">{deleteTarget.benefitType === 'pong' ? `Juega por ${deleteTarget.discountPercent}%` : deleteTarget.benefitType === 'discount' ? `${deleteTarget.discountPercent}% de descuento` : deleteTarget.benefitType === 'free_service' ? 'Servicio de regalo' : deleteTarget.benefitType === 'referral' ? 'Ven con una amiga' : 'Solo invitar'}</strong>
      <p id="invitation-delete-description">Su enlace dejará de funcionar y no podrás recuperarla. Las reservas y premios ya registrados se conservarán.</p>
      {deleteError && <p className="invitation-delete-error" role="alert">{deleteError}</p>}
      <div className="invitation-delete-actions"><button type="button" ref={deleteCancelRef} disabled={deleting} onClick={cancelDelete}>Conservar tarjeta</button><button type="button" className="invitation-delete-confirm" disabled={deleting} onClick={removeCard}>{deleting ? 'Eliminando...' : 'Eliminar tarjeta'}</button></div>
    </section></div>}
  </div>
}
