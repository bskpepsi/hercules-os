// ────────────────────────────────────────────────────────────────
// FILE: js/pages/continuous_scan.js
// ════════════════════════════════════════════════════════════════
// continuous_scan.js — 継続読取りモード（ラベル記録表UI版）
// build: 20260413bf
//
// 【フロー】
//   ① ラベル全体を1枚撮影（またはギャラリーから選択）
//   ② jsQR でQRコードを検出 → UNIT/IND を特定（同時）
//      ※ Canvas前処理（グレースケール+コントラスト強調）でQR検出精度向上
//      ※ QR検出失敗時はGeminiにQR文字列も抽出させてリカバリ
//   ③ Gemini Vision で手書きデータをOCR（同時）
//   ④ 確認画面：ラベルの記録表レイアウトを画面上で再現
//      - 個体ラベル: 4行×2列（日付・体重・交換）
//      - ユニットラベル: 4行×4列（日付・①体重・②体重・交換）
//      - OCR読取済セル→緑、信頼度低→黄、未記入→グレー
//      - セルタップでインライン編集
//   ⑤ growth_records に保存
//
// 【交換種別の値統一】
//   FULL = 全交換（ラベルの「全」）
//   ADD  = 追加マット（ラベルの「追」）
//   NONE = なし
// ════════════════════════════════════════════════════════════════

