// ════════════════════════════════════════════════════════════════
// parent.js
// 役割: 種親（♂/♀）の一覧・詳細・登録・編集を担う。
//       種親のサイズ・血統・実績を管理し、ライン登録時の選択元になる。
//       引退・死亡の論理管理も行う。
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 種親一覧 ────────────────────────────────────────────────────
Pages.parentList = function () {
  const main = document.getElementById('main');
  let sexFilter    = '';
  let showRetired  = false;

  function render() {
    const all    = Store.getDB('parents') || [];
    let list     = sexFilter ? all.filter(p => p.sex === sexFilter) : all;
    const active = list.filter(p => p.status === 'active' || !p.status);
    const retired= list.filter(p => p.status === 'retired' || p.status === 'dead');

    const displayList = showRetired ? list : active;

    main.innerHTML = `
      ${UI.header('種親管理', { action: { fn: "routeTo('parent-new')", icon: '＋' } })}
      <div class="page-body">
        <div class="filter-bar">
          <button class="pill ${!sexFilter ? 'active' : ''}"
            onclick="Pages._parSetSex('')">全て</button>
          <button class="pill ${sexFilter==='♂' ? 'active' : ''}"
            onclick="Pages._parSetSex('♂')">♂ オス</button>
          <button class="pill ${sexFilter==='♀' ? 'active' : ''}"
            onclick="Pages._parSetSex('♀')">♀ メス</button>
        </div>
        <div class="sec-hdr">
          <span class="sec-title">${active.length}頭（現役）/ 計${list.length}頭</span>
          ${retired.length ? `<span class="sec-more"
            onclick="Pages._parToggleRetired()">
            引退・死亡 ${showRetired ? '非表示' : '表示('+retired.length+')'}</span>` : ''}
        </div>
        <div id="par-list-body">
          ${displayList.length
            ? displayList.map(_parCardHTML).join('')
            : UI.empty('種親がいません', '右上の＋から登録できます')}
        </div>
      </div>`;
  }

  Pages._parSetSex       = (s) => { sexFilter = s; render(); };
  Pages._parToggleRetired= ()  => { showRetired = !showRetired; render(); };
  render();
};

function _parCardHTML(par) {
  const bld     = Store.getBloodline(par.bloodline_id);
  const isRetired = par.status && par.status !== 'active';
  return `<div class="ind-card ${isRetired ? 'ind-card--retired' : ''}"
    onclick="routeTo('parent-detail',{parId:'${par.par_id}'})">
    <div style="text-align:center;min-width:36px">
      <div style="font-size:1.4rem">${par.sex === '♂' ? '♂' : '♀'}</div>
      <div style="font-size:.62rem;color:var(--text3)">${isRetired ? '引退' : '現役'}</div>
    </div>
    <div class="ind-card-body">
      <div class="ind-card-row">
        <span class="ind-card-id" style="${isRetired ? 'opacity:.6' : ''}">${par.display_name}</span>
        ${par.size_mm
          ? `<span class="badge" style="background:rgba(200,168,75,.12);color:var(--gold)">${par.size_mm}mm</span>`
          : ''}
      </div>
      <div style="font-size:.75rem;color:var(--text2)">
        ${bld ? (bld.abbreviation || bld.bloodline_name) : '血統未設定'}
        ${par.locality   ? ' / ' + par.locality   : ''}
        ${par.generation ? ' ' + par.generation   : ''}
      </div>
      ${par.achievements
        ? `<div style="font-size:.7rem;color:var(--text3);margin-top:2px">${par.achievements}</div>`
        : ''}
    </div>
    <div style="color:var(--text3);font-size:1.2rem">›</div>
  </div>`;
}

// ── 種親詳細 ────────────────────────────────────────────────────
Pages.parentDetail = async function (parId) {
  const main = document.getElementById('main');
  let par = Store.getParent(parId);
  if (par) _renderParDetail(par, main);
  else main.innerHTML = UI.header('種親詳細', {}) + UI.spinner();
  try {
    console.log('[PARENT_DETAIL] typeof API=', typeof API, '/ window.API=', !!window.API);
    const res = await API.parent.get(parId);
    par = res.parent;
    Store.patchDBItem('parents', 'par_id', parId, par);
    _renderParDetail(par, main);
  } catch (e) {
    if (!par) main.innerHTML = UI.header('エラー', {}) +
      `<div class="page-body">${UI.empty('取得失敗: ' + e.message)}</div>`;
  }
};

