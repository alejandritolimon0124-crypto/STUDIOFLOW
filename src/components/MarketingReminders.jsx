import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requireSupabase } from '../lib/supabaseClient'
import { maintenanceBookingUrl } from '../utils/maintenanceBooking'
import Button from './Button'
import Card from './Card'
import PanelHeader from './PanelHeader'
import { Plus, X } from 'lucide-react'
import BirthdayCardView from './BirthdayCardView'
import PongClientCampaigns from './PongClientCampaigns'

export function MarketingReminderSettings({ artistId, studioId }) {
  const rpc = studioId ? 'studio_flow_studio_marketing_reminder_settings' : 'studio_flow_marketing_reminder_settings'
  const params = useMemo(() => studioId ? { p_studio_id: studioId } : { p_artist_id: artistId }, [artistId, studioId])
  const [settings, setSettings] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [birthdayCard, setBirthdayCard] = useState(null)
  const [birthdayPreview, setBirthdayPreview] = useState(false)
  const [birthdayBusy, setBirthdayBusy] = useState(false)
  useEffect(() => {
    let active = true
    requireSupabase().rpc(rpc, params)
      .then(({ data, error }) => {
        if (!active) return
        if (error) setMessage('No se pudieron cargar los recordatorios.')
        else setSettings(data)
      })
      .catch(() => { if (active) setMessage('No se pudieron cargar los recordatorios.') })
    return () => { active = false }
  }, [params, rpc])
  useEffect(() => {
    let active = true
    requireSupabase().rpc('studio_flow_birthday_message', { p_studio_id: studioId || null })
      .then(({ data, error }) => { if (error) throw error; if (active) setBirthdayCard(data) })
      .catch(() => { if (active) setMessage('No se pudo cargar la felicitación de cumpleaños.') })
    return () => { active = false }
  }, [studioId, artistId])
  async function saveBirthday() {
    if (!birthdayCard) return
    setBirthdayBusy(true)
    try {
      const { data, error } = await requireSupabase().rpc('studio_flow_birthday_message', {
        p_studio_id: studioId || null, p_message: birthdayCard.message, p_save: true,
      })
      if (error) throw error
      setBirthdayCard(data)
      setMessage('Felicitación guardada para los próximos cumpleaños.')
    } catch (error) { setMessage(error.message || 'No se pudo guardar la felicitación.') }
    finally { setBirthdayBusy(false) }
  }
  async function save() {
    setBusy(true)
    try {
      const { data, error } = await requireSupabase().rpc(rpc, { ...params, p_settings: settings })
      if (error) throw error
      setSettings(data)
      setMessage('Recordatorios guardados.')
    } catch { setMessage('No se pudieron guardar. Intenta nuevamente.') }
    finally { setBusy(false) }
  }
  const services = settings?.services || []
  const rules = settings?.maintenanceRules || []
  const availableService = services.find((service) => !rules.some((rule) => rule.serviceOfferingId === service.id))
  const addRule = () => {
    if (!availableService) return
    setSettings((current) => ({ ...current, maintenanceRules: [...(current.maintenanceRules || []), { serviceOfferingId: availableService.id, days: 14 }] }))
    setMessage('')
  }
  const updateRule = (index, changes) => {
    setSettings((current) => ({ ...current, maintenanceRules: current.maintenanceRules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...changes } : rule) }))
    setMessage('')
  }
  const removeRule = (index) => {
    setSettings((current) => ({ ...current, maintenanceRules: current.maintenanceRules.filter((_, ruleIndex) => ruleIndex !== index) }))
    setMessage('')
  }
  return <Card className="wide-card mobile-screen primary-panel">
    <PanelHeader title="Marketing inteligente" eyebrow="Solo clientas atendidas" />
    {settings && <>
      <div className="compact-list">
        {[
          ['birthday', 'Recordatorio de cumpleaños'],
          ['reactivation', 'Reactivación después de 30 días'],
        ].map(([key, label]) => <label className="toggle-row" key={key} style={{ padding: '12px 0', gap: 12 }}>
          <input type="checkbox" disabled={busy} checked={settings[key]} onChange={e => setSettings({ ...settings, [key]: e.target.checked })} />
          <span>{label}</span>
        </label>)}
      </div>
      {birthdayCard && <section className="birthday-message-settings">
        <div><strong>Una felicitación que se siente personal</strong><small>Se crea automáticamente el día de su cumpleaños cuando el recordatorio está activo.</small></div>
        <label>Tu mensaje<textarea rows={6} maxLength={700} value={birthdayCard.message || ''} onChange={(event) => setBirthdayCard((current) => ({ ...current, message: event.target.value }))} /></label>
        <div className="birthday-message-actions"><button type="button" onClick={() => setBirthdayPreview(true)}>Ver tarjeta de cumpleaños</button><button type="button" disabled={birthdayBusy || (birthdayCard.message || '').trim().length < 50} onClick={saveBirthday}>{birthdayBusy ? 'Guardando...' : 'Guardar felicitación'}</button></div>
      </section>}
      <PongClientCampaigns studioId={studioId || null} />
      <div className="maintenance-settings">
        <div className="maintenance-settings-head"><div><strong>Mantenimiento por servicio</strong><small>Un aviso después de la última visita de cada servicio.</small></div>{availableService && <button type="button" disabled={busy} onClick={addRule}><Plus size={17} /> Agregar recordatorio</button>}</div>
        {!services.length && <p>Activa un servicio para poder programar su mantenimiento.</p>}
        {rules.map((rule, index) => <div className="maintenance-rule" key={rule.serviceOfferingId}>
          <label>Servicio<select disabled={busy} value={rule.serviceOfferingId} onChange={(event) => updateRule(index, { serviceOfferingId: event.target.value })}>{services.map((service) => <option key={service.id} value={service.id} disabled={rules.some((other, otherIndex) => otherIndex !== index && other.serviceOfferingId === service.id)}>{service.name}</option>)}</select></label>
          <label>Enviar después de<select disabled={busy} value={rule.days} onChange={(event) => updateRule(index, { days: Number(event.target.value) })}>{[7, 14, 21, 30].map((days) => <option key={days} value={days}>{days} días</option>)}</select></label>
          <button type="button" disabled={busy} className="maintenance-rule-remove" onClick={() => removeRule(index)} title="Quitar recordatorio" aria-label={`Quitar recordatorio de ${services.find((service) => service.id === rule.serviceOfferingId)?.name || 'servicio'}`}><X size={18} /></button>
        </div>)}
      </div>
      <Button disabled={busy} onClick={save}>{busy ? 'Guardando...' : 'Guardar recordatorios'}</Button>
    </>}
    {!settings && !message && <p>Cargando recordatorios...</p>}
    {message && <p role="status">{message}</p>}
    {birthdayPreview && birthdayCard && <div className="birthday-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBirthdayPreview(false) }}><div role="dialog" aria-modal="true" aria-label="Vista previa de felicitación de cumpleaños"><button type="button" className="birthday-preview-close" onClick={() => setBirthdayPreview(false)} aria-label="Cerrar vista previa"><X size={22} /></button><BirthdayCardView clientName="María" businessName={birthdayCard.businessName} message={birthdayCard.message} phone={birthdayCard.phone} preview /></div></div>}
  </Card>
}

