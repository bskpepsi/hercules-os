// ════════════════════════════════════════════════════════════════
// scan.js — QRスキャン + 差分入力 + 成長記録  v3
//
// 【3モード】
//   確認モード  : QR → 個体/ロット/産卵セット詳細画面を直接開く
//   差分入力    : QR → 未入力項目を補完して保存
//   成長記録    : QR → growth-rec（新UI）に転送
//
// 【QR読み取り方法】
//   ① カメラ読み取り（jsQR / inversionAttempts:'attemptBoth' / 3フレームに1回スキャン）
//   ② 画像ファイル読み取り（スマホ保存画像・スクリーンショット対応）
//   ③ テキスト手入力 / ペースト
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// QRスキャン画面 (qr-scan)
// ════════════════════════════════════════════════════════════════
Pages.qrScan = function (params = {}) {
  const main = document.getElementById('main');
  // 3モード: confirm(情報確認) / transition(移行編成) / record(継続・追加読取り)
  const _modeMap = { 'view':'confirm','weight':'record','diff':'record','t1':'transition','t2':'transition','t3':'transition','t1_add':'transition' };
  let _scanMode = _modeMap[params.mode] || params.mode || 'confirm';
  if (!['confirm','transition','record'].includes(_scanMode)) _scanMode = 'confirm';
  // 移行編成サブモード (t1/t2/t3)
  window._qrTransMode = (params.mode === 't2') ? 't2' : (params.mode === 't3') ? 't3' : 't1';
  window._qrAddingToSession = (params.mode === 't1_add');  // セッションへ追加読取り中
  window._qrScanMode = _scanMode;

  function _modeStyle(m) {
    if (m === _scanMode) {
      const bg = m==='transition' ? 'var(--green)' : m==='record' ? 'var(--blue)' : 'var(--gold)';
      return `background:${bg};color:#fff;font-weight:700;`;
    }
    return 'color:var(--text3);background:transparent;';
  }
  function _modeDesc() {
    if (_scanMode === 'transition') {
      const sub = { t1:'T1移行', t2:'T2移行', t3:'T3移行' }[window._qrTransMode] || 'T1移行';
      return `🔄 移行編成 — ${sub}: T0ロットQRを読んでセッションを開始`;
    }
    if (_scanMode === 'record') return '📷 継続・追加読取り: QR → 成長記録';
    return '🔍 情報確認: QR → 詳細画面を開く';
  }

  function render() {
    main.innerHTML = `
      ${UI.header('📷 QRスキャン', { back: true })}
      <div class="page-body">

        <!-- 3モードタブ -->
        <div style="display:flex;background:var(--surface2);border-radius:10px;padding:3px;gap:3px">
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('confirm')}"
            onclick="Pages._qrSwitchMode('confirm')">🔍 情報確認</button>
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('transition')}"
            onclick="Pages._qrSwitchMode('transition')">🔄 移行編成</button>
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('record')}"
            onclick="Pages._qrSwitchMode('record')">📷 継続読取り</button>
        </div>
        <!-- 移行編成サブモード -->
        ${_scanMode === 'transition' ? `
        <div style="display:flex;gap:4px;padding:4px 0">
          ${['t1','t2','t3'].map(m => `<button style="flex:1;padding:5px;border-radius:7px;font-size:.75rem;cursor:pointer;
            border:1px solid ${window._qrTransMode===m?'var(--green)':'var(--border)'};
            background:${window._qrTransMode===m?'rgba(76,175,120,.15)':'var(--surface2)'};
            color:${window._qrTransMode===m?'var(--green)':'var(--text3)'};font-weight:${window._qrTransMode===m?'700':'400'}"
            onclick="Pages._qrSetTransMode('${m}')">${m.toUpperCase()}移行</button>`).join('')}
        </div>` : ''}
        <div style="font-size:.72rem;color:var(--text3);padding:2px 4px;margin-top:-2px">${_modeDesc()}</div>

        <!-- カメラエリア -->
        <div class="card" id="camera-card" style="display:none;padding:0;overflow:hidden">
          <div style="position:relative;width:100%;background:#000">
            <video id="qr-video" autoplay playsinline muted
              style="width:100%;display:block;max-height:260px;object-fit:cover"></video>
            <canvas id="qr-canvas" style="display:none"></canvas>
            <!-- スキャン枠 -->
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
              <div id="scan-frame" style="width:200px;height:200px;border:3px solid var(--green);border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,0.5)"></div>
            </div>
            <!-- スキャン中アニメ -->
            <div id="scan-line" style="position:absolute;left:calc(50% - 100px);top:calc(50% - 100px);width:200px;height:3px;background:var(--green);opacity:.8;animation:scanLine 2s infinite linear"></div>
          </div>
          <div style="display:flex;gap:8px;padding:8px">
            <button class="btn btn-ghost" style="flex:1" onclick="Pages._qrStopCamera()">✕ 閉じる</button>
            <div id="scan-status" style="flex:2;display:flex;align-items:center;justify-content:center;font-size:.78rem;color:var(--green)">スキャン中…</div>
          </div>
        </div>

        <!-- 入力カード -->
        <div class="card">
          <!-- カメラボタン -->
          <button class="btn btn-ghost btn-full" id="camera-btn" onclick="Pages._qrStartCamera()"
            style="margin-bottom:10px;border:2px solid var(--green);background:rgba(45,122,82,.08);font-size:.95rem;padding:14px;border-radius:12px">
            <span style="font-size:1.4rem;margin-right:8px">📷</span>カメラで読み取る
          </button>

          <!-- 画像ファイル読み取り -->
          <label style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border:2px dashed var(--border2);border-radius:10px;cursor:pointer;margin-bottom:10px;font-size:.85rem;color:var(--text3)">
            <span style="font-size:1.2rem">🖼️</span>QR画像を選択して読み取る
            <input type="file" accept="image/*" style="display:none" onchange="Pages._qrReadFromImage(this)">
          </label>

          <div style="display:flex;align-items:center;gap:8px;margin:6px 0">
            <div style="flex:1;height:1px;background:var(--border2)"></div>
            <span style="font-size:.72rem;color:var(--text3)">またはテキストで入力</span>
            <div style="flex:1;height:1px;background:var(--border2)"></div>
          </div>

          <div class="field" style="margin-bottom:10px">
            <label class="field-label">QRコードの内容を貼り付け</label>
            <textarea id="qr-input" class="input" rows="3"
              placeholder="例:
LOT:LOT-XXXXXXXX
IND:IND-XXXXXXXX
SET:SET-XXXXXXXX
BU:HM2026-A1-U01"
              style="font-family:var(--font-mono);font-size:.88rem"
              oninput="Pages._qrPreviewInput(this.value)"></textarea>
            <div id="qr-preview" style="font-size:.72rem;margin-top:4px"></div>
          </div>

          <button class="btn btn-gold btn-full" id="qr-resolve-btn" onclick="Pages._qrResolve()">
            🔍 読み取り・確認
          </button>
          <div id="qr-error" style="margin-top:8px;font-size:.8rem;color:var(--red)"></div>
        </div>

        <!-- スキャン方法ガイド -->
        <div class="card">
          <div class="card-title">ラベルのQRコード内容</div>
          <div style="font-size:.75rem;color:var(--text3);line-height:1.8">
            ${[
              ['IND:IND-xxxxx', '個体ラベル', 'var(--green)'],
              ['LOT:LOT-xxxxx', 'ロットラベル', 'var(--amber)'],
              ['SET:SET-xxxxx', '産卵セットラベル', 'var(--gold)'],
              ['BU:HM2026-A1-U01', '飼育ユニット (T2移行用)', 'var(--blue)'],
            ].map(([code,label,col])=>`<div style="display:flex;gap:8px;padding:3px 0">
              <span style="font-family:var(--font-mono);color:${col};min-width:140px">${code}</span>
              <span>${label}</span>
            </div>`).join('')}
          </div>
        </div>

        <div id="scan-history-card"></div>
      </div>`;

    // CSSアニメーション注入
    if (!document.getElementById('scan-anim-style')) {
      const st = document.createElement('style');
      st.id = 'scan-anim-style';
      st.textContent = '@keyframes scanLine{0%{top:calc(50% - 100px)}50%{top:calc(50% + 97px)}100%{top:calc(50% - 100px)}}';
      document.head.appendChild(st);
    }

    setTimeout(() => Pages._qrRenderHistory(), 50);
  }

  Pages._qrSwitchMode = function(m) {
    _scanMode = m;
    window._qrScanMode = m;
    window._qrAddingToSession = false; // モード切替時は追加読取りを解除
    render();
  };
  Pages._qrSetTransMode = function(m) {
    window._qrTransMode = m;
    render();
  };
  render();

  // 起動直後カメラ自動起動（モード問わず）
  if (params.autoCamera) {
    setTimeout(() => Pages._qrStartCamera(), 300);
  }
};


