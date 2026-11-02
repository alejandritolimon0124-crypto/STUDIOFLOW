import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CalendarDays, Gift, MapPin, Sparkles, X } from 'lucide-react'
import { requireSupabase } from '../../lib/supabaseClient'
import { bookingSlug } from '../../utils/publicBookingLinks'
import './dennis-beauty-studio.css'

const LISTING_ID = '6c5b751e-700c-4bcd-a12e-f6876792f43e'
const MAPS_URL = 'https://maps.google.com/?q=25.46116%2C-100.986983'
const BOOKING_BASE = `/reservar/dennis-ch-vez-beauty-studio`
const money = (amount) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount)
const bookLink = (service) => `${BOOKING_BASE}${service ? `/${bookingSlug(service.name)}` : ''}?perfil=${LISTING_ID}`
const whatsappLink = (message) => `https://wa.me/528443934366?text=${encodeURIComponent(message)}`

const bridalPackages = [
  { name: 'Bride Essential', price: 9450, details: 'Pruebas de maquillaje y peinado · Maquillaje HD · Peinado · Pestañas de seda · Gelish con diseño · Kit de retoque' },
  { name: 'Bride Glam', price: 11950, details: 'Pruebas de maquillaje y peinado · Maquillaje HD · Body Glow · Peinado · Pestañas clásicas o híbridas · Uñas con tip · Kit de retoque' },
  { name: 'Bride Signature', price: 9000, details: 'Pruebas de maquillaje y peinado · Preparación de piel · Maquillaje HD · Pestañas de seda · Peinado · Body Glow · Kit de retoque' },
  { name: 'Bride Complement', price: 9880, details: 'Experiencia Bride Signature · Maquillaje para mamá de la novia' },
]

const bridalExtras = [
  { name: 'Civil / despedida', price: 2500, detail: 'Maquillaje y peinado de novia' },
  { name: 'Familia & friends', price: 1350, detail: 'Maquillaje y peinado' },
  { name: 'Maquillaje social adicional', price: 880, detail: 'Amiga, familiar o dama' },
]

const quincePackages = [
  { name: 'XV Essential', price: 5350, details: 'Preparación de piel · Maquillaje HD · Pestañas tipo mink · Peinado · Gelish con diseño' },
  { name: 'XV Glam', price: 7200, details: 'Preparación de piel · Maquillaje HD · Peinado · Uñas con tip y diseño · Pestañas clásicas' },
  { name: 'XV Signature', price: 8480, details: 'Facial preevento · Maquillaje Ultra Glow · Body Glow · Peinado · Acrílico con diseño · Pestañas híbridas · Kit de retoque' },
  { name: 'XV Perfect Match', price: 9100, details: 'Pruebas de maquillaje y peinado · Maquillaje HD Ultra Glow · Peinado · Kit de retoque · Maquillaje para mamá' },
]

const catalogGroups = [
  { key: 'unas', title: 'Uñas', line: 'El detalle que transforma todo.', image: '/service-nails.jpg', match: /uñas|diseño de uñas/i },
  { key: 'pestanas', title: 'Pestañas', line: 'Una mirada que lo dice todo.', image: '/service-lashes.jpg', match: /pestañas|colocación de pestañas/i },
  { key: 'maquillaje', title: 'Maquillaje', line: 'Tu estilo, con luz propia.', image: '/service-makeup.jpg', match: /maquillaje/i },
  { key: 'peinado', title: 'Peinado', line: 'El toque final de tu look.', image: '/service-hair.jpg', match: /peinado/i },
]

const featuredHairstyles = [
  { id: 'semi-updo', name: 'Peinado semi-recogido', priceAmount: 400, image: 'semi-updo' },
  { id: 'formal-updo', name: 'Peinado recogido', priceAmount: 550, image: 'formal-updo' },
  { id: 'quince-updo', name: 'Peinado para quinceaños', priceAmount: 900, image: 'quince-updo' },
  { id: 'bridal-updo', name: 'Peinado para novia', priceAmount: 900, image: 'bridal-updo' },
]

