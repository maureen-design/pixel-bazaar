begin;
select plan(25);

-- Insert isolated auth identities for the test transaction.
insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003')
on conflict do nothing;

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.is_anonymous = 'false';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}';
set local role authenticated;

insert into public.shopping_conversations (owner_id, owner_is_anonymous, title)
values ('10000000-0000-4000-8000-000000000001', false, 'Registered A')
returning id \gset registered_a_

select is(
  (select count(*)::integer
   from public.shopping_conversations
   where id = :'registered_a_id'
     and owner_id = '10000000-0000-4000-8000-000000000001'),
  1,
  '1 registered customer A can create and read its conversation'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.is_anonymous = 'false';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}';

select is(
  (select count(*)::integer
   from public.shopping_conversations
   where id = :'registered_a_id'),
  0,
  '2 registered customer B cannot read registered customer A conversation'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.is_anonymous = 'false';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}';

select throws_ok(
  format(
    'update public.shopping_conversations
     set owner_id = %L
     where id = %L',
    '10000000-0000-4000-8000-000000000002',
    :'registered_a_id'
  ),
  '42501',
  'Shopping conversations must belong to the authenticated user',
  '3 browser ownership-change attempt is rejected'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.is_anonymous = 'true';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}';

insert into public.shopping_conversations (owner_id, owner_is_anonymous, title)
values ('10000000-0000-4000-8000-000000000003', true, 'Anonymous A')
returning id \gset anonymous_a_

select is(
  (select count(*)::integer
   from public.shopping_conversations
   where id = :'anonymous_a_id'),
  1,
  '4 anonymous customer A can create and read its conversation'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.is_anonymous = 'true';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}';

select is(
  (select count(*)::integer
   from public.shopping_conversations
   where id = :'anonymous_a_id'),
  0,
  '5 anonymous customer B cannot read anonymous customer A conversation'
);

select is(
  (select count(*)::integer
   from public.shopping_conversations
   where id = :'registered_a_id'),
  0,
  '6 anonymous users cannot read registered customer conversations'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.is_anonymous = 'false';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}';

select is(
  (select count(*)::integer
   from public.shopping_conversations
   where id = :'anonymous_a_id'),
  0,
  '7 registered users cannot read anonymous customer conversations'
);

select throws_ok(
  format(
    'insert into public.shopping_conversations(owner_id, owner_is_anonymous, title)
     values (%L, true, %L)',
    '10000000-0000-4000-8000-000000000001',
    'Malformed anonymous identity'
  ),
  '42501',
  'Malformed shopping conversation ownership',
  '8 registered identity cannot create an anonymous-owned conversation'
);

select throws_ok(
  format(
    'insert into public.shopping_conversation_messages(conversation_id, sequence_no, role, content, client_request_id)
     values (%L, 99, %L, %L, %L)',
    :'registered_a_id',
    'assistant',
    'Browser assistant insertion',
    gen_random_uuid()
  ),
  '42501',
  null,
  '9 browser cannot insert assistant messages'
);

select public.append_shopping_conversation_user_message(
  :'registered_a_id',
  'Find a laptop under 50000',
  '00000000-0000-4000-8000-000000000001'
) as message_id \gset first_message_

select is(
  (select count(*)::integer
   from public.shopping_conversation_messages
   where conversation_id = :'registered_a_id'),
  1,
  '10 first append creates one message'
);

select is(
  public.append_shopping_conversation_user_message(
    :'registered_a_id',
    'Find a laptop under 50000',
    '00000000-0000-4000-8000-000000000001'
  ),
  :'first_message_message_id',
  '11 identical retry returns the existing message ID'
);

select is(
  (select count(*)::integer
   from public.shopping_conversation_messages
   where conversation_id = :'registered_a_id'),
  1,
  '12 identical retry creates no duplicate row'
);

