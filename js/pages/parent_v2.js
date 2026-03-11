// ════════════════════════════════════════════════════════════════
// parent_v2.js — 種親管理画面（Phase2拡張）
// ・種親ID自動採番（M25-A / F25-01）
// ・後食管理・ペアリング可能日表示
// ・ペアリング履歴（回数・間隔・一覧）
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 種親一覧 ────────────────────────────────────────────────────
Pages.parentList = function () {
  const main    = document.getElementById('main');
  const parents = Store.getDB('parents') || [];
  const active  = parents.filter(p => p.status === 'active');
  const retired = parents.filter(p => p.status !== 'active');

  const males   = active.filter(p => p.sex === '♂');
  const females = active.filter(p => p.sex === '♀');

  main.innerHTML = `
    ${UI.header('種親管理', { action: { fn: "routeTo('parent-new')", icon: '+' } })}
    <div class="page-body">

      <div class="section-title">♂ 種雄（${males.length}頭）</div>
      ${males.length
        ? males.map(_parentCard).join('')
        : UI.empty('種雄が未登録です')}

      <div class="section-title" style="margin-top:20px">♀ 種雌（${females.length}頭）</div>
      ${females.length
        ? females.map(_parentCard).join('')
        : UI.empty('種雌が未登録です')}

      ${retired.length ? `
        <div class="section-title" style="margin-top:20px;color:var(--text-muted)">
          引退・売却済（${retired.length}頭）
        </div>
        ${retired.map(_parentCard).join('')}
      ` : ''}
    </div>`;
};

function _parentCard(p) {
  const pid    = p.parent_display_id || p.display_name || p.par_id;
  const ready  = p.pairing_ready_date;
  const today  = new Date(); today.setHours(0,0,0,0);
  let badge = '';
  if (ready) {
    const diff = Math.floor((new Date(ready) - today) / 86400000);
    if (diff <= 0)      badge = '<span class="badge badge-green">交配可</span>';
    else if (diff <= 7) badge = `<span class="badge badge-amber">あと${diff}日</span>`;
  } else if (p.feeding_start_date) {
    badge = '<span class="badge badge-gray">後食中</span>';
  }

  const tags = _parseTags(p.bloodline_tags);

  return `
    <div class="card card-row" onclick="routeTo('parent-detail','${p.par_id}')">
      <div class="card-main">
        <div class="card-title">${pid} ${p.sex} ${badge}</div>
        <div class="card-sub">${p.size_mm ? p.size_mm + 'mm' : '—'}</div>
        ${tags.length
          ? `<div class="tag-row">${tags.map(t=>`<span class="tag tag-gold">${t}</span>`).join('')}</div>`
          : ''}
      </div>
      <span class="card-arrow">›</span>
    </div>`;
}

