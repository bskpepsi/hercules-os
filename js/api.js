// ════════════════════════════════════════════════════════════════
// api.js
// 役割: GAS APIへの全通信を担う唯一の窓口。
//       フロントの他のコードはこのファイルのメソッドのみを通してGASと通信する。
//       成功時は data を返し、失敗時は Error をスローする。
//       リトライ・タイムアウト・エラー整形もここで行う。
// ════════════════════════════════════════════════════════════════

'use strict';

window.__API_BUILD = '20260403s';
console.log('[API] ===== api.js LOADED BUILD=' + window.__API_BUILD + ' =====');
var API = (() => {
  console.log('[API] IIFE start - BUILD:', window.__API_BUILD);
  const TIMEOUT_MS = 30000;

  // ── 基底通信 ──────────────────────────────────────────────────
  async function call(action, payload = {}, _retryCount = 0) {
    const url = CONFIG.GAS_URL || localStorage.getItem(CONFIG.LS_KEYS.GAS_URL) || '';
    if (!url) throw new Error('GAS URLが設定されていません。設定画面から入力してください。');

    // GAS URL 診断ログ（action=createT2Session 時は必ず出力）
    if (action === 'createT2Session' || !window.__gasUrlLogged) {
      console.log('[API] GAS_URL (first 80):', url.slice(0, 80));
      console.log('[API] CONFIG.GAS_URL:', (CONFIG.GAS_URL || '').slice(0, 80) || '(unset)');
      window.__gasUrlLogged = true;
    }

    // GASはGETリクエストでCORSを回避する
    const params = new URLSearchParams({
      action,
      payload: JSON.stringify(payload),
    });
    const fullUrl = `${url}?${params.toString()}`;

    // ── 診断ログ（常時出力、通信トラブル切り分け用） ──
    console.log('[API] call start', {
      action,
      urlBase: url.slice(0, 60) + (url.length > 60 ? '...' : ''),
      payloadKeys: Object.keys(payload),
      fullUrlLength: fullUrl.length,
    });

    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(fullUrl, {
        method:   'GET',
        redirect: 'follow',
        signal:   ctrl.signal,
      });
      clearTimeout(tid);

      console.log('[API] response received', { action, status: res.status, ok: res.ok, url: res.url?.slice(0,80) });

      if (!res.ok) throw new Error(`HTTP ${res.status} (action=${action})`);

      const text = await res.text();
      console.log('[API] response text (first 200):', text.slice(0, 200));

      let json;
      try {
        json = JSON.parse(text);
      } catch(_) {
        // GAS が HTML エラーページを返した（GAS内部例外 or デプロイ未更新）
        const preview = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 150).trim();
        console.error('[API] NON-JSON response for action=' + action + ':', preview);
        throw new Error(
          'GASがJSONを返しませんでした。\n' +
          '原因: GAS側で例外が発生したか、Config.gsのデプロイが古い可能性があります。\n' +
          'GASエディタのログで [T2] の出力を確認してください。\n' +
          '詳細: ' + preview
        );
      }

      if (!json.ok) {
        console.error('[API] GAS error for action=' + action + ':', json.error);
        throw new Error(json.error || '不明なGASエラー (action=' + action + ')');
      }

      console.log('[API] call success', { action });
      return json.data;

    } catch (e) {
      clearTimeout(tid);
      if (e.name === 'AbortError') {
        throw new Error('タイムアウト（30秒）。通信環境を確認してください。(action=' + action + ')');
      }
      // Failed to fetch = ネットワーク到達不能 or CORS
      if (e.message === 'Failed to fetch') {
        console.error('[API] Failed to fetch for action=' + action + '. URL base:', url.slice(0, 80));
        // 1回だけ自動リトライ（ネットワーク一時断・GASコールドスタート対策）
        if (_retryCount === 0) {
          console.warn('[API] Retrying in 2s... (action=' + action + ')');
          await new Promise(r => setTimeout(r, 2000));
          return call(action, payload, 1);
        }
        throw new Error(
          '通信失敗\n' +
          'GAS URL: ' + url.slice(0, 60) + '\n' +
          '確認: ①ネットワーク ②設定画面のGAS URL ③GASデプロイの「アクセス: 全員」設定\n' +
          '(action=' + action + ')'
        );
      }
      throw e;
    }
  }

  // ── システム ──────────────────────────────────────────────────
  const system = {
    init:       ()        => call('init'),
    getAllData:  ()        => call('getAllData'),
    resetAllData:()        => call('resetAllData'),
    getSettings:()        => call('getSettings'),
    updateSetting:(key,v) => call('updateSetting', { key, value: v }),
  };

  // ── ライン ────────────────────────────────────────────────────
  const line = {
    create: (d)  => call('createLine', d),
    list:   (f)  => call('getLines',   f || {}),
    get:    (id) => call('getLine',    { line_id: id }),
    update: (d)  => call('updateLine', d),
  };

  // ── ロット ────────────────────────────────────────────────────
  const lot = {
    create:       (d)  => call('createLot',        d),
    createBulk:   (d)  => call('createLotBulk',    d),   // { line_id, stage, lots:[{count,...}] }
    list:         (f)  => call('getLots',           f || {}),
    get:          (id) => call('getLot',            { lot_id: id }),
    update:       (d)  => call('updateLot',         d),
    split:        (d)  => call('splitLot',          d),  // { lot_id, split_counts:[n,n] }
    individualize:(d)  => call('individualizeLot',  d),  // { lot_id, count, stage }
  };

  // ── 個体 ──────────────────────────────────────────────────────
  const individual = {
    create:          (d)  => call('createIndividual',     d),
    createBulk:      (d)  => call('createIndividualBulk', d),  // { line_id, individuals:[...] }
    list:            (f)  => call('getIndividuals',   f || {}),
    get:             (id) => call('getIndividual',    { ind_id: id }),
    update:          (d)  => call('updateIndividual', d),
    promoteToParent: (d)  => call('promoteToParent',  d),
    // 論理削除: new_status='dead'|'sold'|'reserved', reason=任意
    changeStatus:    (id, newStatus, reason) =>
      call('deleteIndividual', { ind_id: id, new_status: newStatus, reason }),
  };

  // ── 成長記録 ──────────────────────────────────────────────────
  // getGrowthRecords は target_type + target_id を必ず両方指定する
  const growth = {
    create: (d)          => call('createGrowthRecord', d),
    list:   (type, id)   => call('getGrowthRecords', { target_type: type, target_id: id }),
    update: (d)          => call('updateGrowthRecord', d),
  };

  // ── 種親 ──────────────────────────────────────────────────────
  const parent = {
    create:          (d)  => call('createParent',         d),
    list:            (f)  => call('getParents',            f || {}),
    get:             (id) => call('getParent',             { par_id: id }),
    update:          (d)  => call('updateParent',          d),
    revokePromotion: (d)  => call('revokeParentPromotion', d),
  };

  // ── 血統 ──────────────────────────────────────────────────────
  const bloodline = {
    create: (d)  => call('createBloodline', d),
    list:   ()   => call('getBloodlines'),
    get:    (id) => call('getBloodline',    { bloodline_id: id }),
    update: (d)  => call('updateBloodline', d),
  };

  // ── 産卵セット ────────────────────────────────────────────────
  const pairing = {
    create:    (d) => call('createPairing', d),
    list:      (f) => call('getPairings',   f || {}),
    get:       (id)=> call('getPairing',    { set_id: id }),
    update:    (d) => call('updatePairing', d),
    getWithEggs:   (d) => call('getPairingWithEggs', d),
    addEgg:        (d) => call('addEggRecord',    d),
    getEggRecords: (d) => call('getEggRecords',  d),
    updateEgg:     (d) => call('updateEggRecord', d),
    deleteEgg:     (d) => call('deleteEggRecord', d),
  };

  // ── ラベル ────────────────────────────────────────────────────
  const label = {
    // type: 'IND'|'LOT'|'SET', id: 内部ID, labelType: 'larva'等
    generate: (type, id, labelType) =>
      call('generateLabel', { target_type: type, target_id: id, label_type: labelType }),
    history: (id) => call('getLabelHistory', { target_id: id }),
  };

  // ── Drive ─────────────────────────────────────────────────────
  const drive = {
    // base64アップロード: { base64, mime_type, filename, line_display_id, folder_type }
    uploadPhoto:    (d) => call('uploadPhoto',       d),
    getFolderUrl:   (lineDisplayId, folderType) =>
      call('getDriveFolderUrl', { line_display_id: lineDisplayId, folder_type: folderType }),
  };

  // ── Gemini AI（直接呼び出し） ──────────────────────────────────
  const gemini = {
    // 画像解析（ラベル読み取り or 体重計読み取り）
    analyzeImage: async (base64, mimeType, promptType) => {
      const key = CONFIG.GEMINI_KEY || localStorage.getItem(CONFIG.LS_KEYS.GEMINI_KEY) || '';
      if (!key) throw new Error('Gemini APIキーが未設定です。');

      const prompt = promptType === 'label' ? GEMINI_PROMPTS.label : GEMINI_PROMPTS.scale;
      const ctrl   = new AbortController();
      const tid    = setTimeout(() => ctrl.abort(), 40000);

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            signal:  ctrl.signal,
            body: JSON.stringify({
              contents: [{ parts: [
                { inline_data: { mime_type: mimeType, data: base64 } },
                { text: prompt }
              ]}],
              generationConfig: { temperature: 0.1, maxOutputTokens: 1200 }
            })
          }
        );
        clearTimeout(tid);
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(`Gemini HTTP ${res.status}: ${e.error?.message || ''}`);
        }
        const d = await res.json();
        const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const m   = txt.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('AIからJSONが返りませんでした');
        return JSON.parse(m[0]);
      } catch (e) {
        clearTimeout(tid);
        if (e.name === 'AbortError') throw new Error('AI解析タイムアウト（40秒）');
        throw e;
      }
    }
  };

  // ── バックアップ ──────────────────────────────────────────────
  const backup = {
    run:           (note) => call('runBackup',              { note: note || '' }),
    list:          (f)    => call('getBackupList',          f || {}),
    getSettings:   ()     => call('getBackupSettings'),
    initTriggers:  ()     => call('initBackupTriggers'),
    removeTriggers:()     => call('removeBackupTriggers'),
    getTriggerStatus: ()  => call('getBackupTriggerStatus'),
  };

  // ── QRスキャン解決 ────────────────────────────────────────────
  // QR文字列 → entity取得 + missing判定を1回で返す
  const scan = {
    /** QR文字列を送り entity + missing を返す
     *  qrText: "LOT:LOT-xxxxx" | "IND:IND-xxxxx" | "SET:SET-xxxxx" */
    resolve:         (qrText) => call('resolveQR',       { qr_text: qrText }),
    /** ロット差分更新（hatch_date / count / sex_hint / size_category） */
    updateLotFields: (d)      => call('updateLotFields', d),
    /** 個体差分更新（sex など） */
    updateIndFields: (d)      => call('updateIndividual', d),
    /** 産卵セット差分更新 */
    updateSetFields: (d)      => call('updatePairing',   d),
  };

  // ── Phase2 拡張API ──────────────────────────────────────────
  const phase2 = {
    // 血統
    extractTags:      (raw)      => call('extractBloodlineTags', { bloodline_raw: raw }),
    createBloodline:  (d)        => call('createBloodlineV2', d),
    // 種親V2
    createParent:     (d)        => call('createParentV2', d),
    sellIndividual:   (d)        => call('sellIndividual', d),
    analyzeLineStats: (d)        => call('analyzeLineStats', d),
    updateParent:     (d)        => call('updateParentV2', d),
    getPairingReady:  ()         => call('getPairingReadyStatus', {}),
    // ペアリング履歴
    createPairingHistory: (d)    => call('createPairingHistory', d),
    updatePairingHistory: (d)    => call('updatePairingHistory', d),
    getPairingHistories:  (d)    => call('getPairingHistories', d || {}),
    getMalePairingStats:  (mid)  => call('getMalePairingStats', { male_parent_id: mid }),
    // ラインV2
    createLine:       (d)        => call('createLineV2', d),
    // 分析
    getLineAnalysis:  ()         => call('getLineAnalysis', {}),
    getMotherRanking: ()         => call('getMotherRanking', {}),
    getHeatmap:       ()         => call('getBloodlineHeatmap', {}),
    getDashboardExt:  ()         => call('getDashboardExtended', {}),
  };

    // ── Phase A: データ安定化 ─────────────────────────────────────
  const integrity = {
    check:             ()  => call('checkDataIntegrity', {}),
    recalculateLot:    (d) => call('recalculateLot',    d),
    recalculateAll:    ()  => call('recalculateAllLots', {}),
    getLotEvents:      (d) => call('getLotEvents',       d || {}),
  };

  // ── 販売履歴 ─────────────────────────────────────────────────
  const sale = {
    list: (f)  => call('getSaleHists', f || {}),
    get:  (id) => call('getSaleHist',  { hist_id: id }),
  };

  // ── T1移行セッション ─────────────────────────────────────────
  const t1 = {
    reserveDisplayIds: (d) => call('reserveDisplayIds',   d),
    createSession:     (d) => call('createT1Session',     d),
  };

  // ── T2移行セッション ─────────────────────────────────────────
  const t2 = {
    createSession: (d) => call('createT2Session', d),
  };
  console.log('[API] t1 ready');

