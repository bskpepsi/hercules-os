// ════════════════════════════════════════════════════════════════
// individual.js
// 役割: 個体の一覧・詳細・新規登録・編集・ステータス変更を担う。
//       個体台帳の中心画面。ロット・成長記録・ラベルへの導線も持つ。
//
// 修正履歴:
//   - ステージ新6区分に統一（L1L2/L3/前蛹/蛹/成虫（未後食）/成虫（活動開始））
//   - ライン絞り込みフィルタを追加
//   - ステータスフィルタを「全状態/飼育中/販売候補/出品中/販売済み/死亡」に整理
//   - IND- プレフィックスを display_id から除去して表示（normalize.js 優先）
//   - age.days undefined 問題修正（Store.calcAge を常に使う）
//   - sold 個体に「予約」ボタンを出さない
//   - 詳細のステータスボタン群を status に応じて条件分岐
//   - 元ロット表示を display_id 優先に（P0-5 済み）
//   - 種親昇格表示を display_name 優先に（P0-5 済み）
// ════════════════════════════════════════════════════════════════

'use strict';

console.log('[HerculesOS] individual.js v20260325a loaded');

const Pages = window.Pages || {};

// ────────────────────────────────────────────────────────────────
// _safeDisplayId — IND- プレフィックスを除去して表示
//   auto-individualize 時に display_id が「IND-HM2026-...」に
//   なるケースがある。一覧では display_id の IND- を除去する。
// ────────────────────────────────────────────────────────────────
function _safeDisplayId(ind) {
  const id = ind.display_id || '';
  // 「IND-HM...」形式 → プレフィックスを除去して表示
  if (/^IND-HM/i.test(id)) {
    return id.replace(/^IND-/i, '');
  }
  // 純粋な内部ID（「IND-」+英数8文字以上、HMなし）→ 表示しない
  if (/^IND-[0-9a-f]{8,}$/i.test(id)) {
    return '—';
  }
  // 通常の表示ID（HM2026-... 等）はそのまま
  return id || '—';
}

// ────────────────────────────────────────────────────────────────
// _safeAgeDays — calcAge の戻り値から日数文字列を安全に取り出す
//   Store.calcAge → { days: "150日", totalDays: 150, ... }
//   GAS _age     → { totalDays: 150, detail: { days: "150日" }, ... }
// ────────────────────────────────────────────────────────────────
function _safeAgeDays(hatchDate, cachedAge) {
  // 常に Store.calcAge を優先（最新・正確）
  const a = Store.calcAge(hatchDate);
  if (a) return a.days;              // "150日"
  // GAS形式の _age がある場合
  if (cachedAge) {
    if (cachedAge.days) return cachedAge.days;
    if (cachedAge.detail && cachedAge.detail.days) return cachedAge.detail.days;
    if (cachedAge.totalDays != null) return String(cachedAge.totalDays) + '日';
  }
  return null;
}

// ════════════════════════════════════════════════════════════════
// 個体一覧
// ════════════════════════════════════════════════════════════════
Pages.individualList = function () {
  const main   = document.getElementById('main');
  const params = Store.getParams() || {};

  // ライン詳細から来た場合は固定フィルタ（ライン限定モード）
  const fixedLineId   = params.line_id || '';
  const fixedLine     = fixedLineId ? Store.getLine(fixedLineId) : null;
  const isLineLimited = !!fixedLineId;

  const initStatus = params.status !== undefined ? params.status : 'alive';
  let filters = {
    status:      initStatus,
    q:           params.q     || '',
    stage:       params.stage || '',
    sex:         params.sex   || '',
    line_id:     fixedLineId,
    line_filter: fixedLineId,  // ライン絞り込み（ライン限定モード外でも使う）
  };

  function _applyFilters() {
    const list = _getFilteredList();
    const el   = document.getElementById('ind-list-body');
    const cEl  = document.getElementById('ind-count');
    if (el)  el.innerHTML = list.length ? list.map(_indCardHTML).join('') : UI.empty('該当する個体がいません');
    if (cEl) cEl.textContent = list.length + '頭';
  }

  function _getFilteredList() {
    let list = Store.filterIndividuals(filters);
    // ライン絞り込み（非限定モードでも絞り込める）
    if (!isLineLimited && filters.line_filter) {
      list = list.filter(i => i.line_id === filters.line_filter);
    }
    return list;
  }

  function render() {
    const list  = _getFilteredList();
    const total = list.length;
    const lines = Store.getDB('lines') || [];

    const title = isLineLimited
      ? (fixedLine ? fixedLine.display_id + ' の個体' : '個体一覧')
      : '個体一覧';
    const headerOpts = isLineLimited
      ? { back: true, action: { fn: "routeTo('ind-new',{lineId:'" + fixedLineId + "'})", icon: '＋' } }
      : { action: { fn: "routeTo('ind-new')", icon: '＋' } };

    // ライン絞り込みバー（ライン限定モードでない場合のみ表示）
    const lineFilterBar = !isLineLimited && lines.length > 0
      ? `<div class="filter-bar" id="line-filter" style="overflow-x:auto;white-space:nowrap">
           <button class="pill ${!filters.line_filter ? 'active' : ''}" data-val="">全ライン</button>
           ${lines.slice(0, 10).map(l =>
             '<button class="pill ' + (l.line_id === filters.line_filter ? 'active' : '') + '" data-val="' + l.line_id + '">'
             + (l.line_code || l.display_id) + '</button>'
           ).join('')}
         </div>`
      : '';

    main.innerHTML = `
      ${UI.header(title, headerOpts)}
      <div class="page-body">
        <div class="search-bar">
          <input id="q" class="search-input" placeholder="🔍 ID・メモ・表示ID検索" value="${filters.q}">
          <button class="btn btn-sm btn-ghost" onclick="Pages._indQrScan()">📷QR</button>
        </div>
        ${lineFilterBar}
        <div class="filter-bar" id="stage-filter">
          ${_stageFilters(filters.stage)}
        </div>
        <div class="filter-bar" id="sex-filter">
          ${_sexFilters(filters.sex)}
        </div>
        <div class="filter-bar" id="status-filter">
          ${_statusFilters(filters.status)}
        </div>
        <div class="sec-hdr">
          <span class="sec-title" id="ind-count">${total}頭</span>
          <span class="sec-more" onclick="Pages._indStatusModal()">
            ステータス: <span id="ind-status-label">${_statusLabel(filters.status)}</span> ▼
          </span>
        </div>
        <div id="ind-list-body">
          ${total ? list.map(_indCardHTML).join('') : UI.empty('個体がいません', '右上の＋から登録できます')}
        </div>
      </div>`;

    document.getElementById('q').addEventListener('input', e => {
      filters.q = e.target.value;
      _applyFilters();
    });

    // ライン絞り込み
    if (!isLineLimited) {
      const lf = document.getElementById('line-filter');
      if (lf) lf.addEventListener('click', e => {
        const p = e.target.closest('.pill');
        if (!p) return;
        filters.line_filter = p.dataset.val === filters.line_filter ? '' : p.dataset.val;
        render();
      });
    }

    // ステージフィルタ
    document.getElementById('stage-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill');
      if (!p) return;
      filters.stage = p.dataset.val === filters.stage ? '' : p.dataset.val;
      render();
    });

    // 性別フィルタ
    document.getElementById('sex-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill');
      if (!p) return;
      filters.sex = p.dataset.val === filters.sex ? '' : p.dataset.val;
      render();
    });

    // ステータスフィルタ
    document.getElementById('status-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill');
      if (!p) return;
      const val = p.dataset.val;
      filters.statusFilter = val === filters.statusFilter ? '' : val;
      // val → filters.status マッピング（ステータスフィルタ直接指定）
      filters.status = val || '';
      render();
    });
  }

  // ステータスモーダルからスコープ内 filters を更新
  window.__indSetStatus = function(code) {
    filters.status      = code;
    filters.statusFilter = '';
    render();
  };

  render();
};

