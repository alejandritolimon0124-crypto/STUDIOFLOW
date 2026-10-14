import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Gift, MessageCircle, Sparkles, Star } from 'lucide-react'
import './studioFlowLanding.css'

const services = [
  { name: 'Uñas', detail: 'Manicura, acrílico y nail art', image: '/service-nails.jpg' },
  { name: 'Pestañas', detail: 'Extensiones y lifting', image: '/service-lashes.jpg' },
  { name: 'Maquillaje', detail: 'Social, novias y eventos', image: '/service-makeup.jpg' },
  { name: 'Faciales', detail: 'Cuidado para tu piel', image: '/service-facial.jpg' },
  { name: 'Spa', detail: 'Tu pausa para renovarte', image: '/service-spa.jpg' },
  { name: 'Peinados', detail: 'Estilo para cada ocasión', image: '/service-hair.jpg' },
  { name: 'Masajes', detail: 'Bienestar a tu ritmo', image: '/service-massage.jpg' },
  { name: 'Estética avanzada', detail: 'Tratamientos especializados', image: '/service-aesthetics.jpg' },
]

export default function StudioFlowLanding() {
  const [selectedService, setSelectedService] = useState(null)
  const [pointsVisible, setPointsVisible] = useState(false)
  const pointsRef = useRef(null)

  useEffect(() => {
    const section = pointsRef.current
    if (!section || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setPointsVisible(true)
        observer.disconnect()
      }
    }, { threshold: 0.2 })
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return <main className="sf-landing">
    <section className="sf-hero" aria-labelledby="sf-title">
      <img className="sf-hero-image" src="/studioflow-clientas-hero-v2.jpg" alt="Artistas de belleza atendiendo a sus clientas en un estudio" fetchPriority="high" />
      <div className="sf-hero-wash" />
      <header className="sf-hero-header">
        <Link to="/" aria-label="Studio Flow, inicio"><img src="/studioflow-wordmark-960.png" alt="Studio Flow" /></Link>
        <nav aria-label="Principal"><a href="#clientas">Clientas</a><a href="#profesionales">Profesionales</a><Link to="/login">Entrar</Link></nav>
      </header>
      <div className="sf-hero-content">
        <p className="sf-eyebrow">BELLEZA QUE CONECTA</p>
        <h1 id="sf-title">Studio Flow</h1>
        <p className="sf-hero-line">Encuentra salones de belleza y spa, uñas, maquillaje, pestañas y más. Reserva tu cita en una sola app.</p>
        <div className="sf-hero-actions"><a className="sf-button sf-button-light" href="#clientas">Soy clienta <ArrowRight size={19} /></a><a className="sf-button sf-button-outline" href="#profesionales">Soy artista o estudio <ArrowRight size={19} /></a></div>
      </div>
    </section>

    <nav className="sf-paths" aria-label="Elige tu espacio en Studio Flow"><a href="#clientas"><span>PARA CLIENTAS</span><strong>Encuentra tu próxima cita</strong><ArrowRight size={21} /></a><a href="#profesionales"><span>PARA ARTISTAS Y ESTUDIOS</span><strong>Haz crecer tu negocio</strong><ArrowRight size={21} /></a></nav>

    <section className="sf-client" id="clientas">
      <div className="sf-section-inner">
        <div className="sf-section-heading"><p className="sf-eyebrow">PARA CLIENTAS</p><h2>¿Qué se te antoja hoy?</h2><p>Talento real, horarios disponibles y tu próxima cita en un solo lugar.</p></div>
        <div className="sf-service-grid" aria-label="Explora servicios de belleza">
          {services.map(({ name, detail, image }) => <button className={`sf-service-tile${selectedService === name ? ' is-selected' : ''}`} type="button" key={name} onClick={() => setSelectedService(name)} aria-pressed={selectedService === name}><img src={image} alt="" loading="lazy" /><span><strong>{name}</strong><small>{detail}</small></span></button>)}
        </div>
        <div className="sf-client-action"><p>{selectedService ? `Qué bien suena ${selectedService.toLowerCase()}. Descubre quién puede atenderte.` : 'Elige lo que te gusta y encuentra a tu artista o estudio ideal.'}</p><Link className="sf-button sf-button-dark" to="/register?tipo=client">Crear cuenta para explorar <ArrowRight size={19} /></Link></div>
      </div>
    </section>

    <section className={`sf-points${pointsVisible ? ' is-visible' : ''}`} id="flow-points" ref={pointsRef}>
      <div className="sf-points-spark sf-points-spark-one" aria-hidden="true">✦</div><div className="sf-points-spark sf-points-spark-two" aria-hidden="true">✧</div>
      <div className="sf-section-inner sf-points-inner">
        <p className="sf-eyebrow"><Sparkles size={18} /> CADA VISITA PUEDE SER EL COMIENZO DE OTRA</p>
        <h2>Flow <em>Points</em><span aria-hidden="true">✦</span></h2>
        <p className="sf-points-lead">Tu cita termina. La emoción continúa.</p>
        <div className="sf-points-showcase">
          <div className="sf-points-counter" aria-label="Ejemplo ilustrativo de un saldo de 1,250 Flow Points">
            <div className="sf-points-counter-head"><span><Star size={19} fill="currentColor" /> TU SALDO</span><span>FLOW POINTS</span></div>
            <div className="sf-points-counter-total"><strong>1,250</strong><span>FP</span></div>
            <div className="sf-points-counter-progress"><span /></div>
            <div className="sf-points-counter-footer"><span>Tu próxima recompensa<br /><strong>está más cerca</strong></span><Gift size={34} aria-hidden="true" /></div>
            <small>Vista ilustrativa</small>
          </div>
          <div className="sf-points-story"><div><Star aria-hidden="true" /><strong>Disfruta tu cita</strong><p>Al completarla, puedes ganar puntos.</p></div><div><Gift aria-hidden="true" /><strong>Vuelve por más</strong><p>Úsalos en beneficios del mismo negocio.</p></div><p className="sf-points-note">Cada artista o estudio tiene su propio saldo.</p></div>
        </div>
        <Link className="sf-button sf-button-gold" to="/register?tipo=client">Quiero mis Flow Points <ArrowRight size={19} /></Link>
      </div>
    </section>

    <section className="sf-pro" id="profesionales">
      <div className="sf-section-inner">
        <div className="sf-pro-photo"><img src="/studioflow-profesionales-hero-v2.jpg" alt="Profesional de belleza trabajando en su estudio" loading="lazy" /></div>
        <div className="sf-pro-copy">
          <p className="sf-eyebrow">PARA ARTISTAS Y ESTUDIOS</p>
          <strong className="sf-offer" aria-label="Sin cuota ni comisiones hasta 2027"><span className="sf-offer-number">2026</span><span className="sf-offer-copy">SIN CUOTA <span>NI COMISIONES</span></span><Sparkles size={22} aria-hidden="true" /></strong>
          <h2>Tu talento merece que el mundo lo encuentre.</h2>
          <p>Haz que tus servicios, tu agenda y tu trabajo hablen por ti. Convierte nuevas visitas en relaciones que crecen.</p>
          <ul><li><Check size={20} /> Muestra tu trabajo y recibe reservas</li><li><Check size={20} /> Organiza tus horarios y tus citas</li><li><Check size={20} /> Crea motivos para volver con Flow Points</li></ul>
          <Link className="sf-button sf-button-dark sf-pro-cta" to="/register?tipo=artist">Empezar a crecer <ArrowRight size={19} /></Link>
          <Link className="sf-text-link" to="/profesionales">Conocer todo para mi negocio <ArrowRight size={17} /></Link>
        </div>
      </div>
    </section>

    <section className="sf-final"><div className="sf-section-inner"><p className="sf-eyebrow">EL SIGUIENTE CAPÍTULO ES TUYO</p><h2>Más encuentros. Más belleza. Más posibilidades.</h2><div><Link className="sf-button sf-button-light" to="/register?tipo=client">Soy clienta <ArrowRight size={18} /></Link><Link className="sf-button sf-button-outline" to="/register?tipo=artist">Soy artista o estudio <ArrowRight size={18} /></Link></div><p>¿Ya eres parte? <Link to="/login">Entra a tu cuenta</Link></p></div></section>
    <section className="sf-help" aria-labelledby="sf-help-title"><div className="sf-section-inner"><div><p className="sf-eyebrow">ESTAMOS CONTIGO</p><h2 id="sf-help-title">Empezar es más fácil cuando alguien te acompaña.</h2><p>¿Tienes preguntas? Te ayudamos a conocer Studio Flow y a configurar todo de forma sencilla y personalizada.</p></div><a className="sf-button sf-button-dark" href="https://wa.me/528441892008?text=Hola%2C%20quiero%20informaci%C3%B3n%20y%20ayuda%20para%20configurar%20Studio%20Flow" target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp al 844 189 2008"><MessageCircle size={20} /> Hablemos: 844 189 2008</a></div></section>
    <footer className="sf-footer"><img src="/studioflow-wordmark-960.png" alt="Studio Flow" /><span>Tu belleza. Tu talento. Tu lugar.</span><span>Powered by AXM Tech · Todos los derechos reservados</span></footer>
  </main>
}
