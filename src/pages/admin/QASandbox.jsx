import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import '../../components/ownerStatusMetric.css'
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
  const [showRejected, setShowRejected] = useState({ studio: false, artist: false })

  const loadStudios = async () => {
    setIsLoadingStudios(true)
    setSystemError('')

    try {
      setStudios(await fetchOwnerStudios())
    } catch (error) {
      setStudios([])
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
  const rejectedArtists = useMemo(
    () => adminState.artists.filter((artist) => ['rechazado', 'rejected'].includes(String(artist.status).toLowerCase())),
    [adminState.artists],
  )
  const rejectedStudios = studios.filter((studio) => studio.studioStatus === 'rejected')

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
      <Card className="metric-card owner-status-metric">
        <h2>Solicitudes pendientes</h2>
        <div className="owner-status-columns">
          <div className="owner-status-half"><span>Estudios</span><strong>{pendingStudios.length}</strong></div>
          <div className="owner-status-half"><span>Artistas</span><strong>{pendingArtists.length}</strong></div>
        </div>
      </Card>
      <Card className="metric-card owner-status-metric">
        <h2>Perfiles rechazados</h2>
        <div className="owner-status-columns">
          {[
            ['studio', 'Estudios', rejectedStudios.length],
            ['artist', 'Artistas', rejectedArtists.length],
          ].map(([type, label, count]) => <div className="owner-status-half owner-status-suspended" key={type}>
            <span>{label}</span><strong>{count}</strong>
            <Button size="sm" variant="ghost" aria-expanded={showRejected[type]} aria-controls={`rejected-${type}`}
              onClick={() => setShowRejected((current) => ({ ...current, [type]: !current[type] }))}>
              {showRejected[type] ? 'Ocultar' : 'Ver'} {label.toLowerCase()}
            </Button>
          </div>)}
        </div>
      </Card>

      {[
        ['studio', 'Estudios rechazados', rejectedStudios],
        ['artist', 'Artistas rechazadas', rejectedArtists],
      ].map(([type, title, items]) => showRejected[type] && <section className="wide-card" id={`rejected-${type}`} key={type}>
        <PanelHeader title={title} />
        <div className="studio-review-stack">
          {items.length === 0 && <p>No hay perfiles rechazados en esta categoria.</p>}
          {items.map((item) => <Card key={item.id} className="studio-review-row">
            <div>
              <strong>{type === 'studio' ? getStudioName(item) : getArtistName(item)}</strong>
              <small>{item.email || item.ownerEmail || item.phone || item.ownerPhone || 'Sin contacto'}</small>
            </div>
            <StatusPill tone="rejected">Rechazado</StatusPill>
            <Button size="sm" variant="ghost" onClick={() => setProfilePreview({ type, item })}>Ver perfil</Button>
          </Card>)}
        </div>
      </section>)}

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
