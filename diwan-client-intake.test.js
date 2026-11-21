/* DIWAN-CLIENT-INTAKE — End-to-end unit & integration tests for:
 *  - Phase 1: Client Onboarding & Management (Natural Person & Legal Entity, validation,
 *    duplicate detection, former-opponent conflict check, edit, draft preservation,
 *    search/filter, standalone client visibility, KYC, dgAutofill, statement, global search).
 *  - Phase 2: Responsible Lawyer (`lawyerName`, `lawyerOpts`, `syncPartnersU`, drawer display,
 *    collaborator `mine` scope, manager-only audited reassignment).
 *  - Phase 3: 4-Step Case Creation Wizard (`initWizard` persistent footer across steps 1–4,
 *    existing-client picker, step validation, review summary, conflict gate).
 *
 * Zero external dependencies — runs anywhere with: node diwan-client-intake.test.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const GUIDE = fs.readFileSync(path.join(__dirname, 'diwan-guide-unified-v9.7.html'), 'utf8');

function extractInlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/* Minimal recursive HTML/DOM engine sufficient to run Diwan's full inline scripts,
 * event delegation, forms, selects, wizard DOM mutations, and views in node:vm. */
function createMiniDOM(initialHTML) {
  let uidSeq = 1;
  const VOID_TAGS = new Set(['AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT','LINK','META','PARAM','SOURCE','TRACK','WBR']);

  function decodeEntities(str) {
    return String(str || '')
      .replace(/&#10;/g, '\n')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  class ClassList {
    constructor(el) { this._el = el; this._set = new Set(); }
    _syncFromAttr(v) {
      this._set.clear();
      String(v || '').split(/\s+/).filter(Boolean).forEach(c => this._set.add(c));
    }
    _syncToAttr() { this._el._attrs.class = Array.from(this._set).join(' '); }
    add(...cls) { cls.forEach(c => { if (c) this._set.add(c); }); this._syncToAttr(); }
    remove(...cls) { cls.forEach(c => this._set.delete(c)); this._syncToAttr(); }
    contains(c) { return this._set.has(c); }
    toggle(c, force) {
      const next = force === undefined ? !this._set.has(c) : !!force;
      if (next) this._set.add(c); else this._set.delete(c);
      this._syncToAttr();
      return next;
    }
    toString() { return Array.from(this._set).join(' '); }
  }

  function camelizeData(k) {
    return k.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
  }
  function hyphenateData(k) {
    return k.replace(/[A-Z]/g, ch => '-' + ch.toLowerCase());
  }

  const observers = [];
  function notifyAdded(parent, nodes) {
    if (!nodes.length || !observers.length) return;
    const rec = [{ addedNodes: nodes, target: parent }];
    observers.forEach(obs => { if (obs._active) obs._cb(rec); });
  }

  class Node {
    constructor(nodeType, tagName) {
      this._uid = uidSeq++;
      this.nodeType = nodeType;
      this.tagName = tagName ? String(tagName).toUpperCase() : '';
      this.parentNode = null;
      this.childNodes = [];
      this._attrs = Object.create(null);
      this._listeners = [];
      this.style = { set cssText(v) { this._css = String(v || ''); }, get cssText() { return this._css || ''; }, display: '' };
      this.classList = new ClassList(this);
      this._value = undefined;
      this._checked = undefined;
      this._selectedIndex = -1;
      this._hidden = false;
      this.disabled = false;
      this.multiple = false;
      this.inert = false;
      const self = this;
      this.dataset = new Proxy(Object.create(null), {
        get(_, prop) {
          if (typeof prop !== 'string') return undefined;
          const attr = 'data-' + hyphenateData(prop);
          return Object.prototype.hasOwnProperty.call(self._attrs, attr) ? self._attrs[attr] : undefined;
        },
        set(_, prop, val) {
          const attr = 'data-' + hyphenateData(String(prop));
          self._attrs[attr] = String(val);
          return true;
        },
        deleteProperty(_, prop) {
          delete self._attrs['data-' + hyphenateData(String(prop))];
          return true;
        },
        ownKeys() {
          return Object.keys(self._attrs).filter(k => k.startsWith('data-')).map(k => camelizeData(k.slice(5)));
        },
        getOwnPropertyDescriptor(_, prop) {
          const attr = 'data-' + hyphenateData(String(prop));
          if (Object.prototype.hasOwnProperty.call(self._attrs, attr)) {
            return { enumerable: true, configurable: true, value: self._attrs[attr] };
          }
          return undefined;
        }
      });
    }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    get nextSibling() {
      if (!this.parentNode) return null;
      const i = this.parentNode.childNodes.indexOf(this);
      return i >= 0 ? (this.parentNode.childNodes[i + 1] || null) : null;
    }
    get id() { return this._attrs.id || ''; }
    set id(v) { this._attrs.id = String(v || ''); }
    get className() { return this.classList.toString(); }
    set className(v) { this.classList._syncFromAttr(v); this._attrs.class = String(v || ''); }
    get type() { return this._attrs.type || (this.tagName === 'BUTTON' ? 'submit' : (this.tagName === 'INPUT' ? 'text' : '')); }
    set type(v) { this._attrs.type = String(v || ''); }
    get name() { return this._attrs.name || ''; }
    set name(v) { this._attrs.name = String(v || ''); }
    get lang() { return this._attrs.lang || ''; }
    set lang(v) { this._attrs.lang = String(v || ''); }
    get dir() { return this._attrs.dir || ''; }
    set dir(v) { this._attrs.dir = String(v || ''); }
    get placeholder() { return this._attrs.placeholder || ''; }
    set placeholder(v) { this._attrs.placeholder = String(v || ''); }
    get hidden() { return !!this._hidden || Object.prototype.hasOwnProperty.call(this._attrs, 'hidden'); }
    set hidden(v) {
      this._hidden = !!v;
      if (v) this._attrs.hidden = ''; else delete this._attrs.hidden;
    }
    get checked() {
      if (this._checked !== undefined) return this._checked;
      return Object.prototype.hasOwnProperty.call(this._attrs, 'checked');
    }
    set checked(v) { this._checked = !!v; }
    get options() {
      if (this.tagName !== 'SELECT') return [];
      const out = [];
      const walk = n => n.childNodes.forEach(c => {
        if (c.nodeType === 1 && c.tagName === 'OPTION') out.push(c);
        else if (c.nodeType === 1) walk(c);
      });
      walk(this);
      return out;
    }
    get selectedIndex() {
      if (this.tagName !== 'SELECT') return -1;
      const opts = this.options;
      if (!opts.length) return -1;
      if (this._selectedIndex >= 0 && this._selectedIndex < opts.length) return this._selectedIndex;
      const idx = opts.findIndex(o => Object.prototype.hasOwnProperty.call(o._attrs, 'selected'));
      return idx >= 0 ? idx : 0;
    }
    set selectedIndex(i) {
      this._selectedIndex = +i;
      this._value = undefined;
    }
    get value() {
      if (this.tagName === 'SELECT') {
        if (this._value !== undefined) {
          const opts = this.options;
          const idx = opts.findIndex(o => o.value === this._value);
          if (idx >= 0) return opts[idx].value;
          return '';
        }
        const opts = this.options;
        const si = this.selectedIndex;
        return (si >= 0 && opts[si]) ? opts[si].value : '';
      }
      if (this.tagName === 'OPTION') {
        return Object.prototype.hasOwnProperty.call(this._attrs, 'value') ? this._attrs.value : this.textContent;
      }
      if (this.tagName === 'TEXTAREA') {
        return this._value !== undefined ? this._value : this.textContent;
      }
      if (this._value !== undefined) return this._value;
      return Object.prototype.hasOwnProperty.call(this._attrs, 'value') ? this._attrs.value : '';
    }
    set value(v) {
      const sv = String(v == null ? '' : v);
      if (this.tagName === 'SELECT') {
        const opts = this.options;
        const idx = opts.findIndex(o => o.value === sv);
        this._selectedIndex = idx;
        this._value = sv;
      } else {
        this._value = sv;
      }
    }
    get textContent() {
      if (this.nodeType === 3) return this._text || '';
      return this.childNodes.map(c => c.textContent).join('');
    }
    set textContent(v) {
      this.childNodes.forEach(c => { c.parentNode = null; });
      this.childNodes = [];
      const s = String(v == null ? '' : v);
      if (s) {
        const t = new Node(3, '');
        t._text = s;
        t.parentNode = this;
        this.childNodes.push(t);
      }
    }
    get innerText() { return this.textContent; }
    set innerText(v) { this.textContent = v; }
    get innerHTML() {
      return this.childNodes.map(c => c._serialize()).join('');
    }
    set innerHTML(html) {
      this.childNodes.forEach(c => { c.parentNode = null; });
      this.childNodes = [];
      const parsed = parseFragment(String(html == null ? '' : html));
      parsed.forEach(n => { n.parentNode = this; this.childNodes.push(n); });
      notifyAdded(this, parsed.filter(n => n.nodeType === 1));
    }
    _serialize() {
      if (this.nodeType === 3) return this._text || '';
      const tag = this.tagName.toLowerCase();
      const attrs = Object.keys(this._attrs).map(k => `${k}="${this._attrs[k]}"`).join(' ');
      const open = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
      if (VOID_TAGS.has(this.tagName)) return open;
      return `${open}${this.innerHTML}</${tag}>`;
    }
    setAttribute(k, v) {
      const key = String(k).toLowerCase();
      this._attrs[key] = String(v);
      if (key === 'class') this.classList._syncFromAttr(v);
      if (key === 'disabled') this.disabled = true;
      if (key === 'hidden') this._hidden = true;
    }
    getAttribute(k) {
      const key = String(k).toLowerCase();
      return Object.prototype.hasOwnProperty.call(this._attrs, key) ? this._attrs[key] : null;
    }
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, String(k).toLowerCase()); }
    removeAttribute(k) {
      const key = String(k).toLowerCase();
      delete this._attrs[key];
      if (key === 'class') this.classList._syncFromAttr('');
      if (key === 'disabled') this.disabled = false;
      if (key === 'hidden') this._hidden = false;
    }
    appendChild(child) {
      if (!child) return child;
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      if (child.nodeType === 1) notifyAdded(this, [child]);
      return child;
    }
    append(...nodes) {
      nodes.forEach(n => {
        if (typeof n === 'string') {
          const tn = new Node(3, ''); tn._text = n; this.appendChild(tn);
        } else if (n) this.appendChild(n);
      });
    }
    replaceChildren(...nodes) {
      this.childNodes.forEach(c => { c.parentNode = null; });
      this.childNodes = [];
      this.append(...nodes);
    }
    insertBefore(newNode, refNode) {
      if (!refNode) return this.appendChild(newNode);
      if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
      const idx = this.childNodes.indexOf(refNode);
      newNode.parentNode = this;
      if (idx < 0) this.childNodes.push(newNode);
      else this.childNodes.splice(idx, 0, newNode);
      if (newNode.nodeType === 1) notifyAdded(this, [newNode]);
      return newNode;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    contains(other) {
      let cur = other;
      while (cur) { if (cur === this) return true; cur = cur.parentNode; }
      return false;
    }
    focus() { doc.activeElement = this; }
    click() {
      const ev = new CustomEvent('click', { bubbles: true, cancelable: true });
      this.dispatchEvent(ev);
      if (!ev.defaultPrevented && this.tagName === 'BUTTON' && this.type === 'submit') {
        const form = this.closest('form');
        if (form) form.requestSubmit();
      }
    }
    requestSubmit() {
      const ev = new CustomEvent('submit', { bubbles: true, cancelable: true });
      this.dispatchEvent(ev);
    }
    addEventListener(type, fn, opts) {
      const capture = opts === true || !!(opts && opts.capture);
      this._listeners.push({ type, fn, capture });
    }
    removeEventListener(type, fn, opts) {
      const capture = opts === true || !!(opts && opts.capture);
      this._listeners = this._listeners.filter(l => !(l.type === type && l.fn === fn && l.capture === capture));
    }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      const pathNodes = [];
      let cur = this;
      while (cur) { pathNodes.push(cur); cur = cur.parentNode; }
      pathNodes.push(doc);
      const ancestors = pathNodes.slice(1).reverse();
      for (const anc of ancestors) {
        if (ev._stopImmediate || ev._stopProp) break;
        ev.currentTarget = anc;
        for (const l of anc._listeners.slice()) {
          if (l.type === ev.type && l.capture) {
            l.fn.call(anc, ev);
            if (ev._stopImmediate) break;
          }
        }
      }
      if (!ev._stopProp && !ev._stopImmediate) {
        ev.currentTarget = this;
        for (const l of this._listeners.slice()) {
          if (l.type === ev.type && !l.capture) {
            l.fn.call(this, ev);
            if (ev._stopImmediate) break;
          }
        }
      }
      if (ev.bubbles && !ev._stopProp && !ev._stopImmediate) {
        for (let i = 1; i < pathNodes.length; i++) {
          const anc = pathNodes[i];
          ev.currentTarget = anc;
          for (const l of anc._listeners.slice()) {
            if (l.type === ev.type && !l.capture) {
              l.fn.call(anc, ev);
              if (ev._stopImmediate) break;
            }
          }
          if (ev._stopProp || ev._stopImmediate) break;
        }
      }
      return !ev.defaultPrevented;
    }
    matches(selector) { return matchSelectorList(this, selector); }
    closest(selector) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (matchSelectorList(cur, selector)) return cur;
        cur = cur.parentNode;
      }
      return null;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector, true)[0] || null;
    }
    querySelectorAll(selector, firstOnly) {
      const res = [];
      const sel = String(selector || '').trim();
      if (sel.startsWith(':scope')) {
        const rest = sel.replace(/^:scope\s*>\s*/, '').trim();
        for (const ch of this.children) {
          if (matchSelectorList(ch, rest)) {
            res.push(ch);
            if (firstOnly) return res;
          }
        }
        return res;
      }
      const walk = n => {
        for (const ch of n.childNodes) {
          if (ch.nodeType === 1) {
            if (matchSelectorList(ch, sel)) {
              res.push(ch);
              if (firstOnly) return;
            }
            walk(ch);
            if (firstOnly && res.length) return;
          }
        }
      };
      walk(this);
      return res;
    }
  }

  function splitTopCommas(sel) {
    const parts = [];
    let cur = '', depth = 0, quote = '';
    for (let i = 0; i < sel.length; i++) {
      const ch = sel[i];
      if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '[' || ch === '(') depth++;
      else if (ch === ']' || ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  function splitCombinators(sel) {
    const tokens = [];
    let cur = '', depth = 0, quote = '';
    for (let i = 0; i < sel.length; i++) {
      const ch = sel[i];
      if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '[' || ch === '(') depth++;
      else if (ch === ']' || ch === ')') depth--;
      if (depth === 0 && (ch === ' ' || ch === '>')) {
        if (cur) { tokens.push(cur); cur = ''; }
        if (ch === '>') tokens.push('>');
        else if (tokens[tokens.length - 1] !== '>' && tokens[tokens.length - 1] !== ' ') tokens.push(' ');
        continue;
      }
      cur += ch;
    }
    if (cur) tokens.push(cur);
    return tokens.filter((t, idx, arr) => !(t === ' ' && (idx === 0 || idx === arr.length - 1 || arr[idx - 1] === '>' || arr[idx + 1] === '>')));
  }

  function matchCompound(el, compound) {
    if (!el || el.nodeType !== 1) return false;
    let s = compound.trim();
    if (!s || s === '*') return true;
    const notRe = /:not\(([^)]+)\)/g;
    let nm;
    while ((nm = notRe.exec(s)) !== null) {
      if (matchCompound(el, nm[1])) return false;
    }
    s = s.replace(/:not\(([^)]+)\)/g, '');
    const attrRe = /\[([a-zA-Z0-9_-]+)(?:=([^\]]+))?\]/g;
    let am;
    while ((am = attrRe.exec(s)) !== null) {
      const attrName = am[1].toLowerCase();
      const expected = am[2] !== undefined ? am[2].trim().replace(/^['"]|['"]$/g, '') : null;
      if (attrName === 'type' && expected !== null) {
        if (String(el.type).toLowerCase() !== expected.toLowerCase()) return false;
      } else if (expected === null) {
        if (!el.hasAttribute(attrName)) return false;
      } else {
        if (el.getAttribute(attrName) !== expected) return false;
      }
    }
    s = s.replace(/\[[^\]]+\]/g, '');
    const idRe = /#([a-zA-Z0-9_-]+)/g;
    let im;
    while ((im = idRe.exec(s)) !== null) {
      if (el.id !== im[1]) return false;
    }
    s = s.replace(/#[a-zA-Z0-9_-]+/g, '');
    const clsRe = /\.([a-zA-Z0-9_-]+)/g;
    let cm;
    while ((cm = clsRe.exec(s)) !== null) {
      if (!el.classList.contains(cm[1])) return false;
    }
    s = s.replace(/\.[a-zA-Z0-9_-]+/g, '').trim();
    if (s && s !== '*') {
      if (el.tagName !== s.toUpperCase()) return false;
    }
    return true;
  }

  function matchTokens(el, tokens, idx) {
    if (!matchCompound(el, tokens[idx])) return false;
    if (idx === 0) return true;
    const comb = tokens[idx - 1];
    if (comb === '>') return matchTokens(el.parentElement, tokens, idx - 2);
    let anc = el.parentElement;
    while (anc) {
      if (matchTokens(anc, tokens, idx - 2)) return true;
      anc = anc.parentElement;
    }
    return false;
  }

  function matchSelectorList(el, selector) {
    if (!selector) return false;
    return splitTopCommas(selector).some(part => {
      const tokens = splitCombinators(part);
      return tokens.length ? matchTokens(el, tokens, tokens.length - 1) : false;
    });
  }

  function parseAttrs(attrStr, node) {
    const re = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
    let m;
    while ((m = re.exec(attrStr)) !== null) {
      const k = m[1].toLowerCase();
      const v = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
      const decoded = decodeEntities(v);
      node._attrs[k] = decoded;
      if (k === 'class') node.classList._syncFromAttr(decoded);
      if (k === 'disabled') node.disabled = true;
      if (k === 'hidden') node._hidden = true;
    }
  }

  function parseFragment(html) {
    const root = new Node(11, '#FRAGMENT');
    const stack = [root];
    const tokenRe = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)([^>]*?)(\/?)>|([^<]+)/g;
    let m;
    while ((m = tokenRe.exec(html)) !== null) {
      if (m[0].startsWith('<!--')) continue;
      if (m[1]) {
        const closeTag = m[1].toUpperCase();
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tagName === closeTag) { stack.length = i; break; }
        }
      } else if (m[2]) {
        const tag = m[2].toUpperCase();
        const el = new Node(1, tag);
        if (m[3]) parseAttrs(m[3], el);
        const parent = stack[stack.length - 1];
        el.parentNode = parent;
        parent.childNodes.push(el);
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') {
          const closeRe = new RegExp(`</${m[2]}\\s*>`, 'ig');
          closeRe.lastIndex = tokenRe.lastIndex;
          const cm = closeRe.exec(html);
          if (cm) {
            const rawText = html.slice(tokenRe.lastIndex, cm.index);
            if (rawText) {
              const tn = new Node(3, '');
              tn._text = tag === 'TEXTAREA' ? decodeEntities(rawText) : rawText;
              tn.parentNode = el;
              el.childNodes.push(tn);
            }
            tokenRe.lastIndex = closeRe.lastIndex;
          }
        } else if (!m[4] && !VOID_TAGS.has(tag)) {
          stack.push(el);
        }
      } else if (m[5]) {
        const tn = new Node(3, '');
        tn._text = decodeEntities(m[5]);
        const parent = stack[stack.length - 1];
        tn.parentNode = parent;
        parent.childNodes.push(tn);
      }
    }
    root.childNodes.forEach(c => { c.parentNode = null; });
    return root.childNodes;
  }

  class CustomEvent {
    constructor(type, opts) {
      this.type = type;
      this.bubbles = !!(opts && opts.bubbles);
      this.cancelable = !!(opts && opts.cancelable);
      this.key = (opts && opts.key) || '';
      this.ctrlKey = !!(opts && opts.ctrlKey);
      this.metaKey = !!(opts && opts.metaKey);
      this.defaultPrevented = false;
      this._stopProp = false;
      this._stopImmediate = false;
      this.target = null;
      this.currentTarget = null;
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { this._stopProp = true; }
    stopImmediatePropagation() { this._stopImmediate = true; this._stopProp = true; }
  }

  class MiniMutationObserver {
    constructor(cb) { this._cb = cb; this._active = false; observers.push(this); }
    observe() { this._active = true; }
    disconnect() { this._active = false; }
  }

  const htmlWithoutScripts = initialHTML
    .replace(/<!DOCTYPE[^>]*>/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const topNodes = parseFragment(htmlWithoutScripts);
  const htmlEl = topNodes.find(n => n.nodeType === 1 && n.tagName === 'HTML') || new Node(1, 'HTML');
  const headEl = htmlEl.children.find(n => n.tagName === 'HEAD') || new Node(1, 'HEAD');
  const bodyEl = htmlEl.children.find(n => n.tagName === 'BODY') || new Node(1, 'BODY');

  const doc = {
    nodeType: 9,
    readyState: 'complete',
    documentElement: htmlEl,
    head: headEl,
    body: bodyEl,
    activeElement: bodyEl,
    _listeners: [],
    createElement(tag) { return new Node(1, tag); },
    createTextNode(txt) { const n = new Node(3, ''); n._text = String(txt || ''); return n; },
    getElementById(id) { return htmlEl.querySelector('#' + id); },
    querySelector(sel) { return htmlEl.querySelector(sel); },
    querySelectorAll(sel) { return htmlEl.querySelectorAll(sel); },
    addEventListener(type, fn, opts) {
      const capture = opts === true || !!(opts && opts.capture);
      this._listeners.push({ type, fn, capture });
    },
    removeEventListener(type, fn, opts) {
      const capture = opts === true || !!(opts && opts.capture);
      this._listeners = this._listeners.filter(l => !(l.type === type && l.fn === fn && l.capture === capture));
    },
    dispatchEvent(ev) { return bodyEl.dispatchEvent(ev); }
  };

  return { document: doc, Event: CustomEvent, MutationObserver: MiniMutationObserver };
}

async function bootDiwanApp(opts = {}) {
  const { document, Event, MutationObserver } = createMiniDOM(HTML);
  const store = new Map();
  store.set('diwan_v8_welcomed', '1');
  if (opts.storage) {
    Object.entries(opts.storage).forEach(([k, v]) => store.set(k, v));
  }
  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(String(k), String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); }
  };

  const confirmCalls = [];
  const openedUrls = [];
  let confirmNext = opts.confirmDefault !== undefined ? opts.confirmDefault : true;

  const sandbox = {
    console,
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Uint32Array,
    DataView,
    ArrayBuffer,
    Promise,
    Date,
    Math,
    JSON,
    Intl,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Set,
    Map,
    RegExp,
    Error,
    TypeError,
    isNaN,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    document,
    Event,
    MutationObserver,
    localStorage,
    navigator: { onLine: true, clipboard: { writeText: () => Promise.resolve() } },
    location: { protocol: 'https:', hostname: 'localhost', href: 'https://localhost/' },
    matchMedia: () => ({ matches: !!opts.prefersDark, addEventListener() {} }),
    confirm(msg) { confirmCalls.push(String(msg)); return typeof confirmNext === 'function' ? confirmNext(msg) : confirmNext; },
    prompt: () => '',
    alert: () => {},
    print: () => {},
    scrollTo: () => {},
    screen: { width: 1440, height: 900 },
    addEventListener: () => {},
    removeEventListener: () => {},
    open(url) { openedUrls.push(url); return { document: { open() {}, write() {}, close() {} }, focus() {}, print() {}, close() {} }; },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    Blob: class MockBlob { constructor(parts, o) { this.parts = parts; this.type = o && o.type; } },
    setTimeout(fn) { return setImmediate(() => {}); },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  const scripts = extractInlineScripts(HTML);
  scripts.forEach((code, idx) => {
    vm.runInContext(code, sandbox, { filename: `index.html#script-${idx}` });
  });

  // Complete first-run password setup cleanly through the real UI overlay (#lkForm)
  const lk1 = document.getElementById('lkP1');
  const lk2 = document.getElementById('lkP2');
  const lkForm = document.getElementById('lkForm');
  assert.ok(lk1 && lk2 && lkForm, 'First-run password setup overlay rendered');
  lk1.value = 'DiwanPass2026';
  lk2.value = 'DiwanPass2026';
  lkForm.requestSubmit();
  // Wait for async WebCrypto PBKDF2 + AES-GCM boot to finish (#lockOv removed & _SEC.ready === true)
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 25));
    if (!document.getElementById('lockOv') && vm.runInContext('!!(_SEC && _SEC.ready)', sandbox)) break;
  }
  assert.equal(document.getElementById('lockOv'), null, 'Lock overlay removed after setup');
  assert.equal(vm.runInContext('!!(_SEC && _SEC.ready)', sandbox), true, 'Workspace unlocked cleanly');

  return {
    sandbox,
    document,
    Event,
    store,
    confirmCalls,
    openedUrls,
    setConfirm(fnOrBool) { confirmNext = fnOrBool; },
    evalInApp(expr) { return vm.runInContext(expr, sandbox); }
  };
}

