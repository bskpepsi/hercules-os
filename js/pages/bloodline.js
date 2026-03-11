// ════════════════════════════════════════════════════════════════
// bloodline.js
// 役割: 血統の一覧・詳細・登録・編集を担う。
//       confirmed/temporary/unknown の3段階ステータス管理。
//       BLD-UNKNOWN（不明血統）は自動生成されるシステム予約IDで
//       一覧から区別して表示する。
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 血統一覧 ────────────────────────────────────────────────────
Pages.bloodlineList = function () {
  const main = document.getElementById('main');
  let statusFilter = '';

  function render() {
    const all  = Store.getDB('bloodlines') || [];
    // BLD-UNKNOWNは末尾に表示
    const user = all.filter(b => b.bloodline_id !== 'BLD-UNKNOWN');
    const unk  = all.find(b => b.bloodline_id === 'BLD-UNKNOWN');
    let list   = statusFilter
      ? user.filter(b => b.bloodline_status === statusFilter)
      : user;

    main.innerHTML = `
      ${UI.header('血統管理', { action: { fn: "routeTo('bloodline-new')", icon: '＋' } })}
      <div class="page-body">
        <div class="filter-bar">
          <button class="pill ${!statusFilter ? 'active' : ''}"
            onclick="Pages._bldSetStatus('')">全て</button>
          ${Object.values(BLOODLINE_STATUS).map(s =>
            `<button class="pill ${statusFilter === s.code ? 'active' : ''}"
              onclick="Pages._bldSetStatus('${s.code}')">${s.label}</button>`
          ).join('')}
        </div>
        <div class="sec-hdr">
          <span class="sec-title">${list.length}血統</span>
        </div>
        ${list.length
          ? list.map(_bldCardHTML).join('')
          : UI.empty('血統が登録されていません', '右上の＋から登録できます')}
        ${unk && !statusFilter ? `<div style="opacity:.5;margin-top:8px">${_bldCardHTML(unk)}</div>` : ''}
      </div>`;
  }

  Pages._bldSetStatus = (s) => { statusFilter = s; render(); };
  render();
};

function _bldCardHTML(bld) {
  const st = Object.values(BLOODLINE_STATUS).find(s => s.code === bld.bloodline_status);
  const isSystem = bld.bloodline_id === 'BLD-UNKNOWN';
  return `<div class="ind-card" onclick="routeTo('bloodline-detail',{id:'${bld.bloodline_id}'})">
    <div style="text-align:center;min-width:36px">
      <div style="font-size:1.3rem">🧬</div>
      ${st ? `<div style="font-size:.6rem;color:${st.color}">${st.label}</div>` : ''}
    </div>
    <div class="ind-card-body">
      <div class="ind-card-row">
        <span class="ind-card-id">${bld.bloodline_name}</span>
        ${bld.abbreviation
          ? `<span style="font-size:.72rem;color:var(--text3)">(${bld.abbreviation})</span>`
          : ''}
        ${isSystem
          ? `<span style="font-size:.62rem;color:var(--text3)">システム</span>`
          : ''}
      </div>
      ${(bld.best_size_mm || bld.best_weight_g)
        ? `<div style="font-size:.78rem;color:var(--gold)">
            実績: ${bld.best_size_mm ? bld.best_size_mm+'mm' : ''}${bld.best_weight_g ? ' / '+bld.best_weight_g+'g' : ''}
           </div>`
        : ''}
      ${bld.feature_tags
        ? `<div style="font-size:.7rem;color:var(--text3)">${bld.feature_tags}</div>`
        : ''}
    </div>
    <div style="color:var(--text3);font-size:1.2rem">›</div>
  </div>`;
}

