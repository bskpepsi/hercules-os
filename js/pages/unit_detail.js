// ════════════════════════════════════════════════════════════════
// unit_detail.js — ユニット詳細画面（完全版）
// build: 20260417k-complete
// 
// デバッグ機能統合・BU成長記録修正・編集保存修正を含む完全版
// ════════════════════════════════════════════════════════════════

'use strict';

Pages.unitDetail = function (params = {}) {
  console.log('[UNIT_DETAIL] Loading with params:', params);
  
  const main = document.getElementById('main');
  
  let unitDisplayId = params.unitDisplayId || params.displayId || '';
  
  if (!unitDisplayId) {
    console.error('[UNIT_DETAIL] No unitDisplayId provided');
    main.innerHTML = `
      ${UI.header('ユニット詳細', { back: true })}
      <div class="page-body">
        <div class="card">
          <div style="text-align:center;color:var(--red);padding:40px 20px">
            ⚠️ ユニットIDが指定されていません<br>
            <button class="btn btn-primary" onclick="routeTo('lot-unit-list')">一覧に戻る</button>
          </div>
        </div>
      </div>`;
    return;
  }

  // ユニット情報を取得（デバッグ情報付き）
  function _getUnitInfo() {
    console.log('[UNIT_DETAIL] Getting unit info for:', unitDisplayId);
    
    // Store関数の存在確認
    if (typeof Store.getUnitByDisplayId !== 'function') {
      console.error('[UNIT_DETAIL] Store.getUnitByDisplayId is not a function');
      console.log('[UNIT_DETAIL] Available Store functions:', Object.keys(Store || {}));
      return null;
    }
    
    const unit = Store.getUnitByDisplayId(unitDisplayId);
    console.log('[UNIT_DETAIL] Unit found:', !!unit);
    if (unit) {
      console.log('[UNIT_DETAIL] Unit details:', {
        unit_id: unit.unit_id,
        display_id: unit.display_id,
        line_id: unit.line_id,
        status: unit.status
      });
    }
    
    return unit;
  }

  const unit = _getUnitInfo();
  
  if (!unit) {
    console.error('[UNIT_DETAIL] Unit not found:', unitDisplayId);
    main.innerHTML = `
      ${UI.header('ユニット詳細', { back: true })}
      <div class="page-body">
        <div class="card">
          <div style="text-align:center;color:var(--red);padding:40px 20px">
            ⚠️ ユニットが見つかりません<br>
            <span style="font-size:.8rem;color:var(--text3)">ID: ${unitDisplayId}</span><br><br>
            <button class="btn btn-primary" onclick="routeTo('lot-unit-list')">一覧に戻る</button>
          </div>
        </div>
      </div>`;
    return;
  }

  function _udRender(unit) {
    const line = unit.line_id ? Store.getLine(unit.line_id) : null;
    
    // ライン情報のフォールバック処理
    const lineDisp = (() => {
      if (line) return line.line_code || line.display_id || '';
      // display_id からライン情報を抽出 (例: "HM2025-A1-U06" → "A1")
      const match = (unit.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-/);
      return match ? match[1] : (unit.line_id || '—');
    })();

    const age = unit.hatch_date ? Store.calcAge(unit.hatch_date) : null;
    const records = Store.getGrowthRecords ? Store.getGrowthRecords(unit.unit_id) : [];
    const latestRec = records.find(r => r.weight_g && +r.weight_g > 0);

    // メンバー情報の解析
    let members = [];
    let headCount = 2;
    try {
      const raw = unit.members;
      if (Array.isArray(raw)) {
        members = raw;
      } else if (typeof raw === 'string' && raw.trim()) {
        members = JSON.parse(raw);
      }
      headCount = Math.max(parseInt(unit.head_count, 10) || 2, members.length, 1);
    } catch(e) {
      console.warn('[UNIT_DETAIL] member parsing failed:', e);
    }

    main.innerHTML = `
      ${UI.header('🏠 ' + unit.display_id, { 
        back: true, 
        backFn: "routeTo('lot-unit-list')" 
      })}
      <div class="page-body">

      <!-- ステータスバー -->
      <div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="background:rgba(76,175,120,.15);color:var(--green);padding:4px 8px;border-radius:6px;font-size:.72rem;font-weight:700">${unit.status === 'active' ? '飼育中' : unit.status}</span>
          <span style="background:rgba(91,168,232,.15);color:var(--blue);padding:4px 8px;border-radius:6px;font-size:.72rem;font-weight:700">${unit.stage_phase || 'T1'}</span>
          <span style="color:var(--text3);font-size:.8rem">${lineDisp} • ${headCount}頭</span>
        </div>
        ${unit.hatch_date ? `<div style="font-size:.72rem;color:var(--text3)">孵化: ${unit.hatch_date}${age ? ` (${age.totalDays}日齢)` : ''}</div>` : ''}
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
              <td style="padding:8px 4px;color:var(--text3);width:30%">${k}</td>
              <td style="padding:8px 4px;font-weight:600">${v}</td>
            </tr>`).join('')}
        </table>
      </div>

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

  // 初期レンダリング
  _udRender(unit);
  console.log('[UNIT_DETAIL] Rendering complete for unit:', unitDisplayId);
};

