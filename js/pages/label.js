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

window._LABEL_BUILD = '20260330-v5-png';
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

// ラベル種別定義
const LABEL_TYPE_DEFS = [
  { code: 'egg_lot',   label: '① 卵管理',        target: 'LOT',  desc: '採卵後・孵化日/頭数は後で補完 62×70mm' },
  { code: 'multi_lot', label: '② 複数頭飼育',    target: 'LOT',  desc: 'ロット管理用（記録表付き）62×70mm' },
  { code: 'ind_fixed', label: '③ 個別飼育',      target: 'IND',  desc: '個体管理用（履歴引継ぎ）62×70mm' },
  { code: 't1_unit',   label: '⑥ T1ユニット',   target: 'UNIT', desc: 'T1移行後の2頭飼育 62×70mm' },
  { code: 'set',       label: '④ 産卵セット',    target: 'SET',  desc: '親情報・開始日 62×40mm' },
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
  const isLarge =
    labelType === 'ind_fixed' ||
    labelType === 'multi_lot' ||
    labelType === 'egg_lot'   ||
    labelType === 't1_unit'   ||
    targetType === 'IND'      ||
    targetType === 'LOT'      ||
    targetType === 'UNIT'     ||
    targetType === 'IND_DRAFT';

  if (isLarge) {
    // 62mm × 70mm → 234×265px → scale3: 702×795px
    return { wMm:62, hMm:70, wPx:234, hPx:265, scale:3, label:'62×70mm' };
  }
  // 62mm × 40mm → 234×151px → scale3: 702×453px (SET / PAR)
  return { wMm:62, hMm:40, wPx:234, hPx:151, scale:3, label:'62×40mm' };
}

// ── PNG生成（html2canvas経由） ────────────────────────────────────
// htmlStr: _buildLabelHTML が返す完全 HTML 文字列
// dims:    _labelDimensions の返り値
// 戻り値:  PNG data URL (string) | null(html2canvas 未ロード時)
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
      logging:         false,
      backgroundColor: '#ffffff',
      windowWidth:     dims.wPx,
      windowHeight:    dims.hPx,
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

  // ── サイズ表示ラベル（プレビューカードタイトルに使用） ──
  const dims = _labelDimensions(labelType, targetType);

  function render() {
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
            </select>` : `
            <select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">
              <option value="">ロットを選択...</option>
              ${lots.map(l => `<option value="${l.lot_id}" ${l.lot_id===targetId?'selected':''}>
                ${l.display_id} ${typeof stageLabel==='function'?stageLabel(l.stage):l.stage||''} (${l.count}頭)</option>`).join('')}
            </select>`}
        </div>
        <!-- 種別選択 -->
        <div class="card">
          <div class="card-title">ラベル種別</div>
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
        paternal_raw: par.paternal_raw  || '',
        maternal_raw: par.maternal_raw  || '',
        paternal_tags:pTags,
        maternal_tags:mTags,
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
        display_id:   `${di.lot_display_id||''}#${di.lot_item_no||'?'} (下書き)`,
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
      ld = {
        qr_text:       `SET:${set.set_id || targetId}`,
        display_id:    set.display_id   || set.set_name || targetId,
        father_info:   set.father_display_name || '',
        mother_info:   set.mother_display_name || '',
        pairing_start: set.pairing_start || '',
        set_start:     set.set_start     || '',
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
            var d = canvas.toDataURL('image/png');
            if (d && d.length > 500) { dataUrl = d; }
          } catch(e) { console.warn('[LABEL] canvas.toDataURL error:', e.message); }
        }
        if (!dataUrl && img && img.src && img.src.startsWith('data:') && img.src.length > 500) {
          dataUrl = img.src;
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
      console.log('[LABEL] qr target type:', targetType, '| targetId:', targetId);
      var qrSrc = await _getQrDataUrl(qrText);
      console.log('[LABEL] qr dataUrl created - length:', qrSrc ? qrSrc.length : 0);
      if (!qrSrc) {
        console.error('[LABEL] qr build failed - using error placeholder');
      }

      // QR img の load を確認（html2canvas で拾えるようにする）
      if (qrSrc) {
        await new Promise(function(res) {
          var img = new Image();
          img.onload = function() { console.log('[LABEL] qr image load success'); res(); };
          img.onerror = function() { console.warn('[LABEL] qr image load error'); res(); };
          img.src = qrSrc;
        });
      }

      console.log('[LABEL] preview render start - qrSrc length:', qrSrc.length);
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

      // QRが確実にプレビューDOMに入っていることを先に確認
      if (qrSrc) {
        // プレビューに直接QR imgを一時表示して確認
        console.log('[LABEL] qr injected into preview - dataUrl length:', qrSrc.length);
      } else {
        console.warn('[LABEL] qr build failed - qrSrc empty, will show error placeholder');
      }

      // PNG生成
      console.log('[LABEL] png build start - size:', dims.label);
      var pngDataUrl = null;
      try {
        pngDataUrl = await _buildLabelPNG(html, dims);
        if (pngDataUrl) console.log('[LABEL] png build done - length:', pngDataUrl.length);
      } catch(pngErr) {
        console.warn('[LABEL] png build failed:', pngErr.message);
      }

      if (pngDataUrl) {
        window._currentLabel.pngDataUrl = pngDataUrl;
        _previewNow.innerHTML = '<img src="' + pngDataUrl + '" style="max-width:100%;height:auto;border-radius:4px;display:block" alt="ラベルプレビュー">';
        console.log('[LABEL] preview render done (PNG)');
      } else {
        var ifrW = Math.round(dims.wPx * 1.2);
        var ifrH = Math.round(dims.hPx * 1.2);
        _previewNow.innerHTML = '<iframe srcdoc="' + html.replace(/"/g,'&quot;') + '" style="width:' + ifrW + 'px;height:' + ifrH + 'px;border:none" scrolling="no"></iframe>';
        console.log('[LABEL] preview render done (iframe fallback)');
      }

      var bar = document.getElementById('lbl-action-bar');
      if (bar) { bar.style.display = 'block'; bar.scrollIntoView({ behavior:'smooth', block:'nearest' }); }

    } catch(err) {
      console.error('[LABEL] render error:', err.message);
      var errMount = document.getElementById('lbl-html-preview');
      if (errMount) errMount.innerHTML = '<div style="color:var(--red,#e05050);padding:16px;font-size:.8rem;text-align:center">⚠️ ラベル描画エラー<br><small>' + err.message + '</small></div>';
    }
  })();
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
    return '<div style="width:' + sz + 'px;height:' + sz + 'px;border:2px solid #000;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#000">QR</div>';
  }
  return '<div style="background:#fff;padding:4px;display:inline-block;line-height:0;border:2px solid #000">'
    + '<img src="' + qrSrc + '" style="width:' + sz + 'px;height:' + sz + 'px;display:block"></div>';
}

