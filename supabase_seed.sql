insert into public.cities (name, color, lat, lng) values
  ('Краснодар', '#2E7D32', 45.0355, 38.9753),
  ('Ростов-на-Дону', '#1565C0', 47.2357, 39.7015),
  ('Севастополь', '#6A1B9A', 44.6167, 33.5254),
  ('Симферополь', '#E65100', 44.9521, 34.1024),
  ('Астрахань', '#AD1457', 46.3497, 48.0408),
  ('Волгоград', '#00695C', 48.7080, 44.5133)
on conflict (name) do update set
  color = excluded.color,
  lat = excluded.lat,
  lng = excluded.lng;

insert into public.sources (name) values
  ('Авито'),
  ('Листовка'),
  ('Яндекс'),
  ('Рекомендация'),
  ('2ГИС'),
  ('Сайт')
on conflict (name) do nothing;

with city_map as (
  select id, name from public.cities
)
insert into public.employees (name, employee_type, city_id, color, phone)
select * from (
  select 'Артем', 'technician', (select id from city_map where name = 'Краснодар'), '#4FC3F7', '' union all
  select 'Эрик', 'technician', (select id from city_map where name = 'Краснодар'), '#AED581', '' union all
  select 'Гриша', 'technician', (select id from city_map where name = 'Краснодар'), '#FFB74D', '' union all
  select 'Алексей', 'technician', (select id from city_map where name = 'Ростов-на-Дону'), '#4FC3F7', '' union all
  select 'Дмитрий', 'technician', (select id from city_map where name = 'Ростов-на-Дону'), '#AED581', '' union all
  select 'Дима', 'technician', (select id from city_map where name = 'Севастополь'), '#4FC3F7', '' union all
  select 'Иван', 'technician', (select id from city_map where name = 'Симферополь'), '#4FC3F7', '' union all
  select 'Игорь', 'technician', (select id from city_map where name = 'Астрахань'), '#4FC3F7', '' union all
  select 'Сергей', 'technician', (select id from city_map where name = 'Волгоград'), '#4FC3F7', '' union all
  select 'Мария', 'call_center', null, '#F48FB1', '' union all
  select 'Анна', 'call_center', null, '#CE93D8', '' union all
  select 'Наталья', 'call_center', null, '#80CBC4', ''
) as seed(name, employee_type, city_id, color, phone)
where not exists (
  select 1
  from public.employees e
  where e.name = seed.name
    and coalesce(e.city_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(seed.city_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
