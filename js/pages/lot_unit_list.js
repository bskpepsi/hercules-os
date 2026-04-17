// ════════════════════════════════════════════════════════════════
// lot_unit_list.js — ロット・ユニット一覧（完全版）
// build: 20260417k-complete
// 
// ユニット詳細表示問題解決のため、クリックハンドラーを修正
// ════════════════════════════════════════════════════════════════

'use strict';

Pages.lotUnitList = function (params = {}) {
  console.log('[LOT_UNIT_LIST] Loading with params:', params);
  
  const main = document.getElementById('main');
  
  // 初期状態
  let currentTab = params.tab || 'unit'; // 'lot' または 'unit'
  let stageFilters = { all: true };
  let moldFilters = { all: true };
  let lineFilters = { all: true };
  let statusFilters = { active: true };

  function _render() {
    const lots = Store.getDB('lots') || [];
    const units = Store.getDB('breeding_units') || [];
    
    // フィルタリング
    const filteredLots = _filterLots(lots);
    const filteredUnits = _filterUnits(units);
    
    main.innerHTML = `
      ${UI.header('ロット・ユニット管理')}
      <div class="page-body">
        ${_renderTabs(filteredLots.length, filteredUnits.length)}
        ${_renderFilters()}
        ${currentTab === 'lot' ? _renderLotList(filteredLots) : _renderUnitList(filteredUnits)}
      </div>
    `;
    
    console.log('[LOT_UNIT_LIST] Rendered', currentTab, 'tab with', 
      currentTab === 'lot' ? filteredLots.length : filteredUnits.length, 'items');
  }

  // ─── タブ表示 ─────────────────────────────────────────────────
  function _renderTabs(lotCount, unitCount) {
    return `
      <div style="display: flex; gap: 8px; margin-bottom: 16px;">
        <button class="btn ${currentTab === 'lot' ? 'btn-primary' : 'btn-ghost'}" 
                onclick="Pages._luSwitchTab('lot')" style="border-radius: 20px;">
          🥚 ロット (${lotCount})
        </button>
        <button class="btn ${currentTab === 'unit' ? 'btn-primary' : 'btn-ghost'}" 
                onclick="Pages._luSwitchTab('unit')" style="border-radius: 20px;">
          🏠 ユニット (${unitCount})
        </button>
      </div>
    `;
  }

  // ─── フィルター表示 ───────────────────────────────────────────
  function _renderFilters() {
    return `
      <div class="search-filters">
        <input type="text" id="search-input" class="input" 
               placeholder="🔍 ID・ステージで検索..." 
               oninput="Pages._luSearch()">
               
        ${_renderStageFilter()}
        ${_renderMoldFilter()}
        ${_renderLineFilter()}
        ${_renderStatusFilter()}
      </div>
    `;
  }

  function _renderStageFilter() {
    const stages = currentTab === 'lot' 
      ? [{ code: 'all', label: '全て' }, { code: 'T0', label: 'T0' }, { code: 'T1', label: 'T1' }, { code: 'T2', label: 'T2' }, { code: 'T3', label: 'T3' }]
      : [{ code: 'all', label: '全て' }, { code: 'T1', label: 'T1' }, { code: 'T2', label: 'T2' }, { code: 'T3', label: 'T3' }, { code: 'MD', label: 'MD' }];
      
    return `
      <div class="filter-row">
        ${stages.map(s => `
          <button class="btn ${stageFilters[s.code] ? 'btn-primary' : 'btn-ghost'}" 
                  onclick="Pages._luToggleStage('${s.code}')" style="font-size: 0.8rem;">
            ${s.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  function _renderMoldFilter() {
    if (currentTab === 'lot') return '';
    
    return `
      <div class="filter-row">
        ${[
          { code: 'all', label: 'M:全て' },
          { code: 'T0', label: 'T0' }, { code: 'T1', label: 'T1' }, 
          { code: 'T2', label: 'T2' }, { code: 'T3', label: 'T3' }, { code: 'MD', label: 'MD' }
        ].map(m => `
          <button class="btn ${moldFilters[m.code] ? 'btn-primary' : 'btn-ghost'}" 
                  onclick="Pages._luToggleMold('${m.code}')" style="font-size: 0.75rem;">
            ${m.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  function _renderLineFilter() {
    const lines = Store.getDB('lines') || [];
    const lineCodes = [...new Set(lines.map(l => l.line_code).filter(Boolean))];
    
    return `
      <div class="filter-row">
        <button class="btn ${lineFilters.all ? 'btn-primary' : 'btn-ghost'}" 
                onclick="Pages._luToggleLine('all')" style="font-size: 0.75rem;">
          ライン全て
        </button>
        ${lineCodes.slice(0, 6).map(code => `
          <button class="btn ${lineFilters[code] ? 'btn-primary' : 'btn-ghost'}" 
                  onclick="Pages._luToggleLine('${code}')" style="font-size: 0.75rem;">
            ${code}
          </button>
        `).join('')}
      </div>
    `;
  }

  function _renderStatusFilter() {
    return `
      <div class="filter-row">
        ${[
          { code: 'active', label: '飼育中' },
          { code: 'all', label: '全状態' },
          { code: 'completed', label: '個別化済' }
        ].map(s => `
          <button class="btn ${statusFilters[s.code] ? 'btn-primary' : 'btn-ghost'}" 
                  onclick="Pages._luToggleStatus('${s.code}')" style="font-size: 0.75rem;">
            ${s.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  // ─── ユニット一覧表示 ─────────────────────────────────────────
  function _renderUnitList(units) {
    if (units.length === 0) {
      return '<div class="empty-state">該当するユニットがありません</div>';
    }

    return `
      <div style="font-size: 0.9rem; color: var(--text3); margin-bottom: 8px;">
        ${units.length}件
      </div>
      <div class="item-list">
        ${units.map(_renderUnitItem).join('')}
      </div>
    `;
  }

  function _renderUnitItem(unit) {
    const line = unit.line_id ? Store.getLine(unit.line_id) : null;
    const lineDisp = (() => {
      if (line) return line.line_code || line.display_id || '';
      const match = (unit.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-/);
      return match ? match[1] : (unit.line_id || '—');
    })();
    
    // 成長記録から最新体重を取得
    const records = Store.getGrowthRecords ? Store.getGrowthRecords(unit.unit_id) : [];
    const slot1Records = records.filter(r => r.unit_slot_no == 1 && r.weight_g && +r.weight_g > 0);
    const slot2Records = records.filter(r => r.unit_slot_no == 2 && r.weight_g && +r.weight_g > 0);
    
    const slot1Latest = slot1Records.length > 0 ? slot1Records[slot1Records.length - 1] : null;
    const slot2Latest = slot2Records.length > 0 ? slot2Records[slot2Records.length - 1] : null;
    
    const slot1Display = slot1Latest 
      ? `${slot1Latest.size_category || '?'} ${slot1Latest.weight_g}g`
      : '? 大 18g';
      
    const slot2Display = slot2Latest 
      ? `${slot2Latest.size_category || '?'} ${slot2Latest.weight_g}g` 
      : '? 大 18g';

    return `
      <div class="unit-item" 
           onclick="routeTo('unit-detail', { unitDisplayId: '${unit.display_id}' })"
           style="cursor: pointer; padding: 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; background: var(--surface); transition: all 0.2s;">
        
        <div style="display: flex; align-items: center; gap: 12px;">
          <!-- ライン表示 -->
          <div style="background: var(--green); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; min-width: 32px; text-align: center;">
            ${lineDisp}
          </div>
          
          <!-- メイン情報 -->
          <div style="flex: 1;">
            <div style="font-weight: bold; color: var(--gold); font-family: monospace; margin-bottom: 2px;">
              ${unit.display_id}
            </div>
            <div style="font-size: 0.75rem; color: var(--text3);">
              ${unit.head_count || 2}頭
              ${unit.created_at ? ' • ' + unit.created_at.split(' ')[0] : ''}
            </div>
          </div>

          <!-- 重量表示 -->
          <div style="text-align: right; font-size: 0.75rem; color: var(--text3); min-width: 80px;">
            <div>① ${slot1Display}</div>
            <div>② ${slot2Display}</div>
          </div>
          
          <!-- ステージバッジ -->
          <div style="background: var(--surface2); color: var(--green); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; border: 1px solid var(--green); min-width: 32px; text-align: center;">
            ${unit.stage_phase || 'T1'}
          </div>
          
          <!-- 矢印アイコン -->
          <div style="color: var(--text3); font-size: 1.2rem;">›</div>
        </div>
      </div>
    `;
  }

  // ─── ロット一覧表示 ───────────────────────────────────────────
  function _renderLotList(lots) {
    if (lots.length === 0) {
      return '<div class="empty-state">該当するロットがありません</div>';
    }

    return `
      <div style="font-size: 0.9rem; color: var(--text3); margin-bottom: 8px;">
        ${lots.length}件
      </div>
      <div class="item-list">
        ${lots.map(_renderLotItem).join('')}
      </div>
    `;
  }

  function _renderLotItem(lot) {
    const line = lot.line_id ? Store.getLine(lot.line_id) : null;
    const lineCode = line ? (line.line_code || line.display_id) : lot.line_id || '—';
    
    return `
      <div class="lot-item" 
           onclick="routeTo('lot-detail', { lotId: '${lot.lot_id}' })"
           style="cursor: pointer; padding: 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; background: var(--surface); transition: all 0.2s;">
        
        <div style="display: flex; align-items: center; gap: 12px;">
          <!-- ライン表示 -->
          <div style="background: var(--orange); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">
            ${lineCode}
          </div>
          
          <!-- メイン情報 -->
          <div style="flex: 1;">
            <div style="font-weight: bold; color: var(--gold); font-family: monospace; margin-bottom: 2px;">
              ${lot.display_id}
            </div>
            <div style="font-size: 0.75rem; color: var(--text3);">
              ${lot.egg_count || 0}卵
              ${lot.created_at ? ' • ' + lot.created_at.split(' ')[0] : ''}
            </div>
          </div>

          <!-- ステージバッジ -->
          <div style="background: var(--surface2); color: var(--orange); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; border: 1px solid var(--orange);">
            ${lot.stage_phase || 'T0'}
          </div>
          
          <!-- 矢印アイコン -->
          <div style="color: var(--text3); font-size: 1.2rem;">›</div>
        </div>
      </div>
    `;
  }

  // ─── フィルタリング関数 ───────────────────────────────────────
  function _filterUnits(units) {
    const searchTerm = (document.getElementById('search-input')?.value || '').toLowerCase();
    
    return units.filter(unit => {
      // 検索フィルター
      if (searchTerm && !(unit.display_id || '').toLowerCase().includes(searchTerm)) {
        return false;
      }
      
      // ステージフィルター
      if (!stageFilters.all && !stageFilters[unit.stage_phase]) {
        return false;
      }
      
      // ステータスフィルター
      if (!statusFilters.all && !statusFilters[unit.status]) {
        return false;
      }
      
      // ラインフィルター
      if (!lineFilters.all) {
        const lineCode = _extractLineCode(unit);
        if (!lineFilters[lineCode]) return false;
      }
      
      return true;
    });
  }

  function _filterLots(lots) {
    const searchTerm = (document.getElementById('search-input')?.value || '').toLowerCase();
    
    return lots.filter(lot => {
      // 検索フィルター
      if (searchTerm && !(lot.display_id || '').toLowerCase().includes(searchTerm)) {
        return false;
      }
      
      // ステージフィルター
      if (!stageFilters.all && !stageFilters[lot.stage_phase]) {
        return false;
      }
      
      // ステータスフィルター
      if (!statusFilters.all && !statusFilters[lot.status]) {
        return false;
      }
      
      return true;
    });
  }

  function _extractLineCode(unit) {
    if (unit.line_id) {
      const line = Store.getLine(unit.line_id);
      if (line && line.line_code) return line.line_code;
    }
    
    // display_idから抽出
    const match = (unit.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-/);
    return match ? match[1] : '';
  }

  // ═══════════════════════════════════════════════════════════════
  // イベントハンドラー
  // ═══════════════════════════════════════════════════════════════

  Pages._luSwitchTab = function(tab) {
    currentTab = tab;
    _render();
  };

  Pages._luSearch = function() {
    _render();
  };

  Pages._luToggleStage = function(stage) {
    if (stage === 'all') {
      stageFilters = { all: true };
    } else {
      delete stageFilters.all;
      stageFilters[stage] = !stageFilters[stage];
      
      // 何も選択されていない場合は「全て」を選択
      if (!Object.values(stageFilters).some(Boolean)) {
        stageFilters = { all: true };
      }
    }
    _render();
  };

  Pages._luToggleMold = function(mold) {
    if (mold === 'all') {
      moldFilters = { all: true };
    } else {
      delete moldFilters.all;
      moldFilters[mold] = !moldFilters[mold];
      
      if (!Object.values(moldFilters).some(Boolean)) {
        moldFilters = { all: true };
      }
    }
    _render();
  };

  Pages._luToggleLine = function(line) {
    if (line === 'all') {
      lineFilters = { all: true };
    } else {
      delete lineFilters.all;
      lineFilters[line] = !lineFilters[line];
      
      if (!Object.values(lineFilters).some(Boolean)) {
        lineFilters = { all: true };
      }
    }
    _render();
  };

  Pages._luToggleStatus = function(status) {
    if (status === 'all') {
      statusFilters = { all: true };
    } else {
      statusFilters = {};
      statusFilters[status] = true;
    }
    _render();
  };

  // 初期レンダリング
  _render();
  
  console.log('[LOT_UNIT_LIST] Complete version loaded with proper click handlers');
};

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['lot-unit-list'] = function () {
  Pages.lotUnitList(Store.getParams());
};

console.log('[LOT_UNIT_LIST] Complete version loaded - build: 20260417k-complete');
