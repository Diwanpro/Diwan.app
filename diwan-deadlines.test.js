/*
 * ديوان — اختبارات محرك الآجال (Regression Gate)
 * ================================================
 * التشغيل:
 *     DIWAN_HTML=./index.html node diwan-deadlines.test.js
 *
 * متغيرات اختيارية:
 *     DIWAN_GUIDE=./diwan_guide-1.html   فحص الدليل أيضاً
 *     DIWAN_EXPECT_VERSION=10.3.2        يجب أن تطابق كل سلاسل الإصدار هذه القيمة
 *     DIWAN_TZS="Africa/Algiers,UTC"     المناطق الزمنية المختبَرة (الافتراضي: أربع مناطق)
 *     DIWAN_STRICT_SOURCES=1             اجعل غياب مرجع المادة في أي قاعدة آجال فشلاً
 *     DIWAN_N=8000                       عدد العينات العشوائية لكل إعداد
 *
 * في نظام البناء (package.json):
 *     "scripts": {
 *       "test:deadlines": "node diwan-deadlines.test.js",
 *       "prebuild": "npm run test:deadlines"
 *     }
 *   أي فشل => رمز خروج 1 => يتوقف البناء.
 *
 * المتطلبات: Node 18+ ولا شيء آخر (لا حزم خارجية).
 *
 * ── العقد (Contract) الذي تفرضه الاختبارات ─────────────────────────────
 * 1) calcDeadline(from, rule, abroad, ...) تُرجع تاريخين:
 *      prudent  (أو orig) : التاريخ الاحترازي = آخر يوم بحسب الحساب الخام، قبل مدّ م 405 (الأبكر)
 *      maxLegal (أو safe) : الأجل الأقصى بعد مدّ العطل وأيام الراحة (م 405)
 * 2) كل تنبيه أو تذكير أو أجل محفوظ يُبنى على prudent دائماً، لا على maxLegal.
 * 3) كل شاشة تحسب أجلاً تستدعي calcDeadline وحدها؛ لا حساب تواريخ موازٍ.
 * 4) يُنصح بوسم المحرك في index.html بتعليقَي كتلة حرفيّاً:
 *      DIWAN-ENGINE-START  قبل أول سطر من المحرك، و DIWAN-ENGINE-END بعد آخر سطر منه
 *      (كل واحد داخل علامتي التعليق: سلاش-نجمة ... نجمة-سلاش، بمسافة بعد الافتتاح وقبل الإغلاق).
 *    وإن لم يوجدا يُستعمل الوسم القديم (من const DEFAULT_HOLIDAYS حتى Object.assign(S,{audit).
 *
 * ملاحظة قانونية: «المحاكي المرجعي» (oracle) أدناه مكتوب بمعزل عن كود التطبيق
 * ويُمثّل قراءتنا للقاعدة. إن اختلف رأي المحامي الممارس في أي قاعدة،
 * عدّلوا الـoracle والحالات الذهبية معاً — لا تُعدّلوا الاختبار ليوافق الكود فقط.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const HTML_PATH = path.resolve(process.env.DIWAN_HTML || './index.html');
const GUIDE_PATH = process.env.DIWAN_GUIDE ? path.resolve(process.env.DIWAN_GUIDE) : null;
const TZS = (process.env.DIWAN_TZS || 'Africa/Algiers,UTC,America/New_York,Pacific/Auckland')
  .split(',').map(s => s.trim()).filter(Boolean);

/* ───────────── الوضع الأب: يعيد التشغيل في عدة مناطق زمنية ───────────── */
if (!process.env.DIWAN_CHILD) {
  let failed = false;
  for (const tz of TZS) {
    console.log(`\n══════════ المنطقة الزمنية: ${tz} ══════════`);
    const r = cp.spawnSync(process.execPath, ['--test-reporter=spec', __filename], {
      stdio: 'inherit',
      env: Object.assign({}, process.env, { TZ: tz, DIWAN_CHILD: '1' }),
    });
    if (r.status !== 0) failed = true;
  }
  console.log(failed ? '\n✖ فشل الاختبار — أوقفوا الإصدار.' : '\n✔ نجحت كل الاختبارات في كل المناطق الزمنية.');
  process.exit(failed ? 1 : 0);
}

