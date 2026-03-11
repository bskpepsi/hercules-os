// ════════════════════════════════════════════════════════════════
// dashboard.js
// 役割: アプリ起動時のホーム画面。
//       飼育全体のKPI・候補個体・最近の作業予定を一目で把握できる。
//       各セクションからワンタップで詳細画面へ遷移できることを優先する。
// ════════════════════════════════════════════════════════════════

'use strict';

Pages.dashboard = async function () {
  const main = document.getElementById('main');

  // まずキャッシュで即時表示
  _renderDashboard(main);

  // バックグラウンドで最新データ取得（GAS URLが設定済みの場合）
  const gasUrl = Store.getSetting('gas_url') || CONFIG.GAS_URL;
  if (gasUrl) {
    try {
      await syncAll(true);
      _renderDashboard(main);
    } catch (e) { /* 失敗してもキャッシュ表示を維持 */ }
  }
};

function _renderDashboard(main) {
  const inds   = Store.getDB('individuals') || [];
  const lots   = Store.getDB('lots')        || [];
  const lines  = Store.getDB('lines')       || [];

  const alive  = inds.filter(i => i.status === 'alive');
  const actLot = lots.filter(l => l.status === 'active');
  const guinCands = alive.filter(i => String(i.guinness_flag) === 'true');
  const parCands  = alive.filter(i => String(i.parent_flag)   === 'true');
  const g200Cands = alive.filter(i => String(i.g200_flag)     === 'true');

  // 最重量3頭
  const topByWeight = [...alive]
    .filter(i => i.latest_weight_g)
    .sort((a,b) => +b.latest_weight_g - +a.latest_weight_g)
    .slice(0, 3);

  // ステージ別集計
  const stageCounts = {};
  alive.forEach(i => {
    const s = i.current_stage || 'unknown';
    stageCounts[s] = (stageCounts[s] || 0) + 1;
  });

  // マット交換推奨（最終交換から60日以上経過したロット）
  const today = new Date();
  const exchangeDue = actLot.filter(l => {
    if (!l.mat_changed_at) return false;
    const parts = l.mat_changed_at.split('/');
    if (parts.length < 3) return false;
    const last = new Date(+parts[0], +parts[1]-1, +parts[2]);
    const days = Math.floor((today - last) / 86400000);
    return days >= 60;
  });

  const gasUrl = Store.getSetting('gas_url') || CONFIG.GAS_URL;

  main.innerHTML = `
    ${_dashHeader()}
    <div class="page-body">

      ${!gasUrl ? `<div class="card" style="border-color:rgba(224,144,64,.4);background:rgba(224,144,64,.07)">
        <div style="font-size:.85rem;color:var(--amber)">
          ⚠️ GAS URLが未設定です。
          <span style="cursor:pointer;text-decoration:underline;color:var(--blue)"
            onclick="routeTo('settings')">設定画面へ</span>
        </div>
      </div>` : ''}

      <!-- KPI -->
      <div class="kpi-grid">
        <div class="kpi-card" onclick="routeTo('ind-list')">
          <div class="kpi-value">${alive.length}</div>
          <div class="kpi-label">飼育個体数</div>
          <div class="kpi-sub">♂${alive.filter(i=>i.sex==='♂').length} / ♀${alive.filter(i=>i.sex==='♀').length}</div>
        </div>
        <div class="kpi-card" onclick="routeTo('lot-list')">
          <div class="kpi-value">${actLot.length}</div>
          <div class="kpi-label">管理中ロット</div>
          <div class="kpi-sub">総頭数 ${actLot.reduce((s,l)=>s+(+l.count||0),0)}頭</div>
        </div>
        <div class="kpi-card" onclick="routeTo('ind-list')">
          <div class="kpi-value">${guinCands.length}</div>
          <div class="kpi-label">ギネス候補 🏆</div>
          <div class="kpi-sub">${lines.length}ライン</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${topByWeight.length ? topByWeight[0].latest_weight_g+'g' : '—'}</div>
          <div class="kpi-label">最重量</div>
          <div class="kpi-sub">${topByWeight.length ? topByWeight[0].display_id : '—'}</div>
        </div>
      </div>

      <!-- ステージ別内訳 -->
      <div class="card">
        <div class="card-title">ステージ別内訳</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${STAGE_LIST.map(s => {
            const n = stageCounts[s.code] || 0;
            if (!n) return '';
            return `<div style="background:${s.color}18;border:1px solid ${s.color}44;border-radius:6px;
              padding:6px 10px;cursor:pointer;text-align:center"
              onclick="routeTo('ind-list',{stage:'${s.code}'})">
              <div style="font-size:.7rem;color:${s.color};font-weight:600">${s.label}</div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--text)">${n}</div>
            </div>`;
          }).join('')}
          ${Object.keys(stageCounts).length === 0 ? `<span style="color:var(--text3);font-size:.82rem">個体がいません</span>` : ''}
        </div>
      </div>

      <!-- 重要候補個体 -->
      ${(guinCands.length || parCands.length || g200Cands.length) ? `
      <div class="card">
        <div class="card-title">⭐ 重要候補個体</div>
        ${guinCands.length ? `
          <div class="sec-hdr"><span class="sec-title">🏆 ギネス候補 (${guinCands.length}頭)</span></div>
          ${guinCands.slice(0,3).map(_miniIndCard).join('')}
          ${guinCands.length > 3 ? `<div class="sec-more" onclick="routeTo('ind-list')">+${guinCands.length-3}頭を見る</div>` : ''}
        ` : ''}
        ${parCands.length ? `
          <div class="sec-hdr" style="margin-top:10px"><span class="sec-title">👑 種親候補 (${parCands.length}頭)</span></div>
          ${parCands.slice(0,3).map(_miniIndCard).join('')}
        ` : ''}
        ${g200Cands.length ? `
          <div class="sec-hdr" style="margin-top:10px"><span class="sec-title">💪 200g候補 (${g200Cands.length}頭)</span></div>
          ${g200Cands.slice(0,3).map(_miniIndCard).join('')}
        ` : ''}
      </div>` : ''}

      <!-- 体重トップ3 -->
      ${topByWeight.length ? `
      <div class="card">
        <div class="card-title">🥇 体重トップ3</div>
        ${topByWeight.map((ind, i) => {
          const age = Store.calcAge(ind.hatch_date);
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;
            border-bottom:1px solid var(--border);cursor:pointer"
            onclick="routeTo('ind-detail',{id:'${ind.ind_id}'})">
            <span style="font-size:1.2rem;min-width:28px">${'🥇🥈🥉'[i]}</span>
            <div style="flex:1">
              <div style="font-family:var(--font-mono);font-size:.82rem;color:var(--gold)">${ind.display_id}</div>
              <div style="font-size:.72rem;color:var(--text3)">${age ? age.days+' / '+age.stageGuess : '—'}</div>
            </div>
            <div style="font-size:1.2rem;font-weight:700;color:var(--green)">${ind.latest_weight_g}g</div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- 作業予定（マット交換推奨） -->
      ${exchangeDue.length ? `
      <div class="card" style="border-color:rgba(224,144,64,.3)">
        <div class="card-title" style="color:var(--amber)">🔔 マット交換推奨 (${exchangeDue.length}ロット)</div>
        ${exchangeDue.slice(0,4).map(lot => {
          const parts = lot.mat_changed_at.split('/');
          const last  = new Date(+parts[0], +parts[1]-1, +parts[2]);
          const days  = Math.floor((today - last) / 86400000);
          return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;
            border-bottom:1px solid var(--border);cursor:pointer"
            onclick="routeTo('lot-detail',{id:'${lot.lot_id}'})">
            <span style="color:var(--amber)">⚠️</span>
            <div style="flex:1">
              <div style="font-family:var(--font-mono);font-size:.8rem">${lot.display_id}</div>
              <div style="font-size:.7rem;color:var(--text3)">${stageLabel(lot.stage)} / ${lot.count}頭</div>
            </div>
            <div style="font-size:.75rem;color:var(--amber)">${days}日経過</div>
          </div>`;
        }).join('')}
        ${exchangeDue.length > 4 ? `<div class="sec-more" onclick="routeTo('lot-list')">+${exchangeDue.length-4}件を見る</div>` : ''}
      </div>` : ''}

      <!-- QRスキャン大ボタン（1タップアクセス） -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px">
        <button onclick="routeTo('qr-scan',{mode:'weight'})" style="
          padding:18px 10px; border:none; border-radius:14px;
          background:linear-gradient(135deg,rgba(45,122,82,.9),rgba(76,175,120,.8));
          color:#fff; cursor:pointer; text-align:center;
          box-shadow:0 3px 12px rgba(45,122,82,.35);">
          <div style="font-size:1.8rem;margin-bottom:4px">⚖️</div>
          <div style="font-weight:700;font-size:.9rem">体重測定</div>
          <div style="font-size:.68rem;opacity:.85;margin-top:2px">QR → 入力 → 保存</div>
        </button>
        <button onclick="routeTo('qr-scan')" style="
          padding:18px 10px; border:none; border-radius:14px;
          background:linear-gradient(135deg,rgba(91,168,232,.85),rgba(60,130,200,.75));
          color:#fff; cursor:pointer; text-align:center;
          box-shadow:0 3px 12px rgba(91,168,232,.3);">
          <div style="font-size:1.8rem;margin-bottom:4px">📷</div>
          <div style="font-weight:700;font-size:.9rem">QRスキャン</div>
          <div style="font-size:.68rem;opacity:.85;margin-top:2px">差分入力モード</div>
        </button>
      </div>

      <!-- クイックアクション -->
      <div class="card">
        <div class="card-title">クイックアクション</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-ghost" onclick="routeTo('label-gen')">🏷️ ラベル発行</button>
          <button class="btn btn-ghost" onclick="routeTo('ind-new')">➕ 個体登録</button>
          <button class="btn btn-ghost" onclick="routeTo('lot-list')">🥚 ロット管理</button>
          <button class="btn btn-ghost" onclick="syncAll()">🔄 データ同期</button>
        </div>
      </div>

      <div style="text-align:center;font-size:.68rem;color:var(--text3);padding:8px 0">
        HerculesOS v${CONFIG.APP_VERSION} — Phase ${CONFIG.PHASE}
      </div>

    </div>`;
}

