// ════════════════════════════════════════════════════════════════
// settings.js
// 役割: アプリ全体の設定を管理する画面。
//       GAS URL・Gemini APIキー・選別基準・ステージ目安・
//       ブランドコード・ギネス閾値などを設定・保存する。
//       設定はlocalStorageに永続化し、GASの設定シートにも同期する。
// ════════════════════════════════════════════════════════════════
'use strict';

Pages.settings = function () {
  const main = document.getElementById('main');
  _renderSettings(main);

  // 描画後に非同期でバックアップ情報を取得・更新
  // （GASへの問い合わせは画面表示をブロックしない）
  if (Store.getSetting('gas_url')) {
    API.backup.getSettings().then(res => {
      if (!res) return;
      // GASキー → ローカルstoreキー のマッピング
      const keyMap = {
        last_success_at:      'backup_last_success_at',
        last_fail_at:         'backup_last_fail_at',
        last_backup_type:     'backup_last_type',
        last_backup_url:      'backup_last_url',
        backup_folder_url:    'backup_folder_url',
        auto_daily_enabled:   'backup_auto_daily',
        auto_weekly_enabled:  'backup_auto_weekly',
        auto_monthly_enabled: 'backup_auto_monthly',
      };
      Object.entries(keyMap).forEach(([gasKey, localKey]) => {
        if (res[gasKey] !== undefined) Store.setSetting(localKey, String(res[gasKey]));
      });
    }).catch(() => { /* 未接続でも無視 */ });

    // 履歴も非同期でロード（100ms遅延でDOM確実確保）
    setTimeout(() => Pages._bkLoadHistory(), 100);
  } else {
    // GAS未設定時は「未実行」メッセージに差し替え
    setTimeout(() => {
      const el = document.getElementById('bk-history-list');
      if (el) el.innerHTML =
        '<div style="font-size:.75rem;color:var(--text3);text-align:center;padding:8px">' +
        'GAS URLを設定すると履歴が表示されます</div>';
    }, 50);
  }
};

