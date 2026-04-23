// ════════════════════════════════════════════════════════════════
// individual.js
// 役割: 個体の一覧・詳細・新規登録・編集・ステータス変更を担う。
//       個体台帳の中心画面。ロット・成長記録・ラベルへの導線も持つ。
// build: 20260423k
//
// 20260423k 修正:
//   - 「次のステップ（ワンタップ記録）」に「🍽️ 後食開始」ボタンを追加
//     羽化日記録後の次のステップとして表示される。後食開始日が入ると消える。
//   - ワンタップ記録時に current_stage も自動遷移 (退行しない)
//     prepupa_date       → PREPUPA
//     pupa_check_date    → PUPA
//     eclosion_date      → ADULT_PRE
//     feeding_start_date → ADULT
//     個体編集フォームの自動遷移ロジックと統一。
//   - 種親昇格ボタン (🌟 種親に昇格する) を発育日程の直下に移動
//     → 後食開始ボタンと2行で並ぶ形になり、羽化後のアクションが一箇所に集約。
//     従来は画面下部の販売情報の後ろに配置されていた。
//
// 20260423j 修正:
//   - 個体編集フォームに「成虫体長 (mm)」欄を復活
//     (詳細表示には残っていたが編集フォームから消えていたため値を登録できない状態だった)
//   - 個体編集フォームに「後食開始日 (feeding_start_date)」欄を新設
//     親個体で使用していたフィールド名と統一。活動開始日として機能。
//   - 発育日程の日付入力で current_stage を自動遷移
//     前蛹確認日 → PREPUPA
//     蛹確認日   → PUPA
//     羽化日     → ADULT_PRE (成虫（未後食）)
//     後食開始日 → ADULT     (成虫（活動開始）)
//     既存ステージが進んでいる場合は退行せず最大値を採用。
//     保存時に UI.toast でステージ切替を通知。
//
// 20260421f 修正:
//   - 一覧カード表示で for_sale フラグを優先判定
//     T2移行で作成された販売候補個体は status='larva' のまま for_sale=true なので
//     status だけで判定すると「飼育中」になってしまう。ind.for_sale===true であれば
//     status に関わらず「販売候補」バッジを表示するように修正。
//
// 20260421e 修正:
//   - 販売候補/出品中/飼育中戻し のステータス変更エラー修正
//     changeStatus(→deleteIndividual) は終端ステータス (dead/sold/excluded) のみ
//     受け付けるため、for_sale/listed/alive のような非終端遷移は
//     updateIndividual 経由に変更。StatusRules 側で validateStatusTransition
//     が alive→for_sale, for_sale→listed 等の遷移を正しく許可する。
//     対象: _indMarkForSale, _indMarkListed, _indMarkAlive
//
// 20260418g 修正:
//   - 血統・種親セクションをユニット/ロット詳細と統一デザインに変更
//     - 祖父×祖母の血統原文とサイズを表示（例: U71 (160mm) × 165T-REX.T-115 (69mm)）
//     - 血統タグ表示を削除、父種親/母種親のブロックに統一
//     - 種親タップで種親詳細へ遷移する際 _back/_backParams を付与
//       → 種親詳細の←で個体詳細に戻れる
//     - ライン・元ロット(同腹一覧)リンクは従来通り維持
//
// 20260418b 修正:
//   - [Step2 🥈②] 発育日付クイック記録ボタン追加
//     個体詳細に「⏭️ 次のステップ」カードを表示し、未記録の次ステップ日付を
//     今日の日付でワンタップ保存できるUIを追加（蛹室→前蛹→蛹→羽化）
//     ♀への人工蛹室移動は confirm() で二重確認
// 20260418a 修正:
//   - [Step2 ③] 性別フィルタに「不明」ボタン追加（val='_unknown'）
//     _unknown は store.js の filterIndividuals 側で sex が空/不明/? を包括して拾う
// 20260414b-fix1 修正:
//   - 個体一覧カードのライン未表示を修正
//     （line_id がキャッシュで解決できない場合に display_id からフォールバック抽出）
// 20260414a 修正:
//   - 個体一覧カードのステージバッジを短縮表示（成虫（活動開始）→活動中 等）
//     長いバッジ名によるカードレイアウト崩れを修正
// 20260413l 修正:
//   - 基本情報の区分表示をlocalStorageから読む（GAS同期で消えるバグ修正）
// ════════════════════════════════════════════════════════════════

'use strict';

console.log('[HerculesOS] individual.js v20260423m loaded');

const Pages = window.Pages || {};

// ────────────────────────────────────────────────────────────────
// _safeDisplayId — IND- プレフィックスを除去して表示
// ────────────────────────────────────────────────────────────────
function _safeDisplayId(ind) {
  const id = ind.display_id || '';
  if (/^IND-HM/i.test(id)) {
    return id.replace(/^IND-/i, '');
  }
  if (/^IND-[0-9a-f]{8,}$/i.test(id)) {
    return '—';
  }
  return id || '—';
}

// ────────────────────────────────────────────────────────────────
// _safeAgeDays — calcAge の戻り値から日数文字列を安全に取り出す
// ────────────────────────────────────────────────────────────────
function _safeAgeDays(hatchDate, cachedAge) {
  const a = Store.calcAge(hatchDate);
  if (a) return a.days;
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

  const fixedLineId   = params.line_id || '';
  const fixedLine     = fixedLineId ? Store.getLine(fixedLineId) : null;
  const isLineLimited = !!fixedLineId;

  const initStatus     = params.status !== undefined ? params.status : 'alive';
  const initParentFlag = params.parent_flag === true || params.parent_flag === 'true';
  let filters = {
    status:      initStatus,
    q:           params.q     || '',
    stage:       params.stage || '',
    sex:         params.sex   || '',
    line_id:     fixedLineId,
    line_filter: fixedLineId,
    parent_flag: initParentFlag,
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
    if (!isLineLimited && filters.line_filter) {
      list = list.filter(i => i.line_id === filters.line_filter);
    }
    return list;
  }

  function render() {
    const list  = _getFilteredList();
    const total = list.length;
    const lines = Store.getDB('lines') || [];

    const title = filters.parent_flag
      ? '👑 種親候補一覧'
      : (isLineLimited
        ? (fixedLine ? fixedLine.display_id + ' の個体' : '個体一覧')
        : '個体一覧');
    const headerOpts = isLineLimited
      ? { back: true, action: { fn: "routeTo('ind-new',{lineId:'" + fixedLineId + "'})", icon: '＋' } }
      : { action: { fn: "routeTo('ind-new')", icon: '＋' } };

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
        ${!filters.parent_flag ? '' :
          '<div style="background:rgba(224,144,64,.1);border:1px solid rgba(224,144,64,.3);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:.8rem;color:var(--amber);display:flex;align-items:center;justify-content:space-between">'
          + '<span>👑 種親候補フィルター適用中</span>'
          + '<button class="btn btn-ghost btn-sm" onclick="Store.setParams({});Pages.individualList()">解除</button>'
          + '</div>'}
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

    if (!isLineLimited) {
      const lf = document.getElementById('line-filter');
      if (lf) lf.addEventListener('click', e => {
        const p = e.target.closest('.pill');
        if (!p) return;
        filters.line_filter = p.dataset.val === filters.line_filter ? '' : p.dataset.val;
        render();
      });
    }

    document.getElementById('stage-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill');
      if (!p) return;
      filters.stage = p.dataset.val === filters.stage ? '' : p.dataset.val;
      render();
    });

    document.getElementById('sex-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill');
      if (!p) return;
      filters.sex = p.dataset.val === filters.sex ? '' : p.dataset.val;
      render();
    });

    document.getElementById('status-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill');
      if (!p) return;
      const val = p.dataset.val;
      filters.statusFilter = val === filters.statusFilter ? '' : val;
      filters.status = val || '';
      render();
    });
  }

  window.__indSetStatus = function(code) {
    filters.status      = code;
    filters.statusFilter = '';
    render();
  };

  render();
};

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
    { val:'',         label:'性別全て' },
    { val:'♂',        label:'♂' },
    { val:'♀',        label:'♀' },
    { val:'_unknown', label:'不明' },
  ].map(s =>
    `<button class="pill ${s.val === active ? 'active' : ''}" data-val="${s.val}">${s.label}</button>`
  ).join('');
}

