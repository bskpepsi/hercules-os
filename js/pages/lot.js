// ════════════════════════════════════════════════════════════════
// lot.js — Phase4-1 UI統一版
// ロット一覧・詳細・分割・個体化を担う
// カードUIを3列（コード | 頭数+ステージ | ›）に統一
// ════════════════════════════════════════════════════════════════

'use strict';

// ────────────────────────────────────────────────────────────────
// _lotDisplayStageLabel — ステージコード（新旧問わず）→ 新6区分の表示ラベル
// ────────────────────────────────────────────────────────────────
function _lotDisplayStageLabel(code) {
  if (!code) return '—';
  var map = {
    L1L2:'L1L2', L3:'L3', PREPUPA:'前蛹', PUPA:'蛹',
    ADULT_PRE:'成虫（未後食）', ADULT:'成虫（活動開始）',
    L1:'L1L2', L2_EARLY:'L1L2', L2_LATE:'L1L2',
    L3_EARLY:'L3', L3_MID:'L3', L3_LATE:'L3',
    EGG:'L1L2', T0:'L1L2', T1:'L1L2', T2A:'L3', T2B:'L3', T3:'L3',
  };
  return map[code] || code;
}

// ════════════════════════════════════════════════════════════════
// ロット一覧
// ════════════════════════════════════════════════════════════════
Pages.lotList = function () {
  const main   = document.getElementById('main');
  const params = Store.getParams() || {};
  const fixedLineId = params.line_id || '';
  const fixedLine   = fixedLineId ? Store.getLine(fixedLineId) : null;
  const isLineLimited = !!fixedLineId;

  // デフォルト: active / for_sale / listed を表示（販売候補・出品中が消えない）
  let filters = { status: 'active', stage: '', line_id: fixedLineId };
  // status フィルタ切り替え用の内部値（''=管理中のみ, 'selling'=販売系, 'all'=全て）
  let _lotStatusMode = 'active';  // 'active' | 'selling' | 'all'

  function render() {
    // _lotStatusMode に応じた lot 取得
    let lots = [];
    // filterLots にはステージを渡さず、後で丸めてから比較する
    const _baseFilter = { line_id: filters.line_id };
    if (_lotStatusMode === 'all') {
      lots = Store.filterLots({ ..._baseFilter, status: 'all' });
    } else if (_lotStatusMode === 'selling') {
      const fs = Store.filterLots({ ..._baseFilter, status: 'for_sale' });
      const li = Store.filterLots({ ..._baseFilter, status: 'listed' });
      lots = [...fs, ...li];
    } else {
      // デフォルト: active + for_sale + listed を表示（販売候補・出品中が一覧から消えない）
      const ac = Store.filterLots({ ..._baseFilter, status: 'active' });
      const fs = Store.filterLots({ ..._baseFilter, status: 'for_sale' });
      const li = Store.filterLots({ ..._baseFilter, status: 'listed' });
      lots = [...ac, ...fs, ...li];
    }
    // ステージフィルタ: 丸めたラベルで比較
    if (filters.stage) {
      const targetLabel = _lotDisplayStageLabel(filters.stage);
      lots = lots.filter(l => {
        const s = l.stage_life || l.stage || '';
        return _lotDisplayStageLabel(s) === targetLabel;
      });
    }
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
    { val:'',        label:'全て'          },
    { val:'L1L2',    label:'L1L2'         },
    { val:'L3',      label:'L3'           },
    { val:'PREPUPA', label:'前蛹'          },
    { val:'PUPA',    label:'蛹'           },
    { val:'ADULT_PRE',label:'成虫（未後食）' },
    { val:'ADULT',   label:'成虫（活動開始）'},
  ];
  return stages.map(s =>
    `<button class="pill ${s.val === active ? 'active' : ''}" data-val="${s.val}">${s.label}</button>`
  ).join('');
}

