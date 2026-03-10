// ════════════════════════════════════════════════════════════════
// app.js
// 役割: アプリの起動・ルーティング・ローディング・トースト・
//       共通UIユーティリティを担う。各画面JSの呼び出し元。
//       画面ごとのrender関数を呼び分けるシンプルなSPAルーター。
// ════════════════════════════════════════════════════════════════

'use strict';

// ── 起動 ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Store.loadFromStorage();
  bindNav();
  bindGlobalEvents();
  renderNav();
  routeTo(Store.getPage());
  syncIfNeeded();
});

// ── ルーター ──────────────────────────────────────────────────
const PAGES = {
  'dashboard':   () => Pages.dashboard(),
  'ind-list':    () => Pages.individualList(),
  'ind-detail':  () => Pages.individualDetail(Store.getParams().id),
  'ind-new':     () => Pages.individualNew(Store.getParams()),
  'growth-rec':  () => Pages.growthRecord(Store.getParams()),
  'lot-list':    () => Pages.lotList(),
  'lot-detail':  () => Pages.lotDetail(Store.getParams().id),
  'lot-new':     () => Pages.lotNew(Store.getParams()),
  'line-list':   () => Pages.lineList(),
  'line-detail': () => Pages.lineDetail(Store.getParams().id),
  'line-new':    () => Pages.lineNew(Store.getParams()),
  'parent-list': () => Pages.parentList(),
  'parent-new':  () => Pages.parentNew(Store.getParams()),
  'parent-detail':    () => Pages.parentDetail(Store.getParams().id),
  'bloodline-list':   () => Pages.bloodlineList(),
  'bloodline-detail': () => Pages.bloodlineDetail(Store.getParams().id),
  'bloodline-new':    () => Pages.bloodlineNew(Store.getParams()),
  'pairing-list':   () => Pages.pairingList(),
  'pairing-detail': () => Pages.pairingDetail(Store.getParams().id),
  'pairing-new':    () => Pages.pairingNew(Store.getParams()),
  'label-gen':   () => Pages.labelGen(Store.getParams()),
  'manage':      () => Pages.manage(),
  'settings':    () => Pages.settings(),
  // ── QRスキャン ───────────────────────────────────────────────
  'qr-scan':     () => Pages.qrScan(Store.getParams()),
  'qr-diff':     () => Pages.qrDiff(Store.getParams()),
  'weight-mode': () => Pages.weightMode(Store.getParams()),
};

function routeTo(pageId, params = {}) {
  if (params && Object.keys(params).length) Store.navigate(pageId, params);
  else Store.navigate(pageId);

  const main = document.getElementById('main');
  if (!main) return;

  const fn = PAGES[pageId];
  if (fn) {
    main.innerHTML = '';
    fn();
  } else {
    main.innerHTML = UI.empty('ページが見つかりません: ' + pageId);
  }
  renderNav();
  main.scrollTop = 0;
}

// Store のナビイベントを購読
Store.on('nav', () => {
  const fn = PAGES[Store.getPage()];
  const main = document.getElementById('main');
  if (!main || !fn) return;
  main.innerHTML = '';
  fn();
  renderNav();
  main.scrollTop = 0;
});

// ── ナビゲーション ─────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const page   = el.dataset.nav;
      const params = el.dataset.params ? JSON.parse(el.dataset.params) : {};
      routeTo(page, params);
    });
  });
}

function renderNav() {
  const cur = Store.getPage();
  document.querySelectorAll('.nav-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === cur ||
      (el.dataset.nav === 'manage' && ['lot-list','line-list','parent-list','bloodline-list','pairing-list'].includes(cur))
    );
  });
}

// ── グローバルイベント ─────────────────────────────────────────
function bindGlobalEvents() {
  // ローディング
  Store.on('loading', () => {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = Store.isLoading() ? 'flex' : 'none';
  });
  // トースト
  Store.on('toast', () => {
    const t = Store._state?.toast;
    showToast(Store.getDB('_lastToast'));
  });
  // 動的ナビ
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      e.preventDefault();
      const page   = nav.dataset.nav;
      const params = nav.dataset.params ? JSON.parse(nav.dataset.params) : {};
      routeTo(page, params);
    }
  });
}

// ── 初期同期 ──────────────────────────────────────────────────
async function syncIfNeeded() {
  const gasUrl = Store.getSetting('gas_url') || CONFIG.GAS_URL;
  if (!gasUrl) return;
  const last = localStorage.getItem(CONFIG.LS_KEYS.LAST_SYNC);
  const age  = last ? Date.now() - new Date(last).getTime() : Infinity;
  if (age < 5 * 60 * 1000) return; // 5分以内は skip
  await syncAll(true);
}

