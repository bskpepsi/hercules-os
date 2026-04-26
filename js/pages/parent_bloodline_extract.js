// FILE: js/pages/parent_bloodline_extract.js
// ════════════════════════════════════════════════════════════════
// parent_bloodline_extract.js — 種親血統情報の Vision 抽出機能
//
// build: 20260426y6.4
//
// ── y6.4 での修正点 ────────────────────────────────────────────
// ・🔥 大きなスクショ複数枚で「トークン上限切り捨て」が頻発する問題を解決
//   原因: 1枚 1.6MB のような大きなスクショを3枚送ると、Vision の入力が
//        膨大になり、出力 8192 トークンを使い切る前に切り捨てられる。
//   対策の組み合わせ:
//     1) 初期圧縮を強化: 1280px/1MB → 960px/700KB
//     2) リトライ時にさらに再圧縮: 720px/400KB の縮小版を送信
//     3) リトライ時のプロンプト軽量化: raw_text を空に、kinship上限10件
//     4) ファイル選択時に枚数+合計サイズ表示&推奨超過警告
//
// ── y6.3 での修正点 ────────────────────────────────────────────
// ・🔥 「設定画面でAPIキーを設定済みなのに『未設定』と表示される」問題を解決
//   原因: 設定画面 (settings.js) は localStorage 'hcos_gemini_key' / Store.getSetting('gemini_key')
//        を使うが、本モジュールは 'hercules_gemini_key' しか読んでいなかった。
//   対策: 3つのキー名を優先順位で読む & 保存時は3つすべてに書き込む。
// ・🔥 JSON パース失敗時の自動リトライ実装
//   ・1回目失敗 → 温度を 0.3→0.15 に下げて自動再試行 (yahoo_listing.jsと同等)
//   ・raw_text の文字数制限を 2000→800 に下げてトークン節約
// ・🔥 切り捨てJSONの自動補修
//   MAX_TOKENS で切り捨てられたJSONを末尾補修して部分復元 (yahoo_listing.jsと同等)
// ・🔥 finishReason をチェックし、切り捨て時は明確なエラーメッセージ
//
// ── y6.2 での修正点 ────────────────────────────────────────────
// ・🔥 複数スクリーンショット同時アップロード対応
//   1度のリクエストで複数画像をVision APIに送信し、AIが統合された
//   1セットの構造化データを返す。同腹兄弟実績などスクショ間で重複
//   する情報も自動統合される。タイトル画像+商品説明1枚目+2枚目など
//   1個体に関する複数ページのスクショをまとめて処理可能。
// ・file inputに multiple 属性追加、サムネイルグリッドプレビュー表示
// ・編集モーダルで複数枚の元画像をサムネ並べ表示
// ・全スクショを source_screenshots[] に保存
//
// ── y6.1 での修正点 ────────────────────────────────────────────
// ・🔥 APIキーの再入力を不要に
//   設定画面と同じ localStorage キー (hercules_gemini_key) を共用しているため、
//   既にキーが設定済みの場合は「✅ 設定済み」表示にし、入力欄を非表示化。
//   「変更」リンクで必要なときだけ入力欄を展開できる。
//   未設定時のみ入力欄を表示し、保存先は設定画面と共通であることを明記。
//
// ── 概要 ─────────────────────────────────────────────────────
// ヤフオク等の出品ページのスクショ画像から、Gemini 2.5 Flash の
// Vision API を使って種親の血統情報を構造化抽出するモジュール。
// 抽出結果は parents テーブルの bloodline_data フィールドに保存され、
// 飼育画面・ヤフオク出品文生成・ライン詳細画面で参照される。
//
// ── 設計方針 ─────────────────────────────────────────────────
// ・既存の parent_v2.js / sale_listing.js / yahoo_listing.js は触らない
//   (組み込みは「📷 血統情報を抽出」ボタンを差し込むだけの最小介入)
// ・関数名は `_pbe*` プレフィックスで衝突回避
// ・グローバル公開は Pages._pbeOpenExtractor / _pbeOpenViewer のみ
// ・既存の parents レコードに後方互換的にフィールド追加
//   (古いレコードは bloodline_data === undefined で動作する)
// ・販売者名・店舗名・購入価格・購入条件は抽出しない方針
//   (Vision プロンプトで明示的に禁止)
//
// ── データモデル ──────────────────────────────────────────────
// parents テーブルの各レコードに以下フィールドを追加 (任意):
//   {
//     // 既存フィールド (par_id, sex, size_mm, paternal_raw, ...) はそのまま
//
//     bloodline_data: {
//       species_full:    'Dynastes hercules hercules',
//       origin:          'グアドループ',
//       generation:      'CB',
//       eclosion_period: '2025/8/中旬',
//       body_size_mm:    79,
//       paternal_blood:  'MT-FF1710F.FFOAKS',
//       maternal_blood:  '00-181',
//       kinship_records: [
//         {metric:'body_size', threshold:174, count:1, unit:'mm', is_top:true},
//         {metric:'body_size', threshold:170, count:6, unit:'mm'},
//         {metric:'pre_pupa_weight', threshold:150, count:1, unit:'g', is_top:true, note:'前蛹'},
//       ],
//       feature_notes:   '胸角の伸びがピカイチ。サイズ系・長角系統。',
//       raw_text:        '(原文全文)',
//     },
//     source_screenshots: [
//       {
//         id:                  'shot_xxx',
//         uploaded_at:         '2026-04-26T17:30:00',
//         image_data_url:      'data:image/jpeg;base64,...',  // 1MB以下圧縮
//         thumbnail_data_url:  'data:image/jpeg;base64,...',  // 200x300サムネ
//         extraction_status:   'done' | 'pending' | 'failed',
//         extracted_at:        '2026-04-26T17:30:30',
//       },
//     ],
//     bloodline_updated_at: '2026-04-26T17:31:00',
//   }
// ════════════════════════════════════════════════════════════════
'use strict';

// ════════════════════════════════════════════════════════════════
// 定数
// ════════════════════════════════════════════════════════════════
const PBE_GEMINI_MODEL = 'gemini-2.5-flash';
const PBE_API_KEY_LS   = 'hercules_gemini_key';     // yahoo_listing.js と共用
// [y6.4] 画像サイズ定数: トークン消費削減のため積極的に圧縮
//   Vision API はピクセル数が多いほど入力トークンを多く消費する。
//   大きすぎる画像は出力 (8192トークン) を圧迫するため、解像度・ファイルサイズを抑制。
const PBE_MAX_IMAGE_SIZE_BYTES = 700 * 1024;        // [y6.4] 1MB → 700KB
const PBE_MAX_IMAGE_DIMENSION  = 960;               // [y6.4] 1280px → 960px (長辺)
const PBE_THUMB_DIMENSION      = 240;               // サムネ長辺 (表示用)
// [y6.4] Vision API送信前の追加圧縮 (リトライ時に使用)
const PBE_RETRY_MAX_DIMENSION  = 720;               // リトライ時の長辺
const PBE_RETRY_MAX_SIZE_BYTES = 400 * 1024;        // リトライ時 400KB
// [y6.4] 推奨枚数上限 (これを超えると警告)
const PBE_WARN_FILE_COUNT      = 3;

