// ════════════════════════════════════════════════════════════════
// lot.js — Phase4-1 UI統一版
// ロット一覧・詳細・分割・個体化を担う
// カードUIを3列（コード | 頭数+ステージ | ›）に統一
// ════════════════════════════════════════════════════════════════

'use strict';

// ════════════════════════════════════════════════════════════════
// ロット一覧
// ════════════════════════════════════════════════════════════════
Pages.lotList = function () {
  const main   = document.getElementById('main');
  const params = Store.getParams() || {};
  const fixedLineId = params.line_id || '';
  const fixedLine   = fixedLineId ? Store.getLine(fixedLineId) : null;
  const isLineLimited = !!fixedLineId;

  let filters = { status: 'active', stage: '', line_id: fixedLineId };

  function render() {
    const lots  = Store.filterLots(filters);
    const lines = Store.getDB('lines') || [];
    const title = isLineLimited
      ? (fixedLine ? (fixedLine.line_code || fixedLine.display_id) + ' のロット' : 'ロット一覧')
      : 'ロット一覧';
    const headerOpts = isLineLimited
      ? { back: true, action: { fn: "routeTo('lot-new',{lineId:'" + fixedLineId + "'})", icon: '＋' } }
      : { action: { fn: "routeTo('lot-new')", icon: '＋' } };

    // 合計頭数
    const totalCount = lots.reduce((s, l) => s + (+l.count || 0), 0);

    main.innerHTML = `
      ${UI.header(title, headerOpts)}
      <div class="page-body">
        <div class="filter-bar" id="lot-stage-filter">
          ${_lotStageFilters(filters.stage)}
        </div>
        ${!isLineLimited ? `<div class="filter-bar" id="lot-line-filter">
          <button class="pill ${!filters.line_id ? 'active' : ''}" data-val="">ライン全て</button>
          ${lines.slice(0,8).map(l =>
            '<button class="pill ' + (l.line_id === filters.line_id ? 'active' : '') + '" data-val="' + l.line_id + '">' + (l.line_code || l.display_id) + '</button>'
          ).join('')}
        </div>` : ''}
        <div class="sec-hdr">
          <span class="sec-title">${lots.length}ロット / 計<strong>${totalCount}</strong>頭</span>
          <div style="display:flex;gap:8px;align-items:center">
            ${isLineLimited && fixedLineId ? `<button class="btn btn-ghost btn-sm" style="font-size:.72rem;padding:4px 10px"
              onclick="event.stopPropagation();routeTo('lot-bulk',{lineId:'${fixedLineId}'})">📦 一括ロット化</button>` : ''}
            <span class="sec-more" onclick="Pages._lotShowDissolved()">分割済も表示</span>
          </div>
        </div>
        <div id="lot-list-body">
          ${lots.length ? lots.map(_lotCardHTML).join('') : UI.empty('ロットがありません', isLineLimited ? 'このラインにロットがありません' : 'ラインから産卵セット経由で登録できます')}
        </div>
      </div>`;

    document.getElementById('lot-stage-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      filters.stage = p.dataset.val === filters.stage ? '' : p.dataset.val;
      render();
    });
    if (!isLineLimited) {
      const lineFilter = document.getElementById('lot-line-filter');
      if (lineFilter) lineFilter.addEventListener('click', e => {
        const p = e.target.closest('.pill'); if (!p) return;
        filters.line_id = p.dataset.val === filters.line_id ? '' : p.dataset.val;
        render();
      });
    }
  }

  render();
};

function _lotStageFilters(active) {
  const stages = [
    { val:'',    label:'全て' },
    { val:'EGG', label:'卵' },
    { val:'T0',  label:'T0' },
    { val:'T1',  label:'T1' },
    { val:'T2A', label:'T2①' },
    { val:'T2B', label:'T2②' },
    { val:'T3',  label:'T3' },
  ];
  return stages.map(s =>
    `<button class="pill ${s.val === active ? 'active' : ''}" data-val="${s.val}">${s.label}</button>`
  ).join('');
}

// ════════════════════════════════════════════════════════════════
// ロットカード — 3列レイアウト（コード | 頭数+情報 | ›）
// ════════════════════════════════════════════════════════════════
function _lotCardHTML(lot) {
  const line = Store.getLine(lot.line_id);
  const lineCode = line ? (line.line_code || line.display_id) : '';

  // 最新成長記録から状態を取得
  const recs = Store.getGrowthRecords(lot.lot_id) || [];
  const latestRec = recs.length > 0
    ? [...recs].sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))[0]
    : null;
  const dispStage     = latestRec?.stage       || lot.stage           || '—';
  const dispContainer = latestRec?.container   || lot.container_size  || '';
  const dispMat       = latestRec?.mat_type    || lot.mat_type        || '';
  const dispWeight    = latestRec?.weight_g    ? latestRec.weight_g + 'g' : null;

  const stageDisp = stageLabel(dispStage === 'T2A' || dispStage === 'T2B' ? 'T2' : dispStage);
  const sColor    = stageColor(dispStage);

  // 腐卵統一済み（表示のみ）
  const count = +lot.count || 0;

  return `<div class="lot-card" onclick="routeTo('lot-detail',{lotId:'${lot.lot_id}'})">
    <!-- 左列: ラインコード + ロットID -->
    <div class="lot-card-left">
      <div class="lot-card-line">${lineCode}</div>
      <div class="lot-card-id">${lot.display_id}</div>
    </div>
    <!-- 中央: 頭数強調 + サブ情報 -->
    <div class="lot-card-center">
      <div class="lot-card-count">${count}<span class="lot-card-count-unit">頭</span></div>
      <div class="lot-card-sub">
        <span class="lot-card-stage" style="color:${sColor}">${stageDisp}</span>
        ${dispContainer ? `<span class="lot-card-sub-item">${dispContainer}</span>` : ''}
        ${dispMat       ? `<span class="lot-card-sub-item">${dispMat}</span>` : ''}
        ${dispWeight    ? `<span class="lot-card-sub-item" style="color:var(--green)">${dispWeight}</span>` : ''}
      </div>
    </div>
    <!-- 右列: 矢印 -->
    <div class="lot-card-arrow">›</div>
  </div>`;
}

