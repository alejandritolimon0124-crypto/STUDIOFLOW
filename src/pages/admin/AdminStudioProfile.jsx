import { useEffect, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { getCurrentBrowserCoordinates } from '../../utils/browserGeolocation'
import { buildGoogleMapsUrl, createProfessionalLocation, hasCoordinates, validateProfessionalLocation } from '../../utils/locationHelpers'
import { getCurrentProfile, getCurrentStudio } from '../../modules/entities/entitySelectors'
import { paths } from '../../routes/paths'
import { useNavigate } from 'react-router-dom'
import { publishStudioMarketplace } from '../../services/studioService'
import {
  cancelStudioArtistInvitation,
  fetchStudioMemberships,
  inviteStudioArtist,
} from '../../services/studioMembershipService'

const galleryLimit = 5

function AdminStudioProfile() {
  const navigate = useNavigate()
  const { adminState, loadAdminArtists, session, updateManagedStudioProfile } = useApp()
  const [isPublishingMarketplace, setIsPublishingMarketplace] = useState(false)
  const [marketplaceFeedback, setMarketplaceFeedback] = useState({ tone: 'neutral', message: '' })
  const [membershipState, setMembershipState] = useState({
    memberships: [],
    invitations: [],
    artistCandidates: [],
    lastInvitation: null,
  })
  const [isMembershipsLoading, setIsMembershipsLoading] = useState(false)
  const [membershipFeedback, setMembershipFeedback] = useState({ tone: 'neutral', message: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteArtistId, setInviteArtistId] = useState('')
  const localProfiles = session.user ? [{ ...session.user, id: session.user.id }] : []
  const currentProfile = getCurrentProfile({ session, profiles: localProfiles })
  const studioOwnerAssignment = (session.roles || []).find((assignment) => assignment.role === 'studio_owner')
  const activeStudioId = session.user?.studioId || studioOwnerAssignment?.studioId || studioOwnerAssignment?.studio_id || null
  const currentStudio = getCurrentStudio({
    session,
    profiles: localProfiles,
    studios: adminState.studios.map((studio) => (
      studio.id === activeStudioId && currentProfile
        ? { ...studio, ownerProfileId: currentProfile.id }
        : studio
    )),
    activeStudioId,
  }) || adminState.studios[0]
  const [profileDraft, setProfileDraft] = useState(currentStudio?.profile || {})
  const [locationDraft, setLocationDraft] = useState(createProfessionalLocation(currentStudio?.professionalLocation || {}))
  const [locationErrors, setLocationErrors] = useState({})
  const [locationDetection, setLocationDetection] = useState({ status: 'idle', message: '' })
  const [isStudioLocationConfirmed, setIsStudioLocationConfirmed] = useState(false)
  const mapsUrl = buildGoogleMapsUrl(locationDraft)
  const locationHasCoordinates = hasCoordinates(locationDraft)
  const galleryCount = (profileDraft.gallery || []).length
  const hasGalleryCapacity = galleryCount < galleryLimit
  const selectedInviteArtist = membershipState.artistCandidates.find((artist) => artist.id === inviteArtistId)

  useEffect(() => {
    queueMicrotask(() => {
      setProfileDraft(currentStudio?.profile || {})
      setLocationDraft(createProfessionalLocation(currentStudio?.professionalLocation || {}))
      setIsStudioLocationConfirmed(false)
      setMarketplaceFeedback({ tone: 'neutral', message: '' })
    })
  }, [currentStudio?.id, currentStudio?.professionalLocation, currentStudio?.profile])

  useEffect(() => {
    if (!currentStudio?.id) return

    let isMounted = true
    setIsMembershipsLoading(true)
    setMembershipFeedback({ tone: 'neutral', message: '' })

    fetchStudioMemberships(currentStudio.id)
      .then((payload) => {
        if (!isMounted) return
        setMembershipState(payload)
      })
      .catch((error) => {
        if (!isMounted) return
        setMembershipFeedback({ tone: 'warm', message: error.message || 'No se pudieron cargar artistas del estudio.' })
      })
      .finally(() => {
        if (isMounted) setIsMembershipsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [currentStudio?.id])

  const updateProfileField = (field, value) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
  }

  const updateLocationField = (field, value) => {
    setLocationDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
    if (['address', 'city', 'state', 'postalCode', 'latitude', 'longitude'].includes(field)) {
      setIsStudioLocationConfirmed(false)
    }
    setLocationErrors((currentErrors) => ({ ...currentErrors, [field]: '' }))
  }

  const useCurrentLocation = async () => {
    setLocationDetection({ status: 'loading', message: 'Detectando ubicacion actual...' })

    try {
      const coordinates = await getCurrentBrowserCoordinates()

      setLocationDraft((currentDraft) => ({
        ...currentDraft,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      }))
      setLocationErrors((currentErrors) => ({
        ...currentErrors,
        latitude: '',
        longitude: '',
      }))
      setLocationDetection({
        status: 'success',
        message: `Ubicacion detectada: ${coordinates.latitude}, ${coordinates.longitude}. Esta ubicacion es aproximada. Verifica que corresponda a tu direccion antes de guardar.`,
      })
      setIsStudioLocationConfirmed(false)
    } catch (error) {
      setLocationDetection({
        status: 'error',
        message: error.message || 'No se pudo usar la ubicacion actual.',
      })
    }
  }

  const readImageFile = (file, onLoad) => {
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const source = String(reader.result || '')
      const image = new Image()

      image.onload = () => {
        const maxSize = 1200
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))

        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        onLoad(canvas.toDataURL('image/jpeg', 0.78))
      }

      image.onerror = () => onLoad(source)
      image.src = source
    }
    reader.readAsDataURL(file)
  }

  const handleLogoChange = (event) => {
    readImageFile(event.target.files?.[0], (logoUrl) => {
      setProfileDraft((currentDraft) => ({ ...currentDraft, logoUrl }))
    })
    event.target.value = ''
  }

  const handleGalleryChange = (event) => {
    const files = Array.from(event.target.files || []).slice(0, galleryLimit - (profileDraft.gallery || []).length)

    files.forEach((file) => {
      readImageFile(file, (url) => {
        setProfileDraft((currentDraft) => ({
          ...currentDraft,
          gallery: [
            ...(currentDraft.gallery || []),
            {
              id: `studio-gallery-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              label: file.name,
              url,
            },
          ].slice(0, galleryLimit),
        }))
      })
    })
    event.target.value = ''
  }

  const removeGalleryImage = (imageId) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      gallery: (currentDraft.gallery || []).filter((image) => image.id !== imageId),
    }))
  }

  const saveStudioProfile = () => {
    const nextErrors = validateProfessionalLocation(locationDraft)
    const hasLocationErrors = Object.keys(nextErrors).length > 0

    if (hasLocationErrors) {
      setLocationErrors(nextErrors)
      return
    }

    if (locationHasCoordinates && !isStudioLocationConfirmed) {
      setLocationErrors({ latitude: 'Confirma que esta ubicacion corresponde a tu estudio.' })
      return
    } else {
      setLocationErrors({})
    }

    const nextStudioProfile = {
      profile: profileDraft,
    }

    if (!hasLocationErrors) {
      nextStudioProfile.professionalLocation = {
        ...locationDraft,
        businessName: profileDraft.commercialName,
      }
    }

    updateManagedStudioProfile(currentStudio.id, nextStudioProfile)
  }

  const hasMarketplaceMinimumData = Boolean(
    currentStudio?.studioStatus === 'approved'
    && String(profileDraft.commercialName || currentStudio?.profile?.commercialName || currentStudio?.name || '').trim()
    && String(locationDraft.city || currentStudio?.profile?.city || currentStudio?.city || '').trim()
    && (
      String(locationDraft.address || currentStudio?.professionalLocation?.address || '').trim()
      || (String(locationDraft.latitude || '').trim() && String(locationDraft.longitude || '').trim())
    ),
  )

  const publishMarketplace = async () => {
    if (!currentStudio?.id || !hasMarketplaceMinimumData || isPublishingMarketplace) return

    setIsPublishingMarketplace(true)
    setMarketplaceFeedback({ tone: 'neutral', message: '' })

    try {
      await publishStudioMarketplace(currentStudio.id)
      await loadAdminArtists?.().catch(() => null)
      setMarketplaceFeedback({ tone: 'success', message: 'Estudio publicado en Marketplace.' })
    } catch (error) {
      setMarketplaceFeedback({ tone: 'warm', message: error.message || 'No se pudo publicar el estudio.' })
    } finally {
      setIsPublishingMarketplace(false)
    }
  }

  const inviteArtist = async () => {
    if (isMembershipsLoading) return

    const email = selectedInviteArtist?.email || inviteEmail

    if (!String(email || '').trim()) {
      setMembershipFeedback({ tone: 'warm', message: 'Agrega un correo o selecciona una artista registrada.' })
      return
    }

    setIsMembershipsLoading(true)
    setMembershipFeedback({ tone: 'neutral', message: '' })

    try {
      const payload = await inviteStudioArtist({
        studioId: currentStudio.id,
        email,
        artistId: inviteArtistId || null,
      })
      setMembershipState(payload)
      setInviteEmail('')
      setInviteArtistId('')
      setMembershipFeedback({
        tone: 'success',
        message: payload.lastInvitation?.token
          ? `Invitacion creada. Token: ${payload.lastInvitation.token}`
          : 'Invitacion creada.',
      })
    } catch (error) {
      setMembershipFeedback({ tone: 'warm', message: error.message || 'No se pudo invitar a la artista.' })
    } finally {
      setIsMembershipsLoading(false)
    }
  }

  const cancelInvitation = async (invitationId) => {
    if (!invitationId || isMembershipsLoading) return

    setIsMembershipsLoading(true)
    setMembershipFeedback({ tone: 'neutral', message: '' })

    try {
      const payload = await cancelStudioArtistInvitation(invitationId)
      setMembershipState(payload)
      setMembershipFeedback({ tone: 'success', message: 'Invitacion cancelada.' })
    } catch (error) {
      setMembershipFeedback({ tone: 'warm', message: error.message || 'No se pudo cancelar la invitacion.' })
    } finally {
      setIsMembershipsLoading(false)
    }
  }

  if (!currentStudio?.id) {
    return (
      <main className="dashboard-grid admin-grid profile-foundation-grid">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Mi Estudio" eyebrow="Fuente profesional" />
          <div className="profile-foundation-stack">
            <section className="profile-foundation-card">
              <div>
                <span className="eyebrow">Studio owner</span>
                <h3>Aun no tienes un estudio registrado.</h3>
                <p>Primero crea tu estudio desde el dashboard para poder completar perfil, ubicacion y branding.</p>
              </div>
              <Button onClick={() => navigate(paths.admin)}>Ir al dashboard</Button>
            </section>
          </div>
        </Card>
      </main>
    )
  }

  return (
    <main className="dashboard-grid admin-grid profile-foundation-grid">
      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Mi Estudio" eyebrow="Fuente profesional" />
        <div className="profile-foundation-stack">
          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Perfil Publico futuro</span>
              <h3>Perfil del estudio</h3>
            </div>
            <Input
              label="Nombre comercial del estudio"
              value={profileDraft.commercialName}
              onChange={(event) => updateProfileField('commercialName', event.target.value)}
            />
            <label className="input-field">
              <span>Descripcion</span>
              <textarea
                value={profileDraft.description}
                onChange={(event) => updateProfileField('description', event.target.value)}
                rows="4"
              />
            </label>
            <div className="location-form-grid">
              <Input
                label="Telefono"
                value={profileDraft.phone}
                onChange={(event) => updateProfileField('phone', event.target.value)}
              />
              <Input
                label="Correo electronico"
                type="email"
                value={profileDraft.email}
                onChange={(event) => updateProfileField('email', event.target.value)}
              />
            </div>
            <label className="input-field">
              <span>Horarios</span>
              <textarea
                value={profileDraft.hours}
                onChange={(event) => updateProfileField('hours', event.target.value)}
                rows="3"
              />
            </label>
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Branding</span>
              <h3>Logo del estudio</h3>
              <small>Preparado para Marketplace y Perfil Publico futuro.</small>
            </div>
            <div className="studio-logo-row">
              <div className="studio-logo-preview">
                {profileDraft.logoUrl ? (
                  <img src={profileDraft.logoUrl} alt={`Logo de ${profileDraft.commercialName}`} />
                ) : (
                  <span>{(profileDraft.commercialName || 'SF').slice(0, 2)}</span>
                )}
              </div>
              <div className="artist-photo-actions">
                <label className="button button-ghost button-sm" htmlFor="studio-logo-input">
                  {profileDraft.logoUrl ? 'Actualizar logo' : 'Subir logo'}
                </label>
                <input
                  accept="image/*"
                  className="visually-hidden"
                  id="studio-logo-input"
                  type="file"
                  onChange={handleLogoChange}
                />
                {profileDraft.logoUrl && (
                  <button type="button" onClick={() => updateProfileField('logoUrl', '')}>Eliminar logo</button>
                )}
              </div>
            </div>
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Ubicacion</span>
              <h3>Ubicacion del Estudio</h3>
            </div>
            <Input
              label="Nombre comercial"
              value={profileDraft.commercialName}
              onChange={(event) => updateProfileField('commercialName', event.target.value)}
            />
            <Input
              helper={locationErrors.address}
              label="Direccion"
              value={locationDraft.address}
              onChange={(event) => updateLocationField('address', event.target.value)}
            />
            <div className="location-form-grid">
              <Input
                helper={locationErrors.city}
                label="Ciudad"
                value={locationDraft.city}
                onChange={(event) => updateLocationField('city', event.target.value)}
              />
              <Input
                helper={locationErrors.state}
                label="Estado"
                value={locationDraft.state}
                onChange={(event) => updateLocationField('state', event.target.value)}
              />
            </div>
            <div className="location-form-grid">
              <Input
                label="Codigo Postal"
                value={locationDraft.postalCode}
                onChange={(event) => updateLocationField('postalCode', event.target.value)}
              />
              <Input
                helper={locationErrors.latitude || 'Puedes ajustar manualmente las coordenadas si el punto no es exacto.'}
                label="Latitud"
                value={locationDraft.latitude}
                onChange={(event) => updateLocationField('latitude', event.target.value)}
              />
            </div>
            <Input
              helper="Puedes ajustar manualmente las coordenadas si el punto no es exacto."
              label="Longitud"
              value={locationDraft.longitude}
              onChange={(event) => updateLocationField('longitude', event.target.value)}
            />
            <div className="location-detection-row">
              <Button
                disabled={locationDetection.status === 'loading'}
                size="sm"
                variant="ghost"
                onClick={useCurrentLocation}
              >
                {locationDetection.status === 'loading' ? 'Detectando...' : '📍 Usar mi ubicacion actual'}
              </Button>
              {locationDetection.message && (
                <small className={`location-detection-message location-detection-${locationDetection.status}`}>
                  {locationDetection.message}
                </small>
              )}
            </div>
            {locationHasCoordinates && (
              <div className="location-detection-row">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
                >
                  Ver ubicacion en Google Maps
                </Button>
                <label className="location-toggle-row">
                  <input
                    checked={isStudioLocationConfirmed}
                    type="checkbox"
                    onChange={(event) => setIsStudioLocationConfirmed(event.target.checked)}
                  />
                  <span>Confirmo que esta ubicacion corresponde a mi estudio.</span>
                </label>
              </div>
            )}
            <label className="input-field">
              <span>Referencias</span>
              <textarea
                value={locationDraft.address_references}
                onChange={(event) => updateLocationField('address_references', event.target.value)}
                rows="3"
              />
            </label>
            <small className="location-helper-text">
              Google Maps: {mapsUrl || 'Completa direccion, ciudad y estado para generar la URL base.'}
            </small>
          </section>

          <section className="profile-foundation-card">
            <div className="studio-gallery-heading">
              <div>
                <span className="eyebrow">Fotos del Estudio</span>
                <h3>📸 Fotos del Estudio</h3>
                <small>Estas imágenes serán visibles para las clientas en tu perfil público.</small>
                <small>Comparte únicamente fotografías de tus instalaciones, recepción y áreas de atención.</small>
              </div>
              <span className="studio-gallery-counter">{galleryCount}/{galleryLimit} fotos</span>
            </div>
            <div className="studio-gallery-grid">
              {(profileDraft.gallery || []).map((image) => (
                <article className="studio-gallery-item" key={image.id}>
                  <img src={image.url} alt={image.label || 'Foto del estudio'} />
                  <button type="button" onClick={() => removeGalleryImage(image.id)}>Quitar</button>
                </article>
              ))}
              <label className={`studio-gallery-upload${hasGalleryCapacity ? '' : ' is-disabled'}`} htmlFor={hasGalleryCapacity ? 'studio-gallery-input' : undefined}>
                <span>{hasGalleryCapacity ? 'Agregar foto' : 'Límite alcanzado'}</span>
                <small>{galleryCount}/{galleryLimit} fotos</small>
              </label>
            </div>
            {!hasGalleryCapacity && (
              <small className="studio-gallery-limit-message">
                Has alcanzado el límite máximo de 5 fotografías.
              </small>
            )}
            <input
              accept="image/*"
              disabled={!hasGalleryCapacity}
              className="visually-hidden"
              id="studio-gallery-input"
              multiple
              type="file"
              onChange={handleGalleryChange}
            />
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Equipo</span>
              <h3>Artistas del estudio</h3>
              <small>Invita artistas reales y consulta memberships activas del estudio.</small>
            </div>
          </section>

          <section className="profile-foundation-card">
                <div>
                  <span className="eyebrow">Invitar artista</span>
                  <h3>Nueva invitacion</h3>
                </div>
                <label className="input-field">
                  <span>Artista registrada</span>
                  <select
                    value={inviteArtistId}
                    onChange={(event) => {
                      setInviteArtistId(event.target.value)
                      const nextArtist = membershipState.artistCandidates.find((artist) => artist.id === event.target.value)
                      setInviteEmail(nextArtist?.email || '')
                    }}
                  >
                    <option value="">Seleccionar artista registrada</option>
                    {membershipState.artistCandidates.map((artist) => (
                      <option key={artist.id} value={artist.id}>
                        {artist.name} / {artist.email}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Correo electronico"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => {
                    setInviteEmail(event.target.value)
                    if (inviteArtistId) setInviteArtistId('')
                  }}
                />
                <Button disabled={isMembershipsLoading} onClick={inviteArtist}>
                  {isMembershipsLoading ? 'Procesando...' : 'Invitar artista'}
                </Button>
                {membershipFeedback.message && (
                  <small style={{ color: membershipFeedback.tone === 'success' ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
                    {membershipFeedback.message}
                  </small>
                )}
          </section>

          <section className="profile-foundation-card">
                <div>
                  <span className="eyebrow">Memberships</span>
                  <h3>Artistas vinculadas</h3>
                </div>
                <div className="compact-list">
                  {membershipState.memberships.map((membership) => (
                    <div className="list-row elevated-row" key={membership.id}>
                      <div className="client-photo-preview" style={{ height: 44, width: 44 }}>
                        {membership.photoUrl ? (
                          <img src={membership.photoUrl} alt={`Foto de ${membership.name}`} />
                        ) : (
                          <span>{String(membership.name || 'AR').slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <strong>{membership.name}</strong>
                        <small>{membership.email || 'Correo no disponible'}</small>
                        <small>Incorporacion: {membership.startedAt || membership.createdAt || 'Pendiente'}</small>
                      </div>
                      <StatusPill tone={membership.active ? 'success' : 'neutral'}>
                        {membership.active ? 'Membership activa' : membership.status}
                      </StatusPill>
                    </div>
                  ))}
                  {!isMembershipsLoading && membershipState.memberships.length === 0 && (
                    <div className="list-row elevated-row">
                      <div>
                        <strong>Sin artistas vinculadas</strong>
                        <small>Las artistas apareceran aqui cuando acepten su token.</small>
                      </div>
                      <StatusPill tone="neutral">Vacio</StatusPill>
                    </div>
                  )}
                </div>
          </section>

          <section className="profile-foundation-card">
                <div>
                  <span className="eyebrow">Pendientes</span>
                  <h3>Invitaciones pendientes</h3>
                </div>
                <div className="compact-list">
                  {membershipState.invitations.map((invitation) => (
                    <div className="list-row elevated-row" key={invitation.id}>
                      <div>
                        <strong>{invitation.artistName || invitation.invitedEmail}</strong>
                        <small>{invitation.invitedEmail}</small>
                        <small>Token: {invitation.token}</small>
                        <small>Expira: {invitation.expiresAt || '14 dias'}</small>
                      </div>
                      <div className="studio-review-actions">
                        <StatusPill tone="pending">Pendiente</StatusPill>
                        <Button
                          disabled={isMembershipsLoading}
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelInvitation(invitation.id)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!isMembershipsLoading && membershipState.invitations.length === 0 && (
                    <div className="list-row elevated-row">
                      <div>
                        <strong>Sin invitaciones pendientes</strong>
                        <small>Genera una invitacion para compartir el token con la artista.</small>
                      </div>
                      <StatusPill tone="neutral">Pendientes</StatusPill>
                    </div>
                  )}
                </div>
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Marketplace</span>
              <h3>Publicacion del estudio</h3>
              <small>Disponible cuando el estudio esta aprobado y tiene nombre comercial, ciudad y ubicacion.</small>
            </div>
            <Button
              disabled={!hasMarketplaceMinimumData || isPublishingMarketplace}
              onClick={publishMarketplace}
            >
              {isPublishingMarketplace ? 'Publicando...' : 'Publicar estudio en Marketplace'}
            </Button>
            {!hasMarketplaceMinimumData && (
              <small style={{ color: 'var(--muted)', fontWeight: 800 }}>
                Requiere estudio aprobado, nombre comercial, ciudad y direccion o coordenadas.
              </small>
            )}
            {marketplaceFeedback.message && (
              <small style={{ color: marketplaceFeedback.tone === 'success' ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
                {marketplaceFeedback.message}
              </small>
            )}
          </section>

          <Button className="full-width" onClick={saveStudioProfile}>Guardar estudio</Button>
        </div>
      </Card>
    </main>
  )
}

export default AdminStudioProfile