// 同腹兄弟実績の指標
const PBE_KINSHIP_METRICS = {
  body_size:        { label: '体長',     unit: 'mm' },
  pre_pupa_weight:  { label: '前蛹体重', unit: 'g'  },
  larva_weight:     { label: '幼虫体重', unit: 'g'  },
  thorax_horn:      { label: '胸角',     unit: 'mm' },
  head_horn:        { label: '頭角',     unit: 'mm' },
};

// ════════════════════════════════════════════════════════════════
// ユーティリティ
// ════════════════════════════════════════════════════════════════
function _pbeEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _pbeNowIso() {
  return new Date().toISOString();
}

function _pbeUid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// API キー取得 (yahoo_listing.js / sale_listing.js / settings.js 全てと共用)
// [y6.3] 設定画面と他モジュールで使用されている複数のキー名を順に確認:
//   1. Store.getSetting('gemini_key')  ← 設定画面が使う公式キー
//   2. localStorage 'hcos_gemini_key'  ← config.js 経由 (CONFIG.LS_KEYS.GEMINI_KEY)
//   3. localStorage 'hercules_gemini_key' ← sale_listing.js / yahoo_listing.js が使うキー
function _pbeGetApiKey() {
  try {
    // 1. 設定画面の保存先 (Store ヘルパー経由)
    if (window.Store && typeof Store.getSetting === 'function') {
      const k = Store.getSetting('gemini_key');
      if (k) return k;
    }
    // 2. config.js 経由のキー
    const k2 = localStorage.getItem('hcos_gemini_key');
    if (k2) return k2;
    // 3. yahoo_listing/sale_listing と同じキー
    return localStorage.getItem(PBE_API_KEY_LS) || '';
  } catch (_) { return ''; }
}

// API キー保存 (3つの保存先すべてに書き込んで確実に同期)
function _pbeSetApiKey(key) {
  try {
    if (window.Store && typeof Store.setSetting === 'function') {
      Store.setSetting('gemini_key', key);
    }
    localStorage.setItem('hcos_gemini_key', key);
    localStorage.setItem(PBE_API_KEY_LS, key);
    if (window.CONFIG) CONFIG.GEMINI_KEY = key;
  } catch (_) {}
}

// 種親レコード取得・更新 (Store.getDB / patchDBItem を利用)
function _pbeGetParent(parId) {
  const parents = (Store.getDB && Store.getDB('parents')) || [];
  return parents.find(p => p.par_id === parId
    || p.parent_display_id === parId
    || p.display_name === parId) || null;
}

async function _pbePatchParent(parId, patch) {
  if (Store.patchDBItem) {
    Store.patchDBItem('parents', 'par_id', parId, patch);
  }
  // GAS への永続化は本機能では行わない (既存の更新フローを壊さないため)
  // ローカルストレージのみで完結。次回の syncAll で同期される設計。
}

