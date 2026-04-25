// ════════════════════════════════════════════════════════════════
// unit_detail.js — 飼育ユニット（BU）詳細画面
// build: 20260424u
// 変更点:
//   - [20260424u] 🌟 Store ID 正規化レイヤーに合わせて簡素化
//     Store.setGrowthRecords(internal_id) 1 回呼ぶだけで OK に。
//     Store 内で _resolveId が走るので display_id でも同じキーに保存される。
//   - [20260424s] 🔥 成長記録を両キーに "同じ merged" で保存 (旧仕様)
//   - [20260422o] ⚡ 消失していたユニット体重推移グラフ (Chart.js) を復元
//     経緯: 20260420a で実装した `_udWeightChartBlock` / `_udDrawWeightChart`
//          が、それ以降のコミット (afc03b2 → ... → 6d4ce03) で削除されていた。
//          ユーザー報告を受けて git 履歴 (commit 63e8758) から実装を復元。
//     機能: 成長記録カード内 <canvas> に Chart.js で2本の折れ線を描画
//          ①= 金色 (#c8a84b) / ②= 緑色 (#4caf78)
//          unit_slot_no で振り分け、スロット情報なしのレコードは空きスロットへ
//          2頭目データが全て null なら 1本のみ描画 (1頭ユニット対応)
//     発火: _renderDetail 最後に setTimeout 100ms で DOM 挿入後に描画
//   - [20260422n] 細部調整
//     ① 成長記録カードの件数表記 「〜日分」 → 「〜回分」
//     ② アクションカードのボタンを flex:1 で均等配置
//   - [20260422d] 🐛 バグ修正: 成長記録の削除後にユニット本体が巻き戻らない問題
//     症状: 4/22 の T2 記録 (4.8L) を削除すると成長記録テーブルからは消えるが、
//           ヘッダーバッジ T2 / マット種別 T2 / 容器 4.8L / アクションボタン「T3移行」
//           がそのまま残り、残存記録の最新行 (4/21 T1/2.7L) と食い違う。
//     原因: _udDeleteGrowthPair が growth_records を削除するだけで、
//           breeding_units.mat_type / stage_phase / container_size を更新していなかった。
//     修正: 削除後に「残っている成長記録の最新行」を見てユニット本体を巻き戻す
//           ヘルパー _udReconcileUnitAfterDelete を追加。
//           Store は同期的に先行反映（再描画前）→ 即座に画面へ反映。
//           API はバックグラウンド（await なし）。失敗時はロールバック+再描画。
//           残存記録が0件の場合は何もしない（ユーザー操作で復旧可能）。
//   - [20260421n] 成長記録の非同期ロードに高速スキップ機構を追加
//     window._skipNextGrowthLoad フラグが立っている場合、API.growth.list を
//     スキップして Store キャッシュのみで再描画する (継続読取り保存後の高速化)。
//     これにより保存→反映時間が 10-20秒 → 1秒以内に短縮。
//   - [20260421j] _udDeleteGrowthPair の API 呼び出し引数修正
//     API.growth.delete はオブジェクト {record_id} を期待するが、
//     従来は record_id 文字列を直接渡していたため
//     GAS 側で「必須項目が不足しています: record_id」エラーになっていた
//   - [20260421i] 成長記録編集モーダルに「🗑️ 削除」ボタンを追加
//     Pages._udDeleteGrowthPair(r1Id, r2Id): 2段確認（confirm + prompt "削除"）を
//     経て ①② 両スロットの記録を削除。Store 更新 + 画面再描画。
//   - [20260419c] ユニット用 成長記録編集モーダル追加
//                 Pages._udEditGrowthRecord(r1Id, r2Id, date): 体重①/体重② を
//                 横並びで編集できる2頭対応モーダル。共通フィールド
//                 (ステージ/容器/マット/交換/メモ) は両スロットに反映。
//                 Pages._udSaveEditGrowth: 変更があったスロットのみ
//                 API.growth.update を順次呼び出し。Store 更新後に
//                 _renderUnitDetail で全体再描画。
//                 _udRenderGrowthRecords で editHandler を渡すよう修正。
//   - [20260419b] _udRenderGrowthRecords を UI.weightTableUnit 呼び出しに統合
//                 個体用 UI.weightTable と見た目を統一（日付/①(増減)/②(増減)/ステージ/
//                 容器/マット/交換/日齢 の6列構成）
//   - [20260419a] 成長記録の表示を「1行で2頭分」に改善 (初版・表形式)
//   - [20260418k] 成長記録の非同期ロードを追加
//                 app.js の syncAll は growthMap をキャッシュしないため、
//                 ユニット詳細を開くたびに API.growth.list で取得。
//                 unit_id と display_id の両方を並列取得してマージする。
//   - [20260418j] 成長記録の履歴取得を unit_id + display_id の両方から検索するよう修正
//   - [20260418f-fix1] 親タップで種親詳細に遷移しないバグを修正
//   - [20260418f] 血統・種親カードの血統表示を「祖父×祖母」形式に変更
//   - [20260418a] Step2 ③ 性別編集UI追加（メンバー行の性別バッジをタップ可能に）
// ════════════════════════════════════════════════════════════════
'use strict';

console.log('[HerculesOS] unit_detail.js v20260422o loaded');

// ── Bug 4 修正: 孵化日フォーマット関数 ─────────────────────────
function _udFormatDate(d) {
  if (!d) return '—';
  var s = String(d);
  // 既に YYYY/MM/DD または YYYY-MM-DD 形式
  if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(s)) return s.replace(/-/g, '/');
  // "Sat Jan 31 2026 ..." などの Date.toString() 形式をパース
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return dt.getFullYear() + '/'
      + String(dt.getMonth() + 1).padStart(2, '0') + '/'
      + String(dt.getDate()).padStart(2, '0');
  }
  return s;
}

function _udFormatOriginLots(unit) {
  let srcLots = [];
  if (unit.source_lots) {
    try { srcLots = typeof unit.source_lots === 'string' ? JSON.parse(unit.source_lots) : (unit.source_lots || []); } catch(_) {}
  }
  if (srcLots.length === 0 && unit.origin_lot_id) srcLots = [unit.origin_lot_id];
  if (srcLots.length === 0) return '—';
  const displayIds = srcLots.map(lid => {
    const lot = Store.getLot && Store.getLot(lid);
    if (!lot) return null; // 解決できない内部IDは非表示
    const did = lot.display_id || '';
    // "HM2025-A1-L01" → "A1-L01" に短縮
    const m = did.match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+-L\d+)/);
    return m ? m[1] : did;
  }).filter(Boolean);
  return displayIds.length ? displayIds.join(' / ') : '—';
}

function _udParseMembers(unit) {
  const raw = unit.members;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw); } catch(_) {}
  }
  return [];
}

