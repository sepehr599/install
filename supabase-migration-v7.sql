-- FlowMeter Mission Manager v7
-- Add the non-installable well status.

alter table if exists public.wells
  drop constraint if exists wells_status_check;

alter table if exists public.wells
  add constraint wells_status_check
  check (status in ('not_installed','installed','needs_followup','completed','inactive','non_installable'));

grant select, insert, update, delete on public.wells to anon;