// ステータスラベル取得
function _statusLabel(code) {
  const map = {
    '': '全て',
    'alive':'飼育中', 'larva':'飼育中', 'prepupa':'飼育中',
    'pupa':'飼育中', 'adult':'飼育中',
    'seed_candidate':'飼育中', 'seed_reserved':'飼育中',
    'for_sale':'販売候補', 'listed':'出品中',
    'sold':'販売済み', 'dead':'死亡',
  };
  return map[code] || '全て';
}

// ────────────────────────────────────────────────────────────────
// フィルタ Pill 生成
// ────────────────────────────────────────────────────────────────
function _stageFilters(active) {
  const stages = [
    { val:'',         label:'全て'          },
    { val:'L1L2',     label:'L1L2'         },
    { val:'L3',       label:'L3'           },
    { val:'PREPUPA',  label:'前蛹'          },
    { val:'PUPA',     label:'蛹'           },
    { val:'ADULT_PRE',label:'成虫（未後食）' },
    { val:'ADULT',    label:'成虫（活動開始）'},
  ];
  return stages.map(s =>
    `<button class="pill ${s.val === active ? 'active' : ''}" data-val="${s.val}">${s.label}</button>`
  ).join('');
}

function _statusFilters(active) {
  const statuses = [
    { val:'',        label:'全状態' },
    { val:'alive',   label:'飼育中' },
    { val:'for_sale',label:'販売候補' },
    { val:'listed',  label:'出品中' },
    { val:'sold',    label:'販売済み' },
    { val:'dead',    label:'死亡' },
  ];
  return statuses.map(s =>
    `<button class="pill ${s.val === active ? 'active' : ''}" data-val="${s.val}">${s.label}</button>`
  ).join('');
}

function _sexFilters(active) {
  return [
    { val:'',  label:'性別全て' },
    { val:'♂', label:'♂' },
    { val:'♀', label:'♀' },
  ].map(s =>
    `<button class="pill ${s.val === active ? 'active' : ''}" data-val="${s.val}">${s.label}</button>`
  ).join('');
}

// ────────────────────────────────────────────────────────────────
// _indCardHTML — 個体一覧カード
//   normalize.js の renderIndCard / normalizeIndForView が使える場合は
//   それ経由でレンダリング。なければ独自実装にフォールバック。
// ────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────
// _toDisplayStageLabel — ステージコード（新旧問わず）→ 新6区分の表示ラベル
// ────────────────────────────────────────────────────────────────
function _toDisplayStageLabel(code) {
  if (!code) return '';
  const map = {
    // 新6区分（そのまま）
    L1L2:      'L1L2',
    L3:        'L3',
    PREPUPA:   '前蛹',
    PUPA:      '蛹',
    ADULT_PRE: '成虫（未後食）',
    ADULT:     '成虫（活動開始）',
    // 旧 L 系細分 → L1L2
    L1:        'L1L2',
    L2_EARLY:  'L1L2',
    L2_LATE:   'L1L2',
    // 旧 L3 系細分 → L3
    L3_EARLY:  'L3',
    L3_MID:    'L3',
    L3_LATE:   'L3',
    // 旧 T 系 → 対応新区分
    EGG:  'L1L2',
    T0:   'L1L2',
    T1:   'L1L2',
    T2A:  'L3',
    T2B:  'L3',
    T3:   'L3',
  };
  return map[code] || code;
}

function _toDisplayStageBadge(code) {
  const label = _toDisplayStageLabel(code);
  if (!label) return '';
  const colorMap = {
    'L1L2':        '#4caf50',
    'L3':          '#2196f3',
    '前蛹':         '#e65100',
    '蛹':           '#bf360c',
    '成虫（未後食）': '#9c27b0',
    '成虫（活動開始）':'#c8a84b',
  };
  const c = colorMap[label] || '#888';
  return '<span class="badge" style="background:' + c + '22;color:' + c + ';border:1px solid ' + c + '55">' + label + '</span>';
}

