// ════════════════════════════════════════════════════════════════
// individual_analysis_patch.js  build: 20260424c
// 個体詳細画面への成長分析カード追加パッチ
// このファイルは individual.js の直後に読み込んでください
//
// [20260424c] 成長分析カード/前蛹予測カードの即時表示化
//   残っていた2つの Pages.individualDetail ラップを MutationObserver 方式に切替。
//   どちらも `await _orig.call(this, indId)` で Pages.individualDetail の
//   `await API.individual.get(indId)` (20-30秒) の完了を待ってから setTimeout で
//   挿入していた。前回 (20260424a) は環境記録ボタンだけ MutationObserver 化したが、
//   成長分析カード (旧 L316) と前蛹予測 (旧 L835) は async ラップのまま残っていた。
//   新方式: 既存の環境記録用 MutationObserver の直後にもう1つ observer を追加。
//     - #acc-growth (成長記録アコーディオン) が DOM に出現したら分析カード挿入
//     - #analysis-body-XXX (分析カード本体) が出現したら前蛹予測を追記
//   initial render (Store 先行値) / API 応答後の再描画 / continuous-scan 保存後の
//   即時遷移、すべてのタイミングに追従。_injectAnalysisCard 関数は IIFE 外に出して
//   トップレベル関数化 (MutationObserver コールバックから呼べるように)。
//
// [20260424a] 環境記録ボタン挿入を MutationObserver 方式に変更
//   旧方式(20260423B)の queueMicrotask は、Pages.individualDetail の async ラップが
//   `await API.individual.get(indId)` の完了を待つため、API が 20-30 秒かかる間
//   挿入も遅延していた (initial render で DOM には既に row2 が存在するにも関わらず)。
//   新方式: #main への MutationObserver で [data-ind-btn-row2="1"] の出現を検出し
//   即座に挿入。初回同期描画でも API 応答後の再描画でも自動追従する。
//   Pages.individualDetail のラップは廃止 (他の2つのラップ: 分析カード/前蛹予測は残す)。
//
// [20260423B] 保守性改善
//   - build 番号を全ファイル統一 (`20260423B`)
//   - 起動確認ログ `console.log` を追加
//   - 環境記録ボタン挿入の setTimeout 300ms 遅延を削除 (queueMicrotask に変更)
//   - Row2 への insertBefore を `row2.querySelector('button')` で確実にする
//     (テキストノードが firstChild になる問題を回避)
// [20260423y] 環境記録ボタン挿入処理を Row2 (data-ind-btn-row2) に対応
//   individual.js 側で build 20260422k の 2段ボタンレイアウトを復元したため。
//   新レイアウト: Row1=[📷 成長記録][🏷️ ラベル発行] / Row2=[🌡️ 環境記録][編集]
//   新レイアウトが無い場合は旧セレクタ (data-ind-growth-btn / continuous-scan /
//   growth-rec) にフォールバックする。
// [20260423o] ライン特性情報を hypothesis_tags の #LP:{...} マーカーからも読み取り
//   GAS 未対応フィールド line_tags / expected_horn_rate / expected_size_mm 回避のため。
//   manage.js 側と連携して永続化問題を解消。
// [20260423n] ライン特性タグを予測に反映 (Phase 1-D 連携)
//   - line.line_tags から胸角型/胴太型/標準型を読み取り胸角率priorを上書き
//     胸角型 → 0.60、胴太型 → 0.40、標準型 → 0.50
//   - line.expected_horn_rate が手動入力されていれば最優先で使用
//   - 大型血統タグがあれば切片を +5mm 底上げ
// [20260423m] 試算結果の表示を充実化
// [20260423l] 成虫サイズ予測ロジック刷新 (Phase 1-A)
//   - 性別別モデル: ♂ 対数回帰、♀ 線形回帰
//   - ライン × 性別 縮約推定 (K=10)
//   - 胸角率内訳 (♂のみ)
//   - ライン還元率補正
//   - 生存者バイアス警告
//   - 初期値をネット実データから回帰:
//       ♂: 全長 = 55.3 × ln(前蛹体重) - 98.6
//       ♀: 全長 = 0.45 × 前蛹体重 + 35.0
//   - サイズ段階判定を現代基準に更新 (全長170mm+でギネス候補)
// ════════════════════════════════════════════════════════════════

console.log('[HerculesOS] individual_analysis.js v20260424c loaded');

