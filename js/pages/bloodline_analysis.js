// ════════════════════════════════════════════════════════════════
// bloodline_analysis.js  build: 20260413bj
// ② 血統×成長の相関分析
//    - ローカルStore.getDB()で計算（GAS不要）
//    - 父系タグ別・母系タグ別の平均/最大体重・成虫サイズ
//    - ヒートマップ（父系×母系の組み合わせ）
//    - 管理タブから遷移
// ════════════════════════════════════════════════════════════════
'use strict';

// ── メインページ ────────────────────────────────────────────────
Pages.bloodlineAnalysis = function() {
  var main = document.getElementById('main');
  main.innerHTML =
    UI.header('🧬 血統×成長 相関分析', {back: true}) +
    '<div class="page-body">' +
    '<div id="ba-content">' + UI.spinner() + '</div>' +
    '</div>';

  // 少し遅延させてスピナーを表示してから計算
  setTimeout(function(){
    var result = _baCalcAll();
    var el = document.getElementById('ba-content');
    if (!el) return;
    if (!result.hasData) {
      el.innerHTML = UI.empty('分析データが不足しています', '個体に血統タグを設定し、体重記録を追加してください');
      return;
    }
    el.innerHTML = _baRenderAll(result);
    setTimeout(function(){ _baDrawHeatmap(result); }, 150);
  }, 50);
};

// ── データ計算 ────────────────────────────────────────────────
function _baCalcAll() {
  var inds    = Store.getDB('individuals') || [];
  var parents = Store.getDB('parents')    || [];

  // 体重または成虫サイズを持つ個体のみ対象
  var validInds = inds.filter(function(i){
    return (i.latest_weight_g && +i.latest_weight_g > 0)
        || (i.adult_size_mm   && +i.adult_size_mm   > 0);
  });

  if (validInds.length < 3) return { hasData: false };

  // 父系タグ・母系タグ解析
  // parents テーブルから pat/mat_tags を取得
  function _getTags(parId, type) {
    if (!parId) return [];
    var par = parents.find(function(p){ return p.par_id === parId; });
    if (!par) return [];
    var tagField = type === 'pat' ? (par.paternal_tags || par.bloodline_tags || '[]')
                                  : (par.maternal_tags  || par.bloodline_tags || '[]');
    try {
      var t = JSON.parse(tagField);
      return Array.isArray(t) ? t : [];
    } catch(e) { return []; }
  }

  // 個体ごとに父系タグ・母系タグを付与
  var enriched = validInds.map(function(i){
    return {
      ind:      i,
      weight:   +i.latest_weight_g || 0,
      adultMm:  +i.adult_size_mm   || 0,
      prepupaG: +i.prepupa_weight_g || 0,
      patTags:  _getTags(i.father_par_id, 'pat'),
      matTags:  _getTags(i.mother_par_id, 'mat'),
    };
  });

  // ── 父系タグ別集計 ────────────────────────────────────────
  var patMap = {};
  enriched.forEach(function(e){
    var tags = e.patTags.length ? e.patTags : ['(タグなし)'];
    tags.forEach(function(tag){
      if (!patMap[tag]) patMap[tag] = { tag:tag, weights:[], sizes:[] };
      if (e.weight  > 0) patMap[tag].weights.push(e.weight);
      if (e.adultMm > 0) patMap[tag].sizes.push(e.adultMm);
    });
  });

  // ── 母系タグ別集計 ────────────────────────────────────────
  var matMap = {};
  enriched.forEach(function(e){
    var tags = e.matTags.length ? e.matTags : ['(タグなし)'];
    tags.forEach(function(tag){
      if (!matMap[tag]) matMap[tag] = { tag:tag, weights:[], sizes:[] };
      if (e.weight  > 0) matMap[tag].weights.push(e.weight);
      if (e.adultMm > 0) matMap[tag].sizes.push(e.adultMm);
    });
  });

  function _stats(arr) {
    if (!arr.length) return { avg:null, max:null, n:0 };
    var sum = arr.reduce(function(s,v){ return s+v; }, 0);
    return {
      avg: Math.round(sum / arr.length * 10) / 10,
      max: Math.max.apply(null, arr),
      n:   arr.length,
    };
  }

  var patStats = Object.values(patMap).map(function(v){
    return Object.assign(v, { wStat: _stats(v.weights), sStat: _stats(v.sizes) });
  }).sort(function(a,b){ return (b.wStat.avg||0) - (a.wStat.avg||0); });

  var matStats = Object.values(matMap).map(function(v){
    return Object.assign(v, { wStat: _stats(v.weights), sStat: _stats(v.sizes) });
  }).sort(function(a,b){ return (b.wStat.avg||0) - (a.wStat.avg||0); });

  // ── 父系×母系 ヒートマップ ────────────────────────────────
  var heatmap = {};
  enriched.forEach(function(e){
    var ptags = e.patTags.length ? e.patTags : ['—'];
    var mtags = e.matTags.length ? e.matTags : ['—'];
    ptags.forEach(function(pt){
      mtags.forEach(function(mt){
        var key = pt + '×' + mt;
        if (!heatmap[key]) heatmap[key] = { pt:pt, mt:mt, weights:[], sizes:[] };
        if (e.weight  > 0) heatmap[key].weights.push(e.weight);
        if (e.adultMm > 0) heatmap[key].sizes.push(e.adultMm);
      });
    });
  });

  var heatCells = Object.values(heatmap)
    .filter(function(c){ return c.weights.length + c.sizes.length > 0; })
    .map(function(c){
      return Object.assign(c, { wStat: _stats(c.weights), sStat: _stats(c.sizes) });
    })
    .sort(function(a,b){ return (b.wStat.avg||0) - (a.wStat.avg||0); });

  // ── 全体サマリー ─────────────────────────────────────────
  var allWeights = enriched.filter(function(e){ return e.weight > 0; }).map(function(e){ return e.weight; });
  var allSizes   = enriched.filter(function(e){ return e.adultMm > 0; }).map(function(e){ return e.adultMm; });
  var wAll = _stats(allWeights);
  var sAll = _stats(allSizes);
  var maxW = allWeights.length ? Math.max.apply(null, allWeights) : null;
  var maxS = allSizes.length   ? Math.max.apply(null, allSizes)   : null;

  return {
    hasData:   true,
    total:     validInds.length,
    wAll:      wAll, sAll: sAll, maxW: maxW, maxS: maxS,
    patStats:  patStats,
    matStats:  matStats,
    heatCells: heatCells,
  };
}

