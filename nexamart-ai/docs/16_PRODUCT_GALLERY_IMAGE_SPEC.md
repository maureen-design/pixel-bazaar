# 16 — Product Gallery Image Specification

Status: **Asset input required** — UI resolver is complete, verified image sets are not yet available.

## Scope

Priority #15 requires the Classic Cotton T-Shirt and Premium Hoodie product pages to show a
Color → Front / Back / Side / Detail gallery. The frontend resolver is implemented in
`src/pages/ProductDetail.tsx`. The only missing input is real, verified, color-specific
4-view image sets in `variants.combinations[].images[]`.

This document is the exact asset acquisition requirement. No image URL is written to the
database until a human confirms each image's content (product type, color, view).

## Why data was not written

Every candidate image URL was verified loadable (HTTP 200) and their dominant color was
measured, but the environment cannot verify *visual content* — whether a photo is a red
t-shirt front, a black t-shirt back, etc. Writing URLs under those conditions would risk
mislabeled views and color mismatches, which the project explicitly forbids.

## Required assets

Image order convention (must be preserved exactly):

| Index | View |
|-------|------|
| 0     | Front |
| 1     | Back |
| 2     | Side |
| 3     | Detail |

### 1. Classic Cotton T-Shirt

Product ID: `a35ce4bd-a63e-4fda-844d-0a555f07e52c`
Existing colors in data: Black, White, Navy, Red

| Color | Front | Back | Side | Detail |
|-------|-------|------|------|--------|
| Black | needed | needed | needed | needed |
| White | needed | needed | needed | needed |
| Navy  | needed | needed | needed | needed |
| Red   | needed | needed | needed | needed |

Combinations to receive each color's set (same 4 images on every size combo of that color):

- Black: `blk-m`, `blk-l`
- White: `wht-m`
- Navy: `navy-m`
- Red: `red-m`

### 2. Premium Hoodie

Product ID: `daae882a-3ad1-4c70-81a1-e5b0999e1eff`
Existing colors in data: Black, Grey, Olive (note: the hoodie has no Red variant in DB)

| Color | Front | Back | Side | Detail |
|-------|-------|------|------|--------|
| Black | needed | needed | needed | needed |
| Grey  | needed | needed | needed | needed |
| Olive | needed | needed | needed | needed |

Combinations to receive each color's set:

- Black: `blk-l`, `blk-xl`
- Grey: `gry-l`
- Olive: `olv-m`

## Image quality requirements

For each color the four images must represent the **same garment, same color**:

1. Front — full product, front-facing
2. Back — same product from the rear
3. Side — clear side/profile view
4. Detail — close-up of fabric/seam/collar/texture

Keep consistent background, framing, lighting, proportions, and photography style. Prefer
neutral e-commerce presentation; avoid people's faces, third-party brand logos, text, and
watermarks where possible. No four unrelated photos, no duplicated image four times, no
mislabeled views.

## Source rules

1. Reuse existing project-owned/demo images if a suitable 4-view set exists.
2. Otherwise use properly licensed stock imagery (Unsplash License is the established
   project pattern).
3. If a coherent 4-view set cannot be sourced for a color, leave that color unpopulated and
   report it — do not substitute unrelated images.
4. Record the source URL and license information for every external image.

## Populate procedure

1. Fill in the verified URLs in `scripts/gallery-manifest.json`.
2. Run `node scripts/populate-gallery-images.mjs` — it verifies every URL loads (HTTP 200),
   applies the color's 4 images to every size combination of that color, preserves all other
   combination fields (price/stock/SKU/attributes), PATCHes via the anon key, then re-reads
   to confirm persistence.
3. Verify in the browser: Classic Cotton T-Shirt → select Red → gallery shows Red Front,
   thumbnails show Front/Back/Side/Detail; switch Black; change sizes; repeat for Premium
   Hoodie.

## Browser verification checklist

- TEST 1 — T-Shirt page shows a visible gallery and 4 thumbnails.
- TEST 2 — Select Red → Red set appears, first image selected, 4 Red thumbnails.
- TEST 3 — Red S → M → L: gallery stays Red, images do not disappear.
- TEST 4 — Red → Black: gallery changes, selected index resets to 0, 4 Black thumbnails.
- TEST 5 — Black S → M → L: gallery stays Black.
- TEST 6 — Repeat all for Premium Hoodie.
- TEST 7 — Thumbnails visibly present, active styling, click changes main image, prev/next
  works, mobile horizontal scroll, keyboard nav, reduced-motion behavior intact.
