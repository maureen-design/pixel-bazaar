-- NexaMart AI - Persistent shopping conversations database foundation
--
-- This migration is intentionally limited to storage, ownership, RLS and
-- reliable user-message sequencing. It does not implement guest transfer,
-- UI persistence, AI integration or quota changes.

create table if not exists public.shopping_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_is_anonymous boolean not null,
  title text not null default 'New shopping conversation',
  status text not null default 'active',
  context jsonb not null default '{"version":1}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision integer not null default 1,
  constraint shopping_conversations_title_length
    check (char_length(title) between 1 and 200),
  constraint shopping_conversations_status_check
    check (status in ('active', 'pending', 'deleted')),
  constraint shopping_conversations_context_size
    check (pg_column_size(context) <= 32768),
  constraint shopping_conversations_context_object
    check (jsonb_typeof(context) = 'object'),
  constraint shopping_conversations_context_version
    check (
      context ? 'version'
      and context->>'version' = '1'
    ),
  constraint shopping_conversations_revision_positive
    check (revision >= 1),
  constraint shopping_conversations_deleted_consistency
    check (
      (status = 'deleted' and deleted_at is not null)
      or (status in ('active', 'pending') and deleted_at is null)
    )
);

create index if not exists idx_shopping_conversations_owner
  on public.shopping_conversations(owner_id);

create index if not exists idx_shopping_conversations_owner_status
  on public.shopping_conversations(owner_id, status);

create index if not exists idx_shopping_conversations_owner_activity
  on public.shopping_conversations(owner_id, last_activity_at desc);

create table if not exists public.shopping_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.shopping_conversations(id) on delete cascade,
  sequence_no bigint not null,
  role text not null,
  content text not null,
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint shopping_conversation_messages_role_check
    check (role in ('user', 'assistant')),
  constraint shopping_conversation_messages_sequence_positive
    check (sequence_no >= 1),
  constraint shopping_conversation_messages_content_length
    check (char_length(content) between 1 and 4000),
  constraint shopping_conversation_messages_unique_order
    unique (conversation_id, sequence_no),
  constraint shopping_conversation_messages_unique_request
    unique (conversation_id, client_request_id, role)
);

create index if not exists idx_shopping_conversation_messages_chronological
  on public.shopping_conversation_messages(conversation_id, sequence_no);

create index if not exists idx_shopping_conversation_messages_created
  on public.shopping_conversation_messages(conversation_id, created_at);

-- Keeps owner fields immutable and validates browser identity claims.
-- This trigger has no service-role bypass: guest transfer or server-side
-- ownership changes require a separate authorized mechanism in a later stage.
create or replace function public.protect_shopping_conversation_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_claim_anonymous boolean;
begin
  v_claim_anonymous :=
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);

  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;
  if new.owner_id is distinct from auth.uid() then
    raise exception using
      errcode = '42501',
      message = 'Shopping conversations must belong to the authenticated user';
  end if;
  if new.owner_is_anonymous is distinct from v_claim_anonymous then
    raise exception using
      errcode = '42501',
      message = 'Malformed shopping conversation ownership';
  end if;

  if tg_op = 'UPDATE' then
    if new.owner_id is distinct from old.owner_id
      or new.owner_is_anonymous is distinct from old.owner_is_anonymous then
      raise exception using
        errcode = '42501',
        message = 'Shopping conversation ownership is immutable';
    end if;

    new.revision := old.revision + 1;

    if new.last_activity_at is distinct from old.last_activity_at then
      if current_user::text <> 'postgres'
        or pg_catalog.current_setting(
          'nexamart.internal_message_activity_write',
          true
        ) <> 'on' then
        raise exception using
          errcode = '42501',
          message = 'last_activity_at is system-managed';
      end if;
      new.last_activity_at := pg_catalog.now();
    else
      new.last_activity_at := old.last_activity_at;
    end if;
  else
    new.revision := 1;
    new.last_activity_at := pg_catalog.now();
  end if;

  if new.status = 'deleted' then
    new.deleted_at := coalesce(new.deleted_at, now());
    new.context := '{"version":1}'::jsonb;
  else
    new.deleted_at := null;
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

revoke all on function public.protect_shopping_conversation_ownership() from public;

drop trigger if exists trg_protect_shopping_conversation_ownership
  on public.shopping_conversations;
create trigger trg_protect_shopping_conversation_ownership
  before insert or update on public.shopping_conversations
  for each row execute function public.protect_shopping_conversation_ownership();

-- Physical soft-deletion purge:
-- This SECURITY DEFINER function runs only for the transition from
-- active/pending to deleted and deletes messages only for OLD.id.
-- It has no caller-supplied conversation ID and no browser EXECUTE grant.
-- The caller still cannot restore a deleted parent or gain a read policy.
create or replace function public.purge_deleted_shopping_conversation_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.status = 'deleted'
    and old.status is distinct from 'deleted' then
    delete from public.shopping_conversation_messages
    where conversation_id = old.id;
  end if;

  return new;
end;
$$;

revoke all on function public.purge_deleted_shopping_conversation_messages()
  from public, anon, authenticated;
alter function public.purge_deleted_shopping_conversation_messages()
  owner to postgres;
grant delete on public.shopping_conversation_messages to postgres;

drop trigger if exists trg_purge_deleted_shopping_conversation_messages
  on public.shopping_conversations;
create trigger trg_purge_deleted_shopping_conversation_messages
  before update on public.shopping_conversations
  for each row execute function public.purge_deleted_shopping_conversation_messages();

-- The generic updated_at trigger may not exist on a local database where the
-- migration is replayed by a harness; this table's protection trigger owns
-- updated_at directly, so no dependency on 0001 is required.

