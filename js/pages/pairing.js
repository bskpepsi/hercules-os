// ════════════════════════════════════════════════════════════════
// pairing.js  ―  産卵セット管理  v2
// 改善: 採卵履歴カード形式・KPI・交換リマインド・ペアリング日名称
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 産卵セット一覧 ───────────────────────────────────────────────
Pages.pairingList = function () {
  const main = document.getElementById('main');
  let statusFilter = 'active';

  function render() {
    const all  = Store.getDB('pairings') || [];
    const list = statusFilter ? all.filter(p => p.status === statusFilter) : all;
    main.innerHTML = `
      ${UI.header('産卵セット', { action: { fn: "routeTo('pairing-new')", icon: '＋' } })}
      <div class="page-body">
        <div class="filter-bar">
          <button class="pill ${statusFilter==='active'    ? 'active' : ''}" onclick="Pages._pairSetStatus('active')">進行中</button>
          <button class="pill ${statusFilter==='completed' ? 'active' : ''}" onclick="Pages._pairSetStatus('completed')">完了</button>
          <button class="pill ${statusFilter==='failed'    ? 'active' : ''}" onclick="Pages._pairSetStatus('failed')">失敗</button>
          <button class="pill ${!statusFilter              ? 'active' : ''}" onclick="Pages._pairSetStatus('')">全て</button>
        </div>
        <div class="sec-hdr"><span class="sec-title">${list.length}セット</span></div>
        ${list.length ? list.map(_pairCardHTML).join('') : UI.empty('産卵セットがありません', '右上の＋から登録できます')}
      </div>`;
  }

  Pages._pairSetStatus = (s) => { statusFilter = s; render(); };
  render();
};

function _pairCardHTML(pair) {
  const f   = Store.getParent(pair.father_par_id);
  const m   = Store.getParent(pair.mother_par_id);
  const rate = pair.hatch_rate ? pair.hatch_rate + '%' : '—';
  const colMap = { active: 'var(--green)', completed: 'var(--blue)', failed: 'var(--red)' };
  const col  = colMap[pair.status] || 'var(--text3)';
  const badge = _exchangeBadgeHtml(pair);
  return `<div class="ind-card" onclick="routeTo('pairing-detail',{id:'${pair.set_id}'})">
    <div style="text-align:center;min-width:40px">
      <div style="font-size:1.3rem">🥚</div>
      <div style="font-size:.62rem;color:${col}">${pair.status||'—'}</div>
    </div>
    <div class="ind-card-body">
      <div class="ind-card-row">
        <span class="ind-card-id">${pair.display_id}</span>
        ${pair.set_name ? `<span style="font-size:.72rem;color:var(--text2)">${pair.set_name}</span>` : ''}
        ${badge}
      </div>
      <div style="font-size:.78rem;color:var(--text2)">${f?'♂ '+f.display_name:''} × ${m?'♀ '+m.display_name:''}</div>
      <div style="font-size:.72rem;color:var(--text3);margin-top:2px">
        卵: ${pair.total_eggs||0}個 / 孵化: ${pair.total_hatch||0}頭 / 孵化率: ${rate}
        ${pair.set_start ? ' / セット: ' + pair.set_start : ''}
      </div>
    </div>
    <div style="color:var(--text3);font-size:1.2rem">›</div>
  </div>`;
}

// ── セット交換リマインド 共通ヘルパー ───────────────────────────
function _calcExchangeDue(pair) {
  if (!pair.set_start || pair.status !== 'active') return null;
  const days  = parseInt(Store.getSetting('pairing_set_exchange_days') || '7', 10);
  const parts = String(pair.set_start).split(/[\/\-]/);
  if (parts.length < 3) return null;
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  d.setDate(d.getDate() + days);
  return d;
}

function _dayDiff(due) {
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.floor((due - today) / 86400000);
}

function _exchangeBadgeHtml(pair) {
  const due = _calcExchangeDue(pair);
  if (!due) return '';
  const diff = _dayDiff(due);
  if (diff < 0)  return `<span style="font-size:.63rem;background:rgba(231,76,60,.15);color:var(--red);padding:1px 7px;border-radius:10px;margin-left:4px">期限超過${Math.abs(diff)}日</span>`;
  if (diff === 0) return `<span style="font-size:.63rem;background:rgba(231,76,60,.15);color:var(--red);padding:1px 7px;border-radius:10px;margin-left:4px">今日交換</span>`;
  if (diff === 1) return `<span style="font-size:.63rem;background:rgba(224,144,64,.15);color:var(--amber);padding:1px 7px;border-radius:10px;margin-left:4px">明日交換</span>`;
  return '';
}

