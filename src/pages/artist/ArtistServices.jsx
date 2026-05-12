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
  const [primary, setPrimary] = useState(primaryServices[0])
  const [secondary, setSecondary] = useState(serviceCatalog[primaryServices[0]][0])

  const handlePrimary = (service) => {
    setPrimary(service)
    setSecondary(serviceCatalog[service][0])
  }

  return (
    <main className="dashboard-grid artist-grid services-master">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Agregar servicio" eyebrow="Formulario" />

          <form className="service-builder">
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
              <select defaultValue="60 min">
                {durations.map((duration) => (
                  <option key={duration}>{duration}</option>
                ))}
              </select>
            </label>

            <Input label="Precio en pesos" type="number" placeholder="850" />

            <Button className="full-width" type="submit">Guardar servicio</Button>
          </form>
        </Card>

        <Card className="mobile-screen">
          <PanelHeader title="Servicios activos" eyebrow="Disponibles" />
          <div className="service-list">
            {artistServices.filter((service) => service.status === 'Activo').map((service) => (
              <div className="service-row management-row" key={service.name}>
                <div>
                  <strong>{service.name}</strong>
                  <small>{service.category} / {service.duration} / {service.bookings} reservas</small>
                </div>
                <div className="row-actions">
                  <span>{formatCurrency(service.price)}</span>
                  <button type="button">Editar</button>
                  <button type="button">Suspender</button>
                  <button type="button">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="mobile-screen">
          <PanelHeader title="Servicios suspendidos" eyebrow="Pausados" />
          <div className="service-list">
            {artistServices.filter((service) => service.status === 'Suspendido').map((service) => (
              <div className="service-row management-row" key={service.name}>
                <div>
                  <strong>{service.name}</strong>
                  <small>{service.category} / {service.duration}</small>
                </div>
                <div className="row-actions">
                  <StatusPill tone="warm">Suspendido</StatusPill>
                  <button type="button">Activar</button>
                  <button type="button">Editar</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
    </main>
  )
}

export default ArtistServices