alter table public.shopping_conversations enable row level security;
alter table public.shopping_conversation_messages enable row level security;

-- Registered users and Supabase anonymous Auth users both use the
-- "authenticated" role. The verified is_anonymous JWT claim distinguishes them.
create policy shopping_conversations_insert_policy
  on public.shopping_conversations
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and owner_is_anonymous =
      coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

create policy shopping_conversations_select_policy
  on public.shopping_conversations
  for select
  to authenticated
  using (
    status <> 'deleted'
    and owner_id = auth.uid()
    and owner_is_anonymous =
      coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

create policy shopping_conversations_update_policy
  on public.shopping_conversations
  for update
  to authenticated
  using (
    status <> 'deleted'
    and owner_id = auth.uid()
    and owner_is_anonymous =
      coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  )
  with check (
    owner_id = auth.uid()
    and owner_is_anonymous =
      coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

create policy shopping_conversations_delete_policy
  on public.shopping_conversations
  for delete
  to authenticated
  using (
    owner_id = auth.uid()
    and owner_is_anonymous =
      coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

create policy shopping_conversation_messages_select_policy
  on public.shopping_conversation_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.shopping_conversations c
      where c.id = shopping_conversation_messages.conversation_id
        and c.status <> 'deleted'
        and c.owner_id = auth.uid()
        and c.owner_is_anonymous =
          coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    )
  );

-- Browser roles receive no INSERT/UPDATE/DELETE grant on message rows.
-- User messages must use the server-validated sequencing RPC below.
revoke all on table public.shopping_conversations from public, anon;
revoke all on table public.shopping_conversation_messages from public, anon;
revoke all on table public.shopping_conversation_messages from authenticated;

grant select, insert, update, delete
  on table public.shopping_conversations
  to authenticated;

grant select
  on table public.shopping_conversation_messages
  to authenticated;

grant all on table public.shopping_conversations to service_role;
grant all on table public.shopping_conversation_messages to service_role;

-- Append exactly one user message with a transactionally assigned sequence.
-- Duplicate submissions return the already-stored message ID.
create or replace function public.append_shopping_conversation_user_message(
  p_conversation_id uuid,
  p_content text,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_claim_anonymous boolean;
  v_message_id uuid;
  v_existing_content text;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  v_claim_anonymous :=
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);

  if p_conversation_id is null
    or p_client_request_id is null
    or p_content is null
    or pg_catalog.char_length(p_content) not between 1 and 4000 then
    raise exception using
      errcode = '22023',
      message = 'Invalid shopping conversation message';
  end if;

  perform c.id
  from public.shopping_conversations c
  where c.id = p_conversation_id
    and c.owner_id = v_owner_id
    and c.owner_is_anonymous = v_claim_anonymous
    and c.status <> 'deleted'
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Shopping conversation not found or not owned';
  end if;

  select m.id, m.content
  into v_message_id, v_existing_content
  from public.shopping_conversation_messages m
  where m.conversation_id = p_conversation_id
    and m.client_request_id = p_client_request_id
    and m.role = 'user';

  if v_message_id is not null then
    if v_existing_content is distinct from p_content then
      raise exception using
        errcode = '22023',
        message = 'Client request ID reused with different message content';
    end if;
    return v_message_id;
  end if;

  insert into public.shopping_conversation_messages (
    conversation_id,
    sequence_no,
    role,
    content,
    client_request_id
  )
  select
    p_conversation_id,
    coalesce(max(m.sequence_no), 0) + 1,
    'user',
    p_content,
    p_client_request_id
  from public.shopping_conversation_messages m
  where m.conversation_id = p_conversation_id
  on conflict (conversation_id, client_request_id, role) do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select m.id
    into v_message_id
    from public.shopping_conversation_messages m
    where m.conversation_id = p_conversation_id
      and m.client_request_id = p_client_request_id
      and m.role = 'user';
  end if;

  if v_message_id is not null then
    perform pg_catalog.set_config(
      'nexamart.internal_message_activity_write',
      'on',
      true
    );
    update public.shopping_conversations c
    set last_activity_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where c.id = p_conversation_id;
  end if;

  if v_message_id is null then
    raise exception using
      errcode = '40001',
      message = 'Unable to append shopping conversation message';
  end if;

  select m.content
  into v_existing_content
  from public.shopping_conversation_messages m
  where m.conversation_id = p_conversation_id
    and m.id = v_message_id;

  if v_existing_content is distinct from p_content then
    raise exception using
      errcode = '22023',
      message = 'Client request ID reused with different message content';
  end if;

  return v_message_id;
end;
$$;

revoke all on function public.append_shopping_conversation_user_message(uuid, text, uuid) from public, anon;
grant execute on function public.append_shopping_conversation_user_message(uuid, text, uuid) to authenticated;
alter function public.append_shopping_conversation_user_message(uuid, text, uuid)
  owner to postgres;
grant select, insert, update on public.shopping_conversation_messages to postgres;
grant select, update on public.shopping_conversations to postgres;

comment on table public.shopping_conversations is
  'Persistent shopping conversation ownership and structured context. Deleted rows retain no message content or shopping context.';

comment on table public.shopping_conversation_messages is
  'Ordered user/assistant conversation messages. Browser roles may SELECT only; user writes use append_shopping_conversation_user_message. Assistant writes require a later server-side service-role implementation.';

comment on function public.append_shopping_conversation_user_message(uuid, text, uuid) is
  'Securely appends an idempotent user message to an owned active/pending conversation.';

-- 90-day retention is not scheduled in this migration. A future purge job
-- should first lock candidate rows and then DELETE or mark deleted in batches,
-- with delete cascades physically removing message rows and JSON context.
