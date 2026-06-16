import { requireSupabase } from '../lib/supabaseClient'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeMembership(membership = {}) {
  return {
    id: membership.id || membership.membershipId || membership.membership_id,
    membershipId: membership.membershipId || membership.membership_id || membership.id,
    artistId: membership.artistId || membership.artist_id || null,
    profileId: membership.profileId || membership.profile_id || null,
    name: membership.name || 'Artista',
    email: membership.email || '',
    photoUrl: membership.photoUrl || membership.photo_url || '',
    role: membership.role || 'artist',
    status: membership.status || 'pending',
    startedAt: membership.startedAt || membership.started_at || null,
    createdAt: membership.createdAt || membership.created_at || null,
    active: Boolean(membership.active),
  }
}

function normalizeInvitation(invitation = {}) {
  return {
    id: invitation.id,
    token: invitation.token || '',
    artistId: invitation.artistId || invitation.artist_id || null,
    membershipId: invitation.membershipId || invitation.membership_id || null,
    invitedEmail: invitation.invitedEmail || invitation.invited_email || '',
    artistName: invitation.artistName || invitation.artist_name || '',
    status: invitation.status || 'pending',
    createdAt: invitation.createdAt || invitation.created_at || null,
    expiresAt: invitation.expiresAt || invitation.expires_at || null,
  }
}

function normalizeArtistCandidate(artist = {}) {
  return {
    id: artist.id || artist.artistId || artist.artist_id,
    artistId: artist.artistId || artist.artist_id || artist.id,
    profileId: artist.profileId || artist.profile_id || null,
    name: artist.name || 'Artista',
    email: artist.email || '',
    photoUrl: artist.photoUrl || artist.photo_url || '',
    city: artist.city || '',
    status: artist.status || 'active',
    membershipStatus: artist.membershipStatus || artist.membership_status || '',
    alreadyMember: Boolean(artist.alreadyMember || artist.already_member),
  }
}

function normalizePayload(data = {}) {
  return {
    studioId: data.studioId || data.studio_id || null,
    memberships: asArray(data.memberships).map(normalizeMembership),
    invitations: asArray(data.invitations).map(normalizeInvitation),
    artistCandidates: asArray(data.artistCandidates || data.artist_candidates).map(normalizeArtistCandidate),
    lastInvitation: data.lastInvitation || data.last_invitation
      ? normalizeInvitation(data.lastInvitation || data.last_invitation)
      : null,
  }
}

export async function fetchStudioMemberships(studioId = null) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_owner_get_studio_memberships', {
    p_studio_id: studioId,
  })

  if (error) throw error

  return normalizePayload(data)
}

export async function findStudioArtistByEmail({ studioId = null, email = '' } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_owner_find_artist_by_email', {
    p_studio_id: studioId,
    p_email: email || null,
  })

  if (error) throw error

  return data?.artist ? normalizeArtistCandidate(data.artist) : null
}

export async function inviteStudioArtist({ studioId = null, email = '', artistId = null } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_owner_invite_artist', {
    p_studio_id: studioId,
    p_invited_email: email || null,
    p_artist_id: artistId || null,
  })

  if (error) throw error

  return normalizePayload(data)
}

export async function cancelStudioArtistInvitation(invitationId) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_owner_cancel_artist_invitation', {
    p_invitation_id: invitationId,
  })

  if (error) throw error

  return normalizePayload(data)
}
