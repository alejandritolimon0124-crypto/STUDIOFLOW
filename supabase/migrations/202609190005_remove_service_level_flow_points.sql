begin;

update public.service_offerings
set flow_points_awarded=0,updated_at=now()
where coalesce(flow_points_awarded,0)<>0;

create or replace function public.studio_flow_capture_appointment_reward()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  new.reward_points_snapshot:=0;
  new.reward_multiplier_snapshot:=public.studio_flow_artist_active_double_points_multiplier(
    case when new.studio_id is null and new.membership_id is null then new.artist_id else null end,
    new.studio_id,
    now()
  );
  return new;
end;$$;

revoke all on function public.studio_flow_capture_appointment_reward() from public,anon,authenticated;

commit;
