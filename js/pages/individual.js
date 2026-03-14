// ════════════════════════════════════════════════════════════════
// individual.js
// 役割: 個体の一覧・詳細・新規登録・編集・ステータス変更を担う。
//       個体台帳の中心画面。ロット・成長記録・ラベルへの導線も持つ。
//       「3タップ以内で成長記録に飛べる」ことを最優先に設計。
// ════════════════════════════════════════════════════════════════

'use strict';

const Pages = window.Pages || {};

// ────────────────────────────────────────────────────────────────
// 個体一覧
// 将来の分割方針: list/detail/form の3ファイルに分離可能。
// 外部参照関数はすべて Pages.xxx に配置済み。
// ────────────────────────────────────────────────────────────────
Pages.individualList = function () {
  const main   = document.getElementById('main');
  const params = Store.getParams() || {};

  // ライン詳細から来た場合は固定フィルタ（ライン限定モード）
  const fixedLineId = params.line_id || '';
  const fixedLine   = fixedLineId ? Store.getLine(fixedLineId) : null;
  const isLineLimited = !!fixedLineId;

  // status='_all' は全件表示、未指定時は 'alive' がデフォルト
  const initStatus = params.status !== undefined ? params.status : 'alive';
  let filters = {
    status:  initStatus,
    q:       params.q      || '',
    stage:   params.stage  || '',
    sex:     params.sex    || '',
    line_id: fixedLineId,
  };

  function _applyFilters() {
    const list = Store.filterIndividuals(filters);
    const el   = document.getElementById('ind-list-body');
    const cEl  = document.getElementById('ind-count');
    const sEl  = document.getElementById('ind-status-label');
    if (el) el.innerHTML = list.length
      ? list.map(_indCardHTML).join('')
      : UI.empty('該当する個体がいません');
    if (cEl) cEl.textContent = list.length + '頭';
    if (sEl) {
      const s = Object.values(IND_STATUS).find(x => x.code === filters.status);
      sEl.textContent = s ? s.label : '全て';
    }
  }

  function render() {
    const list  = Store.filterIndividuals(filters);
    const total = list.length;
    const title = isLineLimited
      ? (fixedLine ? fixedLine.display_id + ' の個体' : '個体一覧')
      : '個体一覧';
    const headerOpts = isLineLimited
      ? { back: true, action: { fn: "routeTo('ind-new',{lineId:'" + fixedLineId + "'})", icon: '＋' } }
      : { action: { fn: "routeTo('ind-new')", icon: '＋' } };

    main.innerHTML = `
      ${UI.header(title, headerOpts)}
      <div class="page-body">
        <div class="search-bar">
          <input id="q" class="search-input" placeholder="🔍 ID・メモ・表示ID検索" value="${filters.q}">
          <button class="btn btn-sm btn-ghost" onclick="Pages._indQrScan()">📷QR</button>
        </div>
        <div class="filter-bar" id="stage-filter">
          ${_stageFilters(filters.stage)}
        </div>
        <div class="filter-bar" id="sex-filter">
          ${_sexFilters(filters.sex)}
        </div>
        <div class="filter-bar" id="status-filter">
          ${_statusFilters(filters.statusFilter || '')}
        </div>
        <div class="sec-hdr">
          <span class="sec-title" id="ind-count">${total}頭</span>
          <span class="sec-more" onclick="Pages._indStatusModal()">
            ステータス: <span id="ind-status-label">${
              Object.values(IND_STATUS).find(x => x.code === filters.status)?.label || '全て'
            }</span> ▼
          </span>
        </div>
        <div id="ind-list-body">
          ${total
            ? list.map(_indCardHTML).join('')
            : UI.empty('個体がいません', '右上の＋から登録できます')}
        </div>
      </div>`;

    // 修正③: 検索時に件数も更新
    document.getElementById('q').addEventListener('input', e => {
      filters.q = e.target.value;
      _applyFilters();
    });

    // ステージフィルタ
    document.getElementById('stage-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill');
      if (!p) return;
      const sv = p.dataset.val;
      if (sv === 'larva') {
        filters.stage = filters.stage === 'larva' ? '' : 'larva';
        filters._larvaGroup = filters.stage === 'larva';
      } else {
        filters.stage = sv === filters.stage ? '' : sv;
        filters._larvaGroup = false;
      }
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
      if (!val)                  filters.status = 'alive';
      else if (val === 'active') filters.status = 'alive';
      else if (val === 'sold')   filters.status = 'sold';
      else if (val === 'dead')   filters.status = 'dead';
      else if (val === 'parent') filters.status = 'parent';
      render();
    });
  }

  // ステータスモーダルからスコープ内 filters を更新できるよう登録
  window.__indSetStatus = function(code) {
    filters.status = code; // '_all' もそのまま渡す
    filters.statusFilter = '';
    render();
  };

  render();
};

