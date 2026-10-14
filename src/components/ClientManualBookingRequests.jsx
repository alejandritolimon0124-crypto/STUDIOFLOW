import { useEffect, useState } from 'react'
import { CalendarCheck2, X } from 'lucide-react'
import Button from './Button'
import Card from './Card'
import { requireSupabase } from '../lib/supabaseClient'
import '../styles/client-manual-bookings.css'

function formatBookingDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value))
}

export default function ClientManualBookingRequests() {
  const [requests, setRequests] = useState([])
  const [guestBookings, setGuestBookings] = useState([])
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    let lastRefresh = 0
    async function refresh() {
      if (document.hidden) return
      lastRefresh = Date.now()
      try {
        const [{ data, error }, { data: guestData, error: guestError }] = await Promise.all([
          requireSupabase().rpc('studio_flow_client_pending_manual_bookings'),
          requireSupabase().rpc('studio_flow_client_guest_booking_candidates'),
        ])
        if (error) throw error
        if (guestError) throw guestError
        if (active) { setRequests(data?.requests || []); setGuestBookings(guestData || []) }
      } catch {
        if (active) setMessage('No pudimos cargar tus solicitudes de cita.')
      }
    }
    const refreshOnFocus = () => {
      if (Date.now() - lastRefresh >= 60000) refresh()
    }
    refresh()
    const timer = window.setInterval(refreshOnFocus, 300000)
    window.addEventListener('focus', refreshOnFocus)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refreshOnFocus) }
  }, [])

  async function respond(id, accept) {
    setBusyId(id)
    setMessage('')
    try {
      const { error } = await requireSupabase().rpc('studio_flow_client_respond_manual_booking', {
        p_request_id: id, p_accept: accept,
      })
      if (error) throw error
      setRequests((current) => current.filter((request) => request.id !== id))
      setMessage(accept ? 'Tu cita quedó confirmada en tu perfil.' : 'La cita se canceló y el horario volvió a estar libre.')
      if (accept) window.setTimeout(() => window.location.reload(), 900)
    } catch (error) {
      setMessage(error.message || 'No pudimos actualizar la cita.')
    } finally {
      setBusyId('')
    }
  }

  async function claim(id) {
    setBusyId(id)
    setMessage('')
    try {
      const { error } = await requireSupabase().rpc('studio_flow_client_claim_guest_booking', {
        p_appointment_id: id,
      })
      if (error) throw error
      setGuestBookings((current) => current.filter((booking) => booking.id !== id))
      setMessage('La cita ya forma parte de tu perfil.')
      window.setTimeout(() => window.location.reload(), 900)
    } catch (error) {
      setMessage(error.message || 'No pudimos vincular esta cita.')
    } finally {
      setBusyId('')
    }
  }

  if (!requests.length && !guestBookings.length && !message) return null
  return <Card className="wide-card mobile-screen client-manual-requests">
    <div className="client-manual-requests-title"><CalendarCheck2 size={22} /><div><span>PARA TI</span><h3>¿Pediste esta cita?</h3></div></div>
    {requests.map((request) => <div className="client-manual-request" key={request.id}>
      <strong>{request.studio}</strong>
      <span>{request.service} · {formatBookingDate(request.startsAt)}</span>
      <small>Confirma antes del {formatBookingDate(request.expiresAt)} para conservar este horario.</small>
      <div className="client-manual-request-actions">
        <Button disabled={busyId === request.id} onClick={() => respond(request.id, true)}><CalendarCheck2 size={17} /> Sí, confirmar</Button>
        <Button disabled={busyId === request.id} variant="ghost" onClick={() => respond(request.id, false)}><X size={17} /> No la solicité</Button>
      </div>
    </div>)}
    {guestBookings.map((booking) => <div className="client-manual-request" key={booking.id}>
      <strong>¿Esta cita de invitada es tuya?</strong>
      <span>{booking.studio} · {booking.service} · {formatBookingDate(booking.startsAt)}</span>
      <div className="client-manual-request-actions"><Button disabled={busyId === booking.id} onClick={() => claim(booking.id)}>Sí, agregar a mi perfil</Button></div>
    </div>)}
    {message && <p role="status">{message}</p>}
  </Card>
}
