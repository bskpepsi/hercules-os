// ════════════════════════════════════════════════════════════════
// label.js v3 — ラベル生成（HTML + print() ベース）
//
// v3 変更点:
//   - 詳細画面からの直行モード（isDirectMode）でプレビュー自動生成
//   - 戻るボタンで元の詳細画面に戻れる
//   - 発行後アクションバーにショートカット追加
//   - PAR（種親）対応
//   - ラベル種別の前回値引き継ぎ
//   - scan.js QR読み取り後の PAR ルーティング対応済み（scan.js側）
// ════════════════════════════════════════════════════════════════
'use strict';

// ── ステージコード正規化（ラベル表示用）────────────────────────
function _normStageForLabel(code) {
  if (!code) return '';
  var MAP = {
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
  { code: 'egg_lot',   label: '① 卵管理',     target: 'LOT', desc: '採卵後・孵化日/頭数は後で補完' },
  { code: 'multi_lot', label: '② 複数頭飼育', target: 'LOT', desc: 'ロット管理用（記録表付き）' },
  { code: 'ind_fixed', label: '③ 個別飼育',   target: 'IND', desc: '個体管理用（履歴引継ぎ）' },
  { code: 'set',       label: '④ 産卵セット', target: 'SET', desc: '親情報・開始日' },
  { code: 'parent',    label: '⑤ 種親',       target: 'PAR', desc: '種親QR・血統タグ' },
];

// ラベルデータ + ラベル種別の前回値（targetTypeごとに保持）
window._currentLabel = { displayId: '', fileName: '', html: '', dataUrl: '' };
window._lastLabelType = {};  // { IND: 'ind_fixed', LOT: 'multi_lot', ... }

// ── デフォルトラベル種別 ──────────────────────────────────────
function _defaultLabelType(targetType) {
  if (window._lastLabelType[targetType]) return window._lastLabelType[targetType];
  if (targetType === 'LOT')  return 'multi_lot';
  if (targetType === 'UNIT') return 't1_unit';
  if (targetType === 'SET') return 'set';
  if (targetType === 'PAR') return 'parent';
  return 'ind_fixed';
}

// ── 遷移元の詳細ページキー（戻るボタン用）────────────────────
function _detailPageKey(targetType, targetId) {
  if (targetType === 'IND') return { page: 'ind-detail',    params: { indId: targetId } };
  if (targetType === 'LOT') return { page: 'lot-detail',    params: { lotId: targetId } };
  if (targetType === 'PAR') return { page: 'parent-detail', params: { parId: targetId } };
  if (targetType === 'SET')  return { page: 'pairing-detail',params: { pairingId: targetId } };
  if (targetType === 'UNIT') return { page: 't1-session',    params: {} };  // BU: → t1-session
  return null;
}

// ── ラベル生成ページ ─────────────────────────────────────────────
Pages.labelGen = function (params = {}) {
  const main = document.getElementById('main');
  let targetType      = params.targetType || 'IND';
  let targetId        = params.targetId   || '';
  let labelType       = params.labelType  || _defaultLabelType(targetType);
  // UNIT モード: displayId ベースで動作（unit_id は保存前にない場合あり）
  const _isUnitMode   = targetType === 'UNIT';
  const _unitDisplayId= params.displayId  || targetId || '';
  const _unitForSale  = !!params.forSale;
  // backRoute 対応（t1-session などカスタム戻り先）
  const _backRoute    = params.backRoute  || null;
  const _backParam    = params.backParam  || (params.labeledDisplayId ? { labeledDisplayId: params.labeledDisplayId } : {});
  // 卵ロット一括発行キューパラメータ
  const _eblQueueIdx   = params._eblQueueIdx   !== undefined ? parseInt(params._eblQueueIdx,10)   : -1;
  const _eblQueueTotal = params._eblQueueTotal  !== undefined ? parseInt(params._eblQueueTotal,10) : 0;
  const _inEblQueue    = _eblQueueIdx >= 0 && _eblQueueTotal > 0;

  const inds = Store.filterIndividuals({ status: 'alive' });
  const lots = Store.filterLots({ status: 'active' });
  const pars = Store.getDB('parents') || [];

  // 詳細画面から来た場合は直行モード
  const isDirectMode = !!params.targetId || _isUnitMode;
  const origin       = isDirectMode ? _detailPageKey(targetType, targetId) : null;

  // ヘッダーの戻るボタン
  // 一括発行キューモード → 完了画面へ戻る / 直行モード → 詳細へ / それ以外 → Store.back()
  // ヘッダー戻るボタン
  // 一括発行キューモード → 完了一覧へ直接戻る（前のラベルではなく一覧へ）
  // 直行モード            → 詳細画面へ
  // それ以外             → Store.back()
  const headerOpts = _backRoute
    ? { back: true, backFn: `routeTo('${_backRoute}',${JSON.stringify(_backParam)})` }
    : _inEblQueue
      ? { back: true, backFn: "routeTo('egg-lot-bulk',{_showComplete:true})" }
      : (isDirectMode && origin
          ? { back: true, backFn: `routeTo('${origin.page}',${JSON.stringify(origin.params)})` }
          : { back: true });

  function render() {
    main.innerHTML = `
      ${UI.header('ラベル発行', headerOpts)}
      <div class="page-body">

        ${!isDirectMode ? `
        <!-- 対象選択（直行モード以外のみ） -->
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
                ${l.display_id} ${stageLabel(l.stage)} (${l.count}頭)</option>`).join('')}
            </select>`}
        </div>

        <!-- 種別選択（直行モード以外のみ） -->
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
          ${targetId
            ? `<div class="card-title">プレビュー（70mm × 50mm）</div>
               <div id="lbl-html-preview" style="transform-origin:top left;margin-bottom:12px;
                 border:1px solid var(--border2);border-radius:4px;overflow:hidden;
                 background:#fff;width:264px;height:189px;
                 display:flex;align-items:center;justify-content:center">
                 <div style="color:var(--text3);font-size:.8rem;text-align:center">
                   <div class="spinner" style="margin:0 auto 8px"></div>
                   プレビューを生成中...
                 </div>
               </div>
               <div id="lbl-qr-hidden" style="position:absolute;left:-9999px;top:-9999px;width:96px;height:96px;overflow:hidden"></div>`
            : `<div style="color:var(--text3);font-size:.85rem;text-align:center;padding:20px">
                 対象を選択するとプレビューが表示されます
               </div>`}
        </div>

        <!-- 発行後アクション（初期非表示・生成後に表示） -->
        <div id="lbl-action-bar" style="display:none;margin-top:8px">
          <div style="background:rgba(45,122,82,.10);border:1px solid rgba(45,122,82,.35);
            border-radius:var(--radius);padding:14px 16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <span style="font-size:1.1rem">✅</span>
              <span style="font-size:.88rem;font-weight:700;color:var(--green)">ラベル生成完了</span>
            </div>
            <!-- 主アクション: 印刷 -->
            <button class="btn btn-primary btn-full"
              style="font-size:.95rem;padding:14px;font-weight:700;margin-bottom:8px"
              onclick="Pages._lblPrint()">
              🖨 印刷する（1枚）
            </button>
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <button class="btn btn-ghost" style="flex:1" onclick="Pages._lblPrint()">🖨 再印刷</button>
              <button class="btn btn-ghost" style="flex:1"
                onclick="Pages._lblGenerate('${targetType}','${targetId}','${labelType}')">🔄 再生成</button>
            </div>
            ${_inEblQueue ? `
            <!-- 一括発行キューナビゲーション -->
            <div style="display:flex;gap:8px;margin-top:4px">
              <div style="font-size:.72rem;color:var(--text3);padding:4px 0;flex:1;text-align:center">
                ${_eblQueueIdx+1} / ${_eblQueueTotal}枚目
              </div>
            </div>
            ${_eblQueueIdx + 1 < _eblQueueTotal ? `
            <button class="btn btn-primary btn-full" style="margin-top:4px;font-weight:700"
              onclick="window._eblGoNextLabel(${_eblQueueIdx})">
              次のラベルへ →（${_eblQueueIdx+2}/${_eblQueueTotal}枚目）
            </button>` : `
            <button class="btn btn-ghost btn-full" style="margin-top:4px;font-weight:700;color:var(--green)"
              onclick="window._eblGoNextLabel(${_eblQueueIdx})">
              ✅ 完了画面へ戻る（全${_eblQueueTotal}枚発行済み）
            </button>`}` : origin ? `
            <!-- 通常の詳細戻り -->
            <button class="btn btn-ghost btn-full" style="margin-top:2px;font-size:.82rem"
              onclick="routeTo('${origin.page}',${JSON.stringify(origin.params)})">
              ← ${targetType==='IND'?'個体':targetType==='LOT'?'ロット':targetType==='PAR'?'種親':'詳細'}に戻る
            </button>` : ''}
            <div style="font-size:.7rem;color:var(--text3);margin-top:10px;line-height:1.6;
              padding-top:8px;border-top:1px solid var(--border)">
              💡 印刷: ブラウザの印刷ダイアログで「カスタム 70×50mm」/ 余白なし / 実寸で印刷。
              PDFに保存してPhomemoアプリで印刷も可能。
            </div>
          </div>
        </div>

      </div>`;

    if (targetId) {
      // 直行モードは即座に自動生成、手動モードも選択後に自動生成
      // UNIT モードは targetId が空でも displayId があれば生成可能
    const _autoTargetId = (_isUnitMode && !targetId) ? _unitDisplayId : targetId;
    setTimeout(() => Pages._lblGenerate(targetType, _autoTargetId, labelType), 150);
    }
  }

  Pages._lblSetType = (t) => {
    targetType = t;
    targetId = '';
    labelType = _defaultLabelType(t);
    render();
  };
  Pages._lblSetTarget    = (id) => { targetId = id; render(); };
  Pages._lblSetLabelType = (t)  => {
    labelType = t;
    window._lastLabelType[targetType] = t;  // 次回のデフォルトに使う
    render();
  };
  render();
};

// ── ラベル生成メイン ─────────────────────────────────────────────
Pages._lblGenerate = async function (targetType, targetId, labelType) {
  if (!targetId) return;
  const preview = document.getElementById('lbl-html-preview');
  if (!preview) return;

  let ld;
  try {
    if (targetType === 'IND') {
      const ind  = Store.getIndividual(targetId) || {};
      const line = Store.getLine(ind.line_id)    || {};
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
        records:      records.slice().sort((a,b) => String(b.record_date).localeCompare(String(a.record_date))).slice(0, 8),
        label_type:   labelType || 'ind_fixed',
      };
    } else if (targetType === 'LOT') {
      const lot  = Store.getLot(targetId)     || {};
      const line = Store.getLine(lot.line_id) || {};
      const records = Store.getGrowthRecords(targetId) || [];
      const isMolt  = lot.mat_molt === true || lot.mat_molt === 'true';
      const autoType = (lot.stage === 'EGG' || lot.stage === 'T0' || lot.stage === 'L1L2') ? 'egg_lot' : 'multi_lot';
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
        records:      records.slice().sort((a,b) => String(b.record_date).localeCompare(String(a.record_date))).slice(0, 8),
        label_type:   labelType || autoType,
      };
    } else if (targetType === 'PAR') {
      const par = (Store.getDB('parents') || []).find(p => p.par_id === targetId) || {};
      const pTags = (() => { try { return JSON.parse(par.paternal_tags || '[]') || []; } catch(e) { return []; } })();
      const mTags = (() => { try { return JSON.parse(par.maternal_tags || '[]') || []; } catch(e) { return []; } })();
      ld = {
        qr_text:      `PAR:${par.par_id || targetId}`,
        display_id:   par.parent_display_id || par.display_name || targetId,
        line_code:    '',
        stage_code:   '',
        sex:          par.sex  || '',
        size_mm:      par.size_mm ? par.size_mm + 'mm' : '',
        weight_g:     par.weight_g ? par.weight_g + 'g' : '',
        locality:     par.locality || '',
        generation:   par.generation || '',
        eclosion_date:par.eclosion_date || '',
        paternal_raw: par.paternal_raw || '',
        maternal_raw: par.maternal_raw || '',
        paternal_tags:pTags,
        maternal_tags:mTags,
        note_private: par.note || '',
        hatch_date:   '',
        records:      [],
        label_type:   'parent',
      };
    } else if (targetType === 'UNIT') {
      // UNIT: displayId ベース（unit_id は保存前にないケースあり）
      const unit = Store.getUnitByDisplayId(_unitDisplayId)
        || (Store.getDB('breeding_units') || []).find(u => u.display_id === _unitDisplayId || u.unit_id === targetId)
        || {};
      const lineId = unit.line_id || '';
      const line   = lineId ? (Store.getLine(lineId) || {}) : {};
      ld = {
        qr_text:        `BU:${_unitDisplayId}`,
        display_id:     _unitDisplayId,
        line_code:      line.line_code || line.display_id || '',
        stage_code:     'T1',
        head_count:     unit.head_count || 2,
        size_category:  unit.size_category || '',
        hatch_date:     unit.hatch_date || '',
        mat_type:       unit.mat_type  || 'T1',
        for_sale:       _unitForSale,
        members:        unit.members   || [],
        records:        [],
        label_type:     't1_unit',
        note_private:   unit.note || '',
      };
    } else {
      const set = (Store.getDB('pairings') || []).find(p => p.set_id === targetId) || {};
      ld = {
        qr_text:       `SET:${set.set_id || targetId}`,
        display_id:    set.display_id    || set.set_name || targetId,
        father_info:   set.father_display_name || '',
        mother_info:   set.mother_display_name || '',
        pairing_start: set.pairing_start || '',
        set_start:     set.set_start     || '',
        label_type:    'set',
      };
    }
  } catch (e) {
    UI.toast('ラベルデータ生成失敗: ' + e.message, 'error');
    return;
  }

  // QR生成
  const qrDiv = document.getElementById('lbl-qr-hidden');
  if (qrDiv) {
    qrDiv.innerHTML = '';
    try {
      new QRCode(qrDiv, {
        text: ld.qr_text || targetType + ':' + targetId,
        width: 96, height: 96,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch(e) { console.warn('QR生成失敗:', e); }
  }

  setTimeout(() => {
    let qrSrc = '';
    // canvas優先（QRCode.jsはcanvasを先に生成してからimgに変換）
    const qrCanvas = qrDiv?.querySelector('canvas');
    const qrImg    = qrDiv?.querySelector('img');
    if (qrCanvas && qrCanvas.width > 0 && qrCanvas.height > 0) {
      try { qrSrc = qrCanvas.toDataURL('image/png'); } catch(e) {}
    }
    if (!qrSrc && qrImg && qrImg.src && !qrImg.src.startsWith('data:') === false) {
      qrSrc = qrImg.src;
    }
    if (!qrSrc && qrImg && qrImg.src) {
      qrSrc = qrImg.src;
    }

    const html = _buildLabelHTML(ld, qrSrc);
    window._currentLabel = {
      displayId: ld.display_id,
      fileName: (ld.line_code ? ld.line_code.replace(/[^a-zA-Z0-9_-]/g,'_') + '_' : '') +
                ld.display_id.replace(/[^a-zA-Z0-9_-]/g,'_') + '_label.html',
      html: html,
      dataUrl: null,
    };

    preview.innerHTML = `<iframe srcdoc="${html.replace(/"/g,'&quot;')}"
      style="width:264px;height:189px;border:none;transform-origin:top left"
      scrolling="no"></iframe>`;

    const bar = document.getElementById('lbl-action-bar');
    if (bar) {
      bar.style.display = 'block';
      // スクロールして見えるように
      bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 500);
};

// ── HTMLラベル構築 ────────────────────────────────────────────────
function _buildLabelHTML(ld, qrSrc) {
  const lt = ld.label_type || 'ind_fixed';
  const _rawStage = typeof _normStageForLabel === 'function' ? _normStageForLabel(ld.stage_code) : (ld.stage_code || '');
  const stageLbl = typeof stageLabel === 'function' ? (stageLabel(_rawStage) || _rawStage || '') : _rawStage;
  const matLbl   = ld.mat_type ? (ld.mat_type + (ld.mat_molt ? '(M)' : '')) : '';
  const noteShort = (ld.note_private || '').slice(0, 40);
  // QRコード: 周囲に静穏領域（白余白）を確保して可読性を最優先
  // QR: 専用固定幅ブロック内に配置。padding で静穏領域確保、周囲に文字を近づけない
  const qrHtml   = qrSrc
    ? `<div style="background:#fff;padding:4px;display:inline-block;line-height:0;border:1px solid #f0f0f0"><img src="${qrSrc}" style="width:44px;height:44px;display:block"></div>`
    : '<div style="background:#f5f5f5;padding:4px;display:inline-flex;width:52px;height:52px;align-items:center;justify-content:center;font-size:7px;text-align:center;line-height:1.2">QR</div>';

  const chk = (label, checked) =>
    `<span style="margin-right:4px"><span style="font-size:7px">${checked ? '■' : '□'}</span>${label}</span>`;
  const sexCats = (ld.size_category || '').split(',').map(s => s.trim());

  if (lt === 'set')     return _buildSetLabelHTML(ld, qrHtml);
  if (lt === 'parent')  return _buildParentLabelHTML(ld, qrHtml);
  if (lt === 't1_unit') return _buildT1UnitLabelHTML(ld, qrHtml);

  const isLot = lt === 'multi_lot' || lt === 'egg_lot';
  const records = ld.records || [];
  const maxRows  = isLot ? 6 : 7;
  // 古い順（上）→ 新しい順（下）に並べる
  const sortedRecs = records.slice().sort((a,b) => String(a.record_date||'').localeCompare(String(b.record_date||'')));
  // 最新 maxRows 件を取って古い順に並べる（最新N件だけ表示、それを古い順に）
  const recentRecs = sortedRecs.slice(-maxRows);
  const recRows    = [...recentRecs];
  while (recRows.length < maxRows) recRows.push(null);

  const recRowsHtml = recRows.map(r => {
    if (!r) return isLot
      ? `<tr><td style="border:1px solid #ccc;padding:1px 2px;width:22mm">&nbsp;</td><td style="border:1px solid #ccc;padding:1px 2px;width:14mm">&nbsp;</td><td style="border:1px solid #ccc;padding:1px 2px;width:14mm">&nbsp;</td><td style="border:1px solid #ccc;padding:1px 2px;width:17mm">&nbsp;</td></tr>`
      : `<tr><td style="border:1px solid #ccc;padding:1px 2px;width:22mm">&nbsp;</td><td style="border:1px solid #ccc;padding:1px 2px;width:18mm">&nbsp;</td><td style="border:1px solid #ccc;padding:1px 2px;width:23mm">&nbsp;</td></tr>`;
    const d = String(r.record_date || '').replace(/\d{4}\//,'');
    const w = r.weight_g ? r.weight_g + 'g' : '';
    return isLot
      ? `<tr><td style="border:1px solid #ccc;padding:1px 2px;font-size:6px">${d}</td><td style="border:1px solid #ccc;padding:1px 2px;font-size:6px">${w}</td><td style="border:1px solid #ccc;padding:1px 2px;font-size:6px"></td><td style="border:1px solid #ccc;padding:1px 2px;font-size:6px">${(r.exchange_type||'')}</td></tr>`
      : `<tr><td style="border:1px solid #ccc;padding:1px 2px;font-size:6px">${d}</td><td style="border:1px solid #ccc;padding:1px 2px;font-size:6px">${w}</td><td style="border:1px solid #ccc;padding:1px 2px;font-size:6px">${(r.note_private||'').slice(0,8)}</td></tr>`;
  }).join('');

  const headerColor = isLot ? '#5ba8e8' : '#2d7a52';
  const headerLabel = isLot ? (lt === 'egg_lot' ? '① 卵管理' : '② 複数頭飼育') : '③ 個別飼育';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page { size: 70mm 50mm; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:70mm; height:50mm; font-family:'Noto Sans JP',sans-serif;
    font-size:7px; background:#fff; color:#111; overflow:hidden; }
  .lbl-wrap { width:70mm; height:50mm; display:flex; flex-direction:column; }
  .lbl-header { background:${headerColor}; color:#fff; font-size:7px; font-weight:700;
    padding:1mm 2mm; height:4mm; display:flex; align-items:center; }
  /* lbl-top: 2行×2列 grid。QRは左1列全行、右列を上段情報/下段性別で分割 */
  .lbl-top {
    display: grid;
    grid-template-columns: 16mm 1fr;
    grid-template-rows: auto auto;
    padding: 1mm 1mm 0;
    gap: 0;
    min-height: 16mm;
  }
  /* QR: 左列、2行span。縦いっぱいを専有 */
  .lbl-qr {
    grid-column: 1;
    grid-row: 1 / 3;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-right: 2mm;
  }
  /* 右上: 基本情報 */
  .lbl-info {
    grid-column: 2;
    grid-row: 1;
    font-size: 7px;
    line-height: 1.5;
    padding-left: 1mm;
    border-left: 1px solid #ddd;
  }
  .lbl-info-id { font-size:8px; font-weight:700; color:#1a3a1a; font-family:monospace;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom:1px; }
  /* 右下: 性別行。QRのgrid-row:1の高さの外に確実に配置される */
  .lbl-sex {
    grid-column: 2;
    grid-row: 2;
    font-size: 6.5px;
    line-height: 1.4;
    padding-left: 1mm;
    padding-top: 1px;
    border-left: 1px solid #ddd;
    border-top: 1px dotted #eee;
  }
  .lbl-mid { display:flex; height:7mm; padding:0.5mm 1mm; gap:4mm; align-items:center; }
  .lbl-checks { font-size:6.5px; line-height:1.6; }
  .lbl-bottom { display:flex; flex:1; padding:0.5mm 1mm; gap:1mm; }
  .lbl-table-wrap { flex:1; }
  .lbl-table { width:100%; border-collapse:collapse; font-size:6px; }
  .lbl-table th { background:#f0f0f0; border:1px solid #ccc; padding:1px 2px; font-weight:700; }
  .lbl-memo { width:20mm; font-size:6px; border:1px solid #ccc; padding:2px; }
  .lbl-foot { height:3mm; background:#f8f8f8; padding:0.5mm 1mm;
    font-size:5.5px; color:#666; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  @media print {
    @page { size: 70mm 50mm; margin: 0; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>
<div class="lbl-wrap">
  <div class="lbl-header">${headerLabel} &nbsp;|&nbsp; HerculesOS</div>
  <!-- 上段: 2×2 grid。左列=QR(全行span)、右上=基本情報、右下=性別 -->
  <div class="lbl-top">
    <!-- 左列全行: QR専用 -->
    <div class="lbl-qr">${qrHtml}</div>
    <!-- 右上: display_id / L / 孵化日 / 頭数 のみ -->
    <div class="lbl-info">
      <div class="lbl-info-id">${ld.display_id}</div>
      <div style="font-size:7px;color:#555;margin-top:1px">L: <b>${ld.line_code||'—'}</b></div>
      ${ld.hatch_date ? `<div style="font-size:6px;color:#777">孵化: ${ld.hatch_date}</div>` : ''}
      ${isLot && ld.count ? `<div style="font-size:6px;color:#777">${ld.count}頭</div>` : ''}
      ${!isLot && ld.sex ? `<div style="font-size:7px;color:${ld.sex==='♂'?'#3366cc':'#cc3366'};font-weight:700">${ld.sex}</div>` : ''}
    </div>
    <!-- 右下: 性別。grid-row:2 なので QR(grid-row:1/3)の右下に入り、QR高さ帯の外 -->
    ${isLot ? `<div class="lbl-sex">${chk('♂',ld.sex_hint==='♂')}${chk('♀',ld.sex_hint==='♀')}${chk('混合',ld.sex_hint==='混合')}</div>` : '<div class="lbl-sex"></div>'}
  </div>
  <!-- 中段: 区分/マット/モルト/ステージのみ（♂♀ここに置かない） -->
  <div class="lbl-mid">
    <div class="lbl-checks">
      <div>区分: ${chk('大',sexCats.includes('大'))}${chk('中',sexCats.includes('中'))}${chk('小',sexCats.includes('小'))}</div>
      <div>マット: ${['T0','T1','T2','T3'].map(m => chk(m, ld.mat_type===m)).join('')}</div>
      <div>モルト: ${chk('ON',ld.mat_molt===true||ld.mat_molt==='true')}${chk('OFF',!ld.mat_molt||ld.mat_molt==='false')}</div>
      <div>ステージ: ${stageLbl||'—'}</div>
    </div>
  </div>
  <div class="lbl-bottom">
    <div class="lbl-table-wrap">
      <table class="lbl-table">
        <thead>
          <tr>
            <th>日付</th>
            ${isLot ? '<th>体重①</th><th>体重②</th><th>メモ</th>' : '<th>体重</th><th>メモ</th>'}
          </tr>
        </thead>
        <tbody>${recRowsHtml}</tbody>
      </table>
    </div>
    <div class="lbl-memo" style="overflow:hidden;word-break:break-all">メモ欄</div>
  </div>
  <div class="lbl-foot">${noteShort ? '📝 ' + noteShort : ''}</div>
</div>
</body></html>`;
}

