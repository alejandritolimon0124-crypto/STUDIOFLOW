import { useLocation } from 'react-router-dom'

const authMessages = {
  '/register': {
    eyebrow: 'TU SIGUIENTE ETAPA EMPIEZA AQUÍ',
    title: 'El lugar donde el talento encuentra oportunidades.',
    text: 'Crea tu espacio, conecta con nuevas clientas y convierte cada cita en una experiencia que las haga volver.',
  },
  '/login': {
    eyebrow: 'STUDIO FLOW ESTÁ DE TU LADO',
    title: 'Primero crece. Después invierte.',
    text: 'Vuelve a tu espacio. Tus citas, tus clientas y nuevas oportunidades te esperan.',
  },
}

function AuthLayout({ children, className = '' }) {
  const location = useLocation()
  const message = authMessages[location.pathname] || authMessages['/login']

  return <main className={`auth-experience ${className}`}>
    <section className="auth-emotion-panel">
      <img className="auth-emotion-photo" src="/studioflow-clientas-hero-v2.jpg" alt="Experiencias de belleza en Studio Flow" />
      <div className="auth-emotion-shade" />
      <div className="auth-emotion-copy"><span>{message.eyebrow}</span><h1>{message.title}</h1><p>{message.text}</p></div>
      <div className="auth-emotion-ribbon"><span>DESCUBRE · RESERVA · ORGANIZA · CRECE · DISFRUTA · COMPARTE ·</span></div>
    </section>
    <section className="auth-entry-panel">{children}</section>
  </main>
}

export default AuthLayout
