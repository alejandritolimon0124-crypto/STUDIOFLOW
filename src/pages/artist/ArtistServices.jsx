import { Fragment, useEffect, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import WorkspaceCardSelector from '../../components/WorkspaceCardSelector'
import { useApp } from '../../contexts/appContextCore'
import { serviceCatalog } from '../../services/staticCatalogs'
import { formatCurrency } from '../../utils/formatters'

const durations = ['30 min', '45 min', '60 min', '75 min', '90 min', '120 min']

function ArtistServices() {
  const {
    archiveArtistService,
    artistServices,
    artistServicesError,
    artistWorkContext,
    artistWorkContexts,
    isArtistServicesLoading,
    saveArtistService,
    selectArtistWorkContext,
    updateArtistServiceStatus,
  } = useApp()
  const primaryServices = Object.keys(serviceCatalog)
  const [primary, setPrimary] = useState(primaryServices[0])
  const [secondary, setSecondary] = useState(serviceCatalog[primaryServices[0]][0])
  const [duration, setDuration] = useState('60 min')
  const [price, setPrice] = useState('')
  const [flowPointsAwarded, setFlowPointsAwarded] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingDraft, setEditingDraft] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (artistServicesError) showFeedback(artistServicesError)
  }, [artistServicesError])

  const handlePrimary = (service) => {
    setPrimary(service)
    setSecondary(serviceCatalog[service][0])
  }

  const resetForm = () => {
    setPrimary(primaryServices[0])
    setSecondary(serviceCatalog[primaryServices[0]][0])
    setDuration('60 min')
    setPrice('')
    setFlowPointsAwarded('')
    setEditingId(null)
    setEditingDraft(null)
  }

  const showFeedback = (message) => {
    setFeedback(message)
    window.setTimeout(() => setFeedback(''), 1800)
  }

  const editService = (service) => {
    const nextPrimary = service.category && serviceCatalog[service.category] ? service.category : primaryServices[0]

    setEditingId(service.id)
    setEditingDraft({
      id: service.id,
      primary: nextPrimary,
      secondary: service.name,
      duration: service.duration,
      price: String(service.price),
      flowPointsAwarded: String(service.flowPointsAwarded || 0),
      bookings: service.bookings || 0,
      demand: service.demand || 'Nueva',
      status: service.status || 'Activo',
      serviceTier: service.serviceTier || 'basic',
    })
    showFeedback('Editando servicio')
  }

  const saveService = async (event) => {
    event.preventDefault()

    if (!primary || !secondary || !duration || !price) {
      showFeedback('Completa todos los campos')
      return
    }

    const nextService = {
      id: null,
      name: secondary,
      category: primary,
      price: Number(price),
      duration,
      flowPointsAwarded: Math.max(0, Number.parseInt(String(flowPointsAwarded || 0), 10) || 0),
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
        return { ...draft, primary: value, secondary: serviceCatalog[value]?.[0] || '' }
      }

      return { ...draft, [field]: value }
    })
  }

  const saveEditedService = async (event) => {
    event.preventDefault()
    if (!editingDraft?.primary || !editingDraft?.secondary || !editingDraft?.duration || !editingDraft?.price) {
      showFeedback('Completa todos los campos')
      return
    }

    setIsSaving(true)

    try {
      await saveArtistService({
        id: editingDraft.id,
        name: editingDraft.secondary,
        category: editingDraft.primary,
        price: Number(editingDraft.price),
        duration: editingDraft.duration,
        flowPointsAwarded: Math.max(0, Number.parseInt(String(editingDraft.flowPointsAwarded || 0), 10) || 0),
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
              <select value={secondary} onChange={(event) => setSecondary(event.target.value)}>
                {serviceCatalog[primary].map((service) => (
                  <option key={service} value={service}>{service}</option>
                ))}
              </select>
            </label>

            <label className="input-field">
              <span>Duracion</span>
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                {durations.map((duration) => (
                  <option key={duration}>{duration}</option>
                ))}
              </select>
            </label>

            <Input label="Precio en pesos" type="number" placeholder="850" value={price} onChange={(event) => setPrice(event.target.value)} />

            <Input
              label="Flow Points por visita"
              type="number"
              placeholder="20"
              value={flowPointsAwarded}
              onChange={(event) => setFlowPointsAwarded(event.target.value)}
            />

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
            {artistServices.filter((service) => service.status === 'Activo').map((service) => (
              <Fragment key={service.id}>
                <div className={`service-row management-row${editingId === service.id ? ' is-editing' : ''}`}>
                  <div>
                    <strong>{service.name}</strong>
                    <small>{service.category} / {service.duration} / {service.bookings} reservas / {service.flowPointsAwarded || 0} Flow Points</small>
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
                          {(serviceCatalog[editingDraft?.primary] || []).map((serviceName) => (
                            <option key={serviceName} value={serviceName}>{serviceName}</option>
                          ))}
                        </select>
                      </label>
                      <label className="input-field">
                        <span>Duracion</span>
                        <select value={editingDraft?.duration || '60 min'} onChange={(event) => updateEditingDraft('duration', event.target.value)}>
                          {durations.map((durationValue) => (
                            <option key={durationValue}>{durationValue}</option>
                          ))}
                        </select>
                      </label>
                      <Input label="Precio en pesos" type="number" value={editingDraft?.price || ''} onChange={(event) => updateEditingDraft('price', event.target.value)} />
                      <Input label="Flow Points por visita" type="number" value={editingDraft?.flowPointsAwarded || ''} onChange={(event) => updateEditingDraft('flowPointsAwarded', event.target.value)} />
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
            {artistServices.filter((service) => service.status === 'Suspendido').map((service) => (
              <Fragment key={service.id}>
                <div className={`service-row management-row${editingId === service.id ? ' is-editing' : ''}`}>
                  <div>
                    <strong>{service.name}</strong>
                    <small>{service.category} / {service.duration} / {service.flowPointsAwarded || 0} Flow Points</small>
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
                          {(serviceCatalog[editingDraft?.primary] || []).map((serviceName) => (
                            <option key={serviceName} value={serviceName}>{serviceName}</option>
                          ))}
                        </select>
                      </label>
                      <label className="input-field">
                        <span>Duracion</span>
                        <select value={editingDraft?.duration || '60 min'} onChange={(event) => updateEditingDraft('duration', event.target.value)}>
                          {durations.map((durationValue) => (
                            <option key={durationValue}>{durationValue}</option>
                          ))}
                        </select>
                      </label>
                      <Input label="Precio en pesos" type="number" value={editingDraft?.price || ''} onChange={(event) => updateEditingDraft('price', event.target.value)} />
                      <Input label="Flow Points por visita" type="number" value={editingDraft?.flowPointsAwarded || ''} onChange={(event) => updateEditingDraft('flowPointsAwarded', event.target.value)} />
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
