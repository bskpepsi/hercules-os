// ════════════════════════════════════════════════════════════════
// t1_session.js — T1移行編成セッション画面
// ════════════════════════════════════════════════════════════════
// 設計確定事項:
//  - 個体単位入力（lot_item_no = ロット内固定通番）
//  - display_id はセッション開始時に予約・確定（保存前後で同じ）
//  - 1頭ユニットは T1 では作らない（2頭 or 個別飼育）
//  - lot.count は変更しない（t1_done / t1_allocated / t1_dead_count で補完）
//  - 死亡時もメモ入力可
//  - 販売候補は未処理パネルから後付け
// ════════════════════════════════════════════════════════════════
'use strict';

// ────────────────────────────────────────────────────────────────
// セッション状態（グローバル。label-gen 遷移後も保持）
// ────────────────────────────────────────────────────────────────
window._t1Session = window._t1Session || null;

// ────────────────────────────────────────────────────────────────
// セッション開始エントリーポイント
// scan.js の T1移行モードから呼ばれる
// ────────────────────────────────────────────────────────────────
Pages.t1SessionStart = async function (lotId) {
  const lot = Store.getLot(lotId);
  if (!lot) { UI.toast('ロットが見つかりません', 'error'); return; }
  if (lot.t1_done) { UI.toast('このロットはT1移行済みです', 'error'); return; }
  const phase = lot.stage_phase || lot.stage || '';
  if (phase && phase !== 'T0' && phase !== 'L1L2') {
    UI.toast('T0ロット以外はT1移行できません', 'error'); return;
  }

  const btn = document.getElementById('qr-resolve-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 処理中...'; }

  try {
    // display_id を予約（最大 lot.count 個予約）
    const res = await API.t1.reserveDisplayIds({
      line_id: lot.line_id,
      count:   lot.count,
    });

    window._t1Session = _buildSession(lot, res.display_ids || []);
    _saveSessionToStorage();
    routeTo('t1-session');
  } catch (e) {
    UI.toast('セッション開始失敗: ' + (e.message || '通信エラー'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 読み取り・確認'; }
  }
};

// ────────────────────────────────────────────────────────────────
// セッションオブジェクト構築
// ────────────────────────────────────────────────────────────────
function _buildSession(lot, displayIds) {
  return {
    sessionId:      Date.now().toString(36),
    lineId:         lot.line_id,
    lots: [_buildLotEntry(lot)],
    units:          [],       // 確定済みユニット
    singles:        [],       // 個別飼育
    saleIndividuals:[],       // 販売候補（個体）
    displayIdPool:  displayIds,
    displayIdIndex: 0,
    saving:         false,
  };
}

function _buildLotEntry(lot) {
  const count = parseInt(lot.count, 10) || 0;
  const inds  = [];
  for (let i = 1; i <= count; i++) {
    inds.push({
      lot_item_no:   i,
      lot_id:        lot.lot_id,
      lot_display_id:lot.display_id || lot.lot_id,
      size_category: null,   // 大/中/小
      weight_g:      null,   // 整数
      status:        'normal', // 'normal' | 'dead'
      memo:          '',
      assigned_to:   null,   // null | 'unit' | 'single' | 'dead' | 'sale'
    });
  }
  return {
    lot_id:       lot.lot_id,
    display_id:   lot.display_id || lot.lot_id,
    line_id:      lot.line_id,
    hatch_date:   lot.hatch_date || '',
    count:        count,
    individuals:  inds,
  };
}

function _nextDisplayId(session) {
  if (session.displayIdIndex >= session.displayIdPool.length) {
    // display_id プール枯渇: 安全のためエラー（仮IDを絶対に使わない）
    throw new Error('ユニット番号の予約が不足しました。セッションをキャンセルしてやり直してください。');
  }
  return session.displayIdPool[session.displayIdIndex++];
}

// ────────────────────────────────────────────────────────────────
// sessionStorage 永続化（label-gen 往復時に保持）
// ────────────────────────────────────────────────────────────────
function _saveSessionToStorage() {
  try {
    sessionStorage.setItem('_t1SessionData', JSON.stringify(window._t1Session));
  } catch (e) {}
}
function _restoreSessionFromStorage() {
  try {
    const raw = sessionStorage.getItem('_t1SessionData');
    if (raw) window._t1Session = JSON.parse(raw);
  } catch (e) {}
}

// ────────────────────────────────────────────────────────────────
// メイン画面描画
// ────────────────────────────────────────────────────────────────
Pages.t1Session = function (params = {}) {
  // label-gen から戻ってきた場合: 印刷済みフラグ更新
  const labeledId = params.labeledDisplayId;
  if (!window._t1Session) _restoreSessionFromStorage();
  if (!window._t1Session) { routeTo('qr-scan', { mode: 't1' }); return; }

  if (labeledId) {
    const u = window._t1Session.units.find(u => u.display_id === labeledId);
    if (u) u.labeled = true;
    _saveSessionToStorage();
  }

  _renderT1Session(window._t1Session);
};

function _renderT1Session(s) {
  const main = document.getElementById('main');
  if (!main) return;

  const stats    = _calcStats(s);
  const line     = Store.getLine(s.lineId);
  const lineDisp = line ? (line.line_code || line.display_id) : s.lineId;

  // 孵化日帯
  const hatchDates = s.lots.map(l => l.hatch_date).filter(Boolean).sort();
  const hatchRange = hatchDates.length
    ? (hatchDates[0] === hatchDates[hatchDates.length-1]
        ? hatchDates[0] : hatchDates[0] + '〜' + hatchDates[hatchDates.length-1])
    : '—';

  const canSave  = stats.unprocessed === 0 && stats.allInputComplete && !s.saving;

  main.innerHTML = `
    ${UI.header('T1移行編成セッション', { back: true, backFn: "Pages._t1SessionBack()" })}
    <div class="page-body has-quick-bar" style="padding-bottom:80px">

      <!-- ② セッション概要バー -->
      <div style="background:var(--surface2);border-radius:10px;padding:10px 14px;
        display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.78rem">
        <span style="font-weight:700;color:var(--gold)">${lineDisp}</span>
        <span style="color:var(--text3)">孵化日: ${hatchRange}</span>
        <span style="color:var(--text3)">ロット${s.lots.length}件</span>
        <span style="color:var(--blue)">計${stats.total}頭</span>
        <span style="color:${stats.unprocessed > 0 ? 'var(--red,#e05050)' : 'var(--green)'}">
          未処理${stats.unprocessed}頭
        </span>
      </div>

      <!-- ③ 参加ロット + 個体入力 -->
      ${s.lots.map((lot, li) => _renderLotSection(lot, li, s)).join('')}

      <!-- 別ロット追加 -->
      <button class="btn btn-ghost btn-full" style="margin-top:6px;border-style:dashed"
        onclick="Pages._t1AddLotScan()">
        ＋ 別ロットを追加スキャン 📷
      </button>

      <!-- ④ 未処理個体パネル -->
      ${_renderUnprocessedPanel(s)}

      <!-- ⑤ ユニット作成エリア -->
      ${_renderUnitCreateArea(s)}

      <!-- ⑥ 確定済みユニット一覧 -->
      ${_renderConfirmedUnits(s)}

      <!-- ⑦ 個別飼育 / 販売候補エリア -->
      ${_renderSinglesAndSales(s)}

      <!-- ⑧ 全体サマリ -->
      ${_renderSummary(s, stats)}

    </div>

    <!-- ⑨ 固定フッター -->
    <div class="quick-action-bar">
      <button class="btn btn-ghost btn-xl" style="flex:1"
        onclick="Pages._t1SessionCancel()">キャンセル</button>
      <button class="btn btn-gold btn-xl" style="flex:2"
        ${canSave ? '' : 'disabled'}
        onclick="Pages._t1SessionSave()">
        💾 セッションを確定・保存
      </button>
    </div>`;

  _saveSessionToStorage();
}

// ────────────────────────────────────────────────────────────────
// ロット入力エリア描画
// ────────────────────────────────────────────────────────────────
function _renderLotSection(lot, lotIdx, s) {
  const doneCount = lot.individuals.filter(i => _isInputComplete(i)).length;
  const allDone   = doneCount === lot.count;

  const rows = lot.individuals.map(ind => _renderIndividualRow(ind, lotIdx)).join('');

  const assigned = lot.individuals.filter(i => i.assigned_to !== null).length;
  const dead     = lot.individuals.filter(i => i.assigned_to === 'dead').length;
  const unproc   = lot.individuals.filter(i => i.assigned_to === null && i.size_category !== null).length;

  return `
  <div class="card" style="margin-top:8px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;cursor:pointer"
      onclick="Pages._t1ToggleLot('lot-body-${lotIdx}')">
      <div>
        <span style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">${lot.display_id}</span>
        <span style="font-size:.75rem;color:var(--text3);margin-left:6px">${lot.count}頭 / 孵化: ${lot.hatch_date || '—'}</span>
      </div>
      <span style="font-size:.75rem;color:${allDone ? 'var(--green)' : 'var(--amber)'}">
        ${allDone ? '✅' : ''}入力済み ${doneCount}/${lot.count}
      </span>
    </div>

    <div id="lot-body-${lotIdx}">
      <!-- 列ヘッダー -->
      <div style="display:grid;grid-template-columns:28px 90px 70px 90px 1fr;gap:4px;
        font-size:.62rem;color:var(--text3);padding:0 0 4px;border-bottom:1px solid var(--border)">
        <div>#</div><div>区分</div><div>体重</div><div>状態</div><div>メモ</div>
      </div>
      ${rows}
      <!-- ロット別残数 -->
      <div style="font-size:.7rem;color:var(--text3);margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
        処理済み: ${assigned}頭 / 未処理: ${lot.count - assigned}頭 / 死亡: ${dead}頭
      </div>
    </div>
  </div>`;
}

function _renderIndividualRow(ind, lotIdx) {
  const isDead    = ind.status === 'dead';
  const isComplete = _isInputComplete(ind);
  const assigned  = ind.assigned_to;

  const bgColor = isDead ? 'rgba(224,80,80,.06)' :
                  isComplete ? 'rgba(76,175,120,.04)' : 'transparent';

  const sizeBtns = ['大','中','小'].map(s => {
    const on = ind.size_category === s;
    return `<button type="button" onclick="Pages._t1SetSize('${ind.lot_id}',${ind.lot_item_no},'${s}')"
      style="padding:5px 8px;border-radius:6px;font-size:.78rem;font-weight:700;cursor:pointer;
        border:1px solid ${on ? 'var(--green)' : 'var(--border)'};
        background:${on ? 'var(--green)' : 'var(--surface2)'};
        color:${on ? '#fff' : 'var(--text2)'};
        ${isDead ? 'opacity:.35;pointer-events:none' : ''}"
      ${isDead ? 'disabled' : ''}>${s}</button>`;
  }).join('');

  const statusBtns = ['通常','死亡'].map(st => {
    const key = st === '通常' ? 'normal' : 'dead';
    const on  = ind.status === key;
    return `<button type="button" onclick="Pages._t1SetStatus('${ind.lot_id}',${ind.lot_item_no},'${key}')"
      style="padding:5px 8px;border-radius:6px;font-size:.78rem;font-weight:700;cursor:pointer;
        border:1px solid ${on ? (key==='dead' ? 'var(--red,#e05050)' : 'var(--green)') : 'var(--border)'};
        background:${on ? (key==='dead' ? 'rgba(224,80,80,.2)' : 'var(--green)') : 'var(--surface2)'};
        color:${on ? (key==='dead' ? 'var(--red,#e05050)' : '#fff') : 'var(--text2)'}">${st}</button>`;
  }).join('');

  const assignedBadge = assigned && assigned !== 'dead'
    ? `<span style="font-size:.62rem;padding:1px 5px;border-radius:4px;background:rgba(91,168,232,.15);color:var(--blue)">
        ${assigned === 'unit' ? 'ユニット' : assigned === 'single' ? '個別' : '販売候補'}
      </span>` : '';

  return `
  <div style="display:grid;grid-template-columns:28px 90px 70px 90px 1fr;gap:4px;
    align-items:center;padding:5px 0;border-bottom:1px solid var(--border2);
    background:${bgColor}">
    <div style="font-size:.7rem;color:var(--text3);text-align:center">
      ${ind.lot_item_no}${assignedBadge ? '<br>' + assignedBadge : ''}
    </div>
    <div style="display:flex;gap:3px">${sizeBtns}</div>
    <div>
      <input type="number" inputmode="numeric" min="1" max="999" step="1"
        placeholder="—" value="${ind.weight_g !== null ? ind.weight_g : ''}"
        style="width:60px;padding:5px 4px;text-align:center;border-radius:6px;
          border:1px solid var(--border);background:var(--bg2);
          font-size:.88rem;font-weight:700;color:var(--text1);
          ${isDead ? 'opacity:.35;pointer-events:none' : ''}"
        ${isDead ? 'disabled' : ''}
        oninput="Pages._t1SetWeight('${ind.lot_id}',${ind.lot_item_no},this.value)">
    </div>
    <div style="display:flex;gap:3px">${statusBtns}</div>
    <input type="text" placeholder="メモ"
      value="${ind.memo || ''}"
      style="width:100%;padding:5px 6px;border-radius:6px;border:1px solid var(--border);
        background:var(--bg2);font-size:.75rem;color:var(--text2)"
      oninput="Pages._t1SetMemo('${ind.lot_id}',${ind.lot_item_no},this.value)">
  </div>`;
}

// ────────────────────────────────────────────────────────────────
// 未処理個体パネル描画
// ────────────────────────────────────────────────────────────────
function _renderUnprocessedPanel(s) {
  const unproc = _getUnprocessed(s);
  if (unproc.length === 0) {
    // 全入力前はパネル自体を非表示
    const anyComplete = s.lots.some(l => l.individuals.some(i => _isInputComplete(i)));
    if (!anyComplete) return '';
    return `<div class="card" style="margin-top:8px;padding:14px;text-align:center;font-size:.85rem;color:var(--green)">
      ✅ 全個体の振り分けが完了しました
    </div>`;
  }

  // 補助提案
  const suggestions = _calcSuggestions(unproc);

  const rows = unproc.map(ind => {
    const sel = _isSelected(s, ind);
    return `
    <div style="display:flex;align-items:center;gap:6px;padding:8px 0;
      border-bottom:1px solid var(--border2);
      background:${sel ? 'rgba(91,168,232,.08)' : 'transparent'}">
      <div style="flex:1;min-width:0">
        <span style="font-size:.85rem;font-weight:700;
          color:${ind.size_category==='大'?'var(--blue)':ind.size_category==='中'?'var(--green)':'var(--amber)'}">
          ${ind.size_category}
        </span>
        <span style="font-size:.88rem;font-weight:700;margin-left:4px">${ind.weight_g}g</span>
        <span style="font-size:.7rem;color:var(--text3);margin-left:4px">
          ${ind.lot_display_id} #${ind.lot_item_no}
        </span>
      </div>
      <button class="btn btn-sm ${sel ? 'btn-primary' : 'btn-ghost'}" style="font-size:.72rem;padding:5px 8px"
        onclick="Pages._t1SelectToggle('${ind.lot_id}',${ind.lot_item_no})">
        ${sel ? '選択中' : '選択'}
      </button>
      <button class="btn btn-ghost btn-sm" style="font-size:.72rem;padding:5px 8px"
        onclick="Pages._t1AssignSingle('${ind.lot_id}',${ind.lot_item_no})">
        個別飼育
      </button>
      <button class="btn btn-ghost btn-sm" style="font-size:.72rem;padding:5px 8px;color:var(--amber)"
        onclick="Pages._t1AssignSaleInd('${ind.lot_id}',${ind.lot_item_no})">
        販売候補
      </button>
    </div>`;
  }).join('');

  const suggHtml = suggestions.length > 0
    ? `<div style="background:rgba(76,175,120,.06);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:.75rem">
        💡 補助提案（タップで2頭を選択状態に）:
        ${suggestions.map(sg =>
          `<button class="btn btn-ghost btn-sm" style="margin:2px;font-size:.72rem"
            onclick="Pages._t1SelectPair('${sg.size}')">
            ${sg.size}×2（${sg.lot1} / ${sg.lot2}）
          </button>`
        ).join('')}
      </div>`
    : '';

  return `
  <div class="card" style="margin-top:8px">
    <div class="card-title">未処理個体（${unproc.length}頭）</div>
    ${suggHtml}
    ${rows}
  </div>`;
}

// ────────────────────────────────────────────────────────────────
// ユニット作成エリア描画
// ────────────────────────────────────────────────────────────────
function _renderUnitCreateArea(s) {
  const selected = _getSelected(s);
  if (selected.length === 0) return '';

  const nextId = s.displayIdPool[s.displayIdIndex] || '（採番待ち）';
  const combo  = selected.map(i => i.size_category).join(' ＋ ');
  const canConfirm = selected.length === 2;

  return `
  <div class="card" style="margin-top:8px;border-color:rgba(76,175,120,.4)">
    <div class="card-title">ユニット作成</div>
    <div style="margin-bottom:10px">
      ${selected.map((ind, i) => `
      <div style="display:flex;align-items:center;gap:6px;padding:4px 0">
        <span style="background:var(--green);color:#fff;font-size:.65rem;padding:1px 6px;border-radius:4px">
          席${i+1}
        </span>
        <span style="font-weight:700">${ind.size_category}</span>
        <span>${ind.weight_g}g</span>
        <span style="font-size:.72rem;color:var(--text3)">${ind.lot_display_id} #${ind.lot_item_no}</span>
      </div>`).join('')}
    </div>
    <div style="font-size:.78rem;color:var(--text3);margin-bottom:8px">
      組み合わせ: <b>${combo}</b>
      → <span style="font-family:var(--font-mono);color:var(--gold)">${nextId}</span>
      ${selected.length === 1 ? '<br><span style="color:var(--amber)">⚠️ T1では2頭ユニットを基本とします。もう1頭を選択してください。</span>' : ''}
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" style="flex:1"
        onclick="Pages._t1ClearSelection()">選択解除</button>
      <button class="btn btn-primary" style="flex:2"
        ${canConfirm ? '' : 'disabled'}
        onclick="Pages._t1ConfirmUnit()">
        ユニットを確定してラベル発行 🏷️
      </button>
    </div>
  </div>`;
}

// ────────────────────────────────────────────────────────────────
// 確定済みユニット一覧描画
// ────────────────────────────────────────────────────────────────
function _renderConfirmedUnits(s) {
  if (s.units.length === 0) return '';

  const rows = s.units.map((u, ui) => {
    const saleTag = u.for_sale ? '<span style="font-size:.65rem;padding:1px 6px;border-radius:4px;background:rgba(224,144,64,.2);color:var(--amber);font-weight:700">販売候補</span>' : '';
    const printBtn = u.labeled
      ? `<button class="btn btn-ghost btn-sm" style="font-size:.72rem;color:var(--text3)"
          onclick="Pages._t1PrintUnit(${ui})">✅ 再印刷</button>`
      : `<button class="btn btn-primary btn-sm" style="font-size:.72rem"
          onclick="Pages._t1PrintUnit(${ui})">🏷️ 未印刷</button>`;

    return `
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:6px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div>
          <span style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">${u.display_id}</span>
          <span style="font-size:.72rem;color:var(--text3);margin-left:6px">${u.size_category}</span>
          ${saleTag}
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          ${printBtn}
          <button class="btn btn-ghost btn-sm" style="font-size:.72rem"
            onclick="Pages._t1UnitMenu(${ui})">⋮</button>
        </div>
      </div>
      ${u.members.map(m => `
        <div style="font-size:.75rem;color:var(--text2);display:flex;gap:8px;padding:2px 0">
          <span style="color:var(--text3);min-width:24px">席${m.unit_slot_no}</span>
          <span style="font-weight:700">${m.size_category}</span>
          <span>${m.weight_g}g</span>
          <span style="color:var(--text3)">${m.lot_display_id} #${m.lot_item_no}</span>
        </div>`).join('')}
    </div>`;
  }).join('');

  return `
  <div class="card" style="margin-top:8px">
    <div class="card-title">確定済みユニット（${s.units.length}件）</div>
    ${rows}
  </div>`;
}

// ────────────────────────────────────────────────────────────────
// 個別飼育 / 販売候補エリア描画
// ────────────────────────────────────────────────────────────────
function _renderSinglesAndSales(s) {
  const hasSingles = s.singles.length > 0;
  const hasSaleInd = s.saleIndividuals.length > 0;
  const hasSaleUnit= s.units.some(u => u.for_sale);
  if (!hasSingles && !hasSaleInd && !hasSaleUnit) return '';

  let html = '<div class="card" style="margin-top:8px"><div class="card-title">個別飼育 / 販売候補</div>';

  if (hasSingles) {
    html += `<div style="font-size:.72rem;color:var(--text3);margin-bottom:4px">個別飼育（${s.singles.length}頭）</div>`;
    s.singles.forEach((ind, i) => {
      html += `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border2)">
        <span style="font-weight:700">${ind.size_category}</span>
        <span>${ind.weight_g}g</span>
        <span style="font-size:.72rem;color:var(--text3)">${ind.lot_display_id} #${ind.lot_item_no}</span>
        <button class="btn btn-ghost btn-sm" style="font-size:.68rem;margin-left:auto"
          onclick="Pages._t1ReturnToUnproc('single',${i})">未処理に戻す</button>
        <button class="btn btn-ghost btn-sm" style="font-size:.68rem;color:var(--amber)"
          onclick="Pages._t1SingleToSale(${i})">販売候補へ</button>
      </div>`;
    });
  }

  if (hasSaleInd) {
    html += `<div style="font-size:.72rem;color:var(--text3);margin:8px 0 4px">販売候補 個体（${s.saleIndividuals.length}頭）</div>`;
    s.saleIndividuals.forEach((ind, i) => {
      html += `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border2)">
        <span style="font-weight:700;color:var(--amber)">${ind.size_category}</span>
        <span>${ind.weight_g}g</span>
        <span style="font-size:.72rem;color:var(--text3)">${ind.lot_display_id} #${ind.lot_item_no}</span>
        <button class="btn btn-ghost btn-sm" style="font-size:.68rem;margin-left:auto"
          onclick="Pages._t1ReturnToUnproc('sale_ind',${i})">未処理に戻す</button>
        <button class="btn btn-ghost btn-sm" style="font-size:.68rem"
          onclick="Pages._t1SaleToSingle(${i})">個別飼育へ</button>
      </div>`;
    });
  }

  html += '</div>';
  return html;
}

// ────────────────────────────────────────────────────────────────
// 全体サマリ描画
// ────────────────────────────────────────────────────────────────
function _renderSummary(s, stats) {
  const unlabeled = s.units.filter(u => !u.labeled).length;
  return `
  <div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-top:8px;font-size:.78rem">
    <div style="font-weight:700;margin-bottom:8px;color:var(--text2)">セッションサマリ</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
      <div>参加ロット: <b>${s.lots.length}件</b></div>
      <div>総頭数: <b>${stats.total}頭</b></div>
      <div style="color:var(--blue)">ユニット化: <b>${stats.unitHeads}頭</b>（${s.units.filter(u=>!u.for_sale).length}件）</div>
      <div>個別飼育: <b>${s.singles.length}頭</b></div>
      <div style="color:var(--amber)">販売候補 個体: <b>${s.saleIndividuals.length}頭</b></div>
      <div style="color:var(--amber)">販売候補 ユニット: <b>${s.units.filter(u=>u.for_sale).length}件</b></div>
      <div style="color:var(--red,#e05050)">死亡: <b>${stats.dead}頭</b></div>
      <div style="color:${stats.unprocessed > 0 ? 'var(--red,#e05050)' : 'var(--green)'}">
        未処理: <b>${stats.unprocessed}頭</b>
      </div>
    </div>
    <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px;font-size:.72rem;color:var(--text3)">
      ${s.lots.map(l => {
        const rem = l.individuals.filter(i => i.assigned_to === null && _isInputComplete(i)).length;
        return `${l.display_id}: 残${rem}頭`;
      }).join('  /  ')}
    </div>
    ${unlabeled > 0 ? `<div style="margin-top:6px;color:var(--amber);font-size:.72rem">🏷️ 未印刷のユニットが${unlabeled}件あります</div>` : ''}
    ${!stats.allInputComplete ? `<div style="margin-top:6px;color:var(--red,#e05050);font-size:.72rem">⚠️ 未入力の個体行があります</div>` : ''}
  </div>`;
}

// ────────────────────────────────────────────────────────────────
// 計算ヘルパー
// ────────────────────────────────────────────────────────────────
function _calcStats(s) {
  const allInds = s.lots.flatMap(l => l.individuals);
  const total   = allInds.length;
  const dead    = allInds.filter(i => i.assigned_to === 'dead').length;
  const unitH   = allInds.filter(i => i.assigned_to === 'unit').length;
  const unprocWithInput = allInds.filter(i =>
    i.assigned_to === null && _isInputComplete(i) && i.status !== 'dead'
  ).length;
  const allInputComplete = allInds.every(i => _isInputComplete(i));
  return {
    total, dead,
    unitHeads: unitH,
    unprocessed: unprocWithInput,
    allInputComplete,
  };
}

function _isInputComplete(ind) {
  if (ind.status === 'dead') return true;
  if (ind.assigned_to !== null) return true;
  return ind.size_category !== null && ind.weight_g !== null && ind.weight_g > 0;
}

function _getUnprocessed(s) {
  return s.lots.flatMap(l => l.individuals.map(i => ({
    ...i,
    lot_display_id: l.display_id,
  }))).filter(i =>
    i.assigned_to === null &&
    i.size_category !== null &&
    i.weight_g !== null &&
    i.status !== 'dead'
  );
}

function _getSelected(s) {
  return s.lots.flatMap(l => l.individuals.map(i => ({
    ...i,
    lot_display_id: l.display_id,
  }))).filter(i => i._selected);
}

function _isSelected(s, ind) {
  const lot = s.lots.find(l => l.lot_id === ind.lot_id);
  if (!lot) return false;
  const item = lot.individuals.find(i => i.lot_item_no === ind.lot_item_no);
  return item ? !!item._selected : false;
}

function _calcSuggestions(unproc) {
  const groups = {};
  unproc.forEach(i => {
    if (!groups[i.size_category]) groups[i.size_category] = [];
    groups[i.size_category].push(i);
  });
  const result = [];
  Object.entries(groups).forEach(([size, inds]) => {
    if (inds.length >= 2) {
      result.push({ size, lot1: inds[0].lot_display_id + '#' + inds[0].lot_item_no,
                          lot2: inds[1].lot_display_id + '#' + inds[1].lot_item_no });
    }
  });
  return result;
}

function _findInd(s, lotId, itemNo) {
  const lot = s.lots.find(l => l.lot_id === lotId);
  return lot ? lot.individuals.find(i => i.lot_item_no === itemNo) : null;
}

// ────────────────────────────────────────────────────────────────
// ユーザーアクションハンドラ
// ────────────────────────────────────────────────────────────────

Pages._t1ToggleLot = function (id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
};

Pages._t1SetSize = function (lotId, itemNo, size) {
  const ind = _findInd(window._t1Session, lotId, itemNo);
  if (!ind) return;
  ind.size_category = ind.size_category === size ? null : size;
  _renderT1Session(window._t1Session);
};

Pages._t1SetWeight = function (lotId, itemNo, val) {
  const ind = _findInd(window._t1Session, lotId, itemNo);
  if (!ind) return;
  const n = parseInt(val, 10);
  ind.weight_g = (!val || isNaN(n) || n <= 0) ? null : Math.min(999, n);
  _saveSessionToStorage();
  // 軽量再計算（サマリと未処理パネルだけ更新）
  _partialRefresh();
};

Pages._t1SetStatus = function (lotId, itemNo, status) {
  const ind = _findInd(window._t1Session, lotId, itemNo);
  if (!ind) return;
  ind.status = status;
  if (status === 'dead') {
    ind.size_category = null;
    ind.weight_g      = null;
    ind.assigned_to   = 'dead';
    ind._selected     = false;
  } else {
    if (ind.assigned_to === 'dead') ind.assigned_to = null;
  }
  _renderT1Session(window._t1Session);
};

Pages._t1SetMemo = function (lotId, itemNo, val) {
  const ind = _findInd(window._t1Session, lotId, itemNo);
  if (ind) { ind.memo = val; _saveSessionToStorage(); }
};

Pages._t1SelectToggle = function (lotId, itemNo) {
  const s   = window._t1Session;
  const ind = _findInd(s, lotId, itemNo);
  if (!ind) return;

  if (ind._selected) {
    ind._selected = false;
  } else {
    const selCount = _getSelected(s).length;
    if (selCount >= 2) { UI.toast('2頭まで選択できます', 'info', 1500); return; }
    ind._selected = true;
  }
  _renderT1Session(s);
};

Pages._t1SelectPair = function (size) {
  const s      = window._t1Session;
  const unproc = _getUnprocessed(s);
  const pair   = unproc.filter(i => i.size_category === size).slice(0, 2);
  if (pair.length < 2) return;
  // まず全選択解除
  s.lots.forEach(l => l.individuals.forEach(i => { i._selected = false; }));
  pair.forEach(p => {
    const ind = _findInd(s, p.lot_id, p.lot_item_no);
    if (ind) ind._selected = true;
  });
  _renderT1Session(s);
};

Pages._t1ClearSelection = function () {
  const s = window._t1Session;
  s.lots.forEach(l => l.individuals.forEach(i => { i._selected = false; }));
  _renderT1Session(s);
};

Pages._t1ConfirmUnit = function () {
  const s        = window._t1Session;
  const selected = _getSelected(s);
  if (selected.length !== 2) { UI.toast('2頭選択してください', 'info'); return; }

  let displayId;
  try {
    displayId = _nextDisplayId(s);
  } catch (e) {
    UI.toast(e.message, 'error', 5000);
    return;
  }
  const members   = selected.map((ind, i) => ({
    lot_id:        ind.lot_id,
    lot_item_no:   ind.lot_item_no,
    lot_display_id:ind.lot_display_id,
    size_category: ind.size_category,
    weight_g:      ind.weight_g,
    unit_slot_no:  i + 1,
  }));

  const sizeCategories = [...new Set(members.map(m => m.size_category))];
  const sizeCat = sizeCategories.length === 1 ? sizeCategories[0] : '混成';

  // 割り当て確定
  members.forEach((m, i) => {
    const ind = _findInd(s, m.lot_id, m.lot_item_no);
    if (ind) {
      ind.assigned_to   = 'unit';
      ind.unit_slot_no  = i + 1;
      ind._selected     = false;
    }
  });

  s.units.push({ display_id: displayId, members, size_category: sizeCat, for_sale: false, labeled: false });
  _saveSessionToStorage();

  // ラベル発行プロンプト
  _renderT1Session(s);
  _showLabelPrompt(displayId, false);
};

function _showLabelPrompt(displayId, forSale) {
  const memberInfo = (window._t1Session.units.find(u => u.display_id === displayId)?.members || [])
    .map(m => `${m.size_category} ${m.weight_g}g (${m.lot_display_id}#${m.lot_item_no})`).join(' / ');

  UI.modal(`
    <div class="modal-title">🏷️ ユニット確定</div>
    <div style="text-align:center;margin:12px 0">
      <div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--gold)">${displayId}</div>
      <div style="font-size:.78rem;color:var(--text3);margin-top:4px">${memberInfo}</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">あとで発行</button>
      <button class="btn btn-primary" style="flex:2"
        onclick="UI.closeModal();Pages._t1PrintUnit(${window._t1Session.units.length - 1})">
        今すぐラベルを発行 🏷️
      </button>
    </div>
  `);
}

Pages._t1PrintUnit = function (unitIdx) {
  const s = window._t1Session;
  const u = s.units[unitIdx];
  if (!u) return;
  _saveSessionToStorage();
  routeTo('label-gen', {
    targetType:      'UNIT',
    displayId:       u.display_id,
    labelType:       't1_unit',
    forSale:         u.for_sale,
    backRoute:       't1-session',
    labeledDisplayId: u.display_id,
  });
};

Pages._t1UnitMenu = function (unitIdx) {
  const s = window._t1Session;
  const u = s.units[unitIdx];
  if (!u) return;
  UI.actionSheet([
    {
      label: u.for_sale ? '飼育ユニットに戻す' : '販売候補ユニットにする',
      fn: () => { u.for_sale = !u.for_sale; _renderT1Session(s); }
    },
    {
      label: 'ユニットを解除して未処理に戻す',
      fn: () => {
        u.members.forEach(m => {
          const ind = _findInd(s, m.lot_id, m.lot_item_no);
          if (ind) { ind.assigned_to = null; ind.unit_slot_no = undefined; ind._selected = false; }
        });
        s.units.splice(unitIdx, 1);
        _renderT1Session(s);
      }
    },
    {
      label: '2頭を個別飼育に分割',
      fn: () => {
        u.members.forEach(m => {
          const ind = _findInd(s, m.lot_id, m.lot_item_no);
          if (ind) { ind.assigned_to = 'single'; ind.unit_slot_no = undefined; }
          s.singles.push({
            lot_id: m.lot_id, lot_item_no: m.lot_item_no,
            lot_display_id: m.lot_display_id,
            size_category: m.size_category, weight_g: m.weight_g,
          });
        });
        s.units.splice(unitIdx, 1);
        _renderT1Session(s);
      }
    },
  ]);
};

Pages._t1AssignSingle = function (lotId, itemNo) {
  const s   = window._t1Session;
  const ind = _findInd(s, lotId, itemNo);
  if (!ind) return;
  ind.assigned_to = 'single';
  ind._selected   = false;
  const lot = s.lots.find(l => l.lot_id === lotId);
  s.singles.push({
    lot_id: lotId, lot_item_no: itemNo,
    lot_display_id: lot ? lot.display_id : lotId,
    size_category: ind.size_category, weight_g: ind.weight_g,
  });
  _renderT1Session(s);
};

Pages._t1AssignSaleInd = function (lotId, itemNo) {
  const s   = window._t1Session;
  const ind = _findInd(s, lotId, itemNo);
  if (!ind) return;
  ind.assigned_to = 'sale';
  ind._selected   = false;
  const lot = s.lots.find(l => l.lot_id === lotId);
  s.saleIndividuals.push({
    lot_id: lotId, lot_item_no: itemNo,
    lot_display_id: lot ? lot.display_id : lotId,
    size_category: ind.size_category, weight_g: ind.weight_g,
  });
  _renderT1Session(s);
};

Pages._t1ReturnToUnproc = function (from, idx) {
  const s = window._t1Session;
  let entry;
  if (from === 'single') {
    entry = s.singles.splice(idx, 1)[0];
  } else {
    entry = s.saleIndividuals.splice(idx, 1)[0];
  }
  if (!entry) return;
  const ind = _findInd(s, entry.lot_id, entry.lot_item_no);
  if (ind) { ind.assigned_to = null; ind._selected = false; }
  _renderT1Session(s);
};

Pages._t1SingleToSale = function (idx) {
  const s   = window._t1Session;
  const entry = s.singles.splice(idx, 1)[0];
  if (!entry) return;
  const ind = _findInd(s, entry.lot_id, entry.lot_item_no);
  if (ind) ind.assigned_to = 'sale';
  s.saleIndividuals.push(entry);
  _renderT1Session(s);
};

Pages._t1SaleToSingle = function (idx) {
  const s     = window._t1Session;
  const entry = s.saleIndividuals.splice(idx, 1)[0];
  if (!entry) return;
  const ind = _findInd(s, entry.lot_id, entry.lot_item_no);
  if (ind) ind.assigned_to = 'single';
  s.singles.push(entry);
  _renderT1Session(s);
};

// ────────────────────────────────────────────────────────────────
// 追加ロットスキャン
// ────────────────────────────────────────────────────────────────
Pages._t1AddLotScan = function () {
  window._t1AddingScan = true;
  routeTo('qr-scan', { mode: 't1_add' });
};

Pages._t1TryAddLot = function (lotId) {
  const s   = window._t1Session;
  if (!s) return;
  const lot = Store.getLot(lotId);
  if (!lot) { UI.toast('ロットが見つかりません', 'error'); return false; }

  // 条件チェック
  if (s.lots.some(l => l.lot_id === lotId))
    { UI.toast('すでに追加済みのロットです', 'error'); return false; }
  if (lot.line_id !== s.lineId)
    { UI.toast('別ラインのロットは追加できません', 'error'); return false; }
  if (lot.t1_done)
    { UI.toast('このロットはT1移行済みです', 'error'); return false; }
  const phase = lot.stage_phase || lot.stage || '';
  if (phase && phase !== 'T0' && phase !== 'L1L2')
    { UI.toast('T0ロット以外は追加できません', 'error'); return false; }

  // 孵化日帯チェック（警告のみ）
  const baseDates = s.lots.map(l => l.hatch_date).filter(Boolean);
  if (baseDates.length > 0 && lot.hatch_date) {
    const baseDateMs = new Date(baseDates[0].replace(/\//g, '-')).getTime();
    const candDateMs = new Date(lot.hatch_date.replace(/\//g, '-')).getTime();
    const diff = Math.abs((baseDateMs - candDateMs) / 86400000);
    if (diff > 21) {
      if (!confirm(`孵化日が ${Math.round(diff)} 日離れています。追加しますか？`)) return false;
    }
  }

  s.lots.push(_buildLotEntry(lot));
  _saveSessionToStorage();
  routeTo('t1-session');
  return true;
};

// ────────────────────────────────────────────────────────────────
// 保存 / キャンセル
// ────────────────────────────────────────────────────────────────
Pages._t1SessionBack = function () {
  if (confirm('セッションを一時中断しますか？（セッション内容は保存されます）')) {
    routeTo('qr-scan', { mode: 't1' });
  }
};

Pages._t1SessionCancel = function () {
  if (confirm('セッションを破棄しますか？（入力内容は全て失われます）')) {
    window._t1Session = null;
    sessionStorage.removeItem('_t1SessionData');
    routeTo('qr-scan', { mode: 't1' });
  }
};

Pages._t1SessionSave = async function () {
  const s = window._t1Session;
  if (!s || s.saving) return;

  const stats = _calcStats(s);
  if (stats.unprocessed > 0 || !stats.allInputComplete) {
    UI.toast('全個体を処理してから保存してください', 'error'); return;
  }

  // 確認モーダル
  const unitCount   = s.units.filter(u => !u.for_sale).length;
  const saleUCount  = s.units.filter(u => u.for_sale).length;
  const msg = `T1移行を確定します（取り消せません）\n\n`
    + `飼育ユニット: ${unitCount}件\n`
    + `個別飼育: ${s.singles.length}頭\n`
    + `販売候補（個体）: ${s.saleIndividuals.length}頭\n`
    + `販売候補（ユニット）: ${saleUCount}件\n`
    + `死亡記録: ${stats.dead}頭\n\n`
    + `参加ロット: ${s.lots.map(l => l.display_id).join(', ')}\n`
    + `→ T1移行済みフラグが更新されます`;

  if (!confirm(msg)) return;

  s.saving = true;
  _renderT1Session(s);

  try {
    const payload = _buildSavePayload(s);
    const res     = await API.t1.createSession(payload);
    // breeding_units を Store に追加（GASから返ってきた完全なオブジェクト）
    if (res && res.units && Array.isArray(res.units)) {
      res.units.forEach(function(u) { Store.addDBItem('breeding_units', u); });
    }
    // 作成された individuals を Store に追加
    if (res && res.individuals && Array.isArray(res.individuals)) {
      res.individuals.forEach(function(ind) { Store.addDBItem('individuals', ind); });
    }
    // ロットを t1_done 状態にパッチ
    s.lots.forEach(l => Store.patchDBItem('lots', 'lot_id', l.lot_id, {
      t1_done: true,
      t1_done_at: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
    }));
    // クリア
    window._t1Session = null;
    sessionStorage.removeItem('_t1SessionData');
    UI.toast('T1移行を完了しました ✅', 'success');
    routeTo('lot-detail', { lotId: s.lots[0].lot_id });
  } catch (e) {
    s.saving = false;
    _renderT1Session(s);
    UI.toast('保存失敗: ' + (e.message || '通信エラー'), 'error');
  }
};

function _buildSavePayload(s) {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
  const allInds = s.lots.flatMap(l => l.individuals.map(i => ({
    ...i,
    lot_display_id: l.display_id,
    lot_hatch_date: l.hatch_date,
  })));

  // growth_records 用: 全個体（死亡含む）
  const growthEntries = allInds.map(ind => {
    const isDead = ind.status === 'dead';
    // unit_slot_no と unit_display_id を解決
    let unitDisplayId = null;
    let unitSlotNo    = null;
    if (ind.assigned_to === 'unit') {
      const u = s.units.find(u => u.members.some(m => m.lot_id === ind.lot_id && m.lot_item_no === ind.lot_item_no));
      if (u) {
        unitDisplayId = u.display_id;
        const m = u.members.find(m => m.lot_id === ind.lot_id && m.lot_item_no === ind.lot_item_no);
        unitSlotNo = m ? m.unit_slot_no : null;
      }
    }
    // 日齢計算
    let ageDays = null;
    if (ind.lot_hatch_date) {
      const hd = new Date(ind.lot_hatch_date.replace(/\//g, '-'));
      ageDays = Math.floor((new Date() - hd) / 86400000);
    }
    return {
      target_type:      'LOT',
      target_id:        ind.lot_id,
      lot_item_no:      ind.lot_item_no,
      record_date:      today,
      weight_g:         isDead ? null : ind.weight_g,
      size_category:    isDead ? null : ind.size_category,
      stage:            'L1L2',
      mat_type:         'T1',
      container:        '2.7L',
      exchange_type:    'FULL',
      event_type:       isDead ? 'ATTRITION' : 'T1_START',
      assigned_to:      ind.assigned_to,
      unit_display_id:  unitDisplayId,
      unit_slot_no:     unitSlotNo,
      age_days:         ageDays,
      note_private:     ind.memo || '',
    };
  });

  return {
    transaction_type: 'T1_SESSION',
    session_date:     today,
    lot_ids:          s.lots.map(l => l.lot_id),
    growth_entries:   growthEntries,
    units: s.units.map(u => ({
      display_id:    u.display_id,
      for_sale:      u.for_sale,
      size_category: u.size_category,
      members:       u.members,
    })),
    singles:          s.singles,
    sale_individuals: s.saleIndividuals,
    dead: allInds.filter(i => i.assigned_to === 'dead').map(i => ({
      lot_id: i.lot_id, lot_item_no: i.lot_item_no,
    })),
  };
}

// ────────────────────────────────────────────────────────────────
// 軽量リフレッシュ（体重入力中にフルre-renderしない）
// ────────────────────────────────────────────────────────────────
let _partialRefreshTimer = null;
function _partialRefresh() {
  clearTimeout(_partialRefreshTimer);
  _partialRefreshTimer = setTimeout(() => _renderT1Session(window._t1Session), 300);
}

// ────────────────────────────────────────────────────────────────
// ページ登録
// ────────────────────────────────────────────────────────────────
window.PAGES = window.PAGES || {};
window.PAGES['t1-session'] = function () {
  Pages.t1Session(Store.getParams());
};
