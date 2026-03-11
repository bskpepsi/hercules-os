// ════════════════════════════════════════════════════════════════
// analysis.js — ライン分析・母系ランキング・血統ヒートマップ
// ════════════════════════════════════════════════════════════════
'use strict';

// ── ライン分析 ────────────────────────────────────────────────
Pages.lineAnalysis = async function () {
  const main = document.getElementById('main');
  main.innerHTML = `
    ${UI.header('ライン分析', { back: true })}
    <div class="page-body">
      <div id="analysis-content">${UI.spinner()}</div>
    </div>`;

  try {
    const res = await API.phase2.getLineAnalysis();
    const lines = res.lines || [];
    const el = document.getElementById('analysis-content');
    if (!lines.length) { el.innerHTML = UI.empty('データがありません'); return; }

    el.innerHTML = `
      <div class="analysis-summary">
        <div class="stat-box"><div class="stat-num">${lines.length}</div><div class="stat-label">ライン数</div></div>
        <div class="stat-box"><div class="stat-num">${Math.max(...lines.map(l=>l.max_weight||0))}g</div><div class="stat-label">全体最大体重</div></div>
        <div class="stat-box"><div class="stat-num">${lines.filter(l=>l.max_weight>=170).length}</div><div class="stat-label">170g超ライン</div></div>
      </div>

      <div class="section-title" style="margin-top:16px">ランキング（最大体重順）</div>
      ${lines.map((l, i) => _lineAnalysisCard(l, i+1)).join('')}`;
  } catch(e) {
    const el = document.getElementById('analysis-content');
    if (el) el.innerHTML = UI.empty('読み込み失敗: ' + e.message);
  }
};

function _lineAnalysisCard(l, rank) {
  const survivalColor = l.survival_rate >= 80 ? 'var(--green)' : l.survival_rate >= 60 ? 'var(--amber)' : 'var(--red,#e05555)';
  return `
    <div class="card analysis-card" onclick="routeTo('line-detail','${l.line_id}')">
      <div class="analysis-rank">#${rank}</div>
      <div class="analysis-header">
        <span class="analysis-title">${l.display_id}</span>
        <span class="analysis-max">${l.max_weight ? l.max_weight + 'g' : '—'}</span>
      </div>
      <div class="analysis-grid">
        <div class="ag-item">
          <span class="ag-label">平均体重</span>
          <span class="ag-val">${l.avg_weight ? l.avg_weight + 'g' : '—'}</span>
        </div>
        <div class="ag-item">
          <span class="ag-label">最大成虫</span>
          <span class="ag-val">${l.max_adult_size ? l.max_adult_size + 'mm' : '—'}</span>
        </div>
        <div class="ag-item">
          <span class="ag-label">平均成虫</span>
          <span class="ag-val">${l.avg_adult_size ? l.avg_adult_size + 'mm' : '—'}</span>
        </div>
        <div class="ag-item">
          <span class="ag-label">生存率</span>
          <span class="ag-val" style="color:${survivalColor}">
            ${l.survival_rate !== null ? l.survival_rate + '%' : '—'}
          </span>
        </div>
        <div class="ag-item">
          <span class="ag-label">頭数</span>
          <span class="ag-val">${l.total}頭（生存${l.alive}）</span>
        </div>
        <div class="ag-item">
          <span class="ag-label">死亡率</span>
          <span class="ag-val">${l.death_rate !== null ? l.death_rate + '%' : '—'}</span>
        </div>
      </div>
      ${l.max_weight ? _weightBar(l.max_weight, 200) : ''}
    </div>`;
}

function _weightBar(weight, maxTarget) {
  const pct = Math.min(weight / maxTarget * 100, 100);
  const color = weight >= 170 ? '#c8a84b' : weight >= 150 ? 'var(--amber)' : 'var(--green)';
  return `
    <div class="weight-bar-wrap">
      <div class="weight-bar" style="width:${pct}%;background:${color}"></div>
      <span class="weight-bar-target">目標200g</span>
    </div>`;
}

