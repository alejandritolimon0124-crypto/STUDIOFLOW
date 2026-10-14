import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import StatusPill from '../../components/StatusPill'
import StudioBootstrapPanel from '../../components/StudioBootstrapPanel'
import BusinessPaymentSettings from '../../components/BusinessPaymentSettings'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { claimArtistInvitation } from '../../services/profileBootstrapService'
import { getCurrentBrowserCoordinates } from '../../utils/browserGeolocation'
import { buildGoogleMapsUrl, createArtistLocationSettings, hasCoordinates, validateProfessionalLocation } from '../../utils/locationHelpers'
import { mapAuthContextToArtistProfile } from '../../utils/artistProfileMapper'
import { getMaxBirthDateForAdult, validateBirthDate } from '../../utils/birthdayValidation'
import { optimizeImageFile } from '../../utils/imageOptimization'
import { BEAUTY_SPACES } from '../../services/beautySpaceService'
import { fetchArtistPortfolio } from '../../services/artistProfileService'

const portfolioLimit = 12

function getStudioScopedPhotoUrl(profile = {}, studioId = '') {
  const studioPhotoUrls = profile.studioPhotoUrls || {}
  if (studioId && studioPhotoUrls[studioId]) return studioPhotoUrls[studioId]

  const firstStudioPhotoUrl = Object.values(studioPhotoUrls).find((value) => String(value || '').trim())
  return firstStudioPhotoUrl || ''
}