// ════════════════════════════════════════════════════════════════
// 画像圧縮: File / DataURL → 指定サイズ以下の JPEG DataURL
// [y6.4] sizeLimitBytes 引数を追加し、リトライ時はより強く圧縮できるように
// ════════════════════════════════════════════════════════════════
function _pbeCompressImage(srcDataUrl, maxDim, qualityStart, sizeLimitBytes) {
  const limit = sizeLimitBytes || PBE_MAX_IMAGE_SIZE_BYTES;
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

      // 段階的に quality を下げて目標サイズ以下に
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

function _pbeFileToDataUrl(file) {
  return new Promise(function (resolve, reject) {
    const fr = new FileReader();
    fr.onload  = function () { resolve(fr.result); };
    fr.onerror = function () { reject(new Error('ファイルの読み込みに失敗しました')); };
    fr.readAsDataURL(file);
  });
}

async function _pbeProcessImageFile(file) {
  const rawDataUrl = await _pbeFileToDataUrl(file);
  const main = await _pbeCompressImage(rawDataUrl, PBE_MAX_IMAGE_DIMENSION, 0.85, PBE_MAX_IMAGE_SIZE_BYTES);
  const thumb = await _pbeCompressImage(rawDataUrl, PBE_THUMB_DIMENSION,  0.7, 100 * 1024);
  return {
    image_data_url:     main.dataUrl,
    thumbnail_data_url: thumb.dataUrl,
    width:              main.width,
    height:             main.height,
    raw_data_url:       rawDataUrl,    // [y6.4] リトライ時に再圧縮するために保持
  };
}

// [y6.4] リトライ時用: より強く圧縮した画像データURLを生成
async function _pbeRecompressForRetry(processedImage) {
  if (!processedImage.raw_data_url) return processedImage.image_data_url;
  const recompressed = await _pbeCompressImage(
    processedImage.raw_data_url,
    PBE_RETRY_MAX_DIMENSION,
    0.7,
    PBE_RETRY_MAX_SIZE_BYTES
  );
  return recompressed.dataUrl;
}

// ════════════════════════════════════════════════════════════════
// Gemini Vision API 呼び出し
// ════════════════════════════════════════════════════════════════
function _pbeBuildVisionPrompt() {
  return `あなたはヘラクレスオオカブトの繁殖個体の出品ページを分析する専門家です。
以下の出品ページのスクリーンショット画像を読み取り、種親の血統情報を構造化して抽出してください。

━━━ 🚫 厳守ルール (絶対守ること) ━━━
1. 販売者名・店舗名・出品者名は**抽出しない**(seller_name フィールドは作らない)
2. 購入価格・落札金額は**抽出しない**
3. 購入条件・購入制約 (「幼虫販売目的不可」など) は**抽出しない**
4. 画像内に書かれていない情報は捏造しない (推測値は null にする)
5. 数値は画像内の表記を**そのまま**転記し、改変しない

━━━ 抽出対象 ━━━
出品ページから以下の情報を読み取ってください:

- species_full:    学名 (例: "Dynastes hercules hercules")
- common_name:     和名 (例: "ヘラクレスオオカブト" / "DHヘラクレス")
- origin:          産地 (例: "グアドループ" / "Guadeloupe")
- generation:      累代 (例: "CB" / "WD" / "F1" / "WF1" / "CBF2")
- eclosion_period: 羽化日・羽化期 (例: "2025/8/中旬" / "2024年12月")
- body_size_mm:    体長 (mm 単位の数値のみ。例: 79)
- paternal_blood:  ♂親(父系)の血統表記原文 (例: "MT-FF1710F.FFOAKS")
- maternal_blood:  ♀親(母系)の血統表記原文 (例: "00-181")
- kinship_records: 同腹兄弟・同系統の実績 (構造化配列、後述)
- feature_notes:   系統的な特徴・優位点を中立的にまとめた1-2文 (例: "胸角の伸びが優秀。サイズ系・長角系統。")
- raw_text:        出品文の本文テキスト全文 (画像から読み取れた範囲で)

━━━ kinship_records の構造 ━━━
「174mm筆頭・170mm up 6頭・168mm up 3頭・前蛹150g up 筆頭・140g台複数」のような
同腹兄弟実績が書かれている場合、以下の形式で配列にする:

[
  { "metric": "body_size",       "threshold": 174, "count": 1,    "unit": "mm", "is_top": true },
  { "metric": "body_size",       "threshold": 170, "count": 6,    "unit": "mm", "is_top": false },
  { "metric": "body_size",       "threshold": 168, "count": 3,    "unit": "mm", "is_top": false },
  { "metric": "body_size",       "threshold": 165, "count": null, "unit": "mm", "note": "数えていない" },
  { "metric": "pre_pupa_weight", "threshold": 150, "count": 1,    "unit": "g",  "is_top": true,  "note": "前蛹" },
  { "metric": "pre_pupa_weight", "threshold": 140, "count": null, "unit": "g",  "note": "複数" }
]

metric 値: "body_size" (体長) | "pre_pupa_weight" (前蛹体重) | "larva_weight" (幼虫体重) | "thorax_horn" (胸角) | "head_horn" (頭角)
threshold: 数値のしきい値
count: 該当頭数 (不明なら null、note に「複数」「数えていない」等を入れる)
unit: "mm" | "g"
is_top: 筆頭 (最大個体) なら true
note: 補足

━━━ 出力フォーマット (必須) ━━━
以下の純粋なJSON形式のみで返してください。マークダウンのコードブロック装飾は付けないでください。
画像から読み取れない項目は null としてください (空文字列ではなく)。

{
  "species_full":    "...",
  "common_name":     "...",
  "origin":          "...",
  "generation":      "...",
  "eclosion_period": "...",
  "body_size_mm":    79,
  "paternal_blood":  "...",
  "maternal_blood":  "...",
  "kinship_records": [...],
  "feature_notes":   "...",
  "raw_text":        "..."
}`;
}

async function _pbeCallVision(imageDataUrl, apiKey, opts) {
  opts = opts || {};
  const isRetry = !!opts.isRetry;
  // image_data_url は "data:image/jpeg;base64,xxxx" 形式
  const m = String(imageDataUrl).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
  if (!m) throw new Error('画像データの形式が不正です');
  const mimeType = m[1];
  const base64   = m[2];

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            + PBE_GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      species_full:    { type: 'STRING', nullable: true },
      common_name:     { type: 'STRING', nullable: true },
      origin:          { type: 'STRING', nullable: true },
      generation:      { type: 'STRING', nullable: true },
      eclosion_period: { type: 'STRING', nullable: true },
      body_size_mm:    { type: 'NUMBER', nullable: true },
      paternal_blood:  { type: 'STRING', nullable: true },
      maternal_blood:  { type: 'STRING', nullable: true },
      kinship_records: {
        type: 'ARRAY',
        nullable: true,
        items: {
          type: 'OBJECT',
          properties: {
            metric:    { type: 'STRING' },
            threshold: { type: 'NUMBER' },
            count:     { type: 'NUMBER', nullable: true },
            unit:      { type: 'STRING' },
            is_top:    { type: 'BOOLEAN', nullable: true },
            note:      { type: 'STRING', nullable: true },
          },
          required: ['metric', 'threshold', 'unit'],
        },
      },
      feature_notes: { type: 'STRING', nullable: true },
      raw_text:      { type: 'STRING', nullable: true },
    },
  };

  const body = {
    contents: [{
      parts: [
        { text: _pbeBuildVisionPrompt() },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      temperature:      isRetry ? 0.15 : 0.3,
      maxOutputTokens:  8192,
      topP:             isRetry ? 0.7 : 0.85,
      responseMimeType: 'application/json',
      responseSchema:   responseSchema,
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

  // JSON パース (yahoo_listing.js と同等のフォールバック)
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
    console.warn('[PBE] JSON parse failed. Raw response head:', text.slice(0, 500));
    throw new Error('抽出結果のJSONパースに失敗しました。再試行してください。');
  }
  return parsed;
}

// ════════════════════════════════════════════════════════════════
// [y6.2] 複数画像をまとめて Vision API に渡す版
//   同じ種親に関する複数のスクショ (タイトル・商品説明1・2など) を
//   一度のリクエストで送信し、AIに統合された1セットの構造化データを
//   返してもらう。同腹兄弟実績などスクショ間で重複する情報も統合される。
// ════════════════════════════════════════════════════════════════
async function _pbeCallVisionMulti(imageDataUrls, apiKey, opts) {
  if (!imageDataUrls || !imageDataUrls.length) {
    throw new Error('画像が選択されていません');
  }
  if (imageDataUrls.length === 1) {
    return _pbeCallVision(imageDataUrls[0], apiKey, opts);
  }
  opts = opts || {};
  const isRetry = !!opts.isRetry;

  // 複数枚の場合
  const imageParts = imageDataUrls.map(function (dataUrl, idx) {
    const m = String(dataUrl).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!m) throw new Error('画像データの形式が不正です (' + (idx + 1) + '枚目)');
    return { mimeType: m[1], base64: m[2] };
  });

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            + PBE_GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);

  // 複数画像用に少しプロンプトを調整 (画像が複数ある旨を伝える)
  // [y6.3] リトライ時は raw_text を短く制限してトークン節約
  // [y6.4] リトライ時は raw_text を完全に空にして、構造化フィールドのみに集中
  const rawTextLimit = isRetry ? 0 : 1500;
  const rawTextInstruction = isRetry
    ? '・raw_text は空文字列 "" で返す (構造化フィールドのみに集中するため)\n'
      + '・kinship_records も最大10件までに絞る (重要な実績だけ)\n'
      + '・feature_notes は1文・60文字以内に収める'
    : '・raw_text は重要部分のみ抜粋し ' + rawTextLimit + ' 文字以内に収める';
  const multiPrompt = _pbeBuildVisionPrompt()
    + '\n\n━━━ 複数画像の取り扱い ━━━\n'
    + 'これから ' + imageDataUrls.length + '枚 の画像を渡します。これらはすべて同じ種親個体に関する出品ページの異なる部分(商品タイトル・商品説明1ページ目・2ページ目・画像など)です。\n'
    + '各画像から読み取れる情報を**統合**して、1セットの構造化データを返してください。\n'
    + '・同じ情報が複数の画像にある場合は重複させない\n'
    + '・補完的な情報がある場合は両方を活かす(例: 1枚目に♂血統、2枚目に♀血統)\n'
    + '・kinship_records は全画像の情報を統合して1つの配列にまとめる\n'
    + rawTextInstruction;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      species_full:    { type: 'STRING', nullable: true },
      common_name:     { type: 'STRING', nullable: true },
      origin:          { type: 'STRING', nullable: true },
      generation:      { type: 'STRING', nullable: true },
      eclosion_period: { type: 'STRING', nullable: true },
      body_size_mm:    { type: 'NUMBER', nullable: true },
      paternal_blood:  { type: 'STRING', nullable: true },
      maternal_blood:  { type: 'STRING', nullable: true },
      kinship_records: {
        type: 'ARRAY',
        nullable: true,
        items: {
          type: 'OBJECT',
          properties: {
            metric:    { type: 'STRING' },
            threshold: { type: 'NUMBER' },
            count:     { type: 'NUMBER', nullable: true },
            unit:      { type: 'STRING' },
            is_top:    { type: 'BOOLEAN', nullable: true },
            note:      { type: 'STRING', nullable: true },
          },
          required: ['metric', 'threshold', 'unit'],
        },
      },
      feature_notes: { type: 'STRING', nullable: true },
      raw_text:      { type: 'STRING', nullable: true },
    },
  };

  // parts: [テキスト, 画像1, 画像2, ...]
  const parts = [{ text: multiPrompt }];
  imageParts.forEach(function (p) {
    parts.push({ inline_data: { mime_type: p.mimeType, data: p.base64 } });
  });

  const body = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature:      isRetry ? 0.15 : 0.3,
      maxOutputTokens:  8192,
      topP:             isRetry ? 0.7 : 0.85,
      responseMimeType: 'application/json',
      responseSchema:   responseSchema,
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
  // [y6.3] 切り捨て検知
  const wasTruncated = (finishReason === 'MAX_TOKENS');
  if (wasTruncated) console.warn('[PBE] Gemini response was truncated (MAX_TOKENS).');

  // JSON パース
  let jsonStr = text.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) jsonStr = fence[1].trim();
  let parsed;
  try { parsed = JSON.parse(jsonStr); }
  catch (_) {}
  if (!parsed) {
    const m2 = jsonStr.match(/\{[\s\S]*\}/);
    if (m2) {
      try { parsed = JSON.parse(m2[0]); } catch (_e) {}
    }
  }
  // [y6.3] 切り捨てJSON補修: 末尾の不完全な文字列を閉じ、{}を補完
  if (!parsed && wasTruncated) {
    const m3 = jsonStr.match(/\{[\s\S]*/);
    if (m3) {
      let s = m3[0];
      let inS = false, esc = false;
      let lastSafeIdx = -1;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inS = !inS; if (!inS) lastSafeIdx = i; continue; }
        if (!inS && ch === ',') lastSafeIdx = i;
      }
      if (lastSafeIdx > 0) {
        let tail = s.slice(0, lastSafeIdx + 1).replace(/,\s*$/, '');
        const opens = (tail.match(/\{/g) || []).length - (tail.match(/\}/g) || []).length;
        const opensA = (tail.match(/\[/g) || []).length - (tail.match(/\]/g) || []).length;
        for (let i = 0; i < opensA; i++) tail += ']';
        for (let i = 0; i < opens; i++) tail += '}';
        try { parsed = JSON.parse(tail); console.warn('[PBE] Recovered partial JSON.'); }
        catch (_e) {}
      }
    }
  }
  if (!parsed) {
    console.warn('[PBE] JSON parse failed (multi). finishReason=' + finishReason
      + ', raw response head:', text.slice(0, 500));
    if (wasTruncated) {
      throw new Error('レスポンスがトークン上限で切り捨てられました。スクショを減らすか再試行してください。');
    }
    throw new Error('抽出結果のJSONパースに失敗しました。再試行してください。');
  }
  return parsed;
}

