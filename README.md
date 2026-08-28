# Aviation Passport

Aviation Passport is a structured global aviation workforce platform built around portable professional identity, declared employer demand, transparent compensation and explainable matching.

## Current prototype

V0.9.2 includes:

- Worker Passport
- Licences and aircraft ratings
- Employment and aircraft exposure
- Training and competencies
- Company authorisations
- Work rights and market preferences
- Employer organisations
- Open Demand
- Aviation-specific demand requirements
- Demand Intelligence
- Anonymous and identified Talent Matches
- Compensation impact scenarios

## Stack

- Next.js App Router
- TypeScript
- Tailwind
- Supabase PostgreSQL / Auth / Storage
- Vercel

## Database changes

Versioned SQL migrations live in `supabase/migrations/`.

For the browser-only deployment workflow, run only the new migration supplied with each release, then upload the GitHub-ready package and allow Vercel to deploy it.

## Product rule

Individual talent access is demand-bound. Employers do not receive unrestricted access to the worker database.
