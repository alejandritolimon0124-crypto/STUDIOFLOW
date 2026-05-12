import { useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { weeklySchedule } from '../../services/mockData'

const initialBlockedDates = [
  { id: '2026-05-20', label: '20 mayo / Capacitacion' },
  { id: '2026-05-25', label: '25 mayo / Dia libre' },
  { id: '2026-06-02', label: '02 junio / Evento privado' },
]

function formatBlockedDate(value) {
  if (!value) return ''

  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year} / Bloqueo manual`
}

function ArtistScheduleSettings() {
  const [schedule, setSchedule] = useState(() =>
    weeklySchedule.map((day) => ({
      ...day,
      blocks: day.active
        ? [{ id: `${day.day}-break`, start: day.breakStart, end: day.breakEnd }]
        : [],
    })),
  )
  const [blockedDates, setBlockedDates] = useState(initialBlockedDates)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')

  const toggleDay = (dayName) => {
    setSchedule((currentSchedule) =>
      currentSchedule.map((day) => {
        if (day.day !== dayName) return day

        const nextActive = !day.active

        return {
          ...day,
          active: nextActive,
          blocks: nextActive && day.blocks.length === 0
            ? [{ id: `${day.day}-block-${Date.now()}`, start: '14:00', end: '15:00' }]
            : day.blocks,
        }
      }),
    )
  }

  const cancelFullDay = (dayName) => {
    setSchedule((currentSchedule) =>
      currentSchedule.map((day) =>
        day.day === dayName
          ? { ...day, active: false, blocks: [] }
          : day,
      ),
    )
  }

  const addBlock = (dayName) => {
    setSchedule((currentSchedule) =>
      currentSchedule.map((day) =>
        day.day === dayName
          ? {
              ...day,
              blocks: [
                ...day.blocks,
                { id: `${day.day}-block-${Date.now()}`, start: '16:00', end: '16:30' },
              ],
            }
          : day,
      ),
    )
  }

  const addBlockedDate = () => {
    if (!selectedDate) return

    setBlockedDates((currentDates) => [
      ...currentDates,
      { id: selectedDate, label: formatBlockedDate(selectedDate) },
    ])
    setSelectedDate('')
    setShowDatePicker(false)
  }

  const removeBlockedDate = (dateId) => {
    setBlockedDates((currentDates) => currentDates.filter((date) => date.id !== dateId))
  }

  return (
    <main className="dashboard-grid artist-grid schedule-master">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Dias laborales" eyebrow="Semana base" action={<Button size="sm">Guardar horarios</Button>} />
          <div className="schedule-list">
            {schedule.map((day) => (
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
                        <input type="time" defaultValue={day.start} />
                      </label>
                      <label>
                        Fin
                        <input type="time" defaultValue={day.end} />
                      </label>
                    </div>

                    <div className="schedule-controls" style={{ marginTop: '12px' }}>
                      {day.blocks.map((block) => (
                        <div className="schedule-controls" key={block.id} style={{ gridColumn: '1 / -1' }}>
                          <label>
                            Bloque inicio
                            <input type="time" defaultValue={block.start} />
                          </label>
                          <label>
                            Bloque fin
                            <input type="time" defaultValue={block.end} />
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
                    <button type="button" onClick={() => cancelFullDay(day.day)}>Cancelar dia completo</button>
                  ) : (
                    <button type="button" onClick={() => toggleDay(day.day)}>Activar dia</button>
                  )}
                  {day.active && <button type="button" onClick={() => addBlock(day.day)}>Agregar bloque</button>}
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
            {blockedDates.map((date) => (
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
            ))}
          </div>
          {showDatePicker && (
            <div className="form-stack compact-form" style={{ marginBottom: '14px' }}>
              <label className="input-field">
                <span>Seleccionar fecha</span>
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
              <Button variant="ghost" className="full-width" onClick={addBlockedDate}>Agregar fecha</Button>
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