// ════════════════════════════════════════════════════════════════
// 抽出結果のサニタイズ (販売者名等が混入していたら除去)
// ════════════════════════════════════════════════════════════════
function _pbeSanitizeBloodlineData(data) {
  if (!data || typeof data !== 'object') return null;
  // 想定外フィールドが万一混入してもこの段階で除去
  const allowed = [
    'species_full', 'common_name', 'origin', 'generation',
    'eclosion_period', 'body_size_mm', 'paternal_blood', 'maternal_blood',
    'kinship_records', 'feature_notes', 'raw_text',
  ];
  const out = {};
  allowed.forEach(function (k) {
    if (data[k] !== undefined) out[k] = data[k];
  });
  // body_size_mm は数値化
  if (out.body_size_mm != null && typeof out.body_size_mm !== 'number') {
    const n = parseFloat(out.body_size_mm);
    out.body_size_mm = isNaN(n) ? null : n;
  }
  // kinship_records はサニタイズ
  if (Array.isArray(out.kinship_records)) {
    out.kinship_records = out.kinship_records
      .filter(function (r) { return r && r.metric && r.threshold != null; })
      .map(function (r) {
        return {
          metric:    String(r.metric),
          threshold: Number(r.threshold),
          count:     r.count != null ? Number(r.count) : null,
          unit:      r.unit || (PBE_KINSHIP_METRICS[r.metric] && PBE_KINSHIP_METRICS[r.metric].unit) || '',
          is_top:    !!r.is_top,
          note:      r.note ? String(r.note) : '',
        };
      });
  } else {
    out.kinship_records = [];
  }
  return out;
}

