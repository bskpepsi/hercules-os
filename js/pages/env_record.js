// ════════════════════════════════════════════════════════════════
// env_record.js  build: 20260413bj
// 役割: 個体単位の環境記録（温度・湿度・マット水分・保管場所）
//       個体詳細画面からの導線 + 独立ページ
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 環境記録一覧（個体詳細から導線） ────────────────────────────
Pages.envRecordList = function(params) {
  params = params || {};
  var main   = document.getElementById('main');
  var indId  = params.indId || params.targetId || '';
  var ind    = indId ? Store.getIndividual(indId) : null;
  var title  = ind ? ((ind.display_id||indId) + ' の環境記録') : '環境記録';

  // ローカルキャッシュから読み込み
  var records = _envGetRecords(indId);

  main.innerHTML =
    UI.header(title, {back:true, action:{fn:"Pages._envNewModal('"+indId+"')", icon:'＋'}}) +
    '<div class="page-body">' +

    (records.length === 0
      ? '<div class="card" style="text-align:center;padding:24px;color:var(--text3)">' +
          '<div style="font-size:2rem;margin-bottom:8px">🌡️</div>' +
          '<div style="font-size:.88rem">環境記録がありません</div>' +
          '<div style="font-size:.76rem;margin-top:6px">右上の＋から記録を追加できます</div>' +
        '</div>'
      : records.map(function(r, i){ return _envRecordCard(r, indId, i); }).join('')) +

    // グラフ（3件以上あれば表示）
    (records.length >= 3
      ? '<div class="card" style="padding:14px"><div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:10px">📈 温度・湿度推移</div>' +
          '<canvas id="env-chart" style="max-height:200px"></canvas>' +
        '</div>'
      : '') +

    '</div>';

  if (records.length >= 3) {
    setTimeout(function(){ _envDrawChart(records); }, 100);
  }
};

// 環境記録カード
function _envRecordCard(r, indId, idx) {
  var tempColor = r.temperature_c
    ? (r.temperature_c < 20 ? '#5ba8e8' : r.temperature_c > 27 ? '#e05050' : '#4caf78')
    : 'var(--text3)';
  return '<div class="card" style="padding:12px 14px;margin-bottom:8px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
      '<div style="font-size:.82rem;font-weight:700;color:var(--text2)">' + (r.record_date||'—') + '</div>' +
      '<button class="btn btn-ghost btn-sm" style="font-size:.7rem" ' +
        'onclick="Pages._envDeleteRecord(\'' + indId + '\',' + idx + ')">削除</button>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      (r.temperature_c !== '' && r.temperature_c !== null && r.temperature_c !== undefined
        ? '<div style="flex:1;min-width:70px;background:var(--surface2);border-radius:8px;padding:8px;text-align:center">' +
            '<div style="font-size:.65rem;color:var(--text3)">🌡️ 温度</div>' +
            '<div style="font-size:1rem;font-weight:700;color:' + tempColor + '">' + r.temperature_c + '℃</div>' +
          '</div>' : '') +
      (r.humidity_pct !== '' && r.humidity_pct !== null && r.humidity_pct !== undefined
        ? '<div style="flex:1;min-width:70px;background:var(--surface2);border-radius:8px;padding:8px;text-align:center">' +
            '<div style="font-size:.65rem;color:var(--text3)">💧 湿度</div>' +
            '<div style="font-size:1rem;font-weight:700;color:var(--blue)">' + r.humidity_pct + '%</div>' +
          '</div>' : '') +
      (r.mat_moisture !== '' && r.mat_moisture !== null && r.mat_moisture !== undefined
        ? '<div style="flex:1;min-width:70px;background:var(--surface2);border-radius:8px;padding:8px;text-align:center">' +
            '<div style="font-size:.65rem;color:var(--text3)">🪵 マット水分</div>' +
            '<div style="font-size:1rem;font-weight:700;color:var(--amber)">' + r.mat_moisture + '%</div>' +
          '</div>' : '') +
    '</div>' +
    (r.storage_location ? '<div style="font-size:.76rem;color:var(--text3);margin-top:8px">📍 ' + r.storage_location + '</div>' : '') +
    (r.note ? '<div style="font-size:.76rem;color:var(--text3);margin-top:4px">💬 ' + r.note + '</div>' : '') +
  '</div>';
}