const serviceImages = {
  '8f4006f4-c8bb-4a92-a258-9474ddd4cd69': 'russian-volume-lashes',
  '7a554da3-f67c-43fb-a68a-8b543ab3f71b': 'sculpted-nails',
  '8594e127-4b41-47d4-904a-7de6f59a79cd': 'nail-art',
  '07a61b15-639b-4708-af4b-ab59966dc588': 'social-makeup',
  '6a9defa6-bcc8-4c51-ab94-4446b15f2835': 'glam-makeup',
  'b126afe3-31b4-4a76-a411-7a8a7a2ec8e0': 'makeup-trial',
  '1c0a718a-c5ac-45a7-b932-378f9f4e818b': 'waves-hair',
  '9c82fd4e-b90c-465f-b95b-3a2b25bb5b4f': 'classic-lashes',
  '45930d57-7482-4e03-8043-37e4a366822a': 'hybrid-lashes',
  '820560ec-46e3-4c6e-87d5-fc89c422ef4e': 'russian-rubber',
  'f6462b61-eeb6-49a3-8127-eeef1484f0a3': 'russian-design',
  'e5a23903-7c60-44e1-9279-dc064cc536e1': 'pedicure',
  '48e6f177-04de-47e1-989b-d8dd7be02af2': 'removal',
  '0ae1f132-be54-4f7f-8839-eb13f7da84f4': 'softgel-premium',
  'b7108e4b-91bc-48a5-9a11-8f753cb20994': 'softgel-two-tone',
  '1a63b85f-62d0-4435-849e-a677c88e7ac9': 'gel-nails',
}

function PackageList({ items, tone }) {
  return <div className={`dennis-package-grid dennis-package-grid--${tone}`}>
    {items.map((item, index) => <article className="dennis-package" key={item.name} data-reveal style={{ '--reveal-delay': `${index * 70}ms` }}>
      <span className="dennis-package-index">{String(index + 1).padStart(2, '0')}</span>
      <h3>{item.name}</h3>
      <strong className="dennis-package-price">{money(item.price)}</strong>
      <ul className="dennis-package-includes">{item.details.split(' · ').map((detail) => <li key={detail}>{detail}</li>)}</ul>
    </article>)}
  </div>
}

