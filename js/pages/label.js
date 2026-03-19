// ════════════════════════════════════════════════════════════════
// label.js
// 役割: 個体・ロット・産卵セット・種親のラベルをCanvas APIで生成し
//       Phomemo M220 向け PNG として出力する。
//       QRコードには内部ID（IND:xxx / LOT:xxx / SET:xxx）を埋め込む。
// ════════════════════════════════════════════════════════════════
'use strict';

// ラベルサイズ（Phomemo M220 標準: 50×30mm を 200dpi 換算）
window._currentLabel = { displayId: '', fileName: '', dataUrl: '' };

const LABEL_W = 394;  // px (50mm)
const LABEL_H = 236;  // px (30mm)

// ── ラベル種別定義 ────────────────────────────────────────────────
const LABEL_TYPE_DEFS = [
  { code: 'egg_lot',   label: '① 卵管理',     target: 'LOT', desc: '採卵後・孵化日/頭数は後で補完' },
  { code: 'multi_lot', label: '② 複数頭飼育', target: 'LOT', desc: 'T1/T2①ロット用' },
  { code: 'ind_fixed', label: '③ 個別飼育',   target: 'IND', desc: '固定ラベル（変動情報なし）' },
  { code: 'set',       label: '④ 産卵セット', target: 'SET', desc: '親情報・開始日' },
  { code: 'parent',    label: '⑤ 種親',       target: 'PAR', desc: '種親ID・サイズ・血統' },
  { code: 'sale',      label: '⑥ 販売用',     target: 'IND', desc: '販売・イベント向け（価格・QR）' },
];

// ════════════════════════════════════════════════════════════════
// _sortDisplayId — 表示IDの自然順ソート（グローバル共通関数）
//
// ソートキー優先順:
//   1. 年        HM[2026]-B2-L01  → 数値比較
//   2. 種親記号  HM2026-[B]2-L01  → アルファベット比較
//   3. セット番号 HM2026-B[2]-L01 → 数値比較
//   4. ロット番号 HM2026-B2-[L01] → 数値比較
//
// @param list  { sortKey: string(display_id), ...} の配列
// @param dir   'asc' | 'desc'
// ════════════════════════════════════════════════════════════════
function _sortDisplayId(list, dir) {
  // display_id から [year, parentLetter, setNum, lotNum] を抽出
  function extractKey(displayId) {
    // プレフィックス (IND-/LOT-/PAR-/SET-) と末尾スペース以降を除去
    var s = String(displayId || '').replace(/^(IND|LOT|PAR|SET)-/i, '').split(' ')[0];
    var parts = s.split('-');

    var year = 0, parentLetter = '', setNum = 0, lotNum = 0;

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];

      // 年: "HM2026" — 英字1〜3文字 + 4桁数字
      if (/^[A-Za-z]{1,3}[0-9]{4}$/.test(p)) {
        year = parseInt(p.replace(/[^0-9]/g, ''), 10) || 0;
        continue;
      }

      // 産卵セットコード: "A1" "B2" — 英字1文字 + 数字1桁以上
      if (/^[A-Za-z][0-9]+$/.test(p)) {
        var sm = p.match(/^([A-Za-z])([0-9]+)$/);
        if (sm) { parentLetter = sm[1].toUpperCase(); setNum = parseInt(sm[2], 10) || 0; }
        continue;
      }

      // ロット番号: "L01" "L02" — L + 数字
      if (/^[Ll][0-9]+$/.test(p)) {
        lotNum = parseInt(p.slice(1), 10) || 0;
        continue;
      }
      // "A" "B" "C" などサブID枝番は無視（ソートキー不要）
    }

    return [year, parentLetter, setNum, lotNum];
  }

  var sorted = list.slice().sort(function(a, b) {
    // sortKey は必ず entity.display_id（ラベル表示文字列ではない）
    var ka = extractKey(a.sortKey);
    var kb = extractKey(b.sortKey);

    if (ka[0] !== kb[0]) return ka[0] - kb[0];          // 年
    if (ka[1] !== kb[1]) return ka[1] < kb[1] ? -1 : 1; // 種親記号
    if (ka[2] !== kb[2]) return ka[2] - kb[2];          // セット番号
    if (ka[3] !== kb[3]) return ka[3] - kb[3];          // ロット番号
    // フォールバック: display_id 文字列比較
    return String(a.sortKey) < String(b.sortKey) ? -1 : 1;
  });

  if (dir === 'desc') sorted.reverse();
  return sorted;
}

