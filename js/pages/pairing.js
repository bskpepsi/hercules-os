// ════════════════════════════════════════════════════════════════
// pairing.js
// 役割: 産卵セットの一覧・詳細・登録・採卵記録追加を担う。
//       ペアリング → 産卵セット → 採卵 → 孵化 の流れを管理する。
//       孵化後は lot.js のロット登録へ導線を設ける。
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 産卵セット一覧 ───────────────────────────────────────────────
Pages.pairingList = function () {
  const main = document.getElementById('main');
  let statusFilter = 'active';

  function render() {
    const all  = Store.getDB('pairings') || [];
    const list = statusFilter
      ? all.filter(p => p.status === statusFilter)
      : all;

    main.innerHTML = `
      ${UI.header('産卵セット', { action: { fn: "routeTo('pairing-new')", icon: '＋' } })}
      <div class="page-body">
        <div class="filter-bar">
          <button class="pill ${statusFilter==='active'    ? 'active' : ''}"
            onclick="Pages._pairSetStatus('active')">進行中</button>
          <button class="pill ${statusFilter==='completed' ? 'active' : ''}"
            onclick="Pages._pairSetStatus('completed')">完了</button>
          <button class="pill ${statusFilter==='failed'    ? 'active' : ''}"
            onclick="Pages._pairSetStatus('failed')">失敗</button>
          <button class="pill ${!statusFilter ? 'active' : ''}"
            onclick="Pages._pairSetStatus('')">全て</button>
        </div>
        <div class="sec-hdr">
          <span class="sec-title">${list.length}セット</span>
        </div>
        ${list.length
          ? list.map(_pairCardHTML).join('')
          : UI.empty('産卵セットがありません', '右上の＋から登録できます')}
      </div>`;
  }

  Pages._pairSetStatus = (s) => { statusFilter = s; render(); };
  render();
};

function _pairCardHTML(pair) {
  const f = Store.getParent(pair.father_par_id);
  const m = Store.getParent(pair.mother_par_id);
  const rate = pair.hatch_rate ? pair.hatch_rate + '%' : '—';
  const statusColors = {
    active:    'var(--green)',
    completed: 'var(--blue)',
    failed:    'var(--red)',
  };
  const col = statusColors[pair.status] || 'var(--text3)';

  return `<div class="ind-card" onclick="routeTo('pairing-detail',{id:'${pair.set_id}'})">
    <div style="text-align:center;min-width:40px">
      <div style="font-size:1.3rem">🥚</div>
      <div style="font-size:.62rem;color:${col}">${pair.status || '—'}</div>
    </div>
    <div class="ind-card-body">
      <div class="ind-card-row">
        <span class="ind-card-id">${pair.display_id}</span>
        ${pair.set_name
          ? `<span style="font-size:.72rem;color:var(--text2)">${pair.set_name}</span>`
          : ''}
      </div>
      <div style="font-size:.78rem;color:var(--text2)">
        ${f ? '♂ ' + f.display_name : ''} × ${m ? '♀ ' + m.display_name : ''}
      </div>
      <div style="font-size:.72rem;color:var(--text3);margin-top:2px">
        卵: ${pair.total_eggs || 0}個 / 孵化: ${pair.total_hatch || 0}頭 / 孵化率: ${rate}
        ${pair.set_start ? ' / セット開始: ' + pair.set_start : ''}
      </div>
    </div>
    <div style="color:var(--text3);font-size:1.2rem">›</div>
  </div>`;
}

// ── 産卵セット詳細 ───────────────────────────────────────────────
Pages.pairingDetail = async function (setId) {
  const main = document.getElementById('main');
  let pair = Store.getDB('pairings')?.find(p => p.set_id === setId);
  if (pair) _renderPairDetail(pair, main);
  else main.innerHTML = UI.header('産卵セット', {}) + UI.spinner();
  try {
    const res = await API.pairing.get(setId);
    pair = res.pairing;
    _renderPairDetail(pair, main);
  } catch (e) {
    if (!pair) main.innerHTML = UI.header('エラー', {}) +
      `<div class="page-body">${UI.empty('取得失敗: ' + e.message)}</div>`;
  }
};

