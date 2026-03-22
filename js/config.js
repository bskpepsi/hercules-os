// ════════════════════════════════════════════════════════════════
// config.js — HerculesOS 本番仕様版 v2.0
//
// ステージ: L1L2 / L3 / PREPUPA / PUPA / ADULT_PRE / ADULT
// ステータス: alive / for_sale / listed / sold / dead
// 廃止: T2A, T2B, 旧細分ステージ, reserved, seed_candidate, seed_reserved
// ════════════════════════════════════════════════════════════════

'use strict';

const CONFIG = {
  APP_NAME:    'HerculesOS',
  APP_VERSION: '2.0.0',
  PHASE:       6,
  GAS_URL:     '',
  GEMINI_KEY:  '',
  LS_KEYS: {
    GAS_URL:    'hcos_gas_url',
    GEMINI_KEY: 'hcos_gemini_key',
    DB:         'hcos_db_v1',
    SETTINGS:   'hcos_settings',
    LAST_SYNC:  'hcos_last_sync',
  },
};

// ════════════════════════════════════════════════════════════════
// ステージ定義 — 本番6区分
// ════════════════════════════════════════════════════════════════
const STAGE_TYPES = {
  L1L2:      { code:'L1L2',      label:'L1L2',           order:1, color:'#4caf50' },
  L3:        { code:'L3',        label:'L3',              order:2, color:'#2196f3' },
  PREPUPA:   { code:'PREPUPA',   label:'前蛹',             order:3, color:'#e65100' },
  PUPA:      { code:'PUPA',      label:'蛹',              order:4, color:'#bf360c' },
  ADULT_PRE: { code:'ADULT_PRE', label:'成虫（未後食）',   order:5, color:'#9c27b0' },
  ADULT:     { code:'ADULT',     label:'成虫（活動開始）', order:6, color:'#c8a84b' },
};

// STAGE_LIST: UI選択肢・フォームで使う
const STAGE_LIST = Object.values(STAGE_TYPES);

function stageLabel(code) {
  return STAGE_TYPES[code]?.label || code || '—';
}
function stageColor(code) {
  return STAGE_TYPES[code]?.color || '#888';
}

// ════════════════════════════════════════════════════════════════
// マット種別 (T0〜T3 はマット名として維持)
// ════════════════════════════════════════════════════════════════
const MAT_TYPES = [
  { code:'T0',       label:'T0マット' },
  { code:'T1',       label:'T1マット' },
  { code:'T2',       label:'T2マット' },
  { code:'T3',       label:'T3マット' },
  { code:'MDカブト', label:'MDカブトマット' },
];

function matLabel(matType, matMolt) {
  if (matType === 'T2' && matMolt) return 'T2(M)';
  const found = MAT_TYPES.find(m => m.code === matType);
  return found ? found.label : (matType || '—');
}

// ステージ別推奨マット（新6区分）
const MAT_RECOMMEND = {
  L1L2:      'T0',
  L3:        'T2',
  PREPUPA:   'MDカブト',
  PUPA:      null,
  ADULT_PRE: null,
  ADULT:     null,
};

function recommendedMat(stageCode) {
  return MAT_RECOMMEND[stageCode] || null;
}

// ════════════════════════════════════════════════════════════════
// 交換周期ルール（マットタイプ別）
// ════════════════════════════════════════════════════════════════
const MAT_EXCHANGE_RULES = {
  T0:       60,
  T1:       90,
  T2:       90,
  T3:       120,
  MDカブト: 60,
};
const EXCHANGE_RULES = MAT_EXCHANGE_RULES; // 別名（後方互換）

const MAT_EXCHANGE_MODE = {
  NORMAL: 'normal',
  HYBRID: 'hybrid',
};

const HYBRID_STAGE_MULTIPLIER = {
  PREPUPA: 0, PUPA: 0, ADULT_PRE: 0, ADULT: 0,
  L1L2: 1.0,
  L3:   1.0,
};

function getExchangeDays(matType, settingsMap, stageCode, lotCount) {
  const key    = 'exchange_days_' + (matType || '');
  const stored = settingsMap && settingsMap[key];
  const base   = stored
    ? (parseInt(stored, 10) || 0)
    : (MAT_EXCHANGE_RULES[matType] !== undefined ? MAT_EXCHANGE_RULES[matType] : 60);

  const mode = (settingsMap && settingsMap['mat_exchange_mode']) || MAT_EXCHANGE_MODE.NORMAL;
  if (mode !== MAT_EXCHANGE_MODE.HYBRID) return base;

  const stageMult = HYBRID_STAGE_MULTIPLIER[stageCode];
  if (stageMult === undefined) return base;
  if (stageMult === 0) return 0;
  const countMult = (lotCount && parseInt(lotCount, 10) > 1) ? 0.85 : 1.0;
  return Math.round(base * stageMult * countMult);
}

