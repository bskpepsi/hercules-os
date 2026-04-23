// FILE: js/pages/lot.js
// ════════════════════════════════════════════════════════════════
// lot.js
// build: 20260423d
// 変更点:
//   - [20260423d] 🐛 バグ修正
//     ① 飼育管理のユニットタブの右上＋ボタンを非表示に
//        (従来は「ロット登録」へ遷移してしまっていた)
//        ユニットは T1 移行セッションから作成されるのが正しい流れ。
//     ② ロット登録画面の戻るボタンが必ず飼育管理の個体タブに戻る問題を修正
//        backFn を明示して _tab=lot を保持した飼育管理へ戻すように。
//   - [20260423c] ライン絞り込みピルのラベルに年度下2桁を追加
//     例: A1 (25) / A1 (26) / B2 (26)
//     2025年度のA1ラインと2026年度のA1ラインは全く別のラインなので、
//     ユーザーが混同しないように区別表示。内部の line_id は元々ユニーク
//     なため絞り込み動作は従来から分離されていたが、UI上で見分けがつかない
//     問題を修正。_lineFilterLabel ヘルパー関数を追加。
//   - [20260423b] フィルタバー複数選択対応 (ユーザー要望)
//     個体タブ: _indStages[], _indLines[] で OR 条件絞り込み
//     ユニットタブ: _unitLines[] で OR 条件
//     ロットタブ: filters.stages[], filters.line_ids[] で OR 条件
//     各バーの"全て"ピル押下でクリア、個別ピルはトグル動作。
//   - [20260423b] ライン絞り込みピルを全ライン表示に (旧: slice(0,8) で C1 等が
//     一覧に出ない問題の修正)。filter-bar は overflow-x:auto で水平スクロール可。
//   - [20260423b] ユニットカードの②列幅を広げ、③列を縮めて日付の 14週/3.7ヶ月
//     が末尾省略されないように (flex 1.1→1.5, 1→0.8、font-size 微調整)。
//   - [20260423a] 🥚採卵日の経過日数表示を削除 (孵化日の経過で代替)
//     例: "🥚採卵 2025/11/01 (173日/24週/5.7ヶ月)" → "🥚採卵 2025/11/01"
//     採卵〜孵化は孵化日からの経過に包含されるため冗長だった。
//   - [20260423a] (+ styles.css) タブ切替時のカード横幅ズレ修正
//     .page-body > * に width:100% / min-width:0 / box-sizing:border-box を
//     強制して、flex column 内で子の内容物依存の幅縮みを防ぐ。
//   - [20260422x] 孵化日/採卵日の経過表示を常に全単位で
//     ① 🐣 孵化日 / 🥚 採卵日: 警告色ではなく情報色 (グレー) で
//        日数に応じた単位切替表示 (14日 / 45日/6週 / 112日/3.7ヶ月 / 400日/1年1ヶ月)
//     ② 🔄 最終交換: 3段階色分けに拡張
//        通常 → しきい値80%で黄 (#ffb800) → 超過で赤 (#e05050)
//     新ヘルパー: _formatHatchAge (日→日/週/月/年の表記変換)、
//                  _formatHatchDate (孵化/採卵用、グレー固定)
//     _ageColor を3段階に拡張、_formatAgeDate は最終交換専用として継続。
//   - [20260422v] カード ステージ+マット列を中揃えに変更
//     (align-items: flex-end → center でバッジが中央で縦整列)
//   - [20260422u] ユニットカードのステージバッジのバグ修正
//     症状: A1 ユニットが "T1 / T1" (ステージ列もマット列もT1) と表示
//     原因: _uStageLbl = _lotDisplayStageLabel(u.stage_phase) としていたが、
//           u.stage_phase は T1/T2/T3 (飼育フェーズ) でありマップに無いキーは
//           そのまま返るため T2 ユニットでは "T2" がステージ欄に残っていた。
//     修正: ステージはメンバーの current_stage から取得。無ければ phase から
//           T1→L1L2 / T2/T3→L3 と推論する _inferStageFromPhase を使う。
//   - [20260422t] 🎨 カードデザインを手書き案に忠実に整列
//     全カードを4〜5列構造に統一:
//       [①ライン+性別/頭数] [②ID+日付情報] [③ステージ+マットバッジ] [④ステータス]
//     固定幅カラム (①=36px / ④=50px) で3タブのカードが縦一直線に揃う。
//     個体: 体重を大型右表示、ユニット/ロット: ステージバッジ上 + マットバッジ下の2段。
//   - [20260422s] カード情報の統一 (Phase E)
//     ① 3種共通バッジ: マット種別 (T0/T1/T2/T3/MD) を右端に大きく表示
//        (ユニットの T1/T2/T3 バッジと同じデザインを個体・ロットにも適用)
//     ② 孵化日と経過日数を全カードに表示: 例「🥚 2025/10/15 (112日)」
//     ③ 最終マット交換日と経過日数: 例「🔄 最終交換: 2025/12/15 (90日)」
//        exchange_type='FULL' の成長記録のみを対象 (ADD は除外)
//     ④ 経過日数のしきい値色分け:
//        - T0 の 60日超: 赤字 (DAYS_WARNING_T0 = 60)
//        - T1/T2/T3/MD の 90日超: 赤字 (DAYS_WARNING_DEFAULT = 90)
//     ⑤ 個体カードの体重を右端に大きく表示 (ユニット互換)
//     ⑥ ロットカードに採卵日/孵化日の2行表示
//     ⑦ 各タブにソートバー追加:
//        - 個体: ID順 / 孵化日順(新/旧) / 最終交換経過順 / 体重順
//        - ユニット: ID順 / 孵化日順(新/旧) / 最終交換経過順
//        - ロット: ID順 / 孵化日順(新/旧) / 採卵日順 / 頭数順
//        各タブ独立 (タブごとに意味のあるソート軸が違うため)
//     共通ヘルパー追加:
//        - _resolveHatchDate (孵化日解決、親ロット/継承対応)
//        - _getLastFullExchangeDate (最終FULL交換日取得)
//        - _daysSince (経過日数計算)
//        - _ageColor (しきい値色判定、mat別)
//        - _formatAgeDate (「YYYY/MM/DD (Nd)」形式)
//        - _matBadgeHTML (マット種別バッジ生成)
//   - [20260422r] Phase C/D 追加調整
//     ① タブ表示順を 🐛 個体 → 📦 ユニット → 🥚 ロット に変更
//     ② デフォルトタブを 'lot' → 'ind' に変更
//        (ボトムナビから 飼育 で入ったときに 個体 から見せる)
//     ③ URL hash 同期: 'ind' が新デフォルトなので書き込み条件を反転
//        (tab !== 'ind' のときに _tab=xxx を書く)
//     ④ 既存の "ロット一覧へ" ボタン (lot.js 内部の他画面からの導線) は
//        意味を保つため明示的に {_tab:'lot'} を付与
//   - [20260422q] 飼育管理に「🐛 個体」タブを追加（Phase C）
//     lot-list ページに 3つ目のタブとして個体一覧を統合。
//     ロット/ユニット/個体 の3タブ構成に。
//     機能:
//       ① タブ切替で個体一覧を同画面に表示（renderInd 関数追加）
//       ② ライン絞り込み・キーワード検索は他タブと共通
//       ③ ステータスフィルタ (全て/飼育中/販売/死亡等) を個体タブに追加
//       ④ _tab=ind で URL 復元対応 (リロード耐性)
//       ⑤ 既存の Pages.individualList ページは残す (他からの導線維持)
//     個体カード描画は individual.js の _indCardHTML を再利用（グローバル関数）。
//   - [20260422k] ロット詳細画面のボタン配置変更
//     ① 上部ボタンを3行構成に変更:
//        旧: Row1=[📷 成長記録][✂️ 分割] / Row2=[🏷️ ラベル発行・QRコード生成]
//        新: Row1=[📷 成長記録][🏷️ ラベル発行] / Row2=[📅 孵化日を設定]
//            / Row3=[🐛 T1移行（割り出し）を開始]
//        ✂️ 分割ボタンは削除 (T1移行が割り出しを兼ねる)
//     ② 📅 孵化日を設定 / 🐛 T1移行 ボタンを血統・種親の下から上部ボタン群の
//        直下に移動。条件付き表示:
//        ・📅 孵化日を設定: !lot.hatch_date のときのみ
//        ・🐛 T1移行: !lot.t1_done のときのみ
//        ・✅ T1移行済み: lot.t1_done のとき
//     ③ ページ下部の「🌱 生体ステージ」「🔄 マット交換」ボタンを削除
//        生体ステージは「✏️ ロット情報を修正」モーダルから変更する設計に統一
//        マット交換は別途 _lotEditMat 経由 (メニュー等) で呼び出し可能
//     ④ Pages._lotEdit に「生体ステージ」選択フィールドを追加
//        _lotEditSave で stage_life も同時に保存 (以前は別モーダル _lotEditStage
//        から変更する必要があった)
//   - [20260422c] 🐛 バグ修正: ユニットタブ選択中にリロードするとロットタブに戻る問題
//     原因: _lotUnitTabSwitch がローカル変数 _activeTab と DOM だけ更新し、
//           URL hash / Store.pageParams を更新していなかったため、
//           リロード時の app.js の hash → params 復元で _tab が失われ、
//           Line 157 の `params._tab || 'lot'` で 'lot' にフォールバックしていた。
//     修正: タブ切替時に history.replaceState で URL hash (#page=lot-list&_tab=unit)
//           と Store.navigate の両方を同期。フィルター/検索状態を壊さないため
//           routeTo は使わず render() はそのまま残す。
//   - [20260421e] 販売候補への個体遷移を updateIndividual 経由に変更
//     changeStatus(→deleteIndividual) は終端ステータスのみ受付けるため
//     for_sale 遷移はエラーになっていた。updateIndividual は
//     StatusRules の validateStatusTransition を通すので alive→for_sale 可。
//   - [20260418f-fix1] 親タップで種親詳細に遷移しないバグを修正
//                     _backParams のJSON内ダブルクォートが onclick属性を壊していた
//                     → &quot; にエスケープして属性内に安全に埋め込む
//   - [20260418f] 血統・種親カードの血統表示を「祖父×祖母」形式に変更
//                 父種親の paternal_raw/maternal_raw（= 祖父/祖母の血統原文）を表示
//                 例: U71 (160mm) × 165T-REX.T-115 (69mm)
//   - [20260418f] 種親詳細への遷移時に戻り先情報を付与（_back / _backParams）
//   - [20260418e] ロット詳細画面に血統・種親カードを追加
//   - Bug 5: ユニット一覧のメンバー表示で未判別性別の「?」を非表示に修正
// ════════════════════════════════════════════════════════════════

'use strict';

console.log('[HerculesOS] lot.js v20260423d loaded');

// ────────────────────────────────────────────────────────────────
// [20260418f] 血統・種親カードを生成（ロット詳細用）
// 引数:
//   line - Store.getLine() の結果
//   backCtx - { page: 'lot-detail', params: {lotId: '...'} } 戻り先情報
// 返値: HTML文字列。lineが null/undefined の場合は空文字を返す
//
// 表示内容:
//   ♂親 [display_id] ([size]mm) ›
//   血統 [paternal_raw (father_parent_size_mm mm)] × [maternal_raw (mother_parent_size_mm mm)]
//
//   ♀親 [display_id] ([size]mm) ›
//   血統 [paternal_raw (father_parent_size_mm mm)] × [maternal_raw (mother_parent_size_mm mm)]
//
// 血統行は「父方祖父 × 母方祖母」形式。表示規則:
//   両方あり:        U71 (160mm) × 165T-REX.T-115 (69mm)
//   サイズなし:      U71 × 165T-REX.T-115
//   片方のみ:        U71 (160mm) × —
//   両方なし:        血統行自体を非表示
// ────────────────────────────────────────────────────────────────
function _lotRenderParentageCard(line, backCtx) {
  if (!line) return '';

  var father = line.father_par_id ? (Store.getParent(line.father_par_id) || null) : null;
  var mother = line.mother_par_id ? (Store.getParent(line.mother_par_id) || null) : null;

  if (!father && !mother && !line.father_par_id && !line.mother_par_id) return '';

  // 祖父母ペアから「血統原文(サイズ) × 血統原文(サイズ)」の文字列を生成
  function _grandBloodlineLine(par) {
    if (!par) return '';
    var patRaw = (par.paternal_raw || '').trim();
    var matRaw = (par.maternal_raw || '').trim();
    var patSize = par.father_parent_size_mm;
    var matSize = par.mother_parent_size_mm;

    if (!patRaw && !matRaw) return ''; // 両方なし → 血統行自体を出さない

    function _fmt(raw, size) {
      if (!raw) return '—';
      return raw + (size ? ' (' + size + 'mm)' : '');
    }

    return _fmt(patRaw, patSize) + ' × ' + _fmt(matRaw, matSize);
  }

  // backCtx を onclick用のパラメータ文字列にエンコード
  function _buildParentOnclick(parId) {
    if (!backCtx || !backCtx.page) {
      return "routeTo('parent-detail',{parId:'" + parId + "'})";
    }
    // onclick属性はダブルクォートで囲まれるので、内部のダブルクォートを &quot; にエスケープする
    // さらに JSON文字列リテラルはシングルクォートで囲むので、シングルクォートも \\' にエスケープ
    var backParamsJson = JSON.stringify(backCtx.params || {})
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;');
    return "routeTo('parent-detail',{parId:'" + parId + "',_back:'" + backCtx.page + "',_backParams:'" + backParamsJson + "'})";
  }

  function _parBlock(par, parId, sex) {
    if (!par && !parId) return '';
    var mc = sex === '♂' ? 'var(--male,#5ba8e8)' : 'var(--female,#e87fa0)';
    var bg = sex === '♂' ? 'rgba(91,168,232,.05)' : 'rgba(232,127,160,.05)';
    var bd = sex === '♂' ? 'rgba(91,168,232,.2)'  : 'rgba(232,127,160,.2)';

    if (!par) {
      return '<div style="padding:8px 10px;background:' + bg + ';border-radius:8px;border:1px solid ' + bd + ';margin-bottom:6px">'
        + '<span style="font-size:.75rem;color:' + mc + ';font-weight:700">' + sex + '親</span>'
        + ' <span style="font-size:.8rem;color:var(--text3)">情報なし</span>'
        + '</div>';
    }

    var name          = par.parent_display_id || par.display_name || '—';
    var grandLine     = _grandBloodlineLine(par);
    var parentOnclick = _buildParentOnclick(parId);

    return '<div style="padding:8px 10px;background:' + bg + ';border-radius:8px;border:1px solid ' + bd + ';margin-bottom:6px">'
      // 親情報行
      + '<div style="display:flex;align-items:baseline;gap:6px;cursor:pointer" onclick="' + parentOnclick + '">'
      +   '<span style="font-size:.75rem;color:' + mc + ';font-weight:700;flex-shrink:0">' + sex + '親</span>'
      +   '<span style="font-size:.88rem;font-weight:700;color:var(--text1)">' + name + '</span>'
      +   (par.size_mm ? '<span style="font-size:.8rem;color:var(--green);font-weight:700">(' + par.size_mm + 'mm)</span>' : '')
      +   '<span style="margin-left:auto;color:var(--text3);font-size:.9rem">›</span>'
      + '</div>'
      // 血統行（祖父×祖母）※ 両方なしなら非表示
      + (grandLine
        ? '<div style="display:flex;align-items:baseline;gap:6px;margin-top:4px;padding-top:4px;border-top:1px dashed ' + bd + '">'
          +   '<span style="font-size:.72rem;color:var(--text3);font-weight:700;flex-shrink:0;min-width:36px">血統</span>'
          +   '<span style="font-size:.78rem;color:var(--text2);word-break:break-all;line-height:1.4">' + grandLine + '</span>'
          + '</div>'
        : '')
      + '</div>';
  }

  var fBlock = _parBlock(father, line.father_par_id, '♂');
  var mBlock = _parBlock(mother, line.mother_par_id, '♀');

  if (!fBlock && !mBlock) return '';

  return '<div class="card" style="margin-bottom:10px">'
    + '<div class="card-title">血統・種親</div>'
    + fBlock + mBlock
    + '</div>';
}

// ────────────────────────────────────────────────────────────────
// [20260423c] _lineFilterLabel — フィルタピル専用のライン表示ラベル
//   2025年度のA1と2026年度のA1を区別するため、年度下2桁を付けて表示。
//   例: A1 (25) / A1 (26)
//   ・line.hatch_year が無い場合は line.display_id や line.line_id から抽出を試みる
//   ・全て失敗したら line_code のみを返す (後方互換)
// ────────────────────────────────────────────────────────────────
function _lineFilterLabel(line) {
  if (!line) return '';
  var code = line.line_code || line.display_id || '?';
  // 年度の取得を複数経路で試行
  var year = '';
  if (line.hatch_year) {
    year = String(line.hatch_year).trim();
  } else if (line.display_id) {
    // "HM2025-A1" や "HM2026-B2-001" → 2025 / 2026
    var m = String(line.display_id).match(/[A-Za-z]{1,4}(\d{4})/);
    if (m) year = m[1];
  } else if (line.line_id) {
    // "LINE-2025-A1" 等の可能性
    var m2 = String(line.line_id).match(/(\d{4})/);
    if (m2) year = m2[1];
  }
  if (!year) return code;
  // 下2桁のみ付与 ("2025" → "25")
  var y2 = year.slice(-2);
  return code + ' (' + y2 + ')';
}
function _lotDisplayStageLabel(code) {
  if (!code) return '—';
  var map = {
    L1L2:'L1L2', L3:'L3', PREPUPA:'前蛹', PUPA:'蛹',
    ADULT_PRE:'成虫（未後食）', ADULT:'成虫（活動開始）',
    L1:'L1L2', L2_EARLY:'L1L2', L2_LATE:'L1L2',
    L3_EARLY:'L3', L3_MID:'L3', L3_LATE:'L3',
    EGG:'L1L2', T0:'L1L2', T1:'L1L2', T2A:'L3', T2B:'L3', T3:'L3',
  };
  return map[code] || code;
}