// ────────────────────────────────────────────────────────────────
// [20260418f] 血統・種親カードを生成（ユニット詳細用）
// 引数:
//   line - Store.getLine() の結果
//   backCtx - { page: 'unit-detail', params: {unitDisplayId: '...'} } 戻り先情報
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
function _udRenderParentageCard(line, backCtx) {
  if (!line) return '';

  const father = line.father_par_id ? (Store.getParent(line.father_par_id) || null) : null;
  const mother = line.mother_par_id ? (Store.getParent(line.mother_par_id) || null) : null;

  // 何もデータがなければカード自体を表示しない
  if (!father && !mother && !line.father_par_id && !line.mother_par_id) return '';

  // 祖父母ペアから「血統原文(サイズ) × 血統原文(サイズ)」の文字列を生成
  function _grandBloodlineLine(par) {
    if (!par) return '';
    const patRaw = (par.paternal_raw || '').trim();
    const matRaw = (par.maternal_raw || '').trim();
    const patSize = par.father_parent_size_mm;
    const matSize = par.mother_parent_size_mm;

    if (!patRaw && !matRaw) return ''; // 両方なし → 血統行自体を出さない

    function _fmt(raw, size) {
      if (!raw) return '—';
      return raw + (size ? ' (' + size + 'mm)' : '');
    }

    return _fmt(patRaw, patSize) + ' × ' + _fmt(matRaw, matSize);
  }

  // backCtx を onclick用のパラメータ文字列にエンコード
  // (parent_v2.js 側で _back / _backParams を見て戻り先を動的に決定する)
  function _buildParentOnclick(parId) {
    if (!backCtx || !backCtx.page) {
      return "routeTo('parent-detail',{parId:'" + parId + "'})";
    }
    // _backParams は JSON文字列として渡す (parent_v2.js でJSON.parseして使用)
    // onclick属性はダブルクォートで囲まれるので、内部のダブルクォートを &quot; にエスケープする
    // さらに JSON文字列リテラルはシングルクォートで囲むので、シングルクォートも \\' にエスケープ
    const backParamsJson = JSON.stringify(backCtx.params || {})
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;');
    return "routeTo('parent-detail',{parId:'" + parId + "',_back:'" + backCtx.page + "',_backParams:'" + backParamsJson + "'})";
  }

  function _parBlock(par, parId, sex) {
    if (!par && !parId) return '';
    const mc = sex === '♂' ? 'var(--male,#5ba8e8)' : 'var(--female,#e87fa0)';
    const bg = sex === '♂' ? 'rgba(91,168,232,.05)' : 'rgba(232,127,160,.05)';
    const bd = sex === '♂' ? 'rgba(91,168,232,.2)'  : 'rgba(232,127,160,.2)';

    if (!par) {
      return '<div style="padding:8px 10px;background:' + bg + ';border-radius:8px;border:1px solid ' + bd + ';margin-bottom:6px">'
        + '<span style="font-size:.75rem;color:' + mc + ';font-weight:700">' + sex + '親</span>'
        + ' <span style="font-size:.8rem;color:var(--text3)">情報なし</span>'
        + '</div>';
    }

    const name           = par.parent_display_id || par.display_name || '—';
    const grandLine      = _grandBloodlineLine(par);
    const parentOnclick  = _buildParentOnclick(parId);

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

  const fBlock = _parBlock(father, line.father_par_id, '♂');
  const mBlock = _parBlock(mother, line.mother_par_id, '♀');

  if (!fBlock && !mBlock) return '';

  return '<div class="card" style="margin-bottom:10px">'
    + '<div class="card-title">血統・種親</div>'
    + fBlock + mBlock
    + '</div>';
}

// 個体一覧からこのユニット由来の個体を検索
function _udFindMemberInds(unit) {
  const allInds = Store.getDB('individuals') || [];
  const byUnit = allInds.filter(i =>
    i.origin_unit_id === unit.unit_id ||
    i.source_unit_id === unit.unit_id ||
    i.source_unit_display_id === unit.display_id
  );
  if (byUnit.length > 0) return byUnit;

  const members = _udParseMembers(unit);
  if (members.length === 0) return [];
  const matched = [];
  members.forEach(m => {
    if (!m.lot_id) return;
    const found = allInds.find(i =>
      i.lot_id === m.lot_id &&
      String(i.lot_item_no || '') === String(m.lot_item_no || '')
    );
    if (found) matched.push(found);
  });
  return matched;
}

// ════════════════════════════════════════════════════════════════
Pages.unitDetail = function (params = {}) {
  const main = document.getElementById('main');
  if (!main) return;

  // ── 診断ログ（fix2+） ──
  console.log('[UD] unitDetail called params=', params);

  const unitDisplayId = params.unitDisplayId || params.displayId || params.display_id || '';
  const unitId        = params.unitId        || params.unit_id   || '';

  let unit = unitDisplayId
    ? (Store.getUnitByDisplayId && Store.getUnitByDisplayId(unitDisplayId))
    : null;
  if (!unit && unitId) {
    unit = (Store.getDB('breeding_units') || []).find(u => u.unit_id === unitId);
  }
  if (!unit && unitDisplayId) {
    unit = (Store.getDB('breeding_units') || []).find(u => u.display_id === unitDisplayId);
  }

  if (!unit) {
    console.warn('[UD] unit not found', { unitDisplayId, unitId });
    main.innerHTML = `
      ${UI.header('ユニット詳細', { back: true })}
      <div class="page-body">
        <div class="card" style="text-align:center;padding:20px">
          <div style="font-size:1.5rem;margin-bottom:8px">🔍</div>
          <div>ユニットが見つかりません</div>
          <div style="font-size:.75rem;margin-top:4px;color:var(--text3)">${unitDisplayId || unitId || '(ID未指定)'}</div>
        </div>
      </div>`;
    return;
  }

  // ── 描画エラー時のセーフティネット（fix2+） ──
  // 真っ暗になる代わりにエラーメッセージを表示する
  try {
    _renderUnitDetail(unit, main);
  } catch (e) {
    console.error('[UD] render error:', e);
    const msg = (e && (e.message || e.toString())) || '不明なエラー';
    const stack = (e && e.stack) || '';
    main.innerHTML = `
      ${UI.header('ユニット詳細', { back: true })}
      <div class="page-body">
        <div class="card" style="padding:16px;border:2px solid #e05050">
          <div style="color:#e05050;font-weight:700;font-size:1rem;margin-bottom:8px">⚠️ 描画エラーが発生しました</div>
          <div style="font-size:.85rem;color:var(--text1);margin-bottom:8px">${msg.replace(/[<>]/g, '')}</div>
          <div style="font-size:.7rem;color:var(--text3);margin-bottom:12px">
            ユニット: ${(unit.display_id || unit.unit_id || '?').replace(/[<>]/g, '')}<br>
            hatch_date: ${String(unit.hatch_date||'(null)').replace(/[<>]/g, '').slice(0,50)}<br>
            status: ${unit.status || '(null)'}
          </div>
          <details style="font-size:.7rem;color:var(--text3)">
            <summary>スタックトレース</summary>
            <pre style="overflow:auto;max-height:200px;background:var(--surface2);padding:8px;border-radius:6px;font-size:.65rem">${stack.replace(/[<>]/g, '')}</pre>
          </details>
        </div>
      </div>`;
  }

  // ── [20260418j] 成長記録の非同期ロード ──
  //   app.js の syncAll は growthMap をキャッシュしない設計のため、
  //   ユニット詳細を開くたびにここで明示的に API から取得する必要がある。
  //   target_id が unit_id と display_id の両方に存在する可能性があるため、
  //   両方を並列で呼んでマージし、Store に保存してから再描画する。
  //
  //   [20260421n] window._skipNextGrowthLoad フラグが立っている場合は
  //   API.growth.list を呼ばない (継続読取り保存直後の高速再描画用)。
  //   Store には既に最新データが入っているので、API を叩き直す必要がない。
  //   フラグは1回だけ有効 (消費後リセット)。
  if (window._skipNextGrowthLoad) {
    console.log('[UD] skip growth.list (cache-only mode)');
    window._skipNextGrowthLoad = false;
    return;
  }
  (async function _udLoadGrowthAsync() {
    if (!unit || !API || !API.growth || !API.growth.list) return;
    try {
      var promises = [];
      if (unit.unit_id) {
        promises.push(API.growth.list('BU', unit.unit_id).catch(function(e){ console.warn('[UD] growth.list unit_id error:', e.message); return {records:[]}; }));
      } else {
        promises.push(Promise.resolve({records:[]}));
      }
      if (unit.display_id && unit.display_id !== unit.unit_id) {
        promises.push(API.growth.list('BU', unit.display_id).catch(function(e){ console.warn('[UD] growth.list display_id error:', e.message); return {records:[]}; }));
      } else {
        promises.push(Promise.resolve({records:[]}));
      }
      var results = await Promise.all(promises);
      var recU = (results[0] && results[0].records) || [];
      var recD = (results[1] && results[1].records) || [];

      // record_id で重複排除してマージ（通常は重複しないはずだが念のため）
      var seen = {};
      var merged = [];
      recU.concat(recD).forEach(function(r) {
        var key = r.record_id || (r.target_id + '|' + r.record_date + '|' + (r.unit_slot_no || '') + '|' + (r.weight_g || ''));
        if (!seen[key]) { seen[key] = true; merged.push(r); }
      });

      // [20260424u] Store の ID 正規化レイヤー (Phase 1) により unit_id /
      //   display_id は内部で同じキーに解決されるので、保存は 1 回でよい。
      //   internal_id (unit_id) で保存しておけば、表示側がどちらの id で
      //   引いても確実に取得できる。
      if (unit.unit_id) {
        Store.setGrowthRecords(unit.unit_id, merged);
      } else if (unit.display_id) {
        Store.setGrowthRecords(unit.display_id, merged);
      }

      // 現在もユニット詳細ページにいて、同じユニットを見ているなら描画更新
      if (Store.getPage && Store.getPage() === 'unit-detail') {
        var curParams = Store.getParams() || {};
        var curDisp = curParams.unitDisplayId || curParams.displayId || curParams.display_id || '';
        if (!curDisp || curDisp === unit.display_id) {
          console.log('[UD] growth loaded:', merged.length, 'records');
          if (merged.length > 0) {
            // 記録があれば全体を再レンダリング（Storeキャッシュ経由で記録カードが表示される）
            try { _renderUnitDetail(unit, main); } catch(_){}
          } else {
            // 0件ならロード中メッセージを「記録なし」に差し替えるだけ（フラッシュ回避）
            var loadingEl = document.getElementById('ud-growth-loading');
            if (loadingEl) {
              loadingEl.innerHTML = '<div style="padding:6px 0;color:var(--text3)">📭 まだ記録がありません</div>'
                + '<div style="font-size:.7rem;color:var(--text3);margin-top:4px">下の「📷 成長記録を追加」ボタンから記録できます</div>';
            }
          }
        }
      }
    } catch (e) {
      console.error('[UD] growth async load error:', e);
    }
  })();
};

// ────────────────────────────────────────────────────────────────
// [20260419a] 成長記録の表示を「1行で2頭分」に改善
//   日付ごとにグループ化し、各日付行に 1頭目と2頭目の体重を横並び表示。
//   継続読取りで撮影したラベルと同じ形式で直感的。
// [20260419b] UI.weightTableUnit に統合（個体版 UI.weightTable と見た目統一）
//   列構成: 日付 / ①(増減) / ②(増減) / ステージ / 容器/マット/交換 / 日齢
// [20260419c] editHandler を渡してユニット用の2頭編集モーダルを使う
function _udRenderGrowthRecords(records) {
  if (!records || records.length === 0) return '';
  // 個体用 weightTable とデザイン統一。ユニットは 2頭バージョン。
  // 編集ボタンは Pages._udEditGrowthRecord を呼ぶ(体重①/②の2列編集)
  return UI.weightTableUnit(records, {
    showEdit: true,
    editHandler: 'Pages._udEditGrowthRecord',
  });
}

function _renderUnitDetail(unit, main) {
  const line      = Store.getLine(unit.line_id);
  const lineCode  = (() => {
    if (line) return line.line_code || line.display_id || '';
    // フォールバック: "HM2025-A1-U06" → "A1" を抽出
    const dm = (unit.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-[A-Za-z]/);
    return dm ? dm[1] : (unit.line_id || '—');
  })();
  const originStr = _udFormatOriginLots(unit);
  const members   = _udParseMembers(unit);
  const memberInds = _udFindMemberInds(unit);
  // [20260418j] 成長記録を unit_id と display_id の両方から取得してマージ
  //   古いレコードは target_id に display_id (HM2025-A2-U01) が入っており、
  //   unit_id だけでは全履歴がヒットしないため、両方から引いて record_id で重複排除する。
  //   新規レコード（20260418j 以降）は unit_id で保存される。
  const records = (function() {
    var recU = (Store.getGrowthRecords && unit.unit_id)    ? (Store.getGrowthRecords(unit.unit_id)    || []) : [];
    var recD = (Store.getGrowthRecords && unit.display_id) ? (Store.getGrowthRecords(unit.display_id) || []) : [];
    if (!recU.length) return recD;
    if (!recD.length) return recU;
    // 両方に値があれば record_id で重複排除（同じレコードが2度来ることはないが念のため）
    var seen = {};
    var merged = [];
    recU.concat(recD).forEach(function(r) {
      var key = r.record_id || (r.target_id + '|' + r.record_date + '|' + (r.unit_slot_no || '') + '|' + (r.weight_g || ''));
      if (!seen[key]) { seen[key] = true; merged.push(r); }
    });
    return merged;
  })();
  const latestRec = records.length > 0
    ? [...records].sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))[0]
    : null;

  const isIndividualized = unit.status === 'individualized';
  const statusColor = unit.status === 'active' ? 'var(--green)'
    : isIndividualized ? 'var(--blue)'
    : unit.status === 'reserved' ? 'var(--amber)' : 'var(--text3)';
  const statusLabel = unit.status === 'active' ? '飼育中'
    : isIndividualized ? '個別化済'
    : unit.status === 'reserved' ? '予約中' : (unit.status || '—');

  const saleBadge = unit.for_sale
    ? `<span style="background:#e05050;color:#fff;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:4px;margin-left:6px">販売候補</span>`
    : '';

  const memberSection = isIndividualized && memberInds.length > 0
    ? `<div class="card" style="margin-bottom:10px">
        <div class="card-title">個体化済メンバー（${memberInds.length}頭）</div>
        <div style="font-size:.75rem;color:var(--text3);margin-bottom:8px">
          個別化されました。各個体の詳細は下記から確認できます。
        </div>
        ${memberInds.map((mi, i) => {
          const sex = mi.sex || '不明';
          const sexColor = sex === '♂' ? '#3366cc' : sex === '♀' ? '#cc3366' : 'var(--text3)';
          const stage = mi.current_stage || mi.stage || '—';
          const wt = mi.latest_weight_g || mi.weight_g || '';
          return `<div style="padding:10px 0;border-bottom:1px solid var(--border2);cursor:pointer"
            onclick="routeTo('ind-detail',{indId:'${mi.ind_id}'})">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-weight:700;color:var(--gold);font-family:var(--font-mono)">${mi.display_id||mi.ind_id}</span>
              <span style="color:${sexColor};font-weight:700">${sex}</span>
              <span style="font-size:.75rem;padding:1px 6px;background:rgba(91,168,232,.1);color:var(--blue);border-radius:4px">${stage}</span>
              ${wt ? `<span style="margin-left:auto;font-weight:700">${wt}g</span>` : ''}
              <span style="color:var(--text3);font-size:1rem">›</span>
            </div>
          </div>`;
        }).join('')}
      </div>`
    : members.length > 0
      ? `<div class="card" style="margin-bottom:10px">
          <div class="card-title">メンバー構成（${members.length}頭）</div>
          ${members.map((m, i) => _renderUdMemberRow(m, i, records, unit.display_id)).join('')}
        </div>`
      : `<div class="card" style="margin-bottom:10px">
          <div class="card-title">メンバー構成</div>
          <div style="color:var(--text3);font-size:.8rem;padding:8px 0">
            ${isIndividualized
              ? 'このユニットは個別化済みです。個体台帳から各個体を確認できます。'
              : 'メンバー情報がありません（T2/T3移行後に反映されます）'}
          </div>
        </div>`;

  window._udLabelParams = {
    targetType: 'UNIT',
    displayId:  unit.display_id,
    labelType:  't1_unit',
    forSale:    !!unit.for_sale,
    backRoute:  'unit-detail',
    backParam:  { unitDisplayId: unit.display_id },
    unitDraft: {
      display_id:    unit.display_id,
      line_id:       unit.line_id,
      line_code:     line ? (line.line_code || line.display_id || '') : '',
      head_count:    unit.head_count || 2,
      for_sale:      !!unit.for_sale,
      stage_phase:   unit.stage_phase || 'T1',
      mat_type:      unit.mat_type || 'T1',
      size_category: unit.size_category || '',
      hatch_date:    unit.hatch_date || '',
      source_lots:   unit.source_lots || '',
      origin_lot_id: unit.origin_lot_id || '',
      t1_date:       unit.t1_date || unit.created_at || '',
      members:       members,
    },
  };

  main.innerHTML = `
    ${UI.header('ユニット詳細', { back: true })}
    <div class="page-body">

      <!-- ヘッダーバナー -->
      <div style="background:var(--surface2);border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-weight:700;color:var(--gold);font-family:var(--font-mono);font-size:1rem">${unit.display_id}</span>
          <span style="padding:2px 8px;border-radius:5px;font-size:.72rem;font-weight:700;border:1px solid ${statusColor};color:${statusColor}">${statusLabel}</span>
          ${saleBadge}
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:.78rem;color:var(--text2)">
          <span>📋 ライン: <b>${lineCode}</b></span>
          <span>🔢 ${unit.head_count || 2}頭</span>
          <span style="background:rgba(91,168,232,.15);color:var(--blue);padding:1px 7px;border-radius:4px;font-weight:700">${unit.stage_phase || '—'}</span>
        </div>
        <div style="font-size:.72rem;color:var(--text3);margin-top:6px">由来ロット: ${originStr}</div>
      </div>

      <!-- 基本情報 -->
      <div class="card" style="margin-bottom:10px">
        <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
          基本情報
          <button class="btn btn-ghost btn-sm" style="font-size:.72rem"
            onclick="Pages._udEditBasic('${unit.display_id}')">✏️ 編集</button>
        </div>
        <table style="width:100%;font-size:.8rem;border-collapse:collapse">
          ${[
            ['孵化日',     _udFormatDate(unit.hatch_date)],
            ['マット種別', unit.mat_type      || '—'],
            ['容器サイズ', unit.container_size || '—'],
            ['最終記録日', latestRec ? latestRec.record_date : '—'],
            ['作成日',     unit.created_at ? String(unit.created_at).split(' ')[0] : '—'],
          ].map(([k,v]) => `
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:6px 4px;color:var(--text3);width:90px">${k}</td>
              <td style="padding:6px 4px;color:var(--text1)">${v}</td>
            </tr>`).join('')}
        </table>
        ${unit.note ? `<div style="margin-top:8px;font-size:.78rem;color:var(--text2);background:var(--surface2);border-radius:8px;padding:8px">📝 ${unit.note}</div>` : ''}
      </div>

      <!-- 血統・種親（20260418f）-->
      ${_udRenderParentageCard(line, { page: 'unit-detail', params: { unitDisplayId: unit.display_id } })}

      <!-- メンバー構成 -->
      ${memberSection}

      <!-- 成長記録 -->
      ${(function() {
        // [20260422n] 件数表示: ユニークな日付数 = 記録「回数」として扱う
        //   (旧: 「N日分」→ 新: 「N回分」。1日複数回の記録もあり得るため「回」が適切)
        //   1回の記録で slot1 と slot2 の2レコードあるが、見た目は1行なので日付数で数える。
        var _uniqDates = {};
        records.forEach(function(r) { if (r.record_date) _uniqDates[r.record_date] = true; });
        var _recCount = Object.keys(_uniqDates).length;
        // [20260422o] 体重推移グラフ (2本線 ①② を Chart.js で描画)
        var _chartBlock = _udWeightChartBlock(unit.unit_id, records);
        return `
      <div class="card" style="margin-bottom:10px">
        <div class="card-title">成長記録${records.length > 0 ? `（${_recCount}回分）` : ''}</div>
        ${records.length > 0
          ? (_chartBlock + _udRenderGrowthRecords(records))
          : '<div id="ud-growth-loading" style="padding:14px 4px;font-size:.82rem;color:var(--text3);text-align:center">⏳ 成長記録を読み込み中...<br><span style="font-size:.7rem;color:var(--text3)">記録が無い場合はここに「記録なし」と表示されます</span></div>'}
        <button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%"
          onclick="Pages._udGrowthRecord('${unit.unit_id}','${unit.display_id}')">
          📷 成長記録を追加
        </button>
      </div>`;
      })()}

      <!-- アクション -->
      <div class="card">
        <div class="card-title">アクション</div>
        <!-- [20260422n] ボタンを flex:1 で均等配置 (3ボタン → 3等分、2ボタン → 2等分) -->
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${unit.status === 'active' && unit.stage_phase === 'T1' ? `
          <button class="btn btn-primary" style="flex:1;min-width:0;background:var(--blue)"
            onclick="Pages._udStartT2('${unit.display_id}')">
            🔄 T2移行
          </button>` : ''}
          ${unit.status === 'active' && unit.stage_phase === 'T2' ? `
          <button class="btn btn-primary" style="flex:1;min-width:0;background:var(--amber);color:#1a1a1a"
            onclick="Pages._udStartT3('${unit.display_id}')">
            ⭐ T3移行
          </button>` : ''}
          ${unit.status === 'active' && unit.stage_phase === 'T3' ? `
          <button class="btn btn-primary" style="flex:1;min-width:0;background:rgba(224,144,64,.15);border:2px solid var(--amber);color:var(--amber)"
            onclick="Pages._udStartT3('${unit.display_id}')">
            🔄 T3 Mx/体重更新
          </button>` : ''}
          <button class="btn btn-ghost" style="flex:1;min-width:0"
            onclick="Pages._udLabelGen('${unit.display_id}')">
            🏷️ ラベル発行
          </button>
          <button class="btn btn-ghost" style="flex:1;min-width:0"
            onclick="Pages._udGrowthRecord('${unit.unit_id}','${unit.display_id}')">
            📷 成長記録
          </button>
        </div>
      </div>

    </div>`;

  // [20260422o] 体重推移グラフを描画（canvas 要素が DOM に挿入された直後に実行）
  //   2本の折れ線: ①(金色 #c8a84b) と ②(緑色 #4caf78)
  //   weight_g > 0 のスロット1/スロット2 の各レコードを日付昇順でプロット
  if (records && records.length > 0) {
    var _hasSlotData = records.some(function(r) {
      var w = r && r.weight_g;
      return w !== '' && w !== null && w !== undefined && +w > 0;
    });
    if (_hasSlotData) {
      setTimeout(function() { _udDrawWeightChart(unit.unit_id, records); }, 100);
    }
  }
}

