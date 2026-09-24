begin;

create or replace function public.studio_flow_guard_unique_client_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
begin
  if v_email = '' then
    new.email := null;
    return new;
  end if;

  if exists (
    select 1
    from public.profiles profile
    where lower(trim(coalesce(profile.email, ''))) = v_email
      and profile.id is distinct from new.profile_id
  ) then
    raise exception 'Este correo ya pertenece a una cuenta de Studio Flow. Inicia sesion para continuar.';
  end if;

  if exists (
    select 1
    from public.clients client
    where lower(trim(coalesce(client.email, ''))) = v_email
      and client.id is distinct from new.id
  ) then
    raise exception 'Este correo ya esta registrado en Studio Flow. Usa el contacto existente o inicia sesion.';
  end if;

  new.email := v_email;
  return new;
end;
$$;

drop trigger if exists studio_flow_unique_client_email_guard on public.clients;
create trigger studio_flow_unique_client_email_guard
before insert or update of email, profile_id on public.clients
for each row execute function public.studio_flow_guard_unique_client_email();

do $$
declare
  definition text;
  expected text := E'  if length(v_name) < 3 or length(v_name) > 120 then raise exception ''Escribe tu nombre completo.''; end if;\n  if v_email !~ ''^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'' then raise exception ''Escribe un correo valido.''; end if;';
  replacement text := expected || E'\n  if exists(select 1 from profiles p where lower(trim(coalesce(p.email, ''''))) = v_email) then\n    raise exception ''Este correo ya pertenece a una cuenta de Studio Flow. Inicia sesion para reservar.'';\n  end if;';
begin
  select pg_get_functiondef(
    'public.studio_flow_public_book_google_reservation(uuid,uuid[],uuid,text,text,text,text)'::regprocedure
  ) into definition;

  if position(expected in definition) = 0 then
    raise exception 'Public booking email validation block was not found';
  end if;

  execute replace(definition, expected, replacement);
end;
$$;

revoke all on function public.studio_flow_guard_unique_client_email() from public;

commit;