// ════════════════════════════════════════════════════════════════
// Pages.labelGen — ラベル生成メイン
// ════════════════════════════════════════════════════════════════
Pages.labelGen = function (params) {
  params = params || {};
  const main = document.getElementById('main');
  let targetType = params.targetType || 'IND';
  let targetId   = params.targetId   || '';
  let labelType  = params.labelType || (
    params.targetType === 'LOT' ? 'egg_lot' :
    params.targetType === 'SET' ? 'set' :
    params.targetType === 'PAR' ? 'parent' : 'ind_fixed'
  );
  const autoGenerate = !!params.autoGenerate;

  // ── 一括生成選択状態（ページ内で保持）──────────────────────────
  // { [id]: true/false }
  let bulkSelected = {};

  // ソート方向
  let sortDir = 'asc';

  // モード: 'single' | 'bulk'
  let mode = 'single';

  const inds    = Store.filterIndividuals({ status: 'alive' });
  const lots    = Store.filterLots({ status: 'active' });
  const parents = (Store.getDB('parents')  || []).filter(p => p.status === 'active');
  const pairs   = (Store.getDB('pairings') || []).filter(p => p.status === 'active');

  // 対象ごとの自動ラベル種別
  function autoLabelType(type, entity) {
    if (type === 'PAR') return 'parent';
    if (type === 'SET') return 'set';
    if (type === 'LOT') return (entity && (entity.stage === 'EGG' || entity.stage === 'T0')) ? 'egg_lot' : 'multi_lot';
    return 'ind_fixed';
  }

  // ── 対象一覧（ソート済み）────────────────────────────────────
  function getTargetList() {
    let raw;
    if (targetType === 'IND')
      raw = inds.map(i => ({
        id: i.ind_id,
        sortKey: i.display_id || '',           // ← display_id だけ（表示文字列混入なし）
        label: (i.display_id || '') + (i.sex ? ' ' + i.sex : '') + (i.latest_weight_g ? ' (' + i.latest_weight_g + 'g)' : ''),
        entity: i,
      }));
    else if (targetType === 'LOT')
      raw = lots.map(l => ({
        id: l.lot_id,
        sortKey: l.display_id || '',           // ← display_id だけ
        label: (l.display_id || '') + (stageLabel(l.stage) ? ' ' + stageLabel(l.stage) : '') + ' (' + (l.count || 0) + '頭)',
        entity: l,
      }));
    else if (targetType === 'SET')
      raw = pairs.map(p => ({
        id: p.set_id,
        sortKey: p.display_id || p.set_name || '',
        label: p.set_name || p.display_id || '',
        entity: p,
      }));
    else
      raw = parents.map(p => ({
        id: p.par_id,
        sortKey: p.display_name || p.par_id || '',
        label: (p.display_name || p.par_id || '') + (p.sex ? ' ' + p.sex : '') + (p.size_mm ? ' ' + p.size_mm + 'mm' : ''),
        entity: p,
      }));

    return _sortDisplayId(raw, sortDir);
  }

  // ── レンダリング ─────────────────────────────────────────────
  function render() {
    const targetList = getTargetList();
    // bulkSelected の件数を毎回カウント（re-render 時も正確に反映）
    const selCount = Object.values(bulkSelected).filter(Boolean).length;

    main.innerHTML =
      UI.header('ラベル生成', {})
      + '<div class="page-body">'

      // ── モード切替タブ ──────────────────────────────────────
      + '<div style="display:flex;gap:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:0">'
      + '<button style="flex:1;padding:10px;font-size:.85rem;font-weight:700;border:none;cursor:pointer;'
        + (mode === 'single' ? 'background:var(--green);color:#fff;' : 'background:var(--surface2);color:var(--text2);')
        + '" onclick="Pages._lblSetMode(\'single\')">🏷 単体生成</button>'
      + '<button style="flex:1;padding:10px;font-size:.85rem;font-weight:700;border:none;cursor:pointer;'
        + (mode === 'bulk' ? 'background:var(--green);color:#fff;' : 'background:var(--surface2);color:var(--text2);')
        + '" onclick="Pages._lblSetMode(\'bulk\')">📦 一括生成</button>'
      + '</div>'

      // ── 対象種別ピル ────────────────────────────────────────
      + '<div class="card" style="margin-top:8px">'
      + '<div class="card-title">ラベル対象</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;' + (mode === 'single' ? 'margin-bottom:10px' : '') + '">'
      + ['IND','LOT','SET','PAR'].map(t =>
          '<button class="pill ' + (targetType === t ? 'active' : '') + '" onclick="Pages._lblSetType(\'' + t + '\')">'
          + ({ IND:'個体', LOT:'ロット', SET:'産卵セット', PAR:'種親' }[t]) + '</button>'
        ).join('')
      + '</div>'

      // ── 単体: ドロップダウン ──────────────────────────────
      + (mode === 'single' ? _buildTargetSelect(targetType, targetId, inds, lots, pairs, parents) : '')
      + '</div>'

      // ── ラベル種別（単体のみ）────────────────────────────────
      + (mode === 'single' ? (
          '<div class="card">'
          + '<div class="card-title">ラベル種別</div>'
          + '<div class="filter-bar">'
          + LABEL_TYPE_DEFS
              .filter(t => t.target === targetType || (targetType === 'IND' && t.code === 'sale'))
              .map(t =>
                '<button class="pill ' + (labelType === t.code ? 'active' : '') + '"'
                + ' data-ltype="' + t.code + '" title="' + t.desc + '"'
                + ' onclick="Pages._lblSetLabelType(this.dataset.ltype)">' + t.label + '</button>'
              ).join('')
          + '</div>'
          + '<div style="font-size:.72rem;color:var(--text3);margin-top:4px">'
          + ((LABEL_TYPE_DEFS.find(t => t.code === labelType) || {}).desc || '')
          + '</div></div>'
        ) : '')

      // ── 単体: プレビューカード ──────────────────────────────
      + (mode === 'single' ? (
          '<div class="card" id="lbl-preview-card">'
          + (targetId
            ? '<div class="card-title">プレビュー</div>'
              + '<div id="lbl-canvas-wrap" style="display:flex;justify-content:center;margin-bottom:12px">'
              + '<canvas id="lbl-canvas" width="' + LABEL_W + '" height="' + LABEL_H + '"'
              + ' style="border:1px solid var(--border2);border-radius:4px;max-width:100%"></canvas></div>'
              + '<div id="lbl-qr" style="position:absolute;left:-9999px;top:0;width:120px;height:120px;overflow:hidden"></div>'
              + '<div style="display:flex;gap:8px">'
              + '<button class="btn btn-primary" style="flex:2" onclick="Pages._lblGenerate(\'' + targetType + '\',\'' + targetId + '\',\'' + labelType + '\')">🏷 ラベル生成</button>'
              + '<button class="btn btn-ghost" style="flex:1" id="lbl-dl-btn" onclick="Pages._lblDownload()">💾 保存</button>'
              + '</div>'
            : '<div style="color:var(--text3);font-size:.85rem;text-align:center;padding:20px">対象を選択するとプレビューが表示されます</div>')
          + '</div>'
        ) : '')

      // ── 一括: チェックリスト ────────────────────────────────
      + (mode === 'bulk' ? _buildBulkList(targetList, bulkSelected, selCount, sortDir) : '')

      // ── アクションバー（単体用）────────────────────────────
      + '<div id="lbl-action-bar" style="display:none;margin-top:8px">'
      + '<div style="background:rgba(45,122,82,.10);border:1px solid rgba(45,122,82,.35);border-radius:var(--radius);padding:14px 16px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">'
      + '<span style="font-size:1.3rem">✅</span>'
      + '<span style="font-size:.95rem;font-weight:700;color:var(--green)">ラベルを生成しました</span></div>'
      + '<div style="background:var(--surface2);border-radius:8px;padding:10px 12px;margin-bottom:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
      + '<span style="font-size:.72rem;color:var(--text3)">ファイル名</span>'
      + '<span style="font-size:.72rem;background:var(--surface3,#3a3a4a);color:var(--blue);padding:1px 6px;border-radius:6px">PNG</span></div>'
      + '<div id="lbl-filename" style="font-size:.85rem;font-weight:600;color:var(--text1);word-break:break-all">—</div>'
      + '<div style="font-size:.7rem;color:var(--text3);margin-top:4px">📱 このデバイスのダウンロードフォルダに保存されます</div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + '<button class="btn btn-primary" onclick="Pages._lblDownload()" style="font-size:.92rem;padding:13px;font-weight:700">📥 ダウンロード</button>'
      + '<button class="btn btn-ghost" onclick="Pages._lblPrint()" style="font-size:.92rem;padding:13px">🖨 印刷プレビュー</button>'
      + '</div>'
      + '<button id="lbl-drive-btn" class="btn btn-ghost" style="width:100%;font-size:.88rem;padding:10px;margin-bottom:8px;display:none" onclick="Pages._lblOpenDrive()">📂 Driveを開く</button>'
      + '<button class="btn btn-ghost" style="width:100%;font-size:.8rem;padding:8px"'
      + ' onclick="Pages._lblGenerate(\'' + targetType + '\',\'' + targetId + '\',\'' + labelType + '\')">🔄 再生成</button>'
      + '<div style="font-size:.7rem;color:var(--text3);margin-top:10px;line-height:1.6;padding-top:8px;border-top:1px solid var(--border)">💡 印刷手順: ダウンロード → Phomemoアプリ「写真印刷」→ 50×30mm で印刷</div>'
      + '</div></div>'

      // Phomemo 手順
      + '<div class="card" style="background:rgba(91,168,232,.06);border-color:rgba(91,168,232,.2)">'
      + '<div class="card-title" style="color:var(--blue)">📱 Phomemo M220 印刷手順</div>'
      + '<ol style="font-size:.8rem;color:var(--text2);line-height:1.8;padding-left:1.2em">'
      + '<li>「📥 ダウンロード」でPNGを保存</li>'
      + '<li>Phomemoアプリを開く</li>'
      + '<li>「写真印刷」→ 保存したPNGを選択</li>'
      + '<li>用紙サイズ 50×30mm に設定して印刷</li>'
      + '</ol></div>'

      + '</div>';

    // 単体: 即生成
    if (mode === 'single' && targetId) {
      setTimeout(() => Pages._lblGenerate(targetType, targetId, labelType), 200);
    }
  }

  // ── ヘルパー: ドロップダウン ─────────────────────────────────
  function _buildTargetSelect(tType, tId, inds, lots, pairs, parents) {
    if (tType === 'IND') {
      return '<select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">'
        + '<option value="">個体を選択...</option>'
        + inds.map(i => '<option value="' + i.ind_id + '" ' + (i.ind_id === tId ? 'selected' : '') + '>'
          + (i.display_id || '') + (i.sex ? ' ' + i.sex : '') + (i.latest_weight_g ? ' (' + i.latest_weight_g + 'g)' : '') + '</option>').join('')
        + '</select>';
    }
    if (tType === 'LOT') {
      return '<select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">'
        + '<option value="">ロットを選択...</option>'
        + lots.map(l => '<option value="' + l.lot_id + '" ' + (l.lot_id === tId ? 'selected' : '') + '>'
          + (l.display_id || '') + (stageLabel(l.stage) ? ' ' + stageLabel(l.stage) : '') + ' (' + (l.count || 0) + '頭)</option>').join('')
        + '</select>';
    }
    if (tType === 'SET') {
      return '<select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">'
        + '<option value="">産卵セットを選択...</option>'
        + pairs.map(p => '<option value="' + p.set_id + '" ' + (p.set_id === tId ? 'selected' : '') + '>'
          + (p.set_name || p.display_id || '') + '</option>').join('')
        + '</select>';
    }
    // PAR
    return '<select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">'
      + '<option value="">種親を選択...</option>'
      + parents.map(p => '<option value="' + p.par_id + '" ' + (p.par_id === tId ? 'selected' : '') + '>'
        + (p.display_name || p.par_id || '') + (p.sex ? ' ' + p.sex : '') + (p.size_mm ? ' ' + p.size_mm + 'mm' : '') + '</option>').join('')
      + '</select>';
  }

  // ── ヘルパー: 一括チェックリスト ────────────────────────────
  function _buildBulkList(targetList, selected, selCount, sortDir) {
    // ── ボタン: disabled 属性のみ使用。pointer-events:none は使わない ──
    const btnDisabled = selCount === 0;

    return '<div class="card">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
      + '<div class="card-title" style="margin-bottom:0">'
      + '対象一覧 <span id="lbl-sel-count" style="font-size:.78rem;color:var(--text3)">（' + selCount + '件選択）</span></div>'
      + '<div style="display:flex;gap:6px;align-items:center">'
      + '<button class="btn btn-ghost btn-sm" style="font-size:.75rem" onclick="Pages._lblBulkSelectAll()">全選択</button>'
      + '<button class="btn btn-ghost btn-sm" style="font-size:.75rem" onclick="Pages._lblBulkClearAll()">解除</button>'
      + '<button class="btn btn-ghost btn-sm" style="font-size:.72rem;padding:4px 8px" onclick="Pages._lblToggleSort()">'
      + (sortDir === 'asc' ? '↑ 昇順' : '↓ 降順')
      + '</button>'
      + '</div></div>'
      + '<div style="max-height:40vh;overflow-y:auto">'
      + (targetList.length === 0
          ? '<div style="color:var(--text3);font-size:.82rem;padding:12px;text-align:center">対象がありません</div>'
          : targetList.map(item =>
              '<label style="display:flex;align-items:center;gap:10px;padding:9px 4px;'
              + 'border-bottom:1px solid var(--border);cursor:pointer">'
              + '<input type="checkbox"'
              + ' data-bid="' + item.id + '"'
              + (selected[item.id] ? ' checked' : '')
              + ' onchange="Pages._lblBulkToggle(\'' + item.id + '\',this.checked)"'
              + ' style="width:16px;height:16px;accent-color:var(--green);flex-shrink:0">'
              + '<span style="font-size:.82rem;color:var(--text1)">' + item.label + '</span>'
              + '</label>'
            ).join('')
        )
      + '</div></div>'
      // ── 一括生成ボタン: disabled 属性のみで制御 ──────────────
      + '<button id="lbl-bulk-btn" class="btn btn-primary btn-full"'
      + ' style="font-weight:800;font-size:.95rem;' + (btnDisabled ? 'opacity:.4' : '') + '"'
      + (btnDisabled ? ' disabled' : '')
      + ' onclick="Pages._lblBulkGenerate(\'' + targetType + '\')">'
      + '📦 ' + selCount + '件まとめてラベル生成・保存'
      + '</button>'
      + '<div id="lbl-bulk-progress" style="display:none"></div>';
  }

  // ── ハンドラ登録 ─────────────────────────────────────────────
  Pages._lblSetMode = (m) => {
    mode = m;
    bulkSelected = {};
    render();
  };

  Pages._lblSetType = (t) => {
    targetType = t;
    targetId   = '';
    bulkSelected = {};
    labelType = t === 'LOT' ? 'egg_lot' : t === 'SET' ? 'set' : t === 'PAR' ? 'parent' : 'ind_fixed';
    render();
  };

  Pages._lblSetTarget    = (id) => { targetId = id; render(); };
  Pages._lblSetLabelType = (t)  => { labelType = t; render(); };

  Pages._lblToggleSort = () => {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    render();   // 完全再描画でソートを確実に適用
  };

  // ── 一括: チェック操作 ──────────────────────────────────────
  // render() を使わず DOM 直接更新（チェック毎に全再描画しない）
  Pages._lblBulkToggle = (id, checked) => {
    bulkSelected[id] = checked;
    _updateBulkUI();
  };

  Pages._lblBulkSelectAll = () => {
    document.querySelectorAll('[data-bid]').forEach(cb => {
      bulkSelected[cb.dataset.bid] = true;
      cb.checked = true;
    });
    _updateBulkUI();
  };

  Pages._lblBulkClearAll = () => {
    bulkSelected = {};
    document.querySelectorAll('[data-bid]').forEach(cb => { cb.checked = false; });
    _updateBulkUI();
  };

  // ── 一括UI更新（ボタン状態・件数を DOM 直接更新）────────────
  function _updateBulkUI() {
    const cnt = Object.values(bulkSelected).filter(Boolean).length;

    // 件数テキスト
    const countEl = document.getElementById('lbl-sel-count');
    if (countEl) countEl.textContent = '（' + cnt + '件選択）';

    // ボタン: disabled 属性と opacity のみ。pointer-events は操作しない
    const btn = document.getElementById('lbl-bulk-btn');
    if (btn) {
      btn.textContent = '📦 ' + cnt + '件まとめてラベル生成・保存';
      btn.disabled    = cnt === 0;
      btn.style.opacity = cnt === 0 ? '0.4' : '1';
    }
  }

  // ── 一括生成・保存 ──────────────────────────────────────────
  Pages._lblBulkGenerate = async (tType) => {
    const ids = Object.keys(bulkSelected).filter(k => bulkSelected[k]);
    if (!ids.length) { UI.toast('対象を選択してください', 'error'); return; }

    const progress = document.getElementById('lbl-bulk-progress');
    if (progress) {
      progress.style.display = 'block';
      progress.innerHTML = '<div style="font-size:.82rem;color:var(--text3);padding:8px 0">0 / ' + ids.length + ' 件処理中...</div>';
    }

    // 隠しCanvas・QRdivをbody直下に作成
    let bulkCanvas = document.getElementById('lbl-bulk-canvas');
    if (!bulkCanvas) {
      bulkCanvas = document.createElement('canvas');
      bulkCanvas.id = 'lbl-bulk-canvas';
      bulkCanvas.width = LABEL_W; bulkCanvas.height = LABEL_H;
      bulkCanvas.style.cssText = 'position:absolute;left:-9999px;top:0';
      document.body.appendChild(bulkCanvas);
    }
    let bulkQrDiv = document.getElementById('lbl-bulk-qr');
    if (!bulkQrDiv) {
      bulkQrDiv = document.createElement('div');
      bulkQrDiv.id = 'lbl-bulk-qr';
      bulkQrDiv.style.cssText = 'position:absolute;left:-9999px;top:0;width:120px;height:120px;overflow:hidden';
      document.body.appendChild(bulkQrDiv);
    }

    let successCount = 0;
    for (let i = 0; i < ids.length; i++) {
      const id     = ids[i];
      const entity = _getBulkEntity(tType, id);
      if (!entity) continue;

      const lt = autoLabelType(tType, entity);
      const ld = _buildLabelData(tType, id, entity, lt);
      if (!ld) continue;

      // QR 生成
      bulkQrDiv.innerHTML = '';
      try {
        new QRCode(bulkQrDiv, {
          text: ld.qr_text, width: 80, height: 80,
          colorDark: '#000000', colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M,
        });
      } catch(e) {}

      await new Promise(r => setTimeout(r, 180));
      _drawLabel(bulkCanvas, ld, bulkQrDiv);
      await new Promise(r => setTimeout(r, 120));

      const lineCode = (ld.line_code || ld.line_display_id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dispId   = (ld.display_id || id).replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = (lineCode ? lineCode + '_' : '') + dispId + '_label.png';
      const a = document.createElement('a');
      a.href = bulkCanvas.toDataURL('image/png');
      a.download = fileName;
      a.click();

      successCount++;
      if (progress) {
        progress.innerHTML = '<div style="font-size:.82rem;color:var(--text3);padding:8px 0">'
          + successCount + ' / ' + ids.length + ' 件完了 — ' + (ld.display_id || id) + '</div>';
      }
      await new Promise(r => setTimeout(r, 400));
    }

    if (progress) {
      progress.innerHTML = '<div style="font-size:.85rem;color:var(--green);padding:8px 0;font-weight:700">'
        + '✅ ' + successCount + '件のラベルを生成しました</div>';
    }
    UI.toast('✅ ' + successCount + '件のラベルを保存しました', 'success', 4000);
    bulkSelected = {};
  };

  render();
};

function _getBulkEntity(tType, id) {
  if (tType === 'IND') return Store.getIndividual(id);
  if (tType === 'LOT') return Store.getLot(id);
  if (tType === 'SET') return (Store.getDB('pairings') || []).find(p => p.set_id === id);
  if (tType === 'PAR') return (Store.getDB('parents')  || []).find(p => p.par_id === id);
  return null;
}

// ── 一括生成: ラベルデータ組み立て ──────────────────────────────
function _buildLabelData(tType, id, entity, lt) {
  try {
    if (tType === 'IND') {
      const ind  = entity;
      const line = Store.getLine(ind.line_id) || {};
      const bld  = (Store.getDB('bloodlines')||[]).find(b => b.bloodline_id === ind.bloodline_id) || {};
      const fPar = (Store.getDB('parents')||[]).find(p => p.par_id === ind.father_par_id) || {};
      const mPar = (Store.getDB('parents')||[]).find(p => p.par_id === ind.mother_par_id) || {};
      return {
        qr_text: 'IND:' + ind.ind_id, display_id: ind.display_id || id,
        line_code: line.line_code || line.display_id || '',
        sex: ind.sex || '', hatch_date: ind.hatch_date || '',
        latest_weight_g: ind.latest_weight_g || '', adult_size_mm: ind.adult_size_mm || '',
        bloodline: bld.abbreviation || bld.bloodline_name || '',
        locality: ind.locality || '', generation: ind.generation || '',
        father_name: fPar.display_name || '', father_size: fPar.size_mm || '',
        mother_name: mPar.display_name || '', mother_size: mPar.size_mm || '',
        stage_label: (typeof STAGE_LABELS !== 'undefined' && STAGE_LABELS[ind.current_stage]) || ind.current_stage || '',
        label_type: lt, resolved_label_type: lt === 'sale' ? 'sale' : 'ind_fixed',
      };
    }
    if (tType === 'LOT') {
      const lot  = entity;
      const line = Store.getLine(lot.line_id) || {};
      return {
        qr_text: 'LOT:' + lot.lot_id, display_id: lot.display_id || id,
        line_code: line.line_code || line.display_id || '',
        line_display_id: line.display_id || '',
        stage_label: (typeof STAGE_LABELS !== 'undefined' && STAGE_LABELS[lot.stage]) || lot.stage || '',
        stage: lot.stage || '', hatch_date: lot.hatch_date || '',
        count: lot.count || '', mat_type: lot.mat_type || '',
        collect_date: lot.collect_date || lot.hatch_date || '',
        label_type: lt, resolved_label_type: lt,
      };
    }
    if (tType === 'SET') {
      const set     = entity;
      const lineObj = Store.getLine(set.line_id) || {};
      const fPar    = (Store.getDB('parents')||[]).find(p => p.par_id === set.father_par_id) || {};
      const mPar    = (Store.getDB('parents')||[]).find(p => p.par_id === set.mother_par_id) || {};
      return {
        qr_text: 'SET:' + set.set_id, display_id: set.display_id || set.set_name || id,
        line_code: lineObj.line_code || lineObj.display_id || '',
        father_info: fPar.display_name ? fPar.display_name + (fPar.size_mm?' '+fPar.size_mm+'mm':'') : '',
        mother_info: mPar.display_name ? mPar.display_name + (mPar.size_mm?' '+mPar.size_mm+'mm':'') : '',
        father_size: fPar.size_mm || '', mother_size: mPar.size_mm || '',
        set_start: set.set_start || '', pairing_start: set.pairing_start || '',
        label_type: 'set', resolved_label_type: 'set',
      };
    }
    if (tType === 'PAR') {
      const par = entity;
      const bld = (Store.getDB('bloodlines')||[]).find(b => b.bloodline_id === par.bloodline_id) || {};
      return {
        qr_text: 'PAR:' + par.par_id, display_id: par.display_name || id,
        sex: par.sex || '', size_mm: par.size_mm || '',
        bloodline: bld.abbreviation || bld.bloodline_name || '',
        locality: par.locality || '',
        label_type: 'parent', resolved_label_type: 'parent',
      };
    }
  } catch(e) { console.error('[_buildLabelData]', e); }
  return null;
}
function _drawLabel(canvas, ld, qrDiv) {
  const lt = ld.resolved_label_type || ld.label_type || 'ind_fixed';
  if (lt === 'egg_lot')   return _drawEggLotLabel(canvas, ld, qrDiv);
  if (lt === 'multi_lot') return _drawMultiLotLabel(canvas, ld, qrDiv);
  if (lt === 'set')       return _drawSetLabel(canvas, ld, qrDiv);
  if (lt === 'parent')    return _drawParentLabel(canvas, ld, qrDiv);
  if (lt === 'sale')      return _drawSaleLabel(canvas, ld, qrDiv);
  // ind_fixed + デフォルト
  return _drawIndLabel(canvas, ld, qrDiv);
}

// ── QR描画共通ヘルパー ─────────────────────────────────────────────
function _drawQR(ctx, qrDiv, x, y, size) {
  const qrImg = qrDiv?.querySelector('img') || qrDiv?.querySelector('canvas');
  if (qrImg) { try { ctx.drawImage(qrImg, x, y, size, size); } catch(e) {} }
}
function _bg(ctx, W, H) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
}
function _border(ctx, W, H) {
  ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, W-2, H-2);
}
function _trunc(s, n) { return String(s||'').length > n ? String(s).slice(0,n) : String(s||''); }