// ════════════════════════════════════════════════════════════════
// [20260422s] Phase E: カード共通ヘルパー
// ════════════════════════════════════════════════════════════════

// マット種別ごとの経過日数しきい値（超えたら赤字）
var _MAT_DAYS_WARNING = {
  T0: 60,
  T1: 90, T2: 90, T3: 90, MD: 90,
};

// 日付を YYYY/MM/DD に正規化 (Date オブジェクト・ISO・'YYYY/MM/DD' すべて受容)
function _normalizeDateYmd(v) {
  if (!v) return '';
  var s = String(v).trim();
  if (!s || s === '—' || s === '-') return '';
  // 2025/10/01 や 2025-10-01 形式
  var m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    return m[1] + '/' + ('0'+m[2]).slice(-2) + '/' + ('0'+m[3]).slice(-2);
  }
  // JSON Date.toString() の "Tue Oct 01 2025 ..." 形式
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    var y = d.getFullYear();
    var mo = ('0' + (d.getMonth()+1)).slice(-2);
    var da = ('0' + d.getDate()).slice(-2);
    return y + '/' + mo + '/' + da;
  }
  return '';
}

// 日付の経過日数を返す (今日 - 日付)。無効時は null
function _daysSince(v) {
  var s = _normalizeDateYmd(v);
  if (!s) return null;
  var d = new Date(s.replace(/\//g, '-') + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  return diff >= 0 ? diff : null;
}

// 孵化日を解決 (個体/ユニット/ロット 共通)
//   opts.direct      - 自身の hatch_date
//   opts.lotId       - 親ロット ID (個体用)
//   opts.originLotId - origin_lot_id (ユニット/個体用)
//   opts.sourceLots  - source_lots JSON配列 (ユニット用)
// 返値: { value: 'YYYY/MM/DD', source: '...', days: N } or null
function _resolveHatchDate(opts) {
  opts = opts || {};
  var d = _normalizeDateYmd(opts.direct);
  if (d) return { value: d, source: 'direct', days: _daysSince(d) };
  if (Store && Store.getLot) {
    var tries = [];
    if (opts.lotId)       tries.push({ id: opts.lotId,       src: 'lot_id' });
    if (opts.originLotId) tries.push({ id: opts.originLotId, src: 'origin_lot_id' });
    if (opts.sourceLots) {
      try {
        var arr = typeof opts.sourceLots === 'string' ? JSON.parse(opts.sourceLots) : opts.sourceLots;
        if (Array.isArray(arr)) arr.forEach(function(x){ if (x) tries.push({id:x,src:'source'}); });
      } catch(_){}
    }
    var seen = {};
    for (var i = 0; i < tries.length; i++) {
      if (seen[tries[i].id]) continue;
      seen[tries[i].id] = true;
      var L = Store.getLot(tries[i].id);
      if (L) {
        var hd = _normalizeDateYmd(L.hatch_date);
        if (hd) return { value: hd, source: tries[i].src, days: _daysSince(hd) };
      }
    }
  }
  return null;
}

// 採卵日を解決 (ロット用)
function _resolveCollectDate(lot) {
  if (!lot) return null;
  var d = _normalizeDateYmd(lot.collect_date);
  if (d) return { value: d, days: _daysSince(d) };
  // フォールバック: note から "採卵日: YYYY/MM/DD" 抽出
  if (lot.note) {
    var m = String(lot.note).match(/採卵日[:：]?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
    if (m) {
      var n = _normalizeDateYmd(m[1]);
      if (n) return { value: n, days: _daysSince(n) };
    }
  }
  return null;
}

// 最終 FULL 交換日を取得 (target = 'IND'/'UNIT'/'LOT', id = target_id)
// 返値: { value: 'YYYY/MM/DD', days: N } or null
function _getLastFullExchange(targetId) {
  if (!targetId) return null;
  var recs = (typeof Store !== 'undefined' && Store.getGrowthRecords)
    ? Store.getGrowthRecords(targetId) : [];
  if (!recs || !recs.length) return null;
  // exchange_type='FULL' のみ対象 (ADD / NONE / 空 は除外)
  var fullRecs = recs.filter(function(r){
    var ex = String(r.exchange_type || '').toUpperCase();
    return ex === 'FULL' || ex === '全';
  });
  if (!fullRecs.length) return null;
  fullRecs.sort(function(a,b){ return String(b.record_date||'').localeCompare(String(a.record_date||'')); });
  var d = _normalizeDateYmd(fullRecs[0].record_date);
  if (!d) return null;
  return { value: d, days: _daysSince(d) };
}

// マット種別とその経過日数から色を決める (3段階)
//   days が null / しきい値の 80% 未満 → 通常色 (薄いグレー)
//   しきい値の 80% 以上 100% 以下 → 黄色予兆 (#ffb800)
//   しきい値超過 → 赤警告 (#e05050)
function _ageColor(matType, days) {
  if (days === null || days === undefined) return 'var(--text2)';
  var t = String(matType || '').toUpperCase();
  var limit = _MAT_DAYS_WARNING[t];
  if (!limit) return 'var(--text2)';
  if (days > limit) return 'var(--red,#e05050)';        // 超過: 赤
  if (days >= limit * 0.8) return '#ffb800';             // 80%以上: 黄色予兆
  return 'var(--text2)';                                 // 通常
}

// 経過日数を常に全単位で表示: "112日 / 16週 / 3.7ヶ月"
// 365日以上は "400日 / 57週 / 1年1ヶ月" のように年も追加
function _formatHatchAge(days) {
  if (days == null) return '';
  var parts = [];
  parts.push(days + '日');
  // 週 (1週未満は非表示)
  if (days >= 7) {
    parts.push(Math.floor(days / 7) + '週');
  }
  // ヶ月 (30日未満は非表示、小数1桁)
  if (days >= 30) {
    if (days >= 365) {
      // 1年以上は "1年1ヶ月" 表記
      var years = Math.floor(days / 365);
      var remainDays = days - years * 365;
      var remainMonths = Math.floor(remainDays / 30.4);
      parts.push(years + '年' + remainMonths + 'ヶ月');
    } else {
      parts.push((days / 30.4).toFixed(1) + 'ヶ月');
    }
  }
  return parts.join(' / ');
}

// 「YYYY/MM/DD (Nd)」形式で日付と経過日数を整形（最終交換日用: mat しきい値で色分け）
// matType を渡すと経過日数部の色が決まる
function _formatAgeDate(dateObj, matType) {
  if (!dateObj || !dateObj.value) return '';
  var dstr = dateObj.value;
  if (dateObj.days == null) return dstr;
  var col = _ageColor(matType, dateObj.days);
  return dstr + ' <span style="color:' + col + ';font-weight:700">(' + dateObj.days + '日)</span>';
}

// 孵化日用の整形。経過日数は警告色ではなく、情報色 (薄い白 = text2) で表示。
// 日/週/ヶ月/年 すべての単位を並記する (ユーザー要望)。
function _formatHatchDate(dateObj) {
  if (!dateObj || !dateObj.value) return '';
  var dstr = dateObj.value;
  if (dateObj.days == null) return dstr;
  var ageStr = _formatHatchAge(dateObj.days);
  return dstr + ' <span style="color:var(--text2);font-weight:600">(' + ageStr + ')</span>';
}

// マット種別バッジを生成 (T0/T1/T2/T3/MD)
// デザインはユニットの stage_phase バッジと統一
function _matBadgeHTML(matType) {
  var t = String(matType || '').toUpperCase();
  if (!t || t === '—') t = '—';
  // 色分け (ユニットと同じ配色)
  var color = 'var(--text3)';
  if (t === 'T0')       color = '#6a6a6a';
  else if (t === 'T1')  color = 'var(--green)';
  else if (t === 'T2')  color = 'var(--blue)';
  else if (t === 'T3')  color = 'var(--amber)';
  else if (t === 'MD')  color = '#a0c878';
  return '<span style="display:inline-block;font-size:.95rem;font-weight:800;'
    + 'color:' + color + ';border:1.5px solid ' + color + ';border-radius:6px;'
    + 'padding:1px 7px;text-align:center;line-height:1.5;min-width:34px">'
    + t + '</span>';
}

// ソートキー定義 (タブ共通の比較関数生成)
//   key: 'id' | 'hatch_new' | 'hatch_old' | 'exchange' | 'weight_desc' |
//        'collect_new' | 'count_desc'
//   getter: 対象から必要情報を取り出す関数
function _makeSortComparator(key, getters) {
  getters = getters || {};
  var g_hatch  = getters.hatchDays  || function(x){ var h=_resolveHatchDate({direct:x.hatch_date,lotId:x.lot_id,originLotId:x.origin_lot_id}); return h?h.days:null; };
  var g_ex     = getters.exchDays   || function(x){ var e=_getLastFullExchange(x._targetId || x.ind_id || x.unit_id || x.lot_id); return e?e.days:null; };
  var g_weight = getters.weight     || function(x){ return +x.latest_weight_g || 0; };
  var g_id     = getters.displayId  || function(x){ return String(x.display_id || x.ind_id || x.unit_id || x.lot_id || ''); };
  var g_count  = getters.count      || function(x){ return +x.count || 0; };
  var g_collect= getters.collectDays|| function(x){ var c=_resolveCollectDate(x); return c?c.days:null; };

  // 昇順/降順の null 処理共通化 (null は末尾)
  var cmpNum = function(a,b,desc) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return desc ? (b - a) : (a - b);
  };

  if (key === 'hatch_new')   return function(a,b){ return cmpNum(g_hatch(a),g_hatch(b),false); }; // 日数が小さい=新しい
  if (key === 'hatch_old')   return function(a,b){ return cmpNum(g_hatch(a),g_hatch(b),true);  };
  if (key === 'exchange')    return function(a,b){ return cmpNum(g_ex(a),g_ex(b),true); };       // 経過日数が多い順
  if (key === 'weight_desc') return function(a,b){ return cmpNum(g_weight(a),g_weight(b),true); };
  if (key === 'collect_new') return function(a,b){ return cmpNum(g_collect(a),g_collect(b),false); };
  if (key === 'count_desc')  return function(a,b){ return cmpNum(g_count(a),g_count(b),true); };
  // default: ID昇順
  return function(a,b){ return g_id(a).localeCompare(g_id(b)); };
}

// ソートバー HTML 生成
function _sortBarHTML(tabKey, currentKey, opts) {
  opts = opts || [];
  if (!opts.length) return '';
  var html = '<div class="filter-bar" style="margin-bottom:6px;overflow-x:auto;white-space:nowrap" id="' + tabKey + '-sort-bar">';
  html += '<span style="font-size:.7rem;color:var(--text3);padding:3px 6px 0 4px;flex-shrink:0">並び:</span>';
  html += opts.map(function(o){
    return '<button class="pill ' + (currentKey===o.val?'active':'') + '" data-sort="' + o.val + '">' + o.label + '</button>';
  }).join('');
  html += '</div>';
  return html;
}

// ════════════════════════════════════════════════════════════════
// ロット一覧
// ════════════════════════════════════════════════════════════════
Pages.lotList = function () {
  const main   = document.getElementById('main');
  const params = Store.getParams() || {};
  const fixedLineId = params.line_id || '';
  const fixedLine   = fixedLineId ? Store.getLine(fixedLineId) : null;
  const isLineLimited = !!fixedLineId;

  // [20260422r] デフォルトタブを 'lot' → 'ind' に変更（ボトムナビ「飼育」の意図）
  let _activeTab = params._tab || 'ind';
  let _keyword = '';
  // [20260423b] ロットタブのフィルタを複数選択対応: line_ids/stages は配列
  //   配列空 = 全て、1件以上 = その値群に含まれるものだけ表示 (OR条件)
  let filters = { status: 'active', stages: [], line_ids: fixedLineId ? [fixedLineId] : [], mat_type: '' };
  let _lotStatusMode = 'active';
  let _unitPhase  = '';
  let _unitStatus = 'active';
  let _unitMat    = '';
  // [20260423b] ユニットのライン絞り込みも配列化
  let _unitLines  = fixedLineId ? [fixedLineId] : [];
  // [20260422q] 個体タブ用ローカル状態
  let _indStatus  = 'alive';     // alive / for_sale / listed / sold / dead / all
  // [20260423b] 個体のステージ・ラインも複数選択 (配列)
  let _indStages  = [];          // [] = 全て, ['L1L2','L3'] = L1L2またはL3
  let _indSex     = '';          // ♂ / ♀ / 不明 / ''
  let _indLines   = fixedLineId ? [fixedLineId] : [];
  // [20260422s] ソート状態 (各タブ独立)
  let _indSort    = 'id';        // id / hatch_new / hatch_old / exchange / weight_desc
  let _unitSort   = 'id';        // id / hatch_new / hatch_old / exchange
  let _lotSort    = 'id';        // id / hatch_new / hatch_old / collect_new / count_desc

  function render() {
    if (_activeTab === 'unit') { renderUnit(); return; }
    if (_activeTab === 'ind')  { renderInd();  return; }
    renderLot();
  }

  // ══════════════════════════════════════════════════════════
  // ユニット一覧タブ
  // ══════════════════════════════════════════════════════════
  function renderUnit() {
    const lines = Store.getDB('lines') || [];
    const allUnits = Store.getDB('breeding_units') || [];
    let units = allUnits.slice();
    if (_unitPhase)  units = units.filter(u => u.stage_phase === _unitPhase);
    if (_unitStatus) units = units.filter(u => (u.status||'active') === _unitStatus);
    if (_unitMat)    units = units.filter(u => (u.mat_type||'') === _unitMat);
    // [20260423b] 複数ライン選択対応 (OR条件)
    if (_unitLines.length) units = units.filter(u => _unitLines.includes(u.line_id));
    if (_keyword) {
      const kw = _keyword.toLowerCase();
      units = units.filter(u =>
        (u.display_id||'').toLowerCase().includes(kw) ||
        (u.stage_phase||'').toLowerCase().includes(kw)
      );
    }
    // [20260422s] ソート適用 (ユニット用: origin_lot_id 経由の孵化日も考慮)
    units.sort(_makeSortComparator(_unitSort, {
      hatchDays: function(u) {
        var h = _resolveHatchDate({ direct: u.hatch_date, originLotId: u.origin_lot_id, sourceLots: u.source_lots });
        return h ? h.days : null;
      },
      exchDays: function(u) { var e = _getLastFullExchange(u.unit_id); return e ? e.days : null; },
      displayId: function(u) { return String(u.display_id || u.unit_id || ''); },
    }));

    const title = isLineLimited
      ? ((fixedLine ? (fixedLine.line_code||fixedLine.display_id) : '') + ' の飼育管理')
      : '飼育管理';

    // [20260422q] タブピル行を3タブに拡張（ロット/ユニット/個体）
    const _allInds = Store.getDB('individuals') || [];
    const _activeIndCount = _allInds.filter(i => {
      const s = i.status || 'alive';
      if (isLineLimited && i.line_id !== fixedLineId) return false;
      return s === 'alive' || s === 'larva' || s === 'prepupa' || s === 'pupa' || s === 'adult';
    }).length;

    main.innerHTML =
      // [20260423d] ユニットタブは＋ボタン非表示 (ユニットは T1 移行セッションから作成)
      UI.header(title, isLineLimited ? {back:true} : {}) +
      `<div class="page-body">` +
      `<div class="filter-bar" style="margin-bottom:8px">
        <button class="pill" onclick="Pages._lotUnitTabSwitch('ind')">🐛 個体 (${_activeIndCount})</button>
        <button class="pill active" onclick="Pages._lotUnitTabSwitch('unit')">📦 ユニット (${allUnits.filter(u=>(u.status||'active')==='active').length})</button>
        <button class="pill" onclick="Pages._lotUnitTabSwitch('lot')">🥚 ロット (${(()=>{
          const ac=Store.filterLots({status:'active',line_id:fixedLineId});
          const fs=Store.filterLots({status:'for_sale',line_id:fixedLineId});
          return ac.length+fs.length;
        })()})</button>
      </div>` +
      `<div style="margin-bottom:8px;position:relative">
        <input type="text" placeholder="🔍 ID・ステージで検索..." value="${_keyword}"
          id="unit-kw-input"
          style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);
            background:var(--bg2);font-size:.88rem;color:var(--text1);box-sizing:border-box"
          oninput="Pages._lotUnitKw(this.value)">
      </div>` +
      `<div class="filter-bar" style="margin-bottom:6px" id="unit-phase-filter">
        ${['','T1','T2','T3'].map(p =>
          `<button class="pill ${_unitPhase===p?'active':''}" data-phase="${p}">${p||'全て'}</button>`
        ).join('')}
      </div>` +
      `<div class="filter-bar" style="margin-bottom:6px" id="unit-mat-filter">
        ${['','T0','T1','T2','T3','MD'].map(m =>
          `<button class="pill ${_unitMat===m?'active':''}" data-umat="${m}">${m||'M:全て'}</button>`
        ).join('')}
      </div>` +
      (!isLineLimited ? `<div class="filter-bar" style="margin-bottom:6px" id="unit-line-filter">
        <button class="pill ${!_unitLines.length?'active':''}" data-uline="">ライン全て</button>
        ${lines.map(l =>
          `<button class="pill ${_unitLines.includes(l.line_id)?'active':''}" data-uline="${l.line_id}">${_lineFilterLabel(l)}</button>`
        ).join('')}
      </div>` : '') +
      `<div class="filter-bar" style="margin-bottom:8px" id="unit-status-filter">
        ${[{v:'active',l:'飼育中'},{v:'',l:'全状態'},{v:'individualized',l:'個別化済'}].map(s =>
          `<button class="pill ${_unitStatus===s.v?'active':''}" data-ustatus="${s.v}">${s.l}</button>`
        ).join('')}
      </div>` +
      // [20260422s] ソートバー
      _sortBarHTML('unit', _unitSort, [
        { val:'id',        label:'ID' },
        { val:'hatch_new', label:'🐣新' },
        { val:'hatch_old', label:'🐣古' },
        { val:'exchange',  label:'🔄経過' },
      ]) +
      `<div style="font-size:.75rem;color:var(--text3);margin-bottom:6px">${units.length}件</div>` +
      `<div id="unit-list-body">` +
      (units.length ? units.map(u => {
        const lc = (() => {
          const l = lines.find(x => x.line_id === u.line_id);
          if (l) return l.line_code || l.display_id || '';
          // フォールバック: display_id "HM2025-A1-U06" → "A1" を抽出
          const dm = (u.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-[A-Za-z]/);
          return dm ? dm[1] : '';
        })();
        const ph = u.stage_phase||'—';
        const sc = u.size_category||'—';
        const hc = u.head_count||2;
        const st = u.status||'active';
        const stBadge = st==='individualized'
          ? `<span style="font-size:.62rem;color:var(--amber);background:rgba(224,144,64,.15);padding:1px 5px;border-radius:4px;margin-left:4px">個別化済</span>` : '';
        const phColor = ph==='T1' ? 'var(--green)'
          : ph==='T2' ? 'var(--blue)'
          : ph==='T3' ? 'var(--amber)'
          : 'var(--text3)';

        // [20260422s] 孵化日・最終交換を取得
        const _uHatch   = _resolveHatchDate({
          direct: u.hatch_date,
          originLotId: u.origin_lot_id,
          sourceLots: u.source_lots,
        });
        const _uLastExc = _getLastFullExchange(u.unit_id);
        // [20260422s] 右端バッジはマット種別 (mat_type) に統一
        const _uMatType = (u.mat_type || '').toUpperCase();

        // members を解析して①②の情報を組み立て
        let membersArr = [];
        try {
          const raw = u.members;
          membersArr = Array.isArray(raw) ? raw
            : (typeof raw === 'string' && raw.trim()) ? JSON.parse(raw) : [];
        } catch(_e) {}

        // 性別アイコン
        const sexColor = (sx) => sx === '♂' ? '#3366cc' : sx === '♀' ? '#cc3366' : 'var(--text3)';

        const memberLines = membersArr.slice(0, 2).map((m, mi) => {
          const mw  = m.weight_g   ? m.weight_g + 'g' : '—';
          const msc = m.size_category || '—';
          const msx = (m.sex && m.sex !== '不明') ? m.sex : '?';
          return `<div style="font-size:.76rem;display:flex;align-items:center;gap:4px;margin-bottom:1px">
            <span style="color:var(--text3);font-size:.65rem;min-width:14px">${mi===0?'①':'②'}</span>
            <span style="font-weight:700;color:${sexColor(msx)}">${msx}</span>
            <span style="font-weight:700;color:var(--text1)">${msc}</span>
            <span style="color:var(--text2);font-weight:700">${mw}</span>
          </div>`;
        }).join('');

        const memberBlock = membersArr.length > 0
          ? memberLines
          : `<div style="font-size:.76rem;color:var(--text2)">${hc}頭 / 区分:${sc}</div>`;

        const srcLotsText = (() => {
          try {
            const sl = u.source_lots ? JSON.parse(u.source_lots) : [];
            if (!sl.length) return '';
            const names = sl.map(lid => {
              const lot = Store.getLot && Store.getLot(lid);
              if (!lot) return null;
              const d = lot.display_id || '';
              const m = d.match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+-L\d+)/);
              return m ? m[1] : d;
            }).filter(Boolean);
            return names.length ? '由来: ' + names.join('/') : '';
          } catch(_e){ return ''; }
        })();

        const uid = (u.display_id||u.unit_id||'').replace(/['"]/g,'');
        // [20260422t] ステータス表示 (飼育中/個別化済)
        const _uStatusLbl = st === 'individualized' ? '個別化済' : '飼育中';
        const _uStatusColor = st === 'individualized' ? 'var(--amber)' : 'var(--green)';
        // [20260422u] ステージバッジはメンバー個体の current_stage または stage_phase から推論
        //   ※ u.stage_phase は T1/T2/T3 の飼育フェーズでステージではない。
        //     members から current_stage を取るか、phase から推論する。
        const _inferStageFromMembers = () => {
          if (!membersArr.length) return '';
          // メンバーの current_stage 優先、無ければ stage_life
          for (let i = 0; i < membersArr.length; i++) {
            const m = membersArr[i];
            const ms = m.current_stage || m.stage_life || m.stage;
            if (ms) return _lotDisplayStageLabel(ms);
          }
          return '';
        };
        // phase→ステージの想定マップ: T1→L1L2 / T2→L3 / T3→L3
        const _inferStageFromPhase = (ph) => {
          if (ph === 'T1') return 'L1L2';
          if (ph === 'T2') return 'L3';
          if (ph === 'T3') return 'L3';
          return '';
        };
        const _uStageLbl = _inferStageFromMembers() || _inferStageFromPhase(ph) || '';
        const _uStageColor = _uStageLbl === 'L1L2' ? 'var(--green)'
          : _uStageLbl === 'L3' ? 'var(--blue)'
          : _uStageLbl === '前蛹' ? '#e65100'
          : _uStageLbl === '蛹' ? '#bf360c'
          : 'var(--text3)';
        const _uStageBadge = _uStageLbl
          ? '<span style="font-size:.72rem;font-weight:700;color:' + _uStageColor + ';'
            + 'border:1px solid ' + _uStageColor + ';border-radius:4px;padding:0 6px;'
            + 'line-height:1.5;white-space:nowrap">' + _uStageLbl + '</span>'
          : '';

        return `<div class="ind-card" onclick="Pages._goUnitDetail('${uid}')"
          style="padding:10px 10px;display:flex;align-items:stretch;gap:0;margin-bottom:8px">

          <!-- ①列: ライン + 頭数 (固定幅36px、縦罫線) -->
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
            width:36px;padding-right:8px;border-right:1px solid var(--border2);margin-right:8px;
            flex-shrink:0">
            <span style="font-size:.92rem;font-weight:800;color:${phColor};line-height:1.2">${lc}</span>
            <span style="font-size:.7rem;color:var(--text3);margin-top:3px">${hc}頭</span>
          </div>

          <!-- ②列: ID + 孵化日 + 最終交換 (flex:1.5 で日付全体を表示) -->
          <div style="display:flex;flex-direction:column;justify-content:center;gap:1px;
            min-width:0;flex:1.5;margin-right:6px">
            <div style="font-family:var(--font-mono);font-weight:700;font-size:.82rem;color:var(--gold);
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${u.display_id||u.unit_id}${stBadge}
            </div>
            ${srcLotsText
              ? `<div style="font-size:.62rem;color:var(--text3);
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${srcLotsText}</div>`
              : ''}
            ${_uHatch   ? `<div style="font-size:.66rem;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🐣${_formatHatchDate(_uHatch)}</div>`   : ''}
            ${_uLastExc ? `<div style="font-size:.66rem;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🔄${_formatAgeDate(_uLastExc, _uMatType)}</div>` : ''}
          </div>

          <!-- ③列: 各頭情報 (①② 行) - flex:0.8 に縮小 -->
          <div style="display:flex;flex-direction:column;justify-content:center;
            flex:0.8;min-width:0;margin-right:6px">
            ${memberBlock}
          </div>

          <!-- ④列: ステージバッジ (上) + マット種別バッジ (下) - 中揃え -->
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;flex-shrink:0;margin-right:6px;min-width:48px">
            ${_uStageBadge}
            ${_matBadgeHTML(_uMatType || ph)}
          </div>

          <!-- ⑤列: ステータス + › -->
          <div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:2px;flex-shrink:0;min-width:50px">
            <span style="font-size:.68rem;font-weight:700;color:${_uStatusColor};white-space:nowrap">${_uStatusLbl}</span>
            <span style="color:var(--text3);font-size:1rem">›</span>
          </div>
        </div>`;
      }).join('') : `<div style="color:var(--text3);text-align:center;padding:24px">該当するユニットがありません</div>`) +
      `</div></div>`;

    document.getElementById('unit-phase-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      _unitPhase = p.dataset.phase;
      renderUnit();
    });
    document.getElementById('unit-status-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      _unitStatus = p.dataset.ustatus;
      renderUnit();
    });
    const _uMatFilter = document.getElementById('unit-mat-filter');
    if (_uMatFilter) _uMatFilter.addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      _unitMat = p.dataset.umat;
      renderUnit();
    });
    if (!isLineLimited) {
      const _uLineFilter = document.getElementById('unit-line-filter');
      if (_uLineFilter) _uLineFilter.addEventListener('click', e => {
        const p = e.target.closest('.pill'); if (!p) return;
        const v = p.dataset.uline;
        if (v === '') {
          // 「ライン全て」押下 → クリア
          _unitLines = [];
        } else {
          // トグル: 含まれていれば外す、無ければ追加
          const idx = _unitLines.indexOf(v);
          if (idx >= 0) _unitLines.splice(idx, 1);
          else _unitLines.push(v);
        }
        renderUnit();
      });
    }
    // [20260422s] ソートバー
    const _uSortBar = document.getElementById('unit-sort-bar');
    if (_uSortBar) _uSortBar.addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      _unitSort = p.dataset.sort;
      renderUnit();
    });
  }

  // ══════════════════════════════════════════════════════════
  // [20260422q] 個体一覧タブ
  //   Pages.individualList のロジックを飼育管理ページに統合したもの。
  //   ・ライン絞り込み・キーワード検索は他タブと共通 (_keyword, _indLine)
  //   ・ステージ/性別/ステータスの3段フィルタバー
  //   ・個体カード描画は individual.js の _indCardHTML (グローバル関数) 再利用
  //   ・クリックで ind-detail へ遷移
  // ══════════════════════════════════════════════════════════
  function renderInd() {
    const lines = Store.getDB('lines') || [];
    // Store.filterIndividuals で status/sex のみ絞り込み、stage/line は自前で複数対応
    let list = (typeof Store !== 'undefined' && typeof Store.filterIndividuals === 'function')
      ? Store.filterIndividuals({ status: _indStatus, sex: _indSex })
      : (Store.getDB('individuals') || []).slice();
    // [20260423b] ステージ複数選択 (OR条件)
    //   _indStages = ['L1L2','L3'] のようなキー配列。空なら絞らない。
    //   Store.filterIndividuals と同じマッピングを自前で実施
    if (_indStages.length) {
      const _stageMap = {
        L1L2: ['L1L2','L1','L2_EARLY','L2_LATE','EGG','T0','T1'],
        L3: ['L3','L3_EARLY','L3_MID','L3_LATE','T2','T2A','T2B','T3'],
        prepupa: ['PREPUPA','前蛹'],
        pupa: ['PUPA','蛹'],
        adult: ['ADULT','ADULT_PRE','成虫'],
      };
      const _expanded = [];
      _indStages.forEach(s => {
        if (_stageMap[s]) _expanded.push(..._stageMap[s]);
        else _expanded.push(s);
      });
      list = list.filter(i => _expanded.includes(i.current_stage) || _expanded.includes(i.stage_life));
    }
    // [20260423b] ライン複数選択 (OR条件)
    if (_indLines.length) {
      list = list.filter(i => _indLines.includes(i.line_id));
    }
    // キーワード検索
    if (_keyword) {
      const kw = _keyword.toLowerCase();
      list = list.filter(i =>
        (i.display_id||'').toLowerCase().includes(kw) ||
        (i.ind_id||'').toLowerCase().includes(kw) ||
        (i.note_public||'').toLowerCase().includes(kw) ||
        (i.note_private||'').toLowerCase().includes(kw)
      );
    }
    // [20260422s] ソート適用
    list.sort(_makeSortComparator(_indSort, {
      hatchDays: function(i) {
        var h = _resolveHatchDate({ direct: i.hatch_date, lotId: i.lot_id, originLotId: i.origin_lot_id });
        return h ? h.days : null;
      },
      exchDays: function(i) { var e = _getLastFullExchange(i.ind_id); return e ? e.days : null; },
      weight:   function(i) { return +i.latest_weight_g || 0; },
      displayId:function(i) { return String(i.display_id || i.ind_id || ''); },
    }));

    // タブピル用のカウント
    const _lotCountActive = (()=>{
      const ac=Store.filterLots({status:'active',line_id:fixedLineId});
      const fs=Store.filterLots({status:'for_sale',line_id:fixedLineId});
      return ac.length+fs.length;
    })();
    const allUnits = Store.getDB('breeding_units') || [];
    const activeUnitCount = allUnits.filter(u=>(u.status||'active')==='active'
      && (!isLineLimited || u.line_id === fixedLineId)).length;
    const allInds = Store.getDB('individuals') || [];
    const _activeIndCount = allInds.filter(i => {
      const s = i.status || 'alive';
      if (isLineLimited && i.line_id !== fixedLineId) return false;
      return s === 'alive' || s === 'larva' || s === 'prepupa' || s === 'pupa' || s === 'adult';
    }).length;

    const title = isLineLimited
      ? ((fixedLine ? (fixedLine.line_code||fixedLine.display_id) : '') + ' の飼育管理')
      : '飼育管理';

    // ステージフィルタピル (複数選択)
    const _stageDefs = [
      { val:'L1L2',   label:'L1L2' },
      { val:'L3',     label:'L3'   },
      { val:'prepupa',label:'前蛹' },
      { val:'pupa',   label:'蛹'   },
      { val:'adult',  label:'成虫' },
    ];
    const _stageBar = '<div class="filter-bar" style="margin-bottom:6px" id="ind-stage-filter">'
      + '<button class="pill ' + (!_indStages.length?'active':'') + '" data-val="">全て</button>'
      + _stageDefs.map(s =>
          '<button class="pill ' + (_indStages.includes(s.val)?'active':'') + '" data-val="' + s.val + '">' + s.label + '</button>'
        ).join('') + '</div>';

    // 性別フィルタピル
    const _indSexes = [
      { val:'',  label:'♂♀' },
      { val:'♂', label:'♂'  },
      { val:'♀', label:'♀'  },
      { val:'不明', label:'?' },
    ];
    const _sexBar = '<div class="filter-bar" style="margin-bottom:6px" id="ind-sex-filter">'
      + _indSexes.map(s =>
          '<button class="pill ' + (_indSex===s.val?'active':'') + '" data-val="' + s.val + '">' + s.label + '</button>'
        ).join('') + '</div>';

    // ステータスフィルタピル
    const _indStatuses = [
      { val:'all',     label:'全て'   },
      { val:'alive',   label:'飼育中' },
      { val:'for_sale',label:'販売候補' },
      { val:'listed',  label:'出品中' },
      { val:'sold',    label:'売約済' },
      { val:'dead',    label:'死亡'   },
    ];
    const _statusBar = '<div class="filter-bar" style="margin-bottom:6px" id="ind-status-filter">'
      + _indStatuses.map(s =>
          '<button class="pill ' + (_indStatus===s.val?'active':'') + '" data-val="' + s.val + '">' + s.label + '</button>'
        ).join('') + '</div>';

    // [20260423b] ライン絞り込みバー: 複数選択、全ライン表示 (水平スクロール)
    // [20260423c] 年度付きラベル (2025年のA1と2026年のA1を区別)
    const _lineBar = !isLineLimited && lines.length > 0
      ? '<div class="filter-bar" style="margin-bottom:6px;overflow-x:auto;white-space:nowrap" id="ind-line-filter">'
        + '<button class="pill ' + (!_indLines.length?'active':'') + '" data-val="">全ライン</button>'
        + lines.map(l =>
            '<button class="pill ' + (_indLines.includes(l.line_id)?'active':'') + '" data-val="' + l.line_id + '">'
            + _lineFilterLabel(l) + '</button>'
          ).join('')
        + '</div>'
      : '';

    main.innerHTML =
      UI.header(title, isLineLimited
        ? { back:true, action:{fn:"routeTo('ind-new',{lineId:'"+fixedLineId+"'})",icon:'＋'} }
        : { action:{fn:"routeTo('ind-new')",icon:'＋'} }
      ) +
      '<div class="page-body">' +
      '<div class="filter-bar" style="margin-bottom:8px">'
        + '<button class="pill active" onclick="Pages._lotUnitTabSwitch(\'ind\')">🐛 個体 (' + _activeIndCount + ')</button>'
        + '<button class="pill" onclick="Pages._lotUnitTabSwitch(\'unit\')">📦 ユニット (' + activeUnitCount + ')</button>'
        + '<button class="pill" onclick="Pages._lotUnitTabSwitch(\'lot\')">🥚 ロット (' + _lotCountActive + ')</button>'
      + '</div>' +
      '<div style="margin-bottom:8px;position:relative">'
        + '<input type="text" placeholder="🔍 ID・メモで検索..." value="' + _keyword + '"'
        + ' id="ind-kw-input"'
        + ' style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);'
        + 'background:var(--bg2);font-size:.88rem;color:var(--text1);box-sizing:border-box"'
        + ' oninput="Pages._lotUnitKw(this.value)">'
      + '</div>' +
      _lineBar + _stageBar + _sexBar + _statusBar +
      // [20260422s] ソートバー
      _sortBarHTML('ind', _indSort, [
        { val:'id',          label:'ID' },
        { val:'hatch_new',   label:'🐣新' },
        { val:'hatch_old',   label:'🐣古' },
        { val:'exchange',    label:'🔄経過' },
        { val:'weight_desc', label:'⚖️重' },
      ]) +
      '<div class="sec-hdr">'
        + '<span class="sec-title">' + list.length + '頭</span>'
      + '</div>' +
      '<div id="ind-list-body">' +
        (list.length
          ? list.map(_indCardHTML).join('')
          : UI.empty('該当する個体がいません', isLineLimited ? 'このラインの個体がありません' : '右上の＋から登録できます'))
      + '</div>' +
      '</div>';

    // [20260423b] イベント: ステージ (複数選択トグル)
    document.getElementById('ind-stage-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      const v = p.dataset.val;
      if (v === '') {
        _indStages = [];
      } else {
        const idx = _indStages.indexOf(v);
        if (idx >= 0) _indStages.splice(idx, 1);
        else _indStages.push(v);
      }
      renderInd();
    });
    // イベント: 性別
    document.getElementById('ind-sex-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      _indSex = (p.dataset.val === _indSex ? '' : p.dataset.val);
      renderInd();
    });
    // イベント: ステータス
    document.getElementById('ind-status-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      _indStatus = p.dataset.val;
      renderInd();
    });
    // [20260423b] イベント: ライン絞り込み (複数選択トグル)
    if (!isLineLimited) {
      const _indLineFilter = document.getElementById('ind-line-filter');
      if (_indLineFilter) _indLineFilter.addEventListener('click', e => {
        const p = e.target.closest('.pill'); if (!p) return;
        const v = p.dataset.val;
        if (v === '') {
          _indLines = [];
        } else {
          const idx = _indLines.indexOf(v);
          if (idx >= 0) _indLines.splice(idx, 1);
          else _indLines.push(v);
        }
        renderInd();
      });
    }
    // [20260422s] ソートバー
    const _indSortBar = document.getElementById('ind-sort-bar');
    if (_indSortBar) _indSortBar.addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      _indSort = p.dataset.sort;
      renderInd();
    });
    // キーワード入力のフォーカス維持 (Android 対策)
    setTimeout(() => {
      const inp = document.getElementById('ind-kw-input');
      if (inp && _keyword) {
        inp.focus();
        try { inp.setSelectionRange(_keyword.length, _keyword.length); } catch(_) {}
      }
    }, 0);
  }

  // ══════════════════════════════════════════════════════════
  // ロット一覧タブ（既存機能 + キーワード検索）
  // ══════════════════════════════════════════════════════════
  function renderLot() {
    // [20260423b] 複数ライン対応: filterLots は単一のみ受け付けるため、
    //   ラインなし (line_ids空) または単独なら従来通り、2件以上なら全ラインで取って自前絞り込み
    let lots = [];
    const _singleLineForStore = (filters.line_ids.length === 1) ? filters.line_ids[0] : '';
    const _baseFilter = { line_id: _singleLineForStore };
    if (_lotStatusMode === 'all') {
      lots = Store.filterLots({ ..._baseFilter, status: 'all' });
    } else if (_lotStatusMode === 'selling') {
      const fs = Store.filterLots({ ..._baseFilter, status: 'for_sale' });
      const li = Store.filterLots({ ..._baseFilter, status: 'listed' });
      lots = [...fs, ...li];
    } else {
      const ac = Store.filterLots({ ..._baseFilter, status: 'active' });
      const fs = Store.filterLots({ ..._baseFilter, status: 'for_sale' });
      const li = Store.filterLots({ ..._baseFilter, status: 'listed' });
      lots = [...ac, ...fs, ...li];
    }
    // [20260423b] ライン2件以上時は自前絞り込み (OR条件)
    if (filters.line_ids.length > 1) {
      lots = lots.filter(l => filters.line_ids.includes(l.line_id));
    }
    // [20260423b] ステージ複数選択 (OR条件)
    if (filters.stages.length) {
      lots = lots.filter(l => {
        const s = l.stage_life || l.stage || '';
        const lbl = _lotDisplayStageLabel(s);
        // filters.stages の各値を _lotDisplayStageLabel マップと比較
        return filters.stages.some(fs => _lotDisplayStageLabel(fs) === lbl);
      });
    }
    if (filters.mat_type) {
      lots = lots.filter(l => (l.mat_type || '') === filters.mat_type);
    }
    if (_keyword) {
      const kw = _keyword.toLowerCase();
      lots = lots.filter(l =>
        (l.display_id||'').toLowerCase().includes(kw) ||
        (l.lot_id||'').toLowerCase().includes(kw) ||
        ((Store.getLine(l.line_id)||{}).line_code||'').toLowerCase().includes(kw)
      );
    }
    // [20260422s] ソート適用
    lots.sort(_makeSortComparator(_lotSort, {
      hatchDays: function(l){ var h = _resolveHatchDate({ direct: l.hatch_date }); return h ? h.days : null; },
      collectDays: function(l){ var c = _resolveCollectDate(l); return c ? c.days : null; },
      count: function(l){ return +l.count || 0; },
      displayId: function(l){ return String(l.display_id || l.lot_id || ''); },
    }));
    const lines = Store.getDB('lines') || [];
    const title = isLineLimited
      ? (fixedLine ? (fixedLine.line_code || fixedLine.display_id) + ' の飼育管理' : '飼育管理')
      : '飼育管理';
    const headerOpts = isLineLimited
      ? { back: true, action: { fn: "routeTo('lot-new',{lineId:'" + fixedLineId + "'})", icon: '＋' } }
      : { action: { fn: "routeTo('lot-new')", icon: '＋' } };

    const totalCount = lots.reduce((s, l) => s + (+l.count || 0), 0);
    const allUnits = Store.getDB('breeding_units') || [];
    const activeUnitCount = allUnits.filter(u=>(u.status||'active')==='active').length;
    // [20260422q] 個体タブ用カウント
    const _allInds = Store.getDB('individuals') || [];
    const _activeIndCount = _allInds.filter(i => {
      const s = i.status || 'alive';
      if (isLineLimited && i.line_id !== fixedLineId) return false;
      return s === 'alive' || s === 'larva' || s === 'prepupa' || s === 'pupa' || s === 'adult';
    }).length;

    main.innerHTML = `
      ${UI.header(title, headerOpts)}
      <div class="page-body">
        <div class="filter-bar" style="margin-bottom:8px">
          <button class="pill" onclick="Pages._lotUnitTabSwitch('ind')">🐛 個体 (${_activeIndCount})</button>
          <button class="pill" onclick="Pages._lotUnitTabSwitch('unit')">📦 ユニット (${activeUnitCount})</button>
          <button class="pill active" onclick="Pages._lotUnitTabSwitch('lot')">🥚 ロット (${lots.length})</button>
        </div>
        <div style="margin-bottom:8px">
          <input type="text" placeholder="🔍 ロットID・ラインで検索..." id="lot-kw-input"
            value="${_keyword}"
            style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);
              background:var(--bg2);font-size:.88rem;color:var(--text1);box-sizing:border-box"
            oninput="Pages._lotUnitKw(this.value)">
        </div>
        <div class="filter-bar" id="lot-stage-filter">
          ${_lotStageFilters(filters.stages)}
        </div>
        <div class="filter-bar" style="margin-bottom:4px" id="lot-mat-filter">
          ${['','T0','T1','T2','T3','MD'].map(m =>
            `<button class="pill ${filters.mat_type===m?'active':''}" data-mval="${m}">${m||'M:全て'}</button>`
          ).join('')}
        </div>
        ${!isLineLimited ? `<div class="filter-bar" id="lot-line-filter">
          <button class="pill ${!filters.line_ids.length ? 'active' : ''}" data-val="">ライン全て</button>
          ${lines.map(l =>
            '<button class="pill ' + (filters.line_ids.includes(l.line_id) ? 'active' : '') + '" data-val="' + l.line_id + '">' + _lineFilterLabel(l) + '</button>'
          ).join('')}
        </div>` : ''}
        ${_sortBarHTML('lot', _lotSort, [
          { val:'id',          label:'ID' },
          { val:'hatch_new',   label:'🐣新' },
          { val:'hatch_old',   label:'🐣古' },
          { val:'collect_new', label:'🥚新' },
          { val:'count_desc',  label:'📊頭数' },
        ])}
        <div class="sec-hdr">
          <span class="sec-title">${lots.length}ロット / 計<strong>${totalCount}</strong>頭</span>
          <div style="display:flex;gap:8px;align-items:center">
            ${isLineLimited && fixedLineId ? `<button class="btn btn-ghost btn-sm" style="font-size:.72rem;padding:4px 10px"
              onclick="event.stopPropagation();routeTo('lot-bulk',{lineId:'${fixedLineId}'})">📦 一括ロット化</button>` : ''}
            <span class="sec-more" onclick="Pages._lotShowDissolved()">分割済も表示</span>
          </div>
        </div>
        <div id="lot-list-body">
          ${lots.length ? lots.map(_lotCardHTML).join('') : UI.empty('ロットがありません', isLineLimited ? 'このラインにロットがありません' : 'ラインから産卵セット経由で登録できます')}
        </div>
      </div>`;

    // [20260423b] ステージ複数選択トグル
    document.getElementById('lot-stage-filter').addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      const v = p.dataset.val;
      if (v === '') {
        filters.stages = [];
      } else {
        const idx = filters.stages.indexOf(v);
        if (idx >= 0) filters.stages.splice(idx, 1);
        else filters.stages.push(v);
      }
      render();
    });
    const _lotMatFilter = document.getElementById('lot-mat-filter');
    if (_lotMatFilter) _lotMatFilter.addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      filters.mat_type = p.dataset.mval === filters.mat_type ? '' : p.dataset.mval;
      render();
    });
    // [20260423b] ライン複数選択トグル
    if (!isLineLimited) {
      const lineFilter = document.getElementById('lot-line-filter');
      if (lineFilter) lineFilter.addEventListener('click', e => {
        const p = e.target.closest('.pill'); if (!p) return;
        const v = p.dataset.val;
        if (v === '') {
          filters.line_ids = [];
        } else {
          const idx = filters.line_ids.indexOf(v);
          if (idx >= 0) filters.line_ids.splice(idx, 1);
          else filters.line_ids.push(v);
        }
        render();
      });
    }
    // [20260422s] ソートバー
    const _lSortBar = document.getElementById('lot-sort-bar');
    if (_lSortBar) _lSortBar.addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      _lotSort = p.dataset.sort;
      render();
    });
  }

  Pages._lotUnitTabSwitch = function(tab) {
    _activeTab = tab;
    _keyword = '';
    // [20260422r] デフォルトが 'ind' になったので URL 書き込み条件を反転:
    //   'ind' のときは _tab を URL に含めず、それ以外のときだけ _tab=xxx を書く。
    //   routeTo は使わない（使うと Pages.lotList が再実行されてローカルフィルター
    //   状態 (_unitPhase/_unitStatus/_unitMat/_lotStatusMode 等) がリセットされるため）。
    try {
      var hashParts = { page: 'lot-list' };
      if (fixedLineId) hashParts.line_id = fixedLineId;
      if (tab !== 'ind') hashParts._tab = tab;
      var hashStr = new URLSearchParams(hashParts).toString();
      history.replaceState(null, '', '#' + hashStr);
      if (typeof Store !== 'undefined' && Store.navigate) {
        var storeParams = {};
        if (fixedLineId) storeParams.line_id = fixedLineId;
        if (tab !== 'ind') storeParams._tab = tab;
        // 第3引数 true で nav イベント抑止（_renderPage の二重実行を防ぐ）
        Store.navigate('lot-list', storeParams, true);
      }
    } catch (e) { console.warn('[lot] tab switch hash sync failed:', e.message); }
    render();
  };
  Pages._lotUnitKw = function(val) {
    _keyword = val;
    clearTimeout(Pages._lotUnitKwTimer);
    Pages._lotUnitKwTimer = setTimeout(function() { render(); }, 250);
  };

  render();
};

function _lotStageFilters(activeList) {
  // [20260423b] 複数選択対応: activeList は配列
  var arr = Array.isArray(activeList) ? activeList : (activeList ? [activeList] : []);
  const stages = [
    { val:'L1L2',    label:'L1L2'         },
    { val:'L3',      label:'L3'           },
    { val:'PREPUPA', label:'前蛹'          },
    { val:'PUPA',    label:'蛹'           },
    { val:'ADULT_PRE',label:'成虫（未後食）' },
    { val:'ADULT',   label:'成虫（活動開始）'},
  ];
  var all = `<button class="pill ${arr.length === 0 ? 'active' : ''}" data-val="">全て</button>`;
  return all + stages.map(s =>
    `<button class="pill ${arr.includes(s.val) ? 'active' : ''}" data-val="${s.val}">${s.label}</button>`
  ).join('');
}

// ════════════════════════════════════════════════════════════════
// ロットカード — 3列レイアウト（コード | 頭数+情報 | ›）
// ════════════════════════════════════════════════════════════════
function _lotCardHTML(lot) {
  try {
    var lineCode = '';
    var _lm = String(lot.display_id || '').match(/[A-Za-z]{1,4}\d{4}-([A-Za-z][0-9]+)-/i);
    if (_lm) lineCode = _lm[1].toUpperCase();
    if (!lineCode) {
      var _ln = Store.getLine(lot.line_id);
      lineCode = _ln ? (_ln.line_code || _ln.display_id || '') : '';
    }

    var stageCode = lot.stage_life || lot.stage || '';
    var stageLbl  = stageCode ? _lotDisplayStageLabel(stageCode) : '';
    var sColor    = stageCode ? stageColor(stageCode) : 'var(--text3)';

    var recs = Store.getGrowthRecords(lot.lot_id) || [];
    var latestRec = recs.length
      ? recs.slice().sort(function(a,b){ return String(b.record_date).localeCompare(String(a.record_date)); })[0]
      : null;
    var rawMat  = lot.mat_type || (latestRec && latestRec.mat_type) || '';
    var isMolt  = lot.mat_molt === true || lot.mat_molt === 'true';
    var matLbl  = rawMat === 'T2' && isMolt ? 'T2(M)' : rawMat;

    var count      = parseInt(lot.count, 10) || 0;

    // [20260422s] 採卵日 / 孵化日 / 最終交換
    var _lotCollect = _resolveCollectDate(lot);
    var _lotHatch   = _resolveHatchDate({ direct: lot.hatch_date });
    var _lotLastExc = _getLastFullExchange(lot.lot_id);

    // [20260422t] ステージバッジ (手書き案の右上 L1L2 位置)
    var _stageBadge = stageLbl && stageLbl !== '—'
      ? '<span style="font-size:.72rem;font-weight:700;color:' + sColor + ';'
        + 'border:1px solid ' + sColor + ';border-radius:4px;padding:0 6px;'
        + 'line-height:1.5;white-space:nowrap">' + stageLbl + '</span>'
      : '';

    var _matBadge = matLbl ? _matBadgeHTML(matLbl) : '';

    // ロットステータス表示
    var _lotStLbl, _lotStColor;
    if (lot.status === 'dissolved' || lot.status === 'split') { _lotStLbl = '分割済'; _lotStColor = 'var(--text3)'; }
    else if (lot.status === 'for_sale') { _lotStLbl = '販売候補'; _lotStColor = '#9c27b0'; }
    else if (lot.status === 'listed')   { _lotStLbl = '出品中';   _lotStColor = '#ff9800'; }
    else { _lotStLbl = '飼育中'; _lotStColor = 'var(--green)'; }

    return '<div class="card" style="padding:10px 10px;cursor:pointer;display:flex;align-items:stretch;gap:0;margin-bottom:8px"'
      + ' onclick="routeTo(\'lot-detail\',{lotId:\'' + lot.lot_id + '\'})">'

      // ①列: ライン + 頭数
      + '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;'
      +   'width:36px;padding-right:8px;border-right:1px solid var(--border2);margin-right:8px;flex-shrink:0">'
      +   '<div style="font-family:var(--font-mono);font-size:.98rem;font-weight:800;color:var(--gold);line-height:1.2">' + (lineCode || '—') + '</div>'
      +   '<div style="font-size:.7rem;font-weight:700;color:var(--text2);margin-top:3px">' + count + '<span style="font-size:.6rem;color:var(--text3)">頭</span></div>'
      + '</div>'

      // ②列: ID + 採卵日 + 孵化日 + 最終交換 (3-4段)
      + '<div style="display:flex;flex-direction:column;justify-content:center;gap:1px;min-width:0;flex:1;margin-right:6px">'
      +   '<div style="font-family:var(--font-mono);font-size:.88rem;font-weight:700;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
      +     (lot.display_id || '')
      +   '</div>'
      +   (_lotCollect ? '<div style="font-size:.68rem;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🥚採卵 ' + _lotCollect.value + '</div>' : '')
      +   (_lotHatch   ? '<div style="font-size:.68rem;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🐣孵化 ' + _formatHatchDate(_lotHatch) + '</div>' : '')
      +   (_lotLastExc ? '<div style="font-size:.68rem;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🔄交換 ' + _formatAgeDate(_lotLastExc, rawMat) + '</div>' : '')
      + '</div>'

      // ③列: ステージバッジ (上) + マット種別バッジ (下) - 中揃え
      + '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;flex-shrink:0;margin-right:6px;min-width:48px">'
      +   _stageBadge
      +   _matBadge
      + '</div>'

      // ④列: ステータス + ›
      + '<div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:2px;flex-shrink:0;min-width:50px">'
      +   '<span style="font-size:.68rem;font-weight:700;color:' + _lotStColor + ';white-space:nowrap">' + _lotStLbl + '</span>'
      +   '<span style="color:var(--text3);font-size:1rem">›</span>'
      + '</div>'
      + '</div>';
  } catch(e) {
    return '<div class="card" style="padding:12px 14px;cursor:pointer;margin-bottom:8px"'
      + ' onclick="routeTo(\'lot-detail\',{lotId:\'' + (lot.lot_id||'') + '\'})">'
      + '<div style="font-size:.85rem">' + (lot.display_id || lot.lot_id || '') + '</div>'
      + '</div>';
  }
}


Pages._lotShowDissolved = function () {
  const dissolved = (Store.getDB('lots') || []).filter(l =>
    l.status === 'dissolved' || l.status === 'split'
  );
  if (!dissolved.length) { UI.toast('分割済みロットはありません', 'info'); return; }
  const el = document.getElementById('lot-list-body');
  if (!el) return;
  el.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;opacity:.6">
    <div style="font-size:.72rem;color:var(--text3);padding:4px 0">── 分割済みロット ──</div>
    ${dissolved.map(_lotCardHTML).join('')}
  </div>`);
  document.querySelector('[onclick*="_lotShowDissolved"]')?.style.setProperty('display','none');
};

// ════════════════════════════════════════════════════════════════
// ロット詳細
// ════════════════════════════════════════════════════════════════
Pages.lotDetail = async function (lotId) {
  if (lotId && typeof lotId === 'object') lotId = lotId.id || lotId.lotId || lotId.lot_id || '';
  const main = document.getElementById('main');
  if (!lotId) {
    main.innerHTML = UI.header('ロット詳細', { back: true })
      + '<div class="page-body">' + UI.empty('IDが指定されていません') + '</div>';
    return;
  }

  let lot = Store.getLot(lotId);
  if (lot) {
    try { _renderLotDetail(lot, main); } catch(e) {
      main.innerHTML = UI.header('ロット詳細', { back: true })
        + '<div class="page-body">' + UI.empty('表示エラー: ' + e.message) + '</div>';
    }
  } else {
    main.innerHTML = UI.header('ロット詳細', { back: true }) + UI.spinner();
  }

  try {
    const res = await API.lot.get(lotId);
    if (Store.getPage() !== 'lot-detail') return;
    const curId = Store.getParams().lotId || Store.getParams().id || Store.getParams().lot_id || '';
    if (curId && curId !== lotId) return;
    lot = res.lot || res;
    try { _renderLotDetail(lot, main); } catch(e) {
      main.innerHTML = UI.header('ロット詳細', { back: true })
        + '<div class="page-body">' + UI.empty('表示エラー: ' + e.message) + '</div>';
    }
  } catch (e) {
    if (Store.getPage() === 'lot-detail') {
      if (!lot) {
        main.innerHTML = UI.header('ロット詳細', { back: true })
          + '<div class="page-body">' + UI.empty('取得失敗: ' + e.message) + '</div>';
      }
    }
  }
};

function _renderLotDetail(lot, main) {
  const age      = Store.calcAge(lot.hatch_date);
  const line     = Store.getLine(lot.line_id);
  const lineCode = line ? (line.line_code || line.display_id) : '';
  const records  = lot._growthRecords || Store.getGrowthRecords(lot.lot_id) || [];
  const _fromNew = !!(Store.getParams()._fromNew);
  let settings = {};
  try { if (typeof Store.getSettings === 'function') settings = Store.getSettings() || {}; } catch(_e) {}

  const latestRec = records.length > 0
    ? [...records].sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))[0]
    : null;

  const dispContainer = (latestRec?.container) || lot.container_size || '—';
  const dispWeight    = latestRec?.weight_g ? latestRec.weight_g + 'g' : null;
  const dispMatType   = (latestRec?.mat_type) || lot.mat_type || '—';
  const isMatMolt     = lot.mat_molt === true || lot.mat_molt === 'true' || lot.mat_molt === '1';
  const dispMatLabel  = (typeof matLabel === 'function') ? matLabel(dispMatType, isMatMolt) : dispMatType;
  const stageLife     = lot.stage_life || '';
  const dispStage     = (latestRec?.stage) || lot.stage || '—';
  const lastMatDate   = lot.mat_changed_at || latestRec?.record_date || '';
  const override      = lot.next_change_override_date || '';
  const exDays = (typeof getExchangeDays === 'function')
    ? getExchangeDays(dispMatType, settings, stageLife || dispStage, lot.count)
    : 60;
  const exchAlert     = (typeof calcExchangeAlert === 'function')
    ? calcExchangeAlert(lastMatDate, exDays, override, settings) : null;
  const alertBadge    = (typeof exchangeAlertBadge === 'function' && exchAlert)
    ? exchangeAlertBadge(exchAlert) : '';
  const recMat        = (typeof recommendedMat === 'function')
    ? recommendedMat(stageLife || dispStage) : null;
  const exchangeMode  = (settings && settings.mat_exchange_mode) || 'normal';
  const modeBadge     = exchangeMode === 'hybrid'
    ? '<span style="font-size:.65rem;color:var(--blue);border:1px solid rgba(91,168,232,.35);'
      + 'border-radius:4px;padding:1px 5px;margin-left:4px">ハイブリッド</span>'
    : '';
  const nextChangeLbl = override
    ? override + ' <span style="font-size:.68rem;color:var(--amber)">(延長)</span>'
    : (exchAlert && exchAlert.nextDate ? exchAlert.nextDate : '—');

  main.innerHTML = `
    ${UI.header(lot.display_id, {
      back: true,
      action: { fn: `_lotQuickActions('${lot.lot_id}')`, icon: '…' }
    })}
    <div class="page-body">

      ${_fromNew ? `
      <div style="background:rgba(200,168,75,.12);border:1px solid rgba(200,168,75,.35);
        border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px;margin-bottom:4px">
        <span style="font-size:1.1rem">✅</span>
        <div style="flex:1">
          <div style="font-size:.85rem;font-weight:700;color:var(--gold)">ロットを登録しました</div>
          <div style="font-size:.75rem;color:var(--text3)">続けてラベルを発行できます</div>
        </div>
        <button class="btn btn-ghost btn-sm"
          onclick="routeTo('label-gen',{targetType:'LOT',targetId:'${lot.lot_id}'})">
          🏷 ラベル発行
        </button>
      </div>` : ''}

      <div class="card card-gold" style="padding:14px 16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:1.35rem;font-weight:800;color:var(--gold);letter-spacing:.02em;line-height:1">
              ${lineCode || '—'}
            </span>
            <span style="font-size:.72rem;color:var(--text3);font-family:var(--font-mono);
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">
              ${lot.display_id}
            </span>
          </div>
          <div style="text-align:right">
            <span style="font-size:1.6rem;font-weight:800;color:var(--text1);line-height:1">${lot.count}</span>
            <span style="font-size:.9rem;font-weight:600;color:var(--text3)">頭</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:.78rem;font-weight:700;color:var(--blue);
              padding:3px 10px;border:1px solid rgba(91,168,232,.4);border-radius:20px;
              background:rgba(91,168,232,.08)">
              ${_lotDisplayStageLabel(stageLife || (dispStage !== '—' ? dispStage : lot.stage))}
            </span>
          </div>
          ${age ? `<div style="text-align:right;flex-shrink:0">
            <div style="font-size:.65rem;color:var(--text3);text-align:right">日齢</div>
            <div style="font-weight:700;font-size:1.05rem;color:var(--text1);line-height:1.1">
              ${age.days}
            </div>
            ${age.totalDays >= 14 ? `<div style="font-size:.65rem;color:var(--text3)">${age.weeks}</div>` : ''}
          </div>` : ''}
        </div>
        ${alertBadge ? `<div style="margin-top:8px">${alertBadge}</div>` : ''}
      </div>

      <!-- [20260422k] 上部ボタン 3行構成
           Row1: [📷 成長記録][🏷️ ラベル発行]
           Row2: [📅 孵化日を設定]  (hatch_date 未設定時のみ)
           Row3: [🐛 T1移行（割り出し）を開始]  (t1_done=false) / ✅ T1移行済み -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button style="padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.92rem;
          background:var(--green);color:#fff;border:none;cursor:pointer"
          onclick="routeTo('growth-rec',{targetType:'LOT',targetId:'${lot.lot_id}',displayId:'${lot.display_id}'})">
          📷 成長記録
        </button>
        <button style="padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.92rem;
          background:var(--surface3,#3a3a4a);color:var(--gold);border:1px solid rgba(200,168,75,.4);cursor:pointer"
          onclick="routeTo('label-gen',{targetType:'LOT',targetId:'${lot.lot_id}'})">
          🏷️ ラベル発行
        </button>
      </div>
      ${!lot.hatch_date ? `
      <button class="btn btn-full" style="background:var(--amber);color:#1a1a1a;font-weight:700;margin-top:8px"
        onclick="Pages._lotSetHatchDate('${lot.lot_id}')">
        📅 孵化日を設定
      </button>` : ''}
      ${!lot.t1_done ? `
      <button class="btn btn-full" style="background:var(--green);color:#fff;font-weight:700;margin-top:8px"
        onclick="Pages.t1SessionStart('${lot.lot_id}')">
        🐛 T1移行（割り出し）を開始
      </button>` : `
      <div style="background:rgba(76,175,120,.1);border:1px solid rgba(76,175,120,.3);border-radius:8px;padding:10px;text-align:center;font-size:.82rem;color:var(--green);margin-top:8px;font-weight:700">
        ✅ T1移行済み
      </div>`}

      <div class="card">
        <div class="card-title">ロット情報</div>
        <div class="info-list">
          ${_infoRow('ライン', line ? `<span onclick="routeTo('line-detail',{lineId:'${line.line_id}'})" style="color:var(--blue);cursor:pointer">${lineCode}</span>` : lot.line_id)}
          ${dispWeight ? _infoRow('最新体重', `<span style="font-weight:700;color:var(--green)">${dispWeight}</span>`) : ''}
          ${stageLife  ? _infoRow('生体ステージ', `<span style="font-weight:700;color:var(--blue)">${_lotDisplayStageLabel(stageLife)}</span>`) : ''}
          ${_infoRow('飼育ステージ', dispStage !== '—' ? dispStage : (lot.stage || '—'))}
          ${_infoRow('容器', dispContainer)}
          ${_infoRow('マット', dispMatLabel + (alertBadge ? ' ' + alertBadge : ''))}
          ${recMat && recMat !== dispMatType ? _infoRow('推奨マット', `<span style="font-size:.78rem;color:var(--amber)">→ ${recMat}</span>`) : ''}
          ${_infoRow('孵化日', lot.hatch_date || '未設定')}
          ${_infoRow('最終交換', lastMatDate || '—')}
          ${exDays > 0 ? _infoRow('次回交換予定', nextChangeLbl + modeBadge) : ''}
          ${override ? _infoRow('延長メモ', lot.mat_alert_note || '（延長中）') : ''}
          ${(() => {
            if (!lot.parent_lot_id) return '';
            const _pLot = Store.getLot(lot.parent_lot_id);
            const _pDisp = _pLot ? (_pLot.display_id || '') : '';
            const _pLabel = _pDisp || '—';
            return _infoRow('分割元',
              '<span style="color:var(--blue);cursor:pointer"'
              + ' onclick="routeTo(' + "'lot-detail'" + ',{lotId:' + "'" + lot.parent_lot_id + "'" + '})">'
              + _pLabel + '</span>');
          })()}
          ${lot.note ? _infoRow('メモ', lot.note) : ''}
        </div>
      </div>

      <!-- 血統・種親（20260418f）-->
      ${_lotRenderParentageCard(line, { page: 'lot-detail', params: { lotId: lot.lot_id } })}

      <!-- [20260422k] 旧: 📅 孵化日を設定 / 🐛 T1移行 はここにあったが
           上部ボタン群の直下に移動した -->

      <div class="accordion" id="acc-lot-growth">
        <div class="acc-hdr open" onclick="_toggleAcc('acc-lot-growth')">
          成長記録（${records.length}件）<span class="acc-arrow">▼</span>
        </div>
        <div class="acc-body open">
          ${records.length ? UI.weightTable(records) : UI.empty('記録なし')}
        </div>
      </div>

      <!-- [20260422k] 旧: 🌱 生体ステージ / 🔄 マット交換 ボタンはここにあったが
           生体ステージは「✏️ ロット情報を修正」モーダルに統合したため削除 -->

      ${_renderLotSaleActions(lot)}

      ${_renderLotUnitsList(lot)}

    </div>`;
}


// ════════════════════════════════════════════════════════════════
// ロット由来ユニット一覧
// ════════════════════════════════════════════════════════════════
function _renderLotUnitsList(lot) {
  console.log('[LOT_UNITS] render start - lot:', lot.lot_id);

  var units = [];
  try {
    units = Store.getUnitsByOriginLotId
      ? Store.getUnitsByOriginLotId(lot.lot_id)
      : [];
  } catch(_e) {}

  console.log('[LOT_UNITS] units found:', units.length);
  if (units.length === 0) return '';

  function _stgLbl(s) {
    var M = {
      L1:'L1L2', L2_EARLY:'L1L2', L2_LATE:'L1L2', T1:'L1L2', L1L2:'L1L2',
      L3_EARLY:'L3', L3_MID:'L3', L3_LATE:'L3', T2:'L3', T2A:'L3', T2B:'L3', L3:'L3',
      PREPUPA:'前蛹', PUPA:'蛹', ADULT_PRE:'成虫', ADULT:'成虫',
    };
    return M[s] || s || '—';
  }
  function _stCol(s) {
    return s === 'active' ? 'var(--green)' : s === 'individualized' ? 'var(--blue)' : 'var(--text3)';
  }
  function _stLbl(s) {
    return s === 'active' ? '飼育中' : s === 'individualized' ? '個別化済' : (s || '不明');
  }

  var rows = units.map(function(u) {
    var did     = u.display_id || u.unit_id || '—';
    var heads   = u.head_count || u.member_count || 2;
    var stage   = _stgLbl(u.stage_phase || u.current_stage || '');
    var updated = (u.last_updated || u.updated_at || '').slice(0, 10) || '—';
    var sc      = _stCol(u.status);
    var sl      = _stLbl(u.status);
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;'
      + 'border-bottom:1px solid var(--border2);cursor:pointer" '
      + 'onclick="routeTo(' + "'unit-detail'" + ',{unitDisplayId:' + "'" + did + "'" + '})">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-family:var(--font-mono);font-size:.82rem;font-weight:700;color:var(--gold)">' + did + '</div>'
      + '<div style="font-size:.72rem;color:var(--text2);margin-top:2px">' + stage + '&nbsp;/&nbsp;' + heads + '頭</div>'
      + '<div style="font-size:.68rem;color:var(--text3);margin-top:1px">最終更新: ' + updated + '</div>'
      + '</div>'
      + '<span style="font-size:.7rem;padding:2px 7px;border-radius:4px;border:1px solid ' + sc + ';color:' + sc + '">' + sl + '</span>'
      + '<span style="color:var(--text3);font-size:.85rem">›</span>'
      + '</div>';
  }).join('');

  return '<div class="card" style="margin-top:8px">'
    + '<div class="card-title">このロット由来のユニット（' + units.length + '件）</div>'
    + rows
    + '</div>';
}


// ════════════════════════════════════════════════════════════════
// ロット分割
// ════════════════════════════════════════════════════════════════
let _splitCards = [];
let _splitContext = {};

Pages._showSplitModal = function (lotId, totalCount, stage, lineId, hatchDate, displayId) {
  _splitContext = { lotId, totalCount: +totalCount, stage, lineId, hatchDate, displayId };
  _splitCards = [
    { count: Math.floor(totalCount/2), container:'', mat:'', size_category:'', sex_hint:'', weight:'', note:'' },
    { count: totalCount - Math.floor(totalCount/2), container:'', mat:'', size_category:'', sex_hint:'', weight:'', note:'' },
  ];
  _renderSplitModal();
};

function _renderSplitModal() {
  const { lotId, totalCount, stage, hatchDate, displayId } = _splitContext;
  const usedCount = _splitCards.reduce((s,c) => s + (c.count||0), 0);
  const remaining = totalCount - usedCount;
  const totalOk   = remaining === 0;

  const cardHtml = _splitCards.map((c, i) => {
    const suffix = String.fromCharCode(65 + i);
    const isOne  = (c.count === 1);
    return `<div style="border:1px solid ${isOne?'var(--green)':'var(--border)'};border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-family:var(--font-mono);font-weight:700;color:var(--gold);font-size:1rem">-${suffix}</span>
        ${isOne ? '<span style="font-size:.7rem;padding:2px 8px;background:var(--green);color:#fff;border-radius:20px">自動個体化</span>' : ''}
        <button style="margin-left:auto;color:var(--red);background:none;border:none;font-size:1rem;cursor:pointer"
          onclick="_splitCards.splice(${i},1);_renderSplitModal()">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">頭数 *</div>
          <input type="number" class="input" min="1" value="${c.count||1}" style="width:100%"
            onchange="_splitCards[${i}].count=Math.max(1,+this.value||1);_renderSplitModal()">
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">容器</div>
          <select class="input" style="width:100%" onchange="_splitCards[${i}].container=this.value">
            ${['','1.8L','2.7L','4.8L'].map(s=>`<option value="${s}" ${c.container===s?'selected':''}>${s||'選択…'}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">マット</div>
          <select class="input" style="width:100%" onchange="_splitCards[${i}].mat=this.value">
            ${[{code:'',label:'選択…'},...MAT_TYPES].map(m=>`<option value="${m.code}" ${c.mat===m.code?'selected':''}>${m.label||m.code||'選択…'}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">サイズ区分</div>
          <select class="input" style="width:100%" onchange="_splitCards[${i}].size_category=this.value">
            ${['','大','中','小'].map(s=>`<option value="${s}" ${c.size_category===s?'selected':''}>${s||'未分類'}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">雌雄</div>
          <select class="input" style="width:100%" onchange="_splitCards[${i}].sex_hint=this.value">
            ${['','♂','♀','不明'].map(s=>`<option value="${s}" ${c.sex_hint===s?'selected':''}>${s||'未判別'}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">分割時体重 (g)</div>
          <input type="number" class="input" step="0.1" min="0" value="${c.weight||''}"
            placeholder="任意" style="width:100%"
            oninput="_splitCards[${i}].weight=this.value">
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:2px">メモ</div>
          <input type="text" class="input" value="${c.note||''}" style="width:100%"
            oninput="_splitCards[${i}].note=this.value">
        </div>
      </div>
    </div>`;
  }).join('');

  _showModal('ロット分割', `
    <div style="font-size:.82rem;color:var(--text3);margin-bottom:8px">
      元ロット: ${displayId} / ${totalCount}頭 / ${stage}
    </div>
    <div style="font-size:.85rem;font-weight:700;color:${totalOk?'var(--green)':'var(--amber)'};margin-bottom:8px">
      割当: ${usedCount}頭 / 残り: ${remaining}頭 ${totalOk?'✅':''}
    </div>
    <div style="max-height:50vh;overflow-y:auto" id="split-cards-wrap">${cardHtml}</div>
    <button class="btn btn-ghost btn-full" style="margin-top:4px"
      onclick="_splitCards.push({count:1,container:'',mat:'',size_category:'',sex_hint:'',weight:'',note:''});_renderSplitModal()">
      ＋ 分割先を追加
    </button>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2"
        onclick="Pages._execSplit('${lotId}',${totalCount})"
        ${totalOk?'':'disabled style="opacity:.5"'}>
        分割実行
      </button>
    </div>`);
}

Pages._execSplit = async function (lotId, maxCount) {
  const counts  = _splitCards.map(c => c.count||0);
  const details = _splitCards.map(c => ({
    container_size:  c.container || '',
    mat_type:        c.mat       || '',
    size_category:   c.size_category || '',
    sex_hint:        c.sex_hint  || '',
    note:            c.note      || '',
    initial_weight:  c.weight    || '',
  }));
  const total = counts.reduce((s,n) => s+n, 0);

  if (!counts.length) { UI.toast('分割先を入力してください', 'error'); return; }
  if (total > maxCount) { UI.toast('合計(' + total + ')が元ロット頭数(' + maxCount + ')を超えています', 'error'); return; }
  if (total !== maxCount) { UI.toast('合計(' + total + ')と元ロット(' + maxCount + '頭)が一致していません', 'error'); return; }

  _closeModal();
  try {
    const res = await apiCall(
      () => API.lot.split({ lot_id: lotId, split_counts: counts, split_details: details }),
      counts.length + 'ロットに分割しました'
    );
    await syncAll(true);
    if (res && res.auto_individuals && res.auto_individuals.length) {
      const names = res.auto_individuals.map(i => i.display_id).join(', ');
      UI.toast('自動個体化: ' + names, 'success');
    }
    const ctx = _splitContext;
    if (ctx.lineId) routeTo('lot-list', { line_id: ctx.lineId });
    else routeTo('lot-list');
  } catch (e) {}
};

Pages._lotEditStage = function (lotId, currentStage) {
  _showModal('ステージ変更', `
    <div class="form-section">
      ${UI.field('生体ステージ', UI.select('new-stage',
        STAGE_LIST.map(s => ({ code: s.code, label: s.label })),
        currentStage || 'L1'))}
      <div style="font-size:.72rem;color:var(--text3);margin-top:-8px;margin-bottom:8px">
        ステージ（生体の成長段階）とマット（飼育環境）は別々に設定します
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" onclick="Pages._lotStageUpdate('${lotId}')">変更</button>
      </div>
    </div>`);
};

Pages._lotStageUpdate = async function (lotId) {
  const stageLife = document.querySelector('[name="new-stage"]')?.value;
  if (!stageLife) return;
  _closeModal();
  try {
    await apiCall(
      () => API.lot.update({ lot_id: lotId, stage_life: stageLife }),
      _lotDisplayStageLabel(stageLife) + ' に変更しました'
    );
    Store.patchDBItem('lots', 'lot_id', lotId, { stage_life: stageLife });
    Pages.lotDetail(lotId);
  } catch (e) {}
};

Pages._lotEditMat = function (lotId) {
  const lot = Store.getLot(lotId) || {};
  const today = new Date().toISOString().split('T')[0];
  _showModal('マット交換', `
    <div class="form-section">
      ${UI.field('マット種別', `
        <select id="new-mat" class="input" onchange="Pages._lotMatToggleMolt(this.value)">
          ${MAT_TYPES.map(m =>
            '<option value="' + m.code + '"' + (lot.mat_type === m.code ? ' selected' : '') + '>' + m.label + '</option>'
          ).join('')}
        </select>`)}
      <div id="new-malt-wrap" style="display:${lot.mat_type==='T2'?'block':'none'};margin-top:4px">
        <label style="display:flex;align-items:center;gap:8px;font-size:.85rem">
          <input type="checkbox" id="new-malt" ${(lot.mat_molt === true || lot.mat_molt === 'true' || lot.mat_molt === '1') ? 'checked' : ''}>
          モルトパウダー入り（T2(M)として記録）
        </label>
      </div>
      ${UI.field('交換日', '<input type="date" id="new-mat-date" class="input" value="' + today + '">')}

      <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px">
        <div style="font-size:.78rem;font-weight:700;color:var(--text3);margin-bottom:8px">
          交換せず延長する場合
        </div>
        <div style="display:flex;gap:8px">
          ${EXTEND_OPTIONS.map(opt =>
            '<button class="btn btn-ghost btn-sm" onclick="Pages._lotExtend(\'' + lotId + '\',' + opt.days + ')">' + opt.label + '</button>'
          ).join('')}
        </div>
        <div style="font-size:.72rem;color:var(--text3);margin-top:4px">
          延長した場合は交換モーダルを閉じます
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" onclick="Pages._lotMatUpdate('${lotId}')">交換した</button>
      </div>
    </div>`);
};

Pages._lotMatToggleMolt = function (matType) {
  const wrap = document.getElementById('new-malt-wrap');
  if (wrap) wrap.style.display = matType === 'T2' ? 'block' : 'none';
};

Pages._lotFormToggleMolt = function (matType) {
  const wrap = document.getElementById('lot-form-malt-wrap');
  if (wrap) wrap.style.display = matType === 'T2' ? 'block' : 'none';
};

Pages._lotMatUpdate = async function (lotId) {
  const mat   = document.getElementById('new-mat')?.value;
  const malt  = document.getElementById('new-malt')?.checked || false;
  const date  = document.getElementById('new-mat-date')?.value || '';
  _closeModal();
  const matDate = (date || new Date().toISOString().split('T')[0]).replace(/-/g,'/');
  try {
    await apiCall(() => API.lot.update({
      lot_id: lotId, mat_type: mat, mat_molt: malt, mat_changed_at: matDate,
      next_change_override_date: '',
    }), matLabel(mat, malt) + ' に交換しました');
    Store.patchDBItem('lots', 'lot_id', lotId, {
      mat_type: mat, mat_molt: malt, mat_changed_at: matDate, next_change_override_date: '',
    });
    Pages.lotDetail(lotId);
  } catch (e) {}
};

Pages._lotExtend = async function (lotId, days) {
  _closeModal();
  const lot = Store.getLot(lotId) || {};
  var baseDate = lot.next_change_override_date || lot.mat_changed_at || '';
  var next;
  if (baseDate) {
    next = new Date(String(baseDate).replace(/\//g,'-'));
    next.setDate(next.getDate() + days);
  } else {
    next = new Date();
    next.setDate(next.getDate() + days);
  }
  var overrideDate = next.toISOString().slice(0,10).replace(/-/g,'/');
  try {
    await apiCall(() => API.lot.update({ lot_id: lotId, next_change_override_date: overrideDate }),
      days + '日延長しました（次回: ' + overrideDate + '）');
    Store.patchDBItem('lots', 'lot_id', lotId, { next_change_override_date: overrideDate });
    Pages.lotDetail(lotId);
  } catch (e) {}
};

Pages.lotNew = function (params = {}) {
  const main  = document.getElementById('main');
  const lines = Store.getDB('lines') || [];

  // [20260423d] 戻るボタンは必ず飼育管理のロットタブへ (個体タブにリセットされない)
  const _backFn = "routeTo('lot-list',{_tab:'lot'})";

  main.innerHTML = `
    ${UI.header('ロット登録', { back: true, backFn: _backFn })}
    <div class="page-body">
      <form id="lot-form" class="form-section">
        ${UI.field('ライン', UI.select('line_id',
          lines.map(l => ({ code: l.line_id, label: `${l.line_code || l.display_id}${l.line_name ? ' / '+l.line_name : ''}` })),
          params.lineId || ''), true)}
        <div class="form-row-2">
          ${UI.field('ステージ', UI.select('stage_life',
            STAGE_LIST.map(s => ({ code: s.code, label: s.label })),
            'L1L2'))}
          ${UI.field('頭数', UI.input('count', 'number', '5', '頭数'))}
        </div>
        <div class="form-row-2">
          ${UI.field('孵化日', UI.input('hatch_date', 'date', ''))}
          ${UI.field('容器', UI.select('container_size', [
            {code:'',     label:'— 未選択 —'},
            {code:'1.8L', label:'1.8L'},
            {code:'2.7L', label:'2.7L'},
            {code:'4.8L', label:'4.8L'},
          ], '1.8L'))}
        </div>
        ${UI.field('マット種別', `
          <select name="mat_type" id="lot-form-mat" class="input"
            onchange="Pages._lotFormToggleMolt(this.value)">
            ${MAT_TYPES.map(m => '<option value="' + m.code + '"' + (m.code === 'T0' ? ' selected' : '') + '>' + m.label + '</option>').join('')}
          </select>`)}
        <div id="lot-form-malt-wrap" style="display:none">
          ${UI.field('モルト（T2のみ）', `<label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" name="mat_molt"> モルトパウダー入り（T2(M)として記録）
          </label>`)}
        </div>
        ${UI.field('メモ', UI.input('note', 'text', '', '任意のメモ'))}
        <div style="display:flex;gap:10px;margin-top:4px">
          <button type="button" class="btn btn-ghost" style="flex:1" onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2" onclick="Pages._lotSave()">登録</button>
        </div>
      </form>
    </div>`;
};

Pages._lotSave = async function () {
  const form = document.getElementById('lot-form');
  const data = UI.collectForm(form);
  if (!data.line_id) { UI.toast('ラインを選択してください', 'error'); return; }
  if (data.hatch_date) data.hatch_date = data.hatch_date.replace(/-/g, '/');
  data.count = +data.count || 1;
  if (data.stage_life && !data.stage) { data.stage = data.stage_life; }
  data.mat_molt = !!data.mat_molt;
  try {
    const res = await apiCall(() => API.lot.create(data), 'ロットを登録しました');
    await syncAll(true);
    routeTo('lot-detail', { lotId: res.lot_id, _fromNew: true });
  } catch (e) {}
};

function _lotQuickActions(lotId) {
  const _ql = Store.getLot(lotId);
  const _t1done = _ql && _ql.t1_done;
  const _canT1  = _ql && !_t1done;
  const items = [
    { label: '✏️ ロット情報を修正', fn: () => Pages._lotEdit(lotId) },
    { label: '📷 成長記録', fn: () => {
        const _l = Store.getLot(lotId);
        routeTo('growth-rec', { targetType: 'LOT', targetId: lotId, displayId: _l?.display_id || lotId });
      } },
    { label: '🏷️ ラベル発行', fn: () => routeTo('label-gen', { targetType: 'LOT', targetId: lotId }) },
  ];
  if (_canT1) {
    items.unshift({ label: '🐛 T1移行（割り出し）', fn: () => {
      if (typeof Pages.t1SessionStart === 'function') {
        Pages.t1SessionStart(lotId);
      } else {
        UI.toast('T1移行セッションが利用できません', 'error');
      }
    }});
  }
  UI.actionSheet(items);
}

Pages._lotEdit = function (lotId) {
  const lot   = Store.getLot(lotId);
  if (!lot) { UI.toast('ロットが見つかりません', 'error'); return; }
  const lines = Store.getDB('lines') || [];
  // [20260422k] 生体ステージを編集モーダルに追加（旧 _lotEditStage は廃止方針）
  const _curStage = lot.stage_life || lot.stage || '';
  UI.modal(`
    <div class="modal-title">ロット情報を修正</div>
    <div class="form-section" style="max-height:65vh;overflow-y:auto">
      ${UI.field('ライン', `<select id="le-line" class="input">
        <option value="">— 未選択 —</option>
        ${lines.map(l => `<option value="${l.line_id}" ${l.line_id===lot.line_id?'selected':''}>${l.line_code||l.display_id}${l.line_name?' / '+l.line_name:''}</option>`).join('')}
      </select>
      <div style="font-size:.7rem;color:var(--amber);margin-top:3px">
        ⚠️ 集計がずれている場合のみ変更してください
      </div>`)}
      ${UI.field('生体ステージ', `<select id="le-stage" class="input">
        <option value="">— 未選択 —</option>
        ${STAGE_LIST.map(s => `<option value="${s.code}" ${s.code===_curStage?'selected':''}>${s.label}</option>`).join('')}
      </select>
      <div style="font-size:.7rem;color:var(--text3);margin-top:3px">
        生体（幼虫／前蛹／蛹／成虫）の成長段階
      </div>`)}
      <div class="form-row-2">
        ${UI.field('孵化日', `<input type="date" id="le-hatch" class="input" value="${(lot.hatch_date||'').replace(/\//g,'-')}">`)}
        ${UI.field('頭数', `<input type="number" id="le-count" class="input" value="${lot.count||''}" min="1">`)}
      </div>
      <div class="form-row-2">
        ${UI.field('容器', `<select id="le-container" class="input">
          ${['','1.8L','2.7L','4.8L'].map(s=>`<option value="${s}" ${lot.container_size===s?'selected':''}>${s||'— 未選択 —'}</option>`).join('')}
        </select>`)}
        ${UI.field('マット', `<select id="le-mat" class="input">
          ${[{code:'',label:'— 未選択 —'},...MAT_TYPES].map(m=>`<option value="${m.code}" ${lot.mat_type===m.code?'selected':''}>${m.label}</option>`).join('')}
        </select>`)}
      </div>
      ${UI.field('メモ', `<input type="text" id="le-note" class="input" value="${lot.note||''}" placeholder="任意のメモ">`)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._lotEditSave('${lotId}')">更新</button>
    </div>
  `);
};

Pages._lotEditSave = async function (lotId) {
  const lineId    = document.getElementById('le-line')?.value || '';
  const stageLife = document.getElementById('le-stage')?.value || '';
  const hatch     = document.getElementById('le-hatch')?.value?.replace(/-/g,'/') || '';
  const count     = parseInt(document.getElementById('le-count')?.value || '0');
  const container = document.getElementById('le-container')?.value || '';
  const mat       = document.getElementById('le-mat')?.value || '';
  const note      = document.getElementById('le-note')?.value || '';
  if (lineId && !lineId.startsWith('LINE-')) {
    UI.toast('ライン選択が不正です。内部IDが必要です', 'error'); return;
  }
  const payload = { lot_id: lotId, hatch_date: hatch, count, container_size: container, mat_type: mat, note };
  if (lineId)    payload.line_id    = lineId;
  // [20260422k] 生体ステージも同時保存
  if (stageLife) payload.stage_life = stageLife;
  try {
    UI.loading(true);
    UI.closeModal();
    await API.lot.update(payload);
    const patch = { hatch_date: hatch, count, container_size: container, mat_type: mat, note };
    if (lineId)    patch.line_id    = lineId;
    if (stageLife) patch.stage_life = stageLife;
    Store.patchDBItem('lots', 'lot_id', lotId, patch);
    UI.toast('ロット情報を更新しました ✅');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('更新失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

Pages._lotSetHatchDate = function (lotId) {
  UI.modal(`
    <div class="modal-title">📅 孵化日を設定</div>
    <div class="form-section">
      ${UI.field('孵化日', `<input type="date" id="lot-hatch-inp" class="input" value="${new Date().toISOString().split('T')[0]}">`)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._lotHatchSave('${lotId}')">設定</button>
    </div>
  `);
};

Pages._lotHatchSave = async function (lotId) {
  const val = document.getElementById('lot-hatch-inp')?.value;
  if (!val) { UI.toast('日付を選択してください'); return; }
  const date = val.replace(/-/g, '/');
  try {
    UI.loading(true);
    UI.closeModal();
    await API.lot.update({ lot_id: lotId, hatch_date: date });
    Store.patchDBItem('lots', 'lot_id', lotId, { hatch_date: date });
    UI.toast('孵化日を設定しました ✅');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('設定失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

function _infoRow(key, val) {
  return `<div class="info-row">
    <span class="info-key">${key}</span>
    <span class="info-val">${val}</span>
  </div>`;
}

// ════════════════════════════════════════════════════════════════
// 一括ロット化
// ════════════════════════════════════════════════════════════════
Pages.lotBulk = function (params = {}) {
  const main    = document.getElementById('main');
  const lineId  = params.lineId || params.line_id || '';
  const line    = lineId ? Store.getLine(lineId) : null;
  const lines   = Store.getDB('lines') || [];

  function _calcUnLotEggs(lid) {
    if (!lid) return null;
    const allPairings = Store.getDB('pairings') || [];
    const pairings = allPairings.filter(p => p.line_id === lid);
    const eggRecords = Store.getDB('egg_records') || [];
    const lineEggRecs = eggRecords.filter(r => pairings.some(p => p.set_id === r.set_id));
    const totalEggs = lineEggRecs.length > 0
      ? lineEggRecs.reduce((s, r) => s + (parseInt(r.egg_count, 10) || 0), 0)
      : pairings.reduce((s, p) => s + (parseInt(p.total_eggs, 10) || 0), 0);
    const rottenEggs = lineEggRecs.reduce((s, r) => s + (parseInt(r.failed_count, 10) || 0), 0);
    const allLots = Store.filterLots({ line_id: lid, status: 'all' });
    const rootLots = allLots.filter(l => !l.parent_lot_id || l.parent_lot_id === '');
    const lotInitTotal = rootLots.reduce((s, l) => s + (parseInt(l.initial_count, 10) || 0), 0);
    const allInds = Store.getIndividualsByLine(lid);
    const directInds = allInds.filter(i => !i.lot_id || i.lot_id === '');
    return Math.max(0, totalEggs - rottenEggs - lotInitTotal - directInds.length);
  }

  const unLotEggs = _calcUnLotEggs(lineId);
  const lineCode  = line ? (line.line_code || line.display_id) : '';

  let rows = [{ count: '', container_size: '1.8L', mat_type: 'T0', note: '' }];
  let selectedLineId  = lineId;
  let selectedStage   = 'L1';
  let selectedHatch   = '';

  function totalCount() {
    return rows.reduce((s, r) => s + (parseInt(r.count, 10) || 0), 0);
  }

  function renderSummary() {
    const total  = totalCount();
    const remain = unLotEggs !== null ? unLotEggs - total : null;
    const el = document.getElementById('bulk-summary');
    if (!el) return;
    const overCls = remain !== null && remain < 0 ? 'color:var(--red);font-weight:700' : 'color:var(--green)';
    el.innerHTML = `
      <div style="text-align:center">
        <div class="bulk-summary-val" style="color:var(--blue)">${total}</div>
        <div class="bulk-summary-label">入力合計</div>
      </div>
      <div style="text-align:center">
        <div class="bulk-summary-val" style="${overCls}">${remain !== null ? remain : '—'}</div>
        <div class="bulk-summary-label">残り未ロット卵</div>
      </div>
      <div style="text-align:center">
        <div class="bulk-summary-val">${rows.length}</div>
        <div class="bulk-summary-label">ロット数</div>
      </div>`;
  }

  function rowHtml(i, row) {
    return `<div class="bulk-row" id="bulk-row-${i}">
      <div class="bulk-row-header">
        <span class="bulk-row-num">${i + 1}</span>
        <span style="font-size:.82rem;color:var(--text2);flex:1">ロット ${i + 1}</span>
        ${i > 0 ? `<button style="font-size:.75rem;color:var(--red);background:none;border:none;cursor:pointer;padding:2px 6px"
          onclick="Pages._blkRemoveRow(${i})">✕</button>` : ''}
      </div>
      <div class="form-row-2">
        ${UI.field('頭数 *', `<input type="number" id="blk-count-${i}" class="input" min="1" value="${row.count}"
          placeholder="例: 5" oninput="Pages._blkCalc(${i})">`)}
        ${UI.field('容器', `<select id="blk-container-${i}" class="input">
          <option value="1.8L" ${row.container_size==='1.8L'?'selected':''}>1.8L</option>
          <option value="2.7L" ${row.container_size==='2.7L'?'selected':''}>2.7L</option>
          <option value="4.8L" ${row.container_size==='4.8L'?'selected':''}>4.8L</option>
        </select>`)}
      </div>
      <div class="form-row-2">
        ${UI.field('マット', `<select id="blk-mat-${i}" class="input">
          ${MAT_TYPES.map(m => `<option value="${m.code}" ${row.mat_type===m.code?'selected':''}>${m.label}</option>`).join('')}
        </select>`)}
        ${UI.field('メモ', `<input type="text" id="blk-note-${i}" class="input" value="${row.note}" placeholder="任意">`)}
      </div>
    </div>`;
  }

  function renderRows() {
    const el = document.getElementById('bulk-rows');
    if (el) el.innerHTML = rows.map((r, i) => rowHtml(i, r)).join('');
    renderSummary();
  }

  main.innerHTML = `
    ${UI.header('📦 一括ロット化', { back: true })}
    <div class="page-body">
      <div class="form-section">
        <div class="form-title">共通設定</div>
        ${UI.field('ライン *', `<select id="blk-line" class="input" onchange="Pages._blkLineChange()">
          <option value="">— 選択 —</option>
          ${lines.map(l => `<option value="${l.line_id}" ${l.line_id===selectedLineId?'selected':''}>${l.line_code||l.display_id}${l.line_name?' / '+l.line_name:''}</option>`).join('')}
        </select>`, true)}
        <div class="form-row-2">
          ${UI.field('生体ステージ', `<select id="blk-stage" class="input">
            ${STAGE_LIST.map(s =>
              '<option value="' + s.code + '" ' + (s.code === selectedStage ? 'selected' : '') + '>' + s.label + '</option>'
            ).join('')}
          </select>`, true)}
          ${UI.field('孵化日', `<input type="date" id="blk-hatch" class="input" value="${selectedHatch}">`)}
        </div>
      </div>
      <div class="bulk-summary-bar" id="bulk-summary"></div>
      <div id="bulk-rows"></div>
      <button class="btn btn-ghost" style="width:100%;margin-bottom:12px"
        onclick="Pages._blkAddRow()">＋ ロットを追加</button>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" onclick="Store.back()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" id="blk-save-btn"
          onclick="Pages._blkSave()">📦 まとめて作成</button>
      </div>
    </div>`;

  renderRows();
};

Pages._blkAddRow = function () {
  const cont = document.getElementById('blk-container-0')?.value || '1.8L';
  const mat  = document.getElementById('blk-mat-0')?.value || 'T0';
  Pages._blkSyncRows();
  const newRows = window.__blkRows || [];
  newRows.push({ count: '', container_size: cont, mat_type: mat, note: '' });
  window.__blkRows = newRows;
  _blkRenderFromState();
};

Pages._blkRemoveRow = function (idx) {
  Pages._blkSyncRows();
  const rows = window.__blkRows || [];
  rows.splice(idx, 1);
  window.__blkRows = rows;
  _blkRenderFromState();
};

Pages._blkSyncRows = function () {
  const rows = [];
  let i = 0;
  while (document.getElementById('blk-count-' + i)) {
    rows.push({
      count:          document.getElementById('blk-count-' + i)?.value     || '',
      container_size: document.getElementById('blk-container-' + i)?.value || '1.8L',
      mat_type:       document.getElementById('blk-mat-' + i)?.value       || 'T0',
      note:           document.getElementById('blk-note-' + i)?.value      || '',
    });
    i++;
  }
  window.__blkRows = rows;
};

function _blkRenderFromState() {
  const rows = window.__blkRows || [];
  const el = document.getElementById('bulk-rows');
  if (!el) return;

  const lineId = document.getElementById('blk-line')?.value || '';
  function _calcUnLotEggs2(lid) {
    if (!lid) return null;
    const allPairings = Store.getDB('pairings') || [];
    const pairings = allPairings.filter(p => p.line_id === lid);
    const eggRecords = Store.getDB('egg_records') || [];
    const lineEggRecs = eggRecords.filter(r => pairings.some(p => p.set_id === r.set_id));
    const totalEggs = lineEggRecs.length > 0
      ? lineEggRecs.reduce((s, r) => s + (parseInt(r.egg_count, 10) || 0), 0)
      : pairings.reduce((s, p) => s + (parseInt(p.total_eggs, 10) || 0), 0);
    const rottenEggs = lineEggRecs.reduce((s, r) => s + (parseInt(r.failed_count, 10) || 0), 0);
    const allLots = Store.filterLots({ line_id: lid, status: 'all' });
    const rootLots = allLots.filter(l => !l.parent_lot_id || l.parent_lot_id === '');
    const lotInitTotal = rootLots.reduce((s, l) => s + (parseInt(l.initial_count, 10) || 0), 0);
    const allInds = Store.getIndividualsByLine(lid);
    const directInds = allInds.filter(i => !i.lot_id || i.lot_id === '');
    return Math.max(0, totalEggs - rottenEggs - lotInitTotal - directInds.length);
  }
  const unLotEggs = _calcUnLotEggs2(lineId);

  function rowHtml2(i, row) {
    return `<div class="bulk-row" id="bulk-row-${i}">
      <div class="bulk-row-header">
        <span class="bulk-row-num">${i + 1}</span>
        <span style="font-size:.82rem;color:var(--text2);flex:1">ロット ${i + 1}</span>
        ${i > 0 ? `<button style="font-size:.75rem;color:var(--red);background:none;border:none;cursor:pointer;padding:2px 6px"
          onclick="Pages._blkRemoveRow(${i})">✕</button>` : ''}
      </div>
      <div class="form-row-2">
        ${UI.field('頭数 *', `<input type="number" id="blk-count-${i}" class="input" min="1" value="${row.count}"
          placeholder="例: 5" oninput="Pages._blkCalc(${i})">`)}
        ${UI.field('容器', `<select id="blk-container-${i}" class="input">
          <option value="1.8L" ${row.container_size==='1.8L'?'selected':''}>1.8L</option>
          <option value="2.7L" ${row.container_size==='2.7L'?'selected':''}>2.7L</option>
          <option value="4.8L" ${row.container_size==='4.8L'?'selected':''}>4.8L</option>
        </select>`)}
      </div>
      <div class="form-row-2">
        ${UI.field('マット', `<select id="blk-mat-${i}" class="input">
          ${MAT_TYPES.map(m => `<option value="${m.code}" ${row.mat_type===m.code?'selected':''}>${m.label}</option>`).join('')}
        </select>`)}
        ${UI.field('メモ', `<input type="text" id="blk-note-${i}" class="input" value="${row.note}" placeholder="任意">`)}
      </div>
    </div>`;
  }

  el.innerHTML = rows.map((r, i) => rowHtml2(i, r)).join('');

  const total  = rows.reduce((s, r) => s + (parseInt(r.count, 10) || 0), 0);
  const remain = unLotEggs !== null ? unLotEggs - total : null;
  const sumEl  = document.getElementById('bulk-summary');
  if (sumEl) {
    const overCls = remain !== null && remain < 0 ? 'color:var(--red);font-weight:700' : 'color:var(--green)';
    sumEl.innerHTML = `
      <div style="text-align:center">
        <div class="bulk-summary-val" style="color:var(--blue)">${total}</div>
        <div class="bulk-summary-label">入力合計</div>
      </div>
      <div style="text-align:center">
        <div class="bulk-summary-val" style="${overCls}">${remain !== null ? remain : '—'}</div>
        <div class="bulk-summary-label">残り未ロット卵</div>
      </div>
      <div style="text-align:center">
        <div class="bulk-summary-val">${rows.length}</div>
        <div class="bulk-summary-label">ロット数</div>
      </div>`;
  }
}

Pages._blkCalc = function () {
  Pages._blkSyncRows();
  _blkRenderFromState();
};

Pages._blkLineChange = function () {
  Pages._blkSyncRows();
  _blkRenderFromState();
};

Pages._blkSave = async function () {
  const lineId = document.getElementById('blk-line')?.value;
  const stage  = document.getElementById('blk-stage')?.value || 'L1L2';
  const hatch  = (document.getElementById('blk-hatch')?.value || '').replace(/-/g, '/');
  if (!lineId) { UI.toast('ラインを選択してください', 'error'); return; }

  Pages._blkSyncRows();
  const rows = (window.__blkRows || []).filter(r => parseInt(r.count, 10) > 0);
  if (rows.length === 0) { UI.toast('頭数を入力してください', 'error'); return; }

  const btn = document.getElementById('blk-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 作成中...'; }

  try {
    const res = await apiCall(() => API.lot.createBulk({
      line_id:    lineId,
      stage_life: stage,
      stage:      stage,
      hatch_date: hatch,
      lots:       rows.map(r => ({
        count:          parseInt(r.count, 10),
        container_size: r.container_size,
        mat_type:       r.mat_type,
        note:           r.note,
      })),
    }), null);

    const created = res.created || [];
    await syncAll(true);

    const main = document.getElementById('main');
    main.innerHTML = `
      ${UI.header('一括ロット化 完了', { back: true })}
      <div class="page-body">
        <div style="background:rgba(45,122,82,.1);border:1px solid rgba(45,122,82,.35);
          border-radius:var(--radius);padding:20px 16px;text-align:center;margin-bottom:16px">
          <div style="font-size:2rem;margin-bottom:8px">✅</div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--green)">${created.length}ロットを作成しました</div>
          <div style="font-size:.8rem;color:var(--text3);margin-top:6px">
            合計 ${created.reduce((s,l)=>s+(l.count||0),0)} 頭
          </div>
        </div>
        <div class="card">
          <div class="card-title">作成されたロット</div>
          ${created.map(l => `
            <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)">
              <span style="font-family:var(--font-mono);font-size:.9rem;color:var(--gold)">${l.display_id}</span>
              <span style="color:var(--text2)">${l.count}頭</span>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="btn btn-ghost" style="flex:1"
            onclick="routeTo('lot-list',{line_id:'${lineId}',_tab:'lot'})">ロット一覧へ</button>
          <button class="btn btn-primary" style="flex:1"
            onclick="Pages._blkQrBatch(${JSON.stringify(created).replace(/"/g,'&quot;')})">🏷 QR一括発行</button>
        </div>
      </div>`;

  } catch (e) {
    UI.toast('作成失敗: ' + (e.message || '不明なエラー'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '📦 まとめて作成'; }
  }
};

Pages._blkQrBatch = function (createdLots) {
  if (!createdLots || !createdLots.length) { UI.toast('ロット情報がありません', 'error'); return; }
  window.__blkCreatedLots = createdLots;
  const main = document.getElementById('main');
  main.innerHTML = `
    ${UI.header('QR一括発行', { back: true })}
    <div class="page-body">
      <div class="card">
        <div class="card-title">🏷 作成ロットのQRコード</div>
        <div id="qr-batch-list" style="display:flex;flex-wrap:wrap;gap:12px;padding:8px 0"></div>
        <div style="font-size:.75rem;color:var(--text3);margin-top:8px">
          ※ 各QRをタップしてラベル生成・印刷できます
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('lot-list',{_tab:'lot'})">ロット一覧へ</button>
        <button class="btn btn-primary" style="flex:1"
          onclick="window.print()">🖨 印刷</button>
      </div>
    </div>`;

  const container = document.getElementById('qr-batch-list');
  if (!container) return;
  createdLots.forEach(lot => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'text-align:center;cursor:pointer;padding:8px';
    wrapper.onclick = () => routeTo('label-gen', { targetType: 'LOT', targetId: lot.lot_id });
    wrapper.innerHTML = `
      <div id="qr-${lot.lot_id}" style="display:inline-block"></div>
      <div style="font-family:monospace;font-size:.72rem;color:var(--gold);margin-top:4px">${lot.display_id}</div>
      <div style="font-size:.65rem;color:var(--text3)">${lot.count}頭</div>`;
    container.appendChild(wrapper);

    setTimeout(() => {
      try {
        new QRCode(document.getElementById('qr-' + lot.lot_id), {
          text: 'LOT:' + lot.lot_id,
          width: 80, height: 80,
          colorDark: '#000', colorLight: '#fff',
          correctLevel: QRCode.CorrectLevel.M,
        });
      } catch (e) {}
    }, 100);
  });
};

window.PAGES = window.PAGES || {};

// ════════════════════════════════════════════════════════════════
// ロット詳細 — 販売アクション領域
// ════════════════════════════════════════════════════════════════
function _renderLotSaleActions(lot) {
  var st = lot.status || 'active';
  var id = lot.lot_id;

  if (st === 'individualized' || st === 'dissolved') return '';

  if (st === 'sold') {
    return '<div style="background:rgba(200,168,75,.08);border:1px solid rgba(200,168,75,.25);'
      + 'border-radius:12px;padding:14px 16px;margin-top:12px;text-align:center">'
      + '<div style="font-size:.85rem;font-weight:700;color:var(--gold)">💰 販売済み</div>'
      + '<div style="font-size:.75rem;color:var(--text3);margin-top:4px">計 ' + (lot.count || 0) + '頭</div>'
      + '</div>';
  }

  var SC = {
    active:   { label:'管理中',   color:'var(--green)',  desc:'販売候補にする操作をここから行えます' },
    for_sale: { label:'販売候補', color:'#9c27b0',       desc:'出品または直接販売できます' },
    listed:   { label:'出品中',   color:'#ff9800',       desc:'購入者が決まったら販売済みにしてください' },
  };
  var sc = SC[st] || {};
  var header = sc.label
    ? '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">'
      + '<span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:.75rem;font-weight:700;'
      + 'color:' + sc.color + ';border:1px solid ' + sc.color + ';background:' + sc.color + '18">'
      + sc.label + '</span>'
      + '<span style="font-size:.72rem;color:var(--text3)">' + sc.desc + '</span>'
      + '</div>'
    : '';

  function btn(bg, border, color, icon, label, onclick) {
    return '<button onclick="' + onclick + '" style="display:flex;align-items:center;justify-content:center;'
      + 'gap:6px;padding:11px 10px;border-radius:10px;font-size:.82rem;font-weight:700;cursor:pointer;'
      + 'background:' + bg + ';color:' + color + ';border:1px solid ' + border + '">'
      + icon + ' ' + label + '</button>';
  }

  window.__lotSoldId = id;
  window.__lotPartId = id;
  var setFn  = function(s) { return "Pages._lotSetSaleStatus('" + id + "','" + s + "')"; };
  var soldFn = "Pages._lotMarkSoldModal(window.__lotSoldId)";
  var partFn = "Pages._lotPartSaleModal(window.__lotPartId)";
  var deadFn = "Pages._lotMarkDead('" + id + "')";

  var rows = '';
  if (st === 'active') {
    rows = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + btn('rgba(156,39,176,.12)','rgba(156,39,176,.4)','#9c27b0', '🛒', '全部を販売候補にする', setFn('for_sale'))
      + btn('rgba(156,39,176,.12)','rgba(156,39,176,.4)','#9c27b0', '✂️', '一部を販売候補にする', "Pages._lotPartForSaleModal('" + id + "')")
      + '</div>'
      + btn('rgba(224,80,80,.1)','rgba(224,80,80,.35)','var(--red,#e05050)', '💀', 'ロット死亡（管理終了）', deadFn);
  } else if (st === 'for_sale') {
    rows = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + btn('rgba(255,152,0,.12)','rgba(255,152,0,.4)','#ff9800', '📢', '出品する', "Pages._lotListModal('" + id + "')")
      + btn('rgba(200,168,75,.15)','rgba(200,168,75,.4)','var(--gold)', '💰', 'まとめて販売', soldFn)
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + btn('var(--bg3)','var(--border)','var(--text2)', '↩', '販売候補を解除', setFn('active'))
      + btn('rgba(224,80,80,.1)','rgba(224,80,80,.35)','var(--red,#e05050)', '💀', 'ロット死亡', deadFn)
      + '</div>';
  } else if (st === 'listed') {
    rows = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + btn('rgba(200,168,75,.15)','rgba(200,168,75,.4)','var(--gold)', '💰', 'まとめて販売', soldFn)
      + btn('rgba(255,152,0,.12)','rgba(255,152,0,.4)','#ff9800', '✂️', '一部販売', partFn)
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + btn('var(--bg3)','var(--border)','var(--text2)', '↩', '出品解除', setFn('for_sale'))
      + btn('rgba(224,80,80,.1)','rgba(224,80,80,.35)','var(--red,#e05050)', '💀', 'ロット死亡', deadFn)
      + '</div>';
  }

  if (!rows) return '';

  return '<div style="margin-top:16px;padding:14px 16px;background:var(--bg2);'
    + 'border:1px solid var(--border);border-radius:12px">'
    + header + rows + '</div>';
}

// ════════════════════════════════════════════════════════════════
// ロット 販売ステータス変更関数
// ════════════════════════════════════════════════════════════════

Pages._lotListModal = function (lotId) {
  const lot   = Store.getLot(lotId);
  const today = new Date().toISOString().split('T')[0];
  window.__lotListId = lotId;
  _showModal('📢 出品設定', '<div class="form-section">'
    + '<div style="font-size:.8rem;color:var(--text3);margin-bottom:12px">'
    + (lot ? lot.display_id : '') + '</div>'
    + UI.field('販売ルート *', UI.select('lot-list-channel', [
        { code:'',        label:'— 選択してください —' },
        { code:'ヤフオク', label:'ヤフオク' },
        { code:'イベント', label:'イベント' },
        { code:'直接取引', label:'直接取引' },
        { code:'その他',   label:'その他'   },
      ], ''))
    + UI.field('出品日', '<input type="date" id="lot-list-date" class="input" value="' + today + '">')
    + UI.field('メモ（任意）', '<input type="text" id="lot-list-note" class="input" placeholder="例: ヤフオク開始価格5000円">')
    + '<div class="modal-footer">'
    +   '<button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>'
    +   '<button class="btn btn-primary" style="flex:2" onclick="Pages._lotListSave()">出品する</button>'
    + '</div></div>');
};

Pages._lotListSave = async function () {
  const lotId   = window.__lotListId;
  const chanEl  = document.getElementById('lot-list-channel');
  const dateEl  = document.getElementById('lot-list-date');
  const noteEl  = document.getElementById('lot-list-note');
  const channel = chanEl ? chanEl.value : '';
  if (!channel) { UI.toast('販売ルートを選択してください', 'error'); return; }
  _closeModal();
  try {
    UI.loading(true);
    const updates = { lot_id: lotId, status: 'listed', note: noteEl ? (noteEl.value || '') : '' };
    await API.lot.update(updates);
    Store.patchDBItem('lots', 'lot_id', lotId, { status: 'listed' });
    UI.toast('出品中にしました（' + channel + '）', 'success');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('変更失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

Pages._lotSetSaleStatus = async function (lotId, newStatus) {
  try {
    UI.loading(true);
    await API.lot.update({ lot_id: lotId, status: newStatus });
    Store.patchDBItem('lots', 'lot_id', lotId, { status: newStatus });
    const msg = newStatus === 'for_sale' ? '販売候補にしました'
      : newStatus === 'active'  ? '管理中に戻しました'
      : newStatus === 'listed'  ? '出品中にしました'
      : newStatus === 'sold'    ? '販売済みにしました'
      : 'ステータスを変更しました';
    UI.toast(msg, 'success');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('変更失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

Pages._lotMarkSoldModal = function (lotId) {
  const lot   = Store.getLot(lotId);
  const count = lot ? (lot.count || '?') : '?';
  const today = new Date().toISOString().split('T')[0];
  _showModal('まとめて販売（' + count + '頭）', '<div class="form-section">'
    + UI.field('販売日 *', '<input type="date" id="lot-sell-date" class="input" value="' + today + '">')
    + UI.field('販売チャネル', UI.select('lot-sell-channel', [
        { code:'ヤフオク', label:'ヤフオク' },
        { code:'イベント', label:'イベント' },
        { code:'直接',     label:'直接取引' },
        { code:'その他',   label:'その他'   },
      ], 'ヤフオク'))
    + UI.field('金額 (円)', '<input type="number" id="lot-sell-price" class="input" placeholder="例: 30000">')
    + UI.field('購入者名', '<input type="text" id="lot-sell-buyer" class="input" placeholder="任意">')
    + UI.field('備考', '<input type="text" id="lot-sell-note" class="input" placeholder="任意">')
    + '<div class="modal-footer">'
    +   '<button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>'
    +   '<button class="btn btn-primary" style="flex:2" onclick="Pages._lotMarkSoldSave(window.__lotSoldId)">販売済みにする</button>'
    + '</div></div>');
};

Pages._lotMarkSoldSave = async function (lotId) {
  const dateEl  = document.getElementById('lot-sell-date');
  const chanEl  = document.getElementById('lot-sell-channel');
  const priceEl = document.getElementById('lot-sell-price');
  const buyerEl = document.getElementById('lot-sell-buyer');
  const noteEl  = document.getElementById('lot-sell-note');
  if (!dateEl || !dateEl.value) { UI.toast('販売日を入力してください', 'error'); return; }
  const lot     = Store.getLot(lotId);
  const payload = {
    lot_id:      lotId,
    status:      'sold',
    sold_date:   dateEl.value.replace(/-/g, '/'),
    actual_price: priceEl ? (priceEl.value || '') : '',
    platform:    chanEl ? (chanEl.value || '') : '',
    buyer_name:  buyerEl ? (buyerEl.value || '') : '',
    buyer_note:  noteEl ? (noteEl.value || '') : '',
    display_id:  lot ? (lot.display_id || '') : '',
    sold_count:  lot ? (String(lot.count || '1')) : '1',
  };
  _closeModal();
  try {
    UI.loading(true);
    await API.sale.createLotSale(payload);
    Store.patchDBItem('lots', 'lot_id', lotId, { status: 'sold' });
    UI.toast('販売済みにしました', 'success');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('販売失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

Pages._lotPartSaleModal = function (lotId) {
  const lot   = Store.getLot(lotId);
  const count = lot ? (parseInt(lot.count, 10) || 1) : 1;
  const today = new Date().toISOString().split('T')[0];
  _showModal('一部販売', '<div class="form-section">'
    + UI.field('販売頭数 *', '<input type="number" id="lot-part-count" class="input" min="1" max="' + count + '" value="1" placeholder="1〜' + count + '">')
    + UI.field('販売日 *', '<input type="date" id="lot-part-date" class="input" value="' + today + '">')
    + UI.field('販売チャネル', UI.select('lot-part-channel', [
        { code:'ヤフオク', label:'ヤフオク' },
        { code:'イベント', label:'イベント' },
        { code:'直接',     label:'直接取引' },
        { code:'その他',   label:'その他'   },
      ], 'ヤフオク'))
    + UI.field('金額 (円)', '<input type="number" id="lot-part-price" class="input" placeholder="例: 10000">')
    + UI.field('購入者名', '<input type="text" id="lot-part-buyer" class="input" placeholder="任意">')
    + '<div class="modal-footer">'
    +   '<button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>'
    +   '<button class="btn btn-primary" style="flex:2" onclick="Pages._lotPartSaleSave(window.__lotPartId,' + count + ')">一部販売する</button>'
    + '</div></div>');
};

Pages._lotPartSaleSave = async function (lotId, totalCount) {
  const cntEl   = document.getElementById('lot-part-count');
  const dateEl  = document.getElementById('lot-part-date');
  const chanEl  = document.getElementById('lot-part-channel');
  const priceEl = document.getElementById('lot-part-price');
  const buyerEl = document.getElementById('lot-part-buyer');
  const partCount = parseInt(cntEl ? cntEl.value : '1', 10);
  if (!partCount || partCount < 1) { UI.toast('頭数を入力してください', 'error'); return; }
  if (!dateEl || !dateEl.value) { UI.toast('販売日を入力してください', 'error'); return; }
  const lot     = Store.getLot(lotId);
  const payload = {
    lot_id:      lotId,
    sold_count:  String(partCount),
    sold_date:   dateEl.value.replace(/-/g, '/'),
    actual_price: priceEl ? (priceEl.value || '') : '',
    platform:    chanEl ? (chanEl.value || '') : '',
    buyer_name:  buyerEl ? (buyerEl.value || '') : '',
    display_id:  lot ? (lot.display_id || '') : '',
  };
  _closeModal();
  try {
    UI.loading(true);
    await API.sale.createPartLotSale(payload);
    const remaining = (parseInt(totalCount, 10) || 1) - partCount;
    await API.lot.update({ lot_id: lotId, count: String(Math.max(0, remaining)) });
    await syncAll(true);
    UI.toast('一部販売しました（' + partCount + '頭）', 'success');
    Pages.lotDetail(lotId);
  } catch(e) {
    UI.toast('販売失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

Pages._lotPartForSaleModal = function (lotId) {
  const lot   = Store.getLot(lotId);
  const count = lot ? (parseInt(lot.count, 10) || 1) : 1;
  if (count <= 1) { Pages._lotSetSaleStatus(lotId, 'for_sale'); return; }
  window.__lotPartFsId    = lotId;
  window.__lotPartFsTotal = count;
  _showModal('一部を販売候補にする',
    '<div class="form-section">'
    + '<div style="font-size:.8rem;color:var(--text3);margin-bottom:12px">'
    + '販売候補にする頭数を入力してください。<br>元ロットを分割し、残りは引き続き「管理中」として残ります。</div>'
    + UI.field('販売候補にする頭数 *',
        '<input type="number" id="lot-pfs-count" class="input" min="1" max="' + (count - 1) + '" value="1" placeholder="1〜' + (count - 1) + '">'
        + '<div style="font-size:.75rem;color:var(--text3);margin-top:4px">残り ' + (count - 1) + '頭は管理中ロットとして分割されます</div>')
    + '<div class="modal-footer">'
    +   '<button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>'
    +   '<button class="btn btn-primary" style="flex:2" onclick="Pages._lotPartForSaleSave()">分割して候補にする</button>'
    + '</div></div>');
};

Pages._lotPartForSaleSave = async function () {
  const lotId = window.__lotPartFsId;
  const total = window.__lotPartFsTotal || 1;
  const cntEl = document.getElementById('lot-pfs-count');
  const saleCount = parseInt(cntEl ? cntEl.value : '1', 10);
  if (!saleCount || saleCount < 1) { UI.toast('頭数を入力してください', 'error'); return; }
  if (saleCount >= total) {
    _closeModal(); Pages._lotSetSaleStatus(lotId, 'for_sale'); return;
  }
  const remainCount = total - saleCount;
  _closeModal();
  try {
    UI.loading(true);
    const res = await API.lot.split({ lot_id: lotId, split_counts: [saleCount, remainCount] });
    const newLots  = res.new_lots       || [];
    const autoInds = res.auto_individuals || [];
    if (saleCount === 1 && autoInds.length >= 1) {
      const indId = autoInds[0].ind_id;
      // [20260421e] for_sale は非終端ステータスなので updateIndividual 経由で遷移
      //   (changeStatus → deleteIndividual は終端ステータス dead/sold/excluded のみ許可)
      await API.individual.update({ ind_id: indId, status: 'for_sale', for_sale: true });
    } else if (newLots.length >= 1) {
      await API.lot.update({ lot_id: newLots[0].lot_id, status: 'for_sale' });
    }
    await syncAll(true);
    UI.toast(saleCount + '頭を販売候補に分割しました（残' + remainCount + '頭は管理中）', 'success');
    const remainLot = newLots.length >= 2 ? newLots[1] : null;
    if (remainLot) { routeTo('lot-detail', { lotId: remainLot.lot_id }); }
    else { routeTo('lot-list'); }
  } catch(e) {
    UI.toast('分割失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

Pages._lotMarkDead = async function (lotId) {
  const lot = Store.getLot(lotId);
  const cnt = lot ? (lot.count || '?') : '?';
  if (!UI.confirm('ロット（' + cnt + '頭）を死亡として記録しますか？\n管理を終了します。')) return;
  try {
    UI.loading(true);
    await API.lot.update({ lot_id: lotId, status: 'dissolved', count: 0 });
    Store.patchDBItem('lots', 'lot_id', lotId, { status: 'dissolved', count: 0 });
    UI.toast('死亡として記録しました', 'success');
    Store.back();
  } catch(e) {
    UI.toast('記録失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

window.PAGES['lot-list']   = () => Pages.lotList();
window.PAGES['lot-detail'] = () => Pages.lotDetail(Store.getParams().lotId || Store.getParams().id);
window.PAGES['lot-new']    = () => Pages.lotNew(Store.getParams());
window.PAGES['lot-bulk']   = () => Pages.lotBulk(Store.getParams());
