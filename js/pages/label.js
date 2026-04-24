// FILE: js/pages/label.js
// build: 20260424g
// 修正:
//   - [20260424g] 成長記録マージ結果に UI._gr_dedupe を適用
//     日付×体重×スロットで重複を排除し、個体化時に発生しうる重複表示を解消。
//     (app.js 20260424g の共通ヘルパーを利用)
//   - [20260424f] 🐛 IND個別飼育ラベル (ind_fixed) の成長記録テーブルが空になる
//     症状: T2/T3 移行で個別化された個体のラベルを発行すると、記録表の行が
//           空欄で印刷される (今まで蓄積したユニット時代の体重/交換履歴が反映
//           されない)。画像 1 の HM2025-A1-010 で 04/20 20g L1L2/T1 や
//           T2 時代の 58g が一切載っていない状態。
//     原因: Store.getGrowthRecords(indId) は "新しい個体ID" をキーにしており、
//           ユニット時代の成長記録は unit_id / unit_display_id キーで保存
//           されているため 0件扱いになっていた。GAS の getIndividual は
//           origin_unit_id + origin_unit_slot_no / origin_lot_id を使って
//           ユニット/ロット時代の記録をマージして _growthRecords として
//           返すロジックを持つが、ラベル生成は Store 直参照のみで、この
//           マージ済みデータに到達していなかった。
//     修正: targetType === 'IND' 分岐で以下の順序でマージを試行:
//             ① Store.getIndividual(targetId)._growthRecords (API応答がキャッシュ
//                されていれば最優先)
//             ② Store.getGrowthRecords(indId) (個体化後に記録されたもの)
//             ③ origin_unit_id / ind.origin_unit_display_id から unit時代の記録
//                を slot 絞り込みで拾う
//             ④ origin_lot_id から lot時代の記録を拾う
//           record_id で重複排除し、日付昇順に並べ替えてから最新8件を抽出。
//     副次: targetType === 'LOT' / 'PAR' も同じ拡張適用余地があるが、
//           本修正は IND のみ対象 (最低限の修正に留める)。
//   - [20260424f] 🐛 T3 完了画面からラベル発行すると完了画面に戻れない
//     原因: t3_session.js が routeTo('label-gen', {_back:'t3-completion'})
//           と "_back" (アンダースコア付き) で渡していたが、label.js は
//           params.backRoute しか見ていなかった。T2 と同じ backRoute/backParam
//           の命名に揃えれば戻る導線が復活する。
//     修正: t3_session.js 側を _back → backRoute に修正 (本ファイルではなく
//           t3_session.js 側の変更)。label.js は既に backRoute を読んでいる
//           ので修正不要。
//   - [20260422n] 🐛 ラベル発行画面をリロードするとID/孵化日/下部ラベルが消えるバグ
//     症状: 画面リロード (F5) すると HM2025-C1-001 等のID、孵化日、下部
//           「T1個別飼育 HM2025-C1-L01 #3」等の note 部分が空になる。
//     原因: routeTo('label-gen', { formalInd: {...} }) でオブジェクトを
//           URL params として渡すと URLSearchParams が String(object) で
//           "[object Object]" という壊れた文字列に変換。リロード時に
//           URL hash → params 復元で formalInd = "[object Object]" (文字列)
//           となり、fi.display_id 等すべて undefined になる。
//           window._lblFormalCtx / window._t1LabelBackup はリロードで消失
//           するため救済できていなかった。
//     修正: sessionStorage に本体データを保存してリロード耐性を獲得
//       ① ラベル生成時に formalInd / draftInd / unitDraft を
//          sessionStorage に JSON で保存 (キーは targetType ごと)
//       ② URL params から取り出した値が壊れた文字列か検査する
//          _isGarbageObjectString ヘルパーで "[object Object]" を判定
//       ③ 壊れていたら sessionStorage から復元
//       ④ 復元成功時は console.log で通知
//     対象: UNIT (unitDraft) / IND_DRAFT (draftInd) / IND_FORMAL (formalInd)
//   - [20260422m] 個別飼育ラベル (ind_fixed) の孵化日表示 & 下部カットオフ解消
//     - 共通ヘルパー _resolveLabelHatchDate を追加
//     - UNIT / IND / IND_DRAFT / IND_FORMAL 全ブランチに適用
//     - _buildLabelHTML の hatchHtml を常時表示に変更
//     - 表の tdU padding 6px → 4px に縮小
//   - [20260422l] UNIT ブランチの孵化日フォールバックを3段階に強化
//   - [20260422k] T1ユニットラベルの孵化日表示を常時化＋親ロットフォールバック
//   - [20260421f] 販売候補ラベル (ind_sale) デザイン見直し
//       ヘッダー文言: "🏷️ 販売" → "🏷️ 販売候補"
//       孵化日の年を2桁 → 4桁 (2025/12/5 形式)
//       情報エリアの vertical 配置を justify-content:space-between → 自然な縦積み
//       (gap:0.3mm, 各行 line-height:1.1) に変更し行間を圧縮
//       フォントサイズを少し縮小して全体が 25mm 内にバランス良く収まるよう調整
//   - [20260421d] 販売候補個体のラベル種別 自動フォールバック
//       params.labelType 未指定で targetType==='IND' の場合、
//       Store.getIndividual(targetId) を引いて for_sale/status を判定し、
//       販売候補なら自動で ind_sale (62×25mm) に切り替え。
//       個体画面・QRスキャン・その他の経路から labelType 未指定で
//       呼ばれた場合も、販売候補なら正しく簡易ラベルが発行される。
//       明示的に labelType を渡している場合（T2完了画面、T1single等）は尊重。
//   - [20260420n] LOT 採卵日の構造化カラム対応（恒久対応完成）
//       LotApi.gs@20260421c で LOT.collect_date 列が追加されたため、
//       label.js LOT ブランチで lot.collect_date を最優先で使用するように変更。
//       _normalizeDateForLabel を全日付に適用し、
//       lot.collect_date > lot.hatch_date > note抽出 の優先順位で採卵日を決定。
//       既存データ（collect_date 列が無いロット）は note 抽出で引き続き動作。
//   - [20260420m] ロットラベル 採卵日 空欄バグ修正（note 文字列からのフォールバック抽出）
//       問題: egg-lot-bulk で作成した lot の 採卵日 がラベル上で空欄になる
//       原因: LOT テーブルに collect_date 列が存在せず、egg-lot-bulk は
//              採卵日を note フィールドに "採卵日: YYYY/MM/DD" 文字列として
//              埋め込んでいるだけで、構造化された日付カラムには書き込んでいない
//       対応: label.js LOT ブランチで lot.collect_date / lot.hatch_date 共に空の場合、
//              lot.note から "採卵日: YYYY/MM/DD" 形式を正規表現抽出して collect_date に設定
//       注: 恒久対応としては LotApi.createLotBulk で lotData.hatch_date を
//          受け取って LOT.hatch_date に書き込むべき（次回の宿題）
//   - [20260420l] T2セッション個体化フローのラベルキュー表示バグ修正
//       問題: ユニットT2移行時、複数頭を「個別化」決定しても
//              1枚目のラベル発行後「次のラベルへ」ボタンが出ず2枚目以降が発行不能だった
//       原因: label.js が _eblQueueIdx（egg-lot-bulk専用）しか認識せず、
//              t2_session.js が送信する _t2LabelMode / _t2LabelIdx / _t2LabelTotal を
//              完全に無視していた
//       対応: キュー検出を EBL と T2 の両対応に統一
//              - _inEblQueue / _inT2Queue を個別に判定
//              - _inAnyQueue / _queueIdx / _queueTotal / _queueNextClick で統一レンダリング
//              - T2 の「次」は window._t2LabelNextFn() を呼び出す
//              - T2 の戻り先は qr-scan?mode=t2
//   - [20260420k] T1ユニットラベル (t1_unit) の表記・レイアウト改善
//       ① 全角コロン統一: 区分: → 区分： / M: → M： / St: → St： / 由来: → 由来：
//       ② M+Mx 1行統合: M行の末尾に Mx：□ON ■OFF を常時表示（条件分岐削除）
//          以前は mat==='T2'||'T3' の時のみ独立行で Mx 表示していた
//       ③ チェックボックス間は &nbsp; 1個で統一（7pxフォント時に約1文字分の間隔）
//       ④ 頭数+性別を absolute 配置で右上固定
//          以前は flex 列で「ID+頭数」並列→align-items:center で ID 上下に余白が出ていた
//          新版: 頭数+sex は絶対配置、ID/孵化日/由来 は line-height:1.3 で上詰め
//       ⑤ 孵化日フォント 7.5px → 8px（目立たせる）+ line-height 1.5 → 1.3（詰める）
//       ⑥ Mx判定ロジック (A案): unit の直近成長記録の has_malt を参照
//          成長記録が無い場合は mat_type === 'T2' で自動 ON とする（運用ルール: T2=モルト必須）
//   - [20260420j] 孵化日 Date.toString() 形式対応（全ラベル共通）
//       問題: GAS側 _getLotHatchDate が String(dateObject) を返すため
//              "Fri Dec 05 2025 00:00:00 GMT+0900 (日本標準時)" 形式の文字列が
//              hatch_date に入ってきて、個別飼育ラベルに改行しながら表示されていた
//       対応: label.js 上部に _normalizeDateForLabel ヘルパー関数を追加し
//              YYYY/MM/DD / YYYY-MM-DD / Date.toString / ISO datetime 等の
//              多形式を YYYY/MM/DD に統一して表示
//       適用: 個別飼育ラベル (ind_fixed)、ロットラベル (multi_lot)、
//              T1ユニットラベル (t1_unit)、販売候補ラベル (ind_sale) の全てに適用
//       T1ユニットラベルの孵化日も目立たせた (6.5px→7.5px、「孵: 」→「孵化日：」)
//       ※ GAS側 _getLotHatchDate 自体の修正は次回の宿題として継続
//   - [20260420i] 個別飼育ラベル (ind_fixed, 62×70mm) の孵化日を目立たせる + Mx統合
//       hatchHtml: 6.5px→8px、表記「孵: YYYY-MM-DD」→「孵化日：YYYY/MM/DD」
//       ダッシュ区切りをスラッシュ区切りに統一
//       Mx 独立行を削除し、M行の右側に横並びで統合 (1行節約)
//       結果: ID / 孵化日 / 区分 / M+Mx / St の5行構成 (変更前は4行+Mx独立)
//   - [20260420h] 販売候補簡易ラベルの配置調整
//       孵化日の位置を3行目→2行目（ID直下）に移動
//       表記を「孵: 25/12/5」→「孵化日：25/12/5」に変更（全角コロン）
//       4行構成: ①ID+性別 ②孵化日 ③サイズ+体重+測定日 ④ステージ
//   - [20260420g] 販売候補簡易ラベルを 62×40mm → 62×25mm に縮小
//       種親ラベルと同じ最小サイズに短縮
//   - [20260420f] 販売候補簡易ラベル (ind_sale) を新規追加
//       LABEL_TYPE_DEFS に ind_sale エントリ追加
//       _buildIndSaleLabelHTML 新規関数を実装
//       T2移行完了画面から販売候補個体は自動的にこのラベルで起動される
//   - [20260418e-fix3] e-fix2 で勝手にボタン文言を変更していたのを元に戻す
//                     常に「詳細に戻る」表示に統一
//   - [20260418e-fix2] T1/T2/T3セッション中のラベル発行時の戻り先を修正
//                     _backRoute > origin の優先度に変更
//   - [20260418e-fix1] 戻るボタンが反応しない問題を修正
//                     JSON.stringify を onclick属性に埋め込むと "{"key":"val"}" の
//                     ダブルクォートがHTML構文を壊していた
//                     → シングルクォート形式の文字列に変換する _toOnclickParams を導入
//   - [20260418d-fix1] members が JSON文字列で来た時にparseしてから処理する
//                     (TypeError: _members.filter is not a function の修正)
//   - [20260418d] ユニット性別表示を頭数カウント式に改善
//                 例: ♂2頭なら「♂2・♀」、♂1♀1なら「♂1・♀1」、判別0なら「♂・♀」
//   - [20260418d] UNIT の戻り先を t1-session → unit-detail に修正
//                 ラベル発行後「詳細に戻る」を押すとスキャン画面まで戻っていた問題
//   - Bug 1: ユニットラベルの性別未判別時を ♂・♀ 表示に修正
//   - Bug 3: _backRoute が存在する場合に「詳細に戻る」ボタンを追加
'use strict';