// ────────────────────────────────────────────────────────────────
// _indCardHTML — 個体一覧カード
//   normalize.js の event delegation (data-ind-id) は app.js にハンドラがないため
//   使用しない。直接 onclick で遷移する実装を常に使用する。
// ────────────────────────────────────────────────────────────────
function _indCardHTML(ind) {
  // 直接 onclick 実装（常にこちらを使用）
  const ageObj   = ind.hatch_date ? Store.calcAge(ind.hatch_date) : null;
  const ageDaysStr = ageObj ? ageObj.days : null;   // "150日" 形式
  const stageGuess = ageObj ? ageObj.stageGuess : '';

  const w  = ind.latest_weight_g ? ind.latest_weight_g + 'g' : null;
  const sz = ind.adult_size_mm   ? ind.adult_size_mm + 'mm'  : null;

  const line    = ind.line_id ? Store.getLine(ind.line_id) : null;
  const lineStr = line ? (line.line_code || line.display_id || '') : '';
  const lineLbl = lineStr ? lineStr + 'ライン' : '—';
  const locality = ind.locality || (line ? line.locality : '') || '';

  const stMap = {
    alive:'飼育中', larva:'飼育中', prepupa:'飼育中', pupa:'飼育中', adult:'飼育中',
    seed_candidate:'飼育中', seed_reserved:'飼育中',
    for_sale:'販売候補', listed:'出品中', sold:'販売済み', dead:'死亡',
  };
  const stColor = {
    alive:'var(--green)', larva:'var(--green)', prepupa:'var(--green)',
    pupa:'var(--green)', adult:'var(--green)',
    seed_candidate:'var(--green)', seed_reserved:'var(--green)',
    for_sale:'#9c27b0', listed:'#ff9800',
    sold:'var(--amber)', dead:'var(--red,#e05050)',
  };
  const stLbl = stMap[ind.status] || ind.status || '—';
  const stClr = stColor[ind.status] || 'var(--text3)';

  const icons = [
    String(ind.guinness_flag) === 'true' ? '🏆' : '',
    String(ind.parent_flag)   === 'true' ? '👑' : '',
    String(ind.g200_flag)     === 'true' ? '💪' : '',
  ].filter(Boolean).join('');

  const sexColor = ind.sex === '♂' ? 'var(--male,#5ba8e8)' : ind.sex === '♀' ? 'var(--female,#e87fa0)' : 'var(--text3)';
  const dispId   = _safeDisplayId(ind);

  // 日齢行: ageDaysStr が null なら孵化日未設定メッセージのみ
  let ageHtml = '';
  if (ageDaysStr) {
    ageHtml = '日齢' + ageDaysStr + (stageGuess ? ' · ' + stageGuess : '');
  } else if (!ind.hatch_date) {
    ageHtml = '<span style="color:var(--amber)">孵化日未設定</span>';
  }

  return '<div class="ind-card" onclick="routeTo(\'ind-detail\',{indId:\'' + ind.ind_id + '\'})" style="padding:10px 12px">'
    + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
    +   '<span style="font-weight:700;color:' + sexColor + ';font-size:.95rem">' + (ind.sex || '?') + '</span>'
    +   '<span style="font-family:var(--font-mono);font-weight:700;font-size:.9rem;flex:1">' + dispId + '</span>'
    +   (icons ? '<span style="font-size:.82rem">' + icons + '</span>' : '')
    +   _toDisplayStageBadge(ind.current_stage)
    + '</div>'
    + '<div style="font-size:.76rem;color:var(--text2);margin-bottom:3px">'
    +   lineLbl + (locality ? ' / ' + locality : '')
    + '</div>'
    + (ageHtml ? '<div style="font-size:.76rem;color:var(--text3);margin-bottom:3px">' + ageHtml + '</div>' : '')
    + (w || sz ? '<div style="font-size:.8rem;color:var(--text2);margin-bottom:4px">' + [w,sz].filter(Boolean).join(' / ') + '</div>' : '')
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    +   '<span style="font-size:.72rem;font-weight:700;color:' + stClr + '">' + stLbl + '</span>'
    +   '<span style="color:var(--text3);font-size:1rem">›</span>'
    + '</div>'
    + '</div>';
}

// QRスキャン
Pages._indQrScan = function () {
  const input = prompt('個体ID（IND-xxxxx）または表示ID（HM2025-A1-001）:');
  if (!input) return;
  const trimmed = input.trim();
  if (trimmed.startsWith('IND-')) {
    routeTo('ind-detail', { indId: trimmed });
    return;
  }
  if (trimmed.startsWith('IND:')) {
    routeTo('ind-detail', { indId: trimmed.replace('IND:', '') });
    return;
  }
  const inds  = Store.getDB('individuals') || [];
  const found = inds.find(i =>
    i.display_id === trimmed ||
    i.display_id?.toLowerCase() === trimmed.toLowerCase()
  );
  if (found) {
    routeTo('ind-detail', { indId: found.ind_id });
  } else {
    UI.toast('個体が見つかりません: ' + trimmed, 'error');
  }
};

Pages._indStatusModal = function () {
  // pill と選択肢を一致させる: 全状態 / 飼育中 / 販売候補 / 出品中 / 販売済み / 死亡
  const statuses = [
    { code:'',        label:'全状態' },
    { code:'alive',   label:'飼育中' },
    { code:'for_sale',label:'販売候補' },
    { code:'listed',  label:'出品中' },
    { code:'sold',    label:'販売済み' },
    { code:'dead',    label:'死亡' },
  ];
  const html = statuses.map(s =>
    `<button class="btn btn-ghost btn-full" style="margin-bottom:8px"
       onclick="Pages._setStatusFilter('${s.code}')">${s.label}</button>`
  ).join('');
  _showModal('ステータス絞り込み', html);
};

Pages._setStatusFilter = function (code) {
  _closeModal();
  if (typeof window.__indSetStatus === 'function') {
    window.__indSetStatus(code);
  } else {
    routeTo('ind-list', { status: code });
  }
};

// ════════════════════════════════════════════════════════════════
// 個体詳細
// ════════════════════════════════════════════════════════════════
Pages.individualDetail = async function (indId) {
  if (indId && typeof indId === 'object') indId = indId.id || indId.indId || '';
  const main = document.getElementById('main');
  if (!indId) { main.innerHTML = UI.empty('IDが指定されていません'); return; }

  let ind = Store.getIndividual(indId);
  if (ind) _renderDetail(ind, main);
  else main.innerHTML = UI.header('個体詳細', {}) + UI.spinner();

  try {
    const res = await API.individual.get(indId);
    if (Store.getPage() !== 'ind-detail') return;
    if (Store.getParams().indId !== indId && Store.getParams().id !== indId) return;
    ind = res.individual;
    Store.patchDBItem('individuals', 'ind_id', indId, ind);
    if (ind._growthRecords) Store.setGrowthRecords(indId, ind._growthRecords);
    // sold 状態なら販売履歴を取得して販売情報（金額・経路・購入者）を表示
    if (ind.status === 'sold') {
      try {
        const saleRes = await API.sale.list({ ind_id: indId });
        const hists = (saleRes.hists || []).filter(h => h.ind_id === indId || h.target_id === indId);
        hists.sort((a, b) => String(b.sold_at || '').localeCompare(String(a.sold_at || '')));
        if (hists.length > 0) ind._saleHist = hists[0];
      } catch(_) { /* 販売履歴取得失敗は無視 */ }
    }
    _renderDetail(ind, main);
  } catch (e) {
    if (!ind && Store.getPage() === 'ind-detail') {
      main.innerHTML = UI.header('エラー', {back:true}) + `<div class="page-body">${UI.empty('取得失敗: ' + e.message)}</div>`;
    }
  }
};