// ① 卵管理ラベル（EGG/T0ロット） ─────────────────────────────────
function _drawEggLotLabel(canvas, ld, qrDiv) {
  const ctx = canvas.getContext('2d'); const W = LABEL_W; const H = LABEL_H;
  _bg(ctx, W, H);
  // ヘッダーバー（採卵タグ色: 琥珀）
  ctx.fillStyle = '#e09040';
  ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('① 卵管理ラベル', 6, 13);

  // QR（左）
  const QR = 88;
  _drawQR(ctx, qrDiv, 6, 22, QR);

  // テキスト（右）
  const TX = QR + 14; const TW = W - TX - 6;
  ctx.fillStyle = '#111';

  // ライン略称（大）
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#1a3a1a';
  ctx.fillText(_trunc(ld.line_code || ld.line_display_id || ld.display_id, 12), TX, 42, TW);

  // ロットID
  ctx.font = '10px monospace';
  ctx.fillStyle = '#444';
  ctx.fillText(_trunc(ld.display_id, 20), TX, 56, TW);

  // 採卵日
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#555';
  ctx.fillText('採卵日: ' + (ld.collect_date || ld.hatch_date || '—'), TX, 72, TW);

  // 手書きエリア（孵化日・頭数）
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#888';
  ctx.fillText('孵化日: ___/___/___', TX, 90, TW);
  ctx.fillText('頭数:   _____ 頭',   TX, 105, TW);

  // 記入促しテキスト
  ctx.font = '9px sans-serif';
  ctx.fillStyle = '#e09040';
  ctx.fillText('孵化後に手書きでご記入ください', TX, 120, TW);

  _border(ctx, W, H);
}

