create or replace function public.studio_flow_owner_get_studios()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studios jsonb;
begin
  perform public.studio_flow_admin_assert_platform_owner();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', studio.id,
        'studioId', studio.id,
        'studio_id', studio.id,
        'name', studio.name,
        'studioStatus', studio.studio_status,
        'studio_status', studio.studio_status,
        'riskScore', studio.risk_score,
        'risk_score', studio.risk_score,
        'createdAt', studio.created_at,
        'created_at', studio.created_at,
        'approvedAt', studio.approved_at,
        'approved_at', studio.approved_at,
        'suspendedAt', studio.suspended_at,
        'suspended_at', studio.suspended_at,
        'owner', jsonb_build_object(
          'profileId', owner_profile.id,
          'profile_id', owner_profile.id,
          'displayName', owner_profile.display_name,
          'display_name', owner_profile.display_name,
          'email', owner_profile.email,
          'phone', owner_profile.phone
        ),
        'profile', jsonb_build_object(
          'id', studio_profile.id,
          'commercialName', coalesce(studio_profile.commercial_name, studio.name),
          'commercial_name', coalesce(studio_profile.commercial_name, studio.name),
          'city', studio_profile.city,
          'email', studio_profile.email,
          'phone', studio_profile.phone,
          'addressLine', studio_profile.address_line,
          'address_line', studio_profile.address_line,
          'description', studio_profile.description,
          'logoPath', studio_profile.logo_path,
          'logo_path', studio_profile.logo_path
        ),
        'latestReview',
        case
          when latest_review.id is null then null
          else jsonb_build_object(
            'id', latest_review.id,
            'reviewType', latest_review.review_type,
            'review_type', latest_review.review_type,
            'status', latest_review.status,
            'reason', latest_review.reason,
            'decisionNotes', latest_review.decision_notes,
            'decision_notes', latest_review.decision_notes,
            'reviewedByProfileId', latest_review.reviewed_by_profile_id,
            'reviewed_by_profile_id', latest_review.reviewed_by_profile_id,
            'createdAt', latest_review.created_at,
            'created_at', latest_review.created_at,
            'resolvedAt', latest_review.resolved_at,
            'resolved_at', latest_review.resolved_at
          )
        end
      )
      order by
        case studio.studio_status
          when 'pending' then 1
          when 'approved' then 2
          when 'suspended' then 3
          when 'rejected' then 4
          else 5
        end,
        studio.created_at desc
    ),
    '[]'::jsonb
  )
  into v_studios
  from studios studio
  join profiles owner_profile on owner_profile.id = studio.owner_profile_id
  left join studio_profiles studio_profile on studio_profile.studio_id = studio.id
  left join lateral (
    select *
    from governance_reviews review
    where review.studio_id = studio.id
    order by coalesce(review.resolved_at, review.created_at) desc, review.created_at desc
    limit 1
  ) latest_review on true
  where studio.archived_at is null;

  return jsonb_build_object('studios', v_studios);
end;
$$;

create or replace function public.studio_flow_owner_review_studio(
  p_studio_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_action text;
  v_decision text;
  v_result jsonb;
begin
  perform public.studio_flow_admin_assert_platform_owner();

  if p_studio_id is null then
    raise exception 'Studio is required';
  end if;

  v_action := lower(trim(coalesce(p_action, '')));

  if v_action not in ('approve', 'request_changes', 'reject', 'suspend', 'reactivate') then
    raise exception 'Unsupported studio review action: %', p_action;
  end if;

  v_decision := case
    when v_action = 'reactivate' then 'approve'
    else v_action
  end;

  v_result := public.studio_flow_admin_review_studio(
    p_studio_id,
    v_decision,
    p_reason,
    case
      when v_action = 'reactivate' then 'Studio reactivated by platform owner.'
      else p_reason
    end
  );

  return jsonb_build_object(
    'action', v_action,
    'result', v_result,
    'studios', public.studio_flow_owner_get_studios() -> 'studios'
  );
end;
$$;

revoke all on function public.studio_flow_owner_get_studios() from public;
revoke all on function public.studio_flow_owner_review_studio(uuid, text, text) from public;

grant execute on function public.studio_flow_owner_get_studios() to authenticated;
grant execute on function public.studio_flow_owner_review_studio(uuid, text, text) to authenticated;