// ── 産卵セット詳細 ───────────────────────────────────────────────
Pages.pairingDetail = async function (setId) {
  const main = document.getElementById('main');

  // キャッシュがあれば即時表示（ちらつき防止）
  const cached = (Store.getDB('pairings') || []).find(p => p.set_id === setId);
  if (cached) _renderPairDetail(cached, null, main);
  else        main.innerHTML = UI.header('産卵セット', { back: true }) + UI.spinner();

  try {
    // getPairingWithEggs で1回のAPI呼び出しでセット情報＋採卵履歴を同時取得
    const res = await API.pairing.getWithEggs({ set_id: setId });
    if (Store.getPage() !== 'pairing-detail') return;
    _renderPairDetail(res.pairing, res.egg_records || [], main);
  } catch (e) {
    // getPairingWithEggs 未デプロイ時のフォールバック（旧2回呼び出し）
    try {
      const pairRes = await API.pairing.get(setId);
      if (Store.getPage() !== 'pairing-detail') return;
      const pair = pairRes.pairing;
      _renderPairDetail(pair, [], main);
      try {
        const eggRes = await API.pairing.getEggRecords({ set_id: setId });
        if (Store.getPage() !== 'pairing-detail') return;
        _renderPairDetail(pair, eggRes.egg_records || [], main);
      } catch (_) { /* 採卵履歴が取れなくても続行 */ }
    } catch (e2) {
      if (!cached) main.innerHTML = UI.header('エラー', { back: true }) +
        `<div class="page-body">${UI.empty('取得失敗: ' + e2.message)}</div>`;
    }
  }
};