/* ═════════════════════ الوضع الابن: الاختبارات الفعلية ═════════════════════ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

if (!fs.existsSync(HTML_PATH)) {
  console.error('الملف غير موجود: ' + HTML_PATH + '  (اضبطوا DIWAN_HTML)');
  process.exit(2);
}
const SRC = fs.readFileSync(HTML_PATH, 'utf8');
const GUIDE = GUIDE_PATH && fs.existsSync(GUIDE_PATH) ? fs.readFileSync(GUIDE_PATH, 'utf8') : null;

/* ───────────── أدوات استخراج الكود من index.html ───────────── */
function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

function skipString(s, i, q) {
  i++;
  while (i < s.length) { if (s[i] === '\\') { i += 2; continue; } if (s[i] === q) return i + 1; i++; }
  return i;
}
function skipTemplate(s, i) {
  i++;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && s[i + 1] === '{') { i = skipBlock(s, i + 1); continue; }
    i++;
  }
  return i;
}
function skipBlock(s, i) { // s[i] === '{' ؛ يعيد الفهرس بعد '}' المطابقة
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"') { i = skipString(s, i, c); continue; }
    if (c === '`') { i = skipTemplate(s, i); continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return i;
}
function extractFunction(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) return null;
  const open = src.indexOf('{', src.indexOf(')', m.index));
  const end = skipBlock(src, open);
  return { code: src.slice(m.index, end), start: m.index, end };
}

function engineRange(src) {
  const a = src.indexOf('/* DIWAN-ENGINE-START */'), b = src.indexOf('/* DIWAN-ENGINE-END */');
  if (a >= 0 && b > a) return { start: a, end: b + '/* DIWAN-ENGINE-END */'.length, marked: true };
  const s = src.indexOf('const DEFAULT_HOLIDAYS');
  const e = src.indexOf('Object.assign(S,{audit', s);
  if (s < 0 || e < 0) return null;
  return { start: s, end: e, marked: false };
}
const ENG = engineRange(SRC);

/* ───────────── بيئة التنفيذ: المحرك الحقيقي + الشاشات الحقيقية ───────────── */
function loadEnv(sOverrides) {
  if (!ENG) throw new Error('تعذّر تحديد كتلة المحرك في index.html. أضيفوا الوسمين DIWAN-ENGINE-START/END.');
  const S = Object.assign({ dlCalc: { date: '2026-10-01', skip: true, abroad: false }, audit: [] }, sOverrides || {});
  const TODAY = new Date(2026, 10, 1); TODAY.setHours(0, 0, 0, 0);
  const D = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const K = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const diff = s => s ? Math.round((D(s) - TODAY) / 864e5) : 999;
  const t = k => k, fmt = x => x, esc = x => String(x);
  const tr = o => (o && typeof o === 'object') ? (o.ar || o.fr || '') : String(o);
  const money = x => String(x);

  const engineCode = SRC.slice(ENG.start, ENG.end);
  const screens = ['calcDLTable', 'sigDL'].map(n => extractFunction(SRC, n)).filter(Boolean).map(f => f.code).join('\n');
  const body = engineCode + '\n' + screens + `
    return {
      S,
      calcDeadline: typeof calcDeadline !== 'undefined' ? calcDeadline : null,
      isNonWorking: typeof isNonWorking !== 'undefined' ? isNonWorking : null,
      DEFAULT_DLK: typeof DEFAULT_DLK !== 'undefined' ? DEFAULT_DLK : null,
      DEFAULT_HOLIDAYS: typeof DEFAULT_HOLIDAYS !== 'undefined' ? DEFAULT_HOLIDAYS : null,
      calcDLTable: typeof calcDLTable !== 'undefined' ? calcDLTable : null,
      sigDL: typeof sigDL !== 'undefined' ? sigDL : null
    };`;
  // eslint-disable-next-line no-new-func
  return new Function('S', 'D', 'K', 'diff', 'TODAY', 't', 'fmt', 'esc', 'tr', 'money', body)(S, D, K, diff, TODAY, t, fmt, esc, tr, money);
}

