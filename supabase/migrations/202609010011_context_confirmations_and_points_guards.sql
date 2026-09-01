create or replace function public.studio_flow_artist_request_appointment_confirmations(
  p_scope text default 'artist',
  p_date date default null,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  update appointments appt
  set
    confirmation_requested_at = now(),
    updated_at = now()
  where appt.artist_id = (v_context ->> 'artist_id')::uuid
    and appt.status = 'scheduled'
    and appt.starts_at >= now()
    and (p_date is null or (appt.starts_at at time zone 'America/Mexico_City')::date = p_date)
    and (
      ((v_context ->> 'owner_type') = 'artist' and appt.studio_id is null and appt.membership_id is null)
      or (
        (v_context ->> 'owner_type') = 'membership'
        and appt.studio_id = (v_context ->> 'studio_id')::uuid
        and appt.membership_id = (v_context ->> 'membership_id')::uuid
      )
    );

  get diagnostics v_updated = row_count;

  return jsonb_build_object('updatedCount', v_updated, 'updated_count', v_updated);
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'studio_flow_artist_award_appointment_points was not found';
  end if;

  if v_definition not like '%studio_flow_points_cancelled_guard%' then
    v_definition := replace(
      v_definition,
      'if v_appointment.id is null then
    raise exception ''Appointment not found'';
  end if;',
      'if v_appointment.id is null then
    raise exception ''Appointment not found'';
  end if;

  -- studio_flow_points_cancelled_guard
  if v_appointment.status in (''cancelled'', ''no_show'') then
    raise exception ''Las citas canceladas o no asistidas no generan Flow Points'';
  end if;'
    );
  end if;

  execute v_definition;
end;
$$;

revoke all on function public.studio_flow_artist_request_appointment_confirmations(text, date, text, uuid) from public;
grant execute on function public.studio_flow_artist_request_appointment_confirmations(text, date, text, uuid) to authenticated;