function _stageFilters(active) {
  const stages = [
    { val:'', label:'全て' },
    { val:'larva',   label:'幼虫' },   // T1/T2/T3まとめ
    { val:'T1',      label:'T1' },
    { val:'T2A',     label:'T2①' },
    { val:'T2B',     label:'T2②' },
    { val:'T3',      label:'T3' },
    { val:'PREPUPA', label:'前蛹' },
    { val:'PUPA',    label:'蛹' },
    { val:'ADULT',   label:'成虫' },
  ];
  return stages.map(s =>
    `<button class="pill ${s.val === active ? 'active' : ''}" data-val="${s.val}">${s.label}</button>`
  ).join('');
}

function _statusFilters(active) {
  const statuses = [
    { val:'',       label:'全状態' },
    { val:'active', label:'飼育中' },
    { val:'sold',   label:'販売済' },
    { val:'dead',   label:'死亡' },
    { val:'parent', label:'種親' },
  ];
  return statuses.map(s =>
    `<button class="pill ${s.val === active ? 'active' : ''}" data-val="${s.val}">${s.label}</button>`
  ).join('');
}

function _sexFilters(active) {
  return [
    { val:'', label:'性別全て' },
    { val:'♂', label:'♂' },
    { val:'♀', label:'♀' },
  ].map(s =>
    `<button class="pill ${s.val === active ? 'active' : ''}" data-val="${s.val}">${s.label}</button>`
  ).join('');
}

