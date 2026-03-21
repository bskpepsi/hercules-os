// ════════════════════════════════════════════════════════════════
// scan.js — QRスキャン v3
//
// 【改善点】
//   1. QR読取後の即時遷移（APIレスポンス待ちなし）
//   2. 連続スキャンモード（カメラ維持・結果シート表示）
//   3. ラベル全体読取（Gemini + jsQR → 差分確認 → 保存）
//   4. スキャン履歴 10件保持
//
// 【依存】
//   jsQR（index.html で静的ロード済み）
//   QRCode.js（同上）
//   API.gemini.analyzeImage（api.js）
//   API.scan.resolve / updateLotFields / updateIndFields（api.js）
// ════════════════════════════════════════════════════════════════
'use strict';

// ── セッション変数（ページをまたいで維持） ─────────────────────
window._qrContinuousMode = window._qrContinuousMode || false;
window._qrCameraStream   = window._qrCameraStream   || null;

// ── 体重測定モード: プリセット定義 ──────────────────────────────
const _WM_PRESETS = {
  normal: { label: '通常',    mat:'',   molt:false, stage:'', container:'', exchange:'' },
  t1:     { label: 'T1移行',  mat:'T1', molt:false, stage:'L2_EARLY', container:'2.7L', exchange:'全交換' },
  t2:     { label: 'T2初回',  mat:'T2', molt:true,  stage:'L3_EARLY', container:'2.7L', exchange:'全交換' },
};

// プリセットID: localStorageで永続化（リロード後も維持）
function _wmGetPresetId() {
  return localStorage.getItem('wm_preset') || 'normal';
}
function _wmSetPresetId(id) {
  localStorage.setItem('wm_preset', id);
}

// 前回入力値: localStorageで永続化
function _wmGetLastInput() {
  try {
    const saved = localStorage.getItem('wm_last_input');
    if (saved) return JSON.parse(saved);
  } catch(_) {}
  const preset = _WM_PRESETS[_wmGetPresetId()] || _WM_PRESETS.normal;
  return { mat: preset.mat, molt: preset.molt, stage: preset.stage,
           container: preset.container, exchange: preset.exchange };
}
function _wmSaveLastInput(obj) {
  // 空文字は既存の有効値で上書きしない（今回入力 > 既存有効値）
  const prev = _wmGetLastInput();
  const merged = {};
  Object.keys(obj).forEach(k => {
    // obj[k] が空文字 / null / undefined かつ prev[k] に値があれば prev[k] を使う
    // ただし false（モルト OFF）は有効値なのでそのまま使う
    const newVal = obj[k];
    const oldVal = prev[k];
    if ((newVal === '' || newVal === null || newVal === undefined) && oldVal != null && oldVal !== '') {
      merged[k] = oldVal;
    } else {
      merged[k] = newVal;
    }
  });
  try { localStorage.setItem('wm_last_input', JSON.stringify(merged)); } catch(_) {}
  window._wmLastInput = merged;
}

// 起動時に window 変数も初期化
window._wmLastInput = _wmGetLastInput();

// ════════════════════════════════════════════════════════════════
// QRスキャン画面 (qr-scan)
// ════════════════════════════════════════════════════════════════
// ── 個体詳細→直接体重測定（QRスキャン省略） ──────────────────
Pages._indDirectWeight = async function (indId) {
  const ind  = Store.getIndividual(indId);
  const line = ind ? Store.getLine(ind.line_id) : null;
  // last_growth をキャッシュから取得
  const lastGrowth = _getLastGrowthFromStore('IND', indId, ind?.latest_weight_g);
  // resolve_result 形式に整形して weightMode へ直接遷移
  routeTo('weight-mode', {
    resolve_result: {
      entity_type: 'IND',
      entity:      ind || { ind_id: indId, display_id: indId },
      line:        line || {},
      last_growth: lastGrowth,
    },
  });
};

Pages.qrScan = function (params = {}) {
  const main = document.getElementById('main');
  let _scanMode = params.mode === 'weight' ? 'weight'
                : params.mode === 'diff'   ? 'diff'
                : 'view';

  function _modeStyle(m) {
    if (m !== _scanMode) return 'color:var(--text3);background:transparent;';
    const bg = m==='weight' ? 'var(--green)' : m==='diff' ? 'var(--blue)' : 'var(--gold)';
    return `background:${bg};color:#fff;font-weight:700;`;
  }

  function render() {
    main.innerHTML = `
      ${UI.header('📷 QRスキャン', { back: true })}
      <div class="page-body">

        <!-- モードタブ -->
        <div style="display:flex;background:var(--surface2);border-radius:10px;padding:3px;gap:3px">
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('view')}"
            onclick="Pages._qrSwitchMode('view')">🔍 確認</button>
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('diff')}"
            onclick="Pages._qrSwitchMode('diff')">📝 差分</button>
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('weight')}"
            onclick="Pages._qrSwitchMode('weight')">⚖️ 体重</button>
        </div>

        <!-- 連続スキャントグル -->
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:8px 12px;background:var(--surface2);border-radius:10px;margin-top:6px">
          <span style="font-size:.8rem;color:var(--text2)">🔁 連続スキャンモード</span>
          <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer">
            <input type="checkbox" id="continuous-toggle" ${window._qrContinuousMode?'checked':''}
              onchange="Pages._qrToggleContinuous(this.checked)"
              style="opacity:0;width:0;height:0">
            <span id="continuous-slider" style="
              position:absolute;inset:0;border-radius:24px;transition:.3s;
              background:${window._qrContinuousMode?'var(--green)':'var(--surface3,#2a3e36)'};
            ">
              <span style="
                position:absolute;top:3px;${window._qrContinuousMode?'right:3px':'left:3px'};
                width:18px;height:18px;border-radius:50%;background:#fff;transition:.3s;
                box-shadow:0 1px 3px rgba(0,0,0,.3)
              "></span>
            </span>
          </label>
        </div>
        ${window._qrContinuousMode
          ? '<div style="font-size:.7rem;color:var(--green);padding:2px 4px">連続モード: 読取後もカメラを維持します</div>'
          : ''}

        <!-- カメラエリア -->
        <div class="card" id="camera-card" style="display:none;padding:0;overflow:hidden">
          <div style="position:relative;width:100%;background:#000">
            <video id="qr-video" autoplay playsinline muted
              style="width:100%;display:block;max-height:260px;object-fit:cover"></video>
            <canvas id="qr-canvas" style="display:none"></canvas>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
              <div id="scan-frame" style="width:200px;height:200px;border:3px solid var(--green);
                border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,0.5)"></div>
            </div>
            <div id="scan-line" style="position:absolute;left:calc(50% - 100px);top:calc(50% - 100px);
              width:200px;height:3px;background:var(--green);opacity:.8;animation:scanLine 2s infinite linear"></div>
          </div>
          <div style="display:flex;gap:8px;padding:8px">
            <button class="btn btn-ghost" style="flex:1" onclick="Pages._qrStopCamera()">✕ 閉じる</button>
            <div id="scan-status" style="flex:2;display:flex;align-items:center;justify-content:center;font-size:.78rem;color:var(--green)">スキャン中…</div>
          </div>
        </div>

        <!-- 入力カード -->
        <div class="card">
          <button class="btn btn-ghost btn-full" id="camera-btn" onclick="Pages._qrStartCamera()"
            style="margin-bottom:10px;border:2px solid var(--green);background:rgba(45,122,82,.08);
            font-size:.95rem;padding:14px;border-radius:12px">
            <span style="font-size:1.4rem;margin-right:8px">📷</span>カメラで読み取る
          </button>

          <!-- ラベル全体読取 -->
          <label style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;
            border:2px dashed var(--amber,#c8a84b);border-radius:10px;cursor:pointer;margin-bottom:10px;
            font-size:.85rem;color:var(--amber,#c8a84b)">
            <span style="font-size:1.2rem">🔬</span>ラベル全体を読み取る（AI解析）
            <input type="file" accept="image/*" style="display:none"
              onchange="Pages._qrReadLabelImage(this)">
          </label>

          <label style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;
            border:2px dashed var(--border2);border-radius:10px;cursor:pointer;margin-bottom:10px;
            font-size:.85rem;color:var(--text3)">
            <span style="font-size:1.2rem">🖼️</span>QR画像を選択して読み取る
            <input type="file" accept="image/*" style="display:none"
              onchange="Pages._qrReadFromImage(this)">
          </label>

          <div style="display:flex;align-items:center;gap:8px;margin:6px 0">
            <div style="flex:1;height:1px;background:var(--border2)"></div>
            <span style="font-size:.72rem;color:var(--text3)">またはテキストで入力</span>
            <div style="flex:1;height:1px;background:var(--border2)"></div>
          </div>

          <div class="field" style="margin-bottom:10px">
            <label class="field-label">QRコードの内容を貼り付け</label>
            <textarea id="qr-input" class="input" rows="2"
              placeholder="LOT:LOT-xxx / IND:IND-xxx"
              style="font-family:var(--font-mono);font-size:.88rem"
              oninput="Pages._qrPreviewInput(this.value)"></textarea>
            <div id="qr-preview" style="font-size:.72rem;margin-top:4px"></div>
          </div>

          <button class="btn btn-gold btn-full" id="qr-resolve-btn" onclick="Pages._qrResolve()">
            🔍 読み取り・確認
          </button>
          <div id="qr-error" style="margin-top:8px;font-size:.8rem;color:var(--red)"></div>
        </div>

        <!-- 連続スキャン結果シート -->
        <div id="continuous-results"></div>

        <!-- スキャン履歴 -->
        <div id="scan-history-card"></div>
      </div>`;

    if (!document.getElementById('scan-anim-style')) {
      const st = document.createElement('style');
      st.id = 'scan-anim-style';
      st.textContent = '@keyframes scanLine{0%{top:calc(50% - 100px)}50%{top:calc(50% + 97px)}100%{top:calc(50% - 100px)}}';
      document.head.appendChild(st);
    }

    setTimeout(() => Pages._qrRenderHistory(), 50);
    setTimeout(() => Pages._qrRenderContinuousResults(), 50);
  }

  Pages._qrSwitchMode = (m) => { _scanMode = m; render(); };
  render();

  if (params.autoCamera) {
    setTimeout(() => Pages._qrStartCamera(), 300);
  }
};

// ── 連続モードトグル ──────────────────────────────────────────────
Pages._qrToggleContinuous = function (checked) {
  window._qrContinuousMode = checked;
  // スライダー更新
  const slider = document.getElementById('continuous-slider');
  if (slider) {
    slider.style.background = checked ? 'var(--green)' : 'var(--surface3,#2a3e36)';
    const thumb = slider.querySelector('span');
    if (thumb) thumb.style[checked ? 'right' : 'left'] = '3px',
               thumb.style[checked ? 'left'  : 'right'] = 'auto';
  }
};

// ── QRテキストプレビュー ─────────────────────────────────────────
Pages._qrPreviewInput = function (val) {
  const el = document.getElementById('qr-preview');
  if (!el) return;
  const v = (val || '').trim();
  const labels = { LOT:'🟡 ロット', IND:'🟢 個体', SET:'🟠 産卵セット' };
  const type = v.startsWith('LOT:') ? 'LOT' : v.startsWith('IND:') ? 'IND' : v.startsWith('SET:') ? 'SET' : null;
  el.innerHTML = type
    ? `<span style="color:var(--green)">${labels[type]} : ${v.split(':')[1]}</span>`
    : v ? `<span style="color:var(--red)">⚠️ フォーマット不正</span>` : '';
};

// ── QR解析・モード別遷移（高速版） ───────────────────────────────
// 改善: キャッシュから即遷移し、バックグラウンドでAPI補完
Pages._qrResolve = async function () {
  const qrText = document.getElementById('qr-input')?.value?.trim();
  const errEl  = document.getElementById('qr-error');
  const btn    = document.getElementById('qr-resolve-btn');
  if (!qrText) { if (errEl) errEl.textContent = 'QRコードを入力してください'; return; }
  if (errEl) errEl.textContent = '';

  // ── ① キャッシュから即時解決（待ち時間ゼロ）──────────────────
  const cached = _qrResolveFromCache(qrText);

  // 連続モードの場合: 遷移せず結果シートに追加
  if (window._qrContinuousMode && cached) {
    Pages._qrSaveHistory(qrText, cached);
    _qrAddContinuousResult(cached, qrText);
    // テキストエリアをクリアして次のスキャンへ
    const inp = document.getElementById('qr-input');
    if (inp) { inp.value = ''; Pages._qrPreviewInput(''); }
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    // バックグラウンドでAPI更新
    _qrFetchAndUpdate(qrText, cached.entity_type, cached.entity?.lot_id || cached.entity?.ind_id);
    return;
  }

  // 通常モード: キャッシュがあれば即遷移
  const mode = _qrCurrentMode();
  if (cached) {
    Pages._qrSaveHistory(qrText, cached);
    _qrNavigate(mode, cached, qrText);
    // バックグラウンドでAPI更新（遷移後）
    _qrFetchAndUpdate(qrText, cached.entity_type, cached.entity?.lot_id || cached.entity?.ind_id);
    return;
  }

  // キャッシュなし: APIを呼ぶ（ローディング表示は200ms遅延）
  if (btn) btn.disabled = true;
  let loadingTimer = setTimeout(() => {
    if (btn) btn.textContent = '⏳ 解析中...';
  }, 200);

  try {
    const res = await API.scan.resolve(qrText);
    clearTimeout(loadingTimer);
    Pages._qrSaveHistory(qrText, res);

    if (window._qrContinuousMode) {
      _qrAddContinuousResult(res, qrText);
      const inp = document.getElementById('qr-input');
      if (inp) { inp.value = ''; Pages._qrPreviewInput(''); }
    } else {
      _qrNavigate(mode, res, qrText);
    }
  } catch (e) {
    clearTimeout(loadingTimer);
    if (errEl) errEl.textContent = '❌ ' + (e.message || '解析に失敗しました');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 読み取り・確認'; }
  }
};

