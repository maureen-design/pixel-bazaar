-- ============================================================================
-- NexaMart AI - verification/0036_verify.sql
-- ============================================================================
-- Run AFTER 0036_bank_transfer_fail_closed.sql.
-- Read-only. Run every section; all of section 1-3 must report ok = true.
-- ============================================================================


-- 1. The settings rows now exist --------------------------------------------
select
  'settings rows present' as check,
  count(*) filter (where key = 'bank_transfer_enabled')   = 1
  and count(*) filter (where key = 'bank_name')           = 1
  and count(*) filter (where key = 'bank_account_name')   = 1
  and count(*) filter (where key = 'bank_account_number') = 1
  as ok,
  count(*) as rows_found
from public.system_settings
where key in ('bank_transfer_enabled', 'bank_name',
              'bank_account_name', 'bank_account_number');


-- 2. Current effective state -------------------------------------------------
-- This is the answer to "can a customer pay by bank transfer right now?".
select
  'is_bank_transfer_ready' as check,
  public.is_bank_transfer_ready() as enabled_and_complete;

-- Expect FALSE until an admin fills in the details.


-- 3. The guard is fail-closed, not fail-open --------------------------------
-- Must be true. A fail-open guard is the bug this migration fixes.
select
  'guard is SECURITY DEFINER' as check,
  p.prosecdef as ok,
  p.proconfig as pinned_search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'enforce_bank_transfer_enabled';

-- NOTE: check proconfig too. It should contain search_path="".
-- (ok above asserts only the definer flag; the search_path is shown for review.)


-- 4. The trigger is actually attached to orders ------------------------------
select
  'bank guard trigger on orders' as check,
  count(*) = 1 as ok,
  string_agg(tgname, ', ') as triggers
from pg_trigger
where tgrelid = 'public.orders'::regclass
  and not tgisinternal
  and tgname = 'trg_orders_enforce_bank_transfer';


-- 5. BLOCKED: bank order with details missing (the bug) ---------------------
-- Expect: ERROR "Bank transfer is not available right now."
-- Run inside a transaction you roll back, or simply expect the failure.
insert into public.orders (
  user_id, vendor_id, order_number, total_amount,
  shipping_address, payment_method
)
select
  (select id from public.profiles where role = 'admin' limit 1),
  (select id from public.vendors limit 1),
  'VERIFY-BANK-BLOCKED-' || substr(md5(random()::text), 1, 8),
  100.00,
  'Test Address, Nairobi',
  'bank';

-- If this SUCCEEDS, the fix did not apply. Stop and re-run the migration.


-- 6. ALLOWED: mpesa order still works (no regression) ------------------------
-- Expect: INSERT 0 1. Clean up the probe row afterwards.
insert into public.orders (
  user_id, vendor_id, order_number, total_amount,
  shipping_address, payment_method
)
select
  (select id from public.profiles where role = 'admin' limit 1),
  (select id from public.vendors limit 1),
  'VERIFY-MPESA-OK-' || substr(md5(random()::text), 1, 8),
  100.00,
  'Test Address, Nairobi',
  'mpesa';

delete from public.orders where order_number like 'VERIFY-MPESA-OK-%';


-- 7. To ENABLE bank transfer later ------------------------------------------
-- Run this ONLY once real account details exist, then re-check section 2.
--
-- update public.system_settings set value = to_jsonb('Equity Bank'::text)  where key = 'bank_name';
-- update public.system_settings set value = to_jsonb('NexaMart Ltd'::text) where key = 'bank_account_name';
-- update public.system_settings set value = to_jsonb('1234567890'::text)  where key = 'bank_account_number';
-- update public.system_settings set value = 'true'::jsonb                  where key = 'bank_transfer_enabled';
--
-- Section 2 must then return true, AND checkout must display those details.
-- ============================================================================
