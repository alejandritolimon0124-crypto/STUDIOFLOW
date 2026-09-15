begin;
do $$
declare a public.appointments%rowtype; actor uuid; n bigint;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
 select ap.* into a from public.appointments ap
 join public.artists ar on ar.id=ap.artist_id
 join public.profiles p on p.id=ar.profile_id
 where ap.studio_id is not null and ap.status in ('scheduled','completed')
 and ar.status='active' and ar.archived_at is null and p.status='active' limit 1;
 if a.id is null then raise exception 'Existing active artist appointment required'; end if;
 select profile_id into actor from public.artists where id=a.artist_id;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select count(*) into n from public.flow_point_ledger;
 update public.studios set studio_status='suspended' where id=a.studio_id;
 begin
   perform public.studio_flow_artist_award_appointment_points(a.id);
   raise exception 'Suspended studio accepted award';
 exception when insufficient_privilege then
   if sqlerrm<>'El estudio esta suspendido o inactivo y no puede otorgar beneficios.' then raise; end if;
 end;
 if (select count(*) from public.flow_point_ledger)<>n then raise exception 'Ledger changed'; end if;
 raise notice 'PASS: active artist cannot award for suspended studio; ledger unchanged';
end $$;
rollback;