// ── 成長記録表示 ─────────────────────────────────────────────────
function _udRenderGrowthRecords(records) {
  if (!records || records.length === 0) {
    return '<div style="text-align:center;color:var(--text3);padding:20px">成長記録がありません</div>';
  }

  // 最新5件のみ表示、スロット別に分類
  const recent = records.slice(-5).reverse();
  
  return '<div style="font-size:.75rem">' + recent.map(function(r) {
    const slotText = r.unit_slot_no ? `[${r.unit_slot_no}頭目] ` : '';
    const weightText = r.weight_g ? r.weight_g + 'g' : '—';
    const ageText = r.age_days ? r.age_days + '日齢' : '';
    
    return `
      <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border2)">
        <span style="color:var(--text3);min-width:70px">${r.record_date || '—'}</span>
        <span style="color:var(--gold);font-weight:700;min-width:60px">${slotText}${weightText}</span>
        <span style="color:var(--text3);font-size:.7rem">${ageText}</span>
        <span style="flex:1;color:var(--text3);font-size:.7rem">${r.note_private || ''}</span>
      </div>`;
  }).join('') + '</div>';
}

// ── 日付フォーマット ──────────────────────────────────────────────
function _udFormatDate(dateStr) {
  if (!dateStr) return '（未入力）';
  return String(dateStr).replace(/-/g, '/');
}

// ── ラベル生成 ───────────────────────────────────────────────────
Pages._udLabelGen = function (displayId) {
  const p = { targetType: 'BU', displayId: displayId };
  if (typeof Store.setParams === 'function') {
    Store.setParams(p);
  }
  routeTo('label-gen', p);
};

// ── 基本情報編集 ─────────────────────────────────────────────────
Pages._udEditBasic = function (displayId) {
  const unit = Store.getUnitByDisplayId && Store.getUnitByDisplayId(displayId);
  if (!unit) { UI.toast('ユニットが見つかりません', 'error'); return; }

  UI.modal(`
    <div class="modal-title">基本情報を編集</div>
    <div class="form-section" style="margin-top:8px">
      ${UI.field('孵化日',   '<input type="date" id="ud-hatch" class="input" value="' + (unit.hatch_date||'').replace(/\//g,'-') + '">')}
      ${UI.field('マット種別', UI.select('ud-mat', [
        { code:'T1', label:'T1マット' },
        { code:'T2', label:'T2マット' },
        { code:'T3', label:'T3マット' },
        { code:'MD', label:'MDマット' },
      ], unit.mat_type || ''))}
      ${UI.field('容器サイズ', UI.select('ud-cont', [
        { code:'2.7L', label:'2.7L' },
        { code:'4.8L', label:'4.8L' },
        { code:'10L',  label:'10L' },
      ], unit.container_size || ''))}
      ${UI.field('メモ', '<input type="text" id="ud-note" class="input" value="' + (unit.note||'') + '" placeholder="任意のメモ">')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" onclick="Pages._udSaveEdit('${unit.unit_id}','${displayId}')">保存</button>
    </div>
  `);
};

