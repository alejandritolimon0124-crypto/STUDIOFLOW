import { Link } from 'react-router-dom'

const ribbonItems = ['Agenda 24/7', 'Confirmaciones en un toque', 'Más clientas', 'Flow Points', 'Control de ingresos', 'Tu link para reservar', 'Notificaciones en tiempo real']

export default function ProfessionalWelcome() {
  return <main className="pro-invite">
    <section className="pro-invite-hero">
      <img className="pro-invite-photo" src="/studioflow-profesionales-hero-v2.jpg" alt="Dueña de estudio de belleza haciendo crecer su negocio" />
      <div className="pro-invite-shade" />
      <nav><img src="/studioflow-wordmark-960.png" alt="Studio Flow" /><Link to="/login">Iniciar sesión</Link></nav>
      <div className="pro-invite-copy">
        <span className="pro-invite-offer">SIN CUOTA NI COMISIONES HASTA 2027</span>
        <p className="pro-invite-kicker">STUDIO FLOW ESTÁ DE TU LADO</p>
        <h1>Primero crece. Después invierte.</h1>
        <p>No hagas que este año sea igual al anterior. Organiza tus citas, muestra tu talento y llega a más clientas. Únete sin cuota de suscripción ni comisiones hasta el 31 de diciembre de 2026.</p>
        <div><Link to="/register?tipo=artist">Quiero estar en Studio Flow</Link><a href="#beneficios">Descubrir beneficios</a></div>
      </div>
    </section>

    <section className="pro-invite-ribbon" aria-label="Beneficios de Studio Flow"><div>{[...ribbonItems,...ribbonItems].map((item,index) => <span key={`${item}-${index}`}>{item}</span>)}</div></section>

    <section className="pro-booking-impact" id="beneficios">
      <div className="pro-impact-intro"><span>MENOS MENSAJES. MÁS CONTROL.</span><h2>Confirma tus citas con un solo toque.</h2><p>No pierdas tiempo buscando conversaciones ni preguntando quién asistirá. Envía confirmaciones, recibe respuestas y mantén tu agenda organizada.</p></div>
      <div className="pro-impact-pop pro-pop-one"><strong>CONFIRMADA</strong><span>Tu clienta respondió</span></div>
      <div className="pro-impact-pop pro-pop-two"><strong>NUEVA CITA</strong><span>Notificación en tiempo real</span></div>
      <div className="pro-impact-pop pro-pop-three"><strong>HOY</strong><span>Todo listo para atender</span></div>
    </section>

    <section className="pro-business-flow">
      <div><span>01</span><h3>Controla tus ingresos</h3><p>Conoce tus servicios realizados, descuentos, pagos y movimientos del mes.</p></div>
      <div><span>02</span><h3>Crea clientas leales</h3><p>Otorga puntos, regalos, descuentos y promociones en cada visita.</p></div>
      <div><span>03</span><h3>Hazte más visible</h3><p>Comparte tu perfil, tus fotografías, servicios y precios de forma profesional.</p></div>
    </section>

    <section className="pro-find-you">
      <div className="pro-find-you-backdrop">24/7</div>
      <div><span>QUE TE ENCUENTREN MÁS RÁPIDO</span><h2>Coloca tu link para agendar en tus redes sociales.</h2><p>Tus clientas nuevas pueden conocerte y reservar incluso cuando estás trabajando, descansando o lejos del teléfono. Tú recibes la notificación de la nueva cita en tiempo real.</p><Link to="/register?tipo=artist">Crear mi perfil profesional</Link></div>
    </section>

    <section className="pro-loyalty">
      <div className="pro-loyalty-marquee"><span>PUNTOS · REGALOS · DESCUENTOS · HAPPY HOUR · CUMPLEAÑOS · REACTIVACIÓN · </span></div>
      <div className="pro-loyalty-copy"><p>NO SOLO AGENDES CITAS</p><h2>Crea razones para que tus clientas vuelvan.</h2><strong>Haz crecer tu negocio con experiencias que generan lealtad.</strong></div>
    </section>

    <section className="pro-transform">
      <span>ORGANIZA · ATRAE · CONVIERTE · CRECE</span>
      <h2>Haz que tu negocio se vea tan profesional como tu trabajo.</h2>
      <p>Studio Flow reúne las herramientas para organizarte, destacar tu talento y convertir cada visita en una nueva oportunidad.</p>
      <div className="pro-transform-pulse">TU NEGOCIO, EN MOVIMIENTO</div>
    </section>

    <section className="pro-invite-final">
      <div><span>STUDIO FLOW ESTÁ DE TU LADO</span><h2>Primero crece. Después invierte.</h2><p>Para artistas y estudios de belleza y estética avanzada: sin cuota de suscripción ni comisiones hasta el 31 de diciembre de 2026. Los cobros comenzarán en 2027. Escanea el código o crea tu cuenta ahora.</p><Link to="/register?tipo=artist">Comenzar ahora</Link></div>
      <figure><img src="/studioflow-profesionales-qr.png" alt="Código QR para unirse a Studio Flow" /><figcaption>Escanea para obtener el beneficio</figcaption></figure>
    </section>
    <footer className="pro-invite-footer"><img src="/studioflow-wordmark-960.png" alt="Studio Flow" /><p>Tu talento merece una plataforma que también trabaje para ti.</p><p className="public-invite-help">¡No te preocupes! Te ayudamos a configurar tu perfil de manera personalizada. <a href="https://wa.me/528441892008" target="_blank" rel="noopener noreferrer">844 189 2008</a></p><strong>Powered by AXM Tech</strong></footer>
  </main>
}
