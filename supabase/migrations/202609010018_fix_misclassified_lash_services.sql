update service_offerings so
set
  category_id = categories.lash_category_id,
  updated_at = now()
from (
  select
    id as lash_category_id
  from service_categories
  where lower(translate(name, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) = 'colocacion de pestanas'
  order by created_at
  limit 1
) categories
where categories.lash_category_id is not null
  and so.archived_at is null
  and lower(translate(so.name, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) like '%pestana%'
  and so.category_id is distinct from categories.lash_category_id;
