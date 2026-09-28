-- FlowMeter Mission Manager v8
-- Add technical output configuration/status to installation and revisit snapshots.

alter table if exists public.snapshots
  add column if not exists output_type text not null default 'unknown';

alter table if exists public.snapshots
  add column if not exists output_status text not null default 'no_panel';

alter table if exists public.snapshots
  add column if not exists output_4_value numeric;

alter table if exists public.snapshots
  add column if not exists output_20_value numeric;

alter table if exists public.snapshots
  drop constraint if exists snapshots_output_type_check;

alter table if exists public.snapshots
  add constraint snapshots_output_type_check
  check (output_type in ('4_20','modbus','unknown'));

alter table if exists public.snapshots
  drop constraint if exists snapshots_output_status_check;

alter table if exists public.snapshots
  add constraint snapshots_output_status_check
  check (output_status in ('no_panel','panel_arrived_not_installed','connected_scada_not_checked','panel_and_scada_confirmed'));

grant select, insert, update, delete on public.snapshots to anon;