// ════════════════════════════════════════════════════════════════
// 差分入力画面 (qr-diff)
// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// QR スキャン ヘルパー群
// ════════════════════════════════════════════════════════════════

// ── QRテキストのプレビュー ─────────────────────────────────────
Pages._qrPreviewInput = function (val) {
  const el = document.getElementById('qr-preview');
  if (!el) return;
  const v = (val || '').trim();
  const labels = { LOT: '🟡 ロット', IND: '🟢 個体', SET: '🟠 産卵セット', PAR: '👑 種親', BU: '🔵 飼育ユニット' };
  const type = v.startsWith('LOT:') ? 'LOT'
    : v.startsWith('IND:') ? 'IND'
    : v.startsWith('SET:') ? 'SET'
    : v.startsWith('PAR:') ? 'PAR'
    : v.startsWith('BU:')  ? 'BU'
    : null;
  el.innerHTML = type
    ? `<span style="color:var(--green)">${labels[type]} : ${v.slice(v.indexOf(':')+1)}</span>`
    : v ? `<span style="color:var(--red)">⚠️ フォーマット不正（LOT: / IND: / SET: / BU: で始まる必要があります）</span>` : '';
};

// ── QR解析・モード別遷移 ─────────────────────────────────────

// モード別遷移（ローカル/API両方から呼ばれる共通ルーター）
function _qrNavigate(mode, res, qrText) {
  if (mode === 'transition') {
    const ent = res.entity || {};
    const sub = window._qrTransMode || 't1';
    // 追加読取りモード（既存セッションへロットを追加）
    if (window._qrAddingToSession) {
      const ok = Pages._t1TryAddLot && Pages._t1TryAddLot(ent.lot_id);
      if (!ok) routeTo('qr-scan', { mode: 't1_add' });
      return;
    }
    if (sub === 't1') {
      if (res.entity_type === 'LOT' && ent.lot_id) {
        Pages.t1SessionStart(ent.lot_id);
      } else if (res.entity_type === 'BU') {
        UI.toast('移行編成モードではT0ロットのQRを読んでください', 'info', 2500);
      } else {
        UI.toast('T1移行: ロットのQRを読んでください', 'info', 2500);
      }
    } else if (sub === 't2') {
      if (res.entity_type === 'BU' && (ent.display_id || ent.unit_id)) {
        Pages.t2SessionStart && Pages.t2SessionStart(ent.display_id || ent.unit_id);
      } else if (res.entity_type === 'LOT') {
        UI.toast('T2移行は BU（飼育ユニット）のQRを読んでください', 'error', 3000);
      } else {
        UI.toast('T2移行: BU ラベル（BU:...）を読み取ってください', 'error', 3000);
      }
    } else {
      UI.toast(sub.toUpperCase() + '移行は準備中です', 'info', 2000);
    }
  } else if (mode === 'record') {
    // 継続・追加読取り: 成長記録へ（既存の weight モードと同等）
    const _ent = res.entity || {};
    const _eid = _ent.ind_id || _ent.lot_id || _ent.unit_id || '';
    const _ety = res.entity_type || 'IND';
    if (_eid) {
      routeTo('growth-rec', { targetType: _ety, targetId: _eid, displayId: _ent.display_id || _eid, _fromQR: true });
    } else {
      UI.toast('対象が特定できませんでした', 'error');
    }
  } else {
    // 確認モード: 既存詳細画面へ直接遷移
    const eid = (res.entity || {}).ind_id || (res.entity || {}).lot_id ||
                (res.entity || {}).set_id || (res.entity || {}).par_id;
    if      (res.entity_type === 'IND' && eid) routeTo('ind-detail',     { indId: eid });
    else if (res.entity_type === 'LOT' && eid) routeTo('lot-detail',     { lotId: eid });
    else if (res.entity_type === 'SET' && eid) routeTo('pairing-detail', { pairingId: eid });
    else if (res.entity_type === 'PAR' && eid) routeTo('parent-detail',  { parId: eid });
    else if (res.entity_type === 'BU')  {
      // BU: unit-detail へ遷移
      const _buEnt = res.entity || {};
      const _buDid = _buEnt.display_id || _buEnt.unit_id || '';
      console.log('[QR] BU confirm - displayId:', _buDid, '/ entity:', _buEnt);
      if (_buDid) {
        console.log('[QR] routeTo unit-detail with unitDisplayId:', _buDid);
        routeTo('unit-detail', { unitDisplayId: _buDid });
      } else {
        UI.toast('BU情報が取得できませんでした', 'error');
      }
    }
    else UI.toast('対象が特定できませんでした', 'error');
  }
}

