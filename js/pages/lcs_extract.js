// ─────────────────────────────────────────────────────────────────
// js/pages/lcs_extract.js
// HerculesOS — LCS (Label Capture & Sync) Phase 1 実装
// ─────────────────────────────────────────────────────────────────
// Build: 20260430a (Phase 1 — 精度検証スコープ)
//
// 役割:
//   現場ラベル(個別/ロット/ユニット 3種類)を Gemini Vision で読み取り、
//   v1.1 スキーマに準拠した構造化 JSON を取得する。Phase 1 では DB 保存は
//   しない (画面表示のみ・精度検証目的)。
//
// 関連ドキュメント:
//   - LCS_extraction_schema_v1.md (出力スキーマ仕様 v1.0)
//   - LCS_schema_v1.1_patch.md (v1.0 → v1.1 変更点)
//   - LCS_phase1_prompt_design.md (プロンプト+responseSchema設計書)
//
// 参考実装:
//   parent_bloodline_extract.js (z4) のパターンを完全踏襲
//   ・API キー保存先: hercules_gemini_key (PBE と共用)
//   ・画像圧縮: 960px / 700KB (リトライ 720px / 400KB)
//   ・温度: 0.5 (リトライ 0.7)
//   ・degenerate 検知 + リトライロジック
// ─────────────────────────────────────────────────────────────────
'use strict';

const LCS_BUILD = '20260430b';
window.__LCS_BUILD = LCS_BUILD;
console.log('[LCS_BUILD]', LCS_BUILD, 'loaded');

// ═══════════════════════════════════════════════════════════════
// 定数
// ═══════════════════════════════════════════════════════════════
const LCS_GEMINI_MODEL = 'gemini-2.5-flash';
const LCS_API_KEY_LS   = 'hercules_gemini_key';   // PBE / yahoo_listing と共用

const LCS_MAX_IMAGE_SIZE_BYTES = 700 * 1024;
const LCS_MAX_IMAGE_DIMENSION  = 960;
const LCS_THUMB_DIMENSION      = 240;
const LCS_RETRY_MAX_DIMENSION  = 720;
const LCS_RETRY_MAX_SIZE_BYTES = 400 * 1024;

// 直近の解析結果を localStorage に保存(リロード後に再表示できるよう)
const LCS_RECENT_LS = 'hercules_lcs_recent_v1';
// 解析履歴(最大 N 件)
const LCS_HISTORY_LS  = 'hercules_lcs_history_v1';
const LCS_HISTORY_MAX = 30;

// ═══════════════════════════════════════════════════════════════
// ユーティリティ
// ═══════════════════════════════════════════════════════════════
function _lcsEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _lcsNowIso() {
  return new Date().toISOString();
}

function _lcsGetApiKey() {
  try {
    if (window.Store && typeof Store.getSetting === 'function') {
      const k = Store.getSetting('gemini_key');
      if (k) return k;
    }
    const k2 = localStorage.getItem('hcos_gemini_key');
    if (k2) return k2;
    return localStorage.getItem(LCS_API_KEY_LS) || '';
  } catch (_) { return ''; }
}

function _lcsSetApiKey(key) {
  try {
    if (window.Store && typeof Store.setSetting === 'function') {
      Store.setSetting('gemini_key', key);
    }
    localStorage.setItem('hcos_gemini_key', key);
    localStorage.setItem(LCS_API_KEY_LS, key);
    if (window.CONFIG) CONFIG.GEMINI_KEY = key;
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════
// 画像処理 (PBE z4 と同等)
// ═══════════════════════════════════════════════════════════════
function _lcsCompressImage(srcDataUrl, maxDim, qualityStart, sizeLimitBytes) {
  const limit = sizeLimitBytes || LCS_MAX_IMAGE_SIZE_BYTES;
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      const w0 = img.naturalWidth, h0 = img.naturalHeight;
      const longest = Math.max(w0, h0);
      const scale = longest > maxDim ? (maxDim / longest) : 1;
      const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      let quality = qualityStart || 0.85;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      let attempts = 0;
      while (dataUrl.length * 0.75 > limit && quality > 0.35 && attempts < 8) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        attempts++;
      }
      resolve({ dataUrl: dataUrl, width: w, height: h, quality: quality });
    };
    img.onerror = function () { reject(new Error('画像の読み込みに失敗しました')); };
    img.src = srcDataUrl;
  });
}

function _lcsFileToDataUrl(file) {
  return new Promise(function (resolve, reject) {
    const fr = new FileReader();
    fr.onload  = function () { resolve(fr.result); };
    fr.onerror = function () { reject(new Error('ファイルの読み込みに失敗しました')); };
    fr.readAsDataURL(file);
  });
}

async function _lcsProcessImageFile(file) {
  const rawDataUrl = await _lcsFileToDataUrl(file);
  const main  = await _lcsCompressImage(rawDataUrl, LCS_MAX_IMAGE_DIMENSION, 0.85, LCS_MAX_IMAGE_SIZE_BYTES);
  const thumb = await _lcsCompressImage(rawDataUrl, LCS_THUMB_DIMENSION,    0.7,  100 * 1024);
  return {
    image_data_url:  main.dataUrl,
    image_thumb_url: thumb.dataUrl,
    raw_data_url:    rawDataUrl,
    width:           main.width,
    height:          main.height,
    file_name:       file.name || 'image.jpg',
  };
}