// ════════════════════════════════════════════════════════════════
// 抽出モーダル: 種親編集画面から呼ばれる
//   parId   - 対象の種親ID
//   onDone  - 抽出完了時に呼ばれるコールバック (formに値を反映する用)
// ════════════════════════════════════════════════════════════════
Pages._pbeOpenExtractor = function (parId, opts) {
  opts = opts || {};
  const par = _pbeGetParent(parId);
  // par が null でもOK (新規登録時など) - その場合は parId='' で扱う
  const apiKey = _pbeGetApiKey();
  // [y6.1] 設定画面と共用の API キーがすでにある場合は再入力させない
  const hasKey = !!apiKey;

  const html = '<div class="modal-title">📷 血統情報を抽出</div>'
    + '<div class="form-section" style="font-size:.88rem;line-height:1.55">'
    + '  <p style="margin-bottom:8px;color:var(--text2)">'
    + '    ヤフオク等の出品ページのスクリーンショットを選択してください。<br>'
    + '    AI(Gemini Vision)が血統表記・サイズ・累代・同腹兄弟実績を自動抽出します。'
    + '  </p>'
    + '  <div style="background:var(--surface2);padding:8px 10px;border-radius:6px;font-size:.78rem;color:var(--text3);line-height:1.5;margin-bottom:12px">'
    + '    🔒 販売者名・店舗名・購入価格・購入条件は<b>抽出されません</b>。<br>'
    + '    🔒 抽出結果はあなたの端末内のみに保存されます。'
    + '  </div>'
    + '  <div style="margin-bottom:10px">'
    + '    <label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">スクリーンショット <span style="font-weight:400;color:var(--text3);font-size:.72rem">(複数枚選択可)</span></label>'
    + '    <input type="file" id="pbe-file-input" accept="image/*" multiple '
    + '           style="width:100%;padding:8px;background:var(--surface2);border-radius:6px;color:var(--text);border:1px solid var(--surface3)">'
    + '    <div id="pbe-file-preview" style="margin-top:8px"></div>'
    + '  </div>'
    + (hasKey
      ? // [y6.1] 既にキーがある: ステータス表示のみ、入力欄は折り畳み
        '  <div style="background:rgba(80,180,120,.10);border:1px solid rgba(80,180,120,.3);padding:6px 10px;border-radius:6px;font-size:.78rem;color:var(--green);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">'
        + '    <span>✅ Gemini APIキー設定済み</span>'
        + '    <a href="#" onclick="document.getElementById(\'pbe-key-section\').style.display=\'block\';this.style.display=\'none\';return false;" style="color:var(--text3);font-size:.72rem;text-decoration:underline">変更</a>'
        + '  </div>'
        + '  <div id="pbe-key-section" style="display:none;margin-bottom:10px">'
        + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">APIキーを変更 <span style="font-weight:400;color:var(--text3)">(設定画面と共通)</span></label>'
        + '    <input type="password" id="pbe-key-input" value="' + _pbeEsc(apiKey) + '" placeholder="AIzaSy..." '
        + '           style="width:100%;padding:8px;background:var(--surface2);border-radius:6px;color:var(--text);border:1px solid var(--surface3)">'
        + '  </div>'
      : // [y6.1] 未設定: 案内 + その場で入力
        '  <div style="background:rgba(230,150,0,.12);border:1px solid rgba(230,150,0,.4);padding:8px 10px;border-radius:6px;font-size:.78rem;color:var(--amber);margin-bottom:10px;line-height:1.55">'
        + '    ⚠️ Gemini APIキーが未設定です。<br>'
        + '    通常は<b>設定画面 → Gemini APIキー</b>でまとめて設定しますが、ここでも入力できます。<br>'
        + '    入力したキーは設定画面と共通の保存先に記録されます。'
        + '  </div>'
        + '  <div style="margin-bottom:10px">'
        + '    <label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">'
        + '      Gemini APIキー <span style="font-weight:400;color:var(--text3)">(端末に保存・設定画面と共通)</span>'
        + '    </label>'
        + '    <input type="password" id="pbe-key-input" value="" placeholder="AIzaSy..." '
        + '           style="width:100%;padding:8px;background:var(--surface2);border-radius:6px;color:var(--text);border:1px solid var(--surface3)">'
        + '  </div>')
    + '  <div id="pbe-status" style="display:none;margin:10px 0;padding:8px;border-radius:6px;font-size:.82rem"></div>'
    + '</div>'
    + '<div class="modal-footer">'
    + '  <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>'
    + '  <button class="btn btn-primary" id="pbe-extract-btn" style="flex:2" '
    + '          onclick="Pages._pbeRunExtraction(\'' + _pbeEsc(parId) + '\')">'
    + '    🤖 AIで抽出開始'
    + '  </button>'
    + '</div>';

  UI.modal(html);

  // ファイル選択時のプレビュー (複数枚対応)
  setTimeout(function () {
    const fi = document.getElementById('pbe-file-input');
    if (fi) fi.addEventListener('change', function (e) {
      const files = Array.from((e.target.files) || []);
      const prev = document.getElementById('pbe-file-preview');
      if (!prev) return;
      if (!files.length) { prev.innerHTML = ''; return; }
      // [y6.4] 合計サイズ計算と警告判定
      const totalKb = Math.round(files.reduce(function (s, f) { return s + f.size; }, 0) / 1024);
      const tooMany = files.length > PBE_WARN_FILE_COUNT;
      const tooLarge = totalKb > 2500;
      const warningHtml = (tooMany || tooLarge)
        ? '<div style="background:rgba(230,150,0,.12);border:1px solid rgba(230,150,0,.35);padding:6px 10px;border-radius:6px;font-size:.74rem;color:var(--amber);margin-bottom:6px;line-height:1.5">'
          + '⚠️ '
          + (tooMany ? files.length + '枚は多めです。' : '')
          + (tooLarge ? '合計サイズが大きいため' : '')
          + 'AIが応答しきれない可能性があります。失敗した場合は枚数を減らしてください。'
          + '</div>'
        : '';
      // 各ファイルをサムネイルとしてグリッド表示
      prev.innerHTML = warningHtml
        + '<div style="font-size:.78rem;color:var(--text2);margin-bottom:6px">'
        + '📁 ' + files.length + ' 枚選択中 (合計 ' + totalKb + 'KB)'
        + '</div>'
        + '<div id="pbe-thumbs-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px"></div>';
      const grid = document.getElementById('pbe-thumbs-grid');
      files.forEach(function (f, idx) {
        const r = new FileReader();
        r.onload = function () {
          const cell = document.createElement('div');
          cell.style.cssText = 'position:relative;border:1px solid var(--surface3);border-radius:6px;overflow:hidden;background:var(--surface2)';
          cell.innerHTML = '<img src="' + r.result + '" '
            + 'style="width:100%;height:80px;object-fit:cover;display:block">'
            + '<div style="position:absolute;top:2px;left:2px;background:rgba(0,0,0,.7);color:#fff;font-size:.66rem;padding:1px 5px;border-radius:3px;font-weight:700">'
            + (idx + 1) + '/' + files.length
            + '</div>'
            + '<div style="font-size:.66rem;color:var(--text3);padding:2px 4px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
            + Math.round(f.size / 1024) + 'KB</div>';
          grid.appendChild(cell);
        };
        r.readAsDataURL(f);
      });
    });
  }, 50);

  // 完了コールバックをグローバル保持 (モーダルからフォームへ反映するため)
  window.__pbeOnDone = opts.onDone || null;
};

// ════════════════════════════════════════════════════════════════
// 抽出実行 (モーダル内ボタンから呼ばれる)
// ════════════════════════════════════════════════════════════════
Pages._pbeRunExtraction = async function (parId) {
  const fi   = document.getElementById('pbe-file-input');
  const ki   = document.getElementById('pbe-key-input');
  const stat = document.getElementById('pbe-status');
  const btn  = document.getElementById('pbe-extract-btn');

  const files = fi && fi.files ? Array.from(fi.files) : [];
  // [y6.1] APIキー: 入力欄が表示されていればそれを使い、なければ既存のキーを使う
  let key = '';
  if (ki && ki.offsetParent !== null) {
    key = ki.value.trim();
  } else {
    key = _pbeGetApiKey();
  }

  if (!files.length) {
    if (stat) {
      stat.style.display = 'block';
      stat.style.cssText += ';background:rgba(230,80,80,.12);color:#e05050';
      stat.textContent = '⚠️ スクリーンショットを選択してください (複数枚選択可)';
    }
    return;
  }
  if (!key) {
    if (stat) {
      stat.style.display = 'block';
      stat.style.cssText += ';background:rgba(230,80,80,.12);color:#e05050';
      stat.textContent = '⚠️ Gemini APIキーが必要です。設定画面で登録するか、上の「変更」リンクから入力してください';
    }
    return;
  }
  if (ki && ki.offsetParent !== null && key !== _pbeGetApiKey()) {
    _pbeSetApiKey(key);
  }

  if (btn) btn.disabled = true;
  if (stat) {
    stat.style.display = 'block';
    stat.style.cssText = 'display:block;margin:10px 0;padding:8px;border-radius:6px;font-size:.82rem;'
      + 'background:rgba(80,180,120,.12);color:var(--green)';
    stat.innerHTML = '🔄 ' + files.length + '枚の画像を圧縮中...';
  }

  try {
    // [y6.2] 全画像を並列圧縮
    const processedAll = await Promise.all(files.map(function (f) {
      return _pbeProcessImageFile(f);
    }));

    if (stat) {
      stat.innerHTML = '🔄 Geminiで' + files.length + '枚を統合解析中... (15〜30秒)';
    }

    // [y6.2] 全画像をまとめて Vision API に送信。AIが統合された1セットの構造化データを返す
    // [y6.3] 自動リトライ: 1回目失敗時は温度を下げて再試行
    // [y6.4] リトライ時は画像をさらに強く再圧縮して入力トークンも削減
    const imageUrls = processedAll.map(function (p) { return p.image_data_url; });
    let raw;
    try {
      raw = await _pbeCallVisionMulti(imageUrls, key);
    } catch (e1) {
      const msg = String(e1.message || '');
      // パース失敗・切り捨ての場合のみリトライ (API認証エラー等は即時失敗)
      const isRetriable = msg.includes('JSON') || msg.includes('切り捨て') || msg.includes('パース');
      if (isRetriable) {
        console.warn('[PBE] retrying with stronger compression + lower temperature...', e1);
        if (stat) stat.innerHTML = '🔄 再試行中... (画像を再圧縮して短く生成します)';
        // [y6.4] リトライ時の画像をさらに圧縮
        const retryImageUrls = await Promise.all(processedAll.map(function (p) {
          return _pbeRecompressForRetry(p);
        }));
        raw = await _pbeCallVisionMulti(retryImageUrls, key, { isRetry: true });
      } else {
        throw e1;
      }
    }

    // サニタイズ
    const data = _pbeSanitizeBloodlineData(raw);

    // 確認エディタを開く (複数スクショを渡す)
    UI.closeModal();
    setTimeout(function () {
      _pbeOpenEditor(parId, data, processedAll);
    }, 100);

  } catch (e) {
    console.error('[PBE] extraction failed', e);
    if (stat) {
      stat.style.cssText = 'display:block;margin:10px 0;padding:8px;border-radius:6px;font-size:.82rem;'
        + 'background:rgba(230,80,80,.12);color:#e05050';
      stat.textContent = '❌ ' + (e.message || String(e));
    }
    if (btn) btn.disabled = false;
  }
};

