// ════════════════════════════════════════════════════════════════
// label.js
// 役割: 個体・ロット・産卵セットのラベルをCanvas APIで生成し
//       Phomemo M220 向け PNG として出力する。
//       QRコードには内部ID（IND:xxx / LOT:xxx / SET:xxx）を埋め込む。
//       Phomemoアプリで開く手順を画面に案内する。
// ════════════════════════════════════════════════════════════════
'use strict';

// ラベルサイズ（Phomemo M220 標準: 50×30mm を 200dpi 換算）
const LABEL_W = 394;  // px (50mm)
const LABEL_H = 236;  // px (30mm)

// ── 4種ラベルの定義（ラベル選択UIで使用）────────────────────────────
const LABEL_TYPE_DEFS = [
  { code: 'egg_lot',   label: '① 卵管理',     target: 'LOT', desc: '採卵後・孵化日/頭数は後で補完' },
  { code: 'multi_lot', label: '② 複数頭飼育', target: 'LOT', desc: 'T1/T2①ロット用' },
  { code: 'ind_fixed', label: '③ 個別飼育',   target: 'IND', desc: '固定ラベル（変動情報なし）' },
  { code: 'set',       label: '④ 産卵セット', target: 'SET', desc: '親情報・開始日' },
];

// ── ラベル生成メイン ─────────────────────────────────────────────
Pages.labelGen = function (params = {}) {
  const main = document.getElementById('main');
  let targetType = params.targetType || 'IND';
  let targetId   = params.targetId   || '';
  // labelType の初期値: targetType に合わせて自動設定
  let labelType  = params.labelType || (params.targetType === 'LOT' ? 'egg_lot'
    : params.targetType === 'SET' ? 'set' : 'ind_fixed');

  const inds  = Store.filterIndividuals({ status: 'alive' });
  const lots  = Store.filterLots({ status: 'active' });

  function render() {
    main.innerHTML = `
      ${UI.header('ラベル生成', {})}
      <div class="page-body">

        <!-- 対象種別選択 -->
        <div class="card">
          <div class="card-title">ラベル対象</div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button class="pill ${targetType==='IND' ? 'active' : ''}"
              onclick="Pages._lblSetType('IND')">個体(IND)</button>
            <button class="pill ${targetType==='LOT' ? 'active' : ''}"
              onclick="Pages._lblSetType('LOT')">ロット(LOT)</button>
          </div>
          ${targetType === 'IND' ? `
            <select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">
              <option value="">個体を選択...</option>
              ${inds.map(i =>
                `<option value="${i.ind_id}" ${i.ind_id===targetId?'selected':''}>
                  ${i.display_id} ${i.sex||''} ${i.latest_weight_g?'('+i.latest_weight_g+'g)':''}</option>`
              ).join('')}
            </select>` : `
            <select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">
              <option value="">ロットを選択...</option>
              ${lots.map(l =>
                `<option value="${l.lot_id}" ${l.lot_id===targetId?'selected':''}>
                  ${l.display_id} ${stageLabel(l.stage)} (${l.count}頭)</option>`
              ).join('')}
            </select>`}
        </div>

        <!-- ラベル種別選択 -->
        <div class="card">
          <div class="card-title">ラベル種別</div>
          <div class="filter-bar">
            ${LABEL_TYPE_DEFS.filter(t => t.target === targetType || t.target === 'SET').map(t =>
              `<button class="pill ${labelType===t.code ? 'active' : ''}"
                onclick="Pages._lblSetLabelType('${t.code}')"
                title="${t.desc}">${t.label}</button>`
            ).join('')}
          </div>
          <div id="lbl-type-desc" style="font-size:.72rem;color:var(--text3);margin-top:4px">
            ${LABEL_TYPE_DEFS.find(t => t.code === labelType)?.desc || ''}
          </div>
        </div>

        <!-- プレビュー・生成エリア -->
        <div class="card" id="lbl-preview-card">
          ${targetId
            ? `<div class="card-title">プレビュー</div>
               <div id="lbl-canvas-wrap" style="display:flex;justify-content:center;margin-bottom:12px">
                 <canvas id="lbl-canvas"
                   width="${LABEL_W}" height="${LABEL_H}"
                   style="border:1px solid var(--border2);border-radius:4px;max-width:100%"></canvas>
               </div>
               <div id="lbl-qr" style="display:none"></div>
               <div style="display:flex;gap:8px">
                 <button class="btn btn-primary" style="flex:2"
                   onclick="Pages._lblGenerate('${targetType}','${targetId}','${labelType}')">
                   🏷 ラベル生成
                 </button>
                 <button class="btn btn-ghost" style="flex:1" id="lbl-dl-btn" style="display:none"
                   onclick="Pages._lblDownload()">💾 保存</button>
               </div>`
            : `<div style="color:var(--text3);font-size:.85rem;text-align:center;padding:20px">
                 対象を選択するとプレビューが表示されます
               </div>`}
        </div>

        <!-- Phomemo手順 -->
        <div class="card" style="background:rgba(91,168,232,.06);border-color:rgba(91,168,232,.2)">
          <div class="card-title" style="color:var(--blue)">📱 Phomemo M220 印刷手順</div>
          <ol style="font-size:.8rem;color:var(--text2);line-height:1.8;padding-left:1.2em">
            <li>「💾 保存」でPNGをダウンロード</li>
            <li>Phomemoアプリを開く</li>
            <li>「写真印刷」→ 保存したPNGを選択</li>
            <li>用紙サイズ 50×30mm に設定して印刷</li>
          </ol>
        </div>

      </div>`;

    // 対象が既に選択されている場合は即生成
    if (targetId) {
      setTimeout(() => Pages._lblGenerate(targetType, targetId, labelType), 200);
    }
  }

  Pages._lblSetType = (t) => { targetType = t; targetId = ''; render(); };
  Pages._lblSetTarget = (id) => { targetId = id; render(); };
  Pages._lblSetLabelType = (t) => { labelType = t; render(); };
  render();
};