// ── 血統詳細 ────────────────────────────────────────────────────
Pages.bloodlineDetail = function (bldId) {
  const main = document.getElementById('main');
  if (!bldId) { main.innerHTML = UI.empty('IDが指定されていません'); return; }

  const bld = Store.getBloodline(bldId);
  if (!bld) {
    // キャッシュになければGASから取得
    API.bloodline.get(bldId).then(res => {
      Store.addDBItem('bloodlines', res.bloodline);
      _renderBldDetail(res.bloodline, main);
    }).catch(e => {
      main.innerHTML = UI.header('エラー', {}) +
        `<div class="page-body">${UI.empty('取得失敗: ' + e.message)}</div>`;
    });
    main.innerHTML = UI.header('血統詳細', {}) + UI.spinner();
    return;
  }
  _renderBldDetail(bld, main);
};

function _renderBldDetail(bld, main) {
  const st = Object.values(BLOODLINE_STATUS).find(s => s.code === bld.bloodline_status);
  // この血統を使っているラインを集計
  const lines = (Store.getDB('lines') || []).filter(l => l.bloodline_id === bld.bloodline_id);
  // 使用個体数
  const indCount = (Store.getDB('individuals') || [])
    .filter(i => i.bloodline_id === bld.bloodline_id && i.status !== 'dead').length;

  main.innerHTML = `
    ${UI.header(bld.bloodline_name, {})}
    <div class="page-body">

      <div class="card card-gold">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          <span style="font-size:2.2rem">🧬</span>
          <div style="flex:1">
            <div style="font-size:1.05rem;font-weight:700">${bld.bloodline_name}</div>
            ${bld.abbreviation
              ? `<div style="font-size:.82rem;color:var(--text3);font-family:var(--font-mono)">${bld.abbreviation}</div>`
              : ''}
          </div>
          ${st ? `<span class="badge" style="color:${st.color};background:${st.color}18;border:1px solid ${st.color}44">${st.label}</span>` : ''}
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          ${bld.best_size_mm  ? `<div><div style="font-size:.65rem;color:var(--text3)">最大サイズ</div>
            <div style="font-size:1.2rem;font-weight:700;color:var(--gold)">${bld.best_size_mm}mm</div></div>` : ''}
          ${bld.best_weight_g ? `<div><div style="font-size:.65rem;color:var(--text3)">最大体重</div>
            <div style="font-size:1.2rem;font-weight:700;color:var(--green)">${bld.best_weight_g}g</div></div>` : ''}
          <div><div style="font-size:.65rem;color:var(--text3)">使用ライン</div>
            <div style="font-size:1.2rem;font-weight:700;color:var(--text)">${lines.length}</div></div>
          <div><div style="font-size:.65rem;color:var(--text3)">飼育個体</div>
            <div style="font-size:1.2rem;font-weight:700;color:var(--text)">${indCount}</div></div>
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('bloodline-new',{editId:'${bld.bloodline_id}'})">✏️ 編集</button>
        ${indCount
          ? `<button class="btn btn-ghost" style="flex:1"
              onclick="routeTo('ind-list',{bloodline_id:'${bld.bloodline_id}'})">個体一覧</button>`
          : ''}
      </div>

      <div class="card">
        <div class="card-title">血統情報</div>
        <div class="info-list">
          ${bld.description  ? _bldRow('説明',    bld.description)  : ''}
          ${bld.father_line  ? _bldRow('父系',    bld.father_line)  : ''}
          ${bld.mother_line  ? _bldRow('母系',    bld.mother_line)  : ''}
          ${bld.feature_tags ? _bldRow('特徴タグ', bld.feature_tags) : ''}
          ${bld.external_source
            ? _bldRow('外部ソース',
                `<a href="${bld.external_source}" target="_blank"
                  style="color:var(--blue)">🔗 リンクを開く</a>`)
            : ''}
          ${bld.note ? _bldRow('メモ', bld.note) : ''}
        </div>
      </div>

      ${lines.length ? `<div class="card">
        <div class="card-title">使用ライン（${lines.length}件）</div>
        ${lines.map(l => `
          <div style="display:flex;align-items:center;padding:8px 0;
            border-bottom:1px solid var(--border);cursor:pointer"
            onclick="routeTo('line-detail',{id:'${l.line_id}'})">
            <div style="flex:1">
              <span style="color:var(--blue);font-family:var(--font-mono);font-size:.85rem">
                ${l.display_id}
              </span>
              ${l.line_name
                ? `<span style="color:var(--text3);font-size:.75rem"> / ${l.line_name}</span>`
                : ''}
            </div>
            <span style="color:var(--text3);font-size:.75rem">${l.hatch_year || ''}</span>
          </div>`).join('')}
      </div>` : ''}

    </div>`;
}

