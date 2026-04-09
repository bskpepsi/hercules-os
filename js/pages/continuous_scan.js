// ────────────────────────────────────────────────────────────────
// FILE: js/pages/continuous_scan.js
// ════════════════════════════════════════════════════════════════
// continuous_scan.js — 継続読取りモード（Gemini Vision OCR）
// build: 20260413bc
//
// 【フロー】
//   ① QRスキャンで対象を特定（UNIT / IND）
//   ② ラベル全体を撮影
//   ③ Gemini Vision API で手書きデータをOCR
//   ④ 確認・修正画面（編集可能）
//   ⑤ growth_records に保存
//
// 【OCRルール（Geminiプロンプト）】
//   - M行: □T0 ■T1 ■T2 □T3 → 最後(最大)のチェック = mat_type
//   - St行: ■L1L2 ■L3 □前蛹 □蛹 □成虫 → 最後のチェック = stage
//   - テーブル手書き: 日付・体重①②・交換種別
// ════════════════════════════════════════════════════════════════

Pages.continuousScan = function(params) {
  params = params || {};
  const main = document.getElementById('main');

  // ── 状態管理 ──────────────────────────────────────────────────
  let _state = {
    step: 'scan',        // 'scan' | 'capture' | 'confirm' | 'saving'
    targetType: null,    // 'UNIT' | 'IND'
    targetId: null,      // unit_id or ind_id
    displayId: null,
    entity: null,        // Store から取得したエンティティ
    members: [],         // UNIT の場合のメンバー配列
    capturedImage: null, // base64 撮影画像
    ocrResult: null,     // Geminiの解析結果
  };

  // URLパラメータから直接起動（QRスキャン経由）
  if (params.targetType && params.targetId) {
    _state.targetType = params.targetType;
    _state.targetId   = params.targetId;
    _state.displayId  = params.displayId || params.targetId;
    _state.entity     = _resolveEntity(_state.targetType, _state.targetId);
    if (_state.entity) {
      _state.members = _parseMembers(_state.entity);
      _state.step = 'capture';
    }
  }

  // ── エンティティ解決 ───────────────────────────────────────────
  function _resolveEntity(type, id) {
    if (type === 'UNIT') {
      return Store.getUnit && Store.getUnit(id)
          || Store.getUnitByDisplayId && Store.getUnitByDisplayId(id)
          || (Store.getDB('breeding_units')||[]).find(u => u.unit_id === id || u.display_id === id)
          || null;
    }
    if (type === 'IND') {
      return Store.getIndividual && Store.getIndividual(id)
          || (Store.getDB('individuals')||[]).find(i => i.ind_id === id || i.display_id === id)
          || null;
    }
    return null;
  }

  function _parseMembers(entity) {
    if (!entity || !entity.members) return [];
    try {
      const raw = entity.members;
      return Array.isArray(raw) ? raw : JSON.parse(raw);
    } catch(_) { return []; }
  }

  // ── メインレンダリング ─────────────────────────────────────────
  function render() {
    if (_state.step === 'scan')    return renderScan();
    if (_state.step === 'capture') return renderCapture();
    if (_state.step === 'confirm') return renderConfirm();
    if (_state.step === 'saving')  return renderSaving();
  }

  // ──────────────────────────────────────────────────────────────
  // ステップ1: QRスキャンで対象特定
  // ──────────────────────────────────────────────────────────────
  function renderScan() {
    main.innerHTML =
      UI.header('📷 継続読取り', { back: true }) +
      `<div class="page-body">
        <div class="card" style="padding:16px;text-align:center">
          <div style="font-size:2rem;margin-bottom:8px">📷</div>
          <div style="font-size:.9rem;font-weight:700;margin-bottom:6px">
            ラベルのQRコードをスキャン
          </div>
          <div style="font-size:.76rem;color:var(--text3);margin-bottom:16px">
            ユニットラベルまたは個別飼育ラベルのQRを読み取ってください
          </div>
          <button class="btn btn-primary btn-full"
            onclick="Pages._cScanStartQR()">
            📷 QRスキャン開始
          </button>
        </div>

        <div class="card" style="padding:14px;margin-top:8px">
          <div style="font-size:.75rem;color:var(--text3);margin-bottom:8px;font-weight:700">
            または直接選択
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" style="flex:1"
              onclick="Pages._cScanOpenPicker('UNIT')">
              📦 ユニットを選ぶ
            </button>
            <button class="btn btn-ghost" style="flex:1"
              onclick="Pages._cScanOpenPicker('IND')">
              🐛 個体を選ぶ
            </button>
          </div>
        </div>
      </div>`;
  }

  // ──────────────────────────────────────────────────────────────
  // ステップ2: ラベル撮影
  // ──────────────────────────────────────────────────────────────
  function renderCapture() {
    const e = _state.entity;
    const ph = e ? (e.stage_phase || e.current_stage || '') : '';
    const dispId = _state.displayId || _state.targetId || '';

    // 前回の成長記録から初期値取得
    const prevRecs = Store.getGrowthRecords && Store.getGrowthRecords(_state.targetId) || [];
    const lastRec  = prevRecs.length
      ? prevRecs.slice().sort((a,b) => String(b.record_date).localeCompare(String(a.record_date)))[0]
      : null;

    main.innerHTML =
      UI.header('📷 継続読取り', { back: true, backFn: "Pages._cScanBack()" }) +
      `<div class="page-body">

        <!-- 対象情報 -->
        <div class="card" style="padding:12px 14px;margin-bottom:8px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:.88rem;font-weight:700;color:var(--gold)">${dispId}</div>
              <div style="font-size:.72rem;color:var(--text3)">
                ${_state.targetType === 'UNIT' ? 'ユニット' : '個別飼育'} / ステージ: ${ph||'—'}
              </div>
              ${lastRec ? `<div style="font-size:.68rem;color:var(--text3);margin-top:2px">
                前回記録: ${lastRec.record_date} / ${lastRec.weight_g||'—'}g / ${lastRec.mat_type||'—'}
              </div>` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Pages._cScanBack()">変更</button>
          </div>
        </div>

        <!-- 撮影エリア -->
        <div class="card" style="padding:16px;text-align:center">
          <div style="font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:12px">
            ラベル全体を撮影してください
          </div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:16px;line-height:1.6">
            💡 ラベルが画面全体に収まるように撮影<br>
            チェックボックスや手書き数字が鮮明に見えるようにしてください
          </div>

          <!-- カメラ/ファイル選択 -->
          <input type="file" id="cs-file-input" accept="image/*" capture="environment"
            style="display:none" onchange="Pages._cScanOnImageSelected(this)">

          <button class="btn btn-primary btn-full" style="margin-bottom:8px;padding:16px;font-size:.95rem"
            onclick="document.getElementById('cs-file-input').click()">
            📷 カメラで撮影
          </button>
          <button class="btn btn-ghost btn-full" style="font-size:.85rem"
            onclick="Pages._cScanOpenGallery()">
            🖼️ ギャラリーから選択
          </button>
        </div>

        <!-- プレビュー（撮影後に表示） -->
        <div id="cs-preview-area"></div>

      </div>`;
  }

  // ──────────────────────────────────────────────────────────────
  // ステップ3: 確認・修正画面
  // ──────────────────────────────────────────────────────────────
  function renderConfirm() {
    const ocr = _state.ocrResult || {};
    const isUnit = _state.targetType === 'UNIT';
    const members = _state.members;

    // OCR結果からフォームの初期値を構築
    const today = new Date().toISOString().split('T')[0];
    const recDate = (ocr.record_date || today).replace(/\//g,'-');
    const mat     = ocr.mat_type    || '';
    const stage   = ocr.stage       || '';
    const exch    = ocr.exchange_type || 'FULL';

    // UNIT: 各頭の体重
    const w1 = ocr.weight_1 || '';
    const w2 = ocr.weight_2 || '';
    // IND: 体重
    const wInd = ocr.weight || ocr.weight_1 || '';

    const matOptions = ['T0','T1','T2','T3','MD'].map(m =>
      `<option value="${m}" ${mat===m?'selected':''}>${m}</option>`).join('');
    const stageOptions = [
      {v:'L1L2',l:'L1L2'},{v:'L3',l:'L3'},{v:'PREPUPA',l:'前蛹'},
      {v:'PUPA',l:'蛹'},{v:'ADULT_PRE',l:'成虫（未後食）'},{v:'ADULT',l:'成虫（活動中）'}
    ].map(s => `<option value="${s.v}" ${stage===s.v?'selected':''}>${s.l}</option>`).join('');
    const exchOptions = [
      {v:'FULL',l:'全交換'},{v:'PARTIAL',l:'追加のみ'},{v:'NONE',l:'なし'}
    ].map(x => `<option value="${x.v}" ${exch===x.v?'selected':''}>${x.l}</option>`).join('');

    main.innerHTML =
      UI.header('📋 読取り確認・修正', { back: true, backFn: "Pages._cScanBackToCapture()" }) +
      `<div class="page-body">

        <!-- OCR信頼度バナー -->
        ${ocr._confidence === 'low' ? `
        <div style="background:rgba(224,144,64,.1);border:1px solid rgba(224,144,64,.3);
          border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:.76rem;color:var(--amber)">
          ⚠️ 一部の値が読み取れなかった可能性があります。内容を確認してください。
        </div>` : `
        <div style="background:rgba(76,175,120,.08);border:1px solid rgba(76,175,120,.25);
          border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:.76rem;color:var(--green)">
          ✅ OCR読み取り完了。内容を確認・修正してから保存してください。
        </div>`}

        <!-- プレビュー画像（小） -->
        ${_state.capturedImage ? `
        <div style="text-align:center;margin-bottom:8px">
          <img src="${_state.capturedImage}" style="max-height:120px;border-radius:6px;border:1px solid var(--border)">
        </div>` : ''}

        <!-- 入力フォーム -->
        <div class="card" style="padding:14px">
          <div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:12px">
            📝 記録内容の確認・修正
          </div>

          <!-- 記録日 -->
          <div style="margin-bottom:12px">
            <label style="font-size:.72rem;color:var(--text3);font-weight:700">記録日</label>
            <input type="date" id="cs-date" class="input" value="${recDate}" style="margin-top:4px">
          </div>

          <!-- マット種別 -->
          <div style="margin-bottom:12px">
            <label style="font-size:.72rem;color:var(--text3);font-weight:700">🌿 マット種別</label>
            <select id="cs-mat" class="input" style="margin-top:4px">
              <option value="">選択...</option>
              ${matOptions}
            </select>
          </div>

          <!-- ステージ -->
          <div style="margin-bottom:12px">
            <label style="font-size:.72rem;color:var(--text3);font-weight:700">📊 ステージ</label>
            <select id="cs-stage" class="input" style="margin-top:4px">
              <option value="">選択...</option>
              ${stageOptions}
            </select>
          </div>

          <!-- 交換種別 -->
          <div style="margin-bottom:12px">
            <label style="font-size:.72rem;color:var(--text3);font-weight:700">🔄 交換種別</label>
            <select id="cs-exch" class="input" style="margin-top:4px">
              ${exchOptions}
            </select>
          </div>

          <!-- 体重（UNITは2頭分、INDは1頭分） -->
          ${isUnit ? `
          <div style="font-size:.72rem;color:var(--text3);font-weight:700;margin-bottom:6px">
            ⚖️ 体重
          </div>
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <div style="flex:1">
              <label style="font-size:.68rem;color:var(--text3)">
                ${members[0] ? (members[0].sex||'?')+'&nbsp;' : ''}①頭目
              </label>
              <div style="display:flex;align-items:center;gap:4px;margin-top:4px">
                <input type="number" id="cs-w1" class="input" value="${w1}"
                  placeholder="—" inputmode="numeric" style="text-align:center">
                <span style="font-size:.75rem;color:var(--text3)">g</span>
              </div>
            </div>
            <div style="flex:1">
              <label style="font-size:.68rem;color:var(--text3)">
                ${members[1] ? (members[1].sex||'?')+'&nbsp;' : ''}②頭目
              </label>
              <div style="display:flex;align-items:center;gap:4px;margin-top:4px">
                <input type="number" id="cs-w2" class="input" value="${w2}"
                  placeholder="—" inputmode="numeric" style="text-align:center">
                <span style="font-size:.75rem;color:var(--text3)">g</span>
              </div>
            </div>
          </div>` : `
          <div style="margin-bottom:12px">
            <label style="font-size:.72rem;color:var(--text3);font-weight:700">⚖️ 体重</label>
            <div style="display:flex;align-items:center;gap:4px;margin-top:4px">
              <input type="number" id="cs-wind" class="input" value="${wInd}"
                placeholder="—" inputmode="numeric" style="max-width:100px;text-align:center">
              <span style="font-size:.75rem;color:var(--text3)">g</span>
            </div>
          </div>`}

          <!-- メモ -->
          <div>
            <label style="font-size:.72rem;color:var(--text3);font-weight:700">メモ（任意）</label>
            <input type="text" id="cs-note" class="input" value="${ocr.note||''}"
              placeholder="気になることがあれば..." style="margin-top:4px">
          </div>
        </div>

        <!-- OCR生データ（折りたたみ） -->
        <details style="margin-top:8px">
          <summary style="font-size:.72rem;color:var(--text3);cursor:pointer;padding:8px">
            🔍 OCR生データを確認
          </summary>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;
            font-family:monospace;font-size:.68rem;color:var(--text3);white-space:pre-wrap">
${JSON.stringify(ocr, null, 2)}
          </div>
        </details>

      </div>

      <!-- 固定フッター -->
      <div class="quick-action-bar">
        <button class="btn btn-ghost" style="flex:1;padding:14px 0"
          onclick="Pages._cScanBackToCapture()">← 撮り直す</button>
        <button class="btn btn-gold" style="flex:2;padding:14px 0;font-weight:700;font-size:.95rem"
          onclick="Pages._cScanSave()">
          💾 記録を保存
        </button>
      </div>`;
  }

  // ── saving ─────────────────────────────────────────────────────
  function renderSaving() {
    main.innerHTML =
      UI.header('💾 保存中...', {}) +
      `<div class="page-body" style="text-align:center;padding-top:40px">
        <div style="font-size:2rem;margin-bottom:12px">💾</div>
        <div style="font-size:.9rem;color:var(--text2)">成長記録を保存しています...</div>
      </div>`;
  }

  // ──────────────────────────────────────────────────────────────
  // イベントハンドラ
  // ──────────────────────────────────────────────────────────────

  // QRスキャン開始
  Pages._cScanStartQR = function() {
    routeTo('qr-scan', { mode: 'continuous_record', _returnTo: 'continuous-scan' });
  };

  // 直接選択（ピッカー）
  Pages._cScanOpenPicker = function(type) {
    const items = type === 'UNIT'
      ? (Store.getDB('breeding_units')||[]).filter(u => u.status === 'active')
      : (Store.getDB('individuals')||[]).filter(i => i.status === 'alive' || i.status === 'larva');

    if (items.length === 0) {
      UI.toast(`対象の${type === 'UNIT' ? 'ユニット' : '個体'}がありません`, 'error');
      return;
    }

    const opts = items.slice(0, 100).map(it => {
      const id   = type === 'UNIT' ? it.unit_id   : it.ind_id;
      const disp = it.display_id || id;
      const info = type === 'UNIT'
        ? `${it.stage_phase||'—'} / ${it.head_count||2}頭`
        : `${it.sex||'?'} ${it.current_stage||'—'} ${it.size_category||''}`;
      return `<option value="${id}">${disp} (${info})</option>`;
    }).join('');

    UI.modal(`
      <div class="modal-title">${type === 'UNIT' ? '📦 ユニット' : '🐛 個体'}を選択</div>
      <select id="cs-picker-sel" class="input" style="margin:12px 0">
        <option value="">選択してください...</option>
        ${opts}
      </select>
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2"
          onclick="Pages._cScanPickerConfirm('${type}')">選択</button>
      </div>
    `);
  };

  Pages._cScanPickerConfirm = function(type) {
    const sel = document.getElementById('cs-picker-sel');
    const id  = sel ? sel.value : '';
    if (!id) { UI.toast('選択してください', 'error'); return; }
    UI.closeModal();
    const entity = _resolveEntity(type, id);
    if (!entity) { UI.toast('対象が見つかりません', 'error'); return; }
    _state.targetType = type;
    _state.targetId   = id;
    _state.displayId  = entity.display_id || id;
    _state.entity     = entity;
    _state.members    = _parseMembers(entity);
    _state.step       = 'capture';
    render();
  };

  // ギャラリー選択（captureなし）
  Pages._cScanOpenGallery = function() {
    const inp = document.getElementById('cs-file-input');
    if (inp) { inp.removeAttribute('capture'); inp.click(); }
  };

  // 画像選択後
  Pages._cScanOnImageSelected = function(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
      const base64 = e.target.result; // data:image/...;base64,...
      _state.capturedImage = base64;

      // プレビュー表示
      const previewArea = document.getElementById('cs-preview-area');
      if (previewArea) {
        previewArea.innerHTML = `
          <div class="card" style="padding:12px;text-align:center;margin-top:8px">
            <img src="${base64}" style="max-height:200px;border-radius:6px;border:1px solid var(--border);margin-bottom:8px">
            <button class="btn btn-primary btn-full" style="padding:14px;font-size:.95rem"
              onclick="Pages._cScanRunOCR()">
              🔍 Gemini で読み取る
            </button>
          </div>`;
      }
    };
    reader.readAsDataURL(file);
  };

  // Gemini OCR実行
  Pages._cScanRunOCR = async function() {
    const geminiKey = CONFIG.GEMINI_KEY || Store.getSetting('gemini_key') || '';
    if (!geminiKey) {
      UI.toast('Gemini APIキーが設定されていません。設定画面で入力してください。', 'error', 4000);
      return;
    }

    const previewArea = document.getElementById('cs-preview-area');
    if (previewArea) {
      previewArea.innerHTML = `
        <div class="card" style="padding:16px;text-align:center;margin-top:8px">
          <div style="font-size:.85rem;color:var(--text2)">🔍 Gemini で読み取り中...</div>
          <div style="font-size:.72rem;color:var(--text3);margin-top:6px">
            チェックボックスと手書き数字を解析しています
          </div>
        </div>`;
    }

    try {
      const result = await _callGeminiOCR(geminiKey, _state.capturedImage, _state.targetType);
      _state.ocrResult = result;
      _state.step = 'confirm';
      render();
    } catch(err) {
      console.error('[ContinuousScan] Gemini error:', err);
      // エラーでも空のOCR結果で確認画面へ（手動入力）
      _state.ocrResult = { _confidence: 'low', _error: err.message };
      _state.step = 'confirm';
      render();
      UI.toast('OCR読み取りに失敗しました。手動で入力してください。', 'error', 3000);
    }
  };

  // ── Gemini Vision API 呼び出し ─────────────────────────────────
  async function _callGeminiOCR(apiKey, imageDataUrl, targetType) {
    const isUnit = targetType === 'UNIT';

    // base64部分のみ抽出
    const base64Data  = imageDataUrl.split(',')[1];
    const mimeType    = imageDataUrl.split(';')[0].split(':')[1] || 'image/jpeg';

    const prompt = `あなたはクワガタ飼育ラベルのOCR専門AIです。
このラベル画像から手書きデータを読み取り、必ずJSON形式のみで返答してください。

【ラベルの構造】
- 上部: QRコード・ユニットID・区分・マット種別チェックボックス・ステージチェックボックス
- 下部: 記録テーブル（日付 / 体重① / 体重② / 交換種別）

【チェックボックスの読み取りルール】
- M（マット）行: T0, T1, T2, T3 のチェックボックスがある。■（黒塗り）=チェック済み、□=未チェック
  → チェックが入っている項目の中で最後（右端）のものが現在のマット種別
  → 例: □T0 ■T1 ■T2 □T3 → mat_type = "T2"
- St（ステージ）行: L1L2, L3, 前蛹, 蛹, 成虫 のチェックボックスがある
  → 同様にチェックが入っている最後のもの
  → 例: ■L1L2 ■L3 □前蛹 □蛹 □成虫 → stage = "L3"
  → ステージ値は必ず: L1L2 / L3 / PREPUPA / PUPA / ADULT_PRE / ADULT のいずれか

【テーブルの読み取り】
- 最新行（下から2番目の空でない行、または最下段の書き込み行）の値を読む
- 日付: YYYY/MM/DD または MM/DD 形式
- 体重①: 1頭目の体重(g) 数値のみ
${isUnit ? '- 体重②: 2頭目の体重(g) 数値のみ' : ''}
- 交換種別: 「全」にチェック→ FULL、「追」にチェック→ PARTIAL、なし→ NONE

【出力フォーマット（JSONのみ、他のテキスト不要）】
{
  "record_date": "YYYY-MM-DD または null",
  "mat_type": "T0|T1|T2|T3|MD または null",
  "stage": "L1L2|L3|PREPUPA|PUPA|ADULT_PRE|ADULT または null",
  "exchange_type": "FULL|PARTIAL|NONE",
  "weight_1": 数値または null,
  ${isUnit ? '"weight_2": 数値または null,' : ''}
  "note": "読み取れなかった部分があれば記述",
  "_confidence": "high|medium|low"
}`;

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API エラー (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[ContinuousScan] Gemini raw:', rawText);

    // JSON抽出（```json ... ``` フェンス除去）
    const clean = rawText.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
    try {
      return JSON.parse(clean);
    } catch(_) {
      // JSONが壊れている場合はpartialパース試行
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Gemini の返答をJSONとして解析できませんでした: ' + clean.slice(0, 100));
    }
  }

  // ── 保存処理 ───────────────────────────────────────────────────
  Pages._cScanSave = async function() {
    const recDate = document.getElementById('cs-date')?.value?.replace(/-/g,'/') || '';
    const mat     = document.getElementById('cs-mat')?.value   || '';
    const stage   = document.getElementById('cs-stage')?.value || '';
    const exch    = document.getElementById('cs-exch')?.value  || 'FULL';
    const note    = document.getElementById('cs-note')?.value  || '';
    const isUnit  = _state.targetType === 'UNIT';

    if (!stage) { UI.toast('ステージを選択してください', 'error'); return; }

    _state.step = 'saving';
    render();

    try {
      const basePayload = {
        target_type:   _state.targetType,
        target_id:     _state.targetId,
        record_date:   recDate || new Date().toISOString().split('T')[0].replace(/-/g,'/'),
        stage:         stage,
        mat_type:      mat,
        exchange_type: exch,
        event_type:    'WEIGHT_ONLY',
        note_private:  note,
        has_malt:      false,
      };

      if (isUnit) {
        // ユニット: unit_slot_no 1, 2 で2件保存
        const w1 = parseFloat(document.getElementById('cs-w1')?.value || '') || null;
        const w2 = parseFloat(document.getElementById('cs-w2')?.value || '') || null;
        const members = _state.members;

        const records = [];
        if (w1 !== null || members[0]) {
          records.push({ ...basePayload, unit_slot_no: 1, weight_g: w1 || '' });
        }
        if (w2 !== null || members[1]) {
          records.push({ ...basePayload, unit_slot_no: 2, weight_g: w2 || '' });
        }

        for (const rec of records) {
          await API.growth.create(rec);
        }

        // ローカルStore更新
        records.forEach(rec => {
          if (typeof Store.addDBItem === 'function') {
            Store.addDBItem('growth_records', { ...rec, record_id: 'GR-local-' + Date.now() });
          }
        });

      } else {
        // 個別飼育: 1件保存
        const wInd = parseFloat(document.getElementById('cs-wind')?.value || '') || null;
        const rec  = { ...basePayload, weight_g: wInd || '' };
        await API.growth.create(rec);
        if (typeof Store.addDBItem === 'function') {
          Store.addDBItem('growth_records', { ...rec, record_id: 'GR-local-' + Date.now() });
        }
      }

      UI.toast('✅ 成長記録を保存しました', 'success', 3000);

      // 対象の詳細画面へ
      if (_state.targetType === 'UNIT') {
        routeTo('unit-detail', { unitDisplayId: _state.displayId });
      } else {
        routeTo('ind-detail', { indId: _state.targetId });
      }

    } catch(err) {
      console.error('[ContinuousScan] save error:', err);
      _state.step = 'confirm';
      render();
      UI.toast('保存失敗: ' + (err.message || '通信エラー'), 'error', 5000);
    }
  };

  // ── ナビゲーション ─────────────────────────────────────────────
  Pages._cScanBack = function() {
    _state.step = 'scan';
    _state.targetType = null;
    _state.targetId   = null;
    _state.entity     = null;
    render();
  };

  Pages._cScanBackToCapture = function() {
    _state.step = 'capture';
    render();
  };

  // ── 初回レンダリング ───────────────────────────────────────────
  render();
};

// ── ページ登録 ────────────────────────────────────────────────────
window.PAGES = window.PAGES || {};
window.PAGES['continuous-scan'] = function() {
  Pages.continuousScan(Store.getParams());
};
