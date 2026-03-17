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

    // 引退・売却済を羽化年ごとにグルーピング
    function _retiredByYear(list) {
      const map = {};
      list.forEach(p => {
        const yr = (p.eclosion_date || p.updated_at || '')
          .toString().slice(0, 4) || '年不明';
        (map[yr] = map[yr] || []).push(p);
      });
      // 年度降順
      return Object.keys(map).sort((a,b) => b.localeCompare(a))
        .map(yr => ({ yr, items: map[yr] }));
    }

    // 折りたたみトグル（引退セクション・年度）
    function _toggle(id) {
      const body  = document.getElementById(id + '-body');
      const arrow = document.getElementById(id + '-arrow');
      if (!body) return;
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
    }
    window._parentToggle = _toggle;

    // 引退セクション HTML（年度別折りたたみ）
    let retiredHtml = '';
    if (retired.length) {
      const byYear = _retiredByYear(retired);
      const yearBlocks = byYear.map(({ yr, items }) => {
        const yid = 'py-' + yr.replace(/[^0-9]/g, '');
        return `
          <div class="parent-year-toggle"
            onclick="_parentToggle('${yid}')" style="cursor:pointer">
            <span>${yr}年（${items.length}頭）</span>
            <span id="${yid}-arrow" class="parent-section-arrow">▼</span>
          </div>
          <div id="${yid}-body" class="parent-year-body" style="display:none">
            ${items.map(safeCard).join('')}
          </div>`;
      }).join('');

      retiredHtml = `
        <div class="parent-section-toggle"
          onclick="_parentToggle('pr-retired')" style="margin-top:20px">
          <span class="parent-section-label" style="color:var(--text3)">
            引退・売却済（${retired.length}頭）
          </span>
          <span id="pr-retired-arrow" class="parent-section-arrow">▶</span>
        </div>
        <div id="pr-retired-body" class="parent-section-body" style="display:none">
          ${yearBlocks}
        </div>`;
    }

    const body = `
      <div class="section-title">♂ 種雄（${males.length}頭）</div>
      ${males.length ? males.map(safeCard).join('') : UI.empty('種雄が未登録です')}

      <div class="section-title" style="margin-top:20px">♀ 種雌（${females.length}頭）</div>
      ${females.length ? females.map(safeCard).join('') : UI.empty('種雌が未登録です')}

      ${retiredHtml}`;

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

  // ── ⑥ペアリング統計（最終日・次回目安・予定件数）──
  const stats = Store.getPairingStats(p.par_id);
  let statsLine = '';
  if (stats.total > 0 || stats.scheduledCount > 0) {
    const lastFmt = fmt(stats.lastDate) || '—';
    let nextHtml = '';
    if (stats.nextReadyDate && p.sex === '♂') {
      const today2 = new Date(); today2.setHours(0,0,0,0);
      const parts2 = String(stats.nextReadyDate).replace(/-/g,'/').split('/');
      if (parts2.length >= 3) {
        const nd = new Date(+parts2[0], +parts2[1]-1, +parts2[2]);
        const diff2 = Math.floor((nd - today2) / 86400000);
        const color2 = diff2 <= 0 ? 'var(--green)' : diff2 <= 3 ? 'var(--amber)' : 'var(--text3)';
        const label2 = diff2 <= 0 ? '交配可' : diff2 + '日後';
        nextHtml = `<span style="color:${color2};margin-left:6px">次回: ${label2}</span>`;
      }
    }
    const schedHtml = stats.scheduledCount > 0
      ? `<span style="color:var(--amber);margin-left:6px">📅予定${stats.scheduledCount}件</span>` : '';
    statsLine = `<div style="font-size:.75rem;color:var(--text3);margin-top:2px">
      交配${stats.total}回　最終: ${lastFmt}${nextHtml}${schedHtml}
    </div>`;
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
  const main = document.getElementById('main');
  if (!main) return;

  try {
    // parIdParam は string / { parId } / { id } / undefined すべてを受け付ける
    let parId = '';
    if (typeof parIdParam === 'string') {
      parId = parIdParam;
    } else if (parIdParam && typeof parIdParam === 'object') {
      parId = parIdParam.parId || parIdParam.id || '';
    }

    if (!parId) {
      main.innerHTML = UI.header('種親詳細', { back: true })
        + '<div class="page-body">' + UI.empty('IDが指定されていません') + '</div>';
      return;
    }

    const parents = Store.getDB('parents') || [];
    const p = parents.find(x => x.par_id === parId)
           || parents.find(x => x.parent_display_id === parId)
           || parents.find(x => x.display_name === parId);

    if (!p) {
      main.innerHTML = UI.header('種親詳細', { back: true })
        + '<div class="page-body">' + UI.empty('種親が見つかりません (id=' + parId + ')') + '</div>';
      return;
    }

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

      <!-- 基本情報カード -->
      <div class="detail-card">
        <!-- ヘッダー行 -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;
          padding-bottom:10px;border-bottom:1px solid var(--border)">
          <span style="font-family:var(--font-mono);font-size:1.05rem;font-weight:700;
            color:var(--gold)">${pid}</span>
          <span style="font-size:1.2rem;color:${p.sex==='♂'?'var(--male)':'var(--female)'}">
            ${p.sex || ''}</span>
          <span style="font-size:.9rem;font-weight:700;
            color:${p.size_mm?'var(--green)':'var(--text3)'};margin-left:4px">
            ${p.size_mm ? p.size_mm + 'mm' : '未計測'}</span>
          <span style="margin-left:auto">
            <span style="font-size:.7rem;padding:2px 8px;border-radius:20px;
              border:1px solid currentColor;
              color:${p.status==='active'?'var(--green)':p.status==='sold'?'var(--amber)':'var(--text3)'}">
              ${_parentStatusLabel(p.status)}
            </span>
          </span>
        </div>
        ${pairingBadge ? `<div style="margin-bottom:10px">${pairingBadge}</div>` : ''}

        <!-- 詳細行 -->
        ${UI.detailRow('管理コード', pid)}
        ${UI.detailRow('性別', p.sex || '—')}
        ${UI.detailRow('サイズ', p.size_mm ? p.size_mm + 'mm' : '未計測')}
        ${UI.detailRow('産地', p.locality || '—')}
        ${UI.detailRow('世代', p.generation || '—')}
        ${UI.detailRow('父親サイズ', p.father_parent_size_mm ? p.father_parent_size_mm + 'mm' : '—')}
        ${UI.detailRow('母親サイズ', p.mother_parent_size_mm ? p.mother_parent_size_mm + 'mm' : '—')}
        ${UI.detailRow('羽化日', p.eclosion_date || '—')}
        ${UI.detailRow('後食開始日',
          p.feeding_start_date
            ? `<span style="color:var(--green)">${p.feeding_start_date}</span>`
            : '<span style="color:var(--amber)">未設定</span>')}
        ${UI.detailRow('交配可能日',
          p.pairing_ready_date
            ? `<span style="color:var(--blue)">${p.pairing_ready_date}</span>`
            : '—')}
      </div>

      ${!p.feeding_start_date ? `
      <button class="btn btn-primary btn-full" style="margin-top:4px"
        onclick="_parentSetFeeding('${parId}')">
        🍽️ 後食開始日を設定
      </button>` : ''}

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

      <div id="pairing-stats-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 4px">
          <span style="font-size:.8rem;font-weight:700;color:var(--text3);letter-spacing:.06em">ペアリング管理</span>
        </div>
        <div class="card" style="text-align:center;padding:16px">
          <div class="spinner"></div>
        </div>
      </div>

    </div>`;

    // ペアリング管理を非同期ロード（♂♀両対応）
    _loadPairingManagement(parId);

  } catch (err) {
    // レンダリング中の予期しない例外をキャッチして真っ暗を防ぐ
    console.error('parentDetail エラー:', err);
    if (main) {
      main.innerHTML = UI.header('種親詳細', { back: true })
        + '<div class="page-body">'
        + UI.empty('表示エラー: ' + (err.message || String(err)))
        + '</div>';
    }
  }
};

// ══════════════════════════════════════════════════════════════
// ペアリング管理: 履歴・予定・統計
// 設計:
//   - 実施済み履歴(status='done') と 予定(status='planned') を分離表示
//   - ローカルキャッシュ(pairing_histories)を即時表示
//   - pairings(産卵セット)からも初回ペアリングを取得してマージ
//   - 予定追加・実施済み変更・キャンセル・編集 を完全実装
// ══════════════════════════════════════════════════════════════

// ── ローカルキャッシュから全エントリを取得 ─────────────────────
function _getPairingEntries(parId) {
  const all = Store.getDB('pairing_histories') || [];
  return all.filter(h => h.male_parent_id === parId || h.female_parent_id === parId);
}

// ── 産卵セットから初回ペアリングを補完 ────────────────────────
function _getPairingFromSets(parId) {
  const pairings = (Store.getDB('pairings') || [])
    .filter(p => p.father_par_id === parId || p.mother_par_id === parId);
  return pairings.map(p => ({
    pairing_id: '_set_' + p.set_id,
    type:       'initial',
    status:     'done',
    pairing_date: p.pairing_start || '',
    planned_date: '',
    male_parent_id:   p.father_par_id,
    female_parent_id: p.mother_par_id,
    line_id: p.line_id || '',
    memo:    '産卵セット ' + (p.display_id || p.set_id),
    _source: 'pairing',
  }));
}

// ── パートナー名を解決 ─────────────────────────────────────────
function _resolvePartnerName(h, parId) {
  const partnerId = h.male_parent_id === parId ? h.female_parent_id : h.male_parent_id;
  const parents = Store.getDB('parents') || [];
  const partner = parents.find(p => p.par_id === partnerId);
  return {
    name: partner ? (partner.parent_display_id || partner.display_name) : (partnerId || '—'),
    id:   partnerId,
  };
}

// ── ペアリング管理セクション 描画 ─────────────────────────────
function _renderPairingManagement(parId, entries, isLoading) {
  const sec = document.getElementById('pairing-stats-section');
  if (!sec) return;

  // 分離
  const done      = entries.filter(e => !e.status || e.status === 'done')
                           .sort((a,b) => String(b.pairing_date||'').localeCompare(String(a.pairing_date||'')));
  const planned   = entries.filter(e => e.status === 'planned')
                           .sort((a,b) => String(a.planned_date||'').localeCompare(String(b.planned_date||'')));
  const cancelled = entries.filter(e => e.status === 'cancelled');

  const parents = Store.getDB('parents') || [];
  const curP    = parents.find(p => p.par_id === parId);
  const isMale  = curP?.sex === '♂';

  // 次回可能目安日
  const minDays = parseInt(Store.getSetting('male_pairing_interval_min_days') || '7', 10);
  let nextReadyHtml = '';
  if (done.length && isMale) {
    const lastDate = done[0].pairing_date;
    if (lastDate) {
      const parts = String(lastDate).replace(/-/g,'/').split('/');
      if (parts.length >= 3) {
        const d = new Date(+parts[0], +parts[1]-1, +parts[2]);
        d.setDate(d.getDate() + minDays);
        const today = new Date(); today.setHours(0,0,0,0);
        const diff  = Math.floor((d - today) / 86400000);
        const dateStr = d.toLocaleDateString('ja-JP', {month:'numeric',day:'numeric'});
        const color   = diff <= 0 ? 'var(--green)' : diff <= 3 ? 'var(--amber)' : 'var(--text3)';
        const label   = diff <= 0 ? '可能' : diff + '日後';
        nextReadyHtml = `<span style="font-size:.72rem;padding:2px 10px;border-radius:20px;
          background:rgba(0,0,0,.15);color:${color};font-weight:600">
          次回目安: ${dateStr}（${label}）
        </span>`;
      }
    }
  }

  // ── 実施済み履歴レンダリング ──────────────────────────────
  const doneRows = done.map(e => {
    const pt     = _resolvePartnerName(e, parId);
    const line   = Store.getLine(e.line_id);
    const lineStr = line ? `<span style="color:var(--gold);font-size:.72rem">${line.line_code || line.display_id}</span>` : '';
    const canEdit = !e._source; // 産卵セット由来は編集不可
    const typeBadge = e.type === 'initial'
      ? `<span style="font-size:.6rem;background:rgba(80,160,255,.15);color:var(--blue);padding:1px 6px;border-radius:8px;margin-left:4px">初回</span>`
      : `<span style="font-size:.6rem;background:rgba(80,200,120,.15);color:var(--green);padding:1px 6px;border-radius:8px;margin-left:4px">再ペア</span>`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:8px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:.85rem;font-weight:600">
            ${e.pairing_date||'—'}${typeBadge}
          </div>
          <div style="font-size:.75rem;color:var(--text3);margin-top:2px">
            ${pt.name} ${lineStr}
            ${e.memo ? `<span style="color:var(--text3)"> · ${e.memo}</span>` : ''}
          </div>
        </div>
        ${canEdit ? `
        <button style="font-size:.7rem;padding:2px 8px;border:1px solid var(--border);
          border-radius:20px;background:transparent;color:var(--text2);cursor:pointer;flex-shrink:0"
          onclick="Pages._editPairingEntry('${e.pairing_id}','${parId}')">✏️</button>` : ''}
      </div>`;
  }).join('');

  // ── 予定レンダリング ─────────────────────────────────────
  const today = new Date(); today.setHours(0,0,0,0);
  const plannedRows = planned.map(e => {
    const pt  = _resolvePartnerName(e, parId);
    const parts = String(e.planned_date||'').replace(/-/g,'/').split('/');
    let diff = null, urgency = 'var(--text3)';
    if (parts.length >= 3) {
      const pDate = new Date(+parts[0], +parts[1]-1, +parts[2]);
      diff = Math.floor((pDate - today) / 86400000);
      urgency = diff < 0 ? 'var(--red)' : diff === 0 ? 'var(--amber)' : 'var(--text3)';
    }
    const diffLabel = diff === null ? '' : diff < 0 ? `(${Math.abs(diff)}日超過)` : diff === 0 ? '(今日!)' : `(${diff}日後)`;
    return `
      <div style="background:rgba(255,200,60,.06);border:1px solid rgba(255,200,60,.2);
        border-radius:10px;padding:10px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:.85rem;font-weight:600;color:${urgency}">
              📅 ${e.planned_date||'—'} <span style="font-size:.72rem">${diffLabel}</span>
            </div>
            <div style="font-size:.75rem;color:var(--text2);margin-top:2px">
              ${pt.name}
              ${e.memo ? `<span style="color:var(--text3)"> · ${e.memo}</span>` : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          <button style="padding:5px 12px;border-radius:20px;border:none;
            background:var(--green);color:#fff;font-size:.75rem;font-weight:700;cursor:pointer"
            onclick="Pages._executePairing('${e.pairing_id}','${parId}')">✅ 実施した</button>
          <button style="padding:5px 12px;border-radius:20px;border:1px solid var(--border);
            background:transparent;color:var(--text2);font-size:.75rem;cursor:pointer"
            onclick="Pages._editPairingEntry('${e.pairing_id}','${parId}')">✏️ 編集</button>
          <button style="padding:5px 12px;border-radius:20px;border:1px solid var(--border);
            background:transparent;color:var(--red);font-size:.75rem;cursor:pointer"
            onclick="Pages._cancelPairing('${e.pairing_id}','${parId}')">✕ キャンセル</button>
        </div>
      </div>`;
  }).join('');

  sec.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 4px">
      <span style="font-size:.8rem;font-weight:700;color:var(--text3);letter-spacing:.06em">ペアリング管理</span>
      ${isLoading ? `<span style="font-size:.7rem;color:var(--text3)">同期中…</span>` : ''}
    </div>

    <!-- サマリーバー -->
    <div style="display:flex;gap:12px;padding:10px 12px;background:var(--surface2);
      border-radius:10px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
      <div style="text-align:center">
        <div style="font-weight:700;font-size:1.1rem;color:var(--blue)">${done.length}</div>
        <div style="font-size:.62rem;color:var(--text3)">実施回数</div>
      </div>
      <div style="text-align:center">
        <div style="font-weight:700;font-size:.9rem">${done.length ? done[0].pairing_date||'—' : '—'}</div>
        <div style="font-size:.62rem;color:var(--text3)">最終日</div>
      </div>
      <div style="text-align:center">
        <div style="font-weight:700;font-size:.9rem;color:${planned.length?'var(--amber)':'var(--text3)'}">
          ${planned.length || '—'}
        </div>
        <div style="font-size:.62rem;color:var(--text3)">予定件数</div>
      </div>
      ${nextReadyHtml}
    </div>

    <!-- 予定セクション -->
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:.78rem;font-weight:700;color:var(--amber)">📅 再ペアリング予定</span>
        <button style="font-size:.72rem;padding:4px 12px;border-radius:20px;
          border:1px solid var(--green);background:transparent;color:var(--green);
          cursor:pointer;font-weight:700"
          onclick="Pages._addPairingSchedule('${parId}')">＋ 予定追加</button>
      </div>
      ${planned.length ? plannedRows : `<div style="font-size:.8rem;color:var(--text3);padding:8px 0">再ペアリング予定はまだありません</div>`}
    </div>

    <!-- 実施済み履歴セクション -->
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:.78rem;font-weight:700;color:var(--text3)">📋 実施済み履歴</span>
        <button style="font-size:.72rem;padding:4px 12px;border-radius:20px;
          border:1px solid var(--blue);background:transparent;color:var(--blue);
          cursor:pointer"
          onclick="Pages._addPairingDone('${parId}')">＋ 履歴追加</button>
      </div>
      ${done.length ? `<div>${doneRows}</div>` : `<div style="font-size:.8rem;color:var(--text3);padding:8px 0">ペアリング履歴はまだありません</div>`}
    </div>`;
}

// ── ペアリング管理 ロード（即時+非同期マージ） ─────────────────
function _loadPairingManagement(parId) {
  // ① ローカルキャッシュから即時描画
  const local  = _getPairingEntries(parId);
  const fromSets = _getPairingFromSets(parId);
  // 重複排除: set_id由来のものがpairing_historiesにすでにあれば除外
  const localIds = new Set(local.map(e => {
    // memo に「産卵セット SET-xxxxx」が含まれている場合そのset_idを返す
    const m = (e.memo || '').match(/SET-[\w-]+/);
    return m ? m[0] : null;
  }).filter(Boolean));
  const extraSets = fromSets.filter(e => {
    const setId = (e.memo || '').replace('産卵セット ','').trim();
    return !localIds.has(setId);
  });
  const merged = [...local, ...extraSets]
    .sort((a,b) => {
      const da = a.pairing_date || a.planned_date || '';
      const db = b.pairing_date || b.planned_date || '';
      return db.localeCompare(da);
    });

  window.__pairingMgmtCache = merged;
  _renderPairingManagement(parId, merged, true);

  // ② PAIRING_HISTORY を非同期取得してマージ
  // 性別に応じてクエリキーを切り替え（♀の場合は female_parent_id で取得）
  const _curPar  = (Store.getDB('parents') || []).find(p => p.par_id === parId);
  const _isFemale = _curPar?.sex === '♀';
  const _phParam  = _isFemale ? { female_parent_id: parId } : { male_parent_id: parId };

  API.phase2.getPairingHistories(_phParam)
    .then(res => {
      const apiEntries  = res.histories || [];
      const apiIds      = new Set(apiEntries.map(e => e.pairing_id));
      // ローカルで _source='pairing' のもの（産卵セット由来）は保持
      const localOnly   = merged.filter(e => e._source === 'pairing' || !apiIds.has(e.pairing_id));
      const finalMerged = [
        ...apiEntries,
        ...localOnly.filter(e => e._source === 'pairing'),
      ].sort((a,b) => {
        const da = a.pairing_date || a.planned_date || '';
        const db = b.pairing_date || b.planned_date || '';
        return db.localeCompare(da);
      });
      window.__pairingMgmtCache = finalMerged;
      // 競合防止: API返却時に同じ種親詳細ページにいるか確認
      if (Store.getPage() === 'parent-detail' && document.getElementById('pairing-stats-section')) {
        _renderPairingManagement(parId, finalMerged, false);
      }
    })
    .catch(() => {
      if (Store.getPage() === 'parent-detail' && document.getElementById('pairing-stats-section')) {
        _renderPairingManagement(parId, merged, false);
      }
    });
}

// ── 予定追加モーダル ──────────────────────────────────────────
Pages._addPairingSchedule = function (parId) {
  const parents = Store.getDB('parents') || [];
  const curP    = parents.find(p => p.par_id === parId);
  const isMale  = curP?.sex === '♂';
  const partners = parents.filter(p => p.sex !== curP?.sex && p.status !== 'dead');
  const today    = new Date().toISOString().split('T')[0];
  // 既存予定から次回目安日を計算
  const stats    = Store.getPairingStats(parId);
  const defDate  = stats.nextReadyDate
    ? stats.nextReadyDate.replace(/\//g,'-')
    : today;

  UI.modal(`
    <div class="modal-title">📅 再ペアリング予定を追加</div>
    <div class="form-section">
      ${UI.field('予定日', `<input type="date" id="ps-planned" class="input" value="${defDate}">`)}
      ${UI.field('相手', `<select id="ps-partner" class="input">
        <option value="">— 選択 —</option>
        ${partners.map(p => `<option value="${p.par_id}">${p.parent_display_id||p.display_name}</option>`).join('')}
      </select>`)}
      ${UI.field('メモ（任意）', `<input type="text" id="ps-memo" class="input" placeholder="例: 2回目交配">`)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2"
        onclick="Pages._saveSchedule('${parId}','${isMale?'♂':'♀'}')">予定を登録</button>
    </div>
  `);
};

Pages._saveSchedule = async function (parId, sex) {
  const planned = document.getElementById('ps-planned')?.value;
  const partner = document.getElementById('ps-partner')?.value;
  const memo    = document.getElementById('ps-memo')?.value || '';
  if (!planned) { UI.toast('予定日を選択してください'); return; }
  if (!partner) { UI.toast('相手を選択してください'); return; }
  const payload = {
    type:            'repairing',
    status:          'planned',
    planned_date:    planned.replace(/-/g,'/'),
    male_parent_id:  sex === '♂' ? parId : partner,
    female_parent_id:sex === '♀' ? parId : partner,
    memo,
  };
  try {
    UI.loading(true); UI.closeModal();
    await API.phase2.createPairingHistory(payload);
    Store.addDBItem('pairing_histories', { ...payload, pairing_id: 'tmp_' + Date.now() });
    UI.toast('再ペアリング予定を登録しました');
    await syncAll(true);
    _loadPairingManagement(parId);
  } catch(e) {
    UI.toast('登録失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ── 実施済み履歴を手動追加 ────────────────────────────────────
Pages._addPairingDone = function (parId) {
  const parents = Store.getDB('parents') || [];
  const curP    = parents.find(p => p.par_id === parId);
  const partners = parents.filter(p => p.sex !== curP?.sex && p.status !== 'dead');
  const today   = new Date().toISOString().split('T')[0];
  const isMale  = curP?.sex === '♂';

  UI.modal(`
    <div class="modal-title">📋 ペアリング履歴を追加</div>
    <div class="form-section">
      ${UI.field('実施日', `<input type="date" id="pd-date" class="input" value="${today}">`)}
      ${UI.field('相手', `<select id="pd-partner" class="input">
        <option value="">— 選択 —</option>
        ${partners.map(p => `<option value="${p.par_id}">${p.parent_display_id||p.display_name}</option>`).join('')}
      </select>`)}
      ${UI.field('タイプ', `<select id="pd-type" class="input">
        <option value="initial">初回</option>
        <option value="repairing" selected>再ペアリング</option>
      </select>`)}
      ${UI.field('メモ（任意）', `<input type="text" id="pd-memo" class="input">`)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2"
        onclick="Pages._saveDoneHistory('${parId}','${isMale?'♂':'♀'}')">履歴を保存</button>
    </div>
  `);
};

Pages._saveDoneHistory = async function (parId, sex) {
  const date    = document.getElementById('pd-date')?.value;
  const partner = document.getElementById('pd-partner')?.value;
  const type    = document.getElementById('pd-type')?.value || 'repairing';
  const memo    = document.getElementById('pd-memo')?.value || '';
  if (!date)    { UI.toast('実施日を選択してください'); return; }
  if (!partner) { UI.toast('相手を選択してください'); return; }
  const payload = {
    type,
    status:           'done',
    pairing_date:     date.replace(/-/g,'/'),
    male_parent_id:   sex === '♂' ? parId : partner,
    female_parent_id: sex === '♀' ? parId : partner,
    memo,
  };
  try {
    UI.loading(true); UI.closeModal();
    await API.phase2.createPairingHistory(payload);
    await syncAll(true);
    UI.toast('ペアリング履歴を追加しました');
    _loadPairingManagement(parId);
  } catch(e) {
    UI.toast('追加失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ── 予定を「実施した」に変更 ──────────────────────────────────
Pages._executePairing = async function (pairingId, parId) {
  const today = new Date().toISOString().split('T')[0];
  if (!UI.confirm('本日（' + today + '）実施したとして記録しますか？')) return;
  try {
    UI.loading(true);
    await API.phase2.updatePairingHistory({
      pairing_id:   pairingId,
      status:       'done',
      pairing_date: today.replace(/-/g,'/'),
      planned_date: '',
    });
    await syncAll(true);
    UI.toast('実施済みとして記録しました');
    _loadPairingManagement(parId);
  } catch(e) {
    UI.toast('更新失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ── 予定をキャンセル ──────────────────────────────────────────
Pages._cancelPairing = async function (pairingId, parId) {
  if (!UI.confirm('この予定をキャンセルしますか？（履歴には残りません）')) return;
  try {
    UI.loading(true);
    await API.phase2.updatePairingHistory({ pairing_id: pairingId, status: 'cancelled' });
    await syncAll(true);
    UI.toast('予定をキャンセルしました');
    _loadPairingManagement(parId);
  } catch(e) {
    UI.toast('キャンセル失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ── 履歴/予定を編集 ──────────────────────────────────────────
Pages._editPairingEntry = function (pairingId, parId) {
  const cache  = window.__pairingMgmtCache || [];
  const entry  = cache.find(e => e.pairing_id === pairingId);
  const isPlanned = entry?.status === 'planned';
  const initDate  = isPlanned
    ? (entry.planned_date||'').replace(/\//g,'-')
    : (entry?.pairing_date||'').replace(/\//g,'-');
  const initMemo  = entry?.memo || '';

  UI.modal(`
    <div class="modal-title">${isPlanned ? '予定を編集' : '履歴を編集'}</div>
    <div class="form-section">
      ${UI.field(isPlanned ? '予定日' : '実施日',
        `<input type="date" id="pe-date" class="input" value="${initDate}">`)}
      ${UI.field('メモ', `<input type="text" id="pe-memo" class="input" value="${initMemo}">`)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2"
        onclick="Pages._updatePairingEntry('${pairingId}','${parId}','${isPlanned}')">更新</button>
    </div>
  `);
};

Pages._updatePairingEntry = async function (pairingId, parId, isPlannedStr) {
  const isPlanned = isPlannedStr === 'true';
  const date = document.getElementById('pe-date')?.value;
  const memo = document.getElementById('pe-memo')?.value || '';
  if (!date) { UI.toast('日付を選択してください'); return; }
  const payload = { pairing_id: pairingId, memo };
  if (isPlanned) payload.planned_date = date.replace(/-/g,'/');
  else           payload.pairing_date = date.replace(/-/g,'/');
  try {
    UI.loading(true); UI.closeModal();
    await API.phase2.updatePairingHistory(payload);
    await syncAll(true);
    UI.toast('更新しました');
    _loadPairingManagement(parId);
  } catch(e) {
    UI.toast('更新失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// 後方互換: 旧コードから呼ばれる場合のエイリアス
Pages._addPairingRecord  = (parId) => Pages._addPairingSchedule(parId);
Pages._savePairingRecord = (parId, sex) => Pages._saveSchedule(parId, sex);

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

// ステータスラベル変換
function _parentStatusLabel(s) {
  const map = {
    active:   '活動中',
    retired:  '引退',
    dead:     '死亡',
    sold:     '売却済',
    reserved: '確保中',
  };
  return map[s] || s || '—';
}

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


// ════════════════════════════════════════════════════════════════
// 種親登録 / 編集フォーム（v2）
// parent.js の改善版 + v2拡張フィールド対応
// ════════════════════════════════════════════════════════════════
Pages.parentNew = function (params = {}) {
  const main   = document.getElementById('main');
  const isEdit = !!params.editId;
  const par    = isEdit ? Store.getParent(params.editId) : null;
  const blds   = Store.getDB('bloodlines') || [];
  const v = (f, d = '') => par ? (par[f] !== undefined && par[f] !== null ? par[f] : d) : (params[f] || d);

  main.innerHTML = `
    ${UI.header(isEdit ? '種親を編集' : '種親を登録', { back: true })}
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
        <div class="form-row-2">
          ${UI.field('父親サイズ(mm)',
            UI.input('father_parent_size_mm', 'number', v('father_parent_size_mm'), '例: 180'))}
          ${UI.field('母親サイズ(mm)',
            UI.input('mother_parent_size_mm', 'number', v('mother_parent_size_mm'), '例: 65'))}
        </div>

        <div class="form-title">血統・産地</div>
        ${UI.field('血統（選択）',
          UI.select('bloodline_id',
            blds.map(b => ({ code: b.bloodline_id, label: b.abbreviation || b.bloodline_name })),
            v('bloodline_id')))}
        ${UI.field('血統原文（ヤフオク等の表記）',
          UI.input('bloodline_raw', 'text', v('bloodline_raw'), '例: U6SA-GTR.RU01U6SAティー×FFOFA2No113×T117R'))}
        <div class="form-row-2">
          ${UI.field('父系原文',
            UI.input('paternal_raw', 'text', v('paternal_raw'), '例: U6SA-GTR（父方）'))}
          ${UI.field('母系原文',
            UI.input('maternal_raw', 'text', v('maternal_raw'), '例: FF1710F（母方）'))}
        </div>
        ${UI.field('産地',
          UI.input('locality', 'text', v('locality', 'Guadeloupe')))}

        <div class="form-title">入手・日付</div>
        <div class="form-row-2">
          ${UI.field('羽化日', UI.input('eclosion_date', 'date', v('eclosion_date','').replace(/\//g,'-')))}
          ${UI.field('後食開始日', UI.input('feeding_start_date', 'date', v('feeding_start_date','').replace(/\//g,'-')))}
        </div>
        <div class="form-row-2">
          ${UI.field('入手日', UI.input('purchase_date', 'date', v('purchase_date','').replace(/\//g,'-')))}
          ${UI.field('入手元', UI.input('source', 'text', v('source'), '例: ヤフオク〇〇様'))}
        </div>

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
            onclick="Pages._parV2Save('${isEdit ? params.editId : ''}')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>`;
};

// 種親登録・更新保存（createParentV2 を呼ぶ）
Pages._parV2Save = async function (editId) {
  const form = document.getElementById('par-form');
  if (!form) return;
  const data = UI.collectForm(form);
  if (!data.display_name) { UI.toast('名前を入力してください', 'error'); return; }
  if (!data.sex) { UI.toast('性別を選択してください', 'error'); return; }

  // 日付を '/' 区切りに統一
  ['eclosion_date','feeding_start_date','purchase_date'].forEach(k => {
    if (data[k]) data[k] = data[k].replace(/-/g, '/');
  });

  try {
    if (editId) {
      data.par_id = editId;
      await apiCall(() => API.phase2.updateParent(data), '更新しました');
      Store.patchDBItem('parents', 'par_id', editId, data);
      routeTo('parent-detail', { parId: editId });
    } else {
      const res = await apiCall(() => API.phase2.createParent(data), '種親を登録しました');
      await syncAll(true);
      routeTo('parent-detail', { parId: res.par_id });
    }
  } catch (e) {}
};

// ════════════════════════════════════════════════════════════════
// … メニュー（編集 / ステータス変更 / 後食日設定）
// ════════════════════════════════════════════════════════════════
function _parentEditMenu(parId) {
  const p = Store.getParent(parId);
  if (!p) return;
  UI.actionSheet([
    { label: '✏️ 種親情報を編集',
      fn: () => routeTo('parent-new', { editId: parId }) },
    { label: '🍽️ 後食開始日を設定',
      fn: () => _parentSetFeeding(parId) },
    { label: p.status === 'active' ? '📦 引退にする' : '✅ 現役に戻す',
      fn: () => _parentChangeStatus(parId, p.status === 'active' ? 'retired' : 'active') },
    { label: '💴 売却済みにする',
      fn: () => _parentChangeStatus(parId, 'sold') },
  ]);
}

function _parentSetFeeding(parId) {
  const today = new Date().toISOString().split('T')[0];
  UI.modal(`
    <div class="modal-title">🍽️ 後食開始日を設定</div>
    <div class="form-section">
      ${UI.field('後食開始日', '<input type="date" id="par-feeding-inp" class="input" value="' + today + '">')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2"
        onclick="Pages._parFeedingSave('' + parId + '')">設定する</button>
    </div>
  `);
}

Pages._parFeedingSave = async function (parId) {
  const val = document.getElementById('par-feeding-inp')?.value;
  if (!val) { UI.toast('日付を選択してください'); return; }
  const date = val.replace(/-/g, '/');
  try {
    UI.loading(true);
    UI.closeModal();
    // GAS 側で pairing_ready_date も自動計算されるので syncAll してから再描画
    await API.phase2.updateParent({ par_id: parId, feeding_start_date: date });
    // ローカルキャッシュを即時パッチ（GAS が pairing_ready_date を返すまでの暫定）
    Store.patchDBItem('parents', 'par_id', parId, { feeding_start_date: date });
    UI.toast('後食開始日を設定しました');
    // 最新データを取得してから詳細を再描画
    await syncAll(true).catch(() => {});
    Pages.parentDetail(parId);
  } catch(e) {
    UI.toast('設定失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

function _parentChangeStatus(parId, newStatus) {
  const labels = { active: '現役', retired: '引退', sold: '売却済み', dead: '死亡' };
  const label = labels[newStatus] || newStatus;
  UI.modal(
    '<div class="modal-title">ステータスを変更</div>'
    + '<div style="padding:8px 0 16px;color:var(--text2);font-size:.9rem">「' + label + '」に変更しますか？</div>'
    + '<div class="modal-footer">'
    + '<button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>'
    + '<button class="btn btn-primary" style="flex:2"'
    + ' onclick="Pages._parStatusSave(\'' + parId + '\',\'' + newStatus + '\')">変更する</button>'
    + '</div>'
  );
}

Pages._parStatusSave = async function (parId, newStatus) {
  try {
    UI.loading(true);
    UI.closeModal();
    await API.phase2.updateParent({ par_id: parId, status: newStatus });
    Store.patchDBItem('parents', 'par_id', parId, { status: newStatus });
    UI.toast('ステータスを変更しました');
    Pages.parentDetail(parId);
  } catch(e) {
    UI.toast('変更失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

window.PAGES = window.PAGES || {};
window.PAGES['parent-list']      = () => Pages.parentList();
window.PAGES['parent-new']       = () => Pages.parentNew(Store.getParams());
window.PAGES['parent-detail']    = () => Pages.parentDetail(Store.getParams().parId || Store.getParams().id);
window.PAGES['parent-dashboard'] = () => Pages.parentDashboard();
