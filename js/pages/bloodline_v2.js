// ════════════════════════════════════════════════════════════════
// bloodline_v2.js — 血統管理画面（Phase2拡張）
// 血統原文 → タグ自動抽出 → ユーザー修正 → 保存
// ════════════════════════════════════════════════════════════════
'use strict';

// 既存Pages.bloodlineListを上書き拡張
Pages.bloodlineList = function () {
  const main = document.getElementById('main');
  const all = Store.getDB('bloodlines') || [];

  // BLD-UNKNOWN は末尾に
  const user = all.filter(b => b.bloodline_id !== 'BLD-UNKNOWN');
  const unk  = all.find(b => b.bloodline_id === 'BLD-UNKNOWN');
  const list = unk ? [...user, unk] : user;

  main.innerHTML = `
    ${UI.header('血統管理', { action: { fn: "routeTo('bloodline-new')", icon: '+' } })}
    <div class="page-body">
      ${list.length === 0
        ? UI.empty('血統が登録されていません')
        : list.map(b => _bldCard(b)).join('')
      }
    </div>`;
};

function _bldCard(b) {
  const tags = _parseTags(b.bloodline_tags);
  const isUnknown = b.bloodline_id === 'BLD-UNKNOWN';
  return `
    <div class="card card-row" onclick="routeTo('bloodline-detail','${b.bloodline_id}')">
      <div class="card-main">
        <div class="card-title">${b.bloodline_name || '名称未設定'}
          ${isUnknown ? '<span class="badge badge-gray">不明</span>' : ''}
        </div>
        ${b.bloodline_raw
          ? `<div class="card-sub text-mono">${b.bloodline_raw}</div>`
          : ''}
        ${tags.length
          ? `<div class="tag-row">${tags.map(t => `<span class="tag tag-gold">${t}</span>`).join('')}</div>`
          : ''}
      </div>
      <span class="card-arrow">›</span>
    </div>`;
}

Pages.bloodlineNew = function () {
  const main = document.getElementById('main');
  main.innerHTML = `
    ${UI.header('血統を登録', { back: true })}
    <div class="page-body">
      <div class="form-section">
        <label class="form-label">血統原文（ヤフオク表記）</label>
        <input id="inp-raw" class="form-input text-mono" type="text"
               placeholder="例: LS175xNo120.U71U6I-FF.FOX-FOX"
               oninput="_bldAutoExtract()">
        <div class="form-hint">入力すると血統タグを自動抽出します</div>
      </div>

      <div class="form-section" id="tag-section" style="display:none">
        <label class="form-label">抽出タグ <span class="badge badge-green">自動</span></label>
        <div id="tag-preview" class="tag-row"></div>
        <div class="form-hint">タップで削除 / 下の入力で追加</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="inp-tag-add" class="form-input" type="text"
                 placeholder="タグを追加" style="flex:1">
          <button class="btn btn-sm" onclick="_bldAddTag()">追加</button>
        </div>
      </div>

      <div class="form-section">
        <label class="form-label">血統名（管理用）</label>
        <input id="inp-name" class="form-input" type="text"
               placeholder="例: FFライン / LSライン">
      </div>

      <div class="form-section">
        <label class="form-label">父系タグ（父親側の血統）</label>
        <input id="inp-ptags" class="form-input" type="text"
               placeholder="例: LS,FF,U71">
        <div class="form-hint">カンマ区切りで入力</div>
      </div>
      <div class="form-section">
        <label class="form-label">母系タグ（母親側の血統）</label>
        <input id="inp-mtags" class="form-input" type="text"
               placeholder="例: FOX,U6I">
      </div>

      <div class="form-section">
        <label class="form-label">説明・特徴</label>
        <textarea id="inp-desc" class="form-input" rows="3"
                  placeholder="血統の特徴や由来を記入"></textarea>
      </div>

      <div class="form-section">
        <label class="form-label">自己最高サイズ(mm)</label>
        <input id="inp-size" class="form-input" type="number" step="0.1" placeholder="例: 175.0">
      </div>

      <button class="btn btn-primary btn-full" style="margin-top:24px"
              onclick="_bldSave()">💾 血統を登録</button>
    </div>`;
};

// 抽出中タグの一時保持
let _bldTags = [];

async function _bldAutoExtract() {
  const raw = document.getElementById('inp-raw').value.trim();
  if (!raw) {
    document.getElementById('tag-section').style.display = 'none';
    return;
  }
  try {
    const res = await API.phase2.extractTags(raw);
    _bldTags = res.tags || [];
    _bldRenderTags();
    document.getElementById('tag-section').style.display = '';
    // 血統名が空なら自動生成
    const nameInp = document.getElementById('inp-name');
    if (!nameInp.value) nameInp.value = _bldTags.slice(0,3).join('-') || raw.slice(0,20);
  } catch(e) {
    // オフライン時はクライアント側で抽出
    _bldTags = _clientExtractTags(raw);
    _bldRenderTags();
    document.getElementById('tag-section').style.display = '';
  }
}

