import { useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import { useApp } from '../../contexts/appContextCore'
import { buildGoogleMapsUrl, createArtistLocationSettings, validateProfessionalLocation } from '../../utils/locationHelpers'

const portfolioLimit = 12

function ArtistProfileSettings() {
  const { adminState, artistState, session, updateArtistProfile } = useApp()
  const primaryArtist = adminState.artists.find((artist) => artist.studioId === session.user?.studioId) || adminState.artists[0]
  const currentStudio = adminState.studios.find((studio) => studio.id === primaryArtist?.studioId) || adminState.studios[0]
  const [profileDraft, setProfileDraft] = useState({
    ...artistState.profile,
    professionalLocation: createArtistLocationSettings(artistState.profile?.professionalLocation),
  })
  const [locationErrors, setLocationErrors] = useState({})
  const effectiveLocation = profileDraft.professionalLocation.useStudioLocation
    ? currentStudio?.professionalLocation
    : profileDraft.professionalLocation.customLocation
  const mapsUrl = buildGoogleMapsUrl(effectiveLocation)
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

  const updateDraftSection = (section, field, value) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      [section]: {
        ...currentDraft[section],
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
  }

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setProfileDraft((currentDraft) => ({ ...currentDraft, photoUrl: String(reader.result || '') }))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const readPortfolioImageFile = (file, onLoad) => {
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const source = String(reader.result || '')
      const image = new Image()

      image.onload = () => {
        const maxSize = 1200
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) {
          onLoad(source)
          return
        }

        canvas.width = width
        canvas.height = height
        context.drawImage(image, 0, 0, width, height)
        onLoad(canvas.toDataURL('image/jpeg', 0.78))
      }

      image.onerror = () => onLoad(source)
      image.src = source
    }
    reader.readAsDataURL(file)
  }

  const handlePortfolioChange = (event) => {
    const files = Array.from(event.target.files || []).slice(0, portfolioLimit - (profileDraft.portfolio || []).length)

    files.forEach((file) => {
      readPortfolioImageFile(file, (url) => {
        setProfileDraft((currentDraft) => ({
          ...currentDraft,
          portfolio: [
            ...(currentDraft.portfolio || []),
            {
              id: `artist-portfolio-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              label: file.name,
              url,
            },
          ].slice(0, portfolioLimit),
        }))
      })
    })
    event.target.value = ''
  }

  const removePortfolioImage = (imageId) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      portfolio: (currentDraft.portfolio || []).filter((image) => image.id !== imageId),
    }))
  }

  const saveProfile = () => {
    if (!profileDraft.professionalLocation.useStudioLocation) {
      const nextErrors = validateProfessionalLocation(profileDraft.professionalLocation.customLocation)

      if (Object.keys(nextErrors).length > 0) {
        setLocationErrors(nextErrors)
        return
      }
    }

    updateArtistProfile(profileDraft)
    setLocationErrors({})
  }

  return (
    <main className="dashboard-grid artist-grid profile-foundation-grid">
      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Mi Perfil" eyebrow="Fuente profesional" />
        <div className="profile-foundation-stack">
          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Cuenta</span>
              <h3>Informacion personal</h3>
            </div>
            <Input
              label="Nombre completo"
              value={profileDraft.personalInfo.fullName}
              onChange={(event) => updateDraftSection('personalInfo', 'fullName', event.target.value)}
            />
            <div className="location-form-grid">
              <Input
                label="Telefono"
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
              <span className="eyebrow">Branding</span>
              <h3>Foto profesional</h3>
              <small>Esta misma foto alimenta hero, sidebar, Marketplace y Perfil Publico futuro.</small>
            </div>
            <div className="profile-photo-row">
              <div className="artist-photo-preview">
                {profileDraft.photoUrl ? (
                  <img src={profileDraft.photoUrl} alt={`Foto de ${profileDraft.personalInfo.fullName}`} />
                ) : (
                  <span>VM</span>
                )}
              </div>
              <div className="artist-photo-actions">
                <label className="button button-ghost button-sm" htmlFor="professional-photo-input">
                  {profileDraft.photoUrl ? 'Cambiar foto' : 'Subir foto'}
                </label>
                <input
                  accept="image/*"
                  className="visually-hidden"
                  id="professional-photo-input"
                  type="file"
                  onChange={handlePhotoChange}
                />
                {profileDraft.photoUrl && (
                  <button type="button" onClick={() => setProfileDraft({ ...profileDraft, photoUrl: '' })}>Eliminar foto</button>
                )}
              </div>
            </div>
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Perfil Publico futuro</span>
              <h3>Perfil Profesional</h3>
            </div>
            <Input
              label="Especialidad principal"
              value={profileDraft.professionalProfile.primarySpecialty}
              onChange={(event) => updateDraftSection('professionalProfile', 'primarySpecialty', event.target.value)}
            />
            <label className="input-field">
              <span>Biografia corta</span>
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
          </section>

          <section className="profile-foundation-card">
            <div className="artist-portfolio-heading">
              <div>
                <span className="eyebrow">Portafolio</span>
                <h3>📸 Mi Portafolio</h3>
                <small>Estas imágenes serán visibles para las clientas en tu perfil público.</small>
                <small>Comparte trabajos realizados que representen la calidad de tus servicios.</small>
              </div>
              <span className="artist-portfolio-counter">{portfolioCount}/{portfolioLimit} fotos</span>
            </div>
            <div className="artist-portfolio-grid">
              {(profileDraft.portfolio || []).map((image) => (
                <article className="artist-portfolio-item" key={image.id}>
                  <img src={image.url} alt={image.label || 'Trabajo realizado por la artista'} />
                  <button type="button" onClick={() => removePortfolioImage(image.id)}>Quitar</button>
                </article>
              ))}
              <label className={`artist-portfolio-upload${hasPortfolioCapacity ? '' : ' is-disabled'}`} htmlFor={hasPortfolioCapacity ? 'artist-portfolio-input' : undefined}>
                <span>{hasPortfolioCapacity ? 'Agregar foto' : 'Límite alcanzado'}</span>
                <small>{portfolioCount}/{portfolioLimit} fotos</small>
              </label>
            </div>
            {!hasPortfolioCapacity && (
              <small className="artist-portfolio-limit-message">
                Has alcanzado el límite máximo de 12 fotografías.
              </small>
            )}
            <input
              accept="image/*"
              className="visually-hidden"
              disabled={!hasPortfolioCapacity}
              id="artist-portfolio-input"
              multiple
              type="file"
              onChange={handlePortfolioChange}
            />
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Ubicacion</span>
              <h3>Ubicacion Profesional</h3>
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
            {profileDraft.professionalLocation.useStudioLocation ? (
              <div className="location-summary">
                <strong>{currentStudio?.professionalLocation?.businessName || currentStudio?.name}</strong>
                <small>{studioLocationLabel || 'Ubicacion del estudio pendiente.'}</small>
              </div>
            ) : (
              <>
                <Input
                  helper={locationErrors.address}
                  label="Direccion"
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
                    label="Latitude"
                    value={profileDraft.professionalLocation.customLocation.latitude}
                    onChange={(event) => updateCustomLocation('latitude', event.target.value)}
                  />
                </div>
                <Input
                  label="Longitude"
                  value={profileDraft.professionalLocation.customLocation.longitude}
                  onChange={(event) => updateCustomLocation('longitude', event.target.value)}
                />
                <label className="input-field">
                  <span>Referencias</span>
                  <textarea
                    value={profileDraft.professionalLocation.customLocation.references}
                    onChange={(event) => updateCustomLocation('references', event.target.value)}
                    rows="3"
                  />
                </label>
              </>
            )}
            <small className="location-helper-text">
              Google Maps futuro: {mapsUrl || 'Completa una ubicacion profesional para generar la URL base.'}
            </small>
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Contacto futuro</span>
              <h3>Contacto y redes</h3>
            </div>
            <Input
              label="WhatsApp"
              value={profileDraft.contactLinks.whatsapp}
              onChange={(event) => updateDraftSection('contactLinks', 'whatsapp', event.target.value)}
            />
            <div className="location-form-grid">
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
              <span className="eyebrow">Mock</span>
              <h3>Seguridad</h3>
              <small>Preparado para autenticacion real; por ahora no cambia credenciales reales.</small>
            </div>
            <Input
              label="Correo"
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
          </section>

          <Button className="full-width" onClick={saveProfile}>Guardar perfil profesional</Button>
        </div>
      </Card>
    </main>
  )
}

export default ArtistProfileSettings