// ────────────────────────────────────────────────────────────────
// _toDisplayStageLabel — ステージコード → 表示ラベル（詳細画面用・フルラベル）
// ────────────────────────────────────────────────────────────────
function _toDisplayStageLabel(code) {
  if (!code) return '';
  const map = {
    L1L2:'L1L2', L3:'L3', PREPUPA:'前蛹', PUPA:'蛹',
    ADULT_PRE:'成虫（未後食）', ADULT:'成虫（活動開始）',
    L1:'L1L2', L2_EARLY:'L1L2', L2_LATE:'L1L2',
    L3_EARLY:'L3', L3_MID:'L3', L3_LATE:'L3',
    EGG:'L1L2', T0:'L1L2', T1:'L1L2', T2A:'L3', T2B:'L3', T3:'L3',
  };
  return map[code] || code;
}

// ────────────────────────────────────────────────────────────────
// _toDisplayStageLabelShort — 一覧カード用短縮ラベル
// ────────────────────────────────────────────────────────────────
function _toDisplayStageLabelShort(code) {
  if (!code) return '';
  const map = {
    L1L2:'L1L2', L3:'L3', PREPUPA:'前蛹', PUPA:'蛹',
    ADULT_PRE:'未後食',
    ADULT:'活動中',
    L1:'L1L2', L2_EARLY:'L1L2', L2_LATE:'L1L2',
    L3_EARLY:'L3', L3_MID:'L3', L3_LATE:'L3',
    EGG:'L1L2', T0:'L1L2', T1:'L1L2', T2A:'L3', T2B:'L3', T3:'L3',
  };
  return map[code] || _toDisplayStageLabel(code);
}

// ────────────────────────────────────────────────────────────────
// _toDisplayStageBadge — 詳細画面用バッジ（フルラベル）
// ────────────────────────────────────────────────────────────────
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
// _toDisplayStageBadgeShort — 一覧カード用バッジ（短縮ラベル）
// ────────────────────────────────────────────────────────────────
function _toDisplayStageBadgeShort(code) {
  const label      = _toDisplayStageLabelShort(code);
  const labelFull  = _toDisplayStageLabel(code);
  if (!label) return '';
  const colorMap = {
    'L1L2':   '#4caf50',
    'L3':     '#2196f3',
    '前蛹':    '#e65100',
    '蛹':      '#bf360c',
    '未後食':  '#9c27b0',
    '活動中':  '#c8a84b',
  };
  const c = colorMap[label] || '#888';
  return '<span class="badge" title="' + labelFull + '" style="background:' + c + '22;color:' + c + ';border:1px solid ' + c + '55;white-space:nowrap">' + label + '</span>';
}

