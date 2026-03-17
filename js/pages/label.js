// ════════════════════════════════════════════════════════════════
// label.js
// 役割: 個体・ロット・産卵セットのラベルをCanvas APIで生成し
//       Phomemo M220 向け PNG として出力する。
//       QRコードには内部ID（IND:xxx / LOT:xxx / SET:xxx）を埋め込む。
//       Phomemoアプリで開く手順を画面に案内する。
// ════════════════════════════════════════════════════════════════
'use strict';

// ラベルサイズ（Phomemo M220 標準: 50×30mm を 200dpi 換算）
// 現在生成中のラベル情報（_lblDownload で使用）
window._currentLabel = { displayId: '', fileName: '', dataUrl: '' };

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

        <!-- ラベル発行後アクションバー -->
        <div id="lbl-action-bar" style="display:none;margin-top:8px">
          <div style="background:rgba(45,122,82,.10);border:1px solid rgba(45,122,82,.35);
            border-radius:var(--radius);padding:14px 16px;">

            <!-- 発行成功タイトル -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
              <span style="font-size:1.3rem">✅</span>
              <span style="font-size:.95rem;font-weight:700;color:var(--green)">ラベルを生成しました</span>
            </div>

            <!-- ファイル情報 -->
            <div style="background:var(--surface2);border-radius:8px;padding:10px 12px;margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-size:.72rem;color:var(--text3)">ファイル名</span>
                <span style="font-size:.72rem;background:var(--surface3,#3a3a4a);
                  color:var(--blue);padding:1px 6px;border-radius:6px">PNG</span>
              </div>
              <div id="lbl-filename" style="font-size:.85rem;font-weight:600;color:var(--text1);
                word-break:break-all;">—</div>
              <div style="font-size:.7rem;color:var(--text3);margin-top:4px">
                📱 このデバイスのダウンロードフォルダに保存されます
              </div>
            </div>

            <!-- アクションボタン -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
              <button class="btn btn-primary" onclick="Pages._lblDownload()"
                style="font-size:.92rem;padding:13px;font-weight:700">
                📥 ダウンロード
              </button>
              <button class="btn btn-ghost" onclick="Pages._lblPrint()"
                style="font-size:.92rem;padding:13px">
                🖨 印刷プレビュー
              </button>
            </div>
            <button id="lbl-drive-btn" class="btn btn-ghost"
              style="width:100%;font-size:.88rem;padding:10px;margin-bottom:8px;display:none"
              onclick="Pages._lblOpenDrive()">
              📂 Driveを開く
            </button>
            <button class="btn btn-ghost" style="width:100%;font-size:.8rem;padding:8px"
              onclick="Pages._lblGenerate('${targetType}','${targetId}','${labelType}')">
              🔄 再生成
            </button>

            <div style="font-size:.7rem;color:var(--text3);margin-top:10px;line-height:1.6;
              padding-top:8px;border-top:1px solid var(--border)">
              💡 印刷手順: ダウンロード → Phomemoアプリ「写真印刷」→ 50×30mm で印刷
            </div>
          </div>
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

  // ── ローカルキャッシュからラベルデータを組み立て（GAS通信なし・即時）──
  let ld;
  try {
    if (targetType === 'IND') {
      const ind  = Store.getIndividual(targetId) || {};
      const line = Store.getLine(ind.line_id)    || {};
      const bld  = (Store.getDB('bloodlines') || []).find(b => b.bloodline_id === ind.bloodline_id) || {};
      ld = {
        qr_text:             `IND:${ind.ind_id || targetId}`,
        display_id:          ind.display_id    || targetId,
        line_code:           line.line_code    || line.display_id || '',
        stage_label:         (typeof STAGE_LABELS !== 'undefined' && STAGE_LABELS[ind.current_stage]) || ind.current_stage || '',
        sex:                 ind.sex           || '',
        hatch_date:          ind.hatch_date    || '',
        bloodline:           bld.abbreviation  || bld.bloodline_name || ind.bloodline_name || '',
        locality:            ind.locality      || '',
        generation:          ind.generation    || '',
        label_type:          labelType         || 'ind_fixed',
        resolved_label_type: 'ind_fixed',
      };
    } else if (targetType === 'LOT') {
      const lot  = Store.getLot(targetId)     || {};
      const line = Store.getLine(lot.line_id) || {};
      const autoType = (lot.stage === 'EGG' || lot.stage === 'T0') ? 'egg_lot' : 'multi_lot';
      ld = {
        qr_text:             `LOT:${lot.lot_id || targetId}`,
        display_id:          lot.display_id    || targetId,
        line_display_id:     line.display_id   || '',
        line_code:           line.line_code    || line.display_id || '',
        stage_label:         (typeof STAGE_LABELS !== 'undefined' && STAGE_LABELS[lot.stage]) || lot.stage || '',
        stage:               lot.stage         || '',
        hatch_date:          lot.hatch_date    || '',
        count:               lot.count         || '',
        mat_type:            lot.mat_type      || '',
        sex_hint:            lot.sex_hint      || '',
        size_category:       lot.size_category || '',
        collect_date:        lot.collect_date  || lot.hatch_date || '',
        label_type:          labelType,
        resolved_label_type: labelType || autoType,
      };
    } else if (targetType === 'SET') {
      const set = (Store.getDB('pairings') || []).find(p => p.set_id === targetId) || {};
      ld = {
        qr_text:             `SET:${set.set_id || targetId}`,
        display_id:          set.display_id    || set.set_name || targetId,
        set_name:            set.set_name      || '',
        father_info:         set.father_display_name || '',
        mother_info:         set.mother_display_name || '',
        pairing_start:       set.pairing_start || '',
        set_start:           set.set_start     || '',
        label_type:          'set',
        resolved_label_type: 'set',
      };
    } else {
      throw new Error('不明なターゲット種別: ' + targetType);
    }
  } catch (e) {
    UI.toast('ラベルデータ生成失敗: ' + e.message, 'error');
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
  // displayId を保持（ダウンロード時のファイル名に使用）
  const capturedDisplayId = ld.display_id || targetId;
  // ファイル名: LINE-A1-L01_label.png 形式（line_code を先頭に）
  const _lineCode = ld.line_code || ld.line_display_id || '';
  const _dispId   = capturedDisplayId.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const capturedFileName  = (_lineCode ? _lineCode.replace(/[^a-zA-Z0-9_\-]/g,'_') + '_' : '') + _dispId + '_label.png';

  setTimeout(() => {
    _drawLabel(canvas, ld, qrDiv);

    setTimeout(() => {
      // dataURL を確定してモジュール変数に保存
      window._currentLabel = {
        displayId: capturedDisplayId,
        fileName:  capturedFileName,
        dataUrl:   canvas.toDataURL('image/png'),
        driveUrl:  null,  // Drive保存後に設定
      };

      // アクションバーを更新して表示
      const bar = document.getElementById('lbl-action-bar');
      if (bar) {
        const fnEl = document.getElementById('lbl-filename');
        if (fnEl) fnEl.textContent = capturedFileName;
        // Drive URL ボタンをリセット
        const driveBtn = document.getElementById('lbl-drive-btn');
        if (driveBtn) driveBtn.style.display = 'none';
        bar.style.display = 'block';
      }
      const dlBtn = document.getElementById('lbl-dl-btn');
      if (dlBtn) dlBtn.style.display = '';
    }, 200);
  }, 150);
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

window.PAGES['label-gen'] = () => Pages.labelGen(Store.getParams());