// ────────────────────────────────────────────────────────────────
// [20260422o] ユニット体重推移グラフ（Chart.js、①② 2ライン）
// 20260420a で実装されていたが以降のコミットで消失していたため復元。
// ────────────────────────────────────────────────────────────────
function _udWeightChartBlock(unitId, records) {
  if (!records || records.length === 0) return '';
  // 体重が入っているレコードが2件以上あればグラフ表示
  var hasWeight = records.filter(function(r) {
    var w = r && r.weight_g;
    return w !== '' && w !== null && w !== undefined && +w > 0;
  });
  if (hasWeight.length < 2) return '';
  var chartId = 'ud-chart-' + (unitId || 'x');
  return '<canvas id="' + chartId + '" style="max-height:180px;margin-bottom:12px"></canvas>';
}

function _udDrawWeightChart(unitId, records) {
  var el = document.getElementById('ud-chart-' + (unitId || 'x'));
  if (!el) return;
  if (typeof Chart === 'undefined') {
    console.warn('[UD] Chart.js が読み込まれていません');
    return;
  }

  // 日付ごとにグループ化して slot1 / slot2 の体重を集める
  var byDate = {};
  records.forEach(function(r) {
    if (!r || !r.record_date) return;
    var w = r.weight_g;
    if (w === '' || w === null || w === undefined || +w <= 0) return;
    var d = String(r.record_date);
    if (!byDate[d]) byDate[d] = { slot1: null, slot2: null };
    var slot = parseInt(r.unit_slot_no, 10);
    if (slot === 1) byDate[d].slot1 = +w;
    else if (slot === 2) byDate[d].slot2 = +w;
    else {
      // スロット情報なし: 空いている方に入れる
      if (byDate[d].slot1 === null) byDate[d].slot1 = +w;
      else if (byDate[d].slot2 === null) byDate[d].slot2 = +w;
    }
  });

  // 日付昇順（古い→新しい）
  var dateKeys = Object.keys(byDate).sort();
  if (!dateKeys.length) return;

  var data1 = dateKeys.map(function(d) { return byDate[d].slot1; });
  var data2 = dateKeys.map(function(d) { return byDate[d].slot2; });

  // slot2 が全部 null なら 2本目は描画しない（1頭のみのユニット）
  var hasSlot2 = data2.some(function(v) { return v !== null; });

  var datasets = [{
    label: '①',
    data: data1,
    borderColor: '#c8a84b',
    backgroundColor: 'rgba(200,168,75,0.1)',
    pointBackgroundColor: '#c8a84b',
    pointRadius: 4,
    tension: 0.3,
    fill: false,
    spanGaps: true,
  }];
  if (hasSlot2) {
    datasets.push({
      label: '②',
      data: data2,
      borderColor: '#4caf78',
      backgroundColor: 'rgba(76,175,120,0.1)',
      pointBackgroundColor: '#4caf78',
      pointRadius: 4,
      tension: 0.3,
      fill: false,
      spanGaps: true,
    });
  }

  // 既存チャートがあれば破棄 (再描画時の重複防止)
  try {
    if (el._chartInstance) {
      el._chartInstance.destroy();
    }
  } catch (_) {}

  el._chartInstance = new Chart(el, {
    type: 'line',
    data: { labels: dateKeys, datasets: datasets },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: hasSlot2,  // 2本ある時のみ凡例表示
          position: 'top',
          labels: { color: '#9aa89a', font: { size: 11 } },
        },
      },
      scales: {
        x: { ticks: { color: '#6a7c6a', maxTicksLimit: 5, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: '#6a7c6a', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
      }
    }
  });
}