// ────────────────────────────────────────────────────────────────
// _indCardHTML — 個体一覧カード
// ────────────────────────────────────────────────────────────────
function _indCardHTML(ind) {
  const ageObj     = ind.hatch_date ? Store.calcAge(ind.hatch_date) : null;
  const ageDaysStr = ageObj ? ageObj.days : null;

  const w  = ind.latest_weight_g ? ind.latest_weight_g + 'g' : null;
  const sz = ind.adult_size_mm   ? ind.adult_size_mm + 'mm'  : null;

  // ── Bug fix: line_id で見つからない場合は display_id から抽出 ──
  const line    = ind.line_id ? Store.getLine(ind.line_id) : null;
  const lineStr = (() => {
    if (line) return line.line_code || line.display_id || '';
    // フォールバック: "HM2025-A1-001" → "A1" を抽出
    const dm = (ind.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-\d+/);
    return dm ? dm[1] : '';
  })();

  const stColor = {
    alive:'var(--green)', larva:'var(--green)', prepupa:'var(--green)',
    pupa:'var(--green)', adult:'var(--green)',
    seed_candidate:'var(--green)', seed_reserved:'var(--green)',
    for_sale:'#9c27b0', listed:'#ff9800',
    sold:'var(--amber)', dead:'var(--red,#e05050)',
  };
  const stMap = {
    alive:'飼育中', larva:'飼育中', prepupa:'飼育中', pupa:'飼育中', adult:'飼育中',
    seed_candidate:'飼育中', seed_reserved:'飼育中',
    for_sale:'販売候補', listed:'出品中', sold:'販売済み', dead:'死亡',
  };
  // [20260421f] for_sale フラグが立っていれば、status に関わらず「販売候補」として表示
  //   T2移行で作成された販売候補個体は status='larva' のまま for_sale=true になるため、
  //   status のみで判定すると「飼育中」として表示されてしまう
  const _isTerminalInd = (ind.status === 'sold' || ind.status === 'dead');
  const _isForSaleInd  = (!_isTerminalInd) && (
    ind.for_sale === true || ind.for_sale === 'true' ||
    ind.for_sale === 1    || ind.for_sale === '1'    ||
    ind.status === 'for_sale'
  );
  const stLbl = _isForSaleInd ? '販売候補' : (stMap[ind.status] || ind.status || '—');
  const stClr = _isForSaleInd ? '#9c27b0' : (stColor[ind.status] || 'var(--text3)');

  const icons = [
    (String(ind.guinness_flag||'').toUpperCase()==='TRUE'||ind.guinness_flag===1||ind.guinness_flag===true) ? '🏆' : '',
    (String(ind.parent_flag||'').toUpperCase() === 'TRUE' || ind.parent_flag === 1 || ind.parent_flag === true) ? '👑' : '',
    (String(ind.g200_flag||'').toUpperCase()==='TRUE'||ind.g200_flag===1||ind.g200_flag===true) ? '💪' : '',
  ].filter(Boolean).join('');

  const sexColor = ind.sex === '♂' ? 'var(--male,#5ba8e8)' : ind.sex === '♀' ? 'var(--female,#e87fa0)' : 'var(--text3)';
  const dispId   = _safeDisplayId(ind);

  const stageLbl = _toDisplayStageLabelShort(ind.current_stage);
  const stageColorMap = {
    'L1L2':'var(--green)', 'L3':'var(--blue)', '前蛹':'#e65100',
    '蛹':'#bf360c', '未後食':'#9c27b0', '活動中':'var(--gold)',
  };
  const stageC = stageColorMap[stageLbl] || 'var(--text3)';

  const subParts = [];
  if (stageLbl) subParts.push('<span style="font-weight:700;color:' + stageC + '">' + stageLbl + '</span>');
  if (ageDaysStr) subParts.push('<span>' + ageDaysStr + '</span>');
  else if (!ind.hatch_date) subParts.push('<span style="color:var(--amber);font-size:.7rem">孵化日未設定</span>');
  if (w)  subParts.push('<span style="color:var(--green);font-weight:700">' + w + '</span>');
  if (sz) subParts.push('<span style="color:var(--gold);font-weight:700">' + sz + '</span>');
  const subHtml = subParts.join('<span style="font-size:.65rem;color:var(--border,rgba(255,255,255,.15));padding:0 2px">/</span>');

  return '<div class="card" style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:0;margin-bottom:8px"'
    + " onclick=\"routeTo('ind-detail',{indId:'" + ind.ind_id + "'})\">"

    // ①列: ライン + 性別
    + '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;'
    +   'min-width:34px;padding-right:8px;border-right:1px solid var(--border2);margin-right:8px;flex-shrink:0">'
    +   '<span style="font-size:.88rem;font-weight:800;color:var(--gold);line-height:1.2">' + (lineStr || '—') + '</span>'
    +   '<span style="font-size:.82rem;font-weight:700;color:' + sexColor + ';margin-top:2px">' + (ind.sex || '?') + '</span>'
    + '</div>'

    // ②列: ID + サブ情報
    + '<div style="flex:1;min-width:0">'
    +   '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">'
    +     '<span style="font-family:var(--font-mono);font-weight:700;font-size:.85rem;color:var(--text1);'
    +       'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + dispId + '</span>'
    +     (icons ? '<span style="font-size:.8rem;flex-shrink:0">' + icons + '</span>' : '')
    +   '</div>'
    +   (subHtml ? '<div style="display:flex;align-items:center;gap:3px;flex-wrap:wrap;font-size:.78rem;color:var(--text2)">' + subHtml + '</div>' : '')
    + '</div>'

    // ③列: ステータス + ›
    + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;margin-left:6px">'
    +   '<span style="font-size:.72rem;font-weight:700;color:' + stClr + ';white-space:nowrap">' + stLbl + '</span>'
    +   '<span style="color:var(--text3);font-size:1.1rem">›</span>'
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
    if (ind.status === 'sold') {
      try {
        const saleRes = await API.sale.list({ ind_id: indId });
        const hists = (saleRes.hists || []).filter(h => h.ind_id === indId || h.target_id === indId);
        hists.sort((a, b) => String(b.sold_at || '').localeCompare(String(a.sold_at || '')));
        if (hists.length > 0) ind._saleHist = hists[0];
      } catch(_) {}
    }
    _renderDetail(ind, main);
  } catch (e) {
    if (!ind && Store.getPage() === 'ind-detail') {
      main.innerHTML = UI.header('エラー', {back:true}) + `<div class="page-body">${UI.empty('取得失敗: ' + e.message)}</div>`;
    }
  }
};