function _renderSettings(main) {
  const gasUrl    = Store.getSetting('gas_url')    || '';
  const geminiKey = Store.getSetting('gemini_key') || '';
  const brand     = Store.getSetting('brand_code') || 'HM';
  const guinW     = Store.getSetting('guinness_weight_g') || '170';
  const targetMm  = Store.getSetting('target_size_mm')    || '200';
  const largeMm   = Store.getSetting('large_male_threshold_mm') || '180';
  const lastSync  = localStorage.getItem(CONFIG.LS_KEYS.LAST_SYNC);
  const fmtSync   = lastSync
    ? new Date(lastSync).toLocaleString('ja-JP', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '未同期';

  // バックアップ関連（localStorageから即時読み込み。GASからの取得は非同期で後から上書き）
  const bkLastSuccessAt = Store.getSetting('backup_last_success_at') || '';
  const bkLastFailAt    = Store.getSetting('backup_last_fail_at')    || '';
  const bkLastType      = Store.getSetting('backup_last_type')       || '';
  const bkLastUrl       = Store.getSetting('backup_last_url')        || '';
  const bkAutoD         = Store.getSetting('backup_auto_daily')   !== 'false';
  const bkAutoW         = Store.getSetting('backup_auto_weekly')  !== 'false';
  const bkAutoM         = Store.getSetting('backup_auto_monthly') !== 'false';
  const bkFolderUrl     = Store.getSetting('backup_folder_url')   || '';

  main.innerHTML = `
    ${UI.header('設定', {})}
    <div class="page-body">

      <!-- GAS接続設定 -->
      <div class="card">
        <div class="card-title">🔗 GAS接続設定</div>
        <div class="form-section">
          ${UI.field('GAS デプロイURL',
            `<div style="display:flex;gap:6px">
               <input id="set-gas-url" class="input" type="url" value="${gasUrl}"
                 placeholder="https://script.google.com/macros/s/..." style="flex:1">
               <button class="btn btn-sm btn-ghost" onclick="Pages._setToggleGasUrl()">👁</button>
             </div>
             <div style="font-size:.7rem;color:var(--text3);margin-top:4px">
               Apps Script → デプロイ → ウェブアプリのURLを貼り付けてください
             </div>`)}
          <button class="btn btn-primary btn-full"
            onclick="Pages._setGasUrl()">GAS URLを保存・接続テスト</button>
          <div id="gas-test-result"></div>
        </div>
      </div>

      <!-- Gemini設定 -->
      <div class="card">
        <div class="card-title">🤖 Gemini AI設定</div>
        <div class="form-section">
          ${UI.field('Gemini APIキー',
            `<div style="display:flex;gap:6px">
               <input id="set-gemini-key" class="input" type="password" value="${geminiKey}"
                 placeholder="AIzaSy..." style="flex:1">
               <button class="btn btn-sm btn-ghost" onclick="Pages._setToggleGemini()">👁</button>
             </div>
             <div style="font-size:.7rem;color:var(--text3);margin-top:4px">
               Google AI Studio (aistudio.google.com) で取得できます。<br>
               設定すると体重計・ラベルの写真をAIが自動読み取りします。
             </div>`)}
          <button class="btn btn-ghost btn-full" onclick="Pages._setGeminiKey()">
            Gemini APIキーを保存
          </button>
        </div>
      </div>

      <!-- ブランド・閾値設定 -->
      <div class="card">
        <div class="card-title">⚙️ ブランド・閾値</div>
        <div class="form-section">
          <div class="form-row-2">
            ${UI.field('ブランドコード',
              `<input id="set-brand" class="input" type="text" value="${brand}"
                placeholder="例: HM" maxlength="4">`)}
            ${UI.field('ギネス挑戦体重(g)',
              `<input id="set-guinw" class="input" type="number" value="${guinW}"
                placeholder="例: 170">`)}
          </div>
          <div class="form-row-2">
            ${UI.field('目標サイズ(mm)',
              `<input id="set-tmm" class="input" type="number" value="${targetMm}"
                placeholder="例: 200">`)}
            ${UI.field('大型♂閾値(mm)',
              `<input id="set-lmm" class="input" type="number" value="${largeMm}"
                placeholder="例: 180">`)}
          </div>
          <button class="btn btn-ghost btn-full" onclick="Pages._setThresholds()">
            閾値を保存
          </button>
        </div>
      </div>

      <!-- ステージ目安日齢 -->
      <div class="card">
        <div class="card-title">📅 ステージ目安日齢（デフォルト値）</div>
        <div style="font-size:.78rem;color:var(--text2);margin-bottom:8px">
          孵化日からのおおよその日齢でステージを自動判定します。<br>
          変更はGASの設定シートから行ってください。
        </div>
        <div style="font-size:.8rem">
          ${DEFAULT_STAGE_AGE_RULES.map(r =>
            `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
              <span style="min-width:80px;color:var(--text3)">
                ${r.minDays}〜${r.maxDays === 9999 ? '∞' : r.maxDays}日
              </span>
              <span style="color:${stageColor(r.code)};font-weight:600">${r.label}</span>
            </div>`
          ).join('')}
        </div>
      </div>

      <!-- データ管理 -->
      <div class="card">
        <div class="card-title">🗄️ データ管理</div>
        <div class="form-section">
          <div style="font-size:.78rem;color:var(--text3)">
            最終同期: ${fmtSync}
          </div>
          <button class="btn btn-primary btn-full" onclick="Pages._setSync()">
            🔄 全データを同期
          </button>
          <button class="btn btn-ghost btn-full" onclick="Pages._setClearCache()">
            🗑️ ローカルキャッシュを削除
          </button>
        </div>
      </div>

      <!-- Phase A: データ安定化 -->
      <div class="card" style="border-color:rgba(91,168,232,.25)">
        <div class="card-title" style="color:var(--blue)">🔍 データ整合性</div>
        <div style="font-size:.78rem;color:var(--text3);margin-bottom:10px;line-height:1.6">
          ロットの <code>line_id</code> / <code>count</code> / <code>attrition_total</code>
          の不整合を検出・修正します。
        </div>
        <div class="form-section" style="gap:8px">
          <button class="btn btn-ghost btn-full" id="integrity-check-btn"
            onclick="Pages._integrityCheck()">
            🔍 整合性チェック
          </button>
          <button class="btn btn-ghost btn-full" id="recalc-all-btn"
            onclick="Pages._recalcAll()">
            ♻️ 全ロット再計算
          </button>
        </div>
        <div id="integrity-result" style="margin-top:8px"></div>
      </div>

      <!-- GAS初期化 -->
      <div class="card" style="border-color:rgba(224,80,80,.2)">
        <div class="card-title" style="color:var(--red)">🚨 GASシステム初期化</div>
        <div style="font-size:.78rem;color:var(--text2);margin-bottom:10px">
          <b>初回セットアップ時のみ実行してください。</b><br>
          スプレッドシートに全15シートを作成します。<br>
          既存シートがある場合はスキップされます。
        </div>
        <button class="btn btn-danger btn-full" onclick="Pages._setInit()">
          🗂️ スプレッドシート初期化（init）
        </button>
      </div>

      <!-- 開発用：全データリセット -->
      <div class="card" style="border:2px solid var(--red,#e05050)">
        <div class="card-title" style="color:var(--red,#e05050)">⚠️ 開発・検証用</div>
        <div style="font-size:.82rem;color:var(--text2);margin-bottom:10px">
          ヘッダー行と設定は残し、全データ行だけを削除します。<br>
          テスト運用中のみ使用してください。
        </div>
        <div style="font-size:.75rem;color:var(--text3);margin-bottom:10px">
          対象：ライン / ロット / 個体 / 種親 / 血統 / 産卵セット / 採卵記録 / 成長記録 / ラベル履歴 他
        </div>
        <button class="btn btn-danger btn-full" onclick="window.Pages._devReset ? window.Pages._devReset() : alert('関数が見つかりません。ページをリロードしてください。')">
          🗑️ 全データリセット（テスト用）
        </button>
      </div>

      <!-- Phase2: 後食・ペアリング設定 -->
      <div class="card">
        <div class="card-title">🍽️ 後食・ペアリング設定</div>
        <div class="form-group">
          <label class="form-label">♂後食待機日数（日）</label>
          <input id="set-male-wait" class="form-input" type="number" min="1" max="90"
                 value="${Store.getSetting('male_pairing_wait_days') || '14'}">
          <label class="form-label" style="margin-top:12px">♀後食待機日数（日）</label>
          <input id="set-female-wait" class="form-input" type="number" min="1" max="90"
                 value="${Store.getSetting('female_pairing_wait_days') || '14'}">
          <label class="form-label" style="margin-top:12px">♂ペアリング間隔最小日数（日）</label>
          <input id="set-pairing-interval" class="form-input" type="number" min="1" max="60"
                 value="${Store.getSetting('male_pairing_interval_min_days') || '7'}">
          <div class="form-hint">この日数未満でペアリングすると警告が表示されます</div>

          <label class="form-label" style="margin-top:16px">🥚 産卵セット交換間隔（日）</label>
          <input id="set-exchange-days" class="form-input" type="number" min="1" max="30"
                 value="${Store.getSetting('pairing_set_exchange_days') || '7'}">
          <div class="form-hint">セット開始からこの日数後に交換リマインドを表示します（初期値: 7日）</div>
          <button class="btn btn-primary btn-full" style="margin-top:12px"
                  onclick="Pages._savePairingSettings()">後食・ペアリング設定を保存</button>
        </div>
      </div>

      <!-- バックアップ管理 -->
      <div class="card" style="border-color:rgba(200,168,75,.25)">
        <div class="card-title" style="color:var(--gold)">🗄️ バックアップ管理</div>

        <!-- 最終バックアップ情報（成功/失敗を分けて表示） -->
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <span style="color:var(--text3);font-size:.7rem;min-width:60px">最終成功</span>
            <span style="flex:1;color:var(--green)">
              ${bkLastSuccessAt
                ? `${bkLastSuccessAt}
                   <span style="color:var(--text3);font-size:.7rem;margin-left:4px">
                     (${BACKUP_DISPLAY.type_labels[bkLastType] || bkLastType || '—'})
                   </span>`
                : '<span style="color:var(--text3)">未実行</span>'}
            </span>
            ${bkLastUrl
              ? `<a href="${bkLastUrl}" target="_blank"
                  class="btn btn-ghost btn-sm" style="white-space:nowrap">📁 開く</a>`
              : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="color:var(--text3);font-size:.7rem;min-width:60px">最終失敗</span>
            <span style="flex:1;${bkLastFailAt ? 'color:var(--red)' : 'color:var(--text3)'}">
              ${bkLastFailAt || 'なし'}
            </span>
          </div>
        </div>

        <!-- 手動バックアップ -->
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <input id="bk-memo" class="input" type="text" maxlength="60"
            placeholder="メモ（任意）例: Phase1完成前"
            style="margin-bottom:8px;font-size:.82rem">
          <button class="btn btn-gold btn-full" id="bk-run-btn"
            onclick="Pages._bkRunManual()">
            ✋ 今すぐバックアップ
          </button>
          <div id="bk-run-result" style="margin-top:6px;font-size:.78rem"></div>
        </div>

        <!-- 自動バックアップ ON/OFF -->
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:.8rem;font-weight:600;color:var(--text2);margin-bottom:8px">
            自動バックアップ設定
          </div>
          ${[
            { key:'backup_auto_daily',   label:'📅 毎日 AM3:00',      enabled: bkAutoD },
            { key:'backup_auto_weekly',  label:'📆 毎週日曜 AM3:00',  enabled: bkAutoW },
            { key:'backup_auto_monthly', label:'🗓️ 毎月1日 AM3:00', enabled: bkAutoM },
          ].map(t => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 0">
              <span style="flex:1;font-size:.82rem;color:var(--text2)">${t.label}</span>
              <button class="btn btn-sm ${t.enabled ? 'btn-primary' : 'btn-ghost'}"
                onclick="Pages._bkToggleAuto('${t.key}', ${t.enabled})">
                ${t.enabled ? 'ON' : 'OFF'}
              </button>
            </div>`).join('')}
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="btn btn-ghost" style="flex:1;font-size:.78rem"
              onclick="Pages._bkInitTriggers()">
              ⚡ トリガーをGASに登録
            </button>
            ${bkFolderUrl
              ? `<a href="${bkFolderUrl}" target="_blank" class="btn btn-ghost btn-sm">📁 Driveを開く</a>`
              : ''}
          </div>
          <div style="font-size:.7rem;color:var(--text3);margin-top:6px">
            ※ トリガー登録は初回1回のみ実行してください。<br>
            　GAS側でスクリプトの実行権限を承認する画面が出ます。
          </div>
        </div>

        <!-- バックアップ履歴（直近5件） -->
        <div style="padding-top:10px">
          <div style="font-size:.8rem;font-weight:600;color:var(--text2);margin-bottom:6px">
            バックアップ履歴
          </div>
          <div id="bk-history-list">
            <div style="font-size:.75rem;color:var(--text3);text-align:center;padding:8px">
              読み込み中...
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:6px;width:100%;font-size:.75rem"
            onclick="Pages._bkLoadHistory()">
            🔄 履歴を更新
          </button>
        </div>
      </div>

      <!-- バージョン情報 -->
      <div style="text-align:center;font-size:.7rem;color:var(--text3);padding:8px 0">
        HerculesOS v${CONFIG.APP_VERSION} / Phase ${CONFIG.PHASE}<br>
        GAS連携モード
      </div>

    </div>`;
}

// ── GAS URL 保存・テスト ─────────────────────────────────────────
Pages._setGasUrl = async function () {
  var url = (document.getElementById('set-gas-url') || {}).value;
  url = url ? url.trim() : '';
  if (!url) { UI.toast('URLを入力してください', 'error'); return; }

  var resultEl = document.getElementById('gas-test-result');

  console.log('[SETTINGS] ===== connect test start =====');
  console.log('[SETTINGS] ===== connect test start =====');
  console.log('[SETTINGS] __INDEX_BUILD :', window.__INDEX_BUILD || '(not set)');
  console.log('[SETTINGS] __API_BUILD   :', window.__API_BUILD   || '(not set)');
  console.log('[SETTINGS] input GAS_URL :', url);

  Store.setSetting('gas_url', url);
  CONFIG.GAS_URL = url;
  localStorage.setItem(CONFIG.LS_KEYS.GAS_URL, url);
  console.log('[SETTINGS] saved GAS_URL:', CONFIG.GAS_URL);

  resultEl.innerHTML = '<div style="font-size:.8rem;color:var(--text3);margin-top:8px">'
    + '⏳ 接続テスト中... <span style="font-size:.7rem">(' + url.slice(0, 50) + ')</span></div>';

  if (!url.includes('/exec')) {
    console.warn('[SETTINGS] URL missing /exec:', url);
    resultEl.innerHTML = '<div style="background:rgba(224,144,64,.1);border:1px solid rgba(224,144,64,.4);'
      + 'border-radius:8px;padding:10px;margin-top:8px;font-size:.8rem">'
      + '<b style="color:var(--amber)">⚠️ URL に /exec がありません</b><br>'
      + '<span>GASウェブアプリURLは <code>.../exec</code> の形式です。</span></div>';
    return;
  }

  try {
    var testUrl = url + '?action=getSettings&payload={}';
    console.log('[SETTINGS] raw fetch URL:', testUrl);

    var fetchRes = await fetch(testUrl, { method: 'GET', redirect: 'follow' });
    console.log('[SETTINGS] response status:', fetchRes.status, 'ok:', fetchRes.ok);
    var rawText = await fetchRes.text();
    console.log('[SETTINGS] response text (first 300):', rawText.slice(0, 300));

    var json;
    try { json = JSON.parse(rawText); } catch(_e) {
      var preview = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120).trim();
      console.error('[SETTINGS] non-JSON response:', preview);
      resultEl.innerHTML = '<div style="background:rgba(224,80,80,.08);border:1px solid rgba(224,80,80,.3);'
        + 'border-radius:8px;padding:12px;margin-top:8px;font-size:.82rem">'
        + '<b style="color:var(--red,#e05050)">❌ GASがHTMLを返しました（JSON未返却）</b>'
        + '<ul style="margin:8px 0 0 18px;font-size:.78rem;line-height:1.8">'
        + '<li>GASデプロイの「アクセス: <b>全員</b>」を確認</li>'
        + '<li>Config.gs / Code.gs を最新版で保存・再デプロイ</li>'
        + '<li>デプロイを「新バージョン」で更新したか確認</li>'
        + '</ul>'
        + '<div style="margin-top:6px;font-size:.68rem;color:var(--text3)">受信内容: ' + preview + '</div>'
        + '</div>';
      return;
    }

    if (!json.ok) {
      console.error('[SETTINGS] GAS ok:false:', json.error);
      resultEl.innerHTML = '<div style="background:rgba(224,80,80,.08);border:1px solid rgba(224,80,80,.3);'
        + 'border-radius:8px;padding:12px;margin-top:8px;font-size:.82rem">'
        + '<b style="color:var(--red,#e05050)">❌ GASエラー: ' + (json.error || '不明') + '</b>'
        + '<div style="font-size:.75rem;color:var(--text3);margin-top:4px">GASエディタのログを確認してください。</div>'
        + '</div>';
      return;
    }

    console.log('[SETTINGS] SUCCESS:', json.data);
    resultEl.innerHTML = '<div style="background:rgba(76,175,120,.08);border:1px solid rgba(76,175,120,.4);'
      + 'border-radius:8px;padding:12px;margin-top:8px;font-size:.82rem">'
      + '<b style="color:var(--green)">✅ 接続成功！GAS URLを保存しました。</b>'
      + '<div style="font-size:.72rem;color:var(--text3);margin-top:4px">URL: ' + url.slice(0, 60) + '</div>'
      + '</div>';

    var res = json.data;
    if (res && typeof res === 'object') {
      Object.keys(res).forEach(function(k) { Store.setSetting(k, res[k]); });
    }
    UI.toast('GAS URLを保存しました ✅', 'success');
    setTimeout(function() { if (typeof syncAll === 'function') syncAll(false); }, 500);

  } catch (e) {
    var isFailed = e.message.indexOf('Failed to fetch') !== -1;
    console.error('[SETTINGS] fetch error:', e.message);
    resultEl.innerHTML = '<div style="background:rgba(224,80,80,.08);border:1px solid rgba(224,80,80,.3);'
      + 'border-radius:8px;padding:12px;margin-top:8px;font-size:.82rem">'
      + '<b style="color:var(--red,#e05050)">❌ '
      + (isFailed ? '通信失敗 (Failed to fetch)' : '接続失敗: ' + e.message) + '</b>'
      + '<ol style="margin:8px 0 0 18px;font-size:.78rem;line-height:1.9">'
      + '<li>URLが <code>.../exec</code> の形式か確認</li>'
      + '<li>GASデプロイの「アクセス: <b>全員</b>」を確認</li>'
      + '<li>同URLをブラウザで直接開けるか確認（JSONが表示されるはず）</li>'
      + '<li>GASを「新バージョン」で再デプロイ</li>'
      + '</ol>'
      + '<div style="margin-top:8px;font-size:.68rem;color:var(--text3)">試したURL: ' + url.slice(0, 80) + '</div>'
      + '</div>';
  }
};

Pages._setToggleGasUrl = function () {
  const el = document.getElementById('set-gas-url');
  if (el) el.type = el.type === 'password' ? 'url' : 'password';
};

// ── Gemini Key 保存 ───────────────────────────────────────────────
Pages._setGeminiKey = function () {
  const key = document.getElementById('set-gemini-key')?.value?.trim();
  if (!key) { UI.toast('APIキーを入力してください', 'error'); return; }
  Store.setSetting('gemini_key', key);
  CONFIG.GEMINI_KEY = key;
  localStorage.setItem(CONFIG.LS_KEYS.GEMINI_KEY, key);
  UI.toast('Gemini APIキーを保存しました', 'success');
};

Pages._setToggleGemini = function () {
  const el = document.getElementById('set-gemini-key');
  if (el) el.type = el.type === 'password' ? 'text' : 'password';
};

// ── 閾値保存 ─────────────────────────────────────────────────────
Pages._setThresholds = async function () {
  const brand  = document.getElementById('set-brand')?.value?.trim()  || 'HM';
  const guinW  = document.getElementById('set-guinw')?.value          || '170';
  const tMm    = document.getElementById('set-tmm')?.value            || '200';
  const lMm    = document.getElementById('set-lmm')?.value            || '180';

  Store.setSetting('brand_code',               brand);
  Store.setSetting('guinness_weight_g',        guinW);
  Store.setSetting('target_size_mm',           tMm);
  Store.setSetting('large_male_threshold_mm',  lMm);

  // GASの設定シートにも反映
  const gasUrl = Store.getSetting('gas_url');
  if (gasUrl) {
    try {
      await Promise.all([
        API.system.updateSetting('brand_code',              brand),
        API.system.updateSetting('guinness_weight_g',       guinW),
        API.system.updateSetting('target_size_mm',          tMm),
        API.system.updateSetting('large_male_threshold_mm', lMm),
      ]);
      UI.toast('閾値を保存しました（GASにも反映済み）', 'success');
    } catch (e) {
      UI.toast('ローカルに保存しました（GAS反映失敗: ' + e.message + '）', 'info');
    }
  } else {
    UI.toast('ローカルに保存しました', 'success');
  }
};

// ── データ同期 ────────────────────────────────────────────────────
Pages._setSync = async function () {
  await syncAll(false);
  _renderSettings(document.getElementById('main'));
};

// ── キャッシュクリア ─────────────────────────────────────────────
Pages._setClearCache = function () {
  if (!UI.confirm('ローカルキャッシュを削除しますか？\nGAS URLとAPIキーは保持されます。')) return;
  Store.clearCache();
  UI.toast('キャッシュを削除しました。次回起動時にGASから再取得します。', 'info', 4000);
  _renderSettings(document.getElementById('main'));
};

// ── GAS init 実行 ────────────────────────────────────────────────
Pages._setInit = async function () {
  if (!UI.confirm('スプレッドシートに全15シートを作成します。よろしいですか？')) return;
  try {
    const res = await apiCall(() => API.system.init(), '初期化が完了しました！');
    UI.toast(`シート作成: ${res.created?.length || 0}件 / スキップ: ${res.skipped?.length || 0}件`, 'success', 5000);
  } catch (e) {}
};

// ── 開発用：全データリセット ────────────────────────────────────
Pages._devReset = async function () {
  if (!window.confirm(
    '⚠️ 全データリセット（テスト用）\n\n本当に全データを削除しますか？\n\n' +
    '残るもの：ヘッダー行 / 設定\n' +
    '削除されるもの：ライン / ロット / 個体 / 種親 / 血統 / 産卵セット / 採卵記録 / 成長記録 他\n\n' +
    'この操作は取り消せません。')) return;

  if (!window.confirm('最終確認：本当に削除してよいですか？')) return;

  const btn = document.querySelector('[onclick*="_devReset"]');
  if (btn) { btn.disabled = true; btn.textContent = 'リセット中…'; }

  try {
    const res = await API.system.resetAllData();
    // ローカルキャッシュクリア
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('hercules')) localStorage.removeItem(k);
      });
      Store.clearCache();
    } catch(e) {}

    window.alert('✅ リセット完了\n\n' + (res.results || []).join('\n'));
    location.reload();
  } catch(e) {
    window.alert('❌ リセット失敗:\n' + e.message + '\n\nGASを再デプロイして再試行してください。');
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ 全データリセット（テスト用）'; }
  }
};

// ── バックアップ: 手動実行 ────────────────────────────────────────
Pages._bkRunManual = async function () {
  const btn  = document.getElementById('bk-run-btn');
  const resEl= document.getElementById('bk-run-result');
  const memo = document.getElementById('bk-memo')?.value?.trim() || '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 実行中...'; }
  if (resEl) resEl.innerHTML = '';

  try {
    const result = await API.backup.run(memo || 'settings画面から手動実行');

    // 成功日時・種別・URLをローカルに保存
    Store.setSetting('backup_last_success_at', result.executed_at);
    Store.setSetting('backup_last_type',       'Manual');
    Store.setSetting('backup_last_url',        result.drive_url);
    if (result.folder_url) Store.setSetting('backup_folder_url', result.folder_url);

    if (resEl) resEl.innerHTML = `
      <div style="color:var(--green)">
        ✅ バックアップ完了<br>
        <span style="font-size:.72rem;color:var(--text3)">
          個体${result.counts?.individuals || 0}頭 / ロット${result.counts?.lots || 0}個
          / ${result.executed_at}
          ${memo ? ' / メモ: ' + memo : ''}
        </span><br>
        <a href="${result.drive_url}" target="_blank"
          style="color:var(--blue);font-size:.72rem">📁 ファイルを開く</a>
      </div>`;

    // メモフィールドをクリア
    const memoEl = document.getElementById('bk-memo');
    if (memoEl) memoEl.value = '';

    Pages._bkLoadHistory();
    setTimeout(() => _renderSettings(document.getElementById('main')), 1800);

  } catch (e) {
    Store.setSetting('backup_last_fail_at', new Date().toLocaleString('ja-JP'));
    if (resEl) resEl.innerHTML = `<div style="color:var(--red)">❌ 失敗: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✋ 今すぐバックアップ'; }
  }
};

