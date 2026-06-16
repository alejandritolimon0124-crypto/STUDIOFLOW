import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { paths } from '../../routes/paths'
import { fetchArtistClients } from '../../services/artistClientService'

function ArtistClients() {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [search, setSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isActive = true

    setIsLoading(true)
    setError('')

    fetchArtistClients({ search, limit: 5 })
      .then((nextClients) => {
        if (!isActive) return
        setClients(nextClients)
        setSelectedClient((currentClient) => {
          if (!currentClient) return null
          return nextClients.find((client) => client.id === currentClient.id) || null
        })
      })
      .catch((requestError) => {
        if (!isActive) return
        setClients([])
        setError(requestError.message || 'No se pudieron cargar las clientas reales.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [search])

  const resultLabel = useMemo(() => {
    if (isLoading) return 'Cargando'
    if (clients.length === 0) return 'Sin resultados'
    return `${clients.length}/5`
  }, [clients.length, isLoading])

  return (
    <main className="dashboard-grid artist-grid">
      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Clientas" eyebrow="Citas reales" />
        <div className="form-stack compact-form">
          <Input
            label="Buscar clienta"
            placeholder="Nombre, apellido o celular"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="compact-list">
          {error && (
            <div className="list-row elevated-row">
              <div>
                <strong>No se pudo cargar</strong>
                <small>{error}</small>
              </div>
              <StatusPill tone="neutral">Clientas</StatusPill>
            </div>
          )}

          {!error && clients.length > 0 && clients.map((client) => (
            <div className="list-row elevated-row" key={client.id}>
              <div>
                <strong>{client.name}</strong>
                <small>{client.phone || 'Sin celular'} / {client.email || 'Sin email'}</small>
                <small>{client.totalVisits} visitas / ultima visita {client.lastVisit || 'sin fecha'}</small>
              </div>
              <div className="row-actions">
                <StatusPill tone="rose">{client.lastVisit || 'Real'}</StatusPill>
                <button type="button" onClick={() => setSelectedClient(client)}>Ver perfil</button>
              </div>
            </div>
          ))}

          {!error && clients.length === 0 && (
            <div className="list-row elevated-row">
              <div>
                <strong>{isLoading ? 'Cargando clientas...' : 'Sin clientas reales'}</strong>
                <small>
                  {isLoading
                    ? 'Consultando citas reales.'
                    : 'Apareceran aqui cuando existan citas asociadas a esta artista.'}
                </small>
              </div>
              <StatusPill tone="neutral">{resultLabel}</StatusPill>
            </div>
          )}
        </div>
      </Card>

      {selectedClient && (
        <Card className="mobile-screen">
          <PanelHeader
            title="Perfil clienta"
            eyebrow={selectedClient.name}
            action={(
              <Button
                size="sm"
                onClick={() => navigate(paths.artistAppointments, { state: { selectedClient } })}
              >
                Generar cita
              </Button>
            )}
          />
          <div className="compact-list">
            <div className="list-row elevated-row">
              <div>
                <strong>{selectedClient.phone || 'Sin celular'}</strong>
                <small>{selectedClient.email || 'Sin email'}</small>
                <small>Ultima visita: {selectedClient.lastVisit || 'sin fecha'}</small>
              </div>
              <StatusPill tone="success">{selectedClient.totalVisits} visitas</StatusPill>
            </div>
            {selectedClient.history.map((item) => (
              <div className="list-row elevated-row" key={item.id || `${item.service}-${item.date}-${item.time || ''}`}>
                <div>
                  <strong>{item.service}</strong>
                  <small>{item.date} {item.time || ''}</small>
                </div>
                <StatusPill tone="neutral">{item.status}</StatusPill>
              </div>
            ))}
          </div>
        </Card>
      )}
    </main>
  )
}

export default ArtistClients