function _renderDetail(ind, main) {
  const age      = Store.calcAge(ind.hatch_date);
  const verdict  = Store.getVerdict(ind);
  const father   = Store.getParent(ind.father_par_id);
  const mother   = Store.getParent(ind.mother_par_id);
  const bld      = Store.getBloodline(ind.bloodline_id);
  const records  = Store.getGrowthRecords(ind.ind_id) || ind._growthRecords || [];
  const _fromNew = !!(Store.getParams()._fromNew);
  const originLot      = ind.origin_lot_id ? Store.getLot(ind.origin_lot_id) : null;
  const promotedParent = ind.promoted_par_id ? Store.getParent(ind.promoted_par_id) : null;
  const line    = Store.getLine(ind.line_id);
  const dispId  = _safeDisplayId(ind);

  const icons = [
    (String(ind.guinness_flag||'').toUpperCase()==='TRUE'||ind.guinness_flag===1||ind.guinness_flag===true) ? '<span title="ギネス候補">🏆</span>' : '',
    (String(ind.parent_flag||'').toUpperCase() === 'TRUE' || ind.parent_flag === 1 || ind.parent_flag === true) ? '<span title="種親候補">👑</span>' : '',
    (String(ind.g200_flag||'').toUpperCase()==='TRUE'||ind.g200_flag===1||ind.g200_flag===true) ? '<span title="200g候補">💪</span>'  : '',
  ].filter(Boolean).join(' ');

  let statusButtons = '';
  const flagBtn = `<button class="btn btn-ghost btn-sm" style="margin-left:auto"
    onclick="Pages._indFlagMenu('${ind.ind_id}','${ind.guinness_flag}','${ind.parent_flag}','${ind.g200_flag}')">🏷 フラグ</button>`;
  const deadBtn = `<button class="btn btn-ghost btn-sm" onclick="Pages._indMarkDead('${ind.ind_id}')">💀 死亡</button>`;

  const _ALIVE_SET = new Set(['alive','larva','prepupa','pupa','adult','seed_candidate','seed_reserved']);
  if (_ALIVE_SET.has(ind.status) || !ind.status) {
    statusButtons = `<div style="display:flex;gap:8px">
      ${deadBtn}
      <button class="btn btn-ghost btn-sm" onclick="Pages._indMarkForSale('${ind.ind_id}')">🛒 販売候補</button>
      ${flagBtn}
    </div>`;
  } else if (ind.status === 'for_sale') {
    statusButtons = `<div style="display:flex;gap:8px;flex-wrap:wrap">
      ${deadBtn}
      <button class="btn btn-ghost btn-sm" onclick="Pages._indMarkListed('${ind.ind_id}')">📢 出品</button>
      <button class="btn btn-ghost btn-sm" onclick="Pages._indMarkAlive('${ind.ind_id}')">↩ 飼育中に戻す</button>
      ${flagBtn}
    </div>`;
  } else if (ind.status === 'listed') {
    statusButtons = `<div style="display:flex;gap:8px;flex-wrap:wrap">
      ${deadBtn}
      <button class="btn btn-ghost btn-sm" onclick="Pages._indMarkSold('${ind.ind_id}')">💰 販売済みにする</button>
      <button class="btn btn-ghost btn-sm" onclick="Pages._indMarkForSale('${ind.ind_id}')">↩ 候補に戻す</button>
      ${flagBtn}
    </div>`;
  } else if (ind.status === 'sold') {
    statusButtons = `<div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" style="font-size:.75rem;opacity:.7"
        onclick="Pages._indRestoreFromSold('${ind.ind_id}','alive')">↩ 飼育中に戻す（誤入力訂正）</button>
      <button class="btn btn-ghost btn-sm" style="font-size:.75rem;opacity:.7"
        onclick="Pages._indRestoreFromSold('${ind.ind_id}','for_sale')">↩ 販売候補に戻す（誤入力訂正）</button>
      ${flagBtn}
    </div>`;
  } else if (ind.status === 'dead') {
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

      <div class="card card-gold">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:1.8rem;font-weight:700;color:${ind.sex==='♂'?'var(--male,#5ba8e8)':ind.sex==='♀'?'var(--female,#f06292)':'var(--text3)'}">${ind.sex || '?'}</span>
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

      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:2"
          onclick="routeTo('growth-rec',{targetType:'IND',targetId:'${ind.ind_id}',displayId:'${ind.display_id||ind.ind_id}'})"
          title="成長記録を入力">
          📷 成長記録
        </button>
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('ind-new',{editId:'${ind.ind_id}'})">編集</button>
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('label-gen',{targetType:'IND',targetId:'${ind.ind_id}'})">🏷</button>
      </div>

      ${_fromNew ? `
      <div style="background:rgba(200,168,75,.12);border:1px solid rgba(200,168,75,.35);
        border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px">
        <span style="font-size:1.1rem">✅</span>
        <div style="flex:1">
          <div style="font-size:.85rem;font-weight:700;color:var(--gold)">登録しました</div>
          <div style="font-size:.75rem;color:var(--text3)">続けてラベルを発行できます</div>
        </div>
        <button class="btn btn-ghost btn-sm"
          onclick="routeTo('label-gen',{targetType:'IND',targetId:'${ind.ind_id}'})">
          🏷 ラベル発行
        </button>
      </div>` : ''}
      </div>

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
            ${(ind.size_category || localStorage.getItem('hcos_sizeCat_' + ind.ind_id)) ? _infoRow('区分', ind.size_category || localStorage.getItem('hcos_sizeCat_' + ind.ind_id)) : ''}
          </div>
        </div>
      </div>

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

      <div class="accordion" id="acc-blood">
        <div class="acc-hdr" onclick="_toggleAcc('acc-blood')">
          血統・種親 <span class="acc-arrow">▼</span>
        </div>
        <div class="acc-body">
          ${(() => {
            // ── [20260418g] ユニット/ロット詳細と同じ「祖父×祖母」形式に統一 ──
            // backCtx は種親詳細から戻る時にこの個体詳細に正しく戻れるよう戻り先情報を付与
            const backCtx = { page: 'ind-detail', params: { indId: ind.ind_id } };

            // 祖父母の血統原文を「血統原文 (サイズmm) × 血統原文 (サイズmm)」形式に整形
            function _grandBloodlineLine(par) {
              if (!par) return '';
              const patRaw = (par.paternal_raw || '').trim();
              const matRaw = (par.maternal_raw || '').trim();
              const patSize = par.father_parent_size_mm;
              const matSize = par.mother_parent_size_mm;
              if (!patRaw && !matRaw) return ''; // 両方なし → 血統行自体を出さない
              function _fmt(raw, size) {
                if (!raw) return '—';
                return raw + (size ? ' (' + size + 'mm)' : '');
              }
              return _fmt(patRaw, patSize) + ' × ' + _fmt(matRaw, matSize);
            }

            // 種親詳細遷移時の onclick 文字列を生成（戻り先情報付き）
            function _buildParentOnclick(parId) {
              const backParamsJson = JSON.stringify(backCtx.params || {})
                .replace(/'/g, "\\'")
                .replace(/"/g, '&quot;');
              return "routeTo('parent-detail',{parId:'" + parId + "',_back:'" + backCtx.page + "',_backParams:'" + backParamsJson + "'})";
            }

            function _parBlock(par, parId, sex) {
              if (!par && !parId) return '';
              const mc = sex === '♂' ? 'var(--male,#5ba8e8)' : 'var(--female,#e87fa0)';
              const bg = sex === '♂' ? 'rgba(91,168,232,.05)' : 'rgba(232,127,160,.05)';
              const bd = sex === '♂' ? 'rgba(91,168,232,.2)'  : 'rgba(232,127,160,.2)';
              if (!par) {
                return '<div style="padding:8px 10px;background:' + bg + ';border-radius:8px;border:1px solid ' + bd + ';margin-bottom:6px">'
                  + '<span style="font-size:.75rem;color:' + mc + ';font-weight:700">' + sex + '親</span>'
                  + ' <span style="font-size:.8rem;color:var(--text3)">情報なし</span>'
                  + '</div>';
              }
              const name          = par.parent_display_id || par.display_name || '—';
              const grandLine     = _grandBloodlineLine(par);
              const parentOnclick = _buildParentOnclick(parId);
              return '<div style="padding:8px 10px;background:' + bg + ';border-radius:8px;border:1px solid ' + bd + ';margin-bottom:6px">'
                // 親情報行（タップで種親詳細へ）
                + '<div style="display:flex;align-items:baseline;gap:6px;cursor:pointer" onclick="' + parentOnclick + '">'
                +   '<span style="font-size:.75rem;color:' + mc + ';font-weight:700;flex-shrink:0">' + sex + '親</span>'
                +   '<span style="font-size:.88rem;font-weight:700;color:var(--text1)">' + name + '</span>'
                +   (par.size_mm ? '<span style="font-size:.8rem;color:var(--green);font-weight:700">(' + par.size_mm + 'mm)</span>' : '')
                +   '<span style="margin-left:auto;color:var(--text3);font-size:.9rem">›</span>'
                + '</div>'
                // 血統行（祖父×祖母）※ 両方なしなら非表示
                + (grandLine
                  ? '<div style="display:flex;align-items:baseline;gap:6px;margin-top:4px;padding-top:4px;border-top:1px dashed ' + bd + '">'
                    +   '<span style="font-size:.72rem;color:var(--text3);font-weight:700;flex-shrink:0;min-width:36px">血統</span>'
                    +   '<span style="font-size:.78rem;color:var(--text2);word-break:break-all;line-height:1.4">' + grandLine + '</span>'
                    + '</div>'
                  : '')
                + '</div>';
            }

            const fBlock = _parBlock(father, ind.father_par_id, '♂');
            const mBlock = _parBlock(mother, ind.mother_par_id, '♀');

            // 個体詳細固有: ライン・元ロットリンク（同腹一覧への導線含む）
            const lineRow = line
              ? '<div style="font-size:.78rem;color:var(--text3);margin-top:6px">'
                + 'ライン: <span style="cursor:pointer;color:var(--blue)" onclick="routeTo(' + "'" + 'line-detail' + "'" + ',{lineId:' + "'" + line.line_id + "'" + '})">'
                + line.display_id + (line.line_name ? ' / ' + line.line_name : '') + '</span></div>'
              : '';
            const lotRow = ind.origin_lot_id ? (() => {
              const _dispId = originLot ? (originLot.display_id || ind.origin_lot_id) : ind.origin_lot_id;
              return '<div style="font-size:.78rem;color:var(--text3)">'
                + '元ロット: <span style="cursor:pointer;color:var(--blue)" onclick="routeTo(' + "'" + 'lot-detail' + "'" + ',{lotId:' + "'" + ind.origin_lot_id + "'" + '})">' + _dispId + '</span>'
                + ' <span onclick="routeTo(' + "'" + 'ind-list' + "'" + ',{lotId:' + "'" + ind.origin_lot_id + "'" + '})" style="cursor:pointer;color:var(--text3);font-size:.72rem">同腹一覧 ›</span>'
                + '</div>';
            })() : '';

            return (fBlock || mBlock ? fBlock + mBlock : '<div style="font-size:.82rem;color:var(--text3);padding:4px 0">親情報なし</div>')
              + (lineRow || lotRow ? '<div style="padding-top:4px;border-top:1px solid var(--border);margin-top:6px">' + lineRow + lotRow + '</div>' : '');
          })()}
        </div>
      </div>

      <div class="accordion" id="acc-growth">
        <div class="acc-hdr open" onclick="_toggleAcc('acc-growth')">
          体重推移（${records.filter(r=>r.weight_g).length}件）<span class="acc-arrow">▼</span>
        </div>
        <div class="acc-body open">
          ${records.length ? _weightChartBlock(ind.ind_id, records) : UI.empty('記録なし', '「体重記録」ボタンから追加できます')}
        </div>
      </div>

      ${ind.note_private ? `<div class="card">
        <div class="card-title">🔒 内部メモ</div>
        <div style="font-size:.85rem;color:var(--text2)">${ind.note_private}</div>
      </div>` : ''}

      <div class="accordion" id="acc-dates">
        <div class="acc-hdr" onclick="_toggleAcc('acc-dates')">
          発育日程 <span class="acc-arrow">▼</span>
        </div>
        <div class="acc-body">
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:6px">
            日付を入力・変更するには「✏️ 編集」ボタンから形態・成長データ欄を使ってください。
          </div>
          ${(() => {
            const _today = new Date(); _today.setHours(0,0,0,0);
            function _parseDate(d) {
              if (!d) return null;
              const p = String(d).replace(/\//g,'-').split('-');
              if (p.length < 3) return null;
              return new Date(+p[0], +p[1]-1, +p[2]);
            }
            function _diffDays(from, to) { return Math.round((to - from) / 86400000); }

            let pupaChamberHint = '';
            if (ind.artificial_cell_date && !ind.prepupa_date) {
              const chamD = _parseDate(ind.artificial_cell_date);
              if (chamD) {
                const moveD = new Date(chamD); moveD.setDate(moveD.getDate() + 18);
                const diff = _diffDays(_today, moveD);
                if (diff < 0) {
                  const color = Math.abs(diff) >= 5 ? 'var(--red,#e05050)' : 'var(--amber)';
                  pupaChamberHint = '<span style="font-size:.72rem;color:' + color + ';margin-left:6px">⚠️ 移行目安を' + Math.abs(diff) + '日超過</span>'
                    + '<div style="font-size:.7rem;color:var(--text3);margin-top:2px;margin-left:4px">前蛹確認日を入力すると、この警告は消えます</div>';
                } else if (diff === 0) {
                  pupaChamberHint = '<span style="font-size:.72rem;color:var(--amber);margin-left:6px">今日が移行目安日（♂のみ）</span>';
                } else {
                  pupaChamberHint = '<span style="font-size:.72rem;color:var(--text3);margin-left:6px">移行目安まであと' + diff + '日（♂のみ）</span>';
                }
              }
            }

            let prepupaHint = '';
            if (ind.prepupa_date && !ind.pupa_check_date) {
              const preD = _parseDate(ind.prepupa_date);
              if (preD) {
                const minD = new Date(preD); minD.setDate(minD.getDate() + 14);
                const maxD = new Date(preD); maxD.setDate(maxD.getDate() + 28);
                const dMin = _diffDays(_today, minD);
                const dMax = _diffDays(_today, maxD);
                if (dMin > 0) {
                  prepupaHint = '<span style="font-size:.72rem;color:var(--text3);margin-left:6px">蛹化目安: あと' + dMin + '〜' + dMax + '日</span>';
                } else if (dMax > 0) {
                  prepupaHint = '<span style="font-size:.72rem;color:var(--amber);margin-left:6px">蛹化時期の可能性あり</span>';
                }
              }
            }

            let eclosionHint = '';
            if (ind.pupa_check_date && !ind.eclosion_date) {
              const pupaD = _parseDate(ind.pupa_check_date);
              if (pupaD) {
                const minD = new Date(pupaD); minD.setDate(minD.getDate() + 50);
                const maxD = new Date(pupaD); maxD.setDate(maxD.getDate() + 70);
                const diffMin = _diffDays(_today, minD);
                const diffMax = _diffDays(_today, maxD);
                const fmt = (d) => d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0');
                if (diffMin > 0) {
                  eclosionHint = '<span style="font-size:.72rem;color:var(--text3);margin-left:6px">羽化目安: ' + fmt(minD) + '〜' + fmt(maxD) + ' （あと' + diffMin + '〜' + diffMax + '日）</span>';
                } else if (diffMax >= 0) {
                  eclosionHint = '<span style="font-size:.72rem;color:var(--green);margin-left:6px">🦋 羽化時期です（目安: ' + fmt(maxD) + 'まで）</span>';
                } else {
                  const over = Math.abs(diffMax);
                  eclosionHint = '<span style="font-size:.72rem;color:var(--red,#e05050);margin-left:6px">⚠️ 羽化目安を' + over + '日超過</span>'
                    + '<div style="font-size:.7rem;color:var(--text3);margin-top:2px;margin-left:4px">羽化日を入力すると、この表示は消えます</div>';
                }
              }
            }

            const rows = [
              ind.artificial_cell_date ? `${_infoRow('蛹室確認日', ind.artificial_cell_date + pupaChamberHint)}` : '',
              ind.prepupa_date ? `${_infoRow('前蛹確認日（人工蛹室移動日）', ind.prepupa_date + prepupaHint)}` : '',
              ind.pupa_check_date ? `${_infoRow('蛹確認日', ind.pupa_check_date + eclosionHint)}` : '',
              ind.eclosion_date ? `${_infoRow('羽化日', ind.eclosion_date)}` : '',
            ].filter(Boolean).join('');

            const hasDates = ind.prepupa_date || ind.pupa_check_date || ind.artificial_cell_date || ind.eclosion_date;
            return '<div class="info-list">' + (hasDates ? rows : '<div style="font-size:.82rem;color:var(--text3);padding:4px 0">日付未記録</div>') + '</div>';
          })()}
        </div>
      </div>

      <!-- 🥈② 発育日付クイック記録ボタン（20260418b）-->
      <!-- [20260423k] 羽化後は「🍽 後食開始」ボタンと「🌟 種親に昇格」ボタンが並んで表示される -->
      ${_renderQuickDateButtons(ind)}

      ${(() => {
        // [20260423k] 種親昇格ボタンを発育日程の直下に移動
        //   → 次のステップ「後食開始」ボタンと並んで表示される
        const _stageStr = String(ind.current_stage || '').toUpperCase();
        const _isAdult  = _stageStr === 'ADULT' || _stageStr === 'ADULT_PRE';
        const _pfStr    = String(ind.parent_flag || '').toUpperCase();
        const _hasFlag  = _pfStr === 'TRUE' || _pfStr === '1';
        const _canPromote = !ind.promoted_par_id && (_isAdult || ind.eclosion_date || _hasFlag);
        return _canPromote ? `
      <button class="btn btn-gold btn-full" style="margin-bottom:10px"
        onclick="Pages._indPromoteModal('${ind.ind_id}')">
        🌟 種親に昇格する
      </button>` : '';
      })()}
      ${ind.promoted_par_id ? `
      <div style="background:rgba(200,168,75,.1);border:1px solid rgba(200,168,75,.3);
        border-radius:10px;padding:10px 14px;font-size:.82rem;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:1.1rem">👑</span>
          <div style="font-weight:700;color:var(--gold)">種親昇格済み</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="color:var(--text3);font-size:.72rem">
            ${promotedParent ? `
            <span style="cursor:pointer;color:var(--blue)"
              onclick="routeTo('parent-detail',{parId:'${ind.promoted_par_id}'})">
              ${promotedParent.parent_display_id || promotedParent.display_name || '種親詳細を開く'}
            </span>` : `<span style="color:var(--text3)">種親情報を読み込み中...</span>`}
          </div>
          <button class="btn btn-ghost btn-sm" style="font-size:.72rem;color:var(--red,#e05050);
            border-color:rgba(224,80,80,.3);white-space:nowrap"
            onclick="Pages._indRevokePromotion('${ind.ind_id}')">
            取りやめる
          </button>
        </div>
      </div>` : ''}

      ${String(ind.is_defective) === 'true' ? `
      <div class="card" style="border-color:rgba(231,76,60,.4);background:rgba(231,76,60,.05)">
        <div class="card-title" style="color:var(--red)">⚠️ 不全記録</div>
        <div class="info-list">
          ${_infoRow('発生ステージ', ind.defect_stage || '—')}
          ${_infoRow('不全種別',     _defectTypeLabel(ind.defect_type))}
          ${ind.defect_note ? _infoRow('メモ', ind.defect_note) : ''}
        </div>
      </div>` : ''}

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

      ${ind.max_weight_g ? `
      <div style="text-align:center;padding:6px;font-size:.8rem;color:var(--text3)">
        最大体重記録: <strong>${ind.max_weight_g}g</strong>
      </div>` : ''}

      <!-- [20260423k] 種親昇格ボタンは発育日程セクションの直下に移動済み -->


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

Pages._indMarkForSale = async function (id) {
  try {
    // [20260421e] for_sale は非終端ステータスなので updateIndividual 経由で遷移
    //   (changeStatus → deleteIndividual は dead/sold/excluded 終端のみ許可)
    await apiCall(() => API.individual.update({ ind_id: id, status: 'for_sale' }), '販売候補にしました');
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'for_sale', for_sale: true });
    Pages.individualDetail(id);
  } catch (e) {}
};

Pages._indMarkListed = async function (id) {
  try {
    // [20260421e] listed は非終端ステータスなので updateIndividual 経由で遷移
    await apiCall(() => API.individual.update({ ind_id: id, status: 'listed' }), '出品中にしました');
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'listed' });
    Pages.individualDetail(id);
  } catch (e) {}
};

Pages._indMarkAlive = async function (id) {
  try {
    // [20260421e] alive は非終端ステータスなので updateIndividual 経由で遷移
    await apiCall(() => API.individual.update({ ind_id: id, status: 'alive', for_sale: false }), '飼育中に戻しました');
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'alive', for_sale: false });
    Pages.individualDetail(id);
  } catch (e) {}
};

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

