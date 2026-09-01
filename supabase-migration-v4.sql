-- FlowMeter Mission Manager v4
-- Run once after the original schema/migrations.
-- No login/RLS is used by design.

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
