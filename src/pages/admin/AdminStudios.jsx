import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { fetchOwnerStudios, reviewOwnerStudio } from '../../services/adminStudioManagementService'

const statusTabs = [
  { label: 'Pendientes', status: 'pending' },
  { label: 'Aprobados', status: 'approved' },
  { label: 'Suspendidos', status: 'suspended' },
  { label: 'Rechazados', status: 'rejected' },
]

const statusTone = {
  pending: 'pending',
  approved: 'approved',
  suspended: 'suspended',
  rejected: 'rejected',
}

const statusLabel = {
  pending: 'Pending',
  approved: 'Approved',
  suspended: 'Suspended',
  rejected: 'Rejected',
}

function formatDate(value) {
  if (!value) return 'Sin fecha'

  return new Date(value).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function AdminStudios() {
  const [studios, setStudios] = useState([])
  const [activeStatus, setActiveStatus] = useState('pending')
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

  const studiosByStatus = useMemo(() => statusTabs.reduce((groups, tab) => ({
    ...groups,
    [tab.status]: studios.filter((studio) => studio.studioStatus === tab.status),
  }), {}), [studios])

  const visibleStudios = studiosByStatus[activeStatus] || []

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
      <Card className="wide-card executive-card">
        <PanelHeader title="Estudios" eyebrow="Platform Owner" />

        <div className="row-actions" style={{ justifyContent: 'flex-start', marginBottom: 16 }}>
          {statusTabs.map((tab) => (
            <Button
              key={tab.status}
              size="sm"
              variant={activeStatus === tab.status ? 'primary' : 'ghost'}
              onClick={() => setActiveStatus(tab.status)}
            >
              {tab.label} ({studiosByStatus[tab.status]?.length || 0})
            </Button>
          ))}
        </div>

        {error && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{error}</small>}
        {success && <small style={{ color: 'var(--success)', fontWeight: 800 }}>{success}</small>}

        <div className="data-table">
          <div className="table-head">
            <span>Nombre comercial</span>
            <span>Ciudad</span>
            <span>Owner</span>
            <span>Creacion</span>
            <span>Status</span>
            <span>Acciones</span>
          </div>

          {isLoading && (
            <div className="table-row">
              <strong>Cargando estudios...</strong>
              <span>Consultando Supabase</span>
              <span></span>
              <span></span>
              <StatusPill tone="neutral">Cargando</StatusPill>
              <span></span>
            </div>
          )}

          {!isLoading && visibleStudios.map((studio) => (
            <div className="table-row" key={studio.id}>
              <strong>{studio.commercialName}</strong>
              <span>{studio.city || 'Sin ciudad'}</span>
              <span>{studio.ownerName}</span>
              <span>{formatDate(studio.createdAt)}</span>
              <StatusPill tone={statusTone[studio.studioStatus] || 'neutral'}>
                {statusLabel[studio.studioStatus] || studio.studioStatus}
              </StatusPill>
              <div className="row-actions">{renderActions(studio)}</div>
            </div>
          ))}

          {!isLoading && visibleStudios.length === 0 && (
            <div className="table-row">
              <strong>Sin estudios en esta categoria</strong>
              <span>{statusTabs.find((tab) => tab.status === activeStatus)?.label}</span>
              <span></span>
              <span></span>
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
