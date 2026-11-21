/* DIWAN-CASE-STAGES — Isolated automated verification suite for:
 *  1. One client with two independent cases remaining strictly separate.
 *  2. First-instance + appeal + cassation linked to a single mother case (`rootCaseId` + `parentId`)
 *     with explicit court choice, distinct stage numbers, and drawer stage navigation.
 *  3. Subsequent stage creation NOT copying sessions, judgment, notes, hours, notifications, fees, or payments.
 *  4. Original stage data and all financial/dependent records remaining completely unchanged.
 *  5. Global search (`#gs`) and cases filter (`#fq`) matching client name, Diwan/file numbers,
 *     stage numbers, `roleNumber`, and `platformCaseNo`, surfacing linked stages of the matched
 *     mother case without pulling in independent cases of the same client.
 *  6. Legacy case records (without `rootCaseId`, or with legacy string IDs) and manual `linked`
 *     cross-case links remaining 100% compatible and preserved.
 *  7. Save + reload (`snapV7` -> `normStore` -> `applyStore`) preserving links and preventing duplicates.
 *
 * Zero external dependencies — runs in isolated in-memory storage with:
 *   node --test diwan-case-stages.test.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractInlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

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
  function notifyMutation(rec) {
    if (!observers.length) return;
    observers.forEach(obs => { if (obs._active) obs._cb([rec]); });
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
      this._rect = { top: 140, bottom: 182, left: 40, right: 340, width: 300, height: 42 };
      const props = Object.create(null);
      this.style = {
        set cssText(v) { this._css = String(v || ''); },
        get cssText() { return this._css || ''; },
        display: '',
        setProperty(k, v) { props[k] = String(v); },
        getPropertyValue(k) { return props[k] || ''; }
      };
      this.classList = new ClassList(this);
      this._value = undefined;
      this._checked = undefined;
      this._selectedIndex = -1;
      this._hidden = false;
      this.disabled = false;
      this.multiple = false;
      this.inert = false;
      this.scrollTop = 0;
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
    getBoundingClientRect() { return { ...this._rect }; }
    scrollIntoView() {}
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
      const elNodes = parsed.filter(n => n.nodeType === 1);
      if (elNodes.length || this.tagName === 'SELECT') {
        notifyMutation({ type: 'childList', target: this, addedNodes: elNodes });
      }
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
      if (key === 'disabled') {
        this.disabled = true;
        notifyMutation({ type: 'attributes', attributeName: 'disabled', target: this, addedNodes: [] });
      }
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
      if (key === 'disabled') {
        this.disabled = false;
        notifyMutation({ type: 'attributes', attributeName: 'disabled', target: this, addedNodes: [] });
      }
      if (key === 'hidden') this._hidden = false;
    }
    appendChild(child) {
      if (!child) return child;
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      if (child.nodeType === 1) notifyMutation({ type: 'childList', target: this, addedNodes: [child] });
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
      if (newNode.nodeType === 1) notifyMutation({ type: 'childList', target: this, addedNodes: [newNode] });
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
    focus() { doc.activeElement = this; }
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body; }
    click() {
      if (this.disabled) return;
      if (this.tagName === 'INPUT' && this.type === 'checkbox') this.checked = !this.checked;
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

  const consoleErrors = [];
  const consoleWarns = [];
  const customConsole = {
    log() {},
    info() {},
    warn(...args) { consoleWarns.push(args.map(String).join(' ')); },
    error(...args) { consoleErrors.push(args.map(String).join(' ')); }
  };

  const sandbox = {
    console: customConsole,
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
    innerHeight: 800,
    innerWidth: 1280,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    document,
    Event,
    MutationObserver,
    localStorage,
    navigator: { onLine: true, clipboard: { writeText: () => Promise.resolve() } },
    location: { protocol: 'https:', hostname: 'localhost', href: 'https://localhost/' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    confirm: () => true,
    prompt: () => '',
    alert: () => {},
    print: () => {},
    scrollTo: () => {},
    screen: { width: 1440, height: 900 },
    addEventListener() {},
    removeEventListener() {},
    open() { return { document: { open() {}, write() {}, close() {} }, focus() {}, print() {}, close() {} }; },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    Blob: class MockBlob { constructor(parts, o) { this.parts = parts; this.type = o && o.type; } },
    setTimeout() { return 1; },
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

  const lk1 = document.getElementById('lkP1');
  const lk2 = document.getElementById('lkP2');
  const lkForm = document.getElementById('lkForm');
  assert.ok(lk1 && lk2 && lkForm, 'First-run password setup overlay rendered');
  lk1.value = 'DiwanPass2026';
  lk2.value = 'DiwanPass2026';
  lkForm.requestSubmit();
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 25));
    if (!document.getElementById('lockOv') && vm.runInContext('!!(_SEC && _SEC.ready)', sandbox)) break;
  }
  assert.equal(document.getElementById('lockOv'), null, 'Lock overlay removed after setup');

  return {
    sandbox,
    document,
    Event,
    store,
    consoleErrors,
    consoleWarns,
    evalInApp(expr) { return vm.runInContext(expr, sandbox); }
  };
}

describe('Diwan — Case Identity, Litigation Stages & Judicial Search', () => {
  test('1. One client with two independent cases keeps distinct rootCaseId and never merges them', async () => {
    const app = await bootDiwanApp();
    app.evalInApp(`
      S.cases = [];
      CL.length = 0;
      S.clients = [];
      S.nextId = 200;
      var client = { id: 1, kind: 'natural', ar: 'سمير بوعلام', fr: 'Samir Boualem', ph: '0551122334', nif: '—', nin: '198501010011223344' };
      CL.push(client);
      S.clients.push(client);
      createIntakeCase(
        { no: '2026/00101', title: 'نزاع إيجار محل تجاري', titleFr: 'Bail commercial', type: 'commercial', court: '1', who: 's', lawyerId: 'm', poa: true, ja: false },
        [mkParty('client', 'سمير بوعلام'), mkParty('opponent', 'شركة الأمل')],
        { reasons: [] },
        false
      );
      createIntakeCase(
        { no: '2026/00202', title: 'قسمة تركة عقارية', titleFr: 'Partage successoral', type: 'family', court: '0', who: 's', lawyerId: 'm', poa: true, ja: false },
        [mkParty('client', 'سمير بوعلام'), mkParty('opponent', 'ورثة بوعلام')],
        { reasons: [] },
        false
      );
    `);

    const snapshot = JSON.parse(app.evalInApp(`JSON.stringify({
      count: S.cases.length,
      c1: S.cases.find(c => c.no === '2026/00101'),
      c2: S.cases.find(c => c.no === '2026/00202'),
      stages1: matterStagesOf(S.cases.find(c => c.no === '2026/00101')).map(x => x.no),
      stages2: matterStagesOf(S.cases.find(c => c.no === '2026/00202')).map(x => x.no)
    })`));

    assert.equal(snapshot.count, 2);
    assert.equal(snapshot.c1.cl, snapshot.c2.cl, 'Both cases belong to the same client');
    assert.equal(snapshot.c1.rootCaseId, snapshot.c1.id, 'First case is its own rootCaseId');
    assert.equal(snapshot.c2.rootCaseId, snapshot.c2.id, 'Second independent case has its own distinct rootCaseId');
    assert.notEqual(snapshot.c1.rootCaseId, snapshot.c2.rootCaseId, 'Independent cases of the same client never share rootCaseId');
    assert.deepEqual(snapshot.stages1, ['2026/00101']);
    assert.deepEqual(snapshot.stages2, ['2026/00202']);
    assert.deepEqual(app.consoleErrors, []);
  });

  test('2. UI drawer subsequent-stage creation links first-instance -> appeal -> cassation to one mother case and enforces court & unique number', async () => {
    const app = await bootDiwanApp();
    const { document } = app;

    app.evalInApp(`
      S.cases = [];
      CL.length = 0;
      S.clients = [];
      S.nextId = 300;
      var cl = { id: 1, kind: 'natural', ar: 'نادية بن يحيى', fr: 'Nadia Benyahia', ph: '0661223344', nif: '—' };
      CL.push(cl);
      S.clients.push(cl);
      createIntakeCase(
        { no: '2026/00301', title: 'فسخ عقد توريد', titleFr: 'Résiliation fourniture', type: 'commercial', court: '0', who: 's', lawyerId: 'm', poa: true, ja: false, roleNumber: 'R-110/26' },
        [mkParty('client', 'نادية بن يحيى'), mkParty('opponent', 'مؤسسة الهضاب')],
        { reasons: [] },
        false
      );
      S.cases[0].stage = 1; // الدرجة الأولى
    `);

    const firstId = app.evalInApp('S.cases[0].id');
    app.evalInApp(`openDrawer(${firstId})`);

    const nextStageBtn = document.querySelector('#drawer [data-act="casefromfirst"]');
    assert.ok(nextStageBtn, 'Case drawer exposes subsequent-stage creation button');
    nextStageBtn.click();

    assert.ok(document.getElementById('modalWrap').classList.contains('on'), 'Next-stage modal opens');
    const stageSel = document.getElementById('f_stage');
    const courtSel = document.getElementById('f_court');
    const lawyerSel = document.getElementById('f_lawyerId');
    const noInp = document.getElementById('f_no');
    const roleInp = document.getElementById('f_roleNumber');
    const platInp = document.getElementById('f_platformCaseNo');
    assert.equal(noInp.getAttribute('dir'), 'ltr', '#f_no uses explicit dir="ltr"');
    assert.equal(roleInp.getAttribute('dir'), 'ltr', '#f_roleNumber uses explicit dir="ltr"');
    assert.equal(platInp.getAttribute('dir'), 'ltr', '#f_platformCaseNo uses explicit dir="ltr"');
    assert.ok(stageSel.classList.contains('native-select-backed') && stageSel.closest('.select-enhanced'), '#f_stage enhanced by DiwanSelect');
    assert.ok(courtSel.classList.contains('native-select-backed') && courtSel.closest('.select-enhanced'), '#f_court enhanced by DiwanSelect');
    assert.ok(lawyerSel.classList.contains('native-select-backed') && lawyerSel.closest('.select-enhanced'), '#f_lawyerId enhanced by DiwanSelect');
    assert.equal(stageSel.value, '2', 'Defaults stage suggestion to Appeal (stage 2) from First Instance');
    assert.equal(courtSel.value, '', 'Court is NOT guessed — user must explicitly choose judicial authority');

    // Attempt submit without choosing court and while reusing the origin case number -> must reject both
    noInp.value = '2026/00301';
    document.getElementById('mf').requestSubmit();
    assert.equal(app.evalInApp('S.cases.length'), 1, 'Submission blocked when court is empty / number duplicates origin');
    assert.ok(document.querySelector('[data-f="court"]').classList.contains('bad'), 'Court field marked invalid when unselected');
    assert.ok(document.querySelector('[data-f="no"]').classList.contains('bad'), 'Number field rejects reusing origin stage number');

    // Choose explicit court (مجلس قضاء قسنطينة = index 6) and distinct appeal number
    courtSel.value = '6';
    noInp.value = '2026/01950';
    document.getElementById('f_roleNumber').value = 'APP-77/26';
    document.getElementById('f_platformCaseNo').value = 'PLAT-APP-1950';
    document.getElementById('mf').requestSubmit();

    const appealId = app.evalInApp(`(S.cases.find(c => c.no === '2026/01950') || {}).id`);
    assert.equal(typeof appealId, 'number', 'Appeal stage gets a valid numeric ID');

    // Now create Cassation from the Appeal stage via the drawer button
    const nextFromAppealBtn = document.querySelector('#drawer [data-act="casefromfirst"]');
    assert.ok(nextFromAppealBtn, 'Appeal drawer also exposes subsequent-stage button');
    nextFromAppealBtn.click();

    assert.equal(document.getElementById('f_stage').value, '3', 'Defaults stage suggestion to Cassation/Execution from Appeal');
    assert.equal(document.getElementById('f_court').value, '', 'Supreme jurisdiction is NOT guessed');
    document.getElementById('f_court').value = '9'; // المحكمة العليا — الجزائر
    document.getElementById('f_no').value = '2026/09910';
    document.getElementById('f_roleNumber').value = 'CASS-04/26';
    document.getElementById('mf').requestSubmit();

    const chainInfo = JSON.parse(app.evalInApp(`JSON.stringify((function(){
      var first = S.cases.find(c => c.no === '2026/00301');
      var appeal = S.cases.find(c => c.no === '2026/01950');
      var cass = S.cases.find(c => c.no === '2026/09910');
      return {
        first: { id: first.id, rootCaseId: first.rootCaseId, parentId: first.parentId, stage: first.stage, court: first.court.ar },
        appeal: { id: appeal.id, rootCaseId: appeal.rootCaseId, parentId: appeal.parentId, stage: appeal.stage, court: appeal.court.ar },
        cass: { id: cass.id, rootCaseId: cass.rootCaseId, parentId: cass.parentId, stage: cass.stage, court: cass.court.ar },
        stagesFromFirst: matterStagesOf(first).map(x => ({ id: x.id, no: x.no, stage: x.stage }))
      };
    })())`));

    assert.equal(chainInfo.first.rootCaseId, chainInfo.first.id);
    assert.equal(chainInfo.appeal.rootCaseId, chainInfo.first.id, 'Appeal links to mother rootCaseId');
    assert.equal(chainInfo.appeal.parentId, chainInfo.first.id, 'Appeal parentId points to first-instance');
    assert.equal(chainInfo.cass.rootCaseId, chainInfo.first.id, 'Cassation inherits the SAME mother rootCaseId');
    assert.equal(chainInfo.cass.parentId, chainInfo.appeal.id, 'Cassation parentId points to direct parent (Appeal)');
    assert.equal(chainInfo.appeal.court, app.evalInApp('COURTS[6].ar'));
    assert.equal(chainInfo.cass.court, app.evalInApp('COURTS[9].ar'));
    assert.deepEqual(chainInfo.stagesFromFirst.map(s => s.no), ['2026/00301', '2026/01950', '2026/09910']);

    // Verify drawer stages block displays all 3 stages and clicking opens target stage
    const stagesBox = document.querySelector('#drawer [data-matter-stages]');
    assert.ok(stagesBox, 'Drawer renders mother-case stages panel');
    assert.match(stagesBox.textContent, /2026\/00301/);
    assert.match(stagesBox.textContent, /2026\/01950/);
    assert.match(stagesBox.textContent, /2026\/09910/);

    const openFirstBtn = stagesBox.querySelector(`[data-act="case"][data-id="${firstId}"]`);
    assert.ok(openFirstBtn, 'Drawer provides button to open sibling stage');
    openFirstBtn.click();
    assert.match(document.querySelector('#drawer .sub').textContent, /2026\/00301/, 'Clicking stage in drawer navigates to that stage');
    assert.deepEqual(app.consoleErrors, []);
  });

  test('3. Subsequent stage creation does NOT copy sessions, judgment, notes, hours, notifications, fees, or payments', async () => {
    const app = await bootDiwanApp();

    const a = JSON.parse(app.evalInApp(`JSON.stringify((function(){
      var orig = S.cases[0];
      orig.rootCaseId = orig.id;
      orig.parentId = null;
      orig.stage = 1;
      orig.fee = [250000, 100000];
      orig.judg = { ar: 'الحكم بإلزام المدعى عليه بدفع التعويض', fr: 'Condamnation aux dommages' };
      orig.notes = [{ w: 'm', t: { ar: 'ملاحظة خاصة بالدرجة الأولى', fr: 'Note 1re instance' }, d: '2026-10-01' }];
      orig.sessions = [{ date: '2026-10-10', kind: 'جلسة مرافعة', out: 'وضع القضية في المداولة', next: null }];
      orig.hours = 14.5;
      orig.notif = '2026-11-01';
      orig.signifStatus = 'done';
      orig.signifDate = '2026-11-01';
      orig.huissierName = 'الأستاذ بوزيد';
      orig.judgeName = 'القاضي بن سالم';
      orig.roleNumber = 'R-FIRST-01';

      S.pays = [{ id: 1, c: orig.id, a: 100000, d: '2026-10-05', m: 'cash' }];
      S.expenses = [{ id: 1, c: orig.id, a: 4500, d: '2026-10-06', t: { ar: 'مصاريف خبرة', fr: 'Expertise' } }];
      S.invoices = [{ id: 1, no: 'INV-2026-001', caseId: orig.id, date: '2026-10-05', method: 'cash', paid: true, withTVA: false, withTimbre: false, items: [{ desc: { ar: 'دفعة أولى', fr: 'Acompte' }, qty: 1, price: 100000 }] }];
      S.docs = [{ id: 1, c: orig.id, t: 'PDF', n: { ar: 'عريضة افتتاح دعوى', fr: 'Requête' }, s: '120 KB', sh: true }];
      S.dls = [{ c: orig.id, l: { ar: 'أجل استئناف', fr: 'Délai appel' }, d: '2026-12-01', who: 'm' }];
      S.tasks = [{ id: 1, c: orig.id, t: { ar: 'سحب نسخة الحكم', fr: 'Retirer jugement' }, d: '2026-11-25', p: 'high', who: 's', done: false }];

      var appeal = createNextStageCase(orig.id, {
        stage: '2',
        court: '6',
        no: '2026/APP-8800',
        roleNumber: 'R-APP-88',
        platformCaseNo: 'P-APP-8800',
        lawyerId: orig.lawyerId || 'm'
      });

      return {
        origId: orig.id,
        rootCaseId: appeal.rootCaseId,
        parentId: appeal.parentId,
        partiesLen: appeal.parties.length,
        fee: appeal.fee,
        paidAppeal: paidOf(appeal.id),
        dueAppeal: dueOf(appeal),
        sessionsLen: appeal.sessions.length,
        judg: appeal.judg,
        notesLen: appeal.notes.length,
        hours: appeal.hours,
        notif: appeal.notif,
        signifStatus: appeal.signifStatus,
        signifDate: appeal.signifDate,
        huissierName: appeal.huissierName,
        judgeName: appeal.judgeName,
        paysForAppeal: S.pays.filter(p => p.c === appeal.id).length,
        docsForAppeal: S.docs.filter(d => d.c === appeal.id).length,
        invsForAppeal: S.invoices.filter(i => i.caseId === appeal.id).length
      };
    })())`));

    assert.equal(a.rootCaseId, a.origId);
    assert.equal(a.parentId, a.origId);
    assert.ok(a.partiesLen > 0, 'Parties transferred cleanly');
    assert.deepEqual(a.fee, [0, 0], 'Appeal fee starts at [0, 0]');
    assert.equal(a.paidAppeal, 0, 'Appeal has zero copied payments');
    assert.equal(a.dueAppeal, 0, 'Appeal has zero copied due balance');
    assert.equal(a.sessionsLen, 0, 'Appeal has zero copied sessions');
    assert.equal(a.judg, null, 'Appeal has no copied judgment');
    assert.equal(a.notesLen, 0, 'Appeal starts with empty notes');
    assert.equal(a.hours, 0, 'Appeal hours start at 0');
    assert.equal(a.notif, null, 'Appeal notif is null');
    assert.equal(a.signifStatus, '', 'Appeal signifStatus is empty');
    assert.equal(a.signifDate, null, 'Appeal signifDate is null');
    assert.equal(a.huissierName, '', 'Appeal huissierName is empty');
    assert.equal(a.judgeName, '', 'Appeal judgeName is empty');
    assert.equal(a.paysForAppeal, 0);
    assert.equal(a.docsForAppeal, 0);
    assert.equal(a.invsForAppeal, 0);
  });

  test('4. Original stage data and all financial/dependent records remain 100% unchanged after creating subsequent stages', async () => {
    const app = await bootDiwanApp();

    const result = JSON.parse(app.evalInApp(`JSON.stringify((function(){
      var orig = S.cases[0];
      orig.rootCaseId = orig.id;
      orig.parentId = null;
      orig.stage = 1;
      orig.fee = [250000, 100000];
      orig.judg = { ar: 'الحكم بإلزام المدعى عليه بدفع التعويض', fr: 'Condamnation aux dommages' };
      orig.notes = [{ w: 'm', t: { ar: 'ملاحظة خاصة بالدرجة الأولى', fr: 'Note 1re instance' }, d: '2026-10-01' }];
      orig.sessions = [{ date: '2026-10-10', kind: 'جلسة مرافعة', out: 'وضع القضية في المداولة', next: null }];
      orig.hours = 14.5;
      orig.notif = '2026-11-01';
      orig.linked = [S.cases[1].id];

      S.pays = [{ id: 1, c: orig.id, a: 100000, d: '2026-10-05', m: 'cash' }];
      S.expenses = [{ id: 1, c: orig.id, a: 4500, d: '2026-10-06', t: { ar: 'مصاريف خبرة', fr: 'Expertise' } }];
      S.invoices = [{ id: 1, no: 'INV-2026-001', caseId: orig.id, date: '2026-10-05', method: 'cash', paid: true, withTVA: false, withTimbre: false, items: [{ desc: { ar: 'دفعة أولى', fr: 'Acompte' }, qty: 1, price: 100000 }] }];
      S.docs = [{ id: 1, c: orig.id, t: 'PDF', n: { ar: 'عريضة افتتاح دعوى', fr: 'Requête' }, s: '120 KB', sh: true }];
      S.dls = [{ c: orig.id, l: { ar: 'أجل استئناف', fr: 'Délai appel' }, d: '2026-12-01', who: 'm' }];
      S.tasks = [{ id: 1, c: orig.id, t: { ar: 'سحب نسخة الحكم', fr: 'Retirer jugement' }, d: '2026-11-25', p: 'high', who: 's', done: false }];

      var beforeOrigSnap = JSON.stringify(orig);
      var beforeFinSnap = JSON.stringify({
        paidOrig: paidOf(orig.id),
        dueOrig: dueOf(orig),
        pays: S.pays,
        expenses: S.expenses,
        invoices: S.invoices,
        docs: S.docs,
        dls: S.dls,
        tasks: S.tasks
      });

      var appeal = createNextStageCase(orig.id, {
        stage: '2',
        court: '6',
        no: '2026/APP-8800',
        lawyerId: orig.lawyerId || 'm'
      });
      appeal.notes.push({ w: 'm', t: { ar: 'ملاحظة استئناف', fr: 'Note appel' }, d: '2026-11-21' });
      if (appeal.parties[0]) appeal.parties[0].address = { ar: 'عنوان معدل في الاستئناف', fr: 'Adresse modifiée' };

      return {
        beforeOrigSnap,
        afterOrigSnap: JSON.stringify(orig),
        beforeFinSnap,
        afterFinSnap: JSON.stringify({
          paidOrig: paidOf(orig.id),
          dueOrig: dueOf(orig),
          pays: S.pays,
          expenses: S.expenses,
          invoices: S.invoices,
          docs: S.docs,
          dls: S.dls,
          tasks: S.tasks
        })
      };
    })())`));

    assert.equal(result.afterOrigSnap, result.beforeOrigSnap, 'Original stage object is 100% byte-for-byte unchanged');
    assert.equal(result.afterFinSnap, result.beforeFinSnap, 'Original stage financial & dependent records are 100% unchanged');
  });

  test('5. Search (#gs and #fq) finds cases by client, Diwan/stage no, roleNumber, and platformCaseNo, surfacing sibling stages without mixing independent client cases', async () => {
    const app = await bootDiwanApp();
    const { document, Event } = app;

    app.evalInApp(`
      S.cases = [];
      CL.length = 0;
      S.clients = [];
      S.nextId = 500;
      var cl = { id: 1, kind: 'natural', ar: 'كريم زروقي', fr: 'Karim Zerrouki', ph: '0559001122', nif: '—' };
      CL.push(cl);
      S.clients.push(cl);

      // Matter A: First instance + Appeal
      createIntakeCase(
        { no: 'DW-2026-501', title: 'منازعة صفقة عمومية', titleFr: 'Marché public', type: 'admin', court: '3', who: 's', lawyerId: 'm', poa: true, ja: false, roleNumber: 'ROLE-ADM-19' },
        [mkParty('client', 'كريم زروقي'), mkParty('opponent', 'بلدية الخروب')],
        { reasons: [] },
        false
      );
      var mA1 = S.cases[0];
      mA1.diwanNo = 'DIWAN-M501';
      mA1.platformCaseNo = 'PLAT-FIRST-501';
      mA1.stage = 1;

      var mA2 = createNextStageCase(mA1.id, {
        stage: '2',
        court: '10', // مجلس الدولة
        no: 'CE-2026-880',
        roleNumber: 'ROLE-CE-774',
        platformCaseNo: 'PLAT-CE-880',
        lawyerId: 'm'
      });

      // Matter B: Independent case for the EXACT SAME client كريم زروقي
      createIntakeCase(
        { no: 'DW-2026-999', title: 'دعوى تعويض عن حادث مرور', titleFr: 'Accident circulation', type: 'civil', court: '1', who: 's', lawyerId: 'm', poa: true, ja: false, roleNumber: 'ROLE-CIV-55' },
        [mkParty('client', 'كريم زروقي'), mkParty('opponent', 'شركة التأمين')],
        { reasons: [] },
        false
      );
      go('cases');
    `);

    const ids = JSON.parse(app.evalInApp(`JSON.stringify({
      a1: S.cases.find(c => c.no === 'DW-2026-501').id,
      a2: S.cases.find(c => c.no === 'CE-2026-880').id,
      b1: S.cases.find(c => c.no === 'DW-2026-999').id
    })`));

    function runGlobalSearch(q) {
      const gs = document.getElementById('gs');
      gs.value = q;
      gs.dispatchEvent(new Event('input', { bubbles: true }));
      return document.querySelectorAll('#results [data-act="case"]').map(b => +b.dataset.id);
    }

    function runCasesFilter(q) {
      const fq = document.getElementById('fq');
      fq.value = q;
      app.evalInApp('caseRows()');
      return document.querySelectorAll('#caseRows .row[data-act="case"]').map(b => +b.dataset.id);
    }

    // Search by Appeal roleNumber -> finds Appeal first AND surfaces linked First-Instance, NEVER Matter B
    assert.deepEqual(runGlobalSearch('ROLE-CE-774'), [ids.a2, ids.a1]);
    assert.deepEqual(runCasesFilter('ROLE-CE-774'), [ids.a2, ids.a1]);

    // Search by First-Instance platformCaseNo -> finds First-Instance AND surfaces Appeal, NEVER Matter B
    assert.deepEqual(runGlobalSearch('PLAT-FIRST-501'), [ids.a1, ids.a2]);
    assert.deepEqual(runCasesFilter('PLAT-FIRST-501'), [ids.a1, ids.a2]);

    // Search by Diwan internal number -> finds Matter A stages only, NEVER Matter B
    assert.deepEqual(runGlobalSearch('DIWAN-M501'), [ids.a1, ids.a2]);
    assert.deepEqual(runCasesFilter('DIWAN-M501'), [ids.a1, ids.a2]);

    // Search by Appeal stage file number -> finds Appeal + First-Instance, NEVER Matter B
    assert.deepEqual(runGlobalSearch('CE-2026-880'), [ids.a2, ids.a1]);
    assert.deepEqual(runCasesFilter('CE-2026-880'), [ids.a2, ids.a1]);

    // Search by Matter B's roleNumber -> finds ONLY Matter B, NEVER Matter A
    assert.deepEqual(runGlobalSearch('ROLE-CIV-55'), [ids.b1]);
    assert.deepEqual(runCasesFilter('ROLE-CIV-55'), [ids.b1]);

    // Search by Client name -> finds all 3 cases of that client
    const clientHits = runCasesFilter('كريم زروقي');
    assert.equal(clientHits.length, 3);
    assert.ok(clientHits.includes(ids.a1) && clientHits.includes(ids.a2) && clientHits.includes(ids.b1));
  });

  test('6. Legacy case records (without rootCaseId or with legacy string IDs) and manual linked cross-case links remain compatible', async () => {
    const app = await bootDiwanApp();
    const { document } = app;

    const check = JSON.parse(app.evalInApp(`JSON.stringify((function(){
      var legacyFirst = Object.assign({}, S.cases[0], {
        id: 10,
        no: '2024/00010',
        stage: 1,
        linked: [12]
      });
      delete legacyFirst.rootCaseId;
      delete legacyFirst.parentId;

      var legacyAppeal = Object.assign({}, S.cases[1], {
        id: 'id_legacy_app_10',
        no: '2024/00010-استئناف',
        parentId: 10,
        stage: 2,
        linked: []
      });
      delete legacyAppeal.rootCaseId;

      var manualCompanion = Object.assign({}, S.cases[2], {
        id: 12,
        no: '2024/00999',
        stage: 0,
        linked: [10]
      });
      delete manualCompanion.rootCaseId;

      S.cases = [legacyFirst, legacyAppeal, manualCompanion];
      var cass = createNextStageCase('id_legacy_app_10', {
        stage: '3',
        court: '9',
        no: '2026/CASS-10',
        lawyerId: 'm'
      });

      return {
        rootOfFirst: resolveRootCaseId(byC(10)),
        rootOfLegacyAppeal: resolveRootCaseId(byC('id_legacy_app_10')),
        rootOfCass: resolveRootCaseId(byC(cass.id)),
        cassParentId: byC(cass.id).parentId,
        stagesChainNos: matterStagesOf(byC(10)).map(x => x.no),
        companionStagesNos: matterStagesOf(byC(12)).map(x => x.no),
        manualLinkedOnFirst: byC(10).linked,
        manualLinkedOnCompanion: byC(12).linked,
        legacyFirstStillHasNoDestructiveMutation: !Object.prototype.hasOwnProperty.call(byC(10), 'rootCaseId')
      };
    })())`));

    assert.equal(check.rootOfFirst, 10);
    assert.equal(check.rootOfLegacyAppeal, 10);
    assert.equal(check.rootOfCass, 10);
    assert.equal(check.cassParentId, 'id_legacy_app_10');
    assert.deepEqual(check.stagesChainNos, ['2024/00010', '2024/00010-استئناف', '2026/CASS-10']);
    assert.deepEqual(check.companionStagesNos, ['2024/00999']);
    assert.deepEqual(check.manualLinkedOnFirst, [12], 'Manual linked array preserved without deletion or replacement');
    assert.deepEqual(check.manualLinkedOnCompanion, [10]);
    assert.equal(check.legacyFirstStillHasNoDestructiveMutation, true);

    app.evalInApp('openDrawer(10)');
    const drawerHTML = document.getElementById('drawer').innerHTML;
    assert.match(drawerHTML, /2024\/00010-استئناف/);
    assert.match(drawerHTML, /2026\/CASS-10/);
    assert.match(drawerHTML, /2024\/00999/, 'Manual companion case still visible under linked files');

    const openLegacyAppealBtn = document.querySelector('#drawer [data-matter-stages] [data-act="case"][data-id="id_legacy_app_10"]');
    assert.ok(openLegacyAppealBtn);
    openLegacyAppealBtn.click();
    assert.match(document.querySelector('#drawer .sub').textContent, /2024\/00010-استئناف/);
  });

  test('7. Save + reload preserves stage links & manual links and prevents duplicate stage or link entries', async () => {
    const app = await bootDiwanApp();

    const check = JSON.parse(app.evalInApp(`JSON.stringify((function(){
      var root = S.cases[0];
      root.rootCaseId = root.id;
      root.parentId = null;
      root.stage = 1;
      root.linked = [S.cases[1].id, S.cases[1].id]; // Intentional duplicate link to test dedup

      var appeal = createNextStageCase(root.id, {
        stage: '2',
        court: '6',
        no: '2026/SAVE-APP-01',
        roleNumber: 'R-SAVE-01',
        platformCaseNo: 'P-SAVE-01',
        lawyerId: 'm'
      });

      // Attempt duplicate stage creation before reload
      var dupBefore = createNextStageCase(root.id, {
        stage: '2',
        court: '6',
        no: '2026/SAVE-APP-01',
        lawyerId: 'm'
      });

      var countBefore = S.cases.length;
      S.nextId = 1; // Intentionally stale nextId before snapshot to test recovery on applyStore

      // Full save -> normStore -> applyStore reload cycle (x2)
      var raw1 = JSON.stringify(snapV7(false));
      applyStore(normStore(JSON.parse(raw1)));
      var raw2 = JSON.stringify(snapV7(false));
      applyStore(normStore(JSON.parse(raw2)));

      // Attempt duplicate stage creation after reload
      var dupAfter = createNextStageCase(root.id, {
        stage: '2',
        court: '6',
        no: '2026/SAVE-APP-01',
        lawyerId: 'm'
      });

      var reloadedAppeal = S.cases.find(c => c.no === '2026/SAVE-APP-01');
      var reloadedRoot = byC(root.id);

      return {
        countBefore,
        countAfter: S.cases.length,
        dupBeforeNull: dupBefore === null,
        dupAfterNull: dupAfter === null,
        appealRootCaseId: reloadedAppeal.rootCaseId,
        appealParentId: reloadedAppeal.parentId,
        appealRoleNo: reloadedAppeal.roleNumber,
        appealPlatNo: reloadedAppeal.platformCaseNo,
        rootId: reloadedRoot.id,
        dedupedManualLinked: reloadedRoot.linked,
        stagesCount: matterStagesOf(reloadedRoot).length,
        nextIdSafe: S.nextId > reloadedAppeal.id
      };
    })())`));

    assert.equal(check.countAfter, check.countBefore, 'Save + reload creates zero duplicate cases');
    assert.equal(check.dupBeforeNull, true, 'Duplicate stage rejected before reload');
    assert.equal(check.dupAfterNull, true, 'Duplicate stage rejected after reload');
    assert.equal(check.appealRootCaseId, check.rootId);
    assert.equal(check.appealParentId, check.rootId);
    assert.equal(check.appealRoleNo, 'R-SAVE-01');
    assert.equal(check.appealPlatNo, 'P-SAVE-01');
    assert.equal(check.dedupedManualLinked.length, 1, 'Duplicate manual linked IDs deduplicated cleanly');
    assert.equal(check.stagesCount, 2, 'Mother case + appeal remain linked across reloads');
    assert.equal(check.nextIdSafe, true, 'S.nextId safely exceeds max case ID after reload');
    assert.deepEqual(app.consoleErrors, []);
  });
});
