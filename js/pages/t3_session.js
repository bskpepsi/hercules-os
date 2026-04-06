// ════════════════════════════════════════════════════════════════
// t3_session.js — T3（3齢後期）移行セッション画面
// build: 20260413a
//
// 概念:
//   T3 = 3齢後期（L3後期）。最も体重が乗り、
//   最終的なマット調整を行う極めて重要な管理ステージ。
//   前蛹（PREPUPA）への移行ではない。
//
// 運用ルール:
//   - T2→T3 はこの画面で確定
//   - マット交換（Mx）の有無を記録する
//   - 体重を計測して記録（T3は体重管理が特に重要）
//   - 状態 (通常/死亡) と 判断 (継続/個別化/販売候補) を記録
//   - 個別化済みユニットも T3 として管理継続可能
//
// 前提:
//   - 対象: T2 ステージの飼育ユニット（BU）
//   - QRスキャン → Pages.t3SessionStart(unitDisplayId) で開始
// ════════════════════════════════════════════════════════════════
'use strict';

window._t3Session = window._t3Session || null;

// ────────────────────────────────────────────────────────────────
// セッション開始エントリーポイント（scan.js から呼ばれる）
// ────────────────────────────────────────────────────────────────
Pages.t3SessionStart = async function (unitDisplayId) {
  console.log('[T3] t3SessionStart - displayId:', unitDisplayId);

  const unit = (typeof Store.getUnitByDisplayId === 'function'
    ? Store.getUnitByDisplayId(unitDisplayId)
    : null)
    || (Store.getDB('breeding_units') || []).find(u => u.display_id === unitDisplayId);

  if (!unit) {
    UI.toast('ユニットが見つかりません: ' + unitDisplayId, 'error'); return;
  }
  if (unit.status !== 'active') {
    UI.toast('このユニットは処理済みです（status: ' + unit.status + '）', 'error'); return;
  }
  // T3以降のステージは再移行を防止
  if (unit.stage_phase === 'T3') {
    if (!confirm('このユニットはすでにT3ステージです。\n再度T3移行を実行しますか？（Mx/体重更新として記録されます）')) return;
  }

  const members = _buildT3Members(unit);
  if (!members || members.length === 0) {
    UI.toast('ユニットのメンバー情報が取得できません', 'error'); return;
  }

  const originLotDisplayIds = _resolveT3OriginLotDisplayIds(unit);

  window._t3Session = {
    unit_id:     unit.unit_id,
    display_id:  unit.display_id,
    line_id:     unit.line_id,
    stage_phase: unit.stage_phase || 'T2',
    hatch_date:  unit.hatch_date  || '',
    head_count:  unit.head_count  || members.length,
    origin_lots: originLotDisplayIds,
    mx_done:     false,
    members:     members,
    saving:      false,
    _fromInd:    false,
  };

  _saveT3SessionToStorage();
  routeTo('t3-session');
};


// ────────────────────────────────────────────────────────────────
// 個体QRスキャンからのT3セッション開始
// ────────────────────────────────────────────────────────────────
Pages.t3SessionStartFromInd = async function (indIdOrDisplayId) {
  console.log('[T3] t3SessionStartFromInd - id:', indIdOrDisplayId);

  const inds = Store.getDB('individuals') || [];
  const ind = inds.find(i => i.ind_id === indIdOrDisplayId || i.display_id === indIdOrDisplayId)
    || (typeof Store.getIndividual === 'function' ? Store.getIndividual(indIdOrDisplayId) : null);

  if (!ind) {
    UI.toast('個体が見つかりません: ' + indIdOrDisplayId, 'error'); return;
  }

  // 成長記録から最新体重を取得
  const records = (typeof Store.getGrowthRecords === 'function')
    ? Store.getGrowthRecords(ind.ind_id) : [];
  var t2Weight = null;
  if (records && records.length > 0) {
    const latest = records.filter(r => r.weight_g > 0)
      .sort((a, b) => String(b.record_date).localeCompare(String(a.record_date)))[0];
    if (latest) t2Weight = latest.weight_g;
  }

  const members = [{
    unit_slot_no:  1,
    lot_id:        ind.lot_id        || '',
    lot_item_no:   ind.lot_item_no   || '',
    lot_display_id:ind.lot_display_id || ind.lot_id || '',
    size_category: ind.size_category  || '',
    t2_weight_g:   t2Weight,
    weight_g:      null,
    sex:           ind.sex || '不明',
    mx_done:       false,
    status:        'normal',
    decision:      null,
    memo:          '',
  }];

  window._t3Session = {
    unit_id:     ind.ind_id,
    display_id:  ind.display_id || indIdOrDisplayId,
    line_id:     ind.line_id    || '',
    stage_phase: ind.current_stage || 'T2',
    hatch_date:  ind.hatch_date   || '',
    head_count:  1,
    origin_lots: ind.lot_id ? [ind.lot_id] : [],
    mx_done:     false,
    members,
    saving:      false,
    _fromInd:    true,
    ind_id:      ind.ind_id,
  };

  _saveT3SessionToStorage();
  routeTo('t3-session');
};


