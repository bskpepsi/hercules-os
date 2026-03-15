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
  const main   = document.getElementById('main');
  const params = Store.getParams() || {};
  // ライン詳細から来た場合は固定フィルタ（ライン限定モード）
  const fixedLineId = params.line_id || '';
  const fixedLine   = fixedLineId ? Store.getLine(fixedLineId) : null;
  const isLineLimited = !!fixedLineId;

  let filters = { status: 'active', stage: '', line_id: fixedLineId };

  function render() {
    const lots  = Store.filterLots(filters);
    const lines = Store.getDB('lines') || [];
    const title = isLineLimited
      ? (fixedLine ? fixedLine.display_id + ' のロット' : 'ロット一覧')
      : 'ロット一覧';
    const headerOpts = isLineLimited
      ? { back: true, action: { fn: "routeTo('lot-new',{lineId:'" + fixedLineId + "'})", icon: '＋' } }
      : { action: { fn: "routeTo('lot-new')", icon: '＋' } };

    main.innerHTML = `
      ${UI.header(title, headerOpts)}
      <div class="page-body">
        <div class="filter-bar" id="lot-stage-filter">
          ${_lotStageFilters(filters.stage)}
        </div>
        ${!isLineLimited ? `<div class="filter-bar" id="lot-line-filter">
          <button class="pill ${!filters.line_id ? 'active' : ''}" data-val="">ライン全て</button>
          ${lines.slice(0,8).map(l =>
            '<button class="pill ' + (l.line_id === filters.line_id ? 'active' : '') + '" data-val="' + l.line_id + '">' + l.display_id + '</button>'
          ).join('')}
        </div>` : ''}
        <div class="sec-hdr">
          <span class="sec-title">${lots.length}ロット</span>
          <span class="sec-more" onclick="Pages._lotShowDissolved()">分割済も表示</span>
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

function _lotCardHTML(lot) {
  const age  = lot._age || Store.calcAge(lot.hatch_date);
  const line = Store.getLine(lot.line_id);
  const maltIcon = String(lot.has_malt) === 'true' ? ' 🍄' : '';
  const stageLabel2 = lot.stage === 'T2A' ? 'T2①(モルト入り)' : lot.stage === 'T2B' ? 'T2②(純T2)' : stageLabel(lot.stage);

  return `<div class="ind-card" onclick="routeTo('lot-detail',{lotId:'${lot.lot_id}'})">
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
  // params が object で渡された場合の防御
  if (lotId && typeof lotId === 'object') lotId = lotId.id || lotId.lotId || '';
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

  main.innerHTML = `
    ${UI.header(lot.display_id, {
      back: true,
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
              ${UI.stageBadge(lot.stage)}
              <span class="badge" style="background:var(--surface2);color:var(--text2)">${lot.count}頭</span>
            </div>
          </div>
        </div>
        ${age ? `<div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px">
          <div style="font-size:.7rem;color:var(--text3);margin-bottom:6px">📅 現在の日齢</div>
          ${UI.ageFull(lot.hatch_date)}
        </div>` : ''}
      </div>

      <!-- アクションボタン：同格2ボタン -->
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
      ${(lot.stage === 'T0' || lot.stage === 'T1') ? `
      <button style="width:100%;padding:12px;margin-top:4px;border-radius:var(--radius);
        font-weight:700;font-size:.9rem;background:var(--surface2);color:var(--text1);
        border:1px solid var(--border);cursor:pointer"
        onclick="routeTo('qr-scan-t1')">
        🔄 マット交換 連続モード
      </button>` : ''}

      <!-- 基本情報 -->
      <div class="card">
        <div class="card-title">ロット情報</div>
        <div class="info-list">
          ${_infoRow('ライン', line ? `<span onclick="routeTo('line-detail',{lineId:'${line.line_id}'})" style="color:var(--blue);cursor:pointer">${line.display_id}</span>` : lot.line_id)}
          ${_infoRow('容器',       lot.container_size   || '—')}
          ${_infoRow('マット',     lot.mat_type         || '—')}
          ${_infoRow('モルト',     maltText)}
          ${_infoRow('孵化日',     lot.hatch_date       || '未設定')}
          ${_infoRow('最終交換',   lot.mat_changed_at   || '—')}
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
// ロット分割 — カード形式詳細入力UI
// ════════════════════════════════════════════════════════════════

// 分割カードの状態
let _splitCards = [];
let _splitContext = {};

Pages._showSplitModal = function (lotId, totalCount, stage, lineId, hatchDate, displayId) {
  _splitContext = { lotId, totalCount: +totalCount, stage, lineId, hatchDate, displayId };

  // 初期2カード
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

    // 自動個体化された個体がある場合は通知
    if (res && res.auto_individuals && res.auto_individuals.length) {
      const names = res.auto_individuals.map(i => i.display_id).join(', ');
      UI.toast('自動個体化: ' + names, 'success');
    }

    // 分割後はロット一覧へ（ライン限定モード維持）
    const ctx = _splitContext;
    if (ctx.lineId) routeTo('lot-list', { line_id: ctx.lineId });
    else routeTo('lot-list');
  } catch (e) {}
};

// 個体化は分割時の1頭自動個体化で対応。単体モーダルは廃止。

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
    ${UI.header('ロット登録', { back: true })}
    <div class="page-body">
      <form id="lot-form" class="form-section">
        ${UI.field('ライン', UI.select('line_id',
          lines.map(l => ({ code: l.line_id, label: `${l.display_id}${l.line_name ? ' / '+l.line_name : ''}` })),
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
          ], '2.7L'))}
        </div>
        ${UI.field('マット種別', UI.select('mat_type',
          MAT_TYPES.map(m => ({code:m.code, label:m.label})), 'T0'))}
        ${UI.field('モルト', `<label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="has_malt"> モルト入り
        </label>`)}
        <!-- 産卵セット紐づけ・ロット化数は削除（ラインで管理） -->
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

// ページ登録
Pages.lotNew = Pages.lotNew;
window.PAGES = window.PAGES || {};
window.PAGES['lot-list']   = () => Pages.lotList();

// ── ロット詳細クイックアクション ─────────────────────────────────
function _lotQuickActions(lotId) {
  UI.actionSheet([
    { label: '✏️ ロット情報を修正', fn: () => Pages._lotEdit(lotId) },
    { label: '📋 成長記録を追加', fn: () => routeTo('growth-rec', { targetType: 'LOT', targetId: lotId }) },
    { label: '🏷️ ラベル発行', fn: () => routeTo('label-gen', { targetType: 'LOT', targetId: lotId }) },
    { label: '⚖️ 体重測定（QRスキャン）', fn: () => routeTo('qr-scan', { mode: 'weight' }) },
  ]);
}

// ── ロット情報編集モーダル ─────────────────────────────────────
Pages._lotEdit = function (lotId) {
  const lot = Store.getLot(lotId);
  if (!lot) { UI.toast('ロットが見つかりません', 'error'); return; }
  const today = new Date().toISOString().split('T')[0];
  UI.modal(`
    <div class="modal-title">ロット情報を修正</div>
    <div class="form-section" style="max-height:65vh;overflow-y:auto">
      <div class="form-row-2">
        ${UI.field('孵化日', `<input type="date" id="le-hatch" class="input" value="${(lot.hatch_date||'').replace(/\//g,'-')}">`)}
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

// ── 孵化日設定 ───────────────────────────────────────────────
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

window.PAGES['lot-detail'] = () => Pages.lotDetail(Store.getParams().lotId || Store.getParams().id);
window.PAGES['lot-new']    = () => Pages.lotNew(Store.getParams());
