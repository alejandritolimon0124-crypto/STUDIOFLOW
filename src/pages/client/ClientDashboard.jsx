import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { paths } from '../../routes/paths'
import { clientAppointments, clientHistory, favoriteArtists } from '../../services/mockData'

function ClientDashboard({ view = 'inicio' }) {
  const navigate = useNavigate()
  return (
    <main className={`dashboard-grid client-grid view-${view}`}>
        {view === 'inicio' && (
          <>
            <section className="hero-panel client-hero mobile-screen">
              <div>
                <span className="eyebrow">Clienta premium</span>
                <h2>Hola, Mariana</h2>
                <p>Tu proxima cita esta confirmada. Descubre artistas cerca de ti y guarda tus estudios favoritos.</p>
                <div className="hero-actions">
                  <Button onClick={() => navigate(paths.clientExplore)}>Reservar cita</Button>
                  <Button variant="ghost" onClick={() => navigate(paths.clientExplore)}>Explorar artistas</Button>
                </div>
              </div>
              <div className="hero-summary">
                <span>Glow plan</span>
                <strong>2</strong>
                <small>citas activas</small>
              </div>
            </section>

            <Card className="wide-card mobile-screen primary-panel">
              <PanelHeader title="Proximas citas" eyebrow="Confirmadas" />
              <div className="appointment-stack">
                {clientAppointments.slice(0, 1).map((appointment) => (
                  <article className="client-appointment" key={`${appointment.artist}-${appointment.time}`}>
                    <div className="date-block">
                      <strong>{appointment.date}</strong>
                      <span>{appointment.time}</span>
                    </div>
                    <div>
                      <h3>{appointment.service}</h3>
                      <p>{appointment.artist} / {appointment.address}</p>
                    </div>
                    <StatusPill tone="success">Lista</StatusPill>
                  </article>
                ))}
              </div>
            </Card>
          </>
        )}

        {view === 'citas' && (
          <Card className="wide-card mobile-screen primary-panel">
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
                    <p>{appointment.artist} / {appointment.address}</p>
                  </div>
                  <StatusPill tone="success">Lista</StatusPill>
                </article>
              ))}
            </div>
          </Card>
        )}

        {view === 'explorar' && (
          <Card className="mobile-screen primary-panel">
            <PanelHeader title="Busqueda de artistas" eyebrow="Explorar" />
            <div className="search-box">
              <Input label="Servicio" type="search" placeholder="Lashes, makeup, faciales..." />
              <Button size="sm">Buscar</Button>
            </div>
            <div className="artist-results">
              {favoriteArtists.map((artist) => (
                <div className="artist-result" key={artist.name}>
                  <div className="avatar small">{artist.name.slice(0, 2)}</div>
                  <div>
                    <strong>{artist.name}</strong>
                    <small>{artist.specialty} / {artist.nextSlot}</small>
                  </div>
                  <span>{artist.distance}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {view === 'favoritos' && (
          <>
            <Card className="mobile-screen primary-panel">
              <PanelHeader title="Favoritos" eyebrow="Guardados" />
              <div className="favorite-grid">
                {favoriteArtists.map((artist) => (
                  <article className="favorite-card" key={artist.name}>
                    <div className="favorite-topline">
                      <strong>{artist.name}</strong>
                      <StatusPill tone="rose">{artist.rating}</StatusPill>
                    </div>
                    <span>{artist.specialty}</span>
                    <small>Disponible {artist.nextSlot}</small>
                  </article>
                ))}
              </div>
            </Card>
            <Card className="mobile-screen">
              <PanelHeader title="Historial" eyebrow="Reciente" />
              <div className="compact-list">
                {clientHistory.map((item) => (
                  <div className="list-row elevated-row" key={`${item.service}-${item.date}`}>
                    <div>
                      <strong>{item.service}</strong>
                      <small>{item.artist} / {item.date}</small>
                    </div>
                    <span>{item.amount}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
    </main>
  )
}

export default ClientDashboard