// ── ラベル発行 ────────────────────────────────────────────────────
Pages._udLabelGen = function () {
  const p = window._udLabelParams;
  if (!p) {
    console.error('[UD] _udLabelGen: _udLabelParams not set');
    return;
  }
  if (typeof Store.setParams === 'function') {
    Store.setParams(p);
  }
  routeTo('label-gen', p);
};

// ── 基本情報編集 ─────────────────────────────────────────────────
Pages._udEditBasic = function (displayId) {
  const unit = Store.getUnitByDisplayId && Store.getUnitByDisplayId(displayId);
  if (!unit) { UI.toast('ユニットが見つかりません', 'error'); return; }

  // [fix4] id依存からオブジェクト経由に変更
  // UI.selectがid属性を付けない仕様のため、getElementById('ud-mat')がnullになっていた
  // モーダル内のonchange/oninputでwindow._udEditStateに値を保存し、保存時はそこから読む
  window._udEditState = {
    unit_id:        unit.unit_id,
    display_id:     displayId,
    hatch_date:     (unit.hatch_date || '').replace(/\//g, '-'),
    mat_type:       unit.mat_type || '',
    container_size: unit.container_size || '',
    note:           unit.note || '',
  };

  const matOptions = [
    { code:'T1', label:'T1マット' },
    { code:'T2', label:'T2マット' },
    { code:'T3', label:'T3マット' },
    { code:'MD', label:'MDマット' },
  ];
  const contOptions = [
    { code:'1.8L', label:'1.8L' },
    { code:'2.7L', label:'2.7L' },
    { code:'4.8L', label:'4.8L（パンケ）' },
    { code:'その他', label:'その他' },
  ];
  const curMat  = unit.mat_type || '';
  const curCont = unit.container_size || '';

  // 全入力要素にid属性を明示し、かつonchangeで window._udEditState に確実に保存
  const hatchInput = '<input type="date" id="ud-hatch" class="input"'
    + ' value="' + (unit.hatch_date||'').replace(/\//g,'-') + '"'
    + ' onchange="window._udEditState.hatch_date=this.value">';

  const matSelect = '<select id="ud-mat" class="input"'
    + ' onchange="window._udEditState.mat_type=this.value">'
    + '<option value="">選択...</option>'
    + matOptions.map(o => `<option value="${o.code}" ${o.code === curMat ? 'selected' : ''}>${o.label}</option>`).join('')
    + '</select>';

  const contSelect = '<select id="ud-cont" class="input"'
    + ' onchange="window._udEditState.container_size=this.value">'
    + '<option value="">選択...</option>'
    + contOptions.map(o => `<option value="${o.code}" ${o.code === curCont ? 'selected' : ''}>${o.label}</option>`).join('')
    + '</select>';

  const noteInput = '<input type="text" id="ud-note" class="input"'
    + ' value="' + (unit.note||'').replace(/"/g, '&quot;') + '"'
    + ' oninput="window._udEditState.note=this.value">';

  UI.modal(`
    <div class="modal-title">基本情報を編集</div>
    <div class="form-section" style="margin-top:8px">
      ${UI.field('孵化日',   hatchInput)}
      ${UI.field('マット種別', matSelect)}
      ${UI.field('容器サイズ', contSelect)}
      ${UI.field('メモ', noteInput)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._udSaveBasic()">保存</button>
    </div>
  `);
};

Pages._udSaveBasic = async function () {
  // [fix4] window._udEditState から値を取得（DOM参照しない）
  const state = window._udEditState || {};
  const unitId    = state.unit_id;
  const displayId = state.display_id;
  if (!unitId) { UI.toast('編集対象が不明です', 'error'); return; }

  const updates = {
    unit_id:        unitId,
    hatch_date:     (state.hatch_date || '').replace(/-/g, '/'),
    mat_type:       state.mat_type || '',
    container_size: state.container_size || '',
    note:           state.note || '',
  };

  console.log('[UD][fix4] save updates=', updates);
  UI.closeModal();

  try {
    UI.loading(true);
    await API.unit.update(updates);

    // Storeを更新
    if (typeof Store.patchDBItem === 'function') {
      Store.patchDBItem('breeding_units', 'unit_id', unitId, updates);
    }

    UI.toast('✅ 基本情報を更新しました', 'success', 2000);
    Pages.unitDetail({ unitDisplayId: displayId });
  } catch(e) {
    console.error('[UNIT_DETAIL] save error:', e);
    UI.toast('❌ 保存失敗: ' + (e.message || '通信エラー'), 'error', 4000);
    if (typeof Store.patchDBItem === 'function') {
      Store.patchDBItem('breeding_units', 'unit_id', unitId, updates);
    }
  } finally {
    UI.loading(false);
  }
};

// ── メンバー行 ───────────────────────────────────────────────────
// [20260418a] 性別バッジをタップ可能にし、♂/♀/不明 を切替できるようにした
//             未判別時は「?」を表示（編集導線として機能させるため）
function _renderUdMemberRow(m, idx, records, unitDisplayId) {
  const slotLabel = idx === 0 ? '1頭目' : idx === 1 ? '2頭目' : `${idx+1}頭目`;
  const slotNo    = m.unit_slot_no || (idx + 1);
  const slotRecs  = records.filter(r => parseInt(r.unit_slot_no, 10) === m.unit_slot_no);
  const latestW   = slotRecs.length > 0
    ? slotRecs.sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))[0].weight_g
    : (m.weight_g || null);
  const sexRaw   = m.sex || '';
  const hasSex   = sexRaw === '♂' || sexRaw === '♀';
  const sexColor = sexRaw === '♂' ? '#3366cc' : sexRaw === '♀' ? '#cc3366' : 'var(--text3)';
  const sexLabel = hasSex ? sexRaw : '?';
  const sexBtnBg = hasSex ? 'transparent' : 'rgba(224,144,64,.12)';
  const sexBtnBorder = hasSex ? 'var(--border)' : 'rgba(224,144,64,.4)';

  return `
  <div style="padding:10px 0;border-bottom:1px solid var(--border2)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="font-weight:800;font-size:.9rem;color:var(--text1)">${slotLabel}</span>
      <button onclick="Pages._udEditMemberSex('${unitDisplayId}', ${slotNo})"
        style="font-size:.8rem;font-weight:700;color:${sexColor};background:${sexBtnBg};
          border:1px solid ${sexBtnBorder};border-radius:6px;padding:2px 10px;cursor:pointer;
          display:inline-flex;align-items:center;gap:4px">
        <span>${sexLabel}</span><span style="font-size:.65rem;opacity:.6">✏️</span>
      </button>
      ${m.size_category ? `<span style="font-size:.75rem;padding:1px 6px;border-radius:4px;background:rgba(76,175,120,.12);color:var(--green)">${m.size_category}</span>` : ''}
      ${latestW ? `<span style="font-size:.8rem;font-weight:700;margin-left:auto">${latestW}g</span>` : ''}
    </div>
    <div style="font-size:.7rem;color:var(--text3)">
      元ロット: ${m.lot_display_id || m.lot_id || '—'}${m.lot_item_no ? ' #' + m.lot_item_no : ''}
      ${m.memo ? ' | ' + m.memo : ''}
    </div>
  </div>`;
}

// ── メンバー性別編集モーダル（20260418a）────────────────────────
Pages._udEditMemberSex = function (displayId, slotNo) {
  const unit = Store.getUnitByDisplayId && Store.getUnitByDisplayId(displayId);
  if (!unit) { UI.toast('ユニットが見つかりません', 'error'); return; }

  const members = _udParseMembers(unit);
  // unit_slot_no 優先、なければインデックスでフォールバック
  let m = members.find(x => x.unit_slot_no === slotNo);
  if (!m) m = members[slotNo - 1];
  if (!m) { UI.toast('メンバーが見つかりません', 'error'); return; }

  const curSex    = m.sex || '不明';
  const slotLabel = slotNo === 1 ? '1頭目' : slotNo === 2 ? '2頭目' : `${slotNo}頭目`;

  const opts = [
    { val:'♂',   color:'#3366cc' },
    { val:'♀',   color:'#cc3366' },
    { val:'不明', color:'var(--text3)' },
  ];

  UI.modal(`
    <div class="modal-title">性別を変更（${slotLabel}）</div>
    <div style="font-size:.75rem;color:var(--text3);margin-top:4px;margin-bottom:10px">
      現在: <span style="font-weight:700;color:${curSex==='♂'?'#3366cc':curSex==='♀'?'#cc3366':'var(--text3)'}">${curSex}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
      ${opts.map(o => `
        <button class="btn"
          style="font-size:1rem;padding:14px;background:${curSex===o.val?'rgba(91,168,232,.15)':'var(--surface2)'};
            border:${curSex===o.val?'2px solid var(--blue)':'1px solid var(--border)'};
            color:${o.color};font-weight:700;border-radius:10px;cursor:pointer"
          onclick="Pages._udSaveMemberSex('${displayId}', ${slotNo}, '${o.val}')">
          ${o.val}
        </button>
      `).join('')}
    </div>
    <div class="modal-footer" style="margin-top:10px">
      <button class="btn btn-ghost" style="width:100%" onclick="UI.closeModal()">キャンセル</button>
    </div>
  `);
};

Pages._udSaveMemberSex = async function (displayId, slotNo, newSex) {
  const unit = Store.getUnitByDisplayId && Store.getUnitByDisplayId(displayId);
  if (!unit) { UI.toast('ユニットが見つかりません', 'error'); return; }

  const members = _udParseMembers(unit);
  let targetIdx = members.findIndex(x => x.unit_slot_no === slotNo);
  if (targetIdx === -1) targetIdx = slotNo - 1;
  if (targetIdx < 0 || targetIdx >= members.length) {
    UI.toast('対象メンバーが見つかりません', 'error'); return;
  }

  members[targetIdx] = { ...members[targetIdx], sex: newSex };
  const newMembersStr = JSON.stringify(members);

  console.log('[UD][20260418a] save member sex', { displayId, slotNo, newSex });
  UI.closeModal();

  try {
    UI.loading(true);
    await API.unit.update({ unit_id: unit.unit_id, members: newMembersStr });

    // 楽観的キャッシュ更新
    if (typeof Store.patchDBItem === 'function') {
      Store.patchDBItem('breeding_units', 'unit_id', unit.unit_id, { members: newMembersStr });
    }

    UI.toast(`✅ ${slotNo}頭目を ${newSex} に変更しました`, 'success', 2000);
    Pages.unitDetail({ unitDisplayId: displayId });
  } catch (e) {
    console.error('[UD] save member sex error:', e);
    UI.toast('❌ 保存失敗: ' + (e.message || '通信エラー'), 'error', 4000);
    // 通信失敗でもローカルは更新（既存fix4の _udSaveBasic と同じ方針）
    if (typeof Store.patchDBItem === 'function') {
      Store.patchDBItem('breeding_units', 'unit_id', unit.unit_id, { members: newMembersStr });
    }
  } finally {
    UI.loading(false);
  }
};

// ── T2/T3移行ショートカット ─────────────────────────────────────
Pages._udStartT2 = function (displayId) {
  Pages.t2SessionStart && Pages.t2SessionStart(displayId);
};
Pages._udStartT3 = function (displayId) {
  Pages.t3SessionStart && Pages.t3SessionStart(displayId);
};

// ── BU成長記録 → 継続読取りモード ──────────────────────────────
Pages._udGrowthRecord = function (unitId, displayId) {
  // ユニットの成長記録は継続読取りモードで2頭分を記録
  routeTo('continuous-scan', { 
    targetType: 'UNIT',
    targetId: unitId,
    displayId: displayId,
    mode: 'growth'
  });
};

// ═══════════════════════════════════════════════════════════════
// [20260419c] ユニット用 成長記録編集モーダル
//   既存の Pages._grEditRecord は単一体重フィールドで個別飼育向け。
//   ユニットは2頭飼育のため、体重①/体重②を横並びで編集できる専用モーダルを用意。
//   引数:
//     r1Id: 1頭目の record_id（空の場合あり）
//     r2Id: 2頭目の record_id（空の場合あり）
//     date: 対象日付（表示用/保存リクエストで使用）
// ═══════════════════════════════════════════════════════════════
Pages._udEditGrowthRecord = function (r1Id, r2Id, date) {
  // growthMap から両スロットのレコードを検索
  var gm = Store.getDB('growthMap') || {};
  var rec1 = null, rec2 = null;
  Object.values(gm).forEach(function (recs) {
    (recs || []).forEach(function (r) {
      if (r1Id && r.record_id === r1Id) rec1 = r;
      if (r2Id && r.record_id === r2Id) rec2 = r;
    });
  });

  // 共通フィールドの初期値: rec1 優先、なければ rec2
  var base = rec1 || rec2 || {};
  var initDate = String(base.record_date || date || '').replace(/\//g, '-');
  var initW1   = rec1 ? (rec1.weight_g || '') : '';
  var initW2   = rec2 ? (rec2.weight_g || '') : '';
  var initStage = base.stage || '';
  var initCont  = base.container || '';
  var initMat   = base.mat_type || '';
  var initExch  = base.exchange_type || '';
  var initNote  = base.note_private || '';

  // セレクト選択肢（_grEditRecord と統一）
  var STAGE_OPTS = ['L1L2', 'L3', 'PREPUPA'].map(function (s) {
    return '<option value="' + s + '" ' + (initStage === s ? 'selected' : '') + '>' + s + '</option>';
  }).join('');

  var CONT_STD = ['1.8L', '2.7L', '4.8L'];
  var CONT_OPTS = CONT_STD.map(function (v) {
    return '<option value="' + v + '" ' + (initCont === v ? 'selected' : '') + '>' + v + '</option>';
  }).join('');
  if (initCont && !CONT_STD.includes(initCont)) {
    CONT_OPTS += '<option value="' + initCont.replace(/"/g, '&quot;') + '" selected>' + initCont + '（その他）</option>';
  }

  var MAT_OPTS = ['T0', 'T1', 'T2', 'T3', 'MD'].map(function (v) {
    return '<option value="' + v + '" ' + (initMat === v ? 'selected' : '') + '>' + v + '</option>';
  }).join('');

  var EXCH_OPTS = ''
    + '<option value="FULL" ' + (initExch === 'FULL' ? 'selected' : '') + '>全交換</option>'
    + '<option value="ADD" '  + (initExch === 'ADD' || initExch === 'PARTIAL' ? 'selected' : '') + '>追加</option>'
    + '<option value="NONE" ' + (initExch === 'NONE' ? 'selected' : '') + '>なし</option>';

  // 状態: 片方しかレコードがない場合の注意書き
  var missingNote = '';
  if (!rec1 && rec2) {
    missingNote = '<div style="font-size:.72rem;color:var(--text3);margin:-4px 0 8px">※1頭目の記録は存在しません。体重①を入力すると新規追加されます。</div>';
  } else if (rec1 && !rec2) {
    missingNote = '<div style="font-size:.72rem;color:var(--text3);margin:-4px 0 8px">※2頭目の記録は存在しません。体重②を入力すると新規追加されます。</div>';
  }

  UI.modal(`
    <div class="modal-title">成長記録を編集（ユニット）</div>
    <div class="form-section" style="max-height:60vh;overflow-y:auto">
      ${UI.field('記録日', '<input type="date" id="ude-date" class="input" value="' + initDate + '">')}
      <div class="form-row-2">
        ${UI.field('<span style="color:#c8a84b">①体重(g)</span>', '<input type="number" id="ude-w1" class="input" step="0.1" value="' + initW1 + '" placeholder="例: 22">')}
        ${UI.field('<span style="color:#4caf78">②体重(g)</span>', '<input type="number" id="ude-w2" class="input" step="0.1" value="' + initW2 + '" placeholder="例: 22">')}
      </div>
      ${missingNote}
      <div class="form-row-2">
        ${UI.field('ステージ', '<select id="ude-stage" class="input"><option value="">—</option>' + STAGE_OPTS + '</select>')}
        ${UI.field('容器', '<select id="ude-cont" class="input"><option value="">—</option>' + CONT_OPTS + '</select>')}
      </div>
      <div class="form-row-2">
        ${UI.field('マット', '<select id="ude-mat" class="input"><option value="">—</option>' + MAT_OPTS + '</select>')}
        ${UI.field('交換区分', '<select id="ude-exch" class="input"><option value="">—</option>' + EXCH_OPTS + '</select>')}
      </div>
      ${UI.field('メモ', '<input type="text" id="ude-note" class="input" value="' + (initNote || '') + '" placeholder="任意">')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._udSaveEditGrowth('${r1Id || ''}','${r2Id || ''}')">更新</button>
    </div>
    <!-- [20260421i] 削除ボタン（ユニットの場合は2スロット分まとめて削除） -->
    <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border2)">
      <button class="btn" style="width:100%;padding:10px;background:rgba(224,80,80,.12);border:1px solid rgba(224,80,80,.4);color:var(--red,#e05050);font-size:.82rem;font-weight:700"
        onclick="Pages._udDeleteGrowthPair('${r1Id || ''}','${r2Id || ''}')">🗑️ この日の記録を削除（誤登録時のみ）</button>
    </div>
  `);
};

// [20260421i] ユニット成長記録の削除
//   ユニットの成長記録は1日に2行（スロット①②）存在するため、
//   同じ日付の record_id ペア両方を削除する。2段確認付き。
// [20260422d] 削除後にユニット本体 (mat_type/stage_phase/container_size) を
//   「残っている成長記録の最新行」に合わせて巻き戻すため、
//   _udReconcileUnitAfterDelete ヘルパーを呼び出す。
Pages._udReconcileUnitAfterDelete = function (unitDisplayId) {
  try {
    var units = Store.getDB('breeding_units') || [];
    var unit = units.find(function (u) {
      return u.display_id === unitDisplayId || u.unit_id === unitDisplayId;
    });
    if (!unit || !unit.unit_id) {
      console.warn('[UD-reconcile] unit not found for', unitDisplayId);
      return;
    }

    // 残存成長記録を収集 (unit_id と display_id 両方のキーでヒットする可能性あり)
    var gm = Store.getDB('growthMap') || {};
    var recs = [];
    if (gm[unit.unit_id]) recs = recs.concat(gm[unit.unit_id]);
    if (unit.display_id && unit.display_id !== unit.unit_id && gm[unit.display_id]) {
      recs = recs.concat(gm[unit.display_id]);
    }
    if (recs.length === 0) {
      console.log('[UD-reconcile] no records remain, skip reconcile');
      return;
    }

    // 日付降順ソート → 最新のマット種別/容器サイズを取得
    recs.sort(function (a, b) {
      var da = String(a.record_date || '').replace(/-/g, '/');
      var db = String(b.record_date || '').replace(/-/g, '/');
      return db.localeCompare(da);
    });
    var latestMat = '', latestCont = '';
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i] || {};
      if (!latestMat && r.mat_type) latestMat = String(r.mat_type).trim();
      if (!latestCont && (r.container || r.container_size)) {
        latestCont = String(r.container || r.container_size).trim();
      }
      if (latestMat && latestCont) break;
    }

    // 差分計算
    var curMat  = String(unit.mat_type || '').trim();
    var curCont = String(unit.container_size || '').trim();
    var unitPatch = {};
    if (latestMat && latestMat !== curMat) {
      var phaseMap = { T0: 'T1', T1: 'T1', T2: 'T2', T3: 'T3', MD: 'T3' };
      unitPatch.mat_type    = latestMat;
      unitPatch.stage_phase = phaseMap[latestMat] || unit.stage_phase || '';
    }
    if (latestCont && latestCont !== curCont) {
      unitPatch.container_size = latestCont;
    }
    if (Object.keys(unitPatch).length === 0) {
      console.log('[UD-reconcile] no diff, skip');
      return;
    }

    console.log('[UD-reconcile] patching unit:', unitPatch, '(from latest rec:', { latestMat: latestMat, latestCont: latestCont }, ')');

    // ロールバック用の元値
    var rollbackPatch = {
      mat_type:       unit.mat_type       || '',
      stage_phase:    unit.stage_phase    || '',
      container_size: unit.container_size || '',
    };

    // 楽観UI更新: Store を先行反映 (同期) → この後の再描画で即反映される
    if (Store.patchDBItem) {
      Store.patchDBItem('breeding_units', 'unit_id', unit.unit_id, unitPatch);
    }

    // API はバックグラウンド (await しない)。失敗時はロールバック+再描画。
    API.unit.update(Object.assign({ unit_id: unit.unit_id }, unitPatch))
      .then(function () {
        console.log('[UD-reconcile] API succeeded');
      })
      .catch(function (apiErr) {
        console.error('[UD-reconcile] API failed, rolling back:', apiErr);
        if (Store.patchDBItem) {
          Store.patchDBItem('breeding_units', 'unit_id', unit.unit_id, rollbackPatch);
        }
        try {
          var _params = Store.getParams ? Store.getParams() : {};
          if (_params.unitDisplayId && typeof Pages.unitDetail === 'function') {
            window._skipNextGrowthLoad = true;
            Pages.unitDetail({ unitDisplayId: _params.unitDisplayId });
          }
        } catch (_rerr) { /* ignore */ }
        UI.toast('⚠️ ユニット情報の巻き戻しに失敗: ' + (apiErr.message || '通信エラー'), 'error', 5000);
      });
  } catch (e) {
    console.warn('[UD-reconcile] error (non-fatal):', e.message);
  }
};

Pages._udDeleteGrowthPair = async function (r1Id, r2Id) {
  if (!r1Id && !r2Id) { UI.toast('削除対象の記録が見つかりません', 'error'); return; }
  if (!confirm('この日の成長記録を削除しますか？\n（①②両スロットの記録が削除されます）\n\n※この操作は元に戻せません。\n誤登録の訂正用に提供されている機能です。')) return;
  var typed = prompt('本当に削除する場合は「削除」と入力してください。');
  if (typed !== '削除') {
    UI.toast('削除をキャンセルしました', 'info');
    return;
  }
  try {
    UI.loading(true); UI.closeModal();
    var deletedIds = [];
    if (r1Id) {
      // [20260421j] API.growth.delete はオブジェクト {record_id} を期待
      //   従来 r1Id を直接渡していたため必須項目不足エラーになっていた
      await API.growth.delete({ record_id: r1Id });
      deletedIds.push(r1Id);
    }
    if (r2Id && r2Id !== r1Id) {
      await API.growth.delete({ record_id: r2Id });
      deletedIds.push(r2Id);
    }
    // Store 更新
    var gm = Store.getDB('growthMap') || {};
    Object.entries(gm).forEach(function (entry) {
      var tid = entry[0], recs = entry[1] || [];
      var filtered = recs.filter(function (r) { return deletedIds.indexOf(r.record_id) === -1; });
      if (filtered.length !== recs.length) {
        Store.setGrowthRecords(tid, filtered);
      }
    });

    // [20260422d] 削除後にユニット本体を残存記録の最新行に合わせて巻き戻し
    //   Store は同期的に先行反映されるため、直後の再描画で即座に T2→T1, 4.8L→2.7L などが反映される。
    //   API はバックグラウンド実行（await しない）。
    try {
      var _paramsR = Store.getParams ? Store.getParams() : {};
      if (_paramsR.unitDisplayId && typeof Pages._udReconcileUnitAfterDelete === 'function') {
        Pages._udReconcileUnitAfterDelete(_paramsR.unitDisplayId);
      }
    } catch (_recErr) { console.warn('[UD] reconcile call failed (non-fatal):', _recErr.message); }

    UI.toast('成長記録を削除しました（' + deletedIds.length + '件）', 'success');
    // unit-detail ページを再描画
    // [20260421n] _skipNextGrowthLoad で API.growth.list を飛ばして高速再描画
    try {
      var _params = Store.getParams ? Store.getParams() : {};
      if (_params.unitDisplayId && typeof Pages.unitDetail === 'function') {
        window._skipNextGrowthLoad = true;
        Pages.unitDetail({ unitDisplayId: _params.unitDisplayId });
      }
    } catch (_rerr) { /* ignore */ }
  } catch (e) {
    UI.toast('削除失敗: ' + (e.message || '通信エラー'), 'error');
  } finally {
    UI.loading(false);
  }
};

// 保存ハンドラ: 変更があったスロットのみ API.growth.update を呼ぶ
Pages._udSaveEditGrowth = async function (r1Id, r2Id) {
  var date   = (document.getElementById('ude-date')?.value  || '').replace(/-/g, '/');
  var w1     = document.getElementById('ude-w1')?.value      || '';
  var w2     = document.getElementById('ude-w2')?.value      || '';
  var stage  = document.getElementById('ude-stage')?.value   || '';
  var cont   = document.getElementById('ude-cont')?.value    || '';
  var mat    = document.getElementById('ude-mat')?.value     || '';
  var exch   = document.getElementById('ude-exch')?.value    || '';
  var note   = document.getElementById('ude-note')?.value    || '';

  // 既存レコードを取得（変更検知用）
  var gm = Store.getDB('growthMap') || {};
  var rec1 = null, rec2 = null;
  Object.values(gm).forEach(function (recs) {
    (recs || []).forEach(function (r) {
      if (r1Id && r.record_id === r1Id) rec1 = r;
      if (r2Id && r.record_id === r2Id) rec2 = r;
    });
  });

  // 共通payload部分
  var commonPayload = {
    record_date:   date,
    stage:         stage,
    container:     cont,
    mat_type:      mat,
    exchange_type: exch,
    note_private:  note,
  };

  // 各スロットの更新判定と payload 準備
  // - レコードが存在 + いずれかのフィールドに変更あり → update
  // - 体重が空欄 → 体重なしで更新（他フィールドだけ更新）
  var updates = [];
  if (rec1 && r1Id) {
    var p1 = Object.assign({ record_id: r1Id, weight_g: w1 }, commonPayload);
    // 変更があるかチェック（軽量な比較: 主要フィールドのみ）
    var changed1 = (
      String(rec1.weight_g || '') !== String(w1 || '') ||
      String(rec1.record_date || '') !== date ||
      (rec1.stage || '') !== stage ||
      (rec1.container || '') !== cont ||
      (rec1.mat_type || '') !== mat ||
      (rec1.exchange_type || '') !== exch ||
      (rec1.note_private || '') !== note
    );
    if (changed1) updates.push({ slot: 1, payload: p1 });
  }
  if (rec2 && r2Id) {
    var p2 = Object.assign({ record_id: r2Id, weight_g: w2 }, commonPayload);
    var changed2 = (
      String(rec2.weight_g || '') !== String(w2 || '') ||
      String(rec2.record_date || '') !== date ||
      (rec2.stage || '') !== stage ||
      (rec2.container || '') !== cont ||
      (rec2.mat_type || '') !== mat ||
      (rec2.exchange_type || '') !== exch ||
      (rec2.note_private || '') !== note
    );
    if (changed2) updates.push({ slot: 2, payload: p2 });
  }

  if (updates.length === 0) {
    UI.toast('変更がありません', 'info');
    UI.closeModal();
    return;
  }

  try {
    UI.loading(true);
    UI.closeModal();
    // 順次更新（並列ではなくシーケンシャルにする: Sheets書き込み競合を避けるため）
    for (var u of updates) {
      await apiCall(function () { return API.growth.update(u.payload); }, null);
    }
    UI.toast('成長記録を更新しました (' + updates.length + '件)', 'success');

    // Store の growthMap を更新（画面再描画用）
    Object.entries(gm).forEach(function (entry) {
      var tid = entry[0], recs = entry[1] || [];
      var dirty = false;
      updates.forEach(function (u) {
        var rid = u.payload.record_id;
        var idx = recs.findIndex(function (r) { return r.record_id === rid; });
        if (idx >= 0) {
          Object.assign(recs[idx], u.payload);
          dirty = true;
        }
      });
      if (dirty) Store.setGrowthRecords(tid, recs);
    });

    // ユニット詳細の成長記録テーブルを再描画
    //   ロード完了時と同じパターンで、_renderUnitDetail で全体を再レンダリング
    if (Store.getPage && Store.getPage() === 'unit-detail') {
      var p = Store.getParams() || {};
      var unitDisplayId = p.unitDisplayId || p.displayId || p.display_id || '';
      var unitId = p.unitId || p.id || '';
      var unit = null;
      if (unitDisplayId && Store.getUnitByDisplayId) {
        unit = Store.getUnitByDisplayId(unitDisplayId);
      }
      if (!unit && unitId) {
        unit = (Store.getDB('breeding_units') || []).find(function (u) { return u.unit_id === unitId; });
      }
      var main = document.getElementById('main');
      if (unit && main) {
        try { _renderUnitDetail(unit, main); } catch (_) {}
      }
    }
  } catch (e) {
    UI.toast('更新失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['unit-detail'] = function () {
  Pages.unitDetail(Store.getParams());
};