console.log('[API] return object ready');
return { system, line, lot, individual, growth, parent, bloodline, pairing, label, drive, gemini, backup, scan, phase2, integrity, t1, t2, sale };
})();
window.API = API; // グローバル確保（const はwindowに乗らない環境対策）
console.log('[API] window.API assigned', !!window.API);

// ── Gemini プロンプト ──────────────────────────────────────────
const GEMINI_PROMPTS = {
  label: `この画像はヘラクレスオオカブト飼育容器の手書きラベルです。
以下をJSONのみで返してください（コードブロック不要）:
{
  "individual_id": "個体IDや番号（文字列）",
  "sex": "♂ または ♀ または 不明",
  "hatch_year": 孵化年(整数またはnull),
  "hatch_month": 孵化月(整数またはnull),
  "hatch_period": "上 中 下 確 のいずれか",
  "hatch_day": 確定日(整数またはnull),
  "weight_history": [{"date":"MM/DD","weight":整数,"mat":"T0等"}],
  "current_weight": 最新体重(整数またはnull),
  "current_mat": "T0/T1/T2A/T2B/T3 のいずれか",
  "line": "ライン名やメモ欄の文字列"
}`,

  scale: `この画像はヘラクレスオオカブト幼虫を体重計に乗せた写真です。
体重計のデジタル数字を正確に読み取り、幼虫外観も分析してください。
JSONのみで返してください（コードブロック不要）:
{
  "weight": 体重計の数値(整数g),
  "larva_analysis": {
    "color": "体色（例：黄白色）",
    "firmness": "張り（例：良好）",
    "estimated_stage": "L2/L3前期/L3中期/L3後期/前蛹",
    "health": "良好/注意/要観察",
    "comment": "観察コメント40-60文字"
  }
}`
};

// ── 画像圧縮ユーティリティ ─────────────────────────────────────
async function compressImageToBase64(file, maxPx = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) {
          const s = Math.min(maxPx / w, maxPx / h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL('image/jpeg', quality);
        resolve({
          base64:    dataUrl.split(',')[1],
          mimeType:  'image/jpeg',
          dataUrl,
        });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