function _indCardHTML(ind) {
  const age     = ind._age || Store.calcAge(ind.hatch_date);
  const w       = ind.latest_weight_g ? ind.latest_weight_g + 'g' : null;
  const sz      = ind.adult_size_mm    ? ind.adult_size_mm + 'mm'  : null;

  // ライン名：line_id から正引き（undefined を防ぐ）
  const line    = ind.line_id ? Store.getLine(ind.line_id) : null;
  const lineStr = line ? (line.line_code || line.display_id || '') : '';
  const lineLbl = lineStr ? lineStr + 'ライン' : (ind.line_id ? '—' : '—');

  const locality = ind.locality || (line ? line.locality : '') || '';

  // ステータスラベル
  const stMap = { alive:'飼育中', reserved:'予約済', sold:'販売済', dead:'死亡' };
  const stColor= { alive:'var(--green)', reserved:'var(--blue)', sold:'var(--amber)', dead:'var(--red,#e05050)' };
  const stLbl  = stMap[ind.status] || ind.status || '—';
  const stClr  = stColor[ind.status] || 'var(--text3)';

  // 種親・ギネスアイコン
  const icons = [
    String(ind.guinness_flag) === 'true' ? '🏆' : '',
    String(ind.parent_flag)   === 'true' ? '👑' : '',
    String(ind.g200_flag)     === 'true' ? '💪' : '',
  ].filter(Boolean).join('');

  // 性別色
  const sexColor = ind.sex === '♂' ? 'var(--male,#5ba8e8)' : ind.sex === '♀' ? 'var(--female,#e87fa0)' : 'var(--text3)';

  return '<div class="ind-card" onclick="routeTo(\x27ind-detail\x27,{id:\x27' + ind.ind_id + '\x27})" style="padding:10px 12px">'
    // 【1行目】性別 + ID + ステージ
    + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
    +   '<span style="font-weight:700;color:' + sexColor + ';font-size:.95rem">' + (ind.sex || '?') + '</span>'
    +   '<span style="font-family:var(--font-mono);font-weight:700;font-size:.9rem;flex:1">' + ind.display_id + '</span>'
    +   (icons ? '<span style="font-size:.82rem">' + icons + '</span>' : '')
    +   UI.stageBadge(ind.current_stage)
    + '</div>'
    // 【2行目】ライン / 産地
    + '<div style="font-size:.76rem;color:var(--text2);margin-bottom:3px">'
    +   lineLbl + (locality ? ' / ' + locality : '')
    + '</div>'
    // 【3行目】日齢
    + '<div style="font-size:.76rem;color:var(--text3);margin-bottom:3px">'
    +   (age ? '日齢' + age.days + '日' + (age.stageGuess ? ' · ' + age.stageGuess : '') : (ind.hatch_date ? '' : '<span style="color:var(--amber)">孵化日未設定</span>'))
    + '</div>'
    // 【4行目】サイズ
    + (w || sz ? '<div style="font-size:.8rem;color:var(--text2);margin-bottom:4px">' + [w,sz].filter(Boolean).join(' / ') + '</div>' : '')
    // 【最下段】状態バッジ
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    +   '<span style="font-size:.72rem;font-weight:700;color:' + stClr + '">' + stLbl + '</span>'
    +   '<span style="color:var(--text3);font-size:1rem">›</span>'
    + '</div>'
    + '</div>';
}

// QRスキャン（カメラ起動→QR解析は別途実装。現状はID入力）
// 修正④: 表示ID（HM2025-A1-001）でも遷移できる構造
// QRコードには内部ID（IND-xxxxx）を埋め込む前提。
// 表示IDで検索した場合はキャッシュから内部IDを逆引きする。
Pages._indQrScan = function () {
  const input = prompt('個体ID（IND-xxxxx）または表示ID（HM2025-A1-001）:');
  if (!input) return;
  const trimmed = input.trim();

  // 内部ID形式ならそのまま遷移
  if (trimmed.startsWith('IND-')) {
    routeTo('ind-detail', { id: trimmed });
    return;
  }
  // QRに "IND:IND-xxxxx" 形式で埋め込まれた場合
  if (trimmed.startsWith('IND:')) {
    routeTo('ind-detail', { id: trimmed.replace('IND:', '') });
    return;
  }
  // 表示IDで逆引き（例: HM2025-A1-001）
  const inds  = Store.getDB('individuals') || [];
  const found = inds.find(i =>
    i.display_id === trimmed ||
    i.display_id?.toLowerCase() === trimmed.toLowerCase()
  );
  if (found) {
    routeTo('ind-detail', { id: found.ind_id });
  } else {
    UI.toast('個体が見つかりません: ' + trimmed, 'error');
  }
};

// 修正①: _indStatusModal を individualList のスコープ外から呼べるよう
// filtersオブジェクトを参照せず、paramsで渡すパターンに統一。
Pages._indStatusModal = function () {
  const statuses = [
    { code:'alive',    label:'飼育中のみ（デフォルト）' },
    { code:'reserved', label:'予約済みを含む' },
    { code:'sold',     label:'販売済みを表示' },
    { code:'dead',     label:'死亡を表示' },
    { code:'_all',     label:'すべて表示' },
  ];
  const html = statuses.map(s =>
    `<button class="btn btn-ghost btn-full" style="margin-bottom:8px"
       onclick="Pages._setStatusFilter('${s.code}')">${s.label}</button>`
  ).join('');
  _showModal('ステータス絞り込み', html);
};

