import { ArrowLeft, ArrowUpRight, Sparkles } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useApp } from '../contexts/appContextCore'
import { paths } from '../routes/paths'
import './aurora-preview.css'

const steps = [
  { number: '01', title: 'Lanza con intención', detail: 'Una idea clara, un público definido y una campaña que tenga sentido para tu negocio.' },
  { number: '02', title: 'Entiende lo que pasa', detail: 'Resultados de Meta Ads explicados en palabras útiles, sin perderte entre siglas.' },
  { number: '03', title: 'Crece con cada intento', detail: 'Aprende qué repetir, qué cambiar y por qué antes de invertir otra vez.' },
]

export default function AuroraPreview({ studio = false }) {
  const { artistWorkContext, session } = useApp()
  const context = session.activeSessionContext || {}
  const isMembership = context.contextType === 'membership' || context.type === 'membership'
    || artistWorkContext?.contextType === 'membership' || artistWorkContext?.type === 'membership'
    || Boolean(context.membershipId || context.membership_id || artistWorkContext?.membershipId || artistWorkContext?.membership_id)
  const hasOwnerWorkspace = (session.roles || []).some((assignment) => assignment.role === 'studio_owner')
    || context.role === 'studio_owner'

  if (!studio && isMembership) return <Navigate to={paths.artist} replace />
  if (studio && !hasOwnerWorkspace) return <Navigate to={paths.admin} replace />

  const homePath = studio ? paths.adminStudio : paths.artist

  return <main className="aurora-preview-page">
    <div className="aurora-preview-stage">
      <header className="aurora-preview-brands" aria-label="AURORA y Studio Flow">
        <div className="aurora-preview-studio-logo"><img src="/studioflow-wordmark-960.png" alt="Studio Flow" /></div>
        <img className="aurora-preview-aurora-logo" src="/aurora-logo-a249dcfe.png" alt="AURORA" width="720" height="240" />
      </header>

      <section className="aurora-preview-hero">
        <p className="aurora-preview-status"><span aria-hidden="true" /> UNA NUEVA ALIADA ESTÁ TOMANDO FORMA</p>
        <h1>Muy pronto, tus campañas tendrán una aliada que piensa contigo.</h1>
        <p className="aurora-preview-lead">Tu talento merece llegar a las personas correctas. AURORA y Studio Flow preparan una forma más clara de crear campañas en Meta Ads, entender sus resultados y decidir qué hacer después.</p>
        <div className="aurora-preview-action-row">
          <Link to={homePath} className="aurora-preview-back"><ArrowLeft size={18} /> Ir a inicio</Link>
          <span className="aurora-preview-release"><Sparkles size={16} /> Próximamente en tu espacio</span>
        </div>
      </section>

      <section className="aurora-preview-next" aria-label="Lo que viene con AURORA">
        <div className="aurora-preview-next-heading"><span>LA PRÓXIMA ETAPA</span><strong>Menos dudas. Mejores decisiones.</strong></div>
        <div className="aurora-preview-steps">
          {steps.map((step) => <article key={step.number}>
            <span className="aurora-preview-step-number">{step.number}</span>
            <h2>{step.title}</h2>
            <p>{step.detail}</p>
            <ArrowUpRight size={20} aria-hidden="true" />
          </article>)}
        </div>
      </section>
      <p className="aurora-preview-footnote">Tu cuenta de Meta Ads y la inversión de tus anuncios seguirán bajo tu control. La conexión con Meta todavía no está disponible.</p>
    </div>
  </main>
}