// ── バックアップ: 自動設定 ON/OFF トグル ──────────────────────────
Pages._bkToggleAuto = async function (settingKey, currentEnabled) {
  const newVal = currentEnabled ? 'false' : 'true';
  Store.setSetting(settingKey, newVal);
  // GASにも反映
  try {
    await API.system.updateSetting(settingKey, newVal);
  } catch (e) {
    // GAS未接続でもローカル設定は保存済みなので続行
  }
  // 画面を再描画
  _renderSettings(document.getElementById('main'));
  // 再描画後に履歴を再ロード
  setTimeout(() => Pages._bkLoadHistory(), 100);
};

// ── バックアップ: トリガー登録 ────────────────────────────────────
Pages._bkInitTriggers = async function () {
  if (!UI.confirm(
    'GASにタイムトリガーを登録します。\n' +
    '初回実行時はGoogleの権限承認画面が表示されます。\n\n' +
    '既に登録済みの場合はスキップされます。'
  )) return;
  try {
    const res = await apiCall(() => API.backup.initTriggers(), 'トリガーを登録しました');
    const msg = [
      res.created?.length ? `登録: ${res.created.join(', ')}` : '',
      res.skipped?.length ? `スキップ: ${res.skipped.join(', ')}` : '',
    ].filter(Boolean).join(' / ');
    if (msg) UI.toast(msg, 'info', 5000);
  } catch (e) {}
};

