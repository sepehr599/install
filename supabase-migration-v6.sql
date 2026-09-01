-- FlowMeter Mission Manager v6
-- Safe/idempotent repair for mission expense media and public storage access.

alter table if exists public.mission_media
  add column if not exists owner_id uuid;

update public.mission_media
set owner_id = mission_id
where owner_id is null;

alter table if exists public.mission_media
  alter column owner_id set not null;

create index if not exists idx_mission_media_owner
  on public.mission_media(owner_id);

grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon;

insert into storage.buckets (id, name, public)
values ('flowmeter-files', 'flowmeter-files', true)
on conflict (id) do update set public = true;

drop policy if exists "flowmeter public files" on storage.objects;
drop policy if exists "flowmeter anon files" on storage.objects;
create policy "flowmeter anon files"
on storage.objects for all
to anon
using (bucket_id = 'flowmeter-files')
with check (bucket_id = 'flowmeter-files');