// ── 種親詳細 ────────────────────────────────────────────────────
Pages.parentDetail = async function (parId) {
  const main    = document.getElementById('main');
  const parents = Store.getDB('parents') || [];
  const p       = parents.find(x => x.par_id === parId);
  if (!p) { main.innerHTML = UI.header('種親詳細',{back:true}) + UI.empty('見つかりません'); return; }

  const pid    = p.parent_display_id || p.display_name;
  const tags   = _parseTags(p.bloodline_tags);
  const pTags  = _parseTags(p.paternal_tags);
  const mTags  = _parseTags(p.maternal_tags);
  const cTags  = _parseTags(p.child_tags);

  // ペアリング可能状況
  const today = new Date(); today.setHours(0,0,0,0);
  let pairingBadge = '';
  if (p.pairing_ready_date) {
    const diff = Math.floor((new Date(p.pairing_ready_date) - today) / 86400000);
    if (diff <= 0) pairingBadge = '<span class="badge badge-green large">✅ ペアリング可能</span>';
    else pairingBadge = `<span class="badge badge-amber large">📅 あと${diff}日（${p.pairing_ready_date}〜）</span>`;
  }

  main.innerHTML = `
    ${UI.header(pid, { back: true, action: { fn: `_parentEditMenu('${parId}')`, icon: '…' } })}
    <div class="page-body">

      <div class="detail-card">
        <div class="detail-title">${pid} ${p.sex}</div>
        ${pairingBadge ? `<div style="margin:8px 0">${pairingBadge}</div>` : ''}

        ${UI.detailRow('サイズ', p.size_mm ? p.size_mm + 'mm' : '未計測')}
        ${UI.detailRow('体重',   p.weight_g ? p.weight_g + 'g' : '—')}
        ${UI.detailRow('産地',   p.locality  || '—')}
        ${UI.detailRow('世代',   p.generation|| '—')}
        ${UI.detailRow('父親サイズ', p.father_parent_size_mm ? p.father_parent_size_mm+'mm' : '—')}
        ${UI.detailRow('母親サイズ', p.mother_parent_size_mm ? p.mother_parent_size_mm+'mm' : '—')}
        ${UI.detailRow('羽化日', p.eclosion_date || '—')}
        ${UI.detailRow('後食開始日', p.feeding_start_date || '未設定')}
        ${UI.detailRow('交配可能日', p.pairing_ready_date || '—')}
        ${UI.detailRow('ステータス', _parentStatusLabel(p.status))}
      </div>

      ${tags.length ? `
      <div class="detail-card">
        <div class="detail-label">血統タグ</div>
        <div class="tag-row">${tags.map(t=>`<span class="tag tag-gold">${t}</span>`).join('')}</div>
        ${p.bloodline_raw ? `<div class="detail-raw text-mono" style="margin-top:4px;font-size:.78rem;color:var(--text2)">${p.bloodline_raw}</div>` : ''}
            ${(p.paternal_raw || p.maternal_raw) ? `
            <div style="margin-top:6px;font-size:.75rem">
              ${p.paternal_raw ? `<div><span style="color:var(--text3)">父系:</span> <span class="text-mono">${p.paternal_raw}</span></div>` : ''}
              ${p.maternal_raw ? `<div><span style="color:var(--text3)">母系:</span> <span class="text-mono">${p.maternal_raw}</span></div>` : ''}
            </div>` : ''}
      </div>` : ''}

      ${(pTags.length || mTags.length || cTags.length) ? `
      <div class="detail-card">
        <div class="detail-label">系統タグ</div>
        <div class="tag-row-label">父系: ${pTags.map(t=>`<span class="tag tag-blue">${t}</span>`).join('') || '—'}</div>
        <div class="tag-row-label">母系: ${mTags.map(t=>`<span class="tag tag-amber">${t}</span>`).join('') || '—'}</div>
        <div class="tag-row-label">子世代: ${cTags.map(t=>`<span class="tag tag-green">${t}</span>`).join('') || '—'}</div>
      </div>` : ''}

      ${p.sex === '♂' ? `
      <div id="pairing-stats-section">
        <div class="section-title">ペアリング履歴</div>
        <div class="card" style="text-align:center;padding:16px">
          <div class="spinner"></div>
        </div>
      </div>` : ''}

      <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">
        <button class="btn btn-primary" onclick="_parentSetFeeding('${parId}')">
          🍽️ 後食開始日を設定
        </button>
        ${p.sex === '♂' ? `
        <button class="btn btn-secondary" onclick="routeTo('pairing-history','${parId}')">
          📋 ペアリング履歴を見る
        </button>` : ''}
        <button class="btn btn-secondary" onclick="_parentEditStatus('${parId}','${p.status}')">
          ステータス変更
        </button>
      </div>
    </div>`;

  // ♂のペアリング統計を非同期ロード
  if (p.sex === '♂') {
    _loadMalePairingStats(parId);
  }
};