Pages.continuousScan = function(params) {
  params = params || {};
  const main = document.getElementById('main');

  // ── 状態管理 ──────────────────────────────────────────────────
  let _state = {
    step: 'capture',      // 'capture' | 'processing' | 'confirm' | 'saving'
    targetType: null,     // 'UNIT' | 'IND'
    targetId: null,
    displayId: null,
    entity: null,
    members: [],
    capturedImage: null,  // data URL
    ocrResult: null,
    qrError: null,
    // テーブル編集状態（確認画面用）
    // rows: [{date, weight1, weight2, exchange, ocr_state}] × 4行
    tableRows: null,
    editingCell: null,    // {row, col} 現在編集中のセル
  };

  // ── エンティティ解決 ───────────────────────────────────────────
  function _resolveEntity(type, id) {
    if (type === 'UNIT') {
      return (Store.getUnit && Store.getUnit(id))
          || (Store.getUnitByDisplayId && Store.getUnitByDisplayId(id))
          || (Store.getDB('breeding_units')||[]).find(function(u){ return u.unit_id===id||u.display_id===id; })
          || null;
    }
    if (type === 'IND') {
      return (Store.getIndividual && Store.getIndividual(id))
          || (Store.getDB('individuals')||[]).find(function(i){ return i.ind_id===id||i.display_id===id; })
          || null;
    }
    return null;
  }

  function _parseMembers(entity) {
    if (!entity || !entity.members) return [];
    try {
      var raw = entity.members;
      return Array.isArray(raw) ? raw : JSON.parse(raw);
    } catch(_) { return []; }
  }

  // ── Canvas前処理：グレースケール+コントラスト強調 ─────────────
  // 暗い現場写真でのQR検出精度を向上させる
  function _preprocessCanvas(canvas, ctx, width, height) {
    var imageData = ctx.getImageData(0, 0, width, height);
    var data = imageData.data;

    // グレースケール変換 + ヒストグラム収集
    var grayArr = new Uint8Array(width * height);
    var min = 255, max = 0;
    for (var i = 0; i < data.length; i += 4) {
      var g = Math.round(data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
      grayArr[i >> 2] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }

    // コントラスト正規化（ストレッチ）
    var range = max - min || 1;
    for (var j = 0; j < grayArr.length; j++) {
      var v = Math.round((grayArr[j] - min) / range * 255);
      // 二値化（閾値128）でQRコードのコントラストを最大化
      var bw = v > 128 ? 255 : 0;
      data[j * 4]     = bw;
      data[j * 4 + 1] = bw;
      data[j * 4 + 2] = bw;
      data[j * 4 + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    return ctx.getImageData(0, 0, width, height);
  }

  // ── 画像からQRコードを検出（前処理あり） ─────────────────────
  function _extractQrFromImage(imageDataUrl) {
    return new Promise(function(resolve) {
      if (typeof jsQR === 'undefined') { resolve(null); return; }
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // まず元画像でそのまま試す
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (code && code.data) { resolve(code.data); return; }

        // 失敗時: グレースケール+コントラスト強調で再試行
        ctx.drawImage(img, 0, 0);
        var processedData = _preprocessCanvas(canvas, ctx, canvas.width, canvas.height);
        var code2 = jsQR(processedData.data, processedData.width, processedData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (code2 && code2.data) { resolve(code2.data); return; }

        // 失敗時: 縮小版でも試す（大きすぎる画像への対応）
        if (img.width > 1200) {
          var scale = 1200 / img.width;
          var sw = Math.round(img.width * scale);
          var sh = Math.round(img.height * scale);
          canvas.width  = sw;
          canvas.height = sh;
          ctx.drawImage(img, 0, 0, sw, sh);
          var sdData = ctx.getImageData(0, 0, sw, sh);
          var code3 = jsQR(sdData.data, sdData.width, sdData.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (code3 && code3.data) { resolve(code3.data); return; }
        }

        resolve(null);
      };
      img.onerror = function() { resolve(null); };
      img.src = imageDataUrl;
    });
  }

  // QRテキストからエンティティ解決
  function _resolveFromQrText(qrText) {
    if (!qrText) return null;
    var parts  = qrText.split(':');
    if (parts.length < 2) return null;
    var prefix = parts[0].toUpperCase();
    var id     = parts.slice(1).join(':').trim();

    if (prefix === 'BU') {
      var units = Store.getDB('breeding_units') || [];
      var unit  = units.find(function(u){ return u.display_id===id; })
               || units.find(function(u){ return u.unit_id===id; })
               || { display_id: id, unit_id: id };
      return { targetType:'UNIT', targetId: unit.display_id||id,
               displayId: unit.display_id||id, entity: unit };
    }
    if (prefix === 'IND') {
      var ind = (Store.getIndividual && Store.getIndividual(id))
             || (Store.getDB('individuals')||[]).find(function(i){ return i.ind_id===id||i.display_id===id; });
      if (!ind) return null;
      return { targetType:'IND', targetId: ind.ind_id||id,
               displayId: ind.display_id||id, entity: ind };
    }
    return null;
  }

  // ── テーブル行データを初期化 ───────────────────────────────────
  // ocrResult から4行分のデータを作る
  function _buildTableRows(ocrResult, isUnit) {
    var ocr = ocrResult || {};
    var rows = [];

    // OCRで読み取った行リスト（複数行対応）
    var ocrRows = ocr.records || [];

    // 最低4行確保
    for (var i = 0; i < 4; i++) {
      var ocrRow = ocrRows[i] || null;
      var row = {
        date:     '',
        weight1:  '',   // 個体: 体重 / ユニット: ①体重
        weight2:  '',   // ユニットのみ: ②体重
        exchange: '',   // 'FULL' | 'ADD' | 'NONE' | ''
        // OCR状態: 'high' | 'low' | 'empty'
        date_state:     'empty',
        weight1_state:  'empty',
        weight2_state:  'empty',
        exchange_state: 'empty',
      };

      if (ocrRow) {
        if (ocrRow.date != null && ocrRow.date !== '') {
          row.date       = String(ocrRow.date);
          row.date_state = ocrRow._confidence === 'low' ? 'low' : 'high';
        }
        if (ocrRow.weight != null && ocrRow.weight !== '') {
          row.weight1       = String(ocrRow.weight);
          row.weight1_state = ocrRow._confidence === 'low' ? 'low' : 'high';
        }
        if (ocrRow.weight1 != null && ocrRow.weight1 !== '') {
          row.weight1       = String(ocrRow.weight1);
          row.weight1_state = ocrRow._confidence === 'low' ? 'low' : 'high';
        }
        if (isUnit && ocrRow.weight2 != null && ocrRow.weight2 !== '') {
          row.weight2       = String(ocrRow.weight2);
          row.weight2_state = ocrRow._confidence === 'low' ? 'low' : 'high';
        }
        if (ocrRow.exchange != null && ocrRow.exchange !== '') {
          row.exchange       = ocrRow.exchange;
          row.exchange_state = ocrRow._confidence === 'low' ? 'low' : 'high';
        }
      }

      // 1行目のみ旧形式(単一レコード)からフォールバック
      if (i === 0 && ocrRows.length === 0) {
        var today = new Date().toISOString().split('T')[0].replace(/-/g,'/');
        if (ocr.record_date) {
          row.date       = ocr.record_date;
          row.date_state = ocr._confidence === 'low' ? 'low' : 'high';
        }
        if (!isUnit && ocr.weight != null && ocr.weight !== '') {
          row.weight1       = String(ocr.weight);
          row.weight1_state = ocr._confidence === 'low' ? 'low' : 'high';
        }
        if (!isUnit && ocr.weight_1 != null && ocr.weight_1 !== '') {
          row.weight1       = String(ocr.weight_1);
          row.weight1_state = ocr._confidence === 'low' ? 'low' : 'high';
        }
        if (isUnit && ocr.weight_1 != null && ocr.weight_1 !== '') {
          row.weight1       = String(ocr.weight_1);
          row.weight1_state = ocr._confidence === 'low' ? 'low' : 'high';
        }
        if (isUnit && ocr.weight_2 != null && ocr.weight_2 !== '') {
          row.weight2       = String(ocr.weight_2);
          row.weight2_state = ocr._confidence === 'low' ? 'low' : 'high';
        }
        if (ocr.exchange_type) {
          row.exchange       = ocr.exchange_type;
          row.exchange_state = ocr._confidence === 'low' ? 'low' : 'high';
        }
      }
      rows.push(row);
    }
    return rows;
  }

  // ── メインレンダリング ─────────────────────────────────────────
  function render() {
    if (_state.step === 'capture')    return renderCapture();
    if (_state.step === 'processing') return renderProcessing();
    if (_state.step === 'confirm')    return renderConfirm();
    if (_state.step === 'saving')     return renderSaving();
  }

  // ──────────────────────────────────────────────────────────────
  // ステップ1: ラベル撮影
  // ──────────────────────────────────────────────────────────────
  function renderCapture() {
    main.innerHTML =
      UI.header('📷 継続読取り', { back: true }) +
      '<div class="page-body">' +

        '<div class="card" style="padding:14px 16px">' +
          '<div style="font-size:.82rem;font-weight:700;color:var(--text2);margin-bottom:6px">📋 使い方</div>' +
          '<div style="font-size:.74rem;color:var(--text3);line-height:1.7">' +
            'ラベル全体を1枚撮影してください。<br>' +
            'QRコードと手書きデータを同時に読み取ります。<br>' +
            '💡 QRコードが写るよう、ラベル全体を枠に収めて撮影してください。' +
          '</div>' +
        '</div>' +

        '<div class="card" style="padding:16px;text-align:center">' +
          '<input type="file" id="cs-file-input" accept="image/*" capture="environment"' +
            ' style="display:none" onchange="Pages._cScanOnImageSelected(this)">' +
          '<button class="btn btn-primary btn-full"' +
            ' style="padding:18px;font-size:1rem;margin-bottom:10px"' +
            ' onclick="Pages._cScanOpenCamera()">' +
            '<span style="font-size:1.5rem;margin-right:8px">📷</span>カメラでラベルを撮影' +
          '</button>' +
          '<input type="file" id="cs-gallery-input" accept="image/*"' +
            ' style="display:none" onchange="Pages._cScanOnImageSelected(this)">' +
          '<button class="btn btn-ghost btn-full" style="font-size:.88rem"' +
            ' onclick="Pages._cScanOpenGallery()">' +
            '🖼️ ギャラリーから選択' +
          '</button>' +
        '</div>' +

        (_state.qrError ?
          '<div style="background:rgba(224,64,64,.08);border:1px solid rgba(224,64,64,.3);' +
            'border-radius:8px;padding:12px 14px;font-size:.78rem;color:#e04040">' +
            '⚠️ ' + _state.qrError + '<br>' +
            '<span style="color:var(--text3);font-size:.72rem">' +
              '明るい場所でラベル全体が写るよう再撮影してください。' +
            '</span>' +
          '</div>' : '') +

      '</div>';
  }

  // ──────────────────────────────────────────────────────────────
  // ステップ2: 処理中
  // ──────────────────────────────────────────────────────────────
  function renderProcessing() {
    main.innerHTML =
      UI.header('📷 継続読取り', {}) +
      '<div class="page-body" style="text-align:center;padding-top:32px">' +
        '<div style="font-size:2.5rem;margin-bottom:16px">🔍</div>' +
        (_state.capturedImage ?
          '<div style="margin-bottom:16px">' +
            '<img src="' + _state.capturedImage + '"' +
              ' style="max-height:160px;border-radius:8px;border:1px solid var(--border)">' +
          '</div>' : '') +
        '<div id="cs-status-qr" style="font-size:.82rem;color:var(--text3);margin-bottom:6px">' +
          '⏳ QRコードを検出中...' +
        '</div>' +
        '<div id="cs-status-ocr" style="font-size:.82rem;color:var(--text3)">' +
          '⏳ 手書きデータを解析中...' +
        '</div>' +
      '</div>';
  }

  // ──────────────────────────────────────────────────────────────
  // ステップ3: 確認・修正画面（ラベル記録表レイアウト）
  // ──────────────────────────────────────────────────────────────
  function renderConfirm() {
    var ocr     = _state.ocrResult || {};
    var isUnit  = _state.targetType === 'UNIT';
    var members = _state.members;
    var dispId  = _state.displayId || _state.targetId || '—';

    var entityStage = _state.entity
      ? (_state.entity.current_stage || _state.entity.stage_phase || '') : '';

    var prevRecs = (Store.getGrowthRecords && Store.getGrowthRecords(_state.targetId)) || [];
    var lastRec  = prevRecs.length
      ? prevRecs.slice().sort(function(a,b){ return String(b.record_date).localeCompare(String(a.record_date)); })[0]
      : null;

    // テーブル行データを初期化（初回のみ）
    if (!_state.tableRows) {
      _state.tableRows = _buildTableRows(ocr, isUnit);
    }

    // 共通フォーム部分（日付・マット・ステージ）
    var today   = new Date().toISOString().split('T')[0];
    var recDate = (ocr.record_date || today).replace(/\//g,'-');
    var mat     = ocr.mat_type      || '';
    var stage   = ocr.stage         || entityStage || '';

    var matOptions = ['T0','T1','T2','T3','MD'].map(function(m){
      return '<option value="'+m+'"'+(mat===m?' selected':'')+'>'+m+'</option>';
    }).join('');
    var stageOptions = [
      {v:'L1L2',l:'L1L2'},{v:'L3',l:'L3'},{v:'PREPUPA',l:'前蛹'},
      {v:'PUPA',l:'蛹'},{v:'ADULT_PRE',l:'成虫（未後食）'},{v:'ADULT',l:'成虫（活動中）'}
    ].map(function(s){
      return '<option value="'+s.v+'"'+(stage===s.v?' selected':'')+'>'+s.l+'</option>';
    }).join('');

    main.innerHTML =
      UI.header('📋 読取り確認・修正', { back: true, backFn: 'Pages._cScanBackToCapture()' }) +
      '<div class="page-body">' +

        // 対象情報
        '<div class="card" style="padding:12px 14px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between">' +
            '<div>' +
              '<div style="font-size:.9rem;font-weight:700;color:var(--gold)">' + dispId + '</div>' +
              '<div style="font-size:.72rem;color:var(--text3)">' +
                (isUnit ? 'ユニット' : '個別飼育') +
                (entityStage ? ' / ' + entityStage : '') +
              '</div>' +
              (lastRec ? '<div style="font-size:.68rem;color:var(--text3);margin-top:2px">前回: ' +
                lastRec.record_date + ' / ' + (lastRec.weight_g||'—') + 'g</div>' : '') +
            '</div>' +
            '<button class="btn btn-ghost btn-sm" onclick="Pages._cScanBackToCapture()">撮り直す</button>' +
          '</div>' +
        '</div>' +

        // OCR信頼度バナー
        (ocr._confidence === 'low' ?
          '<div style="background:rgba(224,144,64,.1);border:1px solid rgba(224,144,64,.3);' +
            'border-radius:8px;padding:10px 12px;font-size:.76rem;color:var(--amber)">' +
            '⚠️ 一部の値が読み取れなかった可能性があります。内容を確認してください。' +
          '</div>'
        :
          '<div style="background:rgba(76,175,120,.08);border:1px solid rgba(76,175,120,.25);' +
            'border-radius:8px;padding:10px 12px;font-size:.76rem;color:var(--green)">' +
            '✅ OCR読み取り完了。セルをタップして修正できます。' +
          '</div>'
        ) +

        // 撮影画像プレビュー
        (_state.capturedImage ?
          '<div style="text-align:center">' +
            '<img src="' + _state.capturedImage + '"' +
              ' style="max-height:90px;border-radius:6px;border:1px solid var(--border)">' +
          '</div>' : '') +

        // 凡例
        '<div style="display:flex;gap:10px;font-size:.68rem;padding:0 2px">' +
          '<span style="display:flex;align-items:center;gap:3px">' +
            '<span style="width:10px;height:10px;background:rgba(76,175,120,.35);border-radius:2px;display:inline-block"></span>' +
            'OCR読取済' +
          '</span>' +
          '<span style="display:flex;align-items:center;gap:3px">' +
            '<span style="width:10px;height:10px;background:rgba(224,200,64,.35);border-radius:2px;display:inline-block"></span>' +
            '要確認' +
          '</span>' +
          '<span style="display:flex;align-items:center;gap:3px">' +
            '<span style="width:10px;height:10px;background:rgba(255,255,255,.08);border-radius:2px;display:inline-block"></span>' +
            '未記入' +
          '</span>' +
        '</div>' +

        // ── メインテーブル（ラベル記録表と同じレイアウト）──
        _renderRecordTable(isUnit, members) +

        // 共通フォーム（マット・ステージ・記録日）
        '<div class="card" style="padding:14px">' +
          '<div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:10px">🗓️ 共通設定</div>' +

          '<div style="display:flex;gap:10px;margin-bottom:10px">' +
            '<div style="flex:1">' +
              '<label style="font-size:.72rem;color:var(--text3);font-weight:700">記録日</label>' +
              '<input type="date" id="cs-date" class="input" value="' + recDate + '" style="margin-top:4px">' +
            '</div>' +
            '<div style="flex:1">' +
              '<label style="font-size:.72rem;color:var(--text3);font-weight:700">🌿 マット</label>' +
              '<select id="cs-mat" class="input" style="margin-top:4px">' +
                '<option value="">—</option>' + matOptions +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div style="margin-bottom:10px">' +
            '<label style="font-size:.72rem;color:var(--text3);font-weight:700">📊 ステージ <span style="color:var(--red)">*</span></label>' +
            '<select id="cs-stage" class="input" style="margin-top:4px">' +
              '<option value="">選択...</option>' + stageOptions +
            '</select>' +
          '</div>' +

          '<div>' +
            '<label style="font-size:.72rem;color:var(--text3);font-weight:700">メモ（任意）</label>' +
            '<input type="text" id="cs-note" class="input" value="' + (ocr.note||'') + '"' +
              ' placeholder="気になることがあれば..." style="margin-top:4px">' +
          '</div>' +
        '</div>' +

        // OCR生データ（折りたたみ）
        '<details style="margin-top:4px">' +
          '<summary style="font-size:.72rem;color:var(--text3);cursor:pointer;padding:8px">🔍 OCR生データを確認</summary>' +
          '<div style="background:var(--surface2);border-radius:8px;padding:10px;' +
            'font-family:monospace;font-size:.68rem;color:var(--text3);white-space:pre-wrap">' +
            JSON.stringify(ocr, null, 2) +
          '</div>' +
        '</details>' +

      '</div>' +

      '<div class="quick-action-bar">' +
        '<button class="btn btn-ghost" style="flex:1;padding:14px 0"' +
          ' onclick="Pages._cScanBackToCapture()">← 撮り直す</button>' +
        '<button class="btn btn-gold" style="flex:2;padding:14px 0;font-weight:700;font-size:.95rem"' +
          ' onclick="Pages._cScanSave()">💾 記録を保存</button>' +
      '</div>';
  }

  // ── 記録テーブルHTML生成 ──────────────────────────────────────
  function _renderRecordTable(isUnit, members) {
    var rows = _state.tableRows;
    var m0label = members && members[0] ? ((members[0].sex||'?') + ' ①') : '①';
    var m1label = members && members[1] ? ((members[1].sex||'?') + ' ②') : '②';

    // セル色スタイル
    function _cellBg(state) {
      if (state === 'high')  return 'background:rgba(76,175,120,.25);';
      if (state === 'low')   return 'background:rgba(224,200,64,.25);';
      return 'background:rgba(255,255,255,.05);';
    }

    // 交換表示テキスト
    function _exchDisplay(val) {
      if (val === 'FULL') return '<span style="color:#60d080;font-weight:700">■全</span><br><span style="color:var(--text3)">□追</span>';
      if (val === 'ADD')  return '<span style="color:var(--text3)">□全</span><br><span style="color:#60d080;font-weight:700">■追</span>';
      return '<span style="color:var(--text3)">□全</span><br><span style="color:var(--text3)">□追</span>';
    }

    var thStyle = 'border:1.5px solid var(--border);padding:5px 3px;font-size:.7rem;font-weight:700;' +
                  'color:var(--text2);text-align:center;background:var(--surface2)';
    var tdBase  = 'border:1.5px solid var(--border);padding:6px 3px;font-size:.78rem;' +
                  'font-weight:700;text-align:center;cursor:pointer;min-width:0;';

    var html = '<div class="card" style="padding:10px 12px">' +
      '<div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:8px">' +
        '📝 記録テーブル <span style="font-size:.68rem;color:var(--text3);font-weight:400">（セルをタップして編集）</span>' +
      '</div>' +
      '<div style="overflow-x:auto">' +
      '<table style="width:100%;border-collapse:collapse;table-layout:fixed">';

    if (isUnit) {
      // ユニット: 4列（日付 / ①体重 / ②体重 / 交換）
      html += '<thead><tr>' +
        '<th style="' + thStyle + ';width:25%">日付</th>' +
        '<th style="' + thStyle + ';width:22%">' + m0label + '</th>' +
        '<th style="' + thStyle + ';width:22%">' + m1label + '</th>' +
        '<th style="' + thStyle + ';width:31%">交換</th>' +
        '</tr></thead><tbody>';

      for (var i = 0; i < 4; i++) {
        var r = rows[i];
        html += '<tr>' +
          '<td style="' + tdBase + _cellBg(r.date_state) + '"' +
            ' onclick="Pages._cScanEditCell(' + i + ',\'date\')">' +
            (r.date || '<span style="color:var(--text3)">—</span>') + '</td>' +
          '<td style="' + tdBase + _cellBg(r.weight1_state) + '"' +
            ' onclick="Pages._cScanEditCell(' + i + ',\'weight1\')">' +
            (r.weight1 ? r.weight1 + '<span style="font-size:.6rem">g</span>' : '<span style="color:var(--text3)">—</span>') + '</td>' +
          '<td style="' + tdBase + _cellBg(r.weight2_state) + '"' +
            ' onclick="Pages._cScanEditCell(' + i + ',\'weight2\')">' +
            (r.weight2 ? r.weight2 + '<span style="font-size:.6rem">g</span>' : '<span style="color:var(--text3)">—</span>') + '</td>' +
          '<td style="' + tdBase + _cellBg(r.exchange_state) + '"' +
            ' onclick="Pages._cScanEditCell(' + i + ',\'exchange\')">' +
            _exchDisplay(r.exchange) + '</td>' +
          '</tr>';
      }
    } else {
      // 個体: 2列×4行（左4行：日付/体重/交換、右4行：日付/体重/交換）
      html += '<thead><tr>' +
        '<th style="' + thStyle + ';width:18%">日付</th>' +
        '<th style="' + thStyle + ';width:18%">体重</th>' +
        '<th style="' + thStyle + ';width:20%">交換</th>' +
        '<th style="width:3px;background:var(--border);padding:0"></th>' +
        '<th style="' + thStyle + ';width:18%">日付</th>' +
        '<th style="' + thStyle + ';width:18%">体重</th>' +
        '<th style="' + thStyle + ';width:20%">交換</th>' +
        '</tr></thead><tbody>';

      // 左列: 行0〜3、右列: 行4〜7（最大8行。現在は4行なので右列は空）
      var leftRows  = [rows[0], rows[1], rows[2], rows[3]];
      var rightRows = [null, null, null, null]; // 将来8行対応時に使用

      for (var j = 0; j < 4; j++) {
        var lr = leftRows[j];
        var rr = rightRows[j];
        html += '<tr>' +
          '<td style="' + tdBase + _cellBg(lr.date_state) + '"' +
            ' onclick="Pages._cScanEditCell(' + j + ',\'date\')">' +
            (lr.date || '<span style="color:var(--text3)">—</span>') + '</td>' +
          '<td style="' + tdBase + _cellBg(lr.weight1_state) + '"' +
            ' onclick="Pages._cScanEditCell(' + j + ',\'weight1\')">' +
            (lr.weight1 ? lr.weight1 + '<span style="font-size:.6rem">g</span>' : '<span style="color:var(--text3)">—</span>') + '</td>' +
          '<td style="' + tdBase + _cellBg(lr.exchange_state) + '"' +
            ' onclick="Pages._cScanEditCell(' + j + ',\'exchange\')">' +
            _exchDisplay(lr.exchange) + '</td>' +
          '<td style="width:3px;background:var(--border);padding:0"></td>' +
          '<td style="' + tdBase + (rr ? _cellBg(rr.date_state) : 'background:rgba(255,255,255,.03);') + '">' +
            (rr && rr.date ? rr.date : '<span style="color:var(--text3)">—</span>') + '</td>' +
          '<td style="' + tdBase + (rr ? _cellBg(rr.weight1_state) : 'background:rgba(255,255,255,.03);') + '">' +
            (rr && rr.weight1 ? rr.weight1 + '<span style="font-size:.6rem">g</span>' : '<span style="color:var(--text3)">—</span>') + '</td>' +
          '<td style="' + tdBase + (rr ? _cellBg(rr.exchange_state) : 'background:rgba(255,255,255,.03);') + '">' +
            (rr ? _exchDisplay(rr.exchange) : '<span style="color:var(--text3)">—</span>') + '</td>' +
          '</tr>';
      }
    }

    html += '</tbody></table></div></div>';
    return html;
  }

  // saving
  function renderSaving() {
    main.innerHTML =
      UI.header('💾 保存中...', {}) +
      '<div class="page-body" style="text-align:center;padding-top:40px">' +
        '<div style="font-size:2rem;margin-bottom:12px">💾</div>' +
        '<div style="font-size:.9rem;color:var(--text2)">成長記録を保存しています...</div>' +
      '</div>';
  }

  // ──────────────────────────────────────────────────────────────
  // セル編集モーダル
  // ──────────────────────────────────────────────────────────────
  Pages._cScanEditCell = function(rowIdx, col) {
    var rows = _state.tableRows;
    if (!rows || rowIdx >= rows.length) return;
    var row = rows[rowIdx];
    var isUnit = _state.targetType === 'UNIT';
    var members = _state.members;

    // 交換欄の編集は専用UI
    if (col === 'exchange') {
      _editExchangeCell(rowIdx, row);
      return;
    }

    // 日付・体重欄のテキスト編集
    var colLabel = col === 'date' ? '日付' :
                   col === 'weight1' ? (isUnit ? '①体重(g)' : '体重(g)') : '②体重(g)';
    var currentVal = row[col] || '';
    var inputType  = col === 'date' ? 'date' : 'number';
    var placeholder = col === 'date' ? 'MM/DD または YYYY/MM/DD' : '例: 12.5';

    // 日付をinputのdate形式に変換
    if (col === 'date' && currentVal) {
      // "04/12" → "2026-04-12" などに変換試行
      var dateForInput = _normalizeDate(currentVal);
      currentVal = dateForInput || currentVal;
    }

    UI.modal(
      '<div class="modal-title" style="font-size:.9rem;font-weight:700;padding-bottom:8px">' +
        (rowIdx + 1) + '行目 — ' + colLabel + 'を編集' +
      '</div>' +
      '<div style="padding:8px 0">' +
        '<input id="cell-edit-input" type="' + inputType + '" class="input"' +
          ' value="' + currentVal + '"' +
          ' placeholder="' + placeholder + '"' +
          ' inputmode="' + (col === 'date' ? 'text' : 'decimal') + '"' +
          ' step="' + (col === 'date' ? '' : '0.1') + '"' +
          ' style="font-size:1.1rem;text-align:center">' +
        (col !== 'date' ? '<div style="font-size:.7rem;color:var(--text3);margin-top:6px;text-align:center">g（グラム）</div>' : '') +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>' +
        '<button class="btn btn-primary" style="flex:2"' +
          ' onclick="Pages._cScanCellSave(' + rowIdx + ',\'' + col + '\')">確定</button>' +
      '</div>'
    );

    // フォーカス
    setTimeout(function() {
      var inp = document.getElementById('cell-edit-input');
      if (inp) inp.focus();
    }, 100);
  };

  function _editExchangeCell(rowIdx, row) {
    var cur = row.exchange || '';
    UI.modal(
      '<div class="modal-title" style="font-size:.9rem;font-weight:700;padding-bottom:8px">' +
        (rowIdx + 1) + '行目 — 交換種別を選択' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;padding:8px 0">' +
        '<button class="btn ' + (cur==='FULL' ? 'btn-primary' : 'btn-ghost') + '"' +
          ' style="padding:16px;font-size:1rem"' +
          ' onclick="Pages._cScanCellSave(' + rowIdx + ',\'exchange\',\'FULL\')">' +
          '■全 &nbsp;— 全交換' +
        '</button>' +
        '<button class="btn ' + (cur==='ADD' ? 'btn-primary' : 'btn-ghost') + '"' +
          ' style="padding:16px;font-size:1rem"' +
          ' onclick="Pages._cScanCellSave(' + rowIdx + ',\'exchange\',\'ADD\')">' +
          '■追 &nbsp;— 追加マット' +
        '</button>' +
        '<button class="btn ' + (cur==='NONE'||!cur ? 'btn-primary' : 'btn-ghost') + '"' +
          ' style="padding:16px;font-size:1rem"' +
          ' onclick="Pages._cScanCellSave(' + rowIdx + ',\'exchange\',\'NONE\')">' +
          '□ &nbsp;— なし' +
        '</button>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-ghost btn-full" onclick="UI.closeModal()">キャンセル</button>' +
      '</div>'
    );
  }

  Pages._cScanCellSave = function(rowIdx, col, forceVal) {
    var rows = _state.tableRows;
    if (!rows || rowIdx >= rows.length) return;
    var row = rows[rowIdx];

    var val;
    if (forceVal !== undefined) {
      val = forceVal;
    } else {
      var inp = document.getElementById('cell-edit-input');
      val = inp ? inp.value.trim() : '';
    }

    if (col === 'date') {
      // date input の値 (YYYY-MM-DD) を表示用に変換
      if (val && val.match(/^\d{4}-\d{2}-\d{2}$/)) {
        val = val.slice(5).replace('-', '/');  // "04/12"
      }
      row.date       = val;
      row.date_state = val ? 'high' : 'empty';
    } else if (col === 'weight1') {
      row.weight1       = val;
      row.weight1_state = val ? 'high' : 'empty';
    } else if (col === 'weight2') {
      row.weight2       = val;
      row.weight2_state = val ? 'high' : 'empty';
    } else if (col === 'exchange') {
      row.exchange       = val;
      row.exchange_state = val && val !== 'NONE' ? 'high' : 'empty';
    }

    UI.closeModal && UI.closeModal();
    // テーブル部分だけ再描画（全体rerenderを避ける）
    _refreshTable();
  };

  function _refreshTable() {
    // 確認画面のテーブル部分だけ更新
    var isUnit  = _state.targetType === 'UNIT';
    var members = _state.members;
    // カードを探して差し替え
    var cards = main.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].innerHTML.indexOf('記録テーブル') !== -1) {
        var tmp = document.createElement('div');
        tmp.innerHTML = _renderRecordTable(isUnit, members);
        cards[i].parentNode.replaceChild(tmp.firstChild, cards[i]);
        return;
      }
    }
  }

  // 日付文字列をdate input用(YYYY-MM-DD)に正規化
  function _normalizeDate(s) {
    if (!s) return '';
    // YYYY/MM/DD → YYYY-MM-DD
    if (s.match(/^\d{4}\/\d{2}\/\d{2}$/)) return s.replace(/\//g, '-');
    // YYYY-MM-DD はそのまま
    if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
    // MM/DD → 今年のYYYY-MM-DD
    var mm = s.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (mm) {
      var year = new Date().getFullYear();
      return year + '-' + String(mm[1]).padStart(2,'0') + '-' + String(mm[2]).padStart(2,'0');
    }
    return '';
  }

  // ──────────────────────────────────────────────────────────────
  // イベントハンドラ
  // ──────────────────────────────────────────────────────────────

  Pages._cScanOpenCamera = function() {
    var inp = document.getElementById('cs-file-input');
    if (inp) { inp.setAttribute('capture','environment'); inp.click(); }
  };

  Pages._cScanOpenGallery = function() {
    var inp = document.getElementById('cs-gallery-input');
    if (inp) { inp.removeAttribute('capture'); inp.click(); }
  };

  // ── 画像選択後: QR検出（前処理付き） + Gemini OCR を同時実行 ─
  Pages._cScanOnImageSelected = async function(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = async function(e) {
      var base64 = e.target.result;
      _state.capturedImage = base64;
      _state.qrError  = null;
      _state.tableRows = null;  // テーブルデータをリセット
      _state.step = 'processing';
      render();

      var geminiKey = (typeof CONFIG !== 'undefined' && CONFIG.GEMINI_KEY)
                   || Store.getSetting('gemini_key') || '';

      var results;
      try {
        results = await Promise.all([
          _extractQrFromImage(base64),
          geminiKey
            ? _callGeminiOCR(geminiKey, base64)
            : Promise.resolve({ _confidence: 'low', _error: 'Gemini APIキー未設定' }),
        ]);
      } catch(err) {
        console.error('[ContinuousScan] processing error:', err);
        _state.step = 'capture';
        _state.qrError = '解析中にエラーが発生しました: ' + (err.message || '不明なエラー');
        render();
        return;
      }

      var qrText    = results[0];
      var ocrResult = results[1];

      // QRをGeminiが取得している場合のフォールバック
      if (!qrText && ocrResult && ocrResult.qr_text) {
        qrText = ocrResult.qr_text;
        console.log('[ContinuousScan] QR fallback from Gemini:', qrText);
      }

      console.log('[ContinuousScan] QR:', qrText, '/ OCR confidence:', ocrResult && ocrResult._confidence);

      var qrResolved = _resolveFromQrText(qrText);

      if (!qrResolved) {
        _state.step = 'capture';
        _state.qrError = qrText
          ? 'QRコードを検出しましたが対象が特定できませんでした（' + qrText + '）'
          : 'QRコードが検出できませんでした。ラベル全体が写るよう撮影してください。';
        render();
        return;
      }

      _state.targetType = qrResolved.targetType;
      _state.targetId   = qrResolved.targetId;
      _state.displayId  = qrResolved.displayId;
      _state.entity     = qrResolved.entity || _resolveEntity(qrResolved.targetType, qrResolved.targetId);
      _state.members    = _parseMembers(_state.entity);
      _state.ocrResult  = ocrResult;

      if (!geminiKey) {
        UI.toast('Gemini APIキーが未設定です。設定画面で入力してください。', 'error', 5000);
      }

      _state.step = 'confirm';
      render();
    };
    reader.readAsDataURL(file);
  };

  // ── Gemini Vision API 呼び出し ─────────────────────────────────
  async function _callGeminiOCR(apiKey, imageDataUrl) {
    var base64Data = imageDataUrl.split(',')[1];
    var mimeType   = imageDataUrl.split(';')[0].split(':')[1] || 'image/jpeg';

    var prompt =
'あなたはクワガタ飼育ラベルのOCR専門AIです。\n' +
'このラベル画像から手書きデータを読み取り、必ずJSON形式のみで返答してください。\n\n' +
'【ラベルの構造】\n' +
'- 上部: QRコード・ユニットID・区分・マット種別チェックボックス・ステージチェックボックス\n' +
'- 下部: 記録テーブル（日付 / 体重 / 交換種別）\n\n' +
'【重要】QRコードも読み取ってください\n' +
'- 画像内のQRコードを解析し、テキストを qr_text フィールドに格納してください\n' +
'- QRコードが読めない場合は null にしてください\n\n' +
'【チェックボックスの読み取りルール】\n' +
'- M（マット）行: T0, T1, T2, T3 のチェックボックス。■（黒塗り）=チェック済み\n' +
'  → 最後（右端）のチェック済み項目が現在のマット種別\n' +
'- St（ステージ）行: L1L2, L3, 前蛹, 蛹, 成虫\n' +
'  → ステージ値: L1L2 / L3 / PREPUPA / PUPA / ADULT_PRE / ADULT\n\n' +
'【記録テーブルの読み取り】\n' +
'- 個体ラベル: 4行×2列（左4行・右4行）= 最大8行\n' +
'- ユニットラベル: 4行×4列（日付 / ①体重 / ②体重 / 交換）\n' +
'- 書き込みがある行をすべて records 配列に格納してください\n' +
'- 日付: MM/DD または YYYY/MM/DD 形式\n' +
'- 体重①/体重②: 数値のみ（g）\n' +
'- 交換種別:\n' +
'  ・「全」にチェック → "FULL"（全交換）\n' +
'  ・「追」にチェック → "ADD"（追加マット）\n' +
'  ・どちらもなし   → "NONE"\n\n' +
'【出力フォーマット（JSONのみ、前後のテキスト不要）】\n' +
'{\n' +
'  "qr_text": "BU:HM2026-B2-023 または IND:IND-xxx または null",\n' +
'  "mat_type": "T0|T1|T2|T3|MD または null",\n' +
'  "stage": "L1L2|L3|PREPUPA|PUPA|ADULT_PRE|ADULT または null",\n' +
'  "records": [\n' +
'    {\n' +
'      "date": "MM/DD または null",\n' +
'      "weight": 数値または null,\n' +
'      "weight1": 数値または null,\n' +
'      "weight2": 数値または null,\n' +
'      "exchange": "FULL|ADD|NONE",\n' +
'      "_confidence": "high|low"\n' +
'    }\n' +
'  ],\n' +
'  "note": "読み取れなかった部分があれば記述",\n' +
'  "_confidence": "high|medium|low"\n' +
'}';

    var requestBody = {
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]}],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
    };

    var response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody) }
    );

    if (!response.ok) {
      var errText = await response.text();
      throw new Error('Gemini API エラー (' + response.status + '): ' + errText.slice(0,200));
    }

    var data    = await response.json();
    var rawText = (data.candidates && data.candidates[0] &&
                   data.candidates[0].content && data.candidates[0].content.parts &&
                   data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
    console.log('[ContinuousScan] Gemini raw:', rawText);

    var clean = rawText.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
    try {
      return JSON.parse(clean);
    } catch(_) {
      var match = clean.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('GeminiのJSONパース失敗: ' + clean.slice(0,100));
    }
  }

  // ── 保存処理 ───────────────────────────────────────────────────
  Pages._cScanSave = async function() {
    var recDate = (document.getElementById('cs-date') && document.getElementById('cs-date').value || '').replace(/-/g,'/');
    var mat     = document.getElementById('cs-mat')   && document.getElementById('cs-mat').value   || '';
    var stage   = document.getElementById('cs-stage') && document.getElementById('cs-stage').value || '';
    var note    = document.getElementById('cs-note')  && document.getElementById('cs-note').value  || '';
    var isUnit  = _state.targetType === 'UNIT';

    if (!stage) { UI.toast('ステージを選択してください', 'error'); return; }

    var rows = _state.tableRows || [];

    // 記録データが1行以上あるか確認
    var hasData = rows.some(function(r){ return r.weight1 || r.weight2 || r.date; });
    if (!hasData) {
      UI.toast('体重または日付を少なくとも1行入力してください', 'error');
      return;
    }

    _state.step = 'saving';
    render();

    try {
      var basePayload = {
        target_type:   _state.targetType,
        target_id:     _state.targetId,
        stage:         stage,
        mat_type:      mat,
        event_type:    'WEIGHT_ONLY',
        note_private:  note,
        has_malt:      false,
      };

      var savedCount = 0;

      if (isUnit) {
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          if (!r.weight1 && !r.weight2 && !r.date) continue;

          var rowDate = r.date
            ? r.date.replace(/\//g,'/').trim()
            : recDate || new Date().toISOString().split('T')[0].replace(/-/g,'/');

          // 日付正規化（MM/DD → YYYY/MM/DD）
          if (rowDate && rowDate.match(/^\d{1,2}\/\d{1,2}$/)) {
            rowDate = new Date().getFullYear() + '/' + rowDate;
          }

          var exchVal = r.exchange || 'NONE';

          var members = _state.members;

          if (r.weight1 !== '' || members[0]) {
            var rec1 = Object.assign({}, basePayload, {
              record_date:   rowDate,
              exchange_type: exchVal,
              unit_slot_no:  1,
              weight_g:      r.weight1 ? parseFloat(r.weight1) : '',
            });
            await API.growth.create(rec1);
            savedCount++;
          }
          if (r.weight2 !== '' || members[1]) {
            var rec2 = Object.assign({}, basePayload, {
              record_date:   rowDate,
              exchange_type: exchVal,
              unit_slot_no:  2,
              weight_g:      r.weight2 ? parseFloat(r.weight2) : '',
            });
            await API.growth.create(rec2);
            savedCount++;
          }
        }
      } else {
        for (var k = 0; k < rows.length; k++) {
          var row = rows[k];
          if (!row.weight1 && !row.date) continue;

          var rowDateInd = row.date
            ? row.date.trim()
            : recDate || new Date().toISOString().split('T')[0].replace(/-/g,'/');

          if (rowDateInd && rowDateInd.match(/^\d{1,2}\/\d{1,2}$/)) {
            rowDateInd = new Date().getFullYear() + '/' + rowDateInd;
          }

          var recInd = Object.assign({}, basePayload, {
            record_date:   rowDateInd,
            exchange_type: row.exchange || 'NONE',
            weight_g:      row.weight1 ? parseFloat(row.weight1) : '',
          });
          await API.growth.create(recInd);
          savedCount++;
        }
      }

      UI.toast('✅ ' + savedCount + '件の成長記録を保存しました', 'success', 3000);

      if (_state.targetType === 'UNIT') {
        routeTo('unit-detail', { unitDisplayId: _state.displayId });
      } else {
        routeTo('ind-detail', { indId: _state.targetId });
      }

    } catch(err) {
      console.error('[ContinuousScan] save error:', err);
      _state.step = 'confirm';
      render();
      UI.toast('保存失敗: ' + (err.message || '通信エラー'), 'error', 5000);
    }
  };

  // ── ナビゲーション ─────────────────────────────────────────────
  Pages._cScanBackToCapture = function() {
    _state.step      = 'capture';
    _state.tableRows = null;
    render();
  };

  // ── 初回レンダリング ───────────────────────────────────────────
  render();
};

// ── ページ登録 ────────────────────────────────────────────────────
window.PAGES = window.PAGES || {};
window.PAGES['continuous-scan'] = function() {
  Pages.continuousScan(Store.getParams());
};
