// FILE: js/pages/t2_session.js
// ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// t2_session.js v3.0 — T2移行編成セッション画面
//
// 運用ルール:
//   - T1→T2 は必ずこの画面で確定（継続でも）
//   - 継続読取りは同ステージ内での通常交換に使用
//   - 状態(通常/死亡) と 判断(継続/個別化/販売候補) を分離
//   - 死亡は「状態」で選んだ時点で decision='dead' 確定
//
// 初期値:
//   - size_category は T1 時点の値を引き継ぎ（変更可）
//   - weight_g は T2 で新規入力（空欄スタート）
//   - status: 'normal', decision: null
// ════════════════════════════════════════════════════════════════
'use strict';

window._t2Session = window._t2Session || null;

// ────────────────────────────────────────────────────────────────
// セッション開始エントリーポイント（scan.js から呼ばれる）
// ────────────────────────────────────────────────────────────────
Pages.t2SessionStart = async function (unitDisplayId) {
  console.log('[T2] t2SessionStart - displayId:', unitDisplayId);

  const unit = Store.getUnitByDisplayId(unitDisplayId)
    || (Store.getDB('breeding_units') || []).find(u => u.display_id === unitDisplayId);

  if (!unit) {
    UI.toast('ユニットが見つかりません: ' + unitDisplayId, 'error'); return;
  }
  if (unit.status !== 'active') {
    UI.toast('このユニットは処理済みです（status: ' + unit.status + '）', 'error'); return;
  }
  if (unit.t2_done) {
    UI.toast('このユニットはT2移行済みです', 'error'); return;
  }
  // ステージが既にT2以降の場合もブロック（二重実行防止）
  if (unit.stage_phase === 'T2' || unit.stage_phase === 'T3') {
    UI.toast('このユニットはすでに' + unit.stage_phase + 'ステージです。T3移行ボタンを使ってください。', 'error'); return;
  }

  const members = _buildT2Members(unit);
  if (!members || members.length === 0) {
    UI.toast('ユニットのメンバー情報が取得できません', 'error'); return;
  }

  const originLotDisplayIds = _resolveOriginLotDisplayIds(unit);

  window._t2Session = {
    unit_id:    unit.unit_id,
    display_id: unit.display_id,
    line_id:    unit.line_id,
    stage_phase:unit.stage_phase || 'T1',
    hatch_date: unit.hatch_date  || '',
    head_count: unit.head_count  || members.length,
    origin_lots:originLotDisplayIds,
    mx_done:      false,
    exchange_type:'FULL',  // 交換種別（デフォルト全交換）
    members:      members,
    saving:     false,
    _fromInd:   false,
  };

  _saveT2SessionToStorage();
  routeTo('t2-session');
};


// ────────────────────────────────────────────────────────────────
// 個体QRスキャンからのT2セッション開始
// ────────────────────────────────────────────────────────────────
Pages.t2SessionStartFromInd = async function (indIdOrDisplayId) {
  console.log('[T2] t2SessionStartFromInd - id:', indIdOrDisplayId);

  // Store から個体を取得
  const inds = Store.getDB('individuals') || [];
  const ind = inds.find(i => i.ind_id === indIdOrDisplayId || i.display_id === indIdOrDisplayId)
    || Store.getIndividual(indIdOrDisplayId);

  if (!ind) {
    UI.toast('個体が見つかりません: ' + indIdOrDisplayId, 'error'); return;
  }

  // 個体1頭を「1頭ユニット」として擬似セッション構築
  const members = [{
    unit_slot_no:  1,
    lot_id:        ind.lot_id        || '',
    lot_item_no:   ind.lot_item_no   || '',
    lot_display_id:ind.lot_display_id || ind.lot_id || '',
    size_category: ind.size_category  || '',
    t1_weight_g:   null,
    weight_g:      null,
    sex:           ind.sex || '不明',
    status:        'normal',
    mat_molt:      true,   // モルトパウダー入り（デフォルトON）
    container:     '2.7L',
    mat_type:      '',
    decision:      null,
    memo:          '',
  }];

  // 成長記録から最新体重を取得
  const records = (typeof Store.getGrowthRecords === 'function')
    ? Store.getGrowthRecords(ind.ind_id) : [];
  if (records && records.length > 0) {
    const latest = records.filter(r => r.weight_g > 0)
      .sort((a, b) => String(b.record_date).localeCompare(String(a.record_date)))[0];
    if (latest) members[0].t1_weight_g = latest.weight_g;
  }

  window._t2Session = {
    unit_id:     ind.ind_id,
    display_id:  ind.display_id || indIdOrDisplayId,
    line_id:     ind.line_id    || '',
    stage_phase: ind.current_stage || 'T1',
    hatch_date:  ind.hatch_date   || '',
    head_count:  1,
    origin_lots: ind.lot_id ? [ind.lot_id] : [],
    mx_done:     false,
    members,
    saving:      false,
    _fromInd:    true,  // 個体スキャン起動フラグ
    ind_id:      ind.ind_id,
  };

  _saveT2SessionToStorage();
  routeTo('t2-session');
};


