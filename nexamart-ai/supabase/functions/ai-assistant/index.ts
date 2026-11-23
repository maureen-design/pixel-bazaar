import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  buildShoppingAssistantCandidate,
  buildShoppingAssistantPrompt,
  buildShoppingConversationProductQueries,
  buildShoppingConversationPrompt,
  buildGeminiGenerateContentRequest,
  filterCandidateRecommendations,
  parseProductStock,
  queryShoppingAssistantProducts,
  SHOPPING_ASSISTANT_SYSTEM_INSTRUCTION,
  SHOPPING_CONVERSATION_SYSTEM_INSTRUCTION,
} from './shoppingAssistantPrompt.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
};

async function callGemini(
  prompt: string,
  maxOutputTokens = 500,
  temperature = 0.7,
  systemInstruction?: string
) {
  const model = 'gemini-3.6-flash';
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(buildGeminiGenerateContentRequest(
          prompt,
          { temperature, maxOutputTokens },
          systemInstruction
        )),
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    const data = await response.json();
    if (!response.ok) {
      // Handle Gemini API errors (like 503 service unavailable)
      const errorMessage = data.error?.message || 'Unknown error';
      if (response.status === 503) {
        throw new Error(`Gemini API is currently experiencing high demand. Please try again in a moment.`);
      }
      throw new Error(`Gemini API ${response.status}: ${errorMessage}`);
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error: any) {
    clearTimeout(timer);
    if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
      throw new Error('AI request timed out. Please try again with a shorter message or try again later.');
    }
    throw error;
  }
}

function safeParseJSON(text: string, fallback: any) {
  try {
    // Strip markdown code blocks if present
    let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    // Try to extract JSON object from the text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

interface InventoryProductData {
  status?: unknown;
  stock_quantity?: unknown;
  variants?: {
    options?: unknown;
    combinations?: unknown;
  } | null;
}

function getProductInventoryText(product: InventoryProductData): string {
  const status = typeof product.status === 'string' ? product.status : 'unknown';
  const options = Array.isArray(product.variants?.options) ? product.variants.options : [];

  if (options.length === 0) {
    const stock = parseProductStock(product.stock_quantity);
    const availability = status !== 'active'
      ? `not purchasable because product status is ${status}`
      : stock === null
        ? 'unknown because base stock is missing or invalid'
        : stock > 0
          ? 'available by status and base stock'
          : 'out of stock by base stock';
    return `Simple product base stock: ${stock ?? 'unknown'}; product status: ${status}; availability: ${availability}.`;
  }

  const combinations = Array.isArray(product.variants?.combinations)
    ? product.variants.combinations
    : [];
  const asCombination = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  const stocks = combinations.map((value: unknown) => {
    const combination = asCombination(value);
    return combination ? parseProductStock(combination.stock) : null;
  });
  const unknownCount = stocks.filter((stock: number | null) => stock === null).length;
  const availableCount = stocks.filter((stock: number | null) => stock !== null && stock > 0).length;
  const totalStock = unknownCount === 0
    ? stocks.reduce((total: number, stock: number | null) => total + (stock ?? 0), 0)
    : null;
  const combinationDetails = combinations.slice(0, 12).map((value: unknown, index: number) => {
    const combination = asCombination(value);
    if (!combination) {
      return `Combination ${index + 1}: invalid combination data; stock unknown`;
    }
    const rawAttributes = combination.attributes;
    const attributes = rawAttributes && typeof rawAttributes === 'object' && !Array.isArray(rawAttributes)
      ? Object.entries(rawAttributes as Record<string, unknown>)
          .map(([name, value]) => `${name} ${String(value)}`)
          .join(', ')
      : '';
    const labelValue = combination.label ?? combination.name;
    const label = attributes || (typeof labelValue === 'string' ? labelValue : '') || `Combination ${index + 1}`;
    const stock = stocks[index];
    return `${label}: ${stock === null ? 'stock unknown' : `${stock} in stock`}`;
  });
  if (combinations.length > combinationDetails.length) {
    combinationDetails.push(`${combinations.length - combinationDetails.length} additional combinations omitted`);
  }
  const variantAvailability = status !== 'active'
    ? `not purchasable because product status is ${status}`
    : unknownCount > 0
      ? `at least ${availableCount} combinations have recorded stock; ${unknownCount} stock values are unknown`
      : availableCount > 0
        ? 'available in one or more combinations'
        : 'out of stock across all combinations';

  return `Variant inventory: ${totalStock === null ? 'aggregate total unknown because some combination stock is missing or invalid' : `${totalStock} units total across ${combinations.length} combinations`}; ${availableCount} combinations have positive recorded stock; product status: ${status}; availability: ${variantAvailability}. Base product stock is not the stock for an individual option. Individual combination stock: ${combinationDetails.join('; ') || 'no combinations recorded'}.`;
}

async function querySupabase(path: string) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url) throw new Error('SUPABASE_URL not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase API ${response.status}: ${text.substring(0, 200)}`);
  }
  return response.json();
}