// ── ロット/個体 共通ラベル（62mm × 70mm） ───────────────────────
function _buildLabelHTML(ld, qrSrc) {
  var lt = ld.label_type || 'ind_fixed';
  var _rawStage = typeof _normStageForLabel === 'function' ? _normStageForLabel(ld.stage_code) : (ld.stage_code||'');
  var stageLbl  = typeof stageLabel === 'function' ? (stageLabel(_rawStage)||_rawStage||'') : _rawStage;
  var noteShort = (ld.note_private||'').slice(0, 28);

  if (lt === 'set')     return _buildSetLabelHTML(ld, null, qrSrc);
  if (lt === 'parent')  return _buildParentLabelHTML(ld, null, qrSrc);
  if (lt === 't1_unit') return _buildT1UnitLabelHTML(ld, null, qrSrc);

  var isLot = lt === 'multi_lot' || lt === 'egg_lot';
  var chk   = _chkThermal;
  var sexCats = (ld.size_category||'').split(',').map(function(s){ return s.trim(); });
  var headerLabel = isLot ? (lt === 'egg_lot' ? '卵管理' : '複数頭飼育') : '個別飼育';

  var records = ld.records || [];
  var maxRows = isLot ? 6 : 7;
  var sortedR = records.slice().sort(function(a,b){ return String(a.record_date||'').localeCompare(String(b.record_date||'')); });
  var recentR = sortedR.slice(-maxRows);
  while (recentR.length < maxRows) recentR.push(null);

  var tdS = 'border:1.5px solid #000;padding:2px 3px;font-size:7px;font-weight:700;color:#000';
  var thS = 'border:1.5px solid #000;padding:2px 3px;font-size:7px;font-weight:700;background:#000;color:#fff';

  var recRowsHtml = recentR.map(function(r) {
    if (!r) {
      return '<tr><td style="' + tdS + '">&nbsp;</td><td style="' + tdS + '">&nbsp;</td><td style="' + tdS + '">&nbsp;</td></tr>';
    }
    var d = String(r.record_date||'').slice(5);
    var w = r.weight_g ? r.weight_g + 'g' : '';
    return '<tr><td style="' + tdS + '">' + d + '</td><td style="' + tdS + '">' + w
      + '</td><td style="' + tdS + '">' + (isLot ? (r.exchange_type||'') : String(r.note_private||'').slice(0,6)) + '</td></tr>';
  }).join('');

  var sexInfo = !isLot && ld.sex
    ? '<div style="font-size:9px;font-weight:700;color:#000">' + ld.sex + '</div>'
    : '';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 70mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:70mm; font-family:sans-serif; font-size:7px; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:70mm;display:flex;flex-direction:column">\n'
    + '  <div style="background:#000;color:#fff;font-size:8px;font-weight:700;padding:1.5mm 2mm;height:5.5mm;display:flex;align-items:center;flex-shrink:0">'
    + headerLabel + ' | HerculesOS</div>\n'
    + '  <div style="display:flex;padding:1.5mm 1.5mm 0;gap:0;flex-shrink:0">\n'
    + '    <div style="flex-shrink:0;margin-right:2mm">' + _qrBox(qrSrc, 48) + '</div>\n'
    + '    <div style="flex:1;min-width:0;padding-left:2mm;border-left:2px solid #000">\n'
    + '      <div style="font-family:monospace;font-size:9px;font-weight:700;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px">' + (ld.display_id||'') + '</div>\n'
    + '      <div style="font-size:7.5px;font-weight:700;color:#000">L: ' + (ld.line_code||'—') + '</div>\n'
    + (ld.hatch_date ? '      <div style="font-size:7px;font-weight:700;color:#000">孵化: ' + ld.hatch_date + '</div>\n' : '')
    + (isLot && ld.count ? '      <div style="font-size:7px;font-weight:700;color:#000">' + ld.count + '頭</div>\n' : '')
    + '      ' + sexInfo + '\n'
    + '    </div>\n'
    + '  </div>\n'
    + '  <div style="border-top:1.5px solid #000;margin:1mm 1.5mm"></div>\n'
    + '  <div style="padding:0 1.5mm;flex-shrink:0">\n'
    + '    <div style="font-size:7px;font-weight:700;color:#000;line-height:1.9">\n'
    + '      <span>区分: ' + chk('大', sexCats.indexOf('大')>=0) + chk('中', sexCats.indexOf('中')>=0) + chk('小', sexCats.indexOf('小')>=0) + '</span><br>\n'
    + '      <span>マット: ' + ['T0','T1','T2','T3'].map(function(m){ return chk(m, ld.mat_type===m); }).join('') + '</span><br>\n'
    + '      <span>モルト: ' + chk('ON', ld.mat_molt===true||ld.mat_molt==='true') + chk('OFF', !ld.mat_molt||ld.mat_molt==='false') + '&nbsp;&nbsp;ステージ: ' + (stageLbl||'—') + '</span>\n'
    + '    </div>\n'
    + '  </div>\n'
    + '  <div style="border-top:1.5px solid #000;margin:0.5mm 1.5mm"></div>\n'
    + '  <div style="flex:1;padding:0 1.5mm 1mm;overflow:hidden">\n'
    + '    <table style="width:100%;border-collapse:collapse">\n'
    + '      <thead><tr><th style="' + thS + '">日付</th><th style="' + thS + '">体重</th><th style="' + thS + '">' + (isLot ? '交換' : 'メモ') + '</th></tr></thead>\n'
    + '      <tbody>' + recRowsHtml + '</tbody>\n'
    + '    </table>\n'
    + '  </div>\n'
    + (noteShort
      ? '  <div style="height:4mm;background:#000;padding:0.5mm 2mm;font-size:6.5px;font-weight:700;color:#fff;overflow:hidden;white-space:nowrap">📝 ' + noteShort + '</div>\n'
      : '  <div style="height:4mm;background:#000"></div>\n')
    + '</div>\n</body></html>';
}

