/* DIWAN-FIX-01 — fail-closed idle-lock regression tests.
 * Run with: node --test diwan-idle-lock.test.js
 * The tested functions are extracted verbatim from index.html; browser DOM is
 * represented by small test doubles, while password hashing uses Node WebCrypto.
 */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const HTML = fs.readFileSync(require('node:path').join(__dirname, 'index.html'), 'utf8');

function extractFunction(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const match = re.exec(HTML);
  if (!match) throw new Error('Function not found in index.html: ' + name);
  const open = HTML.indexOf('{', match.index);
  let depth = 0, quote = '', lineComment = false, blockComment = false, template = false;
  for (let i = open; i < HTML.length; i++) {
    const ch = HTML[i], next = HTML[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) { if (ch === '\\') { i++; continue; } if (ch === quote) quote = ''; continue; }
    if (template) { if (ch === '\\') { i++; continue; } if (ch === '`') template = false; continue; }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '`') { template = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return HTML.slice(match.index, i + 1);
  }
  throw new Error('Unclosed function: ' + name);
}

function makeClassList() {
  const values = new Set();
  return { add: x => values.add(x), remove: x => values.delete(x), contains: x => values.has(x),
    toggle(x, force) { if (force === undefined) force = !values.has(x); force ? values.add(x) : values.delete(x); return force; } };
}
function makeElement(id, tagName) {
  const attrs = Object.create(null);
  return { id, tagName: tagName || 'DIV', classList: makeClassList(), inert: false, hidden: false, style: { display: '' }, value: '',
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    focus() { this.focused = true; },
    contains(node) { return node === this || !!(node && (this.id === 'idleLock' ? node.withinIdleLock : this.id === 'lockOv' ? node.withinBootOverlay : false)); } };
}

