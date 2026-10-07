-- C1: every table in `public` has RLS; definer functions pin search_path; private helpers are not
-- executable by PUBLIC (SECURITY-PRIVACY C1, DATA-MODEL §8.8, skill rls-audit).
begin;

select plan(4);

select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'every public table has row level security enabled');

select is_empty(
  $$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')$$,
  'every security definer function sets search_path');

select is_empty(
  $$select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('public', p.oid, 'EXECUTE')$$,
  'no own function in public/private is executable by PUBLIC');

select is_empty(
  $$select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.proname not in ('is_admin', 'org_has_status')$$,
  'anon can only execute the RLS helpers it needs in private');

select * from finish();
rollback;