Pages._indDateModal = function (indId) {
  if (!indId || String(indId).includes('{') || String(indId).includes('$')) {
    const p = Store.getParams();
    indId = p.indId || p.id || '';
  }
  const ind = Store.getIndividual(indId);
  if (!ind) { UI.toast('個体が見つかりません (id=' + indId + ')', 'error'); return; }

  function _fmtForInput(d) { return d ? String(d).replace(/\//g, '-') : ''; }

  _showModal('📅 発育日付を入力', `
    <div class="form-section">
      <div style="font-size:.78rem;color:var(--text3);margin-bottom:12px;line-height:1.6">
        発育管理の4つの日付をまとめて記録します。<br>
        <span style="color:var(--amber)">🏠 蛹室確認日から約18日後（♂のみ）に人工蛹室へ移動。</span>
      </div>
      ${UI.field('蛹室確認日 🏠',
        '<input type="date" id="date-acel" class="input" value="' + _fmtForInput(ind.artificial_cell_date) + '">'
        + '<div style="font-size:.7rem;color:var(--text3);margin-top:2px">蛹室を確認した日。+18日が人工蛹室移行目安（♂のみ）</div>')}
      ${UI.field('前蛹確認日',
        '<input type="date" id="date-prepupa" class="input" value="' + _fmtForInput(ind.prepupa_date) + '">'
        + '<div style="font-size:.7rem;color:var(--text3);margin-top:2px">前蛹になった日（縮み始めた日）</div>')}
      ${UI.field('蛹確認日',
        '<input type="date" id="date-pupa" class="input" value="' + _fmtForInput(ind.pupa_check_date) + '">'
        + '<div style="font-size:.7rem;color:var(--text3);margin-top:2px">蛹になった日。+50〜70日が羽化目安</div>')}
      ${UI.field('羽化日',
        '<input type="date" id="date-eclosion" class="input" value="' + _fmtForInput(ind.eclosion_date) + '">'
        + '<div style="font-size:.7rem;color:var(--text3);margin-top:2px">成虫として羽化した日。種親昇格・後食管理の基準</div>')}
      <div style="font-size:.72rem;color:var(--text3);margin-top:4px">
        入力済みの日付は上書きされます。空のままにすれば変更しません。
      </div>
      <div class="modal-footer" style="margin-top:14px">
        <button class="btn btn-ghost" style="flex:1" type="button" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" type="button"
          onclick="Pages._indDateSave('${indId}')">保存</button>
      </div>
    </div>`);
};

Pages._indDateSave = async function (indId) {
  const prepupa   = document.getElementById('date-prepupa')?.value;
  const pupa      = document.getElementById('date-pupa')?.value;
  const acel      = document.getElementById('date-acel')?.value;
  const eclosion  = document.getElementById('date-eclosion')?.value;

  const updates = { ind_id: indId };
  if (prepupa)  updates.prepupa_date         = prepupa.replace(/-/g, '/');
  if (pupa)     updates.pupa_check_date      = pupa.replace(/-/g, '/');
  if (acel)     updates.artificial_cell_date = acel.replace(/-/g, '/');
  if (eclosion) updates.eclosion_date        = eclosion.replace(/-/g, '/');

  if (Object.keys(updates).length <= 1) {
    UI.toast('日付を1つ以上入力してください', 'error');
    return;
  }
  _closeModal();
  try {
    await apiCall(() => API.individual.update(updates), '発育日付を保存しました 📅');
    Store.patchDBItem('individuals', 'ind_id', indId, updates);
    Pages.individualDetail(indId);
  } catch (e) {}
};

// ────────────────────────────────────────────────────────────────
// 🥈② 発育日付クイック記録ボタン（20260418b）
// ────────────────────────────────────────────────────────────────
// 既存の「📅 発育日付を入力」モーダルとは別に、未記録の次ステップを
// 「今日の日付でワンタップ記録」できるボタンを個体詳細画面に追加する。
//
// 既存画面のラベル付けを踏襲:
//   - ind.artificial_cell_date → 🏠 蛹室確認日
//   - ind.prepupa_date         → 🛌 前蛹確認日（人工蛹室移動日）♂のみ
//   - ind.pupa_check_date      → 🐛 蛹確認日
//   - ind.eclosion_date        → 🦋 羽化日
//
// 表示ロジック:
//   - 羽化済みなら何も表示しない
//   - 蛹室未確認 → 蛹室確認ボタンのみ
//   - 蛹室確認済 / 前蛹未確認 → 前蛹確認ボタン（♂なら「人工蛹室へ移動」ラベル）
//   - 前蛹確認済 / 蛹未確認   → 蛹確認ボタン
//   - 蛹確認済 / 羽化未確認   → 羽化ボタン
// ────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────
// [20260423k] 次のステップカード拡張
//   従来: 蛹室→前蛹→蛹→羽化 までの4ステップ
//   今回: 羽化後に「🍽 後食開始」ボタンを追加 (feeding_start_date 記録)
//         完全に後食まで終わったら何も表示しない
//   また _indQuickDateSave 側で日付記録と同時にステージを自動遷移:
//     artificial_cell_date (蛹室) → (ステージ変化なし、形態上 L3 相当のまま)
//     prepupa_date         → PREPUPA
//     pupa_check_date      → PUPA
//     eclosion_date        → ADULT_PRE
//     feeding_start_date   → ADULT
//   個体編集フォームの自動遷移ロジックと統一。
// ────────────────────────────────────────────────────────────────
function _renderQuickDateButtons(ind) {
  if (!ind || !ind.ind_id) return '';
  // [20260423k] 後食開始まで完了していれば何も出さない
  if (ind.feeding_start_date) return '';

  const btns = [];

  if (!ind.artificial_cell_date) {
    btns.push({
      label:  '🏠 蛹室確認',
      hint:   '幼虫が蛹室を作ったのを確認した日',
      field:  'artificial_cell_date',
      color:  '#7bb37b',
    });
  } else if (!ind.prepupa_date) {
    // ♂なら「人工蛹室移動」の意味合いを前面に、♀は警告つきで
    const isMale   = ind.sex === '♂';
    const isFemale = ind.sex === '♀';
    btns.push({
      label:  isMale ? '🛌 前蛹確認 / 人工蛹室へ移動' : '🛌 前蛹確認',
      hint:   isMale
        ? '前蛹になった日を記録。人工蛹室への移動日としても使用'
        : (isFemale
          ? '♀は自然蛹室が基本です（例外時のみタップ）'
          : '前蛹になった日を記録'),
      field:  'prepupa_date',
      color:  isFemale ? '#c8813a' : 'var(--amber)',
      warn:   isFemale,
    });
  } else if (!ind.pupa_check_date) {
    btns.push({
      label:  '🐛 蛹確認',
      hint:   '蛹になった日を記録。+50〜70日後が羽化目安',
      field:  'pupa_check_date',
      color:  '#b07bc8',
    });
  } else if (!ind.eclosion_date) {
    btns.push({
      label:  '🦋 羽化',
      hint:   '成虫として羽化した日を記録',
      field:  'eclosion_date',
      color:  'var(--gold)',
    });
  } else {
    // [20260423k] 羽化後 → 後食開始ボタン
    //   羽化日〜後食開始日の目安: ♂は30〜60日、♀は20〜40日が一般的
    btns.push({
      label:  '🍽️ 後食開始',
      hint:   '成虫が後食（ゼリーを食べ始めた）を開始した日。活動開始の判定',
      field:  'feeding_start_date',
      color:  '#e88c4d',
    });
  }

  if (!btns.length) return '';

  return `
    <div class="card" style="margin-bottom:10px;border-color:rgba(202,164,48,.25)">
      <div class="card-title">⏭️ 次のステップ（ワンタップ記録）</div>
      ${btns.map(b => `
        <button type="button"
          onclick="Pages._indQuickDateSave('${ind.ind_id}', '${b.field}', ${JSON.stringify(b.label).replace(/"/g,'&quot;')}, ${b.warn ? 'true' : 'false'})"
          style="display:block;width:100%;padding:14px 12px;margin-top:4px;
            border:1px solid ${b.color};background:var(--surface2);color:var(--text1);
            border-radius:10px;cursor:pointer;text-align:left;font-size:.95rem">
          <div style="font-weight:700;color:${b.color}">${b.label}</div>
          <div style="font-size:.72rem;color:var(--text3);margin-top:2px">${b.hint} → 今日の日付で記録</div>
        </button>
      `).join('')}
      <div style="font-size:.7rem;color:var(--text3);margin-top:8px;padding:4px">
        💡 別の日付で記録したい場合は「✏️ 編集」→「発育日程」から入力してください
      </div>
    </div>`;
}

