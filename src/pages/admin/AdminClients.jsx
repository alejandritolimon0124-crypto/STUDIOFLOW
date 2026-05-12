import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { managedClients } from '../../services/mockData'

function AdminClients() {
  return (
    <main className="dashboard-grid admin-grid">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Gestion de clientes" eyebrow="Admin" action={<Button size="sm">Nueva clienta</Button>} />
          <div className="admin-search">
            <Input label="Buscar clienta" type="search" placeholder="Nombre, segmento o estado..." />
          </div>
          <div className="master-list">
            {managedClients.map((client) => (
              <article className="master-row" key={client.name}>
                <div>
                  <strong>{client.name}</strong>
                  <small>{client.segment} / {client.appointments} citas / {client.spend}</small>
                </div>
                <StatusPill tone={client.status === 'Activo' ? 'success' : 'neutral'}>{client.status}</StatusPill>
                <div className="row-actions">
                  <button type="button">{client.status === 'Activo' ? 'Inactivar' : 'Activar'}</button>
                  <button type="button">Ver historial</button>
                  <button type="button">Ver perfil</button>
                </div>
              </article>
            ))}
          </div>
        </Card>
    </main>
  )
}

export default AdminClients