function _dashHeader() {
  const now = new Date();
  const greet = now.getHours() < 12 ? 'おはようございます' :
                now.getHours() < 18 ? 'こんにちは' : 'おつかれさまです';
  return `<header class="page-header" style="justify-content:space-between">
    <div style="font-size:.85rem;color:var(--text2)">${greet}</div>
    <div style="font-family:var(--font-mono);font-size:.75rem;color:var(--gold)">HerculesOS</div>
    <button class="btn-icon" onclick="syncAll()">🔄</button>
  </header>`;
}

function _miniIndCard(ind) {
  const age = Store.calcAge(ind.hatch_date);
  return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;
    border-bottom:1px solid var(--border);cursor:pointer"
    onclick="routeTo('ind-detail',{id:'${ind.ind_id}'})">
    <span>${ind.sex || '?'}</span>
    <div style="flex:1">
      <div style="font-family:var(--font-mono);font-size:.8rem;color:var(--gold)">${ind.display_id}</div>
      <div style="font-size:.7rem;color:var(--text3)">${age ? age.days : '—'}</div>
    </div>
    <div style="font-size:1rem;font-weight:700;color:var(--green)">
      ${ind.latest_weight_g ? ind.latest_weight_g+'g' : '—'}
    </div>
  </div>`;
}

// ページ登録
PAGES['dashboard'] = () => Pages.dashboard();
