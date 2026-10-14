import { buildGoogleMapsUrl } from './locationHelpers'

export function shareBusinessLocation({ businessName, location, fallbackAddress = '', studio = false }) {
  const normalizedLocation = {
    ...location,
    address: location?.address || location?.addressLine || fallbackAddress,
  }
  const mapsUrl = buildGoogleMapsUrl(normalizedLocation)
  if (!mapsUrl) return false

  const place = studio ? 'mi estudio' : 'mi espacio de belleza'
  const message = `¡Te invito a conocer ${place}, ${businessName}! Será un honor recibirte. En este enlace puedes abrir la ruta directa en Google Maps:\n${mapsUrl}\n\n¡Te espero!`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
  const opened = window.open(whatsappUrl, '_blank')
  if (opened) opened.opener = null
  if (!opened) window.location.assign(whatsappUrl)
  return true
}
