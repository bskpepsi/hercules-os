// ════════════════════════════════════════════════════════════════
// scan.js — QRスキャン + 差分入力 + 体重測定画面  v2
//
// 【3モード】
//   確認モード  : QR → 個体/ロット/産卵セット詳細画面を直接開く
//   差分入力    : QR → 未入力項目を補完して保存
//   体重測定    : QR → 体重入力 → 保存（最短3タップ）
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
  // モード: 'view' | 'diff' | 'weight'
  let _scanMode = params.mode === 'weight' ? 'weight' : params.mode === 'diff' ? 'diff' : 'view';

  function _modeStyle(m) {
    if (m === _scanMode) {
      const bg = m==='weight' ? 'var(--green)' : m==='diff' ? 'var(--blue)' : 'var(--gold)';
      return `background:${bg};color:#fff;font-weight:700;`;
    }
    return 'color:var(--text3);background:transparent;';
  }
  function _modeDesc() {
    if (_scanMode === 'weight') return '⚖️ QR → 体重入力 → 保存（最短3タップ）';
    if (_scanMode === 'diff')   return '📝 QR → 未入力項目を補完する';
    return '🔍 QR → 個体・ロット・産卵セットの詳細を開く';
  }

  function render() {
    main.innerHTML = `
      ${UI.header('📷 QRスキャン', { back: true })}
      <div class="page-body">

        <!-- 3モードタブ -->
        <div style="display:flex;background:var(--surface2);border-radius:10px;padding:3px;gap:3px">
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('view')}"
            onclick="Pages._qrSwitchMode('view')">🔍 確認</button>
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('diff')}"
            onclick="Pages._qrSwitchMode('diff')">📝 差分</button>
          <button style="flex:1;border:none;padding:7px 4px;border-radius:8px;cursor:pointer;font-size:.75rem;${_modeStyle('weight')}"
            onclick="Pages._qrSwitchMode('weight')">⚖️ 体重</button>
        </div>
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
SET:SET-XXXXXXXX"
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

  Pages._qrSwitchMode = (m) => { _scanMode = m; render(); };
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
  const labels = { LOT: '🟡 ロット', IND: '🟢 個体', SET: '🟠 産卵セット' };
  const type = v.startsWith('LOT:') ? 'LOT' : v.startsWith('IND:') ? 'IND' : v.startsWith('SET:') ? 'SET' : null;
  el.innerHTML = type
    ? `<span style="color:var(--green)">${labels[type]} : ${v.split(':')[1]}</span>`
    : v ? `<span style="color:var(--red)">⚠️ フォーマット不正（LOT: / IND: / SET: で始まる必要があります）</span>` : '';
};

// ── QR解析・モード別遷移 ─────────────────────────────────────
Pages._qrResolve = async function () {
  const qrText = document.getElementById('qr-input')?.value?.trim();
  const errEl  = document.getElementById('qr-error');
  const btn    = document.getElementById('qr-resolve-btn');
  if (!qrText) { if (errEl) errEl.textContent = 'QRコードを入力してください'; return; }
  if (errEl) errEl.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 解析中...'; }

  try {
    const res = await API.scan.resolve(qrText);
    Pages._qrSaveHistory(qrText, res);

    // 選択中モードをボタンのfontWeightで判定
    const btns = document.querySelectorAll('[onclick*="_qrSwitchMode"]');
    let mode = 'view';
    btns.forEach(b => {
      if (b.style.fontWeight === '700' || b.style.background.includes('var(--green)')) mode = 'weight';
      else if (b.style.fontWeight === '700' || b.style.background.includes('var(--blue)')) mode = 'diff';
    });
    // より確実な判定: 選択中ボタンのonclick属性から取得
    const activeBtn = Array.from(document.querySelectorAll('button')).find(b =>
      b.style.fontWeight === '700' && b.onclick && b.getAttribute('onclick')?.includes('_qrSwitchMode')
    );
    if (activeBtn) {
      const m = activeBtn.getAttribute('onclick')?.match(/'(view|diff|weight)'/);
      if (m) mode = m[1];
    }

    if (mode === 'weight') {
      routeTo('weight-mode', { resolve_result: res, qr_text: qrText });
    } else if (mode === 'diff') {
      routeTo('qr-diff', { resolve_result: res, qr_text: qrText });
    } else {
      // 確認モード: 直接詳細画面へ
      const eid = res.entity?.ind_id || res.entity?.lot_id || res.entity?.set_id;
      if (res.entity_type === 'IND' && eid)      routeTo('ind-detail',     { indId: eid });
      else if (res.entity_type === 'LOT' && eid) routeTo('lot-detail',     { lotId: eid });
      else if (res.entity_type === 'SET' && eid) routeTo('pairing-detail', { pairingId: eid });
      else routeTo('qr-diff', { resolve_result: res, qr_text: qrText });
    }
  } catch (e) {
    if (errEl) errEl.textContent = '❌ ' + (e.message || '解析に失敗しました');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 読み取り・確認'; }
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
    UI.toast('QRライブラリ未ロード。ページを再読み込みしてください', 'error');
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
        setTimeout(() => Pages._qrResolve(), 200);
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
        setTimeout(() => Pages._qrResolve(), 300);
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
    await syncAll(true).catch(() => {});

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
 * qr-scan 画面から routeTo('weight-mode', { resolve_result, qr_text }) で遷移
 */
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

  const prevWeight  = (last_growth?.weight_g != null && last_growth.weight_g !== '')
    ? parseFloat(last_growth.weight_g) : null;
  const prevDate    = last_growth?.record_date || '';
  const prevAgeDays = last_growth?.age_days    || '';

  Pages._wmState = {
    entityType : entity_type,
    entityId   : entityId,
    stage      : stage,
    container  : container,
    matType    : matType,
    prevWeight : prevWeight,
    displayId  : displayId,
    lotCount   : lotCount,
  };

  main.innerHTML = `
    ${UI.header('⚖️ 体重測定', { back: true, backFn: "routeTo('qr-scan',{mode:'weight'})" })}
    <div class="page-body has-quick-bar">

      <!-- ① コンパクト情報バー -->
      <div class="quick-info-bar">
        <div style="flex:1;min-width:0">
          <div class="quick-info-id"
            style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${displayId}</div>
          <div style="display:flex;gap:5px;align-items:center;margin-top:4px;flex-wrap:wrap">
            <span style="background:rgba(76,175,120,.15);color:var(--green);
              font-size:.68rem;padding:1px 6px;border-radius:99px;font-weight:600">${stageDisp}</span>
            ${isLot
              ? `<span style="font-size:.7rem;color:var(--text3)">${entity.count || '?'}頭</span>`
              : `<span style="font-size:.7rem;color:var(--text3)">${entity.sex || ''}</span>`}
            ${lineDisp
              ? `<span style="font-size:.68rem;color:var(--text3)">L:${lineDisp}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="quick-info-age">${ageDays !== '—' ? ageDays : '—'}</div>
          <div class="quick-info-age-label">日齢</div>
        </div>
      </div>

      <!-- ② 体重入力 -->
      <div class="card" style="border-color:rgba(76,175,120,.35);padding:16px 14px">
        <div style="text-align:center;font-size:.72rem;font-weight:700;
          color:var(--text3);letter-spacing:.08em;margin-bottom:10px">体重 (g)</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:8px">
          <input
            id="wm-weight"
            type="number" inputmode="decimal" step="0.1" min="0.1" max="999.9"
            placeholder="0.0" autocomplete="off"
            class="num-input-xl"
            style="width:180px;color:var(--green)"
            oninput="Pages._wmUpdateDelta(this.value)"
            onkeydown="if(event.key==='Enter'&&!event.isComposing){Pages._wmSave()}">
          <span style="font-size:1.4rem;color:var(--text3);font-weight:600;flex-shrink:0">g</span>
        </div>
        <div id="wm-delta"
          style="text-align:center;min-height:28px;margin-top:8px;font-size:.92rem;transition:all .15s">
          ${prevWeight !== null
            ? `<span style="color:var(--text3)">前回 <b>${prevWeight}g</b> から —</span>`
            : `<span style="color:var(--text3)">（初回記録）</span>`}
        </div>
      </div>

      <!-- ③ LOT 専用: before/after 頭数（growth.js と統一ロジック） -->
      ${isLot ? `
      <div class="card" style="padding:14px">
        <div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:10px">
          🔢 頭数変化（マット交換時）
        </div>
        <div class="count-row">
          <div>
            <div style="font-size:.68rem;color:var(--text3);margin-bottom:4px;text-align:center">交換前</div>
            <input id="wm-before" type="number" inputmode="numeric"
              class="num-input-xl" style="font-size:2rem"
              min="0" max="999" placeholder="${lotCount || '—'}" value="${lotCount || ''}"
              oninput="Pages._wmCalcAttrition()">
          </div>
          <div class="count-row-arrow">→</div>
          <div>
            <div style="font-size:.68rem;color:var(--text3);margin-bottom:4px;text-align:center">交換後</div>
            <input id="wm-after" type="number" inputmode="numeric"
              class="num-input-xl" style="font-size:2rem"
              min="0" max="999" placeholder="—"
              oninput="Pages._wmCalcAttrition()">
          </div>
        </div>
        <div id="wm-attrition" class="count-attrition"></div>
      </div>` : ''}

      <!-- ④ 追加（折りたたみ） -->
      <div style="margin-top:8px">
        <div class="collapse-toggle" onclick="Pages._wmToggleExtra(this)">
          <span>📝 追加メモ（任意）</span>
          <span style="font-size:.7rem;transition:transform .2s">▼</span>
        </div>
        <div id="wm-extra" class="collapse-body closed">
          <div class="card" style="border-radius:0 0 var(--radius) var(--radius);margin-top:-1px">
            <div class="form-section">
              <div class="field">
                <label class="field-label">頭幅 (mm)</label>
                <input id="wm-head" class="input" type="number"
                  inputmode="decimal" step="0.1" min="0" max="99" placeholder="例: 38.5">
              </div>
              <div class="field">
                <label class="field-label">観察メモ</label>
                <textarea id="wm-note" class="input" rows="2"
                  placeholder="幼虫の状態、色艶、活動性など"></textarea>
              </div>
              <div class="field">
                <label class="field-label">交換種別</label>
                <select id="wm-exchange" class="input">
                  <option value="">体重測定のみ</option>
                  <option value="マット交換">マット交換</option>
                  <option value="容器交換">容器交換</option>
                  <option value="マット+容器交換">マット+容器交換</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      ${prevWeight !== null ? `
      <div class="card" style="padding:10px 14px;margin-top:8px">
        <div style="font-size:.68rem;color:var(--text3);margin-bottom:4px">前回記録</div>
        <div style="display:flex;align-items:baseline;gap:10px">
          <span style="font-size:1.5rem;font-weight:700;color:var(--text2);
            font-family:var(--font-mono)">${prevWeight}g</span>
          <span style="font-size:.75rem;color:var(--text3)">
            ${prevDate}${prevAgeDays ? ` / ${prevAgeDays}日齢` : ''}
          </span>
        </div>
      </div>` : ''}

    </div>

    <!-- 下部固定アクションバー -->
    <div class="quick-action-bar">
      <button class="btn btn-ghost btn-xl" style="flex:1"
        onclick="routeTo('qr-scan',{mode:'weight'})">
        📷 スキャン
      </button>
      <button id="wm-save-btn" class="btn btn-gold btn-xl" style="flex:2"
        onclick="Pages._wmSave()">
        💾 保存
      </button>
    </div>`;

  // 体重入力にフォーカス（キーボード即表示）
  setTimeout(() => document.getElementById('wm-weight')?.focus(), 120);
};

// LOT の before/after から減耗数を自動計算して表示
Pages._wmCalcAttrition = function () {
  const beforeEl = document.getElementById('wm-before');
  const afterEl  = document.getElementById('wm-after');
  const dispEl   = document.getElementById('wm-attrition');
  if (!dispEl) return;

  const before = parseInt(beforeEl?.value, 10);
  const after  = parseInt(afterEl?.value,  10);

  if (isNaN(before) || isNaN(after)) {
    dispEl.textContent = '';
    return;
  }
  const attrition = before - after;
  if (attrition > 0) {
    dispEl.textContent  = `減耗 ${attrition} 頭`;
    dispEl.style.color  = 'var(--red)';
  } else if (attrition === 0) {
    dispEl.textContent  = '変化なし';
    dispEl.style.color  = 'var(--text3)';
  } else {
    dispEl.textContent  = `⚠️ 後の方が多い (${Math.abs(attrition)}頭増)`;
    dispEl.style.color  = 'var(--amber)';
  }
};


Pages._wmUpdateDelta = function (rawVal) {
  const el   = document.getElementById('wm-delta');
  if (!el) return;

  const cur  = parseFloat(rawVal);
  const prev = Pages._wmState?.prevWeight ?? null;

  // 未入力 or 不正値
  if (!rawVal || isNaN(cur) || cur <= 0) {
    el.innerHTML = prev !== null
      ? `<span style="color:var(--text3)">前回 <b>${prev}g</b> から —</span>`
      : `<span style="color:var(--text3)">（前回体重なし・初回記録）</span>`;
    return;
  }

  // ── 閾値バッジを判定 ──────────────────────────────────────
  let thresholdHtml = '';
  for (const t of WM_THRESHOLDS) {
    if (cur >= t.min) {
      thresholdHtml = `
        <div style="
          display:inline-block;
          background:${t.bg};
          border:1px solid ${t.color};
          border-radius:99px;
          padding:3px 12px;
          font-size:.82rem;
          font-weight:700;
          color:${t.color};
          margin-bottom:4px">
          ${t.badge}
        </div>`;
      break; // 最上位の閾値のみ表示
    }
  }

  // ── 前回比 ────────────────────────────────────────────────
  if (prev === null) {
    el.innerHTML = `
      ${thresholdHtml}
      <div style="color:var(--text2)">📝 初回記録: <b>${cur}g</b></div>`;
    return;
  }

  const diff  = Math.round((cur - prev) * 10) / 10;
  const isPos = diff > 0;
  const isNeg = diff < 0;
  const arrow = isPos ? '↑' : isNeg ? '↓' : '→';
  const color = isPos ? 'var(--green)' : isNeg ? 'var(--red)' : 'var(--text3)';
  const sign  = isPos ? '+' : '';
  // +5g以上はお祝いを表示
  const celebEmoji = isPos && diff >= 5 ? ' 🎉' : '';

  el.innerHTML = `
    ${thresholdHtml}
    <span style="color:${color};font-weight:700;font-size:1.1rem">
      ${arrow} ${sign}${diff}g${celebEmoji}
    </span>
    <span style="color:var(--text3);font-size:.75rem;margin-left:6px">
      （前回 ${prev}g）
    </span>`;
};

// ─────────────────────────────────────────────────────────────────
// Pages._wmSave — 成長記録を GROWTHテーブルに保存
// 既存の API.growth.create (= createGrowthRecord) を利用
// IND の場合は individual.latest_weight_g も自動更新される（GAS側で処理）
// ─────────────────────────────────────────────────────────────────
Pages._wmSave = async function () {
  const state    = Pages._wmState;
  const weightEl = document.getElementById('wm-weight');
  const rawVal   = weightEl?.value;
  const weightVal = parseFloat(rawVal);

  // バリデーション
  if (!rawVal || isNaN(weightVal) || weightVal <= 0 || weightVal > 999.9) {
    UI.toast('体重を入力してください（0.1〜999.9g）', 'error');
    weightEl?.focus();
    return;
  }
  if (!state?.entityId) {
    UI.toast('対象IDが不明です。再スキャンしてください', 'error');
    return;
  }

  const btn = document.getElementById('wm-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 保存中...'; }

  try {
    // ── 成長記録データを構築（growth.js の _grSave と統一ロジック）──
    const headVal     = parseFloat(document.getElementById('wm-head')?.value);
    const noteVal     = document.getElementById('wm-note')?.value?.trim() || '';
    const exchangeVal = document.getElementById('wm-exchange')?.value || '';

    // LOT 専用: before_count / after_count（growth.js と同一計算）
    const beforeRaw = document.getElementById('wm-before')?.value;
    const afterRaw  = document.getElementById('wm-after')?.value;
    const beforeCount = (beforeRaw !== undefined && beforeRaw !== '')
      ? parseInt(beforeRaw, 10) : undefined;
    const afterCount  = (afterRaw  !== undefined && afterRaw  !== '')
      ? parseInt(afterRaw,  10) : undefined;

    const growthData = {
      target_type:   state.entityType,
      target_id:     state.entityId,
      stage:         state.stage   || '',
      weight_g:      weightVal,
      container:     state.container || '',
      mat_type:      state.matType   || '',
      // LOT の頭数変化（undefined のまま送ると GAS 側でスキップ）
      before_count:  beforeCount,
      after_count:   afterCount,
    };
    if (!isNaN(headVal) && headVal > 0) growthData.head_width_mm = headVal;
    if (noteVal)     growthData.note_private  = noteVal;
    if (exchangeVal) growthData.exchange_type = exchangeVal;

    // ── API呼び出し ───────────────────────────────────────
    await API.growth.create(growthData);

    // ── キャッシュ更新（growth.js と統一）──────────────────────
    if (state.entityType === 'IND') {
      Store.patchDBItem('individuals', 'ind_id', state.entityId,
        { latest_weight_g: weightVal, current_stage: state.stage });
      // patchDBItem でローカル更新済み
    }
    if (state.entityType === 'LOT') {
      const lotUpdates = {};
      if (state.stage) lotUpdates.stage = state.stage;
      if (afterCount !== undefined) {
        lotUpdates.count = afterCount;
        if (afterCount === 0) lotUpdates.status = 'individualized';
      }
      if (Object.keys(lotUpdates).length) {
        Store.patchDBItem('lots', 'lot_id', state.entityId, lotUpdates);
      }
    }
    // addGrowthRecord でキャッシュ更新済み

    // ── 完了UIへ切り替え ─────────────────────────────────
    Pages._wmShowComplete(state.entityType, state.entityId, weightVal);

  } catch (e) {
    UI.toast('❌ 保存失敗: ' + (e.message || '不明なエラー'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '💾 成長記録を保存'; }
  }
};

// ─────────────────────────────────────────────────────────────────
// Pages._wmShowComplete — 保存完了後の画面
// ・「📷 次をスキャン」→ qr-scan（weight-modeタブ選択済みで戻る）
// ・「詳細を見る」   → ind-detail または lot-detail
// ─────────────────────────────────────────────────────────────────
Pages._wmShowComplete = function (entityType, entityId, weight) {
  const main = document.getElementById('main');
  const body = main?.querySelector('.page-body');
  if (!body) return;

  const detailRoute = entityType === 'IND' ? 'ind-detail' : 'lot-detail';
  const detailParam = entityType === 'IND' ? 'indId'      : 'lotId';

  // ── 完了バナー ──────────────────────────────────────────────
  const bannerEl = document.createElement('div');
  bannerEl.style.cssText = [
    'background:linear-gradient(135deg,rgba(45,122,82,.22),rgba(76,175,120,.08))',
    'border:1px solid rgba(76,175,120,.45)',
    'border-radius:var(--radius)',
    'padding:20px 16px',
    'text-align:center',
    'margin-bottom:14px',
  ].join(';');

  const scanBtn = document.createElement('button');
  scanBtn.className = 'btn btn-ghost';
  scanBtn.style.cssText = 'flex:1;padding:12px';
  scanBtn.textContent = '📷 次をスキャン';
  scanBtn.onclick = () => routeTo('qr-scan', { mode: 'weight' });

  const detailBtn = document.createElement('button');
  detailBtn.className = 'btn btn-primary';
  detailBtn.style.cssText = 'flex:1;padding:12px';
  detailBtn.textContent = '詳細を見る';
  detailBtn.onclick = () => {
    const p = {};
    p[detailParam] = entityId;
    routeTo(detailRoute, p);
  };

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;margin-top:16px';
  btnRow.appendChild(scanBtn);
  btnRow.appendChild(detailBtn);

  bannerEl.innerHTML =
    '<div style="font-size:2.2rem;margin-bottom:6px">✅</div>' +
    '<div style="font-size:1.15rem;font-weight:700;color:var(--green)">' + weight + 'g を記録しました</div>' +
    '<div style="font-size:.78rem;color:var(--text3);margin-top:4px">GROWTHテーブルに保存完了</div>';
  bannerEl.appendChild(btnRow);
  body.insertBefore(bannerEl, body.firstChild);

  // ── LOT の場合: 同ラインの次ロット選択バー ─────────────────
  if (entityType !== 'LOT') { main.scrollTop = 0; return; }

  const currentLot = Store.getLot(entityId);
  if (!currentLot) { main.scrollTop = 0; return; }

  const sameLine = Store.filterLots({ line_id: currentLot.line_id, status: 'active' })
    .filter(l => l.lot_id !== entityId);
  const candidates = sameLine.length
    ? sameLine
    : Store.filterLots({ status: 'active' }).filter(l => l.lot_id !== entityId).slice(0, 6);

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

    const btn = document.createElement('button');
    btn.style.cssText = [
      'flex-shrink:0', 'padding:6px 12px', 'border-radius:20px',
      'background:var(--surface2)', 'border:1px solid var(--border)',
      'font-size:.78rem', 'cursor:pointer', 'white-space:nowrap',
    ].join(';');
    btn.innerHTML =
      '<span style="color:var(--gold);font-weight:700">' + code + '</span>' +
      '<span style="color:var(--text3);margin-left:4px">' + l.count + '頭</span>';

    // 安全なクロージャでルート遷移（JSON.stringify を使わない）
    btn.onclick = (function(lotId, lotDisplayId, lotLineId) {
      return function() {
        const lot2 = Store.getLot(lotId);
        const ln2  = Store.getLine(lotLineId);
        if (lot2) {
          routeTo('weight-mode', {
            resolve_result: {
              entity_type: 'LOT',
              entity:      lot2,
              line:        ln2 || {},
              last_growth: null,
            },
          });
        } else {
          routeTo('lot-detail', { lotId: lotId });
        }
      };
    })(l.lot_id, l.display_id, l.line_id);

    btnScroll.appendChild(btn);
  });

  // 閉じるボタン
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = [
    'flex-shrink:0', 'padding:6px 12px', 'border-radius:20px',
    'background:transparent', 'border:1px solid var(--border)',
    'font-size:.78rem', 'cursor:pointer', 'color:var(--text3)',
  ].join(';');
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => nextBarEl.remove();
  btnScroll.appendChild(closeBtn);

  nextBarEl.appendChild(btnScroll);
  bannerEl.insertAdjacentElement('afterend', nextBarEl);
  main.scrollTop = 0;
};

// ─────────────────────────────────────────────────────────────────
// Pages._wmToggleExtra — 追加メモ アコーディオン開閉
// ─────────────────────────────────────────────────────────────────
Pages._wmToggleExtra = function (btn) {
  const body  = document.getElementById('wm-extra');
  const arrow = btn?.querySelector('span:last-child');
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open',   !isOpen);
  body.classList.toggle('closed',  isOpen);
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
};


// ════════════════════════════════════════════════════════════════
// T1交換 QR連続処理モード
// qr-scan-t1 ページ
// フロー: QRスキャン → ロット情報表示 → 分割数入力 → 保存 → ラベル → 次へ
// ════════════════════════════════════════════════════════════════

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