Pages._indQuickDateSave = async function (indId, field, label, warnBeforeSave) {
  if (!indId || !field) return;

  // ♀ への人工蛹室移動など、警告付きの場合は確認
  if (warnBeforeSave) {
    if (!confirm('♀は通常、自然蛹室のまま管理します。\n例外的に人工蛹室へ移動する場合のみOKを押してください。\n\n今日の日付を「前蛹確認日」として記録しますか？')) {
      return;
    }
  }

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = `${y}/${m}/${d}`;

  const updates = { ind_id: indId };
  updates[field] = todayStr;

  // [20260423k] フィールドに応じてステージを自動遷移 (退行しない)
  //   個体編集フォームの _indSave と同じロジック
  const _stageOrder = { L1L2:1, L3:2, PREPUPA:3, PUPA:4, ADULT_PRE:5, ADULT:6 };
  const _stageByField = {
    prepupa_date:      'PREPUPA',
    pupa_check_date:   'PUPA',
    eclosion_date:     'ADULT_PRE',
    feeding_start_date:'ADULT',
  };
  const targetStage = _stageByField[field];
  if (targetStage) {
    const ind = Store.getIndividual(indId);
    const currentStage = (ind && ind.current_stage) || 'L1L2';
    const ra = _stageOrder[currentStage] || 0;
    const rb = _stageOrder[targetStage]  || 0;
    if (rb > ra) {
      updates.current_stage = targetStage;
    }
  }

  try {
    const msg = updates.current_stage
      ? (label || '日付') + ' を記録 → ステージ更新 📅'
      : (label || '日付') + ' を記録しました 📅';
    await apiCall(() => API.individual.update(updates), msg);
    Store.patchDBItem('individuals', 'ind_id', indId, updates);
    Pages.individualDetail(indId);
  } catch (e) {
    console.error('[_indQuickDateSave] error:', e);
  }
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

Pages._indRevokePromotion = async function (indId) {
  const ind = Store.getIndividual(indId);
  if (!ind || !ind.promoted_par_id) return;
  const par = Store.getParent(ind.promoted_par_id);
  const parDisp = par ? (par.parent_display_id || par.display_name || '種親') : '種親';

  if (!UI.confirm(`「${parDisp}」への種親昇格を取りやめます。\n種親レコードを削除し、個体の昇格済みフラグをクリアします。\n\n続けますか？`)) return;

  try {
    await apiCall(
      () => API.parent.revokePromotion({ par_id: ind.promoted_par_id, ind_id: indId }),
      '種親昇格を取りやめました'
    );
    Store.patchDBItem('individuals', 'ind_id', indId, { promoted_par_id: '', parent_flag: false });
    const parents = Store.getDB('parents') || [];
    const pIdx = parents.findIndex(p => p.par_id === ind.promoted_par_id);
    if (pIdx >= 0) { parents[pIdx].status = 'deleted'; Store.setDB('parents', parents); }
    await syncAll(true);
    routeTo('ind-detail', { indId });
  } catch (e) {}
};

// ════════════════════════════════════════════════════════════════
// 個体新規登録 / 編集
// ════════════════════════════════════════════════════════════════
Pages.individualNew = function (params = {}) {
  const main    = document.getElementById('main');
  const isEdit  = !!params.editId;
  const ind     = isEdit ? Store.getIndividual(params.editId) : null;
  window.__indNewEditId = isEdit ? params.editId : '';
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
        <!-- [20260423j] 成虫体長 (adult_size_mm) を復活。旧フォームから消えていたため -->
        <div class="form-row-2">
          ${UI.field('成虫体長 (mm)', UI.input('adult_size_mm', 'number', v('adult_size_mm'), '例: 150.0'))}
          <div></div>
        </div>

        <div class="form-title">発育日程</div>
        <div style="font-size:.75rem;color:var(--text3);margin:-4px 0 8px;line-height:1.5">
          🏠 蛹室確認日から+18日が人工蛹室移行目安（♂のみ）。蛹確認日から+50〜70日が羽化目安。<br>
          ✨ 羽化日を入れると「成虫（未後食）」、後食開始日を入れると「成虫（活動開始）」に自動切替されます。
        </div>
        <div class="form-row-2">
          ${UI.field('蛹室確認日', UI.input('artificial_cell_date', 'date', v('artificial_cell_date','').replace(/\//g,'-')))}
          ${UI.field('前蛹確認日', UI.input('prepupa_date', 'date', v('prepupa_date','').replace(/\//g,'-')))}
        </div>
        <div class="form-row-2">
          ${UI.field('蛹確認日', UI.input('pupa_check_date', 'date', v('pupa_check_date','').replace(/\//g,'-')))}
          ${UI.field('羽化日',   UI.input('eclosion_date',   'date', v('eclosion_date','').replace(/\//g,'-')))}
        </div>
        <!-- [20260423j] 後食開始日 (活動開始日) を追加 -->
        <div class="form-row-2">
          ${UI.field('後食開始日', UI.input('feeding_start_date', 'date', v('feeding_start_date','').replace(/\//g,'-')))}
          <div></div>
        </div>

        <div class="form-title">メモ</div>
        ${UI.field('内部メモ（非公開）',   UI.textarea('note_private', v('note_private'), 2, '飼育メモ・観察記録'))}
        ${UI.field('購入者向けコメント', UI.textarea('note_public',  v('note_public'),  2, '公開可能なコメント'))}

        <div style="display:flex;gap:10px;margin-top:4px">
          <button type="button" class="btn btn-ghost" style="flex:1"
            onclick="window.__indNewEditId ? routeTo('ind-detail',{indId:window.__indNewEditId}) : Store.back()">キャンセル</button>
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

  ['hatch_date','individual_date','artificial_cell_date',
   'prepupa_date','pupa_check_date','eclosion_date','feeding_start_date'].forEach(k => {
    if (data[k]) data[k] = data[k].replace(/-/g, '/');
  });

  if (!editId && !data.line_id) { UI.toast('ラインを選択してください', 'error'); return; }
  if (!data.current_stage)      { UI.toast('ステージを選択してください', 'error'); return; }

  // [20260423j] 発育日程からステージ自動遷移
  //   日付が入力されていれば対応するステージに進める。
  //   既に先のステージに進んでいる場合は退行しない (current_stage の順序を尊重)。
  //   順序: L1L2 < L3 < PREPUPA < PUPA < ADULT_PRE < ADULT
  const _stageOrder = { L1L2:1, L3:2, PREPUPA:3, PUPA:4, ADULT_PRE:5, ADULT:6 };
  const _maxStage = (a, b) => {
    const ra = _stageOrder[a] || 0;
    const rb = _stageOrder[b] || 0;
    return ra >= rb ? a : b;
  };
  let autoStage = data.current_stage;
  if (data.prepupa_date)           autoStage = _maxStage(autoStage, 'PREPUPA');
  if (data.pupa_check_date)        autoStage = _maxStage(autoStage, 'PUPA');
  if (data.eclosion_date)          autoStage = _maxStage(autoStage, 'ADULT_PRE');
  if (data.feeding_start_date)     autoStage = _maxStage(autoStage, 'ADULT');
  if (autoStage !== data.current_stage) {
    data.current_stage = autoStage;
    UI.toast('ステージを「' + (autoStage === 'ADULT_PRE' ? '成虫（未後食）' : autoStage === 'ADULT' ? '成虫（活動開始）' : autoStage === 'PUPA' ? '蛹' : autoStage === 'PREPUPA' ? '前蛹' : autoStage) + '」に更新', 'success');
  }

  try {
    if (editId) {
      data.ind_id = editId;
      await apiCall(() => API.individual.update(data), '更新しました');
      Store.patchDBItem('individuals', 'ind_id', editId, data);
      routeTo('ind-detail', { indId: editId });
    } else {
      const res = await apiCall(() => API.individual.create(data), '登録しました 🐛');
      await syncAll(true);
      routeTo('ind-detail', { indId: res.ind_id, _fromNew: true });
    }
  } catch (e) {}
};

// ════════════════════════════════════════════════════════════════
// 共通ユーティリティ
// ════════════════════════════════════════════════════════════════

function _defectTypeLabel(type) {
  const map = {
    pupa_fail:'蛹化失敗', eclosion_fail:'羽化失敗', horn_deform:'角変形',
    elytra_open:'上翅開き', size_defect:'サイズ不全', unknown:'不明',
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
  const wts   = records.filter(r => r.weight_g && +r.weight_g > 0);
  const table = UI.weightTable(records);
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
        data: wts.map(r => +r.weight_g),
        borderColor: '#4caf78',
        backgroundColor: 'rgba(76,175,120,0.1)',
        pointBackgroundColor: '#4caf78',
        pointRadius: 4,
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6a7c6a', maxTicksLimit: 5, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: '#6a7c6a', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
      }
    }
  });
}

window._toggleAcc = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector('.acc-hdr').classList.toggle('open');
  el.querySelector('.acc-body').classList.toggle('open');
};

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