/** يوحّد أسماء الحقول القديمة والجديدة */
function norm(r, ctx) {
  const prudent = r.prudent !== undefined ? r.prudent : r.orig;
  const maxLegal = r.maxLegal !== undefined ? r.maxLegal : r.safe;
  if (!prudent || !maxLegal) throw new Error('calcDeadline لا تُرجع {prudent,maxLegal} (أو orig/safe) — ' + (ctx || ''));
  return { prudent, maxLegal };
}

/* ───────────── المحاكي المرجعي (مستقل تماماً عن كود التطبيق) ───────────── */
const FIXED_HOLIDAYS = ['01-01', '01-12', '05-01', '07-05', '11-01']; // رأس السنة، يناير/ينّاير، العمال، الاستقلال، الثورة
const U = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const iso = u => u.toISOString().slice(0, 10);
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return U(y, m, d); };
function addDaysU(u, n) { return new Date(u.getTime() + n * 864e5); }
function addMonthsClamp(u, n) {
  const d = u.getUTCDate();
  const t = new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t;
}
function oracle(from, rule, abroad, cfg) {
  cfg = cfg || {};
  const f = parseISO(from);
  // اليوم الأول (يوم التبليغ) لا يُحسب؛ الأجل بالأشهر ينتهي في اليوم المقابل،
  // وإن لم يوجد يوم مقابل فآخر يوم من الشهر.
  let end = rule.unit === 'month' ? addMonthsClamp(f, rule.n) : addDaysU(f, rule.n);
  if (abroad && rule.abroadMonths > 0) end = addMonthsClamp(end, rule.abroadMonths);
  const nonWorking = u => {
    const dow = u.getUTCDay(), s = iso(u), md = s.slice(5);
    return !!(dow === 5 || dow === 6 || FIXED_HOLIDAYS.includes(md) ||
      (cfg.movable && cfg.movable.has(s)) ||
      (cfg.vac && md >= cfg.vac.from && md <= cfg.vac.to));
  };
  let max = end; while (nonWorking(max)) max = addDaysU(max, 1);
  return { prudent: iso(end), maxLegal: iso(max), nonWorking };
}

/* مولّد عشوائي قابل للتكرار */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ═══════════════════════════ 0) سلامة المحرك ═══════════════════════════ */
describe('0) المحرك قابل للتحميل ويحقق العقد', () => {
  test('كتلة المحرك موجودة وتُحمَّل', () => {
    const env = loadEnv();
    assert.ok(env.calcDeadline, 'calcDeadline غير معرّفة');
    assert.ok(Array.isArray(env.DEFAULT_DLK) && env.DEFAULT_DLK.length > 0, 'DEFAULT_DLK غير معرّفة');
  });
  test('calcDeadline تُرجع prudent و maxLegal', () => {
    const env = loadEnv();
    const r = norm(env.calcDeadline('2026-10-01', env.DEFAULT_DLK[0], false, true), 'smoke');
    assert.match(r.prudent, /^\d{4}-\d{2}-\d{2}$/); assert.match(r.maxLegal, /^\d{4}-\d{2}-\d{2}$/);
  });
});

/* ═══════════════════════════ 1) العطل الرسمية ═══════════════════════════ */
describe('1) العطل الثابتة', () => {
  test('القائمة مطابقة تماماً: 1/1 و12/1 و1/5 و5/7 و1/11 — لا غير', () => {
    const env = loadEnv();
    assert.deepEqual([...env.DEFAULT_HOLIDAYS].sort(), [...FIXED_HOLIDAYS].sort());
  });
  test('11 جانفي ليس عطلة، و12 جانفي و1 نوفمبر عطلتان', () => {
    const env = loadEnv();
    const D = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    assert.equal(env.isNonWorking(D('2027-01-11')), false, '11 جانفي 2027 (الإثنين) يوم عمل');
    assert.equal(env.isNonWorking(D('2027-01-12')), true);
    assert.equal(env.isNonWorking(D('2026-11-01')), true);
  });
  test('الجمعة والسبت راحة، والأحد والخميس عمل', () => {
    const env = loadEnv();
    const D = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    assert.equal(env.isNonWorking(D('2026-10-30')), true);  // جمعة
    assert.equal(env.isNonWorking(D('2026-10-31')), true);  // سبت
    assert.equal(env.isNonWorking(D('2026-10-25')), false); // أحد
    assert.equal(env.isNonWorking(D('2026-10-29')), false); // خميس
  });
  test('العطلة القضائية معطّلة افتراضياً (لا توقف الآجال)', () => {
    const env = loadEnv(); // لا dlVacation في الحالة
    const r = norm(env.calcDeadline('2026-07-31', { id: 'x', unit: 'day', n: 10, abroadMonths: 0 }, false, true));
    assert.deepEqual(r, { prudent: '2026-08-10', maxLegal: '2026-08-10' });
  });
});

