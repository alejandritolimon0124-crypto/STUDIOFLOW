import { useEffect, useState } from 'react'
import { STUDIO_STATUS } from '../modules/governance/studioGovernance'
import { useApp } from '../contexts/appContextCore'
import { getCurrentBrowserCoordinates } from '../utils/browserGeolocation'
import { buildGoogleMapsUrl, hasCoordinates } from '../utils/locationHelpers'
import { bootstrapStudio, fetchOwnStudios } from '../services/studioService'
import Button from './Button'
import Card from './Card'
import Input from './Input'
import PanelHeader from './PanelHeader'
import StatusPill from './StatusPill'

const initialStudioForm = {
  studioName: '',
  commercialName: '',
  city: '',
  phone: '',
  email: '',
  addressLine: '',
  description: '',
  latitude: '',
  longitude: '',
}

const statusCopy = {
  [STUDIO_STATUS.PENDING]: {
    label: 'Pending Approval',
    message: 'Tu estudio esta pendiente de revision.',
    tone: 'pending',
  },
  [STUDIO_STATUS.APPROVED]: {
    label: 'Approved',
    message: 'Tu estudio esta activo.',
    tone: 'approved',
  },
  [STUDIO_STATUS.REJECTED]: {
    label: 'Rejected',
    message: 'Tu estudio requiere ajustes.',
    tone: 'rejected',
  },
  [STUDIO_STATUS.SUSPENDED]: {
    label: 'Suspended',
    message: 'Tu estudio esta suspendido.',
    tone: 'suspended',
  },
}

