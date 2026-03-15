// ════════════════════════════════════════════════════════════════
// parent_v2.js — 種親管理画面（Phase2拡張）
// ・種親ID自動採番（M25-A / F25-01）
// ・後食管理・ペアリング可能日表示
// ・ペアリング履歴（回数・間隔・一覧）
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 種親一覧 ────────────────────────────────────────────────────
Pages.parentList = function () {
  const main = document.getElementById('main');
  if (!main) return;

  // ヘッダーを先に描画して真っ黒を防止
  main.innerHTML = UI.header('種親管理', { action: { fn: "routeTo('parent-new')", icon: '+' } })
    + '<div class="page-body" id="parent-list-body">' + UI.spinner() + '</div>';

  try {
    const parents = Store.getDB('parents') || [];
    const active  = parents.filter(p => p && p.status === 'active');
    const retired = parents.filter(p => p && p.status !== 'active');
    const males   = active.filter(p => p.sex === '♂');
    const females = active.filter(p => p.sex === '♀');

    function safeCard(p) {
      try { return _parentCard(p); }
      catch(e) {
        const pid = (p && (p.parent_display_id || p.par_id)) || '?';
        console.error('[_parentCard]', pid, e.message, e, p);
        return `<div class="card" style="border:1px solid var(--red);padding:12px">
          <div style="color:var(--red);font-weight:700">${pid} — エラー: ${e.message}</div>
        </div>`;
      }
    }

    const body = `
      <div class="section-title">♂ 種雄（${males.length}頭）</div>
      ${males.length ? males.map(safeCard).join('') : UI.empty('種雄が未登録です')}

      <div class="section-title" style="margin-top:20px">♀ 種雌（${females.length}頭）</div>
      ${females.length ? females.map(safeCard).join('') : UI.empty('種雌が未登録です')}

      ${retired.length ? `
        <div class="section-title" style="margin-top:20px;color:var(--text3)">
          引退・売却済（${retired.length}頭）
        </div>
        ${retired.map(safeCard).join('')}
      ` : ''}`;

    const bodyEl = document.getElementById('parent-list-body');
    if (bodyEl) bodyEl.innerHTML = body;
    else main.innerHTML = UI.header('種親管理', { action: { fn: "routeTo('parent-new')", icon: '+' } })
      + '<div class="page-body">' + body + '</div>';

  } catch (e) {
    console.error('parentList error:', e);
    const bodyEl = document.getElementById('parent-list-body');
    const errHtml = UI.empty('読み込みエラー: ' + e.message);
    if (bodyEl) bodyEl.innerHTML = errHtml;
  }
};

