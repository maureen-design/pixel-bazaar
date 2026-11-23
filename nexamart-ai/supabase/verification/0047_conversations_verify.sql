-- NexaMart AI - verification/0047_conversations_verify.sql
-- Run only after migration 0047 is applied. Read-only catalog checks.
-- Never run against production customer data.

select '01 both conversation tables exist' as check_name,
       (count(*) = 2)::text as ok,
       coalesce(string_agg(table_name, ', '), 'missing') as detail
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'shopping_conversations',
    'shopping_conversation_messages'
  );

select '02 RLS enabled on both tables' as check_name,
       (count(*) = 2)::text as ok,
       coalesce(string_agg(relname, ', '), 'missing') as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'shopping_conversations',
    'shopping_conversation_messages'
  )
  and c.relrowsecurity;

select '03 ownership references auth.users with cascade' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(conname, ', '), 'missing') as detail
from pg_constraint
where conrelid = 'public.shopping_conversations'::regclass
  and contype = 'f'
  and confrelid = 'auth.users'::regclass
  and confdeltype = 'c';

select '04 message parent references conversation with cascade' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(conname, ', '), 'missing') as detail
from pg_constraint
where conrelid = 'public.shopping_conversation_messages'::regclass
  and contype = 'f'
  and confrelid = 'public.shopping_conversations'::regclass
  and confdeltype = 'c';

select '05 all five expected policies exist' as check_name,
       (count(*) = 5)::text as ok,
       coalesce(string_agg(policyname || ':' || cmd, ', ' order by policyname), 'missing') as detail
from pg_policies
where schemaname = 'public'
  and tablename in (
    'shopping_conversations',
    'shopping_conversation_messages'
  );

select '06 no browser message insert/update/delete policy' as check_name,
       (count(*) = 0)::text as ok,
       coalesce(string_agg(policyname, ', '), 'none') as detail
from pg_policies
where schemaname = 'public'
  and tablename = 'shopping_conversation_messages'
  and cmd <> 'SELECT';

select '07 authenticated message INSERT revoked' as check_name,
       (not has_table_privilege('authenticated', 'public.shopping_conversation_messages', 'INSERT'))::text as ok,
       'INSERT privilege must be false' as detail;

select '08 authenticated message UPDATE revoked' as check_name,
       (not has_table_privilege('authenticated', 'public.shopping_conversation_messages', 'UPDATE'))::text as ok,
       'UPDATE privilege must be false' as detail;

select '09 authenticated message DELETE revoked' as check_name,
       (not has_table_privilege('authenticated', 'public.shopping_conversation_messages', 'DELETE'))::text as ok,
       'DELETE privilege must be false' as detail;

select '10 authenticated message SELECT granted' as check_name,
       has_table_privilege('authenticated', 'public.shopping_conversation_messages', 'SELECT')::text as ok,
       'SELECT privilege must be true' as detail;

select '11 sequencing RPC exists' as check_name,
       (
         has_function_privilege(
           'authenticated',
           'public.append_shopping_conversation_user_message(uuid,text,uuid)',
           'EXECUTE'
         )
         and not has_function_privilege(
           'anon',
           'public.append_shopping_conversation_user_message(uuid,text,uuid)',
           'EXECUTE'
         )
       )::text as ok,
       'authenticated execute=true, anon execute=false' as detail;

select '12 sequencing RPC is SECURITY DEFINER with empty search_path' as check_name,
       (
         exists (
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'append_shopping_conversation_user_message'
             and p.prosecdef
             and p.proconfig @> array['search_path=']::text[]
         )
       )::text as ok,
       'missing function or proconfig/SECURITY DEFINER mismatch' as detail;

select '13 sequencing RPC owner and signature' as check_name,
       (
         exists (
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           join pg_roles r on r.oid = p.proowner
           where n.nspname = 'public'
             and p.proname = 'append_shopping_conversation_user_message'
             and r.rolname = 'postgres'
             and r.rolbypassrls
             and has_table_privilege(p.proowner, 'public.shopping_conversation_messages', 'SELECT')
             and has_table_privilege(p.proowner, 'public.shopping_conversation_messages', 'INSERT')
             and has_table_privilege(p.proowner, 'public.shopping_conversation_messages', 'UPDATE')
             and has_table_privilege(p.proowner, 'public.shopping_conversations', 'SELECT')
             and has_table_privilege(p.proowner, 'public.shopping_conversations', 'UPDATE')
         )
       )::text as ok,
       'owner must be postgres, bypass RLS, and hold the RPC table privileges' as detail;