function makeEnv() {
  const idleLock = makeElement('idleLock');
  const idlePw = makeElement('idlePw', 'INPUT'); idlePw.withinIdleLock = true;
  const app = makeElement('app');
  const nav = makeElement('tabbar'); nav.setAttribute('aria-hidden', 'false');
  const panic = makeElement('panic', 'BUTTON');
  const authOverlay = makeElement('lockOv');
  const script = makeElement('', 'SCRIPT');
  const body = { children: [app, nav, panic, authOverlay, idleLock, script] };
  const els = { idleLock, idlePw, lockOv: authOverlay };
  let tid = 0; const timers = new Map(); const toasts = [], listeners = [];
  const context = {
    console, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, DataView, Promise, Date,
    Buffer, setTimeout(fn, ms) { const id = ++tid; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: { body, getElementById(id) { return els[id] || null; }, addEventListener(type, fn, options) { listeners.push({ type, fn, capture: options === true || !!(options && options.capture) }); } },
    $(id) { return els[id] || null; },
    toast(msg) { toasts.push(String(msg)); },
    v9save() {}, scheduleSave() {},
    t(key) { return key; },
    S: { user: 'manager', userPasswords: { manager: { salt: Buffer.alloc(16).toString('base64'), hash: Buffer.alloc(32).toString('base64') } } },
    U: [{ id: 'manager', role: 'manager' }],
    _SEC: { ready: true, avail() { return true; }, hasPass() { return true; } }, PW_IT: 600000,
    _idleT: null, _idleMs: 600000, _idleLocked: false, _idleVerified: false, _idleInertState: [], _idleEpoch: 0, _secWorkspaceState: [],
    secB64e(bytes) { return Buffer.from(bytes).toString('base64'); },
    secB64d(text) { return Uint8Array.from(Buffer.from(text, 'base64')); },
  };
  const names = ['secSetWorkspaceVisible', 'secCmp', 'hashPass', 'verifyPass', 'secPassRecordValid', 'secStoreDataValid', 'secProtectionIssue', 'idleCanLock', 'idleInvalidate', 'bumpIdle', 'secOverlay', 'secProtectionBlock', 'idleSetInert', 'lockIdle', 'panicLockIdle', 'idleInteractionGuard', 'tryIdleUnlock'];
  vm.createContext(context);
  for (const name of names) vm.runInContext(extractFunction(name), context, { filename: 'index.html:' + name });
  const guardRegistration = HTML.match(/\['click','change','input','submit','keydown','keyup','keypress','pointerdown','pointerup','touchstart','contextmenu'\]\.forEach\(function\(ev\)\{document\.addEventListener\(ev,idleInteractionGuard,true\)\}\);/);
  assert.ok(guardRegistration, 'production capture guard registration exists');
  vm.runInContext(guardRegistration[0], context, { filename: 'index.html:idleInteractionGuard-registration' });
  const activityRegistration = HTML.match(/\['pointerdown','keydown','touchstart','scroll'\]\.forEach\(function\(ev\)\{document\.addEventListener\(ev,bumpIdle,\{passive:true\}\)\}\);/);
  assert.ok(activityRegistration, 'production idle-activity listener registration exists');
  vm.runInContext(activityRegistration[0], context, { filename: 'index.html:idle-activity-registration' });
  function dispatch(type, target) {
    const e = { type, target, cancelable: true, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    for (const listener of listeners) {
      if (listener.type === type && listener.capture) {
        listener.fn(e);
        if (e.stopped) break;
      }
    }
    if (!e.stopped) {
      for (const listener of listeners) if (listener.type === type && !listener.capture) listener.fn(e);
    }
    return e;
  }
  return { context, idleLock, idlePw, app, nav, panic, authOverlay, timers, toasts, listeners, dispatch };
}

function makeBootEnv(initialStore, cryptoAvailable) {
  const calls = { demo: 0, setup: 0, unlocks: [], blocked: [], applied: 0, persisted: 0, renders: 0, chrome: 0, overlays: [], switched: [] };
  const store = new Map(Object.entries(initialStore || {}));
  let tid = 0, bootVerified = false; const timers = new Map();
  const context = {
    console, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, DataView, Promise, Date, Buffer,
    btoa(s) { return Buffer.from(s, 'binary').toString('base64'); }, atob(s) { return Buffer.from(s, 'base64').toString('binary'); },
    STORE_KEY: 'diwan_v9_data', STORE_KEY_V8: 'diwan_v8_data', _legacyV8PendingCleanup: false, MIGRATION_PENDING_KEY: 'diwan_v9_migration_pending', MIGRATION_BACKUP_KEY: 'diwan_v9_migration_backup', _loadedFromV8: false, PW_IT: 600000,
    PBKDF2_IT: 600000, PBKDF2_IT_LEGACY: 200000, PW_IT_LEGACY: 150000, ENC_PREFIX: 'DWNENC1:', ENC_PREFIX2: 'DWNENC2:', UNLOCK_LOCK_KEY: 'diwan_unlock_lock',
    _SEC: { ready: true, avail() { return cryptoAvailable !== false; }, hasPass() { return true; }, getPass() { return 'TestManager9'; }, setPass() {}, setCtx() {}, getCtx() { return null; }, markVerified() { bootVerified = true; }, consumeVerified() { const ok = bootVerified; bootVerified = false; return ok; }, clearVerified() { bootVerified = false; } }, _secWorkspaceState: [],
    secWorkspaceReady() { return !!context._SEC.ready; },
    S: { user: 'm', userPasswords: {}, cases: [], isDemo: false },
    U: [{ id: 'm', role: 'manager' }],
    _idleT: null, _idleMs: 600000, _idleLocked: false, _idleVerified: false, _idleInertState: [], _idleEpoch: 0,
    _saveTimer: null, _savePending: false, _saveBusy: false, _saveDirty: false, _savePromise: null, _storageWarned: false, toast() {},
    snapV7() { return { cases: [] }; },
    setTimeout(fn, ms) { const id = ++tid; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    localStorage: { getItem(k) { return store.has(k) ? store.get(k) : null; }, setItem(k, v) { store.set(k, String(v)); }, removeItem(k) { store.delete(k); } },
    secB64d(s) { return Uint8Array.from(Buffer.from(s, 'base64')); },
    secB64e(b) { return Buffer.from(b).toString('base64'); },
    isEncPayload(s) { return /^(DWNENC1:|DWNENC2:)/.test(String(s || '')); },
    normStore(d) { return d; },
    applyStore(d) { Object.assign(context.S, d); calls.applied++; },
    secDemoInit() { calls.demo++; context.S.cases = []; context.S.user = 'm'; context.S.userPasswords = {}; context.S.isDemo = true; },
    secShowSetup() { calls.setup++; },
    secShowUnlock(raw, data) { calls.unlocks.push(raw); (calls.unlockData || (calls.unlockData = [])).push(data); },
    secOverlay(html) { calls.overlays.push(html); },
    $(id) { return id === 'roleSel' ? { value: 'm' } : null; }, byU(id) { return id === 'p' ? { id: 'p' } : null; },
    secDoSwitch(id) { calls.switched.push(id); },
    applyRoles() {}, syncPartnersU() {}, migrateV3() {}, me() { return { role: 'manager' }; },
    persistNow() { calls.persisted++; }, chrome() { calls.chrome++; }, render() { calls.renders++; },
  };
  vm.createContext(context);
  for (const name of ['deriveKey', 'encryptJSON', 'decryptJSON', 'secCmp', 'hashPass', 'verifyPass', 'secPassRecordValid', 'secStoreDataValid', 'secProtectionIssue', 'secWarnStore', 'secWriteEncryptedAndVerify', 'secMigrationError', 'secSetChecked', 'secRemoveChecked', 'secCleanupLegacyV8AfterVerified', 'secCleanupMigrationRecovery', 'secPersistBootSnapshot', 'idleCanLock', 'idleInvalidate', 'bumpIdle', 'secProtectionBlock', 'secBoot', 'secFinishBoot', 'secSwitchRole']) {
    vm.runInContext(extractFunction(name), context, { filename: 'index.html:' + name });
  }
  const block = context.secProtectionBlock;
  context.secProtectionBlock = function(reason) { calls.blocked.push(reason); return block(reason); };
  return { context, calls, store, timers };
}

function makeGuardEnv() {
  const roots = ['appShell','tabbar','scrim','drawer','idleLock','panic','modalWrap','toasts','welcome'].map(id => makeElement(id));
  const script = makeElement('', 'SCRIPT');
  const body = { children: roots.concat(script), appendChild(el) { el.parentNode = this; this.children.push(el); } };
  const byId = Object.fromEntries(roots.map(el => [el.id, el]));
  const calls = { selectors: 0, views: 0 };
  const context = {
    console, Promise, Date, Array, window: { _LK_ON: false }, _SEC: { ready: false }, _secWorkspaceState: [],
    document: { body, getElementById(id) { return body.children.find(el => el.id === id) || byId[id] || null; }, createElement(tag) { const el = makeElement('', tag.toUpperCase()); el.remove = function() { body.children = body.children.filter(x => x !== this); }; return el; } },
    $(id) { calls.selectors++; if (id === 'view') return roots[0]; throw new Error('workspace selector reached before secure boot: ' + id); },
    allowed() { calls.views++; return true; }, S: { view: 'secret' }, VIEWS: { secret() { calls.views++; return 'PRIVATE WORKSPACE CONTENT'; } },
    secProtectionIssue() { return ''; }, idleInvalidate() {},
  };
  vm.createContext(context);
  for (const name of ['secSetWorkspaceVisible','secWorkspaceReady','secResumeAfterLicense','secOverlay','secProtectionBlock','chrome','render'])
    vm.runInContext(extractFunction(name), context, { filename: 'index.html:' + name });
  return { context, body, roots, calls };
}

function makeUnlockEnv(initialStore = {}) {
  const e = makeBootEnv(initialStore, true), c = e.context;
  let pass = null, cryptoContext = null, verified = false;
  c.ENC_PREFIX = 'DWNENC1:'; c.ENC_PREFIX2 = 'DWNENC2:';
  c.PBKDF2_IT = 600000; c.PBKDF2_IT_LEGACY = 200000; c.PW_IT_LEGACY = 150000;
  c.UNLOCK_LOCK_KEY = 'diwan_unlock_lock'; c._unlockFails = 0;
  c._SEC = { ready: false, avail() { return true; }, hasPass() { return pass !== null; },
    setPass(p) { pass = p; verified = false; e.calls.setPass = (e.calls.setPass || 0) + 1; }, markVerified() { verified = true; }, consumeVerified() { const ok = verified; verified = false; return ok; }, clearVerified() { verified = false; }, getPass() { return pass; },
    setCtx(x) { cryptoContext = x; }, getCtx() { return cryptoContext; } };
  c.secBi = key => key; c.authLog = (...args) => { (e.calls.auth || (e.calls.auth = [])).push(args); };
  c.secCloseOverlay = () => { e.calls.closed = (e.calls.closed || 0) + 1; };
  c.snapV7 = () => JSON.parse(JSON.stringify(c.S));
  c._storageWarned = false;
  let writes = 0; const storageSet = c.localStorage.setItem.bind(c.localStorage);
  c.localStorage.setItem = (key, value) => { writes++; return storageSet(key, value); };
  const setupFields = { '#lkForm': { addEventListener(type, fn) { if (type === 'submit') fields.setupSubmit = fn; } },
    '#lkP1': { value: '', focus() { this.focused = true; } }, '#lkP2': { value: '' }, '#lkMsg': { textContent: '' }, '#lkBtn': { disabled: false } };
  const fields = { '#lkForm': { addEventListener(type, fn) { if (type === 'submit') fields.submit = fn; } },
    '#lkPw': { value: '', focus() { this.focused = true; } }, '#lkMsg': { textContent: '' }, '#lkBtn': { disabled: false },
    '#lkP1': setupFields['#lkP1'], '#lkP2': setupFields['#lkP2'] };
  c.secOverlay = html => { e.calls.overlays.push(html); const setup = /إعداد كلمة مرور المدير/.test(html); return { querySelector(sel) { return (setup ? setupFields : fields)[sel]; } }; };
  for (const name of ['deriveKey','decryptJSON','encryptJSON','persistNow','secShowUnlock','secShowSetup','secPwChk'])
    vm.runInContext(extractFunction(name), c, { filename: 'index.html:' + name });
  return { ...e, fields, setupFields, writes: () => writes, async encrypt(payload, password) { return await c.encryptJSON(payload, password, {}); },
    async submit(password) { fields['#lkPw'].value = password; fields.submit({ preventDefault() {} }); await waitFor(() => fields['#lkBtn'].disabled === false || c._SEC.ready || e.calls.blocked.length > 0); if (c._SEC.ready) await waitFor(() => !!e.calls.auth); } };
}

async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Timed out waiting for production auth callback');
}

async function installCredential(env, password) {
  env.context.S.userPasswords.manager = await env.context.hashPass(password);
}
function lock(env) { env.context.lockIdle(true); assert.equal(env.idleLock.classList.contains('on'), true); }

// The production handler must remain the sole path that clears the idle overlay.
describe('idle-lock source-path assertions', () => {
  test('there is no stale verifier and only the verified path calls lockIdle(false)', () => {
    assert.equal(HTML.includes('verifyUserPassword'), false);
    const hits = [...HTML.matchAll(/lockIdle\(false\)/g)];
    assert.equal(hits.length, 1);
    assert.ok(extractFunction('tryIdleUnlock').includes('if(ok===true)'));
    assert.match(HTML, /addEventListener\(ev,idleInteractionGuard,true\)/);
  });

  test('ordinary role login still uses the existing stored-hash verifier', () => {
    assert.doesNotMatch(extractFunction('secShowUnlock'), /console\.(log|warn|error)/, 'unlock path does not log passwords or verifier details');
    assert.match(HTML, /verifyPass\(rec,v\.pw\)\.then\(function\(ok\)/);
    assert.match(HTML, /if\(ok\)\{S\.auth\.fails\[nv\]=0;delete S\.auth\.lock\[nv\];secDoSwitch\(nv,'login'\)/);
  });

  test('boot invalidates idle timers and completed boot restarts eligibility checks', () => {
    assert.match(extractFunction('secBoot'), /_SEC\.ready=false;[\s\S]*?clearVerified\(\)[\s\S]*?idleInvalidate\(\)/);
    assert.match(extractFunction('secFinishBoot'), /secPersistBootSnapshot\(snap\)/);
    assert.match(extractFunction('secFinishBoot'), /_SEC\.ready=true[\s\S]*if\(typeof bumpIdle==='function'\)bumpIdle\(\)/);
  });

  test('production render, chrome and persistence delegate to the secure readiness gate', () => {
    assert.match(extractFunction('render'), /if\(!secWorkspaceReady\(\)\)return/);
    assert.match(extractFunction('chrome'), /if\(!secWorkspaceReady\(\)\)return/);
    assert.match(extractFunction('persistNow'), /var issue=secProtectionIssue\(\);if\(issue\)\{secProtectionBlock/);
    assert.match(extractFunction('secFinishBoot'), /var issue=secProtectionIssue\(\);if\(issue\)\{secProtectionBlock\(issue\);return false\}/);
    assert.match(extractFunction('secFinishBoot'), /consumeVerified\(\)/);
  });

  test('startup and licensing error call sites do not render after failed boot', () => {
    assert.match(HTML, /if\(!_LIC\.gate\(\)\)\{chrome\(\);render\(\)\}/);
    const finalBoot = HTML.slice(HTML.indexOf('/* FIX13R-boot: render the stored workspace only after secure boot has completed */'));
    assert.match(finalBoot, /if\(_SEC\.ready\)\{[\s\S]*?chrome\(\);render\(\)/);
    const licBind = HTML.slice(HTML.indexOf('function bind(o,mode)'), HTML.indexOf('function show(mode)', HTML.indexOf('function bind(o,mode)')));
    assert.match(licBind, /secResumeAfterLicense\(\)/);
    assert.doesNotMatch(licBind, /catch\(_\)\{try\{chrome\(\);render\(\)/);
    assert.match(extractFunction('secResumeAfterLicense'), /catch\(_\)\{secProtectionBlock\('init'\)\}/);
  });
});

describe('production workspace render guards', () => {
  test('actual chrome and render hide every workspace root while secure boot is incomplete', () => {
    const e = makeGuardEnv();
    e.context.chrome(); e.context.render();
    assert.equal(e.calls.selectors, 0, 'chrome/render return before touching workspace DOM');
    assert.equal(e.calls.views, 0, 'render does not invoke a workspace view');
    for (const root of e.roots) {
      assert.equal(root.hidden, true, root.id + ' is hidden');
      assert.equal(root.style.display, 'none', root.id + ' has a force-hidden display style');
      assert.equal(root.inert, true, root.id + ' is inert');
      assert.equal(root.getAttribute('aria-hidden'), 'true');
    }
    const preSecurity = makeGuardEnv(); preSecurity.context._SEC = undefined;
    preSecurity.context.chrome(); preSecurity.context.render();
    assert.equal(preSecurity.calls.selectors, 0, 'early startup before _SEC initialization is still blocked');
    assert.ok(preSecurity.roots.every(root => root.hidden && root.inert));
  });

  test('secure readiness restores each workspace root to its exact pre-gate display and accessibility state', () => {
    const e = makeGuardEnv();
    e.roots[0].hidden = true; e.roots[0].style.display = 'inline-block'; e.roots[0].setAttribute('aria-hidden', 'false');
    e.context.secSetWorkspaceVisible(false);
    e.context._SEC.ready = true;
    assert.equal(e.context.secWorkspaceReady(), true);
    assert.equal(e.roots[0].hidden, true);
    assert.equal(e.roots[0].style.display, 'inline-block');
    assert.equal(e.roots[0].inert, false);
    assert.equal(e.roots[0].getAttribute('aria-hidden'), 'false');
    assert.ok(e.roots.slice(1).every(root => !root.hidden && root.style.display === '' && !root.inert));
  });

  test('protection failure shows one recovery overlay and repeated render cannot expose content', () => {
    const e = makeGuardEnv();
    e.context.secProtectionBlock('legacy-credential');
    e.context.chrome(); e.context.render();
    e.context.secProtectionBlock('legacy-credential');
    const overlays = e.body.children.filter(el => el.id === 'lockOv');
    assert.equal(overlays.length, 1, 'repeated protection errors update rather than stack overlays');
    assert.match(overlays[0].innerHTML, /legacy office data has no valid manager credential/i);
    assert.equal(overlays[0].innerHTML.includes('PRIVATE WORKSPACE CONTENT'), false);
    assert.equal(e.calls.selectors, 0);
    assert.equal(e.calls.views, 0);
    assert.ok(e.roots.every(root => root.hidden && root.inert));
  });

  test('a protection issue discovered by either actual entry point blocks and hides the workspace', () => {
    const e = makeGuardEnv(); e.context._SEC.ready = true;
    e.context.secProtectionIssue = () => 'credential';
    e.context.render(); e.context.chrome();
    assert.equal(e.context._SEC.ready, false);
    assert.ok(e.body.children.some(el => el.id === 'lockOv'));
    assert.ok(e.roots.every(root => root.hidden && root.inert));
    assert.equal(e.calls.views, 0);
  });

  test('actual license-resume handler converts a boot exception to recovery instead of chrome/render', () => {
    const e = makeGuardEnv(); e.context.secBoot = () => { throw new Error('boot failure'); };
    e.context.secResumeAfterLicense();
    assert.ok(e.body.children.some(el => el.id === 'lockOv'));
    assert.match(e.body.children.find(el => el.id === 'lockOv').innerHTML, /Application initialization failed/i);
    assert.equal(e.calls.selectors, 0);
    assert.equal(e.calls.views, 0);
    assert.ok(e.roots.every(root => root.hidden && root.inert));
  });
});

describe('boot preserves data and blocks unsafe workspace states', () => {
  const goodRecord = { salt: Buffer.alloc(16).toString('base64'), hash: Buffer.alloc(32).toString('base64'), it: 600000 };

  test('empty storage with WebCrypto follows first-run setup, not a corruption path', () => {
    const e = makeBootEnv({}, true);
    e.context.secBoot();
    assert.equal(e.calls.demo, 1);
    assert.equal(e.calls.setup, 1);
    assert.deepEqual(e.calls.blocked, []);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.store.size, 0);
  });

  test('first-run setup without WebCrypto stays blocked without creating or saving data', () => {
    const e = makeBootEnv({}, false);
    e.context.secBoot();
    assert.deepEqual(e.calls.blocked, ['crypto-setup']);
    assert.match(e.calls.overlays.at(-1), /required to set up the manager password/i);
    assert.equal(e.calls.demo, 0);
    assert.equal(e.calls.setup, 0);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.store.size, 0);
  });

  test('legacy plaintext without WebCrypto is not applied, rendered, or overwritten', () => {
    const raw = JSON.stringify({ cases: [{ id: 71, title: 'Private legacy case' }] });
    const e = makeBootEnv({ diwan_v9_data: raw }, false);
    e.context.secBoot();
    assert.deepEqual(e.calls.blocked, ['crypto-legacy']);
    assert.match(e.calls.overlays.at(-1), /Unencrypted legacy data was found/i);
    assert.equal(e.calls.applied, 0);
    assert.equal(e.calls.setup, 0);
    assert.equal(e.calls.persisted, 0);
    assert.equal(e.store.get('diwan_v9_data'), raw);
    assert.equal(e.context._SEC.ready, false);
  });

  test('persistence never falls back to writing plaintext when WebCrypto disappears', () => {
    const raw = JSON.stringify({ cases: [{ id: 91 }] });
    const e = makeBootEnv({ diwan_v9_data: raw }, false);
    e.context._SEC.ready = true;
    vm.runInContext(extractFunction('persistNow'), e.context, { filename: 'index.html:persistNow' });
    e.context.persistNow();
    assert.deepEqual(e.calls.blocked, ['crypto']);
    assert.equal(e.store.get('diwan_v9_data'), raw);
    assert.equal(e.context._SEC.ready, false);
  });

  test('present but malformed local data is blocked rather than treated as first run', () => {
    const raw = '{not-json'; const e = makeBootEnv({ diwan_v9_data: raw }, true);
    e.context.secBoot();
    assert.deepEqual(e.calls.blocked, ['corrupt-store']);
    assert.match(e.calls.overlays.at(-1), /Existing office data could not be read/i);
    assert.equal(e.calls.demo, 0);
    assert.equal(e.calls.setup, 0);
    assert.equal(e.store.get('diwan_v9_data'), raw);
    assert.equal(e.calls.persisted, 0);
  });

  test('valid legacy plaintext without a manager credential is blocked for trusted recovery', () => {
    const data = { cases: [{ id: 4, title: 'Legacy matter' }] };
    const raw = JSON.stringify(data); const e = makeBootEnv({ diwan_v9_data: raw }, true);
    e.context.secBoot();
    assert.deepEqual(e.calls.blocked, ['legacy-credential']);
    assert.equal(e.calls.applied, 0);
    assert.equal(e.calls.setup, 0);
    assert.equal(e.store.get('diwan_v9_data'), raw);
    assert.equal(e.context._SEC.ready, false);
  });

  test('valid legacy credential routes to password unlock rather than setup', () => {
    const raw = JSON.stringify({ cases: [{ id: 8 }], userPasswords: { m: goodRecord } });
    const e = makeBootEnv({ diwan_v9_data: raw }, true);
    e.context.secBoot();
    assert.deepEqual(e.calls.unlocks, [null]);
    assert.equal(e.calls.setup, 0);
    assert.equal(e.calls.applied, 0, 'legacy data is held out of S until its manager hash verifies');
    assert.equal(JSON.stringify(e.calls.unlockData[0]), raw);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.store.get('diwan_v9_data'), raw);
  });

  test('malformed credential is diagnosed and never silently replaced', () => {
    const raw = JSON.stringify({ cases: [], userPasswords: { m: { salt: 'bad', hash: 'bad' } } });
    const e = makeBootEnv({ diwan_v9_data: raw }, true);
    e.context.secBoot();
    assert.deepEqual(e.calls.blocked, ['corrupt-credential']);
    assert.match(e.calls.overlays.at(-1), /credential record is damaged or invalid/i);
    assert.equal(e.calls.setup, 0);
    assert.equal(e.store.get('diwan_v9_data'), raw);
    assert.equal(e.calls.persisted, 0);
  });

  test('encrypted legacy data without WebCrypto stays blocked and byte-for-byte unchanged', () => {
    const raw = 'DWNENC1:original-payload';
    const e = makeBootEnv({ diwan_v8_data: raw }, false);
    e.context.secBoot();
    assert.deepEqual(e.calls.blocked, ['crypto-encrypted']);
    assert.equal(e.store.get('diwan_v8_data'), raw);
    assert.equal(e.calls.applied, 0);
    assert.equal(e.calls.setup, 0);
  });

  test('legacy encrypted V8 store is routed to unlock without being mistaken for empty storage', () => {
    const raw = 'DWNENC1:opaque-ciphertext';
    const e = makeBootEnv({ diwan_v8_data: raw }, true);
    e.context.secBoot();
    assert.deepEqual(e.calls.unlocks, [raw]);
    assert.equal(e.context._loadedFromV8, true);
    assert.equal(e.calls.demo, 0);
    assert.equal(e.store.get('diwan_v8_data'), raw);
  });

  test('role switching cannot bypass password checks when WebCrypto is unavailable', () => {
    const e = makeBootEnv({}, false);
    e.context.secSwitchRole('p');
    assert.deepEqual(e.calls.blocked, ['crypto']);
    assert.equal(e.context.S.user, 'm');
    assert.deepEqual(e.calls.switched, []);
  });

  test('storage access failure is diagnosed without demo fallback or writes', () => {
    const raw = JSON.stringify({ cases: [{ id: 88, title: 'Stored data' }] });
    const e = makeBootEnv({ diwan_v9_data: raw }, true);
    e.context.localStorage.getItem = () => { throw new Error('storage unavailable'); };
    e.context.secBoot();
    assert.deepEqual(e.calls.blocked, ['storage']);
    assert.equal(e.calls.demo, 0);
    assert.equal(e.calls.persisted, 0);
    assert.equal(e.store.get('diwan_v9_data'), raw);
  });

  test('first-run password hash can complete boot and arm the idle timer', async () => {
    const e = makeBootEnv({}, true);
    e.context.S.userPasswords.m = await e.context.hashPass('FirstRunPass1');
    e.context.S.user = 'm'; e.context._SEC.markVerified();
    await e.context.secFinishBoot(true);
    assert.equal(e.context._SEC.ready, true);
    assert.equal(e.calls.renders, 1);
    assert.equal([...e.timers.values()].filter(x => x.ms === 600000).length, 1);
  });

  test('finish boot exposes and arms the workspace only with a valid active credential', async () => {
    const e = makeBootEnv({}, true);
    e.context.S.userPasswords.m = goodRecord;
    e.context._SEC.markVerified(); await e.context.secFinishBoot(true);
    assert.equal(e.context._SEC.ready, true);
    assert.match(e.store.get('diwan_v9_data'), /^DWNENC2:/);
    assert.equal(e.calls.renders, 1);
    assert.equal([...e.timers.values()].filter(x => x.ms === 600000).length, 1);
  });

  test('a structurally valid record without a successful authentication proof cannot finish boot', async () => {
    const e = makeBootEnv({}, true); e.context.S.userPasswords.m = goodRecord;
    await e.context.secFinishBoot(true);
    assert.deepEqual(e.calls.blocked, ['verifier']);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.calls.persisted, 0);
    assert.equal(e.calls.renders, 0);
  });

  test('finish boot without an encryption key remains blocked and does not persist or render', async () => {
    const e = makeBootEnv({}, true); e.context.S.userPasswords.m = goodRecord;
    e.context._SEC.hasPass = () => false;
    await e.context.secFinishBoot(true);
    assert.deepEqual(e.calls.blocked, ['key']);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.calls.persisted, 0);
    assert.equal(e.calls.renders, 0);
    assert.equal([...e.timers.values()].filter(x => x.ms === 600000).length, 0);
  });

  test('finish boot with missing credential remains blocked and does not persist or render', async () => {
    const e = makeBootEnv({}, true);
    await e.context.secFinishBoot(true);
    assert.deepEqual(e.calls.blocked, ['credential']);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.calls.persisted, 0);
    assert.equal(e.calls.renders, 0);
    assert.equal([...e.timers.values()].filter(x => x.ms === 600000).length, 0);
  });
});

describe('production encrypted boot unlock verifies the stored manager credential', () => {
  async function putEncryptedPayload(e, encryptionPassword, credentialPassword = encryptionPassword, dataOverrides = {}) {
    const record = await e.context.hashPass(credentialPassword);
    const data = Object.assign({ cases: [{ id: 73, title: 'Confidential' }], user: 'm', userPasswords: { m: record } }, dataOverrides);
    const raw = await e.encrypt(data, encryptionPassword);
    e.store.set('diwan_v9_data', raw);
    return { raw, data, record };
  }

  test('correct password decrypts, verifies the same manager record, and completes encrypted boot', async () => {
    const e = makeUnlockEnv(), password = 'CorrectManager9';
    const fixture = await putEncryptedPayload(e, password);
    e.context.secShowUnlock(fixture.raw);
    await e.submit(password);
    assert.equal(e.calls.applied, 1);
    assert.equal(e.context._SEC.ready, true);
    assert.equal(e.context._SEC.getPass(), password);
    assert.equal(await e.context.verifyPass(e.context.S.userPasswords.m, e.context._SEC.getPass()), true);
    assert.deepEqual(e.calls.auth, [['login', 'm']]);
    assert.equal(e.writes(), 0, 'an already-encrypted primary store opens without an unnecessary rewrite');
    const saved = e.store.get('diwan_v9_data');
    assert.equal(saved, fixture.raw);
    assert.equal((await e.context.decryptJSON(saved, password, {})).userPasswords.m.hash, fixture.record.hash);
  });

  test('wrong password cannot decrypt, apply, authenticate, or overwrite the payload', async () => {
    const e = makeUnlockEnv(), password = 'CorrectManager9';
    const fixture = await putEncryptedPayload(e, password);
    e.context.secShowUnlock(fixture.raw);
    await e.submit('WrongManager8');
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.calls.applied, 0);
    assert.equal(e.calls.setPass || 0, 0);
    assert.equal(e.calls.auth, undefined);
    assert.equal(e.writes(), 0);
    assert.equal(e.store.get('diwan_v9_data'), fixture.raw);
    assert.match(e.fields['#lkMsg'].textContent, /sec_wrong_gen/);
  });

  test('successful decryption with a different stored manager verifier remains blocked', async () => {
    const e = makeUnlockEnv(), fixture = await putEncryptedPayload(e, 'EncryptionPass9', 'VerifierPass8');
    e.context.secShowUnlock(fixture.raw);
    await e.submit('EncryptionPass9');
    assert.equal(e.context._SEC.ready, false);
    assert.deepEqual(e.calls.blocked, ['credential-mismatch']);
    assert.equal(e.calls.applied, 0);
    assert.equal(e.calls.setPass || 0, 0);
    assert.equal(e.calls.auth, undefined);
    assert.equal(e.writes(), 0);
    assert.equal(e.store.get('diwan_v9_data'), fixture.raw);
    assert.match(e.calls.overlays.at(-1), /does not match its stored manager credential/i);
  });

  test('missing or malformed manager verifier after decryption fails closed without re-enrollment', async () => {
    for (const [label, overrides, reason] of [
      ['missing', { userPasswords: {} }, 'encrypted-credential'],
      ['malformed', { userPasswords: { m: { salt: 'bad', hash: 'bad' } } }, 'corrupt-credential'],
    ]) {
      const e = makeUnlockEnv(), fixture = await putEncryptedPayload(e, 'CorrectManager9', 'CorrectManager9', overrides);
      e.context.secShowUnlock(fixture.raw);
      await e.submit('CorrectManager9');
      assert.deepEqual(e.calls.blocked, [reason], label);
      assert.equal(e.calls.setup, 0, label + ' credential is not replaced with setup');
      assert.equal(e.calls.applied, 0, label + ' data is not applied before credential validation');
      assert.equal(e.calls.setPass || 0, 0, label + ' does not establish an authenticated key');
      assert.equal(e.writes(), 0, label + ' preserves storage');
      assert.equal(e.store.get('diwan_v9_data'), fixture.raw, label + ' preserves payload bytes');
      assert.equal(e.context._SEC.ready, false, label);
    }
  });

  test('unavailable, throwing, and rejected verifiers all block boot and preserve ciphertext', async () => {
    const cases = [
      ['unavailable', undefined],
      ['throws', () => { throw new Error('verification unavailable'); }],
      ['rejects', () => Promise.reject(new Error('verification unavailable'))],
    ];
    for (const [label, verifier] of cases) {
      const e = makeUnlockEnv(), fixture = await putEncryptedPayload(e, 'CorrectManager9');
      e.context.verifyPass = verifier;
      e.context.secShowUnlock(fixture.raw);
      await e.submit('CorrectManager9');
      assert.deepEqual(e.calls.blocked, ['verifier'], label);
      assert.equal(e.context._SEC.ready, false, label);
      assert.equal(e.calls.applied, 0, label);
      assert.equal(e.calls.auth, undefined, label);
      assert.equal(e.writes(), 0, label);
      assert.equal(e.store.get('diwan_v9_data'), fixture.raw, label);
    }
  });

  test('undecryptable ciphertext is not mistaken for an empty first run or overwritten', async () => {
    const e = makeUnlockEnv(), raw = 'DWNENC1:not-a-valid-ciphertext';
    e.store.set('diwan_v9_data', raw);
    e.context.secShowUnlock(raw);
    await e.submit('AnyPassword9');
    assert.equal(e.context._SEC.ready, false);
    assert.deepEqual(e.calls.blocked, ['corrupt-store']);
    assert.equal(e.calls.setup, 0);
    assert.equal(e.calls.applied, 0);
    assert.equal(e.writes(), 0);
    assert.equal(e.store.get('diwan_v9_data'), raw);
    assert.match(e.calls.overlays.at(-1), /Existing office data could not be read/i);
  });

  test('wrong password for credentialed legacy plaintext leaves it unapplied and byte-for-byte intact', async () => {
    const e = makeUnlockEnv(), password = 'LegacyManager9';
    const record = await e.context.hashPass(password);
    const raw = JSON.stringify({ cases: [{ id: 4, title: 'Legacy matter' }], user: 'm', userPasswords: { m: record } });
    e.store.set('diwan_v9_data', raw);
    e.context.secBoot();
    assert.equal(e.calls.applied, 0);
    await e.submit('WrongLegacy8');
    assert.equal(e.calls.applied, 0);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.writes(), 0);
    assert.equal(e.store.get('diwan_v9_data'), raw);
    assert.match(e.fields['#lkMsg'].textContent, /sec_wrong_gen/);
  });

  test('valid plaintext legacy data authenticates through its manager hash and only then migrates encrypted', async () => {
    const e = makeUnlockEnv(), password = 'LegacyManager9';
    const record = await e.context.hashPass(password);
    const raw = JSON.stringify({ cases: [{ id: 4, title: 'Legacy matter' }], user: 'm', userPasswords: { m: record } });
    e.store.set('diwan_v9_data', raw);
    e.context.secBoot();
    assert.equal(e.calls.applied, 0, 'legacy workspace is not loaded into live state before authentication');
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.store.get('diwan_v9_data'), raw, 'boot/read alone leaves legacy bytes unchanged');
    await e.submit(password);
    assert.equal(e.calls.applied, 1);
    assert.equal(e.context._SEC.ready, true);
    assert.equal(e.context._SEC.getPass(), password);
    assert.equal(e.writes(), 3, 'primary legacy migration marks, backs up, then writes encrypted data');
    assert.match(e.store.get('diwan_v9_data'), /^DWNENC[12]:/);
    assert.equal(e.store.has('diwan_v9_migration_backup'), false);
    assert.equal(e.store.has('diwan_v9_migration_pending'), false);
  });
});