function _renderPairDetail(pair, eggRecords, main) {
  const f   = Store.getParent(pair.father_par_id);
  const m   = Store.getParent(pair.mother_par_id);
  const bld = Store.getBloodline(pair.bloodline_id);

  // KPI
  const totalEggs  = pair.total_eggs  || 0;
  const totalHatch = pair.total_hatch || 0;
  const hatchRate  = totalEggs > 0 ? (Math.round(totalHatch/totalEggs*1000)/10)+'%' : '—';

  // 交換リマインドバナー
  const due = _calcExchangeDue(pair);
  const reminderBanner = _reminderBannerHtml(due);

  // 採卵履歴
  const eggHtml = _eggHistoryHtml(eggRecords, pair);

  main.innerHTML = `
    ${UI.header(pair.display_id, { back: true, action: { fn: `Pages._pairMenu('${pair.set_id}')`, icon: '…' } })}
    <div class="page-body">

      ${reminderBanner}

      <!-- KPI -->
      <div class="card card-gold">
        <div style="font-size:.95rem;font-weight:700;margin-bottom:10px">${pair.set_name || pair.display_id}</div>
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:1.4rem">${totalEggs}</div>
            <div class="kpi-label">採卵数</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:1.4rem">${totalHatch}</div>
            <div class="kpi-label">孵化数</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:1.4rem;color:var(--green)">${hatchRate}</div>
            <div class="kpi-label">孵化率</div>
          </div>
        </div>
      </div>

      <!-- アクション -->
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1"
          onclick="Pages._pairAddEggModal('${pair.set_id}')">🥚 採卵記録</button>
        <button class="btn btn-gold" style="flex:1"
          onclick="Pages._pairGoLotNew('${pair.line_id||''}','${pair.mother_par_id||''}')">🐛 ロット作成</button>
      </div>

      <!-- セット情報 -->
      <div class="card">
        <div class="card-title">セット情報</div>
        <div class="info-list">
          ${_prow('<span style="color:var(--male)">♂親</span>', f ? (() => {
            const fBld = f.bloodline_id ? (Store.getDB('bloodlines')||[]).find(b=>b.bloodline_id===f.bloodline_id) : null;
            const fBldStr = fBld ? (fBld.abbreviation||fBld.bloodline_name||'') : '';
            return `<span style="cursor:pointer;color:var(--male)" onclick="routeTo('parent-detail',{id:'${f.par_id}'})">
              ${f.display_name}${f.size_mm?' <strong>'+f.size_mm+'mm</strong>':''}
              ${fBldStr?'<span style="color:var(--text3);font-size:.78rem"> / '+fBldStr+'</span>':''}
            </span>`;
          })() : (pair.father_par_id||'—'))}
          ${_prow('<span style="color:var(--female)">♀親</span>', m ? (() => {
            const mBld = m.bloodline_id ? (Store.getDB('bloodlines')||[]).find(b=>b.bloodline_id===m.bloodline_id) : null;
            const mBldStr = mBld ? (mBld.abbreviation||mBld.bloodline_name||'') : '';
            return `<span style="cursor:pointer;color:var(--female)" onclick="routeTo('parent-detail',{id:'${m.par_id}'})">
              ${m.display_name}${m.size_mm?' <strong>'+m.size_mm+'mm</strong>':''}
              ${mBldStr?'<span style="color:var(--text3);font-size:.78rem"> / '+mBldStr+'</span>':''}
            </span>`;
          })() : (pair.mother_par_id||'—'))}
          ${bld ? _prow('血統', bld.abbreviation||bld.bloodline_name) : ''}
          ${_prow('ペアリング日', pair.pairing_start || '—')}
          ${_prow('セット開始',   pair.set_start    || '—')}
          ${pair.set_end   ? _prow('セット終了', pair.set_end)      : ''}
          ${pair.temp_c    ? _prow('温度',       pair.temp_c+'℃')  : ''}
          ${pair.mat_info  ? _prow('マット',     pair.mat_info)    : ''}
          ${pair.note      ? _prow('メモ',       pair.note)        : ''}
        </div>
      </div>

      <!-- ③ QRラベルボタン -->
      <button class="btn btn-ghost btn-full" style="margin-top:0"
        onclick="Pages._pairShowLabel('${pair.set_id}')">🏷 QR/ラベル発行</button>

      <!-- 採卵履歴 -->
      ${eggHtml}

      <!-- ステータス変更 -->
      <div style="display:flex;gap:8px;margin-top:4px">
        ${pair.status!=='completed' ? `<button class="btn btn-ghost btn-sm" onclick="Pages._pairComplete('${pair.set_id}')">✅ 完了</button>` : ''}
        ${pair.status!=='failed'    ? `<button class="btn btn-ghost btn-sm" onclick="Pages._pairFail('${pair.set_id}')">❌ 失敗</button>`    : ''}
      </div>
    </div>`;
}

function _prow(k, v) {
  return `<div class="info-row"><span class="info-key">${k}</span><span class="info-val">${v}</span></div>`;
}

// 交換リマインドバナー
function _reminderBannerHtml(due) {
  if (!due) return '';
  const diff   = _dayDiff(due);
  const dueStr = `${due.getFullYear()}/${String(due.getMonth()+1).padStart(2,'0')}/${String(due.getDate()).padStart(2,'0')}`;
  if (diff < 0)  return `<div style="background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.35);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-bottom:2px"><span style="font-size:1.3rem">⚠️</span><div><div style="font-size:.85rem;font-weight:700;color:var(--red)">セット交換 期限超過 ${Math.abs(diff)}日</div><div style="font-size:.72rem;color:var(--text3)">交換予定日: ${dueStr}</div></div></div>`;
  if (diff===0) return `<div style="background:rgba(231,76,60,.08);border:1px solid rgba(231,76,60,.3);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-bottom:2px"><span style="font-size:1.3rem">🔔</span><div><div style="font-size:.85rem;font-weight:700;color:var(--red)">今日がセット交換日です</div><div style="font-size:.72rem;color:var(--text3)">交換予定日: ${dueStr}</div></div></div>`;
  if (diff===1) return `<div style="background:rgba(224,144,64,.08);border:1px solid rgba(224,144,64,.3);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-bottom:2px"><span style="font-size:1.3rem">🔔</span><div><div style="font-size:.85rem;font-weight:700;color:var(--amber)">明日がセット交換日です</div><div style="font-size:.72rem;color:var(--text3)">交換予定日: ${dueStr}</div></div></div>`;
  if (diff<=3)  return `<div style="background:rgba(224,144,64,.05);border:1px solid rgba(224,144,64,.2);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-bottom:2px"><span style="font-size:1.3rem">📅</span><div><div style="font-size:.85rem;color:var(--amber)">セット交換まで <strong>${diff}日</strong></div><div style="font-size:.72rem;color:var(--text3)">交換予定日: ${dueStr}</div></div></div>`;
  return '';
}