// ② 複数頭飼育ラベル（T1/T2①） ────────────────────────────────────
function _drawMultiLotLabel(canvas, ld, qrDiv) {
  const ctx = canvas.getContext('2d'); const W = LABEL_W; const H = LABEL_H;
  _bg(ctx, W, H);
  // ヘッダーバー（青）
  ctx.fillStyle = '#5ba8e8';
  ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('② 複数頭飼育ラベル', 6, 13);

  const QR = 88;
  _drawQR(ctx, qrDiv, 6, 22, QR);

  const TX = QR + 14; const TW = W - TX - 6;

  // ライン略称（大）
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#1a3a1a';
  ctx.fillText(_trunc(ld.line_code || ld.display_id, 12), TX, 40, TW);

  // ロットID + ステージ
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#2d7a52';
  ctx.fillText(_trunc(ld.display_id, 18) + ' ' + (ld.stage_label || ''), TX, 55, TW);

  // 孵化日・頭数・体重（あれば印字）
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#444';
  let y = 70;
  if (ld.hatch_date) { ctx.fillText('孵化: ' + ld.hatch_date, TX, y, TW); y += 14; }
  if (ld.count)      { ctx.fillText(ld.count + '頭', TX, y, TW); y += 14; }

  // 手書きエリア（性別・区分）
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#888';
  ctx.fillText('性別: ♂□ ♀□ 混□', TX, y + 4, TW); y += 15;
  ctx.fillText('区分: 大□ 中□ 小□', TX, y + 4, TW);

  _border(ctx, W, H);
}