function _renderDetail(ind, main) {
  const age     = Store.calcAge(ind.hatch_date);
  const verdict = Store.getVerdict(ind);
  const father  = Store.getParent(ind.father_par_id);
  const mother  = Store.getParent(ind.mother_par_id);
  const bld     = Store.getBloodline(ind.bloodline_id);
  const records = Store.getGrowthRecords(ind.ind_id) || ind._growthRecords || [];
  const originLot      = ind.origin_lot_id ? Store.getLot(ind.origin_lot_id) : null;
  const promotedParent = ind.promoted_par_id ? Store.getParent(ind.promoted_par_id) : null;
  const line    = Store.getLine(ind.line_id);
  const dispId  = _safeDisplayId(ind);

  const icons = [
    String(ind.guinness_flag) === 'true' ? '<span title="ギネス候補">🏆</span>' : '',
    String(ind.parent_flag)   === 'true' ? '<span title="種親候補">👑</span>'  : '',
    String(ind.g200_flag)     === 'true' ? '<span title="200g候補">💪</span>'  : '',
  ].filter(Boolean).join(' ');

  // ── ステータスに応じたアクションボタン群 ─────────────────────
  // 本番5ステータスの遷移ルール:
  //   alive    → for_sale / dead
  //   for_sale → listed / alive（戻す）/ dead
  //   listed   → sold / for_sale（戻す）/ dead
  //   sold     → 誤入力訂正: alive / for_sale に戻せる
  //   dead     → 誤入力訂正: alive に戻せる
  let statusButtons = '';
  const flagBtn = `<button class="btn btn-ghost btn-sm" style="margin-left:auto"
    onclick="Pages._indFlagMenu('${ind.ind_id}','${ind.guinness_flag}','${ind.parent_flag}','${ind.g200_flag}')">🏷 フラグ</button>`;
  const deadBtn = `<button class="btn btn-ghost btn-sm" onclick="Pages._indMarkDead('${ind.ind_id}')">💀 死亡</button>`;

  const _ALIVE_SET = new Set(['alive','larva','prepupa','pupa','adult','seed_candidate','seed_reserved']);
  if (_ALIVE_SET.has(ind.status) || !ind.status) {
    // 飼育中 → 販売候補 / 死亡
    statusButtons = `<div style="display:flex;gap:8px">
      ${deadBtn}
      <button class="btn btn-ghost btn-sm" onclick="Pages._indMarkForSale('${ind.ind_id}')">🛒 販売候補</button>
      ${flagBtn}
    </div>`;
  } else if (ind.status === 'for_sale') {
    // 販売候補 → 出品 / 飼育中に戻す / 死亡
    statusButtons = `<div style="display:flex;gap:8px;flex-wrap:wrap">
      ${deadBtn}
      <button class="btn btn-ghost btn-sm" onclick="Pages._indMarkListed('${ind.ind_id}')">📢 出品</button>
      <button class="btn btn-ghost btn-sm" onclick="Pages._indMarkAlive('${ind.ind_id}')">↩ 飼育中に戻す</button>
      ${flagBtn}
    </div>`;
  } else if (ind.status === 'listed') {
    // 出品中 → 販売済み / 候補に戻す / 死亡
    statusButtons = `<div style="display:flex;gap:8px;flex-wrap:wrap">
      ${deadBtn}
      <button class="btn btn-ghost btn-sm" onclick="Pages._indMarkSold('${ind.ind_id}')">💰 販売済みにする</button>
      <button class="btn btn-ghost btn-sm" onclick="Pages._indMarkForSale('${ind.ind_id}')">↩ 候補に戻す</button>
      ${flagBtn}
    </div>`;
  } else if (ind.status === 'sold') {
    // 販売済み → 誤入力訂正のみ（販売履歴は残る）
    statusButtons = `<div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" style="font-size:.75rem;opacity:.7"
        onclick="Pages._indRestoreFromSold('${ind.ind_id}','alive')">↩ 飼育中に戻す（誤入力訂正）</button>
      <button class="btn btn-ghost btn-sm" style="font-size:.75rem;opacity:.7"
        onclick="Pages._indRestoreFromSold('${ind.ind_id}','for_sale')">↩ 販売候補に戻す（誤入力訂正）</button>
      ${flagBtn}
    </div>`;
  } else if (ind.status === 'dead') {
    // 死亡 → 誤入力訂正のみ
    statusButtons = `<div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" style="font-size:.75rem;opacity:.7"
        onclick="Pages._indRestoreFromDead('${ind.ind_id}')">↩ 飼育中に戻す（誤入力訂正）</button>
      ${flagBtn}
    </div>`;
  } else {
    statusButtons = `<div style="display:flex;gap:8px">${deadBtn}${flagBtn}</div>`;
  }

  main.innerHTML = `
    ${UI.header(dispId, { back: true })}
    <div class="page-body">

      <!-- ヘッダーカード -->
      <div class="card card-gold">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:1.8rem">${ind.sex || '?'}</span>
          <div>
            <div style="font-family:var(--font-mono);font-size:.85rem;color:var(--gold)">${dispId}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
              ${_toDisplayStageBadge(ind.current_stage)}
              ${UI.statusBadge(ind.status)}
              ${icons}
            </div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div style="font-size:1.6rem;font-weight:700;color:var(--green)">
              ${ind.latest_weight_g ? ind.latest_weight_g + 'g' : '—'}
            </div>
            ${verdict ? UI.verdictBadge(verdict) : ''}
          </div>
        </div>
        ${age ? `<div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px">
          <div style="font-size:.7rem;color:var(--text3);margin-bottom:6px">📅 現在の日齢</div>
          ${UI.ageFull(ind.hatch_date)}
        </div>` : '<div style="color:var(--amber);font-size:.8rem">⚠️ 孵化日未設定（設定すると日齢が表示されます）</div>'}
      </div>

      <!-- クイックアクション -->
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:2"
          onclick="Pages._indDirectWeight('${ind.ind_id}')"
          title="体重入力（QRスキャン省略）">
          ⚖️ 体重測定
        </button>
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('ind-new',{editId:'${ind.ind_id}'})">編集</button>
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('label-gen',{targetType:'IND',targetId:'${ind.ind_id}'})">🏷</button>
      </div>

      <!-- 基本情報 -->
      <div class="accordion" id="acc-basic">
        <div class="acc-hdr" onclick="_toggleAcc('acc-basic')">
          基本情報 <span class="acc-arrow">▼</span>
        </div>
        <div class="acc-body open">
          <div class="info-list">
            ${_infoRow('産地',     ind.locality          || '—')}
            ${_infoRow('累代',     ind.generation        || '—')}
            ${_infoRow('孵化日',   ind.hatch_date        || '未設定')}
            ${_infoRow('個体化日', ind.individual_date   || '—')}
            ${_infoRow('容器',     ind.current_container || '—')}
            ${_infoRow('マット',   ind.current_mat       || '—')}
            ${_infoRow('保管場所', ind.storage_location  || '—')}
          </div>
        </div>
      </div>

      <!-- 形態・成長データ -->
      ${(ind.head_width_mm || ind.prepupa_weight_g || ind.pupa_length_mm || ind.adult_size_mm || ind.horn_length_mm) ? `
      <div class="accordion" id="acc-morph">
        <div class="acc-hdr" onclick="_toggleAcc('acc-morph')">
          形態・成長データ <span class="acc-arrow">▼</span>
        </div>
        <div class="acc-body open">
          <div class="info-list">
            ${ind.head_width_mm     ? _infoRow('頭幅',       ind.head_width_mm     + ' mm') : ''}
            ${ind.prepupa_weight_g  ? _infoRow('前蛹体重',   ind.prepupa_weight_g  + ' g')  : ''}
            ${ind.pupa_length_mm    ? _infoRow('蛹サイズ',   ind.pupa_length_mm    + ' mm') : ''}
            ${ind.adult_size_mm     ? _infoRow('成虫サイズ', ind.adult_size_mm     + ' mm') : ''}
            ${ind.horn_length_mm    ? _infoRow('胸角長',     ind.horn_length_mm    + ' mm') : ''}
          </div>
        </div>
      </div>` : ''}

      <!-- 血統・種親 -->
      <div class="accordion" id="acc-blood">
        <div class="acc-hdr" onclick="_toggleAcc('acc-blood')">
          血統・種親 <span class="acc-arrow">▼</span>
        </div>
        <div class="acc-body">
          <div class="info-list">
            ${_infoRow('血統',
              (bld ? bld.bloodline_name : (ind.bloodline_id || '—')) +
              ' ' + UI.bloodlineBadge(ind.bloodline_status)
            )}
            ${_infoRow('親♂', father ? `${father.display_name}${father.size_mm ? ' ' + father.size_mm + 'mm' : ''}` : (ind.father_par_id || '—'))}
            ${_infoRow('親♀', mother ? `${mother.display_name}${mother.size_mm ? ' ' + mother.size_mm + 'mm' : ''}` : (ind.mother_par_id || '—'))}
            ${line ? _infoRow('ライン',
              `<span style="cursor:pointer;color:var(--blue)" onclick="routeTo('line-detail',{lineId:'${line.line_id}'})">${line.display_id}${line.line_name ? ' / ' + line.line_name : ''}</span>`
            ) : ''}
            ${ind.origin_lot_id ? _infoRow('元ロット', (() => {
              const _dispId = originLot ? (originLot.display_id || ind.origin_lot_id) : ind.origin_lot_id;
              return `<span style="cursor:pointer;color:var(--blue)" onclick="routeTo('lot-detail',{lotId:'${ind.origin_lot_id}'})">${_dispId}</span>
               <span style="font-size:.7rem;color:var(--text3)">（同腹: <span style="cursor:pointer;color:var(--blue)" onclick="routeTo('ind-list',{lotId:'${ind.origin_lot_id}'})">一覧を見る</span>）</span>`;
            })()) : ''}
          </div>
        </div>
      </div>

      <!-- 体重推移 -->
      <div class="accordion" id="acc-growth">
        <div class="acc-hdr open" onclick="_toggleAcc('acc-growth')">
          体重推移（${records.filter(r=>r.weight_g).length}件）<span class="acc-arrow">▼</span>
        </div>
        <div class="acc-body open">
          ${records.length ? _weightChartBlock(ind.ind_id, records) : UI.empty('記録なし', '「体重記録」ボタンから追加できます')}
        </div>
      </div>

      <!-- 内部メモ -->
      ${ind.note_private ? `<div class="card">
        <div class="card-title">🔒 内部メモ</div>
        <div style="font-size:.85rem;color:var(--text2)">${ind.note_private}</div>
      </div>` : ''}

      <!-- 追加日付フィールド -->
      ${(ind.prepupa_date || ind.pupa_check_date || ind.artificial_cell_date) ? `
      <div class="accordion" id="acc-dates">
        <div class="acc-hdr" onclick="_toggleAcc('acc-dates')">
          発育日程 <span class="acc-arrow">▼</span>
        </div>
        <div class="acc-body">
          <div class="info-list">
            ${ind.prepupa_date         ? _infoRow('前蛹確認日',     ind.prepupa_date)         : ''}
            ${ind.pupa_check_date      ? _infoRow('蛹確認日',       ind.pupa_check_date)      : ''}
            ${ind.artificial_cell_date ? _infoRow('人工蛹室移行日', ind.artificial_cell_date) : ''}
          </div>
        </div>
      </div>` : ''}

      <!-- 不全情報 -->
      ${String(ind.is_defective) === 'true' ? `
      <div class="card" style="border-color:rgba(231,76,60,.4);background:rgba(231,76,60,.05)">
        <div class="card-title" style="color:var(--red)">⚠️ 不全記録</div>
        <div class="info-list">
          ${_infoRow('発生ステージ', ind.defect_stage || '—')}
          ${_infoRow('不全種別',     _defectTypeLabel(ind.defect_type))}
          ${ind.defect_note ? _infoRow('メモ', ind.defect_note) : ''}
        </div>
      </div>` : ''}

      <!-- 販売情報 -->
      ${ind.status === 'sold' ? (() => {
        const sh = ind._saleHist || {};
        const priceStr = sh.actual_price ? '¥' + Number(sh.actual_price).toLocaleString() : '—';
        return `
      <div class="card" style="border-color:rgba(52,152,219,.4)">
        <div class="card-title" style="color:var(--blue)">💰 販売済み</div>
        <div class="info-list">
          ${_infoRow('販売日',         ind.sold_date   || '—')}
          ${_infoRow('販売金額',       priceStr)}
          ${_infoRow('販売経路',       sh.platform     || '—')}
          ${_infoRow('購入者名',       sh.buyer_name   || '—')}
          ${_infoRow('販売時体重',     ind.sold_weight ? ind.sold_weight + 'g' : '—')}
          ${_infoRow('販売時ステージ', ind.sold_stage  || '—')}
          ${ind.sold_reason ? _infoRow('理由', ind.sold_reason) : ''}
        </div>
      </div>`; })() : ''}

      <!-- 最大体重 -->
      ${ind.max_weight_g ? `
      <div style="text-align:center;padding:6px;font-size:.8rem;color:var(--text3)">
        最大体重記録: <strong>${ind.max_weight_g}g</strong>
      </div>` : ''}

      <!-- 種親昇格 -->
      ${ind.eclosion_date && !ind.promoted_par_id ? `
      <button class="btn btn-gold btn-full"
        onclick="Pages._indPromoteModal('${ind.ind_id}')">
        🌟 種親に昇格する
      </button>` : ''}
      ${ind.promoted_par_id ? `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;
        background:rgba(200,168,75,.1);border:1px solid rgba(200,168,75,.3);
        border-radius:10px;font-size:.82rem">
        <span style="font-size:1.1rem">👑</span>
        <div>
          <div style="font-weight:700;color:var(--gold)">種親昇格済み</div>
          <div style="color:var(--text3);font-size:.72rem">
            種親:
            <span style="cursor:pointer;color:var(--blue)"
              onclick="routeTo('parent-detail',{parId:'${ind.promoted_par_id}'})">
              ${promotedParent
                ? (promotedParent.parent_display_id || promotedParent.display_name || ind.promoted_par_id)
                : ind.promoted_par_id}
            </span>
          </div>
        </div>
      </div>` : ''}

      <!-- ステータスボタン（status に応じて条件分岐済み） -->
      ${statusButtons}

    </div>`;

  if (records.filter(r => r.weight_g).length >= 2) {
    setTimeout(() => _drawWeightChart(ind.ind_id, records), 100);
  }
}