// ════════════════════════════════════════════════════════════════
// 抽出結果の確認・編集モーダル (構造化エディタ)
//   processedImages: 単一の processed オブジェクト or 配列 (両対応)
// ════════════════════════════════════════════════════════════════
function _pbeOpenEditor(parId, data, processedImages) {
  data = data || {};
  // [y6.2] 単一画像/複数画像の両方を受け付ける(後方互換)
  const imagesArr = Array.isArray(processedImages)
    ? processedImages
    : (processedImages ? [processedImages] : []);

  // データを window に保持して onclick から参照
  window.__pbeCurrentEdit = {
    parId:           parId,
    data:            data,
    processedImages: imagesArr,  // [y6.2] 配列で保持
  };

  // 元画像のサムネイル並べ表示
  const imagesPreview = imagesArr.length
    ? '<details style="margin-bottom:10px"><summary style="cursor:pointer;color:var(--text3);font-size:.78rem">📷 元画像 (' + imagesArr.length + '枚) を見る</summary>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px;margin-top:6px">'
      + imagesArr.map(function (img, i) {
          return '<div style="position:relative">'
            + '<img src="' + img.thumbnail_data_url + '" '
            + 'style="width:100%;height:120px;object-fit:cover;border-radius:6px;border:1px solid var(--surface3)">'
            + '<div style="position:absolute;top:2px;left:2px;background:rgba(0,0,0,.7);color:#fff;font-size:.66rem;padding:1px 5px;border-radius:3px">'
            + (i + 1) + '/' + imagesArr.length + '</div>'
            + '</div>';
        }).join('')
      + '</div></details>'
    : '';

  const html = '<div class="modal-title">📝 抽出結果の確認・編集</div>'
    + '<div class="form-section" style="font-size:.85rem;max-height:65vh;overflow-y:auto">'
    + imagesPreview
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">和名・通称</label>'
    + '    <input type="text" id="pbe-ed-common_name" class="input" value="' + _pbeEsc(data.common_name || '') + '" placeholder="ヘラクレスオオカブト">'
    + '  </div>'
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">学名</label>'
    + '    <input type="text" id="pbe-ed-species_full" class="input" value="' + _pbeEsc(data.species_full || '') + '" placeholder="Dynastes hercules hercules">'
    + '  </div>'
    + '  <div class="form-row-2">'
    + '    <div>'
    + '      <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">産地</label>'
    + '      <input type="text" id="pbe-ed-origin" class="input" value="' + _pbeEsc(data.origin || '') + '" placeholder="グアドループ">'
    + '    </div>'
    + '    <div>'
    + '      <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">累代</label>'
    + '      <input type="text" id="pbe-ed-generation" class="input" value="' + _pbeEsc(data.generation || '') + '" placeholder="CB">'
    + '    </div>'
    + '  </div>'
    + '  <div class="form-row-2">'
    + '    <div>'
    + '      <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">羽化期</label>'
    + '      <input type="text" id="pbe-ed-eclosion_period" class="input" value="' + _pbeEsc(data.eclosion_period || '') + '" placeholder="2025/8/中旬">'
    + '    </div>'
    + '    <div>'
    + '      <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">体長(mm)</label>'
    + '      <input type="number" id="pbe-ed-body_size_mm" class="input" value="' + _pbeEsc(data.body_size_mm != null ? data.body_size_mm : '') + '" placeholder="79">'
    + '    </div>'
    + '  </div>'
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">♂血統表記原文</label>'
    + '    <textarea id="pbe-ed-paternal_blood" class="input" rows="2" placeholder="MT-FF1710F.FFOAKS">' + _pbeEsc(data.paternal_blood || '') + '</textarea>'
    + '  </div>'
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">♀血統表記原文</label>'
    + '    <textarea id="pbe-ed-maternal_blood" class="input" rows="2" placeholder="00-181">' + _pbeEsc(data.maternal_blood || '') + '</textarea>'
    + '  </div>'
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">'
    + '      同腹兄弟実績 <span style="font-weight:400;color:var(--text3);font-size:.74rem">(数値修正可)</span>'
    + '    </label>'
    + '    <div id="pbe-ed-kinship-rows">' + _pbeRenderKinshipRows(data.kinship_records || []) + '</div>'
    + '    <button type="button" class="btn btn-ghost btn-sm" style="margin-top:4px;font-size:.78rem"'
    + '            onclick="Pages._pbeAddKinshipRow()">＋ 実績を追加</button>'
    + '  </div>'
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">系統的特徴</label>'
    + '    <textarea id="pbe-ed-feature_notes" class="input" rows="2" placeholder="胸角の伸びが優秀。サイズ系・長角系統。">' + _pbeEsc(data.feature_notes || '') + '</textarea>'
    + '  </div>'
    + '  <details style="margin-bottom:8px">'
    + '    <summary style="cursor:pointer;font-size:.78rem;color:var(--text3)">📄 抽出した本文 (編集可・ヤフオク出品時のヒント用)</summary>'
    + '    <textarea id="pbe-ed-raw_text" class="input" rows="6" style="margin-top:4px;font-size:.78rem">' + _pbeEsc(data.raw_text || '') + '</textarea>'
    + '  </details>'
    + '</div>'
    + '<div class="modal-footer">'
    + '  <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>'
    + '  <button class="btn btn-primary" style="flex:2" onclick="Pages._pbeSaveEditor()">💾 保存</button>'
    + '</div>';
  UI.modal(html);
}

// 同腹兄弟実績の行HTML
function _pbeRenderKinshipRows(records) {
  if (!records || !records.length) {
    return '<div style="font-size:.74rem;color:var(--text3);padding:4px 0">(実績データなし)</div>';
  }
  return records.map(function (r, i) { return _pbeKinshipRowHtml(r, i); }).join('');
}

function _pbeKinshipRowHtml(r, idx) {
  r = r || { metric:'body_size', threshold:'', count:'', unit:'mm', is_top:false, note:'' };
  const metricOpts = Object.keys(PBE_KINSHIP_METRICS).map(function (k) {
    return '<option value="' + k + '"' + (r.metric === k ? ' selected' : '') + '>'
      + PBE_KINSHIP_METRICS[k].label + '</option>';
  }).join('');
  return '<div class="pbe-kin-row" data-idx="' + idx + '" '
    + 'style="display:grid;grid-template-columns:1fr 1fr 1fr 24px;gap:4px;margin-bottom:4px;align-items:center">'
    + '  <select class="input pbe-kin-metric" style="font-size:.74rem;padding:4px">' + metricOpts + '</select>'
    + '  <input type="number" class="input pbe-kin-threshold" placeholder="しきい値" '
    + '         value="' + _pbeEsc(r.threshold != null ? r.threshold : '') + '" style="font-size:.74rem;padding:4px">'
    + '  <input type="text" class="input pbe-kin-count" placeholder="頭数 or 複数" '
    + '         value="' + _pbeEsc(r.count != null ? r.count : (r.note || '')) + '" style="font-size:.74rem;padding:4px">'
    + '  <button type="button" class="btn btn-ghost" style="padding:0;font-size:.9rem;color:var(--text3)" '
    + '          onclick="this.closest(\'.pbe-kin-row\').remove()">×</button>'
    + '</div>';
}

