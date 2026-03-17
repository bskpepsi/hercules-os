// ════════════════════════════════════════════════════════════════
// growth.js
// 役割: 成長記録の追加・履歴表示を担う。
//       現場での体重入力を最速で完了させることを最優先とする。
//       LOT/IND の切り替え・写真AI解析・前回比・日齢自動表示を持つ。
// ════════════════════════════════════════════════════════════════

'use strict';

Pages.growthRecord = function (params = {}) {
  const main = document.getElementById('main');

  // 遷移元からパラメータを受け取る
  // params: { targetType:'IND'|'LOT', targetId, displayId }
  let targetType = params.targetType || 'IND';
  let targetId   = params.targetId   || '';
  let displayId  = params.displayId  || '';

  // AI解析結果の一時保存
  let _aiResult  = null;
  let _photoB64  = null;
  let _photoMime = null;

  // 前回記録取得
  function _getPrevRecord() {
    const cached = Store.getGrowthRecords(targetId);
    if (!cached || !cached.length) return null;
    const wts = cached.filter(r => r.weight_g && +r.weight_g > 0);
    return wts.length ? wts[wts.length - 1] : null;
  }

  // 対象の孵化日を取得
  function _getHatchDate() {
    if (targetType === 'IND') return Store.getIndividual(targetId)?.hatch_date || '';
    if (targetType === 'LOT') return Store.getLot(targetId)?.hatch_date || '';
    return '';
  }

  function render() {
    const hatchDate = _getHatchDate();
    const age       = hatchDate ? Store.calcAge(hatchDate) : null;
    const prev      = _getPrevRecord();
    const prevWeight= prev ? +prev.weight_g : null;
    const inds      = Store.filterIndividuals({ status:'alive' });
    const lots      = Store.filterLots({ status:'active' });
    const today     = new Date().toISOString().split('T')[0];

    main.innerHTML = `
      ${UI.header('成長記録入力', { back: true })}
      <div class="page-body has-quick-bar">

        <!-- 対象選択 -->
        <div class="card">
          <div class="card-title">記録対象</div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button class="pill ${targetType==='IND'?'active':''}"
              onclick="Pages._grSetType('IND')">個体(IND)</button>
            <button class="pill ${targetType==='LOT'?'active':''}"
              onclick="Pages._grSetType('LOT')">ロット(LOT)</button>
          </div>
          ${targetType === 'IND' ? `
            <select id="gr-target" class="input" onchange="Pages._grTargetChange(this.value,'IND')">
              <option value="">個体を選択...</option>
              ${inds.map(i =>
                `<option value="${i.ind_id}" ${i.ind_id===targetId?'selected':''}>
                  ${i.display_id} ${i.latest_weight_g?'('+i.latest_weight_g+'g)':''} ${i.sex||''}</option>`
              ).join('')}
            </select>` : `
            <select id="gr-target" class="input" onchange="Pages._grTargetChange(this.value,'LOT')">
              <option value="">ロットを選択...</option>
              ${lots.map(l =>
                `<option value="${l.lot_id}" ${l.lot_id===targetId?'selected':''}>
                  ${l.display_id} ${stageLabel(l.stage)} (${l.count}頭)</option>`
              ).join('')}
            </select>`}
          ${targetId ? `<div style="margin-top:6px;font-size:.78rem;color:var(--text3)">
            対象: <b style="color:var(--gold)">${displayId || targetId}</b>
          </div>` : ''}
        </div>

        <!-- 日齢表示（現在の日齢 / 記録時点との区別） -->
        ${targetId && age ? `<div class="card" style="background:rgba(91,168,232,.07);border-color:rgba(91,168,232,.25)">
          <div style="font-size:.7rem;color:var(--text3);margin-bottom:4px">📅 現在の日齢（記録時点の日齢として保存されます）</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:.85rem">
            <span><b style="color:var(--blue)">${age.days}</b></span>
            <span style="color:var(--text3)">${age.weeks} / ${age.months}</span>
            <span style="color:var(--amber)">${age.stageGuess}</span>
          </div>
        </div>` : ''}

        <!-- 前回比 -->
        ${targetId && prev ? `<div class="card" style="background:var(--surface2)">
          <div style="font-size:.7rem;color:var(--text3);margin-bottom:4px">前回記録 (${prev.record_date})</div>
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:1.1rem;font-weight:700;color:var(--text)">${prev.weight_g}g</span>
            <span style="font-size:.75rem;color:var(--text3)">${UI.ageAtRecord(prev.age_days, prev.record_date)}</span>
            <span id="gr-delta" style="font-size:.9rem;font-weight:600;color:var(--text3)">—</span>
          </div>
        </div>` : ''}

        <!-- 写真・AI解析 -->
        <div class="card">
          <div class="card-title">📷 写真・AI解析</div>
          <div class="photo-upload-area" onclick="document.getElementById('gr-photo').click()" id="photo-area">
            📷 タップして写真を選択<br>
            <span style="font-size:.75rem">（体重計の表示を写すとAIが自動読み取り）</span>
          </div>
          <input type="file" id="gr-photo" accept="image/*" capture="environment"
            style="display:none" onchange="Pages._grPhotoSelected(this)">
          <div id="gr-ai-result" style="margin-top:8px"></div>
        </div>

        <!-- 入力フォーム -->
        <div class="card">
          <div class="card-title">計測値</div>
          <div class="form-section">
            <div>
              <div class="field-label">体重 <em>*</em></div>
              <div class="weight-input-wrap">
                <input type="number" id="gr-weight" class="weight-input"
                  placeholder="000" step="0.1" min="0"
                  oninput="Pages._grUpdateDelta(this.value, ${prevWeight})">
                <span class="weight-unit">g</span>
              </div>
            </div>
            <div class="form-row-2">
              ${UI.field('ステージ', `<select id="gr-stage" class="input">
                ${STAGE_LIST.map(s =>
                  `<option value="${s.code}">${s.label}</option>`
                ).join('')}
              </select>`)}
              ${UI.field('頭幅(mm)', `<input type="number" id="gr-headwidth" class="input" placeholder="例: 32.5" step="0.1">`)}
            </div>
            <div class="form-row-2">
              ${UI.field('容器', `<select id="gr-container" class="input">
                <option value="">変更なし</option>
                <option value="1.8L">1.8L</option>
                <option value="2.7L">2.7L</option>
                <option value="4.8L">4.8L</option>
              </select>`)}
              ${UI.field('交換区分', `<select id="gr-exchange" class="input">
                <option value="">—</option>
                <option value="FULL">全交換</option>
                <option value="PARTIAL">追加のみ</option>
              </select>`)}
            </div>
            <div class="form-row-2">
              ${UI.field('マット', `<select id="gr-mat" class="input">
                <option value="">変更なし</option>
                <option value="T0">T0マット</option>
                <option value="T1">T1マット</option>
                <option value="T2">T2マット</option>
                <option value="T3">T3マット</option>
              </select>`)}
              ${UI.field('記録日', `<input type="date" id="gr-date" class="input" value="${today}">`)}
            </div>
            <div style="margin-top:8px">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px;background:var(--surface2);border-radius:var(--radius-sm)">
                <input type="checkbox" id="gr-malt" style="width:18px;height:18px;cursor:pointer">
                <span style="font-size:.9rem;font-weight:600">🍄 モルト入り</span>
              </label>
            </div>
            ${targetType === 'LOT' ? `
            <div style="margin-top:10px;padding:10px;background:rgba(231,76,60,.06);border:1px solid rgba(231,76,60,.2);border-radius:var(--radius-sm)">
              <div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:8px">🔢 マット交換時の頭数記録（任意）</div>
              <div class="form-row-2">
                ${UI.field('交換前頭数', `<input type="number" id="gr-before-count" class="input" min="0" placeholder="例: 5" oninput="Pages._grCalcAttrition()">`)}
                ${UI.field('交換後頭数', `<input type="number" id="gr-after-count"  class="input" min="0" placeholder="例: 4" oninput="Pages._grCalcAttrition()">`)}
              </div>
              <div id="gr-attrition-display" style="font-size:.8rem;color:var(--text3);margin-top:4px;min-height:20px"></div>
            </div>` : ''}

          </div>
        </div>

        <!-- 詳細入力（折りたたみ） -->
        <div class="collapse-toggle" onclick="this.nextElementSibling.classList.toggle('open');this.nextElementSibling.classList.toggle('closed');this.querySelector('span:last-child').style.transform=this.nextElementSibling.classList.contains('open')?'rotate(180deg)':''">
          <span>📝 詳細入力（体色・メモ・公開設定）</span>
          <span style="font-size:.7rem;transition:transform .2s">▼</span>
        </div>
        <div class="collapse-body closed">
          <div class="card" style="border-radius:0 0 var(--radius) var(--radius)">
            <div class="form-section">
              <div class="form-row-2">
                ${UI.field('体色', `<select id="gr-color" class="input">
                  <option value="">—</option>
                  <option>黄白色</option><option>クリーム色</option>
                  <option>やや黄色</option><option>黄色</option>
                </select>`)}
                ${UI.field('張り', `<select id="gr-firm" class="input">
                  <option value="">—</option>
                  <option>良好</option><option>普通</option>
                  <option>やや弱い</option><option>弱い</option>
                </select>`)}
              </div>
              <div class="field">
                <label class="field-label">観察コメント</label>
                <textarea id="gr-ai-comment" class="input" rows="2"
                  placeholder="AI解析結果またはご自身の観察メモ"></textarea>
              </div>
              ${UI.field('公開区分', `<select id="gr-public" class="input">
                <option value="private">🔒 非公開</option>
                <option value="buyer_only">🔑 購入者限定</option>
                <option value="public">🌐 公開</option>
              </select>`)}
            </div>
          </div>
        </div>

        <!-- 記録履歴 -->
        ${targetId ? `<div class="sec-hdr" style="margin-top:4px">
          <span class="sec-title">記録履歴</span>
          <span class="sec-more" onclick="Pages._grLoadHistory('${targetType}','${targetId}')">更新</span>
        </div>
        <div id="gr-history">${UI.spinner()}</div>` : ''}

      </div>

      <!-- 下部固定アクションバー（保存ボタン常時表示）-->
      <div class="quick-action-bar">
        <button class="btn btn-ghost btn-xl" style="flex:1" onclick="Store.back()">
          ← 戻る
        </button>
        <button class="btn btn-primary btn-xl" style="flex:2"
          onclick="Pages._grSave('${targetType}','${targetId}')">
          ✅ 保存
        </button>
      </div>`;

    // 対象が既に選択されている場合は履歴をロード
    if (targetId) {
      // ステージを対象の現在ステージに自動セット
      const obj = targetType === 'IND'
        ? Store.getIndividual(targetId)
        : Store.getLot(targetId);
      if (obj) {
        const stageEl = document.getElementById('gr-stage');
        if (stageEl) stageEl.value = obj.current_stage || (targetType === 'IND' ? obj.current_stage : obj.stage) || '';
      }
      Pages._grLoadHistory(targetType, targetId);
    }
  }

  // type切替
  Pages._grSetType = function (type) {
    targetType = type;
    targetId   = '';
    displayId  = '';
    render();
  };

  // 対象変更
  Pages._grTargetChange = function (id, type) {
    targetId   = id;
    targetType = type;
    if (id) {
      const obj = type === 'IND' ? Store.getIndividual(id) : Store.getLot(id);
      displayId = obj?.display_id || id;
    }
    render();
  };

  // 体重入力時の前回比リアルタイム更新
  Pages._grUpdateDelta = function (val, prev) {
    const el = document.getElementById('gr-delta');
    if (!el || !prev || !val) return;
    const delta = +val - prev;
    el.textContent = (delta >= 0 ? '+' : '') + delta.toFixed(1) + 'g';
    el.style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';
  };

  // 写真選択
  Pages._grPhotoSelected = async function (input) {
    const file = input.files[0];
    if (!file) return;
    const area = document.getElementById('photo-area');
    const resultEl = document.getElementById('gr-ai-result');
    try {
      // 圧縮
      const { base64, mimeType, dataUrl } = await compressImageToBase64(file);
      _photoB64  = base64;
      _photoMime = mimeType;
      // プレビュー
      area.innerHTML = `<img src="${dataUrl}" class="photo-preview">`;
      // Gemini APIキーがあればAI解析
      const key = Store.getSetting('gemini_key') || CONFIG.GEMINI_KEY;
      if (key) {
        resultEl.innerHTML = `<div style="font-size:.8rem;color:var(--text3)">🤖 AI解析中...</div>`;
        try {
          _aiResult = await API.gemini.analyzeImage(base64, mimeType, 'scale');
          if (_aiResult) {
            // 体重を自動入力
            if (_aiResult.weight) {
              const wEl = document.getElementById('gr-weight');
              if (wEl) {
                wEl.value = _aiResult.weight;
                Pages._grUpdateDelta(_aiResult.weight, prevWeight);
              }
            }
            // 観察コメントを自動入力
            if (_aiResult.larva_analysis?.comment) {
              const cEl = document.getElementById('gr-ai-comment');
              if (cEl) cEl.value = _aiResult.larva_analysis.comment;
            }
            // 体色・張りを自動入力
            if (_aiResult.larva_analysis?.color) {
              const colEl = document.getElementById('gr-color');
              if (colEl) colEl.value = _aiResult.larva_analysis.color;
            }
            if (_aiResult.larva_analysis?.firmness) {
              const firmEl = document.getElementById('gr-firm');
              if (firmEl) firmEl.value = _aiResult.larva_analysis.firmness;
            }
            resultEl.innerHTML = `<div style="background:rgba(76,175,120,.1);border:1px solid rgba(76,175,120,.3);border-radius:6px;padding:8px;font-size:.78rem">
              ✅ AI解析完了: ${_aiResult.weight ? _aiResult.weight+'g' : ''}
              ${_aiResult.larva_analysis?.health ? ' / '+_aiResult.larva_analysis.health : ''}
            </div>`;
          }
        } catch (e) {
          resultEl.innerHTML = `<div style="font-size:.78rem;color:var(--amber)">⚠️ AI解析失敗 (${e.message.slice(0,40)})</div>`;
        }
      }
    } catch (e) {
      UI.toast('画像の読み込みに失敗しました', 'error');
    }
  };

  // 履歴表示
  Pages._grLoadHistory = async function (type, id) {
    const el = document.getElementById('gr-history');
    if (!el) return;
    // キャッシュがあればまず表示
    const cached = Store.getGrowthRecords(id);
    if (cached) el.innerHTML = UI.weightTable(cached);
    try {
      const res = await API.growth.list(type, id);
      Store.setGrowthRecords(id, res.records);
      el.innerHTML = UI.weightTable(res.records);
    } catch (e) {
      if (!cached) el.innerHTML = UI.empty('履歴取得失敗: ' + e.message);
    }
  };

  // 減耗数自動計算
  Pages._grCalcAttrition = function () {
    const before = parseInt(document.getElementById('gr-before-count')?.value || '');
    const after  = parseInt(document.getElementById('gr-after-count')?.value  || '');
    const el = document.getElementById('gr-attrition-display');
    if (!el) return;
    if (!isNaN(before) && !isNaN(after)) {
      const diff = before - after;
      el.textContent = diff > 0
        ? `減耗: ${diff}頭（${before}頭 → ${after}頭）`
        : diff === 0 ? '変化なし' : '⚠️ 交換後が交換前より多い';
      el.style.color = diff > 0 ? 'var(--red)' : diff === 0 ? 'var(--text3)' : 'var(--amber)';
    } else {
      el.textContent = '';
    }
  };

  // 保存
  Pages._grSave = async function (type, id) {
    if (!id) { UI.toast('対象を選択してください', 'error'); return; }
    const weight = document.getElementById('gr-weight')?.value;
    if (!weight) { UI.toast('体重を入力してください', 'error'); return; }
    const stage    = document.getElementById('gr-stage')?.value || '';
    const headW    = document.getElementById('gr-headwidth')?.value || '';
    const container= document.getElementById('gr-container')?.value || '';
    const exchange = document.getElementById('gr-exchange')?.value || '';
    const mat      = document.getElementById('gr-mat')?.value || '';
    const recDate  = (document.getElementById('gr-date')?.value || '').replace(/-/g, '/');
    const color    = document.getElementById('gr-color')?.value || '';
    const firm     = document.getElementById('gr-firm')?.value || '';
    const aiCmt    = document.getElementById('gr-ai-comment')?.value || '';
    const pub      = document.getElementById('gr-public')?.value || 'private';

    const hasMalt     = document.getElementById('gr-malt')?.checked || false;
    const beforeCount = document.getElementById('gr-before-count')?.value;
    const afterCount  = document.getElementById('gr-after-count')?.value;
    const payload = {
      target_type:   type,
      target_id:     id,
      stage,
      weight_g:      weight,
      head_width_mm: headW,
      container,
      mat_type:      mat,
      has_malt:      hasMalt,
      exchange_type: exchange,
      before_count:  beforeCount !== undefined && beforeCount !== '' ? parseInt(beforeCount) : undefined,
      after_count:   afterCount  !== undefined && afterCount  !== '' ? parseInt(afterCount)  : undefined,
      larva_color:   color,
      larva_firmness:firm,
      ai_comment:    aiCmt,
      is_public:     pub,
      record_date:   recDate,
    };

    // 写真アップロード（Drive URLを先に取得）
    if (_photoB64) {
      const ind = type === 'IND' ? Store.getIndividual(id) : null;
      const lot = type === 'LOT' ? Store.getLot(id) : null;
      const lineId = ind?.line_id || lot?.line_id;
      const line   = lineId ? Store.getLine(lineId) : null;
      if (line) {
        try {
          const today = new Date().toISOString().split('T')[0].replace(/-/g,'/');
          const fname = `${displayId || id}_${today}.jpg`;
          const up = await API.drive.uploadPhoto({
            base64: _photoB64, mime_type: _photoMime, filename: fname,
            line_display_id: line.display_id, folder_type: 'GROWTH',
          });
          payload.photo_url = up.url;
        } catch (e) {
          UI.toast('写真アップロード失敗（記録は保存します）', 'info');
        }
      }
    }

    try {
      const res = await apiCall(() => API.growth.create(payload), '記録しました');
      // キャッシュに追加
      Store.addGrowthRecord(id, { ...payload, record_id: res.record_id, age_days: res.age_days });
      // 個体の最新体重をキャッシュ更新
      if (type === 'IND') {
        Store.patchDBItem('individuals', 'ind_id', id, { latest_weight_g: weight, current_stage: stage });
      }
      // ロットのカウント・ステージをキャッシュ更新（after_count入力時）
      if (type === 'LOT') {
        const lotUpdates = {};
        if (stage) lotUpdates.stage = stage;
        if (payload.after_count !== undefined) {
          lotUpdates.count = payload.after_count;
          if (payload.after_count === 0) lotUpdates.status = 'individualized';
        }
        if (Object.keys(lotUpdates).length) {
          Store.patchDBItem('lots', 'lot_id', id, lotUpdates);
        }
      }
      // フォームリセット
      document.getElementById('gr-weight').value = '';
      _photoB64 = null;
      _aiResult = null;
      // 履歴リロード
      const cached = Store.getGrowthRecords(id);
      const histEl = document.getElementById('gr-history');
      if (histEl && cached) histEl.innerHTML = UI.weightTable(cached);

      // 「次のロットへ」ボタンを表示（LOT対象のみ）
      if (type === 'LOT') {
        _showNextLotBar(id);
      }
    } catch (e) {}
  };

  render();
};

