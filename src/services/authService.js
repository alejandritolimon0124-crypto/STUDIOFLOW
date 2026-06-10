import { requireSupabase, supabase } from '../lib/supabaseClient'

function getAuthRedirectUrl(path = '/reset-password') {
  return `${window.location.origin}${path}`
}

export function hasSupabaseAuth() {
  return Boolean(supabase)
}

export async function getCurrentAuthSession() {
  if (!supabase) return null

  const { data, error } = await supabase.auth.getSession()

  if (error) throw error

  return data.session
}

export function onAuthStateChange(callback) {
  if (!supabase) return { unsubscribe: () => {} }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })

  return data.subscription
}

export async function signInWithPassword({ email, password }) {
  const client = requireSupabase()
  const { data, error } = await client.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password,
  })

  if (error) throw error

  return data
}

export async function signUpWithPassword({ email, password, displayName, phone, defaultRole, metadata = {} }) {
  const client = requireSupabase()
  const payload = {
    email: String(email || '').trim().toLowerCase(),
    password,
    options: {
      data: {
        display_name: displayName,
        phone,
        default_role: defaultRole,
        ...metadata,
      },
    },
  }

  console.log('SIGNUP PAYLOAD', payload)

  const { data, error } = await client.auth.signUp(payload)

  console.log('SIGNUP RESPONSE', { data, error })

  if (error) throw error

  return data
}

export async function signOut() {
  if (!supabase) return

  const { error } = await supabase.auth.signOut()

  if (error) throw error
}

export async function sendPasswordReset(email) {
  const client = requireSupabase()
  const { error } = await client.auth.resetPasswordForEmail(
    String(email || '').trim().toLowerCase(),
    { redirectTo: getAuthRedirectUrl('/reset-password') },
  )

  if (error) throw error
}

export async function updatePassword(password) {
  const client = requireSupabase()
  const { data, error } = await client.auth.updateUser({ password })

  if (error) throw error

  return data
}
