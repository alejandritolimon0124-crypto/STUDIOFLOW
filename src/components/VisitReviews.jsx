import { useEffect, useState } from 'react'
import { MessageSquareText, Star } from 'lucide-react'
import Button from './Button'
import { fetchVisitReviews, reviewHighlights, saveVisitReview } from '../services/visitReviewService'
import './visit-reviews.css'

export function ReviewStars({ rating = 0, onChange = null }) {
  return <div className={`review-stars${onChange ? ' is-editable' : ''}`} aria-label={`${rating} de 5 estrellas`}>
    {onChange && <button type="button" className="review-zero" aria-label="Cero estrellas" aria-pressed={rating === 0} onClick={() => onChange(0)}>0</button>}
    {[1, 2, 3, 4, 5].map((value) => onChange
      ? <button type="button" key={value} aria-label={`${value} estrellas`} aria-pressed={rating === value} onClick={() => onChange(value)}><Star size={25} fill={value <= rating ? 'currentColor' : 'none'} /></button>
      : <Star key={value} size={15} fill={value <= rating ? 'currentColor' : 'none'} />)}
  </div>
}

export function VisitReviewEditor({ appointment, existing, clientPhoto, clientName, onSaved }) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [highlights, setHighlights] = useState(existing?.highlights || [])
  const [body, setBody] = useState(existing?.body || '')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  const toggleHighlight = (phrase) => setHighlights((current) => current.includes(phrase)
    ? current.filter((item) => item !== phrase) : [...current, phrase])

  const save = async () => {
    setBusy(true)
    setFeedback('')
    try {
      const saved = await saveVisitReview({ appointmentId: appointment.id, rating, highlights, body: body.trim() })
      onSaved(saved)
      setOpen(false)
    } catch (error) {
      setFeedback(error.message || 'No se pudo guardar tu reseña.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="visit-review-editor">
    <button type="button" className="visit-review-open" onClick={() => setOpen((value) => !value)}><MessageSquareText size={18} aria-hidden="true" /> {open ? 'Cerrar reseña' : existing ? 'Editar mi reseña' : 'Escribir reseña'}</button>
    {open && <div className="visit-review-form">
      <div className="visit-review-author">{clientPhoto ? <img src={clientPhoto} alt="Tu foto de perfil" /> : <span>{clientName?.slice(0, 1) || 'C'}</span>}<strong>{clientName || 'Mi reseña'}</strong></div>
      <small>Tu primer nombre y foto de perfil aparecerán con esta reseña.</small>
      <label className="visit-review-label">¿Cómo fue tu visita?</label>
      <ReviewStars rating={rating} onChange={setRating} />
      <div className="visit-review-highlights" aria-label="Frases para tu reseña">{reviewHighlights.map((phrase) => <button type="button" key={phrase} aria-pressed={highlights.includes(phrase)} onClick={() => toggleHighlight(phrase)}>{phrase}</button>)}</div>
      <label className="visit-review-label" htmlFor={`review-${appointment.id}`}>Cuéntanos tu experiencia</label>
      <textarea id={`review-${appointment.id}`} maxLength={1000} rows={4} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Tu reseña" />
      {feedback && <small role="alert">{feedback}</small>}
      <Button disabled={busy || (!body.trim() && highlights.length === 0)} onClick={save}>{busy ? 'Guardando...' : 'Publicar reseña'}</Button>
    </div>}
  </div>
}

export function MarketplaceVisitReviews({ artistId, studioId, membershipId }) {
  const [data, setData] = useState({ count: 0, average: 0, reviews: [] })
  const [open, setOpen] = useState(false)
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reviewTargetId = artistId || studioId
  const validTarget = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewTargetId || '')

  useEffect(() => {
    if (!validTarget) return undefined
    let active = true
    const refresh = () => fetchVisitReviews({ artistId, studioId, membershipId, offset: 0 })
      .then((result) => { if (active) { setData(result); setOffset(0) } })
      .catch(() => { if (active) setError('No se pudieron cargar las reseñas.') })
    refresh()
    window.addEventListener('studio-flow-review-saved', refresh)
    return () => { active = false; window.removeEventListener('studio-flow-review-saved', refresh) }
  }, [artistId, studioId, membershipId, validTarget])

  const changePage = async (nextOffset) => {
    setBusy(true)
    setError('')
    try {
      const result = await fetchVisitReviews({ artistId, studioId, membershipId, offset: nextOffset })
      setData(result)
      setOffset(nextOffset)
    } catch (requestError) {
      setError(requestError.message || 'No se pudieron cargar las reseñas.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="marketplace-review-area">
    <div className="marketplace-review-top">
      <div className="marketplace-review-rating"><ReviewStars rating={Math.round(Number(data.average) || 0)} /><strong>{data.count ? `${data.average} (${data.count})` : 'Sin reseñas'}</strong></div>
    </div>
    <button className="marketplace-review-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Ocultar reseñas' : 'Ver reseñas'}</button>
    {open && <div className="marketplace-review-list">{data.reviews.length ? data.reviews.map((review) => <article key={review.id}>
      <div className="marketplace-review-person">{review.clientPhoto ? <img src={review.clientPhoto} alt={`Foto de ${review.clientName}`} /> : <span>{review.clientName?.slice(0, 1) || 'C'}</span>}<div><strong>{review.clientName || 'Clienta'}</strong><small>{new Date(review.createdAt).toLocaleDateString('es-MX')}</small></div><ReviewStars rating={review.rating} /></div>
      {review.highlights?.length > 0 && <div className="marketplace-review-phrases">{review.highlights.map((phrase) => <span key={phrase}>{phrase}</span>)}</div>}
      {review.body && <p>{review.body}</p>}
    </article>) : <p>Aún no hay reseñas de visitas completadas.</p>}
      {data.count > 5 && <div className="marketplace-review-pages"><button type="button" disabled={busy || offset === 0} onClick={() => changePage(Math.max(0, offset - 5))}>Anterior</button><span>{Math.floor(offset / 5) + 1} de {Math.ceil(data.count / 5)}</span><button type="button" disabled={busy || offset + 5 >= data.count} onClick={() => changePage(offset + 5)}>Siguiente</button></div>}
      {error && <small role="alert">{error}</small>}
    </div>}
  </div>
}
