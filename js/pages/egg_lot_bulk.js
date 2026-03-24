// ════════════════════════════════════════════════════════════════
// egg_lot_bulk.js — 卵ロット一括作成
//
// 採卵後の卵を複数ロットにまとめて登録し、
// そのまま全ラベルを連続発行するための画面。
//
// 入口:
//   - ダッシュボード クイック登録
//   - ライン詳細 → 「🥚 卵ロット一括作成」ボタン（lineId 自動セット）
//
// 自動処理ルール:
//   - 卵数 >= 2 → LOT として作成（stage=L1L2, mat=T0, container=1.8L）
//   - 卵数 == 1 → IND として作成（個別化扱い、stage=L1L2）
//   - 採卵日 → LOT は note 冒頭に「採卵日: YYYY/MM/DD」として保存
//              IND は individual_date に採卵日を保存
// ════════════════════════════════════════════════════════════════
'use strict';

Pages.eggLotBulk = function (params = {}) {
  const main = document.getElementById('main');

  // ── 状態 ──────────────────────────────────────────────────────
  const initLineId    = params.lineId || params.line_id || '';
  let   _selLineId    = initLineId;
  let   _commonDate   = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
  let   _nextRowId    = 4;
  let   _savedResults = null;  // 登録完了後の結果（ラベル発行リスト）

  // 行データ初期値（3行）
  let _rows = [
    { id: 1, count: '', collectDate: '' },
    { id: 2, count: '', collectDate: '' },
    { id: 3, count: '', collectDate: '' },
  ];

  // ── ヘルパー ──────────────────────────────────────────────────
  function _todayYMD() {
    return new Date().toISOString().split('T')[0];
  }

  function _rowType(count) {
    const n = parseInt(count, 10);
    if (isNaN(n) || n <= 0) return null;
    return n === 1 ? 'IND' : 'LOT';
  }

  function _rowBadge(count) {
    const t = _rowType(count);
    if (!t) return '<span style="color:var(--text3);font-size:.7rem">—</span>';
    if (t === 'IND') return '<span style="font-size:.68rem;padding:2px 7px;border-radius:8px;background:rgba(232,127,160,.15);color:var(--female,#f06292);font-weight:700;white-space:nowrap">個別化</span>';
    return '<span style="font-size:.68rem;padding:2px 7px;border-radius:8px;background:rgba(91,168,232,.12);color:var(--blue);font-weight:700;white-space:nowrap">ロット</span>';
  }

  // フォームから行データを読む（再描画前に必ず呼ぶ）
  function _readDom() {
    const lineEl = document.getElementById('ebl-line');
    if (lineEl && lineEl.value) _selLineId = lineEl.value;
    const cmnEl = document.getElementById('ebl-common-date');
    if (cmnEl && cmnEl.value) _commonDate = cmnEl.value;
    _rows.forEach(row => {
      const c = document.getElementById('ebl-cnt-' + row.id);
      const d = document.getElementById('ebl-dat-' + row.id);
      if (c) row.count       = c.value;
      if (d) row.collectDate = d.value;
    });
  }

  // ── 描画 ──────────────────────────────────────────────────────
  function render(keepScroll) {
    const sy = keepScroll ? main.scrollTop : 0;

    const lines        = Store.getDB('lines') || [];
    const activeLines  = lines.filter(l => l.status !== 'archived' && l.status !== 'deleted');
    const lineOptions  = activeLines.map(l => {
      const label = (l.line_code || l.display_id || l.line_id)
        + (l.line_name ? ' / ' + l.line_name : '');
      return `<option value="${l.line_id}" ${l.line_id === _selLineId ? 'selected' : ''}>${label}</option>`;
    }).join('');

    const filledRows   = _rows.filter(r => parseInt(r.count, 10) > 0);
    const totalEggs    = filledRows.reduce((s, r) => s + (parseInt(r.count, 10) || 0), 0);
    const lotCount     = filledRows.filter(r => parseInt(r.count, 10) >= 2).length;
    const indCount     = filledRows.filter(r => parseInt(r.count, 10) === 1).length;
    const canSave      = _selLineId && filledRows.length > 0;

    main.innerHTML = `
      ${UI.header('🥚 卵ロット一括作成', { back: true })}
      <div class="page-body has-quick-bar">

        <!-- ① 基本設定 -->
        <div class="card">
          <div class="card-title">基本設定</div>

          <div class="field">
            <label class="field-label">ライン <em style="color:var(--red)">*</em></label>
            <select id="ebl-line" class="input"
              onchange="Pages._eblOnLineChange(this.value)">
              <option value="">ラインを選択...</option>
              ${lineOptions}
            </select>
          </div>

          <div class="field">
            <label class="field-label">共通採卵日（全行に一括適用）</label>
            <div style="display:flex;gap:6px">
              <input type="date" id="ebl-common-date" class="input" style="flex:1"
                value="${_commonDate}"
                max="${_todayYMD()}"
                onchange="Pages._eblSetCommonDate(this.value)">
              <button class="btn btn-ghost btn-sm" style="white-space:nowrap"
                onclick="Pages._eblApplyCommonDate()">全行へ</button>
            </div>
          </div>

          <div style="background:var(--surface2);border-radius:8px;padding:9px 12px;
            font-size:.72rem;color:var(--text3);line-height:1.8">
            初期値: 容器 <b style="color:var(--text2)">1.8L</b>
            ／ マット <b style="color:var(--text2)">T0</b>
            ／ ステージ <b style="color:var(--text2)">L1L2</b>
            ／ 孵化日は孵化確認後に別途登録
          </div>
        </div>

        <!-- ② 行入力 -->
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div class="card-title" style="margin:0">卵容器リスト</div>
            ${filledRows.length > 0
              ? `<div style="font-size:.72rem;color:var(--text3)">
                  合計 <b style="color:var(--blue)">${totalEggs}個</b>
                  ／ロット <b style="color:var(--green)">${lotCount}</b>
                  ${indCount ? ` ／個別化 <b style="color:var(--female,#f06292)">${indCount}</b>` : ''}
                </div>`
              : ''}
          </div>

          <!-- ヘッダー行 -->
          <div style="display:grid;grid-template-columns:28px 70px 1fr auto;gap:6px;
            padding:0 0 6px;border-bottom:1px solid var(--border);
            font-size:.65rem;color:var(--text3);font-weight:700">
            <div></div>
            <div style="text-align:center">卵数</div>
            <div>採卵日</div>
            <div></div>
          </div>

          <!-- 行リスト -->
          <div id="ebl-row-list">
            ${_rows.map((row, i) => `
            <div id="ebl-row-wrap-${row.id}"
              style="display:grid;grid-template-columns:28px 70px 1fr auto;gap:6px;
                align-items:center;padding:7px 0;
                ${i < _rows.length - 1 ? 'border-bottom:1px solid var(--border2)' : ''}">
              <div style="font-size:.7rem;color:var(--text3);text-align:center">${i + 1}</div>
              <div>
                <input type="number" id="ebl-cnt-${row.id}"
                  class="input"
                  style="text-align:center;font-size:1.05rem;font-weight:700;padding:8px 2px"
                  placeholder="0" min="0" max="99"
                  value="${row.count}"
                  oninput="Pages._eblOnCountInput(${row.id},this.value)">
                <div id="ebl-badge-${row.id}"
                  style="text-align:center;margin-top:2px;min-height:18px">
                  ${_rowBadge(row.count)}
                </div>
              </div>
              <input type="date" id="ebl-dat-${row.id}"
                class="input" style="font-size:.8rem;padding:8px 6px"
                value="${row.collectDate || _commonDate}"
                max="${_todayYMD()}">
              <button class="btn btn-ghost btn-sm"
                style="padding:6px 9px;color:var(--text3);font-size:.8rem"
                onclick="Pages._eblRemoveRow(${row.id})"
                ${_rows.length <= 1 ? 'disabled' : ''}>✕</button>
            </div>`).join('')}
          </div>

          <!-- 行追加 -->
          <button class="btn btn-ghost btn-full" style="margin-top:10px"
            onclick="Pages._eblAddRow()">＋ 行を追加</button>
        </div>

        <!-- ③ 登録サマリプレビュー -->
        ${filledRows.length > 0 ? `
        <div style="border:1px solid rgba(45,122,82,.3);border-radius:10px;
          background:rgba(45,122,82,.05);padding:12px 14px">
          <div style="font-size:.78rem;font-weight:700;color:var(--green);margin-bottom:6px">
            📋 登録予定 ${filledRows.length}件
          </div>
          ${_rows.filter(r => {
            const n = parseInt(r.count, 10);
            return !isNaN(n) && n > 0;
          }).map((r, i) => {
            const n = parseInt(r.count, 10);
            const d = r.collectDate || _commonDate;
            const badge = n >= 2
              ? `<span style="color:var(--blue);font-weight:700">📦 ロット</span> ${n}個`
              : `<span style="color:var(--female,#f06292);font-weight:700">🐛 個別化</span> 1頭`;
            return `<div style="font-size:.78rem;padding:3px 0;display:flex;gap:8px;align-items:center">
              <span style="color:var(--text3);min-width:18px">${i + 1}.</span>
              ${badge}
              <span style="color:var(--text3);font-size:.7rem">採卵日: ${d.replace(/-/g, '/')}</span>
            </div>`;
          }).join('')}
        </div>` : `
        <div style="text-align:center;padding:20px;color:var(--text3);font-size:.85rem">
          卵数を入力すると登録予定が表示されます
        </div>`}

      </div>

      <!-- 下部固定アクション -->
      <div class="quick-action-bar">
        <button class="btn btn-ghost btn-xl" style="flex:1"
          id="ebl-back-btn">← 戻る</button>
        <button class="btn btn-gold btn-xl" style="flex:2"
          id="ebl-save-btn"
          ${canSave ? '' : 'disabled'}
          onclick="Pages._eblSave()">
          🥚 登録してラベル発行
        </button>
      </div>`;

    document.getElementById('ebl-back-btn')?.addEventListener('click', () => Store.back());
    if (keepScroll) main.scrollTop = sy;
  }

  // ── イベントハンドラ ─────────────────────────────────────────

  Pages._eblOnLineChange = function(v) {
    _readDom(); _selLineId = v; render(true);
  };

  Pages._eblSetCommonDate = function(v) {
    _commonDate = v;
  };

  Pages._eblApplyCommonDate = function() {
    _readDom();
    _rows.forEach(r => { r.collectDate = _commonDate; });
    render(true);
  };

  Pages._eblOnCountInput = function(id, val) {
    const row = _rows.find(r => r.id === id);
    if (row) row.count = val;
    // バッジだけ差し替え（全体再描画なし）
    const badgeEl = document.getElementById('ebl-badge-' + id);
    if (badgeEl) badgeEl.innerHTML = _rowBadge(val);
    // サマリ更新のため軽量再描画（スクロール維持）
    _readDom(); render(true);
  };

  Pages._eblAddRow = function() {
    _readDom();
    _rows.push({ id: _nextRowId++, count: '', collectDate: _commonDate });
    render(true);
    setTimeout(() => {
      document.getElementById('ebl-cnt-' + (_nextRowId - 1))?.focus();
    }, 50);
  };

  Pages._eblRemoveRow = function(id) {
    if (_rows.length <= 1) return;
    _readDom();
    _rows = _rows.filter(r => r.id !== id);
    render(true);
  };

  // ── 保存処理 ─────────────────────────────────────────────────
  Pages._eblSave = async function() {
    _readDom();

    if (!_selLineId) {
      UI.toast('ラインを選択してください', 'error'); return;
    }

    const targets = _rows.filter(r => {
      const n = parseInt(r.count, 10);
      return !isNaN(n) && n > 0;
    });
    if (targets.length === 0) {
      UI.toast('卵数を1以上入力してください', 'error'); return;
    }

    const saveBtn = document.getElementById('ebl-save-btn');
    const backBtn = document.getElementById('ebl-back-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ 登録中...'; }
    if (backBtn) backBtn.disabled = true;

    const results = [];
    const errors  = [];
    const line    = (Store.getDB('lines') || []).find(l => l.line_id === _selLineId);

    for (const row of targets) {
      const n    = parseInt(row.count, 10);
      const date = (row.collectDate || _commonDate || _todayYMD()).replace(/-/g, '/');

      if (n >= 2) {
        // ── ロット作成 ─────────────────────────────────────────
        try {
          const res = await API.lot.create({
            line_id:        _selLineId,
            stage:          'L1L2',
            count:          n,
            initial_count:  n,
            container_size: '1.8L',
            mat_type:       'T0',
            // note 先頭に採卵日を記録（COL_DEF.LOT に collect_date 列がないため）
            note: '採卵日: ' + date,
          });
          results.push({
            type: 'LOT', id: res.lot_id, displayId: res.display_id,
            count: n, date,
          });
        } catch (e) {
          errors.push(`ロット(${n}個): ${e.message || '不明なエラー'}`);
        }

      } else {
        // ── 個体作成（個別化: 卵1個） ───────────────────────────
        try {
          const res = await API.individual.create({
            line_id:           _selLineId,
            current_stage:     'L1L2',
            current_mat:       'T0',
            current_container: '1.8L',
            individual_date:   date,   // 採卵日 = 個体化日として記録
            note_private:      '採卵日: ' + date + '（卵1個・個別化）',
            status:            'larva',
          });
          results.push({
            type: 'IND', id: res.ind_id, displayId: res.display_id,
            count: 1, date,
          });
        } catch (e) {
          errors.push(`個別化(1頭): ${e.message || '不明なエラー'}`);
        }
      }
    }

    if (errors.length > 0) {
      UI.toast('一部登録失敗: ' + errors.join(' / '), 'error', 6000);
    }

    if (results.length === 0) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '🥚 登録してラベル発行'; }
      if (backBtn) backBtn.disabled = false;
      return;
    }

    // Store 更新（非同期syncの前にローカルに反映）
    try { await syncAll(true); } catch(_) {}

    _savedResults = results;
    _renderComplete(results, line);
  };

  // ── 完了画面（ラベル発行リスト） ────────────────────────────
  function _renderComplete(results, line) {
    const lineDisp = line
      ? (line.line_code || line.display_id || line.line_id)
        + (line.line_name ? ' / ' + line.line_name : '')
      : '?';
    const lotResults = results.filter(r => r.type === 'LOT');
    const indResults = results.filter(r => r.type === 'IND');

    main.innerHTML = `
      ${UI.header('🥚 登録完了 — ラベル発行', { back: true })}
      <div class="page-body">

        <!-- 完了バナー -->
        <div style="background:rgba(45,122,82,.1);border:1px solid rgba(45,122,82,.35);
          border-radius:12px;padding:14px 16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="font-size:1.4rem">✅</span>
            <div>
              <div style="font-weight:700;font-size:1rem;color:var(--green)">
                ${results.length}件を登録しました
              </div>
              <div style="font-size:.72rem;color:var(--text3);margin-top:2px">
                ライン: <b>${lineDisp}</b>
                ／ ロット: <b>${lotResults.length}</b>件
                ${indResults.length ? ` ／ 個別化: <b>${indResults.length}</b>件` : ''}
              </div>
            </div>
          </div>
          <button class="btn btn-primary btn-full" style="font-weight:700;font-size:.92rem"
            onclick="Pages._eblLabelQueue(0)">
            🖨 ラベルを順番に発行する（${results.length}枚）
          </button>
        </div>

        <!-- ラベル個別リスト -->
        <div class="card">
          <div class="card-title">登録一覧（ラベル発行）</div>
          ${results.map((r, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;
            padding:10px 0;${i < results.length - 1 ? 'border-bottom:1px solid var(--border2)' : ''}">
            <div>
              <div style="font-family:var(--font-mono);font-weight:700;font-size:.9rem;color:var(--gold)">
                ${r.displayId}
              </div>
              <div style="font-size:.7rem;color:var(--text3);margin-top:2px">
                ${r.type === 'LOT'
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

        <!-- 次のアクション -->
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${_selLineId ? `
          <button class="btn btn-ghost" style="flex:1;min-width:120px"
            onclick="routeTo('lot-list',{line_id:'${_selLineId}'})">
            📦 ロット一覧
          </button>` : ''}
          <button class="btn btn-ghost" style="flex:1;min-width:120px"
            onclick="Pages.eggLotBulk({lineId:'${_selLineId}'})">
            🥚 続けて作成
          </button>
        </div>

      </div>`;
  }

  // ── ラベル発行キュー（連続印刷） ─────────────────────────────
  // idx番目のラベルを開く。label.js の戻り先として egg-lot-bulk-labels を使う。
  Pages._eblLabelQueue = function(idx) {
    if (!_savedResults || idx >= _savedResults.length) return;
    const r = _savedResults[idx];
    // ラベル発行後に戻ってきたとき次のラベルへ進めるよう、
    // 次のインデックスをグローバルに保存
    window._eblLabelIdx  = idx;
    window._eblLabelList = _savedResults;
    routeTo('label-gen', {
      targetType: r.type,
      targetId:   r.id,
      displayId:  r.displayId,
      // 戻り先パラメータ（label.js が対応している場合）
      _backRoute: 'egg-lot-bulk',
    });
  };

  Pages._eblOpenLabel = function(idx) {
    if (!_savedResults) return;
    const r = _savedResults[idx];
    window._eblLabelIdx  = idx;
    window._eblLabelList = _savedResults;
    routeTo('label-gen', {
      targetType: r.type,
      targetId:   r.id,
      displayId:  r.displayId,
    });
  };

  render();
};

// ── 「次のラベル」グローバルユーティリティ ──────────────────────
// label.js の印刷後に呼び出されて次へ進む（任意連携）
window._eblNextLabel = function() {
  const list = window._eblLabelList;
  const next = (window._eblLabelIdx || 0) + 1;
  if (!list || next >= list.length) {
    UI.toast('全ラベル発行完了 ✅', 'success');
    routeTo('egg-lot-bulk');
    return;
  }
  window._eblLabelIdx = next;
  const r = list[next];
  routeTo('label-gen', {
    targetType: r.type,
    targetId:   r.id,
    displayId:  r.displayId,
  });
};

window.PAGES = window.PAGES || {};
window.PAGES['egg-lot-bulk'] = function() {
  Pages.eggLotBulk(Store.getParams());
};
