function firstText(...values) {
  return values.find((value) => String(value || '').trim()) || ''
}

export function mapAuthContextToClientProfile(authContext = {}, currentProfile = {}) {
  const profile = authContext.profile || {}
  const client = authContext.client || {}
  const hasSupabaseIdentity = Boolean(profile.id || client.id)

  return {
    ...currentProfile,
    id: hasSupabaseIdentity ? firstText(client.id, profile.id) : firstText(currentProfile.id, client.id, profile.id),
    profileId: hasSupabaseIdentity ? firstText(profile.id) : firstText(currentProfile.profileId, profile.id),
    name: hasSupabaseIdentity
      ? firstText(client.display_name, client.displayName, profile.display_name, profile.displayName, client.email, profile.email)
      : firstText(currentProfile.name, client.display_name, client.displayName, profile.display_name, profile.displayName),
    email: hasSupabaseIdentity ? firstText(client.email, profile.email) : firstText(currentProfile.email, client.email, profile.email),
    phone: hasSupabaseIdentity ? firstText(client.phone, profile.phone) : firstText(currentProfile.phone, client.phone, profile.phone),
    birthday: firstText(currentProfile.birthday, authContext.clientProfile?.birthday, authContext.client_profile?.birthday),
    latitude: firstText(currentProfile.latitude, authContext.clientProfile?.latitude, authContext.client_profile?.latitude),
    longitude: firstText(currentProfile.longitude, authContext.clientProfile?.longitude, authContext.client_profile?.longitude),
    city: firstText(currentProfile.city, authContext.clientProfile?.city, authContext.client_profile?.city),
    state: firstText(currentProfile.state, authContext.clientProfile?.state, authContext.client_profile?.state),
    postalCode: firstText(currentProfile.postalCode, authContext.clientProfile?.postal_code, authContext.client_profile?.postal_code),
  }
}
