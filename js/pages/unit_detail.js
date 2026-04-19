// ════════════════════════════════════════════════════════════════
// unit_detail.js — 飼育ユニット（BU）詳細画面
// build: 20260419a
// 変更点:
//   - [20260419a] 成長記録の表示を「1行で2頭分」に改善
//                 日付でグループ化し、1頭目(①)と2頭目(②)の体重を横並び表示。
//                 件数表示も「日付数」ベースに変更（例: 成長記録（2日分））。
//   - [20260418k] 成長記録の非同期ロードを追加
//                 app.js の syncAll は growthMap をキャッシュしないため、
//                 ユニット詳細を開くたびに API.growth.list で取得。
//                 unit_id と display_id の両方を並列取得してマージする。
//                 成長記録カードは常時表示（0件時は「記録なし」メッセージ）。
//   - [20260418j] 成長記録の履歴取得を unit_id + display_id の両方から検索するよう修正
//                 古いレコードは target_id に display_id が入っていたため、
//                 片方だけでは全履歴がヒットしなかった問題を解決
//                 （新規レコードは 20260418j から unit_id で保存される）
//   - [20260418f-fix1] 親タップで種親詳細に遷移しないバグを修正
//                     _backParams のJSON内ダブルクォートが onclick属性を壊していた
//                     → &quot; にエスケープして属性内に安全に埋め込む
//   - [20260418f] 血統・種親カードの血統表示を「祖父×祖母」形式に変更
//   - [20260418a] Step2 ③ 性別編集UI追加（メンバー行の性別バッジをタップ可能に）
// ════════════════════════════════════════════════════════════════
'use strict';

console.log('[HerculesOS] unit_detail.js v20260419a loaded');

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

      // Store に両方のキーでキャッシュ（次回即座に表示できるように）
      if (unit.unit_id) {
        Store.setGrowthRecords(unit.unit_id,    recU);
      }
      if (unit.display_id && unit.display_id !== unit.unit_id) {
        Store.setGrowthRecords(unit.display_id, recD);
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
function _udRenderGrowthRecords(records) {
  if (!records || records.length === 0) return '';

  // 日付ごとにグループ化
  var byDate = {};
  records.forEach(function(r) {
    var d = String(r.record_date || '');
    if (!d) return;
    if (!byDate[d]) {
      byDate[d] = {
        date: d,
        slot1: null,
        slot2: null,
        // 日付代表のマット/交換種別（どちらかあれば）
        matType: '',
        exchangeType: '',
        eventType: '',
      };
    }
    var slot = parseInt(r.unit_slot_no, 10);
    if (slot === 1) byDate[d].slot1 = r;
    else if (slot === 2) byDate[d].slot2 = r;
    // 最初に来た値を採用（両スロットで同じはずだが念のため）
    if (!byDate[d].matType && r.mat_type) byDate[d].matType = r.mat_type;
    if (!byDate[d].exchangeType && r.exchange_type) byDate[d].exchangeType = r.exchange_type;
    if (!byDate[d].eventType && r.event_type) byDate[d].eventType = r.event_type;
  });

  // 日付降順で並べる
  var dates = Object.keys(byDate).sort(function(a, b) { return String(b).localeCompare(String(a)); });
  var limited = dates.slice(0, 15); // 最新15日分まで表示

  // 交換種別の日本語化
  function _exLabel(ex) {
    var map = { 'FULL': '全', 'HALF': '半', 'PARTIAL': '追', 'FIRST': '初', 'NONE': '' };
    return (map[String(ex)] !== undefined) ? map[String(ex)] : String(ex || '');
  }

  return limited.map(function(d) {
    var g = byDate[d];
    var dateShort = d.slice(5); // MM/DD
    var w1 = g.slot1 && g.slot1.weight_g ? g.slot1.weight_g : null;
    var w2 = g.slot2 && g.slot2.weight_g ? g.slot2.weight_g : null;

    var w1Str = w1 !== null ? w1 + 'g' : '—';
    var w2Str = w2 !== null ? w2 + 'g' : '—';

    // マット・交換種別の末尾ラベル（例: T1/全 or T2）
    var exLabel = _exLabel(g.exchangeType);
    var tailLabel = g.matType
      ? (exLabel ? g.matType + '/' + exLabel : g.matType)
      : (exLabel || '');

    return '<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2);font-size:.82rem">'
      + '<span style="color:var(--text3);min-width:48px">' + dateShort + '</span>'
      + '<span style="flex:1;display:flex;align-items:center;gap:4px">'
        + '<span style="color:#3366cc;font-size:.75rem;font-weight:700">①</span>'
        + '<span style="font-weight:700;min-width:40px">' + w1Str + '</span>'
      + '</span>'
      + '<span style="flex:1;display:flex;align-items:center;gap:4px">'
        + '<span style="color:#cc3366;font-size:.75rem;font-weight:700">②</span>'
        + '<span style="font-weight:700;min-width:40px">' + w2Str + '</span>'
      + '</span>'
      + (tailLabel ? '<span style="color:var(--text3);font-size:.7rem;min-width:48px;text-align:right">' + tailLabel + '</span>' : '')
      + '</div>';
  }).join('');
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
        // [20260419a] 件数表示: レコード数ではなくユニークな日付数
        //   1日の記録で slot1 と slot2 の2レコードあるが、見た目は1行なので日付数で数える
        var _uniqDates = {};
        records.forEach(function(r) { if (r.record_date) _uniqDates[r.record_date] = true; });
        var _dayCount = Object.keys(_uniqDates).length;
        return `
      <div class="card" style="margin-bottom:10px">
        <div class="card-title">成長記録${records.length > 0 ? `（${_dayCount}日分）` : ''}</div>
        ${records.length > 0
          ? _udRenderGrowthRecords(records)
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
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${unit.status === 'active' && unit.stage_phase === 'T1' ? `
          <button class="btn btn-primary" style="background:var(--blue)"
            onclick="Pages._udStartT2('${unit.display_id}')">
            🔄 T2移行
          </button>` : ''}
          ${unit.status === 'active' && unit.stage_phase === 'T2' ? `
          <button class="btn btn-primary" style="background:var(--amber);color:#1a1a1a"
            onclick="Pages._udStartT3('${unit.display_id}')">
            ⭐ T3移行
          </button>` : ''}
          ${unit.status === 'active' && unit.stage_phase === 'T3' ? `
          <button class="btn btn-primary" style="background:rgba(224,144,64,.15);border:2px solid var(--amber);color:var(--amber)"
            onclick="Pages._udStartT3('${unit.display_id}')">
            🔄 T3 Mx/体重更新
          </button>` : ''}
          <button class="btn btn-ghost"
            onclick="Pages._udLabelGen('${unit.display_id}')">
            🏷️ ラベル発行
          </button>
          <button class="btn btn-ghost" style="font-size:.8rem"
            onclick="Pages._udGrowthRecord('${unit.unit_id}','${unit.display_id}')">
            📷 成長記録
          </button>
        </div>
      </div>

    </div>`;
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

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['unit-detail'] = function () {
  Pages.unitDetail(Store.getParams());
};
