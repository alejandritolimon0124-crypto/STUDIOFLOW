function asArray(value) {
  return Array.isArray(value) ? value : []
}

function byId(items, id) {
  if (!id) return null

  return asArray(items).find((item) => item?.id === id) || null
}

function getSessionProfileId(session = {}) {
  return session.profileId || session.user?.profileId || session.user?.id || null
}

function getSessionArtistId(session = {}) {
  return session.artistId || session.user?.artistId || null
}

export function deriveMembershipsFromLegacyData({ artists = [] } = {}) {
  return asArray(artists)
    .filter((artist) => artist?.id && artist?.studioId)
    .map((artist) => ({
      id: `membership-${artist.id}-${artist.studioId}`,
      artistId: artist.id,
      studioId: artist.studioId,
      role: 'artist',
      status: 'active',
      source: 'legacy-artist-studioId',
    }))
}

export function getCurrentProfile({ session, profiles = [] } = {}) {
  const profileId = getSessionProfileId(session)

  return byId(profiles, profileId)
}

export function getCurrentArtist({ session, profiles = [], artists = [] } = {}) {
  const explicitArtist = byId(artists, getSessionArtistId(session))
  if (explicitArtist) return explicitArtist

  const currentProfile = getCurrentProfile({ session, profiles })
  if (!currentProfile) return null

  return asArray(artists).find((artist) => artist?.profileId === currentProfile.id) || null
}

export function getMembershipForArtist({
  artistId,
  studioId,
  artistStudioMemberships = [],
} = {}) {
  if (!artistId) return null

  return asArray(artistStudioMemberships).find((membership) => (
    membership?.artistId === artistId
    && (!studioId || membership.studioId === studioId)
    && membership.status !== 'inactive'
    && membership.status !== 'archived'
  )) || null
}

export function getStudiosForArtist({
  artistId,
  studios = [],
  artistStudioMemberships = [],
} = {}) {
  if (!artistId) return []

  const studioIds = asArray(artistStudioMemberships)
    .filter((membership) => (
      membership?.artistId === artistId
      && membership.status !== 'inactive'
      && membership.status !== 'archived'
    ))
    .map((membership) => membership.studioId)

  return asArray(studios).filter((studio) => studioIds.includes(studio?.id))
}

export function getStudioForArtist({
  artistId,
  studios = [],
  artistStudioMemberships = [],
  preferredStudioId,
} = {}) {
  if (!artistId) return null

  const artistStudios = getStudiosForArtist({
    artistId,
    studios,
    artistStudioMemberships,
  })

  if (preferredStudioId) {
    const preferredStudio = artistStudios.find((studio) => studio.id === preferredStudioId)
    if (preferredStudio) return preferredStudio
  }

  return artistStudios[0] || null
}

export function getArtistsForStudio({
  studioId,
  artists = [],
  artistStudioMemberships = [],
} = {}) {
  if (!studioId) return []

  const artistIds = asArray(artistStudioMemberships)
    .filter((membership) => (
      membership?.studioId === studioId
      && membership.status !== 'inactive'
      && membership.status !== 'archived'
    ))
    .map((membership) => membership.artistId)

  return asArray(artists).filter((artist) => artistIds.includes(artist?.id))
}

export function getCurrentStudio({
  session,
  profiles = [],
  studios = [],
  artists = [],
  artistStudioMemberships = [],
  activeStudioId,
} = {}) {
  if (activeStudioId) {
    const activeStudio = byId(studios, activeStudioId)
    if (activeStudio) return activeStudio
  }

  const currentProfile = getCurrentProfile({ session, profiles })
  const ownedStudio = currentProfile
    ? asArray(studios).find((studio) => studio?.ownerProfileId === currentProfile.id)
    : null
  if (ownedStudio) return ownedStudio

  const currentArtist = getCurrentArtist({ session, profiles, artists })
  if (!currentArtist) return null

  return getStudioForArtist({
    artistId: currentArtist.id,
    studios,
    artistStudioMemberships,
  })
}
