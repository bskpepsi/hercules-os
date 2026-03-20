// ════════════════════════════════════════════════════════════════
// label.js v2 — ラベル生成（HTML + print() ベース）
//
// 変更点:
//   - サイズ: 70mm × 50mm（旧: 50mm × 30mm）
//   - HTML印刷方式（旧: Canvas PNG）
//   - 1枚ずつ単独印刷
//   - ロット用ラベル: 記録表（日付/体重①②/メモ）+ 右メモ欄
//   - 個体用ラベル: 過去履歴引継ぎ + 記録表
//   - 既存ダウンロード/Phomemo導線も維持
// ════════════════════════════════════════════════════════════════
'use strict';

// ラベル種別定義
const LABEL_TYPE_DEFS = [
  { code: 'egg_lot',   label: '① 卵管理',     target: 'LOT', desc: '採卵後・孵化日/頭数は後で補完' },
  { code: 'multi_lot', label: '② 複数頭飼育', target: 'LOT', desc: 'ロット管理用（記録表付き）' },
  { code: 'ind_fixed', label: '③ 個別飼育',   target: 'IND', desc: '個体管理用（履歴引継ぎ）' },
  { code: 'set',       label: '④ 産卵セット', target: 'SET', desc: '親情報・開始日' },
];

// ラベルデータ構築
window._currentLabel = { displayId: '', fileName: '', html: '', dataUrl: '' };

