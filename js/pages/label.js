// FILE: js/pages/label.js
// ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// label.js v5 — PNG画像出力ベース（Brother QL-820NWB 62mm連続ロール対応）
//
// サイズ:
//   個体 / ロット / T1ユニット (IND, LOT, UNIT, IND_DRAFT): 62mm × 70mm
//   産卵セット / 種親                 (SET, PAR)          : 62mm × 40mm
//
// 出力経路:
//   html2canvas が有効 → PNG生成 → img プレビュー → PNG保存 / 共有
//   html2canvas なし   → iframe フォールバック
// ════════════════════════════════════════════════════════════════
'use strict';

window._LABEL_BUILD = '20260330-20260403v';
console.log('[LABEL_BUILD]', window._LABEL_BUILD, 'loaded');

// ── ステージコード正規化 ─────────────────────────────────────────
function _normStageForLabel(code) {
  if (!code) return '';
  const MAP = {
    L1:'L1L2', L2_EARLY:'L1L2', L2_LATE:'L1L2',
    EGG:'L1L2', T0:'L1L2', T1:'L1L2',
    L3_EARLY:'L3', L3_MID:'L3', L3_LATE:'L3', T2:'L3', T2A:'L3', T2B:'L3', T3:'L3', // T3=3齢後期
    L1L2:'L1L2', L3:'L3', PREPUPA:'前蛹', PUPA:'蛹',
    ADULT_PRE:'成虫（未後食）', ADULT:'成虫（活動開始）',
  };
  return MAP[code] || code;
}

// ── ステージ チェックボックス表示用ヘルパー ──────────────────────
function _stageCheckboxRow(stageCode) {
  // stageCode を5分類に正規化
  var norm = _normStageForLabel(stageCode || '');
  // 成虫は "成虫（活動開始）" / "成虫（未後食）" どちらも "成虫" に丸める
  if (norm && norm.startsWith('成虫')) norm = '成虫';

  var stages = ['L1L2', 'L3', '前蛹', '蛹', '成虫'];
  var out = stages.map(function(s) {
    return (norm === s ? '■' : '□') + s;
  }).join('&nbsp;');
  console.log('[LABEL] stage checkbox render:', norm, '|', out.replace(/&nbsp;/g,' '));
  return out;
}

// ── QR位置定義（HTML・PNG両方が参照する単一矩形） ────────────────
// 62mm × 70mm ラベル基準。他サイズは _qrRectForDims() が補正する。
var QR_RECT_MM = { xMm: 3.5,  yMm: 8.2,  sizeMm: 11.67 }; // user-calibrated 20260410b
//   xMm: 左パディング(1.5mm) + _qrBox内padding(4px/3.77≈1.06mm) = 2.56mm
//   yMm: ヘッダー(4.5mm) + 上パディング(1mm) + _qrBox内padding(1.06mm) = 6.56mm
//   sizeMm: _qrBoxのimg 44px → 44/(234/62) ≈ 11.67mm
//   ← QRImg の正確な内側位置（border/paddingを除いたQR実体の位置）

function _qrPxForDims(dims) {
  // dims.wPx / dims.wMm から mm→px変換比率を求める
  var pxPerMm = (dims && dims.wPx && dims.wMm) ? dims.wPx / dims.wMm : (234 / 62);
  var scale   = (dims && dims.scale) || 1;
  return {
    x:    Math.round(QR_RECT_MM.xMm    * pxPerMm * scale),
    y:    Math.round(QR_RECT_MM.yMm    * pxPerMm * scale),
    size: Math.round(QR_RECT_MM.sizeMm * pxPerMm * scale),
  };
}

// ラベル種別定義
const LABEL_TYPE_DEFS = [
  { code: 'egg_lot',   label: '① 卵管理',        target: 'LOT',  desc: '採卵後・採卵日印字・孵化日手書き欄付き 62×40mm' },
  { code: 'multi_lot', label: '② 複数頭飼育',    target: 'LOT',  desc: 'ロット管理用・採卵日/孵化日欄付き 62×40mm' },
  { code: 'ind_fixed', label: '③ 個別飼育',      target: 'IND',  desc: '個体管理用（記録表付き）62×70mm' },
  { code: 't1_unit',   label: '⑥ T1ユニット',   target: 'UNIT', desc: 'T1移行後の2頭飼育（記録表付き）62×70mm' },
  { code: 'set',       label: '④ 産卵セット',    target: 'SET',  desc: '産卵セット情報 62×40mm' },
  { code: 'parent',    label: '⑤ 種親',          target: 'PAR',  desc: '種親QR・血統タグ 62×40mm' },
];

window._currentLabel  = { displayId:'', fileName:'', html:'', pngDataUrl:'', dims:null };
window._lastLabelType = {};

// ── デフォルトラベル種別 ──────────────────────────────────────────
function _defaultLabelType(targetType) {
  if (window._lastLabelType[targetType]) return window._lastLabelType[targetType];
  if (targetType === 'LOT')  return 'multi_lot';
  if (targetType === 'UNIT') return 't1_unit';
  if (targetType === 'SET')  return 'set';
  if (targetType === 'PAR')  return 'parent';
  return 'ind_fixed';
}

// ── 遷移元の詳細ページキー ───────────────────────────────────────
function _detailPageKey(targetType, targetId) {
  if (targetType === 'IND')  return { page: 'ind-detail',     params: { indId: targetId } };
  if (targetType === 'LOT')  return { page: 'lot-detail',     params: { lotId: targetId } };
  if (targetType === 'PAR')  return { page: 'parent-detail',  params: { parId: targetId } };
  if (targetType === 'SET')  return { page: 'pairing-detail', params: { pairingId: targetId } };
  if (targetType === 'UNIT') return { page: 't1-session',     params: {} };
  return null;
}

// ── ラベルサイズ判定 ─────────────────────────────────────────────
// 戻り値: { wMm, hMm, wPx, hPx, scale, label }
// 1mm = 3.7795px @ 96dpi。scale:3 で ~288dpi の印刷品質 PNG を生成
function _labelDimensions(labelType, targetType) {
  // LOT系は 62×40mm（コンパクト）、テーブルなし
  if (labelType === 'multi_lot' || labelType === 'egg_lot') {
    return { wMm:62, hMm:40, wPx:234, hPx:151, scale:3, label:'62×40mm' };
  }
  // IND / UNIT / IND_DRAFT は 62×70mm
  var isLarge =
    labelType === 'ind_fixed' ||
    labelType === 't1_unit'   ||
    targetType === 'IND'      ||
    targetType === 'UNIT'     ||
    targetType === 'IND_DRAFT';
  if (isLarge) {
    return { wMm:62, hMm:70, wPx:234, hPx:265, scale:3, label:'62×70mm' };
  }
  // PAR (種親): 62×35mm  ← 35mm
  if (labelType === 'parent' || targetType === 'PAR') {
    return { wMm:62, hMm:40, wPx:234, hPx:151, scale:3, label:'62×40mm' };
  }
  return { wMm:62, hMm:40, wPx:234, hPx:151, scale:3, label:'62×40mm' };
}

// ── PNG生成（html2canvas経由） ────────────────────────────────────
// htmlStr: _buildLabelHTML が返す完全 HTML 文字列
// dims:    _labelDimensions の返り値
// 戻り値:  PNG data URL (string) | null(html2canvas 未ロード時)
// QR を既存PNG canvasの左上に手動合成する
// html2canvas が QR img を拾えない場合の保険として使用
// PNG内のQR領域に黒画素があるか確認（html2canvasが描画成功か判定）
async function _checkPngHasQr(pngDataUrl, dims) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var qrPx = _qrPxForDims(dims);
      var tmpC = document.createElement('canvas');
      tmpC.width  = qrPx.size;
      tmpC.height = qrPx.size;
      var ctx = tmpC.getContext('2d');
      ctx.drawImage(img, qrPx.x, qrPx.y, qrPx.size, qrPx.size, 0, 0, qrPx.size, qrPx.size);
      var data = ctx.getImageData(0, 0, qrPx.size, qrPx.size).data;
      var blacks = 0;
      for (var i = 0; i < data.length; i += 4) {
        if (data[i+3] > 16 && data[i] < 64 && data[i+1] < 64 && data[i+2] < 64) blacks++;
      }
      console.log('[LABEL] png qr area black pixels:', blacks);
      resolve(blacks > 30);
    };
    img.onerror = function() { resolve(false); };
    img.src = pngDataUrl;
  });
}

async function _compositeQrOntoPng(pngDataUrl, qrSrc, dims) {
  return new Promise(function(resolve, reject) {
    var baseImg = new Image();
    baseImg.onload = function() {
      var qrImg = new Image();
      qrImg.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width  = baseImg.width;
        canvas.height = baseImg.height;
        var ctx = canvas.getContext('2d');
        // 白背景で初期化してからベースPNGを描画
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baseImg, 0, 0);

        // QR位置は QR_RECT_MM → _qrPxForDims で算出（HTML側と同一定義）
        var qrPx = _qrPxForDims(dims);
        console.log('[LABEL] qr composite rect:', qrPx);

        // QR画像をクリアしてから描画（確実に上書き）
        ctx.clearRect(qrPx.x, qrPx.y, qrPx.size, qrPx.size);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qrPx.x, qrPx.y, qrPx.size, qrPx.size);
        ctx.drawImage(qrImg, qrPx.x, qrPx.y, qrPx.size, qrPx.size);

        // 合成後の黒画素確認
        var verData = ctx.getImageData(qrPx.x, qrPx.y, qrPx.size, qrPx.size).data;
        var verBlack = 0;
        for (var vi = 0; vi < verData.length; vi += 4) {
          if (verData[vi+3] > 16 && verData[vi] < 64 && verData[vi+1] < 64 && verData[vi+2] < 64) verBlack++;
        }
        console.log('[LABEL] qr composition forced: ' + (verBlack > 30 ? 'success' : 'failed') + ' black_px=' + verBlack);
        resolve(canvas.toDataURL('image/png'));
      };
      qrImg.onerror = function() { reject(new Error('QR img load failed in composite')); };
      qrImg.src = qrSrc;
    };
    baseImg.onerror = function() { reject(new Error('base PNG load failed in composite')); };
    baseImg.src = pngDataUrl;
  });
}

async function _buildLabelPNG(htmlStr, dims) {
  if (typeof html2canvas === 'undefined') {
    console.warn('[LABEL] html2canvas not loaded – falling back to iframe preview');
    return null;
  }

  // <style> とボディ内容を分離（@page ルールは削除）
  const styleMatch = htmlStr.match(/<style>([\s\S]*?)<\/style>/i);
  const bodyMatch  = htmlStr.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const rawStyle   = styleMatch ? styleMatch[1].replace(/@page\s*\{[^}]*\}/g, '') : '';
  const bodyHtml   = bodyMatch  ? bodyMatch[1] : htmlStr;

  // オフスクリーン描画コンテナ
  const host = document.createElement('div');
  host.style.cssText = [
    'position:fixed',
    'left:-99999px',
    'top:0',
    `width:${dims.wPx}px`,
    `height:${dims.hPx}px`,
    'overflow:hidden',
    'background:#fff',
    'box-sizing:border-box',
  ].join(';');
  host.innerHTML = `<style>${rawStyle}</style>${bodyHtml}`;
  document.body.appendChild(host);

  // 画像ロード完了を待ってから capture（data: URL の img が未ロードだと空になる）
  const _hostImgs = Array.from(host.querySelectorAll('img'));
  if (_hostImgs.length > 0) {
    await Promise.all(_hostImgs.map(function(img) {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(function(resolve) {
        img.onload = resolve;
        img.onerror = resolve; // エラーでも続行
        // 既に読み込み中かもしれないので短いタイムアウトも設定
        setTimeout(resolve, 2000);
      });
    }));
  }
  // さらに2フレーム待ってスタイルを確定させてから capture
  await new Promise(function(r) { requestAnimationFrame(function() { requestAnimationFrame(r); }); });

  let canvas;
  try {
    canvas = await html2canvas(host, {
      scale:           dims.scale,
      width:           dims.wPx,
      height:          dims.hPx,
      useCORS:         true,
      allowTaint:      true,     // data: URL img も許可
      logging:         false,
      backgroundColor: '#ffffff',
      windowWidth:     dims.wPx,
      windowHeight:    dims.hPx,
      imageTimeout:    5000,     // img読み込みタイムアウト延長
    });
  } finally {
    try { document.body.removeChild(host); } catch(_) {}
  }

  return canvas.toDataURL('image/png');
}

// ════════════════════════════════════════════════════════════════
// ラベル発行ページ本体
// ════════════════════════════════════════════════════════════════
Pages.labelGen = function (params = {}) {
  const main = document.getElementById('main');
  let targetType       = (params.targetType || 'IND').toUpperCase();
  let targetId         = params.targetId   || '';
  let labelType        = params.labelType  || _defaultLabelType(targetType);

  // UNIT モード
  const _isUnitMode    = targetType === 'UNIT';
  const _unitDisplayId = params.displayId || targetId || '';
  const _unitForSale   = !!params.forSale;
  const _unitDraft     = params.unitDraft  || null;

  // IND_DRAFT モード
  const _isIndDraftMode = targetType === 'IND_DRAFT';
  const _draftInd       = params.draftInd  || null;
  const _singleIdx      = params.singleIdx !== undefined ? params.singleIdx : -1;

  // グローバルに保存（_lblGenerate はスコープ外のため）
  if (_isUnitMode) {
    window._lblUnitCtx = { displayId: _unitDisplayId, forSale: _unitForSale, draft: _unitDraft };
  } else {
    window._lblUnitCtx = null;
  }
  if (_isIndDraftMode) {
    window._lblIndDraftCtx = { draftInd: _draftInd, singleIdx: _singleIdx, backRoute: params.backRoute };
  } else {
    window._lblIndDraftCtx = null;
  }

  console.log('[LABEL] page render start');
  console.log('[LABEL] params', { targetType, targetId, labelType, _isUnitMode, _unitDisplayId, hasDraft: !!_unitDraft });

  // backRoute / backParam
  const _backRoute = params.backRoute || null;
  const _backParam = params.backParam || (params.labeledDisplayId ? { labeledDisplayId: params.labeledDisplayId } : {});
  if (_isIndDraftMode && _backRoute === 't1-session' && _singleIdx >= 0) {
    if (!_backParam.singleIdx) Object.assign(_backParam, { singleIdx: _singleIdx });
  }

  // 卵ロット一括キュー
  const _eblQueueIdx   = params._eblQueueIdx   !== undefined ? parseInt(params._eblQueueIdx,10)   : -1;
  const _eblQueueTotal = params._eblQueueTotal  !== undefined ? parseInt(params._eblQueueTotal,10) : 0;
  const _inEblQueue    = _eblQueueIdx >= 0 && _eblQueueTotal > 0;

  const inds = Store.filterIndividuals({ status: 'alive' });
  const lots = Store.filterLots({ status: 'active' });
  const pars = Store.getDB('parents') || [];

  const isDirectMode = !!params.targetId || _isUnitMode || _isIndDraftMode;
  const origin       = isDirectMode ? _detailPageKey(targetType, targetId) : null;

  const headerOpts = _backRoute
    ? { back: true, backFn: `routeTo('${_backRoute}',${JSON.stringify(_backParam)})` }
    : _inEblQueue
      ? { back: true, backFn: "routeTo('egg-lot-bulk',{_showComplete:true})" }
      : (isDirectMode && origin
          ? { back: true, backFn: `routeTo('${origin.page}',${JSON.stringify(origin.params)})` }
          : { back: true });

  function render() {
  // ── サイズ表示ラベル（labelType変化のたびに再計算） ──
  const dims = _labelDimensions(labelType, targetType);
    main.innerHTML = `
      ${UI.header('ラベル発行', headerOpts)}
      <div class="page-body">

        ${!isDirectMode ? `
        <!-- 対象選択 -->
        <div class="card">
          <div class="card-title">ラベル対象</div>
          <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
            <button class="pill ${targetType==='IND'?'active':''}" onclick="Pages._lblSetType('IND')">個体</button>
            <button class="pill ${targetType==='LOT'?'active':''}" onclick="Pages._lblSetType('LOT')">ロット</button>
            <button class="pill ${targetType==='UNIT'?'active':''}" onclick="Pages._lblSetType('UNIT')">ユニット</button>
            <button class="pill ${targetType==='SET'?'active':''}" onclick="Pages._lblSetType('SET')">産卵セット</button>
            <button class="pill ${targetType==='PAR'?'active':''}" onclick="Pages._lblSetType('PAR')">種親</button>
          </div>
          ${targetType === 'IND' ? `
            <select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">
              <option value="">個体を選択...</option>
              ${inds.map(i => `<option value="${i.ind_id}" ${i.ind_id===targetId?'selected':''}>
                ${i.display_id} ${i.sex||''} ${i.latest_weight_g?'('+i.latest_weight_g+'g)':''}</option>`).join('')}
            </select>`
          : targetType === 'PAR' ? `
            <select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">
              <option value="">種親を選択...</option>
              ${pars.filter(p=>p.status==='active'||!p.status).map(p => `<option value="${p.par_id}" ${p.par_id===targetId?'selected':''}>
                ${p.parent_display_id||p.display_name||p.par_id} ${p.sex||''} ${p.size_mm?p.size_mm+'mm':''}</option>`).join('')}
            </select>`
          : targetType === 'UNIT' ? `
            <select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">
              <option value="">ユニットを選択...</option>
              ${(Store.getDB('breeding_units')||[]).filter(u=>u.status==='active').map(u => `<option value="${u.display_id||u.unit_id}" ${(u.display_id||u.unit_id)===targetId?'selected':''}>
                ${u.display_id||u.unit_id} ${u.stage_phase||''} (${u.head_count||2}頭)</option>`).join('')}
            </select>`
          : targetType === 'SET' ? `
            <select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">
              <option value="">産卵セットを選択...</option>
              ${(Store.getDB('pairings')||[]).map(s => `<option value="${s.set_id}" ${s.set_id===targetId?'selected':''}>
                ${s.display_id||s.set_id} ${s.set_start||''}</option>`).join('')}
            </select>` : `
            <select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">
              <option value="">ロットを選択...</option>
              ${lots.map(l => `<option value="${l.lot_id}" ${l.lot_id===targetId?'selected':''}>
                ${l.display_id} ${typeof stageLabel==='function'?stageLabel(l.stage):l.stage||''} (${l.count}頭)</option>`).join('')}
            </select>`}
        </div>
        <!-- 種別選択（複数選択肢がある場合のみ表示） -->
        ${LABEL_TYPE_DEFS.filter(t => t.target === targetType).length > 1 ? `
        <div class="card">
          <div class="card-title" style="font-size:.8rem">ラベル種別</div>
          <div class="filter-bar">
            ${LABEL_TYPE_DEFS.filter(t => t.target === targetType).map(t =>
              `<button class="pill ${labelType===t.code?'active':''}"
                onclick="Pages._lblSetLabelType('${t.code}')" title="${t.desc}">${t.label}</button>`
            ).join('')}
          </div>
          <div id="lbl-type-desc" style="font-size:.72rem;color:var(--text3);margin-top:4px">
            ${LABEL_TYPE_DEFS.find(t => t.code === labelType)?.desc || ''}
          </div>
        </div>` : ''}
        ` : ''}

        <!-- プレビューエリア -->
        <div class="card" id="lbl-preview-card">
          ${(targetId || (_isUnitMode && _unitDisplayId) || _isIndDraftMode)
            ? `<div class="card-title">プレビュー <span style="font-size:.72rem;color:var(--text3);font-weight:400">${dims.label}</span></div>
               <div id="lbl-html-preview" style="margin-bottom:12px;min-height:120px;
                 display:flex;align-items:center;justify-content:center;
                 border:1px solid var(--border2);border-radius:4px;overflow:hidden;background:#fff">
                 <div style="color:var(--text3);font-size:.8rem;text-align:center;padding:16px">
                   <div class="spinner" style="margin:0 auto 8px"></div>
                   PNG生成中...
                 </div>
               </div>
               <div id="lbl-qr-hidden" style="position:absolute;left:-9999px;top:-9999px;width:96px;height:96px;overflow:hidden"></div>`
            : `<div style="color:var(--text3);font-size:.85rem;text-align:center;padding:20px">
                 対象を選択するとプレビューが表示されます
               </div>`}
        </div>

        <!-- 発行後アクション（初期非表示） -->
        <div id="lbl-action-bar" style="display:none;margin-top:8px">
          <div style="background:rgba(45,122,82,.10);border:1px solid rgba(45,122,82,.35);
            border-radius:var(--radius);padding:14px 16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <span style="font-size:1.1rem">✅</span>
              <span style="font-size:.88rem;font-weight:700;color:var(--green)">PNG生成完了（${dims.label}）</span>
            </div>
            <!-- PNG保存（メイン） -->
            <button class="btn btn-primary btn-full"
              style="font-size:.95rem;padding:14px;font-weight:700;margin-bottom:8px"
              onclick="Pages._lblDownloadPNG()">
              💾 PNG保存（Brother印刷用）
            </button>
            <!-- 共有ボタン（Web Share API 対応端末のみ表示） -->
            <button id="lbl-share-btn" class="btn btn-ghost btn-full" style="margin-bottom:8px;display:none"
              onclick="Pages._lblSharePNG()">
              📤 共有 / Brotherアプリへ送る
            </button>
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <button class="btn btn-ghost" style="flex:1" onclick="Pages._lblPrintHTML()">🖨 ブラウザ印刷</button>
              <button class="btn btn-ghost" style="flex:1"
                onclick="Pages._lblGenerate('${targetType}','${targetId}','${labelType}')">🔄 再生成</button>
            </div>
            ${_inEblQueue ? `
            <div style="font-size:.72rem;color:var(--text3);padding:4px 0;text-align:center;margin-bottom:4px">
              ${_eblQueueIdx+1} / ${_eblQueueTotal}枚目
            </div>
            ${_eblQueueIdx + 1 < _eblQueueTotal ? `
            <button class="btn btn-primary btn-full" style="font-weight:700"
              onclick="window._eblGoNextLabel(${_eblQueueIdx})">
              次のラベルへ →（${_eblQueueIdx+2}/${_eblQueueTotal}枚目）
            </button>` : `
            <button class="btn btn-ghost btn-full" style="font-weight:700;color:var(--green)"
              onclick="window._eblGoNextLabel(${_eblQueueIdx})">
              ✅ 完了画面へ戻る（全${_eblQueueTotal}枚発行済み）
            </button>`}` : origin ? `
            <button class="btn btn-ghost btn-full" style="margin-top:2px;font-size:.82rem"
              onclick="routeTo('${origin.page}',${JSON.stringify(origin.params)})">
              ← ${targetType==='IND'?'個体':targetType==='LOT'?'ロット':targetType==='PAR'?'種親':'詳細'}に戻る
            </button>` : ''}
            <div style="font-size:.7rem;color:var(--text3);margin-top:10px;line-height:1.6;
              padding-top:8px;border-top:1px solid var(--border)">
              💡 保存したPNGをAndroidのギャラリーから「Brother Print Service Plugin」で印刷。
              62mm連続ロール使用、「62mm × 1m」を選択してください。
            </div>
          </div>
        </div>

      </div>`;

    // 自動生成
    if (targetId || (_isUnitMode && _unitDisplayId) || _isIndDraftMode) {
      const _autoTargetId = (_isUnitMode && !targetId) ? _unitDisplayId : targetId;
      console.log('[LABEL] auto-generate', { targetType, _autoTargetId, labelType });
      setTimeout(() => Pages._lblGenerate(targetType, _autoTargetId, labelType), 100);
      // 安全フォールバック: 6秒後もスピナーなら強制エラー表示
      setTimeout(() => {
        const _m = document.getElementById('lbl-html-preview');
        if (_m && _m.querySelector('.spinner')) {
          console.error('[LABEL] TIMEOUT: still spinner after 6s');
          _m.innerHTML = '<div style="color:#b00020;padding:20px;text-align:center;font-size:.85rem">PNG生成がタイムアウトしました。<br>ページを再読み込みして再試行してください。</div>';
        }
      }, 6000);
    }

    // Web Share API ボタン表示制御
    setTimeout(() => {
      const btn = document.getElementById('lbl-share-btn');
      if (btn && navigator.share && navigator.canShare) btn.style.display = '';
    }, 200);
  }

  Pages._lblSetType = (t) => {
    targetType = t.toUpperCase();
    targetId   = '';
    labelType  = _defaultLabelType(targetType);
    render();
  };
  Pages._lblSetTarget    = (id) => { targetId = id; render(); };
  Pages._lblSetLabelType = (t)  => {
    labelType = t;
    window._lastLabelType[targetType] = t;
    render();
  };
  render();
};

