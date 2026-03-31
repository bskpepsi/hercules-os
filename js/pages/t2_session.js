// ════════════════════════════════════════════════════════════════
// t2_session.js — T2移行編成セッション画面
//
// 設計:
//   - 対象は BU（飼育ユニット）1件
//   - members 2頭それぞれに decision を入力
//   - decision: continue / individualize / sale / dead
//   - 継続 → BU の stage_phase を更新
//   - 個別化 / 販売候補 → individual 作成
//   - 死亡 → growth_records ATTRITION
// ════════════════════════════════════════════════════════════════
'use strict';

window._t2Session = window._t2Session || null;

// ────────────────────────────────────────────────────────────────
// セッション開始エントリーポイント（scan.js から呼ばれる）
// ────────────────────────────────────────────────────────────────
Pages.t2SessionStart = async function (unitDisplayId) {
  console.log('[T2] t2SessionStart - displayId:', unitDisplayId);

  // Store から BU を取得
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

  // members を取得（source_lots / growth_records から由来ロット情報も合わせる）
  const members = _buildT2Members(unit);
  if (!members || members.length === 0) {
    UI.toast('ユニットのメンバー情報が取得できません', 'error'); return;
  }

  // 由来ロット display_id リストを解決
  const originLotDisplayIds = _resolveOriginLotDisplayIds(unit);

  window._t2Session = {
    unit_id:          unit.unit_id,
    display_id:       unit.display_id,
    line_id:          unit.line_id,
    stage_phase:      unit.stage_phase || 'T1',
    hatch_date:       unit.hatch_date  || '',
    head_count:       unit.head_count  || members.length,
    origin_lots:      originLotDisplayIds,
    members:          members,
    saving:           false,
  };

  _saveT2SessionToStorage();
  routeTo('t2-session');
};

// ── メンバー構築 ─────────────────────────────────────────────────
function _buildT2Members(unit) {
  const storedMembers = unit.members || [];
  // stored members が配列文字列の場合は parse
  let parsed = storedMembers;
  if (typeof storedMembers === 'string') {
    try { parsed = JSON.parse(storedMembers); } catch(e) { parsed = []; }
  }

  // head_count 分の行を確保（最低2行）
  const count = parseInt(unit.head_count, 10) || 2;
  const result = [];
  for (let i = 0; i < count; i++) {
    const src = parsed[i] || {};
    result.push({
      unit_slot_no:  i + 1,
      lot_id:        src.lot_id        || '',
      lot_item_no:   src.lot_item_no   || '',
      lot_display_id:src.lot_display_id|| src.lot_id || '',
      size_category: src.size_category || '',
      weight_g:      null,   // T2で新たに計測
      status:        'normal',
      decision:      null,   // continue / individualize / sale / dead
      memo:          '',
    });
  }
  return result;
}

// ── 由来ロット display_id リストを解決 ───────────────────────────
function _resolveOriginLotDisplayIds(unit) {
  // source_lots: JSON文字列 or 配列
  let srcLots = [];
  if (unit.source_lots) {
    try {
      srcLots = typeof unit.source_lots === 'string'
        ? JSON.parse(unit.source_lots) : unit.source_lots;
    } catch(e) {}
  }

  // lot_id → display_id に変換
  if (srcLots.length > 0) {
    return srcLots.map(lid => {
      const lot = Store.getLot(lid);
      return lot ? (lot.display_id || lid) : lid;
    });
  }

  // フォールバック: origin_lot_id
  if (unit.origin_lot_id) {
    const lot = Store.getLot(unit.origin_lot_id);
    return [lot ? (lot.display_id || unit.origin_lot_id) : unit.origin_lot_id];
  }

  return [];
}

// ── 由来ロット表示文字列 ─────────────────────────────────────────
function _formatOriginLots(originLotDisplayIds) {
  if (!originLotDisplayIds || originLotDisplayIds.length === 0) return '—';
  // display_id からライン部分を除いた短縮形（例: HM2026-A1-L02 → A1-L02）
  const short = originLotDisplayIds.map(d => {
    const m = d.match(/[A-Z]\d+-L\d+/);
    return m ? m[0] : d;
  });
  return short.join(' / ');
}

