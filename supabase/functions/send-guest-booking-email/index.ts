import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const resendKey = Deno.env.get('RESEND_API_KEY') || ''
const sender = Deno.env.get('CAMPAIGN_FROM_EMAIL') || 'Studio Flow <no-reply@studioflow.vip>'
const siteUrl = (Deno.env.get('SITE_URL') || 'https://studioflow.vip').replace(/\/$/, '')
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

async function getOne(table: string, columns: string, field: string, id: string) {
  const { data, error } = await admin.from(table).select(columns).eq(field, id).maybeSingle()
  if (error) throw error
  return data
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  let outboxId = ''
  let deliveryToken = ''
  try {
    const payload = await request.json()
    outboxId = String(payload?.outboxId || '')
    deliveryToken = String(payload?.deliveryToken || '')
    if (!outboxId || !deliveryToken) return json({ error: 'Missing delivery credentials' }, 400)

    const { data: row, error: rowError } = await admin
      .from('studio_flow_guest_booking_email_outbox')
      .select('id,appointment_id,recipient_email,status,attempts')
      .eq('id', outboxId).eq('delivery_token', deliveryToken).maybeSingle()
    if (rowError) throw rowError
    if (!row || row.status === 'sent' || row.status === 'skipped') return json({ ok: true, skipped: true })
    if (row.status === 'sending' || row.attempts >= 3) return json({ ok: true, skipped: true })

    const { data: claimed, error: claimError } = await admin
      .from('studio_flow_guest_booking_email_outbox')
      .update({ status: 'sending', attempts: row.attempts + 1, updated_at: new Date().toISOString(), last_error: null })
      .eq('id', outboxId).eq('delivery_token', deliveryToken)
      .in('status', ['pending', 'failed']).eq('attempts', row.attempts)
      .select('id,appointment_id,recipient_email').maybeSingle()
    if (claimError) throw claimError
    if (!claimed) return json({ ok: true, skipped: true })

    const appointment = await getOne('appointments',
      'id,status,starts_at,ends_at,client_id,artist_id,studio_id,service_offering_id',
      'id', claimed.appointment_id)
    if (!appointment || appointment.status !== 'scheduled') {
      await admin.from('studio_flow_guest_booking_email_outbox')
        .update({ status: 'skipped', updated_at: new Date().toISOString() }).eq('id', outboxId)
      return json({ ok: true, skipped: true })
    }
    const [guest, service] = await Promise.all([
      getOne('clients', 'display_name,profile_id', 'id', appointment.client_id),
      getOne('service_offerings', 'name', 'id', appointment.service_offering_id),
    ])
    if (!guest || guest.profile_id || !service) {
      await admin.from('studio_flow_guest_booking_email_outbox')
        .update({ status: 'skipped', updated_at: new Date().toISOString() }).eq('id', outboxId)
      return json({ ok: true, skipped: true })
    }
    let businessName = 'Studio Flow'
    let location = ''
    if (appointment.studio_id) {
      const [studio, profile] = await Promise.all([
        getOne('studios', 'name', 'id', appointment.studio_id),
        getOne('studio_profiles', 'commercial_name,address_line,city', 'studio_id', appointment.studio_id),
      ])
      businessName = profile?.commercial_name || studio?.name || businessName
      location = [profile?.address_line, profile?.city].filter(Boolean).join(', ')
    } else if (appointment.artist_id) {
      const [artist, profile] = await Promise.all([
        getOne('artists', 'display_name', 'id', appointment.artist_id),
        getOne('artist_profiles', 'artistic_name,address_line,city', 'artist_id', appointment.artist_id),
      ])
      businessName = profile?.artistic_name || artist?.display_name || businessName
      location = [profile?.address_line, profile?.city].filter(Boolean).join(', ')
    }
    const startsAt = new Date(appointment.starts_at)
    const date = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(startsAt)
    const time = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(startsAt)
    const registrationUrl = `${siteUrl}/register?tipo=client`
    const logoUrl = `${siteUrl}/studioflow-email-logo.png`
    const addressRow = location
      ? `<tr><td style="padding:9px 0;border-top:1px solid #eadcdf;color:#755d65;font-size:14px">Lugar</td><td style="padding:9px 0;border-top:1px solid #eadcdf;text-align:right;color:#30252b;font-size:14px">${escapeHtml(location)}</td></tr>`
      : ''
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f7f1f0;font-family:Arial,sans-serif;color:#30252b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f1f0"><tr><td align="center" style="padding:20px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #eadcdf;border-radius:8px"><tr><td align="center" style="padding:25px 22px 18px"><img src="${escapeHtml(logoUrl)}" alt="Studio Flow" width="260" style="display:block;max-width:88%;height:auto;border:0"></td></tr><tr><td style="padding:0 26px 28px"><div style="font-size:12px;font-weight:800;color:#985b6d;letter-spacing:1px">TU MOMENTO YA TIENE LUGAR</div><h1 style="margin:10px 0 16px;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#35262d">Tu cita te espera</h1><p style="font-size:16px;line-height:1.6">Hola ${escapeHtml(guest.display_name)}, <strong>${escapeHtml(businessName)}</strong> reservó un espacio para ti. Aquí tienes los detalles:</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;background:#fff8f7;border:1px solid #eadcdf;border-radius:6px"><tr><td style="padding:18px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:9px 0;color:#755d65;font-size:14px">Servicio</td><td style="padding:9px 0;text-align:right;font-weight:700">${escapeHtml(service.name)}</td></tr><tr><td style="padding:9px 0;border-top:1px solid #eadcdf;color:#755d65;font-size:14px">Día</td><td style="padding:9px 0;border-top:1px solid #eadcdf;text-align:right">${escapeHtml(date)}</td></tr><tr><td style="padding:9px 0;border-top:1px solid #eadcdf;color:#755d65;font-size:14px">Hora</td><td style="padding:9px 0;border-top:1px solid #eadcdf;text-align:right">${escapeHtml(time)}</td></tr>${addressRow}</table></td></tr></table><h2 style="margin:26px 0 8px;font-family:Georgia,serif;font-size:22px;color:#6b3d45">Que esta cita sea el comienzo de algo más</h2><p style="font-size:15px;line-height:1.6">Únete gratis a Studio Flow con este mismo correo para ver tu cita en tu perfil y recibir los FlowPoints que correspondan cuando se complete. También encontrarás beneficios, sorpresas y formas de cuidar de ti en tus próximas visitas.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:25px auto"><tr><td align="center" bgcolor="#f4ce72" style="border-radius:6px"><a href="${escapeHtml(registrationUrl)}" style="display:inline-block;padding:16px 25px;color:#30252b;font-size:16px;font-weight:800;text-decoration:none">Unirme a Studio Flow</a></td></tr></table><p style="font-size:13px;line-height:1.5;color:#755d65">Regístrate con la dirección a la que llegó este mensaje para vincular la cita. No necesitas hacer una nueva reserva.</p></td></tr></table><p style="max-width:540px;font-size:12px;line-height:1.5;color:#8b7a7d">Si no solicitaste esta cita, comunícate directamente con el negocio.</p></td></tr></table></body></html>`
    const plainText = `Hola ${guest.display_name}, ${businessName} reservó una cita para ti. Servicio: ${service.name}. Día: ${date}. Hora: ${time}.${location ? ` Lugar: ${location}.` : ''} Únete gratis a Studio Flow con este mismo correo para ver tu cita y recibir los FlowPoints que correspondan al completarla: ${registrationUrl}`

    if (!resendKey) throw new Error('RESEND_API_KEY is not configured')
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender, to: [claimed.recipient_email],
        subject: `Tu cita en ${businessName} ya está reservada`,
        html, text: plainText,
      }),
    })
    const responseText = await response.text()
    if (!response.ok) throw new Error(`Resend HTTP ${response.status}: ${responseText.slice(0, 350)}`)
    const { error: sentError } = await admin.from('studio_flow_guest_booking_email_outbox')
      .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null })
      .eq('id', outboxId)
    if (sentError) throw sentError
    return json({ ok: true })
  } catch (error) {
    const message = String(error?.message || 'Unexpected email error').slice(0, 500)
    if (outboxId && deliveryToken) {
      await admin.from('studio_flow_guest_booking_email_outbox')
        .update({ status: 'failed', last_error: message, updated_at: new Date().toISOString() })
        .eq('id', outboxId).eq('delivery_token', deliveryToken).eq('status', 'sending')
    }
    return json({ error: message }, 500)
  }
})
