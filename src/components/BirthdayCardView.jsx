import { Gift, Heart, Sparkles } from 'lucide-react'
import './birthday-card.css'

export default function BirthdayCardView({ clientName = 'Clienta', businessName = 'Studio Flow', message, phone, preview = false }) {
  const digits = String(phone || '').replace(/\D/g, '')
  const whatsapp = digits.length === 10 ? `52${digits}` : digits.length === 12 && digits.startsWith('52') ? digits : ''
  const request = `Gracias por mi felicitación, ${businessName}. Hoy es un día muy especial para mí y me gustaría saber cuál es el regalo que tienes para mí en este día.`
  return <article className="birthday-card-view">
    <div className="birthday-card-sparkles" aria-hidden="true"><Sparkles size={24} /><Heart size={21} /><Sparkles size={17} /></div>
    <span className="birthday-card-eyebrow">UN DÍA PARA CELEBRARTE</span>
    <h1>Feliz cumpleaños,<br /><em>{clientName}</em></h1>
    <p>{message}</p>
    <div className="birthday-card-signature">Con cariño, <strong>{businessName}</strong></div>
    {whatsapp && <p className="birthday-card-instruction">Para conocer tu regalo, toca el botón y envía tu mensaje por WhatsApp.</p>}
    {preview && <small className="birthday-card-preview-note">Vista previa: el mensaje se enviará a tu WhatsApp de contacto.</small>}
    {whatsapp ? <a className="birthday-card-gift" href={`https://api.whatsapp.com/send?phone=${whatsapp}&text=${encodeURIComponent(request)}`} target="_blank" rel="noreferrer"><Gift size={20} /> {preview ? 'Probar pedir mi regalo' : 'Pedir mi regalo'}</a>
      : <small className="birthday-card-no-phone">Agrega tu número de WhatsApp en Mi perfil para recibir solicitudes de regalo.</small>}
    <small className="birthday-card-powered">Con cariño desde Studio Flow</small>
  </article>
}
