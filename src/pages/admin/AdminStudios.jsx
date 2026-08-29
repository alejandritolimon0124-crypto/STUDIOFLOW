import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { fetchOwnerStudios, reviewOwnerStudio } from '../../services/adminStudioManagementService'

const statusTone = {
  pending: 'pending',
  approved: 'approved',
  suspended: 'suspended',
  rejected: 'rejected',
}

const statusLabel = {
  pending: 'Pendiente',
  approved: 'Activo',
  suspended: 'Suspendido',
  rejected: 'Rechazado',
}
const parseMoneyValue = (value) => Number(String(value || '').replace(/[^\d.-]/g, '')) || 0

function AdminStudios() {
  const [studios, setStudios] = useState([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [actionStudioId, setActionStudioId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadStudios = async () => {
    setIsLoading(true)
    setError('')

    try {
      const nextStudios = await fetchOwnerStudios()
      setStudios(nextStudios)
    } catch (requestError) {
      setStudios([])
      setError(requestError.message || 'No se pudieron cargar los estudios.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStudios()
  }, [])

  const activeStudios = studios.filter((studio) => studio.studioStatus === 'approved')
  const suspendedStudios = studios.filter((studio) => studio.studioStatus === 'suspended')
  const normalizedQuery = query.trim().toLowerCase()
  const visibleStudios = useMemo(() => studios.filter((studio) => {
    if (!normalizedQuery) return true
    const searchable = [
      studio.commercialName,
      studio.name,
      studio.email,
      studio.phone,
      studio.ownerName,
      studio.ownerEmail,
      studio.ownerPhone,
    ].join(' ').toLowerCase()
    return searchable.includes(normalizedQuery)
  })
    .sort((firstStudio, secondStudio) => parseMoneyValue(secondStudio.revenue) - parseMoneyValue(firstStudio.revenue))
    .slice(0, 5), [normalizedQuery, studios])

  const runReviewAction = async (studio, action) => {
    setActionStudioId(studio.id)
    setError('')
    setSuccess('')

    try {
      const nextStudios = await reviewOwnerStudio({
        studioId: studio.id,
        action,
        reason: `${action} ejecutado desde Gestion de Estudios.`,
      })
      setStudios(nextStudios)
      setSuccess(`${studio.commercialName} actualizado correctamente.`)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo actualizar el estudio.')
    } finally {
      setActionStudioId('')
    }
  }

  const renderActions = (studio) => {
    const isBusy = actionStudioId === studio.id

    if (studio.studioStatus === 'pending') {
      return (
        <>
          <Button disabled={isBusy} size="sm" onClick={() => runReviewAction(studio, 'approve')}>Aprobar</Button>
          <Button disabled={isBusy} size="sm" variant="ghost" onClick={() => runReviewAction(studio, 'request_changes')}>Solicitar cambios</Button>
          <Button disabled={isBusy} size="sm" variant="ghost" onClick={() => runReviewAction(studio, 'reject')}>Rechazar</Button>
        </>
      )
    }

    if (studio.studioStatus === 'approved') {
      return <Button disabled={isBusy} size="sm" variant="ghost" onClick={() => runReviewAction(studio, 'suspend')}>Suspender</Button>
    }

    if (studio.studioStatus === 'suspended') {
      return <Button disabled={isBusy} size="sm" onClick={() => runReviewAction(studio, 'reactivate')}>Reactivar</Button>
    }

    return <StatusPill tone="neutral">Sin acciones</StatusPill>
  }

  return (
    <main className="dashboard-grid admin-grid">
      <MetricCard label="Estudios activos" value={activeStudios.length} trend={`${suspendedStudios.length} suspendidos`} tone={suspendedStudios.length ? 'warm' : 'success'} />

      <Card className="wide-card executive-card">
        <PanelHeader title="Estudios" eyebrow="Suspension y reactivacion" />

        <div className="admin-search">
          <Input
            label="Buscar"
            placeholder="Nombre, correo o celular..."
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {error && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{error}</small>}
        {success && <small style={{ color: 'var(--success)', fontWeight: 800 }}>{success}</small>}

        <div className="data-table">
          <div className="table-head">
            <span>Estudio</span>
            <span>Contacto</span>
            <span>Estatus actual</span>
            <span>Acciones</span>
          </div>

          {isLoading && (
            <div className="table-row">
              <strong>Cargando estudios...</strong>
              <span>Consultando Supabase</span>
              <StatusPill tone="neutral">Cargando</StatusPill>
              <span></span>
            </div>
          )}

          {!isLoading && visibleStudios.map((studio) => (
            <div className="table-row" key={studio.id}>
              <strong>{studio.commercialName}</strong>
              <span>{studio.email || studio.ownerEmail || studio.phone || studio.ownerPhone || 'Sin contacto'}</span>
              <StatusPill tone={statusTone[studio.studioStatus] || 'neutral'}>
                {statusLabel[studio.studioStatus] || studio.studioStatus}
              </StatusPill>
              <div className="row-actions">{renderActions(studio)}</div>
            </div>
          ))}

          {!isLoading && visibleStudios.length === 0 && (
            <div className="table-row">
              <strong>Sin estudios encontrados</strong>
              <span>Busca por nombre, correo o celular.</span>
              <StatusPill tone="neutral">0</StatusPill>
              <span></span>
            </div>
          )}
        </div>
      </Card>
    </main>
  )
}

export default AdminStudios
