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
//
// build: 20260413bj
// 変更点: _buildT1UnitLabelHTML の t1Date フォールバックを '移行' → '' に修正
// ════════════════════════════════════════════════════════════════
'use strict';

window._LABEL_BUILD = '20260413bj';
console.log('[LABEL_BUILD]', window._LABEL_BUILD, 'loaded');

// ── ステージコード正規化 ─────────────────────────────────────────
function _normStageForLabel(code) {
  if (!code) return '';
  const MAP = {
    L1:'L1L2', L2_EARLY:'L1L2', L2_LATE:'L1L2',
    EGG:'L1L2', T0:'L1L2', T1:'L1L2',
    L3_EARLY:'L3', L3_MID:'L3', L3_LATE:'L3', T2:'L3', T2A:'L3', T2B:'L3', T3:'L3',
    L1L2:'L1L2', L3:'L3', PREPUPA:'前蛹', PUPA:'蛹',
    ADULT_PRE:'成虫（未後食）', ADULT:'成虫（活動開始）',
  };
  return MAP[code] || code;
}

// ── ステージ チェックボックス表示用ヘルパー ──────────────────────
function _stageCheckboxRow(stageCode) {
  var norm = _normStageForLabel(stageCode || '');
  if (norm && norm.startsWith('成虫')) norm = '成虫';

  var stages = ['L1L2', 'L3', '前蛹', '蛹', '成虫'];
  var out = stages.map(function(s) {
    return (norm === s ? '■' : '□') + s;
  }).join('&nbsp;');
  console.log('[LABEL] stage checkbox render:', norm, '|', out.replace(/&nbsp;/g,' '));
  return out;
}

// ── QR位置定義（HTML・PNG両方が参照する単一矩形） ────────────────
var QR_RECT_MM = { xMm: 3.5,  yMm: 8.2,  sizeMm: 11.67 };

