// ════════════════════════════════════════════════════════════════
// manage.js
// 役割: 管理メニュー（5タブの「管理」画面）。
//       ライン・ロット・種親・血統・産卵セット各管理への入口と
//       それぞれのサマリー数値を1画面で俯瞰できる。
//       ライン登録フォームもここに内包する。
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 管理メニュー ─────────────────────────────────────────────────
Pages.manage = function () {
  const main  = document.getElementById('main');
  const lines = Store.getDB('lines')     || [];
  const lots  = Store.getDB('lots')      || [];
  const pars  = Store.getDB('parents')   || [];
  const blds  = Store.getDB('bloodlines')|| [];
  const pairs = Store.getDB('pairings')  || [];

  const actLots  = lots.filter(l => l.status === 'active');
  const actPars  = pars.filter(p => !p.status || p.status === 'active');
  const actPairs = pairs.filter(p => p.status === 'active');

  const sections = [
    {
      icon: '🔗', label: 'ライン管理', count: lines.length, unit: 'ライン',
      page: 'line-list', newPage: 'line-new',
      sub: `${lines.filter(l=>l.status!=='closed').length}ライン進行中`,
      color: 'var(--gold)',
    },
    {
      icon: '🥚', label: 'ロット管理', count: actLots.length, unit: 'ロット',
      page: 'lot-list', newPage: 'lot-new',
      sub: `総頭数 ${actLots.reduce((s,l)=>s+(+l.count||0),0)}頭`,
      color: 'var(--green)',
    },
    {
      icon: '♂♀', label: '種親管理', count: actPars.length, unit: '頭',
      page: 'parent-list', newPage: 'parent-new',
      sub: `♂${actPars.filter(p=>p.sex==='♂').length} / ♀${actPars.filter(p=>p.sex==='♀').length}`,
      color: 'var(--blue)',
    },
    {
      icon: '🧬', label: '血統管理', count: blds.filter(b=>b.bloodline_id!=='BLD-UNKNOWN').length, unit: '血統',
      page: 'bloodline-list', newPage: 'bloodline-new',
      sub: `確定 ${blds.filter(b=>b.bloodline_status==='confirmed').length}件`,
      color: 'var(--amber)',
    },
    {
      icon: '🌿', label: '産卵セット', count: actPairs.length, unit: 'セット',
      page: 'pairing-list', newPage: 'pairing-new',
      sub: `完了 ${pairs.filter(p=>p.status==='completed').length}件`,
      color: '#a0c878',
    },
  ];

  main.innerHTML = `
    ${UI.header('管理', {})}
    <div class="page-body">

      <!-- 管理カード一覧 -->
      ${sections.map(s => `
        <div class="card" style="cursor:pointer" onclick="routeTo('${s.page}')">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:1.8rem;min-width:44px;text-align:center">${s.icon}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:.95rem">${s.label}</div>
              <div style="font-size:.75rem;color:var(--text3);margin-top:2px">${s.sub}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:1.5rem;font-weight:700;color:${s.color}">${s.count}</div>
              <div style="font-size:.65rem;color:var(--text3)">${s.unit}</div>
            </div>
            <div style="color:var(--text3);font-size:1.2rem;margin-left:4px">›</div>
          </div>
        </div>`).join('')}

      <!-- クイック登録 -->
      <div class="card">
        <div class="card-title">クイック登録</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-ghost" onclick="routeTo('line-new')">＋ ライン登録</button>
          <button class="btn btn-ghost" onclick="routeTo('lot-new')">＋ ロット登録</button>
          <button class="btn btn-ghost" onclick="routeTo('parent-new')">＋ 種親登録</button>
          <button class="btn btn-ghost" onclick="routeTo('bloodline-new')">＋ 血統登録</button>
          <button class="btn btn-ghost" onclick="routeTo('pairing-new')">＋ 産卵セット</button>
          <button class="btn btn-ghost" onclick="routeTo('ind-new')">＋ 個体登録</button>
        </div>
      </div>

    </div>`;
};

// ════════════════════════════════════════════════════════════════
// ライン一覧・詳細・登録（manage.js に内包）
// ════════════════════════════════════════════════════════════════

Pages.lineList = function () {
  const main  = document.getElementById('main');
  const lines = Store.getDB('lines') || [];
  const open  = lines.filter(l => l.status !== 'closed');
  const closed= lines.filter(l => l.status === 'closed');

  main.innerHTML = `
    ${UI.header('ライン一覧', { action: { fn: "routeTo('line-new')", icon: '＋' } })}
    <div class="page-body">
      <div class="sec-hdr">
        <span class="sec-title">${open.length}ライン（進行中）</span>
        ${closed.length ? `<span class="sec-more" onclick="Pages._lineShowClosed()">終了済 ${closed.length}</span>` : ''}
      </div>
      <div id="line-list-body">
        ${open.length
          ? open.map(_lineCardHTML).join('')
          : UI.empty('ラインがありません', '右上の＋から登録できます')}
      </div>
    </div>`;
};