// ── 種親ラベル ───────────────────────────────────────────────────
function _buildParentLabelHTML(ld, qrHtml) {
  const tagHtml = (tags, color) => tags.map(t =>
    `<span style="font-size:5.5px;padding:1px 4px;border-radius:8px;background:${color}22;color:${color};border:1px solid ${color}44">${t}</span>`
  ).join(' ');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page { size: 70mm 50mm; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:70mm; height:50mm; font-family:'Noto Sans JP',sans-serif; font-size:7px; background:#fff; color:#111; overflow:hidden; }
  @media print { @page { size: 70mm 50mm; margin: 0; } body { -webkit-print-color-adjust: exact; } }
</style></head><body>
<div style="width:70mm;height:50mm;display:flex;flex-direction:column">
  <div style="background:#c8a84b;color:#1a1200;font-size:7px;font-weight:700;padding:1mm 2mm;height:4mm;display:flex;align-items:center">
    種親 &nbsp;|&nbsp; HerculesOS
  </div>
  <div style="display:flex;flex:1;padding:1.5mm 2mm;gap:2mm">
    <div style="flex-shrink:0">${qrHtml}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:9px;font-weight:700;color:#8a6a00;font-family:monospace;margin-bottom:1mm">${ld.display_id}</div>
      <div style="display:flex;gap:3mm;margin-bottom:1mm">
        ${ld.sex    ? `<span style="font-size:8px;font-weight:700;color:${ld.sex==='♂'?'#3366cc':'#cc3366'}">${ld.sex}</span>` : ''}
        ${ld.size_mm? `<span style="font-size:7px;font-weight:700;color:#2d7a52">${ld.size_mm}</span>` : ''}
        ${ld.weight_g? `<span style="font-size:6.5px;color:#555">${ld.weight_g}</span>` : ''}
      </div>
      ${ld.locality || ld.generation ? `<div style="font-size:6px;color:#777;margin-bottom:1mm">${[ld.locality,ld.generation].filter(Boolean).join(' / ')}</div>` : ''}
      ${ld.eclosion_date ? `<div style="font-size:6px;color:#777;margin-bottom:1.5mm">羽化: ${ld.eclosion_date}</div>` : ''}
      ${ld.paternal_raw ? `<div style="font-size:5.5px;color:#555;margin-bottom:1mm">♂: ${ld.paternal_raw.slice(0,35)}</div>` : ''}
      ${ld.paternal_tags && ld.paternal_tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:1mm">${tagHtml(ld.paternal_tags.slice(0,5),'#3366cc')}</div>` : ''}
      ${ld.maternal_raw ? `<div style="font-size:5.5px;color:#555;margin-bottom:1mm">♀: ${ld.maternal_raw.slice(0,35)}</div>` : ''}
      ${ld.maternal_tags && ld.maternal_tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:2px">${tagHtml(ld.maternal_tags.slice(0,5),'#cc3366')}</div>` : ''}
    </div>
  </div>
</div>
</body></html>`;
}

// ── 産卵セットラベル ─────────────────────────────────────────────
function _buildSetLabelHTML(ld, qrHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page { size: 70mm 50mm; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:70mm; height:50mm; font-family:'Noto Sans JP',sans-serif; background:#fff; color:#111; }
  @media print { @page { size: 70mm 50mm; margin: 0; } body { -webkit-print-color-adjust: exact; } }
</style></head><body>
<div style="width:70mm;height:50mm;display:flex;flex-direction:column">
  <div style="background:#c8a84b;color:#1a1200;font-size:7px;font-weight:700;padding:1mm 2mm;height:4mm;display:flex;align-items:center">
    ④ 産卵セット
  </div>
  <div style="display:flex;flex:1;padding:1mm;gap:2mm">
    <div style="flex:1">
      <div style="font-size:9px;font-weight:700;color:#8a6a00;font-family:monospace;margin-bottom:1mm">${ld.display_id}</div>
      ${ld.father_info ? `<div style="font-size:7px">♂ ${ld.father_info}</div>` : ''}
      ${ld.mother_info ? `<div style="font-size:7px">♀ ${ld.mother_info}</div>` : ''}
      ${ld.pairing_start ? `<div style="font-size:6.5px;color:#555;margin-top:1mm">交尾開始: ${ld.pairing_start}</div>` : ''}
      ${ld.set_start     ? `<div style="font-size:6.5px;color:#555">産卵開始: ${ld.set_start}</div>` : ''}
      <div style="margin-top:2mm;font-size:6px;color:#888">採卵数: _______ / 孵化数: _______</div>
    </div>
    <div style="flex-shrink:0">${qrHtml}</div>
  </div>
</div>
</body></html>`;
}

// ── 印刷 ────────────────────────────────────────────────────────
Pages._lblPrint = function () {
  const label = window._currentLabel || {};
  if (!label.html) { UI.toast('先に「ラベル生成」を実行してください', 'error'); return; }
  const win = window.open('', '_blank');
  if (!win) { UI.toast('ポップアップをブロックされました。ブラウザ設定でポップアップを許可してください', 'error'); return; }
  win.document.write(label.html);
  win.document.close();
  win.onload = () => { win.print(); };
};

Pages._lblDownload = function () { Pages._lblPrint(); };
Pages._lblOpenDrive = function () {
  const url = window._currentLabel?.driveUrl;
  if (url) window.open(url, '_blank');
  else UI.toast('Driveに保存されていません', 'info');
};

window._currentLabel = window._currentLabel || { displayId:'', fileName:'', html:'', dataUrl:'' };
window._lastLabelType = window._lastLabelType || {};

window.PAGES['label-gen'] = () => Pages.labelGen(Store.getParams());

// ════════════════════════════════════════════════════════════════
// T1飼育ユニット ラベル (t1_unit)
// QR: BU:{display_id}
// サイズ: 70mm × 50mm
// ════════════════════════════════════════════════════════════════
function _buildT1UnitLabelHTML(ld, qrHtml) {
  const forSale = !!ld.for_sale;
  const hc      = ld.head_count || 2;
  const size    = ld.size_category || '';
  const hdate   = (ld.hatch_date || '').replace(/\d{4}\//,'');
  const mat     = ld.mat_type || 'T1';
  const lineCode= ld.line_code || '';

  // 販売候補バッジ（forSale=true のときだけ表示）
  const saleBadge = forSale
    ? `<span style="background:#e05050;color:#fff;font-size:5.5px;font-weight:700;
        padding:0.5px 3px;border-radius:2px;margin-left:3px">販売候補</span>`
    : '';

  // 区分チェックボックス（大/中/小）
  const chk = (label, checked) =>
    `<span style="margin-right:4px"><span style="font-size:6.5px">${checked?'■':'□'}</span>${label}</span>`;

  const bigChk  = chk('大', size==='大');
  const midChk  = chk('中', size==='中');
  const smlChk  = chk('小', size==='小');

  // マット / ステージのチェックボックス行
  const matRow   = ['T0','T1','T2','T3'].map(m => chk(m, mat===m)).join('');
  const stageRow = ['L1L2','L3','前蛹'].map(s => chk(s, false)).join('');

  // 記録行（体重①②）
  const weightRow = (slot, initWeight) => `
    <tr>
      <td style="border:1px solid #ccc;padding:1px 2px;width:20mm;font-size:6px">&nbsp;</td>
      <td style="border:1px solid #ccc;padding:1px 2px;width:14mm;font-size:6.5px;text-align:right">
        ${initWeight ? initWeight + 'g' : '&nbsp;'}
      </td>
      <td style="border:1px solid #ccc;padding:1px 2px;width:14mm;font-size:6px">&nbsp;</td>
      <td style="border:1px solid #ccc;padding:1px 2px;width:10mm;font-size:5.5px">①${slot}</td>
    </tr>`;

  // 初期体重を members から取得
  const m1w = (ld.members && ld.members[0]) ? ld.members[0].weight_g : '';
  const m2w = (ld.members && ld.members[1]) ? ld.members[1].weight_g : '';

  const recRows = `
    <tr style="background:#f0f8ff">
      <td style="border:1px solid #ccc;padding:1px 2px;font-size:5.5px;font-weight:700">日付</td>
      <td style="border:1px solid #ccc;padding:1px 2px;font-size:5.5px;font-weight:700">体重①g</td>
      <td style="border:1px solid #ccc;padding:1px 2px;font-size:5.5px;font-weight:700">体重②g</td>
      <td style="border:1px solid #ccc;padding:1px 2px;font-size:5.5px;font-weight:700">交換</td>
    </tr>
    <tr>
      <td style="border:1px solid #ccc;padding:1px 2px;font-size:5.5px">T1移行</td>
      <td style="border:1px solid #ccc;padding:1px 2px;font-size:6.5px;text-align:right">${m1w ? m1w+'g' : '&nbsp;'}</td>
      <td style="border:1px solid #ccc;padding:1px 2px;font-size:6.5px;text-align:right">${m2w ? m2w+'g' : '&nbsp;'}</td>
      <td style="border:1px solid #ccc;padding:1px 2px;font-size:5.5px">全交換</td>
    </tr>
    ${['','','',''].map(() => `
    <tr>
      <td style="border:1px solid #ccc;padding:1px 2px;width:20mm">&nbsp;</td>
      <td style="border:1px solid #ccc;padding:1px 2px;width:14mm">&nbsp;</td>
      <td style="border:1px solid #ccc;padding:1px 2px;width:14mm">&nbsp;</td>
      <td style="border:1px solid #ccc;padding:1px 2px;width:10mm">&nbsp;</td>
    </tr>`).join('')}`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page { size: 70mm 50mm; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:70mm; height:50mm; font-family:'Noto Sans JP',sans-serif;
    font-size:7px; background:#fff; color:#111; overflow:hidden; }
  .lbl-wrap { width:70mm; height:50mm; display:flex; flex-direction:column; }
</style>
</head><body>
<div class="lbl-wrap">
  <!-- ヘッダー -->
  <div style="background:#2d7a52;color:#fff;font-size:7px;font-weight:700;
    padding:1mm 2mm;height:4mm;display:flex;align-items:center;gap:4px">
    <span>⑥ T1飼育ユニット (${hc}頭)</span>
    ${saleBadge}
  </div>

  <!-- 上部: QR（左専用ブロック）+ 基本情報（右） -->
  <div style="display:flex;height:14mm;padding:1mm 1.5mm 0;gap:0">
    <div style="flex-shrink:0;width:18mm;display:flex;align-items:flex-start;justify-content:center;padding-right:2mm">${qrHtml}</div>
    <div style="flex:1;min-width:0;padding-left:1mm;border-left:1px solid #ddd">
      <div style="font-size:8.5px;font-weight:700;font-family:monospace;
        color:#1a3a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${ld.display_id}
      </div>
      <div style="font-size:6.5px;color:#444;margin-top:1px">
        ${lineCode}　孵化: ${hdate}
      </div>
      <!-- 区分チェック -->
      <div style="font-size:6.5px;margin-top:2px">${bigChk}${midChk}${smlChk}</div>
      <!-- マットチェック -->
      <div style="font-size:6px;margin-top:1px">${matRow}</div>
      <!-- ステージチェック -->
      <div style="font-size:6px;margin-top:1px">${stageRow}</div>
    </div>
  </div>

  <!-- 記録表 -->
  <div style="flex:1;padding:0 1.5mm 1mm">
    <table style="width:100%;border-collapse:collapse;table-layout:fixed">
      ${recRows}
    </table>
  </div>
</div>
</body></html>`;
}
