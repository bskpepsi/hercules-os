// ════════════════════════════════════════════════════════════════
// growth_charts.js  build: 20260413bj
// ① 全個体体重分布（ヒストグラム）
// ② ライン別最大/平均体重比較（横棒）
// ③ 成虫サイズのライン別分布（ドット＋平均線）
// ④ 還元率（成虫÷蛹×100%）ライン別
// ⑤ ライン別週齢×体重の成長曲線（複数ライン重ね）
//
// 使用: routeTo('growth-charts')
//       Pages.growthChartsForLine(lineId)  ← ライン詳細埋め込み用
// ════════════════════════════════════════════════════════════════
'use strict';

// ── カラーパレット（ライン別に自動割当） ─────────────────────────
var _GC_COLORS = [
  '#c8a84b','#4caf78','#5ba8e8','#e87fa0','#a0c878',
  '#e8a05b','#9b84e8','#5be8d4','#e85b5b','#84b8e8',
];
function _gcColor(i) { return _GC_COLORS[i % _GC_COLORS.length]; }

// ── データ収集ヘルパー ────────────────────────────────────────
function _gcCollect(lineIds) {
  var inds  = Store.getDB('individuals') || [];
  var lines = Store.getDB('lines')       || [];

  // lineIds が指定されていれば絞り込み
  if (lineIds && lineIds.length) {
    inds = inds.filter(function(i){ return lineIds.indexOf(i.line_id) >= 0; });
  }

  // ライン情報マップ
  var lineMap = {};
  lines.forEach(function(l){ lineMap[l.line_id] = l; });

  return { inds: inds, lineMap: lineMap };
}

// ── ① 全個体体重分布ヒストグラム ─────────────────────────────
function _gcDrawHistogram(canvasId, inds) {
  var el = document.getElementById(canvasId);
  if (!el || typeof Chart === 'undefined') return;
  if (el._ci) el._ci.destroy();

  var weights = inds
    .filter(function(i){ return i.latest_weight_g && +i.latest_weight_g > 0; })
    .map(function(i){ return +i.latest_weight_g; });

  if (!weights.length) { el.parentNode.innerHTML = '<div style="font-size:.78rem;color:var(--text3);padding:12px;text-align:center">体重データなし</div>'; return; }

  // 10gごとのバケツ
  var min   = Math.floor(Math.min.apply(null, weights) / 10) * 10;
  var max   = Math.ceil(Math.max.apply(null, weights)  / 10) * 10;
  var buckets = [], labels = [];
  for (var v = min; v < max; v += 10) {
    labels.push(v + '〜' + (v+10) + 'g');
    var cnt = weights.filter(function(w){ return w >= v && w < v+10; }).length;
    buckets.push(cnt);
  }

  el._ci = new Chart(el, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '個体数',
        data: buckets,
        backgroundColor: 'rgba(200,168,75,0.7)',
        borderColor:     'rgba(200,168,75,1)',
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color:'#6a7c6a', font:{size:8}, maxRotation:45 }, grid:{color:'rgba(255,255,255,0.05)'} },
        y: { ticks: { color:'#6a7c6a', font:{size:9} }, grid:{color:'rgba(255,255,255,0.05)'}, title:{display:true,text:'頭数',color:'#6a7c6a',font:{size:9}} },
      },
    },
  });
}

