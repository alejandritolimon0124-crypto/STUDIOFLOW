import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, History, RefreshCw } from 'lucide-react'
import GrowthAdvisor from '../components/GrowthAdvisor'
import InvitationCardBuilder from '../components/InvitationCardBuilder'
import SocialBookingLinks from '../components/SocialBookingLinks'
import { useApp } from '../contexts/appContextCore'
import { paths } from '../routes/paths'
import { isCommissionWaived } from '../utils/commissionWaiver.js'
import { requireSupabase } from '../lib/supabaseClient'
import { buildEventWorkbook } from '../services/eventWorkbook'
import { fetchInvitationExportDetails } from '../services/invitationExportService'
import { fetchMonthlyFlowPointRedemptions } from '../services/flowPointRedemptionReport'
import './accounting.css'

const money = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)
const dateLabel = (value) => value ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : ''

export default function Accounting({ studio = false }) {
  const { session } = useApp()
  const assignment = (session.roles || []).find((item) => item.role === 'studio_owner' && !['inactive', 'revoked'].includes(item.status))
  const studioId = studio ? session.activeSessionContext?.studioId || session.activeSessionContext?.studio_id || session.user?.studioId || session.user?.studio_id || assignment?.studioId || assignment?.studio_id : null
  const [refresh, setRefresh] = useState(0)
  return <AccountingReport key={`${studio ? studioId || 'missing' : 'artist'}:${session.profile?.id || session.user?.id}:${refresh}`} studio={studio} studioId={studioId} onRefresh={() => setRefresh((value) => value + 1)} />
}