// ── ローカルキャッシュから QR文字列を即解決 ────────────────────
// API呼び出しなし。Store に存在する場合は即返す。
function _qrLocalResolve(v) {
  const parts = (v || '').split(':');
  if (parts.length < 2) return null;
  const prefix = parts[0].toUpperCase();
  const id     = parts.slice(1).join(':').trim();

  if (prefix === 'IND') {
    const ind = Store.getIndividual(id)
      || (Store.getDB('individuals') || []).find(i => i.display_id === id);
    if (!ind) return null;
    const line = Store.getLine(ind.line_id) || {};
    // 最新体重をキャッシュから取得（外部関数依存なし）
    const recs = Store.getGrowthRecords(ind.ind_id) || [];
    const lg   = recs.filter(r => r.weight_g && +r.weight_g > 0).slice(-1)[0] || null;
    return { entity_type: 'IND', entity: ind, line, last_growth: lg, missing: [], label_type: 'ind_fixed' };
  }
  if (prefix === 'LOT') {
    const lot = Store.getLot(id)
      || (Store.getDB('lots') || []).find(l => l.display_id === id);
    if (!lot) return null;
    const line = Store.getLine(lot.line_id) || {};
    const recs = Store.getGrowthRecords(lot.lot_id) || [];
    const lg   = recs.filter(r => r.weight_g && +r.weight_g > 0).slice(-1)[0] || null;
    return { entity_type: 'LOT', entity: lot, line, last_growth: lg, missing: [], label_type: 'multi_lot' };
  }
  if (prefix === 'PAR') {
    const par = (Store.getDB('parents') || []).find(p =>
      p.par_id === id || p.parent_display_id === id
    );
    if (!par) return null;
    return { entity_type: 'PAR', entity: par, line: null, last_growth: null, missing: [], label_type: 'parent' };
  }
  if (prefix === 'SET') {
    const set = (Store.getDB('pairings') || []).find(s => s.set_id === id || s.display_id === id);
    if (!set) return null;
    return { entity_type: 'SET', entity: set, line: null, last_growth: null, missing: [], label_type: 'set' };
  }
  if (prefix === 'BU') {
    // BU: display_id ベースで解決（unit_id はフォールバック）
    const units = Store.getDB('breeding_units') || [];
    const unit  = units.find(u => u.display_id === id) || units.find(u => u.unit_id === id);
    if (!unit) return null;
    return { entity_type: 'BU', entity: unit, resolved_id: unit.display_id };
  }

  return null;
}

Pages._qrResolve = async function () {
  const _t0 = performance.now();
  const qrText = document.getElementById('qr-input')?.value?.trim();
  const errEl  = document.getElementById('qr-error');
  const btn    = document.getElementById('qr-resolve-btn');
  if (!qrText) { if (errEl) errEl.textContent = 'QRコードを入力してください'; return; }
  if (errEl) errEl.textContent = '';

  console.log('[QR] recognized', qrText, 'at', _t0.toFixed(1), 'ms');

  // ── 現在のスキャンモードを取得 ──
  const mode = window._qrScanMode || 'confirm';

  // ── ① ローカルキャッシュで即解決（APIなし） ──────────────────
  const _t1 = performance.now();
  console.log('[QR] local resolve start');
  const localRes = _qrLocalResolve(qrText);
  const _localMs = (performance.now()-_t1).toFixed(1);
  console.log('[QR] local resolve end', _localMs, 'ms / found:', !!localRes);

  if (localRes) {
    // ローカル解決成功: ボタンを即「画面を開いています...」に切り替えて遷移
    if (btn) { btn.textContent = '📂 画面を開いています...'; }
    Pages._qrSaveHistory(qrText, localRes);
    const _t2 = performance.now();
    console.log('[QR] navigate start (local path)');
    _qrNavigate(mode, localRes, qrText);
    console.log('[QR] navigate triggered', (performance.now()-_t2).toFixed(1), 'ms');
    console.log('[QR] total (local path)', (performance.now()-_t0).toFixed(1), 'ms');
    return;  // API呼び出しなし・即遷移
  }

  // ── ② ローカルで見つからない場合だけ API へ ──────────────────
  // 300ms 後にローディング表示（即解決できた場合はローディング出さない）
  let _loadingTimer = setTimeout(() => {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 解析中...'; }
  }, 300);
  let _longLoadTimer = setTimeout(() => {
    if (btn) btn.textContent = '⏳ ロット情報を確認中...';
  }, 1200);

  console.log('[QR] API fallback start');
  const _t3 = performance.now();
  try {
    const res = await API.scan.resolve(qrText);
    console.log('[QR] API fallback end', (performance.now()-_t3).toFixed(1), 'ms');
    Pages._qrSaveHistory(qrText, res);
    const _t4 = performance.now();
    console.log('[QR] navigate start (API)');
    _qrNavigate(mode, res, qrText);
    console.log('[QR] navigate triggered', (performance.now()-_t4).toFixed(1), 'ms');
  } catch (e) {
    console.error('[QR] API error', e.message);
    if (errEl) errEl.textContent = '❌ ' + (e.message || '解析に失敗しました');
  } finally {
    clearTimeout(_loadingTimer);
    clearTimeout(_longLoadTimer);
    if (btn) { btn.disabled = false; btn.textContent = '🔍 読み取り・確認'; }
    console.log('[QR] total (API path)', (performance.now()-_t0).toFixed(1), 'ms');
  }
};