// ────────────────────────────────────────────────────────────────
// メンバー構築
// T2体重を参照表示し、T3で新規体重を入力する
// ────────────────────────────────────────────────────────────────
function _buildT3Members(unit) {
  let parsedMembers = [];
  const raw = unit.members;
  if (Array.isArray(raw)) {
    parsedMembers = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try { parsedMembers = JSON.parse(raw); } catch(e) { parsedMembers = []; }
  }

  const unitSizeCategory = unit.size_category || '';
  const growthBySlot = _getT2GrowthBySlot(unit.unit_id);
  const count = Math.max(parseInt(unit.head_count, 10) || 2, parsedMembers.length, 1);
  const result = [];

  for (let i = 0; i < count; i++) {
    const src = parsedMembers[i] || {};
    const slotNo = i + 1;
    const sizeCategory =
      src.size_category
      || (growthBySlot[slotNo] && growthBySlot[slotNo].size_category)
      || unitSizeCategory
      || '';

    result.push({
      unit_slot_no:  slotNo,
      lot_id:        src.lot_id         || '',
      lot_item_no:   src.lot_item_no    || '',
      lot_display_id:src.lot_display_id || src.lot_id || '',
      size_category: sizeCategory,
      // T2体重は参照表示のみ
      t2_weight_g:   src.weight_g || (growthBySlot[slotNo] && growthBySlot[slotNo].weight_g) || null,
      // T3 入力値（空欄スタート）
      weight_g:      null,
      sex:           src.sex || '不明',
      mx_done:       false,   // このスロットのMx記録
      status:        'normal',
      decision:      null,
      memo:          '',
    });
  }
  return result;
}

function _getT2GrowthBySlot(unitId) {
  if (!unitId) return {};
  const records = (typeof Store.getGrowthRecords === 'function')
    ? Store.getGrowthRecords(unitId)
    : [];
  if (!records || records.length === 0) return {};
  const bySlot = {};
  records.forEach(r => {
    const slot = parseInt(r.unit_slot_no, 10);
    if (!slot) return;
    if (!bySlot[slot] || String(r.record_date) > String(bySlot[slot].record_date)) {
      bySlot[slot] = r;
    }
  });
  return bySlot;
}

