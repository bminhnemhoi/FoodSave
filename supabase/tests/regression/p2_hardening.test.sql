-- P2 hardening regressions (security review 08/10): attempt cap clamp, read-only public views.
begin;
\ir ../_helpers.psql

select plan(5);

-- handover_max_failed_attempts is clamped to 1..10 (failed_attempts itself is capped at 10 by CHECK)
select is(private.handover_max_attempts(), 5, 'default: 5 wrong codes lock the handover');
insert into public.app_settings (key, value, description) values ('handover_max_failed_attempts', '20'::jsonb, 'test')
on conflict (key) do update set value = excluded.value;
select is(private.handover_max_attempts(), 10, 'a setting above 10 is clamped to 10 (the code still locks)');
update public.app_settings set value = '0'::jsonb where key = 'handover_max_failed_attempts';
select is(private.handover_max_attempts(), 1, 'a setting of 0 is clamped to 1');

-- public views are read-only for every client role
select ok(not exists (
  select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p,
                unnest(array['public.public_impact_stats', 'public.public_org_cards']) v
  where has_table_privilege(r, v, p)), 'public views: no write privileges for anon/authenticated');
select ok(has_table_privilege('anon', 'public.public_impact_stats', 'SELECT')
          and has_table_privilege('anon', 'public.public_org_cards', 'SELECT'), 'public views stay readable');

select * from finish();
rollback;
