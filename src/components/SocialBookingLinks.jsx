import { useEffect, useRef, useState } from 'react'
import { Copy, ExternalLink, Share2, X } from 'lucide-react'
import { fetchPublicBookingListings } from '../services/publicBookingService'
import { publicBookingUrl } from '../utils/publicBookingLinks'

export default function SocialBookingLinks({ artistId, studioId, businessName, suggestedService = '', onClose }) {
  const panelRef = useRef(null)
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [source, setSource] = useState('instagram')
  const [serviceId, setServiceId] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })) }, [])

  useEffect(() => {
    let active = true
    fetchPublicBookingListings().then((items) => {
      if (!active) return
      const found = items.find((item) => studioId ? item.studioId === studioId && item.profileType === 'studio' : item.artistId === artistId && item.profileType !== 'studio' && !item.studioId)
      setListing(found || null)
      if (found && suggestedService) setServiceId((found.services || []).find((item) => item.name === suggestedService)?.id || '')
    }).catch((failure) => { if (active) setError(failure.message || 'No pudimos cargar tu perfil público.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [artistId, studioId, suggestedService])

  const services = listing?.services || []
  const service = services.find((item) => item.id === serviceId)
  const url = listing ? publicBookingUrl(listing, source, service) : ''
  const share = async () => {
    if (!url) return
    const text = `Agenda conmigo en Studio Flow${service ? `: ${service.name}` : ''}. Elige el horario que mejor te venga.`
    try {
      if (navigator.share) await navigator.share({ title: `Reserva con ${businessName || listing?.title || 'Studio Flow'}`, text, url })
      else { await navigator.clipboard.writeText(`${text} ${url}`); setNotice('Invitación copiada.') }
    } catch (failure) { if (failure.name !== 'AbortError') setNotice('No se pudo compartir el enlace.') }
  }

  return <section ref={panelRef} className="social-links-panel" aria-label="Enlaces de reserva para redes">
    <div className="social-links-head"><div><span className="growth-eyebrow">TU PERFIL EN CADA RED</span><h2>Una ruta directa a tu agenda</h2></div><button type="button" onClick={onClose} aria-label="Cerrar enlaces" title="Cerrar"><X size={21} /></button></div>
    {loading ? <p>Cargando tu perfil...</p> : error ? <p role="alert">{error}</p> : !listing ? <p>Publica tu perfil para crear enlaces de reserva. Al publicarlo, aparecerán aquí.</p> : <>
      <div className="social-links-fields"><label>Compartir en<select value={source} onChange={(event) => setSource(event.target.value)}><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="google">Google</option></select></label><label>Servicio<select value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Todos mis servicios</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <p className="social-links-context">{source === 'instagram' ? 'Colócalo en tu biografía o envíalo por mensaje.' : source === 'facebook' ? 'Úsalo en tu página, publicaciones o mensajes.' : 'Compártelo en tu perfil de Google.'}</p>
      <div className="social-links-url" title={url}>{url}</div>
      {window.location.hostname !== 'studioflow.vip' && <p className="social-links-preview-note">Esta versión está en pruebas. Publica la actualización antes de compartir el enlace: la página pública actual todavía no distingue estos canales.</p>}
      <div className="social-links-actions"><button type="button" onClick={() => navigator.clipboard.writeText(url).then(() => setNotice('Enlace copiado.')).catch(() => setNotice('No se pudo copiar.'))}><Copy size={18} /> Copiar enlace</button><button type="button" onClick={share}><Share2 size={18} /> Compartir</button><a href={url} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Ver página</a></div>
      <small>Se contarán las reservas hechas con este enlace; no podemos comprobar desde qué aplicación lo abrió la clienta.</small>
      {notice && <p role="status">{notice}</p>}
    </>}
  </section>
}
