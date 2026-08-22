import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
};

async function callGemini(prompt: string, maxOutputTokens = 500, temperature = 0.7) {
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash';
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens },
      }),
      signal: controller.signal,
    }
  );
  clearTimeout(timer);

  const data = await response.json();
  if (!response.ok) throw new Error(`Gemini API ${response.status}: ${data.error?.message || 'Unknown error'}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function safeParseJSON(text: string, fallback: any) {
  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();

    if (action === 'parse_search') {
      const categories: any[] = await querySupabase('categories?select=slug&order=name.asc');
      const categorySlugs = categories.map(c => c.slug).join(', ') || 'general';

      const PRODUCT_TYPES = [
        'tshirt', 'hoodie', 'dress', 'blouse', 'blazer', 'jacket', 'trousers', 'jeans',
        'sneakers', 'heels', 'formal_shoes', 'sandals', 'handbag',
        'smartphone', 'laptop', 'tablet', 'headphones', 'speaker', 'keyboard', 'mouse',
        'monitor', 'gaming_console', 'gaming_accessory', 'camera', 'smartwatch', 'storage', 'charger',
        'fiction', 'self_help', 'education', 'childrens_book',
        'furniture', 'lighting', 'organization',
        'football', 'basketball', 'yoga', 'fitness',
        'car_accessory', 'rc_vehicle', 'building_blocks', 'plush_toy', 'puzzle',
        'fragrance', 'skincare', 'makeup', 'jewelry', 'craft', 'basket',
        'handmade_footwear', 'design_asset', 'ebook', 'online_course',
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
- productType: choose the single best matching controlled vocabulary value from the query's product word (e.g. "shoes" -> sneakers or formal_shoes, "laptops" -> laptop, "phones" -> smartphone, "hoodies" -> hoodie, "dresses" -> dress, "watch" -> smartwatch). Return null when no product type is identifiable.
- brand: return ONLY when the query explicitly names a brand (e.g. "samsung phones" -> Samsung, "nike shoes" -> Nike). Otherwise null. Never infer a brand from a product type.
- color: return ONLY when the query explicitly names a color, and ONLY one of: ${COLORS} (e.g. "black shoes" -> black). Return the exact lowercase vocabulary value. Never invent colors, never return variants like "gray" (use "grey"), never return compound values. Otherwise null.

Query: "${data.query}"
      `;

      let result = '';
      try {
        result = await callGemini(prompt);
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const parsed = safeParseJSON(result, {
        category: null, productType: null, brand: null, color: null,
        minPrice: null, maxPrice: null, sortBy: null, keywords: data.query,
      });

      if (parsed.category && typeof parsed.category === 'string' && parsed.category.length < 36) {
        const catResult: any[] = await querySupabase(`categories?select=id&slug=eq.${parsed.category}`);
        if (catResult.length > 0) {
          parsed.category = catResult[0].id;
        } else {
          parsed.category = null;
        }
      }

      return new Response(
        JSON.stringify({ success: true, data: parsed }),
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
Return only the description text, no additional commentary.
      `;

      let description = '';
      try {
        description = await callGemini(prompt);
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI service unavailable' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: { description } }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'shopping_assistant') {
      const { category, useCase, budgetMin, budgetMax, priorities, experienceLevel } = data;

      let products: any[] = [];
      try {
        let path = 'products?select=id,name,slug,description,price,compare_price,images,rating,category_id,vendor_id&status=eq.active&order=rating.desc&limit=20';
        if (category && typeof category === 'string' && category.length < 36) {
          path += `&category_id=eq.${category}`;
        }
        if (budgetMin) path += `&price=gte.${budgetMin}`;
        if (budgetMax) path += `&price=lte.${budgetMax}`;
        products = await querySupabase(path);
      } catch (e) {
        products = await querySupabase('products?select=id,name,slug,description,price,compare_price,images,rating,category_id&status=eq.active&order=rating.desc&limit=20');
      }

      if (products.length === 0) {
        return new Response(
          JSON.stringify({ success: true, data: { recommendations: [], summary: 'No products matched your criteria. Try adjusting your budget or category.' } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const prompt = `
You are a friendly shopping assistant for NexaMart AI, a multi-vendor marketplace.
A shopper is looking for a product with these needs:
- Category: ${category || 'Any'}
- Use case: ${useCase || 'General'}
- Budget: ${budgetMin ? `from ${budgetMin}` : ''} ${budgetMax ? `to ${budgetMax}` : ''}
- Priorities: ${priorities || 'Price and quality'}
- Experience level: ${experienceLevel || 'General'}

Here are products from our database:
${JSON.stringify(products.slice(0, 20))}

Recommend the top 3-5 products that best match the shopper's needs. Rank them by relevance.
For each product explain:
1. Why it's a good fit (1-2 sentences)
2. How it matches their priorities
3. Any trade-offs they should know about

Return ONLY valid JSON with this exact structure:
{
  "recommendations": [
    {
      "product_id": "uuid-string",
      "reason": "why it fits (1-2 sentences)",
      "match_score": 95,
      "pros": ["battery life", "performance"],
      "cons": ["price", "weight"]
    }
  ],
  "summary": "1-2 sentence overall recommendation summary"
}
Only include product_id values from the provided list. Do not invent products.
      `;

      let result = '';
      try {
        result = await callGemini(prompt, 1200);
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const parsed = safeParseJSON(result, { recommendations: [], summary: result });

      const productMap: Record<string, any> = {};
      products.forEach((p: any) => { productMap[p.id] = p; });
      const recommendations = (parsed.recommendations || [])
        .filter((r: any) => r && productMap[r.product_id])
        .slice(0, 5)
        .map((r: any) => ({ ...r, product: productMap[r.product_id] }));

      return new Response(
        JSON.stringify({ success: true, data: { recommendations, summary: parsed.summary } }),
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
        `products?select=id,name,description,price,images,rating&id=eq.${productId}`
      );
      if (products.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Product not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const product = products[0];

      const prompt = `
Explain this product in simple, beginner-friendly language:
- Name: ${product.name}
- Description: ${product.description}
- Price: ${product.price}

Include:
1. What it is (1 sentence)
2. Who it's for (1 sentence)
3. What it's good for (1-2 sentences)
4. What to consider before buying (1 sentence)

Keep it concise and friendly. Return only the explanation text.
      `;

      let explanation = '';
      try {
        explanation = await callGemini(prompt, 500);
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: { explanation } }),
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
        `products?select=id,name,description,price,compare_price,images,rating&id=in.(${idList})`
      );

      if (products.length < 2) {
        return new Response(
          JSON.stringify({ success: false, error: 'Could not load products to compare' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const prompt = `
Compare these products and tell the user which one is better for what:
${JSON.stringify(products)}

Provide:
1. A brief summary of the differences (1-2 sentences)
2. Which product is better for each use case
3. Key trade-offs to consider

Return ONLY valid JSON with this structure:
{
  "summary": "1-2 sentence overall comparison summary",
  "comparisons": [
    {
      "use_case": "budget shopping",
      "product_id": "uuid-string",
      "why": "why this product wins for this use case"
    }
  ],
  "trade_offs": ["trade-off 1", "trade-off 2"]
}
Only use product_id values from the provided list.
      `;

      let result = '';
      try {
        result = await callGemini(prompt, 900);
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
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