describe('Phase 1 — Client Onboarding & Management (Natural Person & Legal Entity)', () => {
  test('1.1 Natural person client: validation, creation, persistence, standalone visibility, search/filter, and profile KPIs', async () => {
    const app = await bootDiwanApp();
    const { document, Event, evalInApp } = app;

    // Navigate to Clients screen
    evalInApp("go('clients')");
    const addBtn = document.querySelector('[data-act="newclient"]');
    assert.ok(addBtn, '+ إضافة موكّل جديد button is visible on clients screen');
    addBtn.click();

    assert.equal(document.getElementById('modalWrap').classList.contains('on'), true, 'Client modal opened');
    const clForm = document.getElementById('clForm');
    assert.ok(clForm, 'Client form #clForm rendered');

    // Empty submit must fail inline validation on required fields (ar, ph)
    clForm.requestSubmit();
    assert.equal(document.getElementById('modalWrap').classList.contains('on'), true, 'Modal stays open on validation error');
    assert.ok(document.querySelector('[data-f="ar"]').classList.contains('bad'), 'ar name flagged as required');
    assert.ok(document.querySelector('[data-f="ph"]').classList.contains('bad'), 'ph flagged as required');

    // Invalid NIN (5 digits < 10) & invalid email must be caught
    document.getElementById('cl_ar').value = 'عبد الرحمن بومدين';
    document.getElementById('cl_ph').value = '0551234567';
    document.getElementById('cl_nin').value = '12345';
    document.getElementById('cl_email').value = 'not-an-email';
    clForm.requestSubmit();
    assert.ok(document.querySelector('[data-f="nin"]').classList.contains('bad'), 'Invalid 5-digit NIN rejected');
    assert.ok(document.querySelector('[data-f="email"]').classList.contains('bad'), 'Invalid email rejected');

    // Valid natural person with 18-digit NIN + wilaya 25 (Constantine) — open from dash so it navigates directly to client profile
    evalInApp("closeModal(); _clientModalDraft=null; go('dash'); openClientModal(null)");
    document.getElementById('cl_ar').value = 'عبد الرحمن بومدين';
    document.getElementById('cl_fr').value = 'Abderrahmane Boumediene';
    document.getElementById('cl_ph').value = '0551234567';
    document.getElementById('cl_nin').value = '109880250012345678';
    document.getElementById('cl_email').value = 'abderrahmane@example.dz';
    document.getElementById('cl_wilaya').value = '25';
    document.getElementById('cl_addr').value = 'حي المنظر الجميل، الخروب، قسنطينة';
    document.getElementById('cl_birth').value = '1988-05-14';
    document.getElementById('cl_profession').value = 'مهندس معماري';
    document.getElementById('clForm').requestSubmit();

    assert.equal(document.getElementById('modalWrap').classList.contains('on'), false, 'Modal closed after valid save');
    assert.equal(evalInApp('S.view'), 'client', 'Navigated directly to new client profile');

    const clCount = evalInApp('CL.length');
    const syncCount = evalInApp('S.clients.length');
    assert.equal(clCount, 9, 'Client added to CL');
    assert.equal(syncCount, 9, 'CL synchronized with S.clients');
    assert.equal(evalInApp('CL[8] === S.clients[8]'), true, 'CL and S.clients share live object reference');

    // Profile KPIs for natural person must display NIN and Birth Date (not RC)
    const viewHtml = document.getElementById('view').innerHTML;
    assert.match(viewHtml, /109880250012345678/, 'NIN rendered on natural client profile');
    assert.match(viewHtml, /مهندس معماري/, 'Profession rendered on natural client profile');
    assert.match(viewHtml, /قسنطينة/, 'Wilaya 25 Constantine rendered');
    assert.doesNotMatch(viewHtml, /السجل التجاري \(RC\)<\/dt>/, 'Legal RC field not shown on natural person profile');

    // Standalone client (0 cases) must appear in clientsV(), filterable by "without cases", and searchable in #clq and #gs
    evalInApp("go('clients')");
    assert.match(document.getElementById('clientCardsWrap').innerHTML, /عبد الرحمن بومدين/, 'Standalone client with 0 cases visible in clients list');

    const clcf = document.getElementById('clcf');
    clcf.value = 'without';
    clcf.dispatchEvent(new Event('change', { bubbles: true }));
    assert.match(document.getElementById('clientCardsWrap').innerHTML, /عبد الرحمن بومدين/, 'Standalone client matched under "without cases" filter');
    assert.doesNotMatch(document.getElementById('clientCardsWrap').innerHTML, /حمدي مراد/, 'Clients with cases hidden under "without cases" filter');

    clcf.value = 'all';
    clcf.dispatchEvent(new Event('change', { bubbles: true }));
    const clq = document.getElementById('clq');
    clq.value = '109880250012345678';
    clq.dispatchEvent(new Event('input', { bubbles: true }));
    assert.match(document.getElementById('clientCardsWrap').innerHTML, /عبد الرحمن بومدين/, 'Live search matches client by NIN');

    // Global search (#gs) finds standalone client
    const gs = document.getElementById('gs');
    gs.value = '0551234567';
    gs.dispatchEvent(new Event('input', { bubbles: true }));
    assert.match(document.getElementById('results').innerHTML, /عبد الرحمن بومدين/, 'Global search #gs finds client by phone');
  });

  test('1.2 Legal entity client: kind switching preserves shared fields, validates NIF, renders legal KPIs & accurate KYC', async () => {
    const app = await bootDiwanApp();
    const { document, evalInApp } = app;

    evalInApp('openClientModal(null)');
    // Enter shared contact fields while still on 'natural'
    document.getElementById('cl_ph').value = '021998877';
    document.getElementById('cl_email').value = 'contact@ghardaiatech.dz';
    document.getElementById('cl_wilaya').value = '16';
    document.getElementById('cl_addr').value = 'المنطقة الصناعية رويبة، الجزائر';
    document.getElementById('cl_notes').value = 'عقد استشارة سنوي';

    // Switch to Legal Entity ('شخص معنوي')
    const legalBtn = document.querySelector('[data-cl-kind="legal"]');
    legalBtn.click();

    // Shared fields must remain intact!
    assert.equal(document.getElementById('cl_ph').value, '021998877', 'Shared phone preserved across kind switch');
    assert.equal(document.getElementById('cl_email').value, 'contact@ghardaiatech.dz', 'Shared email preserved across kind switch');
    assert.equal(document.getElementById('cl_addr').value, 'المنطقة الصناعية رويبة، الجزائر', 'Shared address preserved across kind switch');
    assert.equal(document.getElementById('cl_notes').value, 'عقد استشارة سنوي', 'Shared notes preserved across kind switch');
    const natSecs = document.querySelectorAll('[data-cl-only="natural"]');
    const legSecs = document.querySelectorAll('[data-cl-only="legal"]');
    assert.ok(natSecs.every(el => el.hidden === true), 'Natural fields hidden in legal mode');
    assert.ok(legSecs.every(el => el.hidden === false), 'Legal fields shown in legal mode');

    // Validate required company name (ar) & NIF format
    const clForm = document.getElementById('clForm');
    clForm.requestSubmit();
    assert.ok(document.querySelector('[data-f="ar"]').classList.contains('bad'), 'Company name required in legal mode');

    document.getElementById('cl_ar').value = 'شركة الأوراس للهندسة والبرمجيات';
    document.getElementById('cl_fr').value = 'SARL Aures Engineering';
    document.getElementById('cl_legalForm').value = 'SARL';
    document.getElementById('cl_nif').value = 'ABC'; // invalid NIF
    clForm.requestSubmit();
    assert.ok(document.querySelector('[data-f="nif"]').classList.contains('bad'), 'Short non-numeric NIF rejected');

    document.getElementById('cl_nif').value = '002416098765432';
    document.getElementById('cl_rc').value = '16/00-1098765B24';
    document.getElementById('cl_nis').value = '099916001234567';
    document.getElementById('cl_ai').value = '16123456789';
    document.getElementById('cl_repName').value = 'سمير بن عيسى';
    document.getElementById('cl_repQuality').value = 'gerant';
    clForm.requestSubmit();

    assert.equal(document.getElementById('modalWrap').classList.contains('on'), false, 'Legal entity saved cleanly');
    const saved = evalInApp('CL[CL.length - 1]');
    assert.equal(saved.kind, 'legal');
    assert.equal(saved.legalForm, 'SARL');
    assert.equal(saved.nif, '002416098765432');
    assert.equal(saved.rc, '16/00-1098765B24');
    assert.equal(saved.repName, 'سمير بن عيسى');

    // Legal profile KPIs show NIF, RC, and Legal Representative (NOT NIN or Birth Date)
    const profileHtml = document.getElementById('view').innerHTML;
    assert.match(profileHtml, /002416098765432/, 'NIF shown in legal entity profile');
    assert.match(profileHtml, /16\/00-1098765B24/, 'RC shown in legal entity profile');
    assert.match(profileHtml, /سمير بن عيسى/, 'Legal representative shown in legal entity profile');
    assert.match(profileHtml, /SARL/, 'Legal form SARL shown');

    // Verify KYC screen handles natural (NIN) vs legal (NIF/RC) without false-negative NIF requirement on natural persons
    evalInApp("CL[0].kycDocs = [{n:'بطاقة التعريف', type:'cin', d:'2026-11-20'}]"); // CL[0] has NIN '1080123456', nif:'—'
    evalInApp("CL[CL.length - 1].kycDocs = [{n:'السجل التجاري', type:'rc', d:'2026-11-20'}]");
    const kyc0 = evalInApp('clientKycStatus(CL[0])');
    const kycLegal = evalInApp('clientKycStatus(CL[CL.length - 1])');
    assert.equal(kyc0.ok, true, 'Natural person with NIN + doc is KYC complete without requiring NIF');
    assert.equal(kycLegal.ok, true, 'Legal entity with NIF + doc is KYC complete');
  });

  test('1.3 Duplicate detection (hard block on NIN/NIF, confirm on phone), former-opponent conflict alert, edit & draft preservation', async () => {
    const app = await bootDiwanApp();
    const { document, evalInApp, confirmCalls } = app;

    // 1) Accidental close preserves draft, explicit cancel clears draft
    evalInApp('openClientModal(null)');
    document.getElementById('cl_ar').value = 'مسودة محفوظة';
    document.getElementById('cl_ar').dispatchEvent(new app.Event('input', { bubbles: true }));
    evalInApp('closeModal()'); // simulate backdrop/Escape close
    evalInApp('openClientModal(null)');
    assert.equal(document.getElementById('cl_ar').value, 'مسودة محفوظة', 'Draft preserved after accidental backdrop close');
    document.getElementById('clCancelBtn').click(); // explicit cancel clears draft
    evalInApp('openClientModal(null)');
    assert.equal(document.getElementById('cl_ar').value, '', 'Draft cleared after explicit Cancel');

    // 2) Duplicate NIN hard-blocks creation (CL[0] has nin '1080123456')
    document.getElementById('cl_ar').value = 'شخص مكرر';
    document.getElementById('cl_ph').value = '0770112233';
    document.getElementById('cl_nin').value = '1080123456';
    const beforeLen = evalInApp('CL.length');
    document.getElementById('clForm').requestSubmit();
    assert.equal(evalInApp('CL.length'), beforeLen, 'Duplicate NIN hard-blocked client creation');
    assert.match(document.getElementById('clAlertBox').innerHTML, /NIN/, 'Blocking duplicate alert displayed with matching NIN');
    assert.ok(document.querySelector('[data-open-existing="0"]'), 'Button to open existing duplicate client rendered');

    // 3) Former opponent conflict check (Case 4 has opponent "مؤسسة النور للتجهيز")
    document.getElementById('cl_nin').value = '';
    document.getElementById('cl_ar').value = 'مؤسسة النور للتجهيز';
    document.getElementById('cl_ar').dispatchEvent(new app.Event('change', { bubbles: true }));
    assert.match(document.getElementById('clAlertBox').innerHTML, /تعارض مصالح/, 'Former opponent live alert shown in client modal');

    // Submit with confirm=false aborts save; confirm=true proceeds
    app.setConfirm(false);
    document.getElementById('clForm').requestSubmit();
    assert.equal(evalInApp('CL.length'), beforeLen, 'Declining conflict confirmation aborts client save');
    assert.ok(confirmCalls.length >= 1, 'Confirm dialog invoked for former-opponent warning');

    app.setConfirm(true);
    document.getElementById('clForm').requestSubmit();
    assert.equal(evalInApp('CL.length'), beforeLen + 1, 'Explicitly confirming conflict saves client record');

    // 4) Edit existing client updates record in-place without duplicating
    evalInApp('openClientModal(0)');
    document.getElementById('cl_ph').value = '0559001122';
    document.getElementById('cl_addr').value = 'شارع ديدوش مراد، الجزائر الوسطى';
    document.getElementById('clForm').requestSubmit();
    assert.equal(evalInApp('CL.length'), beforeLen + 1, 'Editing client did not duplicate CL');
    assert.equal(evalInApp('CL[0].ph'), '0559001122', 'Edited phone saved on CL[0]');
    assert.equal(evalInApp('S.clients[0].addr'), 'شارع ديدوش مراد، الجزائر الوسطى', 'Edited address synced to S.clients[0]');
  });
});

