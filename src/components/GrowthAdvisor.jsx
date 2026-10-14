import { ArrowRight, CalendarDays, ChartNoAxesCombined, HeartHandshake, Megaphone, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { paths } from '../routes/paths'

const money = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(value) || 0)
const days = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const percent = (part, whole) => whole > 0 ? `${Math.round((Number(part) || 0) / whole * 100)}%` : '—'

function metric(label, value, context) {
  return <div className="growth-metric" key={label}><small>{label}</small><strong>{value}</strong><span>{context}</span></div>
}

function sourceMetric(source, value, context) {
  const labels = {
    search: 'Búsqueda Studio Flow',
    cards: 'Tarjetas digitales',
    google: <span className="growth-google-word" aria-label="Google">{'Google'.split('').map((letter, index) => <span key={index}>{letter}</span>)}</span>,
    instagram: 'Instagram',
    facebook: 'facebook',
    other: 'Otros enlaces',
  }
  return <div className={`growth-metric growth-source-${source}`} key={source}><small>{labels[source]}</small><strong>{value}</strong><span>{context}</span></div>
}

function Action({ icon: Icon, title, detail, onClick }) {
  return <button className="growth-action" type="button" onClick={onClick}>
    <span className="growth-action-icon"><Icon size={22} /></span>
    <span><strong>{title}</strong><small>{detail}</small></span>
    <ArrowRight size={19} aria-hidden="true" />
  </button>
}

