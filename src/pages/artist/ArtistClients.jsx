import { useState } from 'react'
import Card from '../../components/Card'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'

function ArtistClients() {
  const { artistState } = useApp()
  const [selectedClient, setSelectedClient] = useState(null)

  return (
    <main className="dashboard-grid artist-grid">
      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Clientas" eyebrow="Seguimiento" />
        <div className="compact-list">
          {artistState.clients.map((client) => (
            <div className="list-row elevated-row" key={client.id}>
              <div>
                <strong>{client.name}</strong>
                <small>{client.phone} / {client.email}</small>
                <small>{client.visits} visitas / {client.value}</small>
              </div>
              <div className="row-actions">
                <StatusPill tone="rose">{client.next}</StatusPill>
                <button type="button" onClick={() => setSelectedClient(client)}>Ver perfil</button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {selectedClient && (
        <Card className="mobile-screen">
          <PanelHeader title="Perfil cliente" eyebrow={selectedClient.name} />
          <div className="compact-list">
            <div className="list-row elevated-row">
              <div>
                <strong>{selectedClient.phone}</strong>
                <small>{selectedClient.email}</small>
              </div>
              <StatusPill tone="success">{selectedClient.visits} visitas</StatusPill>
            </div>
            {selectedClient.history.map((item) => (
              <div className="list-row elevated-row" key={`${item.service}-${item.date}`}>
                <div>
                  <strong>{item.service}</strong>
                  <small>{item.date}</small>
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
