import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { fetchOwnerStudios, reviewOwnerStudio } from '../../services/adminStudioManagementService'

function getStudioName(studio = {}) {
  return studio.commercialName || studio.profile?.commercialName || studio.name || 'Estudio'
}

function getArtistName(artist = {}) {
  return artist.name || artist.owner || artist.profile?.displayName || 'Artista'
}

function getProfileRows(item = {}, type = 'artist') {
  if (type === 'studio') {
    return [
      ['Nombre', getStudioName(item)],
      ['Correo', item.email || item.profile?.email || item.ownerEmail],
      ['Telefono', item.phone || item.profile?.phone || item.ownerPhone],
      ['Ciudad', item.city || item.profile?.city],
      ['Descripcion', item.profile?.description || item.description],
      ['Estatus', item.studioStatus],
    ]
  }

  return [
    ['Nombre artistico', getArtistName(item)],
    ['Nombre legal', item.owner || item.profile?.display_name || item.profile?.displayName],
    ['Correo', item.email || item.profile?.email],
    ['Telefono', item.phone || item.profile?.phone],
    ['Ciudad', item.city || item.artistProfile?.city],
    ['Especialidad principal', item.artistProfile?.primary_specialty || item.services],
    ['Especialidades', Array.isArray(item.specialties) ? item.specialties.join(', ') : item.specialties],
    ['Biografia', item.description || item.artistProfile?.bio],
    ['Estatus', item.status],
  ]
}

