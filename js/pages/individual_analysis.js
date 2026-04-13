// ════════════════════════════════════════════════════════════════
// individual_analysis_patch.js  build: 20260413bj
// 個体詳細画面への成長分析カード追加パッチ
// このファイルは individual.js の直後に読み込んでください
// ════════════════════════════════════════════════════════════════

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
(function() {
  var _origRenderDetail = null;

  // MutationObserver で acc-growth の挿入を監視し、その後に分析カードを挿入
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

  // Pages.individualDetail をラップして分析カードを挿入
  var _orig = Pages.individualDetail;
  Pages.individualDetail = async function(indId) {
    await _orig.call(this, indId);
    // 画面描画後に分析カードを挿入
    setTimeout(function() {
      var realId = (typeof indId === 'object')
        ? (indId.id || indId.indId || '')
        : indId;
      var records = Store.getGrowthRecords(realId) || [];
      _injectAnalysisCard(realId, records);
    }, 200);
  };
})();

// ════════════════════════════════════════════════════════════════
// ④ 前蛹体重 → 成虫サイズ予測（回帰式）
//    adult_mm = 0.815 * prepupa_g + 63.4
//    ヘラクレス経験則ベース（蓄積データで自動更新）
// ════════════════════════════════════════════════════════════════

var _PREPUPA_REGRESSION = {
  a: 0.815,   // 傾き
  b: 63.4,    // 切片
  r2: 0.998,  // 決定係数（初期値）
  sampleN: 5, // サンプル数
};

// 蓄積データから回帰係数を更新（Store内に実測データがあれば）
function _updateRegressionFromStore() {
  var inds = Store.getDB('individuals') || [];
  // 前蛹体重と成虫サイズ両方持つ個体を収集
  var pairs = inds.filter(function(i){
    return i.prepupa_weight_g && +i.prepupa_weight_g > 0
        && i.adult_size_mm    && +i.adult_size_mm    > 0;
  }).map(function(i){
    return { x: +i.prepupa_weight_g, y: +i.adult_size_mm };
  });

  if (pairs.length < 5) return; // サンプル不足

  var n   = pairs.length;
  var sx  = pairs.reduce(function(s,p){ return s + p.x; }, 0);
  var sy  = pairs.reduce(function(s,p){ return s + p.y; }, 0);
  var sxy = pairs.reduce(function(s,p){ return s + p.x * p.y; }, 0);
  var sx2 = pairs.reduce(function(s,p){ return s + p.x * p.x; }, 0);
  var denom = n * sx2 - sx * sx;
  if (denom === 0) return;
  var a = (n * sxy - sx * sy) / denom;
  var b = (sy - a * sx) / n;

  // 決定係数R²
  var yMean = sy / n;
  var ssTot = pairs.reduce(function(s,p){ return s + (p.y - yMean) * (p.y - yMean); }, 0);
  var ssRes = pairs.reduce(function(s,p){ return s + (p.y - (a*p.x+b)) * (p.y - (a*p.x+b)); }, 0);
  var r2    = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  _PREPUPA_REGRESSION = { a: a, b: b, r2: r2, sampleN: n };
}

// 予測実行
function _predictAdultSize(prepupaWeightG) {
  _updateRegressionFromStore();
  var r = _PREPUPA_REGRESSION;
  var pred = r.a * prepupaWeightG + r.b;
  // 95%予測区間の簡易推定（±8mm程度）
  return {
    predicted: Math.round(pred * 10) / 10,
    lower:     Math.round((pred - 8) * 10) / 10,
    upper:     Math.round((pred + 8) * 10) / 10,
    r2:        r.r2,
    sampleN:   r.sampleN,
  };
}