describe('verified legacy-store migration', () => {
  async function legacyFixture(e, password, cases = [{ id: 804, title: 'Synthetic legacy record' }]) {
    const record = await e.context.hashPass(password);
    const data = { cases, user: 'm', userPasswords: { m: record } };
    return { data, raw: JSON.stringify(data), password };
  }

  test('plaintext v8 authenticates, writes and verifies ciphertext before removing the v8 key', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'LegacyManager9');
    e.store.set('diwan_v8_data', fixture.raw);
    const order = [], setItem = e.context.localStorage.setItem.bind(e.context.localStorage), removeItem = e.context.localStorage.removeItem.bind(e.context.localStorage), decrypt = e.context.decryptJSON.bind(e.context);
    e.context.localStorage.setItem = (key, value) => {
      if (key === 'diwan_v9_data') { assert.equal(e.store.get('diwan_v8_data'), fixture.raw); order.push('encrypted-write'); }
      return setItem(key, value);
    };
    e.context.decryptJSON = (payload, password, ctx) => Promise.resolve(decrypt(payload, password, ctx)).then(data => {
      if (payload === e.store.get('diwan_v9_data') && e.store.get('diwan_v8_data') === fixture.raw) order.push('encrypted-copy-verified');
      return data;
    });
    e.context.localStorage.removeItem = key => {
      if (key === 'diwan_v8_data') { assert.match(e.store.get('diwan_v9_data'), /^DWNENC[12]:/); order.push('legacy-remove'); }
      return removeItem(key);
    };
    e.context.secBoot();
    assert.equal(e.context._loadedFromV8, true);
    assert.equal(e.calls.applied, 0, 'legacy data stays pending until authentication');
    await e.submit(fixture.password);
    assert.deepEqual(order, ['encrypted-write', 'encrypted-copy-verified', 'legacy-remove']);
    assert.equal(e.store.has('diwan_v8_data'), false);
    assert.equal(e.store.has('diwan_v9_migration_pending'), false);
    const saved = e.store.get('diwan_v9_data');
    assert.match(saved, /^DWNENC2:/);
    assert.equal(JSON.stringify(await e.context.decryptJSON(saved, fixture.password, {})), JSON.stringify(e.context.snapV7()));
    assert.equal(e.context._SEC.ready, true);
    assert.equal(e.calls.renders, 1);
  });

  test('encrypted v8 is unlocked then re-encrypted and verified at the primary key', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'LegacyManager9');
    const encryptedV8 = await e.encrypt(fixture.data, fixture.password);
    e.store.set('diwan_v8_data', encryptedV8);
    e.context.secBoot();
    assert.equal(e.context._loadedFromV8, true);
    assert.equal(e.calls.setup, 0);
    await e.submit(fixture.password);
    assert.equal(e.store.has('diwan_v8_data'), false);
    assert.match(e.store.get('diwan_v9_data'), /^DWNENC2:/);
    assert.equal(JSON.stringify((await e.context.decryptJSON(e.store.get('diwan_v9_data'), fixture.password, {})).cases), JSON.stringify(fixture.data.cases));
    assert.equal(e.context._SEC.ready, true);
  });

  test('failed primary write preserves plaintext v8 and does not expose or report successful boot', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'LegacyManager9');
    e.store.set('diwan_v8_data', fixture.raw);
    const setItem = e.context.localStorage.setItem.bind(e.context.localStorage);
    e.context.localStorage.setItem = (key, value) => { if (key === 'diwan_v9_data') throw new Error('quota'); return setItem(key, value); };
    e.context.secBoot(); await e.submit(fixture.password);
    assert.equal(e.store.get('diwan_v8_data'), fixture.raw);
    assert.equal(e.store.has('diwan_v9_data'), false);
    assert.equal(e.store.has('diwan_v9_migration_pending'), false);
    assert.deepEqual(e.calls.blocked, ['migration-save']);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.calls.renders, 0);
    assert.equal(e.calls.auth, undefined);
  });

  test('unverifiable ciphertext write is removed while the original v8 data remains intact', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'LegacyManager9');
    e.store.set('diwan_v8_data', fixture.raw);
    const setItem = e.context.localStorage.setItem.bind(e.context.localStorage);
    e.context.localStorage.setItem = (key, value) => setItem(key, key === 'diwan_v9_data' ? value + 'corrupt' : value);
    e.context.secBoot(); await e.submit(fixture.password);
    assert.equal(e.store.get('diwan_v8_data'), fixture.raw);
    assert.equal(e.store.has('diwan_v9_data'), false);
    assert.equal(e.store.has('diwan_v9_migration_pending'), false);
    assert.deepEqual(e.calls.blocked, ['migration-save']);
    assert.equal(e.calls.renders, 0);
  });

  test('failure to remove plaintext v8 blocks workspace and leaves a recovery marker', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'LegacyManager9');
    e.store.set('diwan_v8_data', fixture.raw);
    const removeItem = e.context.localStorage.removeItem.bind(e.context.localStorage);
    e.context.localStorage.removeItem = key => { if (key === 'diwan_v8_data') throw new Error('remove denied'); return removeItem(key); };
    e.context.secBoot(); await e.submit(fixture.password);
    assert.equal(e.store.get('diwan_v8_data'), fixture.raw);
    assert.match(e.store.get('diwan_v9_data'), /^DWNENC2:/, 'verified encrypted copy is retained');
    assert.equal(e.store.get('diwan_v9_migration_pending'), 'v8');
    assert.deepEqual(e.calls.blocked, ['migration-cleanup']);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.calls.renders, 0);
    const encryptedPrimary = e.store.get('diwan_v9_data');
    const blockedBeforeRestart = e.calls.blocked.length;
    e.context.secBoot();
    assert.equal(e.calls.blocked.length, blockedBeforeRestart, 'verified encrypted primary is recoverable after restart');
    assert.equal(e.context._SEC.ready, false, 'workspace stays closed until the manager authenticates again');
    assert.equal(e.store.get('diwan_v9_data'), encryptedPrimary, 'encrypted primary remains present');
    assert.equal(e.store.get('diwan_v8_data'), fixture.raw, 'legacy plaintext remains preserved when cleanup still fails');
    assert.equal(e.store.get('diwan_v9_migration_pending'), 'v8-cleanup', 'recovery marker remains for retry');
  });

  test('restart after successful migration loads the primary encrypted copy without rewriting or setup', async () => {
    const first = makeUnlockEnv(), fixture = await legacyFixture(first, 'LegacyManager9');
    first.store.set('diwan_v8_data', fixture.raw);
    first.context.secBoot(); await first.submit(fixture.password);
    const migrated = first.store.get('diwan_v9_data'), second = makeUnlockEnv(Object.fromEntries(first.store));
    second.context.secBoot();
    assert.equal(second.context._loadedFromV8, false);
    assert.equal(second.calls.setup, 0);
    await second.submit(fixture.password);
    assert.equal(second.context._SEC.ready, true);
    assert.equal(JSON.stringify(second.context.S.cases), JSON.stringify(fixture.data.cases));
    assert.equal(second.store.get('diwan_v9_data'), migrated);
    assert.equal(second.writes(), 0, 'already-encrypted primary data is not rewritten on ordinary unlock');
    assert.equal(second.store.has('diwan_v8_data'), false);
  });

  test('an already-encrypted primary is authenticated before stale v8 plaintext is deleted', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'LegacyManager9');
    const primary = await e.encrypt(fixture.data, fixture.password), legacy = fixture.raw;
    e.store.set('diwan_v9_data', primary); e.store.set('diwan_v8_data', legacy);
    const events = [], decrypt = e.context.decryptJSON.bind(e.context), removeItem = e.context.localStorage.removeItem.bind(e.context.localStorage);
    e.context.decryptJSON = (payload, password, ctx) => Promise.resolve(decrypt(payload, password, ctx)).then(data => { if (payload === primary) events.push('primary-decrypted'); return data; });
    e.context.localStorage.removeItem = key => { if (key === 'diwan_v8_data') { assert.equal(e.store.get('diwan_v9_data'), primary); events.push('stale-v8-remove'); } return removeItem(key); };
    e.context.secBoot();
    assert.equal(e.context._legacyV8PendingCleanup, true);
    await e.submit(fixture.password);
    assert.deepEqual(events, ['primary-decrypted', 'stale-v8-remove']);
    assert.equal(e.store.get('diwan_v9_data'), primary, 'valid primary ciphertext is not rewritten');
    assert.equal(e.store.has('diwan_v8_data'), false);
    assert.equal(e.context._SEC.ready, true);
    assert.equal(e.calls.renders, 1);
  });

  test('schema migration on an encrypted primary waits for verified persistence before rendering', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'LegacyManager9');
    const prior = await e.encrypt(fixture.data, fixture.password);
    e.store.set('diwan_v9_data', prior);
    const order = [], setItem = e.context.localStorage.setItem.bind(e.context.localStorage), decrypt = e.context.decryptJSON.bind(e.context);
    let afterWrite = false;
    e.context.migrateV3 = () => { e.context._savePending = true; order.push('schema-migration'); };
    e.context.localStorage.setItem = (key, value) => { if (key === 'diwan_v9_data' && value !== prior) { order.push('write'); afterWrite = true; } return setItem(key, value); };
    e.context.decryptJSON = (payload, password, ctx) => Promise.resolve(decrypt(payload, password, ctx)).then(data => { if (afterWrite && payload === e.store.get('diwan_v9_data')) order.push('verified'); return data; });
    e.context.render = () => order.push('render');
    e.context.secBoot(); await e.submit(fixture.password);
    assert.deepEqual(order, ['schema-migration', 'write', 'verified', 'render']);
    assert.equal(e.context._SEC.ready, true);
    assert.match(e.store.get('diwan_v9_data'), /^DWNENC2:/);
  });

  test('failed schema-migration write restores the prior encrypted store and keeps boot closed', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'LegacyManager9');
    const prior = await e.encrypt(fixture.data, fixture.password);
    e.store.set('diwan_v9_data', prior);
    let writes = 0; const setItem = e.context.localStorage.setItem.bind(e.context.localStorage);
    e.context.migrateV3 = () => { e.context._savePending = true; };
    e.context.localStorage.setItem = (key, value) => {
      if (key === 'diwan_v9_data' && ++writes === 1) return setItem(key, value + 'bad-readback');
      return setItem(key, value);
    };
    e.context.secBoot(); await e.submit(fixture.password);
    assert.equal(e.store.get('diwan_v9_data'), prior);
    assert.equal(e.context._SEC.ready, false);
    assert.deepEqual(e.calls.blocked, ['migration-save']);
    assert.equal(e.calls.renders, 0);
    assert.equal(e.calls.auth, undefined);
  });

  test('failed cleanup of stale v8 after primary unlock still blocks workspace', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'LegacyManager9');
    const primary = await e.encrypt(fixture.data, fixture.password);
    e.store.set('diwan_v9_data', primary); e.store.set('diwan_v8_data', fixture.raw);
    const removeItem = e.context.localStorage.removeItem.bind(e.context.localStorage);
    e.context.localStorage.removeItem = key => { if (key === 'diwan_v8_data') throw new Error('remove denied'); return removeItem(key); };
    e.context.secBoot(); await e.submit(fixture.password);
    assert.equal(e.store.get('diwan_v9_data'), primary);
    assert.equal(e.store.get('diwan_v8_data'), fixture.raw);
    assert.equal(e.store.get('diwan_v9_migration_pending'), 'v8-cleanup');
    assert.deepEqual(e.calls.blocked, ['migration-cleanup']);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.calls.renders, 0);
  });

  test('wrong password for encrypted v8 leaves it byte-for-byte unchanged and never creates primary data', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'LegacyManager9');
    const raw = await e.encrypt(fixture.data, fixture.password);
    e.store.set('diwan_v8_data', raw);
    e.context.secBoot(); await e.submit('IncorrectManager8');
    assert.equal(e.store.get('diwan_v8_data'), raw);
    assert.equal(e.store.has('diwan_v9_data'), false);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.calls.renders, 0);
    assert.equal(e.calls.auth, undefined);
  });

  test('first-run setup displays workspace only after the encrypted copy has been read back and decrypted', async () => {
    const e = makeUnlockEnv(), order = [];
    const setItem = e.context.localStorage.setItem.bind(e.context.localStorage), decrypt = e.context.decryptJSON.bind(e.context);
    e.context.localStorage.setItem = (key, value) => { if (key === 'diwan_v9_data') order.push('write'); return setItem(key, value); };
    e.context.decryptJSON = (payload, password, ctx) => Promise.resolve(decrypt(payload, password, ctx)).then(data => {
      if (payload === e.store.get('diwan_v9_data')) order.push('verify'); return data;
    });
    e.context.chrome = () => order.push('chrome'); e.context.render = () => order.push('render');
    e.context.secShowSetup();
    e.setupFields['#lkP1'].value = 'FirstRunPass1'; e.setupFields['#lkP2'].value = 'FirstRunPass1';
    e.fields.setupSubmit({ preventDefault() {} });
    await waitFor(() => !!e.calls.auth || e.calls.blocked.length > 0);
    assert.deepEqual(e.calls.blocked, []);
    assert.ok(order.indexOf('write') >= 0);
    assert.ok(order.indexOf('verify') > order.indexOf('write'));
    assert.ok(order.indexOf('chrome') > order.indexOf('verify'));
    assert.ok(order.indexOf('render') > order.indexOf('verify'));
    assert.match(e.store.get('diwan_v9_data'), /^DWNENC2:/);
    assert.equal(e.context._SEC.ready, true);
    assert.deepEqual(e.calls.auth, [['pwset', 'm']]);
  });

  test('persistNow restores the previous encrypted primary when readback verification fails', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'LegacyManager9');
    const prior = await e.encrypt(fixture.data, fixture.password);
    e.store.set('diwan_v9_data', prior);
    Object.assign(e.context.S, fixture.data); e.context.S.user = 'm'; e.context._SEC.setPass(fixture.password); e.context._SEC.ready = true;
    let writes = 0; const storeSet = e.context.localStorage.setItem.bind(e.context.localStorage);
    e.context.localStorage.setItem = (key, value) => {
      if (key === 'diwan_v9_data' && ++writes === 1) return storeSet(key, value + 'unverifiable');
      return storeSet(key, value);
    };
    const saved = await e.context.persistNow();
    assert.equal(saved, false);
    assert.equal(e.store.get('diwan_v9_data'), prior, 'rollback retains the previous recoverable ciphertext');
    assert.equal(e.context._SEC.ready, true);
  });

  test('setup remains closed and reports failure if encrypted persistence fails', async () => {
    const e = makeUnlockEnv();
    const setItem = e.context.localStorage.setItem.bind(e.context.localStorage);
    e.context.localStorage.setItem = (key, value) => { if (key === 'diwan_v9_data') throw new Error('quota'); return setItem(key, value); };
    e.context.secShowSetup();
    e.setupFields['#lkP1'].value = 'FirstRunPass1'; e.setupFields['#lkP2'].value = 'FirstRunPass1';
    e.fields.setupSubmit({ preventDefault() {} });
    await waitFor(() => e.calls.blocked.length > 0 || e.calls.auth);
    assert.deepEqual(e.calls.blocked, ['migration-save']);
    assert.equal(e.store.has('diwan_v9_data'), false);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.calls.renders, 0);
    assert.equal(e.calls.auth, undefined);
  });
});

