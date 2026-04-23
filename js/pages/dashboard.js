// ════════════════════════════════════════════════════════════════
// dashboard.js  v4 — Phase6 交換アラート新仕様対応
// build: 20260423p
// 変更点:
//   - [20260423p] 今日のタスクに「成虫サイズ計測リマインド」追加 (Phase 1-C)
//     羽化後21日超の未計測個体を yellow タスク、30日超を red タスクとして表示
//     タップで ind-list に eclosionReminder フィルタ付き遷移
//   - [20260420b] ページ先頭に未確定セッションバナー追加
//   - [20260418a] Step2 ③ 性別集計サマリーカード追加
// ════════════════════════════════════════════════════════════════
'use strict';

console.log('[HerculesOS] dashboard.js v20260423w loaded');

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

  const _TERMINAL = new Set(['sold', 'dead', 'excluded']);
  const alive    = inds.filter(i => !_TERMINAL.has(i.status));
  const actLot   = lots.filter(l => l.status === 'active');
  const today    = new Date(); today.setHours(0, 0, 0, 0);

  // config.js から設定を取得（Phase6共通関数）
  const settings = (Store.getSettings ? Store.getSettings() : null) || {};

  // ────────────────────────────────────────────────
  // 1. 今日のタスク計算
  // ────────────────────────────────────────────────
  const exchDays  = parseInt(Store.getSetting('pairing_set_exchange_days') || '7', 10);
  const activePairs = pairings.filter(p => p.status === 'active' && (p.set_start || p.pairing_start));

  function _pairDue(p) {
    const base = p.set_start || p.pairing_start;
    const pts  = String(base).split(/[\/\-]/);
    if (pts.length < 3) return null;
    const d = new Date(+pts[0], +pts[1] - 1, +pts[2]);
    d.setDate(d.getDate() + exchDays);
    return d;
  }

  const tasks = { red: [], yellow: [], green: [] };

  // 産卵セット交換
  activePairs.forEach(p => {
    const due  = _pairDue(p);
    if (!due) return;
    const diff  = Math.floor((due - today) / 86400000);
    const label = p.set_name || p.display_id;
    if (diff < 0)   tasks.red.push({ icon: '🥚', text: `${label} セット交換 ${Math.abs(diff)}日超過`, fn: `routeTo('pairing-detail',{pairingId:'${p.set_id}'})` });
    else if (diff === 0) tasks.red.push({ icon: '🔔', text: `${label} 今日セット交換日`, fn: `routeTo('pairing-detail',{pairingId:'${p.set_id}'})` });
    else if (diff <= 2)  tasks.yellow.push({ icon: '📅', text: `${label} セット交換まで${diff}日`, fn: `routeTo('pairing-detail',{pairingId:'${p.set_id}'})` });
  });

  // 種親ペアリング可能判定
  const maleWait   = parseInt(Store.getSetting('male_pairing_wait_days')   || '14', 10);
  const femaleWait = parseInt(Store.getSetting('female_pairing_wait_days') || '14', 10);
  parents.filter(p => p.status === 'active' && p.feeding_start_date).forEach(p => {
    const wait = p.sex === '♂' ? maleWait : femaleWait;
    const fpts = String(p.feeding_start_date).split(/[\/\-]/);
    if (fpts.length < 3) return;
    const readyDate = new Date(+fpts[0], +fpts[1] - 1, +fpts[2]);
    readyDate.setDate(readyDate.getDate() + wait);
    const diff = Math.floor((readyDate - today) / 86400000);
    if (diff <= 0)  tasks.green.push({ icon: '💕', text: `${p.display_name} ペアリング可能`, fn: `routeTo('parent-detail',{parId:'${p.par_id}'})` });
    else if (diff <= 7) tasks.yellow.push({ icon: '⏳', text: `${p.display_name} ペアリングまで${diff}日`, fn: `routeTo('parent-detail',{parId:'${p.par_id}'})` });
  });

  // 再ペアリング予定
  const phAll = Store.getDB('pairing_histories') || [];
  phAll.filter(h => h.status === 'planned' && h.planned_date).forEach(h => {
    const parts = String(h.planned_date).replace(/-/g, '/').split('/');
    if (parts.length < 3) return;
    const planDate = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    const diff = Math.floor((planDate - today) / 86400000);
    const male   = (Store.getDB('parents') || []).find(p => p.par_id === h.male_parent_id);
    const female = (Store.getDB('parents') || []).find(p => p.par_id === h.female_parent_id);
    const label  = (male ? (male.parent_display_id || male.display_name) : h.male_parent_id)
                 + ' × '
                 + (female ? (female.parent_display_id || female.display_name) : h.female_parent_id);
    const parId  = h.male_parent_id || '';
    if (diff < 0) tasks.red.push({ icon: '💕', text: `${label} 再ペアリング期限超過(${Math.abs(diff)}日)`, fn: `routeTo('parent-detail',{parId:'${parId}'})` });
    else if (diff === 0) tasks.red.push({ icon: '💕', text: `${label} 今日再ペアリング予定`, fn: `routeTo('parent-detail',{parId:'${parId}'})` });
    else if (diff <= 3)  tasks.yellow.push({ icon: '💕', text: `${label} 再ペアリングまで${diff}日`, fn: `routeTo('parent-detail',{parId:'${parId}'})` });
  });

  const over150 = alive.filter(i => +i.latest_weight_g >= 150);
  if (over150.length) tasks.green.push({ icon: '🏆', text: `150g超え ${over150.length}頭`, fn: "routeTo('ind-list')" });

  // [20260423p] 羽化後リマインド (Phase 1-C)
  //   羽化日あり + adult_size_mm 未記録 で 21日超: yellow、30日超: red
  const eclosionNotMeasured = alive.filter(i => {
    if (!i.eclosion_date) return false;
    if (+i.adult_size_mm > 0) return false;
    if (i.status === 'dead' || i.status === 'sold') return false;
    return true;
  });
  let reminderRed = 0, reminderYellow = 0;
  const _tod = new Date(); _tod.setHours(0,0,0,0);
  eclosionNotMeasured.forEach(i => {
    try {
      const p = String(i.eclosion_date).replace(/\//g,'-').split('-');
      if (p.length < 3) return;
      const eclD = new Date(+p[0], +p[1]-1, +p[2]);
      const d = Math.round((_tod - eclD) / 86400000);
      if (d >= 30) reminderRed++;
      else if (d >= 21) reminderYellow++;
    } catch(e) {}
  });
  if (reminderRed > 0) {
    tasks.red.push({
      icon: '📏',
      text: `成虫サイズ計測 ${reminderRed}頭 (羽化後30日超)`,
      fn: `routeTo('ind-list',{eclosionReminder:'red'})`,
    });
  }
  if (reminderYellow > 0) {
    tasks.yellow.push({
      icon: '📏',
      text: `成虫サイズ未計測 ${reminderYellow}頭 (羽化後21日超)`,
      fn: `routeTo('ind-list',{eclosionReminder:'yellow'})`,
    });
  }

  // カテゴリ別集計
  const catEgg     = [...tasks.red, ...tasks.yellow].filter(t => t.fn.includes('pairing-detail'));
  const catPairing = [...tasks.red, ...tasks.yellow, ...tasks.green].filter(t => t.fn.includes('parent-detail'));

  // ── Phase6: ロット交換アラート（新仕様）─────────────────────
  // 残り日数 > 7日 → 通常 / 前後7日以内 → 注意🟡 / 8日以上超過 → 警告🔴
  const lotWarning = [];  // 🔴
  const lotCaution = [];  // 🟡
  // 計算方式をバッジ表示用に取得
  const exchangeMode = (settings && settings.mat_exchange_mode) || 'normal';

  actLot.forEach(lot => {
    const matType    = lot.mat_type || '';
    const stageCode  = lot.stage_life || lot.stage || '';
    // 設定方式に応じて計算（hybrid時はステージ・頭数補正あり）
    const exDays     = (typeof getExchangeDays === 'function')
      ? getExchangeDays(matType, settings, stageCode, lot.count) : 60;
    if (exDays === 0) return;
    const lastChange = lot.mat_changed_at || '';
    const override   = lot.next_change_override_date || '';
    const alert      = (typeof calcExchangeAlert === 'function')
      ? calcExchangeAlert(lastChange, exDays, override, settings) : null;
    if (!alert || alert.level === 'normal' || alert.level === 'none') return;
    const line     = Store.getLine(lot.line_id);
    const lineCode = line ? (line.line_code || line.display_id) : '';
    const isMatMolt = lot.mat_molt === true || lot.mat_molt === 'true';
    const matDisp   = (typeof matLabel === 'function') ? matLabel(lot.mat_type || '', isMatMolt) : (lot.mat_type || '—');
    const stageDisp = lot.stage_life ? stageLabel(lot.stage_life) : (lot.stage || '—');
    const entry = { lot, lineCode, alert, matDisp, stageDisp };
    if (alert.level === 'warning') lotWarning.push(entry);
    else                           lotCaution.push(entry);
  });
  const matDue = [...lotWarning, ...lotCaution];

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
    const d = new Date(+pts[0], +pts[1] - 1, +pts[2]);
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
  const topWeight  = [...withWeight].sort((a, b) => +b.latest_weight_g - +a.latest_weight_g).slice(0, 5);
  const over170    = alive.filter(i => +i.latest_weight_g >= 170);

  // ────────────────────────────────────────────────
  // 6. ライン分析
  // ────────────────────────────────────────────────
  const lineStats = {};
  lines.forEach(l => { lineStats[l.line_id] = { label: l.display_id, weights: [], alive: 0, dead: 0 }; });
  inds.forEach(i => {
    if (!lineStats[i.line_id]) return;
    if (!_TERMINAL.has(i.status)) { lineStats[i.line_id].alive++; if (i.latest_weight_g) lineStats[i.line_id].weights.push(+i.latest_weight_g); }
    if (i.status === 'dead') lineStats[i.line_id].dead++;
  });
  const lineRank = Object.values(lineStats)
    .filter(s => s.weights.length > 0)
    .map(s => ({ ...s, avg: Math.round(s.weights.reduce((a, b) => a + b, 0) / s.weights.length * 10) / 10 }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);

  const gasUrl = Store.getSetting('gas_url') || CONFIG.GAS_URL;

  main.innerHTML = `
    ${_dashHeader()}
    <div class="page-body">

      <!-- [20260420b] 未確定セッション通知バナー -->
      ${UI.pendingBanner ? UI.pendingBanner() : ''}

      ${!gasUrl ? `<div class="card" style="border-color:rgba(224,144,64,.4);background:rgba(224,144,64,.07)">
        <div style="font-size:.85rem;color:var(--amber)">
          ⚠️ GAS URLが未設定です。
          <span style="color:var(--blue);cursor:pointer" onclick="routeTo('settings')">設定画面へ</span>
        </div></div>` : ''}

      <!-- ① 今日のタスク -->
      <div class="card" style="border-color:rgba(231,76,60,.25)">
        <div class="card-title" style="margin-bottom:8px">📋 今日のタスク</div>
        ${(tasks.red.length || tasks.yellow.length) ? `
          <div>
            ${tasks.red.map(t => `
              <div class="task-row-red" onclick="${t.fn}">
                <span style="font-size:1.1rem">${t.icon}</span>
                <span class="task-row-text">${t.text}</span>
                <span style="color:var(--red);font-size:.8rem">›</span>
              </div>`).join('')}
            ${tasks.yellow.map(t => `
              <div class="task-row-yellow" onclick="${t.fn}">
                <span style="font-size:1.1rem">${t.icon}</span>
                <span class="task-row-text">${t.text}</span>
                <span style="color:var(--amber);font-size:.8rem">›</span>
              </div>`).join('')}
            ${tasks.green.slice(0, 3).map(t => `
              <div class="task-row-green" onclick="${t.fn}">
                <span style="font-size:1.1rem">${t.icon}</span>
                <span class="task-row-text">${t.text}</span>
                <span style="color:var(--green);font-size:.8rem">›</span>
              </div>`).join('')}
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
        <button onclick="routeTo('egg-lot-bulk')" style="padding:16px 8px;border:none;border-radius:14px;background:linear-gradient(135deg,rgba(155,89,182,.85),rgba(187,143,206,.8));color:#fff;cursor:pointer;text-align:center;box-shadow:0 3px 12px rgba(155,89,182,.3)">
          <div style="font-size:1.6rem;margin-bottom:3px">🥚</div>
          <div style="font-weight:700;font-size:.88rem">卵ロット一括</div>
        </button>
        <button onclick="routeTo('label-gen')" style="padding:16px 8px;border:none;border-radius:14px;background:linear-gradient(135deg,rgba(202,164,48,.85),rgba(212,181,100,.8));color:#fff;cursor:pointer;text-align:center;box-shadow:0 3px 12px rgba(202,164,48,.3)">
          <div style="font-size:1.6rem;margin-bottom:3px">🏷️</div>
          <div style="font-weight:700;font-size:.88rem">ラベル発行</div>
        </button>
      </div>

      <!-- ③ カテゴリ（タスク集計） -->
      ${(catEgg.length || catPairing.length || matDue.length) ? `
      <div class="card">
        <div class="card-title" style="margin-bottom:8px">📂 カテゴリ</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${catEgg.length ? `
          <div onclick="routeTo('pairing-list')"
            style="display:flex;justify-content:space-between;align-items:center;
              padding:11px 13px;background:rgba(231,76,60,.07);border-radius:9px;cursor:pointer;
              border:1px solid rgba(231,76,60,.18)">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:1.2rem">🥚</span>
              <span style="font-size:.88rem;font-weight:600">採卵・セット交換</span>
            </div>
            <span style="font-size:1.2rem;font-weight:800;color:var(--red)">${catEgg.length}件 ›</span>
          </div>` : ''}
          ${catPairing.length ? `
          <div onclick="routeTo('parent-list')"
            style="display:flex;justify-content:space-between;align-items:center;
              padding:11px 13px;background:rgba(255,193,7,.07);border-radius:9px;cursor:pointer;
              border:1px solid rgba(255,193,7,.18)">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:1.2rem">💕</span>
              <span style="font-size:.88rem;font-weight:600">ペアリング</span>
            </div>
            <span style="font-size:1.2rem;font-weight:800;color:var(--amber)">${catPairing.length}件 ›</span>
          </div>` : ''}
          ${matDue.length ? `
          <div onclick="routeTo('lot-list')"
            style="display:flex;justify-content:space-between;align-items:center;
              padding:11px 13px;background:rgba(52,152,219,.07);border-radius:9px;cursor:pointer;
              border:1px solid rgba(52,152,219,.18)">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:1.2rem">🌱</span>
              <div>
                <div style="font-size:.88rem;font-weight:600">マット交換目安</div>
                <div style="font-size:.68rem;color:var(--text3)">
                  🔴 ${lotWarning.length}件 / 🟡 ${lotCaution.length}件
                </div>
              </div>
            </div>
            <span style="font-size:1.2rem;font-weight:800;color:var(--blue)">${matDue.length}件 ›</span>
          </div>` : ''}
        </div>
      </div>` : ''}

      <!-- KPIバー -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        ${[
          { val: alive.length, sub: `♂${alive.filter(i => i.sex === '♂').length}/♀${alive.filter(i => i.sex === '♀').length}`, label: '飼育個体数', fn: "routeTo('ind-list')" },
          { val: actLot.length, sub: `総頭数 ${actLot.reduce((s, l) => s + (+l.count || 0), 0)}頭`, label: '管理中ロット', fn: "routeTo('lot-list')" },
          { val: alive.filter(i => String(i.guinness_flag) === 'true').length, sub: `${lines.length}ライン`, label: 'ギネス候補🏆', fn: "routeTo('ind-list')" },
          { val: topWeight[0] ? topWeight[0].latest_weight_g + 'g' : '—', sub: topWeight[0] ? topWeight[0].display_id : '—', label: '最高体重', fn: "routeTo('ind-list')" },
        ].map(k => `<div class="kpi-card" onclick="${k.fn}" style="cursor:pointer">
          <div class="kpi-value">${k.val}</div>
          <div style="font-size:.6rem;color:var(--text3);margin-bottom:1px">${k.sub}</div>
          <div class="kpi-label">${k.label}</div>
        </div>`).join('')}
      </div>

      <!-- 性別集計サマリー（Step2 ③ 20260418a）-->
      ${_dashSexStatsCard()}

      <!-- ⑤ ロット交換アラート一覧（Phase6新規） -->
      ${matDue.length ? `
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span>🌱 マット交換アラート</span>
          <span style="font-size:.68rem;color:var(--text3)">${exchangeMode === 'hybrid' ? 'ハイブリッド補正中' : 'マット基準'}</span>
        </div>
        ${[...lotWarning, ...lotCaution].slice(0, 8).map(entry => {
          const al  = entry.alert;
          const icoColor = al.level === 'warning' ? 'var(--red)' : 'var(--amber)';
          const ico      = al.level === 'warning' ? '🔴' : '🟡';
          const daysText = al.daysLeft < 0
            ? `${Math.abs(al.daysLeft)}日超過`
            : al.daysLeft === 0 ? '今日' : `残${al.daysLeft}日`;
          return `<div onclick="routeTo('lot-detail',{lotId:'${entry.lot.lot_id}'})"
            style="display:flex;align-items:center;gap:8px;padding:8px 0;
              border-bottom:1px solid var(--border);cursor:pointer">
            <span style="font-size:.9rem">${ico}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:.82rem;font-weight:600;color:var(--text1)">${entry.lot.display_id}</div>
              <div style="font-size:.7rem;color:var(--text3)">
                ${entry.stageDisp} / ${entry.matDisp}
                ${entry.lot.mat_changed_at ? '/ 交換: ' + entry.lot.mat_changed_at : ''}
                ${entry.lot.next_change_override_date ? '/ 延長中' : ''}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:.78rem;font-weight:700;color:${icoColor}">${daysText}</div>
              ${al.nextDate ? `<div style="font-size:.65rem;color:var(--text3)">${al.nextDate}</div>` : ''}
            </div>
          </div>`;
        }).join('')}
        ${matDue.length > 8 ? `<div style="font-size:.72rem;color:var(--text3);padding:6px 0">+${matDue.length - 8}件</div>` : ''}
        <button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%" onclick="routeTo('lot-list')">ロット一覧を見る →</button>
      </div>` : ''}

      <!-- ④ 種親・ペアリング状況 -->
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between">
          <span>🦋 種親・ペアリング状況</span>
          <span style="font-size:.72rem;font-weight:400;color:var(--text3)">♂${males.length} / ♀${females.length}</span>
        </div>
        ${readyToday.length ? `
          <div style="margin-bottom:8px">
            <div style="font-size:.72rem;color:var(--green);font-weight:700;margin-bottom:4px">✅ ペアリング可能（今日〜）</div>
            ${readyToday.map(p => `
              <div onclick="routeTo('parent-detail',{parId:'${p.par_id}'})" style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;border-bottom:1px solid var(--border)">
                <span style="font-size:.85rem">${p.sex}</span>
                <span style="flex:1;font-size:.82rem;font-weight:600">${p.display_name}${p.size_mm ? ' ' + p.size_mm + 'mm' : ''}</span>
                <span style="font-size:.7rem;color:var(--green)">可能 ›</span>
              </div>`).join('')}
          </div>` : ''}
        ${readySoon.length ? `
          <div style="margin-bottom:8px">
            <div style="font-size:.72rem;color:var(--amber);font-weight:700;margin-bottom:4px">⏳ 7日以内にペアリング可能</div>
            ${readySoon.map(p => { const d = _parentReadyDiff(p); return `
              <div onclick="routeTo('parent-detail',{parId:'${p.par_id}'})" style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;border-bottom:1px solid var(--border)">
                <span style="font-size:.85rem">${p.sex}</span>
                <span style="flex:1;font-size:.82rem">${p.display_name}${p.size_mm ? ' ' + p.size_mm + 'mm' : ''}</span>
                <span style="font-size:.7rem;color:var(--amber)">あと${d}日 ›</span>
              </div>`; }).join('')}
          </div>` : ''}
        ${noFeeding.length ? `
          <div>
            <div style="font-size:.72rem;color:var(--text3);font-weight:700;margin-bottom:4px">⚠️ 後食開始日未設定 (${noFeeding.length}頭)</div>
            ${noFeeding.slice(0, 3).map(p => `
              <div onclick="routeTo('parent-detail',{parId:'${p.par_id}'})" style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;border-bottom:1px solid var(--border)">
                <span style="font-size:.85rem">${p.sex}</span>
                <span style="flex:1;font-size:.82rem;color:var(--text2)">${p.display_name}${p.size_mm ? ' ' + p.size_mm + 'mm' : ''}</span>
                <span style="font-size:.7rem;color:var(--blue)">設定 ›</span>
              </div>`).join('')}
            ${noFeeding.length > 3 ? `<div style="font-size:.72rem;color:var(--text3);padding:4px 0">+${noFeeding.length - 3}頭</div>` : ''}
          </div>` : ''}
        ${!readyToday.length && !readySoon.length && !noFeeding.length ? `<div style="font-size:.82rem;color:var(--text3);padding:8px 0">種親データがありません</div>` : ''}
        <button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%" onclick="routeTo('parent-list')">種親一覧を見る →</button>
      </div>

      <!-- ⑥ 産卵セット状況 -->
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between">
          <span>🥚 産卵セット状況</span>
          <span style="font-size:.72rem;font-weight:400;color:var(--text3)">${activePairs.length}セット進行中</span>
        </div>
        ${Object.keys(pairByLine).length ? Object.values(pairByLine).map(ls => {
          const rate = ls.eggs > 0 ? Math.round(ls.hatch / ls.eggs * 1000) / 10 : null;
          let exchTag = '';
          ls.pairs.forEach(p => {
            const due = _pairDue(p);
            if (!due) return;
            const diff = Math.floor((due - today) / 86400000);
            if (diff < 0)        exchTag = `<span style="font-size:.65rem;color:var(--red);font-weight:700">期限超過${Math.abs(diff)}日</span>`;
            else if (diff === 0) exchTag = `<span style="font-size:.65rem;color:var(--red);font-weight:700">今日交換</span>`;
            else if (diff === 1) exchTag = `<span style="font-size:.65rem;color:var(--amber);font-weight:700">明日交換</span>`;
            else if (diff <= 3)  exchTag = `<span style="font-size:.65rem;color:var(--amber)">交換まで${diff}日</span>`;
          });
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="routeTo('pairing-list')">
            <div>
              <div style="font-size:.83rem;font-weight:600">${ls.label}</div>
              <div style="font-size:.72rem;color:var(--text3);margin-top:1px">採卵${ls.eggs}個 / 孵化${ls.hatch}頭 ${rate !== null ? '/ 孵化率' + rate + '%' : ''}</div>
            </div>
            ${exchTag}
          </div>`;
        }).join('') : `<div style="font-size:.82rem;color:var(--text3);padding:8px 0">進行中の産卵セットはありません</div>`}
        ${activePairs.length > 0 ? `<button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%" onclick="routeTo('pairing-list')">産卵セット一覧を見る →</button>` : ''}
      </div>

      <!-- ⑦ 有望個体エリア -->
      ${topWeight.length ? `
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between">
          <span>🏆 有望個体</span>
          <span style="font-size:.72rem;font-weight:400;color:var(--text3)">${withWeight.length}頭計測済み</span>
        </div>
        ${over170.length ? `<div style="background:rgba(202,164,48,.1);border:1px solid rgba(202,164,48,.3);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:.82rem;color:var(--gold);font-weight:700">🏅 170g超え ${over170.length}頭</div>` : ''}
        ${over150.length ? `<div style="font-size:.75rem;color:var(--green);margin-bottom:6px">150g超え ${over150.length}頭</div>` : ''}
        ${topWeight.map((ind, i) => {
          const ageObj = Store.calcAge(ind.hatch_date);
          const stageDisp = ind.stage_life ? stageLabel(ind.stage_life) : (ind.current_stage || '');
          return `<div onclick="routeTo('ind-detail',{indId:'${ind.ind_id}'})" style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer">
            <span style="font-size:.78rem;color:var(--text3);min-width:18px">${i + 1}</span>
            <div style="flex:1">
              <div style="font-family:var(--font-mono);font-size:.8rem;color:var(--gold)">${ind.display_id}</div>
              <div style="font-size:.7rem;color:var(--text3)">${ind.sex || '?'} ${ageObj ? ageObj.days + '日' : '—'} ${stageDisp}</div>
            </div>
            <div style="font-size:1rem;font-weight:700;color:${+ind.latest_weight_g >= 170 ? 'var(--gold)' : +ind.latest_weight_g >= 150 ? 'var(--green)' : 'var(--text1)'}">${ind.latest_weight_g}g</div>
          </div>`;
        }).join('')}
        <button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%" onclick="routeTo('ind-list')">個体一覧を見る →</button>
      </div>` : ''}

      <!-- ⑧ ライン分析サマリー -->
      ${lineRank.length ? `
      <div class="card">
        <div class="card-title">📊 ライン平均体重 TOP${lineRank.length}</div>
        ${lineRank.map((ls, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:.78rem;color:var(--text3);min-width:18px">${i + 1}</span>
            <div style="flex:1">
              <div style="font-size:.83rem;font-weight:600">${ls.label}</div>
              <div style="font-size:.7rem;color:var(--text3)">${ls.alive}頭飼育中 / 計測${ls.weights.length}頭</div>
            </div>
            <div style="font-size:1rem;font-weight:700;color:var(--green)">${ls.avg}g</div>
          </div>`).join('')}
      </div>` : ''}

      <div style="text-align:center;padding:12px 0;font-size:.72rem;color:var(--text3)">
        HerculesOS v1.1.0 — Phase 6
      </div>
    </div>`;
}

// ── 性別集計サマリー（Step2 ③ 20260418a）─────────────────────
// Store.getSexStats() の結果を種親/個体/ユニット別の3x3テーブルで表示。
// 飼育中判定の詳細は Store.getSexStats() 内のコメント参照。
function _dashSexStatsCard() {
  if (typeof Store.getSexStats !== 'function') return '';
  let s;
  try { s = Store.getSexStats(); } catch (e) { console.warn('[dashboard] getSexStats error:', e); return ''; }
  if (!s || !s.total) return '';

  const maleCol    = 'var(--male,#5ba8e8)';
  const femaleCol  = 'var(--female,#e87fa0)';
  const unknownCol = 'var(--text3)';

  const cell = (v, col, bold) =>
    `<td style="text-align:right;padding:6px 8px;font-family:var(--font-mono);${bold?'font-weight:700;':''}color:${col}">${v}</td>`;

  const rows = [
    { label: '種親',    male: s.parents.male,     female: s.parents.female,     unknown: null },
    { label: `個体`,    male: s.individuals.male, female: s.individuals.female, unknown: s.individuals.unknown },
    { label: `ユニット（${s.units.unitCount}U）`, male: s.units.male, female: s.units.female, unknown: s.units.unknown },
  ];

  const grandTotal = s.total.male + s.total.female + s.total.unknown;
  if (grandTotal === 0) return ''; // 全部ゼロなら非表示

  return `
    <div class="card" onclick="routeTo('ind-list')" style="cursor:pointer">
      <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>👥 性別集計（飼育中）</span>
        <span style="font-size:.7rem;font-weight:400;color:var(--text3)">合計 ${grandTotal}</span>
      </div>
      <table style="width:100%;font-size:.82rem;border-collapse:collapse;margin-top:4px">
        <thead>
          <tr>
            <th style="text-align:left;font-weight:500;color:var(--text3);padding:4px 8px"></th>
            <th style="text-align:right;padding:4px 8px;color:${maleCol};font-weight:700">♂</th>
            <th style="text-align:right;padding:4px 8px;color:${femaleCol};font-weight:700">♀</th>
            <th style="text-align:right;padding:4px 8px;color:${unknownCol};font-weight:500">不明</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr style="border-top:1px solid var(--border2)">
              <td style="padding:6px 8px;color:var(--text2)">${r.label}</td>
              ${cell(r.male,    maleCol,    false)}
              ${cell(r.female,  femaleCol,  false)}
              ${r.unknown === null
                ? `<td style="text-align:right;padding:6px 8px;color:var(--text3)">—</td>`
                : cell(r.unknown, unknownCol, false)}
            </tr>`).join('')}
          <tr style="border-top:2px solid var(--border)">
            <td style="padding:6px 8px;font-weight:700;color:var(--text1)">合計</td>
            ${cell(s.total.male,    maleCol,    true)}
            ${cell(s.total.female,  femaleCol,  true)}
            ${cell(s.total.unknown, unknownCol, true)}
          </tr>
        </tbody>
      </table>
    </div>`;
}

function _dashHeader() {
  const now   = new Date();
  const greet = now.getHours() < 12 ? 'おはようございます' :
                now.getHours() < 18 ? 'こんにちは' : 'おつかれさまです';
  return `<header class="page-header" style="justify-content:space-between">
    <div style="font-size:.85rem;color:var(--text2)">${greet}</div>
    <div style="font-family:var(--font-mono);font-size:.75rem;color:var(--gold)">HerculesOS</div>
    <button class="btn-icon" onclick="syncAll()">🔄</button>
  </header>`;
}

window.PAGES = window.PAGES || {};
window.PAGES['dashboard'] = () => Pages.dashboard();