// ════════════════════════════════════════════════════════════════
// ロットカード — 3列レイアウト（コード | 頭数+情報 | ›）
// ════════════════════════════════════════════════════════════════
function _lotCardHTML(lot) {
  try {
    // ── ライン表示: display_id から直接抽出 ──────────────────
    var lineCode = '';
    var _lm = String(lot.display_id || '').match(/[A-Za-z]{1,4}\d{4}-([A-Za-z][0-9]+)-/i);
    if (_lm) lineCode = _lm[1].toUpperCase();
    if (!lineCode) {
      var _ln = Store.getLine(lot.line_id);
      lineCode = _ln ? (_ln.line_code || _ln.display_id || '') : '';
    }

    // ── ステージ ──────────────────────────────────────────────
    var stageCode = lot.stage_life || lot.stage || '';
    var stageLbl  = stageCode ? _lotDisplayStageLabel(stageCode) : '';
    var sColor    = stageCode ? stageColor(stageCode) : 'var(--text3)';

    var recs = Store.getGrowthRecords(lot.lot_id) || [];
    var latestRec = recs.length
      ? recs.slice().sort(function(a,b){ return String(b.record_date).localeCompare(String(a.record_date)); })[0]
      : null;
    var rawMat  = lot.mat_type || (latestRec && latestRec.mat_type) || '';
    var isMolt  = lot.mat_molt === true || lot.mat_molt === 'true';
    var matLbl  = rawMat === 'T2' && isMolt ? 'T2(M)' : rawMat;

    // ── 各種情報 ─────────────────────────────────────────────
    var count      = parseInt(lot.count, 10) || 0;
    var container  = lot.container_size || (latestRec && latestRec.container) || '';
    var weightG    = latestRec && latestRec.weight_g ? latestRec.weight_g + 'g' : '';
    var ageObj     = lot.hatch_date ? Store.calcAge(lot.hatch_date) : null;
    var ageDays    = (ageObj && ageObj.days != null) ? ageObj.days + '日' : '';

    // ── サブ情報: ステージ / マット / 容器 / 体重 / 日齢 ────────
    var parts = [];
    if (stageLbl) parts.push('<span style="font-weight:700;color:' + sColor + '">' + stageLbl + '</span>');
    if (matLbl)   parts.push('<span>' + matLbl + '</span>');
    if (container)parts.push('<span>' + container + '</span>');
    if (weightG)  parts.push('<span style="color:var(--green);font-weight:700">' + weightG + '</span>');
    if (ageDays)  parts.push('<span>' + ageDays + '</span>');
    var subHtml = parts.join('<span style="font-size:.65rem;color:var(--border,rgba(255,255,255,.15));padding:0 2px">/</span>');

    return '<div class="card" style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;margin-bottom:8px"'
      + ' onclick="routeTo(\'lot-detail\',{lotId:\'' + lot.lot_id + '\'})">'
      + '<div style="min-width:44px;text-align:center;flex-shrink:0">'
      +   '<div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:800;color:var(--gold);line-height:1">' + (lineCode || '—') + '</div>'
      +   '<div style="font-size:.75rem;font-weight:700;color:var(--text2);margin-top:3px">' + count + '<span style="font-size:.62rem;color:var(--text3)">頭</span></div>'
      + '</div>'
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-family:var(--font-mono);font-size:.85rem;font-weight:700;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:3px">' + (lot.display_id || '') + '</div>'
      +   (subHtml ? '<div style="display:flex;align-items:center;gap:3px;flex-wrap:wrap;font-size:.78rem;color:var(--text2)">' + subHtml + '</div>' : '')
      + '</div>'
      + '<div style="color:var(--text3);font-size:1.1rem;flex-shrink:0">›</div>'
      + '</div>';
  } catch(e) {
    // 例外時も最低限のカードを返す（真っ白画面禁止）
    return '<div class="card" style="padding:12px 14px;cursor:pointer;margin-bottom:8px"'
      + ' onclick="routeTo(\'lot-detail\',{lotId:\'' + (lot.lot_id||'') + '\'})">'
      + '<div style="font-size:.85rem">' + (lot.display_id || lot.lot_id || '') + '</div>'
      + '</div>';
  }
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
  if (lotId && typeof lotId === 'object') lotId = lotId.id || lotId.lotId || lotId.lot_id || '';
  const main = document.getElementById('main');
  if (!lotId) {
    main.innerHTML = UI.header('ロット詳細', { back: true })
      + '<div class="page-body">' + UI.empty('IDが指定されていません') + '</div>';
    return;
  }

  // ローカルキャッシュから即時表示
  let lot = Store.getLot(lotId);
  if (lot) {
    try { _renderLotDetail(lot, main); } catch(e) {
      main.innerHTML = UI.header('ロット詳細', { back: true })
        + '<div class="page-body">' + UI.empty('表示エラー: ' + e.message) + '</div>';
    }
  } else {
    main.innerHTML = UI.header('ロット詳細', { back: true }) + UI.spinner();
  }

  // GASから最新データ取得
  try {
    const res = await API.lot.get(lotId);
    if (Store.getPage() !== 'lot-detail') return;
    const curId = Store.getParams().lotId || Store.getParams().id || Store.getParams().lot_id || '';
    if (curId && curId !== lotId) return;
    lot = res.lot || res;
    try { _renderLotDetail(lot, main); } catch(e) {
      main.innerHTML = UI.header('ロット詳細', { back: true })
        + '<div class="page-body">' + UI.empty('表示エラー: ' + e.message) + '</div>';
    }
  } catch (e) {
    if (Store.getPage() === 'lot-detail') {
      if (!lot) {
        main.innerHTML = UI.header('ロット詳細', { back: true })
          + '<div class="page-body">' + UI.empty('取得失敗: ' + e.message) + '</div>';
      }
      // ローカルデータ表示中なら何もしない（ネットワークエラーでも表示を維持）
    }
  }
};

