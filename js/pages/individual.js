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
      if (!val)                       filters.status = '';
      else if (val === 'active')      filters.status = 'active';
      else if (val === 'selling')     filters.status = 'selling';
      else if (val === 'sold')        filters.status = 'sold';
      else if (val === 'dead')        filters.status = 'dead';
      else if (val === 'parent')      filters.status = 'parent';
      else                            filters.status = val;
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
    { val:'selling', label:'販売候補・出品中・予約済' },
    { val:'sold',    label:'販売済' },
    { val:'dead',    label:'死亡' },
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
  try {
    var vm = (typeof normalizeIndForView === 'function')
      ? normalizeIndForView(ind) : null;
    if (vm) return renderIndCard(vm);
  } catch(e) { console.warn('[_indCardHTML]', e.message); }
  // フォールバック
  return '<div class="entity-card card" data-ind-id="' + (ind.ind_id||'') + '">'
    + '<div class="entity-card__left"><div class="entity-card__code">' + (ind.sex||'?') + '</div></div>'
    + '<div class="entity-card__main"><div style="font-size:.8rem">' + (ind.display_id||ind.ind_id||'') + '</div></div>'
    + '<div class="entity-card__arrow">›</div></div>';
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
    routeTo('ind-detail', { indId: trimmed });
    return;
  }
  // QRに "IND:IND-xxxxx" 形式で埋め込まれた場合
  if (trimmed.startsWith('IND:')) {
    routeTo('ind-detail', { indId: trimmed.replace('IND:', '') });
    return;
  }
  // 表示IDで逆引き（例: HM2025-A1-001）
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

