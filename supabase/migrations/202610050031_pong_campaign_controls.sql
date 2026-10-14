alter table public.studio_flow_pong_client_campaigns
  add column cancelled_at timestamptz;

create function public.studio_flow_validate_pong_client_campaign()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.marketplace_profiles mp
    join public.marketplace_listings ml on ml.marketplace_profile_id=mp.id
    where mp.visibility_status='visible' and ml.visibility_status='visible'
      and (ml.expires_at is null or ml.expires_at>now())
      and ((new.studio_id is not null and mp.profile_type='studio' and mp.studio_id=new.studio_id)
        or (new.artist_id is not null and mp.profile_type='artist' and mp.artist_id=new.artist_id))) then
    raise exception 'Publica tu perfil y agenda antes de enviar una campaña';
  end if;
  return new;
end $$;
create trigger studio_flow_validate_pong_client_campaign_before_insert
before insert on public.studio_flow_pong_client_campaigns for each row
execute function public.studio_flow_validate_pong_client_campaign();

do $$ declare v_sql text;
begin
  select pg_get_functiondef(
    'public.studio_flow_generate_pong_client_campaigns(uuid,uuid)'::regprocedure)
    into v_sql;
  if position('where campaign.starts_at<=now() and campaign.ends_at>now()' in v_sql)=0 then
    raise exception 'Review Pong campaign generation before adding cancellation';
  end if;
  v_sql := replace(v_sql,
    'where campaign.starts_at<=now() and campaign.ends_at>now()',
    'where campaign.starts_at<=now() and campaign.ends_at>now() and campaign.cancelled_at is null');
  execute v_sql;
end $$;

create function public.studio_flow_cancel_pong_client_campaign(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_campaign public.studio_flow_pong_client_campaigns%rowtype;
begin
  select * into v_campaign from public.studio_flow_pong_client_campaigns
    where id=p_campaign_id for update;
  if v_campaign.id is null then raise exception 'Campaña no encontrada'; end if;
  if v_campaign.studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(v_campaign.studio_id);
  elsif not exists(select 1 from public.artists a where a.id=v_campaign.artist_id
    and a.profile_id=auth.uid() and a.status='active' and a.archived_at is null) then
    raise exception 'No puedes detener esta campaña';
  end if;
  update public.studio_flow_pong_client_campaigns
    set cancelled_at=coalesce(cancelled_at,now()) where id=v_campaign.id;
  update public.studio_flow_pong_offers po set play_ends_at=least(po.play_ends_at,now())
    from public.studio_flow_pong_campaign_cards sent
    where sent.campaign_id=v_campaign.id and sent.card_id=po.card_id
      and not exists(select 1 from public.studio_flow_pong_runs run
        where run.card_id=po.card_id and run.status='won');
  update public.studio_flow_invitation_cards card set archived_at=coalesce(card.archived_at,now())
    from public.studio_flow_pong_campaign_cards sent
    where sent.campaign_id=v_campaign.id and sent.card_id=card.id
      and not exists(select 1 from public.studio_flow_pong_runs run
        where run.card_id=card.id and run.status='won');
  return jsonb_build_object('cancelled',true);
end $$;
revoke all on function public.studio_flow_cancel_pong_client_campaign(uuid) from public,anon;
grant execute on function public.studio_flow_cancel_pong_client_campaign(uuid) to authenticated;

do $$ declare v_sql text;
begin
  select pg_get_functiondef('public.studio_flow_list_pong_client_campaigns(uuid)'::regprocedure)
    into v_sql;
  if position('''sentCount'',x.sent_count' in v_sql)=0 then
    raise exception 'Review Pong campaign list before adding status';
  end if;
  v_sql := replace(v_sql,'''sentCount'',x.sent_count',
    '''sentCount'',x.sent_count,''cancelledAt'',x.cancelled_at');
  execute v_sql;
end $$;
