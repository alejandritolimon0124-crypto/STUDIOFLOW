-- Keep suspended, rejected and archived studios within the ownership limit.
-- Existing duplicates must be resolved explicitly; never delete history here.
create unique index studios_one_per_owner on public.studios(owner_profile_id);

do $$
declare definition text; expected text;
begin
 select pg_get_functiondef('public.studio_flow_bootstrap_studio(text,text,text,text,text,text,numeric,numeric,text)'::regprocedure) into definition;
 expected := E'where studio.archived_at is null\n      and studio.studio_status in (''pending'', ''approved'')';
 if position(expected in definition)=0 then raise exception 'Unexpected studio bootstrap definition; review required'; end if;
 definition:=replace(definition,expected,'where true');
 definition:=replace(definition,'This profile already owns an active or pending studio','Solo puedes registrar un estudio. Administra o solicita la reactivacion del estudio existente.');
 execute definition;
end;
$$;