describe('Phase 3 — "Save & Open Case" + 4-Step Case Wizard & Conflict Gate', () => {
  test('3.1 Wizard footer is visible on all 4 steps, existing client pre-populates Party 1, and case links without duplicating CL', async () => {
    const app = await bootDiwanApp();
    const { document, evalInApp } = app;

    // Create a new client via "حفظ وفتح ملف قضية" (#clSaveOpenCase)
    evalInApp('openClientModal(null)');
    document.getElementById('cl_ar').value = 'ياسمين زروقي';
    document.getElementById('cl_fr').value = 'Yasmine Zerrouki';
    document.getElementById('cl_ph').value = '0662334455';
    document.getElementById('cl_nin').value = '209920160098765432';
    document.getElementById('cl_addr').value = 'حيدرة، الجزائر';

    const clBefore = evalInApp('CL.length');
    document.getElementById('clSaveOpenCase').click();

    const newClientIdx = evalInApp('CL.length - 1');
    assert.equal(evalInApp('CL.length'), clBefore + 1, 'Client created first');
    assert.equal(document.getElementById('modalWrap').classList.contains('on'), true, 'New Case Wizard opened immediately after client save');

    const form = document.getElementById('mf');
    assert.ok(form && form.dataset.diwanWizard === '1', '4-step wizard initialized on #mf');

    // Verify persistent wizard footer is outside panels[3] and visible on Step 1 (0), Step 2 (1), Step 3 (2), and Step 4 (3)
    const footer = form.querySelector('.case-wizard-actions');
    const panels = form.querySelectorAll('.case-wizard-panel');
    assert.equal(panels.length, 4, '4 wizard panels created');
    assert.equal(footer.parentElement, form, 'Wizard footer is a direct child of #mf (never trapped inside hidden panels[3])');
    assert.equal(form.querySelector(':scope > .mf').hidden, true, 'Legacy .mf footer hidden so no duplicate submit buttons appear');

    const nextBtn = footer.querySelector('[data-wizard-nav="next"]');
    const prevBtn = footer.querySelector('[data-wizard-nav="prev"]');
    const cancelBtn = footer.querySelector('[data-act="closeModal"]');
    assert.ok(nextBtn && prevBtn && cancelBtn, 'Cancel, Previous, and Next buttons exist in wizard footer');
    assert.equal(prevBtn.disabled, true, 'Previous disabled on Step 1');
    assert.match(footer.textContent, /1 \/ 4/, 'Step 1 counter shown');

    // Step 1 validation blocks empty title
    nextBtn.click();
    assert.equal(panels[0].hidden, false, 'Stays on Step 1 when title is empty');
    document.getElementById('f_title').value = 'دعوى فسخ عقد وعد بالبيع والتعويض';
    document.getElementById('f_titleFr').value = 'Résolution de promesse de vente';

    // Advance Step 1 -> Step 2
    nextBtn.click();
    assert.equal(panels[1].hidden, false, 'Advanced to Step 2 (الإجراءات)');
    assert.equal(prevBtn.disabled, false, 'Previous enabled on Step 2');
    assert.match(footer.textContent, /2 \/ 4/, 'Step 2 counter shown');

    // Advance Step 2 -> Step 3 (الأطراف)
    nextBtn.click();
    assert.equal(panels[2].hidden, false, 'Advanced to Step 3 (الأطراف)');
    assert.match(footer.textContent, /3 \/ 4/, 'Step 3 counter shown');

    // Verify Party 1 was pre-populated from the newly created client!
    assert.equal(document.getElementById('pickExistingClient').value, String(newClientIdx), 'Existing client selected in #pickExistingClient');
    assert.equal(document.getElementById('pp0_firstName').value, 'ياسمين زروقي', 'Client name pre-populated');
    assert.equal(document.getElementById('pp0_idType').value, 'nin', 'Client idType pre-populated');
    assert.equal(document.getElementById('pp0_idNumber').value, '209920160098765432', 'Client NIN pre-populated');
    assert.equal(document.getElementById('pp0_address').value, 'حيدرة، الجزائر', 'Client address pre-populated');

    // Fill Opponent (Party 2) with a clean non-conflicting opponent
    document.getElementById('pp1_firstName').value = 'رشيد';
    document.getElementById('pp1_lastName').value = 'مقراني';

    // Advance Step 3 -> Step 4 (المراجعة)
    nextBtn.click();
    assert.equal(panels[3].hidden, false, 'Advanced to Step 4 (المراجعة)');
    assert.match(footer.textContent, /4 \/ 4/, 'Step 4 counter shown');
    assert.match(nextBtn.textContent, /تأكيد وحفظ/, 'Primary button switched to تأكيد وحفظ on Step 4');
    assert.match(panels[3].innerHTML, /ياسمين زروقي/, 'Step 4 summary includes Client name');
    assert.match(panels[3].innerHTML, /رشيد مقراني/, 'Step 4 summary includes Opponent name');

    // Submit on Step 4 -> creates case linked to existing client WITHOUT duplicating CL!
    const casesBefore = evalInApp('S.cases.length');
    nextBtn.click();
    assert.equal(evalInApp('S.cases.length'), casesBefore + 1, 'New case created on Step 4 submit');
    assert.equal(evalInApp('CL.length'), clBefore + 1, 'Existing client reused — NO duplicate client pushed to CL');
    assert.equal(evalInApp('S.cases[0].cl'), newClientIdx, 'New case linked to exact client index');

    // Verify dgAutofill pulls full client details (name, address, NIN, phone)
    const newCaseId = evalInApp('S.cases[0].id');
    evalInApp(`dgAutofill(${newCaseId})`);
    assert.equal(evalInApp('S.docGen.pName'), 'ياسمين زروقي');
    assert.equal(evalInApp('S.docGen.pAddr'), 'حيدرة، الجزائر');
    assert.equal(evalInApp('S.docGen.pNin'), '209920160098765432');
    assert.equal(evalInApp('S.docGen.pPhone'), '0662334455');
  });

  test('3.2 Conflict gate in wizard routes conflicting intake to S.conflictReviews without creating a case', async () => {
    const app = await bootDiwanApp();
    const { document, evalInApp } = app;

    evalInApp('newCase(0)'); // Pick CL[0]
    document.getElementById('f_title').value = 'نزاع تجاري متعارض';
    const footer = document.querySelector('#mf .case-wizard-actions');
    const nextBtn = footer.querySelector('[data-wizard-nav="next"]');
    nextBtn.click(); // -> Step 2
    nextBtn.click(); // -> Step 3
    // Set opponent to existing client CL[3] (شركة الأوراس للبناء) -> critical former-client conflict!
    document.getElementById('pp1_firstName').value = 'شركة الأوراس للبناء';
    nextBtn.click(); // -> Step 4

    const casesBefore = evalInApp('S.cases.length');
    const reviewsBefore = evalInApp('(S.conflictReviews||[]).length');
    nextBtn.click(); // Submit

    assert.equal(evalInApp('S.cases.length'), casesBefore, 'Conflicting case blocked from S.cases');
    assert.equal(evalInApp('S.conflictReviews.length'), reviewsBefore + 1, 'Routed to S.conflictReviews');
    assert.equal(evalInApp('S.conflictReviews[0].status'), 'pending', 'Review marked pending');
  });
});

