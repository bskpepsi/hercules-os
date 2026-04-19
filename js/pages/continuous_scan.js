// FILE: js/pages/continuous_scan.js  build: 20260418k
// 変更点(20260418j→20260418k):
//   - 継続読取り画面の戻るボタン（←）の遷移先を明示的に決定
//     params.targetType/displayId から正しい元画面に戻す。
//     以前は Store.back() 依存で、ユニット詳細→継続読取り→←の経路で
//     「ユニットが見つかりません」画面になっていたのを修正。
//
// 変更点(20260418i→20260418j): target_id = unit_id 統一
//   - _resolveFromQrText の BU 分岐で targetId を unit_id 優先に
//     （以前は display_id が入り、成長記録の target_id が HM2025-xx-Uxx となって
//      unit_id 検索でヒットしない問題を修正）
//   - batchScan 内の同関数も同様に修正
//   - 既存の display_id で保存されたレコードはそのまま残る
//     （unit_detail.js 側で両方の ID で履歴を検索してマージ表示する）
//
// 以前の変更点(bi→20260418i): Step2 継続読取りのフォロー改修
//   - 確認画面の共通設定カードに「区分」3択ボタン(大/中/小)を追加
//     OCR の size_category を初期反映、ユーザー修正可
//   - 性別3択の「未確定」ラベルを「不明」に変更（他画面と表記統一）
//     ユニットの場合も共通設定から 1頭目/2頭目 それぞれの性別・区分を入力可能に
//   - 保存時に members JSON の sex / size_category を自動更新
//     （変更があれば API.unit.update、Store キャッシュも楽観的更新）
//   - batchScan（一括読取り）と OCR ロジックは一切変更しない
//
// 以前の変更点(bf→bi):
//   - Geminiプロンプト: 性別◯の読み取りルール追加、チェックボックスルール修正
//   - 確認画面に「容器」列追加（行ごとに変更/「この行から変更」で以降一括適用）
//   - マット列も行ごとに設定可能
//   - size_category（大/中/小）は容器サイズとは別の個体属性として扱う
//   - 撮影画像を大きく表示、カメラガイド枠付きプレビュー
//   - 右列交換欄を□全/□追表示、個体8行対応

'use strict';
console.log('[HerculesOS] continuous_scan.js v20260418k loaded');

// ────────────────────────────────────────────────────────────────
// 共有ユーティリティ（continuousScan / batchScan 両方から使用）
// ────────────────────────────────────────────────────────────────

// 画像圧縮（Gemini送信用・転送量削減で高速化）
function _resizeImageForOCR(base64, maxPx) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var w=img.width, h=img.height;
      if(w<=maxPx && h<=maxPx){resolve(base64);return;}
      var scale=maxPx/Math.max(w,h), sw=Math.round(w*scale), sh=Math.round(h*scale);
      var cv=document.createElement('canvas'); cv.width=sw; cv.height=sh;
      cv.getContext('2d').drawImage(img,0,0,sw,sh);
      resolve(cv.toDataURL('image/jpeg',0.80));
    };
    img.onerror=function(){resolve(base64);};
    img.src=base64;
  });
}

// Canvas前処理（グレースケール+コントラスト強調）
function _preprocessCanvas(canvas, ctx, w, h) {
  var d=ctx.getImageData(0,0,w,h),px=d.data,ga=new Uint8Array(w*h),mn=255,mx=0;
  for (var i=0;i<px.length;i+=4){var g=Math.round(px[i]*0.299+px[i+1]*0.587+px[i+2]*0.114);ga[i>>2]=g;if(g<mn)mn=g;if(g>mx)mx=g;}
  var rng=mx-mn||1;
  for (var j=0;j<ga.length;j++){var bw=Math.round((ga[j]-mn)/rng*255)>128?255:0;px[j*4]=px[j*4+1]=px[j*4+2]=bw;px[j*4+3]=255;}
  ctx.putImageData(d,0,0); return ctx.getImageData(0,0,w,h);
}

// QRコード検出
function _extractQrFromImage(url) {
  return new Promise(function(resolve) {
    if (typeof jsQR==='undefined') {resolve(null);return;}
    var img=new Image();
    img.onload=function() {
      var cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height;
      var ctx=cv.getContext('2d'); ctx.drawImage(img,0,0);
      var d1=ctx.getImageData(0,0,cv.width,cv.height);
      var c1=jsQR(d1.data,d1.width,d1.height,{inversionAttempts:'attemptBoth'});
      if(c1&&c1.data){resolve(c1.data);return;}
      ctx.drawImage(img,0,0);
      var d2=_preprocessCanvas(cv,ctx,cv.width,cv.height);
      var c2=jsQR(d2.data,d2.width,d2.height,{inversionAttempts:'attemptBoth'});
      if(c2&&c2.data){resolve(c2.data);return;}
      if(img.width>1200){
        var sc=1200/img.width,sw=Math.round(img.width*sc),sh=Math.round(img.height*sc);
        cv.width=sw;cv.height=sh;ctx.drawImage(img,0,0,sw,sh);
        var d3=ctx.getImageData(0,0,sw,sh);
        var c3=jsQR(d3.data,d3.width,d3.height,{inversionAttempts:'attemptBoth'});
        if(c3&&c3.data){resolve(c3.data);return;}
      }
      resolve(null);
    };
    img.onerror=function(){resolve(null);}; img.src=url;
  });
}

// QRテキストからエンティティ解決
function _resolveFromQrText(qrText) {
  if(!qrText)return null;
  var parts=qrText.split(':'); if(parts.length<2)return null;
  var prefix=parts[0].toUpperCase(), id=parts.slice(1).join(':').trim();
  if(prefix==='BU'){
    var units=Store.getDB('breeding_units')||[];
    var unit=units.find(function(u){return u.display_id===id;})||units.find(function(u){return u.unit_id===id;})||{display_id:id,unit_id:id};
    // [20260418j] targetId は unit_id を優先（GAS上の主キー）。
    // 以前は display_id を使っており、成長記録の target_id に HM2025-A2-U01 のような
    // 表示IDが入って unit_id 検索で履歴がヒットしなくなっていた。
    var _targetId = unit.unit_id || unit.display_id || id;
    return {targetType:'UNIT',targetId:_targetId,displayId:unit.display_id||id,entity:unit};
  }
  if(prefix==='IND'){
    var ind=(Store.getIndividual&&Store.getIndividual(id))||(Store.getDB('individuals')||[]).find(function(i){return i.ind_id===id||i.display_id===id;});
    if(!ind)return null;
    return {targetType:'IND',targetId:ind.ind_id||id,displayId:ind.display_id||id,entity:ind};
  }
  return null;
}

