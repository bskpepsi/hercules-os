// ════════════════════════════════════════════════════════════════
// unit_detail.js — 飼育ユニット（BU）詳細画面
// build: 20260417a-fix3
// 変更点:
//   - [fix3] UI.select の id未付与バグ対応
//           document.getElementById('ud-mat/ud-cont') が null を返し
//           空文字が送信されていたのを、select要素直書きで id を明示して修正
//   - [fix3] 容器サイズ選択肢を業務仕様通り 1.8L/2.7L/4.8L/その他 の4択に（3.5L削除）
//   - [fix2] _udSaveBasic の構文エラー修正（try-catch閉じた後の孤立コード削除）
//   - [fix2] 描画エラー時のセーフティネット追加（画面真っ暗対策）
//   - [fix1] 孵化日に生のDate文字列が表示される問題を修正（_udFormatDate追加）
//   - [fix1] メンバー行の未判別性別「?」を非表示に修正
// ════════════════════════════════════════════════════════════════
'use strict';

console.log('[HerculesOS] unit_detail.js v20260417a-fix3 loaded');

// ── Bug 4 修正: 孵化日フォーマット関数 ─────────────────────────
function _udFormatDate(d) {
  if (!d) return '—';
  var s = String(d);
  // 既に YYYY/MM/DD または YYYY-MM-DD 形式
  if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(s)) return s.replace(/-/g, '/');
  // "Sat Jan 31 2026 ..." などの Date.toString() 形式をパース
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return dt.getFullYear() + '/'
      + String(dt.getMonth() + 1).padStart(2, '0') + '/'
      + String(dt.getDate()).padStart(2, '0');
  }
  return s;
}

function _udFormatOriginLots(unit) {
  let srcLots = [];
  if (unit.source_lots) {
    try { srcLots = typeof unit.source_lots === 'string' ? JSON.parse(unit.source_lots) : (unit.source_lots || []); } catch(_) {}
  }
  if (srcLots.length === 0 && unit.origin_lot_id) srcLots = [unit.origin_lot_id];
  if (srcLots.length === 0) return '—';
  const displayIds = srcLots.map(lid => {
    const lot = Store.getLot && Store.getLot(lid);
    if (!lot) return null; // 解決できない内部IDは非表示
    const did = lot.display_id || '';
    // "HM2025-A1-L01" → "A1-L01" に短縮
    const m = did.match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+-L\d+)/);
    return m ? m[1] : did;
  }).filter(Boolean);
  return displayIds.length ? displayIds.join(' / ') : '—';
}

function _udParseMembers(unit) {
  const raw = unit.members;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw); } catch(_) {}
  }
  return [];
}

// 個体一覧からこのユニット由来の個体を検索
function _udFindMemberInds(unit) {
  const allInds = Store.getDB('individuals') || [];
  const byUnit = allInds.filter(i =>
    i.origin_unit_id === unit.unit_id ||
    i.source_unit_id === unit.unit_id ||
    i.source_unit_display_id === unit.display_id
  );
  if (byUnit.length > 0) return byUnit;

  const members = _udParseMembers(unit);
  if (members.length === 0) return [];
  const matched = [];
  members.forEach(m => {
    if (!m.lot_id) return;
    const found = allInds.find(i =>
      i.lot_id === m.lot_id &&
      String(i.lot_item_no || '') === String(m.lot_item_no || '')
    );
    if (found) matched.push(found);
  });
  return matched;
}