function _lineCardHTML(line) {
  const f = Store.getParent(line.father_par_id);
  const m = Store.getParent(line.mother_par_id);
  return `<div class="ind-card" onclick="routeTo('line-detail',{id:'${line.line_id}'})">
    <div style="text-align:center;min-width:42px">
      <div style="font-size:1.2rem">🔗</div>
      <div style="font-size:.62rem;color:var(--text3)">${line.hatch_year||'—'}</div>
    </div>
    <div class="ind-card-body">
      <div class="ind-card-row">
        <span class="ind-card-id">${line.display_id}</span>
        ${UI.bloodlineBadge(line.bloodline_status)}
      </div>
      <div style="font-size:.75rem;color:var(--text2)">
        ${line.line_name || ''}
        ${line.locality ? ' / ' + line.locality : ''}
        ${line.generation ? ' ' + line.generation : ''}
      </div>
      <div style="font-size:.7rem;color:var(--text3);margin-top:2px">
        ${f ? '♂ '+f.display_name : ''}${m ? ' × ♀ '+m.display_name : ''}
      </div>
    </div>
    <div style="color:var(--text3);font-size:1.2rem">›</div>
  </div>`;
}

Pages._lineShowClosed = function () {
  const closed = (Store.getDB('lines') || []).filter(l => l.status === 'closed');
  document.getElementById('line-list-body')?.insertAdjacentHTML(
    'beforeend', `<div style="opacity:.5">${closed.map(_lineCardHTML).join('')}</div>`
  );
};

// ── ライン詳細 ───────────────────────────────────────────────────
Pages.lineDetail = async function (lineId) {
  const main = document.getElementById('main');
  let line = Store.getLine(lineId);
  if (line) _renderLineDetail(line, main);
  else main.innerHTML = UI.header('ライン詳細', {}) + UI.spinner();
  try {
    const res = await API.line.get(lineId);
    line = res.line;
    Store.patchDBItem('lines', 'line_id', lineId, line);
    _renderLineDetail(line, main);
  } catch (e) {
    if (!line) main.innerHTML = UI.header('エラー', {}) +
      `<div class="page-body">${UI.empty(e.message)}</div>`;
  }
};

function _renderLineDetail(line, main) {
  const f   = Store.getParent(line.father_par_id);
  const m   = Store.getParent(line.mother_par_id);
  const bld = Store.getBloodline(line.bloodline_id);
  // このラインに属する個体・ロット
  const inds = Store.getIndividualsByLine(line.line_id).filter(i => i.status !== 'dead');
  const lots = (Store.getDB('lots') || []).filter(l => l.line_id === line.line_id && l.status === 'active');

  main.innerHTML = `
    ${UI.header(line.display_id, {})}
    <div class="page-body">

      <div class="card card-gold">
        <div style="font-family:var(--font-mono);font-size:.85rem;color:var(--gold);margin-bottom:6px">
          ${line.display_id}
        </div>
        <div style="font-size:1rem;font-weight:700;margin-bottom:8px">
          ${line.line_name || '（名称未設定）'}
          ${line.locality   ? '<span style="font-size:.78rem;color:var(--text3);margin-left:8px">'+line.locality+'</span>' : ''}
          ${line.generation ? '<span style="font-size:.78rem;color:var(--text3);margin-left:4px">'+line.generation+'</span>' : ''}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div><div style="font-size:.62rem;color:var(--text3)">孵化年</div>
            <div style="font-weight:700">${line.hatch_year || '—'}</div></div>
          <div><div style="font-size:.62rem;color:var(--text3)">個体数</div>
            <div style="font-weight:700;color:var(--green)">${inds.length}頭</div></div>
          <div><div style="font-size:.62rem;color:var(--text3)">ロット数</div>
            <div style="font-weight:700;color:var(--blue)">${lots.length}</div></div>
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('line-new',{editId:'${line.line_id}'})">✏️ 編集</button>
        <button class="btn btn-primary" style="flex:1"
          onclick="routeTo('ind-list',{line_id:'${line.line_id}'})">個体一覧</button>
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('lot-list',{line_id:'${line.line_id}'})">ロット一覧</button>
      </div>

      <div class="card">
        <div class="card-title">ライン情報</div>
        <div class="info-list">
          ${bld ? _lnRow('血統',
              `<span style="cursor:pointer;color:var(--blue)"
                onclick="routeTo('bloodline-detail',{id:'${bld.bloodline_id}'})">${bld.bloodline_name}</span>
               ${UI.bloodlineBadge(line.bloodline_status)}`) : ''}
          ${_lnRow('♂親', f
            ? `<span style="cursor:pointer;color:var(--blue)"
                onclick="routeTo('parent-detail',{id:'${f.par_id}'})">${f.display_name}${f.size_mm?' '+f.size_mm+'mm':''}</span>`
            : (line.father_par_id || '—'))}
          ${_lnRow('♀親', m
            ? `<span style="cursor:pointer;color:var(--blue)"
                onclick="routeTo('parent-detail',{id:'${m.par_id}'})">${m.display_name}${m.size_mm?' '+m.size_mm+'mm':''}</span>`
            : (line.mother_par_id || '—'))}
          ${line.characteristics ? _lnRow('特徴', line.characteristics) : ''}
          ${line.hypothesis_tags ? _lnRow('仮説タグ', line.hypothesis_tags) : ''}
          ${line.note_private    ? _lnRow('内部メモ', line.note_private) : ''}
        </div>
      </div>

    </div>`;
}

