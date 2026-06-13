create or replace function public.studio_flow_admin_assert_platform_owner()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_is_platform_owner boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select exists (
    select 1
    from user_role_assignments ura
    join roles r on r.id = ura.role_id
    where ura.profile_id = v_profile.id
      and ura.status = 'active'
      and r.code = 'platform_owner'
  ) or v_profile.default_role = 'platform_owner'
  into v_is_platform_owner;

  if not v_is_platform_owner then
    raise exception 'Platform owner role required';
  end if;

  return jsonb_build_object(
    'actor_profile_id', v_profile.id,
    'is_platform_owner', true
  );
end;
$$;

create or replace function public.studio_flow_admin_governance_payload(
  p_studio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'studio', jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'studioStatus', s.studio_status,
          'studio_status', s.studio_status,
          'riskScore', s.risk_score,
          'createdAt', s.created_at,
          'created_at', s.created_at,
          'approvedAt', s.approved_at,
          'approved_at', s.approved_at,
          'suspendedAt', s.suspended_at,
          'suspended_at', s.suspended_at,
          'archivedAt', s.archived_at,
          'archived_at', s.archived_at,
          'profile', jsonb_build_object(
            'commercialName', coalesce(sp.commercial_name, s.name),
            'commercial_name', coalesce(sp.commercial_name, s.name),
            'description', sp.description,
            'email', sp.email,
            'phone', sp.phone,
            'addressLine', sp.address_line,
            'address_line', sp.address_line,
            'city', sp.city,
            'logoPath', sp.logo_path,
            'logo_path', sp.logo_path
          )
        ),
        'latestReview', case when gr.id is null then null else jsonb_build_object(
          'id', gr.id,
          'reviewType', gr.review_type,
          'review_type', gr.review_type,
          'status', gr.status,
          'reason', gr.reason,
          'decisionNotes', gr.decision_notes,
          'decision_notes', gr.decision_notes,
          'reviewedByProfileId', gr.reviewed_by_profile_id,
          'reviewed_by_profile_id', gr.reviewed_by_profile_id,
          'createdAt', gr.created_at,
          'created_at', gr.created_at,
          'resolvedAt', gr.resolved_at,
          'resolved_at', gr.resolved_at
        ) end,
        'artists', coalesce(artists_payload.artists, '[]'::jsonb),
        'activeServiceCount', coalesce(services_payload.active_service_count, 0),
        'active_service_count', coalesce(services_payload.active_service_count, 0),
        'marketplace', jsonb_build_object(
          'profiles', coalesce(marketplace_payload.profiles, '[]'::jsonb),
          'listings', coalesce(marketplace_payload.listings, '[]'::jsonb)
        )
      )
      order by
        case s.studio_status
          when 'pending' then 1
          when 'suspended' then 2
          when 'rejected' then 3
          when 'approved' then 4
          else 5
        end,
        s.created_at desc
    ),
    '[]'::jsonb
  )
  into v_queue
  from studios s
  left join studio_profiles sp on sp.studio_id = s.id
  left join lateral (
    select *
    from governance_reviews gr
    where gr.studio_id = s.id
    order by coalesce(gr.resolved_at, gr.created_at) desc, gr.created_at desc
    limit 1
  ) gr on true
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'name', coalesce(ap.artistic_name, a.display_name),
          'status', a.status,
          'membershipId', asm.id,
          'membership_id', asm.id,
          'membershipStatus', asm.status,
          'membership_status', asm.status
        )
        order by a.created_at desc
      ),
      '[]'::jsonb
    ) as artists
    from artist_studio_memberships asm
    join artists a on a.id = asm.artist_id
    left join artist_profiles ap on ap.artist_id = a.id
    where asm.studio_id = s.id
      and asm.status <> 'archived'
      and a.status <> 'archived'
  ) artists_payload on true
  left join lateral (
    select count(*)::integer as active_service_count
    from service_offerings so
    left join artist_studio_memberships asm on asm.id = so.membership_id
    where so.status = 'active'
      and so.archived_at is null
      and (
        so.studio_id = s.id
        or asm.studio_id = s.id
      )
  ) services_payload on true
  left join lateral (
    select
      coalesce(jsonb_agg(distinct jsonb_build_object(
        'id', mp.id,
        'profileType', mp.profile_type,
        'profile_type', mp.profile_type,
        'visibilityStatus', mp.visibility_status,
        'visibility_status', mp.visibility_status,
        'title', mp.title,
        'publishedAt', mp.published_at,
        'published_at', mp.published_at,
        'hiddenAt', mp.hidden_at,
        'hidden_at', mp.hidden_at
      )), '[]'::jsonb) as profiles,
      coalesce(jsonb_agg(distinct jsonb_build_object(
        'id', ml.id,
        'visibilityStatus', ml.visibility_status,
        'visibility_status', ml.visibility_status,
        'city', ml.city,
        'expiresAt', ml.expires_at,
        'expires_at', ml.expires_at
      )) filter (where ml.id is not null), '[]'::jsonb) as listings
    from marketplace_profiles mp
    left join marketplace_listings ml on ml.marketplace_profile_id = mp.id
    left join artist_studio_memberships asm on asm.id = mp.membership_id
    where mp.studio_id = s.id
      or asm.studio_id = s.id
  ) marketplace_payload on true
  where s.archived_at is null
    and (p_studio_id is null or s.id = p_studio_id);

  return jsonb_build_object('queue', v_queue);
end;
$$;

create or replace function public.studio_flow_admin_get_governance_queue()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.studio_flow_admin_assert_platform_owner();

  return public.studio_flow_admin_governance_payload(null);
