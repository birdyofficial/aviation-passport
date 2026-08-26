-- AVIATION PASSPORT V0.2 — RUN ONCE IN SUPABASE SQL EDITOR
-- Adds the private credential-evidence bucket and worker-only object policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'credential-evidence',
  'credential-evidence',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "workers upload own credential evidence" on storage.objects;
drop policy if exists "workers read own credential evidence" on storage.objects;
drop policy if exists "workers update own credential evidence" on storage.objects;
drop policy if exists "workers delete own credential evidence" on storage.objects;

create policy "workers upload own credential evidence"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'credential-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "workers read own credential evidence"
on storage.objects for select to authenticated
using (
  bucket_id = 'credential-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "workers update own credential evidence"
on storage.objects for update to authenticated
using (
  bucket_id = 'credential-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'credential-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "workers delete own credential evidence"
on storage.objects for delete to authenticated
using (
  bucket_id = 'credential-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);