// ── スキャン履歴 ──────────────────────────────────────────────
Pages._qrSaveHistory = function (qrText, res) {
  try {
    const hist = JSON.parse(sessionStorage.getItem('qr_scan_history') || '[]');
    hist.unshift({ qr_text: qrText, entity_type: res.entity_type,
      display_id: res.entity?.display_id || '', scanned_at: new Date().toLocaleTimeString('ja-JP') });
    sessionStorage.setItem('qr_scan_history', JSON.stringify(hist.slice(0, 5)));
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

// ── カメラスキャン ────────────────────────────────────────────
Pages._qrStartCamera = async function () {
  // jsQR確認（index.htmlで静的ロード済みのはずだが念のため）
  if (typeof jsQR === 'undefined') {
    // jsQR 未ロード: フォールバックCDNから再ロードを試みる
    UI.toast('QRライブラリを読み込み中...', 'info', 3000);
    var _retryUrls = [
      'vendor/jsQR.min.js',
      'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js',
      'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js'
    ];
    var _retryLoad = function(urls, idx) {
      if (idx >= urls.length) {
        UI.toast('QRライブラリの読み込みに失敗しました。ページを再読み込みしてください', 'error');
        return;
      }
      var s = document.createElement('script');
      s.src = urls[idx];
      s.onload  = function() { setTimeout(function() { Pages._qrStartCamera(); }, 300); };
      s.onerror = function() { _retryLoad(urls, idx + 1); };
      document.head.appendChild(s);
    };
    _retryLoad(_retryUrls, 0);
    return;
  }
  const card = document.getElementById('camera-card');
  if (!card) return;

  try {
    // 高解像度でリクエスト（Android最適化）
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
        focusMode: 'continuous',
      }
    });
    const video = document.getElementById('qr-video');
    if (!video) { stream.getTracks().forEach(t=>t.stop()); return; }

    video.srcObject = stream;
    card.style.display = 'block';
    const btn = document.getElementById('camera-btn');
    if (btn) btn.textContent = '📷 スキャン中...';

    video.addEventListener('loadedmetadata', () => { video.play(); }, { once: true });
    Pages._qrScanLoop(video);
  } catch (e) {
    const msg = e.name === 'NotAllowedError'
      ? 'カメラへのアクセスを許可してください（アドレスバー左の🔒→カメラ→許可）'
      : e.name === 'NotFoundError' ? 'カメラが見つかりません' : 'カメラ起動失敗: ' + e.message;
    UI.toast(msg, 'error', 5000);
  }
};

Pages._qrScanLoop = function (video) {
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let frameCount = 0;

  const scan = () => {
    if (!video.srcObject) return;
    frameCount++;
    // 毎フレームではなく3フレームに1回スキャン（負荷軽減）
    if (frameCount % 3 !== 0) { requestAnimationFrame(scan); return; }

    if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // inversionAttemptsを'attemptBoth'にして白地・黒地両対応
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (code && code.data) {
        Pages._qrStopCamera();
        const input = document.getElementById('qr-input');
        if (input) { input.value = code.data; Pages._qrPreviewInput(code.data); }
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        const status = document.getElementById('scan-status');
        if (status) { status.textContent = '✅ 読み取り成功！'; status.style.color = 'var(--green)'; }
        Pages._qrResolve();
        return;
      }
    }
    requestAnimationFrame(scan);
  };
  requestAnimationFrame(scan);
};

