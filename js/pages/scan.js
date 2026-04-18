// FILE: js/pages/scan.js
// build: 20260418i
// 変更点(20260417k-fix1→20260418i):
//   - [Pages._qrSwitchMode] 継続読取りタブを押したら即座に
//     routeTo('continuous-scan') で AI読取モードに遷移するよう修正
//     （handover_20260413be.md の設計に復帰）
//   - 情報確認 / 移行編成 タブは従来通り qr-scan 画面内でモード切替
//
// 以前の変更点(20260417k-fix1):
//   - continuous-scan への誘導を修正
//   - BU（UNIT）タイプのQRスキャン時に適切にcontinuous-scanにルーティング
// ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// scan.js — QRスキャン + 差分入力 + 成長記録  v3.2
//
// v3.2 高速化改善:
//   - 毎フレームスキャン（3フレームに1回→毎フレーム）
//   - カメラ解像度を720pに最適化（1920→720）
//   - 中央スキャン枠内のみをjsQRに渡す（処理量を約1/10に削減）
//   - inversionAttempts: 'dontInvert'（白地黒文字専用・高速化）
//   - スキャン枠を拡大（200px→240px）
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// QRスキャン画面 (qr-scan)
// ════════════════════════════════════════════════════════════════
Pages.qrScan = function (params = {}) {
  const main = document.getElementById('main');
  const _modeMap = { 'view':'confirm','weight':'record','diff':'record','t1':'transition','t2':'transition','t3':'transition','t1_add':'transition' };
  let _scanMode = _modeMap[params.mode] || params.mode || 'confirm';
  if (!['confirm','transition','record'].includes(_scanMode)) _scanMode = 'confirm';
  window._qrTransMode = (params.mode === 't2') ? 't2' : (params.mode === 't3') ? 't3' : 't1';
  window._qrAddingToSession = (params.mode === 't1_add');
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
            <!-- スキャン枠（240px×240px に拡大） -->
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
              <div id="scan-frame" style="width:240px;height:240px;border:3px solid var(--green);border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,0.5)"></div>
            </div>
            <!-- スキャン中アニメ -->
            <div id="scan-line" style="position:absolute;left:calc(50% - 120px);top:calc(50% - 120px);width:240px;height:3px;background:var(--green);opacity:.8;animation:scanLine 1.5s infinite linear"></div>
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

    // CSSアニメーション注入（1.5sに短縮）
    if (!document.getElementById('scan-anim-style')) {
      const st = document.createElement('style');
      st.id = 'scan-anim-style';
      st.textContent = '@keyframes scanLine{0%{top:calc(50% - 120px)}50%{top:calc(50% + 117px)}100%{top:calc(50% - 120px)}}';
      document.head.appendChild(st);
    }

    setTimeout(() => Pages._qrRenderHistory(), 50);
  }

  Pages._qrSwitchMode = function(m) {
    // [20260418i] 継続読取りタブは AI読取モード (continuous-scan) に直接遷移
    // 過去の handover_20260413be.md の設計に戻す変更。
    // confirm / transition タブは qr-scan 画面のまま従来通りモード切替のみ。
    if (m === 'record') {
      routeTo('continuous-scan');
      return;
    }
    _scanMode = m;
    window._qrScanMode = m;
    window._qrAddingToSession = false;
    render();
  };
  Pages._qrSetTransMode = function(m) {
    window._qrTransMode = m;
    render();
  };
  render();

  if (params.autoCamera) {
    setTimeout(() => Pages._qrStartCamera(), 300);
  }
};


// ════════════════════════════════════════════════════════════════
// QR スキャン ヘルパー群
// ════════════════════════════════════════════════════════════════

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