function _bldRenderTags() {
  const el = document.getElementById('tag-preview');
  if (!el) return;
  el.innerHTML = _bldTags.map((t,i) =>
    `<span class="tag tag-gold tag-removable" onclick="_bldRemoveTag(${i})">${t} ✕</span>`
  ).join('');
}

function _bldRemoveTag(i) {
  _bldTags.splice(i, 1);
  _bldRenderTags();
}

function _bldAddTag() {
  const v = document.getElementById('inp-tag-add').value.trim().toUpperCase();
  if (!v || _bldTags.includes(v)) return;
  _bldTags.push(v);
  _bldRenderTags();
  document.getElementById('inp-tag-add').value = '';
}

// クライアント側タグ抽出（GAS不要のフォールバック）
function _clientExtractTags(raw) {
  const DICT = ['T117','FF','FOX','TREX','OAKS','LS','U71','U6I','MX'];
  const tokens = raw.split(/[x×.\-_\s]+/i).map(t => t.trim()).filter(Boolean);
  const tags = new Set();
  tokens.forEach(t => {
    if (/^\d+$/.test(t) || /^No\d/i.test(t) || /^vol/i.test(t) || /mm$/i.test(t)) return;
    const up = t.toUpperCase();
    if (DICT.includes(up)) { tags.add(up); return; }
    if (/^[A-Z][A-Z0-9]{1,}$/i.test(t) && !/^\d/.test(t)) tags.add(up);
  });
  return Array.from(tags);
}

async function _bldSave() {
  const raw  = document.getElementById('inp-raw').value.trim();
  const name = document.getElementById('inp-name').value.trim();
  if (!name) { UI.toast('血統名を入力してください'); return; }

  const pTagsRaw = document.getElementById('inp-ptags').value.trim();
  const mTagsRaw = document.getElementById('inp-mtags').value.trim();
  const pTags = pTagsRaw ? JSON.stringify(pTagsRaw.split(',').map(t=>t.trim()).filter(Boolean)) : '[]';
  const mTags = mTagsRaw ? JSON.stringify(mTagsRaw.split(',').map(t=>t.trim()).filter(Boolean)) : '[]';

  const payload = {
    bloodline_name:  name,
    bloodline_raw:   raw,
    bloodline_tags:  JSON.stringify(_bldTags),
    paternal_tags:   pTags,
    maternal_tags:   mTags,
    description:     document.getElementById('inp-desc').value.trim(),
    best_size_mm:    document.getElementById('inp-size').value.trim(),
  };

  try {
    UI.loading(true);
    await API.phase2.createBloodline(payload);
    await Store.refreshDB();
    UI.toast('血統を登録しました');
    routeTo('bloodline-list');
  } catch(e) {
    UI.toast('エラー: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
}

Pages.bloodlineDetail = function (bloodlineId) {
  const main = document.getElementById('main');
  const all  = Store.getDB('bloodlines') || [];
  const b    = all.find(x => x.bloodline_id === bloodlineId);
  if (!b) { main.innerHTML = UI.header('血統詳細', {back:true}) + UI.empty('見つかりません'); return; }

  const tags  = _parseTags(b.bloodline_tags);
  const pTags = _parseTags(b.paternal_tags);
  const mTags = _parseTags(b.maternal_tags);

  main.innerHTML = `
    ${UI.header('血統詳細', { back: true })}
    <div class="page-body">
      <div class="detail-card">
        <div class="detail-title">${b.bloodline_name}</div>
        ${b.bloodline_raw
          ? `<div class="detail-raw text-mono">${b.bloodline_raw}</div>` : ''}

        ${tags.length ? `
        <div class="detail-section">
          <div class="detail-label">血統タグ</div>
          <div class="tag-row">${tags.map(t=>`<span class="tag tag-gold">${t}</span>`).join('')}</div>
        </div>` : ''}

        ${(pTags.length || mTags.length) ? `
        <div class="detail-section">
          <div class="detail-label">父系タグ</div>
          <div class="tag-row">${pTags.map(t=>`<span class="tag tag-blue">${t}</span>`).join('') || '<span class="text-gray">未設定</span>'}</div>
          <div class="detail-label" style="margin-top:8px">母系タグ</div>
          <div class="tag-row">${mTags.map(t=>`<span class="tag tag-amber">${t}</span>`).join('') || '<span class="text-gray">未設定</span>'}</div>
        </div>` : ''}

        ${UI.detailRow('最高サイズ', b.best_size_mm ? b.best_size_mm + 'mm' : '未記録')}
        ${UI.detailRow('説明', b.description || '—')}
        ${UI.detailRow('ID', b.bloodline_id)}
      </div>
    </div>`;
};

function _parseTags(json) {
  try { return JSON.parse(json) || []; } catch(e) { return []; }
}
