// ════════════════════════════════════════════════════════════════
// label.js
// 役割: 個体・ロット・産卵セットのラベルをCanvas APIで生成し
//       Phomemo M220 向け PNG として出力する。
//       QRコードには内部ID（IND:xxx / LOT:xxx / SET:xxx）を埋め込む。
//
// QR生成の設計:
//   - #lbl-qr-host を body 直下に1度だけ作成（永続）
//   - render() が innerHTML を書き換えても消えない
//   - QRCode 生成後に Promise で img/canvas のロードを待つ
//   - drawImage は必ず onload / complete 確認後に実行
// ════════════════════════════════════════════════════════════════
'use strict';

// ラベルサイズ（Phomemo M220 標準: 50×30mm を 200dpi 換算）
window._currentLabel = { displayId: '', fileName: '', dataUrl: '' };

const LABEL_W = 394;  // px (50mm)
const LABEL_H = 236;  // px (30mm)

// ── QR 描画用ホスト: body 直下に永続配置 ─────────────────────────
// render() が innerHTML を書き換えても消えない
function _getQRHost() {
  let host = document.getElementById('lbl-qr-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'lbl-qr-host';
    host.style.cssText = [
      'position:fixed', 'left:-9999px', 'top:0',
      'width:120px', 'height:120px',
      'background:#ffffff',
      'z-index:1',            /* -100 は Android Chrome で drawImage 不可になるため +1 に */
      'opacity:0.001',        /* 視覚的に見えないが GPU composite は正常 */
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(host);
  }
  return host;
}

// ── QR生成を Promise でラップ ────────────────────────────────────
function _generateQR(text) {
  return new Promise(function(resolve) {
    if (typeof QRCode === 'undefined') { resolve(null); return; }

    var host = _getQRHost();
    host.innerHTML = '';

    try {
      new QRCode(host, {
        text:         text,
        width:        110,
        height:       110,
        colorDark:    '#000000',
        colorLight:   '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch (e) {
      console.warn('[label] QRCode 生成失敗:', e);
      resolve(null);
      return;
    }

    function _check() {
      var qrImg    = host.querySelector('img');
      var qrCanvas = host.querySelector('canvas');

      if (qrCanvas) {
        resolve(qrCanvas);
        return;
      }
      if (qrImg) {
        if (qrImg.complete && qrImg.naturalWidth > 0) {
          resolve(qrImg);
        } else {
          qrImg.onload  = function() { resolve(qrImg); };
          qrImg.onerror = function() { resolve(null); };
          setTimeout(function() { resolve(qrImg.complete ? qrImg : null); }, 500);
        }
        return;
      }
      setTimeout(_check, 30);
    }
    setTimeout(_check, 10);
  });
}

// ── 4種ラベルの定義 ─────────────────────────────────────────────
const LABEL_TYPE_DEFS = [
  { code: 'egg_lot',   label: '① 卵管理',     target: 'LOT', desc: '採卵後・孵化日/頭数は後で補完' },
  { code: 'multi_lot', label: '② 複数頭飼育', target: 'LOT', desc: 'T1/T2①ロット用' },
  { code: 'ind_fixed', label: '③ 個別飼育',   target: 'IND', desc: '固定ラベル（変動情報なし）' },
  { code: 'set',       label: '④ 産卵セット', target: 'SET', desc: '親情報・開始日' },
];

// ════════════════════════════════════════════════════════════════
// ラベル生成メイン画面
// ════════════════════════════════════════════════════════════════
Pages.labelGen = function (params) {
  params = params || {};
  var main = document.getElementById('main');

  var targetType = params.targetType || 'IND';
  var targetId   = params.targetId   || '';
  var labelType  = params.labelType  || (params.targetType === 'LOT' ? 'egg_lot'
    : params.targetType === 'SET' ? 'set' : 'ind_fixed');
  var activeTab  = 'single';

  _getQRHost();

  function render() {
    var inds = Store.filterIndividuals({ status: '' });
    var lots = Store.filterLots({ status: 'active' });

    main.innerHTML =
      UI.header('🏷 ラベル発行', { back: true }) +
      '<div class="page-body">' +

      '<div style="display:flex;gap:6px;margin-bottom:12px">' +
        '<button class="pill ' + (activeTab==='single'?'active':'') + '" onclick="Pages._lblTab(\'single\')">単体生成</button>' +
        '<button class="pill ' + (activeTab==='batch'?'active':'') + '" onclick="Pages._lblTab(\'batch\')">一括生成</button>' +
      '</div>' +

      (activeTab === 'single' ? _renderSingle(inds, lots, targetType, targetId, labelType)
                              : _renderBatch(inds, lots, targetType, labelType)) +

      '</div>';

    if (activeTab === 'single' && targetId) {
      setTimeout(function() {
        Pages._lblGenerate(targetType, targetId, labelType);
      }, 50);
    }
  }

  function _renderSingle(inds, lots, tType, tId, lType) {
    var selectOpts = tType === 'IND'
      ? inds.map(function(i) {
          return '<option value="' + i.ind_id + '"' + (i.ind_id===tId?' selected':'') + '>' +
            i.display_id + (i.latest_weight_g?' ('+i.latest_weight_g+'g)':'') +
            ' ' + (i.sex||'') + ' ' + (i.current_stage||'') + '</option>';
        }).join('')
      : lots.map(function(l) {
          return '<option value="' + l.lot_id + '"' + (l.lot_id===tId?' selected':'') + '>' +
            l.display_id + ' ' + (l.stage||'') + (l.count?' '+l.count+'頭':'') + '</option>';
        }).join('');

    var typeFilter = LABEL_TYPE_DEFS
      .filter(function(t){ return t.target === tType || t.target === 'SET'; })
      .map(function(t){
        return '<button class="pill ' + (t.code===lType?'active':'') +
          '" onclick="Pages._lblSetLabelType(\'' + t.code + '\')" style="font-size:.75rem">' +
          t.label + '</button>';
      }).join('');

    var desc = (LABEL_TYPE_DEFS.find(function(t){ return t.code===lType; }) || {}).desc || '';

    return '<div class="card">' +
        '<div class="card-title">対象</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:10px">' +
          '<button class="pill ' + (tType==='IND'?'active':'') + '" onclick="Pages._lblSetType(\'IND\')">個体 (IND)</button>' +
          '<button class="pill ' + (tType==='LOT'?'active':'') + '" onclick="Pages._lblSetType(\'LOT\')">ロット (LOT)</button>' +
        '</div>' +
        '<select id="lbl-target-sel" class="input" onchange="Pages._lblSetTarget(this.value)">' +
          '<option value="">— ' + (tType==='IND'?'個体':'ロット') + 'を選択 —</option>' +
          selectOpts +
        '</select>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' + typeFilter + '</div>' +
        '<div style="font-size:.72rem;color:var(--text3);margin-top:5px">' + desc + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">プレビュー</div>' +
        '<div style="display:flex;justify-content:center;margin-bottom:12px">' +
          '<canvas id="lbl-canvas" width="' + LABEL_W + '" height="' + LABEL_H + '"' +
            ' style="border:1px solid var(--border2);border-radius:4px;max-width:100%;background:#fff"></canvas>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-primary" style="flex:2" onclick="Pages._lblGenerate(\'' + tType + '\',\'' + tId + '\',\'' + lType + '\')">🏷 ラベル生成</button>' +
          '<button class="btn btn-ghost" style="flex:1" id="lbl-dl-btn" onclick="Pages._lblDownload()">💾 保存</button>' +
        '</div>' +
      '</div>' +

      '<div id="lbl-action-bar" style="display:none;margin-top:4px">' +
        '<div style="background:rgba(45,122,82,.10);border:1px solid rgba(45,122,82,.35);border-radius:var(--radius);padding:14px 16px">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
            '<span style="font-size:1.3rem">✅</span>' +
            '<span style="font-size:.95rem;font-weight:700;color:var(--green)">ラベルを生成しました</span>' +
          '</div>' +
          '<div style="font-size:.75rem;color:var(--text3);margin-bottom:10px" id="lbl-filename"></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="btn btn-primary" style="flex:1;min-width:120px" onclick="Pages._lblDownload()">💾 ダウンロード</button>' +
            '<button class="btn btn-ghost" style="flex:1;min-width:120px" onclick="Pages._lblPrint()">🖨 印刷プレビュー</button>' +
          '</div>' +
          '<button id="lbl-drive-btn" class="btn btn-ghost" style="width:100%;margin-top:8px;display:none" onclick="Pages._lblOpenDrive()">📂 Driveを開く</button>' +
          '<button class="btn btn-ghost" style="width:100%;margin-top:6px;font-size:.8rem" onclick="Pages._lblGenerate(\'' + tType + '\',\'' + tId + '\',\'' + lType + '\')">🔄 再生成</button>' +
          '<div style="font-size:.7rem;color:var(--text3);margin-top:10px;line-height:1.6;padding-top:8px;border-top:1px solid var(--border)">' +
            '💡 印刷手順: ダウンロード → Phomemoアプリ「写真印刷」→ 50×30mm で印刷' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="background:rgba(91,168,232,.06);border-color:rgba(91,168,232,.2)">' +
        '<div class="card-title" style="color:var(--blue)">📱 Phomemo M220 印刷手順</div>' +
        '<ol style="font-size:.8rem;color:var(--text2);line-height:1.8;padding-left:1.2em">' +
          '<li>「💾 保存」でPNGをダウンロード</li>' +
          '<li>Phomemoアプリを開く</li>' +
          '<li>「写真印刷」→ 保存したPNGを選択</li>' +
          '<li>用紙サイズ 50×30mm に設定して印刷</li>' +
        '</ol>' +
      '</div>';
  }

  function _renderBatch(inds, lots, tType, lType) {
    var items = tType === 'IND' ? inds : lots;
    var typeFilter = LABEL_TYPE_DEFS
      .filter(function(t){ return t.target === tType; })
      .map(function(t){
        return '<button class="pill ' + (t.code===lType?'active':'') +
          '" onclick="Pages._lblSetLabelType(\'' + t.code + '\')" style="font-size:.75rem">' +
          t.label + '</button>';
      }).join('');

    var listHtml = items.length === 0
      ? '<div style="color:var(--text3);text-align:center;padding:16px">対象がありません</div>'
      : items.map(function(item) {
          var id  = item.ind_id || item.lot_id;
          var lbl = item.display_id +
            (item.latest_weight_g ? ' ' + item.latest_weight_g + 'g' : '') +
            (item.count !== undefined ? ' ' + item.count + '頭' : '') +
            (item.sex ? ' ' + item.sex : '') +
            ((item.stage || item.current_stage) ? ' [' + (item.stage || item.current_stage) + ']' : '');
          return '<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">' +
            '<input type="checkbox" class="lbl-batch-chk" value="' + id + '" style="width:18px;height:18px;flex-shrink:0">' +
            '<span style="font-size:.82rem;color:var(--text)">' + lbl + '</span>' +
            '</label>';
        }).join('');

    return '<div class="card">' +
        '<div class="card-title">対象種別</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:8px">' +
          '<button class="pill ' + (tType==='IND'?'active':'') + '" onclick="Pages._lblSetType(\'IND\')">個体 (IND)</button>' +
          '<button class="pill ' + (tType==='LOT'?'active':'') + '" onclick="Pages._lblSetType(\'LOT\')">ロット (LOT)</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' + typeFilter + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
          '<div class="card-title" style="margin:0">対象を選択</div>' +
          '<div style="display:flex;gap:6px">' +
            '<button class="btn btn-ghost" style="font-size:.75rem;padding:4px 10px" onclick="Pages._lblBatchSelectAll(true)">全選択</button>' +
            '<button class="btn btn-ghost" style="font-size:.75rem;padding:4px 10px" onclick="Pages._lblBatchSelectAll(false)">解除</button>' +
          '</div>' +
        '</div>' +
        '<div id="lbl-batch-list" style="max-height:40vh;overflow-y:auto">' + listHtml + '</div>' +
        '<div style="margin-top:10px;font-size:.78rem;color:var(--text3)" id="lbl-batch-count">0件 選択中</div>' +
      '</div>' +

      '<button class="btn btn-primary btn-full" id="lbl-batch-btn" style="font-size:1rem;padding:14px"' +
        ' onclick="Pages._lblBatchGenerate(\'' + tType + '\',\'' + lType + '\')">🏷 まとめてラベル生成</button>' +

      '<div id="lbl-batch-result" style="margin-top:8px"></div>';
  }

  Pages._lblTab           = function(tab) { activeTab = tab; render(); };
  Pages._lblSetType       = function(t)   { targetType = t; targetId = ''; render(); };
  Pages._lblSetTarget     = function(id)  { targetId = id; render(); };
  Pages._lblSetLabelType  = function(t)   { labelType = t; render(); };
  Pages._lblBatchSelectAll = function(sel) {
    document.querySelectorAll('.lbl-batch-chk').forEach(function(c) { c.checked = sel; });
    _updateBatchCount();
  };

  render();
};

function _updateBatchCount() {
  var cnt = document.querySelectorAll('.lbl-batch-chk:checked').length;
  var el  = document.getElementById('lbl-batch-count');
  if (el) el.textContent = cnt + '件 選択中';
}
document.addEventListener('change', function(e) {
  if (e.target && e.target.classList.contains('lbl-batch-chk')) _updateBatchCount();
});

// ════════════════════════════════════════════════════════════════
// ラベル生成（単体）
// ════════════════════════════════════════════════════════════════
Pages._lblGenerate = async function (targetType, targetId, labelType) {
  if (!targetId) { UI.toast('対象を選択してください', 'error'); return; }

  var canvas = document.getElementById('lbl-canvas');
  if (!canvas) { UI.toast('Canvasが見つかりません（画面を再読み込みしてください）', 'error'); return; }

  var ld;
  try { ld = _buildLabelData(targetType, targetId, labelType); }
  catch (e) { UI.toast('ラベルデータ生成失敗: ' + e.message, 'error'); return; }

  var capturedDisplayId = ld.display_id || targetId;
  var _lc  = (ld.line_code || ld.line_display_id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  var _did = capturedDisplayId.replace(/[^a-zA-Z0-9_-]/g, '_');
  var capturedFileName  = (_lc ? _lc + '_' : '') + _did + '_label.png';

  var qrEl = await _generateQR(ld.qr_text || targetType + ':' + targetId);

  _drawLabel(canvas, ld, qrEl);

  window._currentLabel = {
    displayId: capturedDisplayId,
    fileName:  capturedFileName,
    dataUrl:   canvas.toDataURL('image/png'),
    driveUrl:  null,
  };

  var bar    = document.getElementById('lbl-action-bar');
  var fnEl   = document.getElementById('lbl-filename');
  var drvBtn = document.getElementById('lbl-drive-btn');
  if (bar)    bar.style.display    = 'block';
  if (fnEl)   fnEl.textContent     = capturedFileName;
  if (drvBtn) drvBtn.style.display = 'none';
};

// ════════════════════════════════════════════════════════════════
// 一括生成
// ════════════════════════════════════════════════════════════════
Pages._lblBatchGenerate = async function (targetType, labelType) {
  var checks = Array.from(document.querySelectorAll('.lbl-batch-chk:checked'));
  if (!checks.length) { UI.toast('対象を選択してください', 'error'); return; }

  var btn = document.getElementById('lbl-batch-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中...'; }

  var resultEl = document.getElementById('lbl-batch-result');
  if (resultEl) resultEl.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';

  var results = [];
  var tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = LABEL_W; tmpCanvas.height = LABEL_H;

  for (var ci = 0; ci < checks.length; ci++) {
    var id = checks[ci].value;
    try {
      var ld    = _buildLabelData(targetType, id, labelType);
      var qrEl  = await _generateQR(ld.qr_text || targetType + ':' + id);
      _drawLabel(tmpCanvas, ld, qrEl);
      var _lc   = (ld.line_code || '').replace(/[^a-zA-Z0-9_-]/g, '_');
      var _did  = (ld.display_id || id).replace(/[^a-zA-Z0-9_-]/g, '_');
      var fName = (_lc ? _lc + '_' : '') + _did + '_label.png';
      results.push({ id: id, fileName: fName, dataUrl: tmpCanvas.toDataURL('image/png'), displayId: ld.display_id || id });
    } catch (e) { console.warn('[batch]', id, e); }
  }

  if (btn) { btn.disabled = false; btn.textContent = '🏷 まとめてラベル生成'; }

  if (!results.length) {
    if (resultEl) resultEl.innerHTML = '<div style="color:var(--red);text-align:center;padding:12px">生成に失敗しました</div>';
    return;
  }

  var rows = results.map(function(r, i) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);gap:8px">' +
      '<span style="font-size:.82rem;color:var(--text);font-family:var(--font-mono);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">' + r.displayId + '</span>' +
      '<button class="btn btn-ghost" style="font-size:.78rem;padding:4px 10px;flex-shrink:0" onclick="Pages._lblBatchDownloadOne(' + i + ')">💾</button>' +
      '</div>';
  }).join('');

  if (resultEl) {
    resultEl.innerHTML =
      '<div class="card">' +
        '<div style="font-weight:700;color:var(--green);margin-bottom:10px">✅ ' + results.length + '件 生成完了</div>' +
        rows +
        '<button class="btn btn-primary btn-full" style="margin-top:10px" onclick="Pages._lblBatchDownloadAll()">📦 全件まとめてDL</button>' +
      '</div>';
  }
  window._batchLabelResults = results;
};

Pages._lblBatchDownloadOne = function(idx) {
  var r = (window._batchLabelResults || [])[idx];
  if (!r) return;
  var a = document.createElement('a'); a.href = r.dataUrl; a.download = r.fileName; a.click();
};
Pages._lblBatchDownloadAll = function() {
  var results = window._batchLabelResults || [];
  if (!results.length) return;
  results.forEach(function(r, i) {
    setTimeout(function() {
      var a = document.createElement('a'); a.href = r.dataUrl; a.download = r.fileName; a.click();
    }, i * 300);
  });
  UI.toast(results.length + '件のダウンロードを開始しました', 'success');
};

// ════════════════════════════════════════════════════════════════
// ラベルデータ組み立て
// ════════════════════════════════════════════════════════════════
function _buildLabelData(targetType, targetId, labelType) {
  if (targetType === 'IND') {
    var ind  = Store.getIndividual(targetId) || {};
    var line = Store.getLine(ind.line_id)    || {};
    var bld  = (Store.getDB('bloodlines') || []).find(function(b){ return b.bloodline_id === ind.bloodline_id; }) || {};
    return {
      qr_text:             'IND:' + (ind.ind_id || targetId),
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
  }
  if (targetType === 'LOT') {
    var lot  = Store.getLot(targetId)     || {};
    var line = Store.getLine(lot.line_id) || {};
    var auto = (lot.stage === 'EGG' || lot.stage === 'T0') ? 'egg_lot' : 'multi_lot';
    return {
      qr_text:             'LOT:' + (lot.lot_id || targetId),
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
      resolved_label_type: labelType || auto,
    };
  }
  if (targetType === 'SET') {
    var set = (Store.getDB('pairings') || []).find(function(p){ return p.set_id === targetId; }) || {};
    return {
      qr_text:             'SET:' + (set.set_id || targetId),
      display_id:          set.display_id    || set.set_name || targetId,
      set_name:            set.set_name      || '',
      father_info:         set.father_display_name || '',
      mother_info:         set.mother_display_name || '',
      pairing_start:       set.pairing_start || '',
      set_start:           set.set_start     || '',
      label_type:          'set',
      resolved_label_type: 'set',
    };
  }
  throw new Error('不明なターゲット種別: ' + targetType);
}

// ════════════════════════════════════════════════════════════════
// Canvas 描画
// ════════════════════════════════════════════════════════════════
function _drawLabel(canvas, ld, qrEl) {
  var lt = ld.resolved_label_type || ld.label_type || 'ind_fixed';
  if (lt === 'egg_lot')   return _drawEggLotLabel(canvas, ld, qrEl);
  if (lt === 'multi_lot') return _drawMultiLotLabel(canvas, ld, qrEl);
  if (lt === 'set')       return _drawSetLabel(canvas, ld, qrEl);
  return _drawIndLabel(canvas, ld, qrEl);
}

function _drawQR(ctx, qrEl, x, y, size) {
  if (!qrEl) {
    ctx.strokeStyle = '#aaaaaa'; ctx.lineWidth = 1;
    ctx.strokeRect(x+.5, y+.5, size-1, size-1);
    ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = '#aaaaaa'; ctx.textAlign = 'center';
    ctx.fillText('QR', x+size/2, y+size/2+3); ctx.textAlign = 'left';
    return;
  }
  if (qrEl.tagName === 'IMG' && (qrEl.naturalWidth === 0 || !qrEl.complete)) {
    ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 1; ctx.strokeRect(x, y, size, size); return;
  }
  try { ctx.drawImage(qrEl, x, y, size, size); }
  catch(e) {
    ctx.strokeStyle = '#e05050'; ctx.lineWidth = 1; ctx.strokeRect(x, y, size, size);
  }
}

function _bg(ctx, W, H)     { ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H); }
function _border(ctx, W, H) { ctx.strokeStyle='#cccccc'; ctx.lineWidth=1; ctx.strokeRect(1,1,W-2,H-2); }
function _trunc(s,n)        { s=String(s||''); return s.length>n?s.slice(0,n):s; }

function _drawEggLotLabel(canvas, ld, qrEl) {
  var ctx=canvas.getContext('2d'), W=LABEL_W, H=LABEL_H;
  _bg(ctx,W,H);
  ctx.fillStyle='#e09040'; ctx.fillRect(0,0,W,18);
  ctx.fillStyle='#fff'; ctx.font='bold 10px sans-serif'; ctx.fillText('① 卵管理ラベル',6,13);
  var QR=88; _drawQR(ctx,qrEl,6,22,QR);
  var TX=QR+14, TW=W-TX-6;
  ctx.font='bold 22px monospace'; ctx.fillStyle='#1a3a1a';
  ctx.fillText(_trunc(ld.line_code||ld.line_display_id||ld.display_id,12),TX,42,TW);
  ctx.font='10px monospace'; ctx.fillStyle='#444';
  ctx.fillText(_trunc(ld.display_id,20),TX,56,TW);
  ctx.font='bold 11px sans-serif'; ctx.fillStyle='#555';
  ctx.fillText('採卵日: '+(ld.collect_date||ld.hatch_date||'—'),TX,72,TW);
  ctx.font='10px sans-serif'; ctx.fillStyle='#888';
  ctx.fillText('孵化日: ___/___/___',TX,90,TW);
  ctx.fillText('頭数:   _____ 頭',TX,105,TW);
  ctx.font='9px sans-serif'; ctx.fillStyle='#e09040';
  ctx.fillText('孵化後に手書きでご記入ください',TX,120,TW);
  _border(ctx,W,H);
}

function _drawMultiLotLabel(canvas, ld, qrEl) {
  var ctx=canvas.getContext('2d'), W=LABEL_W, H=LABEL_H;
  _bg(ctx,W,H);
  ctx.fillStyle='#5ba8e8'; ctx.fillRect(0,0,W,18);
  ctx.fillStyle='#fff'; ctx.font='bold 10px sans-serif'; ctx.fillText('② 複数頭飼育ラベル',6,13);
  var QR=88; _drawQR(ctx,qrEl,6,22,QR);
  var TX=QR+14, TW=W-TX-6;
  ctx.font='bold 20px monospace'; ctx.fillStyle='#1a3a1a';
  ctx.fillText(_trunc(ld.line_code||ld.display_id,12),TX,40,TW);
  ctx.font='bold 11px sans-serif'; ctx.fillStyle='#2d7a52';
  ctx.fillText(_trunc(ld.display_id,18)+' '+(ld.stage_label||''),TX,55,TW);
  ctx.font='11px sans-serif'; ctx.fillStyle='#444';
  var y=70;
  if(ld.hatch_date){ctx.fillText('孵化: '+ld.hatch_date,TX,y,TW);y+=14;}
  if(ld.count)     {ctx.fillText(ld.count+'頭',TX,y,TW);y+=14;}
  ctx.font='10px sans-serif'; ctx.fillStyle='#888';
  ctx.fillText('性別: ♂□ ♀□ 混□',TX,y+4,TW); y+=15;
  ctx.fillText('区分: 大□ 中□ 小□',TX,y+4,TW);
  _border(ctx,W,H);
}

function _drawIndLabel(canvas, ld, qrEl) {
  var ctx=canvas.getContext('2d'), W=LABEL_W, H=LABEL_H;
  _bg(ctx,W,H);
  ctx.fillStyle='#2d7a52'; ctx.fillRect(0,0,W,18);
  ctx.fillStyle='#fff'; ctx.font='bold 10px sans-serif'; ctx.fillText('③ 個別飼育ラベル（固定）',6,13);
  var QR=88; _drawQR(ctx,qrEl,6,22,QR);
  var TX=QR+14, TW=W-TX-6;
  ctx.font='bold 14px monospace'; ctx.fillStyle='#1a3a1a';
  ctx.fillText(_trunc(ld.display_id,18),TX,38,TW);
  ctx.font='11px sans-serif'; ctx.fillStyle='#2d7a52';
  ctx.fillText('ライン: '+_trunc(ld.line_code||'—',10),TX,54,TW);
  ctx.font='10px sans-serif'; ctx.fillStyle='#555';
  if(ld.bloodline){ctx.fillText('血統: '+_trunc(ld.bloodline,14),TX,68,TW);}
  if(ld.locality) {ctx.fillText(_trunc(ld.locality,12)+(ld.generation?' '+ld.generation:''),TX,82,TW);}
  ctx.font='11px sans-serif'; ctx.fillStyle='#888';
  ctx.fillText('性別: ♂□ ♀□',TX,100,TW);
  ctx.font='8px sans-serif'; ctx.fillStyle='#aaa';
  ctx.fillText('※体重・容器・ステージは非掲載（固定ラベル）',6,H-5,W-12);
  _border(ctx,W,H);
}

function _drawSetLabel(canvas, ld, qrEl) {
  var ctx=canvas.getContext('2d'), W=LABEL_W, H=LABEL_H;
  _bg(ctx,W,H);
  ctx.fillStyle='#c8a84b'; ctx.fillRect(0,0,W,18);
  ctx.fillStyle='#1a1200'; ctx.font='bold 10px sans-serif'; ctx.fillText('④ 産卵セットラベル',6,13);
  var QR=80; _drawQR(ctx,qrEl,W-QR-6,(H-QR)/2,QR);
  var TW=W-QR-20;
  ctx.font='bold 18px monospace'; ctx.fillStyle='#8a6a00';
  ctx.fillText(_trunc(ld.display_id||ld.set_name,14),6,36,TW);
  ctx.font='11px sans-serif'; ctx.fillStyle='#333';
  var y=52;
  if(ld.father_info){ctx.fillText('♂ '+_trunc(ld.father_info,22),6,y,TW);y+=15;}
  if(ld.mother_info){ctx.fillText('♀ '+_trunc(ld.mother_info,22),6,y,TW);y+=15;}
  ctx.font='10px sans-serif'; ctx.fillStyle='#555';
  if(ld.pairing_start){ctx.fillText('交尾: '+ld.pairing_start,6,y,TW);y+=13;}
  if(ld.set_start)    {ctx.fillText('産卵: '+ld.set_start,6,y,TW);}
  _border(ctx,W,H);
}

// ════════════════════════════════════════════════════════════════
// ダウンロード / Drive / 印刷
// ════════════════════════════════════════════════════════════════
Pages._lblDownload = function () {
  var label   = window._currentLabel || {};
  var dataUrl = label.dataUrl || (function(){ var c=document.getElementById('lbl-canvas'); return c?c.toDataURL('image/png'):null; })();
  if (!dataUrl) { UI.toast('ラベルデータがありません。先に「ラベル生成」を押してください。', 'error'); return; }
  var fileName = label.fileName || ('label_' + Date.now() + '.png');
  var a = document.createElement('a'); a.href = dataUrl; a.download = fileName; a.click();
  UI.toast('📥 ' + fileName + ' をダウンロードしました', 'success', 4000);
};

Pages._lblOpenDrive = function () {
  var url = window._currentLabel && window._currentLabel.driveUrl;
  if (url) { window.open(url, '_blank'); }
  else { UI.toast('Driveに保存されていません。ダウンロードをご使用ください', 'info'); }
};

Pages._lblPrint = function () {
  var label   = window._currentLabel || {};
  var dataUrl = label.dataUrl || (function(){ var c=document.getElementById('lbl-canvas'); return c?c.toDataURL('image/png'):null; })();
  if (!dataUrl) { UI.toast('ラベルデータがありません。先に「ラベル生成」を押してください。', 'error'); return; }
  var win = window.open('', '_blank');
  if (!win) { UI.toast('ポップアップがブロックされました。ダウンロードをご利用ください。', 'error'); return; }
  win.document.write('<html><head><title>ラベル印刷</title>'
    + '<style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff}'
    + 'img{max-width:100%;image-rendering:pixelated}'
    + '@media print{body{margin:0}img{width:50mm;height:30mm}}</style></head>'
    + '<body><img src="' + dataUrl + '" onload="window.print()"></body></html>');
  win.document.close();
};

window.PAGES = window.PAGES || {};
window.PAGES['label-gen'] = function() { Pages.labelGen(Store.getParams()); };