// ── Store キャッシュから最新成長記録を取得するヘルパー ──────────────
// 優先: growthMap のキャッシュ → latest_weight_g フォールバック
// date を比較して安全に最新を取得する（配列末尾依存しない）
function _getLastGrowthFromStore(targetType, targetId, latestWeightFallback) {
  // growthMap に記録があればそこから取得
  const records = Store.getGrowthRecords(targetId);
  if (records && records.length > 0) {
    // weight_g > 0 のものだけ対象にして record_date 降順で最新を取る
    const weighted = records
      .filter(r => r.weight_g != null && String(r.weight_g) !== '' && parseFloat(r.weight_g) > 0)
      .slice()
      .sort((a, b) => String(b.record_date || '').localeCompare(String(a.record_date || '')));
    if (weighted.length > 0) return weighted[0];
  }
  // growthMap がなければ latest_weight_g だけで簡易オブジェクトを返す
  if (latestWeightFallback != null && String(latestWeightFallback) !== '' &&
      parseFloat(latestWeightFallback) > 0) {
    return { weight_g: parseFloat(latestWeightFallback), record_date: '', age_days: '' };
  }
  return null;
}

// ── キャッシュから即時解決 ────────────────────────────────────────
function _qrResolveFromCache(qrText) {
  const parts = qrText.split(':');
  if (parts.length < 2) return null;
  const type = parts[0]; // LOT / IND / SET
  const id   = parts.slice(1).join(':');

  if (type === 'LOT') {
    const lot  = Store.getLot(id);
    if (!lot) return null;
    const line = Store.getLine(lot.line_id) || null;
    return { entity_type: 'LOT', entity: lot, line, missing: [], label_type: 'multi_lot',
             last_growth: _getLastGrowthFromStore('LOT', id, lot.latest_weight_g) };
  }
  if (type === 'IND') {
    const ind  = Store.getIndividual(id);
    if (!ind) return null;
    const line = Store.getLine(ind.line_id) || null;
    return { entity_type: 'IND', entity: ind, line, missing: [], label_type: 'ind_fixed',
             last_growth: _getLastGrowthFromStore('IND', id, ind.latest_weight_g) };
  }
  if (type === 'SET') {
    const pairings = Store.getDB('pairings') || [];
    const set = pairings.find(p => p.set_id === id || p.pairing_id === id);
    if (!set) return null;
    return { entity_type: 'SET', entity: set, line: null, missing: [], label_type: 'set' };
  }
  return null;
}

// ── バックグラウンドAPI更新 ───────────────────────────────────────
async function _qrFetchAndUpdate(qrText, entityType, entityId) {
  if (!entityId) return;
  try {
    const res = await API.scan.resolve(qrText);
    // ストアに反映
    if (entityType === 'LOT' && res.entity) {
      Store.patchDBItem('lots', 'lot_id', entityId, res.entity);
    }
    if (entityType === 'IND' && res.entity) {
      Store.patchDBItem('individuals', 'ind_id', entityId, res.entity);
    }
  } catch (e) {
    // バックグラウンドエラーは無視
  }
}

// ── モード取得 ────────────────────────────────────────────────────
function _qrCurrentMode() {
  // モードボタンのスタイルから判定
  const btns = document.querySelectorAll('button[onclick*="_qrSwitchMode"]');
  for (const b of btns) {
    if (b.style.fontWeight === '700') {
      const m = b.getAttribute('onclick')?.match(/'(view|diff|weight)'/);
      if (m) return m[1];
    }
  }
  return 'view';
}

// ── モード別ナビゲーション ────────────────────────────────────────
function _qrNavigate(mode, res, qrText) {
  if (mode === 'weight') {
    routeTo('weight-mode', { resolve_result: res, qr_text: qrText });
  } else if (mode === 'diff') {
    routeTo('qr-diff', { resolve_result: res, qr_text: qrText });
  } else {
    const eid = res.entity?.ind_id || res.entity?.lot_id || res.entity?.set_id;
    if      (res.entity_type === 'IND' && eid) routeTo('ind-detail',     { indId:      eid });
    else if (res.entity_type === 'LOT' && eid) routeTo('lot-detail',     { lotId:      eid });
    else if (res.entity_type === 'SET' && eid) routeTo('pairing-detail', { pairingId:  eid });
    else routeTo('qr-diff', { resolve_result: res, qr_text: qrText });
  }
}

// ── 連続スキャン: 結果シート追加 ────────────────────────────────
window._qrContinuousHistory = window._qrContinuousHistory || [];

function _qrAddContinuousResult(res, qrText) {
  const entry = {
    qr_text:     qrText,
    entity_type: res.entity_type,
    entity:      res.entity,
    scanned_at:  new Date().toLocaleTimeString('ja-JP'),
  };
  window._qrContinuousHistory.unshift(entry);
  if (window._qrContinuousHistory.length > 10) window._qrContinuousHistory.pop();
  Pages._qrRenderContinuousResults();
}

