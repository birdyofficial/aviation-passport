# Aviation Passport V0.2 update

This update turns `/passport` from a shell into the first database-backed Passport editor.

## Before uploading to GitHub
Run `SUPABASE-UPDATE-V0.2.sql` once in the Supabase SQL Editor.

It creates the private `credential-evidence` Storage bucket for licence/rating proof.

## GitHub
Upload the files in this package to the existing `aviation-passport` repository and allow GitHub to replace files with the same names.

The key changed files are:

- `app/passport/page.tsx`
- `app/globals.css`
- `components/passport/passport-editor.tsx`
- `package.json`
- `supabase/migrations/202608260001_credential_storage.sql`

Vercel will automatically redeploy after the commit.

## What V0.2 does

- Professional Identity editor
- nationality visibility
- work-right entry
- licence submission
- private credential evidence upload
- aircraft rating submission
- employment history
- multi-select Environment
- aircraft family/variant/engine exposure
- exposure level and recency
- database-derived blue dot
- verified-rating-derived gold star
- current-authorisation-derived green shield
- Passport Preview

A submitted rating remains `pending` and therefore does not receive a gold star until it is independently verified. This is intentional.