function AccountingReport({ studio, studioId, onRefresh }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, refreshAuthContext } = useApp()
  const [data, setData] = useState(null)
  const [growth, setGrowth] = useState(null)
  const [growthError, setGrowthError] = useState('')
  const [view, setView] = useState('hoy')
  const [shareOpen, setShareOpen] = useState(false)
  const isShareOpen = shareOpen || new URLSearchParams(location.search).get('tarjeta') === '1'
  const closeShare = () => {
    setShareOpen(false)
    if (new URLSearchParams(location.search).has('tarjeta')) {
      const homePath = studio ? `${paths.adminStudio}?section=summary` : paths.artistAgenda
      if (location.state?.returnTo === homePath) navigate(homePath, { replace: true })
      else navigate(location.pathname, { replace: true })
    }
  }
  const [socialService, setSocialService] = useState(null)
  const [error, setError] = useState('')
  const [accessError, setAccessError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cancelledLimit, setCancelledLimit] = useState(10)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMonth, setExportMonth] = useState(() => new Date().getMonth() || 12)
  const [exportYear, setExportYear] = useState(() => new Date().getMonth() ? new Date().getFullYear() : new Date().getFullYear() - 1)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        if (studio && !studioId) throw new Error('Selecciona un estudio para consultar su contabilidad.')
        const fetchReports = () => Promise.all([
          requireSupabase().rpc('studio_flow_get_accounting_summary', { p_studio_id: studioId || null }),
          requireSupabase().rpc('studio_flow_get_growth_report', { p_studio_id: studioId || null }),
        ])
        let [response, growthResponse] = await fetchReports()
        if (/sesion activa requerida/i.test(response.error?.message || '')) {
          const restoredSession = await refreshAuthContext()
          if (!restoredSession?.user) return
          ;[response, growthResponse] = await fetchReports()
        }
        if (response.error) throw response.error
        if (active) {
          setData(response.data)
          setError('')
          setAccessError(false)
          setGrowth(growthResponse.error ? null : growthResponse.data)
          setGrowthError(growthResponse.error ? 'El asesor de crecimiento estará disponible cuando se actualice el sistema de datos.' : '')
        }
      } catch (failure) { if (active) { const authFailure = /sesion activa requerida|jwt|refresh token/i.test(failure.message || ''); setAccessError(authFailure); setError(authFailure ? 'No pudimos validar tu sesión para mostrar Mi negocio. Revisa tu acceso y vuelve a intentar.' : failure.message) } }
      finally { if (active) setLoading(false) }
    }
    load()
    const tick = () => { if (document.visibilityState !== 'hidden') load() }
    const timer = window.setInterval(tick, 60000)
    window.addEventListener('focus', tick)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [studio, studioId, refreshAuthContext])

  const downloadReceipt = async (year = exportYear, month = exportMonth) => {
    setExporting(true)
    setError('')
    try {
      const response = await requireSupabase().rpc('studio_flow_provider_export_events', {
        p_studio_id: studioId || null,
        p_year: Number(year),
        p_month: Number(month),
      })
      if (response.error) throw response.error
      const artistId = session.artist?.id || session.profile?.artistId || session.user?.artistId || session.user?.artist_id
      const [invitations, redemptions] = await Promise.all([
        fetchInvitationExportDetails(response.data.events),
        fetchMonthlyFlowPointRedemptions(studio ? 'studio' : 'artist', studio ? studioId : artistId, year, month),
      ])
      const buffer = await buildEventWorkbook({ ...response.data, invitations, redemptions }, Number(year), Number(month))
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `Recibo_Studio_Flow_${String(response.data.profile.name || 'cuenta').replace(/[<>:"/\\|?*]/g, '_')}_${year}-${String(month).padStart(2, '0')}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (failure) {
      setError(`No se pudo descargar el recibo: ${failure.message || 'Intenta nuevamente.'}`)
    } finally {
      setExporting(false)
    }
  }

  return <main className="accounting-page">
    <header className="accounting-heading"><div><span className="growth-eyebrow">ORGANIZA · CONSIGUE · FIDELIZA</span><h1>Mi negocio</h1><p>{studio ? 'Tu estudio, en perspectiva' : 'Lo que haces hoy impulsa lo que viene'}</p></div><button type="button" title="Actualizar panel" aria-label="Actualizar panel" disabled={loading} onClick={onRefresh}><RefreshCw size={20} /></button></header>
    {error && <div className="accounting-load-error" role="alert"><p>{error}</p>{accessError && <button type="button" onClick={onRefresh}>Reintentar acceso</button>}</div>}
    {loading && <p role="status">Consultando ingresos...</p>}
    {data && <>
      <nav className="growth-tabs" id="growth-tabs" aria-label="Vistas de mi negocio">
        {[['hoy','Hoy'],['organiza','Organiza'],['consigue','Consigue'],['fideliza','Fideliza'],['finanzas','Finanzas']].map(([value, label]) => <button key={value} data-view={value} className={view === value ? 'active' : ''} type="button" aria-current={view === value ? 'page' : undefined} onClick={() => setView(value)}>{label}</button>)}
      </nav>
      {view !== 'finanzas' && <>
        {growth ? <GrowthAdvisor data={growth} studio={studio} view={view} onShare={() => setShareOpen(true)} onSocialLinks={(serviceName = '') => { setView('consigue'); setSocialService(serviceName) }} /> : <p className="growth-unavailable" role="status">{growthError || 'Preparando tu asesor de crecimiento...'}</p>}
        {view === 'consigue' && socialService !== null && <SocialBookingLinks artistId={session.artist?.id || session.profile?.artistId || session.user?.artistId || session.user?.artist_id} studioId={studio ? studioId : null} businessName={data?.profile?.name || ''} suggestedService={socialService} onClose={() => setSocialService(null)} />}
      </>}
      {view === 'finanzas' && <>
      <p className="accounting-caption">Citas completadas · Importes finales después de descuentos</p>
      <section aria-label="Resumen de ingresos" className="accounting-totals">
        {[['Ingresos de hoy', dateLabel(data.date), data.daily], ['Ingresos de la semana', `Desde el ${dateLabel(data.weekStart)}`, data.weekly], ['Ingresos del mes', `Desde el ${dateLabel(data.monthStart)}`, data.monthly]].map(([label, period, amount]) => <article key={label}><div><h2>{label}</h2><p>{period}</p></div><strong>{money(amount)}</strong></article>)}
      </section>
      <section className="accounting-cancellations" aria-label="Citas canceladas del mes">
        <details>
          <summary>Citas canceladas del mes <strong>{data.cancelledAppointments?.length || 0}</strong></summary>
          <p>Por fecha programada · Las citas canceladas no generan comisión.</p>
          {!data.cancelledAppointments?.length && <p>No hay citas canceladas para este mes.</p>}
          {(data.cancelledAppointments || []).slice(0, cancelledLimit).map((appointment) => <article key={appointment.id}>
            <strong>{appointment.client || 'Clienta'}</strong>
            <span>{appointment.service || 'Servicio'}</span>
            <span>Cita: {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(appointment.scheduledAt))}</span>
            <small>Cancelada: {appointment.cancelledAt ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(appointment.cancelledAt)) : 'Fecha no registrada'}</small>
            <span>Importe de la reserva: {appointment.amount == null ? 'No registrado' : money(appointment.amount)}</span>
            <span>{appointment.providerCancelled ? 'Cancelada por artista o estudio' : 'Cancelada por la clienta'}</span>
            <strong>Comisión Studio Flow: {money(appointment.commissionAmount || 0)}</strong>
          </article>)}
          {(data.cancelledAppointments?.length || 0) > cancelledLimit && <button type="button" className="button" onClick={() => setCancelledLimit((value) => value + 10)}>Mostrar más</button>}
        </details>
      </section>
      <section className="accounting-receipt" aria-label="Recibo de comisión">
        <div className="accounting-receipt-title"><div><span>Recibo mensual</span><h2>Recibo de pago de comisiones Studio Flow</h2></div><strong>{money(data.commission)}</strong></div>
        <p>Periodo: {new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(new Date(`${data.receiptMonth}T12:00:00`))}</p>
        <dl><div><dt>Ingresos del periodo</dt><dd>{money(data.receiptIncome)}</dd></div><div><dt>{isCommissionWaived(data.receiptMonth) ? 'Comisión Studio Flow · exenta' : 'Comisión Studio Flow · 10%'}</dt><dd>{money(data.commission)}</dd></div></dl>
        {isCommissionWaived(data.receiptMonth) ? <p>Sin cuota ni comisiones por las citas de este periodo. El cobro se reanuda para citas desde el 1 de enero de 2027.</p> : <div className="accounting-deadline"><strong>Pagar dentro de los primeros 5 días del mes.</strong><span>Evita la suspensión de tu cuenta.</span><p>Fecha límite: <b>{dateLabel(data.dueDate)}</b></p></div>}
        <div className="accounting-receipt-actions">
          <button type="button" className="button" disabled={exporting} onClick={() => {
            const [year, month] = String(data.receiptMonth).split('-').map(Number)
            downloadReceipt(year, month)
          }}><Download size={17} />{exporting ? 'Preparando...' : 'Descargar recibo del mes'}</button>
          <button type="button" className="button button-secondary" onClick={() => setHistoryOpen((value) => !value)}><History size={17} />Historial</button>
        </div>
        {historyOpen && <form className="accounting-history" onSubmit={(event) => { event.preventDefault(); downloadReceipt() }}>
          <label>Mes<select value={exportMonth} onChange={(event) => setExportMonth(event.target.value)}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(new Date(2000, index, 1))}</option>)}</select></label>
          <label>Año<input type="number" min="2020" max="9998" value={exportYear} onChange={(event) => setExportYear(event.target.value)} /></label>
          <button type="submit" className="button" disabled={exporting}><Download size={17} />Descargar XLS</button>
        </form>}
      </section>
      </>}
    </>}
    {isShareOpen && <InvitationCardBuilder studioId={studio ? studioId : null} businessName={data?.profile?.name || ''} initialMode={new URLSearchParams(location.search).get('vista') === 'guardadas' ? 'saved' : 'create'} initialClient={new URLSearchParams(location.search).get('clientId') ? { id: new URLSearchParams(location.search).get('clientId'), name: new URLSearchParams(location.search).get('clientName') || 'Clienta' } : null} onClose={closeShare} />}
  </main>
}
