// ════════════════════════════════════════════════════════════════
// store.js
// 役割: アプリ全体の状態とローカルキャッシュを一元管理する。
//       GASへの通信結果をここに保存し、画面はここから読む。
//       ページ遷移用の currentPage / currentId もここで管理する。
//       DB はシンプルなオブジェクトで、localStorageに定期保存する。
// ════════════════════════════════════════════════════════════════

'use strict';

const Store = (() => {

  // ── 状態 ──────────────────────────────────────────────────────
  let _state = {
    // ページ遷移
    page:     'dashboard',   // 現在の画面ID
    prevPage: null,
    pageParams: {},          // 画面に渡すパラメータ { id, mode, ... }

    // UI
    navOpen:  false,
    loading:  false,
    toast:    null,          // { msg, type:'success'|'error'|'info', ts }

    // フォーム下書き（画面離脱時に保持）
    draft:    {},

    // 最終同期日時
    lastSync: null,
  };

  // ── DB（ローカルキャッシュ） ────────────────────────────────────
  let _db = {
    individuals:       [],
    lots:              [],
    lines:             [],
    parents:           [],
    bloodlines:        [],
    pairings:          [],
    pairing_histories: [],
    growthMap:   {},  // target_id → records[]
    settings:    {},
    labelHistory:{},  // target_id → labels[]
  };

  // ── ページ遷移 ─────────────────────────────────────────────────
  function navigate(pageId, params = {}) {
    _state.prevPage  = _state.page;
    _state.page      = pageId;
    _state.pageParams = params;
    _state.draft     = {};   // 下書きクリア
    _notify('nav');
  }

  function back() {
    if (_state.prevPage) navigate(_state.prevPage);
    else navigate('dashboard');
  }

  function getPage()   { return _state.page; }
  function getParams() { return _state.pageParams; }
  function getPrev()   { return _state.prevPage; }

  // ── ローディング ───────────────────────────────────────────────
  function setLoading(v) { _state.loading = v; _notify('loading'); }
  function isLoading()   { return _state.loading; }

  // ── トースト ───────────────────────────────────────────────────
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
    _db[key].unshift(item);   // 新しいものを先頭に
    _notify('db_' + key);
    _scheduleSave();
  }

  // ── DB 読み込み ────────────────────────────────────────────────
  function getDB(key) { return _db[key]; }

  // 個体1件
  function getIndividual(id) {
    return _db.individuals.find(i => i.ind_id === id) || null;
  }
  // ライン1件
  function getLine(id) {
    return _db.lines.find(l => l.line_id === id) || null;
  }
  // ロット1件
  function getLot(id) {
    return _db.lots.find(l => l.lot_id === id) || null;
  }
  // 種親1件
  function getParent(id) {
    return _db.parents.find(p => p.par_id === id) || null;
  }
  // 血統1件
  function getBloodline(id) {
    return _db.bloodlines.find(b => b.bloodline_id === id) || null;
  }

  // ライン別個体リスト
  function getIndividualsByLine(lineId) {
    return _db.individuals.filter(i => i.line_id === lineId);
  }
  // ロット別個体リスト（元ロット含む）
  function getIndividualsByLot(lotId) {
    return _db.individuals.filter(i => i.lot_id === lotId || i.origin_lot_id === lotId);
  }

  // ── 日齢計算（フロント版） ─────────────────────────────────────
  // hatchDate: 'YYYY/MM/DD' 文字列
  // targetDate: 計算基準日（省略時=今日）→「現在の日齢」と「記録時点の日齢」を区別
  function calcAge(hatchDate, targetDate) {
    if (!hatchDate) return null;
    // DateオブジェクトやISO形式('2026-03-15')も受け付けるよう正規化
    let hdStr = hatchDate instanceof Date
      ? hatchDate.toISOString().split('T')[0]
      : String(hatchDate);
    hdStr = hdStr.replace(/-/g, '/').trim();  // '2026-03-15' → '2026/03/15'
    const parts = hdStr.split('/');
    if (parts.length < 3) return null;
    const hatch = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    const base  = targetDate ? new Date(targetDate.replace(/\//g, '-')) : new Date();
    const ms    = base - hatch;
    if (ms < 0) return null;

    const totalDays  = Math.floor(ms / 86400000);
    const weeks      = Math.floor(totalDays / 7);
    const remDays    = totalDays % 7;
    const months     = Math.floor(totalDays / 30.44);
    const remMDays   = Math.round(totalDays - months * 30.44);
    const years      = Math.floor(totalDays / 365.25);
    const remYM      = Math.floor((totalDays - years * 365.25) / 30.44);
    const remYD      = Math.round(totalDays - years * 365.25 - remYM * 30.44);

    // ステージ目安
    const rules  = (() => {
      try { return JSON.parse(_db.settings['stage_age_rules'] || ''); }
      catch { return DEFAULT_STAGE_AGE_RULES; }
    })();
    const rule   = rules.find(r => totalDays >= r.minDays && totalDays < r.maxDays);
    const stageGuess = rule?.label || '—';

    return {
      totalDays,
      isCurrent:   !targetDate,   // targetDate省略=現在の日齢
      baseDate:    targetDate || null,
      // 一覧用（簡易）
      simple:  `${totalDays}日 / ${weeks}週 / ${(totalDays/30.44).toFixed(1)}ヶ月`,
      // 詳細用（フル）
      days:    `${totalDays}日`,
      weeks:   `${weeks}週${remDays}日`,
      months:  `${months}ヶ月${remMDays}日`,
      years:   `${years}年${remYM}ヶ月${remYD}日`,
      stageGuess,
    };
  }

  // 「記録時点の日齢」を文字列で返す（成長記録詳細表示用）
  function formatRecordAge(ageDays) {
    if (!ageDays && ageDays !== 0) return '—';
    const d = +ageDays;
    const w = Math.floor(d / 7);
    return `記録時: ${d}日（${w}週）`;
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
    return _db.growthMap[targetId] || null;  // null = 未取得
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

  // ── 永続化（localStorageへの保存） ────────────────────────────
  let _saveTimer = null;
  function _scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_persist, 1200);
  }
  function _persist() {
    try {
      // growthMap は容量が大きくなるので最新100件のみ保持
      const trimmed = {};
      Object.entries(_db.growthMap).forEach(([k,v]) => {
        trimmed[k] = v.slice(-100);
      });
      const payload = { ..._db, growthMap: trimmed };
      localStorage.setItem(CONFIG.LS_KEYS.DB,       JSON.stringify(payload));
      localStorage.setItem(CONFIG.LS_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (e) {
      console.warn('Store: localStorage書き込み失敗', e);
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
    } catch (e) {
      console.warn('Store: ローカルデータ読み込み失敗', e);
    }
  }

  function clearCache() {
    _db = { individuals:[], lots:[], lines:[], parents:[], bloodlines:[],
            pairings:[], growthMap:{}, settings: _db.settings, labelHistory:{} };
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

  // ── 下書き ────────────────────────────────────────────────────
  function setDraft(key, val) { _state.draft[key] = val; }
  function getDraft(key)      { return _state.draft[key]; }
  function clearDraft()       { _state.draft = {}; }

  // ── フィルタ・ソートヘルパー ───────────────────────────────────
  function filterIndividuals(filters = {}) {
    let list = [..._db.individuals];
    if (filters.line_id)  list = list.filter(i => i.line_id       === filters.line_id);
    if (filters.lot_id)       list = list.filter(i => i.lot_id        === filters.lot_id || i.origin_lot_id === filters.lot_id);
    if (filters.bloodline_id) list = list.filter(i => i.bloodline_id  === filters.bloodline_id);
    if (filters.stage) {
      if (filters._larvaGroup || filters.stage === 'larva') {
        // 幼虫ステージをまとめてフィルタ
        const larvaStages = ['T0','T1','T2A','T2B','T3','EGG'];
        list = list.filter(i => larvaStages.includes(i.current_stage));
      } else {
        list = list.filter(i => i.current_stage === filters.stage);
      }
    }
    if (filters.sex)      list = list.filter(i => i.sex           === filters.sex);
    // statusフィルター
    // '_all' = 全件表示（フィルタなし）
    // 空文字 = 死亡以外を表示（デフォルト）
    // 'alive'/'sold'/'dead'/'reserved' = 該当ステータスのみ
    if (filters.status === '_all') {
      // 全件：フィルタなし
    } else if (filters.status === 'alive') {
      list = list.filter(i => i.status === 'alive');
    } else if (filters.status === 'reserved') {
      list = list.filter(i => i.status === 'reserved');
    } else if (filters.status === 'sold') {
      list = list.filter(i => i.status === 'sold');
    } else if (filters.status === 'dead') {
      list = list.filter(i => i.status === 'dead');
    } else if (filters.status) {
      list = list.filter(i => i.status === filters.status);
    } else {
      // status未指定：死亡以外を表示
      list = list.filter(i => i.status !== 'dead');
    }
    if (filters.guinness) list = list.filter(i => String(i.guinness_flag) === 'true');
    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter(i =>
        (i.display_id    || '').toLowerCase().includes(q) ||
        (i.note_private  || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  // ── ペアリング統計（par_idごとのサマリー） ────────────────────
  function getPairingStats(parId) {
    if (!parId) return { total: 0, lastDate: null, nextReadyDate: null, scheduledCount: 0 };
    try {
      const all = (_db.pairing_histories || []).filter(
        h => h && (h.male_parent_id === parId || h.female_parent_id === parId)
      );
      // 実施済み: status='done' または status未設定（旧データ互換）
      const done = all.filter(h => !h.status || h.status === 'done');
      // 予定: status='planned'
      const planned = all.filter(h => h.status === 'planned');

      const sorted = [...done].sort(
        (a, b) => String(b.pairing_date||'').localeCompare(String(a.pairing_date||''))
      );
      const lastDate = sorted.length ? (sorted[0].pairing_date || null) : null;

      // 次回可能目安日: 最終ペアリング日 + 設定値(male_pairing_interval_min_days, デフォルト7日)
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

      return {
        total:          sorted.length,
        lastDate,
        nextReadyDate,
        scheduledCount: planned.length,
        planned,
      };
    } catch(e) {
      return { total: 0, lastDate: null, nextReadyDate: null, scheduledCount: 0, planned: [] };
    }
  }

  function filterLots(filters = {}) {
    let list = [..._db.lots];
    if (filters.line_id) list = list.filter(l => l.line_id === filters.line_id);
    if (filters.stage)   list = list.filter(l => l.stage   === filters.stage);
    if (filters.status)  list = list.filter(l => l.status  === filters.status);
    else                 list = list.filter(l => l.status  === 'active');
    return list;
  }

  return {
    // ページ
    navigate, back, getPage, getParams, getPrev,
    // UI
    setLoading, isLoading, toast,
    // DB
    setDB, patchDBItem, addDBItem, getDB,
    getIndividual, getLine, getLot, getParent, getBloodline,
    getIndividualsByLine, getIndividualsByLot,
    // 日齢
    calcAge, formatRecordAge,
    // 判定
    getVerdict,
    // 成長記録
    setGrowthRecords, getGrowthRecords, addGrowthRecord,
    // 設定
    setSetting, getSetting,
    // 永続化
    loadFromStorage, clearCache,
    // イベント
    on, off,
    // 下書き
    setDraft, getDraft, clearDraft,
    // フィルタ
    filterIndividuals, filterLots,
    getPairingStats,
  };
})();
