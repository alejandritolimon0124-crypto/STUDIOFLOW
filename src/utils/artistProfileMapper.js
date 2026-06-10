import { createArtistLocationSettings } from './locationHelpers'

function firstText(...values) {
  return values.find((value) => String(value || '').trim()) || ''
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
  const portfolioPaths = Array.isArray(artistProfile.portfolio_paths)
    ? artistProfile.portfolio_paths
    : Array.isArray(artistProfile.portfolioPaths)
      ? artistProfile.portfolioPaths
      : []

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
    },
    professionalProfile: {
      ...(currentProfile.professionalProfile || {}),
      primarySpecialty: specialties || currentProfile.professionalProfile?.primarySpecialty || '',
      specialties: specialties || currentProfile.professionalProfile?.specialties || '',
      shortBio: firstText(artistProfile.bio, artistProfile.shortBio, currentProfile.professionalProfile?.shortBio),
      experienceYears: currentProfile.professionalProfile?.experienceYears || '',
      paymentMethods: {
        ...(currentProfile.professionalProfile?.paymentMethods || {}),
      },
    },
    contactLinks: {
      ...(currentProfile.contactLinks || {}),
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
      customLocation: {
        ...(currentProfile.professionalLocation?.customLocation || {}),
        city: city || currentProfile.professionalLocation?.customLocation?.city || '',
      },
    }),
  }
}
