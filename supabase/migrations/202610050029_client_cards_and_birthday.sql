alter table public.studio_flow_invitation_cards
  add column recipient_client_id uuid references public.clients(id);

create table public.studio_flow_birthday_messages (
  artist_id uuid references public.artists(id),
  studio_id uuid references public.studios(id),
  message text not null check (char_length(message) between 50 and 700),
  updated_at timestamptz not null default now(),
  constraint birthday_message_owner check ((artist_id is null) <> (studio_id is null))
);
create unique index birthday_message_artist on public.studio_flow_birthday_messages(artist_id) where artist_id is not null;
create unique index birthday_message_studio on public.studio_flow_birthday_messages(studio_id) where studio_id is not null;
alter table public.studio_flow_birthday_messages enable row level security;
revoke all on public.studio_flow_birthday_messages from public,anon,authenticated;

create function public.studio_flow_default_birthday_message()
returns text language sql immutable as $$
  select 'Hoy celebramos mucho más que tu cumpleaños: celebramos la persona única que eres. Gracias por permitirnos acompañarte en esos momentos en los que eliges cuidarte y brillar. Deseamos que este nuevo año te recuerde todos los días lo bella, valiosa y capaz que eres. Que recibas tanto cariño como el que inspiras. ¡Feliz cumpleaños, de todo corazón!';
$$;

create function public.studio_flow_birthday_message(
  p_studio_id uuid default null, p_message text default null, p_save boolean default false
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_artist_id uuid; v_message text; v_name text;
begin
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
    select coalesce(sp.commercial_name,s.name) into v_name from public.studios s
      left join public.studio_profiles sp on sp.studio_id=s.id where s.id=p_studio_id;
  else
    select a.id,coalesce(ap.artistic_name,a.display_name) into v_artist_id,v_name
      from public.artists a left join public.artist_profiles ap on ap.artist_id=a.id
      where a.profile_id=auth.uid() and a.status='active' and a.archived_at is null;
    if v_artist_id is null then raise exception 'Perfil independiente requerido'; end if;
  end if;
  if p_save then
    v_message := trim(coalesce(p_message,''));
    if char_length(v_message) not between 50 and 700 then
      raise exception 'Escribe entre 50 y 700 caracteres para la felicitacion';
    end if;
    if p_studio_id is not null then
      insert into public.studio_flow_birthday_messages(studio_id,message)
      values(p_studio_id,v_message)
      on conflict(studio_id) where studio_id is not null do update
        set message=excluded.message,updated_at=now();
    else
      insert into public.studio_flow_birthday_messages(artist_id,message)
      values(v_artist_id,v_message)
      on conflict(artist_id) where artist_id is not null do update
        set message=excluded.message,updated_at=now();
    end if;
  end if;
  select message into v_message from public.studio_flow_birthday_messages
    where (p_studio_id is not null and studio_id=p_studio_id)
      or (v_artist_id is not null and artist_id=v_artist_id);
  return jsonb_build_object('message',coalesce(v_message,public.studio_flow_default_birthday_message()),
    'businessName',coalesce(v_name,'Studio Flow'));
end $$;
revoke all on function public.studio_flow_birthday_message(uuid,text,boolean) from public,anon;
grant execute on function public.studio_flow_birthday_message(uuid,text,boolean) to authenticated;

create function public.studio_flow_prepare_birthday_notice()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_message text;
begin
  if new.notification_type <> 'birthday' then return new; end if;
  select message into v_message from public.studio_flow_birthday_messages
    where (new.studio_id is not null and studio_id=new.studio_id)
      or (new.artist_id is not null and artist_id=new.artist_id);
  new.body := 'Hoy celebramos la persona bella y valiosa que eres. Abre tu felicitacion especial.';
  new.metadata := coalesce(new.metadata,'{}'::jsonb)
    || jsonb_build_object('targetUrl','/felicitacion/' || new.id);
  return new;
end $$;
create trigger studio_flow_prepare_birthday_notice_before_insert
before insert on public.client_notifications for each row
execute function public.studio_flow_prepare_birthday_notice();

update public.client_notifications
set metadata=metadata || jsonb_build_object('targetUrl','/felicitacion/' || id)
where notification_type='birthday' and metadata->>'targetUrl' is null;

create function public.studio_flow_get_birthday_card(p_notice_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_notice public.client_notifications%rowtype;
  v_client public.clients%rowtype; v_name text; v_phone text; v_message text;
begin
  select n.* into v_notice from public.client_notifications n
    join public.clients c on c.id=n.client_id and c.profile_id=auth.uid()
      and c.status='active' and c.archived_at is null
    where n.id=p_notice_id and n.notification_type='birthday';
  if v_notice.id is null then return null; end if;
  select * into v_client from public.clients where id=v_notice.client_id;
  if v_notice.studio_id is not null then
    select coalesce(sp.commercial_name,s.name),sp.phone into v_name,v_phone
      from public.studios s left join public.studio_profiles sp on sp.studio_id=s.id
      where s.id=v_notice.studio_id and s.archived_at is null;
  else
    select coalesce(ap.artistic_name,a.display_name),p.phone into v_name,v_phone
      from public.artists a left join public.artist_profiles ap on ap.artist_id=a.id
      left join public.profiles p on p.id=a.profile_id
      where a.id=v_notice.artist_id and a.archived_at is null;
  end if;
  select message into v_message from public.studio_flow_birthday_messages
    where (v_notice.studio_id is not null and studio_id=v_notice.studio_id)
      or (v_notice.artist_id is not null and artist_id=v_notice.artist_id);
  return jsonb_build_object('clientName',split_part(v_client.display_name,' ',1),
    'businessName',coalesce(v_name,'Studio Flow'),'phone',v_phone,
    'message',coalesce(v_message,public.studio_flow_default_birthday_message()));
end $$;
revoke all on function public.studio_flow_get_birthday_card(uuid) from public,anon;
grant execute on function public.studio_flow_get_birthday_card(uuid) to authenticated;

create function public.studio_flow_search_card_clients(
  p_studio_id uuid, p_query text, p_limit integer default 10
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_artist_id uuid; v_result jsonb;
begin
  if char_length(trim(coalesce(p_query,''))) < 2 then return '[]'::jsonb; end if;
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    select id into v_artist_id from public.artists where profile_id=auth.uid()
      and status='active' and archived_at is null;
    if v_artist_id is null then raise exception 'Perfil independiente requerido'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.display_name,
    'phone',c.phone) order by c.display_name),'[]'::jsonb) into v_result
  from (select c.id,c.display_name,c.phone from public.clients c
    join public.profiles p on p.id=c.profile_id and p.status='active'
    where c.status='active' and c.archived_at is null
      and (c.display_name ilike '%' || trim(p_query) || '%'
        or (nullif(regexp_replace(p_query,'\D','','g'),'') is not null
          and c.phone like '%' || regexp_replace(p_query,'\D','','g') || '%'))
      and exists(select 1 from public.appointments a where a.client_id=c.id
        and a.status='completed'
        and ((p_studio_id is not null and a.studio_id=p_studio_id)
          or (v_artist_id is not null and a.artist_id=v_artist_id and a.studio_id is null)))
    order by c.display_name limit least(greatest(p_limit,1),20)) c;
  return v_result;