// ── ② ライン別最大/平均体重比較（横棒） ─────────────────────
function _gcDrawLineWeightBar(canvasId, inds, lineMap) {
  var el = document.getElementById(canvasId);
  if (!el || typeof Chart === 'undefined') return;
  if (el._ci) el._ci.destroy();

  // ライン別集計
  var lineStats = {};
  inds.forEach(function(i){
    if (!i.line_id || !i.latest_weight_g || +i.latest_weight_g <= 0) return;
    if (!lineStats[i.line_id]) lineStats[i.line_id] = { weights: [], lineId: i.line_id };
    lineStats[i.line_id].weights.push(+i.latest_weight_g);
  });

  var entries = Object.values(lineStats)
    .map(function(s){
      var sum = s.weights.reduce(function(a,b){ return a+b; }, 0);
      var l   = lineMap[s.lineId];
      return {
        label:  l ? (l.line_code || l.display_id) : s.lineId,
        avg:    Math.round(sum / s.weights.length * 10) / 10,
        max:    Math.max.apply(null, s.weights),
        n:      s.weights.length,
      };
    })
    .filter(function(e){ return e.n >= 1; })
    .sort(function(a,b){ return b.max - a.max; })
    .slice(0, 12);

  if (!entries.length) { el.parentNode.innerHTML = '<div style="font-size:.78rem;color:var(--text3);padding:12px;text-align:center">ラインデータなし</div>'; return; }

  el._ci = new Chart(el, {
    type: 'bar',
    data: {
      labels: entries.map(function(e){ return e.label + '(' + e.n + ')'; }),
      datasets: [
        { label:'最大体重(g)', data: entries.map(function(e){ return e.max; }), backgroundColor:'rgba(200,168,75,0.8)', borderRadius:3 },
        { label:'平均体重(g)', data: entries.map(function(e){ return e.avg; }), backgroundColor:'rgba(76,175,120,0.7)',  borderRadius:3 },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { labels:{color:'#8fa88f',font:{size:9}} } },
      scales: {
        x: { ticks:{color:'#6a7c6a',font:{size:9}}, grid:{color:'rgba(255,255,255,0.05)'}, title:{display:true,text:'g',color:'#6a7c6a',font:{size:9}} },
        y: { ticks:{color:'#8fa88f',font:{size:9}}, grid:{color:'rgba(255,255,255,0.05)'} },
      },
    },
  });
}

// ── ③ 成虫サイズのライン別分布（散布図） ────────────────────
function _gcDrawAdultSizeScatter(canvasId, inds, lineMap) {
  var el = document.getElementById(canvasId);
  if (!el || typeof Chart === 'undefined') return;
  if (el._ci) el._ci.destroy();

  // ライン別に散布図データ
  var lineGroups = {};
  inds.forEach(function(i){
    if (!i.line_id || !i.adult_size_mm || +i.adult_size_mm <= 0) return;
    if (!lineGroups[i.line_id]) lineGroups[i.line_id] = { lineId: i.line_id, sizes: [] };
    lineGroups[i.line_id].sizes.push(+i.adult_size_mm);
  });

  var entries = Object.values(lineGroups)
    .filter(function(g){ return g.sizes.length >= 1; })
    .sort(function(a,b){ return Math.max.apply(null,b.sizes) - Math.max.apply(null,a.sizes); })
    .slice(0, 10);

  if (!entries.length) { el.parentNode.innerHTML = '<div style="font-size:.78rem;color:var(--text3);padding:12px;text-align:center">成虫サイズデータなし</div>'; return; }

  // x軸: ラインインデックス、y軸: サイズ
  var datasets = entries.map(function(g, i){
    var l = lineMap[g.lineId];
    var label = l ? (l.line_code || l.display_id) : g.lineId;
    var points = g.sizes.map(function(s){ return { x: i, y: s }; });
    // 平均点
    var avg = g.sizes.reduce(function(a,b){return a+b;},0) / g.sizes.length;
    return {
      label: label,
      data: points,
      backgroundColor: _gcColor(i) + 'cc',
      pointRadius: 6,
      pointHoverRadius: 8,
      _avg: avg,
      _label: label,
    };
  });

  // 平均ライン（annotations不使用 → 別データセットで描画）
  var avgDataset = {
    label: '平均',
    data: entries.map(function(g, i){
      var avg = g.sizes.reduce(function(a,b){return a+b;},0)/g.sizes.length;
      return { x: i, y: Math.round(avg*10)/10 };
    }),
    type: 'line',
    borderColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderDash: [4,3],
    pointRadius: 4,
    pointBackgroundColor: 'rgba(255,255,255,0.8)',
    fill: false,
    tension: 0,
  };

  el._ci = new Chart(el, {
    type: 'scatter',
    data: { datasets: datasets.concat([avgDataset]) },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx){ return ctx.dataset.label + ': ' + ctx.parsed.y + 'mm'; },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color:'#8fa88f', font:{size:9},
            callback: function(val){
              return entries[val] ? (lineMap[entries[val].lineId] ? (lineMap[entries[val].lineId].line_code || entries[val].lineId) : entries[val].lineId) : '';
            },
          },
          grid:{color:'rgba(255,255,255,0.05)'},
          min: -0.5, max: entries.length - 0.5,
        },
        y: { ticks:{color:'#6a7c6a',font:{size:9}}, grid:{color:'rgba(255,255,255,0.05)'}, title:{display:true,text:'mm',color:'#6a7c6a',font:{size:9}} },
      },
    },
  });
}