export default function DennisBeautyStudio() {
  const [catalog, setCatalog] = useState(null)
  const [catalogState, setCatalogState] = useState('loading')
  const [selectedService, setSelectedService] = useState(null)

  useEffect(() => {
    if (!selectedService) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') setSelectedService(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedService])

  useEffect(() => {
    let active = true
    requireSupabase().rpc('studio_flow_public_dennis_catalog')
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) { setCatalogState('error'); return }
        setCatalog(data)
        setCatalogState('ready')
      })
      .catch(() => { if (active) setCatalogState('error') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.08 })
    document.querySelectorAll('.dennis-page [data-reveal]').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [catalogState])

  const services = useMemo(() => (Array.isArray(catalog?.services) ? catalog.services : [])
    .filter((service) => service.status === 'active' && Number(service.priceAmount ?? service.price_amount) > 0), [catalog])
  const signature = services.find((service) => service.category === 'Novias' && /signature/i.test(service.name))
  const bridalItems = bridalPackages.map((item) => item.name === 'Bride Signature' && signature
    ? { ...item, price: Number(signature.priceAmount ?? signature.price_amount) }
    : item)
  const rewardPercent = Number(catalog?.flowPointsRewardPercentage) || 5
  const rewardsEnabled = Boolean(catalog?.flowPointsEnabled)

  return <main className="dennis-page">
    <header className="dennis-header">
      <a className="dennis-wordmark" href="#inicio" aria-label="Dennis Chávez Beauty Studio, inicio"><span>DC</span><strong>Dennis Chávez <small>BEAUTY STUDIO</small></strong></a>
      <nav aria-label="Secciones"><a href="#precios">Precios</a><a href="#novias">Novias</a><a href="#xv">XV años</a><a href="#flowpoints">FlowPoints</a></nav>
      <a className="dennis-header-book" href={bookLink()}><CalendarDays size={17} /> Agendar</a>
    </header>

    <section className="dennis-hero" id="inicio">
      <img className="dennis-hero-image" src="/service-makeup.jpg" alt="Artista maquillando a una clienta" fetchPriority="high" />
      <div className="dennis-hero-shade" />
      <div className="dennis-hero-content" data-reveal>
        <h1 className="dennis-hero-brand"><img src="/dennis/dennis-logo-transparent.png" alt="Dennis Chávez Beauty Studio" fetchPriority="high" /></h1>
        <p className="dennis-hero-address"><MapPin size={19} aria-hidden="true" /> Cañada 448, Col. Virreyes Fovissste<br />Saltillo, Coahuila</p>
        <a className="dennis-button dennis-button--directions" href={MAPS_URL} target="_blank" rel="noreferrer">Cómo llegar <ArrowUpRight size={18} /></a>
      </div>
      <div className="dennis-hero-side"><div className="dennis-hero-ticker"><span>UÑAS · PESTAÑAS · MAQUILLAJE · PEINADOS · PAQUETES PARA NOVIA · QUINCEAÑOS ·&nbsp;</span><span aria-hidden="true">UÑAS · PESTAÑAS · MAQUILLAJE · PEINADOS · PAQUETES PARA NOVIA · QUINCEAÑOS ·&nbsp;</span></div></div>
    </section>

    <nav className="dennis-jump" aria-label="Explora el catálogo"><a href="#novias">Bodas</a><a href="#xv">XV años</a><a href="#servicios">Servicios</a><a href="#flowpoints">FlowPoints</a></nav>

    <section className="dennis-rewards" id="flowpoints">
      <div className="dennis-rewards-art" aria-hidden="true"><Sparkles size={30} /><span>FlowPoints</span><Sparkles size={22} /></div>
      <div className="dennis-rewards-copy" data-reveal><span className="dennis-eyebrow">CADA VISITA MERECE CELEBRARSE</span><h2>Tu belleza también <em>te premia.</em></h2><div className="dennis-rewards-facts">{rewardsEnabled && <strong>{rewardPercent}% <small>de tu pago en valor de puntos</small></strong>}<strong>100 FlowPoints <small>= $10 MXN para usar después</small></strong></div><small className="dennis-rewards-note">{rewardsEnabled ? `Dennis tiene activo el ${rewardPercent}% de acumulación. Los puntos reales se calculan sobre el importe pagado al completar la cita.` : 'La acumulación está sujeta a la configuración vigente del estudio y a una cita completada en Studio Flow.'}</small></div>
      <Gift className="dennis-rewards-gift" size={170} strokeWidth={0.6} aria-hidden="true" />
    </section>

    <section className="dennis-editorial dennis-editorial--bridal" id="novias">
      <div className="dennis-editorial-photo"><img src="/dennis/bridal-essential.png" alt="Inspiración de maquillaje y peinado para novia" loading="lazy" /></div>
      <div className="dennis-editorial-intro" data-reveal><span className="dennis-eyebrow">LA COLECCIÓN NUPCIAL</span><h2>Para el día que recordarás siempre.</h2><p>Cuatro formas de vivir tu preparación. Precios de servicio en estudio.</p></div>
    </section>
    <section className="dennis-section dennis-section--bridal"><div className="dennis-section-heading" data-reveal><span>01 / NOVIAS</span><h2>Paquetes de boda</h2><p>Elige la experiencia que se parece a ti.</p></div><PackageList items={bridalItems} tone="bridal" /><div className="dennis-extras"><h3>También para tu celebración</h3>{bridalExtras.map((item) => <div key={item.name}><span><strong>{item.name}</strong><small>{item.detail}</small></span><b>{money(item.price)}</b></div>)}</div><p className="dennis-section-note">Servicio a domicilio: cargo adicional desde $2,500, sujeto a disponibilidad.</p><div className="dennis-section-actions"><a className="dennis-button dennis-button--dark" href={signature ? bookLink(signature) : bookLink()}>Ver agenda <CalendarDays size={17} /></a><a className="dennis-inline-link" href={whatsappLink('Hola, vi los paquetes de boda de Dennis Beauty Studio. Quisiera consultar disponibilidad y detalles.')} target="_blank" rel="noreferrer">Consultar un paquete por WhatsApp <ArrowUpRight size={17} /></a></div></section>

    <section className="dennis-editorial dennis-editorial--xv" id="xv"><div className="dennis-editorial-intro" data-reveal><span className="dennis-eyebrow">UNA NOCHE DE CUENTO</span><h2>Quince años de magia. <em>Un momento tuyo.</em></h2><p>Tu look soñado comienza aquí.</p></div><div className="dennis-editorial-photo"><img src="/dennis/xv-essential.png" alt="Inspiración de maquillaje y peinado para XV años" loading="lazy" /></div></section>
    <section className="dennis-section dennis-section--xv"><div className="dennis-section-heading" data-reveal><span>02 / XV AÑOS</span><h2>Paquetes para brillar</h2><p>Todos incluyen una foto de estudio.</p></div><PackageList items={quincePackages} tone="xv" /><p className="dennis-section-note">Precios en estudio. Servicio a domicilio: cargo adicional de $2,500, sujeto a disponibilidad.</p><div className="dennis-section-actions"><a className="dennis-button dennis-button--dark" href={bookLink()}>Ver agenda <CalendarDays size={17} /></a><a className="dennis-inline-link" href={whatsappLink('Hola, vi los paquetes de XV años de Dennis Beauty Studio. Quisiera consultar disponibilidad y detalles.')} target="_blank" rel="noreferrer">Consultar un paquete por WhatsApp <ArrowUpRight size={17} /></a></div></section>

    <section className="dennis-catalog" id="precios"><div className="dennis-catalog-heading" data-reveal><span className="dennis-eyebrow">ELIGE TU EXPERIENCIA</span><h2>Servicios & precios</h2><p><Sparkles size={20} aria-hidden="true" /> Cada servicio te da puntos que se transforman en beneficios para tu próxima cita.</p></div><div id="servicios" className="dennis-catalog-groups">{catalogState === 'loading' && <p className="dennis-catalog-status" role="status">Cargando precios del estudio...</p>}{catalogState === 'error' && <p className="dennis-catalog-status" role="alert">No pudimos consultar los precios ahora. <a href={bookLink()}>Verlos en la agenda</a>.</p>}{catalogState === 'ready' && catalogGroups.map((group) => { const groupServices = services.filter((service) => group.match.test(service.category || '')); const extraServices = group.key === 'peinado' ? featuredHairstyles.filter((item) => !groupServices.some((service) => service.name.toLowerCase() === item.name.toLowerCase())) : []; const visibleServices = [...groupServices, ...extraServices]; if (!visibleServices.length) return null; return <section className={`dennis-service-group dennis-service-group--${group.key}`} key={group.key}><div className="dennis-service-photo"><img src={group.image} alt={`Servicio de ${group.title.toLowerCase()}`} loading="lazy" /></div><div className="dennis-service-content"><div className="dennis-service-heading" data-reveal><span>{group.title.toUpperCase()}</span><h3>{group.line}</h3></div><div className="dennis-service-list">{visibleServices.map((service) => { const price = Number(service.priceAmount ?? service.price_amount); const points = Math.round(price * rewardPercent / 10); const image = service.image || serviceImages[service.id]; return <button className="dennis-service-row" type="button" key={service.id} onClick={() => setSelectedService({ service, price, image: image ? `/dennis/services/${image}.jpg` : group.image, bookable: !service.image })}><img className="dennis-service-thumb" src={image ? `/dennis/services/${image}.jpg` : group.image} alt="" loading="lazy" /><span className="dennis-service-info"><span className="dennis-service-title"><strong>{service.name}</strong><b>{money(price)}</b></span>{rewardsEnabled && <small className="dennis-points-badge"><Sparkles size={14} /> {points} FlowPoints</small>}</span></button> })}</div>{group.key === 'peinado' ? <a className="dennis-service-book" href={whatsappLink('Hola, vi los peinados de Dennis Beauty Studio. Quisiera consultar disponibilidad y agendar.')} target="_blank" rel="noreferrer">Consultar peinados y agendar <ArrowUpRight size={17} /></a> : <a className="dennis-service-book" href={bookLink()}>Agendar {group.title.toLowerCase()} <ArrowUpRight size={17} /></a>}</div></section> })}</div><p className="dennis-catalog-footnote">Los FlowPoints se calculan sobre el importe final pagado de una cita completada en Studio Flow. Promociones y descuentos pueden cambiar la cantidad.</p></section>

    {selectedService && <div className="dennis-service-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedService(null) }}><section className="dennis-service-dialog" role="dialog" aria-modal="true" aria-labelledby="dennis-selected-service"><button className="dennis-service-close" type="button" aria-label="Cerrar" onClick={() => setSelectedService(null)}><X size={22} /></button><img src={selectedService.image} alt="" /><div><span className="dennis-eyebrow">TU PRÓXIMA EXPERIENCIA</span><h2 id="dennis-selected-service">{selectedService.service.name}</h2><strong>{money(selectedService.price)}</strong>{!selectedService.bookable && <p>Confirma disponibilidad con Dennis para este peinado.</p>}<a className="dennis-button dennis-button--dark" href={selectedService.bookable ? bookLink(selectedService.service) : whatsappLink(`Hola, quiero agendar ${selectedService.service.name} de $${selectedService.price} con Dennis Beauty Studio. ¿Tienen disponibilidad?`)} {...(!selectedService.bookable ? { target: '_blank', rel: 'noreferrer' } : {})}>{selectedService.bookable ? '¡AGENDAR AHORA!' : 'CONSULTAR PARA AGENDAR'} <ArrowUpRight size={18} /></a></div></section></div>}

    <footer className="dennis-footer"><div><span>DC</span><strong>Dennis Chávez Beauty Studio</strong><small>Saltillo, Coahuila</small></div><div className="dennis-footer-links"><a href={bookLink()}><CalendarDays size={16} /> Reservar sin cuenta</a><a href="https://www.instagram.com/dennisbeautystudio/" target="_blank" rel="noreferrer">Instagram</a><a href={MAPS_URL} target="_blank" rel="noreferrer"><MapPin size={16} /> Cómo llegar</a></div><p>Una experiencia en <a href="/">Studio Flow</a></p></footer>
  </main>
}
