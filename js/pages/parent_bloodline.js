// ════════════════════════════════════════════════════════════════
// parent.js
// 役割: 種親（親♂・親♀）の一覧・詳細・登録・編集を担う。
//       種親のサイズ・血統・実績を管理し、ライン登録時の選択元になる。
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 種親一覧 ────────────────────────────────────────────────────
Pages.parentList = function () {
  const main = document.getElementById('main');
  let sexFilter = '';

  function render() {
    const all  = Store.getDB('parents') || [];
    const list = sexFilter ? all.filter(p => p.sex === sexFilter) : all;
    const active = list.filter(p => p.status === 'active');

    main.innerHTML = `
      ${UI.header('種親管理', { action: { fn: "routeTo('parent-new')", icon: '＋' } })}
      <div class="page-body">
        <div class="filter-bar">
          <button class="pill ${!sexFilter ? 'active' : ''}" onclick="Pages._parSetSex('')">全て</button>
          <button class="pill ${sexFilter==='♂' ? 'active' : ''}" onclick="Pages._parSetSex('♂')">♂ オス</button>
          <button class="pill ${sexFilter==='♀' ? 'active' : ''}" onclick="Pages._parSetSex('♀')">♀ メス</button>
        </div>
        <div class="sec-hdr">
          <span class="sec-title">${active.length}頭（現役）/ 計${list.length}頭</span>
        </div>
        ${active.length
          ? active.map(_parCardHTML).join('') + (list.length > active.length
              ? `<div style="margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="Pages._parShowRetired()">引退・死亡を表示</button></div>`
              : '')
          : UI.empty('種親がいません', '右上の＋から登録できます')}
      </div>`;
  }

  Pages._parSetSex = (s) => { sexFilter = s; render(); };
  Pages._parShowRetired = () => {
    const retired = (Store.getDB('parents') || []).filter(p => p.status !== 'active');
    const el = document.getElementById('main');
    if (!el) return;
    el.insertAdjacentHTML('beforeend',
      `<div class="page-body">${retired.map(_parCardHTML).join('')}</div>`);
  };
  render();
};

function _parCardHTML(par) {
  const bld = Store.getBloodline(par.bloodline_id);
  return `<div class="ind-card" onclick="routeTo('parent-detail',{parId:'${par.par_id}'})">
    <div style="text-align:center;min-width:36px">
      <div style="font-size:1.4rem">${par.sex === '♂' ? '♂' : '♀'}</div>
      <div style="font-size:.65rem;color:var(--text3)">${par.status === 'active' ? '現役' : '引退'}</div>
    </div>
    <div class="ind-card-body">
      <div class="ind-card-row">
        <span class="ind-card-id">${par.display_name}</span>
        ${par.size_mm ? `<span class="badge" style="background:var(--surface2);color:var(--gold)">${par.size_mm}mm</span>` : ''}
      </div>
      <div style="font-size:.75rem;color:var(--text2)">
        ${bld ? (bld.abbreviation || bld.bloodline_name) : '血統未設定'}
        ${par.locality ? ' / ' + par.locality : ''}
        ${par.generation ? ' ' + par.generation : ''}
      </div>
      ${par.achievements ? `<div style="font-size:.7rem;color:var(--text3);margin-top:2px">${par.achievements}</div>` : ''}
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
    const res = await API.parent.get(parId);
    par = res.parent;
    _renderParDetail(par, main);
  } catch (e) {
    if (!par) main.innerHTML = UI.header('エラー', {}) + `<div class="page-body">${UI.empty(e.message)}</div>`;
  }
};