// ════════════════════════════════════════════════════════════════
// 交換アラート判定
// ════════════════════════════════════════════════════════════════
const ALERT_DAYS = { caution: 7, warning: 7 };

function getAlertDays(settingsMap) {
  return {
    caution: parseInt((settingsMap && settingsMap.alert_caution_days) || ALERT_DAYS.caution, 10),
    warning: parseInt((settingsMap && settingsMap.alert_warning_days) || ALERT_DAYS.warning, 10),
  };
}

function calcExchangeAlert(lastChangeDate, exchangeDays, overrideDate, settingsMap) {
  if (!lastChangeDate || exchangeDays === 0) return { level: 'none', daysLeft: null, nextDate: null };
  const baseDate = new Date(String(lastChangeDate).replace(/\//g, '-'));
  let nextDate;
  if (overrideDate) {
    nextDate = new Date(String(overrideDate).replace(/\//g, '-'));
  } else {
    nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + exchangeDays);
  }
  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((nextDate - today) / 86400000);
  const ad       = getAlertDays(settingsMap);
  const level    = daysLeft > ad.caution ? 'normal'
                 : daysLeft >= -ad.warning ? 'caution' : 'warning';
  return { level, daysLeft, nextDate: nextDate.toISOString().slice(0, 10) };
}

function exchangeAlertBadge(alert) {
  if (!alert || alert.level === 'none' || alert.level === 'normal') return '';
  if (alert.level === 'warning') {
    return '<span style="font-size:.68rem;background:rgba(220,50,50,.15);color:var(--red);'
      + 'border:1px solid rgba(220,50,50,.4);border-radius:4px;padding:1px 6px;font-weight:700">🔴 '
      + (alert.daysLeft < 0 ? Math.abs(alert.daysLeft) + '日超過' : '交換推奨') + '</span>';
  }
  const txt = alert.daysLeft <= 0 ? '交換時期' : '残' + alert.daysLeft + '日';
  return '<span style="font-size:.68rem;background:rgba(230,150,0,.12);color:var(--amber);'
    + 'border:1px solid rgba(230,150,0,.35);border-radius:4px;padding:1px 6px;font-weight:700">🟡 '
    + txt + '</span>';
}

// ════════════════════════════════════════════════════════════════
// ステージ自動判定（日齢ベース・新6区分）
// ════════════════════════════════════════════════════════════════
const DEFAULT_STAGE_AGE_RULES = [
  { minDays:   0, maxDays: 150, code: 'L1L2',   label: 'L1L2' },
  { minDays: 150, maxDays: 350, code: 'L3',      label: 'L3'   },
  { minDays: 350, maxDays: 9999,code: 'PREPUPA', label: '前蛹'  },
];

function calcAutoStage(ageDays, weights, settingsMap) {
  if (weights && weights.length >= 3) {
    const sorted = weights.slice().sort((a, b) =>
      String(b.record_date).localeCompare(String(a.record_date)));
    if (parseFloat(sorted[0].weight_g) < parseFloat(sorted[1].weight_g) &&
        parseFloat(sorted[1].weight_g) < parseFloat(sorted[2].weight_g)) {
      return 'PREPUPA';
    }
  }
  let rules = DEFAULT_STAGE_AGE_RULES;
  if (settingsMap && settingsMap.stage_age_rules) {
    try { rules = JSON.parse(settingsMap.stage_age_rules); } catch(e) {}
  }
  for (const r of rules) {
    if (ageDays >= r.minDays && ageDays < r.maxDays) return r.code;
  }
  return 'PREPUPA';
}

// ════════════════════════════════════════════════════════════════
// 延長オプション
// ════════════════════════════════════════════════════════════════
const EXTEND_OPTIONS = [
  { days: 15, label: '15日延長' },
  { days: 30, label: '30日延長' },
];

// ════════════════════════════════════════════════════════════════
// 個体ステータス — 本番5区分
// ════════════════════════════════════════════════════════════════
const IND_STATUS = {
  ALIVE:    { code:'alive',    label:'飼育中',   color:'#4caf78' },
  FOR_SALE: { code:'for_sale', label:'販売候補', color:'#9c27b0' },
  LISTED:   { code:'listed',   label:'出品中',   color:'#ff9800' },
  SOLD:     { code:'sold',     label:'販売済',   color:'#e09040' },
  DEAD:     { code:'dead',     label:'死亡',     color:'#e05050' },
};

function indStatusLabel(code) {
  return Object.values(IND_STATUS).find(s => s.code === code)?.label || code || '—';
}
function indStatusColor(code) {
  return Object.values(IND_STATUS).find(s => s.code === code)?.color || '#888';
}

// ════════════════════════════════════════════════════════════════
// ロットステータス
// ════════════════════════════════════════════════════════════════
const LOT_STATUS = {
  ACTIVE:         { code:'active',         label:'管理中'   },
  INDIVIDUALIZED: { code:'individualized', label:'個体化済' },
  DISSOLVED:      { code:'dissolved',      label:'分割済'   },
  FOR_SALE:       { code:'for_sale',       label:'販売候補' },
  LISTED:         { code:'listed',         label:'出品中'   },
  SOLD:           { code:'sold',           label:'販売済'   },
};

// ════════════════════════════════════════════════════════════════
// その他定数（変更なし）
// ════════════════════════════════════════════════════════════════
const BLOODLINE_STATUS = {
  CONFIRMED: { code:'confirmed', label:'確定', color:'#4caf78' },
  TEMPORARY: { code:'temporary', label:'暫定', color:'#e09040' },
  UNKNOWN:   { code:'unknown',   label:'不明', color:'#888'    },
};
function bloodlineStatusLabel(code) {
  return Object.values(BLOODLINE_STATUS).find(s => s.code === code)?.label || code || '—';
}

const PUBLIC_LEVELS = {
  PUBLIC:  { code:'public',     label:'公開',      icon:'🌐' },
  BUYER:   { code:'buyer_only', label:'購入者限定', icon:'🔑' },
  PRIVATE: { code:'private',    label:'非公開',    icon:'🔒' },
};

const CONTAINER_SIZES = ['1.8L', '2.7L', '4.8L'];

const EXCHANGE_TYPES = [
  { code:'FULL',    label:'全交換'   },
  { code:'PARTIAL', label:'追加のみ' },
];

const LABEL_TYPES = {
  EGG_LOT:   'egg_lot',
  MULTI_LOT: 'multi_lot',
  IND_FIXED: 'ind_fixed',
  SET:       'set',
};

const DEFAULT_SELECTION_RULES = {
  male: [
    { stage:'L3', minWeight:100, label:'ギネス候補',   cls:'guinness' },
    { stage:'L3', minWeight: 75, label:'継続主力',     cls:'keep'     },
    { stage:'L3', minWeight: 50, label:'スペース次第', cls:'check'    },
    { stage:'L3', minWeight:  0, label:'販売推奨',     cls:'sell'     },
  ],
  female: [
    { stage:'L3', minWeight:30, label:'継続ブリード用', cls:'keep'  },
    { stage:'L3', minWeight:20, label:'スペース次第',   cls:'check' },
    { stage:'L3', minWeight: 0, label:'販売推奨',       cls:'sell'  },
  ],
};

const VERDICT_COLORS = {
  guinness: { bg:'rgba(200,168,75,0.18)', border:'rgba(200,168,75,0.5)', text:'#c8a84b', icon:'🏆' },
  keep:     { bg:'rgba(76,175,120,0.15)', border:'rgba(76,175,120,0.4)', text:'#4caf78', icon:'▶'  },
  check:    { bg:'rgba(224,144,64,0.15)', border:'rgba(224,144,64,0.4)', text:'#e09040', icon:'△'  },
  sell:     { bg:'rgba(224,80,80,0.12)',  border:'rgba(224,80,80,0.35)', text:'#e05050', icon:'✕'  },
};

const DRIVE_FOLDERS = {
  INDIVIDUALS: 'Individuals',
  GROWTH:      'Growth',
  SALE:        'SalePhotos',
  LABELS:      'Labels',
};

const BACKUP_TYPES   = { DAILY:'Daily', WEEKLY:'Weekly', MONTHLY:'Monthly', MANUAL:'Manual' };
const BACKUP_RETAIN  = { Daily:7, Weekly:4, Monthly:12, Manual:999 };
const BACKUP_DISPLAY = {
  type_labels:  { Daily:'毎日（Daily）', Weekly:'毎週（Weekly）', Monthly:'毎月（Monthly）', Manual:'手動（Manual）' },
  type_icons:   { Daily:'📅', Weekly:'📆', Monthly:'🗓️', Manual:'✋' },
  status_icons: { success:'✅', error:'❌', running:'⏳' },
};

const NAV_TABS = [
  { id:'dashboard',   label:'ホーム', icon:'🏠', phase:1 },
  { id:'growth-rec',  label:'記録',   icon:'📷', phase:1 },
  { id:'individuals', label:'個体',   icon:'🐛', phase:1 },
  { id:'manage',      label:'管理',   icon:'📋', phase:1 },
  { id:'settings',    label:'設定',   icon:'⚙️', phase:1 },
];
