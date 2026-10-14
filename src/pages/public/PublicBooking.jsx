import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CalendarDays, Clock3, Gift, MapPin, Phone, ShieldCheck, UserRound } from 'lucide-react'
import studioFlowLogo from '../../assets/studioflowlogo2.png'
import { fetchPublicBookingAvailability, fetchPublicBookingListings, createPublicGoogleReservation } from '../../services/publicBookingService'
import { bookingSlug } from '../../utils/publicBookingLinks'
import { depositAmount, fetchDepositPolicy, formatPayment } from '../../services/depositService'
import '../../styles/appointment-deposits.css'
import '../../styles/global.css'

const today = new Date().toISOString().slice(0, 10)

export default function PublicBooking() {
  const { slug, serviceSlug } = useParams()
  const [searchParams] = useSearchParams()
  const requestedListingId = searchParams.get('perfil')
  const bookingSource = ['instagram', 'facebook'].includes(searchParams.get('origen')) ? searchParams.get('origen') : 'google'
  const [listings, setListings] = useState([])
  const [listingLoadState, setListingLoadState] = useState('loading')
  const [listingRetry, setListingRetry] = useState(0)
  const [listingId, setListingId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState(today)
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [message, setMessage] = useState('')
  const [depositPolicyResult, setDepositPolicyResult] = useState({ serviceId: '', policy: {}, error: '' })
  const [depositAccepted, setDepositAccepted] = useState(false)
  const confirmationFormRef = useRef(null)
  const listing = listings.find((item) => (item.listingId || item.id) === listingId)
  const services = useMemo(() => listing?.services?.length ? listing.services : listing?.marketplaceServices || [], [listing])
  const serviceOptions = Array.isArray(services) ? services : listing?.marketplaceServiceOptions || []
  const selectedService = serviceOptions.find((item) => item.id === serviceId)
  const selectedPrice = Number(selectedService?.priceAmount ?? selectedService?.price_amount ?? selectedService?.price ?? 0)
  const depositPolicyLoading = Boolean(serviceId && depositPolicyResult.serviceId !== serviceId)
  const depositPolicy = depositPolicyLoading ? {} : depositPolicyResult.policy
  const depositPolicyError = depositPolicyLoading ? '' : depositPolicyResult.error

  useEffect(() => {
    if (!serviceId) return undefined
    let active = true
    fetchDepositPolicy(serviceId).then((policy) => { if (active) setDepositPolicyResult({ serviceId, policy, error: '' }) })
      .catch((error) => { if (active) setDepositPolicyResult({ serviceId, policy: {}, error: error.message || 'No se pudo consultar la política de anticipo.' }) })
    return () => { active = false }
  }, [serviceId])

  useEffect(() => {
    let active = true
    fetchPublicBookingListings().then((items) => {
      if (!active) return
      setListings(items)
      const normalizedSlug = String(slug || '').toLowerCase()
      const match = requestedListingId
        ? items.find((item) => (item.listingId || item.id) === requestedListingId)
        : items.find((item) => [item.title, item.name, item.artistName].some((name) => bookingSlug(name) === normalizedSlug))
      if (match || (!slug && items[0])) {
        const selected = match || items[0]
        setListingId(selected.listingId || selected.id)
        const options = Array.isArray(selected.services) ? selected.services : selected.marketplaceServiceOptions || []
        const serviceMatch = options.find((item) => bookingSlug(item.name) === String(serviceSlug || '').toLowerCase())
        if (serviceMatch) setServiceId(serviceMatch.id)
        else if (!serviceSlug && options.length === 1) setServiceId(options[0].id)
        setListingLoadState('loaded')
      } else {
        setListingLoadState('not-found')
      }
    }).catch(() => { if (active) setListingLoadState('error') })
    return () => { active = false }
  }, [slug, serviceSlug, requestedListingId, listingRetry])
  useEffect(() => { if (!listingId || !serviceId || !date) return; fetchPublicBookingAvailability({ listingId, serviceOfferingId: serviceId, date }).then((data) => setSlots(data.slots || [])).catch((error) => setMessage(error.message)) }, [listingId, serviceId, date])

  const reserve = async (event) => {
    event.preventDefault(); setMessage('')
    if (!selectedSlot) return setMessage('Selecciona un horario disponible.')
    if (depositPolicyLoading) return setMessage('Espera un momento mientras consultamos las condiciones de pago.')
    if (depositPolicyError) return setMessage(depositPolicyError)
    if (depositPolicy.enabled && !depositAccepted) return setMessage('Confirma que conoces el anticipo para continuar.')
    try { const result = await createPublicGoogleReservation({ ...form, bookingSource, listingId, slotIds: selectedSlot.availabilitySlotIds?.length ? selectedSlot.availabilitySlotIds : [selectedSlot.availabilitySlotId || selectedSlot.id], serviceOfferingId: serviceId }); setMessage(depositPolicy.enabled ? `Cita solicitada para el ${result.date} a las ${result.time}. El negocio te compartirá los datos del anticipo; quedará confirmada cuando verifique el pago.` : `Cita reservada para el ${result.date} a las ${result.time}. El negocio ya puede verla en su agenda.`); setSlots((items) => items.filter((slot) => slot.id !== selectedSlot.id)); setSelectedSlot(null) } catch (error) { setMessage(error.message || 'No se pudo reservar.') }
  }
  const location = listing?.profile?.professionalLocation || listing?.studio?.profile || {}
  const address = [location.addressLine || location.address_line, location.city, location.state].filter(Boolean).join(', ')
  const phone = listing?.phone || listing?.profile?.contactLinks?.whatsapp || listing?.studio?.profile?.phone || ''
  const profilePhoto = listing?.photoUrl || listing?.profile?.photoUrl || listing?.profile?.photo_path || listing?.studio?.profile?.logoPath || ''
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : ''
  const businessInitials = String(listing?.title || listing?.name || 'Studio Flow').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  return (
    <main className="public-booking-page">
      <section className="public-booking-shell">
        <header className="public-booking-brand">
          <img className="public-booking-logo" src={studioFlowLogo} alt="Studio Flow" />
          {listing && (
            <div className="public-business-card">
              <div className="public-business-identity">
                {profilePhoto
                  ? <img src={profilePhoto} alt={`Foto de ${listing.name || listing.title}`} />
                  : <div className="public-business-placeholder">{businessInitials}</div>}
                <div>
                  <span>RESERVA CON</span>
                  <h1>{listing.title || listing.name}</h1>
                  <p>{listing.specialties?.join?.(' · ') || listing.profile?.primarySpecialty || 'Experiencias profesionales de belleza'}</p>
                </div>
              </div>
              <div className="public-business-details">
                {address && <span><MapPin size={16} aria-hidden="true" /> {address}</span>}
                {phone && <a href={`tel:${phone}`}><Phone size={16} aria-hidden="true" /> {phone}</a>}
                {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer">Cómo llegar</a>}
              </div>
            </div>
          )}
        </header>

        <nav className="public-booking-progress" aria-label="Pasos para reservar">
          <span className={serviceId ? 'is-complete' : 'is-active'}><b>1</b> Servicio</span>
          <span className={selectedSlot ? 'is-complete' : serviceId ? 'is-active' : ''}><b>2</b> Horario</span>
          <span className={selectedSlot ? 'is-active' : ''}><b>3</b> Tus datos</span>
        </nav>

        <section className="public-booking-step public-booking-service-step">
          <header><span>01</span><div><small>ELIGE TU EXPERIENCIA</small><h2>¿Qué quieres reservar?</h2></div></header>
          {listingLoadState === 'loading' && <p role="status">Cargando servicios disponibles...</p>}
          {listingLoadState === 'error' && (
            <button type="button" onClick={() => {
              setListingLoadState('loading')
              setListingRetry((value) => value + 1)
            }}>No se pudieron cargar los servicios. Reintentar</button>
          )}
          {listingLoadState === 'not-found' && <p role="alert">Este enlace ya no corresponde a un perfil publicado. Solicita un enlace actualizado al negocio.</p>}
          {listingLoadState === 'loaded' && serviceOptions.length === 0 && <p role="status">Este negocio aún no tiene servicios disponibles para reservar.</p>}
          {serviceOptions.length > 1 && (
            <label className="input-field">
              <span>Selecciona un servicio de la lista para ver precios</span>
              <select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setSelectedSlot(null); setDepositAccepted(false) }}>
                <option value="">Selecciona un servicio</option>
                {serviceOptions.map((item) => <option key={item.id} value={item.id}>{item.name} {item.priceAmount ? `- $${item.priceAmount}` : ''}</option>)}
              </select>
            </label>
          )}
          {listing && serviceOptions.length > 0 && <label className="input-field public-date-field">
            <span><CalendarDays size={16} aria-hidden="true" /> Elige la fecha</span>
            <input type="date" min={today} value={date} onChange={(e) => { setDate(e.target.value); setSelectedSlot(null) }} />
          </label>}
        </section>

        {serviceId && (
          <section className="public-booking-step public-booking-time-step">
            <header><span>02</span><div><small>ENCUENTRA TU MOMENTO</small><h2>Horarios disponibles</h2></div></header>
            <div className="public-slot-list public-slot-grid">
              {slots.length ? (selectedSlot ? [selectedSlot] : slots).map((slot) => (
                <button
                  type="button"
                  key={slot.id}
                  className={`public-slot-button${selectedSlot?.id === slot.id ? ' selected' : ''}`}
                  onClick={() => {
                    setSelectedSlot(slot)
                    window.setTimeout(() => confirmationFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
                  }}
                >
                  <Clock3 size={17} aria-hidden="true" />
                  <strong>{slot.time}</strong>
                  <small>{selectedSlot?.id === slot.id ? 'Tu horario' : 'Disponible'}</small>
                </button>
              )) : <p className="public-empty-slots">No hay horarios libres en esta fecha. Prueba con otro día.</p>}
            </div>
          </section>
        )}

        {selectedSlot && (
          <form ref={confirmationFormRef} className="public-booking-form" onSubmit={reserve}>
            <header><span>03</span><div><small>CASI LISTO</small><h2>¿A nombre de quién?</h2><p>Usaremos estos datos únicamente para confirmar tu cita.</p></div></header>
            {depositPolicy.enabled && <div className="booking-deposit-notice"><strong>Este negocio solicita anticipo para confirmar tu cita</strong><span>{selectedPrice > 0 ? `${formatPayment(depositAmount(selectedPrice, depositPolicy))} de anticipo · ${formatPayment(Math.max(0, selectedPrice - depositAmount(selectedPrice, depositPolicy)))} al finalizar` : `${depositPolicy.kind === 'percent' ? `${depositPolicy.value}%` : formatPayment(depositPolicy.value)} del total`}</span><small>Se transfiere directamente al negocio. Después de reservar tendrás su tarjeta de pago.</small>{depositPolicy.terms && <small>{depositPolicy.terms}</small>}<label className="booking-deposit-consent"><input type="checkbox" checked={depositAccepted} onChange={(event) => setDepositAccepted(event.target.checked)} /> Entiendo que mi cita quedará pendiente hasta que el negocio confirme el anticipo.</label></div>}
            {['name', 'email', 'phone'].map((field) => (
              <label className="input-field" key={field}>
                <span>{field === 'name' ? 'Nombre completo' : field === 'email' ? 'Correo electrónico' : 'Celular'}</span>
                <input required type={field === 'email' ? 'email' : 'text'} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
              </label>
            ))}
            <button className="button button-primary" type="submit" disabled={depositPolicyLoading || Boolean(depositPolicyError) || (depositPolicy.enabled && !depositAccepted)}><CalendarDays size={18} aria-hidden="true" /> {depositPolicy.enabled ? 'Solicitar cita con anticipo' : 'Confirmar mi reserva'}</button>
            {depositPolicyError && <small role="alert">{depositPolicyError}</small>}
            <small className="public-booking-privacy"><ShieldCheck size={15} aria-hidden="true" /> Tu información está protegida por Studio Flow.</small>
          </form>
        )}

        <aside className="public-registration-invite">
          <Gift size={30} aria-hidden="true" />
          <div><span>QUE CADA VISITA CUENTE</span><strong>Convierte tus citas en beneficios</strong><p>Únete gratis, acumula Flow Points, descubre promociones y guarda tus lugares favoritos.</p></div>
          <Link className="button button-primary" to="/register"><UserRound size={17} aria-hidden="true" /> Crear mi perfil</Link>
          <small>Tu reserva también funciona sin registrarte.</small>
        </aside>

        {message && <div className="public-booking-message" role="status"><strong>{message}</strong></div>}
      </section>
    </main>
  )
}
