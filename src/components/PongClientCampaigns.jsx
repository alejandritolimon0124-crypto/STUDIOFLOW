import { useEffect, useState } from 'react'
import { CalendarDays, Gamepad2 } from 'lucide-react'
import { requireSupabase } from '../lib/supabaseClient'
import './pong-client-campaigns.css'

const localDateTime = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const formatDate = (value) => new Intl.DateTimeFormat('es-MX', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City',
}).format(new Date(value))

export default function PongClientCampaigns({ studioId }) {
  const [services, setServices] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [serviceId, setServiceId] = useState('')
  const [discount, setDiscount] = useState(20)
  const [startsAt, setStartsAt] = useState(() => localDateTime(new Date(Date.now() + 5 * 60000)))
  const [endsAt, setEndsAt] = useState(() => localDateTime(new Date(Date.now() + 24 * 3600000)))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [cancelId, setCancelId] = useState('')

  const refresh = async () => {
    const [{ data: serviceData, error: serviceError }, { data: campaignData, error: campaignError }] = await Promise.all([
      requireSupabase().rpc('studio_flow_get_invitation_services', { p_studio_id: studioId }),
      requireSupabase().rpc('studio_flow_list_pong_client_campaigns', { p_studio_id: studioId }),
    ])
    if (serviceError || campaignError) throw serviceError || campaignError
    setServices((serviceData || []).filter((service) => Number(service.price) > 0))
    setCampaigns(campaignData || [])
  }
  useEffect(() => {
    let active = true
    Promise.all([
      requireSupabase().rpc('studio_flow_get_invitation_services', { p_studio_id: studioId }),
      requireSupabase().rpc('studio_flow_list_pong_client_campaigns', { p_studio_id: studioId }),
    ]).then(([servicesResult, campaignsResult]) => {
      if (servicesResult.error || campaignsResult.error) throw servicesResult.error || campaignsResult.error
      if (active) {
        setServices((servicesResult.data || []).filter((service) => Number(service.price) > 0))
        setCampaigns(campaignsResult.data || [])
      }
    }).catch(() => { if (active) setMessage('No se pudieron cargar las campañas de juego.') })
    return () => { active = false }
  }, [studioId])

  const create = async (event) => {
    event.preventDefault()
    if (!serviceId || !startsAt || !endsAt) return
    const start = new Date(startsAt)
    const end = new Date(endsAt)
    if (end <= start || end.getTime() - start.getTime() > 7 * 86400000) {
      setMessage('La campaña debe durar entre unas horas y 7 días.'); return
    }
    setBusy(true)
    setMessage('')
    try {
      const { error } = await requireSupabase().rpc('studio_flow_create_pong_client_campaign', {
        p_studio_id: studioId, p_service_id: serviceId, p_discount_percent: discount,
        p_starts_at: start.toISOString(), p_ends_at: end.toISOString(),
      })
      if (error) throw error
      await refresh()
      setMessage('Campaña programada. Cada clienta atendida recibirá su propio reto dentro de Studio Flow al comenzar.')
    } catch (failure) { setMessage(failure.message || 'No se pudo crear la campaña.') }
    finally { setBusy(false) }
  }

  const cancel = async (id) => {
    setBusy(true)
    try {
      const { error } = await requireSupabase().rpc('studio_flow_cancel_pong_client_campaign', { p_campaign_id: id })
      if (error) throw error
      await refresh()
      setMessage('Campaña detenida. Los premios ya ganados se conservan.')
      setCancelId('')
    } catch (failure) { setMessage(failure.message || 'No pudimos detener la campaña.') }
    finally { setBusy(false) }
  }

  return <section className="pong-client-campaigns">
    <div className="pong-campaign-intro"><Gamepad2 size={28} /><div><span>JUEGA Y GANA</span><h3>Un reto para tus clientas</h3><p>Una tarjeta Pong por clienta atendida. Cada reto tiene una sola ganadora.</p></div></div>
    <form onSubmit={create}>
      <label>Servicio del premio<select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Elige un servicio</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
      <fieldset><legend>Descuento al ganar</legend>{[10, 20, 30, 50].map((value) => <label key={value}><input type="radio" name="pong-campaign-discount" checked={discount === value} onChange={() => setDiscount(value)} />{value}%</label>)}</fieldset>
      <div className="pong-campaign-dates"><label>Comienza<input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label>Termina<input type="datetime-local" required value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div>
      <p><CalendarDays size={17} /> El juego abre solo durante ese periodo. Quien gane tiene 7 días para reservar.</p>
      <button type="submit" disabled={busy || !services.length}>{busy ? 'Preparando retos...' : 'Crear campaña de Pong'}</button>
    </form>
    {message && <p role="status" className="pong-campaign-message">{message}</p>}
    {campaigns.length > 0 && <div className="pong-campaign-history"><strong>Campañas recientes</strong>{campaigns.map((campaign) => <article key={campaign.id}><div><b>{campaign.discountPercent}% en {campaign.serviceName}</b><small>{formatDate(campaign.startsAt)} – {formatDate(campaign.endsAt)}</small><small>{campaign.cancelledAt ? 'Detenida' : new Date(campaign.endsAt) <= new Date() ? 'Finalizada' : 'Programada o activa'}</small></div><div className="pong-campaign-actions"><span>{campaign.sentCount} {campaign.sentCount === 1 ? 'reto enviado' : 'retos enviados'}</span>{!campaign.cancelledAt && new Date(campaign.endsAt) > new Date() && (cancelId === campaign.id ? <><button type="button" disabled={busy} onClick={() => cancel(campaign.id)}>Confirmar detener</button><button type="button" onClick={() => setCancelId('')}>Volver</button></> : <button type="button" onClick={() => setCancelId(campaign.id)}>Detener campaña</button>)}</div></article>)}</div>}
  </section>
}
