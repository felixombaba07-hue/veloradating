# VELORA

VELORA is a mobile-first adult-only social discovery application. The frontend is React + Vite; Supabase provides authentication, Postgres data, row-level security, and realtime chat.

## Implemented in this repository

- Supabase email/password sign-up and sign-in flow
- Database-triggered 18+ date-of-birth eligibility check before a profile is created
- Profile editing and database-backed profile discovery
- Like/pass actions and automatic mutual-match creation
- Match-scoped realtime messaging
- Wallet, gifts, payment-order, and VIP database foundations
- Private birth dates: discovery returns age only
- Responsive layout and PWA branding

## Required setup

1. Create or select a Supabase project.
2. In the Supabase SQL Editor, run migrations in order:
   - `supabase/migrations/202610300001_initial_schema.sql`
   - `supabase/migrations/202610300002_private_birth_dates.sql`
3. In the Vercel project settings, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (Supabase publishable/anon key)
4. Redeploy the Vite app.
5. In Supabase Auth, configure the production site URL, allowed redirect URLs, email confirmation, and SMTP sender.
6. Configure Supabase Storage buckets and policies before enabling profile photo uploads.
7. Configure Paystack only through server-side Supabase Edge Functions and secrets. Never put a Paystack secret key in a VITE_ variable.

Copy `.env.example` to `.env.local` for local development.

## Local development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Important safety and launch requirements

- The database rejects account creation when the submitted date of birth indicates an age under 18. A date-of-birth check is not identity verification; obtain and integrate a lawful age-assurance process before public launch.
- Do not enable access for minors. The service must remain 18+.
- Do not use sample/fabricated member profiles. Discovery reads real rows from Supabase.
- Paystack checkout, gift transfers, coin purchases/redemptions, VIP billing, voice/video calling, moderation tooling, and account deletion are not yet live. The interface deliberately does not claim these actions succeeded.
- Configure storage access, abuse reporting, blocking review, rate limits, privacy/legal documents, and moderation operations before launch.
- Test RLS policies using separate test accounts and verify email confirmation, password recovery, account deletion, and realtime authorization before production.

## Deployment status

The repository contains the application code and migrations. A successful GitHub Actions build and a live deployment still need to be confirmed after environment configuration.