select '14 ownership trigger is attached correctly' as check_name,
       (
         exists (
           select 1
           from pg_trigger t
           where t.tgname = 'trg_protect_shopping_conversation_ownership'
             and not t.tgisinternal
             and t.tgrelid = 'public.shopping_conversations'::regclass
             and t.tgfoid =
               'public.protect_shopping_conversation_ownership()'::regprocedure
             and t.tgtype = 23
         )
       )::text as ok,
       'expected BEFORE ROW INSERT OR UPDATE trigger tgtype=23' as detail;

select '15 ownership trigger function is SECURITY INVOKER and has empty search_path' as check_name,
       (
         exists (
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'protect_shopping_conversation_ownership'
             and not p.prosecdef
             and p.proconfig @> array['search_path=']::text[]
         )
       )::text as ok,
       'missing function or SECURITY INVOKER/empty search_path mismatch' as detail;

select '16 deletion trigger is attached to conversation updates' as check_name,
       (
         exists (
           select 1
           from pg_trigger t
           where t.tgname = 'trg_purge_deleted_shopping_conversation_messages'
             and not t.tgisinternal
             and t.tgrelid = 'public.shopping_conversations'::regclass
             and t.tgfoid =
               'public.purge_deleted_shopping_conversation_messages()'::regprocedure
             and t.tgtype = 19
         )
       )::text as ok,
       'expected BEFORE ROW UPDATE trigger tgtype=19' as detail;

select '17 deletion trigger function is SECURITY DEFINER with empty search_path' as check_name,
       (
         exists (
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'purge_deleted_shopping_conversation_messages'
             and p.prosecdef
             and p.proconfig @> array['search_path=']::text[]
         )
       )::text as ok,
       'missing function or SECURITY DEFINER/empty search_path mismatch' as detail;

select '18 deletion purge function cannot be executed by browser roles' as check_name,
       (
         not has_function_privilege(
           'authenticated',
           'public.purge_deleted_shopping_conversation_messages()',
           'EXECUTE'
         )
         and not has_function_privilege(
           'anon',
           'public.purge_deleted_shopping_conversation_messages()',
           'EXECUTE'
         )
         and exists (
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           join pg_roles r on r.oid = p.proowner
           where n.nspname = 'public'
             and p.proname = 'purge_deleted_shopping_conversation_messages'
             and r.rolname = 'postgres'
             and r.rolbypassrls
             and has_table_privilege(p.proowner, 'public.shopping_conversation_messages', 'DELETE')
         )
       )::text as ok,
       'browser execute=false; owner=postgres, bypass RLS, and DELETE privilege required' as detail;

select '19 title length constraint exists' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(conname, ', '), 'missing') as detail
from pg_constraint
where conrelid = 'public.shopping_conversations'::regclass
  and contype = 'c'
  and conname = 'shopping_conversations_title_length';

select '19a status constraint exists' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(conname, ', '), 'missing') as detail
from pg_constraint
where conrelid = 'public.shopping_conversations'::regclass
  and contype = 'c'
  and conname = 'shopping_conversations_status_check';

select '19b context size constraint exists' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(conname, ', '), 'missing') as detail
from pg_constraint
where conrelid = 'public.shopping_conversations'::regclass
  and contype = 'c'
  and conname = 'shopping_conversations_context_size';

select '19c context object constraint exists' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(conname, ', '), 'missing') as detail
from pg_constraint
where conrelid = 'public.shopping_conversations'::regclass
  and contype = 'c'
  and conname = 'shopping_conversations_context_object';

select '19d context version constraint exists' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(conname, ', '), 'missing') as detail
from pg_constraint
where conrelid = 'public.shopping_conversations'::regclass
  and contype = 'c'
  and conname = 'shopping_conversations_context_version';

select '19e revision constraint exists' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(conname, ', '), 'missing') as detail
from pg_constraint
where conrelid = 'public.shopping_conversations'::regclass
  and contype = 'c'
  and conname = 'shopping_conversations_revision_positive';

select '19f deleted consistency constraint exists' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(conname, ', '), 'missing') as detail
from pg_constraint
where conrelid = 'public.shopping_conversations'::regclass
  and contype = 'c'
  and conname = 'shopping_conversations_deleted_consistency';

select '20 unique sequence constraint exists' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(conname, ', '), 'missing') as detail
from pg_constraint
where conrelid = 'public.shopping_conversation_messages'::regclass
  and contype = 'u'
  and conname = 'shopping_conversation_messages_unique_order';

select '21 unique idempotency constraint exists' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(conname, ', '), 'missing') as detail
from pg_constraint
where conrelid = 'public.shopping_conversation_messages'::regclass
  and contype = 'u'
  and conname = 'shopping_conversation_messages_unique_request';

select '22 chronological message index exists' as check_name,
       (count(*) = 1)::text as ok,
       coalesce(string_agg(indexname, ', '), 'missing') as detail
