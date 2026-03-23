// ════════════════════════════════════════════════════════════════
// growth.js v3 — 成長記録入力（ボタン式新UI）
// ・体重: ±1/±10 操作ボタン + 直接入力
// ・ステージ/容器/マット/交換区分: ボタン式ピル選択
// ・詳細画面から来た場合は対象選択UIなし（isDirectMode）
// ・写真・AI解析ブロックはそのまま維持
// ・次のロットへ連続入力バー付き
// ════════════════════════════════════════════════════════════════
'use strict';

// ── ボタン式選択ヘルパー ────────────────────────────────────────
// gId: hidden input id, items: [{val, label}], active: 現在値, fn: onChange
function _grBtnGroup(gId, items, active, fn) {
  return '<div style="display:flex;flex-wrap:wrap;gap:6px">'
    + items.map(it => {
        const on = it.val === active;
        return `<button type="button"
          style="padding:7px 12px;border-radius:20px;font-size:.8rem;font-weight:700;cursor:pointer;
            border:1px solid ${on ? 'var(--gold)' : 'var(--border)'};
            background:${on ? 'rgba(200,168,75,.18)' : 'var(--bg3)'};
            color:${on ? 'var(--gold)' : 'var(--text2)'}"
          onclick="${fn}('${it.val}')">${it.label}</button>`;
      }).join('')
    + `<input type="hidden" id="${gId}" value="${active || ''}">` + '</div>';
}

