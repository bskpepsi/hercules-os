// FILE: js/app.js
// ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// app.js
// 役割: アプリの起動・ルーティング・ローディング・トースト・
//       共通UIユーティリティを担う。各画面JSの呼び出し元。
//       画面ごとのrender関数を呼び分けるシンプルなSPAルーター。
//
// build: 20260413bj
// 変更点: UI.weightTable — 増減列にg/日速度を追加
// ════════════════════════════════════════════════════════════════

'use strict';

// ── ID解決ヘルパー（params.id / params.lineId / params.lotId など全キーをフォールバック）
function _pid() {
  const p = Store.getParams();
  return p.id || p.lineId || p.lotId || p.indId || p.parId || p.bloodlineId || p.pairingId || p.setId || '';
}

// window.PAGES: 各ページJSから PAGES['key'] = ... で追加できるようグローバルに定義
window.PAGES = {
  'dashboard':   () => Pages.dashboard(),
  'ind-list':    () => Pages.individualList(),
  'parent-candidate': () => {
    Store.setParams({ parent_flag: true, status: 'alive' });
    if (Pages.individualList) Pages.individualList();
  },
  'ind-detail':  () => Pages.individualDetail(Store.getParams().indId || _pid()),
  'ind-new':     () => Pages.individualNew(Store.getParams()),
  'growth-rec':  () => Pages.growthRecord(Store.getParams()),
  'egg-lot-bulk':() => Pages.eggLotBulk(Store.getParams()),
  'lot-list':    () => Pages.lotList(),
  'lot-detail':  () => Pages.lotDetail(Store.getParams().lotId || _pid()),
  'lot-new':     () => Pages.lotNew(Store.getParams()),
  'line-list':   () => Pages.lineList(),
  'line-detail': () => Pages.lineDetail(Store.getParams().lineId || _pid()),
  'line-new':    () => Pages.lineNew(Store.getParams()),
  'parent-list': () => Pages.parentList(),
  'parent-new':  () => Pages.parentNew(Store.getParams()),
  'parent-detail':    () => Pages.parentDetail(Store.getParams().parId || _pid()),
  'bloodline-list':   () => Pages.bloodlineList(),
  'bloodline-detail': () => Pages.bloodlineDetail(Store.getParams().bloodlineId || _pid()),
  'bloodline-new':    () => Pages.bloodlineNew(Store.getParams()),
  'pairing-list':   () => Pages.pairingList(),
  'pairing-detail': () => Pages.pairingDetail(Store.getParams().pairingId || _pid()),
  'pairing-new':    () => Pages.pairingNew(Store.getParams()),
  'pairing-history':() => Pages.pairingHistory ? Pages.pairingHistory(Store.getParams().parId || _pid()) : Pages.pairingList(),
  'label-gen':   () => Pages.labelGen(Store.getParams()),
  'manage':      () => Pages.manage(),
  'settings':    () => Pages.settings(),
  // ── QRスキャン ───────────────────────────────────────────────
  'qr-scan':     () => Pages.qrScan(Store.getParams()),
  't1-session':  () => Pages.t1Session ? Pages.t1Session(Store.getParams()) : null,
  't2-session':  () => Pages.t2Session ? Pages.t2Session(Store.getParams()) : null,
  't3-session':  () => Pages.t3Session ? Pages.t3Session(Store.getParams()) : null,
  'unit-list':   () => Pages.unitList   ? Pages.unitList(Store.getParams())   : null,
  'unit-detail':     () => Pages.unitDetail ? Pages.unitDetail(Store.getParams()) : null,
  'continuous-scan': () => Pages.continuousScan(Store.getParams()),
  'batch-scan':       () => Pages.batchScan(Store.getParams()),
  'env-record':        () => Pages.envRecordList(Store.getParams()),
  'bloodline-analysis':() => Pages.bloodlineAnalysis ? Pages.bloodlineAnalysis() : null,
  'qr-diff':     () => Pages.qrDiff(Store.getParams()),
  'weight-mode': () => Pages.weightMode(Store.getParams()),
  // ── 販売管理（sale.js でも window.PAGES['sale-list'] を自己登録するが、ここにも定義して確実に接続）
  'sale-list':   () => (typeof Pages.saleList === 'function'
    ? Pages.saleList()
    : document.getElementById('main').innerHTML = UI.empty('sale.js が読み込まれていません')),
};