window._LABEL_BUILD = '20260422n';
console.log('[LABEL_BUILD]', window._LABEL_BUILD, 'loaded');

// ════════════════════════════════════════════════════════════════
// [20260420j] 日付表示の正規化ヘルパー
// ════════════════════════════════════════════════════════════════
// GAS側の _getLotHatchDate が Date オブジェクトを String(date) で返してくるため、
// "Fri Dec 05 2025 00:00:00 GMT+0900 (日本標準時)" 形式の文字列が hatch_date に
// 入ってくるケースがある。ラベル表示側で多形式を受け入れて YYYY/MM/DD に統一。
//
// 対応フォーマット:
//   - YYYY/MM/DD       (理想形)
//   - YYYY-MM-DD       (ISO日付)
//   - YYYY-MM-DDTHH:MM (ISO datetime)
//   - Fri Dec 05 2025  (Date.toString)
//   - 不正値 → 空文字
// ════════════════════════════════════════════════════════════════
function _normalizeDateForLabel(raw) {
  if (!raw) return '';
  var str = String(raw).trim();
  if (!str) return '';
  // 先頭10文字で YYYY/MM/DD or YYYY-MM-DD を判定
  var m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) {
    var y  = m[1];
    var mm = String(parseInt(m[2], 10)).padStart(2, '0');
    var dd = String(parseInt(m[3], 10)).padStart(2, '0');
    return y + '/' + mm + '/' + dd;
  }
  // Date.toString() / ISO 等 → Date にパース
  try {
    var d = new Date(str);
    if (!isNaN(d.getTime())) {
      var y2  = d.getFullYear();
      var mm2 = String(d.getMonth() + 1).padStart(2, '0');
      var dd2 = String(d.getDate()).padStart(2, '0');
      return y2 + '/' + mm2 + '/' + dd2;
    }
  } catch(e) {}
  return str;
}

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

// ════════════════════════════════════════════════════════════════
// [20260422m] 孵化日フォールバック共通ヘルパー
// ════════════════════════════════════════════════════════════════
// 以下の順で hatch_date を解決し、最初に見つかった値 (YYYY/MM/DD) を返す:
//   1. opts.direct      (unit.hatch_date, ind.hatch_date, fi.hatch_date 等)
//   2. opts.lotId       (ind.lot_id / fi.lot_id / di.lot_id) → Store.getLot(lot.hatch_date)
//   3. opts.originLotId (unit.origin_lot_id / ind.origin_lot_id) → Store.getLot
//   4. opts.sourceLots  (unit.source_lots JSON 配列) 各要素 → Store.getLot
//   5. opts.members     (unit.members JSON 配列) 各 member.lot_id → Store.getLot
// 見つからなければ '' を返す。
// 診断ログを [<opts.debugLabel>] hatch resolve: ... として常時出力。
// ════════════════════════════════════════════════════════════════
function _resolveLabelHatchDate(opts) {
  opts = opts || {};
  var value  = '';
  var source = 'NONE';
  var direct = _normalizeDateForLabel(opts.direct);
  if (direct) {
    value = direct; source = 'direct';
  } else if (Store && Store.getLot) {
    var candidates = [];
    if (opts.lotId)        candidates.push({ id: opts.lotId,       src: 'lot_id' });
    if (opts.originLotId)  candidates.push({ id: opts.originLotId, src: 'origin_lot_id' });
    if (opts.sourceLots) {
      try {
        var sl = typeof opts.sourceLots === 'string' ? JSON.parse(opts.sourceLots) : opts.sourceLots;
        if (Array.isArray(sl)) {
          sl.forEach(function (x, i) {
            if (x) candidates.push({ id: x, src: 'source_lots[' + i + ']' });
          });
        }
      } catch (_slErr) { /* JSON parse fail 無視 */ }
    }
    if (opts.members) {
      try {
        var mm = typeof opts.members === 'string' ? JSON.parse(opts.members) : opts.members;
        if (Array.isArray(mm)) {
          mm.forEach(function (m, i) {
            if (m && m.lot_id) candidates.push({ id: m.lot_id, src: 'members[' + i + '].lot_id' });
          });
        }
      } catch (_mmErr) { /* JSON parse fail 無視 */ }
    }
    var seen = {};
    for (var i = 0; i < candidates.length; i++) {
      var e = candidates[i];
      if (seen[e.id]) continue;
      seen[e.id] = true;
      var L = Store.getLot(e.id);
      if (L) {
        var h = _normalizeDateForLabel(L.hatch_date);
        if (h) { value = h; source = e.src + ':' + e.id; break; }
      }
    }
  }
  try {
    var info = Object.assign({ resolved: value, source: source }, opts.debugInfo || {});
    console.log('[' + (opts.debugLabel || 'LABEL') + '] hatch resolve:', info);
  } catch (_logErr) { /* noop */ }
  return value;
}

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

var QR_RECT_MM = { xMm: 3.0, yMm: 7.7, sizeMm: 11.67 };

function _qrPxForDims(dims) {
  var pxPerMm = (dims && dims.wPx && dims.wMm) ? dims.wPx / dims.wMm : (234 / 62);
  var scale   = (dims && dims.scale) || 1;
  return {
    x:    Math.round(QR_RECT_MM.xMm    * pxPerMm * scale),
    y:    Math.round(QR_RECT_MM.yMm    * pxPerMm * scale),
    size: Math.round(QR_RECT_MM.sizeMm * pxPerMm * scale),
  };
}

const LABEL_TYPE_DEFS = [
  { code: 'egg_lot',   label: '① 卵管理',      target: 'LOT',  desc: '採卵後・採卵日印字・孵化日手書き欄付き 62×40mm' },
  { code: 'multi_lot', label: '② 複数頭飼育',  target: 'LOT',  desc: 'ロット管理用・採卵日/孵化日欄付き 62×40mm' },
  { code: 'ind_fixed', label: '③ 個別飼育',    target: 'IND',  desc: '個体管理用（記録表付き）62×70mm' },
  { code: 'ind_sale',  label: '⑦ 販売候補（簡易）', target: 'IND', desc: '販売仕分け用・最小サイズ 62×25mm' },
  { code: 't1_unit',   label: '⑥ T1ユニット', target: 'UNIT', desc: 'T1移行後の2頭飼育（記録表付き）62×70mm' },
  { code: 'set',       label: '④ 産卵セット',  target: 'SET',  desc: '産卵セット情報 62×40mm' },
  { code: 'parent',    label: '⑤ 種親',        target: 'PAR',  desc: '種親QR・血統タグ 62×25mm' },
];

window._currentLabel  = { displayId:'', fileName:'', html:'', pngDataUrl:'', dims:null };
window._lastLabelType = {};

function _defaultLabelType(targetType) {
  if (window._lastLabelType[targetType]) return window._lastLabelType[targetType];
  if (targetType === 'LOT')  return 'multi_lot';
  if (targetType === 'UNIT') return 't1_unit';
  if (targetType === 'SET')  return 'set';
  if (targetType === 'PAR')  return 'parent';
  return 'ind_fixed';
}

function _detailPageKey(targetType, targetId) {
  if (targetType === 'IND')  return { page: 'ind-detail',     params: { indId: targetId } };
  if (targetType === 'LOT')  return { page: 'lot-detail',     params: { lotId: targetId } };
  if (targetType === 'PAR')  return { page: 'parent-detail',  params: { parId: targetId } };
  if (targetType === 'SET')  return { page: 'pairing-detail', params: { pairingId: targetId } };
  // [20260418d] UNIT戻り先を t1-session → unit-detail に修正
  // targetId にはユニットの display_id が入る想定（_udLabelParams 経由）
  if (targetType === 'UNIT') return { page: 'unit-detail',    params: { unitDisplayId: targetId } };
  return null;
}

