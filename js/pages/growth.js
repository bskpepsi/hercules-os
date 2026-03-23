// ════════════════════════════════════════════════════════════════
// growth.js v4 — 成長記録入力画面（旧weightMode UIベース・全導線統一）
//
// 【UI構成】（スクショ準拠）
//   ① 対象カード（ID / ステージ / 日齢 / ライン）
//   ② モードタブ: 通常 / T1移行 / T2初回移行
//   ③ 体重入力（-10/-1/+1/+10 ± ボタン + 大型数値入力）
//   ④ 記録日 / 区分 / 容器 / 交換種別 / マット / ステージ（全ボタン式）
//   ⑤ 写真・AI解析（既存維持）
//   ⑥ 前回記録 / 頭幅・メモ（折りたたみ）
//   ⑦ 「保存して次へ」固定フッターボタン
//
// 【導線】個体詳細 / ロット詳細 / QRスキャン 全てここへ統一
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 体重閾値バッジ ───────────────────────────────────────────────
const GR_THRESHOLDS = [
  { min: 170, badge: '⭐ 超大型候補', color: '#c8a84b', bg: 'rgba(200,168,75,.15)' },
  { min: 150, badge: '🔥 大型候補',   color: 'var(--amber)', bg: 'rgba(224,144,64,.12)' },
];

// ── モードプリセット定義 ────────────────────────────────────────
const GR_MODE_PRESETS = {
  normal: { label: '通常',       mat: '',   exchange: '',     stage: '' },
  t1:     { label: 'T1移行',     mat: 'T1', exchange: 'FULL', stage: 'L1L2' },
  t2:     { label: 'T2初回移行', mat: 'T2', exchange: 'FULL', stage: 'L3'   },
};

// ── ボタン式グループヘルパー ────────────────────────────────────
function _grBtnGroup(id, items, active, onClickFn) {
  return '<div style="display:flex;gap:6px;flex-wrap:wrap">'
    + items.map(it => {
        const on = it.val === active;
        return `<button type="button"
          style="padding:8px 14px;border-radius:8px;font-size:.85rem;font-weight:700;
            cursor:pointer;min-height:42px;
            border:1px solid ${on ? 'var(--green)' : 'var(--border)'};
            background:${on ? 'var(--green)' : 'var(--surface2)'};
            color:${on ? '#fff' : 'var(--text2)'}"
          onclick="${onClickFn}('${it.val}')">${it.label}</button>`;
      }).join('')
    + `<input type="hidden" id="${id}" value="${active || ''}"></div>`;
}

