-- 1. Create the storage bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('memorial-images', 'memorial-images', true)
on conflict (id) do nothing;

-- 2. Allow Public Access (Read) - Everyone can view images
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'memorial-images' );

-- 3. Allow Public Uploads (Insert) - CAUTION: Allows anyone to upload
-- Useful for the migration script if you are NOT using the Service Role Key.
-- You should disable this after running the script if you want to prevent public uploads.
create policy "Public Upload"
  on storage.objects for insert
  with check ( bucket_id = 'memorial-images' );

-- 4. Allow Public Updates (Update) - In case we need to overwrite
create policy "Public Update"
  on storage.objects for update
  using ( bucket_id = 'memorial-images' );
