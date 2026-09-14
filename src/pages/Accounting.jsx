import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useApp } from '../contexts/appContextCore'
import { requireSupabase } from '../lib/supabaseClient'
import './accounting.css'

const money = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)
const dateLabel = (value) => value ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : ''

export default function Accounting({ studio = false }) {
  const { session } = useApp()
  const assignment = (session.roles || []).find((item) => item.role === 'studio_owner' && !['inactive', 'revoked'].includes(item.status))
  const studioId = studio ? session.activeSessionContext?.studioId || session.activeSessionContext?.studio_id || session.user?.studioId || session.user?.studio_id || assignment?.studioId || assignment?.studio_id : null
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [cancelledLimit, setCancelledLimit] = useState(10)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        if (studio && !studioId) throw new Error('Selecciona un estudio para consultar su contabilidad.')
        const response = await requireSupabase().rpc('studio_flow_get_accounting_summary', { p_studio_id: studioId || null })
        if (response.error) throw response.error
        if (active) { setData(response.data); setError('') }
      } catch (failure) { if (active) setError(failure.message) }
      finally { if (active) setLoading(false) }
    }
    setData(null); setCancelledLimit(10); setLoading(true); load()
    const tick = () => { if (document.visibilityState !== 'hidden') load() }
    const timer = window.setInterval(tick, 60000)
    window.addEventListener('focus', tick)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [studio, studioId, refresh])
  return <main className="accounting-page">
    <header className="accounting-heading"><div><h1>Contabilidad</h1><p>{studio ? 'Ingresos del estudio' : 'Actividad independiente'}</p></div><button type="button" title="Actualizar contabilidad" aria-label="Actualizar contabilidad" disabled={loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={20} /></button></header>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Consultando ingresos...</p>}
    {data && <>
      <p className="accounting-caption">Citas completadas · Importes finales después de descuentos</p>
      <section aria-label="Resumen de ingresos" className="accounting-totals">
        {[['Ingresos de hoy', dateLabel(data.date), data.daily], ['Ingresos de la semana', `Desde el ${dateLabel(data.weekStart)}`, data.weekly], ['Ingresos del mes', `Desde el ${dateLabel(data.monthStart)}`, data.monthly]].map(([label, period, amount]) => <article key={label}><div><h2>{label}</h2><p>{period}</p></div><strong>{money(amount)}</strong></article>)}
      </section>
      <section className="accounting-cancellations" aria-label="Citas canceladas del mes">
        <details>
          <summary>Citas canceladas del mes <strong>{data.cancelledAppointments?.length || 0}</strong></summary>
          <p>Por fecha programada · Sin ingresos ni comisión</p>
          {!data.cancelledAppointments?.length && <p>No hay citas canceladas para este mes.</p>}
          {(data.cancelledAppointments || []).slice(0, cancelledLimit).map((appointment) => <article key={appointment.id}>
            <strong>{appointment.client || 'Clienta'}</strong>
            <span>{appointment.service || 'Servicio'}</span>
            <span>Cita: {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(appointment.scheduledAt))}</span>
            <small>Cancelada: {appointment.cancelledAt ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(appointment.cancelledAt)) : 'Fecha no registrada'}</small>
            <span>Importe de la reserva: {appointment.amount == null ? 'No registrado' : money(appointment.amount)}</span>
          </article>)}
          {(data.cancelledAppointments?.length || 0) > cancelledLimit && <button type="button" className="button" onClick={() => setCancelledLimit((value) => value + 10)}>Mostrar más</button>}
        </details>
      </section>
      <section className="accounting-receipt" aria-label="Recibo de comisión">
        <h2>Recibo de pago Studio Flow</h2>
        <p>Periodo: {new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(new Date(`${data.receiptMonth}T12:00:00`))}</p>
        <dl><div><dt>Ingresos del periodo</dt><dd>{money(data.receiptIncome)}</dd></div><div><dt>Comisión Studio Flow · 10%</dt><dd>{money(data.commission)}</dd></div></dl>
        <strong>Pagar dentro de los primeros 5 días del mes.</strong>
        <p>Fecha límite: {dateLabel(data.dueDate)}</p>
      </section>
    </>}
  </main>
}
