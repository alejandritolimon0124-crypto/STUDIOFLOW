import { useEffect, useState } from 'react'
import { requireSupabase } from '../lib/supabaseClient'
import Button from './Button'
import Card from './Card'
import PanelHeader from './PanelHeader'

export function MarketingReminderSettings({ artistId }) {
  const [settings, setSettings] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    requireSupabase().rpc('studio_flow_marketing_reminder_settings', { p_artist_id: artistId })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setMessage('No se pudieron cargar los recordatorios.')
        else setSettings(data)
      })
      .catch(() => { if (active) setMessage('No se pudieron cargar los recordatorios.') })
    return () => { active = false }
  }, [artistId])
  async function save() {
    setBusy(true)
    try {
      const { data, error } = await requireSupabase().rpc('studio_flow_marketing_reminder_settings', {
        p_artist_id: artistId, p_settings: settings,
      })
      if (error) throw error
      setSettings(data)
      setMessage('Recordatorios guardados.')
    } catch { setMessage('No se pudieron guardar. Intenta nuevamente.') }
    finally { setBusy(false) }
  }
  return <Card className="wide-card mobile-screen primary-panel">
    <PanelHeader title="Marketing inteligente" eyebrow="Solo clientas atendidas" />
    {settings && <>
      <div className="compact-list">
        {[
          ['birthday', 'Recordatorio de cumpleaños'],
          ['reactivation', 'Reactivación después de 30 días'],
          ['maintenance', 'Recordatorio de mantenimiento'],
        ].map(([key, label]) => <label className="toggle-row" key={key} style={{ padding: '12px 0', gap: 12 }}>
          <input type="checkbox" disabled={busy} checked={settings[key]} onChange={e => setSettings({ ...settings, [key]: e.target.checked })} />
          <span>{label}</span>
        </label>)}
        <label className="input-field">
          <span>Intervalo de mantenimiento</span>
          <select disabled={busy} value={settings.maintenance_days} onChange={e => setSettings({ ...settings, maintenance_days: Number(e.target.value) })}>
            {[7, 14, 30].map(days => <option key={days} value={days}>{days} días</option>)}
          </select>
        </label>
      </div>
      <Button disabled={busy} onClick={save}>{busy ? 'Guardando...' : 'Guardar recordatorios'}</Button>
    </>}
    {!settings && !message && <p>Cargando recordatorios...</p>}
    {message && <p role="status">{message}</p>}
  </Card>
}

export function ClientMarketingNotices() {
  const [notices, setNotices] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    async function refresh() {
      if (document.hidden) return
      try {
        const { data, error: failure } = await requireSupabase().rpc('studio_flow_client_get_notifications')
        if (failure) throw failure
        if (active) { setNotices(data.notifications || []); setError('') }
      } catch { if (active) setError('No se pudieron cargar tus avisos. Volveremos a intentar.') }
    }
    refresh()
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  async function markRead(id) {
    try {
      const { error: failure } = await requireSupabase().rpc('studio_flow_client_read_marketing_notice', { p_id: id })
      if (failure) throw failure
      setNotices(current => current.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    } catch { setError('No se pudo marcar el aviso como leído.') }
  }
  const unread = notices.filter(n => !n.read_at)
  if (!unread.length && !error) return null
  return <Card className="wide-card mobile-screen">
    <PanelHeader title="Avisos para ti" eyebrow="Studio Flow" />
    {error && <p role="status">{error}</p>}
    <div className="compact-list">
      {unread.map(n => <article className="list-row" key={n.id}>
        <div><strong>{n.title}</strong><p>{n.body}</p></div>
        <Button variant="ghost" size="sm" onClick={() => markRead(n.id)}>Marcar leído</Button>
      </article>)}
    </div>
  </Card>
}
