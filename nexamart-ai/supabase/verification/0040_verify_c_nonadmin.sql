-- ============================================================================
-- 0040_verify_c_nonadmin.sql
-- ============================================================================
-- SECTION C of 0040 verification. The three admin RPCs must be REFUSED for a
-- non-admin.
--
-- RUN THIS FILE ON ITS OWN. It returns exactly one row.
--
-- All three are SECURITY DEFINER, which bypasses RLS. That is exactly why the
-- admin check lives inside the function body. If these calls SUCCEED for a
-- non-admin, any signed-in customer can read platform commission, net revenue
-- and refund volumes.
--
-- The assumed identity and its role are returned on the row, so this is a
-- plain grid with no need to read the notices panel.
--
-- This script is read-only.
-- ============================================================================

do $$
declare
  v_who    uuid;
  v_role   text;
begin
  -- Prefer a real customer, since that is the role that must never read this.
  select p.id, p.role::text
    into v_who, v_role
    from public.profiles p
   where p.role <> 'admin'::public.user_role
     and not exists (
       select 1 from public.vendors v where v.user_id = p.id
     )
   limit 1;

  -- Otherwise any non-admin will do.
  if v_who is null then
    select p.id, p.role::text
      into v_who, v_role
      from public.profiles p
     where p.role <> 'admin'::public.user_role
     limit 1;
  end if;

  if v_who is null then
    raise exception 'no non-admin profile exists, this section cannot run';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_who::text, 'role', 'authenticated')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_who::text, true);

  -- Each branch records whether the call was REFUSED. A boolean column is
  -- used instead of notices because the SQL Editor does not reliably surface
  -- the notices panel, and returning rows puts the answer in the grid.
  -- No ON COMMIT DROP. The SQL Editor may run each statement as its own
  -- transaction, so a commit-drop temp table would vanish before the final
  -- SELECT could read it.
  create temp table verify_c (
    step text primary key,
    refused boolean not null,
    detail text
  );

  -- Recorded here rather than re-queried later, so the identity actually
  -- assumed above is the identity reported below.
  insert into verify_c values
    ('identity', true, 'assumed role=' || v_role || ' id=' || v_who::text);

  begin
    perform * from public.admin_financial_summary(now() - interval '5 days', now());
    insert into verify_c values
      ('030 totals', false, 'LEAK: a non-admin read admin_financial_summary');
  exception
    when others then
      insert into verify_c values
        ('030 totals', true, 'refused: ' || sqlerrm);
  end;

  begin
    perform * from public.admin_daily_commission(now() - interval '5 days', now());
    insert into verify_c values
      ('031 daily series', false, 'LEAK: a non-admin read admin_daily_commission');
  exception
    when others then
      insert into verify_c values
        ('031 daily series', true, 'refused: ' || sqlerrm);
  end;

  begin
    perform * from public.admin_refunds_in_window(now() - interval '5 days', now());
    insert into verify_c values
      ('032 refunds', false, 'LEAK: a non-admin read admin_refunds_in_window');
  exception
    when others then
      insert into verify_c values
        ('032 refunds', true, 'refused: ' || sqlerrm);
  end;

end;
$$;

-- The grid the Editor actually renders. ok = every call was refused.
select c.step as check,
       c.refused as ok,
       c.detail
  from verify_c c
 order by case c.step
           when '030 totals' then 1
           when '031 daily series' then 2
           when '032 refunds' then 3
           else 0
         end;