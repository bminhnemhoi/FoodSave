-- Admin console — lot monitoring by label (UAT M1/P2-12; PRD US-ADM-05, F-64; DATA-MODEL §8.3).
--
-- /admin/offers filters lots by their live freshness label and sorts "red first". The label is computed
-- at read time (ADR-005, never stored), so PostgREST needs it as a *computed field*: plain SQL functions
-- taking a public.offers row. They are SECURITY INVOKER — RLS on offers/food_categories still decides
-- which rows a caller sees (admin aal2 sees all via offers_select; nobody gains access). No table, no
-- policy, no privilege change.
--
--   offer_label(offers)      → freshness_label of a live lot (open / fully_allocated) at now();
--                              'expired' for status expired; null for draft / completed / cancelled.
--   offer_label_rank(offers) → 0 red · 1 yellow · 2 green · 3 expired · 4 no label (sort key).
--   offer_red_at(offers)     → moment the lot turns red (effective_deadline − red threshold of its
--                              category). Coupled to freshness_label v1 by pgTAP (admin_console.test.sql).
--
-- The row parameter is unnamed on purpose: that is how supabase gen types recognises a computed field
-- (Args { "": Row }), so `select('*')` types stay exact.
--
-- Thresholds are NOT duplicated in offer_label (it calls public.freshness_label). offer_red_at mirrors the
-- v1 red thresholds; a new label version must redefine it too (the pgTAP coupling test fails otherwise).

create or replace function public.offer_label(public.offers)
returns public.freshness_label
language sql
stable
parallel safe
set search_path = ''
as $$
  select case
    when ($1).status = 'expired' then 'expired'::public.freshness_label
    when ($1).status in ('open', 'fully_allocated') then
      public.freshness_label(
        ($1).effective_deadline,
        (select c.perishability from public.food_categories c where c.code = ($1).category_code),
        now())
  end;
$$;

comment on function public.offer_label(public.offers) is
  'Computed field (PostgREST): live Xanh/Vàng/Đỏ label of an open/fully_allocated lot at now(); expired for status expired; null otherwise. Invoker — RLS applies. Admin console filter (US-ADM-05).';

create or replace function public.offer_label_rank(public.offers)
returns smallint
language sql
stable
parallel safe
set search_path = ''
as $$
  select (case public.offer_label($1)
    when 'red' then 0
    when 'yellow' then 1
    when 'green' then 2
    when 'expired' then 3
    else 4
  end)::smallint;
$$;

comment on function public.offer_label_rank(public.offers) is
  'Computed field (PostgREST): display priority of offer_label — 0 red, 1 yellow, 2 green, 3 expired, 4 none (DESIGN-SYSTEM §3.6 "Đỏ → Vàng → Xanh → Hết hạn").';

create or replace function public.offer_red_at(public.offers)
returns timestamptz
language sql
stable
parallel safe
set search_path = ''
as $$
  select ($1).effective_deadline - case c.perishability
           when 'cooked' then interval '4 hours'
           when 'fresh' then interval '24 hours'
           else interval '3 days'
         end
  from public.food_categories c
  where c.code = ($1).category_code;
$$;

comment on function public.offer_red_at(public.offers) is
  'Computed field (PostgREST): when the lot turns red = effective_deadline − red_below of its category (label_rules v1, same as freshness_label). Null for drafts. Used by the "turning red within 3 h" KPI.';

revoke all on function public.offer_label(public.offers) from public, anon;
revoke all on function public.offer_label_rank(public.offers) from public, anon;
revoke all on function public.offer_red_at(public.offers) from public, anon;
grant execute on function public.offer_label(public.offers) to authenticated, service_role;
grant execute on function public.offer_label_rank(public.offers) to authenticated, service_role;
grant execute on function public.offer_red_at(public.offers) to authenticated, service_role;