Pages.growthRecord = function (params = {}) {
  const main = document.getElementById('main');

  let targetType = params.targetType || 'IND';
  let targetId   = params.targetId   || '';
  let displayId  = params.displayId  || '';
  let _mode      = params._preset    || 'normal';  // 'normal'|'t1'|'t2'

  let _photoB64  = null;
  let _photoMime = null;
  let _aiResult  = null;

  // ── ボタン式フィールドの現在値 ──────────────────────────────
  let _selSizeCat  = '';
  let _selContainer= '';
  let _selExchange = '';
  let _selMat      = '';
  let _selStage    = '';

  function _applyModePreset(mode) {
    const p = GR_MODE_PRESETS[mode] || GR_MODE_PRESETS.normal;
    if (p.mat)      _selMat      = p.mat;
    if (p.exchange) _selExchange = p.exchange;
    if (p.stage)    _selStage    = p.stage;
  }

  function _loadEntityDefaults() {
    if (!targetId) return;
    const obj = targetType === 'IND' ? Store.getIndividual(targetId) : Store.getLot(targetId);
    if (!obj) return;
    if (!_selStage)     _selStage     = (obj.current_stage || obj.stage || '').toUpperCase();
    if (!_selContainer) _selContainer = obj.current_container || obj.container_size || '';
    if (!_selMat)       _selMat       = obj.current_mat       || obj.mat_type       || '';
    if (!_selSizeCat)   _selSizeCat   = obj.size_category     || '';
    if (!displayId)     displayId     = obj.display_id || targetId;
  }

  function _getPrevRecord() {
    const recs = Store.getGrowthRecords(targetId) || [];
    const wts  = recs.filter(r => r.weight_g && +r.weight_g > 0);
    return wts.length ? wts[wts.length - 1] : null;
  }

  function _getEntityInfo() {
    const obj  = targetType === 'IND' ? Store.getIndividual(targetId) : Store.getLot(targetId);
    const line = obj ? Store.getLine(obj.line_id) : null;
    const age  = obj?.hatch_date ? Store.calcAge(obj.hatch_date) : null;
    const stage = (targetType === 'IND' ? obj?.current_stage : obj?.stage) || '';
    const sex   = targetType === 'IND' ? (obj?.sex || '') : '';
    const count = targetType === 'LOT' ? (parseInt(obj?.count, 10) || 0) : 0;
    const lineDisp = line?.line_code || line?.display_id || '';
    return { obj, line, age, stage, sex, count, lineDisp };
  }

  function _deltaHtml(cur, prev) {
    let threshHtml = '';
    for (const t of GR_THRESHOLDS) {
      if (cur >= t.min) {
        threshHtml = `<div style="display:inline-block;background:${t.bg};border:1px solid ${t.color};border-radius:99px;padding:2px 10px;font-size:.8rem;font-weight:700;color:${t.color};margin-bottom:2px">${t.badge}</div><br>`;
        break;
      }
    }
    if (prev === null) {
      return threshHtml + `<span style="color:var(--text3)">📝 初回記録: <b>${cur}g</b></span>`;
    }
    const diff  = Math.round((cur - prev) * 10) / 10;
    const isPos = diff > 0, isNeg = diff < 0;
    const arrow = isPos ? '↑' : isNeg ? '↓' : '→';
    const color = isPos ? 'var(--green)' : isNeg ? 'var(--red,#e05050)' : 'var(--text3)';
    const sign  = isPos ? '+' : '';
    const cel   = isPos && diff >= 5 ? ' 🎉' : '';
    return threshHtml + `<span style="color:${color};font-weight:700;font-size:1.05rem">${arrow} ${sign}${diff}g${cel}</span><span style="color:var(--text3);font-size:.75rem;margin-left:6px">（前回 ${prev}g）</span>`;
  }

  // ── 最初の一度だけ適用 ────────────────────────────────────────
  _applyModePreset(_mode);
  _loadEntityDefaults();

  function render() {
    const { obj, age, stage, sex, count, lineDisp } = _getEntityInfo();
    const prev      = _getPrevRecord();
    const prevWeight= prev ? +prev.weight_g : null;
    const prevDate  = prev?.record_date || '';
    const today     = new Date().toISOString().split('T')[0];
    const isLot     = targetType === 'LOT';
    const isDirectMode = !!targetId;

    // stage display label
    const stageDispMap = { L1L2:'L1L2', L3:'L3', PREPUPA:'前蛹', PUPA:'蛹', ADULT_PRE:'未後食', ADULT:'活動中' };
    const stageDisp = stageDispMap[stage] || stage || '—';

    // back route
    const backFn = isDirectMode
      ? (isLot ? `routeTo('lot-detail',{lotId:'${targetId}'})` : `routeTo('ind-detail',{indId:'${targetId}'})`)
      : `Store.back()`;

    main.innerHTML = `
      ${UI.header('成長記録', { back: true, backFn: backFn })}
      <div class="page-body has-quick-bar">

        ${!isDirectMode ? `
        <!-- 対象選択（手動モードのみ） -->
        <div class="card">
          <div class="card-title">記録対象</div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button class="pill ${targetType==='IND'?'active':''}" onclick="Pages._grSetType('IND')">個体</button>
            <button class="pill ${targetType==='LOT'?'active':''}" onclick="Pages._grSetType('LOT')">ロット</button>
          </div>
          ${targetType === 'IND' ? `
            <select id="gr-target" class="input" onchange="Pages._grTargetChange(this.value,'IND')">
              <option value="">個体を選択...</option>
              ${(Store.filterIndividuals({status:'alive'})).map(i => `<option value="${i.ind_id}" ${i.ind_id===targetId?'selected':''}>${i.display_id} ${i.latest_weight_g?'('+i.latest_weight_g+'g)':''} ${i.sex||''}</option>`).join('')}
            </select>` : `
            <select id="gr-target" class="input" onchange="Pages._grTargetChange(this.value,'LOT')">
              <option value="">ロットを選択...</option>
              ${(Store.filterLots({status:'active'})).map(l => `<option value="${l.lot_id}" ${l.lot_id===targetId?'selected':''}>${l.display_id} (${l.count}頭)</option>`).join('')}
            </select>`}
        </div>` : ''}

        <!-- ① 対象カード -->
        ${targetId ? `
        <div class="quick-info-bar">
          <div style="flex:1;min-width:0">
            <div class="quick-info-id" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${displayId}
            </div>
            <div style="display:flex;gap:5px;align-items:center;margin-top:4px;flex-wrap:wrap">
              <span style="background:rgba(76,175,120,.15);color:var(--green);font-size:.68rem;padding:1px 6px;border-radius:99px;font-weight:600">${stageDisp}</span>
              ${isLot ? `<span style="font-size:.7rem;color:var(--text3)">${count}頭</span>` : `<span style="font-size:.7rem;color:var(--text3)">${sex}</span>`}
              ${lineDisp ? `<span style="font-size:.68rem;color:var(--text3)">L:${lineDisp}</span>` : ''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            ${age ? `<div class="quick-info-age">${age.totalDays}</div><div class="quick-info-age-label">日齢</div>` : ''}
          </div>
        </div>` : ''}

        <!-- ② モードタブ -->
        ${targetId ? `
        <div style="display:flex;gap:5px">
          ${Object.entries(GR_MODE_PRESETS).map(([k, p]) =>
            `<button class="btn btn-sm ${_mode===k ? 'btn-primary' : 'btn-ghost'}" style="flex:1;font-size:.75rem"
              onclick="Pages._grSetMode('${k}')">${p.label}</button>`
          ).join('')}
        </div>` : ''}

        <!-- ③ 体重入力 -->
        <div class="card" style="border-color:rgba(76,175,120,.35);padding:16px 14px">
          <div style="text-align:center;font-size:.72rem;font-weight:700;color:var(--text3);letter-spacing:.08em;margin-bottom:10px">体重 (g)</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:8px">
            <button class="btn btn-ghost btn-sm" style="min-width:46px;font-size:.9rem"
              onclick="Pages._grAdjWeight(-10)" onmousedown="Pages._grAdjStart(-10)" onmouseup="Pages._grAdjStop()" ontouchend="Pages._grAdjStop()">−10</button>
            <button class="btn btn-ghost btn-sm" style="min-width:46px;font-size:.9rem"
              onclick="Pages._grAdjWeight(-1)" onmousedown="Pages._grAdjStart(-1)" onmouseup="Pages._grAdjStop()" ontouchend="Pages._grAdjStop()">−1</button>
            <input id="gr-weight" type="number" inputmode="decimal" step="0.1" min="0" max="999.9"
              placeholder="0.0" autocomplete="off"
              style="width:180px;font-size:2.6rem;font-weight:700;text-align:center;
                border:2px solid var(--gold);border-radius:10px;padding:10px 8px;
                background:var(--bg2);color:var(--green)"
              oninput="Pages._grLiveUpdate(this.value,${prevWeight})"
              onkeydown="if(event.key==='Enter'&&!event.isComposing){Pages._grSave('${targetType}','${targetId}')}">
            <button class="btn btn-ghost btn-sm" style="min-width:46px;font-size:.9rem"
              onclick="Pages._grAdjWeight(1)" onmousedown="Pages._grAdjStart(1)" onmouseup="Pages._grAdjStop()" ontouchend="Pages._grAdjStop()">+1</button>
            <button class="btn btn-ghost btn-sm" style="min-width:46px;font-size:.9rem"
              onclick="Pages._grAdjWeight(10)" onmousedown="Pages._grAdjStart(10)" onmouseup="Pages._grAdjStop()" ontouchend="Pages._grAdjStop()">+10</button>
          </div>
          <div style="text-align:center;font-size:.78rem;color:var(--text3);margin-bottom:6px">g</div>
          <div id="gr-delta" style="text-align:center;min-height:28px;font-size:.9rem;transition:all .15s">
            ${prevWeight !== null
              ? `<span style="color:var(--text3)">前回 <b>${prevWeight}g</b>（${prevDate}）から —</span>`
              : `<span style="color:var(--text3)">（前回体重なし・初回記録）</span>`}
          </div>
        </div>

        <!-- ④ 写真・AI解析（維持） -->
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

        <!-- ⑤ 入力パネル: 記録日 / 区分 / 容器 / 交換種別 / マット / ステージ -->
        <div class="card">
          <div class="form-section">

            <div class="field">
              <label class="field-label" style="font-size:.72rem;color:var(--text3);font-weight:700">記録日</label>
              <input id="gr-date" type="date" class="input" value="${today}" max="${today}">
            </div>

            <div class="field">
              <label class="field-label" style="font-size:.72rem;color:var(--text3);font-weight:700">区分</label>
              ${isLot ? `
                <div style="display:flex;gap:6px">
                  ${['大','中','小','—'].map(c => {
                    const on = c === '—' ? !_selSizeCat : (_selSizeCat||'').split(',').map(s=>s.trim()).includes(c);
                    return `<button type="button"
                      style="flex:1;min-height:42px;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
                        border:1px solid ${on ? 'var(--green)' : 'var(--border)'};
                        background:${on ? 'var(--green)' : 'var(--surface2)'};
                        color:${on ? '#fff' : 'var(--text2)'}"
                      onclick="Pages._grSelSizeCat('${c}')">${c}</button>`;
                  }).join('')}
                  <input type="hidden" id="gr-size-cat" value="${_selSizeCat}">
                </div>` : `<div style="font-size:.8rem;color:var(--text3)">（個体は区分なし）</div>`}
            </div>

            <div class="field">
              <label class="field-label" style="font-size:.72rem;color:var(--text3);font-weight:700">容器</label>
              ${_grBtnGroup('gr-container',
                [{val:'1.8L',label:'1.8L'},{val:'2.7L',label:'2.7L'},{val:'4.8L',label:'4.8L'},{val:'',label:'—'}],
                _selContainer, 'Pages._grSelContainer')}
            </div>

            <div class="field">
              <label class="field-label" style="font-size:.72rem;color:var(--text3);font-weight:700">交換種別</label>
              ${_grBtnGroup('gr-exchange',
                [{val:'FULL',label:'全交換'},{val:'PARTIAL',label:'追加'},{val:'',label:'なし'}],
                _selExchange, 'Pages._grSelExchange')}
            </div>

            <div class="field">
              <label class="field-label" style="font-size:.72rem;color:var(--text3);font-weight:700">マット</label>
              ${_grBtnGroup('gr-mat',
                [{val:'T1',label:'T1'},{val:'T2',label:'T2'},{val:'T3',label:'T3'},{val:'',label:'—'}],
                _selMat, 'Pages._grSelMat')}
            </div>

            <div class="field">
              <label class="field-label" style="font-size:.72rem;color:var(--text3);font-weight:700">ステージ</label>
              ${_grBtnGroup('gr-stage',
                [{val:'L1L2',label:'L1L2'},{val:'L3',label:'L3'},{val:'PREPUPA',label:'前蛹'},
                 {val:'PUPA',label:'蛹'},{val:'ADULT_PRE',label:'未後食'},{val:'ADULT',label:'活動中'},{val:'',label:'—'}],
                _selStage, 'Pages._grSelStage')}
            </div>

          </div>
        </div>

        <!-- ⑥ LOT: 頭数変化 -->
        ${isLot ? `
        <div class="card" style="padding:14px">
          <div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:10px">🔢 頭数変化（マット交換時）</div>
          <div class="count-row">
            <div>
              <div style="font-size:.68rem;color:var(--text3);margin-bottom:4px;text-align:center">交換前</div>
              <input id="gr-before-count" type="number" inputmode="numeric"
                class="num-input-xl" style="font-size:2rem"
                min="0" max="999" placeholder="${count||'—'}" value="${count||''}"
                oninput="Pages._grCalcAttrition()">
            </div>
            <div class="count-row-arrow">→</div>
            <div>
              <div style="font-size:.68rem;color:var(--text3);margin-bottom:4px;text-align:center">交換後</div>
              <input id="gr-after-count" type="number" inputmode="numeric"
                class="num-input-xl" style="font-size:2rem"
                min="0" max="999" placeholder="—"
                oninput="Pages._grCalcAttrition()">
            </div>
          </div>
          <div id="gr-attrition-display" class="count-attrition"></div>
        </div>` : ''}

        <!-- ⑦ 頭幅/メモ（折りたたみ） -->
        <div class="collapse-toggle"
          onclick="this.nextElementSibling.classList.toggle('open');this.nextElementSibling.classList.toggle('closed');this.querySelector('span:last-child').style.transform=this.nextElementSibling.classList.contains('open')?'rotate(180deg)':''">
          <span>📝 頭幅 / メモ（任意）</span>
          <span style="font-size:.7rem;transition:transform .2s">▼</span>
        </div>
        <div class="collapse-body closed">
          <div class="card" style="border-radius:0 0 var(--radius) var(--radius)">
            <div class="form-section">
              <div class="field">
                <label class="field-label">頭幅 (mm)</label>
                <input id="gr-headwidth" class="input" type="number" inputmode="decimal" step="0.1" min="0" max="99" placeholder="例: 38.5">
              </div>
              <div class="field">
                <label class="field-label">🍄 モルト入り</label>
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px;background:var(--surface2);border-radius:var(--radius-sm)">
                  <input type="checkbox" id="gr-malt" style="width:18px;height:18px">
                  <span style="font-size:.88rem">モルトパウダー入りマット</span>
                </label>
              </div>
              <div class="field">
                <label class="field-label">観察メモ（内部）</label>
                <textarea id="gr-ai-comment" class="input" rows="2" placeholder="幼虫の状態、色艶など"></textarea>
              </div>
            </div>
          </div>
        </div>

        <!-- ⑧ 前回記録 -->
        ${prev ? `
        <div class="card" style="padding:10px 14px">
          <div style="font-size:.68rem;color:var(--text3);margin-bottom:4px">前回記録</div>
          <div style="display:flex;align-items:baseline;gap:10px">
            <span style="font-size:1.5rem;font-weight:700;color:var(--text2);font-family:var(--font-mono)">${prev.weight_g}g</span>
            <span style="font-size:.75rem;color:var(--text3)">${prevDate}${prev.age_days ? ` / ${prev.age_days}日齢` : ''}</span>
          </div>
        </div>` : ''}

        <!-- ⑨ 記録履歴 -->
        ${targetId ? `
        <div class="sec-hdr" style="margin-top:4px">
          <span class="sec-title">記録履歴</span>
          <span class="sec-more" onclick="Pages._grLoadHistory('${targetType}','${targetId}')">更新</span>
        </div>
        <div id="gr-history">${UI.spinner()}</div>` : ''}

      </div>

      <!-- 固定フッター -->
      <div class="quick-action-bar">
        <button id="gr-back-btn" class="btn btn-ghost btn-xl" style="flex:1">← 戻る</button>
        <button id="gr-save-btn" class="btn btn-gold btn-xl" style="flex:2"
          onclick="Pages._grSave('${targetType}','${targetId}')">
          💾 保存して次へ
        </button>
      </div>`;

    // ── 戻るボタン addEventListener ────────────────────────────
    const backBtn = document.getElementById('gr-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        if (!targetId) { Store.back(); return; }
        isLot ? routeTo('lot-detail', { lotId: targetId })
               : routeTo('ind-detail', { indId: targetId });
      });
    }

    // ── 初期フォーカス ────────────────────────────────────────
    if (targetId) {
      setTimeout(() => document.getElementById('gr-weight')?.focus(), 150);
      Pages._grLoadHistory(targetType, targetId);
    }
  }

  // ── モード切替 ────────────────────────────────────────────────
  Pages._grSetMode = (mode) => {
    _mode = mode;
    _applyModePreset(mode);
    // フォーム値を保持して再描画
    const w = document.getElementById('gr-weight')?.value;
    const d = document.getElementById('gr-date')?.value;
    render();
    if (w) setTimeout(() => { const el = document.getElementById('gr-weight'); if (el) el.value = w; }, 0);
    if (d) setTimeout(() => { const el = document.getElementById('gr-date');   if (el) el.value = d; }, 0);
  };

  // ── 対象選択（手動モード） ────────────────────────────────────
  Pages._grSetType = (type) => {
    targetType = type; targetId = ''; displayId = '';
    _selStage = ''; _selContainer = ''; _selMat = ''; _selExchange = ''; _selSizeCat = '';
    render();
  };
  Pages._grTargetChange = (id, type) => {
    targetId = id; targetType = type;
    _selStage = ''; _selContainer = ''; _selMat = ''; _selExchange = ''; _selSizeCat = '';
    _applyModePreset(_mode);
    _loadEntityDefaults();
    const obj = type === 'IND' ? Store.getIndividual(id) : Store.getLot(id);
    displayId = obj?.display_id || id;
    render();
  };

  // ── ボタン選択ハンドラ ────────────────────────────────────────
  Pages._grSelContainer = (v) => { _selContainer = v; render(); };
  Pages._grSelExchange  = (v) => { _selExchange  = v; render(); };
  Pages._grSelMat       = (v) => { _selMat       = v; render(); };
  Pages._grSelStage     = (v) => { _selStage     = v; render(); };
  Pages._grSelSizeCat   = (v) => {
    if (v === '—') { _selSizeCat = ''; }
    else {
      const cats = (_selSizeCat || '').split(',').map(s => s.trim()).filter(Boolean);
      const idx  = cats.indexOf(v);
      if (idx >= 0) cats.splice(idx, 1); else cats.push(v);
      _selSizeCat = cats.join(',');
    }
    render();
  };

  // ── 体重 ±ボタン ─────────────────────────────────────────────
  let _adjTimer = null;
  Pages._grAdjWeight = (delta) => {
    const el = document.getElementById('gr-weight');
    if (!el) return;
    const cur  = parseFloat(el.value) || 0;
    const next = Math.max(0, Math.round((cur + delta) * 10) / 10);
    el.value = next;
    Pages._grLiveUpdate(String(next), _grPrevWeightCache);
  };
  Pages._grAdjStart = (delta) => {
    Pages._grAdjWeight(delta);
    _adjTimer = setInterval(() => Pages._grAdjWeight(delta), 150);
  };
  Pages._grAdjStop = () => { clearInterval(_adjTimer); _adjTimer = null; };

  // ── リアルタイム前回比更新 ────────────────────────────────────
  let _grPrevWeightCache = null;
  const _initPrev = _getPrevRecord();
  _grPrevWeightCache = _initPrev ? +_initPrev.weight_g : null;

  Pages._grLiveUpdate = (val, prev) => {
    const el = document.getElementById('gr-delta');
    if (!el) return;
    const cur = parseFloat(val);
    if (!val || isNaN(cur) || cur <= 0) {
      el.innerHTML = prev !== null
        ? `<span style="color:var(--text3)">前回 <b>${prev}g</b> から —</span>`
        : `<span style="color:var(--text3)">（初回記録）</span>`;
      return;
    }
    el.innerHTML = _deltaHtml(cur, prev);
  };

  // ── 写真選択 ─────────────────────────────────────────────────
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
              if (wEl) { wEl.value = _aiResult.weight; Pages._grLiveUpdate(_aiResult.weight, _grPrevWeightCache); }
            }
            if (_aiResult.larva_analysis?.comment) {
              const cEl = document.getElementById('gr-ai-comment'); if (cEl) cEl.value = _aiResult.larva_analysis.comment;
            }
            resultEl.innerHTML = `<div style="background:rgba(76,175,120,.1);border:1px solid rgba(76,175,120,.3);border-radius:6px;padding:8px;font-size:.78rem">✅ AI解析完了: ${_aiResult.weight ? _aiResult.weight+'g' : ''}${_aiResult.larva_analysis?.health ? ' / '+_aiResult.larva_analysis.health : ''}</div>`;
          }
        } catch (e) {
          resultEl.innerHTML = `<div style="font-size:.78rem;color:var(--amber)">⚠️ AI解析失敗 (${e.message.slice(0,40)})</div>`;
        }
      }
    } catch (e) { UI.toast('画像の読み込みに失敗しました', 'error'); }
  };

  // ── 記録履歴 ─────────────────────────────────────────────────
  Pages._grLoadHistory = async (type, id) => {
    const el = document.getElementById('gr-history');
    if (!el) return;
    const cached = Store.getGrowthRecords(id);
    if (cached) el.innerHTML = UI.weightTable(cached);
    try {
      const res = await API.growth.list(type, id);
      Store.setGrowthRecords(id, res.records);
      el.innerHTML = UI.weightTable(res.records);
    } catch (e) { if (!cached) el.innerHTML = UI.empty('履歴取得失敗'); }
  };

  // ── 頭数減耗計算 ─────────────────────────────────────────────
  Pages._grCalcAttrition = () => {
    const before = parseInt(document.getElementById('gr-before-count')?.value || '');
    const after  = parseInt(document.getElementById('gr-after-count')?.value  || '');
    const el = document.getElementById('gr-attrition-display');
    if (!el) return;
    if (!isNaN(before) && !isNaN(after)) {
      const diff = before - after;
      el.textContent = diff > 0 ? `減耗 ${diff} 頭` : diff === 0 ? '変化なし' : `⚠️ 後が多い(${Math.abs(diff)}頭増)`;
      el.style.color = diff > 0 ? 'var(--red)' : diff === 0 ? 'var(--text3)' : 'var(--amber)';
    } else { el.textContent = ''; }
  };

  // ── 保存 ──────────────────────────────────────────────────────
  Pages._grSave = async (type, id) => {
    if (!id) { UI.toast('対象を選択してください', 'error'); return; }
    const weight = document.getElementById('gr-weight')?.value;
    if (!weight || parseFloat(weight) <= 0) { UI.toast('体重を入力してください（0.1g以上）', 'error'); return; }

    const stage     = document.getElementById('gr-stage')?.value     || _selStage     || '';
    const container = document.getElementById('gr-container')?.value || _selContainer || '';
    const exchange  = document.getElementById('gr-exchange')?.value  || _selExchange  || '';
    const mat       = document.getElementById('gr-mat')?.value       || _selMat       || '';
    const sizeCat   = document.getElementById('gr-size-cat')?.value  || _selSizeCat   || '';
    const headW     = document.getElementById('gr-headwidth')?.value || '';
    const recDate   = (document.getElementById('gr-date')?.value || '').replace(/-/g, '/');
    const aiCmt     = document.getElementById('gr-ai-comment')?.value || '';
    const hasMalt   = document.getElementById('gr-malt')?.checked    || false;
    const beforeCount = document.getElementById('gr-before-count')?.value;
    const afterCount  = document.getElementById('gr-after-count')?.value;

    const payload = {
      target_type:   type,
      target_id:     id,
      stage,
      weight_g:      weight,
      head_width_mm: headW || undefined,
      container:     container || undefined,
      mat_type:      mat || undefined,
      has_malt:      hasMalt,
      exchange_type: exchange || undefined,
      size_category: sizeCat || undefined,
      before_count:  beforeCount !== '' && beforeCount !== undefined ? parseInt(beforeCount) : undefined,
      after_count:   afterCount  !== '' && afterCount  !== undefined ? parseInt(afterCount)  : undefined,
      note_private:  aiCmt || undefined,
      record_date:   recDate,
    };

    // 写真アップロード
    if (_photoB64) {
      const obj  = type === 'IND' ? Store.getIndividual(id) : Store.getLot(id);
      const line = obj ? Store.getLine(obj.line_id) : null;
      if (line) {
        try {
          const today2 = new Date().toISOString().split('T')[0].replace(/-/g,'/');
          const up = await API.drive.uploadPhoto({ base64: _photoB64, mime_type: _photoMime,
            filename: `${displayId||id}_${today2}.jpg`, line_display_id: line.display_id, folder_type: 'GROWTH' });
          payload.photo_url = up.url;
        } catch (e) { UI.toast('写真アップロード失敗（記録は保存します）', 'info'); }
      }
    }

    const btn = document.getElementById('gr-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 保存中...'; }

    try {
      const res = await apiCall(() => API.growth.create(payload), '記録しました ✅');
      Store.addGrowthRecord(id, { ...payload, record_id: res.record_id, age_days: res.age_days });
      if (type === 'IND') Store.patchDBItem('individuals', 'ind_id', id, { latest_weight_g: weight, current_stage: stage });
      if (type === 'LOT') {
        const lu = {};
        if (stage) lu.stage = stage;
        if (payload.after_count !== undefined) { lu.count = payload.after_count; if (payload.after_count === 0) lu.status = 'individualized'; }
        if (Object.keys(lu).length) Store.patchDBItem('lots', 'lot_id', id, lu);
      }
      // 体重フィールドリセット
      const wEl = document.getElementById('gr-weight'); if (wEl) wEl.value = '';
      _photoB64 = null; _aiResult = null;
      // 履歴更新
      const cached = Store.getGrowthRecords(id);
      const histEl = document.getElementById('gr-history');
      if (histEl && cached) histEl.innerHTML = UI.weightTable(cached);
      if (btn) { btn.disabled = false; btn.textContent = '💾 保存して次へ'; }
      // ロット: 次のロットへバー
      if (type === 'LOT') _grShowNextLotBar(id);
      // 個体: 次フォーカス
      if (type === 'IND') setTimeout(() => document.getElementById('gr-weight')?.focus(), 200);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '💾 保存して次へ'; }
    }
  };

  render();
};