/* ═══════════════════════════ 2) حالات ذهبية (محسوبة يدوياً) ═══════════════════════════ */
const M = n => ({ id: 'm' + n, unit: 'month', n, abroadMonths: 2 });
const Dd = n => ({ id: 'd' + n, unit: 'day', n, abroadMonths: 0 });
const GOLDEN = [
  ['استئناف 2026-10-01 → ينتهي أحد وهو 1 نوفمبر (عطلة)', '2026-10-01', M(1), false, '2026-11-01', '2026-11-02'],
  ['نهاية فيفري غير الكبيسة: تبليغ 31 جانفي', '2026-01-31', M(1), false, '2026-02-28', '2026-03-01'],
  ['تبليغ 30 جانفي ← 28 فيفري (لا يوجد 30 فيفري)', '2026-01-30', M(1), false, '2026-02-28', '2026-03-01'],
  ['تبليغ 30 سبتمبر ← 30 أكتوبر (لا 31: من تاريخ إلى مثله)', '2026-09-30', M(1), false, '2026-10-30', '2026-11-02'],
  ['تبليغ 28 جانفي ← 28 فيفري (اليوم المقابل موجود)', '2026-01-28', M(1), false, '2026-02-28', '2026-03-01'],
  ['سنة كبيسة: تبليغ 31 جانفي 2028 ← 29 فيفري', '2028-01-31', M(1), false, '2028-02-29', '2028-02-29'],
  ['3 أيام من الخميس 29 أكتوبر ← الأحد 1 نوفمبر ← الإثنين', '2026-10-29', Dd(3), false, '2026-11-01', '2026-11-02'],
  ['نقض شهران من 31 أوت ← السبت 31 أكتوبر ← الإثنين 2 نوفمبر', '2026-08-31', M(2), false, '2026-10-31', '2026-11-02'],
  ['10 أيام تنتهي الجمعة 19 جوان ← الأحد 21', '2026-06-09', Dd(10), false, '2026-06-19', '2026-06-21'],
  ['10 أيام تنتهي الثلاثاء 12 جانفي (ينّاير) ← الأربعاء 13', '2027-01-02', Dd(10), false, '2027-01-12', '2027-01-13'],
  ['10 أيام تنتهي الإثنين 11 جانفي ← لا مدّ', '2027-01-01', Dd(10), false, '2027-01-11', '2027-01-11'],
  ['سلسلة راحة: جمعة+سبت+عطلة الأحد 1 نوفمبر ← الإثنين 2', '2026-10-20', Dd(10), false, '2026-10-30', '2026-11-02'],
  ['15 يوماً تنتهي الجمعة 1 جانفي 2027 ← السبت ← الأحد 3', '2026-12-17', Dd(15), false, '2027-01-01', '2027-01-03'],
  ['نقض شهران ينتهي 12 جانفي 2027 (عطلة) ← 13', '2026-11-12', M(2), false, '2027-01-12', '2027-01-13'],
  ['مقيم بالخارج: +شهران بعد الأجل الأصلي', '2026-03-10', M(1), true, '2026-06-10', '2026-06-10'],
];
describe('2) الحالات الذهبية — المحرك الحقيقي', () => {
  for (const [name, from, rule, abroad, p, m] of GOLDEN) {
    test(name, () => {
      const env = loadEnv();
      const got = norm(env.calcDeadline(from, rule, abroad, true), name);
      assert.deepEqual(got, { prudent: p, maxLegal: m });
    });
  }
  test('عطلة قضائية مفعّلة: 10 أيام تنتهي 10 أوت ← 1 سبتمبر', () => {
    const env = loadEnv({ dlVacation: { on: true, from: '07-15', to: '08-31' } });
    const got = norm(env.calcDeadline('2026-07-31', Dd(10), false, true));
    assert.deepEqual(got, { prudent: '2026-08-10', maxLegal: '2026-09-01' });
  });
});
describe('2-ب) سلامة المحاكي المرجعي نفسه', () => {
  for (const [name, from, rule, abroad, p, m] of GOLDEN) {
    test('oracle: ' + name, () => {
      const o = oracle(from, rule, abroad);
      assert.deepEqual({ prudent: o.prudent, maxLegal: o.maxLegal }, { prudent: p, maxLegal: m });
    });
  }
});

