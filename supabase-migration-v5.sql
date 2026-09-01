-- FlowMeter Mission Manager v5
-- Fixes: travel/other-expense photos were only linked to mission_id + category,
-- with no way to know WHICH travel segment or WHICH other-expense item a photo
-- belongs to. This adds an owner_id column so each photo can be tied to the
-- exact record it was uploaded for (a travel segment id, an other-expense id,
-- a meal id, or the mission id itself for mission-level photos).
--
-- Safe to run multiple times.

alter table if exists mission_media add column if not exists owner_id uuid;

-- Backfill: for existing rows we don't know the exact owner, so point them at
-- the mission itself (matches previous behaviour) rather than leaving null.
update mission_media set owner_id = mission_id where owner_id is null;

alter table if exists mission_media alter column owner_id set not null;

create index if not exists idx_mission_media_owner on mission_media(owner_id);

-- Make sure anon (no-login app) still has full access after the change.
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon;