// ────────────────────────────────────────────────────────────────
// メンバー構築
//
// size_category の引き継ぎ優先順位:
//   1. unit.members[i].size_category  (BU レコード内メンバー配列)
//   2. unit.size_category             (BU レコード単体フラット値: 2頭同区分のケース)
//   3. 成長記録の最新 size_category   (フォールバック)
//   4. '' (未設定)
//
// weight_g は T2 で新規計測するため null でスタート。
// ────────────────────────────────────────────────────────────────
function _buildT2Members(unit) {
  // unit.members は JSON 文字列 or 配列
  let parsedMembers = [];
  const raw = unit.members;
  if (Array.isArray(raw)) {
    parsedMembers = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try { parsedMembers = JSON.parse(raw); } catch(e) { parsedMembers = []; }
  }

  // フォールバック: 単体 size_category（ユニット全体に設定されている場合）
  const unitSizeCategory = unit.size_category || '';

  // 成長記録から slot ごとの最新 size_category を取得（フォールバック用）
  const growthBySLot = _getT1GrowthBySLot(unit.unit_id);

  const count = Math.max(parseInt(unit.head_count, 10) || 2, parsedMembers.length, 1);
  const result = [];

  for (let i = 0; i < count; i++) {
    const src = parsedMembers[i] || {};
    const slotNo = i + 1;

    // size_category の優先順位解決
    const sizeCategory =
      src.size_category
      || (growthBySLot[slotNo] && growthBySLot[slotNo].size_category)
      || unitSizeCategory
      || '';

    result.push({
      unit_slot_no:  slotNo,
      lot_id:        src.lot_id         || '',
      lot_item_no:   src.lot_item_no    || '',
      lot_display_id:src.lot_display_id || src.lot_id || '',
      // T1 引き継ぎ値（初期表示・変更可）
      size_category: sizeCategory,
      // T1 体重は参照表示のみ（weight_g は T2 で新規入力）
      t1_weight_g:   src.weight_g       || (growthBySLot[slotNo] && growthBySLot[slotNo].weight_g) || null,
      // T2 入力値（空欄スタート）
      weight_g:      null,
      sex:           '不明',     // 不明 / ♂ / ♀（将来T3で引き継ぎ）
      status:        'normal',   // normal / dead
      mat_molt:      true,       // モルトパウダー入り（デフォルトON）
      container:     '2.7L',    // 個体別容器サイズ
      mat_type:      'T2',       // 個体別マット種別（T2移行デフォルトT2）
      exchange_type: 'FULL',    // 個体別交換種別（デフォルト全交換）
      decision:      null,       // continue / individualize / sale / dead
      memo:          '',
    });
  }
  return result;
}

// ── 成長記録から slot ごとの最新記録を取得 ────────────────────────
function _getT1GrowthBySLot(unitId) {
  if (!unitId) return {};
  const records = Store.getGrowthRecords ? Store.getGrowthRecords(unitId) : [];
  if (!records || records.length === 0) return {};

  const bySlot = {};
  records.forEach(r => {
    const slot = parseInt(r.unit_slot_no, 10);
    if (!slot) return;
    // 最新（record_date 降順で最初）を保持
    if (!bySlot[slot] || String(r.record_date) > String(bySlot[slot].record_date)) {
      bySlot[slot] = r;
    }
  });
  return bySlot;
}

// ── 由来ロット解決 ───────────────────────────────────────────────
function _resolveOriginLotDisplayIds(unit) {
  let srcLots = [];
  if (unit.source_lots) {
    try {
      srcLots = typeof unit.source_lots === 'string'
        ? JSON.parse(unit.source_lots) : (unit.source_lots || []);
    } catch(e) {}
  }
  if (srcLots.length > 0) {
    return srcLots.map(lid => {
      const lot = Store.getLot(lid);
      return lot ? (lot.display_id || lid) : lid;
    });
  }
  if (unit.origin_lot_id) {
    const lot = Store.getLot(unit.origin_lot_id);
    return [lot ? (lot.display_id || unit.origin_lot_id) : unit.origin_lot_id];
  }
  return [];
}

// ── 由来ロット表示文字列 ─────────────────────────────────────────
function _formatOriginLots(originLotDisplayIds) {
  if (!originLotDisplayIds || originLotDisplayIds.length === 0) return '—';
  const short = originLotDisplayIds.map(d => {
    const m = d.match(/[A-Z0-9]+-L\d+/);
    return m ? m[0] : d;
  });
  return short.join(' / ');
}