function _qrPxForDims(dims) {
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
function _labelDimensions(labelType, targetType) {
  if (labelType === 'multi_lot' || labelType === 'egg_lot') {
    return { wMm:62, hMm:40, wPx:234, hPx:151, scale:3, label:'62×40mm' };
  }
  var isLarge =
    labelType === 'ind_fixed' ||
    labelType === 't1_unit'   ||
    targetType === 'IND'      ||
    targetType === 'UNIT'     ||
    targetType === 'IND_DRAFT';
  if (isLarge) {
    return { wMm:62, hMm:70, wPx:234, hPx:265, scale:3, label:'62×70mm' };
  }
  if (labelType === 'parent' || targetType === 'PAR') {
    return { wMm:62, hMm:40, wPx:234, hPx:151, scale:3, label:'62×40mm' };
  }
  return { wMm:62, hMm:40, wPx:234, hPx:151, scale:3, label:'62×40mm' };
}

// ── PNG生成（html2canvas経由） ────────────────────────────────────
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
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baseImg, 0, 0);

        var qrPx = _qrPxForDims(dims);
        console.log('[LABEL] qr composite rect:', qrPx);

        ctx.clearRect(qrPx.x, qrPx.y, qrPx.size, qrPx.size);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qrPx.x, qrPx.y, qrPx.size, qrPx.size);
        ctx.drawImage(qrImg, qrPx.x, qrPx.y, qrPx.size, qrPx.size);

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

  const styleMatch = htmlStr.match(/<style>([\s\S]*?)<\/style>/i);
  const bodyMatch  = htmlStr.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const rawStyle   = styleMatch ? styleMatch[1].replace(/@page\s*\{[^}]*\}/g, '') : '';
  const bodyHtml   = bodyMatch  ? bodyMatch[1] : htmlStr;

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

  const _hostImgs = Array.from(host.querySelectorAll('img'));
  if (_hostImgs.length > 0) {
    await Promise.all(_hostImgs.map(function(img) {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(function(resolve) {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 2000);
      });
    }));
  }
  await new Promise(function(r) { requestAnimationFrame(function() { requestAnimationFrame(r); }); });

  let canvas;
  try {
    canvas = await html2canvas(host, {
      scale:           dims.scale,
      width:           dims.wPx,
      height:          dims.hPx,
      useCORS:         true,
      allowTaint:      true,
      logging:         false,
      backgroundColor: '#ffffff',
      windowWidth:     dims.wPx,
      windowHeight:    dims.hPx,
      imageTimeout:    5000,
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

  const _isUnitMode    = targetType === 'UNIT';
  const _unitDisplayId = params.displayId || targetId || '';
  const _unitForSale   = !!params.forSale;
  const _unitDraft     = params.unitDraft  || null;

  const _isIndDraftMode = targetType === 'IND_DRAFT';
  const _draftInd       = params.draftInd  || null;
  const _singleIdx      = params.singleIdx !== undefined ? params.singleIdx : -1;

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

  const _backRoute = params.backRoute || null;
  const _backParam = params.backParam || (params.labeledDisplayId ? { labeledDisplayId: params.labeledDisplayId } : {});
  if (_isIndDraftMode && _backRoute === 't1-session' && _singleIdx >= 0) {
    if (!_backParam.singleIdx) Object.assign(_backParam, { singleIdx: _singleIdx });
  }

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
    const dims = _labelDimensions(labelType, targetType);
    main.innerHTML = `
      ${UI.header('ラベル発行', headerOpts)}
      <div class="page-body">

        ${!isDirectMode ? `
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

        <div id="lbl-action-bar" style="display:none;margin-top:8px">
          <div style="background:rgba(45,122,82,.10);border:1px solid rgba(45,122,82,.35);
            border-radius:var(--radius);padding:14px 16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <span style="font-size:1.1rem">✅</span>
              <span style="font-size:.88rem;font-weight:700;color:var(--green)">PNG生成完了（${dims.label}）</span>
            </div>
            <button class="btn btn-primary btn-full"
              style="font-size:.95rem;padding:14px;font-weight:700;margin-bottom:8px"
              onclick="Pages._lblDownloadPNG()">
              💾 PNG保存（Brother印刷用）
            </button>
            <button id="lbl-share-btn" class="btn btn-ghost btn-full" style="margin-bottom:8px;display:none"
              onclick="Pages._lblSharePNG()">
              📤 共有 / Brotherアプリへ送る
            </button>
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <button class="btn btn-primary" style="flex:2;font-weight:700;font-size:.92rem"
                onclick="Pages._lblBrotherPrint()">🖨️ Brother印刷（1タップ）</button>
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
              💡「Brother印刷」ボタンで印刷ダイアログが開きます。
              初回のみ <b>Brother Print Service Plugin</b>（Google Play）のインストールが必要です。
              <a href="#" onclick="Pages._lblPrintSetupGuide();return false;" style="color:var(--blue)">初回セットアップ手順を見る</a>
            </div>
          </div>
        </div>

      </div>`;

    if (targetId || (_isUnitMode && _unitDisplayId) || _isIndDraftMode) {
      const _autoTargetId = (_isUnitMode && !targetId) ? _unitDisplayId : targetId;
      console.log('[LABEL] auto-generate', { targetType, _autoTargetId, labelType });
      setTimeout(() => Pages._lblGenerate(targetType, _autoTargetId, labelType), 100);
      setTimeout(() => {
        const _m = document.getElementById('lbl-html-preview');
        if (_m && _m.querySelector('.spinner')) {
          console.error('[LABEL] TIMEOUT: still spinner after 6s');
          _m.innerHTML = '<div style="color:#b00020;padding:20px;text-align:center;font-size:.85rem">PNG生成がタイムアウトしました。<br>ページを再読み込みして再試行してください。</div>';
        }
      }, 6000);
    }

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
        t1_date:       unit.t1_date     || unit.created_at || '',
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
      var maxAttempts = 40;
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
              var ctx2 = canvas.getContext('2d');
              var imgData = ctx2 ? ctx2.getImageData(0, 0, canvas.width, canvas.height) : null;
              if (imgData) {
                var blackCount = 0;
                for (var pi = 0; pi < imgData.data.length; pi += 4) {
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
                if (d.length > 1000) { dataUrl = d; }
              }
            }
          } catch(e) { console.warn('[LABEL] canvas.toDataURL error:', e.message); }
        }
        if (!dataUrl && img && img.src && img.src.startsWith('data:') && img.src.length > 500) {
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

  (async function _lblRender() {
    try {
      console.log('[LABEL] qr build start - build:20260413bi');
      console.log('[LABEL] qr target type:', targetType, '| targetId:', targetId);
      console.log('[LABEL] qr rect:', JSON.stringify(QR_RECT_MM));
      console.log('[LABEL] qr target text:', qrText);
      var qrSrc = await _getQrDataUrl(qrText);
      console.log('[LABEL] qr dataUrl created - length:', qrSrc ? qrSrc.length : 0);
      if (qrSrc) {
        console.log('[LABEL] qr final src prefix:', qrSrc.slice(0, 30));
      } else {
        console.error('[LABEL] qr build failed - qrSrc empty');
      }

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

      var ifrW = Math.round(dims.wPx * 1.5);
      var ifrH = Math.round(dims.hPx * 1.5);
      _previewNow.innerHTML = '<iframe srcdoc="' + html.replace(/"/g,'&quot;')
        + '" style="width:' + ifrW + 'px;height:' + ifrH + 'px;border:none;display:block" scrolling="no"></iframe>';
      console.log('[LABEL] raw preview injected');

      var bar = document.getElementById('lbl-action-bar');
      if (bar) { bar.style.display = 'block'; bar.scrollIntoView({ behavior:'smooth', block:'nearest' }); }

      await new Promise(function(r){ setTimeout(r, 500); });

      var pngDataUrl = null;
      try {
        pngDataUrl = await _buildLabelPNG(html, dims);
        if (pngDataUrl) console.log('[LABEL] png build done - length:', pngDataUrl.length);
      } catch(pngErr) {
        console.warn('[LABEL] png build failed:', pngErr.message);
      }

      if (pngDataUrl && qrSrc) {
        var pngHasQr = await _checkPngHasQr(pngDataUrl, dims);
        console.log('[LABEL] qr composite mode:', pngHasQr ? 'on (verify+composite)' : 'on (needs composite)');
        try {
          pngDataUrl = await _compositeQrOntoPng(pngDataUrl, qrSrc, dims);
          console.log('[LABEL] qr composited onto PNG - final length:', pngDataUrl.length);
        } catch(compErr) {
          console.warn('[LABEL] qr composite failed:', compErr.message);
        }
      } else if (pngDataUrl && !qrSrc) {
        console.log('[LABEL] qr composite mode: skipped (no qrSrc)');
      }

      if (pngDataUrl) {
        window._currentLabel.pngDataUrl = pngDataUrl;
        _previewNow.innerHTML = '<img src="' + pngDataUrl
          + '" style="max-width:100%;height:auto;border-radius:4px;display:block" alt="ラベルプレビュー">';
        console.log('[LABEL] preview render done (PNG with QR composite)');
      } else {
        console.log('[LABEL] preview render done (iframe - PNG failed)');
      }

    } catch(err) {
      console.error('[LABEL] label render failed:', err.message, err.stack);
      var errMount = document.getElementById('lbl-html-preview');
      if (errMount) {
        errMount.innerHTML = '<div style="color:var(--red,#e05050);padding:16px;font-size:.8rem;text-align:center">⚠️ ラベル描画エラー<br><small>' + err.message + '</small></div>';
      }
    }
  })();
};


// ════════════════════════════════════════════════════════════════
// HTMLラベル構築
// ════════════════════════════════════════════════════════════════

function _chkThermal(label, checked) {
  return '<span style="margin-right:5px;font-weight:700;color:#000">'
    + (checked ? '■' : '□') + label + '</span>';
}


// ── 性別表示ヘルパー ──────────────────────────────────────────────
// ラベル右上に「♂ ・ ♀」を印刷。性別確定済みの場合は◯を付ける。
// sex: '' | '♂' | '♀'
function _sexDisplay(sex) {
  // 確定済み: 記号を丸ボックスで囲む / 未確定: そのまま表示
  function _circled(sym, active) {
    if (active) {
      return '<span style="display:inline-flex;align-items:center;justify-content:center;'
        + 'width:17px;height:17px;border-radius:50%;border:1.5px solid #000;'
        + 'font-size:12px;font-weight:700;color:#000;line-height:1;vertical-align:middle">'
        + sym + '</span>';
    }
    return '<span style="font-size:13px;font-weight:700;color:#000;vertical-align:middle">' + sym + '</span>';
  }
  var mHtml = _circled('&#9794;', sex === '♂');
  var fHtml = _circled('&#9792;', sex === '♀');
  return '<span style="font-size:13px;font-weight:700;color:#000">'
    + mHtml + '&nbsp;&#183;&nbsp;' + fHtml
    + '</span>';
}

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
    : '個別飼育';

  var rawId     = ld.display_id || '';
  var idParts   = rawId.split('-');
  var lineBadge = ld.line_code || '';
  var lotSuffix = '';
  if (lineBadge && rawId.includes('-' + lineBadge + '-')) {
    lotSuffix = rawId.slice(rawId.indexOf('-' + lineBadge + '-') + ('-' + lineBadge + '-').length);
  } else if (idParts.length >= 3) {
    lotSuffix = idParts.slice(2).join('-');
  }
  var prefix = lineBadge && rawId.includes(lineBadge)
    ? rawId.slice(0, rawId.indexOf(lineBadge)).replace(/-$/, '')
    : '';

  console.log('[LABEL] header badge render: line=' + lineBadge + ' suffix=' + lotSuffix + ' prefix=' + prefix);

  var matType   = ld.mat_type || '';
  var showMx    = (matType === 'T2' || matType === 'T3');
  var mxIsOn    = ld.mat_molt === true || ld.mat_molt === 'true';

  var records   = ld.records || [];
  var sortedR   = records.slice().sort(function(a,b){
    return String(a.record_date||'').localeCompare(String(b.record_date||''));
  });
  var recentAll = sortedR.slice(-8);
  var leftCol   = recentAll.slice(0, 4);
  var rightCol  = recentAll.slice(4, 8);
  while (leftCol.length  < 4) leftCol.push(null);
  while (rightCol.length < 4) rightCol.push(null);

  var tdU = 'border:1.5px solid #000;padding:6px 2px;font-size:8px;font-weight:700;color:#000;text-align:center';
  var thS = 'border:1.5px solid #000;padding:2px 2px;font-size:7.5px;font-weight:700;background:#000;color:#fff;text-align:center';

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
      var le = lRec.exchange_type || '';
      lExch = ((le==='FULL'||le==='全')?'■':'□')+'全<br>'+((le==='ADD'||le==='追')?'■':'□')+'追';
    }
    if (rRec) {
      var re2 = rRec.exchange_type || '';
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

  var bLg = 'display:inline-block;border:1.5px solid #000;border-radius:3px;'
    + 'padding:0 4px;font-size:12px;font-weight:700;color:#000;margin-right:2px;line-height:1.5';

  var lineBadgeHtml = lineBadge
    ? '<span style="' + bLg + '">' + lineBadge + '</span>'
    : '';
  var lotSuffixHtml = lotSuffix
    ? '<span style="' + bLg + '">' + lotSuffix + '</span>'
    : '';

  var countBadge = (isLot && ld.count)
    ? '<span style="display:inline-block;border:2px solid #000;border-radius:3px;'
      + 'padding:0 3px;font-size:13px;font-weight:700;color:#000;line-height:1.4">'
      + ld.count + '頭</span>'
    : '';

  // ▼ 性別表示: 性別未確定でも「♂ ・ ♀」を印刷、確定済みは「◯♂ ・ ♀」
  var sexHtml = !isLot ? _sexDisplay(ld.sex || '') : '';

  var hatchHtml = (!isLot && ld.hatch_date)
    ? '<div style="font-size:6.5px;font-weight:700;color:#000">孵: ' + ld.hatch_date + '</div>'
    : '';

  var mxHtml = showMx
    ? '<div style="font-size:7px;font-weight:700;color:#000;line-height:1.7">'
      + 'Mx:' + chk('ON', mxIsOn) + chk('OFF', !mxIsOn) + '</div>'
    : '';

  var _bodyH  = isLot ? '40mm' : '70mm';
  var _pageSz = isLot ? '62mm 40mm' : '62mm 70mm';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: ' + _pageSz + '; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:' + _bodyH + '; font-family:sans-serif; font-size:7px; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:' + _bodyH + ';display:flex;flex-direction:column">\n'

    + (isLot
      ? '  <div style="position:relative;background:#000;color:#fff;font-size:9px;font-weight:700;padding:0.8mm 2mm;height:5mm;display:flex;align-items:center;flex-shrink:0;overflow:hidden">'
        + '<span style="position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(45deg,transparent 0,transparent 4px,rgba(255,255,255,0.28) 4px,rgba(255,255,255,0.28) 6px);pointer-events:none"></span>'
        + '<span style="position:relative;z-index:1">' + headerLabel + ' | HerculesOS</span>'
        + '</div>\n'
      : '  <div style="background:#000;color:#fff;font-size:9px;font-weight:700;padding:0.8mm 2mm;height:5mm;display:flex;align-items:center;flex-shrink:0">'
        + headerLabel + ' | HerculesOS</div>\n'
    )

    + '  <div style="display:flex;padding:1mm 1.5mm 0;gap:0;flex-shrink:0">\n'
    + '    <div style="flex-shrink:0;margin-right:1.5mm">' + _qrBox(qrSrc, 44) + '</div>\n'
    + '    <div style="flex:1;min-width:0;padding-left:1.5mm;border-left:2px solid #000">\n'

    + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">\n'
    + '        <div>'
    + (prefix ? '<span style="font-size:7px;font-weight:700;color:#000;margin-right:2px">' + prefix + '-</span>' : '')
    + lineBadgeHtml + lotSuffixHtml + '</div>\n'
    + '        <div>' + countBadge + sexHtml + '</div>\n'
    + '      </div>\n'

    + '      ' + hatchHtml + '\n'

    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.7">'
    + '区分:' + chk('大',sexCats.indexOf('大')>=0) + chk('中',sexCats.indexOf('中')>=0) + chk('小',sexCats.indexOf('小')>=0)
    + '</div>\n'

    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.7">'
    + 'M:' + ['T0','T1','T2','T3'].map(function(m){ return chk(m,ld.mat_type===m); }).join('')
    + '</div>\n'

    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.7">'
    + 'St:' + _stageCheckboxRow(ld.stage_code) + '</div>\n'

    + '      ' + mxHtml + '\n'

    + '    </div>\n'
    + '  </div>\n'

    + (isLot ? (
      '  <div style="border-top:2px solid #000;margin:1mm 1.5mm 0"></div>\n'
      + '  <div style="padding:1.5mm 2mm;flex:1;display:flex;flex-direction:column;justify-content:space-evenly">\n'
      + '    <pre style="font-family:monospace;font-size:17px;font-weight:700;color:#000;margin:0 0 4px;line-height:1.5;white-space:pre">'
      +           '採卵日  ' + (ld.collect_date ? ld.collect_date.replace(/-/g,'/') : '____/__/__') + '</pre>\n'
      + '    <pre style="font-family:monospace;font-size:17px;font-weight:700;color:#000;margin:0;line-height:1.5;white-space:pre">'
      +           '孵化日  ' + (ld.hatch_date ? ld.hatch_date.replace(/-/g,'/') : '____/__/__') + '</pre>\n'
      + '  </div>\n'
          ) : (
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

    + (noteShort
      ? '  <div style="padding:0.5mm 2mm 1mm;font-size:7px;font-weight:700;color:#000;overflow:hidden;white-space:nowrap">📝 ' + noteShort + '</div>\n'
      : '')
    + '</div>\n</body></html>';
}


// ── 種親ラベル（62mm × 40mm）─────────────────────────────────────
function _buildParentLabelHTML(ld, _unused, qrSrc) {
  var qr = (typeof _unused === 'string' && _unused.startsWith('data:')) ? _unused : qrSrc;

  var rawId    = ld.display_id || '';
  var idParts  = rawId.split('-');
  var idCode   = idParts.length >= 2 ? idParts[idParts.length - 1] : rawId;
  var sizeStr  = ld.size_mm       || '';
  var ecStr    = ld.eclosion_date || '';
  var feedStr  = ld.feeding_date  || '';
  var locStr   = [ld.locality, ld.generation].filter(Boolean).join(' / ');
  var patStr   = ld.paternal_raw ? ld.paternal_raw.slice(0,28) + (ld.paternal_size ? ' ' + ld.paternal_size : '') : '';
  var matStr   = ld.maternal_raw ? ld.maternal_raw.slice(0,28) + (ld.maternal_size ? ' ' + ld.maternal_size : '') : '';
  var badgeFz  = idCode.length <= 1 ? '34px' : idCode.length <= 2 ? '26px' : '17px';
  var sexColor = ld.sex === '♂' ? '#1a6bb5' : ld.sex === '♀' ? '#b51a5a' : '#000';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 40mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:40mm; font-family:sans-serif; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:40mm;position:relative">\n'

    + '  <div style="background:#000;color:#fff;font-size:7.5px;font-weight:700;'
    + 'padding:0 2.5mm;height:4.5mm;display:flex;align-items:center;letter-spacing:.6px">'
    + '種親 | HerculesOS</div>\n'

    + '  <div style="position:absolute;top:4.5mm;left:0;right:0;bottom:0;'
    + 'display:flex;flex-direction:column;padding:1.2mm 2mm 1mm">\n'

    + '    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5mm">\n'
    + '      <span style="font-family:monospace;font-size:10px;font-weight:900;letter-spacing:.3px">' + rawId + '</span>\n'
    + '      <div style="border:2px solid #000;border-radius:3px;font-size:' + badgeFz + ';font-weight:900;'
    + 'line-height:1;width:8.5mm;height:8.5mm;display:flex;align-items:center;justify-content:center;margin-left:2mm">'
    + idCode + '</div>\n'
    + '    </div>\n'

    + '    <div style="display:flex;align-items:baseline;gap:3px;margin-bottom:1.5mm">\n'
    + '      <span style="font-size:10px;font-weight:900;color:' + sexColor + '">' + (ld.sex||'') + '</span>\n'
    + '      <span style="font-size:10px;font-weight:800">' + sizeStr + '</span>\n'
    + (locStr ? '      <span style="font-size:6.5px;color:#444;margin-left:2px">/ ' + locStr + '</span>\n' : '')
    + '    </div>\n'

    + '    <div style="border-top:1px solid #000;margin-bottom:1.5mm"></div>\n'

    + '    <div style="display:flex;align-items:baseline;gap:2mm;margin-bottom:1mm">\n'
    + '      <span style="font-size:6px;color:#555;font-weight:700;min-width:8mm">羽化日</span>\n'
    + '      <span style="font-size:8px;font-weight:700;border-bottom:1px solid #777;flex:1;padding-bottom:0.5px">'
    + (ecStr ? ecStr : '<span style="color:#bbb">____  /  __  /  __</span>') + '</span>\n'
    + '    </div>\n'

    + '    <div style="display:flex;align-items:baseline;gap:2mm;margin-bottom:1.5mm">\n'
    + '      <span style="font-size:6px;color:#555;font-weight:700;min-width:8mm">後食日</span>\n'
    + '      <span style="font-size:8px;font-weight:700;border-bottom:1px solid #777;flex:1;padding-bottom:0.5px">'
    + (feedStr ? feedStr : '<span style="color:#bbb">____  /  __  /  __</span>') + '</span>\n'
    + '    </div>\n'

    + '    <div style="border-top:0.8px solid #bbb;margin-bottom:1mm"></div>\n'

    + '    <div style="display:flex;align-items:flex-end;justify-content:space-between">\n'
    + '      <div style="flex:1;min-width:0">\n'
    + (patStr ? '        <div style="font-size:6px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.5">'
      + '<span style="color:#1a6bb5">♂</span>&nbsp;' + patStr + '</div>\n' : '')
    + (matStr ? '        <div style="font-size:6px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.5">'
      + '<span style="color:#b51a5a">♀</span>&nbsp;' + matStr + '</div>\n' : '')
    + '      </div>\n'
    + '      <div style="flex-shrink:0;margin-left:1.5mm">' + _qrBox(qr, 28) + '</div>\n'
    + '    </div>\n'

    + '  </div>\n'
    + '</div>\n</body></html>';
}


// ── 産卵セットラベル（62mm × 40mm）──────────────────────────────
function _buildSetLabelHTML(ld, _unused, qrSrc) {
  var qr = (typeof _unused === 'string' && _unused.startsWith('data:')) ? _unused : qrSrc;

  var rawId  = ld.display_id || '';
  var _rawLC = ld.line_code  || '';
  function _sc(s) {
    if (!s || /^SET-/i.test(s)) return '';
    var p = s.split('-').filter(Boolean);
    if (p.length >= 3) return p[1];
    return p[0] ? p[0].replace(/^[A-Za-z]{1,3}[0-9]{4}/,'') : '';
  }
  var lineCode = _sc(_rawLC) || '';
  var badgeFz  = lineCode.length <= 1 ? '26px' : lineCode.length <= 2 ? '20px' : '14px';
  var fInfo    = ld.father_info  || '—';
  var mInfo    = ld.mother_info  || '—';
  var fSize    = ld.father_size  ? ' (' + ld.father_size  + ')' : '';
  var mSize    = ld.mother_size  ? ' (' + ld.mother_size  + ')' : '';
  var fBlood   = ld.father_blood ? ld.father_blood.slice(0, 22) : '';
  var mBlood   = ld.mother_blood ? ld.mother_blood.slice(0, 22) : '';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 40mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:40mm; font-family:sans-serif; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:40mm;display:flex;flex-direction:column">\n'

    + '  <div style="background:#000;color:#fff;font-size:7.5px;font-weight:700;'
    + 'padding:0 2mm;height:4.5mm;display:flex;align-items:center;flex-shrink:0;letter-spacing:.5px">'
    + '産卵セット | HerculesOS</div>\n'

    + '  <div style="display:flex;flex:1;overflow:hidden">\n'

    + '    <div style="flex-shrink:0;padding:1.5mm 1mm 1mm 1.5mm;border-right:1.5px solid #000;">'
    + _qrBox(qr, 40) + '</div>\n'

    + '    <div style="flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden">\n'

    + '      <div style="padding:0.8mm 1.5mm 0.6mm;border-bottom:1.5px solid #000;flex-shrink:0;'
    + 'display:flex;align-items:center;justify-content:space-between">\n'
    + '        <div>\n'
    + '          <div style="font-family:monospace;font-size:8.5px;font-weight:800;line-height:1.2">' + rawId + '</div>\n'
    + (ld.pairing_start
      ? '          <div style="font-size:6.5px;color:#444;font-weight:600">ペアリング: ' + ld.pairing_start + '</div>\n'
      : '')
    + '        </div>\n'
    + (lineCode
      ? '        <div style="border:2px solid #000;border-radius:3px;font-size:' + badgeFz + ';font-weight:900;'
        + 'width:7.5mm;height:7.5mm;display:flex;align-items:center;justify-content:center;margin-left:1mm;flex-shrink:0">'
        + lineCode + '</div>\n'
      : '')
    + '      </div>\n'

    + '      <div style="padding:0.8mm 1.5mm;border-bottom:1px solid #ddd;flex:1;'
    + 'display:flex;flex-direction:column;justify-content:center">\n'
    + '        <div style="display:flex;align-items:baseline;gap:3px">\n'
    + '          <span style="font-size:9px;font-weight:900;color:#1a6bb5;flex-shrink:0">♂</span>\n'
    + '          <span style="font-size:8.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
    + fInfo + fSize + '</span>\n'
    + '        </div>\n'
    + (fBlood ? '        <div style="font-size:6.5px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + fBlood + '</div>\n' : '')
    + '      </div>\n'

    + '      <div style="padding:0.8mm 1.5mm;flex:1;display:flex;flex-direction:column;justify-content:center">\n'
    + '        <div style="display:flex;align-items:baseline;gap:3px">\n'
    + '          <span style="font-size:9px;font-weight:900;color:#b51a5a;flex-shrink:0">♀</span>\n'
    + '          <span style="font-size:8.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
    + mInfo + mSize + '</span>\n'
    + '        </div>\n'
    + (mBlood ? '        <div style="font-size:6.5px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + mBlood + '</div>\n' : '')
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
  // ▼▼▼ 修正箇所: t1_date が未設定の場合は空欄（バグ修正: '移行' → ''）▼▼▼
  var t1Date   = ld.t1_date || '';
  // ▲▲▲ 修正箇所ここまで ▲▲▲

  var rawId     = ld.display_id || '';
  var idParts   = rawId.split('-');
  var prefix    = '';
  var unitSuffix = '';
  if (lineCode && rawId.indexOf(lineCode) !== -1) {
    var _lcIdx = rawId.indexOf(lineCode);
    prefix = rawId.slice(0, _lcIdx).replace(/-$/, '');
    var _afterLine = rawId.slice(_lcIdx + lineCode.length).replace(/^-/, '');
    var _aParts = _afterLine.split('-').filter(function(p){ return p.length > 0; });
    unitSuffix = _aParts.length > 0 ? _aParts[_aParts.length - 1] : '';
  } else {
    prefix = idParts.length > 1 ? idParts[0] : '';
    unitSuffix = idParts.length > 1 ? idParts[idParts.length - 1] : rawId;
  }

  console.log('[LABEL_UNIT] display_id:', rawId, '/ line:', lineCode, '/ prefix:', prefix, '/ suffix:', unitSuffix);

  var m0 = (ld.members && ld.members[0]) ? ld.members[0] : null;
  var m1 = (ld.members && ld.members[1]) ? ld.members[1] : null;
  var m0w  = m0 && m0.weight_g ? String(m0.weight_g) : '';
  var m1w  = m1 && m1.weight_g ? String(m1.weight_g) : '';
  var m0sex = m0 ? (m0.sex || '') : '';
  var m1sex = m1 ? (m1.sex || '') : '';
  // ユニット性別表示「①◯♂ ②♀」形式
  function _unitMemberSex(idx, sex) {
    var sym = sex === '♂' ? '&#9794;' : sex === '♀' ? '&#9792;' : (idx===0?'&#9794;':'&#9792;');
    if (sex) {
      return (idx+1) + '<span style="display:inline-flex;align-items:center;justify-content:center;'
        + 'width:14px;height:14px;border-radius:50%;border:1.2px solid #000;'
        + 'font-size:10px;font-weight:700;color:#000;line-height:1;vertical-align:middle">'
        + sym + '</span>';
    }
    return (idx+1) + '<span style="font-size:10px;font-weight:700;color:#000">' + sym + '</span>';
  }
  var unitSexHtml = '<span style="font-size:10px;font-weight:700;color:#000">'
    + _unitMemberSex(0, m0sex) + '&nbsp;' + _unitMemberSex(1, m1sex) + '</span>';

  var showMx = (mat === 'T2' || mat === 'T3');
  var mxIsOn = ld.mat_molt === true || ld.mat_molt === 'true';

  var tdU = 'border:1.5px solid #000;padding:4px 2px;font-size:8px;font-weight:700;color:#000;text-align:center';
  var thS = 'border:1.5px solid #000;padding:2px 2px;font-size:7.5px;font-weight:700;background:#000;color:#fff;text-align:center';

  function _wgtCell(wgt) {
    return '<td style="' + tdU + ';position:relative">'
      + (wgt ? wgt : '&nbsp;')
      + '<span style="position:absolute;bottom:1px;right:2px;font-size:5px;font-weight:700;color:#000">g</span>'
      + '</td>';
  }

  // ▼▼▼ 修正箇所: 1行目の日付欄はt1Dateがあれば表示、なければ空欄 ▼▼▼
  var rowsHtml = '';
  for (var ri = 0; ri < 4; ri++) {
    var isT1Row = (ri === 0);
    var rowDate = isT1Row ? (t1Date || '') : '';
    var rowWt0  = isT1Row ? m0w : '';
    var rowWt1  = isT1Row ? m1w : '';
    rowsHtml += '<tr>'
      + '<td style="' + tdU + '">' + (rowDate || '&nbsp;') + '</td>'
      + _wgtCell(rowWt0)
      + _wgtCell(rowWt1)
      + '<td style="' + tdU + '">□全<br>□追</td>'
      + '</tr>';
  }
  // ▲▲▲ 修正箇所ここまで ▲▲▲

  var bLg = 'display:inline-block;border:1.5px solid #000;border-radius:3px;'
    + 'padding:0 4px;font-size:12px;font-weight:700;color:#000;margin-right:2px;line-height:1.5';
  var countBadge = '<span style="display:inline-block;border:2px solid #000;border-radius:3px;'
    + 'padding:0 3px;font-size:13px;font-weight:700;color:#000;line-height:1.4">'
    + hc + '頭</span>';

  var lineBadgeHtml   = lineCode   ? '<span style="' + bLg + '">' + lineCode   + '</span>' : '';
  var unitSuffixHtml  = unitSuffix ? '<span style="' + bLg + '">' + unitSuffix + '</span>' : '';

  var saleBadge = forSale
    ? '<span style="border:1.5px solid #000;padding:0 3px;font-size:7px;font-weight:700;color:#000;margin-left:3px">販売</span>'
    : '';

  var hatchHtml = ld.hatch_date
    ? '<div style="font-size:6.5px;font-weight:700;color:#000">孵: ' + ld.hatch_date + '</div>'
    : '';

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

    + '  <div style="position:relative;background:#000;color:#fff;font-size:9px;font-weight:700;padding:0.8mm 2mm;height:5mm;display:flex;align-items:center;flex-shrink:0;overflow:hidden">'
    + '<span style="position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(45deg,transparent 0,transparent 4px,rgba(255,255,255,0.28) 4px,rgba(255,255,255,0.28) 6px);pointer-events:none"></span>'
    + '<span style="position:relative;z-index:1">ユニット | HerculesOS' + saleBadge + '</span>'
    + '</div>\n'

    + '  <div style="display:flex;padding:1mm 1.5mm 0;gap:0;flex-shrink:0">\n'
    + '    <div style="flex-shrink:0;margin-right:1.5mm">' + _qrBox(qr, 44) + '</div>\n'
    + '    <div style="flex:1;min-width:0;padding-left:1.5mm;border-left:2px solid #000">\n'

    + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">\n'
    + '        <div>'
    + (prefix ? '<span style="font-size:8px;font-weight:700;color:#000;margin-right:1px">' + prefix + '-</span>' : '')
    + lineBadgeHtml + unitSuffixHtml + '</div>\n'
    + '        <div>' + countBadge + '&nbsp;' + unitSexHtml + '</div>\n'
    + '      </div>\n'

    + '      ' + hatchHtml + '\n'
    + '      ' + originHtml + '\n'

    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.6">'
    + '区分:' + chk('大', sizeCats.indexOf('大')>=0) + chk('中', sizeCats.indexOf('中')>=0) + chk('小', sizeCats.indexOf('小')>=0)
    + '</div>\n'

    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.6">'
    + 'M:' + ['T0','T1','T2','T3'].map(function(m){ return chk(m, mat===m); }).join('')
    + '</div>\n'

    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.6">'
    + 'St:' + _stageCheckboxRow(ld.stage_code || 'T1')
    + '</div>\n'

    + (showMx ? '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.6">Mx:'
      + chk('ON', mxIsOn) + chk('OFF', !mxIsOn) + '</div>\n' : '')

    + '    </div>\n'
    + '  </div>\n'

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


// ── ダウンロード / 共有 / 印刷 ────────────────────────────────────
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

Pages._lblBrotherPrint = function() {
  const label = window._currentLabel || {};
  if (!label.pngDataUrl && !label.html) {
    UI.toast('先にラベルを生成してください', 'error'); return;
  }
  const dims = label.dims || { wMm:62, hMm:70 };
  const png  = label.pngDataUrl;

  // ── PNG方式（確実・推奨） ──────────────────────────────────────
  // pngDataUrlがあればPNG画像をページに埋め込んで印刷
  // @page に正確なmm指定 → Brother Print Service Pluginがサイズ自動認識
  if (png) {
    const printDoc = '<!DOCTYPE html><html><head>'
      + '<meta charset="utf-8">'
      + '<style>'
      + '@page { size: ' + dims.wMm + 'mm ' + dims.hMm + 'mm; margin: 0; }'
      + 'html,body { margin:0; padding:0; background:#fff; width:' + dims.wMm + 'mm; height:' + dims.hMm + 'mm; overflow:hidden; }'
      + 'img { display:block; width:' + dims.wMm + 'mm; height:' + dims.hMm + 'mm; object-fit:contain; }'
      + '</style></head><body>'
      + '<img src="' + png + '">'
      + '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});<' + '/script>'
      + '</body></html>';

    const blob = new Blob([printDoc], { type:'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (!win) {
      UI.toast('ポップアップを許可してください（アドレスバー右端のアイコンをタップ）', 'error', 5000);
      return;
    }
    setTimeout(function(){ URL.revokeObjectURL(url); }, 10000);
    return;
  }

  // ── HTMLフォールバック（PNG未生成の場合） ─────────────────────
  // html は iframe用に &quot; エスケープされているので元に戻す
  const rawHtml = (label.html || '').replace(/&quot;/g, '"');
  const printDoc2 = '<!DOCTYPE html><html><head>'
    + '<meta charset="utf-8">'
    + '<style>'
    + '@page { size: ' + dims.wMm + 'mm ' + dims.hMm + 'mm; margin: 0; }'
    + 'html,body { margin:0; padding:0; background:#fff; width:' + dims.wMm + 'mm; height:' + dims.hMm + 'mm; }'
    + '-webkit-print-color-adjust:exact; print-color-adjust:exact;'
    + '</style></head><body>'
    + rawHtml
    + '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},400);});<' + '/script>'
    + '</body></html>';

  const blob2 = new Blob([printDoc2], { type:'text/html;charset=utf-8' });
  const url2  = URL.createObjectURL(blob2);
  const win2  = window.open(url2, '_blank');
  if (!win2) {
    UI.toast('ポップアップを許可してください（アドレスバー右端のアイコンをタップ）', 'error', 5000);
    return;
  }
  setTimeout(function(){ URL.revokeObjectURL(url2); }, 10000);
};

// 後方互換
Pages._lblPrintHTML = Pages._lblBrotherPrint;
Pages._lblPrint     = Pages._lblBrotherPrint;
Pages._lblDownload = Pages._lblDownloadPNG;

// Brother Print Service Plugin セットアップ案内
Pages._lblPrintSetupGuide = function() {
  UI.modal(
    '<div class="modal-title" style="font-size:.92rem;font-weight:700;padding-bottom:8px">🖨️ Brother印刷 初回セットアップ</div>' +
    '<div style="font-size:.8rem;line-height:1.9;padding:4px 0">' +
      '<div style="font-weight:700;color:var(--gold);margin-bottom:6px">【1回だけ必要な作業】</div>' +
      '<div style="margin-bottom:12px">' +
        '<b>① Google Playでインストール</b><br>' +
        '<span style="color:var(--text3)">「Brother Print Service Plugin」を検索してインストール</span>' +
      '</div>' +
      '<div style="margin-bottom:12px">' +
        '<b>② Androidの印刷設定を開く</b><br>' +
        '<span style="color:var(--text3)">設定 → 接続済みデバイス → 印刷 → Brother Print Service → 有効にする</span>' +
      '</div>' +
      '<div style="margin-bottom:12px">' +
        '<b>③ プリンターを追加</b><br>' +
        '<span style="color:var(--text3)">「プリンターを追加」→ QL-820NWBをWi-Fiで検索・選択</span>' +
      '</div>' +
      '<div style="background:rgba(76,175,120,.08);border:1px solid rgba(76,175,120,.25);border-radius:8px;padding:10px 12px;font-size:.76rem">' +
        '<b style="color:var(--green)">✅ セットアップ完了後の印刷手順</b><br>' +
        '① HerculesOSで「Brother印刷」ボタンをタップ<br>' +
        '② 印刷ダイアログが開く → プリンター: QL-820NWBを選択<br>' +
        '③ 用紙サイズが自動設定される（62×70mm または 62×40mm）<br>' +
        '④「印刷」→ 完了 🎉' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn btn-primary btn-full" onclick="UI.closeModal&&UI.closeModal()">OK</button>' +
    '</div>'
  );
};
Pages._lblOpenDrive = function () { UI.toast('Drive保存は非対応です', 'info'); };

window._currentLabel  = window._currentLabel  || { displayId:'', fileName:'', html:'', pngDataUrl:'', dims:null };
window._lastLabelType = window._lastLabelType  || {};

window.PAGES = window.PAGES || {};
window.PAGES['label-gen'] = () => Pages.labelGen(Store.getParams());
