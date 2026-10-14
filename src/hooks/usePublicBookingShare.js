import { useEffect, useState } from 'react'
import { fetchPublicBookingListings } from '../services/publicBookingService'
import { publicBookingUrl } from '../utils/publicBookingLinks'

export default function usePublicBookingShare({ artistId, studioId, businessName }) {
  const [result, setResult] = useState(null)
  const [feedback, setFeedback] = useState('')
  const key = studioId ? `studio:${studioId}` : artistId ? `artist:${artistId}` : ''
  const listing = result?.key === key ? result.listing : null
  const loading = Boolean(key) && result?.key !== key

  useEffect(() => {
    if (!key) return undefined
    let active = true

    fetchPublicBookingListings()
      .then((items) => {
        if (!active) return
        const found = items.find((item) => studioId
          ? item.studioId === studioId && item.profileType === 'studio'
          : item.artistId === artistId && item.profileType !== 'studio' && !item.studioId)
        setResult({ key, listing: found || null })
        if (!found) setFeedback('Publica tu perfil para compartir tu agenda. Al publicarlo, aparecerá aquí tu enlace.')
      })
      .catch(() => {
        if (active) {
          setResult({ key, listing: null })
          setFeedback('No pudimos cargar tu enlace de reserva. Intenta de nuevo más tarde.')
        }
      })

    return () => { active = false }
  }, [artistId, studioId, key])

  const share = async () => {
    if (!listing) return
    const url = publicBookingUrl(listing)
    const shareData = {
      title: `Agenda con ${businessName || listing.title || listing.name}`,
      text: `Elige tu servicio y horario con ${businessName || listing.title || listing.name} en Studio Flow. Puedes abrir el enlace sin iniciar sesión.`,
      url,
    }

    try {
      if (navigator.share) await navigator.share(shareData)
      else {
        await navigator.clipboard.writeText(`${shareData.text} ${url}`)
        setFeedback('Enlace de reserva copiado. Ya puedes enviarlo por WhatsApp.')
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setFeedback('No se pudo compartir el enlace. Intenta de nuevo.')
    }
  }

  return { share, feedback, loading, available: Boolean(listing) }
}