describe('interrupted migration recovery', () => {
  async function legacyFixture(e, password, cases = [{ id: 915, title: 'Recoverable legacy record' }]) {
    const record = await e.context.hashPass(password);
    const data = { cases, user: 'm', userPasswords: { m: record } };
    return { data, raw: JSON.stringify(data), password };
  }

  test('v8 marker resumes after password verification and preserves legacy until ciphertext verifies', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'RecoveryManager9');
    e.store.set('diwan_v8_data', fixture.raw);
    e.store.set('diwan_v9_migration_pending', 'v8');
    e.context.secBoot();
    assert.equal(e.calls.setup, 0);
    assert.deepEqual(e.calls.blocked, []);
    assert.equal(e.store.get('diwan_v8_data'), fixture.raw);
    await e.submit(fixture.password);
    assert.equal(e.context._SEC.ready, true);
    assert.match(e.store.get('diwan_v9_data'), /^DWNENC[12]:/);
    assert.equal(e.store.has('diwan_v8_data'), false);
    assert.equal(e.store.has('diwan_v9_migration_pending'), false);
    assert.equal(e.store.has('diwan_v9_migration_backup'), false);
  });

  test('primary marker written before backup can recover from the still-valid primary', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'RecoveryManager9');
    e.store.set('diwan_v9_data', fixture.raw);
    e.store.set('diwan_v9_migration_pending', 'primary');
    e.context.secBoot();
    assert.equal(e.calls.setup, 0);
    assert.deepEqual(e.calls.blocked, []);
    await e.submit(fixture.password);
    assert.equal(e.context._SEC.ready, true);
    assert.match(e.store.get('diwan_v9_data'), /^DWNENC[12]:/);
    assert.equal(e.store.has('diwan_v9_migration_pending'), false);
    assert.equal(e.store.has('diwan_v9_migration_backup'), false);
  });

  test('invalid interrupted primary recovers from verified backup without setup or data loss', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'RecoveryManager9');
    const damaged = '{"cases":';
    e.store.set('diwan_v9_data', damaged);
    e.store.set('diwan_v9_migration_backup', fixture.raw);
    e.store.set('diwan_v9_migration_pending', 'primary');
    e.context.secBoot();
    assert.equal(e.calls.setup, 0);
    assert.equal(e.calls.applied, 0, 'backup data is not applied before authentication');
    assert.deepEqual(e.calls.blocked, []);
    await e.submit(fixture.password);
    assert.equal(e.context._SEC.ready, true);
    assert.match(e.store.get('diwan_v9_data'), /^DWNENC[12]:/);
    assert.equal(JSON.stringify(e.context.S.cases), JSON.stringify(fixture.data.cases));
    assert.equal(e.store.has('diwan_v9_migration_backup'), false);
    assert.equal(e.store.has('diwan_v9_migration_pending'), false);
  });

  test('encrypted primary with cleanup marker is authenticated before stale plaintext is removed', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'RecoveryManager9');
    const encrypted = await e.encrypt(fixture.data, fixture.password);
    e.store.set('diwan_v9_data', encrypted);
    e.store.set('diwan_v8_data', fixture.raw);
    e.store.set('diwan_v9_migration_backup', fixture.raw);
    e.store.set('diwan_v9_migration_pending', 'v8-cleanup');
    e.context.secBoot();
    assert.equal(e.calls.setup, 0);
    assert.equal(e.store.get('diwan_v8_data'), fixture.raw);
    await e.submit(fixture.password);
    assert.equal(e.context._SEC.ready, true);
    assert.equal(e.store.get('diwan_v9_data'), encrypted);
    assert.equal(e.store.has('diwan_v8_data'), false);
    assert.equal(e.store.has('diwan_v9_migration_backup'), false);
    assert.equal(e.store.has('diwan_v9_migration_pending'), false);
  });

  test('wrong manager password during encrypted-primary recovery preserves every recovery copy', async () => {
    const e = makeUnlockEnv(), fixture = await legacyFixture(e, 'RecoveryManager9');
    const encrypted = await e.encrypt(fixture.data, fixture.password);
    e.store.set('diwan_v9_data', encrypted);
    e.store.set('diwan_v8_data', fixture.raw);
    e.store.set('diwan_v9_migration_backup', fixture.raw);
    e.store.set('diwan_v9_migration_pending', 'v8-cleanup');
    e.context.secBoot();
    await e.submit('IncorrectManager8');
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.store.get('diwan_v9_data'), encrypted);
    assert.equal(e.store.get('diwan_v8_data'), fixture.raw);
    assert.equal(e.store.get('diwan_v9_migration_backup'), fixture.raw);
    assert.equal(e.store.get('diwan_v9_migration_pending'), 'v8-cleanup');
    assert.equal(e.calls.applied, 0);
    assert.equal(e.calls.setup, 0);
    assert.equal(e.writes(), 0);
  });

  test('unknown marker fails closed and leaves all candidate bytes unchanged', () => {
    const e = makeUnlockEnv(), primary = '{"cases":[]}';
    e.store.set('diwan_v9_data', primary);
    e.store.set('diwan_v9_migration_backup', '{"cases":[{"id":"backup"}]}');
    e.store.set('diwan_v9_migration_pending', 'unknown-state');
    e.context.secBoot();
    assert.deepEqual(e.calls.blocked, ['migration-recovery']);
    assert.equal(e.calls.setup, 0);
    assert.equal(e.context._SEC.ready, false);
    assert.equal(e.store.get('diwan_v9_data'), primary);
    assert.equal(e.store.get('diwan_v9_migration_backup'), '{"cases":[{"id":"backup"}]}');
    assert.equal(e.store.get('diwan_v9_migration_pending'), 'unknown-state');
  });
});