// ③ 個別飼育ラベル ──────────────────────────────────────────────
function _drawIndLabel(canvas, ld, qrDiv) {
  const ctx = canvas.getContext('2d'); const W = LABEL_W; const H = LABEL_H;
  _bg(ctx, W, H);
  // ヘッダーバー: 性別で色分け
  const headerColor = ld.sex === '♂' ? '#1a3a7a' : ld.sex === '♀' ? '#7a1a4a' : '#2d7a52';
  ctx.fillStyle = headerColor;
  ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  const sexLabel = ld.sex === '♂' ? '♂ INDIVIDUAL' : ld.sex === '♀' ? '♀ INDIVIDUAL' : 'INDIVIDUAL';
  ctx.fillText(sexLabel, 6, 13);

  const QR = 88;
  _drawQR(ctx, qrDiv, 4, 20, QR);

  const TX = QR + 10; const TW = W - TX - 4;

  // 個体表示IDの末尾部分（大）
  const dispShort = ld.display_id.length > 14
    ? ld.display_id.slice(ld.display_id.indexOf('-', 8) + 1) : ld.display_id;
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#111';
  ctx.fillText(_trunc(dispShort, 16), TX, 34, TW);

  // フルID（小）
  ctx.font = '8px monospace';
  ctx.fillStyle = '#666';
  ctx.fillText(_trunc(ld.display_id, 26), TX, 46, TW);

  // ライン
  if (ld.line_code) {
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = headerColor;
    ctx.fillText('ライン: ' + _trunc(ld.line_code, 10), TX, 59, TW);
  }

  // 親情報
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#444';
  let y = 72;
  if (ld.father_name) {
    ctx.fillText('♂ ' + _trunc(ld.father_name, 10) + (ld.father_size ? ' ' + ld.father_size + 'mm' : ''), TX, y, TW);
    y += 13;
  }
  if (ld.mother_name) {
    ctx.fillText('♀ ' + _trunc(ld.mother_name, 10) + (ld.mother_size ? ' ' + ld.mother_size + 'mm' : ''), TX, y, TW);
    y += 13;
  }

  // 体重またはサイズ
  if (ld.adult_size_mm) {
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#2d7a52';
    ctx.fillText(ld.adult_size_mm + 'mm', TX, H - 16, TW);
  } else if (ld.latest_weight_g) {
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#2d7a52';
    ctx.fillText(ld.latest_weight_g + 'g', TX, H - 16, TW);
  }

  // 孵化日（下部）
  if (ld.hatch_date) {
    ctx.font = '8px sans-serif'; ctx.fillStyle = '#888';
    ctx.fillText('孵化: ' + ld.hatch_date, TX, H - 5, TW);
  }

  _border(ctx, W, H);
}

