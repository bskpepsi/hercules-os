// ════════════════════════════════════════════════════════════════
// scan.js — QRスキャン + 差分入力画面
//
// 【画面フロー】
//   qr-scan  → QR入力（テキスト/カメラ）→ resolveQR → qr-diff   （差分入力モード）
//   qr-scan  → QR入力（テキスト/カメラ）→ resolveQR → weight-mode（体重測定モード）
//   qr-diff  → 差分入力 → updateLotFields / updateIndFields / updateSetFields
//   weight-mode → 体重入力 → createGrowthRecord
//
// 【将来拡張ポイント】
//   - カメラ読み取り: jsQR ライブラリを使った <video>+<canvas> 実装に差し替え可能
//     _startCameraScanner() が拡張ポイント
//   - 手書き丸認識: Gemini Vision API に画像を渡して性別丸を認識する
//     _analyzeHandwriting() が拡張ポイント
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// QRスキャン画面 (qr-scan)
// ════════════════════════════════════════════════════════════════
Pages.qrScan = function (params = {}) {
  const main = document.getElementById('main');
  // モード管理: 'diff' | 'weight'
  let _scanMode = params.mode || 'diff';

  main.innerHTML = `
    ${UI.header('📷 QRスキャン', { back: true })}
    <div class="page-body">

      <!-- モード切り替えタブ -->
      <div style="display:flex;background:var(--surface2);border-radius:var(--radius-sm);padding:3px;gap:3px">
        <button id="mode-diff" class="btn btn-sm"
          style="flex:1;${_scanMode==='diff'?'background:var(--surface);color:var(--text);':'color:var(--text3);'}"
          onclick="Pages._qrSwitchMode('diff')">
          📝 差分入力モード
        </button>
        <button id="mode-weight" class="btn btn-sm"
          style="flex:1;${_scanMode==='weight'?'background:var(--green2);color:#fff;':'color:var(--text3);'}"
          onclick="Pages._qrSwitchMode('weight')">
          ⚖️ 体重測定モード
        </button>
      </div>
      <!-- モード説明 -->
      <div id="mode-desc" style="font-size:.72rem;color:var(--text3);padding:0 2px;margin-top:-4px">
        ${_scanMode === 'weight'
          ? '⚖️ QRスキャン → 体重入力 → 保存の最短3タップモード'
          : '📝 QRスキャン → 未入力項目を補完するモード'}
      </div>

      <!-- カメラ読取エリア（将来実装プレースホルダー） -->
      <div class="card" id="camera-card" style="display:none">
        <div class="card-title" style="color:var(--blue)">📸 カメラで読み取り</div>
        <div style="position:relative;width:100%;background:#000;border-radius:var(--radius);overflow:hidden">
          <video id="qr-video" autoplay playsinline
            style="width:100%;display:block;max-height:240px;object-fit:cover"></video>
          <canvas id="qr-canvas" style="display:none"></canvas>
          <!-- スキャン枠 -->
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
            <div style="width:180px;height:180px;border:2px solid var(--green);border-radius:8px;
              box-shadow:0 0 0 9999px rgba(0,0,0,0.45)"></div>
          </div>
        </div>
        <button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="Pages._qrStopCamera()">
          ✕ カメラを閉じる
        </button>
      </div>

      <!-- メイン入力エリア -->
      <div class="card">
        <div class="card-title">QRコードを読み取る</div>

        <!-- カメラ起動ボタン（将来実装） -->
        <button class="btn btn-ghost btn-full" id="camera-btn" onclick="Pages._qrStartCamera()"
          style="margin-bottom:12px;border:2px dashed var(--border2)">
          <span style="font-size:1.3rem;margin-right:6px">📷</span>
          カメラで読み取る
          <span style="font-size:.72rem;color:var(--text3);margin-left:6px">(準備中)</span>
        </button>

        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <div style="flex:1;height:1px;background:var(--border2)"></div>
          <span style="font-size:.75rem;color:var(--text3)">または</span>
          <div style="flex:1;height:1px;background:var(--border2)"></div>
        </div>

        <!-- テキスト入力（メイン実装） -->
        <div class="field" style="margin-bottom:12px">
          <label class="field-label">QRコードの内容を貼り付け / 手入力</label>
          <textarea id="qr-input" class="input" rows="3"
            placeholder="例:&#10;LOT:LOT-XXXXXXXX&#10;IND:IND-XXXXXXXX&#10;SET:SET-XXXXXXXX"
            style="font-family:var(--font-mono);font-size:.88rem;letter-spacing:.02em"
            oninput="Pages._qrPreviewInput(this.value)"></textarea>
          <div id="qr-preview" style="font-size:.72rem;margin-top:4px"></div>
        </div>

        <button class="btn btn-gold btn-full" id="qr-resolve-btn"
          onclick="Pages._qrResolve()">
          🔍 読み取り・確認
        </button>
        <div id="qr-error" style="margin-top:8px;font-size:.8rem;color:var(--red)"></div>
      </div>

      <!-- 最近スキャン履歴（localStorage） -->
      <div id="scan-history-card"></div>

      <!-- ラベル種別ガイド -->
      <div class="card" style="border-color:rgba(91,168,232,.15)">
        <div class="card-title" style="color:var(--blue)">🏷️ ラベルQRフォーマット</div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:.8rem">
          ${[
            ['LOT:LOT-xxxxx', '① 卵管理ラベル', 'var(--amber)', '孵化日・頭数を補完'],
            ['LOT:LOT-xxxxx', '② 複数頭飼育ラベル', 'var(--blue)', '性別区分・サイズ区分を補完'],
            ['IND:IND-xxxxx', '③ 個別飼育ラベル', 'var(--green)', '性別を補完'],
            ['SET:SET-xxxxx', '④ 産卵セットラベル', 'var(--gold)', '採卵情報を確認'],
          ].map(([code, label, color, hint]) => `
            <div style="display:flex;align-items:flex-start;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
              <code style="font-family:var(--font-mono);font-size:.72rem;color:${color};
                background:var(--bg3);padding:2px 6px;border-radius:4px;flex-shrink:0">${code}</code>
              <div>
                <div style="color:var(--text2);font-weight:600">${label}</div>
                <div style="color:var(--text3);font-size:.72rem">${hint}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  // 履歴表示
  Pages._qrRenderHistory();

  // params から自動実行（他画面からの遷移用）
  if (params.qr_text) {
    document.getElementById('qr-input').value = params.qr_text;
    Pages._qrResolve();
  }
};