describe('idle-lock lifecycle follows boot readiness', () => {
  test('first-run password setup is not covered by an idle lock or timer', () => {
    const e = makeEnv();
    e.context._SEC.ready = false; // secBoot is showing the first-run password setup overlay.
    e.context.bumpIdle();
    e.context.lockIdle(true);
    assert.equal([...e.timers.values()].some(x => x.ms === 600000), false);
    assert.equal(e.idleLock.classList.contains('on'), false);
    assert.equal(e.authOverlay.inert, false, 'setup overlay remains interactive');
  });

  test('app password-unlock overlay is not covered before boot completes', () => {
    const e = makeEnv();
    e.context._SEC.ready = false; // Existing encrypted store: manager must unlock first.
    e.context.bumpIdle();
    e.context.lockIdle(true);
    assert.equal([...e.timers.values()].some(x => x.ms === 600000), false);
    assert.equal(e.idleLock.classList.contains('on'), false);
    assert.equal(e.authOverlay.inert, false, 'unlock overlay remains interactive');
  });

  test('panic lock is effective with valid verification and refuses to claim success without it', () => {
    const good = makeEnv();
    assert.equal(good.context.panicLockIdle(), true);
    assert.equal(good.idleLock.classList.contains('on'), true);
    assert.equal(good.context.S.audit.length, 1);
    const bad = makeEnv(); bad.context._SEC.avail = () => false;
    assert.equal(bad.context.panicLockIdle(), false);
    assert.equal(bad.idleLock.classList.contains('on'), false);
    assert.equal(bad.context.S.audit, undefined);
  });

  test('no WebCrypto or usable credential means no idle timer and no forced lock', () => {
    const e = makeEnv();
    e.context._SEC.avail = () => false;
    e.context.bumpIdle(); e.context.lockIdle(true);
    assert.equal([...e.timers.values()].some(x => x.ms === 600000), false);
    assert.equal(e.idleLock.classList.contains('on'), false);
  });

  test('missing active credential or verifier prevents scheduling and activation', () => {
    const e = makeEnv(); delete e.context.S.userPasswords.manager;
    e.context.bumpIdle(); e.context.lockIdle(true);
    assert.equal([...e.timers.values()].some(x => x.ms === 600000), false);
    assert.equal(e.idleLock.classList.contains('on'), false);
    e.context.S.userPasswords.manager = { salt: 'test-salt', hash: 'test-hash' };
    e.context.verifyPass = undefined;
    e.context.bumpIdle(); e.context.lockIdle(true);
    assert.equal([...e.timers.values()].some(x => x.ms === 600000), false);
    assert.equal(e.idleLock.classList.contains('on'), false);
  });

  test('readiness starts one timer; repeated resets replace it and stale callbacks are ignored', () => {
    const e = makeEnv(); e.context._SEC.ready = false;
    e.context.bumpIdle();
    assert.equal([...e.timers.values()].filter(x => x.ms === 600000).length, 0);
    e.context._SEC.ready = true;
    e.context.bumpIdle();
    let timerEntry = [...e.timers.entries()].find(([, x]) => x.ms === 600000);
    assert.ok(timerEntry, 'timer starts after ready state and valid active credential');
    const staleCallback = timerEntry[1].fn;
    e.context.bumpIdle();
    assert.equal([...e.timers.values()].filter(x => x.ms === 600000).length, 1, 'repeated bump replaces rather than duplicates timer');
    e.context._SEC.ready = false;
    e.context.idleInvalidate();
    staleCallback(); // Simulate a callback already queued when clearTimeout occurred.
    assert.equal(e.idleLock.classList.contains('on'), false, 'stale callback cannot lock after readiness changes');
    assert.equal([...e.timers.values()].some(x => x.ms === 600000), false);
  });
});

