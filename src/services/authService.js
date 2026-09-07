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

export async function signInWithGoogle() {
  const client = requireSupabase()
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthRedirectUrl('/login'),
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
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
      emailRedirectTo: getAuthRedirectUrl('/login'),
      data: {
        display_name: displayName,
        phone,
        default_role: defaultRole,
        ...metadata,
      },
    },
  }

  const { data, error } = await client.auth.signUp(payload)

  if (error) throw error

  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('No se pudo completar un registro nuevo con este correo. Si ya tienes cuenta, inicia sesion o restablece tu contraseña.')
  }

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
