# Changelog

## V0.7 — Employer Foundation + Open Demand
- Added protected Employer Portal at `/employer`
- Organisation creation with automatic creator membership bootstrap
- Organisation selector and verification status
- Open Demand dashboard with active-demand, position and draft metrics
- Create and edit structured demand
- Demand status: Draft, Open, Paused, Filled, Cancelled
- Public, Limited and Confidential demand visibility
- Role, discipline, seniority, quantity, employment type and location
- Sponsorship and relocation assistance
- Structured operating environments
- Roster shift and pattern
- Expected start and target fill dates
- Transparent base compensation range in native currency
- Open Demand cannot be published without compensation and country
- Demand register with quick Open / Pause / Cancel controls
- No worker/talent database access exposed yet; employer access remains demand-first
- Added Employer Portal navigation from home and My Passport
- No Supabase migration required: V0.7 uses the employer/demand schema and RLS already created in V0.1

## V0.6.1 — Market Preference UX
- Notice period now supports days, weeks or months
- Original notice value/unit is preserved for display and editing
- A normalized day value remains available internally for matching
- Added Night shift preferred as a structured roster preference
- Roster preference now appears in Passport Preview when specified

## V0.6 — Market Preferences
- Availability and notice period
- Mobility: relocation, FIFO, DIDO, commuting, permanent international roles, temporary assignments
- Preferred employment types and environments
- Structured location preferences with work arrangement
- Roster flexibility and optional preferred pattern
- Private / compatibility-only / visible minimum compensation
- Passport Preview market-preference summary
- Repository cleanup: one changelog + versioned Supabase migrations, no duplicate root update files

## V0.5 — Company Authorisations
- Company authorisation records linked to employment where possible
- Current/historical state, evidence, edit/remove and verification reset
- Verified current authorisations drive the green shield
- EU-27 work rights collapse to a single European Union item in Passport Preview

## V0.4 — Training & Competencies
- Formal training records, expiry and evidence
- Structured competencies with aircraft mapping and global free-text fallback
- Edit/remove and verification reset

## V0.3.x — Passport Globalisation & UX
- Global licence system/authority model
- Multiple work rights and EU-27 shortcut
- Expanded aircraft reference data and grouped selectors
- Streamlined employment and current aircraft exposure
- Licence/rating edit and remove

## V0.2.x — Passport Editor
- Professional identity, licences, ratings, employment and aircraft exposure
- Private credential evidence storage

## V0.1 — Foundation
- Next.js/Supabase application foundation, authentication, schema, RLS and reference data