// ── ラベル生成 ───────────────────────────────────────────────────
Pages._lblGenerate = async function (targetType, targetId, labelType) {
  if (!targetId) return;
  const canvas = document.getElementById('lbl-canvas');
  if (!canvas) return;

  // GASからラベルデータ取得
  let ld;
  try {
    const res = await API.label.generate(targetType, targetId, labelType);
    ld = res.label_data;
  } catch (e) {
    UI.toast('ラベルデータ取得失敗: ' + e.message, 'error');
    return;
  }

  // QRコード生成（hidden div に描画してからCanvasに転写）
  const qrDiv = document.getElementById('lbl-qr');
  if (qrDiv) {
    qrDiv.innerHTML = '';
    try {
      new QRCode(qrDiv, {
        text:          ld.qr_text || targetType + ':' + targetId,
        width:         80,
        height:        80,
        colorDark:     '#000000',
        colorLight:    '#ffffff',
        correctLevel:  QRCode.CorrectLevel.M,
      });
    } catch (e) {
      console.warn('QR生成失敗:', e);
    }
  }

  // Canvas描画（100ms後にQRが確実に描画されてから）
  setTimeout(() => _drawLabel(canvas, ld, qrDiv), 150);
};

function _drawLabel(canvas, ld, qrDiv) {
  const lt = ld.resolved_label_type || ld.label_type || 'ind_fixed';
  if (lt === 'egg_lot')   return _drawEggLotLabel(canvas, ld, qrDiv);
  if (lt === 'multi_lot') return _drawMultiLotLabel(canvas, ld, qrDiv);
  if (lt === 'set')       return _drawSetLabel(canvas, ld, qrDiv);
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

// ③ 個別飼育ラベル（固定ラベル） ───────────────────────────────────
function _drawIndLabel(canvas, ld, qrDiv) {
  const ctx = canvas.getContext('2d'); const W = LABEL_W; const H = LABEL_H;
  _bg(ctx, W, H);
  // ヘッダーバー（グリーン）
  ctx.fillStyle = '#2d7a52';
  ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('③ 個別飼育ラベル（固定）', 6, 13);

  const QR = 88;
  _drawQR(ctx, qrDiv, 6, 22, QR);

  const TX = QR + 14; const TW = W - TX - 6;

  // 個体表示ID（大）
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#1a3a1a';
  ctx.fillText(_trunc(ld.display_id, 18), TX, 38, TW);

  // ライン略称
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#2d7a52';
  ctx.fillText('ライン: ' + _trunc(ld.line_code || '—', 10), TX, 54, TW);

  // 血統・産地
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#555';
  if (ld.bloodline) { ctx.fillText('血統: ' + _trunc(ld.bloodline, 14), TX, 68, TW); }
  if (ld.locality)  { ctx.fillText(_trunc(ld.locality, 12) + (ld.generation ? ' ' + ld.generation : ''), TX, 82, TW); }

  // 手書きエリア（性別）
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#888';
  ctx.fillText('性別: ♂□ ♀□', TX, 100, TW);

  // ※固定ラベルの注記（極小）
  ctx.font = '8px sans-serif';
  ctx.fillStyle = '#aaa';
  ctx.fillText('※体重・容器・ステージは非掲載（固定ラベル）', 6, H - 5, W - 12);

  _border(ctx, W, H);
}

// ④ 産卵セットラベル ──────────────────────────────────────────────
function _drawSetLabel(canvas, ld, qrDiv) {
  const ctx = canvas.getContext('2d'); const W = LABEL_W; const H = LABEL_H;
  _bg(ctx, W, H);
  // ヘッダーバー（ゴールド）
  ctx.fillStyle = '#c8a84b';
  ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#1a1200';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('④ 産卵セットラベル', 6, 13);

  const QR = 80;
  _drawQR(ctx, qrDiv, W - QR - 6, (H - QR) / 2, QR);  // QRは右側

  // テキスト（左）
  const TW = W - QR - 20;
  ctx.fillStyle = '#111';

  // ライン表示ID（大）
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#8a6a00';
  ctx.fillText(_trunc(ld.display_id || ld.set_name, 14), 6, 36, TW);

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#333';
  let y = 52;
  if (ld.father_info) { ctx.fillText('♂ ' + _trunc(ld.father_info, 22), 6, y, TW); y += 15; }
  if (ld.mother_info) { ctx.fillText('♀ ' + _trunc(ld.mother_info, 22), 6, y, TW); y += 15; }

  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#555';
  if (ld.pairing_start) { ctx.fillText('交尾: ' + ld.pairing_start, 6, y, TW); y += 13; }
  if (ld.set_start)     { ctx.fillText('産卵: ' + ld.set_start, 6, y, TW); y += 13; }

  _border(ctx, W, H);
}

function _truncate(str, max) {
  return str.length > max ? str.slice(0, max) : str;
}

// ダウンロード
Pages._lblDownload = function () {
  const canvas = document.getElementById('lbl-canvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.href     = canvas.toDataURL('image/png');
  a.download = 'label_' + Date.now() + '.png';
  a.click();
  UI.toast('ラベルPNGを保存しました。Phomemoアプリで印刷してください。', 'success', 4000);
};

PAGES['label-gen'] = () => Pages.labelGen(Store.getParams());