// ═══════════════════════════════════════════════════════════════
// degenerate 検知 (PBE と同等)
// ═══════════════════════════════════════════════════════════════
function _lcsDetectDegenerate(text) {
  if (!text) return false;
  if (text.match(/(.)\1{40,}/)) return true;
  if (text.match(/(.{2,5})\1{20,}/)) return true;
  if (text.length > 1000) {
    const sliced = text.slice(0, 5000);
    for (let i = 0; i < sliced.length - 30; i += 80) {
      const sample = sliced.slice(i, i + 30);
      if (!sample.trim() || sample.length < 30) continue;
      const escaped = sample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = sliced.match(new RegExp(escaped, 'g'));
      if (matches && matches.length >= 5) return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// プロンプト構築
// ═══════════════════════════════════════════════════════════════
function _lcsBuildVisionPrompt() {
  return `あなたはヘラクレスオオカブト(Dynastes hercules hercules / Guadeloupe産)の繁殖管理ラベルから情報を抽出するアシスタントです。
画像から書かれている文字を一字一句忠実に読み取り、構造化JSONで返してください。

━━━ 🌟 最重要原則 ━━━
1. 画像内に書かれた文字を一字一句忠実に読み取ること
2. 画像にない情報は null (推測・補完しない)
3. 書き間違いと思われる表記も「画像通り」読み取り、勝手に修正しない
   悪い例: 「125/11/20」を「25/11/20」に直す
   良い例: raw="125/11/20" のまま、parsed=null, requires_manual_input=true
4. 独自表記(「8/19~」「10/下」等)は raw に保持し、is_range=true を立てる
5. JSONの前後に解説文を書かない (純粋なJSONのみ)

━━━ ラベル種別の判別 ━━━
本システムは3種類のラベルを扱います。最初に label_type を判別してください:

【INDIVIDUAL】個別飼育ラベル (1個体1ラベル)
- 印刷ヘッダ「D.h.hercules【Guadeloupe】」がある
- 「累代 / 孵化日 / 蛹化日 / 羽化日 / 頭幅」の表ヘッダ
- 体重記録テーブル(3行 × 3スロット = 最大9測定枠)
- 右側縦の「前蛹 / 蛹全長 / 胸角 / 蛹 / 成虫 / 突前 / サイズ」枠
- Memo欄にラインコード(A1, B2 等)が手書き

【LOT】ロットラベル (採卵→孵化までの卵・初期幼虫管理)
- 黄色マスキングテープに貼られた小型ラベル
- 「採卵 / 移動 / 孵化」の3行レイアウト
- 「☐T0 ☐T1」または「☐T0 ☐T1 ☐T2 ☐T3」のチェックボックス
- 「N匹」の頭数表記
- ライン名(A1, B2, C7 等)が左上の四角枠内

【UNIT】ユニットラベル (T1〜T2 の 1〜2匹/容器 幼虫管理)
- 黄色マスキングテープに貼られた小型ラベル
- 「グラム / 孵化 / 大・中・小」レイアウト
- 「☐T1 ☐T2」のチェックボックス(T0 はない)
- 「N匹」の頭数(主に1匹または2匹)
- ライン名が左上の四角枠内
- マスキングテープ上部や周囲に手書きメモ(例:「♂47 ♀44」)がある場合あり ★ 重要

━━━ ライン台帳と一致させるべき line_code_raw ━━━
ラベルの「Memo」欄またはライン名枠に書かれた英数字コード。
有効な値: A1〜A10, B1〜B8, C1〜C10, D1 のいずれか(計29種)
それ以外の文字列に見えても、近い値を推測せず raw のまま返してください。

━━━ 日付フィールドの記入パターン ━━━
孵化日・蛹化日・羽化日・採卵日・移動日には以下の表記パターンがあります。

| 表記例 | 解釈 | parsed | is_range |
|---|---|---|---|
| 25/11/20 | 2025年11月20日 | "2025-11-20" | false |
| 11/20 | 11月20日(年欠落) | "11-20" | false |
| 25/10 | 2025年10月 | "2025-10" | false |
| 10/下 | 10月下旬 | null (raw保持) | true |
| 8/19~ | 8月中旬〜下旬 (独自表記) | null | true |
| 1/8-15 | 1月8日〜15日の期間 | null | true |
| /  または 空欄 | 未記入 | null | false |
| 125/11/20 (3桁年) | 書き間違い | null | false → requires_manual_input=true |

raw には画像通りの文字列、parsed には ISO 風文字列(解釈できる場合のみ・YYYY-MM-DD または YYYY-MM または MM-DD)、できなければ null。
明らかに不正な値(3桁年・存在しない日付等)は parsed=null かつ requires_manual_input=true。

━━━ マット略号 (weight_records[].code_raw / unit_data 系) ━━━
個別ラベルの体重記録欄に書かれる略号(順序不問):
- M     = マット交換 (普通の交換)
- MM    = T2モルトパウダー入りマット交換
- T0/T1/T2/T3 = マット種別
- MT2   = M(交換) + T2 (例)
- MMT2  = MM(モルト入り) + T2 (例)
- T1M   = T1 + M (前後逆順もあり)
- ⊙B または ○B または (追) = マット完全交換せず上から追加

これらを **加工せずそのまま** code_raw に文字列として保持してください。
良い例: "MT2" / "MMT2" / "T1M" / "M" / "MT2(追)" / "MT2⊙B"
解釈は別の処理で行います。

━━━ ユニットラベルのマスキングテープメモ ━━━
ユニットラベル本体の上部や周囲のマスキングテープ領域に、最新の体重・性別が手書きされている場合があります。

例:
- 「♂47 ♀44」 → slot_no:1=47g♂, slot_no:2=44g♀
- 「♂50, 51 (3/17)」 → slot_no:1=50g♂, slot_no:2=51g♂, 日付3/17 (♂は両方の数値にかかる)
- 「♀54」 → slot_no:1=54g♀ (1匹ユニット)

これは tape_memo.raw_text に原文を入れ、tape_memo.members_latest に構造化:
- weight_g: 数字部分
- sex: ♂ または ♀ (記号があれば設定。記号がない数字のみは null)
- memo_date_raw: 日付があれば

━━━ サイズ区分(size_category)━━━
ユニットラベルや個別ラベルの右下に「大・中・小」の文字があり、そのうち1つに丸印が付いている場合があります。
- 丸印のあるものを "大" / "中" / "小" として返す
- 印が無ければ null

━━━ 信頼度フラグ ━━━
extraction_confidence の判定基準:
- "high"   : すべてのフィールドが明瞭に読み取れた
- "medium" : 一部のフィールドに読み取りの不確かさがある
- "low"    : 多数のフィールドが不明瞭(写真の質が悪い・結露・ピンボケ等)

ambiguous_fields にはJSONパスを文字列で列挙してください。
例: ["hatch_date", "individual_data.weight_records[2].code_raw"]

━━━ 出力形式 ━━━
純粋なJSONのみを返してください(マークダウン装飾なし)。
記載のない項目は null(空文字列ではなく)。
ラベル種別に該当しないオブジェクトは丸ごと null:
- INDIVIDUAL の場合: lot_data=null, unit_data=null
- LOT の場合: unit_data=null, individual_data=null
- UNIT の場合: lot_data=null, individual_data=null

━━━ 出力例 ━━━

(個別ラベル例: A5 ♂ 追マークあり)
{
  "label_type": "INDIVIDUAL", "label_type_confidence": "high",
  "line_code_raw": "A5", "memo_full_raw": "A5",
  "egg_collect_date": {"raw":null,"parsed":null,"is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "transfer_date":    {"raw":null,"parsed":null,"is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "hatch_date":       {"raw":"25/10/中","parsed":"2025-10","is_range":true,"requires_manual_input":false,"manual_input_reason":null},
  "pupa_date":        {"raw":null,"parsed":null,"is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "eclosion_date":    {"raw":null,"parsed":null,"is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "mat_checks": {"T0":false,"T1":true,"T2":true,"T3":false,"Tx":false},
  "t1_check_date_raw": null, "t2_check_date_raw": null, "size_category": null,
  "lot_data": null, "unit_data": null,
  "individual_data": {
    "no":null, "sex":"♂", "generation":null,
    "parent_male_raw":null, "parent_female_raw":null,
    "weight_records":[
      {"row":1,"col":1,"date_raw":"12/26","weight_g":12,"code_raw":"T1M"},
      {"row":2,"col":1,"date_raw":"2/24","weight_g":48,"code_raw":"T2MM"},
      {"row":3,"col":1,"date_raw":"4/20","weight_g":84,"code_raw":"MT2(追)"}
    ],
    "pre_pupa_weight_g":null,"pupa_length_mm":null,"thorax_horn_mm":null,
    "pupa_size_mm":null,"adult_size_mm":null,"horn_protrusion_mm":null,
    "size_mm":null,"head_width_mm":null
  },
  "extraction_confidence": "high", "ambiguous_fields": [], "ai_notes": null
}

(ロットラベル例: B2 5匹)
{
  "label_type": "LOT", "label_type_confidence": "high",
  "line_code_raw": "B2", "memo_full_raw": "B2",
  "egg_collect_date": {"raw":"2/8-11","parsed":null,"is_range":true,"requires_manual_input":false,"manual_input_reason":null},
  "transfer_date":    {"raw":"2/16","parsed":"02-16","is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "hatch_date":       {"raw":"3/20","parsed":"03-20","is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "pupa_date":        {"raw":null,"parsed":null,"is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "eclosion_date":    {"raw":null,"parsed":null,"is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "mat_checks": {"T0":true,"T1":false,"T2":false,"T3":false,"Tx":false},
  "t1_check_date_raw": null, "t2_check_date_raw": null, "size_category": null,
  "lot_data": {"head_count":5,"head_count_raw":"5匹"},
  "unit_data": null, "individual_data": null,
  "extraction_confidence": "high", "ambiguous_fields": [], "ai_notes": null
}

(ユニットラベル例: B4 2匹 マステ♂♀)
{
  "label_type": "UNIT", "label_type_confidence": "high",
  "line_code_raw": "B4", "memo_full_raw": "B4",
  "egg_collect_date": {"raw":null,"parsed":null,"is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "transfer_date":    {"raw":null,"parsed":null,"is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "hatch_date":       {"raw":"11/10","parsed":"11-10","is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "pupa_date":        {"raw":null,"parsed":null,"is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "eclosion_date":    {"raw":null,"parsed":null,"is_range":false,"requires_manual_input":false,"manual_input_reason":null},
  "mat_checks": {"T0":false,"T1":true,"T2":true,"T3":false,"Tx":true},
  "t1_check_date_raw": null, "t2_check_date_raw": null, "size_category": "中",
  "lot_data": null,
  "unit_data": {
    "head_count": 2, "head_count_raw": "2匹",
    "initial_weights": [
      {"slot_no":1,"weight_g":9,"date_raw":null,"code_raw":null},
      {"slot_no":2,"weight_g":10,"date_raw":null,"code_raw":null}
    ],
    "intermediate_weights": [],
    "m_exchange_dates_raw": ["1/14","3/17"],
    "tape_memo": {
      "raw_text": "♂47 ♀44",
      "members_latest": [
        {"slot_no":1,"weight_g":47,"sex":"♂","memo_date_raw":null},
        {"slot_no":2,"weight_g":44,"sex":"♀","memo_date_raw":null}
      ]
    }
  },
  "individual_data": null,
  "extraction_confidence": "high", "ambiguous_fields": [], "ai_notes": null
}`;
}

// ═══════════════════════════════════════════════════════════════
// responseSchema 構築
// ═══════════════════════════════════════════════════════════════
function _lcsBuildResponseSchema() {
  const dateFieldSchema = {
    type: 'OBJECT', nullable: true,
    properties: {
      raw:                   { type: 'STRING',  nullable: true },
      parsed:                { type: 'STRING',  nullable: true },
      is_range:              { type: 'BOOLEAN' },
      requires_manual_input: { type: 'BOOLEAN' },
      manual_input_reason:   { type: 'STRING',  nullable: true },
    },
  };

  return {
    type: 'OBJECT',
    properties: {
      label_type:            { type: 'STRING', enum: ['INDIVIDUAL','LOT','UNIT'] },
      label_type_confidence: { type: 'STRING', enum: ['high','medium','low'] },
      line_code_raw:         { type: 'STRING', nullable: true },
      memo_full_raw:         { type: 'STRING', nullable: true },
      egg_collect_date:      dateFieldSchema,
      transfer_date:         dateFieldSchema,
      hatch_date:            dateFieldSchema,
      pupa_date:             dateFieldSchema,
      eclosion_date:         dateFieldSchema,
      mat_checks: {
        type: 'OBJECT',
        properties: {
          T0: { type: 'BOOLEAN' }, T1: { type: 'BOOLEAN' },
          T2: { type: 'BOOLEAN' }, T3: { type: 'BOOLEAN' },
          Tx: { type: 'BOOLEAN' },
        },
      },
      t1_check_date_raw: { type: 'STRING', nullable: true },
      t2_check_date_raw: { type: 'STRING', nullable: true },
      size_category:     { type: 'STRING', enum: ['大','中','小'], nullable: true },

      // ロット専用
      lot_data: {
        type: 'OBJECT', nullable: true,
        properties: {
          head_count:     { type: 'NUMBER', nullable: true },
          head_count_raw: { type: 'STRING', nullable: true },
        },
      },

      // ユニット専用
      unit_data: {
        type: 'OBJECT', nullable: true,
        properties: {
          head_count:     { type: 'NUMBER', nullable: true },
          head_count_raw: { type: 'STRING', nullable: true },
          initial_weights: {
            type: 'ARRAY', nullable: true,
            items: {
              type: 'OBJECT',
              properties: {
                slot_no:  { type: 'NUMBER' },
                weight_g: { type: 'NUMBER', nullable: true },
                date_raw: { type: 'STRING', nullable: true },
                code_raw: { type: 'STRING', nullable: true },
              },
            },
          },
          intermediate_weights: {
            type: 'ARRAY', nullable: true,
            items: {
              type: 'OBJECT',
              properties: {
                weight_g_raw: { type: 'STRING' },
                date_raw:     { type: 'STRING', nullable: true },
                is_range:     { type: 'BOOLEAN' },
              },
            },
          },
          m_exchange_dates_raw: {
            type: 'ARRAY', nullable: true,
            items: { type: 'STRING' },
          },
          tape_memo: {
            type: 'OBJECT', nullable: true,
            properties: {
              raw_text: { type: 'STRING' },
              members_latest: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    slot_no:        { type: 'NUMBER' },
                    weight_g:       { type: 'NUMBER', nullable: true },
                    sex:            { type: 'STRING', enum: ['♂','♀'], nullable: true },
                    memo_date_raw:  { type: 'STRING', nullable: true },
                  },
                },
              },
            },
          },
        },
      },

      // 個別専用
      individual_data: {
        type: 'OBJECT', nullable: true,
        properties: {
          no:                 { type: 'STRING', nullable: true },
          sex:                { type: 'STRING', enum: ['♂','♀'], nullable: true },
          generation:         { type: 'STRING', nullable: true },
          parent_male_raw:    { type: 'STRING', nullable: true },
          parent_female_raw:  { type: 'STRING', nullable: true },
          weight_records: {
            type: 'ARRAY', nullable: true,
            items: {
              type: 'OBJECT',
              properties: {
                row:      { type: 'NUMBER' },
                col:      { type: 'NUMBER' },
                date_raw: { type: 'STRING', nullable: true },
                weight_g: { type: 'NUMBER', nullable: true },
                code_raw: { type: 'STRING', nullable: true },
              },
              required: ['row','col'],
            },
          },
          pre_pupa_weight_g:  { type: 'NUMBER', nullable: true },
          pupa_length_mm:     { type: 'NUMBER', nullable: true },
          thorax_horn_mm:     { type: 'NUMBER', nullable: true },
          pupa_size_mm:       { type: 'NUMBER', nullable: true },
          adult_size_mm:      { type: 'NUMBER', nullable: true },
          horn_protrusion_mm: { type: 'NUMBER', nullable: true },
          size_mm:            { type: 'NUMBER', nullable: true },
          head_width_mm:      { type: 'NUMBER', nullable: true },
        },
      },

      extraction_confidence: { type: 'STRING', enum: ['high','medium','low'] },
      ambiguous_fields:      { type: 'ARRAY', items: { type: 'STRING' } },
      ai_notes:              { type: 'STRING', nullable: true },
    },
    required: ['label_type', 'extraction_confidence'],
  };
}

