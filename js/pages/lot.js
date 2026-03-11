// ════════════════════════════════════════════════════════════════
// lot.js
// 役割: ロットの一覧・詳細・分割・個体化を担う。
//       T0〜T3のロット管理はこの画面が起点。
//       「今すぐ個体化」「ロット分割」を3タップ以内で実行できるUIを優先。
// ════════════════════════════════════════════════════════════════

'use strict';

// ════════════════════════════════════════════════════════════════
// ロット一覧
// ════════════════════════════════════════════════════════════════
Pages.lotList = function () {
  const main = document.getElementById('main');
  let filters = { status: 'active', stage: '', line_id: '' };

  function render() {
    const lots  = Store.filterLots(filters);
    const lines = Store.getDB('lines') || [];

    main.innerHTML = `
      ${UI.header('ロット一覧', { action: { fn: "routeTo('lot-new')", icon: '＋' } })}
      <div class="page-body">
        <div class="filter-bar" id="lot-stage-filter">
          ${_lotStageFilters(filters.stage)}
        </div>
        <div class="filter-bar" id="lot-line-filter">
          <button class="pill ${!filters.line_id ? 'active' : ''}" data-val="">ライン全て</button>
          ${lines.slice(0,8).map(l =>
            `<button class="pill ${l.line_id === filters.line_id ? 'active' : ''}" data-val="${l.line_id}">${l.display_id}</button>`
          ).join('')}
        </div>
        <div class="sec-hdr">
          <span class="sec-title">${lots.length}ロット</span>
          <span class="sec-more" onclick="Pages._lotShowDissolved()">分割済も表示</span>
        </div>
        <div id="lot-list-body">
          ${lots.length ? lots.map(_lotCardHTML).join('') : UI.empty('ロットがありません', 'ラインから産卵セット経由で登録できます')}
        </div>
      </div>`;

    document.getElementById('lot-stage-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      filters.stage = p.dataset.val === filters.stage ? '' : p.dataset.val;
      render();
    });
    document.getElementById('lot-line-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      filters.line_id = p.dataset.val === filters.line_id ? '' : p.dataset.val;
      render();
    });
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

function _lotCardHTML(lot) {
  const age  = lot._age || Store.calcAge(lot.hatch_date);
  const line = Store.getLine(lot.line_id);
  const maltIcon = String(lot.has_malt) === 'true' ? ' 🍄' : '';
  const stageLabel2 = lot.stage === 'T2A' ? 'T2①(モルト入り)' : lot.stage === 'T2B' ? 'T2②(純T2)' : stageLabel(lot.stage);

  return `<div class="ind-card" onclick="routeTo('lot-detail',{id:'${lot.lot_id}'})">
    <div style="min-width:42px;text-align:center">
      <div style="font-size:1.4rem">🥚</div>
      <div style="font-size:.7rem;color:var(--text3);margin-top:2px">${lot.count}頭</div>
    </div>
    <div class="ind-card-body">
      <div class="ind-card-row">
        <span class="ind-card-id">${lot.display_id}</span>
        <span class="badge" style="background:${stageColor(lot.stage)}22;color:${stageColor(lot.stage)};border:1px solid ${stageColor(lot.stage)}55">
          ${stageLabel2}${maltIcon}
        </span>
      </div>
      <div class="ind-card-row" style="font-size:.78rem;color:var(--text2)">
        ${line ? `ライン: ${line.display_id}` : ''}
        ${lot.container_size ? ' / ' + lot.container_size : ''}
      </div>
      <div class="ind-card-age">
        ${age ? age.days + ' / ' + age.stageGuess : '日齢不明'}
        ${lot.mat_changed_at ? ' / 交換: ' + lot.mat_changed_at : ''}
      </div>
    </div>
    <div style="color:var(--text3);font-size:1.2rem">›</div>
  </div>`;
}

Pages._lotShowDissolved = function () {
  UI.toast('分割済みロット表示（実装中）', 'info');
};