// ════════════════════════════════════════════════════════════════
// ラベル生成メイン
// ════════════════════════════════════════════════════════════════
Pages._lblGenerate = async function (targetType, targetId, labelType) {
  console.log('[LABEL] _lblGenerate called', { targetType, targetId, labelType });

  // UNIT / IND_DRAFT コンテキスト（グローバルから読む）
  const _unitCtx     = window._lblUnitCtx     || {};
  const _indDraftCtx = window._lblIndDraftCtx  || {};
  const _genDisplayId = (targetType === 'UNIT')      ? (targetId || _unitCtx.displayId || '') : targetId;
  const _genForSale   = (targetType === 'UNIT')      ? (!!_unitCtx.forSale) : false;
  const _genUnitDraft = (targetType === 'UNIT')      ? (_unitCtx.draft || null) : null;
  const _genIndDraft  = (targetType === 'IND_DRAFT') ? (_indDraftCtx.draftInd || null) : null;

  if (targetType === 'UNIT'      && !_genDisplayId) { console.warn('[LABEL] early return: UNIT no displayId'); return; }
  if (targetType === 'IND_DRAFT' && !_genIndDraft)  { console.warn('[LABEL] early return: IND_DRAFT no draftInd'); return; }
  if (targetType !== 'UNIT' && targetType !== 'IND_DRAFT' && !targetId) {
    console.warn('[LABEL] early return: no targetId for', targetType); return;
  }

  const preview = document.getElementById('lbl-html-preview');
  if (!preview) { console.error('[LABEL] lbl-html-preview not in DOM'); return; }
  console.log('[LABEL] preview mount found ✅');

  // ── ld（ラベルデータ）構築 ──────────────────────────────────
  let ld;
  try {
    console.log('[LABEL] generate start', targetType, targetId);
    if (targetType === 'IND') {
      console.log('[LABEL] branch IND');
      const ind     = Store.getIndividual(targetId) || {};
      const line    = Store.getLine(ind.line_id)    || {};
      const records = Store.getGrowthRecords(targetId) || [];
      ld = {
        qr_text:      `IND:${ind.ind_id || targetId}`,
        display_id:   ind.display_id    || targetId,
        line_code:    line.line_code    || line.display_id || '',
        stage_code:   ind.current_stage || ind.stage_life  || '',
        sex:          ind.sex           || '',
        hatch_date:   ind.hatch_date    || '',
        mat_type:     ind.current_mat   || '',
        mat_molt:     ind.mat_molt,
        locality:     ind.locality      || '',
        generation:   ind.generation    || '',
        note_private: ind.note_private  || '',
        size_category:ind.size_category || '',
        records:      records.slice().sort((a,b)=>String(b.record_date).localeCompare(String(a.record_date))).slice(0,8),
        label_type:   labelType || 'ind_fixed',
      };
    } else if (targetType === 'LOT') {
      console.log('[LABEL] branch LOT - targetId:', targetId);
      const lot     = Store.getLot(targetId)     || {};
      const line    = Store.getLine(lot.line_id) || {};
      const records = Store.getGrowthRecords(targetId) || [];
      const isMolt  = lot.mat_molt === true || lot.mat_molt === 'true';
      const autoType= (lot.stage === 'EGG' || lot.stage === 'T0' || lot.stage === 'L1L2') ? 'egg_lot' : 'multi_lot';
      ld = {
        qr_text:      `LOT:${lot.lot_id || targetId}`,
        display_id:   lot.display_id    || targetId,
        line_code:    line.line_code    || line.display_id || '',
        stage_code:   lot.stage_life    || lot.stage       || '',
        hatch_date:   lot.hatch_date    || '',
        count:        lot.count         || '',
        mat_type:     lot.mat_type      || '',
        mat_molt:     isMolt,
        sex_hint:     lot.sex_hint      || '',
        size_category:lot.size_category || '',
        note_private: lot.note_private  || '',
        collect_date: lot.collect_date  || lot.hatch_date  || '',
        records:      records.slice().sort((a,b)=>String(b.record_date).localeCompare(String(a.record_date))).slice(0,8),
        label_type:   labelType || autoType,
      };
    } else if (targetType === 'PAR') {
      console.log('[LABEL] branch PAR');
      const par   = (Store.getDB('parents') || []).find(p => p.par_id === targetId) || {};
      const pTags = (() => { try { return JSON.parse(par.paternal_tags||'[]')||[]; } catch(e){ return []; } })();
      const mTags = (() => { try { return JSON.parse(par.maternal_tags||'[]')||[]; } catch(e){ return []; } })();
      ld = {
        qr_text:      `PAR:${par.par_id || targetId}`,
        display_id:   par.parent_display_id || par.display_name || targetId,
        line_code:    '',
        stage_code:   '',
        sex:          par.sex || '',
        size_mm:      par.size_mm   ? par.size_mm   + 'mm' : '',
        weight_g:     par.weight_g  ? par.weight_g  + 'g'  : '',
        locality:     par.locality  || '',
        generation:   par.generation|| '',
        eclosion_date:par.eclosion_date || '',
        feeding_date: par.feeding_start_date || '',
        paternal_raw: (function() {
          var r = par.paternal_raw || '';
          try { var a = JSON.parse(r); if (Array.isArray(a)) return a.filter(Boolean).join(' '); } catch(_){}
          return r;
        })(),
        maternal_raw: (function() {
          var r = par.maternal_raw || '';
          try { var a = JSON.parse(r); if (Array.isArray(a)) return a.filter(Boolean).join(' '); } catch(_){}
          return r;
        })(),
        paternal_size: par.paternal_size_mm ? par.paternal_size_mm + 'mm' : '',
        maternal_size: par.maternal_size_mm ? par.maternal_size_mm + 'mm' : '',
        paternal_tags: pTags,
        maternal_tags: mTags,
        note_private: par.note     || '',
        hatch_date:   '',
        records:      [],
        label_type:   'parent',
      };
    } else if (targetType === 'UNIT') {
      console.log('[LABEL] branch UNIT - displayId:', _genDisplayId, '/ hasDraft:', !!_genUnitDraft);
      const storeUnit = (Store.getUnitByDisplayId && Store.getUnitByDisplayId(_genDisplayId))
        || (Store.getDB('breeding_units')||[]).find(u => u.display_id===_genDisplayId || u.unit_id===targetId)
        || null;
      const unit = storeUnit || _genUnitDraft || {};
      console.log('[LABEL] unit resolved - fromStore:', !!storeUnit, '/ fromDraft:', !storeUnit&&!!_genUnitDraft);
      const lineId = unit.line_id || '';
      const line   = lineId ? (Store.getLine(lineId)||{}) : {};
      // 由来ロット display_id リストを解決
      let _originLotsStr = '';
      try {
        let srcLots = [];
        if (unit.source_lots) {
          srcLots = typeof unit.source_lots === 'string' ? JSON.parse(unit.source_lots) : (unit.source_lots || []);
        }
        if (srcLots.length === 0 && unit.origin_lot_id) srcLots = [unit.origin_lot_id];
        const lotDisplayIds = srcLots.map(lid => {
          const lot = Store.getLot && Store.getLot(lid);
          return lot ? (lot.display_id || lid) : lid;
        });
        if (lotDisplayIds.length > 0) {
          const short = lotDisplayIds.map(d => { const m = d.match(/[A-Z0-9]+-L\d+/); return m ? m[0] : d; });
          _originLotsStr = '由来: ' + short.join(' / ');
        }
      } catch(_e) {}

      ld = {
        qr_text:       `BU:${_genDisplayId}`,
        display_id:    _genDisplayId,
        line_code:     unit.line_code || line.line_code || line.display_id || '',
        stage_code:    unit.stage_phase || 'T1',
        head_count:    unit.head_count  || 2,
        size_category: unit.size_category || '',
        hatch_date:    unit.hatch_date  || '',
        mat_type:      unit.mat_type    || 'T1',
        for_sale:      _genForSale,
        members:       unit.members     || [],
        records:       [],
        label_type:    't1_unit',
        note_private:  unit.note        || '',
        origin_lots_str: _originLotsStr,
      };
    } else if (targetType === 'IND_DRAFT') {
      console.log('[LABEL] branch IND_DRAFT');
      const di   = _genIndDraft || {};
      const line = di.line_id ? (Store.getLine(di.line_id)||{}) : {};
      ld = {
        qr_text:      'IND:DRAFT',
        display_id:   `${di.lot_display_id||''}#${di.lot_item_no||'?'} DRAFT`,
        line_code:    di.line_code || line.line_code || line.display_id || '',
        stage_code:   di.stage_phase || 'T1',
        sex:          '',
        hatch_date:   '',
        mat_type:     di.mat_type  || 'T1',
        mat_molt:     false,
        size_category:di.size_category || '',
        note_private: `T1個別飼育 ${di.lot_display_id||''} #${di.lot_item_no||''}`,
        records:      [],
        label_type:   'ind_fixed',
        _isDraft:     true,
      };
    } else {
      console.log('[LABEL] branch SET - targetId:', targetId);
      const set = (Store.getDB('pairings')||[]).find(p => p.set_id===targetId) || {};
      const _setLine = set.line_id ? (Store.getLine(set.line_id) || {}) : {};
      const _pars   = Store.getDB('parents') || [];
      const _setFather = set.father_par_id
        ? (_pars.find(function(p){ return p.par_id===set.father_par_id || p.parent_display_id===set.father_par_id; })||{})
        : {};
      const _setMother = set.mother_par_id
        ? (_pars.find(function(p){ return p.par_id===set.mother_par_id || p.parent_display_id===set.mother_par_id; })||{})
        : {};
      ld = {
        qr_text:       `SET:${set.set_id || targetId}`,
        display_id:    set.display_id   || set.set_name || targetId,
        line_code:     set.line_code || _setLine.line_code || _setLine.display_id || '',
        father_info:   _setFather.parent_display_id || _setFather.display_name || set.father_display_name || (set.father_par_id ? '（ID:'+set.father_par_id+'）' : '---'),
        mother_info:   _setMother.parent_display_id || _setMother.display_name || set.mother_display_name || (set.mother_par_id ? '（ID:'+set.mother_par_id+'）' : '---'),
        father_size:   _setFather.size_mm ? String(_setFather.size_mm).replace(/mm$/,'') + 'mm' : (set.father_size_mm ? set.father_size_mm + 'mm' : ''),
        mother_size:   _setMother.size_mm ? String(_setMother.size_mm).replace(/mm$/,'') + 'mm' : (set.mother_size_mm ? set.mother_size_mm + 'mm' : ''),
        father_blood:  (function(){ var r=_setFather.paternal_raw||''; try{var a=JSON.parse(r);if(Array.isArray(a))return a.filter(Boolean).join(' ');}catch(_){} return r; })(),
        mother_blood:  (function(){ var r=_setMother.paternal_raw||''; try{var a=JSON.parse(r);if(Array.isArray(a))return a.filter(Boolean).join(' ');}catch(_){} return r; })(),
        pairing_start: set.pairing_start || '',
        label_type:    'set',
      };
    }
  } catch (e) {
    console.error('[LABEL] generate error:', e.message, e.stack);
    UI.toast('ラベルデータ生成失敗: ' + e.message, 'error');
    const _errPrev = document.getElementById('lbl-html-preview');
    if (_errPrev) _errPrev.innerHTML = `<div style="color:var(--red,#e05050);padding:16px;font-size:.8rem;text-align:center">
      ⚠️ ラベル生成失敗<br><small>${e.message}</small></div>`;
    return;
  }

  // ── QR生成 ──────────────────────────────────────────────────
  const qrText = ld.qr_text || (targetType + ':' + targetId);
  console.log('[LABEL] qr build start - text:', qrText);

  // QR を dataURL として確実に取得するヘルパー（Promise ベースでポーリング）
  function _getQrDataUrl(text) {
    console.log('[LABEL] qr build start');
    console.log('[LABEL] qr target text:', text);
    return new Promise(function(resolve) {
      var container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:120px;height:120px';
      document.body.appendChild(container);

      try {
        new QRCode(container, {
          text: text,
          width: 120, height: 120,
          colorDark: '#000000', colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M,
        });
        console.log('[LABEL] qr render success (QRCode created)');
      } catch(e) {
        console.error('[LABEL] qr build failed (constructor):', e.message);
        document.body.removeChild(container);
        resolve(''); return;
      }

      var attempts = 0;
      var maxAttempts = 40; // 40 × 50ms = 2s max
      var poll = setInterval(function() {
        attempts++;
        var canvas = container.querySelector('canvas');
        var img    = container.querySelector('img');
        var dataUrl = '';

        if (canvas && canvas.width > 0) {
          try {
            console.log('[LABEL] qr canvas found - size:', canvas.width, 'x', canvas.height);
            var d = canvas.toDataURL('image/png');
            if (d && d.length > 200) {
              // 白画像判定: getImageData でピクセルを走査
              var ctx2 = canvas.getContext('2d');
              var imgData = ctx2 ? ctx2.getImageData(0, 0, canvas.width, canvas.height) : null;
              if (imgData) {
                var blackCount = 0;
                for (var pi = 0; pi < imgData.data.length; pi += 4) {
                  // R,G,B すべて 64 以下を黒画素とみなす
                  // alpha > 16 の不透明ピクセルのみカウント（透明を黒と誤判定しない）
                  if (imgData.data[pi+3] > 16 && imgData.data[pi] < 64 && imgData.data[pi+1] < 64 && imgData.data[pi+2] < 64) {
                    blackCount++;
                  }
                }
                console.log('[LABEL] qr black pixel count (alpha-aware):', blackCount);
                if (blackCount > 50) {
                  dataUrl = d;
                  console.log('[LABEL] qr accepted - black pixels:', blackCount);
                } else {
                  console.warn('[LABEL] qr rejected as blank - black pixels only:', blackCount);
                }
              } else {
                // getImageData 取れない場合は長さだけで判定（フォールバック）
                if (d.length > 1000) { dataUrl = d; }
              }
            }
          } catch(e) { console.warn('[LABEL] canvas.toDataURL error:', e.message); }
        }
        if (!dataUrl && img && img.src && img.src.startsWith('data:') && img.src.length > 500) {
          // img.src を canvas に描いて黒画素チェック（complete 待たずに即試みる）
          try {
            var tmpC2 = document.createElement('canvas');
            tmpC2.width = 60; tmpC2.height = 60;
            var tmpCtx2 = tmpC2.getContext('2d');
            var tmpImg2 = new Image();
            tmpImg2.src = img.src;
            tmpCtx2.drawImage(tmpImg2, 0, 0, 60, 60);
            var tmpData2 = tmpCtx2.getImageData(0, 0, 60, 60);
            var tmpBlack2 = 0;
            for (var tpi = 0; tpi < tmpData2.data.length; tpi += 4) {
              var a2 = tmpData2.data[tpi+3];
              var r2 = tmpData2.data[tpi];
              var g2 = tmpData2.data[tpi+1];
              var b2 = tmpData2.data[tpi+2];
              // alpha-aware: 透明(a=0)は黒扱いしない
              // 白背景(r=g=b=255)も黒扱いしない
              if (a2 > 16 && r2 < 64 && g2 < 64 && b2 < 64) tmpBlack2++;
            }
            console.log('[LABEL] qr img.src black pixel count (alpha-aware):', tmpBlack2);
            if (tmpBlack2 > 50) {
              dataUrl = img.src;
              console.log('[LABEL] qr accepted via img.src - black pixels:', tmpBlack2);
            } else {
              console.warn('[LABEL] qr img.src rejected as blank - black pixels:', tmpBlack2);
            }
          } catch(_imgErr) { console.warn('[LABEL] img.src canvas check failed:', _imgErr.message); }
        }

        if (dataUrl) {
          console.log('[LABEL] qr dataUrl length:', dataUrl.length, 'via', canvas ? 'canvas' : 'img', 'attempts:', attempts);
          clearInterval(poll);
          document.body.removeChild(container);
          resolve(dataUrl); return;
        }

        if (attempts >= maxAttempts) {
          clearInterval(poll);
          console.error('[LABEL] qr build failed (timeout). canvas:', !!canvas, 'img:', !!img);
          document.body.removeChild(container);
          resolve('');
        }
      }, 50);
    });
  }

  // QR dataURL 取得 → ラベル生成 → PNG化
  (async function _lblRender() {
    try {
      console.log('[LABEL] qr build start - build:20260413b');
      console.log('[LABEL] qr target type:', targetType, '| targetId:', targetId);
      console.log('[LABEL] qr rect:', JSON.stringify(QR_RECT_MM));
      console.log('[LABEL] qr target text:', qrText);
      var qrSrc = await _getQrDataUrl(qrText);
      console.log('[LABEL] qr dataUrl created - length:', qrSrc ? qrSrc.length : 0);
      if (qrSrc) {
        console.log('[LABEL] qr final src prefix:', qrSrc.slice(0, 30));
      } else {
        console.error('[LABEL] qr build failed - qrSrc empty');
        console.log('[LABEL] qr src empty => QR ERR will be shown');
      }

      console.log('[LABEL] html qr rendered - qrSrc length:', qrSrc ? qrSrc.length : 0);
      var html = _buildLabelHTML(ld, qrSrc);
      var dims = _labelDimensions(ld.label_type, targetType);

      window._currentLabel = {
        displayId:  ld.display_id,
        fileName:   (ld.line_code ? ld.line_code.replace(/[^a-zA-Z0-9_-]/g,'_')+'_' : '')
                    + (ld.display_id||'label').replace(/[^a-zA-Z0-9_-]/g,'_') + '.png',
        html:       html,
        pngDataUrl: '',
        dims:       dims,
      };

      var _previewNow = document.getElementById('lbl-html-preview');
      if (!_previewNow) { console.error('[LABEL] lbl-html-preview missing'); return; }
      console.log('[LABEL] preview mount found');

      console.log('[LABEL] label render start');
      // ── Step1: raw HTML プレビューを先に表示（QR可視確認用）──────────
      var ifrW = Math.round(dims.wPx * 1.5);
      var ifrH = Math.round(dims.hPx * 1.5);
      _previewNow.innerHTML = '<iframe srcdoc="' + html.replace(/"/g,'&quot;')
        + '" style="width:' + ifrW + 'px;height:' + ifrH + 'px;border:none;display:block" scrolling="no"></iframe>';
      console.log('[LABEL] raw preview injected - qrSrc length:', qrSrc ? qrSrc.length : 0);
      console.log('[LABEL] raw preview start - iframe mode');

      var bar = document.getElementById('lbl-action-bar');
      if (bar) { bar.style.display = 'block'; bar.scrollIntoView({ behavior:'smooth', block:'nearest' }); }

      // ── Step2: 500ms 待機（raw プレビューを一瞬確認できる）──────────
      await new Promise(function(r){ setTimeout(r, 500); });

      // ── Step3: PNG生成 ─────────────────────────────────────────────
      console.log('[LABEL] png build start - size:', dims.label);
      console.log('[LABEL] png base built start');
      var pngDataUrl = null;
      try {
        pngDataUrl = await _buildLabelPNG(html, dims);
        if (pngDataUrl) console.log('[LABEL] png build done - length:', pngDataUrl.length);
      } catch(pngErr) {
        console.warn('[LABEL] png build failed:', pngErr.message);
      }

      // ── Step4: QR手動合成（html2canvasはdata:URL imgを確実に描かないため常に合成）──
      if (pngDataUrl && qrSrc) {
        var pngHasQr = await _checkPngHasQr(pngDataUrl, dims);
        console.log('[LABEL] qr composite mode:', pngHasQr ? 'on (verify+composite)' : 'on (needs composite)');
        // qrSrcがある場合は常に手動合成を実行（html2canvasの描画成否に関わらず）
        try {
          pngDataUrl = await _compositeQrOntoPng(pngDataUrl, qrSrc, dims);
          console.log('[LABEL] qr composited onto PNG - final length:', pngDataUrl.length);
        } catch(compErr) {
          console.warn('[LABEL] qr composite failed:', compErr.message);
          // 合成失敗でもpngDataUrlは保持（QRなしラベルとして出力）
        }
      } else if (pngDataUrl && !qrSrc) {
        console.log('[LABEL] qr composite mode: skipped (no qrSrc)');
      }
      console.log('[LABEL] final png done');

      if (pngDataUrl) {
        window._currentLabel.pngDataUrl = pngDataUrl;
        console.log('[LABEL] label render success');
        _previewNow.innerHTML = '<img src="' + pngDataUrl
          + '" style="max-width:100%;height:auto;border-radius:4px;display:block" alt="ラベルプレビュー">';
        console.log('[LABEL] preview render done (PNG with QR composite)');
      } else {
        // PNG失敗時は iframe のまま
        console.log('[LABEL] preview render done (iframe - PNG failed)');
      }

    } catch(err) {
      console.error('[LABEL] label render failed:', err.message, err.stack);
      var errMount = document.getElementById('lbl-html-preview');
      if (errMount) {
        errMount.innerHTML = '<div style="color:var(--red,#e05050);padding:16px;font-size:.8rem;text-align:center">⚠️ ラベル描画エラー<br><small>' + err.message + '</small></div>';
      } else {
        var main2 = document.getElementById('main');
        if (main2) main2.innerHTML += '<div style="color:red;padding:16px">⚠️ ' + err.message + '</div>';
      }
    }
  })();;
};


// ════════════════════════════════════════════════════════════════
// HTMLラベル構築 — 感熱印刷最適化版
//
// 設計方針:
//   - 完全な黒/白のみ（グレー禁止）
//   - 線は 1.5px〜2px（細線禁止）
//   - ヘッダーは黒ベタ+白文字
//   - 最小フォント 7px
//   - グレー背景・半透明禁止
// ════════════════════════════════════════════════════════════════

// ── チェックボックス（感熱向け太め） ──────────────────────────────
function _chkThermal(label, checked) {
  return '<span style="margin-right:5px;font-weight:700;color:#000">'
    + (checked ? '■' : '□') + label + '</span>';
}

// ── QRコード用HTML（静穏領域付き） ────────────────────────────────
function _qrBox(qrSrc, sizePx) {
  var sz = sizePx || 50;
  if (!qrSrc) {
    return '<div style="width:' + sz + 'px;height:' + sz + 'px;border:2px solid #000;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'font-size:7px;font-weight:700;color:#000;text-align:center;line-height:1.3">'
      + 'QR<br>ERR</div>';
  }
  return '<div style="background:#fff;padding:4px;display:inline-block;line-height:0;border:2px solid #000">'
    + '<img src="' + qrSrc + '" style="width:' + sz + 'px;height:' + sz + 'px;display:block"></div>';
}

// ── ロット/個体 共通ラベル（62mm × 70mm） ───────────────────────
function _buildLabelHTML(ld, qrSrc) {
  var lt = ld.label_type || 'ind_fixed';
  var noteShort = (ld.note_private||'').slice(0, 28);

  if (lt === 'set')     return _buildSetLabelHTML(ld, null, qrSrc);
  if (lt === 'parent')  return _buildParentLabelHTML(ld, null, qrSrc);
  if (lt === 't1_unit') return _buildT1UnitLabelHTML(ld, null, qrSrc);

  var isLot   = lt === 'multi_lot' || lt === 'egg_lot';
  var chk     = _chkThermal;
  var sexCats = (ld.size_category||'').split(',').map(function(s){ return s.trim(); });
  var headerLabel = lt === 'ind_fixed' ? '個別飼育'
    : (lt === 'multi_lot' || lt === 'egg_lot') ? 'ロット'
    : lt === 't1_unit' ? 'ユニット'
    : '個別飼育'; // fallback

  // ── display_id パース ─────────────────────────────────────────────
  // 例: "HM2026-B1-L01-A" → lineBadge="B1"  lotSuffix="L01-A" (最後の2セグメント)
  var rawId     = ld.display_id || '';
  var idParts   = rawId.split('-');
  var lineBadge = ld.line_code || '';   // "B1"
  // lotSuffix: display_id の ライン部分 より後の全体
  // 例: "HM2026-B1-L01-A" → idParts=[HM2026,B1,L01,A] → after lineBadge
  var lotSuffix = '';
  if (lineBadge && rawId.includes('-' + lineBadge + '-')) {
    lotSuffix = rawId.slice(rawId.indexOf('-' + lineBadge + '-') + ('-' + lineBadge + '-').length);
  } else if (idParts.length >= 3) {
    lotSuffix = idParts.slice(2).join('-');  // "L01-A" など
  }
  // prefix: lineBadge より前の部分 (例: "HM2026")
  var prefix = lineBadge && rawId.includes(lineBadge)
    ? rawId.slice(0, rawId.indexOf(lineBadge)).replace(/-$/, '')
    : '';

  console.log('[LABEL] header badge render: line=' + lineBadge + ' suffix=' + lotSuffix + ' prefix=' + prefix);
  console.log('[LABEL] header badge render: count=' + (ld.count||''));

  // ── Mx（モルト）: T2系マットのときだけ表示 ──────────────────────────
  var matType   = ld.mat_type || '';
  var showMx    = (matType === 'T2' || matType === 'T3');  // T2系のみ
  var mxIsOn    = ld.mat_molt === true || ld.mat_molt === 'true';
  var mxIsOff   = !mxIsOn;
  if (showMx) console.log('[LABEL] mx checkbox render: mat=' + matType + ' on=' + mxIsOn);

  // ── 記録データ ───────────────────────────────────────────────────
  var records   = ld.records || [];
  var sortedR   = records.slice().sort(function(a,b){
    return String(a.record_date||'').localeCompare(String(b.record_date||''));
  });
  var recentAll = sortedR.slice(-8);
  var leftCol   = recentAll.slice(0, 4);
  var rightCol  = recentAll.slice(4, 8);
  while (leftCol.length  < 4) leftCol.push(null);
  while (rightCol.length < 4) rightCol.push(null);

  var _filledCount = recentAll.filter(function(r){ return !!r; }).length;
  console.log('[LABEL] record row height unified - filled:', _filledCount, '/ total: 8');

  // ── セルスタイル（全行統一高さ）──────────────────────────────────
  var tdU = 'border:1.5px solid #000;padding:6px 2px;font-size:8px;font-weight:700;color:#000;text-align:center'; // 行高1.3倍, フォント1.2倍
  var thS = 'border:1.5px solid #000;padding:2px 2px;font-size:7.5px;font-weight:700;background:#000;color:#fff;text-align:center'; // 1.2倍

  // ── 記録行HTML ────────────────────────────────────────────────────
  var rowsHtml = '';
  for (var i = 0; i < 4; i++) {
    var lRec  = leftCol[i];
    var rRec  = rightCol[i];
    var lDate = lRec ? String(lRec.record_date||'').slice(5) : '';
    var lWt   = lRec ? (lRec.weight_g ? lRec.weight_g + 'g' : '') : '';
    var rDate = rRec ? String(rRec.record_date||'').slice(5) : '';
    var rWt   = rRec ? (rRec.weight_g ? rRec.weight_g + 'g' : '') : '';
    var lExch = '', rExch = '';
    if (lRec) {
      var le = isLot ? (lRec.exchange_type||'') : String(lRec.note_private||'').slice(0,4);
      lExch = ((le==='FULL'||le==='全')?'■':'□')+'全<br>'+((le==='ADD'||le==='追')?'■':'□')+'追';
    }
    if (rRec) {
      var re2 = isLot ? (rRec.exchange_type||'') : String(rRec.note_private||'').slice(0,4);
      rExch = ((re2==='FULL'||re2==='全')?'■':'□')+'全<br>'+((re2==='ADD'||re2==='追')?'■':'□')+'追';
    }
    rowsHtml += '<tr>'
      + '<td style="' + tdU + '">' + (lDate || '&nbsp;') + '</td>'
      + '<td style="' + tdU + ';position:relative">'
        + (lWt || '&nbsp;')
        + '<span style="position:absolute;bottom:1px;right:2px;font-size:5px;font-weight:700;color:#000">g</span>'
        + '</td>'
      + '<td style="' + tdU + '">' + (lExch || '□全<br>□追') + '</td>'
      + '<td style="width:1.5px;background:#000;padding:0"></td>'
      + '<td style="' + tdU + '">' + (rDate || '&nbsp;') + '</td>'
      + '<td style="' + tdU + ';position:relative">'
        + (rWt || '&nbsp;')
        + '<span style="position:absolute;bottom:1px;right:2px;font-size:5px;font-weight:700;color:#000">g</span>'
        + '</td>'
      + '<td style="' + tdU + '">' + (rExch || '□全<br>□追') + '</td>'
      + '</tr>';
  }

  // ── 上部情報 HTML ──────────────────────────────────────────────────
  // バッジスタイル（大）
  var bLg = 'display:inline-block;border:1.5px solid #000;border-radius:3px;'
    + 'padding:0 4px;font-size:12px;font-weight:700;color:#000;margin-right:2px;line-height:1.5';

  // "B1" バッジ
  var lineBadgeHtml = lineBadge
    ? '<span style="' + bLg + '">' + lineBadge + '</span>'
    : '';
  // "L01-A" バッジ（lotSuffix をそのまま1つにまとめる）
  var lotSuffixHtml = lotSuffix
    ? '<span style="' + bLg + '">' + lotSuffix + '</span>'
    : '';
  // prefix 行（控えめ小文字）
  // prefixLine は廃止（prefix は badge 行の先頭に inline 表示）
  var prefixLine = '';  // unused

  // 頭数バッジ（右上に寄せる）
  var countBadge = (isLot && ld.count)
    ? '<span style="display:inline-block;border:2px solid #000;border-radius:3px;'
      + 'padding:0 3px;font-size:13px;font-weight:700;color:#000;line-height:1.4">'
      + ld.count + '頭</span>'
    : '';

  // 性別（個体ラベル）
  var sexHtml = !isLot && ld.sex
    ? '<span style="font-size:9px;font-weight:700;color:#000">' + ld.sex + '&nbsp;</span>'
    : '';

  // 孵化日（ロットラベルは下部に専用欄があるのでヘッダーには出さない）
  var hatchHtml = (!isLot && ld.hatch_date)
    ? '<div style="font-size:6.5px;font-weight:700;color:#000">孵: ' + ld.hatch_date + '</div>'
    : '';

  // Mx 行（T2系のみ）
  var mxHtml = showMx
    ? '<div style="font-size:7px;font-weight:700;color:#000;line-height:1.7">'
      + 'Mx:' + chk('ON', mxIsOn) + chk('OFF', mxIsOff) + '</div>'
    : '';

  // LOT は 62×40mm、IND/DRAFT は 62×70mm
  var _bodyH  = isLot ? '40mm' : '70mm';
  var _pageSz = isLot ? '62mm 40mm' : '62mm 70mm';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: ' + _pageSz + '; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:' + _bodyH + '; font-family:sans-serif; font-size:7px; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:' + _bodyH + ';display:flex;flex-direction:column">\n'

    // ヘッダーバー（LOTは斜線、INDは黒ベタ）
    + (isLot
      ? '  <div style="position:relative;background:#000;color:#fff;font-size:9px;font-weight:700;padding:0.8mm 2mm;height:5mm;display:flex;align-items:center;flex-shrink:0;overflow:hidden">'
        + '<span style="position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(45deg,transparent 0,transparent 4px,rgba(255,255,255,0.28) 4px,rgba(255,255,255,0.28) 6px);pointer-events:none"></span>'
        + '<span style="position:relative;z-index:1">' + headerLabel + ' | HerculesOS</span>'
        + '</div>\n'
      : '  <div style="background:#000;color:#fff;font-size:9px;font-weight:700;padding:0.8mm 2mm;height:5mm;display:flex;align-items:center;flex-shrink:0">'
        + headerLabel + ' | HerculesOS</div>\n'
    )

    // QR + 上部情報
    + '  <div style="display:flex;padding:1mm 1.5mm 0;gap:0;flex-shrink:0">\n'
    + '    <div style="flex-shrink:0;margin-right:1.5mm">' + _qrBox(qrSrc, 44) + '</div>\n'
    + '    <div style="flex:1;min-width:0;padding-left:1.5mm;border-left:2px solid #000">\n'

    // HM2026 + [B1] [L01-A] バッジ行　+　右上に頭数バッジ
    // prefix（年度）は lineBadge の前に同じ行で表示
    + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">\n'
    + '        <div>'
    + (prefix ? '<span style="font-size:7px;font-weight:700;color:#000;margin-right:2px">' + prefix + '-</span>' : '')
    + lineBadgeHtml + lotSuffixHtml + '</div>\n'
    + '        <div>' + countBadge + sexHtml + '</div>\n'
    + '      </div>\n'

    // 孵化日
    + '      ' + hatchHtml + '\n'

    // 区分（1行目）
    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.7">'
    + '区分:' + chk('大',sexCats.indexOf('大')>=0) + chk('中',sexCats.indexOf('中')>=0) + chk('小',sexCats.indexOf('小')>=0)
    + '</div>\n'

    // マット（2行目）
    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.7">'
    + 'M:' + ['T0','T1','T2','T3'].map(function(m){ return chk(m,ld.mat_type===m); }).join('')
    + '</div>\n'

    // ステージ（3行目）
    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.7">'
    + 'St:' + _stageCheckboxRow(ld.stage_code) + '</div>\n'

    // Mx（4行目、T2系のみ）
    + '      ' + mxHtml + '\n'

    + '    </div>\n'
    + '  </div>\n'

    // LOT: 日付欄のみ、テーブルなし | IND: 2列×4行テーブル
    + (isLot ? (
      // ロットラベル専用レイアウト（採卵日/孵化日 モノスペース完全整列）
      '  <div style="border-top:2px solid #000;margin:1mm 1.5mm 0"></div>\n'
      + '  <div style="padding:1.5mm 2mm;flex:1;display:flex;flex-direction:column;justify-content:space-evenly">\n'
      // pre タグで等幅フォント確実に適用 → / の位置が完全一致
      + '    <pre style="font-family:monospace;font-size:17px;font-weight:700;color:#000;margin:0 0 4px;line-height:1.5;white-space:pre">'
      +           '採卵日  ' + (ld.collect_date ? ld.collect_date.replace(/-/g,'/') : '____/__/__') + '</pre>\n'
      + '    <pre style="font-family:monospace;font-size:17px;font-weight:700;color:#000;margin:0;line-height:1.5;white-space:pre">'
      +           '孵化日  ' + (ld.hatch_date ? ld.hatch_date.replace(/-/g,'/') : '____/__/__') + '</pre>\n'
      + '  </div>\n'
          ) : (
      // 個別飼育ラベル: 記録表（2列×4行）
      '  <div style="border-top:1.5px solid #000;margin:0.8mm 1.5mm 0"></div>\n'
      + '  <div style="flex:1;padding:0 1.5mm 0.5mm;overflow:hidden">\n'
      + '    <table style="width:100%;border-collapse:collapse;table-layout:fixed">\n'
      + '      <thead><tr>'
      + '<th style="' + thS + '">日付</th>'
      + '<th style="' + thS + '">体重</th>'
      + '<th style="' + thS + '">交換</th>'
      + '<th style="width:1.5px;background:#000;padding:0"></th>'
      + '<th style="' + thS + '">日付</th>'
      + '<th style="' + thS + '">体重</th>'
      + '<th style="' + thS + '">交換</th>'
      + '</tr></thead>\n'
      + '      <tbody>' + rowsHtml + '</tbody>\n'
      + '    </table>\n'
      + '  </div>\n'
    ))

    // フッター
    + (noteShort
      ? '  <div style="padding:0.5mm 2mm 1mm;font-size:7px;font-weight:700;color:#000;overflow:hidden;white-space:nowrap">📝 ' + noteShort + '</div>\n'
      : '')
    + '</div>\n</body></html>';
}


// ── 種親ラベル（62mm × 40mm）─────────────────────────────────────
function _buildParentLabelHTML(ld, _unused, qrSrc) {
  var qr = (typeof _unused === 'string' && _unused.startsWith('data:')) ? _unused : qrSrc;

  var rawId   = ld.display_id || '';
  var idParts = rawId.split('-');
  var idCode  = idParts.length >= 2 ? idParts[idParts.length - 1] : rawId;

  var sizeStr  = ld.size_mm       || '';
  var ecStr    = ld.eclosion_date || '';
  var feedStr  = ld.feeding_date  || '';
  var locStr   = [ld.locality, ld.generation].filter(Boolean).join(' / ');
  var patStr   = ld.paternal_raw  ? ld.paternal_raw.slice(0, 24)  + (ld.paternal_size  ? ' ' + ld.paternal_size  : '') : '';
  var matStr   = ld.maternal_raw  ? ld.maternal_raw.slice(0, 24)  + (ld.maternal_size  ? ' ' + ld.maternal_size  : '') : '';

  var badgeFz  = idCode.length <= 1 ? '34px' : idCode.length <= 2 ? '26px' : '18px';
  var sexColor = ld.sex === '♂' ? '#1a6bb5' : ld.sex === '♀' ? '#b51a5a' : '#000';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 40mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:40mm; font-family:sans-serif; font-size:7px; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:40mm;display:flex;flex-direction:column">\n'
    + '  <div style="background:#000;color:#fff;font-size:8px;font-weight:700;padding:0.6mm 2mm;height:4.5mm;display:flex;align-items:center;flex-shrink:0">種親 | HerculesOS</div>\n'

    + '  <div style="display:flex;flex:1;overflow:hidden">\n'

    // QR
    + '    <div style="flex-shrink:0;padding:1mm 1mm 0.5mm 1.5mm">' + _qrBox(qr, 42) + '</div>\n'

    // 中央: 全情報
    + '    <div style="flex:1;min-width:0;border-left:2px solid #000;padding:0.8mm 1mm 0.5mm 1.5mm;'
    + 'display:flex;flex-direction:column;justify-content:space-between;overflow:hidden">\n'

    // 行1: ID + 性別+サイズ 同一行
    + '      <div style="display:flex;align-items:baseline;gap:3px;margin-bottom:1px">\n'
    + '        <span style="font-family:monospace;font-size:8.5px;font-weight:800;color:#000;'
    + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">' + rawId + '</span>\n'
    + '        <span style="font-size:9px;font-weight:800;color:' + sexColor + ';flex-shrink:0">' + (ld.sex||'') + '</span>\n'
    + '        <span style="font-size:8.5px;font-weight:700;color:#000;flex-shrink:0">' + sizeStr + '</span>\n'
    + '      </div>\n'

    // 行2: 産地
    + (locStr ? '      <div style="font-size:6.5px;font-weight:600;color:#444;margin-bottom:2px">' + locStr + '</div>\n' : '')

    // 行3: 羽化日・後食日 2列
    + '      <div style="display:flex;gap:4px;margin-bottom:3px">\n'
    + '        <div style="flex:1;border-bottom:1px solid #888;padding-bottom:0.5px">\n'
    + '          <div style="font-size:5px;color:#777;font-weight:700;letter-spacing:.3px">羽化日</div>\n'
    + '          <div style="font-size:7px;font-weight:700;color:#000">'
    + (ecStr ? ecStr : '<span style="color:#bbb">____/__/__</span>') + '</div>\n'
    + '        </div>\n'
    + '        <div style="flex:1;border-bottom:1px solid #888;padding-bottom:0.5px">\n'
    + '          <div style="font-size:5px;color:#777;font-weight:700;letter-spacing:.3px">後食日</div>\n'
    + '          <div style="font-size:7px;font-weight:700;color:#000">'
    + (feedStr ? feedStr : '<span style="color:#bbb">____/__/__</span>') + '</div>\n'
    + '        </div>\n'
    + '      </div>\n'

    // 行4: 親情報
    + '      <div style="border-top:0.8px solid #ccc;padding-top:1.5px">\n'
    + (patStr ? '        <div style="font-size:5.8px;font-weight:700;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
      + '<span style="color:#1a6bb5">♂</span> ' + patStr + '</div>\n' : '')
    + (matStr ? '        <div style="font-size:5.8px;font-weight:700;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
      + '<span style="color:#b51a5a">♀</span> ' + matStr + '</div>\n' : '')
    + '      </div>\n'

    + '    </div>\n'

    // 右: 識別バッジ
    + '    <div style="flex-shrink:0;width:12mm;display:flex;align-items:center;justify-content:center;padding:0 1mm">\n'
    + '      <div style="border:2.5px solid #000;border-radius:5px;'
    + 'font-size:' + badgeFz + ';font-weight:800;color:#000;line-height:1;text-align:center;'
    + 'width:10mm;height:10mm;display:flex;align-items:center;justify-content:center">'
    + idCode + '</div>\n'
    + '    </div>\n'

    + '  </div>\n'
    + '</div>\n</body></html>';
}


// ── 産卵セットラベル（62mm × 40mm）──────────────────────────────
function _buildSetLabelHTML(ld, _unused, qrSrc) {
  var qr = (typeof _unused === 'string' && _unused.startsWith('data:')) ? _unused : qrSrc;

  var rawId  = ld.display_id || '';
  var _rawLC = ld.line_code  || '';

  // ライン短コード抽出
  function _shortCode(s) {
    if (!s) return '';
    if (/^SET-/i.test(s)) return '';
    var p = s.split('-').filter(Boolean);
    if (p.length >= 3) return p[1];
    if (p.length === 2) return p[0].replace(/^[A-Za-z]{1,3}[0-9]{4}/, '') || '';
    return s.replace(/^[A-Za-z]{1,3}[0-9]{4}/, '');
  }
  var lineCode = _shortCode(_rawLC) || '';
  var badgeFz  = lineCode.length <= 1 ? '30px' : lineCode.length <= 2 ? '24px' : '16px';

  var fInfo    = ld.father_info  || '';
  var mInfo    = ld.mother_info  || '';
  var fSize    = ld.father_size  || '';
  var mSize    = ld.mother_size  || '';
  var fBlood   = ld.father_blood || '';
  var mBlood   = ld.mother_blood || '';

  // 親表示: "M26-A (168mm)" 形式
  var fMain    = fInfo  + (fSize  ? ' (' + fSize  + ')' : '');
  var mMain    = mInfo  + (mSize  ? ' (' + mSize  + ')' : '');

  // 血統（短縮）
  var fBloodSh = fBlood ? fBlood.slice(0, 18) : '';
  var mBloodSh = mBlood ? mBlood.slice(0, 18) : '';

  // セパレータ線スタイル
  var sepH = 'border-top:1px solid #000';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 40mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:40mm; font-family:sans-serif; font-size:7px; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:40mm;display:flex;flex-direction:column">\n'

    // ── ヘッダー
    + '  <div style="background:#000;color:#fff;font-size:8px;font-weight:700;'
    + 'padding:0.6mm 2mm;height:4.5mm;display:flex;align-items:center;flex-shrink:0">'
    + '産卵セット | HerculesOS</div>\n'

    // ── メインエリア: QR ｜ ラインバッジ ｜ 右3段（ID+日付 / ♂ / ♀）
    + '  <div style="display:flex;flex:1;overflow:hidden">\n'

    // ① QR
    + '    <div style="flex-shrink:0;padding:1mm 1mm 0.5mm 1.5mm">' + _qrBox(qr, 42) + '</div>\n'

    // ② ラインバッジ列（細め）
    + '    <div style="flex-shrink:0;width:11mm;border-left:1.5px solid #000;border-right:1.5px solid #000;'
    + 'display:flex;align-items:center;justify-content:center">\n'
    + (lineCode
      ? '<div style="border:2px solid #000;border-radius:4px;'
        + 'font-size:' + badgeFz + ';font-weight:800;color:#000;line-height:1.1;'
        + 'text-align:center;width:8.5mm;min-height:8.5mm;display:flex;align-items:center;justify-content:center">'
        + lineCode + '</div>\n'
      : '')
    + '    </div>\n'

    // ③ 右列：3段（ID+日付 / ♂ / ♀）
    + '    <div style="flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden">\n'

    // 段1: SET ID + ペアリング日
    + '      <div style="padding:0.8mm 1.5mm 0.6mm;border-bottom:1.5px solid #000;flex-shrink:0">\n'
    + '        <div style="font-family:monospace;font-size:8.5px;font-weight:800;color:#000;'
    + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + rawId + '</div>\n'
    + (ld.pairing_start
      ? '        <div style="font-size:7px;font-weight:600;color:#444;margin-top:1px">ペアリング: ' + ld.pairing_start + '</div>\n'
      : '')
    + '      </div>\n'

    // 段2: ♂ 情報
    + '      <div style="padding:0.7mm 1.5mm;border-bottom:1px solid #ddd;flex:1;display:flex;flex-direction:column;justify-content:center">\n'
    + '        <div style="display:flex;align-items:baseline;gap:3px;flex-wrap:nowrap;overflow:hidden">\n'
    + '          <span style="font-size:8.5px;font-weight:800;color:#1a6bb5;flex-shrink:0">♂</span>\n'
    + '          <span style="font-size:8px;font-weight:700;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + fMain + '</span>\n'
    + '        </div>\n'
    + (fBloodSh ? '        <div style="font-size:6px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">' + fBloodSh + '</div>\n' : '')
    + '      </div>\n'

    // 段3: ♀ 情報
    + '      <div style="padding:0.7mm 1.5mm;flex:1;display:flex;flex-direction:column;justify-content:center">\n'
    + '        <div style="display:flex;align-items:baseline;gap:3px;flex-wrap:nowrap;overflow:hidden">\n'
    + '          <span style="font-size:8.5px;font-weight:800;color:#b51a5a;flex-shrink:0">♀</span>\n'
    + '          <span style="font-size:8px;font-weight:700;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + mMain + '</span>\n'
    + '        </div>\n'
    + (mBloodSh ? '        <div style="font-size:6px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">' + mBloodSh + '</div>\n' : '')
    + '      </div>\n'

    + '    </div>\n'
    + '  </div>\n'
    + '</div>\n</body></html>';
}


// ── T1飼育ユニットラベル（62mm × 70mm）──────────────────────────
function _buildT1UnitLabelHTML(ld, _unused, qrSrc) {
  var qr       = (typeof _unused === 'string' && _unused.startsWith('data:')) ? _unused : qrSrc;
  var chk      = _chkThermal;
  var forSale  = !!ld.for_sale;
  var hc       = ld.head_count || 2;
  var sizeCats = (ld.size_category||'').split(',').map(function(s){ return s.trim(); });
  var mat      = ld.mat_type || 'T1';
  var lineCode = ld.line_code || '';
  var originLS = ld.origin_lots_str || '';
  var t1Date   = ld.t1_date || '';  // T1移行日（t1_session.jsから渡される）

  // ── display_id を分解してバッジ用に整理 ──
  // 例: "HM2026-B1-U001" → prefix="HM2026", linePart="B1", unitSuffix="U001"
  var rawId     = ld.display_id || '';
  var idParts   = rawId.split('-');
  // prefix: lineCode の前の部分（末尾ハイフン除去）
  var prefix    = '';
  var unitSuffix = '';
  if (lineCode && rawId.indexOf(lineCode) !== -1) {
    var _lcIdx = rawId.indexOf(lineCode);
    prefix = rawId.slice(0, _lcIdx).replace(/-$/, '');
    // unitSuffix: lineCode の後の全体（"B2-U01" → "U01" or "L01-A"）
    var _afterLine = rawId.slice(_lcIdx + lineCode.length).replace(/^-/, '');
    // 最後のセグメントを unitSuffix とする（"U01" or "U001"）
    var _aParts = _afterLine.split('-').filter(function(p){ return p.length > 0; });
    unitSuffix = _aParts.length > 0 ? _aParts[_aParts.length - 1] : '';
  } else {
    prefix = idParts.length > 1 ? idParts[0] : '';
    unitSuffix = idParts.length > 1 ? idParts[idParts.length - 1] : rawId;
  }

  console.log('[LABEL_UNIT] display_id:', rawId, '/ line:', lineCode, '/ prefix:', prefix, '/ suffix:', unitSuffix);

  // ── メンバー情報（T1移行時の各頭のデータ）──
  var m0 = (ld.members && ld.members[0]) ? ld.members[0] : null;
  var m1 = (ld.members && ld.members[1]) ? ld.members[1] : null;
  var m0w = m0 && m0.weight_g ? String(m0.weight_g) : '';
  var m1w = m1 && m1.weight_g ? String(m1.weight_g) : '';

  // Mx（モルト）: T2系のみ表示
  var showMx = (mat === 'T2' || mat === 'T3');
  var mxIsOn = ld.mat_molt === true || ld.mat_molt === 'true';

  // ── セルスタイル（個別ラベルと統一）──
  var tdU = 'border:1.5px solid #000;padding:4px 2px;font-size:8px;font-weight:700;color:#000;text-align:center';
  var thS = 'border:1.5px solid #000;padding:2px 2px;font-size:7.5px;font-weight:700;background:#000;color:#fff;text-align:center';

  // ── 記録表（2列 × 4行）──────────────────────────────────────
  // 左列: ①頭目の記録（T1移行行 + 空白3行）
  // 右列: ②頭目の記録（T1移行行 + 空白3行）
  function _wgtCell(wgt) {
    return '<td style="' + tdU + ';position:relative">'
      + (wgt ? wgt : '&nbsp;')
      + '<span style="position:absolute;bottom:1px;right:2px;font-size:5px;font-weight:700;color:#000">g</span>'
      + '</td>';
  }

  // 4カラム × 4行（日付 / 体重① / 体重② / 交換）
  var rowsHtml = '';
  for (var ri = 0; ri < 4; ri++) {
    var isT1Row = (ri === 0);
    var rowDate = isT1Row ? (t1Date || '移行') : '';
    var rowWt0  = isT1Row ? m0w : '';
    var rowWt1  = isT1Row ? m1w : '';
    rowsHtml += '<tr>'
      + '<td style="' + tdU + '">' + (rowDate || '&nbsp;') + '</td>'
      + _wgtCell(rowWt0)
      + _wgtCell(rowWt1)
      + '<td style="' + tdU + '">□全<br>□追</td>'
      + '</tr>';
  }

  // ── バッジスタイル（個別ラベルと同一）──
  var bLg = 'display:inline-block;border:1.5px solid #000;border-radius:3px;'
    + 'padding:0 4px;font-size:12px;font-weight:700;color:#000;margin-right:2px;line-height:1.5';
  var countBadge = '<span style="display:inline-block;border:2px solid #000;border-radius:3px;'
    + 'padding:0 3px;font-size:13px;font-weight:700;color:#000;line-height:1.4">'
    + hc + '頭</span>';

  var lineBadgeHtml   = lineCode  ? '<span style="' + bLg + '">' + lineCode  + '</span>' : '';
  var unitSuffixHtml  = unitSuffix ? '<span style="' + bLg + '">' + unitSuffix + '</span>' : '';
  var prefixLine = '';  // prefix は lineBadge と同一行で表示するため不要（下で inline処理）

  var saleBadge = forSale
    ? '<span style="border:1.5px solid #000;padding:0 3px;font-size:7px;font-weight:700;color:#000;margin-left:3px">販売</span>'
    : '';

  // 孵化日
  var hatchHtml = ld.hatch_date
    ? '<div style="font-size:6.5px;font-weight:700;color:#000">孵: ' + ld.hatch_date + '</div>'
    : '';

  // 由来ロット
  var originHtml = originLS
    ? '<div style="font-size:6px;font-weight:700;color:#000;line-height:1.5">' + originLS + '</div>'
    : '';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 70mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:70mm; font-family:sans-serif; font-size:7px; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:70mm;display:flex;flex-direction:column">\n'

    // ── ヘッダー（斜線パターン、個別ラベルと差別化）
    + '  <div style="position:relative;background:#000;color:#fff;font-size:9px;font-weight:700;padding:0.8mm 2mm;height:5mm;display:flex;align-items:center;flex-shrink:0;overflow:hidden">'
    + '<span style="position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(45deg,transparent 0,transparent 4px,rgba(255,255,255,0.28) 4px,rgba(255,255,255,0.28) 6px);pointer-events:none"></span>'
    + '<span style="position:relative;z-index:1">ユニット | HerculesOS' + saleBadge + '</span>'
    + '</div>\n'

    // ── QR + 上部情報
    + '  <div style="display:flex;padding:1mm 1.5mm 0;gap:0;flex-shrink:0">\n'
    + '    <div style="flex-shrink:0;margin-right:1.5mm">' + _qrBox(qr, 44) + '</div>\n'
    + '    <div style="flex:1;min-width:0;padding-left:1.5mm;border-left:2px solid #000">\n'

    // prefix行（控えめ）

    // [B1] [U001] バッジ行 + 右上に頭数バッジ
    + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">\n'
    + '        <div>'
    + (prefix ? '<span style="font-size:8px;font-weight:700;color:#000;margin-right:1px">' + prefix + '-</span>' : '')
    + lineBadgeHtml + unitSuffixHtml + '</div>\n'
    + '        <div>' + countBadge + '</div>\n'
    + '      </div>\n'

    // 孵化日・由来ロット
    + '      ' + hatchHtml + '\n'
    + '      ' + originHtml + '\n'

    // 区分（1行）
    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.6">'
    + '区分:' + chk('大', sizeCats.indexOf('大')>=0) + chk('中', sizeCats.indexOf('中')>=0) + chk('小', sizeCats.indexOf('小')>=0)
    + '</div>\n'

    // マット（2行）
    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.6">'
    + 'M:' + ['T0','T1','T2','T3'].map(function(m){ return chk(m, mat===m); }).join('')
    + '</div>\n'

    // ステージ（3行）
    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.6">'
    + 'St:' + _stageCheckboxRow(ld.stage_code || 'T1')
    + '</div>\n'

    // Mx（T2系のみ）
    + (showMx ? '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.6">Mx:'
      + chk('ON', mxIsOn) + chk('OFF', !mxIsOn) + '</div>\n' : '')

    + '    </div>\n'
    + '  </div>\n'

    // ── 記録表（4カラム: 日付 / ①体重 / ②体重 / 交換 × 4行）
    + '  <div style="border-top:1.5px solid #000;margin:0.8mm 1.5mm 0"></div>\n'
    + '  <div style="flex:1;padding:0 1.5mm 0.5mm;overflow:hidden">\n'
    + '    <table style="width:100%;border-collapse:collapse;table-layout:fixed">\n'
    + '      <thead><tr>'
    + '<th style="' + thS + '">日付</th>'
    + '<th style="' + thS + '">①</th>'
    + '<th style="' + thS + '">②</th>'
    + '<th style="' + thS + '">交換</th>'
    + '</tr></thead>\n'
    + '      <tbody>' + rowsHtml + '</tbody>\n'
    + '    </table>\n'
    + '  </div>\n'
    + '</div>\n</body></html>';
}



Pages._lblDownloadPNG = function () {
  const label = window._currentLabel || {};
  const url   = label.pngDataUrl;
  if (!url) { UI.toast('先にラベルを生成してください', 'error'); return; }
  const a  = document.createElement('a');
  a.href     = url;
  a.download = label.fileName || 'label.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  UI.toast('PNGを保存しました', 'success');
};

// Web Share（Androidで共有ダイアログを出してBrotherアプリへ渡す）
Pages._lblSharePNG = async function () {
  const label = window._currentLabel || {};
  const url   = label.pngDataUrl;
  if (!url || !navigator.share) { Pages._lblDownloadPNG(); return; }
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], label.fileName || 'label.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'HerculesOS ラベル' });
    } else {
      await navigator.share({ url, title: 'HerculesOS ラベル' });
    }
  } catch(e) {
    if (e.name !== 'AbortError') UI.toast('共有失敗: ' + e.message, 'error');
  }
};

