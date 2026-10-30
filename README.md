# VELORA

VELORA is a mobile-first, adults-only social discovery and dating app starter. It uses a dark plum interface, pink neon accents, and a custom V mark.

## Current build

- Responsive discovery dashboard and profile cards
- Strict 18+ date-of-birth entry gate (client-side preview gate only; production enforcement must be server-side)
- Interest filters, profile search, like/pass preview interactions
- Matches, Messages, Gifts, and VIP navigation placeholders
- Custom SVG brand icon and installable PWA manifest
- No fake authentication, payments, messages, or user records

## Run locally

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Production services still to connect

This repository is the first UI foundation, not a production dating service yet. Before public launch, connect and test:

1. Supabase Auth, Postgres, Storage, and Realtime.
2. Server-enforced 18+ eligibility, age verification policy, and account moderation.
3. Row-level security for profiles, likes, matches, messages, blocks, reports, and wallet records.
4. Paystack server-side initialization, signature-verified webhooks, payment verification, and idempotent coin ledger updates.
5. Secure media upload rules, rate limits, privacy controls, and admin moderation.
6. A real messaging/calling provider if voice or video calling is enabled.

Never put Supabase service-role or Paystack secret keys in browser code. Copy environment values from your own provider dashboards into local environment files or deployment secrets. Do not commit secrets.

## Important

The date-of-birth gate currently improves the preview experience only. A client-side check can be bypassed and is not sufficient for a real age-restricted service. Enforce eligibility on the server before allowing registration, discovery, or messaging. Do not launch until that and the security checklist above are complete.