/* ═══════════════════════════ 3) اختبار تفاضلي عشوائي ═══════════════════════════ */
describe('3) المحرك ≡ المحاكي المرجعي (آلاف الحالات)', () => {
  const N = +process.env.DIWAN_N || 8000;
  const configs = [
    { name: 'أساسي', s: {}, cfg: {} },
    { name: 'مع أعياد متحركة', movable: true },
    { name: 'مع أعياد متحركة + عطلة قضائية', movable: true, vac: true },
  ];
  for (const c of configs) {
    test('تطابق — ' + c.name, () => {
      const rand = rng(20261101);
      const start = U(2024, 1, 1).getTime();
      const movable = new Set();
      if (c.movable) for (let i = 0; i < 60; i++) movable.add(iso(new Date(start + Math.floor(rand() * 3300) * 864e5)));
      const vac = c.vac ? { on: true, from: '07-15', to: '08-31' } : null;
      const env = loadEnv({ dlMovableHolidays: [...movable], dlVacation: vac || { on: false, from: '07-15', to: '08-31' } });
      const rules = env.DEFAULT_DLK;
      const bad = [];
      for (let i = 0; i < N; i++) {
        const from = iso(new Date(start + Math.floor(rand() * 3000) * 864e5));
        const day = +from.slice(8);
        for (const rule of rules) for (const abroad of [false, true]) {
          // مجموع «نهاية شهر + إضافة أشهر» الغامض قانونياً (28 جانفي+2 شهر…) نتجنّبه عمداً
          if (abroad && rule.abroadMonths > 0 && day > 28) continue;
          const got = norm(env.calcDeadline(from, rule, abroad, true), rule.id);
          const exp = oracle(from, rule, abroad, { movable, vac });
          if (got.prudent !== exp.prudent || got.maxLegal !== exp.maxLegal) {
            if (bad.length < 8) bad.push({ from, rule: rule.id, abroad, got, exp: { prudent: exp.prudent, maxLegal: exp.maxLegal } });
            else break;
          }
        }
        if (bad.length >= 8) break;
      }
      assert.equal(bad.length, 0, 'اختلافات عن المرجع (أول 8):\n' + JSON.stringify(bad, null, 1));
    });
  }
  test('خصائص ثابتة: maxLegal ≥ prudent، ويوم عمل، ولا يوم عمل بينهما', () => {
    const rand = rng(7);
    const start = U(2024, 1, 1).getTime();
    const env = loadEnv();
    for (let i = 0; i < 3000; i++) {
      const from = iso(new Date(start + Math.floor(rand() * 3000) * 864e5));
      for (const rule of env.DEFAULT_DLK) {
        const r = norm(env.calcDeadline(from, rule, false, true), rule.id);
        assert.ok(r.maxLegal >= r.prudent, `max<prudent: ${from} ${rule.id}`);
        const o = oracle(from, rule, false);
        assert.equal(o.nonWorking(parseISO(r.maxLegal)), false, `maxLegal ليس يوم عمل: ${from} ${rule.id}`);
        for (let d = parseISO(r.prudent); iso(d) < r.maxLegal; d = addDaysU(d, 1))
          assert.equal(o.nonWorking(d), true, `يوم عمل متجاوَز بين التاريخين: ${iso(d)}`);
        if (!o.nonWorking(parseISO(r.prudent))) assert.equal(r.prudent, r.maxLegal);
      }
    }
  });
});