export function ClientMarketingNotices() {
  const navigate = useNavigate()
  const [notices, setNotices] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let lastRefresh = 0
    async function refresh() {
      if (document.hidden) return
      lastRefresh = Date.now()
      try {
        const { data, error: failure } = await requireSupabase().rpc('studio_flow_client_get_notifications')
        if (failure) throw failure
        if (active) { setNotices(data.notifications || []); setError('') }
      } catch (failure) { if (active) setError(failure.message || 'No se pudieron cargar tus avisos. Volveremos a intentar.') }
    }
    const refreshOnFocus = () => {
      if (Date.now() - lastRefresh >= 60000) refresh()
    }
    refresh()
    const timer = window.setInterval(refreshOnFocus, 300000)
    window.addEventListener('focus', refreshOnFocus)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refreshOnFocus) }
  }, [])
  async function markRead(id) {
    try {
      const { error: failure } = await requireSupabase().rpc('studio_flow_client_read_marketing_notice', { p_id: id })
      if (failure) throw failure
      setNotices(current => current.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    } catch { setError('No se pudo marcar el aviso como leído.') }
  }
  async function openNotice(notice) {
    await markRead(notice.id)
    if (notice.target_url?.startsWith('/')) window.location.assign(notice.target_url)
  }
  const unread = notices.filter(n => !n.read_at)
  if (!unread.length && !error) return null
  return <Card className="wide-card mobile-screen">
    <PanelHeader title="Avisos para ti" eyebrow="Studio Flow" />
    {error && <p role="status">{error}</p>}
    <div className="compact-list">
      {unread.map(n => <article className="list-row" key={n.id}>
        <div><strong>{n.title}</strong><p>{n.body}</p></div>
        {n.target_url ? <Button variant="ghost" size="sm" onClick={() => openNotice(n)}>{n.target_url.startsWith('/felicitacion/') ? 'Ver mi felicitación' : n.target_url.startsWith('/invitacion/') ? 'Abrir tarjeta' : 'Ver campaña'}</Button> : String(n.title || '').toLowerCase().startsWith('tu proximo mantenimiento:') ? (
          <div className="maintenance-notice-actions">
            <Button size="sm" onClick={() => navigate(maintenanceBookingUrl(n))}>Agendar ahora</Button>
            <Button variant="ghost" size="sm" onClick={() => markRead(n.id)}>Marcar leído</Button>
          </div>
        ) : <Button variant="ghost" size="sm" onClick={() => markRead(n.id)}>Marcar leído</Button>}
      </article>)}
    </div>
  </Card>
}