Pages._qrStopCamera = function () {
  const video = document.getElementById('qr-video');
  if (video?.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  const card = document.getElementById('camera-card');
  if (card) card.style.display = 'none';
  const btn = document.getElementById('camera-btn');
  if (btn) btn.textContent = '📷 カメラで読み取る';
};

// ── 画像ファイルからQR読み取り ────────────────────────────────
Pages._qrReadFromImage = function (input) {
  const file = input?.files?.[0];
  if (!file) return;
  if (typeof jsQR === 'undefined') { UI.toast('QRライブラリ未ロード', 'error'); return; }

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (code && code.data) {
        const qrInput = document.getElementById('qr-input');
        if (qrInput) { qrInput.value = code.data; Pages._qrPreviewInput(code.data); }
        UI.toast('QRコードを読み取りました', 'success');
        Pages._qrResolve();
      } else {
        UI.toast('QRコードが見つかりませんでした。鮮明な画像を使用してください', 'error', 4000);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  // inputをリセット（同じ画像を再選択できるように）
  input.value = '';
};

Pages.qrDiff = function (params = {}) {
  const res = params.resolve_result;
  if (!res) { routeTo('qr-scan'); return; }

  const main = document.getElementById('main');
  const { entity_type, label_type, entity, missing, line } = res;

  const missingCount = (missing || []).filter(m => m.level === 'required').length;
  const warnCount    = (missing || []).filter(m => m.level === 'warn').length;

  // ラベル種別の表示名
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

      <!-- ヒーローカード（種別・ID） -->
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

      <!-- 未入力項目セクション（missingCount > 0 のときのみ表示） -->
      ${missingCount > 0 ? Pages._qrRenderMissingSection(entity_type, entity, missing, label_type) : ''}

      <!-- 推奨入力（warn） -->
      ${warnCount > 0 ? Pages._qrRenderWarnSection(entity_type, entity, missing.filter(m => m.level === 'warn'), label_type) : ''}

      <!-- 既存情報確認 -->
      ${Pages._qrRenderInfoSection(entity_type, entity, line)}

      <!-- 保存ボタン -->
      <div style="display:flex;gap:10px;padding-bottom:8px">
        <button class="btn btn-ghost" style="flex:1" onclick="routeTo('qr-scan')">戻る</button>
        <button class="btn btn-gold" style="flex:2" id="diff-save-btn"
          onclick="Pages._qrDiffSave('${entity_type}', '${entity?.lot_id || entity?.ind_id || entity?.set_id || ''}')">
          💾 保存する
        </button>
      </div>

    </div>`;
};

// ── 未入力セクション（required） ─────────────────────────────
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

// ── 推奨入力セクション（warn） ────────────────────────────────
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

// ── フィールド別入力ウィジェット ──────────────────────────────
Pages._qrRenderFieldInput = function (entityType, entity, missingField, labelType, level) {
  const { field, label, hint, current_value } = missingField;
  const borderColor = level === 'required' ? 'rgba(224,144,64,.4)' : 'rgba(91,168,232,.25)';
  const bg          = level === 'required' ? 'rgba(224,144,64,.06)' : 'rgba(91,168,232,.04)';
  const icon        = level === 'required' ? '⚠️' : '📝';

  // フィールド別のウィジェット
  const widget = Pages._qrFieldWidget(field, label, current_value, entityType, entity);

  return `
    <div style="border:1px solid ${borderColor};border-radius:var(--radius-sm);
      padding:12px;background:${bg}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span style="font-size:.9rem">${icon}</span>
        <span style="font-size:.82rem;font-weight:700;color:var(--text2)">${label}</span>
        ${hint ? `<span style="font-size:.7rem;color:var(--text3);margin-left:auto">${hint}</span>` : ''}
      </div>
      ${widget}
    </div>`;
};

// ── フィールド別ウィジェット定義 ──────────────────────────────
Pages._qrFieldWidget = function (field, label, currentVal, entityType, entity) {
  // ── 性別（IND / sex_hint） ──────────────────────────────────
  if (field === 'sex' || field === 'sex_hint') {
    const isInd  = entityType === 'IND';
    const opts   = isInd
      ? [['♂', '♂ オス'], ['♀', '♀ メス'], ['不明', '不明']]
      : [['♂', '♂ 多め'], ['♀', '♀ 多め'], ['混合', '混合'], ['不明', '不明']];
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap" id="widget-${field}">
        ${opts.map(([v, lbl]) => `
          <button class="btn btn-sm btn-ghost diff-choice"
            data-field="${field}" data-value="${v}"
            style="flex:1;min-width:60px;${currentVal === v ? 'background:var(--green2);color:#fff;border-color:var(--green2)' : ''}"
            onclick="Pages._qrChoiceSelect(this)">
            ${lbl}
          </button>`).join('')}
      </div>`;
  }

  // ── サイズ区分 ──────────────────────────────────────────────
  if (field === 'size_category') {
    return `
      <div style="display:flex;gap:8px" id="widget-${field}">
        ${[['大','大型（10L）'],['中','中型（4.8L）'],['小','小型（2.7L）']].map(([v, lbl]) => `
          <button class="btn btn-sm btn-ghost diff-choice"
            data-field="${field}" data-value="${v}"
            style="flex:1;${currentVal === v ? 'background:var(--green2);color:#fff;border-color:var(--green2)' : ''}"
            onclick="Pages._qrChoiceSelect(this)">
            ${lbl}
          </button>`).join('')}
      </div>`;
  }

  // ── 孵化日 ──────────────────────────────────────────────────
  if (field === 'hatch_date') {
    return `
      <input id="widget-hatch_date" class="input" type="date"
        value="${currentVal || ''}"
        data-field="hatch_date"
        style="border-color:rgba(224,144,64,.4)">`;
  }

  // ── 頭数 ────────────────────────────────────────────────────
  if (field === 'count') {
    return `
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="Pages._qrCountAdj(-1)">−</button>
        <input id="widget-count" class="input" type="number" min="0" max="999"
          value="${currentVal || entity?.count || ''}"
          data-field="count"
          style="text-align:center;font-size:1.3rem;font-weight:700;color:var(--green);font-family:var(--font-mono);border-color:rgba(224,144,64,.4)">
        <span style="color:var(--text3)">頭</span>
        <button class="btn btn-ghost btn-sm" onclick="Pages._qrCountAdj(1)">＋</button>
      </div>`;
  }

  // ── 産卵セット開始日 ────────────────────────────────────────
  if (field === 'set_start') {
    return `
      <input id="widget-set_start" class="input" type="date"
        value="${currentVal || ''}"
        data-field="set_start">`;
  }

  // ── デフォルト: テキスト入力 ────────────────────────────────
  return `
    <input id="widget-${field}" class="input" type="text"
      value="${currentVal || ''}"
      placeholder="${label}を入力"
      data-field="${field}">`;
};

// ── 選択ボタンのトグル処理 ───────────────────────────────────
Pages._qrChoiceSelect = function (btn) {
  const field = btn.dataset.field;
  // 同一フィールドの他ボタンをリセット
  document.querySelectorAll(`.diff-choice[data-field="${field}"]`).forEach(b => {
    b.style.background = '';
    b.style.color = '';
    b.style.borderColor = '';
  });
  // 選択状態に
  btn.style.background   = 'var(--green2)';
  btn.style.color        = '#fff';
  btn.style.borderColor  = 'var(--green2)';
};

// ── 頭数 ±ボタン ─────────────────────────────────────────────
Pages._qrCountAdj = function (delta) {
  const el = document.getElementById('widget-count');
  if (!el) return;
  const cur = parseInt(el.value) || 0;
  el.value = Math.max(0, cur + delta);
};

// ── 既存情報確認セクション ───────────────────────────────────
Pages._qrRenderInfoSection = function (entityType, entity, line) {
  if (!entity) return '';

  let rows = [];

  if (entityType === 'LOT') {
    rows = [
      ['ロットID',     entity.display_id],
      ['ライン',       line?.display_id || entity.line_id || '—'],
      ['ステージ',     entity.stage || '—'],
      ['孵化日',       entity.hatch_date || '（未入力）'],
      ['頭数',         entity.count || '（未入力）'],
      ['容器サイズ',   entity.container_size || '—'],
      ['性別区分',     entity.sex_hint || '（未入力）'],
      ['サイズ区分',   entity.size_category || '（未入力）'],
      ['マット種別',   entity.mat_type || '—'],
    ];
  } else if (entityType === 'IND') {
    rows = [
      ['個体ID',       entity.display_id],
      ['ライン',       line?.display_id || entity.line_id || '—'],
      ['性別',         entity.sex || '（未入力）'],
      ['孵化日',       entity.hatch_date || '（未入力）'],
      ['現ステージ',   entity.current_stage || '—'],
      ['最新体重',     entity.latest_weight_g ? entity.latest_weight_g + 'g' : '—'],
      ['産地',         entity.locality || '—'],
      ['世代',         entity.generation || '—'],
    ];
  } else if (entityType === 'SET') {
    rows = [
      ['セットID',     entity.display_id],
      ['交尾開始',     entity.pairing_start || '—'],
      ['産卵開始',     entity.set_start || '（未入力）'],
      ['採卵数',       entity.total_eggs ? entity.total_eggs + '個' : '（未入力）'],
      ['孵化数',       entity.total_hatch ? entity.total_hatch + '頭' : '—'],
      ['孵化率',       entity.hatch_rate ? Math.round(entity.hatch_rate) + '%' : '—'],
      ['ステータス',   entity.status || '—'],
    ];
  }

  return `
    <div class="card">
      <div class="card-title">📋 確認情報</div>
      <div class="info-list">
        ${rows.map(([k, v]) => {
          const isEmpty = !v || v === '—' || v.includes('未入力');
          return `<div class="info-row">
            <span class="info-key">${k}</span>
            <span class="info-val" style="${isEmpty ? 'color:var(--text3)' : ''}">${v}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
};

// ── 差分保存処理 ─────────────────────────────────────────────
Pages._qrDiffSave = async function (entityType, entityId) {
  const btn = document.getElementById('diff-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 保存中...'; }

  try {
    // フォーム内の全入力値を収集
    const updates = {};

    // 選択ボタン（diff-choice）
    document.querySelectorAll('.diff-choice[style*="green2"]').forEach(b => {
      updates[b.dataset.field] = b.dataset.value;
    });

    // テキスト/日付/数値 input
    document.querySelectorAll('[data-field]').forEach(el => {
      if (el.tagName !== 'BUTTON' && el.value !== undefined && el.value !== '') {
        updates[el.dataset.field] = el.value;
      }
    });

    if (Object.keys(updates).length === 0) {
      UI.toast('更新する項目がありません', 'info');
      return;
    }

    // entity typeによって更新 API を選択
    let result;
    if (entityType === 'LOT') {
      result = await API.scan.updateLotFields({ lot_id: entityId, ...updates });
    } else if (entityType === 'IND') {
      result = await API.scan.updateIndFields({ ind_id: entityId, ...updates });
    } else if (entityType === 'SET') {
      result = await API.scan.updateSetFields({ set_id: entityId, ...updates });
    }

    // DBキャッシュを更新
    await Store.syncEntityType(entityType === 'LOT' ? 'lots'
      : entityType === 'IND' ? 'individuals' : 'pairings');

    UI.toast(`✅ 保存しました（${Object.keys(updates).length}件更新）`, 'success');

    // 完了後 → 詳細画面へ遷移
    setTimeout(() => {
      if (entityType === 'LOT')      routeTo('lot-detail',     { lotId: entityId });
      else if (entityType === 'IND') routeTo('ind-detail',     { indId: entityId });
      else if (entityType === 'SET') routeTo('pairing-detail', { pairingId: entityId });
    }, 1000);

  } catch (e) {
    UI.toast('❌ 保存失敗: ' + (e.message || '不明なエラー'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 保存する'; }
  }
};

// ════════════════════════════════════════════════════════════════
// 体重測定モード (weight-mode)
//
// 【モジュール構造】
//   Pages.weightMode  … 画面レンダリング（エントリーポイント）
//   Pages.wmScan      … QRスキャン入力部（weight-modeから直接QR入力する場合）
//   Pages._wmUpdateDelta … 体重入力のリアルタイム前回比・閾値バッジ更新
//   Pages._wmSave     … 成長記録保存（createGrowthRecord → GROWTHテーブル）
//   Pages._wmShowComplete … 保存完了後の「次をスキャン」/「詳細を見る」表示
//
// 【3タップフロー】
//   Tap1: qr-scan画面で「体重測定モード」タブ選択 → QRテキスト貼付 → 「確定」
//   Tap2: 体重数値を入力（フォーカス自動）
//   Tap3: 「成長記録を保存」ボタン
//
// 【体重閾値バッジ】
//   150g以上: 🔥 大型候補
//   170g以上: ⭐ 超大型候補
//
// 【将来拡張ポイント】
//   Phase2: Pages._wmPhotoSection() — 写真撮影・プレビュー追加
//   Phase3: Pages._wmAiComment()    — Gemini Vision でAIコメント自動生成
//   Phase4: セッションモード       — 複数個体の連続スキャンと集計
// ════════════════════════════════════════════════════════════════

// ── 体重閾値定義（将来的に設定画面から変更可能にする拡張ポイント）──
const WM_THRESHOLDS = [
  { min: 170, badge: '⭐ 超大型候補', color: '#c8a84b', bg: 'rgba(200,168,75,.15)' },
  { min: 150, badge: '🔥 大型候補',   color: 'var(--amber)', bg: 'rgba(224,144,64,.12)' },
];

/**
 * Pages.weightMode — 体重測定画面のメインレンダラ
 * params.resolve_result: resolveQR のレスポンス（必須）
 * qr-scan 画面から growth-rec へリダイレクト（weight-mode は薄いラッパー）
 */
// ── weightMode / t1 / t2 は growth-rec への薄いラッパー ─────────
// UI本体は growth.js が担う。ここでは確実に growth-rec へ転送するのみ。

Pages.weightMode = function (params) {
  var p   = params || {};
  var res = p.resolve_result;
  var ent = (res && res.entity) || {};
  var eid = ent.ind_id || ent.lot_id || '';
  var ety = (res && res.entity_type) || 'IND';
  if (eid) {
    routeTo('growth-rec', { targetType: ety, targetId: eid, displayId: ent.display_id || eid });
  } else {
    routeTo('qr-scan');
  }
};

Pages._wmState   = {};
Pages._wmSave    = function () { UI.toast('growth-rec で保存してください', 'info'); };
Pages._wmAdjWeight   = function () {};
Pages._wmUpdateDelta = function () {};
Pages._wmCalcAttrition = function () {};
Pages._wmShowComplete  = function () {};
Pages._wmToggleExtra   = function () {};
Pages._wmApplyPreset   = function () {};
Pages._wmBtnSel        = function () {};
Pages._wmBtnSelMat     = function () {};
Pages._wmOnMatChange   = function () {};
Pages._wmAdjStart      = function () {};
Pages._wmAdjStop       = function () {};
Pages._wmShowPendingPanel = function () {};

Pages.qrScanT1 = function () {
  const main = document.getElementById('main');
  let _processing = false;
  let _lastLot    = null;

  function _render(lotInfo, phase) {
    // phase: 'scan' | 'split' | 'done'
    main.innerHTML = `
      ${UI.header('T1交換 連続処理', { back: true })}
      <div class="page-body">

        <!-- 進捗インジケーター -->
        <div style="display:flex;gap:4px;margin-bottom:12px">
          ${['スキャン','分割入力','完了'].map((s,i) => {
            const active = (i===0&&phase==='scan')||(i===1&&phase==='split')||(i===2&&phase==='done');
            return `<div style="flex:1;padding:6px;text-align:center;border-radius:8px;font-size:.75rem;
              background:${active?'var(--green)':'var(--bg2)'};color:${active?'#fff':'var(--text3)'}">${s}</div>`;
          }).join('')}
        </div>

        ${phase === 'scan' ? _scanPhase() : ''}
        ${phase === 'split' && lotInfo ? _splitPhase(lotInfo) : ''}
        ${phase === 'done'  && lotInfo ? _donePhase(lotInfo)  : ''}

      </div>`;

    if (phase === 'scan') _bindScanEvents();
  }

  function _scanPhase() {
    return `
      <div class="card card-gold" style="text-align:center;padding:20px">
        <div style="font-size:2rem;margin-bottom:8px">📷</div>
        <div style="font-weight:700;margin-bottom:4px">QRコードをスキャン</div>
        <div style="font-size:.8rem;color:var(--text3)">ロットQRコードを読み込んでください</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <input id="t1-qr-input" class="input" placeholder="QR入力 / 手動入力" style="flex:1">
        <button class="btn btn-primary" onclick="Pages._t1ResolveQR()">確認</button>
      </div>
      <button class="btn btn-ghost btn-full" style="margin-top:8px"
        onclick="Pages._t1StartCamera()">📷 カメラで読み取り</button>`;
  }

  function _splitPhase(lot) {
    const count = parseInt(lot.count, 10) || 1;
    const half  = Math.floor(count / 2);
    return `
      <div class="card" style="background:var(--bg2)">
        <div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--gold)">${lot.display_id}</div>
        <div style="font-size:.85rem;color:var(--text3);margin-top:4px">
          ${lot.stage || 'T0'} / ${count}頭 / ${lot.container_size||'—'}
        </div>
      </div>

      <div style="margin-top:12px">
        <div style="font-size:.85rem;font-weight:600;margin-bottom:8px">分割数を入力してください（合計 ≤ ${count}頭）</div>
        <div id="t1-split-rows">
          <div class="split-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <span style="font-family:var(--font-mono);color:var(--gold);min-width:30px">-A</span>
            <input type="number" class="input t1-split-count" min="1" max="${count}" value="${half}"
              oninput="Pages._t1UpdateTotal(${count})">
            <span style="font-size:.8rem;color:var(--text3)">頭</span>
          </div>
          <div class="split-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <span style="font-family:var(--font-mono);color:var(--gold);min-width:30px">-B</span>
            <input type="number" class="input t1-split-count" min="1" max="${count}" value="${count-half}"
              oninput="Pages._t1UpdateTotal(${count})">
            <span style="font-size:.8rem;color:var(--text3)">頭</span>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="Pages._t1AddSplitRow(${count})">＋ ロット追加</button>
        <div id="t1-split-total" style="font-size:.82rem;color:var(--amber);margin-top:6px">
          合計: ${count}頭 / 最大${count}頭
        </div>
      </div>

      <div style="margin-top:12px">
        <div style="font-size:.85rem;font-weight:600;margin-bottom:6px">容器サイズ</div>
        <div style="display:flex;gap:6px">
          ${['1.1L','2.7L','4.8L','10L'].map(s =>
            `<button class="pill ${s===lot.container_size?'active':''}" id="t1-container-${s.replace('.','_')}"
              onclick="Pages._t1SelectContainer('${s}')">${s}</button>`
          ).join('')}
        </div>
        <input type="hidden" id="t1-selected-container" value="${lot.container_size||'2.7L'}">
      </div>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-ghost" style="flex:1" onclick="Pages.qrScanT1()">← 戻る</button>
        <button class="btn btn-primary" style="flex:2"
          onclick="Pages._t1ExecSplit('${lot.lot_id}',${count})">✅ 分割実行</button>
      </div>`;
  }

  function _donePhase(result) {
    const newLots = result.new_lots || [];
    return `
      <div class="card" style="text-align:center;padding:16px;border-color:var(--green)">
        <div style="font-size:2rem">✅</div>
        <div style="font-weight:700;margin-top:8px">${newLots.length}ロットに分割しました</div>
      </div>

      <div style="margin-top:8px">
        ${newLots.map(l => `
          <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px">
            <div>
              <div style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">${l.display_id}</div>
              <div style="font-size:.8rem;color:var(--text3)">${l.count}頭 / T1</div>
            </div>
            <button class="btn btn-ghost btn-sm"
              onclick="Pages._t1GenerateLabel('${l.lot_id}','${l.display_id}')">🏷 ラベル</button>
          </div>`).join('')}
      </div>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-ghost" style="flex:1"
          onclick="routeTo('lot-list')">ロット一覧</button>
        <button class="btn btn-primary" style="flex:2"
          onclick="Pages.qrScanT1()">📷 次のQRへ</button>
      </div>`;
  }

  function _bindScanEvents() {
    const inp = document.getElementById('t1-qr-input');
    if (inp) inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') Pages._t1ResolveQR();
    });
  }

  // 最初のフェーズで描画
  _render(null, 'scan');
  // メソッドをPageに露出（クロージャー外からも再描画できるよう）
  Pages._t1RenderSplit = (lot)  => _render(lot,    'split');
  Pages._t1RenderDone  = (res)  => _render(res,    'done');
};

// ── T1: QR解決 ────────────────────────────────────────────────
Pages._t1ResolveQR = async function () {
  const val = (document.getElementById('t1-qr-input')?.value || '').trim();
  if (!val) { UI.toast('QRを入力してください', 'error'); return; }

  try {
    UI.loading(true);
    // lot_id または display_id で検索
    const lots = Store.getDB('lots') || [];
    let lot = lots.find(l => l.lot_id === val || l.display_id === val);

    if (!lot) {
      // Storeにない場合はAPI経由
      const res = await API.lot.get({ lot_id: val });
      lot = res.lot;
    }
    if (!lot) { UI.toast('ロットが見つかりません: ' + val, 'error'); return; }
    if (lot.status === 'dissolved') { UI.toast('このロットは分割済みです', 'error'); return; }

    Pages._t1RenderSplit(lot);
  } catch(e) {
    UI.toast('エラー: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ── T1: 合計更新 ──────────────────────────────────────────────
Pages._t1UpdateTotal = function (max) {
  const inputs = document.querySelectorAll('.t1-split-count');
  const total  = Array.from(inputs).reduce((s,i) => s + (+i.value||0), 0);
  const el     = document.getElementById('t1-split-total');
  if (el) {
    el.textContent = `合計: ${total}頭 / 最大${max}頭`;
    el.style.color = total > max ? 'var(--red)' : 'var(--text3)';
  }
};

// ── T1: 行追加 ────────────────────────────────────────────────
Pages._t1AddSplitRow = function (max) {
  const rows   = document.getElementById('t1-split-rows');
  if (!rows) return;
  const count  = rows.querySelectorAll('.split-row').length;
  const suffix = String.fromCharCode(65 + count);
  rows.insertAdjacentHTML('beforeend', `
    <div class="split-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <span style="font-family:var(--font-mono);color:var(--gold);min-width:30px">-${suffix}</span>
      <input type="number" class="input t1-split-count" min="1" max="${max}" value="1"
        oninput="Pages._t1UpdateTotal(${max})">
      <span style="font-size:.8rem;color:var(--text3)">頭</span>
    </div>`);
  Pages._t1UpdateTotal(max);
};

// ── T1: 容器選択 ──────────────────────────────────────────────
Pages._t1SelectContainer = function (size) {
  document.querySelectorAll('[id^="t1-container-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('t1-container-' + size.replace('.','_'));
  if (btn) btn.classList.add('active');
  const inp = document.getElementById('t1-selected-container');
  if (inp) inp.value = size;
};

// ── T1: 分割実行 ──────────────────────────────────────────────
Pages._t1ExecSplit = async function (lotId, maxCount) {
  const inputs    = document.querySelectorAll('.t1-split-count');
  const counts    = Array.from(inputs).map(i => +i.value||0).filter(n => n > 0);
  const total     = counts.reduce((s,n) => s+n, 0);
  const container = document.getElementById('t1-selected-container')?.value || '2.7L';

  if (!counts.length) { UI.toast('分割数を入力してください', 'error'); return; }
  if (total > maxCount) { UI.toast(`合計(${total})が元ロット頭数(${maxCount})を超えています`, 'error'); return; }

  try {
    UI.loading(true);
    const res = await API.lot.split({
      lot_id:        lotId,
      split_counts:  counts,
      stage:         'T1',
      container_size: container,
    });
    await syncAll(true);
    Pages._t1RenderDone(res);
  } catch(e) {
    UI.toast('分割失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ── T1: ラベル発行 ────────────────────────────────────────────
Pages._t1GenerateLabel = async function (lotId, displayId) {
  try {
    UI.loading(true);
    await API.label.generate('LOT', lotId, 'larva');
    UI.toast(`${displayId} のラベルを発行しました`);
  } catch(e) {
    UI.toast('ラベル発行失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ── T1: カメラスキャン ────────────────────────────────────────
Pages._t1StartCamera = async function () {
  // 既存の_qrStartCameraロジックを流用してT1モードで動作
  routeTo('qr-scan', { mode: 't1' });
};

// ルーティング登録
window.PAGES['qr-scan-t1'] = () => Pages.qrScanT1();

// weight-mode / t1-weight / t2-weight は growth-rec への薄いラッパー
window.PAGES['weight-mode'] = () => {
  const p = Store.getParams(), res = p.resolve_result, ent = (res && res.entity) || {};
  const eid = ent.ind_id || ent.lot_id || '', ety = (res && res.entity_type) || 'IND';
  eid ? routeTo('growth-rec', { targetType:ety, targetId:eid, displayId:ent.display_id||eid })
      : routeTo('qr-scan');
};
window.PAGES['t1-weight'] = () => {
  const p = Store.getParams(), ent = ((p.resolve_result||{}).entity)||{}, eid = ent.lot_id||'';
  eid ? routeTo('growth-rec', { targetType:'LOT', targetId:eid, displayId:ent.display_id||eid, _preset:'t1' })
      : routeTo('qr-scan', { mode:'weight' });
};
window.PAGES['t2-weight'] = () => {
  const p = Store.getParams(), ent = ((p.resolve_result||{}).entity)||{}, eid = ent.lot_id||'';
  eid ? routeTo('growth-rec', { targetType:'LOT', targetId:eid, displayId:ent.display_id||eid, _preset:'t2' })
      : routeTo('qr-scan', { mode:'weight' });
};
