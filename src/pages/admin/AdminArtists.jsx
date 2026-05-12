import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { paths } from '../../routes/paths'
import { managedArtists } from '../../services/mockData'

function AdminArtists() {
  const navigate = useNavigate()

  return (
    <main className="dashboard-grid admin-grid">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Gestion de artistas" eyebrow="Admin" action={<Button size="sm">Nueva artista</Button>} />
          <div className="admin-search">
            <Input label="Buscar artista" type="search" placeholder="Nombre, ciudad o plan..." />
          </div>
          <div className="master-list">
            {managedArtists.map((artist) => (
              <article className="master-row" key={artist.name}>
                <div>
                  <strong>{artist.name}</strong>
                  <small>{artist.owner} / {artist.city} / {artist.plan}</small>
                </div>
                <StatusPill tone={artist.status === 'Activo' ? 'success' : 'neutral'}>{artist.status}</StatusPill>
                <div className="row-actions">
                  <button type="button">{artist.status === 'Activo' ? 'Inactivar' : 'Activar'}</button>
                  <button type="button" onClick={() => navigate(paths.artistAgenda)}>Ver dashboard</button>
                  <button type="button">Editar perfil</button>
                </div>
              </article>
            ))}
          </div>
        </Card>
    </main>
  )
}

export default AdminArtists
