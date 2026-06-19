create or replace function public.studio_flow_artist_get_or_create_service_category(
  p_category_name text
)
returns service_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category service_categories%rowtype;
  v_name text;
  v_slug text;
begin
  v_name := coalesce(nullif(trim(p_category_name), ''), 'Servicios');
  v_slug := trim(both '-' from lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')));
  v_slug := coalesce(nullif(v_slug, ''), 'servicios');

  select *
  into v_category
  from service_categories
  where lower(name) = lower(v_name)
     or slug = v_slug
  order by case when lower(name) = lower(v_name) then 0 else 1 end, created_at
  limit 1;

  if v_category.id is not null then
    update service_categories
    set status = 'active'
    where id = v_category.id
    returning *
    into v_category;

    return v_category;
  end if;

  begin
    insert into service_categories (name, slug, status)
    values (v_name, v_slug, 'active')
    returning *
    into v_category;
  exception
    when unique_violation then
      select *
      into v_category
      from service_categories
      where lower(name) = lower(v_name)
         or slug = v_slug
      order by case when lower(name) = lower(v_name) then 0 else 1 end, created_at
      limit 1;

      if v_category.id is null then
        raise;
      end if;

      update service_categories
      set status = 'active'
      where id = v_category.id
      returning *
      into v_category;
  end;

  return v_category;
end;
$$;

revoke all on function public.studio_flow_artist_get_or_create_service_category(text) from public;
