import { useMemo, useState } from 'react'
import Button from '../../components/Button'
import OwnerAgenda from '../../components/OwnerAgenda'
import Card from '../../components/Card'
import Input from '../../components/Input'
import MetricCard from '../../components/MetricCard'
import OwnerStatusMetric from '../../components/OwnerStatusMetric'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { getCurrentBrowserCoordinates } from '../../utils/browserGeolocation'
import {
  deriveMembershipsFromLegacyData,
  getArtistsForStudio,
  getStudioForArtist,
  getStudiosForArtist,
} from '../../modules/entities/entitySelectors'
import { ROLES } from '../../modules/permissions/rolePermissions'
import { buildGoogleMapsUrl, createArtistLocationSettings, createProfessionalLocation, hasCoordinates, validateProfessionalLocation } from '../../utils/locationHelpers'

const uniqueById = (items = []) => Array.from(new Map(items.filter(Boolean).map((item) => [item.id, item])).values())
const parseMoneyValue = (value) => Number(String(value || '').replace(/[^\d.-]/g, '')) || 0

function AdminArtists() {
  const {
    adminState,
    adminArtistsError,
    loadAdminArtists,
    session,
    reviewManagedArtist,
    toggleManagedArtistStatus,
    updateManagedArtistProfile,
    updateManagedStudioProfile,
  } = useApp()
  const [query, setQuery] = useState('')
  const [editingArtist, setEditingArtist] = useState(null)
  const [studioLocationDraft, setStudioLocationDraft] = useState(createProfessionalLocation())
  const [studioLocationErrors, setStudioLocationErrors] = useState({})
  const [studioLocationDetection, setStudioLocationDetection] = useState({ status: 'idle', message: '' })
  const [isStudioLocationConfirmed, setIsStudioLocationConfirmed] = useState(false)
  const [artistLocationDraft, setArtistLocationDraft] = useState(createArtistLocationSettings())
  const [artistLocationErrors, setArtistLocationErrors] = useState({})
  const [artistLocationDetection, setArtistLocationDetection] = useState({ status: 'idle', message: '' })
  const [isArtistLocationConfirmed, setIsArtistLocationConfirmed] = useState(false)
  const [isSavingArtist, setIsSavingArtist] = useState(false)
  const [isSavingLinkedStudio, setIsSavingLinkedStudio] = useState(false)
  const [profileSaveFeedback, setProfileSaveFeedback] = useState({ tone: 'neutral', message: '' })
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
        const searchable = `${artist.name} ${artist.email} ${artist.phone} ${artist.owner} ${artist.city} ${artist.plan}`.toLowerCase()
        return searchable.includes(query.toLowerCase())
      })
        .sort((firstArtist, secondArtist) => parseMoneyValue(secondArtist.revenue) - parseMoneyValue(firstArtist.revenue))
        .slice(0, 5),
    [accessibleArtists, query],
  )
  const activeArtistsCount = accessibleArtists.filter((artist) => artist.status === 'Activo').length
  const pendingArtistsCount = accessibleArtists.filter((artist) => artist.status === 'Pendiente').length
  const suspendedArtistsCount = accessibleArtists.filter((artist) => ['suspendido', 'suspendida', 'suspended', 'inactivo', 'inactive'].includes(String(artist.status).toLowerCase())).length
  const rejectedArtists = accessibleArtists.filter((artist) => artist.status === 'Rechazado')
  const rejectedArtistsCount = rejectedArtists.length
  const previewRejectedArtists = rejectedArtists.slice(0, 5)
  const editingStudio = getStudioForArtist({
    artistId: editingArtist?.id,
    studios: adminState.studios,
    artistStudioMemberships,
  })
  const studioMapsUrl = buildGoogleMapsUrl(studioLocationDraft)
  const studioLocationHasCoordinates = hasCoordinates(studioLocationDraft)
  const effectiveArtistLocation = artistLocationDraft.useStudioLocation
    ? studioLocationDraft
    : artistLocationDraft.customLocation
  const artistMapsUrl = buildGoogleMapsUrl(effectiveArtistLocation)
  const artistCustomLocationHasCoordinates = hasCoordinates(artistLocationDraft.customLocation)

  const openArtistProfile = (artist) => {
    setEditingArtist(artist)
    const artistStudio = getStudioForArtist({
      artistId: artist.id,
      studios: adminState.studios,
      artistStudioMemberships,
    })
    setStudioLocationDraft(createProfessionalLocation({
      city: artistStudio?.professionalLocation?.city || artistStudio?.city || artist.city,
      ...(artistStudio?.professionalLocation || {}),
      businessName: artistStudio?.profile?.commercialName || '',
    }))
    setArtistLocationDraft(createArtistLocationSettings(artist.professionalLocation))
    setStudioLocationErrors({})
    setArtistLocationErrors({})
    setStudioLocationDetection({ status: 'idle', message: '' })
    setArtistLocationDetection({ status: 'idle', message: '' })
    setIsStudioLocationConfirmed(false)
    setIsArtistLocationConfirmed(false)
    setProfileSaveFeedback({ tone: 'neutral', message: '' })
  }

  const saveArtistProfile = async () => {
    if (!editingArtist) return

    if (!artistLocationDraft.useStudioLocation) {
      const nextArtistLocationErrors = validateProfessionalLocation(artistLocationDraft.customLocation)

      if (Object.keys(nextArtistLocationErrors).length > 0) {
        setArtistLocationErrors(nextArtistLocationErrors)
        return
      }

      if (artistCustomLocationHasCoordinates && !isArtistLocationConfirmed) {
        setArtistLocationErrors({ latitude: 'Confirma que esta ubicacion corresponde a tu estudio.' })
        return
      }
    }

    setIsSavingArtist(true)
    setProfileSaveFeedback({ tone: 'neutral', message: '' })
    const savedArtist = await updateManagedArtistProfile(editingArtist.id, {
      name: editingArtist.name,
      city: editingArtist.city,
      services: editingArtist.services,
      description: editingArtist.description,
      contactLinks: editingArtist.contactLinks || {},
      professionalLocation: artistLocationDraft,
    })
    setIsSavingArtist(false)

    if (!savedArtist) {
      setProfileSaveFeedback({ tone: 'warm', message: 'No se pudo guardar el perfil de la artista. Revisa el aviso mostrado arriba.' })
      return
    }

    setEditingArtist((currentArtist) => ({ ...currentArtist, ...savedArtist }))
    setProfileSaveFeedback({ tone: 'success', message: 'Perfil y ubicación profesional de la artista actualizados.' })
  }

  const saveLinkedStudioLocation = async () => {
    if (!editingStudio) return
    const nextStudioLocationErrors = validateProfessionalLocation(studioLocationDraft)

    if (Object.keys(nextStudioLocationErrors).length > 0) {
      setStudioLocationErrors(nextStudioLocationErrors)
      return
    }

    if (studioLocationHasCoordinates && !isStudioLocationConfirmed) {
      setStudioLocationErrors({ latitude: 'Confirma que esta ubicación corresponde al estudio vinculado.' })
      return
    }

    setIsSavingLinkedStudio(true)
    setProfileSaveFeedback({ tone: 'neutral', message: '' })
    const savedStudio = await updateManagedStudioProfile(editingStudio.id, {
      professionalLocation: {
        ...studioLocationDraft,
        businessName: editingStudio.profile?.commercialName || '',
      },
    })
    setIsSavingLinkedStudio(false)

    setProfileSaveFeedback(savedStudio
      ? { tone: 'success', message: 'Ubicación del estudio vinculado actualizada sin modificar la ubicación personal de la artista.' }
      : { tone: 'warm', message: 'No se pudo guardar la ubicación del estudio vinculado.' })
  }

  const updateStudioLocationDraft = (field, value) => {
    setStudioLocationDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
    if (['address', 'city', 'state', 'postalCode', 'latitude', 'longitude'].includes(field)) {
      setIsStudioLocationConfirmed(false)
    }
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
    if (['address', 'city', 'state', 'postalCode', 'latitude', 'longitude'].includes(field)) {
      setIsArtistLocationConfirmed(false)
    }
  }

  const updateArtistContactLink = (field, value) => {
    setEditingArtist((currentArtist) => ({
      ...currentArtist,
      contactLinks: {
        ...(currentArtist.contactLinks || {}),
        [field]: value,
      },
    }))
  }

  const approveArtist = async (artistId) => {
    const result = await reviewManagedArtist(artistId, 'approve')
    if (result) {
      loadAdminArtists?.().catch(() => null)
    }
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
        message: `Ubicacion detectada: ${coordinates.latitude}, ${coordinates.longitude}. Esta ubicacion es aproximada. Verifica que corresponda a tu direccion antes de guardar.`,
      })
      setIsStudioLocationConfirmed(false)
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
        message: `Ubicacion detectada: ${coordinates.latitude}, ${coordinates.longitude}. Esta ubicacion es aproximada. Verifica que corresponda a tu direccion antes de guardar.`,
      })
      setIsArtistLocationConfirmed(false)
    } catch (error) {
      setArtistLocationDetection({
        status: 'error',
        message: error.message || 'No se pudo usar la ubicacion actual.',
      })
    }
  }

  return (
    <main className="dashboard-grid admin-grid">
        {isPlatformOwner ? <OwnerStatusMetric positive={activeArtistsCount} negative={suspendedArtistsCount} positiveLabel="Activas" negativeLabel="Suspendidas" /> : <MetricCard
          label="Artistas activas"
          value={activeArtistsCount}
          trend={`${pendingArtistsCount} pendientes`}
          tone="success"
        />}
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Artistas rechazadas" eyebrow="Resumen" />
          <div className="compact-list">
            <div className="list-row elevated-row">
              <div>
                <strong>{rejectedArtistsCount}</strong>
                <small>No aparecen en Studio Flow.</small>
              </div>
              <StatusPill tone={rejectedArtistsCount ? 'warm' : 'success'}>
                {rejectedArtistsCount ? 'Revisar' : 'Sin rechazadas'}
              </StatusPill>
            </div>
            {previewRejectedArtists.map((artist) => (
              <div className="list-row elevated-row" key={artist.id || artist.name}>
                <div>
                  <strong>{artist.name}</strong>
                  <small>{artist.email || artist.phone || artist.city || 'Sin contacto'}</small>
                </div>
                <button type="button" onClick={() => openArtistProfile(artist)}>Ver perfil</button>
              </div>
            ))}
          </div>
        </Card>
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Gestion de artistas" eyebrow="Admin" action={<Button size="sm">Nueva artista</Button>} />
          {adminArtistsError && <small className="form-error">{adminArtistsError}</small>}
          <div className="admin-search">
            <Input
              label="Buscar artista"
              type="search"
              placeholder="Nombre, correo o celular..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="master-list">
            {filteredArtists.length === 0 ? (
              <article className="master-row">
                <div>
                  <strong>No se encontraron artistas.</strong>
                  <small>Prueba con otro nombre, correo o celular.</small>
                </div>
              </article>
            ) : filteredArtists.map((artist) => {
              const isActive = artist.status === 'Activo'
              const needsApproval = artist.status === 'Pendiente' || artist.status === 'Rechazado'
              return (
                <article className="master-row" key={artist.id || artist.name}>
                  <div>
                    <strong>{artist.name}</strong>
                    <small>{artist.owner} / {artist.city} / {artist.plan}</small>
                  </div>
                  <StatusPill tone={isActive ? 'success' : artist.status === 'Rechazado' ? 'neutral' : 'warm'}>{artist.status}</StatusPill>
                  <div className="row-actions">
                    {needsApproval ? (
                      <button type="button" onClick={() => approveArtist(artist.id)}>
                        Aprobar
                      </button>
                    ) : (
                      <button type="button" onClick={() => toggleManagedArtistStatus(artist.id)}>
                        {isActive ? 'Suspender' : 'Reactivar'}
                      </button>
                    )}
                    <button type="button" onClick={() => openArtistProfile(artist)}>Editar perfil</button>
                  </div>
                  {isPlatformOwner && <OwnerAgenda entityType="artist" entityId={artist.id} />}
                </article>
              )
            })}
          </div>
        </Card>

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
              {editingStudio && <div className="location-foundation-card linked-studio-location-card">
                <div>
                  <span className="eyebrow">Vinculacion a estudio</span>
                  <h3>Datos del estudio vinculado</h3>
                  <small>Estos datos pertenecen al estudio owner y se guardan por separado del perfil de la artista.</small>
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
                    helper={studioLocationErrors.latitude || 'Puedes ajustar manualmente las coordenadas si el punto no es exacto.'}
                    label="Latitud"
                    value={studioLocationDraft.latitude}
                    onChange={(event) => updateStudioLocationDraft('latitude', event.target.value)}
                  />
                </div>
                <Input
                  helper="Puedes ajustar manualmente las coordenadas si el punto no es exacto."
                  label="Longitud"
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
                {studioLocationHasCoordinates && (
                  <div className="location-detection-row">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(studioMapsUrl, '_blank', 'noopener,noreferrer')}
                    >
                      Ver ubicacion en Google Maps
                    </Button>
                    <label className="location-toggle-row">
                      <input
                        checked={isStudioLocationConfirmed}
                        type="checkbox"
                        onChange={(event) => setIsStudioLocationConfirmed(event.target.checked)}
                      />
                      <span>Confirmo que esta ubicacion corresponde al estudio vinculado.</span>
                    </label>
                  </div>
                )}
                <label className="input-field">
                  <span>Referencias</span>
                  <textarea
                    value={studioLocationDraft.address_references}
                    onChange={(event) => updateStudioLocationDraft('address_references', event.target.value)}
                    rows="3"
                  />
                </label>
                <small className="location-helper-text">
                  Google Maps: {studioMapsUrl || 'Completa direccion, ciudad y estado para generar la URL base.'}
                </small>
                <Button disabled={isSavingLinkedStudio} onClick={saveLinkedStudioLocation}>
                  {isSavingLinkedStudio ? 'Guardando...' : 'Guardar ubicacion del estudio vinculado'}
                </Button>
              </div>}
              <div className="location-foundation-card artist-personal-location-card">
                <div>
                  <span className="eyebrow">Ubicacion profesional</span>
                  <h3>Ubicacion de la artista</h3>
                  <small>Define si trabaja en el estudio vinculado o en una ubicacion independiente. Sus coordenadas se guardan unicamente en su perfil.</small>
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
                        helper={artistLocationErrors.latitude || 'Puedes ajustar manualmente las coordenadas si el punto no es exacto.'}
                        label="Latitud"
                        value={artistLocationDraft.customLocation.latitude}
                        onChange={(event) => updateArtistCustomLocation('latitude', event.target.value)}
                      />
                    </div>
                    <Input
                      helper="Puedes ajustar manualmente las coordenadas si el punto no es exacto."
                      label="Longitud"
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
                    {artistCustomLocationHasCoordinates && (
                      <div className="location-detection-row">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(buildGoogleMapsUrl(artistLocationDraft.customLocation), '_blank', 'noopener,noreferrer')}
                        >
                          Ver ubicacion en Google Maps
                        </Button>
                        <label className="location-toggle-row">
                          <input
                            checked={isArtistLocationConfirmed}
                            type="checkbox"
                            onChange={(event) => setIsArtistLocationConfirmed(event.target.checked)}
                          />
                          <span>Confirmo que esta ubicacion corresponde a mi estudio.</span>
                        </label>
                      </div>
                    )}
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
                  Google Maps: {artistMapsUrl || 'Completa una ubicacion profesional para generar la URL base.'}
                </small>
              </div>
              <section className="location-foundation-card artist-social-editor-card">
                <div>
                  <span className="eyebrow">Redes sociales</span>
                  <h3>Enlaces publicos de la artista</h3>
                  <small>Estos son los enlaces que aparecen como iconos en las cards visibles para clientas.</small>
                </div>
                <div className="location-form-grid">
                  <Input
                    label="WhatsApp"
                    value={editingArtist.contactLinks?.whatsapp || ''}
                    onChange={(event) => updateArtistContactLink('whatsapp', event.target.value)}
                  />
                  <Input
                    label="Instagram"
                    value={editingArtist.contactLinks?.instagram || ''}
                    onChange={(event) => updateArtistContactLink('instagram', event.target.value)}
                  />
                  <Input
                    label="Facebook"
                    value={editingArtist.contactLinks?.facebook || ''}
                    onChange={(event) => updateArtistContactLink('facebook', event.target.value)}
                  />
                  <Input
                    label="TikTok"
                    value={editingArtist.contactLinks?.tiktok || ''}
                    onChange={(event) => updateArtistContactLink('tiktok', event.target.value)}
                  />
                </div>
              </section>
              <section className="location-foundation-card artist-gallery-review-card">
                <div>
                  <span className="eyebrow">Galeria de la artista</span>
                  <h3>Fotografias publicadas</h3>
                  <small>Vista de las fotografias que la artista agrego a su perfil.</small>
                </div>
                {editingArtist.portfolio?.length > 0 ? (
                  <div className="studio-gallery-grid owner-artist-gallery-grid">
                    {editingArtist.portfolio.map((image) => (
                      <article className="studio-gallery-item" key={image.id || image.url}>
                        <img src={image.url} alt={image.label || 'Foto de la artista'} />
                      </article>
                    ))}
                  </div>
                ) : (
                  <small className="location-helper-text">La artista aun no ha agregado fotografias a su galeria.</small>
                )}
              </section>
              {profileSaveFeedback.message && (
                <div className="artist-profile-save-feedback">
                  <StatusPill tone={profileSaveFeedback.tone}>{profileSaveFeedback.message}</StatusPill>
                </div>
              )}
              <div className="row-actions artist-profile-save-actions">
                <button disabled={isSavingArtist} type="button" onClick={saveArtistProfile}>
                  {isSavingArtist ? 'Guardando...' : 'Guardar perfil de artista'}
                </button>
                <button disabled={isSavingArtist || isSavingLinkedStudio} type="button" onClick={() => setEditingArtist(null)}>Cerrar</button>
              </div>
            </div>
          </Card>
        )}
    </main>
  )
}

export default AdminArtists