function _parentCard(p) {
  const pid   = p.parent_display_id || p.display_name || p.par_id;
  const today = new Date(); today.setHours(0,0,0,0);

  // ── ①ステータスバッジ ──
  const STATUS_LABEL = {
    active:   { label: '現役',  color: 'var(--green)' },
    retired:  { label: '引退',  color: 'var(--text3)' },
    dead:     { label: '死亡',  color: 'var(--red)'   },
    sold:     { label: '譲渡',  color: 'var(--amber)'  },
    reserved: { label: '予約',  color: 'var(--blue)'  },
  };
  const st = STATUS_LABEL[p.status] || { label: p.status || '—', color: 'var(--text3)' };
  const statusBadge = `<span style="font-size:.7rem;padding:2px 7px;border-radius:20px;background:rgba(0,0,0,.25);color:${st.color};border:1px solid ${st.color}">${st.label}</span>`;

  // ── 交配可バッジ ──
  let pairingBadge = '';
  const ready = p.pairing_ready_date;
  if (ready) {
    const diff = Math.floor((new Date(ready) - today) / 86400000);
    if (diff <= 0)       pairingBadge = '<span class="badge badge-green">交配可</span>';
    else if (diff <= 7)  pairingBadge = `<span class="badge badge-amber">あと${diff}日</span>`;
    else if (diff <= 14) pairingBadge = `<span class="badge badge-gray">あと${diff}日</span>`;
  } else if (p.feeding_start_date) {
    pairingBadge = '<span class="badge badge-gray">後食中</span>';
  }

  // ── ②サイズ ──
  const sizeLine = p.size_mm ? `<div style="font-size:1.15rem;font-weight:700;color:var(--green)">${p.size_mm}mm</div>` : '';

  // ── ③親サイズ ──
  let parentSizeLine = '';
  if (p.father_parent_size_mm || p.mother_parent_size_mm) {
    const fSize = p.father_parent_size_mm || '?';
    const mSize = p.mother_parent_size_mm || '?';
    parentSizeLine = `<div style="font-size:.8rem;color:var(--text3)">親: ${fSize}×${mSize}</div>`;
  }

  // ── ④血統タグ ──
  const tags = _parseTags(p.bloodline_tags);
  const pTags = _parseTags(p.paternal_tags);
  const allTags = [...new Set([...tags, ...pTags])].slice(0, 6);
  const tagRow = allTags.length
    ? `<div class="tag-row" style="margin:4px 0">${allTags.map(t=>`<span class="tag tag-gold">${t}</span>`).join('')}</div>`
    : '';

  // ── ⑤日付情報 ──
  const fmt = d => d ? String(d).replace(/-/g, '/') : null;
  const dateLines = [];
  if (p.eclosion_date)       dateLines.push(`羽化: ${fmt(p.eclosion_date)}`);
  if (p.feeding_start_date)  dateLines.push(`後食: ${fmt(p.feeding_start_date)}`);
  if (p.pairing_ready_date)  dateLines.push(`交配可: ${fmt(p.pairing_ready_date)}`);
  const dateLine = dateLines.length
    ? `<div style="font-size:.75rem;color:var(--text3);line-height:1.7;margin-top:4px">${dateLines.join('　')}</div>`
    : '';

  // ── ⑥ペアリング統計 ──
  const stats = Store.getPairingStats(p.par_id);
  let statsLine = '';
  if (stats.total > 0) {
    const lastFmt = fmt(stats.lastDate) || '—';
    statsLine = `<div style="font-size:.75rem;color:var(--text3);margin-top:2px">交配回数: ${stats.total}　最終: ${lastFmt}</div>`;
  }

  return `
    <div class="card" onclick="routeTo('parent-detail',{parId:'${p.par_id}'})"
         style="padding:12px 14px;cursor:pointer">

      <!-- 1段目: ID + 性別 + ステータス + 交配可バッジ -->
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
        <span style="font-family:var(--font-mono);font-weight:700;font-size:.95rem;color:var(--gold)">${pid}</span>
        <span style="font-size:1.1rem;color:${p.sex==='♂'?'var(--male)':'var(--female)'}">${p.sex || ''}</span>
        ${statusBadge}
        ${pairingBadge}
      </div>

      <!-- 2段目: サイズ -->
      ${sizeLine}

      <!-- 3段目: 親サイズ -->
      ${parentSizeLine}

      <!-- 4段目: 血統タグ -->
      ${tagRow}

      <!-- 5段目: 日付 -->
      ${dateLine}

      <!-- 6段目: ペアリング統計 -->
      ${statsLine}

    </div>`;
}

