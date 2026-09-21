# نظام مطبعة طارق أبوهمام (v2)

نظام فواتير وحسابات عملاء للمطبعة. HTML + JavaScript (ES Modules) + Firebase، بدون أي أدوات بناء.

## الهيكل
```
index.html          الصفحة
css/style.css       التصميم (يدعم الوضع الليلي والطباعة)
js/config.js        إعدادات Firebase
js/util.js          دوال مساعدة (تنقية HTML، أرقام، تواريخ)
js/app.js           منطق النظام
database.rules.json قواعد الحماية (ضع UID حسابك)
```

## المزايا
- فاتورة متعددة البنود برقم تسلسلي، مع خصم وعربون وطريقة دفع.
- قائمة أسعار للخامات (بالمتر أو بالقطعة).
- رصيد العميل = الفواتير − التحصيلات، وعمر الدين بطريقة الأقدم أولاً.
- كشف حساب بالرصيد التراكمي، وطباعة، ورسالة واتساب جاهزة.
- تحديث لحظي، جلسة دائمة، حذف آمن (soft delete)، وسجل عمليات في `log/`.
- زر «استيراد القديم» لنقل فواتير النظام السابق (مرة واحدة).

## التشغيل
1. Firebase Console ← Authentication ← Settings ← **Authorized domains**: أضف نطاق GitHub Pages (`USER.github.io`).
2. Realtime Database ← Rules: الصق محتوى `database.rules.json` بعد وضع UID حسابك (تجده في Authentication ← Users).
3. افتح `index.html` عبر خادم محلي أو GitHub Pages (ES Modules لا تعمل بالنقر المزدوج على الملف).

## الرفع على GitHub
```bash
cd tarek-print-system
git init && git add . && git commit -m "v2: نظام فواتير مطبعة طارق أبوهمام"
git branch -M main
git remote add origin https://github.com/USER/tarek-print-system.git
git push -u origin main
```
ثم Settings ← Pages ← Branch: main. **يُفضّل أن يكون المستودع Private** (أو استخدم Firebase Hosting).

## القادم
الصلاحيات، لوحة الرسوم، لوحة متابعة الطلبات، تقرير أعمار الديون، المصروفات والمخزون، PWA.
