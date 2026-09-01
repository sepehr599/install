-- FlowMeter Mission Manager v6
-- Defensive migration for mission/expense media ownership and public storage.
-- Run once in Supabase after the previous migrations.

alter table if exists mission_media add column if not exists owner_id uuid;

-- Older media rows were mission-level before per-expense ownership was introduced.
update mission_media
set owner_id = mission_id
where owner_id is null;

alter table if exists mission_media alter column owner_id set not null;

create index if not exists idx_mission_media_owner_category on mission_media(owner_id, category);

grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon;

insert into storage.buckets (id, name, public)
values ('flowmeter-files', 'flowmeter-files', true)
on conflict (id) do update set public = true;

drop policy if exists "flowmeter public files" on storage.objects;
drop policy if exists "flowmeter anon files" on storage.objects;
create policy "flowmeter public files"
on storage.objects for all
to anon
using (bucket_id = 'flowmeter-files')
with check (bucket_id = 'flowmeter-files');
