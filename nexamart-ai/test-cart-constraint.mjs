const SUPABASE_URL = 'https://jsdynslcjnfdulzgvamj.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzZHluc2xjam5mZHVsemd2YW1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMjAwNTEsImV4cCI6MjA5OTc5NjA1MX0.TJ7Wct0PDSDghwJBqSe9dlYE16p6dRN_5pz0NKBtVJw';
const H = { 'apikey': ANON_KEY, 'Content-Type': 'application/json' };

async function main() {
  const email = `carttest${Date.now()}@test.example.com`;
  console.log('Signing up:', email);
  
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ email, password: 'TestPass123!' })
  });
  const auth = await r.json();
  
  if (!auth.access_token) {
    console.log('Signup failed:', JSON.stringify(auth).substring(0, 300));
    return;
  }

  const token = auth.access_token;
  const userId = auth.user.id;
  console.log('User:', userId);

  const AH = { ...H, 'Authorization': `Bearer ${token}`, 'Prefer': 'return=representation' };
  const pid = 'a1000001-0000-0000-0000-000000000001';

  // Insert variant A
  console.log('\n1. Insert Variant A (adb-blk-40)...');
  const r1 = await fetch(`${SUPABASE_URL}/rest/v1/cart_items`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ user_id: userId, product_id: pid, quantity: 1, variant_id: 'adb-blk-40', variant_attributes: {color:'Black',size:'40'}, variant_price: 12000 })
  });
  console.log('   Status:', r1.status, r1.status === 201 ? 'OK' : await r1.text());

  // Insert variant B
  console.log('\n2. Insert Variant B (adb-wht-42)...');
  const r2 = await fetch(`${SUPABASE_URL}/rest/v1/cart_items`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ user_id: userId, product_id: pid, quantity: 1, variant_id: 'adb-wht-42', variant_attributes: {color:'White',size:'42'}, variant_price: 12000 })
  });
  console.log('   Status:', r2.status, r2.status === 201 ? 'OK' : await r2.text());

  // Re-insert variant A
  console.log('\n3. Re-insert Variant A (should fail)...');
  const r3 = await fetch(`${SUPABASE_URL}/rest/v1/cart_items`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ user_id: userId, product_id: pid, quantity: 1, variant_id: 'adb-blk-40', variant_attributes: {color:'Black',size:'40'}, variant_price: 12000 })
  });
  console.log('   Status:', r3.status, r3.status === 201 ? 'BAD: constraint not working' : 'GOOD: constraint working');

  // Cart state
  const r4 = await fetch(`${SUPABASE_URL}/rest/v1/cart_items?select=variant_id,quantity,variant_price&user_id=eq.${userId}`, { headers: AH });
  const cart = await r4.json();
  console.log('\n4. Cart state:');
  if (Array.isArray(cart)) cart.forEach((c,i) => console.log(`   [${i+1}] variant=${c.variant_id} qty=${c.quantity} price=${c.variant_price}`));

  // Clean
  await fetch(`${SUPABASE_URL}/rest/v1/cart_items?user_id=eq.${userId}`, { method: 'DELETE', headers: AH });
  console.log('\nCleaned up');
}

main().catch(console.error);