function _renderParDetail(par, main) {
  const bld   = Store.getBloodline(par.bloodline_id);
  const lines = (Store.getDB('lines') || []).filter(l =>
    l.father_par_id === par.par_id || l.mother_par_id === par.par_id
  );
  const isRetired = par.status && par.status !== 'active';

  main.innerHTML = `
    ${UI.header(par.display_name, { back: true })}
    <div class="page-body">

      <div class="card card-gold">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:2.5rem">${par.sex === '♂' ? '♂' : '♀'}</span>
          <div style="flex:1">
            <div style="font-size:1.05rem;font-weight:700">${par.display_name}</div>
            <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
              ${par.size_mm
                ? `<span class="badge" style="background:rgba(200,168,75,.15);color:var(--gold)">🏆 ${par.size_mm}mm</span>`
                : ''}
              ${par.weight_g
                ? `<span class="badge" style="background:var(--surface2);color:var(--text2)">${par.weight_g}g</span>`
                : ''}
              <span class="badge" style="background:var(--surface2);color:var(--text3)">
                ${isRetired ? '🔒 引退' : '✅ 現役'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('parent-new',{editId:'${par.par_id}'})">✏️ 編集</button>
        ${!isRetired
          ? `<button class="btn btn-ghost" style="flex:1"
              onclick="Pages._parRetire('${par.par_id}')">🔒 引退処理</button>`
          : ''}
      </div>

      <div class="card">
        <div class="card-title">基本情報</div>
        <div class="info-list">
          ${_parInfoRow('血統',
            bld ? bld.bloodline_name + (bld.abbreviation ? ' ('+bld.abbreviation+')' : '')
                : (par.bloodline_id || '—'))}
          ${_parInfoRow('産地',    par.locality    || '—')}
          ${_parInfoRow('累代',    par.generation  || '—')}
          ${_parInfoRow('羽化日',  par.eclosion_date || '—')}
          ${par.after_eat_date ? _parInfoRow('後食開始', par.after_eat_date) : ''}
          ${_parInfoRow('入手元',  par.source      || '—')}
          ${_parInfoRow('入手日',  par.purchase_date || '—')}
          ${par.father_id ? _parInfoRow('父', par.father_id) : ''}
          ${par.mother_id ? _parInfoRow('母', par.mother_id) : ''}
          ${par.origin_type === 'bred' ? _parInfoRow('区分', '<span style="color:var(--green);font-weight:600">🌱 自家産（昇格）</span>') : ''}
          ${par.origin_type === 'purchased' ? _parInfoRow('区分', '🛒 購入') : ''}
          ${par.origin_individual_id
            ? _parInfoRow('元個体',
                `<span style="cursor:pointer;color:var(--blue)"
                  onclick="routeTo('ind-detail',{indId:'${par.origin_individual_id}'})">${par.origin_individual_id}</span>`)
            : ''}
          ${par.note ? _parInfoRow('メモ', par.note) : ''}
        </div>
      </div>

      <!-- ペアリング情報サマリ -->
      ${(() => {
        const _allPairs = Store.getDB('pairings') || [];
        const _myPairs  = _allPairs.filter(p => p.father_par_id===par.par_id || p.mother_par_id===par.par_id);
        if (_myPairs.length === 0) return '';
        const _active   = _myPairs.filter(p=>p.status==='active'||p.status==='resting').length;
        const _dates    = _myPairs.map(p=>p.pairing_start||'').filter(Boolean).sort().reverse();
        const _lastDate = _dates[0] || '—';
        return '<div class="card"><div class="card-title">ペアリング履歴</div><div class="info-list">'
          + _parInfoRow('ペアリング回数', _myPairs.length + '回')
          + _parInfoRow('最終ペアリング', _lastDate)
          + (_active > 0 ? _parInfoRow('現在進行中', '<span style="color:var(--green);font-weight:600">'+_active+'セット</span>') : '')
          + '</div></div>';
      })()}
      ${par.achievements ? `<div class="card">
        <div class="card-title">実績</div>
        <div style="font-size:.85rem;color:var(--text2)">${par.achievements}</div>
      </div>` : ''}

      ${lines.length ? `<div class="card">
        <div class="card-title">関連ライン（${lines.length}件）</div>
        ${lines.map(l => `
          <div style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);
            cursor:pointer" onclick="routeTo('line-detail',{lineId:'${l.line_id}'})">
            <div style="flex:1">
              <span style="color:var(--blue);font-family:var(--font-mono);font-size:.85rem">
                ${l.display_id}
              </span>
              ${l.line_name ? `<span style="color:var(--text3);font-size:.75rem"> / ${l.line_name}</span>` : ''}
            </div>
            <span style="color:var(--text3);font-size:.75rem">
              ${l.father_par_id === par.par_id ? '♂親' : '♀親'}
            </span>
          </div>`).join('')}
      </div>` : ''}

    </div>`;
}

function _parInfoRow(key, val) {
  return `<div class="info-row">
    <span class="info-key">${key}</span>
    <span class="info-val">${val}</span>
  </div>`;
}

