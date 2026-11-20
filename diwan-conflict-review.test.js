/* DIWAN-PREVIEW-01 — conflict-of-interest intake gate regression contract.
 * Run with: node --test diwan-conflict-review.test.js
 * These checks guard the source-level workflow and persistence contract. They do not
 * replace browser/E2E tests or prove server-side authorization in this local-first app.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const SW = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');

function functionSource(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const match = re.exec(HTML);
  assert.ok(match, 'Expected function in index.html: ' + name);
  const open = HTML.indexOf('{', match.index);
  let depth = 0, quote = '', template = false, lineComment = false, blockComment = false;
  for (let i = open; i < HTML.length; i++) {
    const ch = HTML[i], next = HTML[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) { if (ch === '\\') { i++; continue; } if (ch === quote) quote = ''; continue; }
    if (template) { if (ch === '\\') { i++; continue; } if (ch === '`') template = false; continue; }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '`') { template = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return HTML.slice(match.index, i + 1);
  }
  throw new Error('Unclosed function: ' + name);
}

describe('Diwan conflict-of-interest intake gate', () => {
  test('any detected conflict routes to review and cannot create a matter from intake', () => {
    const src = functionSource('newCaseModal');
    assert.match(src, /const conf=detectConflict\(\{parties:keep\}\);/);
    assert.match(src, /if\(conf\.length\)\s*\{/);
    assert.match(src, /S\.conflictReviews\.unshift\(\{id:reviewId,status:'pending',draft:v,parties:keep,reasons:conf/);
    assert.match(src, /decision:'review_required'/);
    assert.match(src, /closeModal\(\);v9save\(\);toast\(/);
    assert.match(src, /return\s*\}\s*createIntakeCase\(v,keep,conf\)/);
    assert.doesNotMatch(src, /if\(blocking\.length\)\{conflictConfirm\(conf,v,doCreate\)/);
  });

  test('pending reviews are shown only in the manager settings view', () => {
    const src = functionSource('conflictReviewCard');
    assert.match(src, /if\(!isM\(\)\)return ''/);
    assert.match(src, /status==='pending'/);
    assert.match(src, /data-act="conflict-review-approve"/);
    assert.match(src, /data-act="conflict-review-reject"/);
  });

  test('review decisions require manager role, pending status, and are audited', () => {
    assert.match(HTML, /if\(!isM\(\)\)\{toast\('هذه المراجعة مخصصة للمخوّل فقط/);
    assert.match(HTML, /find\(function\(x\)\{return x\.id===el\.dataset\.id&&x\.status==='pending'\}\)/);
    assert.match(HTML, /item\.status='rejected';item\.reviewedAt=new Date\(\)\.toISOString\(\);item\.reviewedBy=S\.user/);
    assert.match(HTML, /item\.status='approved';item\.reviewedAt=new Date\(\)\.toISOString\(\);item\.reviewedBy=S\.user/);
    assert.match(HTML, /createIntakeCase\(item\.draft,item\.parties,item\.reasons,true\)/);
    assert.match(HTML, /اعتماد ملف بعد مراجعة سرية لتعارض المصالح/);
  });

  test('pending review queue survives encrypted snapshots and store restoration', () => {
    assert.match(functionSource('snapV7'), /conflictReviews:S\.conflictReviews\|\|\[\]/);
    assert.match(functionSource('applyStore'), /'intakeLog','conflictReviews','deliveries'/);
    assert.match(functionSource('clearDemo'), /S\.intakeLog=\[\];S\.conflictReviews=\[\]/);
  });


  test('preview reset is opt-in, manager-only, deterministic, and explicitly synthetic', () => {
    const seed = functionSource('resetPreviewDemo');
    const card = functionSource('previewDemoCard');
    assert.match(seed, /if\(!isM\(\)\)return/);
    assert.match(seed, /if\(!confirm\(/);
    assert.match(seed, /DEMO-2026-001/);
    assert.match(seed, /DEMO-NIF-ATLAS-001/);
    assert.match(seed, /demo@example\.invalid/);
    assert.match(seed, /S\.conflictReviews=\[\]/);
    assert.match(seed, /S\.isDemo=true/);
    assert.match(card, /if\(!isM\(\)\)return ''/);
    assert.match(HTML, /resetPreviewDemo\(\)/);
    assert.match(HTML, /S\.cases=\[\s*\{id:1,no:'DEMO-2026-001'/);
  });

  test('responsible-lawyer changes require a reason and are audited; sensitive matters need confirmation', () => {
    assert.match(HTML, /if\(a==='setlawyer'\)\{\s*if\(!isM\(\)\)return/);
    assert.match(HTML, /n:'reason',l:'lw_change_reason',type:'textarea',req:true/);
    assert.match(HTML, /if\(c\.secret&&!confirm\(t\('lw_change_sensitive_confirm'\)\)\)return/);
    assert.match(HTML, /var oldLawyer=c\.lawyerId\|\|'m',newLawyer=v\.lw\|\|'m',reason=String\(v\.reason\|\|'\'\)\.trim\(\)/);
    assert.match(HTML, /تغيير المحامي المسؤول — '\+c\.no\+' — '\+lawyerName\(oldLawyer\)\+' → '\+lawyerName\(newLawyer\)\+' — السبب: '\+reason/);
    assert.match(HTML, /أعضاء الفريق لم يتغيروا تلقائياً/);
  });

  test('preview app identity and service-worker cache are explicitly isolated', () => {
    assert.match(MANIFEST.name, /نسخة المعاينة المهنية/);
    assert.match(MANIFEST.short_name, /تجريبي/);
    assert.match(MANIFEST.description, /وهمية/);
    assert.match(SW, /diwan-preview-professional-20261120/);
    assert.doesNotMatch(SW, /var CACHE = 'diwan-v10\.3\.4';/);
  });

  test('case creation is factored into a single path for clean intake and approved review', () => {
    const src = functionSource('createIntakeCase');
    assert.match(src, /S\.cases\.unshift\(/);
    assert.match(src, /cfLogAccept\(id,v\.no,conf,!!reviewApproved\)/);
    assert.match(src, /undoable\(/);
  });
});