function _lnRow(key, val) {
  return `<div class="info-row">
    <span class="info-key">${key}</span>
    <span class="info-val">${val}</span>
  </div>`;
}

// ── ライン登録・編集 ─────────────────────────────────────────────
Pages.lineNew = function (params = {}) {
  const main   = document.getElementById('main');
  const isEdit = !!params.editId;
  const line   = isEdit ? Store.getLine(params.editId) : null;
  const pars   = Store.getDB('parents')    || [];
  const blds   = Store.getDB('bloodlines') || [];
  const males  = pars.filter(p => p.sex === '♂' && (!p.status || p.status === 'active'));
  const females= pars.filter(p => p.sex === '♀' && (!p.status || p.status === 'active'));
  const v = (f, d = '') => line ? (line[f] !== undefined ? line[f] : d) : (params[f] || d);
  const curYear = new Date().getFullYear();

  main.innerHTML = `
    ${UI.header(isEdit ? 'ライン編集' : 'ライン登録', {})}
    <div class="page-body">
      <form id="line-form" class="form-section">

        <div class="form-title">ライン識別</div>
        <div class="form-row-2">
          ${UI.field('孵化年', UI.input('hatch_year', 'number', v('hatch_year', curYear), '例: 2025'), true)}
          ${UI.field('ラインコード', UI.input('line_code', 'text', v('line_code'), '例: A1 / B2'), true)}
        </div>
        ${UI.field('ライン名（任意）', UI.input('line_name', 'text', v('line_name'), '例: GGB超大型ライン'))}

        <div class="form-title">産地・累代</div>
        <div class="form-row-2">
          ${UI.field('産地', UI.input('locality', 'text', v('locality', 'Guadeloupe')))}
          ${UI.field('累代', UI.input('generation', 'text', v('generation'), '例: WF1 / CBF2'))}
        </div>

        <div class="form-title">血統・種親</div>
        ${UI.field('血統',
          UI.select('bloodline_id',
            blds.map(b => ({ code: b.bloodline_id, label: b.abbreviation || b.bloodline_name })),
            v('bloodline_id')))}
        ${UI.field('血統ステータス',
          UI.select('bloodline_status', [
            { code:'confirmed',  label:'✅ 確定' },
            { code:'temporary',  label:'⚠️ 暫定' },
            { code:'unknown',    label:'❓ 不明' },
          ], v('bloodline_status', 'unknown')))}
        ${UI.field('♂親',
          UI.select('father_par_id',
            males.map(p => ({ code: p.par_id, label: `${p.display_name}${p.size_mm?' '+p.size_mm+'mm':''}` })),
            v('father_par_id')))}
        ${UI.field('♀親',
          UI.select('mother_par_id',
            females.map(p => ({ code: p.par_id, label: `${p.display_name}${p.size_mm?' '+p.size_mm+'mm':''}` })),
            v('mother_par_id')))}

        <div class="form-title">メモ</div>
        ${UI.field('特徴', UI.textarea('characteristics', v('characteristics'), 2, '例: 父175mm × 母大型系'))}
        ${UI.field('仮説タグ', UI.input('hypothesis_tags', 'text', v('hypothesis_tags'), '例: 高タンパク,pH6.2'))}
        ${UI.field('内部メモ', UI.textarea('note_private', v('note_private'), 2, ''))}

        ${isEdit ? UI.field('ステータス',
          UI.select('status', [
            { code:'active', label:'進行中' },
            { code:'closed', label:'終了' },
          ], v('status', 'active'))) : ''}

        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="button" class="btn btn-ghost" style="flex:1"
            onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2"
            onclick="Pages._lineSave('${isEdit ? params.editId : ''}')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>`;
};

Pages._lineSave = async function (editId) {
  const form = document.getElementById('line-form');
  if (!form) return;
  const data = UI.collectForm(form);
  if (!data.hatch_year) { UI.toast('孵化年を入力してください', 'error'); return; }
  if (!data.line_code)  { UI.toast('ラインコードを入力してください', 'error'); return; }
  try {
    if (editId) {
      data.line_id = editId;
      await apiCall(() => API.line.update(data), '更新しました');
      Store.patchDBItem('lines', 'line_id', editId, data);
      routeTo('line-detail', { id: editId });
    } else {
      const res = await apiCall(() => API.line.create(data), 'ラインを登録しました');
      await syncAll(true);
      routeTo('line-detail', { id: res.line_id });
    }
  } catch (e) {}
};

PAGES['manage']      = () => Pages.manage();
PAGES['line-list']   = () => Pages.lineList();
PAGES['line-detail'] = () => Pages.lineDetail(Store.getParams().id);
PAGES['line-new']    = () => Pages.lineNew(Store.getParams());
