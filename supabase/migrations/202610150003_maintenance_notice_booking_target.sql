begin;

create or replace function public.studio_flow_client_get_notifications()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare client_id_value uuid; result jsonb;
begin
  select c.id into client_id_value from clients c join profiles p on p.id=c.profile_id
    where c.profile_id=auth.uid() and c.status='active' and c.archived_at is null and p.status='active';
  if client_id_value is null then raise exception 'Se requiere una clienta activa'; end if;

  perform public.studio_flow_generate_marketing_reminders(client_id_value);
  perform public.studio_flow_generate_studio_marketing_reminders(client_id_value);
  perform public.studio_flow_generate_pong_client_campaigns(client_id_value);

  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]'::jsonb) into result
    from (
      select id,title,body,created_at,read_at,notification_type,
        case when notification_type='maintenance' then artist_id end as artist_id,
        case when notification_type='maintenance' then studio_id end as studio_id,
        case when notification_type='maintenance' then metadata->>'serviceOfferingId' end as service_offering_id,
        case when metadata->>'targetUrl' like '/%' then metadata->>'targetUrl' end as target_url
      from client_notifications where client_id=client_id_value
      order by created_at desc,id limit 30
    ) n;
  return jsonb_build_object('notifications',result);
end $$;

revoke all on function public.studio_flow_client_get_notifications() from public,anon;
grant execute on function public.studio_flow_client_get_notifications() to authenticated;

commit;