function _qrNavigate(mode, res, qrText) {
  function _extractIdFromQr(prefix) {
    var raw = (qrText || '').trim();
    if (raw.toUpperCase().startsWith(prefix.toUpperCase() + ':')) {
      return raw.slice(prefix.length + 1).trim();
    }
    return '';
  }

  console.log('[QR] navigate mode:', mode, '/ entity_type:', res.entity_type,
    '/ entity:', !!(res.entity), '/ qrText:', qrText);

  if (mode === 'transition') {
    var ent = res.entity || {};
    var sub = window._qrTransMode || 't1';

    if (window._qrAddingToSession) {
      var _addLotId = ent.lot_id || _extractIdFromQr('LOT');
      var ok = Pages._t1TryAddLot && Pages._t1TryAddLot(_addLotId);
      if (!ok) routeTo('qr-scan', { mode: 't1_add' });
      return;
    }

    if (sub === 't1') {
      if (res.entity_type === 'LOT') {
        var _lotId = ent.lot_id || _extractIdFromQr('LOT');
        if (_lotId) {
          Pages.t1SessionStart(_lotId);
        } else {
          UI.toast('ロットIDが取得できませんでした', 'error');
        }
      } else if (res.entity_type === 'BU') {
        UI.toast('T1移行編成モードでは、T0ロットのQRコードを読み取ってください', 'info', 3000);
      } else {
        UI.toast('T1移行: ロット（LOT:）のQRコードを読んでください', 'info', 2500);
      }
    } else if (sub === 't2') {
      if (res.entity_type === 'BU') {
        var _buIdT2 = ent.display_id || ent.unit_id || _extractIdFromQr('BU');
        if (_buIdT2 && Pages.t2SessionStart) {
          Pages.t2SessionStart(_buIdT2);
        } else if (!_buIdT2) {
          UI.toast('BUのIDが取得できませんでした。QRコードを確認してください', 'error', 3000);
        } else {
          UI.toast('T2移行セッションが利用できません', 'error');
        }
      } else if (res.entity_type === 'IND') {
        var _indIdT2 = ent.ind_id || ent.display_id || _extractIdFromQr('IND');
        if (_indIdT2 && Pages.t2SessionStartFromInd) {
          Pages.t2SessionStartFromInd(_indIdT2);
        } else {
          UI.toast('T2移行: 個体または BUラベルを読み取ってください', 'error', 3000);
        }
      } else if (res.entity_type === 'LOT') {
        UI.toast('T2移行は BU（飼育ユニット）または個体(IND)のQRを読んでください', 'error', 3000);
      } else {
        UI.toast('T2移行: BU/INDラベルを読み取ってください', 'error', 3000);
      }
    } else if (sub === 't3') {
      if (res.entity_type === 'BU') {
        var _buIdT3 = ent.display_id || ent.unit_id || _extractIdFromQr('BU');
        if (_buIdT3 && Pages.t3SessionStart) {
          Pages.t3SessionStart(_buIdT3);
        } else if (!_buIdT3) {
          UI.toast('BUのIDが取得できませんでした。QRコードを確認してください', 'error', 3000);
        } else {
          UI.toast('T3移行セッションが利用できません', 'error');
        }
      } else if (res.entity_type === 'IND') {
        var _indIdT3 = ent.ind_id || ent.display_id || _extractIdFromQr('IND');
        if (_indIdT3 && Pages.t3SessionStartFromInd) {
          Pages.t3SessionStartFromInd(_indIdT3);
        } else {
          UI.toast('T3移行: 個体または BUラベルを読み取ってください', 'error', 3000);
        }
      } else if (res.entity_type === 'LOT') {
        UI.toast('T3移行は BU（飼育ユニット）または個体(IND)のQRを読んでください', 'error', 3000);
      } else {
        UI.toast('T3移行: BU/INDラベルを読み取ってください', 'error', 3000);
      }
    } else {
      UI.toast(sub.toUpperCase() + '移行は準備中です', 'info', 2000);
    }

  } else if (mode === 'record') {
    var _ent = res.entity || {};
    var _rawEty = res.entity_type || 'IND';
    var _eid = (_rawEty === 'BU')
      ? (_ent.display_id || _ent.unit_id || _extractIdFromQr('BU') || '')
      : (_ent.ind_id || _ent.lot_id || _ent.unit_id || '');
    
    if (_eid) {
      if (_rawEty === 'BU') {
        // ユニット（BU）の場合は continuous-scan に誘導
        routeTo('continuous-scan', {
          targetType: 'UNIT',
          targetId:   _eid,
          displayId:  _ent.display_id || _eid,
          mode: 'growth'
        });
      } else if (_rawEty === 'IND' || _rawEty === 'LOT') {
        // 個体・ロットの場合は従来の成長記録画面
        routeTo('growth-rec', { 
          targetType: _rawEty, 
          targetId: _eid, 
          displayId: _ent.display_id || _eid, 
          _fromQR: true 
        });
      } else {
        UI.toast('この対象は継続読取りモードに対応していません', 'info', 3000);
      }
    } else {
      UI.toast('対象が特定できませんでした（継続読取りモード）', 'error');
    }

  } else {
    var _ent2 = res.entity || {};
    var eid = _ent2.ind_id || _ent2.lot_id || _ent2.set_id || _ent2.par_id || '';

    if      (res.entity_type === 'IND' && eid) routeTo('ind-detail', { indId: eid });
    else if (res.entity_type === 'LOT' && eid) routeTo('lot-detail', { lotId: eid });
    else if (res.entity_type === 'SET' && eid) routeTo('pairing-detail', { pairingId: eid });
    else if (res.entity_type === 'PAR' && eid) routeTo('parent-detail', { parId: eid });
    else if (res.entity_type === 'BU') {
      var _buDid = (_ent2.display_id && _ent2.display_id !== '' ? _ent2.display_id : null)
                || (_ent2.unit_id && _ent2.unit_id !== '' ? _ent2.unit_id : null)
                || _extractIdFromQr('BU')
                || '';
      if (_buDid) {
        routeTo('unit-detail', { unitDisplayId: _buDid });
      } else {
        UI.toast('BUのIDを特定できませんでした。QR: ' + (qrText || ''), 'error', 4000);
      }
    } else {
      UI.toast('対象が特定できませんでした（タイプ: ' + (res.entity_type || '不明') + '）', 'error');
    }
  }
}

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
    var _buUnits = Store.getDB('breeding_units') || [];
    var _buUnit  = _buUnits.find(function(u){ return u.display_id === id; })
                || _buUnits.find(function(u){ return u.unit_id   === id; });
    if (_buUnit) {
      return { entity_type: 'BU', entity: _buUnit, resolved_id: _buUnit.display_id || _buUnit.unit_id };
    }
    return { entity_type: 'BU', entity: { display_id: id, unit_id: id }, resolved_id: id };
  }

  return null;
}

