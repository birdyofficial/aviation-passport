# Changelog

## V0.9.2 — Clear Demand Intelligence + Salary Impact
- Replaced the Supply Funnel UI with a straightforward Market Snapshot
- Demand Intelligence now shows Mandatory-qualified, receptive, Talent Match, location-compatible and salary-compatible supply clearly
- Added a compensation scenario tool so HR can test a different salary range without changing the live demand
- Added Apply to demand after testing a salary scenario
- Private candidate minimum compensation remains hidden; only compatibility is evaluated
- Talent Matches no longer silently disappear just because positive mobility preferences were not filled in
- Only an explicit Not Interested location preference blocks a receptive worker on location grounds
- Compensation below a worker minimum is now shown as a compatibility gap rather than silently removing an otherwise qualified worker
- Added Location Check and Compensation Gap match states
- Renamed Requirements & Market workspace tab to Demand Intelligence
- Added aggregate diagnostics for location, salary and verified Mandatory compatibility

## V0.9.1 — Visibility Simplification + Anonymous Matches
- Simplified worker profile visibility to Private, Anonymous Market and Public
- Removed Aviation Network from the worker-facing UI
- Existing Aviation Network profiles migrate to Public
- New worker profiles default to Anonymous Market
- Anonymous Market workers can now appear in demand-bound Talent Matches
- Anonymous cards hide worker UUID, name, professional headline and exact current location
- Added demand-scoped anonymous match reference for stable employer-side display
- Talent Match metrics now distinguish Identified and Anonymous matches
- Private profiles remain excluded from individual Talent Matches

## V0.9 — Demand Workspace + Talent Matches
- Requirements & Market now opens on a dedicated demand workspace page instead of appearing below the Employer Portal register
- Added `/employer/demand/[id]` workspace with Requirements & Market and Talent Matches tabs
- Cancelled demands can be deleted from the employer register
- Demand deletion is non-destructive: the record is soft-deleted so historical market intelligence is preserved
- Added controlled individual talent matching for active Open Demand only
- No broad employer SELECT access to worker Passport tables
- Private, anonymous-market and not-open workers are excluded from individual talent results
- Mandatory requirements remain hard filters
- Trainable and Preferred requirements become explainable candidate gap signals
- Added Exact Match, Strong Match, Trainable Match and Mobility Match labels
- Added trust signal for fully verified mandatory facts versus structured facts still pending verification
- Work-right, location, availability and compensation compatibility appear on each candidate
- Private compensation minimums remain hidden; only compatibility is exposed unless the worker selected Visible
- Explicit worker Not Interested location preferences exclude the opportunity
- Directly comparable offers below a worker's private minimum are excluded from individual matches
- No candidate contact flow yet; structured demand-bound opportunities are the next layer

## V0.8.1 — Guided Demand Builder UX
- Reworked demand creation into one guided two-step flow
- Step 1 captures role, location, mobility, roster, timing and compensation
- Step 2 captures environment, aircraft, licence, competency and training requirements before publishing
- New demands are saved invisibly as Draft between steps so requirement records have a demand ID
- Removed the duplicate Environment selector from the basic demand form
- Removed status selection from the creation form; publication now happens only after requirements
- Editing an existing demand uses the same guided flow
- Demand register is now the default employer dashboard instead of an always-open blank form
- Market intelligence remains available separately through Requirements & market
- No Supabase migration required

## V0.8 — Demand Requirements + Matching Intelligence
- Added Requirements & Market workspace to every employer demand
- Environment requirements now support Mandatory / Trainable / Preferred / Not relevant
- Added structured aircraft requirements with separate experience, rating and company-authorisation levels
- Added minimum exposure and aircraft recency criteria
- Added structured global licence requirements, issuing authority/country, category and conversion acceptance
- Added competency requirements with aircraft mapping and explicit recency in months
- Added formal training requirements with current/not-expired handling
- Added Not Listed fallbacks for aircraft, issuing authority, licence system and competency requirements
- Added controlled aggregate supply-funnel RPC; no individual worker data is returned
- Supply funnel separates structured, receptive and verified supply
- Only Mandatory requirements hard-filter the pool; Trainable and Preferred remain non-excluding
- Work-right eligibility is applied automatically from demand country and sponsorship policy
- Employer can watch the aggregate pool narrow as requirements change

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
