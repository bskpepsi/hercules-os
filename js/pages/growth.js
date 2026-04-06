// ════════════════════════════════════════════════════════════════
// growth.js v5 — 成長記録入力画面（体重測定UIベース・全導線統一）
//
// v5 修正:
//   - ±ボタン二重発火修正: onclick廃止 → onpointerdown/onpointerup のみ
//   - 区分ボタン: LOT時は必ず表示（isLot判定を単純化）
//   - 🍄 モルト入り: メインカード内に常時表示
//   - ステージ: L1L2 / L3 / 前蛹 のみ（蛹・成虫系は除外）
//   - ボタンサイズ: min-height 48px に拡大
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 体重閾値バッジ ───────────────────────────────────────────────
const GR_THRESHOLDS = [
  { min: 170, badge: '⭐ 超大型候補', color: '#c8a84b', bg: 'rgba(200,168,75,.15)' },
  { min: 150, badge: '🔥 大型候補',   color: 'var(--amber)', bg: 'rgba(224,144,64,.12)' },
];

// ── モードプリセット ────────────────────────────────────────────
const GR_MODE_PRESETS = {
  normal: { label: '通常',       mat: '',   exchange: '',     stage: '' },
  t1:     { label: 'T1移行',     mat: 'T1', exchange: 'FULL', stage: 'L1L2' },
  t2:     { label: 'T2初回移行', mat: 'T2', exchange: 'FULL', stage: 'L3'   },
};