async function _loadMalePairingStats(parId) {
  try {
    const res  = await API.phase2.getMalePairingStats(parId);
    const sec  = document.getElementById('pairing-stats-section');
    if (!sec) return;

    const histories = (res.histories || []).slice(0, 5);
    sec.innerHTML = `
      <div class="section-title">ペアリング履歴</div>
      <div class="detail-card">
        <div class="stats-row">
          <div class="stat-box"><div class="stat-num">${res.total}</div><div class="stat-label">総回数</div></div>
          <div class="stat-box"><div class="stat-num">${res.daysSinceLast !== null ? res.daysSinceLast + '日' : '—'}</div><div class="stat-label">前回から</div></div>
          <div class="stat-box"><div class="stat-num">${res.lastDate || '—'}</div><div class="stat-label">最終日</div></div>
        </div>
        ${histories.length ? `
        <div style="margin-top:12px">
          ${histories.map(h => `
            <div class="history-row">
              <span>${h.pairing_date}</span>
              <span>${h.female_parent_id}</span>
              ${h.interval_from_previous_pairing
                ? `<span class="${parseInt(h.interval_from_previous_pairing) < 7 ? 'text-warn' : 'text-gray'}">間隔: ${h.interval_from_previous_pairing}日</span>`
                : ''}
            </div>
          `).join('')}
        </div>` : ''}
      </div>`;
  } catch(e) {
    const sec = document.getElementById('pairing-stats-section');
    if (sec) sec.innerHTML = `<div class="section-title">ペアリング履歴</div>${UI.empty('読み込み失敗')}`;
  }
}

// ── 種親登録（Phase2） ───────────────────────────────────────
Pages.parentNew = function () {
  const main = document.getElementById('main');
  const year = String(new Date().getFullYear()).slice(-2);

  main.innerHTML = `
    ${UI.header('種親を登録', { back: true })}
    <div class="page-body">

      <div class="form-section">
        <label class="form-label">性別</label>
        <div class="btn-group">
          <button class="btn btn-toggle active" id="sex-male"
                  onclick="_parentSexToggle('♂')">♂ 種雄</button>
          <button class="btn btn-toggle" id="sex-female"
                  onclick="_parentSexToggle('♀')">♀ 種雌</button>
        </div>
      </div>

      <div class="form-section">
        <label class="form-label">種親ID（自動採番）</label>
        <div id="auto-pid" class="auto-id-preview">M${year}-? （登録時に自動決定）</div>
      </div>

      <div class="form-section">
        <label class="form-label">サイズ(mm)</label>
        <input id="inp-size" class="form-input" type="number" step="0.1"
               placeholder="例: 174.5">
      </div>

      <div class="form-section">
        <label class="form-label">体重(g)</label>
        <input id="inp-weight" class="form-input" type="number" step="0.1"
               placeholder="例: 32.5">
      </div>

      <div class="form-section">
        <label class="form-label">父親サイズ(mm)</label>
        <input id="inp-fsize" class="form-input" type="number" step="0.1"
               placeholder="例: 180.0">
      </div>
      <div class="form-section">
        <label class="form-label">母親サイズ(mm)</label>
        <input id="inp-msize" class="form-input" type="number" step="0.1"
               placeholder="例: 65.0">
      </div>

      <!-- ── 血統情報 ── -->
      <div style="font-size:.75rem;font-weight:700;color:var(--text3);letter-spacing:.06em;padding:4px 0 2px">全体血統</div>
      <div class="form-section">
        <label class="form-label">血統原文（ヤフオク等の表記）</label>
        <input id="inp-raw" class="form-input text-mono" type="text"
               placeholder="例: LS175xNo120.U71U6I-FF.FOX-FOX"
               oninput="_parentAutoExtract('blood')">
      </div>
      <div class="form-section" id="tag-section" style="display:none">
        <label class="form-label">血統タグ <span class="badge badge-green">自動抽出・編集可</span></label>
        <div id="tag-preview" class="tag-row"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="inp-tag-add" class="form-input" type="text" placeholder="タグ追加" style="flex:1">
          <button class="btn btn-sm" onclick="_parentAddTag()">追加</button>
        </div>
      </div>

      <div style="font-size:.75rem;font-weight:700;color:var(--text3);letter-spacing:.06em;padding:8px 0 2px">父系</div>
      <div class="form-section">
        <label class="form-label">父系原文</label>
        <input id="inp-praw" class="form-input text-mono" type="text"
               placeholder="例: LS175×No120（父方の血統原文）"
               oninput="_parentAutoExtract('pat')">
      </div>
      <div class="form-section" id="ptag-section" style="display:none">
        <label class="form-label">父系タグ <span class="badge badge-green">自動抽出・編集可</span></label>
        <div id="ptag-preview" class="tag-row"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="inp-ptag-add" class="form-input" type="text" placeholder="タグ追加" style="flex:1">
          <button class="btn btn-sm" onclick="_parentAddTag('pat')">追加</button>
        </div>
      </div>

      <div style="font-size:.75rem;font-weight:700;color:var(--text3);letter-spacing:.06em;padding:8px 0 2px">母系</div>
      <div class="form-section">
        <label class="form-label">母系原文</label>
        <input id="inp-mraw" class="form-input text-mono" type="text"
               placeholder="例: FOX×U6I（母方の血統原文）"
               oninput="_parentAutoExtract('mat')">
      </div>
      <div class="form-section" id="mtag-section" style="display:none">
        <label class="form-label">母系タグ <span class="badge badge-green">自動抽出・編集可</span></label>
        <div id="mtag-preview" class="tag-row"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="inp-mtag-add" class="form-input" type="text" placeholder="タグ追加" style="flex:1">
          <button class="btn btn-sm" onclick="_parentAddTag('mat')">追加</button>
        </div>
      </div>

      <div class="form-section">
        <label class="form-label">羽化日</label>
        <input id="inp-eclosion" class="form-input" type="date">
      </div>

      <div class="form-section">
        <label class="form-label">後食開始日</label>
        <input id="inp-feeding" class="form-input" type="date"
               oninput="_parentCalcReadyDate()">
        <div id="ready-date-preview" class="form-hint"></div>
      </div>

      <div class="form-section">
        <label class="form-label">入手元</label>
        <input id="inp-source" class="form-input" type="text" placeholder="例: ヤフオク 〇〇様">
      </div>

      <button class="btn btn-primary btn-full" style="margin-top:24px"
              onclick="_parentSave()">💾 種親を登録</button>
    </div>`;

  window._parentSelectedSex = '♂';
  window._parentTags = [];
};