function _resolveT3OriginLotDisplayIds(unit) {
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

function _formatT3OriginLots(ids) {
  if (!ids || ids.length === 0) return '—';
  return ids.map(d => {
    const m = d.match(/[A-Z0-9]+-L\d+/);
    return m ? m[0] : d;
  }).join(' / ');
}

// ── sessionStorage ───────────────────────────────────────────────
function _saveT3SessionToStorage() {
  try { sessionStorage.setItem('_t3SessionData', JSON.stringify(window._t3Session)); } catch(e) {}
}
function _restoreT3SessionFromStorage() {
  try {
    const raw = sessionStorage.getItem('_t3SessionData');
    if (raw) window._t3Session = JSON.parse(raw);
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════════
// メイン画面
// ════════════════════════════════════════════════════════════════
Pages.t3Session = function (params = {}) {
  if (!window._t3Session) _restoreT3SessionFromStorage();
  if (!window._t3Session) { routeTo('qr-scan', { mode: 't3' }); return; }
  _renderT3Session(window._t3Session);
};

function _renderT3Session(s) {
  const main = document.getElementById('main');
  if (!main) return;

  const line     = Store.getLine(s.line_id);
  const lineDisp = line ? (line.line_code || line.display_id) : s.line_id;
  const originStr = _formatT3OriginLots(s.origin_lots);
  const allComplete = s.members.every(m => _isT3MemberComplete(m));
  const canSave = allComplete && !s.saving;

  if (s.saving) {
    main.innerHTML = `
      ${UI.header('T3（3齢後期）移行セッション', { back: false })}
      <div class="page-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:16px">
        <div class="spinner" style="width:44px;height:44px;border-width:4px"></div>
        <div style="font-size:.9rem;color:var(--text2);font-weight:600">T3移行を保存中...</div>
        <div style="font-size:.75rem;color:var(--text3)">${s.display_id}</div>
      </div>`;
    return;
  }

  main.innerHTML = `
    ${UI.header('T3（3齢後期）移行セッション', { back: true, backFn: "Pages._t3SessionBack()" })}
    <div class="page-body" style="padding-bottom:84px">

      <!-- ① ユニット概要バナー（T3特別カラー：ゴールド系） -->
      <div style="background:linear-gradient(135deg,rgba(224,144,64,.12) 0%,rgba(224,144,64,.06) 100%);
        border:1.5px solid rgba(224,144,64,.4);border-radius:10px;padding:12px 14px;font-size:.8rem">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-weight:700;color:var(--gold);font-family:var(--font-mono);font-size:.9rem">${s.display_id}</span>
          <span style="background:rgba(224,144,64,.18);color:var(--amber);padding:2px 10px;border-radius:5px;font-size:.72rem;font-weight:700;letter-spacing:.05em">
            ${s.stage_phase} → T3（3齢後期）
          </span>
          <span style="color:var(--text3)">${lineDisp}　${s.head_count}頭</span>
        </div>
        ${s.hatch_date ? `<div style="font-size:.72rem;color:var(--text3)">孵化: ${s.hatch_date}</div>` : ''}
        <div style="font-size:.72rem;color:var(--text3)">由来ロット: ${originStr}</div>
      </div>

      <!-- ② 重要度バナー -->
      <div style="background:rgba(224,144,64,.07);border:1px solid rgba(224,144,64,.3);border-radius:8px;
        padding:10px 12px;margin-top:8px;font-size:.76rem;color:var(--text2);line-height:1.6">
        <b style="color:var(--amber)">⭐ T3（3齢後期）は最も体重が乗る重要ステージです。</b><br>
        体重計測・マット交換の有無を記録し、最終的な成長管理を確定してください。<br>
        <span style="color:var(--text3)">※ 継続の場合も必ずここで確定してください。</span>
      </div>

      <!-- ③ マット交換（Mx）ユニット共通設定 -->
      ${_renderT3MxSection(s)}

      <!-- ④ 個体カード -->
      ${s.members.map((m, i) => _renderT3MemberCard(m, i, s)).join('')}

      <!-- ⑤ サマリ -->
      ${_renderT3Summary(s)}

      <!-- ⑥ 未完了警告 -->
      ${(!allComplete && s.members.some(m => m.decision !== null)) ? `
      <div style="background:rgba(224,144,64,.08);border:1px solid rgba(224,144,64,.3);
        border-radius:8px;padding:10px 12px;margin-top:8px;font-size:.78rem;color:var(--amber)">
        ⚠️ 全頭の判断が完了していません。体重・判断を確認してください。
      </div>` : ''}

    </div>

    <!-- 固定フッター -->
    <div class="quick-action-bar">
      <button class="btn btn-ghost" style="flex:1;padding:14px 0"
        onclick="Pages._t3SessionCancel()">破棄</button>
      <button class="btn btn-gold" style="flex:2;padding:14px 0;font-weight:700;font-size:.95rem"
        ${canSave ? '' : 'disabled'}
        onclick="Pages._t3SessionSave()">
        💾 T3移行を確定
      </button>
    </div>`;

  _saveT3SessionToStorage();
}

// ── マット交換セクション ─────────────────────────────────────────
function _renderT3MxSection(s) {
  const mxOn  = !!s.mx_done;
  return `
  <div style="margin-top:10px;border-radius:10px;border:1.5px solid var(--border);
    background:var(--surface1,var(--surface));padding:12px 14px">
    <div style="font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:10px">
      🔄 マット交換 (Mx) — ユニット共通
    </div>
    <div style="display:flex;gap:10px">
      <button type="button"
        onclick="Pages._t3SetMx(true)"
        style="flex:1;padding:10px 0;border-radius:8px;font-size:.88rem;font-weight:700;cursor:pointer;
          border:2px solid ${mxOn ? 'var(--green)' : 'var(--border)'};
          background:${mxOn ? 'rgba(76,175,120,.15)' : 'var(--bg2)'};
          color:${mxOn ? 'var(--green)' : 'var(--text2)'}">
        ✅ Mx実施
      </button>
      <button type="button"
        onclick="Pages._t3SetMx(false)"
        style="flex:1;padding:10px 0;border-radius:8px;font-size:.88rem;font-weight:700;cursor:pointer;
          border:2px solid ${!mxOn ? 'var(--amber)' : 'var(--border)'};
          background:${!mxOn ? 'rgba(224,144,64,.12)' : 'var(--bg2)'};
          color:${!mxOn ? 'var(--amber)' : 'var(--text2)'}">
        ⏭ Mx未実施
      </button>
    </div>
    <div style="font-size:.7rem;color:var(--text3);margin-top:7px">
      ${mxOn ? 'このT3移行時にマット交換を実施します' : 'マット交換は行いません（体重計測のみ）'}
    </div>
  </div>`;
}

// ── 個体カード ───────────────────────────────────────────────────
function _renderT3MemberCard(m, idx, s) {
  const isDead   = m.status === 'dead';
  const slotLabel = idx === 0 ? '1頭目' : idx === 1 ? '2頭目' : `${idx + 1}頭目`;
  const isComplete = _isT3MemberComplete(m);
  const cardBorder = isDead ? 'rgba(224,80,80,.35)' : (isComplete ? 'rgba(76,175,120,.35)' : 'var(--border)');
  const cardBg     = isDead ? 'rgba(224,80,80,.04)' : (isComplete ? 'rgba(76,175,120,.04)' : 'var(--surface1,var(--surface))');

  // 区分ボタン
  const sizeBtns = ['大', '中', '小'].map(sz => {
    const on = m.size_category === sz;
    return `<button type="button"
      onclick="Pages._t3SetSize(${idx},'${sz}')"
      style="min-width:48px;padding:8px 10px;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? 'var(--green)' : 'var(--border)'};
        background:${on ? 'var(--green)' : 'var(--bg2)'};
        color:${on ? '#fff' : 'var(--text2)'};
        opacity:${isDead ? '.3' : '1'};pointer-events:${isDead ? 'none' : 'auto'}"
      ${isDead ? 'disabled' : ''}>${sz}</button>`;
  }).join('');

  const t2WeightRef = m.t2_weight_g
    ? `<span style="font-size:.65rem;color:var(--text3);margin-left:4px">T2: ${m.t2_weight_g}g</span>`
    : '';

  // 性別ボタン
  const sexBtns = ['不明', '♂', '♀'].map(sx => {
    const on = m.sex === sx;
    const col = sx === '♂' ? '#3366cc' : sx === '♀' ? '#cc3366' : 'var(--text3)';
    return `<button type="button"
      onclick="Pages._t3SetSex(${idx},'${sx}')"
      style="flex:1;padding:7px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? col : 'var(--border)'};
        background:${on ? (sx==='♂'?'rgba(51,102,204,.15)':sx==='♀'?'rgba(204,51,102,.15)':'var(--surface2)') : 'var(--bg2)'};
        color:${on ? col : 'var(--text2)'};
        opacity:${isDead ? '.3' : '1'};pointer-events:${isDead ? 'none' : 'auto'}"
      ${isDead ? 'disabled' : ''}>${sx}</button>`;
  }).join('');

  // 状態ボタン
  const statusBtns = [
    { key: 'normal', lbl: '通常',    ac: 'var(--green)',       abg: 'var(--green)',           ton: '#fff' },
    { key: 'dead',   lbl: '💀 死亡', ac: 'var(--red,#e05050)', abg: 'rgba(224,80,80,.18)',    ton: 'var(--red,#e05050)' },
  ].map(({ key, lbl, ac, abg, ton }) => {
    const on = m.status === key;
    return `<button type="button"
      onclick="Pages._t3SetStatus(${idx},'${key}')"
      style="flex:1;padding:9px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? ac : 'var(--border)'};
        background:${on ? abg : 'var(--bg2)'};
        color:${on ? ton : 'var(--text2)'}">
      ${lbl}</button>`;
  }).join('');

  // 判断ボタン
  const decisionDefs = [
    { key: 'continue',      lbl: '継続',     color: 'var(--blue)',  bg: 'rgba(91,168,232,.18)',  desc: '→ T3マットで継続飼育します' },
    { key: 'individualize', lbl: '個別化',   color: 'var(--green)', bg: 'rgba(76,175,120,.18)',  desc: '→ 個体台帳に登録して個別飼育へ' },
    { key: 'sale',          lbl: '販売候補', color: 'var(--amber)', bg: 'rgba(224,144,64,.18)',  desc: '→ 販売候補として個体台帳に登録' },
  ];
  const decisionBtns = decisionDefs.map(({ key, lbl, color, bg }) => {
    const on = m.decision === key;
    return `<button type="button"
      onclick="Pages._t3SetDecision(${idx},'${key}')"
      style="flex:1;padding:9px 0;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? color : 'var(--border)'};
        background:${on ? bg : 'var(--bg2)'};
        color:${on ? color : 'var(--text2)'}">
      ${lbl}</button>`;
  }).join('');
  const selectedDecision = decisionDefs.find(d => d.key === m.decision);

  const completeBadge = isComplete
    ? `<span style="font-size:.65rem;padding:2px 8px;border-radius:10px;font-weight:700;
        background:${isDead ? 'rgba(224,80,80,.12)' : 'rgba(76,175,120,.12)'};
        color:${isDead ? 'var(--red,#e05050)' : 'var(--green)'}">
        ${isDead ? '💀 死亡' : '✅ 確定'}</span>`
    : `<span style="font-size:.65rem;padding:2px 8px;border-radius:10px;font-weight:700;
        background:rgba(224,144,64,.12);color:var(--amber)">未確定</span>`;

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

    <!-- 1段目: 区分 + 体重 -->
    <div style="padding:10px 14px 10px;border-bottom:1px solid var(--border2)">
      ${lotInfo}
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;gap:6px">${sizeBtns}</div>
        <div style="display:flex;align-items:center;gap:4px;margin-left:auto">
          <input type="number" inputmode="numeric" min="1" max="999" step="1"
            placeholder="体重"
            value="${m.weight_g !== null ? m.weight_g : ''}"
            style="width:76px;padding:8px 6px;text-align:center;border-radius:8px;
              border:2px solid ${m.weight_g ? 'var(--green)' : 'var(--border)'};
              background:var(--bg2);font-size:1rem;font-weight:700;color:var(--text1);
              opacity:${isDead ? '.3' : '1'};pointer-events:${isDead ? 'none' : 'auto'}"
            ${isDead ? 'disabled' : ''}
            onblur="Pages._t3CommitWeight(${idx},this.value)"
            onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}">
          <span style="font-size:.8rem;color:var(--text3);font-weight:600">g</span>
          ${t2WeightRef}
        </div>
      </div>
    </div>

    <!-- 2段目: 性別 -->
    ${!isDead ? `
    <div style="padding:8px 14px 10px;border-bottom:1px solid var(--border2)">
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:7px;text-transform:uppercase;letter-spacing:.05em">性別</div>
      <div style="display:flex;gap:6px">${sexBtns}</div>
    </div>` : ''}

    <!-- 3段目: 状態 -->
    <div style="padding:10px 14px 10px;border-bottom:1px solid var(--border2)">
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:7px;text-transform:uppercase;letter-spacing:.05em">状態</div>
      <div style="display:flex;gap:8px">${statusBtns}</div>
      ${isDead ? `<div style="font-size:.72rem;color:var(--red,#e05050);margin-top:7px;opacity:.85">死亡として記録します（体重・判断の入力不要）</div>` : ''}
    </div>

    <!-- 4段目: 判断 -->
    ${!isDead ? `
    <div style="padding:10px 14px 10px;border-bottom:1px solid var(--border2)">
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:7px;text-transform:uppercase;letter-spacing:.05em">判断</div>
      <div style="display:flex;gap:6px">${decisionBtns}</div>
      ${selectedDecision ? `<div style="font-size:.7rem;color:var(--text3);margin-top:6px">${selectedDecision.desc}</div>` : ''}
    </div>` : ''}

    <!-- 5段目: メモ -->
    <div style="padding:8px 14px 10px">
      <input type="text" placeholder="メモ（任意）"
        value="${m.memo || ''}"
        style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);
          background:var(--bg2);font-size:.82rem;color:var(--text1);box-sizing:border-box"
        oninput="Pages._t3SetMemo(${idx},this.value)">
    </div>

  </div>`;
}

// ── サマリ ───────────────────────────────────────────────────────
function _renderT3Summary(s) {
  const cnt = {
    continue:     s.members.filter(m => m.decision === 'continue').length,
    individualize:s.members.filter(m => m.decision === 'individualize').length,
    sale:         s.members.filter(m => m.decision === 'sale').length,
    dead:         s.members.filter(m => m.decision === 'dead').length,
    undecided:    s.members.filter(m => m.decision === null).length,
  };
  const allDone = cnt.undecided === 0;
  const totalWeight = s.members
    .filter(m => m.weight_g > 0)
    .reduce((sum, m) => sum + m.weight_g, 0);
  const avgWeight = cnt.continue + cnt.individualize + cnt.sale > 0
    ? (totalWeight / (cnt.continue + cnt.individualize + cnt.sale)).toFixed(1)
    : '—';

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
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border2);
      display:flex;align-items:center;justify-content:space-between;font-size:.75rem">
      <span style="color:${allDone ? 'var(--green)' : 'var(--amber)'}">
        ${allDone ? '✅ 全頭の判断が完了' : `⚠️ 未判断: ${cnt.undecided}頭`}
      </span>
      <span style="color:var(--text3)">平均体重: <b style="color:var(--gold)">${avgWeight}g</b></span>
    </div>
  </div>`;
}

// ── 入力完了判定 ─────────────────────────────────────────────────
function _isT3MemberComplete(m) {
  if (m.decision === 'dead') return true;
  if (m.decision === null)   return false;
  return m.weight_g !== null && m.weight_g > 0;
}

// ════════════════════════════════════════════════════════════════
// アクションハンドラ
// ════════════════════════════════════════════════════════════════

Pages._t3SetMx = function (done) {
  const s = window._t3Session;
  if (!s) return;
  s.mx_done = done;
  _renderT3Session(s);
};

Pages._t3SetSize = function (idx, size) {
  const s = window._t3Session;
  if (!s || s.members[idx].status === 'dead') return;
  s.members[idx].size_category = s.members[idx].size_category === size ? '' : size;
  _renderT3Session(s);
};

Pages._t3SetStatus = function (idx, status) {
  const s = window._t3Session;
  if (!s) return;
  s.members[idx].status = status;
  if (status === 'dead') {
    s.members[idx].decision      = 'dead';
    s.members[idx].weight_g      = null;
    s.members[idx].size_category = '';
  } else {
    if (s.members[idx].decision === 'dead') s.members[idx].decision = null;
  }
  _renderT3Session(s);
};

Pages._t3SetDecision = function (idx, decision) {
  const s = window._t3Session;
  if (!s || s.members[idx].status === 'dead') return;
  s.members[idx].decision = decision;
  _renderT3Session(s);
};

Pages._t3CommitWeight = function (idx, val) {
  const s = window._t3Session;
  if (!s) return;
  const n = parseInt(val, 10);
  const newW = (!val || isNaN(n) || n <= 0) ? null : Math.min(999, n);
  if (s.members[idx].weight_g === newW) return;
  s.members[idx].weight_g = newW;
  _saveT3SessionToStorage();
  clearTimeout(Pages._t3RefreshTimer);
  Pages._t3RefreshTimer = setTimeout(() => _renderT3Session(window._t3Session), 200);
};

Pages._t3SetSex = function (idx, sex) {
  const s = window._t3Session;
  if (!s || s.members[idx].status === 'dead') return;
  s.members[idx].sex = sex;
  _renderT3Session(s);
};

Pages._t3SetMemo = function (idx, val) {
  const s = window._t3Session;
  if (s) { s.members[idx].memo = val; _saveT3SessionToStorage(); }
};

// ── 戻る / 破棄 ─────────────────────────────────────────────────
Pages._t3SessionBack = function () {
  if (confirm('セッションを中断しますか？（入力内容は一時保存されます）')) {
    routeTo('qr-scan', { mode: 't3' });
  }
};

Pages._t3SessionCancel = function () {
  if (confirm('セッションを破棄しますか？（入力内容は消えます）')) {
    window._t3Session = null;
    sessionStorage.removeItem('_t3SessionData');
    routeTo('qr-scan', { mode: 't3' });
  }
};

// ── 保存 ────────────────────────────────────────────────────────
Pages._t3SessionSave = async function () {
  const s = window._t3Session;
  if (!s || s.saving) return;

  console.log('[T3_SAVE] ===== T3 save triggered =====');
  console.log('[T3_SAVE] window.__API_BUILD:', window.__API_BUILD || '(not set)');
  console.log('[T3_SAVE] typeof API.t3:', typeof (window.API && window.API.t3));
  console.log('[T3_SAVE] session:', { unit_id: s.unit_id, display_id: s.display_id, members: s.members.length });

  if (!s.members.every(m => _isT3MemberComplete(m))) {
    UI.toast('全頭の判断を完了してください（体重も入力してください）', 'error'); return;
  }

  const cCnt = s.members.filter(m => m.decision === 'continue').length;
  const iCnt = s.members.filter(m => m.decision === 'individualize').length;
  const sCnt = s.members.filter(m => m.decision === 'sale').length;
  const dCnt = s.members.filter(m => m.decision === 'dead').length;

  const confirmMsg =
    `T3（3齢後期）移行を確定します（取り消せません）\n\n` +
    `ユニット: ${s.display_id}\n` +
    `由来ロット: ${_formatT3OriginLots(s.origin_lots)}\n` +
    `Mx（マット交換）: ${s.mx_done ? '実施' : '未実施'}\n\n` +
    `継続: ${cCnt}頭 → T3マット継続\n` +
    `個別化: ${iCnt}頭 → 個体台帳へ\n` +
    `販売候補: ${sCnt}頭\n` +
    `死亡: ${dCnt}頭`;

  if (!confirm(confirmMsg)) return;

  s.saving = true;
  _renderT3Session(s);

  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');

    const payload = {
      transaction_type:       'T3_SESSION',
      session_date:           today,
      source_unit_id:         s.unit_id,
      source_unit_display_id: s.display_id,
      mx_done:                s.mx_done || false,
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
      })),
    };

    console.log('[T3] save payload', payload);
    const res = await API.t3.createSession(payload);
    console.log('[T3] save response', res);

    // ── Store を更新（T3移行）──────────────────────────────────────
    const _t3SessionMembers = s.members
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

    const _t3UnitPatch = {
      stage_phase: 'T3',
      status:      'active',
      members:     JSON.stringify(_t3SessionMembers),
    };

    if (res && res.updated_unit) {
      const _merged3 = Object.assign({}, _t3UnitPatch, res.updated_unit);
      if (!_merged3.members || _merged3.members === '[]' || _merged3.members === '') {
        _merged3.members = JSON.stringify(_t3SessionMembers);
      }
      if (typeof Store.patchDBItem === 'function') {
        Store.patchDBItem('breeding_units', 'unit_id', s.unit_id, _merged3);
      } else {
        const units = (Store.getDB('breeding_units') || []).map(u =>
          u.unit_id === s.unit_id ? Object.assign({}, u, _merged3) : u
        );
        Store.setDB('breeding_units', units);
      }
    } else {
      if (typeof Store.patchDBItem === 'function') {
        Store.patchDBItem('breeding_units', 'unit_id', s.unit_id, _t3UnitPatch);
      } else {
        const units = (Store.getDB('breeding_units') || []).map(u =>
          u.unit_id === s.unit_id ? Object.assign({}, u, _t3UnitPatch) : u
        );
        Store.setDB('breeding_units', units);
      }
    }
    if (res && Array.isArray(res.created_individuals)) {
      res.created_individuals.forEach(ind => {
        if (typeof Store.addDBItem === 'function') Store.addDBItem('individuals', ind);
      });
    }

    window._t3Session = null;
    sessionStorage.removeItem('_t3SessionData');
    UI.toast('T3（3齢後期）移行を完了しました ✅', 'success', 3000);
    routeTo('qr-scan', { mode: 't3' });

  } catch (e) {
    console.error('[T3] save error:', e);
    s.saving = false;
    _renderT3Session(s);
    UI.toast('保存失敗: ' + (e.message || '通信エラー'), 'error', 5000);
  }
};

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['t3-session'] = function () {
  Pages.t3Session(Store.getParams());
};
