// ════════════════════════════════════════════════════════════════
// config.js  (Phase6 改訂版)
//
// 変更点:
//   - STAGE_TYPES: T0〜T3 を廃止 → L1/L2前期/L2後期/L3前期/L3中期/L3後期/前蛹/蛹/成虫
//   - MAT_TYPES: T0/T1/T2/T3/MDカブトマット（マット種別として独立）
//   - EXCHANGE_RULES: ステージ×飼育タイプ別の交換日数
//   - MAT_RECOMMEND: ステージ別推奨マット
//   - ALERT_DAYS: 注意・警告日数（設定で上書き可能）
//   - 既存コードとの後方互換は stageLabel() で維持
// ════════════════════════════════════════════════════════════════

'use strict';

const CONFIG = {
  APP_NAME:    'HerculesOS',
  APP_VERSION: '1.1.0',
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
// ステージ定義（生体の成長段階）
// T0〜T3 はステージではなくマット種別として扱う
// ════════════════════════════════════════════════════════════════
const STAGE_TYPES = {
  EGG:     { code:'EGG',      label:'卵',       order:0,  color:'#8bc34a' },
  L1:      { code:'L1',       label:'L1',       order:1,  color:'#4caf50' },
  L2_EARLY:{ code:'L2_EARLY', label:'L2前期',   order:2,  color:'#26c6da' },
  L2_LATE: { code:'L2_LATE',  label:'L2後期',   order:3,  color:'#26a69a' },
  L3_EARLY:{ code:'L3_EARLY', label:'L3前期',   order:4,  color:'#42a5f5' },
  L3_MID:  { code:'L3_MID',   label:'L3中期',   order:5,  color:'#2196f3' },
  L3_LATE: { code:'L3_LATE',  label:'L3後期',   order:6,  color:'#1565c0' },
  PREPUPA: { code:'PREPUPA',  label:'前蛹',     order:7,  color:'#e65100' },
  PUPA:    { code:'PUPA',     label:'蛹',       order:8,  color:'#bf360c' },
  ADULT:   { code:'ADULT',    label:'成虫',     order:9,  color:'#c8a84b' },

  // ── 後方互換（旧データの T0〜T3 を受け付ける）──────────────
  // 表示はラベルに変換し、実際には上のコードに移行することを推奨
  T0:      { code:'T0',  label:'L1(T0)',   order:1,  color:'#4caf50' },
  T1:      { code:'T1',  label:'L2前期(T1)', order:2, color:'#26a69a' },
  T2A:     { code:'T2A', label:'L3前期(T2①)', order:4, color:'#2196f3' },
  T2B:     { code:'T2B', label:'L3中期(T2②)', order:5, color:'#1565c0' },
  T3:      { code:'T3',  label:'L3後期(T3)',  order:6, color:'#7b1fa2' },
};

const STAGE_LIST = Object.values(STAGE_TYPES);

// 新ステージコードのみの配列（UIで選択肢として使う）
const STAGE_LIST_NEW = [
  STAGE_TYPES.L1,
  STAGE_TYPES.L2_EARLY,
  STAGE_TYPES.L2_LATE,
  STAGE_TYPES.L3_EARLY,
  STAGE_TYPES.L3_MID,
  STAGE_TYPES.L3_LATE,
  STAGE_TYPES.PREPUPA,
  STAGE_TYPES.PUPA,
  STAGE_TYPES.ADULT,
];

function stageLabel(code) {
  return STAGE_TYPES[code]?.label || code || '—';
}
function stageColor(code) {
  return STAGE_TYPES[code]?.color || '#888';
}

// ════════════════════════════════════════════════════════════════
// マット種別（飼育環境として独立）
// T0〜T3 はマット名として使う
// ════════════════════════════════════════════════════════════════
const MAT_TYPES = [
  { code:'T0',       label:'T0マット' },
  { code:'T1',       label:'T1マット' },
  { code:'T2',       label:'T2マット' },
  { code:'T3',       label:'T3マット' },
  { code:'MDカブト', label:'MDカブトマット' },
];

// マット表示名: T2 + モルト → T2(M)
function matLabel(matType, matMolt) {
  if (matType === 'T2' && matMolt) return 'T2(M)';
  const found = MAT_TYPES.find(m => m.code === matType);
  return found ? found.label : (matType || '—');
}

// ════════════════════════════════════════════════════════════════
// ステージ別推奨マット
// ════════════════════════════════════════════════════════════════
const MAT_RECOMMEND = {
  L1:       'T0',
  L2_EARLY: 'T0',
  L2_LATE:  'T1',
  L3_EARLY: 'T1',
  L3_MID:   'T2',
  L3_LATE:  'T3',
  PREPUPA:  'MDカブト',
  PUPA:     null,
  ADULT:    null,
  // 旧コード後方互換
  T0:       'T0',
  T1:       'T1',
  T2A:      'T2',
  T2B:      'T2',
  T3:       'T3',
};

function recommendedMat(stageCode) {
  return MAT_RECOMMEND[stageCode] || null;
}

// ════════════════════════════════════════════════════════════════
// 交換周期ルール（マットタイプ別）
//
// 設計方針:
//   次回交換日 = last_mat_change_date + MAT_EXCHANGE_RULES[mat_type]
//   ステージは交換周期には使わない（推奨マット・自動判定にのみ使用）
// ════════════════════════════════════════════════════════════════
const MAT_EXCHANGE_RULES = {
  T0:       60,   // T0マット: 60日
  T1:       90,   // T1マット: 90日
  T2:       90,   // T2マット（モルト含む）: 90日
  T3:       120,  // T3マット: 120日
  MDカブト: 60,   // MDカブトマット: 60日
  // 旧コード後方互換（T2A/T2B → T2 と同じ扱い）
  T2A:      90,
  T2B:      90,
};

// 後方互換: EXCHANGE_RULES を MAT_EXCHANGE_RULES の別名として定義
// （既存コードが EXCHANGE_RULES を参照している場合のフォールバック）
const EXCHANGE_RULES = MAT_EXCHANGE_RULES;

// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// 交換目安方式
//   normal  — マット基準のみ（初期値）
//   hybrid  — マット基準 + ステージ・飼育タイプ補正
// ════════════════════════════════════════════════════════════════
const MAT_EXCHANGE_MODE = {
  NORMAL: 'normal',  // 通常版：マット基準のみ
  HYBRID: 'hybrid',  // ハイブリッド版：マット基準 + 補正
};

// ハイブリッド版の補正係数テーブル
const HYBRID_STAGE_MULTIPLIER = {
  // 交換不要ステージ（0 = 交換なし）
  PREPUPA: 0, PUPA: 0, ADULT: 0,
  // 補正係数（1.0 = 補正なし）
  L1:       1.0,
  L2_EARLY: 1.0,
  L2_LATE:  1.0,
  L3_EARLY: 1.0,
  L3_MID:   1.0,
  L3_LATE:  1.2,  // L3後期は長め（120日→144日など）
};

// ════════════════════════════════════════════════════════════════
// getExchangeDays — 交換目安日数を返す
//
// @param matType     string   'T0' | 'T1' | 'T2' | 'T3' | 'MDカブト'
// @param settingsMap object   Store.getSettings() の返り値
// @param stageCode   string   ステージコード（ハイブリッド時のみ使用）
// @param lotCount    number   頭数（ハイブリッド時: 多頭補正に使用）
// @returns number  交換目安日数（0 = 交換なし）
// ════════════════════════════════════════════════════════════════
function getExchangeDays(matType, settingsMap, stageCode, lotCount) {
  // 旧コード変換（T2A/T2B → T2）
  var normalizedMat = (matType === 'T2A' || matType === 'T2B') ? 'T2' : (matType || '');

  // ── STEP1: 基底日数（設定上書き考慮）──────────────────────
  var key    = 'exchange_days_' + normalizedMat;
  var stored = settingsMap && settingsMap[key];
  var base   = stored ? (parseInt(stored, 10) || 0)
                      : (MAT_EXCHANGE_RULES[normalizedMat] !== undefined
                          ? MAT_EXCHANGE_RULES[normalizedMat] : 60);

  // ── STEP2: 方式取得（初期値 = normal）───────────────────────
  var mode = (settingsMap && settingsMap['mat_exchange_mode']) || MAT_EXCHANGE_MODE.NORMAL;

  // 通常版: 基底日数をそのまま返す
  if (mode !== MAT_EXCHANGE_MODE.HYBRID) return base;

  // ── STEP3: ハイブリッド補正 ────────────────────────────────
  var OLD_TO_NEW = { T0:'L1', T1:'L2_EARLY', T2A:'L3_EARLY', T2B:'L3_MID', T3:'L3_LATE' };
  var sc = stageCode ? (OLD_TO_NEW[stageCode] || stageCode) : '';

  // 前蛹/蛹/成虫は交換なし
  if (sc === 'PREPUPA' || sc === 'PUPA' || sc === 'ADULT') return 0;

  // ステージ補正係数
  var stageMult = HYBRID_STAGE_MULTIPLIER[sc];
  if (stageMult === undefined) stageMult = 1.0;
  if (stageMult === 0) return 0;

  // 多頭補正: 頭数2頭以上 → 0.85倍（糞が早く増える）
  var countMult = (lotCount && parseInt(lotCount, 10) > 1) ? 0.85 : 1.0;

  return Math.round(base * stageMult * countMult);
}

// ════════════════════════════════════════════════════════════════
// 交換アラート判定
//
// 仕様:
//   残り > 7日       → normal
//   残り -7 〜 +7日   → 🟡 caution  (期限前7日〜期限後7日)
//   残り < -7日       → 🔴 warning
// ════════════════════════════════════════════════════════════════
const ALERT_DAYS = {
  caution: 7,   // 期限の何日前から注意
  warning: 7,   // 期限超過から何日後に警告へ格上げ
};

// 設定上書き考慮版
function getAlertDays(settingsMap) {
  return {
    caution: parseInt((settingsMap && settingsMap.alert_caution_days) || ALERT_DAYS.caution, 10),
    warning: parseInt((settingsMap && settingsMap.alert_warning_days) || ALERT_DAYS.warning, 10),
  };
}

// 交換アラートレベルを返す
// @param lastChangeDate  string '2026/01/15' または '2026-01-15'
// @param exchangeDays    number
// @param overrideDate    string|null 延長上書き日
// @param settingsMap     object|null
// @returns { level: 'normal'|'caution'|'warning'|'none', daysLeft, nextDate }
function calcExchangeAlert(lastChangeDate, exchangeDays, overrideDate, settingsMap) {
  if (!lastChangeDate || exchangeDays === 0) return { level: 'none', daysLeft: null, nextDate: null };

  var baseDate = new Date(String(lastChangeDate).replace(/\//g, '-'));
  var nextDate;

  if (overrideDate) {
    nextDate = new Date(String(overrideDate).replace(/\//g, '-'));
  } else {
    nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + exchangeDays);
  }

  var today    = new Date();
  today.setHours(0, 0, 0, 0);
  var daysLeft = Math.round((nextDate - today) / 86400000);

  var ad = getAlertDays(settingsMap);

  var level;
  if (daysLeft > ad.caution)        level = 'normal';
  else if (daysLeft >= -ad.warning) level = 'caution';
  else                              level = 'warning';

  return {
    level:    level,
    daysLeft: daysLeft,
    nextDate: nextDate.toISOString().slice(0, 10),
  };
}

// アラートHTMLバッジを返す
function exchangeAlertBadge(alert) {
  if (!alert || alert.level === 'none' || alert.level === 'normal') return '';
  if (alert.level === 'warning') {
    return '<span style="font-size:.68rem;background:rgba(220,50,50,.15);color:var(--red);'
      + 'border:1px solid rgba(220,50,50,.4);border-radius:4px;padding:1px 6px;font-weight:700">🔴 '
      + (alert.daysLeft < 0 ? Math.abs(alert.daysLeft) + '日超過' : '交換推奨') + '</span>';
  }
  if (alert.level === 'caution') {
    var txt = alert.daysLeft <= 0 ? '交換時期' : '残' + alert.daysLeft + '日';
    return '<span style="font-size:.68rem;background:rgba(230,150,0,.12);color:var(--amber);'
      + 'border:1px solid rgba(230,150,0,.35);border-radius:4px;padding:1px 6px;font-weight:700">🟡 '
      + txt + '</span>';
  }
  return '';
}

// ════════════════════════════════════════════════════════════════
// ステージ自動判定（日齢ベース・体重補正対応構造）
// ════════════════════════════════════════════════════════════════
const DEFAULT_STAGE_AGE_RULES = [
  { minDays:   0, maxDays:  30, code: 'L1'       },
  { minDays:  30, maxDays:  90, code: 'L2_EARLY'  },
  { minDays:  90, maxDays: 150, code: 'L2_LATE'   },
  { minDays: 150, maxDays: 240, code: 'L3_EARLY'  },
  { minDays: 240, maxDays: 330, code: 'L3_MID'    },
  { minDays: 330, maxDays: 450, code: 'L3_LATE'   },
  { minDays: 450, maxDays:9999, code: 'PREPUPA'   },
];

// 日齢から自動ステージを推定する
// @param agedays  number
// @param weights  [{weight_g, record_date}] 体重履歴（新しい順）
// @param settingsMap  object|null
// @returns string stageCode
function calcAutoStage(ageDays, weights, settingsMap) {
  // 前蛹判定: 体重が2回連続で減少していれば PREPUPA候補
  if (weights && weights.length >= 3) {
    var sorted = weights.slice().sort(function(a, b) {
      return String(b.record_date).localeCompare(String(a.record_date));
    });
    if (parseFloat(sorted[0].weight_g) < parseFloat(sorted[1].weight_g) &&
        parseFloat(sorted[1].weight_g) < parseFloat(sorted[2].weight_g)) {
      // 体重が2回連続減少 → 前蛹候補
      return 'PREPUPA';
    }
  }

  // 日齢ルール（設定オーバーライド考慮）
  var rules = DEFAULT_STAGE_AGE_RULES;
  if (settingsMap && settingsMap.stage_age_rules) {
    try { rules = JSON.parse(settingsMap.stage_age_rules); } catch(e) {}
  }

  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    if (ageDays >= r.minDays && ageDays < r.maxDays) return r.code;
  }
  return 'PREPUPA';
}

// ════════════════════════════════════════════════════════════════
// 延長オプション
// ════════════════════════════════════════════════════════════════
const EXTEND_OPTIONS = [
  { days: 15,  label: '15日延長' },
  { days: 30,  label: '30日延長' },
];

// ════════════════════════════════════════════════════════════════
// 既存定数（変更なし）
// ════════════════════════════════════════════════════════════════
const IND_STATUS = {
  LARVA:          { code:'larva',          label:'幼虫',       color:'#4caf50' },
  PREPUPA:        { code:'prepupa',        label:'前蛹',       color:'#e09040' },
  PUPA:           { code:'pupa',           label:'蛹',         color:'#bf360c' },
  ADULT:          { code:'adult',          label:'成虫',       color:'#4caf78' },
  SEED_CANDIDATE: { code:'seed_candidate', label:'種親候補',   color:'#2196f3' },
  FOR_SALE:       { code:'for_sale',       label:'販売候補',   color:'#9c27b0' },
  SEED_RESERVED:  { code:'seed_reserved',  label:'種親確保済', color:'#1565c0' },
  RESERVED:       { code:'reserved',       label:'予約済',     color:'#5ba8e8' },
  LISTED:         { code:'listed',         label:'出品中',     color:'#ff9800' },
  SOLD:           { code:'sold',           label:'販売済',     color:'#e09040' },
  DEAD:           { code:'dead',           label:'死亡',       color:'#e05050' },
  EXCLUDED:       { code:'excluded',       label:'除外',       color:'#888888' },
  ALIVE:          { code:'alive',          label:'飼育中',     color:'#4caf78' },
};
function indStatusLabel(code) {
  return Object.values(IND_STATUS).find(s => s.code === code)?.label || code || '—';
}
function indStatusColor(code) {
  return Object.values(IND_STATUS).find(s => s.code === code)?.color || '#888';
}

const LOT_STATUS = {
  ACTIVE:         { code:'active',         label:'管理中' },
  INDIVIDUALIZED: { code:'individualized', label:'個体化済' },
  DISSOLVED:      { code:'dissolved',      label:'分割済' },
  FOR_SALE:       { code:'for_sale',       label:'販売候補' },
  RESERVED:       { code:'reserved',       label:'予約済' },
  LISTED:         { code:'listed',         label:'出品中' },
  SOLD:           { code:'sold',           label:'販売済' },
};

const BLOODLINE_STATUS = {
  CONFIRMED: { code:'confirmed', label:'確定', color:'#4caf78' },
  TEMPORARY: { code:'temporary', label:'暫定', color:'#e09040' },
  UNKNOWN:   { code:'unknown',   label:'不明', color:'#888' },
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
  { code:'FULL',    label:'全交換' },
  { code:'PARTIAL', label:'追加のみ' },
];

const LABEL_TYPES = [
  { code:'larva',   label:'幼虫ラベル',       target:'IND' },
  { code:'pupa',    label:'蛹ラベル',         target:'IND' },
  { code:'adult',   label:'成虫ラベル',       target:'IND' },
  { code:'lot',     label:'ロットラベル',     target:'LOT' },
  { code:'pairing', label:'産卵セットラベル', target:'SET' },
];

const DEFAULT_SELECTION_RULES = {
  male: [
    { stage:'L3_MID',  minWeight:100, label:'ギネス候補',   cls:'guinness' },
    { stage:'L3_MID',  minWeight: 75, label:'継続主力',     cls:'keep'     },
    { stage:'L3_MID',  minWeight: 50, label:'スペース次第', cls:'check'    },
    { stage:'L3_MID',  minWeight:  0, label:'販売推奨',     cls:'sell'     },
    { stage:'L3_LATE', minWeight:130, label:'ギネス候補',   cls:'guinness' },
    { stage:'L3_LATE', minWeight:100, label:'継続主力',     cls:'keep'     },
    { stage:'L3_LATE', minWeight: 75, label:'スペース次第', cls:'check'    },
    { stage:'L3_LATE', minWeight:  0, label:'販売推奨',     cls:'sell'     },
    // 旧コード後方互換
    { stage:'T2A', minWeight:100, label:'ギネス候補',   cls:'guinness' },
    { stage:'T2A', minWeight: 75, label:'継続主力',     cls:'keep'     },
    { stage:'T2A', minWeight: 50, label:'スペース次第', cls:'check'    },
    { stage:'T2A', minWeight:  0, label:'販売推奨',     cls:'sell'     },
    { stage:'T2B', minWeight:130, label:'ギネス候補',   cls:'guinness' },
    { stage:'T2B', minWeight:100, label:'継続主力',     cls:'keep'     },
    { stage:'T2B', minWeight: 75, label:'スペース次第', cls:'check'    },
    { stage:'T2B', minWeight:  0, label:'販売推奨',     cls:'sell'     },
  ],
  female: [
    { stage:'L3_MID',  minWeight:30, label:'継続ブリード用', cls:'keep'  },
    { stage:'L3_MID',  minWeight:20, label:'スペース次第',   cls:'check' },
    { stage:'L3_MID',  minWeight: 0, label:'販売推奨',       cls:'sell'  },
    { stage:'T2A', minWeight:30, label:'継続ブリード用', cls:'keep'  },
    { stage:'T2A', minWeight:20, label:'スペース次第',   cls:'check' },
    { stage:'T2A', minWeight: 0, label:'販売推奨',       cls:'sell'  },
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