// ── HTML描画 ───────────────────────────────────────────────────
function _baRenderAll(r) {
  var kpi = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">'
    + _baKpi('対象個体', r.total + '頭', 'var(--text2)')
    + (r.maxW ? _baKpi('最大体重', r.maxW + 'g', 'var(--green)') : '')
    + (r.wAll.avg ? _baKpi('平均体重', r.wAll.avg + 'g', 'var(--text2)') : '')
    + (r.maxS ? _baKpi('最大成虫', r.maxS + 'mm', 'var(--gold)') : '')
    + '</div>';

  return kpi
    + _baTagRanking('🔵 父系タグ別ランキング', r.patStats)
    + _baTagRanking('🔴 母系タグ別ランキング', r.matStats)
    + _baHeatmapSection(r.heatCells);
}

function _baKpi(label, val, color) {
  return '<div style="flex:1;min-width:70px;background:var(--surface2);border-radius:10px;padding:10px 8px;text-align:center">'
    + '<div style="font-size:.65rem;color:var(--text3);margin-bottom:4px">' + label + '</div>'
    + '<div style="font-size:1rem;font-weight:700;color:' + color + '">' + val + '</div>'
    + '</div>';
}

function _baTagRanking(title, stats) {
  if (!stats.length) return '';
  return '<div class="card" style="padding:12px 14px;margin-bottom:12px">'
    + '<div style="font-size:.82rem;font-weight:700;color:var(--text2);margin-bottom:10px">' + title + '</div>'
    + stats.slice(0, 8).map(function(s, i){
        var pct = s.wStat.avg && stats[0].wStat.avg
          ? Math.round(s.wStat.avg / stats[0].wStat.avg * 100) : 0;
        var barColor = i === 0 ? 'var(--gold)' : i < 3 ? 'var(--green)' : 'var(--text3)';
        return '<div style="margin-bottom:8px">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">'
          +   '<div style="font-size:.78rem;font-weight:700;color:var(--text2)">'
          +     '<span style="color:var(--gold);margin-right:6px">#' + (i+1) + '</span>'
          +     s.tag
          +   '</div>'
          +   '<div style="font-size:.75rem;color:var(--text2)">'
          +     (s.wStat.avg ? s.wStat.avg + 'g' : '—')
          +     (s.sStat.avg ? ' / ' + s.sStat.avg + 'mm' : '')
          +     ' <span style="color:var(--text3);font-size:.68rem">(' + (s.wStat.n || s.sStat.n) + '頭)</span>'
          +   '</div>'
          + '</div>'
          + '<div style="background:var(--border);border-radius:4px;height:6px">'
          +   '<div style="background:' + barColor + ';height:6px;border-radius:4px;width:' + pct + '%"></div>'
          + '</div>'
          + '</div>';
      }).join('')
    + (stats.length > 8 ? '<div style="font-size:.72rem;color:var(--text3);margin-top:4px">他 ' + (stats.length - 8) + ' タグ</div>' : '')
    + '</div>';
}

