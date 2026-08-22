-- ============================================================================
-- NexaMart AI - 0010_system_settings_live.sql
-- Live, DB-backed platform settings (Priority #17A).
--
-- Turns the previously-empty `system_settings` table into the single source of
-- truth for site identity, tax, shipping and payment toggles. Additive only:
--
--   1) Seed defaults (idempotent: ON CONFLICT DO NOTHING) whose values exactly
--      match current storefront behaviour so nothing silently changes.
--   2) RLS policies:
--        * public_read  -> anon + authenticated may SELECT a strict whitelist
--          of keys (enough for the storefront to price and identify itself).
--        * admin_read   -> admins may SELECT every key.
--      No direct INSERT/UPDATE/DELETE policy: writes go through the admin RPC
--      below so non-whitelisted keys / invalid types can never be injected.
--   3) SECURITY DEFINER RPC public.set_platform_settings(p_settings jsonb)
--      -> admin-only, whitelist-checked, type-checked batch upsert.
--   4) BEFORE INSERT trigger on orders enforcing bank_pay_later_enabled
--      server-side (this is the ONLY path that creates orders, so the check
--      cannot be bypassed by calling an API directly).
--
-- Idempotent migration: safe to re-run.
-- ============================================================================

-- 1. Seed defaults ------------------------------------------------------------
insert into public.system_settings (key, value, description) values
  ('site_name',                   '"NexaMart AI"'::jsonb,                                              'Store name shown in the header, footer, auth screens and emails'),
  ('site_description',            '"Your trusted multi-vendor marketplace for amazing products from trusted sellers."'::jsonb, 'Tagline / meta description'),
  ('support_email',               '"support@nexamart-ai.com"'::jsonb,                                  'Support address used in transactional emails'),
  ('currency',                    '"KES"'::jsonb,                                                      'Store currency code'),
  ('tax_rate',                    '16'::jsonb,                                                         'VAT percentage applied to the product subtotal'),
  ('standard_shipping_cost',      '250'::jsonb,                                                        'Flat fee for standard delivery'),
  ('express_shipping_cost',       '600'::jsonb,                                                        'Flat fee for express delivery'),
  ('pickup_enabled',              'true'::jsonb,                                                       'Whether store pickup is offered at checkout'),
  ('express_enabled',             'true'::jsonb,                                                       'Whether express delivery is offered at checkout'),
  ('county_surcharges',           '{"Nairobi":150,"Mombasa":300,"Kisumu":250,"Nakuru":200,"Eldoret":350,"Uasin Gishu":350}'::jsonb, 'Extra delivery fee per county'),
  ('default_county_surcharge',    '500'::jsonb,                                                        'Fallback surcharge for counties not listed'),
  ('mpesa_enabled',               'true'::jsonb,                                                       'M-Pesa STK Push checkout'),
  ('card_enabled',                'true'::jsonb,                                                       'Credit/debit card checkout (simulated gateway)'),
  ('bank_pay_later_enabled',      'true'::jsonb,                                                       'Bank transfer / Pay Later checkout')
on conflict (key) do nothing;

-- 2. RLS policies ---------------------------------------------------------------
create policy "system_settings_public_read"
  on public.system_settings for select
  to anon, authenticated
  using (
    key in (
      'site_name', 'site_description', 'support_email', 'currency', 'tax_rate',
      'standard_shipping_cost', 'express_shipping_cost',
      'pickup_enabled', 'express_enabled',
      'county_surcharges', 'default_county_surcharge',
      'mpesa_enabled', 'card_enabled', 'bank_pay_later_enabled'
    )
  );

create policy "system_settings_admin_read"
  on public.system_settings for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- 3. Admin settings RPC ----------------------------------------------------------
create or replace function public.set_platform_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key    text;
  v_value  jsonb;
  v_num    numeric;
  v_whitelist text[] := array[
    'site_name', 'site_description', 'support_email', 'currency', 'tax_rate',
    'standard_shipping_cost', 'express_shipping_cost',
    'pickup_enabled', 'express_enabled',
    'county_surcharges', 'default_county_surcharge',
    'mpesa_enabled', 'card_enabled', 'bank_pay_later_enabled'
  ];
begin
  -- Admin-only.
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Only admins can update platform settings';
  end if;

  if jsonb_typeof(p_settings) <> 'object' then
    raise exception 'p_settings must be a JSON object';
  end if;

  -- Validate every key/value before touching the table (atomic).
  for v_key, v_value in select * from jsonb_each(p_settings) loop
    if not (v_key = any(v_whitelist)) then
      raise exception 'Setting "%" is not configurable', v_key;
    end if;

    case v_key
      when 'tax_rate' then
        if jsonb_typeof(v_value) <> 'number' then
          raise exception 'tax_rate must be a number';
        end if;
        v_num := v_value::numeric;
        if v_num < 0 or v_num > 100 then
          raise exception 'tax_rate must be between 0 and 100';
        end if;
      when 'standard_shipping_cost', 'express_shipping_cost', 'default_county_surcharge' then
        if jsonb_typeof(v_value) <> 'number' then
          raise exception '% must be a number', v_key;
        end if;
        v_num := v_value::numeric;
        if v_num < 0 then
          raise exception '% must not be negative', v_key;
        end if;
      when 'pickup_enabled', 'express_enabled', 'mpesa_enabled', 'card_enabled', 'bank_pay_later_enabled' then
        if jsonb_typeof(v_value) <> 'boolean' then
          raise exception '% must be a boolean', v_key;
        end if;
      when 'county_surcharges' then
        if jsonb_typeof(v_value) <> 'object' then
          raise exception 'county_surcharges must be a JSON object of county -> fee';
        end if;
        if exists (
          select 1 from jsonb_each(v_value)
          where jsonb_typeof(value) <> 'number' or value::numeric < 0
        ) then
          raise exception 'county_surcharges must map each county to a non-negative number';
        end if;
      when 'site_name', 'site_description', 'support_email', 'currency' then
        if jsonb_typeof(v_value) <> 'string' then
          raise exception '% must be a string', v_key;
        end if;
      else
        null;
    end case;
  end loop;

  -- Upsert (all values already validated above).
  for v_key, v_value in select * from jsonb_each(p_settings) loop
    insert into public.system_settings (key, value)
    values (v_key, v_value)
    on conflict (key) do update set value = excluded.value;
  end loop;
end;
$$;

revoke all on function public.set_platform_settings(jsonb) from public;
grant execute on function public.set_platform_settings(jsonb) to authenticated;

-- 4. Server-side bank / Pay Later enforcement -----------------------------------
-- Orders are created from the client, so the only reliable server-side gate is a
-- BEFORE INSERT trigger. Missing setting = enabled (safe default).
create or replace function public.enforce_orders_payment_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_pay_later jsonb;
begin
  if NEW.payment_method = 'bank' or NEW.payment_type = 'later' then
    select value into v_bank_pay_later
      from public.system_settings
     where key = 'bank_pay_later_enabled';

    if v_bank_pay_later is not distinct from 'false'::jsonb then
      raise exception 'Bank transfer and Pay Later are currently disabled';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_orders_enforce_payment_settings on public.orders;
create trigger trg_orders_enforce_payment_settings
  before insert on public.orders
  for each row execute function public.enforce_orders_payment_settings();

-- ============================================================================
-- End of migration
-- ============================================================================
