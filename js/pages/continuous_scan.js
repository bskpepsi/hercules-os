// ────────────────────────────────────────────────────────────────
// FILE: js/pages/continuous_scan.js
// ════════════════════════════════════════════════════════════════
// continuous_scan.js — 継続読取りモード（1ステップ版）
// build: 20260413bd
//
// 【フロー】
//   ① ラベル全体を1枚撮影（またはギャラリーから選択）
//   ② jsQR でQRコードを検出 → UNIT/IND を特定（同時）
//   ③ Gemini Vision で手書きデータをOCR（同時）
//   ④ 確認・修正画面（編集可能）
//   ⑤ growth_records に保存
//
// 【scan.jsとの関係】
//   継続読取りタブから直接このページに遷移する。
//   QRスキャン画面を経由しない。
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

  // ── 画像からQRコードを検出 ────────────────────────────────────
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
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        resolve(code ? code.data : null);
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
            '💡 QRコードが鮮明に写るよう、明るい場所で撮影してください。' +
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
              'QRコードが写っている鮮明な画像で再試行してください。' +
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
  // ステップ3: 確認・修正画面
  // ──────────────────────────────────────────────────────────────
  function renderConfirm() {
    var ocr     = _state.ocrResult || {};
    var isUnit  = _state.targetType === 'UNIT';
    var members = _state.members;
    var dispId  = _state.displayId || _state.targetId || '—';

    var today   = new Date().toISOString().split('T')[0];
    var recDate = (ocr.record_date || today).replace(/\//g,'-');
    var mat     = ocr.mat_type      || '';
    var stage   = ocr.stage         || '';
    var exch    = ocr.exchange_type || 'FULL';
    var w1      = ocr.weight_1 != null ? ocr.weight_1 : '';
    var w2      = ocr.weight_2 != null ? ocr.weight_2 : '';
    var wInd    = ocr.weight   != null ? ocr.weight
                : ocr.weight_1 != null ? ocr.weight_1 : '';

    var matOptions = ['T0','T1','T2','T3','MD'].map(function(m){
      return '<option value="'+m+'"'+(mat===m?' selected':'')+'>'+m+'</option>';
    }).join('');
    var stageOptions = [
      {v:'L1L2',l:'L1L2'},{v:'L3',l:'L3'},{v:'PREPUPA',l:'前蛹'},
      {v:'PUPA',l:'蛹'},{v:'ADULT_PRE',l:'成虫（未後食）'},{v:'ADULT',l:'成虫（活動中）'}
    ].map(function(s){
      return '<option value="'+s.v+'"'+(stage===s.v?' selected':'')+'>'+s.l+'</option>';
    }).join('');
    var exchOptions = [
      {v:'FULL',l:'全交換'},{v:'PARTIAL',l:'追加のみ'},{v:'NONE',l:'なし'}
    ].map(function(x){
      return '<option value="'+x.v+'"'+(exch===x.v?' selected':'')+'>'+x.l+'</option>';
    }).join('');

    var prevRecs = (Store.getGrowthRecords && Store.getGrowthRecords(_state.targetId)) || [];
    var lastRec  = prevRecs.length
      ? prevRecs.slice().sort(function(a,b){ return String(b.record_date).localeCompare(String(a.record_date)); })[0]
      : null;

    var entityStage = _state.entity
      ? (_state.entity.current_stage || _state.entity.stage_phase || '') : '';

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
            '✅ OCR読み取り完了。内容を確認・修正してから保存してください。' +
          '</div>'
        ) +

        // 撮影画像プレビュー
        (_state.capturedImage ?
          '<div style="text-align:center">' +
            '<img src="' + _state.capturedImage + '"' +
              ' style="max-height:100px;border-radius:6px;border:1px solid var(--border)">' +
          '</div>' : '') +

        // 入力フォーム
        '<div class="card" style="padding:14px">' +
          '<div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:12px">📝 記録内容の確認・修正</div>' +

          '<div style="margin-bottom:12px">' +
            '<label style="font-size:.72rem;color:var(--text3);font-weight:700">記録日</label>' +
            '<input type="date" id="cs-date" class="input" value="' + recDate + '" style="margin-top:4px">' +
          '</div>' +

          '<div style="margin-bottom:12px">' +
            '<label style="font-size:.72rem;color:var(--text3);font-weight:700">🌿 マット種別</label>' +
            '<select id="cs-mat" class="input" style="margin-top:4px">' +
              '<option value="">選択...</option>' + matOptions +
            '</select>' +
          '</div>' +

          '<div style="margin-bottom:12px">' +
            '<label style="font-size:.72rem;color:var(--text3);font-weight:700">📊 ステージ <span style="color:var(--red)">*</span></label>' +
            '<select id="cs-stage" class="input" style="margin-top:4px">' +
              '<option value="">選択...</option>' + stageOptions +
            '</select>' +
          '</div>' +

          '<div style="margin-bottom:12px">' +
            '<label style="font-size:.72rem;color:var(--text3);font-weight:700">🔄 交換種別</label>' +
            '<select id="cs-exch" class="input" style="margin-top:4px">' + exchOptions + '</select>' +
          '</div>' +

          (isUnit ?
            '<div style="font-size:.72rem;color:var(--text3);font-weight:700;margin-bottom:6px">⚖️ 体重</div>' +
            '<div style="display:flex;gap:8px;margin-bottom:12px">' +
              '<div style="flex:1">' +
                '<label style="font-size:.68rem;color:var(--text3)">' +
                  (members[0] ? (members[0].sex||'?')+' ' : '') + '①頭目' +
                '</label>' +
                '<div style="display:flex;align-items:center;gap:4px;margin-top:4px">' +
                  '<input type="number" id="cs-w1" class="input" value="' + w1 + '"' +
                    ' placeholder="—" inputmode="decimal" style="text-align:center">' +
                  '<span style="font-size:.75rem;color:var(--text3)">g</span>' +
                '</div>' +
              '</div>' +
              '<div style="flex:1">' +
                '<label style="font-size:.68rem;color:var(--text3)">' +
                  (members[1] ? (members[1].sex||'?')+' ' : '') + '②頭目' +
                '</label>' +
                '<div style="display:flex;align-items:center;gap:4px;margin-top:4px">' +
                  '<input type="number" id="cs-w2" class="input" value="' + w2 + '"' +
                    ' placeholder="—" inputmode="decimal" style="text-align:center">' +
                  '<span style="font-size:.75rem;color:var(--text3)">g</span>' +
                '</div>' +
              '</div>' +
            '</div>'
          :
            '<div style="margin-bottom:12px">' +
              '<label style="font-size:.72rem;color:var(--text3);font-weight:700">⚖️ 体重</label>' +
              '<div style="display:flex;align-items:center;gap:4px;margin-top:4px">' +
                '<input type="number" id="cs-wind" class="input" value="' + wInd + '"' +
                  ' placeholder="—" inputmode="decimal" style="max-width:100px;text-align:center">' +
                '<span style="font-size:.75rem;color:var(--text3)">g</span>' +
              '</div>' +
            '</div>'
          ) +

          '<div>' +
            '<label style="font-size:.72rem;color:var(--text3);font-weight:700">メモ（任意）</label>' +
            '<input type="text" id="cs-note" class="input" value="' + (ocr.note||'') + '"' +
              ' placeholder="気になることがあれば..." style="margin-top:4px">' +
          '</div>' +
        '</div>' +

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

  // ── 画像選択後: QR検出 + Gemini OCR を同時実行 ────────────────
  Pages._cScanOnImageSelected = async function(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = async function(e) {
      var base64 = e.target.result;
      _state.capturedImage = base64;
      _state.qrError = null;
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

      var qrText   = results[0];
      var ocrResult = results[1];
      console.log('[ContinuousScan] QR:', qrText, '/ OCR confidence:', ocrResult && ocrResult._confidence);

      // QR解決
      var qrResolved = _resolveFromQrText(qrText);

      if (!qrResolved) {
        _state.step = 'capture';
        _state.qrError = qrText
          ? 'QRコードを検出しましたが対象が特定できませんでした（' + qrText + '）'
          : 'QRコードが検出できませんでした。ラベルのQRコードが写るよう撮影してください。';
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

    var prompt = 'あなたはクワガタ飼育ラベルのOCR専門AIです。\n' +
'このラベル画像から手書きデータを読み取り、必ずJSON形式のみで返答してください。\n\n' +
'【ラベルの構造】\n' +
'- 上部: QRコード・ユニットID・区分・マット種別チェックボックス・ステージチェックボックス\n' +
'- 下部: 記録テーブル（日付 / 体重① / 体重② / 交換種別）\n\n' +
'【チェックボックスの読み取りルール】\n' +
'- M（マット）行: T0, T1, T2, T3 のチェックボックスがある。■（黒塗り）=チェック済み、□=未チェック\n' +
'  → チェックが入っている項目の中で最後（右端）のものが現在のマット種別\n' +
'  → 例: □T0 ■T1 ■T2 □T3 → mat_type = "T2"\n' +
'- St（ステージ）行: L1L2, L3, 前蛹, 蛹, 成虫 のチェックボックスがある\n' +
'  → 同様にチェックが入っている最後のもの\n' +
'  → 例: ■L1L2 ■L3 □前蛹 □蛹 □成虫 → stage = "L3"\n' +
'  → ステージ値は必ず: L1L2 / L3 / PREPUPA / PUPA / ADULT_PRE / ADULT のいずれか\n\n' +
'【テーブルの読み取り】\n' +
'- 最新の書き込み行（空でない行のうち最下段）の値を読む\n' +
'- 日付: YYYY/MM/DD または MM/DD 形式\n' +
'- 体重①: 1頭目の体重(g) 数値のみ\n' +
'- 体重②: 2頭目の体重(g) 数値のみ（1頭飼育ならnull）\n' +
'- 交換種別: 「全」にチェック→ FULL、「追」にチェック→ PARTIAL、なし→ NONE\n\n' +
'【出力フォーマット（JSONのみ、他のテキスト不要）】\n' +
'{\n' +
'  "record_date": "YYYY-MM-DD または null",\n' +
'  "mat_type": "T0|T1|T2|T3|MD または null",\n' +
'  "stage": "L1L2|L3|PREPUPA|PUPA|ADULT_PRE|ADULT または null",\n' +
'  "exchange_type": "FULL|PARTIAL|NONE",\n' +
'  "weight_1": 数値または null,\n' +
'  "weight_2": 数値または null,\n' +
'  "note": "読み取れなかった部分があれば記述",\n' +
'  "_confidence": "high|medium|low"\n' +
'}';

    var requestBody = {
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]}],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
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
    var exch    = document.getElementById('cs-exch')  && document.getElementById('cs-exch').value  || 'FULL';
    var note    = document.getElementById('cs-note')  && document.getElementById('cs-note').value  || '';
    var isUnit  = _state.targetType === 'UNIT';

    if (!stage) { UI.toast('ステージを選択してください', 'error'); return; }

    _state.step = 'saving';
    render();

    try {
      var basePayload = {
        target_type:   _state.targetType,
        target_id:     _state.targetId,
        record_date:   recDate || new Date().toISOString().split('T')[0].replace(/-/g,'/'),
        stage:         stage,
        mat_type:      mat,
        exchange_type: exch,
        event_type:    'WEIGHT_ONLY',
        note_private:  note,
        has_malt:      false,
      };

      if (isUnit) {
        var w1e = document.getElementById('cs-w1');
        var w2e = document.getElementById('cs-w2');
        var w1 = w1e ? (parseFloat(w1e.value||'') || null) : null;
        var w2 = w2e ? (parseFloat(w2e.value||'') || null) : null;
        var members = _state.members;
        var records = [];
        if (w1 !== null || members[0]) records.push(Object.assign({}, basePayload, { unit_slot_no:1, weight_g: w1||'' }));
        if (w2 !== null || members[1]) records.push(Object.assign({}, basePayload, { unit_slot_no:2, weight_g: w2||'' }));
        for (var i=0; i<records.length; i++) await API.growth.create(records[i]);
        records.forEach(function(rec) {
          if (typeof Store.addDBItem === 'function')
            Store.addDBItem('growth_records', Object.assign({}, rec, { record_id:'GR-local-'+Date.now() }));
        });
      } else {
        var wInde = document.getElementById('cs-wind');
        var wInd  = wInde ? (parseFloat(wInde.value||'') || null) : null;
        var rec   = Object.assign({}, basePayload, { weight_g: wInd||'' });
        await API.growth.create(rec);
        if (typeof Store.addDBItem === 'function')
          Store.addDBItem('growth_records', Object.assign({}, rec, { record_id:'GR-local-'+Date.now() }));
      }

      UI.toast('✅ 成長記録を保存しました', 'success', 3000);

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
    _state.step = 'capture';
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