Pages._qrResolve = async function (overrideMode) {
  const _t0 = performance.now();
  const qrText = document.getElementById('qr-input')?.value?.trim();
  const errEl  = document.getElementById('qr-error');
  const btn    = document.getElementById('qr-resolve-btn');
  if (!qrText) { if (errEl) errEl.textContent = 'QRコードを入力してください'; return; }
  if (errEl) errEl.textContent = '';

  const mode = overrideMode || window._qrScanMode || 'confirm';

  const localRes = _qrLocalResolve(qrText);

  if (localRes) {
    if (btn) { btn.textContent = '📂 画面を開いています...'; }
    Pages._qrSaveHistory(qrText, localRes);
    try {
      _qrNavigate(mode, localRes, qrText);
    } catch (_navErr) {
      if (errEl) errEl.textContent = '❌ 遷移エラー: ' + (_navErr.message || '不明');
    } finally {
      setTimeout(function() {
        if (btn) { btn.disabled = false; btn.textContent = '🔍 読み取り・確認'; }
      }, 600);
    }
    return;
  }

  let _loadingTimer = setTimeout(() => {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 解析中...'; }
  }, 300);
  let _longLoadTimer = setTimeout(() => {
    if (btn) btn.textContent = '⏳ ロット情報を確認中...';
  }, 1200);

  try {
    const res = await API.scan.resolve(qrText);
    Pages._qrSaveHistory(qrText, res);
    _qrNavigate(mode, res, qrText);
  } catch (e) {
    var _errMsg = (e && e.message) ? e.message : 'QR解析に失敗しました';
    if (errEl) errEl.textContent = '❌ ' + _errMsg;
  } finally {
    clearTimeout(_loadingTimer);
    clearTimeout(_longLoadTimer);
    if (btn) { btn.disabled = false; btn.textContent = '🔍 読み取り・確認'; }
  }
};

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

