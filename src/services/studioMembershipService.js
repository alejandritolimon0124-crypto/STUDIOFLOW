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

function normalizeStudioService(service = {}) {
  const durationMinutes = Number(service.durationMinutes || service.duration_minutes || 0)

  return {
    id: service.id,
    name: service.name || 'Servicio',
    description: service.description || '',
    category: service.category || 'Servicios',
    price: Number(service.price || service.priceAmount || service.price_amount || 0),
    durationMinutes,
    duration: durationMinutes ? `${durationMinutes} min` : '',
    status: service.status || 'draft',
    ownerType: service.ownerType || service.owner_type || 'membership',
    membershipId: service.membershipId || service.membership_id || null,
  }
}

function normalizeScheduleRule(rule = {}) {
  const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']
  const weekday = Number(rule.weekday)

  return {
    id: rule.id,
    weekday,
    day: weekdayLabels[weekday] || `Dia ${weekday}`,
    active: Boolean(rule.isActive ?? rule.is_active),
    startTime: rule.startTime || rule.start_time || '',
    endTime: rule.endTime || rule.end_time || '',
    breakStartTime: rule.breakStartTime || rule.break_start_time || '',
    breakEndTime: rule.breakEndTime || rule.break_end_time || '',
  }
}

function normalizeStudioSlot(slot = {}) {
  return {
    id: slot.id || slot.availabilitySlotId || slot.availability_slot_id,
    scheduleId: slot.scheduleId || slot.schedule_id || null,
    artistId: slot.artistId || slot.artist_id || null,
    studioId: slot.studioId || slot.studio_id || null,
    membershipId: slot.membershipId || slot.membership_id || null,
    startsAt: slot.startsAt || slot.starts_at || null,
    endsAt: slot.endsAt || slot.ends_at || null,
    date: slot.date || '',
    time: slot.time || '',
    end: slot.end || '',
    status: slot.status || 'available',
  }
}

function normalizeMembershipOperations(data = {}) {
  const schedule = data.schedule

  return {
    studioId: data.studioId || data.studio_id || null,
    membershipId: data.membershipId || data.membership_id || null,
    artistId: data.artistId || data.artist_id || null,
    services: asArray(data.services).map(normalizeStudioService),
    schedule: schedule
      ? {
          id: schedule.id || schedule.scheduleId || schedule.schedule_id,
          timezone: schedule.timezone || 'America/Mexico_City',
          intervalMinutes: Number(schedule.intervalMinutes || schedule.interval_minutes || 0),
          status: schedule.status || 'active',
          rules: asArray(schedule.rules).map(normalizeScheduleRule),
        }
      : null,
    upcomingSlots: asArray(data.upcomingSlots || data.upcoming_slots).map(normalizeStudioSlot),
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

export async function fetchStudioMembershipOperations({ studioId = null, membershipId = null } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_owner_get_membership_operations', {
    p_studio_id: studioId,
    p_membership_id: membershipId,
  })

  if (error) throw error

  return normalizeMembershipOperations(data)
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
