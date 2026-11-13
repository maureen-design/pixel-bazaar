-- Work Package 1: server-enforced AI request limits.
-- Usage tables are intentionally inaccessible to browser roles. Only the
-- ai-assistant Edge Function's service-role client can reserve a request.

create table if not exists public.ai_request_daily_usage (
  usage_date date not null,
  user_id uuid not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (usage_date, user_id)
);

create table if not exists public.ai_request_minute_usage (
  minute_bucket timestamptz not null,
  user_id uuid not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (minute_bucket, user_id)
);

create table if not exists public.ai_global_daily_usage (
  usage_date date primary key,
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.ai_request_daily_usage enable row level security;
alter table public.ai_request_minute_usage enable row level security;
alter table public.ai_global_daily_usage enable row level security;

revoke all on public.ai_request_daily_usage from anon, authenticated;
revoke all on public.ai_request_minute_usage from anon, authenticated;
revoke all on public.ai_global_daily_usage from anon, authenticated;
grant all on public.ai_request_daily_usage to service_role;
grant all on public.ai_request_minute_usage to service_role;
grant all on public.ai_global_daily_usage to service_role;

create or replace function public.reserve_ai_request(
  p_user_id uuid,
  p_action text,
  p_is_guest boolean,
  p_guest_daily_limit integer,
  p_minute_limit integer,
  p_global_daily_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'UTC')::date;
  v_minute timestamptz := date_trunc('minute', now());
  v_daily_count integer := 0;
  v_minute_count integer := 0;
  v_global_count integer := 0;
begin
  if p_user_id is null
    or p_action is null
    or p_action not in ('parse_search', 'shopping_assistant', 'explain_product', 'compare', 'compare_products')
    or p_guest_daily_limit < 1
    or p_minute_limit < 1
    or p_global_daily_limit < 1 then
    return jsonb_build_object('allowed', false, 'reason', 'configuration');
  end if;

  -- Serialize all AI reservations against the platform-wide daily ceiling.
  perform pg_advisory_xact_lock(hashtextextended('nexamart-ai-global-' || v_today::text, 0));
  select coalesce(request_count, 0) into v_global_count
    from public.ai_global_daily_usage where usage_date = v_today;
  if v_global_count >= p_global_daily_limit then
    return jsonb_build_object('allowed', false, 'reason', 'global_limit');
  end if;

  -- Guest daily and per-minute quotas are keyed to the verified Auth user ID.
  if p_is_guest then
    perform pg_advisory_xact_lock(hashtextextended('nexamart-ai-user-' || p_user_id::text || '-' || v_today::text, 0));

    select coalesce(request_count, 0) into v_daily_count
      from public.ai_request_daily_usage
      where usage_date = v_today and user_id = p_user_id;
    if v_daily_count >= p_guest_daily_limit then
      return jsonb_build_object('allowed', false, 'reason', 'guest_daily_limit');
    end if;

    select coalesce(request_count, 0) into v_minute_count
      from public.ai_request_minute_usage
      where minute_bucket = v_minute and user_id = p_user_id;
    if v_minute_count >= p_minute_limit then
      return jsonb_build_object('allowed', false, 'reason', 'guest_rate_limit');
    end if;

    insert into public.ai_request_daily_usage (usage_date, user_id, request_count)
      values (v_today, p_user_id, 1)
      on conflict (usage_date, user_id)
      do update set request_count = public.ai_request_daily_usage.request_count + 1;

    insert into public.ai_request_minute_usage (minute_bucket, user_id, request_count)
      values (v_minute, p_user_id, 1)
      on conflict (minute_bucket, user_id)
      do update set request_count = public.ai_request_minute_usage.request_count + 1;
    v_daily_count := v_daily_count + 1;
  end if;

  insert into public.ai_global_daily_usage (usage_date, request_count)
    values (v_today, 1)
    on conflict (usage_date)
    do update set request_count = public.ai_global_daily_usage.request_count + 1;

  return jsonb_build_object(
    'allowed', true,
    'guest_remaining', case when p_is_guest then greatest(p_guest_daily_limit - v_daily_count, 0) else null end
  );
end;
$$;

revoke all on function public.reserve_ai_request(uuid, text, boolean, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid, text, boolean, integer, integer, integer) to service_role;

comment on table public.ai_request_daily_usage is 'Private server-side daily AI request counters; not readable by browser clients.';
comment on table public.ai_request_minute_usage is 'Private server-side per-minute AI request counters; not readable by browser clients.';
comment on table public.ai_global_daily_usage is 'Private platform-wide daily AI request ceiling counters.';
