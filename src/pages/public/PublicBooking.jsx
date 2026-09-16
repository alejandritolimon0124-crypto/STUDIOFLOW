import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import studioFlowLogo from '../../assets/studioflowlogo2.png'
import { fetchPublicBookingAvailability, fetchPublicBookingListings, createPublicGoogleReservation } from '../../services/publicBookingService'
import '../../styles/global.css'

const today = new Date().toISOString().slice(0, 10)

export default function PublicBooking() {
  const { slug, serviceSlug } = useParams()
  const [listings, setListings] = useState([])
  const [listingId, setListingId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState(today)
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [message, setMessage] = useState('')
  const listing = listings.find((item) => (item.listingId || item.id) === listingId)
  const services = useMemo(() => listing?.services?.length ? listing.services : listing?.marketplaceServices || [], [listing])
  const serviceOptions = Array.isArray(services) ? services : listing?.marketplaceServiceOptions || []

  useEffect(() => {
    fetchPublicBookingListings().then((items) => {
      setListings(items)
      const normalizedSlug = String(slug || '').toLowerCase()
      const match = items.find((item) => String(item.title || item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') .replace(/(^-|-$)/g, '') === normalizedSlug)
      if (match || (!slug && items[0])) {
        const selected = match || items[0]
        setListingId(selected.listingId || selected.id)
        const options = Array.isArray(selected.services) ? selected.services : selected.marketplaceServiceOptions || []
        const serviceMatch = options.find((item) => String(item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') .replace(/(^-|-$)/g, '') === String(serviceSlug || '').toLowerCase())
        if (serviceMatch) setServiceId(serviceMatch.id)
        else if (!serviceSlug && options.length === 1) setServiceId(options[0].id)
      } else if (slug) setMessage('No encontramos un perfil publicado con este enlace.')
    }).catch((error) => setMessage(error.message))
  }, [slug])
  useEffect(() => { if (!listingId || !serviceId || !date) return; fetchPublicBookingAvailability({ listingId, serviceOfferingId: serviceId, date }).then((data) => setSlots(data.slots || [])).catch((error) => setMessage(error.message)) }, [listingId, serviceId, date])

  const reserve = async (event) => {
    event.preventDefault(); setMessage('')
    if (!selectedSlot) return setMessage('Selecciona un horario disponible.')
    try { const result = await createPublicGoogleReservation({ ...form, listingId, slotIds: selectedSlot.availabilitySlotIds?.length ? selectedSlot.availabilitySlotIds : [selectedSlot.availabilitySlotId || selectedSlot.id], serviceOfferingId: serviceId }); setMessage(`Cita reservada para el ${result.date} a las ${result.time}. El negocio ya puede verla en su agenda.`); setSlots((items) => items.filter((slot) => slot.id !== selectedSlot.id)); setSelectedSlot(null) } catch (error) { setMessage(error.message || 'No se pudo reservar.') }
  }
  const location = listing?.profile?.professionalLocation || listing?.studio?.profile || {}
  const address = [location.addressLine || location.address_line, location.city, location.state].filter(Boolean).join(', ')
  const phone = listing?.phone || listing?.profile?.contactLinks?.whatsapp || listing?.studio?.profile?.phone || ''
  const profilePhoto = listing?.photoUrl || listing?.profile?.photoUrl || listing?.profile?.photo_path || listing?.studio?.profile?.logoPath || ''
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : ''
  const businessInitials = String(listing?.title || listing?.name || 'Studio Flow').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  return <main className="public-booking-page"><section className="public-booking-shell"><img className="public-booking-logo" src={studioFlowLogo} alt="Studio Flow" /><h1>Reserva tu cita</h1>
    <aside className="public-registration-invite"><div><strong>Haz que cada cita te dé beneficios</strong><p>Regístrate en Studio Flow y comienza a acumular Flow Points desde tus próximas citas. Descubre promociones y descuentos exclusivos, guarda tus favoritos y administra fácilmente todas tus reservas.</p></div><Link className="button button-primary" to="/register">Regístrate aquí</Link><small>¿Solo quieres reservar? Continúa abajo sin crear una cuenta.</small></aside>
    {listing && <article className="public-business-card"><div className="public-business-identity">{profilePhoto ? <img src={profilePhoto} alt={`Foto de ${listing.name || listing.title}`} /> : <div className="public-business-placeholder">{businessInitials}</div>}<div><h2>{listing.title || listing.name}</h2><p>{listing.specialties?.join?.(' · ') || listing.profile?.primarySpecialty || 'Servicios profesionales'}</p></div></div><div className="public-business-details">{address && <span>{address}</span>}{phone && <a href={`tel:${phone}`}>{phone}</a>}{mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer">Cómo llegar</a>}</div></article>}
    {serviceOptions.length > 1 && <label className="input-field"><span>Servicio</span><select value={serviceId} onChange={(e) => setServiceId(e.target.value)}><option value="">Selecciona un servicio</option>{serviceOptions.map((item) => <option key={item.id} value={item.id}>{item.name} {item.priceAmount ? `- $${item.priceAmount}` : ''}</option>)}</select></label>}
    <label className="input-field"><span>Fecha</span><input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
    <div className="public-slot-list public-slot-grid">{slots.length ? slots.map((slot) => <button type="button" key={slot.id} className={`public-slot-button${selectedSlot?.id === slot.id ? ' selected' : ''}`} onClick={() => setSelectedSlot(slot)}><strong>{slot.time}</strong><span>{slot.end}</span><small>Reserva Google</small></button>) : <p>Selecciona un servicio para consultar horarios.</p>}</div>
    <form className="public-booking-form" onSubmit={reserve}><h2>Datos para confirmar</h2>{['name','email','phone'].map((field) => <label className="input-field" key={field}><span>{field === 'name' ? 'Nombre completo' : field === 'email' ? 'Correo electrónico' : 'Celular'}</span><input required type={field === 'email' ? 'email' : 'text'} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} /></label>)}<button className="button button-primary" type="submit">Confirmar reserva</button></form>
    {message && <div className="list-row elevated-row"><strong>{message}</strong></div>}
  </section></main>
}
