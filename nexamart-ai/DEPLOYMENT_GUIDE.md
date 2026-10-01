# NexaMart AI - Deployment Guide

## Overview

This guide covers deploying NexaMart AI to production using Vercel (recommended) or other hosting platforms. The application consists of:
- **Frontend**: React + TypeScript + Vite application
- **Backend**: Supabase (PostgreSQL database, authentication, storage, edge functions)
- **AI**: Google Gemini API for AI-powered features
- **Payments**: M-Pesa (Safaricom Daraja) and Paystack integration

---

## Prerequisites

Before deploying, ensure you have:
1. A Supabase project with all migrations applied
2. Supabase edge functions deployed
3. Environment variables configured
4. A Vercel account (or alternative hosting)
5. Domain name (optional but recommended)

---

## Step 1: Supabase Setup

### 1.1 Deploy Database Migrations

```bash
cd supabase
supabase db push --project-ref YOUR_PROJECT_ID
```

### 1.2 Deploy Edge Functions

```bash
supabase functions deploy --project-ref YOUR_PROJECT_ID
```

Deploy all functions:
- `ai-assistant`
- `mpesa-stk-push`
- `mpesa-callback`
- `mpesa-callback-relay`
- `mpesa-reconcile`
- `create-paystack-checkout`
- `process-card-payment`
- `paystack-webhook`
- `bank-transfer-reconcile`
- `pay-later-reconcile`
- `send-order-email`
- `send-order-status-email`
- `send-vendor-lifecycle`
- `send-welcome-email`
- `send-contact-form`
- `send-admin-notification`
- `send-low-stock-alert`
- `send-payment-reminder`

### 1.3 Configure Supabase Environment Variables

In your Supabase dashboard, add these environment variables to your edge functions:

**For AI Assistant:**
- `GEMINI_API_KEY` - Your Google Gemini API key

**For M-Pesa Functions:**
- `MPESA_CONSUMER_KEY` - Safaricom Daraja consumer key
- `MPESA_CONSUMER_SECRET` - Safaricom Daraja consumer secret
- `MPESA_PASSKEY` - Safaricom Daraja passkey
- `MPESA_SHORTCODE` - Your M-Pesa shortcode

**For Paystack:**
- `PAYSTACK_SECRET_KEY` - Your Paystack secret key

**For Email Functions:**
- `SMTP_HOST` - SMTP server host
- `SMTP_PORT` - SMTP port
- `SMTP_USER` - SMTP username
- `SMTP_PASSWORD` - SMTP password
- `SMTP_FROM` - From email address

### 1.4 Create Storage Buckets

In Supabase Storage dashboard, create these buckets with public read access:
- `avatars` - Profile images
- `product-images` - Product photos
- `vendor-logos` - Vendor branding
- `documents` - Private documents (no public access)

---

## Step 2: Vercel Deployment

### 2.1 Install Vercel CLI (Optional)

```bash
npm install -g vercel
```

### 2.2 Deploy via Vercel CLI

```bash
vercel
```

Follow the prompts:
1. Link to existing project or create new
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Set install command: `npm install`

### 2.3 Deploy via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your Git repository
4. Vercel will auto-detect Vite configuration
5. Configure environment variables (see below)
6. Click "Deploy"

### 2.4 Configure Environment Variables in Vercel

In your Vercel project dashboard, go to Settings > Environment Variables and add:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_APP_NAME=NexaMart AI
VITE_MPESA_CONSUMER_KEY=your-mpesa-consumer-key
VITE_MPESA_CONSUMER_SECRET=your-mpesa-consumer-secret
VITE_MPESA_PASSKEY=your-mpesa-passkey
VITE_CALLBACK_URL=https://your-domain.com/api/mpesa-callback
VITE_PAYSTACK_PUBLIC_KEY=your-paystack-public-key
```

### 2.5 Configure Custom Domain (Optional)

1. In Vercel project settings, go to "Domains"
2. Add your custom domain
3. Update DNS records as instructed by Vercel
4. Update `VITE_CALLBACK_URL` to use your custom domain

---

## Step 3: Payment Gateway Configuration

### 3.1 M-Pesa Setup

1. Go to [Safaricom Developer Portal](https://developer.safaricom.co.ke)
2. Create a Daraja account
3. Get your Consumer Key, Consumer Secret, and Passkey
4. Configure your callback URL: `https://your-domain.com/api/mpesa-callback`
5. Update environment variables in Supabase and Vercel

