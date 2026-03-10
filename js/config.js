// ════════════════════════════════════════════════════════════════
// config.js
// 役割: フロントエンド全体で使う定数・設定値を一元管理する。
//       GASの Config.gs と対応させて保守性を確保する。
//       ここを変更すれば全画面に反映される。
// ════════════════════════════════════════════════════════════════

'use strict';

const CONFIG = {
  // ── アプリ基本情報 ──────────────────────────────────────────
  APP_NAME:    'HerculesOS',
  APP_VERSION: '1.0.0',
  PHASE:       1,

  // ── GAS URL（設定画面で上書き・localStorageに永続化） ───────
  GAS_URL:     '',
  GEMINI_KEY:  '',

  // ── ローカルストレージキー ──────────────────────────────────
  LS_KEYS: {
    GAS_URL:    'hcos_gas_url',
    GEMINI_KEY: 'hcos_gemini_key',
    DB:         'hcos_db_v1',
    SETTINGS:   'hcos_settings',
    LAST_SYNC:  'hcos_last_sync',
  },
};

// ── ステージ定義 ────────────────────────────────────────────────
const STAGE_TYPES = {
  EGG:     { code:'EGG',     label:'卵',   order:0, color:'#8bc34a' },
  T0:      { code:'T0',      label:'T0',   order:1, color:'#4caf50' },
  T1:      { code:'T1',      label:'T1',   order:2, color:'#26a69a' },
  T2A:     { code:'T2A',     label:'T2①',  order:3, color:'#2196f3' },
  T2B:     { code:'T2B',     label:'T2②',  order:4, color:'#1565c0' },
  T3:      { code:'T3',      label:'T3',   order:5, color:'#7b1fa2' },
  PREPUPA: { code:'PREPUPA', label:'前蛹', order:6, color:'#e65100' },
  PUPA:    { code:'PUPA',    label:'蛹',   order:7, color:'#bf360c' },
  ADULT:   { code:'ADULT',   label:'成虫', order:8, color:'#c8a84b' },
};

const STAGE_LIST = Object.values(STAGE_TYPES); // 配列版

function stageLabel(code) {
  return STAGE_TYPES[code]?.label || code || '—';
}
function stageColor(code) {
  return STAGE_TYPES[code]?.color || '#888';
}

// ── 個体ステータス ──────────────────────────────────────────────
const IND_STATUS = {
  ALIVE:    { code:'alive',    label:'飼育中', color:'#4caf78' },
  SOLD:     { code:'sold',     label:'販売済', color:'#e09040' },
  DEAD:     { code:'dead',     label:'死亡',   color:'#e05050' },
  RESERVED: { code:'reserved', label:'予約済', color:'#5ba8e8' },
};

function indStatusLabel(code) {
  return Object.values(IND_STATUS).find(s => s.code === code)?.label || code || '—';
}
function indStatusColor(code) {
  return Object.values(IND_STATUS).find(s => s.code === code)?.color || '#888';
}

// ── ロットステータス ────────────────────────────────────────────
const LOT_STATUS = {
  ACTIVE:         { code:'active',         label:'管理中' },
  INDIVIDUALIZED: { code:'individualized', label:'個体化済' },
  DISSOLVED:      { code:'dissolved',      label:'分割済' },
};

// ── 血統ステータス ──────────────────────────────────────────────
const BLOODLINE_STATUS = {
  CONFIRMED:  { code:'confirmed',  label:'確定',  color:'#4caf78' },
  TEMPORARY:  { code:'temporary',  label:'暫定',  color:'#e09040' },
  UNKNOWN:    { code:'unknown',    label:'不明',  color:'#888' },
};

function bloodlineStatusLabel(code) {
  return Object.values(BLOODLINE_STATUS).find(s => s.code === code)?.label || code || '—';
}

// ── 公開区分 ────────────────────────────────────────────────────
// 各エンティティの公開制御方針:
// LINE  : line_name/characteristics/locality/generation → public
//         bloodline_id/status/note_private             → private
//         father_par_id/mother_par_id                  → buyer_only
// PARENT: display_name/sex/size_mm/locality/generation → buyer_only
//         achievements/source/bloodline_id             → buyer_only
//         note                                         → private
// BLOODLINE: bloodline_name/abbreviation/description   → public
//            feature_tags/best_size_mm                 → buyer_only
//            external_source/note                      → private
// INDIVIDUAL: 詳細は個体台帳の公開区分列を参照
const PUBLIC_LEVELS = {
  PUBLIC:  { code:'public',     label:'公開',     icon:'🌐' },
  BUYER:   { code:'buyer_only', label:'購入者限定', icon:'🔑' },
  PRIVATE: { code:'private',    label:'非公開',   icon:'🔒' },
};

// ── マット種別 ──────────────────────────────────────────────────
const MAT_TYPES = [
  { code:'T0',  label:'T0マット' },
  { code:'T1',  label:'T1マット' },
  { code:'T2A', label:'T2マット（モルト入り）' },
  { code:'T2B', label:'T2マット（純）' },
  { code:'T3',  label:'T3マット' },
];