function _baHeatmapSection(cells) {
  if (!cells.length) return '';

  // ヒートカラー
  var maxAvg = cells.reduce(function(m, c){ return Math.max(m, c.wStat.avg || 0); }, 0);

  return '<div class="card" style="padding:12px 14px;margin-bottom:12px">'
    + '<div style="font-size:.82rem;font-weight:700;color:var(--text2);margin-bottom:6px">🔥 父系×母系 ヒートマップ</div>'
    + '<div style="font-size:.72rem;color:var(--text3);margin-bottom:10px">組み合わせ別の平均体重（上位10件）</div>'
    + '<canvas id="ba-heatmap" style="max-height:240px;margin-bottom:12px"></canvas>'
    + cells.slice(0, 10).map(function(c, i){
        var intensity = maxAvg > 0 ? (c.wStat.avg || 0) / maxAvg : 0;
        var r = Math.round(60  + intensity * 140);
        var g = Math.round(100 + intensity * 75);
        var b = Math.round(50);
        var bg  = 'rgba(' + r + ',' + g + ',' + b + ',0.15)';
        var bdr = 'rgba(' + r + ',' + g + ',' + b + ',0.4)';
        return '<div style="background:' + bg + ';border:1px solid ' + bdr + ';border-radius:8px;padding:10px 12px;margin-bottom:6px">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
          +   '<div style="font-size:.75rem;font-weight:700;color:var(--text2)">'
          +     '<span style="color:#5ba8e8">' + c.pt + '</span>'
          +     ' × '
          +     '<span style="color:#e87fa0">' + c.mt + '</span>'
          +   '</div>'
          +   '<span style="font-size:.68rem;color:var(--text3)">' + (c.wStat.n || c.sStat.n) + '頭</span>'
          + '</div>'
          + '<div style="display:flex;gap:10px;font-size:.8rem">'
          +   (c.wStat.avg ? '<span>avg <b>' + c.wStat.avg + 'g</b></span>' : '')
          +   (c.wStat.max ? '<span>max <b>' + c.wStat.max + 'g</b></span>' : '')
          +   (c.sStat.avg ? '<span>avg <b>' + c.sStat.avg + 'mm</b></span>' : '')
          + '</div>'
          + '</div>';
      }).join('')
    + '</div>';
}