// ────────────────────────────────────────────────────────────────
// ステータス変更アクション
// ────────────────────────────────────────────────────────────────
Pages._indMarkDead = async function (id) {
  if (!UI.confirm('死亡として記録しますか？')) return;
  try {
    await apiCall(() => API.individual.changeStatus(id, 'dead'), '死亡を記録しました');
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'dead' });
    routeTo('ind-list');
  } catch (e) {}
};

// 販売候補にする（alive → for_sale）
Pages._indMarkForSale = async function (id) {
  try {
    await apiCall(() => API.individual.changeStatus(id, 'for_sale'), '販売候補にしました');
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'for_sale' });
    Pages.individualDetail(id);
  } catch (e) {}
};

// 出品中にする（for_sale → listed）
Pages._indMarkListed = async function (id) {
  try {
    await apiCall(() => API.individual.changeStatus(id, 'listed'), '出品中にしました');
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'listed' });
    Pages.individualDetail(id);
  } catch (e) {}
};

// 飼育中に戻す（for_sale → alive）
Pages._indMarkAlive = async function (id) {
  try {
    await apiCall(() => API.individual.changeStatus(id, 'alive'), '飼育中に戻しました');
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'alive' });
    Pages.individualDetail(id);
  } catch (e) {}
};

// 誤入力訂正: sold → alive または sold → for_sale
// 販売履歴（SALE_HIST）は残す。statusのみ戻す。
Pages._indRestoreFromSold = async function (id, targetStatus) {
  const label = targetStatus === 'alive' ? '飼育中' : '販売候補';
  if (!UI.confirm(`「${label}」に戻しますか？\n販売履歴はそのまま残ります。`)) return;
  try {
    await apiCall(
      () => API.individual.update({ ind_id: id, status: targetStatus }),
      label + 'に戻しました（販売履歴は保持）'
    );
    Store.patchDBItem('individuals', 'ind_id', id, { status: targetStatus });
    Pages.individualDetail(id);
  } catch (e) {}
};

