export const emptyProfessionalLocation = {
  businessName: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  address_references: '',
  latitude: '',
  longitude: '',
}

export const defaultArtistLocationSettings = {
  useStudioLocation: true,
  customLocation: emptyProfessionalLocation,
}

export function createProfessionalLocation(overrides = {}) {
  return {
    ...emptyProfessionalLocation,
    ...overrides,
  }
}

export function createArtistLocationSettings(overrides = {}) {
  return {
    ...defaultArtistLocationSettings,
    ...overrides,
    customLocation: createProfessionalLocation(overrides.customLocation),
  }
}

export function validateProfessionalLocation(location = {}) {
  const errors = {}

  if (!String(location.address || '').trim()) {
    errors.address = 'Agrega la direccion profesional.'
  }

  if (!String(location.city || '').trim()) {
    errors.city = 'Agrega la ciudad.'
  }

  if (!String(location.state || '').trim()) {
    errors.state = 'Agrega el estado.'
  }

  return errors
}

export function buildGoogleMapsQuery(location = {}) {
  return [
    location.address,
    location.city,
    location.state,
    location.postalCode,
  ]
    .filter(Boolean)
    .join(', ')
}

export function buildGoogleMapsUrl(location = {}) {
  const coordinates = location.latitude && location.longitude
    ? `${location.latitude},${location.longitude}`
    : ''
  const query = coordinates || buildGoogleMapsQuery(location)

  return query ? `https://maps.google.com/?q=${encodeURIComponent(query)}` : ''
}