Pages._setStatusFilter = function (code) {
  _closeModal();
  // グローバルコールバック経由でスコープ内のfiltersを更新
  if (typeof window.__indSetStatus === 'function') {
    window.__indSetStatus(code);
  } else {
    // フォールバック：routeTo（ライン限定モードが外れるが許容）
    routeTo('ind-list', { status: code });
  }
};

// ════════════════════════════════════════════════════════════════
// 個体詳細
// ════════════════════════════════════════════════════════════════
Pages.individualDetail = async function (indId) {
  const main = document.getElementById('main');
  if (!indId) { main.innerHTML = UI.empty('IDが指定されていません'); return; }

  // まずキャッシュから表示、バックグラウンドで最新取得
  let ind = Store.getIndividual(indId);
  if (ind) _renderDetail(ind, main);
  else main.innerHTML = UI.header('個体詳細', {}) + UI.spinner();

  try {
    const res = await API.individual.get(indId);
    ind = res.individual;
    // キャッシュ更新
    Store.patchDBItem('individuals', 'ind_id', indId, ind);
    if (ind._growthRecords) Store.setGrowthRecords(indId, ind._growthRecords);
    _renderDetail(ind, main);
  } catch (e) {
    if (!ind) main.innerHTML = UI.header('エラー', {}) + `<div class="page-body">${UI.empty('取得失敗: ' + e.message)}</div>`;
  }
};

