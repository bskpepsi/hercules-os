// ════════════════════════════════════════════════════════════════
// dashboard.js  v3 — 司令塔ダッシュボード
// ブロック構成:
//   1. 今日の最優先タスク
//   2. クイックアクション
//   3. 種親・ペアリング状況
//   4. 産卵セット状況
//   5. 有望個体エリア
//   6. ライン・血統分析サマリー
// ════════════════════════════════════════════════════════════════
'use strict';

Pages.dashboard = async function () {
  const main = document.getElementById('main');
  _renderDashboard(main);
  const gasUrl = Store.getSetting('gas_url') || CONFIG.GAS_URL;
  if (gasUrl) {
    try {
      await syncAll(true);
      if (Store.getPage() !== 'dashboard') return;
      _renderDashboard(main);
    } catch (e) {}
  }
};

function _renderDashboard(main) {
  const inds     = Store.getDB('individuals') || [];
  const lots     = Store.getDB('lots')        || [];
  const lines    = Store.getDB('lines')       || [];
  const parents  = Store.getDB('parents')     || [];
  const pairings = Store.getDB('pairings')    || [];

  const alive    = inds.filter(i => i.status === 'alive');
  const actLot   = lots.filter(l => l.status === 'active');
  const today    = new Date(); today.setHours(0,0,0,0);

  // ────────────────────────────────────────────────
  // 1. 今日のタスク計算
  // ────────────────────────────────────────────────
  const exchDays   = parseInt(Store.getSetting('pairing_set_exchange_days') || '7', 10);
  const activePairs= pairings.filter(p => p.status === 'active' && (p.set_start || p.pairing_start));

  function _pairDue(p) {
    const base = p.set_start || p.pairing_start;
    const pts  = String(base).split(/[\/\-]/);
    if (pts.length < 3) return null;
    const d = new Date(+pts[0], +pts[1]-1, +pts[2]);
    d.setDate(d.getDate() + exchDays);
    return d;
  }

  const tasks = { red: [], yellow: [], green: [] };

  // 産卵セット交換
  activePairs.forEach(p => {
    const due  = _pairDue(p);
    if (!due) return;
    const diff = Math.floor((due - today) / 86400000);
    const label = p.set_name || p.display_id;
    if (diff < 0)   tasks.red.push({ icon:'🥚', text:`${label} セット交換 ${Math.abs(diff)}日超過`, fn:`routeTo('pairing-detail',{pairingId:'${p.set_id}'})` });
    else if(diff===0) tasks.red.push({ icon:'🔔', text:`${label} 今日セット交換日`, fn:`routeTo('pairing-detail',{pairingId:'${p.set_id}'})` });
    else if(diff<=2)  tasks.yellow.push({ icon:'📅', text:`${label} セット交換まで${diff}日`, fn:`routeTo('pairing-detail',{pairingId:'${p.set_id}'})` });
  });

  // 種親ペアリング可能判定
  const maleWait   = parseInt(Store.getSetting('male_pairing_wait_days')   || '14', 10);
  const femaleWait = parseInt(Store.getSetting('female_pairing_wait_days') || '14', 10);
  parents.filter(p => p.status === 'active' && p.feeding_start_date).forEach(p => {
    const wait  = p.sex === '♂' ? maleWait : femaleWait;
    const fpts  = String(p.feeding_start_date).split(/[\/\-]/);
    if (fpts.length < 3) return;
    const readyDate = new Date(+fpts[0], +fpts[1]-1, +fpts[2]);
    readyDate.setDate(readyDate.getDate() + wait);
    const diff = Math.floor((readyDate - today) / 86400000);
    if (diff <= 0)  tasks.green.push({ icon:'💕', text:`${p.display_name} ペアリング可能`, fn:`routeTo('parent-detail',{parId:'${p.par_id}'})` });
    else if(diff<=7) tasks.yellow.push({ icon:'⏳', text:`${p.display_name} ペアリングまで${diff}日`, fn:`routeTo('parent-detail',{parId:'${p.par_id}'})` });
  });

  // 150g超え個体（有望）
  const over150 = alive.filter(i => +i.latest_weight_g >= 150);
  if (over150.length) tasks.green.push({ icon:'🏆', text:`150g超え ${over150.length}頭`, fn:"routeTo('ind-list')" });

  // ── カテゴリ別集計 ──
  // 採卵・セット交換: red+yellowのうち産卵セット関連
  const catEgg     = [...tasks.red, ...tasks.yellow].filter(t => t.fn.includes('pairing'));
  // ペアリング: green+yellowのうち種親ペアリング関連
  const catPairing = [...tasks.green, ...tasks.yellow].filter(t => t.fn.includes('parent'));
  // 注意: redタスク全体（超過・緊急）
  const catAlert   = tasks.red.filter(t => !t.fn.includes('pairing') || true);
  // マット交換: 個体のマット交換時期（日齢から推定）
  const matDays = parseInt(Store.getSetting('mat_change_interval_days') || '60', 10);
  const matDue  = alive.filter(i => {
    if (!i.hatch_date) return false;
    const age = Store.calcAge(i.hatch_date);
    if (!age) return false;
    // 最終成長記録からの経過日数（簡易判定）
    return age.days > 0 && age.days % matDays < 7; // 交換時期±7日以内
  });

  // ────────────────────────────────────────────────
  // 3. 種親・ペアリング状況
  // ────────────────────────────────────────────────
  const activeParents = parents.filter(p => p.status === 'active');
  const males   = activeParents.filter(p => p.sex === '♂');
  const females = activeParents.filter(p => p.sex === '♀');

  function _parentReadyDiff(p) {
    if (!p.feeding_start_date) return null;
    const wait = p.sex === '♂' ? maleWait : femaleWait;
    const pts  = String(p.feeding_start_date).split(/[\/\-]/);
    if (pts.length < 3) return null;
    const d = new Date(+pts[0], +pts[1]-1, +pts[2]);
    d.setDate(d.getDate() + wait);
    return Math.floor((d - today) / 86400000);
  }

  const readyToday = activeParents.filter(p => { const d = _parentReadyDiff(p); return d !== null && d <= 0; });
  const readySoon  = activeParents.filter(p => { const d = _parentReadyDiff(p); return d !== null && d > 0 && d <= 7; });
  const noFeeding  = activeParents.filter(p => !p.feeding_start_date);

  // ────────────────────────────────────────────────
  // 4. 産卵セット ライン別集計
  // ────────────────────────────────────────────────
  const lineMap = {};
  lines.forEach(l => { lineMap[l.line_id] = l.display_id || l.line_id; });

  const pairByLine = {};
  activePairs.forEach(p => {
    const key = p.line_id || p.display_id;
    if (!pairByLine[key]) pairByLine[key] = { label: lineMap[key] || p.set_name || p.display_id, eggs: 0, hatch: 0, pairs: [] };
    pairByLine[key].eggs  += parseInt(p.total_eggs  || 0, 10);
    pairByLine[key].hatch += parseInt(p.total_hatch || 0, 10);
    pairByLine[key].pairs.push(p);
  });

  // ────────────────────────────────────────────────
  // 5. 有望個体
  // ────────────────────────────────────────────────
  const withWeight = alive.filter(i => i.latest_weight_g);
  const topWeight  = [...withWeight].sort((a,b) => +b.latest_weight_g - +a.latest_weight_g).slice(0,5);
  const over170    = alive.filter(i => +i.latest_weight_g >= 170);

  // ────────────────────────────────────────────────
  // 6. ライン分析
  // ────────────────────────────────────────────────
  const lineStats = {};
  lines.forEach(l => { lineStats[l.line_id] = { label: l.display_id, weights: [], alive: 0, dead: 0 }; });
  inds.forEach(i => {
    if (!lineStats[i.line_id]) return;
    if (i.status === 'alive') { lineStats[i.line_id].alive++; if (i.latest_weight_g) lineStats[i.line_id].weights.push(+i.latest_weight_g); }
    if (i.status === 'dead')   lineStats[i.line_id].dead++;
  });
  const lineRank = Object.values(lineStats)
    .filter(s => s.weights.length > 0)
    .map(s => ({ ...s, avg: Math.round(s.weights.reduce((a,b)=>a+b,0)/s.weights.length*10)/10 }))
    .sort((a,b) => b.avg - a.avg)
    .slice(0, 3);

  const gasUrl = Store.getSetting('gas_url') || CONFIG.GAS_URL;

  main.innerHTML = `
    ${_dashHeader()}
    <div class="page-body">

      ${!gasUrl ? `<div class="card" style="border-color:rgba(224,144,64,.4);background:rgba(224,144,64,.07)">
        <div style="font-size:.85rem;color:var(--amber)">
          ⚠️ GAS URLが未設定です。
          <span style="color:var(--blue);cursor:pointer" onclick="routeTo('settings')">設定画面へ</span>
        </div></div>` : ''}

      <!-- ① 今日のタスク（カテゴリ表示） -->
      <div class="card" style="border-color:rgba(231,76,60,.3)">
        <div class="card-title">📋 今日のタスク</div>
        ${(catEgg.length || catPairing.length || matDue.length || catAlert.length) ? `
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
            ${catEgg.length ? `
            <div onclick="routeTo('pairing-list')" style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(231,76,60,.1);border-radius:8px;cursor:pointer">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:1.3rem">🥚</span>
                <span style="font-weight:600">採卵・セット交換</span>
              </div>
              <span style="font-size:1.4rem;font-weight:700;color:var(--red)">${catEgg.length}件</span>
            </div>` : ''}
            ${catPairing.length ? `
            <div onclick="routeTo('parent-list')" style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,193,7,.1);border-radius:8px;cursor:pointer">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:1.3rem">💕</span>
                <span style="font-weight:600">ペアリング</span>
              </div>
              <span style="font-size:1.4rem;font-weight:700;color:var(--amber)">${catPairing.length}件</span>
            </div>` : ''}
            ${matDue.length ? `
            <div onclick="routeTo('ind-list')" style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(52,152,219,.1);border-radius:8px;cursor:pointer">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:1.3rem">🌱</span>
                <span style="font-weight:600">マット交換</span>
              </div>
              <span style="font-size:1.4rem;font-weight:700;color:var(--blue)">${matDue.length}頭</span>
            </div>` : ''}
            ${catAlert.length ? `
            <div onclick="routeTo('pairing-list')" style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(231,76,60,.15);border-radius:8px;cursor:pointer;border:1px solid rgba(231,76,60,.3)">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:1.3rem">⚠️</span>
                <span style="font-weight:600">注意</span>
              </div>
              <span style="font-size:1.4rem;font-weight:700;color:var(--red)">${catAlert.length}件</span>
            </div>` : ''}
          </div>
        ` : `<div style="text-align:center;padding:12px;color:var(--green);font-size:.9rem">✅ 今日のタスクはありません</div>`}
      </div>

      <!-- ② クイックアクション -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <button onclick="routeTo('qr-scan',{mode:'weight'})" style="padding:16px 8px;border:none;border-radius:14px;background:linear-gradient(135deg,rgba(45,122,82,.9),rgba(76,175,120,.8));color:#fff;cursor:pointer;text-align:center;box-shadow:0 3px 12px rgba(45,122,82,.3)">
          <div style="font-size:1.6rem;margin-bottom:3px">⚖️</div>
          <div style="font-weight:700;font-size:.88rem">体重測定</div>
        </button>
        <button onclick="routeTo('qr-scan')" style="padding:16px 8px;border:none;border-radius:14px;background:linear-gradient(135deg,rgba(33,97,172,.9),rgba(84,153,199,.8));color:#fff;cursor:pointer;text-align:center;box-shadow:0 3px 12px rgba(33,97,172,.3)">
          <div style="font-size:1.6rem;margin-bottom:3px">📷</div>
          <div style="font-weight:700;font-size:.88rem">QRスキャン</div>
        </button>
        <button onclick="routeTo('pairing-list')" style="padding:16px 8px;border:none;border-radius:14px;background:linear-gradient(135deg,rgba(155,89,182,.85),rgba(187,143,206,.8));color:#fff;cursor:pointer;text-align:center;box-shadow:0 3px 12px rgba(155,89,182,.3)">
          <div style="font-size:1.6rem;margin-bottom:3px">🥚</div>
          <div style="font-weight:700;font-size:.88rem">採卵記録</div>
        </button>
        <button onclick="routeTo('label-gen')" style="padding:16px 8px;border:none;border-radius:14px;background:linear-gradient(135deg,rgba(202,164,48,.85),rgba(212,181,100,.8));color:#fff;cursor:pointer;text-align:center;box-shadow:0 3px 12px rgba(202,164,48,.3)">
          <div style="font-size:1.6rem;margin-bottom:3px">🏷️</div>
          <div style="font-weight:700;font-size:.88rem">ラベル発行</div>
        </button>
      </div>

      <!-- KPIバー -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        ${[
          { val: alive.length, sub: `♂${alive.filter(i=>i.sex==='♂').length}/♀${alive.filter(i=>i.sex==='♀').length}`, label:'飼育個体数', fn:"routeTo('ind-list')" },
          { val: actLot.length, sub:`総頭数 ${actLot.reduce((s,l)=>s+(+l.count||0),0)}頭`, label:'管理中ロット', fn:"routeTo('lot-list')" },
          { val: alive.filter(i=>String(i.guinness_flag)==='true').length, sub:`${lines.length}ライン`, label:'ギネス候補🏆', fn:"routeTo('ind-list')" },
          { val: topWeight[0] ? topWeight[0].latest_weight_g+'g' : '—', sub: topWeight[0] ? topWeight[0].display_id : '—', label:'最高体重', fn:"routeTo('ind-list')" },
        ].map(k=>`<div class="kpi-card" onclick="${k.fn}" style="cursor:pointer">
          <div class="kpi-value">${k.val}</div>
          <div style="font-size:.6rem;color:var(--text3);margin-bottom:1px">${k.sub}</div>
          <div class="kpi-label">${k.label}</div>
        </div>`).join('')}
      </div>

      <!-- ③ 種親・ペアリング状況 -->
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between">
          <span>🦋 種親・ペアリング状況</span>
          <span style="font-size:.72rem;font-weight:400;color:var(--text3)">♂${males.length} / ♀${females.length}</span>
        </div>
        ${readyToday.length ? `
          <div style="margin-bottom:8px">
            <div style="font-size:.72rem;color:var(--green);font-weight:700;margin-bottom:4px">✅ ペアリング可能（今日〜）</div>
            ${readyToday.map(p=>`
              <div onclick="routeTo('parent-detail',{parId:'${p.par_id}'})" style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;border-bottom:1px solid var(--border)">
                <span style="font-size:.85rem">${p.sex}</span>
                <span style="flex:1;font-size:.82rem;font-weight:600">${p.display_name}${p.size_mm?' '+p.size_mm+'mm':''}</span>
                <span style="font-size:.7rem;color:var(--green)">可能 ›</span>
              </div>`).join('')}
          </div>` : ''}
        ${readySoon.length ? `
          <div style="margin-bottom:8px">
            <div style="font-size:.72rem;color:var(--amber);font-weight:700;margin-bottom:4px">⏳ 7日以内にペアリング可能</div>
            ${readySoon.map(p=>{ const d=_parentReadyDiff(p); return `
              <div onclick="routeTo('parent-detail',{parId:'${p.par_id}'})" style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;border-bottom:1px solid var(--border)">
                <span style="font-size:.85rem">${p.sex}</span>
                <span style="flex:1;font-size:.82rem">${p.display_name}${p.size_mm?' '+p.size_mm+'mm':''}</span>
                <span style="font-size:.7rem;color:var(--amber)">あと${d}日 ›</span>
              </div>`;}).join('')}
          </div>` : ''}
        ${noFeeding.length ? `
          <div>
            <div style="font-size:.72rem;color:var(--text3);font-weight:700;margin-bottom:4px">⚠️ 後食開始日未設定 (${noFeeding.length}頭)</div>
            ${noFeeding.slice(0,3).map(p=>`
              <div onclick="routeTo('parent-detail',{parId:'${p.par_id}'})" style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;border-bottom:1px solid var(--border)">
                <span style="font-size:.85rem">${p.sex}</span>
                <span style="flex:1;font-size:.82rem;color:var(--text2)">${p.display_name}${p.size_mm?' '+p.size_mm+'mm':''}</span>
                <span style="font-size:.7rem;color:var(--blue)">設定 ›</span>
              </div>`).join('')}
            ${noFeeding.length>3?`<div style="font-size:.72rem;color:var(--text3);padding:4px 0">+${noFeeding.length-3}頭</div>`:''}
          </div>` : ''}
        ${!readyToday.length && !readySoon.length && !noFeeding.length ? `<div style="font-size:.82rem;color:var(--text3);padding:8px 0">種親データがありません</div>` : ''}
        <button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%" onclick="routeTo('parent-list')">種親一覧を見る →</button>
      </div>

      <!-- ④ 産卵セット状況 -->
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between">
          <span>🥚 産卵セット状況</span>
          <span style="font-size:.72rem;font-weight:400;color:var(--text3)">${activePairs.length}セット進行中</span>
        </div>
        ${Object.keys(pairByLine).length ? Object.values(pairByLine).map(ls => {
          const rate = ls.eggs > 0 ? Math.round(ls.hatch/ls.eggs*1000)/10 : null;
          // 交換リマインド
          let exchTag = '';
          ls.pairs.forEach(p => {
            const due = _pairDue(p);
            if (!due) return;
            const diff = Math.floor((due - today) / 86400000);
            if (diff < 0)   exchTag = `<span style="font-size:.65rem;color:var(--red);font-weight:700">期限超過${Math.abs(diff)}日</span>`;
            else if(diff===0) exchTag = `<span style="font-size:.65rem;color:var(--red);font-weight:700">今日交換</span>`;
            else if(diff===1) exchTag = `<span style="font-size:.65rem;color:var(--amber);font-weight:700">明日交換</span>`;
            else if(diff<=3)  exchTag = `<span style="font-size:.65rem;color:var(--amber)">交換まで${diff}日</span>`;
          });
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="routeTo('pairing-list')">
            <div>
              <div style="font-size:.83rem;font-weight:600">${ls.label}</div>
              <div style="font-size:.72rem;color:var(--text3);margin-top:1px">採卵${ls.eggs}個 / 孵化${ls.hatch}頭 ${rate!==null?'/ 孵化率'+rate+'%':''}</div>
            </div>
            ${exchTag}
          </div>`;
        }).join('') : `<div style="font-size:.82rem;color:var(--text3);padding:8px 0">進行中の産卵セットはありません</div>`}
        ${activePairs.length > 0 ? `<button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%" onclick="routeTo('pairing-list')">産卵セット一覧を見る →</button>` : ''}
      </div>

      <!-- ⑤ 有望個体エリア -->
      ${topWeight.length ? `
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between">
          <span>🏆 有望個体</span>
          <span style="font-size:.72rem;font-weight:400;color:var(--text3)">${withWeight.length}頭計測済み</span>
        </div>
        ${over170.length ? `<div style="background:rgba(202,164,48,.1);border:1px solid rgba(202,164,48,.3);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:.82rem;color:var(--gold);font-weight:700">🏅 170g超え ${over170.length}頭</div>` : ''}
        ${over150.length ? `<div style="font-size:.75rem;color:var(--green);margin-bottom:6px">150g超え ${over150.length}頭</div>` : ''}
        ${topWeight.map((ind,i) => {
          const ageObj = Store.calcAge(ind.hatch_date);
          return `<div onclick="routeTo('ind-detail',{indId:'${ind.ind_id}'})" style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer">
            <span style="font-size:.78rem;color:var(--text3);min-width:18px">${i+1}</span>
            <div style="flex:1">
              <div style="font-family:var(--font-mono);font-size:.8rem;color:var(--gold)">${ind.display_id}</div>
              <div style="font-size:.7rem;color:var(--text3)">${ind.sex||'?'} ${ageObj?ageObj.days+'日':'—'} ${ind.current_stage||''}</div>
            </div>
            <div style="font-size:1rem;font-weight:700;color:${+ind.latest_weight_g>=170?'var(--gold)':+ind.latest_weight_g>=150?'var(--green)':'var(--text1)'}">${ind.latest_weight_g}g</div>
          </div>`;
        }).join('')}
        <button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%" onclick="routeTo('ind-list')">個体一覧を見る →</button>
      </div>` : ''}

      <!-- ⑥ ライン分析サマリー -->
      ${lineRank.length ? `
      <div class="card">
        <div class="card-title">📊 ライン平均体重 TOP${lineRank.length}</div>
        ${lineRank.map((ls,i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:.78rem;color:var(--text3);min-width:18px">${i+1}</span>
            <div style="flex:1">
              <div style="font-size:.83rem;font-weight:600">${ls.label}</div>
              <div style="font-size:.7rem;color:var(--text3)">${ls.alive}頭飼育中 / 計測${ls.weights.length}頭</div>
            </div>
            <div style="font-size:1rem;font-weight:700;color:var(--green)">${ls.avg}g</div>
          </div>`).join('')}
      </div>` : ''}

      <div style="text-align:center;padding:12px 0;font-size:.72rem;color:var(--text3)">
        HerculesOS v1.0.0 — Phase 2
      </div>
    </div>`;
}

function _dashHeader() {
  const now    = new Date();
  const greet  = now.getHours() < 12 ? 'おはようございます' :
                 now.getHours() < 18 ? 'こんにちは' : 'おつかれさまです';
  return `<header class="page-header" style="justify-content:space-between">
    <div style="font-size:.85rem;color:var(--text2)">${greet}</div>
    <div style="font-family:var(--font-mono);font-size:.75rem;color:var(--gold)">HerculesOS</div>
    <button class="btn-icon" onclick="syncAll()">🔄</button>
  </header>`;
}

window.PAGES = window.PAGES || {};
window.PAGES['dashboard'] = () => Pages.dashboard();