// ── バーチャート描画（上位10件） ──────────────────────────────
function _baDrawHeatmap(r) {
  var el = document.getElementById('ba-heatmap');
  if (!el || typeof Chart === 'undefined') return;
  if (el._chartInst) el._chartInst.destroy();

  var top10 = r.heatCells.slice(0, 10);
  if (!top10.length) return;

  var labels = top10.map(function(c){ return c.pt + '×' + c.mt; });
  var avgs   = top10.map(function(c){ return c.wStat.avg || 0; });
  var maxes  = top10.map(function(c){ return c.wStat.max || 0; });

  el._chartInst = new Chart(el, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '平均体重(g)',
          data: avgs,
          backgroundColor: 'rgba(200,168,75,0.7)',
          borderColor: 'rgba(200,168,75,1)',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: '最大体重(g)',
          data: maxes,
          backgroundColor: 'rgba(76,175,120,0.5)',
          borderColor: 'rgba(76,175,120,1)',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: {
        legend: { labels: { color:'#8fa88f', font:{size:9} } },
      },
      scales: {
        x: { ticks:{ color:'#6a7c6a', font:{size:9} }, grid:{color:'rgba(255,255,255,0.05)'} },
        y: { ticks:{ color:'#8fa88f', font:{size:9} }, grid:{color:'rgba(255,255,255,0.05)'} },
      },
    },
  });
}

// ── ページルート登録 ─────────────────────────────────────────
window.PAGES = window.PAGES || {};
window.PAGES['bloodline-analysis'] = function() {
  Pages.bloodlineAnalysis();
};


// ════════════════════════════════════════════════════════════════
// Pages.analysisMenu — 分析機能メニュー画面
// 管理タブから routeTo('analysis-menu') で到達
// ════════════════════════════════════════════════════════════════
Pages.analysisMenu = function() {
  var main = document.getElementById('main');

  function _menuCard(icon, title, desc, route) {
    return '<div class="card" style="padding:14px 16px;margin-bottom:10px;cursor:pointer" '
      + 'onclick="routeTo(\'' + route + '\')">'
      + '<div style="display:flex;align-items:center;gap:12px">'
      +   '<div style="font-size:1.6rem;width:40px;text-align:center">' + icon + '</div>'
      +   '<div style="flex:1">'
      +     '<div style="font-size:.9rem;font-weight:700;color:var(--text1)">' + title + '</div>'
      +     '<div style="font-size:.74rem;color:var(--text3);margin-top:2px">' + desc + '</div>'
      +   '</div>'
      +   '<span style="color:var(--text3);font-size:1.2rem">›</span>'
      + '</div>'
      + '</div>';
  }

  main.innerHTML =
    UI.header('📊 分析メニュー', {back: true}) +
    '<div class="page-body">' +

    '<div style="font-size:.78rem;color:var(--text3);padding:0 2px;margin-bottom:12px">飼育データを分析して次のブリードに活かしましょう</div>' +

    '<div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:8px;padding:0 2px">📊 成長グラフ</div>' +
    _menuCard('📊', '成長分布・分析グラフ', '体重分布・ライン比較・成虫サイズ・還元率・成長曲線（全5グラフ）', 'growth-charts') +

    '<div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:8px;margin-top:16px;padding:0 2px">🧬 血統分析</div>' +
    _menuCard('🧬', '血統×成長 相関分析', '父系・母系タグ別の平均体重ランキング＆組み合わせヒートマップ', 'bloodline-analysis') +
    _menuCard('📈', 'ライン分析', 'ライン別の成長・生存率ランキング', 'line-analysis') +
    _menuCard('♀', '母系ランキング', '母親別の平均体重・成虫サイズランキング', 'mother-ranking') +
    _menuCard('🔥', '血統ヒートマップ（GAS版）', '父系×母系タグの体重ヒートマップ（GASデータ使用）', 'heatmap') +

    '<div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:8px;margin-top:16px;padding:0 2px">👑 種親管理</div>' +
    _menuCard('📅', '種親ダッシュボード', 'ペアリング可能状況・♂回数ランキング', 'parent-dashboard') +

    '</div>';
};

window.PAGES['analysis-menu'] = function() { Pages.analysisMenu(); };