// ── ④ 還元率（成虫÷蛹×100%）ライン別 ────────────────────────
function _gcDrawReductionRate(canvasId, inds, lineMap) {
  var el = document.getElementById(canvasId);
  if (!el || typeof Chart === 'undefined') return;
  if (el._ci) el._ci.destroy();

  // 蛹サイズと成虫サイズ両方ある個体のみ
  var validInds = inds.filter(function(i){
    return i.pupa_length_mm && +i.pupa_length_mm > 0
        && i.adult_size_mm  && +i.adult_size_mm  > 0;
  });

  if (!validInds.length) {
    el.parentNode.innerHTML =
      '<div style="background:var(--surface2);border-radius:8px;padding:12px;font-size:.78rem;color:var(--text3);text-align:center">' +
      '🦋 還元率を計算するには蛹サイズ（pupa_length_mm）と成虫サイズ（adult_size_mm）の両方が必要です。<br>' +
      '<span style="font-size:.72rem;margin-top:4px;display:block">個体編集画面の「形態・成長データ」から入力できます。</span>' +
      '</div>';
    return;
  }

  // 個体ごとに還元率を計算
  var lineRates = {};
  validInds.forEach(function(i){
    var rate = Math.round(+i.adult_size_mm / +i.pupa_length_mm * 1000) / 10; // 小数1桁
    if (!lineRates[i.line_id]) lineRates[i.line_id] = { lineId:i.line_id, rates:[] };
    lineRates[i.line_id].rates.push({ rate:rate, indId:i.ind_id, displayId:i.display_id });
  });

  var entries = Object.values(lineRates)
    .map(function(g){
      var l   = lineMap[g.lineId];
      var rs  = g.rates.map(function(r){ return r.rate; });
      var avg = Math.round(rs.reduce(function(a,b){return a+b;},0)/rs.length*10)/10;
      var max = Math.max.apply(null, rs);
      return { label: l?(l.line_code||l.display_id):g.lineId, avg:avg, max:max, rates:rs, n:rs.length };
    })
    .sort(function(a,b){ return b.avg - a.avg })
    .slice(0, 10);

  // 全サンプルのサマリー
  var allRates = validInds.map(function(i){ return +i.adult_size_mm / +i.pupa_length_mm * 100; });
  var globalAvg = Math.round(allRates.reduce(function(a,b){return a+b;},0)/allRates.length*10)/10;

  el._ci = new Chart(el, {
    type: 'bar',
    data: {
      labels: entries.map(function(e){ return e.label + '(' + e.n + ')'; }),
      datasets: [
        { label:'平均還元率(%)', data:entries.map(function(e){return e.avg;}), backgroundColor:'rgba(91,168,232,0.7)', borderRadius:3 },
        { label:'最高還元率(%)', data:entries.map(function(e){return e.max;}), backgroundColor:'rgba(200,168,75,0.6)', borderRadius:3 },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { labels:{color:'#8fa88f',font:{size:9}} },
        tooltip: { callbacks: { label: function(ctx){ return ctx.dataset.label + ': ' + ctx.parsed.x + '%'; } } },
      },
      scales: {
        x: { ticks:{color:'#6a7c6a',font:{size:9}}, grid:{color:'rgba(255,255,255,0.05)'}, title:{display:true,text:'%',color:'#6a7c6a',font:{size:9}},
             min: Math.max(0, Math.floor(Math.min.apply(null, entries.map(function(e){return e.avg;}))-5)) },
        y: { ticks:{color:'#8fa88f',font:{size:9}}, grid:{color:'rgba(255,255,255,0.05)'} },
      },
    },
  });

  // グラフの下にサマリーを追加
  var summary = document.createElement('div');
  summary.style.cssText = 'font-size:.72rem;color:var(--text3);margin-top:6px;text-align:right';
  summary.textContent = '全体平均還元率: ' + globalAvg + '% (n=' + validInds.length + ')';
  el.parentNode.appendChild(summary);
}