// ④ 産卵セットラベル ──────────────────────────────────────────────
function _drawSetLabel(canvas, ld, qrDiv) {
  const ctx = canvas.getContext('2d'); const W = LABEL_W; const H = LABEL_H;
  _bg(ctx, W, H);
  // ヘッダーバー（ゴールド）
  ctx.fillStyle = '#1a5c1a';
  ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('PAIRING SET', 6, 13);

  const QR = 86;
  _drawQR(ctx, qrDiv, 4, 22, QR);

  const TX = QR + 10; const TW = W - TX - 4;
  let y = 32;

  // ラインコード（最大注目）
  const lineMain = ld.line_code || ld.display_id || '';
  ctx.font = 'bold 26px monospace';
  ctx.fillStyle = '#1a5c1a';
  ctx.fillText(_trunc(lineMain, 8), TX, y + 14, TW); y += 24;

  // SET ID（小）
  ctx.font = '8px monospace';
  ctx.fillStyle = '#888';
  ctx.fillText(_trunc(ld.display_id, 22), TX, y + 4, TW); y += 14;

  // 親情報
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#333';
  if (ld.father_info) { ctx.fillText('♂ ' + _trunc(ld.father_info, 18), TX, y, TW); y += 13; }
  if (ld.mother_info) { ctx.fillText('♀ ' + _trunc(ld.mother_info, 18), TX, y, TW); y += 13; }

  // セット開始日
  ctx.font = '9px sans-serif'; ctx.fillStyle = '#666';
  if (ld.set_start) { ctx.fillText('産卵: ' + ld.set_start, TX, H - 6, TW); }

  _border(ctx, W, H);
}