function _bldRow(key, val) {
  return `<div class="info-row">
    <span class="info-key">${key}</span>
    <span class="info-val">${val}</span>
  </div>`;
}

// ── 血統登録・編集 ───────────────────────────────────────────────
Pages.bloodlineNew = function (params = {}) {
  const main   = document.getElementById('main');
  const isEdit = !!params.editId;
  const bld    = isEdit ? Store.getBloodline(params.editId) : null;
  const v = (f, d = '') => bld ? (bld[f] !== undefined ? bld[f] : d) : d;

  main.innerHTML = `
    ${UI.header(isEdit ? '血統編集' : '血統登録', { back: true })}
    <div class="page-body">
      <form id="bld-form" class="form-section">

        <div class="form-title">血統名</div>
        ${UI.field('血統名',
          UI.input('bloodline_name', 'text', v('bloodline_name'), '例: GGB Super血統'), true)}
        <div class="form-row-2">
          ${UI.field('略称',
            UI.input('abbreviation', 'text', v('abbreviation'), '例: GGB'))}
          ${UI.field('確定状態',
            UI.select('bloodline_status', [
              { code:'confirmed',  label:'✅ 確定' },
              { code:'temporary',  label:'⚠️ 暫定' },
              { code:'unknown',    label:'❓ 不明' },
            ], v('bloodline_status', 'unknown')))}
        </div>

        <div class="form-title">詳細情報</div>
        ${UI.field('説明',
          UI.textarea('description', v('description'), 2, '血統の来歴・特徴を記述'))}
        <div class="form-row-2">
          ${UI.field('父系特徴', UI.input('father_line', 'text', v('father_line'), '例: 長角系'))}
          ${UI.field('母系特徴', UI.input('mother_line', 'text', v('mother_line'), '例: 大型安定系'))}
        </div>
        ${UI.field('特徴タグ',
          UI.input('feature_tags', 'text', v('feature_tags'), '例: 長角,大型,安定（カンマ区切り）'))}

        <div class="form-title">実績</div>
        <div class="form-row-2">
          ${UI.field('最大サイズ(mm)',
            UI.input('best_size_mm', 'number', v('best_size_mm'), '例: 185'))}
          ${UI.field('最大体重(g)',
            UI.input('best_weight_g', 'number', v('best_weight_g'), '例: 170'))}
        </div>

        <div class="form-title">ソース</div>
        ${UI.field('外部ソースURL',
          UI.input('external_source', 'url', v('external_source'), 'https://'))}
        ${UI.field('メモ', UI.textarea('note', v('note'), 2, ''))}

        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="button" class="btn btn-ghost" style="flex:1"
            onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2"
            onclick="Pages._bldSave('${isEdit ? params.editId : ''}')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>`;
};

Pages._bldSave = async function (editId) {
  const form = document.getElementById('bld-form');
  if (!form) return;
  const data = UI.collectForm(form);
  if (!data.bloodline_name) { UI.toast('血統名を入力してください', 'error'); return; }
  try {
    if (editId) {
      data.bloodline_id = editId;
      await apiCall(() => API.bloodline.update(data), '更新しました');
      Store.patchDBItem('bloodlines', 'bloodline_id', editId, data);
      routeTo('bloodline-detail', { id: editId });
    } else {
      const res = await apiCall(() => API.bloodline.create(data), '血統を登録しました');
      await syncAll(true);
      routeTo('bloodline-detail', { id: res.bloodline_id });
    }
  } catch (e) {}
};

PAGES['bloodline-list']   = () => Pages.bloodlineList();
PAGES['bloodline-detail'] = () => Pages.bloodlineDetail(Store.getParams().id);
PAGES['bloodline-new']    = () => Pages.bloodlineNew(Store.getParams());