// 修正①: _indStatusModal を individualList のスコープ外から呼べるよう
// filtersオブジェクトを参照せず、paramsで渡すパターンに統一。
Pages._indStatusModal = function () {
  const statuses = [
    { code:'',              label:'飼育中すべて（デフォルト）' },
    { code:'active',        label:'幼虫・成虫のみ' },
    { code:'selling',       label:'販売候補・出品中・予約済' },
    { code:'seed_candidate',label:'種親候補を表示' },
    { code:'sold',          label:'販売済みを表示' },
    { code:'dead',          label:'死亡を表示' },
    { code:'_all',          label:'すべて表示' },
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
  if (indId && typeof indId === 'object') indId = indId.id || indId.indId || '';
  const main = document.getElementById('main');
  if (!indId) { main.innerHTML = UI.empty('IDが指定されていません'); return; }

  // まずキャッシュから表示、バックグラウンドで最新取得
  let ind = Store.getIndividual(indId);
  if (ind) _renderDetail(ind, main);
  else main.innerHTML = UI.header('個体詳細', {}) + UI.spinner();

  try {
    const res = await API.individual.get(indId);
    // 競合防止: API返却時に ind-detail にいるか・同じIDか確認
    if (Store.getPage() !== 'ind-detail') return;
    if (Store.getParams().indId !== indId && Store.getParams().id !== indId) return;
    ind = res.individual;
    // キャッシュ更新
    Store.patchDBItem('individuals', 'ind_id', indId, ind);
    if (ind._growthRecords) Store.setGrowthRecords(indId, ind._growthRecords);
    _renderDetail(ind, main);
  } catch (e) {
    if (!ind && Store.getPage() === 'ind-detail') {
      main.innerHTML = UI.header('エラー', {back:true}) + `<div class="page-body">${UI.empty('取得失敗: ' + e.message)}</div>`;
    }
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
              `<span style="cursor:pointer;color:var(--blue)" onclick="routeTo('line-detail',{lineId:'${line.line_id}'})">${line.display_id} ${line.line_name ? '/ '+line.line_name : ''}</span>`
            ) : ''}
            ${ind.origin_lot_id ? _infoRow('元ロット',
              `<span style="cursor:pointer;color:var(--blue)" onclick="routeTo('lot-detail',{lotId:'${ind.origin_lot_id}'})">${ind.origin_lot_id}</span>
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
            種親ID: <span style="cursor:pointer;color:var(--blue)"
              onclick="routeTo('parent-detail',{parId:'${ind.promoted_par_id}'})">${ind.promoted_par_id}</span>
          </div>
        </div>
      </div>` : ''}

      <!-- ステータス変更 -->
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm"
          onclick="Pages._indMarkDead('${ind.ind_id}')">💀 死亡</button>
        <button class="btn btn-ghost btn-sm" style="${ind.status==='reserved'?'color:var(--blue);border-color:var(--blue);':''}"          onclick="Pages._indMarkReserved('${ind.ind_id}')">📦 予約${ind.status==='reserved'?' ✓':''}</button>
        <button class="btn btn-ghost btn-sm" style="margin-left:auto"
          onclick="Pages._indFlagMenu('${ind.ind_id}','${ind.guinness_flag}','${ind.parent_flag}','${ind.g200_flag}')">
          🏷 フラグ</button>
      </div>

    </div>`;

  // Chart.jsで体重グラフ描画
  if (records.filter(r => r.weight_g).length >= 2) {
    setTimeout(() => _drawWeightChart(ind.ind_id, records), 100);
  }
}

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
  const wts = records.filter(r => r.weight_g && +r.weight_g > 0);
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

// ステータス変更
Pages._indMarkDead = async function (id) {
  if (!UI.confirm('死亡として記録しますか？（元に戻せません）')) return;
  try {
    await apiCall(() => API.individual.changeStatus(id, 'dead'), '死亡を記録しました');
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'dead' });
    routeTo('ind-list');
  } catch (e) {}
};

Pages._indCancelReserved = async function (id) {
  try {
    await apiCall(() => API.individual.changeStatus(id, 'for_sale'), '予約を解除しました');
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'for_sale' });
    Pages.individualDetail(id);
  } catch (e) {}
};

Pages._indMarkReserved = async function (id) {
  try {
    await apiCall(() => API.individual.changeStatus(id, 'reserved'), '予約済みに変更しました');
    Store.patchDBItem('individuals', 'ind_id', id, { status: 'reserved' });
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

  const sexLabel  = ind.sex       || '未設定';
  const sizeLabel = ind.adult_size_mm ? ind.adult_size_mm + ' mm' : '未入力';
  const eclosion  = ind.eclosion_date || '—';
  const today     = new Date().toISOString().split('T')[0];

  _showModal('🌟 種親に昇格', `
    <div class="form-section">
      <div style="background:rgba(200,168,75,.1);border:1px solid rgba(200,168,75,.25);
        border-radius:10px;padding:12px 14px;margin-bottom:14px">
        <div style="font-size:.78rem;color:var(--text3);margin-bottom:6px">引き継ぐ個体情報</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:.83rem">
          <span style="color:var(--text3)">個体ID</span><span style="font-weight:600">${ind.display_id}</span>
          <span style="color:var(--text3)">性別</span><span style="font-weight:600">${sexLabel}</span>
          <span style="color:var(--text3)">成虫サイズ</span><span style="font-weight:600">${sizeLabel}</span>
          <span style="color:var(--text3)">羽化日</span><span style="font-weight:600">${eclosion}</span>
        </div>
      </div>

      <div style="font-size:.78rem;color:var(--text3);margin-bottom:4px">種親IDは自動採番されます（${ind.sex === '♂' ? 'M年-英字' : 'F年-連番'}）</div>

      ${UI.field('後食開始日（任意）',
        `<input type="date" id="prm-feeding" class="input" value="">`)}
      ${UI.field('表示名（任意・空白なら自動）',
        `<input type="text" id="prm-name" class="input" placeholder="例: M26-A（空白=自動採番の値）">`)}

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
        ind_id:              indId,
        feeding_start_date:  feeding || '',
        display_name:        name    || '',
      }),
      '種親に昇格しました 🌟'
    );
    // キャッシュ更新
    Store.patchDBItem('individuals', 'ind_id', indId, {
      parent_flag:     true,
      promoted_par_id: res.par_id,
    });
    // 種親データをリロードしてから種親詳細へ
    await syncAll(true);
    routeTo('parent-detail', { parId: res.par_id });
  } catch(e) {}
};

