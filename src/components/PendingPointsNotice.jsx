import { Bell, CalendarCheck2 } from 'lucide-react'
import './pending-points-notice.css'

export default function PendingPointsNotice({ appointments, audience, onOpen }) {
  if (!appointments.length) return null
  const count = appointments.length
  const isClient = audience === 'client'

  return <aside className="pending-points-notice" role="status" aria-live="polite">
    <span className="pending-points-icon">{isClient ? <Bell size={22} /> : <CalendarCheck2 size={22} />}</span>
    <div>
      <strong>{isClient ? 'Tu cita terminó. Revisa tus puntos' : `${count} ${count === 1 ? 'clienta espera' : 'clientas esperan'} sus FlowPoints`}</strong>
      <p>{isClient
        ? count === 1 ? 'Aún aparece como agendada. Pide a la artista o estudio que la marque como completada para recibir tus puntos, si esa cita participa.' : `Tienes ${count} citas que ya terminaron y siguen agendadas. Pide que las marquen como completadas para recibir tus puntos, si participan.`
        : 'Estas citas ya terminaron y siguen agendadas. Márcalas como completadas o canceladas; al completar una cita participante, se acreditan sus puntos.'}</p>
      {onOpen && <button type="button" onClick={onOpen}>{isClient ? 'Ver mis citas' : 'Revisar citas'}</button>}
    </div>
  </aside>
}
