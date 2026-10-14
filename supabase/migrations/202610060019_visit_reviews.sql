create table public.studio_flow_visit_reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id),
  client_id uuid not null references public.clients(id),
  artist_id uuid not null references public.artists(id),
  studio_id uuid references public.studios(id),
  rating integer not null check (rating between 0 and 5),
  highlights text[] not null default '{}',
  body text not null default '' check (char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index studio_flow_visit_reviews_artist_idx on public.studio_flow_visit_reviews(artist_id,created_at desc);
create index studio_flow_visit_reviews_studio_idx on public.studio_flow_visit_reviews(studio_id,created_at desc);
create index studio_flow_visit_reviews_client_idx on public.studio_flow_visit_reviews(client_id,created_at desc);
alter table public.studio_flow_visit_reviews enable row level security;
revoke all on public.studio_flow_visit_reviews from public,anon,authenticated;

create function public.studio_flow_save_visit_review(
  p_appointment_id uuid,p_rating integer,p_highlights text[],p_body text
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_appointment appointments%rowtype; v_client clients%rowtype; v_review studio_flow_visit_reviews%rowtype;
  v_highlights text[] := coalesce(p_highlights,'{}'::text[]); v_body text := trim(coalesce(p_body,''));
begin
  select * into v_client from clients where profile_id=auth.uid() and status<>'archived' limit 1;
  if v_client.id is null then raise exception 'Inicia sesión como clienta para opinar'; end if;
  select * into v_appointment from appointments where id=p_appointment_id and client_id=v_client.id and status='completed';
  if v_appointment.id is null then raise exception 'Solo puedes reseñar una cita completada de tu historial'; end if;
  if p_rating is null or p_rating not between 0 and 5 then raise exception 'Elige una calificación de 0 a 5 estrellas'; end if;
  if char_length(v_body)>1000 then raise exception 'La reseña puede tener hasta 1000 caracteres'; end if;
  if v_body='' and cardinality(v_highlights)=0 then raise exception 'Escribe una reseña o elige al menos una frase'; end if;
  if exists(select 1 from unnest(v_highlights) phrase where phrase <> all(array[
    'Excelente servicio','Volvería sin pensarlo','Instalaciones muy bonitas y cómodas',
    'Trato excepcional','Trabajo de belleza increíble','La mejor calidad que pude encontrar'
  ])) then raise exception 'Una de las frases seleccionadas no está permitida'; end if;
  insert into studio_flow_visit_reviews(appointment_id,client_id,artist_id,studio_id,rating,highlights,body)
  values(v_appointment.id,v_client.id,v_appointment.artist_id,v_appointment.studio_id,p_rating,v_highlights,v_body)
  on conflict(appointment_id) do update set rating=excluded.rating,highlights=excluded.highlights,
    body=excluded.body,updated_at=now()
  returning * into v_review;
  return jsonb_build_object('id',v_review.id,'appointmentId',v_review.appointment_id,
    'rating',v_review.rating,'highlights',v_review.highlights,'body',v_review.body);
end $$;
revoke all on function public.studio_flow_save_visit_review(uuid,integer,text[],text) from public,anon;
grant execute on function public.studio_flow_save_visit_review(uuid,integer,text[],text) to authenticated;

create function public.studio_flow_get_my_visit_reviews()
returns jsonb language sql stable security definer set search_path=public,auth as $$
  select coalesce(jsonb_agg(jsonb_build_object('appointmentId',r.appointment_id,'rating',r.rating,
    'highlights',r.highlights,'body',r.body) order by r.created_at desc),'[]'::jsonb)
  from studio_flow_visit_reviews r join clients c on c.id=r.client_id where c.profile_id=auth.uid();
$$;
revoke all on function public.studio_flow_get_my_visit_reviews() from public,anon;
grant execute on function public.studio_flow_get_my_visit_reviews() to authenticated;

create function public.studio_flow_get_visit_reviews(
  p_artist_id uuid default null,p_studio_id uuid default null,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_count integer; v_average numeric; v_reviews jsonb;
begin
  if (p_artist_id is null)=(p_studio_id is null) then raise exception 'Selecciona una artista o un estudio'; end if;
  select count(*),round(avg(rating)::numeric,1) into v_count,v_average
    from studio_flow_visit_reviews r
    where (p_artist_id is not null and r.artist_id=p_artist_id)
       or (p_studio_id is not null and r.studio_id=p_studio_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'rating',q.rating,'highlights',q.highlights,'body',q.body,
    'createdAt',q.created_at,'clientName',q.client_name,'clientPhoto',q.photo_path)
    order by q.created_at desc,q.id desc),'[]'::jsonb) into v_reviews
  from (
    select r.id,r.rating,r.highlights,r.body,r.created_at,
      split_part(trim(c.display_name),' ',1) as client_name,cp.photo_path
    from studio_flow_visit_reviews r
    join clients c on c.id=r.client_id
    left join client_profiles cp on cp.client_id=c.id
    where (p_artist_id is not null and r.artist_id=p_artist_id)
       or (p_studio_id is not null and r.studio_id=p_studio_id)
    order by r.created_at desc,r.id desc
    limit 5 offset greatest(coalesce(p_offset,0),0)
  ) q;
  return jsonb_build_object('count',v_count,'average',coalesce(v_average,0),'reviews',v_reviews);
end $$;
revoke all on function public.studio_flow_get_visit_reviews(uuid,uuid,integer) from public;
grant execute on function public.studio_flow_get_visit_reviews(uuid,uuid,integer) to anon,authenticated;