function _renderParDetail(par, main) {
  const bld = Store.getBloodline(par.bloodline_id);
  // この種親が親になっているラインを取得
  const lines = (Store.getDB('lines') || []).filter(l =>
    l.father_par_id === par.par_id || l.mother_par_id === par.par_id
  );
  main.innerHTML = `
    ${UI.header(par.display_name, {})}
    <div class="page-body">
      <div class="card card-gold">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:2.5rem">${par.sex === '♂' ? '♂' : '♀'}</span>
          <div>
            <div style="font-size:1.1rem;font-weight:700">${par.display_name}</div>
            <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
              ${par.size_mm ? `<span class="badge" style="background:rgba(200,168,75,.15);color:var(--gold)">🏆 ${par.size_mm}mm</span>` : ''}
              ${par.weight_g ? `<span class="badge" style="background:var(--surface2);color:var(--text2)">${par.weight_g}g</span>` : ''}
              <span class="badge" style="background:var(--surface2);color:var(--text3)">${par.status === 'active' ? '✅ 現役' : '🔒 引退'}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">基本情報</div>
        <div class="info-list">
          ${_infoRow('血統', bld ? (bld.bloodline_name + (bld.abbreviation ? ' ('+bld.abbreviation+')' : '')) : (par.bloodline_id || '—'))}
          ${_infoRow('産地', par.locality || '—')}
          ${_infoRow('累代', par.generation || '—')}
          ${_infoRow('羽化日', par.eclosion_date || '—')}
          ${_infoRow('入手元', par.source || '—')}
          ${_infoRow('入手日', par.purchase_date || '—')}
          ${par.father_id ? _infoRow('父', par.father_id) : ''}
          ${par.mother_id ? _infoRow('母', par.mother_id) : ''}
        </div>
      </div>
      ${par.achievements ? `<div class="card"><div class="card-title">実績</div>
        <div style="font-size:.85rem;color:var(--text2)">${par.achievements}</div></div>` : ''}
      ${lines.length ? `<div class="card"><div class="card-title">関連ライン（${lines.length}件）</div>
        ${lines.map(l => `<div style="padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer"
          onclick="routeTo('line-detail',{lineId:'${l.line_id}'})">
          <span style="color:var(--blue);font-family:var(--font-mono)">${l.display_id}</span>
          ${l.line_name ? ' / '+l.line_name : ''}
        </div>`).join('')}</div>` : ''}
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" style="flex:1" onclick="routeTo('parent-new',{editId:'${par.par_id}'})">編集</button>
        <button class="btn btn-ghost" style="flex:1" onclick="Pages._parRetire('${par.par_id}')">引退処理</button>
      </div>
    </div>`;
}

Pages._parRetire = async function (id) {
  if (!UI.confirm('引退処理しますか？')) return;
  try {
    await apiCall(() => API.parent.update({ par_id: id, status: 'retired' }), '引退処理しました');
    Store.patchDBItem('parents', 'par_id', id, { status: 'retired' });
    Pages.parentDetail(id);
  } catch (e) {}
};

// ── 種親登録・編集 ───────────────────────────────────────────────
Pages.parentNew = function (params = {}) {
  const main  = document.getElementById('main');
  const isEdit= !!params.editId;
  const par   = isEdit ? Store.getParent(params.editId) : null;
  const blds  = Store.getDB('bloodlines') || [];
  const v = (f, d='') => par ? (par[f] !== undefined ? par[f] : d) : (params[f] || d);

  main.innerHTML = `
    ${UI.header(isEdit ? '種親編集' : '種親登録', {})}
    <div class="page-body">
      <form id="par-form" class="form-section">
        ${UI.field('名前・管理名', UI.input('display_name','text',v('display_name'),'例: GGB♂-175mm'), true)}
        <div class="form-row-2">
          ${UI.field('性別', UI.select('sex',[{code:'♂',label:'♂ オス'},{code:'♀',label:'♀ メス'}],v('sex','♂')), true)}
          ${UI.field('サイズ(mm)', UI.input('size_mm','number',v('size_mm'),'例: 175'))}
        </div>
        <div class="form-row-2">
          ${UI.field('体重(g)', UI.input('weight_g','number',v('weight_g'),'例: 38'))}
          ${UI.field('累代', UI.input('generation','text',v('generation'),'例: WF1'))}
        </div>
        ${UI.field('血統', UI.select('bloodline_id',
          blds.map(b => ({code:b.bloodline_id,label:(b.abbreviation||b.bloodline_name)})),
          v('bloodline_id')))}
        ${UI.field('産地', UI.input('locality','text',v('locality','Guadeloupe')))}
        <div class="form-row-2">
          ${UI.field('羽化日', UI.input('eclosion_date','date',v('eclosion_date')))}
          ${UI.field('入手日', UI.input('purchase_date','date',v('purchase_date')))}
        </div>
        ${UI.field('入手元', UI.input('source','text',v('source'),'例: 〇〇ブリーダー'))}
        ${UI.field('実績メモ', UI.textarea('achievements',v('achievements'),2,'例: 2024年最大175mm'))}
        ${UI.field('メモ', UI.textarea('note',v('note'),2,''))}
        <div style="display:flex;gap:10px;margin-top:4px">
          <button type="button" class="btn btn-ghost" style="flex:1" onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2" onclick="Pages._parSave('${isEdit?params.editId:''}')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>`;
};

