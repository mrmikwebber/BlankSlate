# Legal Pages and Tracking

This folder documents the legal pages added and a minimal approach to Terms of Service (ToS) acceptance tracking.

## Pages

- Terms of Service: see src/app/terms/page.tsx
- Privacy Policy: see src/app/privacy/page.tsx
- Cookies Policy: see src/app/cookies/page.tsx
- Footer links added in src/app/layout.tsx
- Cookie consent banner: src/components/ui/CookieConsent.tsx
- Robots & sitemap: public/robots.txt, public/sitemap.xml

## ToS Acceptance Tracking (Supabase)

If you need to record that a user has accepted the current ToS version, you can create a simple table and update it upon acceptance. An example SQL migration is provided in db/legal_acceptances.sql.

Suggested flow:

1. Define a constant `CURRENT_TOS_VERSION` (e.g., in src/lib/utils.ts) and bump it when Terms change.
2. After login, query `legal_acceptances` for the user and check if there is a record for `document = 'tos'` with the current version.
3. If missing, show an in-app prompt requiring acceptance before continuing. On acceptance, insert the record.

Note: This is general guidance and not legal advice. Adapt for your jurisdiction and your specific product needs.
