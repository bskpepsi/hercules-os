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
          <button class="btn btn-ghost" onclick="routeTo('label-gen')"
            style="grid-column:span 2;border-color:rgba(200,168,75,.4);color:var(--gold)">
            🏷️ ラベル発行・QRコード生成
          </button>
        </div>
      </div>

    </div>`;

  // Phase2: 分析セクションをDOMに後追加
  const pb = main.querySelector('.page-body');
  if (pb) {
    pb.insertAdjacentHTML('beforeend', `
      <div class="card" style="margin-top:8px">
        <div class="card-title">📊 分析・ランキング</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-ghost" onclick="routeTo('parent-dashboard')">🌡️ 種親ダッシュボード</button>
          <button class="btn btn-ghost" onclick="routeTo('line-analysis')">📈 ライン分析</button>
          <button class="btn btn-ghost" onclick="routeTo('mother-ranking')">♀ 母系ランキング</button>
          <button class="btn btn-ghost" onclick="routeTo('heatmap')">🗺️ 血統ヒートマップ</button>
        </div>
      </div>`);
  }
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
  // ラインコードを主役に（例: A1、B3）
  const lineCode = line.line_code || line.display_id || '?';
  const year     = line.hatch_year || '—';
  // 血統ステータスの色
  const bldStatus = line.bloodline_status;
  const bldColor  = bldStatus === 'confirmed' ? 'var(--green)'
                  : bldStatus === 'unknown'   ? 'var(--amber)' : 'var(--text3)';
  const bldLabel  = bldStatus === 'confirmed' ? '確定'
                  : bldStatus === 'unknown'   ? '不明' : '無血統';
  // 血統名
  const bldName = (function(){
    if (line.bloodline_id && line.bloodline_id !== 'BLD-UNKNOWN') {
      const bld = (Store.getDB('bloodlines')||[]).find(b => b.bloodline_id === line.bloodline_id);
      if (bld && bld.abbreviation) return bld.abbreviation;
      if (bld && bld.bloodline_name) return bld.bloodline_name;
    }
    return line.line_name || null;
  })();

  return `<div class="card" style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:14px"
    onclick="routeTo('line-detail',{id:'${line.line_id}'})">

    <!-- 左：ラインコード主役 -->
    <div style="min-width:52px;text-align:center">
      <div style="font-family:var(--font-mono);font-size:1.35rem;font-weight:800;color:var(--gold);line-height:1">${lineCode}</div>
      <div style="font-size:.72rem;color:var(--text3);margin-top:3px">${year}</div>
    </div>

    <!-- 中：補助情報 -->
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:.72rem;padding:1px 7px;border-radius:20px;border:1px solid ${bldColor};color:${bldColor}">${bldLabel}</span>
        ${bldName ? `<span style="font-size:.8rem;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${bldName}</span>` : ''}
      </div>
      <div style="font-size:.75rem;color:var(--text3);margin-top:4px">
        ${line.locality || ''}${(line.locality && line.generation) ? ' / ' : ''}${line.generation || ''}
      </div>
      ${(f || m) ? `<div style="font-size:.7rem;color:var(--text3);margin-top:2px">
        ${f ? '♂ '+f.display_name : ''}${(f&&m)?' × ':''}${m ? '♀ '+m.display_name : ''}
      </div>` : ''}
    </div>

    <div style="color:var(--text3);font-size:1.1rem">›</div>
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
  if (lineId && typeof lineId === 'object') lineId = lineId.id || lineId.lineId || '';
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
  const f    = Store.getParent(line.father_par_id);
  const m    = Store.getParent(line.mother_par_id);
  const bld  = Store.getBloodline(line.bloodline_id);
  const blds = Store.getDB('bloodlines') || [];
  const fBld = f && f.bloodline_id ? blds.find(b=>b.bloodline_id===f.bloodline_id) : null;
  const mBld = m && m.bloodline_id ? blds.find(b=>b.bloodline_id===m.bloodline_id) : null;

  // このラインに属する個体・ロット（全状態）
  const allLots    = (Store.getDB('lots') || []).filter(l => l.line_id === line.line_id);
  const activeLots = allLots.filter(l => l.status === 'active');
  const allInds    = Store.getIndividualsByLine(line.line_id);
  const aliveInds  = allInds.filter(i => i.status !== 'dead');

  // 産卵セット紐づき（このラインの line_id を持つセット）
  const pairings = (Store.getDB('pairings') || []).filter(p => p.line_id === line.line_id);

  // 採卵数 = 産卵セットの total_eggs 合計（採卵記録の合計）
  const totalEggs    = pairings.reduce((s, p) => s + (parseInt(p.total_eggs, 10) || 0), 0);
  // ロット化済み卵数 = ロットの initial_count 合計
  const lotInitTotal = allLots.reduce((s, l) => s + (parseInt(l.initial_count, 10) || 0), 0);
  // 未ロット卵 = 採卵数 - ロット化済み（マイナスにならないよう保護）
  const unLotEggs    = Math.max(0, totalEggs - lotInitTotal);

  // 親情報ヘルパー
  function _parentInfo(p, pBld, sexColor) {
    if (!p) return '<span style="color:var(--text3)">—（未設定）</span>';
    const bldStr = pBld ? (pBld.abbreviation || pBld.bloodline_name || '') : '';
    const sizeStr = p.size_mm ? ' <strong>' + p.size_mm + 'mm</strong>' : '';
    return '<span style="cursor:pointer;color:' + sexColor + '" onclick="routeTo(\x27parent-detail\x27,{id:\x27' + p.par_id + '\x27})">'
      + p.display_name + sizeStr
      + (bldStr ? '<span style="color:var(--text3);font-size:.78rem"> / ' + bldStr + '</span>' : '')
      + '</span>';
  }


  main.innerHTML = `
    ${UI.header(line.display_id + ' 詳細', { back: true, action: { fn: "routeTo('line-new',{editId:'${line.line_id}'})", icon: '✏️' } })}
    <div class="page-body">

      <!-- サマリーカード -->
      <div class="card card-gold" style="padding:14px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between">
          <div>
            <div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--gold)">${line.display_id}</div>
            <div style="font-size:.82rem;color:var(--text2);margin-top:2px">
              ${line.line_name || ''}
              ${line.locality ? '&nbsp;·&nbsp;' + line.locality : ''}
              ${line.generation ? '&nbsp;·&nbsp;' + line.generation : ''}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:.65rem;color:var(--text3)">孵化年</div>
            <div style="font-weight:700">${line.hatch_year || '—'}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:12px">
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">ロット</div>
            <div style="font-weight:700;font-size:1rem;color:var(--blue)">${activeLots.length}</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">個体</div>
            <div style="font-weight:700;font-size:1rem;color:var(--green)">${aliveInds.length}</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">採卵数</div>
            <div style="font-weight:700;font-size:1rem;color:var(--amber)">${totalEggs}</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">未ロット卵</div>
            <div style="font-weight:700;font-size:1rem;color:var(--text2)">${unLotEggs}</div>
          </div>
        </div>
      </div>

      <!-- 主要アクションボタン -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button style="flex:1;padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.9rem;
          background:var(--blue);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px"
          onclick="routeTo('lot-list',{line_id:'${line.line_id}'})">
          📦 ロット一覧<br><span style="font-size:1.1rem">${activeLots.length}</span>
        </button>
        <button style="flex:1;padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.9rem;
          background:var(--green);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px"
          onclick="routeTo('ind-list',{line_id:'${line.line_id}'})">
          🐛 個体一覧<br><span style="font-size:1.1rem">${aliveInds.length}</span>
        </button>
        <button style="grid-column:1/2;padding:12px 8px;border-radius:var(--radius);font-weight:700;font-size:.88rem;
          background:var(--gold);color:#1a1a1a;border:none;cursor:pointer"
          onclick="routeTo('lot-new',{lineId:'${line.line_id}'})">
          ＋ ロット追加
        </button>
        <button style="grid-column:2/3;padding:12px 8px;border-radius:var(--radius);font-weight:700;font-size:.88rem;
          background:var(--surface3,#3a3a4a);color:var(--text1);border:1px solid var(--border);cursor:pointer"
          onclick="routeTo('ind-new',{lineId:'${line.line_id}'})">
          ＋ 個体追加
        </button>
      </div>

      <!-- 産卵セット紐づき -->
      ${pairings.length ? `
      <div class="card">
        <div class="card-title">🥚 産卵セット (${pairings.length}件)</div>
        ${pairings.map(p => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="font-family:var(--font-mono);font-size:.82rem;color:var(--blue);cursor:pointer"
              onclick="routeTo('pairing-detail',{id:'${p.set_id}'})">
              ${p.display_id}
            </span>
            <span style="font-size:.78rem;color:var(--text3)">${p.pairing_start || '—'}</span>
            <span style="font-size:.78rem">${p.total_eggs ? p.total_eggs + '卵' : ''}</span>
          </div>`).join('')}
      </div>` : ''}

      <!-- 親情報 -->
      <div class="card">
        <div class="card-title">親情報</div>
        <div class="info-list">
          ${_lnRow('<span style="color:var(--male)">♂親</span>', _parentInfo(f, fBld, 'var(--male)'))}
          ${_lnRow('<span style="color:var(--female)">♀親</span>', _parentInfo(m, mBld, 'var(--female)'))}
        </div>
      </div>

      <!-- 血統・ライン情報 -->
      <div class="card">
        <div class="card-title">血統・ライン情報</div>
        <div class="info-list">
          ${bld ? _lnRow('血統',
              '<span style="cursor:pointer;color:var(--blue)" onclick="routeTo(\x27bloodline-detail\x27,{id:\x27' + bld.bloodline_id + '\x27})">' + bld.bloodline_name + '</span>') : ''}
          ${line.locality   ? _lnRow('産地',   line.locality)   : ''}
          ${line.generation ? _lnRow('累代',   line.generation) : ''}
          ${line.characteristics ? _lnRow('特徴', line.characteristics) : ''}
          ${line.hypothesis_tags ? _lnRow('仮説タグ', line.hypothesis_tags) : ''}
          ${line.note_private    ? _lnRow('内部メモ', line.note_private)   : ''}
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
    ${UI.header(isEdit ? 'ライン編集' : 'ライン登録', { back: true })}
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

        <!-- 種親は産卵セットから自動取得のため選択不要 -->

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
            data-edit-id="${isEdit ? params.editId : ''}"
            onclick="Pages._lineSave(this.dataset.editId || '')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>`;
};

Pages._lineSave = async function (editId) {
  // 'undefined' 文字列や空文字は編集なしと判断
  if (!editId || editId === 'undefined') editId = '';
  const form = document.getElementById('line-form');
  if (!form) return;
  const data = UI.collectForm(form);
  if (!data.hatch_year) { UI.toast('孵化年を入力してください', 'error'); return; }
  if (!data.line_code)  { UI.toast('ラインコードを入力してください', 'error'); return; }
  try {
    if (editId) {
      data.line_id = editId;
      await apiCall(() => API.line.update(data), '更新しました');
      await syncAll(true);
      routeTo('line-detail', { id: editId });
    } else {
      const res = await apiCall(() => API.line.create(data), 'ラインを登録しました');
      await syncAll(true);
      routeTo('line-detail', { id: res.line_id });
    }
  } catch (e) {
    UI.toast('エラー: ' + (e.message || '不明'), 'error');
  }
};

window.PAGES = window.PAGES || {};
window.PAGES['manage']      = () => Pages.manage();
window.PAGES['line-list']   = () => Pages.lineList();
window.PAGES['line-detail'] = () => Pages.lineDetail(Store.getParams().id);
window.PAGES['line-new']    = () => Pages.lineNew(Store.getParams());