// ── ラベル生成ページ ─────────────────────────────────────────────
Pages.labelGen = function (params = {}) {
  const main = document.getElementById('main');
  let targetType = params.targetType || 'IND';
  let targetId   = params.targetId   || '';
  let labelType  = params.labelType  || (params.targetType === 'LOT' ? 'egg_lot'
    : params.targetType === 'SET' ? 'set' : 'ind_fixed');

  const inds  = Store.filterIndividuals({ status: 'alive' });
  const lots  = Store.filterLots({ status: 'active' });

  function render() {
    main.innerHTML = `
      ${UI.header('ラベル生成', {})}
      <div class="page-body">

        <div class="card">
          <div class="card-title">ラベル対象</div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button class="pill ${targetType==='IND'?'active':''}" onclick="Pages._lblSetType('IND')">個体(IND)</button>
            <button class="pill ${targetType==='LOT'?'active':''}" onclick="Pages._lblSetType('LOT')">ロット(LOT)</button>
          </div>
          ${targetType === 'IND' ? `
            <select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">
              <option value="">個体を選択...</option>
              ${inds.map(i => `<option value="${i.ind_id}" ${i.ind_id===targetId?'selected':''}>
                ${i.display_id} ${i.sex||''} ${i.latest_weight_g?'('+i.latest_weight_g+'g)':''}</option>`).join('')}
            </select>` : `
            <select id="lbl-target" class="input" onchange="Pages._lblSetTarget(this.value)">
              <option value="">ロットを選択...</option>
              ${lots.map(l => `<option value="${l.lot_id}" ${l.lot_id===targetId?'selected':''}>
                ${l.display_id} ${stageLabel(l.stage)} (${l.count}頭)</option>`).join('')}
            </select>`}
        </div>

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
        </div>

        <!-- プレビューエリア -->
        <div class="card" id="lbl-preview-card">
          ${targetId
            ? `<div class="card-title">プレビュー（70mm × 50mm）</div>
               <div id="lbl-html-preview" style="transform-origin:top left;margin-bottom:12px;
                 border:1px solid var(--border2);border-radius:4px;overflow:hidden;
                 background:#fff;width:264px;height:189px;transform:scale(1)"></div>
               <div id="lbl-qr-hidden" style="display:none"></div>
               <div style="display:flex;gap:8px">
                 <button class="btn btn-primary" style="flex:2"
                   onclick="Pages._lblGenerate('${targetType}','${targetId}','${labelType}')">
                   🏷 ラベル生成
                 </button>
                 <button class="btn btn-ghost" style="flex:1" id="lbl-print-btn" style="display:none"
                   onclick="Pages._lblPrint()">🖨 印刷</button>
               </div>`
            : `<div style="color:var(--text3);font-size:.85rem;text-align:center;padding:20px">
                 対象を選択するとプレビューが表示されます
               </div>`}
        </div>

        <!-- 発行後アクション -->
        <div id="lbl-action-bar" style="display:none;margin-top:8px">
          <div style="background:rgba(45,122,82,.10);border:1px solid rgba(45,122,82,.35);
            border-radius:var(--radius);padding:14px 16px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
              <span style="font-size:1.3rem">✅</span>
              <span style="font-size:.95rem;font-weight:700;color:var(--green)">ラベルを生成しました</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <button class="btn btn-primary" onclick="Pages._lblPrint()" style="font-size:.92rem;padding:13px;font-weight:700">
                🖨 印刷（1枚）
              </button>
              <button class="btn btn-ghost" onclick="Pages._lblPrint()" style="font-size:.92rem;padding:13px">
                🖨 再度印刷
              </button>
            </div>
            <div id="lbl-filename" style="font-size:.72rem;color:var(--text3);margin-top:8px;text-align:center"></div>
            <button class="btn btn-ghost" style="width:100%;margin-top:8px;font-size:.8rem;padding:8px"
              onclick="Pages._lblGenerate('${targetType}','${targetId}','${labelType}')">
              🔄 再生成
            </button>
            <div style="font-size:.7rem;color:var(--text3);margin-top:10px;line-height:1.6;
              padding-top:8px;border-top:1px solid var(--border)">
              💡 印刷方法: ブラウザの印刷ダイアログで「カスタム 70×50mm」/ 余白なし / 実寸で印刷。PDFに保存してPhomemoアプリで印刷も可能。
            </div>
          </div>
        </div>

      </div>`;

    if (targetId) {
      setTimeout(() => Pages._lblGenerate(targetType, targetId, labelType), 200);
    }
  }

  Pages._lblSetType = (t) => { targetType = t; targetId = ''; render(); };
  Pages._lblSetTarget = (id) => { targetId = id; render(); };
  Pages._lblSetLabelType = (t) => { labelType = t; render(); };
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
        label_type:   'ind_fixed',
      };
    } else if (targetType === 'LOT') {
      const lot  = Store.getLot(targetId)     || {};
      const line = Store.getLine(lot.line_id) || {};
      const records = Store.getGrowthRecords(targetId) || [];
      const isMolt  = lot.mat_molt === true || lot.mat_molt === 'true';
      const autoType = (lot.stage === 'EGG' || lot.stage === 'T0') ? 'egg_lot' : 'multi_lot';
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
    // QR画像をBase64で取得
    let qrSrc = '';
    const qrImg = qrDiv?.querySelector('img') || qrDiv?.querySelector('canvas');
    if (qrImg) {
      try {
        if (qrImg.tagName === 'CANVAS') {
          qrSrc = qrImg.toDataURL('image/png');
        } else {
          qrSrc = qrImg.src;
        }
      } catch(e) {}
    }

    // HTMLラベルを生成
    const html = _buildLabelHTML(ld, qrSrc);
    window._currentLabel = {
      displayId: ld.display_id,
      fileName: (ld.line_code ? ld.line_code.replace(/[^a-zA-Z0-9_-]/g,'_') + '_' : '') +
                ld.display_id.replace(/[^a-zA-Z0-9_-]/g,'_') + '_label.html',
      html: html,
      dataUrl: null, // PNG必要時はcanvasで後処理
    };

    // プレビュー表示（縮小）
    preview.innerHTML = `<iframe srcdoc="${html.replace(/"/g,'&quot;')}"
      style="width:264px;height:189px;border:none;transform-origin:top left"
      scrolling="no"></iframe>`;

    // アクションバー表示
    const bar = document.getElementById('lbl-action-bar');
    if (bar) {
      const fnEl = document.getElementById('lbl-filename');
      if (fnEl) fnEl.textContent = window._currentLabel.fileName;
      bar.style.display = 'block';
    }
    const printBtn = document.getElementById('lbl-print-btn');
    if (printBtn) printBtn.style.display = '';
  }, 300);
};

