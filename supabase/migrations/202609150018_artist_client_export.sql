begin;
create or replace function public.studio_flow_artist_export_clients()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_artist_id uuid; header jsonb; rows jsonb;
begin
 select a.id,jsonb_build_object('name',coalesce(ap.artistic_name,a.display_name),'fullName',p.display_name,'email',p.email,'phone',p.phone,'address',ap.address_line)
 into v_artist_id,header from artists a join profiles p on p.id=a.profile_id
 left join artist_profiles ap on ap.artist_id=a.id
 where a.profile_id=auth.uid() and p.status='active' and a.status='active';
 if v_artist_id is null then raise exception 'Se requiere una cuenta de artista activa.'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.registered,q.id),'[]'::jsonb) into rows from (
 select c.id,to_char(c.created_at at time zone 'America/Mexico_City','YYYY-MM-DD HH24:MI') as registered,
 c.display_name as name,p.email,p.phone
 from clients c join profiles p on p.id=c.profile_id
 where exists(select 1 from appointments a where a.artist_id=v_artist_id and a.client_id=c.id and a.studio_id is null)
 ) q;
 return jsonb_build_object('profile',header,'clients',rows);
end $$;
revoke all on function public.studio_flow_artist_export_clients() from public,anon;
grant execute on function public.studio_flow_artist_export_clients() to authenticated;
commit;