function _renderLotDetail(lot, main) {
  const age      = Store.calcAge(lot.hatch_date);
  const line     = Store.getLine(lot.line_id);
  const lineCode = line ? (line.line_code || line.display_id) : '';
  const records  = lot._growthRecords || Store.getGrowthRecords(lot.lot_id) || [];
  // Store.getSettings はバージョンによって未定義の場合があるため安全に取得
  let settings = {};
  try { if (typeof Store.getSettings === 'function') settings = Store.getSettings() || {}; } catch(_e) {}

  const latestRec = records.length > 0
    ? [...records].sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))[0]
    : null;

  const dispContainer = (latestRec?.container) || lot.container_size || '—';
  const dispWeight    = latestRec?.weight_g ? latestRec.weight_g + 'g' : null;
  const dispMatType   = (latestRec?.mat_type) || lot.mat_type || '—';
  const isMatMolt     = lot.mat_molt === true || lot.mat_molt === 'true' || lot.mat_molt === '1';
  const dispMatLabel  = (typeof matLabel === 'function') ? matLabel(dispMatType, isMatMolt) : dispMatType;
  const stageLife     = lot.stage_life || '';
  const dispStage     = (latestRec?.stage) || lot.stage || '—';
  const lastMatDate   = lot.mat_changed_at || latestRec?.record_date || '';
  const override      = lot.next_change_override_date || '';
  // 交換日数: 設定方式に応じて計算（normal: マットのみ / hybrid: マット+補正）
  const exDays = (typeof getExchangeDays === 'function')
    ? getExchangeDays(dispMatType, settings, stageLife || dispStage, lot.count)
    : 60;
  const exchAlert     = (typeof calcExchangeAlert === 'function')
    ? calcExchangeAlert(lastMatDate, exDays, override, settings) : null;
  const alertBadge    = (typeof exchangeAlertBadge === 'function' && exchAlert)
    ? exchangeAlertBadge(exchAlert) : '';
  const recMat        = (typeof recommendedMat === 'function')
    ? recommendedMat(stageLife || dispStage) : null;
  // 計算方式バッジ（ハイブリッド時のみ表示）
  const exchangeMode  = (settings && settings.mat_exchange_mode) || 'normal';
  const modeBadge     = exchangeMode === 'hybrid'
    ? '<span style="font-size:.65rem;color:var(--blue);border:1px solid rgba(91,168,232,.35);'
      + 'border-radius:4px;padding:1px 5px;margin-left:4px">ハイブリッド</span>'
    : '';
  const nextChangeLbl = override
    ? override + ' <span style="font-size:.68rem;color:var(--amber)">(延長)</span>'
    : (exchAlert && exchAlert.nextDate ? exchAlert.nextDate : '—');

  main.innerHTML = `
    ${UI.header(lot.display_id, {
      back: true,
      action: { fn: `_lotQuickActions('${lot.lot_id}')`, icon: '…' }
    })}
    <div class="page-body">

      <div class="card card-gold">
        <div class="lot-detail-header">
          <div class="lot-detail-left">
            <div class="lot-detail-line">${lineCode}</div>
            <div class="lot-detail-id">${lot.display_id}</div>
          </div>
          <div class="lot-detail-center">
            <div class="lot-detail-count">${lot.count}<span style="font-size:.9rem;font-weight:400;color:var(--text3)">頭</span></div>
            ${stageLife
              ? `<span style="font-size:.75rem;font-weight:700;color:var(--blue);padding:2px 8px;border:1px solid rgba(91,168,232,.4);border-radius:6px">${_lotDisplayStageLabel(stageLife)}</span>`
              : `<span style="font-size:.75rem;font-weight:700;color:var(--blue);padding:2px 8px;border:1px solid rgba(91,168,232,.4);border-radius:6px">${_lotDisplayStageLabel(dispStage !== '—' ? dispStage : lot.stage)}</span>`}
          </div>
          <div class="lot-detail-right">
            ${age ? `<div style="font-size:.72rem;color:var(--text3)">日齢</div><div style="font-weight:700;font-size:1rem">${age.days}</div>` : ''}
          </div>
        </div>
        ${alertBadge ? `<div style="margin-top:8px">${alertBadge}</div>` : ''}
        ${age ? `<div style="background:var(--bg3);border-radius:var(--radius-sm);padding:8px;margin-top:8px">
          ${UI.ageFull(lot.hatch_date)}
        </div>` : ''}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button style="padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.92rem;
          background:var(--green);color:#fff;border:none;cursor:pointer"
          onclick="routeTo('growth-rec',{targetType:'LOT',targetId:'${lot.lot_id}',displayId:'${lot.display_id}'})">
          📷 記録
        </button>
        <button style="padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.92rem;
          background:var(--surface3,#3a3a4a);color:var(--text1);border:1px solid var(--border);cursor:pointer"
          onclick="Pages._showSplitModal('${lot.lot_id}',${lot.count},'${lot.stage_life||lot.stage||'L1L2'}','${lot.line_id}','${lot.hatch_date||''}','${lot.display_id}')">
          ✂️ 分割
        </button>
      </div>

      <div class="card">
        <div class="card-title">ロット情報</div>
        <div class="info-list">
          ${_infoRow('ライン', line ? `<span onclick="routeTo('line-detail',{lineId:'${line.line_id}'})" style="color:var(--blue);cursor:pointer">${lineCode}</span>` : lot.line_id)}
          ${dispWeight ? _infoRow('最新体重', `<span style="font-weight:700;color:var(--green)">${dispWeight}</span>`) : ''}
          ${stageLife  ? _infoRow('生体ステージ', `<span style="font-weight:700;color:var(--blue)">${_lotDisplayStageLabel(stageLife)}</span>`) : ''}
          ${_infoRow('飼育ステージ', dispStage !== '—' ? dispStage : (lot.stage || '—'))}
          ${_infoRow('容器', dispContainer)}
          ${_infoRow('マット', dispMatLabel + (alertBadge ? ' ' + alertBadge : ''))}
          ${recMat && recMat !== dispMatType ? _infoRow('推奨マット', `<span style="font-size:.78rem;color:var(--amber)">→ ${recMat}</span>`) : ''}
          ${_infoRow('孵化日', lot.hatch_date || '未設定')}
          ${_infoRow('最終交換', lastMatDate || '—')}
          ${exDays > 0 ? _infoRow('次回交換予定', nextChangeLbl + modeBadge) : ''}
          ${override ? _infoRow('延長メモ', lot.mat_alert_note || '（延長中）') : ''}
          ${(() => {
            if (!lot.parent_lot_id) return '';
            const _pLot = Store.getLot(lot.parent_lot_id);
            const _pDisp = _pLot ? (_pLot.display_id || '') : '';
            const _pLabel = _pDisp || '—';
            return _infoRow('分割元',
              '<span style="color:var(--blue);cursor:pointer"'
              + ' onclick="routeTo(' + "'lot-detail'" + ',{lotId:' + "'" + lot.parent_lot_id + "'" + '})">'
              + _pLabel + '</span>');
          })()}
          ${lot.note ? _infoRow('メモ', lot.note) : ''}
        </div>
      </div>

      ${!lot.hatch_date ? `
      <button class="btn btn-full" style="background:var(--amber);color:#1a1a1a;font-weight:700"
        onclick="Pages._lotSetHatchDate('${lot.lot_id}')">
        📅 孵化日を設定
      </button>` : ''}

      <div class="accordion" id="acc-lot-growth">
        <div class="acc-hdr open" onclick="_toggleAcc('acc-lot-growth')">
          成長記録（${records.length}件）<span class="acc-arrow">▼</span>
        </div>
        <div class="acc-body open">
          ${records.length ? UI.weightTable(records) : UI.empty('記録なし')}
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm"
          onclick="Pages._lotEditStage('${lot.lot_id}','${lot.stage_life || lot.stage || ''}')">
          🌱 生体ステージ
        </button>
        <button class="btn btn-ghost btn-sm"
          onclick="Pages._lotEditMat('${lot.lot_id}')">
          🔄 マット交換
        </button>
      </div>

      ${_renderLotSaleActions(lot)}

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
    { count: Math.floor(totalCount/2), container:'', mat:'', size_category:'', sex_hint:'', weight:'', note:'' },
    { count: totalCount - Math.floor(totalCount/2), container:'', mat:'', size_category:'', sex_hint:'', weight:'', note:'' },
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
            ${[{code:'',label:'選択…'},...MAT_TYPES].map(m=>`<option value="${m.code}" ${c.mat===m.code?'selected':''}>${m.label||m.code||'選択…'}</option>`).join('')}
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
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">分割時体重 (g)</div>
          <input type="number" class="input" step="0.1" min="0" value="${c.weight||''}"
            placeholder="任意" style="width:100%"
            oninput="_splitCards[${i}].weight=this.value">
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
      onclick="_splitCards.push({count:1,container:'',mat:'',size_category:'',sex_hint:'',weight:'',note:''});_renderSplitModal()">
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
    container_size:  c.container || '',
    mat_type:        c.mat       || '',
    size_category:   c.size_category || '',
    sex_hint:        c.sex_hint  || '',
    note:            c.note      || '',
    initial_weight:  c.weight    || '',  // 分割時最新体重（履歴コピーの末尾に追加される）
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
      ${UI.field('生体ステージ', UI.select('new-stage',
        STAGE_LIST.map(s => ({ code: s.code, label: s.label })),
        currentStage || 'L1'))}
      <div style="font-size:.72rem;color:var(--text3);margin-top:-8px;margin-bottom:8px">
        ステージ（生体の成長段階）とマット（飼育環境）は別々に設定します
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" onclick="Pages._lotStageUpdate('${lotId}')">変更</button>
      </div>
    </div>`);
};

