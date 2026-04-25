// ════════════════════════════════════════════════════════════════
// store.js
// build: 20260425d
// 役割: アプリ全体の状態とローカルキャッシュを一元管理する。
//
// 本番仕様:
//   - navigate() に _skipNavEvent 追加（routeTo 二重実行防止）
//   - ステージ: L1L2 / L3 / PREPUPA / PUPA / ADULT_PRE / ADULT
//   - ステータス: alive / for_sale / listed / sold / dead
//   - localStorage 容量超過時の保護処理
//
// [20260425d] 🔥 幽霊 growthMap データ漏洩バグへの恒久対策
//   症状: T1 移行セッションで A2-U01 のラベル発行を押すと、
//         スプレッドシートに存在しない 4/18 20g/20g + 4/20 35g/38g の
//         「幽霊データ」がラベル下部の記録表に表示される。
//   根本原因: 別ユニット (HM2025-A1-U06 / 内部 ID BU-7stnssf) が個体化
//             された後も、その unit_id をキーとする growthMap[BU-7stnssf]
//             の 4 件が孤児として残留。中断中の _t2SessionData が同じ
//             unit_id を保持していたため、後続の T1 セッションで構築される
//             unitDraft (またはエイリアス map) を経由して別ユニットの
//             ラベル生成時に getMergedUnitGrowthRecords が誤って引き当てた。
//   対応:
//     A. loadFromStorage 終端で _gcOrphanGrowthRecords を呼び、
//        breeding_units / individuals / lots に紐づかない BU-/IND-/LOT-
//        プレフィックスの growthMap キーと、display_id 形式 (HM2025-...)
//        の冗長キーを起動時に自動 GC する。
//     B. resolveUnitMembers / resolveUnitT1Date / getMergedUnitGrowthRecords
//        が unit.unit_id を信用するのは、その unit_id が breeding_units に
//        実在する場合のみ。実在しない (= ドラフト or ゾンビ) なら
//        display_id を使う。これで中断 T2 セッションの unit_id がドラフト
//        経由で漏洩しても、別ユニットの記録が引き寄せられない。
//   公開: Store.gcOrphanGrowthRecords を露出、コンソールから手動実行可能。
//
// [20260424u] 🔥 ID 正規化レイヤー導入 (single source of truth)
//   背景: 同じユニットの成長記録が unit_id (BU-xxx) と display_id (HM2025-A1-Uxx)
//         で別々のキーとして growthMap に保存されており、表示画面ごとにどちらの
//         キーを使うかでデータ欠損やキャッシュの不整合が頻発していた。
//         label / lot / t2_session / t3_session / unit_detail で個別にハック
//         (両キー merge) を入れる対症療法を続けていた。
//   対応: Store の入口 (set/get/add) で id を内部 ID に正規化する。
//         _idAliasMap[display_id] = internal_id を維持し、display_id で渡された
//         場合は自動で内部 ID に変換してアクセス。
//         setDB('breeding_units' / 'individuals' / 'lots' / 'lines' / 'parents')
//         が呼ばれるたびに、各レコードの display_id → internal_id を map に登録。
//   利点: (1) 各画面の両キー merge ハックが不要になる
//         (2) どちらのキーで保存・取得しても同じ結果が得られる
//         (3) 既存呼び出しの互換性を保てる (既存の display_id ベース呼び出しも動く)
//   注意: 永続化対象には _idAliasMap を含めない (毎回 setDB 時に再構築する設計)。
// ════════════════════════════════════════════════════════════════

'use strict';