// ── モード切り替え ───────────────────────────────────────────────
Pages._qrSwitchMode = function (mode) {
  const diffBtn   = document.getElementById('mode-diff');
  const weightBtn = document.getElementById('mode-weight');
  const descEl    = document.getElementById('mode-desc');
  if (!diffBtn || !weightBtn) return;

  if (mode === 'weight') {
    diffBtn.style.background   = '';
    diffBtn.style.color        = 'var(--text3)';
    weightBtn.style.background = 'var(--green2)';
    weightBtn.style.color      = '#fff';
    if (descEl) descEl.textContent = '⚖️ QRスキャン → 体重入力 → 保存の最短3タップモード';
  } else {
    diffBtn.style.background   = 'var(--surface)';
    diffBtn.style.color        = 'var(--text)';
    weightBtn.style.background = '';
    weightBtn.style.color      = 'var(--text3)';
    if (descEl) descEl.textContent = '📝 QRスキャン → 未入力項目を補完するモード';
  }
};

// ── QR入力のリアルタイムプレビュー ───────────────────────────
Pages._qrPreviewInput = function (val) {
  const el = document.getElementById('qr-preview');
  if (!el) return;
  const v = val.trim();
  if (!v) { el.innerHTML = ''; return; }
  const prefix = v.split(':')[0]?.toUpperCase();
  const labels = { LOT: '🟡 ロット', IND: '🟢 個体', SET: '🟠 産卵セット' };
  const lbl = labels[prefix];
  el.innerHTML = lbl
    ? `<span style="color:var(--green)">${lbl} として解析します</span>`
    : `<span style="color:var(--red)">⚠️ フォーマット不正（LOT: / IND: / SET: で始まる必要があります）</span>`;
};