function _renderPairDetail(pair, main) {
  const f   = Store.getParent(pair.father_par_id);
  const m   = Store.getParent(pair.mother_par_id);
  const bld = Store.getBloodline(pair.bloodline_id);
  const rate= pair.hatch_rate ? pair.hatch_rate + '%' : '計算中';

  main.innerHTML = `
    ${UI.header(pair.display_id, {})}
    <div class="page-body">

      <!-- サマリーカード -->
      <div class="card card-gold">
        <div style="font-size:1rem;font-weight:700;margin-bottom:10px">
          ${pair.set_name || pair.display_id}
        </div>
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:1.4rem">${pair.total_eggs || 0}</div>
            <div class="kpi-label">採卵数</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:1.4rem">${pair.total_hatch || 0}</div>
            <div class="kpi-label">孵化数</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:1.4rem;color:var(--green)">${rate}</div>
            <div class="kpi-label">孵化率</div>
          </div>
        </div>
      </div>

      <!-- アクション -->
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1"
          onclick="Pages._pairAddEggModal('${pair.set_id}')">🥚 採卵記録</button>
        <button class="btn btn-gold" style="flex:1"
          onclick="Pages._pairGoLotNew('${pair.line_id || ''}','${pair.mother_par_id || ''}')">🐛 ロット作成</button>
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('pairing-new',{editId:'${pair.set_id}'})">✏️ 編集</button>
      </div>

      <!-- 基本情報 -->
      <div class="card">
        <div class="card-title">セット情報</div>
        <div class="info-list">
          ${_pairRow('♂親', f ? `<span style="cursor:pointer;color:var(--blue)"
            onclick="routeTo('parent-detail',{id:'${f.par_id}'})">${f.display_name}${f.size_mm?' '+f.size_mm+'mm':''}</span>`
            : (pair.father_par_id || '—'))}
          ${_pairRow('♀親', m ? `<span style="cursor:pointer;color:var(--blue)"
            onclick="routeTo('parent-detail',{id:'${m.par_id}'})">${m.display_name}${m.size_mm?' '+m.size_mm+'mm':''}</span>`
            : (pair.mother_par_id || '—'))}
          ${bld ? _pairRow('血統', bld.abbreviation || bld.bloodline_name) : ''}
          ${_pairRow('交尾開始', pair.pairing_start  || '—')}
          ${_pairRow('交尾終了', pair.pairing_end    || '—')}
          ${_pairRow('セット開始', pair.set_start    || '—')}
          ${_pairRow('セット終了', pair.set_end      || '—')}
          ${pair.collect_dates
            ? _pairRow('採卵日', pair.collect_dates) : ''}
          ${pair.temp_c      ? _pairRow('温度',   pair.temp_c + '℃') : ''}
          ${pair.mat_info    ? _pairRow('マット', pair.mat_info) : ''}
          ${pair.note        ? _pairRow('メモ',   pair.note) : ''}
        </div>
      </div>

      <!-- ステータス変更 -->
      <div style="display:flex;gap:8px">
        ${pair.status !== 'completed'
          ? `<button class="btn btn-ghost btn-sm"
              onclick="Pages._pairComplete('${pair.set_id}')">✅ 完了</button>` : ''}
        ${pair.status !== 'failed'
          ? `<button class="btn btn-ghost btn-sm"
              onclick="Pages._pairFail('${pair.set_id}')">❌ 失敗</button>` : ''}
      </div>

    </div>`;
}

function _pairRow(key, val) {
  return `<div class="info-row">
    <span class="info-key">${key}</span>
    <span class="info-val">${val}</span>
  </div>`;
}

// 採卵記録モーダル
Pages._pairAddEggModal = function (setId) {
  const today = new Date().toISOString().split('T')[0];
  _showModal('採卵記録', `
    <div class="form-section">
      ${UI.field('採卵日', `<input type="date" id="egg-date" class="input" value="${today}">`)}
      <div class="form-row-2">
        ${UI.field('採卵数', `<input type="number" id="egg-count" class="input" min="0" value="0">`)}
        ${UI.field('孵化確認数', `<input type="number" id="hatch-count" class="input" min="0" value="0">`)}
      </div>
      <div style="font-size:.75rem;color:var(--text3)">孵化確認がない場合は0のままでOK</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" onclick="Pages._pairSaveEgg('${setId}')">記録</button>
      </div>
    </div>`);
};

Pages._pairSaveEgg = async function (setId) {
  const date  = (document.getElementById('egg-date')?.value   || '').replace(/-/g, '/');
  const eggs  = +document.getElementById('egg-count')?.value  || 0;
  const hatch = +document.getElementById('hatch-count')?.value || 0;
  if (!date) { UI.toast('採卵日を入力してください', 'error'); return; }
  _closeModal();
  try {
    const res = await apiCall(
      () => API.pairing.addEgg({ set_id: setId, collect_date: date, egg_count: eggs, hatch_count: hatch }),
      `採卵${eggs}個を記録しました`
    );
    Pages.pairingDetail(setId);
  } catch (e) {}
};

Pages._pairComplete = async function (id) {
  if (!UI.confirm('完了にしますか？')) return;
  try {
    await apiCall(() => API.pairing.update({ set_id: id, status: 'completed' }), '完了にしました');
    Pages.pairingDetail(id);
  } catch (e) {}
};

Pages._pairFail = async function (id) {
  if (!UI.confirm('失敗として記録しますか？')) return;
  try {
    await apiCall(() => API.pairing.update({ set_id: id, status: 'failed' }), '失敗として記録しました');
    Pages.pairingDetail(id);
  } catch (e) {}
};