// ── 次のロット選択バー ──────────────────────────────────────────
function _showNextLotBar(currentLotId) {
  // 既存バーがあれば除去
  document.getElementById('gr-next-lot-bar')?.remove();

  // 同じラインのアクティブなロット一覧（自分以外）
  const currentLot = Store.getLot(currentLotId);
  if (!currentLot) return;
  const sameLine = Store.filterLots({ line_id: currentLot.line_id, status: 'active' })
    .filter(l => l.lot_id !== currentLotId);

  // アクティブロット全体（ライン問わず）
  const allActive = Store.filterLots({ status: 'active' })
    .filter(l => l.lot_id !== currentLotId);

  const candidates = sameLine.length ? sameLine : allActive.slice(0, 8);
  if (!candidates.length) return;

  const bar = document.createElement('div');
  bar.id = 'gr-next-lot-bar';
  bar.className = 'next-lot-bar';

  const labelEl = document.createElement('div');
  labelEl.style.cssText = 'font-size:.72rem;color:var(--text3);margin-bottom:6px;font-weight:700';
  labelEl.textContent = '📦 次のロットへ（同ライン）';
  bar.appendChild(labelEl);

  const scrollEl = document.createElement('div');
  scrollEl.className = 'next-lot-scroll';

  candidates.slice(0, 6).forEach(function(l) {
    const ln   = Store.getLine(l.line_id);
    const code = ln ? (ln.line_code || ln.display_id) : l.display_id;
    const btn  = document.createElement('button');
    btn.className = 'next-lot-btn';
    btn.innerHTML =
      '<span style="color:var(--gold);font-weight:700">' + code + '</span>' +
      '<span style="color:var(--text3);margin-left:4px">' + l.count + '頭</span>';
    btn.onclick = (function(lotId, lotDisplayId) {
      return function() {
        document.getElementById('gr-next-lot-bar')?.remove();
        routeTo('growth-rec', { targetType:'LOT', targetId:lotId, displayId:lotDisplayId });
      };
    })(l.lot_id, l.display_id);
    scrollEl.appendChild(btn);
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'next-lot-btn';
  closeBtn.style.color = 'var(--text3)';
  closeBtn.textContent = '✕ 閉じる';
  closeBtn.onclick = () => document.getElementById('gr-next-lot-bar')?.remove();
  scrollEl.appendChild(closeBtn);

  bar.appendChild(scrollEl);
  document.body.appendChild(bar);
}

// ── 成長記録編集モーダル ─────────────────────────────────────────
Pages._grEditRecord = async function (recordId) {
  // 全ターゲットのgrowthMapからrecordIdで検索
  let rec = null;
  const gm = Store.getDB('growthMap') || {};
  for (const recs of Object.values(gm)) {
    const found = (recs || []).find(r => r.record_id === recordId);
    if (found) { rec = found; break; }
  }

  const initDate    = rec ? String(rec.record_date || '').replace(/\//g, '-') : '';
  const initWeight  = rec ? (rec.weight_g  || '') : '';
  const initStage   = rec ? (rec.stage     || '') : '';
  const initCont    = rec ? (rec.container || '') : '';
  const initMat     = rec ? (rec.mat_type  || '') : '';
  const initExch    = rec ? (rec.exchange_type || '') : '';
  const initNote    = rec ? (rec.note_private  || '') : '';

  const STAGE_OPTS = ['T0','T1','T2','T3','PREPUPA','PUPA','ADULT']
    .map(s => `<option value="${s}" ${initStage===s?'selected':''}>${s}</option>`).join('');

  UI.modal(`
    <div class="modal-title">成長記録を編集</div>
    <div class="form-section" style="max-height:60vh;overflow-y:auto">
      ${UI.field('記録日', `<input type="date" id="gre-date" class="input" value="${initDate}">`)}
      ${UI.field('体重(g)', `<input type="number" id="gre-weight" class="input" step="0.1" value="${initWeight}" placeholder="例: 45.2">`)}
      <div class="form-row-2">
        ${UI.field('ステージ', `<select id="gre-stage" class="input">${STAGE_OPTS}</select>`)}
        ${UI.field('容器', `<select id="gre-cont" class="input">
          <option value="">—</option>
          <option value="1.8L" ${initCont==='1.8L'?'selected':''}>1.8L</option>
          <option value="2.7L" ${initCont==='2.7L'?'selected':''}>2.7L</option>
          <option value="4.8L" ${initCont==='4.8L'?'selected':''}>4.8L</option>
        </select>`)}
      </div>
      <div class="form-row-2">
        ${UI.field('マット', `<select id="gre-mat" class="input">
          <option value="">—</option>
          <option value="T0" ${initMat==='T0'?'selected':''}>T0</option>
          <option value="T1" ${initMat==='T1'?'selected':''}>T1</option>
          <option value="T2" ${initMat==='T2'?'selected':''}>T2</option>
          <option value="T3" ${initMat==='T3'?'selected':''}>T3</option>
        </select>`)}
        ${UI.field('交換区分', `<select id="gre-exch" class="input">
          <option value="">—</option>
          <option value="FULL"    ${initExch==='FULL'?'selected':''}>全交換</option>
          <option value="PARTIAL" ${initExch==='PARTIAL'?'selected':''}>追加のみ</option>
        </select>`)}
      </div>
      ${UI.field('メモ', `<input type="text" id="gre-note" class="input" value="${initNote}" placeholder="任意">`)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._grSaveEdit('${recordId}')">更新</button>
    </div>
  `);
};

Pages._grSaveEdit = async function (recordId) {
  const date   = (document.getElementById('gre-date')?.value   || '').replace(/-/g, '/');
  const weight = document.getElementById('gre-weight')?.value   || '';
  const stage  = document.getElementById('gre-stage')?.value    || '';
  const cont   = document.getElementById('gre-cont')?.value     || '';
  const mat    = document.getElementById('gre-mat')?.value      || '';
  const exch   = document.getElementById('gre-exch')?.value     || '';
  const note   = document.getElementById('gre-note')?.value     || '';

  if (!weight) { UI.toast('体重を入力してください', 'error'); return; }

  const payload = {
    record_id:     recordId,
    record_date:   date,
    weight_g:      weight,
    stage,
    container:     cont,
    mat_type:      mat,
    exchange_type: exch,
    note_private:  note,
  };

  try {
    UI.loading(true);
    UI.closeModal();
    await apiCall(() => API.growth.update(payload), '成長記録を更新しました');
    // キャッシュを更新
    const gm = Store.getDB('growthMap') || {};
    for (const [tid, recs] of Object.entries(gm)) {
      const idx = (recs || []).findIndex(r => r.record_id === recordId);
      if (idx >= 0) {
        Object.assign(recs[idx], payload);
        Store.setGrowthRecords(tid, recs);
        // 履歴表示を再描画
        const histEl = document.getElementById('gr-history');
        if (histEl) histEl.innerHTML = UI.weightTable(recs);
        break;
      }
    }
  } catch (e) {
    UI.toast('更新失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['growth-rec'] = () => Pages.growthRecord(Store.getParams());