// 新規記録モーダル
Pages._envNewModal = function(indId) {
  var today = new Date().toISOString().split('T')[0];
  var ind   = indId ? Store.getIndividual(indId) : null;
  var lastLoc = ind ? (ind.storage_location || '') : '';

  // 直近の記録から前回値を引き継ぐ
  var prev = _envGetRecords(indId);
  var lastRec = prev.length ? prev[prev.length - 1] : null;
  var defTemp  = lastRec && lastRec.temperature_c  != null ? lastRec.temperature_c  : '24';
  var defHum   = lastRec && lastRec.humidity_pct   != null ? lastRec.humidity_pct   : '60';
  var defMoist = lastRec && lastRec.mat_moisture   != null ? lastRec.mat_moisture   : '60';
  var defLoc   = (lastRec && lastRec.storage_location) || lastLoc || '';

  UI.modal(
    '<div class="modal-title" style="font-size:.9rem;font-weight:700;padding-bottom:8px">🌡️ 環境記録を追加</div>' +
    '<div style="padding:4px 0">' +
      '<div style="margin-bottom:10px">' +
        '<label style="font-size:.72rem;color:var(--text3);font-weight:700">記録日</label>' +
        '<input type="date" id="env-date" class="input" value="' + today + '" style="margin-top:4px">' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:10px">' +
        '<div style="flex:1">' +
          '<label style="font-size:.72rem;color:var(--text3);font-weight:700">🌡️ 温度（℃）</label>' +
          '<input type="number" id="env-temp" class="input" value="' + defTemp + '" step="0.1" min="10" max="40" style="margin-top:4px">' +
        '</div>' +
        '<div style="flex:1">' +
          '<label style="font-size:.72rem;color:var(--text3);font-weight:700">💧 湿度（%）</label>' +
          '<input type="number" id="env-hum" class="input" value="' + defHum + '" min="0" max="100" style="margin-top:4px">' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<label style="font-size:.72rem;color:var(--text3);font-weight:700">🪵 マット水分（%）<span style="font-weight:400;color:var(--text3)">（目安: 55〜65%）</span></label>' +
        '<div style="display:flex;gap:8px;margin-top:6px">' +
          ['50','55','60','65','70'].map(function(v){
            return '<button class="btn ' + (v===defMoist?'btn-primary':'btn-ghost') + '" ' +
              'style="flex:1;padding:8px 0;font-size:.8rem" ' +
              'data-env-moist="' + v + '" ' +
              'onclick="Pages._envSelectMoist(this)">' + v + '</button>';
          }).join('') +
        '</div>' +
        '<input type="hidden" id="env-moist" value="' + defMoist + '">' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<label style="font-size:.72rem;color:var(--text3);font-weight:700">📍 保管場所</label>' +
        '<input type="text" id="env-loc" class="input" value="' + defLoc + '" placeholder="例: 棚A-3" style="margin-top:4px">' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<label style="font-size:.72rem;color:var(--text3);font-weight:700">メモ（任意）</label>' +
        '<input type="text" id="env-note" class="input" placeholder="例: エアコン設定変更" style="margin-top:4px">' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal&&UI.closeModal()">キャンセル</button>' +
      '<button class="btn btn-primary" style="flex:2" onclick="Pages._envSave(\'' + indId + '\')">💾 保存</button>' +
    '</div>'
  );
};

Pages._envSelectMoist = function(btn) {
  // マット水分ボタン切替
  var val = btn.getAttribute('data-env-moist');
  var inp = document.getElementById('env-moist');
  if (inp) inp.value = val;
  var btns = document.querySelectorAll('[data-env-moist]');
  btns.forEach(function(b){
    b.className = 'btn ' + (b.getAttribute('data-env-moist') === val ? 'btn-primary' : 'btn-ghost');
    b.style.flex = '1'; b.style.padding = '8px 0'; b.style.fontSize = '.8rem';
  });
};

