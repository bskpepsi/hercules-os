// ════════════════════════════════════════════════════════════════
// continuous_scan.js — ユニット継続読取り・成長記録（スロット別）
// build: 20260417k
// 
// 機能:
//   - 飼育ユニット（BU）の2頭分体重・容器・マット・交換種別をスロット別に記録
//   - growth_records テーブルに target_type='BU', unit_slot_no=1/2 で保存
//   - T2移行時に個別化される際、スロット別記録が各個体に引き継がれる
// ════════════════════════════════════════════════════════════════
'use strict';

Pages.continuousScan = function (params = {}) {
  const main = document.getElementById('main');
  
  let targetType = params.targetType || 'UNIT';
  let targetId   = params.targetId   || '';
  let displayId  = params.displayId  || '';
  let mode       = params.mode       || 'growth';
  
  if (targetType !== 'UNIT') {
    // 個体の場合は従来の成長記録画面に
    routeTo('growth-rec', { 
      targetType: targetType === 'UNIT' ? 'BU' : targetType, 
      targetId, 
      displayId, 
      _fromQR: true 
    });
    return;
  }

  // ユニット情報取得
  function _getUnitInfo() {
    const unit = Store.getUnitByDisplayId(displayId) 
      || (Store.getDB('breeding_units') || []).find(u => u.unit_id === targetId || u.display_id === displayId);
    if (!unit) return null;
    
    const line = unit.line_id ? Store.getLine(unit.line_id) : null;
    const lineDisp = (() => {
      if (line) return line.line_code || line.display_id || '';
      // フォールバック: "HM2025-A1-U06" → "A1" を抽出
      const dm = (unit.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-/);
      return dm ? dm[1] : (unit.line_id || '—');
    })();
    
    const age = unit.hatch_date ? Store.calcAge(unit.hatch_date) : null;
    
    // メンバー情報解析
    let members = [];
    try {
      const raw = unit.members;
      if (Array.isArray(raw)) {
        members = raw;
      } else if (typeof raw === 'string' && raw.trim()) {
        members = JSON.parse(raw);
      }
    } catch(e) {
      console.warn('[CONTINUOUS] member parsing failed:', e);
    }
    
    const headCount = Math.max(parseInt(unit.head_count, 10) || 2, members.length, 1);
    
    return { unit, line, lineDisp, age, members, headCount };
  }

  // スロット別成長記録取得
  function _getSlotGrowthRecords(unitId) {
    const records = Store.getGrowthRecords ? Store.getGrowthRecords(unitId) : [];
    if (!records) return { slot1: [], slot2: [] };
    
    const slot1 = records.filter(r => r.unit_slot_no == 1).sort((a,b) => 
      String(b.record_date || '').localeCompare(String(a.record_date || '')));
    const slot2 = records.filter(r => r.unit_slot_no == 2).sort((a,b) => 
      String(b.record_date || '').localeCompare(String(a.record_date || '')));
    
    return { slot1, slot2 };
  }

  // 入力状態
  let _sessionData = {
    slot1: {
      weight_g: '',
      size_category: '',
      container: '2.7L',
      mat_type: 'T1',
      exchange_type: 'FULL',
      has_malt: false,
      stage: '',
      memo: ''
    },
    slot2: {
      weight_g: '',
      size_category: '',
      container: '2.7L', 
      mat_type: 'T1',
      exchange_type: 'FULL',
      has_malt: false,
      stage: '',
      memo: ''
    },
    record_date: new Date().toISOString().split('T')[0].replace(/-/g, '/')
  };

  function render() {
    const info = _getUnitInfo();
    if (!info) {
      main.innerHTML = `
        ${UI.header('継続読取り', { back: true })}
        <div class="page-body">
          <div class="card">
            <div style="text-align:center;color:var(--text3);padding:40px 20px">
              ユニット情報が見つかりません<br>
              <span style="font-size:.8rem">ID: ${displayId || targetId}</span>
            </div>
          </div>
        </div>`;
      return;
    }

    const { unit, lineDisp, age, headCount } = info;
    const slotRecords = _getSlotGrowthRecords(unit.unit_id);
    
    const backFn = `routeTo('unit-detail', { unitDisplayId: '${unit.display_id}' })`;

    main.innerHTML = `
      ${UI.header('🔄 継続読取り（ユニット通常交換）', { back: true, backFn: backFn })}
      <div class="page-body" style="padding-bottom:84px">

        <!-- ユニット情報バー -->
        <div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span style="font-weight:700;color:var(--gold);font-family:var(--font-mono);font-size:.9rem">${unit.display_id}</span>
            <span style="background:rgba(91,168,232,.15);color:var(--blue);padding:2px 8px;border-radius:5px;font-size:.72rem;font-weight:700">
              ${unit.stage_phase || 'T1'} 継続記録
            </span>
            <span style="color:var(--text3)">${lineDisp}　${headCount}頭</span>
          </div>
          ${unit.hatch_date ? `<div style="font-size:.72rem;color:var(--text3)">孵化: ${unit.hatch_date}${age ? ` (${age.totalDays}日齢)` : ''}</div>` : ''}
        </div>

        <div style="background:rgba(76,175,120,.07);border:1px solid rgba(76,175,120,.25);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:.76rem;color:var(--text2);line-height:1.6">
          <b>通常のマット交換・体重測定</b>を記録します。<br>
          2頭それぞれの体重・容器・マット・交換種別を入力できます。<br>
          <span style="color:var(--text3)">※ T2移行時に各個体の記録として引き継がれます。</span>
        </div>

        <!-- 記録日 -->
        <div style="background:var(--surface1);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:10px">
          <label style="font-size:.72rem;font-weight:700;color:var(--text3);display:block;margin-bottom:6px">記録日</label>
          <input type="date" id="cs-date" value="${_sessionData.record_date.replace(/\//g, '-')}" 
            style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);font-size:.9rem">
        </div>

        <!-- スロット1 -->
        ${_renderSlotCard(1, _sessionData.slot1, slotRecords.slot1)}
        
        <!-- スロット2 -->
        ${_renderSlotCard(2, _sessionData.slot2, slotRecords.slot2)}

      </div>

      <!-- 保存ボタン -->
      <div class="quick-action-bar">
        <button class="btn btn-ghost" style="flex:1;padding:14px 0" onclick="${backFn}">← 戻る</button>
        <button class="btn btn-gold" style="flex:2;padding:14px 0;font-weight:700" onclick="Pages._csSave()">
          💾 記録を保存
        </button>
      </div>`;

    // 値を復元
    ['slot1', 'slot2'].forEach(slotKey => {
      const slot = _sessionData[slotKey];
      const slotNo = slotKey === 'slot1' ? 1 : 2;
      
      Object.keys(slot).forEach(key => {
        const el = document.getElementById(`cs-${slotNo}-${key}`);
        if (el && slot[key] !== '') {
          if (el.type === 'checkbox') {
            el.checked = slot[key];
          } else {
            el.value = slot[key];
          }
        }
      });
    });
  }

  function _renderSlotCard(slotNo, slotData, records) {
    const prevRecord = records.find(r => r.weight_g && +r.weight_g > 0);
    const prevWeight = prevRecord ? +prevRecord.weight_g : null;
    const prevDate = prevRecord?.record_date || '';

    function _deltaDisplay(current) {
      if (!current || +current <= 0) return '<span style="color:var(--text3)">体重を入力してください</span>';
      if (prevWeight === null) return `<span style="color:var(--green);font-weight:700">📝 初回記録: ${current}g</span>`;
      
      const diff = Math.round((+current - prevWeight) * 10) / 10;
      const isPos = diff > 0, isNeg = diff < 0;
      const arrow = isPos ? '↑' : isNeg ? '↓' : '→';
      const color = isPos ? 'var(--green)' : isNeg ? 'var(--red,#e05050)' : 'var(--text3)';
      const sign = isPos ? '+' : '';
      
      return `<span style="color:${color};font-weight:700">${arrow} ${sign}${diff}g</span>` +
        `<span style="color:var(--text3);font-size:.75rem;margin-left:6px">（前回 ${prevWeight}g）</span>`;
    }

    return `
      <div style="border:1.5px solid rgba(76,175,120,.35);border-radius:12px;background:rgba(76,175,120,.04);margin-bottom:10px;overflow:hidden">
        <div style="background:rgba(76,175,120,.08);padding:10px 14px;border-bottom:1px solid rgba(76,175,120,.2)">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:.95rem;font-weight:800;color:var(--text1)">${slotNo}頭目</span>
            ${prevRecord ? `<span style="font-size:.65rem;color:var(--text3)">前回: ${prevRecord.record_date} ${prevWeight}g</span>` : ''}
          </div>
        </div>
        
        <div style="padding:12px 14px">
          <!-- 体重入力 -->
          <div style="margin-bottom:12px">
            <label style="font-size:.72rem;font-weight:700;color:var(--text3);display:block;margin-bottom:6px">体重 (g)</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" id="cs-${slotNo}-weight_g" inputmode="decimal" step="0.1" min="0" max="999"
                placeholder="0.0" style="flex:1;padding:8px 10px;text-align:center;font-size:1.4rem;font-weight:700;
                border-radius:8px;border:2px solid var(--green);background:var(--bg2);color:var(--text1)"
                oninput="Pages._csUpdateDelta(${slotNo}, this.value)">
              <span style="color:var(--text3);font-weight:600">g</span>
            </div>
            <div id="cs-${slotNo}-delta" style="text-align:center;margin-top:4px;font-size:.8rem;min-height:20px">
              ${_deltaDisplay(slotData.weight_g)}
            </div>
          </div>

          <!-- 区分 -->
          <div style="margin-bottom:12px">
            <label style="font-size:.72rem;font-weight:700;color:var(--text3);display:block;margin-bottom:6px">区分</label>
            <div style="display:flex;gap:6px">
              ${['大', '中', '小'].map(size => `
                <button type="button" onclick="Pages._csSetField(${slotNo}, 'size_category', '${size}')"
                  id="cs-${slotNo}-size-${size}"
                  style="flex:1;padding:8px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
                    border:2px solid var(--border);background:var(--surface2);color:var(--text2)">
                  ${size}
                </button>`).join('')}
            </div>
          </div>

          <!-- 容器 -->
          <div style="margin-bottom:12px">
            <label style="font-size:.72rem;font-weight:700;color:var(--text3);display:block;margin-bottom:6px">容器</label>
            <div style="display:flex;gap:6px">
              ${['1.8L', '2.7L', '4.8L'].map(cont => `
                <button type="button" onclick="Pages._csSetField(${slotNo}, 'container', '${cont}')"
                  id="cs-${slotNo}-container-${cont}"
                  style="flex:1;padding:8px 0;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;
                    border:2px solid ${slotData.container === cont ? 'var(--green)' : 'var(--border)'};
                    background:${slotData.container === cont ? 'rgba(76,175,120,.15)' : 'var(--surface2)'};
                    color:${slotData.container === cont ? 'var(--green)' : 'var(--text2)'}">
                  ${cont}
                </button>`).join('')}
            </div>
          </div>

          <!-- マット -->
          <div style="margin-bottom:12px">
            <label style="font-size:.72rem;font-weight:700;color:var(--text3);display:block;margin-bottom:6px">マット</label>
            <div style="display:flex;gap:6px">
              ${['T1', 'T2', 'T3', 'MD'].map(mat => `
                <button type="button" onclick="Pages._csSetField(${slotNo}, 'mat_type', '${mat}')"
                  id="cs-${slotNo}-mat-${mat}"
                  style="flex:1;padding:8px 0;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;
                    border:2px solid ${slotData.mat_type === mat ? 'var(--green)' : 'var(--border)'};
                    background:${slotData.mat_type === mat ? 'rgba(76,175,120,.15)' : 'var(--surface2)'};
                    color:${slotData.mat_type === mat ? 'var(--green)' : 'var(--text2)'}">
                  ${mat}
                </button>`).join('')}
            </div>
          </div>

          <!-- 交換種別 -->
          <div style="margin-bottom:12px">
            <label style="font-size:.72rem;font-weight:700;color:var(--text3);display:block;margin-bottom:6px">交換種別</label>
            <div style="display:flex;gap:6px">
              ${[{v:'FULL',l:'全交換'},{v:'ADD',l:'追加のみ'},{v:'NONE',l:'なし'}].map(({v, l}) => `
                <button type="button" onclick="Pages._csSetField(${slotNo}, 'exchange_type', '${v}')"
                  id="cs-${slotNo}-exchange-${v}"
                  style="flex:1;padding:8px 0;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;
                    border:2px solid ${slotData.exchange_type === v ? 'var(--green)' : 'var(--border)'};
                    background:${slotData.exchange_type === v ? 'rgba(76,175,120,.15)' : 'var(--surface2)'};
                    color:${slotData.exchange_type === v ? 'var(--green)' : 'var(--text2)'}">
                  ${l}
                </button>`).join('')}
            </div>
          </div>

          <!-- モルト入り -->
          <div style="margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--surface2);border-radius:8px">
              <div onclick="Pages._csToggleMalt(${slotNo})"
                style="cursor:pointer;width:44px;height:24px;border-radius:12px;position:relative;
                  background:${slotData.has_malt ? 'var(--green)' : 'rgba(128,128,128,.25)'};transition:background .2s">
                <div style="position:absolute;top:2px;left:${slotData.has_malt ? '22px' : '2px'};
                  width:20px;height:20px;border-radius:50%;background:#fff;
                  box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .2s"></div>
              </div>
              <span style="font-size:.85rem;font-weight:700;color:${slotData.has_malt ? 'var(--green)' : 'var(--text3)'}">
                ${slotData.has_malt ? '🧪 モルト入り（記録ON）' : 'モルト入り（記録OFF）'}
              </span>
            </div>
          </div>

          <!-- メモ -->
          <div>
            <label style="font-size:.72rem;font-weight:700;color:var(--text3);display:block;margin-bottom:6px">メモ（任意）</label>
            <input type="text" id="cs-${slotNo}-memo" placeholder="観察メモ"
              style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);font-size:.82rem;box-sizing:border-box"
              oninput="Pages._csSetField(${slotNo}, 'memo', this.value, false)">
          </div>

        </div>
      </div>`;
  }

  // ボタン選択・データ更新
  Pages._csSetField = function (slotNo, field, value, rerender = true) {
    const slotKey = slotNo === 1 ? 'slot1' : 'slot2';
    _sessionData[slotKey][field] = _sessionData[slotKey][field] === value ? '' : value;
    if (rerender) render();
  };

  Pages._csToggleMalt = function (slotNo) {
    const slotKey = slotNo === 1 ? 'slot1' : 'slot2';
    _sessionData[slotKey].has_malt = !_sessionData[slotKey].has_malt;
    render();
  };

  Pages._csUpdateDelta = function (slotNo, weight) {
    const info = _getUnitInfo();
    if (!info) return;
    
    const slotRecords = _getSlotGrowthRecords(info.unit.unit_id);
    const records = slotNo === 1 ? slotRecords.slot1 : slotRecords.slot2;
    const prevRecord = records.find(r => r.weight_g && +r.weight_g > 0);
    const prevWeight = prevRecord ? +prevRecord.weight_g : null;

    const deltaEl = document.getElementById(`cs-${slotNo}-delta`);
    if (!deltaEl) return;

    if (!weight || +weight <= 0) {
      deltaEl.innerHTML = '<span style="color:var(--text3)">体重を入力してください</span>';
      return;
    }

    if (prevWeight === null) {
      deltaEl.innerHTML = `<span style="color:var(--green);font-weight:700">📝 初回記録: ${weight}g</span>`;
      return;
    }

    const diff = Math.round((+weight - prevWeight) * 10) / 10;
    const isPos = diff > 0, isNeg = diff < 0;
    const arrow = isPos ? '↑' : isNeg ? '↓' : '→';
    const color = isPos ? 'var(--green)' : isNeg ? 'var(--red,#e05050)' : 'var(--text3)';
    const sign = isPos ? '+' : '';

    deltaEl.innerHTML = `<span style="color:${color};font-weight:700">${arrow} ${sign}${diff}g</span>` +
      `<span style="color:var(--text3);font-size:.75rem;margin-left:6px">（前回 ${prevWeight}g）</span>`;

    // 値を保存
    const slotKey = slotNo === 1 ? 'slot1' : 'slot2';
    _sessionData[slotKey].weight_g = weight;
  };

  // 保存処理
  Pages._csSave = async function () {
    const info = _getUnitInfo();
    if (!info) {
      UI.toast('ユニット情報が取得できません', 'error');
      return;
    }

    const dateEl = document.getElementById('cs-date');
    const recordDate = dateEl ? dateEl.value.replace(/-/g, '/') : _sessionData.record_date;

    // 入力値を収集
    ['slot1', 'slot2'].forEach((slotKey, idx) => {
      const slotNo = idx + 1;
      const weight = document.getElementById(`cs-${slotNo}-weight_g`)?.value || '';
      const memo = document.getElementById(`cs-${slotNo}-memo`)?.value || '';
      
      _sessionData[slotKey].weight_g = weight;
      _sessionData[slotKey].memo = memo;
    });

    const recordsToSave = [];

    // 各スロットの記録をチェック
    [1, 2].forEach(slotNo => {
      const slotKey = slotNo === 1 ? 'slot1' : 'slot2';
      const slotData = _sessionData[slotKey];

      if (slotData.weight_g && +slotData.weight_g > 0) {
        recordsToSave.push({
          target_type: 'BU',
          target_id: info.unit.unit_id,
          unit_slot_no: slotNo,
          weight_g: +slotData.weight_g,
          size_category: slotData.size_category || undefined,
          container: slotData.container || undefined,
          mat_type: slotData.mat_type || undefined,
          exchange_type: slotData.exchange_type || undefined,
          has_malt: slotData.has_malt,
          stage: slotData.stage || undefined,
          note_private: slotData.memo || undefined,
          record_date: recordDate,
        });
      }
    });

    if (recordsToSave.length === 0) {
      UI.toast('1頭目または2頭目の体重を入力してください', 'error');
      return;
    }

    try {
      UI.toast('記録を保存中...', 'info', 1000);

      // 各記録を保存
      for (const record of recordsToSave) {
        await API.growth.create(record);
        
        // Storeに仮記録追加（即座にUIに反映）
        const tmpRecord = { ...record, record_id: '_tmp_' + Date.now() + '_s' + record.unit_slot_no };
        Store.addGrowthRecord(info.unit.unit_id, tmpRecord);
      }

      UI.toast(`✅ ${recordsToSave.length}件の記録を保存しました`, 'success', 2000);
      
      // ユニット詳細に戻る
      setTimeout(() => {
        routeTo('unit-detail', { unitDisplayId: info.unit.display_id });
      }, 1000);

    } catch (e) {
      console.error('[CONTINUOUS] save error:', e);
      UI.toast('保存失敗: ' + (e.message || '通信エラー'), 'error', 5000);
    }
  };

  render();
};

// ページ登録
window.PAGES = window.PAGES || {};
window.PAGES['continuous-scan'] = function () {
  Pages.continuousScan(Store.getParams());
};
