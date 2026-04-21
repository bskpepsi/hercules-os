// ════════════════════════════════════════════════════════════════
// store.js
// 役割: アプリ全体の状態とローカルキャッシュを一元管理する。
//
// 本番仕様:
//   - navigate() に _skipNavEvent 追加（routeTo 二重実行防止）
//   - ステージ: L1L2 / L3 / PREPUPA / PUPA / ADULT_PRE / ADULT
//   - ステータス: alive / for_sale / listed / sold / dead
//   - localStorage 容量超過時の保護処理
// ════════════════════════════════════════════════════════════════

'use strict';

// Version marker — update when deploying to verify cache bust
// 20260418a: Step2 ③ 性別頭数集計 — getSexStats() 追加 / filterIndividuals の '_unknown' 対応
// 20260421f: 販売候補フィルタ修正 — for_sale フラグ判定 (T2移行直後の個体対応)
//            飼育中フィルタから for_sale===true 個体を除外
console.log('[HerculesOS] store.js v20260421f loaded');

const Store = (() => {

  let _state = {
    page:       'dashboard',
    prevPage:   null,
    pageParams: {},
    navOpen:    false,
    loading:    false,
    toast:      null,
    draft:      {},
    lastSync:   null,
  };

  let _db = {
    individuals:       [],
    lots:              [],
    lines:             [],
    parents:           [],
    bloodlines:        [],
    pairings:          [],
    pairing_histories: [],
    egg_records:       [],
    growthMap:         {},
    settings:          {},
    labelHistory:      {},
  };

  // ── ページ遷移 ─────────────────────────────────────────────────
  // _skipNavEvent=true のとき nav イベントを発火しない（routeTo 専用）
  // _skipNavEvent=false（デフォルト）のとき nav イベントを発火（Store.back() 等）
  function navigate(pageId, params = {}, _skipNavEvent = false) {
    _state.prevPage   = _state.page;
    _state.page       = pageId;
    _state.pageParams = params;
    _state.draft      = {};
    if (!_skipNavEvent) _notify('nav');
  }

  function back() {
    if (_state.prevPage) navigate(_state.prevPage, {}, false);
    else navigate('dashboard', {}, false);
  }

  function getPage()   { return _state.page; }
  function getParams() { return _state.pageParams; }
  function getPrev()   { return _state.prevPage; }

  function setLoading(v) { _state.loading = v; _notify('loading'); }
  function isLoading()   { return _state.loading; }

  function toast(msg, type = 'success', ms = 2800) {
    _state.toast = { msg, type, ts: Date.now() };
    _notify('toast');
    setTimeout(() => { _state.toast = null; _notify('toast'); }, ms);
  }

  // ── DB 書き込み ────────────────────────────────────────────────
  function setDB(key, value) {
    _db[key] = value;
    _notify('db_' + key);
    _scheduleSave();
  }

  function patchDBItem(key, idField, id, patch) {
    const arr = _db[key];
    if (!Array.isArray(arr)) return;
    const i = arr.findIndex(r => r[idField] === id);
    if (i !== -1) {
      _db[key][i] = { ..._db[key][i], ...patch };
      _notify('db_' + key);
      _scheduleSave();
    }
  }

  function addDBItem(key, item) {
    if (!Array.isArray(_db[key])) _db[key] = [];
    _db[key].unshift(item);
    _notify('db_' + key);
    _scheduleSave();
  }

  // ── DB 読み込み ────────────────────────────────────────────────
  function getDB(key)        { return _db[key]; }
  function getIndividual(id) { return _db.individuals.find(i => i.ind_id       === id) || null; }
  function getLine(id)       { return _db.lines.find(l       => l.line_id      === id) || null; }
  function getLot(id)        { return _db.lots.find(l        => l.lot_id       === id) || null; }
  function getParent(id)     { return _db.parents.find(p     => p.par_id       === id) || null; }
  function getBloodline(id)  { return _db.bloodlines.find(b  => b.bloodline_id === id) || null; }

  function getIndividualsByLine(lineId) {
    return _db.individuals.filter(i => i.line_id === lineId);
  }
  function getIndividualsByLot(lotId) {
    return _db.individuals.filter(i => i.lot_id === lotId || i.origin_lot_id === lotId);
  }

  // ── 日齢計算 ──────────────────────────────────────────────────
  function calcAge(hatchDate, targetDate) {
    if (!hatchDate) return null;
    let hdStr = hatchDate instanceof Date
      ? hatchDate.toISOString().split('T')[0]
      : String(hatchDate);
    hdStr = hdStr.replace(/-/g, '/').trim();
    const parts = hdStr.split('/');
    if (parts.length < 3) return null;
    const hatch = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    const base  = targetDate ? new Date(targetDate.replace(/\//g, '-')) : new Date();
    const ms    = base - hatch;
    if (ms < 0) return null;

    const totalDays = Math.floor(ms / 86400000);
    const weeks     = Math.floor(totalDays / 7);
    const remDays   = totalDays % 7;
    const months    = Math.floor(totalDays / 30.44);
    const remMDays  = Math.round(totalDays - months * 30.44);
    const years     = Math.floor(totalDays / 365.25);
    const remYM     = Math.floor((totalDays - years * 365.25) / 30.44);
    const remYD     = Math.round(totalDays - years * 365.25 - remYM * 30.44);

    const rules = (() => {
      try { return JSON.parse(_db.settings['stage_age_rules'] || ''); }
      catch { return DEFAULT_STAGE_AGE_RULES; }
    })();
    const rule       = rules.find(r => totalDays >= r.minDays && totalDays < r.maxDays);
    const stageGuess = rule?.label || '—';

    return {
      totalDays,
      isCurrent: !targetDate,
      baseDate:  targetDate || null,
      simple:  `${totalDays}日 / ${weeks}週 / ${(totalDays/30.44).toFixed(1)}ヶ月`,
      days:    `${totalDays}日`,
      weeks:   `${weeks}週${remDays}日`,
      months:  `${months}ヶ月${remMDays}日`,
      years:   `${years}年${remYM}ヶ月${remYD}日`,
      stageGuess,
    };
  }

  function formatRecordAge(ageDays) {
    if (!ageDays && ageDays !== 0) return '—';
    const d = +ageDays;
    const w = Math.floor(d / 7);
    return w > 0 ? `${d}日 / ${w}週` : `${d}日`;
  }

  // ── 選別判定 ──────────────────────────────────────────────────
  function getVerdict(ind) {
    const w     = parseFloat(ind.latest_weight_g);
    const stage = ind.current_stage;
    const sex   = ind.sex;
    if (!w || !stage || !sex) return null;
    const rules = (() => {
      try { return JSON.parse(_db.settings['selection_rules'] || ''); }
      catch { return DEFAULT_SELECTION_RULES; }
    })();
    const sexKey = sex === '♂' ? 'male' : sex === '♀' ? 'female' : null;
    if (!sexKey) return null;
    const sr = (rules[sexKey] || []).filter(r => r.stage === stage).sort((a,b) => b.minWeight - a.minWeight);
    return sr.find(r => w >= r.minWeight) || null;
  }

  // ── 成長記録キャッシュ ─────────────────────────────────────────
  function setGrowthRecords(targetId, records) {
    _db.growthMap[targetId] = records;
    _scheduleSave();
  }
  function getGrowthRecords(targetId) {
    return _db.growthMap[targetId] || null;
  }
  function addGrowthRecord(targetId, record) {
    if (!_db.growthMap[targetId]) _db.growthMap[targetId] = [];
    _db.growthMap[targetId].push(record);
    _db.growthMap[targetId].sort((a,b) => a.record_date.localeCompare(b.record_date));
    _scheduleSave();
  }

  // ── 設定 ──────────────────────────────────────────────────────
  function setSetting(key, val) {
    _db.settings[key] = val;
    if (key === 'gas_url')    CONFIG.GAS_URL    = val;
    if (key === 'gemini_key') CONFIG.GEMINI_KEY = val;
    _scheduleSave();
  }
  function getSetting(key) { return _db.settings[key] || ''; }

  // ── 永続化 ────────────────────────────────────────────────────
  let _saveTimer = null;
  function _scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_persist, 1200);
  }
  function _persist() {
    try {
      const trimmed = {};
      Object.entries(_db.growthMap).forEach(([k,v]) => { trimmed[k] = v.slice(-100); });
      const payload = { ..._db, growthMap: trimmed };
      const json    = JSON.stringify(payload);
      // 容量超過対策: 4MB超ならgrowthMapをさらに削減して再試行
      if (json.length > 4 * 1024 * 1024) {
        const slim = {};
        Object.entries(_db.growthMap).forEach(([k,v]) => { slim[k] = v.slice(-20); });
        localStorage.setItem(CONFIG.LS_KEYS.DB,
          JSON.stringify({ ..._db, growthMap: slim, labelHistory: {} }));
      } else {
        localStorage.setItem(CONFIG.LS_KEYS.DB, json);
      }
      localStorage.setItem(CONFIG.LS_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (e) {
      console.warn('Store: localStorage書き込み失敗', e);
      try {
        localStorage.setItem(CONFIG.LS_KEYS.DB,
          JSON.stringify({ ..._db, growthMap: {}, labelHistory: {} }));
      } catch(e2) { console.error('Store: 緊急保存も失敗', e2); }
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(CONFIG.LS_KEYS.DB);
      if (raw) _db = { ..._db, ...JSON.parse(raw) };
      const gasUrl    = localStorage.getItem(CONFIG.LS_KEYS.GAS_URL);
      const geminiKey = localStorage.getItem(CONFIG.LS_KEYS.GEMINI_KEY);
      if (gasUrl)    { CONFIG.GAS_URL    = gasUrl;    _db.settings.gas_url    = gasUrl;    }
      if (geminiKey) { CONFIG.GEMINI_KEY = geminiKey; _db.settings.gemini_key = geminiKey; }
      _state.lastSync = localStorage.getItem(CONFIG.LS_KEYS.LAST_SYNC);
    } catch (e) { console.warn('Store: ローカルデータ読み込み失敗', e); }
  }

  function clearCache() {
    _db = { individuals:[], lots:[], lines:[], parents:[], bloodlines:[],
            pairings:[], pairing_histories:[], egg_records:[],
            growthMap:{}, settings: _db.settings, labelHistory:{} };
    _scheduleSave();
    _notify('db_all');
  }

  // ── イベント購読 ──────────────────────────────────────────────
  const _listeners = {};
  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  }
  function off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(f => f !== fn);
  }
  function _notify(event) {
    (_listeners[event] || []).forEach(fn => { try { fn(); } catch(e) {} });
    (_listeners['*']   || []).forEach(fn => { try { fn(event); } catch(e) {} });
  }

  function setDraft(key, val) { _state.draft[key] = val; }
  function getDraft(key)      { return _state.draft[key]; }
  function clearDraft()       { _state.draft = {}; }

  // ── フィルタ ──────────────────────────────────────────────────
  function filterIndividuals(filters = {}) {
    let list = [..._db.individuals];
    if (filters.line_id)      list = list.filter(i => i.line_id      === filters.line_id);
    if (filters.lot_id)       list = list.filter(i => i.lot_id       === filters.lot_id || i.origin_lot_id === filters.lot_id);
    if (filters.unit_id)      list = list.filter(i =>
      i.origin_unit_id === filters.unit_id ||
      i.source_unit_id === filters.unit_id
    );
    if (filters.bloodline_id) list = list.filter(i => i.bloodline_id === filters.bloodline_id);

    if (filters.stage) {
      list = list.filter(i => i.current_stage === filters.stage);
    }

    if (filters.sex === '_unknown') {
      list = list.filter(i => !i.sex || i.sex === '不明' || i.sex === '?');
    } else if (filters.sex) {
      list = list.filter(i => i.sex === filters.sex);
    }

    const _TERMINAL_STATUSES = new Set(['dead', 'sold']);

    // 飼育中系ステータス（新旧両対応）
    const _ALIVE_STATUSES = new Set([
      'alive',                                    // 新仕様
      'larva','prepupa','pupa','adult',            // 旧ライフサイクル（GASデフォルト）
      'seed_candidate','seed_reserved',            // 旧種親候補
    ]);

    // [20260421f] 販売候補フラグ判定（for_sale===true も販売候補として扱う）
    //   T2移行等で作成された個体は status='larva'/'alive' のまま for_sale=true だけが
    //   セットされている場合があるため、for_sale===true を個別にチェックする。
    const _isForSaleInd = function(i) {
      return i.for_sale === true || i.for_sale === 'true'
          || i.for_sale === 1    || i.for_sale === '1'
          || i.status === 'for_sale';
    };

    if (filters.status === '_all' || filters.status === '') {
      // 全状態: フィルタなし（sold・dead含む全件）
    } else if (filters.status === 'alive') {
      // 「飼育中」= 新仕様のalive + 旧ライフサイクルステータス全て
      //   ただし販売候補フラグが立っている個体は「販売候補」タブに分離するので除外
      list = list.filter(i => _ALIVE_STATUSES.has(i.status) && !_isForSaleInd(i));
    } else if (filters.status === 'for_sale') {
      // 「販売候補」= status==='for_sale' または for_sale===true (T2移行直後の個体を拾う)
      //   ただし sold/dead の終端ステータスは除外（sold後に for_sale フラグが残る可能性）
      list = list.filter(i => _isForSaleInd(i) && !_TERMINAL_STATUSES.has(i.status));
    } else if (filters.status) {
      list = list.filter(i => i.status === filters.status);
    }
    // 注: filters.status === '' は上の _all 分岐で処理済みのためここには到達しない

    if (filters.guinness) list = list.filter(i => String(i.guinness_flag) === 'true');
    if (filters.parent_flag) {
      list = list.filter(i =>
        String(i.parent_flag||'').toLowerCase() === 'true' ||
        i.parent_flag === true || i.parent_flag === 1
      );
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter(i =>
        (i.display_id   || '').toLowerCase().includes(q) ||
        (i.note_private || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  function getPairingStats(parId) {
    if (!parId) return { total: 0, lastDate: null, nextReadyDate: null, scheduledCount: 0 };
    try {
      const all     = (_db.pairing_histories || []).filter(
        h => h && (h.male_parent_id === parId || h.female_parent_id === parId)
      );
      const done    = all.filter(h => !h.status || h.status === 'done');
      const planned = all.filter(h => h.status === 'planned');
      const sorted  = [...done].sort(
        (a, b) => String(b.pairing_date||'').localeCompare(String(a.pairing_date||''))
      );
      const lastDate = sorted.length ? (sorted[0].pairing_date || null) : null;
      let nextReadyDate = null;
      if (lastDate) {
        const minDays = parseInt(_db.settings?.male_pairing_interval_min_days || '7', 10);
        const parts = String(lastDate).replace(/-/g,'/').split('/');
        if (parts.length >= 3) {
          const d = new Date(+parts[0], +parts[1]-1, +parts[2]);
          d.setDate(d.getDate() + minDays);
          nextReadyDate = d.toISOString().split('T')[0].replace(/-/g,'/');
        }
      }
      return { total: sorted.length, lastDate, nextReadyDate, scheduledCount: planned.length, planned };
    } catch(e) {
      return { total: 0, lastDate: null, nextReadyDate: null, scheduledCount: 0, planned: [] };
    }
  }

  function filterLots(filters = {}) {
    let list = [..._db.lots];
    if (filters.line_id) list = list.filter(l => l.line_id === filters.line_id);
    if (filters.stage)   list = list.filter(l => (l.stage_life || l.stage) === filters.stage);
    if (filters.status !== 'all') {
      // LOTのデフォルト表示は 'active'（管理中）のみ
      list = list.filter(l => l.status === (filters.status || 'active'));
    }
    return list;
  }

  // ── breeding_units ─────────────────────────────────────────────
  function getUnitByDisplayId(displayId) {
    return (_db.breeding_units || []).find(u => u.display_id === displayId) || null;
  }
  function getUnit(unitId) {
    return (_db.breeding_units || []).find(u => u.unit_id === unitId) || null;
  }
  // 指定ロットに由来するユニット一覧を返す
  function getUnitsByOriginLotId(lotId) {
    if (!lotId) return [];
    const units = _db.breeding_units || [];
    return units.filter(u => {
      // source_lots (JSON配列) に含まれるか
      if (u.source_lots) {
        try {
          const arr = typeof u.source_lots === 'string' ? JSON.parse(u.source_lots) : u.source_lots;
          if (Array.isArray(arr) && arr.includes(lotId)) return true;
        } catch(_) {}
      }
      // origin_lot_id が一致するか
      if (u.origin_lot_id === lotId) return true;
      // members の lot_id に含まれるか
      try {
        const mems = typeof u.members === 'string' ? JSON.parse(u.members) : (u.members || []);
        if (Array.isArray(mems) && mems.some(m => m.lot_id === lotId)) return true;
      } catch(_) {}
      return false;
    });
  }

  // ── 性別頭数集計（Step2 ③）─────────────────────────────────
  // 全体/種親/個別/ユニット別の♂♀不明カウント
  //
  // 飼育中判定:
  //   - IND: status が alive / larva / prepupa / pupa / adult / seed_candidate / seed_reserved
  //   - BU:  status === 'active'
  //   - PAR: status === 'active'（♂♀のみ、不明は想定しない）
  function getSexStats() {
    const parents = _db.parents        || [];
    const inds    = _db.individuals    || [];
    const units   = _db.breeding_units || [];

    const ALIVE_IND = new Set([
      'alive', 'larva', 'prepupa', 'pupa', 'adult',
      'seed_candidate', 'seed_reserved',
    ]);
    const isUnknown = v => !v || v === '不明' || v === '?';

    // 種親（active のみ）
    const pActive = parents.filter(p => p.status === 'active');
    const parStats = {
      male:   pActive.filter(p => p.sex === '♂').length,
      female: pActive.filter(p => p.sex === '♀').length,
    };

    // 個体（飼育中ステータスのみ）
    const iAlive = inds.filter(i => ALIVE_IND.has(i.status));
    const indStats = {
      male:    iAlive.filter(i => i.sex === '♂').length,
      female:  iAlive.filter(i => i.sex === '♀').length,
      unknown: iAlive.filter(i => isUnknown(i.sex)).length,
    };

    // ユニット（active のみ、members[] を展開）
    const uActive = units.filter(u => u.status === 'active');
    let uMale = 0, uFemale = 0, uUnknown = 0;
    uActive.forEach(u => {
      let mems = u.members;
      if (typeof mems === 'string' && mems.trim()) {
        try { mems = JSON.parse(mems); } catch (_) { mems = []; }
      }
      if (!Array.isArray(mems)) mems = [];
      mems.forEach(m => {
        if (m.sex === '♂')      uMale++;
        else if (m.sex === '♀') uFemale++;
        else                    uUnknown++;
      });
    });
    const unitStats = {
      male:      uMale,
      female:    uFemale,
      unknown:   uUnknown,
      unitCount: uActive.length,
    };

    const total = {
      male:    parStats.male   + indStats.male   + unitStats.male,
      female:  parStats.female + indStats.female + unitStats.female,
      unknown: indStats.unknown + unitStats.unknown,
    };

    return {
      total,
      parents:     parStats,
      individuals: indStats,
      units:       unitStats,
    };
  }

  return {
    navigate, back, getPage, getParams, getPrev,
    setLoading, isLoading, toast,
    setDB, patchDBItem, addDBItem, getDB,
    getIndividual, getLine, getLot, getParent, getBloodline,
    getIndividualsByLine, getIndividualsByLot,
    getUnitByDisplayId, getUnit, getUnitsByOriginLotId,
    calcAge, formatRecordAge,
    getVerdict,
    setGrowthRecords, getGrowthRecords, addGrowthRecord,
    setSetting, getSetting,
    loadFromStorage, clearCache,
    on, off,
    setDraft, getDraft, clearDraft,
    filterIndividuals, filterLots,
    getPairingStats,
    getSexStats,
  };
})();