window._parentSelectedSex = '♂';
window._parentTags  = [];
window._parentPTags = [];
window._parentMTags = [];

function _parentSexToggle(sex) {
  window._parentSelectedSex = sex;
  const year = String(new Date().getFullYear()).slice(-2);
  document.getElementById('sex-male').classList.toggle('active',   sex === '♂');
  document.getElementById('sex-female').classList.toggle('active', sex === '♀');
  document.getElementById('auto-pid').textContent =
    sex === '♂' ? `M${year}-? （登録時に自動決定）` : `F${year}-?? （登録時に自動決定）`;
  _parentCalcReadyDate();
}

// type: 'blood' | 'pat' | 'mat'
async function _parentAutoExtract(type) {
  const idMap  = { blood: 'inp-raw',  pat: 'inp-praw',  mat: 'inp-mraw' };
  const secMap = { blood: 'tag-section', pat: 'ptag-section', mat: 'mtag-section' };
  const raw    = document.getElementById(idMap[type])?.value?.trim();
  const sec    = document.getElementById(secMap[type]);
  if (!raw) { if (sec) sec.style.display = 'none'; return; }

  let tags = [];
  try {
    const res = await API.phase2.extractTags(raw);
    tags = res.tags || [];
  } catch(e) {
    tags = _clientExtractTags(raw);
  }

  if (type === 'blood') { window._parentTags  = tags; _parentRenderTags('blood'); }
  if (type === 'pat')   { window._parentPTags = tags; _parentRenderTags('pat'); }
  if (type === 'mat')   { window._parentMTags = tags; _parentRenderTags('mat'); }
  if (sec) sec.style.display = '';
}