Pages._parSave = async function (editId) {
  const form = document.getElementById('par-form');
  const data = UI.collectForm(form);
  if (!data.display_name) { UI.toast('名前を入力してください', 'error'); return; }
  if (data.eclosion_date)  data.eclosion_date  = data.eclosion_date.replace(/-/g,'/');
  if (data.purchase_date)  data.purchase_date  = data.purchase_date.replace(/-/g,'/');
  try {
    if (editId) {
      data.par_id = editId;
      await apiCall(() => API.parent.update(data), '更新しました');
      Store.patchDBItem('parents', 'par_id', editId, data);
      routeTo('parent-detail', { parId: editId });
    } else {
      const res = await apiCall(() => API.parent.create(data), '種親を登録しました');
      const newPar = await API.parent.get(res.par_id);
      Store.addDBItem('parents', newPar.parent);
      routeTo('parent-detail', { parId: res.par_id });
    }
  } catch (e) {}
};

window.PAGES = window.PAGES || {};
window.PAGES['parent-list']   = () => Pages.parentList();
window.PAGES['parent-detail'] = () => Pages.parentDetail(Store.getParams().parId || Store.getParams().id);
window.PAGES['parent-new']    = () => Pages.parentNew(Store.getParams());

// ════════════════════════════════════════════════════════════════
// bloodline.js
// 役割: 血統の一覧・詳細・登録・編集を担う。
//       「確定/暫定/不明」の3段階ステータス管理。
//       ライン登録・個体詳細の血統表示の源泉データ。
// ════════════════════════════════════════════════════════════════

// ── 血統一覧 ────────────────────────────────────────────────────
Pages.bloodlineList = function () {
  const main = document.getElementById('main');

  function render() {
    const list = Store.getDB('bloodlines') || [];
    main.innerHTML = `
      ${UI.header('血統管理', { action: { fn: "routeTo('bloodline-new')", icon: '＋' } })}
      <div class="page-body">
        <div class="sec-hdr"><span class="sec-title">${list.length}血統</span></div>
        ${list.length ? list.map(_bldCardHTML).join('') : UI.empty('血統が登録されていません', '右上の＋から登録できます')}
      </div>`;
  }
  render();
};

function _bldCardHTML(bld) {
  const status = Object.values(BLOODLINE_STATUS).find(s => s.code === bld.bloodline_status);
  return `<div class="ind-card" onclick="routeTo('bloodline-detail',{bloodlineId:'${bld.bloodline_id}'})">
    <div style="min-width:42px;text-align:center">
      <div style="font-size:1.3rem">🧬</div>
      <div style="font-size:.62rem;color:${status?.color||'var(--text3)'}">${status?.label||'—'}</div>
    </div>
    <div class="ind-card-body">
      <div class="ind-card-row">
        <span class="ind-card-id">${bld.bloodline_name}</span>
        ${bld.abbreviation ? `<span style="font-size:.72rem;color:var(--text3)">(${bld.abbreviation})</span>` : ''}
      </div>
      ${bld.best_size_mm ? `<div style="font-size:.78rem;color:var(--gold)">実績: ${bld.best_size_mm}mm</div>` : ''}
      ${bld.feature_tags ? `<div style="font-size:.7rem;color:var(--text3)">${bld.feature_tags}</div>` : ''}
    </div>
    <div style="color:var(--text3);font-size:1.2rem">›</div>
  </div>`;
}

// ── 血統詳細 ────────────────────────────────────────────────────
Pages.bloodlineDetail = function (bldId) {
  const main = document.getElementById('main');
  const bld  = Store.getBloodline(bldId);
  if (!bld) { main.innerHTML = UI.header('エラー', {}) + `<div class="page-body">${UI.empty('血統が見つかりません')}</div>`; return; }

  // この血統を使っているライン数
  const usingLines = (Store.getDB('lines') || []).filter(l => l.bloodline_id === bldId);
  const statusInfo = Object.values(BLOODLINE_STATUS).find(s => s.code === bld.bloodline_status);

  main.innerHTML = `
    ${UI.header(bld.bloodline_name, {})}
    <div class="page-body">
      <div class="card card-gold">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:2rem">🧬</span>
          <div>
            <div style="font-size:1rem;font-weight:700">${bld.bloodline_name}</div>
            ${bld.abbreviation ? `<div style="font-size:.8rem;color:var(--text3)">${bld.abbreviation}</div>` : ''}
          </div>
          ${statusInfo ? `<span class="badge" style="margin-left:auto;color:${statusInfo.color};background:${statusInfo.color}18;border:1px solid ${statusInfo.color}44">${statusInfo.label}</span>` : ''}
        </div>
        ${(bld.best_size_mm || bld.best_weight_g) ? `<div style="display:flex;gap:12px">
          ${bld.best_size_mm  ? `<span style="color:var(--gold);font-weight:700">${bld.best_size_mm}mm</span>` : ''}
          ${bld.best_weight_g ? `<span style="color:var(--green);font-weight:700">${bld.best_weight_g}g</span>` : ''}
        </div>` : ''}
      </div>
      <div class="card">
        <div class="card-title">血統情報</div>
        <div class="info-list">
          ${bld.description  ? _infoRow('説明', bld.description)  : ''}
          ${bld.father_line  ? _infoRow('父系', bld.father_line)  : ''}
          ${bld.mother_line  ? _infoRow('母系', bld.mother_line)  : ''}
          ${bld.feature_tags ? _infoRow('特徴', bld.feature_tags) : ''}
          ${bld.external_source ? _infoRow('ソース',
            `<a href="${bld.external_source}" target="_blank" style="color:var(--blue)">外部リンク</a>`) : ''}
        </div>
      </div>
      ${usingLines.length ? `<div class="card"><div class="card-title">使用ライン（${usingLines.length}件）</div>
        ${usingLines.map(l => `<div style="padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer"
          onclick="routeTo('line-detail',{lineId:'${l.line_id}'})">
          <span style="color:var(--blue);font-family:var(--font-mono)">${l.display_id}</span>
          ${l.line_name ? ' / '+l.line_name : ''}
        </div>`).join('')}</div>` : ''}
      <button class="btn btn-ghost" onclick="routeTo('bloodline-new',{editId:'${bld.bloodline_id}'})">編集</button>
    </div>`;
};

