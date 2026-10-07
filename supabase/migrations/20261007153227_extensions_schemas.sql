-- Migration 1/13 — extensions_schemas (DATA-MODEL §0, §18)
-- Extensions, schema `private`, default function privileges, `private.set_updated_at()`, `private.now()`.

-- ---------------------------------------------------------------------------
-- Extensions (Supabase convention: schema `extensions`; pg_cron lives in `cron`)
-- ---------------------------------------------------------------------------
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Schema `private`: RLS helpers and internal functions. Never exposed through PostgREST
-- (not listed in config.toml [api].schemas). anon/authenticated only get USAGE so that
-- RLS policies can call the helper functions they are explicitly granted EXECUTE on (§9.1).
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Default function privileges (defense in depth for §8.8 "grant execute từng RPC").
-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase additionally grants
-- EXECUTE to anon/authenticated on functions created in `public`. From now on every function
-- created by `postgres` must be granted explicitly to the roles that need it.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- private.set_updated_at(): BEFORE UPDATE trigger for every table with `updated_at`.
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'BEFORE UPDATE trigger: keeps updated_at = now(). Attach to every table that has updated_at (DATA-MODEL §0).';

-- ---------------------------------------------------------------------------
-- private.now(): the clock used by RPCs (DATA-MODEL §0, §17).
-- Reads the `fs.clock` GUC only when the session user is `postgres` (seed scripts, pgTAP time
-- travel). PostgREST logs in as `authenticator`, so API callers can never move the clock.
-- ---------------------------------------------------------------------------
create or replace function private.now()
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_clock text;
begin
  if session_user = 'postgres' then
    v_clock := nullif(current_setting('fs.clock', true), '');
    if v_clock is not null then
      return v_clock::timestamptz;
    end if;
  end if;
  return pg_catalog.now();
end;
$$;

comment on function private.now() is
  'Business clock. = now(), except for session_user postgres with fs.clock set (seed history / pgTAP time travel). DATA-MODEL §17.';

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.now() from public, anon, authenticated;
grant execute on function private.now() to service_role;