// ── 次のロット連続入力バー ──────────────────────────────────────
function _grShowNextLotBar(currentLotId) {
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
    const ln   = Store.getLine(l.line_id);
    const code = ln ? (ln.line_code || ln.display_id) : l.display_id;
    const btn  = document.createElement('button');
    btn.className = 'next-lot-btn';
    btn.innerHTML = `<span style="color:var(--gold);font-weight:700">${code}</span><span style="color:var(--text3);margin-left:4px">${l.count}頭</span>`;
    btn.onclick = (function(lotId, lotDisplayId) {
      return function() {
        document.getElementById('gr-next-lot-bar')?.remove();
        routeTo('growth-rec', { targetType:'LOT', targetId:lotId, displayId:lotDisplayId });
      };
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
  const STAGE_OPTS = ['L1L2','L3','PREPUPA','PUPA','ADULT_PRE','ADULT'].map(s => `<option value="${s}" ${initStage===s?'selected':''}>${s}</option>`).join('');
  UI.modal(`
    <div class="modal-title">成長記録を編集</div>
    <div class="form-section" style="max-height:60vh;overflow-y:auto">
      ${UI.field('記録日', `<input type="date" id="gre-date" class="input" value="${initDate}">`)}
      ${UI.field('体重(g)', `<input type="number" id="gre-weight" class="input" step="0.1" value="${initWeight}" placeholder="例: 45.2">`)}
      <div class="form-row-2">
        ${UI.field('ステージ', `<select id="gre-stage" class="input">${STAGE_OPTS}</select>`)}
        ${UI.field('容器', `<select id="gre-cont" class="input"><option value="">—</option>${['1.8L','2.7L','4.8L'].map(v=>`<option value="${v}" ${initCont===v?'selected':''}>${v}</option>`).join('')}</select>`)}
      </div>
      <div class="form-row-2">
        ${UI.field('マット', `<select id="gre-mat" class="input"><option value="">—</option>${['T1','T2','T3'].map(v=>`<option value="${v}" ${initMat===v?'selected':''}>${v}</option>`).join('')}</select>`)}
        ${UI.field('交換区分', `<select id="gre-exch" class="input"><option value="">—</option><option value="FULL" ${initExch==='FULL'?'selected':''}>全交換</option><option value="PARTIAL" ${initExch==='PARTIAL'?'selected':''}>追加のみ</option></select>`)}
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
      if (idx >= 0) { Object.assign(recs[idx], payload); Store.setGrowthRecords(tid, recs); const h = document.getElementById('gr-history'); if (h) h.innerHTML = UI.weightTable(recs); break; }
    }
  } catch (e) { UI.toast('更新失敗: ' + e.message, 'error'); }
  finally { UI.loading(false); }
};

window.PAGES = window.PAGES || {};
window.PAGES['growth-rec'] = () => Pages.growthRecord(Store.getParams());