// ブラウザ印刷（HTML → 印刷ダイアログ。PNGが使えない環境用）
Pages._lblPrintHTML = function () {
  const label = window._currentLabel || {};
  if (!label.html) { UI.toast('先にラベルを生成してください', 'error'); return; }
  const win = window.open('', '_blank');
  if (!win) { UI.toast('ポップアップをブロックされています', 'error'); return; }
  win.document.write(label.html);
  win.document.close();
  win.onload = () => { win.print(); };
};

// 後方互換エイリアス
Pages._lblPrint    = Pages._lblPrintHTML;
Pages._lblDownload = Pages._lblDownloadPNG;
Pages._lblOpenDrive = function () { UI.toast('Drive保存は非対応です', 'info'); };

// グローバル初期値
window._currentLabel  = window._currentLabel  || { displayId:'', fileName:'', html:'', pngDataUrl:'', dims:null };
window._lastLabelType = window._lastLabelType  || {};

// ページ登録
window.PAGES['label-gen'] = () => Pages.labelGen(Store.getParams());


// ────────────────────────────────────────────────────────────────
// FILE: js/pages/manage.js
// ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// manage.js
// 役割: 管理メニュー（5タブの「管理」画面）。
//       ライン・ロット・種親・血統・産卵セット各管理への入口と
//       それぞれのサマリー数値を1画面で俯瞰できる。
//       ライン登録フォームもここに内包する。
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 管理メニュー ─────────────────────────────────────────────────
Pages.manage = function () {
  const main  = document.getElementById('main');
  const lines = Store.getDB('lines')     || [];
  const lots  = Store.getDB('lots')      || [];
  const pars  = Store.getDB('parents')   || [];
  const blds  = Store.getDB('bloodlines')|| [];
  const pairs = Store.getDB('pairings')  || [];

  const actLots  = lots.filter(l => l.status === 'active');
  const actPars  = pars.filter(p => !p.status || p.status === 'active');
  const actPairs = pairs.filter(p => p.status === 'active');

  const sections = [
    {
      icon: '🔗', label: 'ライン管理', count: lines.length, unit: 'ライン',
      page: 'line-list', newPage: 'line-new',
      sub: `${lines.filter(l=>l.status!=='closed').length}ライン進行中`,
      color: 'var(--gold)',
    },
    {
      icon: '🥚', label: 'ロット管理', count: actLots.length, unit: 'ロット',
      page: 'lot-list', newPage: 'lot-new',
      sub: `総頭数 ${actLots.reduce((s,l)=>s+(+l.count||0),0)}頭`,
      color: 'var(--green)',
    },
    {
      icon: '♂♀', label: '種親管理', count: actPars.length, unit: '頭',
      page: 'parent-list', newPage: 'parent-new',
      sub: `♂${actPars.filter(p=>p.sex==='♂').length} / ♀${actPars.filter(p=>p.sex==='♀').length}`,
      color: 'var(--blue)',
    },
    {
      icon: '👑', label: '種親候補', count: ((Store.getDB('individuals')||[]).filter(i=>String(i.parent_flag||'').toLowerCase()==='true'||i.parent_flag===true).length), unit: '頭',
      page: 'parent-candidate', newPage: null,
      sub: '昇格候補個体',
      color: 'var(--gold)',
    },
    {
      icon: '🧬', label: '血統管理', count: blds.filter(b=>b.bloodline_id!=='BLD-UNKNOWN').length, unit: '血統',
      page: 'bloodline-list', newPage: 'bloodline-new',
      sub: `確定 ${blds.filter(b=>b.bloodline_status==='confirmed').length}件${blds.some(b=>b.bloodline_id==='BLD-UNKNOWN') ? ' / うち不明1件' : ''}`,
      color: 'var(--amber)',
    },
    {
      icon: '🌿', label: '産卵セット', count: actPairs.length, unit: 'セット',
      page: 'pairing-list', newPage: 'pairing-new',
      sub: `完了 ${pairs.filter(p=>p.status==='completed').length}件`,
      color: '#a0c878',
    },
    {
      icon: '💰', label: '販売管理', count: (() => {
        const inds = Store.getDB('individuals') || [];
        return inds.filter(i => i.status === 'sold').length;
      })(), unit: '頭販売済み',
      page: 'sale-list', newPage: null,
      sub: (() => {
        const inds = Store.getDB('individuals') || [];
        const selling = inds.filter(i => i.status === 'for_sale' || i.status === 'listed').length;
        return selling ? `販売候補・出品中 ${selling}頭` : '販売候補なし';
      })(),
      color: 'var(--green)',
    },
  ];

  main.innerHTML = `
    ${UI.header('管理', {})}
    <div class="page-body">

      <!-- 管理カード一覧 -->
      ${sections.map(s => `
        <div class="card" style="cursor:pointer" onclick="routeTo('${s.page}')">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:1.8rem;min-width:44px;text-align:center">${s.icon}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:.95rem">${s.label}</div>
              <div style="font-size:.75rem;color:var(--text3);margin-top:2px">${s.sub}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:1.5rem;font-weight:700;color:${s.color}">${s.count}</div>
              <div style="font-size:.65rem;color:var(--text3)">${s.unit}</div>
            </div>
            <div style="color:var(--text3);font-size:1.2rem;margin-left:4px">›</div>
          </div>
        </div>`).join('')}

      <!-- クイック登録 -->
      <div class="card">
        <div class="card-title">クイック登録</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-ghost" onclick="routeTo('line-new')">＋ ライン登録</button>
          <button class="btn btn-ghost" onclick="routeTo('lot-new')">＋ ロット登録</button>
          <button class="btn btn-ghost" onclick="routeTo('parent-new')">＋ 種親登録</button>
          <button class="btn btn-ghost" onclick="routeTo('bloodline-new')">＋ 血統登録</button>
          <button class="btn btn-ghost" onclick="routeTo('pairing-new')">＋ 産卵セット</button>
          <button class="btn btn-ghost" onclick="routeTo('ind-new')">＋ 個体登録</button>
          <button class="btn btn-ghost" onclick="Pages._quickAddPairing()"
            style="grid-column:span 2;border-color:rgba(80,200,120,.35);color:var(--green)">
            💕 ペアリング履歴を追加
          </button>
          <button class="btn btn-ghost" onclick="routeTo('label-gen')"
            style="grid-column:span 2;border-color:rgba(200,168,75,.4);color:var(--gold)">
            🏷️ ラベル発行・QRコード生成
          </button>
          <button class="btn btn-ghost" onclick="routeTo('egg-lot-bulk')"
            style="grid-column:span 2;border-color:rgba(155,89,182,.4);color:#c39bd3;font-weight:700">
            🥚 卵ロット一括作成
          </button>
        </div>
      </div>

    </div>`;

  // Phase2: 分析セクションをDOMに後追加
  const pb = main.querySelector('.page-body');
  if (pb) {
    pb.insertAdjacentHTML('beforeend', `
      <div class="card" style="margin-top:8px">
        <div class="card-title">📊 分析・ランキング</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-ghost" onclick="routeTo('parent-dashboard')">🌡️ 種親ダッシュボード</button>
          <button class="btn btn-ghost" onclick="routeTo('line-analysis')">📈 ライン分析</button>
          <button class="btn btn-ghost" onclick="routeTo('mother-ranking')">♀ 母系ランキング</button>
          <button class="btn btn-ghost" onclick="routeTo('heatmap')">🗺️ 血統ヒートマップ</button>
        </div>
      </div>`);
  }
};

