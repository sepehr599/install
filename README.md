# FlowMeter Mission Manager

وب‌اپلیکیشن فارسی و موبایل‌محور برای مدیریت شهرها، چاه‌ها، نصب فلومتر، بازدیدهای مجدد و مأموریت‌های روزانه.

## اجرای سریع
```bash
npm install
npm run dev
```

## Supabase
این نسخه به پروژه Supabase شما متصل شده است. آدرس پروژه و publishable key در `src/supabase.ts` به عنوان fallback قرار گرفته‌اند و برای GitHub Pages قابل استفاده‌اند.

ابتدا محتوای `supabase-schema.sql` را در **SQL Editor** پروژه Supabase اجرا کنید. این فایل علاوه بر جداول، دسترسی Data API برای نقش `anon` و bucket عمومی `flowmeter-files` را نیز ایجاد می‌کند. چون در این پروژه Login نداریم، فایل‌های این bucket عمومی هستند.

بعد از اجرای SQL، برنامه داده‌ها را از Supabase می‌خواند و تغییرات اصلی را در Supabase ذخیره می‌کند. `localStorage` فقط برای نگه‌داشتن وضعیت محلی/Theme و fallback استفاده می‌شود.

> مهم: کلیدی که در `src/supabase.ts` قرار دارد publishable/anon key است. هرگز `service_role` یا Secret key را داخل Frontend قرار ندهید.

## GitHub Pages
Workflow در `.github/workflows/deploy.yml` قرار دارد.

## قابلیت‌های فعلی
- Dashboard
- شهرها و چاه‌ها
- GPS و Map با OpenStreetMap
- ثبت نصب و Visit
- مقایسه Snapshotها
- ثبت چند عکس
- ضبط چند Voice
- مأموریت روزانه
- چند چاه برای هر مأموریت
- یک Meal برای هر مأموریت
- چند Travel Segment
- Other Expenses
- گزارش جمع هزینه‌ها
- PWA-friendly UI