async function verifyAuth(authHeader: string | null): Promise<{ userId: string; email: string | null; isAnonymous: boolean } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseAnonKey },
    });
    if (!resp.ok) return null;
    const user = await resp.json();
    return { userId: user.id, email: user.email ?? null, isAnonymous: user.is_anonymous === true };
  } catch {
    return null;
  }
}


interface AIReservationResult {
  allowed: boolean;
  code?: string;
  guestRemaining?: number | null;
}

async function reserveAIRequest(userId: string, action: string, isGuest: boolean): Promise<AIReservationResult> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('AI usage safeguard is not configured');
  const globalDailyLimit = Number(Deno.env.get('AI_GLOBAL_DAILY_REQUEST_LIMIT') || 500);
  if (!Number.isInteger(globalDailyLimit) || globalDailyLimit < 1) {
    throw new Error('AI_GLOBAL_DAILY_REQUEST_LIMIT must be a positive integer');
  }
  const response = await fetch(url + '/rest/v1/rpc/reserve_ai_request', {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_user_id: userId,
      p_action: action,
      p_is_guest: isGuest,
      p_guest_daily_limit: 5,
      p_minute_limit: 3,
      p_global_daily_limit: globalDailyLimit,
    }),
  });
  if (!response.ok) throw new Error('AI usage reservation failed: ' + (await response.text()).slice(0, 200));
  const result = await response.json();
  if (!result?.allowed) {
    if (result?.reason === 'guest_daily_limit') return { allowed: false, code: 'GUEST_LIMIT_REACHED' };
    if (result?.reason === 'guest_rate_limit') return { allowed: false, code: 'RATE_LIMITED' };
    if (result?.reason === 'global_limit') return { allowed: false, code: 'AI_TEMPORARILY_UNAVAILABLE' };
    throw new Error('AI usage reservation was rejected');
  }
  return { allowed: true, guestRemaining: result.guest_remaining ?? null };
}

async function isVerifiedVendor(userId: string): Promise<boolean> {
  const vendors: any[] = await querySupabase(
    'vendors?select=id,is_verified&user_id=eq.' + encodeURIComponent(userId) + '&limit=1'
  );
  return vendors.some((vendor) => vendor.is_verified === true);
}

interface CachedConversationResponse {
  body: Record<string, unknown>;
  status: number;
}

interface ConversationRequestCacheEntry {
  fingerprint: string;
  expiresAt: number;
  reservation: Promise<AIReservationResult>;
  attempts: number;
  response?: CachedConversationResponse;
  inFlight?: Promise<CachedConversationResponse>;
}

const conversationRequestCache = new Map<string, ConversationRequestCacheEntry>();
const CONVERSATION_CACHE_TTL_MS = 10 * 60 * 1000;
const CONVERSATION_CACHE_LIMIT = 500;