// ── カメラスキャン（高速化版）─────────────────────────────────
Pages._qrStartCamera = async function () {
  if (typeof jsQR === 'undefined') {
    UI.toast('QRライブラリを読み込み中...', 'info', 3000);
    var _retryUrls = [
      'js/vendor/jsQR.min.js',
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
    // ★ 解像度を720pに最適化（1920→720）jsQRの処理を高速化
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1280, min: 640 },
        height: { ideal: 720,  min: 480 },
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

// ★ 高速スキャンループ
Pages._qrScanLoop = function (video) {
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // ★ 中央スキャン枠のサイズ（240px枠に合わせて設定）
  const SCAN_SIZE = 320; // jsQRに渡す正規化サイズ（小さいほど高速）

  const scan = () => {
    if (!video.srcObject) return;

    if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // ★ 中央の正方形領域のみ切り出してjsQRに渡す（処理量を大幅削減）
      const cropSize = Math.min(vw, vh) * 0.7; // 映像の70%中央部分
      const cropX = (vw - cropSize) / 2;
      const cropY = (vh - cropSize) / 2;

      canvas.width  = SCAN_SIZE;
      canvas.height = SCAN_SIZE;
      // 中央領域のみをSCAN_SIZEにリサイズして描画
      ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, SCAN_SIZE, SCAN_SIZE);
      const imageData = ctx.getImageData(0, 0, SCAN_SIZE, SCAN_SIZE);

      // ★ dontInvert: 白地黒文字専用（QRラベルは白地）→ attemptBothより高速
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
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

  const savedMode = window._qrScanMode || 'confirm';

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      // ★ 画像も320pxにリサイズして高速化
      const SIZE = 512;
      canvas.width  = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth', // 画像は両方試す
      });
      if (code && code.data) {
        const qrInput = document.getElementById('qr-input');
        if (qrInput) { qrInput.value = code.data; Pages._qrPreviewInput(code.data); }
        UI.toast('QRコードを読み取りました', 'success');
        Pages._qrResolve(savedMode);
      } else {
        UI.toast('QRコードが見つかりませんでした。鮮明な画像を使用してください', 'error', 4000);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
};

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
            onclick="Pages._qrChoiceSelect(this)">${lbl}</button>`).join('')}
      </div>`;
  }
  if (field === 'size_category') {
    return `
      <div style="display:flex;gap:8px" id="widget-${field}">
        ${[['大','大型（10L）'],['中','中型（4.8L）'],['小','小型（2.7L）']].map(([v, lbl]) => `
          <button class="btn btn-sm btn-ghost diff-choice"
            data-field="${field}" data-value="${v}"
            style="flex:1;${currentVal === v ? 'background:var(--green2);color:#fff;border-color:var(--green2)' : ''}"
            onclick="Pages._qrChoiceSelect(this)">${lbl}</button>`).join('')}
      </div>`;
  }
  if (field === 'hatch_date') {
    return `<input id="widget-hatch_date" class="input" type="date" value="${currentVal || ''}" data-field="hatch_date" style="border-color:rgba(224,144,64,.4)">`;
  }
  if (field === 'count') {
    return `
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="Pages._qrCountAdj(-1)">−</button>
        <input id="widget-count" class="input" type="number" min="0" max="999"
          value="${currentVal || entity?.count || ''}" data-field="count"
          style="text-align:center;font-size:1.3rem;font-weight:700;color:var(--green);font-family:var(--font-mono);border-color:rgba(224,144,64,.4)">
        <span style="color:var(--text3)">頭</span>
        <button class="btn btn-ghost btn-sm" onclick="Pages._qrCountAdj(1)">＋</button>
      </div>`;
  }
  if (field === 'set_start') {
    return `<input id="widget-set_start" class="input" type="date" value="${currentVal || ''}" data-field="set_start">`;
  }
  return `<input id="widget-${field}" class="input" type="text" value="${currentVal || ''}" placeholder="${label}を入力" data-field="${field}">`;
};