Pages.growthRecord = function (params = {}) {
  const main = document.getElementById('main');

  let targetType = params.targetType || 'IND';
  let targetId   = params.targetId   || '';
  let displayId  = params.displayId  || '';
  const _preset  = params._preset    || '';  // 't1' / 't2' プリセット（QRモードから）

  let _aiResult  = null;
  let _photoB64  = null;
  let _photoMime = null;

  // ── ボタン式フィールドの現在値（render間で保持） ─────────────
  let _selStage    = '';
  let _selContainer= '';
  let _selMat      = '';
  let _selExchange = '';

  function _getPrevRecord() {
    const cached = Store.getGrowthRecords(targetId);
    if (!cached || !cached.length) return null;
    const wts = cached.filter(r => r.weight_g && +r.weight_g > 0);
    return wts.length ? wts[wts.length - 1] : null;
  }

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
    const today     = new Date().toISOString().split('T')[0];
    const isDirectMode = !!targetId;

    // プリセット（QR T1/T2モードからの場合）
    if (_preset && !_selMat && !_selExchange) {
      if (_preset === 't1') {
        _selMat = 'T1'; _selExchange = 'FULL'; _selStage = 'L1L2';
      } else if (_preset === 't2') {
        _selMat = 'T2'; _selExchange = 'FULL'; _selStage = 'L3';
      }
    }
    // 対象の現在ステージを初期値として取得
    if (!_selStage && targetId) {
      const obj = targetType === 'IND' ? Store.getIndividual(targetId) : Store.getLot(targetId);
      _selStage = (obj?.current_stage || obj?.stage || '').replace(/^(L1L2|L3)$/, s => s);
    }

    const STAGES = [
      { val:'L1L2', label:'L1L2' }, { val:'L3', label:'L3' },
      { val:'PREPUPA', label:'前蛹' }, { val:'PUPA', label:'蛹' },
      { val:'ADULT_PRE', label:'未後食' }, { val:'ADULT', label:'活動開始' },
    ];
    const CONTAINERS = [
      { val:'', label:'変更なし' }, { val:'1.8L', label:'1.8L' },
      { val:'2.7L', label:'2.7L' }, { val:'4.8L', label:'4.8L' },
    ];
    const MATS = [
      { val:'', label:'変更なし' }, { val:'T0', label:'T0' },
      { val:'T1', label:'T1' }, { val:'T2', label:'T2' },
      { val:'T3', label:'T3' },
    ];
    const EXCHANGES = [
      { val:'', label:'なし' }, { val:'FULL', label:'全交換' },
      { val:'PARTIAL', label:'追加のみ' },
    ];

    main.innerHTML = `
      ${UI.header('成長記録', {
        back: true,
        backFn: targetId
          ? (targetType === 'LOT'
              ? "routeTo('lot-detail',{lotId:'" + targetId + "'})"
              : "routeTo('ind-detail',{indId:'" + targetId + "'})") 
          : "Store.back()"
      })}
      <div class="page-body has-quick-bar">

        ${!isDirectMode ? `
        <!-- 対象選択（直行モード以外のみ） -->
        <div class="card">
          <div class="card-title">記録対象</div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button class="pill ${targetType==='IND'?'active':''}"
              onclick="Pages._grSetType('IND')">個体</button>
            <button class="pill ${targetType==='LOT'?'active':''}"
              onclick="Pages._grSetType('LOT')">ロット</button>
          </div>
          ${targetType === 'IND' ? `
            <select id="gr-target" class="input" onchange="Pages._grTargetChange(this.value,'IND')">
              <option value="">個体を選択...</option>
              ${(Store.filterIndividuals({status:'alive'})).map(i =>
                `<option value="${i.ind_id}" ${i.ind_id===targetId?'selected':''}>
                  ${i.display_id} ${i.latest_weight_g?'('+i.latest_weight_g+'g)':''} ${i.sex||''}</option>`
              ).join('')}
            </select>` : `
            <select id="gr-target" class="input" onchange="Pages._grTargetChange(this.value,'LOT')">
              <option value="">ロットを選択...</option>
              ${(Store.filterLots({status:'active'})).map(l =>
                `<option value="${l.lot_id}" ${l.lot_id===targetId?'selected':''}>
                  ${l.display_id} ${stageLabel(l.stage)} (${l.count}頭)</option>`
              ).join('')}
            </select>`}
        </div>` : `
        <!-- 直行モード: 対象バッジのみ表示 -->
        <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:8px 12px;
          display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:.7rem;color:var(--text3);
              padding:1px 6px;background:var(--surface3);border-radius:8px">
              ${targetType === 'LOT' ? 'ロット' : '個体'}
            </span>
            <span style="font-weight:700;color:var(--gold);font-size:.9rem;font-family:var(--font-mono)">
              ${displayId || targetId}
            </span>
          </div>
          ${age ? `<span style="font-size:.78rem;color:var(--blue);font-weight:600">${age.days}</span>` : ''}
        </div>`}

        <!-- 日齢・前回比 -->
        ${targetId && (age || prev) ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:2px 0">
          ${age ? `
          <div style="flex:1;min-width:100px;background:rgba(91,168,232,.07);border:1px solid rgba(91,168,232,.2);
            border-radius:8px;padding:6px 10px">
            <div style="font-size:.62rem;color:var(--text3)">現在の日齢</div>
            <div style="font-size:.9rem;font-weight:700;color:var(--blue)">${age.days}</div>
            <div style="font-size:.62rem;color:var(--text3)">${age.weeks} / ${age.stageGuess}</div>
          </div>` : ''}
          ${prev ? `
          <div style="flex:1;min-width:100px;background:var(--surface2);border-radius:8px;padding:6px 10px">
            <div style="font-size:.62rem;color:var(--text3)">前回 (${prev.record_date})</div>
            <div style="font-size:.9rem;font-weight:700">${prev.weight_g}g</div>
            <div id="gr-delta" style="font-size:.72rem;color:var(--text3)">—</div>
          </div>` : ''}
        </div>` : ''}

        <!-- 写真・AI解析（そのまま維持） -->
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

        <!-- 体重入力 -->
        <div class="card">
          <div style="font-size:.75rem;font-weight:700;color:var(--text3);margin-bottom:8px">
            体重 <span style="color:var(--red)">*</span>
          </div>
          <!-- ±ボタン行 -->
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <button type="button" class="btn btn-ghost"
              style="font-size:1.1rem;font-weight:700;padding:10px 14px;border-radius:10px"
              onclick="Pages._grAdjWeight(-10)">−10</button>
            <button type="button" class="btn btn-ghost"
              style="font-size:1.1rem;font-weight:700;padding:10px 14px;border-radius:10px"
              onclick="Pages._grAdjWeight(-1)">−1</button>
            <input type="number" id="gr-weight"
              style="flex:1;font-size:1.6rem;font-weight:700;text-align:center;
                padding:12px 6px;border:2px solid var(--border);border-radius:10px;
                background:var(--bg2);color:var(--text1);width:100%"
              placeholder="0.0" step="0.1" min="0"
              oninput="Pages._grUpdateDelta(this.value, ${prevWeight})">
            <button type="button" class="btn btn-ghost"
              style="font-size:1.1rem;font-weight:700;padding:10px 14px;border-radius:10px"
              onclick="Pages._grAdjWeight(1)">+1</button>
            <button type="button" class="btn btn-ghost"
              style="font-size:1.1rem;font-weight:700;padding:10px 14px;border-radius:10px"
              onclick="Pages._grAdjWeight(10)">+10</button>
          </div>
          <!-- g単位表示 + 前回差 -->
          <div style="display:flex;align-items:center;justify-content:center;gap:10px">
            <span style="font-size:.78rem;color:var(--text3)">g</span>
            ${prev ? `<span id="gr-delta-inline" style="font-size:.78rem;color:var(--text3)">前回比: —</span>` : ''}
          </div>
          <!-- 頭幅 -->
          <div style="margin-top:10px">
            <div style="font-size:.72rem;color:var(--text3);margin-bottom:4px">頭幅 (mm)（任意）</div>
            <input type="number" id="gr-headwidth" class="input"
              style="font-size:1rem;text-align:center;padding:8px"
              placeholder="例: 32.5" step="0.1">
          </div>
        </div>

        <!-- ステージ -->
        <div class="card">
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:6px;font-weight:700">ステージ</div>
          ${_grBtnGroup('gr-stage', STAGES, _selStage, 'Pages._grSelStage')}
        </div>

        <!-- 容器 / 交換区分 -->
        <div class="card">
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:6px;font-weight:700">容器サイズ</div>
          ${_grBtnGroup('gr-container', CONTAINERS, _selContainer, 'Pages._grSelContainer')}
          <div style="height:12px"></div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:6px;font-weight:700">交換区分</div>
          ${_grBtnGroup('gr-exchange', EXCHANGES, _selExchange, 'Pages._grSelExchange')}
        </div>

        <!-- マット / モルト -->
        <div class="card">
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:6px;font-weight:700">マット種別</div>
          ${_grBtnGroup('gr-mat', MATS, _selMat, 'Pages._grSelMat')}
          <div style="margin-top:10px">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;
              padding:10px;background:var(--surface2);border-radius:var(--radius-sm)">
              <input type="checkbox" id="gr-malt" style="width:18px;height:18px;cursor:pointer">
              <span style="font-size:.88rem;font-weight:600">🍄 モルト入り</span>
            </label>
          </div>
        </div>

        <!-- 記録日 -->
        <div class="card">
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:6px;font-weight:700">記録日</div>
          <input type="date" id="gr-date" class="input" value="${today}">
        </div>

        ${targetType === 'LOT' ? `
        <!-- ロット: 頭数変化 -->
        <div class="card">
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:6px;font-weight:700">
            🔢 マット交換時の頭数記録（任意）
          </div>
          <div class="form-row-2">
            ${UI.field('交換前頭数', `<input type="number" id="gr-before-count" class="input" min="0"
              placeholder="例: 5" oninput="Pages._grCalcAttrition()">`)}
            ${UI.field('交換後頭数', `<input type="number" id="gr-after-count" class="input" min="0"
              placeholder="例: 4" oninput="Pages._grCalcAttrition()">`)}
          </div>
          <div id="gr-attrition-display" style="font-size:.8rem;color:var(--text3);margin-top:4px;min-height:18px"></div>
        </div>` : ''}

        <!-- 詳細入力（折りたたみ・体色/メモ/公開設定） -->
        <div class="collapse-toggle"
          onclick="this.nextElementSibling.classList.toggle('open');this.nextElementSibling.classList.toggle('closed');this.querySelector('span:last-child').style.transform=this.nextElementSibling.classList.contains('open')?'rotate(180deg)':''">
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
        ${targetId ? `
        <div class="sec-hdr" style="margin-top:4px">
          <span class="sec-title">記録履歴</span>
          <span class="sec-more" onclick="Pages._grLoadHistory('${targetType}','${targetId}')">更新</span>
        </div>
        <div id="gr-history">${UI.spinner()}</div>` : ''}

      </div>

      <!-- 下部固定保存バー -->
      <div class="quick-action-bar">
        <button class="btn btn-ghost btn-xl" style="flex:1"
          id="gr-back-btn">← 戻る</button>
        <button class="btn btn-primary btn-xl" style="flex:2"
          onclick="Pages._grSave('${targetType}','${targetId}')">
          ✅ 保存
        </button>
      </div>`;

    if (targetId) {
      Pages._grLoadHistory(targetType, targetId);
    }
    // 戻るボタン — addEventListener で安全にバインド（inline onclick のクォート問題を回避）
    const _backBtn = document.getElementById('gr-back-btn');
    if (_backBtn) {
      _backBtn.addEventListener('click', function() {
        if (!targetId) { Store.back(); return; }
        if (targetType === 'LOT') {
          routeTo('lot-detail', { lotId: targetId });
        } else {
          routeTo('ind-detail', { indId: targetId });
        }
      });
    }
  }

  // ── ボタン式選択ハンドラ ────────────────────────────────────
  Pages._grSelStage     = (v) => { _selStage     = v; render(); };
  Pages._grSelContainer = (v) => { _selContainer = v; render(); };
  Pages._grSelMat       = (v) => { _selMat       = v; render(); };
  Pages._grSelExchange  = (v) => { _selExchange  = v; render(); };

  // ── 体重 ±ボタン ──────────────────────────────────────────
  Pages._grAdjWeight = (delta) => {
    const el = document.getElementById('gr-weight');
    if (!el) return;
    const cur = parseFloat(el.value) || 0;
    const next = Math.max(0, Math.round((cur + delta) * 10) / 10);
    el.value = next;
    // 前回比更新
    const prev = _getPrevRecord();
    if (prev) Pages._grUpdateDelta(String(next), +prev.weight_g);
  };

  // ── type切替 ──────────────────────────────────────────────
  Pages._grSetType = (type) => {
    targetType = type; targetId = ''; displayId = '';
    _selStage = ''; _selContainer = ''; _selMat = ''; _selExchange = '';
    render();
  };

  // ── 対象変更 ──────────────────────────────────────────────
  Pages._grTargetChange = (id, type) => {
    targetId = id; targetType = type;
    _selStage = ''; _selContainer = ''; _selMat = ''; _selExchange = '';
    if (id) {
      const obj = type === 'IND' ? Store.getIndividual(id) : Store.getLot(id);
      displayId = obj?.display_id || id;
    }
    render();
  };

  // ── 前回比リアルタイム更新 ───────────────────────────────
  Pages._grUpdateDelta = (val, prev) => {
    // 旧 gr-delta (日齢行) + 新 gr-delta-inline (体重行)
    [document.getElementById('gr-delta'), document.getElementById('gr-delta-inline')].forEach(el => {
      if (!el || !prev || !val) return;
      const delta = +val - prev;
      const sign  = delta >= 0 ? '+' : '';
      const color = delta >= 0 ? 'var(--green)' : 'var(--red,#e05050)';
      if (el.id === 'gr-delta-inline') {
        el.textContent = `前回比: ${sign}${delta.toFixed(1)}g`;
      } else {
        el.textContent = `${sign}${delta.toFixed(1)}g`;
      }
      el.style.color = color;
    });
  };

  // ── 写真選択 ───────────────────────────────────────────────
  Pages._grPhotoSelected = async (input) => {
    const file = input.files[0];
    if (!file) return;
    const area     = document.getElementById('photo-area');
    const resultEl = document.getElementById('gr-ai-result');
    try {
      const { base64, mimeType, dataUrl } = await compressImageToBase64(file);
      _photoB64  = base64;
      _photoMime = mimeType;
      area.innerHTML = `<img src="${dataUrl}" class="photo-preview">`;
      const key = Store.getSetting('gemini_key') || CONFIG.GEMINI_KEY;
      if (key) {
        resultEl.innerHTML = `<div style="font-size:.8rem;color:var(--text3)">🤖 AI解析中...</div>`;
        try {
          _aiResult = await API.gemini.analyzeImage(base64, mimeType, 'scale');
          if (_aiResult) {
            if (_aiResult.weight) {
              const wEl = document.getElementById('gr-weight');
              if (wEl) {
                wEl.value = _aiResult.weight;
                const prev = _getPrevRecord();
                if (prev) Pages._grUpdateDelta(_aiResult.weight, +prev.weight_g);
              }
            }
            if (_aiResult.larva_analysis?.comment) {
              const cEl = document.getElementById('gr-ai-comment');
              if (cEl) cEl.value = _aiResult.larva_analysis.comment;
            }
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

  // ── 履歴表示 ──────────────────────────────────────────────
  Pages._grLoadHistory = async (type, id) => {
    const el = document.getElementById('gr-history');
    if (!el) return;
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

  // ── 減耗数自動計算 ───────────────────────────────────────
  Pages._grCalcAttrition = () => {
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

  // ── 保存 ──────────────────────────────────────────────────
  Pages._grSave = async (type, id) => {
    if (!id) { UI.toast('対象を選択してください', 'error'); return; }
    const weight = document.getElementById('gr-weight')?.value;
    if (!weight) { UI.toast('体重を入力してください', 'error'); return; }

    // ボタン式フィールドは hidden input から取得
    const stage     = document.getElementById('gr-stage')?.value     || _selStage     || '';
    const container = document.getElementById('gr-container')?.value || _selContainer || '';
    const exchange  = document.getElementById('gr-exchange')?.value  || _selExchange  || '';
    const mat       = document.getElementById('gr-mat')?.value       || _selMat       || '';

    const headW     = document.getElementById('gr-headwidth')?.value    || '';
    const recDate   = (document.getElementById('gr-date')?.value || '').replace(/-/g, '/');
    const color     = document.getElementById('gr-color')?.value     || '';
    const firm      = document.getElementById('gr-firm')?.value      || '';
    const aiCmt     = document.getElementById('gr-ai-comment')?.value || '';
    const pub       = document.getElementById('gr-public')?.value    || 'private';
    const hasMalt   = document.getElementById('gr-malt')?.checked    || false;
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

    // 写真アップロード
    if (_photoB64) {
      const ind = type === 'IND' ? Store.getIndividual(id) : null;
      const lot = type === 'LOT' ? Store.getLot(id) : null;
      const lineId = ind?.line_id || lot?.line_id;
      const line   = lineId ? Store.getLine(lineId) : null;
      if (line) {
        try {
          const today2 = new Date().toISOString().split('T')[0].replace(/-/g,'/');
          const fname  = `${displayId || id}_${today2}.jpg`;
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
      const res = await apiCall(() => API.growth.create(payload), '記録しました ✅');
      Store.addGrowthRecord(id, { ...payload, record_id: res.record_id, age_days: res.age_days });
      if (type === 'IND') {
        Store.patchDBItem('individuals', 'ind_id', id, { latest_weight_g: weight, current_stage: stage });
      }
      if (type === 'LOT') {
        const lotUpdates = {};
        if (stage) lotUpdates.stage = stage;
        if (payload.after_count !== undefined) {
          lotUpdates.count = payload.after_count;
          if (payload.after_count === 0) lotUpdates.status = 'individualized';
        }
        if (Object.keys(lotUpdates).length) Store.patchDBItem('lots', 'lot_id', id, lotUpdates);
      }
      // フォームリセット（体重のみ）
      const wEl = document.getElementById('gr-weight');
      if (wEl) wEl.value = '';
      _photoB64 = null; _aiResult = null;
      // 履歴リロード
      const cached = Store.getGrowthRecords(id);
      const histEl = document.getElementById('gr-history');
      if (histEl && cached) histEl.innerHTML = UI.weightTable(cached);
      // ロット: 次のロットバー
      if (type === 'LOT') _showNextLotBar(id);
    } catch (e) {}
  };

  render();
};

// ── 次のロット選択バー ──────────────────────────────────────────
function _showNextLotBar(currentLotId) {
  document.getElementById('gr-next-lot-bar')?.remove();
  const currentLot = Store.getLot(currentLotId);
  if (!currentLot) return;
  const sameLine  = Store.filterLots({ line_id: currentLot.line_id, status: 'active' }).filter(l => l.lot_id !== currentLotId);
  const allActive = Store.filterLots({ status: 'active' }).filter(l => l.lot_id !== currentLotId);
  const candidates = sameLine.length ? sameLine : allActive.slice(0, 8);
  if (!candidates.length) return;

  const bar = document.createElement('div');
  bar.id = 'gr-next-lot-bar'; bar.className = 'next-lot-bar';
  const labelEl = document.createElement('div');
  labelEl.style.cssText = 'font-size:.72rem;color:var(--text3);margin-bottom:6px;font-weight:700';
  labelEl.textContent = '📦 次のロットへ（同ライン）';
  bar.appendChild(labelEl);
  const scrollEl = document.createElement('div');
  scrollEl.className = 'next-lot-scroll';
  candidates.slice(0, 6).forEach(function(l) {
    const ln = Store.getLine(l.line_id);
    const code = ln ? (ln.line_code || ln.display_id) : l.display_id;
    const btn = document.createElement('button');
    btn.className = 'next-lot-btn';
    btn.innerHTML = '<span style="color:var(--gold);font-weight:700">' + code + '</span><span style="color:var(--text3);margin-left:4px">' + l.count + '頭</span>';
    btn.onclick = (function(lotId, lotDisplayId) {
      return function() { document.getElementById('gr-next-lot-bar')?.remove(); routeTo('growth-rec', { targetType:'LOT', targetId:lotId, displayId:lotDisplayId }); };
    })(l.lot_id, l.display_id);
    scrollEl.appendChild(btn);
  });
  const closeBtn = document.createElement('button');
  closeBtn.className = 'next-lot-btn'; closeBtn.style.color = 'var(--text3)'; closeBtn.textContent = '✕ 閉じる';
  closeBtn.onclick = () => document.getElementById('gr-next-lot-bar')?.remove();
  scrollEl.appendChild(closeBtn);
  bar.appendChild(scrollEl);
  document.body.appendChild(bar);
}

// ── 成長記録編集モーダル ─────────────────────────────────────────
Pages._grEditRecord = async function (recordId) {
  let rec = null;
  const gm = Store.getDB('growthMap') || {};
  for (const recs of Object.values(gm)) {
    const found = (recs || []).find(r => r.record_id === recordId);
    if (found) { rec = found; break; }
  }
  const initDate   = rec ? String(rec.record_date || '').replace(/\//g, '-') : '';
  const initWeight = rec ? (rec.weight_g  || '') : '';
  const initStage  = rec ? (rec.stage     || '') : '';
  const initCont   = rec ? (rec.container || '') : '';
  const initMat    = rec ? (rec.mat_type  || '') : '';
  const initExch   = rec ? (rec.exchange_type || '') : '';
  const initNote   = rec ? (rec.note_private  || '') : '';

  const STAGE_OPTS = ['L1L2','L3','PREPUPA','PUPA','ADULT_PRE','ADULT']
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
  const payload = { record_id: recordId, record_date: date, weight_g: weight, stage, container: cont, mat_type: mat, exchange_type: exch, note_private: note };
  try {
    UI.loading(true); UI.closeModal();
    await apiCall(() => API.growth.update(payload), '成長記録を更新しました');
    const gm = Store.getDB('growthMap') || {};
    for (const [tid, recs] of Object.entries(gm)) {
      const idx = (recs || []).findIndex(r => r.record_id === recordId);
      if (idx >= 0) {
        Object.assign(recs[idx], payload);
        Store.setGrowthRecords(tid, recs);
        const histEl = document.getElementById('gr-history');
        if (histEl) histEl.innerHTML = UI.weightTable(recs);
        break;
      }
    }
  } catch (e) { UI.toast('更新失敗: ' + e.message, 'error'); }
  finally { UI.loading(false); }
};

window.PAGES = window.PAGES || {};
window.PAGES['growth-rec'] = () => Pages.growthRecord(Store.getParams());
