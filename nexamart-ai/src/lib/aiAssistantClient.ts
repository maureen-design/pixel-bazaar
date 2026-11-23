import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { ProductVariants } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Keep guest identity separate from the marketplace's normal auth session.
// This prevents an anonymous AI session from satisfying ProtectedRoute.
const guestSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'nexamart-guest-ai-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export interface AIAssistantResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  guest_limit_reached?: boolean;
}

export interface ShoppingConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ShoppingConversationProduct {
  id: string;
  name: string;
  price: number;
  images: string[];
  rating: number;
  stock_quantity: number;
  status: string;
  variants?: ProductVariants;
}

export interface ShoppingConversationResponseData {
  reply: string;
  recommendations: ShoppingConversationProduct[];
}

export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function sendShoppingConversationMessage(
  message: string,
  history: ShoppingConversationTurn[],
  requestId: string
): Promise<AIAssistantResponse<ShoppingConversationResponseData>> {
  return invokeAIAssistant<ShoppingConversationResponseData>('shopping_assistant', {
    mode: 'conversation',
    message: message.trim(),
    history: history.slice(-8).map((turn) => ({
      role: turn.role,
      content: turn.content.slice(0, 500),
    })),
    requestId,
  });
}

export class GuestAILimitError extends Error {
  code = 'GUEST_LIMIT_REACHED';

  constructor() {
    super('Create a free account to experience more of NexaMart AI assistance.');
    this.name = 'GuestAILimitError';
  }
}

export function isGuestAILimitError(error: unknown): boolean {
  return error instanceof GuestAILimitError
    || (typeof error === 'object' && error !== null && 'code' in error
      && (error as { code?: string }).code === 'GUEST_LIMIT_REACHED');
}

export async function invokeAIAssistant<T = any>(
  action: string,
  data: Record<string, unknown>,
): Promise<AIAssistantResponse<T>> {
  const { data: primarySessionData } = await supabase.auth.getSession();
  const primaryUser = primarySessionData.session?.user;

  // A normal, non-anonymous account always uses the main marketplace session.
  if (primaryUser && primaryUser.is_anonymous !== true) {
    const { data: result, error } = await supabase.functions.invoke('ai-assistant', {
      body: { action, data },
    });
    if (error) throw error;
    return result as AIAssistantResponse<T>;
  }

  // Guests get a separate anonymous identity only when they first use AI.
  let { data: guestSessionData } = await guestSupabase.auth.getSession();
  if (!guestSessionData.session) {
    const { data, error } = await guestSupabase.auth.signInAnonymously();
    if (error) throw error;
    guestSessionData = { session: data.session };
  }

  if (!guestSessionData.session) {
    throw new Error('Guest AI session could not be started. Please try again.');
  }

  const { data: result, error } = await guestSupabase.functions.invoke('ai-assistant', {
    body: { action, data },
  });

  // The Edge Function returns this explicit code only after its server-side
  // quota reservation denies the request. Do not show a countdown beforehand.
  if (result?.code === 'GUEST_LIMIT_REACHED') {
    window.dispatchEvent(new CustomEvent('nexamart:guest-ai-limit'));
    throw new GuestAILimitError();
  }
  if (error) throw error;
  if (result?.guest_limit_reached === true) {
    window.dispatchEvent(new CustomEvent('nexamart:guest-ai-limit'));
  }
  return result as AIAssistantResponse<T>;
}