Pages._parRetire = async function (id) {
  if (!UI.confirm('引退処理しますか？現役に戻す場合は編集画面から変更できます。')) return;
  try {
    await apiCall(() => API.parent.update({ par_id: id, status: 'retired' }), '引退処理しました');
    Store.patchDBItem('parents', 'par_id', id, { status: 'retired' });
    Pages.parentDetail(id);
  } catch (e) {}
};

// ── 種親登録・編集 ───────────────────────────────────────────────
Pages.parentNew = function (params = {}) {
  const main   = document.getElementById('main');
  const isEdit = !!params.editId;
  const par    = isEdit ? Store.getParent(params.editId) : null;
  const blds   = Store.getDB('bloodlines') || [];
  const v = (f, d = '') => par ? (par[f] !== undefined ? par[f] : d) : d;

  main.innerHTML = `
    ${UI.header(isEdit ? '種親編集' : '種親登録', { back: true })}
    <div class="page-body">
      <form id="par-form" class="form-section">

        <div class="form-title">基本情報</div>
        ${UI.field('名前・管理名',
          UI.input('display_name', 'text', v('display_name'), '例: GGB♂175 / 蛾山♀'), true)}
        <div class="form-row-2">
          ${UI.field('性別',
            UI.select('sex', [
              { code:'♂', label:'♂ オス' },
              { code:'♀', label:'♀ メス' },
            ], v('sex', '♂')), true)}
          ${UI.field('サイズ(mm)',
            UI.input('size_mm', 'number', v('size_mm'), '例: 175'))}
        </div>
        <div class="form-row-2">
          ${UI.field('体重(g)',
            UI.input('weight_g', 'number', v('weight_g'), '例: 38'))}
          ${UI.field('累代',
            UI.input('generation', 'text', v('generation'), '例: WF1 / CBF2'))}
        </div>

        <div class="form-title">血統・産地</div>
        ${UI.field('血統',
          UI.select('bloodline_id',
            blds.map(b => ({ code: b.bloodline_id, label: b.abbreviation || b.bloodline_name })),
            v('bloodline_id')))}
        ${UI.field('産地',
          UI.input('locality', 'text', v('locality', 'Guadeloupe')))}

        <div class="form-title">入手・日付</div>
        <div class="form-row-2">
          ${UI.field('羽化日', UI.input('eclosion_date', 'date', v('eclosion_date')))}
          ${UI.field('入手日', UI.input('purchase_date', 'date', v('purchase_date')))}
        </div>
        ${UI.field('後食開始日', UI.input('after_eat_date', 'date', v('after_eat_date')))}
        ${UI.field('入手元',
          UI.input('source', 'text', v('source'), '例: 〇〇ブリーダー / 自家産'))}

        <div class="form-title">メモ・実績</div>
        ${UI.field('実績メモ',
          UI.textarea('achievements', v('achievements'), 2, '例: 2024年 自己最大 175mm羽化'))}
        ${UI.field('内部メモ',
          UI.textarea('note', v('note'), 2, ''))}

        ${isEdit ? UI.field('ステータス',
          UI.select('status', [
            { code:'active',  label:'現役' },
            { code:'retired', label:'引退' },
            { code:'dead',    label:'死亡' },
          ], v('status', 'active'))) : ''}

        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="button" class="btn btn-ghost" style="flex:1"
            onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2"
            onclick="Pages._parSave('${isEdit ? params.editId : ''}')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>`;
};

Pages._parSave = async function (editId) {
  const form = document.getElementById('par-form');
  if (!form) return;
  const data = UI.collectForm(form);
  if (!data.display_name) { UI.toast('名前を入力してください', 'error'); return; }
  if (data.eclosion_date) data.eclosion_date = data.eclosion_date.replace(/-/g, '/');
  if (data.purchase_date) data.purchase_date = data.purchase_date.replace(/-/g, '/');
  // 手動登録は購入種親扱い
  if (!editId && !data.origin_type) data.origin_type = 'purchased';
  try {
    if (editId) {
      data.par_id = editId;
      await apiCall(() => API.parent.update(data), '更新しました');
      Store.patchDBItem('parents', 'par_id', editId, data);
      routeTo('parent-detail', { parId: editId });
    } else {
      const res = await apiCall(() => API.parent.create(data), '種親を登録しました');
      await syncAll(true);
      routeTo('parent-detail', { parId: res.par_id });
    }
  } catch (e) {}
};

window.PAGES['parent-list']   = () => Pages.parentList();
window.PAGES['parent-detail'] = () => Pages.parentDetail(Store.getParams().parId || Store.getParams().id);
window.PAGES['parent-new']    = () => Pages.parentNew(Store.getParams());