describe('idle unlock verifies the active user and fails closed', () => {
  test('valid password for the active user unlocks', async () => {
    const e = makeEnv(); await installCredential(e, 'CorrectPass1'); lock(e); e.idlePw.value = 'CorrectPass1';
    assert.equal(await e.context.tryIdleUnlock(), true);
    assert.equal(e.idleLock.classList.contains('on'), false);
    assert.equal(e.app.inert, false);
  });

  test('wrong password keeps the overlay and protected UI locked', async () => {
    const e = makeEnv(); await installCredential(e, 'CorrectPass1'); lock(e); e.idlePw.value = 'WrongPass2';
    assert.equal(await e.context.tryIdleUnlock(), false);
    assert.equal(e.idleLock.classList.contains('on'), true);
    assert.equal(e.app.inert, true);
  });

  test('empty password is rejected without invoking successful unlock', async () => {
    const e = makeEnv(); await installCredential(e, 'CorrectPass1'); lock(e); e.idlePw.value = '';
    assert.equal(await e.context.tryIdleUnlock(), false);
    assert.equal(e.idleLock.classList.contains('on'), true);
  });

  test('missing verifier or missing stored credential does not unlock', async () => {
    const e = makeEnv(); await installCredential(e, 'CorrectPass1'); lock(e); e.idlePw.value = 'CorrectPass1';
    e.context.verifyPass = undefined;
    assert.equal(await e.context.tryIdleUnlock(), false);
    assert.equal(e.idleLock.classList.contains('on'), true);
    e.context.verifyPass = vm.runInContext(extractFunction('verifyPass'), e.context);
    delete e.context.S.userPasswords.manager;
    assert.equal(await e.context.tryIdleUnlock(), false);
    assert.equal(e.idleLock.classList.contains('on'), true);
  });

  test('rejected verification promise and synchronous verifier exception both fail closed', async () => {
    const e = makeEnv(); await installCredential(e, 'CorrectPass1'); lock(e); e.idlePw.value = 'CorrectPass1';
    e.context.verifyPass = () => Promise.reject(new Error('verification failure'));
    assert.equal(await e.context.tryIdleUnlock(), false);
    assert.equal(e.idleLock.classList.contains('on'), true);
    e.context.verifyPass = () => { throw new Error('verification failure'); };
    assert.equal(await e.context.tryIdleUnlock(), false);
    assert.equal(e.idleLock.classList.contains('on'), true);
  });

  test('unready app or absent/unknown active user cannot unlock', async () => {
    const e = makeEnv(); await installCredential(e, 'CorrectPass1'); lock(e); e.idlePw.value = 'CorrectPass1';
    e.context._SEC.ready = false;
    assert.equal(await e.context.tryIdleUnlock(), false);
    e.context._SEC.ready = true; e.context.S.user = 'unknown';
    assert.equal(await e.context.tryIdleUnlock(), false);
    assert.equal(e.idleLock.classList.contains('on'), true);
  });

  test('direct lockIdle(false) without successful verification cannot dismiss lock', () => {
    const e = makeEnv(); lock(e); e.context.lockIdle(false);
    assert.equal(e.idleLock.classList.contains('on'), true);
  });
});