// ═══════════════════════════════════════════════════════════════
// Gemini Vision API 呼び出し (1枚処理)
// ═══════════════════════════════════════════════════════════════
async function _lcsCallVision(imageDataUrl, apiKey, opts) {
  opts = opts || {};
  const isRetry = !!opts.isRetry;
  const m = String(imageDataUrl).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
  if (!m) throw new Error('画像データの形式が不正です');
  const mimeType = m[1];
  const base64   = m[2];

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            + LCS_GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);

  const body = {
    contents: [{
      parts: [
        { text: _lcsBuildVisionPrompt() },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      temperature:      isRetry ? 0.7 : 0.5,
      maxOutputTokens:  8192,
      topP:             isRetry ? 0.7 : 0.85,
      responseMimeType: 'application/json',
      responseSchema:   _lcsBuildResponseSchema(),
    },
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(function () { return {}; });
    throw new Error((err && err.error && err.error.message) || ('HTTP ' + res.status));
  }
  const data = await res.json();
  const cand = data && data.candidates && data.candidates[0];
  const finishReason = cand && cand.finishReason;
  const text = (cand && cand.content && cand.content.parts &&
                cand.content.parts[0] && cand.content.parts[0].text) || '';
  if (!text) {
    if (finishReason === 'SAFETY') {
      throw new Error('Geminiのセーフティフィルタにブロックされました');
    }
    throw new Error('Gemini レスポンスが空でした (finishReason=' + (finishReason || 'unknown') + ')');
  }
  if (_lcsDetectDegenerate(text)) {
    console.warn('[LCS] Degenerate output detected. Head:', text.slice(0, 200));
    throw new Error('Gemini が異常な繰り返し出力を返しました。再試行してください。');
  }
  let jsonStr = text.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) jsonStr = fence[1].trim();
  let parsed;
  try { parsed = JSON.parse(jsonStr); }
  catch (_) {
    const m2 = jsonStr.match(/\{[\s\S]*\}/);
    if (m2) {
      try { parsed = JSON.parse(m2[0]); } catch (_e) {}
    }
  }
  if (!parsed) {
    console.warn('[LCS] JSON parse failed. Raw response head:', text.slice(0, 500));
    throw new Error('抽出結果のJSONパースに失敗しました。再試行してください。');
  }
  return parsed;
}

