import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { fetchAdminBillingSummary } from '../../services/adminBillingService'

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
  const [error, setError] = useState('')

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

  const visibleEntities = useMemo(() => billing.entities.slice(0, 5), [billing.entities])

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
            <span>Comision al dia</span>
            <span>Estatus</span>
          </div>
          {visibleEntities.map((entity) => (
            <div className="table-row" key={`${entity.type}-${entity.id}`}>
              <strong>{entity.name}</strong>
              <span>{entity.type === 'studio' ? 'Estudio' : 'Artista'}</span>
              <span>{formatCurrency(entity.todayCommission)}</span>
              <StatusPill tone={entity.status === 'overdue' ? 'warm' : 'success'}>
                {entity.status === 'overdue' ? 'Con atraso' : 'Al corriente'}
              </StatusPill>
            </div>
          ))}
          {!isLoading && visibleEntities.length === 0 && (
            <div className="table-row">
              <strong>Sin resultados</strong>
              <span>Busca por nombre, correo o celular.</span>
              <StatusPill tone="neutral">0</StatusPill>
            </div>
          )}
        </div>
      </Card>
    </main>
  )
}

export default AdminBilling