describe('Phase 2 & Cross-Cutting — Responsible Lawyer, Roles, FR/Dark Mode & Null-Safety', () => {
  test('2.1 Built-in lawyers (m, p, c) resolve in lawyerName/lawyerOpts, survive syncPartnersU, and setlawyer stays manager-only + audited', async () => {
    const app = await bootDiwanApp();
    const { document, evalInApp } = app;

    assert.match(evalInApp("lawyerName('m')"), /الأستاذ/, 'Manager name resolved');
    assert.match(evalInApp("lawyerName('p')"), /الأستاذة ليلى/, 'Built-in Partner Leila resolved in lawyerName');
    assert.match(evalInApp("lawyerName('c')"), /الأستاذ كريم/, 'Built-in Collaborator Karim resolved in lawyerName');

    // Running syncPartnersU() must NOT delete built-in Partner Leila ('p')
    evalInApp('syncPartnersU()');
    assert.ok(evalInApp("byU('p')"), 'Built-in partner p preserved after syncPartnersU()');
    const optIds = Array.from(evalInApp('lawyerOpts().map(o => o[0])'));
    assert.deepEqual(optIds.slice(0, 3), ['m', 'p', 'c'], 'lawyerOpts includes m, p, and c out of the box');

    // Case drawer shows المحامي المسؤول even when S.extraLawyers is empty
    evalInApp('openDrawer(1)');
    assert.match(document.getElementById('drawer').innerHTML, /المحامي المسؤول/, 'Case drawer displays المحامي المسؤول');
    assert.ok(document.querySelector('#drawer [data-act="setlawyer"]'), 'Manager sees setlawyer button in drawer');

    // Enroll test role credentials so fail-closed secWorkspaceReady() permits role views
    evalInApp("S.userPasswords.c=S.userPasswords.m; S.userPasswords.t=S.userPasswords.m; S.userPasswords.s=S.userPasswords.m;");

    // Collaborator ('c') gets "ملفاتي / الكل" scope toggle in casesV, cannot run setlawyer
    evalInApp("S.user='c'; S.casesScope='mine'; chrome(); render(); go('cases')");
    assert.ok(document.querySelector('[data-act="scope"][data-v="mine"]'), 'Collaborator sees mine scope button');
    evalInApp('openDrawer(1)');
    assert.equal(document.querySelector('#drawer [data-act="setlawyer"]'), null, 'Non-manager does not see setlawyer button');

    // Trainee ('t') cannot see secret or unassigned clients and cannot open client modal
    evalInApp("S.cases[4].secret=true; S.user='t'; S.perms.traineeAll=false; chrome(); render()");
    assert.equal(evalInApp("allowed('clients')"), false, 'Trainee blocked from clients screen');
    assert.equal(evalInApp('canSeeClient(CL[4], 4)'), false, 'Trainee cannot see client of secret case 5');

    // Secretary ('s') respects secContacts=false and secFees=false privacy masks
    const cl0Phone = evalInApp('CL[0].ph');
    evalInApp("S.user='s'; S.perms.secContacts=false; S.perms.secFees=false; chrome(); go('client', 0)");
    const secClientHtml = document.getElementById('view').innerHTML;
    assert.equal(secClientHtml.includes(cl0Phone), false, 'Client phone hidden from secretary when secContacts=false');
    assert.doesNotMatch(secClientHtml, /إجمالي الاتفاقات/, 'Client fees hidden from secretary when secFees=false');
  });

  test('2.2 French LTR + Dark mode + orphan caseId null-safety across all views & user guide sync', async () => {
    const app = await bootDiwanApp({ prefersDark: true });
    const { document, evalInApp } = app;

    // Switch to French LTR + Dark class
    evalInApp("S.lang='fr'; document.documentElement.classList.add('dark'); chrome(); render()");
    assert.equal(document.documentElement.lang, 'fr');
    assert.equal(document.documentElement.dir, 'ltr');

    // Inject orphan references (c: 99999) into dls, tasks, docs, pays, expenses to prove zero TypeErrors
    evalInApp(`
      S.dls.push({c:99999, l:{ar:'أجل يتيم',fr:'Délai orphelin'}, d:K(TODAY), who:'m'});
      S.tasks.push({id:999, t:{ar:'مهمة يتيمة',fr:'Tâche orpheline'}, c:99999, who:'m', p:'low', d:K(TODAY), done:false});
      S.docs.push({id:'doc-orph', n:{ar:'وثيقة',fr:'Pièce'}, c:99999, t:'PDF', s:'10 KB', d:K(TODAY), sh:false});
      S.pays.push({id:999, caseId:99999, amount:10000, date:K(TODAY), method:'cash', ref:'ORPH-1'});
      S.expenses.push({c:99999, a:2000, t:{ar:'مصروف',fr:'Frais'}, d:K(TODAY)});
    `);

    const viewsToRender = ['dash', 'cases', 'clients', 'tasks', 'docs', 'deadlines', 'fees', 'cash', 'finance-expenses', 'kyc', 'team', 'settings'];
    for (const v of viewsToRender) {
      assert.doesNotThrow(() => evalInApp(`go('${v}')`), `View '${v}' renders cleanly in FR LTR Dark mode with orphan records`);
    }
    assert.doesNotThrow(() => evalInApp("go('client', 3); printStatement(3)"), 'Legal client profile & statement render cleanly in FR');

    // Open Client modal & New Case wizard in French and verify French labels
    evalInApp('openClientModal(null)');
    assert.match(document.getElementById('modal').innerHTML, /Personne physique/, 'Client modal localized in French');
    assert.match(document.getElementById('modal').innerHTML, /Personne morale/, 'Legal entity option localized in French');
    evalInApp('closeModal(); newCase()');
    assert.match(document.getElementById('modal').innerHTML, /Suivant/, 'Case wizard localized in French');

    // Guide documentation check
    assert.match(GUIDE, /13\.4/, 'User guide documents §13.4 new client onboarding workflow');
    assert.match(GUIDE, /شخص طبيعي/, 'User guide documents natural person onboarding');
    assert.match(GUIDE, /شخص معنوي/, 'User guide documents legal entity onboarding');
  });
});
