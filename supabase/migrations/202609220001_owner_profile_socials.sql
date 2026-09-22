begin;

alter table public.studio_profiles
  add column if not exists whatsapp text,
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists tiktok text;

create or replace function public.studio_flow_admin_update_artist_contact_links(
  p_artist_id uuid,
  p_contact_links jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_profile_before public.artist_profiles%rowtype;
  v_profile_after public.artist_profiles%rowtype;
begin
  v_context := public.studio_flow_admin_assert_can_manage_artist(p_artist_id);

  select *
  into v_profile_before
  from public.artist_profiles
  where artist_id = p_artist_id
  for update;

  if v_profile_before.id is null then
    raise exception 'Artist profile not found';
  end if;

  update public.artist_profiles
  set
    whatsapp = case when p_contact_links ? 'whatsapp' then nullif(trim(coalesce(p_contact_links ->> 'whatsapp', '')), '') else whatsapp end,
    instagram = case when p_contact_links ? 'instagram' then nullif(trim(coalesce(p_contact_links ->> 'instagram', '')), '') else instagram end,
    facebook = case when p_contact_links ? 'facebook' then nullif(trim(coalesce(p_contact_links ->> 'facebook', '')), '') else facebook end,
    tiktok = case when p_contact_links ? 'tiktok' then nullif(trim(coalesce(p_contact_links ->> 'tiktok', '')), '') else tiktok end,
    website = case when p_contact_links ? 'website' then nullif(trim(coalesce(p_contact_links ->> 'website', '')), '') else website end,
    updated_at = now()
  where artist_id = p_artist_id
  returning * into v_profile_after;

  insert into public.audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    artist_id,
    membership_id,
    event_type,
    before_data,
    after_data
  )
  values (
    (v_context ->> 'actor_profile_id')::uuid,
    'identity',
    'artist_profile',
    v_profile_after.id,
    nullif(v_context ->> 'studio_id', '')::uuid,
    p_artist_id,
    nullif(v_context ->> 'membership_id', '')::uuid,
    'admin_artist_contact_links_updated',
    to_jsonb(v_profile_before),
    to_jsonb(v_profile_after)
  );

  return public.studio_flow_admin_artist_payload(p_artist_id);
end;
$$;

revoke all on function public.studio_flow_admin_update_artist_contact_links(uuid, jsonb) from public, anon;
grant execute on function public.studio_flow_admin_update_artist_contact_links(uuid, jsonb) to authenticated;

do $migration$
declare
  d text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure) into d;

  if position('sp.whatsapp as studio_whatsapp,' in d) = 0 then
    if position('sp.phone as studio_phone,' in d) > 0 then
      d := replace(
        d,
        'sp.phone as studio_phone,',
        E'sp.phone as studio_phone,\n      sp.whatsapp as studio_whatsapp,\n      sp.instagram as studio_instagram,\n      sp.facebook as studio_facebook,\n      sp.tiktok as studio_tiktok,'
      );
    elsif position('sp.description as studio_description,' in d) > 0 then
      d := replace(
        d,
        'sp.description as studio_description,',
        E'sp.description as studio_description,\n      sp.whatsapp as studio_whatsapp,\n      sp.instagram as studio_instagram,\n      sp.facebook as studio_facebook,\n      sp.tiktok as studio_tiktok,'
      );
    else
      raise exception 'Unexpected marketplace studio profile projection';
    end if;
  end if;

  d := replace(d, '''whatsapp'', whatsapp,', '''whatsapp'', case when profile_type = ''studio'' then coalesce(studio_whatsapp, whatsapp) else whatsapp end,');
  d := replace(d, '''instagram'', instagram,', '''instagram'', case when profile_type = ''studio'' then coalesce(studio_instagram, instagram) else instagram end,');
  d := replace(d, '''facebook'', facebook,', '''facebook'', case when profile_type = ''studio'' then coalesce(studio_facebook, facebook) else facebook end,');
  d := replace(d, '''tiktok'', tiktok,', '''tiktok'', case when profile_type = ''studio'' then coalesce(studio_tiktok, tiktok) else tiktok end,');

  execute d;
end;
$migration$;

grant execute on function public.studio_flow_marketplace_get_listings() to anon, authenticated;

commit;