// リトライ付きのラッパー (1度失敗したら 720px / 0.7温度 で再試行)
async function _lcsCallVisionWithRetry(processedImage, apiKey) {
  try {
    return await _lcsCallVision(processedImage.image_data_url, apiKey, { isRetry: false });
  } catch (e1) {
    console.warn('[LCS] First attempt failed, retrying...', e1.message);
    // 圧縮し直し
    let retryDataUrl = processedImage.image_data_url;
    if (processedImage.raw_data_url) {
      try {
        const recompressed = await _lcsCompressImage(
          processedImage.raw_data_url,
          LCS_RETRY_MAX_DIMENSION,
          0.7,
          LCS_RETRY_MAX_SIZE_BYTES
        );
        retryDataUrl = recompressed.dataUrl;
      } catch (_) {}
    }
    return await _lcsCallVision(retryDataUrl, apiKey, { isRetry: true });
  }
}

// ═══════════════════════════════════════════════════════════════
// 後処理 (JS 側で AI 出力を補強)
// ═══════════════════════════════════════════════════════════════

// マット略号の正規化: code_raw → {mat_type, has_malt, exchange_type}
function _lcsParseMatCode(codeRaw) {
  const result = { mat_type: null, has_malt: false, exchange_type: 'exchange' };
  if (!codeRaw) return result;
  const upper = String(codeRaw).toUpperCase().replace(/\s+/g, '');

  // 「追」「(追)」「⊙B」「○B」を検出
  if (/[⊙○]B|\(追\)|\(タス\)/i.test(codeRaw)) {
    result.exchange_type = 'add';
  }
  // T0〜T3 を抽出
  const tMatch = upper.match(/T([0-3])/);
  if (tMatch) result.mat_type = 'T' + tMatch[1];
  // MM の存在 → モルト入り
  if (/MM/.test(upper)) result.has_malt = true;

  return result;
}

// ライン台帳マッチング
function _lcsResolveLine(lineCodeRaw) {
  const code = String(lineCodeRaw || '').trim().toUpperCase();
  if (!code) return null;
  const lines = (window.Store && Store.getDB) ? (Store.getDB('lines') || []) : [];
  return lines.find(function (l) { return l && l.line_code === code; }) || null;
}

// 不正日付フラグの自動設定
function _lcsFlagInvalidDate(dateField) {
  if (!dateField || !dateField.raw) return;
  if (dateField.parsed) return;          // パース成功
  if (dateField.is_range) return;        // 範囲表記は許容
  // 範囲でもないのに parsed=null → 異常データ扱い
  dateField.requires_manual_input = true;
  if (!dateField.manual_input_reason) {
    dateField.manual_input_reason = '日付として解釈できませんでした';
  }
}

// AI 出力を JS 側で後処理して enrichment を追加
function _lcsPostProcess(result) {
  if (!result || typeof result !== 'object') return result;

  // 全日付フィールドのチェック
  ['egg_collect_date','transfer_date','hatch_date','pupa_date','eclosion_date'].forEach(function (k) {
    _lcsFlagInvalidDate(result[k]);
  });

  // 個別ラベル: weight_records[].code_raw を解析
  if (result.individual_data && Array.isArray(result.individual_data.weight_records)) {
    result.individual_data.weight_records.forEach(function (w) {
      const parsed = _lcsParseMatCode(w.code_raw);
      w.mat_type      = parsed.mat_type;
      w.has_malt      = parsed.has_malt;
      w.exchange_type = parsed.exchange_type;
    });
  }
  // ユニットラベル: initial_weights[].code_raw も同様
  if (result.unit_data && Array.isArray(result.unit_data.initial_weights)) {
    result.unit_data.initial_weights.forEach(function (w) {
      const parsed = _lcsParseMatCode(w.code_raw);
      w.mat_type      = parsed.mat_type;
      w.has_malt      = parsed.has_malt;
      w.exchange_type = parsed.exchange_type;
    });
  }

  // ライン照合
  const matched = _lcsResolveLine(result.line_code_raw);
  result._line_match = matched ? {
    line_id:          matched.line_id,
    display_id:       matched.display_id,
    line_code:        matched.line_code,
    father_par_id:    matched.father_par_id,
    mother_par_id:    matched.mother_par_id,
  } : null;

  return result;
}

