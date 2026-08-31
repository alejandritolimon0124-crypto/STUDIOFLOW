import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import {
  fetchAdminBillingHistory,
  fetchAdminBillingSummary,
  markAdminCommissionPaid,
} from '../../services/adminBillingService'

const formatCurrency = (value) => `$${Math.round(Number(value) || 0).toLocaleString('es-MX')}`

function matchesQuery(entity = {}, query = '') {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return [
    entity.name,
    entity.email,
    entity.phone,
    entity.owner,
    entity.ownerEmail,
    entity.ownerPhone,
  ].join(' ').toLowerCase().includes(normalizedQuery)
}

function getCurrentMonthBounds() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  return { start, end, today: now.toISOString().slice(0, 10) }
}

function isInCurrentMonth(value, bounds) {
  if (!value) return true
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return true
  return date >= bounds.start && date < bounds.end
}

function isToday(value, today) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) === today
  return date.toISOString().slice(0, 10) === today
}

function buildFallbackBilling(adminState, query = '') {
  const dashboard = adminState.dashboard || {}
  const bounds = getCurrentMonthBounds()
  const studios = adminState.studios.length ? adminState.studios : dashboard.studios || []
  const artists = adminState.artists.length ? adminState.artists : dashboard.artists || []
  const appointments = (dashboard.appointments || []).filter((appointment) => isInCurrentMonth(appointment.date || appointment.startsAt, bounds))
  const commissionFor = (items) => items.reduce((total, appointment) => total + (Number(appointment.platformFee) || Math.round((Number(appointment.grossAmount) || 0) * 0.10)), 0)
  const grossFor = (items) => items.reduce((total, appointment) => total + (Number(appointment.grossAmount) || 0), 0)

  const studioEntities = studios.map((studio) => {
    const items = appointments.filter((appointment) => appointment.studioId === studio.id)
    return {
      id: studio.id,
      type: 'studio',
      name: studio.profile?.commercialName || studio.commercialName || studio.name || 'Estudio',
      email: studio.profile?.email || studio.email || '',
      phone: studio.profile?.phone || studio.phone || '',
      currentMonthGross: grossFor(items),
      currentMonthCommission: commissionFor(items),
      todayCommission: commissionFor(items.filter((appointment) => isToday(appointment.date || appointment.startsAt, bounds.today))),
      overdueCommission: 0,
      appointmentCount: items.length,
      status: 'current',
    }
  })

  const artistEntities = artists.map((artist) => {
    const items = appointments.filter((appointment) => appointment.artistId === artist.id)
    return {
      id: artist.id,
      type: 'artist',
      name: artist.name || artist.owner || 'Artista',
      email: artist.email || '',
      phone: artist.phone || '',
      currentMonthGross: grossFor(items),
      currentMonthCommission: commissionFor(items),
      todayCommission: commissionFor(items.filter((appointment) => isToday(appointment.date || appointment.startsAt, bounds.today))),
      overdueCommission: 0,
      appointmentCount: items.length,
      status: 'current',
    }
  })

  const entities = [...studioEntities, ...artistEntities]
    .filter((entity) => matchesQuery(entity, query))
    .sort((first, second) => second.currentMonthCommission - first.currentMonthCommission)

  return {
    month: bounds.start.toISOString().slice(0, 7),
    currentMonthGross: grossFor(appointments),
    currentMonthCommission: commissionFor(appointments),
    currentStudios: studioEntities.length,
    overdueStudios: 0,
    currentArtists: artistEntities.length,
    overdueArtists: 0,
    entities,
  }
}