// ── HTMLラベル構築 ────────────────────────────────────────────────
function _buildLabelHTML(ld, qrSrc) {
  const lt = ld.label_type || 'ind_fixed';
  const stageLbl = typeof stageLabel === 'function' ? (stageLabel(ld.stage_code) || ld.stage_code || '') : (ld.stage_code || '');
  const matLbl   = ld.mat_type ? (ld.mat_type + (ld.mat_molt ? '(M)' : '')) : '';
  const noteShort = (ld.note_private || '').slice(0, 40);
  const qrHtml   = qrSrc ? `<img src="${qrSrc}" style="width:45px;height:45px;display:block">` : '<div style="width:45px;height:45px;background:#eee;display:flex;align-items:center;justify-content:center;font-size:8px">QR</div>';

  // ── チェック欄ヘルパー ─────────────────────────────────────────
  const chk = (label, checked) => `<span style="margin-right:4px">
    <span style="font-size:7px">${checked ? '■' : '□'}</span>${label}
  </span>`;

  const sexCats = (ld.size_category || '').split(',').map(s => s.trim());

  if (lt === 'set') {
    return _buildSetLabelHTML(ld, qrHtml);
  }

  const isLot = lt === 'multi_lot' || lt === 'egg_lot';

  // 記録行
  const records = ld.records || [];
  const maxRows  = isLot ? 6 : 7;
  const recRows  = records.slice(0, maxRows);
  while (recRows.length < maxRows) recRows.push(null);

  const recRowsHtml = recRows.map(r => {
    if (!r) {
      return isLot
        ? `<tr><td style="border:1px solid #ccc;padding:1px 2px;width:24mm"></td><td style="border:1px solid #ccc;padding:1px 2px;width:14mm"></td><td style="border:1px solid #ccc;padding:1px 2px;width:14mm"></td><td style="border:1px solid #ccc;padding:1px 2px;width:15mm"></td></tr>`
        : `<tr><td style="border:1px solid #ccc;padding:1px 2px;width:26mm"></td><td style="border:1px solid #ccc;padding:1px 2px;width:18mm"></td><td style="border:1px solid #ccc;padding:1px 2px;width:20mm"></td></tr>`;
    }
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
  .lbl-top { display:flex; height:14mm; padding:1mm; gap:1mm; }
  .lbl-qr { flex-shrink:0; }
  .lbl-info { flex:1; min-width:0; font-size:7px; line-height:1.4; }
  .lbl-info-id { font-size:8px; font-weight:700; color:#1a3a1a; font-family:monospace;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .lbl-mid { display:flex; height:8mm; padding:0.5mm 1mm; gap:4mm; align-items:center; }
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

  <!-- 上段: QR + 基本情報 -->
  <div class="lbl-top">
    <div class="lbl-qr">${qrHtml}</div>
    <div class="lbl-info">
      <div class="lbl-info-id">${ld.display_id}</div>
      <div style="font-size:7px;color:#555;margin-top:1px">L: <b>${ld.line_code||'—'}</b></div>
      ${ld.hatch_date ? `<div style="font-size:6px;color:#777">孵化: ${ld.hatch_date}</div>` : ''}
      ${isLot && ld.count ? `<div style="font-size:6px;color:#777">${ld.count}頭</div>` : ''}
      ${!isLot && ld.sex ? `<div style="font-size:7px;color:${ld.sex==='♂'?'#3366cc':'#cc3366'};font-weight:700">${ld.sex}</div>` : ''}
    </div>
  </div>

  <!-- 中段: チェック欄 -->
  <div class="lbl-mid">
    <div class="lbl-checks">
      ${isLot ? `<div>${chk('♂',ld.sex_hint==='♂')}${chk('♀',ld.sex_hint==='♀')}${chk('混合',ld.sex_hint==='混合')}</div>` : ''}
      <div>区分: ${chk('大',sexCats.includes('大'))}${chk('中',sexCats.includes('中'))}${chk('小',sexCats.includes('小'))}</div>
      <div>マット: ${['T0','T1','T2','T3'].map(m => chk(m, ld.mat_type===m)).join('')}</div>
      <div>モルト: ${chk('ON',ld.mat_molt===true||ld.mat_molt==='true')}${chk('OFF',!ld.mat_molt||ld.mat_molt==='false')}</div>
      <div>ステージ: ${stageLbl||'—'}</div>
    </div>
  </div>

  <!-- 下段: 記録表 + メモ欄 -->
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

  <!-- 最下段: 内部メモ要約 -->
  <div class="lbl-foot">${noteShort ? '📝 ' + noteShort : ''}</div>
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

// ── 印刷（新ウィンドウで1枚） ─────────────────────────────────────
Pages._lblPrint = function () {
  const label = window._currentLabel || {};
  if (!label.html) { UI.toast('ラベルデータがありません。先に「ラベル生成」を押してください。', 'error'); return; }
  const win = window.open('', '_blank');
  if (!win) { UI.toast('ポップアップをブロックされました', 'error'); return; }
  win.document.write(label.html);
  win.document.close();
  win.onload = () => { win.print(); };
};

// ── ダウンロード（HTMLファイルとして） ──────────────────────────
// _lblDownload は印刷ダイアログへ誘導（HTML保存ではなく印刷→PDF保存が正規フロー）
Pages._lblDownload = function () {
  Pages._lblPrint();
};

Pages._lblOpenDrive = function () {
  const url = window._currentLabel?.driveUrl;
  if (url) window.open(url, '_blank');
  else UI.toast('Driveに保存されていません', 'info');
};

// 後方互換: Canvas版 _lblPrint（旧コードから呼ばれることがあるため）
window._currentLabel = window._currentLabel || { displayId:'', fileName:'', html:'', dataUrl:'' };

window.PAGES['label-gen'] = () => Pages.labelGen(Store.getParams());
