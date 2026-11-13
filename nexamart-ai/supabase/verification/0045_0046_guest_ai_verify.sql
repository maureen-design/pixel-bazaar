-- Manual verification queries for migrations 0045 and 0046.
-- Run in the Supabase SQL Editor AFTER applying both migrations to a staging project.

-- 1. Quota tables must have RLS enabled and remain inaccessible to browser roles.
select c.relname,
       c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', format('public.%I', c.relname), 'SELECT') as anon_can_select,
       has_table_privilege('authenticated', format('public.%I', c.relname), 'SELECT') as authenticated_can_select,
       has_table_privilege('service_role', format('public.%I', c.relname), 'SELECT') as service_role_can_select
  from pg_class c
 where c.oid in (
   'public.ai_request_daily_usage'::regclass,
   'public.ai_request_minute_usage'::regclass,
   'public.ai_global_daily_usage'::regclass
 )
 order by c.relname;

-- Expected: RLS enabled; anon/authenticated SELECT false; service_role SELECT true.

-- 2. Only service_role may execute the quota reservation RPC.
select
  has_function_privilege('anon', 'public.reserve_ai_request(uuid,text,boolean,integer,integer,integer)', 'EXECUTE') as anon_can_reserve,
  has_function_privilege('authenticated', 'public.reserve_ai_request(uuid,text,boolean,integer,integer,integer)', 'EXECUTE') as authenticated_can_reserve,
  has_function_privilege('service_role', 'public.reserve_ai_request(uuid,text,boolean,integer,integer,integer)', 'EXECUTE') as service_role_can_reserve;

-- Expected: false, false, true.

-- 3. Confirm the anonymous-identity restrictive policies exist.
select schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and policyname like 'nexa_non_anonymous_%'
 order by tablename, policyname;

-- 4. Confirm the checkout trigger is installed.
select tgname, tgenabled
  from pg_trigger
 where tgrelid = 'public.orders'::regclass
   and tgname = 'trg_block_anonymous_order_insert'
   and not tgisinternal;

-- Expected: exactly one enabled trigger.

-- 5. Confirm the global safeguard configuration can be read by the Edge Function.
-- AI_GLOBAL_DAILY_REQUEST_LIMIT defaults to 500 requests per Nairobi calendar day.
-- This is a request-count ceiling, not a provider-currency spending cap.