// ═══════════════════════════════════════════════════════════════
// 永続化 (直近結果 + 履歴)
// ═══════════════════════════════════════════════════════════════
function _lcsSaveRecent(payload) {
  try { localStorage.setItem(LCS_RECENT_LS, JSON.stringify(payload)); } catch (_) {}
}
function _lcsLoadRecent() {
  try {
    const raw = localStorage.getItem(LCS_RECENT_LS);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function _lcsClearRecent() {
  try { localStorage.removeItem(LCS_RECENT_LS); } catch (_) {}
}

function _lcsLoadHistory() {
  try {
    const raw = localStorage.getItem(LCS_HISTORY_LS);
    return raw ? (JSON.parse(raw) || []) : [];
  } catch (_) { return []; }
}
function _lcsSaveHistory(arr) {
  try {
    const trimmed = (arr || []).slice(0, LCS_HISTORY_MAX);
    localStorage.setItem(LCS_HISTORY_LS, JSON.stringify(trimmed));
  } catch (_) {}
}
function _lcsAddHistory(record) {
  const arr = _lcsLoadHistory();
  arr.unshift(record);
  _lcsSaveHistory(arr);
}
function _lcsClearHistory() {
  try { localStorage.removeItem(LCS_HISTORY_LS); } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════
// 結果レンダリング
// ═══════════════════════════════════════════════════════════════
function _lcsConfidenceBadge(level) {
  const map = {
    high:   { color: '#0c5d2e', bg: '#d6f4dc', label: '✓ 高' },
    medium: { color: '#7d4d00', bg: '#fff2c8', label: '△ 中' },
    low:    { color: '#7a1c1c', bg: '#ffd6d6', label: '⚠ 低' },
  };
  const c = map[level] || map.medium;
  return '<span style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:.85em;font-weight:bold;color:' + c.color + ';background:' + c.bg + '">' + c.label + '</span>';
}

function _lcsDateCell(label, df) {
  if (!df || !df.raw) {
    return '<tr><td style="padding:4px 8px;color:#888">' + _lcsEsc(label) + '</td><td style="padding:4px 8px;color:#888">—</td></tr>';
  }
  let display = '<code style="background:#f0f0f0;padding:2px 5px;border-radius:3px">' + _lcsEsc(df.raw) + '</code>';
  if (df.parsed)  display += ' <span style="color:#666">→ ' + _lcsEsc(df.parsed) + '</span>';
  if (df.is_range) display += ' <span style="color:#7a5b00;font-size:.85em">(期間表記)</span>';
  if (df.requires_manual_input) {
    display = '<span style="background:#ffd6d6;padding:4px 8px;border-radius:4px">⚠️ 要手入力: ' + display
            + (df.manual_input_reason ? ' <span style="color:#7a1c1c;font-size:.85em">' + _lcsEsc(df.manual_input_reason) + '</span>' : '')
            + '</span>';
  }
  return '<tr><td style="padding:4px 8px;color:#555">' + _lcsEsc(label) + '</td><td style="padding:4px 8px">' + display + '</td></tr>';
}

function _lcsLineMatchHtml(result) {
  if (!result.line_code_raw) return '<span style="color:#888">未読取</span>';
  const code = _lcsEsc(result.line_code_raw);
  if (result._line_match) {
    return '<code style="background:#d6f4dc;padding:2px 6px;border-radius:3px">' + code
         + '</code> → <strong>' + _lcsEsc(result._line_match.display_id) + '</strong> ✓';
  }
  return '<code style="background:#ffd6d6;padding:2px 6px;border-radius:3px">' + code
       + '</code> ⚠️ <span style="color:#7a1c1c">ライン台帳に見つかりません</span>';
}

function _lcsRenderIndividual(ind) {
  if (!ind) return '';
  let h = '<h4 style="margin:14px 0 6px;color:#0d5d3e">🪲 個別データ</h4>';
  h += '<table style="width:100%;border-collapse:collapse;background:#fff">';
  h += '<tr><td style="padding:4px 8px;color:#555;width:120px">性別</td><td style="padding:4px 8px">' + (ind.sex || '<span style="color:#888">—</span>') + '</td></tr>';
  h += '<tr><td style="padding:4px 8px;color:#555">累代</td><td style="padding:4px 8px">' + _lcsEsc(ind.generation || '—') + '</td></tr>';
  if (ind.no) h += '<tr><td style="padding:4px 8px;color:#555">No.</td><td style="padding:4px 8px">' + _lcsEsc(ind.no) + '</td></tr>';
  h += '</table>';
  if (ind.weight_records && ind.weight_records.length) {
    h += '<h4 style="margin:14px 0 6px;color:#0d5d3e">⚖️ 体重記録 (' + ind.weight_records.length + '件)</h4>';
    h += '<table style="width:100%;border-collapse:collapse;background:#fff">';
    h += '<tr style="background:#f4f4f4"><th style="padding:6px 8px;text-align:left;font-size:.9em">位置</th><th style="padding:6px 8px;text-align:left;font-size:.9em">日付</th><th style="padding:6px 8px;text-align:left;font-size:.9em">体重</th><th style="padding:6px 8px;text-align:left;font-size:.9em">コード</th><th style="padding:6px 8px;text-align:left;font-size:.9em">解釈</th></tr>';
    ind.weight_records.forEach(function (w) {
      const parts = [];
      if (w.mat_type) parts.push(w.mat_type);
      if (w.has_malt) parts.push('モルト入');
      if (w.exchange_type === 'add') parts.push('<span style="color:#a05a00">⊙ 追加</span>');
      h += '<tr style="border-top:1px solid #eee">'
         + '<td style="padding:5px 8px;color:#888">r' + w.row + 'c' + w.col + '</td>'
         + '<td style="padding:5px 8px"><code>' + _lcsEsc(w.date_raw || '—') + '</code></td>'
         + '<td style="padding:5px 8px;font-weight:bold">' + (w.weight_g != null ? w.weight_g + 'g' : '—') + '</td>'
         + '<td style="padding:5px 8px"><code style="background:#f0f0f0;padding:1px 4px">' + _lcsEsc(w.code_raw || '—') + '</code></td>'
         + '<td style="padding:5px 8px;font-size:.9em">' + (parts.join(' / ') || '<span style="color:#888">—</span>') + '</td>'
         + '</tr>';
    });
    h += '</table>';
  }
  // 形態測定
  const morph = [];
  if (ind.pre_pupa_weight_g != null)  morph.push(['前蛹',     ind.pre_pupa_weight_g + 'g']);
  if (ind.pupa_length_mm    != null)  morph.push(['蛹全長',    ind.pupa_length_mm + 'mm']);
  if (ind.thorax_horn_mm    != null)  morph.push(['胸角',     ind.thorax_horn_mm + 'mm']);
  if (ind.head_width_mm     != null)  morph.push(['頭幅',     ind.head_width_mm + 'mm']);
  if (ind.adult_size_mm     != null)  morph.push(['成虫サイズ', ind.adult_size_mm + 'mm']);
  if (ind.horn_protrusion_mm!= null)  morph.push(['突前',     ind.horn_protrusion_mm + 'mm']);
  if (morph.length) {
    h += '<h4 style="margin:14px 0 6px;color:#0d5d3e">📏 形態測定</h4>';
    h += '<table style="width:100%;border-collapse:collapse;background:#fff">';
    morph.forEach(function (p) {
      h += '<tr><td style="padding:4px 8px;color:#555;width:120px">' + p[0] + '</td><td style="padding:4px 8px;font-weight:bold">' + p[1] + '</td></tr>';
    });
    h += '</table>';
  }
  return h;
}

function _lcsRenderLot(lot) {
  if (!lot) return '';
  let h = '<h4 style="margin:14px 0 6px;color:#7d4d00">🥚 ロットデータ</h4>';
  h += '<table style="width:100%;border-collapse:collapse;background:#fff">';
  h += '<tr><td style="padding:4px 8px;color:#555;width:120px">頭数</td><td style="padding:4px 8px;font-weight:bold;font-size:1.1em">' + (lot.head_count != null ? lot.head_count + '匹' : '—') + '</td></tr>';
  h += '</table>';
  return h;
}

function _lcsRenderUnit(unit) {
  if (!unit) return '';
  let h = '<h4 style="margin:14px 0 6px;color:#0c5070">🪲 ユニットデータ</h4>';
  h += '<table style="width:100%;border-collapse:collapse;background:#fff">';
  h += '<tr><td style="padding:4px 8px;color:#555;width:120px">頭数</td><td style="padding:4px 8px;font-weight:bold">' + (unit.head_count != null ? unit.head_count + '匹' : '—') + '</td></tr>';
  h += '</table>';
  // 初期体重
  if (unit.initial_weights && unit.initial_weights.length) {
    h += '<h5 style="margin:10px 0 4px">📌 初期体重 (ラベル本体)</h5>';
    h += '<table style="width:100%;border-collapse:collapse;background:#fff;font-size:.9em">';
    unit.initial_weights.forEach(function (w) {
      h += '<tr><td style="padding:4px 8px;color:#555;width:80px">slot ' + w.slot_no + '</td>'
         + '<td style="padding:4px 8px"><code>' + _lcsEsc(w.date_raw || '—') + '</code></td>'
         + '<td style="padding:4px 8px;font-weight:bold">' + (w.weight_g != null ? w.weight_g + 'g' : '—') + '</td>'
         + '<td style="padding:4px 8px"><code style="background:#f0f0f0;padding:1px 4px">' + _lcsEsc(w.code_raw || '—') + '</code></td></tr>';
    });
    h += '</table>';
  }
  // 中段体重
  if (unit.intermediate_weights && unit.intermediate_weights.length) {
    h += '<h5 style="margin:10px 0 4px">📌 中段体重</h5><ul style="margin:4px 0;padding-left:24px">';
    unit.intermediate_weights.forEach(function (w) {
      h += '<li>' + _lcsEsc(w.date_raw || '?') + ': <code>' + _lcsEsc(w.weight_g_raw) + '</code>' + (w.is_range ? ' <span style="color:#7a5b00">(範囲)</span>' : '') + '</li>';
    });
    h += '</ul>';
  }
  // M日付
  if (unit.m_exchange_dates_raw && unit.m_exchange_dates_raw.length) {
    h += '<h5 style="margin:10px 0 4px">📌 M日付スロット</h5><div style="font-size:.9em">'
       + unit.m_exchange_dates_raw.map(function (d) { return '<code style="background:#f0f0f0;padding:2px 5px;margin-right:4px">' + _lcsEsc(d) + '</code>'; }).join('')
       + '</div>';
  }
  // マステ上書きメモ ★ 重要
  if (unit.tape_memo) {
    h += '<h5 style="margin:14px 0 6px;color:#a05a00">🩹 マステ上書きメモ (最新状態)</h5>';
    h += '<div style="background:#fff8e1;border-left:4px solid #ffb300;padding:8px 12px;border-radius:4px">';
    h += '<div style="font-size:.85em;color:#666;margin-bottom:4px">原文: <code>' + _lcsEsc(unit.tape_memo.raw_text || '') + '</code></div>';
    if (unit.tape_memo.members_latest && unit.tape_memo.members_latest.length) {
      h += '<table style="width:100%;border-collapse:collapse;background:transparent">';
      unit.tape_memo.members_latest.forEach(function (m) {
        h += '<tr><td style="padding:3px 6px;width:80px">slot ' + m.slot_no + '</td>'
           + '<td style="padding:3px 6px;font-weight:bold;font-size:1.1em">' + (m.weight_g != null ? m.weight_g + 'g' : '—') + '</td>'
           + '<td style="padding:3px 6px;font-size:1.1em">' + (m.sex || '<span style="color:#888">—</span>') + '</td>'
           + '<td style="padding:3px 6px;font-size:.85em;color:#666">' + (m.memo_date_raw ? _lcsEsc(m.memo_date_raw) : '') + '</td></tr>';
      });
      h += '</table>';
    }
    h += '</div>';
  }
  return h;
}

function _lcsRenderResult(payload) {
  const area = document.getElementById('lcs-result');
  if (!area) return;
  if (!payload || !payload.result) {
    area.innerHTML = '';
    return;
  }
  const r = payload.result;
  let h = '';
  // ヘッダ
  h += '<div style="background:#f8f9fa;border:1px solid #dde;border-radius:8px;padding:14px;margin-top:12px">';
  h += '<div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">';
  if (payload.thumb) {
    h += '<img src="' + payload.thumb + '" style="width:120px;height:auto;border-radius:6px;border:1px solid #ccc">';
  }
  h += '<div style="flex:1;min-width:200px">';
  h += '<div style="font-size:1.1em;font-weight:bold">' + _lcsEsc(payload.file_name || '(image)') + '</div>';
  h += '<div style="margin-top:6px">ラベル種別: <strong>' + _lcsEsc(r.label_type || '?') + '</strong> ' + _lcsConfidenceBadge(r.label_type_confidence) + '</div>';
  h += '<div style="margin-top:6px">読み取り信頼度: ' + _lcsConfidenceBadge(r.extraction_confidence) + '</div>';
  if (r.ai_notes) {
    h += '<div style="margin-top:8px;font-size:.9em;color:#7a5b00;background:#fff8e1;padding:6px 10px;border-radius:4px">📝 ' + _lcsEsc(r.ai_notes) + '</div>';
  }
  h += '</div></div></div>';

  // 共通フィールド
  h += '<div style="margin-top:12px;background:#fff;border:1px solid #dde;border-radius:8px;padding:14px">';
  h += '<h4 style="margin:0 0 8px;color:#333">📋 共通フィールド</h4>';
  h += '<table style="width:100%;border-collapse:collapse">';
  h += '<tr><td style="padding:4px 8px;color:#555;width:120px">ライン</td><td style="padding:4px 8px">' + _lcsLineMatchHtml(r) + '</td></tr>';
  if (r.memo_full_raw && r.memo_full_raw !== r.line_code_raw) {
    h += '<tr><td style="padding:4px 8px;color:#555">Memo全文</td><td style="padding:4px 8px"><code style="background:#f0f0f0;padding:2px 5px">' + _lcsEsc(r.memo_full_raw) + '</code></td></tr>';
  }
  h += _lcsDateCell('採卵日', r.egg_collect_date);
  h += _lcsDateCell('移動日', r.transfer_date);
  h += _lcsDateCell('孵化日', r.hatch_date);
  h += _lcsDateCell('蛹化日', r.pupa_date);
  h += _lcsDateCell('羽化日', r.eclosion_date);
  if (r.size_category) {
    h += '<tr><td style="padding:4px 8px;color:#555">サイズ</td><td style="padding:4px 8px;font-weight:bold">' + _lcsEsc(r.size_category) + '</td></tr>';
  }
  // mat_checks
  if (r.mat_checks) {
    const checks = ['T0','T1','T2','T3','Tx'].filter(function (k) { return r.mat_checks[k]; });
    h += '<tr><td style="padding:4px 8px;color:#555">マット履歴☑</td><td style="padding:4px 8px">' + (checks.length ? checks.map(function (c) { return '<span style="display:inline-block;background:#d6f4dc;padding:2px 8px;margin-right:4px;border-radius:3px">' + c + '</span>'; }).join('') : '<span style="color:#888">なし</span>') + '</td></tr>';
  }
  if (r.t1_check_date_raw) h += '<tr><td style="padding:4px 8px;color:#555">T1☑日付</td><td style="padding:4px 8px"><code>' + _lcsEsc(r.t1_check_date_raw) + '</code></td></tr>';
  if (r.t2_check_date_raw) h += '<tr><td style="padding:4px 8px;color:#555">T2☑日付</td><td style="padding:4px 8px"><code>' + _lcsEsc(r.t2_check_date_raw) + '</code></td></tr>';
  h += '</table>';
  h += '</div>';

  // 種別別データ
  h += '<div style="margin-top:12px;background:#fff;border:1px solid #dde;border-radius:8px;padding:14px">';
  if (r.label_type === 'INDIVIDUAL' && r.individual_data) {
    h += _lcsRenderIndividual(r.individual_data);
  } else if (r.label_type === 'LOT' && r.lot_data) {
    h += _lcsRenderLot(r.lot_data);
  } else if (r.label_type === 'UNIT' && r.unit_data) {
    h += _lcsRenderUnit(r.unit_data);
  }
  h += '</div>';

  // 曖昧フィールドリスト
  if (r.ambiguous_fields && r.ambiguous_fields.length) {
    h += '<div style="margin-top:12px;background:#fff8e1;border:1px solid #ffb300;border-radius:8px;padding:14px">';
    h += '<h4 style="margin:0 0 6px;color:#7a5b00">⚠️ AI が自信のないフィールド (' + r.ambiguous_fields.length + '件)</h4>';
    h += '<ul style="margin:4px 0;padding-left:24px;font-size:.9em">';
    r.ambiguous_fields.forEach(function (f) {
      h += '<li><code style="background:#f0f0f0;padding:1px 4px">' + _lcsEsc(f) + '</code></li>';
    });
    h += '</ul>';
    h += '</div>';
  }

  // 生 JSON
  h += '<details style="margin-top:12px"><summary style="cursor:pointer;padding:8px;background:#f0f0f0;border-radius:4px">📋 生 JSON を表示 (コピー用)</summary>';
  h += '<pre id="lcs-json-pre" style="background:#1e1e1e;color:#9cdcfe;padding:12px;border-radius:6px;overflow:auto;max-height:400px;font-size:.85em">' + _lcsEsc(JSON.stringify(r, null, 2)) + '</pre>';
  h += '<button id="lcs-copy-json" style="margin-top:6px;padding:6px 14px">📋 JSON をコピー</button></details>';

  area.innerHTML = h;

  const cb = document.getElementById('lcs-copy-json');
  if (cb) cb.addEventListener('click', function () {
    const json = JSON.stringify(r, null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(json).then(function () {
        if (window.UI && UI.toast) UI.toast('JSON をコピーしました', 'success');
      });
    }
  });
}

function _lcsRenderHistory() {
  const area = document.getElementById('lcs-history-area');
  if (!area) return;
  const list = _lcsLoadHistory();
  if (!list.length) {
    area.innerHTML = '<div style="color:#888;padding:14px;text-align:center">履歴はまだありません</div>';
    return;
  }
  let h = '<h4 style="margin:0 0 8px">📜 解析履歴 (' + list.length + '件・最新順)</h4>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">';
  list.forEach(function (rec, idx) {
    const r = rec.result || {};
    const lt = r.label_type || '?';
    const lc = r.line_code_raw || '?';
    h += '<div data-history-idx="' + idx + '" style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:6px;cursor:pointer" class="lcs-history-item">';
    if (rec.thumb) {
      h += '<img src="' + rec.thumb + '" style="width:100%;height:80px;object-fit:cover;border-radius:4px">';
    }
    h += '<div style="font-size:.8em;margin-top:4px">';
    h += '<div><strong>' + _lcsEsc(lt) + '</strong> / <code>' + _lcsEsc(lc) + '</code></div>';
    h += '<div style="color:#888;font-size:.85em">' + _lcsEsc((rec.extracted_at || '').slice(0, 16).replace('T',' ')) + '</div>';
    h += '</div></div>';
  });
  h += '</div>';
  h += '<button id="lcs-clear-history" style="margin-top:10px;padding:6px 14px;background:#fff0f0;border:1px solid #d99">🗑 履歴をクリア</button>';
  area.innerHTML = h;

  // 履歴クリック → 結果表示
  document.querySelectorAll('.lcs-history-item').forEach(function (el) {
    el.addEventListener('click', function () {
      const idx = parseInt(el.dataset.historyIdx, 10);
      const rec = list[idx];
      if (rec) _lcsRenderResult(rec);
    });
  });
  const ch = document.getElementById('lcs-clear-history');
  if (ch) ch.addEventListener('click', function () {
    if (confirm('解析履歴をすべて削除しますか?')) {
      _lcsClearHistory();
      _lcsRenderHistory();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// メインハンドラ: ファイル選択時の処理
// ═══════════════════════════════════════════════════════════════
async function _lcsHandleFileSelect(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  // API キー確認
  let apiKey = _lcsGetApiKey();
  if (!apiKey) {
    const k = prompt('Gemini API キーを入力してください\n(設定画面と共通の保存先に保存されます)');
    if (!k) { e.target.value = ''; return; }
    _lcsSetApiKey(k.trim());
    apiKey = k.trim();
  }

  // 進捗表示
  const status = document.getElementById('lcs-status');
  let success = 0, failed = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (status) status.innerHTML = '解析中... (' + (i + 1) + '/' + files.length + ') ' + _lcsEsc(f.name);
    if (window.Store && Store.setLoading) Store.setLoading(true);
    try {
      const processed = await _lcsProcessImageFile(f);
      const result    = await _lcsCallVisionWithRetry(processed, apiKey);
      const enriched  = _lcsPostProcess(result);
      const payload = {
        result:        enriched,
        thumb:         processed.image_thumb_url,
        file_name:     f.name,
        extracted_at:  _lcsNowIso(),
      };
      _lcsSaveRecent(payload);
      _lcsAddHistory(payload);
      _lcsRenderResult(payload);
      _lcsRenderHistory();
      success++;
    } catch (err) {
      console.error('[LCS] file=' + f.name, err);
      failed++;
      if (window.UI && UI.toast) UI.toast('解析エラー (' + f.name + '): ' + err.message, 'error');
    } finally {
      if (window.Store && Store.setLoading) Store.setLoading(false);
    }
  }
  if (status) {
    status.innerHTML = '';
    if (success && !failed)        { if (UI && UI.toast) UI.toast(success + '件 解析完了 ✓', 'success'); }
    else if (success && failed)    { if (UI && UI.toast) UI.toast('成功 ' + success + '件 / 失敗 ' + failed + '件', 'warn'); }
    else                            { if (UI && UI.toast) UI.toast(failed + '件 すべて失敗', 'error'); }
  }
  e.target.value = '';
}

// ═══════════════════════════════════════════════════════════════
// ページレンダリング
// ═══════════════════════════════════════════════════════════════
Pages.lcsExtract = function () {
  const main = document.getElementById('main');
  if (!main) return;

  const apiKeySet = !!_lcsGetApiKey();
  const linesCount = ((window.Store && Store.getDB) ? (Store.getDB('lines') || []) : []).length;

  main.innerHTML = `
    <div style="padding:14px;max-width:780px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:1.6em">🪲</span>
        <h2 style="margin:0;flex:1">LCS — 現場ラベル取り込み</h2>
        <span style="font-size:.8em;color:#888">build ${LCS_BUILD}</span>
      </div>
      <div style="background:#fff8e1;border-left:4px solid #ffb300;padding:8px 12px;border-radius:4px;font-size:.9em;margin-bottom:14px">
        <strong>Phase 1 — 精度検証スコープ</strong><br>
        Gemini Vision で現場ラベルを構造化JSONに変換します。<br>
        🚫 このページでは <strong>DBへの保存は行いません</strong>(精度確認のみ)
      </div>

      <div style="background:#f8f9fa;border:1px solid #dde;border-radius:8px;padding:14px;margin-bottom:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input type="file" id="lcs-file" accept="image/*" multiple style="display:none">
          <button id="lcs-take" style="padding:10px 20px;background:#0c5d2e;color:#fff;border:none;border-radius:6px;font-size:1em;cursor:pointer">
            📷 撮影 / 画像選択
          </button>
          <button id="lcs-key" style="padding:10px 16px;background:#fff;border:1px solid #ccc;border-radius:6px;cursor:pointer">
            🔑 APIキー${apiKeySet ? ' ✓' : ' (未設定)'}
          </button>
          <button id="lcs-recent" style="padding:10px 16px;background:#fff;border:1px solid #ccc;border-radius:6px;cursor:pointer">
            🔄 直近の結果を再表示
          </button>
        </div>
        <div id="lcs-status" style="margin-top:8px;color:#0c5d2e;font-weight:bold"></div>
        <div style="margin-top:8px;font-size:.85em;color:#666">
          ライン台帳: <strong>${linesCount}</strong>件 ロード済み${linesCount === 0 ? ' ⚠️ 同期してください' : ''} 
          / API: ${apiKeySet ? '✓ 準備OK' : '⚠️ 未設定'}
        </div>
      </div>

      <div id="lcs-result"></div>

      <div style="margin-top:24px;background:#f8f9fa;border:1px solid #dde;border-radius:8px;padding:14px">
        <div id="lcs-history-area"></div>
      </div>
    </div>
  `;

  // イベント結合
  document.getElementById('lcs-file').addEventListener('change', _lcsHandleFileSelect);
  document.getElementById('lcs-take').addEventListener('click', function () {
    document.getElementById('lcs-file').click();
  });
  document.getElementById('lcs-key').addEventListener('click', function () {
    const cur = _lcsGetApiKey();
    const k = prompt('Gemini API キー', cur || '');
    if (k != null) {
      _lcsSetApiKey(k.trim());
      if (UI && UI.toast) UI.toast('APIキーを保存しました', 'success');
      Pages.lcsExtract();  // 再描画
    }
  });
  document.getElementById('lcs-recent').addEventListener('click', function () {
    const recent = _lcsLoadRecent();
    if (recent) _lcsRenderResult(recent);
    else if (UI && UI.toast) UI.toast('直近の結果がありません', 'warn');
  });

  // 直近結果を即座に再表示
  const recent = _lcsLoadRecent();
  if (recent) _lcsRenderResult(recent);

  // 履歴表示
  _lcsRenderHistory();

  // [20260430b] ライン台帳が空ならバックグラウンド同期を発動
  //   LCS ページに直接アクセスしたケース (URL ハッシュ復元・FAB ボタン等) では
  //   syncAll が走っていないため Store.getDB('lines') が空配列のことがある。
  //   非同期で同期して、完了したら現在ページなら再描画する。
  const linesNow = (window.Store && Store.getDB) ? (Store.getDB('lines') || []) : [];
  if (linesNow.length === 0 && typeof syncAll === 'function') {
    console.log('[LCS] ライン台帳が空のためバックグラウンド同期を実行');
    syncAll(true).then(function () {
      if (window.Store && Store.getPage && Store.getPage() === 'lcs-extract') {
        console.log('[LCS] 同期完了 → 再描画');
        Pages.lcsExtract();
      }
    }).catch(function (e) { console.warn('[LCS] 同期失敗:', e && e.message); });
  }
};

// ═══════════════════════════════════════════════════════════════
// 自己登録
// ═══════════════════════════════════════════════════════════════
window.PAGES = window.PAGES || {};
window.PAGES['lcs-extract'] = function () { Pages.lcsExtract(); };

// 公開デバッグ用 (eval スクリプトから呼べるように)
window.LCS = {
  build:           LCS_BUILD,
  callVision:      _lcsCallVision,
  callWithRetry:   _lcsCallVisionWithRetry,
  processImage:    _lcsProcessImageFile,
  parseMatCode:    _lcsParseMatCode,
  resolveLine:     _lcsResolveLine,
  flagInvalidDate: _lcsFlagInvalidDate,
  postProcess:     _lcsPostProcess,
  buildPrompt:     _lcsBuildVisionPrompt,
  buildSchema:     _lcsBuildResponseSchema,
  getApiKey:       _lcsGetApiKey,
  loadHistory:     _lcsLoadHistory,
  loadRecent:      _lcsLoadRecent,
};

console.log('[LCS] module loaded. window.LCS available for eval/debug.');