// ════════════════════════════════════════════════════════════════
// ライン一覧・詳細・登録（manage.js に内包）
// ════════════════════════════════════════════════════════════════

Pages.lineList = function () {
  const main  = document.getElementById('main');
  const lines = Store.getDB('lines') || [];
  const open  = lines.filter(l => l.status !== 'closed');
  const closed= lines.filter(l => l.status === 'closed');

  main.innerHTML = `
    ${UI.header('ライン一覧', { action: { fn: "routeTo('line-new')", icon: '＋' } })}
    <div class="page-body">
      <div class="sec-hdr">
        <span class="sec-title">${open.length}ライン（進行中）</span>
        ${closed.length ? `<span class="sec-more" onclick="Pages._lineShowClosed()">終了済 ${closed.length}</span>` : ''}
      </div>
      <div id="line-list-body">
        ${open.length
          ? open.map(_lineCardHTML).join('')
          : UI.empty('ラインがありません', '右上の＋から登録できます')}
      </div>
    </div>`;
};

function _lineCardHTML(line) {
  try {
    var f = Store.getParent(line.father_par_id);
    var m = Store.getParent(line.mother_par_id);
    var lineCode = line.line_code || line.display_id || '?';
    var year     = line.hatch_year || '—';

    // 父母表示（サイズ先頭・強調）
    var fName = f ? (f.parent_display_id || f.display_name || '') : '';
    var mName = m ? (m.parent_display_id || m.display_name || '') : '';
    var fSize = f && f.size_mm ? f.size_mm + 'mm' : '';
    var mSize = m && m.size_mm ? m.size_mm + 'mm' : '';

    // 血統情報
    var _tags = function(t) { try { return (JSON.parse(t||'[]')||[]).slice(0,3).join(' '); } catch(e){ return ''; } };
    var fRaw  = f ? (f.bloodline_raw || '') : '';
    var mRaw  = m ? (m.bloodline_raw || '') : '';
    var fTag  = f ? _tags(f.bloodline_tags) : '';
    var mTag  = m ? _tags(m.maternal_tags || '') : '';
    var fBlood = (fRaw || fTag || '').slice(0, 28);
    var mBlood = (mRaw || mTag || '').slice(0, 28);

    // 親情報行: サイズ優先
    var fPart = fName
      ? '<span style="color:var(--male,#5ba8e8)">♂</span>'
        + (fSize ? '<strong style="font-size:.88rem;margin-right:2px"> ' + fSize + '</strong>' : '')
        + '<span style="color:var(--text3);font-size:.72rem">' + fName + '</span>'
      : '';
    var mPart = mName
      ? '<span style="color:var(--female,#e87fa0)">♀</span>'
        + (mSize ? '<strong style="font-size:.88rem;margin-right:2px"> ' + mSize + '</strong>' : '')
        + '<span style="color:var(--text3);font-size:.72rem">' + mName + '</span>'
      : '';

    var parentRow = (fPart || mPart)
      ? '<div style="display:flex;gap:10px;flex-wrap:wrap;font-size:.8rem;margin-bottom:2px">'
        + (fPart ? '<span>' + fPart + '</span>' : '')
        + (mPart ? '<span>' + mPart + '</span>' : '')
        + '</div>'
      : '<div style="font-size:.8rem;color:var(--text3)">親情報なし</div>';

    var bloodRow = (fBlood || mBlood)
      ? '<div style="font-size:.72rem;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">'
        + [fBlood, mBlood].filter(Boolean).join(' × ') + '</div>'
      : '';

    var locRow = (line.locality || line.generation)
      ? '<div style="font-size:.7rem;color:var(--text3);margin-top:2px">'
        + [line.locality, line.generation].filter(Boolean).join(' / ') + '</div>'
      : '';

    return '<div class="card" style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;margin-bottom:8px"'
      + ' onclick="routeTo(\'line-detail\',{lineId:\'' + line.line_id + '\'})">'
      + '<div style="min-width:48px;text-align:center;flex-shrink:0">'
      +   '<div style="font-family:var(--font-mono);font-size:1.35rem;font-weight:800;color:var(--gold);line-height:1">' + lineCode + '</div>'
      +   '<div style="font-size:.65rem;color:var(--text3);margin-top:3px">' + year + '</div>'
      + '</div>'
      + '<div style="flex:1;min-width:0">'
      +   parentRow + bloodRow + locRow
      + '</div>'
      + '<div style="color:var(--text3);font-size:1.1rem">›</div>'
      + '</div>';
  } catch(e) {
    var code = line.line_code || line.display_id || '?';
    return '<div class="card" style="padding:12px 14px;cursor:pointer;margin-bottom:8px"'
      + ' onclick="routeTo(\'line-detail\',{lineId:\'' + (line.line_id||'') + '\'})">'
      + '<div style="font-size:1.1rem;font-weight:700;color:var(--gold)">' + code + '</div>'
      + '</div>';
  }
}

Pages._lineShowClosed = function () {
  const closed = (Store.getDB('lines') || []).filter(l => l.status === 'closed');
  document.getElementById('line-list-body')?.insertAdjacentHTML(
    'beforeend', `<div style="opacity:.5">${closed.map(_lineCardHTML).join('')}</div>`
  );
};

// ── ライン詳細 ───────────────────────────────────────────────────
Pages.lineDetail = async function (lineId) {
  if (lineId && typeof lineId === 'object') lineId = lineId.id || lineId.lineId || '';
  var main = document.getElementById('main');

  console.log('[LINE_DETAIL] ===== lineDetail start =====');
  console.log('[LINE_DETAIL] lineId       :', lineId);
  console.log('[LINE_DETAIL] __API_BUILD  :', window.__API_BUILD  || '(not set)');
  console.log('[LINE_DETAIL] __INDEX_BUILD:', window.__INDEX_BUILD || '(not set)');
  console.log('[LINE_DETAIL] GAS_URL      :', (window.CONFIG && window.CONFIG.GAS_URL || '').slice(0, 60) || '(unset)');

  // ① キャッシュで即時描画
  var line = Store.getLine(lineId);
  var hasCached = !!line;
  if (hasCached) {
    console.log('[LINE_DETAIL] cached line exists:', line.display_id);
    _renderLineDetail(line, main);
  } else {
    console.log('[LINE_DETAIL] no cache - showing spinner');
    main.innerHTML = UI.header('ライン詳細', { back: true }) + UI.spinner();
  }

  // ② バックグラウンドで最新データ取得
  try {
    console.log('[LINE_DETAIL] fetch detail start - action: getLine');
    var res = await API.line.get(lineId);
    if (Store.getPage() !== 'line-detail') return;
    line = res.line;
    if (Store.patchDBItem) Store.patchDBItem('lines', 'line_id', lineId, line);
    console.log('[LINE_DETAIL] fetch detail success:', line && line.display_id);
    _renderLineDetail(line, main);
  } catch (e) {
    console.error('[LINE_DETAIL] fetch detail failed:', e.message);
    if (Store.getPage() !== 'line-detail') return;

    if (hasCached) {
      // キャッシュ表示を維持 → warning バナーだけ差し込む
      var pb = main.querySelector('.page-body');
      if (pb && !document.getElementById('line-warn-banner')) {
        var b = document.createElement('div');
        b.id = 'line-warn-banner';
        b.style.cssText = 'background:rgba(224,144,64,.1);border:1px solid rgba(224,144,64,.4);'
          + 'border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:.78rem';
        b.innerHTML = '<b style="color:var(--amber)">⚠️ 最新情報の取得に失敗しました</b>'
          + '<div style="color:var(--text2);margin-top:3px">表示中はキャッシュです。再読み込みをお試しください。</div>'
          + '<div style="font-size:.68rem;color:var(--text3);margin-top:2px">' + e.message.slice(0, 80) + '</div>'
          + '<button class="btn btn-ghost btn-sm" style="margin-top:6px" id="line-retry-btn">🔄 再試行</button>';
        pb.insertBefore(b, pb.firstChild);
        var retryBtn = document.getElementById('line-retry-btn');
        if (retryBtn) retryBtn.addEventListener('click', function() { Pages.lineDetail(lineId); });
      }
    } else {
      // キャッシュなし → エラー画面
      main.innerHTML = UI.header('ライン詳細', { back: true })
        + '<div class="page-body">'
        + '<div style="background:rgba(224,80,80,.08);border:1px solid rgba(224,80,80,.3);'
        + 'border-radius:10px;padding:14px;font-size:.82rem" id="line-err-box">'
        + '<div style="font-weight:700;color:var(--red,#e05050);margin-bottom:6px">⚠️ ライン情報の取得に失敗しました</div>'
        + '<div>' + e.message + '</div>'
        + '<div style="font-size:.72rem;color:var(--text3);margin-top:6px">設定画面のGAS URLとデプロイ状態を確認してください。</div>'
        + '<button class="btn btn-ghost btn-sm" style="margin-top:10px" id="line-err-retry">🔄 再試行</button>'
        + '</div></div>';
      var errRetry = document.getElementById('line-err-retry');
      if (errRetry) errRetry.addEventListener('click', function() { Pages.lineDetail(lineId); });
    }
  }
}

// ── 親情報ヘルパー（_renderLineDetail から使用）────────────────
function _parentInfo(p, pBld, sexColor) {
  if (!p) return '<span style="color:var(--text3)">—（未設定）</span>';
  const bldStr  = pBld ? (pBld.abbreviation || pBld.bloodline_name || '') : '';
  const sizeStr = p.size_mm ? ' <strong>' + p.size_mm + 'mm</strong>' : '';
  return '<span style="cursor:pointer;color:' + sexColor + '" onclick="routeTo(\x27parent-detail\x27,{parId:\x27' + p.par_id + '\x27})">' 
    + (p.parent_display_id || p.display_name) + sizeStr
    + (bldStr ? '<span style="color:var(--text3);font-size:.78rem"> / ' + bldStr + '</span>' : '')
    + '</span>';
}

