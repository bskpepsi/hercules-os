// ════════════════════════════════════════════════════════════════
// unit_detail.js — 飼育ユニット（BU）詳細画面
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 由来ロット文字列 ─────────────────────────────────────────────
function _udFormatOriginLots(unit) {
  let srcLots = [];
  if (unit.source_lots) {
    try { srcLots = typeof unit.source_lots === 'string' ? JSON.parse(unit.source_lots) : (unit.source_lots || []); } catch(_) {}
  }
  if (srcLots.length === 0 && unit.origin_lot_id) srcLots = [unit.origin_lot_id];

  if (srcLots.length === 0) return '—';

  const displayIds = srcLots.map(lid => {
    const lot = Store.getLot && Store.getLot(lid);
    const did = lot ? (lot.display_id || lid) : lid;
    const m = did.match(/[A-Z0-9]+-L\d+/);
    return m ? m[0] : did;
  });
  return displayIds.join(' / ');
}

// ── メンバー配列をパース ─────────────────────────────────────────
function _udParseMembers(unit) {
  const raw = unit.members;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw); } catch(_) {}
  }
  return [];
}

// ════════════════════════════════════════════════════════════════
// メインページ
// ════════════════════════════════════════════════════════════════
Pages.unitDetail = function (params = {}) {
  const main = document.getElementById('main');
  if (!main) return;

  const unitDisplayId = params.unitDisplayId || params.displayId || params.display_id || '';
  const unitId        = params.unitId        || params.unit_id   || '';

  console.log('[UNIT_DETAIL] params:', { unitDisplayId, unitId });

  // Store から BU を解決
  let unit = unitDisplayId
    ? (Store.getUnitByDisplayId && Store.getUnitByDisplayId(unitDisplayId))
    : null;
  if (!unit && unitId) {
    unit = (Store.getDB('breeding_units') || []).find(u => u.unit_id === unitId);
  }
  if (!unit && unitDisplayId) {
    unit = (Store.getDB('breeding_units') || []).find(u => u.display_id === unitDisplayId);
  }

  console.log('[UNIT_DETAIL] resolved unit:', unit ? unit.display_id : 'NOT FOUND',
    '/ members:', _udParseMembers(unit || {}).length);

  if (!unit) {
    main.innerHTML = `
      ${UI.header('ユニット詳細', { back: true })}
      <div class="page-body">
        <div class="card">
          <div style="text-align:center;padding:20px;color:var(--text3)">
            <div style="font-size:1.5rem;margin-bottom:8px">🔍</div>
            <div>ユニットが見つかりません</div>
            <div style="font-size:.75rem;margin-top:4px;color:var(--text3)">${unitDisplayId || unitId || '(ID未指定)'}</div>
          </div>
        </div>
      </div>`;
    return;
  }

  _renderUnitDetail(unit, main);
};

// ────────────────────────────────────────────────────────────────
// 描画
// ────────────────────────────────────────────────────────────────
function _udRenderGrowthRecords(records) {
  return [...records]
    .sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))
    .slice(0, 8)
    .map(r => {
      const dateShort = String(r.record_date||'').slice(5);
      const wStr = r.weight_g ? r.weight_g + 'g' : '—';
      const evBadge = r.event_type
        ? '<span style="font-size:.65rem;padding:1px 5px;background:rgba(91,168,232,.15);color:var(--blue);border-radius:4px">' + r.event_type + '</span>'
        : '';
      const notePart = r.note_private
        ? '<span style="color:var(--text3);font-size:.7rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + String(r.note_private).slice(0,30) + '</span>'
        : '';
      return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border2);font-size:.78rem">'
        + '<span style="color:var(--text3);min-width:70px">' + dateShort + '</span>'
        + '<span style="font-weight:700">' + wStr + '</span>'
        + '<span style="color:var(--text3)">' + (r.mat_type||'') + '</span>'
        + evBadge + notePart
        + '</div>';
    }).join('');
}