// ── 起動（PAGES定義の後に配置することでPAGES参照を保証） ────────
document.addEventListener('DOMContentLoaded', () => {
  console.log('[APP] boot start - typeof API=', typeof API, '/ window.API=', !!window.API);
  Store.loadFromStorage();
  // CONFIG.GAS_URL を確実にセット（Store.loadFromStorage()内でセットされるが二重確認）
  if (!CONFIG.GAS_URL) {
    const _savedUrl = localStorage.getItem(CONFIG.LS_KEYS.GAS_URL) || '';
    if (_savedUrl) { CONFIG.GAS_URL = _savedUrl; }
  }
  console.log('[APP] CONFIG.GAS_URL raw    :', (CONFIG.GAS_URL || '').slice(0, 70) || '(empty)');
  console.log('[APP] localStorage gas_url  :', (localStorage.getItem(CONFIG.LS_KEYS.GAS_URL) || '').slice(0, 70) || '(empty)');
  console.log('[APP] final GAS_URL         :', CONFIG.GAS_URL ? CONFIG.GAS_URL.slice(0, 70) : '(not set)');
  bindNav();
  bindGlobalEvents();
  renderNav();

  // URLハッシュからページ復元（リロード対応）
  const hash = location.hash.slice(1);
  if (hash) {
    try {
      const hashParams = Object.fromEntries(new URLSearchParams(hash));
      const page = hashParams.page;
      if (page && PAGES[page]) {
        delete hashParams.page;
        const params = Object.keys(hashParams).length ? hashParams : {};
        // hash復元時: nav event を発火せず状態を直接設定してから描画
        Store.navigate(page, params, true);
        _renderPage(page);
        syncIfNeeded();
        return;
      }
    } catch(e) { /* ハッシュ解析失敗時は通常起動 */ }
  }

  console.log('[APP] before first render - typeof API=', typeof API, '/ window.API=', !!window.API);
  routeTo(Store.getPage());
  syncIfNeeded();
});

