import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { weeklySchedule } from '../../services/mockData'

function ArtistScheduleSettings() {
  return (
    <main className="dashboard-grid artist-grid schedule-master">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Dias laborales" eyebrow="Semana base" action={<Button size="sm">Guardar horarios</Button>} />
          <div className="schedule-list">
            {weeklySchedule.map((day) => (
              <article className="schedule-day" key={day.day}>
                <div className="schedule-day-header">
                  <div>
                    <strong>{day.day}</strong>
                    <small>{day.active ? `${day.start} a ${day.end}` : 'Dia libre'}</small>
                  </div>
                  <StatusPill tone={day.active ? 'success' : 'neutral'}>{day.active ? 'Activo' : 'Libre'}</StatusPill>
                </div>
                <div className="schedule-controls">
                  <label>
                    Inicio
                    <input type="time" defaultValue={day.active ? day.start : ''} disabled={!day.active} />
                  </label>
                  <label>
                    Fin
                    <input type="time" defaultValue={day.active ? day.end : ''} disabled={!day.active} />
                  </label>
                  <label>
                    Descanso inicio
                    <input type="time" defaultValue={day.active ? day.breakStart : ''} disabled={!day.active} />
                  </label>
                  <label>
                    Descanso fin
                    <input type="time" defaultValue={day.active ? day.breakEnd : ''} disabled={!day.active} />
                  </label>
                </div>
                <div className="row-actions">
                  <button type="button">{day.active ? 'Cancelar dia completo' : 'Activar dia'}</button>
                  <button type="button">Agregar bloque</button>
                </div>
              </article>
            ))}
          </div>
        </Card>

        <Card className="mobile-screen">
          <PanelHeader title="Reglas de agenda" eyebrow="Automatizacion" />
          <div className="form-stack compact-form">
            <Input label="Intervalo entre citas" type="number" placeholder="15" helper="Minutos entre servicios." />
            <Input label="Anticipacion minima mismo dia" type="number" placeholder="2" helper="Horas antes de permitir agenda." />
          </div>
        </Card>

        <Card className="mobile-screen">
          <PanelHeader title="Fechas bloqueadas" eyebrow="No disponible" />
          <div className="blocked-dates">
            <span>20 mayo / Capacitacion</span>
            <span>25 mayo / Dia libre</span>
            <span>02 junio / Evento privado</span>
          </div>
          <Button variant="ghost" className="full-width">Bloquear fecha</Button>
        </Card>
    </main>
  )
}

export default ArtistScheduleSettings