function cachedConversationResponse(result: CachedConversationResponse): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function executeShoppingConversation(
  userId: string,
  isGuest: boolean,
  data: Record<string, any>,
  reservationPromise: Promise<AIReservationResult>
): Promise<CachedConversationResponse> {
  let reservation: AIReservationResult;
  try {
    reservation = await reservationPromise;
  } catch (error: any) {
    return {
      status: 500,
      body: { success: false, error: error?.message || 'AI usage reservation failed' },
    };
  }

  if (!reservation.allowed) {
    const isGuestLimit = reservation.code === 'GUEST_LIMIT_REACHED';
    return {
      status: isGuestLimit ? 200 : 429,
      body: {
        success: false,
        code: reservation.code,
        error: isGuestLimit ? 'Create a free account to experience more of NexaMart AI assistance.' :
          reservation.code === 'RATE_LIMITED' ? 'Please wait a moment before trying AI again.' :
          'AI assistance is temporarily unavailable. Please try again later.',
      },
    };
  }

  const guestLimitReached = isGuest && reservation.guestRemaining === 0;
  const history = data.history as Array<{ role: 'user' | 'assistant'; content: string }>;
  let products: any[] = [];
  try {
    const paths = buildShoppingConversationProductQueries(data.message, history);
    const foundProducts = await Promise.all(paths.map((path) => querySupabase(path)));
    const uniqueProducts = new Map<string, any>();
    for (const result of foundProducts) {
      for (const product of result) {
        if (typeof product?.id === 'string' && !uniqueProducts.has(product.id)) {
          uniqueProducts.set(product.id, product);
        }
      }
    }
    products = [...uniqueProducts.values()].slice(0, 20);
  } catch {
    return {
      status: 502,
      body: {
        success: false,
        error: 'Could not retrieve products matching your conversation',
        guest_limit_reached: guestLimitReached,
      },
    };
  }

  const candidates = products.map((product) => buildShoppingAssistantCandidate(
    product,
    product.categories?.name || 'General',
    product.vendors?.store_name || 'NexaMart seller',
    getProductInventoryText(product)
  ));
  const prompt = buildShoppingConversationPrompt(data.message, history, candidates);

  let result = '';
  try {
    result = await callGemini(
      prompt,
      isGuest ? 400 : 1000,
      0.3,
      SHOPPING_CONVERSATION_SYSTEM_INSTRUCTION
    );
  } catch (error: any) {
    return {
      status: 200,
      body: {
        success: false,
        error: error?.message || 'AI service unavailable. Please try again.',
        guest_limit_reached: guestLimitReached,
      },
    };
  }

  const parsed = safeParseJSON(result, null);
  const reply = typeof parsed?.reply === 'string'
    ? parsed.reply.slice(0, 2000)
    : result.slice(0, 2000);
  const recommendedIds = Array.isArray(parsed?.recommended_product_ids)
    ? [...new Set(parsed.recommended_product_ids.filter((id: unknown) => typeof id === 'string'))].slice(0, 4)
    : [];
  const productsById = new Map(products.map((product) => [product.id, product]));
  const recommendations = recommendedIds.flatMap((id: string) => {
    const product = productsById.get(id);
    if (!product) return [];
    return [{
      id: product.id,
      name: product.name,
      price: product.price,
      images: Array.isArray(product.images) ? product.images : [],
      rating: product.rating,
      stock_quantity: product.stock_quantity,
      status: product.status,
      variants: product.variants,
    }];
  });

  return {
    status: 200,
    body: {
      success: true,
      data: { reply, recommendations },
      guest_limit_reached: guestLimitReached,
    },
  };
}