function StudioBootstrapPanel({
  mode = 'owner',
  surface = 'card',
  onOpenOwnerPanel,
}) {
  const [ownStudios, setOwnStudios] = useState([])
  const [isOwnStudiosLoading, setIsOwnStudiosLoading] = useState(false)
  const [ownStudiosError, setOwnStudiosError] = useState('')
  const [showCreateStudioForm, setShowCreateStudioForm] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [studioForm, setStudioForm] = useState(initialStudioForm)
  const [studioFormError, setStudioFormError] = useState('')
  const [studioFormSuccess, setStudioFormSuccess] = useState('')
  const [isCreatingStudio, setIsCreatingStudio] = useState(false)
  const [isOpeningOwnerPanel, setIsOpeningOwnerPanel] = useState(false)
  const [locationDetection, setLocationDetection] = useState({ status: 'idle', message: '' })
  const [isStudioLocationConfirmed, setIsStudioLocationConfirmed] = useState(false)
  const { refreshAuthContext } = useApp()

  const isArtistMode = mode === 'artist'
  const operationalStudio = ownStudios.find((studio) => ['pending', 'approved'].includes(studio.studioStatus))
  const shouldShowCreateStudio = !operationalStudio
  const studioFormHasCoordinates = hasCoordinates(studioForm)
  const studioMapsUrl = buildGoogleMapsUrl(studioForm)

  const refreshOwnStudios = async () => {
    setIsOwnStudiosLoading(true)
    setOwnStudiosError('')

    try {
      const studios = await fetchOwnStudios()
      setOwnStudios(studios)
      return studios
    } catch (error) {
      setOwnStudios([])
      setOwnStudiosError(error.message || 'No se pudieron cargar tus estudios.')
      return []
    } finally {
      setIsOwnStudiosLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    setIsOwnStudiosLoading(true)
    setOwnStudiosError('')

    fetchOwnStudios()
      .then((studios) => {
        if (isMounted) setOwnStudios(studios)
      })
      .catch((error) => {
        if (!isMounted) return
        setOwnStudios([])
        setOwnStudiosError(error.message || 'No se pudieron cargar tus estudios.')
      })
      .finally(() => {
        if (isMounted) setIsOwnStudiosLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const updateStudioForm = (field, value) => {
    setStudioForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }))
    if (['addressLine', 'city', 'latitude', 'longitude'].includes(field)) {
      setIsStudioLocationConfirmed(false)
    }
    setStudioFormError('')
    setStudioFormSuccess('')
  }

  const useCurrentLocationForStudio = async () => {
    setLocationDetection({ status: 'loading', message: 'Detectando ubicacion actual...' })

    try {
      const coordinates = await getCurrentBrowserCoordinates()
      setStudioForm((currentForm) => ({
        ...currentForm,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
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

  const submitCreateStudio = async (event) => {
    event.preventDefault()

    if (isCreatingStudio || operationalStudio) return

    if (!studioForm.studioName.trim() || !studioForm.commercialName.trim() || !studioForm.city.trim()) {
      setStudioFormError('Completa nombre del estudio, nombre comercial y ciudad.')
      return
    }

    if (studioFormHasCoordinates && !isStudioLocationConfirmed) {
      setStudioFormError('Confirma que esta ubicacion corresponde a tu estudio.')
      return
    }

    setIsCreatingStudio(true)
    setStudioFormError('')
    setStudioFormSuccess('')

    try {
      const result = await bootstrapStudio(studioForm)
      const nextOwnStudio = result.ownStudio
      const refreshedOwnStudios = await refreshOwnStudios()

      if (refreshedOwnStudios.length === 0 && nextOwnStudio?.id) {
        setOwnStudios([nextOwnStudio])
      }

      await refreshAuthContext?.()
      setShowCreateStudioForm(false)
      setStudioForm(initialStudioForm)
      setIsStudioLocationConfirmed(false)
      setLocationDetection({ status: 'idle', message: '' })
      setStudioFormSuccess('Tu estudio fue creado y se encuentra en revision.')
    } catch (error) {
      setStudioFormError(error.message || 'No se pudo crear el estudio.')
    } finally {
      setIsCreatingStudio(false)
    }
  }

  const openOwnerPanel = async () => {
    if (!onOpenOwnerPanel || isOpeningOwnerPanel) return

    setIsOpeningOwnerPanel(true)
    try {
      await refreshAuthContext?.()
      await onOpenOwnerPanel()
    } finally {
      setIsOpeningOwnerPanel(false)
    }
  }

  const renderStudioForm = () => (
    <form className="profile-foundation-card" onSubmit={submitCreateStudio}>
      <div>
        <span className="eyebrow">Nuevo estudio</span>
        <h3>Datos iniciales</h3>
      </div>
      <Input
        label="Nombre del estudio"
        required
        value={studioForm.studioName}
        onChange={(event) => updateStudioForm('studioName', event.target.value)}
      />
      <Input
        label="Nombre comercial"
        required
        value={studioForm.commercialName}
        onChange={(event) => updateStudioForm('commercialName', event.target.value)}
      />
      <div className="location-form-grid">
        <Input
          label="Ciudad"
          required
          value={studioForm.city}
          onChange={(event) => updateStudioForm('city', event.target.value)}
        />
        <Input
          label="Telefono"
          value={studioForm.phone}
          onChange={(event) => updateStudioForm('phone', event.target.value)}
        />
      </div>
      <Input
        label="Email"
        type="email"
        value={studioForm.email}
        onChange={(event) => updateStudioForm('email', event.target.value)}
      />
      <Input
        label="Direccion"
        value={studioForm.addressLine}
        onChange={(event) => updateStudioForm('addressLine', event.target.value)}
      />
      <label className="input-field">
        <span>Descripcion</span>
        <textarea
          rows="3"
          value={studioForm.description}
          onChange={(event) => updateStudioForm('description', event.target.value)}
        />
      </label>
      <div className="location-form-grid">
        <Input
          helper="Puedes ajustar manualmente las coordenadas si el punto no es exacto."
          label="Latitud"
          value={studioForm.latitude}
          onChange={(event) => updateStudioForm('latitude', event.target.value)}
        />
        <Input
          helper="Puedes ajustar manualmente las coordenadas si el punto no es exacto."
          label="Longitud"
          value={studioForm.longitude}
          onChange={(event) => updateStudioForm('longitude', event.target.value)}
        />
      </div>
      <div className="location-detection-row">
        <Button
          disabled={locationDetection.status === 'loading' || isCreatingStudio}
          size="sm"
          type="button"
          variant="ghost"
          onClick={useCurrentLocationForStudio}
        >
          {locationDetection.status === 'loading' ? 'Detectando...' : 'Usar mi ubicacion actual'}
        </Button>
        {locationDetection.message && (
          <small className={`location-detection-message location-detection-${locationDetection.status}`}>
            {locationDetection.message}
          </small>
        )}
      </div>
      {studioFormHasCoordinates && (
        <div className="location-detection-row">
          <Button
            size="sm"
            type="button"
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
            <span>Confirmo que esta ubicacion corresponde a mi estudio.</span>
          </label>
        </div>
      )}
      {studioFormError && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{studioFormError}</small>}
      <div className="studio-review-actions">
        <Button disabled={isCreatingStudio} type="submit">
          {isCreatingStudio ? 'Creando...' : 'Crear Estudio'}
        </Button>
        <Button
          disabled={isCreatingStudio}
          type="button"
          variant="ghost"
          onClick={() => {
            setShowCreateStudioForm(false)
            setStudioFormError('')
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )

  const content = (
    <>
      {isOwnStudiosLoading && (
        <div className="studio-review-row">
          <div>
            <strong>Cargando estado del estudio...</strong>
            <small>Estamos revisando tus estudios asociados.</small>
          </div>
          <StatusPill tone="neutral">Cargando</StatusPill>
        </div>
      )}

      {ownStudiosError && (
        <div className="studio-review-row">
          <div>
            <strong>No se pudo cargar tu estudio.</strong>
            <small>{ownStudiosError}</small>
          </div>
          <StatusPill tone="warm">Error</StatusPill>
        </div>
      )}

      {!isOwnStudiosLoading && operationalStudio && (
        <div className="studio-review-stack">
          <div className="studio-review-row">
            <div>
              <strong>{operationalStudio.commercialName || 'Studio Name'}</strong>
              <small>Estado: {statusCopy[operationalStudio.studioStatus]?.label || operationalStudio.studioStatus}</small>
              <small>{statusCopy[operationalStudio.studioStatus]?.message || 'Estado del estudio actualizado.'}</small>
              {showDetails && (
                <small>{operationalStudio.city || 'Ciudad pendiente'} / Registro {operationalStudio.createdAt || 'reciente'}</small>
              )}
            </div>
            <StatusPill tone={statusCopy[operationalStudio.studioStatus]?.tone || 'neutral'}>
              {statusCopy[operationalStudio.studioStatus]?.label || operationalStudio.studioStatus}
            </StatusPill>
          </div>
          {operationalStudio.studioStatus === STUDIO_STATUS.PENDING && (
            <Button size="sm" variant="ghost" onClick={() => setShowDetails((currentValue) => !currentValue)}>
              Ver Detalles
            </Button>
          )}
          {operationalStudio.studioStatus === STUDIO_STATUS.APPROVED && onOpenOwnerPanel && (
            <Button disabled={isOpeningOwnerPanel} size="sm" onClick={openOwnerPanel}>
              {isOpeningOwnerPanel ? 'Abriendo...' : 'Abrir Panel Owner'}
            </Button>
          )}
        </div>
      )}

      {!isOwnStudiosLoading && shouldShowCreateStudio && (
        <div className="profile-foundation-stack">
          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">{isArtistMode ? 'Mi negocio' : 'Studio owner'}</span>
              <h3>{isArtistMode ? 'Tienes tu propio estudio?' : 'Aun no tienes un estudio registrado.'}</h3>
              {isArtistMode ? (
                <>
                  <p>Crea un estudio y administra:</p>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    <li>artistas</li>
                    <li>agendas compartidas</li>
                    <li>clientas del estudio</li>
                    <li>marketplace del estudio</li>
                  </ul>
                </>
              ) : (
                <p>Crear un estudio te permitira invitar artistas, gestionar membresias, administrar clientas, publicar servicios y participar en marketplace.</p>
              )}
            </div>
            {!showCreateStudioForm && (
              <Button onClick={() => setShowCreateStudioForm(true)}>Crear Estudio</Button>
            )}
          </section>
          {showCreateStudioForm && renderStudioForm()}
        </div>
      )}

      {studioFormSuccess && (
        <div className="studio-review-row">
          <div>
            <strong>Estudio creado.</strong>
            <small>{studioFormSuccess}</small>
          </div>
          <StatusPill tone="success">Listo</StatusPill>
        </div>
      )}
    </>
  )

  if (surface === 'section') {
    return (
      <>
        <section className="profile-foundation-card">
          <div>
            <span className="eyebrow">Mi negocio</span>
            <h3>Estudio profesional</h3>
          </div>
        </section>
        {content}
      </>
    )
  }

  return (
    <Card className="wide-card executive-card">
      <PanelHeader title="Mi estudio" eyebrow="Alta de estudio" />
      {content}
    </Card>
  )
}

export default StudioBootstrapPanel
