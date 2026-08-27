# Aviation Passport V0.1

Starter Next.js + Supabase application for the Aviation Passport project.

## Included

- Next.js 16 App Router
- TypeScript
- Tailwind CSS
- Supabase SSR client setup
- Cookie/session proxy
- Basic sign-in / sign-up page
- Protected `/passport` shell
- V0.1 Supabase schema migration
- Initial aviation reference seed
- Full V0.1 product/build specification

## First run

See `SETUP-WINDOWS.md`.

## V0.2 — Passport editor

The `/passport` area now includes the first real database-backed worker Passport editor:

- Professional Identity
- nationality and work rights
- Licences & Ratings with private evidence upload
- Employment & Environment
- Aircraft family / variant / engine exposure
- exposure level and recency
- calculated blue dot / gold star / green shield Passport preview

Run `SUPABASE-UPDATE-V0.2.sql` once before using credential uploads.


## Project history
See `CHANGELOG.md` and `supabase/migrations/` for version history.
