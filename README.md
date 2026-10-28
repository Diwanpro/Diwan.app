<p align="center">
  <img src="./logo.png" alt="شعار ديوان — Diwan" width="130">
</p>

<h1 align="center">ديوان (Diwan) — نظام إدارة مكاتب المحاماة في الجزائر</h1>

<p align="center">
  <strong>Offline-first · آمن ومشفّر · عربي / فرنسي</strong><br>
  <a href="https://diwanpro.github.io/Diwan.app/"><strong>▶ تجربة التطبيق مباشرة — Démo en ligne</strong></a>
</p>

---

## نظرة عامة | Aperçu

**ديوان** تطبيق ويب متكامل لإدارة مكتب المحاماة في الجزائر، يعمل بالكامل **بدون إنترنت** بعد فتحه أول مرة، ويخزّن كل بيانات المكتب محلياً على الجهاز (IndexedDB + localStorage) دون أي خادم خارجي. صُمّم ليتوافق مع الواقع الإجرائي الجزائري: قانون الإجراءات المدنية والإدارية، القانون التجاري، قانون تنظيم مهنة المحاماة، ومنظومة الدمغة والرسوم القضائية.

**Diwan** est une application web complète de gestion de cabinet d'avocat en Algérie. Elle fonctionne **hors ligne**, conserve toutes les données du cabinet localement sur l'appareil (IndexedDB + localStorage), et suit la procédure algérienne : délais, rôles, significations, droit de timbre, honoraires et comptabilité du cabinet. Interface arabe et française, conception responsive pour ordinateur et téléphone.

---

## الميزات | Fonctionnalités

| الميزة | Fonctionnalité |
| --- | --- |
| **إدارة الملفات** — أطراف متعددة بصفاتهم الإجرائية، مراحل التقاضي، الجلسات، رول الجلسات، الإنابات | **Dossiers** — parties multiples avec qualités procédurales, phases, audiences, rôle, substitutions |
| **الآجال** — محرّك آجال ذكي (استئناف، نقض، تظلم إداري مسبق، تباعد جغرافي) مع احتساب العطل والراحة القضائية | **Délais** — moteur de délais (appel, cassation, recours administratif préalable, éloignement) avec jours fériés et vacances judiciaires |
| **الدمغة** — مخزون الدمغات، الخصم الآلي حسب الجهة القضائية، حالات الإعفاء والمساعدة القضائية، تنبيه نقص المخزون | **Droit de timbre** — inventaire, déduction automatique selon la juridiction, exonérations et aide juridictionnelle, alerte de stock |
| **بوابة الموكل (PDF)** — نسخة رسمية بترويسة المكتب، بلا مبالغ مالية، مع إرسال مباشر عبر واتساب | **Portail client (PDF)** — document officiel à en-tête du cabinet, sans montants, envoi direct par WhatsApp |
| **التصدير الجبائي** — الجرد السنوي: الأتعاب الصافية، الأمانات، المصاريف القضائية | **Export fiscal** — inventaire annuel : honoraires nets, provisions, frais judiciaires |
| **المالية** — الأتعاب، دفتر المصاريف المستردة، أتعاب النتيجة، وصولات وفق المرسوم التنفيذي 05-468 (TVA / IFU) | **Finances** — honoraires, frais récupérables, honoraire de résultat, reçus conformes au décret exécutif 05-468 (TVA / IFU) |
| **مولّد الوثائق** — عرائض ومذكرات ومحاضر مع تعبئة تلقائية للأطراف، توقيع وختم رقمي، وتصدير PDF | **Générateur de documents** — requêtes et mémoires pré-remplis, signature et cachet numériques, export PDF |
| **الفريق** — مستخدمون وأدوار، دفتر التربص للمتربصين | **Équipe** — utilisateurs et rôles, cahier de stage |
| **الأرشفة** — مكتبة اجتهادات ببحث نصي شامل، نسخ احتياطي **مشفّر** AES-GCM-256 | **Archives** — bibliothèque avec recherche plein texte, sauvegarde **chiffrée** AES-GCM-256 |

### الأمان | Sécurité
- كل شيء يعمل محلياً: لا سيرفر، لا إرسال بيانات إلى أي طرف ثالث.
- نسخة احتياطية مشفّرة بكلمة مرور (PBKDF2 + AES-GCM-256).
- فترة تجريبية 30 يوماً مع نظام تفعيل بمفتاح مرتبط بالمكتب.

### التقنية | Stack
`HTML` · `CSS` · `JavaScript` نقي (بلا إطارات) · `IndexedDB` · `localStorage` · `Service Worker` (PWA قابلة للتثبيت) · `Web Crypto API`.

**التشغيل محلياً | Lancer en local**
```bash
python3 -m http.server 8080
# ثم افتح http://localhost:8080 — puis ouvrir http://localhost:8080
```

---

## المطوّر | Développeur

<p align="center">
  <strong>Attia Web Solutions</strong><br>
  تطوير حلول ويب مخصّصة — Développement de solutions web sur mesure
</p>

| | |
| --- | --- |
| 📞 الهاتف / Téléphone | **0798726063** |
| ✉️ البريد / E-mail | **diwanproject0@gmail.com** |
| 🌐 التطبيق / Application | https://diwanpro.github.io/Diwan.app/ |

---

## الترخيص | Licence

برنامج مملوك (Propriétaire). الاستخدام مرخّص للمكتب المشترك مقابل ترخيص صالح؛ يُمنع إعادة التوزيع أو البيع أو فكّ الحماية. الحقوق محفوظة لـ **Attia Web Solutions**.

*Logiciel propriétaire. Usage soumis à une licence valide ; toute redistribution, revente ou contournement de la protection est interdite. © Attia Web Solutions.*