from pg_indexes
where schemaname = 'public'
  and tablename = 'shopping_conversation_messages'
  and indexname = 'idx_shopping_conversation_messages_chronological';

select '23 existing anonymous restrictive policies remain' as check_name,
       (
         count(*) = 0
       )::text as ok,
       coalesce(string_agg(table_name || '.' || policy_name, ', '), 'none missing') as detail
from (
  values
    ('profiles','nexa_non_anonymous_access','ALL',true,true),
    ('cart_items','nexa_non_anonymous_access','ALL',true,true),
    ('wishlist_items','nexa_non_anonymous_access','ALL',true,true),
    ('coupons','nexa_non_anonymous_access','ALL',true,true),
    ('orders','nexa_non_anonymous_access','ALL',true,true),
    ('order_items','nexa_non_anonymous_access','ALL',true,true),
    ('notifications','nexa_non_anonymous_access','ALL',true,true),
    ('audit_logs','nexa_non_anonymous_access','ALL',true,true),
    ('activity_logs','nexa_non_anonymous_access','ALL',true,true),
    ('addresses','nexa_non_anonymous_access','ALL',true,true),
    ('vendor_private','nexa_non_anonymous_access','ALL',true,true),
    ('vendor_payouts','nexa_non_anonymous_access','ALL',true,true),
    ('order_refunds','nexa_non_anonymous_access','ALL',true,true),
    ('vendor_ledger','nexa_non_anonymous_access','ALL',true,true),
    ('vendors','nexa_non_anonymous_insert','INSERT',false,true),
    ('vendors','nexa_non_anonymous_update','UPDATE',true,true),
    ('vendors','nexa_non_anonymous_delete','DELETE',true,false),
    ('products','nexa_non_anonymous_insert','INSERT',false,true),
    ('products','nexa_non_anonymous_update','UPDATE',true,true),
    ('products','nexa_non_anonymous_delete','DELETE',true,false),
    ('categories','nexa_non_anonymous_insert','INSERT',false,true),
    ('categories','nexa_non_anonymous_update','UPDATE',true,true),
    ('categories','nexa_non_anonymous_delete','DELETE',true,false),
    ('reviews','nexa_non_anonymous_insert','INSERT',false,true),
    ('reviews','nexa_non_anonymous_update','UPDATE',true,true),
    ('reviews','nexa_non_anonymous_delete','DELETE',true,false),
    ('system_settings','nexa_non_anonymous_insert','INSERT',false,true),
    ('system_settings','nexa_non_anonymous_update','UPDATE',true,true),
    ('system_settings','nexa_non_anonymous_delete','DELETE',true,false)
) as expected(table_name, policy_name, command, needs_using, needs_check)
where not exists (
  select 1
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = expected.table_name
    and p.policyname = expected.policy_name
    and p.permissive = 'RESTRICTIVE'
    and p.roles = array['authenticated']::name[]
    and p.cmd = expected.command
    and (
      not expected.needs_using
      or coalesce(p.qual, '') like '%is_anonymous%'
    )
    and (
      not expected.needs_check
      or coalesce(p.with_check, '') like '%is_anonymous%'
    )
);

select '24 cart, wishlist and address RLS remain enabled' as check_name,
       (count(*) = 3)::text as ok,
       coalesce(string_agg(relname, ', '), 'missing') as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('cart_items', 'wishlist_items', 'addresses')
  and c.relrowsecurity;

select '25 guest quota tables have no browser privileges' as check_name,
       (
         not has_table_privilege('anon', 'public.ai_request_daily_usage', 'SELECT')
         and not has_table_privilege('authenticated', 'public.ai_request_daily_usage', 'SELECT')
         and not has_table_privilege('anon', 'public.ai_request_minute_usage', 'SELECT')
         and not has_table_privilege('authenticated', 'public.ai_request_minute_usage', 'SELECT')
         and not has_table_privilege('anon', 'public.ai_global_daily_usage', 'SELECT')
         and not has_table_privilege('authenticated', 'public.ai_global_daily_usage', 'SELECT')
       )::text as ok,
       'all AI usage tables must remain server-only' as detail;

select '26 reserve_ai_request cannot be called by browser roles' as check_name,
       (
         not has_function_privilege(
           'anon',
           'public.reserve_ai_request(uuid,text,boolean,integer,integer,integer)',
           'EXECUTE'
         )
         and not has_function_privilege(
           'authenticated',
           'public.reserve_ai_request(uuid,text,boolean,integer,integer,integer)',
           'EXECUTE'
         )
       )::text as ok,
       'reserve_ai_request must remain service_role-only' as detail;
