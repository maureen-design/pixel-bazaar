import { supabase } from '../lib/supabaseClient';

export async function logActivity(
  userId: string | undefined,
  userEmail: string | undefined,
  action: string,
  details: Record<string, any> = {}
) {
  try {
    await supabase.from('activity_logs').insert({
      user_id: userId || null,
      user_email: userEmail || null,
      action,
      details,
      user_agent: navigator.userAgent,
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}