async function handleShoppingConversation(
  userId: string,
  isGuest: boolean,
  data: Record<string, any>
): Promise<Response> {
  const requestId = (data.requestId as string).toLowerCase();
  const key = `${userId}:${requestId}`;
  const fingerprint = JSON.stringify({ message: data.message, history: data.history });
  const now = Date.now();

  for (const [cacheKey, entry] of conversationRequestCache) {
    if (entry.expiresAt <= now && !entry.inFlight) conversationRequestCache.delete(cacheKey);
  }

  let entry = conversationRequestCache.get(key);
  if (entry && entry.fingerprint !== fingerprint) {
    return cachedConversationResponse({
      status: 409,
      body: { success: false, error: 'This request ID was already used with different conversation content' },
    });
  }
  if (entry?.inFlight) return cachedConversationResponse(await entry.inFlight);
  if (entry?.response?.body.success === true) return cachedConversationResponse(entry.response);
  if (entry?.attempts !== undefined && entry.attempts >= 2 && entry.response) {
    return cachedConversationResponse(entry.response);
  }

  if (!entry) {
    while (conversationRequestCache.size >= CONVERSATION_CACHE_LIMIT) {
      const oldest = [...conversationRequestCache.entries()].find(([, cached]) => !cached.inFlight);
      if (!oldest) break;
      conversationRequestCache.delete(oldest[0]);
    }
    entry = {
      fingerprint,
      expiresAt: now + CONVERSATION_CACHE_TTL_MS,
      reservation: reserveAIRequest(userId, 'shopping_assistant', isGuest),
      attempts: 0,
    };
    conversationRequestCache.set(key, entry);
  }

  entry.attempts += 1;
  const inFlight = executeShoppingConversation(userId, isGuest, data, entry.reservation);
  entry.inFlight = inFlight;
  const response = await inFlight;
  entry.response = response;
  entry.inFlight = undefined;
  return cachedConversationResponse(response);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  let guestLimitReached = false;
  try {
    const authUser = await verifyAuth(req.headers.get('Authorization'));
    if (!authUser) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const body = await req.json();
    const action = body?.action;
    const data = body?.data && typeof body.data === 'object' ? body.data : {};
    const isShoppingConversation = action === 'shopping_assistant' && data.mode === 'conversation';
    const guestAllowedActions = new Set(['parse_search', 'shopping_assistant', 'explain_product', 'compare', 'compare_products']);

    const customerAllowedActions = new Set([...guestAllowedActions, 'generate_description']);
    const isUuid = (value: unknown): value is string =>
      typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    const validOptionalText = (value: unknown, max: number) =>
      value == null || (typeof value === 'string' && value.length <= max);
    if (JSON.stringify(data).length > 6000) {
      return new Response(JSON.stringify({ success: false, error: 'Request is too large' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (typeof action !== 'string' || !customerAllowedActions.has(action)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'parse_search' &&
      (typeof data.query !== 'string' || data.query.trim().length < 1 || data.query.length > 200)) {
      return new Response(JSON.stringify({ success: false, error: 'Search query must be between 1 and 200 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'shopping_assistant') {
      const validConversationHistory = Array.isArray(data.history) &&
        data.history.length <= 8 &&
        data.history.every((turn: any) =>
          turn && typeof turn === 'object' &&
          (turn.role === 'user' || turn.role === 'assistant') &&
          typeof turn.content === 'string' && turn.content.length <= 500
        );
      const invalidConversation = isShoppingConversation &&
        (typeof data.message !== 'string' || data.message.trim().length < 1 ||
         data.message.length > 1000 || !isUuid(data.requestId) || !validConversationHistory);
      const invalidGuidedPreferences = !isShoppingConversation &&
        ((data.category != null && !isUuid(data.category)) ||
         (data.budgetMin != null && (!Number.isFinite(data.budgetMin) || data.budgetMin < 0 || data.budgetMin > 100000000)) ||
         (data.budgetMax != null && (!Number.isFinite(data.budgetMax) || data.budgetMax < 0 || data.budgetMax > 100000000)) ||
         !validOptionalText(data.useCase, 120) || !validOptionalText(data.priorities, 200) ||
         !validOptionalText(data.experienceLevel, 80));
      if ((data.mode != null && data.mode !== 'conversation') || invalidConversation || invalidGuidedPreferences) {
        return new Response(JSON.stringify({ success: false, error: isShoppingConversation ? 'Invalid shopping conversation' : 'Invalid shopping preferences' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    if (action === 'explain_product' && !isUuid(data.productId)) {
      return new Response(JSON.stringify({ success: false, error: 'A valid productId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if ((action === 'compare' || action === 'compare_products') &&
      (!Array.isArray(data.productIds) || data.productIds.length < 2 || data.productIds.length > 3 ||
       !data.productIds.every(isUuid) || new Set(data.productIds).size !== data.productIds.length)) {
      return new Response(JSON.stringify({ success: false, error: 'Provide 2 or 3 distinct valid productIds' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'generate_description' &&
      (typeof data.productName !== 'string' || data.productName.trim().length < 1 || data.productName.length > 120 ||
       !validOptionalText(data.category, 80) || !validOptionalText(data.features, 1200) ||
       !validOptionalText(data.audience, 120))) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid product description details' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (authUser.isAnonymous && !guestAllowedActions.has(action)) {
      return new Response(JSON.stringify({ success: false, error: 'This AI feature requires a vendor account' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'generate_description' && (authUser.isAnonymous || !(await isVerifiedVendor(authUser.userId)))) {
      return new Response(JSON.stringify({ success: false, error: 'Verified vendor access is required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (isShoppingConversation) {
      return await handleShoppingConversation(authUser.userId, authUser.isAnonymous, data);
    }
    const reservation = await reserveAIRequest(authUser.userId, action, authUser.isAnonymous);
    if (!reservation.allowed) {
      const isGuestLimit = reservation.code === 'GUEST_LIMIT_REACHED';
      return new Response(JSON.stringify({
        success: false, code: reservation.code,
        error: isGuestLimit ? 'Create a free account to experience more of NexaMart AI assistance.' :
          reservation.code === 'RATE_LIMITED' ? 'Please wait a moment before trying AI again.' :
          'AI assistance is temporarily unavailable. Please try again later.'
      }), { status: isGuestLimit ? 200 : 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const guestMaxTokens = 400;
    guestLimitReached = authUser.isAnonymous && reservation.guestRemaining === 0;

    if (action === 'parse_search') {
      const categories: any[] = await querySupabase('categories?select=slug&order=name.asc');
      const categorySlugs = categories.map(c => c.slug).join(', ') || 'general';

      const PRODUCT_TYPES = [
        'tshirt', 'hoodie', 'dress', 'blouse', 'blazer', 'jacket', 'trousers', 'jeans',
        'sneakers', 'heels', 'formal_shoes', 'sandals', 'boots', 'loafers', 'handmade_footwear', 'handbag',
        'smartphone', 'laptop', 'tablet', 'headphones', 'speaker', 'keyboard', 'mouse',
        'monitor', 'gaming_console', 'gaming_accessory', 'camera', 'smartwatch', 'storage', 'charger',
        'fiction', 'self_help', 'education', 'childrens_book',
        'furniture', 'lighting', 'organization',
        'football', 'basketball', 'yoga', 'fitness',
        'car_accessory', 'rc_vehicle', 'building_blocks', 'plush_toy', 'puzzle',
        'fragrance', 'skincare', 'makeup', 'jewelry', 'craft', 'basket',
        'design_asset', 'ebook', 'online_course',
      ].join(', ');

      const COLORS = [
        'black', 'white', 'navy', 'red', 'blue', 'green', 'grey', 'olive',
        'brown', 'beige', 'yellow', 'orange', 'pink', 'purple', 'teal',
      ].join(', ');

      const prompt = `
You are a search assistant for an e-commerce platform called NexaMart AI.
Parse the following user query and extract structured search filters.
Return ONLY valid JSON with these fields:
- category: string | null (one of: ${categorySlugs})
- productType: string | null (one of: ${PRODUCT_TYPES})
- brand: string | null (e.g. "Samsung", "Nike". Only when confidently identified in the query; otherwise null. Never invent brands.)
- color: string | null (one of: ${COLORS}. Only when the query explicitly names a color; otherwise null. Never invent colors and never use a value outside this list.)
- minPrice: number | null
- maxPrice: number | null
- sortBy: string | null (one of: price_asc, price_desc, rating, newest)
- keywords: string | null

Rules:
- keywords must be ONLY the short product search terms (e.g. "running shoes"). Never repeat the whole sentence, conjunctions, price words ("under", "below", "between", "less than"), or numbers. Use null if there is no product term.
- minPrice/maxPrice: include ONLY if the user states an explicit price (e.g. "under 10,000" -> maxPrice: 10000; "over 2000" -> minPrice: 2000; "between 1000 and 5000" -> both). Plain numbers without a qualifier are NOT a price range; return null for minPrice/maxPrice in that case. Use numbers only, never strings with commas. NEVER hallucinate price values.
- category: If the query mentions a category name (e.g. "shoes", "electronics", "fashion"), set category to that slug. "shoes" -> shoes, "sneakers" -> shoes, "running shoes" -> shoes, "men's shoes" -> shoes, "women's shoes" -> shoes. Use the category slugs provided above.
- productType: choose the single best matching controlled vocabulary value from the query's product word (e.g. "laptops" -> laptop, "phones" -> smartphone, "hoodies" -> hoodie, "dresses" -> dress, "watch" -> smartwatch). For shoe-related queries, use the category field instead (set category to "shoes"). Return null when no product type is identifiable and the category field is already set.
- brand: return ONLY when the query explicitly names a brand (e.g. "samsung phones" -> Samsung, "nike shoes" -> Nike). Otherwise null. Never infer a brand from a product type.
- color: return ONLY when the query explicitly names a color, and ONLY one of: ${COLORS} (e.g. "black shoes" -> black). Return the exact lowercase vocabulary value. Never invent colors, never return variants like "gray" (use "grey"), never return compound values. Otherwise null.
- keywords: For shoe queries, include relevant keywords like "shoes", "footwear", "sneakers" etc. to improve text matching.

Query: "${data.query}"
      `;

      let result = '';
      try {
        result = await callGemini(prompt, authUser.isAnonymous ? guestMaxTokens : 500);
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, error: e.message, guest_limit_reached: guestLimitReached }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const parsed = safeParseJSON(result, {
        category: null, productType: null, brand: null, color: null,
        minPrice: null, maxPrice: null, sortBy: null, keywords: data.query,
      });

      if (parsed.category && typeof parsed.category === 'string' && parsed.category.length < 36 && /^[a-z0-9-]+$/i.test(parsed.category)) {
        const catResult: any[] = await querySupabase(`categories?select=id&slug=eq.${encodeURIComponent(parsed.category)}`);
        if (catResult.length > 0) {
          parsed.category = catResult[0].id;
        } else {
          parsed.category = null;
        }
      }

      return new Response(
        JSON.stringify({ success: true, data: parsed, guest_limit_reached: guestLimitReached }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'generate_description') {
      const prompt = `
You are a professional e-commerce copywriter for NexaMart AI.
Write a compelling product description for the following product:
- Name: ${data.productName}
- Category: ${data.category || 'General'}
- Key Features: ${data.features || 'Premium quality'}
- Target Audience: ${data.audience || 'General shoppers'}

The description should be 2-3 paragraphs, SEO-friendly, and highlight the key benefits.
Use plain text only. No markdown, no bold, no asterisks, no bullet points, no numbered lists. Just write natural sentences.
Return only the description text, no additional commentary.
      `;

      let description = '';
      try {
        description = await callGemini(prompt);
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI service unavailable', guest_limit_reached: guestLimitReached }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: { description }, guest_limit_reached: guestLimitReached }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'shopping_assistant') {
      const { category, useCase, budgetMin, budgetMax, priorities, experienceLevel } = data;

      let products: any[] = [];
      try {
        products = await queryShoppingAssistantProducts(querySupabase, category, budgetMin, budgetMax);
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: 'Could not retrieve products matching your criteria', guest_limit_reached: guestLimitReached }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (products.length === 0) {
        return new Response(
          JSON.stringify({ success: true, data: { recommendations: [], summary: 'No products matched your criteria. Try adjusting your budget or category.' }, guest_limit_reached: guestLimitReached }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const productList = products.slice(0, 15).map((p: any) => {
        const catName = p.categories?.name || 'General';
        const vendorName = p.vendors?.store_name || 'NexaMart seller';
        return buildShoppingAssistantCandidate(
          p,
          catName,
          vendorName,
          getProductInventoryText(p)
        );
      });

      const prompt = buildShoppingAssistantPrompt({
        category,
        useCase,
        budgetMin,
        budgetMax,
        priorities,
      }, productList);

      let result = '';
      try {
        result = await callGemini(
          prompt,
          authUser.isAnonymous ? guestMaxTokens : 1000,
          0.3,
          SHOPPING_ASSISTANT_SYSTEM_INSTRUCTION
        );
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const parsed = safeParseJSON(result, { recommendations: [], summary: result });

      const recommendations = filterCandidateRecommendations(parsed.recommendations, products);

      return new Response(
        JSON.stringify({ success: true, data: { recommendations, summary: parsed.summary }, guest_limit_reached: guestLimitReached }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'explain_product') {
      const { productId } = data;
      if (!productId) {
        return new Response(
          JSON.stringify({ success: false, error: 'productId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const products: any[] = await querySupabase(
        `products?select=id,name,description,price,compare_price,rating,brand,product_type,stock_quantity,status,variants,categories!inner(name),vendors!inner(store_name)&id=eq.${productId}&status=eq.active`
      );
      if (products.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Product not found or unavailable' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const product = products[0];

      const inventoryText = getProductInventoryText(product);

      const prompt = `Explain this product in simple, beginner-friendly language. Use plain text only. No markdown, no bold, no asterisks, no bullet points, no numbered lists. Just write sentences separated by line breaks.

Product: ${product.name}
Brand: ${product.brand || 'Not specified'}
Category: ${product.categories?.name || 'General'}
Type: ${product.product_type || 'General'}
Price: KES ${product.price}${product.compare_price ? ` (was KES ${product.compare_price})` : ''}
Rating: ${product.rating || 'No ratings yet'}
Inventory: ${inventoryText}
Vendor: ${product.vendors?.store_name || 'NexaMart seller'}

Write exactly 4 short paragraphs:
Paragraph 1: What it is — mention the brand, type, and category (1 sentence)
Paragraph 2: Who it is for and what makes it stand out (1 sentence)
Paragraph 3: What it is good for, including price context and any variant options (1-2 sentences)
Paragraph 4: What to consider before buying — stock status, rating, vendor (1 sentence). For variant products, distinguish total inventory across combinations from the stock of the selected combination; do not imply every option has the aggregate total.

Return only the plain text explanation. No extra formatting.`;

      let explanation = '';
      try {
        explanation = await callGemini(prompt, authUser.isAnonymous ? guestMaxTokens : 500);
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: { explanation }, guest_limit_reached: guestLimitReached }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'compare' || action === 'compare_products') {
      const { productIds } = data;
      if (!Array.isArray(productIds) || productIds.length < 2 || productIds.length > 3) {
        return new Response(
          JSON.stringify({ success: false, error: 'Provide between 2 and 3 productIds' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const idList = productIds.join(',');
      const products: any[] = await querySupabase(
        `products?select=id,name,description,price,compare_price,rating,brand,product_type,stock_quantity,status,variants,categories!inner(name),vendors!inner(store_name)&id=in.(${idList})&status=eq.active`
      );

      if (products.length < 2) {
        return new Response(
          JSON.stringify({ success: false, error: 'Could not load products to compare - one or more products are unavailable' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const productList = products.map((p: any) => {
        return `${p.id} | ${p.name} | Brand: ${p.brand || 'N/A'} | Type: ${p.product_type || 'N/A'} | Category: ${p.categories?.name || 'N/A'} | KES ${p.price}${p.compare_price ? ` (was ${p.compare_price})` : ''} | Rating: ${p.rating || 0} | ${getProductInventoryText(p)} | Vendor: ${p.vendors?.store_name || 'N/A'}`;
      }).join('\n');

      const prompt = `Compare these products and tell the user which one is better for what. Be specific about brand, type, price, stock, and variants. For variant products, distinguish total inventory across combinations from the stock of a specific combination; never imply every option has the aggregate total. Product status is a separate purchasing condition.

If the products are from different categories, note that the comparison may not be directly useful and explain why.

PRODUCTS:
${productList}

RESPOND WITH ONLY VALID JSON. No other text. No markdown.
{
  "summary": "1-2 sentence overall comparison summary",
  "comparisons": [
    {
      "use_case": "e.g. budget shopping, best value, premium choice",
      "product_id": "exact-id-from-list",
      "why": "why this product wins for this use case, mentioning brand/type/price/stock"
    }
  ],
  "trade_offs": ["trade-off 1", "trade-off 2"]
}
Only use product_id values from the list above.`;

      let result = '';
      try {
        result = await callGemini(prompt, authUser.isAnonymous ? guestMaxTokens : 900);
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const parsed = safeParseJSON(result, { summary: result, comparisons: [], trade_offs: [] });

      return new Response(
        JSON.stringify({ success: true, data: parsed }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message, guest_limit_reached: guestLimitReached }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