// ── 産卵セット登録・編集 ─────────────────────────────────────────
Pages.pairingNew = function (params = {}) {
  const main   = document.getElementById('main');
  const isEdit = !!params.editId;
  const pair   = isEdit ? (Store.getDB('pairings') || []).find(p => p.set_id === params.editId) : null;
  const parents= Store.getDB('parents') || [];
  const males  = parents.filter(p => p.sex === '♂' && (!p.status || p.status === 'active'));
  const females= parents.filter(p => p.sex === '♀' && (!p.status || p.status === 'active'));
  const blds   = Store.getDB('bloodlines') || [];
  const v = (f, d = '') => pair ? (pair[f] !== undefined ? pair[f] : d) : d;
  const today  = new Date().toISOString().split('T')[0];

  main.innerHTML = `
    ${UI.header(isEdit ? '産卵セット編集' : '産卵セット登録', {})}
    <div class="page-body">
      <form id="pair-form" class="form-section">

        <div class="form-title">ペアリング情報</div>
        ${UI.field('♂親（父）',
          UI.select('father_par_id',
            males.map(p => ({ code: p.par_id, label: `${p.display_name}${p.size_mm ? ' '+p.size_mm+'mm' : ''}` })),
            v('father_par_id')), true)}
        ${UI.field('♀親（母）',
          UI.select('mother_par_id',
            females.map(p => ({ code: p.par_id, label: `${p.display_name}${p.size_mm ? ' '+p.size_mm+'mm' : ''}` })),
            v('mother_par_id')), true)}
        ${UI.field('セット名（任意）',
          UI.input('set_name', 'text', v('set_name'), '例: 2025-A1ライン産卵セット'))}
        ${UI.field('血統',
          UI.select('bloodline_id',
            blds.map(b => ({ code: b.bloodline_id, label: b.abbreviation || b.bloodline_name })),
            v('bloodline_id')))}

        <div class="form-title">日付</div>
        <div class="form-row-2">
          ${UI.field('交尾開始日',
            UI.input('pairing_start', 'date', v('pairing_start') || today), true)}
          ${UI.field('交尾終了日',
            UI.input('pairing_end', 'date', v('pairing_end')))}
        </div>
        <div class="form-row-2">
          ${UI.field('セット開始日',
            UI.input('set_start', 'date', v('set_start')))}
          ${UI.field('セット終了日',
            UI.input('set_end', 'date', v('set_end')))}
        </div>

        <div class="form-title">環境</div>
        <div class="form-row-2">
          ${UI.field('温度(℃)',
            UI.input('temp_c', 'number', v('temp_c', '24'), '例: 24'))}
          ${UI.field('湿度(%)',
            UI.input('humidity_pct', 'number', v('humidity_pct'), '例: 70'))}
        </div>
        ${UI.field('マット情報',
          UI.input('mat_info', 'text', v('mat_info'), '例: T0マット / 産卵木あり'))}
        ${UI.field('メモ', UI.textarea('note', v('note'), 2, ''))}

        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="button" class="btn btn-ghost" style="flex:1"
            onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2"
            onclick="Pages._pairSave('${isEdit ? params.editId : ''}')">
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
  if (!data.father_par_id || !data.mother_par_id) {
    UI.toast('♂親と♀親を選択してください', 'error'); return;
  }
  if (!data.pairing_start) { UI.toast('交尾開始日を入力してください', 'error'); return; }
  // 日付フォーマット変換
  ['pairing_start','pairing_end','set_start','set_end'].forEach(k => {
    if (data[k]) data[k] = data[k].replace(/-/g, '/');
  });
  try {
    if (editId) {
      data.set_id = editId;
      await apiCall(() => API.pairing.update(data), '更新しました');
      routeTo('pairing-detail', { id: editId });
    } else {
      const res = await apiCall(() => API.pairing.create(data), '産卵セットを登録しました');
      await syncAll(true);
      routeTo('pairing-detail', { id: res.set_id });
    }
  } catch (e) {}
};

// ③ pairing-detail → lot-new に lineId を引き渡す
// 産卵セット台帳に line_id 列はないため、♀親が属するラインをキャッシュから逆引きする。
// 見つからない場合は lineId 未指定で lot-new に遷移（ユーザーが手動選択）。
Pages._pairGoLotNew = function (directLineId, motherParId) {
  // ♀親 → ラインの逆引き
  let lineId = directLineId || '';
  if (!lineId && motherParId) {
    const lines = Store.getDB('lines') || [];
    const matched = lines.find(l => l.mother_par_id === motherParId);
    if (matched) lineId = matched.line_id;
  }
  routeTo('lot-new', lineId ? { lineId } : {});
};

PAGES['pairing-list']   = () => Pages.pairingList();
PAGES['pairing-detail'] = () => Pages.pairingDetail(Store.getParams().id);
PAGES['pairing-new']    = () => Pages.pairingNew(Store.getParams());