// ── QR解析実行 ────────────────────────────────────────────────
Pages._qrResolve = async function () {
  const qrText = document.getElementById('qr-input')?.value?.trim();
  const errEl  = document.getElementById('qr-error');
  const btn    = document.getElementById('qr-resolve-btn');
  if (!qrText) { if (errEl) errEl.textContent = 'QRコードを入力してください'; return; }
  if (errEl) errEl.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 解析中...'; }

  try {
    const res = await API.scan.resolve(qrText);
    // 履歴に保存
    Pages._qrSaveHistory(qrText, res);
    // モードに応じて遷移先を変更
    const mode = document.getElementById('mode-weight')?.style?.background?.includes('green')
      || document.querySelector('#mode-weight.btn-primary') ? 'weight' : 'diff';
    // モードボタンの選択状態を見て判定（より確実な方法）
    const weightBtn = document.getElementById('mode-weight');
    const isWeight  = weightBtn && weightBtn.style.background && weightBtn.style.background.includes('var(--green2)');
    if (isWeight) {
      routeTo('weight-mode', { resolve_result: res, qr_text: qrText });
    } else {
      routeTo('qr-diff', { resolve_result: res, qr_text: qrText });
    }
  } catch (e) {
    if (errEl) errEl.textContent = '❌ ' + (e.message || '解析に失敗しました。QRコードを確認してください。');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 読み取り・確認'; }
  }
};

// ── スキャン履歴（sessionStorage） ───────────────────────────
Pages._qrSaveHistory = function (qrText, res) {
  try {
    const key  = 'qr_scan_history';
    const hist = JSON.parse(sessionStorage.getItem(key) || '[]');
    hist.unshift({ qr_text: qrText, entity_type: res.entity_type, label_type: res.label_type,
      display_id: res.entity?.display_id || '', scanned_at: new Date().toLocaleTimeString('ja-JP') });
    sessionStorage.setItem(key, JSON.stringify(hist.slice(0, 5)));
  } catch(e) {}
};