// ── 種親ラベル（62mm × 40mm）─────────────────────────────────────
function _buildParentLabelHTML(ld, _unused, qrSrc) {
  var qr = (typeof _unused === 'string' && _unused.startsWith('data:')) ? _unused : qrSrc;
  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 40mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:40mm; font-family:sans-serif; font-size:7px; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:40mm;display:flex;flex-direction:column">\n'
    + '  <div style="background:#000;color:#fff;font-size:8px;font-weight:700;padding:1mm 2mm;height:5mm;display:flex;align-items:center;flex-shrink:0">種親 | HerculesOS</div>\n'
    + '  <div style="display:flex;flex:1;padding:1.5mm 1.5mm;gap:2mm;overflow:hidden">\n'
    + '    <div style="flex-shrink:0">' + _qrBox(qr, 42) + '</div>\n'
    + '    <div style="flex:1;min-width:0;overflow:hidden">\n'
    + '      <div style="font-family:monospace;font-size:9px;font-weight:700;color:#000;margin-bottom:1.5mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (ld.display_id||'') + '</div>\n'
    + '      <div style="font-size:8px;font-weight:700;color:#000;margin-bottom:1mm">'
    + (ld.sex ? ld.sex + '&nbsp;&nbsp;' : '')
    + (ld.size_mm ? ld.size_mm + '&nbsp;&nbsp;' : '')
    + (ld.weight_g ? ld.weight_g : '')
    + '</div>\n'
    + (ld.locality||ld.generation ? '      <div style="font-size:7px;font-weight:700;color:#000">' + [ld.locality,ld.generation].filter(Boolean).join(' / ') + '</div>\n' : '')
    + (ld.eclosion_date ? '      <div style="font-size:7px;font-weight:700;color:#000">羽化: ' + ld.eclosion_date + '</div>\n' : '')
    + (ld.paternal_raw ? '      <div style="font-size:6.5px;font-weight:700;color:#000">♂: ' + ld.paternal_raw.slice(0,28) + '</div>\n' : '')
    + (ld.maternal_raw ? '      <div style="font-size:6.5px;font-weight:700;color:#000">♀: ' + ld.maternal_raw.slice(0,28) + '</div>\n' : '')
    + '    </div>\n'
    + '  </div>\n'
    + '</div>\n</body></html>';
}