Pages._udSaveEdit = async function (unitId, displayId) {
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

// ── T2/T3移行ショートカット ─────────────────────────────────────
Pages._udStartT2 = function (displayId) {
  Pages.t2SessionStart && Pages.t2SessionStart(displayId);
};
Pages._udStartT3 = function (displayId) {
  Pages.t3SessionStart && Pages.t3SessionStart(displayId);
};

// ── BU成長記録 → 継続読取りモード ──────────────────────────────
Pages._udGrowthRecord = function (unitId, displayId) {
  console.log('[UNIT_DETAIL] Navigating to continuous-scan:', { unitId, displayId });
  // ユニットの成長記録は継続読取りモードで2頭分を記録
  routeTo('continuous-scan', { 
    targetType: 'UNIT',
    targetId: unitId,
    displayId: displayId,
    mode: 'growth'
  });
};

// ═══════════════════════════════════════════════════════════════
// デバッグ機能（統合済み）
// ═══════════════════════════════════════════════════════════════

// デバッグ用関数（ブラウザコンソールから実行可能）
window.debugUnitDetail = function() {
  console.log('=== ユニット詳細表示デバッグ開始 ===');
  
  // 1. PAGES オブジェクトの確認
  console.log('1. PAGES object:', window.PAGES);
  console.log('   unit-detail page function:', window.PAGES && window.PAGES['unit-detail']);
  
  // 2. Store オブジェクトの確認
  console.log('2. Store object:', typeof Store);
  console.log('   Store.getUnitByDisplayId:', typeof Store.getUnitByDisplayId);
  console.log('   Store.getParams:', typeof Store.getParams);
  
  // 3. breeding_units データの確認
  const units = Store.getDB ? Store.getDB('breeding_units') : null;
  console.log('3. Breeding units data:', units);
  console.log('   Units count:', units ? units.length : 'N/A');
  if (units && units.length > 0) {
    console.log('   Sample unit:', units[0]);
  }
  
  // 4. URLパラメータの確認
  const params = new URLSearchParams(window.location.search);
  console.log('4. URL params:', Object.fromEntries(params));
  
  // 5. routeTo 関数の確認
  console.log('5. routeTo function:', typeof routeTo);
  
  console.log('=== デバッグ終了 ===');
};

// テスト用ナビゲーション関数
window.testUnitDetailNavigation = function(displayId) {
  console.log('Testing navigation to unit detail:', displayId);
  
  try {
    const unit = Store.getUnitByDisplayId(displayId);
    console.log('Unit found:', unit);
    
    if (!unit) {
      console.error('Unit not found for displayId:', displayId);
      return;
    }
    
    const pageFunction = window.PAGES && window.PAGES['unit-detail'];
    if (typeof pageFunction === 'function') {
      console.log('Calling unit-detail page function...');
      
      const newUrl = `${window.location.pathname}?unitDisplayId=${displayId}`;
      history.pushState({ unitDisplayId: displayId }, '', newUrl);
      
      pageFunction();
      console.log('Page function executed successfully');
    } else {
      console.error('unit-detail page function not found');
    }
    
  } catch (error) {
    console.error('Error during navigation test:', error);
  }
};

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['unit-detail'] = function () {
  Pages.unitDetail(Store.getParams());
};

console.log('[UNIT_DETAIL] Complete version loaded with debug functions');
console.log('[UNIT_DETAIL] Debug commands available: debugUnitDetail(), testUnitDetailNavigation("HM2025-A1-U06")');