Pages._qrRenderHistory = function () {
  const el = document.getElementById('scan-history-card');
  if (!el) return;
  try {
    const hist = JSON.parse(sessionStorage.getItem('qr_scan_history') || '[]');
    if (!hist.length) return;
    el.innerHTML = `
      <div class="card">
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
  document.getElementById('qr-input').value = qrText;
  Pages._qrResolve();
};

// ── カメラ読み取り（将来実装プレースホルダー） ─────────────────
Pages._qrStartCamera = async function () {
  // 将来: jsQR + getUserMedia で実装
  // 現在はフォールバックのトースト表示
  UI.toast('カメラ読み取りは準備中です。テキスト貼り付けをご利用ください。', 'info', 3500);
  /* 将来実装サンプル:
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  const video  = document.getElementById('qr-video');
  video.srcObject = stream;
  document.getElementById('camera-card').style.display = 'block';
  Pages._qrScanLoop(video);
  */
};

Pages._qrStopCamera = function () {
  const video = document.getElementById('qr-video');
  if (video?.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); }
  document.getElementById('camera-card').style.display = 'none';
};


// ════════════════════════════════════════════════════════════════
// 差分入力画面 (qr-diff)
// ════════════════════════════════════════════════════════════════
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
      if (entityType === 'LOT')      routeTo('lot-detail',     { id: entityId });
      else if (entityType === 'IND') routeTo('ind-detail',     { id: entityId });
      else if (entityType === 'SET') routeTo('pairing-detail', { id: entityId });
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
  // resolve_result がない場合はスキャン画面（体重測定モード）に戻す
  if (!res || !res.entity) { routeTo('qr-scan', { mode: 'weight' }); return; }

  const main = document.getElementById('main');
  const { entity_type, entity, line, last_growth } = res;

  // ── エンティティ情報を整理 ──────────────────────────────────
  const displayId  = entity.display_id  || '—';
  const isLot      = entity_type === 'LOT';
  // IND は current_stage、LOT は stage
  const stage      = (isLot ? entity.stage : entity.current_stage) || '—';
  // ステージ表示名（config.js の STAGE_LABELS を参照、なければそのまま表示）
  const stageDisp  = (typeof STAGE_LABELS !== 'undefined' && STAGE_LABELS[stage]) || stage;
  // 日齢: GAS側の _age オブジェクト or ageDays フィールド
  const ageDays    = entity._age?.totalDays ?? entity.ageDays ?? '—';
  // コンテナ・マット（成長記録に自動補完）
  const container  = (isLot ? entity.container_size : entity.current_container) || '';
  const matType    = (isLot ? entity.mat_type : entity.current_mat)             || '';
  // ライン略称
  const lineDisp   = line?.line_code || line?.display_id || '';
  // エンティティID（保存に使用）
  const entityId   = (isLot ? entity.lot_id : entity.ind_id) || '';

  // ── 前回記録 ────────────────────────────────────────────────
  const prevWeight  = (last_growth?.weight_g != null && last_growth.weight_g !== '')
    ? parseFloat(last_growth.weight_g) : null;
  const prevDate    = last_growth?.record_date || '';
  const prevAgeDays = last_growth?.age_days    || '';

  // ── ページ状態をモジュール変数に保持（_wmUpdateDelta / _wmSave から参照）──
  Pages._wmState = {
    entityType : entity_type,
    entityId   : entityId,
    stage      : stage,
    container  : container,
    matType    : matType,
    prevWeight : prevWeight,
    displayId  : displayId,
  };

  // ── HTML レンダリング ────────────────────────────────────────
  main.innerHTML = `
    ${UI.header('⚖️ 体重測定', { back: true, backFn: "routeTo('qr-scan',{mode:'weight'})" })}
    <div class="page-body">

      <!-- ① 個体/ロット情報ヘッダー（コンパクト） -->
      <div class="card" style="padding:12px 14px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <!-- 表示ID -->
            <div style="font-family:var(--font-mono);font-size:.98rem;font-weight:700;
              color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${displayId}
            </div>
            <!-- バッジ行 -->
            <div style="display:flex;gap:6px;align-items:center;margin-top:5px;flex-wrap:wrap">
              <span style="background:rgba(76,175,120,.15);color:var(--green);
                font-size:.7rem;padding:2px 7px;border-radius:99px;font-weight:600">
                ${stageDisp}
              </span>
              ${isLot
                ? `<span style="font-size:.73rem;color:var(--text3)">${entity.count || '?'}頭ロット</span>`
                : `<span style="font-size:.73rem;color:var(--text3)">${entity.sex || ''}</span>`}
              ${lineDisp
                ? `<span style="font-size:.7rem;color:var(--text3)">L:${lineDisp}</span>`
                : ''}
            </div>
          </div>
          <!-- 日齢 -->
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:1.8rem;font-weight:700;color:var(--blue);line-height:1;
              font-family:var(--font-mono)">
              ${ageDays !== '—' ? ageDays : '—'}
            </div>
            <div style="font-size:.63rem;color:var(--text3);margin-top:1px">日齢</div>
          </div>
        </div>
        ${isLot ? `
          <div style="font-size:.7rem;color:var(--amber);margin-top:7px;
            padding-top:7px;border-top:1px solid var(--border)">
            ⚠️ ロット測定: 平均体重として記録します
          </div>` : ''}
      </div>

      <!-- ② 体重入力カード（メイン操作） -->
      <div class="card" style="border-color:rgba(76,175,120,.35)">

        <!-- ラベル -->
        <div style="text-align:center;font-size:.75rem;font-weight:700;
          color:var(--text3);letter-spacing:.08em;margin-bottom:10px">
          体重を入力 (g)
        </div>

        <!-- 体重入力フィールド -->
        <div style="display:flex;align-items:center;justify-content:center;gap:10px">
          <input
            id="wm-weight"
            type="number"
            inputmode="decimal"
            step="0.1"
            min="0.1"
            max="999.9"
            placeholder="0.0"
            autocomplete="off"
            oninput="Pages._wmUpdateDelta(this.value)"
            onkeydown="if(event.key==='Enter'&&!event.isComposing){Pages._wmSave()}"
            style="
              font-size:2.8rem;
              font-weight:700;
              font-family:var(--font-mono);
              text-align:center;
              width:190px;
              padding:12px 8px;
              background:var(--bg3);
              border:2px solid var(--green2);
              border-radius:var(--radius);
              color:var(--green);
              outline:none;
              -webkit-appearance:none;
              -moz-appearance:textfield;
            ">
          <span style="font-size:1.6rem;color:var(--text3);font-weight:600;flex-shrink:0">g</span>
        </div>

        <!-- ③ 前回比 + 閾値バッジ（リアルタイム更新エリア） -->
        <div id="wm-delta"
          style="text-align:center;min-height:30px;margin-top:10px;font-size:.95rem;
            transition:all .15s ease">
          ${prevWeight !== null
            ? `<span style="color:var(--text3)">前回 <b>${prevWeight}g</b> から —</span>`
            : `<span style="color:var(--text3)">（前回体重なし・初回記録）</span>`}
        </div>

        <!-- 保存ボタン -->
        <button
          id="wm-save-btn"
          class="btn btn-gold btn-full"
          style="margin-top:14px;font-size:1.05rem;padding:15px;letter-spacing:.03em"
          onclick="Pages._wmSave()">
          💾 成長記録を保存
        </button>
      </div>

      <!-- ④ 前回記録カード -->
      ${prevWeight !== null ? `
      <div class="card" style="padding:10px 14px">
        <div style="font-size:.7rem;color:var(--text3);font-weight:700;
          letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">
          前回記録
        </div>
        <div style="display:flex;align-items:baseline;gap:10px">
          <span style="font-size:1.7rem;font-weight:700;color:var(--text2);
            font-family:var(--font-mono)">${prevWeight}g</span>
          <span style="font-size:.78rem;color:var(--text3)">
            ${prevDate}${prevAgeDays ? ` / ${prevAgeDays}日齢` : ''}
          </span>
        </div>
      </div>` : ''}

      <!-- ⑤ 追加メモ（アコーディオン・任意） -->
      <div class="card" style="padding:0;overflow:hidden">
        <button class="btn btn-ghost btn-full"
          style="padding:11px 14px;justify-content:space-between;border-radius:var(--radius);
            font-size:.82rem;color:var(--text2)"
          onclick="Pages._wmToggleExtra(this)">
          <span>📝 追加メモ（任意）</span>
          <span id="wm-extra-arrow" style="font-size:.7rem;transition:transform .2s">▼</span>
        </button>
        <div id="wm-extra" style="display:none;padding:4px 14px 14px">
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

      <!-- Phase2拡張ポイント: 写真撮影セクション（現在は非表示） -->
      <!-- <div id="wm-photo-section" style="display:none"> Phase2: カメラUI </div> -->

    </div>`;

  // 体重フィールドに自動フォーカス（スマホキーボードを即時展開）
  setTimeout(() => { document.getElementById('wm-weight')?.focus(); }, 180);
};

// ─────────────────────────────────────────────────────────────────
// Pages.wmScan — weight-mode内でQR入力を直接受け付けるサブ関数
// 用途: 将来的に weight-mode画面内にインラインQR入力エリアを追加する場合
//       現在は qr-scan → weight-mode の遷移フローを使用
// ─────────────────────────────────────────────────────────────────
Pages.wmScan = async function (qrText) {
  if (!qrText || !qrText.trim()) {
    UI.toast('QRコードを入力してください', 'error');
    return;
  }
  try {
    const res = await API.scan.resolve(qrText.trim());
    if (res.entity_type === 'SET') {
      UI.toast('産卵セットは体重測定できません', 'info');
      return;
    }
    // weight-mode 画面を再レンダリング
    Pages.weightMode({ resolve_result: res, qr_text: qrText });
  } catch (e) {
    UI.toast('QR解析失敗: ' + (e.message || '不明なエラー'), 'error');
  }
};

// ─────────────────────────────────────────────────────────────────
// Pages._wmUpdateDelta — 体重入力のリアルタイム表示更新
// ・前回比（↑+Xg / ↓-Xg / →同じ）を色付きで表示
// ・150g以上: 🔥大型候補、170g以上: ⭐超大型候補 バッジを表示
// ─────────────────────────────────────────────────────────────────
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
    // ── 成長記録データを構築 ──────────────────────────────
    const growthData = {
      target_type:   state.entityType,
      target_id:     state.entityId,
      stage:         state.stage   || '',
      weight_g:      weightVal,
      container:     state.container || '',
      mat_type:      state.matType   || '',
    };

    // 追加メモ（任意入力）
    const headVal     = parseFloat(document.getElementById('wm-head')?.value);
    const noteVal     = document.getElementById('wm-note')?.value?.trim();
    const exchangeVal = document.getElementById('wm-exchange')?.value;
    if (!isNaN(headVal) && headVal > 0) growthData.head_width_mm = headVal;
    if (noteVal)     growthData.note_private  = noteVal;
    if (exchangeVal) growthData.exchange_type = exchangeVal;

    // ── API呼び出し ───────────────────────────────────────
    await API.growth.create(growthData);

    // ── キャッシュ更新（IND は latest_weight_g が変わるため必須）──
    if (state.entityType === 'IND') {
      await Store.syncEntityType('individuals').catch(() => {});
    }
    await Store.syncEntityType('growth').catch(() => {});

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

  // 詳細ルートを解決
  const detailRoute = entityType === 'IND' ? 'ind-detail' : 'lot-detail';

  // 完了バナーをページ先頭に挿入
  const banner = document.createElement('div');
  banner.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(45,122,82,.22),rgba(76,175,120,.08));
      border:1px solid rgba(76,175,120,.45);
      border-radius:var(--radius);
      padding:20px 16px;
      text-align:center;
      margin-bottom:14px">
      <div style="font-size:2.2rem;margin-bottom:6px">✅</div>
      <div style="font-size:1.15rem;font-weight:700;color:var(--green)">
        ${weight}g を記録しました
      </div>
      <div style="font-size:.78rem;color:var(--text3);margin-top:4px">
        GROWTHテーブルに保存完了
      </div>
      <!-- 2ボタン: 次をスキャン / 詳細を見る -->
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-ghost" style="flex:1;padding:12px"
          onclick="routeTo('qr-scan',{mode:'weight'})">
          📷 次をスキャン
        </button>
        <button class="btn btn-primary" style="flex:1;padding:12px"
          onclick="routeTo('${detailRoute}',{id:'${entityId}'})">
          詳細を見る
        </button>
      </div>
    </div>`;

  body.insertBefore(banner.firstElementChild, body.firstChild);
  main.scrollTop = 0;
};

// ─────────────────────────────────────────────────────────────────
// Pages._wmToggleExtra — 追加メモ アコーディオン開閉
// ─────────────────────────────────────────────────────────────────
Pages._wmToggleExtra = function (btn) {
  const body  = document.getElementById('wm-extra');
  const arrow = document.getElementById('wm-extra-arrow');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display  = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
};