// 前蛹予測カードHTML（個体詳細の分析カードに追加）
function _prepupaPredictionHTML(ind) {
  var prepupaG = ind ? (+ind.prepupa_weight_g || null) : null;

  // 前蛹体重が入力済みの場合: 予測結果を表示
  if (prepupaG && prepupaG > 0) {
    var pred = _predictAdultSize(prepupaG);
    var confidence = pred.r2 >= 0.9
      ? '<span style="color:var(--green);font-size:.68rem">精度: 高（R²=' + pred.r2.toFixed(3) + '）</span>'
      : '<span style="color:var(--amber);font-size:.68rem">精度: 中（R²=' + pred.r2.toFixed(3) + '）</span>';
    var dataNote = pred.sampleN > 5
      ? '自データ' + pred.sampleN + '頭から計算'
      : '経験則ベース（自データ蓄積で精度向上）';

    // サイズ段階表示
    var sizeGrade = pred.predicted >= 170 ? { label:'ギネス候補', color:'var(--gold)', icon:'🏆' }
      : pred.predicted >= 155 ? { label:'大型個体', color:'var(--green)', icon:'💪' }
      : pred.predicted >= 140 ? { label:'標準〜大', color:'var(--text2)', icon:'📏' }
      : { label:'標準', color:'var(--text3)', icon:'📏' };

    return '<div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-top:8px">' +
      '<div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:10px">🦋 成虫サイズ予測（前蛹体重から）</div>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">' +
        '<div style="text-align:center">' +
          '<div style="font-size:.68rem;color:var(--text3)">前蛹体重</div>' +
          '<div style="font-size:1.1rem;font-weight:700;color:var(--amber)">' + prepupaG + 'g</div>' +
        '</div>' +
        '<div style="font-size:1.2rem;color:var(--text3)">→</div>' +
        '<div style="text-align:center">' +
          '<div style="font-size:.68rem;color:var(--text3)">予測成虫サイズ</div>' +
          '<div style="font-size:1.6rem;font-weight:700;color:' + sizeGrade.color + '">' + pred.predicted + 'mm</div>' +
          '<div style="font-size:.68rem;color:var(--text3)">範囲: ' + pred.lower + '〜' + pred.upper + 'mm</div>' +
        '</div>' +
        '<div style="text-align:center">' +
          '<div style="font-size:1.2rem">' + sizeGrade.icon + '</div>' +
          '<div style="font-size:.72rem;font-weight:700;color:' + sizeGrade.color + '">' + sizeGrade.label + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between">' +
        confidence +
        '<span style="font-size:.66rem;color:var(--text3)">' + dataNote + '</span>' +
      '</div>' +
    '</div>';
  }

  // 前蛹体重未入力の場合: 入力促し + 入力フォーム
  return '<div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-top:8px">' +
    '<div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:6px">🦋 成虫サイズ予測（前蛹体重から）</div>' +
    '<div style="font-size:.78rem;color:var(--text3);margin-bottom:10px">前蛹体重を入力すると成虫サイズを予測できます</div>' +
    // 試算フォーム
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

// 前蛹体重試算（モーダルなし・インライン表示）
Pages._indSimPrepupa = function(indId) {
  var inp = document.getElementById('prepupa-sim-input');
  var g   = inp ? parseFloat(inp.value) : NaN;
  var el  = document.getElementById('prepupa-sim-result');
  if (!el) return;
  if (!g || g < 30 || g > 250) {
    el.innerHTML = '<div style="font-size:.76rem;color:var(--amber)">30〜250gの範囲で入力してください</div>';
    return;
  }
  var pred = _predictAdultSize(g);
  var sizeGrade = pred.predicted >= 170 ? { label:'ギネス候補', color:'var(--gold)', icon:'🏆' }
    : pred.predicted >= 155 ? { label:'大型個体', color:'var(--green)', icon:'💪' }
    : { label:'標準', color:'var(--text3)', icon:'📏' };

  el.innerHTML =
    '<div style="background:var(--bg2);border-radius:8px;padding:10px;display:flex;align-items:center;gap:10px">' +
      '<div style="font-size:.7rem;color:var(--text3)">' + g + 'g →</div>' +
      '<div>' +
        '<span style="font-size:1.2rem;font-weight:700;color:' + sizeGrade.color + '">' + pred.predicted + 'mm</span>' +
        '<span style="font-size:.72rem;color:var(--text3);margin-left:6px">（' + pred.lower + '〜' + pred.upper + 'mm）</span>' +
      '</div>' +
      '<div style="font-size:1rem">' + sizeGrade.icon + '</div>' +
      '<div style="font-size:.72rem;font-weight:700;color:' + sizeGrade.color + '">' + sizeGrade.label + '</div>' +
    '</div>';
};

// ── 分析カードに前蛹予測を追加（_patchIndividualDetailForAnalysis のラップを拡張） ─
// individual_analysis.jsの既存パッチにフック
var _origInjectAnalysis = null;
(function(){
  // 既存の Pages.individualDetail ラップが完了した後にさらに前蛹予測を注入
  var _prevInjected = Pages.individualDetail;
  Pages.individualDetail = async function(indId) {
    await _prevInjected.call(this, indId);
    setTimeout(function(){
      var realId = (typeof indId === 'object') ? (indId.id || indId.indId || '') : indId;
      var ind    = Store.getIndividual(realId);
      if (!ind) return;
      // ステージがPREPUPA/PUPA/ADULT_PRE/ADULT の場合は前蛹予測を表示
      var stage = String(ind.current_stage || '').toUpperCase();
      var showPred = stage === 'PREPUPA' || stage === 'PUPA'
                  || stage === 'ADULT_PRE' || stage === 'ADULT'
                  || ind.prepupa_weight_g;
      if (!showPred) return;
      var analysisBody = document.getElementById('analysis-body-' + realId);
      if (!analysisBody) return;
      // 既存の分析カード内に前蛹予測を追記
      var predDiv = document.createElement('div');
      predDiv.id  = 'prepupa-pred-' + realId;
      predDiv.innerHTML = _prepupaPredictionHTML(ind);
      analysisBody.appendChild(predDiv);
    }, 350);
  };
})();

// ── 個体詳細に「環境記録」ボタンを追加 ────────────────────────
// Pages.individualDetail ラップにさらにフック（env_record.jsより後に読み込まれる想定）
(function(){
  var _prevWithPrepupa = Pages.individualDetail;
  Pages.individualDetail = async function(indId) {
    await _prevWithPrepupa.call(this, indId);
    setTimeout(function(){
      var realId = (typeof indId === 'object') ? (indId.id || indId.indId || '') : indId;
      // クイックアクションエリアに環境記録ボタンを追加（既存ボタン行の後）
      var qaArea = document.querySelector('[onclick*="growth-rec"]');
      if (!qaArea) return;
      var row = qaArea.parentNode;
      if (!row || row.querySelector('[data-env-btn]')) return; // 二重追加防止
      var envBtn = document.createElement('button');
      envBtn.className = 'btn btn-ghost';
      envBtn.style.cssText = 'flex:1;margin-top:6px';
      envBtn.setAttribute('data-env-btn', '1');
      envBtn.innerHTML = '🌡️ 環境記録';
      envBtn.onclick = function(){ routeTo('env-record', {indId: realId}); };
      // ボタン行の後ろに追加
      var wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex;gap:8px;margin-top:0';
      wrapper.appendChild(envBtn);
      row.parentNode.insertBefore(wrapper, row.nextSibling);
    }, 300);
  };
})();