// ── ボタン式グループヘルパー ────────────────────────────────────
// min-height: 48px で押しやすいサイズ確保
function _grBtnGroup(id, items, active, onClickFn) {
  return '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + items.map(it => {
        const on = it.val === active;
        return `<button type="button"
          style="padding:13px 0;border-radius:10px;font-size:.95rem;font-weight:700;
            cursor:pointer;min-height:52px;min-width:64px;flex:1;
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
  let _mode      = params._preset    || 'normal';
  // QRスキャンから来た場合: 保存後に再スキャン画面へ戻る
  const _fromQR  = !!(params._fromQR || params._preset);  // presetはQRモードから

  let _photoB64  = null;
  let _photoMime = null;
  let _aiResult  = null;

  // ── 入力状態 ──────────────────────────────────────────────────
  let _selSizeCat  = '';
  let _selContainer= '';
  let _selExchange = '';
  let _selMat      = '';
  let _selStage    = '';
  let _hasMalt     = false;

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
        threshHtml = `<div style="display:inline-block;background:${t.bg};border:1px solid ${t.color};border-radius:99px;padding:2px 12px;font-size:.82rem;font-weight:700;color:${t.color};margin-bottom:4px">${t.badge}</div><br>`;
        break;
      }
    }
    if (prev === null) return threshHtml + `<span style="color:var(--text3)">📝 初回記録: <b>${cur}g</b></span>`;
    const diff  = Math.round((cur - prev) * 10) / 10;
    const isPos = diff > 0, isNeg = diff < 0;
    const arrow = isPos ? '↑' : isNeg ? '↓' : '→';
    const color = isPos ? 'var(--green)' : isNeg ? 'var(--red,#e05050)' : 'var(--text3)';
    const sign  = isPos ? '+' : '';
    const cel   = isPos && diff >= 5 ? ' 🎉' : '';
    return threshHtml
      + `<span style="color:${color};font-weight:700;font-size:1.05rem">${arrow} ${sign}${diff}g${cel}</span>`
      + `<span style="color:var(--text3);font-size:.75rem;margin-left:6px">（前回 ${prev}g）</span>`;
  }

  // ── 初期化（1回だけ） ─────────────────────────────────────────
  _applyModePreset(_mode);
  _loadEntityDefaults();

  function render() {
    // ── 再描画前に入力中の値・スクロール位置を保存 ────────────────
    const _savedWeight = (document.getElementById('gr-weight')?.value || '').trim();
    const _savedDate   = (document.getElementById('gr-date')?.value   || '').trim();
    const _savedScroll = window.scrollY || document.documentElement.scrollTop || 0;

    const isLot = (targetType === 'LOT');  // シンプルに直接評価

    const { age, stage, sex, count, lineDisp } = _getEntityInfo();
    const prev      = _getPrevRecord();
    const prevWeight= prev ? +prev.weight_g : null;
    const prevDate  = prev?.record_date || '';
    const today     = new Date().toISOString().split('T')[0];

    const stageDispMap = { L1L2:'L1L2', L3:'L3', PREPUPA:'前蛹', PUPA:'蛹', ADULT_PRE:'未後食', ADULT:'活動中' };
    const stageDisp = stageDispMap[stage] || stage || '—';

    const backFn = targetId
      ? (isLot ? `routeTo('lot-detail',{lotId:'${targetId}'})`
                : `routeTo('ind-detail',{indId:'${targetId}'})`)
      : `Store.back()`;

    // ── 区分ボタン HTML（LOT専用） ─────────────────────────────
    function sizeCatButtonsHtml() {
      return '<div style="display:flex;gap:6px">'
        + ['大','中','小','—'].map(function(val) {
            const on = val === '—' ? !_selSizeCat : (_selSizeCat || '').split(',').map(s => s.trim()).includes(val);
            return '<button type="button"'
              + ' style="flex:1;min-height:52px;min-width:60px;border-radius:10px;font-size:.95rem;font-weight:700;cursor:pointer;'
              + 'border:1px solid ' + (on ? 'var(--green)' : 'var(--border)') + ';'
              + 'background:' + (on ? 'var(--green)' : 'var(--surface2)') + ';'
              + 'color:' + (on ? '#fff' : 'var(--text2)') + '"'
              + ' onclick="Pages._grSelSizeCat(\'' + val + '\')">' + val + '</button>';
          }).join('')
        + '<input type="hidden" id="gr-size-cat" value="' + (_selSizeCat || '') + '"></div>';
    }

    main.innerHTML = `
      ${UI.header('成長記録', { back: true, backFn: backFn })}
      <div class="page-body has-quick-bar">

        ${!targetId ? `
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
            <div class="quick-info-id" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${displayId}</div>
            <div style="display:flex;gap:5px;align-items:center;margin-top:4px;flex-wrap:wrap">
              <span style="background:rgba(76,175,120,.15);color:var(--green);font-size:.68rem;padding:1px 6px;border-radius:99px;font-weight:600">${stageDisp}</span>
              ${isLot ? `<span style="font-size:.7rem;color:var(--text3)">${count}頭</span>` : `<span style="font-size:.8rem;font-weight:700;color:${sex==='♂'?'var(--male,#5ba8e8)':sex==='♀'?'var(--female,#f06292)':'var(--text3)'}">${sex}</span>`}
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
            `<button class="btn btn-sm ${_mode===k ? 'btn-primary' : 'btn-ghost'}" style="flex:1;font-size:.78rem;padding:10px 4px"
              onclick="Pages._grSetMode('${k}')">${p.label}</button>`
          ).join('')}
        </div>` : ''}

        <!-- ③ 体重入力 -->
        <div class="card" style="border-color:rgba(76,175,120,.35);padding:14px 10px">
          <div style="text-align:center;font-size:.72rem;font-weight:700;color:var(--text3);letter-spacing:.08em;margin-bottom:10px">体重 (g)</div>
          <div style="display:flex;align-items:stretch;gap:2px;margin-bottom:8px;width:100%;box-sizing:border-box">
            <button class="btn btn-ghost" style="width:42px;min-width:42px;max-width:42px;min-height:52px;font-size:.78rem;font-weight:700;border-radius:8px;padding:0;flex-shrink:0"
              id="gr-adj-m10" data-delta="-10">−10</button>
            <button class="btn btn-ghost" style="width:36px;min-width:36px;max-width:36px;min-height:52px;font-size:.78rem;font-weight:700;border-radius:8px;padding:0;flex-shrink:0"
              id="gr-adj-m1" data-delta="-1">−1</button>
            <input id="gr-weight" type="number" inputmode="decimal" step="0.1" min="0" max="999.9"
              placeholder="0.0" autocomplete="off"
              style="flex:1;min-width:0;font-size:2.1rem;font-weight:700;text-align:center;
                border:2px solid var(--gold);border-radius:10px;padding:8px 0;
                background:var(--bg2);color:var(--green);box-sizing:border-box"
              oninput="Pages._grLiveUpdate(this.value,${prevWeight},'${prevDate}')">
            <button class="btn btn-ghost" style="width:36px;min-width:36px;max-width:36px;min-height:52px;font-size:.78rem;font-weight:700;border-radius:8px;padding:0;flex-shrink:0"
              id="gr-adj-p1" data-delta="1">+1</button>
            <button class="btn btn-ghost" style="width:42px;min-width:42px;max-width:42px;min-height:52px;font-size:.78rem;font-weight:700;border-radius:8px;padding:0;flex-shrink:0"
              id="gr-adj-p10" data-delta="10">+10</button>
          </div>
          <div style="text-align:center;font-size:.78rem;color:var(--text3);margin-bottom:6px">g</div>
          <div id="gr-delta" style="text-align:center;min-height:28px;font-size:.9rem;transition:all .15s">
            ${prevWeight !== null
              ? `<span style="color:var(--text3)">前回 <b>${prevWeight}g</b>（${prevDate}）から —</span>`
              : `<span style="color:var(--text3)">（前回体重なし・初回記録）</span>`}
          </div>
        </div>

        <!-- ④ 写真・AI解析 -->
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

        <!-- ⑤ 入力パネル -->
        <div class="card">
          <div class="form-section">

            <div class="field">
              <label class="field-label" style="font-size:.72rem;color:var(--text3);font-weight:700">記録日</label>
              <input id="gr-date" type="date" class="input" value="${today}" max="${today}">
            </div>

            <div class="field">
              <label class="field-label" style="font-size:.72rem;color:var(--text3);font-weight:700">区分</label>
              ${sizeCatButtonsHtml()}
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

            <!-- 🍄 モルト入り（マット直下・常時表示） -->
            <div class="field">
              <label style="display:flex;align-items:center;gap:12px;cursor:pointer;
                padding:12px;background:var(--surface2);border-radius:var(--radius-sm);
                border:1px solid var(--border)">
                <input type="checkbox" id="gr-malt" style="width:20px;height:20px;cursor:pointer;flex-shrink:0"
                  ${_hasMalt ? 'checked' : ''} onchange="Pages._grToggleMalt(this.checked)">
                <span style="font-size:.92rem;font-weight:600">🍄 モルト入り</span>
              </label>
            </div>

            <div class="field">
              <label class="field-label" style="font-size:.72rem;color:var(--text3);font-weight:700">
                ステージ（幼虫〜前蛹）
              </label>
              ${_grBtnGroup('gr-stage',
                [{val:'L1L2',label:'L1L2'},{val:'L3',label:'L3'},{val:'PREPUPA',label:'前蛹'}],
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

    // ── 保存した値・スクロール位置を復元 ─────────────────────────
    (function() {
      if (_savedWeight) {
        var _wEl = document.getElementById('gr-weight');
        if (_wEl) {
          _wEl.value = _savedWeight;
          Pages._grLiveUpdate(_savedWeight, prevWeight, prevDate);
        }
      }
      if (_savedDate) {
        var _dEl = document.getElementById('gr-date');
        if (_dEl) _dEl.value = _savedDate;
      }
      // スクロール位置を復元（区分/容器ボタン押下時の先頭戻り防止）
      if (_savedScroll > 10) {
        requestAnimationFrame(function() {
          window.scrollTo(0, _savedScroll);
        });
      }
    })();

    // ── ±ボタン: pointerdown/pointerup のみ（click廃止で二重発火防止） ──
    ['gr-adj-m10','gr-adj-m1','gr-adj-p1','gr-adj-p10'].forEach(function(btnId) {
      var btn = document.getElementById(btnId);
      if (!btn) return;
      var delta = parseFloat(btn.getAttribute('data-delta'));
      btn.addEventListener('pointerdown', function(e) {
        e.preventDefault();  // click イベントを発生させない
        Pages._grAdjWeight(delta);
        Pages._grAdjStart(delta);
      });
      btn.addEventListener('pointerup',    function() { Pages._grAdjStop(); });
      btn.addEventListener('pointerleave', function() { Pages._grAdjStop(); });
      btn.addEventListener('pointercancel',function() { Pages._grAdjStop(); });
    });

    // ── 戻るボタン ────────────────────────────────────────────────
    var backBtn = document.getElementById('gr-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        if (!targetId) { Store.back(); return; }
        isLot ? routeTo('lot-detail', { lotId: targetId })
               : routeTo('ind-detail', { indId: targetId });
      });
    }

    if (targetId) {
      setTimeout(function() { var w = document.getElementById('gr-weight'); if (w) w.focus(); }, 150);
      Pages._grLoadHistory(targetType, targetId);
    }
  }

  // ── モード切替 ────────────────────────────────────────────────
  Pages._grSetMode = function(mode) {
    var w = document.getElementById('gr-weight')?.value;
    var d = document.getElementById('gr-date')?.value;
    _mode = mode;
    _applyModePreset(mode);
    render();
    if (w) setTimeout(function() { var e = document.getElementById('gr-weight'); if (e) e.value = w; }, 0);
    if (d) setTimeout(function() { var e = document.getElementById('gr-date');   if (e) e.value = d; }, 0);
  };

  // ── 対象選択 ─────────────────────────────────────────────────
  Pages._grSetType = function(type) {
    targetType = type; targetId = ''; displayId = '';
    _selStage = ''; _selContainer = ''; _selMat = ''; _selExchange = ''; _selSizeCat = '';
    render();
  };
  Pages._grTargetChange = function(id, type) {
    targetId = id; targetType = type;
    _selStage = ''; _selContainer = ''; _selMat = ''; _selExchange = ''; _selSizeCat = '';
    _applyModePreset(_mode);
    _loadEntityDefaults();
    var obj = type === 'IND' ? Store.getIndividual(id) : Store.getLot(id);
    displayId = obj?.display_id || id;
    render();
  };

  // ── ボタン選択 ───────────────────────────────────────────────
  Pages._grSelContainer = function(v) { _selContainer = v; render(); };
  Pages._grSelExchange  = function(v) { _selExchange  = v; render(); };
  Pages._grSelMat       = function(v) { _selMat       = v; render(); };
  Pages._grSelStage     = function(v) { _selStage     = v; render(); };
  Pages._grToggleMalt   = function(checked) { _hasMalt = checked; };
  Pages._grSelSizeCat   = function(v) {
    if (v === '—') { _selSizeCat = ''; }
    else {
      var cats = (_selSizeCat || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
      var idx = cats.indexOf(v);
      if (idx >= 0) cats.splice(idx, 1); else cats.push(v);
      _selSizeCat = cats.join(',');
    }
    render();
  };

  // ── ±ボタン実装（pointerdown から呼ばれる） ──────────────────
  var _adjTimer = null;
  Pages._grAdjWeight = function(delta) {
    var el = document.getElementById('gr-weight');
    if (!el) return;
    var cur  = parseFloat(el.value) || 0;
    var next = Math.max(0, Math.round((cur + delta) * 10) / 10);
    el.value = next;
    Pages._grLiveUpdate(String(next), _grPrevWeightCache, _grPrevDateCache || '');
  };
  Pages._grAdjStart = function(delta) {
    // 既存タイマーをクリア（二重起動防止）
    if (_adjTimer) { clearInterval(_adjTimer); _adjTimer = null; }
    // 長押し：500ms 待ってから 150ms ごとに連続加算
    _adjTimer = setTimeout(function() {
      _adjTimer = setInterval(function() { Pages._grAdjWeight(delta); }, 150);
    }, 500);
  };
  Pages._grAdjStop = function() {
    if (_adjTimer) { clearInterval(_adjTimer); clearTimeout(_adjTimer); _adjTimer = null; }
  };

  // ── リアルタイム前回比 ────────────────────────────────────────
  var _grPrevWeightCache = null;
  var _grPrevDateCache   = null;
  var _initPrev = _getPrevRecord();
  _grPrevWeightCache = _initPrev ? +_initPrev.weight_g : null;

  Pages._grLiveUpdate = function(val, prev, prevDateStr) {
    var el = document.getElementById('gr-delta');
    if (!el) return;
    var cur = parseFloat(val);
    if (!val || isNaN(cur) || cur <= 0) {
      el.innerHTML = prev !== null
        ? '<span style="color:var(--text3)">前回 <b>' + prev + 'g</b> から —</span>'
        : '<span style="color:var(--text3)">（初回記録）</span>';
      return;
    }
    var html = _deltaHtml(cur, prev);
    // ── 1日あたり増加量を計算 ──
    if (prev !== null && prevDateStr) {
      try {
        var _grDateEl = document.getElementById('gr-date');
        var _curDateStr = _grDateEl ? _grDateEl.value : '';
        if (!_curDateStr) _curDateStr = new Date().toISOString().split('T')[0];
        var _pd = new Date(prevDateStr.replace(/\//g, '-'));
        var _cd = new Date(_curDateStr.replace(/\//g, '-'));
        var _days = Math.round((_cd - _pd) / 86400000);
        if (_days > 0) {
          var _diff = Math.round((cur - prev) * 10) / 10;
          var _perDay = Math.round(_diff / _days * 10) / 10;
          var _pdColor = _perDay >= 0.5 ? 'var(--green)' : _perDay < 0 ? 'var(--red,#e05050)' : 'var(--text3)';
          html += '<div style="font-size:.75rem;color:' + _pdColor + ';margin-top:4px">'
            + _days + '日間 → <b>' + (_perDay >= 0 ? '+' : '') + _perDay + 'g/日</b></div>';
        }
      } catch(_e) {}
    }
    el.innerHTML = html;
  };

  // ── 写真選択 ─────────────────────────────────────────────────
  Pages._grPhotoSelected = async function(input) {
    var file = input.files[0];
    if (!file) return;
    var area     = document.getElementById('photo-area');
    var resultEl = document.getElementById('gr-ai-result');
    try {
      var compressed = await compressImageToBase64(file);
      _photoB64  = compressed.base64;
      _photoMime = compressed.mimeType;
      area.innerHTML = '<img src="' + compressed.dataUrl + '" class="photo-preview">';
      var key = Store.getSetting('gemini_key') || CONFIG.GEMINI_KEY;
      if (key) {
        resultEl.innerHTML = '<div style="font-size:.8rem;color:var(--text3)">🤖 AI解析中...</div>';
        try {
          _aiResult = await API.gemini.analyzeImage(_photoB64, _photoMime, 'scale');
          if (_aiResult) {
            if (_aiResult.weight) {
              var wEl = document.getElementById('gr-weight');
              if (wEl) { wEl.value = _aiResult.weight; Pages._grLiveUpdate(_aiResult.weight, _grPrevWeightCache); }
            }
            if (_aiResult.larva_analysis?.comment) {
              var cEl = document.getElementById('gr-ai-comment'); if (cEl) cEl.value = _aiResult.larva_analysis.comment;
            }
            resultEl.innerHTML = '<div style="background:rgba(76,175,120,.1);border:1px solid rgba(76,175,120,.3);border-radius:6px;padding:8px;font-size:.78rem">✅ AI解析完了: ' + (_aiResult.weight ? _aiResult.weight + 'g' : '') + (_aiResult.larva_analysis?.health ? ' / ' + _aiResult.larva_analysis.health : '') + '</div>';
          }
        } catch (e) {
          resultEl.innerHTML = '<div style="font-size:.78rem;color:var(--amber)">⚠️ AI解析失敗 (' + e.message.slice(0,40) + ')</div>';
        }
      }
    } catch (e) { UI.toast('画像の読み込みに失敗しました', 'error'); }
  };

  // ── 記録履歴 ─────────────────────────────────────────────────
  Pages._grLoadHistory = async function(type, id) {
    var el = document.getElementById('gr-history');
    if (!el) return;
    var cached = Store.getGrowthRecords(id);
    if (cached) el.innerHTML = UI.weightTable(cached);
    try {
      var res = await API.growth.list(type, id);
      Store.setGrowthRecords(id, res.records);
      el.innerHTML = UI.weightTable(res.records);
    } catch (e) { if (!cached) el.innerHTML = UI.empty('履歴取得失敗'); }
  };

  // ── 頭数減耗 ─────────────────────────────────────────────────
  Pages._grCalcAttrition = function() {
    var before = parseInt(document.getElementById('gr-before-count')?.value || '');
    var after  = parseInt(document.getElementById('gr-after-count')?.value  || '');
    var el = document.getElementById('gr-attrition-display');
    if (!el) return;
    if (!isNaN(before) && !isNaN(after)) {
      var diff = before - after;
      el.textContent = diff > 0 ? '減耗 ' + diff + ' 頭' : diff === 0 ? '変化なし' : '⚠️ 後が多い(' + Math.abs(diff) + '頭増)';
      el.style.color = diff > 0 ? 'var(--red)' : diff === 0 ? 'var(--text3)' : 'var(--amber)';
    } else { el.textContent = ''; }
  };

  // ── 保存 ──────────────────────────────────────────────────────
  Pages._grSave = async function(type, id) {
    if (!id) { UI.toast('対象を選択してください', 'error'); return; }
    var weight = document.getElementById('gr-weight')?.value;
    if (!weight || parseFloat(weight) <= 0) { UI.toast('体重を入力してください（0.1g以上）', 'error'); return; }

    var stage     = document.getElementById('gr-stage')?.value     || _selStage     || '';
    var container = document.getElementById('gr-container')?.value || _selContainer || '';
    var exchange  = document.getElementById('gr-exchange')?.value  || _selExchange  || '';
    var mat       = document.getElementById('gr-mat')?.value       || _selMat       || '';
    var sizeCat   = document.getElementById('gr-size-cat')?.value  || _selSizeCat   || '';
    var headW     = document.getElementById('gr-headwidth')?.value || '';
    var recDate   = (document.getElementById('gr-date')?.value || '').replace(/-/g, '/');
    var aiCmt     = document.getElementById('gr-ai-comment')?.value || '';
    var hasMalt   = document.getElementById('gr-malt')?.checked || _hasMalt || false;
    var beforeCount = document.getElementById('gr-before-count')?.value;
    var afterCount  = document.getElementById('gr-after-count')?.value;

    var payload = {
      target_type:   type,
      target_id:     id,
      stage:         stage     || undefined,
      weight_g:      weight,
      head_width_mm: headW     || undefined,
      container:     container || undefined,
      mat_type:      mat       || undefined,
      has_malt:      hasMalt,
      exchange_type: exchange  || undefined,
      size_category: sizeCat   || undefined,
      before_count:  beforeCount !== '' && beforeCount !== undefined && beforeCount !== null ? parseInt(beforeCount) : undefined,
      after_count:   afterCount  !== '' && afterCount  !== undefined && afterCount  !== null ? parseInt(afterCount)  : undefined,
      note_private:  aiCmt     || undefined,
      record_date:   recDate,
    };

    if (_photoB64) {
      var obj2  = type === 'IND' ? Store.getIndividual(id) : Store.getLot(id);
      var line2 = obj2 ? Store.getLine(obj2.line_id) : null;
      if (line2) {
        try {
          var today2 = new Date().toISOString().split('T')[0].replace(/-/g,'/');
          var up = await API.drive.uploadPhoto({ base64: _photoB64, mime_type: _photoMime,
            filename: (displayId||id) + '_' + today2 + '.jpg',
            line_display_id: line2.display_id, folder_type: 'GROWTH' });
          payload.photo_url = up.url;
        } catch (e) { UI.toast('写真アップロード失敗（記録は保存します）', 'info'); }
      }
    }

    var btn = document.getElementById('gr-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 保存中...'; }

    try {
      var res = await apiCall(function() { return API.growth.create(payload); }, '記録しました ✅');
      Store.addGrowthRecord(id, Object.assign({}, payload, { record_id: res.record_id, age_days: res.age_days }));
      if (type === 'IND') Store.patchDBItem('individuals', 'ind_id', id, { latest_weight_g: weight, current_stage: stage });
      if (type === 'LOT') {
        var lu = {};
        if (stage) lu.stage = stage;
        if (payload.after_count !== undefined) { lu.count = payload.after_count; if (payload.after_count === 0) lu.status = 'individualized'; }
        if (Object.keys(lu).length) Store.patchDBItem('lots', 'lot_id', id, lu);
      }
      var wEl = document.getElementById('gr-weight'); if (wEl) wEl.value = '';
      _photoB64 = null; _aiResult = null; _hasMalt = false;
      var cached = Store.getGrowthRecords(id);
      var histEl = document.getElementById('gr-history');
      if (histEl && cached) histEl.innerHTML = UI.weightTable(cached);
      if (btn) { btn.disabled = false; btn.textContent = '💾 保存して次へ'; }
      if (_fromQR) {
        // QR記録モードから来た場合: 再スキャンへ（次の対象を読める状態）
        setTimeout(function() { routeTo('qr-scan', { mode: 'weight', autoCamera: true }); }, 800);
      } else if (type === 'LOT') {
        _grShowNextLotBar(id);
      } else {
        setTimeout(function() { var w = document.getElementById('gr-weight'); if (w) w.focus(); }, 200);
      }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '💾 保存して次へ'; }
    }
  };

  render();
};

// ── 次のロット連続入力バー ──────────────────────────────────────
function _grShowNextLotBar(currentLotId) {
  document.getElementById('gr-next-lot-bar')?.remove();
  var currentLot = Store.getLot(currentLotId);
  if (!currentLot) return;
  var sameLine  = Store.filterLots({ line_id: currentLot.line_id, status: 'active' }).filter(function(l){ return l.lot_id !== currentLotId; });
  var allActive = Store.filterLots({ status: 'active' }).filter(function(l){ return l.lot_id !== currentLotId; });
  var candidates = sameLine.length ? sameLine : allActive.slice(0, 8);
  if (!candidates.length) return;
  var bar = document.createElement('div');
  bar.id = 'gr-next-lot-bar'; bar.className = 'next-lot-bar';
  var labelEl = document.createElement('div');
  labelEl.style.cssText = 'font-size:.72rem;color:var(--text3);margin-bottom:6px;font-weight:700';
  labelEl.textContent = '📦 次のロットへ（同ライン）';
  bar.appendChild(labelEl);
  var scrollEl = document.createElement('div');
  scrollEl.className = 'next-lot-scroll';
  candidates.slice(0, 6).forEach(function(l) {
    var ln = Store.getLine(l.line_id);
    var code = ln ? (ln.line_code || ln.display_id) : l.display_id;
    var btn = document.createElement('button');
    btn.className = 'next-lot-btn';
    btn.innerHTML = '<span style="color:var(--gold);font-weight:700">' + code + '</span><span style="color:var(--text3);margin-left:4px">' + l.count + '頭</span>';
    btn.onclick = (function(lotId, lotDisplayId) {
      return function() {
        document.getElementById('gr-next-lot-bar')?.remove();
        routeTo('growth-rec', { targetType:'LOT', targetId:lotId, displayId:lotDisplayId });
      };
    })(l.lot_id, l.display_id);
    scrollEl.appendChild(btn);
  });
  var closeBtn = document.createElement('button');
  closeBtn.className = 'next-lot-btn'; closeBtn.style.color = 'var(--text3)'; closeBtn.textContent = '✕ 閉じる';
  closeBtn.onclick = function() { document.getElementById('gr-next-lot-bar')?.remove(); };
  scrollEl.appendChild(closeBtn);
  bar.appendChild(scrollEl);
  document.body.appendChild(bar);
}

// ── 成長記録編集モーダル ─────────────────────────────────────────
Pages._grEditRecord = async function(recordId) {
  var rec = null;
  var gm = Store.getDB('growthMap') || {};
  for (var recs of Object.values(gm)) {
    var found = (recs || []).find(function(r){ return r.record_id === recordId; });
    if (found) { rec = found; break; }
  }
  var initDate   = rec ? String(rec.record_date || '').replace(/\//g, '-') : '';
  var initWeight = rec ? (rec.weight_g  || '') : '';
  var initStage  = rec ? (rec.stage     || '') : '';
  var initCont   = rec ? (rec.container || '') : '';
  var initMat    = rec ? (rec.mat_type  || '') : '';
  var initExch   = rec ? (rec.exchange_type || '') : '';
  var initNote   = rec ? (rec.note_private  || '') : '';
  var STAGE_OPTS = ['L1L2','L3','PREPUPA'].map(function(s){ return '<option value="' + s + '" ' + (initStage===s?'selected':'') + '>' + s + '</option>'; }).join('');
  UI.modal(`
    <div class="modal-title">成長記録を編集</div>
    <div class="form-section" style="max-height:60vh;overflow-y:auto">
      ${UI.field('記録日', '<input type="date" id="gre-date" class="input" value="' + initDate + '">')}
      ${UI.field('体重(g)', '<input type="number" id="gre-weight" class="input" step="0.1" value="' + initWeight + '" placeholder="例: 45.2">')}
      <div class="form-row-2">
        ${UI.field('ステージ', '<select id="gre-stage" class="input"><option value="">—</option>' + STAGE_OPTS + '</select>')}
        ${UI.field('容器', '<select id="gre-cont" class="input"><option value="">—</option>' + ['1.8L','2.7L','4.8L'].map(function(v){ return '<option value="' + v + '" ' + (initCont===v?'selected':'') + '>' + v + '</option>'; }).join('') + '</select>')}
      </div>
      <div class="form-row-2">
        ${UI.field('マット', '<select id="gre-mat" class="input"><option value="">—</option>' + ['T1','T2','T3'].map(function(v){ return '<option value="' + v + '" ' + (initMat===v?'selected':'') + '>' + v + '</option>'; }).join('') + '</select>')}
        ${UI.field('交換区分', '<select id="gre-exch" class="input"><option value="">—</option><option value="FULL" ' + (initExch==='FULL'?'selected':'') + '>全交換</option><option value="PARTIAL" ' + (initExch==='PARTIAL'?'selected':'') + '>追加のみ</option></select>')}
      </div>
      ${UI.field('メモ', '<input type="text" id="gre-note" class="input" value="' + initNote + '" placeholder="任意">')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._grSaveEdit('${recordId}')">更新</button>
    </div>
  `);
};

Pages._grSaveEdit = async function(recordId) {
  var date   = (document.getElementById('gre-date')?.value   || '').replace(/-/g, '/');
  var weight = document.getElementById('gre-weight')?.value   || '';
  var stage  = document.getElementById('gre-stage')?.value    || '';
  var cont   = document.getElementById('gre-cont')?.value     || '';
  var mat    = document.getElementById('gre-mat')?.value      || '';
  var exch   = document.getElementById('gre-exch')?.value     || '';
  var note   = document.getElementById('gre-note')?.value     || '';
  if (!weight) { UI.toast('体重を入力してください', 'error'); return; }
  var payload = { record_id: recordId, record_date: date, weight_g: weight, stage: stage, container: cont, mat_type: mat, exchange_type: exch, note_private: note };
  try {
    UI.loading(true); UI.closeModal();
    await apiCall(function(){ return API.growth.update(payload); }, '成長記録を更新しました');
    var gm = Store.getDB('growthMap') || {};
    for (var entries = Object.entries(gm), i = 0; i < entries.length; i++) {
      var tid = entries[i][0], recs = entries[i][1];
      var idx = (recs || []).findIndex(function(r){ return r.record_id === recordId; });
      if (idx >= 0) { Object.assign(recs[idx], payload); Store.setGrowthRecords(tid, recs); var h = document.getElementById('gr-history'); if (h) h.innerHTML = UI.weightTable(recs); break; }
    }
  } catch (e) { UI.toast('更新失敗: ' + e.message, 'error'); }
  finally { UI.loading(false); }
};

window.PAGES = window.PAGES || {};
window.PAGES['growth-rec'] = function() { Pages.growthRecord(Store.getParams()); };
