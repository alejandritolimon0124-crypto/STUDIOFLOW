import { useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { artistServices, serviceCatalog } from '../../services/mockData'
import { formatCurrency } from '../../utils/formatters'

const durations = ['30 min', '45 min', '60 min', '75 min', '90 min', '120 min']

function ArtistServices() {
  const primaryServices = Object.keys(serviceCatalog)
  const [services, setServices] = useState(() =>
    artistServices.map((service, index) => ({
      ...service,
      id: `artist-service-${index + 1}`,
    })),
  )
  const [primary, setPrimary] = useState(primaryServices[0])
  const [secondary, setSecondary] = useState(serviceCatalog[primaryServices[0]][0])
  const [duration, setDuration] = useState('60 min')
  const [price, setPrice] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [feedback, setFeedback] = useState('')

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

  const saveService = (event) => {
    event.preventDefault()

    if (!primary || !secondary || !duration || !price) {
      showFeedback('Completa todos los campos')
      return
    }

    const nextService = {
      id: editingId || `artist-service-${Date.now()}`,
      name: secondary,
      category: primary,
      price: Number(price),
      duration,
      bookings: editingId ? services.find((service) => service.id === editingId)?.bookings || 0 : 0,
      demand: editingId ? services.find((service) => service.id === editingId)?.demand || 'Nueva' : 'Nueva',
      status: editingId ? services.find((service) => service.id === editingId)?.status || 'Activo' : 'Activo',
    }

    setServices((currentServices) =>
      editingId
        ? currentServices.map((service) => (service.id === editingId ? nextService : service))
        : [nextService, ...currentServices],
    )
    resetForm()
    showFeedback('Servicio guardado')
  }

  const updateServiceStatus = (serviceId, status) => {
    setServices((currentServices) =>
      currentServices.map((service) =>
        service.id === serviceId ? { ...service, status } : service,
      ),
    )
  }

  const deleteService = (serviceId) => {
    if (!window.confirm('Eliminar servicio?')) return

    setServices((currentServices) => currentServices.filter((service) => service.id !== serviceId))
    if (editingId === serviceId) resetForm()
  }

  return (
    <main className="dashboard-grid artist-grid services-master">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Agregar servicio" eyebrow="Formulario" />

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

            {feedback && <StatusPill tone={feedback === 'Servicio guardado' ? 'success' : 'warm'}>{feedback}</StatusPill>}
            <Button className="full-width" type="submit">{editingId ? 'Actualizar servicio' : 'Guardar servicio'}</Button>
          </form>
        </Card>

        <Card className="mobile-screen">
          <PanelHeader title="Servicios activos" eyebrow="Disponibles" />
          <div className="service-list">
            {services.filter((service) => service.status === 'Activo').map((service) => (
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
            {services.filter((service) => service.status === 'Suspendido').map((service) => (
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