// ⑤ 種親ラベル ──────────────────────────────────────────────────
function _drawParentLabel(canvas, ld, qrDiv) {
  const ctx = canvas.getContext('2d'); const W = LABEL_W; const H = LABEL_H;
  _bg(ctx, W, H);
  const hColor = ld.sex === '♂' ? '#3a1a6a' : '#6a1a5a';
  ctx.fillStyle = hColor;
  ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText((ld.sex === '♂' ? '♂' : ld.sex === '♀' ? '♀' : '') + ' PARENT / SEED', 6, 13);

  const QR = 88;
  _drawQR(ctx, qrDiv, 4, 20, QR);

  const TX = QR + 10; const TW = W - TX - 4;

  // 種親名（大）
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#111';
  ctx.fillText(_trunc(ld.display_id, 12), TX, 38, TW);

  // サイズ（強調）
  if (ld.size_mm) {
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = hColor;
    ctx.fillText(ld.size_mm + 'mm', TX, 56, TW);
  }

  // 血統
  ctx.font = '10px sans-serif'; ctx.fillStyle = '#444';
  let y = 70;
  if (ld.bloodline) { ctx.fillText(_trunc(ld.bloodline, 20), TX, y, TW); y += 13; }
  if (ld.locality)  { ctx.fillText(_trunc(ld.locality, 16), TX, y, TW); y += 13; }

  // 下部注記
  ctx.font = '8px sans-serif'; ctx.fillStyle = '#aaa';
  ctx.fillText('PAR: ' + _trunc(ld.display_id, 20), 6, H - 4, W - 12);

  _border(ctx, W, H);
}

// ⑥ 販売用個体ラベル（イベント・発送向け）─────────────────────────
function _drawSaleLabel(canvas, ld, qrDiv) {
  const ctx = canvas.getContext('2d'); const W = LABEL_W; const H = LABEL_H;
  _bg(ctx, W, H);
  // ヘッダー（赤）
  ctx.fillStyle = '#7a1a1a';
  ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  const saleHeader = ld.adult_size_mm ? 'FOR SALE — ADULT' : 'FOR SALE — LARVA';
  ctx.fillText(saleHeader + (ld.sex ? ' ' + ld.sex : ''), 6, 13);

  const QR = 88;
  _drawQR(ctx, qrDiv, 4, 20, QR);

  const TX = QR + 10; const TW = W - TX - 4;
  let y = 34;

  // ライン+性別（大）
  const lineMain = (ld.line_code || '') + (ld.sex ? ' ' + ld.sex : '');
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#111';
  ctx.fillText(_trunc(lineMain, 12), TX, y, TW); y += 16;

  // フルID（小）
  ctx.font = '8px monospace'; ctx.fillStyle = '#666';
  ctx.fillText(_trunc(ld.display_id, 24), TX, y, TW); y += 12;

  // 体重またはサイズ（強調）
  const sizeVal = ld.adult_size_mm ? ld.adult_size_mm + 'mm' : (ld.latest_weight_g ? ld.latest_weight_g + 'g' : '');
  if (sizeVal) {
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#7a1a1a';
    ctx.fillText(sizeVal, TX, y, TW); y += 16;
  }

  // 血統
  ctx.font = '9px sans-serif'; ctx.fillStyle = '#444';
  if (ld.bloodline) { ctx.fillText(_trunc(ld.bloodline, 18), TX, y, TW); y += 12; }

  // 親サイズ
  ctx.font = '9px sans-serif'; ctx.fillStyle = '#555';
  if (ld.father_size || ld.mother_size) {
    ctx.fillText(
      (ld.father_size ? '父' + ld.father_size + 'mm' : '') +
      (ld.father_size && ld.mother_size ? '×' : '') +
      (ld.mother_size ? '母' + ld.mother_size + 'mm' : ''),
      TX, y, TW
    ); y += 12;
  }

  // QR誘導（極小）
  ctx.font = '7px sans-serif'; ctx.fillStyle = '#888';
  ctx.fillText('QR → 公開ページ確認', TX, H - 5, TW);

  _border(ctx, W, H);
}

