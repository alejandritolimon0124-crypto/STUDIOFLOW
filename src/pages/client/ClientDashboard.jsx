import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import DashboardLayout from '../../layouts/DashboardLayout'
import { clientAppointments, favoriteArtists } from '../../services/mockData'

function ClientDashboard({ currentPath = '/client' }) {
  return (
    <DashboardLayout
      currentPath={currentPath}
      role="client"
      title="Mi belleza"
      subtitle="Tus proximas citas, historial, artistas favoritas y busqueda."
    >
      <main className="dashboard-grid client-grid">
        <section className="hero-panel client-hero">
          <div>
            <span className="eyebrow">Clienta premium</span>
            <h2>Hola, Mariana</h2>
            <p>Tu proxima cita esta confirmada. Encuentra nuevas artistas y guarda tus estudios favoritos.</p>
          </div>
          <Button>Reservar cita</Button>
        </section>

        <Card className="wide-card">
          <PanelHeader title="Proximas citas" eyebrow="Confirmadas" />
          <div className="appointment-stack">
            {clientAppointments.map((appointment) => (
              <article className="client-appointment" key={`${appointment.artist}-${appointment.time}`}>
                <div className="date-block">
                  <strong>{appointment.date}</strong>
                  <span>{appointment.time}</span>
                </div>
                <div>
                  <h3>{appointment.service}</h3>
                  <p>{appointment.artist}</p>
                </div>
                <StatusPill tone="success">Lista</StatusPill>
              </article>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Busqueda de artistas" eyebrow="Explorar" />
          <div className="search-box">
            <input type="search" placeholder="Lashes, makeup, faciales..." />
            <Button size="sm">Buscar</Button>
          </div>
          <div className="artist-results">
            {favoriteArtists.map((artist) => (
              <div className="artist-result" key={artist.name}>
                <div className="avatar small">{artist.name.slice(0, 2)}</div>
                <div>
                  <strong>{artist.name}</strong>
                  <small>{artist.specialty}</small>
                </div>
                <span>{artist.distance}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Favoritos" eyebrow="Guardados" />
          <div className="favorite-grid">
            {favoriteArtists.slice(0, 2).map((artist) => (
              <article className="favorite-card" key={artist.name}>
                <strong>{artist.name}</strong>
                <span>{artist.specialty}</span>
                <small>{artist.rating} rating</small>
              </article>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Historial" eyebrow="Reciente" />
          <EmptyState
            title="Historial preparado"
            description="Aqui se mostraran servicios completados cuando conectes datos reales."
          />
        </Card>
      </main>
    </DashboardLayout>
  )
}

export default ClientDashboard