describe('idle lock protects UI and relocks after inactivity', () => {
  test('underlying app, navigation and panic control are inert and hidden from assistive tech', () => {
    const e = makeEnv(); lock(e);
    for (const el of [e.app, e.nav, e.panic]) {
      assert.equal(el.inert, true);
      assert.equal(el.getAttribute('aria-hidden'), 'true');
    }
    assert.equal(e.idleLock.getAttribute('aria-hidden'), 'false');
    e.context.lockIdle(false);
    assert.equal(e.idleLock.classList.contains('on'), true, 'unverified direct unlock remains blocked');
    for (const el of [e.app, e.nav, e.panic]) assert.equal(el.inert, true);
  });

  test('all required events pass through inside the lock and are blocked on protected UI', () => {
    const e = makeEnv(); lock(e);
    const types = ['input','keydown','keyup','keypress','click','submit','pointerdown','pointerup','touchstart','change','contextmenu'];
    for (const type of types) {
      const inside = e.dispatch(type, type === 'input' ? e.idlePw : { withinIdleLock: true });
      assert.equal(inside.prevented, false, type + ' inside lock must not be canceled');
      assert.equal(inside.stopped, false, type + ' inside lock must propagate');
      const outside = e.dispatch(type, e.app);
      assert.equal(outside.prevented, true, type + ' outside lock must be canceled');
      assert.equal(outside.stopped, true, type + ' outside lock must stop propagation');
    }
  });

  test('an active boot-auth overlay remains interactive after reinitializing from an idle lock', async () => {
    const e = makeEnv(); await installCredential(e, 'CorrectPass1'); lock(e);
    e.context.idleInvalidate(); e.context._SEC.ready = false;
    const authEvent = e.dispatch('input', { withinBootOverlay: true });
    assert.equal(authEvent.prevented, false);
    assert.equal(authEvent.stopped, false);
    const workspaceEvent = e.dispatch('click', e.app);
    assert.equal(workspaceEvent.prevented, true);
    assert.equal(workspaceEvent.stopped, true);
    assert.equal(e.idleLock.classList.contains('on'), true, 'reinitialization does not silently dismiss the idle lock');
  });

  test('password field accepts simulated typing while the lock is active', () => {
    const e = makeEnv(); lock(e);
    for (const key of ['C','o','r','r','e','c','t','1']) {
      const keyEvent = e.dispatch('keydown', e.idlePw);
      assert.equal(keyEvent.prevented, false);
      e.idlePw.value += key; // Represents the browser's native text-input default action.
      const inputEvent = e.dispatch('input', e.idlePw);
      assert.equal(inputEvent.prevented, false);
    }
    assert.equal(e.idlePw.value, 'Correct1');
  });

  test('lock submit passes through but submitting alone cannot unlock', () => {
    const e = makeEnv(); lock(e);
    const submit = e.dispatch('submit', { withinIdleLock: true });
    assert.equal(submit.prevented, false);
    assert.equal(submit.stopped, false);
    assert.equal(e.idleLock.classList.contains('on'), true);
  });

  test('unlock restores the exact pre-lock inert and aria-hidden states', async () => {
    const e = makeEnv();
    e.app.inert = true; e.app.setAttribute('aria-hidden', 'false');
    e.nav.inert = false; e.nav.setAttribute('aria-hidden', 'true');
    await installCredential(e, 'CorrectPass1'); lock(e);
    assert.equal(e.app.inert, true); assert.equal(e.nav.inert, true);
    e.idlePw.value = 'CorrectPass1';
    assert.equal(await e.context.tryIdleUnlock(), true);
    assert.equal(e.app.inert, true); assert.equal(e.app.getAttribute('aria-hidden'), 'false');
    assert.equal(e.nav.inert, false); assert.equal(e.nav.getAttribute('aria-hidden'), 'true');
  });

  test('activity while locked cannot dismiss lock; successful unlock restarts the 10-minute timer', async () => {
    const e = makeEnv(); e.context.bumpIdle();
    let timerEntry = [...e.timers.entries()].find(([, x]) => x.ms === 600000);
    assert.ok(timerEntry, '10-minute idle timer was scheduled');
    const [firstId, timer] = timerEntry; e.timers.delete(firstId); timer.fn();
    assert.equal(e.idleLock.classList.contains('on'), true);
    assert.equal(e.app.inert, true);
    const lockedActivity = e.dispatch('keydown', { withinIdleLock: true });
    assert.equal(lockedActivity.prevented, false);
    assert.equal(e.idleLock.classList.contains('on'), true, 'activity cannot reopen the app');
    assert.equal([...e.timers.values()].some(x => x.ms === 600000), false, 'activity while locked does not arm a timer that unlocks or alters the lock');
    await installCredential(e, 'CorrectPass1'); e.idlePw.value = 'CorrectPass1';
    assert.equal(await e.context.tryIdleUnlock(), true);
    assert.equal(e.idleLock.classList.contains('on'), false);
    timerEntry = [...e.timers.entries()].find(([, x]) => x.ms === 600000);
    assert.ok(timerEntry, 'unlock schedules a fresh 10-minute idle timer');
    e.timers.delete(timerEntry[0]); timerEntry[1].fn();
    assert.equal(e.idleLock.classList.contains('on'), true, 'fresh timer locks again after inactivity');
  });
});