// ── sessionStorage 永続化 ─────────────────────────────────────────
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

  const allDecided = s.members.every(m => m.decision !== null);
  const allInputComplete = s.members.every(m => _isT2MemberComplete(m));
  const canSave   = allInputComplete && !s.saving;

  main.innerHTML = `
    ${UI.header('T2移行編成セッション', { back: true, backFn: "Pages._t2SessionBack()" })}
    <div class="page-body has-quick-bar" style="padding-bottom:80px">

      <!-- セッション概要 -->
      <div style="background:var(--surface2);border-radius:10px;padding:10px 14px;font-size:.78rem;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        <span style="font-weight:700;color:var(--gold);font-family:var(--font-mono)">${s.display_id}</span>
        <span style="color:var(--text3)">${lineDisp}</span>
        <span style="background:rgba(91,168,232,.15);color:var(--blue);padding:1px 6px;border-radius:4px;font-size:.72rem">
          ${s.stage_phase} → ${nextPhase}
        </span>
        <span style="color:var(--text3)">${s.head_count}頭</span>
        ${s.hatch_date ? `<span style="color:var(--text3)">孵化: ${s.hatch_date}</span>` : ''}
        <span style="font-size:.72rem;color:var(--text3)">由来: ${originStr}</span>
      </div>

      <!-- 個体行 -->
      <div class="card" style="margin-top:8px">
        <div class="card-title">個体の状態・判断を入力</div>
        <!-- 列ヘッダー -->
        <div style="display:grid;grid-template-columns:30px 80px 70px 80px 100px 1fr;gap:4px;
          font-size:.62rem;color:var(--text3);padding:0 0 6px;border-bottom:1px solid var(--border)">
          <div>席</div><div>区分</div><div>体重</div><div>状態</div><div>判断</div><div>メモ</div>
        </div>
        ${s.members.map((m, i) => _renderT2MemberRow(m, i, s)).join('')}
      </div>

      <!-- 判断サマリ -->
      ${_renderT2Summary(s)}

      <!-- 保存確認メッセージ -->
      ${!allInputComplete && s.members.some(m => m.decision !== null) ? `
      <div style="background:rgba(224,144,64,.08);border:1px solid rgba(224,144,64,.3);border-radius:8px;padding:10px;margin-top:8px;font-size:.78rem;color:var(--amber)">
        ⚠️ 全員の判断と必要な情報を入力してから保存できます
      </div>` : ''}

    </div>

    <!-- 固定フッター -->
    <div class="quick-action-bar">
      <button class="btn btn-ghost btn-xl" style="flex:1"
        onclick="Pages._t2SessionCancel()">キャンセル</button>
      <button class="btn btn-gold btn-xl" style="flex:2"
        ${canSave ? '' : 'disabled'}
        onclick="Pages._t2SessionSave()">
        💾 T2移行を確定・保存
      </button>
    </div>`;

  _saveT2SessionToStorage();
}