// ── 母系ランキング ────────────────────────────────────────────
Pages.motherRanking = async function () {
  const main = document.getElementById('main');
  main.innerHTML = `
    ${UI.header('母系ランキング', { back: true })}
    <div class="page-body">
      <div id="mother-content">${UI.spinner()}</div>
    </div>`;

  try {
    const res = await API.phase2.getMotherRanking();
    const ranking = res.ranking || [];
    const el = document.getElementById('mother-content');
    if (!ranking.length) { el.innerHTML = UI.empty('データが不足しています'); return; }

    el.innerHTML = `
      <div class="section-title">♀ 母親別 平均体重ランキング</div>
      ${ranking.map((m, i) => `
        <div class="card card-row" onclick="routeTo('parent-detail','${m.mother_par_id}')">
          <div class="rank-badge">#${i+1}</div>
          <div class="card-main">
            <div class="card-title">
              ${m.mother_display_id}
              ${m.mother_size_mm ? `<span class="badge badge-gray">${m.mother_size_mm}mm</span>` : ''}
            </div>
            <div class="analysis-grid" style="margin-top:6px">
              <div class="ag-item">
                <span class="ag-label">平均体重</span>
                <span class="ag-val">${m.avg_weight ? m.avg_weight + 'g' : '—'}</span>
              </div>
              <div class="ag-item">
                <span class="ag-label">最大体重</span>
                <span class="ag-val">${m.max_weight ? m.max_weight + 'g' : '—'}</span>
              </div>
              <div class="ag-item">
                <span class="ag-label">最大成虫</span>
                <span class="ag-val">${m.max_adult_size ? m.max_adult_size + 'mm' : '—'}</span>
              </div>
              <div class="ag-item">
                <span class="ag-label">子供数</span>
                <span class="ag-val">${m.child_count}頭</span>
              </div>
            </div>
            ${m.avg_weight ? _weightBar(m.avg_weight, 180) : ''}
          </div>
          <span class="card-arrow">›</span>
        </div>
      `).join('')}`;
  } catch(e) {
    const el = document.getElementById('mother-content');
    if (el) el.innerHTML = UI.empty('読み込み失敗: ' + e.message);
  }
};

// ── 血統組み合わせヒートマップ ────────────────────────────────
Pages.bloodlineHeatmap = async function () {
  const main = document.getElementById('main');
  main.innerHTML = `
    ${UI.header('血統組み合わせ分析', { back: true })}
    <div class="page-body">
      <div id="heatmap-content">${UI.spinner()}</div>
    </div>`;

  try {
    const res  = await API.phase2.getHeatmap();
    const data = res.heatmap || [];
    const el   = document.getElementById('heatmap-content');
    if (!data.length) { el.innerHTML = UI.empty('データが不足しています（個体の血統タグを設定してください）'); return; }

    // 最大値を取得（色の基準）
    const maxAvg = Math.max(...data.map(d => d.avg_weight || 0));

    el.innerHTML = `
      <div class="section-title">父系タグ × 母系タグ 組み合わせ</div>
      <div class="heatmap-legend">
        <span class="legend-low">低</span>
        <div class="legend-bar"></div>
        <span class="legend-high">高（平均体重）</span>
      </div>
      ${data.map(d => _heatmapCard(d, maxAvg)).join('')}`;
  } catch(e) {
    const el = document.getElementById('heatmap-content');
    if (el) el.innerHTML = UI.empty('読み込み失敗: ' + e.message);
  }
};

function _heatmapCard(d, maxAvg) {
  // 平均体重に応じてヒートカラー
  const intensity = maxAvg > 0 ? (d.avg_weight || 0) / maxAvg : 0;
  const r = Math.round(200 - intensity * 100);
  const g = Math.round(100 + intensity * 100);
  const bgColor = `rgba(${r},${g},50,0.15)`;
  const borderColor = `rgba(${r},${g},50,0.5)`;

  const pTags = (d.paternal_tags || []);
  const mTags = (d.maternal_tags || []);

  return `
    <div class="card heatmap-card" style="border:1px solid ${borderColor};background:${bgColor}">
      <div class="heatmap-combo">
        <div class="heatmap-side">
          <div class="hm-label">父系</div>
          <div class="tag-row">
            ${pTags.length
              ? pTags.map(t=>`<span class="tag tag-blue">${t}</span>`).join('')
              : '<span class="text-gray text-sm">不明</span>'}
          </div>
        </div>
        <div class="hm-x">×</div>
        <div class="heatmap-side">
          <div class="hm-label">母系</div>
          <div class="tag-row">
            ${mTags.length
              ? mTags.map(t=>`<span class="tag tag-amber">${t}</span>`).join('')
              : '<span class="text-gray text-sm">不明</span>'}
          </div>
        </div>
      </div>
      <div class="analysis-grid" style="margin-top:10px">
        <div class="ag-item">
          <span class="ag-label">平均体重</span>
          <span class="ag-val" style="font-size:1.1em;font-weight:700">
            ${d.avg_weight ? d.avg_weight + 'g' : '—'}
          </span>
        </div>
        <div class="ag-item">
          <span class="ag-label">最大体重</span>
          <span class="ag-val">${d.max_weight ? d.max_weight + 'g' : '—'}</span>
        </div>
        <div class="ag-item">
          <span class="ag-label">平均成虫</span>
          <span class="ag-val">${d.avg_adult_size ? d.avg_adult_size + 'mm' : '—'}</span>
        </div>
        <div class="ag-item">
          <span class="ag-label">サンプル</span>
          <span class="ag-val">${d.sample_count}頭 / ${d.line_count}ライン</span>
        </div>
      </div>
    </div>`;
}

