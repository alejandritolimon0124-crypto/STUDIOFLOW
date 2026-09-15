begin;
do $$
declare a public.appointments%rowtype; actor uuid; n bigint;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
 select ap.* into a from public.appointments ap
 join public.clients c on c.id=ap.client_id
 join public.profiles p on p.id=c.profile_id
 where ap.studio_id is not null and ap.status='scheduled'
 and c.status='active' and c.archived_at is null and p.status='active' limit 1;
 if a.id is null then raise exception 'Existing studio client appointment required'; end if;
 select profile_id into actor from public.clients where id=a.client_id;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select count(*) into n from public.flow_point_ledger;
 update public.studios set studio_status='suspended' where id=a.studio_id;
 begin
   perform public.studio_flow_client_apply_appointment_reward(a.id,null);
   raise exception 'Suspended studio accepted appointment redemption';
 exception when insufficient_privilege then
   if sqlerrm<>'El estudio esta suspendido o inactivo y no admite canjes de puntos.' then raise; end if;
 end;
 begin
   perform public.studio_flow_client_redeem_flow_points(1,null,a.studio_id);
   raise exception 'Suspended studio accepted direct redemption';
 exception when insufficient_privilege then
   if sqlerrm<>'El estudio esta suspendido o inactivo y no admite canjes de puntos.' then raise; end if;
 end;
 if (select count(*) from public.flow_point_ledger)<>n then raise exception 'Ledger changed'; end if;
 raise notice 'PASS: both studio redemption paths rejected; ledger unchanged';
end $$;
rollback;