// ── 個体行描画 ──────────────────────────────────────────────────
function _renderT2MemberRow(m, idx, s) {
  const isDead = m.status === 'dead';
  const hasDecision = m.decision !== null;

  const decisionColors = {
    continue:     'var(--blue)',
    individualize:'var(--green)',
    sale:         'var(--amber)',
    dead:         'var(--red,#e05050)',
  };
  const decisionLabels = {
    continue:     '継続',
    individualize:'個別化',
    sale:         '販売候補',
    dead:         '死亡',
  };

  const sizeBtns = ['大','中','小'].map(sz => {
    const on = m.size_category === sz;
    return `<button type="button"
      onclick="Pages._t2SetSize(${idx},'${sz}')"
      style="padding:4px 7px;border-radius:6px;font-size:.75rem;font-weight:700;cursor:pointer;
        border:1px solid ${on?'var(--green)':'var(--border)'};
        background:${on?'var(--green)':'var(--surface2)'};
        color:${on?'#fff':'var(--text2)'};
        ${isDead?'opacity:.35;pointer-events:none':''}"
      ${isDead?'disabled':''}>${sz}</button>`;
  }).join('');

  const statusBtns = [['通常','normal'],['死亡','dead']].map(([lbl,key]) => {
    const on = m.status === key;
    return `<button type="button"
      onclick="Pages._t2SetStatus(${idx},'${key}')"
      style="padding:4px 7px;border-radius:6px;font-size:.75rem;font-weight:700;cursor:pointer;
        border:1px solid ${on?(key==='dead'?'var(--red,#e05050)':'var(--green)'):'var(--border)'};
        background:${on?(key==='dead'?'rgba(224,80,80,.2)':'var(--green)'):'var(--surface2)'};
        color:${on?(key==='dead'?'var(--red,#e05050)':'#fff'):'var(--text2)'}">${lbl}</button>`;
  }).join('');

  const decisionBtns = ['continue','individualize','sale','dead'].map(dec => {
    const on = m.decision === dec;
    const col = decisionColors[dec];
    const lbl = decisionLabels[dec];
    return `<button type="button"
      onclick="Pages._t2SetDecision(${idx},'${dec}')"
      style="padding:3px 6px;border-radius:5px;font-size:.7rem;font-weight:${on?'700':'400'};cursor:pointer;
        border:1px solid ${on?col:'var(--border)'};
        background:${on?`rgba(${_colorToRgb(col)},.15)`:'var(--surface2)'};
        color:${on?col:'var(--text3)'}">${lbl}</button>`;
  }).join('');

  const rowBg = m.decision === 'dead' ? 'rgba(224,80,80,.04)'
    : m.decision === 'continue' ? 'rgba(91,168,232,.04)'
    : m.decision ? 'rgba(76,175,120,.04)' : 'transparent';

  return `
  <div style="background:${rowBg};padding:6px 0;border-bottom:1px solid var(--border2)">
    <!-- 上行: 席 / 区分 / 体重 / 状態 / 判断 / メモ -->
    <div style="display:grid;grid-template-columns:30px 80px 70px 80px 100px 1fr;gap:4px;align-items:center">
      <div style="text-align:center">
        <div style="font-size:.8rem;font-weight:700;color:var(--gold)">席${m.unit_slot_no}</div>
        <div style="font-size:.6rem;color:var(--text3)">${m.lot_display_id ? '#'+m.lot_item_no : ''}</div>
      </div>
      <div style="display:flex;gap:2px">${sizeBtns}</div>
      <input type="number" inputmode="numeric" min="1" max="999" step="1"
        placeholder="—" value="${m.weight_g !== null ? m.weight_g : ''}"
        style="width:62px;padding:5px 4px;text-align:center;border-radius:6px;
          border:1px solid var(--border);background:var(--bg2);
          font-size:.88rem;font-weight:700;color:var(--text1);
          ${isDead?'opacity:.35;pointer-events:none':''}"
        ${isDead?'disabled':''}
        onblur="Pages._t2CommitWeight(${idx},this.value)"
        onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}">
      <div style="display:flex;gap:2px">${statusBtns}</div>
      <div style="display:flex;gap:2px;flex-wrap:wrap">${decisionBtns}</div>
      <input type="text" placeholder="メモ"
        value="${m.memo || ''}"
        style="width:100%;padding:4px 6px;border-radius:6px;border:1px solid var(--border);
          background:var(--bg2);font-size:.72rem"
        oninput="Pages._t2SetMemo(${idx},this.value)">
    </div>
    ${m.lot_display_id ? `
    <div style="font-size:.62rem;color:var(--text3);padding-left:34px;margin-top:2px">
      元ロット: ${m.lot_display_id}${m.lot_item_no ? ' #'+m.lot_item_no : ''}
      ${m.size_category ? ' / '+m.size_category : ''}
    </div>` : ''}
  </div>`;
}

// 色をRGB値に変換（簡易版）
function _colorToRgb(cssVar) {
  const map = {
    'var(--blue)':'91,168,232',
    'var(--green)':'76,175,120',
    'var(--amber)':'224,144,64',
    'var(--red,#e05050)':'224,80,80',
  };
  return map[cssVar] || '128,128,128';
}

// ── サマリ描画 ───────────────────────────────────────────────────
function _renderT2Summary(s) {
  const cnt = {
    continue:     s.members.filter(m => m.decision === 'continue').length,
    individualize:s.members.filter(m => m.decision === 'individualize').length,
    sale:         s.members.filter(m => m.decision === 'sale').length,
    dead:         s.members.filter(m => m.decision === 'dead').length,
    undecided:    s.members.filter(m => m.decision === null).length,
  };

  return `
  <div style="background:var(--surface2);border-radius:10px;padding:10px 14px;margin-top:8px;font-size:.78rem">
    <div style="font-weight:700;color:var(--text2);margin-bottom:6px">判断サマリ</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
      <div style="color:var(--blue)">継続: <b>${cnt.continue}頭</b></div>
      <div style="color:var(--green)">個別化: <b>${cnt.individualize}頭</b></div>
      <div style="color:var(--amber)">販売候補: <b>${cnt.sale}頭</b></div>
      <div style="color:var(--red,#e05050)">死亡: <b>${cnt.dead}頭</b></div>
    </div>
    ${cnt.undecided > 0 ? `<div style="color:var(--amber);margin-top:4px;font-size:.72rem">⚠️ 未判断: ${cnt.undecided}頭</div>` : '<div style="color:var(--green);margin-top:4px;font-size:.72rem">✅ 全員判断済み</div>'}
  </div>`;
}

// ── 次のステージフェーズ ─────────────────────────────────────────
function _nextStagePhase(current) {
  const map = { T1:'T2', T2:'T3', T3:'T3（最終）' };
  return map[current] || (current + '→次');
}