Pages._qrRenderContinuousResults = function () {
  const el = document.getElementById('continuous-results');
  if (!el || !window._qrContinuousHistory.length) return;

  const rows = window._qrContinuousHistory.map((h, i) => {
    const eid = h.entity?.ind_id || h.entity?.lot_id || h.entity?.set_id || '';
    const displayId = h.entity?.display_id || eid;
    const routeBtn = eid
      ? `<button class="btn btn-ghost btn-sm" onclick="${
          h.entity_type === 'IND' ? `routeTo('ind-detail',{indId:'${eid}'})` :
          h.entity_type === 'LOT' ? `routeTo('lot-detail',{lotId:'${eid}'})` :
          `routeTo('pairing-detail',{pairingId:'${eid}'})`
        }">詳細→</button>`
      : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;
      border-bottom:1px solid var(--border)">
      <span style="font-size:.68rem;color:var(--text3);min-width:45px">${h.scanned_at}</span>
      <span style="font-size:.7rem;background:${h.entity_type==='LOT'?'rgba(200,168,75,.15)':'rgba(76,175,120,.15)'};
        color:${h.entity_type==='LOT'?'var(--amber)':'var(--green)'};
        padding:1px 6px;border-radius:99px;font-weight:700">${h.entity_type}</span>
      <span style="font-family:var(--font-mono);font-size:.78rem;color:var(--text1);flex:1;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${displayId}</span>
      ${routeBtn}
    </div>`;
  }).join('');

  el.innerHTML = `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div class="card-title" style="margin:0">📋 スキャン結果 (${window._qrContinuousHistory.length}件)</div>
      <button class="btn btn-ghost btn-sm" onclick="window._qrContinuousHistory=[];Pages._qrRenderContinuousResults()">
        クリア
      </button>
    </div>
    ${rows}
  </div>`;
};

// ── スキャン履歴 ──────────────────────────────────────────────────
Pages._qrSaveHistory = function (qrText, res) {
  try {
    const hist = JSON.parse(sessionStorage.getItem('qr_scan_history') || '[]');
    hist.unshift({
      qr_text:     qrText,
      entity_type: res.entity_type,
      display_id:  res.entity?.display_id || '',
      scanned_at:  new Date().toLocaleTimeString('ja-JP'),
    });
    sessionStorage.setItem('qr_scan_history', JSON.stringify(hist.slice(0, 10)));
  } catch(e) {}
};

Pages._qrRenderHistory = function () {
  const el = document.getElementById('scan-history-card');
  if (!el) return;
  try {
    const hist = JSON.parse(sessionStorage.getItem('qr_scan_history') || '[]');
    if (!hist.length) return;
    el.innerHTML = `<div class="card">
      <div class="card-title">🕑 直近のスキャン</div>
      ${hist.map(h => `
        <div onclick="Pages._qrRescanFromHistory('${h.qr_text}')"
          style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">
          <span style="font-size:.72rem;color:var(--text3);min-width:50px">${h.scanned_at}</span>
          <span style="font-family:var(--font-mono);font-size:.78rem;color:var(--gold);flex:1">${h.display_id || h.qr_text}</span>
          <span style="font-size:.7rem;color:var(--blue)">再スキャン →</span>
        </div>`).join('')}
    </div>`;
  } catch(e) {}
};

Pages._qrRescanFromHistory = function (qrText) {
  const inp = document.getElementById('qr-input');
  if (inp) { inp.value = qrText; Pages._qrPreviewInput(qrText); }
  Pages._qrResolve();
};

// ── カメラスキャン ────────────────────────────────────────────────
// ── jsQR 共通アクセサ ────────────────────────────────────────
// 裸の識別子 jsQR は strict mode や読込順で参照できない場合があるため
// 必ず window / globalThis 経由で参照する
function _getJsQR() {
  return window.jsQR || (typeof globalThis !== 'undefined' && globalThis.jsQR) || null;
}

// ── jsQR 動的ロード（未ロード時のリカバリ）────────────────────
// ボタン押下時は毎回 _getJsQR() を確認し、なければ動的ロードを試みる
// _jsQRLoadFailed で永久ブロックしない（ネットワーク回復後の再試行を許す）
const _JSQR_SRCS = [
  'js/lib/jsQR.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js',
  'https://unpkg.com/jsqr@1.4.0/dist/jsQR.min.js',
];

async function _ensureJsQR() {
  // 既にロード済みなら即 true
  if (_getJsQR()) {
    console.log('[scan] jsQR already available:', typeof _getJsQR());
    return true;
  }

  console.log('[scan] jsQR not found, attempting dynamic load...');

  // 順番に試みる（永久ブロックしない → ボタン押下のたびに再試行可能）
  for (const url of _JSQR_SRCS) {
    const ok = await new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload  = () => { console.log('[scan] jsQR loaded from:', url); resolve(true); };
      s.onerror = () => { console.warn('[scan] jsQR failed:', url); resolve(false); };
      document.head.appendChild(s);
    });
    if (ok && _getJsQR()) return true;  // window.jsQR で確認
  }

  console.error('[scan] jsQR: all sources failed');
  return false;
}

Pages._qrStartCamera = async function () {
  // jsQR がまだロードされていない場合、動的ロードを試みる
  const jsQRReady = await _ensureJsQR();
  if (!jsQRReady) {
    UI.toast('QRライブラリのロードに失敗。js/lib/jsQR.min.js を配置してください', 'error', 6000);
    console.error('[scan] jsQR not available. Please place js/lib/jsQR.min.js');
    return;
  }

  const card = document.getElementById('camera-card');
  if (!card) return;

  try {
    // 既存ストリームを再利用（連続モード）
    let stream = window._qrCameraStream;
    if (!stream || !stream.active) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          // 解析用に 640px あれば十分。高解像度は jsQR を重くするだけ
          width:  { ideal: 1280, min: 480 },
          height: { ideal: 720,  min: 360 },
        }
      });
      window._qrCameraStream = stream;

      // ── focusMode / zoom を試みる（非対応端末は無視）──────────
      try {
        const track = stream.getVideoTracks()[0];
        if (track && track.applyConstraints) {
          const caps = track.getCapabilities ? track.getCapabilities() : {};
          const adv = {};
          // 連続オートフォーカス
          if (caps.focusMode && caps.focusMode.includes('continuous')) {
            adv.focusMode = 'continuous';
          }
          // ズーム: 2倍程度まで対応している場合のみ適用（読み取り補助）
          if (caps.zoom && caps.zoom.max >= 1.5) {
            adv.zoom = Math.min(1.5, caps.zoom.max);
          }
          if (Object.keys(adv).length) {
            await track.applyConstraints({ advanced: [adv] }).catch(() => {});
          }
        }
      } catch (_) { /* focusMode/zoom 非対応は完全無視 */ }
    }

    const video = document.getElementById('qr-video');
    if (!video) { stream.getTracks().forEach(t=>t.stop()); return; }

    video.srcObject = stream;
    card.style.display = 'block';
    const btn = document.getElementById('camera-btn');
    if (btn) btn.textContent = '📷 スキャン中...';

    video.addEventListener('loadedmetadata', () => { video.play(); }, { once: true });
    Pages._qrScanLoop(video);
  } catch (e) {
    const msg = e.name === 'NotAllowedError' ? 'カメラへのアクセスを許可してください'
              : e.name === 'NotFoundError'   ? 'カメラが見つかりません'
              : 'カメラ起動失敗: ' + e.message;
    UI.toast(msg, 'error', 5000);
  }
};

// ── 短い成功音（Web Audio API / 非対応端末は無視）─────────────
function _qrBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1760; // 高めの「ピ」
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch (_) { /* Web Audio 非対応は無視 */ }
}

Pages._qrScanLoop = function (video) {
  // 解析専用の小さなcanvas（表示用videoとは別）
  // jsQR は小さい画像ほど高速。640px幅あれば十分認識できる。
  const SCAN_W = 640;
  const analyCanvas = document.createElement('canvas');
  const analyCtx    = analyCanvas.getContext('2d');

  let frameCount  = 0;
  let resolved    = false;
  // 同一QRコードの連続誤検知防止
  // { code: string, ts: number } — 同じコードを 1.2秒間は無視
  let _lastSeen = { code: '', ts: 0 };
  const DEDUP_MS = 1200;

  const scan = () => {
    if (!video.srcObject || resolved) return;
    frameCount++;
    // 2フレームに1回解析（毎フレームより軽く、3フレームより速い）
    if (frameCount % 2 !== 0) { requestAnimationFrame(scan); return; }

    if (video.readyState < video.HAVE_ENOUGH_DATA || video.videoWidth <= 0) {
      requestAnimationFrame(scan); return;
    }

    // ── 解析用canvasにリサイズして描画 ──────────────────────────
    // アスペクト比を維持して SCAN_W に縮小
    const scaleW = SCAN_W;
    const scaleH = Math.round(video.videoHeight * (SCAN_W / video.videoWidth));
    if (analyCanvas.width !== scaleW || analyCanvas.height !== scaleH) {
      analyCanvas.width  = scaleW;
      analyCanvas.height = scaleH;
    }
    analyCtx.drawImage(video, 0, 0, scaleW, scaleH);

    // jsQR に渡す領域: canvasの中央付近をクロップして使う
    // ユーザーがQRを少し外れた位置に持っていても読めるよう
    // 全体の 85% 範囲を解析（厳密なセンター合わせ不要）
    const cropW = Math.round(scaleW * 0.85);
    const cropH = Math.round(scaleH * 0.85);
    const cropX = Math.round((scaleW - cropW) / 2);
    const cropY = Math.round((scaleH - cropH) / 2);
    const imageData = analyCtx.getImageData(cropX, cropY, cropW, cropH);

    const _jsQRFn = _getJsQR();
    if (!_jsQRFn) { requestAnimationFrame(scan); return; }
    const code = _jsQRFn(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (code?.data) {
      const now = Date.now();
      // 同一コードを短時間で連続検知する場合はスキップ
      if (code.data === _lastSeen.code && now - _lastSeen.ts < DEDUP_MS) {
        requestAnimationFrame(scan); return;
      }
      _lastSeen = { code: code.data, ts: now };

      resolved = true;
      if (!window._qrContinuousMode) Pages._qrStopCamera();

      const input = document.getElementById('qr-input');
      if (input) { input.value = code.data; Pages._qrPreviewInput(code.data); }

      // 即フィードバック: バイブ + 成功音
      if (navigator.vibrate) navigator.vibrate(80);
      _qrBeep();

      const status = document.getElementById('scan-status');
      if (status) { status.textContent = '✅ 読み取り成功！'; status.style.color = 'var(--green)'; }

      // キャッシュがあれば即処理（待ち時間ゼロ）
      Pages._qrResolve();

      // 連続モード: 1.2秒後にリセットして次のQRへ
      if (window._qrContinuousMode) {
        setTimeout(() => {
          resolved = false;
          if (status) { status.textContent = 'スキャン中…'; status.style.color = 'var(--green)'; }
          requestAnimationFrame(scan);
        }, DEDUP_MS);
      }
      return;
    }
    requestAnimationFrame(scan);
  };
  requestAnimationFrame(scan);
};

Pages._qrStopCamera = function () {
  const video = document.getElementById('qr-video');
  // 連続モードではストリームを維持
  if (!window._qrContinuousMode) {
    if (video?.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
    window._qrCameraStream = null;
  } else {
    if (video) video.srcObject = null;
  }
  const card = document.getElementById('camera-card');
  if (card) card.style.display = 'none';
  const btn = document.getElementById('camera-btn');
  if (btn) btn.textContent = '📷 カメラで読み取る';
};

// ── QR画像ファイル読み取り ────────────────────────────────────────
Pages._qrReadFromImage = async function (input) {
  const file = input?.files?.[0];
  if (!file) return;
  const jsQRReady = await _ensureJsQR();
  if (!jsQRReady) { UI.toast('QRライブラリ未ロード', 'error'); return; }

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const _jsQRFn2 = _getJsQR();
      const code = _jsQRFn2 ? _jsQRFn2(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' }) : null;
      if (code?.data) {
        const qrInput = document.getElementById('qr-input');
        if (qrInput) { qrInput.value = code.data; Pages._qrPreviewInput(code.data); }
        UI.toast('QRコードを読み取りました', 'success');
        Pages._qrResolve();
      } else {
        UI.toast('QRコードが見つかりませんでした', 'error', 4000);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
};

// ════════════════════════════════════════════════════════════════
// ラベル全体読取（AI解析 + 差分確認保存）
// ════════════════════════════════════════════════════════════════

Pages._qrReadLabelImage = async function (inputEl) {
  const file = inputEl?.files?.[0];
  if (!file) return;
  inputEl.value = '';

  const main = document.getElementById('main');
  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);'+
    'background:var(--surface2);border:1px solid var(--border);border-radius:10px;'+
    'padding:12px 20px;font-size:.85rem;color:var(--green);z-index:9999';
  statusDiv.textContent = '🔬 ラベルを解析中...';
  document.body.appendChild(statusDiv);

  try {
    // ── ① 画像からQRをまず読む ──────────────────────────────
    const imgBase64 = await _readFileAsBase64(file);
    const imgDataUrl = 'data:' + file.type + ';base64,' + imgBase64;

    // ラベル全体読取でも jsQR が必要
    await _ensureJsQR();
    let qrResult = null;
    try {
      qrResult = await _extractQRFromImage(imgDataUrl);
    } catch(e) {}

    // ── ② Gemini でラベル全体を解析 ─────────────────────────
    statusDiv.textContent = '🤖 AI解析中...（数秒かかります）';
    let aiResult = null;
    try {
      const raw = await API.gemini.analyzeImage(imgBase64, file.type, 'label_full');
      aiResult = typeof raw === 'string' ? JSON.parse(raw.replace(/```json|```/g, '').trim()) : raw;
    } catch(e) {
      console.warn('[label scan] AI parse error:', e.message);
    }

    document.body.removeChild(statusDiv);

    // ── ③ QR + AI結果 → 差分確認画面 ─────────────────────────
    Pages._qrShowLabelScanResult(qrResult, aiResult, imgDataUrl);

  } catch(e) {
    try { document.body.removeChild(statusDiv); } catch(ee){}
    UI.toast('解析失敗: ' + e.message, 'error');
  }
};

// ── Base64変換 ────────────────────────────────────────────────────
function _readFileAsBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('ファイル読み込み失敗'));
    r.readAsDataURL(file);
  });
}

// ── 画像からQR抽出 ────────────────────────────────────────────────
function _extractQRFromImage(dataUrl) {
  return new Promise((res, rej) => {
    const _jsQRFn3 = _getJsQR();
    if (!_jsQRFn3) { rej(new Error('jsQR未ロード (window.jsQR が null)')); return; }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = _jsQRFn3(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) res(code.data);
      else rej(new Error('QR not found'));
    };
    img.onerror = () => rej(new Error('画像読み込み失敗'));
    img.src = dataUrl;
  });
}

// ── ラベルスキャン結果 + 差分確認UI ─────────────────────────────
Pages._qrShowLabelScanResult = async function (qrText, aiResult, imgDataUrl) {
  const main = document.getElementById('main');

  // QRから対象を解決
  let scanRes = null;
  let entity  = null;
  let entityType = null;

  if (qrText) {
    try {
      scanRes = _qrResolveFromCache(qrText) || await API.scan.resolve(qrText);
      entity  = scanRes?.entity;
      entityType = scanRes?.entity_type;
    } catch(e) {}
  }

  // AI解析結果からステージラベルを内部コードに変換
  const stageMap = {
    'L1':'L1', 'L2':'L2_EARLY', 'L2前期':'L2_EARLY', 'L2後期':'L2_LATE',
    'L3':'L3_EARLY', 'L3前期':'L3_EARLY', 'L3中期':'L3_MID', 'L3後期':'L3_LATE',
    '前蛹':'PREPUPA', '蛹':'PUPA', '成虫':'ADULT',
  };

  // 差分候補の構築
  const candidates = [];

  if (aiResult) {
    // 性別
    if (aiResult.sex && aiResult.sex !== '不明') {
      if (entityType === 'IND') {
        // IND: sex フィールドに直接保存
        const current = entity?.sex || '';
        if (current !== aiResult.sex) {
          candidates.push({ key: 'sex', label: '性別', old: current || '未設定', new: aiResult.sex });
        }
      } else if (entityType === 'LOT') {
        // LOT: sex_hint フィールド
        const current = entity?.sex_hint || '';
        if (current !== aiResult.sex) {
          candidates.push({ key: 'sex_hint', label: '性別区分', old: current || '未設定', new: aiResult.sex });
        }
      }
    }
    // ステージ
    if (aiResult.stage_label) {
      const stageCode = stageMap[aiResult.stage_label] || aiResult.stage_label;
      const currentStage = entityType === 'LOT' ? entity?.stage : entity?.current_stage;
      if (stageCode && currentStage !== stageCode) {
        candidates.push({ key: entityType === 'LOT' ? 'stage' : 'current_stage',
          label: 'ステージ', old: currentStage || '未設定', new: stageCode });
      }
    }
    // マット
    if (aiResult.mat_type) {
      const currentMat = entityType === 'LOT' ? entity?.mat_type : entity?.current_mat;
      if (currentMat !== aiResult.mat_type) {
        candidates.push({ key: entityType === 'LOT' ? 'mat_type' : 'current_mat',
          label: 'マット', old: currentMat || '未設定', new: aiResult.mat_type });
      }
    }
    // モルト
    if (aiResult.mat_molt !== undefined) {
      const newMolt = aiResult.mat_molt ? 'true' : 'false';
      const curMolt = String(entity?.mat_molt || 'false');
      if (curMolt !== newMolt) {
        candidates.push({ key: 'mat_molt', label: 'モルト', old: curMolt, new: newMolt });
      }
    }
    // 区分: LOT=カンマ区切り複数選択可, IND=単一値
    if (aiResult.size_categories?.length) {
      const newCats = entityType === 'IND'
        ? (aiResult.size_categories[0] || '')                // 個体: 最初の1件のみ
        : aiResult.size_categories.join(',');                // ロット: カンマ区切り
      const currentCat = entity?.size_category || '';
      if (newCats && newCats !== currentCat) {
        candidates.push({ key: 'size_category', label: '区分', old: currentCat || '未設定', new: newCats });
      }
    }
    // 新規体重記録
    if (aiResult.records?.length) {
      const existingRecs = Store.getGrowthRecords(
        entityType === 'LOT' ? entity?.lot_id : entity?.ind_id
      ) || [];
      // 重複判定: date + weight_g の組み合わせで判定（date のみでは誤弾きリスクあり）
      const existingKeys = new Set(
        existingRecs.map(r => (r.record_date || '') + '|' + (r.weight_g != null ? String(r.weight_g) : ''))
      );
      const newRecs = aiResult.records.filter(r => {
        if (!r.date) return false;
        // 日付正規化（YYYY/MM/DD or MM/DD → そのまま比較）
        const key = r.date + '|' + (r.weight_g != null ? String(r.weight_g) : '');
        // 日付のみでも既存にある場合はスキップ（同日同体重は重複）
        if (existingKeys.has(key)) return false;
        // 日付のみ一致でも体重が異なる場合は追加OK（別回測定として扱う）
        return true;
      });
      if (newRecs.length) {
        candidates.push({ key: '_records', label: '体重記録追加', old: '—',
          new: newRecs.map(r => `${r.date} ${r.weight_g}g${r.memo?'/'+r.memo:''}`).join(', '),
          _records: newRecs });
      }
    }
  }

  // 差分確認UI
  const entityId = entity?.lot_id || entity?.ind_id || '';
  const displayId = entity?.display_id || (qrText ? qrText.split(':')[1] : '不明');

  main.innerHTML = `
    ${UI.header('🔬 ラベル読取結果', { back: true, backFn: "routeTo('qr-scan')" })}
    <div class="page-body">

      <!-- 対象カード -->
      <div class="card ${!entity ? 'card-warn' : ''}">
        <div style="font-size:.72rem;color:var(--text3);margin-bottom:4px">読取対象</div>
        ${entity
          ? `<div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;color:var(--gold)">${displayId}</div>
             <div style="font-size:.75rem;color:var(--text3);margin-top:2px">
               ${entityType} / ${entityId}
             </div>`
          : `<div style="color:var(--amber)">⚠️ QRコードを読み取れませんでした</div>
             <div style="font-size:.75rem;color:var(--text3);margin-top:4px">
               QRが不鮮明な可能性があります。テキスト入力から対象を指定してください。
             </div>
             <div style="margin-top:8px">
               <input id="manual-qr-input" class="input" placeholder="LOT:LOT-xxx or IND:IND-xxx">
               <button class="btn btn-ghost btn-sm" style="margin-top:6px;width:100%"
                 onclick="Pages._qrLabelRetarget()">この対象に適用する</button>
             </div>`}
      </div>

      <!-- ラベル画像プレビュー -->
      ${imgDataUrl ? `<div class="card" style="padding:8px">
        <img src="${imgDataUrl}" style="width:100%;border-radius:6px;max-height:200px;object-fit:contain">
      </div>` : ''}

      <!-- 差分候補 -->
      ${candidates.length > 0
        ? `<div class="card" style="border-color:rgba(200,168,75,.3)">
            <div class="card-title" style="color:var(--gold)">📋 読取結果（更新候補）</div>
            <div style="font-size:.72rem;color:var(--text3);margin-bottom:10px">
              変更したい項目にチェックを入れて保存してください
            </div>
            ${candidates.map((c, i) => `
              <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;
                border-bottom:1px solid var(--border);cursor:pointer">
                <input type="checkbox" id="diff-check-${i}" checked
                  style="margin-top:3px;width:18px;height:18px;cursor:pointer;flex-shrink:0">
                <div style="flex:1">
                  <div style="font-size:.82rem;font-weight:700;color:var(--text1)">${c.label}</div>
                  <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">
                    <span style="font-size:.75rem;color:var(--text3);text-decoration:line-through">${c.old}</span>
                    <span style="font-size:.7rem;color:var(--text3)">→</span>
                    <span style="font-size:.82rem;font-weight:700;color:var(--green)">${c.new}</span>
                  </div>
                </div>
              </label>`).join('')}
          </div>`
        : `<div class="card">
            <div style="text-align:center;color:var(--text3);padding:16px">
              ${aiResult ? '✅ 更新候補はありません（既存データと一致）' : '⚠️ AI解析結果を取得できませんでした'}
            </div>
          </div>`}

      <!-- 操作ボタン -->
      <div style="display:flex;gap:10px;margin-top:4px;padding-bottom:8px">
        <button class="btn btn-ghost" style="flex:1" onclick="routeTo('qr-scan')">破棄</button>
        ${candidates.length > 0 && entity
          ? `<button class="btn btn-primary" style="flex:2" id="label-diff-save"
              onclick="Pages._qrLabelDiffSave('${entityType}','${entityId}',${JSON.stringify(candidates).replace(/'/g,"&#39;")})">
              💾 選択した内容を保存
            </button>`
          : ''}
      </div>

    </div>`;

  // JSON は onclick に埋めると問題があるため window 変数経由
  window.__labelDiffCandidates  = candidates;
  window.__labelDiffEntityType  = entityType;
  window.__labelDiffEntityId    = entityId;
  window.__labelDiffAiResult    = aiResult;
};

// ── ラベル差分保存 ────────────────────────────────────────────────
Pages._qrLabelDiffSave = async function () {
  const candidates = window.__labelDiffCandidates || [];
  const entityType = window.__labelDiffEntityType || '';
  const entityId   = window.__labelDiffEntityId   || '';
  const aiResult   = window.__labelDiffAiResult   || {};

  const btn = document.getElementById('label-diff-save');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 保存中...'; }

  const checked = candidates.filter((_, i) =>
    document.getElementById(`diff-check-${i}`)?.checked
  );

  if (!checked.length) {
    UI.toast('保存する項目が選択されていません', 'info');
    if (btn) { btn.disabled = false; btn.textContent = '💾 選択した内容を保存'; }
    return;
  }

  try {
    const updates = {};
    const newRecords = [];

    checked.forEach(c => {
      if (c.key === '_records') {
        newRecords.push(...(c._records || []));
      } else {
        updates[c.key] = c.new;
      }
    });

    // エンティティ更新
    if (Object.keys(updates).length > 0) {
      if (entityType === 'LOT') {
        await API.scan.updateLotFields({ lot_id: entityId, ...updates });
        Store.patchDBItem('lots', 'lot_id', entityId, updates);
      } else if (entityType === 'IND') {
        await API.scan.updateIndFields({ ind_id: entityId, ...updates });
        Store.patchDBItem('individuals', 'ind_id', entityId, updates);
      }
    }

    // 体重記録追加
    for (const rec of newRecords) {
      await API.growth.create({
        target_type: entityType,
        target_id:   entityId,
        weight_g:    rec.weight_g,
        stage:       rec.mat || '',
        note_private: rec.memo || '',
      });
    }

    const count = Object.keys(updates).length + newRecords.length;
    UI.toast(`✅ ${count}件を保存しました`, 'success');

    setTimeout(() => {
      if (entityType === 'LOT')      routeTo('lot-detail',     { lotId:  entityId });
      else if (entityType === 'IND') routeTo('ind-detail',     { indId:  entityId });
      else                           routeTo('qr-scan');
    }, 800);

  } catch(e) {
    UI.toast('保存失敗: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '💾 選択した内容を保存'; }
  }
};

// ── ラベル読取: 手動対象指定 ─────────────────────────────────────
Pages._qrLabelRetarget = async function () {
  const val = document.getElementById('manual-qr-input')?.value?.trim();
  if (!val) return;
  try {
    const res = _qrResolveFromCache(val) || await API.scan.resolve(val);
    if (res?.entity) {
      window.__labelDiffEntityType = res.entity_type;
      window.__labelDiffEntityId   = res.entity?.lot_id || res.entity?.ind_id || '';
      UI.toast('対象を変更しました: ' + (res.entity?.display_id || ''), 'success');
    }
  } catch(e) {
    UI.toast('対象が見つかりません: ' + e.message, 'error');
  }
};

// ════════════════════════════════════════════════════════════════
// 差分入力画面 (qr-diff) ← 既存ロジックをそのまま維持
// ════════════════════════════════════════════════════════════════

Pages.qrDiff = function (params = {}) {
  const res = params.resolve_result;
  if (!res) { routeTo('qr-scan'); return; }

  const main = document.getElementById('main');
  const { entity_type, label_type, entity, missing, line } = res;

  const missingCount = (missing || []).filter(m => m.level === 'required').length;
  const warnCount    = (missing || []).filter(m => m.level === 'warn').length;

  const LABEL_DISPLAY = {
    egg_lot:   '① 卵管理ラベル',
    multi_lot: '② 複数頭飼育ラベル',
    ind_fixed: '③ 個別飼育ラベル',
    set:       '④ 産卵セットラベル',
  };
  const labelName = LABEL_DISPLAY[label_type] || label_type || entity_type;

  main.innerHTML = `
    ${UI.header('スキャン結果', { back: true, backFn: "routeTo('qr-scan')" })}
    <div class="page-body">

      <div class="card" style="
        border-color:${missingCount > 0 ? 'rgba(224,144,64,.4)' : 'rgba(76,175,120,.3)'};
        background:${missingCount > 0 ? 'rgba(224,144,64,.04)' : 'rgba(76,175,120,.04)'}">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div style="flex:1">
            <div style="font-size:.72rem;color:var(--text3);margin-bottom:3px">${labelName}</div>
            <div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;color:var(--gold)">
              ${entity?.display_id || '—'}
            </div>
            ${line ? `<div style="font-size:.75rem;color:var(--text2);margin-top:2px">
              ライン: ${line.display_id}${line.line_name ? ' / ' + line.line_name : ''}
            </div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            ${missingCount > 0
              ? `<div style="background:rgba(224,144,64,.15);border:1px solid rgba(224,144,64,.4);
                  border-radius:99px;padding:4px 10px;font-size:.78rem;color:var(--amber)">
                  ⚠️ ${missingCount}件 未入力
                </div>`
              : `<div style="background:rgba(76,175,120,.15);border:1px solid rgba(76,175,120,.3);
                  border-radius:99px;padding:4px 10px;font-size:.78rem;color:var(--green)">
                  ✅ 入力済み
                </div>`}
            ${warnCount > 0 ? `<div style="font-size:.68rem;color:var(--text3);margin-top:4px">推奨: ${warnCount}件</div>` : ''}
          </div>
        </div>
      </div>

      ${missingCount > 0 ? Pages._qrRenderMissingSection(entity_type, entity, missing, label_type) : ''}
      ${warnCount > 0 ? Pages._qrRenderWarnSection(entity_type, entity, missing.filter(m => m.level === 'warn'), label_type) : ''}
      ${Pages._qrRenderInfoSection(entity_type, entity, line)}

      <div style="display:flex;gap:10px;padding-bottom:8px">
        <button class="btn btn-ghost" style="flex:1" onclick="routeTo('qr-scan')">戻る</button>
        <button class="btn btn-gold" style="flex:2" id="diff-save-btn"
          onclick="Pages._qrDiffSave('${entity_type}', '${entity?.lot_id || entity?.ind_id || entity?.set_id || ''}')">
          💾 保存する
        </button>
      </div>

    </div>`;
};

// 以下は scan.js 既存コードから維持（_qrRenderMissingSection 等）
Pages._qrRenderMissingSection = function (entityType, entity, missing, labelType) {
  const requiredFields = missing.filter(m => m.level === 'required');
  if (!requiredFields.length) return '';
  return `
    <div class="card" style="border-color:rgba(224,144,64,.45);background:rgba(224,144,64,.04)">
      <div class="card-title" style="color:var(--amber)">⚠️ 未入力項目（必須）</div>
      <div class="form-section" id="missing-fields-form">
        ${requiredFields.map(f => Pages._qrRenderFieldInput(entityType, entity, f, labelType, 'required')).join('')}
      </div>
    </div>`;
};

Pages._qrRenderWarnSection = function (entityType, entity, warnFields, labelType) {
  if (!warnFields.length) return '';
  return `
    <div class="card" style="border-color:rgba(91,168,232,.2)">
      <div class="card-title" style="color:var(--blue)">📝 推奨入力</div>
      <div class="form-section" id="warn-fields-form">
        ${warnFields.map(f => Pages._qrRenderFieldInput(entityType, entity, f, labelType, 'warn')).join('')}
      </div>
    </div>`;
};

Pages._qrRenderFieldInput = function (entityType, entity, missingField, labelType, level) {
  const { field, label, hint, current_value } = missingField;
  const borderColor = level === 'required' ? 'rgba(224,144,64,.4)' : 'rgba(91,168,232,.25)';
  const bg          = level === 'required' ? 'rgba(224,144,64,.06)' : 'rgba(91,168,232,.04)';
  const icon        = level === 'required' ? '⚠️' : '📝';
  const widget = Pages._qrFieldWidget(field, label, current_value, entityType, entity);
  return `
    <div style="border:1px solid ${borderColor};border-radius:var(--radius-sm);padding:12px;background:${bg}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span style="font-size:.9rem">${icon}</span>
        <span style="font-size:.82rem;font-weight:700;color:var(--text2)">${label}</span>
        ${hint ? `<span style="font-size:.7rem;color:var(--text3);margin-left:auto">${hint}</span>` : ''}
      </div>
      ${widget}
    </div>`;
};

Pages._qrFieldWidget = function (field, label, currentVal, entityType, entity) {
  if (field === 'sex' || field === 'sex_hint') {
    const isInd = entityType === 'IND';
    const opts  = isInd
      ? [['♂','♂ オス'],['♀','♀ メス'],['不明','不明']]
      : [['♂','♂ 多め'],['♀','♀ 多め'],['混合','混合'],['不明','不明']];
    return `<div style="display:flex;gap:8px;flex-wrap:wrap" id="widget-${field}">
      ${opts.map(([v,lbl]) => `<button class="btn btn-sm btn-ghost diff-choice"
        data-field="${field}" data-value="${v}"
        style="flex:1;min-width:60px;${currentVal===v?'background:var(--green2);color:#fff;border-color:var(--green2)':''}"
        onclick="Pages._qrChoiceSelect(this)">${lbl}</button>`).join('')}
      </div>`;
  }
  if (field === 'size_category') {
    return `<div style="display:flex;gap:8px" id="widget-${field}">
      ${[['大','大型（10L）'],['中','中型（4.8L）'],['小','小型（2.7L）']].map(([v,lbl]) =>
        `<button class="btn btn-sm btn-ghost diff-choice"
          data-field="${field}" data-value="${v}"
          style="flex:1;${currentVal===v?'background:var(--green2);color:#fff;border-color:var(--green2)':''}"
          onclick="Pages._qrChoiceSelect(this)">${lbl}</button>`).join('')}
      </div>`;
  }
  if (field === 'hatch_date') {
    return `<input id="widget-hatch_date" class="input" type="date"
      value="${currentVal||''}" data-field="hatch_date"
      style="border-color:rgba(224,144,64,.4)">`;
  }
  if (field === 'count') {
    return `<div style="display:flex;align-items:center;gap:8px">
      <button class="btn btn-ghost btn-sm" onclick="Pages._qrCountAdj(-1)">−</button>
      <input id="widget-count" class="input" type="number" min="0" max="999"
        value="${currentVal||entity?.count||''}" data-field="count"
        style="text-align:center;font-size:1.3rem;font-weight:700;color:var(--green);
        font-family:var(--font-mono);border-color:rgba(224,144,64,.4)">
      <span style="color:var(--text3)">頭</span>
      <button class="btn btn-ghost btn-sm" onclick="Pages._qrCountAdj(1)">＋</button>
    </div>`;
  }
  return `<input id="widget-${field}" class="input" type="text"
    value="${currentVal||''}" placeholder="${label}を入力" data-field="${field}">`;
};

Pages._qrChoiceSelect = function (btn) {
  const field = btn.dataset.field;
  document.querySelectorAll(`.diff-choice[data-field="${field}"]`).forEach(b => {
    b.style.background = ''; b.style.color = ''; b.style.borderColor = '';
  });
  btn.style.background = 'var(--green2)';
  btn.style.color      = '#fff';
  btn.style.borderColor = 'var(--green2)';
};

Pages._qrCountAdj = function (delta) {
  const el = document.getElementById('widget-count');
  if (!el) return;
  el.value = Math.max(0, (parseInt(el.value) || 0) + delta);
};

Pages._qrRenderInfoSection = function (entityType, entity, line) {
  if (!entity) return '';
  let rows = [];
  if (entityType === 'LOT') {
    rows = [
      ['ロットID',   entity.display_id],
      ['ライン',     line?.display_id || entity.line_id || '—'],
      ['ステージ',   entity.stage || '—'],
      ['孵化日',     entity.hatch_date || '（未入力）'],
      ['頭数',       entity.count || '（未入力）'],
      ['性別区分',   entity.sex_hint || '（未入力）'],
      ['マット種別', entity.mat_type || '—'],
    ];
  } else if (entityType === 'IND') {
    rows = [
      ['個体ID',   entity.display_id],
      ['ライン',   line?.display_id || entity.line_id || '—'],
      ['性別',     entity.sex || '（未入力）'],
      ['孵化日',   entity.hatch_date || '（未入力）'],
      ['現ステージ', entity.current_stage || '—'],
      ['最新体重', entity.latest_weight_g ? entity.latest_weight_g + 'g' : '—'],
    ];
  } else if (entityType === 'SET') {
    rows = [
      ['セットID', entity.display_id],
      ['産卵開始', entity.set_start || '（未入力）'],
      ['採卵数',   entity.total_eggs ? entity.total_eggs + '個' : '（未入力）'],
    ];
  }
  return `
    <div class="card">
      <div class="card-title">📋 確認情報</div>
      <div class="info-list">
        ${rows.map(([k,v]) => {
          const isEmpty = !v || v === '—' || String(v).includes('未入力');
          return `<div class="info-row">
            <span class="info-key">${k}</span>
            <span class="info-val" style="${isEmpty?'color:var(--text3)':''}">${v}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
};

Pages._qrDiffSave = async function (entityType, entityId) {
  const btn = document.getElementById('diff-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 保存中...'; }
  try {
    const updates = {};
    document.querySelectorAll('.diff-choice[style*="green2"]').forEach(b => {
      updates[b.dataset.field] = b.dataset.value;
    });
    document.querySelectorAll('[data-field]').forEach(el => {
      if (el.tagName !== 'BUTTON' && el.value !== undefined && el.value !== '') {
        updates[el.dataset.field] = el.value;
      }
    });
    if (Object.keys(updates).length === 0) {
      UI.toast('更新する項目がありません', 'info');
      return;
    }
    if (entityType === 'LOT')      await API.scan.updateLotFields({ lot_id: entityId, ...updates });
    else if (entityType === 'IND') await API.scan.updateIndFields({ ind_id: entityId, ...updates });
    else if (entityType === 'SET') await API.scan.updateSetFields({ set_id: entityId, ...updates });
    await Store.syncEntityType(entityType === 'LOT' ? 'lots' : entityType === 'IND' ? 'individuals' : 'pairings');
    UI.toast(`✅ 保存しました（${Object.keys(updates).length}件更新）`, 'success');
    setTimeout(() => {
      if (entityType === 'LOT')      routeTo('lot-detail',     { lotId:      entityId });
      else if (entityType === 'IND') routeTo('ind-detail',     { indId:      entityId });
      else if (entityType === 'SET') routeTo('pairing-detail', { pairingId:  entityId });
    }, 1000);
  } catch(e) {
    UI.toast('❌ 保存失敗: ' + (e.message || '不明なエラー'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 保存する'; }
  }
};

// ════════════════════════════════════════════════════════════════
// 体重測定モード - 既存コードをそのまま維持
// ════════════════════════════════════════════════════════════════
const WM_THRESHOLDS = [
  { min: 170, badge: '⭐ 超大型候補', color: '#c8a84b', bg: 'rgba(200,168,75,.15)' },
  { min: 150, badge: '🔥 大型候補',   color: 'var(--amber)', bg: 'rgba(224,144,64,.12)' },
];

Pages.weightMode = function (params = {}) {
  const res = params.resolve_result;
  if (!res || !res.entity) { routeTo('qr-scan', { mode: 'weight' }); return; }
  const main = document.getElementById('main');
  const { entity_type, entity, line, last_growth } = res;
  const displayId = entity.display_id || '—';
  const isLot     = entity_type === 'LOT';
  const stage     = (isLot ? entity.stage : entity.current_stage) || '—';
  const stageDisp = (typeof STAGE_LABELS !== 'undefined' && STAGE_LABELS[stage]) || stage;
  const ageDays   = entity._age?.totalDays ?? entity.ageDays ?? '—';
  const container = (isLot ? entity.container_size : entity.current_container) || '';
  const matType   = (isLot ? entity.mat_type : entity.current_mat) || '';
  const lineDisp  = line?.line_code || line?.display_id || '';
  const entityId  = (isLot ? entity.lot_id : entity.ind_id) || '';
  const lotCount  = isLot ? (parseInt(entity.count, 10) || 0) : 0;
  // prevWeight: resolve_result の last_growth → Storeキャッシュ → latest_weight_g の3段階
  const _lgFromRes   = last_growth && last_growth.weight_g != null && String(last_growth.weight_g) !== ''
    ? last_growth : null;
  const _lgFromStore = _lgFromRes ? null : _getLastGrowthFromStore(
    entity_type, entityId,
    isLot ? entity.latest_weight_g : entity.latest_weight_g
  );
  const _effectiveLg = _lgFromRes || _lgFromStore || null;

  const prevWeight  = _effectiveLg && parseFloat(_effectiveLg.weight_g) > 0
    ? parseFloat(_effectiveLg.weight_g) : null;
  const prevDate    = _effectiveLg?.record_date || '';
  const prevAgeDays = _effectiveLg?.age_days    || '';
  Pages._wmState = { entityType: entity_type, entityId, stage, container, matType, prevWeight, prevDate, displayId, lotCount };

  // プリセット・前回入力を取得
  const _wmPresetId  = _wmGetPresetId();
  const _wmPreset    = _WM_PRESETS[_wmPresetId] || _WM_PRESETS.normal;
  const _li          = _wmGetLastInput();
  // mat が T2 のときだけモルトを表示
  const _showMolt    = (_li.mat || _wmPreset.mat) === 'T2';

  main.innerHTML = `
    ${UI.header('⚖️ 体重測定', { back: true, backFn: "routeTo('qr-scan',{mode:'weight'})" })}
    <div style="position:absolute;top:14px;right:14px;z-index:10">
      <button onclick="routeTo('qr-scan',{mode:'weight'})"
        style="background:none;border:none;cursor:pointer;font-size:1.3rem;padding:6px;
        color:var(--text3);opacity:.7" title="再スキャン">🔄</button>
    </div>
    <div class="page-body has-quick-bar">
      <div class="quick-info-bar">
        <div style="flex:1;min-width:0">
          <div class="quick-info-id" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${displayId}</div>
          <div style="display:flex;gap:5px;align-items:center;margin-top:4px;flex-wrap:wrap">
            <span style="background:rgba(76,175,120,.15);color:var(--green);font-size:.68rem;padding:1px 6px;border-radius:99px;font-weight:600">${stageDisp}</span>
            ${isLot ? `<span style="font-size:.7rem;color:var(--text3)">${entity.count||'?'}頭</span>` : `<span style="font-size:.7rem;color:var(--text3)">${entity.sex||''}</span>`}
            ${lineDisp ? `<span style="font-size:.68rem;color:var(--text3)">L:${lineDisp}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="quick-info-age">${ageDays !== '—' ? ageDays : '—'}</div>
          <div class="quick-info-age-label">日齢</div>
        </div>
      </div>

      <!-- プリセット選択バー -->
      <div style="display:flex;gap:5px;margin-bottom:6px">
        <button class="btn btn-sm ${_wmPresetId==='normal'?'btn-primary':'btn-ghost'}" style="flex:1;font-size:.75rem"
          data-preset="normal" onclick="Pages._wmApplyPreset('normal')">通常</button>
        <button class="btn btn-sm ${_wmPresetId==='t1'?'btn-primary':'btn-ghost'}" style="flex:1;font-size:.75rem"
          data-preset="t1" onclick="Pages._wmApplyPreset('t1')">T1移行</button>
        <button class="btn btn-sm ${_wmPresetId==='t2'?'btn-primary':'btn-ghost'}" style="flex:1;font-size:.75rem"
          data-preset="t2" onclick="Pages._wmApplyPreset('t2')">T2初回</button>
      </div>

      <div class="card" style="border-color:rgba(76,175,120,.35);padding:14px">
        <div style="text-align:center;font-size:.72rem;font-weight:700;color:var(--text3);letter-spacing:.08em;margin-bottom:8px">体重 (g)</div>
        <!-- 微調整ボタン上段 -->
        <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:8px">
          <button class="btn btn-ghost btn-sm" style="min-width:44px;font-size:.85rem" id="wm-adj-m10"
            onclick="Pages._wmAdjWeight(-10)" onmousedown="Pages._wmAdjStart(-10)" onmouseup="Pages._wmAdjStop()" ontouchend="Pages._wmAdjStop()">−10</button>
          <button class="btn btn-ghost btn-sm" style="min-width:44px;font-size:.85rem" id="wm-adj-m1"
            onclick="Pages._wmAdjWeight(-1)"  onmousedown="Pages._wmAdjStart(-1)"  onmouseup="Pages._wmAdjStop()" ontouchend="Pages._wmAdjStop()">−1</button>
          <input id="wm-weight" type="number" inputmode="decimal" step="0.1" min="0.1" max="999.9"
            placeholder="0.0" autocomplete="off" class="num-input-xl" style="width:140px;color:var(--green)"
            oninput="Pages._wmUpdateDelta(this.value)"
            onkeydown="if(event.key==='Enter'&&!event.isComposing){Pages._wmSave()}">
          <button class="btn btn-ghost btn-sm" style="min-width:44px;font-size:.85rem" id="wm-adj-p1"
            onclick="Pages._wmAdjWeight(+1)"  onmousedown="Pages._wmAdjStart(+1)"  onmouseup="Pages._wmAdjStop()" ontouchend="Pages._wmAdjStop()">+1</button>
          <button class="btn btn-ghost btn-sm" style="min-width:44px;font-size:.85rem" id="wm-adj-p10"
            onclick="Pages._wmAdjWeight(+10)" onmousedown="Pages._wmAdjStart(+10)" onmouseup="Pages._wmAdjStop()" ontouchend="Pages._wmAdjStop()">+10</button>
        </div>
        <div style="text-align:center;font-size:.72rem;color:var(--text3)">g</div>
        <div id="wm-delta" style="text-align:center;min-height:28px;margin-top:8px;font-size:.92rem;transition:all .15s">
          ${prevWeight !== null
            ? `<span style="color:var(--text3)">前回 <b>${prevWeight}g</b>${prevDate ? ' （' + prevDate + '）' : ''} から —</span>`
            : `<span style="color:var(--text3)">（前回体重なし・初回記録）</span>`}
        </div>
      </div>

      ${isLot ? `<div class="card" style="padding:14px">
        <div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:10px">🔢 頭数変化（マット交換時）</div>
        <div class="count-row">
          <div>
            <div style="font-size:.68rem;color:var(--text3);margin-bottom:4px;text-align:center">交換前</div>
            <input id="wm-before" type="number" inputmode="numeric" class="num-input-xl" style="font-size:2rem"
              min="0" max="999" placeholder="${lotCount||'—'}" value="${lotCount||''}" oninput="Pages._wmCalcAttrition()">
          </div>
          <div class="count-row-arrow">→</div>
          <div>
            <div style="font-size:.68rem;color:var(--text3);margin-bottom:4px;text-align:center">交換後</div>
            <input id="wm-after" type="number" inputmode="numeric" class="num-input-xl" style="font-size:2rem"
              min="0" max="999" placeholder="—" oninput="Pages._wmCalcAttrition()">
          </div>
        </div>
        <div id="wm-attrition" class="count-attrition"></div>
      </div>` : ''}

      <!-- ─── 同時更新パネル ─── -->
      <div class="card" style="margin-top:8px;padding:12px 14px">
        <div class="form-section">

          <!-- 記録日 -->
          <div class="field">
            <label class="field-label">記録日</label>
            <input id="wm-record-date" type="date" class="input"
              value="${new Date().toISOString().split('T')[0]}"
              max="${new Date().toISOString().split('T')[0]}">
          </div>

          <!-- 区分: IND=単一ボタン / LOT=複数チェックボックス -->
          <div class="field">
            <label class="field-label">区分</label>
            ${isLot ? `
              <!-- LOT: 複数選択チェックボックス -->
              <div style="display:flex;gap:8px">
                ${['大','中','小'].map(c => {
                  const checked = (_li.sizeCat||'').split(',').map(s=>s.trim()).includes(c);
                  return '<label style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;' +
                    'padding:9px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:.85rem">' +
                    '<input type="checkbox" class="wm-size-cat-chk" value="' + c + '" ' +
                    (checked?'checked':'') + ' style="width:16px;height:16px">' + c + '</label>';
                }).join('')}
              </div>
            ` : `
              <!-- IND: 単一選択ボタン -->
              <input type="hidden" id="wm-size-cat" value="${_li.sizeCat||''}">
              <div style="display:flex;gap:6px">
                ${[['大','大'],['中','中'],['小','小'],['','—']].map(([v,l]) =>
                  '<button class="btn btn-sm ' + (_li.sizeCat===v?'btn-primary':'btn-ghost') + '" ' +
                  'style="flex:1" data-wm="size-cat" data-val="' + v + '" ' +
                  'onclick="Pages._wmBtnSel(this,\'wm-size-cat\')">' + l + '</button>'
                ).join('')}
              </div>
            `}
          </div>

          <!-- 交換種別 -->
          <div class="field">
            <label class="field-label">交換種別</label>
            <input type="hidden" id="wm-exchange" value="${_li.exchange||''}">
            <div style="display:flex;gap:6px">
              ${[['全交換','全交換'],['追加','追加'],['','なし']].map(([v,l]) =>
                '<button class="btn btn-sm ' + (_li.exchange===v?'btn-primary':'btn-ghost') + '" ' +
                'style="flex:1" data-wm="exchange" data-val="' + v + '" ' +
                'onclick="Pages._wmBtnSel(this,\'wm-exchange\')">' + l + '</button>'
              ).join('')}
            </div>
          </div>

          <!-- マット -->
          <div class="field">
            <label class="field-label">マット</label>
            <input type="hidden" id="wm-mat" value="${_li.mat||''}">
            <div style="display:flex;gap:6px">
              ${[['T1','T1'],['T2','T2'],['T3','T3'],['','—']].map(([v,l]) =>
                '<button class="btn btn-sm ' + (_li.mat===v?'btn-primary':'btn-ghost') + '" ' +
                'style="flex:1" data-wm="mat" data-val="' + v + '" ' +
                'onclick="Pages._wmBtnSelMat(this)">' + l + '</button>'
              ).join('')}
            </div>
          </div>

          <!-- モルト（T2のみ表示） -->
          <div class="field" id="wm-molt-field" style="${_showMolt?'':'display:none'}">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
              <input type="checkbox" id="wm-molt-check"
                ${_li.molt?'checked':''}
                style="width:20px;height:20px;cursor:pointer">
              <span class="field-label" style="margin:0">モルト使用 <span style="font-size:.7rem;color:var(--text3)">(T2)</span></span>
            </label>
          </div>

          <!-- ステージ -->
          <div class="field">
            <label class="field-label">ステージ</label>
            <input type="hidden" id="wm-stage" value="${_li.stage||''}">
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${[['L1','L1'],['L2_EARLY','L2前'],['L2_LATE','L2後'],['L3_EARLY','L3前'],['L3_MID','L3中'],['L3_LATE','L3後'],['','—']].map(([v,l]) =>
                '<button class="btn btn-sm ' + (_li.stage===v?'btn-primary':'btn-ghost') + '" ' +
                'style="flex:1;min-width:40px;font-size:.75rem" data-wm="stage" data-val="' + v + '" ' +
                'onclick="Pages._wmBtnSel(this,\'wm-stage\')">' + l + '</button>'
              ).join('')}
            </div>
          </div>

          <!-- 容器 -->
          <div class="field">
            <label class="field-label">容器</label>
            <input type="hidden" id="wm-container" value="${_li.container||''}">
            <div style="display:flex;gap:6px">
              ${[['1.8L','1.8L'],['2.7L','2.7L'],['4.8L','4.8L'],['','—']].map(([v,l]) =>
                '<button class="btn btn-sm ' + (_li.container===v?'btn-primary':'btn-ghost') + '" ' +
                'style="flex:1" data-wm="container" data-val="' + v + '" ' +
                'onclick="Pages._wmBtnSel(this,\'wm-container\')">' + l + '</button>'
              ).join('')}
            </div>
          </div>

          <!-- 頭幅 + メモ（折りたたみ） -->
          <div>
            <div class="collapse-toggle" onclick="Pages._wmToggleExtra(this)" style="margin-top:4px">
              <span style="font-size:.78rem;color:var(--text3)">📝 頭幅 / メモ（任意）</span>
              <span style="font-size:.7rem;transition:transform .2s">▼</span>
            </div>
            <div id="wm-extra" class="collapse-body closed">
              <div style="margin-top:6px">
                <input id="wm-head" class="input" type="number" inputmode="decimal" step="0.1" min="0" max="99" placeholder="頭幅 (mm)" style="margin-bottom:6px">
                <textarea id="wm-note" class="input" rows="2" placeholder="観察メモ（状態・色艶など）"></textarea>
              </div>
            </div>
          </div>

        </div>
      </div>

      ${prevWeight !== null ? `<div class="card" style="padding:10px 14px;margin-top:8px">
        <div style="font-size:.68rem;color:var(--text3);margin-bottom:4px">前回記録</div>
        <div style="display:flex;align-items:baseline;gap:10px">
          <span style="font-size:1.5rem;font-weight:700;color:var(--text2);font-family:var(--font-mono)">${prevWeight}g</span>
          <span style="font-size:.75rem;color:var(--text3)">${prevDate ? prevDate : '（日付不明）'}${prevAgeDays ? ' / ' + prevAgeDays + '日齢' : ''}</span>
        </div>
      </div>` : ''}
    </div>

    <div class="quick-action-bar">
      <button id="wm-save-btn" class="btn btn-gold btn-xl" style="flex:1" onclick="Pages._wmSave()">
        💾 保存して次へ
      </button>
    </div>`;

  setTimeout(() => document.getElementById('wm-weight')?.focus(), 120);
};

Pages._wmCalcAttrition = function () {
  const before = parseInt(document.getElementById('wm-before')?.value, 10);
  const after  = parseInt(document.getElementById('wm-after')?.value,  10);
  const dispEl = document.getElementById('wm-attrition');
  if (!dispEl) return;
  if (isNaN(before) || isNaN(after)) { dispEl.textContent = ''; return; }
  const attrition = before - after;
  if (attrition > 0)       { dispEl.textContent = `減耗 ${attrition} 頭`; dispEl.style.color = 'var(--red)'; }
  else if (attrition === 0) { dispEl.textContent = '変化なし'; dispEl.style.color = 'var(--text3)'; }
  else                      { dispEl.textContent = `⚠️ 後の方が多い (${Math.abs(attrition)}頭増)`; dispEl.style.color = 'var(--amber)'; }
};

Pages._wmUpdateDelta = function (rawVal) {
  const el       = document.getElementById('wm-delta');
  if (!el) return;
  const cur      = parseFloat(rawVal);
  const prev     = Pages._wmState?.prevWeight ?? null;
  const prevDate = Pages._wmState?.prevDate   || '';

  // 入力値がない・無効値 → 前回体重情報を表示（差分ではなく現状）
  if (!rawVal || isNaN(cur) || cur <= 0) {
    if (prev !== null) {
      const dateStr = prevDate ? `（${prevDate}）` : '';
      el.innerHTML = `<span style="color:var(--text3)">前回 <b>${prev}g</b>${dateStr}</span>`;
    } else {
      el.innerHTML = `<span style="color:var(--text3)">前回体重なし・初回記録</span>`;
    }
    return;
  }

  // 閾値バッジ
  let thresholdHtml = '';
  for (const t of WM_THRESHOLDS) {
    if (cur >= t.min) {
      thresholdHtml = `<div style="display:inline-block;background:${t.bg};border:1px solid ${t.color};` +
        `border-radius:99px;padding:3px 12px;font-size:.82rem;font-weight:700;color:${t.color};margin-bottom:4px">` +
        `${t.badge}</div>`;
      break;
    }
  }

  // 前回体重なし → 初回記録バッジ
  if (prev === null) {
    el.innerHTML = `${thresholdHtml}<div style="color:var(--text2)">📝 初回記録: <b>${cur}g</b></div>`;
    return;
  }

  // 差分表示（前回体重あり + 入力値あり）
  const diff       = Math.round((cur - prev) * 10) / 10;
  const isPos      = diff > 0;
  const isNeg      = diff < 0;
  const arrow      = isPos ? '↑' : isNeg ? '↓' : '→';
  const color      = isPos ? 'var(--green)' : isNeg ? 'var(--red)' : 'var(--text3)';
  const sign       = isPos ? '+' : '';
  const celebrate  = isPos && diff >= 5 ? ' 🎉' : '';
  const dateStr    = prevDate ? `（${prevDate}）` : '';
  el.innerHTML = `${thresholdHtml}` +
    `<span style="color:${color};font-weight:700;font-size:1.1rem">${arrow} ${sign}${diff}g${celebrate}</span>` +
    `<span style="color:var(--text3);font-size:.75rem;margin-left:6px">前回 ${prev}g${dateStr}</span>`;
};

Pages._wmSave = async function () {
  const state    = Pages._wmState;
  const weightEl = document.getElementById('wm-weight');
  const rawVal   = weightEl?.value;
  const weightVal = parseFloat(rawVal);
  if (!rawVal || isNaN(weightVal) || weightVal <= 0 || weightVal > 999.9) {
    UI.toast('体重を入力してください（0.1〜999.9g）', 'error');
    weightEl?.focus(); return;
  }
  if (!state?.entityId) { UI.toast('対象IDが不明です。再スキャンしてください', 'error'); return; }
  const btn = document.getElementById('wm-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 保存中...'; }

  try {
    // ── 入力値の収集 ─────────────────────────────────────────
    const headVal      = parseFloat(document.getElementById('wm-head')?.value);
    const noteVal      = document.getElementById('wm-note')?.value?.trim() || '';
    const exchangeVal  = document.getElementById('wm-exchange')?.value || '';
    // 区分: LOT=チェックボックス複数選択, IND=hidden input 単一値
    const _sizeCatChks = document.querySelectorAll('.wm-size-cat-chk:checked');
    const sizeCatVal = _sizeCatChks.length > 0
      ? Array.from(_sizeCatChks).map(c => c.value).join(',')   // LOT: カンマ区切り
      : (document.getElementById('wm-size-cat')?.value || ''); // IND: 単一値
    // 記録日: ユーザー指定 or 今日
    const recordDateRaw = document.getElementById('wm-record-date')?.value || '';
    const recordDateVal = recordDateRaw ? recordDateRaw.replace(/-/g, '/') : new Date().toISOString().split('T')[0].replace(/-/g, '/');
    const matVal       = document.getElementById('wm-mat')?.value       || '';  // 空='変更なし'
    const stageVal     = document.getElementById('wm-stage')?.value     || '';  // 空='変更なし'
    const containerVal = document.getElementById('wm-container')?.value || '';  // 空='変更なし'
    // モルト: T2のみチェックボックスから取得（T2以外は常にfalse）
    const isT2         = (matVal || state.matType) === 'T2';
    const moltChecked  = isT2 ? (document.getElementById('wm-molt-check')?.checked || false) : false;
    const moltVal      = moltChecked ? 'on' : 'off';
    // mat_type の表示: T2かつモルトONなら 'T2' として保存（メモに(M)付記）
    const matNote      = (isT2 && moltChecked) ? ' [T2(M)]' : '';

    // 使用するステージ・容器・マット（入力 > 前回状態 の優先順）
    const effectiveStage    = stageVal     || state.stage     || '';
    const effectiveContainer= containerVal || state.container || '';
    const effectiveMat      = matVal       || state.matType   || '';
    // 区分: 入力があれば更新（LOT=複数可のためそのまま、IND=単一）
    const effectiveSizeCat  = sizeCatVal;

    const beforeRaw   = document.getElementById('wm-before')?.value;
    const afterRaw    = document.getElementById('wm-after')?.value;
    const beforeCount = beforeRaw !== undefined && beforeRaw !== '' ? parseInt(beforeRaw, 10) : undefined;
    const afterCount  = afterRaw  !== undefined && afterRaw  !== '' ? parseInt(afterRaw,  10) : undefined;

    // ── 1. growth record 作成（体重 + 状態スナップショット）──────
    const growthData = {
      target_type:  state.entityType,
      target_id:    state.entityId,
      record_date:  recordDateVal,     // ユーザー指定日（後日入力対応）
      stage:        effectiveStage,
      weight_g:     weightVal,
      container:    effectiveContainer,
      mat_type:     effectiveMat,
      before_count: beforeCount,
      after_count:  afterCount,
    };
    if (!isNaN(headVal) && headVal > 0) growthData.head_width_mm = headVal;
    if (noteVal || matNote) growthData.note_private = (noteVal + matNote).trim();
    if (exchangeVal) growthData.exchange_type = exchangeVal;
    await API.growth.create(growthData);

    // ── 2. 本体（IND / LOT）への反映 ─────────────────────────
    const entityUpdates = {};
    if (state.entityType === 'IND') {
      entityUpdates.latest_weight_g = weightVal;
      if (stageVal)        entityUpdates.current_stage     = stageVal;
      if (containerVal)    entityUpdates.current_container = containerVal;
      if (matVal)          entityUpdates.current_mat       = matVal;
      if (effectiveSizeCat)entityUpdates.size_category     = effectiveSizeCat;
      entityUpdates.mat_molt = moltChecked;  // T2以外は常にfalse
      if (Object.keys(entityUpdates).length) {
        await API.individual.update({ ind_id: state.entityId, ...entityUpdates }).catch(e => {
          console.warn('[wmSave] individual update failed:', e.message);
        });
        Store.patchDBItem('individuals', 'ind_id', state.entityId, entityUpdates);
      }
      await Store.syncEntityType('individuals').catch(() => {});
    }
    if (state.entityType === 'LOT') {
      if (stageVal)        entityUpdates.stage          = stageVal;
      if (containerVal)    entityUpdates.container_size = containerVal;
      if (matVal)          entityUpdates.mat_type       = matVal;
      if (effectiveSizeCat)entityUpdates.size_category  = effectiveSizeCat;
      entityUpdates.mat_molt = moltChecked;
      if (afterCount !== undefined) {
        entityUpdates.count = afterCount;
        if (afterCount === 0) entityUpdates.status = 'individualized';
      }
      if (Object.keys(entityUpdates).length) {
        await API.lot.update({ lot_id: state.entityId, ...entityUpdates }).catch(e => {
          console.warn('[wmSave] lot update failed:', e.message);
        });
        Store.patchDBItem('lots', 'lot_id', state.entityId, entityUpdates);
      }
    }
    // growthMap を即時更新（次スキャン時の前回体重表示に反映）
    try {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
      Store.addGrowthRecord(state.entityId, {
        target_type:  state.entityType,
        target_id:    state.entityId,
        record_date:  recordDateVal,
        weight_g:     weightVal,
        stage:        effectiveStage,
        mat_type:     effectiveMat,
        container:    effectiveContainer,
      });
    } catch(_) {}
    await Store.syncEntityType('growth').catch(() => {});

    // ── 3. 前回入力値を引継ぎ用に保存（localStorage永続化）────
    _wmSaveLastInput({
      mat:       matVal,
      molt:      moltChecked,
      stage:     stageVal,
      container: containerVal,
      exchange:  exchangeVal,
      sizeCat:   sizeCatVal,
    });

    UI.toast('✅ ' + weightVal + 'g を保存しました', 'success');
    // 保存して次へ: QRスキャン待機に戻る
    routeTo('qr-scan', { mode: 'weight' });
  } catch (e) {
    UI.toast('❌ 保存失敗: ' + (e.message || '不明なエラー'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '💾 保存して次へ'; }
  }
};

// ── プリセット適用 ───────────────────────────────────────────
Pages._wmApplyPreset = function (presetId) {
  if (!_WM_PRESETS[presetId]) return;
  _wmSetPresetId(presetId);
  const p = _WM_PRESETS[presetId];

  // hidden input に値をセット
  const setHidden = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setHidden('wm-mat',       p.mat);
  setHidden('wm-stage',     p.stage);
  setHidden('wm-container', p.container);
  setHidden('wm-exchange',  p.exchange);

  // ボタン群のアクティブ状態を更新
  ['mat','stage','container','exchange','size-cat'].forEach(group => {
    document.querySelectorAll('[data-wm="' + group + '"]').forEach(b => {
      const isActive = b.dataset.val === (group === 'mat' ? p.mat
        : group === 'stage' ? p.stage
        : group === 'container' ? p.container
        : group === 'exchange' ? p.exchange : '');
      b.className = 'btn btn-sm ' + (isActive ? 'btn-primary' : 'btn-ghost');
      b.style.flex = '1';
    });
  });

  // モルトチェックボックス
  const mc = document.getElementById('wm-molt-check');
  if (mc) mc.checked = !!p.molt;
  Pages._wmOnMatChange(p.mat);

  // プリセットボタンのハイライト更新（data-preset 属性で特定）
  ['normal','t1','t2'].forEach(id => {
    const b = document.querySelector('[data-preset="' + id + '"]');
    if (!b) return;
    b.className = 'btn btn-sm ' + (id === presetId ? 'btn-primary' : 'btn-ghost');
    b.style.flex = '1';
    b.style.fontSize = '.75rem';
  });

  // LOT の区分チェックボックスがあれば全て外す（プリセットは区分を変更しない）
  // 見た目と内部値のズレを防ぐため現在のチェック状態をそのまま維持
  // → sizeCat は既存値で引き継ぐ（_wmSaveLastInput の merge ロジックが空文字を無視する）
  _wmSaveLastInput({ mat: p.mat, molt: p.molt, stage: p.stage,
                     container: p.container, exchange: p.exchange, sizeCat: '' });
  UI.toast(p.label + ' モードを適用しました', 'success', 1500);
};

// ── ボタン式セレクタ共通ハンドラ ─────────────────────────────
// 同グループの他ボタンを ghost に戻してから自分を primary に
Pages._wmBtnSel = function (btn, hiddenId) {
  const group = btn.dataset.wm;
  document.querySelectorAll('[data-wm="' + group + '"]').forEach(b => {
    b.className = 'btn btn-sm btn-ghost';
    b.style.flex = '1'; b.style.minWidth = b.style.minWidth;
  });
  btn.className = 'btn btn-sm btn-primary';
  btn.style.flex = '1';
  const h = document.getElementById(hiddenId);
  if (h) h.value = btn.dataset.val;
};

// マット選択: モルト欄の表示切替も同時に行う
Pages._wmBtnSelMat = function (btn) {
  Pages._wmBtnSel(btn, 'wm-mat');
  Pages._wmOnMatChange(btn.dataset.val);
};

// ── マット変更時のモルト欄切替 ───────────────────────────────
Pages._wmOnMatChange = function (matVal) {
  const field = document.getElementById('wm-molt-field');
  if (!field) return;
  const isT2 = matVal === 'T2';
  field.style.display = isT2 ? '' : 'none';
  if (!isT2) {
    const mc = document.getElementById('wm-molt-check');
    if (mc) mc.checked = false;  // T2以外はfalseに強制
  }
};

// ── 体重微調整ボタン ─────────────────────────────────────────
Pages._wmAdjWeight = function (delta) {
  const el = document.getElementById('wm-weight');
  if (!el) return;
  const cur = parseFloat(el.value) || 0;
  const next = Math.round((cur + delta) * 10) / 10;
  el.value = Math.max(0, next);
  Pages._wmUpdateDelta(el.value);
};

// 長押し連続増減
let _wmAdjTimer = null;
let _wmAdjInterval = null;
Pages._wmAdjStart = function (delta) {
  // 300ms 後に 100ms 間隔で連続増減
  _wmAdjTimer = setTimeout(() => {
    _wmAdjInterval = setInterval(() => Pages._wmAdjWeight(delta), 100);
  }, 350);
};
Pages._wmAdjStop = function () {
  if (_wmAdjTimer)    { clearTimeout(_wmAdjTimer);   _wmAdjTimer    = null; }
  if (_wmAdjInterval) { clearInterval(_wmAdjInterval); _wmAdjInterval = null; }
};

// ── モルトボタントグル（後方互換用） ─────────────────────────
Pages._wmSetMolt = function (val) {
  // 旧ボタン式は削除済み、後方互換のみ
  window._wmCurrentMolt = val;
};

Pages._wmShowComplete = function (entityType, entityId, weight) {
  const main = document.getElementById('main');
  const body = main?.querySelector('.page-body');
  if (!body) return;
  const detailRoute = entityType === 'IND' ? 'ind-detail' : 'lot-detail';
  const detailParam = entityType === 'IND' ? 'indId'      : 'lotId';
  const bannerEl = document.createElement('div');
  bannerEl.style.cssText = 'background:linear-gradient(135deg,rgba(45,122,82,.22),rgba(76,175,120,.08));border:1px solid rgba(76,175,120,.45);border-radius:var(--radius);padding:20px 16px;text-align:center;margin-bottom:14px;';
  const scanBtn = document.createElement('button');
  scanBtn.className = 'btn btn-ghost'; scanBtn.style.cssText = 'flex:1;padding:12px';
  scanBtn.textContent = '📷 次をスキャン';
  scanBtn.onclick = () => routeTo('qr-scan', { mode: 'weight' });
  const detailBtn = document.createElement('button');
  detailBtn.className = 'btn btn-primary'; detailBtn.style.cssText = 'flex:1;padding:12px';
  detailBtn.textContent = '詳細を見る';
  detailBtn.onclick = () => { const p = {}; p[detailParam] = entityId; routeTo(detailRoute, p); };
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;margin-top:16px';
  btnRow.appendChild(scanBtn); btnRow.appendChild(detailBtn);
  bannerEl.innerHTML = '<div style="font-size:2.2rem;margin-bottom:6px">✅</div>' +
    '<div style="font-size:1.15rem;font-weight:700;color:var(--green)">' + weight + 'g を記録しました</div>' +
    '<div style="font-size:.78rem;color:var(--text3);margin-top:4px">GROWTHテーブルに保存完了</div>';
  bannerEl.appendChild(btnRow);
  body.insertBefore(bannerEl, body.firstChild);
  if (entityType !== 'LOT') { main.scrollTop = 0; return; }
  const currentLot = Store.getLot(entityId);
  if (!currentLot) { main.scrollTop = 0; return; }
  const sameLine  = Store.filterLots({ line_id: currentLot.line_id, status: 'active' }).filter(l => l.lot_id !== entityId);
  const candidates = sameLine.length ? sameLine : Store.filterLots({ status: 'active' }).filter(l => l.lot_id !== entityId).slice(0, 6);
  if (!candidates.length) { main.scrollTop = 0; return; }
  const nextBarEl = document.createElement('div');
  nextBarEl.style.cssText = 'margin-top:10px';
  const barLabel = document.createElement('div');
  barLabel.style.cssText = 'font-size:.72rem;color:var(--text3);margin-bottom:6px;font-weight:700';
  barLabel.textContent = '📦 次のロットへ（同ライン）';
  nextBarEl.appendChild(barLabel);
  const btnScroll = document.createElement('div');
  btnScroll.style.cssText = 'display:flex;gap:7px;overflow-x:auto;padding-bottom:2px';
  candidates.slice(0, 6).forEach(function(l) {
    const line = Store.getLine(l.line_id);
    const code = line ? (line.line_code || line.display_id) : l.display_id;
    const btn2 = document.createElement('button');
    btn2.style.cssText = 'flex-shrink:0;padding:6px 12px;border-radius:20px;background:var(--surface2);border:1px solid var(--border);font-size:.78rem;cursor:pointer;white-space:nowrap;';
    btn2.innerHTML = '<span style="color:var(--gold);font-weight:700">' + code + '</span><span style="color:var(--text3);margin-left:4px">' + l.count + '頭</span>';
    btn2.onclick = (function(lotId, lotLineId) {
      return function() {
        const lot2 = Store.getLot(lotId);
        const ln2  = Store.getLine(lotLineId);
        if (lot2) routeTo('weight-mode', { resolve_result: { entity_type: 'LOT', entity: lot2, line: ln2 || {}, last_growth: null } });
        else      routeTo('lot-detail', { lotId });
      };
    })(l.lot_id, l.line_id);
    btnScroll.appendChild(btn2);
  });
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'flex-shrink:0;padding:6px 12px;border-radius:20px;background:transparent;border:1px solid var(--border);font-size:.78rem;cursor:pointer;color:var(--text3);';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => nextBarEl.remove();
  btnScroll.appendChild(closeBtn);
  nextBarEl.appendChild(btnScroll);
  bannerEl.insertAdjacentElement('afterend', nextBarEl);
  main.scrollTop = 0;
};

Pages._wmToggleExtra = function (btn) {
  const body  = document.getElementById('wm-extra');
  const arrow = btn?.querySelector('span:last-child');
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  body.classList.toggle('closed', isOpen);
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
};

// ════════════════════════════════════════════════════════════════
// T1交換 QR連続処理モード（既存のまま維持）
// ════════════════════════════════════════════════════════════════
Pages.qrScanT1 = function () {
  const main = document.getElementById('main');
  function _render(lotInfo, phase) {
    main.innerHTML = `
      ${UI.header('T1交換 連続処理', { back: true })}
      <div class="page-body">
        <div style="display:flex;gap:4px;margin-bottom:12px">
          ${['スキャン','分割入力','完了'].map((s,i) => {
            const active = (i===0&&phase==='scan')||(i===1&&phase==='split')||(i===2&&phase==='done');
            return `<div style="flex:1;padding:6px;text-align:center;border-radius:8px;font-size:.75rem;
              background:${active?'var(--green)':'var(--bg2)'};color:${active?'#fff':'var(--text3)'}">` + s + '</div>';
          }).join('')}
        </div>
        ${phase === 'scan'  ? _scanPhase() : ''}
        ${phase === 'split' && lotInfo ? _splitPhase(lotInfo) : ''}
        ${phase === 'done'  && lotInfo ? _donePhase(lotInfo)  : ''}
      </div>`;
    if (phase === 'scan') _bindScanEvents();
  }
  function _scanPhase() {
    return `<div class="card card-gold" style="text-align:center;padding:20px">
      <div style="font-size:2rem;margin-bottom:8px">📷</div>
      <div style="font-weight:700;margin-bottom:4px">QRコードをスキャン</div>
      <div style="font-size:.8rem;color:var(--text3)">ロットQRコードを読み込んでください</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <input id="t1-qr-input" class="input" placeholder="QR入力 / 手動入力" style="flex:1">
      <button class="btn btn-primary" onclick="Pages._t1ResolveQR()">確認</button>
    </div>
    <button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="Pages._t1StartCamera()">📷 カメラで読み取り</button>`;
  }
  function _splitPhase(lot) {
    const count = parseInt(lot.count, 10) || 1;
    const half  = Math.floor(count / 2);
    return `<div class="card" style="background:var(--bg2)">
      <div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--gold)">${lot.display_id}</div>
      <div style="font-size:.85rem;color:var(--text3);margin-top:4px">${lot.stage||'T0'} / ${count}頭 / ${lot.container_size||'—'}</div>
    </div>
    <div style="margin-top:12px">
      <div style="font-size:.85rem;font-weight:600;margin-bottom:8px">分割数を入力してください（合計 ≤ ${count}頭）</div>
      <div id="t1-split-rows">
        <div class="split-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <span style="font-family:var(--font-mono);color:var(--gold);min-width:30px">-A</span>
          <input type="number" class="input t1-split-count" min="1" max="${count}" value="${half}" oninput="Pages._t1UpdateTotal(${count})">
          <span style="font-size:.8rem;color:var(--text3)">頭</span>
        </div>
        <div class="split-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <span style="font-family:var(--font-mono);color:var(--gold);min-width:30px">-B</span>
          <input type="number" class="input t1-split-count" min="1" max="${count}" value="${count-half}" oninput="Pages._t1UpdateTotal(${count})">
          <span style="font-size:.8rem;color:var(--text3)">頭</span>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="Pages._t1AddSplitRow(${count})">＋ ロット追加</button>
      <div id="t1-split-total" style="font-size:.82rem;color:var(--amber);margin-top:6px">合計: ${count}頭 / 最大${count}頭</div>
    </div>
    <div style="margin-top:12px">
      <div style="font-size:.85rem;font-weight:600;margin-bottom:6px">容器サイズ</div>
      <div style="display:flex;gap:6px">
        ${['1.1L','2.7L','4.8L','10L'].map(s => `<button class="pill ${s===lot.container_size?'active':''}" id="t1-container-${s.replace('.','_')}" onclick="Pages._t1SelectContainer('${s}')">${s}</button>`).join('')}
      </div>
      <input type="hidden" id="t1-selected-container" value="${lot.container_size||'2.7L'}">
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="Pages.qrScanT1()">← 戻る</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._t1ExecSplit('${lot.lot_id}',${count})">✅ 分割実行</button>
    </div>`;
  }
  function _donePhase(result) {
    const newLots = result.new_lots || [];
    return `<div class="card" style="text-align:center;padding:16px;border-color:var(--green)">
      <div style="font-size:2rem">✅</div>
      <div style="font-weight:700;margin-top:8px">${newLots.length}ロットに分割しました</div>
    </div>
    <div style="margin-top:8px">
      ${newLots.map(l => `<div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px">
        <div>
          <div style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">${l.display_id}</div>
          <div style="font-size:.8rem;color:var(--text3)">${l.count}頭 / T1</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="Pages._t1GenerateLabel('${l.lot_id}','${l.display_id}')">🏷 ラベル</button>
      </div>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="routeTo('lot-list')">ロット一覧</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages.qrScanT1()">📷 次のQRへ</button>
    </div>`;
  }
  function _bindScanEvents() {
    const inp = document.getElementById('t1-qr-input');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') Pages._t1ResolveQR(); });
  }
  _render(null, 'scan');
  Pages._t1RenderSplit = (lot) => _render(lot,  'split');
  Pages._t1RenderDone  = (res) => _render(res,  'done');
};

Pages._t1ResolveQR = async function () {
  const val = (document.getElementById('t1-qr-input')?.value || '').trim();
  if (!val) { UI.toast('QRを入力してください', 'error'); return; }
  try {
    UI.loading(true);
    const lots = Store.getDB('lots') || [];
    let lot = lots.find(l => l.lot_id === val || l.display_id === val);
    if (!lot) { const res = await API.lot.get({ lot_id: val }); lot = res.lot; }
    if (!lot) { UI.toast('ロットが見つかりません: ' + val, 'error'); return; }
    if (lot.status === 'dissolved') { UI.toast('このロットは分割済みです', 'error'); return; }
    Pages._t1RenderSplit(lot);
  } catch(e) { UI.toast('エラー: ' + e.message, 'error'); }
  finally { UI.loading(false); }
};

Pages._t1UpdateTotal = function (max) {
  const inputs = document.querySelectorAll('.t1-split-count');
  const total  = Array.from(inputs).reduce((s,i) => s + (+i.value||0), 0);
  const el     = document.getElementById('t1-split-total');
  if (el) { el.textContent = `合計: ${total}頭 / 最大${max}頭`; el.style.color = total > max ? 'var(--red)' : 'var(--text3)'; }
};

Pages._t1AddSplitRow = function (max) {
  const rows  = document.getElementById('t1-split-rows');
  if (!rows) return;
  const count = rows.querySelectorAll('.split-row').length;
  const suffix = String.fromCharCode(65 + count);
  rows.insertAdjacentHTML('beforeend', `<div class="split-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
    <span style="font-family:var(--font-mono);color:var(--gold);min-width:30px">-${suffix}</span>
    <input type="number" class="input t1-split-count" min="1" max="${max}" value="1" oninput="Pages._t1UpdateTotal(${max})">
    <span style="font-size:.8rem;color:var(--text3)">頭</span>
  </div>`);
  Pages._t1UpdateTotal(max);
};

Pages._t1SelectContainer = function (size) {
  document.querySelectorAll('[id^="t1-container-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('t1-container-' + size.replace('.','_'));
  if (btn) btn.classList.add('active');
  const inp = document.getElementById('t1-selected-container');
  if (inp) inp.value = size;
};

Pages._t1ExecSplit = async function (lotId, maxCount) {
  const inputs    = document.querySelectorAll('.t1-split-count');
  const counts    = Array.from(inputs).map(i => +i.value||0).filter(n => n > 0);
  const total     = counts.reduce((s,n) => s+n, 0);
  const container = document.getElementById('t1-selected-container')?.value || '2.7L';
  if (!counts.length) { UI.toast('分割数を入力してください', 'error'); return; }
  if (total > maxCount) { UI.toast(`合計(${total})が元ロット頭数(${maxCount})を超えています`, 'error'); return; }
  try {
    UI.loading(true);
    const res = await API.lot.split({ lot_id: lotId, split_counts: counts, stage: 'T1', container_size: container });
    await syncAll(true);
    Pages._t1RenderDone(res);
  } catch(e) { UI.toast('分割失敗: ' + e.message, 'error'); }
  finally { UI.loading(false); }
};

Pages._t1GenerateLabel = async function (lotId, displayId) {
  try {
    UI.loading(true);
    await API.label.generate('LOT', lotId, 'larva');
    UI.toast(`${displayId} のラベルを発行しました`);
  } catch(e) { UI.toast('ラベル発行失敗: ' + e.message, 'error'); }
  finally { UI.loading(false); }
};

Pages._t1StartCamera = async function () { routeTo('qr-scan', { mode: 't1' }); };

// ルーティング登録
// ════════════════════════════════════════════════════════════════
// T2移行（初回）モード  /  page: 't2-mode'
//
// QR → ロット特定 → T2初回入力（体重①②・区分・頭数切替）
// 頭数2匹 → lot更新 + growth保存
// 頭数単独 → 分割モーダルへ遷移（体重を引き継ぎ）
// ════════════════════════════════════════════════════════════════

// T2モード固定初期値
const _T2_DEFAULTS = {
  mat:       'T2',
  molt:      'on',
  stage:     'L3_EARLY',
  exchange:  '全交換',
  container: '2.7L',
};

// T2モード状態（ページ内で維持）
window._t2State = window._t2State || {
  entityId:   '',
  entityType: 'LOT',
  displayId:  '',
  headCount:  2,       // 2 or 1
  sameWeight: false,
};

Pages.t2Mode = function (params = {}) {
  const res = params.resolve_result;
  if (!res || !res.entity || res.entity_type !== 'LOT') {
    // QRスキャン画面に戻る
    routeTo('qr-scan');
    return;
  }
  const main = document.getElementById('main');
  const { entity, line } = res;
  const entityId  = entity.lot_id || '';
  const displayId = entity.display_id || entityId;
  const lineDisp  = line?.line_code || line?.display_id || '';
  const hatchDate = entity.hatch_date || '';

  // state 更新
  window._t2State.entityId   = entityId;
  window._t2State.entityType = 'LOT';
  window._t2State.displayId  = displayId;

  function _render() {
    const st        = window._t2State;
    const isSame    = st.sameWeight;
    const headCount = st.headCount;

    // 区分チェック取得ヘルパー（再レンダ時の状態維持）
    const catChecks = ['大','中','小'].map(c =>
      document.getElementById('t2-cat-' + c)?.checked || false
    );

    main.innerHTML = `
      ${UI.header('🟡 T2移行（初回）', { back: true, backFn: "routeTo('qr-scan')" })}
      <div class="page-body" style="padding-bottom:90px">

        <!-- 対象情報バー -->
        <div class="quick-info-bar">
          <div style="flex:1;min-width:0">
            <div class="quick-info-id">${displayId}</div>
            <div style="font-size:.72rem;color:var(--text3);margin-top:2px">
              ${lineDisp ? 'L:' + lineDisp : ''}${hatchDate ? ' / 孵化:' + hatchDate : ''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:.75rem;color:var(--amber);font-weight:700">T2 初回</div>
            <div style="font-size:.68rem;color:var(--text3)">${entity.count||'?'}頭</div>
          </div>
        </div>

        <!-- 固定設定バッジ -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;padding:6px 0">
          ${[['マット','T2マット'],['ステージ','L3前期'],['交換','全交換']].map(([k,v]) =>
            '<span style="font-size:.68rem;padding:2px 8px;border-radius:20px;' +
            'background:rgba(200,168,75,.15);color:var(--amber);border:1px solid rgba(200,168,75,.35)">' +
            k + ': ' + v + '</span>'
          ).join('')}
        </div>

        <!-- 頭数選択 -->
        <div class="card" style="padding:12px 14px">
          <div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:8px">頭数</div>
          <div style="display:flex;gap:8px">
            <button id="t2-head-2" class="btn ${headCount===2?'btn-primary':'btn-ghost'}" style="flex:1;padding:12px"
              onclick="Pages._t2SetHeadCount(2)">
              🫧 2匹（ロット継続）
            </button>
            <button id="t2-head-1" class="btn ${headCount===1?'btn-primary':'btn-ghost'}" style="flex:1;padding:12px"
              onclick="Pages._t2SetHeadCount(1)">
              🐛 単独（分割へ）
            </button>
          </div>
          ${headCount===1 ? '<div style="font-size:.72rem;color:var(--blue);margin-top:6px">保存後に分割モーダルへ進みます。個体A/Bラベル発行まで一連で行えます。</div>' : ''}
        </div>

        <!-- 体重入力 -->
        <div class="card" style="padding:12px 14px">
          <div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:8px">体重 (g)</div>

          ${headCount === 2 ? `
          <!-- 2匹モード: 体重①② -->
          <div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:8px">
            <div style="flex:1">
              <div style="font-size:.68rem;color:var(--text3);margin-bottom:3px">体重① (g)</div>
              <input id="t2-w1" type="number" inputmode="decimal" step="0.1" min="0.1" max="999.9"
                placeholder="0.0" class="num-input-xl" style="width:100%;color:var(--green)"
                oninput="${isSame ? 'document.getElementById(\'t2-w2\').value=this.value' : ''}">
            </div>
            <div style="flex:1">
              <div style="font-size:.68rem;color:var(--text3);margin-bottom:3px">体重② (g)</div>
              <input id="t2-w2" type="number" inputmode="decimal" step="0.1" min="0.1" max="999.9"
                placeholder="0.0" class="num-input-xl" style="width:100%;color:var(--green)"
                ${isSame ? 'readonly style="width:100%;color:var(--green);opacity:.6"' : ''}>
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.8rem;color:var(--text2)">
            <input type="checkbox" id="t2-same-weight" ${isSame?'checked':''}
              onchange="Pages._t2ToggleSameWeight(this.checked)"
              style="width:18px;height:18px">
            2匹とも同じ体重
          </label>
          ` : `
          <!-- 単独モード: 体重①のみ -->
          <div>
            <div style="font-size:.68rem;color:var(--text3);margin-bottom:3px">体重 (g)</div>
            <input id="t2-w1" type="number" inputmode="decimal" step="0.1" min="0.1" max="999.9"
              placeholder="0.0" class="num-input-xl" style="width:100%;color:var(--green)">
          </div>
          `}
        </div>

        <!-- 区分（複数選択） -->
        <div class="card" style="padding:12px 14px">
          <div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:8px">区分（複数選択可）</div>
          <div style="display:flex;gap:8px">
            ${['大','中','小'].map((c, idx) =>
              '<label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;' +
              'padding:10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:.85rem">' +
              '<input type="checkbox" id="t2-cat-' + c + '" ' + (catChecks[idx] ? 'checked' : '') + ' style="width:16px;height:16px">' +
              c + '型</label>'
            ).join('')}
          </div>
        </div>

        <!-- モルト（チェックボックス式、初期ON） -->
        <div class="card" style="padding:12px 14px">
          <label style="display:flex;align-items:center;gap:12px;cursor:pointer">
            <input type="checkbox" id="t2-molt-check"
              ${window._t2MoltVal!=='off'?'checked':''}
              style="width:22px;height:22px;cursor:pointer"
              onchange="Pages._t2SetMolt(this.checked?'on':'off')">
            <span style="font-size:.85rem;font-weight:700;color:var(--text2)">モルト使用</span>
          </label>
        </div>

        <!-- 容器 -->
        <div class="card" style="padding:12px 14px">
          <div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:8px">容器サイズ</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${(typeof CONTAINER_SIZES !== 'undefined' ? CONTAINER_SIZES : ['1.8L','2.7L','4.8L']).map(s => {
              window.__t2ContTemp = s;
              return '<button id="t2-cont-' + s.replace('.','_') + '" ' +
                'class="btn ' + ((window._t2ContainerVal||'2.7L')===s?'btn-primary':'btn-ghost') + '" style="flex:1" ' +
                'onclick="Pages._t2SetContainer(window.__t2ContTemp)">' + s + '</button>';
            }).join('')}
          </div>
        </div>

        <!-- メモ -->
        <div class="card" style="padding:12px 14px">
          <div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:6px">メモ（任意）</div>
          <textarea id="t2-note" class="input" rows="2" placeholder="観察メモ"></textarea>
        </div>

      </div>

      <!-- アクションバー -->
      <div class="quick-action-bar">
        <button class="btn btn-gold btn-xl" style="flex:1" id="t2-save-btn"
          onclick="Pages._t2Save()">
          ${headCount===2 ? '💾 保存して次へ' : '💾 保存して分割へ →'}
        </button>
      </div>`;

    // 初期モルト状態のセット（デフォルト ON）
    if (window._t2MoltVal === undefined) window._t2MoltVal = 'on';
    if (window._t2ContainerVal === undefined) window._t2ContainerVal = '2.7L';
  }

  _render();
  // _render を Pages から参照できるようにセッション保持
  window._t2Render = _render;

  // 体重①にフォーカス
  setTimeout(() => document.getElementById('t2-w1')?.focus(), 100);
};

// ── 頭数切替 ─────────────────────────────────────────────────────
Pages._t2SetHeadCount = function (n) {
  window._t2State.headCount = n;
  if (window._t2Render) window._t2Render();
  setTimeout(() => document.getElementById('t2-w1')?.focus(), 80);
};

// ── 体重同一チェック切替 ──────────────────────────────────────────
Pages._t2ToggleSameWeight = function (checked) {
  window._t2State.sameWeight = checked;
  if (checked) {
    const w1 = document.getElementById('t2-w1')?.value || '';
    const w2el = document.getElementById('t2-w2');
    if (w2el) { w2el.value = w1; w2el.readOnly = true; w2el.style.opacity = '.6'; }
    const w1el = document.getElementById('t2-w1');
    if (w1el) w1el.oninput = () => { const w2e = document.getElementById('t2-w2'); if (w2e) w2e.value = w1el.value; };
  } else {
    const w2el = document.getElementById('t2-w2');
    if (w2el) { w2el.readOnly = false; w2el.style.opacity = '1'; }
    const w1el = document.getElementById('t2-w1');
    if (w1el) w1el.oninput = null;
  }
};

// ── モルトボタン ──────────────────────────────────────────────────
Pages._t2SetMolt = function (val) {
  window._t2MoltVal = val;
  ['on','off'].forEach(k => {
    const b = document.getElementById('t2-molt-' + k);
    if (!b) return;
    b.className = 'btn ' + (k === val ? 'btn-primary' : 'btn-ghost');
    b.style.flex = '1';
  });
};

// ── 容器ボタン ────────────────────────────────────────────────────
Pages._t2SetContainer = function (val) {
  window._t2ContainerVal = val;
  (typeof CONTAINER_SIZES !== 'undefined' ? CONTAINER_SIZES : ['1.8L','2.7L','4.8L']).forEach(s => {
    const b = document.getElementById('t2-cont-' + s.replace('.','_'));
    if (!b) return;
    b.className = 'btn ' + (s === val ? 'btn-primary' : 'btn-ghost');
    b.style.flex = '1';
  });
};

// ── 保存処理 ─────────────────────────────────────────────────────
Pages._t2Save = async function () {
  const st          = window._t2State;
  const headCount   = st.headCount;
  const w1Raw       = document.getElementById('t2-w1')?.value;
  const w2Raw       = headCount === 2 ? (document.getElementById('t2-w2')?.value || w1Raw) : w1Raw;
  const w1          = parseFloat(w1Raw);
  const w2          = parseFloat(w2Raw);
  const noteVal     = document.getElementById('t2-note')?.value?.trim() || '';
  const moltVal     = window._t2MoltVal !== 'off';     // true=ON
  const containerVal= window._t2ContainerVal || '2.7L';

  // 区分（チェック済みのもの）
  const cats = ['大','中','小'].filter(c => document.getElementById('t2-cat-' + c)?.checked);

  // バリデーション
  if (!w1Raw || isNaN(w1) || w1 <= 0) {
    UI.toast('体重①を入力してください', 'error');
    document.getElementById('t2-w1')?.focus();
    return;
  }
  if (headCount === 2 && (!w2Raw || isNaN(w2) || w2 <= 0)) {
    UI.toast('体重②を入力してください', 'error');
    document.getElementById('t2-w2')?.focus();
    return;
  }

  const btn = document.getElementById('t2-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 保存中...'; }

  try {
    // ── 本体（LOT）への一括更新 ──────────────────────────────
    const lotUpdates = {
      lot_id:         st.entityId,
      mat_type:       _T2_DEFAULTS.mat,
      mat_molt:       moltVal,
      stage:          _T2_DEFAULTS.stage,
      container_size: containerVal,
      size_category:  cats.join(','),
    };
    await API.lot.update(lotUpdates);
    Store.patchDBItem('lots', 'lot_id', st.entityId, {
      mat_type:       _T2_DEFAULTS.mat,
      mat_molt:       moltVal,
      stage:          _T2_DEFAULTS.stage,
      container_size: containerVal,
      size_category:  cats.join(','),
    });

    // ── growth record 保存（1件または2件）────────────────────
    // 2匹モードは体重①のみ1件保存（代表値）
    // 単独モードは体重①のみ1件保存
    const growthBase = {
      target_type:  'LOT',
      target_id:    st.entityId,
      stage:        _T2_DEFAULTS.stage,
      weight_g:     w1,
      container:    containerVal,
      mat_type:     _T2_DEFAULTS.mat,
      exchange_type: _T2_DEFAULTS.exchange,
      note_private: noteVal || 'T2移行（初回）',
    };
    await API.growth.create(growthBase);

    // 2匹で体重②が異なる場合は別レコードで追記
    if (headCount === 2 && w2 !== w1) {
      await API.growth.create({ ...growthBase, weight_g: w2, note_private: (noteVal||'T2移行（初回）') + ' [体重②]' });
    }

    await Store.syncEntityType('growth').catch(() => {});

    // ── 頭数分岐 ────────────────────────────────────────────
    if (headCount === 2) {
      // ── 2匹: 保存して完了 ──────────────────────────────
      UI.toast('✅ T2移行データを保存しました', 'success');
      // 前回引継ぎ用に _wmLastInput も更新（通常体重モードと共有）
      window._wmLastInput = {
        mat: _T2_DEFAULTS.mat, molt: 'on',
        stage: _T2_DEFAULTS.stage, container: containerVal, exchange: _T2_DEFAULTS.exchange,
      };
      routeTo('lot-detail', { lotId: st.entityId });
    } else {
      // ── 単独: 分割モーダルへ ────────────────────────────
      await syncAll(true);
      // lot.js の _showSplitModal を呼ぶ
      // 体重①を分割初期値として引き継ぐ
      const lot = Store.getLot(st.entityId);
      if (!lot) { UI.toast('ロット情報の取得に失敗しました', 'error'); return; }
      UI.toast('分割モーダルへ進みます', 'success');
      // 分割は count=1 なので weight を split_details.initial_weight で引き継ぐ
      window.__t2SplitWeight = w1;
      routeTo('lot-detail', { lotId: st.entityId, openSplit: true });
    }
  } catch (e) {
    UI.toast('❌ 保存失敗: ' + (e.message || '不明なエラー'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = headCount === 2 ? '💾 保存' : '💾 保存して分割へ →'; }
  }
};

window.PAGES['qr-scan']    = () => Pages.qrScan(Store.getParams());
window.PAGES['qr-scan-t1'] = () => Pages.qrScanT1();
window.PAGES['t2-mode']    = () => Pages.t2Mode(Store.getParams());