/* ═══════════════════════════ 4) الشاشات تُطابق المحرك ═══════════════════════════ */
function parseDlTable(html) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
  return rows.map(r => {
    const tds = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    const rule = (/data-rule="([^"]*)"/.exec(r) || [])[1];
    const final = (/data-final="([^"]*)"/.exec(r) || [])[1];
    return { tds, rule, final };
  });
}
describe('4) شاشة حاسبة الآجال (calcDLTable)', () => {
  for (const skip of [true, false]) {
    test(`الأجل المحفوظ/المنبَّه = prudent دائماً (خانة التمديد = ${skip})`, () => {
      const env = loadEnv({ dlCalc: { date: '2026-10-01', skip, abroad: false } });
      assert.ok(env.calcDLTable, 'calcDLTable غير موجودة');
      const rows = parseDlTable(env.calcDLTable());
      assert.ok(rows.length > 0, 'الجدول فارغ');
      for (const row of rows) {
        const rule = env.DEFAULT_DLK.find(x => x.id === row.rule);
        assert.ok(rule, 'قاعدة غير معروفة في الصف: ' + row.rule);
        const exp = oracle('2026-10-01', rule, false);
        assert.equal(row.final, exp.prudent, `data-final للقاعدة ${row.rule} يجب أن يكون التاريخ الاحترازي الأبكر`);
        assert.ok(row.tds.includes(exp.prudent) && row.tds.includes(exp.maxLegal), `الصف ${row.rule} لا يعرض التاريخين`);
      }
    });
  }

  test('تسمية العمودين غير معكوسة', () => {
    const env = loadEnv({ dlCalc: { date: '2026-10-01', skip: true, abroad: false } });
    const rows = parseDlTable(env.calcDLTable());
    const appeal = rows.find(r => r.rule === 'appeal');
    const exp = oracle('2026-10-01', env.DEFAULT_DLK.find(x => x.id === 'appeal'), false);
    assert.notEqual(exp.prudent, exp.maxLegal, 'حالة الاختبار يجب أن تُنتج تاريخين مختلفين');
    const dates = appeal.tds.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)); // [col1, col2]
    const th = /<thead>[\s\S]*?<\/thead>/.exec(extractFunction(SRC, 'deadlinesV').code);
    assert.ok(th, 'تعذّر إيجاد ترويسة الجدول في deadlinesV');
    const keys = [...th[0].matchAll(/t\('([A-Za-z0-9_]+)'\)/g)].map(m => m[1]);
    assert.ok(keys.length >= 2, 'تعذّر قراءة مفاتيح عنوان العمودين');
    const label = k => { const all = [...SRC.matchAll(new RegExp(k + ":\\s*'([^']*)'", 'g'))].map(m => m[1]); return all.find(x => /[\u0600-\u06FF]/.test(x)) || ''; };
    const [l1, l2] = [label(keys[0]), label(keys[1])];
    const labelOfPrudent = dates[0] === exp.prudent ? l1 : l2;
    const labelOfMax = dates[0] === exp.prudent ? l2 : l1;
    assert.ok(labelOfPrudent && labelOfMax, 'نصوص العناوين مفقودة');
    assert.doesNotMatch(labelOfPrudent, /الأقصى/, `العمود الأبكر مسمّى «${labelOfPrudent}» — وهذا مضلّل`);
    assert.match(labelOfPrudent, /احترازي|الأبكر|الاحتياط/, `يجب أن يصف العمود الأبكر بأنه احترازي: «${labelOfPrudent}»`);
    assert.match(labelOfMax, /الأقصى/, `العمود الأبعد يجب أن يوصف بالأجل الأقصى: «${labelOfMax}»`);
    assert.doesNotMatch(labelOfMax, /آمن|الآمن|الموصى/, `لا تصفوا التاريخ الأبعد بأنه «آمن/موصى به»: «${labelOfMax}»`);
  });
});