// 採卵履歴カード
function _eggHistoryHtml(eggRecords, pair) {
  const title = `<div class="card-title" style="display:flex;justify-content:space-between;align-items:center">`;

  // EGG_RECORDSデータがある場合
  if (eggRecords && eggRecords.length > 0) {
    const sorted = [...eggRecords].sort((a,b) => String(a.collect_date).localeCompare(String(b.collect_date)));
    const sumEggs  = sorted.reduce((s,r)=>s+(parseInt(r.egg_count, 10)||0), 0);
    const sumHatch = sorted.reduce((s,r)=>s+(parseInt(r.hatch_count,10)||0), 0);
    const cards = sorted.map((rec, i) => {
      const e  = parseInt(rec.egg_count,  10) || 0;
      const h  = parseInt(rec.hatch_count,10) || 0;
      const rr = e > 0 ? Math.round(h/e*1000)/10+'%' : '—';
      return `<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:.78rem;font-weight:700;color:var(--green);background:rgba(45,122,82,.12);padding:2px 10px;border-radius:20px">${i+1}回目</span>
          <span style="font-size:.72rem;color:var(--text3)">孵化率 <strong style="color:var(--green)">${rr}</strong></span>
        </div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 14px;font-size:.82rem">
          ${rec.round_set_date ? `<span style="color:var(--text3)">セット日</span><span style="font-weight:500">${rec.round_set_date}</span>` : ''}
          <span style="color:var(--text3)">採卵日</span><span style="font-weight:500">${rec.collect_date||'—'}</span>
          <span style="color:var(--text3)">卵数</span><span style="font-weight:500">${e}個</span>
          <span style="color:var(--text3)">孵化数</span><span style="font-weight:500">${h}頭</span>
          ${rec.note ? `<span style="color:var(--text3)">メモ</span><span style="color:var(--text2)">${rec.note}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn btn-ghost btn-sm" style="flex:1;font-size:.75rem"
            onclick="Pages._pairEditOneEgg('${rec.egg_record_id}','${pair.set_id}')">✏️ 編集</button>
          <button class="btn btn-ghost btn-sm" style="flex:1;font-size:.75rem;color:var(--red)"
            onclick="Pages._pairDeleteEgg('${rec.egg_record_id}','${pair.set_id}')">🗑 削除</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="card">${title}<span>採卵履歴</span><span style="font-size:.72rem;font-weight:400;color:var(--text3)">${sorted.length}回 / 計${sumEggs}個 / 孵化${sumHatch}頭</span></div>${cards}</div>`;
  }

  // eggRecordsがnull＝まだ読み込み中（初期キャッシュ表示時のみ）
  if (eggRecords === null) {
    return `<div class="card"><div class="card-title">採卵履歴</div><div style="text-align:center;padding:16px;color:var(--text3);font-size:.85rem">読み込み中…</div></div>`;
  }

  // 旧データ（collect_datesのみ）フォールバック
  if (pair.collect_dates) {
    const dates = pair.collect_dates.split(',').map(d=>d.trim()).filter(Boolean)
      .sort((a,b)=>a.localeCompare(b));
    return `<div class="card">${title}<span>採卵履歴</span><span style="font-size:.72rem;font-weight:400;color:var(--text3)">旧データ</span></div>
      ${dates.map((d,i)=>`<div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;gap:10px;font-size:.85rem"><span style="color:var(--text3);min-width:38px">${i+1}回目</span><span>${d}</span></div>`).join('')}
    </div>`;
  }

  return `<div class="card">${title}<span>採卵履歴</span><span></span></div>${UI.empty('採卵記録がありません','採卵記録ボタンから追加できます')}</div>`;
}

// … メニュー
// グローバル経由でclosure問題を完全回避
window._pairMenuEdit = function(sid) { routeTo('pairing-new', { editId: sid }); };
window._pairMenuEgg  = function(sid) { Pages._pairEditEggModal(sid); };
window._pairMenuLabel= function(sid) { Pages._pairShowLabel(sid); };

Pages._pairMenu = function (setId) {
  const sid = String(setId);
  UI.actionSheet([
    { label: '✏️ セット情報を編集', fn: function(){ _pairMenuEdit(sid); } },
    { label: '📝 採卵履歴を編集',   fn: function(){ _pairMenuEgg(sid); } },
    { label: '🏷 ラベル/QR発行',    fn: function(){ _pairMenuLabel(sid); } },
  ]);
};

// ③ QRラベル表示
Pages._pairShowLabel = async function (setId) {
  try {
    const res = await API.label.generate('SET', setId, 'pairing');
    if (res && res.drive_url) {
      window.open(res.drive_url, '_blank');
    } else {
      UI.toast('ラベルを発行しました');
    }
  } catch(e) {
    UI.toast('ラベル発行失敗: ' + e.message, 'error');
  }
};

// ── 採卵記録モーダル ────────────────────────────────────────────
Pages._pairAddEggModal = function (setId) {
  const today = new Date().toISOString().split('T')[0];
  _showModal('採卵記録', `
    <div class="form-section">
      ${UI.field('今回のセット日（投入日）', `<input type="date" id="egg-set-date" class="input" value="${today}">`)}
      ${UI.field('採卵日',                  `<input type="date" id="egg-date"     class="input" value="${today}">`)}
      <div class="form-row-2">
        ${UI.field('採卵数',     `<input type="number" id="egg-count"   class="input" min="0" value="0">`)}
        ${UI.field('孵化確認数', `<input type="number" id="hatch-count" class="input" min="0" value="0">`)}
      </div>
      ${UI.field('メモ（任意）', `<input type="text" id="egg-note" class="input" placeholder="例: 材あり・26℃">`)}
      <div style="font-size:.75rem;color:var(--text3);margin-bottom:8px">孵化確認がまだの場合は0でOK</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" type="button" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" type="button" onclick="Pages._pairSaveEgg('${setId}')">記録する</button>
      </div>
    </div>`);
};

Pages._pairSaveEgg = async function (setId) {
  const setDate = (document.getElementById('egg-set-date')?.value || '').replace(/-/g,'/');
  const date    = (document.getElementById('egg-date')?.value     || '').replace(/-/g,'/');
  const eggs    = +document.getElementById('egg-count')?.value    || 0;
  const hatch   = +document.getElementById('hatch-count')?.value  || 0;
  const note    = document.getElementById('egg-note')?.value      || '';
  if (!date) { UI.toast('採卵日を入力してください', 'error'); return; }
  _closeModal();
  try {
    await apiCall(
      () => API.pairing.addEgg({ set_id: setId, round_set_date: setDate, collect_date: date, egg_count: eggs, hatch_count: hatch, note }),
      `採卵${eggs}個を記録しました`
    );
    Pages.pairingDetail(setId);
  } catch(e) {}
};


// ── 採卵履歴 1件編集モーダル ────────────────────────────────────
Pages._pairEditOneEgg = async function (eggRecordId, setId) {
  // ① まず既存データを取得してからモーダルを開く
  let rec = null;
  try {
    UI.loading(true);
    const res = await API.pairing.getEggRecords({ set_id: setId });
    rec = (res.egg_records || []).find(r => r.egg_record_id === eggRecordId) || null;
  } catch(e) {
    UI.toast('記録の取得に失敗しました: ' + e.message, 'error');
    return;
  } finally {
    UI.loading(false);
  }

  if (!rec) { UI.toast('記録が見つかりません', 'error'); return; }

  // ② 取得したデータで初期値を設定してモーダルを開く
  const toInput = d => d ? String(d).replace(/\//g, '-') : '';
  const setDate  = toInput(rec.round_set_date);
  const eggDate  = toInput(rec.collect_date);
  const eggCount = rec.egg_count   !== undefined ? rec.egg_count   : 0;
  const hatchCnt = rec.hatch_count !== undefined ? rec.hatch_count : 0;
  const note     = rec.note || '';

  _showModal('採卵履歴を編集', `
    <div class="form-section">
      ${UI.field('今回のセット日', `<input type="date" id="edit-egg-set-date" class="input" value="${setDate}">`)}
      ${UI.field('採卵日',         `<input type="date" id="edit-egg-date"     class="input" value="${eggDate}">`)}
      <div class="form-row-2">
        ${UI.field('採卵数',     `<input type="number" id="edit-egg-count"   class="input" min="0" value="${eggCount}">`)}
        ${UI.field('孵化確認数', `<input type="number" id="edit-hatch-count" class="input" min="0" value="${hatchCnt}">`)}
      </div>
      ${UI.field('メモ', `<input type="text" id="edit-egg-note" class="input" value="${note}">`)}
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2"
          onclick="Pages._pairSaveEditEgg('${eggRecordId}','${setId}')">保存</button>
      </div>
    </div>`);
};

Pages._pairSaveEditEgg = async function (eggRecordId, setId) {
  const setDate  = (document.getElementById('edit-egg-set-date')?.value || '').replace(/-/g,'/');
  const date     = (document.getElementById('edit-egg-date')?.value     || '').replace(/-/g,'/');
  const eggs     = +document.getElementById('edit-egg-count')?.value    || 0;
  const hatch    = +document.getElementById('edit-hatch-count')?.value  || 0;
  const note     = document.getElementById('edit-egg-note')?.value      || '';
  if (!date) { UI.toast('採卵日を入力してください', 'error'); return; }
  _closeModal();
  try {
    await apiCall(
      () => API.pairing.updateEgg({
        egg_record_id: eggRecordId,
        round_set_date: setDate,
        collect_date: date,
        egg_count: eggs,
        hatch_count: hatch,
        note,
      }),
      '採卵記録を更新しました'
    );
    Pages.pairingDetail(setId);
  } catch(e) {}
};

// ── 採卵履歴 1件削除 ────────────────────────────────────────────
Pages._pairDeleteEgg = async function (eggRecordId, setId) {
  if (!UI.confirm('この採卵記録を削除しますか？')) return;
  try {
    await apiCall(
      () => API.pairing.deleteEgg({ egg_record_id: eggRecordId }),
      '採卵記録を削除しました'
    );
    Pages.pairingDetail(setId);
  } catch(e) {}
};

// ── 採卵履歴一覧編集モーダル（メニューから） ────────────────────
Pages._pairEditEggModal = async function (setId) {
  try {
    const res = await API.pairing.getEggRecords({ set_id: setId });
    const records = (res.egg_records || []).sort(
      (a,b) => String(a.collect_date).localeCompare(String(b.collect_date))
    );
    if (!records.length) { UI.toast('採卵記録がありません', 'error'); return; }
    const listHtml = records.map((rec, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:.85rem;font-weight:600">${i+1}回目: ${rec.collect_date||'—'}</div>
          <div style="font-size:.75rem;color:var(--text3)">採卵${rec.egg_count||0}個 / 孵化${rec.hatch_count||0}頭</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" style="font-size:.75rem"
            onclick="_closeModal();Pages._pairEditOneEgg('${rec.egg_record_id}','${setId}')">✏️</button>
          <button class="btn btn-ghost btn-sm" style="font-size:.75rem;color:var(--red)"
            onclick="_closeModal();Pages._pairDeleteEgg('${rec.egg_record_id}','${setId}')">🗑</button>
        </div>
      </div>`).join('');
    _showModal('採卵履歴を編集', `
      <div style="max-height:60vh;overflow-y:auto">${listHtml}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">閉じる</button>
      </div>`);
  } catch(e) { UI.toast('取得失敗: ' + e.message, 'error'); }
};

Pages._pairComplete = async function (id) {
  if (!UI.confirm('完了にしますか？')) return;
  try { await apiCall(() => API.pairing.update({ set_id: id, status: 'completed' }), '完了にしました'); Pages.pairingDetail(id); } catch(e){}
};

Pages._pairFail = async function (id) {
  if (!UI.confirm('失敗として記録しますか？')) return;
  try { await apiCall(() => API.pairing.update({ set_id: id, status: 'failed' }), '失敗として記録しました'); Pages.pairingDetail(id); } catch(e){}
};

// ── 産卵セット登録・編集 ─────────────────────────────────────────
Pages.pairingNew = function (params = {}) {
  const main    = document.getElementById('main');
  const isEdit  = !!params.editId;
  const pair    = isEdit ? (Store.getDB('pairings')||[]).find(p=>p.set_id===params.editId) : null;
  const parents = Store.getDB('parents') || [];
  const males   = parents.filter(p => p.sex==='♂' && (!p.status||p.status==='active'));
  const females = parents.filter(p => p.sex==='♀' && (!p.status||p.status==='active'));
  const blds    = Store.getDB('bloodlines') || [];
  const v       = (f, d='') => pair ? (pair[f]!==undefined ? pair[f] : d) : d;
  const today   = new Date().toISOString().split('T')[0];

  main.innerHTML = `
    ${UI.header(isEdit ? '産卵セット編集' : '産卵セット登録', { back: true })}
    <div class="page-body">
      <form id="pair-form" class="form-section">
        <div class="form-title">ペアリング情報</div>
        ${UI.field('♂親（父）', UI.select('father_par_id', males.map(p=>({code:p.par_id,label:`${p.display_name}${p.size_mm?' '+p.size_mm+'mm':''}`})), v('father_par_id')), true)}
        ${UI.field('♀親（母）', UI.select('mother_par_id', females.map(p=>({code:p.par_id,label:`${p.display_name}${p.size_mm?' '+p.size_mm+'mm':''}`})), v('mother_par_id')), true)}
        ${UI.field('セット名（任意）', UI.input('set_name','text',v('set_name'),'例: 2025-A1ライン'))}
        ${UI.field('血統', UI.select('bloodline_id', blds.map(b=>({code:b.bloodline_id,label:b.abbreviation||b.bloodline_name})), v('bloodline_id')))}

        <div class="form-title">日付</div>
        <div class="form-row-2">
          ${UI.field('ペアリング日', UI.input('pairing_start','date',v('pairing_start')||today), true)}
          ${UI.field('セット開始日', UI.input('set_start','date',v('set_start')))}
        </div>
        <div class="form-row-2">
          ${UI.field('セット終了日', UI.input('set_end','date',v('set_end')))}
          <div></div>
        </div>

        <div class="form-title">環境</div>
        <div class="form-row-2">
          ${UI.field('温度(℃)',  UI.input('temp_c','number',v('temp_c','24'),'例: 24'))}
          ${UI.field('湿度(%)',  UI.input('humidity_pct','number',v('humidity_pct'),'例: 70'))}
        </div>
        ${UI.field('マット情報', UI.input('mat_info','text',v('mat_info'),'例: T0マット'))}
        ${UI.field('メモ', UI.textarea('note',v('note'),2,''))}

        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="button" class="btn btn-ghost" style="flex:1" onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2" onclick="Pages._pairSave('${isEdit?params.editId:''}')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>`;
};

Pages._pairSave = async function (editId) {
  const form = document.getElementById('pair-form');
  if (!form) return;
  const data = UI.collectForm(form);
  if (!data.father_par_id || !data.mother_par_id) { UI.toast('♂親と♀親を選択してください','error'); return; }
  if (!data.pairing_start) { UI.toast('ペアリング日を入力してください','error'); return; }
  ['pairing_start','set_start','set_end'].forEach(k => { if (data[k]) data[k]=data[k].replace(/-/g,'/'); });
  try {
    if (editId) {
      data.set_id = editId;
      await apiCall(() => API.pairing.update(data), '更新しました');
      await syncAll(true);
      routeTo('pairing-detail', { id: editId });
    } else {
      const res = await apiCall(() => API.pairing.create(data), '産卵セットを登録しました');
      await syncAll(true);
      // ライン自動生成の通知
      if (res.auto_line) {
        UI.toast('ライン ' + res.auto_line.display_id + ' を自動作成しました', 'success');
      }
      routeTo('pairing-detail', { id: res.set_id });
    }
  } catch(e) {}
};

Pages._pairGoLotNew = function (directLineId, motherParId) {
  let lineId = directLineId || '';
  if (!lineId && motherParId) {
    const matched = (Store.getDB('lines')||[]).find(l => l.mother_par_id === motherParId);
    if (matched) lineId = matched.line_id;
  }
  routeTo('lot-new', lineId ? { lineId } : {});
};

PAGES['pairing-list']   = () => Pages.pairingList();
PAGES['pairing-detail'] = () => Pages.pairingDetail(Store.getParams().id);
PAGES['pairing-new']    = () => Pages.pairingNew(Store.getParams());
