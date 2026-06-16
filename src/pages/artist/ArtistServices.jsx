import { useEffect, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { serviceCatalog } from '../../services/mockData'
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
  const [editingId, setEditingId] = useState(null)
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
    setEditingId(null)
  }

  const showFeedback = (message) => {
    setFeedback(message)
    window.setTimeout(() => setFeedback(''), 1800)
  }

  const editService = (service) => {
    const nextPrimary = service.category && serviceCatalog[service.category] ? service.category : primaryServices[0]

    setPrimary(nextPrimary)
    setSecondary(service.name)
    setDuration(service.duration)
    setPrice(String(service.price))
    setEditingId(service.id)
  }

  const saveService = async (event) => {
    event.preventDefault()

    if (!primary || !secondary || !duration || !price) {
      showFeedback('Completa todos los campos')
      return
    }

    const existingService = editingId ? artistServices.find((service) => service.id === editingId) : null
    const nextService = {
      id: editingId,
      name: secondary,
      category: primary,
      price: Number(price),
      duration,
      bookings: existingService?.bookings || 0,
      demand: existingService?.demand || 'Nueva',
      status: existingService?.status || 'Activo',
      serviceTier: existingService?.serviceTier || 'basic',
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
              <div className="row-actions" style={{ flexWrap: 'wrap', marginTop: '8px' }}>
                {(artistWorkContexts.length ? artistWorkContexts : [artistWorkContext].filter(Boolean)).map((context) => (
                  <label key={context.id} style={{ alignItems: 'center', display: 'inline-flex', gap: '8px', fontWeight: 800 }}>
                    <input
                      checked={artistWorkContext?.id === context.id}
                      name="artist-service-work-context"
                      type="radio"
                      value={context.id}
                      onChange={() => selectArtistWorkContext(context.id)}
                    />
                    {context.label}
                  </label>
                ))}
              </div>
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

            {feedback && <StatusPill tone={feedback.includes('No se pudo') || feedback.includes('Completa') ? 'warm' : 'success'}>{feedback}</StatusPill>}
            {isArtistServicesLoading && <StatusPill tone="neutral">Cargando servicios</StatusPill>}
            <Button className="full-width" type="submit" disabled={isSaving || isArtistServicesLoading}>
              {isSaving ? 'Guardando...' : editingId ? 'Actualizar servicio' : 'Guardar servicio'}
            </Button>
          </form>
        </Card>

        <Card className="mobile-screen">
          <PanelHeader title="Servicios activos" eyebrow="Disponibles" />
          <div className="service-list">
            {artistServices.filter((service) => service.status === 'Activo').map((service) => (
              <div className="service-row management-row" key={service.id}>
                <div>
                  <strong>{service.name}</strong>
                  <small>{service.category} / {service.duration} / {service.bookings} reservas</small>
                </div>
                <div className="row-actions">
                  <span>{formatCurrency(service.price)}</span>
                  <button type="button" onClick={() => editService(service)}>Editar</button>
                  <button type="button" onClick={() => updateServiceStatus(service.id, 'Suspendido')}>Suspender</button>
                  <button type="button" onClick={() => deleteService(service.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="mobile-screen">
          <PanelHeader title="Servicios suspendidos" eyebrow="Pausados" />
          <div className="service-list">
            {artistServices.filter((service) => service.status === 'Suspendido').map((service) => (
              <div className="service-row management-row" key={service.id}>
                <div>
                  <strong>{service.name}</strong>
                  <small>{service.category} / {service.duration}</small>
                </div>
                <div className="row-actions">
                  <StatusPill tone="warm">Suspendido</StatusPill>
                  <button type="button" onClick={() => updateServiceStatus(service.id, 'Activo')}>Activar</button>
                  <button type="button" onClick={() => editService(service)}>Editar</button>
                  <button type="button" onClick={() => deleteService(service.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
    </main>
  )
}

export default ArtistServices