describe('4-ب) بطاقة الملف (sigDL) تستعمل المحرك نفسه', () => {
  test('تواريخ الاستئناف والمعارضة ∈ {prudent, maxLegal} للقاعدة المقابلة', () => {
    const env = loadEnv();
    if (!env.sigDL) return; // إن حُذفت الدالة فلا مشكلة
    const html = env.sigDL({ notif: '2026-10-01' });
    const found = [...html.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)].map(m => `${m[3]}-${m[2]}-${m[1]}`);
    assert.ok(found.length >= 2, 'لم تُعرض تواريخ الاستئناف والمعارضة');
    const get = id => { const r = env.DEFAULT_DLK.find(x => x.id === id); return oracle('2026-10-01', r, false); };
    const a = get('appeal'), o = get('opposition');
    assert.ok([a.prudent, a.maxLegal].includes(found[0]), `الاستئناف المعروض ${found[0]} لا يطابق المحرك (${a.prudent} / ${a.maxLegal})`);
    assert.ok([o.prudent, o.maxLegal].includes(found[1]), `المعارضة المعروضة ${found[1]} لا تطابق المحرك (${o.prudent} / ${o.maxLegal}) — هل ما زالت 10 أيام؟`);
  });
});

/* ═══════════════════════════ 5) فحوص ساكنة على الشيفرة ═══════════════════════════ */
describe('5) فحوص ساكنة: لا حساب آجال خارج المحرك', () => {
  test('لا استدعاء لدوال الحساب الخام خارج كتلة المحرك', () => {
    const forbidden = ['addBiz', 'addMonthsCal', 'addCalDays', 'extendToWorkday'];
    const hits = [];
    for (const name of forbidden) {
      const re = new RegExp('(?<![\\w$.])' + name + '\\s*\\(', 'g'); let m;
      while ((m = re.exec(SRC))) {
        if (ENG && m.index >= ENG.start && m.index < ENG.end) continue;
        if (/function\s+$/.test(SRC.slice(Math.max(0, m.index - 12), m.index))) continue; // تعريف
        // استثناء موثَّق: تعليق على نفس السطر أو السطر السابق يشرح أنه ليس أجلاً قانونياً (مثل اقتراح موعد جلسة)
        const ls = SRC.lastIndexOf('\n', m.index) + 1, le = SRC.indexOf('\n', m.index);
        const prevStart = SRC.lastIndexOf('\n', Math.max(0, ls - 2)) + 1;
        if (/DIWAN-ALLOW-DATE-MATH:\s*\S+/.test(SRC.slice(prevStart, le < 0 ? SRC.length : le))) continue;
        hits.push(`${name}() — السطر ${lineOf(SRC, m.index)}`);
      }
    }
    assert.equal(hits.length, 0, 'حساب مواعيد خارج المحرك الموحّد. إن كان أجلاً قانونياً فاستعملوا calcDeadline؛ وإن كان مجرد اقتراح موعد فأضيفوا على نفس السطر أو السابق تعليقاً: DIWAN-ALLOW-DATE-MATH: <السبب>\n  ' + hits.join('\n  '));
  });
  test('لا تفكيك مصفوفي لعناصر DLK/DEFAULT_DLK (هي كائنات)', () => {
    const re = /(?:DEFAULT_)?DLK\s*\.\s*(?:map|forEach|filter|find)\s*\(\s*\(?\s*\[/g; const hits = []; let m;
    while ((m = re.exec(SRC))) hits.push('السطر ' + lineOf(SRC, m.index));
    assert.equal(hits.length, 0, 'تفكيك مصفوفي لكائنات يرمي TypeError: ' + hits.join(', '));
  });
  test('لا يوجد «معارضة = 10 أيام» في الواجهة ولا الدليل', () => {
    const re = /معارضة(?:(?!جنح|استئناف|شهر)[^<>\n'"]){0,30}\b10\s*أيام|opposition(?:(?!appel|mois)[^<>\n'"]){0,60}\b10\s*jours/gi;
    const hits = [];
    for (const [label, txt] of [['index.html', SRC], ['الدليل', GUIDE || '']]) { let m; while ((m = re.exec(txt))) hits.push(`${label} — السطر ${lineOf(txt, m.index)}: ${m[0]}`); }
    assert.equal(hits.length, 0, 'قاعدة معارضة قديمة:\n  ' + hits.join('\n  '));
  });
  test('سلاسل الإصدار متّسقة (وتطابق DIWAN_EXPECT_VERSION إن ضُبط)', () => {
    const vs = [...new Set([...SRC.matchAll(/\bv(\d+\.\d+\.\d+)\b/g)].map(m => m[1]))];
    assert.ok(vs.length >= 1, 'لا توجد سلسلة إصدار');
    assert.equal(vs.length, 1, 'سلاسل إصدار متعددة: ' + vs.join(', '));
    if (process.env.DIWAN_EXPECT_VERSION) assert.equal(vs[0], process.env.DIWAN_EXPECT_VERSION);
  });
});

describe('6) سلامة جدول القواعد', () => {
  test('كل قاعدة: id فريد، n > 0، وحدة صحيحة، اسم عربي', () => {
    const env = loadEnv(); const ids = new Set();
    for (const r of env.DEFAULT_DLK) {
      assert.ok(r.id && !ids.has(r.id), 'id مكرر أو مفقود: ' + r.id); ids.add(r.id);
      assert.ok(r.n > 0, 'n غير صالحة: ' + r.id);
      assert.ok(['day', 'month'].includes(r.unit), 'unit غير صالحة: ' + r.id);
      assert.ok(r.name && r.name.ar, 'اسم عربي مفقود: ' + r.id);
    }
  });
  test('القواعد الأساسية موجودة بالقيم المتفق عليها', () => {
    const env = loadEnv(); const by = Object.fromEntries(env.DEFAULT_DLK.map(r => [r.id, r]));
    const exp = { appeal: ['month', 1], cassation: ['month', 2], opposition: ['month', 1], urgent: ['day', 15], appealg: ['day', 10], appenq: ['day', 3], casspen: ['day', 8], prelitigation: ['month', 4] };
    for (const [id, [unit, n]] of Object.entries(exp)) { assert.ok(by[id], 'قاعدة مفقودة: ' + id); assert.equal(by[id].unit, unit, id); assert.equal(by[id].n, n, id); }
  });
  test('لا قاعدة بلا مرجع مادة (تحذير؛ فشل مع DIWAN_STRICT_SOURCES=1)', () => {
    const env = loadEnv();
    const missing = env.DEFAULT_DLK.filter(r => !/م\s*\d+|art\.\s*\d+/i.test((r.name.ar || '') + (r.name.fr || ''))).map(r => r.id);
    if (missing.length) {
      const msg = 'قواعد بلا رقم مادة: ' + missing.join(', ');
      if (process.env.DIWAN_STRICT_SOURCES) assert.fail(msg); else console.warn('⚠ ' + msg);
    }
  });
});

describe('7) الجباية والدليل', () => {
  test('لا نظام جبائي افتراضي مفروض (IFU/IBS)', () => {
    const m = /tax\s*:\s*\{\s*regime\s*:\s*'(free|company)'/.exec(SRC);
    assert.equal(m, null, 'نظام جبائي افتراضي مفروض في الحالة الابتدائية — السطر ' + (m ? lineOf(SRC, m.index) : ''));
  });
  test('الدليل: لا عكس لتسمية التاريخين، ولا تناقض بشأن «سحب الحكم»', { skip: !GUIDE && 'اضبطوا DIWAN_GUIDE' }, () => {
    const txt = GUIDE.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.doesNotMatch(txt, /الأجل الأقصى القانوني[»"]?\s*الأبكر/, 'الدليل يصف الأبكر بأنه «الأقصى القانوني» — معكوس');
    const deniesIntegration = /لا يوجد أي ربط تقني/.test(txt);
    const claimsPull = /سحب (?:الحكم|القرار) (?:رقمياً|عبر portail)/.test(txt);
    assert.ok(!(deniesIntegration && claimsPull), 'الدليل ينفي الربط ثم يزعم «سحب الحكم رقمياً» في جدول دورة الحياة');
  });
});