function _renderUnitDetail(unit, main) {
  const line      = Store.getLine(unit.line_id);
  const lineCode  = line ? (line.line_code || line.display_id) : (unit.line_id || '—');
  const originStr = _udFormatOriginLots(unit);
  const members   = _udParseMembers(unit);
  const records   = (Store.getGrowthRecords && Store.getGrowthRecords(unit.unit_id)) || [];
  const latestRec = records.length > 0
    ? [...records].sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))[0]
    : null;

  // ステータスバッジ
  const statusColor = unit.status === 'active' ? 'var(--green)'
    : unit.status === 'individualized' ? 'var(--blue)'
    : unit.status === 'reserved' ? 'var(--amber)' : 'var(--text3)';
  const statusLabel = unit.status === 'active' ? '飼育中'
    : unit.status === 'individualized' ? '個別化済'
    : unit.status === 'reserved' ? '予約中' : (unit.status || '—');

  // 販売候補バッジ
  const saleBadge = unit.for_sale
    ? `<span style="background:#e05050;color:#fff;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:4px;margin-left:6px">販売候補</span>`
    : '';

  main.innerHTML = `
    ${UI.header('ユニット詳細', { back: true })}
    <div class="page-body">

      <!-- ヘッダーバナー -->
      <div style="background:var(--surface2);border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-weight:700;color:var(--gold);font-family:var(--font-mono);font-size:1rem">${unit.display_id}</span>
          <span style="padding:2px 8px;border-radius:5px;font-size:.72rem;font-weight:700;border:1px solid ${statusColor};color:${statusColor}">${statusLabel}</span>
          ${saleBadge}
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:.78rem;color:var(--text2)">
          <span>📋 ライン: <b>${lineCode}</b></span>
          <span>🔢 ${unit.head_count || 2}頭</span>
          <span style="background:rgba(91,168,232,.15);color:var(--blue);padding:1px 7px;border-radius:4px;font-weight:700">${unit.stage_phase || '—'}</span>
        </div>
        <div style="font-size:.72rem;color:var(--text3);margin-top:6px">由来ロット: ${originStr}</div>
      </div>

      <!-- 基本情報 -->
      <div class="card" style="margin-bottom:10px">
        <div class="card-title">基本情報</div>
        <table style="width:100%;font-size:.8rem;border-collapse:collapse">
          ${[
            ['孵化日',       unit.hatch_date   || '—'],
            ['マット種別',   unit.mat_type     || '—'],
            ['容器サイズ',   unit.container_size|| '—'],
            ['最終記録日',   latestRec ? latestRec.record_date : '—'],
            ['作成日',       unit.created_at ? String(unit.created_at).split(' ')[0] : '—'],
            ['更新日',       unit.updated_at ? String(unit.updated_at).split(' ')[0] : '—'],
            ['unit_id',      unit.unit_id      || '—'],
          ].map(([k,v]) => `
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:6px 4px;color:var(--text3);width:90px">${k}</td>
              <td style="padding:6px 4px;color:var(--text1);font-family:${k==='unit_id'?'var(--font-mono)':'inherit'};font-size:${k==='unit_id'?'.72rem':'inherit'}">${v}</td>
            </tr>`).join('')}
        </table>
        ${unit.note ? `<div style="margin-top:8px;font-size:.78rem;color:var(--text2);background:var(--surface2);border-radius:8px;padding:8px">📝 ${unit.note}</div>` : ''}
      </div>

      <!-- メンバー -->
      <div class="card" style="margin-bottom:10px">
        <div class="card-title">メンバー構成（${members.length}頭）</div>
        ${members.length > 0
          ? members.map((m, i) => _renderUdMemberRow(m, i, records)).join('')
          : `<div style="color:var(--text3);font-size:.8rem;padding:8px 0">メンバー情報がありません</div>`}
      </div>

      <!-- 成長記録 -->
      ${records.length > 0 ? `
      <div class="card" style="margin-bottom:10px">
        <div class="card-title">成長記録（${records.length}件）</div>
        ${_udRenderGrowthRecords(records)}
      </div>` : ''}

      <!-- アクション -->
      <div class="card">
        <div class="card-title">アクション</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${unit.status === 'active' && (unit.stage_phase === 'T1' || unit.stage_phase === 'T2') ? `
          <button class="btn btn-primary" onclick="Pages._udStartT2('${unit.display_id}')">
            🔄 T2移行
          </button>` : ''}
          <button class="btn btn-ghost" onclick="routeTo('label-gen', {
            targetType: 'UNIT',
            displayId: '${unit.display_id}',
            labelType: 't1_unit',
            forSale: ${!!unit.for_sale},
            backRoute: 'unit-detail',
            backParam: { unitDisplayId: '${unit.display_id}' },
            unitDraft: ${JSON.stringify({
              display_id: unit.display_id,
              line_id: unit.line_id,
              line_code: line ? (line.line_code || line.display_id || '') : '',
              head_count: unit.head_count || 2,
              for_sale: !!unit.for_sale,
              stage_phase: unit.stage_phase || 'T1',
              mat_type: unit.mat_type || 'T1',
              members: members,
            })}
          })">
            🏷️ ラベル発行
          </button>
        </div>
      </div>

    </div>`;
}

// ── メンバー行 ───────────────────────────────────────────────────
function _renderUdMemberRow(m, idx, records) {
  const slotLabel = idx === 0 ? '1頭目' : idx === 1 ? '2頭目' : `${idx+1}頭目`;

  // 最新体重をgrowth_recordsから取得（unit_slot_no 一致）
  const slotRecs = records.filter(r => parseInt(r.unit_slot_no, 10) === m.unit_slot_no);
  const latestW  = slotRecs.length > 0
    ? slotRecs.sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))[0].weight_g
    : (m.weight_g || null);

  // 元ロット情報
  const lotDisplayId = m.lot_display_id || m.lot_id || '—';

  return `
  <div style="padding:10px 0;border-bottom:1px solid var(--border2)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="font-weight:800;font-size:.9rem;color:var(--text1)">${slotLabel}</span>
      ${m.sex && m.sex !== '不明' ? `<span style="font-size:.8rem;font-weight:700;color:${m.sex==='♂'?'#3366cc':'#cc3366'}">${m.sex}</span>` : ''}
      ${m.size_category ? `<span style="font-size:.75rem;padding:1px 6px;border-radius:4px;background:rgba(76,175,120,.12);color:var(--green)">${m.size_category}</span>` : ''}
      ${latestW ? `<span style="font-size:.8rem;font-weight:700;margin-left:auto">${latestW}g</span>` : ''}
    </div>
    <div style="font-size:.7rem;color:var(--text3)">
      元ロット: ${lotDisplayId}${m.lot_item_no ? ' #' + m.lot_item_no : ''}
      ${m.memo ? ' | ' + m.memo : ''}
    </div>
  </div>`;
}

// ── T2移行ショートカット ─────────────────────────────────────────
Pages._udStartT2 = function (displayId) {
  Pages.t2SessionStart && Pages.t2SessionStart(displayId);
};

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['unit-detail'] = function () {
  Pages.unitDetail(Store.getParams());
};