// ── 容器サイズ ──────────────────────────────────────────────────
const CONTAINER_SIZES = [
  '1.8L', '2.7L（2頭）', '2.7L（個別）', '4.8L（個別）', '10L（個別）',
];

// ── マット交換区分 ──────────────────────────────────────────────
const EXCHANGE_TYPES = [
  { code:'FIRST',   label:'初回投入' },
  { code:'FULL',    label:'全交換' },
  { code:'HALF',    label:'半交換' },
  { code:'PARTIAL', label:'追加のみ' },
];

// ── ラベル種別 ──────────────────────────────────────────────────
const LABEL_TYPES = [
  { code:'larva',   label:'幼虫ラベル',       target:'IND' },
  { code:'pupa',    label:'蛹ラベル',         target:'IND' },
  { code:'adult',   label:'成虫ラベル',       target:'IND' },
  { code:'lot',     label:'ロットラベル',     target:'LOT' },
  { code:'pairing', label:'産卵セットラベル', target:'SET' },
];

// ── 日齢ステージ目安（設定で上書き可能） ───────────────────────
const DEFAULT_STAGE_AGE_RULES = [
  { minDays:   0, maxDays:  30, label:'T0',        code:'T0'     },
  { minDays:  30, maxDays:  90, label:'T1',         code:'T1'     },
  { minDays:  90, maxDays: 210, label:'T2中盤',     code:'T2A'    },
  { minDays: 210, maxDays: 300, label:'T3',         code:'T3'     },
  { minDays: 300, maxDays:9999, label:'前蛹・蛹期', code:'PREPUPA'},
];

// ── 選別基準（設定で上書き可能） ───────────────────────────────
const DEFAULT_SELECTION_RULES = {
  male: [
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
    { stage:'T2A', minWeight:30, label:'継続ブリード用', cls:'keep'  },
    { stage:'T2A', minWeight:20, label:'スペース次第',   cls:'check' },
    { stage:'T2A', minWeight: 0, label:'販売推奨',       cls:'sell'  },
    { stage:'T2B', minWeight:30, label:'継続ブリード用', cls:'keep'  },
    { stage:'T2B', minWeight:20, label:'スペース次第',   cls:'check' },
    { stage:'T2B', minWeight: 0, label:'販売推奨',       cls:'sell'  },
  ],
};

// 選別判定カラー
const VERDICT_COLORS = {
  guinness: { bg:'rgba(200,168,75,0.18)', border:'rgba(200,168,75,0.5)', text:'#c8a84b', icon:'🏆' },
  keep:     { bg:'rgba(76,175,120,0.15)', border:'rgba(76,175,120,0.4)', text:'#4caf78', icon:'▶'  },
  check:    { bg:'rgba(224,144,64,0.15)', border:'rgba(224,144,64,0.4)', text:'#e09040', icon:'△'  },
  sell:     { bg:'rgba(224,80,80,0.12)',  border:'rgba(224,80,80,0.35)', text:'#e05050', icon:'✕'  },
};

// ── Drive フォルダ種別 ──────────────────────────────────────────
const DRIVE_FOLDERS = {
  INDIVIDUALS: 'Individuals',
  GROWTH:      'Growth',
  SALE:        'SalePhotos',
  LABELS:      'Labels',
};

// ── バックアップ設定 ─────────────────────────────────────────────
const BACKUP_TYPES = {
  DAILY:   'Daily',
  WEEKLY:  'Weekly',
  MONTHLY: 'Monthly',
  MANUAL:  'Manual',
};

// 各種別の世代保持数（GAS側と一致させること）
const BACKUP_RETAIN = {
  Daily:   7,
  Weekly:  4,
  Monthly: 12,
  Manual:  999,
};

// settings画面 バックアップセクション表示設定
const BACKUP_DISPLAY = {
  type_labels: {
    Daily:   '毎日（Daily）',
    Weekly:  '毎週（Weekly）',
    Monthly: '毎月（Monthly）',
    Manual:  '手動（Manual）',
  },
  type_icons: {
    Daily:   '📅',
    Weekly:  '📆',
    Monthly: '🗓️',
    Manual:  '✋',
  },
  status_icons: {
    success: '✅',
    error:   '❌',
    running: '⏳',
  },
};

// ── ナビタブ定義 ────────────────────────────────────────────────
const NAV_TABS = [
  { id:'dashboard',   label:'ホーム',  icon:'🏠', phase:1 },
  { id:'growth-rec',  label:'記録',    icon:'📷', phase:1 },
  { id:'individuals', label:'個体',    icon:'🐛', phase:1 },
  { id:'manage',      label:'管理',    icon:'📋', phase:1 },
  { id:'settings',    label:'設定',    icon:'⚙️', phase:1 },
];
