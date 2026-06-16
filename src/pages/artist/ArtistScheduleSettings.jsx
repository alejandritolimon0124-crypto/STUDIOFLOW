import { useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'

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

  const saveBlockedDate = () => {
    if (!selectedDate) return

    addBlockedDate(selectedDate)
    setSelectedDate('')
    setShowDatePicker(false)
  }

  return (
    <main className="dashboard-grid artist-grid schedule-master">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader
            title="Dias laborales"
            eyebrow="Semana base"
            action={(
              <Button size="sm" disabled={isArtistScheduleLoading} onClick={saveArtistScheduleSettings}>
                {isArtistScheduleLoading ? 'Guardando...' : 'Guardar horarios'}
              </Button>
            )}
          />
          {(artistScheduleError || artistScheduleStatus) && (
            <div className="list-row elevated-row" style={{ marginBottom: '14px' }}>
              <div>
                <strong>{artistScheduleError ? 'No se pudieron guardar horarios' : 'Agenda sincronizada'}</strong>
                <small>{artistScheduleError || artistScheduleStatus}</small>
              </div>
              <StatusPill tone={artistScheduleError ? 'warning' : 'success'}>
                {artistScheduleError ? 'Error' : 'Supabase'}
              </StatusPill>
            </div>
          )}
          <div className="list-row elevated-row" style={{ marginBottom: '14px' }}>
            <div>
              <strong>Trabajando como:</strong>
              <div className="row-actions" style={{ flexWrap: 'wrap', marginTop: '8px' }}>
                {(artistWorkContexts.length ? artistWorkContexts : [artistWorkContext].filter(Boolean)).map((context) => (
                  <label key={context.id} style={{ alignItems: 'center', display: 'inline-flex', gap: '8px', fontWeight: 800 }}>
                    <input
                      checked={artistWorkContext?.id === context.id}
                      name="artist-schedule-work-context"
                      type="radio"
                      value={context.id}
                      onChange={() => selectArtistWorkContext(context.id)}
                    />
                    {context.label}
                  </label>
                ))}
              </div>
            </div>
            <StatusPill tone={artistWorkContext?.contextType === 'membership' ? 'success' : 'neutral'}>
              {artistWorkContext?.contextType === 'membership' ? 'Estudio' : 'Independiente'}
            </StatusPill>
          </div>
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

                    <div className="schedule-controls" style={{ marginTop: '12px' }}>
                      {day.blocks.map((block) => (
                        <div className="schedule-controls" key={block.id} style={{ gridColumn: '1 / -1' }}>
                          <label>
                            Bloque inicio
                            <input
                              type="time"
                              value={block.start}
                              disabled={!day.active}
                              onChange={(event) => updateScheduleBlock(day.day, block.id, 'start', event.target.value)}
                            />
                          </label>
                          <label>
                            Bloque fin
                            <input
                              type="time"
                              value={block.end}
                              disabled={!day.active}
                              onChange={(event) => updateScheduleBlock(day.day, block.id, 'end', event.target.value)}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
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
                  {day.active && <button type="button" onClick={() => addScheduleBlock(day.day)}>Agregar bloque</button>}
                </div>
              </article>
            ))}
          </div>
        </Card>

        <Card className="mobile-screen">
          <PanelHeader title="Reglas de agenda" eyebrow="Automatizacion" />
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

        <Card className="mobile-screen">
          <PanelHeader title="Fechas bloqueadas" eyebrow="No disponible" />
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
                Sin fechas bloqueadas
              </span>
            )}
          </div>
          {showDatePicker && (
            <div className="form-stack compact-form" style={{ marginBottom: '14px' }}>
              <label className="input-field">
                <span>Seleccionar fecha</span>
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
              <Button variant="ghost" className="full-width" onClick={saveBlockedDate}>Agregar fecha</Button>
            </div>
          )}
          <Button variant="ghost" className="full-width" onClick={() => setShowDatePicker((current) => !current)}>
            Bloquear fecha
          </Button>
        </Card>
    </main>
  )
}

export default ArtistScheduleSettings
