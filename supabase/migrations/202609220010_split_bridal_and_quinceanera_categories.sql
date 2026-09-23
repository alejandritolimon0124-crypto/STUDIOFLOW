begin;

update public.service_categories
set name = 'Novias', slug = 'novias'
where lower(name) = 'novias y eventos';

insert into public.service_categories(name, slug, status)
values ('Paquete XV años', 'paquete-xv-anos', 'active')
on conflict (name) do update
set status = 'active';

commit;