// ────────────────────────────────────────────────────────────────
// _renderPage — DOM描画を担う内部関数
// ────────────────────────────────────────────────────────────────
function _renderPage(pageId) {
  const main = document.getElementById('main');
  if (!main) return;
  try {
    const vid = document.getElementById('qr-video');
    if (vid && vid.srcObject) {
      vid.srcObject.getTracks().forEach(function(t) { t.stop(); });
      vid.srcObject = null;
    }
    if (typeof Pages._qrStopCamera === 'function') Pages._qrStopCamera();
  } catch (_) {}

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

// ────────────────────────────────────────────────────────────────
// routeTo — 外部から呼ぶ唯一の遷移関数
// ────────────────────────────────────────────────────────────────
function routeTo(pageId, params = {}) {
  if (typeof params === 'string') params = { id: params };
  if (!params || typeof params !== 'object') params = {};

  Store.navigate(pageId, params, true);

  const hashParts = { page: pageId, ...(params || {}) };
  const hashStr = new URLSearchParams(hashParts).toString();
  history.replaceState(null, '', '#' + hashStr);

  _renderPage(pageId);
}

// Store.on('nav') — Store.back() など内部遷移専用ハンドラ
Store.on('nav', () => {
  _renderPage(Store.getPage());
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
  const qrPages = ['qr-scan','qr-diff','weight-mode'];
  const managePages = [
    'lot-list','line-list','parent-list','bloodline-list','pairing-list',
    'line-new','lot-new','parent-new','bloodline-new','pairing-new',
    'lot-detail','line-detail','parent-detail','bloodline-detail','pairing-detail',
    'label-gen',
    'sale-list',
  ];
  document.querySelectorAll('.nav-tab').forEach(el => {
    const nav = el.dataset.nav;
    el.classList.toggle('active',
      nav === cur ||
      (nav === 'qr-scan'  && qrPages.includes(cur)) ||
      (nav === 'manage'   && managePages.includes(cur))
    );
  });
}

// ── グローバルイベント ─────────────────────────────────────────
function bindGlobalEvents() {
  Store.on('loading', () => {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = Store.isLoading() ? 'flex' : 'none';
  });
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
  if (age < 5 * 60 * 1000) return;
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
    Store.setDB('pairings',          d.pairings          || []);
    Store.setDB('pairing_histories', d.pairing_histories || []);
    Store.setDB('egg_records',       d.egg_records       || []);
    Store.setDB('breeding_units',    d.breeding_units    || []);
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
    const back = opts.back === true || (opts.back && opts.back !== false)
      ? `<button class="btn-icon btn-back" onclick="${opts.backFn || 'Store.back()'}">←</button>` : '';
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
    const _STAGE_NORM = {
      L1:'L1L2', L2_EARLY:'L1L2', L2_LATE:'L1L2',
      EGG:'L1L2', T0:'L1L2', T1:'L1L2',
      L3_EARLY:'L3', L3_MID:'L3', L3_LATE:'L3', T2:'L3', T2A:'L3', T2B:'L3', T3:'L3',
    };
    const norm = (code && _STAGE_NORM[code]) ? _STAGE_NORM[code] : code;
    const c = stageColor(norm), l = stageLabel(norm);
    if (!l && !norm) return '';
    const displayLabel = l || norm || '';
    const displayColor = c || '#888';
    return `<span class="badge" style="background:${displayColor}22;color:${displayColor};border:1px solid ${displayColor}55">${displayLabel}</span>`;
  },

  statusBadge(code) {
    const s = Object.values(IND_STATUS).find(x => x.code === code);
    if (!s) return '';
    return `<span class="badge" style="background:${s.color}22;color:${s.color};border:1px solid ${s.color}55">${s.label}</span>`;
  },

  bloodlineBadge(code) {
    if (!code) return '';
    if (String(code).toLowerCase() === 'unknown') return '';
    const s = Object.values(BLOODLINE_STATUS).find(x => x.code === String(code).toLowerCase());
    if (!s) return '';
    return `<span class="badge-sm" style="color:${s.color}">${s.label}</span>`;
  },

  verdictBadge(verdict) {
    if (!verdict) return '';
    const v = VERDICT_COLORS[verdict.cls] || {};
    return `<span class="badge verdict-badge" style="background:${v.bg};color:${v.text};border:1px solid ${v.border}">${v.icon} ${verdict.label}</span>`;
  },

  // ── 日齢表示 ────────────────────────────────────────────────
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

  ageAtRecord(ageDays) {
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
  // build: 20260413bj — 増減列にg/日速度を追加
  weightTable(records, opts = {}) {
    const wts = records.filter(r => r.weight_g && +r.weight_g > 0)
      .sort((a,b) => a.record_date.localeCompare(b.record_date));
    if (!wts.length) return UI.empty('体重記録なし');

    const showEdit = opts.showEdit !== false;

    const rows = wts.map((r, i) => {
      const prev  = i > 0 ? +wts[i-1].weight_g : null;
      const delta = prev !== null ? (+r.weight_g - prev) : null;
      // ▼ 前回記録との日数差を計算（g/日の算出にも使う）
      let _intervalDays = null;
      let _recAgeDays = r.age_days || null;
      if (i > 0) {
        const _prevRec = wts[i-1];
        if (_prevRec && _prevRec.record_date && r.record_date) {
          const _d1 = new Date(String(_prevRec.record_date).replace(/\//g,'-'));
          const _d2 = new Date(String(r.record_date).replace(/\//g,'-'));
          const _dayDiff = Math.round((_d2 - _d1) / 86400000);
          if (_dayDiff > 0) {
            _intervalDays = _dayDiff;
            if (!_recAgeDays) {
              const _wks = Math.floor(_dayDiff / 7);
              _recAgeDays = _wks > 0
                ? '前回+' + _dayDiff + '日（' + _wks + '週）'
                : '前回+' + _dayDiff + '日';
            }
          }
        }
      }
      // ▼ g/日 = 増減 ÷ 経過日数（小数1桁）
      const gPerDay = (delta !== null && _intervalDays !== null && _intervalDays > 0)
        ? (delta / _intervalDays) : null;
      const gPerDayStr = gPerDay !== null
        ? `<div style="font-size:.65rem;color:var(--text3);margin-top:1px">${gPerDay >= 0 ? '+' : ''}${gPerDay.toFixed(1)}g/日</div>`
        : '';
      const dStr = delta !== null
        ? `<span class="delta ${delta>=0?'pos':'neg'}">${delta>=0?'+':''}${delta.toFixed(1)}</span>${gPerDayStr}`
        : '—';
      const recAge = _recAgeDays ? (typeof _recAgeDays === 'number' ? Store.formatRecordAge(_recAgeDays) : String(_recAgeDays)) : '';
      const contStr = r.container  || '';
      const exchStr = r.exchange_type === 'FULL'    ? '全交換'
                    : r.exchange_type === 'PARTIAL'  ? '追加'
                    : (r.exchange_type && r.exchange_type !== '交換なし') ? r.exchange_type : '';
      const matStr  = r.mat_type ? (r.mat_type + (r.has_malt ? '（M）' : '')) : '';
      const editBtn = showEdit && r.record_id
        ? `<button style="font-size:.65rem;padding:2px 6px;border:1px solid var(--border);
            border-radius:10px;background:transparent;color:var(--text3);cursor:pointer;white-space:nowrap"
            onclick="Pages._grEditRecord('${r.record_id}')">✏️</button>`
        : '';
      return `<tr>
        <td style="white-space:nowrap">${r.record_date}</td>
        <td style="white-space:nowrap"><b>${r.weight_g}g</b></td>
        <td style="white-space:nowrap">${dStr}</td>
        <td>${UI.stageBadge(r.stage)}</td>
        <td style="font-size:.72rem;color:var(--text3);white-space:nowrap">${[contStr,matStr,exchStr].filter(Boolean).join('/')}</td>
        <td class="td-age" style="white-space:nowrap">${recAge}</td>
        ${showEdit ? `<td>${editBtn}</td>` : ''}
      </tr>`;
    }).join('');

    return `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table class="data-table" style="font-size:.8rem;min-width:360px">
        <thead><tr>
          <th style="white-space:nowrap">日付</th>
          <th style="white-space:nowrap">体重</th>
          <th style="white-space:nowrap">増減/速度</th>
          <th style="white-space:nowrap">ステージ</th>
          <th style="white-space:nowrap">容器/マット</th>
          <th style="white-space:nowrap">日齢</th>
          ${showEdit ? '<th></th>' : ''}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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

// ════════════════════════════════════════════════════════════════
// Phase2 UI拡張 — modal / actionSheet / detailRow など
// ════════════════════════════════════════════════════════════════
Object.assign(UI, {

  modal(html) {
    let wrap = document.getElementById('modal-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'modal-wrap';
      document.body.appendChild(wrap);
    }
    wrap.innerHTML = `
      <div class="modal-overlay" onclick="UI.closeModal()" style="pointer-events:auto"></div>
      <div class="modal" onclick="event.stopPropagation()" style="pointer-events:auto">${html}</div>`;
    wrap.style.display = 'block';
    wrap.style.pointerEvents = 'auto';
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    const wrap = document.getElementById('modal-wrap');
    if (wrap) {
      wrap.style.display = 'none';
      wrap.style.pointerEvents = 'none';
      wrap.innerHTML = '';
    }
    document.body.style.overflow = '';
  },

  actionSheet(items) {
    window.__actionCallbacks = items.map(item => item.fn);
    const btns = items.map((item, i) =>
      `<button class="action-sheet-btn" style="pointer-events:auto" onclick="event.stopPropagation();UI.closeModal();setTimeout(()=>{window.__actionCallbacks[${i}]&&window.__actionCallbacks[${i}]()},30)">${item.label}</button>`
    ).join('');
    UI.modal(`
      <div class="action-sheet" onclick="event.stopPropagation()">
        ${btns}
        <button class="action-sheet-btn action-sheet-cancel" style="pointer-events:auto" onclick="event.stopPropagation();UI.closeModal()">キャンセル</button>
      </div>`);
  },

  detailRow(label, value) {
    return `<div class="detail-row">
      <span class="detail-label">${label}</span>
      <span class="detail-value">${value ?? '—'}</span>
    </div>`;
  },
});

// Phase2 ルート追加
Object.assign(PAGES, {
  'line-analysis':   () => Pages.lineAnalysis(),
  'mother-ranking':  () => Pages.motherRanking(),
  'heatmap':         () => Pages.bloodlineHeatmap(),
  'parent-dashboard':() => Pages.parentDashboard(),
});

// ── バチルスリマインドを管理タブ・ダッシュボードに差し込む ────────
// Pages.manage / Pages.dashboard をラップして
// ページ描画後にリマインドバナーを先頭に挿入する
(function() {
  function _injectBacilusIfNeeded() {
    if (typeof window._getBacilusDueReminders !== 'function') return;
    var due = window._getBacilusDueReminders();
    if (!due.length) return;
    // page-body の先頭に挿入
    var body = document.querySelector('.page-body');
    if (!body || body.querySelector('#bacilus-remind-area')) return;
    var div = document.createElement('div');
    div.innerHTML = window._renderBacilusReminderBanner();
    body.insertBefore(div.firstChild, body.firstChild);
  }

  // manage ページをフック
  var _origManage = null;
  Object.defineProperty(Pages, 'manage', {
    get: function() { return _origManage; },
    set: function(fn) {
      _origManage = function() {
        fn.apply(this, arguments);
        setTimeout(_injectBacilusIfNeeded, 100);
      };
    },
    configurable: true,
  });

  // dashboard ページもフック
  var _origDash = Pages.dashboard;
  if (typeof _origDash === 'function') {
    Pages.dashboard = function() {
      _origDash.apply(this, arguments);
      setTimeout(_injectBacilusIfNeeded, 100);
    };
  }
})();


// ════════════════════════════════════════════════════════════════
// 【4】JavaScript (Pages)
// ════════════════════════════════════════════════════════════════


// ────────────────────────────────────────────────────────────────
