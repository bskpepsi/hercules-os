// FILE: js/pages/continuous_scan.js  build: 20260424a
// 変更点(20260422j→20260424a):
//   [20260424a-1] 🔥 UPDATE 時の `stage` 保護 (過去ステージL3上書き問題の修正)
//     症状: 個体詳細の成長記録テーブルで、新しく 4/23 を L3 で保存すると
//           過去の 4/20 / 4/21 レコードのステージも L3 に書き換わる。
//     原因: 画面上部の単一 stage セレクタ (cs-stage) の値を mkPayload が全行の
//           payload に乗せ、_saveOne の UPDATE パスでそのまま GAS に送信していた。
//           GAS updateGrowthRecord は `data[k] !== undefined` の全フィールドを
//           無条件で上書きするため、既存レコードの stage (L1L2) が L3 に
//           置き換わっていた。
//     修正: _saveOne の UPDATE 分岐で payload から `stage` フィールドを剥がして
//           API.growth.update に渡す。新規 CREATE では従来通り stage を送信。
//           これで「継続読取りの stage セレクタは新規行のみに適用」という
//           期待仕様に一致し、過去行の stage はシート側の値が保持される。
//
//   [20260424a-2] 🔥 個体パスにも楽観 Store 更新を追加 (保存直後の flash 修正)
//     症状: continuous-scan 保存直後、個体詳細ヘッダの体重が一瞬古い値になり
//           数秒後に正しい値に差し替わる。
//     原因: ユニット側には既に optimistic Store.patchDBItem があったが、
//           個体側には存在せず、routeTo 直後の initial render が Store 古値で
//           描画されていた。加えて Pages.individualDetail の
//           await API.individual.get が保存前のサーバスナップショットを返し、
//           Store.patchDBItem で楽観値を古値に再上書きしてしまうケースがある。
//     修正: (a) 個体の場合も routeTo 前に Store.patchDBItem で
//               latest_weight_g / current_stage / current_mat / current_container
//               を楽観更新。最新日付の行を「確定値」として使用。
//           (b) window._skipNextIndividualRefresh = ind_id を立てて、
//               individual.js 側で初回 API.individual.get を1回スキップ。
//           (c) 保存失敗時は _rollbackIndPatch で Store を元に戻す。
//
// 変更点(20260422i→20260422j): ★★★ 個体の重複・反映不具合の根本修正 ★★★
//   [20260422j-1] 🔥 _existingByDate を両キーから構築 (ind_id/unit_id + display_id)
//     症状: 個体保存時に既存 04/20 record が見つからず UPDATE→CREATE に
//           フォールバックして重複レコードが生まれる。
//     原因: _existingByDate は Store.getGrowthRecords(_savedTargetId) だけ
//           クエリしていたが、実際の Store には ind_id/unit_id と display_id の
//           両方に記録が分散しうる (過去データの移行経緯)。
//     修正: _savedTargetId と _savedDisplayId の両方でクエリし、
//           record_id で重複排除してマージした list から日付マップを構築。
//
//   [20260422j-2] 🔥 _saveOne CREATE を _tmp_ パターンに変更 (growth.js と統一)
//     症状: 保存後にリロードしないと新規行が見えない (個体側)。
//     原因: 旧設計では API レスポンスを待ってから Store に追加していた。
//           その間に Pages.individualDetail の API.individual.get が先に返って
//           Store を古いデータで上書きしてしまうレース条件。
//           個体側の merge 保護ロジックは _tmp_ プレフィックスのレコードしか
//           保護しないので、real record_id で直接追加された場合は無防備だった。
//     修正: Store.addGrowthRecord で先に _tmp_XXX レコードを push → API 応答後に
//           record_id を real に swap する growth.js と同じ設計に統一。
//           これで個体側 merge (20260422h individual.js) の _tmp_ 保護が効き、
//           レースに強くなる。API 失敗時は _tmp_ をロールバック除去。
//
//   [20260422j-3] console.log のビルド番号を統一 (旧: v20260422b のまま化石化)
// ───────────────────────────────────────────────
// 変更点(20260422f→20260422i):
//   [20260422i] UI統一: 個体側の性別ボタン表記をユニット側と統一
//     旧: 「◯♂ 雄」「◯♀ 雌」「不明」
//     新: 「♂」「♀」「不明」 (ユニット側と同じシンプル表記)
//     対象: L461-463 (読取り確認画面の個体側共通設定)
//           L1527-1528 (バッチスキャンの性別確定ボタン)
// ───────────────────────────────────────────────
// 変更点(20260422e→20260422f): ★★★ 根本原因の修正 ★★★
//   症状: 毎回「保存したのに画面が古いまま」「リロードすると直る」を繰り返していた。
//   原因分析により、これまでの修正は症状(race/rerenderタイミング/楽観UI)
//   を直していたが、Store に書き込むデータ自体が壊れていた。
//   リロードすると GAS から正しく再取得されて表示が直る症状は
//   これで完全に説明がつく。
//
//   [20260422f-1] 🔥 CREATE 時の Store キーが誤り + レスポンスに payload 欠損
//     旧: Store.addDBItem('growth_records', _cres)
//       ① 'growth_records' は _db.growth_records に追加されるが、
//          ユニット詳細画面は _db.growthMap[targetId] を読むため
//          新規レコードは画面に反映されず、リロードまで見えなかった。
//       ② GAS createGrowthRecord の戻り値は {record_id, age_days} のみ。
//          payload (target_id, record_date, weight_g, container, mat_type, ...)
//          を含まないため、仮にキーを直しても空レコードが追加されるだけ。
//     新: fullRec = Object.assign({}, payload, _cres) でマージし、
//         Store.addGrowthRecord(_savedTargetId, fullRec) で
//         _db.growthMap[_savedTargetId] に正しく追加。
//
//   [20260422f-2] 🔥 record_date のゼロパディング欠如
//     旧: mkPayload 内で '4/21' → '2026/4/21' のまま (月日非パディング)。
//         この値が Store に書き戻されると Image 2 Row 2 のように
//         '4/21' と '04/21' の混在表示が発生。
//         また Store.addGrowthRecord 内の sort(localeCompare) も
//         文字列比較で不安定になる。
//     新: mkPayload 末尾で _normalizeDateStr を呼び出し '2026/04/21' に統一。
//         _existingByDate 構築時の key も _normalizeDateStr で正規化し、
//         古いキャッシュに非パディングデータが残っていてもマッチする。
//
//   [20260422f-3] _normalizeDateStr / _findExistingRecordId を
//     mkPayload から参照できる位置に巻き上げ (関数宣言順の修正)。
//
// ───────────────────────────────────────────────
// 変更点(20260422c→20260422e): ★ レース条件修正 ★
//   [20260422e] 🐛 重大バグ修正: 保存直後にレコードが消える/混ざる問題
//     症状: 継続読取りで保存ボタンを押した直後、ユニット詳細画面に
//           「古い日付の壊れた行」「片方のスロットが欠けた行」等が表示され、
//           リロードすると正常に表示される。
//     原因: routeTo('unit-detail') → Pages.unitDetail() →
//           _udLoadGrowthAsync が API.growth.list を並列発行し、
//           そのレスポンスが「バックグラウンド保存の create/update の Store 更新」
//           と競合 (race condition)。
//           ─ create: Store.addDBItem で新規レコード追加
//           ─ API.growth.list: 古いサーバースナップショット (まだ create 反映前)
//             が後から Store.setGrowthRecords で丸ごと上書き → 新規レコード消失
//           Image 2 console の『growth loaded: 9 records』(本来10) が証拠。
//     修正: routeTo の直前に window._skipNextGrowthLoad = true を立てて、
//           初期レンダリングの _udLoadGrowthAsync を最初から走らせない。
//           post-save rerender で再度フラグを立てて Store のみで描画するので、
//           データ整合性は保たれる。次に unit-detail に入る時 (別ルート) は
//           通常通り API.growth.list が走る。
// ───────────────────────────────────────────────
// 変更点(20260422b→20260422c): ★ サクサク化 + リロード不要化の2大改善 ★
//   [20260422c-1] 🐛 重大バグ修正: 保存後の unit-detail 自動再描画が効かない問題
//     原因: Line 1191 の _curPage 判定
//       var _curPage = (window.location.hash||'').replace(/^#/,'').split('?')[0];
//     は hash 文字列全体 ('page=unit-detail&unitDisplayId=...') を返していた。
//     これを 'unit-detail' と比較しても絶対 false になり、
//     Pages.unitDetail() の再呼び出しが一度も実行されていなかった。
//     これが「リロードしないと画面が更新されない」症状の根本原因。
//     修正: Store.getPage() でページ名を正しく取得。
//   [20260422c-2] 楽観UI更新: 遷移直後から新しい画面表示
//     保存ボタン押下 → routeTo 前に Store.patchDBItem で以下を先行反映:
//       - breeding_units.mat_type (記録テーブルの 4 段階優先ロジックで決定)
//       - breeding_units.stage_phase (T0/T1→T1, T2→T2, T3/MD→T3)
//       - breeding_units.container_size (記録テーブルから)
//     これで遷移直後から T2 バッジ / T2 マット / 4.8L / T3移行ボタン が見える。
//     GAS 保存失敗時はロールバック + エラートースト表示 + 再描画。
//     成長記録テーブルは CREATE (仮 record_id が必要) のため先行反映しない。
//   [20260422c-3] 並列化による保存時間短縮:
//     従来: 直列 3〜4回のAPI呼び出し (各 2-5秒、合計 6-13秒)
//       await _saveOne(slot1) → await _saveOne(slot2)
//       → await API.unit.update(members) → await API.unit.update(mat)
//     改訂:
//       - 成長記録 2スロット + ユニット更新を Promise.all で並列実行
//       - ユニット更新は members + mat_type + stage_phase + container_size を
//         1 回の API.unit.update にまとめる (API 呼び出し数を削減)
//       - 合計: max(各 API) ≒ 2-5秒 (半分以下に短縮)
// ───────────────────────────────────────────────
// 変更点(20260422a→20260422b):
//   - [20260422b] ユニット mat_type 決定を 4 段階優先に改訂:
//       ① 日付入り行で mat_state='manual' (ユーザーがタップ選択)
//       ② 日付入り行の mat_type (最下位行、auto 状態も含む)
//       ③ テーブル任意行で entity.mat_type と異なる mat_type
//       ④ OCR の M チェック値
//     OCR Mチェック誤認識 (T1→T1) でもユーザー意図を拾える。
//   - [20260422b] _buildTableRows の OCR mat_type 反映を条件付き復活:
//       ocr.mat_type が entity.mat_type と異なるときだけ最新行に自動セット。
//       同じならスキップ (T1→T1 の誤認識典型パターン回避)。
//   - [20260422a までの履歴]:
//       - 診断ログ追加 / OCR 自動反映廃止 / 最下位日付行 mat_type 優先など
//   - [20260421n] 保存後のユニット詳細再描画を高速化 (_skipNextGrowthLoad)
//   - [20260421n] 保存後のユニット詳細再描画を高速化 (_skipNextGrowthLoad)
//       各行の date 列と重複しており混乱の元だったため、
//       入力欄を廃止し、行に date がなければ today を使うよう _cScanSave を修正
//   - [20260421h] 空行の保存スキップ修正
//       従来: ユニット保存時 "weight1 !== '' || mbs[0]" と書かれており、
//       行が空でもメンバーがいれば保存されてしまう重大バグ
//       → 4行中1行だけデータがあっても 8件の空レコードが作成されていた
//       修正: 行ごとに weight1/weight2/date の少なくとも1つが入っているときだけ保存
//   - [20260421h] 保存即 Store.addDBItem で growth_records を反映
//       + 保存完了後に現在のページが unit-detail/ind-detail なら Pages を直接再呼出
//       これで保存後すぐに新しい記録が画面に反映される
//   - [20260421g] ユニットの継続読取りで mat_type 変更をユニット本体に反映
//       従来: 成長記録には mat_type が記録されるが unit.mat_type は更新されず、
//       基本情報が古いマット種別のまま、アクションボタンも古い stage_phase のまま。
//       修正: 保存完了時、テーブル最終行の mat_type を見て unit.mat_type と
//       stage_phase (T0/T1→T1, T2→T2, T3/MD→T3) を連動更新。
//       併せて container_size も最終行があれば更新。
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
console.log('[HerculesOS] continuous_scan.js v20260422j loaded');

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

  function _buildTableRows(ocrResult, isUnit, entity) {
    var ocr=ocrResult||{}, ocrRows=ocr.records||[];
    // [20260421m] 仕様確定:
    //   - 容器 (container): ユニット本体の container_size を初期値として全行に設定
    //     → ユーザーが変更しなければ既存値を継承する前回踏襲モード。
    //   - マット (mat_type): 行ごとに独立管理。OCR で各行の mat_type が読み取れない仕様なので
    //     全行空のままで初期化する。ラベルの M チェック (ocr.mat_type) は「最新のマット」を
    //     意味するが、既存行のマット表示を書き換えてはならない (過去の交換履歴が壊れる)。
    //     代わりに _cScanSave の最終処理で「日付の新しい記録のみ」または
    //     「ラベルの M チェック」をユニット本体に反映する。
    //   - 既存行の修正: save 時に既存 growth_records と日付マッチして update/create を判定
    var entityCont = (entity && entity.container_size) ? String(entity.container_size).trim() : '';
    var defCont = entityCont || '';
    var maxRows=isUnit?4:8, rows=[];
    for (var i=0;i<maxRows;i++){
      var ocrRow=ocrRows[i]||null, row=_emptyRow('', defCont);
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
    // [20260422b] OCR の M チェック値 (ocr.mat_type) の最新行自動反映を条件付きで復活:
    //   ラベルの M チェックは誤認識しやすい (Gemini OCR が連続■の最右を正しく選ばない) が、
    //   ユーザーが最新行の mat_type を明示タップするオペレーションは省略されやすい。
    //   妥協案: OCR の mat_type が 現在のユニット (entity) と異なる値 = 「マット交換があった」 と
    //   解釈し、その場合のみ最新データ行の mat_type にセット。
    //   entity と同じ値なら (誤認識の典型ケース) 反映しない = ユーザーの手動変更を尊重。
    var _entityCurrentMat = (entity && entity.mat_type) ? String(entity.mat_type).trim() : '';
    if (ocr.mat_type && String(ocr.mat_type).trim() !== _entityCurrentMat) {
      var lastDataRowIdx = -1;
      for (var lj = rows.length - 1; lj >= 0; lj--) {
        if (rows[lj] && (rows[lj].date || rows[lj].weight1 || rows[lj].weight2)) {
          lastDataRowIdx = lj; break;
        }
      }
      if (lastDataRowIdx >= 0 && !rows[lastDataRowIdx].mat_type) {
        rows[lastDataRowIdx].mat_type = ocr.mat_type;
        rows[lastDataRowIdx].mat_state = ocr._confidence === 'low' ? 'low' : 'high';
      }
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

    if(!_state.tableRows) _state.tableRows=_buildTableRows(ocr,isUnit,_state.entity);

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
                '<button class="btn '+(curSex==='♂'?'btn-primary':'btn-ghost')+'" style="flex:1;padding:10px" onclick="Pages._cScanSetSex(\'♂\')">♂</button>' +
                '<button class="btn '+(curSex==='♀'?'btn-primary':'btn-ghost')+'" style="flex:1;padding:10px" onclick="Pages._cScanSetSex(\'♀\')">♀</button>' +
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
    // [20260422b] マット/容器の「この行から下全部変更」動作を「この行のみ変更」に変更。
    //   従来は rowIdx 以降全行に伝播していたため、
    //   例: 04/21 行を T1 (確認) → 04/22 行を T2 (新規)
    //   と設定したい場合に意図せず他行も書き換わり、ユニット本体の mat_type 判定が誤る
    //   原因になっていた。単行変更に統一。空行は保存対象外のため伝播は不要。
    else if(col==='mat'){row.mat_type=val; row.mat_state='manual';}
    else if(col==='container'){row.container=val; row.container_state='manual';}

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
    // [20260421h] 「記録日（デフォルト）」入力欄を削除し、各行の date を使用
    //   行に date がない場合は今日の日付をフォールバック
    var stage=document.getElementById('cs-stage')&&document.getElementById('cs-stage').value||'';
    var note=document.getElementById('cs-note')&&document.getElementById('cs-note').value||'';
    var isUnit=_state.targetType==='UNIT';

    if(!stage){UI.toast('ステージを選択してください','error');return;}
    var rows=_state.tableRows||[];
    var hasData=rows.some(function(r){return r.weight1||r.weight2||r.date;});
    if(!hasData){UI.toast('体重または日付を少なくとも1行入力してください','error');return;}

    // ── 保存データのスナップショット（遷移後も参照できるよう退避） ──
    var _savedTargetType = _state.targetType;
    var _savedDisplayId  = _state.displayId;
    var _savedTargetId   = _state.targetId;
    var _savedDetectedSex= _state.detectedSex;
    var _savedDetectedSize = _state.detectedSize;       // [20260418i]
    var _savedSlotData   = _state._slotData.slice();    // [20260418i] スロット別データ
    var _savedMembers    = _state.members.slice();      // [20260418i] members更新のベース
    var _savedEntity     = _state.entity;               // [20260418i] unit_id 参照用

    // ══════════════════════════════════════════════════════════════
    // [20260422c-2] 楽観UI更新: 遷移前に Store に先行反映
    //   押した瞬間に Store を更新しておけば、routeTo 直後のユニット詳細画面は
    //   新しい T2/4.8L/T3移行ボタン で表示される。
    //   API 失敗時はロールバック。成長記録は仮 record_id が必要なので対象外。
    // ══════════════════════════════════════════════════════════════
    var _optimisticUnitPatch = null;   // 先行反映した差分
    var _rollbackUnitPatch   = null;   // 失敗時の復元値
    if (isUnit && _savedEntity && _savedEntity.unit_id) {
      try {
        var _preOcrMat = (_state.ocrResult && _state.ocrResult.mat_type) ? String(_state.ocrResult.mat_type).trim() : '';
        var _preCurMat = String(_savedEntity.mat_type || '').trim();
        var preManualMat='', preLastDataRowMat='', preAnyDifferentMat='';
        for (var pi = rows.length - 1; pi >= 0; pi--) {
          var prr = rows[pi]; if (!prr) continue;
          if (prr.date && prr.mat_type && prr.mat_state === 'manual' && !preManualMat) preManualMat = prr.mat_type;
          if (prr.date && prr.mat_type && !preLastDataRowMat) preLastDataRowMat = prr.mat_type;
          if (prr.mat_type && prr.mat_type !== _preCurMat && !preAnyDifferentMat) preAnyDifferentMat = prr.mat_type;
        }
        var _preNewMat = preManualMat || preLastDataRowMat || preAnyDifferentMat || _preOcrMat;
        var _preLastContRow = null;
        for (var pci = rows.length - 1; pci >= 0; pci--) {
          if (rows[pci] && rows[pci].date && rows[pci].container) { _preLastContRow = rows[pci]; break; }
        }
        var _preNewCont = _preLastContRow ? _preLastContRow.container : '';

        var _optPatch = {}, _rbPatch = {};
        if (_preNewMat && _preNewMat !== _preCurMat) {
          var _phaseMapPre = { T0:'T1', T1:'T1', T2:'T2', T3:'T3', MD:'T3' };
          _optPatch.mat_type    = _preNewMat;
          _optPatch.stage_phase = _phaseMapPre[_preNewMat] || _savedEntity.stage_phase || '';
          _rbPatch.mat_type    = _savedEntity.mat_type || '';
          _rbPatch.stage_phase = _savedEntity.stage_phase || '';
        }
        if (_preNewCont && _preNewCont !== String(_savedEntity.container_size || '').trim()) {
          _optPatch.container_size = _preNewCont;
          _rbPatch.container_size = _savedEntity.container_size || '';
        }
        if (Object.keys(_optPatch).length > 0 && Store.patchDBItem) {
          Store.patchDBItem('breeding_units', 'unit_id', _savedEntity.unit_id, _optPatch);
          _optimisticUnitPatch = _optPatch;
          _rollbackUnitPatch   = _rbPatch;
          console.log('[CS] optimistic UI patch applied (before route):', _optPatch);
        }
      } catch (_optErr) {
        console.warn('[CS] optimistic UI patch failed (non-fatal):', _optErr.message);
      }
    }

    // [20260424a-2] 個体の楽観 Store 更新 (ユニット側と対称)
    //   routeTo('ind-detail') 直後の initial render を "最新" データで描画するため、
    //   継続読取りで決定した latest_weight_g / current_stage / current_mat /
    //   current_container を Store に先行反映する。これで保存直後の flash
    //   (古い体重が一瞬表示される) を解消。
    //   同時に window._skipNextIndividualRefresh を立てて individual.js 側で
    //   初回 API.individual.get を1回だけスキップさせる (保存完了前のサーバ
    //   スナップショットで楽観値が上書きされるレースを防ぐ)。
    //   API 失敗時はこの _rollbackIndPatch を Store にあてて元の値に戻す。
    var _optimisticIndPatch = null;
    var _rollbackIndPatch   = null;
    if (!isUnit && _savedTargetId) {
      try {
        // 参照用の現在値 (ind) を取得。無ければ空オブジェクトで代用し rollback は no-op化。
        var _curInd = (Store.getIndividual ? Store.getIndividual(_savedTargetId) : null) || {};

        // 日付が入った行のうち最新日付の行を「確定値」として採用
        //   rows[i].date は YYYY-MM-DD 等の素の文字列なので localeCompare で比較可能
        //   (フォーマット差があっても _normalizeDateStr が後段で行うため、比較だけなら粗くてOK)
        var _latestRow = null;
        var _latestDate = '';
        for (var ri = 0; ri < rows.length; ri++) {
          var rr = rows[ri];
          if (!rr || !rr.date) continue;
          var rd = String(rr.date).replace(/-/g,'/').trim();
          if (!_latestRow || rd.localeCompare(_latestDate) > 0) {
            _latestRow = rr;
            _latestDate = rd;
          }
        }

        var _indOptPatch = {}, _indRbPatch = {};

        // 体重: 最新行の weight1 (個体は slot1 のみ使用)
        if (_latestRow && _latestRow.weight1 !== '' && _latestRow.weight1 !== null && _latestRow.weight1 !== undefined) {
          var _newW = parseFloat(_latestRow.weight1);
          if (!isNaN(_newW) && _newW > 0) {
            var _curW = parseFloat(_curInd.latest_weight_g);
            // 既存値と違う場合のみパッチ対象に
            if (isNaN(_curW) || _curW !== _newW) {
              _indOptPatch.latest_weight_g = _newW;
              _indRbPatch.latest_weight_g = (_curInd.latest_weight_g !== undefined) ? _curInd.latest_weight_g : '';
            }
            // max_weight_g も上回っていれば更新 (GAS と同じロジックを先行適用)
            var _curMax = parseFloat(_curInd.max_weight_g) || 0;
            if (_newW > _curMax) {
              _indOptPatch.max_weight_g = _newW;
              _indRbPatch.max_weight_g = (_curInd.max_weight_g !== undefined) ? _curInd.max_weight_g : '';
            }
          }
        }

        // ステージ: 画面上部のセレクタ値 (stage) を適用
        if (stage && stage !== _curInd.current_stage) {
          _indOptPatch.current_stage = stage;
          _indRbPatch.current_stage = _curInd.current_stage || '';
        }

        // マット: 最新行の mat_type (入力があれば)
        if (_latestRow && _latestRow.mat_type && _latestRow.mat_type !== _curInd.current_mat) {
          _indOptPatch.current_mat = _latestRow.mat_type;
          _indRbPatch.current_mat = _curInd.current_mat || '';
        }

        // 容器: 最新行の container (入力があれば)
        if (_latestRow && _latestRow.container && _latestRow.container !== _curInd.current_container) {
          _indOptPatch.current_container = _latestRow.container;
          _indRbPatch.current_container = _curInd.current_container || '';
        }

        if (Object.keys(_indOptPatch).length > 0 && Store.patchDBItem) {
          Store.patchDBItem('individuals', 'ind_id', _savedTargetId, _indOptPatch);
          _optimisticIndPatch = _indOptPatch;
          _rollbackIndPatch   = _indRbPatch;
          console.log('[CS] optimistic IND patch applied (before route):', _indOptPatch);
        }

        // individual.js 側で初回 API.individual.get をスキップさせるフラグ
        // 値として ind_id を保持し、遷移先が同じ個体の場合のみマッチするよう individual.js 側で確認
        window._skipNextIndividualRefresh = _savedTargetId;
      } catch (_indOptErr) {
        console.warn('[CS] optimistic IND patch failed (non-fatal):', _indOptErr.message);
      }
    }

    // 即座に詳細画面へ遷移（すでに Store は新しい値なので T2/4.8L で表示される）
    UI.toast('💾 保存中...','info',1500);
    // [20260422e] レース条件防止: routeTo の前に skip フラグを立てる
    //   Pages.unitDetail → _udLoadGrowthAsync が API.growth.list を並列発行し、
    //   そのレスポンスがバックグラウンド保存の Store.addDBItem と競合すると、
    //   古いサーバースナップショットで Store が上書きされ新規レコードが消える。
    //   フラグは _udLoadGrowthAsync 内で消費 (false 化) される仕組み。
    window._skipNextGrowthLoad = true;
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

        // [20260422f-3] _normalizeDateStr を mkPayload / _existingByDate 構築前に定義
        //   YYYY/MM/DD 形式に統一 (月日ゼロパディング)。
        //   旧コードでは mkPayload → _normalizeDateStr の順で定義されており、
        //   mkPayload から参照できなかったため record_date が非パディングのまま
        //   Store / サーバーに書き込まれていた。
        function _normalizeDateStr(rd) {
          if (!rd) return '';
          var s = String(rd).trim().replace(/-/g,'/');
          // MM/DD → YYYY/MM/DD
          if (s.match(/^\d{1,2}\/\d{1,2}$/)) s = new Date().getFullYear() + '/' + s;
          // YYYY/M/D → YYYY/MM/DD (ゼロパディング)
          var m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
          if (m) s = m[1] + '/' + String(parseInt(m[2],10)).padStart(2,'0') + '/' + String(parseInt(m[3],10)).padStart(2,'0');
          return s;
        }

        function mkPayload(row, extra) {
          // [20260421h] 行に date がなければ today を使う（デフォルト欄は削除済み）
          // [20260422f-2] record_date は _normalizeDateStr で 'YYYY/MM/DD' に統一
          var rd = row.date ? row.date.trim() : new Date().toISOString().split('T')[0].replace(/-/g,'/');
          rd = _normalizeDateStr(rd);
          // [20260422a] GAS 側の growth_records は 'container' フィールドを使用。
          //   以前は container_size で送っていたが GAS で認識されず、結果として
          //   成長記録の容器欄が空で保存されていた。両方のフィールドで送信して互換性を確保。
          var p=Object.assign({
            target_type:_savedTargetType, target_id:_savedTargetId,
            stage:stage, mat_type:row.mat_type||'',
            container:row.container||'',           // ← GAS が実際に参照
            container_size:row.container||'',      // ← 念のため両方送る
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

        // [20260421m] 仕様確定:
        //   - 日付が入った行のみ保存対象 (体重なしでもOK → 追加交換ケース)
        //   - 既存 growth_records と同じ日付なら update (既存行の修正)
        //   - 日付がマッチしなければ create (新規行追加)
        //   日付比較用に既存 records を日付→record_id マップ化
        // [20260422f-2] key も _normalizeDateStr で正規化
        //   古いキャッシュに '2026/4/21' のような非パディングが残っていても
        //   '2026/04/21' と同一視されるようにする。
        // [20260422j-1] 🔥 両キーからクエリしてマージ
        //   Store には _savedTargetId (ind_id/unit_id) と _savedDisplayId の
        //   両方に record が分散していることがある (過去データ移行経緯)。
        //   片方のキーだけ見ると既存レコードを取りこぼして UPDATE→CREATE に
        //   フォールバックして重複レコードが生まれていた (個体の 04/20 ダブり問題)。
        var _existingByDate = {};
        try {
          var _idsToCheck = [_savedTargetId];
          if (_savedDisplayId && _savedDisplayId !== _savedTargetId) {
            _idsToCheck.push(_savedDisplayId);
          }
          var _mergedExisting = [];
          var _seenIds = {};
          _idsToCheck.forEach(function (_key) {
            var _list = (Store.getGrowthRecords && Store.getGrowthRecords(_key)) || [];
            _list.forEach(function (r) {
              if (!r) return;
              var _rid = r.record_id || '';
              // _tmp_ はそもそも UPDATE 対象にしない（まだサーバー未確定）
              if (_rid && String(_rid).indexOf('_tmp_') === 0) return;
              if (_rid && _seenIds[_rid]) return;
              if (_rid) _seenIds[_rid] = true;
              _mergedExisting.push(r);
            });
          });
          _mergedExisting.forEach(function (r) {
            if (!r.record_date) return;
            var _dkey = _normalizeDateStr(String(r.record_date));
            if (!_existingByDate[_dkey]) _existingByDate[_dkey] = [];
            _existingByDate[_dkey].push(r);
          });
          console.log('[CS] _existingByDate built from', _idsToCheck.length, 'key(s),',
                      _mergedExisting.length, 'record(s),',
                      Object.keys(_existingByDate).length, 'date(s)');
        } catch (_ebdErr) { console.warn('[CS] existing-by-date build error:', _ebdErr.message); }

        // 既存記録を slot_no で検索するヘルパー
        function _findExistingRecordId(dateStr, slotNo) {
          var dkey = _normalizeDateStr(dateStr);
          var list = _existingByDate[dkey] || [];
          // ユニットの場合は unit_slot_no で絞り込み
          if (isUnit && slotNo) {
            var found = list.find(function(r){ return String(r.unit_slot_no||'') === String(slotNo); });
            if (found) return found.record_id || null;
          }
          // 個体の場合 or ユニットで slot 絞り込み失敗時は最初のヒット
          return list.length > 0 ? (list[0].record_id || null) : null;
        }

        // update / create を実行し、Store を更新する共通ヘルパー
        async function _saveOne(payload, existingRecordId) {
          if (existingRecordId) {
            // 既存行の修正 → API.growth.update (直接呼び出し、apiCall を介さず)
            // [20260424a-1] 🔥 UPDATE 時は payload から `stage` を剥がす
            //   画面上部の単一 stage セレクタは「新規行に適用する値」であって
            //   既存行のステージを遡及上書きする意図ではない。GAS updateGrowthRecord は
            //   undefined でないフィールドを全て書き換えるため、stage を送ってしまうと
            //   過去レコードの stage が意図せず今の値に置き換わる。
            //   stage を消しておけば GAS 側は stage 列に触れず、既存値が保持される。
            //   (過去レコードのステージを直す正規経路は Pages._grEditRecord)
            var _updatePayload = Object.assign({}, payload);
            delete _updatePayload.stage;
            await API.growth.update(Object.assign({ record_id: existingRecordId }, _updatePayload));
            // Store の該当 record を上書き (stage を除いた payload をマージ)
            var gm = Store.getDB('growthMap') || {};
            Object.entries(gm).forEach(function(entry){
              var tid = entry[0], recs = entry[1] || [];
              var idx = recs.findIndex(function(r){ return r.record_id === existingRecordId; });
              if (idx >= 0) {
                Object.assign(recs[idx], _updatePayload, { record_id: existingRecordId });
                Store.setGrowthRecords(tid, recs);
              }
            });
            return { _updated: true, record_id: existingRecordId };
          } else {
            // ═══════════════════════════════════════════════════════════
            // [20260422j-2] 🔥 CREATE を _tmp_ 楽観パターンに変更
            //   旧: API 応答を待ってから Store.addGrowthRecord で real ID を追加
            //       → 遷移直後の Pages.individualDetail/unitDetail の
            //         API.individual.get / growth.list と race、Store 上書きで消失
            //   新: 先に _tmp_XXX を Store.addGrowthRecord で push
            //       → routeTo 直後の画面描画から新レコードが即座に見える
            //       → individual.js の merge 保護ロジックが _tmp_ を保持する
            //       → API 成功で _tmp_ を real record_id に swap
            //       → API 失敗で _tmp_ をロールバック除去
            //   race 時のフォールバック: _tmp_ が消えていたら real record を重複確認して push
            // ═══════════════════════════════════════════════════════════
            var _tmpId = '_tmp_cs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            var _tmpRec = Object.assign({}, payload, { record_id: _tmpId, age_days: null });
            if (Store.addGrowthRecord && _savedTargetId) {
              try { Store.addGrowthRecord(_savedTargetId, _tmpRec); }
              catch (_agrErr) { console.warn('[CS] addGrowthRecord (tmp) failed:', _agrErr.message); }
            }

            var _cres;
            try {
              _cres = await _createWithRetry(payload, 2);
            } catch (e) {
              // ロールバック: _tmp_ を Store から除去
              try {
                var _recsR = Store.getGrowthRecords(_savedTargetId) || [];
                var _filteredR = _recsR.filter(function (r) { return r.record_id !== _tmpId; });
                Store.setGrowthRecords(_savedTargetId, _filteredR);
              } catch (_) {}
              throw e;
            }

            if (_cres && _cres.record_id) {
              // _tmp_ を real record_id に swap
              var _recs = Store.getGrowthRecords(_savedTargetId) || [];
              var _idx = _recs.findIndex(function (r) { return r.record_id === _tmpId; });
              if (_idx >= 0) {
                _recs[_idx] = Object.assign({}, _recs[_idx], {
                  record_id: _cres.record_id,
                  age_days:  _cres.age_days
                });
                Store.setGrowthRecords(_savedTargetId, _recs);
              } else {
                // _tmp_ がレースで消えていた → real record を重複確認して push
                var _already = _recs.some(function (r) { return r.record_id === _cres.record_id; });
                if (!_already) {
                  var _fullRec = Object.assign({}, payload, _cres);
                  _recs.push(_fullRec);
                  Store.setGrowthRecords(_savedTargetId, _recs);
                  console.log('[CS] tmp lost by race, pushed fresh record:', _cres.record_id);
                }
              }
            }
            return _cres;
          }
        }

        // ══════════════════════════════════════════════════════════════
        // [20260422c-3] 並列化: Promise.all で全APIを同時送信
        //   成長記録 (2スロット分) + ユニット更新 (1回にまとめる) を並列。
        //   直列だと 各 GAS コールド 2-5秒 × 3回 = 6-15秒 かかっていた。
        //   並列にすれば max(各) ≒ 2-5秒。
        // ══════════════════════════════════════════════════════════════
        var savePromises = [];

        // ── 成長記録 ──
        if(isUnit){
          for(var i=0;i<rows.length;i++){
            var r=rows[i];
            // [20260421m] 日付が入った行のみ保存対象 (体重なしでも可 = 追加交換)
            if(!r.date) continue;
            // スロット1
            (function(rr){
              var extra1 = {unit_slot_no:1};
              if (rr.weight1 !== '' && rr.weight1 !== null && rr.weight1 !== undefined) {
                extra1.weight_g = parseFloat(rr.weight1);
              }
              if (_savedSlotData[0] && _savedSlotData[0].size_category) extra1.size_category = _savedSlotData[0].size_category;
              var _existing1 = _findExistingRecordId(rr.date, 1);
              savePromises.push(_saveOne(mkPayload(rr, extra1), _existing1));
              savedCount++;
            })(r);
            // スロット2
            (function(rr){
              var extra2 = {unit_slot_no:2};
              if (rr.weight2 !== '' && rr.weight2 !== null && rr.weight2 !== undefined) {
                extra2.weight_g = parseFloat(rr.weight2);
              }
              if (_savedSlotData[1] && _savedSlotData[1].size_category) extra2.size_category = _savedSlotData[1].size_category;
              var _existing2 = _findExistingRecordId(rr.date, 2);
              savePromises.push(_saveOne(mkPayload(rr, extra2), _existing2));
              savedCount++;
            })(r);
          }
        } else {
          for(var k=0;k<rows.length;k++){
            var row=rows[k];
            // [20260421m] 日付が入った行のみ保存対象
            if(!row.date) continue;
            (function(rr){
              var extraI = {};
              if (rr.weight1 !== '' && rr.weight1 !== null && rr.weight1 !== undefined) {
                extraI.weight_g = parseFloat(rr.weight1);
              }
              var _existingI = _findExistingRecordId(rr.date, null);
              savePromises.push(_saveOne(mkPayload(rr, extraI), _existingI));
              savedCount++;
            })(row);
          }
        }

        // ── ユニット更新 (members + mat_type + stage_phase + container_size を1回にまとめる) ──
        //   [20260422c-3] 旧コード: 2 回の API.unit.update (members / mat を別々) → 直列
        //   新コード: 1 回の API.unit.update にまとめる + 並列実行
        var _storeUnitPatch = {};        // Store 側の patch（members は parsed 形）
        var _apiUnitPatch   = {};        // API 側の payload（members は JSON 文字列）
        if (isUnit && _savedEntity && _savedEntity.unit_id) {
          // ── members (性別・区分) ──
          try {
            var membersChanged = false;
            var baseMembers = Array.isArray(_savedMembers) ? _savedMembers : [];
            var newMembers = null;
            if (baseMembers.length > 0) {
              newMembers = baseMembers.map(function(m, idx){
                var slot = _savedSlotData[idx] || {};
                var updated = Object.assign({}, m);
                if (slot.sex && slot.sex !== m.sex) { updated.sex = slot.sex; membersChanged = true; }
                if (slot.size_category && slot.size_category !== m.size_category) {
                  updated.size_category = slot.size_category; membersChanged = true;
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
              if (candidates.length > 0) { newMembers = candidates; membersChanged = true; }
            }
            if (membersChanged && newMembers) {
              _apiUnitPatch.members   = JSON.stringify(newMembers);
              _storeUnitPatch.members = newMembers;
            }
          } catch (_mErr) { console.warn('[CS] members calc failed:', _mErr.message); }

          // ── mat_type / stage_phase / container_size (楽観更新と同じ4段階優先) ──
          try {
            var _ocrMat = (_state.ocrResult && _state.ocrResult.mat_type) ? String(_state.ocrResult.mat_type).trim() : '';
            var _curMat = String(_savedEntity.mat_type || '').trim();
            var manualMat = '', lastDataRowMat = '', anyDifferentMat = '';
            for (var mi = rows.length - 1; mi >= 0; mi--) {
              var rr2 = rows[mi]; if (!rr2) continue;
              if (rr2.date && rr2.mat_type && rr2.mat_state === 'manual' && !manualMat) manualMat = rr2.mat_type;
              if (rr2.date && rr2.mat_type && !lastDataRowMat) lastDataRowMat = rr2.mat_type;
              if (rr2.mat_type && rr2.mat_type !== _curMat && !anyDifferentMat) anyDifferentMat = rr2.mat_type;
            }
            var newMat = manualMat || lastDataRowMat || anyDifferentMat || _ocrMat;
            var _lastContRow = null;
            for (var ci = rows.length - 1; ci >= 0; ci--) {
              if (rows[ci] && rows[ci].date && rows[ci].container) { _lastContRow = rows[ci]; break; }
            }
            var newCont = _lastContRow ? _lastContRow.container : '';
            console.log('[CS] unit patch calc:',
              { manualMat: manualMat, lastDataRowMat: lastDataRowMat, anyDifferentMat: anyDifferentMat,
                ocrMat: _ocrMat, newMat: newMat,
                curMat: _curMat, newCont: newCont, curCont: _savedEntity.container_size });

            if (newMat && newMat !== _curMat) {
              var _phaseMap = { T0:'T1', T1:'T1', T2:'T2', T3:'T3', MD:'T3' };
              var _phase = _phaseMap[newMat] || _savedEntity.stage_phase || '';
              _apiUnitPatch.mat_type    = newMat;
              _apiUnitPatch.stage_phase = _phase;
              _storeUnitPatch.mat_type    = newMat;
              _storeUnitPatch.stage_phase = _phase;
            }
            if (newCont && newCont !== String(_savedEntity.container_size || '').trim()) {
              _apiUnitPatch.container_size   = newCont;
              _storeUnitPatch.container_size = newCont;
            }
          } catch (_mtErr) { console.warn('[CS] mat/cont calc failed:', _mtErr.message); }

          // API 呼び出しは Promise.all に乗せる
          if (Object.keys(_apiUnitPatch).length > 0) {
            console.log('[CS] unit patch decided (batched):', _apiUnitPatch, 'keys=', Object.keys(_apiUnitPatch).length);
            var _unitPayload = Object.assign({ unit_id: _savedEntity.unit_id }, _apiUnitPatch);
            savePromises.push(
              API.unit.update(_unitPayload).then(function(res){
                // Store 側は楽観更新で mat/container は既に入っているが、
                // members はここで反映する (遷移前には反映していない)
                if (Store.patchDBItem && Object.keys(_storeUnitPatch).length > 0) {
                  Store.patchDBItem('breeding_units', 'unit_id', _savedEntity.unit_id, _storeUnitPatch);
                }
                console.log('[CS] unit patched (from api.all):', _apiUnitPatch);
                return res;
              })
            );
          } else {
            console.log('[CS] unit patch skipped: no diff');
          }
        }

        // ══════════════════════════════════════════════════════════════
        // 全 API を並列実行 (Promise.allSettled で部分成功を許容)
        // ══════════════════════════════════════════════════════════════
        console.log('[CS] firing', savePromises.length, 'API calls in parallel');
        var _results = await Promise.allSettled(savePromises);
        var _rejected = _results.filter(function(r){ return r.status === 'rejected'; });
        if (_rejected.length > 0) {
          // 1つでも失敗したら全体失敗扱い（楽観更新をロールバック）
          var _firstErr = _rejected[0].reason || new Error('unknown error');
          console.error('[CS] ' + _rejected.length + '/' + _results.length + ' API calls failed');
          throw _firstErr;
        }

        UI.toast('✅ '+savedCount+'件の記録を保存しました','success',3000);

        // ══════════════════════════════════════════════════════════════
        // [20260422c-1] 🐛 バグ修正: 再描画判定を Store.getPage() で取得
        //   以前は window.location.hash から page 名を抜き出す実装だったが、
        //   hash 構造が 'page=unit-detail&unitDisplayId=...' (URLSearchParams) のため
        //   split('?')[0] しても hash 全体が残り、'unit-detail' と比較して絶対 false に。
        //   → Pages.unitDetail() が一度も再呼び出されず、リロードで初めて反映されていた。
        // ══════════════════════════════════════════════════════════════
        try {
          var _curPage = (typeof Store !== 'undefined' && Store.getPage) ? Store.getPage() : '';
          console.log('[CS] post-save rerender check: curPage=', _curPage, 'targetType=', _savedTargetType);
          if (_savedTargetType === 'UNIT' && _curPage === 'unit-detail' && typeof Pages.unitDetail === 'function') {
            window._skipNextGrowthLoad = true;
            Pages.unitDetail({ unitDisplayId: _savedDisplayId });
          } else if (_savedTargetType === 'IND' && _curPage === 'ind-detail' && typeof Pages.individualDetail === 'function') {
            Pages.individualDetail(_savedTargetId);
          }
        } catch (_rerr) { console.warn('[CS] rerender failed (non-fatal):', _rerr.message); }
      } catch(err){
        console.error('[CS] bg save error (all retries failed):',err);
        // ── [20260422c-2] 楽観更新のロールバック (ユニット) ──
        if (_rollbackUnitPatch && _savedEntity && _savedEntity.unit_id && Store.patchDBItem) {
          try {
            Store.patchDBItem('breeding_units', 'unit_id', _savedEntity.unit_id, _rollbackUnitPatch);
            console.log('[CS] optimistic UI rolled back:', _rollbackUnitPatch);
            // 現在 unit-detail を開いていれば再描画
            var _curPage2 = (typeof Store !== 'undefined' && Store.getPage) ? Store.getPage() : '';
            if (_savedTargetType === 'UNIT' && _curPage2 === 'unit-detail' && typeof Pages.unitDetail === 'function') {
              window._skipNextGrowthLoad = true;
              Pages.unitDetail({ unitDisplayId: _savedDisplayId });
            }
          } catch (_rbErr) { console.warn('[CS] rollback failed:', _rbErr.message); }
        }
        // ── [20260424a-2] 楽観更新のロールバック (個体) ──
        if (_rollbackIndPatch && _savedTargetId && Store.patchDBItem) {
          try {
            Store.patchDBItem('individuals', 'ind_id', _savedTargetId, _rollbackIndPatch);
            console.log('[CS] optimistic IND rolled back:', _rollbackIndPatch);
            // スキップフラグも解除 (失敗したので次の遷移では fresh 取得させる)
            if (window._skipNextIndividualRefresh === _savedTargetId) {
              window._skipNextIndividualRefresh = false;
            }
            var _curPage3 = (typeof Store !== 'undefined' && Store.getPage) ? Store.getPage() : '';
            if (_savedTargetType === 'IND' && _curPage3 === 'ind-detail' && typeof Pages.individualDetail === 'function') {
              Pages.individualDetail(_savedTargetId);
            }
          } catch (_indRbErr) { console.warn('[CS] IND rollback failed:', _indRbErr.message); }
        }
        UI.toast('⚠️ 保存失敗: '+(err.message||'通信エラー')+' — 画面を元に戻しました。再入力してください','error',8000);
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
              '<button class="btn '+(curSex==='♂'?'btn-primary':'btn-ghost')+'" style="flex:1;padding:10px" data-bs-idx="'+idx+'" data-bs-sex="♂" onclick="Pages._bsSetSexBtn(this)">♂</button>' +
              '<button class="btn '+(curSex==='♀'?'btn-primary':'btn-ghost')+'" style="flex:1;padding:10px" data-bs-idx="'+idx+'" data-bs-sex="♀" onclick="Pages._bsSetSexBtn(this)">♀</button>' +
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
    // [20260422b] 単行変更に統一 (継続読取りと同仕様)
    else if(col==='mat'){row.mat_type=val; row.mat_state='manual';}
    else if(col==='container'){row.container=val; row.container_state='manual';}

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
            stage:stage, mat_type:row.mat_type||'',
            container:      row.container||'',   // [20260422b] GAS GROWTH列は 'container'
            container_size: row.container||'',   // 念のため両方送信
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
