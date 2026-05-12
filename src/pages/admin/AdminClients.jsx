import { useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'

function AdminClients() {
  const {
    adminState,
    toggleManagedClientStatus,
    updateManagedClientProfile,
  } = useApp()
  const [query, setQuery] = useState('')
  const [profileClient, setProfileClient] = useState(null)
  const [historyClient, setHistoryClient] = useState(null)

  const filteredClients = useMemo(
    () =>
      adminState.clients.filter((client) => {
        const searchable = `${client.name} ${client.segment} ${client.status}`.toLowerCase()
        return searchable.includes(query.toLowerCase())
      }),
    [adminState.clients, query],
  )

  const saveClientProfile = () => {
    if (!profileClient) return

    updateManagedClientProfile(profileClient.id, profileClient)
    setProfileClient(null)
  }

  return (
    <main className="dashboard-grid admin-grid">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Gestion de clientes" eyebrow="Admin" action={<Button size="sm">Nueva clienta</Button>} />
          <div className="admin-search">
            <Input
              label="Buscar clienta"
              type="search"
              placeholder="Nombre, segmento o estado..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="master-list">
            {filteredClients.map((client) => (
              <article className="master-row" key={client.name}>
                <div>
                  <strong>{client.name}</strong>
                  <small>{client.segment} / {client.appointments} citas / {client.spend}</small>
                </div>
                <StatusPill tone={client.status === 'Activo' ? 'success' : 'neutral'}>{client.status}</StatusPill>
                <div className="row-actions">
                  <button type="button" onClick={() => toggleManagedClientStatus(client.id)}>
                    {client.status === 'Activo' ? 'Inactivar' : 'Activar'}
                  </button>
                  <button type="button" onClick={() => setHistoryClient(client)}>Ver historial</button>
                  <button type="button" onClick={() => setProfileClient(client)}>Ver perfil</button>
                </div>
              </article>
            ))}
          </div>
        </Card>

        {profileClient && (
          <Card className="mobile-screen">
            <PanelHeader title="Perfil cliente" eyebrow="Edicion mock" />
            <div className="form-stack compact-form">
              <Input
                label="Nombre"
                value={profileClient.name}
                onChange={(event) => setProfileClient({ ...profileClient, name: event.target.value })}
              />
              <Input
                label="Correo"
                value={profileClient.email}
                onChange={(event) => setProfileClient({ ...profileClient, email: event.target.value })}
              />
              <Input
                label="Telefono"
                value={profileClient.phone}
                onChange={(event) => setProfileClient({ ...profileClient, phone: event.target.value })}
              />
              <Input
                label="Segmento"
                value={profileClient.segment}
                onChange={(event) => setProfileClient({ ...profileClient, segment: event.target.value })}
              />
              <label className="input-field">
                <span>Notas</span>
                <textarea
                  value={profileClient.notes}
                  onChange={(event) => setProfileClient({ ...profileClient, notes: event.target.value })}
                  rows="3"
                />
              </label>
              <div className="row-actions">
                <button type="button" onClick={saveClientProfile}>Guardar cambios</button>
                <button type="button" onClick={() => setProfileClient(null)}>Cerrar</button>
              </div>
            </div>
          </Card>
        )}

        {historyClient && (
          <Card className="mobile-screen">
            <PanelHeader title="Historial cliente" eyebrow={historyClient.name} />
            <div className="compact-list">
              {historyClient.history.map((item) => (
                <div className="list-row elevated-row" key={item.id}>
                  <div>
                    <strong>{item.service}</strong>
                    <small>{item.artist} / {item.date}</small>
                  </div>
                  <StatusPill tone="success">{item.status}</StatusPill>
                </div>
              ))}
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => setHistoryClient(null)}>Cerrar historial</button>
            </div>
          </Card>
        )}
    </main>
  )
}

export default AdminClients