function _labelDimensions(labelType, targetType) {
  // [20260420g] 販売候補簡易ラベルを 62×40mm → 62×25mm に縮小（種親と同サイズ・最小）
  if (labelType === 'ind_sale') {
    return { wMm:62, hMm:25, wPx:234, hPx:94, scale:3, label:'62×25mm' };
  }
  if (labelType === 'multi_lot' || labelType === 'egg_lot') {
    return { wMm:62, hMm:40, wPx:234, hPx:151, scale:3, label:'62×40mm' };
  }
  var isLarge =
    labelType === 'ind_fixed' ||
    labelType === 't1_unit'   ||
    targetType === 'IND'      ||
    targetType === 'UNIT'     ||
    targetType === 'IND_DRAFT' ||
    targetType === 'IND_FORMAL';
  if (isLarge) {
    return { wMm:62, hMm:70, wPx:234, hPx:265, scale:3, label:'62×70mm' };
  }
  if (labelType === 'parent' || targetType === 'PAR') {
    return { wMm:62, hMm:25, wPx:234, hPx:94, scale:3, label:'62×25mm' };
  }
  return { wMm:62, hMm:35, wPx:234, hPx:132, scale:3, label:'62×35mm' };
}

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
    'position:fixed', 'left:-99999px', 'top:0',
    `width:${dims.wPx}px`, `height:${dims.hPx}px`,
    'overflow:hidden', 'background:#fff', 'box-sizing:border-box',
  ].join(';');
  host.innerHTML = `<style>${rawStyle}</style>${bodyHtml}`;
  document.body.appendChild(host);
  const _hostImgs = Array.from(host.querySelectorAll('img'));
  if (_hostImgs.length > 0) {
    await Promise.all(_hostImgs.map(function(img) {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(function(resolve) {
        img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 2000);
      });
    }));
  }
  await new Promise(function(r) { requestAnimationFrame(function() { requestAnimationFrame(r); }); });
  let canvas;
  try {
    canvas = await html2canvas(host, {
      scale: dims.scale, width: dims.wPx, height: dims.hPx,
      useCORS: true, allowTaint: true, logging: false,
      backgroundColor: '#ffffff', windowWidth: dims.wPx, windowHeight: dims.hPx, imageTimeout: 5000,
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

  if (Object.keys(params).length <= 1 && window._t1LabelBackup) {
    const _bk = window._t1LabelBackup;
    if (_bk.formalInd && (!params.formalInd)) {
      params = Object.assign({}, params, {
        targetType: 'IND_FORMAL', labelType: 'ind_fixed',
        backRoute: _bk.backRoute || 't1-session',
        singleIdx: _bk.singleIdx !== undefined ? _bk.singleIdx : -1,
        formalInd: _bk.formalInd,
      });
      console.log('[LABEL] restored params from _t1LabelBackup (formalInd)');
    } else if (_bk.labeledDisplayId && (!params.displayId)) {
      params = Object.assign({}, params, {
        targetType: 'UNIT', labelType: 't1_unit',
        backRoute: _bk.backRoute || 't1-session',
        labeledDisplayId: _bk.labeledDisplayId,
        displayId: _bk.labeledDisplayId,
      });
      console.log('[LABEL] restored params from _t1LabelBackup (unit)');
    }
  }

  let targetType       = (params.targetType || 'IND').toUpperCase();
  let targetId         = params.targetId   || '';
  let labelType        = params.labelType  || _defaultLabelType(targetType);

  // [20260421d] 個体ラベルで labelType が明示指定されていない場合のみ、
  //   対象個体が販売候補 (ind.for_sale===true または ind.status==='for_sale') なら
  //   自動で ind_sale (62×25mm) にフォールバックする。
  //   これで個体画面・QRスキャン・その他の経路から labelType 未指定で
  //   ラベル発行されても販売候補が正しく簡易ラベルになる。
  //   明示指定 (params.labelType) は常に尊重する。
  if (!params.labelType && targetType === 'IND' && targetId && labelType === 'ind_fixed') {
    try {
      const _ind = (typeof Store !== 'undefined' && typeof Store.getIndividual === 'function')
        ? Store.getIndividual(targetId)
        : null;
      if (_ind && (_ind.for_sale === true || _ind.for_sale === 'true' || _ind.status === 'for_sale')) {
        labelType = 'ind_sale';
        console.log('[LABEL] auto-detected sale candidate, switching to ind_sale:', targetId);
      }
    } catch (_e) { console.warn('[LABEL] sale auto-detect failed:', _e.message); }
  }

  const _isUnitMode    = targetType === 'UNIT';
  const _unitDisplayId = params.displayId || targetId || '';
  const _unitForSale   = !!params.forSale;
  const _isIndDraftMode = targetType === 'IND_DRAFT';
  const _singleIdx      = params.singleIdx !== undefined ? params.singleIdx : -1;
  const _isFormalMode   = targetType === 'IND_FORMAL';

  // ═══════════════════════════════════════════════════════════════
  // [20260422n] リロード耐性: オブジェクト型 params を sessionStorage で救済
  //   routeTo('label-gen', { formalInd: {...} }) は URLSearchParams で
  //   String(object) → "[object Object]" になり、リロードで ID/孵化日/
  //   note 等すべてが空ラベルに化ける。sessionStorage に本体を保存して
  //   URL 値が壊れている場合に復元する。
  // ═══════════════════════════════════════════════════════════════
  function _isGarbageObjectString(v) {
    return typeof v === 'string' && (v === '[object Object]' || v.indexOf('[object') === 0);
  }
  function _resolveObjectParam(rawValue, sessKey) {
    // 有効オブジェクトならそのまま採用 + sessionStorage に保存
    if (rawValue && typeof rawValue === 'object') {
      try { sessionStorage.setItem('hcos_lbl_' + sessKey, JSON.stringify(rawValue)); } catch(_) {}
      return rawValue;
    }
    // 壊れた文字列 or null → sessionStorage から復元
    if (_isGarbageObjectString(rawValue) || !rawValue) {
      try {
        var s = sessionStorage.getItem('hcos_lbl_' + sessKey);
        if (s) {
          var parsed = JSON.parse(s);
          if (parsed && typeof parsed === 'object') {
            console.log('[LABEL] restored', sessKey, 'from sessionStorage (reload recovery)');
            return parsed;
          }
        }
      } catch(_) {}
    }
    return null;
  }
  const _unitDraft = _resolveObjectParam(params.unitDraft, 'unitDraft');
  const _draftInd  = _resolveObjectParam(params.draftInd,  'draftInd');
  const _formalInd = _resolveObjectParam(params.formalInd, 'formalInd');

  if (_isUnitMode) {
    window._lblUnitCtx = { displayId: _unitDisplayId, forSale: _unitForSale, draft: _unitDraft };
  } else { window._lblUnitCtx = null; }
  if (_isIndDraftMode) {
    window._lblIndDraftCtx = { draftInd: _draftInd, singleIdx: _singleIdx, backRoute: params.backRoute };
  } else { window._lblIndDraftCtx = null; }
  if (_isFormalMode) {
    window._lblFormalCtx = { formalInd: _formalInd, singleIdx: _singleIdx, backRoute: params.backRoute };
  } else { window._lblFormalCtx = null; }

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

  // [20260420l] T2セッション個体化フローのラベルキュー認識
  //   t2_session.js の _t2LaunchAllLabels は:
  //     - params に _t2LabelMode / _t2LabelIdx / _t2LabelTotal を送信
  //     - window._t2LabelNextFn にクロージャを格納（次の個体に遷移する _next()）
  //   label.js がこれを認識していなかったため、1枚目のラベル発行後「次のラベルへ」
  //   ボタンが表示されず、複数頭個体化した時の2枚目以降が発行不能だった。
  const _t2LabelIdx    = params._t2LabelIdx   !== undefined ? parseInt(params._t2LabelIdx,10)   : -1;
  const _t2LabelTotal  = params._t2LabelTotal !== undefined ? parseInt(params._t2LabelTotal,10) : 0;
  const _inT2Queue     = !!params._t2LabelMode && _t2LabelTotal > 0;

  // 統一キュー状態（EBLまたはT2）
  const _inAnyQueue   = _inEblQueue || _inT2Queue;
  const _queueIdx     = _inEblQueue ? _eblQueueIdx   : (_inT2Queue ? _t2LabelIdx   : -1);
  const _queueTotal   = _inEblQueue ? _eblQueueTotal : (_inT2Queue ? _t2LabelTotal : 0);
  const _queueNextClick = _inEblQueue
    ? ("window._eblGoNextLabel(" + _eblQueueIdx + ")")
    : "window._t2LabelNextFn && window._t2LabelNextFn()";
  const _queueBackFn = _inEblQueue
    ? "routeTo('egg-lot-bulk',{_showComplete:true})"
    : "routeTo('qr-scan',{mode:'t2'})";

  const inds = Store.filterIndividuals({ status: 'alive' });
  const lots = Store.filterLots({ status: 'active' });
  const pars = Store.getDB('parents') || [];

  const isDirectMode = !!params.targetId || _isUnitMode || _isIndDraftMode || targetType === 'IND_FORMAL';
  // [20260418d] UNIT の場合は _unitDisplayId を優先して渡す（戻り先が unit-detail へ）
  const _originTargetId = _isUnitMode ? (_unitDisplayId || targetId) : targetId;
  const origin       = isDirectMode ? _detailPageKey(targetType, _originTargetId) : null;

  // [20260418e-fix1] onclick属性内でダブルクォートが壊れる問題を修正
  // JSON.stringify はダブルクォートを含む文字列を返すため、
  // onclick="routeTo('x', {"key":"val"})" という壊れたHTMLになっていた
  // → シングルクォートのみを使った形式に変換する
  function _toOnclickParams(obj) {
    if (!obj || typeof obj !== 'object') return '{}';
    var parts = [];
    Object.keys(obj).forEach(function(k) {
      var v = obj[k];
      if (typeof v === 'string') {
        parts.push(k + ":'" + String(v).replace(/'/g, "\\'") + "'");
      } else if (typeof v === 'boolean' || typeof v === 'number') {
        parts.push(k + ':' + String(v));
      } else if (v === null || v === undefined) {
        // skip
      } else {
        // オブジェクト/配列は文字列化を諦め、空にする（今回のユースケースでは出現しない）
      }
    });
    return '{' + parts.join(',') + '}';
  }

  const headerOpts = _backRoute
    ? { back: true, backFn: "routeTo('" + _backRoute + "'," + _toOnclickParams(_backParam) + ")" }
    : _inAnyQueue
      ? { back: true, backFn: _queueBackFn }
      : (isDirectMode && origin
          ? { back: true, backFn: "routeTo('" + origin.page + "'," + _toOnclickParams(origin.params) + ")" }
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
          ${(targetId || (_isUnitMode && _unitDisplayId) || _isIndDraftMode || _isFormalMode)
            ? `<div class="card-title">プレビュー <span style="font-size:.72rem;color:var(--text3);font-weight:400">${dims.label}</span></div>
               <div id="lbl-html-preview" style="margin-bottom:12px;min-height:120px;
                 display:flex;align-items:center;justify-content:center;
                 border:1px solid var(--border2);border-radius:4px;overflow:hidden;background:#fff">
                 <div style="color:var(--text3);font-size:.8rem;text-align:center;padding:16px">
                   <div class="spinner" style="margin:0 auto 8px"></div>PNG生成中...
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
                onclick="Pages._lblBrotherPrint()">🖨️ Brother印刷</button>
              <button class="btn btn-ghost" style="flex:1"
                onclick="Pages._lblGenerate('${targetType}','${targetId}','${labelType}')">🔄 再生成</button>
            </div>
            ${_inAnyQueue ? `
            <div style="font-size:.72rem;color:var(--text3);padding:4px 0;text-align:center;margin-bottom:4px">
              ${_queueIdx+1} / ${_queueTotal}枚目
            </div>
            ${_queueIdx + 1 < _queueTotal ? `
            <button class="btn btn-primary btn-full" style="font-weight:700"
              onclick="${_queueNextClick}">
              次のラベルへ →（${_queueIdx+2}/${_queueTotal}枚目）
            </button>` : `
            <button class="btn btn-ghost btn-full" style="font-weight:700;color:var(--green)"
              onclick="${_queueNextClick}">
              ✅ 完了画面へ戻る（全${_queueTotal}枚発行済み）
            </button>`}` : _backRoute ? `
            <button class="btn btn-ghost btn-full" style="margin-top:2px;font-size:.82rem"
              onclick="routeTo('${_backRoute}',${_toOnclickParams(_backParam)})">
              ← 詳細に戻る
            </button>` : origin ? `
            <button class="btn btn-ghost btn-full" style="margin-top:2px;font-size:.82rem"
              onclick="routeTo('${origin.page}',${_toOnclickParams(origin.params)})">
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

    if (targetId || (_isUnitMode && _unitDisplayId) || _isIndDraftMode || _isFormalMode) {
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
    targetType = t.toUpperCase(); targetId = ''; labelType = _defaultLabelType(targetType); render();
  };
  Pages._lblSetTarget    = (id) => { targetId = id; render(); };
  Pages._lblSetLabelType = (t)  => {
    labelType = t; window._lastLabelType[targetType] = t; render();
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
  const _genFormalInd = (targetType === 'IND_FORMAL') ? ((window._lblFormalCtx && window._lblFormalCtx.formalInd) || (window._t1LabelBackup && window._t1LabelBackup.formalInd) || null) : null;
  if (targetType === 'IND_FORMAL' && !_genFormalInd)  { console.warn('[LABEL] early return: IND_FORMAL no formalInd'); return; }
  if (targetType !== 'UNIT' && targetType !== 'IND_DRAFT' && targetType !== 'IND_FORMAL' && !targetId) {
    console.warn('[LABEL] early return: no targetId for', targetType); return;
  }

  const preview = document.getElementById('lbl-html-preview');
  if (!preview) { console.error('[LABEL] lbl-html-preview not in DOM'); return; }

  let ld;
  try {
    console.log('[LABEL] generate start', targetType, targetId);
    if (targetType === 'IND') {
      const ind     = Store.getIndividual(targetId) || {};
      const line    = Store.getLine(ind.line_id)    || {};
      // [20260424f] ユニット/ロット時代の成長記録もマージして表示
      //   症状: 個別化個体 (T2/T3 後の新規 ind_id) のラベルで記録表が空欄
      //   原因: Store.getGrowthRecords(ind_id) は新しい ind_id キーのみ参照
      //         し、ユニット/ロット時代の蓄積履歴が拾われない。
      //   対応: 以下の優先順位でマージ:
      //     (1) ind._growthRecords (API.individual.get の返り値で既にマージ済み)
      //     (2) Store.getGrowthRecords(ind_id) (個体化後の新規記録)
      //     (3) origin_unit_id / origin_unit_display_id + origin_unit_slot_no
      //         で unit 時代の記録を拾う (GAS getIndividual と同じマージ仕様)
      //     (4) origin_lot_id で lot 時代の記録を拾う (後方互換の救済)
      //   最終的に record_id で重複排除し、日付降順 + slice(0,8) で最新8件。
      var _indMergedRecs = [];
      var _seenRecIds = {};
      var _pushUnique = function(r){
        if (!r) return;
        var key = r.record_id || (r.record_date + '|' + (r.unit_slot_no||'') + '|' + (r.weight_g||''));
        if (_seenRecIds[key]) return;
        _seenRecIds[key] = true;
        _indMergedRecs.push(r);
      };
      // (1) API cache
      if (Array.isArray(ind._growthRecords)) ind._growthRecords.forEach(_pushUnique);
      // (2) 新 ind_id キー
      var _indSelfRecs = Store.getGrowthRecords(targetId) || [];
      _indSelfRecs.forEach(_pushUnique);
      // (3) origin_unit_id / origin_unit_display_id から unit 時代の記録
      try {
        var _originUnitId   = ind.origin_unit_id   || '';
        var _originUnitDisp = ind.origin_unit_display_id || '';
        // display_id が無い場合 BU レコードから引く
        if (!_originUnitDisp && _originUnitId) {
          var _unitObj = null;
          var _bus = (Store.getDB && Store.getDB('breeding_units')) || [];
          for (var _bi = 0; _bi < _bus.length; _bi++) {
            if (_bus[_bi] && _bus[_bi].unit_id === _originUnitId) { _unitObj = _bus[_bi]; break; }
          }
          if (_unitObj) _originUnitDisp = _unitObj.display_id || '';
        }
        var _slotNo = ind.origin_unit_slot_no;
        var _slotInt = (_slotNo !== '' && _slotNo !== null && _slotNo !== undefined) ? parseInt(_slotNo, 10) : null;
        // unit_id / display_id 両方のキーから取得
        [_originUnitId, _originUnitDisp].forEach(function(_key){
          if (!_key) return;
          var _list = Store.getGrowthRecords(_key) || [];
          _list.forEach(function(g){
            if (!g) return;
            // slot が指定されていれば厳密絞り込み、なければ全件
            if (_slotInt !== null && !isNaN(_slotInt)) {
              var _recSlot = parseInt(g.unit_slot_no, 10);
              if (_recSlot !== _slotInt) return;
            }
            _pushUnique(g);
          });
        });
      } catch (_e_unit_era) { console.warn('[LABEL] unit-era merge warn:', _e_unit_era.message); }
      // (4) origin_lot_id 救済
      try {
        if (ind.origin_lot_id) {
          var _lotList = Store.getGrowthRecords(ind.origin_lot_id) || [];
          _lotList.forEach(_pushUnique);
        }
      } catch (_e_lot_era) { console.warn('[LABEL] lot-era merge warn:', _e_lot_era.message); }
      console.log('[LABEL] IND records merged:', _indMergedRecs.length, 'items for', ind.display_id || targetId);

      // [20260424g] 最終的に日付×体重×スロットで重複排除 (record_id が違っても同イベントは統合)
      const records = (typeof UI !== 'undefined' && UI._gr_dedupe)
        ? UI._gr_dedupe(_indMergedRecs)
        : _indMergedRecs;
      // [20260422m] 孵化日フォールバック: ind.hatch_date → lot_id → origin_lot_id
      const _indHatch = _resolveLabelHatchDate({
        direct:      ind.hatch_date,
        lotId:       ind.lot_id,
        originLotId: ind.origin_lot_id,
        debugLabel:  'LABEL IND',
        debugInfo:   { ind_id: ind.ind_id, display_id: ind.display_id },
      });
      ld = {
        qr_text:      `IND:${ind.ind_id || targetId}`,
        display_id:   ind.display_id    || targetId,
        line_code:    line.line_code    || line.display_id || '',
        stage_code:   ind.current_stage || ind.stage_life  || '',
        sex:          ind.sex           || '',
        hatch_date:   _indHatch,
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
      const lot     = Store.getLot(targetId)     || {};
      const line    = Store.getLine(lot.line_id) || {};
      const records = Store.getGrowthRecords(targetId) || [];
      const isMolt  = lot.mat_molt === true || lot.mat_molt === 'true';
      const autoType= (lot.stage === 'EGG' || lot.stage === 'T0' || lot.stage === 'L1L2') ? 'egg_lot' : 'multi_lot';

      // [20260420m/n] 採卵日の取得 — 優先順位:
      //   1) lot.collect_date (20260421c 以降の構造化カラム) ← 最優先
      //   2) lot.hatch_date (egg-lot 運用で代用されていた経緯)
      //   3) lot.note から "採卵日: YYYY/MM/DD" を抽出 (既存データ救済)
      //   いずれも _normalizeDateForLabel で YYYY/MM/DD に統一
      var _lotCollectNorm = _normalizeDateForLabel(lot.collect_date);
      var _lotHatchNorm   = _normalizeDateForLabel(lot.hatch_date);
      var _noteCollectDate = '';
      if (!_lotCollectNorm && !_lotHatchNorm && lot.note) {
        var _noteMatch = String(lot.note).match(/採卵日[:：]?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
        if (_noteMatch) {
          _noteCollectDate = _normalizeDateForLabel(_noteMatch[1]);
        }
      }

      ld = {
        qr_text:      `LOT:${lot.lot_id || targetId}`,
        display_id:   lot.display_id    || targetId,
        line_code:    line.line_code    || line.display_id || '',
        stage_code:   lot.stage_life    || lot.stage       || '',
        hatch_date:   _lotHatchNorm     || '',
        count:        lot.count         || '',
        mat_type:     lot.mat_type      || '',
        mat_molt:     isMolt,
        sex_hint:     lot.sex_hint      || '',
        size_category:lot.size_category || '',
        note_private: lot.note_private  || '',
        // 採卵日の優先順位: collect_date > hatch_date > note抽出
        collect_date: _lotCollectNorm || _lotHatchNorm || _noteCollectDate || '',
        records:      records.slice().sort((a,b)=>String(b.record_date).localeCompare(String(a.record_date))).slice(0,8),
        label_type:   labelType || autoType,
      };
    } else if (targetType === 'PAR') {
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
        paternal_size: par.father_parent_size_mm ? par.father_parent_size_mm + 'mm' : '',
        maternal_size: par.mother_parent_size_mm ? par.mother_parent_size_mm + 'mm' : '',
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
          // [20260420k] 半角コロン → 全角コロンに統一
          _originLotsStr = '由来：' + short.join(' / ');
        }
      } catch(_e) {}

      // [20260420k] Mx (モルト) 判定ロジック — A案: 直近成長記録の has_malt を参照
      //   1) unit.unit_id または display_id の成長記録から最新の has_malt を取得
      //   2) 成長記録が無ければ mat_type === 'T2' でフォールバック判定
      //      (業務ルール: T2マットはモルトパウダー40%混合が必須)
      //   3) 例外時も (2) のフォールバックで安全側に倒す
      let _matMolt = false;
      try {
        const _unitIdForGrowth = unit.unit_id || _genDisplayId;
        let _grRecs = Store.getGrowthRecords ? Store.getGrowthRecords(_unitIdForGrowth) : null;
        if ((!_grRecs || !_grRecs.length) && unit.unit_id && unit.unit_id !== _genDisplayId) {
          _grRecs = Store.getGrowthRecords(_genDisplayId);
        }
        if (_grRecs && _grRecs.length > 0) {
          const _sortedGr = _grRecs.slice().sort(function(a,b){
            return String(b.record_date||'').localeCompare(String(a.record_date||''));
          });
          const _hm = _sortedGr[0].has_malt;
          _matMolt = (_hm === true || _hm === 'true' || _hm === 1 || _hm === '1');
        } else {
          _matMolt = (unit.mat_type === 'T2');
        }
      } catch(_mmErr) {
        _matMolt = (unit.mat_type === 'T2');
      }

      // [20260422m] 孵化日フォールバック: 共通ヘルパー _resolveLabelHatchDate を使用
      var _unitHatch = _resolveLabelHatchDate({
        direct:       unit.hatch_date,
        originLotId:  unit.origin_lot_id,
        sourceLots:   unit.source_lots,
        members:      unit.members,
        debugLabel:   'LABEL UNIT',
        debugInfo:    { unit_id: unit.unit_id, display_id: unit.display_id },
      });

      ld = {
        qr_text:       `BU:${_genDisplayId}`,
        display_id:    _genDisplayId,
        line_code:     unit.line_code || line.line_code || line.display_id || '',
        stage_code:    unit.stage_phase || 'T1',
        head_count:    unit.head_count  || 2,
        size_category: unit.size_category || '',
        hatch_date:    _unitHatch,
        mat_type:      unit.mat_type    || 'T1',
        mat_molt:      _matMolt,  // [20260420k] Mx表示用 (has_malt由来、未取得時はT2フォールバック)
        for_sale:      _genForSale,
        members:       unit.members     || [],
        records:       [],
        label_type:    't1_unit',
        note_private:  unit.note        || '',
        origin_lots_str: _originLotsStr,
        t1_date:       unit.t1_date     || unit.created_at || '',
      };
    } else if (targetType === 'IND_DRAFT') {
      const di   = _genIndDraft || {};
      const line = di.line_id ? (Store.getLine(di.line_id)||{}) : {};
      // [20260422m] 孵化日フォールバック: di.hatch_date → di.lot_id
      const _diHatch = _resolveLabelHatchDate({
        direct:     di.hatch_date,
        lotId:      di.lot_id,
        debugLabel: 'LABEL IND_DRAFT',
        debugInfo:  { lot_id: di.lot_id, lot_display_id: di.lot_display_id, lot_item_no: di.lot_item_no },
      });
      ld = {
        qr_text:      'IND:DRAFT',
        display_id:   `${di.lot_display_id||''}#${di.lot_item_no||'?'} DRAFT`,
        line_code:    di.line_code || line.line_code || line.display_id || '',
        stage_code:   di.stage_phase || 'T1',
        sex:          '',
        hatch_date:   _diHatch,
        mat_type:     di.mat_type  || 'T1',
        mat_molt:     false,
        size_category:di.size_category || '',
        note_private: `T1個別飼育 ${di.lot_display_id||''} #${di.lot_item_no||''}`,
        records:      [],
        label_type:   'ind_fixed',
        _isDraft:     true,
      };
    } else if (targetType === 'IND_FORMAL') {
      const fi   = _genFormalInd || {};
      const line = fi.line_id ? (Store.getLine(fi.line_id)||{}) : {};
      let _formalRecords = fi.records || [];
      if (_formalRecords.length === 0 && fi.weight_g) {
        const _t1d = fi.t1_date || (fi.session_date
          ? fi.session_date.replace(/-/g, '/')
          : new Date().toISOString().split('T')[0].replace(/-/g, '/'));
        _formalRecords = [{ record_date: _t1d, weight_g: fi.weight_g, exchange_type: 'FULL' }];
      }
      // [20260422m] 孵化日フォールバック: fi.hatch_date → fi.lot_id
      //   t1_session.js の formalInd 構築時点で hatch_date は含まれないため、
      //   fi.lot_id 経由で Store.getLot から孵化日を引く経路が必須。
      const _fiHatch = _resolveLabelHatchDate({
        direct:     fi.hatch_date,
        lotId:      fi.lot_id,
        debugLabel: 'LABEL IND_FORMAL',
        debugInfo:  { display_id: fi.display_id, lot_id: fi.lot_id, lot_display_id: fi.lot_display_id },
      });
      ld = {
        qr_text:      fi.display_id ? `IND:${fi.display_id}` : 'IND:FORMAL',
        display_id:   fi.display_id || `${fi.lot_display_id||''}#${fi.lot_item_no||'?'}`,
        line_code:    fi.line_code || line.line_code || line.display_id || '',
        stage_code:   fi.stage_phase || 'T1',
        sex:          fi.sex || '',
        hatch_date:   _fiHatch,
        mat_type:     fi.mat_type || 'T1',
        mat_molt:     false,
        size_category:fi.size_category || '',
        note_private: `T1個別飼育 ${fi.lot_display_id||''} #${fi.lot_item_no||''}`,
        records:      _formalRecords,
        label_type:   'ind_fixed',
      };
    } else {
      // SET
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
        father_blood:  (function(){ var r=_setFather.bloodline_raw||_setFather.paternal_raw||''; try{var a=JSON.parse(r);if(Array.isArray(a))return a.filter(Boolean).join(' ');}catch(_){} return r; })(),
        mother_blood:  (function(){ var r=_setMother.bloodline_raw||_setMother.paternal_raw||''; try{var a=JSON.parse(r);if(Array.isArray(a))return a.filter(Boolean).join(' ');}catch(_){} return r; })(),
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

  const qrText = ld.qr_text || (targetType + ':' + targetId);

  function _getQrDataUrl(text) {
    return new Promise(function(resolve) {
      var container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:120px;height:120px';
      document.body.appendChild(container);
      try {
        new QRCode(container, {
          text: text, width: 120, height: 120,
          colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M,
        });
      } catch(e) {
        console.error('[LABEL] qr build failed (constructor):', e.message);
        document.body.removeChild(container); resolve(''); return;
      }
      var attempts = 0, maxAttempts = 40;
      var poll = setInterval(function() {
        attempts++;
        var canvas = container.querySelector('canvas');
        var img    = container.querySelector('img');
        var dataUrl = '';
        if (canvas && canvas.width > 0) {
          try {
            var d = canvas.toDataURL('image/png');
            if (d && d.length > 200) {
              var ctx2 = canvas.getContext('2d');
              var imgData = ctx2 ? ctx2.getImageData(0, 0, canvas.width, canvas.height) : null;
              if (imgData) {
                var blackCount = 0;
                for (var pi = 0; pi < imgData.data.length; pi += 4) {
                  if (imgData.data[pi+3] > 16 && imgData.data[pi] < 64 && imgData.data[pi+1] < 64 && imgData.data[pi+2] < 64) blackCount++;
                }
                if (blackCount > 50) dataUrl = d;
              } else { if (d.length > 1000) dataUrl = d; }
            }
          } catch(e) {}
        }
        if (!dataUrl && img && img.src && img.src.startsWith('data:') && img.src.length > 500) {
          try {
            var tmpC2 = document.createElement('canvas'); tmpC2.width = 60; tmpC2.height = 60;
            var tmpCtx2 = tmpC2.getContext('2d'); var tmpImg2 = new Image(); tmpImg2.src = img.src;
            tmpCtx2.drawImage(tmpImg2, 0, 0, 60, 60);
            var tmpData2 = tmpCtx2.getImageData(0, 0, 60, 60); var tmpBlack2 = 0;
            for (var tpi = 0; tpi < tmpData2.data.length; tpi += 4) {
              if (tmpData2.data[tpi+3] > 16 && tmpData2.data[tpi] < 64 && tmpData2.data[tpi+1] < 64 && tmpData2.data[tpi+2] < 64) tmpBlack2++;
            }
            if (tmpBlack2 > 50) dataUrl = img.src;
          } catch(_imgErr) {}
        }
        if (dataUrl) {
          clearInterval(poll); document.body.removeChild(container); resolve(dataUrl); return;
        }
        if (attempts >= maxAttempts) {
          clearInterval(poll); document.body.removeChild(container); resolve('');
        }
      }, 50);
    });
  }

  (async function _lblRender() {
    try {
      var qrSrc = await _getQrDataUrl(qrText);
      var html = _buildLabelHTML(ld, qrSrc);
      var dims = _labelDimensions(ld.label_type, targetType);

      window._currentLabel = {
        displayId:  ld.display_id,
        fileName:   (ld.line_code ? ld.line_code.replace(/[^a-zA-Z0-9_-]/g,'_')+'_' : '')
                    + (ld.display_id||'label').replace(/[^a-zA-Z0-9_-]/g,'_') + '.png',
        html:       html,
        pngDataUrl: '',
        dims:       dims,
        labelType:  ld.label_type || '',
      };

      var _previewNow = document.getElementById('lbl-html-preview');
      if (!_previewNow) { console.error('[LABEL] lbl-html-preview missing'); return; }

      var ifrW = Math.round(dims.wPx * 1.5);
      var ifrH = Math.round(dims.hPx * 1.5);
      _previewNow.innerHTML = '<iframe srcdoc="' + html.replace(/"/g,'&quot;')
        + '" style="width:' + ifrW + 'px;height:' + ifrH + 'px;border:none;display:block" scrolling="no"></iframe>';

      var bar = document.getElementById('lbl-action-bar');
      if (bar) { bar.style.display = 'block'; bar.scrollIntoView({ behavior:'smooth', block:'nearest' }); }

      await new Promise(function(r){ setTimeout(r, 500); });

      var pngDataUrl = null;
      try { pngDataUrl = await _buildLabelPNG(html, dims); } catch(pngErr) {}

      var _skipComposite = (window._currentLabel && (
        window._currentLabel.labelType === 'parent' || window._currentLabel.labelType === 'set'
      ));
      if (pngDataUrl && qrSrc && !_skipComposite) {
        try { pngDataUrl = await _compositeQrOntoPng(pngDataUrl, qrSrc, dims); } catch(compErr) {}
      }

      if (pngDataUrl) {
        window._currentLabel.pngDataUrl = pngDataUrl;
        _previewNow.innerHTML = '<img src="' + pngDataUrl
          + '" style="max-width:100%;height:auto;border-radius:4px;display:block" alt="ラベルプレビュー">';
      }
    } catch(err) {
      console.error('[LABEL] label render failed:', err.message, err.stack);
      var errMount = document.getElementById('lbl-html-preview');
      if (errMount) errMount.innerHTML = '<div style="color:var(--red,#e05050);padding:16px;font-size:.8rem;text-align:center">⚠️ ラベル描画エラー<br><small>' + err.message + '</small></div>';
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

function _sexDisplay(sex) {
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
    + mHtml + '&nbsp;&#183;&nbsp;' + fHtml + '</span>';
}

function _qrBox(qrSrc, sizePx) {
  var sz = sizePx || 50;
  if (!qrSrc) {
    return '<div style="width:' + sz + 'px;height:' + sz + 'px;border:2px solid #000;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'font-size:7px;font-weight:700;color:#000;text-align:center;line-height:1.3">QR<br>ERR</div>';
  }
  return '<div style="background:#fff;padding:4px;display:inline-block;line-height:0;border:2px solid #000">'
    + '<img src="' + qrSrc + '" style="width:' + sz + 'px;height:' + sz + 'px;display:block"></div>';
}

function _buildLabelHTML(ld, qrSrc) {
  var lt = ld.label_type || 'ind_fixed';
  var noteShort = (ld.note_private||'').slice(0, 28);

  if (lt === 'set')      return _buildSetLabelHTML(ld, null, qrSrc);
  if (lt === 'parent')   return _buildParentLabelHTML(ld, null, qrSrc);
  if (lt === 't1_unit')  return _buildT1UnitLabelHTML(ld, null, qrSrc);
  if (lt === 'ind_sale') return _buildIndSaleLabelHTML(ld, qrSrc);

  var isLot   = lt === 'multi_lot' || lt === 'egg_lot';
  var chk     = _chkThermal;
  var sexCats = (ld.size_category||'').split(',').map(function(s){ return s.trim(); });
  var headerLabel = lt === 'ind_fixed' ? '個別飼育'
    : (lt === 'multi_lot' || lt === 'egg_lot') ? 'ロット'
    : lt === 't1_unit' ? 'ユニット' : '個別飼育';

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
    ? rawId.slice(0, rawId.indexOf(lineBadge)).replace(/-$/, '') : '';

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

  // [20260422m] tdU padding 6px → 4px に縮小 (下部カットオフ解消)
  //   交換セルの「□全/□追」2行表示で行高が ふくらんでいたため全体が 70mm を
  //   超えて最下行の枠が印刷されない問題を解消。
  var tdU = 'border:1.5px solid #000;padding:4px 2px;font-size:8px;font-weight:700;color:#000;text-align:center';
  var thS = 'border:1.5px solid #000;padding:2px 2px;font-size:7.5px;font-weight:700;background:#000;color:#fff;text-align:center';

  var rowsHtml = '';
  for (var i = 0; i < 4; i++) {
    var lRec = leftCol[i], rRec = rightCol[i];
    var lDate = lRec ? String(lRec.record_date||'').slice(5) : '';
    var lWt   = lRec ? (lRec.weight_g ? String(lRec.weight_g) : '') : '';
    var rDate = rRec ? String(rRec.record_date||'').slice(5) : '';
    var rWt   = rRec ? (rRec.weight_g ? String(rRec.weight_g) : '') : '';
    var lExch = '', rExch = '';
    if (lRec) { var le = lRec.exchange_type||''; lExch = ((le==='FULL'||le==='全')?'■':'□')+'全<br>'+((le==='ADD'||le==='追')?'■':'□')+'追'; }
    if (rRec) { var re2 = rRec.exchange_type||''; rExch = ((re2==='FULL'||re2==='全')?'■':'□')+'全<br>'+((re2==='ADD'||re2==='追')?'■':'□')+'追'; }
    rowsHtml += '<tr>'
      + '<td style="' + tdU + '">' + (lDate || '&nbsp;') + '</td>'
      + '<td style="' + tdU + ';position:relative">' + (lWt || '&nbsp;')
        + '<span style="position:absolute;bottom:1px;right:2px;font-size:5px;font-weight:700;color:#000">g</span></td>'
      + '<td style="' + tdU + '">' + (lExch || '□全<br>□追') + '</td>'
      + '<td style="width:1.5px;background:#000;padding:0"></td>'
      + '<td style="' + tdU + '">' + (rDate || '&nbsp;') + '</td>'
      + '<td style="' + tdU + ';position:relative">' + (rWt || '&nbsp;')
        + '<span style="position:absolute;bottom:1px;right:2px;font-size:5px;font-weight:700;color:#000">g</span></td>'
      + '<td style="' + tdU + '">' + (rExch || '□全<br>□追') + '</td>'
      + '</tr>';
  }

  var bLg = 'display:inline-block;border:1.5px solid #000;border-radius:3px;padding:0 4px;font-size:12px;font-weight:700;color:#000;margin-right:2px;line-height:1.5';
  var lineBadgeHtml = lineBadge ? '<span style="' + bLg + '">' + lineBadge + '</span>' : '';
  var lotSuffixHtml = lotSuffix ? '<span style="' + bLg + '">' + lotSuffix + '</span>' : '';
  var countBadge = (isLot && ld.count)
    ? '<span style="display:inline-block;border:2px solid #000;border-radius:3px;padding:0 3px;font-size:13px;font-weight:700;color:#000;line-height:1.4">' + ld.count + '頭</span>' : '';
  var sexHtml = !isLot ? _sexDisplay(ld.sex || '') : '';
  // [20260420j] 孵化日を正規化してから表示（Date.toString() 形式も YYYY/MM/DD に統一）
  // [20260420i] 孵化日を目立たせる: 6.5px → 8px、表記を「孵: YYYY-MM-DD」→「孵化日：YYYY/MM/DD」
  // [20260422m] 個体ラベル (isLot=false) のときは常時表示 (空なら手書き欄)
  //   line-height を 1.6 → 1.3 に圧縮して表領域を確保
  var _hatchNorm = _normalizeDateForLabel(ld.hatch_date);
  var _hatchDisp = _hatchNorm || '____/__/__';
  var hatchHtml = !isLot
    ? '<div style="font-size:8px;font-weight:700;color:#000;line-height:1.3">孵化日：' + _hatchDisp + '</div>'
    : '';
  var mxHtml = showMx
    ? '<div style="font-size:7px;font-weight:700;color:#000;line-height:1.7">Mx:' + chk('ON', mxIsOn) + chk('OFF', !mxIsOn) + '</div>' : '';

  var _bodyH = isLot ? '40mm' : '70mm';
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
        + '<span style="position:relative;z-index:1">' + headerLabel + ' | HerculesOS</span></div>\n'
      : '  <div style="background:#000;color:#fff;font-size:9px;font-weight:700;padding:0.8mm 2mm;height:5mm;display:flex;align-items:center;flex-shrink:0">'
        + headerLabel + ' | HerculesOS</div>\n')
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
    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.7">区分:'
    + chk('大',sexCats.indexOf('大')>=0) + chk('中',sexCats.indexOf('中')>=0) + chk('小',sexCats.indexOf('小')>=0) + '</div>\n'
    // [20260420i] M行と Mx行を統合: 横並びで1行に収める（孵化日行追加により行数節約）
    + '      <div style="display:flex;align-items:center;gap:3mm;font-size:7px;font-weight:700;color:#000;line-height:1.7">\n'
    + '        <span>M:'
    + ['T0','T1','T2','T3'].map(function(m){ return chk(m,ld.mat_type===m); }).join('')
    + '</span>\n'
    + (showMx
      ? '        <span>Mx:' + chk('ON', mxIsOn) + chk('OFF', !mxIsOn) + '</span>\n'
      : '')
    + '      </div>\n'
    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.7">St:'
    + _stageCheckboxRow(ld.stage_code) + '</div>\n'
    + '    </div>\n  </div>\n'
    + (isLot ? (
      '  <div style="border-top:2px solid #000;margin:1mm 1.5mm 0"></div>\n'
      + '  <div style="padding:1.5mm 2mm;flex:1;display:flex;flex-direction:column;justify-content:space-evenly">\n'
      + '    <pre style="font-family:monospace;font-size:17px;font-weight:700;color:#000;margin:0 0 4px;line-height:1.5;white-space:pre">採卵日  ' + (ld.collect_date ? ld.collect_date.replace(/-/g,'/') : '____/__/__') + '</pre>\n'
      + '    <pre style="font-family:monospace;font-size:17px;font-weight:700;color:#000;margin:0;line-height:1.5;white-space:pre">孵化日  ' + (ld.hatch_date ? _normalizeDateForLabel(ld.hatch_date) : '____/__/__') + '</pre>\n'
      + '  </div>\n'
    ) : (
      '  <div style="border-top:1.5px solid #000;margin:0.8mm 1.5mm 0"></div>\n'
      + '  <div style="flex:1;padding:0 1.5mm 0.5mm;overflow:hidden">\n'
      + '    <table style="width:100%;border-collapse:collapse;table-layout:fixed">\n'
      + '      <thead><tr>'
      + '<th style="' + thS + '">日付</th><th style="' + thS + '">体重</th><th style="' + thS + '">交換</th>'
      + '<th style="width:1.5px;background:#000;padding:0"></th>'
      + '<th style="' + thS + '">日付</th><th style="' + thS + '">体重</th><th style="' + thS + '">交換</th>'
      + '</tr></thead>\n'
      + '      <tbody>' + rowsHtml + '</tbody>\n    </table>\n  </div>\n'
    ))
    + (noteShort ? '  <div style="padding:0.5mm 2mm 1mm;font-size:7px;font-weight:700;color:#000;overflow:hidden;white-space:nowrap">📝 ' + noteShort + '</div>\n' : '')
    + '</div>\n</body></html>';
}

function _buildParentLabelHTML(ld, _unused, qrSrc) {
  var qr = (typeof _unused === 'string' && _unused.startsWith('data:')) ? _unused : qrSrc;
  var rawId    = ld.display_id || '';
  var idParts  = rawId.split('-');
  var idCode   = idParts.length >= 2 ? idParts[idParts.length - 1] : rawId;
  var sizeStr  = ld.size_mm ? String(ld.size_mm).replace(/mm$/, '') + 'mm' : '';
  var ecStr    = ld.eclosion_date || '';
  var feedStr  = ld.feeding_date  || '';
  var sexColor = ld.sex === '♂' ? '#1a6bb5' : ld.sex === '♀' ? '#b51a5a' : '#000';
  var badgeFz  = idCode.length <= 1 ? '32px' : idCode.length <= 2 ? '24px' : '16px';
  var BLANK_DATE = '/ /';
  var ecDisp   = ecStr   ? ecStr   : BLANK_DATE;
  var feedDisp = feedStr ? feedStr : BLANK_DATE;
  var patStr  = ld.paternal_raw  || '';
  var patSize = ld.paternal_size ? ' (' + ld.paternal_size + ')' : '';
  var matStr  = ld.maternal_raw  || '';
  var matSize = ld.maternal_size ? ' (' + ld.maternal_size + ')' : '';
  var titleStr = rawId + (sizeStr ? '  (' + sizeStr + ')' : '');
  var qrImgTag = qr
    ? '<img src="' + qr + '" style="width:38px;height:38px;display:block;line-height:0">'
    : '<div style="width:38px;height:38px;border:1px dashed #ccc;font-size:5px;display:flex;align-items:center;justify-content:center">QR</div>';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 25mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:25mm; font-family:sans-serif; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:25mm;display:flex;flex-direction:column;padding:1mm 2mm 0mm">\n'
    + '  <div style="display:flex;flex-direction:row;align-items:center;gap:2mm;flex-shrink:0">\n'
    + '    <div style="display:flex;flex-direction:row;align-items:center;gap:1.5mm;flex-shrink:0">\n'
    + '      <div style="flex-shrink:0;line-height:0">' + qrImgTag + '</div>\n'
    + '      <div style="font-size:26px;font-weight:900;line-height:1;color:' + sexColor + ';flex-shrink:0">' + (ld.sex||'') + '</div>\n'
    + '      <div style="border:2.5px solid #000;border-radius:3px;font-size:' + badgeFz + ';font-weight:900;line-height:1;width:11mm;height:11mm;display:flex;align-items:center;justify-content:center;flex-shrink:0">' + idCode + '</div>\n'
    + '    </div>\n'
    + '    <div style="width:1px;background:#ccc;align-self:stretch;margin:0;flex-shrink:0"></div>\n'
    + '    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:1.5mm;padding-left:1mm">\n'
    + '      <div style="font-family:monospace;font-size:10px;font-weight:900;letter-spacing:.2px;white-space:nowrap">' + titleStr + '</div>\n'
    + '      <div style="display:flex;align-items:baseline;gap:2mm"><span style="font-size:7px;font-weight:700;min-width:7mm;color:#555;white-space:nowrap">羽化日</span>'
    + '<span style="font-size:9.5px;font-weight:700;border-bottom:1px solid #888;display:inline-block;width:20mm;padding-bottom:1px;text-align:right">' + ecDisp + '</span></div>\n'
    + '      <div style="display:flex;align-items:baseline;gap:2mm"><span style="font-size:7px;font-weight:700;min-width:7mm;color:#555;white-space:nowrap">後食日</span>'
    + '<span style="font-size:9.5px;font-weight:700;border-bottom:1px solid #888;display:inline-block;width:20mm;padding-bottom:1px;text-align:right">' + feedDisp + '</span></div>\n'
    + '    </div>\n  </div>\n'
    + '  <div style="border-top:1px solid #aaa;margin:1mm 0 0.8mm"></div>\n'
    + '  <div style="display:flex;flex-direction:column;gap:0.8mm">\n'
    + '    <div style="display:flex;align-items:flex-start;gap:1.5mm"><span style="font-size:7px;font-weight:900;color:#1a6bb5;min-width:5mm;flex-shrink:0;line-height:1.5">♂親</span>'
    + '<span style="font-size:6.5px;flex:1;word-break:break-all;line-height:1.45">' + (patStr ? patStr + patSize : '______________________________') + '</span></div>\n'
    + '    <div style="display:flex;align-items:flex-start;gap:1.5mm"><span style="font-size:7px;font-weight:900;color:#b51a5a;min-width:5mm;flex-shrink:0;line-height:1.5">♀親</span>'
    + '<span style="font-size:6.5px;flex:1;word-break:break-all;line-height:1.45">' + (matStr ? matStr + matSize : '______________________________') + '</span></div>\n'
    + '  </div>\n</div>\n</body></html>';
}

// ════════════════════════════════════════════════════════════════
// [20260420g] 販売候補・簡易ラベル (62×25mm — 最小サイズ版)
// ════════════════════════════════════════════════════════════════
// 設計方針:
//   - 62×25mm の最小サイズ（種親ラベルと同サイズ）
//   - 販売仕分け作業に必要な最低限の情報のみ
//   - 詳細情報はQRコードをアプリでスキャンして確認する運用
//
// 表示項目（4行構成）:
//   ヘッダー (3.5mm): 🏷️ 販売 | HerculesOS — オレンジストライプ
//   左側: QRコード (48px) — スキャンで詳細画面に飛ぶ
//   右・1行目: 個体ID (バッジ) + 性別 (♂/♀色付き大)
//   右・2行目: 孵化日： YY/M/D ← IDの直下に配置（[20260420h]で3行目から移動）
//   右・3行目: サイズ区分(大/中/小) + 体重 + 測定日(M/D)
//   右・4行目: ステージ
// ════════════════════════════════════════════════════════════════
function _buildIndSaleLabelHTML(ld, qrSrc) {
  var chk = _chkThermal;
  var rawId = ld.display_id || '';
  var sex = ld.sex || '不明';
  var sexColor = sex === '♂' ? '#1a6bb5' : sex === '♀' ? '#b51a5a' : '#666';
  var sexChar  = sex === '♂' ? '♂' : sex === '♀' ? '♀' : '?';

  var idParts   = rawId.split('-');
  var lineBadge = ld.line_code || '';
  var lotSuffix = '';
  if (lineBadge && rawId.includes('-' + lineBadge + '-')) {
    lotSuffix = rawId.slice(rawId.indexOf('-' + lineBadge + '-') + ('-' + lineBadge + '-').length);
  } else if (idParts.length >= 3) {
    lotSuffix = idParts.slice(2).join('-');
  }
  var prefix = lineBadge && rawId.includes(lineBadge)
    ? rawId.slice(0, rawId.indexOf(lineBadge)).replace(/-$/, '') : '';

  // サイズ区分 (コンパクト)
  var sizeCats = (ld.size_category||'').split(',').map(function(s){ return s.trim(); });
  var sizeHtml = '<span style="font-size:7.5px;font-weight:700;color:#000">'
    + chk('大', sizeCats.indexOf('大')>=0)
    + chk('中', sizeCats.indexOf('中')>=0)
    + chk('小', sizeCats.indexOf('小')>=0) + '</span>';

  // 最新体重 + 測定日を records 配列から取得（日付降順で先頭）
  var records = ld.records || [];
  var latestW = '';
  var latestDate = '';
  if (records.length > 0) {
    var sorted = records.slice().sort(function(a,b){
      return String(b.record_date||'').localeCompare(String(a.record_date||''));
    });
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i].weight_g) {
        latestW = sorted[i].weight_g;
        latestDate = sorted[i].record_date || '';
        break;
      }
    }
  }
  if (!latestW && ld.latest_weight_g) latestW = ld.latest_weight_g;

  // 測定日を M/D 形式に短縮（2026-04-21 → 4/21）
  var measDateShort = '';
  if (latestDate) {
    var dp = String(latestDate).replace(/-/g,'/').split('/');
    if (dp.length === 3) {
      var mm = parseInt(dp[1], 10);
      var dd = parseInt(dp[2], 10);
      if (!isNaN(mm) && !isNaN(dd)) measDateShort = mm + '/' + dd;
    }
  }

  // 孵化日を YYYY/M/D 形式に整形（2025-12-05 → 2025/12/5、年は4桁）
  // [20260421f] ユーザー要望により年は4桁表記（旧: 25/12/5 → 新: 2025/12/5）
  // [20260420j] Date.toString() 形式も受け付けるため _normalizeDateForLabel で先に YYYY/MM/DD に統一
  var hatchDisp = _normalizeDateForLabel(ld.hatch_date);
  var hatchShort = '';
  if (hatchDisp) {
    var hp = hatchDisp.split('/');
    if (hp.length === 3) {
      var yyyy = hp[0].length === 4 ? hp[0] : ('20' + hp[0]);
      var hm = parseInt(hp[1], 10);
      var hd = parseInt(hp[2], 10);
      if (!isNaN(hm) && !isNaN(hd)) hatchShort = yyyy + '/' + hm + '/' + hd;
    }
  }

  // ステージ
  var stageCode = ld.stage_code || '';
  var stageLabel = stageCode === 'L1L2' ? 'L1L2'
    : stageCode === 'L3'     ? 'L3'
    : stageCode === 'PREPUPA'|| stageCode === '前蛹' ? '前蛹'
    : stageCode === 'PUPA'   || stageCode === '蛹'   ? '蛹'
    : stageCode === 'ADULT'  || stageCode === '成虫' ? '成虫'
    : stageCode;

  // ID バッジ (25mmに収めるため小さめ)
  var bLg = 'display:inline-block;border:1.3px solid #000;border-radius:3px;padding:0 3px;font-size:10px;font-weight:800;color:#000;line-height:1.3';
  var lineBadgeHtml = lineBadge ? '<span style="' + bLg + '">' + lineBadge + '</span>' : '';
  var lotSuffixHtml = lotSuffix ? '<span style="' + bLg + '">' + lotSuffix + '</span>' : '';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 25mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:25mm; font-family:sans-serif; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:25mm;display:flex;flex-direction:column">\n'

    // ヘッダー (3.5mm・オレンジストライプで「販売候補」と視覚的に識別)
    + '  <div style="position:relative;background:#000;color:#fff;font-size:7.5px;font-weight:700;padding:0.3mm 2mm;height:3.5mm;display:flex;align-items:center;flex-shrink:0;overflow:hidden">'
    + '    <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(45deg,transparent 0,transparent 4px,rgba(255,180,80,0.38) 4px,rgba(255,180,80,0.38) 6px);pointer-events:none"></span>'
    + '    <span style="position:relative;z-index:1">🏷️ 販売候補 | HerculesOS</span>'
    + '  </div>\n'

    // メインエリア (QRと情報を横並び・残り 21.5mm)
    + '  <div style="display:flex;padding:1mm 1.5mm 0.5mm;gap:1.5mm;flex:1;min-height:0">\n'

    // QR (左, 48px = 約12.7mm)
    + '    <div style="flex-shrink:0;display:flex;align-items:center">' + _qrBox(qrSrc, 48) + '</div>\n'

    // 情報エリア (右)
    + '    <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:0.3mm;padding-left:1mm;border-left:1.5px solid #000">\n'

    // 1行目: ID + 性別
    + '      <div style="display:flex;justify-content:space-between;align-items:center;gap:1mm;line-height:1.1">\n'
    + '        <div style="display:flex;align-items:center;gap:1.5px;flex-wrap:nowrap;min-width:0;overflow:hidden">'
    + (prefix ? '<span style="font-size:7px;font-weight:700;color:#000;white-space:nowrap">' + prefix + '-</span>' : '')
    + lineBadgeHtml + lotSuffixHtml
    + '</div>\n'
    + '        <span style="font-size:14px;font-weight:900;color:' + sexColor + ';line-height:1;flex-shrink:0">' + sexChar + '</span>\n'
    + '      </div>\n'

    // 2行目: 孵化日 (ID直下に配置)
    + (hatchShort
      ? '      <div style="font-size:7.5px;font-weight:700;color:#000;white-space:nowrap;line-height:1.1">孵化日：' + hatchShort + '</div>\n'
      : '')

    // 3行目: サイズ + 体重(測定日)
    + '      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:1mm;line-height:1.1">\n'
    + '        <div>' + sizeHtml + '</div>\n'
    + (latestW
      ? '        <div style="font-size:10.5px;font-weight:900;color:#000;line-height:1;white-space:nowrap">'
        + latestW + '<span style="font-size:7.5px;margin-left:0.5px">g</span>'
        + (measDateShort ? '<span style="font-size:7px;font-weight:700;margin-left:1.5px">(' + measDateShort + ')</span>' : '')
        + '</div>\n'
      : '')
    + '      </div>\n'

    // 4行目: ステージ
    + (stageLabel
      ? '      <div style="line-height:1;margin-top:0.2mm"><span style="display:inline-block;border:1.2px solid #000;border-radius:2px;padding:0 3px;font-size:7.5px;font-weight:800;color:#000;line-height:1.3">' + stageLabel + '</span></div>\n'
      : '')

    + '    </div>\n'
    + '  </div>\n'
    + '</div>\n</body></html>';
}

function _buildSetLabelHTML(ld, _unused, qrSrc) {
  var qr = (typeof _unused === 'string' && _unused.startsWith('data:')) ? _unused : qrSrc;
  var rawId  = ld.display_id || '';
  var _rawLC = ld.line_code  || '';
  function _extractLineCode(s) {
    if (!s || /^SET-/i.test(s)) return '';
    var m = s.match(/^[A-Za-z]{1,4}\d{4}-([A-Za-z][0-9]+)$/);
    if (m) return m[1];
    if (/^[A-Za-z][0-9]+$/.test(s)) return s;
    var p = s.split('-').filter(Boolean);
    return p.length >= 2 ? p[p.length - 1] : s;
  }
  var lineCode = _extractLineCode(_rawLC);
  var badgeFz  = lineCode.length <= 1 ? '28px' : lineCode.length <= 2 ? '22px' : '14px';
  var fInfo  = ld.father_info  || '—';
  var mInfo  = ld.mother_info  || '—';
  var fSize  = ld.father_size  ? ' (' + ld.father_size  + ')' : '';
  var mSize  = ld.mother_size  ? ' (' + ld.mother_size  + ')' : '';
  var fBlood = ld.father_blood ? ld.father_blood.slice(0, 26) : '';
  var mBlood = ld.mother_blood ? ld.mother_blood.slice(0, 26) : '';
  var qrImgTag = qr
    ? '<img src="' + qr + '" style="width:36px;height:36px;display:block;line-height:0">'
    : '<div style="width:36px;height:36px;border:1px dashed #ccc;font-size:5px;display:flex;align-items:center;justify-content:center">QR</div>';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 35mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:35mm; font-family:sans-serif; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:35mm;display:flex;flex-direction:column">\n'
    + '  <div style="background:#000;color:#fff;font-size:7.5px;font-weight:700;padding:0 2mm;height:4.5mm;display:flex;align-items:center;flex-shrink:0;letter-spacing:.5px">産卵セット | HerculesOS</div>\n'
    + '  <div style="display:flex;flex:1;overflow:hidden">\n'
    + '    <div style="flex-shrink:0;width:15mm;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;padding:0.4mm 0.5mm;border-right:1.5px solid #000">\n'
    + (lineCode
      ? '      <div style="border:2.5px solid #000;border-radius:3px;font-size:' + badgeFz + ';font-weight:900;width:11mm;height:11mm;display:flex;align-items:center;justify-content:center;letter-spacing:-0.5px;line-height:1">' + lineCode + '</div>\n'
      : '      <div style="width:11mm;height:11mm;border:1px dashed #ccc;border-radius:3px"></div>\n')
    + '      <div style="line-height:0">' + qrImgTag + '</div>\n    </div>\n'
    + '    <div style="flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden">\n'
    + '      <div style="padding:0.5mm 1.5mm 0.3mm;border-bottom:1.5px solid #000;flex-shrink:0">\n'
    + '        <div style="font-family:monospace;font-size:8px;font-weight:800;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + rawId + '</div>\n'
    + (ld.pairing_start ? '        <div style="font-size:6.5px;color:#444;font-weight:600">ペアリング: ' + ld.pairing_start + '</div>\n' : '')
    + '      </div>\n'
    + '      <div style="padding:0.2mm 1.5mm;border-bottom:1px solid #ddd;flex:1;display:flex;flex-direction:column;justify-content:center">\n'
    + '        <div style="display:flex;align-items:baseline;gap:2px"><span style="font-size:9px;font-weight:900;color:#1a6bb5;flex-shrink:0">♂</span>'
    + '<span style="font-size:8px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + fInfo + fSize + '</span></div>\n'
    + (fBlood ? '        <div style="font-size:6.5px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + fBlood + '</div>\n'
             : '        <div style="font-size:6.5px;color:#bbb">—</div>\n')
    + '      </div>\n'
    + '      <div style="padding:0.2mm 1.5mm;flex:1;display:flex;flex-direction:column;justify-content:center">\n'
    + '        <div style="display:flex;align-items:baseline;gap:2px"><span style="font-size:9px;font-weight:900;color:#b51a5a;flex-shrink:0">♀</span>'
    + '<span style="font-size:8px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + mInfo + mSize + '</span></div>\n'
    + (mBlood ? '        <div style="font-size:6.5px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + mBlood + '</div>\n'
             : '        <div style="font-size:6.5px;color:#bbb">—</div>\n')
    + '      </div>\n    </div>\n  </div>\n</div>\n</body></html>';
}

// ── T1飼育ユニットラベル（62mm × 70mm）──────────────────────────
// Bug 1 修正: 性別未判別時は ♂・♀ を表示
function _buildT1UnitLabelHTML(ld, _unused, qrSrc) {
  var qr       = (typeof _unused === 'string' && _unused.startsWith('data:')) ? _unused : qrSrc;
  var chk      = _chkThermal;
  var forSale  = !!ld.for_sale;
  var hc       = ld.head_count || 2;
  var sizeCats = (ld.size_category||'').split(',').map(function(s){ return s.trim(); });
  var mat      = ld.mat_type || 'T1';
  var lineCode = ld.line_code || '';
  var originLS = ld.origin_lots_str || '';
  var _t1DateRaw = (ld.t1_date || '').replace(/\\/g, '/');
  var _t1DatePart = _t1DateRaw.split(' ')[0];
  var _t1DateM = _t1DatePart.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  var _t1DateM2 = !_t1DateM ? _t1DatePart.match(/^(\d{1,2})[\/-](\d{1,2})$/) : null;
  var t1Date = _t1DateM ? (parseInt(_t1DateM[2],10) + '/' + parseInt(_t1DateM[3],10))
             : _t1DateM2 ? (parseInt(_t1DateM2[1],10) + '/' + parseInt(_t1DateM2[2],10))
             : _t1DatePart;

  var rawId = ld.display_id || '';
  var idParts = rawId.split('-');
  var prefix = '', unitSuffix = '';
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

  // ── [20260418d] ユニット性別表示: 頭数カウント式 ─────────────
  // ♂0/♀0 → 「♂・♀」（未判別）
  // ♂1/♀0 → 「♂1・♀」
  // ♂2/♀0 → 「♂2・♀」
  // ♂1/♀1 → 「♂1・♀1」
  // ♂2/♀1 → 「♂2・♀1」
  // 判別済みの性別は頭数を必ず付ける（1頭でも省略しない）
  //
  // 注意: ld.members は配列またはJSON文字列で渡される可能性があるので正規化する
  var _members = ld.members;
  if (typeof _members === 'string' && _members.trim()) {
    try { _members = JSON.parse(_members); } catch (_) { _members = []; }
  }
  if (!Array.isArray(_members)) _members = [];

  // 正規化後の配列から m0/m1 を再取得
  var m0 = _members[0] || null;
  var m1 = _members[1] || null;
  var m0w   = m0 && m0.weight_g ? String(m0.weight_g) : '';
  var m1w   = m1 && m1.weight_g ? String(m1.weight_g) : '';
  var m0sex = m0 ? (m0.sex || '') : '';
  var m1sex = m1 ? (m1.sex || '') : '';

  var _maleCnt   = _members.filter(function(m) { return m && m.sex === '♂'; }).length;
  var _femaleCnt = _members.filter(function(m) { return m && m.sex === '♀'; }).length;
  var _totalDetermined = _maleCnt + _femaleCnt;

  var unitSexHtml;
  if (_totalDetermined === 0) {
    // 誰も判別していない
    unitSexHtml = '<span style="font-size:11px;font-weight:700;color:#000">&#9794;&#183;&#9792;</span>';
  } else {
    // 判別済みなら頭数を必ず付ける（♂N・♀N形式、1頭でも省略しない）
    var _maleSide   = '&#9794;' + (_maleCnt > 0 ? _maleCnt : '');
    var _femaleSide = '&#9792;' + (_femaleCnt > 0 ? _femaleCnt : '');
    unitSexHtml = '<span style="font-size:11px;font-weight:700;color:#000">'
      + _maleSide + '&#183;' + _femaleSide + '</span>';
  }

  // [20260420k] Mx は常時表示に変更（showMx 条件分岐を削除）
  //             mxIsOn は _lblGenerate の UNIT ブランチで has_malt から計算済み
  var mxIsOn = ld.mat_molt === true || ld.mat_molt === 'true';

  // [20260420k] マージン無しのコンパクト版チェックボックス（&nbsp; で区切る前提）
  function chkC(label, checked) {
    return (checked ? '■' : '□') + label;
  }

  var tdU = 'border:1.5px solid #000;padding:4px 2px;font-size:8px;font-weight:700;color:#000;text-align:center';
  var thS = 'border:1.5px solid #000;padding:2px 2px;font-size:7.5px;font-weight:700;background:#000;color:#fff;text-align:center';

  function _wgtCell(wgt) {
    return '<td style="' + tdU + ';position:relative">'
      + (wgt ? wgt : '&nbsp;')
      + '<span style="position:absolute;bottom:1px;right:2px;font-size:5px;font-weight:700;color:#000">g</span></td>';
  }

  var rowsHtml = '';
  for (var ri = 0; ri < 4; ri++) {
    var isT1Row = (ri === 0);
    rowsHtml += '<tr>'
      + '<td style="' + tdU + '">' + (isT1Row && t1Date ? t1Date : '&nbsp;') + '</td>'
      + _wgtCell(isT1Row ? m0w : '')
      + _wgtCell(isT1Row ? m1w : '')
      + '<td style="' + tdU + '">' + (isT1Row ? '■全<br>□追' : '□全<br>□追') + '</td>'
      + '</tr>';
  }

  var bLg = 'display:inline-block;border:1.5px solid #000;border-radius:3px;padding:0 4px;font-size:12px;font-weight:700;color:#000;margin-right:2px;line-height:1.5';
  var countBadge = '<span style="display:inline-block;border:2px solid #000;border-radius:3px;padding:0 3px;font-size:13px;font-weight:700;color:#000;line-height:1.4">' + hc + '頭</span>';
  var lineBadgeHtml  = lineCode   ? '<span style="' + bLg + '">' + lineCode   + '</span>' : '';
  var unitSuffixHtml = unitSuffix ? '<span style="' + bLg + '">' + unitSuffix + '</span>' : '';
  var saleBadge = forSale
    ? '<span style="border:1.5px solid #000;padding:0 3px;font-size:7px;font-weight:700;color:#000;margin-left:3px">販売</span>' : '';

  // [20260420k] 孵化日フォント 7.5px → 8px + line-height 1.5 → 1.3 + padding-right:13mm
  //             padding-right は絶対配置の頭数+性別ボックスと重ならないため
  // [20260422k] 孵化日が空でも手書き欄 (____/__/__) を常時表示
  //   以前は _hatchNormU が falsy だと行自体を消していたが、
  //   印刷後に書き足したいケースや、親ロットも hatch_date 未設定のケースに対応。
  var _hatchNormU = _normalizeDateForLabel(ld.hatch_date);
  var _hatchDispU = _hatchNormU || '____/__/__';
  var hatchHtml = '<div style="font-size:8px;font-weight:700;color:#000;line-height:1.3;padding-right:13mm">孵化日：'
    + _hatchDispU + '</div>';
  var originHtml = originLS
    ? '<div style="font-size:6px;font-weight:700;color:#000;line-height:1.4">' + originLS + '</div>' : '';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
    + '  @page { size: 62mm 70mm; margin: 0; }\n'
    + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
    + '  body { width:62mm; height:70mm; font-family:sans-serif; font-size:7px; background:#fff; color:#000; overflow:hidden; }\n'
    + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
    + '</style></head><body>\n'
    + '<div style="width:62mm;height:70mm;display:flex;flex-direction:column">\n'
    + '  <div style="position:relative;background:#000;color:#fff;font-size:9px;font-weight:700;padding:0.8mm 2mm;height:5mm;display:flex;align-items:center;flex-shrink:0;overflow:hidden">'
    + '<span style="position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(45deg,transparent 0,transparent 4px,rgba(255,255,255,0.28) 4px,rgba(255,255,255,0.28) 6px);pointer-events:none"></span>'
    + '<span style="position:relative;z-index:1">ユニット | HerculesOS' + saleBadge + '</span></div>\n'
    // [20260420k] outer padding 1mm → 0.5mm で上詰め
    + '  <div style="display:flex;padding:0.5mm 1.5mm 0;gap:0;flex-shrink:0">\n'
    + '    <div style="flex-shrink:0;margin-right:1.5mm">' + _qrBox(qr, 44) + '</div>\n'
    // [20260420k] position:relative を追加（absolute 配置の頭数+性別ボックスの基準点）
    + '    <div style="flex:1;min-width:0;padding-left:1.5mm;border-left:2px solid #000;position:relative">\n'
    // [20260420k] 頭数+性別を absolute 配置で右上固定（ID/孵化日と横並びに見せる）
    + '      <div style="position:absolute;top:0;right:0;display:flex;flex-direction:column;align-items:center;gap:1px">'
    + countBadge
    + (unitSexHtml ? '<div style="font-size:9px;font-weight:700;color:#000;text-align:center">' + unitSexHtml + '</div>' : '')
    + '</div>\n'
    // [20260420k] ID行: countBadge 並置を解除、padding-right:13mm で absolute 領域と衝突回避
    + '      <div style="display:flex;align-items:center;white-space:nowrap;overflow:hidden;padding-right:13mm;line-height:1.3">'
    + (prefix ? '<span style="font-size:7px;font-weight:700;color:#000;margin-right:1px;flex-shrink:0">' + prefix + '-</span>' : '')
    + lineBadgeHtml + unitSuffixHtml + '</div>\n'
    // 孵化日 (padding-right は hatchHtml 側のインラインスタイルで設定済み)
    + '      ' + hatchHtml + '\n'
    // 由来 (フル幅、absolute 領域は孵化日の下で終わる想定)
    + '      ' + originHtml + '\n'
    // [20260420k] 区分: → 区分： + &nbsp; 区切り
    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.6">区分：'
    + chkC('大', sizeCats.indexOf('大')>=0) + '&nbsp;'
    + chkC('中', sizeCats.indexOf('中')>=0) + '&nbsp;'
    + chkC('小', sizeCats.indexOf('小')>=0) + '</div>\n'
    // [20260420k] M + Mx を 1行に統合、全角コロン、&nbsp; 区切り、flex で M と Mx の間に 3mm gap
    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.6;display:flex;align-items:baseline;gap:3mm">'
    + '<span>M：' + ['T0','T1','T2','T3'].map(function(m){ return chkC(m, mat===m); }).join('&nbsp;') + '</span>'
    + '<span>Mx：' + chkC('ON', mxIsOn) + '&nbsp;' + chkC('OFF', !mxIsOn) + '</span>'
    + '</div>\n'
    // [20260420k] St: → St：
    + '      <div style="font-size:7px;font-weight:700;color:#000;line-height:1.6">St：'
    + _stageCheckboxRow(ld.stage_code || 'T1') + '</div>\n'
    + '    </div>\n  </div>\n'
    + '  <div style="border-top:1.5px solid #000;margin:0.8mm 1.5mm 0"></div>\n'
    + '  <div style="flex:1;padding:0 1.5mm 0.5mm;overflow:hidden">\n'
    + '    <table style="width:100%;border-collapse:collapse;table-layout:fixed">\n'
    + '      <thead><tr>'
    + '<th style="' + thS + '">日付</th><th style="' + thS + '">①</th>'
    + '<th style="' + thS + '">②</th><th style="' + thS + '">交換</th>'
    + '</tr></thead>\n'
    + '      <tbody>' + rowsHtml + '</tbody>\n    </table>\n  </div>\n</div>\n</body></html>';
}

// ── ダウンロード / 共有 / 印刷 ────────────────────────────────────
Pages._lblDownloadPNG = function () {
  const label = window._currentLabel || {};
  const url   = label.pngDataUrl;
  if (!url) { UI.toast('先にラベルを生成してください', 'error'); return; }
  const a = document.createElement('a');
  a.href = url; a.download = label.fileName || 'label.png';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
  if (!label.pngDataUrl && !label.html) { UI.toast('先にラベルを生成してください', 'error'); return; }
  const dims = label.dims || { wMm:62, hMm:70 };
  const png  = label.pngDataUrl;
  if (png) {
    const wPx = dims.wPx || 234, hPx = dims.hPx || 265;
    const printDoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=' + wPx + '">'
      + '<style>@page{margin:0;}html{margin:0;padding:0;background:#fff;}body{margin:0;padding:0;background:#fff;width:' + wPx + 'px;}'
      + 'img{display:block;width:' + wPx + 'px;height:' + hPx + 'px;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
      + '</style></head><body><img src="' + png + '" width="' + wPx + '" height="' + hPx + '">'
      + '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},500);});<' + '/script></body></html>';
    const blob = new Blob([printDoc], { type:'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (!win) { UI.toast('ポップアップを許可してください（アドレスバー右端のアイコンをタップ）', 'error', 5000); return; }
    setTimeout(function(){ URL.revokeObjectURL(url); }, 15000);
    return;
  }
  const wPx = dims.wPx || 234, hPx = dims.hPx || 265;
  const rawHtml = (label.html || '').replace(/&quot;/g, '"');
  const printDoc2 = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=' + wPx + '">'
    + '<style>@page{margin:0;}html,body{margin:0;padding:0;background:#fff;width:' + wPx + 'px;}</style></head><body>'
    + rawHtml + '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},600);});<' + '/script></body></html>';
  const blob2 = new Blob([printDoc2], { type:'text/html;charset=utf-8' });
  const url2  = URL.createObjectURL(blob2);
  const win2  = window.open(url2, '_blank');
  if (!win2) { UI.toast('ポップアップを許可してください（アドレスバー右端のアイコンをタップ）', 'error', 5000); return; }
  setTimeout(function(){ URL.revokeObjectURL(url2); }, 15000);
};

Pages._lblPrintHTML = Pages._lblBrotherPrint;
Pages._lblPrint     = Pages._lblBrotherPrint;
Pages._lblDownload  = Pages._lblDownloadPNG;

Pages._lblPrintSetupGuide = function() {
  UI.modal(
    '<div class="modal-title" style="font-size:.92rem;font-weight:700;padding-bottom:8px">🖨️ Brother印刷 初回セットアップ</div>'
    + '<div style="font-size:.8rem;line-height:1.9;padding:4px 0">'
    + '<div style="font-weight:700;color:var(--gold);margin-bottom:6px">【1回だけ必要な作業】</div>'
    + '<div style="margin-bottom:12px"><b>① Google Playでインストール</b><br><span style="color:var(--text3)">「Brother Print Service Plugin」を検索してインストール</span></div>'
    + '<div style="margin-bottom:12px"><b>② Androidの印刷設定を開く</b><br><span style="color:var(--text3)">設定 → 接続済みデバイス → 印刷 → Brother Print Service → 有効にする</span></div>'
    + '<div style="margin-bottom:12px"><b>③ プリンターを追加</b><br><span style="color:var(--text3)">「プリンターを追加」→ QL-820NWBをWi-Fiで検索・選択</span></div>'
    + '<div style="background:rgba(76,175,120,.08);border:1px solid rgba(76,175,120,.25);border-radius:8px;padding:10px 12px;font-size:.76rem">'
    + '<b style="color:var(--green)">✅ セットアップ完了後の印刷手順</b><br>'
    + '① HerculesOSで「Brother印刷」ボタンをタップ<br>② 印刷ダイアログが開く → プリンター: QL-820NWBを選択<br>'
    + '③ 用紙サイズが自動設定される（62×70mm または 62×40mm）<br>④「印刷」→ 完了 🎉</div></div>'
    + '<div class="modal-footer"><button class="btn btn-primary btn-full" onclick="UI.closeModal&&UI.closeModal()">OK</button></div>'
  );
};
Pages._lblOpenDrive = function () { UI.toast('Drive保存は非対応です', 'info'); };

window._currentLabel  = window._currentLabel  || { displayId:'', fileName:'', html:'', pngDataUrl:'', dims:null };
window._lastLabelType = window._lastLabelType  || {};

window.PAGES = window.PAGES || {};
window.PAGES['label-gen'] = () => Pages.labelGen(Store.getParams());