### 3.2 Paystack Setup

1. Go to [Paystack Dashboard](https://dashboard.paystack.co)
2. Get your Public Key (for frontend) and Secret Key (for backend)
3. Configure webhook URL: `https://your-project-id.supabase.co/functions/v1/paystack-webhook`
4. Add keys to environment variables

---

## Step 4: AI Configuration

### 4.1 Google Gemini Setup

1. Go to [Google AI Studio](https://aistudio.google.com)
2. Create an API key
3. Add `GEMINI_API_KEY` to Supabase edge function environment variables
4. Test the AI assistant in your deployed application

---

## Step 5: Post-Deployment Checklist

- [ ] Frontend loads correctly at your domain
- [ ] User authentication works (sign up, sign in, sign out)
- [ ] Product browsing and search work
- [ ] Add to cart and checkout flow works
- [ ] M-Pesa STK push initiates correctly
- [ ] Card payment redirects to Paystack
- [ ] Bank transfer/Pay Later options work
- [ ] AI assistant responds to queries
- [ ] Email notifications are sent
- [ ] Vendor dashboard loads
- [ ] Admin dashboard loads
- [ ] Image uploads work to Supabase storage
- [ ] Dark mode toggle works
- [ ] Responsive design on mobile devices

---

## Alternative Deployment Platforms

### Netlify

Create a `netlify.toml` file:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
```

Deploy via Netlify CLI:
```bash
netlify deploy --prod
```

### Cloudflare Pages

1. Connect your Git repository
2. Build command: `npm run build`
3. Output directory: `dist`
4. Add environment variables in dashboard
5. Deploy

### Self-Hosted (Docker)

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:
```bash
docker build -t nexamart-ai .
docker run -p 80:80 nexamart-ai
```

---

## Troubleshooting

### Build Fails

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Supabase Functions Not Working

- Check function logs in Supabase dashboard
- Verify environment variables are set correctly
- Ensure JWT verification settings match your config

### M-Pesa Callback Not Received

- Verify callback URL is publicly accessible
- Check Supabase function logs
- Ensure M-Pesa sandbox/production mode matches

### Environment Variables Not Loading

- Ensure variables start with `VITE_` for frontend access
- Restart deployment after adding variables
- Check Vercel/Netlify environment variable settings

### Images Not Loading

- Verify Supabase storage buckets are public
- Check RLS policies on storage
- Ensure bucket names match code references

---

## Security Considerations

1. **Never commit `.env` files** - Use `.env.example` as template
2. **Enable RLS on all Supabase tables** - Restrict data access
3. **Use HTTPS only** - Vercel provides SSL automatically
4. **Rotate API keys regularly** - Especially payment gateway keys
5. **Monitor logs** - Check Supabase and Vercel logs for suspicious activity
6. **Limit CORS** - Restrict allowed origins in production

---

## Monitoring & Analytics

### Vercel Analytics

Enable Vercel Analytics in your project dashboard for:
- Page views
- Web Vitals
- User demographics

### Supabase Logs

Monitor Supabase logs for:
- Database queries
- Edge function invocations
- Authentication events
- Storage operations

### Error Tracking

Consider integrating:
- Sentry for error tracking
- LogRocket for session replay
- Google Analytics for user behavior

---

## Scaling Considerations

As your application grows:

1. **Database**: Consider read replicas for high traffic
2. **Storage**: Use CDN for image delivery
3. **Edge Functions**: Implement rate limiting
4. **Frontend**: Enable Vercel Edge Network caching
5. **Email**: Use dedicated email service (SendGrid, Mailgun)

---

## Support

For issues related to:
- **Supabase**: [Supabase Documentation](https://supabase.com/docs)
- **Vercel**: [Vercel Documentation](https://vercel.com/docs)
- **M-Pesa**: [Safaricom Daraja Documentation](https://developer.safaricom.co.ke)
- **Paystack**: [Paystack Documentation](https://paystack.com/docs)
- **Gemini AI**: [Google AI Documentation](https://ai.google.dev/docs)
