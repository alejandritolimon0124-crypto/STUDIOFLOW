import { createArtistLocationSettings } from './locationHelpers'

function firstText(...values) {
  return values.find((value) => String(value || '').trim()) || ''
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null)
}

function sourceText(source = {}, key) {
  if (Object.prototype.hasOwnProperty.call(source, key)) return String(source[key] || '')
  return ''
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

export function mapAuthContextToArtistProfile(authContext = {}, fallbackProfile = {}) {
  const profile = authContext.profile || {}
  const artist = authContext.artist || {}
  const artistProfile = getArtistProfileSource(authContext)
  const fallbackProfessionalProfile = fallbackProfile.professionalProfile || {}
  const fallbackPersonalInfo = fallbackProfile.personalInfo || {}
  const specialties = formatSpecialties(artistProfile.specialties || fallbackProfessionalProfile.specialties)
  const artisticName = firstText(
    artistProfile.artistic_name,
    artistProfile.artisticName,
    fallbackPersonalInfo.artisticName,
    artist.artistic_name,
    artist.artisticName,
    artist.display_name,
    artist.displayName,
    fallbackPersonalInfo.fullName,
    profile.display_name,
    profile.displayName,
  )
  const fullName = firstText(profile.display_name, profile.displayName, artist.display_name, artist.displayName, fallbackPersonalInfo.fullName)
  const email = firstText(profile.email, artist.email)
  const phone = firstText(profile.phone, artist.phone)
  const city = firstText(artistProfile.city, artist.city)
  const useStudioLocation = firstDefined(
    artistProfile.use_studio_location,
    artistProfile.useStudioLocation,
    true,
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
    artistId: artistProfile.artist_id || artistProfile.artistId || artist.id || artist.artistId || null,
    artistProfileId: artistProfile.id || artistProfile.artistProfileId || null,
    registration: {
      studioStatus: 'pending',
    },
    personalInfo: {
      artisticName,
      fullName,
      phone,
      email,
      birthday: firstText(artistProfile.birthday, artistProfile.birthDate, fallbackPersonalInfo.birthday),
    },
    professionalProfile: {
      primarySpecialty: firstText(
        artistProfile.primary_specialty,
        artistProfile.primarySpecialty,
        fallbackProfessionalProfile.primarySpecialty,
        specialties,
      ),
      specialties,
      shortBio: firstText(artistProfile.bio, artistProfile.shortBio, fallbackProfessionalProfile.shortBio),
      experienceYears: firstText(
        artistProfile.years_experience,
        artistProfile.yearsExperience,
        fallbackProfessionalProfile.experienceYears,
      ),
      paymentMethods,
    },
    contactLinks: {
      whatsapp: sourceText(artistProfile, 'whatsapp'),
      instagram: sourceText(artistProfile, 'instagram'),
      facebook: sourceText(artistProfile, 'facebook'),
      tiktok: sourceText(artistProfile, 'tiktok'),
      website: sourceText(artistProfile, 'website'),
    },
    photoUrl: firstText(artistProfile.photo_url, artistProfile.photoUrl, artistProfile.photo_path, artistProfile.photoPath, fallbackProfile.photoUrl),
    studioPhotoUrls: artistProfile.studio_photo_paths && typeof artistProfile.studio_photo_paths === 'object'
      ? artistProfile.studio_photo_paths
      : artistProfile.studioPhotoUrls && typeof artistProfile.studioPhotoUrls === 'object'
        ? artistProfile.studioPhotoUrls
        : fallbackProfile.studioPhotoUrls && typeof fallbackProfile.studioPhotoUrls === 'object'
          ? fallbackProfile.studioPhotoUrls
          : {},
    portfolio: portfolioPaths.length > 0
      ? portfolioPaths.slice(0, 12).map((path, index) => ({
          id: `artist-profile-portfolio-${index + 1}`,
          label: `Portfolio ${index + 1}`,
          url: path,
        }))
      : [],
    security: {
      email,
    },
    professionalLocation: createArtistLocationSettings({
      useStudioLocation,
      customLocation: {
        address: firstText(
          artistProfile.address_line,
          artistProfile.addressLine,
        ),
        city,
        state: firstText(artistProfile.state),
        postalCode: firstText(
          artistProfile.postal_code,
          artistProfile.postalCode,
        ),
        address_references: firstText(
          artistProfile.address_references,
          artistProfile.addressReferences,
        ),
        latitude: firstText(artistProfile.latitude),
        longitude: firstText(artistProfile.longitude),
        googleMapsUrl: firstText(
          artistProfile.google_maps_url,
          artistProfile.googleMapsUrl,
        ),
      },
    }),
  }
}
