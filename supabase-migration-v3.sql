-- FlowMeter Mission Manager v3
-- Adds follow-up flag to snapshots and allows mission media for other expenses.
alter table if exists snapshots add column if not exists follow_up boolean not null default false;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'mission_media_category_check') then
    alter table mission_media drop constraint mission_media_category_check;
  end if;
  alter table mission_media add constraint mission_media_category_check
    check (category in ('meal','travel','other','mission'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_snapshots_followup on snapshots(follow_up) where follow_up = true;
