// FILE: js/app.js
// ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// app.js
// build: 20260424q
// 変更点:
//   - [20260424q] 🐛 起動時 ReferenceError 修正 (バチルスフック)
//     症状: Console に
//       "Uncaught ReferenceError: Pages is not defined at app.js:1034:25"
//       が出て、その後の処理が止まりユニット一覧の体重が更新されない等の
//       二次障害が発生していた。
//     原因: バチルスリマインド差し込み用の IIFE が app.js 本体の末尾で
//       即実行され、その時点では個別ページ JS (individual.js 等) が
//       `const Pages = window.Pages || {}` で Pages を定義する前だった
//       ため ReferenceError。
//     修正: IIFE を関数 _setupBacilusHook に変換し、DOMContentLoaded
//       イベントで遅延実行するよう変更。個別ページ JS は同期ロードなので
//       DOMContentLoaded 時点で Pages は必ず定義済み。
//       Pages.manage が既に代入されているケースにも対応 (直接 wrap)。
//   - [20260424h] 🔥 個体画面の重複排除で unit_slot_no を無視するよう改善
//     症状: 個体詳細の成長記録で、T3移行後に 04/24 85g L3 が 2行重複表示される。
//           (20260424g 修正でもこのケースは残っていた)
//     原因: ユニット時代の成長記録は unit_slot_no=1 などが入っており、
//           個体化後の API 応答で返される _growthRecords では unit_slot_no が
//           空になっているケースがある。_gr_dedupe のキーに unit_slot_no を
//           含めていたため、同じイベントを「slot="1" と slot=""」で別物として
//           扱ってしまい重複が残った。
//     修正: _gr_dedupe に opts.ignoreSlot を追加し、個体画面・個体ラベルから
//           呼ぶ時は true を指定して slot をキーから外す。ユニット画面は
//           従来通り slot 込みで判定 (2頭を区別する必要があるため)。
//           weightTable (個体用) は冒頭で自動的に ignoreSlot=true で呼ぶ。
//           weightTableUnit (ユニット用) は slot 付きのまま。
//   - [20260424g] 🔥 成長記録テーブルの重複行問題を根本解決
//     症状: 個体詳細・ユニット詳細で、同じ日付・同じ体重の行が 2行重複表示
//           される (例: 04/24 70g L3 が 2行連続)。
//     原因: 成長記録は複数のキーで Store に保存される (lot_id / unit_id /
//           unit_display_id / ind_id)。個体化に伴って API が返す
//           _growthRecords (ユニット時代をマージ済み) が ind_id キーに追加
//           される一方、別の経路 (T2/T3 セッション確定時の自動生成など) で
//           同じイベントが異なる record_id で重複生成されるケースがあり、
//           record_id による重複排除だけでは捕捉できなかった。
//     修正: UI._gr_dedupe(records) 共通ヘルパーを新設し、日付×体重×スロット
//           をキーに重複排除。情報量が多い方を残す。weightTable /
//           weightTableUnit の冒頭で自動適用するため、呼び出し側が何も
//           しなくても全テーブルで重複が消える。
//           これにより画像2のような同日70g 2行表示が解消される。
//   - [20260422r] ボトムナビのハイライト制御を飼育ナビに対応（Phase D）
//     ① 新しい kanbanPages 配列を追加:
//        ['lot-list','lot-detail','unit-detail','ind-detail','ind-list']
//        これらのページにいるとき 🐛飼育 ボタンがハイライトされる。
//     ② managePages から 'lot-list' と 'lot-detail' を削除
//        (以前は 📋管理 と重複してハイライトしていた)
//     ③ renderNav の toggle 条件に
//          (nav === 'lot-list' && kanbanPages.includes(cur))
//        を追加。
// 役割: アプリの起動・ルーティング・ローディング・トースト・
//       共通UIユーティリティを担う。各画面JSの呼び出し元。
//       画面ごとのrender関数を呼び分けるシンプルなSPAルーター。
//
// build: 20260420b
// 変更点:
//   - [20260420b] 未確定セッション通知システム用のヘルパーを追加
//       UI.getPendingSessions(): localStorage の T1/T2/T3 セッションを検出
//         条件: units.length >= 1 || singles.length >= 1（成果があるもののみ）
//       UI.pendingBanner(): 1行簡潔バナーHTML生成（タップで一覧ページへ）
//       window.PAGES に 'pending-sessions' ルート追加
//   - [20260420a] UI.weightTableUnit: 日付順を昇順表示に変更（古い=上、新しい=下）
//                 以前は rowsData.reverse() で降順表示していたが、個体用 weightTable
//                 (昇順)と挙動を揃えるため除去。
//   - [20260419e] UI.weightTableUnit: editHandler オプションで編集ボタンの
//                 onclick 呼び出し関数名を切替可能に。ユニット画面では
//                 Pages._udEditGrowthRecord(r1_id, r2_id, date) を呼び出せる。
//   - [20260419d] 編集列を sticky 右端固定に変更。横スクロールしても
//                 編集ボタンが常に画面内に見える。個体版・ユニット版両方に適用。
//   - [20260419d] セルの padding を 8px 4px で統一してコンパクトに。
//   - [20260419c] 編集ボタン視認性改善 / 体重セル中央揃え / 等幅フォント
//   - [20260419b] UI.weightTableUnit の ①/② 色を 金色/緑色 に変更
//   - [20260419a] UI.weightTable 日付 MM/DD表記・UI.weightTableUnit 新設
//   - [20260413bj] UI.weightTable — 増減列にg/日速度を追加
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
  'growth-charts':     () => Pages.growthCharts ? Pages.growthCharts(Store.getParams()) : null,
  'analysis-menu':     () => Pages.analysisMenu ? Pages.analysisMenu() : null,
  'qr-diff':     () => Pages.qrDiff(Store.getParams()),
  'weight-mode': () => Pages.weightMode(Store.getParams()),
  // ── 販売管理（sale.js でも window.PAGES['sale-list'] を自己登録するが、ここにも定義して確実に接続）
  'sale-list':   () => (typeof Pages.saleList === 'function'
    ? Pages.saleList()
    : document.getElementById('main').innerHTML = UI.empty('sale.js が読み込まれていません')),
  // ── [20260420b] 未確定セッション一覧 ──
  'pending-sessions': () => (typeof Pages.pendingSessions === 'function'
    ? Pages.pendingSessions()
    : document.getElementById('main').innerHTML = UI.empty('pending_sessions.js が読み込まれていません')),
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
  // [20260422r] 飼育管理系 (🐛飼育 ナビ) でハイライトされるページ群
  const kanbanPages = ['lot-list','lot-detail','unit-detail','ind-detail','ind-list'];
  // [20260422r] 'lot-list','lot-detail' は kanbanPages へ移動したので削除
  const managePages = [
    'line-list','parent-list','bloodline-list','pairing-list',
    'line-new','lot-new','parent-new','bloodline-new','pairing-new',
    'line-detail','parent-detail','bloodline-detail','pairing-detail',
    'label-gen',
    'sale-list',
    'analysis-menu','line-analysis','mother-ranking','heatmap','parent-dashboard','bloodline-analysis',
  ];
  document.querySelectorAll('.nav-tab').forEach(el => {
    const nav = el.dataset.nav;
    el.classList.toggle('active',
      nav === cur ||
      (nav === 'qr-scan'  && qrPages.includes(cur)) ||
      (nav === 'manage'   && managePages.includes(cur)) ||
      (nav === 'lot-list' && kanbanPages.includes(cur))
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

  // ════════════════════════════════════════════════════════════
  // 体重推移テーブル共通ヘルパー（weightTable / weightTableUnit で共有）
  // [20260419a] 日付 MM/DD 表記・交換種別日本語化・容器/マット/交換の3連結
  // ════════════════════════════════════════════════════════════
  _gr_shortDate(d) {
    // "2026/04/18" → "04/18"、"2026-04-18" → "04/18"
    const s = String(d || '').replace(/-/g, '/');
    const parts = s.split('/');
    if (parts.length >= 3) return parts[1] + '/' + parts[2];
    return s;
  },
  _gr_exchLabel(ex) {
    const map = { 'FULL':'全', 'PARTIAL':'追', 'ADD':'追', 'NONE':'' };
    if (map[ex] !== undefined) return map[ex];
    return (ex && ex !== '交換なし') ? ex : '';
  },
  _gr_envStr(r) {
    // 容器/マット/交換 を "/" で連結（空のものは飛ばす）
    const cont = r.container || '';
    const mat  = r.mat_type ? (r.mat_type + (r.has_malt ? '(M)' : '')) : '';
    const exch = UI._gr_exchLabel(r.exchange_type);
    return [cont, mat, exch].filter(Boolean).join('/');
  },
  _gr_intervalDays(prevRec, curRec) {
    if (!prevRec || !prevRec.record_date || !curRec.record_date) return null;
    const d1 = new Date(String(prevRec.record_date).replace(/\//g,'-'));
    const d2 = new Date(String(curRec.record_date).replace(/\//g,'-'));
    const diff = Math.round((d2 - d1) / 86400000);
    return diff > 0 ? diff : null;
  },
  _gr_ageStr(ageDays) {
    if (ageDays == null || ageDays === '') return '';
    if (typeof ageDays === 'number') return Store.formatRecordAge(ageDays);
    return String(ageDays);
  },

  // ════════════════════════════════════════════════════════════
  // [20260424g] 成長記録の重複排除ヘルパー (共通)
  // [20260424h] opts.ignoreSlot 追加 — 個体視点では unit_slot_no を無視
  // ════════════════════════════════════════════════════════════
  // 背景: 成長記録は複数の経路で生成され、Store 上の複数キーで保存される:
  //   ① T1前のロット時代: target_type='LOT' / target_id=lot_id
  //   ② T1-T3中のユニット時代: target_type='UNIT'(or 'BU') / target_id=unit_id
  //      または unit_display_id キー。unit_slot_no で 1頭目/2頭目を識別。
  //   ③ 個別化後: target_type='IND' / target_id=ind_id
  //   ④ T2/T3 セッション確定時に上記の遷移に伴う成長記録が自動生成されることがある
  //
  // これらは表示時にマージされるが、record_id だけでの重複排除だと、
  // 同じイベント(同日・同体重)に対して異なる record_id が振られた重複が残る。
  // 具体例: T3 セッションで個体化された直後、T3 時点の体重記録が
  //   ① unit 時代のキーに1件 (unit_slot_no 付き)
  //   ② 新しい ind_id キーに1件 (unit_slot_no なし、同日・同体重)
  // の 2件として存在し、個体詳細テーブルで 04/24 85g が 2行並ぶ現象が起きる。
  //
  // [20260424h] 対応: 個体画面 (個体詳細・ラベル) から呼ぶ時は opts.ignoreSlot
  //   を true にして unit_slot_no をキーから外す。ユニット画面では slot 込みの
  //   既存ロジックを使う。
  //
  // 本ヘルパーは「同日・同体重」(+ オプションでスロット) のレコードを 1件に集約。
  // 優先順位: (a) record_id が _tmp_ でない実レコードを優先
  //            (b) より多くのフィールド (stage/mat_type/container 等) を持つ方を優先
  _gr_dedupe(records, opts) {
    opts = opts || {};
    var ignoreSlot = !!opts.ignoreSlot;
    if (!Array.isArray(records) || records.length <= 1) return records || [];
    // 日付正規化: "2026-04-24" / "2026/4/24" → "2026/04/24"
    var _norm = function(d) {
      if (!d) return '';
      var s = String(d).trim().replace(/-/g, '/');
      var m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      if (m) return m[1] + '/' + String(parseInt(m[2],10)).padStart(2,'0') + '/' + String(parseInt(m[3],10)).padStart(2,'0');
      return s;
    };
    // フィールド情報量スコア (多く埋まっている方を残す)
    var _score = function(r) {
      if (!r) return 0;
      var sc = 0;
      if (r.stage)         sc++;
      if (r.mat_type)      sc++;
      if (r.container)     sc++;
      if (r.exchange_type && r.exchange_type !== 'NONE') sc++;
      if (r.note_private)  sc++;
      if (r.sex)           sc++;
      if (r.size_category) sc++;
      if (r.age_days != null && r.age_days !== '') sc++;
      // 実レコード (_tmp_ でない) は +5
      if (r.record_id && String(r.record_id).indexOf('_tmp_') !== 0) sc += 5;
      return sc;
    };
    var seen = {};
    var out  = [];
    records.forEach(function(r) {
      if (!r) return;
      // 重複キー: 日付 + 体重 (+ スロット)
      //   体重は小数点1桁丸めで比較 (66.0 と 66 を同一視)
      //   スロットは ignoreSlot=true の場合はキーから外す (個体画面用)
      var _d = _norm(r.record_date);
      var _w = (r.weight_g !== '' && r.weight_g !== null && r.weight_g !== undefined)
        ? Math.round(parseFloat(r.weight_g) * 10) / 10
        : '';
      var _s;
      if (ignoreSlot) {
        _s = '';
      } else {
        _s = (r.unit_slot_no !== '' && r.unit_slot_no !== null && r.unit_slot_no !== undefined)
          ? String(r.unit_slot_no)
          : '';
      }
      var key = _d + '|' + _w + '|' + _s;
      if (!_d) {
        // 日付が無い record はキー化できないのでそのまま通す
        out.push(r);
        return;
      }
      if (seen[key] === undefined) {
        seen[key] = out.length;
        out.push(r);
      } else {
        // 既に同一キーのレコードがある → スコアの高い方を残す
        var _idxPrev = seen[key];
        if (_score(r) > _score(out[_idxPrev])) {
          out[_idxPrev] = r;
        }
      }
    });
    if (out.length < records.length) {
      console.log('[UI._gr_dedupe]', records.length, '→', out.length, '(removed', records.length - out.length, 'duplicates, ignoreSlot=' + ignoreSlot + ')');
    }
    return out;
  },

  // ── 体重推移 HTML テーブル（個体・ロット共通）────────────────
  // [20260419a] 日付を MM/DD 表記に短縮
  // [20260424g] 入力レコードを _gr_dedupe で重複排除
  // [20260424h] 個体用テーブルなので ignoreSlot=true で slot 無視
  //   (ユニット時代の slot 付きレコードと個体化後の slot なしレコードを統合)
  weightTable(records, opts = {}) {
    const dedupedInput = UI._gr_dedupe(records || [], { ignoreSlot: true });
    const wts = dedupedInput.filter(r => r.weight_g && +r.weight_g > 0)
      .sort((a,b) => a.record_date.localeCompare(b.record_date));
    if (!wts.length) return UI.empty('体重記録なし');

    const showEdit = opts.showEdit !== false;

    const rows = wts.map((r, i) => {
      const prev  = i > 0 ? +wts[i-1].weight_g : null;
      const delta = prev !== null ? (+r.weight_g - prev) : null;
      const intervalDays = i > 0 ? UI._gr_intervalDays(wts[i-1], r) : null;

      // g/日 = 増減 ÷ 経過日数（小数1桁）
      const gPerDay = (delta !== null && intervalDays !== null && intervalDays > 0)
        ? (delta / intervalDays) : null;
      const gPerDayStr = gPerDay !== null
        ? `<div style="font-size:.65rem;color:var(--text3);margin-top:1px">${gPerDay >= 0 ? '+' : ''}${gPerDay.toFixed(1)}g/日</div>`
        : '';
      const dStr = delta !== null
        ? `<span class="delta ${delta>=0?'pos':'neg'}">${delta>=0?'+':''}${delta.toFixed(1)}</span>${gPerDayStr}`
        : '—';

      // 日齢: age_days 優先、なければ前回+日数
      let recAge = UI._gr_ageStr(r.age_days);
      if (!recAge && intervalDays !== null) {
        const w = Math.floor(intervalDays / 7);
        recAge = w > 0 ? '前回+' + intervalDays + '日(' + w + '週)' : '前回+' + intervalDays + '日';
      }

      const editBtn = showEdit && r.record_id
        ? `<button style="font-size:.82rem;padding:3px 6px;border:1px solid var(--border);
            border-radius:6px;background:var(--surface2);color:var(--text2);cursor:pointer;white-space:nowrap;line-height:1"
            onclick="Pages._grEditRecord('${r.record_id}')">✏️</button>`
        : '';
      return `<tr>
        <td style="white-space:nowrap;padding:8px 4px">${UI._gr_shortDate(r.record_date)}</td>
        <td style="white-space:nowrap;text-align:center;padding:8px 4px"><b>${r.weight_g}g</b></td>
        <td style="white-space:nowrap;padding:8px 4px">${dStr}</td>
        <td style="padding:8px 4px">${UI.stageBadge(r.stage)}</td>
        <td style="font-size:.72rem;color:var(--text3);white-space:nowrap;padding:8px 4px">${UI._gr_envStr(r)}</td>
        <td class="td-age" style="white-space:nowrap;font-size:.7rem;padding:8px 4px">${recAge}</td>
        ${showEdit ? `<td style="text-align:center;padding:8px 4px;position:sticky;right:0;background:var(--bg2, var(--bg));box-shadow:-4px 0 6px -3px rgba(0,0,0,.4)">${editBtn}</td>` : ''}
      </tr>`;
    }).join('');

    return `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table class="data-table" style="font-size:.8rem;min-width:360px;border-collapse:collapse">
        <thead><tr>
          <th style="white-space:nowrap;padding:6px 4px">日付</th>
          <th style="white-space:nowrap;text-align:center;padding:6px 4px">体重</th>
          <th style="white-space:nowrap;padding:6px 4px">増減/速度</th>
          <th style="white-space:nowrap;padding:6px 4px">ステージ</th>
          <th style="white-space:nowrap;padding:6px 4px">容器/マット/交換</th>
          <th style="white-space:nowrap;padding:6px 4px">日齢</th>
          ${showEdit ? '<th style="white-space:nowrap;text-align:center;padding:6px 4px;position:sticky;right:0;background:var(--bg2, var(--bg));box-shadow:-4px 0 6px -3px rgba(0,0,0,.4)">編集</th>' : ''}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  },

  // ── ユニット用 体重推移 HTML テーブル（2頭バージョン）────────
  // [20260419a] 新設
  //   個体用 weightTable と列構成を揃え、体重列だけ「体重①(増減)/体重②(増減)」の2列に拡張
  //   日付ごとにグループ化（unit_slot_no で 1頭目/2頭目を振り分け）
  //   容器/マット/交換は日付行で共通（slot1/slot2 で同じ値が入る前提）
  //
  //   引数:
  //     records: 成長記録配列（unit_slot_no=1 or 2 の行を含む）
  //     opts:
  //       showEdit: bool — 編集ボタンを表示するか (default: true)
  //       maxDays:  number — 最大日付数
  //       editHandler: string — 編集ボタンのonclick呼び出し関数名
  //                    (default: 'Pages._grEditRecord')
  //                    指定時は "${editHandler}('record_id1','record_id2','date')" の形で呼ぶ
  //                    → ユニット画面では両スロットの record_id と日付を受け取れる
  weightTableUnit(records, opts = {}) {
    if (!records || records.length === 0) return UI.empty('体重記録なし');
    // [20260424g] ユニット画面でも冒頭で重複排除 (個体と同じ理由)
    records = UI._gr_dedupe(records);

    // 日付でグループ化（slot1/slot2 を各日付行にマージ）
    const byDate = {};
    records.forEach(r => {
      const d = String(r.record_date || '');
      if (!d) return;
      if (!byDate[d]) {
        byDate[d] = { date: d, slot1: null, slot2: null };
      }
      const slot = parseInt(r.unit_slot_no, 10);
      if (slot === 1) byDate[d].slot1 = r;
      else if (slot === 2) byDate[d].slot2 = r;
      else {
        // スロット情報なしの記録: slot1 空なら slot1 に、そうでなければ slot2 に入れる
        if (!byDate[d].slot1) byDate[d].slot1 = r;
        else if (!byDate[d].slot2) byDate[d].slot2 = r;
      }
    });

    // 日付昇順（増減計算用）
    const dateKeys = Object.keys(byDate).sort();
    if (!dateKeys.length) return UI.empty('体重記録なし');

    // 増減計算（slot ごとに前回体重を追跡）
    let prevW1 = null, prevW2 = null;
    const rowsData = dateKeys.map((d, i) => {
      const g = byDate[d];
      const r1 = g.slot1;
      const r2 = g.slot2;
      const w1 = r1 && r1.weight_g ? +r1.weight_g : null;
      const w2 = r2 && r2.weight_g ? +r2.weight_g : null;

      const d1 = (w1 !== null && prevW1 !== null) ? (Math.round((w1 - prevW1) * 10) / 10) : null;
      const d2 = (w2 !== null && prevW2 !== null) ? (Math.round((w2 - prevW2) * 10) / 10) : null;

      if (w1 !== null) prevW1 = w1;
      if (w2 !== null) prevW2 = w2;

      // 代表レコード（ステージ・環境・日齢用）
      const repR = r1 || r2;

      // 経過日数（前回日付との差）
      const intervalDays = i > 0 ? UI._gr_intervalDays(byDate[dateKeys[i-1]].slot1 || byDate[dateKeys[i-1]].slot2, repR) : null;

      return {
        date: d,
        r1: r1, r2: r2,
        w1: w1, w2: w2,
        d1: d1, d2: d2,
        repR: repR,
        intervalDays: intervalDays,
      };
    });

    // [20260420a] 表示は昇順（古い日付が上、新しい日付が下）— 個体用 weightTable と統一
    //   以前: rowsData.reverse() で降順にしていたが、ユーザー要望で昇順に戻す
    const limited = opts.maxDays ? rowsData.slice(0, opts.maxDays) : rowsData;

    const showEdit = opts.showEdit !== false;

    function _weightCell(w, delta, color) {
      if (w === null) return '<span style="color:var(--text3)">—</span>';
      const deltaStr = delta !== null
        ? '<span style="font-size:.68rem;margin-left:3px;color:' + (delta >= 0 ? 'var(--green)' : 'var(--red,#e05050)') + '">'
          + (delta >= 0 ? '+' : '') + delta + '</span>'
        : '';
      // 体重は等幅フォントで中央揃え
      return '<span style="font-family:var(--font-mono);font-weight:700;color:' + color + '">'
        + w + '<span style="font-size:.72rem;margin-left:1px">g</span></span>'
        + deltaStr;
    }

    const rowsHtml = limited.map(rd => {
      const cell1 = _weightCell(rd.w1, rd.d1, '#c8a84b');  // 1頭目: 金色
      const cell2 = _weightCell(rd.w2, rd.d2, '#4caf78');  // 2頭目: 緑色

      // 日齢: age_days 優先、なければ前回からの経過日数
      let recAge = UI._gr_ageStr(rd.repR && rd.repR.age_days);
      if (!recAge && rd.intervalDays !== null) {
        const w = Math.floor(rd.intervalDays / 7);
        recAge = w > 0 ? '前回+' + rd.intervalDays + '日(' + w + '週)' : '前回+' + rd.intervalDays + '日';
      }

      // 編集ボタン: slot1 or slot2 の record_id を使う（slot1 優先）
      // [20260419d] sticky で右端固定表示（横スクロールしても常に見える）
      // [20260419e] editHandler オプションでユニット用ハンドラに切替可能
      //   デフォルト: 単一record_id方式 (Pages._grEditRecord)
      //   指定時: "${editHandler}('r1_id','r2_id','date')" 形式でユニット用編集を呼ぶ
      const editHandler = opts.editHandler || 'Pages._grEditRecord';
      const r1Id = (rd.r1 && rd.r1.record_id) ? String(rd.r1.record_id) : '';
      const r2Id = (rd.r2 && rd.r2.record_id) ? String(rd.r2.record_id) : '';
      const hasAnyId = r1Id || r2Id;
      let onclickAttr = '';
      if (hasAnyId) {
        if (opts.editHandler) {
          // ユニット用: 3引数 (r1_id, r2_id, date)
          onclickAttr = `${editHandler}('${r1Id}','${r2Id}','${rd.date}')`;
        } else {
          // デフォルト: 単一record_id方式
          const singleId = r1Id || r2Id;
          onclickAttr = `${editHandler}('${singleId}')`;
        }
      }
      const editBtn = showEdit && hasAnyId
        ? `<button style="font-size:.82rem;padding:3px 6px;border:1px solid var(--border);
            border-radius:6px;background:var(--surface2);color:var(--text2);cursor:pointer;white-space:nowrap;line-height:1"
            onclick="${onclickAttr}">✏️</button>`
        : '';

      return `<tr>
        <td style="white-space:nowrap;padding:8px 4px">${UI._gr_shortDate(rd.date)}</td>
        <td style="white-space:nowrap;text-align:center;padding:8px 4px">${cell1}</td>
        <td style="white-space:nowrap;text-align:center;padding:8px 4px">${cell2}</td>
        <td style="padding:8px 4px">${UI.stageBadge(rd.repR && rd.repR.stage)}</td>
        <td style="font-size:.72rem;color:var(--text3);white-space:nowrap;padding:8px 4px">${UI._gr_envStr(rd.repR || {})}</td>
        <td class="td-age" style="white-space:nowrap;font-size:.7rem;padding:8px 4px">${recAge}</td>
        ${showEdit ? `<td style="text-align:center;padding:8px 4px;position:sticky;right:0;background:var(--bg2, var(--bg));box-shadow:-4px 0 6px -3px rgba(0,0,0,.4)">${editBtn}</td>` : ''}
      </tr>`;
    }).join('');

    return `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table class="data-table" style="font-size:.8rem;min-width:440px;border-collapse:collapse">
        <thead><tr>
          <th style="white-space:nowrap;padding:6px 4px">日付</th>
          <th style="white-space:nowrap;color:#c8a84b;text-align:center;padding:6px 4px">①体重</th>
          <th style="white-space:nowrap;color:#4caf78;text-align:center;padding:6px 4px">②体重</th>
          <th style="white-space:nowrap;padding:6px 4px">ステージ</th>
          <th style="white-space:nowrap;padding:6px 4px">容器/マット/交換</th>
          <th style="white-space:nowrap;padding:6px 4px">日齢</th>
          ${showEdit ? '<th style="white-space:nowrap;text-align:center;padding:6px 4px;position:sticky;right:0;background:var(--bg2, var(--bg));box-shadow:-4px 0 6px -3px rgba(0,0,0,.4)">編集</th>' : ''}
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
  },

  // ════════════════════════════════════════════════════════════════
  // [20260420b] 未確定セッション通知システム
  // ════════════════════════════════════════════════════════════════
  //
  // localStorage に保持されている T1/T2/T3 移行セッションのうち、
  // 「確定操作まで進んだが最終保存が完了していないもの」を検出してバナー表示する。
  //
  // 検出条件:
  //   T1: _t1SessionData 内の units.length >= 1 または singles.length >= 1
  //       （ユニット/個別飼育が1件以上確定済み = セッションに実質的な成果がある）
  //   T2: _t2SessionData 内の units.length >= 1 または individualized.length >= 1
  //   T3: _t3SessionData 内の units.length >= 1 または individualized.length >= 1
  //
  //   単に「セッションを開いた」だけのデータは通知しない（条件未達で破棄OK）。
  // ════════════════════════════════════════════════════════════════

  getPendingSessions() {
    const list = [];

    // T1
    try {
      const raw = localStorage.getItem('_t1SessionData');
      if (raw) {
        const s = JSON.parse(raw);
        const unitCount   = Array.isArray(s.units)   ? s.units.length   : 0;
        const singleCount = Array.isArray(s.singles) ? s.singles.length : 0;
        if (unitCount >= 1 || singleCount >= 1) {
          const lotLabel = (s.lots || []).map(function(l){ return l.display_id || l.lot_id; }).join(', ');
          const totalHead = (s.lots || []).reduce(function(a, l){ return a + (parseInt(l.count, 10) || 0); }, 0);
          list.push({
            type:       'T1',
            label:      'T1移行',
            sessionId:  s.sessionId || '',
            lotLabel:   lotLabel || '—',
            lotIds:     (s.lots || []).map(function(l){ return l.lot_id; }),
            totalHead:  totalHead,
            unitCount:  unitCount,
            singleCount:singleCount,
            updatedAt:  s.session_date || '',
          });
        }
      }
    } catch(e) { console.warn('[UI.getPendingSessions] T1 parse error:', e.message); }

    // T2
    try {
      const raw = localStorage.getItem('_t2SessionData');
      if (raw) {
        const s = JSON.parse(raw);
        const unitCount = Array.isArray(s.units) ? s.units.length : 0;
        const indCount  = Array.isArray(s.individualized) ? s.individualized.length : 0;
        if (unitCount >= 1 || indCount >= 1) {
          const unitLabel = (s.sourceUnits || s.sourceUnit || []).map?.(function(u){ return u.display_id || u.unit_id; }).join(', ')
                           || (s.sourceUnit && (s.sourceUnit.display_id || s.sourceUnit.unit_id)) || '—';
          list.push({
            type:       'T2',
            label:      'T2移行',
            sessionId:  s.sessionId || '',
            lotLabel:   unitLabel,  // T2 は元ユニット
            unitCount:  unitCount,
            singleCount:indCount,
            updatedAt:  s.session_date || '',
          });
        }
      }
    } catch(e) { console.warn('[UI.getPendingSessions] T2 parse error:', e.message); }

    // T3
    try {
      const raw = localStorage.getItem('_t3SessionData');
      if (raw) {
        const s = JSON.parse(raw);
        const unitCount = Array.isArray(s.units) ? s.units.length : 0;
        const indCount  = Array.isArray(s.individualized) ? s.individualized.length : 0;
        if (unitCount >= 1 || indCount >= 1) {
          const unitLabel = (s.sourceUnits || s.sourceUnit || []).map?.(function(u){ return u.display_id || u.unit_id; }).join(', ')
                           || (s.sourceUnit && (s.sourceUnit.display_id || s.sourceUnit.unit_id)) || '—';
          list.push({
            type:       'T3',
            label:      'T3移行',
            sessionId:  s.sessionId || '',
            lotLabel:   unitLabel,
            unitCount:  unitCount,
            singleCount:indCount,
            updatedAt:  s.session_date || '',
          });
        }
      }
    } catch(e) { console.warn('[UI.getPendingSessions] T3 parse error:', e.message); }

    return list;
  },

  // 未確定セッションバナー（1行簡潔表示、タップで一覧へ）
  // 対象ページ: ダッシュボード, 管理画面 のみ
  pendingBanner() {
    const list = UI.getPendingSessions();
    if (!list.length) return '';
    const primary = list[0];
    const countStr = list.length > 1 ? `（他${list.length - 1}件）` : '';
    return `<div onclick="routeTo('pending-sessions')"
      style="background:rgba(224,144,64,.15);border:1px solid var(--amber);border-radius:10px;
      padding:10px 14px;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;gap:10px">
      <span style="font-size:1.1rem">⚠️</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:.85rem;font-weight:700;color:var(--amber)">
          未確定の${primary.label}セッションがあります${countStr}
        </div>
        <div style="font-size:.72rem;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${primary.lotLabel} — ユニット${primary.unitCount}件 / 個別${primary.singleCount}頭
        </div>
      </div>
      <span style="color:var(--amber);font-size:1.1rem">→</span>
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
// [20260424q] DOMContentLoaded 後に遅延実行する方式に変更
//   症状: Image 3 の Console に
//     "Uncaught ReferenceError: Pages is not defined at app.js:1034:25"
//     が出てユニット一覧の画面が壊れ、結果「体重が更新されない」ように見えた。
//   原因: この IIFE が app.js 読み込み直後に即実行されており、その時点では
//     Pages は個別ページ JS (individual.js 等で `const Pages = window.Pages || {};`)
//     で定義される前だったため ReferenceError。
//   修正: Pages 参照を遅延させるため DOMContentLoaded イベントで実行。
//     個別ページ JS は同期的に読み込まれるので DOMContentLoaded 時点では
//     window.Pages が確実に存在する。
function _setupBacilusHook() {
  // Pages が未定義ならフォールバックで skip (異常時の防御)
  if (typeof Pages === 'undefined' || !Pages) {
    console.warn('[APP] _setupBacilusHook skipped: Pages undefined');
    return;
  }
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

  // manage ページをフック（バチルスリマインド＋分析ボタン差し込み）
  var _origManage = Pages.manage;
  if (typeof _origManage === 'function') {
    Pages.manage = function() {
      _origManage.apply(this, arguments);
      setTimeout(function(){
        _injectBacilusIfNeeded();
        _injectAnalysisButton();
      }, 100);
    };
  } else {
    // 後から Pages.manage が代入されるケースに対応 (defineProperty で上書き検知)
    var _origManageLate = null;
    try {
      Object.defineProperty(Pages, 'manage', {
        get: function() { return _origManageLate; },
        set: function(fn) {
          _origManageLate = function() {
            fn.apply(this, arguments);
            setTimeout(function(){
              _injectBacilusIfNeeded();
              _injectAnalysisButton();
            }, 100);
          };
        },
        configurable: true,
      });
    } catch(_e) {
      console.warn('[APP] Pages.manage hook failed:', _e.message);
    }
  }

  function _injectAnalysisButton() {
    if (document.getElementById('inject-analysis-btn')) return;
    var body = document.querySelector('.page-body');
    if (!body) return;
    var wrapper = document.createElement('div');
    wrapper.id = 'inject-analysis-btn';
    wrapper.style.cssText = 'margin-bottom:12px';
    var btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-full';
    btn.style.cssText = 'padding:14px;font-size:.92rem;display:flex;align-items:center;justify-content:center;gap:8px';
    btn.innerHTML = '<span>&#x1F4CA;</span><span>分析メニュー</span><span style="margin-left:auto;color:var(--text3)">›</span>';
    btn.addEventListener('click', function(){ routeTo('analysis-menu'); });
    wrapper.appendChild(btn);
    body.insertBefore(wrapper, body.firstChild);
  }

  // dashboard ページもフック
  var _origDash = Pages.dashboard;
  if (typeof _origDash === 'function') {
    Pages.dashboard = function() {
      _origDash.apply(this, arguments);
      setTimeout(_injectBacilusIfNeeded, 100);
    };
  }
}

// [20260424q] DOMContentLoaded 後 (= 個別ページ JS 読込完了後) に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _setupBacilusHook);
} else {
  // 既に ready (scripts が defer 等で遅延実行された場合) は即実行
  _setupBacilusHook();
}
