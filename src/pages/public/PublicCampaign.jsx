import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import Button from '../../components/Button'
import Input from '../../components/Input'
import BrandLogo from '../../components/BrandLogo'
import { getPublicCampaign, registerCampaignParticipant } from '../../services/campaignService'

const initialForm = { fullName: '', whatsapp: '', email: '', eventType: '', eventDate: '', service: '', acceptsPromotions: false, answers: {} }

const formatCampaignMoment = (value) => value
  ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value))
  : ''

function PublicCampaign() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const [campaign, setCampaign] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    getPublicCampaign(slug).then((data) => { setCampaign(data); setStatus(data ? 'ready' : 'missing') }).catch(() => setStatus('missing'))
  }, [slug])

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const updateAnswer = (questionId, value) => setForm((current) => ({ ...current, answers: { ...current.answers, [questionId]: value } }))
  const toggleMultipleAnswer = (questionId, option) => {
    const current = Array.isArray(form.answers[questionId]) ? form.answers[questionId] : []
    updateAnswer(questionId, current.includes(option) ? current.filter((item) => item !== option) : [...current, option])
  }
  const submit = async (event) => {
    event.preventDefault()
    const missingQuestion = (campaign.formConfig?.questions || []).find((question) => {
      if (!question.required) return false
      const answer = form.answers[question.id]
      return Array.isArray(answer) ? !answer.length : !String(answer || '').trim()
    })
    if (missingQuestion) {
      setError(`Responde la pregunta obligatoria: ${missingQuestion.label}`)
      return
    }
    setStatus('saving'); setError('')
    try {
      setResult(await registerCampaignParticipant(slug, { ...form, channelSlug: searchParams.get('canal') || '' }))
      setStatus('done')
    } catch (submitError) {
      setError(submitError.message || 'No fue posible completar tu registro.')
      setStatus('ready')
    }
  }
  const currentChannel = campaign?.channels?.find((channel) => channel.slug === searchParams.get('canal'))
  const registrationOpen = campaign?.registrationStatus === 'open'
  const eventTypes = campaign?.formConfig?.eventTypes?.length ? campaign.formConfig.eventTypes : ['Boda', 'XV años', 'Otro']

  if (status === 'loading') return <main className="campaign-public-page"><p>Cargando campaña...</p></main>
  if (status === 'missing') return <main className="campaign-public-page"><BrandLogo /><h1>Campaña no disponible</h1><p>Revisa el enlace o consulta al estudio.</p></main>
  if (status === 'done') return (
    <main className="campaign-public-page campaign-success-page">
      <CheckCircle2 size={64} aria-hidden="true" />
      <span className="campaign-eyebrow">REGISTRO CONFIRMADO</span>
      <h1>¡Ya estás participando!</h1>
      <p>Gracias por visitar <strong>{result.studioName}</strong>.</p>
      <div className="campaign-folio"><small>Tu folio es</small><strong>{result.folio}</strong></div>
      <p>Guarda este folio o toma una captura de pantalla.</p>
      <p className={result.emailSent ? 'campaign-email-sent' : 'campaign-email-pending'}>{result.emailSent ? 'También enviamos la confirmación a tu correo.' : 'Tu registro está confirmado. Si el correo tarda en llegar, conserva este folio.'}</p>
    </main>
  )

  return (
    <main className="campaign-public-page">
      <header className="campaign-public-header">
        {campaign.imageUrl ? <img src={campaign.imageUrl} alt={campaign.studioName} /> : <BrandLogo />}
        <span className="campaign-eyebrow">{campaign.eventName}</span>
        <h1>{campaign.name}</h1>
        <p>{campaign.welcomeText || campaign.description || `Participa en ${campaign.promotionName}.`}</p>
        {campaign.startsAt && campaign.endsAt && <p className="campaign-window-label">Del {formatCampaignMoment(campaign.startsAt)} al {formatCampaignMoment(campaign.endsAt)}</p>}
        {currentChannel && <small className="campaign-source-label">Registro desde {currentChannel.name}</small>}
      </header>
      {!registrationOpen ? <section className="campaign-availability-message">
        <span className="campaign-eyebrow">{campaign.registrationStatus === 'upcoming' ? 'PRÓXIMAMENTE' : 'CAMPAÑA FINALIZADA'}</span>
        <h2>{campaign.registrationStatus === 'upcoming' ? 'El registro aún no comienza' : 'El periodo de registro terminó'}</h2>
        <p>{campaign.registrationStatus === 'upcoming' ? `Podrás participar a partir del ${formatCampaignMoment(campaign.startsAt)}.` : `Esta campaña cerró el ${formatCampaignMoment(campaign.endsAt)}.`}</p>
      </section> : <form className="campaign-form" onSubmit={submit}>
        <Input label="Nombre completo" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required />
        <Input label="Número de WhatsApp" type="tel" value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} required />
        <Input label="Correo electrónico" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
        <label className="input-field"><span>Tipo de evento</span><select value={form.eventType} onChange={(e) => update('eventType', e.target.value)} required><option value="">Selecciona una opción</option>{eventTypes.map((eventType) => <option value={eventType} key={eventType}>{eventType}</option>)}</select></label>
        <Input label="Fecha aproximada de tu evento" type="date" value={form.eventDate} onChange={(e) => update('eventDate', e.target.value)} />
        <label className="input-field"><span>Servicio que te interesa</span><select value={form.service} onChange={(e) => update('service', e.target.value)} required><option value="">Selecciona una opción</option><option>Paquete de novia</option><option>Paquete XV años</option><option>Maquillaje</option><option>Uñas</option><option>Pestañas</option><option>Otro</option></select></label>
        {(campaign.formConfig?.questions || []).map((question) => <fieldset className="campaign-custom-question" key={question.id}><legend>{question.label}{question.required && <span> *</span>}</legend>{question.type === 'short' ? <input type="text" maxLength={300} value={form.answers[question.id] || ''} onChange={(e) => updateAnswer(question.id, e.target.value)} required={question.required} /> : question.type === 'multiple' ? <div className="campaign-option-list">{question.options.map((option) => <label key={option}><input type="checkbox" checked={(form.answers[question.id] || []).includes(option)} onChange={() => toggleMultipleAnswer(question.id, option)} /><span>{option}</span></label>)}</div> : <div className="campaign-option-list">{question.options.map((option) => <label key={option}><input type="radio" name={question.id} value={option} checked={form.answers[question.id] === option} onChange={(e) => updateAnswer(question.id, e.target.value)} required={question.required} /><span>{option}</span></label>)}</div>}</fieldset>)}
        <label className="campaign-consent"><input type="checkbox" checked={form.acceptsPromotions} onChange={(e) => update('acceptsPromotions', e.target.checked)} /><span>Acepto recibir promociones e información del estudio.</span></label>
        {error && <p className="campaign-error">{error}</p>}
        <Button type="submit" disabled={status === 'saving'}>{status === 'saving' ? 'Registrando...' : 'Participar'}</Button>
      </form>}
    </main>
  )
}

export default PublicCampaign
