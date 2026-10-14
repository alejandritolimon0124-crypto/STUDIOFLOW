import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Search, TrendingUp } from 'lucide-react'
import { requireSupabase } from '../../lib/supabaseClient'
import '../accounting.css'
import './admin-growth.css'

const money = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(value) || 0)
const pct = (part, total) => total > 0 ? `${Math.round((Number(part) || 0) / total * 100)}%` : '—'

function verdict(entity) {
  const m = entity.metrics || {}
  if (!Number(m.completed)) return { label: 'Por activar', detail: 'Aún no hay citas completadas.' }
  if (!Number(m.searchFirstClients ?? m.marketplaceFirstClients) && !Number(m.invitationFirstClients)) return { label: 'Necesita descubrimiento', detail: 'Aún no hay primeras citas desde la búsqueda o tarjetas.' }
  if (!Number(m.returningClients)) return { label: 'Trabajar retorno', detail: 'Ya hubo primeras citas. Falta medir visitas siguientes.' }
  return { label: 'Señal de crecimiento', detail: 'Ya registra primeras citas y clientas que regresan.' }
}

export default function AdminGrowth() {
  const [entities, setEntities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [trialOnly, setTrialOnly] = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let active = true
    requireSupabase().rpc('studio_flow_admin_get_growth_report').then(({ data, error: responseError }) => {
      if (responseError) throw responseError
      if (active) setEntities(Array.isArray(data?.entities) ? data.entities : [])
    }).catch((failure) => { if (active) setError(failure.message || 'No pudimos cargar el análisis.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const visible = useMemo(() => entities.filter((entity) => {
    if (!entity.name?.toLocaleLowerCase('es-MX').includes(query.toLocaleLowerCase('es-MX'))) return false
    if (!trialOnly) return true
    const joined = new Date(entity.joinedAt)
    if (Number.isNaN(joined.getTime())) return false
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    return joined >= sixMonthsAgo
  }), [entities, query, trialOnly])

  const totals = visible.reduce((acc, entity) => {
    acc.revenue += Number(entity.metrics?.revenue) || 0
    acc.marketplace += Number(entity.metrics?.searchFirstClients ?? entity.metrics?.marketplaceFirstClients) || 0
    acc.invitations += Number(entity.metrics?.invitationFirstClients) || 0
    acc.returned += Number(entity.metrics?.returningClients) || 0
    acc.active += Number(entity.metrics?.completed) > 0 ? 1 : 0
    return acc
  }, { revenue: 0, marketplace: 0, invitations: 0, returned: 0, active: 0 })

  return <main className="admin-growth-page">
    <header className="admin-growth-heading"><span className="growth-eyebrow">ANÁLISIS DE SEIS MESES</span><h1>¿Quién está creciendo?</h1><p>Una lectura clara de lo que cada negocio consigue, organiza y conserva.</p></header>
    {loading && <p role="status">Preparando el análisis...</p>}
    {error && <p role="alert" className="growth-unavailable">{error}</p>}
    {!loading && !error && <>
      <section className="admin-growth-highlights" aria-label="Resumen de negocios"><div><small>Negocios con citas este mes</small><strong>{totals.active} de {visible.length}</strong></div><div><small>Primeras citas: búsqueda / tarjetas</small><strong>{totals.marketplace} / {totals.invitations}</strong></div><div><small>Clientas que regresaron</small><strong>{totals.returned}</strong></div><div><small>Ingresos administrados este mes</small><strong>{money(totals.revenue)}</strong></div></section>
      <div className="admin-growth-tools"><label><Search size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar artista o estudio" /></label><label className="admin-growth-toggle"><input type="checkbox" checked={trialOnly} onChange={(event) => setTrialOnly(event.target.checked)} /> Altas de los últimos seis meses</label></div>
      <p className="admin-growth-note">Cada estudio incluye sus artistas. Las cuentas independientes aparecen por separado para evitar duplicar ingresos.</p>
      <section className="admin-growth-list" aria-label="Resultados por negocio">
        {visible.length === 0 && <p>Sin negocios para este filtro.</p>}
        {visible.map((entity) => {
          const m = entity.metrics || {}
          const series = Array.isArray(m.series) ? m.series : []
          const sixMonthRevenue = series.reduce((sum, month) => sum + (Number(month.revenue) || 0), 0)
          const sixMonthClients = series.reduce((sum, month) => sum + (Number(month.new_clients) || 0), 0)
          const channelSeries = Array.isArray(m.channelSeries) ? m.channelSeries : []
          const sixMonthSearch = channelSeries.reduce((sum, month) => sum + (Number(month.searchFirst) || 0), 0)
          const sixMonthInvitations = channelSeries.reduce((sum, month) => sum + (Number(month.invitationFirst) || 0), 0)
          const maxMonth = Math.max(...series.map((month) => Number(month.revenue) || 0), 1)
          const status = verdict(entity)
          const expanded = selected === `${entity.type}:${entity.id}`
          return <article key={`${entity.type}:${entity.id}`} className={expanded ? 'expanded' : ''}>
            <button type="button" className="admin-growth-row" aria-expanded={expanded} onClick={() => setSelected(expanded ? null : `${entity.type}:${entity.id}`)}>
              <span className="admin-growth-name"><small>{entity.type === 'studio' ? 'ESTUDIO' : 'ARTISTA'}</small><strong>{entity.name}</strong></span>
              <span className="admin-growth-signal"><TrendingUp size={18} /><span>{status.label}</span></span>
              <span className="admin-growth-revenue">{money(m.revenue)}<small>este mes</small></span><ArrowRight className="admin-growth-arrow" size={20} />
            </button>
            {expanded && <div className="admin-growth-detail"><p>{status.detail}</p><div className="admin-growth-detail-metrics"><span><strong>{Number(m.completed) || 0}</strong> citas atendidas este mes</span><span><strong>{Number(m.searchFirstClients ?? m.marketplaceFirstClients) || 0}</strong> primeras desde búsqueda este mes</span><span><strong>{Number(m.invitationFirstClients) || 0}</strong> primeras por tarjetas este mes</span><span><strong>{Number(m.returningClients) || 0}</strong> regresaron este mes</span></div><div className="admin-growth-six-months"><div><small>ÚLTIMOS SEIS MESES</small><strong>{money(sixMonthRevenue)}</strong><span>{sixMonthClients} primeras citas: {sixMonthSearch} búsqueda, {sixMonthInvitations} tarjetas</span></div><div className="growth-bars">{series.map((month) => <div key={month.month} title={`${month.month}: ${money(month.revenue)}`}><span style={{ height: `${Math.max(7, Math.round((Number(month.revenue) || 0) / maxMonth * 100))}%` }}></span><small>{month.month?.slice(5)}</small></div>)}</div></div><p className="admin-growth-origin">Enlace público: {Number(m.firstBookingSources?.googleLink) || 0} primeras citas este mes. Origen de reserva no demuestra cómo conocieron al negocio.</p><p className="admin-growth-origin">Retorno del mes: {pct(m.returningClients, m.servedClients)} de clientas atendidas.</p></div>}
          </article>
        })}
      </section>
    </>}
  </main>
}
