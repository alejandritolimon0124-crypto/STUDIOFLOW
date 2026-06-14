import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { getCurrentBrowserCoordinates } from '../../utils/browserGeolocation'
import { hasPermission, permissions, ROLES } from '../../modules/permissions/rolePermissions'
import {
  deriveMembershipsFromLegacyData,
  getArtistsForStudio,
  getStudioForArtist,
  getStudiosForArtist,
} from '../../modules/entities/entitySelectors'
import { buildGoogleMapsUrl, createArtistLocationSettings, createProfessionalLocation, validateProfessionalLocation } from '../../utils/locationHelpers'

const uniqueById = (items = []) => Array.from(new Map(items.filter(Boolean).map((item) => [item.id, item])).values())

function AdminArtists() {
  const navigate = useNavigate()
  const {
    adminState,
    session,
    toggleManagedArtistStatus,
    updateManagedArtistProfile,
    updateManagedStudioProfile,
    publishIndependentArtistProfile,
    isPublicationLoading,
    publicationError,
  } = useApp()
  const [query, setQuery] = useState('')
  const [editingArtist, setEditingArtist] = useState(null)
  const [dashboardArtist, setDashboardArtist] = useState(null)
  const [studioLocationDraft, setStudioLocationDraft] = useState(createProfessionalLocation())
  const [studioLocationErrors, setStudioLocationErrors] = useState({})
  const [studioLocationDetection, setStudioLocationDetection] = useState({ status: 'idle', message: '' })
  const [artistLocationDraft, setArtistLocationDraft] = useState(createArtistLocationSettings())
  const [artistLocationErrors, setArtistLocationErrors] = useState({})
  const [artistLocationDetection, setArtistLocationDetection] = useState({ status: 'idle', message: '' })
  const normalizedRole = session.user?.role === 'admin' ? ROLES.PLATFORM_OWNER : session.user?.role
  const isPlatformOwner = normalizedRole === ROLES.PLATFORM_OWNER
  const artistStudioMemberships = useMemo(
    () => deriveMembershipsFromLegacyData({ artists: adminState.artists }),
    [adminState.artists],
  )
  const artistsOwnedByUser = useMemo(
    () => adminState.artists.filter((artist) => artist.owner === session.user?.name || artist.name === session.user?.name),
    [adminState.artists, session.user?.name],
  )
  const accessibleStudios = useMemo(
    () => (
      isPlatformOwner
        ? adminState.studios
        : uniqueById(artistsOwnedByUser.flatMap((artist) => getStudiosForArtist({
          artistId: artist.id,
          studios: adminState.studios,
          artistStudioMemberships,
        })))
    ),
    [adminState.studios, artistStudioMemberships, artistsOwnedByUser, isPlatformOwner],
  )
  const accessibleStudioIds = accessibleStudios.map((studio) => studio.id)
  const accessibleArtists = useMemo(
    () => (
      isPlatformOwner
        ? adminState.artists
        : uniqueById(accessibleStudioIds.flatMap((studioId) => getArtistsForStudio({
          studioId,
          artists: adminState.artists,
          artistStudioMemberships,
        })))
    ),
    [accessibleStudioIds, adminState.artists, artistStudioMemberships, isPlatformOwner],
  )

  const filteredArtists = useMemo(
    () =>
      accessibleArtists.filter((artist) => {
        const searchable = `${artist.name} ${artist.owner} ${artist.city} ${artist.plan}`.toLowerCase()
        return searchable.includes(query.toLowerCase())
      }),
    [accessibleArtists, query],
  )
  const canSeeStudioRevenue = hasPermission(session.user, permissions.STUDIO_REVENUE)
  const editingStudio = getStudioForArtist({
    artistId: editingArtist?.id,
    studios: adminState.studios,
    artistStudioMemberships,
  })
  const studioMapsUrl = buildGoogleMapsUrl(studioLocationDraft)
  const effectiveArtistLocation = artistLocationDraft.useStudioLocation
    ? studioLocationDraft
    : artistLocationDraft.customLocation
  const artistMapsUrl = buildGoogleMapsUrl(effectiveArtistLocation)

  useEffect(() => {
    if (!editingArtist) {
      setStudioLocationDraft(createProfessionalLocation())
      setStudioLocationErrors({})
      setStudioLocationDetection({ status: 'idle', message: '' })
      setArtistLocationDraft(createArtistLocationSettings())
      setArtistLocationErrors({})
      setArtistLocationDetection({ status: 'idle', message: '' })
      return
    }

    const artistStudio = getStudioForArtist({
      artistId: editingArtist.id,
      studios: adminState.studios,
      artistStudioMemberships,
    })
    setStudioLocationDraft(createProfessionalLocation({
      city: artistStudio?.professionalLocation?.city || artistStudio?.city || editingArtist.city,
      ...(artistStudio?.professionalLocation || {}),
      businessName: artistStudio?.profile?.commercialName || '',
    }))
    setArtistLocationDraft(createArtistLocationSettings(editingArtist.professionalLocation))
    setStudioLocationErrors({})
    setArtistLocationErrors({})
    setStudioLocationDetection({ status: 'idle', message: '' })
    setArtistLocationDetection({ status: 'idle', message: '' })
  }, [adminState.studios, artistStudioMemberships, editingArtist?.id])

  const openDashboard = (artist) => {
    setDashboardArtist(artist)
    navigate(paths.adminArtists, { state: { dashboardArtistId: artist.id } })
  }

  const publishArtist = (artist) => {
    publishIndependentArtistProfile({
      artistId: artist.id,
      title: artist.name,
      summary: artist.description,
      city: artist.city,
    })
  }

  const saveArtistProfile = () => {
    if (!editingArtist) return

    const nextStudioLocationErrors = validateProfessionalLocation(studioLocationDraft)

    if (Object.keys(nextStudioLocationErrors).length > 0) {
      setStudioLocationErrors(nextStudioLocationErrors)
      return
    }

    if (!artistLocationDraft.useStudioLocation) {
      const nextArtistLocationErrors = validateProfessionalLocation(artistLocationDraft.customLocation)

      if (Object.keys(nextArtistLocationErrors).length > 0) {
        setArtistLocationErrors(nextArtistLocationErrors)
        return
      }
    }

    updateManagedArtistProfile(editingArtist.id, {
      ...editingArtist,
      professionalLocation: artistLocationDraft,
    })
    if (editingStudio) {
      updateManagedStudioProfile(editingStudio.id, {
        professionalLocation: {
          ...studioLocationDraft,
          businessName: editingStudio.profile?.commercialName || '',
        },
      })
    }
    setEditingArtist(null)
  }

  const updateStudioLocationDraft = (field, value) => {
    setStudioLocationDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
    setStudioLocationErrors((currentErrors) => ({
      ...currentErrors,
      [field]: '',
    }))
  }

  const updateArtistLocationMode = (useStudioLocation) => {
    setArtistLocationDraft((currentDraft) => ({
      ...currentDraft,
      useStudioLocation,
    }))
    setArtistLocationErrors({})
  }

  const updateArtistCustomLocation = (field, value) => {
    setArtistLocationDraft((currentDraft) => ({
      ...currentDraft,
      customLocation: {
        ...currentDraft.customLocation,
        [field]: value,
      },
    }))
    setArtistLocationErrors((currentErrors) => ({
      ...currentErrors,
      [field]: '',
    }))
  }

  const useCurrentStudioLocation = async () => {
    setStudioLocationDetection({ status: 'loading', message: 'Detectando ubicacion actual...' })

    try {
      const coordinates = await getCurrentBrowserCoordinates()

      setStudioLocationDraft((currentDraft) => ({
        ...currentDraft,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      }))
      setStudioLocationErrors((currentErrors) => ({
        ...currentErrors,
        latitude: '',
        longitude: '',
      }))
      setStudioLocationDetection({
        status: 'success',
        message: `Ubicacion detectada: ${coordinates.latitude}, ${coordinates.longitude}`,
      })
    } catch (error) {
      setStudioLocationDetection({
        status: 'error',
        message: error.message || 'No se pudo usar la ubicacion actual.',
      })
    }
  }

  const useCurrentArtistLocation = async () => {
    setArtistLocationDetection({ status: 'loading', message: 'Detectando ubicacion actual...' })

    try {
      const coordinates = await getCurrentBrowserCoordinates()

      setArtistLocationDraft((currentDraft) => ({
        ...currentDraft,
        customLocation: {
          ...currentDraft.customLocation,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
      }))
      setArtistLocationErrors((currentErrors) => ({
        ...currentErrors,
        latitude: '',
        longitude: '',
      }))
      setArtistLocationDetection({
        status: 'success',
        message: `Ubicacion detectada: ${coordinates.latitude}, ${coordinates.longitude}`,
      })
    } catch (error) {
      setArtistLocationDetection({
        status: 'error',
        message: error.message || 'No se pudo usar la ubicacion actual.',
      })
    }
  }

  return (
    <main className="dashboard-grid admin-grid">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Gestion de artistas" eyebrow="Admin" action={<Button size="sm">Nueva artista</Button>} />
          <div className="admin-search">
            <Input
              label="Buscar artista"
              type="search"
              placeholder="Nombre, ciudad o plan..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {publicationError && <small className="form-error">{publicationError}</small>}
          </div>
          <div className="master-list">
            {filteredArtists.length === 0 ? (
              <article className="master-row">
                <div>
                  <strong>No hay artistas en este scope.</strong>
                  <small>Cuando Supabase devuelva artistas reales, apareceran aqui.</small>
                </div>
              </article>
            ) : filteredArtists.map((artist) => (
              <article className="master-row" key={artist.name}>
                <div>
                  <strong>{artist.name}</strong>
                  <small>{artist.owner} / {artist.city} / {artist.plan}</small>
                </div>
                <StatusPill tone={artist.status === 'Activo' ? 'success' : 'neutral'}>{artist.status}</StatusPill>
                <div className="row-actions">
                  <button type="button" onClick={() => toggleManagedArtistStatus(artist.id)}>
                    {artist.status === 'Activo' ? 'Inactivar' : 'Activar'}
                  </button>
                  {isPlatformOwner && !artist.studioId && !artist.membershipId && (
                    <button
                      type="button"
                      disabled={isPublicationLoading || artist.status !== 'Activo'}
                      onClick={() => publishArtist(artist)}
                    >
                      Publicar artista
                    </button>
                  )}
                  <button type="button" onClick={() => openDashboard(artist)}>Ver dashboard</button>
                  <button type="button" onClick={() => setEditingArtist(artist)}>Editar perfil</button>
                </div>
              </article>
            ))}
          </div>
        </Card>

        {dashboardArtist && (
          <Card className="mobile-screen">
            <PanelHeader title="Dashboard artista" eyebrow="Vista admin" />
            <div className="compact-list">
              <div className="list-row elevated-row">
                <div>
                  <strong>{dashboardArtist.name}</strong>
                  <small>{dashboardArtist.description}</small>
                </div>
                <StatusPill tone={dashboardArtist.status === 'Activo' ? 'success' : 'neutral'}>
                  {dashboardArtist.status}
                </StatusPill>
              </div>
              <div className="list-row elevated-row">
                <div>
                  <strong>{dashboardArtist.city}</strong>
                  <small>{dashboardArtist.plan} / {dashboardArtist.services}</small>
                </div>
                {canSeeStudioRevenue && <span>{dashboardArtist.revenue}</span>}
              </div>
            </div>
          </Card>
        )}

        {editingArtist && (
          <Card className="mobile-screen">
            <PanelHeader title="Editar perfil" eyebrow="Artista" />
            <div className="form-stack compact-form">
              <Input
                label="Nombre"
                value={editingArtist.name}
                onChange={(event) => setEditingArtist({ ...editingArtist, name: event.target.value })}
              />
              <Input
                label="Ciudad"
                value={editingArtist.city}
                onChange={(event) => setEditingArtist({ ...editingArtist, city: event.target.value })}
              />
              <Input
                label="Plan"
                value={editingArtist.plan}
                onChange={(event) => setEditingArtist({ ...editingArtist, plan: event.target.value })}
              />
              <Input
                label="Servicios"
                value={editingArtist.services}
                onChange={(event) => setEditingArtist({ ...editingArtist, services: event.target.value })}
              />
              <label className="input-field">
                <span>Descripcion</span>
                <textarea
                  value={editingArtist.description}
                  onChange={(event) => setEditingArtist({ ...editingArtist, description: event.target.value })}
                  rows="3"
                />
              </label>
              <div className="location-foundation-card">
                <div>
                  <span className="eyebrow">Foundation</span>
                  <h3>Ubicacion del Estudio</h3>
                  <small>Esta direccion queda lista para perfil publico, confirmaciones y mapas futuros.</small>
                </div>
                <Input
                  label="Nombre comercial"
                  readOnly
                  value={editingStudio?.profile?.commercialName || ''}
                />
                <Input
                  helper={studioLocationErrors.address}
                  label="Direccion"
                  value={studioLocationDraft.address}
                  onChange={(event) => updateStudioLocationDraft('address', event.target.value)}
                />
                <div className="location-form-grid">
                  <Input
                    helper={studioLocationErrors.city}
                    label="Ciudad"
                    value={studioLocationDraft.city}
                    onChange={(event) => updateStudioLocationDraft('city', event.target.value)}
                  />
                  <Input
                    helper={studioLocationErrors.state}
                    label="Estado"
                    value={studioLocationDraft.state}
                    onChange={(event) => updateStudioLocationDraft('state', event.target.value)}
                  />
                </div>
                <div className="location-form-grid">
                  <Input
                    label="Codigo Postal"
                    value={studioLocationDraft.postalCode}
                    onChange={(event) => updateStudioLocationDraft('postalCode', event.target.value)}
                  />
                  <Input
                    label="Latitude"
                    value={studioLocationDraft.latitude}
                    onChange={(event) => updateStudioLocationDraft('latitude', event.target.value)}
                  />
                </div>
                <Input
                  label="Longitude"
                  value={studioLocationDraft.longitude}
                  onChange={(event) => updateStudioLocationDraft('longitude', event.target.value)}
                />
                <div className="location-detection-row">
                  <Button
                    disabled={studioLocationDetection.status === 'loading'}
                    size="sm"
                    variant="ghost"
                    onClick={useCurrentStudioLocation}
                  >
                    {studioLocationDetection.status === 'loading' ? 'Detectando...' : '📍 Usar mi ubicacion actual'}
                  </Button>
                  {studioLocationDetection.message && (
                    <small className={`location-detection-message location-detection-${studioLocationDetection.status}`}>
                      {studioLocationDetection.message}
                    </small>
                  )}
                </div>
                <label className="input-field">
                  <span>Referencias</span>
                  <textarea
                    value={studioLocationDraft.address_references}
                    onChange={(event) => updateStudioLocationDraft('address_references', event.target.value)}
                    rows="3"
                  />
                </label>
                <small className="location-helper-text">
                  Google Maps futuro: {studioMapsUrl || 'Completa direccion, ciudad y estado para generar la URL base.'}
                </small>
              </div>
              <div className="location-foundation-card">
                <div>
                  <span className="eyebrow">Foundation</span>
                  <h3>Ubicacion Profesional</h3>
                  <small>Define si esta artista usa la direccion del estudio o una ubicacion propia.</small>
                </div>
                <div className="location-option-stack">
                  <label className="location-toggle-row">
                    <input
                      checked={artistLocationDraft.useStudioLocation}
                      name="artist-location-mode"
                      onChange={() => updateArtistLocationMode(true)}
                      type="radio"
                    />
                    <span>Usar ubicacion del estudio</span>
                  </label>
                  <label className="location-toggle-row">
                    <input
                      checked={!artistLocationDraft.useStudioLocation}
                      name="artist-location-mode"
                      onChange={() => updateArtistLocationMode(false)}
                      type="radio"
                    />
                    <span>Usar ubicacion personalizada</span>
                  </label>
                </div>
                {artistLocationDraft.useStudioLocation ? (
                  <div className="location-summary">
                    <strong>{editingStudio?.profile?.commercialName || 'Estudio profesional'}</strong>
                    <small>
                      {[
                        studioLocationDraft.address,
                        studioLocationDraft.city,
                        studioLocationDraft.state,
                      ].filter(Boolean).join(' / ') || 'Ubicacion del estudio pendiente.'}
                    </small>
                  </div>
                ) : (
                  <>
                    <Input
                      helper={artistLocationErrors.address}
                      label="Direccion"
                      value={artistLocationDraft.customLocation.address}
                      onChange={(event) => updateArtistCustomLocation('address', event.target.value)}
                    />
                    <div className="location-form-grid">
                      <Input
                        helper={artistLocationErrors.city}
                        label="Ciudad"
                        value={artistLocationDraft.customLocation.city}
                        onChange={(event) => updateArtistCustomLocation('city', event.target.value)}
                      />
                      <Input
                        helper={artistLocationErrors.state}
                        label="Estado"
                        value={artistLocationDraft.customLocation.state}
                        onChange={(event) => updateArtistCustomLocation('state', event.target.value)}
                      />
                    </div>
                    <div className="location-form-grid">
                      <Input
                        label="Codigo Postal"
                        value={artistLocationDraft.customLocation.postalCode}
                        onChange={(event) => updateArtistCustomLocation('postalCode', event.target.value)}
                      />
                      <Input
                        label="Latitude"
                        value={artistLocationDraft.customLocation.latitude}
                        onChange={(event) => updateArtistCustomLocation('latitude', event.target.value)}
                      />
                    </div>
                    <Input
                      label="Longitude"
                      value={artistLocationDraft.customLocation.longitude}
                      onChange={(event) => updateArtistCustomLocation('longitude', event.target.value)}
                    />
                    <div className="location-detection-row">
                      <Button
                        disabled={artistLocationDetection.status === 'loading'}
                        size="sm"
                        variant="ghost"
                        onClick={useCurrentArtistLocation}
                      >
                        {artistLocationDetection.status === 'loading' ? 'Detectando...' : '📍 Usar mi ubicacion actual'}
                      </Button>
                      {artistLocationDetection.message && (
                        <small className={`location-detection-message location-detection-${artistLocationDetection.status}`}>
                          {artistLocationDetection.message}
                        </small>
                      )}
                    </div>
                    <label className="input-field">
                      <span>Referencias</span>
                      <textarea
                        value={artistLocationDraft.customLocation.address_references}
                        onChange={(event) => updateArtistCustomLocation('address_references', event.target.value)}
                        rows="3"
                      />
                    </label>
                  </>
                )}
                <small className="location-helper-text">
                  Google Maps futuro: {artistMapsUrl || 'Completa una ubicacion profesional para generar la URL base.'}
                </small>
              </div>
              <div className="row-actions">
                <button type="button" onClick={saveArtistProfile}>Guardar cambios</button>
                <button type="button" onClick={() => setEditingArtist(null)}>Cancelar</button>
              </div>
            </div>
          </Card>
        )}
    </main>
  )
}

export default AdminArtists
