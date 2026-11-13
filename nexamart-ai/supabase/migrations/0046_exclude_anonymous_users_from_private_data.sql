-- Work Package 1: anonymous AI identities must not inherit customer privileges.
--
-- Supabase anonymous Auth sessions carry the PostgreSQL "authenticated" role.
-- The guest AI client is deliberately isolated from the storefront Auth client,
-- but a determined visitor can still call the Data API with their anonymous
-- JWT. These restrictive policies ensure that JWT cannot access private
-- customer/vendor records or write to public catalogue tables.
--
-- Public catalogue SELECT policies are intentionally preserved.

do $$
declare
  t text;
  private_tables text[] := array[
    'profiles',
    'cart_items',
    'wishlist_items',
    'coupons',
    'orders',
    'order_items',
    'notifications',
    'audit_logs',
    'activity_logs',
    'addresses',
    'vendor_private',
    'vendor_payouts',
    'order_refunds',
    'vendor_ledger'
  ];
  public_write_tables text[] := array[
    'vendors',
    'products',
    'categories',
    'reviews',
    'system_settings'
  ];
  policy_expr text := 'coalesce((auth.jwt() ->> ''is_anonymous'')::boolean, false) = false';
begin
  foreach t in array private_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists nexa_non_anonymous_access on public.%I', t);
      execute format(
        'create policy nexa_non_anonymous_access on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
        t, policy_expr, policy_expr
      );
    end if;
  end loop;

  -- These tables have intentional public SELECT policies. Restrict only
  -- mutations by anonymous Auth identities, leaving catalogue browsing intact.
  foreach t in array public_write_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists nexa_non_anonymous_insert on public.%I', t);
      execute format('drop policy if exists nexa_non_anonymous_update on public.%I', t);
      execute format('drop policy if exists nexa_non_anonymous_delete on public.%I', t);

      execute format(
        'create policy nexa_non_anonymous_insert on public.%I as restrictive for insert to authenticated with check (%s)',
        t, policy_expr
      );
      execute format(
        'create policy nexa_non_anonymous_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
        t, policy_expr, policy_expr
      );
      execute format(
        'create policy nexa_non_anonymous_delete on public.%I as restrictive for delete to authenticated using (%s)',
        t, policy_expr
      );
    end if;
  end loop;
end;
$$;

-- create_order() is SECURITY DEFINER, so table RLS alone is not enough to
-- stop an anonymous Auth JWT from calling the checkout RPC directly.
create or replace function public.block_anonymous_order_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Create a customer account before placing an order';
  end if;
  return new;
end;
$$;

revoke all on function public.block_anonymous_order_insert() from public;
grant execute on function public.block_anonymous_order_insert() to authenticated;

drop trigger if exists trg_block_anonymous_order_insert on public.orders;
create trigger trg_block_anonymous_order_insert
  before insert on public.orders
  for each row execute function public.block_anonymous_order_insert();

comment on function public.block_anonymous_order_insert() is
  'Prevents Supabase anonymous Auth identities from using the SECURITY DEFINER checkout RPC.';
