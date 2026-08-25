# Aviation Passport V0.1 — Browser-only deployment

You do NOT need Node.js or npm on your PC.

## 1. GitHub
1. Create a new private GitHub repository named `aviation-passport`.
2. Unzip this package.
3. Upload the CONTENTS of the `aviation-passport-github` folder into the repository root.
4. Commit the files.

Important: do not upload `.env.local`. It is intentionally not included.

## 2. Supabase
1. Open the Aviation Passport Supabase project.
2. Go to SQL Editor.
3. Create a new query.
4. Copy the entire contents of `AVIATION-PASSPORT-SUPABASE-V0.1.sql`.
5. Run it once.
6. It should complete successfully before deployment.

## 3. Vercel
1. In Vercel, choose Add New > Project.
2. Import the `aviation-passport` GitHub repository.
3. Framework should be detected as Next.js.
4. Add these Environment Variables for Production, Preview and Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Get both values from Supabase > Connect.
6. Deploy.

Vercel installs npm dependencies during the cloud build. Nothing needs to be installed locally.

## 4. Supabase Auth URL
After Vercel creates the site URL:
1. Supabase > Authentication > URL Configuration.
2. Set Site URL to the Vercel production URL.
3. Add the same production URL to Redirect URLs.

## 5. First test
Open the deployed site:
1. Create an account.
2. Sign in.
3. Open `/passport`.
4. You should see the protected Aviation Passport V0.1 shell.

Then the next build step is the real Passport form and the blue-dot / gold-star / green-shield aircraft display.