Pages._lotShowDissolved = function () {
  const dissolved = (Store.getDB('lots') || []).filter(l =>
    l.status === 'dissolved' || l.status === 'split'
  );
  if (!dissolved.length) { UI.toast('分割済みロットはありません', 'info'); return; }
  const el = document.getElementById('lot-list-body');
  if (!el) return;
  el.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;opacity:.6">
    <div style="font-size:.72rem;color:var(--text3);padding:4px 0">── 分割済みロット ──</div>
    ${dissolved.map(_lotCardHTML).join('')}
  </div>`);
  document.querySelector('[onclick*="_lotShowDissolved"]')?.style.setProperty('display','none');
};

// ════════════════════════════════════════════════════════════════
// ロット詳細
// ════════════════════════════════════════════════════════════════
Pages.lotDetail = async function (lotId) {
  if (lotId && typeof lotId === 'object') lotId = lotId.id || lotId.lotId || '';
  const main = document.getElementById('main');
  if (!lotId) { main.innerHTML = UI.empty('IDが指定されていません'); return; }

  let lot = Store.getLot(lotId);
  if (lot) _renderLotDetail(lot, main);
  else main.innerHTML = UI.header('ロット詳細', {}) + UI.spinner();

  try {
    const res = await API.lot.get(lotId);
    if (Store.getPage() !== 'lot-detail') return;
    if (Store.getParams().lotId !== lotId && Store.getParams().id !== lotId) return;
    lot = res.lot;
    _renderLotDetail(lot, main);
  } catch (e) {
    if (!lot && Store.getPage() === 'lot-detail') {
      main.innerHTML = UI.header('エラー', {back:true}) +
        `<div class="page-body">${UI.empty('取得失敗: ' + e.message)}</div>`;
    }
  }
};

function _renderLotDetail(lot, main) {
  const age   = Store.calcAge(lot.hatch_date);
  const line  = Store.getLine(lot.line_id);
  const lineCode = line ? (line.line_code || line.display_id) : '';
  const records = lot._growthRecords || Store.getGrowthRecords(lot.lot_id) || [];

  // 最新成長記録から状態を取得
  const latestRec = records.length > 0
    ? [...records].sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))[0]
    : null;
  const dispContainer = (latestRec?.container)  || lot.container_size || '—';
  const dispMat       = (latestRec?.mat_type)    || lot.mat_type       || '—';
  const dispExchange  = latestRec?.record_date   || lot.mat_changed_at  || '—';
  const dispWeight    = latestRec?.weight_g      ? latestRec.weight_g + 'g' : null;
  const dispStage     = (latestRec?.stage)        || lot.stage           || '—';

  main.innerHTML = `
    ${UI.header(lot.display_id, {
      back: true,
      action: { fn: `_lotQuickActions('${lot.lot_id}')`, icon: '…' }
    })}
    <div class="page-body">

      <!-- ヘッダーカード: 3列レイアウト統一 -->
      <div class="card card-gold">
        <div class="lot-detail-header">
          <div class="lot-detail-left">
            <div class="lot-detail-line">${lineCode}</div>
            <div class="lot-detail-id">${lot.display_id}</div>
          </div>
          <div class="lot-detail-center">
            <div class="lot-detail-count">${lot.count}<span style="font-size:.9rem;font-weight:400;color:var(--text3)">頭</span></div>
            ${UI.stageBadge(dispStage !== '—' ? dispStage : lot.stage)}
          </div>
          <div class="lot-detail-right">
            ${age ? `<div style="font-size:.72rem;color:var(--text3)">日齢</div><div style="font-weight:700;font-size:1rem">${age.days}</div>` : ''}
          </div>
        </div>
        ${age ? `<div style="background:var(--bg3);border-radius:var(--radius-sm);padding:8px;margin-top:8px">
          ${UI.ageFull(lot.hatch_date)}
        </div>` : ''}
      </div>

      <!-- アクションボタン -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button style="padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.92rem;
          background:var(--green);color:#fff;border:none;cursor:pointer"
          onclick="routeTo('growth-rec',{targetType:'LOT',targetId:'${lot.lot_id}',displayId:'${lot.display_id}'})">
          📷 記録
        </button>
        <button style="padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.92rem;
          background:var(--surface3,#3a3a4a);color:var(--text1);border:1px solid var(--border);cursor:pointer"
          onclick="Pages._showSplitModal('${lot.lot_id}',${lot.count},'${lot.stage||'T1'}','${lot.line_id}','${lot.hatch_date||''}','${lot.display_id}')">
          ✂️ 分割
        </button>
      </div>

      <!-- 基本情報 -->
      <div class="card">
        <div class="card-title">ロット情報</div>
        <div class="info-list">
          ${_infoRow('ライン', line ? `<span onclick="routeTo('line-detail',{lineId:'${line.line_id}'})" style="color:var(--blue);cursor:pointer">${lineCode}</span>` : lot.line_id)}
          ${dispWeight ? _infoRow('最新体重', `<span style="font-weight:700;color:var(--green)">${dispWeight}</span>`) : ''}
          ${_infoRow('現在ステージ', dispStage !== '—' ? dispStage : (lot.stage || '—'))}
          ${_infoRow('容器',     dispContainer)}
          ${_infoRow('マット',   dispMat)}
          ${_infoRow('孵化日',   lot.hatch_date || '未設定')}
          ${_infoRow('最終交換', dispExchange)}
          ${lot.parent_lot_id ? _infoRow('分割元', `<span style="color:var(--blue);cursor:pointer" onclick="routeTo('lot-detail',{lotId:'${lot.parent_lot_id}'})">${lot.parent_lot_id}</span>`) : ''}
          ${lot.note ? _infoRow('メモ', lot.note) : ''}
        </div>
      </div>

      <!-- 孵化日未設定時のボタン -->
      ${!lot.hatch_date ? `
      <button class="btn btn-full" style="background:var(--amber);color:#1a1a1a;font-weight:700"
        onclick="Pages._lotSetHatchDate('${lot.lot_id}')">
        📅 孵化日を設定
      </button>` : ''}

      <!-- 成長記録 -->
      <div class="accordion" id="acc-lot-growth">
        <div class="acc-hdr open" onclick="_toggleAcc('acc-lot-growth')">
          成長記録（${records.length}件）<span class="acc-arrow">▼</span>
        </div>
        <div class="acc-body open">
          ${records.length ? UI.weightTable(records) : UI.empty('記録なし')}
        </div>
      </div>

      <!-- ステータス変更 -->
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-ghost btn-sm"
          onclick="Pages._lotEditStage('${lot.lot_id}','${lot.stage}')">
          ステージ変更
        </button>
        <button class="btn btn-ghost btn-sm"
          onclick="Pages._lotEditMat('${lot.lot_id}')">
          マット変更
        </button>
      </div>

    </div>`;
}

// ════════════════════════════════════════════════════════════════
// ロット分割
// ════════════════════════════════════════════════════════════════
let _splitCards = [];
let _splitContext = {};

Pages._showSplitModal = function (lotId, totalCount, stage, lineId, hatchDate, displayId) {
  _splitContext = { lotId, totalCount: +totalCount, stage, lineId, hatchDate, displayId };
  _splitCards = [
    { count: Math.floor(totalCount/2), container:'', mat:'', size_category:'', sex_hint:'', note:'' },
    { count: totalCount - Math.floor(totalCount/2), container:'', mat:'', size_category:'', sex_hint:'', note:'' },
  ];
  _renderSplitModal();
};

function _renderSplitModal() {
  const { lotId, totalCount, stage, hatchDate, displayId } = _splitContext;
  const usedCount = _splitCards.reduce((s,c) => s + (c.count||0), 0);
  const remaining = totalCount - usedCount;
  const totalOk   = remaining === 0;

  const cardHtml = _splitCards.map((c, i) => {
    const suffix = String.fromCharCode(65 + i);
    const isOne  = (c.count === 1);
    return `<div style="border:1px solid ${isOne?'var(--green)':'var(--border)'};border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-family:var(--font-mono);font-weight:700;color:var(--gold);font-size:1rem">-${suffix}</span>
        ${isOne ? '<span style="font-size:.7rem;padding:2px 8px;background:var(--green);color:#fff;border-radius:20px">自動個体化</span>' : ''}
        <button style="margin-left:auto;color:var(--red);background:none;border:none;font-size:1rem;cursor:pointer"
          onclick="_splitCards.splice(${i},1);_renderSplitModal()">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">頭数 *</div>
          <input type="number" class="input" min="1" value="${c.count||1}" style="width:100%"
            onchange="_splitCards[${i}].count=Math.max(1,+this.value||1);_renderSplitModal()">
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">容器</div>
          <select class="input" style="width:100%" onchange="_splitCards[${i}].container=this.value">
            ${['','1.8L','2.7L','4.8L'].map(s=>`<option value="${s}" ${c.container===s?'selected':''}>${s||'選択…'}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">マット</div>
          <select class="input" style="width:100%" onchange="_splitCards[${i}].mat=this.value">
            ${['','T0','T1','T2A','T2B','T3'].map(s=>`<option value="${s}" ${c.mat===s?'selected':''}>${s||'選択…'}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">サイズ区分</div>
          <select class="input" style="width:100%" onchange="_splitCards[${i}].size_category=this.value">
            ${['','大','中','小'].map(s=>`<option value="${s}" ${c.size_category===s?'selected':''}>${s||'未分類'}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">雌雄</div>
          <select class="input" style="width:100%" onchange="_splitCards[${i}].sex_hint=this.value">
            ${['','♂','♀','不明'].map(s=>`<option value="${s}" ${c.sex_hint===s?'selected':''}>${s||'未判別'}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">メモ</div>
          <input type="text" class="input" value="${c.note||''}" style="width:100%"
            oninput="_splitCards[${i}].note=this.value">
        </div>
      </div>
    </div>`;
  }).join('');

  _showModal('ロット分割', `
    <div style="font-size:.82rem;color:var(--text3);margin-bottom:8px">
      元ロット: ${displayId} / ${totalCount}頭 / ${stage}
    </div>
    <div style="font-size:.85rem;font-weight:700;color:${totalOk?'var(--green)':'var(--amber)'};margin-bottom:8px">
      割当: ${usedCount}頭 / 残り: ${remaining}頭 ${totalOk?'✅':''}
    </div>
    <div style="max-height:50vh;overflow-y:auto" id="split-cards-wrap">${cardHtml}</div>
    <button class="btn btn-ghost btn-full" style="margin-top:4px"
      onclick="_splitCards.push({count:1,container:'',mat:'',size_category:'',sex_hint:'',note:''});_renderSplitModal()">
      ＋ 分割先を追加
    </button>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2"
        onclick="Pages._execSplit('${lotId}',${totalCount})"
        ${totalOk?'':'disabled style="opacity:.5"'}>
        分割実行
      </button>
    </div>`);
}

Pages._execSplit = async function (lotId, maxCount) {
  const counts  = _splitCards.map(c => c.count||0);
  const details = _splitCards.map(c => ({
    container_size: c.container || '',
    mat_type:       c.mat       || '',
    size_category:  c.size_category || '',
    sex_hint:       c.sex_hint  || '',
    note:           c.note      || '',
  }));
  const total = counts.reduce((s,n) => s+n, 0);

  if (!counts.length) { UI.toast('分割先を入力してください', 'error'); return; }
  if (total > maxCount) { UI.toast('合計(' + total + ')が元ロット頭数(' + maxCount + ')を超えています', 'error'); return; }
  if (total !== maxCount) { UI.toast('合計(' + total + ')と元ロット(' + maxCount + '頭)が一致していません', 'error'); return; }

  _closeModal();
  try {
    const res = await apiCall(
      () => API.lot.split({ lot_id: lotId, split_counts: counts, split_details: details }),
      counts.length + 'ロットに分割しました'
    );
    await syncAll(true);
    if (res && res.auto_individuals && res.auto_individuals.length) {
      const names = res.auto_individuals.map(i => i.display_id).join(', ');
      UI.toast('自動個体化: ' + names, 'success');
    }
    const ctx = _splitContext;
    if (ctx.lineId) routeTo('lot-list', { line_id: ctx.lineId });
    else routeTo('lot-list');
  } catch (e) {}
};

// ステージ変更
Pages._lotEditStage = function (lotId, currentStage) {
  _showModal('ステージ変更', `
    <div class="form-section">
      ${UI.field('新しいステージ', UI.select('new-stage', [
        { code:'EGG', label:'卵' }, { code:'T0', label:'T0' },
        { code:'T1', label:'T1' }, { code:'T2A', label:'T2①（モルト入り）' },
        { code:'T2B', label:'T2②（純T2）' }, { code:'T3', label:'T3' },
      ], currentStage))}
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" onclick="Pages._lotStageUpdate('${lotId}')">変更</button>
      </div>
    </div>`);
};

Pages._lotStageUpdate = async function (lotId) {
  const stage = document.querySelector('[name="new-stage"]')?.value;
  if (!stage) return;
  _closeModal();
  try {
    await apiCall(() => API.lot.update({ lot_id: lotId, stage }), 'ステージを変更しました');
    Pages.lotDetail(lotId);
  } catch (e) {}
};

// マット変更
Pages._lotEditMat = function (lotId) {
  _showModal('マット変更', `
    <div class="form-section">
      ${UI.field('マット種別', UI.select('new-mat',
        MAT_TYPES.map(m => ({ code: m.code, label: m.label }))))}
      ${UI.field('モルト', `<label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="new-malt"> モルト入り
      </label>`)}
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" onclick="Pages._lotMatUpdate('${lotId}')">変更</button>
      </div>
    </div>`);
};

Pages._lotMatUpdate = async function (lotId) {
  const mat  = document.querySelector('[name="new-mat"]')?.value;
  const malt = document.getElementById('new-malt')?.checked || false;
  _closeModal();
  const today = new Date().toISOString().split('T')[0].replace(/-/g,'/');
  try {
    await apiCall(() => API.lot.update({ lot_id: lotId, mat_type: mat, has_malt: malt, mat_changed_at: today }),
      'マットを変更しました');
    Pages.lotDetail(lotId);
  } catch (e) {}
};

// ロット新規登録
Pages.lotNew = function (params = {}) {
  const main  = document.getElementById('main');
  const lines = Store.getDB('lines') || [];

  main.innerHTML = `
    ${UI.header('ロット登録', { back: true })}
    <div class="page-body">
      <form id="lot-form" class="form-section">
        ${UI.field('ライン', UI.select('line_id',
          lines.map(l => ({ code: l.line_id, label: `${l.line_code || l.display_id}${l.line_name ? ' / '+l.line_name : ''}` })),
          params.lineId || ''), true)}
        <div class="form-row-2">
          ${UI.field('ステージ', UI.select('stage', [
            { code:'T0', label:'T0' }, { code:'T1', label:'T1' },
            { code:'T2A', label:'T2①' }, { code:'T2B', label:'T2②' }, { code:'T3', label:'T3' },
          ], 'T0'), true)}
          ${UI.field('頭数', UI.input('count', 'number', '5', '頭数'))}
        </div>
        <div class="form-row-2">
          ${UI.field('孵化日', UI.input('hatch_date', 'date', ''))}
          ${UI.field('容器', UI.select('container_size', [
            {code:'',    label:'— 未選択 —'},
            {code:'1.8L', label:'1.8L'},
            {code:'2.7L', label:'2.7L'},
            {code:'4.8L', label:'4.8L'},
          ], '1.8L'))}
        </div>
        ${UI.field('マット種別', UI.select('mat_type',
          MAT_TYPES.map(m => ({code:m.code, label:m.label})), 'T0'))}
        ${UI.field('モルト', `<label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="has_malt"> モルト入り
        </label>`)}
        ${UI.field('メモ', UI.input('note', 'text', '', '任意のメモ'))}
        <div style="display:flex;gap:10px;margin-top:4px">
          <button type="button" class="btn btn-ghost" style="flex:1" onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2" onclick="Pages._lotSave()">登録</button>
        </div>
      </form>
    </div>`;
};

Pages._lotSave = async function () {
  const form = document.getElementById('lot-form');
  const data = UI.collectForm(form);
  if (!data.line_id) { UI.toast('ラインを選択してください', 'error'); return; }
  if (data.hatch_date) data.hatch_date = data.hatch_date.replace(/-/g, '/');
  data.count = +data.count || 1;
  try {
    const res = await apiCall(() => API.lot.create(data), 'ロットを登録しました');
    await syncAll(true);
    routeTo('lot-detail', { lotId: res.lot_id });
  } catch (e) {}
};

// ── クイックアクション ────────────────────────────────────────────
function _lotQuickActions(lotId) {
  UI.actionSheet([
    { label: '✏️ ロット情報を修正', fn: () => Pages._lotEdit(lotId) },
    { label: '📋 成長記録を追加', fn: () => routeTo('growth-rec', { targetType: 'LOT', targetId: lotId }) },
    { label: '🏷️ ラベル発行', fn: () => routeTo('label-gen', { targetType: 'LOT', targetId: lotId }) },
    { label: '⚖️ 体重測定（QRスキャン）', fn: () => routeTo('qr-scan', { mode: 'weight' }) },
  ]);
}

// ── ロット情報編集 ────────────────────────────────────────────────
Pages._lotEdit = function (lotId) {
  const lot = Store.getLot(lotId);
  if (!lot) { UI.toast('ロットが見つかりません', 'error'); return; }
  UI.modal(`
    <div class="modal-title">ロット情報を修正</div>
    <div class="form-section" style="max-height:65vh;overflow-y:auto">
      <div class="form-row-2">
        ${UI.field('孵化日', `<input type="date" id="le-hatch" class="input" value="${(lot.hatch_date||'').replace(/\//g,'-')}">`)
        }
        ${UI.field('頭数', `<input type="number" id="le-count" class="input" value="${lot.count||''}" min="1">`)}
      </div>
      <div class="form-row-2">
        ${UI.field('容器', `<select id="le-container" class="input">
          ${['','1.8L','2.7L','4.8L'].map(s=>`<option value="${s}" ${lot.container_size===s?'selected':''}>${s||'— 未選択 —'}</option>`).join('')}
        </select>`)}
        ${UI.field('マット', `<select id="le-mat" class="input">
          ${[{code:'',label:'— 未選択 —'},...MAT_TYPES].map(m=>`<option value="${m.code}" ${lot.mat_type===m.code?'selected':''}>${m.label}</option>`).join('')}
        </select>`)}
      </div>
      ${UI.field('メモ', `<input type="text" id="le-note" class="input" value="${lot.note||''}" placeholder="任意のメモ">`)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._lotEditSave('${lotId}')">更新</button>
    </div>
  `);
};

Pages._lotEditSave = async function (lotId) {
  const hatch     = document.getElementById('le-hatch')?.value?.replace(/-/g,'/') || '';
  const count     = parseInt(document.getElementById('le-count')?.value || '0');
  const container = document.getElementById('le-container')?.value || '';
  const mat       = document.getElementById('le-mat')?.value || '';
  const note      = document.getElementById('le-note')?.value || '';
  try {
    UI.loading(true);
    UI.closeModal();
    await API.lot.update({ lot_id: lotId, hatch_date: hatch, count, container_size: container, mat_type: mat, note });
    await syncAll(true);
    UI.toast('ロット情報を更新しました');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('更新失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// 孵化日設定
Pages._lotSetHatchDate = function (lotId) {
  UI.modal(`
    <div class="modal-title">📅 孵化日を設定</div>
    <div class="form-section">
      ${UI.field('孵化日', `<input type="date" id="lot-hatch-inp" class="input" value="${new Date().toISOString().split('T')[0]}">`)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._lotHatchSave('${lotId}')">設定</button>
    </div>
  `);
};

Pages._lotHatchSave = async function (lotId) {
  const val = document.getElementById('lot-hatch-inp')?.value;
  if (!val) { UI.toast('日付を選択してください'); return; }
  const date = val.replace(/-/g, '/');
  try {
    UI.loading(true);
    UI.closeModal();
    await API.lot.update({ lot_id: lotId, hatch_date: date });
    await syncAll(true);
    UI.toast('孵化日を設定しました');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('設定失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ヘルパー
function _infoRow(key, val) {
  return `<div class="info-row">
    <span class="info-key">${key}</span>
    <span class="info-val">${val}</span>
  </div>`;
}

// ════════════════════════════════════════════════════════════════
// 一括ロット化
// ════════════════════════════════════════════════════════════════
Pages.lotBulk = function (params = {}) {
  const main    = document.getElementById('main');
  const lineId  = params.lineId || params.line_id || '';
  const line    = lineId ? Store.getLine(lineId) : null;
  const lines   = Store.getDB('lines') || [];

  // 未ロット卵の算出（manage.js と同じ式）
  function _calcUnLotEggs(lid) {
    if (!lid) return null;
    const allPairings = Store.getDB('pairings') || [];
    const pairings = allPairings.filter(p => p.line_id === lid);
    const eggRecords = Store.getDB('egg_records') || [];
    const lineEggRecs = eggRecords.filter(r => pairings.some(p => p.set_id === r.set_id));
    const totalEggs = lineEggRecs.length > 0
      ? lineEggRecs.reduce((s, r) => s + (parseInt(r.egg_count, 10) || 0), 0)
      : pairings.reduce((s, p) => s + (parseInt(p.total_eggs, 10) || 0), 0);
    const rottenEggs = lineEggRecs.reduce((s, r) => s + (parseInt(r.failed_count, 10) || 0), 0);
    const allLots = Store.filterLots({ line_id: lid, status: 'all' });
    const rootLots = allLots.filter(l => !l.parent_lot_id || l.parent_lot_id === '');
    const lotInitTotal = rootLots.reduce((s, l) => s + (parseInt(l.initial_count, 10) || 0), 0);
    const allInds = Store.getIndividualsByLine(lid);
    const directInds = allInds.filter(i => !i.lot_id || i.lot_id === '');
    return Math.max(0, totalEggs - rottenEggs - lotInitTotal - directInds.length);
  }

  const unLotEggs = _calcUnLotEggs(lineId);
  const lineCode  = line ? (line.line_code || line.display_id) : '';

  // 状態
  let rows = [{ count: '', container_size: '1.8L', mat_type: 'T0', note: '' }];
  let selectedLineId  = lineId;
  let selectedStage   = 'T0';
  let selectedHatch   = '';
  let defaultContainer = '1.8L';
  let defaultMat       = 'T0';

  function totalCount() {
    return rows.reduce((s, r) => s + (parseInt(r.count, 10) || 0), 0);
  }

  function renderSummary() {
    const total  = totalCount();
    const remain = unLotEggs !== null ? unLotEggs - total : null;
    const el = document.getElementById('bulk-summary');
    if (!el) return;
    const overCls = remain !== null && remain < 0 ? 'color:var(--red);font-weight:700' : 'color:var(--green)';
    el.innerHTML = `
      <div style="text-align:center">
        <div class="bulk-summary-val" style="color:var(--blue)">${total}</div>
        <div class="bulk-summary-label">入力合計</div>
      </div>
      <div style="text-align:center">
        <div class="bulk-summary-val" style="${overCls}">${remain !== null ? remain : '—'}</div>
        <div class="bulk-summary-label">残り未ロット卵</div>
      </div>
      <div style="text-align:center">
        <div class="bulk-summary-val">${rows.length}</div>
        <div class="bulk-summary-label">ロット数</div>
      </div>`;
  }

  function rowHtml(i, row) {
    return `<div class="bulk-row" id="bulk-row-${i}">
      <div class="bulk-row-header">
        <span class="bulk-row-num">${i + 1}</span>
        <span style="font-size:.82rem;color:var(--text2);flex:1">ロット ${i + 1}</span>
        ${i > 0 ? `<button style="font-size:.75rem;color:var(--red);background:none;border:none;cursor:pointer;padding:2px 6px"
          onclick="Pages._blkRemoveRow(${i})">✕</button>` : ''}
      </div>
      <div class="form-row-2">
        ${UI.field('頭数 *', `<input type="number" id="blk-count-${i}" class="input" min="1" value="${row.count}"
          placeholder="例: 5" oninput="Pages._blkCalc(${i})">`)}
        ${UI.field('容器', `<select id="blk-container-${i}" class="input">
          <option value="1.8L" ${row.container_size==='1.8L'?'selected':''}>1.8L</option>
          <option value="2.7L" ${row.container_size==='2.7L'?'selected':''}>2.7L</option>
          <option value="4.8L" ${row.container_size==='4.8L'?'selected':''}>4.8L</option>
        </select>`)}
      </div>
      <div class="form-row-2">
        ${UI.field('マット', `<select id="blk-mat-${i}" class="input">
          ${MAT_TYPES.map(m => `<option value="${m.code}" ${row.mat_type===m.code?'selected':''}>${m.label}</option>`).join('')}
        </select>`)}
        ${UI.field('メモ', `<input type="text" id="blk-note-${i}" class="input" value="${row.note}" placeholder="任意">`)}
      </div>
    </div>`;
  }

  function renderRows() {
    const el = document.getElementById('bulk-rows');
    if (el) el.innerHTML = rows.map((r, i) => rowHtml(i, r)).join('');
    renderSummary();
  }

  main.innerHTML = `
    ${UI.header('📦 一括ロット化', { back: true })}
    <div class="page-body">

      <!-- 共通設定 -->
      <div class="form-section">
        <div class="form-title">共通設定</div>
        ${UI.field('ライン *', `<select id="blk-line" class="input" onchange="Pages._blkLineChange()">
          <option value="">— 選択 —</option>
          ${lines.map(l => `<option value="${l.line_id}" ${l.line_id===selectedLineId?'selected':''}>${l.line_code||l.display_id}${l.line_name?' / '+l.line_name:''}</option>`).join('')}
        </select>`, true)}
        <div class="form-row-2">
          ${UI.field('ステージ', `<select id="blk-stage" class="input">
            <option value="T0" ${'T0'===selectedStage?'selected':''}>T0</option>
            <option value="T1" ${'T1'===selectedStage?'selected':''}>T1</option>
            <option value="T2A" ${'T2A'===selectedStage?'selected':''}>T2①</option>
            <option value="T2B" ${'T2B'===selectedStage?'selected':''}>T2②</option>
            <option value="T3" ${'T3'===selectedStage?'selected':''}>T3</option>
          </select>`, true)}
          ${UI.field('孵化日', `<input type="date" id="blk-hatch" class="input" value="${selectedHatch}">`)}
        </div>
      </div>

      <!-- 進捗サマリー -->
      <div class="bulk-summary-bar" id="bulk-summary"></div>

      <!-- ロット行リスト -->
      <div id="bulk-rows"></div>

      <!-- 行追加 -->
      <button class="btn btn-ghost" style="width:100%;margin-bottom:12px"
        onclick="Pages._blkAddRow()">＋ ロットを追加</button>

      <!-- 一括作成ボタン -->
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" onclick="Store.back()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" id="blk-save-btn"
          onclick="Pages._blkSave()">📦 まとめて作成</button>
      </div>

    </div>`;

  renderRows();
};

// 行追加
Pages._blkAddRow = function () {
  const cont = document.getElementById('blk-container-0')?.value || '1.8L';
  const mat  = document.getElementById('blk-mat-0')?.value || 'T0';
  Pages._blkSyncRows();
  const newRows = window.__blkRows || [];
  newRows.push({ count: '', container_size: cont, mat_type: mat, note: '' });
  window.__blkRows = newRows;
  _blkRenderFromState();
};

// 行削除
Pages._blkRemoveRow = function (idx) {
  Pages._blkSyncRows();
  const rows = window.__blkRows || [];
  rows.splice(idx, 1);
  window.__blkRows = rows;
  _blkRenderFromState();
};

// 行数変更時の再レンダリング（DOM から現在値を取得して再描画）
Pages._blkSyncRows = function () {
  const rows = [];
  let i = 0;
  while (document.getElementById('blk-count-' + i)) {
    rows.push({
      count:          document.getElementById('blk-count-' + i)?.value     || '',
      container_size: document.getElementById('blk-container-' + i)?.value || '1.8L',
      mat_type:       document.getElementById('blk-mat-' + i)?.value       || 'T0',
      note:           document.getElementById('blk-note-' + i)?.value      || '',
    });
    i++;
  }
  window.__blkRows = rows;
};

function _blkRenderFromState() {
  const rows = window.__blkRows || [];
  const el = document.getElementById('bulk-rows');
  if (!el) return;

  // 未ロット卵の再計算
  const lineId = document.getElementById('blk-line')?.value || '';
  function _calcUnLotEggs2(lid) {
    if (!lid) return null;
    const allPairings = Store.getDB('pairings') || [];
    const pairings = allPairings.filter(p => p.line_id === lid);
    const eggRecords = Store.getDB('egg_records') || [];
    const lineEggRecs = eggRecords.filter(r => pairings.some(p => p.set_id === r.set_id));
    const totalEggs = lineEggRecs.length > 0
      ? lineEggRecs.reduce((s, r) => s + (parseInt(r.egg_count, 10) || 0), 0)
      : pairings.reduce((s, p) => s + (parseInt(p.total_eggs, 10) || 0), 0);
    const rottenEggs = lineEggRecs.reduce((s, r) => s + (parseInt(r.failed_count, 10) || 0), 0);
    const allLots = Store.filterLots({ line_id: lid, status: 'all' });
    const rootLots = allLots.filter(l => !l.parent_lot_id || l.parent_lot_id === '');
    const lotInitTotal = rootLots.reduce((s, l) => s + (parseInt(l.initial_count, 10) || 0), 0);
    const allInds = Store.getIndividualsByLine(lid);
    const directInds = allInds.filter(i => !i.lot_id || i.lot_id === '');
    return Math.max(0, totalEggs - rottenEggs - lotInitTotal - directInds.length);
  }
  const unLotEggs = _calcUnLotEggs2(lineId);

  function rowHtml2(i, row) {
    return `<div class="bulk-row" id="bulk-row-${i}">
      <div class="bulk-row-header">
        <span class="bulk-row-num">${i + 1}</span>
        <span style="font-size:.82rem;color:var(--text2);flex:1">ロット ${i + 1}</span>
        ${i > 0 ? `<button style="font-size:.75rem;color:var(--red);background:none;border:none;cursor:pointer;padding:2px 6px"
          onclick="Pages._blkRemoveRow(${i})">✕</button>` : ''}
      </div>
      <div class="form-row-2">
        ${UI.field('頭数 *', `<input type="number" id="blk-count-${i}" class="input" min="1" value="${row.count}"
          placeholder="例: 5" oninput="Pages._blkCalc(${i})">`)}
        ${UI.field('容器', `<select id="blk-container-${i}" class="input">
          <option value="1.8L" ${row.container_size==='1.8L'?'selected':''}>1.8L</option>
          <option value="2.7L" ${row.container_size==='2.7L'?'selected':''}>2.7L</option>
          <option value="4.8L" ${row.container_size==='4.8L'?'selected':''}>4.8L</option>
        </select>`)}
      </div>
      <div class="form-row-2">
        ${UI.field('マット', `<select id="blk-mat-${i}" class="input">
          ${MAT_TYPES.map(m => `<option value="${m.code}" ${row.mat_type===m.code?'selected':''}>${m.label}</option>`).join('')}
        </select>`)}
        ${UI.field('メモ', `<input type="text" id="blk-note-${i}" class="input" value="${row.note}" placeholder="任意">`)}
      </div>
    </div>`;
  }

  el.innerHTML = rows.map((r, i) => rowHtml2(i, r)).join('');

  // サマリー更新
  const total  = rows.reduce((s, r) => s + (parseInt(r.count, 10) || 0), 0);
  const remain = unLotEggs !== null ? unLotEggs - total : null;
  const sumEl  = document.getElementById('bulk-summary');
  if (sumEl) {
    const overCls = remain !== null && remain < 0 ? 'color:var(--red);font-weight:700' : 'color:var(--green)';
    sumEl.innerHTML = `
      <div style="text-align:center">
        <div class="bulk-summary-val" style="color:var(--blue)">${total}</div>
        <div class="bulk-summary-label">入力合計</div>
      </div>
      <div style="text-align:center">
        <div class="bulk-summary-val" style="${overCls}">${remain !== null ? remain : '—'}</div>
        <div class="bulk-summary-label">残り未ロット卵</div>
      </div>
      <div style="text-align:center">
        <div class="bulk-summary-val">${rows.length}</div>
        <div class="bulk-summary-label">ロット数</div>
      </div>`;
  }
}

// 入力変更時のサマリー更新
Pages._blkCalc = function () {
  Pages._blkSyncRows();
  _blkRenderFromState();
};

// ライン変更時
Pages._blkLineChange = function () {
  Pages._blkSyncRows();
  _blkRenderFromState();
};

// 一括保存
Pages._blkSave = async function () {
  const lineId = document.getElementById('blk-line')?.value;
  const stage  = document.getElementById('blk-stage')?.value || 'T0';
  const hatch  = (document.getElementById('blk-hatch')?.value || '').replace(/-/g, '/');
  if (!lineId) { UI.toast('ラインを選択してください', 'error'); return; }

  Pages._blkSyncRows();
  const rows = (window.__blkRows || []).filter(r => parseInt(r.count, 10) > 0);
  if (rows.length === 0) { UI.toast('頭数を入力してください', 'error'); return; }

  const btn = document.getElementById('blk-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 作成中...'; }

  try {
    const res = await apiCall(() => API.lot.createBulk({
      line_id:    lineId,
      stage,
      hatch_date: hatch,
      lots:       rows.map(r => ({
        count:          parseInt(r.count, 10),
        container_size: r.container_size,
        mat_type:       r.mat_type,
        note:           r.note,
      })),
    }), null);

    const created = res.created || [];
    await syncAll(true);

    // 完了画面
    const main = document.getElementById('main');
    main.innerHTML = `
      ${UI.header('一括ロット化 完了', { back: true })}
      <div class="page-body">
        <div style="background:rgba(45,122,82,.1);border:1px solid rgba(45,122,82,.35);
          border-radius:var(--radius);padding:20px 16px;text-align:center;margin-bottom:16px">
          <div style="font-size:2rem;margin-bottom:8px">✅</div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--green)">${created.length}ロットを作成しました</div>
          <div style="font-size:.8rem;color:var(--text3);margin-top:6px">
            合計 ${created.reduce((s,l)=>s+(l.count||0),0)} 頭
          </div>
        </div>

        <!-- 作成したロット一覧 -->
        <div class="card">
          <div class="card-title">作成されたロット</div>
          ${created.map(l => `
            <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)">
              <span style="font-family:var(--font-mono);font-size:.9rem;color:var(--gold)">${l.display_id}</span>
              <span style="color:var(--text2)">${l.count}頭</span>
            </div>`).join('')}
        </div>

        <!-- アクション -->
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="btn btn-ghost" style="flex:1"
            onclick="routeTo('lot-list',{line_id:'${lineId}'})">ロット一覧へ</button>
          <button class="btn btn-primary" style="flex:1"
            onclick="Pages._blkQrBatch(${JSON.stringify(created).replace(/"/g,'&quot;')})">🏷 QR一括発行</button>
        </div>
      </div>`;

  } catch (e) {
    UI.toast('作成失敗: ' + (e.message || '不明なエラー'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '📦 まとめて作成'; }
  }
};

// QR一括発行（作成済みロットの QR を連続生成して印刷画面へ）
Pages._blkQrBatch = function (createdLots) {
  if (!createdLots || !createdLots.length) { UI.toast('ロット情報がありません', 'error'); return; }
  // ロットIDリストを保存して label-gen へ遷移
  window.__blkCreatedLots = createdLots;
  const main = document.getElementById('main');
  main.innerHTML = `
    ${UI.header('QR一括発行', { back: true })}
    <div class="page-body">
      <div class="card">
        <div class="card-title">🏷 作成ロットのQRコード</div>
        <div id="qr-batch-list" style="display:flex;flex-wrap:wrap;gap:12px;padding:8px 0"></div>
        <div style="font-size:.75rem;color:var(--text3);margin-top:8px">
          ※ 各QRをタップしてラベル生成・印刷できます
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('lot-list')">ロット一覧へ</button>
        <button class="btn btn-primary" style="flex:1"
          onclick="window.print()">🖨 印刷</button>
      </div>
    </div>`;

  // QR一括描画
  const container = document.getElementById('qr-batch-list');
  if (!container) return;
  createdLots.forEach(lot => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'text-align:center;cursor:pointer;padding:8px';
    wrapper.onclick = () => routeTo('label-gen', { targetType: 'LOT', targetId: lot.lot_id });
    wrapper.innerHTML = `
      <div id="qr-${lot.lot_id}" style="display:inline-block"></div>
      <div style="font-family:monospace;font-size:.72rem;color:var(--gold);margin-top:4px">${lot.display_id}</div>
      <div style="font-size:.65rem;color:var(--text3)">${lot.count}頭</div>`;
    container.appendChild(wrapper);

    // QRコード生成
    setTimeout(() => {
      try {
        new QRCode(document.getElementById('qr-' + lot.lot_id), {
          text: 'LOT:' + lot.lot_id,
          width: 80, height: 80,
          colorDark: '#000', colorLight: '#fff',
          correctLevel: QRCode.CorrectLevel.M,
        });
      } catch (e) {}
    }, 100);
  });
};

window.PAGES = window.PAGES || {};
window.PAGES['lot-list']   = () => Pages.lotList();
window.PAGES['lot-detail'] = () => Pages.lotDetail(Store.getParams().lotId || Store.getParams().id);
window.PAGES['lot-new']    = () => Pages.lotNew(Store.getParams());
window.PAGES['lot-bulk']   = () => Pages.lotBulk(Store.getParams());