// type: 'blood' | 'pat' | 'mat'
function _parentRenderTags(type) {
  const elMap  = { blood: 'tag-preview', pat: 'ptag-preview', mat: 'mtag-preview' };
  const tagsMap= { blood: '_parentTags',  pat: '_parentPTags', mat: '_parentMTags' };
  if (type) {
    const el = document.getElementById(elMap[type]);
    if (!el) return;
    const tags = window[tagsMap[type]] || [];
    el.innerHTML = tags.map((t,i) =>
      `<span class="tag tag-gold tag-removable" onclick="_parentRemoveTag(${i},'${type}')">${t} ✕</span>`
    ).join('');
  } else {
    // 後方互換: 引数なし → blood
    _parentRenderTags('blood');
  }
}

function _parentRemoveTag(i, type) {
  type = type || 'blood';
  const key = type === 'blood' ? '_parentTags' : type === 'pat' ? '_parentPTags' : '_parentMTags';
  if (window[key]) { window[key].splice(i, 1); _parentRenderTags(type); }
}


function _parentAddTag(type) {
  type = type || 'blood';
  const inpId  = type === 'blood' ? 'inp-tag-add' : type === 'pat' ? 'inp-ptag-add' : 'inp-mtag-add';
  const key    = type === 'blood' ? '_parentTags'  : type === 'pat' ? '_parentPTags' : '_parentMTags';
  const v      = document.getElementById(inpId)?.value.trim().toUpperCase();
  if (!v || (window[key] || []).includes(v)) return;
  if (!window[key]) window[key] = [];
  window[key].push(v);
  _parentRenderTags(type);
  document.getElementById(inpId).value = '';
}

function _parentCalcReadyDate() {
  const feeding = document.getElementById('inp-feeding').value;
  if (!feeding) { document.getElementById('ready-date-preview').textContent = ''; return; }
  // 設定値から待機日数取得（デフォルト14日）
  const settings = Store.getDB('settings') || {};
  const sex = window._parentSelectedSex;
  const wait = parseInt(
    (sex === '♂' ? settings.male_pairing_wait_days : settings.female_pairing_wait_days) || '14'
  );
  const d = new Date(feeding);
  d.setDate(d.getDate() + wait);
  const dateStr = d.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' });
  document.getElementById('ready-date-preview').textContent =
    `ペアリング可能日: ${dateStr}（後食後${wait}日）`;
}

