import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const resendKey = Deno.env.get('RESEND_API_KEY') || ''
const sender = Deno.env.get('CAMPAIGN_FROM_EMAIL') || 'Studio Flow <no-reply@studioflow.vip>'
const siteUrl = (Deno.env.get('SITE_URL') || 'https://studioflow.vip').replace(/\/$/, '')
const studioFlowLogo = `${siteUrl}/studioflow-email-logo.png`
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function publicImageUrl(value: unknown) {
  const image = String(value ?? '').trim()
  if (/^https:\/\//i.test(image)) return image
  if (image.startsWith('/')) return `${siteUrl}${image}`
  return ''
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  let participantId = ''
  try {
    if (!resendKey) throw new Error('RESEND_API_KEY is not configured')
    const payload = await request.json()
    participantId = payload?.participantId || ''
    const deliveryToken = payload?.deliveryToken || ''
    if (!participantId || !deliveryToken) return json({ error: 'Missing delivery credentials' }, 400)

    const { data: participant, error } = await admin
      .from('campaign_participants')
      .update({ confirmation_email_status: 'sending', confirmation_email_error: null })
      .eq('id', participantId)
      .eq('email_delivery_token', deliveryToken)
      .in('confirmation_email_status', ['pending', 'failed'])
      .select('id,email,full_name,folio,campaign_id')
      .maybeSingle()
    if (error) throw error
    if (!participant) return json({ ok: true, skipped: 'already_processed' })

    const { data: campaign, error: campaignError } = await admin
      .from('registration_campaigns')
      .select('name,event_name,image_url,studio_id,artist_id,studios(name,studio_profiles(commercial_name,logo_path)),artists(display_name,artist_profiles(artistic_name,photo_path))')
      .eq('id', participant.campaign_id)
      .single()
    if (campaignError) throw campaignError

    const studioProfile = campaign?.studios?.studio_profiles?.[0]
    const artistProfile = campaign?.artists?.artist_profiles?.[0]
    const studioName = studioProfile?.commercial_name
      || campaign?.studios?.name
      || artistProfile?.artistic_name
      || campaign?.artists?.display_name
      || 'Studio Flow'
    const campaignLogo = publicImageUrl(campaign?.image_url || studioProfile?.logo_path || artistProfile?.photo_path)
    const campaignLogoHtml = campaignLogo
      ? `<tr><td align="center" style="padding:18px 28px 6px"><img src="${escapeHtml(campaignLogo)}" alt="${escapeHtml(studioName)}" width="150" style="display:block;width:150px;max-width:55%;height:auto;max-height:150px;object-fit:contain;border:0" /></td></tr>`
      : ''
    const emailHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f7f2f1;font-family:Arial,sans-serif;color:#2f2525"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f2f1"><tr><td align="center" style="padding:20px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #eadcdf;border-radius:8px"><tr><td align="center" style="padding:22px 28px 12px"><img src="${studioFlowLogo}" alt="Studio Flow" width="260" style="display:block;width:260px;max-width:88%;height:auto;border:0" /></td></tr>${campaignLogoHtml}<tr><td style="padding:16px 30px 30px"><h1 style="margin:0 0 18px;text-align:center;font-size:28px;line-height:1.2;color:#6b3d45">¡Ya estás participando!</h1><p style="margin:0 0 14px;font-size:16px;line-height:1.6">Hola ${escapeHtml(participant.full_name)}, gracias por visitar <strong>${escapeHtml(studioName)}</strong>.</p><p style="margin:0 0 18px;font-size:16px;line-height:1.6">Tu registro para <strong>${escapeHtml(campaign.name)}</strong> quedó confirmado.</p><div style="margin:22px 0;padding:22px;text-align:center;background:#f7eeee;border:1px solid #e5cfd2;border-radius:6px"><div style="font-size:13px;color:#78676a">Tu folio</div><div style="font-size:34px;line-height:1.3;font-weight:800;color:#6b3d45">${escapeHtml(participant.folio)}</div></div><p style="margin:0;font-size:15px;line-height:1.6;color:#6f6264">Guarda este correo o toma una captura de tu folio.</p></td></tr></table></td></tr></table></body></html>`
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender,
        to: [participant.email],
        subject: `Confirmación de participación - ${campaign.event_name}`,
        html: emailHtml,
      }),
    })
    const responseText = await response.text()
    if (!response.ok) throw new Error(`Resend HTTP ${response.status}: ${responseText.slice(0, 350)}`)
    await admin.from('campaign_participants').update({ confirmation_email_status: 'sent', confirmation_email_sent_at: new Date().toISOString(), confirmation_email_error: null }).eq('id', participant.id)
    return json({ ok: true })
  } catch (error) {
    const message = String(error?.message || 'Unexpected email error').slice(0, 500)
    if (participantId) await admin.from('campaign_participants').update({ confirmation_email_status: 'failed', confirmation_email_error: message }).eq('id', participantId)
    return json({ error: message }, 500)
  }
})
