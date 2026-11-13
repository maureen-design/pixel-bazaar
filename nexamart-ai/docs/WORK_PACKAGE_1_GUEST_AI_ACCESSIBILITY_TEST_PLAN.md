# Work Package 1 — Guest AI and accessibility verification

## Current implementation on the feature branch

- Guest AI identity uses a separate Supabase anonymous-auth client; the marketplace AuthContext and ProtectedRoute continue using the primary client.
- Guest AI is limited server-side to five requests per Africa/Nairobi calendar day, with a three-request-per-minute guest rate limit.
- The invitation appears after the fifth request completes. No allowance counter or advance warning is shown.
- A sixth request is rejected by the Edge Function; dismissing the invitation does not reset the allowance.
- The Edge Function enforces a platform-wide ceiling of 500 AI invocations per Nairobi calendar day by default, configurable through `AI_GLOBAL_DAILY_REQUEST_LIMIT`.
- Vendor product-description generation remains verified-vendor-only.
- Anonymous Auth identities are restricted from private marketplace tables and catalogue mutations. Public catalogue SELECT policies are preserved. A trigger blocks anonymous identities from calling the SECURITY DEFINER checkout flow.
- Accessibility preferences are available from public navigation and shared with Settings; preferences are restored before first render.
- Product-card add-to-cart actions remain visible without hover.

## Required staging checks

### Guest AI

1. With anonymous sign-in enabled in Supabase Auth, open the site in a clean browser session.
2. Verify the AI assistant, AI search, product explanation, comparison and shopping recommendations work without signing in.
3. Complete five AI requests. The fifth response should complete, then the non-blocking “Experience more with NexaMart AI” invitation should appear.
4. Dismiss the invitation and attempt another AI request. The request must be rejected and the invitation shown again.
5. Verify a page refresh, another tab and clearing ordinary browser cache do not reset the same anonymous identity's daily count.
6. Verify the count resets at midnight Africa/Nairobi time.
7. Make more than three requests inside one minute. Further requests should be throttled.
8. Create a new anonymous identity and verify the global daily ceiling still applies.
9. Sign in as a registered customer. Confirm the guest limit no longer applies and personalized features continue to work.
10. Confirm the global ceiling applies to registered and guest users.
11. Verify an unverified customer cannot invoke `generate_description`; a verified vendor can.
12. Verify the service-role key is never present in browser assets or responses.

### Supabase security

1. Apply migrations 0045 and 0046 to a staging project only.
2. Run `supabase/verification/0045_0046_guest_ai_verify.sql`.
3. Using an anonymous Auth JWT, attempt to read or write profiles, addresses, carts, wishlists, orders, order items, notifications, vendor-private data, payouts, refunds and ledgers. These operations must be denied or return no rows.
4. Using an anonymous Auth JWT, attempt to insert a profile, vendor, product, category or review. These mutations must be denied.
5. Confirm public catalogue reads through the normal anon client still work.
6. Confirm anonymous Auth cannot place an order through `create_order`.
7. Confirm a registered customer can still use normal checkout and account features.
8. Test simultaneous requests around the guest limit; no more than five guest reservations should be accepted per identity/day.

### Accessibility and storefront regression

1. Use keyboard only to open and operate public Accessibility controls.
2. Toggle high contrast and larger text; verify Navbar and Settings remain synchronized.
3. Refresh and verify both preferences persist.
4. Verify high contrast in light and dark themes.
5. Check mobile layout, keyboard focus, text zoom/reflow and screen-reader labels.
6. Confirm product-card Add to Cart / Select Options is visible without hover and works by keyboard.
7. Confirm regular search, cart, wishlist, compare table, product pages and checkout still behave as before.

## Build and lint

From `nexamart-ai/`, run:

- `npm run build`
- `npm run lint`

The GitHub connector can commit source changes but cannot execute the project's local build, lint, browser or Supabase staging tests. Those checks remain pending until run in the project environment.

## Deployment is not authorized by this branch

Before production rollout:
- Enable Supabase anonymous sign-ins intentionally in the project Auth settings.
- Apply migrations to staging, verify all tests, then plan production migration.
- Deploy the updated `ai-assistant` Edge Function.
- Set/confirm `AI_GLOBAL_DAILY_REQUEST_LIMIT` and the Gemini provider's own usage/billing alerts or hard limits.
- Do not deploy until the guest Auth setting, RLS verification, build, lint and checkout regression tests pass.
