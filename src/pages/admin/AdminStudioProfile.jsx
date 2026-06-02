import { useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import { useApp } from '../../contexts/appContextCore'
import { buildGoogleMapsUrl, createProfessionalLocation, validateProfessionalLocation } from '../../utils/locationHelpers'

const galleryLimit = 5

function AdminStudioProfile() {
  const { adminState, session, updateManagedStudioProfile } = useApp()
  const currentStudio = adminState.studios.find((studio) => studio.id === session.user?.studioId) || adminState.studios[0]
  const [profileDraft, setProfileDraft] = useState(currentStudio.profile)
  const [locationDraft, setLocationDraft] = useState(createProfessionalLocation(currentStudio.professionalLocation))
  const [locationErrors, setLocationErrors] = useState({})
  const mapsUrl = buildGoogleMapsUrl(locationDraft)
  const galleryCount = (profileDraft.gallery || []).length
  const hasGalleryCapacity = galleryCount < galleryLimit

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
    setLocationErrors((currentErrors) => ({ ...currentErrors, [field]: '' }))
  }

  const readImageFile = (file, onLoad) => {
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => onLoad(String(reader.result || ''))
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

    if (Object.keys(nextErrors).length > 0) {
      setLocationErrors(nextErrors)
      return
    }

    updateManagedStudioProfile(currentStudio.id, {
      name: profileDraft.commercialName || currentStudio.name,
      profile: profileDraft,
      professionalLocation: {
        ...locationDraft,
        businessName: locationDraft.businessName || profileDraft.commercialName,
      },
    })
    setLocationErrors({})
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
              label="Nombre comercial"
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
                  <span>{(profileDraft.commercialName || currentStudio.name).slice(0, 2)}</span>
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
              value={locationDraft.businessName}
              onChange={(event) => updateLocationField('businessName', event.target.value)}
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
                label="Latitude"
                value={locationDraft.latitude}
                onChange={(event) => updateLocationField('latitude', event.target.value)}
              />
            </div>
            <Input
              label="Longitude"
              value={locationDraft.longitude}
              onChange={(event) => updateLocationField('longitude', event.target.value)}
            />
            <label className="input-field">
              <span>Referencias</span>
              <textarea
                value={locationDraft.references}
                onChange={(event) => updateLocationField('references', event.target.value)}
                rows="3"
              />
            </label>
            <small className="location-helper-text">
              Google Maps futuro: {mapsUrl || 'Completa direccion, ciudad y estado para generar la URL base.'}
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

          <Button className="full-width" onClick={saveStudioProfile}>Guardar estudio</Button>
        </div>
      </Card>
    </main>
  )
}

export default AdminStudioProfile