// ════════════════════════════════════════════════════════════════
Pages.unitDetail = function (params = {}) {
  const main = document.getElementById('main');
  if (!main) return;

  // ── 診断ログ（fix2+） ──
  console.log('[UD] unitDetail called params=', params);

  const unitDisplayId = params.unitDisplayId || params.displayId || params.display_id || '';
  const unitId        = params.unitId        || params.unit_id   || '';

  let unit = unitDisplayId
    ? (Store.getUnitByDisplayId && Store.getUnitByDisplayId(unitDisplayId))
    : null;
  if (!unit && unitId) {
    unit = (Store.getDB('breeding_units') || []).find(u => u.unit_id === unitId);
  }
  if (!unit && unitDisplayId) {
    unit = (Store.getDB('breeding_units') || []).find(u => u.display_id === unitDisplayId);
  }

  if (!unit) {
    console.warn('[UD] unit not found', { unitDisplayId, unitId });
    main.innerHTML = `
      ${UI.header('ユニット詳細', { back: true })}
      <div class="page-body">
        <div class="card" style="text-align:center;padding:20px">
          <div style="font-size:1.5rem;margin-bottom:8px">🔍</div>
          <div>ユニットが見つかりません</div>
          <div style="font-size:.75rem;margin-top:4px;color:var(--text3)">${unitDisplayId || unitId || '(ID未指定)'}</div>
        </div>
      </div>`;
    return;
  }

  // ── 描画エラー時のセーフティネット（fix2+） ──
  // 真っ暗になる代わりにエラーメッセージを表示する
  try {
    _renderUnitDetail(unit, main);
  } catch (e) {
    console.error('[UD] render error:', e);
    const msg = (e && (e.message || e.toString())) || '不明なエラー';
    const stack = (e && e.stack) || '';
    main.innerHTML = `
      ${UI.header('ユニット詳細', { back: true })}
      <div class="page-body">
        <div class="card" style="padding:16px;border:2px solid #e05050">
          <div style="color:#e05050;font-weight:700;font-size:1rem;margin-bottom:8px">⚠️ 描画エラーが発生しました</div>
          <div style="font-size:.85rem;color:var(--text1);margin-bottom:8px">${msg.replace(/[<>]/g, '')}</div>
          <div style="font-size:.7rem;color:var(--text3);margin-bottom:12px">
            ユニット: ${(unit.display_id || unit.unit_id || '?').replace(/[<>]/g, '')}<br>
            hatch_date: ${String(unit.hatch_date||'(null)').replace(/[<>]/g, '').slice(0,50)}<br>
            status: ${unit.status || '(null)'}
          </div>
          <details style="font-size:.7rem;color:var(--text3)">
            <summary>スタックトレース</summary>
            <pre style="overflow:auto;max-height:200px;background:var(--surface2);padding:8px;border-radius:6px;font-size:.65rem">${stack.replace(/[<>]/g, '')}</pre>
          </details>
        </div>
      </div>`;
  }
};

// ────────────────────────────────────────────────────────────────
function _udRenderGrowthRecords(records) {
  if (!records || records.length === 0) return '';
  return [...records]
    .sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))
    .slice(0, 10)
    .map(r => {
      const dateShort = String(r.record_date||'').slice(5);
      const wStr = r.weight_g ? r.weight_g + 'g' : '—';
      const slotBadge = r.unit_slot_no
        ? `<span style="font-size:.65rem;padding:1px 5px;background:rgba(91,168,232,.15);color:var(--blue);border-radius:4px">${r.unit_slot_no}頭目</span>`
        : '';
      const evBadge = r.event_type
        ? `<span style="font-size:.65rem;padding:1px 5px;background:rgba(224,144,64,.15);color:var(--amber);border-radius:4px">${r.event_type}</span>`
        : '';
      return '<div style="display:flex;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border2);font-size:.78rem">'
        + `<span style="color:var(--text3);min-width:60px">${dateShort}</span>`
        + `<span style="font-weight:700">${wStr}</span>`
        + slotBadge + evBadge
        + `<span style="color:var(--text3);font-size:.7rem">${r.mat_type||''}</span>`
        + '</div>';
    }).join('');
}