// 誤入力訂正: dead → alive
Pages._indRestoreFromDead = async function (id) {
  if (!UI.confirm('「飼育中」に戻しますか？\n（誤入力訂正用）')) return;
  try {
    await apiCall(
      () => API.individual.update({ ind_id: id, status: 'alive' }),
      '飼育中に戻しました'
    );
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'alive' });
    Pages.individualDetail(id);
  } catch (e) {}
};

// 販売済みにする（listed → sold）— 販売モーダルを開いて API.individual.sell() へ
Pages._indMarkSold = function (id) {
  const ind = Store.getIndividual(id);
  if (!ind) { UI.toast('個体情報が見つかりません', 'error'); return; }
  const today    = new Date().toISOString().split('T')[0];
  const PLATFORMS = ['ヤフオク', 'メルカリ', 'イベント', '直接', 'その他'];
  const dispLabel = _safeDisplayId(ind);

  _showModal('💰 販売登録', `
    <div class="form-section">
      <div style="font-size:.8rem;color:var(--text3);margin-bottom:12px">
        個体: <strong>${dispLabel}</strong>
      </div>
      ${UI.field('販売日 *', `<input type="date" id="sell-date" class="input" value="${today}">`)}
      ${UI.field('販売価格（円）', `<input type="number" id="sell-price" class="input" placeholder="例: 8000">`)}
      ${UI.field('販売経路', `<select id="sell-platform" class="input">
        ${PLATFORMS.map(p => `<option value="${p}">${p}</option>`).join('')}
      </select>`)}
      ${UI.field('購入者名（任意）', `<input type="text" id="sell-buyer" class="input" placeholder="例: 山田 太郎">`)}
      ${UI.field('備考（任意）', `<input type="text" id="sell-note" class="input" placeholder="例: 即決">`)}
      <div class="modal-footer" style="margin-top:16px">
        <button class="btn btn-ghost" style="flex:1" type="button" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" type="button"
          onclick="Pages._indSellExec('${id}')">💰 販売済みにする</button>
      </div>
    </div>`);
};