Pages._qrChoiceSelect = function (btn) {
  const field = btn.dataset.field;
  document.querySelectorAll(`.diff-choice[data-field="${field}"]`).forEach(b => {
    b.style.background = '';
    b.style.color = '';
    b.style.borderColor = '';
  });
  btn.style.background   = 'var(--green2)';
  btn.style.color        = '#fff';
  btn.style.borderColor  = 'var(--green2)';
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
      ['ロットID', entity.display_id],
      ['ライン', line?.display_id || entity.line_id || '—'],
      ['ステージ', entity.stage || '—'],
      ['孵化日', entity.hatch_date || '（未入力）'],
      ['頭数', entity.count || '（未入力）'],
      ['容器サイズ', entity.container_size || '—'],
      ['性別区分', entity.sex_hint || '（未入力）'],
      ['サイズ区分', entity.size_category || '（未入力）'],
      ['マット種別', entity.mat_type || '—'],
    ];
  } else if (entityType === 'IND') {
    rows = [
      ['個体ID', entity.display_id],
      ['ライン', line?.display_id || entity.line_id || '—'],
      ['性別', entity.sex || '（未入力）'],
      ['孵化日', entity.hatch_date || '（未入力）'],
      ['現ステージ', entity.current_stage || '—'],
      ['最新体重', entity.latest_weight_g ? entity.latest_weight_g + 'g' : '—'],
      ['産地', entity.locality || '—'],
      ['世代', entity.generation || '—'],
    ];
  } else if (entityType === 'SET') {
    rows = [
      ['セットID', entity.display_id],
      ['交尾開始', entity.pairing_start || '—'],
      ['産卵開始', entity.set_start || '（未入力）'],
      ['採卵数', entity.total_eggs ? entity.total_eggs + '個' : '（未入力）'],
      ['孵化数', entity.total_hatch ? entity.total_hatch + '頭' : '—'],
      ['孵化率', entity.hatch_rate ? Math.round(entity.hatch_rate) + '%' : '—'],
      ['ステータス', entity.status || '—'],
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
    let result;
    if (entityType === 'LOT')      result = await API.scan.updateLotFields({ lot_id: entityId, ...updates });
    else if (entityType === 'IND') result = await API.scan.updateIndFields({ ind_id: entityId, ...updates });
    else if (entityType === 'SET') result = await API.scan.updateSetFields({ set_id: entityId, ...updates });

    await Store.syncEntityType(entityType === 'LOT' ? 'lots'
      : entityType === 'IND' ? 'individuals' : 'pairings');

    UI.toast(`✅ 保存しました（${Object.keys(updates).length}件更新）`, 'success');
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
// 体重測定モード
// ════════════════════════════════════════════════════════════════
var WM_THRESHOLDS = [
  { min: 170, badge: '⭐ 超大型候補', color: '#c8a84b', bg: 'rgba(200,168,75,.15)' },
  { min: 150, badge: '🔥 大型候補',   color: 'var(--amber)', bg: 'rgba(224,144,64,.12)' },
];

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

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['qr-scan'] = function () { Pages.qrScan(Store.getParams()); };
