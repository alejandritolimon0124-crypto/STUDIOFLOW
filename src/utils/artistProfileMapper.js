import { createArtistLocationSettings } from './locationHelpers'

function firstText(...values) {
  return values.find((value) => String(value || '').trim()) || ''
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null)
}

function sourceText(source = {}, key, fallback = '') {
  if (Object.prototype.hasOwnProperty.call(source, key)) return String(source[key] || '')
  return fallback
}

function formatSpecialties(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  return String(value || '')
}

function getArtistProfileSource(authContext = {}) {
  return authContext.artistProfile
    || authContext.artist_profile
    || authContext.artist?.profile
    || authContext.artist?.artist_profile
    || {}
}

export function mapAuthContextToArtistProfile(authContext = {}, currentProfile = {}) {
  const profile = authContext.profile || {}
  const artist = authContext.artist || {}
  const artistProfile = getArtistProfileSource(authContext)
  const specialties = formatSpecialties(artistProfile.specialties)
  const artisticName = firstText(
    artistProfile.artistic_name,
    artistProfile.artisticName,
    artist.artistic_name,
    artist.artisticName,
    artist.display_name,
    artist.displayName,
    profile.display_name,
    profile.displayName,
  )
  const fullName = firstText(profile.display_name, profile.displayName, artist.display_name, artist.displayName)
  const email = firstText(profile.email, artist.email)
  const phone = firstText(profile.phone, artist.phone)
  const city = firstText(artistProfile.city, artist.city)
  const useStudioLocation = firstDefined(
    artistProfile.use_studio_location,
    artistProfile.useStudioLocation,
    currentProfile.professionalLocation?.useStudioLocation,
  )
  const portfolioPaths = Array.isArray(artistProfile.portfolio_paths)
    ? artistProfile.portfolio_paths
    : Array.isArray(artistProfile.portfolioPaths)
      ? artistProfile.portfolioPaths
      : []
  const paymentMethods = artistProfile.payment_methods && typeof artistProfile.payment_methods === 'object'
    ? artistProfile.payment_methods
    : artistProfile.paymentMethods && typeof artistProfile.paymentMethods === 'object'
      ? artistProfile.paymentMethods
      : {}

  return {
    ...currentProfile,
    registration: {
      ...(currentProfile.registration || {}),
      studioStatus: currentProfile.registration?.studioStatus || 'pending',
    },
    personalInfo: {
      ...(currentProfile.personalInfo || {}),
      artisticName,
      fullName,
      phone,
      email,
      birthday: firstText(artistProfile.birthday, artistProfile.birthDate, currentProfile.personalInfo?.birthday),
    },
    professionalProfile: {
      ...(currentProfile.professionalProfile || {}),
      primarySpecialty: firstText(
        artistProfile.primary_specialty,
        artistProfile.primarySpecialty,
        currentProfile.professionalProfile?.primarySpecialty,
        specialties,
      ),
      specialties: specialties || currentProfile.professionalProfile?.specialties || '',
      shortBio: firstText(artistProfile.bio, artistProfile.shortBio, currentProfile.professionalProfile?.shortBio),
      experienceYears: firstText(
        artistProfile.years_experience,
        artistProfile.yearsExperience,
        currentProfile.professionalProfile?.experienceYears,
      ),
      paymentMethods: {
        ...(currentProfile.professionalProfile?.paymentMethods || {}),
        ...paymentMethods,
      },
    },
    contactLinks: {
      ...(currentProfile.contactLinks || {}),
      whatsapp: sourceText(artistProfile, 'whatsapp', currentProfile.contactLinks?.whatsapp || ''),
      instagram: sourceText(artistProfile, 'instagram', currentProfile.contactLinks?.instagram || ''),
      facebook: sourceText(artistProfile, 'facebook', currentProfile.contactLinks?.facebook || ''),
      tiktok: sourceText(artistProfile, 'tiktok', currentProfile.contactLinks?.tiktok || ''),
      website: sourceText(artistProfile, 'website', currentProfile.contactLinks?.website || ''),
    },
    photoUrl: firstText(artistProfile.photo_url, artistProfile.photoUrl, artistProfile.photo_path, artistProfile.photoPath, currentProfile.photoUrl),
    portfolio: portfolioPaths.length > 0
      ? portfolioPaths.slice(0, 12).map((path, index) => ({
          id: `artist-profile-portfolio-${index + 1}`,
          label: `Portfolio ${index + 1}`,
          url: path,
        }))
      : Array.isArray(currentProfile.portfolio)
        ? currentProfile.portfolio
        : [],
    security: {
      ...(currentProfile.security || {}),
      email,
    },
    professionalLocation: createArtistLocationSettings({
      ...(currentProfile.professionalLocation || {}),
      useStudioLocation,
      customLocation: {
        ...(currentProfile.professionalLocation?.customLocation || {}),
        address: firstText(
          artistProfile.address_line,
          artistProfile.addressLine,
          currentProfile.professionalLocation?.customLocation?.address,
        ),
        city: city || currentProfile.professionalLocation?.customLocation?.city || '',
        state: firstText(artistProfile.state, currentProfile.professionalLocation?.customLocation?.state),
        postalCode: firstText(
          artistProfile.postal_code,
          artistProfile.postalCode,
          currentProfile.professionalLocation?.customLocation?.postalCode,
        ),
        address_references: firstText(
          artistProfile.address_references,
          artistProfile.addressReferences,
          currentProfile.professionalLocation?.customLocation?.address_references,
        ),
        latitude: firstText(artistProfile.latitude, currentProfile.professionalLocation?.customLocation?.latitude),
        longitude: firstText(artistProfile.longitude, currentProfile.professionalLocation?.customLocation?.longitude),
        googleMapsUrl: firstText(
          artistProfile.google_maps_url,
          artistProfile.googleMapsUrl,
          currentProfile.professionalLocation?.customLocation?.googleMapsUrl,
        ),
      },
    }),
  }
}