function QASandbox() {
  const {
    adminState,
    adminArtistsError,
    loadAdminArtists,
    reviewManagedArtist,
  } = useApp()
  const [studios, setStudios] = useState([])
  const [isLoadingStudios, setIsLoadingStudios] = useState(false)
  const [actionId, setActionId] = useState('')
  const [profilePreview, setProfilePreview] = useState(null)
  const [reviewedStudioIds, setReviewedStudioIds] = useState([])
  const [reviewedArtistIds, setReviewedArtistIds] = useState([])
  const [systemError, setSystemError] = useState('')
  const [systemStatus, setSystemStatus] = useState('')

  const loadStudios = async () => {
    setIsLoadingStudios(true)
    setSystemError('')

    try {
      setStudios(await fetchOwnerStudios())
    } catch (error) {
      setStudios(adminState.studios || [])
      setSystemError(error.message || 'No se pudieron cargar solicitudes de estudios.')
    } finally {
      setIsLoadingStudios(false)
    }
  }

  useEffect(() => {
    loadStudios()
    loadAdminArtists?.().catch(() => null)
  }, [])

  const pendingStudios = useMemo(
    () => studios.filter((studio) => studio.studioStatus === 'pending' && !reviewedStudioIds.includes(studio.id)),
    [reviewedStudioIds, studios],
  )
  const pendingArtists = useMemo(
    () => adminState.artists.filter((artist) => artist.status === 'Pendiente' && !reviewedArtistIds.includes(artist.id)),
    [adminState.artists, reviewedArtistIds],
  )
  const rejectedArtistsCount = useMemo(
    () => adminState.artists.filter((artist) => artist.status === 'Rechazado').length,
    [adminState.artists],
  )

  const runStudioAction = async (studio, action) => {
    setActionId(`studio-${studio.id}`)
    setSystemError('')
    setSystemStatus('')

    try {
      const nextStudios = await reviewOwnerStudio({
        studioId: studio.id,
        action,
        reason: `${action} ejecutado desde Sistema.`,
      })
      setStudios(nextStudios)
      setReviewedStudioIds((currentIds) => [...new Set([...currentIds, studio.id])])
      setProfilePreview((currentPreview) => (
        currentPreview?.type === 'studio' && currentPreview.item?.id === studio.id ? null : currentPreview
      ))
      setSystemStatus(`${getStudioName(studio)} ${action === 'approve' ? 'aprobado' : 'rechazado'}.`)
    } catch (error) {
      setSystemError(error.message || 'No se pudo revisar el estudio.')
    } finally {
      setActionId('')
    }
  }

  const runArtistAction = async (artist, decision) => {
    setActionId(`artist-${artist.id}`)
    setSystemError('')
    setSystemStatus('')

    try {
      const result = await reviewManagedArtist(artist.id, decision)
      if (result) {
        setReviewedArtistIds((currentIds) => [...new Set([...currentIds, artist.id])])
        setProfilePreview((currentPreview) => (
          currentPreview?.type === 'artist' && currentPreview.item?.id === artist.id ? null : currentPreview
        ))
        setSystemStatus(`${getArtistName(artist)} ${decision === 'approve' ? 'aprobada' : 'rechazada'}.`)
        await loadAdminArtists?.().catch(() => null)
      } else {
        setSystemError('No se pudo actualizar la solicitud. Revisa que la ultima migracion de Supabase este aplicada.')
      }
    } catch (error) {
      setSystemError(error.message || 'No se pudo revisar la solicitud de artista.')
    } finally {
      setActionId('')
    }
  }

  return (
    <main className="dashboard-grid admin-grid">
      <MetricCard
        label="Estudios pendientes"
        value={pendingStudios.length}
        trend="Solicitudes por aprobar"
        tone={pendingStudios.length ? 'warm' : 'success'}
      />
      <MetricCard
        label="Artistas pendientes"
        value={pendingArtists.length}
        trend="Solicitudes por aprobar"
        tone={pendingArtists.length ? 'warm' : 'success'}
      />
      <MetricCard
        label="Artistas rechazadas"
        value={rejectedArtistsCount}
        trend="No aparecen en Studio Flow"
        tone={rejectedArtistsCount ? 'warm' : 'neutral'}
      />

      <Card className="wide-card executive-card">
        <PanelHeader title="Panel de aprobacion" eyebrow="Sistema" />
        {systemError && <small className="form-error">{systemError}</small>}
        {adminArtistsError && <small className="form-error">{adminArtistsError}</small>}
        {systemStatus && <small style={{ color: 'var(--success)', fontWeight: 800 }}>{systemStatus}</small>}

        <div className="studio-review-stack">
          <div className="approval-section-heading">
            <h3>Estudios nuevos</h3>
            <StatusPill tone={pendingStudios.length ? 'warm' : 'success'}>{pendingStudios.length} pendientes</StatusPill>
          </div>

          {isLoadingStudios && (
            <div className="studio-review-row">
              <div>
                <strong>Cargando estudios...</strong>
                <small>Consultando solicitudes pendientes.</small>
              </div>
              <StatusPill tone="neutral">Cargando</StatusPill>
            </div>
          )}

          {!isLoadingStudios && pendingStudios.map((studio) => {
            const isBusy = actionId === `studio-${studio.id}`
            return (
              <div className="studio-review-row" key={studio.id}>
                <div>
                  <strong>{getStudioName(studio)}</strong>
                  <small>{studio.email || studio.ownerEmail || studio.phone || studio.ownerPhone || 'Sin contacto'} / {studio.city || 'Sin ciudad'}</small>
                </div>
                <StatusPill tone="pending">Pendiente</StatusPill>
                <div className="studio-review-actions">
                  <Button disabled={isBusy} size="sm" variant="ghost" onClick={() => setProfilePreview({ type: 'studio', item: studio })}>Ver perfil</Button>
                  <Button disabled={isBusy} size="sm" onClick={() => runStudioAction(studio, 'approve')}>Aprobar</Button>
                  <Button disabled={isBusy} size="sm" variant="ghost" onClick={() => runStudioAction(studio, 'reject')}>Rechazar</Button>
                </div>
              </div>
            )
          })}

          {!isLoadingStudios && pendingStudios.length === 0 && (
            <div className="studio-review-row">
              <div>
                <strong>No hay estudios pendientes.</strong>
                <small>Las solicitudes aprobadas o rechazadas salen de esta lista.</small>
              </div>
              <StatusPill tone="success">Al dia</StatusPill>
            </div>
          )}
        </div>
      </Card>

      <Card className="wide-card executive-card">
        <PanelHeader title="Artistas nuevas" eyebrow="Filtro Studio Flow" />
        <div className="studio-review-stack">
          <div className="approval-section-heading">
            <h3>Solicitudes de artistas</h3>
            <StatusPill tone={pendingArtists.length ? 'warm' : 'success'}>{pendingArtists.length} pendientes</StatusPill>
          </div>

          {pendingArtists.map((artist) => {
            const isBusy = actionId === `artist-${artist.id}`
            return (
              <div className="studio-review-row" key={artist.id}>
                <div>
                  <strong>{getArtistName(artist)}</strong>
                  <small>{artist.email || artist.phone || artist.city || 'Sin contacto'}</small>
                </div>
                <StatusPill tone="pending">Pendiente</StatusPill>
                <div className="studio-review-actions">
                  <Button disabled={isBusy} size="sm" variant="ghost" onClick={() => setProfilePreview({ type: 'artist', item: artist })}>Ver perfil</Button>
                  <Button disabled={isBusy} size="sm" onClick={() => runArtistAction(artist, 'approve')}>Aprobar</Button>
                  <Button disabled={isBusy} size="sm" variant="ghost" onClick={() => runArtistAction(artist, 'reject')}>Rechazar</Button>
                </div>
              </div>
            )
          })}

          {pendingArtists.length === 0 && (
            <div className="studio-review-row">
              <div>
                <strong>No hay artistas pendientes.</strong>
                <small>Las artistas aprobadas pasan a activas; las rechazadas quedan congeladas.</small>
              </div>
              <StatusPill tone="success">Al dia</StatusPill>
            </div>
          )}
        </div>
      </Card>

      {profilePreview && (
        <Card className="wide-card executive-card">
          <PanelHeader
            title={profilePreview.type === 'studio' ? 'Perfil del estudio' : 'Perfil de artista'}
            eyebrow="Revision"
            action={<Button size="sm" variant="ghost" onClick={() => setProfilePreview(null)}>Cerrar</Button>}
          />
          <div className="compact-list">
            {getProfileRows(profilePreview.item, profilePreview.type).map(([label, value]) => (
              <div className="list-row elevated-row" key={label}>
                <div>
                  <strong>{label}</strong>
                  <small>{value || 'Sin dato capturado'}</small>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </main>
  )
}

export default QASandbox
