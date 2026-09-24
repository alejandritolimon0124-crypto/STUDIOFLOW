import { Fragment, useEffect, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import WorkspaceCardSelector from '../../components/WorkspaceCardSelector'
import { useApp } from '../../contexts/appContextCore'
import { filterServicesForWorkContext } from '../../services/artistServiceService'
import { fetchArtistMarketingSettings, fetchStudioMarketingSettings } from '../../services/artistMarketingService'
import { normalizeServiceCategory, serviceCatalog } from '../../services/staticCatalogs'
import { advancedAestheticsCatalog, customVariantOption } from '../../services/advancedAestheticsCatalog'
import { BEAUTY_SPACES } from '../../services/beautySpaceService'
import { calculateServiceFlowPoints } from '../../utils/flowPoints'
import { formatCurrency } from '../../utils/formatters'

const durations = ['30 min', '45 min', '60 min', '75 min', '90 min', '120 min']
const customServiceOption = 'Personalizado'
const standardVariantOption = 'Servicio estándar'

const normalizeComparableName = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()

function ArtistServices() {
  const {
    archiveArtistService,
    artistServices,
    artistServicesError,
    artistWorkContext,
    artistState,
    artistWorkContexts,
    isArtistServicesLoading,
    saveArtistService,
    session,
    selectArtistWorkContext,
    updateArtistServiceStatus,
  } = useApp()
  const beautySpaces = artistState.profile?.beautySpaces || [BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE]
  const canUseBeautyCare = beautySpaces.includes(BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE)
  const canUseAdvancedAesthetics = beautySpaces.includes(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS)
  const availableCatalog = {
    ...(canUseBeautyCare ? serviceCatalog : {}),
    ...(canUseAdvancedAesthetics ? advancedAestheticsCatalog : {}),
  }
  const primaryServices = Object.keys(availableCatalog)
  const [primary, setPrimary] = useState(primaryServices[0])
  const initialPrimaryValue = availableCatalog[primaryServices[0]]
  const initialSecondary = Array.isArray(initialPrimaryValue) ? initialPrimaryValue[0] : Object.keys(initialPrimaryValue || {})[0]
  const [secondary, setSecondary] = useState(initialSecondary)
  const [variant, setVariant] = useState(Array.isArray(initialPrimaryValue) ? standardVariantOption : initialPrimaryValue?.[initialSecondary]?.[0] || '')
  const [customServiceName, setCustomServiceName] = useState('')
  const [customVariantName, setCustomVariantName] = useState('')
  const [duration, setDuration] = useState('60 min')
  const [price, setPrice] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingDraft, setEditingDraft] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [flowPointsSettings, setFlowPointsSettings] = useState({ enabled: false, percentage: 5, multiplier: 1 })
  const visibleArtistServices = filterServicesForWorkContext(artistServices, artistWorkContext)

  useEffect(() => {
    let active = true
    const artistId = artistWorkContext?.artistId || session.artist?.id || session.user?.artistId
    const studioId = artistWorkContext?.studioId
    const request = artistWorkContext?.contextType === 'membership' && studioId
      ? fetchStudioMarketingSettings({ studioId })
      : fetchArtistMarketingSettings({ artistId })

    request.then((settings) => {
      if (!active) return
      setFlowPointsSettings({
        enabled: Boolean(settings.flowPointsEnabled),
        percentage: Number(settings.flowPointsRewardPercentage) || 5,
        multiplier: settings.doublePoints?.status === 'active' ? 2 : 1,
      })
    }).catch(() => {
      if (active) setFlowPointsSettings({ enabled: false, percentage: 5, multiplier: 1 })
    })

    return () => { active = false }
  }, [artistWorkContext, session.artist?.id, session.user?.artistId])

  const servicePoints = (service) => calculateServiceFlowPoints(
    service.price,
    flowPointsSettings.percentage,
    flowPointsSettings.multiplier,
  )

  const handlePrimary = (service) => {
    setPrimary(service)
    const primaryValue = availableCatalog[service]
    const nextSecondary = Array.isArray(primaryValue) ? primaryValue[0] : Object.keys(primaryValue || {})[0]
    setSecondary(nextSecondary)
    setVariant(Array.isArray(primaryValue) ? standardVariantOption : primaryValue?.[nextSecondary]?.[0] || '')
    setCustomServiceName('')
    setCustomVariantName('')
  }

  const resetForm = () => {
    setPrimary(primaryServices[0])
    const firstPrimaryValue = availableCatalog[primaryServices[0]]
    const firstSecondary = Array.isArray(firstPrimaryValue) ? firstPrimaryValue[0] : Object.keys(firstPrimaryValue || {})[0]
    setSecondary(firstSecondary)
    setVariant(Array.isArray(firstPrimaryValue) ? standardVariantOption : firstPrimaryValue?.[firstSecondary]?.[0] || '')
    setCustomServiceName('')
    setCustomVariantName('')
    setDuration('60 min')
    setPrice('')
    setEditingId(null)
    setEditingDraft(null)
  }

  const showFeedback = (message) => {
    setFeedback(message)
    window.setTimeout(() => setFeedback(''), 4500)
  }

  const hasActiveDuplicate = (serviceName, ignoredId = null) => {
    const comparableName = normalizeComparableName(serviceName)
    return visibleArtistServices.some((service) => (
      service.id !== ignoredId
      && service.status === 'Activo'
      && normalizeComparableName(service.name) === comparableName
    ))
  }

  const secondaryOptions = (category, currentValue = '') => {
    const categoryValue = availableCatalog[category]
    const catalogOptions = Array.isArray(categoryValue) ? categoryValue : Object.keys(categoryValue || {})
    const options = [...catalogOptions, customServiceOption]
    return currentValue && !options.includes(currentValue)
      ? [currentValue, ...options]
      : options
  }

  const variantOptions = (category, service) => {
    const categoryValue = availableCatalog[category]
    if (Array.isArray(categoryValue)) return [standardVariantOption, customVariantOption]
    if (!categoryValue?.[service]) return []
    return [...categoryValue[service], customVariantOption]
  }

  const editService = (service) => {
    const nextCategory = normalizeServiceCategory(service.category)
    const nextPrimary = availableCatalog[nextCategory] ? nextCategory : primaryServices[0]
    const flatCatalogServices = Array.isArray(availableCatalog[nextPrimary]) ? availableCatalog[nextPrimary] : Object.keys(availableCatalog[nextPrimary] || {})
    const isCatalogService = flatCatalogServices.includes(service.name)

    setEditingId(service.id)
    setEditingDraft({
      id: service.id,
      primary: nextPrimary,
      secondary: isCatalogService ? service.name : customServiceOption,
      customName: isCatalogService ? '' : service.name,
      variant: isCatalogService ? standardVariantOption : '',
      customVariantName: '',
      duration: service.duration,
      price: String(service.price),
      bookings: service.bookings || 0,
      demand: service.demand || 'Nueva',
      status: service.status || 'Activo',
      serviceTier: service.serviceTier || 'basic',
    })
    showFeedback('Editando servicio')
  }

  const saveService = async (event) => {
    event.preventDefault()
    const selectedSecondary = secondary === customServiceOption ? customServiceName.trim() : secondary
    const selectedVariant = variant === customVariantOption
      ? customVariantName.trim()
      : variant === standardVariantOption ? '' : variant
    const serviceName = selectedVariant ? `${selectedSecondary} · ${selectedVariant}` : selectedSecondary

    if (!primary || !serviceName || !duration || !price || (variant === customVariantOption && !customVariantName.trim())) {
      showFeedback('Completa todos los campos')
      return
    }

    if (Number(price) <= 0) {
      showFeedback('El precio debe ser mayor a cero')
      return
    }

    if (hasActiveDuplicate(serviceName)) {
      showFeedback('Ya existe un servicio activo con ese nombre')
      return
    }

    const nextService = {
      id: null,
      name: serviceName,
      category: primary,
      price: Number(price),
      duration,
      bookings: 0,
      demand: 'Nueva',
      status: 'Activo',
      serviceTier: 'basic',
    }

    setIsSaving(true)

    try {
      await saveArtistService(nextService)
      resetForm()
      showFeedback('Servicio guardado')
    } catch (error) {
      showFeedback(error.message || 'No se pudo guardar el servicio')
    } finally {
      setIsSaving(false)
    }
  }

  const updateEditingDraft = (field, value) => {
    setEditingDraft((draft) => {
      if (field === 'primary') {
        const primaryValue = availableCatalog[value]
        const nextSecondary = Array.isArray(primaryValue) ? primaryValue[0] : Object.keys(primaryValue || {})[0]
        return { ...draft, primary: value, secondary: nextSecondary || '', customName: '', variant: Array.isArray(primaryValue) ? standardVariantOption : primaryValue?.[nextSecondary]?.[0] || '', customVariantName: '' }
      }

      if (field === 'secondary') {
        return { ...draft, secondary: value, variant: variantOptions(draft.primary, value)[0] || '', customName: '', customVariantName: '' }
      }

      return { ...draft, [field]: value }
    })
  }

  const saveEditedService = async (event) => {
    event.preventDefault()
    const selectedEditingSecondary = editingDraft?.secondary === customServiceOption
      ? editingDraft?.customName?.trim()
      : editingDraft?.secondary
    const selectedEditingVariant = editingDraft?.variant === customVariantOption
      ? editingDraft?.customVariantName?.trim()
      : editingDraft?.variant === standardVariantOption ? '' : editingDraft?.variant
    const serviceName = selectedEditingVariant ? `${selectedEditingSecondary} · ${selectedEditingVariant}` : selectedEditingSecondary

    if (!editingDraft?.primary || !serviceName || !editingDraft?.duration || !editingDraft?.price
      || (editingDraft?.variant === customVariantOption && !editingDraft?.customVariantName?.trim())) {
      showFeedback('Completa todos los campos')
      return
    }

    if (Number(editingDraft.price) <= 0) {
      showFeedback('El precio debe ser mayor a cero')
      return
    }

    if (editingDraft.status === 'Activo' && hasActiveDuplicate(serviceName, editingDraft.id)) {
      showFeedback('Ya existe otro servicio activo con ese nombre')
      return
    }

    setIsSaving(true)

    try {
      await saveArtistService({
        id: editingDraft.id,
        name: serviceName,
        category: editingDraft.primary,
        price: Number(editingDraft.price),
        duration: editingDraft.duration,
        bookings: editingDraft.bookings,
        demand: editingDraft.demand,
        status: editingDraft.status,
        serviceTier: editingDraft.serviceTier,
      })
      resetForm()
      showFeedback('Servicio actualizado')
    } catch (error) {
      showFeedback(error.message || 'No se pudo actualizar el servicio')
    } finally {
      setIsSaving(false)
    }
  }

  const updateServiceStatus = async (serviceId, status) => {
    try {
      await updateArtistServiceStatus(serviceId, status)
      showFeedback(status === 'Activo' ? 'Servicio activado' : 'Servicio suspendido')
    } catch (error) {
      showFeedback(error.message || 'No se pudo actualizar el servicio')
    }
  }

  const deleteService = async (serviceId) => {
    if (!window.confirm('Eliminar servicio?')) return

    try {
      await archiveArtistService(serviceId)
      if (editingId === serviceId) resetForm()
      showFeedback('Servicio archivado')
    } catch (error) {
      showFeedback(error.message || 'No se pudo eliminar el servicio')
    }
  }

  return (
    <main className="dashboard-grid artist-grid services-master">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Agregar servicio" eyebrow="Formulario" />

          <div className="list-row elevated-row" style={{ marginBottom: '14px' }}>
            <div>
              <strong>Trabajando como:</strong>
              <WorkspaceCardSelector
                activeContext={artistWorkContext}
                contexts={artistWorkContexts}
                name="artist-service-work-context"
                onSelect={selectArtistWorkContext}
              />
            </div>
            <StatusPill tone={artistWorkContext?.contextType === 'membership' ? 'success' : 'neutral'}>
              {artistWorkContext?.contextType === 'membership' ? 'Estudio' : 'Independiente'}
            </StatusPill>
          </div>

          <form className="service-builder" onSubmit={saveService}>
            <label className="input-field">
              <span>Servicio primario</span>
              <select value={primary} onChange={(event) => handlePrimary(event.target.value)}>
                {primaryServices.map((service) => (
                  <option key={service} value={service}>{service}</option>
                ))}
              </select>
            </label>

            <label className="input-field">
              <span>Servicio secundario</span>
              <select value={secondary} onChange={(event) => {
                const nextSecondary = event.target.value
                setSecondary(nextSecondary)
                setVariant(variantOptions(primary, nextSecondary)[0] || '')
                setCustomServiceName('')
                setCustomVariantName('')
              }}>
                {secondaryOptions(primary).map((service) => (
                  <option key={service} value={service}>{service}</option>
                ))}
              </select>
            </label>

            {secondary === customServiceOption && (
              <Input
                label="Nombre de tu servicio personalizado"
                placeholder="Ej. Paquete novia diamante"
                value={customServiceName}
                onChange={(event) => setCustomServiceName(event.target.value)}
              />
            )}

            {secondary !== customServiceOption && variantOptions(primary, secondary).length > 0 && (
              <label className="input-field">
                <span>Zona o variante</span>
                <select value={variant} onChange={(event) => { setVariant(event.target.value); setCustomVariantName('') }}>
                  {variantOptions(primary, secondary).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            )}

            {variant === customVariantOption && secondary !== customServiceOption && (
              <Input label="Nombre de la zona o variante personalizada" placeholder="Ej. Frente + entrecejo" value={customVariantName} onChange={(event) => setCustomVariantName(event.target.value)} />
            )}

            <label className="input-field">
              <span>Duracion</span>
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                {durations.map((duration) => (
                  <option key={duration}>{duration}</option>
                ))}
              </select>
            </label>

            <Input label="Precio en pesos" type="number" placeholder="850" value={price} onChange={(event) => setPrice(event.target.value)} />

            {artistServicesError && <StatusPill tone="warm">{artistServicesError}</StatusPill>}
            {feedback && <StatusPill tone={feedback.includes('No se pudo') || feedback.includes('Completa') ? 'warm' : 'success'}>{feedback}</StatusPill>}
            {isArtistServicesLoading && <StatusPill tone="neutral">Cargando servicios</StatusPill>}
            <Button className="full-width" type="submit" disabled={isSaving || isArtistServicesLoading}>
              {isSaving ? 'Guardando...' : 'Guardar servicio'}
            </Button>
          </form>
        </Card>

        <Card className="mobile-screen">
          <PanelHeader title="Servicios activos" eyebrow="Disponibles" />
          <div className="service-list">
            {visibleArtistServices.filter((service) => service.status === 'Activo').map((service) => (
              <Fragment key={service.id}>
                <div className={`service-row management-row${editingId === service.id ? ' is-editing' : ''}`}>
                  <div>
                    <strong>{service.name}</strong>
                    <small>{service.category} / {service.duration} / {service.bookings} reservas</small>
                    {flowPointsSettings.enabled && (
                      <small className="flow-points-slot-note">
                        Otorga {servicePoints(service)} FP al completar{flowPointsSettings.multiplier === 2 ? ' / puntos dobles activos' : ''}
                      </small>
                    )}
                  </div>
                  <div className="row-actions">
                    <span>{formatCurrency(service.price)}</span>
                    <button type="button" onClick={() => editService(service)}>Editar</button>
                    <button type="button" onClick={() => updateServiceStatus(service.id, 'Suspendido')}>Suspender</button>
                    <button type="button" onClick={() => deleteService(service.id)}>Eliminar</button>
                  </div>
                </div>
                {editingId === service.id && (
                  <div className="inline-service-editor">
                    <strong>Editar servicio</strong>
                    <form className="service-builder inline-service-form" onSubmit={saveEditedService}>
                      <label className="input-field">
                        <span>Servicio primario</span>
                        <select value={editingDraft?.primary || primaryServices[0]} onChange={(event) => updateEditingDraft('primary', event.target.value)}>
                          {primaryServices.map((serviceName) => (
                            <option key={serviceName} value={serviceName}>{serviceName}</option>
                          ))}
                        </select>
                      </label>
                      <label className="input-field">
                        <span>Servicio secundario</span>
                        <select value={editingDraft?.secondary || ''} onChange={(event) => updateEditingDraft('secondary', event.target.value)}>
                          {secondaryOptions(editingDraft?.primary, editingDraft?.secondary).map((serviceName) => (
                            <option key={serviceName} value={serviceName}>{serviceName}</option>
                          ))}
                        </select>
                      </label>
                      {editingDraft?.secondary === customServiceOption && (
                        <Input
                          label="Nombre de tu servicio personalizado"
                          placeholder="Ej. Paquete novia diamante"
                          value={editingDraft?.customName || ''}
                          onChange={(event) => updateEditingDraft('customName', event.target.value)}
                        />
                      )}
                      {editingDraft?.secondary !== customServiceOption && variantOptions(editingDraft?.primary, editingDraft?.secondary).length > 0 && (
                        <label className="input-field">
                          <span>Zona o variante</span>
                          <select value={editingDraft?.variant || ''} onChange={(event) => updateEditingDraft('variant', event.target.value)}>
                            {variantOptions(editingDraft?.primary, editingDraft?.secondary).map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </label>
                      )}
                      {editingDraft?.variant === customVariantOption && (
                        <Input label="Nombre de la zona o variante personalizada" value={editingDraft?.customVariantName || ''} onChange={(event) => updateEditingDraft('customVariantName', event.target.value)} />
                      )}
                      <label className="input-field">
                        <span>Duracion</span>
                        <select value={editingDraft?.duration || '60 min'} onChange={(event) => updateEditingDraft('duration', event.target.value)}>
                          {durations.map((durationValue) => (
                            <option key={durationValue}>{durationValue}</option>
                          ))}
                        </select>
                      </label>
                      <Input label="Precio en pesos" type="number" value={editingDraft?.price || ''} onChange={(event) => updateEditingDraft('price', event.target.value)} />
                      <div className="row-actions">
                        <Button size="sm" type="submit" disabled={isSaving || isArtistServicesLoading}>
                          {isSaving ? 'Actualizando...' : 'Actualizar servicio'}
                        </Button>
                        <Button size="sm" variant="ghost" type="button" onClick={resetForm}>Cancelar</Button>
                      </div>
                    </form>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </Card>

        <Card className="mobile-screen">
          <PanelHeader title="Servicios suspendidos" eyebrow="Pausados" />
          <div className="service-list">
            {visibleArtistServices.filter((service) => service.status === 'Suspendido').map((service) => (
              <Fragment key={service.id}>
                <div className={`service-row management-row${editingId === service.id ? ' is-editing' : ''}`}>
                  <div>
                    <strong>{service.name}</strong>
                    <small>{service.category} / {service.duration}</small>
                    {flowPointsSettings.enabled && <small className="flow-points-slot-note">Otorgaria {servicePoints(service)} FP al completar</small>}
                  </div>
                  <div className="row-actions">
                    <StatusPill tone="warm">Suspendido</StatusPill>
                    <button type="button" onClick={() => updateServiceStatus(service.id, 'Activo')}>Activar</button>
                    <button type="button" onClick={() => editService(service)}>Editar</button>
                    <button type="button" onClick={() => deleteService(service.id)}>Eliminar</button>
                  </div>
                </div>
                {editingId === service.id && (
                  <div className="inline-service-editor">
                    <strong>Editar servicio</strong>
                    <form className="service-builder inline-service-form" onSubmit={saveEditedService}>
                      <label className="input-field">
                        <span>Servicio primario</span>
                        <select value={editingDraft?.primary || primaryServices[0]} onChange={(event) => updateEditingDraft('primary', event.target.value)}>
                          {primaryServices.map((serviceName) => (
                            <option key={serviceName} value={serviceName}>{serviceName}</option>
                          ))}
                        </select>
                      </label>
                      <label className="input-field">
                        <span>Servicio secundario</span>
                        <select value={editingDraft?.secondary || ''} onChange={(event) => updateEditingDraft('secondary', event.target.value)}>
                          {secondaryOptions(editingDraft?.primary, editingDraft?.secondary).map((serviceName) => (
                            <option key={serviceName} value={serviceName}>{serviceName}</option>
                          ))}
                        </select>
                      </label>
                      {editingDraft?.secondary === customServiceOption && (
                        <Input
                          label="Nombre de tu servicio personalizado"
                          placeholder="Ej. Paquete novia diamante"
                          value={editingDraft?.customName || ''}
                          onChange={(event) => updateEditingDraft('customName', event.target.value)}
                        />
                      )}
                      {editingDraft?.secondary !== customServiceOption && variantOptions(editingDraft?.primary, editingDraft?.secondary).length > 0 && (
                        <label className="input-field">
                          <span>Zona o variante</span>
                          <select value={editingDraft?.variant || ''} onChange={(event) => updateEditingDraft('variant', event.target.value)}>
                            {variantOptions(editingDraft?.primary, editingDraft?.secondary).map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </label>
                      )}
                      {editingDraft?.variant === customVariantOption && (
                        <Input label="Nombre de la zona o variante personalizada" value={editingDraft?.customVariantName || ''} onChange={(event) => updateEditingDraft('customVariantName', event.target.value)} />
                      )}
                      <label className="input-field">
                        <span>Duracion</span>
                        <select value={editingDraft?.duration || '60 min'} onChange={(event) => updateEditingDraft('duration', event.target.value)}>
                          {durations.map((durationValue) => (
                            <option key={durationValue}>{durationValue}</option>
                          ))}
                        </select>
                      </label>
                      <Input label="Precio en pesos" type="number" value={editingDraft?.price || ''} onChange={(event) => updateEditingDraft('price', event.target.value)} />
                      <div className="row-actions">
                        <Button size="sm" type="submit" disabled={isSaving || isArtistServicesLoading}>
                          {isSaving ? 'Actualizando...' : 'Actualizar servicio'}
                        </Button>
                        <Button size="sm" variant="ghost" type="button" onClick={resetForm}>Cancelar</Button>
                      </div>
                    </form>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </Card>
    </main>
  )
}

export default ArtistServices
