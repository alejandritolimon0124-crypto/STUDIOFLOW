alter table public.client_notifications
  drop constraint if exists client_notifications_type_check;

alter table public.client_notifications
  add constraint client_notifications_type_check
  check (notification_type in ('birthday','reactivation','maintenance','double_points','happy_hour','flow_points','campaign'));

create or replace function public.studio_flow_queue_client_notice_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
  v_target_url text;
begin
  select c.profile_id into v_profile_id
  from public.clients c
  join public.profiles p on p.id=c.profile_id and p.status='active'
  where c.id=new.client_id and c.status='active' and c.archived_at is null;

  v_target_url := case
    when new.metadata->>'targetUrl' like '/%' then new.metadata->>'targetUrl'
    else '/client'
  end;

  perform public.studio_flow_enqueue_push_notification(
    v_profile_id,
    new.notification_type,
    new.title,
    new.body,
    v_target_url,
    case when new.notification_type='campaign' then 'campaign-' || coalesce(new.metadata->>'campaignId',new.id::text) else 'client-notice-' || new.id end,
    jsonb_build_object('clientNotificationId',new.id,'type',new.notification_type) || new.metadata,
    'client-notice:' || new.id
  );
  return new;
end $$;

create or replace function public.studio_flow_campaign_share_with_clients(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_campaign public.registration_campaigns;
  v_recipient_count integer := 0;
  v_inserted_count integer := 0;
  v_brand_name text;
  v_target_url text;
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then
    raise exception 'Campaign owner access required';
  end if;

  select * into v_campaign
  from public.registration_campaigns
  where id=p_campaign_id and status='active';
  if not found then raise exception 'La campaña no está activa'; end if;

  select coalesce(sp.commercial_name,s.name,ap.artistic_name,a.display_name,'Studio Flow')
  into v_brand_name
  from public.registration_campaigns c
  left join public.studios s on s.id=c.studio_id
  left join public.studio_profiles sp on sp.studio_id=s.id
  left join public.artists a on a.id=c.artist_id
  left join public.artist_profiles ap on ap.artist_id=a.id
  where c.id=p_campaign_id;

  v_target_url := '/campana/' || v_campaign.slug;

  with recipients as (
    select distinct c.id as client_id
    from public.clients c
    join public.profiles p on p.id=c.profile_id and p.status='active'
    where c.status='active' and c.archived_at is null
      and (
        exists (
          select 1 from public.appointments appt
          where appt.client_id=c.id
            and ((v_campaign.artist_id is not null and appt.artist_id=v_campaign.artist_id)
              or (v_campaign.studio_id is not null and appt.studio_id=v_campaign.studio_id))
        )
        or exists (
          select 1 from public.customer_relationships relationship
          where relationship.client_id=c.id and relationship.status='active'
            and ((v_campaign.artist_id is not null and relationship.artist_id=v_campaign.artist_id)
              or (v_campaign.studio_id is not null and relationship.studio_id=v_campaign.studio_id))
        )
      )
  )
  select count(*) into v_recipient_count from recipients;

  with recipients as (
    select distinct c.id as client_id
    from public.clients c
    join public.profiles p on p.id=c.profile_id and p.status='active'
    where c.status='active' and c.archived_at is null
      and (
        exists (
          select 1 from public.appointments appt
          where appt.client_id=c.id
            and ((v_campaign.artist_id is not null and appt.artist_id=v_campaign.artist_id)
              or (v_campaign.studio_id is not null and appt.studio_id=v_campaign.studio_id))
        )
        or exists (
          select 1 from public.customer_relationships relationship
          where relationship.client_id=c.id and relationship.status='active'
            and ((v_campaign.artist_id is not null and relationship.artist_id=v_campaign.artist_id)
              or (v_campaign.studio_id is not null and relationship.studio_id=v_campaign.studio_id))
        )
      )
  )
  insert into public.client_notifications (
    client_id,artist_id,studio_id,notification_type,title,body,metadata,reminder_key
  )
  select recipient.client_id,v_campaign.artist_id,v_campaign.studio_id,'campaign',
    'Nueva campaña de ' || v_brand_name,
    'Participa en ' || v_campaign.name || '. Abre el registro y obtén tu folio.',
    jsonb_build_object('campaignId',v_campaign.id,'targetUrl',v_target_url,'campaignSlug',v_campaign.slug),
    'campaign-share:' || v_campaign.id || ':' || recipient.client_id
  from recipients recipient
  on conflict (reminder_key) do nothing;
  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object('recipientCount',v_recipient_count,'insertedCount',v_inserted_count);
end $$;

create or replace function public.studio_flow_client_get_notifications()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare client_id_value uuid; result jsonb;
begin
  select c.id into client_id_value from clients c join profiles p on p.id=c.profile_id
    where c.profile_id=auth.uid() and c.status='active' and c.archived_at is null and p.status='active';
  if client_id_value is null then raise exception 'Se requiere una clienta activa'; end if;
  perform public.studio_flow_generate_marketing_reminders(client_id_value);
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]'::jsonb) into result
    from (
      select id,title,body,created_at,read_at,
        case when metadata->>'targetUrl' like '/%' then metadata->>'targetUrl' end as target_url
      from client_notifications where client_id=client_id_value
      order by created_at desc,id limit 30
    ) n;
  return jsonb_build_object('notifications',result);
end $$;

revoke all on function public.studio_flow_campaign_share_with_clients(uuid) from public,anon;
grant execute on function public.studio_flow_campaign_share_with_clients(uuid) to authenticated;
