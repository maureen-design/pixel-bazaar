-- ============================================================================
-- NexaMart AI - 0036_bank_transfer_fail_closed.sql
-- ============================================================================
-- Project : 004 - Fix broken things (Phase 2, money)
-- Item    : 11 - Configure bank details OR disable bank transfer
-- Applied : after 0035_handle_new_user_trigger.sql
-- Authors : Maureen /KIP
--
-- PROBLEM
--   Bank transfer was offered to customers while no account details existed,
--   and the server-side guard could not stop it:
--
--   1. enforce_bank_transfer_enabled() only raised when the setting was
--      EXACTLY 'false'::jsonb. A missing row yields NULL, and
--      "NULL is not distinct from 'false'" is FALSE, so the order passed.
--      The guard was fail-OPEN.
--
--   2. The live project had no 'bank_transfer_enabled' row at all, so the
--      guard always fell through to "allow".
--
--   3. src/lib/settings.ts defaults bankTransferEnabled to true when the
--      key is missing, so checkout offered Bank Transfer to every customer.
--
--   4. Checkout.tsx never rendered bank_name / bank_account_number, so a
--      customer who chose Bank Transfer got a 72h deadline and no account
--      to transfer to.
--
--   Net effect: a customer could place a bank order that nobody could pay,
--   and it would sit in "pending" until the stock-release job killed it.
--
-- FIX
--   1. Seed the missing settings rows with SAFE defaults (enabled = false,
--      details = empty). "on conflict do nothing" never overwrites a
--      deliberate admin choice.
--   2. Rewrite the guard to be fail-CLOSED: the method is rejected unless
--      the flag is explicitly true AND the three details a customer needs
--      are non-empty.
--   3. Expose public.is_bank_transfer_ready() so the frontend and the
--      verification script read one authoritative answer.
--
-- SAFETY
--   - Idempotent: safe to re-run.
--   - No existing orders are affected (the project had 0 orders at time of
--     writing). A pending bank order that predates this fix would only be
--     affected on INSERT, so nothing already in flight is disturbed.
--   - If bank details are later added and the flag flipped to true, this
--     migration does not need to be re-applied.
-- ============================================================================

-- 1. Safe defaults ------------------------------------------------------------
-- Any of these may already exist; "on conflict do nothing" preserves the
-- admin's current value. Only genuinely missing rows are seeded.
insert into public.system_settings (key, value, description) values
  ('bank_transfer_enabled',       'false'::jsonb, 'Bank Transfer payment method'),
  ('bank_name',                   '""'::jsonb,    'Bank name for transfers'),
  ('bank_account_name',           '""'::jsonb,    'Bank account name for transfers'),
  ('bank_account_number',         '""'::jsonb,    'Bank account number for transfers'),
  ('bank_branch',                 '""'::jsonb,    'Bank branch for transfers'),
  ('bank_swift_code',             '""'::jsonb,    'Bank SWIFT/BIC code')
on conflict (key) do nothing;

-- bank_transfer_enabled defaults to FALSE here, which is the whole point:
-- until an admin fills in real account details the method stays off.

-- 2. Fail-closed guard --------------------------------------------------------
-- Pinned search_path ('') with fully-qualified references, matching 0035.
create or replace function public.enforce_bank_transfer_enabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled           jsonb;
  v_bank_name         text;
  v_account_name      text;
  v_account_number    text;
begin
  if new.payment_method is distinct from 'bank' then
    return new;                                   -- not a bank order, not our business
  end if;

  select s.value into v_enabled
    from public.system_settings s
   where s.key = 'bank_transfer_enabled';

  -- Fail CLOSED: anything other than an explicit boolean true is refused.
  if v_enabled is distinct from 'true'::jsonb then
    raise exception 'Bank transfer is not available right now.'
      using errcode = 'check_violation',
            hint = 'Admin: set bank_transfer_enabled = true and fill in the bank details.';
  end if;

  -- Even when enabled, refuse if the customer would have nothing to pay into.
  select
      max(c.value #>> '{}') filter (where s.key = 'bank_name'),
      max(c.value #>> '{}') filter (where s.key = 'bank_account_name'),
      max(c.value #>> '{}') filter (where s.key = 'bank_account_number')
    into v_bank_name, v_account_name, v_account_number
    from public.system_settings s
   cross join lateral (select s.value) as c(value)
   where s.key in ('bank_name', 'bank_account_name', 'bank_account_number');

  if coalesce(btrim(v_bank_name), '') = ''
     or coalesce(btrim(v_account_name), '') = ''
     or coalesce(btrim(v_account_number), '') = '' then
    raise exception 'Bank transfer is not available right now.'
      using errcode = 'check_violation',
            hint = 'Admin: bank name, account name and account number must all be filled in.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_enforce_bank_transfer on public.orders;
create trigger trg_orders_enforce_bank_transfer
  before insert on public.orders
  for each row execute function public.enforce_bank_transfer_enabled();

-- 3. Authoritative readiness read --------------------------------------------
-- Single source of truth for the frontend and for verification. Returns
-- true only when the method is switched on AND complete.
create or replace function public.is_bank_transfer_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        (max(s.value #>> '{}') filter (where s.key = 'bank_transfer_enabled'))  = 'true'
        and btrim(coalesce(max(s.value #>> '{}') filter (where s.key = 'bank_name'),           '')) <> ''
        and btrim(coalesce(max(s.value #>> '{}') filter (where s.key = 'bank_account_name'),   '')) <> ''
        and btrim(coalesce(max(s.value #>> '{}') filter (where s.key = 'bank_account_number'), '')) <> ''
      from public.system_settings s
      where s.key in ('bank_transfer_enabled', 'bank_name',
                      'bank_account_name', 'bank_account_number')
    ),
    false
  );
$$;

revoke all on function public.is_bank_transfer_ready() from public;
grant execute on function public.is_bank_transfer_ready() to anon, authenticated;