// ════════════════════════════════════════════════════════════════
// ロット詳細
// ════════════════════════════════════════════════════════════════
Pages.lotDetail = async function (lotId) {
  const main = document.getElementById('main');
  if (!lotId) { main.innerHTML = UI.empty('IDが指定されていません'); return; }

  let lot = Store.getLot(lotId);
  if (lot) _renderLotDetail(lot, main);
  else main.innerHTML = UI.header('ロット詳細', {}) + UI.spinner();

  try {
    const res = await API.lot.get(lotId);
    lot = res.lot;
    _renderLotDetail(lot, main);
  } catch (e) {
    if (!lot) main.innerHTML = UI.header('エラー', {}) +
      `<div class="page-body">${UI.empty('取得失敗: ' + e.message)}</div>`;
  }
};

function _renderLotDetail(lot, main) {
  const age   = Store.calcAge(lot.hatch_date);
  const line  = Store.getLine(lot.line_id);
  const records = lot._growthRecords || Store.getGrowthRecords(lot.lot_id) || [];
  const maltText = String(lot.has_malt) === 'true' ? 'あり 🍄' : 'なし';

  // T2①/T2②の詳細表示
  let stageNote = '';
  if (lot.stage === 'T2A') stageNote = '<span style="color:var(--amber);font-size:.75rem"> T2①（モルト入り）</span>';
  if (lot.stage === 'T2B') stageNote = '<span style="color:var(--blue);font-size:.75rem"> T2②（純T2）</span>';

  main.innerHTML = `
    ${UI.header(lot.display_id, {
      action: { fn: `_lotQuickActions('${lot.lot_id}')`, icon: '…' }
    })}
    <div class="page-body">

      <!-- ヘッダーカード -->
      <div class="card card-gold">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span style="font-size:2rem">🥚</span>
          <div>
            <div style="font-family:var(--font-mono);color:var(--gold);font-size:.85rem">${lot.display_id}</div>
            <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">
              ${UI.stageBadge(lot.stage)}${stageNote}
              <span class="badge" style="background:var(--surface2);color:var(--text2)">
                ${lot.count}頭 / 初期${lot.initial_count}頭
              </span>
            </div>
          </div>
        </div>
        ${age ? `<div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px">
          <div style="font-size:.7rem;color:var(--text3);margin-bottom:6px">📅 現在の日齢</div>
          ${UI.ageFull(lot.hatch_date)}
        </div>` : '<div style="color:var(--amber);font-size:.8rem">⚠️ 孵化日未設定</div>'}
      </div>

      <!-- アクションボタン（3タップ優先） -->
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1"
          onclick="routeTo('growth-rec',{targetType:'LOT',targetId:'${lot.lot_id}',displayId:'${lot.display_id}'})">
          📷 記録
        </button>
        <button class="btn btn-gold" style="flex:1"
          onclick="Pages._showIndividualizeModal('${lot.lot_id}',${lot.count})">
          個体化
        </button>
        <button class="btn btn-ghost" style="flex:1"
          onclick="Pages._showSplitModal('${lot.lot_id}',${lot.count})">
          分割
        </button>
      </div>

      <!-- 基本情報 -->
      <div class="card">
        <div class="card-title">ロット情報</div>
        <div class="info-list">
          ${_infoRow('ライン', line ? `<span onclick="routeTo('line-detail',{id:'${line.line_id}'})" style="color:var(--blue);cursor:pointer">${line.display_id}</span>` : lot.line_id)}
          ${_infoRow('容器',       lot.container_size   || '—')}
          ${_infoRow('マット',     lot.mat_type         || '—')}
          ${_infoRow('モルト',     maltText)}
          ${_infoRow('孵化日',     lot.hatch_date       || '未設定')}
          ${_infoRow('最終交換',   lot.mat_changed_at   || '—')}
          ${lot.parent_lot_id ? _infoRow('分割元', `<span style="color:var(--blue);cursor:pointer" onclick="routeTo('lot-detail',{id:'${lot.parent_lot_id}'})">${lot.parent_lot_id}</span>`) : ''}
          ${lot.note ? _infoRow('メモ', lot.note) : ''}
        </div>
      </div>

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
// ロット分割モーダル
// ════════════════════════════════════════════════════════════════
Pages._showSplitModal = function (lotId, totalCount) {
  _showModal('ロット分割', `
    <div class="form-section">
      <p style="font-size:.85rem;color:var(--text2);margin-bottom:4px">
        ${totalCount}頭を分割します。<br>各ロットの頭数を入力してください（合計≦${totalCount}頭）
      </p>
      <div id="split-rows">
        ${_splitRow('A', Math.floor(totalCount/2))}
        ${_splitRow('B', totalCount - Math.floor(totalCount/2))}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="Pages._addSplitRow()">＋ ロット追加</button>
      <div id="split-total" style="font-size:.82rem;color:var(--text3);margin-top:4px"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" onclick="Pages._execSplit('${lotId}',${totalCount})">
          分割実行
        </button>
      </div>
    </div>`);
  _updateSplitTotal(totalCount);
};

function _splitRow(suffix, count) {
  return `<div class="split-row" style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
    <span style="font-family:var(--font-mono);color:var(--gold);min-width:28px">-${suffix}</span>
    <input type="number" class="input split-count" min="1" value="${count}" style="flex:1"
      oninput="Pages._updateSplitTotal2()">
    <span style="font-size:.8rem;color:var(--text3)">頭</span>
  </div>`;
}

Pages._addSplitRow = function () {
  const rows   = document.getElementById('split-rows');
  const suffix = String.fromCharCode(65 + rows.querySelectorAll('.split-row').length);
  rows.insertAdjacentHTML('beforeend', _splitRow(suffix, 1));
};

Pages._updateSplitTotal2 = function () {
  const inputs = document.querySelectorAll('.split-count');
  const total  = Array.from(inputs).reduce((s, i) => s + (+i.value || 0), 0);
  const el = document.getElementById('split-total');
  if (el) el.textContent = `合計: ${total}頭`;
};

function _updateSplitTotal(max) {
  const inputs = document.querySelectorAll('.split-count');
  const total  = Array.from(inputs).reduce((s, i) => s + (+i.value || 0), 0);
  const el = document.getElementById('split-total');
  if (el) el.textContent = `合計: ${total}頭 / 最大${max}頭`;
}

Pages._execSplit = async function (lotId, maxCount) {
  const inputs  = document.querySelectorAll('.split-count');
  const counts  = Array.from(inputs).map(i => +i.value || 0).filter(n => n > 0);
  const total   = counts.reduce((s, n) => s + n, 0);
  if (!counts.length) { UI.toast('分割数を入力してください', 'error'); return; }
  if (total > maxCount) { UI.toast(`合計(${total})が元ロット頭数(${maxCount})を超えています`, 'error'); return; }
  if (!UI.confirm(`${counts.join('頭 / ')}頭 に分割します。よろしいですか？`)) return;

  _closeModal();
  try {
    const res = await apiCall(
      () => API.lot.split({ lot_id: lotId, split_counts: counts }),
      `${counts.length}ロットに分割しました`
    );
    await syncAll(true);
    routeTo('lot-list');
  } catch (e) {}
};

// ════════════════════════════════════════════════════════════════
// ロット→個体化モーダル
// ════════════════════════════════════════════════════════════════
Pages._showIndividualizeModal = function (lotId, totalCount) {
  _showModal('個体化', `
    <div class="form-section">
      <p style="font-size:.85rem;color:var(--text2)">
        ロットから個体を取り出して管理します。<br>現在: ${totalCount}頭
      </p>
      ${UI.field('個体化する頭数', `<input type="number" id="ind-count" class="input" min="1" max="${totalCount}" value="1">`)}
      ${UI.field('ステージ', UI.select('ind-stage', [
        { code:'T1',  label:'T1' },
        { code:'T2A', label:'T2①（モルト入り）' },
        { code:'T2B', label:'T2②（純T2）' },
        { code:'T3',  label:'T3' },
      ], 'T1'))}
      ${UI.field('容器サイズ', UI.select('ind-container',
        CONTAINER_SIZES.map(s => ({ code:s, label:s })), '4.8L（個別）'))}
      ${UI.field('性別（任意）', UI.select('ind-sex', [
        { code:'', label:'未判定' },
        { code:'♂', label:'♂' },
        { code:'♀', label:'♀' },
      ], ''))}
      ${UI.field('メモ', `<input type="text" id="ind-note" class="input" placeholder="任意のメモ">`)}
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-gold" style="flex:2" onclick="Pages._execIndividualize('${lotId}')">
          個体化実行
        </button>
      </div>
    </div>`);
};

Pages._execIndividualize = async function (lotId) {
  const count     = +document.getElementById('ind-count').value || 0;
  const stage     = document.querySelector('[name="ind-stage"]')?.value || document.getElementById('ind-stage')?.value || 'T1';
  const container = document.querySelector('[name="ind-container"]')?.value || '';
  const sex       = document.querySelector('[name="ind-sex"]')?.value || '';
  const note      = document.getElementById('ind-note')?.value || '';

  if (!count || count < 1) { UI.toast('頭数を入力してください', 'error'); return; }

  _closeModal();
  try {
    const res = await apiCall(
      () => API.lot.individualize({ lot_id: lotId, count, stage, container_size: container, sex, note }),
      `${count}頭を個体化しました`
    );
    await syncAll(true);
    // 最初の個体詳細へ移動
    if (res.individuals && res.individuals.length === 1) {
      routeTo('ind-detail', { id: res.individuals[0].ind_id });
    } else {
      routeTo('ind-list');
    }
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

// ロット新規登録（簡易）
Pages.lotNew = function (params = {}) {
  const main  = document.getElementById('main');
  const lines = Store.getDB('lines') || [];

  main.innerHTML = `
    ${UI.header('ロット登録', {})}
    <div class="page-body">
      <form id="lot-form" class="form-section">
        ${UI.field('ライン', UI.select('line_id',
          lines.map(l => ({ code: l.line_id, label: `${l.display_id}${l.line_name ? ' / '+l.line_name : ''}` })),
          params.lineId || ''), true)}
        <div class="form-row-2">
          ${UI.field('ステージ', UI.select('stage', [
            { code:'EGG', label:'卵' }, { code:'T0', label:'T0' }, { code:'T1', label:'T1' },
            { code:'T2A', label:'T2①' }, { code:'T2B', label:'T2②' }, { code:'T3', label:'T3' },
          ], 'T0'), true)}
          ${UI.field('頭数', UI.input('count', 'number', '10', '頭数'))}
        </div>
        <div class="form-row-2">
          ${UI.field('孵化日', UI.input('hatch_date', 'date', ''))}
          ${UI.field('容器', UI.select('container_size',
            CONTAINER_SIZES.map(s => ({code:s,label:s})), '2.7L（2頭）'))}
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
    routeTo('lot-detail', { id: res.lot_id });
  } catch (e) {}
};

// ページ登録
Pages.lotNew = Pages.lotNew;
PAGES['lot-list']   = () => Pages.lotList();

// ── ロット詳細クイックアクション ─────────────────────────────────
function _lotQuickActions(lotId) {
  UI.actionSheet([
    { label: '⚖️ 体重測定（QRスキャン）', fn: () => routeTo('qr-scan', { mode: 'weight' }) },
    { label: '📷 QRスキャン（差分入力）', fn: () => routeTo('qr-scan') },
    { label: '🏷️ ラベル発行', fn: () => routeTo('label-gen', { targetType: 'LOT', targetId: lotId }) },
    { label: '📋 成長記録を追加', fn: () => routeTo('growth-rec', { target_type: 'LOT', target_id: lotId }) },
  ]);
}

PAGES['lot-detail'] = () => Pages.lotDetail(Store.getParams().id);
PAGES['lot-new']    = () => Pages.lotNew(Store.getParams());