// ── sessionStorage ───────────────────────────────────────────────
function _saveT2SessionToStorage() {
  try { sessionStorage.setItem('_t2SessionData', JSON.stringify(window._t2Session)); } catch(e) {}
}
function _restoreT2SessionFromStorage() {
  try {
    const raw = sessionStorage.getItem('_t2SessionData');
    if (raw) window._t2Session = JSON.parse(raw);
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════════
// メイン画面
// ════════════════════════════════════════════════════════════════
Pages.t2Session = function (params = {}) {
  if (!window._t2Session) _restoreT2SessionFromStorage();
  if (!window._t2Session) { routeTo('qr-scan', { mode: 't2' }); return; }
  _renderT2Session(window._t2Session);
};

function _renderT2Session(s) {
  const main = document.getElementById('main');
  if (!main) return;

  const line      = Store.getLine(s.line_id);
  const lineDisp  = line ? (line.line_code || line.display_id) : s.line_id;
  const originStr = _formatOriginLots(s.origin_lots);
  const nextPhase = _nextStagePhase(s.stage_phase);
  const allInputComplete = s.members.every(m => _isT2MemberComplete(m));
  const canSave   = allInputComplete && !s.saving;

  // 保存中スピナー
  if (s.saving) {
    main.innerHTML = `
      ${UI.header('T2移行編成セッション', { back: false })}
      <div class="page-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:16px">
        <div class="spinner" style="width:44px;height:44px;border-width:4px"></div>
        <div style="font-size:.9rem;color:var(--text2);font-weight:600">T2移行を保存中...</div>
        <div style="font-size:.75rem;color:var(--text3)">${s.display_id}</div>
      </div>`;
    return;
  }

  main.innerHTML = `
    ${UI.header('T2移行編成セッション', { back: true, backFn: "Pages._t2SessionBack()" })}
    <div class="page-body" style="padding-bottom:84px">

      <!-- ① ユニット概要バナー -->
      <div style="background:var(--surface2);border-radius:10px;padding:12px 14px;font-size:.8rem">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-weight:700;color:var(--gold);font-family:var(--font-mono);font-size:.9rem">${s.display_id}</span>
          <span style="background:rgba(91,168,232,.15);color:var(--blue);padding:2px 8px;border-radius:5px;font-size:.72rem;font-weight:700">
            ${s.stage_phase} → ${nextPhase}
          </span>
          <span style="color:var(--text3)">${lineDisp}　${s.head_count}頭</span>
        </div>
        ${s.hatch_date ? `<div style="font-size:.72rem;color:var(--text3)">孵化: ${s.hatch_date}</div>` : ''}
        <div style="font-size:.72rem;color:var(--text3)">由来ロット: ${originStr}</div>
      </div>

      <!-- ② 運用説明 -->
      <div style="background:rgba(91,168,232,.07);border:1px solid rgba(91,168,232,.25);border-radius:8px;padding:10px 12px;margin-top:8px;font-size:.76rem;color:var(--text2);line-height:1.6">
        <b>T1→T2移行</b>を確定します。<br>
        継続する場合も、個別化・販売候補・死亡の場合もすべてここで選んで保存してください。<br>
        <span style="color:var(--text3)">※ T2移行後の通常交換は「継続読取りモード」を使います。</span>
      </div>

      <!-- ③ ユニット共通設定カード -->
      <div style="margin-top:8px;border-radius:10px;border:1.5px solid var(--border);
        background:var(--surface1,var(--surface));padding:12px 14px">

        <!-- マット種別 一括 -->
        <div style="font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:6px">
          🌿 マット種別 — 一括設定
          <span style="font-size:.62rem;font-weight:400;color:var(--text3);margin-left:4px">個体カードで個別変更可</span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px">
          ${['T1','T2','T3','MD'].map(v => `
            <button type="button" onclick="Pages._t2SetMatAll('${v}')"
              style="flex:1;padding:10px 0;border-radius:8px;font-size:.9rem;font-weight:700;cursor:pointer;
                border:2px solid ${s.members.length && s.members.every(m=>m.mat_type===v||m.status==='dead') ? 'var(--green)' : 'var(--border)'};
                background:${s.members.length && s.members.every(m=>m.mat_type===v||m.status==='dead') ? 'rgba(76,175,120,.15)' : 'var(--bg2)'};
                color:${s.members.length && s.members.every(m=>m.mat_type===v||m.status==='dead') ? 'var(--green)' : 'var(--text2)'}">
              ${v}
            </button>
          `).join('')}
        </div>

        <!-- 交換種別 一括 -->
        <div style="font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:6px">
          🔄 交換種別 — 一括設定
          <span style="font-size:.62rem;font-weight:400;color:var(--text3);margin-left:4px">個体カードで個別変更可</span>
        </div>
        <div style="display:flex;gap:8px">
          ${[{v:'FULL',l:'全交換'},{v:'PARTIAL',l:'追加のみ'},{v:'NONE',l:'なし'}].map(x => `
            <button type="button" onclick="Pages._t2SetExchangeAll('${x.v}')"
              style="flex:1;padding:10px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
                border:2px solid ${s.exchange_type===x.v ? 'var(--green)' : 'var(--border)'};
                background:${s.exchange_type===x.v ? 'rgba(76,175,120,.15)' : 'var(--bg2)'};
                color:${s.exchange_type===x.v ? 'var(--green)' : 'var(--text2)'}">
              ${x.l}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- ③ 個体ブロック（縦カード） -->
      ${s.members.map((m, i) => _renderT2MemberCard(m, i, s)).join('')}

      <!-- ④ 判断サマリ -->
      ${_renderT2Summary(s)}

      <!-- ⑤ 未完了警告 -->
      ${(!allInputComplete && s.members.some(m => m.decision !== null)) ? `
      <div style="background:rgba(224,144,64,.08);border:1px solid rgba(224,144,64,.3);border-radius:8px;padding:10px 12px;margin-top:8px;font-size:.78rem;color:var(--amber)">
        ⚠️ 全頭の判断が完了していません。体重・判断を確認してください。
      </div>` : ''}

    </div>

    <!-- 固定フッター -->
    <div class="quick-action-bar">
      <button class="btn btn-ghost" style="flex:1;padding:14px 0"
        onclick="Pages._t2SessionCancel()">破棄</button>
      <button class="btn btn-gold" style="flex:2;padding:14px 0;font-weight:700;font-size:.95rem"
        ${canSave ? '' : 'disabled'}
        onclick="Pages._t2SessionSave()">
        💾 T2移行を確定
      </button>
    </div>`;

  _saveT2SessionToStorage();
}

// ── 個体カード（縦4段構成） ──────────────────────────────────────
function _renderT2MemberCard(m, idx, s) {
  const isDead    = m.status === 'dead';
  const slotLabel = idx === 0 ? '1頭目' : idx === 1 ? '2頭目' : `${idx + 1}頭目`;
  // 前回体重（T1時）
  const prevWeight = m.weight_g_t1 || m.prev_weight_g || null;

  // カードの状態に応じたスタイル
  const isComplete  = _isT2MemberComplete(m);
  const cardBorder  = isDead
    ? 'rgba(224,80,80,.35)'
    : (isComplete ? 'rgba(76,175,120,.35)' : 'var(--border)');
  const cardBg      = isDead
    ? 'rgba(224,80,80,.04)'
    : (isComplete ? 'rgba(76,175,120,.04)' : 'var(--surface1,var(--surface))');

  // ── 区分ボタン（T1 引き継ぎ値が初期選択済み、変更可） ──
  const sizeBtns = ['大', '中', '小'].map(sz => {
    const on = m.size_category === sz;
    return `<button type="button"
      onclick="Pages._t2SetSize(${idx},'${sz}')"
      style="min-width:48px;padding:8px 10px;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? 'var(--green)' : 'var(--border)'};
        background:${on ? 'var(--green)' : 'var(--bg2)'};
        color:${on ? '#fff' : 'var(--text2)'};
        opacity:${isDead ? '.3' : '1'};
        pointer-events:${isDead ? 'none' : 'auto'}"
      ${isDead ? 'disabled' : ''}>${sz}</button>`;
  }).join('');

  // T1 体重の参照表示（記録がある場合のみ）
  // 前回体重（T1時）の表示：前回値 + 今回入力があれば増減も表示
  let t1WeightRef = '';
  if (m.t1_weight_g) {
    const diff = (m.weight_g && m.t1_weight_g)
      ? (Number(m.weight_g) - Number(m.t1_weight_g)) : null;
    const diffStr = diff !== null
      ? (diff >= 0
          ? `<span style="color:var(--green);font-weight:700"> +${diff}g</span>`
          : `<span style="color:var(--red,#e05050);font-weight:700"> ${diff}g</span>`)
      : '';
    t1WeightRef = `<div style="font-size:.65rem;color:var(--text3);margin-top:3px;text-align:right">
      前回: <b style="color:var(--text2)">${m.t1_weight_g}g</b>${diffStr}
    </div>`;
  }

  // ── 性別ボタン ──
  const sexOptions = ['不明', '♂', '♀'];
  const sexBtns = sexOptions.map(sx => {
    const on = m.sex === sx;
    const col = sx === '♂' ? '#3366cc' : sx === '♀' ? '#cc3366' : 'var(--text3)';
    return `<button type="button"
      onclick="Pages._t2SetSex(${idx},'${sx}')"
      style="flex:1;padding:7px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? col : 'var(--border)'};
        background:${on ? (sx==='♂'?'rgba(51,102,204,.15)':sx==='♀'?'rgba(204,51,102,.15)':'var(--surface2)') : 'var(--bg2)'};
        color:${on ? col : 'var(--text2)'};
        opacity:${isDead ? '.3' : '1'};pointer-events:${isDead ? 'none' : 'auto'}"
      ${isDead ? 'disabled' : ''}>${sx}</button>`;
  }).join('');

  // ── 状態ボタン ──
  const statusBtns = [
    { key: 'normal', lbl: '通常',    activeColor: 'var(--green)',        activeBg: 'var(--green)',            textOn: '#fff' },
    { key: 'dead',   lbl: '💀 死亡', activeColor: 'var(--red,#e05050)',  activeBg: 'rgba(224,80,80,.18)',     textOn: 'var(--red,#e05050)' },
  ].map(({ key, lbl, activeColor, activeBg, textOn }) => {
    const on = m.status === key;
    return `<button type="button"
      onclick="Pages._t2SetStatus(${idx},'${key}')"
      style="flex:1;padding:9px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? activeColor : 'var(--border)'};
        background:${on ? activeBg : 'var(--bg2)'};
        color:${on ? textOn : 'var(--text2)'}">${lbl}</button>`;
  }).join('');

  // ── 判断ボタン（死亡時は非表示） ──
  const decisionDefs = [
    { key: 'continue',      lbl: '継続',     color: 'var(--blue)',  bg: 'rgba(91,168,232,.18)',  desc: '→ T2マットで2頭継続飼育します' },
    { key: 'individualize', lbl: '個別化',   color: 'var(--green)', bg: 'rgba(76,175,120,.18)',  desc: '→ 個体台帳に登録して個別飼育へ' },
    { key: 'sale',          lbl: '販売候補', color: 'var(--amber)', bg: 'rgba(224,144,64,.18)',  desc: '→ 販売候補として個体台帳に登録' },
  ];
  const decisionBtns = decisionDefs.map(({ key, lbl, color, bg }) => {
    const on = m.decision === key;
    return `<button type="button"
      onclick="Pages._t2SetDecision(${idx},'${key}')"
      style="flex:1;padding:9px 0;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? color : 'var(--border)'};
        background:${on ? bg : 'var(--bg2)'};
        color:${on ? color : 'var(--text2)'}">${lbl}</button>`;
  }).join('');

  const selectedDecision = decisionDefs.find(d => d.key === m.decision);

  // 完了バッジ
  const completeBadge = isComplete
    ? `<span style="font-size:.65rem;padding:2px 8px;border-radius:10px;font-weight:700;
        background:${isDead ? 'rgba(224,80,80,.12)' : 'rgba(76,175,120,.12)'};
        color:${isDead ? 'var(--red,#e05050)' : 'var(--green)'}">
        ${isDead ? '💀 死亡' : '✅ 確定'}</span>`
    : `<span style="font-size:.65rem;padding:2px 8px;border-radius:10px;font-weight:700;
        background:rgba(224,144,64,.12);color:var(--amber)">未確定</span>`;

  // 元ロット情報
  const lotInfo = (m.lot_display_id || m.lot_id)
    ? `<div style="font-size:.65rem;color:var(--text3);margin-bottom:6px">
        元ロット: ${m.lot_display_id || m.lot_id}${m.lot_item_no ? ' #' + m.lot_item_no : ''}
       </div>`
    : '';

  return `
  <div style="margin-top:10px;border-radius:12px;border:2px solid ${cardBorder};background:${cardBg};overflow:hidden">

    <!-- ヘッダー -->
    <div style="padding:10px 14px 8px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border2)">
      <span style="font-size:.95rem;font-weight:800;color:var(--text1)">${slotLabel}</span>
      ${completeBadge}
    </div>

    <!-- 1段目: 区分（T1引き継ぎ・変更可）+ 体重（T2新規入力） -->
    <div style="padding:10px 14px 10px;border-bottom:1px solid var(--border2)">
      ${lotInfo}
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <!-- 区分ボタン -->
        <div style="display:flex;gap:6px">${sizeBtns}</div>
        <!-- 体重入力 + 前回体重 -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;margin-left:auto">
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" inputmode="numeric" min="1" max="999" step="1"
              placeholder="体重"
              value="${m.weight_g !== null ? m.weight_g : ''}"
              style="width:76px;padding:8px 6px;text-align:center;border-radius:8px;
                border:2px solid ${m.weight_g ? 'var(--green)' : 'var(--border)'};
                background:var(--bg2);font-size:1rem;font-weight:700;color:var(--text1);
                opacity:${isDead ? '.3' : '1'};pointer-events:${isDead ? 'none' : 'auto'}"
              ${isDead ? 'disabled' : ''}
              onblur="Pages._t2CommitWeight(${idx},this.value)"
              onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}">
            <span style="font-size:.8rem;color:var(--text3);font-weight:600">g</span>
          </div>
          ${t1WeightRef}
        </div>
      </div>
    </div>

    <!-- 1.5段目: 性別 -->
    ${!isDead ? `
    <div style="padding:8px 14px 10px;border-bottom:1px solid var(--border2)">
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:7px;text-transform:uppercase;letter-spacing:.05em">性別</div>
      <div style="display:flex;gap:6px">${sexBtns}</div>
    </div>` : ''}

    <!-- 2段目: 状態 -->
    <div style="padding:10px 14px 10px;border-bottom:1px solid var(--border2)">
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:7px;text-transform:uppercase;letter-spacing:.05em">状態</div>
      <div style="display:flex;gap:8px">${statusBtns}</div>
      ${isDead ? `<div style="font-size:.72rem;color:var(--red,#e05050);margin-top:7px;opacity:.85">死亡として記録します（体重・判断の入力不要）</div>` : ''}
    </div>

    <!-- 3段目: 判断（通常時のみ表示） -->
    ${!isDead ? `
    <div style="padding:10px 14px 10px;border-bottom:1px solid var(--border2)">
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:7px;text-transform:uppercase;letter-spacing:.05em">判断</div>
      <div style="display:flex;gap:6px">${decisionBtns}</div>
      ${selectedDecision ? `<div style="font-size:.7rem;color:var(--text3);margin-top:6px">${selectedDecision.desc}</div>` : ''}
    </div>` : ''}

    <!-- 3.5段目: 容器・マット・Mx（通常時のみ） -->
    ${!isDead ? `
    <div style="padding:8px 14px 10px;border-bottom:1px solid var(--border2)">
      <!-- 容器サイズ -->
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:5px">📦 容器</div>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        ${['1.8L','2.7L','4.8L'].map(v => `
          <button type="button" onclick="Pages._t2SetMemberContainer(${idx},'${v}')"
            style="flex:1;padding:7px 0;border-radius:7px;font-size:.82rem;font-weight:700;cursor:pointer;
              border:2px solid ${m.container===v ? 'var(--green)' : 'var(--border)'};
              background:${m.container===v ? 'rgba(76,175,120,.15)' : 'var(--bg2)'};
              color:${m.container===v ? 'var(--green)' : 'var(--text2)'}">${v}</button>
        `).join('')}
      </div>
      <!-- マット種別 -->
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:5px">
        🌿 マット
        <span style="font-weight:400;margin-left:4px">（空=自動）</span>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        ${['T1','T2','T3','MD'].map(v => `
          <button type="button" onclick="Pages._t2SetMemberMat(${idx},'${v}')"
            style="flex:1;padding:7px 0;border-radius:7px;font-size:.82rem;font-weight:700;cursor:pointer;
              border:2px solid ${m.mat_type===v ? 'var(--green)' : 'var(--border)'};
              background:${m.mat_type===v ? 'rgba(76,175,120,.15)' : 'var(--bg2)'};
              color:${m.mat_type===v ? 'var(--green)' : 'var(--text2)'}">
            ${v}
          </button>
        `).join('')}
      </div>
      <!-- モルトパウダー記録 -->
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:5px">
        🧪 モルトパウダー（記録）
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <!-- トグルスイッチ -->
        <div onclick="Pages._t2SetMolt(${idx},${!m.mat_molt})"
          style="cursor:pointer;width:52px;height:28px;border-radius:14px;position:relative;flex-shrink:0;
            background:${m.mat_molt ? 'var(--green)' : 'rgba(128,128,128,.25)'};
            transition:background .2s">
          <div style="position:absolute;top:3px;left:${m.mat_molt ? '27px' : '3px'};
            width:22px;height:22px;border-radius:50%;background:#fff;
            box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .2s"></div>
        </div>
        <span style="font-size:.85rem;font-weight:700;color:${m.mat_molt ? 'var(--green)' : 'var(--text3)'}">
          ${m.mat_molt ? '🧪 使用する（記録ON）' : '使用しない（記録OFF）'}
        </span>
      </div>
      <!-- 交換種別（個別） -->
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:5px">
        🔄 交換種別
        <span style="font-size:.62rem;font-weight:400;margin-left:3px">${m.exchange_type==='FULL'?'全交換':m.exchange_type==='PARTIAL'?'追加のみ':'なし'}</span>
      </div>
      <div style="display:flex;gap:6px">
        ${[{v:'FULL',l:'全交換'},{v:'PARTIAL',l:'追加のみ'},{v:'NONE',l:'なし'}].map(x => `
          <button type="button" onclick="Pages._t2SetMemberExchange(${idx},'${x.v}')"
            style="flex:1;padding:7px 0;border-radius:7px;font-size:.78rem;font-weight:700;cursor:pointer;
              border:2px solid ${m.exchange_type===x.v ? 'var(--green)' : 'var(--border)'};
              background:${m.exchange_type===x.v ? 'rgba(76,175,120,.15)' : 'var(--bg2)'};
              color:${m.exchange_type===x.v ? 'var(--green)' : 'var(--text2)'}">${x.l}</button>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- 4段目: メモ -->
    <div style="padding:8px 14px 10px">
      <input type="text" placeholder="メモ（任意）"
        value="${m.memo || ''}"
        style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);
          background:var(--bg2);font-size:.82rem;color:var(--text1);box-sizing:border-box"
        oninput="Pages._t2SetMemo(${idx},this.value)">
    </div>

  </div>`;
}

// ── サマリ ───────────────────────────────────────────────────────
function _renderT2Summary(s) {
  const cnt = {
    continue:     s.members.filter(m => m.decision === 'continue').length,
    individualize:s.members.filter(m => m.decision === 'individualize').length,
    sale:         s.members.filter(m => m.decision === 'sale').length,
    dead:         s.members.filter(m => m.decision === 'dead').length,
    undecided:    s.members.filter(m => m.decision === null).length,
  };
  const allDone = cnt.undecided === 0;

  return `
  <div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-top:12px">
    <div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:8px">判断サマリ</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.8rem">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--blue);flex-shrink:0"></span>
        <span>継続</span><b style="margin-left:auto;color:var(--blue)">${cnt.continue}頭</b>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--green);flex-shrink:0"></span>
        <span>個別化</span><b style="margin-left:auto;color:var(--green)">${cnt.individualize}頭</b>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--amber);flex-shrink:0"></span>
        <span>販売候補</span><b style="margin-left:auto;color:var(--amber)">${cnt.sale}頭</b>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--red,#e05050);flex-shrink:0"></span>
        <span>死亡</span><b style="margin-left:auto;color:var(--red,#e05050)">${cnt.dead}頭</b>
      </div>
    </div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border2);font-size:.75rem;
      color:${allDone ? 'var(--green)' : 'var(--amber)'}">
      ${allDone ? '✅ 全頭の判断が完了しています' : `⚠️ 未判断: ${cnt.undecided}頭`}
    </div>
  </div>`;
}

// ── 次フェーズ ───────────────────────────────────────────────────
function _nextStagePhase(current) {
  const map = { T1: 'T2', T2: 'T3', T3: 'T3（最終）' };
  return map[current] || current + '→次';
}

// ── 入力完了判定 ─────────────────────────────────────────────────
// dead → weight 不要 → complete
// それ以外 → decision 必須 + weight 必須
function _isT2MemberComplete(m) {
  if (m.decision === 'dead') return true;
  if (m.decision === null)   return false;
  return m.weight_g !== null && m.weight_g > 0;
}

// ════════════════════════════════════════════════════════════════
// アクションハンドラ
// ════════════════════════════════════════════════════════════════

Pages._t2SetSize = function (idx, size) {
  const s = window._t2Session;
  if (!s) return;
  if (s.members[idx].status === 'dead') return;
  // 同じボタンを押したらトグル解除
  s.members[idx].size_category = s.members[idx].size_category === size ? '' : size;
  _renderT2Session(s);
};

Pages._t2SetStatus = function (idx, status) {
  const s = window._t2Session;
  if (!s) return;
  s.members[idx].status = status;
  if (status === 'dead') {
    // 死亡確定: decision を 'dead' に固定し体重・区分をクリア
    s.members[idx].decision      = 'dead';
    s.members[idx].weight_g      = null;
    s.members[idx].size_category = '';
  } else {
    // 通常に戻したとき: 死亡判断のみリセット（他の判断は保持）
    if (s.members[idx].decision === 'dead') {
      s.members[idx].decision = null;
    }
  }
  _renderT2Session(s);
};

Pages._t2SetDecision = function (idx, decision) {
  const s = window._t2Session;
  if (!s) return;
  if (s.members[idx].status === 'dead') return; // 死亡時は操作不可
  s.members[idx].decision = decision;
  _renderT2Session(s);
};

Pages._t2CommitWeight = function (idx, val) {
  const s = window._t2Session;
  if (!s) return;
  const n = parseInt(val, 10);
  const newW = (!val || isNaN(n) || n <= 0) ? null : Math.min(999, n);
  if (s.members[idx].weight_g === newW) return;
  s.members[idx].weight_g = newW;
  _saveT2SessionToStorage();
  clearTimeout(Pages._t2RefreshTimer);
  Pages._t2RefreshTimer = setTimeout(() => _renderT2Session(window._t2Session), 200);
};

Pages._t2SetSex = function (idx, sex) {
  const s = window._t2Session;
  if (!s || s.members[idx].status === 'dead') return;
  s.members[idx].sex = sex;
  _saveT2SessionToStorage();
  // 性別はサマリに影響しないので軽量更新（再描画不要）
  // ボタンのスタイルだけ切り替えたい場合は再描画する
  _renderT2Session(s);
};

Pages._t2SetMemo = function (idx, val) {
  const s = window._t2Session;
  if (s) { s.members[idx].memo = val; _saveT2SessionToStorage(); }
};

// ── 戻る / 破棄 ─────────────────────────────────────────────────
Pages._t2SessionBack = function () {
  if (confirm('セッションを中断しますか？（入力内容は一時保存されます）')) {
    routeTo('qr-scan', { mode: 't2' });
  }
};

Pages._t2SessionCancel = function () {
  if (confirm('セッションを破棄しますか？（入力内容は消えます）')) {
    window._t2Session = null;
    sessionStorage.removeItem('_t2SessionData');
    routeTo('qr-scan', { mode: 't2' });
  }
};

// ── 容器サイズ ────────────────────────────────────────────────────
Pages._t2SetContainer = function(v) {
  const s = window._t2Session;
  if (!s) return;
  s.container = (s.container === v) ? '' : v;
  _renderT2Session(s);
};
// ── モルトパウダー一括設定 ─────────────────────────────────────────
// ── T2 ラベル発行 / QR遷移 ──────────────────────────────────────
Pages._t2GoQR = function() {
  window._t2PendingLabels = null;
  routeTo('qr-scan', { mode: 't2' });
};

Pages._t2LaunchAllLabels = function() {
  const pending = window._t2PendingLabels;
  if (!pending || !pending.indIds || pending.indIds.length === 0) {
    Pages._t2GoQR(); return;
  }
  window._t2PendingLabels = null;
  const indIds = pending.indIds;
  let idx = 0;

  function _next() {
    if (idx >= indIds.length) {
      UI.toast('全' + indIds.length + '枚のラベル発行が完了しました ✅', 'success');
      routeTo('qr-scan', { mode: 't2' });
      return;
    }
    const indId = indIds[idx++];
    const ind = typeof Store.getIndividual === 'function' ? Store.getIndividual(indId) : null;
    if (!ind) { _next(); return; }
    window._t2LabelNextFn = _next;
    window._t2LabelTotalCount = indIds.length;
    window._t2LabelCurrentIdx = idx - 1;
    routeTo('label-gen', {
      targetType:   'IND',
      targetId:     ind.ind_id,
      _t2LabelMode: true,
      _t2LabelIdx:  idx - 1,
      _t2LabelTotal:indIds.length,
    });
  }
  _next();
};

Pages._t2SetMxAll = function(val) {
  const s = window._t2Session;
  if (!s) return;
  s.members.forEach(m => { if (m.status !== 'dead') m.mat_molt = val; });
  _renderT2Session(s);
};
// ── 個体別モルト設定 ────────────────────────────────────────────────
Pages._t2SetMemberContainer = function(idx, v) {
  const s = window._t2Session;
  if (!s) return;
  const m = s.members[idx];
  if (m) { m.container = (m.container === v) ? '' : v; _renderT2Session(s); }
};
Pages._t2SetMemberMat = function(idx, v) {
  const s = window._t2Session;
  if (!s) return;
  const m = s.members[idx];
  if (m) { m.mat_type = v; _renderT2Session(s); }
};
Pages._t2SetMolt = function(idx, val) {
  const s = window._t2Session;
  if (!s) return;
  const m = s.members[idx];
  if (m) { m.mat_molt = val; _renderT2Session(s); }
};

Pages._t2SetMatType = function(v) {
  const s = window._t2Session;
  if (!s) return;
  s.mat_type = v;  // 空文字=自動
  _renderT2Session(s);
};
// マット種別: 一括設定（共通設定ボタン用）
Pages._t2SetMatAll = function(v) {
  const s = window._t2Session;
  if (!s) return;
  s.mat_type = v;
  s.members.forEach(function(m) { if (m.status !== 'dead') m.mat_type = v; });
  _renderT2Session(s);
};

// 交換種別: 一括設定（共通設定ボタン用）
Pages._t2SetExchangeAll = function(v) {
  const s = window._t2Session;
  if (!s) return;
  s.exchange_type = v;  // 共通値を更新
  s.members.forEach(function(m) { if (m.status !== 'dead') m.exchange_type = v; });
  _renderT2Session(s);
};
// 後方互換（旧コードから呼ばれる場合）
Pages._t2SetExchange = function(v) { Pages._t2SetExchangeAll(v); };
// 交換種別: 個別設定（個体カードボタン用）
Pages._t2SetMemberExchange = function(idx, v) {
  const s = window._t2Session;
  if (!s) return;
  const m = s.members[idx];
  if (m) { m.exchange_type = v; _renderT2Session(s); }
};
Pages._t2ToggleDetail = function() {
  const s = window._t2Session;
  if (!s) return;
  s._showDetail = !s._showDetail;
  _renderT2Session(s);
};

// ── Mx フラグ ─────────────────────────────────────────────────────
Pages._t2SetMx = function (done) {
  const s = window._t2Session;
  if (!s) return;
  s.mx_done = done;
  _renderT2Session(s);
};

// ── 保存 ────────────────────────────────────────────────────────
Pages._t2SessionSave = async function () {
  const s = window._t2Session;
  if (!s || s.saving) return;

  // ── 保存前診断ログ（通信トラブル切り分け用） ──
  console.log('[T2_SAVE] ===== save triggered =====');
  console.log('[T2_SAVE] window.__API_BUILD :', window.__API_BUILD || '(not set - OLD api.js!)');
  console.log('[T2_SAVE] typeof API        :', typeof API);
  console.log('[T2_SAVE] typeof API.t2     :', typeof (window.API && window.API.t2));
  console.log('[T2_SAVE] typeof API.t2.createSession:', typeof (window.API && window.API.t2 && window.API.t2.createSession));
  console.log('[T2_SAVE] CONFIG.GAS_URL    :', (window.CONFIG && window.CONFIG.GAS_URL || '').slice(0,80) || '(unset)');
  console.log('[T2_SAVE] session            :', { unit_id: s.unit_id, display_id: s.display_id, membersCount: s.members.length });

  if (!s.members.every(m => _isT2MemberComplete(m))) {
    UI.toast('全頭の判断を完了してください（体重も入力してください）', 'error'); return;
  }

  const continueCount     = s.members.filter(m => m.decision === 'continue').length;
  const individualizeCount= s.members.filter(m => m.decision === 'individualize').length;
  const saleCount         = s.members.filter(m => m.decision === 'sale').length;
  const deadCount         = s.members.filter(m => m.decision === 'dead').length;
  const nextPhase         = _nextStagePhase(s.stage_phase);

  const confirmMsg =
    `T2移行を確定します（取り消せません）\n\n` +
    `ユニット: ${s.display_id}\n` +
    `由来ロット: ${_formatOriginLots(s.origin_lots)}\n\n` +
    `継続: ${continueCount}頭 → ${nextPhase}ユニット維持\n` +
    `個別化: ${individualizeCount}頭 → 個体台帳へ\n` +
    `販売候補: ${saleCount}頭\n` +
    `死亡: ${deadCount}頭`;

  if (!confirm(confirmMsg)) return;

  s.saving = true;
  _renderT2Session(s);

  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');

    // payload: dead の場合は weight_g / size_category を null で送る
    const payload = {
      transaction_type:       'T2_SESSION',
      session_date:           today,
      source_unit_id:         s.unit_id,
      source_unit_display_id: s.display_id,
      mx_done:                s.mx_done || false,
      exchange_type:          s.exchange_type || 'FULL',
      from_individual:        s._fromInd || false,
      decisions: s.members.map(m => ({
        unit_slot_no:  m.unit_slot_no,
        decision:      m.decision,
        weight_g:      m.decision === 'dead' ? null : m.weight_g,
        size_category: m.decision === 'dead' ? null : (m.size_category || null),
        sex:           m.decision === 'dead' ? '不明' : (m.sex || '不明'),
        lot_id:        m.lot_id      || '',
        lot_item_no:   m.lot_item_no || '',
        memo:          m.memo        || '',
        mat_molt:      m.mat_molt      !== undefined ? m.mat_molt  : true,
        container:     m.container     || '2.7L',
        mat_type:      m.mat_type       || 'T2',
        exchange_type: m.exchange_type  || s.exchange_type || 'FULL',
      })),
    };

    console.log('[T2] save payload', payload);
    const res = await API.t2.createSession(payload);
    console.log('[T2] save response', res);

    // ── Store を更新 ──────────────────────────────────────────────
    // セッションのmembersをStoreに反映（GASレスポンス待たずに即反映）
    const _sessionMembers = s.members
      .filter(m => m.decision !== 'dead')
      .map(m => ({
        unit_slot_no:  m.unit_slot_no,
        lot_id:        m.lot_id        || '',
        lot_item_no:   m.lot_item_no   || '',
        lot_display_id:m.lot_display_id|| '',
        size_category: m.size_category || '',
        weight_g:      m.weight_g      || null,
        sex:           m.sex           || '不明',
        memo:          m.memo          || '',
      }));

    const _unitPatch = {
      t2_done:     true,
      stage_phase: 'T2',
      status:      'active',
      members:     JSON.stringify(_sessionMembers),
    };

    if (res && res.updated_unit) {
      // GASレスポンスがあればそちらを優先（membersがあれば使う）
      const _merged = Object.assign({}, _unitPatch, res.updated_unit);
      // membersが空文字/'[]'の場合はセッションデータを使う
      if (!_merged.members || _merged.members === '[]' || _merged.members === '') {
        _merged.members = JSON.stringify(_sessionMembers);
      }
      if (typeof Store.patchDBItem === 'function') {
        Store.patchDBItem('breeding_units', 'unit_id', s.unit_id, _merged);
      } else {
        const units = (Store.getDB('breeding_units') || []).map(u =>
          u.unit_id === s.unit_id ? Object.assign({}, u, _merged) : u
        );
        Store.setDB('breeding_units', units);
      }
    } else {
      // GASレスポンスなし: セッションデータだけで更新
      if (typeof Store.patchDBItem === 'function') {
        Store.patchDBItem('breeding_units', 'unit_id', s.unit_id, _unitPatch);
      } else {
        const units = (Store.getDB('breeding_units') || []).map(u =>
          u.unit_id === s.unit_id ? Object.assign({}, u, _unitPatch) : u
        );
        Store.setDB('breeding_units', units);
      }
    }
    if (res && Array.isArray(res.created_individuals)) {
      res.created_individuals.forEach(ind => {
        if (typeof Store.addDBItem === 'function') Store.addDBItem('individuals', ind);
      });
    }

    window._t2Session = null;
    sessionStorage.removeItem('_t2SessionData');
    UI.toast('T2移行を完了しました ✅', 'success', 3000);

    // ★ 個別化個体がある場合: 確認なしで即ラベル発行へ
    const _indMembers = s.members.filter(function(m){ return m.decision === 'individualize'; });
    const _createdInds = (res && Array.isArray(res.created_individuals)) ? res.created_individuals : [];
    if (_indMembers.length > 0 && _createdInds.length > 0) {
      const _indIds = _createdInds.map(function(i){ return i.ind_id; });
      window._t2PendingLabels = { indIds: _indIds, inds: _createdInds, members: _indMembers };
      // 確認なしで即ラベル発行開始
      Pages._t2LaunchAllLabels();
    } else {
      routeTo('qr-scan', { mode: 't2' });
    }

  } catch (e) {
    console.error('[T2] save error:', e);
    s.saving = false;
    _renderT2Session(s);
    UI.toast('保存失敗: ' + (e.message || '通信エラー'), 'error', 5000);
  }
};

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['t2-session'] = function () {
  Pages.t2Session(Store.getParams());
};


// ────────────────────────────────────────────────────────────────
// FILE: js/pages/t3_session.js