async function syncAll(silent = false) {
  if (!silent) Store.setLoading(true);
  try {
    const d = await API.system.getAllData();
    Store.setDB('individuals', d.individuals || []);
    Store.setDB('lots',        d.lots        || []);
    Store.setDB('lines',       d.lines       || []);
    Store.setDB('parents',     d.parents     || []);
    Store.setDB('bloodlines',  d.bloodlines  || []);
    Store.setDB('pairings',    d.pairings    || []);
    if (d.settings) Object.entries(d.settings).forEach(([k,v]) => Store.setSetting(k, v));
    if (!silent) UI.toast('データを同期しました', 'success');
  } catch (e) {
    if (!silent) UI.toast('同期失敗: ' + e.message, 'error');
    else console.warn('バックグラウンド同期失敗:', e.message);
  } finally {
    if (!silent) Store.setLoading(false);
  }
}

// ════════════════════════════════════════════════════════════════
// UI — 共通UIユーティリティ
// ════════════════════════════════════════════════════════════════
const UI = {

  // ── トースト ────────────────────────────────────────────────
  toast(msg, type = 'success', ms = 2800) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className   = `toast toast-${type} show`;
    clearTimeout(el._tid);
    el._tid = setTimeout(() => el.classList.remove('show'), ms);
  },

  // ── ローディング ────────────────────────────────────────────
  loading(v) { Store.setLoading(v); },

  // ── 確認ダイアログ ──────────────────────────────────────────
  confirm(msg) { return window.confirm(msg); },

  // ── ページヘッダー ──────────────────────────────────────────
  header(title, opts = {}) {
    const back = opts.back !== false
      ? `<button class="btn-icon btn-back" onclick="Store.back()">←</button>` : '';
    const action = opts.action
      ? `<button class="btn-icon btn-action" onclick="${opts.action.fn}">${opts.action.icon || '＋'}</button>` : '';
    return `<header class="page-header">
      <div class="hdr-left">${back}</div>
      <h1 class="hdr-title">${title}</h1>
      <div class="hdr-right">${action}</div>
    </header>`;
  },

  // ── カード ──────────────────────────────────────────────────
  card(inner, cls = '') {
    return `<div class="card ${cls}">${inner}</div>`;
  },

  // ── ステータスバッジ ────────────────────────────────────────
  stageBadge(code) {
    const c = stageColor(code), l = stageLabel(code);
    return `<span class="badge" style="background:${c}22;color:${c};border:1px solid ${c}55">${l}</span>`;
  },

  statusBadge(code) {
    const s = Object.values(IND_STATUS).find(x => x.code === code);
    if (!s) return '';
    return `<span class="badge" style="background:${s.color}22;color:${s.color};border:1px solid ${s.color}55">${s.label}</span>`;
  },

  bloodlineBadge(code) {
    const s = Object.values(BLOODLINE_STATUS).find(x => x.code === code);
    if (!s) return '';
    return `<span class="badge-sm" style="color:${s.color}">${s.label}</span>`;
  },

  verdictBadge(verdict) {
    if (!verdict) return '';
    const v = VERDICT_COLORS[verdict.cls] || {};
    return `<span class="badge verdict-badge" style="background:${v.bg};color:${v.text};border:1px solid ${v.border}">${v.icon} ${verdict.label}</span>`;
  },

  // ── 日齢表示 ────────────────────────────────────────────────
  // simple: 一覧用、full: 詳細用
  // isCurrent: true=現在の日齢, false=記録時点の日齢（区別して表示）
  ageSimple(hatchDate) {
    const a = Store.calcAge(hatchDate);
    if (!a) return '—';
    return `<span class="age-text" title="孵化日: ${hatchDate}">${a.days}</span>
            <span class="age-sub">${a.months} / ${a.stageGuess}</span>`;
  },

  ageFull(hatchDate) {
    const a = Store.calcAge(hatchDate);
    if (!a) return '—';
    return `<div class="age-block">
      <div class="age-row"><span class="age-label">現在</span>
        <span class="age-current">${a.days}</span></div>
      <div class="age-row"><span class="age-label">週齢</span><span>${a.weeks}</span></div>
      <div class="age-row"><span class="age-label">月齢</span><span>${a.months}</span></div>
      <div class="age-row"><span class="age-label">満</span><span>${a.years}</span></div>
      <div class="age-row"><span class="age-label">目安</span>
        <span class="age-stage">${a.stageGuess}</span></div>
    </div>`;
  },

  // 記録時点の日齢（成長記録リスト用）
  ageAtRecord(ageDays, recordDate) {
    if (!ageDays && ageDays !== 0) return '';
    return `<span class="age-rec" title="記録時点の日齢">記録時: ${ageDays}日</span>`;
  },

  // ── 空状態 ──────────────────────────────────────────────────
  empty(msg = 'データがありません', sub = '') {
    return `<div class="empty-state">
      <div class="empty-icon">🐛</div>
      <p class="empty-msg">${msg}</p>
      ${sub ? `<p class="empty-sub">${sub}</p>` : ''}
    </div>`;
  },

  // ── スピナー ────────────────────────────────────────────────
  spinner() {
    return `<div class="spinner-wrap"><div class="spinner"></div></div>`;
  },

  // ── フォームフィールド ──────────────────────────────────────
  field(label, inner, required = false) {
    return `<label class="field">
      <span class="field-label">${label}${required ? '<em>*</em>' : ''}</span>
      ${inner}
    </label>`;
  },

  select(name, options, value = '', placeholder = '選択...') {
    const opts = options.map(o => {
      const v = typeof o === 'string' ? o : o.code || o.value || o;
      const l = typeof o === 'string' ? o : o.label || o.text || o;
      return `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`;
    }).join('');
    return `<select name="${name}" class="input">${placeholder ? `<option value="">${placeholder}</option>` : ''}${opts}</select>`;
  },

  input(name, type = 'text', value = '', placeholder = '') {
    return `<input name="${name}" type="${type}" class="input" value="${value || ''}" placeholder="${placeholder}">`;
  },

  textarea(name, value = '', rows = 3, placeholder = '') {
    return `<textarea name="${name}" class="input" rows="${rows}" placeholder="${placeholder}">${value || ''}</textarea>`;
  },

  // ── フォームデータ収集 ──────────────────────────────────────
  collectForm(formEl) {
    const data = {};
    new FormData(formEl).forEach((v, k) => { data[k] = v; });
    formEl.querySelectorAll('input[type=checkbox]').forEach(el => {
      data[el.name] = el.checked;
    });
    return data;
  },

  // ── 親♂♀ のラベル ──────────────────────────────────────────
  parentLabel(parId) {
    const p = Store.getParent(parId);
    if (!p) return parId || '—';
    return `${p.display_name}${p.size_mm ? ' ' + p.size_mm + 'mm' : ''}`;
  },

  bloodlineLabel(bldId) {
    const b = Store.getBloodline(bldId);
    if (!b) return bldId || '—';
    return b.abbreviation || b.bloodline_name || bldId;
  },

  // ── 体重推移 HTML テーブル ──────────────────────────────────
  weightTable(records) {
    const wts = records.filter(r => r.weight_g && +r.weight_g > 0)
      .sort((a,b) => a.record_date.localeCompare(b.record_date));
    if (!wts.length) return UI.empty('体重記録なし');

    const rows = wts.map((r, i) => {
      const prev  = i > 0 ? +wts[i-1].weight_g : null;
      const delta = prev !== null ? (+r.weight_g - prev) : null;
      const dStr  = delta !== null
        ? `<span class="delta ${delta>=0?'pos':'neg'}">${delta>=0?'+':''}${delta.toFixed(1)}</span>`
        : '—';
      // 記録時点の日齢と現在の日齢を区別して表示
      const recAge = r.age_days ? Store.formatRecordAge(r.age_days) : '';
      return `<tr>
        <td>${r.record_date}</td>
        <td><b>${r.weight_g}g</b></td>
        <td>${dStr}</td>
        <td>${UI.stageBadge(r.stage)}</td>
        <td class="td-age">${recAge}</td>
      </tr>`;
    }).join('');

    return `<table class="data-table">
      <thead><tr><th>日付</th><th>体重</th><th>増減</th><th>ステージ</th><th>日齢</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  },
};

// ── API呼び出しラッパー（ローディング+トースト自動） ────────────
async function apiCall(fn, successMsg, opts = {}) {
  Store.setLoading(true);
  try {
    const result = await fn();
    if (successMsg) UI.toast(successMsg, 'success');
    return result;
  } catch (e) {
    UI.toast((opts.errPrefix || 'エラー: ') + e.message, 'error', 4000);
    throw e;
  } finally {
    Store.setLoading(false);
  }
}
