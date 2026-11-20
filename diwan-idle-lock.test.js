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
  return { id, tagName: tagName || 'DIV', classList: makeClassList(), inert: false, value: '',
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    focus() { this.focused = true; },
    contains(node) { return node === this || !!(node && node.withinIdleLock); } };
}

function makeEnv() {
  const idleLock = makeElement('idleLock');
  const idlePw = makeElement('idlePw', 'INPUT'); idlePw.withinIdleLock = true;
  const app = makeElement('app');
  const nav = makeElement('tabbar'); nav.setAttribute('aria-hidden', 'false');
  const panic = makeElement('panic', 'BUTTON');
  const script = makeElement('', 'SCRIPT');
  const body = { children: [app, nav, panic, idleLock, script] };
  const els = { idleLock, idlePw };
  let tid = 0; const timers = new Map(); const toasts = [], listeners = [];
  const context = {
    console, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, DataView, Promise, Date,
    Buffer, setTimeout(fn, ms) { const id = ++tid; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: { body, addEventListener(type, fn, options) { listeners.push({ type, fn, capture: options === true || !!(options && options.capture) }); } },
    $(id) { return els[id] || null; },
    toast(msg) { toasts.push(String(msg)); },
    t(key) { return key; },
    S: { user: 'manager', userPasswords: {} },
    U: [{ id: 'manager', role: 'manager' }],
    _SEC: { ready: true }, PW_IT: 600000,
    _idleT: null, _idleMs: 600000, _idleLocked: false, _idleVerified: false, _idleInertState: [],
    secB64e(bytes) { return Buffer.from(bytes).toString('base64'); },
    secB64d(text) { return Uint8Array.from(Buffer.from(text, 'base64')); },
  };
  const names = ['secCmp', 'hashPass', 'verifyPass', 'bumpIdle', 'idleSetInert', 'lockIdle', 'idleInteractionGuard', 'tryIdleUnlock'];
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
  return { context, idleLock, idlePw, app, nav, panic, timers, toasts, listeners, dispatch };
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
    assert.match(HTML, /verifyPass\(rec,v\.pw\)\.then\(function\(ok\)/);
    assert.match(HTML, /if\(ok\)\{S\.auth\.fails\[nv\]=0;delete S\.auth\.lock\[nv\];secDoSwitch\(nv,'login'\)/);
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