// ── 血統登録・編集 ───────────────────────────────────────────────
Pages.bloodlineNew = function (params = {}) {
  const main  = document.getElementById('main');
  const isEdit= !!params.editId;
  const bld   = isEdit ? Store.getBloodline(params.editId) : null;
  const v = (f, d='') => bld ? (bld[f] !== undefined ? bld[f] : d) : d;

  main.innerHTML = `
    ${UI.header(isEdit ? '血統編集' : '血統登録', {})}
    <div class="page-body">
      <form id="bld-form" class="form-section">
        ${UI.field('血統名', UI.input('bloodline_name','text',v('bloodline_name'),'例: Super Gigas Blood'), true)}
        <div class="form-row-2">
          ${UI.field('略称', UI.input('abbreviation','text',v('abbreviation'),'例: SGB'))}
          ${UI.field('ステータス', UI.select('bloodline_status',[
            {code:'confirmed',label:'確定'},{code:'temporary',label:'暫定'},{code:'unknown',label:'不明'}
          ],v('bloodline_status','unknown')))}
        </div>
        ${UI.field('説明', UI.textarea('description',v('description'),2,'血統の説明・特徴'))}
        <div class="form-row-2">
          ${UI.field('父系特徴', UI.input('father_line','text',v('father_line'),'例: 長角系'))}
          ${UI.field('母系特徴', UI.input('mother_line','text',v('mother_line'),'例: 大型安定系'))}
        </div>
        ${UI.field('特徴タグ', UI.input('feature_tags','text',v('feature_tags'),'例: 長角,大型,安定（カンマ区切り）'))}
        <div class="form-row-2">
          ${UI.field('最大サイズ(mm)', UI.input('best_size_mm','number',v('best_size_mm'),'例: 185'))}
          ${UI.field('最大体重(g)',    UI.input('best_weight_g','number',v('best_weight_g'),'例: 170'))}
        </div>
        ${UI.field('外部ソースURL', UI.input('external_source','url',v('external_source'),'https://'))}
        ${UI.field('メモ', UI.textarea('note',v('note'),2,''))}
        <div style="display:flex;gap:10px;margin-top:4px">
          <button type="button" class="btn btn-ghost" style="flex:1" onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2" onclick="Pages._bldSave('${isEdit?params.editId:''}')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>`;
};

Pages._bldSave = async function (editId) {
  const form = document.getElementById('bld-form');
  const data = UI.collectForm(form);
  if (!data.bloodline_name) { UI.toast('血統名を入力してください', 'error'); return; }
  try {
    if (editId) {
      data.bloodline_id = editId;
      await apiCall(() => API.bloodline.update(data), '更新しました');
      Store.patchDBItem('bloodlines', 'bloodline_id', editId, data);
      routeTo('bloodline-detail', { bloodlineId: editId });
    } else {
      const res = await apiCall(() => API.bloodline.create(data), '血統を登録しました');
      const newBld = await API.bloodline.get(res.bloodline_id);
      Store.addDBItem('bloodlines', newBld.bloodline);
      routeTo('bloodline-detail', { bloodlineId: res.bloodline_id });
    }
  } catch (e) {}
};

window.PAGES['bloodline-list']   = () => Pages.bloodlineList();
window.PAGES['bloodline-detail'] = () => Pages.bloodlineDetail(Store.getParams().bloodlineId || Store.getParams().id);
window.PAGES['bloodline-new']    = () => Pages.bloodlineNew(Store.getParams());
