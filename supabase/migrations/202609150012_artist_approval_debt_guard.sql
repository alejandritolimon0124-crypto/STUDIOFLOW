begin;
do $$
declare d text; marker text := '  update artists';
begin
 select pg_get_functiondef('public.studio_flow_admin_approve_artist(uuid)'::regprocedure) into d;
 if position(marker in d)=0 then raise exception 'Unexpected artist approval function'; end if;
 d:=replace(d,marker,$guard$
  if public.studio_flow_artist_unpaid_commission(p_artist_id)>0 then
    raise exception 'No se puede reactivar: la artista debe liquidar su adeudo pendiente.';
  end if;
$guard$||marker);
 execute d;
end $$;
commit;
