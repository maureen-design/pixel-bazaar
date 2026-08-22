import { createClient } from '@supabase/supabase-js';

// TEMPORARY: hardcode URL while fixing .env loading (remove this later)
const supabaseUrl = 'https://jsdynslcjnfdulzgvamj.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('🔑 Supabase URL:', supabaseUrl);
console.log('🔑 ANON key present?', supabaseAnonKey ? '✅ Yes' : '❌ No');

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);