Pages._pbeAddKinshipRow = function () {
  const wrap = document.getElementById('pbe-ed-kinship-rows');
  if (!wrap) return;
  // 「(実績データなし)」を消す
  if (wrap.querySelector('.pbe-kin-row')) {
    // 既に行がある
  } else {
    wrap.innerHTML = '';
  }
  const idx = wrap.querySelectorAll('.pbe-kin-row').length;
  const div = document.createElement('div');
  div.innerHTML = _pbeKinshipRowHtml(null, idx);
  wrap.appendChild(div.firstElementChild);
};

// 編集モーダルから保存
Pages._pbeSaveEditor = async function () {
  const ctx = window.__pbeCurrentEdit || {};
  const parId = ctx.parId;
  // 入力値を回収
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  const bld = {
    common_name:     val('pbe-ed-common_name')     || null,
    species_full:    val('pbe-ed-species_full')    || null,
    origin:          val('pbe-ed-origin')          || null,
    generation:      val('pbe-ed-generation')      || null,
    eclosion_period: val('pbe-ed-eclosion_period') || null,
    body_size_mm:    (function(){ const v = val('pbe-ed-body_size_mm'); const n = parseFloat(v); return isNaN(n) ? null : n; })(),
    paternal_blood:  val('pbe-ed-paternal_blood')  || null,
    maternal_blood:  val('pbe-ed-maternal_blood')  || null,
    feature_notes:   val('pbe-ed-feature_notes')   || null,
    raw_text:        val('pbe-ed-raw_text')        || null,
    kinship_records: [],
  };
  // 同腹兄弟実績を回収
  const rows = document.querySelectorAll('.pbe-kin-row');
  rows.forEach(function (row) {
    const metric    = (row.querySelector('.pbe-kin-metric')    || {}).value || 'body_size';
    const threshold = parseFloat((row.querySelector('.pbe-kin-threshold') || {}).value);
    const countRaw  = (row.querySelector('.pbe-kin-count')     || {}).value || '';
    if (isNaN(threshold)) return;
    const countNum = parseInt(countRaw, 10);
    const isCount = !isNaN(countNum);
    bld.kinship_records.push({
      metric:    metric,
      threshold: threshold,
      count:     isCount ? countNum : null,
      unit:      (PBE_KINSHIP_METRICS[metric] && PBE_KINSHIP_METRICS[metric].unit) || '',
      is_top:    false,
      note:      isCount ? '' : countRaw,
    });
  });

  // [y6.2] 全スクショを source_screenshots に追加
  const imagesArr = ctx.processedImages || [];
  const newShots = imagesArr.map(function (img) {
    return {
      id:                 _pbeUid('shot'),
      uploaded_at:        _pbeNowIso(),
      image_data_url:     img.image_data_url,
      thumbnail_data_url: img.thumbnail_data_url,
      extraction_status:  'done',
      extracted_at:       _pbeNowIso(),
    };
  });

  // 既存レコードに統合
  if (parId) {
    const par = _pbeGetParent(parId);
    const existingShots = (par && par.source_screenshots) || [];
    const patch = {
      bloodline_data:        bld,
      bloodline_updated_at:  _pbeNowIso(),
      source_screenshots:    newShots.length ? existingShots.concat(newShots) : existingShots,
    };
    await _pbePatchParent(parId, patch);
    UI.toast(newShots.length > 1
      ? newShots.length + '枚のスクショと血統情報を保存しました ✅'
      : '血統情報を保存しました ✅', 'success');
  } else {
    // parId 無し (新規登録時) - フォームに反映するだけ
    UI.toast('抽出結果をフォームに反映しました ✅', 'success');
  }

  // フォームに既存値を上書き反映 (parent_v2.js のフォームに値を流し込む)
  _pbeFillForm(bld);

  UI.closeModal();

  // コールバック呼び出し
  if (window.__pbeOnDone) {
    try { window.__pbeOnDone(bld); } catch (_) {}
  }
};

