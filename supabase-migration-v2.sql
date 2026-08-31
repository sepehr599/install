-- اگر schema قبلی را قبلاً اجرا کرده‌اید، این Migration را فقط یک بار اجرا کنید.
-- برای نسخه نهایی فعلی، جدول mission_media همان ساختار قبلی را حفظ می‌کند.
-- این Migration برای ایندکس‌های مورد نیاز و بهینه‌سازی Data API است.
create index if not exists idx_snapshots_visit_date on public.snapshots(visit_date desc);
create index if not exists idx_snapshots_transmitter on public.snapshots(transmitter_serial);
create index if not exists idx_snapshots_sensor on public.snapshots(sensor_serial);
create index if not exists idx_mission_media_mission_category on public.mission_media(mission_id, category, media_type);