// ── 入力完了判定 ─────────────────────────────────────────────────
function _isT2MemberComplete(m) {
  if (m.decision === null) return false;
  if (m.decision === 'dead') return true; // 死亡は体重不要
  // 継続・個別化・販売候補: 体重必須
  return m.weight_g !== null && m.weight_g > 0;
}

// ════════════════════════════════════════════════════════════════
// ユーザーアクションハンドラ
// ════════════════════════════════════════════════════════════════

Pages._t2SetSize = function (idx, size) {
  const s = window._t2Session;
  if (!s) return;
  s.members[idx].size_category = s.members[idx].size_category === size ? '' : size;
  _renderT2Session(s);
};

Pages._t2SetStatus = function (idx, status) {
  const s = window._t2Session;
  if (!s) return;
  s.members[idx].status = status;
  if (status === 'dead') {
    s.members[idx].weight_g     = null;
    s.members[idx].size_category= '';
    s.members[idx].decision     = 'dead';
  }
  _renderT2Session(s);
};

Pages._t2SetDecision = function (idx, decision) {
  const s = window._t2Session;
  if (!s) return;
  s.members[idx].decision = decision;
  if (decision === 'dead') {
    s.members[idx].status    = 'dead';
    s.members[idx].weight_g  = null;
  }
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
  // 軽量更新（体重入力中は全再描画しない）
  clearTimeout(Pages._t2RefreshTimer);
  Pages._t2RefreshTimer = setTimeout(() => _renderT2Session(window._t2Session), 200);
};

Pages._t2SetMemo = function (idx, val) {
  const s = window._t2Session;
  if (s) { s.members[idx].memo = val; _saveT2SessionToStorage(); }
};

// ── 戻る / キャンセル ───────────────────────────────────────────
Pages._t2SessionBack = function () {
  if (confirm('セッションを一時中断しますか？（内容は保存されます）')) {
    routeTo('qr-scan', { mode: 't2' });
  }
};

Pages._t2SessionCancel = function () {
  if (confirm('セッションを破棄しますか？（入力内容は失われます）')) {
    window._t2Session = null;
    sessionStorage.removeItem('_t2SessionData');
    routeTo('qr-scan', { mode: 't2' });
  }
};

// ── 保存 ────────────────────────────────────────────────────────
Pages._t2SessionSave = async function () {
  const s = window._t2Session;
  if (!s || s.saving) return;

  if (!s.members.every(m => _isT2MemberComplete(m))) {
    UI.toast('全員の判断と必要な情報を入力してください', 'error'); return;
  }

  const continueCount = s.members.filter(m => m.decision === 'continue').length;
  const indCount      = s.members.filter(m => m.decision === 'individualize').length;
  const saleCount     = s.members.filter(m => m.decision === 'sale').length;
  const deadCount     = s.members.filter(m => m.decision === 'dead').length;
  const nextPhase     = _nextStagePhase(s.stage_phase);

  const msg = `T2移行を確定します（取り消せません）\n\n`
    + `ユニット: ${s.display_id}\n`
    + `継続: ${continueCount}頭 → ${nextPhase}維持\n`
    + `個別化: ${indCount}頭 → 個体台帳へ\n`
    + `販売候補: ${saleCount}頭\n`
    + `死亡: ${deadCount}頭\n\n`
    + `由来ロット: ${_formatOriginLots(s.origin_lots)}`;

  if (!confirm(msg)) return;

  s.saving = true;
  _renderT2Session(s);

  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g,'/');
    const payload = {
      transaction_type:       'T2_SESSION',
      session_date:           today,
      source_unit_id:         s.unit_id,
      source_unit_display_id: s.display_id,
      decisions: s.members.map(m => ({
        unit_slot_no:  m.unit_slot_no,
        decision:      m.decision,
        weight_g:      m.weight_g,
        size_category: m.size_category,
        lot_id:        m.lot_id,
        lot_item_no:   m.lot_item_no,
        memo:          m.memo || '',
      })),
    };

    const res = await API.t2.createSession(payload);

    // Store 更新
    if (res && res.updated_unit) {
      Store.patchDBItem('breeding_units', 'unit_id', s.unit_id, res.updated_unit);
    }
    if (res && res.created_individuals && Array.isArray(res.created_individuals)) {
      res.created_individuals.forEach(ind => Store.addDBItem('individuals', ind));
    }

    window._t2Session = null;
    sessionStorage.removeItem('_t2SessionData');
    UI.toast('T2移行を完了しました ✅', 'success');
    routeTo('qr-scan', { mode: 't2' });
  } catch (e) {
    console.error('[T2] save error:', e);
    s.saving = false;
    _renderT2Session(s);
    UI.toast('保存失敗: ' + (e.message || '通信エラー'), 'error');
  }
};

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['t2-session'] = function () {
  Pages.t2Session(Store.getParams());
};
