import { supabase } from '../lib/supabaseClient';

export async function logActivity(
  userId: string | undefined,
  userEmail: string | undefined,
  action: string,
  details: Record<string, any> = {}
) {
  try {
    const { error } = await supabase.from('activity_logs').insert({
      user_id: userId || null,
      user_email: userEmail || null,
      action,
      details,
      user_agent: navigator.userAgent,
    });

    if (error) {
      console.error('Failed to log activity:', action, error.message);
    }
  } catch (err) {
    console.error('Failed to log activity:', action, err);
  }
}
