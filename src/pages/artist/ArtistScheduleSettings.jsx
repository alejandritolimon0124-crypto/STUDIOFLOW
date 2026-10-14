import { useEffect, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import WorkspaceCardSelector from '../../components/WorkspaceCardSelector'
import { useApp } from '../../contexts/appContextCore'
import { fetchStudioHours } from '../../services/studioHoursService'
import '../../styles/studio-owner-booking.css'

function ArtistScheduleSettings() {
  const {
    agendaSettings,
    toggleScheduleDay,
    cancelScheduleDay,
    updateScheduleDayTime,
    addScheduleBlock,
    updateScheduleBlock,
    addBlockedDate,
    artistWorkContext,
    artistWorkContexts,
    removeBlockedDate,
    selectArtistWorkContext,
    updateAgendaRule,
    saveArtistScheduleSettings,
    isArtistScheduleLoading,
    artistScheduleError,
    artistScheduleStatus,
  } = useApp()
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [studioHours, setStudioHours] = useState([])

  useEffect(() => {
    if (artistWorkContext?.contextType !== 'membership' || !artistWorkContext.studioId) return undefined
    let active = true
    fetchStudioHours(artistWorkContext.studioId)
      .then((hours) => { if (active) setStudioHours(hours) })
      .catch(() => { if (active) setStudioHours([]) })
    return () => { active = false }
  }, [artistWorkContext?.contextType, artistWorkContext?.studioId])

  const saveBlockedDate = async () => {
    if (!selectedDate) return

    await addBlockedDate(selectedDate)
    setSelectedDate('')
    setShowDatePicker(false)
  }

  return (
    <main className="dashboard-grid artist-grid schedule-master">
        <Card className="wide-card mobile-screen primary-panel artist-schedule-experience">
          <div className="artist-schedule-intro">
            <div>
              <span>TU TIEMPO, A TU MANERA</span>
              <h1>Organiza tu semana</h1>
              <p>Define cuándo recibes clientas. Los descansos son opcionales.</p>
            </div>
            <div>
              <Button size="sm" disabled={isArtistScheduleLoading} onClick={saveArtistScheduleSettings}>
                {isArtistScheduleLoading ? 'Guardando...' : 'Guardar horarios'}
              </Button>
            </div>
          </div>
          {(artistScheduleError || artistScheduleStatus) && (
            <div className="list-row elevated-row" style={{ marginBottom: '14px' }}>
              <div>
                <strong>{artistScheduleError ? 'No se pudieron guardar horarios' : artistScheduleStatus}</strong>
                {artistScheduleError && <small>{artistScheduleError}</small>}
              </div>
              {artistScheduleError && <StatusPill tone="warning">Error</StatusPill>}
            </div>
          )}
          <div className="list-row elevated-row" style={{ marginBottom: '14px' }}>
            <div>
              <strong>Trabajando como:</strong>
              <WorkspaceCardSelector
                activeContext={artistWorkContext}
                contexts={artistWorkContexts}
                name="artist-schedule-work-context"
                onSelect={selectArtistWorkContext}
              />
            </div>
            <StatusPill tone={artistWorkContext?.contextType === 'membership' ? 'success' : 'neutral'}>
              {artistWorkContext?.contextType === 'membership' ? 'Estudio' : 'Independiente'}
            </StatusPill>
          </div>
          {artistWorkContext?.contextType === 'membership' && studioHours.length > 0 && <div className="artist-studio-hours-note"><strong>Horario del estudio</strong><p>Tus citas solo podrán reservarse dentro de estas horas, sin incluir los descansos del local.</p><div>{studioHours.map((day) => <span key={day.weekday}>{['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][day.weekday]}: {day.open ? `${day.start}–${day.end}${day.breaks.length ? ` · ${day.breaks.length} descanso${day.breaks.length > 1 ? 's' : ''}` : ''}` : 'Cerrado'}</span>)}</div></div>}
          <div className="schedule-list">
            {agendaSettings.schedule.map((day) => (
              <article
                className="schedule-day"
                key={day.day}
                style={{ opacity: day.active ? 1 : 0.62 }}
              >
                <div className="schedule-day-header">
                  <div>
                    <strong>{day.day}</strong>
                    <small>{day.active ? `${day.start} a ${day.end}` : 'Dia no disponible'}</small>
                  </div>
                  <StatusPill tone={day.active ? 'success' : 'neutral'}>{day.active ? 'Activo' : 'Libre'}</StatusPill>
                </div>

                {day.active ? (
                  <>
                    <div className="schedule-controls">
                      <label>
                        Inicio
                        <input
                          type="time"
                          value={day.start}
                          disabled={!day.active}
                          onChange={(event) => updateScheduleDayTime(day.day, 'start', event.target.value)}
                        />
                      </label>
                      <label>
                        Fin
                        <input
                          type="time"
                          value={day.end}
                          disabled={!day.active}
                          onChange={(event) => updateScheduleDayTime(day.day, 'end', event.target.value)}
                        />
                      </label>
                    </div>

                    {day.blocks.length > 0 && (
                    <div className="schedule-breaks">
                      <p>Descansos opcionales</p>
                      <small>Úsalos para comida o para cerrar temporalmente dentro de tu jornada.</small>
                      {day.blocks.map((block) => (
                        <div className="schedule-break-row" key={block.id}>
                          <label>
                            Inicio del descanso
                            <input
                              type="time"
                              value={block.start}
                              disabled={!day.active}
                              onChange={(event) => updateScheduleBlock(day.day, block.id, 'start', event.target.value)}
                            />
                          </label>
                          <label>
                            Regreso al trabajo
                            <input
                              type="time"
                              value={block.end}
                              disabled={!day.active}
                              onChange={(event) => updateScheduleBlock(day.day, block.id, 'end', event.target.value)}
                            />
                          </label>
                          <button
                            className="schedule-break-remove"
                            type="button"
                            onClick={() => {
                              updateScheduleBlock(day.day, block.id, 'start', '')
                              updateScheduleBlock(day.day, block.id, 'end', '')
                            }}
                          >
                            Quitar descanso
                          </button>
                        </div>
                      ))}
                    </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: 'var(--muted)', fontWeight: 800, padding: '8px 0' }}>
                    Dia no disponible
                  </div>
                )}

                <div className="row-actions">
                  {day.active ? (
                    <button type="button" onClick={() => cancelScheduleDay(day.day)}>Cancelar dia completo</button>
                  ) : (
                    <button type="button" onClick={() => toggleScheduleDay(day.day)}>Activar dia</button>
                  )}
                  {day.active && <button type="button" onClick={() => addScheduleBlock(day.day)}>Agregar descanso</button>}
                </div>
              </article>
            ))}
          </div>
        </Card>

        <Card className="mobile-screen artist-schedule-side-card">
          <PanelHeader title="Ritmo de tus citas" eyebrow="Configuración" />
          <div className="form-stack compact-form">
            <Input
              label="Intervalo entre citas"
              type="number"
              value={agendaSettings.intervalMinutes}
              helper="Minutos entre servicios."
              onChange={(event) => updateAgendaRule('intervalMinutes', event.target.value)}
            />
            <Input
              label="Anticipacion minima mismo dia"
              type="number"
              value={agendaSettings.minAdvanceHours}
              helper="Horas antes de permitir agenda."
              onChange={(event) => updateAgendaRule('minAdvanceHours', event.target.value)}
            />
          </div>
        </Card>

        <Card className="mobile-screen artist-schedule-side-card">
          <PanelHeader title="Días que reservas para ti" eyebrow="Fechas no disponibles" />
          <div className="blocked-dates">
            {agendaSettings.blockedDates.length > 0 ? (
              agendaSettings.blockedDates.map((date) => (
                <span
                  key={date.id}
                  style={{ alignItems: 'center', display: 'flex', gap: '10px', justifyContent: 'space-between' }}
                >
                  {date.label}
                  <button
                    type="button"
                    disabled={isArtistScheduleLoading}
                    onClick={() => removeBlockedDate(date.id)}
                    style={{
                      background: '#fff',
                      border: '1px solid var(--line)',
                      borderRadius: '999px',
                      color: 'var(--muted)',
                      fontWeight: 900,
                      minHeight: '28px',
                      minWidth: '28px',
                    }}
                  >
                    x
                  </button>
                </span>
              ))
            ) : (
              <span style={{ color: 'var(--muted)', fontWeight: 800 }}>
                No hay fechas bloqueadas.
              </span>
            )}
          </div>
          {showDatePicker && (
            <div className="form-stack compact-form" style={{ marginBottom: '14px' }}>
              <label className="input-field">
                <span>Seleccionar fecha</span>
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
                <Button variant="ghost" className="full-width" disabled={isArtistScheduleLoading} onClick={saveBlockedDate}>
                  {isArtistScheduleLoading ? 'Guardando...' : 'Agregar fecha'}
                </Button>
            </div>
          )}
          <Button variant="ghost" className="full-width" disabled={isArtistScheduleLoading} onClick={() => setShowDatePicker((current) => !current)}>
            Bloquear fecha
          </Button>
        </Card>
    </main>
  )
}

export default ArtistScheduleSettings