// ── 産卵セットラベル（62mm × 40mm）──────────────────────────────
function _buildSetLabelHTML(ld, _unused, qrSrc) {
  var qr = (typeof _unused === 'string' && _unused.startsWith('data:')) ? _unused : qrSrc;
  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 40mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:40mm; font-family:sans-serif; font-size:7px; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:40mm;display:flex;flex-direction:column">\n'
    + '  <div style="background:#000;color:#fff;font-size:8px;font-weight:700;padding:1mm 2mm;height:5mm;display:flex;align-items:center;flex-shrink:0">産卵セット | HerculesOS</div>\n'
    + '  <div style="display:flex;flex:1;padding:1.5mm 1.5mm;gap:2mm;overflow:hidden">\n'
    + '    <div style="flex:1;min-width:0">\n'
    + '      <div style="font-family:monospace;font-size:9px;font-weight:700;color:#000;margin-bottom:1.5mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (ld.display_id||'') + '</div>\n'
    + (ld.father_info ? '      <div style="font-size:7.5px;font-weight:700;color:#000">♂ ' + ld.father_info + '</div>\n' : '')
    + (ld.mother_info ? '      <div style="font-size:7.5px;font-weight:700;color:#000">♀ ' + ld.mother_info + '</div>\n' : '')
    + (ld.pairing_start ? '      <div style="font-size:7px;font-weight:700;color:#000;margin-top:1mm">交尾開始: ' + ld.pairing_start + '</div>\n' : '')
    + (ld.set_start ? '      <div style="font-size:7px;font-weight:700;color:#000">産卵開始: ' + ld.set_start + '</div>\n' : '')
    + '      <div style="font-size:7px;font-weight:700;color:#000;margin-top:1.5mm;border-top:1.5px solid #000;padding-top:1mm">採卵数: _______ / 孵化: _______</div>\n'
    + '    </div>\n'
    + '    <div style="flex-shrink:0">' + _qrBox(qr, 42) + '</div>\n'
    + '  </div>\n'
    + '</div>\n</body></html>';
}

