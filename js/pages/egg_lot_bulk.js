// ════════════════════════════════════════════════════════════════
// egg_lot_bulk.js v2 — 卵ロット一括作成
//
// 変更点 v2:
//   - 共通初期値（容器/マット/ステージ）を編集可能に
//   - 各行で容器を 1.8L / 2.7L から個別選択可能に
//   - 自動容器提案なし（ユーザーが決める）
//   - ラベル連続発行: label.js の _eblQueueIdx パラメータ連携で「次のラベルへ」対応
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 完了画面を静的に描画（キュー戻りから呼ばれる） ──────────────
// window._eblLabelList と window._eblLineId を使って完了画面を再生成する
function _renderCompleteStatic(main, results, lineId, line) {
  const lineDisp = line
    ? (line.line_code || line.display_id) + (line.line_name ? ' / ' + line.line_name : '')
    : '?';

  main.innerHTML = `
    ${UI.header('🥚 登録完了', { back: true })}
    <div class="page-body">

      <div style="background:rgba(45,122,82,.1);border:1px solid rgba(45,122,82,.35);
        border-radius:12px;padding:14px 16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:1.4rem">✅</span>
          <div>
            <div style="font-weight:700;font-size:1rem;color:var(--green)">
              ${results.length}件のラベル発行が完了しました
            </div>
            <div style="font-size:.72rem;color:var(--text3);margin-top:2px">
              ライン: <b>${lineDisp}</b>
              ／ ロット: <b>${results.filter(r=>r.type==='LOT').length}</b>件
              ${results.filter(r=>r.type==='IND').length
                ? ` ／ 個別化: <b>${results.filter(r=>r.type==='IND').length}</b>件` : ''}
            </div>
          </div>
        </div>
        <!-- 再発行ボタン -->
        <button class="btn btn-ghost btn-full" style="font-size:.85rem"
          onclick="window._eblGoNextLabel(-1)">
          🖨 最初からラベルを再発行
        </button>
      </div>

      <div class="card">
        <div class="card-title">発行済みラベル一覧</div>
        ${results.map((r, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:10px 0;${i < results.length-1 ? 'border-bottom:1px solid var(--border2)' : ''}">
          <div>
            <div style="font-family:var(--font-mono);font-weight:700;font-size:.9rem;color:var(--gold)">
              ${r.displayId}
            </div>
            <div style="font-size:.7rem;color:var(--text3);margin-top:2px">
              ${r.type==='LOT'
                ? `<span style="color:var(--blue)">📦 ロット</span> ${r.count}個`
                : `<span style="color:var(--female,#f06292)">🐛 個別化</span> 1頭`}
              ／ 採卵日: ${r.date}
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" style="font-size:.78rem"
            onclick="routeTo('label-gen',{targetType:'${r.type}',targetId:'${r.id}',displayId:'${r.displayId}',_eblQueueIdx:${i},_eblQueueTotal:${results.length}})">
            🏷️ 再発行
          </button>
        </div>`).join('')}
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${lineId ? `
        <button class="btn btn-ghost" style="flex:1;min-width:110px"
          onclick="routeTo('lot-list',{line_id:'${lineId}'})">
          📦 ロット一覧
        </button>` : ''}
        <button class="btn btn-ghost" style="flex:1;min-width:110px"
          onclick="Pages.eggLotBulk({lineId:'${lineId}'})">
          🥚 続けて作成
        </button>
      </div>

    </div>`;
}

// ── ライン卵配分集計（採卵総数・配分済み・未配分を計算） ─────────
function _eblCalcLineStats(lineId) {
  if (!lineId) return null;

  var lots        = Store.getDB('lots')        || [];
  var inds        = Store.getDB('individuals') || [];
  var allPairings = Store.getDB('pairings')    || [];
  var eggRecs     = Store.getDB('egg_records') || [];

  // ── ラインオブジェクトを取得（後方互換フィルタに必要）──────────
  var line = Store.getLine(lineId);

  // ── manage.js と完全同一のペアリングフィルタ ──────────────────
  // 後方互換: line_id 未設定のレガシーデータは父母 par_id で照合
  var linePairs = allPairings.filter(function(p) {
    if (p.line_id === lineId) return true;
    if (!p.line_id && line && line.father_par_id && line.mother_par_id) {
      return (p.father_par_id === line.father_par_id &&
              p.mother_par_id === line.mother_par_id);
    }
    return false;
  });

  // set_id のルックアップ用ハッシュ
  var setPairIds = {};
  linePairs.forEach(function(p) { setPairIds[p.set_id] = true; });

  var lineEggRecs = eggRecs.filter(function(r) { return setPairIds[r.set_id]; });

  // ── 採卵総数 ─────────────────────────────────────────────────
  // egg_records があれば egg_count の合計、なければ pairings.total_eggs
  var totalEggs = lineEggRecs.length > 0
    ? lineEggRecs.reduce(function(s,r){ return s + (parseInt(r.egg_count,10)||0); }, 0)
    : linePairs.reduce(function(s,p){ return s + (parseInt(p.total_eggs,10)||0); }, 0);

  // ── 腐卵数 ───────────────────────────────────────────────────
  var rottenEggs = lineEggRecs.reduce(function(s,r){ return s + (parseInt(r.failed_count,10)||0); }, 0);

  // ── このラインの全ロット ─────────────────────────────────────
  var allLots   = lots.filter(function(l){ return l.line_id === lineId; });
  var allLotIds = {};
  allLots.forEach(function(l){ allLotIds[l.lot_id] = true; });

  // ロット化累計（ルートロットの initial_count のみ：分割子ロットを除外）
  var rootLots     = allLots.filter(function(l){ return !l.parent_lot_id || l.parent_lot_id === ''; });
  var lotInitTotal = rootLots.reduce(function(s,l){ return s + (parseInt(l.initial_count,10)||0); }, 0);

  // 直接個体化数（lot_id 未設定 or このラインのロットに属さない個体）
  var lineInds   = inds.filter(function(i){ return i.line_id === lineId; });
  var directInds = lineInds.filter(function(i){
    return !i.lot_id || i.lot_id === '' || !allLotIds[i.lot_id];
  });

  var distributed = lotInitTotal + directInds.length;
  var unallocated = Math.max(0, totalEggs - rottenEggs - distributed);

  return { totalEggs: totalEggs, rottenEggs: rottenEggs, distributed: distributed, unallocated: unallocated };
}


Pages.eggLotBulk = function (params = {}) {
  const main = document.getElementById('main');

  // ── _showComplete: ラベル発行後に完了画面を復元 ──────────────
  // label.js の「← 戻る」や「完了画面へ戻る」から来た場合
  if (params._showComplete && window._eblLabelList && window._eblLabelList.length > 0) {
    // 完了画面を再表示して終了
    const line = (Store.getDB('lines') || []).find(l => l.line_id === window._eblLineId);
    _renderCompleteStatic(main, window._eblLabelList, window._eblLineId, line);
    return;
  }

  // ── 状態 ──────────────────────────────────────────────────────
  const initLineId = params.lineId || params.line_id || '';
  let _selLineId   = initLineId;
  let _commonDate  = new Date().toISOString().split('T')[0];
  let _nextRowId   = 4;
  let _savedResults = null;

  // 共通初期値（変更可能）
  let _commonContainer = '1.8L';
  let _commonMat       = 'T0';
  let _commonStage     = 'L1L2';

  // 行データ（各行に container を持たせる）
  let _rows = [
    { id: 1, count: '', collectDate: '', container: '1.8L' },
    { id: 2, count: '', collectDate: '', container: '1.8L' },
    { id: 3, count: '', collectDate: '', container: '1.8L' },
  ];

  // ── ヘルパー ──────────────────────────────────────────────────
  function _todayYMD() { return new Date().toISOString().split('T')[0]; }

  function _rowBadge(count) {
    const n = parseInt(count, 10);
    if (isNaN(n) || n <= 0) return '<span style="color:var(--text3);font-size:.7rem">—</span>';
    if (n === 1) return '<span style="font-size:.65rem;padding:1px 6px;border-radius:6px;background:rgba(232,127,160,.15);color:var(--female,#f06292);font-weight:700">個別化</span>';
    return '<span style="font-size:.65rem;padding:1px 6px;border-radius:6px;background:rgba(91,168,232,.12);color:var(--blue);font-weight:700">ロット</span>';
  }

  function _containerBtn(rowId, val, current) {
    const on = val === current;
    return `<button type="button"
      style="flex:1;padding:6px 4px;border-radius:7px;font-size:.75rem;font-weight:700;cursor:pointer;
        border:1px solid ${on ? 'var(--green)' : 'var(--border)'};
        background:${on ? 'var(--green)' : 'var(--surface2)'};
        color:${on ? '#fff' : 'var(--text2)'}"
      onclick="Pages._eblSetRowContainer(${rowId},'${val}')">${val}</button>`;
  }

  // DOM から全状態を読み込む（再描画前に必ず呼ぶ）
  function _readDom() {
    const lineEl  = document.getElementById('ebl-line');
    const cmnDate = document.getElementById('ebl-common-date');
    const cmnCont = document.getElementById('ebl-common-container');
    const cmnMat  = document.getElementById('ebl-common-mat');
    const cmnStg  = document.getElementById('ebl-common-stage');
    if (lineEl && lineEl.value)  _selLineId       = lineEl.value;
    if (cmnDate && cmnDate.value) _commonDate     = cmnDate.value;
    if (cmnCont && cmnCont.value) _commonContainer = cmnCont.value;
    if (cmnMat  && cmnMat.value)  _commonMat      = cmnMat.value;
    if (cmnStg  && cmnStg.value)  _commonStage    = cmnStg.value;
    _rows.forEach(row => {
      const c = document.getElementById('ebl-cnt-' + row.id);
      const d = document.getElementById('ebl-dat-' + row.id);
      if (c) row.count       = c.value;
      if (d) row.collectDate = d.value;
      // container は _eblSetRowContainer で直接更新するので DOM 読み不要
    });
  }

  // ── 描画 ──────────────────────────────────────────────────────
  function render(keepScroll) {
    const sy = keepScroll ? main.scrollTop : 0;

    const lines       = Store.getDB('lines') || [];
    const activeLines = lines.filter(l => l.status !== 'archived' && l.status !== 'deleted');
    const lineOpts    = activeLines.map(l => {
      const label = (l.line_code || l.display_id || l.line_id)
        + (l.line_name ? ' / ' + l.line_name : '');
      return `<option value="${l.line_id}" ${l.line_id === _selLineId ? 'selected' : ''}>${label}</option>`;
    }).join('');

    const filledRows    = _rows.filter(r => parseInt(r.count, 10) > 0);
    const thisInputTotal= filledRows.reduce((s, r) => s + (parseInt(r.count, 10) || 0), 0);
    const lotCount      = filledRows.filter(r => parseInt(r.count, 10) >= 2).length;
    const indCount      = filledRows.filter(r => parseInt(r.count, 10) === 1).length;
    // 後方互換のため内部変数名を維持
    const totalEggs     = thisInputTotal;

    // ── ライン集計（採卵数・配分済み・未配分） ──────────────────
    const _stats   = _selLineId ? _eblCalcLineStats(_selLineId) : null;
    const _unalloc = _stats ? _stats.unallocated : null;
    const _overLimit = _stats !== null && thisInputTotal > _stats.unallocated;
    const canSave  = _selLineId && filledRows.length > 0 && !_overLimit;

    main.innerHTML = `
      ${UI.header('🥚 卵ロット一括作成', { back: true })}
      <div class="page-body has-quick-bar">

        <!-- ① ライン + 採卵日 -->
        <div class="card">
          <div class="card-title">基本設定</div>

          <div class="field">
            <label class="field-label">ライン <em style="color:var(--red)">*</em></label>
            <select id="ebl-line" class="input" onchange="Pages._eblOnLineChange(this.value)">
              <option value="">ラインを選択...</option>
              ${lineOpts}
            </select>
          </div>

          <div class="field">
            <label class="field-label">共通採卵日</label>
            <div style="display:flex;gap:6px">
              <input type="date" id="ebl-common-date" class="input" style="flex:1"
                value="${_commonDate}" max="${_todayYMD()}"
                onchange="Pages._eblSetCommonDate(this.value)">
              <button class="btn btn-ghost btn-sm" style="white-space:nowrap"
                onclick="Pages._eblApplyCommonDate()">全行へ</button>
            </div>
          </div>
        </div>

        <!-- ② ライン卵配分サマリ -->
        ${_stats ? `
        <div style="border-radius:10px;padding:12px 14px;
          border:1px solid ${_overLimit ? 'rgba(224,80,80,.45)' : 'rgba(45,122,82,.3)'};
          background:${_overLimit ? 'rgba(224,80,80,.06)' : 'rgba(45,122,82,.05)'}">
          <div style="font-size:.72rem;font-weight:700;
            color:${_overLimit ? 'var(--red,#e05050)' : 'var(--text2)'};margin-bottom:8px">
            ${_overLimit ? '⚠️ 入力数が未配分数を超えています' : '🥚 卵の配分状況'}
          </div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;text-align:center">
            <div style="background:var(--surface2);border-radius:6px;padding:6px 2px">
              <div style="font-size:.58rem;color:var(--text3)">採卵総数</div>
              <div style="font-weight:700;font-size:.95rem;color:var(--amber)">${_stats.totalEggs}</div>
            </div>
            <div style="background:var(--surface2);border-radius:6px;padding:6px 2px">
              <div style="font-size:.58rem;color:var(--text3)">配分済み</div>
              <div style="font-weight:700;font-size:.95rem;color:var(--text2)">${_stats.distributed}</div>
            </div>
            <div style="background:var(--surface2);border-radius:6px;padding:6px 2px">
              <div style="font-size:.58rem;color:var(--text3)">未配分</div>
              <div style="font-weight:700;font-size:.95rem;
                color:${_stats.unallocated <= 0 ? 'var(--red,#e05050)' : 'var(--green)'}">
                ${_stats.unallocated}
              </div>
            </div>
            <div style="background:var(--surface2);border-radius:6px;padding:6px 2px">
              <div style="font-size:.58rem;color:var(--text3)">今回入力</div>
              <div style="font-weight:700;font-size:.95rem;
                color:${_overLimit ? 'var(--red,#e05050)' : 'var(--blue)'}">
                ${thisInputTotal}
              </div>
            </div>
            <div style="background:var(--surface2);border-radius:6px;padding:6px 2px">
              <div style="font-size:.58rem;color:var(--text3)">登録後残り</div>
              <div style="font-weight:700;font-size:.95rem;
                color:${(_stats.unallocated - thisInputTotal) < 0 ? 'var(--red,#e05050)' : 'var(--text2)'}">
                ${_stats.unallocated - thisInputTotal}
              </div>
            </div>
          </div>
        </div>` : ''}

        <!-- ③ 共通初期値（変更可能） -->
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div class="card-title" style="margin:0">共通初期値</div>
            <button class="btn btn-ghost btn-sm" style="font-size:.75rem"
              onclick="Pages._eblApplyCommonValues()">全行へ反映</button>
          </div>

          <div class="field">
            <label class="field-label" style="font-size:.7rem;color:var(--text3)">容器</label>
            <select id="ebl-common-container" class="input" style="font-size:.88rem"
              onchange="Pages._eblOnCommonChange()">
              <option value="1.8L" ${_commonContainer==='1.8L'?'selected':''}>1.8L</option>
              <option value="2.7L" ${_commonContainer==='2.7L'?'selected':''}>2.7L</option>
            </select>
          </div>

          <div class="field">
            <label class="field-label" style="font-size:.7rem;color:var(--text3)">マット</label>
            <select id="ebl-common-mat" class="input" style="font-size:.88rem"
              onchange="Pages._eblOnCommonChange()">
              ${['T0','T1','T2','T3'].map(v =>
                `<option value="${v}" ${_commonMat===v?'selected':''}>${v}</option>`
              ).join('')}
            </select>
          </div>

          <div class="field">
            <label class="field-label" style="font-size:.7rem;color:var(--text3)">ステージ</label>
            <select id="ebl-common-stage" class="input" style="font-size:.88rem"
              onchange="Pages._eblOnCommonChange()">
              ${[['L1L2','L1L2'],['L3','L3'],['PREPUPA','前蛹']].map(([v,l]) =>
                `<option value="${v}" ${_commonStage===v?'selected':''}>${l}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <!-- ③ 行入力 -->
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div class="card-title" style="margin:0">
              卵容器リスト（${_rows.length}行）
            </div>
            ${filledRows.length > 0 ? `
            <div style="font-size:.72rem;color:var(--text3)">
              計 <b style="color:var(--blue)">${totalEggs}</b>個
              ／ロット <b style="color:var(--green)">${lotCount}</b>
              ${indCount ? `／個別化 <b style="color:var(--female,#f06292)">${indCount}</b>` : ''}
            </div>` : ''}
          </div>

          <!-- 列ヘッダー -->
          <div style="display:grid;grid-template-columns:24px 62px 1fr 80px auto;gap:4px;
            font-size:.63rem;color:var(--text3);font-weight:700;
            padding:0 0 6px;border-bottom:1px solid var(--border)">
            <div></div>
            <div style="text-align:center">卵数</div>
            <div>採卵日</div>
            <div style="text-align:center">容器</div>
            <div></div>
          </div>

          <!-- 行 -->
          <div id="ebl-row-list">
            ${_rows.map((row, i) => `
            <div id="ebl-row-wrap-${row.id}"
              style="display:grid;grid-template-columns:24px 62px 1fr 80px auto;gap:4px;
                align-items:center;padding:6px 0;
                ${i < _rows.length-1 ? 'border-bottom:1px solid var(--border2)' : ''}">
              <div style="font-size:.68rem;color:var(--text3);text-align:center">${i+1}</div>
              <div>
                <input type="number" id="ebl-cnt-${row.id}" class="input"
                  style="text-align:center;font-size:1rem;font-weight:700;padding:8px 2px"
                  placeholder="0" min="0" max="99" value="${row.count}"
                  oninput="Pages._eblOnCountInput(${row.id},this.value)">
                <div id="ebl-badge-${row.id}" style="text-align:center;margin-top:2px;min-height:16px">
                  ${_rowBadge(row.count)}
                </div>
              </div>
              <input type="date" id="ebl-dat-${row.id}" class="input"
                style="font-size:.75rem;padding:7px 4px"
                value="${row.collectDate || _commonDate}" max="${_todayYMD()}">
              <div style="display:flex;gap:3px">
                ${_containerBtn(row.id, '1.8L', row.container)}
                ${_containerBtn(row.id, '2.7L', row.container)}
              </div>
              <button class="btn btn-ghost btn-sm" style="padding:6px 8px;color:var(--text3)"
                onclick="Pages._eblRemoveRow(${row.id})"
                ${_rows.length <= 1 ? 'disabled' : ''}>✕</button>
            </div>`).join('')}
          </div>

          <button class="btn btn-ghost btn-full" style="margin-top:10px"
            onclick="Pages._eblAddRow()">＋ 行を追加</button>
        </div>

        <!-- ④ サマリプレビュー -->
        ${filledRows.length > 0 ? `
        <div style="border:1px solid rgba(45,122,82,.3);border-radius:10px;
          background:rgba(45,122,82,.05);padding:12px 14px">
          <div style="font-size:.78rem;font-weight:700;color:var(--green);margin-bottom:6px">
            📋 登録予定 ${filledRows.length}件
          </div>
          ${_rows.filter(r => parseInt(r.count,10) > 0).map((r,i) => {
            const n = parseInt(r.count,10);
            const d = r.collectDate || _commonDate;
            const isInd = n === 1;
            return `<div style="font-size:.78rem;padding:3px 0;display:flex;gap:6px;align-items:center">
              <span style="color:var(--text3);min-width:18px">${i+1}.</span>
              ${isInd
                ? `<span style="color:var(--female,#f06292);font-weight:700">🐛 個別化</span> 1頭`
                : `<span style="color:var(--blue);font-weight:700">📦 ロット</span> ${n}個`}
              <span style="color:var(--text3);font-size:.7rem">
                ${r.container} / ${_commonMat} / 採卵日: ${d.replace(/-/g,'/')}
              </span>
            </div>`;
          }).join('')}
        </div>` : `
        <div style="text-align:center;padding:16px;color:var(--text3);font-size:.85rem">
          卵数を入力すると登録予定が表示されます
        </div>`}

      </div>

      <div class="quick-action-bar">
        <button class="btn btn-ghost btn-xl" style="flex:1" id="ebl-back-btn">← 戻る</button>
        <button class="btn btn-gold btn-xl" style="flex:2" id="ebl-save-btn"
          onclick="Pages._eblSave()" ${canSave ? '' : 'disabled'}>
          ${_overLimit ? '⚠️ 未配分数を超えています' : '🥚 登録してラベル発行'}
        </button>
      </div>`;

    document.getElementById('ebl-back-btn')?.addEventListener('click', () => Store.back());
    if (keepScroll) main.scrollTop = sy;
  }

  // ── イベントハンドラ ─────────────────────────────────────────

  Pages._eblOnLineChange = function(v) { _readDom(); _selLineId = v; render(true); };

  Pages._eblSetCommonDate = function(v) { _commonDate = v; };

  Pages._eblApplyCommonDate = function() {
    _readDom();
    _rows.forEach(r => { r.collectDate = _commonDate; });
    render(true);
  };

  // 共通初期値を変更したとき（DOM読み込みのみ、再描画なし）
  Pages._eblOnCommonChange = function() {
    const cc = document.getElementById('ebl-common-container');
    const cm = document.getElementById('ebl-common-mat');
    const cs = document.getElementById('ebl-common-stage');
    if (cc) _commonContainer = cc.value;
    if (cm) _commonMat       = cm.value;
    if (cs) _commonStage     = cs.value;
  };

  // 共通初期値を全行へ反映
  Pages._eblApplyCommonValues = function() {
    _readDom();
    _rows.forEach(r => { r.container = _commonContainer; });
    render(true);
  };

  // 行の容器を個別変更
  Pages._eblSetRowContainer = function(id, val) {
    _readDom();
    const row = _rows.find(r => r.id === id);
    if (row) row.container = val;
    render(true);
  };

  Pages._eblOnCountInput = function(id, val) {
    const row = _rows.find(r => r.id === id);
    if (row) row.count = val;
    const badgeEl = document.getElementById('ebl-badge-' + id);
    if (badgeEl) badgeEl.innerHTML = _rowBadge(val);
    _readDom(); render(true);
  };

  Pages._eblAddRow = function() {
    _readDom();
    _rows.push({ id: _nextRowId++, count: '', collectDate: _commonDate, container: _commonContainer });
    render(true);
    setTimeout(() => document.getElementById('ebl-cnt-' + (_nextRowId-1))?.focus(), 50);
  };

  Pages._eblRemoveRow = function(id) {
    if (_rows.length <= 1) return;
    _readDom();
    _rows = _rows.filter(r => r.id !== id);
    render(true);
  };

  // ── 保存処理（一括API版: LOT は createLotBulk、IND は createIndividualBulk）──
  // 従来: N件 × 1回API = N × ~7秒 ≒ 20秒
  // 改善: 最大2回API（LOT一括 + IND一括）= ~4秒以下
  Pages._eblSave = async function() {
    _readDom();

    // デバッグ: API グローバル確認
    console.log('[EBL] save - typeof API=', typeof API, '/ window.API=', !!window.API);
    if (typeof API === 'undefined') {
      console.error('[EBL] API is undefined at save time!');
      UI.toast('APIが読み込まれていません。ページを再読み込みしてください', 'error'); return;
    }
    if (!_selLineId) { UI.toast('ラインを選択してください', 'error'); return; }

    const targets = _rows.filter(r => {
      const n = parseInt(r.count, 10);
      return !isNaN(n) && n > 0;
    });
    if (targets.length === 0) { UI.toast('卵数を1以上入力してください', 'error'); return; }

    // ── 保存時バリデーション: 未配分数チェック ──────────────────
    const _saveStats = _eblCalcLineStats(_selLineId);
    if (_saveStats) {
      const _saveTotal = targets.reduce(function(s, r) { return s + (parseInt(r.count,10)||0); }, 0);
      if (_saveTotal > _saveStats.unallocated) {
        UI.toast('今回入力（' + _saveTotal + '個）が未配分数（' + _saveStats.unallocated + '個）を超えています', 'error', 5000);
        return;
      }
    }

    const saveBtn = document.getElementById('ebl-save-btn');
    const backBtn = document.getElementById('ebl-back-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ 登録中...'; }
    if (backBtn) backBtn.disabled = true;

    const mat   = _commonMat   || 'T0';
    const stage = _commonStage || 'L1L2';
    const line  = (Store.getDB('lines') || []).find(l => l.line_id === _selLineId);

    // ── LOT行とIND行に分ける（入力順を保持するため _rowPos を付与）──
    const targetsWithPos = targets.map(function(r, i) { return Object.assign({}, r, { _rowPos: i }); });
    const lotRows = targetsWithPos.filter(r => parseInt(r.count, 10) >= 2);
    const indRows = targetsWithPos.filter(r => parseInt(r.count, 10) === 1);

    const results = [];
    const errors  = [];

    // ── ① ロット一括作成（createLotBulk: 1回のAPI呼び出し） ──
    if (lotRows.length > 0) {
      try {
        console.log('[EGG_BULK] create lots start - count:', lotRows.length);
        console.time('[EBL] createLotBulk');
        const payload = {
          line_id:        _selLineId,
          stage,
          mat_type:       mat,
          lots: lotRows.map(row => ({
            count:          parseInt(row.count, 10),
            container_size: row.container || _commonContainer || '1.8L',
            mat_type:       mat,
            note:           '採卵日: ' + (row.collectDate || _commonDate || _todayYMD()).replace(/-/g, '/'),
          })),
        };
        const res = await API.lot.createBulk(payload);
        console.timeEnd('[EBL] createLotBulk');
        // createLotBulk returns { created: [{lot_id, display_id, count},...] }
        (res.created || []).forEach((r, i) => {
          const row  = lotRows[i];
          const date = (row.collectDate || _commonDate || _todayYMD()).replace(/-/g, '/');
          const _lRow = lotRows[i] || {};
          results.push({ type: 'LOT', id: r.lot_id, displayId: r.display_id, count: r.count, date,
            container: _lRow.container || _commonContainer || '1.8L',
            _rowPos: _lRow._rowPos !== undefined ? _lRow._rowPos : i });
        });
      } catch (e) {
        errors.push('ロット一括作成失敗: ' + (e.message || '不明なエラー'));
      }
    }

    // ── ② 個体一括作成（createIndividualBulk: 1回のAPI呼び出し） ──
    if (indRows.length > 0) {
      try {
        console.log('[EGG_BULK] create individuals start - count:', indRows.length);
        console.log('[EGG_BULK] create individuals action = createIndividualBulk');
        console.time('[EBL] createIndividualBulk');
        const payload = {
          line_id: _selLineId,
          individuals: indRows.map(row => ({
            current_stage:     stage,
            current_mat:       mat,
            current_container: row.container || _commonContainer || '1.8L',
            individual_date:   (row.collectDate || _commonDate || _todayYMD()).replace(/-/g, '/'),
            note_private:      '採卵日: ' + (row.collectDate || _commonDate || _todayYMD()).replace(/-/g, '/') + '（卵1個・個別化）',
            status:            'larva',
          })),
        };
        const res = await API.individual.createBulk(payload);
        console.timeEnd('[EBL] createIndividualBulk');
        console.log('[EGG_BULK] create individuals response =', JSON.stringify(res).slice(0, 200));
        (res.created || []).forEach((r, i) => {
          const row  = indRows[i];
          const date = (row.collectDate || _commonDate || _todayYMD()).replace(/-/g, '/');
          const _iRow = indRows[i] || {};
          results.push({ type: 'IND', id: r.ind_id, displayId: r.display_id, count: 1, date,
            container: _iRow.container || _commonContainer || '1.8L',
            _rowPos: _iRow._rowPos !== undefined ? _iRow._rowPos : (lotRows.length + i) });
        });
      } catch (e) {
        errors.push('個別化一括作成失敗: ' + (e.message || '不明なエラー'));
      }
    }

    console.log('[EGG_BULK] result summary - lots:', results.filter(r=>r.type==='LOT').length, '/ inds:', results.filter(r=>r.type==='IND').length, '/ errors:', errors.length);
    if (errors.length > 0) UI.toast('一部登録失敗: ' + errors.join(' / '), 'error', 6000);

    if (results.length === 0) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '🥚 登録してラベル発行'; }
      if (backBtn) backBtn.disabled = false;
      return;
    }

    // ── syncAll を排除: API 戻り値を使って Store を直接パッチ ──
    // getAllData（8シート読み込み）は呼ばない → ~15秒短縮
    results.forEach(function(r) {
      if (r.type === 'LOT') {
        Store.addDBItem('lots', {
          lot_id:         r.id,
          display_id:     r.displayId,
          line_id:        _selLineId,
          stage:          _commonStage || 'L1L2',
          count:          r.count,
          initial_count:  r.count,
          container_size: r.container || _commonContainer || '1.8L',
          mat_type:       _commonMat || 'T0',
          status:         'active',
          note:           '採卵日: ' + r.date,
        });
      } else {
        Store.addDBItem('individuals', {
          ind_id:            r.id,
          display_id:        r.displayId,
          line_id:           _selLineId,
          current_stage:     _commonStage || 'L1L2',
          current_mat:       _commonMat   || 'T0',
          current_container: r.container || _commonContainer || '1.8L',
          status:            'larva',
          individual_date:   r.date,
          note_private:      '採卵日: ' + r.date + '（卵1個・個別化）',
        });
      }
    });

    // バックグラウンドで非同期同期（完了画面の表示をブロックしない）
    setTimeout(function() { syncAll(true).catch(function(){}); }, 2000);

    // 入力行順にソート（LOT/IND 混在でも元の並び順を維持）
    results.sort(function(a, b) { return (a._rowPos || 0) - (b._rowPos || 0); });
    _savedResults = results;
    _renderComplete(results, line);
  };

  // ── 完了画面 ─────────────────────────────────────────────────
  function _renderComplete(results, line) {
    const lineDisp = line
      ? (line.line_code || line.display_id) + (line.line_name ? ' / ' + line.line_name : '')
      : '?';

    // グローバルキューにセット（label.js と連携）
    window._eblLabelList = results;
    window._eblLineId    = _selLineId;

    main.innerHTML = `
      ${UI.header('🥚 登録完了', { back: true })}
      <div class="page-body">

        <div style="background:rgba(45,122,82,.1);border:1px solid rgba(45,122,82,.35);
          border-radius:12px;padding:14px 16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <span style="font-size:1.4rem">✅</span>
            <div>
              <div style="font-weight:700;font-size:1rem;color:var(--green)">
                ${results.length}件を登録しました
              </div>
              <div style="font-size:.72rem;color:var(--text3);margin-top:2px">
                ライン: <b>${lineDisp}</b>
                ／ ロット: <b>${results.filter(r=>r.type==='LOT').length}</b>件
                ${results.filter(r=>r.type==='IND').length
                  ? ` ／ 個別化: <b>${results.filter(r=>r.type==='IND').length}</b>件` : ''}
              </div>
            </div>
          </div>

          <!-- 連続発行ボタン -->
          <button class="btn btn-primary btn-full"
            style="font-weight:700;font-size:.95rem;margin-bottom:8px"
            onclick="Pages._eblStartQueue()">
            🖨 1枚目のラベルから順番に発行（${results.length}枚）
          </button>
          <div style="font-size:.72rem;color:var(--text3);text-align:center">
            印刷後「次のラベルへ」で順番に進めます
          </div>
        </div>

        <div class="card">
          <div class="card-title">登録一覧</div>
          ${results.map((r, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;
            padding:10px 0;${i < results.length-1 ? 'border-bottom:1px solid var(--border2)' : ''}">
            <div>
              <div style="font-family:var(--font-mono);font-weight:700;font-size:.9rem;color:var(--gold)">
                ${r.displayId}
              </div>
              <div style="font-size:.7rem;color:var(--text3);margin-top:2px">
                ${r.type==='LOT'
                  ? `<span style="color:var(--blue)">📦 ロット</span> ${r.count}個`
                  : `<span style="color:var(--female,#f06292)">🐛 個別化</span> 1頭`}
                ／ 採卵日: ${r.date}
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" style="font-size:.78rem"
              onclick="Pages._eblOpenLabel(${i})">
              🏷️ ラベル
            </button>
          </div>`).join('')}
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${_selLineId ? `
          <button class="btn btn-ghost" style="flex:1;min-width:110px"
            onclick="routeTo('lot-list',{line_id:'${_selLineId}'})">
            📦 ロット一覧
          </button>` : ''}
          <button class="btn btn-ghost" style="flex:1;min-width:110px"
            onclick="Pages.eggLotBulk({lineId:'${_selLineId}'})">
            🥚 続けて作成
          </button>
        </div>

      </div>`;
  }

  // ── ラベル発行キュー ─────────────────────────────────────────

  Pages._eblStartQueue = function() {
    if (!_savedResults || _savedResults.length === 0) return;
    window._eblLabelIdx  = 0;
    window._eblLabelList = _savedResults;
    window._eblLineId    = _selLineId;
    const r = _savedResults[0];
    routeTo('label-gen', {
      targetType:   r.type,
      targetId:     r.id,
      displayId:    r.displayId,
      _eblQueueIdx:   0,
      _eblQueueTotal: _savedResults.length,
    });
  };

  Pages._eblOpenLabel = function(idx) {
    if (!_savedResults) return;
    const r = _savedResults[idx];
    window._eblLabelIdx  = idx;
    window._eblLabelList = _savedResults;
    window._eblLineId    = _selLineId;
    routeTo('label-gen', {
      targetType:   r.type,
      targetId:     r.id,
      displayId:    r.displayId,
      _eblQueueIdx:   idx,
      _eblQueueTotal: _savedResults.length,
    });
  };

  render();
};

// ── グローバル: label.js から「次のラベルへ」で呼ばれる ──────────
window._eblGoNextLabel = function(currentIdx) {
  const list  = window._eblLabelList;
  const next  = currentIdx + 1;
  if (!list || next >= list.length) {
    // 全枚印刷完了 → 完了画面へ戻る（_showComplete=true で完了画面を再表示）
    routeTo('egg-lot-bulk', { _showComplete: true });
    return;
  }
  const r = list[next];
  window._eblLabelIdx = next;
  routeTo('label-gen', {
    targetType:     r.type,
    targetId:       r.id,
    displayId:      r.displayId,
    _eblQueueIdx:   next,
    _eblQueueTotal: list.length,
  });
};

window.PAGES = window.PAGES || {};
window.PAGES['egg-lot-bulk'] = function() {
  Pages.eggLotBulk(Store.getParams());
};