Pages._indSellExec = async function (id) {
  const date    = document.getElementById('sell-date')?.value;
  const price   = document.getElementById('sell-price')?.value;
  const platform= document.getElementById('sell-platform')?.value || '';
  const buyer   = document.getElementById('sell-buyer')?.value?.trim() || '';
  const note    = document.getElementById('sell-note')?.value?.trim() || '';
  if (!date) { UI.toast('販売日を入力してください', 'error'); return; }
  _closeModal();
  try {
    await apiCall(
      () => API.individual.sell({
        ind_id:       id,
        sold_date:    date.replace(/-/g, '/'),
        actual_price: price ? Number(price) : '',
        platform,
        buyer_name:   buyer,
        buyer_note:   note,
      }),
      '販売済みとして登録しました 💰'
    );
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'sold' });
    Pages.individualDetail(id);
  } catch (e) {}
};



Pages._indFlagMenu = function (id, guinness, parent, g200) {
  const gf = String(guinness) === 'true';
  const pf = String(parent)   === 'true';
  const g2 = String(g200)     === 'true';
  _showModal('フラグ設定', `
    <div style="display:flex;flex-direction:column;gap:10px">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
        <input type="checkbox" id="fl-g" ${gf ? 'checked' : ''}> 🏆 ギネス候補
      </label>
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
        <input type="checkbox" id="fl-p" ${pf ? 'checked' : ''}> 👑 種親候補
      </label>
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
        <input type="checkbox" id="fl-2" ${g2 ? 'checked' : ''}> 💪 200g候補
      </label>
      <button class="btn btn-primary btn-full" onclick="Pages._indFlagSave('${id}')">保存</button>
    </div>`);
};

Pages._indFlagSave = async function (id) {
  const updates = {
    ind_id:        id,
    guinness_flag: document.getElementById('fl-g').checked,
    parent_flag:   document.getElementById('fl-p').checked,
    g200_flag:     document.getElementById('fl-2').checked,
  };
  _closeModal();
  try {
    await apiCall(() => API.individual.update(updates), 'フラグを保存しました');
    Store.patchDBItem('individuals', 'ind_id', id, updates);
    Pages.individualDetail(id);
  } catch(e) {}
};

// ── 種親昇格モーダル ─────────────────────────────────────────────
Pages._indPromoteModal = function (indId) {
  const ind = Store.getIndividual(indId);
  if (!ind) { UI.toast('個体情報が見つかりません', 'error'); return; }

  const sexLabel  = ind.sex           || '未設定';
  const sizeLabel = ind.adult_size_mm ? ind.adult_size_mm + ' mm' : '未入力';
  const eclosion  = ind.eclosion_date || '—';

  _showModal('🌟 種親に昇格', `
    <div class="form-section">
      <div style="background:rgba(200,168,75,.1);border:1px solid rgba(200,168,75,.25);
        border-radius:10px;padding:12px 14px;margin-bottom:14px">
        <div style="font-size:.78rem;color:var(--text3);margin-bottom:6px">引き継ぐ個体情報</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:.83rem">
          <span style="color:var(--text3)">個体ID</span><span style="font-weight:600">${_safeDisplayId(ind)}</span>
          <span style="color:var(--text3)">性別</span><span style="font-weight:600">${sexLabel}</span>
          <span style="color:var(--text3)">成虫サイズ</span><span style="font-weight:600">${sizeLabel}</span>
          <span style="color:var(--text3)">羽化日</span><span style="font-weight:600">${eclosion}</span>
        </div>
      </div>

      <div style="font-size:.78rem;color:var(--text3);margin-bottom:4px">種親IDは自動採番されます（${ind.sex === '♂' ? 'M年-英字' : 'F年-連番'}）</div>

      ${UI.field('後食開始日（任意）', `<input type="date" id="prm-feeding" class="input" value="">`)}
      ${UI.field('表示名（任意・空白なら自動）', `<input type="text" id="prm-name" class="input" placeholder="例: M26-A（空白=自動採番の値）">`)}

      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" type="button" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-gold" style="flex:2" type="button"
          onclick="Pages._indPromoteExec('${indId}')">👑 種親に昇格する</button>
      </div>
    </div>`);
};

Pages._indPromoteExec = async function (indId) {
  const feeding = (document.getElementById('prm-feeding')?.value || '').replace(/-/g, '/');
  const name    =  document.getElementById('prm-name')?.value?.trim() || '';
  _closeModal();
  try {
    const res = await apiCall(
      () => API.individual.promoteToParent({
        ind_id:             indId,
        feeding_start_date: feeding || '',
        display_name:       name    || '',
      }),
      '種親に昇格しました 🌟'
    );
    Store.patchDBItem('individuals', 'ind_id', indId, {
      parent_flag:     true,
      promoted_par_id: res.par_id,
    });
    await syncAll(true);
    routeTo('parent-detail', { parId: res.par_id });
  } catch(e) {}
};