// ── バックアップ: 履歴ロード ──────────────────────────────────────
Pages._bkLoadHistory = async function () {
  const el = document.getElementById('bk-history-list');
  if (!el) return;
  try {
    const res = await API.backup.list({ limit: 5 });
    const list = res.backups || [];
    if (!list.length) {
      el.innerHTML = '<div style="font-size:.75rem;color:var(--text3);text-align:center;padding:8px">履歴がありません</div>';
      return;
    }
    el.innerHTML = list.map(b => {
      const icon    = BACKUP_DISPLAY.status_icons[b.status] || '❓';
      const typeIcon= BACKUP_DISPLAY.type_icons[b.backup_type] || '';
      const counts  = b.individual_count
        ? `<span style="color:var(--text3)">個体${b.individual_count}頭</span>`
        : '';
      return `
        <div style="display:flex;align-items:center;gap:6px;padding:5px 0;
          border-bottom:1px solid var(--border);font-size:.75rem">
          <span>${icon} ${typeIcon}</span>
          <div style="flex:1;min-width:0">
            <div style="color:var(--text2)">${b.executed_at}</div>
            <div style="color:var(--text3)">${b.backup_type} ${counts}</div>
            ${b.status === 'error'
              ? `<div style="color:var(--red);font-size:.7rem">${b.error_message?.slice(0,60) || ''}</div>`
              : ''}
          </div>
          ${b.drive_url
            ? `<a href="${b.drive_url}" target="_blank"
                style="color:var(--blue);font-size:.72rem;white-space:nowrap">開く</a>`
            : ''}
        </div>`;
    }).join('');
  } catch (e) {
    if (el) el.innerHTML = '<div style="font-size:.75rem;color:var(--text3)">履歴の取得に失敗しました</div>';
  }
};