// ── 種親詳細 ────────────────────────────────────────────────────
Pages.parentDetail = async function (parIdParam) {
  const main    = document.getElementById('main');
  // routeTo から文字列で渡された場合の防御（routeTo修正で解決済みだが念のため）
  const parId = typeof parIdParam === 'string' ? parIdParam
              : (parIdParam && parIdParam.id ? parIdParam.id : null);
  if (!parId) { main.innerHTML = UI.header('種親詳細',{back:true}) + UI.empty('IDが指定されていません'); return; }
  const parents = Store.getDB('parents') || [];
  // par_id または parent_display_id のどちらで渡されても対応
  const p = parents.find(x => x.par_id === parId)
         || parents.find(x => x.parent_display_id === parId)
         || parents.find(x => x.display_name === parId);
  if (!p) { main.innerHTML = UI.header('種親詳細',{back:true}) + UI.empty('見つかりません (id=' + parId + ')'); return; }

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
        <div class="detail-title">${pid} <span style="color:${p.sex==='♂'?'var(--male)':'var(--female)'}">${p.sex}</span></div>
        ${pairingBadge ? `<div style="margin:8px 0">${pairingBadge}</div>` : ''}

        ${UI.detailRow('サイズ', p.size_mm ? p.size_mm + 'mm' : '未計測')}
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

      ${!p.feeding_start_date ? `
      <div style="margin-top:16px">
        <button class="btn btn-primary btn-full" onclick="_parentSetFeeding('${parId}')">
          🍽️ 後食開始日を設定
        </button>
      </div>` : ''}
    </div>`;

  // ♂のペアリング統計を非同期ロード
  if (p.sex === '♂') {
    _loadMalePairingStats(parId);
  }
};

// ── ペアリング履歴: 統合表示 ─────────────────────────────────────
// 設計:
//   Phase1: ローカルpairingsストアから即時描画（APIなし）
//   Phase2: PAIRING_HISTORYをasync取得してマージ描画
//   将来: 複数履歴・再ペアリング追加にも対応できる構造

// 統一履歴オブジェクトに変換
function _normalizePairingEntry(parId, p, source) {
  if (source === 'pairing') {
    const partnerId = p.father_par_id === parId ? p.mother_par_id : p.father_par_id;
    return {
      _source:    'pairing',
      _id:        p.set_id,
      date:       p.pairing_start || '',
      partner_id: partnerId,
      line_id:    p.line_id,
      status:     p.status,
      memo:       p.set_name || '',
    };
  } else {
    // PAIRING_HISTORY レコード
    return {
      _source:    'history',
      _id:        p.pairing_history_id || p.history_id || '',
      date:       p.pairing_date || '',
      partner_id: p.female_parent_id || p.mother_parent_id || '',
      line_id:    p.line_id || '',
      status:     'recorded',
      memo:       p.memo || '',
    };
  }
}

function _renderPairingHistorySection(parId, entries, isLoading) {
  const sec = document.getElementById('pairing-stats-section');
  if (!sec) return;

  if (!entries.length && !isLoading) {
    sec.innerHTML = `
      <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
        ペアリング履歴
        <button onclick="Pages._addPairingRecord('${parId}')"
          style="font-size:.72rem;padding:4px 10px;border-radius:20px;border:1px solid var(--green);
            background:transparent;color:var(--green);cursor:pointer">＋ 追加</button>
      </div>
      ${UI.empty('ペアリング履歴はまだありません')}`;
    return;
  }

  const parents = Store.getDB('parents') || [];
  const rows = entries.map(e => {
    const partner = parents.find(x => x.par_id === e.partner_id);
    const partnerName = partner
      ? (partner.parent_display_id || partner.display_name || e.partner_id)
      : (e.partner_id || '—');
    const line = Store.getLine(e.line_id);
    const lineStr = line ? `→ <span style="color:var(--gold)">${line.line_code || line.display_id}</span>` : '';
    const srcBadge = e._source === 'history'
      ? `<span style="font-size:.6rem;background:var(--surface2);color:var(--text3);padding:1px 5px;border-radius:8px;margin-left:4px">再ペア</span>`
      : '';
    const statusColor = e.status === 'active' ? 'var(--green)' : 'var(--text3)';
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
        padding:8px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:.85rem;font-weight:600">${e.date || '—'}${srcBadge}</div>
          <div style="font-size:.75rem;color:var(--text3);margin-top:2px">
            相手: <strong>${partnerName}</strong> ${lineStr}
          </div>
          ${e.memo ? `<div style="font-size:.72rem;color:var(--text3);margin-top:1px">${e.memo}</div>` : ''}
        </div>
        <span style="font-size:.68rem;padding:2px 8px;border-radius:20px;
          background:${e.status==='active'?'rgba(80,200,120,.12)':'var(--surface2)'};
          color:${statusColor};white-space:nowrap;margin-left:6px">${e.status||'—'}</span>
      </div>`;
  }).join('');

  const latest = entries[0]?.date || '—';
  sec.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      ペアリング履歴
      <button onclick="Pages._addPairingRecord('${parId}')"
        style="font-size:.72rem;padding:4px 10px;border-radius:20px;border:1px solid var(--green);
          background:transparent;color:var(--green);cursor:pointer">＋ 追加</button>
    </div>
    <div class="detail-card">
      <div style="display:flex;gap:20px;margin-bottom:10px">
        <div style="text-align:center">
          <div style="font-weight:700;font-size:1.2rem;color:var(--blue)">${entries.length}</div>
          <div style="font-size:.7rem;color:var(--text3)">総回数</div>
        </div>
        <div style="text-align:center">
          <div style="font-weight:700;font-size:1rem">${latest}</div>
          <div style="font-size:.7rem;color:var(--text3)">最終日</div>
        </div>
        ${isLoading ? `<div style="font-size:.7rem;color:var(--text3);align-self:center">履歴取得中…</div>` : ''}
      </div>
      ${rows}
    </div>`;
}

function _loadMalePairingStats(parId) {
  // Phase1: ローカルpairingsストアから即時描画
  const localPairings = (Store.getDB('pairings') || [])
    .filter(p => p.father_par_id === parId || p.mother_par_id === parId)
    .map(p => _normalizePairingEntry(parId, p, 'pairing'))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  _renderPairingHistorySection(parId, localPairings, true);

  // Phase2: PAIRING_HISTORY を非同期取得してマージ
  API.phase2.getPairingHistories({ male_parent_id: parId })
    .then(res => {
      const extraEntries = (res.histories || [])
        .map(h => _normalizePairingEntry(parId, h, 'history'));
      // マージ（産卵セット由来 + PAIRING_HISTORY 由来）
      // set_id と pairing_history が重複しないよう _id で dedup
      const existingIds = new Set(localPairings.map(e => e._id));
      const merged = [
        ...localPairings,
        ...extraEntries.filter(e => !existingIds.has(e._id)),
      ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      _renderPairingHistorySection(parId, merged, false);
    })
    .catch(() => {
      // APIエラーはサイレント: ローカルデータのみ表示継続
      _renderPairingHistorySection(parId, localPairings, false);
    });
}

// ── 再ペアリング追加モーダル ─────────────────────────────────
Pages._addPairingRecord = function (parId) {
  const parents = Store.getDB('parents') || [];
  const p = parents.find(x => x.par_id === parId);
  const isMale = p?.sex === '♂';
  const partners = parents.filter(x => x.sex === (isMale ? '♀' : '♂') && x.status !== 'dead');
  const today = new Date().toISOString().split('T')[0];

  UI.modal(`
    <div class="modal-title">ペアリングを記録</div>
    <div class="form-section">
      ${UI.field('日付', `<input type="date" id="ph-date" class="input" value="${today}">`)}
      ${UI.field('相手', `<select id="ph-partner" class="input">
        <option value="">— 選択 —</option>
        ${partners.map(pt => `<option value="${pt.par_id}">${pt.parent_display_id || pt.display_name}</option>`).join('')}
      </select>`)}
      ${UI.field('メモ', `<input type="text" id="ph-memo" class="input" placeholder="任意のメモ">`)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2"
        onclick="Pages._savePairingRecord('${parId}', '${isMale ? '♂' : '♀'}')">記録</button>
    </div>
  `);
};

Pages._savePairingRecord = async function (parId, sex) {
  const date    = document.getElementById('ph-date')?.value;
  const partner = document.getElementById('ph-partner')?.value;
  const memo    = document.getElementById('ph-memo')?.value || '';
  if (!date)    { UI.toast('日付を選択してください'); return; }
  if (!partner) { UI.toast('相手を選択してください'); return; }
  const payload = sex === '♂'
    ? { male_parent_id: parId, female_parent_id: partner, pairing_date: date.replace(/-/g,'/'), memo }
    : { male_parent_id: partner, female_parent_id: parId, pairing_date: date.replace(/-/g,'/'), memo };
  try {
    UI.loading(true);
    UI.closeModal();
    await API.phase2.createPairingHistory(payload);
    UI.toast('ペアリングを記録しました');
    _loadMalePairingStats(parId); // 再描画
  } catch(e) {
    UI.toast('記録失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ── 種親登録（Phase2） ───────────────────────────────────────
Pages.parentNew = function (params = {}) {
  const main   = document.getElementById('main');
  const year   = String(new Date().getFullYear()).slice(-2);
  const editId = params.editId || '';
  const p      = editId ? (Store.getDB('parents') || []).find(x => x.par_id === editId) : null;
  const v      = (f, def = '') => p ? (p[f] !== undefined && p[f] !== null ? p[f] : def) : def;
  const title  = editId ? '種親を編集' : '種親を登録';

  // 初期性別
  const initSex = v('sex', '♂');

  main.innerHTML = `
    ${UI.header(title, { back: true })}
    <div class="page-body">

      <div class="form-section">
        <label class="form-label">性別</label>
        <div class="btn-group">
          <button class="btn btn-toggle ${initSex==='♂'?'active':''}" id="sex-male"
                  onclick="_parentSexToggle('♂')">♂ 種雄</button>
          <button class="btn btn-toggle ${initSex==='♀'?'active':''}" id="sex-female"
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
               placeholder="例: 174.5" value="${v('size_mm')}">
      </div>

      <div class="form-section">
        <label class="form-label">父親サイズ(mm)</label>
        <input id="inp-fsize" class="form-input" type="number" step="0.1"
               placeholder="例: 180.0" value="${v('father_parent_size_mm')}">
      </div>
      <div class="form-section">
        <label class="form-label">母親サイズ(mm)</label>
        <input id="inp-msize" class="form-input" type="number" step="0.1"
               placeholder="例: 65.0" value="${v('mother_parent_size_mm')}">
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
          <button style="padding:8px 16px;background:var(--green);color:#fff;border:none;border-radius:var(--radius-sm);font-weight:700;cursor:pointer;white-space:nowrap" onclick="_parentAddTag()">＋ 追加</button>
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
          <button style="padding:8px 16px;background:var(--green);color:#fff;border:none;border-radius:var(--radius-sm);font-weight:700;cursor:pointer;white-space:nowrap" onclick="_parentAddTag('pat')">＋ 追加</button>
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
          <button style="padding:8px 16px;background:var(--green);color:#fff;border:none;border-radius:var(--radius-sm);font-weight:700;cursor:pointer;white-space:nowrap" onclick="_parentAddTag('mat')">＋ 追加</button>
        </div>
      </div>

      <div class="form-section">
        <label class="form-label">羽化日</label>
        <input id="inp-eclosion" class="form-input" type="date" value="${v('eclosion_date').replace(/\//g,'-')}">
      </div>

      <div class="form-section">
        <label class="form-label">後食開始日</label>
        <input id="inp-feeding" class="form-input" type="date"
               value="${v('feeding_start_date').replace(/\//g,'-')}"
               oninput="_parentCalcReadyDate()">
        <div id="ready-date-preview" class="form-hint"></div>
      </div>

      <div class="form-section">
        <label class="form-label">入手元</label>
        <input id="inp-source" class="form-input" type="text" placeholder="例: ヤフオク 〇〇様" value="${v('source')}">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-section">
          <label class="form-label">産地</label>
          <input id="inp-locality" class="form-input" type="text"
                 value="${v('locality','グアドループ産')}" placeholder="例: グアドループ産">
        </div>
        <div class="form-section">
          <label class="form-label">世代</label>
          <input id="inp-generation" class="form-input" type="text"
                 placeholder="例: WF1 / CBF2" value="${v('generation')}">
        </div>
      </div>

      <button class="btn btn-primary btn-full" style="margin-top:24px"
              data-edit-id="${editId}"
              onclick="_parentSave(this.dataset.editId||'')">${editId ? '💾 種親を更新' : '💾 種親を登録'}</button>
    </div>`;

  window._parentSelectedSex = initSex;
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

async function _parentSave(editId = '') {
  const size = document.getElementById('inp-size').value.trim();
  const sex  = window._parentSelectedSex;
  if (!size) { UI.toast('サイズを入力してください'); return; }

  const payload = {
    sex,
    size_mm:               size,
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
    locality:              document.getElementById('inp-locality')?.value.trim() || '',
    generation:            document.getElementById('inp-generation')?.value.trim() || '',
  };

  try {
    UI.loading(true);
    if (editId) {
      payload.par_id = editId;
      await API.phase2.updateParent(payload);
      await syncAll(true);
      UI.toast('種親を更新しました');
      routeTo('parent-detail', { parId: editId });
    } else {
      const res = await API.phase2.createParent(payload);
      await syncAll(true);
      UI.toast(`${res.parent_display_id} を登録しました`);
      routeTo('parent-list');
    }
  } catch(e) {
    UI.toast('エラー: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
}

// 後食設定モーダル
function _parentSetFeeding(parId) {
  const parents = Store.getDB('parents') || [];
  const p = parents.find(x => x.par_id === parId)
         || parents.find(x => x.parent_display_id === parId)
         || parents.find(x => x.display_name === parId);
  // 既存値を YYYY-MM-DD 形式に変換
  const existing = p && p.feeding_start_date
    ? String(p.feeding_start_date).replace(/\//g, '-') : '';
  const today = new Date().toISOString().split('T')[0];
  const initVal = existing || today;
  const title = (p && p.feeding_start_date) ? '🍽️ 後食開始日を変更' : '🍽️ 後食開始日を設定';

  UI.modal(`
    <div class="modal-title">${title}</div>
    <div class="form-section">
      <label class="form-label">後食開始日</label>
      <input id="modal-feeding" class="form-input" type="date" value="${initVal}"
             style="width:100%;padding:10px;font-size:1rem">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="_parentSaveFeeding('${parId}')">保存</button>
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
    routeTo('parent-detail', {parId: parId});
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
    { label: '✏️ 情報を編集',    fn: () => routeTo('parent-new', { editId: parId }) },
    { label: '📋 ペアリング履歴', fn: () => routeTo('pairing-history', { parId }) },
  ]);
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
    routeTo('pairing-history', { parId: maleParId });
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

window.PAGES = window.PAGES || {};
window.PAGES['parent-list']      = () => Pages.parentList();
window.PAGES['parent-new']       = () => Pages.parentNew(Store.getParams());
window.PAGES['parent-detail']    = () => Pages.parentDetail(Store.getParams().parId || Store.getParams().id);
window.PAGES['parent-dashboard'] = () => Pages.parentDashboard();