// ── 種親ダッシュボード（ペアリング可能状況） ──────────────────
Pages.parentDashboard = async function () {
  const main = document.getElementById('main');
  main.innerHTML = `
    ${UI.header('種親ダッシュボード', { back: true })}
    <div class="page-body">
      <div id="pd-content">${UI.spinner()}</div>
    </div>`;

  try {
    const res = await API.phase2.getDashboardExt();
    const el  = document.getElementById('pd-content');

    const { pairingStatus, maleRanking, intervalWarnings } = res;
    const { readyToday=[], readySoon=[], noFeeding=[], waiting=[] } = pairingStatus || {};

    el.innerHTML = `
      <!-- ペアリング可能状況 -->
      <div class="section-title">📅 ペアリング状況</div>
      <div class="kpi-row">
        <div class="kpi-card kpi-green">
          <div class="kpi-num">${readyToday.length}</div>
          <div class="kpi-label">今日から可能</div>
        </div>
        <div class="kpi-card kpi-amber">
          <div class="kpi-num">${readySoon.length}</div>
          <div class="kpi-label">7日以内</div>
        </div>
        <div class="kpi-card kpi-gray">
          <div class="kpi-num">${waiting.length}</div>
          <div class="kpi-label">待機中</div>
        </div>
        <div class="kpi-card kpi-red">
          <div class="kpi-num">${noFeeding.length}</div>
          <div class="kpi-label">後食未設定</div>
        </div>
      </div>

      <!-- 今日から可能 -->
      ${readyToday.length ? `
        <div class="section-title" style="color:var(--green)">✅ 今日からペアリング可能</div>
        ${readyToday.map(p => _pairingReadyCard(p)).join('')}
      ` : ''}

      <!-- 7日以内 -->
      ${readySoon.length ? `
        <div class="section-title" style="color:var(--amber)">⏳ 7日以内に可能</div>
        ${readySoon.map(p => _pairingReadyCard(p)).join('')}
      ` : ''}

      <!-- 後食未設定 -->
      ${noFeeding.length ? `
        <div class="section-title" style="color:var(--text-muted)">🍽️ 後食未設定</div>
        ${noFeeding.map(p => _pairingReadyCard(p)).join('')}
      ` : ''}

      <!-- ♂ペアリング回数ランキング -->
      ${maleRanking && maleRanking.length ? `
        <div class="section-title" style="margin-top:20px">🏆 ♂ペアリング回数ランキング</div>
        ${maleRanking.map((m, i) => `
          <div class="card card-row" onclick="routeTo('parent-detail','${m.par_id}')">
            <div class="rank-badge">#${i+1}</div>
            <div class="card-main">
              <div class="card-title">${m.display_id}</div>
              <div class="card-sub">ペアリング ${m.pairing_count}回</div>
            </div>
            <span class="card-arrow">›</span>
          </div>
        `).join('')}
      ` : ''}

      <!-- 間隔警告 -->
      ${intervalWarnings && intervalWarnings.length ? `
        <div class="section-title" style="margin-top:20px;color:#e05555">⚠️ ペアリング間隔が短い♂</div>
        ${intervalWarnings.map(w => `
          <div class="card" style="border:1px solid #e0555533">
            <div class="card-title">${w.display_id}</div>
            <div class="card-sub text-warn">前回から${w.interval}日（推奨${w.minDays}日以上）</div>
          </div>
        `).join('')}
      ` : ''}
    `;
  } catch(e) {
    const el = document.getElementById('pd-content');
    if (el) el.innerHTML = UI.empty('読み込み失敗: ' + e.message);
  }
};

function _pairingReadyCard(p) {
  const statusText = {
    ready:      '✅ 可能',
    soon:       `⏳ あと${p.daysUntilReady}日`,
    waiting:    `📅 ${p.daysUntilReady}日後`,
    no_feeding: '🍽️ 未設定',
  }[p.pairingStatus] || '';

  return `
    <div class="card card-row" onclick="routeTo('parent-detail','${p.par_id}')">
      <div class="card-main">
        <div class="card-title">${p.parent_display_id} ${p.sex}</div>
        <div class="card-sub">
          ${statusText}
          ${p.size_mm ? ' · ' + p.size_mm + 'mm' : ''}
        </div>
      </div>
      ${p.pairingStatus === 'no_feeding'
        ? `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();_parentSetFeeding('${p.par_id}')">設定</button>`
        : '<span class="card-arrow">›</span>'}
    </div>`;
}
