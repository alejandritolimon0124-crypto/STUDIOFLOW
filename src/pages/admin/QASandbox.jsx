import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import {
  deriveMembershipsFromLegacyData,
  getStudioForArtist,
} from '../../modules/entities/entitySelectors'

function timeToMinutes(time) {
  if (!time || !time.includes(':')) return null

  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0')
  const minutes = (totalMinutes % 60).toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

function getScheduleIndex(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const dayIndex = date.getDay()
  return dayIndex === 0 ? 6 : dayIndex - 1
}

function overlapsBlock(start, end, blocks) {
  return blocks.some((block) => {
    const blockStart = timeToMinutes(block.start)
    const blockEnd = timeToMinutes(block.end)

    if (blockStart === null || blockEnd === null) return false

    return start < blockEnd && end > blockStart
  })
}

function buildDebugSlots(agendaSettings, date, artistId) {
  const day = agendaSettings.schedule[getScheduleIndex(date)]

  if (!day || !day.active) {
    return [{ time: 'Todo el dia', status: 'Bloqueado', reason: 'Dia inactivo' }]
  }

  if (agendaSettings.blockedDates.some((blockedDate) => blockedDate.id === date)) {
    return [{ time: 'Todo el dia', status: 'Bloqueado', reason: 'Fecha bloqueada' }]
  }

  const start = timeToMinutes(day.start)
  const end = timeToMinutes(day.end)
  const interval = Number(agendaSettings.intervalMinutes) || 15
  const duration = 70
  const slots = []

  if (start === null || end === null) return slots

  for (let current = start; current + duration <= end; current += interval) {
    const time = minutesToTime(current)
    const slotEnd = current + duration
    const booked = agendaSettings.bookedSlots.some((slot) => (
      slot.artistId === artistId
      && slot.date === date
      && slot.time === time
    ))
    const blocked = overlapsBlock(current, slotEnd, day.blocks)

    slots.push({
      time,
      end: minutesToTime(slotEnd),
      status: booked ? 'Ocupado' : blocked ? 'Bloqueado' : 'Disponible',
      reason: booked ? 'Reserva mock' : blocked ? 'Descanso/bloque' : 'Reservable',
    })
  }

  return slots
}

function QASandbox() {
  const navigate = useNavigate()
  const {
    session,
    login,
    agendaSettings,
    adminState,
    getAvailableSlots,
    resetBookedSlots,
    clearBlockedDates,
    releaseAgenda,
    blockTuesdays,
    setPrimaryArtistStatus,
    addMockBooking,
  } = useApp()
  const [debugDate, setDebugDate] = useState('2026-05-18')

  const artistStudioMemberships = useMemo(
    () => deriveMembershipsFromLegacyData({ artists: adminState.artists }),
    [adminState.artists],
  )
  const primaryArtist = adminState.artists.find((artist) => artist.status === 'Activo') || adminState.artists[0]
  const primaryStudio = getStudioForArtist({
    artistId: primaryArtist?.id,
    studios: adminState.studios,
    artistStudioMemberships,
  })
  const availableSlots = getAvailableSlots({
    artistId: primaryArtist?.id,
    studioId: primaryStudio?.id || null,
    date: debugDate,
    durationMinutes: 70,
  })
  const debugSlots = useMemo(
    () => buildDebugSlots(agendaSettings, debugDate, primaryArtist?.id),
    [agendaSettings, debugDate, primaryArtist?.id],
  )

  const quickNavigate = async (role, path) => {
    await login(role)
    navigate(path)
  }

  return (
    <main className="dashboard-grid admin-grid">
      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="QA Sandbox" eyebrow="Demo interno" />
        <div className="compact-list">
          <div className="list-row elevated-row">
            <div>
              <strong>{primaryArtist?.name || 'Artista demo'}</strong>
              <small>Estado marketplace / Reservas cliente</small>
            </div>
            <StatusPill tone={primaryArtist?.status === 'Activo' ? 'success' : 'neutral'}>
              {primaryArtist?.status || 'Sin estado'}
            </StatusPill>
          </div>
          <div className="list-row elevated-row">
            <div>
              <strong>Cliente seleccionado</strong>
              <small>{session.user?.name || 'Sin sesion activa'} / {session.role || 'sin rol'}</small>
            </div>
            <StatusPill tone="rose">Mock</StatusPill>
          </div>
        </div>
      </Card>

      <Card className="mobile-screen">
        <PanelHeader title="Acciones rapidas QA" eyebrow="Estado mock" />
        <div className="row-actions">
          <button type="button" onClick={resetBookedSlots}>Resetear reservas</button>
          <button type="button" onClick={releaseAgenda}>Liberar agenda</button>
          <button type="button" onClick={blockTuesdays}>Bloquear todos los martes</button>
          <button type="button" onClick={() => setPrimaryArtistStatus('Inactivo', primaryArtist?.id)}>Simular artista inactivo</button>
          <button type="button" onClick={() => setPrimaryArtistStatus('Activo', primaryArtist?.id)}>Activar artista</button>
          <button type="button" onClick={addMockBooking}>Agregar reserva mock</button>
          <button type="button" onClick={clearBlockedDates}>Limpiar fechas bloqueadas</button>
        </div>
      </Card>

      <Card className="mobile-screen">
        <PanelHeader title="Navegacion QA" eyebrow="Validacion rapida" />
        <div className="row-actions">
          <button type="button" onClick={() => quickNavigate('admin', paths.admin)}>Admin</button>
          <button type="button" onClick={() => quickNavigate('artist', paths.artist)}>Artista</button>
          <button type="button" onClick={() => quickNavigate('client', paths.client)}>Cliente</button>
        </div>
      </Card>

      <Card className="mobile-screen">
        <PanelHeader title="Agenda observable" eyebrow="Disponibilidad" />
        <div className="compact-list">
          {agendaSettings.schedule.map((day) => (
            <div className="list-row elevated-row" key={day.day}>
              <div>
                <strong>{day.day}</strong>
                <small>{day.active ? `${day.start} - ${day.end}` : 'Dia inactivo'}</small>
              </div>
              <StatusPill tone={day.active ? 'success' : 'neutral'}>
                {day.active ? 'Activo' : 'Bloqueado'}
              </StatusPill>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mobile-screen">
        <PanelHeader title="Bloqueos y descansos" eyebrow="Agenda artista" />
        <div className="compact-list">
          {agendaSettings.blockedDates.length > 0 ? (
            agendaSettings.blockedDates.map((date) => (
              <div className="list-row elevated-row" key={date.id}>
                <div>
                  <strong>{date.id}</strong>
                  <small>{date.label}</small>
                </div>
                <StatusPill tone="neutral">Fecha</StatusPill>
              </div>
            ))
          ) : (
            <div className="list-row elevated-row">
              <div>
                <strong>Sin fechas bloqueadas</strong>
                <small>Agenda abierta para pruebas.</small>
              </div>
              <StatusPill tone="success">Libre</StatusPill>
            </div>
          )}
          {agendaSettings.schedule.flatMap((day) =>
            day.blocks.map((block) => (
              <div className="list-row elevated-row" key={block.id}>
                <div>
                  <strong>{day.day}</strong>
                  <small>{block.start} - {block.end}</small>
                </div>
                <StatusPill tone="warm">Descanso</StatusPill>
              </div>
            )),
          )}
        </div>
      </Card>

      <Card className="mobile-screen">
        <PanelHeader title="Visual debug slots" eyebrow={debugDate} />
        <div className="form-stack compact-form">
          <Input
            label="Fecha de prueba"
            type="date"
            value={debugDate}
            onChange={(event) => setDebugDate(event.target.value)}
          />
        </div>
        <div className="compact-list">
          <div className="list-row elevated-row">
            <div>
              <strong>{availableSlots.length} slots cliente visibles</strong>
              <small>Resultado real de disponibilidad para booking.</small>
            </div>
            <StatusPill tone="rose">Cliente</StatusPill>
          </div>
          {debugSlots.map((slot) => (
            <div className="list-row elevated-row" key={`${slot.time}-${slot.status}`}>
              <div>
                <strong>{slot.time}{slot.end ? ` - ${slot.end}` : ''}</strong>
                <small>{slot.reason}</small>
              </div>
              <StatusPill
                tone={slot.status === 'Disponible' ? 'success' : slot.status === 'Ocupado' ? 'rose' : 'neutral'}
              >
                {slot.status}
              </StatusPill>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mobile-screen">
        <PanelHeader title="Reservas activas" eyebrow="Mock local" />
        <div className="compact-list">
          {agendaSettings.bookedSlots.length > 0 ? (
            agendaSettings.bookedSlots.map((slot) => (
              <div className="list-row elevated-row" key={`${slot.date}-${slot.time}`}>
                <div>
                  <strong>{slot.date} / {slot.time}</strong>
                  <small>{slot.service || 'Servicio mock'} / {slot.artist || 'Artista mock'}</small>
                </div>
                <StatusPill tone="rose">Ocupado</StatusPill>
              </div>
            ))
          ) : (
            <div className="list-row elevated-row">
              <div>
                <strong>Sin reservas activas</strong>
                <small>Usa Agregar reserva mock para validar bloqueo de slots.</small>
              </div>
              <StatusPill tone="neutral">Vacio</StatusPill>
            </div>
          )}
        </div>
      </Card>
    </main>
  )
}

export default QASandbox