function ArtistProfileSettings() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    artistProfileError,
    artistProfileLoadedId,
    artistState,
    artistWorkContext,
    isArtistProfileSaving,
    refreshAuthContext,
    saveArtistProfile,
    session,
    setSession,
  } = useApp()
  const activeSessionContext = session.activeSessionContext || {}
  const activeContextType = artistWorkContext?.contextType
    || artistWorkContext?.type
    || activeSessionContext.contextType
    || activeSessionContext.type
    || ''
  const activeMembershipId = artistWorkContext?.membershipId
    || artistWorkContext?.membership_id
    || activeSessionContext.membershipId
    || activeSessionContext.membership_id
    || null
  const currentStudioMemberships = (session.memberships || []).filter((membership) => (
    (membership.status || 'active') === 'active'
    && (membership.studioId || membership.studio_id)
  ))
  const activeStudioMembership = currentStudioMemberships.find((membership) => (
    (membership.id || membership.membershipId || membership.membership_id) === activeMembershipId
  )) || currentStudioMemberships[0]
  const activeStudioId = artistWorkContext?.studioId
    || artistWorkContext?.studio_id
    || activeSessionContext.studioId
    || activeSessionContext.studio_id
    || activeStudioMembership?.studioId
    || activeStudioMembership?.studio_id
    || ''
  const activeStudioName = artistWorkContext?.studioName
    || artistWorkContext?.studio_name
    || activeSessionContext.studioName
    || activeSessionContext.studio_name
    || activeStudioMembership?.studioName
    || activeStudioMembership?.studio_name
    || 'Estudio'
  const requestedProfileContext = searchParams.get('context') || 'independent'
  const hasActiveStudioArtistContext = activeContextType === 'membership' || Boolean(activeMembershipId)
  const isStudioArtistContext = requestedProfileContext === 'studio' && hasActiveStudioArtistContext
  const currentStudio = useMemo(() => activeStudioId
    ? {
      id: activeStudioId,
      name: activeStudioName,
      professionalLocation: {},
      city: '',
    }
    : null, [activeStudioId, activeStudioName])
  const artistProfileBelongsToSession = Boolean(
    session.artist?.id
    && (
      artistState.profile?.artistId === session.artist.id
      || artistState.profile?.artist_id === session.artist.id
    ),
  )
  const safeArtistProfile = artistProfileBelongsToSession ? artistState.profile : {}
  const sessionArtistProfile = artistProfileBelongsToSession
    ? safeArtistProfile
    : mapAuthContextToArtistProfile({ profile: session.profile, artist: session.artist }, artistState.profile)
  const [profileDraft, setProfileDraft] = useState({
    ...sessionArtistProfile,
    professionalLocation: createArtistLocationSettings(sessionArtistProfile?.professionalLocation),
  })
  const [portfolioTouched, setPortfolioTouched] = useState(false)
  const [portfolioLoadState, setPortfolioLoadState] = useState('loading')
  const profileLoadState = session.isMockSession || (artistProfileBelongsToSession && artistProfileLoadedId === session.artist?.id) ? 'loaded' : 'loading'
  const [portfolioRetry, setPortfolioRetry] = useState(0)
  const [locationErrors, setLocationErrors] = useState({})
  const [locationDetection, setLocationDetection] = useState({ status: 'idle', message: '' })
  const [isArtistLocationConfirmed, setIsArtistLocationConfirmed] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState('')
  const [claimToken, setClaimToken] = useState('')
  const [claimStatus, setClaimStatus] = useState({ tone: 'neutral', message: '' })
  const [isClaimingInvitation, setIsClaimingInvitation] = useState(false)
  const studioPhotoSignature = JSON.stringify(sessionArtistProfile.studioPhotoUrls || {})
  const activeStudioPhotoUrl = getStudioScopedPhotoUrl(profileDraft, activeStudioId)
  const effectiveLocation = profileDraft.professionalLocation.useStudioLocation
    ? currentStudio?.professionalLocation
    : profileDraft.professionalLocation.customLocation
  const mapsUrl = buildGoogleMapsUrl(effectiveLocation)
  const customLocationHasCoordinates = hasCoordinates(profileDraft.professionalLocation.customLocation)
  const portfolioCount = (profileDraft.portfolio || []).length
  const hasPortfolioCapacity = portfolioCount < portfolioLimit
  const studioLocationLabel = useMemo(
    () => [
      currentStudio?.professionalLocation?.address,
      currentStudio?.professionalLocation?.city || currentStudio?.city,
      currentStudio?.professionalLocation?.state,
    ].filter(Boolean).join(' / '),
    [currentStudio],
  )

  const profileSourceKey = JSON.stringify([
    activeStudioId, session.artist?.id, session.profile?.id,
    sessionArtistProfile.artistId, sessionArtistProfile.artistProfileId,
    sessionArtistProfile.photoUrl, studioPhotoSignature,
    sessionArtistProfile.portfolio?.length || 0,
    sessionArtistProfile.beautySpaces,
    sessionArtistProfile.healthCompliance,
    sessionArtistProfile.professionalLocation,
  ])
  useEffect(() => {
    if (!session.artist?.id || session.isMockSession || portfolioTouched) return undefined

    let active = true
    fetchArtistPortfolio({
      artistId: session.artist.id,
      onPage: (portfolio) => {
        if (!active) return
        setProfileDraft((currentDraft) => currentDraft.artistId === session.artist.id
          ? { ...currentDraft, portfolio }
          : currentDraft)
      },
    })
      .then((portfolio) => {
        if (!active) return
        setProfileDraft((currentDraft) => currentDraft.artistId === session.artist.id
          ? { ...currentDraft, portfolio }
          : currentDraft)
        setPortfolioLoadState('loaded')
      })
      .catch(() => {
        if (active) setPortfolioLoadState('error')
      })

    return () => { active = false }
  }, [session.artist?.id, session.isMockSession, portfolioTouched, portfolioRetry])
  const [previousProfileSourceKey, setPreviousProfileSourceKey] = useState(profileSourceKey)
  if (previousProfileSourceKey !== profileSourceKey) {
    setPreviousProfileSourceKey(profileSourceKey)
    if (profileDraft.artistId !== sessionArtistProfile.artistId) setPortfolioTouched(false)
    setProfileDraft({
      ...sessionArtistProfile,
      portfolio: (portfolioTouched || profileDraft.portfolio?.length > 0) && profileDraft.artistId === sessionArtistProfile.artistId
        ? profileDraft.portfolio
        : sessionArtistProfile.portfolio,
      professionalLocation: createArtistLocationSettings(sessionArtistProfile?.professionalLocation),
    })
    setLocationErrors({})
    setLocationDetection({ status: 'idle', message: '' })
    setIsArtistLocationConfirmed(false)
    setSaveFeedback('')
  }

  const updateDraftSection = (section, field, value) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      [section]: {
        ...currentDraft[section],
        [field]: value,
      },
    }))
  }

  const updatePaymentMethod = (method, checked) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      professionalProfile: {
        ...currentDraft.professionalProfile,
        paymentMethods: {
          ...(currentDraft.professionalProfile.paymentMethods || {}),
          [method]: checked,
        },
      },
    }))
  }

  const toggleBeautySpace = (space) => {
    setProfileDraft((currentDraft) => {
      const currentSpaces = currentDraft.beautySpaces || []
      return {
        ...currentDraft,
        beautySpaces: currentSpaces.includes(space)
          ? currentSpaces.filter((item) => item !== space)
          : [...currentSpaces, space],
      }
    })
  }

  const updateHealthCompliance = (field, value) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      healthCompliance: {
        ...(currentDraft.healthCompliance || {}),
        [field]: value,
      },
    }))
  }

  const updateLocationMode = (useStudioLocation) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      professionalLocation: {
        ...currentDraft.professionalLocation,
        useStudioLocation,
      },
    }))
    setLocationErrors({})
  }

  const updateCustomLocation = (field, value) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      professionalLocation: {
        ...currentDraft.professionalLocation,
        customLocation: {
          ...currentDraft.professionalLocation.customLocation,
          [field]: value,
        },
      },
    }))
    setLocationErrors((currentErrors) => ({ ...currentErrors, [field]: '' }))
    if (['address', 'city', 'state', 'postalCode', 'latitude', 'longitude'].includes(field)) {
      setIsArtistLocationConfirmed(false)
    }
  }

  const useCurrentLocation = async () => {
    setLocationDetection({ status: 'loading', message: 'Detectando ubicacion actual...' })

    try {
      const coordinates = await getCurrentBrowserCoordinates()

      setProfileDraft((currentDraft) => ({
        ...currentDraft,
        professionalLocation: {
          ...currentDraft.professionalLocation,
          useStudioLocation: false,
          customLocation: {
            ...currentDraft.professionalLocation.customLocation,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
          },
        },
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
      setIsArtistLocationConfirmed(false)
    } catch (error) {
      setLocationDetection({
        status: 'error',
        message: error.message || 'No se pudo usar la ubicacion actual.',
      })
    }
  }

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const photoUrl = await optimizeImageFile(file, { maxWidth: 720, maxHeight: 720, quality: 0.8 })
      setProfileDraft((currentDraft) => ({ ...currentDraft, photoUrl }))
      setSaveFeedback('Fotografia optimizada. Guarda el perfil para aplicar el cambio.')
    } catch (error) {
      setSaveFeedback(error.message || 'No se pudo optimizar la fotografia.')
    }
    event.target.value = ''
  }

  const handlePortfolioChange = async (event) => {
    if (portfolioLoadState !== 'loaded') {
      setSaveFeedback('Espera a que termine de cargar tu galeria antes de agregar fotos.')
      event.target.value = ''
      return
    }
    const files = Array.from(event.target.files || []).slice(0, portfolioLimit - (profileDraft.portfolio || []).length)
    try {
      const images = await Promise.all(files.map(async (file) => ({
        id: `artist-portfolio-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        label: file.name,
        url: await optimizeImageFile(file),
      })))
      if (images.length) {
        setPortfolioTouched(true)
        setProfileDraft((currentDraft) => ({
          ...currentDraft,
          portfolio: [...(currentDraft.portfolio || []), ...images].slice(0, portfolioLimit),
        }))
        setSaveFeedback('Fotografias optimizadas. Guarda el perfil para aplicar los cambios.')
      }
    } catch (error) {
      setSaveFeedback(error.message || 'No se pudieron optimizar las fotografias.')
    }
    event.target.value = ''
  }

  const removePortfolioImage = (imageId) => {
    if (portfolioLoadState !== 'loaded') return
    setPortfolioTouched(true)
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      portfolio: (currentDraft.portfolio || []).filter((image) => image.id !== imageId),
    }))
  }

  const saveProfile = async () => {
    if (!session.isMockSession && profileLoadState !== 'loaded') {
      setSaveFeedback('Espera a que se cargue tu perfil antes de guardar los cambios.')
      return
    }
    const nextProfile = { ...profileDraft }
    if (!session.isMockSession && !portfolioTouched && (portfolioLoadState !== 'loaded' || (nextProfile.portfolio || []).length === 0) && session.artist?.id) {
      try {
        nextProfile.portfolio = await fetchArtistPortfolio({ artistId: session.artist.id })
      } catch {
        setSaveFeedback('No pudimos verificar tus fotos. Intenta guardar de nuevo para proteger tu galeria.')
        return
      }
    }
    const usesAdvancedAesthetics = (profileDraft.beautySpaces || []).includes(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS)

    if ((profileDraft.beautySpaces || []).length === 0) {
      setSaveFeedback('Selecciona por lo menos un Beauty Space.')
      return
    }
    if (usesAdvancedAesthetics && (!profileDraft.healthCompliance?.hasHealthOfficer
      || !profileDraft.healthCompliance?.healthOfficerName?.trim()
      || !profileDraft.healthCompliance?.healthOfficerTitle?.trim()
      || !profileDraft.healthCompliance?.healthOfficerLicense?.trim())) {
      setSaveFeedback('Completa los datos obligatorios del responsable sanitario para estética avanzada.')
      return
    }

    if (isStudioArtistContext) {
      try {
        await saveArtistProfile(nextProfile)
        setSaveFeedback('Perfil de estudio guardado')
      } catch (error) {
        setSaveFeedback(error.message || 'No se pudo guardar el perfil de estudio')
      }
      return
    }

    const birthdayError = validateBirthDate(profileDraft.personalInfo?.birthday)

    if (birthdayError) {
      setSaveFeedback(birthdayError)
      return
    }

    if (!profileDraft.professionalLocation.useStudioLocation) {
      const nextErrors = validateProfessionalLocation(profileDraft.professionalLocation.customLocation)

      if (Object.keys(nextErrors).length > 0) {
        setLocationErrors(nextErrors)
        nextProfile.professionalLocation = safeArtistProfile.professionalLocation
      } else if (customLocationHasCoordinates && !isArtistLocationConfirmed
        && JSON.stringify(profileDraft.professionalLocation) !== JSON.stringify(sessionArtistProfile.professionalLocation)) {
        setLocationErrors({ latitude: 'Confirma que esta ubicacion corresponde a tu estudio.' })
        setSaveFeedback('Confirma que esta ubicacion corresponde a tu estudio.')
        return
      } else {
        setLocationErrors({})
      }
    } else {
      setLocationErrors({})
    }

    try {
      await saveArtistProfile(nextProfile)
      setSaveFeedback('Perfil guardado')
    } catch (error) {
      setSaveFeedback(error.message || 'No se pudo guardar el perfil')
    }
  }

  const handleStudioPhotoChange = (studioId) => async (event) => {
    const file = event.target.files?.[0]
    if (!file || !studioId) return
    try {
      const photoUrl = await optimizeImageFile(file, { maxWidth: 720, maxHeight: 720, quality: 0.8 })
      setProfileDraft((currentDraft) => ({
        ...currentDraft,
        studioPhotoUrls: {
          ...(currentDraft.studioPhotoUrls || {}),
          [studioId]: photoUrl,
        },
      }))
      setSaveFeedback('Fotografia optimizada. Guarda el perfil para aplicar el cambio.')
    } catch (error) {
      setSaveFeedback(error.message || 'No se pudo optimizar la fotografia.')
    }
    event.target.value = ''
  }

  const removeStudioPhoto = (studioId) => {
    setProfileDraft((currentDraft) => {
      const nextStudioPhotoUrls = { ...(currentDraft.studioPhotoUrls || {}) }
      delete nextStudioPhotoUrls[studioId]

      return {
        ...currentDraft,
        studioPhotoUrls: nextStudioPhotoUrls,
      }
    })
  }

  const claimStudioInvitation = async () => {
    if (!claimToken.trim()) {
      setClaimStatus({ tone: 'warm', message: 'Ingresa un token de invitacion.' })
      return
    }

    setIsClaimingInvitation(true)
    setClaimStatus({ tone: 'neutral', message: '' })

    try {
      const authContext = await claimArtistInvitation(claimToken.trim())
      setSession((currentSession) => ({
        ...currentSession,
        roles: authContext.roles || currentSession.roles,
        memberships: authContext.memberships || currentSession.memberships,
        artist: authContext.artist || currentSession.artist,
        activeSessionContext: {
          ...(currentSession.activeSessionContext || {}),
          membershipId: authContext.memberships?.[0]?.id || currentSession.activeSessionContext?.membershipId || null,
          studioId: authContext.memberships?.[0]?.studioId || authContext.memberships?.[0]?.studio_id || currentSession.activeSessionContext?.studioId || null,
        },
        user: currentSession.user
          ? {
              ...currentSession.user,
              membershipId: authContext.memberships?.[0]?.id || currentSession.user.membershipId || null,
              studioId: authContext.memberships?.[0]?.studioId || authContext.memberships?.[0]?.studio_id || currentSession.user.studioId || null,
            }
          : currentSession.user,
      }))
      setClaimToken('')
      setClaimStatus({ tone: 'success', message: 'Token vinculado correctamente.' })
    } catch (error) {
      setClaimStatus({ tone: 'warm', message: error.message || 'No se pudo vincular el token.' })
    } finally {
      setIsClaimingInvitation(false)
    }
  }

  const openOwnerPanel = async () => {
    await refreshAuthContext?.()
    navigate(paths.adminStudio)
  }

  if (profileLoadState !== 'loaded') {
    return (
      <main className="dashboard-grid artist-grid profile-foundation-grid artist-profile-experience">
        <Card className="wide-card mobile-screen primary-panel artist-profile-shell">
          <div className="profile-foundation-card">
            <h1>Mi perfil</h1>
            {artistProfileError ? (
              <>
                <p>{artistProfileError}</p>
                <Button onClick={() => window.location.reload()}>Reintentar</Button>
              </>
            ) : <p>Cargando tus datos guardados...</p>}
          </div>
        </Card>
      </main>
    )
  }

  if (isStudioArtistContext) {
    return (
      <main className="dashboard-grid artist-grid profile-foundation-grid artist-profile-experience">
        <Card className="wide-card mobile-screen primary-panel artist-profile-shell">
          <div className="profile-foundation-stack artist-profile-stack">
            <section className="profile-foundation-card artist-profile-photo-story">
              <div>
                <span className="eyebrow">Solo en {activeStudioName}</span>
                <h1>Tu espacio en {activeStudioName}</h1>
                <p>Esta foto representa tu trabajo en el estudio. No cambia la de tu perfil independiente.</p>
              </div>
              <div className="profile-photo-row">
                <div className="artist-photo-preview">
                  {activeStudioPhotoUrl ? (
                    <img src={activeStudioPhotoUrl} alt={`Foto de ${activeStudioName}`} />
                  ) : profileDraft.photoUrl ? (
                    <img src={profileDraft.photoUrl} alt={`Foto de ${profileDraft.personalInfo.fullName}`} />
                  ) : (
                    <span>{activeStudioName.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className="artist-photo-actions">
                  <label className="button button-ghost button-sm" htmlFor="studio-context-only-photo-input">
                    {activeStudioPhotoUrl ? 'Cambiar foto' : 'Subir foto'}
                  </label>
                  <input
                    accept="image/*"
                    className="visually-hidden"
                    id="studio-context-only-photo-input"
                    type="file"
                    onChange={handleStudioPhotoChange(activeStudioId)}
                  />
                  {activeStudioPhotoUrl && (
                    <button type="button" onClick={() => removeStudioPhoto(activeStudioId)}>Eliminar foto</button>
                  )}
                </div>
              </div>
            </section>

            <section className="profile-foundation-card">
              <div>
                <span className="eyebrow">Perfil profesional</span>
                <h3>Especialidad en estudio</h3>
              </div>
              <Input
                label="Especialidad principal"
                value={profileDraft.professionalProfile.primarySpecialty}
                onChange={(event) => updateDraftSection('professionalProfile', 'primarySpecialty', event.target.value)}
              />
              <Input
                label="Especialidades"
                value={profileDraft.professionalProfile.specialties || ''}
                onChange={(event) => updateDraftSection('professionalProfile', 'specialties', event.target.value)}
              />
              <label className="input-field">
                <span>Descripcion profesional</span>
                <textarea
                  value={profileDraft.professionalProfile.shortBio}
                  onChange={(event) => updateDraftSection('professionalProfile', 'shortBio', event.target.value)}
                  rows="4"
                />
              </label>
              {(saveFeedback || artistProfileError) && (
                <StatusPill tone={(saveFeedback || artistProfileError).includes('No se pudo') ? 'warm' : 'success'}>
                  {artistProfileError || saveFeedback}
                </StatusPill>
              )}
              <Button className="full-width" disabled={isArtistProfileSaving || profileLoadState !== 'loaded'} onClick={saveProfile}>
                {profileLoadState === 'loading' ? 'Cargando perfil...' : isArtistProfileSaving ? 'Guardando...' : 'Guardar perfil de estudio'}
              </Button>
            </section>
          </div>
        </Card>
      </main>
    )
  }

  return (
    <main className="dashboard-grid artist-grid profile-foundation-grid artist-profile-experience">
      <Card className="wide-card mobile-screen primary-panel artist-profile-shell">
        <div className="profile-foundation-stack artist-profile-stack">
          <section className="profile-foundation-card artist-profile-photo-story">
            <div>
              <span className="eyebrow">Perfil independiente</span>
              <h1>Tu talento, a tu manera</h1>
              <p>Así te verán las clientas que reserven directamente contigo. Tu foto en el estudio se mantiene aparte.</p>
            </div>
            <div className="profile-photo-row">
              <div className="artist-photo-preview">
                {profileDraft.photoUrl ? (
                  <img src={profileDraft.photoUrl} alt={`Foto de ${profileDraft.personalInfo.fullName}`} />
                ) : (
                  <span>{(profileDraft.personalInfo.artisticName || profileDraft.personalInfo.fullName || 'SF').slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="artist-photo-actions">
                <strong>{profileDraft.photoUrl ? 'Tu imagen, tu sello' : 'Haz que te reconozcan desde el primer vistazo'}</strong>
                <label className="button button-ghost button-sm" htmlFor="professional-photo-input">
                  {profileDraft.photoUrl ? 'Renovar mi foto' : 'Elegir mi foto'}
                </label>
                <input accept="image/*" className="visually-hidden" id="professional-photo-input" type="file" onChange={handlePhotoChange} />
                {profileDraft.photoUrl && <button type="button" onClick={() => setProfileDraft({ ...profileDraft, photoUrl: '' })}>Quitar foto</button>}
              </div>
            </div>
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">La persona detrás del talento</span>
              <h3>Preséntate como quieres ser recordada</h3>
            </div>
            <Input
              label="Nombre artistico o estudio"
              value={profileDraft.personalInfo.artisticName || ''}
              onChange={(event) => updateDraftSection('personalInfo', 'artisticName', event.target.value)}
            />
            <Input
              label="Nombre completo"
              value={profileDraft.personalInfo.fullName}
              onChange={(event) => updateDraftSection('personalInfo', 'fullName', event.target.value)}
            />
            <Input
              label="Fecha de nacimiento"
              type="date"
              value={profileDraft.personalInfo.birthday || ''}
              max={getMaxBirthDateForAdult()}
              onChange={(event) => updateDraftSection('personalInfo', 'birthday', event.target.value)}
              required
            />
            <div className="location-form-grid">
              <Input
                label="Numero celular"
                value={profileDraft.personalInfo.phone}
                onChange={(event) => updateDraftSection('personalInfo', 'phone', event.target.value)}
              />
              <Input
                label="Correo electronico"
                type="email"
                value={profileDraft.personalInfo.email}
                onChange={(event) => updateDraftSection('personalInfo', 'email', event.target.value)}
              />
            </div>
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Tu universo profesional</span>
              <h3>Elige dónde sucede tu magia</h3>
              <small>Selecciona uno o ambos espacios para mostrarte ante las clientas correctas.</small>
            </div>
            <div className="beauty-space-options">
              <label className={`beauty-space-choice${(profileDraft.beautySpaces || []).includes(BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE) ? ' is-active' : ''}`}>
                <input checked={(profileDraft.beautySpaces || []).includes(BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE)} type="checkbox" onChange={() => toggleBeautySpace(BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE)} />
                <span>Salones de belleza y cuidado personal</span>
              </label>
              <label className={`beauty-space-choice${(profileDraft.beautySpaces || []).includes(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS) ? ' is-active' : ''}`}>
                <input checked={(profileDraft.beautySpaces || []).includes(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS)} type="checkbox" onChange={() => toggleBeautySpace(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS)} />
                <span>Spa y estética avanzada</span>
              </label>
            </div>
            {(profileDraft.beautySpaces || []).includes(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS) && (
              <div className="health-officer-fields">
                <label className="location-toggle-row">
                  <input checked={Boolean(profileDraft.healthCompliance?.hasHealthOfficer)} type="checkbox" onChange={(event) => updateHealthCompliance('hasHealthOfficer', event.target.checked)} />
                  <span>Tengo responsable sanitario</span>
                </label>
                <Input label="Nombre completo del responsable sanitario" value={profileDraft.healthCompliance?.healthOfficerName || ''} onChange={(event) => updateHealthCompliance('healthOfficerName', event.target.value)} />
                <Input label="Título profesional del responsable sanitario" value={profileDraft.healthCompliance?.healthOfficerTitle || ''} onChange={(event) => updateHealthCompliance('healthOfficerTitle', event.target.value)} />
                <Input label="Cédula profesional del responsable sanitario" value={profileDraft.healthCompliance?.healthOfficerLicense || ''} onChange={(event) => updateHealthCompliance('healthOfficerLicense', event.target.value)} />
              </div>
            )}
          </section>

          {currentStudioMemberships.length > 0 && (
            <section className="profile-foundation-card">
              <div>
                <span className="eyebrow">Entorno de estudio</span>
                <h3>Foto para {activeStudioName}</h3>
                <small>Esta foto se mostrara solo cuando trabajes dentro del estudio.</small>
              </div>
              <div className="profile-photo-row">
                <div className="artist-photo-preview">
                  {profileDraft.studioPhotoUrls?.[activeStudioId] ? (
                    <img src={profileDraft.studioPhotoUrls[activeStudioId]} alt={`Foto de ${activeStudioName}`} />
                  ) : profileDraft.photoUrl ? (
                    <img src={profileDraft.photoUrl} alt={`Foto de ${profileDraft.personalInfo.fullName}`} />
                  ) : (
                    <span>{activeStudioName.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className="artist-photo-actions">
                  <label className="button button-ghost button-sm" htmlFor="studio-context-photo-input">
                    {profileDraft.studioPhotoUrls?.[activeStudioId] ? 'Cambiar foto de estudio' : 'Subir foto de estudio'}
                  </label>
                  <input
                    accept="image/*"
                    className="visually-hidden"
                    id="studio-context-photo-input"
                    type="file"
                    onChange={handleStudioPhotoChange(activeStudioId)}
                  />
                  {profileDraft.studioPhotoUrls?.[activeStudioId] && (
                    <button type="button" onClick={() => removeStudioPhoto(activeStudioId)}>Eliminar foto de estudio</button>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Lo que te hace única</span>
              <h3>Cuenta por qué elegirte a ti</h3>
            </div>
            <Input
              label="Especialidad principal"
              value={profileDraft.professionalProfile.primarySpecialty}
              onChange={(event) => updateDraftSection('professionalProfile', 'primarySpecialty', event.target.value)}
            />
            <Input
              label="Especialidades"
              value={profileDraft.professionalProfile.specialties || ''}
              onChange={(event) => updateDraftSection('professionalProfile', 'specialties', event.target.value)}
            />
            <label className="input-field">
              <span>Descripcion profesional</span>
              <textarea
                value={profileDraft.professionalProfile.shortBio}
                onChange={(event) => updateDraftSection('professionalProfile', 'shortBio', event.target.value)}
                rows="4"
              />
            </label>
            <Input
              label="Años de experiencia"
              min="0"
              type="number"
              value={profileDraft.professionalProfile.experienceYears}
              onChange={(event) => updateDraftSection('professionalProfile', 'experienceYears', event.target.value)}
            />
            <div className="input-field payment-methods-field">
              <span>Metodos de pago</span>
              <label className="location-toggle-row">
                <input
                  checked={Boolean(profileDraft.professionalProfile.paymentMethods?.cash)}
                  type="checkbox"
                  onChange={(event) => updatePaymentMethod('cash', event.target.checked)}
                />
                <span>Efectivo</span>
              </label>
              <label className="location-toggle-row">
                <input
                  checked={Boolean(profileDraft.professionalProfile.paymentMethods?.transfer)}
                  type="checkbox"
                  onChange={(event) => updatePaymentMethod('transfer', event.target.checked)}
                />
                <span>Transferencia</span>
              </label>
              <label className="location-toggle-row">
                <input
                  checked={Boolean(profileDraft.professionalProfile.paymentMethods?.card)}
                  type="checkbox"
                  onChange={(event) => updatePaymentMethod('card', event.target.checked)}
                />
                <span>Tarjeta</span>
              </label>
            </div>
          </section>

          <section className="profile-foundation-card artist-profile-portfolio-story">
            <div className="artist-portfolio-heading">
              <div>
                <span className="eyebrow">Tu trabajo habla por ti</span>
                <h3>Crea una galería que enamore</h3>
                <small>Cada imagen ayuda a una nueva clienta a imaginar su próxima experiencia contigo.</small>
                <small>Comparte tus mejores resultados y deja que tu estilo sea el protagonista.</small>
              </div>
              <span className="artist-portfolio-counter">{portfolioCount}/{portfolioLimit} fotos</span>
            </div>
            <div className="artist-portfolio-grid">
              {(profileDraft.portfolio || []).map((image) => (
                <article className="artist-portfolio-item" key={image.id}>
                  <img src={image.url} alt={image.label || 'Trabajo realizado por la artista'} />
                  <button type="button" disabled={portfolioLoadState !== 'loaded'} onClick={() => removePortfolioImage(image.id)}>Quitar</button>
                </article>
              ))}
              <label className={`artist-portfolio-upload${hasPortfolioCapacity && portfolioLoadState === 'loaded' ? '' : ' is-disabled'}`} htmlFor={hasPortfolioCapacity && portfolioLoadState === 'loaded' ? 'artist-portfolio-input' : undefined}>
                <span>{hasPortfolioCapacity ? 'Sumar un trabajo' : 'Galería completa'}</span>
                <small>{portfolioCount}/{portfolioLimit} fotos</small>
              </label>
            </div>
            {portfolioLoadState === 'loading' && !session.isMockSession && <small>Cargando tus fotos...</small>}
            {portfolioLoadState === 'error' && (
              <button type="button" onClick={() => {
                setPortfolioLoadState('loading')
                setPortfolioRetry((value) => value + 1)
              }}>
                No se pudieron cargar tus fotos. Reintentar
              </button>
            )}
            {!hasPortfolioCapacity && (
              <small className="artist-portfolio-limit-message">
                Has alcanzado el límite máximo de 12 fotografías.
              </small>
            )}
            <input
              accept="image/*"
              className="visually-hidden"
              disabled={!hasPortfolioCapacity || portfolioLoadState !== 'loaded'}
              id="artist-portfolio-input"
              multiple
              type="file"
              onChange={handlePortfolioChange}
            />
          </section>

          <section className="profile-foundation-card artist-profile-location-story">
            <div>
              <span className="eyebrow">Más cerca de tus clientas</span>
              <h3>Haz que encontrarte sea muy fácil</h3>
              <small>Tu ubicación conecta a las clientas cercanas con tu agenda y las guía directamente hasta ti.</small>
            </div>
            <div className="location-option-stack">
              <label className="location-toggle-row">
                <input
                  checked={profileDraft.professionalLocation.useStudioLocation}
                  name="artist-profile-location-mode"
                  onChange={() => updateLocationMode(true)}
                  type="radio"
                />
                <span>Usar ubicacion del estudio</span>
              </label>
              <label className="location-toggle-row">
                <input
                  checked={!profileDraft.professionalLocation.useStudioLocation}
                  name="artist-profile-location-mode"
                  onChange={() => updateLocationMode(false)}
                  type="radio"
                />
                <span>Usar ubicacion personalizada</span>
              </label>
            </div>
            {profileDraft.professionalLocation.useStudioLocation && (
              <div className="location-summary">
                <strong>{currentStudio?.profile?.commercialName || 'Estudio profesional'}</strong>
                <small>{studioLocationLabel || 'Ubicacion del estudio pendiente.'}</small>
              </div>
            )}
            <Input
              helper={locationErrors.address}
              label="Direccion del estudio"
              value={profileDraft.professionalLocation.customLocation.address}
              onChange={(event) => updateCustomLocation('address', event.target.value)}
            />
            <div className="location-form-grid">
              <Input
                helper={locationErrors.city}
                label="Ciudad"
                value={profileDraft.professionalLocation.customLocation.city}
                onChange={(event) => updateCustomLocation('city', event.target.value)}
              />
              <Input
                helper={locationErrors.state}
                label="Estado"
                value={profileDraft.professionalLocation.customLocation.state}
                onChange={(event) => updateCustomLocation('state', event.target.value)}
              />
            </div>
            <div className="location-form-grid">
              <Input
                label="Codigo Postal"
                value={profileDraft.professionalLocation.customLocation.postalCode}
                onChange={(event) => updateCustomLocation('postalCode', event.target.value)}
              />
              <Input
                helper={locationErrors.latitude || 'Puedes ajustar manualmente las coordenadas si el punto no es exacto.'}
                label="Latitud"
                value={profileDraft.professionalLocation.customLocation.latitude}
                onChange={(event) => updateCustomLocation('latitude', event.target.value)}
              />
            </div>
            <Input
              helper="Puedes ajustar manualmente las coordenadas si el punto no es exacto."
              label="Longitud"
              value={profileDraft.professionalLocation.customLocation.longitude}
              onChange={(event) => updateCustomLocation('longitude', event.target.value)}
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
            {customLocationHasCoordinates && !profileDraft.professionalLocation.useStudioLocation && (
              <div className="location-detection-row">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open(buildGoogleMapsUrl(profileDraft.professionalLocation.customLocation), '_blank', 'noopener,noreferrer')}
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
                value={profileDraft.professionalLocation.customLocation.address_references}
                onChange={(event) => updateCustomLocation('address_references', event.target.value)}
                rows="3"
              />
            </label>
            <small className="location-helper-text">
              Google Maps: {mapsUrl || 'Completa una ubicacion profesional para generar la URL base.'}
            </small>
            <Button className="full-width" variant="ghost" onClick={() => navigate(paths.artistBranches)}>
              Agregar otra ubicación
            </Button>
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Colaboraciones y Estudios</span>
              <h3>Token de invitacion</h3>
              <small>Vincula tu perfil artista a un estudio cuando recibas una invitacion.</small>
            </div>
            <Input
              label="Token de invitacion"
              placeholder="Pega aqui tu token"
              value={claimToken}
              onChange={(event) => {
                setClaimToken(event.target.value)
                setClaimStatus({ tone: 'neutral', message: '' })
              }}
            />
            <Button
              disabled={isClaimingInvitation}
              onClick={claimStudioInvitation}
            >
              {isClaimingInvitation ? 'Vinculando...' : 'Vincular a estudio'}
            </Button>
            {claimStatus.message && (
              <StatusPill tone={claimStatus.tone}>{claimStatus.message}</StatusPill>
            )}
          </section>

          <StudioBootstrapPanel
            mode="artist"
            surface="section"
            onOpenOwnerPanel={openOwnerPanel}
          />

          <BusinessPaymentSettings scopeType="artist" scopeId={session.artist?.id} />

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Tu comunidad sigue creciendo</span>
              <h3>Mantente cerca de tus clientas</h3>
            </div>
            <div className="location-form-grid">
              <Input
                label="WhatsApp"
                value={profileDraft.contactLinks.whatsapp}
                onChange={(event) => updateDraftSection('contactLinks', 'whatsapp', event.target.value)}
              />
              <Input
                label="TikTok"
                value={profileDraft.contactLinks.tiktok || ''}
                onChange={(event) => updateDraftSection('contactLinks', 'tiktok', event.target.value)}
              />
              <Input
                label="Instagram"
                value={profileDraft.contactLinks.instagram}
                onChange={(event) => updateDraftSection('contactLinks', 'instagram', event.target.value)}
              />
              <Input
                label="Facebook"
                value={profileDraft.contactLinks.facebook}
                onChange={(event) => updateDraftSection('contactLinks', 'facebook', event.target.value)}
              />
            </div>
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Tu espacio es sólo tuyo</span>
              <h3>Protege todo lo que estás construyendo</h3>
              <small>Mantén actualizados tus datos de acceso a Studio Flow.</small>
            </div>
            <Input
              label="Correo electronico"
              type="email"
              value={profileDraft.security.email}
              onChange={(event) => updateDraftSection('security', 'email', event.target.value)}
            />
            <Input
              label="Contraseña"
              type="password"
              value={profileDraft.security.password}
              onChange={(event) => updateDraftSection('security', 'password', event.target.value)}
            />
            <Input
              label="Confirmar contrasena"
              type="password"
              value={profileDraft.security.confirmPassword || ''}
              onChange={(event) => updateDraftSection('security', 'confirmPassword', event.target.value)}
            />
          </section>

          {(saveFeedback || artistProfileError) && (
            <StatusPill tone={(saveFeedback || artistProfileError).includes('No se pudo') ? 'warm' : 'success'}>
              {artistProfileError || saveFeedback}
            </StatusPill>
          )}
          <Button className="full-width" disabled={isArtistProfileSaving || profileLoadState !== 'loaded'} onClick={saveProfile}>
            {profileLoadState === 'loading' ? 'Cargando perfil...' : isArtistProfileSaving ? 'Guardando perfil...' : 'Guardar perfil profesional'}
          </Button>
        </div>
      </Card>
    </main>
  )
}

export default ArtistProfileSettings