Pages._lotStageUpdate = async function (lotId) {
  const stageLife = document.querySelector('[name="new-stage"]')?.value;
  if (!stageLife) return;
  _closeModal();
  // 後方互換: stage（旧フィールド）にも補助的にマッピング
  try {
    await apiCall(
      () => API.lot.update({ lot_id: lotId, stage_life: stageLife }),
      _lotDisplayStageLabel(stageLife) + ' に変更しました'
    );
    Store.patchDBItem('lots', 'lot_id', lotId, { stage_life: stageLife });
    Pages.lotDetail(lotId);
  } catch (e) {}
};

// マット変更（モルト: T2のみ表示 / T2(M) 対応）
Pages._lotEditMat = function (lotId) {
  const lot = Store.getLot(lotId) || {};
  const today = new Date().toISOString().split('T')[0];
  _showModal('マット交換', `
    <div class="form-section">
      ${UI.field('マット種別', `
        <select id="new-mat" class="input" onchange="Pages._lotMatToggleMolt(this.value)">
          ${MAT_TYPES.map(m =>
            '<option value="' + m.code + '"' + (lot.mat_type === m.code ? ' selected' : '') + '>' + m.label + '</option>'
          ).join('')}
        </select>`)}
      <div id="new-malt-wrap" style="display:${lot.mat_type==='T2'?'block':'none'};margin-top:4px">
        <label style="display:flex;align-items:center;gap:8px;font-size:.85rem">
          <input type="checkbox" id="new-malt" ${(lot.mat_molt === true || lot.mat_molt === 'true' || lot.mat_molt === '1') ? 'checked' : ''}>
          モルトパウダー入り（T2(M)として記録）
        </label>
      </div>
      ${UI.field('交換日', '<input type="date" id="new-mat-date" class="input" value="' + today + '">')}

      <!-- 延長オプション（交換せず様子見） -->
      <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px">
        <div style="font-size:.78rem;font-weight:700;color:var(--text3);margin-bottom:8px">
          交換せず延長する場合
        </div>
        <div style="display:flex;gap:8px">
          ${EXTEND_OPTIONS.map(opt =>
            '<button class="btn btn-ghost btn-sm" onclick="Pages._lotExtend(\'' + lotId + '\',' + opt.days + ')">' + opt.label + '</button>'
          ).join('')}
        </div>
        <div style="font-size:.72rem;color:var(--text3);margin-top:4px">
          延長した場合は交換モーダルを閉じます
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" onclick="Pages._lotMatUpdate('${lotId}')">交換した</button>
      </div>
    </div>`);
};

Pages._lotMatToggleMolt = function (matType) {
  const wrap = document.getElementById('new-malt-wrap');
  if (wrap) wrap.style.display = matType === 'T2' ? 'block' : 'none';
};

// 登録フォーム用モルト表示切替
Pages._lotFormToggleMolt = function (matType) {
  const wrap = document.getElementById('lot-form-malt-wrap');
  if (wrap) wrap.style.display = matType === 'T2' ? 'block' : 'none';
};

Pages._lotMatUpdate = async function (lotId) {
  const mat   = document.getElementById('new-mat')?.value;
  const malt  = document.getElementById('new-malt')?.checked || false;
  const date  = document.getElementById('new-mat-date')?.value || '';
  _closeModal();
  const matDate = (date || new Date().toISOString().split('T')[0]).replace(/-/g,'/');
  try {
    await apiCall(() => API.lot.update({
      lot_id: lotId, mat_type: mat, mat_molt: malt, mat_changed_at: matDate,
      next_change_override_date: '',  // 交換したので延長上書きをクリア
    }), matLabel(mat, malt) + ' に交換しました');
    Store.patchDBItem('lots', 'lot_id', lotId, {
      mat_type: mat, mat_molt: malt, mat_changed_at: matDate, next_change_override_date: '',
    });
    Pages.lotDetail(lotId);
  } catch (e) {}
};