function _renderLineDetail(line, main) {
  try {
  const f    = Store.getParent(line.father_par_id);
  const m    = Store.getParent(line.mother_par_id);
  const bld  = Store.getBloodline(line.bloodline_id);
  const blds = Store.getDB('bloodlines') || [];
  const fBld = f && f.bloodline_id ? blds.find(b=>b.bloodline_id===f.bloodline_id) : null;
  const mBld = m && m.bloodline_id ? blds.find(b=>b.bloodline_id===m.bloodline_id) : null;

  // このラインに属する個体・ロット（全状態）
  // status='all' で dissolved/individualized も含めて取得
  // 【フォールバック】lot.line_id が空 / 不整合でも pairing_set_id 経由で拾う
  const _lotsById  = Store.filterLots({ line_id: line.line_id, status: 'all' });
  const _pairingSetIds = new Set((Store.getDB('pairings') || []).map(p => p.set_id).filter(Boolean));
  const _lotsByPairing = (Store.getDB('lots') || []).filter(l =>
    l.pairing_set_id && _pairingSetIds.has(l.pairing_set_id) &&
    !_lotsById.some(x => x.lot_id === l.lot_id)
  );
  const allLots    = [..._lotsById, ..._lotsByPairing];
  const activeLots = allLots.filter(l => l.status === 'active');
  const allInds    = Store.getIndividualsByLine(line.line_id);
  const aliveInds  = allInds.filter(i => i.status !== 'dead');

  // 産卵セット紐づき: line_id で照合（正常ケース）
  // line_id 未設定データの後方互換フォールバック:
  //   createPairing は現在常に line_id を自動生成するため、新規データには発生しない
  //   旧データ（自動生成前に登録されたもの）のみフォールバック照合
  const allPairings = Store.getDB('pairings') || [];
  const pairings = allPairings.filter(p => {
    if (p.line_id === line.line_id) return true;
    // 後方互換: line_id 未設定かつ父母IDが一致する場合
    if (!p.line_id && line.father_par_id && line.mother_par_id) {
      return (p.father_par_id === line.father_par_id && p.mother_par_id === line.mother_par_id);
    }
    return false;
  });

  // ════════════════════════════════════════════════════
  // ライン集計 — 卵の流れに沿った定義
  // ════════════════════════════════════════════════════

  // ① 採卵数 = SUM(egg_records.egg_count)  / フォールバック: pairings.total_eggs
  const eggRecords  = Store.getDB('egg_records') || [];
  const lineEggRecs = eggRecords.filter(r => pairings.some(p => p.set_id === r.set_id));
  const totalEggs   = lineEggRecs.length > 0
    ? lineEggRecs.reduce((s, r) => s + (parseInt(r.egg_count, 10) || 0), 0)
    : pairings.reduce((s, p) => s + (parseInt(p.total_eggs, 10) || 0), 0);

  // ② 腐卵数 = SUM(egg_records.failed_count)
  const rottenEggs  = lineEggRecs.reduce((s, r) => s + (parseInt(r.failed_count, 10) || 0), 0);

  // ③ ロット化累計 = ルートロット（parent_lot_id が空）の initial_count 合計
  //    分割で作られた子ロットは initial_count を持つが重複カウントを避けるため除外
  const rootLots     = allLots.filter(l => !l.parent_lot_id || l.parent_lot_id === '');
  const lotInitTotal = rootLots.reduce((s, l) => s + (parseInt(l.initial_count, 10) || 0), 0);

  // ④ 直接個体化数 = lot_id が空 OR このラインのロットに属さない個体
  //    lot_id に値があっても、対応ロットが別ラインなら直接個体化として計上
  const allLotIds   = new Set(allLots.map(l => l.lot_id));
  const directInds  = allInds.filter(i =>
    !i.lot_id || i.lot_id === '' || !allLotIds.has(i.lot_id)
  );

  // ⑤ 未配分卵 = MAX(採卵数 - 腐卵数 - 配分済み, 0)
  //    配分済み = ロット化累計 + 直接個体化数（ロット内減耗は配分後のため含まない）
  const unLotEggs   = Math.max(0, totalEggs - rottenEggs - lotInitTotal - directInds.length);

  // ⑥ 現在ロット内頭数 = SUM(active lots.count)
  const lotCurrentTotal = activeLots.reduce((s, l) => s + (parseInt(l.count, 10) || 0), 0);

  // ⑦ ロット内減耗 = SUM(lots.attrition_total)（dissolved含む全ロット）
  const attritionTotal  = allLots.reduce((s, l) => s + (parseInt(l.attrition_total, 10) || 0), 0);

  
    main.innerHTML = `
    ${UI.header(line.display_id + ' 詳細', { back: true, action: { fn: "routeTo('line-new',{editId:'" + line.line_id + "'})", icon: '✏️' } })}
    <div class="page-body">

      <!-- サマリーカード -->
      <div class="card card-gold" style="padding:14px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between">
          <div>
            <div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--gold)">${line.display_id}</div>
            <div style="font-size:.82rem;color:var(--text2);margin-top:2px">
              ${line.line_name || ''}
              ${line.locality ? '&nbsp;·&nbsp;' + line.locality : ''}
              ${line.generation ? '&nbsp;·&nbsp;' + line.generation : ''}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:.65rem;color:var(--text3)">孵化年</div>
            <div style="font-weight:700">${line.hatch_year || '—'}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:12px">
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">採卵数</div>
            <div style="font-weight:700;font-size:1rem;color:var(--amber)">${totalEggs}</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">未配分卵</div>
            <div style="font-weight:700;font-size:1rem;color:var(--text2)">${unLotEggs}</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">ロット</div>
            <div style="font-weight:700;font-size:1rem;color:var(--blue)">${activeLots.length}</div>
            <div style="font-size:.62rem;color:var(--text3);margin-top:1px">${lotCurrentTotal}頭</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">個体</div>
            <div style="font-weight:700;font-size:1rem;color:var(--green)">${aliveInds.length}</div>
          </div>
        </div>
      </div>

      <!-- 主要アクションボタン -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button style="flex:1;padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.9rem;
          background:var(--blue);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px"
          onclick="routeTo('lot-list',{line_id:'${line.line_id}'})">
          📦 ロット一覧<br><span style="font-size:1.1rem">${activeLots.length}</span>
        </button>
        <button style="flex:1;padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.9rem;
          background:var(--green);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px"
          onclick="routeTo('ind-list',{line_id:'${line.line_id}'})">
          🐛 個体一覧<br><span style="font-size:1.1rem">${aliveInds.length}</span>
        </button>
        <button style="grid-column:1/2;padding:12px 8px;border-radius:var(--radius);font-weight:700;font-size:.9rem;
          background:rgba(155,89,182,.85);color:#fff;border:none;cursor:pointer"
          onclick="routeTo('egg-lot-bulk',{lineId:'${line.line_id}'})">
          🥚 卵ロット一括作成
        </button>
        <button style="grid-column:2/3;padding:12px 8px;border-radius:var(--radius);font-weight:700;font-size:.88rem;
          background:var(--surface3,#3a3a4a);color:var(--text1);border:1px solid var(--border);cursor:pointer"
          onclick="routeTo('ind-new',{lineId:'${line.line_id}'})">
          ＋ 個体追加
        </button>
      </div>

      <!-- 産卵セット紐づき -->
      ${pairings.length ? `
      <div class="card">
        <div class="card-title">🥚 産卵セット (${pairings.length}件)</div>
        ${pairings.map(p => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="font-family:var(--font-mono);font-size:.82rem;color:var(--blue);cursor:pointer"
              onclick="routeTo('pairing-detail',{pairingId:'${p.set_id}'})">
              ${p.display_id}
            </span>
            <span style="font-size:.78rem;color:var(--text3)">${p.pairing_start || '—'}</span>
            <span style="font-size:.78rem">${p.total_eggs ? p.total_eggs + '卵' : ''}</span>
          </div>`).join('')}
      </div>` : ''}

      <!-- 親情報 -->
      <div class="card">
        <div class="card-title">親情報</div>
        <div class="info-list">
          ${_lnRow('<span style="color:var(--male)">♂親</span>', _parentInfo(f, fBld, 'var(--male)'))}
          ${_lnRow('<span style="color:var(--female)">♀親</span>', _parentInfo(m, mBld, 'var(--female)'))}
        </div>
      </div>

      <!-- 血統・ライン情報 -->
      <div class="card">
        <div class="card-title">血統・ライン情報</div>
        <div class="info-list">
          ${line.locality   ? _lnRow('産地', line.locality)   : ''}
          ${line.generation ? _lnRow('累代', line.generation) : ''}
          ${(()=>{
            // 父母の血統タグを自動表示
            const _parseTags2 = t => { try { const a = JSON.parse(t||'[]'); return Array.isArray(a) ? a.join(' / ') : String(a); } catch(e) { return ''; } };
            const fTags = f ? _parseTags2(f.bloodline_tags) : '';
            const mTags = m ? _parseTags2(m.bloodline_tags) : '';
            const fRaw  = f ? (f.bloodline_raw || '') : '';
            const mRaw  = m ? (m.bloodline_raw || '') : '';
            let rows = '';
            if (fRaw)  rows += _lnRow('父系血統', '<span style="font-size:.8rem;color:var(--text2)">' + fRaw.slice(0,40) + (fRaw.length>40?'…':'') + '</span>');
            if (fTags) rows += _lnRow('父系タグ', fTags);
            if (mRaw)  rows += _lnRow('母系血統', '<span style="font-size:.8rem;color:var(--text2)">' + mRaw.slice(0,40) + (mRaw.length>40?'…':'') + '</span>');
            if (mTags) rows += _lnRow('母系タグ', mTags);
            if (!fRaw && !mRaw && !fTags && !mTags && bld) {
              rows += _lnRow('血統', '<span style="cursor:pointer;color:var(--blue)" onclick="routeTo(\'bloodline-detail\',{bloodlineId:\'' + bld.bloodline_id + '\'})">' + bld.bloodline_name + '</span>');
            }
            return rows;
          })()}
          ${line.characteristics ? _lnRow('特徴', line.characteristics) : ''}
          ${line.hypothesis_tags ? _lnRow('仮説タグ', line.hypothesis_tags) : ''}
          ${line.note_private    ? _lnRow('内部メモ', line.note_private)   : ''}
        </div>
      </div>

      <!-- 詳細集計（常時表示） -->
      <div class="card" style="padding:10px 14px">
        <div style="font-size:.72rem;font-weight:700;color:var(--text3);letter-spacing:.06em;margin-bottom:8px">詳細集計</div>
        <div style="font-size:.78rem">
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text3)">採卵数</span>
            <span style="font-weight:600">${totalEggs}個</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text3)">腐卵数</span>
            <span style="color:${rottenEggs>0?'var(--red)':'var(--text3)'};font-weight:600">${rottenEggs > 0 ? rottenEggs+'個' : '—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text3)">ロット化累計</span>
            <span style="font-weight:600">${lotInitTotal}個</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text3)">直接個体化</span>
            <span style="color:${directInds.length>0?'var(--blue)':'var(--text3)'};font-weight:600">${directInds.length > 0 ? directInds.length+'頭' : '—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text3)">現在ロット内頭数</span>
            <span style="font-weight:600">${lotCurrentTotal}頭</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0">
            <span style="color:var(--text3)">ロット内減耗</span>
            <span style="color:${attritionTotal>0?'var(--amber)':'var(--text3)'};font-weight:600">${attritionTotal > 0 ? attritionTotal+'頭' : '—'}</span>
          </div>
        </div>
      </div>

    </div>`;
  } catch(e) {
    main.innerHTML = UI.header((line && line.display_id) || 'ライン詳細', {back:true})
      + '<div class="page-body">' + UI.empty('表示エラー: ' + e.message) + '</div>';
  }
}

function _lnRow(key, val) {
  return `<div class="info-row">
    <span class="info-key">${key}</span>
    <span class="info-val">${val}</span>
  </div>`;
}

// ── ライン登録・編集 ─────────────────────────────────────────────
Pages.lineNew = function (params = {}) {
  const main   = document.getElementById('main');
  const isEdit = !!params.editId;
  const line   = isEdit ? Store.getLine(params.editId) : null;
  const pars   = Store.getDB('parents')    || [];
  const blds   = Store.getDB('bloodlines') || [];
  const males  = pars.filter(p => p.sex === '♂' && (!p.status || p.status === 'active'));
  const females= pars.filter(p => p.sex === '♀' && (!p.status || p.status === 'active'));
  const v = (f, d = '') => line ? (line[f] !== undefined ? line[f] : d) : (params[f] || d);
  const curYear = new Date().getFullYear();

  main.innerHTML = `
    ${UI.header(isEdit ? 'ライン編集' : 'ライン登録', { back: true })}
    <div class="page-body">
      <form id="line-form" class="form-section">

        <div class="form-title">ライン識別</div>
        <div class="form-row-2">
          ${UI.field('孵化年', UI.input('hatch_year', 'number', v('hatch_year', curYear), '例: 2025'), true)}
          ${UI.field('ラインコード', UI.input('line_code', 'text', v('line_code'), '例: A1 / B2'), true)}
        </div>
        ${UI.field('ライン名（任意）', UI.input('line_name', 'text', v('line_name'), '例: GGB超大型ライン'))}

        <div class="form-title">産地・累代</div>
        <div class="form-row-2">
          ${UI.field('産地', UI.input('locality', 'text', v('locality', 'Guadeloupe')))}
          ${UI.field('累代', UI.input('generation', 'text', v('generation'), '例: WF1 / CBF2'))}
        </div>

        <!-- 種親は産卵セットから自動取得のため選択不要 -->

        <div class="form-title">メモ</div>
        ${UI.field('特徴', UI.textarea('characteristics', v('characteristics'), 2, '例: 父175mm × 母大型系'))}
        ${UI.field('仮説タグ', UI.input('hypothesis_tags', 'text', v('hypothesis_tags'), '例: 高タンパク,pH6.2'))}
        ${UI.field('内部メモ', UI.textarea('note_private', v('note_private'), 2, ''))}

        ${isEdit ? UI.field('ステータス',
          UI.select('status', [
            { code:'active', label:'進行中' },
            { code:'closed', label:'終了' },
          ], v('status', 'active'))) : ''}

        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="button" class="btn btn-ghost" style="flex:1"
            onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2"
            data-edit-id="${isEdit ? params.editId : ''}"
            onclick="Pages._lineSave(this.dataset.editId || '')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>`;
};

Pages._lineSave = async function (editId) {
  // 'undefined' 文字列や空文字は編集なしと判断
  if (!editId || editId === 'undefined') editId = '';
  const form = document.getElementById('line-form');
  if (!form) return;
  const data = UI.collectForm(form);
  if (!data.hatch_year) { UI.toast('孵化年を入力してください', 'error'); return; }
  if (!data.line_code)  { UI.toast('ラインコードを入力してください', 'error'); return; }
  try {
    if (editId) {
      data.line_id = editId;
      await apiCall(() => API.line.update(data), '更新しました');
      await syncAll(true);
      routeTo('line-detail', { lineId: editId });
    } else {
      const res = await apiCall(() => API.line.create(data), 'ラインを登録しました');
      await syncAll(true);
      routeTo('line-detail', { lineId: res.line_id });
    }
  } catch (e) {
    UI.toast('エラー: ' + (e.message || '不明'), 'error');
  }
};

// ── ペアリング履歴クイック追加 ────────────────────────────────
Pages._quickAddPairing = function () {
  const parents = Store.getDB('parents') || [];
  const males   = parents.filter(p => p.sex === '♂' && p.status !== 'dead');
  const females = parents.filter(p => p.sex === '♀' && p.status !== 'dead');
  const today   = new Date().toISOString().split('T')[0];

  UI.modal(`
    <div class="modal-title" style="font-size:1rem;font-weight:700;padding-bottom:10px">
      💕 ペアリング履歴を追加
    </div>
    <div class="form-section" style="max-height:60vh;overflow-y:auto">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        ${UI.field('♂（父）', `<select id="qp-male" class="input">
          <option value="">— 選択 —</option>
          ${males.map(p => `<option value="${p.par_id}">${p.parent_display_id||p.display_name}</option>`).join('')}
        </select>`, true)}
        ${UI.field('♀（母）', `<select id="qp-female" class="input">
          <option value="">— 選択 —</option>
          ${females.map(p => `<option value="${p.par_id}">${p.parent_display_id||p.display_name}</option>`).join('')}
        </select>`, true)}
      </div>
      ${UI.field('種別', `<select id="qp-type" class="input" onchange="Pages._qpTypeChange(this.value)">
        <option value="done_initial">初回ペアリング（実施済み）</option>
        <option value="done_repairing">再ペアリング（実施済み）</option>
        <option value="planned">再ペアリング（予定）</option>
      </select>`)}
      <div id="qp-date-row">
        ${UI.field('実施日', `<input type="date" id="qp-date" class="input" value="${today}">`)}
      </div>
      <div id="qp-planned-row" style="display:none">
        ${UI.field('予定日', `<input type="date" id="qp-planned" class="input" value="${today}">`)}
      </div>
      ${UI.field('メモ（任意）', `<input type="text" id="qp-memo" class="input" placeholder="例: 2回目交配">`)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._saveQuickPairing()">保存</button>
    </div>
  `);
};

Pages._qpTypeChange = function (val) {
  const dateRow    = document.getElementById('qp-date-row');
  const plannedRow = document.getElementById('qp-planned-row');
  if (!dateRow || !plannedRow) return;
  if (val === 'planned') {
    dateRow.style.display    = 'none';
    plannedRow.style.display = '';
  } else {
    dateRow.style.display    = '';
    plannedRow.style.display = 'none';
  }
};

Pages._saveQuickPairing = async function () {
  const maleId   = document.getElementById('qp-male')?.value;
  const femaleId = document.getElementById('qp-female')?.value;
  const typeVal  = document.getElementById('qp-type')?.value || 'done_initial';
  const memo     = document.getElementById('qp-memo')?.value || '';

  if (!maleId)   { UI.toast('♂を選択してください', 'error'); return; }
  if (!femaleId) { UI.toast('♀を選択してください', 'error'); return; }

  const isPlanned = typeVal === 'planned';
  const type      = typeVal === 'done_initial' ? 'initial' : 'repairing';
  const status    = isPlanned ? 'planned' : 'done';

  let payload = {
    type, status,
    male_parent_id:   maleId,
    female_parent_id: femaleId,
    memo,
  };

  if (isPlanned) {
    const planned = document.getElementById('qp-planned')?.value;
    if (!planned) { UI.toast('予定日を選択してください', 'error'); return; }
    payload.planned_date = planned.replace(/-/g, '/');
  } else {
    const date = document.getElementById('qp-date')?.value;
    if (!date) { UI.toast('実施日を選択してください', 'error'); return; }
    payload.pairing_date = date.replace(/-/g, '/');
  }

  try {
    UI.loading(true);
    UI.closeModal();
    const res = await API.phase2.createPairingHistory(payload);
    // ローカルキャッシュに即時反映
    Store.addDBItem('pairing_histories', {
      ...payload,
      pairing_id: res.pairing_id || ('tmp_' + Date.now()),
    });
    UI.toast(isPlanned ? '再ペアリング予定を登録しました' : 'ペアリング履歴を追加しました');
  } catch (e) {
    UI.toast('保存失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

window.PAGES = window.PAGES || {};
window.PAGES['manage']      = () => Pages.manage();
window.PAGES['line-list']   = () => Pages.lineList();
window.PAGES['line-detail'] = () => Pages.lineDetail(Store.getParams().lineId || Store.getParams().id);
window.PAGES['line-new']    = () => Pages.lineNew(Store.getParams());


// ────────────────────────────────────────────────────────────────
// FILE: js/pages/settings.js
// ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// settings.js
// 役割: アプリ全体の設定を管理する画面。
//       GAS URL・Gemini APIキー・選別基準・ステージ目安・
//       ブランドコード・ギネス閾値などを設定・保存する。
//       設定はlocalStorageに永続化し、GASの設定シートにも同期する。
// ════════════════════════════════════════════════════════════════
'use strict';

Pages.settings = function () {
  const main = document.getElementById('main');
  _renderSettings(main);

  // 描画後に非同期でバックアップ情報を取得・更新
  // （GASへの問い合わせは画面表示をブロックしない）
  if (Store.getSetting('gas_url')) {
    API.backup.getSettings().then(res => {
      if (!res) return;
      // GASキー → ローカルstoreキー のマッピング
      const keyMap = {
        last_success_at:      'backup_last_success_at',
        last_fail_at:         'backup_last_fail_at',
        last_backup_type:     'backup_last_type',
        last_backup_url:      'backup_last_url',
        backup_folder_url:    'backup_folder_url',
        auto_daily_enabled:   'backup_auto_daily',
        auto_weekly_enabled:  'backup_auto_weekly',
        auto_monthly_enabled: 'backup_auto_monthly',
      };
      Object.entries(keyMap).forEach(([gasKey, localKey]) => {
        if (res[gasKey] !== undefined) Store.setSetting(localKey, String(res[gasKey]));
      });
    }).catch(() => { /* 未接続でも無視 */ });

    // 履歴も非同期でロード（100ms遅延でDOM確実確保）
    setTimeout(() => Pages._bkLoadHistory(), 100);
  } else {
    // GAS未設定時は「未実行」メッセージに差し替え
    setTimeout(() => {
      const el = document.getElementById('bk-history-list');
      if (el) el.innerHTML =
        '<div style="font-size:.75rem;color:var(--text3);text-align:center;padding:8px">' +
        'GAS URLを設定すると履歴が表示されます</div>';
    }, 50);
  }
};

function _renderSettings(main) {
  const gasUrl    = Store.getSetting('gas_url')    || '';
  const geminiKey = Store.getSetting('gemini_key') || '';
  const brand     = Store.getSetting('brand_code') || 'HM';
  const guinW     = Store.getSetting('guinness_weight_g') || '170';
  const targetMm  = Store.getSetting('target_size_mm')    || '200';
  const largeMm   = Store.getSetting('large_male_threshold_mm') || '180';
  const lastSync  = localStorage.getItem(CONFIG.LS_KEYS.LAST_SYNC);
  const fmtSync   = lastSync
    ? new Date(lastSync).toLocaleString('ja-JP', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '未同期';

  // バックアップ関連（localStorageから即時読み込み。GASからの取得は非同期で後から上書き）
  const bkLastSuccessAt = Store.getSetting('backup_last_success_at') || '';
  const bkLastFailAt    = Store.getSetting('backup_last_fail_at')    || '';
  const bkLastType      = Store.getSetting('backup_last_type')       || '';
  const bkLastUrl       = Store.getSetting('backup_last_url')        || '';
  const bkAutoD         = Store.getSetting('backup_auto_daily')   !== 'false';
  const bkAutoW         = Store.getSetting('backup_auto_weekly')  !== 'false';
  const bkAutoM         = Store.getSetting('backup_auto_monthly') !== 'false';
  const bkFolderUrl     = Store.getSetting('backup_folder_url')   || '';

  main.innerHTML = `
    ${UI.header('設定', {})}
    <div class="page-body">

      <!-- GAS接続設定 -->
      <div class="card">
        <div class="card-title">🔗 GAS接続設定</div>
        <div class="form-section">
          ${UI.field('GAS デプロイURL',
            `<div style="display:flex;gap:6px">
               <input id="set-gas-url" class="input" type="url" value="${gasUrl}"
                 placeholder="https://script.google.com/macros/s/..." style="flex:1">
               <button class="btn btn-sm btn-ghost" onclick="Pages._setToggleGasUrl()">👁</button>
             </div>
             <div style="font-size:.7rem;color:var(--text3);margin-top:4px">
               Apps Script → デプロイ → ウェブアプリのURLを貼り付けてください
             </div>`)}
          <button class="btn btn-primary btn-full"
            onclick="Pages._setGasUrl()">GAS URLを保存・接続テスト</button>
          <div id="gas-test-result"></div>
        </div>
      </div>

      <!-- Gemini設定 -->
      <div class="card">
        <div class="card-title">🤖 Gemini AI設定</div>
        <div class="form-section">
          ${UI.field('Gemini APIキー',
            `<div style="display:flex;gap:6px">
               <input id="set-gemini-key" class="input" type="password" value="${geminiKey}"
                 placeholder="AIzaSy..." style="flex:1">
               <button class="btn btn-sm btn-ghost" onclick="Pages._setToggleGemini()">👁</button>
             </div>
             <div style="font-size:.7rem;color:var(--text3);margin-top:4px">
               Google AI Studio (aistudio.google.com) で取得できます。<br>
               設定すると体重計・ラベルの写真をAIが自動読み取りします。
             </div>`)}
          <button class="btn btn-ghost btn-full" onclick="Pages._setGeminiKey()">
            Gemini APIキーを保存
          </button>
        </div>
      </div>

      <!-- ブランド・閾値設定 -->
      <div class="card">
        <div class="card-title">⚙️ ブランド・閾値</div>
        <div class="form-section">
          <div class="form-row-2">
            ${UI.field('ブランドコード',
              `<input id="set-brand" class="input" type="text" value="${brand}"
                placeholder="例: HM" maxlength="4">`)}
            ${UI.field('ギネス挑戦体重(g)',
              `<input id="set-guinw" class="input" type="number" value="${guinW}"
                placeholder="例: 170">`)}
          </div>
          <div class="form-row-2">
            ${UI.field('目標サイズ(mm)',
              `<input id="set-tmm" class="input" type="number" value="${targetMm}"
                placeholder="例: 200">`)}
            ${UI.field('大型♂閾値(mm)',
              `<input id="set-lmm" class="input" type="number" value="${largeMm}"
                placeholder="例: 180">`)}
          </div>
          <button class="btn btn-ghost btn-full" onclick="Pages._setThresholds()">
            閾値を保存
          </button>
        </div>
      </div>

      <!-- ステージ目安日齢 -->
      <div class="card">
        <div class="card-title">📅 ステージ目安日齢（デフォルト値）</div>
        <div style="font-size:.78rem;color:var(--text2);margin-bottom:8px">
          孵化日からのおおよその日齢でステージを自動判定します。<br>
          変更はGASの設定シートから行ってください。
        </div>
        <div style="font-size:.8rem">
          ${DEFAULT_STAGE_AGE_RULES.map(r =>
            `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
              <span style="min-width:80px;color:var(--text3)">
                ${r.minDays}〜${r.maxDays === 9999 ? '∞' : r.maxDays}日
              </span>
              <span style="color:${stageColor(r.code)};font-weight:600">${r.label}</span>
            </div>`
          ).join('')}
        </div>
      </div>

      <!-- データ管理 -->
      <div class="card">
        <div class="card-title">🗄️ データ管理</div>
        <div class="form-section">
          <div style="font-size:.78rem;color:var(--text3)">
            最終同期: ${fmtSync}
          </div>
          <button class="btn btn-primary btn-full" onclick="Pages._setSync()">
            🔄 全データを同期
          </button>
          <button class="btn btn-ghost btn-full" onclick="Pages._setClearCache()">
            🗑️ ローカルキャッシュを削除
          </button>
        </div>
      </div>

      <!-- Phase A: データ安定化 -->
      <div class="card" style="border-color:rgba(91,168,232,.25)">
        <div class="card-title" style="color:var(--blue)">🔍 データ整合性</div>
        <div style="font-size:.78rem;color:var(--text3);margin-bottom:10px;line-height:1.6">
          ロットの <code>line_id</code> / <code>count</code> / <code>attrition_total</code>
          の不整合を検出・修正します。
        </div>
        <div class="form-section" style="gap:8px">
          <button class="btn btn-ghost btn-full" id="integrity-check-btn"
            onclick="Pages._integrityCheck()">
            🔍 整合性チェック
          </button>
          <button class="btn btn-ghost btn-full" id="recalc-all-btn"
            onclick="Pages._recalcAll()">
            ♻️ 全ロット再計算
          </button>
        </div>
        <div id="integrity-result" style="margin-top:8px"></div>
      </div>

      <!-- GAS初期化 -->
      <div class="card" style="border-color:rgba(224,80,80,.2)">
        <div class="card-title" style="color:var(--red)">🚨 GASシステム初期化</div>
        <div style="font-size:.78rem;color:var(--text2);margin-bottom:10px">
          <b>初回セットアップ時のみ実行してください。</b><br>
          スプレッドシートに全15シートを作成します。<br>
          既存シートがある場合はスキップされます。
        </div>
        <button class="btn btn-danger btn-full" onclick="Pages._setInit()">
          🗂️ スプレッドシート初期化（init）
        </button>
      </div>

      <!-- 開発用：全データリセット -->
      <div class="card" style="border:2px solid var(--red,#e05050)">
        <div class="card-title" style="color:var(--red,#e05050)">⚠️ 開発・検証用</div>
        <div style="font-size:.82rem;color:var(--text2);margin-bottom:10px">
          ヘッダー行と設定は残し、全データ行だけを削除します。<br>
          テスト運用中のみ使用してください。
        </div>
        <div style="font-size:.75rem;color:var(--text3);margin-bottom:10px">
          対象：ライン / ロット / 個体 / 種親 / 血統 / 産卵セット / 採卵記録 / 成長記録 / ラベル履歴 他
        </div>
        <button class="btn btn-danger btn-full" onclick="window.Pages._devReset ? window.Pages._devReset() : alert('関数が見つかりません。ページをリロードしてください。')">
          🗑️ 全データリセット（テスト用）
        </button>
      </div>

      <!-- Phase2: 後食・ペアリング設定 -->
      <div class="card">
        <div class="card-title">🍽️ 後食・ペアリング設定</div>
        <div class="form-group">
          <label class="form-label">♂後食待機日数（日）</label>
          <input id="set-male-wait" class="form-input" type="number" min="1" max="90"
                 value="${Store.getSetting('male_pairing_wait_days') || '14'}">
          <label class="form-label" style="margin-top:12px">♀後食待機日数（日）</label>
          <input id="set-female-wait" class="form-input" type="number" min="1" max="90"
                 value="${Store.getSetting('female_pairing_wait_days') || '14'}">
          <label class="form-label" style="margin-top:12px">♂ペアリング間隔最小日数（日）</label>
          <input id="set-pairing-interval" class="form-input" type="number" min="1" max="60"
                 value="${Store.getSetting('male_pairing_interval_min_days') || '7'}">
          <div class="form-hint">この日数未満でペアリングすると警告が表示されます</div>

          <label class="form-label" style="margin-top:16px">🥚 産卵セット交換間隔（日）</label>
          <input id="set-exchange-days" class="form-input" type="number" min="1" max="30"
                 value="${Store.getSetting('pairing_set_exchange_days') || '7'}">
          <div class="form-hint">セット開始からこの日数後に交換リマインドを表示します（初期値: 7日）</div>
          <button class="btn btn-primary btn-full" style="margin-top:12px"
                  onclick="Pages._savePairingSettings()">後食・ペアリング設定を保存</button>
        </div>
      </div>

      <!-- バックアップ管理 -->
      <div class="card" style="border-color:rgba(200,168,75,.25)">
        <div class="card-title" style="color:var(--gold)">🗄️ バックアップ管理</div>

        <!-- 最終バックアップ情報（成功/失敗を分けて表示） -->
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <span style="color:var(--text3);font-size:.7rem;min-width:60px">最終成功</span>
            <span style="flex:1;color:var(--green)">
              ${bkLastSuccessAt
                ? `${bkLastSuccessAt}
                   <span style="color:var(--text3);font-size:.7rem;margin-left:4px">
                     (${BACKUP_DISPLAY.type_labels[bkLastType] || bkLastType || '—'})
                   </span>`
                : '<span style="color:var(--text3)">未実行</span>'}
            </span>
            ${bkLastUrl
              ? `<a href="${bkLastUrl}" target="_blank"
                  class="btn btn-ghost btn-sm" style="white-space:nowrap">📁 開く</a>`
              : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="color:var(--text3);font-size:.7rem;min-width:60px">最終失敗</span>
            <span style="flex:1;${bkLastFailAt ? 'color:var(--red)' : 'color:var(--text3)'}">
              ${bkLastFailAt || 'なし'}
            </span>
          </div>
        </div>

        <!-- 手動バックアップ -->
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <input id="bk-memo" class="input" type="text" maxlength="60"
            placeholder="メモ（任意）例: Phase1完成前"
            style="margin-bottom:8px;font-size:.82rem">
          <button class="btn btn-gold btn-full" id="bk-run-btn"
            onclick="Pages._bkRunManual()">
            ✋ 今すぐバックアップ
          </button>
          <div id="bk-run-result" style="margin-top:6px;font-size:.78rem"></div>
        </div>

        <!-- 自動バックアップ ON/OFF -->
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:.8rem;font-weight:600;color:var(--text2);margin-bottom:8px">
            自動バックアップ設定
          </div>
          ${[
            { key:'backup_auto_daily',   label:'📅 毎日 AM3:00',      enabled: bkAutoD },
            { key:'backup_auto_weekly',  label:'📆 毎週日曜 AM3:00',  enabled: bkAutoW },
            { key:'backup_auto_monthly', label:'🗓️ 毎月1日 AM3:00', enabled: bkAutoM },
          ].map(t => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 0">
              <span style="flex:1;font-size:.82rem;color:var(--text2)">${t.label}</span>
              <button class="btn btn-sm ${t.enabled ? 'btn-primary' : 'btn-ghost'}"
                onclick="Pages._bkToggleAuto('${t.key}', ${t.enabled})">
                ${t.enabled ? 'ON' : 'OFF'}
              </button>
            </div>`).join('')}
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="btn btn-ghost" style="flex:1;font-size:.78rem"
              onclick="Pages._bkInitTriggers()">
              ⚡ トリガーをGASに登録
            </button>
            ${bkFolderUrl
              ? `<a href="${bkFolderUrl}" target="_blank" class="btn btn-ghost btn-sm">📁 Driveを開く</a>`
              : ''}
          </div>
          <div style="font-size:.7rem;color:var(--text3);margin-top:6px">
            ※ トリガー登録は初回1回のみ実行してください。<br>
            　GAS側でスクリプトの実行権限を承認する画面が出ます。
          </div>
        </div>

        <!-- バックアップ履歴（直近5件） -->
        <div style="padding-top:10px">
          <div style="font-size:.8rem;font-weight:600;color:var(--text2);margin-bottom:6px">
            バックアップ履歴
          </div>
          <div id="bk-history-list">
            <div style="font-size:.75rem;color:var(--text3);text-align:center;padding:8px">
              読み込み中...
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:6px;width:100%;font-size:.75rem"
            onclick="Pages._bkLoadHistory()">
            🔄 履歴を更新
          </button>
        </div>
      </div>

      <!-- バージョン情報 -->
      <div style="text-align:center;font-size:.7rem;color:var(--text3);padding:8px 0">
        HerculesOS v${CONFIG.APP_VERSION} / Phase ${CONFIG.PHASE}<br>
        GAS連携モード
      </div>

    </div>`;
}

// ── GAS URL 保存・テスト ─────────────────────────────────────────
Pages._setGasUrl = async function () {
  var url = (document.getElementById('set-gas-url') || {}).value;
  url = url ? url.trim() : '';
  if (!url) { UI.toast('URLを入力してください', 'error'); return; }

  var resultEl = document.getElementById('gas-test-result');

  console.log('[SETTINGS] ===== connect test start =====');
  console.log('[SETTINGS] ===== connect test start =====');
  console.log('[SETTINGS] __INDEX_BUILD :', window.__INDEX_BUILD || '(not set)');
  console.log('[SETTINGS] __API_BUILD   :', window.__API_BUILD   || '(not set)');
  console.log('[SETTINGS] input GAS_URL :', url);

  Store.setSetting('gas_url', url);
  CONFIG.GAS_URL = url;
  localStorage.setItem(CONFIG.LS_KEYS.GAS_URL, url);
  console.log('[SETTINGS] saved GAS_URL:', CONFIG.GAS_URL);

  resultEl.innerHTML = '<div style="font-size:.8rem;color:var(--text3);margin-top:8px">'
    + '⏳ 接続テスト中... <span style="font-size:.7rem">(' + url.slice(0, 50) + ')</span></div>';

  if (!url.includes('/exec')) {
    console.warn('[SETTINGS] URL missing /exec:', url);
    resultEl.innerHTML = '<div style="background:rgba(224,144,64,.1);border:1px solid rgba(224,144,64,.4);'
      + 'border-radius:8px;padding:10px;margin-top:8px;font-size:.8rem">'
      + '<b style="color:var(--amber)">⚠️ URL に /exec がありません</b><br>'
      + '<span>GASウェブアプリURLは <code>.../exec</code> の形式です。</span></div>';
    return;
  }

  try {
    var testUrl = url + '?action=getSettings&payload={}';
    console.log('[SETTINGS] raw fetch URL:', testUrl);

    var fetchRes = await fetch(testUrl, { method: 'GET', redirect: 'follow' });
    console.log('[SETTINGS] response status:', fetchRes.status, 'ok:', fetchRes.ok);
    var rawText = await fetchRes.text();
    console.log('[SETTINGS] response text (first 300):', rawText.slice(0, 300));

    var json;
    try { json = JSON.parse(rawText); } catch(_e) {
      var preview = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120).trim();
      console.error('[SETTINGS] non-JSON response:', preview);
      resultEl.innerHTML = '<div style="background:rgba(224,80,80,.08);border:1px solid rgba(224,80,80,.3);'
        + 'border-radius:8px;padding:12px;margin-top:8px;font-size:.82rem">'
        + '<b style="color:var(--red,#e05050)">❌ GASがHTMLを返しました（JSON未返却）</b>'
        + '<ul style="margin:8px 0 0 18px;font-size:.78rem;line-height:1.8">'
        + '<li>GASデプロイの「アクセス: <b>全員</b>」を確認</li>'
        + '<li>Config.gs / Code.gs を最新版で保存・再デプロイ</li>'
        + '<li>デプロイを「新バージョン」で更新したか確認</li>'
        + '</ul>'
        + '<div style="margin-top:6px;font-size:.68rem;color:var(--text3)">受信内容: ' + preview + '</div>'
        + '</div>';
      return;
    }

    if (!json.ok) {
      console.error('[SETTINGS] GAS ok:false:', json.error);
      resultEl.innerHTML = '<div style="background:rgba(224,80,80,.08);border:1px solid rgba(224,80,80,.3);'
        + 'border-radius:8px;padding:12px;margin-top:8px;font-size:.82rem">'
        + '<b style="color:var(--red,#e05050)">❌ GASエラー: ' + (json.error || '不明') + '</b>'
        + '<div style="font-size:.75rem;color:var(--text3);margin-top:4px">GASエディタのログを確認してください。</div>'
        + '</div>';
      return;
    }

    console.log('[SETTINGS] SUCCESS:', json.data);
    resultEl.innerHTML = '<div style="background:rgba(76,175,120,.08);border:1px solid rgba(76,175,120,.4);'
      + 'border-radius:8px;padding:12px;margin-top:8px;font-size:.82rem">'
      + '<b style="color:var(--green)">✅ 接続成功！GAS URLを保存しました。</b>'
      + '<div style="font-size:.72rem;color:var(--text3);margin-top:4px">URL: ' + url.slice(0, 60) + '</div>'
      + '</div>';

    var res = json.data;
    if (res && typeof res === 'object') {
      Object.keys(res).forEach(function(k) { Store.setSetting(k, res[k]); });
    }
    UI.toast('GAS URLを保存しました ✅', 'success');
    setTimeout(function() { if (typeof syncAll === 'function') syncAll(false); }, 500);

  } catch (e) {
    var isFailed = e.message.indexOf('Failed to fetch') !== -1;
    console.error('[SETTINGS] fetch error:', e.message);
    resultEl.innerHTML = '<div style="background:rgba(224,80,80,.08);border:1px solid rgba(224,80,80,.3);'
      + 'border-radius:8px;padding:12px;margin-top:8px;font-size:.82rem">'
      + '<b style="color:var(--red,#e05050)">❌ '
      + (isFailed ? '通信失敗 (Failed to fetch)' : '接続失敗: ' + e.message) + '</b>'
      + '<ol style="margin:8px 0 0 18px;font-size:.78rem;line-height:1.9">'
      + '<li>URLが <code>.../exec</code> の形式か確認</li>'
      + '<li>GASデプロイの「アクセス: <b>全員</b>」を確認</li>'
      + '<li>同URLをブラウザで直接開けるか確認（JSONが表示されるはず）</li>'
      + '<li>GASを「新バージョン」で再デプロイ</li>'
      + '</ol>'
      + '<div style="margin-top:8px;font-size:.68rem;color:var(--text3)">試したURL: ' + url.slice(0, 80) + '</div>'
      + '</div>';
  }
};

Pages._setToggleGasUrl = function () {
  const el = document.getElementById('set-gas-url');
  if (el) el.type = el.type === 'password' ? 'url' : 'password';
};

// ── Gemini Key 保存 ───────────────────────────────────────────────
Pages._setGeminiKey = function () {
  const key = document.getElementById('set-gemini-key')?.value?.trim();
  if (!key) { UI.toast('APIキーを入力してください', 'error'); return; }
  Store.setSetting('gemini_key', key);
  CONFIG.GEMINI_KEY = key;
  localStorage.setItem(CONFIG.LS_KEYS.GEMINI_KEY, key);
  UI.toast('Gemini APIキーを保存しました', 'success');
};

Pages._setToggleGemini = function () {
  const el = document.getElementById('set-gemini-key');
  if (el) el.type = el.type === 'password' ? 'text' : 'password';
};

// ── 閾値保存 ─────────────────────────────────────────────────────
Pages._setThresholds = async function () {
  const brand  = document.getElementById('set-brand')?.value?.trim()  || 'HM';
  const guinW  = document.getElementById('set-guinw')?.value          || '170';
  const tMm    = document.getElementById('set-tmm')?.value            || '200';
  const lMm    = document.getElementById('set-lmm')?.value            || '180';

  Store.setSetting('brand_code',               brand);
  Store.setSetting('guinness_weight_g',        guinW);
  Store.setSetting('target_size_mm',           tMm);
  Store.setSetting('large_male_threshold_mm',  lMm);

  // GASの設定シートにも反映
  const gasUrl = Store.getSetting('gas_url');
  if (gasUrl) {
    try {
      await Promise.all([
        API.system.updateSetting('brand_code',              brand),
        API.system.updateSetting('guinness_weight_g',       guinW),
        API.system.updateSetting('target_size_mm',          tMm),
        API.system.updateSetting('large_male_threshold_mm', lMm),
      ]);
      UI.toast('閾値を保存しました（GASにも反映済み）', 'success');
    } catch (e) {
      UI.toast('ローカルに保存しました（GAS反映失敗: ' + e.message + '）', 'info');
    }
  } else {
    UI.toast('ローカルに保存しました', 'success');
  }
};

// ── データ同期 ────────────────────────────────────────────────────
Pages._setSync = async function () {
  await syncAll(false);
  _renderSettings(document.getElementById('main'));
};

// ── キャッシュクリア ─────────────────────────────────────────────
Pages._setClearCache = function () {
  if (!UI.confirm('ローカルキャッシュを削除しますか？\nGAS URLとAPIキーは保持されます。')) return;
  Store.clearCache();
  UI.toast('キャッシュを削除しました。次回起動時にGASから再取得します。', 'info', 4000);
  _renderSettings(document.getElementById('main'));
};

// ── GAS init 実行 ────────────────────────────────────────────────
Pages._setInit = async function () {
  if (!UI.confirm('スプレッドシートに全15シートを作成します。よろしいですか？')) return;
  try {
    const res = await apiCall(() => API.system.init(), '初期化が完了しました！');
    UI.toast(`シート作成: ${res.created?.length || 0}件 / スキップ: ${res.skipped?.length || 0}件`, 'success', 5000);
  } catch (e) {}
};

// ── 開発用：全データリセット ────────────────────────────────────
Pages._devReset = async function () {
  if (!window.confirm(
    '⚠️ 全データリセット（テスト用）\n\n本当に全データを削除しますか？\n\n' +
    '残るもの：ヘッダー行 / 設定\n' +
    '削除されるもの：ライン / ロット / 個体 / 種親 / 血統 / 産卵セット / 採卵記録 / 成長記録 他\n\n' +
    'この操作は取り消せません。')) return;

  if (!window.confirm('最終確認：本当に削除してよいですか？')) return;

  const btn = document.querySelector('[onclick*="_devReset"]');
  if (btn) { btn.disabled = true; btn.textContent = 'リセット中…'; }

  try {
    const res = await API.system.resetAllData();
    // ローカルキャッシュクリア
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('hercules')) localStorage.removeItem(k);
      });
      Store.clearCache();
    } catch(e) {}

    window.alert('✅ リセット完了\n\n' + (res.results || []).join('\n'));
    location.reload();
  } catch(e) {
    window.alert('❌ リセット失敗:\n' + e.message + '\n\nGASを再デプロイして再試行してください。');
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ 全データリセット（テスト用）'; }
  }
};

// ── バックアップ: 手動実行 ────────────────────────────────────────
Pages._bkRunManual = async function () {
  const btn  = document.getElementById('bk-run-btn');
  const resEl= document.getElementById('bk-run-result');
  const memo = document.getElementById('bk-memo')?.value?.trim() || '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 実行中...'; }
  if (resEl) resEl.innerHTML = '';

  try {
    const result = await API.backup.run(memo || 'settings画面から手動実行');

    // 成功日時・種別・URLをローカルに保存
    Store.setSetting('backup_last_success_at', result.executed_at);
    Store.setSetting('backup_last_type',       'Manual');
    Store.setSetting('backup_last_url',        result.drive_url);
    if (result.folder_url) Store.setSetting('backup_folder_url', result.folder_url);

    if (resEl) resEl.innerHTML = `
      <div style="color:var(--green)">
        ✅ バックアップ完了<br>
        <span style="font-size:.72rem;color:var(--text3)">
          個体${result.counts?.individuals || 0}頭 / ロット${result.counts?.lots || 0}個
          / ${result.executed_at}
          ${memo ? ' / メモ: ' + memo : ''}
        </span><br>
        <a href="${result.drive_url}" target="_blank"
          style="color:var(--blue);font-size:.72rem">📁 ファイルを開く</a>
      </div>`;

    // メモフィールドをクリア
    const memoEl = document.getElementById('bk-memo');
    if (memoEl) memoEl.value = '';

    Pages._bkLoadHistory();
    setTimeout(() => _renderSettings(document.getElementById('main')), 1800);

  } catch (e) {
    Store.setSetting('backup_last_fail_at', new Date().toLocaleString('ja-JP'));
    if (resEl) resEl.innerHTML = `<div style="color:var(--red)">❌ 失敗: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✋ 今すぐバックアップ'; }
  }
};

// ── バックアップ: 自動設定 ON/OFF トグル ──────────────────────────
Pages._bkToggleAuto = async function (settingKey, currentEnabled) {
  const newVal = currentEnabled ? 'false' : 'true';
  Store.setSetting(settingKey, newVal);
  // GASにも反映
  try {
    await API.system.updateSetting(settingKey, newVal);
  } catch (e) {
    // GAS未接続でもローカル設定は保存済みなので続行
  }
  // 画面を再描画
  _renderSettings(document.getElementById('main'));
  // 再描画後に履歴を再ロード
  setTimeout(() => Pages._bkLoadHistory(), 100);
};

// ── バックアップ: トリガー登録 ────────────────────────────────────
Pages._bkInitTriggers = async function () {
  if (!UI.confirm(
    'GASにタイムトリガーを登録します。\n' +
    '初回実行時はGoogleの権限承認画面が表示されます。\n\n' +
    '既に登録済みの場合はスキップされます。'
  )) return;
  try {
    const res = await apiCall(() => API.backup.initTriggers(), 'トリガーを登録しました');
    const msg = [
      res.created?.length ? `登録: ${res.created.join(', ')}` : '',
      res.skipped?.length ? `スキップ: ${res.skipped.join(', ')}` : '',
    ].filter(Boolean).join(' / ');
    if (msg) UI.toast(msg, 'info', 5000);
  } catch (e) {}
};

// ── バックアップ: 履歴ロード ──────────────────────────────────────
Pages._bkLoadHistory = async function () {
  const el = document.getElementById('bk-history-list');
  if (!el) return;
  try {
    const res = await API.backup.list({ limit: 5 });
    const list = res.backups || [];
    if (!list.length) {
      el.innerHTML = '<div style="font-size:.75rem;color:var(--text3);text-align:center;padding:8px">履歴がありません</div>';
      return;
    }
    el.innerHTML = list.map(b => {
      const icon    = BACKUP_DISPLAY.status_icons[b.status] || '❓';
      const typeIcon= BACKUP_DISPLAY.type_icons[b.backup_type] || '';
      const counts  = b.individual_count
        ? `<span style="color:var(--text3)">個体${b.individual_count}頭</span>`
        : '';
      return `
        <div style="display:flex;align-items:center;gap:6px;padding:5px 0;
          border-bottom:1px solid var(--border);font-size:.75rem">
          <span>${icon} ${typeIcon}</span>
          <div style="flex:1;min-width:0">
            <div style="color:var(--text2)">${b.executed_at}</div>
            <div style="color:var(--text3)">${b.backup_type} ${counts}</div>
            ${b.status === 'error'
              ? `<div style="color:var(--red);font-size:.7rem">${b.error_message?.slice(0,60) || ''}</div>`
              : ''}
          </div>
          ${b.drive_url
            ? `<a href="${b.drive_url}" target="_blank"
                style="color:var(--blue);font-size:.72rem;white-space:nowrap">開く</a>`
            : ''}
        </div>`;
    }).join('');
  } catch (e) {
    if (el) el.innerHTML = '<div style="font-size:.75rem;color:var(--text3)">履歴の取得に失敗しました</div>';
  }
};

window.PAGES = window.PAGES || {};
window.PAGES['settings'] = () => Pages.settings();

// ════════════════════════════════════════════════════════════════
// Phase A — 整合性チェック / 再計算
// ════════════════════════════════════════════════════════════════

Pages._integrityCheck = async function () {
  const btn   = document.getElementById('integrity-check-btn');
  const resEl = document.getElementById('integrity-result');

  if (btn)   { btn.disabled = true; btn.textContent = '🔍 チェック中...'; }
  if (resEl) { resEl.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>'; }

  try {
    const res  = await API.integrity.check();
    const errs = res.errors  || [];
    const summ = res.summary || {};

    if (!errs.length) {
      if (resEl) resEl.innerHTML = `
        <div style="padding:10px 12px;
          background:rgba(45,122,82,.10);border:1px solid rgba(45,122,82,.30);
          border-radius:8px;font-size:.82rem;color:var(--green)">
          ✅ 不整合なし — 全 ${res.ok_count || 0} ロット正常
        </div>`;
      return;
    }

    // サマリー行
    const summaryHtml = [
      summ.lot_line_missing       ? `line欠損: ${summ.lot_line_missing}`             : '',
      summ.lot_line_invalid       ? `line無効: ${summ.lot_line_invalid}`             : '',
      summ.ind_lot_invalid        ? `lot無効参照: ${summ.ind_lot_invalid}`           : '',
      summ.lot_count_negative     ? `count負値: ${summ.lot_count_negative}`          : '',
      summ.lot_count_mismatch     ? `count不一致: ${summ.lot_count_mismatch}`        : '',
      summ.attrition_total_mismatch ? `attrition不一致: ${summ.attrition_total_mismatch}` : '',
    ].filter(Boolean).join(' / ');

    // 詳細行（最大20件）
    const detailRows = errs.slice(0, 20).map(function (e) {
      return `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:.78rem">
        <span style="color:var(--red);font-weight:600">[${e.type}]</span>
        <span style="color:var(--text2);margin-left:6px">${e.display || e.lot_id || e.ind_id || ''}</span>
        <div style="font-size:.72rem;color:var(--text3);margin-top:2px">${e.msg}</div>
      </div>`;
    }).join('');

    const moreHtml = errs.length > 20
      ? `<div style="font-size:.72rem;color:var(--text3);padding:4px 0">
           他 ${errs.length - 20} 件は GAS ログを確認してください
         </div>`
      : '';

    if (resEl) resEl.innerHTML = `
      <div style="padding:10px 12px;
        background:rgba(231,76,60,.06);border:1px solid rgba(231,76,60,.25);
        border-radius:8px">
        <div style="font-size:.85rem;font-weight:700;color:var(--red);margin-bottom:6px">
          ⚠️ ${errs.length} 件の不整合を検出
        </div>
        <div style="font-size:.72rem;color:var(--text3);margin-bottom:8px">${summaryHtml}</div>
        ${detailRows}
        ${moreHtml}
        <button class="btn btn-ghost"
          style="margin-top:10px;width:100%;font-size:.8rem"
          onclick="Pages._recalcAll()">
          ♻️ 再計算で修正を試みる
        </button>
      </div>`;

  } catch (e) {
    if (resEl) resEl.innerHTML =
      `<div style="color:var(--red);font-size:.82rem">エラー: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 整合性チェック'; }
  }
};

Pages._recalcAll = async function () {
  if (!UI.confirm(
    '全ロットの count / attrition_total を\n成長記録から再計算します。\nよろしいですか？'
  )) return;

  const btn   = document.getElementById('recalc-all-btn');
  const resEl = document.getElementById('integrity-result');

  if (btn)   { btn.disabled = true; btn.textContent = '♻️ 再計算中...'; }
  if (resEl) { resEl.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>'; }

  try {
    const res = await API.integrity.recalculateAll();
    await syncAll(true);   // キャッシュを最新化

    const errHtml = (res.errors || []).slice(0, 5).map(function (e) {
      return `<div style="font-size:.72rem;color:var(--red)">${e.display || e.lot_id}: ${e.error}</div>`;
    }).join('');

    // 変化があったロットのみ表示（最大10件）
    const changedRows = (res.results || [])
      .filter(function (r) {
        return r.old_count !== r.new_count || r.old_attrition !== r.new_attrition;
      })
      .slice(0, 10)
      .map(function (r) {
        return `<div style="font-size:.72rem;color:var(--text3);
          padding:3px 0;border-top:1px solid var(--border)">
          ${r.display}:
          count ${r.old_count}→${r.new_count} /
          attrition ${r.old_attrition}→${r.new_attrition}
        </div>`;
      }).join('');

    if (resEl) resEl.innerHTML = `
      <div style="padding:10px 12px;
        background:rgba(45,122,82,.10);border:1px solid rgba(45,122,82,.30);
        border-radius:8px;font-size:.82rem">
        <div style="font-weight:700;color:var(--green);margin-bottom:6px">
          ♻️ 再計算完了
        </div>
        <div style="color:var(--text2)">
          対象: ${res.total || 0} ロット /
          更新: ${res.updated || 0} /
          スキップ: ${res.skipped || 0}
          ${(res.errors || []).length
            ? `/ <span style="color:var(--red)">エラー: ${res.errors.length}</span>`
            : ''}
        </div>
        ${changedRows}
        ${errHtml}
        <button class="btn btn-ghost"
          style="margin-top:10px;width:100%;font-size:.8rem"
          onclick="Pages._integrityCheck()">
          🔍 再チェックして確認
        </button>
      </div>`;

  } catch (e) {
    if (resEl) resEl.innerHTML =
      `<div style="color:var(--red);font-size:.82rem">エラー: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '♻️ 全ロット再計算'; }
  }
};

// ── Phase2: 後食・ペアリング設定保存 ────────────────────────────
Pages._savePairingSettings = async function () {
  const maleWait     = document.getElementById('set-male-wait')?.value;
  const femaleWait   = document.getElementById('set-female-wait')?.value;
  const intervalMin  = document.getElementById('set-pairing-interval')?.value;
  const exchDays     = document.getElementById('set-exchange-days')?.value;
  if (!maleWait || !femaleWait || !intervalMin) {
    UI.toast('すべての値を入力してください'); return;
  }
  try {
    UI.loading(true);
    await API.system.updateSetting('male_pairing_wait_days',    maleWait);
    await API.system.updateSetting('female_pairing_wait_days',  femaleWait);
    await API.system.updateSetting('male_pairing_interval_min_days', intervalMin);
    if (exchDays) await API.system.updateSetting('pairing_set_exchange_days', exchDays);
    Store.setSetting('male_pairing_wait_days',    maleWait);
    Store.setSetting('female_pairing_wait_days',  femaleWait);
    Store.setSetting('male_pairing_interval_min_days', intervalMin);
    if (exchDays) Store.setSetting('pairing_set_exchange_days', exchDays);
    UI.toast('設定を保存しました');
  } catch(e) {
    UI.toast('エラー: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};


// ────────────────────────────────────────────────────────────────
// FILE: js/pages/scan.js
// ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// scan.js — QRスキャン + 差分入力 + 成長記録  v3
//
// 【3モード】
//   確認モード  : QR → 個体/ロット/産卵セット詳細画面を直接開く
//   差分入力    : QR → 未入力項目を補完して保存
//   成長記録    : QR → growth-rec（新UI）に転送
//
// 【QR読み取り方法】
//   ① カメラ読み取り（jsQR / inversionAttempts:'attemptBoth' / 3フレームに1回スキャン）
//   ② 画像ファイル読み取り（スマホ保存画像・スクリーンショット対応）
//   ③ テキスト手入力 / ペースト
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// QRスキャン画面 (qr-scan)
// ════════════════════════════════════════════════════════════════
Pages.qrScan = function (params = {}) {
  const main = document.getElementById('main');
  // 3モード: confirm(情報確認) / transition(移行編成) / record(継続・追加読取り)
  const _modeMap = { 'view':'confirm','weight':'record','diff':'record','t1':'transition','t2':'transition','t3':'transition','t1_add':'transition' };
  let _scanMode = _modeMap[params.mode] || params.mode || 'confirm';
  if (!['confirm','transition','record'].includes(_scanMode)) _scanMode = 'confirm';
  // 移行編成サブモード (t1/t2/t3)
  window._qrTransMode = (params.mode === 't2') ? 't2' : (params.mode === 't3') ? 't3' : 't1';
  window._qrAddingToSession = (params.mode === 't1_add');  // セッションへ追加読取り中
  window._qrScanMode = _scanMode;

  function _modeStyle(m) {
    if (m === _scanMode) {
      const bg = m==='transition' ? 'var(--green)' : m==='record' ? 'var(--blue)' : 'var(--gold)';
      return `background:${bg};color:#fff;font-weight:700;`;
    }
    return 'color:var(--text3);background:transparent;';
  }
  function _modeDesc() {
    if (_scanMode === 'transition') {
      const sub = { t1:'T1移行', t2:'T2移行', t3:'T3移行' }[window._qrTransMode] || 'T1移行';
      return `🔄 移行編成 — ${sub}: T0ロットQRを読んでセッションを開始`;
    }
    if (_scanMode === 'record') return '📷 継続・追加読取り: QR → 成長記録';
    return '🔍 情報確認: QR → 詳細画面を開く';
  }

  function render() {
    main.innerHTML = `
      ${UI.header('📷 QRスキャン', { back: true })}
      <div class="page-body">

        <!-- 3モードタブ -->
        <div style="display:flex;background:var(--surface2);border-radius:10px;padding:3px;gap:3px">
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('confirm')}"
            onclick="Pages._qrSwitchMode('confirm')">🔍 情報確認</button>
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('transition')}"
            onclick="Pages._qrSwitchMode('transition')">🔄 移行編成</button>
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('record')}"
            onclick="Pages._qrSwitchMode('record')">📷 継続読取り</button>
        </div>
        <!-- 移行編成サブモード -->
        ${_scanMode === 'transition' ? `
        <div style="display:flex;gap:4px;padding:4px 0">
          ${['t1','t2','t3'].map(m => `<button style="flex:1;padding:5px;border-radius:7px;font-size:.75rem;cursor:pointer;
            border:1px solid ${window._qrTransMode===m?'var(--green)':'var(--border)'};
            background:${window._qrTransMode===m?'rgba(76,175,120,.15)':'var(--surface2)'};
            color:${window._qrTransMode===m?'var(--green)':'var(--text3)'};font-weight:${window._qrTransMode===m?'700':'400'}"
            onclick="Pages._qrSetTransMode('${m}')">${m.toUpperCase()}移行</button>`).join('')}
        </div>` : ''}
        <div style="font-size:.72rem;color:var(--text3);padding:2px 4px;margin-top:-2px">${_modeDesc()}</div>

        <!-- カメラエリア -->
        <div class="card" id="camera-card" style="display:none;padding:0;overflow:hidden">
          <div style="position:relative;width:100%;background:#000">
            <video id="qr-video" autoplay playsinline muted
              style="width:100%;display:block;max-height:260px;object-fit:cover"></video>
            <canvas id="qr-canvas" style="display:none"></canvas>
            <!-- スキャン枠 -->
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
              <div id="scan-frame" style="width:200px;height:200px;border:3px solid var(--green);border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,0.5)"></div>
            </div>
            <!-- スキャン中アニメ -->
            <div id="scan-line" style="position:absolute;left:calc(50% - 100px);top:calc(50% - 100px);width:200px;height:3px;background:var(--green);opacity:.8;animation:scanLine 2s infinite linear"></div>
          </div>
          <div style="display:flex;gap:8px;padding:8px">
            <button class="btn btn-ghost" style="flex:1" onclick="Pages._qrStopCamera()">✕ 閉じる</button>
            <div id="scan-status" style="flex:2;display:flex;align-items:center;justify-content:center;font-size:.78rem;color:var(--green)">スキャン中…</div>
          </div>
        </div>

        <!-- 入力カード -->
        <div class="card">
          <!-- カメラボタン -->
          <button class="btn btn-ghost btn-full" id="camera-btn" onclick="Pages._qrStartCamera()"
            style="margin-bottom:10px;border:2px solid var(--green);background:rgba(45,122,82,.08);font-size:.95rem;padding:14px;border-radius:12px">
            <span style="font-size:1.4rem;margin-right:8px">📷</span>カメラで読み取る
          </button>

          <!-- 画像ファイル読み取り -->
          <label style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border:2px dashed var(--border2);border-radius:10px;cursor:pointer;margin-bottom:10px;font-size:.85rem;color:var(--text3)">
            <span style="font-size:1.2rem">🖼️</span>QR画像を選択して読み取る
            <input type="file" accept="image/*" style="display:none" onchange="Pages._qrReadFromImage(this)">
          </label>

          <div style="display:flex;align-items:center;gap:8px;margin:6px 0">
            <div style="flex:1;height:1px;background:var(--border2)"></div>
            <span style="font-size:.72rem;color:var(--text3)">またはテキストで入力</span>
            <div style="flex:1;height:1px;background:var(--border2)"></div>
          </div>

          <div class="field" style="margin-bottom:10px">
            <label class="field-label">QRコードの内容を貼り付け</label>
            <textarea id="qr-input" class="input" rows="3"
              placeholder="例:
LOT:LOT-XXXXXXXX
IND:IND-XXXXXXXX
SET:SET-XXXXXXXX
BU:HM2026-A1-U01"
              style="font-family:var(--font-mono);font-size:.88rem"
              oninput="Pages._qrPreviewInput(this.value)"></textarea>
            <div id="qr-preview" style="font-size:.72rem;margin-top:4px"></div>
          </div>

          <button class="btn btn-gold btn-full" id="qr-resolve-btn" onclick="Pages._qrResolve()">
            🔍 読み取り・確認
          </button>
          <div id="qr-error" style="margin-top:8px;font-size:.8rem;color:var(--red)"></div>
        </div>

        <!-- スキャン方法ガイド -->
        <div class="card">
          <div class="card-title">ラベルのQRコード内容</div>
          <div style="font-size:.75rem;color:var(--text3);line-height:1.8">
            ${[
              ['IND:IND-xxxxx', '個体ラベル', 'var(--green)'],
              ['LOT:LOT-xxxxx', 'ロットラベル', 'var(--amber)'],
              ['SET:SET-xxxxx', '産卵セットラベル', 'var(--gold)'],
              ['BU:HM2026-A1-U01', '飼育ユニット (T2移行用)', 'var(--blue)'],
            ].map(([code,label,col])=>`<div style="display:flex;gap:8px;padding:3px 0">
              <span style="font-family:var(--font-mono);color:${col};min-width:140px">${code}</span>
              <span>${label}</span>
            </div>`).join('')}
          </div>
        </div>

        <div id="scan-history-card"></div>
      </div>`;

    // CSSアニメーション注入
    if (!document.getElementById('scan-anim-style')) {
      const st = document.createElement('style');
      st.id = 'scan-anim-style';
      st.textContent = '@keyframes scanLine{0%{top:calc(50% - 100px)}50%{top:calc(50% + 97px)}100%{top:calc(50% - 100px)}}';
      document.head.appendChild(st);
    }

    setTimeout(() => Pages._qrRenderHistory(), 50);
  }

  Pages._qrSwitchMode = function(m) {
    _scanMode = m;
    window._qrScanMode = m;
    window._qrAddingToSession = false; // モード切替時は追加読取りを解除
    render();
  };
  Pages._qrSetTransMode = function(m) {
    window._qrTransMode = m;
    render();
  };
  render();

  // 起動直後カメラ自動起動（モード問わず）
  if (params.autoCamera) {
    setTimeout(() => Pages._qrStartCamera(), 300);
  }
};


// ════════════════════════════════════════════════════════════════
// 差分入力画面 (qr-diff)
// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// QR スキャン ヘルパー群
// ════════════════════════════════════════════════════════════════

// ── QRテキストのプレビュー ─────────────────────────────────────
Pages._qrPreviewInput = function (val) {
  const el = document.getElementById('qr-preview');
  if (!el) return;
  const v = (val || '').trim();
  const labels = { LOT: '🟡 ロット', IND: '🟢 個体', SET: '🟠 産卵セット', PAR: '👑 種親', BU: '🔵 飼育ユニット' };
  const type = v.startsWith('LOT:') ? 'LOT'
    : v.startsWith('IND:') ? 'IND'
    : v.startsWith('SET:') ? 'SET'
    : v.startsWith('PAR:') ? 'PAR'
    : v.startsWith('BU:')  ? 'BU'
    : null;
  el.innerHTML = type
    ? `<span style="color:var(--green)">${labels[type]} : ${v.slice(v.indexOf(':')+1)}</span>`
    : v ? `<span style="color:var(--red)">⚠️ フォーマット不正（LOT: / IND: / SET: / BU: で始まる必要があります）</span>` : '';
};

// ── QR解析・モード別遷移 ─────────────────────────────────────

// モード別遷移（ローカル/API両方から呼ばれる共通ルーター）
function _qrNavigate(mode, res, qrText) {
  // ── QRテキストから entity ID をフォールバック取得 ──────────────
  // APIレスポンスが不完全な場合もQRテキスト自体からIDを抽出
  function _extractIdFromQr(prefix) {
    var raw = (qrText || '').trim();
    if (raw.toUpperCase().startsWith(prefix.toUpperCase() + ':')) {
      return raw.slice(prefix.length + 1).trim();
    }
    return '';
  }

  console.log('[QR] navigate mode:', mode, '/ entity_type:', res.entity_type,
    '/ entity:', !!(res.entity), '/ qrText:', qrText);

  if (mode === 'transition') {
    var ent = res.entity || {};
    var sub = window._qrTransMode || 't1';

    // 追加読取りモード
    if (window._qrAddingToSession) {
      var _addLotId = ent.lot_id || _extractIdFromQr('LOT');
      var ok = Pages._t1TryAddLot && Pages._t1TryAddLot(_addLotId);
      if (!ok) routeTo('qr-scan', { mode: 't1_add' });
      return;
    }

    if (sub === 't1') {
      if (res.entity_type === 'LOT') {
        var _lotId = ent.lot_id || _extractIdFromQr('LOT');
        if (_lotId) {
          Pages.t1SessionStart(_lotId);
        } else {
          UI.toast('ロットIDが取得できませんでした', 'error');
        }
      } else if (res.entity_type === 'BU') {
        // T1移行モードでBUをスキャン → ガイドメッセージ
        UI.toast('T1移行編成モードでは、T0ロットのQRコードを読み取ってください', 'info', 3000);
      } else {
        UI.toast('T1移行: ロット（LOT:）のQRコードを読んでください', 'info', 2500);
      }
    } else if (sub === 't2') {
      if (res.entity_type === 'BU') {
        var _buIdT2 = ent.display_id || ent.unit_id || _extractIdFromQr('BU');
        console.log('[QR] T2 BU navigate - id:', _buIdT2);
        if (_buIdT2 && Pages.t2SessionStart) {
          Pages.t2SessionStart(_buIdT2);
        } else if (!_buIdT2) {
          UI.toast('BUのIDが取得できませんでした。QRコードを確認してください', 'error', 3000);
        } else {
          UI.toast('T2移行セッションが利用できません', 'error');
        }
      } else if (res.entity_type === 'IND') {
        // 個体QRスキャン → 個体1頭を対象にT2セッション開始
        var _indIdT2 = ent.ind_id || ent.display_id || _extractIdFromQr('IND');
        console.log('[QR] T2 IND navigate - id:', _indIdT2);
        if (_indIdT2 && Pages.t2SessionStartFromInd) {
          Pages.t2SessionStartFromInd(_indIdT2);
        } else {
          UI.toast('T2移行: 個体または BUラベルを読み取ってください', 'error', 3000);
        }
      } else if (res.entity_type === 'LOT') {
        UI.toast('T2移行は BU（飼育ユニット）または個体(IND)のQRを読んでください', 'error', 3000);
      } else {
        UI.toast('T2移行: BU/INDラベルを読み取ってください', 'error', 3000);
      }
    } else if (sub === 't3') {
      if (res.entity_type === 'BU') {
        var _buIdT3 = ent.display_id || ent.unit_id || _extractIdFromQr('BU');
        console.log('[QR] T3 BU navigate - id:', _buIdT3);
        if (_buIdT3 && Pages.t3SessionStart) {
          Pages.t3SessionStart(_buIdT3);
        } else if (!_buIdT3) {
          UI.toast('BUのIDが取得できませんでした。QRコードを確認してください', 'error', 3000);
        } else {
          UI.toast('T3移行セッションが利用できません', 'error');
        }
      } else if (res.entity_type === 'IND') {
        var _indIdT3 = ent.ind_id || ent.display_id || _extractIdFromQr('IND');
        console.log('[QR] T3 IND navigate - id:', _indIdT3);
        if (_indIdT3 && Pages.t3SessionStartFromInd) {
          Pages.t3SessionStartFromInd(_indIdT3);
        } else {
          UI.toast('T3移行: 個体または BUラベルを読み取ってください', 'error', 3000);
        }
      } else if (res.entity_type === 'LOT') {
        UI.toast('T3移行は BU（飼育ユニット）または個体(IND)のQRを読んでください', 'error', 3000);
      } else {
        UI.toast('T3移行: BU/INDラベルを読み取ってください', 'error', 3000);
      }
    } else {
      UI.toast(sub.toUpperCase() + '移行は準備中です', 'info', 2000);
    }

  } else if (mode === 'record') {
    var _ent = res.entity || {};
    var _eid = _ent.ind_id || _ent.lot_id || _ent.unit_id || '';
    var _ety = res.entity_type || 'IND';
    if (_eid) {
      routeTo('growth-rec', { targetType: _ety, targetId: _eid, displayId: _ent.display_id || _eid, _fromQR: true });
    } else {
      UI.toast('対象が特定できませんでした（成長記録モード）', 'error');
    }

  } else {
    // ── 確認モード: 詳細画面へ遷移 ──────────────────────────────
    var _ent2 = res.entity || {};
    var eid = _ent2.ind_id || _ent2.lot_id || _ent2.set_id || _ent2.par_id || '';

    if      (res.entity_type === 'IND' && eid) {
      routeTo('ind-detail', { indId: eid });
    }
    else if (res.entity_type === 'LOT' && eid) {
      routeTo('lot-detail', { lotId: eid });
    }
    else if (res.entity_type === 'SET' && eid) {
      routeTo('pairing-detail', { pairingId: eid });
    }
    else if (res.entity_type === 'PAR' && eid) {
      routeTo('parent-detail', { parId: eid });
    }
    else if (res.entity_type === 'BU') {
      // BU: display_id → unit-detail
      // フォールバック優先順位: entity.display_id > entity.unit_id > QRテキスト抽出
      var _buDid = (_ent2.display_id && _ent2.display_id !== '' ? _ent2.display_id : null)
                || (_ent2.unit_id && _ent2.unit_id !== '' ? _ent2.unit_id : null)
                || _extractIdFromQr('BU')
                || '';
      console.log('[QR] BU confirm → unitDisplayId:', _buDid,
        '| src:', _ent2.display_id ? 'entity.display_id' : (_ent2.unit_id ? 'entity.unit_id' : 'qrText fallback'));
      if (_buDid) {
        console.log('[QR] routeTo unit-detail:', _buDid);
        routeTo('unit-detail', { unitDisplayId: _buDid });
      } else {
        UI.toast('BUのIDを特定できませんでした。QR: ' + (qrText || ''), 'error', 4000);
      }
    }
    else {
      // entity type 不明またはIDが取得できない
      console.warn('[QR] navigate fallback - entity_type:', res.entity_type, '/ eid:', eid);
      UI.toast('対象が特定できませんでした（タイプ: ' + (res.entity_type || '不明') + '）', 'error');
    }
  }
}

// ── ローカルキャッシュから QR文字列を即解決 ────────────────────
// API呼び出しなし。Store に存在する場合は即返す。
function _qrLocalResolve(v) {
  const parts = (v || '').split(':');
  if (parts.length < 2) return null;
  const prefix = parts[0].toUpperCase();
  const id     = parts.slice(1).join(':').trim();

  if (prefix === 'IND') {
    const ind = Store.getIndividual(id)
      || (Store.getDB('individuals') || []).find(i => i.display_id === id);
    if (!ind) return null;
    const line = Store.getLine(ind.line_id) || {};
    // 最新体重をキャッシュから取得（外部関数依存なし）
    const recs = Store.getGrowthRecords(ind.ind_id) || [];
    const lg   = recs.filter(r => r.weight_g && +r.weight_g > 0).slice(-1)[0] || null;
    return { entity_type: 'IND', entity: ind, line, last_growth: lg, missing: [], label_type: 'ind_fixed' };
  }
  if (prefix === 'LOT') {
    const lot = Store.getLot(id)
      || (Store.getDB('lots') || []).find(l => l.display_id === id);
    if (!lot) return null;
    const line = Store.getLine(lot.line_id) || {};
    const recs = Store.getGrowthRecords(lot.lot_id) || [];
    const lg   = recs.filter(r => r.weight_g && +r.weight_g > 0).slice(-1)[0] || null;
    return { entity_type: 'LOT', entity: lot, line, last_growth: lg, missing: [], label_type: 'multi_lot' };
  }
  if (prefix === 'PAR') {
    const par = (Store.getDB('parents') || []).find(p =>
      p.par_id === id || p.parent_display_id === id
    );
    if (!par) return null;
    return { entity_type: 'PAR', entity: par, line: null, last_growth: null, missing: [], label_type: 'parent' };
  }
  if (prefix === 'SET') {
    const set = (Store.getDB('pairings') || []).find(s => s.set_id === id || s.display_id === id);
    if (!set) return null;
    return { entity_type: 'SET', entity: set, line: null, last_growth: null, missing: [], label_type: 'set' };
  }
  if (prefix === 'BU') {
    // BU: display_id / unit_id どちらでも解決
    var _buUnits = Store.getDB('breeding_units') || [];
    var _buUnit  = _buUnits.find(function(u){ return u.display_id === id; })
                || _buUnits.find(function(u){ return u.unit_id   === id; });
    if (_buUnit) {
      return { entity_type: 'BU', entity: _buUnit, resolved_id: _buUnit.display_id || _buUnit.unit_id };
    }
    // StoreにBUがない場合もQRテキストからIDを保持してstub生成
    // unit-detail がparams.unitDisplayIdで再取得できる
    console.log('[QR] BU not in Store → stub from QR text id:', id);
    return { entity_type: 'BU', entity: { display_id: id, unit_id: id }, resolved_id: id };
  }

  return null;
}

Pages._qrResolve = async function () {
  const _t0 = performance.now();
  const qrText = document.getElementById('qr-input')?.value?.trim();
  const errEl  = document.getElementById('qr-error');
  const btn    = document.getElementById('qr-resolve-btn');
  if (!qrText) { if (errEl) errEl.textContent = 'QRコードを入力してください'; return; }
  if (errEl) errEl.textContent = '';

  console.log('[QR] build:20260408b recognized', qrText, 'at', _t0.toFixed(1), 'ms');

  // ── 現在のスキャンモードを取得 ──
  const mode = window._qrScanMode || 'confirm';

  // ── ① ローカルキャッシュで即解決（APIなし） ──────────────────
  const _t1 = performance.now();
  console.log('[QR] local resolve start');
  const localRes = _qrLocalResolve(qrText);
  const _localMs = (performance.now()-_t1).toFixed(1);
  console.log('[QR] local resolve end', _localMs, 'ms / found:', !!localRes);

  if (localRes) {
    // ローカル解決成功: ボタンを即「画面を開いています...」に切り替えて遷移
    if (btn) { btn.textContent = '📂 画面を開いています...'; }
    Pages._qrSaveHistory(qrText, localRes);
    const _t2 = performance.now();
    console.log('[QR] navigate start (local path) / entity_type:', localRes.entity_type);
    try {
      _qrNavigate(mode, localRes, qrText);
      console.log('[QR] navigate triggered', (performance.now()-_t2).toFixed(1), 'ms');
    } catch (_navErr) {
      console.error('[QR] navigate error (local):', _navErr.message);
      if (errEl) errEl.textContent = '❌ 遷移エラー: ' + (_navErr.message || '不明');
    } finally {
      // 遷移後にボタンを元に戻す（ページが変わらない場合でも操作できるように）
      setTimeout(function() {
        if (btn) { btn.disabled = false; btn.textContent = '🔍 読み取り・確認'; }
      }, 600);
    }
    console.log('[QR] total (local path)', (performance.now()-_t0).toFixed(1), 'ms');
    return;  // API呼び出しなし
  }

  // ── ② ローカルで見つからない場合だけ API へ ──────────────────
  // 300ms 後にローディング表示（即解決できた場合はローディング出さない）
  let _loadingTimer = setTimeout(() => {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 解析中...'; }
  }, 300);
  let _longLoadTimer = setTimeout(() => {
    if (btn) btn.textContent = '⏳ ロット情報を確認中...';
  }, 1200);

  console.log('[QR] API fallback start');
  const _t3 = performance.now();
  try {
    const res = await API.scan.resolve(qrText);
    console.log('[QR] API fallback end', (performance.now()-_t3).toFixed(1), 'ms');
    Pages._qrSaveHistory(qrText, res);
    const _t4 = performance.now();
    console.log('[QR] navigate start (API)');
    _qrNavigate(mode, res, qrText);
    console.log('[QR] navigate triggered', (performance.now()-_t4).toFixed(1), 'ms');
  } catch (e) {
    var _errMsg = (e && e.message) ? e.message : (String(e) !== 'undefined' ? String(e) : 'QR解析に失敗しました');
    console.error('[QR] API error:', _errMsg, '/ qrText:', qrText);
    if (errEl) errEl.textContent = '❌ ' + _errMsg;
  } finally {
    clearTimeout(_loadingTimer);
    clearTimeout(_longLoadTimer);
    if (btn) { btn.disabled = false; btn.textContent = '🔍 読み取り・確認'; }
    console.log('[QR] total (API path)', (performance.now()-_t0).toFixed(1), 'ms');
  }
};

// ── スキャン履歴 ──────────────────────────────────────────────
Pages._qrSaveHistory = function (qrText, res) {
  try {
    const hist = JSON.parse(sessionStorage.getItem('qr_scan_history') || '[]');
    hist.unshift({ qr_text: qrText, entity_type: res.entity_type,
      display_id: res.entity?.display_id || '', scanned_at: new Date().toLocaleTimeString('ja-JP') });
    sessionStorage.setItem('qr_scan_history', JSON.stringify(hist.slice(0, 5)));
  } catch(e) {}
};

Pages._qrRenderHistory = function () {
  const el = document.getElementById('scan-history-card');
  if (!el) return;
  try {
    const hist = JSON.parse(sessionStorage.getItem('qr_scan_history') || '[]');
    if (!hist.length) return;
    el.innerHTML = `<div class="card">
      <div class="card-title">🕑 直近のスキャン</div>
      ${hist.map(h => `
        <div onclick="Pages._qrRescanFromHistory('${h.qr_text}')"
          style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">
          <span style="font-size:.72rem;color:var(--text3);min-width:50px">${h.scanned_at}</span>
          <span style="font-family:var(--font-mono);font-size:.78rem;color:var(--gold);flex:1">${h.display_id || h.qr_text}</span>
          <span style="font-size:.7rem;color:var(--blue)">再スキャン →</span>
        </div>`).join('')}
    </div>`;
  } catch(e) {}
};

Pages._qrRescanFromHistory = function (qrText) {
  const inp = document.getElementById('qr-input');
  if (inp) { inp.value = qrText; Pages._qrPreviewInput(qrText); }
  Pages._qrResolve();
};

// ── カメラスキャン ────────────────────────────────────────────
Pages._qrStartCamera = async function () {
  // jsQR確認（index.htmlで静的ロード済みのはずだが念のため）
  if (typeof jsQR === 'undefined') {
    // jsQR 未ロード: フォールバックCDNから再ロードを試みる
    UI.toast('QRライブラリを読み込み中...', 'info', 3000);
    var _retryUrls = [
      'vendor/jsQR.min.js',
      'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js',
      'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js'
    ];
    var _retryLoad = function(urls, idx) {
      if (idx >= urls.length) {
        UI.toast('QRライブラリの読み込みに失敗しました。ページを再読み込みしてください', 'error');
        return;
      }
      var s = document.createElement('script');
      s.src = urls[idx];
      s.onload  = function() { setTimeout(function() { Pages._qrStartCamera(); }, 300); };
      s.onerror = function() { _retryLoad(urls, idx + 1); };
      document.head.appendChild(s);
    };
    _retryLoad(_retryUrls, 0);
    return;
  }
  const card = document.getElementById('camera-card');
  if (!card) return;

  try {
    // 高解像度でリクエスト（Android最適化）
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
        focusMode: 'continuous',
      }
    });
    const video = document.getElementById('qr-video');
    if (!video) { stream.getTracks().forEach(t=>t.stop()); return; }

    video.srcObject = stream;
    card.style.display = 'block';
    const btn = document.getElementById('camera-btn');
    if (btn) btn.textContent = '📷 スキャン中...';

    video.addEventListener('loadedmetadata', () => { video.play(); }, { once: true });
    Pages._qrScanLoop(video);
  } catch (e) {
    const msg = e.name === 'NotAllowedError'
      ? 'カメラへのアクセスを許可してください（アドレスバー左の🔒→カメラ→許可）'
      : e.name === 'NotFoundError' ? 'カメラが見つかりません' : 'カメラ起動失敗: ' + e.message;
    UI.toast(msg, 'error', 5000);
  }
};

Pages._qrScanLoop = function (video) {
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let frameCount = 0;

  const scan = () => {
    if (!video.srcObject) return;
    frameCount++;
    // 毎フレームではなく3フレームに1回スキャン（負荷軽減）
    if (frameCount % 3 !== 0) { requestAnimationFrame(scan); return; }

    if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // inversionAttemptsを'attemptBoth'にして白地・黒地両対応
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (code && code.data) {
        Pages._qrStopCamera();
        const input = document.getElementById('qr-input');
        if (input) { input.value = code.data; Pages._qrPreviewInput(code.data); }
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        const status = document.getElementById('scan-status');
        if (status) { status.textContent = '✅ 読み取り成功！'; status.style.color = 'var(--green)'; }
        Pages._qrResolve();
        return;
      }
    }
    requestAnimationFrame(scan);
  };
  requestAnimationFrame(scan);
};

Pages._qrStopCamera = function () {
  const video = document.getElementById('qr-video');
  if (video?.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  const card = document.getElementById('camera-card');
  if (card) card.style.display = 'none';
  const btn = document.getElementById('camera-btn');
  if (btn) btn.textContent = '📷 カメラで読み取る';
};

// ── 画像ファイルからQR読み取り ────────────────────────────────
Pages._qrReadFromImage = function (input) {
  const file = input?.files?.[0];
  if (!file) return;
  if (typeof jsQR === 'undefined') { UI.toast('QRライブラリ未ロード', 'error'); return; }

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (code && code.data) {
        const qrInput = document.getElementById('qr-input');
        if (qrInput) { qrInput.value = code.data; Pages._qrPreviewInput(code.data); }
        UI.toast('QRコードを読み取りました', 'success');
        Pages._qrResolve();
      } else {
        UI.toast('QRコードが見つかりませんでした。鮮明な画像を使用してください', 'error', 4000);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  // inputをリセット（同じ画像を再選択できるように）
  input.value = '';
};

Pages.qrDiff = function (params = {}) {
  const res = params.resolve_result;
  if (!res) { routeTo('qr-scan'); return; }

  const main = document.getElementById('main');
  const { entity_type, label_type, entity, missing, line } = res;

  const missingCount = (missing || []).filter(m => m.level === 'required').length;
  const warnCount    = (missing || []).filter(m => m.level === 'warn').length;

  // ラベル種別の表示名
  const LABEL_DISPLAY = {
    egg_lot:   '① 卵管理ラベル',
    multi_lot: '② 複数頭飼育ラベル',
    ind_fixed: '③ 個別飼育ラベル',
    set:       '④ 産卵セットラベル',
  };
  const labelName = LABEL_DISPLAY[label_type] || label_type || entity_type;

  main.innerHTML = `
    ${UI.header('スキャン結果', { back: true, backFn: "routeTo('qr-scan')" })}
    <div class="page-body">

      <!-- ヒーローカード（種別・ID） -->
      <div class="card" style="
        border-color:${missingCount > 0 ? 'rgba(224,144,64,.4)' : 'rgba(76,175,120,.3)'};
        background:${missingCount > 0 ? 'rgba(224,144,64,.04)' : 'rgba(76,175,120,.04)'}">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div style="flex:1">
            <div style="font-size:.72rem;color:var(--text3);margin-bottom:3px">${labelName}</div>
            <div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;color:var(--gold)">
              ${entity?.display_id || '—'}
            </div>
            ${line ? `<div style="font-size:.75rem;color:var(--text2);margin-top:2px">
              ライン: ${line.display_id}${line.line_name ? ' / ' + line.line_name : ''}
            </div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            ${missingCount > 0
              ? `<div style="background:rgba(224,144,64,.15);border:1px solid rgba(224,144,64,.4);
                  border-radius:99px;padding:4px 10px;font-size:.78rem;color:var(--amber)">
                  ⚠️ ${missingCount}件 未入力
                </div>`
              : `<div style="background:rgba(76,175,120,.15);border:1px solid rgba(76,175,120,.3);
                  border-radius:99px;padding:4px 10px;font-size:.78rem;color:var(--green)">
                  ✅ 入力済み
                </div>`}
            ${warnCount > 0 ? `<div style="font-size:.68rem;color:var(--text3);margin-top:4px">推奨: ${warnCount}件</div>` : ''}
          </div>
        </div>
      </div>

      <!-- 未入力項目セクション（missingCount > 0 のときのみ表示） -->
      ${missingCount > 0 ? Pages._qrRenderMissingSection(entity_type, entity, missing, label_type) : ''}

      <!-- 推奨入力（warn） -->
      ${warnCount > 0 ? Pages._qrRenderWarnSection(entity_type, entity, missing.filter(m => m.level === 'warn'), label_type) : ''}

      <!-- 既存情報確認 -->
      ${Pages._qrRenderInfoSection(entity_type, entity, line)}

      <!-- 保存ボタン -->
      <div style="display:flex;gap:10px;padding-bottom:8px">
        <button class="btn btn-ghost" style="flex:1" onclick="routeTo('qr-scan')">戻る</button>
        <button class="btn btn-gold" style="flex:2" id="diff-save-btn"
          onclick="Pages._qrDiffSave('${entity_type}', '${entity?.lot_id || entity?.ind_id || entity?.set_id || ''}')">
          💾 保存する
        </button>
      </div>

    </div>`;
};

// ── 未入力セクション（required） ─────────────────────────────
Pages._qrRenderMissingSection = function (entityType, entity, missing, labelType) {
  const requiredFields = missing.filter(m => m.level === 'required');
  if (!requiredFields.length) return '';

  return `
    <div class="card" style="border-color:rgba(224,144,64,.45);background:rgba(224,144,64,.04)">
      <div class="card-title" style="color:var(--amber)">⚠️ 未入力項目（必須）</div>
      <div class="form-section" id="missing-fields-form">
        ${requiredFields.map(f => Pages._qrRenderFieldInput(entityType, entity, f, labelType, 'required')).join('')}
      </div>
    </div>`;
};

// ── 推奨入力セクション（warn） ────────────────────────────────
Pages._qrRenderWarnSection = function (entityType, entity, warnFields, labelType) {
  if (!warnFields.length) return '';
  return `
    <div class="card" style="border-color:rgba(91,168,232,.2)">
      <div class="card-title" style="color:var(--blue)">📝 推奨入力</div>
      <div class="form-section" id="warn-fields-form">
        ${warnFields.map(f => Pages._qrRenderFieldInput(entityType, entity, f, labelType, 'warn')).join('')}
      </div>
    </div>`;
};

// ── フィールド別入力ウィジェット ──────────────────────────────
Pages._qrRenderFieldInput = function (entityType, entity, missingField, labelType, level) {
  const { field, label, hint, current_value } = missingField;
  const borderColor = level === 'required' ? 'rgba(224,144,64,.4)' : 'rgba(91,168,232,.25)';
  const bg          = level === 'required' ? 'rgba(224,144,64,.06)' : 'rgba(91,168,232,.04)';
  const icon        = level === 'required' ? '⚠️' : '📝';

  // フィールド別のウィジェット
  const widget = Pages._qrFieldWidget(field, label, current_value, entityType, entity);

  return `
    <div style="border:1px solid ${borderColor};border-radius:var(--radius-sm);
      padding:12px;background:${bg}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span style="font-size:.9rem">${icon}</span>
        <span style="font-size:.82rem;font-weight:700;color:var(--text2)">${label}</span>
        ${hint ? `<span style="font-size:.7rem;color:var(--text3);margin-left:auto">${hint}</span>` : ''}
      </div>
      ${widget}
    </div>`;
};

// ── フィールド別ウィジェット定義 ──────────────────────────────
Pages._qrFieldWidget = function (field, label, currentVal, entityType, entity) {
  // ── 性別（IND / sex_hint） ──────────────────────────────────
  if (field === 'sex' || field === 'sex_hint') {
    const isInd  = entityType === 'IND';
    const opts   = isInd
      ? [['♂', '♂ オス'], ['♀', '♀ メス'], ['不明', '不明']]
      : [['♂', '♂ 多め'], ['♀', '♀ 多め'], ['混合', '混合'], ['不明', '不明']];
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap" id="widget-${field}">
        ${opts.map(([v, lbl]) => `
          <button class="btn btn-sm btn-ghost diff-choice"
            data-field="${field}" data-value="${v}"
            style="flex:1;min-width:60px;${currentVal === v ? 'background:var(--green2);color:#fff;border-color:var(--green2)' : ''}"
            onclick="Pages._qrChoiceSelect(this)">
            ${lbl}
          </button>`).join('')}
      </div>`;
  }

  // ── サイズ区分 ──────────────────────────────────────────────
  if (field === 'size_category') {
    return `
      <div style="display:flex;gap:8px" id="widget-${field}">
        ${[['大','大型（10L）'],['中','中型（4.8L）'],['小','小型（2.7L）']].map(([v, lbl]) => `
          <button class="btn btn-sm btn-ghost diff-choice"
            data-field="${field}" data-value="${v}"
            style="flex:1;${currentVal === v ? 'background:var(--green2);color:#fff;border-color:var(--green2)' : ''}"
            onclick="Pages._qrChoiceSelect(this)">
            ${lbl}
          </button>`).join('')}
      </div>`;
  }

  // ── 孵化日 ──────────────────────────────────────────────────
  if (field === 'hatch_date') {
    return `
      <input id="widget-hatch_date" class="input" type="date"
        value="${currentVal || ''}"
        data-field="hatch_date"
        style="border-color:rgba(224,144,64,.4)">`;
  }

  // ── 頭数 ────────────────────────────────────────────────────
  if (field === 'count') {
    return `
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="Pages._qrCountAdj(-1)">−</button>
        <input id="widget-count" class="input" type="number" min="0" max="999"
          value="${currentVal || entity?.count || ''}"
          data-field="count"
          style="text-align:center;font-size:1.3rem;font-weight:700;color:var(--green);font-family:var(--font-mono);border-color:rgba(224,144,64,.4)">
        <span style="color:var(--text3)">頭</span>
        <button class="btn btn-ghost btn-sm" onclick="Pages._qrCountAdj(1)">＋</button>
      </div>`;
  }

  // ── 産卵セット開始日 ────────────────────────────────────────
  if (field === 'set_start') {
    return `
      <input id="widget-set_start" class="input" type="date"
        value="${currentVal || ''}"
        data-field="set_start">`;
  }

  // ── デフォルト: テキスト入力 ────────────────────────────────
  return `
    <input id="widget-${field}" class="input" type="text"
      value="${currentVal || ''}"
      placeholder="${label}を入力"
      data-field="${field}">`;
};

// ── 選択ボタンのトグル処理 ───────────────────────────────────
Pages._qrChoiceSelect = function (btn) {
  const field = btn.dataset.field;
  // 同一フィールドの他ボタンをリセット
  document.querySelectorAll(`.diff-choice[data-field="${field}"]`).forEach(b => {
    b.style.background = '';
    b.style.color = '';
    b.style.borderColor = '';
  });
  // 選択状態に
  btn.style.background   = 'var(--green2)';
  btn.style.color        = '#fff';
  btn.style.borderColor  = 'var(--green2)';
};

// ── 頭数 ±ボタン ─────────────────────────────────────────────
Pages._qrCountAdj = function (delta) {
  const el = document.getElementById('widget-count');
  if (!el) return;
  const cur = parseInt(el.value) || 0;
  el.value = Math.max(0, cur + delta);
};

// ── 既存情報確認セクション ───────────────────────────────────
Pages._qrRenderInfoSection = function (entityType, entity, line) {
  if (!entity) return '';

  let rows = [];

  if (entityType === 'LOT') {
    rows = [
      ['ロットID',     entity.display_id],
      ['ライン',       line?.display_id || entity.line_id || '—'],
      ['ステージ',     entity.stage || '—'],
      ['孵化日',       entity.hatch_date || '（未入力）'],
      ['頭数',         entity.count || '（未入力）'],
      ['容器サイズ',   entity.container_size || '—'],
      ['性別区分',     entity.sex_hint || '（未入力）'],
      ['サイズ区分',   entity.size_category || '（未入力）'],
      ['マット種別',   entity.mat_type || '—'],
    ];
  } else if (entityType === 'IND') {
    rows = [
      ['個体ID',       entity.display_id],
      ['ライン',       line?.display_id || entity.line_id || '—'],
      ['性別',         entity.sex || '（未入力）'],
      ['孵化日',       entity.hatch_date || '（未入力）'],
      ['現ステージ',   entity.current_stage || '—'],
      ['最新体重',     entity.latest_weight_g ? entity.latest_weight_g + 'g' : '—'],
      ['産地',         entity.locality || '—'],
      ['世代',         entity.generation || '—'],
    ];
  } else if (entityType === 'SET') {
    rows = [
      ['セットID',     entity.display_id],
      ['交尾開始',     entity.pairing_start || '—'],
      ['産卵開始',     entity.set_start || '（未入力）'],
      ['採卵数',       entity.total_eggs ? entity.total_eggs + '個' : '（未入力）'],
      ['孵化数',       entity.total_hatch ? entity.total_hatch + '頭' : '—'],
      ['孵化率',       entity.hatch_rate ? Math.round(entity.hatch_rate) + '%' : '—'],
      ['ステータス',   entity.status || '—'],
    ];
  }

  return `
    <div class="card">
      <div class="card-title">📋 確認情報</div>
      <div class="info-list">
        ${rows.map(([k, v]) => {
          const isEmpty = !v || v === '—' || v.includes('未入力');
          return `<div class="info-row">
            <span class="info-key">${k}</span>
            <span class="info-val" style="${isEmpty ? 'color:var(--text3)' : ''}">${v}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
};

// ── 差分保存処理 ─────────────────────────────────────────────
Pages._qrDiffSave = async function (entityType, entityId) {
  const btn = document.getElementById('diff-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 保存中...'; }

  try {
    // フォーム内の全入力値を収集
    const updates = {};

    // 選択ボタン（diff-choice）
    document.querySelectorAll('.diff-choice[style*="green2"]').forEach(b => {
      updates[b.dataset.field] = b.dataset.value;
    });

    // テキスト/日付/数値 input
    document.querySelectorAll('[data-field]').forEach(el => {
      if (el.tagName !== 'BUTTON' && el.value !== undefined && el.value !== '') {
        updates[el.dataset.field] = el.value;
      }
    });

    if (Object.keys(updates).length === 0) {
      UI.toast('更新する項目がありません', 'info');
      return;
    }

    // entity typeによって更新 API を選択
    let result;
    if (entityType === 'LOT') {
      result = await API.scan.updateLotFields({ lot_id: entityId, ...updates });
    } else if (entityType === 'IND') {
      result = await API.scan.updateIndFields({ ind_id: entityId, ...updates });
    } else if (entityType === 'SET') {
      result = await API.scan.updateSetFields({ set_id: entityId, ...updates });
    }

    // DBキャッシュを更新
    await Store.syncEntityType(entityType === 'LOT' ? 'lots'
      : entityType === 'IND' ? 'individuals' : 'pairings');

    UI.toast(`✅ 保存しました（${Object.keys(updates).length}件更新）`, 'success');

    // 完了後 → 詳細画面へ遷移
    setTimeout(() => {
      if (entityType === 'LOT')      routeTo('lot-detail',     { lotId: entityId });
      else if (entityType === 'IND') routeTo('ind-detail',     { indId: entityId });
      else if (entityType === 'SET') routeTo('pairing-detail', { pairingId: entityId });
    }, 1000);

  } catch (e) {
    UI.toast('❌ 保存失敗: ' + (e.message || '不明なエラー'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 保存する'; }
  }
};

// ════════════════════════════════════════════════════════════════
// 体重測定モード (weight-mode)
//
// 【モジュール構造】
//   Pages.weightMode  … 画面レンダリング（エントリーポイント）
//   Pages.wmScan      … QRスキャン入力部（weight-modeから直接QR入力する場合）
//   Pages._wmUpdateDelta … 体重入力のリアルタイム前回比・閾値バッジ更新
//   Pages._wmSave     … 成長記録保存（createGrowthRecord → GROWTHテーブル）
//   Pages._wmShowComplete … 保存完了後の「次をスキャン」/「詳細を見る」表示
//
// 【3タップフロー】
//   Tap1: qr-scan画面で「体重測定モード」タブ選択 → QRテキスト貼付 → 「確定」
//   Tap2: 体重数値を入力（フォーカス自動）
//   Tap3: 「成長記録を保存」ボタン
//
// 【体重閾値バッジ】
//   150g以上: 🔥 大型候補
//   170g以上: ⭐ 超大型候補
//
// 【将来拡張ポイント】
//   Phase2: Pages._wmPhotoSection() — 写真撮影・プレビュー追加
//   Phase3: Pages._wmAiComment()    — Gemini Vision でAIコメント自動生成
//   Phase4: セッションモード       — 複数個体の連続スキャンと集計
// ════════════════════════════════════════════════════════════════

// ── 体重閾値定義（将来的に設定画面から変更可能にする拡張ポイント）──
const WM_THRESHOLDS = [
  { min: 170, badge: '⭐ 超大型候補', color: '#c8a84b', bg: 'rgba(200,168,75,.15)' },
  { min: 150, badge: '🔥 大型候補',   color: 'var(--amber)', bg: 'rgba(224,144,64,.12)' },
];

/**
 * Pages.weightMode — 体重測定画面のメインレンダラ
 * params.resolve_result: resolveQR のレスポンス（必須）
 * qr-scan 画面から growth-rec へリダイレクト（weight-mode は薄いラッパー）
 */
// ── weightMode / t1 / t2 は growth-rec への薄いラッパー ─────────
// UI本体は growth.js が担う。ここでは確実に growth-rec へ転送するのみ。

Pages.weightMode = function (params) {
  var p   = params || {};
  var res = p.resolve_result;
  var ent = (res && res.entity) || {};
  var eid = ent.ind_id || ent.lot_id || '';
  var ety = (res && res.entity_type) || 'IND';
  if (eid) {
    routeTo('growth-rec', { targetType: ety, targetId: eid, displayId: ent.display_id || eid });
  } else {
    routeTo('qr-scan');
  }
};

Pages._wmState   = {};
Pages._wmSave    = function () { UI.toast('growth-rec で保存してください', 'info'); };
Pages._wmAdjWeight   = function () {};
Pages._wmUpdateDelta = function () {};
Pages._wmCalcAttrition = function () {};
Pages._wmShowComplete  = function () {};
Pages._wmToggleExtra   = function () {};
Pages._wmApplyPreset   = function () {};
Pages._wmBtnSel        = function () {};
Pages._wmBtnSelMat     = function () {};
Pages._wmOnMatChange   = function () {};
Pages._wmAdjStart      = function () {};
Pages._wmAdjStop       = function () {};
Pages._wmShowPendingPanel = function () {};

Pages.qrScanT1 = function () {
  const main = document.getElementById('main');
  let _processing = false;
  let _lastLot    = null;

  function _render(lotInfo, phase) {
    // phase: 'scan' | 'split' | 'done'
    main.innerHTML = `
      ${UI.header('T1交換 連続処理', { back: true })}
      <div class="page-body">

        <!-- 進捗インジケーター -->
        <div style="display:flex;gap:4px;margin-bottom:12px">
          ${['スキャン','分割入力','完了'].map((s,i) => {
            const active = (i===0&&phase==='scan')||(i===1&&phase==='split')||(i===2&&phase==='done');
            return `<div style="flex:1;padding:6px;text-align:center;border-radius:8px;font-size:.75rem;
              background:${active?'var(--green)':'var(--bg2)'};color:${active?'#fff':'var(--text3)'}">${s}</div>`;
          }).join('')}
        </div>

        ${phase === 'scan' ? _scanPhase() : ''}
        ${phase === 'split' && lotInfo ? _splitPhase(lotInfo) : ''}
        ${phase === 'done'  && lotInfo ? _donePhase(lotInfo)  : ''}

      </div>`;

    if (phase === 'scan') _bindScanEvents();
  }

  function _scanPhase() {
    return `
      <div class="card card-gold" style="text-align:center;padding:20px">
        <div style="font-size:2rem;margin-bottom:8px">📷</div>
        <div style="font-weight:700;margin-bottom:4px">QRコードをスキャン</div>
        <div style="font-size:.8rem;color:var(--text3)">ロットQRコードを読み込んでください</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <input id="t1-qr-input" class="input" placeholder="QR入力 / 手動入力" style="flex:1">
        <button class="btn btn-primary" onclick="Pages._t1ResolveQR()">確認</button>
      </div>
      <button class="btn btn-ghost btn-full" style="margin-top:8px"
        onclick="Pages._t1StartCamera()">📷 カメラで読み取り</button>`;
  }

  function _splitPhase(lot) {
    const count = parseInt(lot.count, 10) || 1;
    const half  = Math.floor(count / 2);
    return `
      <div class="card" style="background:var(--bg2)">
        <div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--gold)">${lot.display_id}</div>
        <div style="font-size:.85rem;color:var(--text3);margin-top:4px">
          ${lot.stage || 'T0'} / ${count}頭 / ${lot.container_size||'—'}
        </div>
      </div>

      <div style="margin-top:12px">
        <div style="font-size:.85rem;font-weight:600;margin-bottom:8px">分割数を入力してください（合計 ≤ ${count}頭）</div>
        <div id="t1-split-rows">
          <div class="split-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <span style="font-family:var(--font-mono);color:var(--gold);min-width:30px">-A</span>
            <input type="number" class="input t1-split-count" min="1" max="${count}" value="${half}"
              oninput="Pages._t1UpdateTotal(${count})">
            <span style="font-size:.8rem;color:var(--text3)">頭</span>
          </div>
          <div class="split-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <span style="font-family:var(--font-mono);color:var(--gold);min-width:30px">-B</span>
            <input type="number" class="input t1-split-count" min="1" max="${count}" value="${count-half}"
              oninput="Pages._t1UpdateTotal(${count})">
            <span style="font-size:.8rem;color:var(--text3)">頭</span>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="Pages._t1AddSplitRow(${count})">＋ ロット追加</button>
        <div id="t1-split-total" style="font-size:.82rem;color:var(--amber);margin-top:6px">
          合計: ${count}頭 / 最大${count}頭
        </div>
      </div>

      <div style="margin-top:12px">
        <div style="font-size:.85rem;font-weight:600;margin-bottom:6px">容器サイズ</div>
        <div style="display:flex;gap:6px">
          ${['1.1L','2.7L','4.8L','10L'].map(s =>
            `<button class="pill ${s===lot.container_size?'active':''}" id="t1-container-${s.replace('.','_')}"
              onclick="Pages._t1SelectContainer('${s}')">${s}</button>`
          ).join('')}
        </div>
        <input type="hidden" id="t1-selected-container" value="${lot.container_size||'2.7L'}">
      </div>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-ghost" style="flex:1" onclick="Pages.qrScanT1()">← 戻る</button>
        <button class="btn btn-primary" style="flex:2"
          onclick="Pages._t1ExecSplit('${lot.lot_id}',${count})">✅ 分割実行</button>
      </div>`;
  }

  function _donePhase(result) {
    const newLots = result.new_lots || [];
    return `
      <div class="card" style="text-align:center;padding:16px;border-color:var(--green)">
        <div style="font-size:2rem">✅</div>
        <div style="font-weight:700;margin-top:8px">${newLots.length}ロットに分割しました</div>
      </div>

      <div style="margin-top:8px">
        ${newLots.map(l => `
          <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px">
            <div>
              <div style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">${l.display_id}</div>
              <div style="font-size:.8rem;color:var(--text3)">${l.count}頭 / T1</div>
            </div>
            <button class="btn btn-ghost btn-sm"
              onclick="Pages._t1GenerateLabel('${l.lot_id}','${l.display_id}')">🏷 ラベル</button>
          </div>`).join('')}
      </div>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('lot-list')">ロット一覧</button>
        <button class="btn btn-primary" style="flex:2"
          onclick="Pages.qrScanT1()">📷 次のQRへ</button>
      </div>`;
  }

  function _bindScanEvents() {
    const inp = document.getElementById('t1-qr-input');
    if (inp) inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') Pages._t1ResolveQR();
    });
  }

  // 最初のフェーズで描画
  _render(null, 'scan');
  // メソッドをPageに露出（クロージャー外からも再描画できるよう）
  Pages._t1RenderSplit = (lot)  => _render(lot,    'split');
  Pages._t1RenderDone  = (res)  => _render(res,    'done');
};

// ── T1: QR解決 ────────────────────────────────────────────────
Pages._t1ResolveQR = async function () {
  const val = (document.getElementById('t1-qr-input')?.value || '').trim();
  if (!val) { UI.toast('QRを入力してください', 'error'); return; }

  try {
    UI.loading(true);
    // lot_id または display_id で検索
    const lots = Store.getDB('lots') || [];
    let lot = lots.find(l => l.lot_id === val || l.display_id === val);

    if (!lot) {
      // Storeにない場合はAPI経由
      const res = await API.lot.get({ lot_id: val });
      lot = res.lot;
    }
    if (!lot) { UI.toast('ロットが見つかりません: ' + val, 'error'); return; }
    if (lot.status === 'dissolved') { UI.toast('このロットは分割済みです', 'error'); return; }

    Pages._t1RenderSplit(lot);
  } catch(e) {
    UI.toast('エラー: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ── T1: 合計更新 ──────────────────────────────────────────────
Pages._t1UpdateTotal = function (max) {
  const inputs = document.querySelectorAll('.t1-split-count');
  const total  = Array.from(inputs).reduce((s,i) => s + (+i.value||0), 0);
  const el     = document.getElementById('t1-split-total');
  if (el) {
    el.textContent = `合計: ${total}頭 / 最大${max}頭`;
    el.style.color = total > max ? 'var(--red)' : 'var(--text3)';
  }
};

// ── T1: 行追加 ────────────────────────────────────────────────
Pages._t1AddSplitRow = function (max) {
  const rows   = document.getElementById('t1-split-rows');
  if (!rows) return;
  const count  = rows.querySelectorAll('.split-row').length;
  const suffix = String.fromCharCode(65 + count);
  rows.insertAdjacentHTML('beforeend', `
    <div class="split-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <span style="font-family:var(--font-mono);color:var(--gold);min-width:30px">-${suffix}</span>
      <input type="number" class="input t1-split-count" min="1" max="${max}" value="1"
        oninput="Pages._t1UpdateTotal(${max})">
      <span style="font-size:.8rem;color:var(--text3)">頭</span>
    </div>`);
  Pages._t1UpdateTotal(max);
};

// ── T1: 容器選択 ──────────────────────────────────────────────
Pages._t1SelectContainer = function (size) {
  document.querySelectorAll('[id^="t1-container-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('t1-container-' + size.replace('.','_'));
  if (btn) btn.classList.add('active');
  const inp = document.getElementById('t1-selected-container');
  if (inp) inp.value = size;
};

// ── T1: 分割実行 ──────────────────────────────────────────────
Pages._t1ExecSplit = async function (lotId, maxCount) {
  const inputs    = document.querySelectorAll('.t1-split-count');
  const counts    = Array.from(inputs).map(i => +i.value||0).filter(n => n > 0);
  const total     = counts.reduce((s,n) => s+n, 0);
  const container = document.getElementById('t1-selected-container')?.value || '2.7L';

  if (!counts.length) { UI.toast('分割数を入力してください', 'error'); return; }
  if (total > maxCount) { UI.toast(`合計(${total})が元ロット頭数(${maxCount})を超えています`, 'error'); return; }

  try {
    UI.loading(true);
    const res = await API.lot.split({
      lot_id:        lotId,
      split_counts:  counts,
      stage:         'T1',
      container_size: container,
    });
    await syncAll(true);
    Pages._t1RenderDone(res);
  } catch(e) {
    UI.toast('分割失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ── T1: ラベル発行 ────────────────────────────────────────────
Pages._t1GenerateLabel = async function (lotId, displayId) {
  try {
    UI.loading(true);
    await API.label.generate('LOT', lotId, 'larva');
    UI.toast(`${displayId} のラベルを発行しました`);
  } catch(e) {
    UI.toast('ラベル発行失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ── T1: カメラスキャン ────────────────────────────────────────
Pages._t1StartCamera = async function () {
  // 既存の_qrStartCameraロジックを流用してT1モードで動作
  routeTo('qr-scan', { mode: 't1' });
};

// ルーティング登録
window.PAGES['qr-scan-t1'] = () => Pages.qrScanT1();

// weight-mode / t1-weight / t2-weight は growth-rec への薄いラッパー
window.PAGES['weight-mode'] = () => {
  const p = Store.getParams(), res = p.resolve_result, ent = (res && res.entity) || {};
  const eid = ent.ind_id || ent.lot_id || '', ety = (res && res.entity_type) || 'IND';
  eid ? routeTo('growth-rec', { targetType:ety, targetId:eid, displayId:ent.display_id||eid })
      : routeTo('qr-scan');
};
window.PAGES['t1-weight'] = () => {
  const p = Store.getParams(), ent = ((p.resolve_result||{}).entity)||{}, eid = ent.lot_id||'';
  eid ? routeTo('growth-rec', { targetType:'LOT', targetId:eid, displayId:ent.display_id||eid, _preset:'t1' })
      : routeTo('qr-scan', { mode:'weight' });
};
window.PAGES['t2-weight'] = () => {
  const p = Store.getParams(), ent = ((p.resolve_result||{}).entity)||{}, eid = ent.lot_id||'';
  eid ? routeTo('growth-rec', { targetType:'LOT', targetId:eid, displayId:ent.display_id||eid, _preset:'t2' })
      : routeTo('qr-scan', { mode:'weight' });
};


// ────────────────────────────────────────────────────────────────
// FILE: js/pages/sale.js
// ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// sale.js v2 — 販売履歴一覧
// 修正: 追加取得失敗時に全画面エラーにしない。キャッシュ表示を維持。
// ════════════════════════════════════════════════════════════════
'use strict';

function _saleCleanDisplay(raw) {
  if (!raw) return '—';
  var s = String(raw).trim();
  if (/^(IND|LOT|PAR)-/i.test(s)) s = s.replace(/^(IND|LOT|PAR)-/i, '');
  if (/^[0-9a-f]{8,}$/i.test(s)) return '—';
  return s || '—';
}

Pages.saleList = async function () {
  var main = document.getElementById('main');
  console.log('[SALE_LIST] ===== saleList start =====');
  console.log('[SALE_LIST] __INDEX_BUILD :', window.__INDEX_BUILD || '(not set)');
  console.log('[SALE_LIST] __API_BUILD   :', window.__API_BUILD   || '(not set)');
  console.log('[SALE_LIST] CONFIG.GAS_URL:', (window.CONFIG && window.CONFIG.GAS_URL || '').slice(0, 80) || '(unset)');

  var cachedHists = [];
  try { cachedHists = Store.getDB('sale_hists') || Store.getDB('sale_histories') || []; } catch(_e) {}

  if (cachedHists.length > 0) {
    console.log('[SALE_LIST] cached data exists:', cachedHists.length, 'records');
    _renderSaleList(main, cachedHists, _calcTotalRevenue(cachedHists));
  } else {
    console.log('[SALE_LIST] no cache - showing spinner');
    main.innerHTML = UI.header('販売履歴', {}) + UI.spinner();
  }

  try {
    if (!API || !API.sale || typeof API.sale.list !== 'function') {
      throw new Error('API.sale.list が未定義');
    }
    console.log('[SALE_LIST] fetch start - action: getSaleHists');
    var res = await API.sale.list({});
    if (Store.getPage() !== 'sale-list') return;
    console.log('[SALE_LIST] fetch success:', (res.hists || []).length, 'records');
    var hists = res.hists || [];
    _renderSaleList(main, hists, res.total_revenue || _calcTotalRevenue(hists));
  } catch (e) {
    console.error('[SALE_LIST] fetch failed:', e.message);
    if (Store.getPage() !== 'sale-list') return;
    if (cachedHists.length > 0) {
      // キャッシュ表示を維持しつつ warning バナーを差し込む
      var pb = main.querySelector('.page-body');
      if (pb && !document.getElementById('sale-warn-banner')) {
        var b = document.createElement('div');
        b.id = 'sale-warn-banner';
        b.style.cssText = 'background:rgba(224,144,64,.1);border:1px solid rgba(224,144,64,.4);'
          + 'border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:.78rem';
        b.innerHTML = '<b style="color:var(--amber)">⚠️ 最新データの取得に失敗しました</b>'
          + '<div style="color:var(--text2);margin-top:3px">表示はキャッシュです。再読み込みをお試しください。</div>'
          + '<div style="font-size:.68rem;color:var(--text3);margin-top:2px">' + e.message.slice(0, 80) + '</div>'
          + '<button class="btn btn-ghost btn-sm" style="margin-top:6px"'
          + ' onclick="Pages.saleList()">🔄 再試行</button>';
        pb.insertBefore(b, pb.firstChild);
      }
    } else {
      main.innerHTML = UI.header('販売履歴', {})
        + '<div class="page-body">'
        + '<div style="background:rgba(224,80,80,.08);border:1px solid rgba(224,80,80,.3);'
        + 'border-radius:10px;padding:14px;font-size:.82rem">'
        + '<div style="font-weight:700;color:var(--red,#e05050);margin-bottom:6px">⚠️ 販売履歴の取得に失敗しました</div>'
        + '<div>' + e.message + '</div>'
        + '<div style="font-size:.72rem;color:var(--text3);margin-top:6px">設定画面のGAS URLとデプロイ状態を確認してください。</div>'
        + '<button class="btn btn-ghost btn-sm" style="margin-top:10px"'
        + ' onclick="Pages.saleList()">🔄 再試行</button>'
        + '</div>'
        + UI.empty('データを取得できませんでした')
        + '</div>';
    }
  }
};

function _calcTotalRevenue(hists) {
  return hists.reduce(function(s, h) { return s + (parseFloat(h.actual_price) || 0); }, 0);
}

function _renderSaleList(main, hists, totalRevenue) {
  var filterChannel = '';
  var filterKeyword = '';
  var filterType    = '';
  var CHANNELS = ['ヤフオク', 'イベント', '直接', 'その他'];

  window.__saleHistCache = {};
  hists.forEach(function(h) {
    var key = h.hist_id || h.id || h.sale_id || '';
    if (key) window.__saleHistCache[key] = h;
  });

  function filtered() {
    return hists.filter(function(h) {
      if (filterChannel && h.platform !== filterChannel) return false;
      if (filterType && (h.target_type || 'IND') !== filterType) return false;
      if (filterKeyword) {
        var kw = filterKeyword.toLowerCase();
        var st = [h.display_id, h.ind_display_id, h.target_id, h.ind_id, h.buyer_name, h.platform]
          .filter(Boolean).join(' ').toLowerCase();
        if (st.indexOf(kw) === -1) return false;
      }
      return true;
    });
  }

  function pill(label, isActive, fn, arg) {
    return '<button class="pill ' + (isActive ? 'active' : '') + '"'
      + ' onclick="' + fn + '(\'' + arg + '\')">' + label + '</button>';
  }

  function render() {
    var list     = filtered();
    var subtotal = list.reduce(function(s, h) { return s + (parseFloat(h.actual_price) || 0); }, 0);
    var lotCount = hists.filter(function(h) { return (h.target_type || 'IND') === 'LOT'; }).length;

    main.innerHTML = UI.header('販売履歴', {})
      + '<div class="page-body">'

      + '<div class="card card-gold">'
      + '<div class="kpi-grid" style="grid-template-columns:1fr 1fr 1fr">'
      + '<div class="kpi-card"><div class="kpi-value">' + hists.length + '</div><div class="kpi-label">総件数</div></div>'
      + '<div class="kpi-card"><div class="kpi-value" style="font-size:1.1rem">¥' + totalRevenue.toLocaleString() + '</div><div class="kpi-label">総売上</div></div>'
      + '<div class="kpi-card"><div class="kpi-value">' + lotCount + '</div><div class="kpi-label">ロット販売</div></div>'
      + '</div>'
      + ((filterChannel || filterKeyword || filterType)
          ? '<div style="font-size:.72rem;color:var(--text3);margin-top:8px;text-align:center">フィルタ中: '
            + list.length + '件 / ¥' + subtotal.toLocaleString() + '</div>'
          : '')
      + '</div>'

      + '<div class="card">'
      + '<input type="text" id="sale-search" class="input" placeholder="🔍 ID / 購入者名で検索"'
      + ' value="' + filterKeyword + '" oninput="Pages._saleSearch(this.value)">'
      + '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'
      + pill('すべて', !filterType,           'Pages._saleType', '')
      + pill('個体',   filterType === 'IND',  'Pages._saleType', 'IND')
      + pill('ロット', filterType === 'LOT',  'Pages._saleType', 'LOT')
      + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">'
      + pill('すべて', !filterChannel, 'Pages._saleChan', '')
      + CHANNELS.map(function(c) { return pill(c, filterChannel === c, 'Pages._saleChan', c); }).join('')
      + '</div>'
      + '</div>'

      + (list.length === 0
          ? UI.empty('該当する販売履歴がありません')
          : list.map(function(h) { return _saleCard(h); }).join(''))

      + '</div>';

    Pages._saleSearch = function(v) { filterKeyword = v; render(); };
    Pages._saleChan   = function(v) { filterChannel = v; render(); };
    Pages._saleType   = function(v) { filterType    = v; render(); };
  }

  render();
}

function _normalizeSaleHist(raw) {
  return {
    histId:    raw.hist_id   || raw.id       || raw.sale_id    || '',
    targetType:raw.target_type || 'IND',
    indId:     raw.ind_id    || (raw.target_type !== 'LOT' ? (raw.target_id || '') : ''),
    lotId:     raw.lot_id    || (raw.target_type === 'LOT' ? (raw.target_id || '') : ''),
    displayId: raw.display_id || raw.ind_display_id || raw.lot_display_id || '',
    soldAt:    raw.sold_at   || raw.sold_date || raw.date    || '',
    price:     raw.actual_price || raw.price  || '',
    platform:  raw.platform  || raw.channel   || '',
    buyerName: raw.buyer_name || raw.customer_name || '',
    buyerNote: raw.buyer_note || '',
    soldCount: raw.sold_count || '1',
  };
}

function _saleCard(h) {
  var n = _normalizeSaleHist(h);
  var tt        = n.targetType;
  var dispName  = _saleCleanDisplay(n.displayId);
  var typeLabel = tt === 'LOT' ? 'ロット' : '個体';
  var typeColor = tt === 'LOT' ? '#ff9800' : '#2196f3';
  var soldCount = parseInt(n.soldCount || '1', 10);
  var countLbl  = tt === 'LOT' && soldCount > 1 ? soldCount + '頭' : '';
  var price     = n.price ? '¥' + parseFloat(n.price).toLocaleString() : '—';
  var platform  = n.platform || '—';
  var buyer     = n.buyerName || '—';
  var note      = n.buyerNote || '';
  var date      = n.soldAt || '—';
  var chanColor = {'ヤフオク':'#9c27b0','メルカリ':'#e91e63','イベント':'#ff9800','直接':'#4caf50','その他':'#607d8b'};
  var cc = chanColor[platform] || '#607d8b';
  var detailFn = tt === 'LOT' && n.lotId
    ? "routeTo('lot-detail',{lotId:'" + n.lotId + "'})"
    : n.indId ? "routeTo('ind-detail',{indId:'" + n.indId + "'})" : '';

  return '<div class="card" style="margin-bottom:8px">'
    + '<div style="display:flex;align-items:flex-start;gap:10px">'
    + '<div style="flex:1;min-width:0">'
    + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap">'
    + '<span style="font-family:var(--font-mono);font-size:.85rem;font-weight:700;color:var(--gold)">' + dispName + '</span>'
    + (countLbl ? '<span style="font-size:.72rem;color:var(--amber)">' + countLbl + '</span>' : '')
    + '<span style="font-size:.68rem;padding:1px 7px;border-radius:8px;font-weight:700;'
    + 'background:' + typeColor + '22;color:' + typeColor + ';border:1px solid ' + typeColor + '44">' + typeLabel + '</span>'
    + '<span style="font-size:.68rem;color:var(--text3)">' + date + '</span>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'
    + '<span style="font-size:1.1rem;font-weight:800;color:var(--green)">' + price + '</span>'
    + '<span style="font-size:.7rem;padding:2px 8px;border-radius:10px;font-weight:700;'
    + 'background:' + cc + '22;color:' + cc + ';border:1px solid ' + cc + '44">' + platform + '</span>'
    + '</div>'
    + '<div style="font-size:.8rem;color:var(--text2)">購入者: ' + buyer + '</div>'
    + (note ? '<div style="font-size:.72rem;color:var(--text3);margin-top:2px">' + note + '</div>' : '')
    + '</div>'
    + (detailFn ? '<button class="btn btn-ghost btn-sm" style="flex-shrink:0;font-size:.75rem" onclick="' + detailFn + '">詳細→</button>' : '')
    + '</div></div>';
}

window.PAGES = window.PAGES || {};
window.PAGES['sale-list'] = function() { Pages.saleList(); };


// ════════════════════════════════════════════════════════════════
// 【5】Google Apps Script (GAS)
// ════════════════════════════════════════════════════════════════


// ────────────────────────────────────────────────────────────────