# Aviation Passport V0.3

## Changes

- ISO country dropdowns everywhere, rendered as `AU - Australia`, `DE - Germany`, etc.
- Middle name added to Professional Identity.
- Professional Summary removed from the worker UI and Passport preview.
- Work Rights are now a true multi-country list with add/remove controls.
- EU-27 work-right shortcut adds all missing EU countries without overwriting existing country-specific status.
- Licence form redesigned for global use:
  - Licence system/framework (EASA Part-66, CASA CASR Part 66, FAA, Canada, etc.)
  - Issuing country
  - Issuing authority
  - `Not listed` authority with exact free-text authority name
- EASA is modelled as a regulatory/licence system, not as an issuing authority.
- Credential bucket raised from 10 MB to 50 MB.
- Aircraft family catalogue expanded across airliners, regional aircraft and common rotorcraft.
- `Not listed` aircraft family/type support added to ratings and employment exposure.
- Environment ordering now follows the logical operational sequence from Line/Base/Heavy through Production/FAL/Prototype/etc., rather than alphabetical sorting.

## Deploy order

1. Run `SUPABASE-UPDATE-V0.3.sql` in Supabase SQL Editor.
2. Upload/replace the V0.3 GitHub files in the existing `aviation-passport` repository.
3. Let Vercel redeploy automatically.
4. If a credential file above 10 MB is still rejected, check Supabase **Storage > Settings > Global file size limit** and set it to 50 MB (Free plan maximum).
