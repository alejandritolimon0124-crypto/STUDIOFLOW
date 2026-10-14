import { Link } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Coins, Gift } from 'lucide-react'
import { useApp } from '../contexts/appContextCore'
import { paths } from '../routes/paths'
import './flow-points-guide.css'

export default function FlowPointsGuide() {
  const { session } = useApp()
  const isClient = session.role === 'client'
  const back = isClient ? paths.client : session.role === 'artist' ? paths.artistMarketing : paths.adminStudio

  return <main className="flow-guide-page">
    <div className="flow-guide-shell">
      <Link className="flow-guide-back" to={back}><ArrowLeft size={18} /> Volver</Link>
      <header className="flow-guide-header"><span>FLOWPOINTS</span><h1>Tus citas te dan puntos</h1><p>Después puedes usarlos para llevarte un artículo del local.</p></header>
      <section className="flow-guide-steps" aria-label="Así funcionan los puntos">
        <article><span className="flow-guide-step-icon"><CalendarDays size={25} /></span><div><small>PASO 1</small><h2>Ve a tu cita</h2><p>Cuando termine, recibirás puntos si ese negocio participa.</p></div></article>
        <article className="flow-guide-featured-step"><span className="flow-guide-step-icon"><Coins size={25} /></span><div><small>PASO 2 · TUS PUNTOS SON TUYOS</small><h2>Haz que tu visita cuente</h2><p>Con artistas y estudios de Studio Flow, tus citas pueden acercarte a regalos, promociones y sorpresas. Al salir, marca en tu perfil que asististe y pide que también completen tu cita. Así tus puntos no se quedan esperando.</p></div></article>
        <article><span className="flow-guide-step-icon"><Gift size={25} /></span><div><small>PASO 3</small><h2>Elige algo que te guste</h2><p>Pregunta cuántos puntos y cuánto dinero pide el negocio por ese artículo. Canjea los puntos en la app y paga el dinero en el local.</p></div></article>
      </section>
      <section className="flow-guide-example" aria-label="Ejemplo de canje">
        <span>UN EJEMPLO</span><h2>Un artículo de la vitrina</h2>
        <div className="flow-guide-equation"><strong>100 puntos</strong><b>+</b><strong>$200 en el local</strong></div>
        <p>Al reunir 1,000 FP con ese negocio, puedes usar 100 FP en este artículo y conservar el resto. Si tu saldo baja de 1,000 FP, vuelve a reunirlos para hacer otro canje.</p>
      </section>
      <p className="flow-guide-smallprint">Cada canje o descuento se habilita al tener al menos 1,000 FP con ese negocio. Puedes usar desde 100 FP, en múltiplos de 100. Los puntos duran 180 días; si el estudio está suspendido, su canje queda en pausa.</p>
      <Link className="flow-guide-action" to={isClient ? paths.clientFlowPoints : back}>{isClient ? 'Ver mis puntos' : 'Volver a mi negocio'}</Link>
    </div>
  </main>
}