function _truncate(str, max) {
  return str.length > max ? str.slice(0, max) : str;
}

// ダウンロード
Pages._lblDownload = function () {
  const label = window._currentLabel || {};
  // dataURL はキャッシュ済みのものを優先、なければCanvasから再取得
  const dataUrl = label.dataUrl || (() => {
    const c = document.getElementById('lbl-canvas');
    return c ? c.toDataURL('image/png') : null;
  })();
  if (!dataUrl) { UI.toast('ラベルデータがありません。先に「ラベル生成」を押してください。', 'error'); return; }
  const fileName = label.fileName || ('label_' + Date.now() + '.png');
  const a = document.createElement('a');
  a.href     = dataUrl;
  a.download = fileName;
  a.click();
  UI.toast('📥 ' + fileName + ' をダウンロードしました', 'success', 4000);
};

Pages._lblOpenDrive = function () {
  const url = window._currentLabel?.driveUrl;
  if (url) {
    window.open(url, '_blank');
  } else {
    UI.toast('Driveに保存されていません。ダウンロードを使用してください', 'info');
  }
};

Pages._lblPrint = function () {
  const label = window._currentLabel || {};
  const dataUrl = label.dataUrl || (() => {
    const c = document.getElementById('lbl-canvas');
    return c ? c.toDataURL('image/png') : null;
  })();
  if (!dataUrl) { UI.toast('ラベルデータがありません。先に「ラベル生成」を押してください。', 'error'); return; }
  const win = window.open('', '_blank');
  if (!win) { UI.toast('ポップアップをブロックされました。ダウンロードをご利用ください。', 'error'); return; }
  win.document.write(
    '<html><head><title>ラベル印刷</title>'
    + '<style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff}'
    + 'img{max-width:100%;image-rendering:pixelated}'
    + '@media print{body{margin:0}img{width:50mm;height:30mm}}</style></head>'
    + '<body><img src="' + dataUrl + '" onload="window.print()"></body></html>'
  );
  win.document.close();
};

window.PAGES = window.PAGES || {};
// ════════════════════════════════════════════════════════════════
// _sortDisplayId — 表示IDの自然順ソート
//
// ソートキー（優先順位）:
//   1. 年        HM[2026]-B2-L01  → 数値比較
//   2. 種親記号  HM2026-[B]2-L01  → アルファベット比較 (A < B < C)
//   3. セット番号 HM2026-B[2]-L01 → 数値比較
//   4. ロット番号 HM2026-B2-[L01] → 数値比較
//
// 例（昇順）:
//   HM2026-A1-L01 < HM2026-A1-L02 < HM2026-A2-L01
//   < HM2026-B1-L01 < HM2026-B2-L01 < HM2027-A1-L01
// ════════════════════════════════════════════════════════════════
function _sortDisplayId(list, dir) {
  // display_id から 4 要素のソートキーを抽出する
  // 入力例: "HM2026-B2-L01", "IND-HM2026-B2-L03-C", "LOT-HM2026-A1-L01"
  function extractKey(raw) {
    // IND- / LOT- / PAR- / SET- プレフィックスを除去
    var s = String(raw || '').replace(/^(IND|LOT|PAR|SET)-/i, '').split(' ')[0];
    var parts = s.split('-');

    // キー1: 年（ブランドコード内の数値部分）
    // HM2026 → 2026, HM2027 → 2027
    var year = 0;
    var parentLetter = '';
    var setNum = 0;
    var lotNum = 0;

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];

      // 年: "HM2026" のような英字+4桁数字
      if (/^[A-Z]{1,3}\d{4}$/i.test(p)) {
        year = parseInt(p.replace(/[^0-9]/g, ''), 10) || 0;
        continue;
      }

      // 産卵セットコード: "B2" "A1" のような [英字1文字][数値]
      if (/^[A-Z]\d+$/i.test(p)) {
        var m = p.match(/^([A-Z])(\d+)$/i);
        if (m) {
          parentLetter = m[1].toUpperCase();
          setNum = parseInt(m[2], 10) || 0;
        }
        continue;
      }

      // ロット番号: "L01" "L02" のような L+数値
      if (/^L\d+$/i.test(p)) {
        lotNum = parseInt(p.slice(1), 10) || 0;
        continue;
      }
    }

    return [year, parentLetter, setNum, lotNum];
  }

  var sorted = list.slice().sort(function(a, b) {
    var ka = extractKey(a.sortKey || a.label);
    var kb = extractKey(b.sortKey || b.label);

    // 1. 年
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    // 2. 種親記号 (A/B/C...)
    if (ka[1] !== kb[1]) return ka[1] < kb[1] ? -1 : 1;
    // 3. 産卵セット番号
    if (ka[2] !== kb[2]) return ka[2] - kb[2];
    // 4. ロット番号
    if (ka[3] !== kb[3]) return ka[3] - kb[3];
    // 5. 残りは文字列フォールバック
    var sa = String(a.sortKey || a.label);
    var sb = String(b.sortKey || b.label);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  if (dir === 'desc') sorted.reverse();
  return sorted;
}


window.PAGES['label-gen'] = () => Pages.labelGen(Store.getParams());