function _renderUnitDetail(unit, main) {
  const line      = Store.getLine(unit.line_id);
  const lineCode  = (() => {
    if (line) return line.line_code || line.display_id || '';
    // フォールバック: "HM2025-A1-U06" → "A1" を抽出
    const dm = (unit.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-[A-Za-z]/);
    return dm ? dm[1] : (unit.line_id || '—');
  })();
  const originStr = _udFormatOriginLots(unit);
  const members   = _udParseMembers(unit);
  const memberInds = _udFindMemberInds(unit);
  const records   = (Store.getGrowthRecords && Store.getGrowthRecords(unit.unit_id)) || [];
  const latestRec = records.length > 0
    ? [...records].sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))[0]
    : null;

  const isIndividualized = unit.status === 'individualized';
  const statusColor = unit.status === 'active' ? 'var(--green)'
    : isIndividualized ? 'var(--blue)'
    : unit.status === 'reserved' ? 'var(--amber)' : 'var(--text3)';
  const statusLabel = unit.status === 'active' ? '飼育中'
    : isIndividualized ? '個別化済'
    : unit.status === 'reserved' ? '予約中' : (unit.status || '—');

  const saleBadge = unit.for_sale
    ? `<span style="background:#e05050;color:#fff;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:4px;margin-left:6px">販売候補</span>`
    : '';

  const memberSection = isIndividualized && memberInds.length > 0
    ? `<div class="card" style="margin-bottom:10px">
        <div class="card-title">個体化済メンバー（${memberInds.length}頭）</div>
        <div style="font-size:.75rem;color:var(--text3);margin-bottom:8px">
          個別化されました。各個体の詳細は下記から確認できます。
        </div>
        ${memberInds.map((mi, i) => {
          const sex = mi.sex || '不明';
          const sexColor = sex === '♂' ? '#3366cc' : sex === '♀' ? '#cc3366' : 'var(--text3)';
          const stage = mi.current_stage || mi.stage || '—';
          const wt = mi.latest_weight_g || mi.weight_g || '';
          return `<div style="padding:10px 0;border-bottom:1px solid var(--border2);cursor:pointer"
            onclick="routeTo('ind-detail',{indId:'${mi.ind_id}'})">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-weight:700;color:var(--gold);font-family:var(--font-mono)">${mi.display_id||mi.ind_id}</span>
              <span style="color:${sexColor};font-weight:700">${sex}</span>
              <span style="font-size:.75rem;padding:1px 6px;background:rgba(91,168,232,.1);color:var(--blue);border-radius:4px">${stage}</span>
              ${wt ? `<span style="margin-left:auto;font-weight:700">${wt}g</span>` : ''}
              <span style="color:var(--text3);font-size:1rem">›</span>
            </div>
          </div>`;
        }).join('')}
      </div>`
    : members.length > 0
      ? `<div class="card" style="margin-bottom:10px">
          <div class="card-title">メンバー構成（${members.length}頭）</div>
          ${members.map((m, i) => _renderUdMemberRow(m, i, records)).join('')}
        </div>`
      : `<div class="card" style="margin-bottom:10px">
          <div class="card-title">メンバー構成</div>
          <div style="color:var(--text3);font-size:.8rem;padding:8px 0">
            ${isIndividualized
              ? 'このユニットは個別化済みです。個体台帳から各個体を確認できます。'
              : 'メンバー情報がありません（T2/T3移行後に反映されます）'}
          </div>
        </div>`;

  window._udLabelParams = {
    targetType: 'UNIT',
    displayId:  unit.display_id,
    labelType:  't1_unit',
    forSale:    !!unit.for_sale,
    backRoute:  'unit-detail',
    backParam:  { unitDisplayId: unit.display_id },
    unitDraft: {
      display_id:    unit.display_id,
      line_id:       unit.line_id,
      line_code:     line ? (line.line_code || line.display_id || '') : '',
      head_count:    unit.head_count || 2,
      for_sale:      !!unit.for_sale,
      stage_phase:   unit.stage_phase || 'T1',
      mat_type:      unit.mat_type || 'T1',
      size_category: unit.size_category || '',
      hatch_date:    unit.hatch_date || '',
      source_lots:   unit.source_lots || '',
      origin_lot_id: unit.origin_lot_id || '',
      t1_date:       unit.t1_date || unit.created_at || '',
      members:       members,
    },
  };

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
        <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
          基本情報
          <button class="btn btn-ghost btn-sm" style="font-size:.72rem"
            onclick="Pages._udEditBasic('${unit.display_id}')">✏️ 編集</button>
        </div>
        <table style="width:100%;font-size:.8rem;border-collapse:collapse">
          ${[
            ['孵化日',     _udFormatDate(unit.hatch_date)],
            ['マット種別', unit.mat_type      || '—'],
            ['容器サイズ', unit.container_size || '—'],
            ['最終記録日', latestRec ? latestRec.record_date : '—'],
            ['作成日',     unit.created_at ? String(unit.created_at).split(' ')[0] : '—'],
          ].map(([k,v]) => `
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:6px 4px;color:var(--text3);width:90px">${k}</td>
              <td style="padding:6px 4px;color:var(--text1)">${v}</td>
            </tr>`).join('')}
        </table>
        ${unit.note ? `<div style="margin-top:8px;font-size:.78rem;color:var(--text2);background:var(--surface2);border-radius:8px;padding:8px">📝 ${unit.note}</div>` : ''}
      </div>

      <!-- メンバー構成 -->
      ${memberSection}

      <!-- 成長記録 -->
      ${records.length > 0 ? `
      <div class="card" style="margin-bottom:10px">
        <div class="card-title">成長記録（${records.length}件）</div>
        ${_udRenderGrowthRecords(records)}
        <button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%"
          onclick="Pages._udGrowthRecord('${unit.unit_id}','${unit.display_id}')">
          📷 成長記録を追加
        </button>
      </div>` : ''}

      <!-- アクション -->
      <div class="card">
        <div class="card-title">アクション</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${unit.status === 'active' && unit.stage_phase === 'T1' ? `
          <button class="btn btn-primary" style="background:var(--blue)"
            onclick="Pages._udStartT2('${unit.display_id}')">
            🔄 T2移行
          </button>` : ''}
          ${unit.status === 'active' && unit.stage_phase === 'T2' ? `
          <button class="btn btn-primary" style="background:var(--amber);color:#1a1a1a"
            onclick="Pages._udStartT3('${unit.display_id}')">
            ⭐ T3移行
          </button>` : ''}
          ${unit.status === 'active' && unit.stage_phase === 'T3' ? `
          <button class="btn btn-primary" style="background:rgba(224,144,64,.15);border:2px solid var(--amber);color:var(--amber)"
            onclick="Pages._udStartT3('${unit.display_id}')">
            🔄 T3 Mx/体重更新
          </button>` : ''}
          <button class="btn btn-ghost"
            onclick="Pages._udLabelGen('${unit.display_id}')">
            🏷️ ラベル発行
          </button>
          <button class="btn btn-ghost" style="font-size:.8rem"
            onclick="Pages._udGrowthRecord('${unit.unit_id}','${unit.display_id}')">
            📷 成長記録
          </button>
        </div>
      </div>

    </div>`;
}

// ── ラベル発行 ────────────────────────────────────────────────────
Pages._udLabelGen = function () {
  const p = window._udLabelParams;
  if (!p) {
    console.error('[UD] _udLabelGen: _udLabelParams not set');
    return;
  }
  if (typeof Store.setParams === 'function') {
    Store.setParams(p);
  }
  routeTo('label-gen', p);
};

// ── 基本情報編集 ─────────────────────────────────────────────────
Pages._udEditBasic = function (displayId) {
  const unit = Store.getUnitByDisplayId && Store.getUnitByDisplayId(displayId);
  if (!unit) { UI.toast('ユニットが見つかりません', 'error'); return; }

  // [fix3] UI.select は id 属性を付けないため、select要素を直接記述してid属性を明示する
  // 以前は document.getElementById('ud-mat') が null になり、空文字が送信されていた
  const matOptions = [
    { code:'T1', label:'T1マット' },
    { code:'T2', label:'T2マット' },
    { code:'T3', label:'T3マット' },
    { code:'MD', label:'MDマット' },
  ];
  const contOptions = [
    { code:'1.8L', label:'1.8L' },
    { code:'2.7L', label:'2.7L' },
    { code:'4.8L', label:'4.8L（パンケ）' },
    { code:'その他', label:'その他' },
  ];
  const curMat  = unit.mat_type || '';
  const curCont = unit.container_size || '';
  const matSelect  = '<select id="ud-mat" name="ud-mat" class="input">'
    + '<option value="">選択...</option>'
    + matOptions.map(o => `<option value="${o.code}" ${o.code === curMat ? 'selected' : ''}>${o.label}</option>`).join('')
    + '</select>';
  const contSelect = '<select id="ud-cont" name="ud-cont" class="input">'
    + '<option value="">選択...</option>'
    + contOptions.map(o => `<option value="${o.code}" ${o.code === curCont ? 'selected' : ''}>${o.label}</option>`).join('')
    + '</select>';

  UI.modal(`
    <div class="modal-title">基本情報を編集</div>
    <div class="form-section" style="margin-top:8px">
      ${UI.field('孵化日',   '<input type="date" id="ud-hatch" class="input" value="' + (unit.hatch_date||'').replace(/\//g,'-') + '">')}
      ${UI.field('マット種別', matSelect)}
      ${UI.field('容器サイズ', contSelect)}
      ${UI.field('メモ', '<input type="text" id="ud-note" class="input" value="' + (unit.note||'') + '">')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._udSaveBasic('${unit.unit_id}','${displayId}')">保存</button>
    </div>
  `);
};

Pages._udSaveBasic = async function (unitId, displayId) {
  const hatch = (document.getElementById('ud-hatch')?.value || '').replace(/-/g, '/');
  const mat   = document.getElementById('ud-mat')?.value   || '';
  const cont  = document.getElementById('ud-cont')?.value  || '';
  const note  = document.getElementById('ud-note')?.value  || '';
  UI.closeModal();
  const updates = { unit_id: unitId, hatch_date: hatch, mat_type: mat, container_size: cont, note };
  try {
    UI.loading(true);
    
    // API.unit.update を使用（api.js で定義済み）
    await API.unit.update(updates);
    
    // Storeを更新
    if (typeof Store.patchDBItem === 'function') {
      Store.patchDBItem('breeding_units', 'unit_id', unitId, updates);
    }
    
    UI.toast('✅ 基本情報を更新しました', 'success', 2000);
    
    // 画面を再描画
    Pages.unitDetail({ unitDisplayId: displayId });
    
  } catch(e) {
    console.error('[UNIT_DETAIL] save error:', e);
    UI.toast('❌ 保存失敗: ' + (e.message || '通信エラー'), 'error', 4000);
    
    // エラー時もStoreを更新（オフライン対応）
    if (typeof Store.patchDBItem === 'function') {
      Store.patchDBItem('breeding_units', 'unit_id', unitId, updates);
    }
  } finally {
    UI.loading(false);
  }
};

// ── メンバー行 ───────────────────────────────────────────────────
// Bug 5 修正: ♂/♀ のみ表示、未判別は非表示
function _renderUdMemberRow(m, idx, records) {
  const slotLabel = idx === 0 ? '1頭目' : idx === 1 ? '2頭目' : `${idx+1}頭目`;
  const slotRecs  = records.filter(r => parseInt(r.unit_slot_no, 10) === m.unit_slot_no);
  const latestW   = slotRecs.length > 0
    ? slotRecs.sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))[0].weight_g
    : (m.weight_g || null);
  const sexColor = m.sex === '♂' ? '#3366cc' : m.sex === '♀' ? '#cc3366' : 'var(--text3)';

  return `
  <div style="padding:10px 0;border-bottom:1px solid var(--border2)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="font-weight:800;font-size:.9rem;color:var(--text1)">${slotLabel}</span>
      ${(m.sex && m.sex !== '不明') ? `<span style="font-size:.8rem;font-weight:700;color:${sexColor}">${m.sex}</span>` : ''}
      ${m.size_category ? `<span style="font-size:.75rem;padding:1px 6px;border-radius:4px;background:rgba(76,175,120,.12);color:var(--green)">${m.size_category}</span>` : ''}
      ${latestW ? `<span style="font-size:.8rem;font-weight:700;margin-left:auto">${latestW}g</span>` : ''}
    </div>
    <div style="font-size:.7rem;color:var(--text3)">
      元ロット: ${m.lot_display_id || m.lot_id || '—'}${m.lot_item_no ? ' #' + m.lot_item_no : ''}
      ${m.memo ? ' | ' + m.memo : ''}
    </div>
  </div>`;
}

// ── T2/T3移行ショートカット ─────────────────────────────────────
Pages._udStartT2 = function (displayId) {
  Pages.t2SessionStart && Pages.t2SessionStart(displayId);
};
Pages._udStartT3 = function (displayId) {
  Pages.t3SessionStart && Pages.t3SessionStart(displayId);
};

// ── BU成長記録 → 継続読取りモード ──────────────────────────────
Pages._udGrowthRecord = function (unitId, displayId) {
  // ユニットの成長記録は継続読取りモードで2頭分を記録
  routeTo('continuous-scan', { 
    targetType: 'UNIT',
    targetId: unitId,
    displayId: displayId,
    mode: 'growth'
  });
};

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['unit-detail'] = function () {
  Pages.unitDetail(Store.getParams());
};