// ════════════════════════════════════════════════════════════════
// 個体新規登録 / 編集
// ════════════════════════════════════════════════════════════════
Pages.individualNew = function (params = {}) {
  const main    = document.getElementById('main');
  const isEdit  = !!params.editId;
  const ind     = isEdit ? Store.getIndividual(params.editId) : null;
  const lines   = Store.getDB('lines')      || [];
  const parents = Store.getDB('parents')    || [];
  const blds    = Store.getDB('bloodlines') || [];

  const v = (field, fallback = '') =>
    ind ? (ind[field] !== undefined ? ind[field] : fallback) : (params[field] || fallback);

  main.innerHTML = `
    ${UI.header(isEdit ? '個体編集' : '個体登録', { back: true })}
    <div class="page-body">
      <form id="ind-form" class="form-section">

        <div class="form-title">ライン情報</div>
        ${UI.field('ライン', UI.select('line_id',
          lines.map(l => ({ code: l.line_id, label: `${l.display_id}${l.line_name ? ' / ' + l.line_name : ''}` })),
          v('line_id', params.lineId || ''), 'ラインを選択'), true)}

        <div class="form-title">基本情報</div>
        <div class="form-row-2">
          ${UI.field('性別', UI.select('sex', [
            { code:'♂',   label:'♂ オス' },
            { code:'♀',   label:'♀ メス' },
            { code:'不明', label:'不明' },
          ], v('sex')))}
          ${UI.field('ステージ', UI.select('current_stage',
            STAGE_LIST.map(s => ({ code: s.code, label: s.label })),
            v('current_stage', 'L1L2')), true)}
        </div>
        <div class="form-row-2">
          ${UI.field('孵化日', UI.input('hatch_date', 'date', v('hatch_date')))}
          ${UI.field('累代',   UI.input('generation', 'text', v('generation'), 'WF1 / CBF1'))}
        </div>
        <div class="form-row-2">
          ${UI.field('容器', UI.select('current_container',
            CONTAINER_SIZES.map(s => ({ code: s, label: s })),
            v('current_container')))}
          ${UI.field('マット', UI.select('current_mat',
            MAT_TYPES.map(m => ({ code: m.code, label: m.label })),
            v('current_mat')))}
        </div>
        ${UI.field('産地',     UI.input('locality',         'text', v('locality',         'Guadeloupe')))}
        ${UI.field('保管場所', UI.input('storage_location', 'text', v('storage_location'), '例: 棚A-3'))}

        <div class="form-title">血統情報</div>
        ${UI.field('血統', UI.select('bloodline_id',
          blds.map(b => ({ code: b.bloodline_id, label: (b.abbreviation || b.bloodline_name) })),
          v('bloodline_id')))}
        ${UI.field('血統ステータス', UI.select('bloodline_status', [
          { code:'confirmed', label:'確定' },
          { code:'temporary', label:'暫定' },
          { code:'unknown',   label:'不明' },
        ], v('bloodline_status', 'unknown')))}

        <div class="form-title">種親</div>
        ${UI.field('親♂', UI.select('father_par_id',
          parents.filter(p => p.sex === '♂').map(p => ({ code: p.par_id, label: `${p.display_name}${p.size_mm ? ' ' + p.size_mm + 'mm' : ''}` })),
          v('father_par_id')))}
        ${UI.field('親♀', UI.select('mother_par_id',
          parents.filter(p => p.sex === '♀').map(p => ({ code: p.par_id, label: `${p.display_name}${p.size_mm ? ' ' + p.size_mm + 'mm' : ''}` })),
          v('mother_par_id')))}

        <div class="form-title">形態・成長データ</div>
        <div class="form-row-2">
          ${UI.field('頭幅 (mm)',    UI.input('head_width_mm',   'number', v('head_width_mm'),   '例: 14.5'))}
          ${UI.field('前蛹体重 (g)', UI.input('prepupa_weight_g','number', v('prepupa_weight_g'), '例: 45.2'))}
        </div>
        <div class="form-row-2">
          ${UI.field('蛹サイズ (mm)', UI.input('pupa_length_mm', 'number', v('pupa_length_mm'), '例: 90.0'))}
          ${UI.field('胸角長 (mm)',   UI.input('horn_length_mm', 'number', v('horn_length_mm'), '例: 65.0'))}
        </div>

        <div class="form-title">メモ</div>
        ${UI.field('内部メモ（非公開）',   UI.textarea('note_private', v('note_private'), 2, '飼育メモ・観察記録'))}
        ${UI.field('購入者向けコメント', UI.textarea('note_public',  v('note_public'),  2, '公開可能なコメント'))}

        <div style="display:flex;gap:10px;margin-top:4px">
          <button type="button" class="btn btn-ghost" style="flex:1" onclick="Store.back()">キャンセル</button>
          <button type="button" class="btn btn-primary" style="flex:2"
            onclick="Pages._indSave('${isEdit ? params.editId : ''}')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>

      </form>
    </div>`;
};

Pages._indSave = async function (editId) {
  const form = document.getElementById('ind-form');
  if (!form) return;
  const data = UI.collectForm(form);

  if (data.hatch_date) data.hatch_date = data.hatch_date.replace(/-/g, '/');

  if (!editId && !data.line_id) { UI.toast('ラインを選択してください', 'error'); return; }
  if (!data.current_stage)      { UI.toast('ステージを選択してください', 'error'); return; }

  try {
    if (editId) {
      data.ind_id = editId;
      await apiCall(() => API.individual.update(data), '更新しました');
      Store.patchDBItem('individuals', 'ind_id', editId, data);
      routeTo('ind-detail', { indId: editId });
    } else {
      const res = await apiCall(() => API.individual.create(data), '登録しました');
      await syncAll(true);
      routeTo('ind-detail', { indId: res.ind_id });
    }
  } catch (e) {}
};

// ════════════════════════════════════════════════════════════════
// 共通ユーティリティ
// ════════════════════════════════════════════════════════════════

function _defectTypeLabel(type) {
  const map = {
    pupa_fail:     '蛹化失敗',
    eclosion_fail: '羽化失敗',
    horn_deform:   '角変形',
    elytra_open:   '上翅開き',
    size_defect:   'サイズ不全',
    unknown:       '不明',
  };
  return map[type] || type || '—';
}

function _infoRow(key, val) {
  return `<div class="info-row">
    <span class="info-key">${key}</span>
    <span class="info-val">${val}</span>
  </div>`;
}

function _weightChartBlock(indId, records) {
  const wts     = records.filter(r => r.weight_g && +r.weight_g > 0);
  const table   = UI.weightTable(records);
  const chartId = `chart-${indId}`;
  return `${wts.length >= 2
    ? `<canvas id="${chartId}" style="max-height:180px;margin-bottom:12px"></canvas>` : ''}
    ${table}`;
}

function _drawWeightChart(indId, records) {
  const el = document.getElementById(`chart-${indId}`);
  if (!el) return;
  const wts = records.filter(r => r.weight_g && +r.weight_g > 0)
    .sort((a,b) => a.record_date.localeCompare(b.record_date));
  new Chart(el, {
    type: 'line',
    data: {
      labels: wts.map(r => r.record_date),
      datasets: [{
        data:               wts.map(r => +r.weight_g),
        borderColor:        '#4caf78',
        backgroundColor:    'rgba(76,175,120,0.1)',
        pointBackgroundColor:'#4caf78',
        pointRadius:        4,
        tension:            0.3,
        fill:               true,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6a7c6a', maxTicksLimit: 5, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: '#6a7c6a', font: { size: 10 } },                   grid: { color: 'rgba(255,255,255,0.06)' } },
      }
    }
  });
}

// アコーディオン開閉
window._toggleAcc = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector('.acc-hdr').classList.toggle('open');
  el.querySelector('.acc-body').classList.toggle('open');
};

// モーダル
function _showModal(title, body) {
  let ov = document.getElementById('_modal');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = '_modal';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)_closeModal()">
    <div class="modal">
      <div class="modal-title">${title}</div>
      ${body}
    </div>
  </div>`;
}

function _closeModal() {
  const el = document.getElementById('_modal');
  if (el) el.innerHTML = '';
}

window._closeModal = _closeModal;