end;
$$;

create or replace function public.studio_flow_admin_review_studio(
  p_studio_id uuid,
  p_decision text,
  p_reason text default null,
  p_decision_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_actor_profile_id uuid;
  v_studio_before studios%rowtype;
  v_studio_after studios%rowtype;
  v_review governance_reviews%rowtype;
  v_decision text;
  v_review_status governance_review_status;
  v_studio_status studio_status;
  v_review_type governance_review_type;
begin
  v_context := public.studio_flow_admin_assert_platform_owner();
  v_actor_profile_id := (v_context ->> 'actor_profile_id')::uuid;
  v_decision := lower(trim(coalesce(p_decision, '')));

  if v_decision not in ('approve', 'reject', 'suspend', 'request_changes') then
    raise exception 'Unsupported governance decision: %', p_decision;
  end if;

  select *
  into v_studio_before
  from studios
  where id = p_studio_id
  for update;

  if v_studio_before.id is null then
    raise exception 'Studio not found';
  end if;

  if v_studio_before.studio_status = 'archived' then
    raise exception 'Archived studios cannot be reviewed';
  end if;

  v_review_status := case v_decision
    when 'approve' then 'approved'::governance_review_status
    when 'reject' then 'rejected'::governance_review_status
    when 'suspend' then 'suspended'::governance_review_status
    else 'changes_requested'::governance_review_status
  end;

  v_studio_status := case v_decision
    when 'approve' then 'approved'::studio_status
    when 'reject' then 'rejected'::studio_status
    when 'suspend' then 'suspended'::studio_status
    else 'pending'::studio_status
  end;

  v_review_type := case
    when v_studio_before.studio_status = 'pending' then 'onboarding'::governance_review_type
    when v_decision = 'suspend' then 'risk'::governance_review_type
    else 'status_change'::governance_review_type
  end;

  select *
  into v_review
  from governance_reviews
  where studio_id = p_studio_id
    and status = 'open'
  order by created_at desc
  limit 1
  for update;

  if v_review.id is null then
    insert into governance_reviews (
      studio_id,
      review_type,
      status,
      reason,
      decision_notes,
      reviewed_by_profile_id,
      resolved_at
    )
    values (
      p_studio_id,
      v_review_type,
      v_review_status,
      nullif(trim(coalesce(p_reason, '')), ''),
      nullif(trim(coalesce(p_decision_notes, '')), ''),
      v_actor_profile_id,
      now()
    )
    returning *
    into v_review;
  else
    update governance_reviews
    set
      review_type = v_review_type,
      status = v_review_status,
      reason = nullif(trim(coalesce(p_reason, '')), ''),
      decision_notes = nullif(trim(coalesce(p_decision_notes, '')), ''),
      reviewed_by_profile_id = v_actor_profile_id,
      resolved_at = now()
    where id = v_review.id
    returning *
    into v_review;
  end if;

  update studios
  set
    studio_status = v_studio_status,
    approved_at = case
      when v_studio_status = 'approved' then now()
      when v_studio_before.studio_status = 'approved' and v_studio_status <> 'approved' then null
      else approved_at
    end,
    suspended_at = case
      when v_studio_status = 'suspended' then now()
      when v_studio_status = 'approved' then null
      else suspended_at
    end,
    updated_at = now()
  where id = p_studio_id
  returning *
  into v_studio_after;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    event_type,
    before_data,
    after_data,
    metadata
  )
  values (
    v_actor_profile_id,
    'studio',
    'governance_review',
    v_review.id,
    p_studio_id,
    'studio_governance_reviewed',
    to_jsonb(v_studio_before),
    to_jsonb(v_studio_after),
    jsonb_build_object(
      'decision', v_decision,
      'review_status', v_review.status,
      'reason', p_reason,
      'decision_notes', p_decision_notes
    )
  );

  return jsonb_build_object(
    'studio', jsonb_build_object(
      'id', v_studio_after.id,
      'name', v_studio_after.name,
      'studioStatus', v_studio_after.studio_status,
      'studio_status', v_studio_after.studio_status,
      'approvedAt', v_studio_after.approved_at,
      'approved_at', v_studio_after.approved_at,
      'suspendedAt', v_studio_after.suspended_at,
      'suspended_at', v_studio_after.suspended_at
    ),
    'governanceReview', jsonb_build_object(
      'id', v_review.id,
      'reviewType', v_review.review_type,
      'review_type', v_review.review_type,
      'status', v_review.status,
      'reason', v_review.reason,
      'decisionNotes', v_review.decision_notes,
      'decision_notes', v_review.decision_notes,
      'reviewedByProfileId', v_review.reviewed_by_profile_id,
      'reviewed_by_profile_id', v_review.reviewed_by_profile_id,
      'createdAt', v_review.created_at,
      'created_at', v_review.created_at,
      'resolvedAt', v_review.resolved_at,
      'resolved_at', v_review.resolved_at
    ),
    'queue', public.studio_flow_admin_governance_payload(p_studio_id) -> 'queue'
  );
end;
$$;

revoke all on function public.studio_flow_admin_assert_platform_owner() from public;
revoke all on function public.studio_flow_admin_governance_payload(uuid) from public;
revoke all on function public.studio_flow_admin_get_governance_queue() from public;
revoke all on function public.studio_flow_admin_review_studio(uuid, text, text, text) from public;

grant execute on function public.studio_flow_admin_get_governance_queue() to authenticated;
grant execute on function public.studio_flow_admin_review_studio(uuid, text, text, text) to authenticated;