// ── _growthAnalysisHTML: 成長分析カードのHTML生成 ────────────────
// records: GrowthRecordsの配列 [{record_date, weight_g, stage, ...}]
// compareMode: 'line'=同ライン比較 / 'all'=全個体比較
function _growthAnalysisHTML(indId, records, compareMode) {
  compareMode = compareMode || 'line';
  var wts = (records || [])
    .filter(function(r){ return r.weight_g && +r.weight_g > 0; })
    .sort(function(a,b){ return String(a.record_date).localeCompare(String(b.record_date)); });

  if (wts.length < 2) {
    return '<div style="font-size:.82rem;color:var(--text3);padding:8px 0;text-align:center">体重記録が2件以上になると分析が表示されます</div>';
  }

  var ind = Store.getIndividual(indId);
  var lineId = ind ? ind.line_id : null;

  // ── 成長速度（直近30日のg/日）────────────────────────────────
  var today = new Date(); today.setHours(0,0,0,0);
  var last = wts[wts.length - 1];
  var gPerDay30 = null;
  for (var i = wts.length - 2; i >= 0; i--) {
    var d1 = new Date(String(wts[i].record_date).replace(/\//g,'-'));
    var d2 = new Date(String(last.record_date).replace(/\//g,'-'));
    var diff = Math.round((d2 - d1) / 86400000);
    if (diff >= 20) {
      gPerDay30 = (+last.weight_g - +wts[i].weight_g) / diff;
      break;
    }
  }
  // 直近30日に届かない場合は最初〜最後で計算
  if (gPerDay30 === null && wts.length >= 2) {
    var d1 = new Date(String(wts[0].record_date).replace(/\//g,'-'));
    var d2 = new Date(String(last.record_date).replace(/\//g,'-'));
    var diff = Math.round((d2 - d1) / 86400000);
    if (diff > 0) gPerDay30 = (+last.weight_g - +wts[0].weight_g) / diff;
  }

  var speedStr = gPerDay30 !== null
    ? (gPerDay30 >= 0 ? '+' : '') + gPerDay30.toFixed(2) + 'g/日'
    : '—';
  var speedColor = gPerDay30 === null ? 'var(--text3)'
    : gPerDay30 >= 0.3 ? 'var(--green)' : gPerDay30 >= 0 ? 'var(--amber)' : '#e05050';

  // ── パーセンタイル計算 ────────────────────────────────────────
  var currentWeight = +last.weight_g;
  var compareInds = (Store.getDB('individuals') || []).filter(function(i){
    if (i.ind_id === indId) return false;
    if (i.status === 'dead') return false;
    if (compareMode === 'line' && lineId) return i.line_id === lineId;
    return true;
  });
  var compareWeights = compareInds
    .filter(function(i){ return i.latest_weight_g && +i.latest_weight_g > 0; })
    .map(function(i){ return +i.latest_weight_g; })
    .sort(function(a,b){ return a - b; });

  var pctLabel = '—';
  var pctColor = 'var(--text3)';
  var pctNote  = '';
  if (compareWeights.length >= 3) {
    var below = compareWeights.filter(function(w){ return w < currentWeight; }).length;
    var pct   = Math.round(below / compareWeights.length * 100);
    pctLabel  = 'TOP ' + (100 - pct) + '%';
    pctColor  = pct >= 75 ? 'var(--gold)' : pct >= 50 ? 'var(--green)' : 'var(--text2)';
    pctNote   = compareMode === 'line'
      ? '同ライン ' + compareWeights.length + '頭中'
      : '全個体 '   + compareWeights.length + '頭中';
  } else if (compareWeights.length > 0) {
    pctNote = (compareMode === 'line' ? '同ライン ' : '全個体 ') + compareWeights.length + '頭（比較数不足）';
  } else {
    pctNote = compareMode === 'line' ? '同ラインにデータなし' : '比較データなし';
  }

  // ── 予測最大体重（現在の成長速度から推定）────────────────────
  // ヘラクレスの幼虫期は孵化から約18〜24ヶ月、前蛹前に体重ピーク
  var predMaxStr = '—';
  var predMaxNote = '';
  if (gPerDay30 !== null && gPerDay30 > 0 && ind && ind.hatch_date) {
    var hatchDate = new Date(String(ind.hatch_date).replace(/\//g,'-'));
    // 前蛹まで約600日（20ヶ月）と仮定
    var prepupDay  = new Date(hatchDate); prepupDay.setDate(prepupDay.getDate() + 600);
    var lastRecDate = new Date(String(last.record_date).replace(/\//g,'-'));
    var daysLeft = Math.max(0, Math.round((prepupDay - lastRecDate) / 86400000));
    if (daysLeft > 0 && daysLeft < 400) {
      var predMax = Math.round(currentWeight + gPerDay30 * daysLeft);
      predMaxStr  = predMax + 'g';
      predMaxNote = '前蛹まで約' + daysLeft + '日（仮定）';
    }
  }
  if (predMaxStr === '—' && gPerDay30 !== null && gPerDay30 <= 0) {
    predMaxStr  = currentWeight + 'g付近';
    predMaxNote = '減少または横ばい傾向';
  }

  // ── 前蛹到達予測日 ────────────────────────────────────────────
  var prepupDateStr = '—';
  var prepupColor   = 'var(--text3)';
  if (ind && ind.hatch_date) {
    var hd = new Date(String(ind.hatch_date).replace(/\//g,'-'));
    var prepupTarget = new Date(hd); prepupTarget.setDate(prepupTarget.getDate() + 600);
    var daysToTarget = Math.round((prepupTarget - today) / 86400000);
    var mm = String(prepupTarget.getMonth()+1).padStart(2,'0');
    var dd = String(prepupTarget.getDate()).padStart(2,'0');
    prepupDateStr = prepupTarget.getFullYear() + '/' + mm + '/' + dd;
    prepupColor   = daysToTarget < 0 ? 'var(--red,#e05050)'
                  : daysToTarget < 90 ? 'var(--amber)' : 'var(--text2)';
    if (daysToTarget < 0) {
      prepupDateStr += ' <span style="font-size:.7rem;color:var(--red,#e05050)">（目安超過）</span>';
    } else {
      prepupDateStr += ' <span style="font-size:.7rem;color:var(--text3)">（あと' + daysToTarget + '日）</span>';
    }
  } else if (gPerDay30 !== null && gPerDay30 > 0) {
    // 孵化日不明でも現在の体重から推定（ヘラクレス前蛹時80〜120g想定）
    var targetWeight = 100;
    var daysNeeded   = Math.max(0, Math.round((targetWeight - currentWeight) / gPerDay30));
    if (daysNeeded > 0 && daysNeeded < 600) {
      var est = new Date(today); est.setDate(est.getDate() + daysNeeded);
      var mm = String(est.getMonth()+1).padStart(2,'0');
      var dd = String(est.getDate()).padStart(2,'0');
      prepupDateStr = est.getFullYear() + '/' + mm + '/' + dd
        + ' <span style="font-size:.7rem;color:var(--text3)">（体重推定・あと' + daysNeeded + '日）</span>';
      prepupColor = 'var(--amber)';
    }
  }

  // ── モード切替ボタン ──────────────────────────────────────────
  var modeBtn = '<div style="display:flex;gap:6px;margin-bottom:12px">'
    + '<button class="btn ' + (compareMode === 'line' ? 'btn-primary' : 'btn-ghost') + '" '
    + 'style="flex:1;font-size:.78rem;padding:8px" '
    + 'onclick="Pages._indSwitchAnalysis(\'' + indId + '\',\'line\')">同ライン比較</button>'
    + '<button class="btn ' + (compareMode === 'all' ? 'btn-primary' : 'btn-ghost') + '" '
    + 'style="flex:1;font-size:.78rem;padding:8px" '
    + 'onclick="Pages._indSwitchAnalysis(\'' + indId + '\',\'all\')">全個体比較</button>'
    + '</div>';

  // ── 体重推移ミニグラフ（分析用） ──────────────────────────────
  var chartId = 'analysis-chart-' + indId;

  // ── HTML組み立て ──────────────────────────────────────────────
  var kpiStyle = 'flex:1;min-width:0;background:var(--surface2);border-radius:10px;padding:10px 8px;text-align:center';

  var html = modeBtn
    + '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">'

    // 成長速度
    + '<div style="' + kpiStyle + '">'
    +   '<div style="font-size:.68rem;color:var(--text3);margin-bottom:4px">📈 成長速度</div>'
    +   '<div style="font-size:1.1rem;font-weight:700;color:' + speedColor + '">' + speedStr + '</div>'
    +   '<div style="font-size:.65rem;color:var(--text3);margin-top:2px">直近速度</div>'
    + '</div>'

    // パーセンタイル
    + '<div style="' + kpiStyle + '">'
    +   '<div style="font-size:.68rem;color:var(--text3);margin-bottom:4px">🏅 順位</div>'
    +   '<div style="font-size:1.1rem;font-weight:700;color:' + pctColor + '">' + pctLabel + '</div>'
    +   '<div style="font-size:.65rem;color:var(--text3);margin-top:2px">' + pctNote + '</div>'
    + '</div>'

    // 予測最大体重
    + '<div style="' + kpiStyle + '">'
    +   '<div style="font-size:.68rem;color:var(--text3);margin-bottom:4px">🎯 予測最大</div>'
    +   '<div style="font-size:1.1rem;font-weight:700;color:var(--green)">' + predMaxStr + '</div>'
    +   (predMaxNote ? '<div style="font-size:.65rem;color:var(--text3);margin-top:2px">' + predMaxNote + '</div>' : '')
    + '</div>'

    + '</div>'

    // 前蛹到達予測
    + '<div style="background:var(--surface2);border-radius:10px;padding:10px 12px;margin-bottom:10px">'
    +   '<div style="font-size:.72rem;color:var(--text3);margin-bottom:4px">🦋 前蛹到達予測</div>'
    +   '<div style="font-size:.9rem;font-weight:700;color:' + prepupColor + '">' + prepupDateStr + '</div>'
    + '</div>'

    // 成長曲線ミニグラフ
    + (wts.length >= 3
      ? '<canvas id="' + chartId + '" style="max-height:140px;margin-top:4px"></canvas>'
      : '')
  ;

  return html;
}

// ── Pages._indSwitchAnalysis: モード切替（同ライン/全個体） ─────
Pages._indSwitchAnalysis = function(indId, mode) {
  var ind     = Store.getIndividual(indId);
  var records = Store.getGrowthRecords(indId) || [];
  var el = document.getElementById('analysis-body-' + indId);
  if (!el) return;
  el.innerHTML = _growthAnalysisHTML(indId, records, mode);
  // グラフ再描画
  var wts = records.filter(function(r){ return r.weight_g && +r.weight_g > 0; })
    .sort(function(a,b){ return String(a.record_date).localeCompare(String(b.record_date)); });
  if (wts.length >= 3) {
    setTimeout(function(){ _drawAnalysisChart(indId, wts); }, 50);
  }
};

// ── _drawAnalysisChart: 分析用ミニグラフ描画 ────────────────────
function _drawAnalysisChart(indId, wts) {
  var el = document.getElementById('analysis-chart-' + indId);
  if (!el || typeof Chart === 'undefined') return;
  // 既存チャートを破棄
  if (el._chartInst) { el._chartInst.destroy(); }
  el._chartInst = new Chart(el, {
    type: 'line',
    data: {
      labels: wts.map(function(r){ return r.record_date; }),
      datasets: [{
        data:               wts.map(function(r){ return +r.weight_g; }),
        borderColor:        '#c8a84b',
        backgroundColor:    'rgba(200,168,75,0.1)',
        pointBackgroundColor:'#c8a84b',
        pointRadius:        3,
        tension:            0.3,
        fill:               true,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6a7c6a', maxTicksLimit: 4, font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#6a7c6a', font: { size: 9 } },                   grid: { color: 'rgba(255,255,255,0.05)' } },
      }
    }
  });
}

// ── _patchIndividualDetailForAnalysis: 個体詳細の描画をパッチ ───
// individual.jsの _renderDetail が呼ばれた後に成長分析カードを
// 体重推移アコーディオンの直後に動的挿入する
// [20260424c] _injectAnalysisCard をトップレベル関数化
//   IIFE 外からも呼べるように (下部の MutationObserver から参照)
function _injectAnalysisCard(indId, records) {
  var accGrowth = document.getElementById('acc-growth');
  if (!accGrowth) return;
  // 既に挿入済みなら二重挿入しない
  if (document.getElementById('acc-analysis')) return;

  var wts = (records || [])
    .filter(function(r){ return r.weight_g && +r.weight_g > 0; });

  var card = document.createElement('div');
  card.className = 'accordion';
  card.id = 'acc-analysis';
  card.innerHTML =
    '<div class="acc-hdr" onclick="_toggleAcc(\'acc-analysis\')">'
    + '📊 成長分析 <span class="acc-arrow">▼</span>'
    + '</div>'
    + '<div class="acc-body open" id="analysis-body-' + indId + '">'
    + _growthAnalysisHTML(indId, records, 'line')
    + '</div>';

  accGrowth.parentNode.insertBefore(card, accGrowth.nextSibling);

  // グラフ描画
  var sortedWts = wts.sort(function(a,b){
    return String(a.record_date).localeCompare(String(b.record_date));
  });
  if (sortedWts.length >= 3) {
    setTimeout(function(){ _drawAnalysisChart(indId, sortedWts); }, 150);
  }
}
// [20260424c] 旧実装の Pages.individualDetail ラップは削除
//   下部の "分析カード用 MutationObserver" で自動挿入される。

// ════════════════════════════════════════════════════════════════
// [20260423l] ④ 前蛹体重 → 成虫サイズ予測 (Phase 1-A 刷新)
//    ・性別別モデル (♂は対数回帰 / ♀は線形回帰)
//    ・ライン×性別 縮約推定 (K=10)
//    ・胸角率内訳 (♂のみ)
//    ・ライン還元率補正
//    ・バイアス警告 (生存者バイアス)
//
//    初期値 (データ0件時):
//      ♂: 全長 = 55.3 × ln(前蛹体重) - 98.6
//         (ネット実データ3点から回帰: 75g→140mm, 106g→168mm, 155g→180mm)
//         還元率 0.85, 胸角率 0.50
//      ♀: 全長 = 0.45 × 前蛹体重 + 35.0
//         (けいとさん情報: 100g→80.5mm, 110g→85mm)
//         還元率 0.90, 胸角なし
// ════════════════════════════════════════════════════════════════

// 経験則初期値 (データ0件時の事前分布)
var SIZE_PRIORS = {
  '♂': { model:'log',    a: 55.3, b: -98.6, r2: 0.95, reduction: 0.85, hornRate: 0.50 },
  '♀': { model:'linear', a: 0.45, b: 35.0,  r2: 0.90, reduction: 0.90, hornRate: null },
};

// モデルから予測値を計算
function _applyModel(weight, model) {
  if (!model || !weight) return null;
  if (model.model === 'log') {
    if (weight <= 0) return null;
    return model.a * Math.log(weight) + model.b;
  }
  return model.a * weight + model.b;
}

// 線形最小二乗法 (従来通り)
function _linearRegression(pairs) {
  if (!pairs || pairs.length < 3) return null;
  var n   = pairs.length;
  var sx  = pairs.reduce(function(s,p){ return s + p.x; }, 0);
  var sy  = pairs.reduce(function(s,p){ return s + p.y; }, 0);
  var sxy = pairs.reduce(function(s,p){ return s + p.x * p.y; }, 0);
  var sx2 = pairs.reduce(function(s,p){ return s + p.x * p.x; }, 0);
  var denom = n * sx2 - sx * sx;
  if (denom === 0) return null;
  var a = (n * sxy - sx * sy) / denom;
  var b = (sy - a * sx) / n;
  var yMean = sy / n;
  var ssTot = pairs.reduce(function(s,p){ return s + (p.y - yMean) * (p.y - yMean); }, 0);
  var ssRes = pairs.reduce(function(s,p){ return s + (p.y - (a*p.x+b)) * (p.y - (a*p.x+b)); }, 0);
  var r2    = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { model:'linear', a:a, b:b, r2:r2, n:n };
}

// 対数回帰 (♂用): y = a × ln(x) + b
function _logRegression(pairs) {
  if (!pairs || pairs.length < 3) return null;
  // ln(x) に変換してから線形回帰
  var transformed = pairs
    .filter(function(p){ return p.x > 0; })
    .map(function(p){ return { x: Math.log(p.x), y: p.y }; });
  if (transformed.length < 3) return null;
  var linear = _linearRegression(transformed);
  if (!linear) return null;
  return { model:'log', a:linear.a, b:linear.b, r2:linear.r2, n:linear.n };
}

// ラインの平均還元率 (adult_size / pupa_length)
function _averageReductionRate(inds) {
  var rates = inds
    .filter(function(i){ return i.pupa_length_mm > 0 && i.adult_size_mm > 0; })
    .map(function(i){ return +i.adult_size_mm / +i.pupa_length_mm; });
  if (!rates.length) return null;
  var sum = rates.reduce(function(a,b){ return a+b; }, 0);
  return sum / rates.length;
}

// ラインの平均胸角率 (horn_length / adult_size)
function _averageHornRatio(inds) {
  var ratios = inds
    .filter(function(i){ return i.horn_length_mm > 0 && i.adult_size_mm > 0 && i.sex === '♂'; })
    .map(function(i){ return +i.horn_length_mm / +i.adult_size_mm; });
  if (!ratios.length) return null;
  var sum = ratios.reduce(function(a,b){ return a+b; }, 0);
  return sum / ratios.length;
}

// 縮約推定: ライン固有モデルと全体モデルを重み付き平均
//   重み w = n / (n + K)
//   n が大きいほどライン固有が優先、小さいほど全体平均が優先
function _shrinkageBlend(lineModel, globalModel, n, K) {
  if (!globalModel) return lineModel;
  if (!lineModel) return globalModel;
  var w = n / (n + K);
  var blended = {
    model: globalModel.model,
    a: w * lineModel.a + (1 - w) * globalModel.a,
    b: w * lineModel.b + (1 - w) * globalModel.b,
    r2: lineModel.r2 || globalModel.r2,
    n: n,
    shrinkWeight: w,
  };
  return blended;
}

// メイン予測関数 (V2)
//   prepupaG: 前蛹体重
//   sex: '♂' / '♀' / '不明'
//   lineId: ライン ID (省略時はライン無視)
// 戻り値:
//   {
//     totalLength: 全長(mm),
//     hornLength:  胸角長(mm) (♂のみ),
//     bodyLength:  胴体長(mm) (♂の参考値),
//     range: { lower, upper },
//     mode: 'line_specific' / 'shrinkage' / 'global' / 'prior',
//     sampleN, parentSampleN, r2,
//     hornRateUsed, reductionUsed,
//     biasWarning: { hasSoldData, soldN },
//   }
function _predictAdultSizeV2(prepupaG, sex, lineId) {
  if (!prepupaG || prepupaG <= 0) return null;
  if (!sex) sex = '♂'; // デフォルト

  var inds = (Store.getDB('individuals') || []);
  var line = lineId ? Store.getLine(lineId) : null;

  // [20260423n] ライン特性タグから事前分布をカスタマイズ
  //   大型血統 → 初期予測を +5mm 底上げ
  //   胸角型   → 初期胸角率 0.60
  //   胴太型   → 初期胸角率 0.40
  //   標準型   → 初期胸角率 0.50 (既定通り)
  //   expected_horn_rate / expected_size_mm が手動入力されていれば優先
  var basePrior = SIZE_PRIORS[sex] || SIZE_PRIORS['♂'];
  var prior = {
    model: basePrior.model,
    a: basePrior.a,
    b: basePrior.b,
    r2: basePrior.r2,
    reduction: basePrior.reduction,
    hornRate: basePrior.hornRate,
  };
  if (line) {
    // [20260423o] ライン特性情報を取得
    //   優先1: 直接フィールド (line_tags / expected_horn_rate / expected_size_mm)
    //   優先2: hypothesis_tags の末尾 #LP:{json} マーカー
    //   (GAS未対応フィールドのため manage.js 側で hypothesis_tags に埋め込み)
    var tags = [];
    var expectedHornRate = null;
    var expectedSizeMm = null;

    if (line.line_tags || line.expected_horn_rate || line.expected_size_mm) {
      // 優先1: 直接フィールドがあればそれを使う
      if (Array.isArray(line.line_tags)) tags = line.line_tags;
      else if (line.line_tags) tags = String(line.line_tags).split(',').map(function(s){return s.trim();}).filter(Boolean);
      expectedHornRate = +line.expected_horn_rate || null;
      expectedSizeMm = +line.expected_size_mm || null;
    } else {
      // 優先2: hypothesis_tags 末尾の #LP:{json} を抽出
      var rawHT = String(line.hypothesis_tags || '');
      var m = rawHT.match(/#LP:(\{[^\}]*\})/);
      if (m) {
        try {
          var parsed = JSON.parse(m[1]);
          tags = Array.isArray(parsed.tags) ? parsed.tags : [];
          expectedHornRate = +parsed.horn_rate || null;
          expectedSizeMm = +parsed.size || null;
        } catch(e) { /* ignore */ }
      }
    }

    // 期待胸角率 (♂のみ)
    if (sex === '♂') {
      if (expectedHornRate && expectedHornRate > 0) {
        prior.hornRate = expectedHornRate / 100;
      } else if (tags.includes('horn')) {
        prior.hornRate = 0.60;
      } else if (tags.includes('body')) {
        prior.hornRate = 0.40;
      } else if (tags.includes('standard')) {
        prior.hornRate = 0.50;
      }
    }
    // 大型血統タグは切片を +5mm
    if (tags.includes('large')) {
      prior.b = prior.b + 5;
    }
  }

  // 性別全体データ (生存者のみ: adult_size_mm 実測値)
  var sexPool = inds.filter(function(i){
    return i.sex === sex && i.prepupa_weight_g > 0 && i.adult_size_mm > 0;
  });

  // ライン×性別データ
  var linePool = lineId
    ? sexPool.filter(function(i){ return i.line_id === lineId; })
    : [];

  // 回帰モデル作成 (性別に応じてモデル選択)
  function _fitModel(pool) {
    if (pool.length < 3) return null;
    var pairs = pool.map(function(i){
      return { x: +i.prepupa_weight_g, y: +i.adult_size_mm };
    });
    return prior.model === 'log' ? _logRegression(pairs) : _linearRegression(pairs);
  }

  var globalModel = _fitModel(sexPool) || prior;
  var lineModel   = _fitModel(linePool);

  // 縮約 (K=10)
  var K = 10;
  var n = linePool.length;
  var useModel = lineModel ? _shrinkageBlend(lineModel, globalModel, n, K) : globalModel;

  var predicted = _applyModel(prepupaG, useModel);
  if (predicted === null || !isFinite(predicted)) {
    predicted = _applyModel(prepupaG, prior);
  }

  // ライン還元率補正 (ライン実測 vs 全体)
  var lineReduction = _averageReductionRate(linePool);
  var globalReduction = _averageReductionRate(sexPool);
  var reductionUsed = null;
  if (lineReduction && globalReduction) {
    var correction = lineReduction / globalReduction;
    correction = Math.max(0.95, Math.min(1.05, correction));
    predicted *= correction;
    reductionUsed = lineReduction;
  } else {
    reductionUsed = globalReduction || prior.reduction;
  }

  // 胸角率 (♂のみ、縮約込み、ライン特性タグの事前分布あり)
  var hornRateUsed = null;
  var hornLength = null;
  var bodyLength = null;
  if (sex === '♂') {
    var lineHornRate = _averageHornRatio(linePool);
    var globalHornRate = _averageHornRatio(sexPool);
    if (lineHornRate) {
      // ライン実測値がある → 縮約: ライン実測 vs 全体 or prior
      var baselineHornRate = globalHornRate || prior.hornRate;
      var wH = n / (n + K);
      hornRateUsed = wH * lineHornRate + (1 - wH) * baselineHornRate;
    } else if (globalHornRate) {
      // ラインデータなしだが全体データあり → 縮約: 全体 vs prior (タグ反映済)
      // prior.hornRate はタグで既に 0.4〜0.6 のいずれかになっている可能性あり
      var wG = sexPool.length / (sexPool.length + K);
      hornRateUsed = wG * globalHornRate + (1 - wG) * prior.hornRate;
    } else {
      // データなし → priorをそのまま使用 (タグ反映済)
      hornRateUsed = prior.hornRate;
    }
    hornLength = Math.round(predicted * hornRateUsed * 10) / 10;
    bodyLength = Math.round((predicted - hornLength) * 10) / 10;
  }

  // 予測区間 (サンプル数から動的に)
  var intervalWidth = n >= 30 ? 4 : n >= 15 ? 5 : n >= 5 ? 7 : 10;

  // モード判定
  var mode = 'prior';
  if (n >= K) mode = 'line_specific';
  else if (n >= 3) mode = 'shrinkage';
  else if (sexPool.length >= 3) mode = 'global';

  // バイアス警告
  var soldInds = inds.filter(function(i){
    return i.sex === sex
        && (lineId ? i.line_id === lineId : true)
        && (i.status === 'sold' || i.status === 'dead')
        && (!i.adult_size_mm || +i.adult_size_mm === 0)
        && i.prepupa_weight_g > 0;
  });
  var biasWarning = {
    hasSoldData: soldInds.length > 0,
    soldN: soldInds.length,
    growthN: n,
  };

  return {
    totalLength: Math.round(predicted * 10) / 10,
    hornLength: hornLength,
    bodyLength: bodyLength,
    range: {
      lower: Math.round((predicted - intervalWidth) * 10) / 10,
      upper: Math.round((predicted + intervalWidth) * 10) / 10,
    },
    mode: mode,
    sampleN: n,
    parentSampleN: sexPool.length,
    r2: useModel.r2 || null,
    hornRateUsed: hornRateUsed,
    reductionUsed: reductionUsed,
    shrinkWeight: useModel.shrinkWeight || null,
    biasWarning: biasWarning,
    modelType: useModel.model,
    sex: sex,
    lineTags: line ? (line.line_tags || '') : '',
  };
}

// 旧 API 互換 (既存コードからの呼び出しも壊さない)
function _predictAdultSize(prepupaG) {
  var pred = _predictAdultSizeV2(prepupaG, '♂', null);
  if (!pred) return { predicted:0, lower:0, upper:0, r2:0, sampleN:0 };
  return {
    predicted: pred.totalLength,
    lower: pred.range.lower,
    upper: pred.range.upper,
    r2: pred.r2 || 0.9,
    sampleN: pred.sampleN,
  };
}

// 前蛹予測カードHTML (刷新版)
function _prepupaPredictionHTML(ind) {
  var prepupaG = ind ? (+ind.prepupa_weight_g || null) : null;
  var sex = ind ? (ind.sex || '♂') : '♂';
  var lineId = ind ? ind.line_id : null;

  // 前蛹体重が入力済みの場合: 予測結果を表示
  if (prepupaG && prepupaG > 0) {
    var pred = _predictAdultSizeV2(prepupaG, sex, lineId);
    if (!pred) return '';

    // サイズ段階 (全長ベース、現代基準)
    var sizeGrade = pred.totalLength >= 180 ? { label:'ギネス級',     color:'var(--gold)',  icon:'🏆🏆' }
      : pred.totalLength >= 170 ? { label:'ギネス候補',  color:'var(--gold)',  icon:'🏆'   }
      : pred.totalLength >= 160 ? { label:'大型個体',   color:'var(--green)', icon:'💪'   }
      : pred.totalLength >= 150 ? { label:'標準〜大',   color:'var(--text2)', icon:'📏'   }
      : { label:'標準',      color:'var(--text3)', icon:'📏'   };

    // モード表示
    var modeLabel = pred.mode === 'line_specific' ? 'ライン特化'
                  : pred.mode === 'shrinkage'     ? 'ライン縮約 ' + (pred.shrinkWeight ? '(' + Math.round(pred.shrinkWeight*100) + '%)' : '')
                  : pred.mode === 'global'        ? '全体性別別'
                  : '経験則 (データ蓄積で精度向上)';

    // R² 表示
    var r2Str = pred.r2 ? pred.r2.toFixed(3) : '—';
    var precisionColor = (pred.r2 && pred.r2 >= 0.9) ? 'var(--green)'
                      : (pred.r2 && pred.r2 >= 0.7) ? 'var(--amber)'
                      : 'var(--text3)';

    // 胸角情報 (♂のみ)
    var hornBlock = '';
    if (sex === '♂' && pred.hornLength) {
      hornBlock =
        '<div style="font-size:.7rem;color:var(--text3);margin-top:6px;padding:6px 8px;background:var(--bg2);border-radius:6px">' +
          '<div style="margin-bottom:2px">内訳 (♂):</div>' +
          '<div style="display:flex;justify-content:space-between;gap:8px">' +
            '<span>⚔️ 胸角: <strong style="color:var(--text1)">' + pred.hornLength + 'mm</strong> (' + Math.round(pred.hornRateUsed*1000)/10 + '%)</span>' +
            '<span>📐 胴体: <strong style="color:var(--text2)">' + pred.bodyLength + 'mm</strong></span>' +
          '</div>' +
        '</div>';
    }

    // バイアス警告
    var biasBlock = '';
    if (pred.biasWarning.hasSoldData && pred.mode !== 'prior') {
      biasBlock =
        '<div style="font-size:.68rem;color:var(--amber);margin-top:6px;padding:6px 8px;background:rgba(224,144,64,.1);border-radius:6px;line-height:1.4">' +
          '⚠️ このモデルは成虫計測まで完了した ' + pred.sampleN + ' 頭のデータで作成されています。<br>' +
          '販売済み ' + pred.biasWarning.soldN + ' 頭のデータは含まれていないため、軽量前蛹域の予測精度は限定的です。' +
        '</div>';
    }

    // データ状態表示
    var dataNote = pred.mode === 'line_specific' ? ('ライン内 ' + pred.sampleN + '頭データ')
                 : pred.mode === 'shrinkage'     ? ('ライン内 ' + pred.sampleN + '頭 + 全体 ' + pred.parentSampleN + '頭 を縮約')
                 : pred.mode === 'global'        ? ('性別全体 ' + pred.parentSampleN + '頭データ')
                 : '経験則ベース (データ蓄積で精度向上)';

    return '<div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-top:8px">' +
      '<div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:10px">🦋 成虫サイズ予測（前蛹体重から）</div>' +

      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">' +
        '<div style="text-align:center;flex-shrink:0">' +
          '<div style="font-size:.64rem;color:var(--text3)">前蛹体重</div>' +
          '<div style="font-size:1rem;font-weight:700;color:var(--amber)">' + prepupaG + 'g</div>' +
          '<div style="font-size:.62rem;color:var(--text3)">' + sex + '</div>' +
        '</div>' +
        '<div style="font-size:1.1rem;color:var(--text3);flex-shrink:0">→</div>' +
        '<div style="flex:1;text-align:center">' +
          '<div style="font-size:.64rem;color:var(--text3)">予測全長</div>' +
          '<div style="font-size:1.5rem;font-weight:700;color:' + sizeGrade.color + '">' + pred.totalLength + 'mm</div>' +
          '<div style="font-size:.64rem;color:var(--text3)">範囲: ' + pred.range.lower + '〜' + pred.range.upper + 'mm</div>' +
        '</div>' +
        '<div style="text-align:center;flex-shrink:0">' +
          '<div style="font-size:1.1rem">' + sizeGrade.icon + '</div>' +
          '<div style="font-size:.68rem;font-weight:700;color:' + sizeGrade.color + '">' + sizeGrade.label + '</div>' +
        '</div>' +
      '</div>' +

      hornBlock +

      '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;font-size:.66rem">' +
        '<span style="color:' + precisionColor + '">精度 R²=' + r2Str + '</span>' +
        '<span style="color:var(--text3)">' + modeLabel + '</span>' +
      '</div>' +
      '<div style="font-size:.64rem;color:var(--text3);margin-top:2px;text-align:right">' + dataNote + '</div>' +

      biasBlock +

    '</div>';
  }

  // 前蛹体重未入力の場合: 入力促し + 試算フォーム
  return '<div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-top:8px">' +
    '<div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:6px">🦋 成虫サイズ予測（前蛹体重から）</div>' +
    '<div style="font-size:.78rem;color:var(--text3);margin-bottom:10px">前蛹体重を入力すると成虫サイズを予測できます</div>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
      '<input type="number" id="prepupa-sim-input" class="input" placeholder="前蛹体重(g)" ' +
        'style="flex:1;font-size:.88rem" min="30" max="200" step="0.1">' +
      '<button class="btn btn-ghost" style="flex:1;padding:10px;font-size:.8rem" ' +
        'onclick="Pages._indSimPrepupa(\'' + (ind ? ind.ind_id : '') + '\')">' +
        '試算する' +
      '</button>' +
    '</div>' +
    '<div id="prepupa-sim-result" style="margin-top:8px"></div>' +
  '</div>';
}

// 前蛹体重試算 (刷新版)
Pages._indSimPrepupa = function(indId) {
  var inp = document.getElementById('prepupa-sim-input');
  var g   = inp ? parseFloat(inp.value) : NaN;
  var el  = document.getElementById('prepupa-sim-result');
  if (!el) return;
  if (!g || g < 30 || g > 250) {
    el.innerHTML = '<div style="font-size:.76rem;color:var(--amber)">30〜250gの範囲で入力してください</div>';
    return;
  }
  var ind = indId ? Store.getIndividual(indId) : null;
  var sex = ind ? (ind.sex || '♂') : '♂';
  var lineId = ind ? ind.line_id : null;

  var pred = _predictAdultSizeV2(g, sex, lineId);
  if (!pred) {
    el.innerHTML = '<div style="font-size:.76rem;color:var(--amber)">予測できませんでした</div>';
    return;
  }

  var sizeGrade = pred.totalLength >= 180 ? { label:'ギネス級',    color:'var(--gold)',  icon:'🏆🏆' }
    : pred.totalLength >= 170 ? { label:'ギネス候補', color:'var(--gold)',  icon:'🏆'   }
    : pred.totalLength >= 160 ? { label:'大型個体',  color:'var(--green)', icon:'💪'   }
    : pred.totalLength >= 150 ? { label:'標準〜大',  color:'var(--text2)', icon:'📏'   }
    : { label:'標準',     color:'var(--text3)', icon:'📏'   };

  var hornPart = pred.hornLength
    ? '<div style="font-size:.66rem;color:var(--text3);margin-top:4px">⚔️胸角 ' + pred.hornLength + 'mm / 📐胴体 ' + pred.bodyLength + 'mm</div>'
    : '';

  // [20260423m] 試算結果にもモード・精度・バイアス警告を表示
  var modeLabel = pred.mode === 'line_specific' ? 'ライン特化'
                : pred.mode === 'shrinkage'     ? 'ライン縮約 ' + (pred.shrinkWeight ? '(' + Math.round(pred.shrinkWeight*100) + '%)' : '')
                : pred.mode === 'global'        ? '全体性別別'
                : '経験則 (データ蓄積で精度向上)';

  var r2Str = pred.r2 ? pred.r2.toFixed(3) : '—';
  var precisionColor = (pred.r2 && pred.r2 >= 0.9) ? 'var(--green)'
                    : (pred.r2 && pred.r2 >= 0.7) ? 'var(--amber)'
                    : 'var(--text3)';

  var dataNote = pred.mode === 'line_specific' ? ('ライン内 ' + pred.sampleN + '頭データ')
               : pred.mode === 'shrinkage'     ? ('ライン内 ' + pred.sampleN + '頭 + 全体 ' + pred.parentSampleN + '頭 を縮約')
               : pred.mode === 'global'        ? ('性別全体 ' + pred.parentSampleN + '頭データ')
               : '経験則ベース (データ蓄積で精度向上)';

  var biasBlock = '';
  if (pred.biasWarning.hasSoldData && pred.mode !== 'prior') {
    biasBlock =
      '<div style="font-size:.66rem;color:var(--amber);margin-top:6px;padding:6px 8px;background:rgba(224,144,64,.1);border-radius:6px;line-height:1.4">' +
        '⚠️ 成虫計測まで完了した ' + pred.sampleN + ' 頭のデータで作成。販売済み ' + pred.biasWarning.soldN + ' 頭のデータは含まれていません。' +
      '</div>';
  }

  el.innerHTML =
    '<div style="background:var(--bg2);border-radius:8px;padding:10px">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="font-size:.7rem;color:var(--text3)">' + g + 'g (' + sex + ') →</div>' +
        '<div>' +
          '<span style="font-size:1.2rem;font-weight:700;color:' + sizeGrade.color + '">' + pred.totalLength + 'mm</span>' +
          '<span style="font-size:.72rem;color:var(--text3);margin-left:6px">（' + pred.range.lower + '〜' + pred.range.upper + 'mm）</span>' +
        '</div>' +
        '<div style="font-size:1rem">' + sizeGrade.icon + '</div>' +
        '<div style="font-size:.72rem;font-weight:700;color:' + sizeGrade.color + '">' + sizeGrade.label + '</div>' +
      '</div>' +
      hornPart +
      // [20260423m] モード・R²・データ状態
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;font-size:.64rem">' +
        '<span style="color:' + precisionColor + '">精度 R²=' + r2Str + '</span>' +
        '<span style="color:var(--text3)">' + modeLabel + '</span>' +
      '</div>' +
      '<div style="font-size:.62rem;color:var(--text3);margin-top:2px;text-align:right">' + dataNote + '</div>' +
      biasBlock +
    '</div>';
};

// ── 分析カードと前蛹予測を MutationObserver 経由で挿入 ──────────
// [20260424c] Pages.individualDetail ラップ 2本を廃止し、1つの MutationObserver に統合
//   旧実装: Pages.individualDetail を2重にラップし、それぞれ await _orig.call を
//           待ってから setTimeout(200-350ms) で挿入。
//           Pages.individualDetail は内部で `await API.individual.get(indId)` を
//           呼ぶため、GAS 応答が20-30秒かかる環境では分析カードも前蛹予測も
//           20-30秒後にしか表示されなかった。
//   新実装: #main を MutationObserver で監視し、
//     - #acc-growth (成長記録アコーディオン) が出現したら分析カード挿入
//     - #analysis-body-XXX (分析カード本体) が出現したら前蛹予測を追記
//   initial render (Store 先行値) / API 応答後の再描画 / continuous-scan 保存後の
//   即時遷移、すべてのタイミングに自動追従する。
//   requestAnimationFrame で1フレームあたり最大1回にスロットル。二重挿入は
//   #acc-analysis / #prepupa-pred-XXX の存在チェックで防止。
(function(){
  if (typeof MutationObserver === 'undefined') return;

  function _tryInjectAnalysis() {
    // 個体詳細ページでなければ no-op
    try {
      if (Store && Store.getPage && Store.getPage() !== 'ind-detail') return;
    } catch(_) { return; }

    var realId = '';
    try {
      var params = (Store && Store.getParams) ? Store.getParams() : {};
      realId = params.indId || params.id || '';
    } catch(_) { return; }
    if (!realId) return;

    // (1) 成長分析カード: #acc-growth の直後に #acc-analysis を挿入
    var accGrowth = document.getElementById('acc-growth');
    if (accGrowth && !document.getElementById('acc-analysis')) {
      var records = [];
      try { records = (Store.getGrowthRecords && Store.getGrowthRecords(realId)) || []; } catch(_) {}
      try { _injectAnalysisCard(realId, records); }
      catch(e){ console.warn('[HerculesOS] analysis card inject error:', e.message); }
    }

    // (2) 前蛹予測: #analysis-body-XXX の末尾に #prepupa-pred-XXX を追記
    var analysisBody = document.getElementById('analysis-body-' + realId);
    if (analysisBody && !document.getElementById('prepupa-pred-' + realId)) {
      var ind = null;
      try { ind = Store.getIndividual ? Store.getIndividual(realId) : null; } catch(_) {}
      if (!ind) return;
      var stage = String(ind.current_stage || '').toUpperCase();
      var showPred = stage === 'PREPUPA' || stage === 'PUPA'
                  || stage === 'ADULT_PRE' || stage === 'ADULT'
                  || ind.prepupa_weight_g;
      if (!showPred) return;
      try {
        var predDiv = document.createElement('div');
        predDiv.id = 'prepupa-pred-' + realId;
        predDiv.innerHTML = _prepupaPredictionHTML(ind);
        analysisBody.appendChild(predDiv);
      } catch(e){ console.warn('[HerculesOS] prepupa pred inject error:', e.message); }
    }
  }

  var _rafScheduled = false;
  function _schedule() {
    if (_rafScheduled) return;
    _rafScheduled = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function(cb){ setTimeout(cb, 16); })(function(){
      _rafScheduled = false;
      try { _tryInjectAnalysis(); } catch(e){ console.warn('[HerculesOS] analysis observer error:', e.message); }
    });
  }

  function _startObserver(){
    var main = document.getElementById('main');
    if (!main) { setTimeout(_startObserver, 100); return; }
    var mo = new MutationObserver(_schedule);
    mo.observe(main, { childList: true, subtree: true });
    _schedule();
    console.log('[HerculesOS] analysis-card MutationObserver started');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startObserver);
  } else {
    _startObserver();
  }
})();

// ── 個体詳細に「環境記録」ボタンを追加 ────────────────────────
// [20260424a] MutationObserver 方式に切替 (queueMicrotask 方式を廃止)
//   旧方式は Pages.individualDetail をラップし、await _prevWithPrepupa.call(...) の
//   後で queueMicrotask を走らせていた。しかしこの await は内部で
//   `await API.individual.get(indId)` を含むため、GAS 応答が20-30秒かかる間
//   環境記録ボタンも挿入されなかった (initial render では既に row2 が DOM に
//   生成されているにも関わらず)。
//
//   新方式: #main を MutationObserver で常時監視し、[data-ind-btn-row2="1"] が
//   DOM に出現した瞬間 (= initial render / post-API re-render のどちらでも) に
//   環境記録ボタンを挿入する。requestAnimationFrame で 1フレームあたり最大1回に
//   スロットル、存在チェックで二重挿入も防止、個体詳細以外のページでは no-op。
(function(){
  if (typeof MutationObserver === 'undefined') {
    // 極めて古いブラウザのみフォールバック (setTimeout ループ)
    console.warn('[HerculesOS] MutationObserver unavailable; env-btn uses setTimeout fallback');
    (function _fallback(){
      try { _tryInsertEnvBtn(); } catch(_) {}
      setTimeout(_fallback, 500);
    })();
    return;
  }

  function _buildEnvBtn(realId) {
    var envBtn = document.createElement('button');
    envBtn.className = 'btn btn-ghost';
    envBtn.style.cssText = 'flex:1';
    envBtn.setAttribute('data-env-btn', '1');
    envBtn.innerHTML = '🌡️ 環境記録';
    envBtn.onclick = function(){ routeTo('env-record', {indId: realId}); };
    return envBtn;
  }

  function _tryInsertEnvBtn() {
    // 個体詳細ページでなければ挿入しない
    try {
      if (Store && Store.getPage && Store.getPage() !== 'ind-detail') return;
    } catch(_){ /* Store 未初期化時は挿入せず早期return */ return; }

    // 新レイアウト (20260422k 以降) の Row2 を取得
    var row2 = document.querySelector('[data-ind-btn-row2="1"]');
    // 旧レイアウトのフォールバック (data-ind-growth-btn / continuous-scan / growth-rec)
    if (!row2) {
      var qaArea = document.querySelector('[data-ind-growth-btn="1"]')
                || document.querySelector('[onclick*="continuous-scan"]')
                || document.querySelector('[onclick*="growth-rec"]');
      if (qaArea) row2 = qaArea.parentNode;
    }
    if (!row2) return;
    // 二重挿入防止
    if (row2.querySelector('[data-env-btn]')) return;

    // 対象個体IDを Store.getParams から取得
    var realId = '';
    try {
      var params = (Store && Store.getParams) ? Store.getParams() : {};
      realId = params.indId || params.id || '';
    } catch(_){ return; }
    if (!realId) return;

    var envBtn = _buildEnvBtn(realId);
    // 最初の button 要素の前に挿入 (テキストノードが firstChild の場合を回避)
    var firstBtn = row2.querySelector('button');
    if (firstBtn) {
      row2.insertBefore(envBtn, firstBtn);
    } else {
      row2.appendChild(envBtn);
    }
  }

  // requestAnimationFrame によるスロットル (同一フレーム内で複数回呼ばない)
  var _rafScheduled = false;
  function _schedule(){
    if (_rafScheduled) return;
    _rafScheduled = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function(cb){ setTimeout(cb, 16); })(function(){
      _rafScheduled = false;
      try { _tryInsertEnvBtn(); } catch(e){ console.warn('[HerculesOS] env-btn insert error:', e.message); }
    });
  }

  function _startObserver(){
    var main = document.getElementById('main');
    if (!main) {
      // #main がまだ無ければ少し待って再試行
      setTimeout(_startObserver, 100);
      return;
    }
    var mo = new MutationObserver(_schedule);
    mo.observe(main, { childList: true, subtree: true });
    // 初回即時試行 (既に ind-detail が描画済みのケース)
    _schedule();
    console.log('[HerculesOS] env-btn MutationObserver started');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startObserver);
  } else {
    _startObserver();
  }
})();