end $$;
revoke all on function public.studio_flow_search_card_clients(uuid,text,integer) from public,anon;
grant execute on function public.studio_flow_search_card_clients(uuid,text,integer) to authenticated;

create function public.studio_flow_send_invitation_card(p_code text,p_client_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_card public.studio_flow_invitation_cards%rowtype;
  v_client public.clients%rowtype; v_name text; v_pong boolean;
begin
  select * into v_card from public.studio_flow_invitation_cards where code=p_code for update;
  if v_card.id is null or v_card.deleted_at is not null or v_card.archived_at is not null
    or v_card.expires_at <= now() then raise exception 'Esta tarjeta ya no esta disponible'; end if;
  if v_card.studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(v_card.studio_id);
    select coalesce(sp.commercial_name,s.name) into v_name from public.studios s
      left join public.studio_profiles sp on sp.studio_id=s.id where s.id=v_card.studio_id;
  elsif not exists(select 1 from public.artists a where a.id=v_card.artist_id
    and a.profile_id=auth.uid() and a.status='active' and a.archived_at is null) then
    raise exception 'No puedes compartir esta tarjeta';
  else
    select coalesce(ap.artistic_name,a.display_name) into v_name from public.artists a
      left join public.artist_profiles ap on ap.artist_id=a.id where a.id=v_card.artist_id;
  end if;
  select * into v_client from public.clients c where c.id=p_client_id
    and c.profile_id is not null and c.status='active' and c.archived_at is null
    and exists(select 1 from public.profiles p where p.id=c.profile_id and p.status='active');
  if v_client.id is null or not exists(select 1 from public.appointments a
    where a.client_id=v_client.id and a.status='completed'
      and ((v_card.studio_id is not null and a.studio_id=v_card.studio_id)
        or (v_card.artist_id is not null and a.artist_id=v_card.artist_id and a.studio_id is null))) then
    raise exception 'Elige una clienta con perfil y una cita atendida en este negocio';
  end if;
  select exists(select 1 from public.studio_flow_pong_offers where card_id=v_card.id) into v_pong;
  if v_card.benefit_type <> 'none' or v_pong then
    if v_card.redemptions > 0 or exists(select 1 from public.studio_flow_pong_runs
      where card_id=v_card.id) then
      raise exception 'Esta tarjeta ya tiene actividad. Crea una nueva para otra clienta';
    end if;
    if v_card.recipient_client_id is not null and v_card.recipient_client_id <> v_client.id then
      raise exception 'Esta tarjeta personal ya fue asignada a otra clienta';
    end if;
    update public.studio_flow_invitation_cards set recipient_client_id=v_client.id
      where id=v_card.id;
  end if;
  insert into public.client_notifications(client_id,artist_id,studio_id,notification_type,
    title,body,metadata,reminder_key)
  values(v_client.id,v_card.artist_id,v_card.studio_id,'campaign',
    v_name || ' preparó algo para ti',
    case when v_pong then 'Tienes un reto Pong con un descuento por descubrir.'
      else 'Abre tu tarjeta digital y descubre lo que preparamos para ti.' end,
    jsonb_build_object('targetUrl','/invitacion/' || v_card.code,'cardCode',v_card.code),
    'invitation:' || v_card.code || ':' || v_client.id)
  on conflict(reminder_key) do nothing;
  return jsonb_build_object('sent',true,'clientName',v_client.display_name,
    'url','/invitacion/' || v_card.code);
end $$;
revoke all on function public.studio_flow_send_invitation_card(text,uuid) from public,anon;
grant execute on function public.studio_flow_send_invitation_card(text,uuid) to authenticated;

create or replace function public.studio_flow_get_invitation_card(p_code text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_card jsonb; v_row public.studio_flow_invitation_cards%rowtype;
begin
  select * into v_row from public.studio_flow_invitation_cards where code=p_code;
  if v_row.recipient_client_id is not null and v_row.created_by_profile_id is distinct from auth.uid()
    and not exists(select 1 from public.clients c where c.id=v_row.recipient_client_id
      and c.profile_id=auth.uid() and c.status='active' and c.archived_at is null) then
    return null;
  end if;
  v_card := public.studio_flow_get_invitation_card_base(p_code);
  if v_card is null then return null; end if;
  if not exists(select 1 from public.marketplace_profiles mp
    join public.marketplace_listings ml on ml.marketplace_profile_id=mp.id
    where mp.visibility_status='visible' and ml.visibility_status='visible'
      and (ml.expires_at is null or ml.expires_at>now())
      and (((v_card->>'studioId') is not null and mp.profile_type='studio'
        and mp.studio_id=(v_card->>'studioId')::uuid)
        or ((v_card->>'artistId') is not null and mp.profile_type='artist'
        and mp.artist_id=(v_card->>'artistId')::uuid))) then return null; end if;
  v_card := v_card || jsonb_build_object('discountServiceId',v_row.discount_service_id);
  if v_card->>'benefitType'='none' and not exists(select 1 from public.studio_flow_pong_offers
    where card_id=v_row.id) then
    v_card := jsonb_set(v_card,'{available}','true'::jsonb);
  end if;
  return v_card;
end $$;

create or replace function public.studio_flow_apply_invitation_to_booking(
  p_code text,p_appointment_id uuid,p_referral_token text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_card public.studio_flow_invitation_cards%rowtype;
  v_service_id uuid; v_booked_service_id uuid;
begin
  select * into v_card from public.studio_flow_invitation_cards where code=p_code;
  if v_card.recipient_client_id is not null and not exists(select 1 from public.clients c
    where c.id=v_card.recipient_client_id and c.profile_id=auth.uid()) then
    raise exception 'Esta tarjeta fue preparada para otra clienta';
  end if;
  v_service_id := v_card.discount_service_id;
  if v_service_id is not null then
    select service_offering_id into v_booked_service_id from public.appointments where id=p_appointment_id;
    if v_booked_service_id is distinct from v_service_id then
      raise exception 'El descuento es solo para el servicio seleccionado';
    end if;
  end if;
  return public.studio_flow_apply_invitation_to_booking_base(p_code,p_appointment_id,p_referral_token);
end $$;

alter function public.studio_flow_book_pong_reward(text,uuid[],uuid,text)
  rename to studio_flow_book_pong_reward_base;
revoke all on function public.studio_flow_book_pong_reward_base(text,uuid[],uuid,text)
  from public,anon,authenticated;
create function public.studio_flow_book_pong_reward(
  p_code text,p_availability_slot_ids uuid[],p_service_offering_id uuid,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_target uuid;
begin
  select recipient_client_id into v_target from public.studio_flow_invitation_cards where code=p_code;
  if v_target is not null and not exists(select 1 from public.clients c
    where c.id=v_target and c.profile_id=auth.uid()) then
    raise exception 'Esta tarjeta fue preparada para otra clienta';
  end if;
  return public.studio_flow_book_pong_reward_base(p_code,p_availability_slot_ids,p_service_offering_id,p_notes);
end $$;
revoke all on function public.studio_flow_book_pong_reward(text,uuid[],uuid,text) from public,anon;
grant execute on function public.studio_flow_book_pong_reward(text,uuid[],uuid,text) to authenticated;
