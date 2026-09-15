begin;
create function public.studio_flow_studio_export_clients(p_studio_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare header jsonb; rows jsonb;
begin
 select jsonb_build_object('name',coalesce(sp.commercial_name,s.name),'fullName',p.display_name,'email',p.email,'phone',p.phone,'address',sp.address_line)
 into header from studios s join profiles p on p.id=s.owner_profile_id
 left join studio_profiles sp on sp.studio_id=s.id
 where s.id=p_studio_id and s.owner_profile_id=auth.uid() and p.status='active';
 if header is null then raise exception 'Solo el propietario del estudio puede descargar su cartera.'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.registered,q.id),'[]'::jsonb) into rows from (
 select c.id,to_char(c.created_at at time zone 'America/Mexico_City','YYYY-MM-DD HH24:MI') as registered,
 c.display_name as name,p.email,p.phone
 from clients c join profiles p on p.id=c.profile_id
 where exists(select 1 from appointments a where a.studio_id=p_studio_id and a.client_id=c.id)
 ) q;
 return jsonb_build_object('profile',header,'clients',rows);
end $$;
revoke all on function public.studio_flow_studio_export_clients(uuid) from public,anon;
grant execute on function public.studio_flow_studio_export_clients(uuid) to authenticated;
commit;
