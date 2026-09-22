-- ===========================================================================
-- Supabase-alike bootstrap for a plain PostgreSQL instance
-- ===========================================================================
-- The migration in supabase/migrations/ is written for a Supabase project,
-- which supplies an `auth` schema, three roles, and a set of default table
-- privileges. This file recreates exactly those pieces so the migration - and
-- more importantly its RLS policies - can be exercised against a local
-- Postgres with no Docker and no hosted project.
--
-- Everything here mirrors what Supabase actually does. Where it differs, the
-- test results would not mean anything, so it is worth reading rather than
-- trusting.
-- ===========================================================================

-- Supabase installs extensions into their own schema.
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
-- anon           - an unauthenticated visitor
-- authenticated  - a signed-in user
-- service_role   - the key used by Edge Functions; BYPASSRLS
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- So that the test session can switch into these roles.
grant anon, authenticated, service_role to postgres;

-- ---------------------------------------------------------------------------
-- auth schema
-- ---------------------------------------------------------------------------

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                  uuid primary key default extensions.gen_random_uuid(),
  email               text unique,
  encrypted_password  text,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- Supabase's own definition: reads the `sub` claim that PostgREST puts into a
-- GUC for the duration of the request. This is the single most important
-- function in the whole security model, so it is reproduced verbatim in
-- behaviour rather than approximated.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Default privileges
-- ---------------------------------------------------------------------------
-- This is the part people forget when reasoning about Supabase security: every
-- table created in `public` is automatically granted to anon and authenticated.
-- RLS is what holds the line, not the absence of a GRANT. The migration's own
-- REVOKE statements only make sense on top of this.
-- ---------------------------------------------------------------------------

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Test helpers
-- ---------------------------------------------------------------------------

create schema if not exists test;

create table if not exists test.results (
  id      serial primary key,
  label   text not null,
  passed  boolean not null,
  detail  text
);

/**
 * Runs `stmt` as `who` with `uid` as the JWT subject, and records whether the
 * outcome matched `expect`:
 *
 *   'ok'        - the statement must succeed
 *   'error'     - the statement must raise (privilege or check violation)
 *   'no_rows'   - the statement must succeed but affect zero rows, which is how
 *                 RLS refuses an UPDATE or DELETE: it filters the rows out
 *                 rather than erroring
 */
create or replace function test.check(
  label   text,
  who     text,
  uid     uuid,
  stmt    text,
  expect  text
) returns void
language plpgsql
as $fn$
declare
  affected  bigint := -1;
  failed    boolean := false;
  detail    text := '';
begin
  begin
    execute format('set local role %I', who);
    if uid is null then
      perform set_config('request.jwt.claims', '', true);
    else
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', uid::text, 'role', who)::text,
        true
      );
    end if;

    execute stmt;
    get diagnostics affected = ROW_COUNT;

    if expect = 'error' then
      failed := true;
      detail := format('expected an error, but the statement succeeded (%s rows)', affected);
    elsif expect = 'no_rows' and affected <> 0 then
      failed := true;
      detail := format('expected 0 rows affected, got %s', affected);
    else
      detail := format('%s rows', affected);
    end if;

  exception when others then
    if expect = 'error' then
      detail := format('%s: %s', sqlstate, left(sqlerrm, 90));
    else
      failed := true;
      detail := format('unexpected %s: %s', sqlstate, left(sqlerrm, 90));
    end if;
  end;

  execute 'reset role';
  insert into test.results (label, passed, detail) values (label, not failed, detail);
end;
$fn$;

/** Asserts a scalar SQL expression evaluates to true, as `who`. */
create or replace function test.expect_true(
  label  text,
  who    text,
  uid    uuid,
  query  text
) returns void
language plpgsql
as $fn$
declare
  result  boolean;
  failed  boolean := false;
  detail  text := '';
begin
  begin
    execute format('set local role %I', who);
    if uid is null then
      perform set_config('request.jwt.claims', '', true);
    else
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', uid::text, 'role', who)::text,
        true
      );
    end if;

    execute query into result;
    failed := result is distinct from true;
    detail := format('got %s', coalesce(result::text, 'null'));
  exception when others then
    failed := true;
    detail := format('%s: %s', sqlstate, left(sqlerrm, 90));
  end;

  execute 'reset role';
  insert into test.results (label, passed, detail) values (label, not failed, detail);
end;
$fn$;