// 保存（ローカルキャッシュ + GAS送信）
Pages._envSave = function(indId) {
  var date  = (document.getElementById('env-date')||{}).value  || '';
  var temp  = (document.getElementById('env-temp')||{}).value  || '';
  var hum   = (document.getElementById('env-hum')||{}).value   || '';
  var moist = (document.getElementById('env-moist')||{}).value || '';
  var loc   = (document.getElementById('env-loc')||{}).value   || '';
  var note  = (document.getElementById('env-note')||{}).value  || '';

  if (!date) { UI.toast('記録日を入力してください', 'error'); return; }
  if (!temp && !hum && !moist) { UI.toast('温度・湿度・水分のいずれかを入力してください', 'error'); return; }

  var record = {
    record_date:      date.replace(/-/g, '/'),
    target_type:      'IND',
    target_id:        indId,
    temperature_c:    temp   !== '' ? parseFloat(temp)   : null,
    humidity_pct:     hum    !== '' ? parseFloat(hum)    : null,
    mat_moisture:     moist  !== '' ? parseFloat(moist)  : null,
    storage_location: loc,
    note:             note,
    created_at:       new Date().toISOString(),
  };

  // ローカルに保存
  _envSaveRecord(indId, record);
  UI.closeModal && UI.closeModal();
  UI.toast('✅ 環境記録を保存しました', 'success', 2000);

  // GASに送信（バックグラウンド・失敗しても無視しない）
  _envSendToGAS(record);

  // 画面を再描画
  Pages.envRecordList({indId: indId});
};

Pages._envDeleteRecord = function(indId, idx) {
  var records = _envGetRecords(indId);
  records.splice(idx, 1);
  _envSetRecords(indId, records);
  UI.toast('削除しました', 'info', 1500);
  Pages.envRecordList({indId: indId});
};

// ── ローカルストレージ操作 ────────────────────────────────────
var _ENV_LS_PREFIX = 'hcos_env_';

function _envGetRecords(indId) {
  if (!indId) return [];
  try {
    var raw = localStorage.getItem(_ENV_LS_PREFIX + indId);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function _envSetRecords(indId, records) {
  if (!indId) return;
  try { localStorage.setItem(_ENV_LS_PREFIX + indId, JSON.stringify(records)); } catch(e) {}
}

function _envSaveRecord(indId, record) {
  var records = _envGetRecords(indId);
  // 日付順に挿入
  records.push(record);
  records.sort(function(a,b){ return String(a.record_date).localeCompare(String(b.record_date)); });
  _envSetRecords(indId, records);
}

// ── GAS送信（バックグラウンド）────────────────────────────────
function _envSendToGAS(record) {
  var url = (typeof CONFIG !== 'undefined' && CONFIG.GAS_URL) || '';
  if (!url) return;
  (async function(){
    try {
      for (var attempt = 0; attempt < 3; attempt++) {
        try {
          var res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              action: 'createEnvRecord',
              data: record,
            }),
          });
          if (res.ok) return;
        } catch(e) {
          if (attempt < 2) await new Promise(function(r){ setTimeout(r, 2000); });
          else console.warn('[ENV] GAS送信失敗（最大リトライ）:', e);
        }
      }
    } catch(e) { console.warn('[ENV] 送信エラー:', e); }
  })();
}

// ── グラフ描画 ────────────────────────────────────────────────
function _envDrawChart(records) {
  var el = document.getElementById('env-chart');
  if (!el || typeof Chart === 'undefined') return;
  if (el._chartInst) { el._chartInst.destroy(); }

  var labels = records.map(function(r){ return r.record_date; });
  var temps  = records.map(function(r){ return r.temperature_c != null ? r.temperature_c : null; });
  var hums   = records.map(function(r){ return r.humidity_pct  != null ? r.humidity_pct  : null; });

  el._chartInst = new Chart(el, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '温度(℃)',
          data: temps,
          borderColor: '#e05050',
          backgroundColor: 'rgba(224,80,80,0.08)',
          pointRadius: 3, tension: 0.3, fill: false,
          yAxisID: 'yTemp',
        },
        {
          label: '湿度(%)',
          data: hums,
          borderColor: '#5ba8e8',
          backgroundColor: 'rgba(91,168,232,0.08)',
          pointRadius: 3, tension: 0.3, fill: false,
          yAxisID: 'yHum',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#6a7c6a', font: {size:10} } } },
      scales: {
        x:     { ticks: { color:'#6a7c6a', maxTicksLimit:5, font:{size:9} }, grid:{color:'rgba(255,255,255,0.05)'} },
        yTemp: { position:'left',  ticks:{color:'#e05050', font:{size:9}}, grid:{color:'rgba(255,255,255,0.05)'}, title:{display:true,text:'℃',color:'#e05050',font:{size:9}} },
        yHum:  { position:'right', ticks:{color:'#5ba8e8', font:{size:9}}, grid:{drawOnChartArea:false},          title:{display:true,text:'%', color:'#5ba8e8',font:{size:9}} },
      }
    }
  });
}

// ── ページルート登録 ─────────────────────────────────────────
window.PAGES = window.PAGES || {};
window.PAGES['env-record'] = function() {
  Pages.envRecordList(Store.getParams());
};
