-- ============================================================================
-- NexaMart AI - 0018_bank_transfer_cron.sql
-- Schedules the bank-transfer-reconcile edge function via pg_cron + pg_net.
--
-- Follow-up to 0017: without a schedule, expired Bank Transfer orders are
-- never cancelled and stock is never released.
--
-- ADDITIVE AND SAFE:
--   - Enables pg_cron / pg_net extensions (no-op if already present)
--   - Creates/replaces exactly ONE cron job named 'bank-transfer-reconcile'
--   - Reads the service-role key from Supabase Vault so it is never
--     hardcoded in this repository
--
-- RUN-ONCE OPERATOR STEP (run in SQL editor BEFORE relying on the job):
--   select vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'service_role_key');
--
-- Does NOT touch: orders schema, RLS, triggers, RPCs, other cron jobs,
-- pay-later-reconcile scheduling.
-- Idempotent: safe to re-run.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Replace any previous version of this job (keeps re-runs clean).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'bank-transfer-reconcile') then
    perform cron.unschedule('bank-transfer-reconcile');
  end if;
end $$;

-- Every 15 minutes. bank-transfer-reconcile is idempotent, so overlapping
-- runs are harmless.
select cron.schedule(
  'bank-transfer-reconcile',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://jsdynslcjnfdulzgvamj.supabase.co/functions/v1/bank-transfer-reconcile',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization',
                 'Bearer ' || (
                   select decrypted_secret
                     from vault.decrypted_secrets
                    where name = 'service_role_key'
                    limit 1
                 )
               ),
    body    := jsonb_build_object('invoked_by', 'pg_cron')
  );
  $$
);