// Gemini OCR呼び出し
async function _callGeminiOCR(apiKey, imageDataUrl) {
  var base64Data=imageDataUrl.split(',')[1];
  var mimeType=imageDataUrl.split(';')[0].split(':')[1]||'image/jpeg';
  var prompt=
'あなたはクワガタ飼育ラベルのOCR専門AIです。\n'+
'このラベル画像から情報を読み取り、必ずJSON形式のみで返答してください。\n\n'+
'【ラベルの構造】\n'+
'上部: QRコード / ID / 性別表示(♂・♀) / 区分チェック / マット(M)チェック / ステージ(St)チェック\n'+
'下部: 記録テーブル（日付 / 体重 / 交換）\n\n'+
'【QRコードの読み取り】\n'+
'画像内のQRコードを解析してqr_textに格納。読めない場合はnull。\n\n'+
'【性別の読み取り】\n'+
'ラベル右上に「♂ ・ ♀」の表示があります。\n'+
'手書きで◯（丸）が付いている方が確定した性別です。\n'+
'例: 「◯♂ ・ ♀」→ sex="♂"\n'+
'例: 「♂ ・ ◯♀」→ sex="♀"\n'+
'◯がない場合や読み取れない場合 → sex=null\n\n'+
'【チェックボックスの読み取りルール】\n'+
'■=チェック済み（黒塗り）、□=未チェック（空白）\n'+
'左から右の順に並んでいる。連続する■の中で一番右の■が現在の状態。\n'+
'右側に□があっても問題なし（まだそのステージ/マットに到達していないだけ）。\n'+
'例: □T0 ■T1 □T2 □T3 □MD → 現在マット="T1"\n'+
'例: □T0 ■T1 ■T2 □T3 □MD → 現在マット="T2"\n'+
'例: □T0 ■T1 ■T2 ■T3 □MD → 現在マット="T3"\n'+
'マット(M行): T0→T1→T2→T3→MD の順\n'+
'ステージ(St行): L1L2→L3→前蛹→蛹→成虫 の順\n'+
'  ステージ値: L1L2/L3/PREPUPA/PUPA/ADULT_PRE/ADULT\n\n'+
'【区分チェック（体重区分）】\n'+
'連続する■の中で一番右が現在の区分: ■大→"大" / ■中→"中" / ■小→"小"\n'+
'※区分は容器サイズではなく体重によるサイズ分類です\n\n'+
'【記録テーブルの読み取り】\n'+
'個体ラベル: 最大8行（左4行+右4行）\n'+
'ユニットラベル: 最大4行（日付/①体重/②体重/交換）\n'+
'書き込みがある行をすべてrecordsに格納\n'+
'日付: MM/DD形式 / 体重: 数値のみ(g)\n'+
'交換: 「全」にチェック→"FULL" / 「追」にチェック→"ADD" / なし→"NONE"\n\n'+
'【出力JSON（他のテキスト不要）】\n'+
'{\n'+
'  "qr_text": "BU:xxx または IND:xxx または null",\n'+
'  "sex": "♂ または ♀ または null",\n'+
'  "mat_type": "T0|T1|T2|T3|MD または null",\n'+
'  "stage": "L1L2|L3|PREPUPA|PUPA|ADULT_PRE|ADULT または null",\n'+
'  "size_category": "大|中|小 または null",\n'+
'  "records": [\n'+
'    {"date":"MM/DD","weight":数値,"weight1":数値,"weight2":数値,"exchange":"FULL|ADD|NONE","_confidence":"high|low"}\n'+
'  ],\n'+
'  "note": "読み取れなかった部分があれば記述",\n'+
'  "_confidence": "high|medium|low"\n'+
'}';

  var resp=await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+apiKey,
    {method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({
       contents:[{parts:[{text:prompt},{inline_data:{mime_type:mimeType,data:base64Data}}]}],
       generationConfig:{temperature:0.1,maxOutputTokens:2048,thinkingConfig:{thinkingBudget:0}},
     })}
  );
  if(!resp.ok){var et=await resp.text();throw new Error('Gemini API エラー ('+resp.status+'): '+et.slice(0,200));}
  var data=await resp.json();
  var rawText=(((data.candidates||[])[0]||{}).content||{parts:[{text:''}]}).parts[0].text||'';
  var clean=rawText.replace(/\`\`\`json\s*/g,'').replace(/\`\`\`\s*/g,'').trim();
  try{return JSON.parse(clean);}
  catch(_){var m=clean.match(/\{[\s\S]*\}/);if(m)return JSON.parse(m[0]);throw new Error('JSONパース失敗: '+clean.slice(0,100));}
}

Pages.continuousScan = function(params) {
  params = params || {};
  var main = document.getElementById('main');

  var MAT_OPTIONS  = ['T0','T1','T2','T3','MD'];
  var CONT_OPTIONS = ['1.8L','2.7L','4.8L','8L','10L'];

  // ── [20260418k] 戻るボタンの遷移先を決定 ──
  //   ユニット詳細/個体詳細から飛んできた場合はそこに戻す。
  //   そうでなければ Store.back()。
  //   params.displayId が BU-xxx or HM2025-xx-Uxx の場合: ユニット詳細へ
  //   params.targetType === 'IND' で targetId がある場合: 個体詳細へ
  //   それ以外: Store.back()
  function _csHeaderBackFn() {
    if (params.targetType === 'UNIT' && params.displayId) {
      // unitDisplayId はシングルクォート文字列で onclick に埋め込むため、
      // クォート系は念のためサニタイズ
      var safeDisp = String(params.displayId).replace(/'/g, "").replace(/"/g, '');
      return "routeTo('unit-detail',{unitDisplayId:'" + safeDisp + "'})";
    }
    if (params.targetType === 'IND' && params.targetId) {
      var safeId = String(params.targetId).replace(/'/g, "").replace(/"/g, '');
      return "routeTo('ind-detail',{indId:'" + safeId + "'})";
    }
    return 'Store.back()';
  }

  var _state = {
    step:'capture', targetType:null, targetId:null, displayId:null,
    entity:null, members:[], capturedImage:null, ocrResult:null,
    qrError:null, tableRows:null,
    // OCRで読んだ性別（確認画面で編集可能）
    detectedSex: null,  // '♂' | '♀' | '不明' | null (個体用)
    // OCRで読んだ区分（確認画面で編集可能・個体のみ）
    detectedSize: null, // '大' | '中' | '小' | null
    // ユニット用: 各スロットの性別・区分を個別保持
    // _slotData[0] = 1頭目, _slotData[1] = 2頭目
    // { sex: '♂'|'♀'|'不明'|'', size_category: '大'|'中'|'小'|'' }
    _slotData: [ { sex:'', size_category:'' }, { sex:'', size_category:'' } ],
  };

  function _resolveEntity(type, id) {
    if (type==='UNIT') return (Store.getUnit&&Store.getUnit(id))||(Store.getUnitByDisplayId&&Store.getUnitByDisplayId(id))||(Store.getDB('breeding_units')||[]).find(function(u){return u.unit_id===id||u.display_id===id;})||null;
    if (type==='IND')  return (Store.getIndividual&&Store.getIndividual(id))||(Store.getDB('individuals')||[]).find(function(i){return i.ind_id===id||i.display_id===id;})||null;
    return null;
  }
  function _parseMembers(entity) {
    if (!entity||!entity.members) return [];
    try { var r=entity.members; return Array.isArray(r)?r:JSON.parse(r); } catch(_){return [];}
  }

  // ── QR検出・エンティティ解決はトップレベル関数を使用 ──

  
  // ── テーブル行初期化 ──────────────────────────────────────────
  function _emptyRow(defMat, defCont) {
    return {date:'',weight1:'',weight2:'',exchange:'',mat_type:defMat||'',container:defCont||'',
            date_state:'empty',weight1_state:'empty',weight2_state:'empty',exchange_state:'empty',
            mat_state:'auto',container_state:'auto'};
  }

  function _buildTableRows(ocrResult, isUnit) {
    var ocr=ocrResult||{}, ocrRows=ocr.records||[];
    var defMat=ocr.mat_type||'', defCont='';
    var maxRows=isUnit?4:8, rows=[];
    for (var i=0;i<maxRows;i++){
      var ocrRow=ocrRows[i]||null, row=_emptyRow(defMat,defCont);
      if(ocrRow){
        if(ocrRow.date)    {row.date=String(ocrRow.date);      row.date_state    =ocrRow._confidence==='low'?'low':'high';}
        if(ocrRow.weight)  {row.weight1=String(ocrRow.weight); row.weight1_state =ocrRow._confidence==='low'?'low':'high';}
        if(ocrRow.weight1) {row.weight1=String(ocrRow.weight1);row.weight1_state =ocrRow._confidence==='low'?'low':'high';}
        if(isUnit&&ocrRow.weight2){row.weight2=String(ocrRow.weight2);row.weight2_state=ocrRow._confidence==='low'?'low':'high';}
        if(ocrRow.exchange){row.exchange=ocrRow.exchange;       row.exchange_state=ocrRow._confidence==='low'?'low':'high';}
      }
      if(i===0&&ocrRows.length===0){
        if(ocr.record_date){row.date=ocr.record_date;row.date_state=ocr._confidence==='low'?'low':'high';}
        var w=ocr.weight||ocr.weight_1;
        if(w){row.weight1=String(w);row.weight1_state=ocr._confidence==='low'?'low':'high';}
        if(isUnit&&ocr.weight_2){row.weight2=String(ocr.weight_2);row.weight2_state=ocr._confidence==='low'?'low':'high';}
        if(ocr.exchange_type){row.exchange=ocr.exchange_type;row.exchange_state=ocr._confidence==='low'?'low':'high';}
      }
      rows.push(row);
    }
    return rows;
  }

  function render() {
    if(_state.step==='capture')    return renderCapture();
    if(_state.step==='processing') return renderProcessing();
    if(_state.step==='confirm')    return renderConfirm();
    if(_state.step==='saving')     return renderSaving();
  }

  // ── Step1: 撮影 ───────────────────────────────────────────────
  function renderCapture() {
    main.innerHTML =
      UI.header('📷 継続読取り', {back:true, backFn: _csHeaderBackFn()}) +
      '<div class="page-body">' +
      '<div class="card" style="padding:14px 16px"><div style="font-size:.82rem;font-weight:700;color:var(--text2);margin-bottom:6px">📋 使い方</div>' +
      '<div style="font-size:.74rem;color:var(--text3);line-height:1.8">① カメラボタンを押す<br>② 画面の<span style="color:#4caf78;font-weight:700">緑の枠</span>にラベル全体を合わせる<br>③ 枠内に収まったら「撮影する」を押す<br>💡 明るい場所でQRコードが鮮明に写るよう注意</div></div>' +
      // カメラプレビュー（ガイド枠）
      '<div id="cs-camera-preview" style="display:none">' +
        '<div style="position:relative;width:100%;background:#000;border-radius:8px;overflow:hidden">' +
          '<video id="cs-video" autoplay playsinline muted style="width:100%;display:block;max-height:300px;object-fit:cover"></video>' +
          '<canvas id="cs-canvas" style="display:none"></canvas>' +
          '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">' +
            '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.4)"></div>' +
            '<div style="position:relative;width:62%;padding-bottom:70%;z-index:1">' +
              '<div style="position:absolute;inset:0;border:3px solid #4caf78;border-radius:4px">' +
                '<div style="position:absolute;top:-3px;left:-3px;width:18px;height:18px;border-top:4px solid #4caf78;border-left:4px solid #4caf78;border-radius:2px 0 0 0"></div>' +
                '<div style="position:absolute;top:-3px;right:-3px;width:18px;height:18px;border-top:4px solid #4caf78;border-right:4px solid #4caf78;border-radius:0 2px 0 0"></div>' +
                '<div style="position:absolute;bottom:-3px;left:-3px;width:18px;height:18px;border-bottom:4px solid #4caf78;border-left:4px solid #4caf78;border-radius:0 0 0 2px"></div>' +
                '<div style="position:absolute;bottom:-3px;right:-3px;width:18px;height:18px;border-bottom:4px solid #4caf78;border-right:4px solid #4caf78;border-radius:0 0 2px 0"></div>' +
              '</div>' +
              '<div style="position:absolute;bottom:-26px;left:0;right:0;text-align:center;font-size:.72rem;color:#4caf78;font-weight:700;white-space:nowrap">ラベルをこの枠に合わせてください</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
          '<button class="btn btn-ghost" style="flex:1" onclick="Pages._cScanStopCamera()">✕ キャンセル</button>' +
          '<button class="btn btn-primary" style="flex:2;font-size:1rem;padding:14px" onclick="Pages._cScanTakePhoto()">📷 撮影する</button>' +
        '</div>' +
      '</div>' +
      // ボタンエリア
      '<div id="cs-btn-area" class="card" style="padding:16px;text-align:center">' +
        '<input type="file" id="cs-file-input" accept="image/*" capture="environment" style="display:none" onchange="Pages._cScanOnImageSelected(this)">' +
        '<button class="btn btn-primary btn-full" style="padding:18px;font-size:1rem;margin-bottom:10px" onclick="Pages._cScanOpenCameraPreview()"><span style="font-size:1.5rem;margin-right:8px">📷</span>カメラでラベルを撮影</button>' +
        '<input type="file" id="cs-gallery-input" accept="image/*" style="display:none" onchange="Pages._cScanOnImageSelected(this)">' +
        '<button class="btn btn-ghost btn-full" style="font-size:.88rem" onclick="Pages._cScanOpenGallery()">🖼️ ギャラリーから選択</button>' +
        '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border2)">' +
          '<button class="btn btn-ghost btn-full" style="font-size:.88rem;color:var(--blue)" onclick="routeTo(\'batch-scan\')">' +
            '📦 一括読取りモード（複数枚まとめて処理）' +
          '</button>' +
        '</div>' +
      '</div>' +
      (_state.qrError ? '<div style="background:rgba(224,64,64,.08);border:1px solid rgba(224,64,64,.3);border-radius:8px;padding:12px 14px;font-size:.78rem;color:#e04040">⚠️ '+_state.qrError+'<br><span style="color:var(--text3);font-size:.72rem">明るい場所でラベル全体が枠に収まるよう再撮影してください。</span></div>' : '') +
      '</div>';
  }

  // ── Step2: 処理中 ────────────────────────────────────────────
  function renderProcessing() {
    main.innerHTML = UI.header('📷 継続読取り', {}) +
      '<div class="page-body" style="text-align:center;padding-top:32px">' +
        '<div style="font-size:2.5rem;margin-bottom:16px">🔍</div>' +
        (_state.capturedImage ? '<div style="margin-bottom:16px"><img src="'+_state.capturedImage+'" style="max-height:200px;border-radius:8px;border:1px solid var(--border)"></div>' : '') +
        '<div style="font-size:.82rem;color:var(--text3);margin-bottom:6px">⏳ QRコードを検出中...</div>' +
        '<div style="font-size:.82rem;color:var(--text3)">⏳ 手書きデータを解析中...</div>' +
      '</div>';
  }

  // ── Step3: 確認・修正 ─────────────────────────────────────────
  function renderConfirm() {
    var ocr=_state.ocrResult||{}, isUnit=_state.targetType==='UNIT';
    var members=_state.members, dispId=_state.displayId||_state.targetId||'—';
    var entityStage=_state.entity?(_state.entity.current_stage||_state.entity.stage_phase||''):'';
    var prevRecs=(Store.getGrowthRecords&&Store.getGrowthRecords(_state.targetId))||[];
    var lastRec=prevRecs.length?prevRecs.slice().sort(function(a,b){return String(b.record_date).localeCompare(String(a.record_date));})[0]:null;

    if(!_state.tableRows) _state.tableRows=_buildTableRows(ocr,isUnit);

    var today=new Date().toISOString().split('T')[0];
    var recDate=(ocr.record_date||today).replace(/\//g,'-');
    var stage=ocr.stage||entityStage||'';
    var mat=ocr.mat_type||'';

    var matOpts=MAT_OPTIONS.map(function(m){return '<option value="'+m+'"'+(mat===m?' selected':'')+'>'+m+'</option>';}).join('');
    var stageOpts=[
      {v:'L1L2',l:'L1L2'},{v:'L3',l:'L3'},{v:'PREPUPA',l:'前蛹'},
      {v:'PUPA',l:'蛹'},{v:'ADULT_PRE',l:'成虫（未後食）'},{v:'ADULT',l:'成虫（活動中）'}
    ].map(function(s){return '<option value="'+s.v+'"'+(stage===s.v?' selected':'')+'>'+s.l+'</option>';}).join('');

    // 性別（OCRで読んだ値 or 個体DBの値）
    var curSex = _state.detectedSex || (_state.entity&&_state.entity.sex) || '';

    main.innerHTML =
      UI.header('📋 読取り確認・修正', {back:true, backFn:'Pages._cScanBackToCapture()'}) +
      '<div class="page-body">' +

      '<div class="card" style="padding:12px 14px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between">' +
          '<div>' +
            '<div style="font-size:.9rem;font-weight:700;color:var(--gold)">'+dispId+'</div>' +
            '<div style="font-size:.72rem;color:var(--text3)">'+(isUnit?'ユニット':'個別飼育')+(entityStage?' / '+entityStage:'')+'</div>' +
            (lastRec?'<div style="font-size:.68rem;color:var(--text3);margin-top:2px">前回: '+lastRec.record_date+' / '+(lastRec.weight_g||'—')+'g</div>':'') +
          '</div>' +
          '<button class="btn btn-ghost btn-sm" onclick="Pages._cScanBackToCapture()">撮り直す</button>' +
        '</div>' +
      '</div>' +

      (ocr._confidence==='low'
        ? '<div style="background:rgba(224,144,64,.1);border:1px solid rgba(224,144,64,.3);border-radius:8px;padding:10px 12px;font-size:.76rem;color:var(--amber)">⚠️ 一部の値が読み取れなかった可能性があります。内容を確認してください。</div>'
        : '<div style="background:rgba(76,175,120,.08);border:1px solid rgba(76,175,120,.25);border-radius:8px;padding:10px 12px;font-size:.76rem;color:var(--green)">✅ OCR読み取り完了。セルをタップして修正できます。</div>'
      ) +

      // 撮影画像（大きく）
      (_state.capturedImage ?
        '<div class="card" style="padding:10px 12px"><div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:6px">📸 撮影画像（ラベルと見比えて確認）</div><div style="background:#000;border-radius:6px;overflow:hidden"><img src="'+_state.capturedImage+'" style="width:100%;max-height:260px;object-fit:contain;display:block"></div></div>' : '') +

      // 凡例
      '<div style="display:flex;gap:10px;font-size:.68rem;padding:0 2px;flex-wrap:wrap">' +
        '<span style="display:flex;align-items:center;gap:3px"><span style="width:10px;height:10px;background:rgba(76,175,120,.35);border-radius:2px;display:inline-block"></span>OCR読取済</span>' +
        '<span style="display:flex;align-items:center;gap:3px"><span style="width:10px;height:10px;background:rgba(224,200,64,.35);border-radius:2px;display:inline-block"></span>要確認</span>' +
        '<span style="display:flex;align-items:center;gap:3px"><span style="width:10px;height:10px;background:rgba(100,180,255,.2);border-radius:2px;display:inline-block"></span>自動引継</span>' +
        '<span style="display:flex;align-items:center;gap:3px"><span style="width:10px;height:10px;background:rgba(255,255,255,.05);border-radius:2px;display:inline-block"></span>未記入</span>' +
      '</div>' +

      // メインテーブル
      _renderRecordTable(isUnit, members) +

      // 共通設定
      '<div class="card" style="padding:14px">' +
        '<div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:10px">🗓️ 共通設定</div>' +

        // ── [20260418i] 性別・区分（個体とユニットで切替） ──
        (!isUnit
          // ── 個体: 性別1つ + 区分1つ ──
          ? (
            '<div style="margin-bottom:10px">' +
              '<label style="font-size:.72rem;color:var(--text3);font-weight:700">性別 <span style="font-size:.68rem;color:var(--text3);font-weight:400">（OCRで読んだ◯を反映）</span></label>' +
              '<div style="display:flex;gap:8px;margin-top:6px">' +
                '<button class="btn '+(curSex==='♂'?'btn-primary':'btn-ghost')+'" style="flex:1;padding:10px" onclick="Pages._cScanSetSex(\'♂\')">◯♂ 雄</button>' +
                '<button class="btn '+(curSex==='♀'?'btn-primary':'btn-ghost')+'" style="flex:1;padding:10px" onclick="Pages._cScanSetSex(\'♀\')">◯♀ 雌</button>' +
                '<button class="btn '+(curSex==='不明'||!curSex?'btn-primary':'btn-ghost')+'" style="flex:1;padding:10px" onclick="Pages._cScanSetSex(\'不明\')">不明</button>' +
              '</div>' +
            '</div>' +
            '<div style="margin-bottom:10px">' +
              '<label style="font-size:.72rem;color:var(--text3);font-weight:700">区分 <span style="font-size:.68rem;color:var(--text3);font-weight:400">（OCRで読んだ■を反映）</span></label>' +
              '<div style="display:flex;gap:8px;margin-top:6px">' +
                ['大','中','小'].map(function(sz){
                  var on = _state.detectedSize === sz;
                  return '<button class="btn '+(on?'btn-primary':'btn-ghost')+'" style="flex:1;padding:10px" onclick="Pages._cScanSetSize(\''+sz+'\')">'+sz+'</button>';
                }).join('') +
              '</div>' +
            '</div>'
          )
          // ── ユニット: 1頭目・2頭目それぞれの性別+区分 ──
          : (function(){
            var html = '';
            var slotCount = Math.max(members.length, 2);
            for (var si = 0; si < slotCount; si++) {
              var sd = _state._slotData[si] || {sex:'', size_category:''};
              var slotLabel = (si+1) + '頭目';
              var mSex = members[si] && members[si].sex;
              // ヘッダー横に確定済みマーク
              var headerMark = sd.sex === '♂' ? ' <span style="color:var(--male,#5ba8e8);font-weight:700">♂</span>'
                             : sd.sex === '♀' ? ' <span style="color:var(--female,#e87fa0);font-weight:700">♀</span>' : '';
              html +=
                '<div style="margin-bottom:14px;padding:10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px">' +
                  '<div style="font-size:.82rem;font-weight:700;color:var(--text1);margin-bottom:8px">'+slotLabel+headerMark+'</div>' +
                  // 性別
                  '<div style="margin-bottom:8px">' +
                    '<label style="font-size:.7rem;color:var(--text3);font-weight:700">性別</label>' +
                    '<div style="display:flex;gap:6px;margin-top:4px">' +
                      '<button class="btn '+(sd.sex==='♂'?'btn-primary':'btn-ghost')+'" style="flex:1;padding:8px;font-size:.85rem" onclick="Pages._cScanSetSlotSex('+si+',\'♂\')">♂</button>' +
                      '<button class="btn '+(sd.sex==='♀'?'btn-primary':'btn-ghost')+'" style="flex:1;padding:8px;font-size:.85rem" onclick="Pages._cScanSetSlotSex('+si+',\'♀\')">♀</button>' +
                      '<button class="btn '+(sd.sex==='不明'||!sd.sex?'btn-primary':'btn-ghost')+'" style="flex:1;padding:8px;font-size:.85rem" onclick="Pages._cScanSetSlotSex('+si+',\'不明\')">不明</button>' +
                    '</div>' +
                  '</div>' +
                  // 区分
                  '<div>' +
                    '<label style="font-size:.7rem;color:var(--text3);font-weight:700">区分</label>' +
                    '<div style="display:flex;gap:6px;margin-top:4px">' +
                      ['大','中','小'].map(function(sz){
                        var on = sd.size_category === sz;
                        return '<button class="btn '+(on?'btn-primary':'btn-ghost')+'" style="flex:1;padding:8px;font-size:.85rem" onclick="Pages._cScanSetSlotSize('+si+',\''+sz+'\')">'+sz+'</button>';
                      }).join('') +
                    '</div>' +
                  '</div>' +
                '</div>';
            }
            return html;
          })()
        ) +

        '<div style="margin-bottom:10px">' +
          '<label style="font-size:.72rem;color:var(--text3);font-weight:700">記録日（デフォルト）</label>' +
          '<input type="date" id="cs-date" class="input" value="'+recDate+'" style="margin-top:4px">' +
        '</div>' +
        '<div style="margin-bottom:10px">' +
          '<label style="font-size:.72rem;color:var(--text3);font-weight:700">📊 ステージ <span style="color:var(--red)">*</span></label>' +
          '<select id="cs-stage" class="input" style="margin-top:4px"><option value="">選択...</option>'+stageOpts+'</select>' +
        '</div>' +
        '<div>' +
          '<label style="font-size:.72rem;color:var(--text3);font-weight:700">メモ（任意）</label>' +
          '<input type="text" id="cs-note" class="input" value="'+(ocr.note||'')+'" placeholder="気になることがあれば..." style="margin-top:4px">' +
        '</div>' +
      '</div>' +

      '<details style="margin-top:4px"><summary style="font-size:.72rem;color:var(--text3);cursor:pointer;padding:8px">🔍 OCR生データを確認</summary>' +
        '<div style="background:var(--surface2);border-radius:8px;padding:10px;font-family:monospace;font-size:.68rem;color:var(--text3);white-space:pre-wrap">'+JSON.stringify(ocr,null,2)+'</div>' +
      '</details>' +

      '</div>' +
      '<div class="quick-action-bar">' +
        '<button class="btn btn-ghost" style="flex:1;padding:14px 0" onclick="Pages._cScanBackToCapture()">← 撮り直す</button>' +
        '<button class="btn btn-gold" style="flex:2;padding:14px 0;font-weight:700;font-size:.95rem" onclick="Pages._cScanSave()">💾 記録を保存</button>' +
      '</div>';
  }

  // 性別ボタン（個体用）
  Pages._cScanSetSex = function(sex) {
    _state.detectedSex = sex || null;
    render();
  };

  // ── [20260418i] 区分ボタン（個体用）
  Pages._cScanSetSize = function(sz) {
    _state.detectedSize = sz || null;
    render();
  };

  // ── [20260418i] ユニット用: スロット別の性別セッター
  Pages._cScanSetSlotSex = function(slotIdx, sex) {
    if (!_state._slotData[slotIdx]) _state._slotData[slotIdx] = { sex:'', size_category:'' };
    _state._slotData[slotIdx].sex = sex || '';
    render();
  };

  // ── [20260418i] ユニット用: スロット別の区分セッター
  Pages._cScanSetSlotSize = function(slotIdx, sz) {
    if (!_state._slotData[slotIdx]) _state._slotData[slotIdx] = { sex:'', size_category:'' };
    _state._slotData[slotIdx].size_category = sz || '';
    render();
  };

  // ── 記録テーブル HTML ─────────────────────────────────────────
  function _renderRecordTable(isUnit, members) {
    var rows=_state.tableRows||[];
    var m0l=members&&members[0]?((members[0].sex||'?')+' ①'):'①';
    var m1l=members&&members[1]?((members[1].sex||'?')+' ②'):'②';

    function bg(s) {
      if(s==='high')   return 'background:rgba(76,175,120,.25);';
      if(s==='low')    return 'background:rgba(224,200,64,.25);';
      if(s==='auto')   return 'background:rgba(100,180,255,.12);';
      if(s==='manual') return 'background:rgba(76,175,120,.18);';
      return 'background:rgba(255,255,255,.05);';
    }
    function exch(v) {
      if(v==='FULL') return '<span style="color:#60d080;font-weight:700">■全</span><br><span style="color:var(--text3)">□追</span>';
      if(v==='ADD')  return '<span style="color:var(--text3)">□全</span><br><span style="color:#60d080;font-weight:700">■追</span>';
      return '<span style="color:var(--text3)">□全</span><br><span style="color:var(--text3)">□追</span>';
    }
    function td(bgS, content, oc, extra) {
      return '<td style="border:1.5px solid var(--border);padding:5px 2px;font-size:.72rem;font-weight:700;text-align:center;cursor:pointer;min-width:0;'+(bgS)+(extra||'')+'" onclick="'+oc+'">'+content+'</td>';
    }
    function tdWt(bgS, val, oc) {
      return td(bgS, val?val+'<span style="font-size:.55rem">g</span>':'<span style="color:var(--text3)">—</span>', oc);
    }
    function tdSm(bgS, val, oc) {
      return td(bgS, val||'—', oc, 'font-size:.65rem;');
    }
    var thS='border:1.5px solid var(--border);padding:4px 2px;font-size:.65rem;font-weight:700;color:var(--text2);text-align:center;background:var(--surface2)';
    var sep='<td style="width:2px;background:var(--border);padding:0"></td>';

    var html='<div class="card" style="padding:10px 12px">' +
      '<div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:6px">📝 記録テーブル <span style="font-size:.65rem;color:var(--text3);font-weight:400">（セルをタップして編集。マット/容器はタップで「この行から変更」）</span></div>' +
      '<div style="overflow-x:auto">';

    if (isUnit) {
      html += '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
        '<thead><tr>' +
        '<th style="'+thS+';width:18%">日付</th>' +
        '<th style="'+thS+';width:13%">'+m0l+'</th>' +
        '<th style="'+thS+';width:13%">'+m1l+'</th>' +
        '<th style="'+thS+';width:18%">交換</th>' +
        '<th style="'+thS+';width:14%">マット</th>' +
        '<th style="'+thS+';width:14%">容器</th>' +
        '</tr></thead><tbody>';
      for (var i=0;i<4;i++) {
        var r=rows[i]||_emptyRow('','');
        html += '<tr>' +
          td(bg(r.date_state),    r.date||'—',          'Pages._cScanEditCell('+i+',\'date\')') +
          tdWt(bg(r.weight1_state), r.weight1,            'Pages._cScanEditCell('+i+',\'weight1\')') +
          tdWt(bg(r.weight2_state), r.weight2,            'Pages._cScanEditCell('+i+',\'weight2\')') +
          td(bg(r.exchange_state), exch(r.exchange),       'Pages._cScanEditCell('+i+',\'exchange\')') +
          tdSm(bg(r.mat_state),    r.mat_type||'—',       'Pages._cScanEditCell('+i+',\'mat\')') +
          tdSm(bg(r.container_state), r.container||'—',  'Pages._cScanEditCell('+i+',\'container\')') +
          '</tr>';
      }
      html += '</tbody></table>';
    } else {
      html += '<table style="min-width:520px;width:100%;border-collapse:collapse;table-layout:fixed">' +
        '<thead><tr>' +
        '<th style="'+thS+';width:11%">日付</th><th style="'+thS+';width:9%">体重</th><th style="'+thS+';width:12%">交換</th><th style="'+thS+';width:8%">M</th><th style="'+thS+';width:8%">容器</th>' +
        sep +
        '<th style="'+thS+';width:11%">日付</th><th style="'+thS+';width:9%">体重</th><th style="'+thS+';width:12%">交換</th><th style="'+thS+';width:8%">M</th><th style="'+thS+';width:8%">容器</th>' +
        '</tr></thead><tbody>';
      for (var j=0;j<4;j++) {
        var lr=rows[j]||_emptyRow('',''), rr=rows[j+4]||_emptyRow('',''), ri=j+4;
        html += '<tr>' +
          td(bg(lr.date_state),    lr.date||'—',         'Pages._cScanEditCell('+j+',\'date\')') +
          tdWt(bg(lr.weight1_state), lr.weight1,           'Pages._cScanEditCell('+j+',\'weight1\')') +
          td(bg(lr.exchange_state),  exch(lr.exchange),     'Pages._cScanEditCell('+j+',\'exchange\')') +
          tdSm(bg(lr.mat_state),     lr.mat_type||'—',     'Pages._cScanEditCell('+j+',\'mat\')') +
          tdSm(bg(lr.container_state), lr.container||'—',  'Pages._cScanEditCell('+j+',\'container\')') +
          sep +
          td(bg(rr.date_state),    rr.date||'—',         'Pages._cScanEditCell('+ri+',\'date\')') +
          tdWt(bg(rr.weight1_state), rr.weight1,           'Pages._cScanEditCell('+ri+',\'weight1\')') +
          td(bg(rr.exchange_state),  exch(rr.exchange),     'Pages._cScanEditCell('+ri+',\'exchange\')') +
          tdSm(bg(rr.mat_state),     rr.mat_type||'—',    'Pages._cScanEditCell('+ri+',\'mat\')') +
          tdSm(bg(rr.container_state), rr.container||'—', 'Pages._cScanEditCell('+ri+',\'container\')') +
          '</tr>';
      }
      html += '</tbody></table>';
    }
    html += '</div></div>';
    return html;
  }

  function renderSaving() {
    main.innerHTML = UI.header('💾 保存中...', {}) +
      '<div class="page-body" style="text-align:center;padding-top:40px"><div style="font-size:2rem;margin-bottom:12px">💾</div><div style="font-size:.9rem;color:var(--text2)">成長記録を保存しています...</div></div>';
  }

  // ── セル編集 ──────────────────────────────────────────────────
  Pages._cScanEditCell = function(rowIdx, col) {
    if(!_state.tableRows) return;
    while(_state.tableRows.length<=rowIdx) _state.tableRows.push(_emptyRow('',''));
    var row=_state.tableRows[rowIdx];
    if(col==='exchange'){_editExchangeCell(rowIdx,row);return;}
    if(col==='mat')     {_editMatCell(rowIdx,row);     return;}
    if(col==='container'){_editContainerCell(rowIdx,row);return;}

    var isUnit=_state.targetType==='UNIT';
    var lbl=col==='date'?'日付':col==='weight1'?(isUnit?'①体重(g)':'体重(g)'):'②体重(g)';
    var tp=col==='date'?'date':'number', cur=row[col]||'';
    if(col==='date'&&cur) cur=_normalizeDate(cur)||cur;

    UI.modal(
      '<div class="modal-title" style="font-size:.9rem;font-weight:700;padding-bottom:8px">'+(rowIdx+1)+'行目 — '+lbl+'を編集</div>' +
      '<div style="padding:8px 0"><input id="cell-edit-input" type="'+tp+'" class="input" value="'+cur+'" placeholder="'+(col==='date'?'MM/DD または YYYY/MM/DD':'例: 12.5')+'" inputmode="'+(col==='date'?'text':'decimal')+'" step="'+(col==='date'?'':'0.1')+'" style="font-size:1.1rem;text-align:center">'+(col!=='date'?'<div style="font-size:.7rem;color:var(--text3);margin-top:6px;text-align:center">g（グラム）</div>':'')+'</div>' +
      '<div class="modal-footer"><button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button><button class="btn btn-primary" style="flex:2" onclick="Pages._cScanCellSave('+rowIdx+',\''+col+'\')">確定</button></div>'
    );
    setTimeout(function(){var inp=document.getElementById('cell-edit-input');if(inp)inp.focus();},100);
  };

  function _editExchangeCell(rowIdx, row) {
    var cur=row.exchange||'';
    UI.modal(
      '<div class="modal-title" style="font-size:.9rem;font-weight:700;padding-bottom:8px">'+(rowIdx+1)+'行目 — 交換種別</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;padding:8px 0">' +
        '<button class="btn '+(cur==='FULL'?'btn-primary':'btn-ghost')+'" style="padding:16px;font-size:1rem" onclick="Pages._cScanCellSave('+rowIdx+',\'exchange\',\'FULL\')">■全 — 全交換</button>' +
        '<button class="btn '+(cur==='ADD'?'btn-primary':'btn-ghost')+'" style="padding:16px;font-size:1rem" onclick="Pages._cScanCellSave('+rowIdx+',\'exchange\',\'ADD\')">■追 — 追加マット</button>' +
        '<button class="btn '+((!cur||cur==='NONE')?'btn-primary':'btn-ghost')+'" style="padding:16px;font-size:1rem" onclick="Pages._cScanCellSave('+rowIdx+',\'exchange\',\'NONE\')">□ — なし</button>' +
      '</div>' +
      '<div class="modal-footer"><button class="btn btn-ghost btn-full" onclick="UI.closeModal()">キャンセル</button></div>'
    );
  }

  function _editMatCell(rowIdx, row) {
    var cur=row.mat_type||'';
    var btns=MAT_OPTIONS.map(function(m){return '<button class="btn '+(cur===m?'btn-primary':'btn-ghost')+'" style="flex:1;padding:12px 4px;font-size:.9rem" onclick="Pages._cScanCellSave('+rowIdx+',\'mat\',\''+m+'\')">'+m+'</button>';}).join('');
    UI.modal(
      '<div class="modal-title" style="font-size:.9rem;font-weight:700;padding-bottom:8px">'+(rowIdx+1)+'行目 — マット種別</div>' +
      '<div style="font-size:.74rem;color:var(--text3);margin-bottom:8px">この行から以降の全行に適用されます</div>' +
      '<div style="display:flex;gap:6px;padding:4px 0;flex-wrap:wrap">'+btns+'</div>' +
      '<div class="modal-footer"><button class="btn btn-ghost btn-full" onclick="UI.closeModal()">キャンセル</button></div>'
    );
  }

  function _editContainerCell(rowIdx, row) {
    var cur=row.container||'';
    var btns=CONT_OPTIONS.map(function(c){return '<button class="btn '+(cur===c?'btn-primary':'btn-ghost')+'" style="flex:1;padding:12px 4px;font-size:.9rem" onclick="Pages._cScanCellSave('+rowIdx+',\'container\',\''+c+'\')">'+c+'</button>';}).join('');
    UI.modal(
      '<div class="modal-title" style="font-size:.9rem;font-weight:700;padding-bottom:8px">'+(rowIdx+1)+'行目 — 容器サイズ</div>' +
      '<div style="font-size:.74rem;color:var(--text3);margin-bottom:8px">この行から以降の全行に適用されます</div>' +
      '<div style="display:flex;gap:6px;padding:4px 0;flex-wrap:wrap">'+btns+'</div>' +
      '<div class="modal-footer"><button class="btn btn-ghost btn-full" onclick="UI.closeModal()">キャンセル</button></div>'
    );
  }

  Pages._cScanCellSave = function(rowIdx, col, forceVal) {
    if(!_state.tableRows) return;
    while(_state.tableRows.length<=rowIdx) _state.tableRows.push(_emptyRow('',''));
    var rows=_state.tableRows, row=rows[rowIdx];
    var val=forceVal!==undefined?forceVal:(function(){var inp=document.getElementById('cell-edit-input');return inp?inp.value.trim():'';})();

    if(col==='date'){
      if(val&&val.match(/^\d{4}-\d{2}-\d{2}$/)) val=val.slice(5).replace('-','/');
      row.date=val; row.date_state=val?'high':'empty';
    } else if(col==='weight1'){row.weight1=val;row.weight1_state=val?'high':'empty';}
    else if(col==='weight2'){row.weight2=val;row.weight2_state=val?'high':'empty';}
    else if(col==='exchange'){row.exchange=val;row.exchange_state=val&&val!=='NONE'?'high':'empty';}
    else if(col==='mat'){for(var i=rowIdx;i<rows.length;i++){rows[i].mat_type=val;rows[i].mat_state='manual';}}
    else if(col==='container'){for(var j=rowIdx;j<rows.length;j++){rows[j].container=val;rows[j].container_state='manual';}}

    UI.closeModal&&UI.closeModal(); _refreshTable();
  };

  function _refreshTable() {
    var isUnit=_state.targetType==='UNIT', members=_state.members;
    var cards=main.querySelectorAll('.card');
    for(var i=0;i<cards.length;i++){
      if(cards[i].innerHTML.indexOf('記録テーブル')!==-1){
        var tmp=document.createElement('div'); tmp.innerHTML=_renderRecordTable(isUnit,members);
        cards[i].parentNode.replaceChild(tmp.firstChild,cards[i]); return;
      }
    }
  }

  function _normalizeDate(s) {
    if(!s)return'';
    if(s.match(/^\d{4}\/\d{2}\/\d{2}$/)) return s.replace(/\//g,'-');
    if(s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
    var mm=s.match(/^(\d{1,2})\/(\d{1,2})$/);
    if(mm) return new Date().getFullYear()+'-'+String(mm[1]).padStart(2,'0')+'-'+String(mm[2]).padStart(2,'0');
    return'';
  }

  // ── カメラ制御 ────────────────────────────────────────────────
  Pages._cScanOpenCamera = function() {
    var inp=document.getElementById('cs-file-input');
    if(inp){inp.setAttribute('capture','environment');inp.click();}
  };
  Pages._cScanOpenCameraPreview = async function() {
    var pa=document.getElementById('cs-camera-preview'), ba=document.getElementById('cs-btn-area');
    if(!pa||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){Pages._cScanOpenCamera();return;}
    try {
      var stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920,min:640},height:{ideal:1080,min:480}}});
      var video=document.getElementById('cs-video');
      if(!video){stream.getTracks().forEach(function(t){t.stop();});return;}
      video.srcObject=stream; pa.style.display='block'; if(ba)ba.style.display='none'; video.play();
    } catch(e){console.warn('[CS] getUserMedia:',e.message);Pages._cScanOpenCamera();}
  };
  Pages._cScanStopCamera = function() {
    var video=document.getElementById('cs-video');
    if(video&&video.srcObject){video.srcObject.getTracks().forEach(function(t){t.stop();});video.srcObject=null;}
    var pa=document.getElementById('cs-camera-preview'), ba=document.getElementById('cs-btn-area');
    if(pa)pa.style.display='none'; if(ba)ba.style.display='block';
  };
  Pages._cScanTakePhoto = function() {
    var video=document.getElementById('cs-video'), canvas=document.getElementById('cs-canvas');
    if(!video||!canvas)return;
    canvas.width=video.videoWidth||1280; canvas.height=video.videoHeight||720;
    var ctx=canvas.getContext('2d'); ctx.drawImage(video,0,0);
    var fw=canvas.width, fh=canvas.height;
    var cw=Math.round(fw*0.72), ch=Math.round(cw*(70/62));
    if(ch>fh*0.95){ch=Math.round(fh*0.95);cw=Math.round(ch*(62/70));}
    var cx=Math.round((fw-cw)/2), cy=Math.round((fh-ch)/2);
    var cc=document.createElement('canvas'); cc.width=cw; cc.height=ch;
    cc.getContext('2d').drawImage(canvas,cx,cy,cw,ch,0,0,cw,ch);
    Pages._cScanStopCamera();
    Pages._cScanProcessImage(cc.toDataURL('image/jpeg',0.92));
  };
  Pages._cScanOpenGallery = function() {
    var inp=document.getElementById('cs-gallery-input');
    if(inp){inp.removeAttribute('capture');inp.click();}
  };
  Pages._cScanOnImageSelected = function(input) {
    var file=input&&input.files&&input.files[0]; if(!file)return;
    var reader=new FileReader();
    reader.onload=function(e){Pages._cScanProcessImage(e.target.result);};
    reader.readAsDataURL(file);
  };

  // ── 画像圧縮（Gemini送信用・転送量削減で高速化） ───────────────
  function _resizeImageForOCR(base64, maxPx) {
    return new Promise(function(resolve) {
      var img = new Image();
      img.onload = function() {
        var w=img.width, h=img.height;
        if(w<=maxPx && h<=maxPx){resolve(base64);return;}
        var scale=maxPx/Math.max(w,h), sw=Math.round(w*scale), sh=Math.round(h*scale);
        var cv=document.createElement('canvas'); cv.width=sw; cv.height=sh;
        cv.getContext('2d').drawImage(img,0,0,sw,sh);
        resolve(cv.toDataURL('image/jpeg',0.80));
      };
      img.onerror=function(){resolve(base64);};
      img.src=base64;
    });
  }

  // ── 画像処理 ──────────────────────────────────────────────────
  Pages._cScanProcessImage = async function(base64) {
    _state.capturedImage=base64; _state.qrError=null; _state.tableRows=null; _state.detectedSex=null;
    _state.step='processing'; render();
    var geminiKey=(typeof CONFIG!=='undefined'&&CONFIG.GEMINI_KEY)||Store.getSetting('gemini_key')||'';
    var results;
    try {
      // QR検出はフル解像度・OCRは640pxに縮小して並列実行（転送量削減）
      var _ocrPromise = geminiKey
        ? _resizeImageForOCR(base64, 640).then(function(small){ return _callGeminiOCR(geminiKey, small); })
        : Promise.resolve({_confidence:'low',_error:'Gemini APIキー未設定'});
      results=await Promise.all([
        _extractQrFromImage(base64),
        _ocrPromise,
      ]);
    } catch(err){
      _state.step='capture'; _state.qrError='解析中にエラーが発生しました: '+(err.message||'不明なエラー');
      render(); return;
    }
    var qrText=results[0], ocrResult=results[1];
    if(!qrText&&ocrResult&&ocrResult.qr_text){qrText=ocrResult.qr_text;console.log('[CS] QR fallback:',qrText);}
    var qrResolved=_resolveFromQrText(qrText);
    if(!qrResolved){
      _state.step='capture';
      _state.qrError=qrText?'QRコードを検出しましたが対象が特定できませんでした（'+qrText+'）':'QRコードが検出できませんでした。ラベル全体が枠に収まるよう撮影してください。';
      render(); return;
    }
    _state.targetType=qrResolved.targetType; _state.targetId=qrResolved.targetId;
    _state.displayId=qrResolved.displayId;
    _state.entity=qrResolved.entity||_resolveEntity(qrResolved.targetType,qrResolved.targetId);
    _state.members=_parseMembers(_state.entity); _state.ocrResult=ocrResult;
    // OCRで読んだ性別をセット
    if(ocrResult&&ocrResult.sex) _state.detectedSex=ocrResult.sex;
    // [20260418i] OCRで読んだ区分をセット
    if(ocrResult&&ocrResult.size_category) _state.detectedSize=ocrResult.size_category;
    // [20260418i] ユニットの場合、既存 members から各スロットの値を初期化
    //   OCR で一括の size_category が読めていれば両スロットにそれをフォールバック適用
    //   （ラベル上の区分表示は2頭共通の1つのみなので妥当）
    if (_state.targetType === 'UNIT') {
      var _m = _state.members || [];
      var _defSize = ocrResult && ocrResult.size_category ? ocrResult.size_category : '';
      _state._slotData = [
        {
          sex:           (_m[0] && _m[0].sex)           || '',
          size_category: (_m[0] && _m[0].size_category) || _defSize || '',
        },
        {
          sex:           (_m[1] && _m[1].sex)           || '',
          size_category: (_m[1] && _m[1].size_category) || _defSize || '',
        },
      ];
    }
    if(!geminiKey) UI.toast('Gemini APIキーが未設定です。設定画面で入力してください。','error',5000);
    _state.step='confirm'; render();
  };



  // ── 保存処理 ──────────────────────────────────────────────────
  Pages._cScanSave = async function() {
    var recDate=(document.getElementById('cs-date')&&document.getElementById('cs-date').value||'').replace(/-/g,'/');
    var stage=document.getElementById('cs-stage')&&document.getElementById('cs-stage').value||'';
    var note=document.getElementById('cs-note')&&document.getElementById('cs-note').value||'';
    var isUnit=_state.targetType==='UNIT';

    if(!stage){UI.toast('ステージを選択してください','error');return;}
    var rows=_state.tableRows||[];
    var hasData=rows.some(function(r){return r.weight1||r.weight2||r.date;});
    if(!hasData){UI.toast('体重または日付を少なくとも1行入力してください','error');return;}

    // ── 楽観的更新: バリデーション後即座に遷移、バックグラウンドで保存 ──
    var _savedTargetType = _state.targetType;
    var _savedDisplayId  = _state.displayId;
    var _savedTargetId   = _state.targetId;
    var _savedDetectedSex= _state.detectedSex;
    var _savedDetectedSize = _state.detectedSize;       // [20260418i]
    var _savedSlotData   = _state._slotData.slice();    // [20260418i] スロット別データ
    var _savedMembers    = _state.members.slice();      // [20260418i] members更新のベース
    var _savedEntity     = _state.entity;               // [20260418i] unit_id 参照用

    // 即座に詳細画面へ遷移
    UI.toast('💾 保存中...（バックグラウンド）','info',2000);
    if(_savedTargetType==='UNIT') routeTo('unit-detail',{unitDisplayId:_savedDisplayId});
    else                           routeTo('ind-detail', {indId:_savedTargetId});

    // バックグラウンドで保存実行（最大2回リトライ付き）
    (async function() {
      // リトライ付きAPI呼び出しヘルパー
      async function _createWithRetry(payload, maxRetry) {
        for (var attempt = 0; attempt <= maxRetry; attempt++) {
          try {
            return await API.growth.create(payload);
          } catch(e) {
            if (attempt < maxRetry) {
              console.warn('[CS] save retry ' + (attempt+1) + '/' + maxRetry + ':', e.message);
              await new Promise(function(r){ setTimeout(r, 2000); }); // 2秒待ってリトライ
            } else {
              throw e; // 最終試行も失敗したら投げる
            }
          }
        }
      }

      try {
        var savedCount=0;

        function mkPayload(row, extra) {
          var rd=row.date?row.date.trim():recDate||new Date().toISOString().split('T')[0].replace(/-/g,'/');
          if(rd&&rd.match(/^\d{1,2}\/\d{1,2}$/)) rd=new Date().getFullYear()+'/'+rd;
          var p=Object.assign({
            target_type:_savedTargetType, target_id:_savedTargetId,
            stage:stage, mat_type:row.mat_type||'', container_size:row.container||'',
            exchange_type:row.exchange||'NONE', record_date:rd,
            event_type:'WEIGHT_ONLY', note_private:note, has_malt:false,
          }, extra);
          // [20260418i] 個体の場合は sex / size_category も成長記録に乗せる
          if(!isUnit){
            if (_savedDetectedSex && _savedDetectedSex !== '不明') p.sex = _savedDetectedSex;
            if (_savedDetectedSize) p.size_category = _savedDetectedSize;
          }
          return p;
        }

        if(isUnit){
          for(var i=0;i<rows.length;i++){
            var r=rows[i]; if(!r.weight1&&!r.weight2&&!r.date)continue;
            var mbs=_state.members;
            if(r.weight1!==''||mbs[0]){
              // [20260418i] スロット1の size_category を追加
              var extra1 = {unit_slot_no:1,weight_g:r.weight1?parseFloat(r.weight1):''};
              if (_savedSlotData[0] && _savedSlotData[0].size_category) extra1.size_category = _savedSlotData[0].size_category;
              await _createWithRetry(mkPayload(r,extra1),2);savedCount++;
            }
            if(r.weight2!==''||mbs[1]){
              // [20260418i] スロット2の size_category を追加
              var extra2 = {unit_slot_no:2,weight_g:r.weight2?parseFloat(r.weight2):''};
              if (_savedSlotData[1] && _savedSlotData[1].size_category) extra2.size_category = _savedSlotData[1].size_category;
              await _createWithRetry(mkPayload(r,extra2),2);savedCount++;
            }
          }
        } else {
          for(var k=0;k<rows.length;k++){
            var row=rows[k]; if(!row.weight1&&!row.date)continue;
            await _createWithRetry(mkPayload(row,{weight_g:row.weight1?parseFloat(row.weight1):''}),2);
            savedCount++;
          }
        }

        // ── [20260418i] ユニットの場合、members JSON に性別/区分を反映 ──
        // 既存メンバー情報を保持しつつ、変更があればユニット台帳を更新
        if (isUnit && _savedEntity && _savedEntity.unit_id) {
          var membersChanged = false;
          var baseMembers = Array.isArray(_savedMembers) ? _savedMembers : [];
          var newMembers;
          if (baseMembers.length > 0) {
            newMembers = baseMembers.map(function(m, idx){
              var slot = _savedSlotData[idx] || {};
              var updated = Object.assign({}, m);
              if (slot.sex && slot.sex !== m.sex) {
                updated.sex = slot.sex;
                membersChanged = true;
              }
              if (slot.size_category && slot.size_category !== m.size_category) {
                updated.size_category = slot.size_category;
                membersChanged = true;
              }
              return updated;
            });
          } else {
            // members が空の場合、入力があれば最小構造を生成
            var candidates = _savedSlotData
              .map(function(slot, idx){
                return {
                  unit_slot_no:  idx + 1,
                  sex:           (slot && slot.sex)           || '',
                  size_category: (slot && slot.size_category) || '',
                };
              })
              .filter(function(m){ return m.sex || m.size_category; });
            if (candidates.length > 0) {
              newMembers = candidates;
              membersChanged = true;
            }
          }

          if (membersChanged && newMembers) {
            try {
              await API.unit.update({
                unit_id: _savedEntity.unit_id,
                members: JSON.stringify(newMembers),
              });
              // Store キャッシュも楽観的更新
              if (Store.patchDBItem) {
                Store.patchDBItem('breeding_units', 'unit_id', _savedEntity.unit_id, { members: newMembers });
              }
            } catch (unitErr) {
              console.error('[CS] unit update error:', unitErr);
              UI.toast('⚠️ 性別・区分の反映に失敗: ' + (unitErr.message || '通信エラー') + '（記録は保存済み）', 'error', 5000);
            }
          }
        }

        UI.toast('✅ '+savedCount+'件の記録を保存しました','success',3000);
      } catch(err){
        console.error('[CS] bg save error (all retries failed):',err);
        UI.toast('⚠️ 保存失敗（リトライ2回）: '+(err.message||'通信エラー')+' — 手動で再入力してください','error',8000);
      }
    })();
  };

  Pages._cScanBackToCapture = function() {
    _state.step='capture'; _state.tableRows=null;
    _state.detectedSex=null;
    _state.detectedSize=null;  // [20260418i]
    _state._slotData=[{sex:'',size_category:''},{sex:'',size_category:''}];  // [20260418i]
    render();
  };

  render();
};


// ════════════════════════════════════════════════════════════════
// Pages.batchScan — 一括撮影モード
// ════════════════════════════════════════════════════════════════
// 動作フロー:
//   1. 撮影フェーズ: 1枚撮るたびにOCRをバックグラウンド開始（最大10枚）
//   2. 確認フェーズ: 1件ずつ確認・修正（上部に「N/M件目」表示）
//   3. 完了画面: 保存結果サマリ
//
// _bs_queue: [{
//   capturedImage, ocrPromise, ocrResult(後で埋まる),
//   resolved(QR解決済みか), targetType, targetId, displayId,
//   entity, members, tableRows, detectedSex,
//   error(null or string)
// }]
// ════════════════════════════════════════════════════════════════

Pages.batchScan = function(params) {
  params = params || {};
  var main = document.getElementById('main');
  var MAX_BATCH = 20;

  var MAT_OPTIONS  = ['T0','T1','T2','T3','MD'];
  var CONT_OPTIONS = ['1.8L','2.7L','4.8L','8L','10L'];

  // バッチキュー
  var _queue = [];
  // 現在確認中のインデックス
  var _curIdx = 0;
  // バッチフェーズ: 'shoot' | 'confirm' | 'done'
  var _phase = 'shoot';
  // 撮影フェーズ中のエラー表示
  var _shootError = null;

  // ── shared utils（continuous_scanと同じロジックをローカルに持つ） ─
  function _bsResolveEntity(type, id) {
    if(type==='UNIT') return (Store.getUnitByDisplayId&&Store.getUnitByDisplayId(id))||(Store.getDB('breeding_units')||[]).find(function(u){return u.unit_id===id||u.display_id===id;})||null;
    if(type==='IND')  return (Store.getIndividual&&Store.getIndividual(id))||(Store.getDB('individuals')||[]).find(function(i){return i.ind_id===id||i.display_id===id;})||null;
    return null;
  }
  function _bsParseMembers(entity) {
    if(!entity||!entity.members) return [];
    try{ var r=entity.members; return Array.isArray(r)?r:JSON.parse(r); }catch(_){return [];}
  }
  function _resolveFromQrText(qrText) {
    if(!qrText)return null;
    var parts=qrText.split(':'); if(parts.length<2)return null;
    var prefix=parts[0].toUpperCase(), id=parts.slice(1).join(':').trim();
    if(prefix==='BU'){
      var units=Store.getDB('breeding_units')||[];
      var unit=units.find(function(u){return u.display_id===id;})||units.find(function(u){return u.unit_id===id;})||{display_id:id,unit_id:id};
      // [20260418j] targetId は unit_id を優先（GAS上の主キー）
      var _targetId = unit.unit_id || unit.display_id || id;
      return {targetType:'UNIT',targetId:_targetId,displayId:unit.display_id||id,entity:unit};
    }
    if(prefix==='IND'){
      var ind=(Store.getIndividual&&Store.getIndividual(id))||(Store.getDB('individuals')||[]).find(function(i){return i.ind_id===id||i.display_id===id;});
      if(!ind)return null;
      return {targetType:'IND',targetId:ind.ind_id||id,displayId:ind.display_id||id,entity:ind};
    }
    return null;
  }
  function _bsBuildTableRows(ocrResult, isUnit) {
    var ocr=ocrResult||{}, ocrRows=ocr.records||[];
    var defMat=ocr.mat_type||'', rows=[];
    var maxRows=isUnit?4:8;
    for(var i=0;i<maxRows;i++){
      var ocrRow=ocrRows[i]||null;
      var row={date:'',weight1:'',weight2:'',exchange:'',mat_type:defMat,container:'',
               date_state:'empty',weight1_state:'empty',weight2_state:'empty',exchange_state:'empty',
               mat_state:'auto',container_state:'auto'};
      if(ocrRow){
        if(ocrRow.date)    {row.date=String(ocrRow.date);      row.date_state    =ocrRow._confidence==='low'?'low':'high';}
        if(ocrRow.weight)  {row.weight1=String(ocrRow.weight); row.weight1_state =ocrRow._confidence==='low'?'low':'high';}
        if(ocrRow.weight1) {row.weight1=String(ocrRow.weight1);row.weight1_state =ocrRow._confidence==='low'?'low':'high';}
        if(isUnit&&ocrRow.weight2){row.weight2=String(ocrRow.weight2);row.weight2_state=ocrRow._confidence==='low'?'low':'high';}
        if(ocrRow.exchange){row.exchange=ocrRow.exchange;row.exchange_state=ocrRow._confidence==='low'?'low':'high';}
      }
      rows.push(row);
    }
    return rows;
  }
  function _emptyRow(defMat, defCont) {
    return {date:'',weight1:'',weight2:'',exchange:'',mat_type:defMat||'',container:defCont||'',
            date_state:'empty',weight1_state:'empty',weight2_state:'empty',exchange_state:'empty',
            mat_state:'auto',container_state:'auto'};
  }

  // ── render ────────────────────────────────────────────────────
  function render() {
    if(_phase==='shoot')   return renderShoot();
    if(_phase==='confirm') return renderConfirmItem(_curIdx);
    if(_phase==='done')    return renderDone();
  }

  // ── Step1: 撮影フェーズ ────────────────────────────────────────
  function renderShoot() {
    var count = _queue.length;
    var canProceed = count > 0;
    var canShoot   = count < MAX_BATCH;

    // 撮影済みサムネイルリスト
    var thumbs = '';
    if(count > 0){
      thumbs = '<div style="display:flex;gap:6px;overflow-x:auto;padding:4px 0;margin-bottom:8px">'
        + _queue.map(function(item, i){
            var statusIcon = item.error ? '❌' : item.ocrResult ? '✅' : '⏳';
            var statusColor = item.error ? '#e05050' : item.ocrResult ? '#4caf78' : 'var(--amber)';
            var label = item.displayId || ('撮影'+(i+1));
            return '<div style="flex-shrink:0;text-align:center;cursor:pointer" onclick="Pages._bsRemoveItem('+i+')">'
              + '<div style="position:relative;width:56px;height:56px">'
              +   '<img src="'+item.capturedImage+'" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:2px solid '+statusColor+'">'
              +   '<div style="position:absolute;top:-4px;right:-4px;font-size:.75rem;background:var(--bg2);border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;">'+statusIcon+'</div>'
              + '</div>'
              + '<div style="font-size:.6rem;color:var(--text3);margin-top:2px;max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+label+'</div>'
            + '</div>';
          }).join('')
        + '</div>';
    }

    main.innerHTML =
      UI.header('📷 一括読取り', {back:true}) +
      '<div class="page-body">' +

      // 説明
      '<div class="card" style="padding:12px 14px">' +
        '<div style="font-size:.82rem;font-weight:700;color:var(--text2);margin-bottom:6px">📋 使い方</div>' +
        '<div style="font-size:.74rem;color:var(--text3);line-height:1.8">' +
          '① ラベルを1枚ずつ撮影（最大'+MAX_BATCH+'枚）<br>' +
          '② OCRはバックグラウンドで処理されます<br>' +
          '③「確認・保存へ」で1件ずつ確認・保存<br>' +
          '💡 サムネイルをタップで削除できます' +
        '</div>' +
      '</div>' +

      // 撮影済みサムネイル
      (count > 0 ?
        '<div class="card" style="padding:12px 14px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
            '<div style="font-size:.8rem;font-weight:700;color:var(--text2)">撮影済み <span style="color:var(--green)">'+count+'</span>/'+MAX_BATCH+'枚</div>' +
            '<div style="font-size:.7rem;color:var(--text3)">タップで削除</div>' +
          '</div>' +
          thumbs +
        '</div>' : '') +

      // エラー表示
      (_shootError ?
        '<div style="background:rgba(224,64,64,.08);border:1px solid rgba(224,64,64,.3);border-radius:8px;padding:12px 14px;font-size:.78rem;color:#e04040">'+
          '⚠️ '+_shootError+
        '</div>' : '') +

      // カメラプレビュー（ガイド枠）
      '<div id="bs-camera-preview" style="display:none">' +
        '<div style="position:relative;width:100%;background:#000;border-radius:8px;overflow:hidden">' +
          '<video id="bs-video" autoplay playsinline muted style="width:100%;display:block;max-height:280px;object-fit:cover"></video>' +
          '<canvas id="bs-canvas" style="display:none"></canvas>' +
          '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">' +
            '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.4)"></div>' +
            '<div style="position:relative;width:62%;padding-bottom:70%;z-index:1">' +
              '<div style="position:absolute;inset:0;border:3px solid #4caf78;border-radius:4px">' +
                '<div style="position:absolute;top:-3px;left:-3px;width:18px;height:18px;border-top:4px solid #4caf78;border-left:4px solid #4caf78;border-radius:2px 0 0 0"></div>' +
                '<div style="position:absolute;top:-3px;right:-3px;width:18px;height:18px;border-top:4px solid #4caf78;border-right:4px solid #4caf78;border-radius:0 2px 0 0"></div>' +
                '<div style="position:absolute;bottom:-3px;left:-3px;width:18px;height:18px;border-bottom:4px solid #4caf78;border-left:4px solid #4caf78;border-radius:0 0 0 2px"></div>' +
                '<div style="position:absolute;bottom:-3px;right:-3px;width:18px;height:18px;border-bottom:4px solid #4caf78;border-right:4px solid #4caf78;border-radius:0 0 2px 0"></div>' +
              '</div>' +
              '<div style="position:absolute;bottom:-26px;left:0;right:0;text-align:center;font-size:.72rem;color:#4caf78;font-weight:700;white-space:nowrap">ラベルを枠に合わせてください</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
          '<button class="btn btn-ghost" style="flex:1" onclick="Pages._bsStopCamera()">✕ キャンセル</button>' +
          '<button class="btn btn-primary" style="flex:2;font-size:1rem;padding:14px" onclick="Pages._bsTakePhoto()">📷 撮影する</button>' +
        '</div>' +
      '</div>' +

      // 撮影ボタンエリア
      '<div id="bs-btn-area" class="card" style="padding:16px;text-align:center">' +
        '<input type="file" id="bs-file-input" accept="image/*" capture="environment" style="display:none" onchange="Pages._bsOnImageSelected(this)">' +
        (canShoot ?
          '<button class="btn btn-primary btn-full" style="padding:16px;font-size:1rem;margin-bottom:10px" onclick="Pages._bsOpenCamera()">' +
            '<span style="font-size:1.4rem;margin-right:8px">📷</span>ラベルを撮影する' +
            (count > 0 ? ' <span style="font-size:.82rem;opacity:.8">（'+count+'枚目まで完了）</span>' : '') +
          '</button>' :
          '<div style="font-size:.82rem;color:var(--amber);padding:8px;margin-bottom:10px">⚠️ 最大'+MAX_BATCH+'枚に達しました</div>'
        ) +
        '<input type="file" id="bs-gallery-input" accept="image/*" multiple style="display:none" onchange="Pages._bsOnImageSelected(this)">' +
        '<button class="btn btn-ghost btn-full" style="font-size:.88rem" onclick="Pages._bsOpenGallery()">' +
          '🖼️ ギャラリーから選択' +
          (count < MAX_BATCH ? '<span style="font-size:.75rem;color:var(--text3);margin-left:6px">（残り'+(MAX_BATCH-count)+'枚まで追加可）</span>' : '<span style="font-size:.75rem;color:var(--amber);margin-left:6px">（上限に達しています）</span>') +
        '</button>' +
      '</div>' +

      '</div>' +

      // 固定フッター
      '<div class="quick-action-bar">' +
        '<button class="btn btn-ghost" style="flex:1;padding:14px 0" onclick="Store.back()">← 戻る</button>' +
        '<button class="btn btn-gold" style="flex:2;padding:14px 0;font-weight:700;font-size:.95rem"' +
          (canProceed ? '' : ' disabled') +
          ' onclick="Pages._bsStartConfirm()">確認・保存へ → （'+count+'件）</button>' +
      '</div>';
  }

  // ── Step2: 確認フェーズ（1件ずつ） ────────────────────────────
  function renderConfirmItem(idx) {
    var item = _queue[idx];
    if(!item){ _phase='done'; render(); return; }

    // OCR未完了の場合は待機
    if(!item.ocrResult && !item.error){
      main.innerHTML =
        UI.header('📋 確認中... ('+( idx+1)+'/'+_queue.length+'件目)', {}) +
        '<div class="page-body" style="text-align:center;padding-top:40px">' +
          '<div style="font-size:2rem;margin-bottom:16px">⏳</div>' +
          '<div style="font-size:.88rem;color:var(--text2)">OCR処理完了待ち...</div>' +
          '<div style="font-size:.74rem;color:var(--text3);margin-top:8px">しばらくお待ちください</div>' +
        '</div>';
      // 500ms後に再チェック
      setTimeout(function(){ if(_phase==='confirm'&&_curIdx===idx) renderConfirmItem(idx); }, 500);
      return;
    }

    // エラーアイテムはスキップ可能
    if(item.error){
      main.innerHTML =
        UI.header('❌ 読取りエラー ('+(idx+1)+'/'+_queue.length+'件目)', {back:true, backFn:'Pages._bsPrevItem()'}) +
        '<div class="page-body">' +
          _bsProgressBar(idx) +
          '<div style="background:rgba(224,64,64,.08);border:1px solid rgba(224,64,64,.3);border-radius:10px;padding:16px;margin-top:8px">' +
            '<div style="font-size:.9rem;font-weight:700;color:#e04040;margin-bottom:8px">⚠️ この枚数は処理できませんでした</div>' +
            '<div style="font-size:.78rem;color:var(--text3)">'+item.error+'</div>' +
            (item.capturedImage ?
              '<div style="margin-top:12px;background:#000;border-radius:6px;overflow:hidden"><img src="'+item.capturedImage+'" style="width:100%;max-height:200px;object-fit:contain;display:block"></div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="quick-action-bar">' +
          '<button class="btn btn-ghost" style="flex:1;padding:14px 0" onclick="Pages._bsPrevItem()">← 前へ</button>' +
          '<button class="btn btn-primary" style="flex:2;padding:14px 0;font-weight:700" onclick="Pages._bsNextItem()">スキップして次へ →</button>' +
        '</div>';
      return;
    }

    var ocr = item.ocrResult || {};
    var isUnit = item.targetType === 'UNIT';
    var members = item.members || [];
    var dispId  = item.displayId || '—';
    var entityStage = item.entity ? (item.entity.current_stage || item.entity.stage_phase || '') : '';
    var prevRecs = (Store.getGrowthRecords&&Store.getGrowthRecords(item.targetId))||[];
    var lastRec  = prevRecs.length
      ? prevRecs.slice().sort(function(a,b){return String(b.record_date).localeCompare(String(a.record_date));})[0]
      : null;

    if(!item.tableRows) item.tableRows = _bsBuildTableRows(ocr, isUnit);

    var today   = new Date().toISOString().split('T')[0];
    var recDate = (ocr.record_date||today).replace(/\//g,'-');
    var stage   = ocr.stage||entityStage||'';
    var mat     = ocr.mat_type||'';
    var curSex  = item.detectedSex || (item.entity&&item.entity.sex) || '';

    var matOpts = MAT_OPTIONS.map(function(m){return '<option value="'+m+'"'+(mat===m?' selected':'')+'>'+m+'</option>';}).join('');
    var stageOpts = [{v:'L1L2',l:'L1L2'},{v:'L3',l:'L3'},{v:'PREPUPA',l:'前蛹'},{v:'PUPA',l:'蛹'},{v:'ADULT_PRE',l:'成虫（未後食）'},{v:'ADULT',l:'成虫（活動中）'}]
      .map(function(s){return '<option value="'+s.v+'"'+(stage===s.v?' selected':'')+'>'+s.l+'</option>';}).join('');

    var isLast = idx === _queue.length - 1;

    main.innerHTML =
      UI.header('📋 確認・修正', {back:true, backFn:'Pages._bsPrevItem()'}) +
      '<div class="page-body">' +

      // ▼ プログレスバー（上部に何件目か表示）
      _bsProgressBar(idx) +

      // 対象情報
      '<div class="card" style="padding:12px 14px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between">' +
          '<div>' +
            '<div style="font-size:.9rem;font-weight:700;color:var(--gold)">'+dispId+'</div>' +
            '<div style="font-size:.72rem;color:var(--text3)">'+(isUnit?'ユニット':'個別飼育')+(entityStage?' / '+entityStage:'')+'</div>' +
            (lastRec?'<div style="font-size:.68rem;color:var(--text3);margin-top:2px">前回: '+lastRec.record_date+' / '+(lastRec.weight_g||'—')+'g</div>':'') +
          '</div>' +
        '</div>' +
      '</div>' +

      // OCR信頼度
      (ocr._confidence==='low'
        ? '<div style="background:rgba(224,144,64,.1);border:1px solid rgba(224,144,64,.3);border-radius:8px;padding:10px 12px;font-size:.76rem;color:var(--amber)">⚠️ 一部の値が読み取れなかった可能性があります。内容を確認してください。</div>'
        : '<div style="background:rgba(76,175,120,.08);border:1px solid rgba(76,175,120,.25);border-radius:8px;padding:10px 12px;font-size:.76rem;color:var(--green)">✅ OCR読み取り完了。セルをタップして修正できます。</div>'
      ) +

      // 撮影画像
      (item.capturedImage ?
        '<div class="card" style="padding:10px 12px"><div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:6px">📸 撮影画像</div><div style="background:#000;border-radius:6px;overflow:hidden"><img src="'+item.capturedImage+'" style="width:100%;max-height:200px;object-fit:contain;display:block"></div></div>' : '') +

      // 凡例
      '<div style="display:flex;gap:8px;font-size:.68rem;padding:0 2px;flex-wrap:wrap">' +
        '<span style="display:flex;align-items:center;gap:3px"><span style="width:10px;height:10px;background:rgba(76,175,120,.35);border-radius:2px;display:inline-block"></span>OCR読取済</span>' +
        '<span style="display:flex;align-items:center;gap:3px"><span style="width:10px;height:10px;background:rgba(224,200,64,.35);border-radius:2px;display:inline-block"></span>要確認</span>' +
      '</div>' +

      // テーブル
      _bsRenderTable(idx) +

      // 共通設定
      '<div class="card" style="padding:14px">' +
        '<div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:10px">🗓️ 共通設定</div>' +
        (!isUnit ?
          '<div style="margin-bottom:10px">' +
            '<label style="font-size:.72rem;color:var(--text3);font-weight:700">性別</label>' +
            '<div style="display:flex;gap:8px;margin-top:6px">' +
              '<button class="btn '+(curSex==='♂'?'btn-primary':'btn-ghost')+'" style="flex:1;padding:10px" data-bs-idx="'+idx+'" data-bs-sex="♂" onclick="Pages._bsSetSexBtn(this)">◯♂ 雄確定</button>' +
              '<button class="btn '+(curSex==='♀'?'btn-primary':'btn-ghost')+'" style="flex:1;padding:10px" data-bs-idx="'+idx+'" data-bs-sex="♀" onclick="Pages._bsSetSexBtn(this)">◯♀ 雌確定</button>' +
              '<button class="btn '+(!curSex?'btn-primary':'btn-ghost')+'" style="flex:1;padding:10px" data-bs-idx="'+idx+'" data-bs-sex="" onclick="Pages._bsSetSexBtn(this)">未確定</button>' +
            '</div>' +
          '</div>' : '') +
        '<div style="margin-bottom:10px">' +
          '<label style="font-size:.72rem;color:var(--text3);font-weight:700">記録日</label>' +
          '<input type="date" id="bs-date" class="input" value="'+recDate+'" style="margin-top:4px">' +
        '</div>' +
        '<div style="margin-bottom:10px">' +
          '<label style="font-size:.72rem;color:var(--text3);font-weight:700">📊 ステージ <span style="color:var(--red)">*</span></label>' +
          '<select id="bs-stage" class="input" style="margin-top:4px"><option value="">選択...</option>'+stageOpts+'</select>' +
        '</div>' +
        '<div>' +
          '<label style="font-size:.72rem;color:var(--text3);font-weight:700">メモ（任意）</label>' +
          '<input type="text" id="bs-note" class="input" value="'+(ocr.note||'')+'" placeholder="気になることがあれば..." style="margin-top:4px">' +
        '</div>' +
      '</div>' +

      '</div>' +
      '<div class="quick-action-bar">' +
        '<button class="btn btn-ghost" style="flex:1;padding:14px 0" onclick="Pages._bsPrevItem()">← 戻る</button>' +
        '<button class="btn btn-gold" style="flex:2;padding:14px 0;font-weight:700;font-size:.95rem" onclick="Pages._bsSaveItem('+idx+')">' +
          (isLast ? '💾 保存して完了' : '💾 保存して次へ →') +
        '</button>' +
      '</div>';
  }

  // ── プログレスバー ────────────────────────────────────────────
  function _bsProgressBar(idx) {
    var total = _queue.length;
    var cur   = idx + 1;
    var pct   = Math.round(cur / total * 100);
    var dots  = '';
    for(var i=0;i<total;i++){
      var item = _queue[i];
      var col = i < idx ? 'var(--green)' : i === idx ? 'var(--gold)' : 'var(--border)';
      var icon = item && item.error ? '✕' : (item && item.saved ? '✓' : String(i+1));
      dots += '<div style="width:28px;height:28px;border-radius:50%;background:'+col+';display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:#fff;flex-shrink:0">'+icon+'</div>';
    }
    return '<div style="background:var(--surface2);border-radius:10px;padding:10px 14px;margin-bottom:4px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
        '<div style="font-size:.82rem;font-weight:700;color:var(--text2)">' +
          '<span style="color:var(--gold);font-size:1rem;font-weight:800">'+cur+'</span>' +
          '<span style="color:var(--text3)">/'+total+'件目</span>' +
        '</div>' +
        '<div style="font-size:.72rem;color:var(--text3)">'+pct+'% 完了</div>' +
      '</div>' +
      '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">'+dots+'</div>' +
    '</div>';
  }

  // ── Step3: 完了画面 ────────────────────────────────────────────
  function renderDone() {
    var saved   = _queue.filter(function(q){ return q.saved; }).length;
    var errored = _queue.filter(function(q){ return q.error; }).length;
    var skipped = _queue.filter(function(q){ return !q.saved && !q.error; }).length;

    main.innerHTML =
      UI.header('✅ 一括読取り完了', {}) +
      '<div class="page-body" style="text-align:center;padding-top:24px">' +
        '<div style="font-size:3rem;margin-bottom:16px">✅</div>' +
        '<div style="font-size:1.1rem;font-weight:700;color:var(--green);margin-bottom:8px">'+saved+'件を保存しました</div>' +
        (errored > 0 ? '<div style="font-size:.82rem;color:#e04040;margin-bottom:4px">読取りエラー: '+errored+'件</div>' : '') +
        (skipped > 0 ? '<div style="font-size:.82rem;color:var(--amber);margin-bottom:4px">スキップ: '+skipped+'件</div>' : '') +
        '<div style="display:flex;gap:10px;margin-top:24px;justify-content:center">' +
          '<button class="btn btn-primary" style="padding:14px 24px;font-size:.95rem" onclick="Pages.batchScan()">続けて撮影</button>' +
          '<button class="btn btn-ghost" style="padding:14px 24px;font-size:.95rem" onclick="routeTo(\'dashboard\')">ホームへ</button>' +
        '</div>' +
      '</div>';
  }

  // ── テーブル描画（_renderRecordTableの簡易版） ─────────────────
  function _bsRenderTable(idx) {
    var item = _queue[idx];
    if(!item||!item.tableRows) return '';
    var rows = item.tableRows;
    var isUnit = item.targetType === 'UNIT';
    var members = item.members || [];
    var m0l = members&&members[0]?((members[0].sex||'?')+' ①'):'①';
    var m1l = members&&members[1]?((members[1].sex||'?')+' ②'):'②';

    function bg(s){
      if(s==='high') return 'background:rgba(76,175,120,.25);';
      if(s==='low')  return 'background:rgba(224,200,64,.25);';
      if(s==='auto') return 'background:rgba(100,180,255,.12);';
      if(s==='manual') return 'background:rgba(76,175,120,.18);';
      return 'background:rgba(255,255,255,.05);';
    }
    function exch(v){
      if(v==='FULL') return '<span style="color:#60d080;font-weight:700">■全</span><br><span style="color:var(--text3)">□追</span>';
      if(v==='ADD')  return '<span style="color:var(--text3)">□全</span><br><span style="color:#60d080;font-weight:700">■追</span>';
      return '<span style="color:var(--text3)">□全</span><br><span style="color:var(--text3)">□追</span>';
    }
    function td(bgS,content,oc,extra){
      return '<td style="border:1.5px solid var(--border);padding:5px 2px;font-size:.72rem;font-weight:700;text-align:center;cursor:pointer;min-width:0;'+(bgS)+(extra||'')+'" onclick="'+oc+'">'+content+'</td>';
    }
    function tdWt(bgS,val,oc){return td(bgS,val?val+'<span style="font-size:.55rem">g</span>':'<span style="color:var(--text3)">—</span>',oc);}
    function tdSm(bgS,val,oc){return td(bgS,val||'—',oc,'font-size:.65rem;');}
    var thS='border:1.5px solid var(--border);padding:4px 2px;font-size:.65rem;font-weight:700;color:var(--text2);text-align:center;background:var(--surface2)';
    var sep='<td style="width:2px;background:var(--border);padding:0"></td>';

    var html='<div class="card" style="padding:10px 12px">' +
      '<div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:6px">📝 記録テーブル <span style="font-size:.65rem;color:var(--text3);font-weight:400">（セルをタップして編集）</span></div>' +
      '<div style="overflow-x:auto">';

    if(isUnit){
      html+='<table style="width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr>' +
        '<th style="'+thS+';width:18%">日付</th><th style="'+thS+';width:13%">'+m0l+'</th><th style="'+thS+';width:13%">'+m1l+'</th><th style="'+thS+';width:18%">交換</th><th style="'+thS+';width:14%">マット</th><th style="'+thS+';width:14%">容器</th>' +
        '</tr></thead><tbody>';
      for(var i=0;i<4;i++){
        var r=rows[i]||{date:'',weight1:'',weight2:'',exchange:'',mat_type:'',container:'',date_state:'empty',weight1_state:'empty',weight2_state:'empty',exchange_state:'empty',mat_state:'auto',container_state:'auto'};
        html+='<tr>'+
          td(bg(r.date_state),r.date||'—','Pages._bsEditCell('+idx+','+i+',\'date\')')+
          tdWt(bg(r.weight1_state),r.weight1,'Pages._bsEditCell('+idx+','+i+',\'weight1\')')+
          tdWt(bg(r.weight2_state),r.weight2,'Pages._bsEditCell('+idx+','+i+',\'weight2\')')+
          td(bg(r.exchange_state),exch(r.exchange),'Pages._bsEditCell('+idx+','+i+',\'exchange\')')+
          tdSm(bg(r.mat_state),r.mat_type||'—','Pages._bsEditCell('+idx+','+i+',\'mat\')')+
          tdSm(bg(r.container_state),r.container||'—','Pages._bsEditCell('+idx+','+i+',\'container\')')+
          '</tr>';
      }
    } else {
      html+='<table style="min-width:520px;width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr>'+
        '<th style="'+thS+';width:11%">日付</th><th style="'+thS+';width:9%">体重</th><th style="'+thS+';width:12%">交換</th><th style="'+thS+';width:8%">M</th><th style="'+thS+';width:8%">容器</th>'+sep+
        '<th style="'+thS+';width:11%">日付</th><th style="'+thS+';width:9%">体重</th><th style="'+thS+';width:12%">交換</th><th style="'+thS+';width:8%">M</th><th style="'+thS+';width:8%">容器</th>'+
        '</tr></thead><tbody>';
      for(var j=0;j<4;j++){
        var lr=rows[j]||_emptyRow('',''), rr=rows[j+4]||_emptyRow('',''), ri=j+4;
        html+='<tr>'+
          td(bg(lr.date_state),lr.date||'—','Pages._bsEditCell('+idx+','+j+',\'date\')')+
          tdWt(bg(lr.weight1_state),lr.weight1,'Pages._bsEditCell('+idx+','+j+',\'weight1\')')+
          td(bg(lr.exchange_state),exch(lr.exchange),'Pages._bsEditCell('+idx+','+j+',\'exchange\')')+
          tdSm(bg(lr.mat_state),lr.mat_type||'—','Pages._bsEditCell('+idx+','+j+',\'mat\')')+
          tdSm(bg(lr.container_state),lr.container||'—','Pages._bsEditCell('+idx+','+j+',\'container\')')+
          sep+
          td(bg(rr.date_state),rr.date||'—','Pages._bsEditCell('+idx+','+ri+',\'date\')')+
          tdWt(bg(rr.weight1_state),rr.weight1,'Pages._bsEditCell('+idx+','+ri+',\'weight1\')')+
          td(bg(rr.exchange_state),exch(rr.exchange),'Pages._bsEditCell('+idx+','+ri+',\'exchange\')')+
          tdSm(bg(rr.mat_state),rr.mat_type||'—','Pages._bsEditCell('+idx+','+ri+',\'mat\')')+
          tdSm(bg(rr.container_state),rr.container||'—','Pages._bsEditCell('+idx+','+ri+',\'container\')')+
          '</tr>';
      }
    }
    html+='</tbody></table></div></div>';
    return html;
  }

  // ── テーブルのセル更新（テーブル部分のみ再描画） ────────────────
  function _bsRefreshTable(idx) {
    var cards = main.querySelectorAll('.card');
    for(var i=0;i<cards.length;i++){
      if(cards[i].innerHTML.indexOf('記録テーブル')!==-1){
        var tmp=document.createElement('div'); tmp.innerHTML=_bsRenderTable(idx);
        cards[i].parentNode.replaceChild(tmp.firstChild,cards[i]); return;
      }
    }
  }

  // ── セル編集 ─────────────────────────────────────────────────
  Pages._bsEditCell = function(itemIdx, rowIdx, col) {
    var item = _queue[itemIdx];
    if(!item||!item.tableRows) return;
    while(item.tableRows.length<=rowIdx) item.tableRows.push(_emptyRow('',''));
    var row = item.tableRows[rowIdx];
    var isUnit = item.targetType === 'UNIT';

    if(col==='exchange'){
      var cur=row.exchange||'';
      UI.modal(
        '<div class="modal-title" style="font-size:.9rem;font-weight:700;padding-bottom:8px">'+(rowIdx+1)+'行目 — 交換種別</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;padding:8px 0">' +
          '<button class="btn '+(cur==='FULL'?'btn-primary':'btn-ghost')+'" style="padding:16px;font-size:1rem" data-bi="'+itemIdx+'" data-ri="'+rowIdx+'" data-col="exchange" data-val="FULL" onclick="Pages._bsCellSaveBtn(this)">■全 — 全交換</button>' +
          '<button class="btn '+(cur==='ADD'?'btn-primary':'btn-ghost')+'" style="padding:16px;font-size:1rem" data-bi="'+itemIdx+'" data-ri="'+rowIdx+'" data-col="exchange" data-val="ADD" onclick="Pages._bsCellSaveBtn(this)">■追 — 追加マット</button>' +
          '<button class="btn '+((!cur||cur==='NONE')?'btn-primary':'btn-ghost')+'" style="padding:16px;font-size:1rem" data-bi="'+itemIdx+'" data-ri="'+rowIdx+'" data-col="exchange" data-val="NONE" onclick="Pages._bsCellSaveBtn(this)">□ — なし</button>' +
        '</div><div class="modal-footer"><button class="btn btn-ghost btn-full" onclick="UI.closeModal()">キャンセル</button></div>'
      ); return;
    }
    if(col==='mat'){
      var curM=row.mat_type||'';
      var btns=MAT_OPTIONS.map(function(m){return '<button class="btn '+(curM===m?'btn-primary':'btn-ghost')+'" style="flex:1;padding:12px 4px;font-size:.9rem" data-bi="'+itemIdx+'" data-ri="'+rowIdx+'" data-col="mat" data-val="'+m+'" onclick="Pages._bsCellSaveBtn(this)">'+m+'</button>';}).join('');
      UI.modal('<div class="modal-title" style="font-size:.9rem;font-weight:700;padding-bottom:8px">'+(rowIdx+1)+'行目 — マット</div><div style="font-size:.74rem;color:var(--text3);margin-bottom:8px">この行から以降に適用</div><div style="display:flex;gap:6px;padding:4px 0;flex-wrap:wrap">'+btns+'</div><div class="modal-footer"><button class="btn btn-ghost btn-full" onclick="UI.closeModal()">キャンセル</button></div>'); return;
    }
    if(col==='container'){
      var curC=row.container||'';
      var cbtns=CONT_OPTIONS.map(function(c){return '<button class="btn '+(curC===c?'btn-primary':'btn-ghost')+'" style="flex:1;padding:12px 4px;font-size:.9rem" data-bi="'+itemIdx+'" data-ri="'+rowIdx+'" data-col="container" data-val="'+c+'" onclick="Pages._bsCellSaveBtn(this)">'+c+'</button>';}).join('');
      UI.modal('<div class="modal-title" style="font-size:.9rem;font-weight:700;padding-bottom:8px">'+(rowIdx+1)+'行目 — 容器</div><div style="font-size:.74rem;color:var(--text3);margin-bottom:8px">この行から以降に適用</div><div style="display:flex;gap:6px;padding:4px 0;flex-wrap:wrap">'+cbtns+'</div><div class="modal-footer"><button class="btn btn-ghost btn-full" onclick="UI.closeModal()">キャンセル</button></div>'); return;
    }

    var lbl = col==='date'?'日付': col==='weight1'?(isUnit?'①体重(g)':'体重(g)'):'②体重(g)';
    var tp  = col==='date'?'date':'number';
    var cur2= row[col]||'';
    if(col==='date'&&cur2){ var m=cur2.match(/^(\d{1,2})\/(\d{1,2})$/); if(m) cur2=new Date().getFullYear()+'-'+String(m[1]).padStart(2,'0')+'-'+String(m[2]).padStart(2,'0'); }
    UI.modal(
      '<div class="modal-title" style="font-size:.9rem;font-weight:700;padding-bottom:8px">'+(rowIdx+1)+'行目 — '+lbl+'を編集</div>' +
      '<div style="padding:8px 0"><input id="bs-cell-input" type="'+tp+'" class="input" value="'+cur2+'" inputmode="'+(col==='date'?'text':'decimal')+'" step="'+(col==='date'?'':'0.1')+'" style="font-size:1.1rem;text-align:center">'+(col!=='date'?'<div style="font-size:.7rem;color:var(--text3);margin-top:6px;text-align:center">g（グラム）</div>':'')+'</div>' +
      '<div class="modal-footer"><button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button><button class="btn btn-primary" style="flex:2" data-bi="'+itemIdx+'" data-ri="'+rowIdx+'" data-col="'+col+'" onclick="Pages._bsCellSaveBtnText(this)">確定</button></div>'
    );
    setTimeout(function(){ var inp=document.getElementById('bs-cell-input'); if(inp)inp.focus(); },100);
  };

  // data属性経由のセル保存（onclick内クォートネスト回避）
  Pages._bsCellSaveBtn = function(btn) {
    var itemIdx = parseInt(btn.getAttribute('data-bi'), 10);
    var rowIdx  = parseInt(btn.getAttribute('data-ri'), 10);
    var col     = btn.getAttribute('data-col') || '';
    var val     = btn.getAttribute('data-val') || '';
    Pages._bsCellSave(itemIdx, rowIdx, col, val);
  };
  Pages._bsCellSaveBtnText = function(btn) {
    var itemIdx = parseInt(btn.getAttribute('data-bi'), 10);
    var rowIdx  = parseInt(btn.getAttribute('data-ri'), 10);
    var col     = btn.getAttribute('data-col') || '';
    var inp     = document.getElementById('bs-cell-input');
    var val     = inp ? inp.value.trim() : '';
    Pages._bsCellSave(itemIdx, rowIdx, col, val);
  };

  Pages._bsCellSave = function(itemIdx, rowIdx, col, forceVal) {
    var item = _queue[itemIdx];
    if(!item||!item.tableRows) return;
    while(item.tableRows.length<=rowIdx) item.tableRows.push(_emptyRow('',''));
    var rows = item.tableRows, row = rows[rowIdx];
    var val = forceVal!==undefined ? forceVal : (function(){ var inp=document.getElementById('bs-cell-input'); return inp?inp.value.trim():''; })();

    if(col==='date'){
      if(val&&val.match(/^\d{4}-\d{2}-\d{2}$/)) val=val.slice(5).replace('-','/');
      row.date=val; row.date_state=val?'high':'empty';
    } else if(col==='weight1'){row.weight1=val;row.weight1_state=val?'high':'empty';}
    else if(col==='weight2'){row.weight2=val;row.weight2_state=val?'high':'empty';}
    else if(col==='exchange'){row.exchange=val;row.exchange_state=val&&val!=='NONE'?'high':'empty';}
    else if(col==='mat'){for(var i=rowIdx;i<rows.length;i++){rows[i].mat_type=val;rows[i].mat_state='manual';}}
    else if(col==='container'){for(var j=rowIdx;j<rows.length;j++){rows[j].container=val;rows[j].container_state='manual';}}

    UI.closeModal&&UI.closeModal();
    _bsRefreshTable(itemIdx);
  };

  // ── 性別ボタン ────────────────────────────────────────────────
  Pages._bsSetSex = function(idx, sex) {
    var item = _queue[idx];
    if(!item) return;
    item.detectedSex = sex || null;
    var btns = main.querySelectorAll('[onclick^="Pages._bsSetSex"]');
    btns.forEach(function(b){
      var m = b.getAttribute('onclick').match(/','([^']*)'\)/);
      var v = m ? m[1] : '';
      b.className = 'btn ' + ((v===sex||(v===''&&!sex))?'btn-primary':'btn-ghost');
      b.style.flex='1'; b.style.padding='10px';
    });
  };

  // data属性ラッパー（onclick内のシングルクォートネスト回避）
  Pages._bsSetSexBtn = function(btn) {
    var idx = parseInt(btn.getAttribute('data-bs-idx'), 10);
    var sex = btn.getAttribute('data-bs-sex') || '';
    Pages._bsSetSex(idx, sex);
  };

  // ── ナビゲーション ─────────────────────────────────────────────
  Pages._bsPrevItem = function() {
    if(_phase==='shoot') return;
    if(_curIdx === 0){ _phase='shoot'; render(); return; }
    _curIdx--; renderConfirmItem(_curIdx);
  };
  Pages._bsNextItem = function() {
    _curIdx++;
    if(_curIdx >= _queue.length){ _phase='done'; render(); }
    else renderConfirmItem(_curIdx);
  };
  Pages._bsStartConfirm = function() {
    if(_queue.length===0) return;
    _phase='confirm'; _curIdx=0; renderConfirmItem(0);
  };
  Pages._bsRemoveItem = function(idx) {
    _queue.splice(idx, 1);
    _shootError = null;
    render();
  };

  // ── 保存 ─────────────────────────────────────────────────────
  Pages._bsSaveItem = function(idx) {
    var item = _queue[idx];
    if(!item) return;
    var stage   = document.getElementById('bs-stage')?.value || '';
    var recDate = (document.getElementById('bs-date')?.value||'').replace(/-/g,'/');
    var note    = document.getElementById('bs-note')?.value  || '';
    var isUnit  = item.targetType === 'UNIT';

    if(!stage){ UI.toast('ステージを選択してください','error'); return; }
    var rows = item.tableRows || [];
    var hasData = rows.some(function(r){ return r.weight1||r.weight2||r.date; });
    if(!hasData){ UI.toast('体重または日付を少なくとも1行入力してください','error'); return; }

    // 楽観的更新: 即次へ
    item.saved = true;
    UI.toast('💾 保存中（バックグラウンド）...','info',1500);
    Pages._bsNextItem();

    // バックグラウンド保存（リトライ2回）
    (async function() {
      async function _retry(payload, max) {
        for(var i=0;i<=max;i++){
          try{ return await API.growth.create(payload); }
          catch(e){
            if(i<max) await new Promise(function(r){setTimeout(r,2000);}); else throw e;
          }
        }
      }
      try {
        var savedCount = 0;
        function mkPayload(row, extra) {
          var rd = row.date?row.date.trim():recDate||new Date().toISOString().split('T')[0].replace(/-/g,'/');
          if(rd&&rd.match(/^\d{1,2}\/\d{1,2}$/)) rd=new Date().getFullYear()+'/'+rd;
          var p = Object.assign({
            target_type:item.targetType, target_id:item.targetId,
            stage:stage, mat_type:row.mat_type||'', container_size:row.container||'',
            exchange_type:row.exchange||'NONE', record_date:rd,
            event_type:'WEIGHT_ONLY', note_private:note, has_malt:false,
          }, extra);
          if(!isUnit && item.detectedSex) p.sex = item.detectedSex;
          return p;
        }
        if(isUnit){
          var mbs = item.members||[];
          for(var i=0;i<rows.length;i++){
            var r=rows[i]; if(!r.weight1&&!r.weight2&&!r.date)continue;
            if(r.weight1!==''||mbs[0]){await _retry(mkPayload(r,{unit_slot_no:1,weight_g:r.weight1?parseFloat(r.weight1):''}),2);savedCount++;}
            if(r.weight2!==''||mbs[1]){await _retry(mkPayload(r,{unit_slot_no:2,weight_g:r.weight2?parseFloat(r.weight2):''}),2);savedCount++;}
          }
        } else {
          for(var k=0;k<rows.length;k++){
            var row=rows[k]; if(!row.weight1&&!row.date)continue;
            await _retry(mkPayload(row,{weight_g:row.weight1?parseFloat(row.weight1):''}),2);
            savedCount++;
          }
        }
        UI.toast('✅ '+item.displayId+' 保存完了','success',2000);
      } catch(e) {
        item.saved = false;
        console.error('[BS] save error:', e);
        UI.toast('⚠️ '+item.displayId+' 保存失敗（リトライ2回）: '+(e.message||'通信エラー'),'error',7000);
      }
    })();
  };

  // ── カメラ制御 ────────────────────────────────────────────────
  Pages._bsOpenCamera = async function() {
    var pa=document.getElementById('bs-camera-preview'), ba=document.getElementById('bs-btn-area');
    if(!pa||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      var inp=document.getElementById('bs-file-input'); if(inp){inp.setAttribute('capture','environment');inp.click();} return;
    }
    try {
      var stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920,min:640},height:{ideal:1080,min:480}}});
      var video=document.getElementById('bs-video');
      if(!video){stream.getTracks().forEach(function(t){t.stop();});return;}
      video.srcObject=stream; pa.style.display='block'; if(ba)ba.style.display='none'; video.play();
    } catch(e){ var inp=document.getElementById('bs-file-input'); if(inp){inp.setAttribute('capture','environment');inp.click();} }
  };
  Pages._bsStopCamera = function() {
    var video=document.getElementById('bs-video');
    if(video&&video.srcObject){video.srcObject.getTracks().forEach(function(t){t.stop();});video.srcObject=null;}
    var pa=document.getElementById('bs-camera-preview'), ba=document.getElementById('bs-btn-area');
    if(pa)pa.style.display='none'; if(ba)ba.style.display='block';
  };
  Pages._bsTakePhoto = function() {
    if(_queue.length >= MAX_BATCH){
      UI.toast('上限'+MAX_BATCH+'枚に達しています。撮影できません。','error',3000);
      Pages._bsStopCamera(); return;
    }
    var video=document.getElementById('bs-video'), canvas=document.getElementById('bs-canvas');
    if(!video||!canvas)return;
    canvas.width=video.videoWidth||1280; canvas.height=video.videoHeight||720;
    var ctx=canvas.getContext('2d'); ctx.drawImage(video,0,0);
    var fw=canvas.width, fh=canvas.height;
    var cw=Math.round(fw*0.72), ch=Math.round(cw*(70/62));
    if(ch>fh*0.95){ch=Math.round(fh*0.95);cw=Math.round(ch*(62/70));}
    var cx=Math.round((fw-cw)/2), cy=Math.round((fh-ch)/2);
    var cc=document.createElement('canvas'); cc.width=cw; cc.height=ch;
    cc.getContext('2d').drawImage(canvas,cx,cy,cw,ch,0,0,cw,ch);
    Pages._bsStopCamera();
    Pages._bsAddImage(cc.toDataURL('image/jpeg',0.92));
  };
  Pages._bsOpenGallery = function() {
    var inp=document.getElementById('bs-gallery-input'); if(inp){inp.removeAttribute('capture');inp.click();}
  };
  Pages._bsOnImageSelected = function(input) {
    var files=input&&input.files;
    if(!files||files.length===0)return;
    // 複数選択対応: 残り枚数まで順次追加
    var toAdd = Math.min(files.length, MAX_BATCH - _queue.length);
    for(var fi=0; fi<toAdd; fi++){
      (function(file){
        var reader=new FileReader();
        reader.onload=function(e){ Pages._bsAddImage(e.target.result); };
        reader.readAsDataURL(file);
      })(files[fi]);
    }
    if(files.length > toAdd){
      UI.toast((files.length - toAdd)+'枚は上限のため追加されませんでした','info',3000);
    }
  };

  // ── 画像をキューに追加してOCRをバックグラウンド開始 ────────────
  Pages._bsAddImage = function(base64) {
    if(_queue.length >= MAX_BATCH){
      UI.toast('最大'+MAX_BATCH+'枚まです','error'); return;
    }
    _shootError = null;
    var geminiKey=(typeof CONFIG!=='undefined'&&CONFIG.GEMINI_KEY)||Store.getSetting('gemini_key')||'';

    // アイテムをキューに追加（OCR完了前）
    var item = {
      capturedImage: base64,
      ocrResult:     null,
      ocrPromise:    null,
      targetType:    null, targetId: null, displayId: null,
      entity:        null, members:  [],
      tableRows:     null, detectedSex: null,
      saved:         false, error: null,
    };
    _queue.push(item);
    render(); // サムネイル更新

    // バックグラウンドでQR+OCR処理
    (async function() {
      try {
        var _smallBase64 = await _resizeImageForOCR(base64, 640);
        var results = await Promise.all([
          _extractQrFromImage(base64),
          geminiKey ? _callGeminiOCR(geminiKey, _smallBase64) : Promise.resolve({_confidence:'low'}),
        ]);
        var qrText = results[0], ocrResult = results[1];
        if(!qrText&&ocrResult&&ocrResult.qr_text) qrText=ocrResult.qr_text;
        var qrResolved = _resolveFromQrText(qrText);
        if(!qrResolved){
          item.error = qrText ? 'QRコードの対象が特定できませんでした（'+qrText+'）' : 'QRコードが検出できませんでした';
        } else {
          item.targetType = qrResolved.targetType;
          item.targetId   = qrResolved.targetId;
          item.displayId  = qrResolved.displayId;
          item.entity     = qrResolved.entity || _bsResolveEntity(qrResolved.targetType, qrResolved.targetId);
          item.members    = _bsParseMembers(item.entity);
          item.ocrResult  = ocrResult;
          if(ocrResult&&ocrResult.sex) item.detectedSex = ocrResult.sex;
        }
      } catch(e) {
        item.error = 'OCR処理エラー: ' + (e.message||'不明なエラー');
      }
      // 撮影フェーズ中なら再描画してサムネイルを更新
      if(_phase==='shoot') render();
      // 確認フェーズでこのアイテムを表示中なら再描画
      else if(_phase==='confirm' && _curIdx === _queue.indexOf(item)) renderConfirmItem(_curIdx);
    })();
  };

  render();
};

window.PAGES = window.PAGES || {};
window.PAGES['continuous-scan'] = function() {
  Pages.continuousScan(Store.getParams());
};
window.PAGES['batch-scan'] = function() { Pages.batchScan(Store.getParams()); };