// parent_v2.js のフォームに抽出値を反映
function _pbeFillForm(bld) {
  if (!bld) return;
  function setIf(name, value) {
    const el = document.querySelector('[name="' + name + '"]');
    if (el && value != null && value !== '') {
      // 既存値が空のときのみ上書き (ユーザー入力を尊重)
      if (!el.value || el.value === '') el.value = String(value);
    }
  }
  // 産地・累代・血統原文・サイズ をフォームに反映
  setIf('locality',     bld.origin);
  setIf('generation',   bld.generation);
  setIf('paternal_raw', bld.paternal_blood);
  setIf('maternal_raw', bld.maternal_blood);
  setIf('size_mm',      bld.body_size_mm);
  // 羽化期 (eclosion_period) は parent フォームの eclosion_date と粒度が違うので
  // 月旬表記の場合は反映しない (誤入力防止)
  if (bld.eclosion_period && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(bld.eclosion_period)) {
    setIf('eclosion_date', bld.eclosion_period.replace(/\//g, '-'));
  }
}

// ════════════════════════════════════════════════════════════════
// 系統評価カードを生成 (種親詳細画面・ライン詳細画面で使う)
// ════════════════════════════════════════════════════════════════
function _pbeRenderBloodlineCard(par) {
  if (!par || !par.bloodline_data) return '';
  const b = par.bloodline_data;
  // 同腹兄弟実績を表示形式に整形
  const kinshipHtml = _pbeFormatKinshipDisplay(b.kinship_records || []);
  // 抽出データの主要項目
  const items = [];
  if (b.common_name)     items.push({ label: '種',       value: b.common_name });
  if (b.species_full)    items.push({ label: '学名',     value: b.species_full });
  if (b.origin)          items.push({ label: '産地',     value: b.origin });
  if (b.generation)      items.push({ label: '累代',     value: b.generation });
  if (b.eclosion_period) items.push({ label: '羽化期',   value: b.eclosion_period });
  if (b.body_size_mm)    items.push({ label: '体長',     value: b.body_size_mm + 'mm' });
  if (b.paternal_blood)  items.push({ label: '♂血統',   value: b.paternal_blood });
  if (b.maternal_blood)  items.push({ label: '♀血統',   value: b.maternal_blood });

  const detailRows = items.map(function (it) {
    return '<div style="display:flex;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06)">'
      + '<div style="width:5em;color:var(--text3);font-size:.78rem;flex-shrink:0">' + _pbeEsc(it.label) + '</div>'
      + '<div style="flex:1;font-size:.85rem;font-weight:600;word-break:break-all">' + _pbeEsc(it.value) + '</div>'
      + '</div>';
  }).join('');

  const featureBlock = b.feature_notes
    ? '<div style="margin-top:8px;padding:8px 10px;background:rgba(200,168,75,.08);border-left:3px solid var(--gold);border-radius:4px;font-size:.82rem;line-height:1.55">'
      + '🌟 ' + _pbeEsc(b.feature_notes) + '</div>'
    : '';

  const shotsThumbs = (par.source_screenshots || []).map(function (s) {
    return '<img src="' + s.thumbnail_data_url + '" '
      + 'style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid var(--surface3);cursor:pointer" '
      + 'onclick="Pages._pbeViewScreenshot(\'' + _pbeEsc(par.par_id) + '\',\'' + _pbeEsc(s.id) + '\')">';
  }).join('');

  return '<div class="card" style="background:linear-gradient(135deg,rgba(200,168,75,.04),rgba(200,168,75,.01));border:1px solid rgba(200,168,75,.25)">'
    + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">'
    + '  <span style="font-size:1.05rem;color:var(--gold);font-weight:700">📜 系統評価</span>'
    + '</div>'
    + detailRows
    + featureBlock
    + (kinshipHtml ? '<div style="margin-top:10px"><div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:4px">同腹兄弟・系統実績</div>' + kinshipHtml + '</div>' : '')
    + (shotsThumbs ? '<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">' + shotsThumbs + '</div>' : '')
    + '<div style="display:flex;gap:6px;margin-top:10px">'
    + '  <button class="btn btn-ghost btn-sm" style="flex:1;font-size:.78rem" '
    + '          onclick="Pages._pbeOpenExtractor(\'' + _pbeEsc(par.par_id) + '\')">📷 スクショ追加</button>'
    + '  <button class="btn btn-ghost btn-sm" style="flex:1;font-size:.78rem" '
    + '          onclick="Pages._pbeReopenEditor(\'' + _pbeEsc(par.par_id) + '\')">✏️ 編集</button>'
    + '  <button class="btn btn-ghost btn-sm" style="flex:1;font-size:.78rem" '
    + '          onclick="Pages._pbeExportCsv(\'' + _pbeEsc(par.par_id) + '\')">💾 CSV</button>'
    + '</div>'
    + '</div>';
}

function _pbeFormatKinshipDisplay(records) {
  if (!records || !records.length) return '';
  // metric ごとにグルーピング
  const groups = {};
  records.forEach(function (r) {
    if (!groups[r.metric]) groups[r.metric] = [];
    groups[r.metric].push(r);
  });
  // 大きい順に
  Object.keys(groups).forEach(function (k) {
    groups[k].sort(function (a, b) { return b.threshold - a.threshold; });
  });
  return Object.keys(groups).map(function (metric) {
    const def = PBE_KINSHIP_METRICS[metric] || { label: metric, unit: '' };
    const items = groups[metric].map(function (r) {
      const head  = r.is_top ? '<span style="color:var(--gold);font-weight:700">★筆頭</span> ' : '';
      const cnt   = r.count != null ? (r.count + '頭') : (r.note || '—');
      return '<li style="font-size:.82rem;line-height:1.6;margin-left:1.2em">'
        + head + r.threshold + def.unit + ' up: <b>' + _pbeEsc(cnt) + '</b></li>';
    }).join('');
    return '<div style="margin-bottom:6px">'
      + '<div style="font-size:.74rem;color:var(--text3);font-weight:600">' + def.label + '</div>'
      + '<ul style="list-style:disc;padding-left:0;margin:2px 0">' + items + '</ul>'
      + '</div>';
  }).join('');
}

// 既存データの再編集
Pages._pbeReopenEditor = function (parId) {
  const par = _pbeGetParent(parId);
  if (!par) { UI.toast('種親が見つかりません', 'error'); return; }
  _pbeOpenEditor(parId, par.bloodline_data || {}, null);
};

// スクショ閲覧
Pages._pbeViewScreenshot = function (parId, shotId) {
  const par = _pbeGetParent(parId);
  if (!par) return;
  const shot = (par.source_screenshots || []).find(function (s) { return s.id === shotId; });
  if (!shot) return;
  const html = '<div class="modal-title">📷 スクリーンショット</div>'
    + '<div style="text-align:center;padding:8px">'
    + '  <img src="' + shot.image_data_url + '" style="max-width:100%;max-height:70vh;border-radius:6px">'
    + '  <div style="font-size:.74rem;color:var(--text3);margin-top:6px">アップロード: ' + _pbeEsc(shot.uploaded_at) + '</div>'
    + '</div>'
    + '<div class="modal-footer">'
    + '  <button class="btn btn-ghost" style="flex:1"'
    + '          onclick="Pages._pbeDeleteScreenshot(\'' + _pbeEsc(parId) + '\',\'' + _pbeEsc(shotId) + '\')">🗑 削除</button>'
    + '  <button class="btn btn-primary" style="flex:2" onclick="UI.closeModal()">閉じる</button>'
    + '</div>';
  UI.modal(html);
};

Pages._pbeDeleteScreenshot = async function (parId, shotId) {
  if (!confirm('このスクリーンショットを削除しますか？')) return;
  const par = _pbeGetParent(parId);
  if (!par) return;
  const next = (par.source_screenshots || []).filter(function (s) { return s.id !== shotId; });
  await _pbePatchParent(parId, { source_screenshots: next });
  UI.closeModal();
  UI.toast('削除しました', 'success');
  // 再描画
  if (window.__currentRoute === 'parent-detail') {
    Pages.parentDetail(parId);
  }
};

// CSV エクスポート (1種親分)
Pages._pbeExportCsv = function (parId) {
  const par = _pbeGetParent(parId);
  if (!par || !par.bloodline_data) {
    UI.toast('抽出データがありません', 'error');
    return;
  }
  const b = par.bloodline_data;
  const rows = [
    ['parent_id',    par.par_id || ''],
    ['display_name', par.display_name || ''],
    ['sex',          par.sex || ''],
    ['common_name',  b.common_name || ''],
    ['species_full', b.species_full || ''],
    ['origin',       b.origin || ''],
    ['generation',   b.generation || ''],
    ['eclosion_period', b.eclosion_period || ''],
    ['body_size_mm',    b.body_size_mm || ''],
    ['paternal_blood',  b.paternal_blood || ''],
    ['maternal_blood',  b.maternal_blood || ''],
    ['feature_notes',   b.feature_notes || ''],
  ];
  // 同腹兄弟実績
  (b.kinship_records || []).forEach(function (r, i) {
    const def = PBE_KINSHIP_METRICS[r.metric] || { label: r.metric };
    rows.push([
      'kinship_' + (i+1) + '_metric',  def.label,
    ]);
    rows.push([
      'kinship_' + (i+1) + '_value',
      r.threshold + (r.unit || '') + ' up : ' + (r.count != null ? r.count + '頭' : (r.note || '—')) + (r.is_top ? ' (★筆頭)' : ''),
    ]);
  });
  // CSV形式
  function csvEsc(v) {
    const s = String(v == null ? '' : v);
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const csv = '\ufeff' + rows.map(function (r) { return csvEsc(r[0]) + ',' + csvEsc(r[1]); }).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bloodline_' + (par.parent_display_id || par.par_id) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  UI.toast('CSVをダウンロードしました', 'success');
};

// ════════════════════════════════════════════════════════════════
// グローバル公開
// ════════════════════════════════════════════════════════════════
// 内部関数を Pages 経由で呼べるように
window.Pages = window.Pages || {};
Pages._pbeRenderBloodlineCard = _pbeRenderBloodlineCard;

console.log('[PBE] parent_bloodline_extract.js loaded build=20260426y6.4');