select throws_ok(
  format(
    'select public.append_shopping_conversation_user_message(%L, %L, %L)',
    :'registered_a_id',
    'Find a completely different laptop',
    '00000000-0000-4000-8000-000000000001'
  ),
  '22023',
  'Client request ID reused with different message content',
  '13 reused request ID with different content is rejected'
);

select is(
  (select sequence_no
   from public.shopping_conversation_messages
   where conversation_id = :'registered_a_id'
   order by sequence_no limit 1),
  1::bigint,
  '14 first message receives sequence 1'
);

select public.append_shopping_conversation_user_message(
  :'registered_a_id',
  'Show me cheaper alternatives',
  '00000000-0000-4000-8000-000000000002'
) as message_id \gset second_message_

select is(
  (select count(*)::integer
   from public.shopping_conversation_messages
   where conversation_id = :'registered_a_id'),
  2,
  '15 second distinct request creates one additional row'
);

select is(
  (select pg_catalog.array_agg(sequence_no order by sequence_no)
   from public.shopping_conversation_messages
   where conversation_id = :'registered_a_id'),
  array[1,2]::bigint[],
  '16 sequence numbers remain consecutive'
);

select throws_ok(
  format(
    'update public.shopping_conversations
     set owner_id = %L
     where id = %L',
    '10000000-0000-4000-8000-000000000002',
    :'registered_a_id'
  ),
  '42501',
  'Shopping conversations must belong to the authenticated user',
  '17 owner ID cannot be changed'
);

select throws_ok(
  format(
    'update public.shopping_conversations
     set owner_is_anonymous = true
     where id = %L',
    :'registered_a_id'
  ),
  '42501',
  'Malformed shopping conversation ownership',
  '18 identity type cannot be changed'
);

select throws_ok(
  format(
    'insert into public.shopping_conversations(owner_id, owner_is_anonymous, status)
     values (%L, false, %L)',
    '10000000-0000-4000-8000-000000000001',
    'archived'
  ),
  '23514',
  null,
  '19 invalid status is rejected'
);

select throws_ok(
  format(
    'insert into public.shopping_conversations(owner_id, owner_is_anonymous, title)
     values (%L, false, %L)',
    '10000000-0000-4000-8000-000000000001',
    repeat('x', 201)
  ),
  '23514',
  null,
  '20 title length is bounded'
);

update public.shopping_conversations
set status = 'deleted'
where id = :'registered_a_id';

update public.shopping_conversations
set status = 'deleted'
where id = :'registered_a_id';

reset role;

select is(
  (select count(*)::integer
   from public.shopping_conversation_messages
   where conversation_id = :'registered_a_id'),
  0,
  '21 soft deletion physically removes child messages'
);

select is(
  (select context
   from public.shopping_conversations
   where id = :'registered_a_id'),
  '{"version":1}'::jsonb,
  '22 soft deletion resets context to the version marker'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.is_anonymous = 'false';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}';
set local role authenticated;

select is(
  (select count(*)::integer
   from public.shopping_conversations
   where id = :'registered_a_id'),
  0,
  '23 deleted conversation cannot be read or resumed'
);

select throws_ok(
  format(
    'select public.append_shopping_conversation_user_message(%L, %L, %L)',
    :'registered_a_id',
    'Resume this conversation',
    '00000000-0000-4000-8000-000000000003'
  ),
  '42501',
  'Shopping conversation not found or not owned',
  '24 deleted conversation cannot accept new messages'
);

insert into public.shopping_conversations (owner_id, owner_is_anonymous, title)
values ('10000000-0000-4000-8000-000000000001', false, 'Physical delete test')
returning id \gset physical_a_

select public.append_shopping_conversation_user_message(
  :'physical_a_id',
  'Physical cascade message',
  '00000000-0000-4000-8000-000000000004'
) as message_id;

reset role;
delete from public.shopping_conversations
where id = :'physical_a_id';

select is(
  (select count(*)::integer
   from public.shopping_conversation_messages
   where conversation_id = :'physical_a_id'),
  0,
  '25 physical parent deletion cascades and removes messages'
);

select * from finish();
rollback;
