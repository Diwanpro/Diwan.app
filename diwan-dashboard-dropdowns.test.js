/* DIWAN-DASHBOARD-DROPDOWNS — Comprehensive verification suite for:
 *  - Section 2: Calm Dashboard redesign (4 core KPI groups, live metrics, «ما يتطلب انتباهي»
 *    urgent action hub with direct case/section navigation, zero/empty state, non-duplicated
 *    #alertBar on dash, role-gated shortcuts, and preserved secondary widgets in calV/teamV).
 *  - Sections 3, 4 & 5: Universal sliding dropdown system (`DiwanSelect`) across all 50+
 *    short & long `<select>` controls (top bar, filters, tables, forms, modals, 4-step wizard),
 *    155–195ms slide-from-field CSS contract, auto `drop-up` positioning near viewport bottom,
 *    search threshold (`>= 8` options only), Arabic/French normalization, keyboard navigation,
 *    `Escape` isolation inside open modals, outside click, hover non-open, programmatic `.value`
 *    sync, disabled state sync, Dark mode, RTL/LTR, and zero console/i18n errors.
 *
 * Zero external dependencies — runs with: node --test diwan-dashboard-dropdowns.test.js
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

function extractInlineStyles(html) {
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out.join('\n');
}

const CSS = extractInlineStyles(HTML);

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

  const consoleErrors = [];
  const consoleWarns = [];
  const winListeners = [];
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
    matchMedia: () => ({ matches: !!opts.prefersDark, addEventListener() {} }),
    confirm: () => true,
    prompt: () => '',
    alert: () => {},
    print: () => {},
    scrollTo: () => {},
    screen: { width: 1440, height: 900 },
    addEventListener(type, fn, o) { winListeners.push({ type, fn, o }); },
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
    consoleErrors,
    consoleWarns,
    winListeners,
    evalInApp(expr) { return vm.runInContext(expr, sandbox); }
  };
}

describe('Section 2 — Redesigned Calm Dashboard & Preserved Secondary Sections', () => {
  test('1.1 Exact 4 KPI groups, live metrics, non-duplicated #alertBar on dash, and direct KPI navigation', async () => {
    const app = await bootDiwanApp();
    const { document, evalInApp, consoleErrors, consoleWarns } = app;

    assert.equal(evalInApp('S.view'), 'dash', 'App boots onto Dashboard');
    const view = document.getElementById('view');

    // Exactly 4 main KPI cards
    const kpiCards = view.querySelectorAll('.dash-kpis .kpi');
    assert.equal(kpiCards.length, 4, 'Dashboard renders exclusively the 4 core KPI groups');

    const kpiText = kpiCards.map(c => c.textContent).join(' | ');
    assert.ok(kpiText.includes('القضايا النشطة'), 'KPI 1: Active cases');
    assert.ok(kpiText.includes('جلسات اليوم'), "KPI 2: Today's hearings");
    assert.ok(kpiText.includes('الآجال القريبة'), 'KPI 3: Upcoming deadlines');
    assert.ok(kpiText.includes('المهام التي تتطلب إجراءً'), 'KPI 4: Action-required tasks');

    // Live counts match actual state
    const expectedCases = evalInApp('myCases().length');
    const expectedTodayHearings = evalInApp('myCases().filter(c => c.next === K(TODAY)).length');
    const expectedNearDls = evalInApp('myDls().filter(d => diff(d.d) >= 0 && diff(d.d) <= 7).length');
    const expectedOpenTasks = evalInApp('myTasks().filter(t => !t.done).length');
    const actualNums = kpiCards.map(c => Number(c.querySelector('b').textContent.trim()));
    assert.deepEqual(actualNums, [expectedCases, expectedTodayHearings, expectedNearDls, expectedOpenTasks], 'KPI numbers match live workspace state');

    // No duplicate #alertBar above #view when on Dashboard
    assert.equal(document.getElementById('alertBar').innerHTML.trim(), '', 'No duplicate #alertBar banner while on Dashboard');

    // Clicking each KPI navigates directly to its section
    kpiCards[0].click();
    assert.equal(evalInApp('S.view'), 'cases', 'Active cases KPI navigates to cases');
    evalInApp("go('dash')");
    kpiCards[1].click();
    assert.equal(evalInApp('S.view'), 'role', "Today's hearings KPI navigates to hearing role");
    evalInApp("go('dash')");
    kpiCards[2].click();
    assert.equal(evalInApp('S.view'), 'deadlines', 'Upcoming deadlines KPI navigates to deadlines');
    evalInApp("go('dash')");
    kpiCards[3].click();
    assert.equal(evalInApp('S.view'), 'tasks', 'Tasks KPI navigates to tasks');

    // Non-dashboard views still show #alertBar when critical deadlines exist
    evalInApp("go('docs')");
    assert.ok(document.getElementById('alertBar').innerHTML.length > 0, '#alertBar remains active on non-dashboard views');

    assert.equal(consoleErrors.length, 0, 'Zero console errors');
    assert.equal(consoleWarns.filter(w => w.includes('[i18n]')).length, 0, 'Zero missing i18n keys');
  });

  test('1.2 «ما يتطلب انتباهي» opens linked cases directly in Drawer and renders calm zero-state when workspace is clear', async () => {
    const app = await bootDiwanApp();
    const { document, evalInApp } = app;

    evalInApp("go('dash')");
    const att = document.getElementById('view').querySelector('.dash-attention');
    assert.ok(att, '«ما يتطلب انتباهي» section is rendered below KPIs');
    assert.ok(att.textContent.includes('ما يتطلب انتباهي'), 'Arabic section heading rendered');

    const caseItem = att.querySelector('.attn-row[data-act="case"]');
    assert.ok(caseItem, 'Urgent item linked to a specific case renders with data-act="case"');
    const targetCaseId = caseItem.dataset.id;
    const expectedCaseNo = evalInApp(`byC(${Number(targetCaseId)}).no`);
    caseItem.click();
    assert.equal(document.getElementById('drawer').classList.contains('on'), true, 'Clicking urgent case item opens Case Drawer directly');
    assert.ok(document.getElementById('drawer').textContent.includes(expectedCaseNo), 'Exact linked case opened inside Drawer');
    evalInApp('closeDrawer()');

    // Zero / empty state verification
    evalInApp(`
      S.cases = [];
      S.dls = [];
      S.tasks = [];
      S.appointments = [];
      S.conflictReviews = [];
      S.stampInventory = { court: 20, council: 20, admin: 20 };
      render();
    `);
    const zeroNums = document.getElementById('view').querySelectorAll('.dash-kpis .kpi b')
      .map(n => Number(n.textContent.trim()));
    assert.deepEqual(zeroNums, [0, 0, 0, 0], 'All 4 KPIs cleanly display 0 in empty workspace');
    const calmEmpty = document.getElementById('view').querySelector('.dash-calm-empty');
    assert.ok(calmEmpty && calmEmpty.textContent.includes(evalInApp("t('dash_attention_empty')")), 'Calm zero-state message displayed cleanly');
  });

  test('1.3 Role-filtered core shortcuts & preserved secondary widgets in Calendar (calV) and Team (teamV)', async () => {
    const app = await bootDiwanApp();
    const { document, evalInApp } = app;

    // Manager sees all 5 core shortcuts
    evalInApp("go('dash')");
    const mgrShortcuts = document.getElementById('view').querySelectorAll('.dash-shortcuts .dash-sc').map(b => b.dataset.v);
    assert.deepEqual(mgrShortcuts, ['cases', 'clients', 'cal', 'docgen', 'fees'], 'Manager sees concise core section shortcuts');

    // Trainee role gating hides restricted shortcuts (clients, fees) and newclient/newcase CTAs
    evalInApp("S.userPasswords.t = S.userPasswords.m; S.user = 't'; chrome(); go('dash');");
    const trnShortcuts = document.getElementById('view').querySelectorAll('.dash-shortcuts .dash-sc').map(b => b.dataset.v);
    assert.equal(trnShortcuts.includes('clients'), false, 'Trainee does not see clients shortcut');
    assert.equal(trnShortcuts.includes('fees'), false, 'Trainee does not see fees shortcut');
    assert.equal(document.getElementById('view').querySelector('[data-act="newclient"]'), null, 'Trainee does not see newclient CTA');

    // Restore manager and verify preserved 5-day workweek roll in calV and workload bars in teamV
    evalInApp("S.user = 'm'; chrome(); go('cal');");
    const calView = document.getElementById('view');
    assert.ok(calView.querySelector('.roll') && calView.textContent.includes(evalInApp("t('roll_title')")), '5-day workweek hearing roll preserved inside Calendar view');

    evalInApp("go('team')");
    const teamView = document.getElementById('view');
    assert.ok(teamView.querySelectorAll('.bar').length >= 3, 'Lawyer/team workload bars preserved inside Team view');
  });
});

describe('Sections 3, 4 & 5 — Unified Sliding Dropdown System (DiwanSelect)', () => {
  test('2.1 CSS slide-from-field motion contract (155–195ms, connected corners, drop-up, reduced-motion, header popovers)', () => {
    assert.match(CSS, /\.select-popover\{[^}]*top:calc\(100% - 1px\)/, 'Popover attaches flush to bottom of trigger field');
    assert.match(CSS, /\.select-popover\{[^}]*opacity:0;visibility:hidden;pointer-events:none;transform-origin:top center;transform:translateY\(-6px\) scaleY\(\.95\)/, 'Closed popover uses opacity+transform (no abrupt display:none jump)');
    assert.match(CSS, /\.select-popover\{[^}]*transition:opacity \.155s cubic-bezier\(\.4,0,\.2,1\),transform \.17s cubic-bezier\(\.4,0,\.2,1\),visibility 0s linear \.17s/, 'Smooth close animation within 155–175ms');
    assert.match(CSS, /\.select-enhanced\.is-open \.select-popover\{[^}]*opacity:1;visibility:visible;pointer-events:auto;transform:translateY\(0\) scaleY\(1\);transition:opacity \.175s cubic-bezier\(\.22,1,\.36,1\),transform \.195s cubic-bezier\(\.22,1,\.36,1\),visibility 0s linear 0s/, 'Smooth drawer-like slide open within 175–195ms');
    assert.match(CSS, /\.select-enhanced\.drop-up \.select-popover\{[^}]*bottom:calc\(100% - 1px\)/, 'Drop-up attaches flush above trigger when space below is tight');
    assert.match(CSS, /\.modal\{[^}]*overflow:visible/, 'Modals allow dropdown popovers to extend smoothly without clipping');
    assert.match(CSS, /\.notif\.on\{[^}]*transform:translateY\(0\) scaleY\(1\)/, 'Notification popover shares unified slide motion');
    assert.match(CSS, /\.results\.on\{[^}]*transform:translateY\(0\) scaleY\(1\)/, 'Search results popover shares unified slide motion');
    assert.match(CSS, /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\.select-popover/, 'prefers-reduced-motion disables motion cleanly');
  });

  test('2.2 Universal enhancement across ALL views, filters, settings, Client Modal & 4-Step Case Wizard (0 unenhanced selects)', async () => {
    const app = await bootDiwanApp();
    const { document, evalInApp } = app;

    // Top bar #roleSel
    const roleSel = document.getElementById('roleSel');
    assert.ok(roleSel.closest('.select-enhanced'), '#roleSel in top bar is enhanced with DiwanSelect');

    // Sweep major views containing filter/form/table selects
    const viewsToCheck = ['cases', 'tasks', 'clients', 'deadlines', 'docgen', 'portal', 'scan', 'audit', 'settings'];
    for (const v of viewsToCheck) {
      evalInApp(`go('${v}')`);
      const allSelects = document.getElementById('view').querySelectorAll('select');
      assert.ok(allSelects.length > 0, `View "${v}" contains <select> controls`);
      const unenhanced = allSelects.filter(s => !s.multiple && !s.closest('.select-enhanced'));
      assert.equal(unenhanced.length, 0, `Every <select> in view "${v}" is enhanced (${allSelects.length} selects)`);
    }

    // Client Onboarding Modal selects (short + 59-option wilaya)
    evalInApp('openClientModal()');
    const clientModalSelects = document.getElementById('modal').querySelectorAll('select');
    assert.ok(clientModalSelects.length >= 5, 'Client Modal renders its select fields');
    assert.equal(clientModalSelects.filter(s => !s.closest('.select-enhanced')).length, 0, '100% of Client Modal selects enhanced');
    evalInApp('closeModal()');

    // 4-Step Case Creation Wizard selects (including disabled #pp0_role and 17-option #pp0_proc)
    evalInApp('newCase()');
    const wizSelects = document.getElementById('modal').querySelectorAll('select');
    assert.ok(wizSelects.length >= 10, '4-Step Case Wizard renders its select fields');
    assert.equal(wizSelects.filter(s => !s.closest('.select-enhanced')).length, 0, '100% of Case Wizard selects enhanced');

    const disabledRoleSel = document.getElementById('pp0_role');
    const disabledWrap = disabledRoleSel.closest('.select-enhanced');
    const disabledTrigger = disabledWrap.querySelector('.select-trigger');
    assert.equal(disabledWrap.classList.contains('is-disabled'), true, 'Disabled <select> marks wrapper .is-disabled');
    assert.equal(disabledTrigger.disabled, true, 'Disabled <select> disables custom trigger button');
    disabledTrigger.click();
    assert.equal(disabledWrap.classList.contains('is-open'), false, 'Disabled dropdown never opens');
    evalInApp('closeModal()');
  });

  test('2.3 Search threshold (<8 hidden vs >=8 visible), Arabic normalized search, selection, filter reactivity & programmatic .value sync', async () => {
    const app = await bootDiwanApp();
    const { document, Event, evalInApp } = app;

    // Short select (#fs in cases: 5 options) -> search hidden; Long select (#ft in cases: 8 options) -> search visible
    evalInApp("go('cases')");
    const fsWrap = document.getElementById('fs').closest('.select-enhanced');
    const ftWrap = document.getElementById('ft').closest('.select-enhanced');

    fsWrap.querySelector('.select-trigger').click();
    assert.equal(fsWrap.classList.contains('is-open'), true, 'Short filter dropdown opens smoothly');
    assert.equal(fsWrap.querySelector('.select-search-wrap').hidden, true, 'Short list (<8 options) hides internal search input');

    // Opening another dropdown automatically closes the previously open one
    ftWrap.querySelector('.select-trigger').click();
    assert.equal(fsWrap.classList.contains('is-open'), false, 'Previous dropdown auto-closes when opening another');
    assert.equal(ftWrap.classList.contains('is-open'), true, 'Second dropdown opens');
    assert.equal(ftWrap.querySelector('.select-search-wrap').hidden, false, '8-option list displays internal search input');

    // Selecting an option in #ft filters #caseRows immediately via dispatched input+change
    const totalBefore = document.getElementById('caseRows').querySelectorAll('button.row[data-act="case"]').length;
    const commOpt = ftWrap.querySelectorAll('.select-option').find(b => b.dataset.value === 'commercial');
    assert.ok(commOpt, 'Commercial case type option rendered');
    commOpt.click();
    assert.equal(ftWrap.classList.contains('is-open'), false, 'Dropdown closes on option selection');
    assert.equal(document.getElementById('ft').value, 'commercial', 'Underlying <select> value updated');
    const totalAfter = document.getElementById('caseRows').querySelectorAll('button.row[data-act="case"]').length;
    assert.ok(totalAfter < totalBefore, 'Case table filtered immediately upon dropdown selection');

    // 59-option Wilaya dropdown inside Client Modal: Arabic normalized search + form input isolation
    evalInApp('openClientModal()');
    const wilayaSel = document.getElementById('cl_wilaya');
    const wilayaWrap = wilayaSel.closest('.select-enhanced');
    let formInputBubbled = 0;
    document.getElementById('modal').addEventListener('input', () => { formInputBubbled++; });

    wilayaWrap.querySelector('.select-trigger').click();
    const searchInp = wilayaWrap.querySelector('.select-search');
    assert.equal(wilayaWrap.querySelector('.select-search-wrap').hidden, false, '59-option Wilaya dropdown shows search');
    searchInp.value = 'قسنطينه'; // Ta-marbuta normalized to Ha
    searchInp.dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal(formInputBubbled, 0, 'Typing in dropdown search does NOT bubble spurious input events to parent form');

    const matches = wilayaWrap.querySelectorAll('.select-option');
    assert.equal(matches.length, 1, 'Normalized Arabic search narrows 59 wilayas to exact match');
    assert.ok(matches[0].textContent.includes('25') && matches[0].textContent.includes('قسنطينة'), '25 — قسنطينة matched');
    matches[0].click();
    assert.equal(wilayaSel.value, '25', 'Wilaya <select> value set to "25"');
    assert.ok(wilayaWrap.querySelector('.select-value').textContent.includes('قسنطينة'), 'Trigger label displays selected wilaya');
    evalInApp('closeModal()');

    // Existing-client picker re-render + direct programmatic .value assignment syncs custom trigger label automatically
    const legalClientIdx = evalInApp(`
      CL.push({ id: 'cl_leg_sync', kind: 'legal', companyName: 'شركة الأطلس ش.ذ.م.م', ar: 'شركة الأطلس ش.ذ.م.م', fr: 'SARL Atlas', legalForm: 'SARL', rc: '16/00-9999999B20', nif: '099916009999999', wilaya: '16', ph: '0550112233' });
      newCase();
      CL.length - 1;
    `);
    const pickSel = document.getElementById('pickExistingClient');
    const pickWrap = pickSel.closest('.select-enhanced');
    pickWrap.querySelector('.select-trigger').click();
    const legalOpt = pickWrap.querySelectorAll('.select-option').find(b => b.dataset.value === String(legalClientIdx));
    assert.ok(legalOpt, 'Newly added legal client appears in Case Wizard picker');
    legalOpt.click();
    const kindSel = document.getElementById('pp0_kind');
    const kindWrap = kindSel.closest('.select-enhanced');
    assert.equal(kindSel.value, 'legal', 'Existing legal client sets #pp0_kind to legal');
    assert.equal(kindWrap.querySelector('.select-value').textContent.trim(), 'شخص معنوي', 'Re-rendered #pp0_kind enhanced with legal label');
    kindSel.value = 'natural';
    assert.equal(kindWrap.querySelector('.select-value').textContent.trim(), 'شخص طبيعي', 'Direct programmatic .value write syncs custom trigger label immediately');
    evalInApp('closeModal()');
  });

  test('2.4 Smart drop-up positioning near viewport bottom, keyboard navigation, Escape isolation inside modals, hover non-open, FR LTR & Dark mode', async () => {
    const app = await bootDiwanApp();
    const { document, Event, evalInApp, sandbox, consoleErrors, consoleWarns } = app;

    evalInApp('openClientModal()');
    const modalWrap = document.getElementById('modalWrap');
    const wilayaWrap = document.getElementById('cl_wilaya').closest('.select-enhanced');
    const trigger = wilayaWrap.querySelector('.select-trigger');

    // 1. Hover NEVER opens dropdown
    trigger.dispatchEvent(new Event('mouseover', { bubbles: true }));
    trigger.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    assert.equal(wilayaWrap.classList.contains('is-open'), false, 'Pointer hover never opens dropdown');

    // 2. Normal viewport position -> opens downward (no .drop-up)
    sandbox.innerHeight = 800;
    trigger._rect = { top: 180, bottom: 222, left: 60, right: 360, width: 300, height: 42 };
    trigger.click();
    assert.equal(wilayaWrap.classList.contains('is-open'), true, 'Dropdown opens');
    assert.equal(wilayaWrap.classList.contains('drop-up'), false, 'Ample space below -> opens downward beneath field');
    trigger.click();
    assert.equal(wilayaWrap.classList.contains('is-open'), false, 'Second click on trigger closes dropdown');

    // 3. Tight space near bottom of viewport -> auto-flips to .drop-up above field
    trigger._rect = { top: 720, bottom: 762, left: 60, right: 360, width: 300, height: 42 };
    trigger.click();
    assert.equal(wilayaWrap.classList.contains('is-open'), true, 'Dropdown opens near bottom edge');
    assert.equal(wilayaWrap.classList.contains('drop-up'), true, 'Insufficient space below -> auto-switches to .drop-up');
    assert.ok(wilayaWrap.querySelector('.select-popover').style.getPropertyValue('--pop-max-h'), '--pop-max-h CSS bound computed');

    // 4. Critical Escape isolation: Escape closes ONLY the open dropdown, NOT the parent modal!
    assert.equal(modalWrap.classList.contains('on'), true, 'Client Modal is open');
    const esc1 = new Event('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(esc1);
    assert.equal(wilayaWrap.classList.contains('is-open'), false, 'First Escape closes the open dropdown');
    assert.equal(modalWrap.classList.contains('on'), true, 'Parent Client Modal remains open after closing dropdown with Escape');
    assert.equal(document.activeElement, trigger, 'Focus restored cleanly to dropdown trigger');

    // 5. Keyboard navigation (ArrowDown -> ArrowDown -> Enter) on short select (#cl_capacity)
    const capSel = document.getElementById('cl_capacity');
    const capWrap = capSel.closest('.select-enhanced');
    const capTrigger = capWrap.querySelector('.select-trigger');
    capTrigger.dispatchEvent(new Event('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert.equal(capWrap.classList.contains('is-open'), true, 'ArrowDown on closed trigger opens dropdown');
    const capPop = capWrap.querySelector('.select-popover');
    capPop.dispatchEvent(new Event('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert.ok(document.activeElement.classList.contains('select-option'), 'ArrowDown moves focus through options');
    const focusedVal = document.activeElement.dataset.value;
    document.activeElement.dispatchEvent(new Event('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert.equal(capSel.value, focusedVal, 'Enter selects focused option');
    assert.equal(capWrap.classList.contains('is-open'), false, 'Enter closes dropdown');

    // 6. Outside pointerdown closes open dropdown
    capTrigger.click();
    assert.equal(capWrap.classList.contains('is-open'), true, 'Dropdown reopened');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    assert.equal(capWrap.classList.contains('is-open'), false, 'Outside pointerdown closes dropdown');

    // Second Escape (with no dropdown open) closes modal normally
    document.body.dispatchEvent(new Event('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(modalWrap.classList.contains('on'), false, 'Escape closes modal when no dropdown is open');

    // 7. French LTR + Dark mode across Dashboard & Dropdowns
    document.getElementById('langBtn').click();
    document.getElementById('themeBtn').click();
    evalInApp("go('dash')");
    assert.equal(document.documentElement.dir, 'ltr', 'Switched to French LTR');
    assert.equal(document.documentElement.classList.contains('dark'), true, 'Dark mode active');
    const frView = document.getElementById('view');
    assert.ok(frView.textContent.includes('Dossiers actifs'), 'French Dashboard KPI 1 rendered');
    assert.ok(frView.textContent.includes('Ce qui requiert mon attention'), 'French attention section rendered');

    evalInApp('openClientModal()');
    const frWilayaWrap = document.getElementById('cl_wilaya').closest('.select-enhanced');
    frWilayaWrap.querySelector('.select-trigger').click();
    assert.equal(frWilayaWrap.querySelector('.select-search').placeholder, 'Rechercher…', 'French search placeholder rendered');
    evalInApp('closeModal()');

    assert.equal(consoleErrors.length, 0, 'Zero runtime JS errors');
    assert.equal(consoleWarns.filter(w => w.includes('[i18n]')).length, 0, 'Zero missing i18n keys in AR & FR');
  });
});