async function _parentSave() {
  const size = document.getElementById('inp-size').value.trim();
  const sex  = window._parentSelectedSex;
  if (!size) { UI.toast('サイズを入力してください'); return; }

  const payload = {
    sex,
    size_mm:               size,
    weight_g:              document.getElementById('inp-weight').value.trim(),
    father_parent_size_mm: document.getElementById('inp-fsize').value.trim(),
    mother_parent_size_mm: document.getElementById('inp-msize').value.trim(),
    bloodline_raw:         document.getElementById('inp-raw').value.trim(),
    bloodline_tags:        JSON.stringify(window._parentTags  || []),
    paternal_raw:          document.getElementById('inp-praw')?.value.trim() || '',
    paternal_tags:         JSON.stringify(window._parentPTags || []),
    maternal_raw:          document.getElementById('inp-mraw')?.value.trim() || '',
    maternal_tags:         JSON.stringify(window._parentMTags || []),
    eclosion_date:         document.getElementById('inp-eclosion').value,
    feeding_start_date:    document.getElementById('inp-feeding').value,
    source:                document.getElementById('inp-source').value.trim(),
  };

  try {
    UI.loading(true);
    const res = await API.phase2.createParent(payload);
    await syncAll(true);
    UI.toast(`${res.parent_display_id} を登録しました`);
    routeTo('parent-list');
  } catch(e) {
    UI.toast('エラー: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
}

// 後食設定モーダル
function _parentSetFeeding(parId) {
  const today = new Date().toISOString().split('T')[0];
  UI.modal(`
    <div class="modal-title">🍽️ 後食開始日を設定</div>
    <div class="form-section">
      <label class="form-label">後食開始日</label>
      <input id="modal-feeding" class="form-input" type="date" value="${today}">
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" onclick="_parentSaveFeeding('${parId}')">保存</button>
    </div>
  `);
}

async function _parentSaveFeeding(parId) {
  const date = document.getElementById('modal-feeding').value;
  if (!date) { UI.toast('日付を選択してください'); return; }
  try {
    UI.loading(true);
    UI.closeModal();
    await API.phase2.updateParent({ par_id: parId, feeding_start_date: date });
    await syncAll(true);
    UI.toast('後食開始日を設定しました');
    routeTo('parent-detail', parId);
  } catch(e) {
    UI.toast('エラー: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
}

function _parentStatusLabel(s) {
  const m = { active:'活動中', retired:'引退', dead:'死亡', sold:'売却済', reserved:'確保中' };
  return m[s] || s;
}

function _parentEditMenu(parId) {
  UI.actionSheet([
    { label: '✏️ 情報を編集', fn: () => routeTo('parent-detail', parId) },
    { label: '🍽️ 後食日設定', fn: () => _parentSetFeeding(parId) },
    { label: '📋 ペアリング履歴', fn: () => routeTo('pairing-history', parId) },
    { label: '🔄 ステータス変更', fn: () => _parentEditStatus(parId) },
  ]);
}

function _parentEditStatus(parId, current) {
  const statuses = [
    { value: 'active',   label: '活動中' },
    { value: 'retired',  label: '引退' },
    { value: 'dead',     label: '死亡' },
    { value: 'sold',     label: '売却済' },
    { value: 'reserved', label: '確保中' },
  ];
  UI.modal(`
    <div class="modal-title">ステータス変更</div>
    <div class="form-section">
      <select id="modal-status" class="form-input">
        ${statuses.map(s =>
          `<option value="${s.value}" ${s.value === current ? 'selected' : ''}>${s.label}</option>`
        ).join('')}
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" onclick="_parentSaveStatus('${parId}')">変更</button>
    </div>
  `);
}

async function _parentSaveStatus(parId) {
  const status = document.getElementById('modal-status').value;
  try {
    UI.loading(true);
    UI.closeModal();
    await API.phase2.updateParent({ par_id: parId, status });
    await syncAll(true);
    UI.toast('ステータスを変更しました');
    routeTo('parent-detail', parId);
  } catch(e) {
    UI.toast('エラー: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
}

// ── ペアリング履歴ページ ─────────────────────────────────────
Pages.pairingHistory = async function (parId) {
  const main    = document.getElementById('main');
  const parents = Store.getDB('parents') || [];
  const p       = parId ? parents.find(x => x.par_id === parId) : null;
  const title   = p ? (p.parent_display_id || p.display_name) + ' のペアリング履歴' : 'ペアリング履歴';

  main.innerHTML = `
    ${UI.header(title, { back: true, action: { fn: `_phNew('${parId || ''}')`, icon: '+' } })}
    <div class="page-body">
      <div id="ph-list"><div class="spinner-wrap"><div class="spinner"></div></div></div>
    </div>`;

  try {
    const res = await API.phase2.getPairingHistories(parId ? { male_parent_id: parId } : {});
    const histories = res.histories || [];
    const el = document.getElementById('ph-list');
    if (!el) return;

    if (!histories.length) { el.innerHTML = UI.empty('ペアリング履歴がありません'); return; }

    el.innerHTML = histories.map(h => {
      const interval = h.interval_from_previous_pairing;
      const warn = interval && parseInt(interval) < 7;
      return `
        <div class="card card-row">
          <div class="card-main">
            <div class="card-title">${h.pairing_date}</div>
            <div class="card-sub">
              ♂ ${h.male_parent_id} × ♀ ${h.female_parent_id}
              ${h.line_id ? ` → ${h.line_id}` : ''}
            </div>
            ${interval ? `<div class="card-sub ${warn ? 'text-warn' : 'text-gray'}">
              前回から ${interval}日${warn ? ' ⚠️ 間隔短め' : ''}
            </div>` : ''}
            ${h.memo ? `<div class="card-sub">${h.memo}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  } catch(e) {
    const el = document.getElementById('ph-list');
    if (el) el.innerHTML = UI.empty('読み込み失敗: ' + e.message);
  }
};

function _phNew(maleParId) {
  const parents = Store.getDB('parents') || [];
  const females = parents.filter(p => p.sex === '♀' && p.status === 'active');
  const today   = new Date().toISOString().split('T')[0];

  UI.modal(`
    <div class="modal-title">📝 ペアリングを記録</div>
    <div class="form-section">
      <label class="form-label">日付</label>
      <input id="ph-date" class="form-input" type="date" value="${today}">
    </div>
    <div class="form-section">
      <label class="form-label">♀ 種雌</label>
      <select id="ph-female" class="form-input">
        ${females.map(f =>
          `<option value="${f.par_id}">${f.parent_display_id || f.display_name}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-section">
      <label class="form-label">メモ</label>
      <input id="ph-memo" class="form-input" type="text" placeholder="任意">
    </div>
    <div id="ph-interval-warn"></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" onclick="_phSave('${maleParId}')">記録</button>
    </div>
  `);
}

async function _phSave(maleParId) {
  const date   = document.getElementById('ph-date').value;
  const female = document.getElementById('ph-female').value;
  const memo   = document.getElementById('ph-memo').value.trim();
  if (!date || !female) { UI.toast('日付と♀を選択してください'); return; }

  try {
    UI.loading(true);
    UI.closeModal();
    const res = await API.phase2.createPairingHistory({
      pairing_date:     date,
      male_parent_id:   maleParId,
      female_parent_id: female,
      memo,
    });
    if (res.warning) UI.toast('⚠️ ' + res.warning, 'warn');
    else UI.toast('ペアリングを記録しました');
    routeTo('pairing-history', maleParId);
  } catch(e) {
    UI.toast('エラー: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
}

// ── ライン登録（Phase2 自動採番） ───────────────────────────
// ════════════════════════════════════════════════════════════════
// PAGES登録 — parent.js の旧ルーティングを parent_v2 で上書き
// parent_v2.js は parent.js より後に読み込まれるため、
// ここで登録することで確実に v2 の関数が使われる
// ════════════════════════════════════════════════════════════════
// ── ユーティリティ ───────────────────────────────────────────
function _parseTags(json) {
  try { return JSON.parse(json) || []; } catch(e) { return []; }
}

function _clientExtractTags(raw) {
  if (!raw) return [];
  const known = ['T117','FF','FOX','TREX','OAKS','LS','U71','U6I','MX',
    'KING','ROYAL','BLACK','WHITE','GOLD','SILVER','ACE',
    'ZEUS','TITAN','ATLAS','GIANT','MAX','SUPER','HYPER',
    'JKS','YKS','MKS','BKS','DKS','OKS',
    'vol','CBS','WF','WD','WB','WC','SDU'];
  const tokens = raw.split(/[×x\.\-_\s]+/i).map(t=>t.trim()).filter(Boolean);
  const tags = new Set();
  tokens.forEach(t => {
    const up = t.toUpperCase();
    known.forEach(k => { if (up.includes(k)) tags.add(k); });
    if (/^\d{3,}$/.test(t)) tags.add(t);
  });
  return Array.from(tags);
}

PAGES['parent-list']      = () => Pages.parentList();
PAGES['parent-new']       = () => Pages.parentNew(Store.getParams());
PAGES['parent-detail']    = () => Pages.parentDetail(Store.getParams().id);
PAGES['parent-dashboard'] = () => Pages.parentDashboard();
