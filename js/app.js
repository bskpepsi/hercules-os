// ════════════════════════════════════════════════════════════════
// app.js
// 役割: アプリの起動・ルーティング・ローディング・トースト・
//       共通UIユーティリティを担う。各画面JSの呼び出し元。
//       画面ごとのrender関数を呼び分けるシンプルなSPAルーター。
//
// P0-1修正: routeTo の二重実行を解消
//   Store.navigate() に第3引数 _skipNavEvent=true を追加。
//   routeTo 経由では nav イベントを発火させず、
//   _renderPage を routeTo 内で1回だけ呼ぶ。
//   Store.on('nav') は Store.back() などの内部遷移専用として残す。
//
// P0-2修正: sale-list を PAGES に追加、managePages に sale-list を追加。
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
  'unit-detail': () => Pages.unitDetail ? Pages.unitDetail(Store.getParams()) : null,
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
// ページ関数を呼び出し、ナビを更新する。
// routeTo と Store.on('nav') の両方から呼ばれる。
// ────────────────────────────────────────────────────────────────
function _renderPage(pageId) {
  const main = document.getElementById('main');
  if (!main) return;
  // ── カメラストリームを必ず停止（どの画面へ移動する場合も） ──────
  // video.srcObject が残っていたらトラックを全停止してから DOM を破棄する。
  // これにより QR画面 → 成長記録画面 などの遷移でもカメラが裏で動き続けない。
  try {
    const vid = document.getElementById('qr-video');
    if (vid && vid.srcObject) {
      vid.srcObject.getTracks().forEach(function(t) { t.stop(); });
      vid.srcObject = null;
    }
    // _qrStopCamera が存在する場合は UI状態も一緒に片付ける
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
//
// 【P0-1修正の核心】
//   Store.navigate(pageId, params, true) の第3引数 true が
//   nav イベント発火をスキップさせる（store.js 側で対応済み）。
//   これにより Store.on('nav') と routeTo 自身の二重描画が解消される。
// ────────────────────────────────────────────────────────────────
function routeTo(pageId, params = {}) {
  // 文字列で渡された場合は { id: '...' } に正規化（後方互換）
  if (typeof params === 'string') params = { id: params };
  if (!params || typeof params !== 'object') params = {};

  // 状態更新（_skipNavEvent=true で nav event は発火しない）
  Store.navigate(pageId, params, true);

  // URLハッシュ更新（リロード時に復元できるよう）
  const hashParts = { page: pageId, ...(params || {}) };
  const hashStr = new URLSearchParams(hashParts).toString();
  history.replaceState(null, '', '#' + hashStr);

  // 描画は1回だけここで実行
  _renderPage(pageId);
}

// Store.on('nav') — Store.back() など内部遷移専用ハンドラ
// routeTo 経由では nav event が発火しないため二重描画は起きない。
// Store.back() → navigate() → _notify('nav') → ここが動く、という経路のみ。
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
  // QR系ページ → QRタブをアクティブに
  const qrPages = ['qr-scan','qr-diff','weight-mode'];
  // 管理系ページ → 管理タブをアクティブに（sale-list を追加）
  const managePages = [
    'lot-list','line-list','parent-list','bloodline-list','pairing-list',
    'line-new','lot-new','parent-new','bloodline-new','pairing-new',
    'lot-detail','line-detail','parent-detail','bloodline-detail','pairing-detail',
    'label-gen',
    'sale-list',   // 販売管理も管理タブ配下
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
  // ローディング
  Store.on('loading', () => {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = Store.isLoading() ? 'flex' : 'none';
  });
  // 動的ナビ（data-nav 属性クリック委譲）
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
    // 旧コードを新6区分に丸めてから表示
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
    // unknown / UNKNOWN の場合はバッジを出さない
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
  weightTable(records, opts = {}) {
    const wts = records.filter(r => r.weight_g && +r.weight_g > 0)
      .sort((a,b) => a.record_date.localeCompare(b.record_date));
    if (!wts.length) return UI.empty('体重記録なし');

    const showEdit = opts.showEdit !== false;

    const rows = wts.map((r, i) => {
      const prev  = i > 0 ? +wts[i-1].weight_g : null;
      const delta = prev !== null ? (+r.weight_g - prev) : null;
      const dStr  = delta !== null
        ? `<span class="delta ${delta>=0?'pos':'neg'}">${delta>=0?'+':''}${delta.toFixed(1)}</span>`
        : '—';
      // age_days: GASからなければ前回記録との日数差を計算
      let _recAgeDays = r.age_days || null;
      if (!_recAgeDays && i > 0) {
        const _prevRec = wts[i-1];
        if (_prevRec && _prevRec.record_date && r.record_date) {
          const _d1 = new Date(String(_prevRec.record_date).replace(/\//g,'-'));
          const _d2 = new Date(String(r.record_date).replace(/\//g,'-'));
          const _dayDiff = Math.round((_d2 - _d1) / 86400000);
          if (_dayDiff > 0) {
            const _wks = Math.floor(_dayDiff / 7);
            _recAgeDays = _wks > 0
              ? '前回+' + _dayDiff + '日（' + _wks + '週）'
              : '前回+' + _dayDiff + '日';
          }
        }
      }
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
        <td>${dStr}</td>
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
          <th style="white-space:nowrap">増減</th>
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