// ── ⑤ ライン別週齢×体重 成長曲線 ────────────────────────────
function _gcDrawGrowthCurves(canvasId, inds, lineMap, targetLineIds) {
  var el = document.getElementById(canvasId);
  if (!el || typeof Chart === 'undefined') return;
  if (el._ci) el._ci.destroy();

  // 対象ライン（指定なければ上位5ライン）
  var lineSet = {};
  inds.forEach(function(i){ if (i.line_id) lineSet[i.line_id] = true; });
  var allLineIds = Object.keys(lineSet);
  var useLineIds = (targetLineIds && targetLineIds.length)
    ? targetLineIds
    : allLineIds.slice(0, 5);

  // 各個体の成長記録を取得してラインごとに集計
  // x軸: 孵化日からの日数 → 週齢
  var datasets = [];
  useLineIds.forEach(function(lid, i){
    var lineInds = inds.filter(function(ind){ return ind.line_id === lid && ind.hatch_date; });
    if (!lineInds.length) return;

    // 全成長記録を週齢ごとにバケット化（10日ごと）
    var bucketMap = {}; // bucket_week -> [weights]
    lineInds.forEach(function(ind){
      var hatch = new Date(String(ind.hatch_date).replace(/\//g,'-'));
      var recs  = Store.getGrowthRecords(ind.ind_id) || [];
      recs.forEach(function(r){
        if (!r.weight_g || +r.weight_g <= 0 || !r.record_date) return;
        var rdate = new Date(String(r.record_date).replace(/\//g,'-'));
        var days  = Math.round((rdate - hatch) / 86400000);
        if (days < 0 || days > 900) return;
        var bucket = Math.round(days / 7); // 週齢
        if (!bucketMap[bucket]) bucketMap[bucket] = [];
        bucketMap[bucket].push(+r.weight_g);
      });
    });

    var points = Object.keys(bucketMap)
      .map(function(w){ return +w; })
      .sort(function(a,b){ return a-b; })
      .map(function(w){
        var ws = bucketMap[w];
        var avg = ws.reduce(function(a,b){return a+b;},0) / ws.length;
        return { x: w, y: Math.round(avg*10)/10 };
      });

    if (points.length < 2) return;

    var l = lineMap[lid];
    datasets.push({
      label: l ? (l.line_code || l.display_id) : lid,
      data:  points,
      borderColor:     _gcColor(i),
      backgroundColor: _gcColor(i) + '22',
      pointRadius: 3,
      tension: 0.3,
      fill: false,
    });
  });

  if (!datasets.length) {
    el.parentNode.innerHTML = '<div style="font-size:.78rem;color:var(--text3);padding:12px;text-align:center">成長記録データが不足しています（孵化日設定が必要）</div>';
    return;
  }

  el._ci = new Chart(el, {
    type: 'line',
    data: { datasets: datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { labels:{ color:'#8fa88f', font:{size:9}, boxWidth:12 } },
      },
      scales: {
        x: {
          type: 'linear',
          ticks:{ color:'#6a7c6a', font:{size:9}, callback:function(v){ return v+'週'; } },
          grid:{ color:'rgba(255,255,255,0.05)' },
          title:{ display:true, text:'週齢', color:'#6a7c6a', font:{size:9} },
        },
        y: {
          ticks:{ color:'#6a7c6a', font:{size:9} },
          grid:{ color:'rgba(255,255,255,0.05)' },
          title:{ display:true, text:'体重(g)', color:'#6a7c6a', font:{size:9} },
        },
      },
    },
  });
}

// ── チャートカードHTML生成ヘルパー ───────────────────────────
function _gcCard(title, canvasId, note) {
  return '<div class="card" style="padding:12px 14px;margin-bottom:12px">'
    + '<div style="font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:8px">' + title + '</div>'
    + (note ? '<div style="font-size:.7rem;color:var(--text3);margin-bottom:8px">' + note + '</div>' : '')
    + '<canvas id="' + canvasId + '" style="max-height:220px"></canvas>'
    + '</div>';
}

// ── Pages.growthCharts: 分析メニューから遷移するフルページ ────
Pages.growthCharts = function(params) {
  params = params || {};
  var main = document.getElementById('main');
  var lineIds = params.lineIds || null; // null = 全ライン

  main.innerHTML =
    UI.header('📊 成長分布・分析グラフ', {back:true}) +
    '<div class="page-body">' +

    // ライン絞り込みピル
    _gcLinePills(lineIds) +

    _gcCard('① 全個体 体重分布（ヒストグラム）',   'gc-hist',    '10gごとの分布') +
    _gcCard('② ライン別 最大/平均体重',             'gc-lineW',   '上位12ライン') +
    _gcCard('③ 成虫サイズ ライン別分布',            'gc-adultS',  '各点=1個体、横線=平均') +
    _gcCard('④ 還元率（成虫÷蛹×100%）',            'gc-redux',   '蛹・成虫サイズ両方入力済みの個体のみ') +
    _gcCard('⑤ ライン別 週齢×体重 成長曲線',       'gc-growth',  '週齢ごとの平均体重（上位5ライン）') +

    '</div>';

  // 描画
  setTimeout(function(){
    var d = _gcCollect(lineIds);
    _gcDrawHistogram   ('gc-hist',   d.inds, d.lineMap);
    _gcDrawLineWeightBar('gc-lineW', d.inds, d.lineMap);
    _gcDrawAdultSizeScatter('gc-adultS', d.inds, d.lineMap);
    _gcDrawReductionRate('gc-redux',  d.inds, d.lineMap);
    _gcDrawGrowthCurves ('gc-growth', d.inds, d.lineMap, lineIds);
  }, 80);
};

// ── ライン絞り込みピル ────────────────────────────────────────
function _gcLinePills(activeIds) {
  var lines = (Store.getDB('lines') || []).filter(function(l){ return l.status !== 'closed'; });
  if (lines.length < 2) return '';
  var pills = lines.map(function(l){
    var active = activeIds && activeIds.indexOf(l.line_id) >= 0;
    return '<button class="pill ' + (active?'active':'') + '" '
      + 'style="font-size:.72rem" '
      + 'data-lid="' + l.line_id + '" '
      + 'onclick="Pages._gcToggleLine(this)">'
      + (l.line_code || l.display_id)
      + '</button>';
  }).join('');
  return '<div style="margin-bottom:10px">'
    + '<div style="font-size:.72rem;color:var(--text3);margin-bottom:4px">ライン絞り込み（タップで切替、未選択=全ライン）</div>'
    + '<div class="filter-bar" id="gc-line-pills" style="flex-wrap:wrap">'
    +   '<button class="pill ' + (!activeIds?'active':'') + '" onclick="Pages.growthCharts({})" style="font-size:.72rem">全ライン</button>'
    +   pills
    + '</div>'
    + '</div>';
}

Pages._gcToggleLine = function(btn) {
  var lid = btn.getAttribute('data-lid');
  var activePills = Array.from(document.querySelectorAll('#gc-line-pills .pill.active'))
    .map(function(p){ return p.getAttribute('data-lid'); })
    .filter(Boolean);
  var idx = activePills.indexOf(lid);
  if (idx >= 0) activePills.splice(idx,1);
  else activePills.push(lid);
  Pages.growthCharts({ lineIds: activePills.length ? activePills : null });
};

// ── Pages.growthChartsForLine: ライン詳細埋め込み用 ───────────
// lineId を渡すと①〜⑤のうちそのラインに関係するグラフを埋め込む
Pages.growthChartsForLine = function(lineId, containerId) {
  var container = containerId
    ? document.getElementById(containerId)
    : null;
  if (!container) return;

  var uid = lineId.replace(/[^a-zA-Z0-9]/g, '');
  container.innerHTML =
    '<div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:10px">📊 このラインの成長グラフ</div>' +
    _gcCard('体重分布（このライン）',        'gcl-hist-'  +uid, '') +
    _gcCard('週齢×体重 成長曲線',           'gcl-growth-'+uid, '同ラインの各個体を週齢で集計') +
    _gcCard('還元率（蛹→成虫）',            'gcl-redux-' +uid, '蛹・成虫サイズ入力済み個体のみ') +
    '<button class="btn btn-ghost btn-full" style="margin-top:4px;font-size:.82rem" '
    + 'onclick="routeTo(\'growth-charts\',{lineIds:[\'' + lineId + '\']})">'
    + '📊 全ライン比較で見る →'
    + '</button>';

  setTimeout(function(){
    var d = _gcCollect([lineId]);
    _gcDrawHistogram   ('gcl-hist-'  +uid, d.inds, d.lineMap);
    _gcDrawGrowthCurves('gcl-growth-'+uid, d.inds, d.lineMap, [lineId]);
    _gcDrawReductionRate('gcl-redux-'+uid, d.inds, d.lineMap);
  }, 80);
};

// ── ページルート登録 ─────────────────────────────────────────
window.PAGES = window.PAGES || {};
window.PAGES['growth-charts'] = function() {
  Pages.growthCharts(Store.getParams());
};
