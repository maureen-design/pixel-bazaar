import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './load-env.mjs';

const env = await loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL/SUPABASE_ANON_KEY (or VITE_ variants) in .env.local');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(__dirname, 'gallery-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

async function api(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${options.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const loadable = async (url) => {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
};

let changed = 0;

for (const productSpec of manifest.products) {
  const { slug, colors } = productSpec;
  const rows = await api(
    `/rest/v1/products?select=id,slug,images,variants&slug=eq.${encodeURIComponent(slug)}`
  );
  if (!rows || rows.length === 0) {
    console.error(`SKIP: product "${slug}" not found`);
    continue;
  }
  const product = rows[0];
  const variants = product.variants;
  if (!variants || !Array.isArray(variants.combinations)) {
    console.error(`SKIP: product "${slug}" has no variants`);
    continue;
  }

  for (const [color, spec] of Object.entries(colors)) {
    const images = spec.images || [];
    if (images.length !== 4 || images.some((u) => !u)) {
      console.error(`SKIP: ${slug} ${color} — need exactly 4 non-empty URLs`);
      continue;
    }

    const checks = await Promise.all(images.map((u) => loadable(u)));
    const failed = images.filter((_, i) => !checks[i]);
    if (failed.length > 0) {
      console.error(`SKIP: ${slug} ${color} — ${failed.length} URL(s) not loadable (HTTP != 2xx):`);
      failed.forEach((u) => console.error(`  ${u}`));
      continue;
    }

    const matches = variants.combinations.filter(
      (c) => (c.attributes.color ?? c.attributes.Color ?? c.attributes.colour) === color
    );
    if (matches.length === 0) {
      console.error(`SKIP: ${slug} ${color} — no combination has this color`);
      continue;
    }

    for (const combo of matches) {
      combo.images = [...images];
    }
    console.log(`OK: ${slug} ${color} -> ${matches.length} combo(s), images verified loadable`);
  }

  const body = JSON.stringify({ variants });
  await api(`/rest/v1/products?id=eq.${product.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body,
  });
  changed++;

  const verify = await api(`/rest/v1/products?select=id,slug,images,variants&id=eq.${product.id}`);
  const v = verify[0].variants;
  const withImages = v.combinations.filter((c) => c.images && c.images.length === 4);
  console.log(
    `VERIFY: ${slug} -> ${withImages.length}/${v.combinations.length} combinations now have 4 images`
  );
}

console.log(`DONE: ${changed} product(s) updated.`);