window.PAGES = window.PAGES || {};
window.PAGES['settings'] = () => Pages.settings();

// ════════════════════════════════════════════════════════════════
// Phase A — 整合性チェック / 再計算
// ════════════════════════════════════════════════════════════════

Pages._integrityCheck = async function () {
  const btn   = document.getElementById('integrity-check-btn');
  const resEl = document.getElementById('integrity-result');

  if (btn)   { btn.disabled = true; btn.textContent = '🔍 チェック中...'; }
  if (resEl) { resEl.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>'; }

  try {
    const res  = await API.integrity.check();
    const errs = res.errors  || [];
    const summ = res.summary || {};

    if (!errs.length) {
      if (resEl) resEl.innerHTML = `
        <div style="padding:10px 12px;
          background:rgba(45,122,82,.10);border:1px solid rgba(45,122,82,.30);
          border-radius:8px;font-size:.82rem;color:var(--green)">
          ✅ 不整合なし — 全 ${res.ok_count || 0} ロット正常
        </div>`;
      return;
    }

    // サマリー行
    const summaryHtml = [
      summ.lot_line_missing       ? `line欠損: ${summ.lot_line_missing}`             : '',
      summ.lot_line_invalid       ? `line無効: ${summ.lot_line_invalid}`             : '',
      summ.ind_lot_invalid        ? `lot無効参照: ${summ.ind_lot_invalid}`           : '',
      summ.lot_count_negative     ? `count負値: ${summ.lot_count_negative}`          : '',
      summ.lot_count_mismatch     ? `count不一致: ${summ.lot_count_mismatch}`        : '',
      summ.attrition_total_mismatch ? `attrition不一致: ${summ.attrition_total_mismatch}` : '',
    ].filter(Boolean).join(' / ');

    // 詳細行（最大20件）
    const detailRows = errs.slice(0, 20).map(function (e) {
      return `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:.78rem">
        <span style="color:var(--red);font-weight:600">[${e.type}]</span>
        <span style="color:var(--text2);margin-left:6px">${e.display || e.lot_id || e.ind_id || ''}</span>
        <div style="font-size:.72rem;color:var(--text3);margin-top:2px">${e.msg}</div>
      </div>`;
    }).join('');

    const moreHtml = errs.length > 20
      ? `<div style="font-size:.72rem;color:var(--text3);padding:4px 0">
           他 ${errs.length - 20} 件は GAS ログを確認してください
         </div>`
      : '';

    if (resEl) resEl.innerHTML = `
      <div style="padding:10px 12px;
        background:rgba(231,76,60,.06);border:1px solid rgba(231,76,60,.25);
        border-radius:8px">
        <div style="font-size:.85rem;font-weight:700;color:var(--red);margin-bottom:6px">
          ⚠️ ${errs.length} 件の不整合を検出
        </div>
        <div style="font-size:.72rem;color:var(--text3);margin-bottom:8px">${summaryHtml}</div>
        ${detailRows}
        ${moreHtml}
        <button class="btn btn-ghost"
          style="margin-top:10px;width:100%;font-size:.8rem"
          onclick="Pages._recalcAll()">
          ♻️ 再計算で修正を試みる
        </button>
      </div>`;

  } catch (e) {
    if (resEl) resEl.innerHTML =
      `<div style="color:var(--red);font-size:.82rem">エラー: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 整合性チェック'; }
  }
};

Pages._recalcAll = async function () {
  if (!UI.confirm(
    '全ロットの count / attrition_total を\n成長記録から再計算します。\nよろしいですか？'
  )) return;

  const btn   = document.getElementById('recalc-all-btn');
  const resEl = document.getElementById('integrity-result');

  if (btn)   { btn.disabled = true; btn.textContent = '♻️ 再計算中...'; }
  if (resEl) { resEl.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>'; }

  try {
    const res = await API.integrity.recalculateAll();
    await syncAll(true);   // キャッシュを最新化

    const errHtml = (res.errors || []).slice(0, 5).map(function (e) {
      return `<div style="font-size:.72rem;color:var(--red)">${e.display || e.lot_id}: ${e.error}</div>`;
    }).join('');

    // 変化があったロットのみ表示（最大10件）
    const changedRows = (res.results || [])
      .filter(function (r) {
        return r.old_count !== r.new_count || r.old_attrition !== r.new_attrition;
      })
      .slice(0, 10)
      .map(function (r) {
        return `<div style="font-size:.72rem;color:var(--text3);
          padding:3px 0;border-top:1px solid var(--border)">
          ${r.display}:
          count ${r.old_count}→${r.new_count} /
          attrition ${r.old_attrition}→${r.new_attrition}
        </div>`;
      }).join('');

    if (resEl) resEl.innerHTML = `
      <div style="padding:10px 12px;
        background:rgba(45,122,82,.10);border:1px solid rgba(45,122,82,.30);
        border-radius:8px;font-size:.82rem">
        <div style="font-weight:700;color:var(--green);margin-bottom:6px">
          ♻️ 再計算完了
        </div>
        <div style="color:var(--text2)">
          対象: ${res.total || 0} ロット /
          更新: ${res.updated || 0} /
          スキップ: ${res.skipped || 0}
          ${(res.errors || []).length
            ? `/ <span style="color:var(--red)">エラー: ${res.errors.length}</span>`
            : ''}
        </div>
        ${changedRows}
        ${errHtml}
        <button class="btn btn-ghost"
          style="margin-top:10px;width:100%;font-size:.8rem"
          onclick="Pages._integrityCheck()">
          🔍 再チェックして確認
        </button>
      </div>`;

  } catch (e) {
    if (resEl) resEl.innerHTML =
      `<div style="color:var(--red);font-size:.82rem">エラー: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '♻️ 全ロット再計算'; }
  }
};

// ── Phase2: 後食・ペアリング設定保存 ────────────────────────────
Pages._savePairingSettings = async function () {
  const maleWait     = document.getElementById('set-male-wait')?.value;
  const femaleWait   = document.getElementById('set-female-wait')?.value;
  const intervalMin  = document.getElementById('set-pairing-interval')?.value;
  const exchDays     = document.getElementById('set-exchange-days')?.value;
  if (!maleWait || !femaleWait || !intervalMin) {
    UI.toast('すべての値を入力してください'); return;
  }
  try {
    UI.loading(true);
    await API.system.updateSetting('male_pairing_wait_days',    maleWait);
    await API.system.updateSetting('female_pairing_wait_days',  femaleWait);
    await API.system.updateSetting('male_pairing_interval_min_days', intervalMin);
    if (exchDays) await API.system.updateSetting('pairing_set_exchange_days', exchDays);
    Store.setSetting('male_pairing_wait_days',    maleWait);
    Store.setSetting('female_pairing_wait_days',  femaleWait);
    Store.setSetting('male_pairing_interval_min_days', intervalMin);
    if (exchDays) Store.setSetting('pairing_set_exchange_days', exchDays);
    UI.toast('設定を保存しました');
  } catch(e) {
    UI.toast('エラー: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};
