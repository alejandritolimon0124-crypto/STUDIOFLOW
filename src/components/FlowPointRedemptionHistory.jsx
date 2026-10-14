import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Search, TicketCheck } from 'lucide-react'
import { useApp } from '../contexts/appContextCore'
import { fetchFlowPointRedemptionReport } from '../services/flowPointRedemptionReport'
import './flow-point-redemptions.css'

const PAGE_SIZE = 8
const currentMonth = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

export default function FlowPointRedemptionHistory({ studioId = null }) {
  const { session } = useApp()
  const artistId = session.artist?.id || session.profile?.artistId || session.user?.artistId || session.user?.artist_id
  const [period, setPeriod] = useState(currentMonth)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState({ items: [], total: 0, pointsTotal: 0 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const load = useCallback(() => setRefresh((value) => value + 1), [])
  useEffect(() => {
    let active = true
    const [year, month] = period ? period.split('-').map(Number) : [null, null]
    fetchFlowPointRedemptionReport({ type: studioId ? 'studio' : 'artist', id: studioId || artistId, year, month, query, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((data) => { if (active) { setReport(data); setError(''); setLoading(false) } })
      .catch(() => { if (active) { setError('No pudimos consultar los canjes.'); setLoading(false) } })
    return () => { active = false }
  }, [studioId, artistId, period, query, page, refresh])

  const changePeriod = (value) => { setPeriod(value); setPage(0); setLoading(true) }
  return <section className="flow-redemptions">
    <div className="flow-redemptions-heading"><TicketCheck size={27} /><div><span>FLOWPOINTS EN TU NEGOCIO</span><h2>Canjes de artículos</h2></div><button type="button" onClick={() => { setLoading(true); load() }} disabled={loading} aria-label="Actualizar canjes" title="Actualizar canjes"><RefreshCw size={19} /></button></div>
    <div className="flow-redemptions-summary"><div><strong>{loading ? '...' : report.total.toLocaleString('es-MX')}</strong><span>canjes {period ? 'del periodo' : 'en total'}</span></div><div><strong>{loading ? '...' : Number(report.pointsTotal).toLocaleString('es-MX')}</strong><span>FP usados</span></div></div>
    {error && !open && <small role="alert">{error}</small>}
    <button className="flow-redemptions-toggle" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Ocultar historial' : 'Buscar un canje'}</button>
    {open && <div className="flow-redemptions-detail">
      <div className="flow-redemptions-filters"><label>Periodo<select value={period} onChange={(event) => changePeriod(event.target.value)}><option value="">Todo el historial</option>{Array.from({ length: 24 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - index); const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; return <option key={value} value={value}>{new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date)}</option> })}</select></label><form onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(0); setLoading(true); load() }}><label>Clienta o folio<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o folio" /></label><button type="submit" aria-label="Buscar canjes" title="Buscar canjes"><Search size={19} /></button></form></div>
    {error && <small role="alert">{error}</small>}
    {!loading && !error && report.items.length === 0 && <small>No hay canjes con esos filtros.</small>}
    <div className="flow-redemptions-list">{report.items.map((item) => <article key={item.id}><div><strong>{item.clientName}</strong><small>{new Date(item.redeemedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' })}</small></div><div><b>{Number(item.points).toLocaleString('es-MX')} FP</b><small>Folio {item.id.slice(0, 8).toUpperCase()}</small></div></article>)}</div>
    {report.total > PAGE_SIZE && <div className="flow-redemptions-pages"><button type="button" disabled={page === 0 || loading} onClick={() => { setPage(page - 1); setLoading(true) }} aria-label="Página anterior"><ChevronLeft size={18} /></button><span>{page + 1} de {Math.ceil(report.total / PAGE_SIZE)}</span><button type="button" disabled={(page + 1) * PAGE_SIZE >= report.total || loading} onClick={() => { setPage(page + 1); setLoading(true) }} aria-label="Página siguiente"><ChevronRight size={18} /></button></div>}
    </div>}
  </section>
}