// ════════════════════════════════════════════════════════════════
// 個体新規登録 / 編集
// ════════════════════════════════════════════════════════════════
Pages.individualNew = function (params = {}) {
  const main   = document.getElementById('main');
  const isEdit = !!params.editId;
  const ind    = isEdit ? Store.getIndividual(params.editId) : null;
  const lines  = Store.getDB('lines') || [];
  const parents= Store.getDB('parents') || [];
  const blds   = Store.getDB('bloodlines') || [];

  const v = (field, fallback = '') =>
    ind ? (ind[field] !== undefined ? ind[field] : fallback) : (params[field] || fallback);

  main.innerHTML = `
    ${UI.header(isEdit ? '個体編集' : '個体登録', { back: true })}
    <div class="page-body">
      <form id="ind-form" class="form-section">

        <div class="form-title">ライン情報</div>
        ${UI.field('ライン', UI.select('line_id',
          lines.map(l => ({ code: l.line_id, label: `${l.display_id}${l.line_name ? ' / '+l.line_name : ''}` })),
          v('line_id', params.lineId || ''), 'ラインを選択'), true)}

        <div class="form-title">基本情報</div>
        <div class="form-row-2">
          ${UI.field('性別', UI.select('sex', [
            { code:'♂', label:'♂ オス' },
            { code:'♀', label:'♀ メス' },
            { code:'不明', label:'不明' },
          ], v('sex')))}
          ${UI.field('ステージ', UI.select('current_stage',
            STAGE_LIST.map(s => ({ code: s.code, label: s.label })),
            v('current_stage', 'T1')), true)}
        </div>
        <div class="form-row-2">
          ${UI.field('孵化日', UI.input('hatch_date', 'date', v('hatch_date')))}
          ${UI.field('累代', UI.input('generation', 'text', v('generation'), 'WF1 / CBF1'))}
        </div>
        <div class="form-row-2">
          ${UI.field('容器', UI.select('current_container',
            CONTAINER_SIZES.map(s => ({ code: s, label: s })),
            v('current_container')))}
          ${UI.field('マット', UI.select('current_mat',
            MAT_TYPES.map(m => ({ code: m.code, label: m.label })),
            v('current_mat')))}
        </div>
        ${UI.field('産地', UI.input('locality', 'text', v('locality', 'Guadeloupe')))}
        ${UI.field('保管場所', UI.input('storage_location', 'text', v('storage_location'), '例: 棚A-3'))}

        <div class="form-title">血統情報</div>
        ${UI.field('血統', UI.select('bloodline_id',
          blds.map(b => ({ code: b.bloodline_id, label: (b.abbreviation || b.bloodline_name) })),
          v('bloodline_id')))}
        ${UI.field('血統ステータス', UI.select('bloodline_status', [
          { code:'confirmed',  label:'確定' },
          { code:'temporary',  label:'暫定' },
          { code:'unknown',    label:'不明' },
        ], v('bloodline_status', 'unknown')))}

        <div class="form-title">種親</div>
        ${UI.field('親♂', UI.select('father_par_id',
          parents.filter(p => p.sex === '♂').map(p => ({ code: p.par_id, label: `${p.display_name}${p.size_mm ? ' '+p.size_mm+'mm' : ''}` })),
          v('father_par_id')))}
        ${UI.field('親♀', UI.select('mother_par_id',
          parents.filter(p => p.sex === '♀').map(p => ({ code: p.par_id, label: `${p.display_name}${p.size_mm ? ' '+p.size_mm+'mm' : ''}` })),
          v('mother_par_id')))}

        <!-- 元ロットIDは分割時に自動セット。手入力フィールドは廃止 -->

        <div class="form-title">形態・成長データ</div>
        <div class="form-row-2">
          ${UI.field('頭幅 (mm)', UI.input('head_width_mm', 'number', v('head_width_mm'), '例: 14.5'))}
          ${UI.field('前蛹体重 (g)', UI.input('prepupa_weight_g', 'number', v('prepupa_weight_g'), '例: 45.2'))}
        </div>
        <div class="form-row-2">
          ${UI.field('蛹サイズ (mm)', UI.input('pupa_length_mm', 'number', v('pupa_length_mm'), '例: 90.0'))}
          ${UI.field('胸角長 (mm)', UI.input('horn_length_mm', 'number', v('horn_length_mm'), '例: 65.0'))}
        </div>

        <div class="form-title">ステータス</div>
        ${isEdit ? `<label style="display:flex;align-items:center;gap:8px;padding:10px 0;font-size:.9rem;cursor:pointer">
          <input type="checkbox" id="chk-reserved" ${ind && ind.status==='reserved' ? 'checked' : ''}
            style="width:18px;height:18px;cursor:pointer">
          <span>📦 予約中（チェックを外すと飼育中に戻ります）</span>
        </label>` : ''}

        <div class="form-title">メモ</div>
        ${UI.field('内部メモ（非公開）', UI.textarea('note_private', v('note_private'), 2, '飼育メモ・観察記録'))}
        ${UI.field('購入者向けコメント', UI.textarea('note_public', v('note_public'), 2, '公開可能なコメント'))}

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

  // 日付形式を YYYY/MM/DD に統一（inputのvalueは YYYY-MM-DD）
  if (data.hatch_date) data.hatch_date = data.hatch_date.replace(/-/g, '/');

  // 予約チェックボックス：編集時のみ status に反映
  if (editId) {
    const chk = document.getElementById('chk-reserved');
    if (chk) {
      data.status = chk.checked ? 'reserved' : 'for_sale';
    }
  }

  // バリデーション
  if (!editId && !data.line_id) { UI.toast('ラインを選択してください', 'error'); return; }
  if (!data.current_stage)      { UI.toast('ステージを選択してください', 'error'); return; }

  try {
    if (editId) {
      data.ind_id = editId;
      const res = await apiCall(() => API.individual.update(data), '更新しました');
      Store.patchDBItem('individuals', 'ind_id', editId, data);
      routeTo('ind-detail', { indId: editId });
    } else {
      const res = await apiCall(() => API.individual.create(data), '登録しました');
      await syncAll(true); // 一覧を最新化
      routeTo('ind-detail', { indId: res.ind_id });
    }
  } catch (e) {}
};

// ════════════════════════════════════════════════════════════════
// 共通ユーティリティ（このファイル内）
// ════════════════════════════════════════════════════════════════

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