function AdminBilling() {
  const { adminState } = useApp()
  const [query, setQuery] = useState('')
  const [historyQuery, setHistoryQuery] = useState('')
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)
  const [billing, setBilling] = useState({
    month: '',
    currentMonthGross: 0,
    currentMonthCommission: 0,
    currentStudios: 0,
    overdueStudios: 0,
    currentArtists: 0,
    overdueArtists: 0,
    entities: [],
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isMarkingPaid, setIsMarkingPaid] = useState('')
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [error, setError] = useState('')
  const [historyStatus, setHistoryStatus] = useState('')
  const [history, setHistory] = useState({ year: new Date().getFullYear(), entities: [] })

  const loadBilling = async (nextQuery = query) => {
    setIsLoading(true)
    setError('')

    try {
      const payload = await fetchAdminBillingSummary({ query: nextQuery })
      setBilling(payload)
    } catch (requestError) {
      setError('')
      setBilling(buildFallbackBilling(adminState, nextQuery))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadBilling('')
  }, [])

  const visibleEntities = useMemo(() => {
    const entities = showOverdueOnly
      ? billing.entities.filter((entity) => entity.status === 'overdue')
      : billing.entities

    return entities.slice(0, showOverdueOnly ? 50 : 5)
  }, [billing.entities, showOverdueOnly])

  const markAsPaid = async (entity) => {
    const actionId = `${entity.type}-${entity.id}`
    setIsMarkingPaid(actionId)
    setError('')

    try {
      await markAdminCommissionPaid({
        entityType: entity.type,
        entityId: entity.id,
        month: billing.month ? `${billing.month}-01` : null,
      })
      await loadBilling(query)
      setHistoryStatus(`${entity.name} marcado como pagado.`)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo marcar como pagado.')
    } finally {
      setIsMarkingPaid('')
    }
  }

  const loadHistory = async () => {
    const nextQuery = historyQuery.trim()
    if (!nextQuery) {
      setHistory({ year: new Date().getFullYear(), entities: [] })
      setHistoryStatus('Escribe nombre, correo o celular para consultar historial.')
      return
    }

    setIsHistoryLoading(true)
    setHistoryStatus('')

    try {
      const payload = await fetchAdminBillingHistory({ query: nextQuery })
      setHistory(payload)
      setHistoryStatus(payload.entities.length ? '' : 'Sin resultados para esta busqueda.')
    } catch (requestError) {
      setHistory({ year: new Date().getFullYear(), entities: [] })
      setHistoryStatus(requestError.message || 'No se pudo cargar el historial.')
    } finally {
      setIsHistoryLoading(false)
    }
  }

  return (
    <main className="dashboard-grid admin-grid">
      <MetricCard
        label="Ingresos este mes"
        value={formatCurrency(billing.currentMonthGross)}
        trend="Servicios agendados en Studio Flow"
        tone="rose"
      />
      <MetricCard
        label="Comision este mes"
        value={formatCurrency(billing.currentMonthCommission)}
        trend="10% sobre servicios agendados"
        tone="sage"
      />
      <MetricCard
        label="Estudios al corriente"
        value={billing.currentStudios}
        trend={`${billing.overdueStudios} con atraso`}
        tone={billing.overdueStudios ? 'warm' : 'success'}
      />
      <MetricCard
        label="Artistas al corriente"
        value={billing.currentArtists}
        trend={`${billing.overdueArtists} con atraso`}
        tone={billing.overdueArtists ? 'warm' : 'success'}
      />

      <Card className="wide-card executive-card">
        <div className="billing-filter-strip">
          <div>
            <span className="eyebrow">Revision de atrasos</span>
            <strong>{showOverdueOnly ? 'Mostrando cuentas con atraso' : 'Vista general de cobranza'}</strong>
            <small>Consulta rapidamente a quien falta marcar como pagado.</small>
          </div>
          <Button size="sm" variant={showOverdueOnly ? 'primary' : 'ghost'} onClick={() => setShowOverdueOnly((value) => !value)}>
            {showOverdueOnly ? 'Ver todos' : 'Ver atrasados'}
          </Button>
        </div>
      </Card>

      <Card className="wide-card executive-card">
        <PanelHeader title="Cobranza" eyebrow="Comisiones Studio Flow" />
        <div className="admin-search">
          <div className="location-form-grid">
            <Input
              label="Buscar estudio o artista"
              placeholder="Nombre, correo o celular..."
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setError('')
              }}
            />
            <div style={{ alignSelf: 'end' }}>
              <Button disabled={isLoading} size="sm" onClick={() => loadBilling()}>
                {isLoading ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          </div>
          {error && <small className="form-error">{error}</small>}
        </div>

        <div className="data-table executive-table">
          <div className="table-head">
            <span>Cuenta</span>
            <span>Tipo</span>
            <span>Comision del mes</span>
            <span>Adeudo</span>
            <span>Estatus</span>
            <span>Accion</span>
          </div>
          {visibleEntities.map((entity) => (
            <div className="table-row" key={`${entity.type}-${entity.id}`}>
              <strong>{entity.name}</strong>
              <span>{entity.type === 'studio' ? 'Estudio' : 'Artista'}</span>
              <span>{formatCurrency(entity.currentMonthCommission)}</span>
              <span>{formatCurrency(entity.unpaidCommission || entity.currentMonthUnpaid)}</span>
              <StatusPill tone={entity.status === 'overdue' ? 'warm' : 'success'}>
                {entity.status === 'overdue' ? 'Con atraso' : 'Al corriente'}
              </StatusPill>
              <Button
                disabled={isMarkingPaid === `${entity.type}-${entity.id}` || !entity.currentMonthCommission}
                size="sm"
                variant="ghost"
                onClick={() => markAsPaid(entity)}
              >
                {isMarkingPaid === `${entity.type}-${entity.id}` ? 'Guardando...' : 'Pagado'}
              </Button>
            </div>
          ))}
          {!isLoading && visibleEntities.length === 0 && (
            <div className="table-row">
              <strong>{showOverdueOnly ? 'Sin atrasos' : 'Sin resultados'}</strong>
              <span>{showOverdueOnly ? 'No hay estudios ni artistas con atraso.' : 'Busca por nombre, correo o celular.'}</span>
              <StatusPill tone="neutral">0</StatusPill>
            </div>
          )}
        </div>
      </Card>

      <Card className="wide-card executive-card">
        <PanelHeader title="Historial" eyebrow="Consulta anual" />
        <div className="admin-search">
          <div className="location-form-grid">
            <Input
              label="Buscar historial"
              placeholder="Nombre, correo o celular..."
              type="search"
              value={historyQuery}
              onChange={(event) => {
                setHistoryQuery(event.target.value)
                setHistoryStatus('')
              }}
            />
            <div style={{ alignSelf: 'end' }}>
              <Button disabled={isHistoryLoading} size="sm" onClick={loadHistory}>
                {isHistoryLoading ? 'Consultando...' : 'Consultar'}
              </Button>
            </div>
          </div>
          {historyStatus && <small>{historyStatus}</small>}
        </div>

        {history.entities.map((entity) => (
          <section className="billing-history-result" key={`${entity.type}-${entity.id}`}>
            <div className="billing-history-title">
              <strong>{entity.name}</strong>
              <small>{entity.type === 'studio' ? 'Estudio' : 'Artista'} / {entity.email || entity.phone || 'Sin contacto'} / {history.year}</small>
            </div>
            <div className="data-table executive-table">
              <div className="table-head">
                <span>Mes</span>
                <span>Servicios</span>
                <span>Comision</span>
                <span>Estado</span>
              </div>
            {entity.months.length ? entity.months.map((month) => (
              <div className="table-row" key={`${entity.id}-${month.month}`}>
                <strong>{month.month}</strong>
                <span>{formatCurrency(month.grossAmount)} servicios</span>
                <span>{formatCurrency(month.commissionAmount)} comision</span>
                <StatusPill tone={month.status === 'paid' ? 'success' : 'warm'}>
                  {month.status === 'paid' ? 'Pagado' : `${formatCurrency(month.unpaidAmount)} pendiente`}
                </StatusPill>
              </div>
            )) : (
              <div className="table-row">
                <strong>Sin movimientos</strong>
                <span>No hay citas agendadas en el año actual.</span>
                <StatusPill tone="neutral">0</StatusPill>
              </div>
            )}
          </div>
          </section>
        ))}
      </Card>
    </main>
  )
}

export default AdminBilling