// ── T1飼育ユニットラベル（62mm × 70mm）──────────────────────────
function _buildT1UnitLabelHTML(ld, _unused, qrSrc) {
  var qr = (typeof _unused === 'string' && _unused.startsWith('data:')) ? _unused : qrSrc;
  var chk = _chkThermal;
  var forSale = !!ld.for_sale;
  var hc = ld.head_count || 2;
  var size = ld.size_category || '';
  var hdate = (ld.hatch_date||'').slice(5);
  var mat = ld.mat_type || 'T1';
  var lineCode = ld.line_code || '';
  var originLS = ld.origin_lots_str || '';

  var saleBadge = forSale
    ? ' <span style="background:#fff;color:#000;font-size:6px;font-weight:700;padding:1px 4px;border:1px solid #fff">販売候補</span>'
    : '';

  var tdS = 'border:1.5px solid #000;padding:2px 3px;font-size:7px;font-weight:700;color:#000';
  var thS = 'border:1.5px solid #000;padding:2px 3px;font-size:7px;font-weight:700;background:#000;color:#fff';

  var m1w = (ld.members&&ld.members[0]) ? ld.members[0].weight_g : '';
  var m2w = (ld.members&&ld.members[1]) ? ld.members[1].weight_g : '';

  var emptyRow = '<tr><td style="' + tdS + '">&nbsp;</td><td style="' + tdS + '">&nbsp;</td><td style="' + tdS + '">&nbsp;</td><td style="' + tdS + '">&nbsp;</td></tr>';

  var recRows = '<tr><th style="' + thS + '">日付</th><th style="' + thS + '">体重①g</th><th style="' + thS + '">体重②g</th><th style="' + thS + '">交換</th></tr>'
    + '<tr><td style="' + tdS + '">T1移行</td>'
    + '<td style="' + tdS + ';text-align:right">' + (m1w ? m1w+'g' : '&nbsp;') + '</td>'
    + '<td style="' + tdS + ';text-align:right">' + (m2w ? m2w+'g' : '&nbsp;') + '</td>'
    + '<td style="' + tdS + '">全交換</td></tr>'
    + emptyRow + emptyRow + emptyRow + emptyRow;

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 70mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:70mm; font-family:sans-serif; font-size:7px; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:70mm;display:flex;flex-direction:column">\n'
    + '  <div style="background:#000;color:#fff;font-size:8px;font-weight:700;padding:1.5mm 2mm;height:5.5mm;display:flex;align-items:center;flex-shrink:0">'
    + 'T1ユニット (' + hc + '頭)' + saleBadge + '</div>\n'
    + '  <div style="display:flex;padding:1.5mm 1.5mm 0;gap:0;flex-shrink:0">\n'
    + '    <div style="flex-shrink:0;margin-right:2mm">' + _qrBox(qr, 48) + '</div>\n'
    + '    <div style="flex:1;min-width:0;padding-left:2mm;border-left:2px solid #000">\n'
    + '      <div style="font-family:monospace;font-size:9px;font-weight:700;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (ld.display_id||'') + '</div>\n'
    + '      <div style="font-size:7px;font-weight:700;color:#000">' + lineCode + '&nbsp;&nbsp;孵化: ' + hdate + '</div>\n'
    + (originLS ? '      <div style="font-size:7px;font-weight:700;color:#000">' + originLS + '</div>\n' : '')
    + '      <div style="font-size:7px;font-weight:700;color:#000;margin-top:1px">' + chk('大',size==='大') + chk('中',size==='中') + chk('小',size==='小') + '</div>\n'
    + '      <div style="font-size:7px;font-weight:700;color:#000">' + ['T0','T1','T2','T3'].map(function(m){ return chk(m, mat===m); }).join('') + '</div>\n'
    + '      <div style="font-size:7px;font-weight:700;color:#000">' + ['L1L2','L3','前蛹'].map(function(s){ return chk(s,false); }).join('') + '</div>\n'
    + '    </div>\n'
    + '  </div>\n'
    + '  <div style="border-top:1.5px solid #000;margin:0.5mm 1.5mm"></div>\n'
    + '  <div style="flex:1;padding:0 1.5mm 1mm;overflow:hidden">\n'
    + '    <table style="width:100%;border-collapse:collapse">\n'
    + '      <tbody>' + recRows + '</tbody>\n'
    + '    </table>\n'
    + '  </div>\n'
    + '  <div style="height:3mm;background:#000"></div>\n'
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