export default function GrowthAdvisor({ data, studio = false, view = 'hoy', onShare, onSocialLinks }) {
  const navigate = useNavigate()
  if (!data) return null

  const quiet = data.quietWindow
  const quietLabel = quiet?.weekday && quiet?.hour != null ? `${days[quiet.weekday]} a las ${quiet.hour}:00` : ''
  const searchFirst = Number(data.searchFirstClients ?? data.marketplaceFirstClients) || 0
  const searchFirstRevenue = Number(data.searchFirstRevenue ?? data.marketplaceFirstRevenue) || 0
  const searchReturning = Number(data.searchReturningClients ?? data.marketplaceReturningClients) || 0
  const searchReturningRevenue = Number(data.searchReturningRevenue ?? data.marketplaceReturningRevenue) || 0
  const invitationFirst = Number(data.invitationFirstClients) || 0
  const revenue = Number(data.revenue) || 0
  const previous = Number(data.previousRevenue) || 0
  const comparison = previous > 0 ? `${revenue >= previous ? '+' : ''}${Math.round((revenue - previous) / previous * 100)}% frente al mes anterior` : 'Primer mes con actividad registrada'
  const series = Array.isArray(data.series) ? data.series : []
  const seriesMax = Math.max(...series.map((item) => Number(item.revenue) || 0), 1)
  const marketingPath = studio ? `${paths.adminStudio}?section=marketplace` : paths.artistMarketing

  const recommendations = [
    quiet && Number(quiet.slots) >= 4 ? { icon: CalendarDays, title: `Dale vida al ${quietLabel}`, detail: 'Configura Happy Hour para ese día y hora.', path: `${marketingPath}${marketingPath.includes('?') ? '&' : '?'}sugerirDia=${quiet.weekday}&sugerirHora=${quiet.hour}` } : null,
    data.topService?.name ? { icon: Sparkles, title: `Haz visible ${data.topService.name}`, detail: 'Crea un enlace directo para compartirlo en tus redes.', onClick: () => onSocialLinks?.(data.topService.name) } : null,
    Number(data.inactiveClients) > 0 ? { icon: Megaphone, title: `Vuelve a conectar con ${data.inactiveClients} clientas`, detail: 'Llevan entre 60 y 180 días sin una cita registrada.', path: studio ? paths.studioCampaigns : paths.artistCampaigns } : null,
  ].filter(Boolean).slice(0, 2)

  if (view === 'hoy') return <>
    <section className="growth-hero" aria-label="Mi negocio este mes">
      <div><span className="growth-eyebrow">TU NEGOCIO EN MOVIMIENTO</span><h2>{revenue > 0 ? 'Mira lo que está creciendo.' : 'Tu siguiente cita empieza aquí.'}</h2><p>{revenue > 0 ? comparison : 'Publica horarios y servicios para que puedan encontrarte y reservar.'}</p></div>
      <ChartNoAxesCombined size={42} aria-hidden="true" />
    </section>
    <div className="growth-metrics" aria-label="Resumen del mes">
      {metric('Ingresos', money(data.revenue), 'Citas completadas')}
      {metric('Citas atendidas', Number(data.completed) || 0, 'Este mes')}
      {metric('Clientas nuevas', Number(data.firstClients) || 0, 'Primera cita registrada')}
      {metric('Volvieron', Number(data.returningClients) || 0, 'Ya tenían una cita anterior')}
    </div>
    <section className="growth-impact" aria-label="Primeras citas desde la búsqueda de Studio Flow">
      <span className="growth-eyebrow">DESDE LA BÚSQUEDA DE STUDIO FLOW</span>
      <strong>{searchFirst} {searchFirst === 1 ? 'primera cita' : 'primeras citas'}</strong>
      <p>{searchFirst > 0 ? `${money(searchFirstRevenue)} en esas visitas. Las tarjetas compartidas se cuentan por separado.` : 'Todavía no hay primeras citas registradas desde la búsqueda de la app.'}</p>
      <button type="button" onClick={() => document.getElementById('growth-tabs')?.querySelector('[data-view="consigue"]')?.click()}>Ver todos los caminos <ArrowRight size={17} /></button>
    </section>
    <section className="growth-next" aria-label="Qué hacer ahora"><h2>Tu siguiente movimiento</h2>{recommendations.length > 0 ? recommendations.map((item) => <Action key={item.title} {...item} onClick={item.onClick || (() => navigate(item.path))} />) : <Action icon={Megaphone} title="Invita a tu próxima clienta" detail="Comparte una tarjeta con tu perfil y agenda." onClick={onShare} />}</section>
    <section className="growth-evolution" aria-label="Evolución de ingresos"><div><span className="growth-eyebrow">CRECIMIENTO</span><h2>Así va tu camino</h2></div><div className="growth-bars">{series.map((item) => <div key={item.month} title={`${item.month}: ${money(item.revenue)}`}><span style={{ height: `${Math.max(7, Math.round((Number(item.revenue) || 0) / seriesMax * 100))}%` }}></span><small>{item.month?.slice(5)}</small></div>)}</div></section>
  </>

  if (view === 'organiza') {
    const selfBooked = Number(data.selfBooked) || 0
    const confirmationRequests = Number(data.confirmationRequests) || 0
    const rescheduled = Number(data.rescheduled) || 0
    const cancelled = Number(data.cancelled) || 0
    return <section className="growth-organize" aria-label="Así te ayuda Studio Flow con tu agenda">
      <div className="growth-organize-hero">
        <span className="growth-eyebrow">ORGANIZA · TU TIEMPO VALE</span>
        <h2>Tu talento atiende. Tu agenda sigue en movimiento.</h2>
        <div className="growth-organize-bookings"><strong>{selfBooked}</strong><p>{selfBooked === 1 ? 'clienta reservó por su cuenta este mes.' : 'clientas reservaron por su cuenta este mes.'}<span>{selfBooked > 0 ? 'Studio Flow dejó esas citas en tu agenda, sin mensajes de ida y vuelta.' : 'Comparte tu enlace para que puedan elegir su cita sin esperarte.'}</span></p></div>
      </div>
      <div className="growth-organize-work">
        <span className="growth-eyebrow">EL TRABAJO QUE YA NO TIENES QUE PERSEGUIR</span>
        <div className="growth-organize-line"><strong>{confirmationRequests}</strong><p><b>{confirmationRequests === 1 ? 'solicitud de confirmación gestionada' : 'solicitudes de confirmación gestionadas'}</b><span>Cuando la pides desde la agenda, Studio Flow avisa a la clienta. Ella confirma su asistencia.</span></p></div>
        {(rescheduled > 0 || cancelled > 0) && <div className="growth-organize-secondary">{rescheduled > 0 && <p><b>{rescheduled}</b> {rescheduled === 1 ? 'cambio de horario quedó' : 'cambios de horario quedaron'} registrados.</p>}{cancelled > 0 && <p><b>{cancelled}</b> {cancelled === 1 ? 'cancelación quedó' : 'cancelaciones quedaron'} visibles en tu agenda.</p>}</div>}
      </div>
      <div className="growth-organize-next"><div><span className="growth-eyebrow">TU SIGUIENTE OPORTUNIDAD</span><p>{quietLabel ? `Hay espacio el ${quietLabel}. Dale vida con una promoción para ese momento.` : 'Revisa tus próximos espacios y decide dónde quieres crecer.'}</p></div><Action icon={CalendarDays} title="Ver mi agenda" detail="Mira tus próximos espacios." onClick={() => navigate(studio ? `${paths.adminStudio}?section=schedule` : paths.artistAppointments)} /></div>
    </section>
  }

  if (view === 'consigue') return <section className="growth-story growth-story-sources"><div className="growth-story-head"><Sparkles size={30} /><div><span className="growth-eyebrow">CONSIGUE</span><h2>Por dónde llegaron</h2></div></div><p className="growth-insight">{searchFirst + invitationFirst > 0 ? 'Cada camino trae una oportunidad distinta. Estos son los que terminaron en una primera cita.' : 'Todavía no hay primeras citas atribuidas a estos enlaces. Empieza compartiendo tu perfil.'}</p><div className="growth-story-stats growth-source-grid">{sourceMetric('search', searchFirst, `${money(searchFirstRevenue)} en primeras citas`)}{sourceMetric('cards', invitationFirst, `${money(data.invitationFirstRevenue)} en primeras citas`)}{sourceMetric('google', Number(data.firstBookingSources?.googleLink) || 0, 'Primeras citas')}{sourceMetric('instagram', Number(data.firstBookingSources?.instagramLink) || 0, 'Primeras citas')}{sourceMetric('facebook', Number(data.firstBookingSources?.facebookLink) || 0, 'Primeras citas')}{sourceMetric('other', Number(data.firstBookingSources?.other) || 0, 'Primeras citas')}</div><h3 className="growth-subheading">Y después volvieron</h3><div className="growth-return-lines"><div><strong>{searchReturning}</strong><span>Desde la búsqueda</span><small>{money(searchReturningRevenue)} en nuevas visitas</small></div><div><strong>{Number(data.invitationReturningClients) || 0}</strong><span>Desde tarjetas digitales</span><small>{money(data.invitationReturningRevenue)} en nuevas visitas</small></div></div><p className="growth-definition">Se registra el enlace de su primera reserva, no el lugar donde conocieron el negocio.</p><div className="growth-actions-head">Haz que más clientas te encuentren</div><Action icon={Sparkles} title="Crear enlace para redes" detail="Elige Instagram, Facebook o Google y compártelo." onClick={() => onSocialLinks?.('')} /><Action icon={Megaphone} title="Crear tarjeta digital" detail="Comparte tu trabajo y, si quieres, un beneficio." onClick={onShare} /></section>

  return <section className="growth-story growth-story-loyalty"><div className="growth-story-head"><HeartHandshake size={30} /><div><span className="growth-eyebrow">FIDELIZA</span><h2>Que quieran volver</h2></div></div><div className="growth-source-feature growth-loyalty-feature"><strong>{percent(data.returningClients, data.servedClients)}</strong><span>de tus clientas atendidas este mes ya habían venido antes</span><div className="growth-loyalty-track"><span style={{ width: percent(data.returningClients, data.servedClients) === '—' ? '0%' : percent(data.returningClients, data.servedClients) }} /></div></div><div className="growth-story-stats growth-loyalty-grid">{metric('Volvieron', Number(data.returningClients) || 0, 'Clientas atendidas antes')}{metric('Recibieron puntos', Number(data.pointsVisits) || 0, 'Visitas con FlowPoints')}{metric('Canjearon puntos', Number(data.redemptionVisits) || 0, 'Visitas con recompensa')}{metric('Reservaron promoción', Number(data.promotionBookings) || 0, money(data.promotionRevenue))}</div><div className="growth-actions-head">Tu siguiente paso para cuidarlas</div><Action icon={HeartHandshake} title="Premia su próxima visita" detail="Revisa FlowPoints y los beneficios de tu negocio." onClick={() => navigate(marketingPath)} /><Action icon={CalendarDays} title="Recuérdales cuándo volver" detail="Configura recordatorios según el servicio recibido." onClick={() => navigate(marketingPath)} />{Number(data.inactiveClients) > 0 && <Action icon={Megaphone} title={`Reconecta con ${data.inactiveClients} clientas`} detail="Llevan de 60 a 180 días sin una cita completada." onClick={() => navigate(studio ? paths.studioCampaigns : paths.artistCampaigns)} />}</section>
}