// 延長：交換せず期日を延ばす
Pages._lotExtend = async function (lotId, days) {
  _closeModal();
  const lot = Store.getLot(lotId) || {};
  var baseDate = lot.next_change_override_date || lot.mat_changed_at || '';
  var next;
  if (baseDate) {
    next = new Date(String(baseDate).replace(/\//g,'-'));
    next.setDate(next.getDate() + days);
  } else {
    next = new Date();
    next.setDate(next.getDate() + days);
  }
  var overrideDate = next.toISOString().slice(0,10).replace(/-/g,'/');
  try {
    await apiCall(() => API.lot.update({ lot_id: lotId, next_change_override_date: overrideDate }),
      days + '日延長しました（次回: ' + overrideDate + '）');
    Store.patchDBItem('lots', 'lot_id', lotId, { next_change_override_date: overrideDate });
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
          ${UI.field('ステージ', UI.select('stage_life',
            STAGE_LIST.map(s => ({ code: s.code, label: s.label })),
            'L1L2'))}
          ${UI.field('頭数', UI.input('count', 'number', '5', '頭数'))}
        </div>
        <div class="form-row-2">
          ${UI.field('孵化日', UI.input('hatch_date', 'date', ''))}
          ${UI.field('容器', UI.select('container_size', [
            {code:'',     label:'— 未選択 —'},
            {code:'1.8L', label:'1.8L'},
            {code:'2.7L', label:'2.7L'},
            {code:'4.8L', label:'4.8L'},
          ], '1.8L'))}
        </div>
        ${UI.field('マット種別', `
          <select name="mat_type" id="lot-form-mat" class="input"
            onchange="Pages._lotFormToggleMolt(this.value)">
            ${MAT_TYPES.map(m => '<option value="' + m.code + '"' + (m.code === 'T0' ? ' selected' : '') + '>' + m.label + '</option>').join('')}
          </select>`)}
        <div id="lot-form-malt-wrap" style="display:none">
          ${UI.field('モルト（T2のみ）', `<label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" name="mat_molt"> モルトパウダー入り（T2(M)として記録）
          </label>`)}
        </div>
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
  // stage_life をそのまま stage にも設定
  if (data.stage_life && !data.stage) {
    data.stage = data.stage_life;
  }
  // mat_molt は checkbox → bool
  data.mat_molt = !!data.mat_molt;
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
  const lot   = Store.getLot(lotId);
  if (!lot) { UI.toast('ロットが見つかりません', 'error'); return; }
  const lines = Store.getDB('lines') || [];
  UI.modal(`
    <div class="modal-title">ロット情報を修正</div>
    <div class="form-section" style="max-height:65vh;overflow-y:auto">
      ${UI.field('ライン', `<select id="le-line" class="input">
        <option value="">— 未選択 —</option>
        ${lines.map(l => `<option value="${l.line_id}" ${l.line_id===lot.line_id?'selected':''}>${l.line_code||l.display_id}${l.line_name?' / '+l.line_name:''}</option>`).join('')}
      </select>
      <div style="font-size:.7rem;color:var(--amber);margin-top:3px">
        ⚠️ 集計がずれている場合のみ変更してください
      </div>`)}
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
  const lineId    = document.getElementById('le-line')?.value || '';
  const hatch     = document.getElementById('le-hatch')?.value?.replace(/-/g,'/') || '';
  const count     = parseInt(document.getElementById('le-count')?.value || '0');
  const container = document.getElementById('le-container')?.value || '';
  const mat       = document.getElementById('le-mat')?.value || '';
  const note      = document.getElementById('le-note')?.value || '';
  // 再発防止: line_id が内部IDパターン(LINE-xxxxx)でなければ保存しない
  if (lineId && !lineId.startsWith('LINE-')) {
    UI.toast('ライン選択が不正です。内部IDが必要です', 'error');
    return;
  }
  const payload = { lot_id: lotId, hatch_date: hatch, count, container_size: container, mat_type: mat, note };
  if (lineId) payload.line_id = lineId;
  try {
    UI.loading(true);
    UI.closeModal();
    await API.lot.update(payload);
    if (lineId) Store.patchDBItem('lots', 'lot_id', lotId, { line_id: lineId });
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
  let selectedStage   = 'L1';
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
          ${UI.field('生体ステージ', `<select id="blk-stage" class="input">
            ${STAGE_LIST.map(s =>
              '<option value="' + s.code + '" ' + (s.code === selectedStage ? 'selected' : '') + '>' + s.label + '</option>'
            ).join('')}
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
  const stage  = document.getElementById('blk-stage')?.value || 'L1L2';
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
      stage_life: stage,
      stage:      stage,
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

// ════════════════════════════════════════════════════════════════
// ロット詳細 — 販売アクション領域
//
// 状態ごとのボタン:
//   active   : 全部を販売候補にする / 一部を販売候補にする / ロット死亡
//   for_sale : 出品する / まとめて販売 / 販売候補を解除 / ロット死亡
//   listed   : まとめて販売 / 一部販売 / 出品解除 / ロット死亡
//   sold     : 販売済み表示のみ
//   dissolved/individualized: 非表示
// ════════════════════════════════════════════════════════════════
function _renderLotSaleActions(lot) {
  var st = lot.status || 'active';
  var id = lot.lot_id;

  if (st === 'individualized' || st === 'dissolved') return '';

  if (st === 'sold') {
    return '<div style="background:rgba(200,168,75,.08);border:1px solid rgba(200,168,75,.25);'
      + 'border-radius:12px;padding:14px 16px;margin-top:12px;text-align:center">'
      + '<div style="font-size:.85rem;font-weight:700;color:var(--gold)">💰 販売済み</div>'
      + '<div style="font-size:.75rem;color:var(--text3);margin-top:4px">計 ' + (lot.count || 0) + '頭</div>'
      + '</div>';
  }

  var SC = {
    active:   { label:'管理中',   color:'var(--green)',  desc:'販売候補にする操作をここから行えます' },
    for_sale: { label:'販売候補', color:'#9c27b0',       desc:'出品または直接販売できます' },
    listed:   { label:'出品中',   color:'#ff9800',       desc:'購入者が決まったら販売済みにしてください' },
  };
  var sc = SC[st] || {};
  var header = sc.label
    ? '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">'
      + '<span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:.75rem;font-weight:700;'
      + 'color:' + sc.color + ';border:1px solid ' + sc.color + ';background:' + sc.color + '18">'
      + sc.label + '</span>'
      + '<span style="font-size:.72rem;color:var(--text3)">' + sc.desc + '</span>'
      + '</div>'
    : '';

  function btn(bg, border, color, icon, label, onclick) {
    return '<button onclick="' + onclick + '" style="display:flex;align-items:center;justify-content:center;'
      + 'gap:6px;padding:11px 10px;border-radius:10px;font-size:.82rem;font-weight:700;cursor:pointer;'
      + 'background:' + bg + ';color:' + color + ';border:1px solid ' + border + '">'
      + icon + ' ' + label + '</button>';
  }

  window.__lotSoldId = id;
  window.__lotPartId = id;
  var setFn  = function(s) { return "Pages._lotSetSaleStatus('" + id + "','" + s + "')"; };
  var soldFn = "Pages._lotMarkSoldModal(window.__lotSoldId)";
  var partFn = "Pages._lotPartSaleModal(window.__lotPartId)";
  var deadFn = "Pages._lotMarkDead('" + id + "')";

  var rows = '';
  if (st === 'active') {
    rows = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + btn('rgba(156,39,176,.12)','rgba(156,39,176,.4)','#9c27b0', '🛒', '全部を販売候補にする', setFn('for_sale'))
      + btn('rgba(156,39,176,.12)','rgba(156,39,176,.4)','#9c27b0', '✂️', '一部を販売候補にする', "Pages._lotPartForSaleModal('" + id + "')")
      + '</div>'
      + btn('rgba(224,80,80,.1)','rgba(224,80,80,.35)','var(--red,#e05050)', '💀', 'ロット死亡（管理終了）', deadFn);
  } else if (st === 'for_sale') {
    rows = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + btn('rgba(255,152,0,.12)','rgba(255,152,0,.4)','#ff9800', '📢', '出品する', "Pages._lotListModal('" + id + "')")
      + btn('rgba(200,168,75,.15)','rgba(200,168,75,.4)','var(--gold)', '💰', 'まとめて販売', soldFn)
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + btn('var(--bg3)','var(--border)','var(--text2)', '↩', '販売候補を解除', setFn('active'))
      + btn('rgba(224,80,80,.1)','rgba(224,80,80,.35)','var(--red,#e05050)', '💀', 'ロット死亡', deadFn)
      + '</div>';
  } else if (st === 'listed') {
    rows = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + btn('rgba(200,168,75,.15)','rgba(200,168,75,.4)','var(--gold)', '💰', 'まとめて販売', soldFn)
      + btn('rgba(255,152,0,.12)','rgba(255,152,0,.4)','#ff9800', '✂️', '一部販売', partFn)
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + btn('var(--bg3)','var(--border)','var(--text2)', '↩', '出品解除', setFn('for_sale'))
      + btn('rgba(224,80,80,.1)','rgba(224,80,80,.35)','var(--red,#e05050)', '💀', 'ロット死亡', deadFn)
      + '</div>';
  }

  if (!rows) return '';

  return '<div style="margin-top:16px;padding:14px 16px;background:var(--bg2);'
    + 'border:1px solid var(--border);border-radius:12px">'
    + header + rows + '</div>';
}

// ════════════════════════════════════════════════════════════════
// ロット 販売ステータス変更関数
// ════════════════════════════════════════════════════════════════

// 出品モーダル（for_sale → listed）— 販売ルート・出品日・メモを入力してから遷移
Pages._lotListModal = function (lotId) {
  const lot   = Store.getLot(lotId);
  const today = new Date().toISOString().split('T')[0];
  window.__lotListId = lotId;
  _showModal('📢 出品設定', '<div class="form-section">'
    + '<div style="font-size:.8rem;color:var(--text3);margin-bottom:12px">'
    + (lot ? lot.display_id : '') + '</div>'
    + UI.field('販売ルート *', UI.select('lot-list-channel', [
        { code:'',        label:'— 選択してください —' },
        { code:'ヤフオク', label:'ヤフオク' },
        { code:'イベント', label:'イベント' },
        { code:'直接取引', label:'直接取引' },
        { code:'その他',   label:'その他'   },
      ], ''))
    + UI.field('出品日', '<input type="date" id="lot-list-date" class="input" value="' + today + '">') 
    + UI.field('メモ（任意）', '<input type="text" id="lot-list-note" class="input" placeholder="例: ヤフオク開始価格5000円">')
    + '<div class="modal-footer">'
    +   '<button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>'
    +   '<button class="btn btn-primary" style="flex:2" onclick="Pages._lotListSave()">出品する</button>'
    + '</div></div>');
};

Pages._lotListSave = async function () {
  const lotId   = window.__lotListId;
  const chanEl  = document.getElementById('lot-list-channel');
  const dateEl  = document.getElementById('lot-list-date');
  const noteEl  = document.getElementById('lot-list-note');
  const channel = chanEl ? chanEl.value : '';
  if (!channel) { UI.toast('販売ルートを選択してください', 'error'); return; }
  _closeModal();
  try {
    UI.loading(true);
    const updates = {
      lot_id: lotId,
      status: 'listed',
      note:   noteEl ? (noteEl.value || '') : '',
    };
    await API.lot.update(updates);
    Store.patchDBItem('lots', 'lot_id', lotId, { status: 'listed' });
    // 出品チャネルはメモに保存（将来的に専用フィールド追加まで）
    UI.toast('出品中にしました（' + channel + '）', 'success');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('変更失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// 汎用ステータス変更（API.lot.update 経由）
Pages._lotSetSaleStatus = async function (lotId, newStatus) {
  try {
    UI.loading(true);
    await API.lot.update({ lot_id: lotId, status: newStatus });
    Store.patchDBItem('lots', 'lot_id', lotId, { status: newStatus });
    const msg = newStatus === 'for_sale' ? '販売候補にしました'
      : newStatus === 'active'  ? '管理中に戻しました'
      : newStatus === 'listed'  ? '出品中にしました'
      : newStatus === 'sold'    ? '販売済みにしました'
      : 'ステータスを変更しました';
    UI.toast(msg, 'success');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('変更失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// まとめて販売モーダル
Pages._lotMarkSoldModal = function (lotId) {
  const lot   = Store.getLot(lotId);
  const count = lot ? (lot.count || '?') : '?';
  const today = new Date().toISOString().split('T')[0];
  _showModal('まとめて販売（' + count + '頭）', '<div class="form-section">'
    + UI.field('販売日 *', '<input type="date" id="lot-sell-date" class="input" value="' + today + '">')
    + UI.field('販売チャネル', UI.select('lot-sell-channel', [
        { code:'ヤフオク', label:'ヤフオク' },
        { code:'イベント', label:'イベント' },
        { code:'直接',     label:'直接取引' },
        { code:'その他',   label:'その他'   },
      ], 'ヤフオク'))
    + UI.field('金額 (円)', '<input type="number" id="lot-sell-price" class="input" placeholder="例: 30000">')
    + UI.field('購入者名', '<input type="text" id="lot-sell-buyer" class="input" placeholder="任意">')
    + UI.field('備考', '<input type="text" id="lot-sell-note" class="input" placeholder="任意">')
    + '<div class="modal-footer">'
    +   '<button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>'
    +   '<button class="btn btn-primary" style="flex:2" onclick="Pages._lotMarkSoldSave(window.__lotSoldId)">販売済みにする</button>'
    + '</div></div>');
};

Pages._lotMarkSoldSave = async function (lotId) {
  const dateEl  = document.getElementById('lot-sell-date');
  const chanEl  = document.getElementById('lot-sell-channel');
  const priceEl = document.getElementById('lot-sell-price');
  const buyerEl = document.getElementById('lot-sell-buyer');
  const noteEl  = document.getElementById('lot-sell-note');
  if (!dateEl || !dateEl.value) { UI.toast('販売日を入力してください', 'error'); return; }
  const lot     = Store.getLot(lotId);
  const payload = {
    lot_id:      lotId,
    status:      'sold',
    sold_date:   dateEl.value.replace(/-/g, '/'),
    actual_price: priceEl ? (priceEl.value || '') : '',
    platform:    chanEl ? (chanEl.value || '') : '',
    buyer_name:  buyerEl ? (buyerEl.value || '') : '',
    buyer_note:  noteEl ? (noteEl.value || '') : '',
    display_id:  lot ? (lot.display_id || '') : '',
    sold_count:  lot ? (String(lot.count || '1')) : '1',
  };
  _closeModal();
  try {
    UI.loading(true);
    // 販売履歴作成 + ロットstatus更新
    await API.sale.createLotSale(payload);
    Store.patchDBItem('lots', 'lot_id', lotId, { status: 'sold' });
    UI.toast('販売済みにしました', 'success');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('販売失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// 一部販売モーダル（頭数指定）
Pages._lotPartSaleModal = function (lotId) {
  const lot   = Store.getLot(lotId);
  const count = lot ? (parseInt(lot.count, 10) || 1) : 1;
  const today = new Date().toISOString().split('T')[0];
  _showModal('一部販売', '<div class="form-section">'
    + UI.field('販売頭数 *', '<input type="number" id="lot-part-count" class="input" min="1" max="' + count + '" value="1" placeholder="1〜' + count + '">')
    + UI.field('販売日 *', '<input type="date" id="lot-part-date" class="input" value="' + today + '">')
    + UI.field('販売チャネル', UI.select('lot-part-channel', [
        { code:'ヤフオク', label:'ヤフオク' },
        { code:'イベント', label:'イベント' },
        { code:'直接',     label:'直接取引' },
        { code:'その他',   label:'その他'   },
      ], 'ヤフオク'))
    + UI.field('金額 (円)', '<input type="number" id="lot-part-price" class="input" placeholder="例: 10000">')
    + UI.field('購入者名', '<input type="text" id="lot-part-buyer" class="input" placeholder="任意">')
    + '<div class="modal-footer">'
    +   '<button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>'
    +   '<button class="btn btn-primary" style="flex:2" onclick="Pages._lotPartSaleSave(window.__lotPartId,' + count + ')">一部販売する</button>'
    + '</div></div>');
};

Pages._lotPartSaleSave = async function (lotId, totalCount) {
  const cntEl   = document.getElementById('lot-part-count');
  const dateEl  = document.getElementById('lot-part-date');
  const chanEl  = document.getElementById('lot-part-channel');
  const priceEl = document.getElementById('lot-part-price');
  const buyerEl = document.getElementById('lot-part-buyer');
  const partCount = parseInt(cntEl ? cntEl.value : '1', 10);
  if (!partCount || partCount < 1) { UI.toast('頭数を入力してください', 'error'); return; }
  if (!dateEl || !dateEl.value) { UI.toast('販売日を入力してください', 'error'); return; }
  const lot     = Store.getLot(lotId);
  const payload = {
    lot_id:      lotId,
    sold_count:  String(partCount),
    sold_date:   dateEl.value.replace(/-/g, '/'),
    actual_price: priceEl ? (priceEl.value || '') : '',
    platform:    chanEl ? (chanEl.value || '') : '',
    buyer_name:  buyerEl ? (buyerEl.value || '') : '',
    display_id:  lot ? (lot.display_id || '') : '',
  };
  _closeModal();
  try {
    UI.loading(true);
    // 一部販売: SALE_HIST作成のみ（status は sold にしない）
    await API.sale.createPartLotSale(payload);
    // 残頭数更新（GASでなくフロントで更新）
    const remaining = (parseInt(totalCount, 10) || 1) - partCount;
    await API.lot.update({ lot_id: lotId, count: String(Math.max(0, remaining)) });
    await syncAll(true);
    UI.toast('一部販売しました（' + partCount + '頭）', 'success');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('販売失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// 一部を販売候補にするモーダル（active 状態から）
// 設計: splitLot を使って元ロットを分割する。
//   例) 4頭ロットから1頭を販売候補 →
//     ・販売候補ロット 1頭 (for_sale)
//     ・残ロット      3頭 (active)
//     ・元ロットは dissolved（二重カウント防止）
Pages._lotPartForSaleModal = function (lotId) {
  const lot   = Store.getLot(lotId);
  const count = lot ? (parseInt(lot.count, 10) || 1) : 1;
  if (count <= 1) {
    Pages._lotSetSaleStatus(lotId, 'for_sale');
    return;
  }
  window.__lotPartFsId    = lotId;
  window.__lotPartFsTotal = count;
  _showModal('一部を販売候補にする',
    '<div class="form-section">'
    + '<div style="font-size:.8rem;color:var(--text3);margin-bottom:12px">'
    + '販売候補にする頭数を入力してください。<br>元ロットを分割し、残りは引き続き「管理中」として残ります。</div>'
    + UI.field('販売候補にする頭数 *',
        '<input type="number" id="lot-pfs-count" class="input" min="1" max="' + (count - 1) + '" value="1" placeholder="1〜' + (count - 1) + '">'
        + '<div style="font-size:.75rem;color:var(--text3);margin-top:4px">残り ' + (count - 1) + '頭は管理中ロットとして分割されます</div>')
    + '<div class="modal-footer">'
    +   '<button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>'
    +   '<button class="btn btn-primary" style="flex:2" onclick="Pages._lotPartForSaleSave()">分割して候補にする</button>'
    + '</div></div>');
};

Pages._lotPartForSaleSave = async function () {
  const lotId = window.__lotPartFsId;
  const total = window.__lotPartFsTotal || 1;
  const cntEl = document.getElementById('lot-pfs-count');
  const saleCount = parseInt(cntEl ? cntEl.value : '1', 10);
  if (!saleCount || saleCount < 1) { UI.toast('頭数を入力してください', 'error'); return; }
  if (saleCount >= total) {
    _closeModal();
    Pages._lotSetSaleStatus(lotId, 'for_sale');
    return;
  }
  const remainCount = total - saleCount;
  _closeModal();
  try {
    UI.loading(true);
    // splitLot: [販売候補, 残ロット] に分割
    // GAS側で元ロットは dissolved になる（二重カウント防止）
    const res = await API.lot.split({
      lot_id:       lotId,
      split_counts: [saleCount, remainCount],
    });
    const newLots       = res.new_lots       || [];
    const autoInds      = res.auto_individuals || [];

    // saleCount=1 の場合: 1頭ロットは自動個体化される（splitLot の仕様）
    // → lot を for_sale に変えるのではなく individual を for_sale に変える
    if (saleCount === 1 && autoInds.length >= 1) {
      const indId = autoInds[0].ind_id;
      await API.individual.changeStatus(indId, 'for_sale');
    } else if (newLots.length >= 1) {
      // saleCount≥2: 販売候補ロットを for_sale に
      await API.lot.update({ lot_id: newLots[0].lot_id, status: 'for_sale' });
    }

    await syncAll(true);
    UI.toast(saleCount + '頭を販売候補に分割しました（残' + remainCount + '頭は管理中）', 'success');
    // 残ロット詳細へ（saleCount=1なら残は0番目、saleCount≥2なら1番目の新ロット）
    // new_lots[0] = 販売対象ロット（saleCount=1なら自動個体化済み）
    // new_lots[1] = 残ロット（remainCount頭, active）← 常に[1]
    const remainLot = newLots.length >= 2 ? newLots[1] : null;
    if (remainLot) {
      routeTo('lot-detail', { lotId: remainLot.lot_id });
    } else {
      routeTo('lot-list');
    }
  } catch(e) {
    UI.toast('分割失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ロット死亡（active / for_sale / listed から dissolved へ）
Pages._lotMarkDead = async function (lotId) {
  const lot = Store.getLot(lotId);
  const cnt = lot ? (lot.count || '?') : '?';
  if (!UI.confirm('ロット（' + cnt + '頭）を死亡として記録しますか？\n管理を終了します。')) return;
  try {
    UI.loading(true);
    await API.lot.update({ lot_id: lotId, status: 'dissolved', count: 0 });
    Store.patchDBItem('lots', 'lot_id', lotId, { status: 'dissolved', count: 0 });
    UI.toast('死亡として記録しました', 'success');
    Store.back();
  } catch(e) {
    UI.toast('記録失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

window.PAGES['lot-list']   = () => Pages.lotList();
window.PAGES['lot-detail'] = () => Pages.lotDetail(Store.getParams().lotId || Store.getParams().id);
window.PAGES['lot-new']    = () => Pages.lotNew(Store.getParams());
window.PAGES['lot-bulk']   = () => Pages.lotBulk(Store.getParams());