// Version marker — update when deploying to verify cache bust
// 20260418a: Step2 ③ 性別頭数集計 — getSexStats() 追加 / filterIndividuals の '_unknown' 対応
// 20260421f: 販売候補フィルタ修正 — for_sale フラグ判定 (T2移行直後の個体対応)
//            飼育中フィルタから for_sale===true 個体を除外
// 20260424u: ID正規化レイヤー導入 (display_id ↔ internal_id 自動変換)
// 20260425d: 幽霊 growthMap データ漏洩への対策 (起動時 GC + resolveUnit* の防御)
console.log('[HerculesOS] store.js v20260425d loaded');

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

  // ── [20260424u] ID 正規化レイヤー ─────────────────────────────
  // 設計:
  //   _idAliasMap[<display_id>] = <internal_id>
  //     例: { 'HM2025-A1-U06': 'BU-7stnssf', 'HM2025-A1-013': 'IND-30spfjd' }
  //   _aliasOwners[<table>] = Set<display_id>
  //     どの table が登録した entry かを追跡。setDB で table 全体が
  //     置換されたとき、その table 由来の古い alias を確実に除去できる。
  // 永続化対象にはしない (setDB / loadFromStorage 時に再構築)。
  let _idAliasMap   = {};
  let _aliasOwners  = {};

  // 引数が display_id ならエイリアスを解決して internal_id を返す。
  // internal_id ならそのまま返す。null/undefined もそのまま返す。
  function _resolveId(id) {
    if (!id) return id;
    return _idAliasMap[id] || id;
  }

  // table 名から internal id フィールド名を返す
  function _internalKeyForTable(table) {
    if (table === 'individuals')    return 'ind_id';
    if (table === 'breeding_units') return 'unit_id';
    if (table === 'lots')           return 'lot_id';
    if (table === 'lines')          return 'line_id';
    if (table === 'parents')        return 'par_id';
    if (table === 'bloodlines')     return 'bloodline_id';
    return null;
  }

  // 単一レコードを alias map に登録
  function _registerAliasFromRecord(table, rec) {
    if (!rec || typeof rec !== 'object') return;
    const internalKey = _internalKeyForTable(table);
    if (!internalKey) return;
    const internalId = rec[internalKey];
    const displayId  = rec.display_id;
    if (!internalId || !displayId || displayId === internalId) return;
    // [20260424u] 衝突検出: 別 internal_id に既にマッピングされている場合は警告
    //   (実運用では発生しないが、データ不整合の早期発見のため)
    const existing = _idAliasMap[displayId];
    if (existing && existing !== internalId) {
      console.warn('[Store] alias collision: display_id "' + displayId
        + '" was "' + existing + '", overwriting with "' + internalId
        + '" (table=' + table + ')');
    }
    _idAliasMap[displayId] = internalId;
    if (!_aliasOwners[table]) _aliasOwners[table] = new Set();
    _aliasOwners[table].add(displayId);
  }

  // [20260424u] 指定 table が登録した alias を全て解除 (setDB 時に呼ぶ)
  //   これにより、削除されたレコードの alias が残留しなくなる。
  function _clearAliasesForTable(table) {
    const owned = _aliasOwners[table];
    if (!owned) return;
    owned.forEach(function(displayId){
      delete _idAliasMap[displayId];
    });
    _aliasOwners[table] = new Set();
  }

  // table 配列全体からエイリアス map を再構築
  function _rebuildAliasMapForTable(table, arr) {
    _clearAliasesForTable(table);
    if (!Array.isArray(arr)) return;
    arr.forEach(function(rec){ _registerAliasFromRecord(table, rec); });
  }

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
    // [20260424u] エイリアス map を再構築
    _rebuildAliasMapForTable(key, value);
    _notify('db_' + key);
    _scheduleSave();
  }

  function patchDBItem(key, idField, id, patch) {
    const arr = _db[key];
    if (!Array.isArray(arr)) return;
    // [20260424u] id が display_id でも引けるように解決
    const resolvedId = _resolveId(id);
    const i = arr.findIndex(r => r[idField] === resolvedId || r[idField] === id);
    if (i !== -1) {
      _db[key][i] = { ..._db[key][i], ...patch };
      // [20260424u] patch によって display_id が変わった可能性があるので alias 更新
      _registerAliasFromRecord(key, _db[key][i]);
      _notify('db_' + key);
      _scheduleSave();
    }
  }

  function addDBItem(key, item) {
    if (!Array.isArray(_db[key])) _db[key] = [];
    _db[key].unshift(item);
    // [20260424u] 新規追加 record の alias を登録
    _registerAliasFromRecord(key, item);
    _notify('db_' + key);
    _scheduleSave();
  }

  // ── DB 読み込み ────────────────────────────────────────────────
  // [20260424u] 各 get 関数は display_id でも引けるように _resolveId を通す。
  //   既存の internal_id 呼び出しはそのまま動作する (映射に無ければ素通し)。
  //   見つからなければ display_id 直接マッチも保険として試す。
  function getDB(key)        { return _db[key]; }
  function getIndividual(id) {
    const r = _resolveId(id);
    return _db.individuals.find(i => i.ind_id === r)
        || _db.individuals.find(i => i.display_id === id)
        || null;
  }
  function getLine(id)       { return _db.lines.find(l       => l.line_id      === id) || null; }
  function getLot(id)        {
    const r = _resolveId(id);
    return _db.lots.find(l => l.lot_id === r)
        || _db.lots.find(l => l.display_id === id)
        || null;
  }
  function getParent(id)     {
    const r = _resolveId(id);
    return _db.parents.find(p => p.par_id === r)
        || _db.parents.find(p => p.display_id === id)
        || null;
  }
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
  // [20260424u] 全ての関数で _resolveId を通し、display_id / internal_id
  //   どちらで呼んでも同じ場所 (internal_id キー) を参照するように。
  //   これで「両キー merge」のハックが不要になる。
  function setGrowthRecords(targetId, records) {
    const id = _resolveId(targetId);
    _db.growthMap[id] = records;
    _scheduleSave();
  }
  function getGrowthRecords(targetId) {
    const id = _resolveId(targetId);
    return _db.growthMap[id] || null;
  }
  function addGrowthRecord(targetId, record) {
    const id = _resolveId(targetId);
    if (!_db.growthMap[id]) _db.growthMap[id] = [];
    _db.growthMap[id].push(record);
    _db.growthMap[id].sort((a,b) => a.record_date.localeCompare(b.record_date));
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
      // [20260424u] localStorage 復帰後にエイリアス map を再構築
      _idAliasMap  = {};
      _aliasOwners = {};
      ['individuals','lots','lines','parents','bloodlines','breeding_units']
        .forEach(function(tbl){
          if (Array.isArray(_db[tbl])) _rebuildAliasMapForTable(tbl, _db[tbl]);
        });
      // [20260425d] 起動時に孤児 growthMap キーを自動 GC
      //   中断された T2 セッションや個体化済ユニットの古い unit_id に紐づく
      //   成長記録が、後続セッションの unitDraft 経由で別ユニットのラベルに
      //   「幽霊データ」として漏洩するバグを根絶するための予防策。
      _gcOrphanGrowthRecords();
    } catch (e) { console.warn('Store: ローカルデータ読み込み失敗', e); }
  }

  // [20260425d] growthMap の孤児キーを自動 GC
  //   breeding_units / individuals / lots に紐づかないキーを除去する。
  //   - BU-/IND-/LOT- プレフィックスのキー: 各テーブルの internal_id 集合に
  //     存在しなければ削除 (ゾンビ)。
  //   - HM2025-... 形式の display_id キー: alias map (display_id → internal_id)
  //     により、setGrowthRecords は内部 ID キーで保存されるはずで
  //     display_id キーは redundant のため削除。
  //   - その他のキー (例: 連続スキャンの _tmp_xxx 等) は保守のため触らない。
  //   削除があれば _scheduleSave で localStorage に書き戻す。
  function _gcOrphanGrowthRecords() {
    const gm = _db.growthMap;
    if (!gm || typeof gm !== 'object') return;
    const validBU  = new Set((_db.breeding_units||[])
      .map(function(u){ return u && u.unit_id; }).filter(Boolean));
    const validIND = new Set((_db.individuals||[])
      .map(function(i){ return i && i.ind_id; }).filter(Boolean));
    const validLOT = new Set((_db.lots||[])
      .map(function(l){ return l && l.lot_id; }).filter(Boolean));
    const removed = [];
    Object.keys(gm).forEach(function(key){
      let drop = false;
      if      (/^BU-/.test(key))      drop = !validBU.has(key);
      else if (/^IND-/.test(key))     drop = !validIND.has(key);
      else if (/^LOT-/.test(key))     drop = !validLOT.has(key);
      else if (/^HM\d{4}-/.test(key)) drop = true;
      if (drop) {
        const cnt = Array.isArray(gm[key]) ? gm[key].length : 0;
        removed.push({ key: key, count: cnt });
        delete gm[key];
      }
    });
    if (removed.length > 0) {
      console.warn('[Store GC 20260425d] orphan growthMap keys removed:', removed);
      _scheduleSave();
    }
  }

  function clearCache() {
    _db = { individuals:[], lots:[], lines:[], parents:[], bloodlines:[],
            pairings:[], pairing_histories:[], egg_records:[],
            growthMap:{}, settings: _db.settings, labelHistory:{} };
    // [20260424u] alias map もクリア
    _idAliasMap  = {};
    _aliasOwners = {};
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
  // [20260424u] getUnit / getUnitByDisplayId をエイリアス map で統一。
  //   どちらも display_id でも internal_id でも引けるようになる。
  function getUnitByDisplayId(displayId) {
    if (!displayId) return null;
    return (_db.breeding_units || []).find(u => u.display_id === displayId)
        || (function(){
            const r = _resolveId(displayId);
            return (_db.breeding_units || []).find(u => u.unit_id === r);
          })()
        || null;
  }
  function getUnit(unitId) {
    if (!unitId) return null;
    const r = _resolveId(unitId);
    return (_db.breeding_units || []).find(u => u.unit_id === r)
        || (_db.breeding_units || []).find(u => u.display_id === unitId)
        || null;
  }

  // [20260425d] 🛡️ ユニット成長記録のキー解決ヘルパー（防御層）
  //   resolveUnitMembers / resolveUnitT1Date / getMergedUnitGrowthRecords
  //   の 3 関数で、unit.unit_id || unit.display_id のフォールバックを
  //   素朴に書いていたが、それだと中断中の T2 セッション draft や
  //   個体化済で breeding_units から消えたユニットの「ゾンビ unit_id」が
  //   ドラフト経由でリークした際、別ユニットの記録を引き寄せてしまう。
  //
  //   本ヘルパーは unit.unit_id が breeding_units に実在する場合のみそれを
  //   キーとし、実在しなければ display_id を採用する。これで
  //     - T1 セッション中の unitDraft (まだ確定 unit_id 無し) → display_id
  //     - 個体化済ユニットの古い unit_id がドラフトに残っていた場合も → display_id
  //   と安全側に倒せる。alias map (display_id → internal_id) は別途稼働
  //   しているので、display_id 経由でも本来のレコードは引ける。
  function _resolveUnitGrowthKey(unit) {
    if (!unit) return null;
    if (unit.unit_id && unit.display_id) {
      const buExists = (_db.breeding_units || []).some(function(b){
        return b && b.unit_id === unit.unit_id;
      });
      if (!buExists) return unit.display_id;
    }
    return unit.unit_id || unit.display_id || null;
  }

  // [20260424u] 🌟 Single-Source-of-Truth リファクタ Phase 2
  //   ユニットの members 配列を「最新の成長記録」で補完して返す。
  //   従来は各画面 (lot.js, label.js, t2/t3_session.js, unit_detail.js) で
  //     unit.members を JSON.parse
  //     → Store.getGrowthRecords を呼び
  //     → スロット別の最新 weight_g/size_category を抽出
  //     → members[i] に上書き
  //   というロジックを直書きしており、修正漏れや両キー merge ハックの温床に
  //   なっていた。本関数で集約することで、今後仕様が変わっても store.js
  //   だけ直せば全画面に反映される。
  //
  //   引数 unit (object): breeding_units の 1 レコード
  //   返値 (Array): members 配列のコピー。weight_g/size_category は
  //          GR の最新値で上書き済 (GR が無いスロットはユニット本体の値)。
  function resolveUnitMembers(unit) {
    if (!unit) return [];
    let members = [];
    try {
      const raw = unit.members;
      members = Array.isArray(raw) ? raw.slice()
        : (typeof raw === 'string' && raw.trim()) ? JSON.parse(raw)
        : [];
    } catch(_e) { members = []; }
    // 元データに副作用を与えないため shallow copy
    members = members.map(function(m){ return Object.assign({}, m || {}); });

    // 成長記録から各スロットの最新を取得
    // [20260425d] _resolveUnitGrowthKey でゾンビ unit_id をフィルタ。
    //   実在しない unit_id がドラフト経由でリークしても他ユニットの記録を
    //   参照しないようにするための防御層。
    const recs = getGrowthRecords(_resolveUnitGrowthKey(unit)) || [];
    if (recs.length === 0) return members;

    // スロット別の最新 record を抽出
    const bySlot = {};
    recs.forEach(function(r){
      if (!r) return;
      const slot = parseInt(r.unit_slot_no, 10);
      if (!slot) return;
      if (!bySlot[slot] || String(r.record_date||'') > String(bySlot[slot].record_date||'')) {
        bySlot[slot] = r;
      }
    });

    // members に反映
    for (let s = 1; s <= Math.max(2, members.length); s++) {
      const latest = bySlot[s];
      if (!latest) continue;
      const idx = s - 1;
      if (!members[idx]) members[idx] = {};
      if (latest.weight_g)      members[idx].weight_g      = latest.weight_g;
      if (latest.size_category) members[idx].size_category = latest.size_category;
    }
    return members;
  }

  // [20260424u] ユニットの T1 開始日相当の日付を返す。
  //   優先順位: 最古の record_date > unit.t1_date > unit.created_at
  //   ラベル発行や成長グラフで「ユニット作成日 (= T1 開始)」を
  //   描画する際に使用。GR の編集が即反映されるようにするのが狙い。
  function resolveUnitT1Date(unit) {
    if (!unit) return '';
    // [20260425d] _resolveUnitGrowthKey でゾンビ unit_id を弾く
    const recs = getGrowthRecords(_resolveUnitGrowthKey(unit)) || [];
    if (recs.length > 0) {
      const sorted = recs.slice().sort(function(a,b){
        return String(a.record_date||'').localeCompare(String(b.record_date||''));
      });
      const earliest = sorted[0];
      if (earliest && earliest.record_date) return earliest.record_date;
    }
    return unit.t1_date || unit.created_at || '';
  }

  // [20260424u] ユニットの成長記録を全件返す。
  //   Store の ID 正規化により unit_id / display_id どちらを渡しても
  //   同じキー (internal_id) を引くので、シンプルに getGrowthRecords を呼ぶだけ。
  // [20260425d] ゾンビ unit_id 防御のため _resolveUnitGrowthKey を経由。
  function getMergedUnitGrowthRecords(unit) {
    if (!unit) return [];
    const recs = getGrowthRecords(_resolveUnitGrowthKey(unit)) || [];
    return recs.slice();
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
    // [20260424u] ID 正規化レイヤー (外部からも利用可)
    resolveId: _resolveId,
    // [20260424u] Single-Source-of-Truth: ユニット members を GR で補完
    resolveUnitMembers,
    resolveUnitT1Date,
    getMergedUnitGrowthRecords,
    // [20260425d] 孤児 growthMap キーの手動 GC を露出
    gcOrphanGrowthRecords: _gcOrphanGrowthRecords,
  };
})();