function _renderDetail(ind, main) {
  const age      = Store.calcAge(ind.hatch_date);    // 現在の日齢
  const verdict  = Store.getVerdict(ind);
  const father   = Store.getParent(ind.father_par_id);
  const mother   = Store.getParent(ind.mother_par_id);
  const bld      = Store.getBloodline(ind.bloodline_id);
  const records  = Store.getGrowthRecords(ind.ind_id) || ind._growthRecords || [];
  const originLot= ind.origin_lot_id ? Store.getLot(ind.origin_lot_id) : null;
  const line     = Store.getLine(ind.line_id);

  const icons = [
    String(ind.guinness_flag) === 'true' ? '<span title="ギネス候補">🏆</span>' : '',
    String(ind.parent_flag)   === 'true' ? '<span title="種親候補">👑</span>'  : '',
    String(ind.g200_flag)     === 'true' ? '<span title="200g候補">💪</span>'  : '',
  ].filter(Boolean).join(' ');

  main.innerHTML = `
    ${UI.header(ind.display_id, { back: true })}
    <div class="page-body">

      <!-- ヘッダーカード -->
      <div class="card card-gold">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:1.8rem">${ind.sex || '?'}</span>
          <div>
            <div style="font-family:var(--font-mono);font-size:.85rem;color:var(--gold)">${ind.display_id}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
              ${UI.stageBadge(ind.current_stage)}
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
        <!-- 日齢（現在の日齢）-->
        ${age ? `<div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px">
          <div style="font-size:.7rem;color:var(--text3);margin-bottom:6px">📅 現在の日齢</div>
          ${UI.ageFull(ind.hatch_date)}
        </div>` : '<div style="color:var(--amber);font-size:.8rem">⚠️ 孵化日未設定（設定すると日齢が表示されます）</div>'}
      </div>

      <!-- クイックアクション -->
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:2"
          onclick="routeTo('qr-scan',{mode:'weight'})"
          title="QRスキャン → 体重入力 → 保存">
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
            ${_infoRow('産地',       ind.locality     || '—')}
            ${_infoRow('累代',       ind.generation   || '—')}
            ${_infoRow('孵化日',     ind.hatch_date   || '未設定')}
            ${_infoRow('個体化日',   ind.individual_date || '—')}
            ${_infoRow('容器',       ind.current_container || '—')}
            ${_infoRow('マット',     ind.current_mat  || '—')}
            ${_infoRow('保管場所',   ind.storage_location || '—')}
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
            ${ind.head_width_mm     ? _infoRow('頭幅',     ind.head_width_mm     + ' mm') : ''}
            ${ind.prepupa_weight_g  ? _infoRow('前蛹体重', ind.prepupa_weight_g  + ' g')  : ''}
            ${ind.pupa_length_mm    ? _infoRow('蛹サイズ', ind.pupa_length_mm    + ' mm') : ''}
            ${ind.adult_size_mm     ? _infoRow('成虫サイズ',ind.adult_size_mm    + ' mm') : ''}
            ${ind.horn_length_mm    ? _infoRow('胸角長',   ind.horn_length_mm    + ' mm') : ''}
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
            ${_infoRow('親♂', father ? `${father.display_name} ${father.size_mm ? father.size_mm+'mm' : ''}` : (ind.father_par_id || '—'))}
            ${_infoRow('親♀', mother ? `${mother.display_name} ${mother.size_mm ? mother.size_mm+'mm' : ''}` : (ind.mother_par_id || '—'))}
            ${line ? _infoRow('ライン',
              `<span style="cursor:pointer;color:var(--blue)" onclick="routeTo('line-detail',{id:'${line.line_id}'})">${line.display_id} ${line.line_name ? '/ '+line.line_name : ''}</span>`
            ) : ''}
            ${ind.origin_lot_id ? _infoRow('元ロット',
              `<span style="cursor:pointer;color:var(--blue)" onclick="routeTo('lot-detail',{id:'${ind.origin_lot_id}'})">${ind.origin_lot_id}</span>
               <span style="font-size:.7rem;color:var(--text3)">（同腹: <span style="cursor:pointer;color:var(--blue)" onclick="routeTo('ind-list',{lotId:'${ind.origin_lot_id}'})">一覧を見る</span>）</span>`
            ) : ''}
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
            ${ind.prepupa_date          ? _infoRow('前蛹確認日',    ind.prepupa_date) : ''}
            ${ind.pupa_check_date       ? _infoRow('蛹確認日',      ind.pupa_check_date) : ''}
            ${ind.artificial_cell_date  ? _infoRow('人工蛹室移行日', ind.artificial_cell_date) : ''}
          </div>
        </div>
      </div>` : ''}

      <!-- 不全情報 -->
      ${String(ind.is_defective) === 'true' ? `
      <div class="card" style="border-color:rgba(231,76,60,.4);background:rgba(231,76,60,.05)">
        <div class="card-title" style="color:var(--red)">⚠️ 不全記録</div>
        <div class="info-list">
          ${_infoRow('発生ステージ', ind.defect_stage || '—')}
          ${_infoRow('不全種別',    _defectTypeLabel(ind.defect_type))}
          ${ind.defect_note ? _infoRow('メモ', ind.defect_note) : ''}
        </div>
      </div>` : ''}

      <!-- 販売情報 -->
      ${ind.status === 'sold' ? `
      <div class="card" style="border-color:rgba(52,152,219,.4)">
        <div class="card-title" style="color:var(--blue)">💰 販売済み</div>
        <div class="info-list">
          ${_infoRow('販売日',      ind.sold_date   || '—')}
          ${_infoRow('販売時体重',  ind.sold_weight ? ind.sold_weight+'g' : '—')}
          ${_infoRow('販売時ステージ', ind.sold_stage || '—')}
          ${ind.sold_reason ? _infoRow('理由', ind.sold_reason) : ''}
        </div>
      </div>` : ''}

      <!-- 最大体重 -->
      ${ind.max_weight_g ? `
      <div style="text-align:center;padding:6px;font-size:.8rem;color:var(--text3)">
        最大体重記録: <strong>${ind.max_weight_g}g</strong>
      </div>` : ''}

      <!-- 種親昇格 -->
      ${ind.eclosion_date && !ind.promoted_par_id ? `
      <button class="btn btn-gold btn-full"
