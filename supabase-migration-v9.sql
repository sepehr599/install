-- FlowMeter Mission Manager v9
-- Save the technical dt and sensor length values with each installation/visit snapshot.

alter table if exists public.snapshots
  add column if not exists sensor_dt_ns numeric;

alter table if exists public.snapshots
  add column if not exists sensor_length_m numeric;

grant select, insert, update, delete on public.snapshots to anon;
