import { useState } from 'react'
import { Link } from 'react-router-dom'
import { sharePreviewUrl } from '../../utils/sharePreviewUrl'

const clientInviteUrl = sharePreviewUrl('https://studioflow.vip/para-clientas')
const professionalInviteUrl = sharePreviewUrl('https://studioflow.vip/profesionales?invitacion=clienta')
const services = ['Uñas', 'Maquillaje', 'Pestañas', 'Peinado', 'Faciales', 'Spa', 'Depilación', 'Masajes', 'Estética avanzada', 'Novias', 'XV años']

async function shareContent({ title, text, url }) {
  if (navigator.share) {
    await navigator.share({ title, text, url })
    return '¡Invitación compartida!'
  }
  await navigator.clipboard.writeText(`${text} ${url}`)
  return 'Enlace copiado. Ya puedes pegarlo donde quieras.'
}

export default function ClientWelcome() {
  const [notice, setNotice] = useState('')
  const handleShare = async (kind) => {
    try {
      const message = kind === 'professional'
        ? await shareContent({ title: 'Studio Flow para tu negocio', text: 'Quiero encontrarte y reservar contigo en Studio Flow. Únete sin cuota de suscripción ni comisiones hasta el 31 de diciembre de 2026. Primero crece, después invierte:', url: professionalInviteUrl })
        : await shareContent({ title: 'Descubre Studio Flow', text: 'Encontré una forma más fácil de descubrir servicios de belleza, reservar y obtener Flow Points. Únete conmigo a Studio Flow:', url: clientInviteUrl })
      setNotice(message)
    } catch (error) {
      if (error?.name !== 'AbortError') setNotice('No fue posible compartir. Intenta nuevamente.')
    }
  }

  return <main className="client-welcome">
    <section className="client-welcome-hero">
      <img className="client-welcome-photo" src="/studioflow-clientas-hero-v2.jpg" alt="Amigas disfrutando servicios de belleza" />
      <div className="client-welcome-shade" />
      <nav><img src="/studioflow-wordmark-960.png" alt="Studio Flow" /><Link to="/login">Ya tengo cuenta</Link></nav>
      <div className="client-welcome-copy">
        <span>LA BELLEZA SE DISFRUTA MÁS CUANDO SE COMPARTE</span>
        <h1>Studio Flow: belleza a tu manera.</h1>
        <p>Descubre artistas y estudios para uñas, maquillaje, pestañas, faciales, spa y estética avanzada. Explora servicios y horarios, reserva tu cita y gana beneficios.</p>
        <div><Link to="/register?tipo=client">Quiero unirme</Link><button type="button" onClick={() => handleShare('client')}>Compartir Studio Flow</button></div>
        {notice && <small role="status">{notice}</small>}
      </div>
    </section>

    <section className="client-service-ribbon" aria-label="Servicios disponibles">
      <div>{[...services, ...services].map((service, index) => <span key={`${service}-${index}`}>{service}</span>)}</div>
    </section>

    <section className="client-discovery-flow">
      <div className="client-flow-statement"><span>DESCUBRE</span><h2>Todo tu mundo beauty, en un solo lugar.</h2><p>Explora perfiles reales, fotografías, servicios, precios, ubicaciones y horarios disponibles antes de reservar.</p></div>
      <div className="client-flow-line"><strong>01</strong><p>Encuentra el servicio que quieres cerca de ti.</p></div>
      <div className="client-flow-line"><strong>02</strong><p>Conoce el trabajo de cada artista o estudio.</p></div>
      <div className="client-flow-line"><strong>03</strong><p>Reserva y lleva el control de todas tus citas.</p></div>
    </section>

    <section className="client-points-story">
      <div className="client-points-word" aria-hidden="true">FLOW POINTS</div>
      <div><span>CADA CITA PUEDE DARTE MÁS</span><h2>Obtén puntos.<br />Cámbialos por regalos y descuentos.</h2><p>Acumula Flow Points al completar servicios participantes, descubre promociones y vuelve a consentirte.</p><Link to="/register?tipo=client">Empezar a acumular</Link></div>
    </section>

    <section className="client-viral-invite">
      <div className="client-viral-marquee"><span>COMPARTE BELLEZA · COMPARTE OPORTUNIDADES · COMPARTE STUDIO FLOW · </span></div>
      <div className="client-viral-content">
        <span>¿TU ARTISTA TODAVÍA NO ESTÁ EN STUDIO FLOW?</span>
        <h2>Invítala tú.<br />Sin cuota ni comisiones hasta 2027.</h2>
        <p>Ayúdala a mostrar su talento, organizar sus citas y llegar a nuevas clientas. Cuando ella crece, tú también ganas una forma más fácil de reservar con quien ya confías.</p>
        <button type="button" onClick={() => handleShare('professional')}>Invitar a mi artista o estudio</button>
        <figure className="client-professional-qr">
          <img src="/studioflow-profesionales-qr.png" alt="Código QR de invitación para artistas y estudios" />
          <figcaption>Dile a tu artista o estudio que escanee este código para obtener el beneficio.</figcaption>
        </figure>
      </div>
    </section>

    <section className="client-final-call">
      <img src="/studioflow-wordmark-960.png" alt="Studio Flow" />
      <h2>Encuentra. Reserva. Disfruta. Comparte.</h2>
      <Link to="/register?tipo=client">Crear mi cuenta gratis</Link>
      <button type="button" onClick={() => handleShare('client')}>Compartir con mis amigas</button>
      <small>Powered by AXM Tech</small>
    </section>
  </main>
}
