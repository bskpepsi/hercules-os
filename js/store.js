// ════════════════════════════════════════════════════════════════
// store.js - データストア管理（完全版）
// build: 20260417k-complete
// 
// ユニット詳細表示問題解決のため、すべてのヘルパー関数を統合
// ════════════════════════════════════════════════════════════════

'use strict';

// Storeオブジェクトのグローバル定義
window.Store = window.Store || {};

(function() {
  const Store = window.Store;
  
  // ローカルストレージキー
  const LS_KEYS = {
    DB_PREFIX: 'hcos_db_',
    CACHE_PREFIX: 'hcos_cache_',
    SETTINGS_PREFIX: 'hcos_setting_'
  };

  // ═══════════════════════════════════════════════════════════════
  // データベース基本操作
  // ═══════════════════════════════════════════════════════════════

  /**
   * データベーステーブルを取得
   */
  Store.getDB = function(tableName) {
    try {
      const data = localStorage.getItem(LS_KEYS.DB_PREFIX + tableName);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('[Store.getDB] Parse error for', tableName, ':', e);
      return [];
    }
  };

  /**
   * データベーステーブルを設定
   */
  Store.setDB = function(tableName, data) {
    try {
      localStorage.setItem(LS_KEYS.DB_PREFIX + tableName, JSON.stringify(data || []));
      console.log('[Store.setDB] Saved', tableName, 'with', (data || []).length, 'items');
    } catch (e) {
      console.error('[Store.setDB] Save error for', tableName, ':', e);
    }
  };

  /**
   * データベース項目の部分更新
   */
  Store.patchDBItem = function(dbName, keyField, keyValue, updates) {
    const items = Store.getDB(dbName) || [];
    const index = items.findIndex(function(item) {
      return item[keyField] === keyValue;
    });
    
    if (index !== -1) {
      Object.assign(items[index], updates);
      Store.setDB(dbName, items);
      console.log('[Store.patchDBItem] Updated:', dbName, keyValue, Object.keys(updates));
    } else {
      console.warn('[Store.patchDBItem] Item not found:', dbName, keyField, keyValue);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // ユニット関連操作
  // ═══════════════════════════════════════════════════════════════

  /**
   * display_id でユニットを取得
   */
  Store.getUnitByDisplayId = function(displayId) {
    if (!displayId) return null;
    
    const units = Store.getDB('breeding_units') || [];
    return units.find(function(unit) {
      return unit.display_id === displayId || unit.unit_id === displayId;
    });
  };

  /**
   * unit_id でユニットを取得  
   */
  Store.getUnit = function(unitId) {
    if (!unitId) return null;
    
    const units = Store.getDB('breeding_units') || [];
    return units.find(function(unit) {
      return unit.unit_id === unitId;
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // 個体関連操作
  // ═══════════════════════════════════════════════════════════════

  /**
   * 個体を取得
   */
  Store.getIndividual = function(indId) {
    if (!indId) return null;
    
    const individuals = Store.getDB('individuals') || [];
    return individuals.find(function(ind) {
      return ind.ind_id === indId;
    });
  };

  /**
   * 個体一覧をフィルタ
   */
  Store.filterIndividuals = function(filter) {
    const individuals = Store.getDB('individuals') || [];
    if (!filter) return individuals;
    
    return individuals.filter(function(ind) {
      if (filter.status && ind.status !== filter.status) return false;
      if (filter.line_id && ind.line_id !== filter.line_id) return false;
      return true;
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // ロット関連操作
  // ═══════════════════════════════════════════════════════════════

  /**
   * ロットを取得
   */
  Store.getLot = function(lotId) {
    if (!lotId) return null;
    
    const lots = Store.getDB('lots') || [];
    return lots.find(function(lot) {
      return lot.lot_id === lotId;
    });
  };

  /**
   * ロット一覧をフィルタ
   */
  Store.filterLots = function(filter) {
    const lots = Store.getDB('lots') || [];
    if (!filter) return lots;
    
    return lots.filter(function(lot) {
      if (filter.status && lot.status !== filter.status) return false;
      if (filter.line_id && lot.line_id !== filter.line_id) return false;
      return true;
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // ライン関連操作
  // ═══════════════════════════════════════════════════════════════

  /**
   * ライン取得
   */
  Store.getLine = function(lineId) {
    if (!lineId) return null;
    
    const lines = Store.getDB('lines') || [];
    return lines.find(function(line) {
      return line.line_id === lineId;
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // 成長記録関連操作
  // ═══════════════════════════════════════════════════════════════

  /**
   * 成長記録マップを取得
   */
  function _getGrowthMap() {
    return Store.getDB('growthMap') || {};
  }

  /**
   * 成長記録マップを設定
   */
  function _setGrowthMap(growthMap) {
    Store.setDB('growthMap', growthMap || {});
  }

  /**
   * 対象の成長記録取得
   */
  Store.getGrowthRecords = function(targetId) {
    if (!targetId) return [];
    
    const growthMap = _getGrowthMap();
    return growthMap[targetId] || [];
  };

  /**
   * 対象の成長記録設定
   */
  Store.setGrowthRecords = function(targetId, records) {
    if (!targetId) return;
    
    const growthMap = _getGrowthMap();
    growthMap[targetId] = records || [];
    _setGrowthMap(growthMap);
  };

  /**
   * 成長記録を追加
   */
  Store.addGrowthRecord = function(targetId, record) {
    if (!targetId || !record) return;
    
    const existing = Store.getGrowthRecords(targetId);
    existing.push(record);
    Store.setGrowthRecords(targetId, existing);
  };

  // ═══════════════════════════════════════════════════════════════
  // ユーティリティ関数
  // ═══════════════════════════════════════════════════════════════

  /**
   * 日齢計算
   */
  Store.calcAge = function(hatchDate) {
    if (!hatchDate) return null;
    
    try {
      const normalizedDate = hatchDate.replace(/\//g, '-');
      const hatch = new Date(normalizedDate);
      const now = new Date();
      
      if (isNaN(hatch.getTime())) return null;
      
      const diffMs = now - hatch;
      const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (totalDays < 0) return null;
      
      const months = Math.floor(totalDays / 30);
      const days = totalDays % 30;
      
      return { totalDays, months, days };
    } catch (e) {
      console.warn('[Store.calcAge] Error:', e);
      return null;
    }
  };

  /**
   * URLパラメータ取得
   */
  Store.getParams = function() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    for (const [key, value] of params) {
      result[key] = value;
    }
    return result;
  };

  /**
   * 設定値取得
   */
  Store.getSetting = function(key, defaultValue) {
    try {
      const value = localStorage.getItem(LS_KEYS.SETTINGS_PREFIX + key);
      return value !== null ? value : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  };

  /**
   * 設定値設定
   */
  Store.setSetting = function(key, value) {
    try {
      localStorage.setItem(LS_KEYS.SETTINGS_PREFIX + key, value);
    } catch (e) {
      console.warn('[Store.setSetting] Error:', e);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // ナビゲーション・戻る機能
  // ═══════════════════════════════════════════════════════════════

  let _navigationHistory = [];

  Store.pushHistory = function(pageInfo) {
    _navigationHistory.push(pageInfo);
    if (_navigationHistory.length > 10) {
      _navigationHistory = _navigationHistory.slice(-10);
    }
  };

  Store.back = function() {
    if (_navigationHistory.length > 1) {
      _navigationHistory.pop(); // 現在のページ
      const prev = _navigationHistory.pop(); // 前のページ
      if (prev && typeof routeTo === 'function') {
        routeTo(prev.page, prev.params);
      }
    } else if (typeof history !== 'undefined' && history.length > 1) {
      history.back();
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // 同期・データ更新
  // ═══════════════════════════════════════════════════════════════

  /**
   * エンティティタイプごとの同期
   */
  Store.syncEntityType = function(entityType) {
    console.log('[Store.syncEntityType] Syncing:', entityType);
    // 実際の同期処理はAPIコールが必要
    // ここではプレースホルダー
    return Promise.resolve();
  };

  console.log('[Store] Complete store management loaded');

})();

// ════════════════════════════════════════════════════════════════
// ルーティング関数（グローバル）
// ════════════════════════════════════════════════════════════════

window.routeTo = window.routeTo || function(pageName, params) {
  console.log('[routeTo]', pageName, params);
  
  //履歴に保存
  if (typeof Store.pushHistory === 'function') {
    Store.pushHistory({ page: pageName, params: params });
  }
  
  // URLパラメータを設定
  const urlParams = new URLSearchParams();
  if (params) {
    Object.keys(params).forEach(key => {
      urlParams.set(key, params[key]);
    });
  }
  
  // ページ関数を取得・実行
  const pageFunction = window.PAGES && window.PAGES[pageName];
  if (typeof pageFunction === 'function') {
    // URLを更新
    const newUrl = window.location.pathname + '?' + urlParams.toString();
    if (typeof history !== 'undefined') {
      history.pushState(params, '', newUrl);
    }
    
    // ページ関数を実行
    try {
      pageFunction();
    } catch (error) {
      console.error('[routeTo] Page function error:', error);
      alert('ページの読み込みでエラーが発生しました: ' + error.message);
    }
  } else {
    console.error('[routeTo] Page function not found:', pageName);
    console.log('Available pages:', Object.keys(window.PAGES || {}));
    alert('ページが見つかりません: ' + pageName);
  }
};

console.log('[Store] Complete version loaded - build: 20260417k-complete');
