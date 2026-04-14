// ════════════════════════════════════════════════════════════════
// pairing.js  ―  産卵セット管理  v2
// 改善: 採卵履歴カード形式・KPI・交換リマインド・ペアリング日名称
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 産卵セット一覧 ───────────────────────────────────────────────
Pages.pairingList = function () {
  const main = document.getElementById('main');
  let statusFilter = 'active';

  function render() {
    const all  = Store.getDB('pairings') || [];
    const list = statusFilter ? all.filter(p => p.status === statusFilter) : all;
    main.innerHTML = `
      ${UI.header('産卵セット', { action: { fn: "routeTo('pairing-new')", icon: '＋' } })}
      <div class="page-body">
        <div class="filter-bar">
          <button class="pill ${statusFilter==='active'    ? 'active' : ''}" onclick="Pages._pairSetStatus('active')">進行中</button>
          <button class="pill ${statusFilter==='completed' ? 'active' : ''}" onclick="Pages._pairSetStatus('completed')">完了</button>
          <button class="pill ${statusFilter==='failed'    ? 'active' : ''}" onclick="Pages._pairSetStatus('failed')">失敗</button>
          <button class="pill ${!statusFilter              ? 'active' : ''}" onclick="Pages._pairSetStatus('')">全て</button>
        </div>
        <div class="sec-hdr"><span class="sec-title">${list.length}セット</span></div>
        ${list.length ? list.map(_pairCardHTML).join('') : UI.empty('産卵セットがありません', '右上の＋から登録できます')}
      </div>`;
  }

  Pages._pairSetStatus = (s) => { statusFilter = s; render(); };
  render();
};

function _pairCardHTML(pair) {
  const f    = Store.getParent(pair.father_par_id);
  const m    = Store.getParent(pair.mother_par_id);
  const rate = pair.hatch_rate ? Math.round(+pair.hatch_rate) + '%' : '—';
  const badge = _exchangeBadgeHtml(pair);

  // ラインコード・年を取得
  // pair.line_id が空の場合は父母IDからラインを逆引き
  let ln = Store.getLine(pair.line_id);
  if (!ln && (pair.father_par_id || pair.mother_par_id)) {
    const allLines = Store.getDB('lines') || [];
    ln = allLines.find(l =>
      l.father_par_id === pair.father_par_id &&
      l.mother_par_id === pair.mother_par_id
    ) || allLines.find(l =>
      l.father_par_id === pair.father_par_id
    ) || null;
  }
  const lineCode = ln ? (ln.line_code || ln.display_id || '—') : '—';

  // ★ 修正③: 年度表示をペアリング年（pairing_start の年）に変更
  // hatch_year（孵化年=翌年）ではなくペアリング実施年を表示する
  const year = (() => {
    if (pair.pairing_start) {
      const m = String(pair.pairing_start).match(/(\d{4})/);
      if (m) return m[1];
    }
    // pairing_start がない場合はラインの hatch_year にフォールバック
    return ln ? (ln.hatch_year || '') : '';
  })();

  // 親情報
  const fName = f ? (f.parent_display_id || f.display_name || '') : '';
  const mName = m ? (m.parent_display_id || m.display_name || '') : '';
  const fSize = (f && f.size_mm) ? '（' + f.size_mm + 'mm）' : '';
  const mSize = (m && m.size_mm) ? '（' + m.size_mm + 'mm）' : '';

  // 血統原文（父母から取得、20文字省略）
  const fRaw = f ? (f.bloodline_raw || '') : '';
  const mRaw = m ? (m.bloodline_raw || '') : '';
  const trim20 = function(s) { return s.length > 20 ? s.slice(0, 20) + '…' : s; };
  const bloodStr = (fRaw || mRaw)
    ? trim20(fRaw) + (mRaw ? ' × ' + trim20(mRaw) : '')
    : '';

  // 親行HTML
  const fHtml = fName
    ? '<span style="color:var(--male)">♂</span> <b>' + fName + '</b>'
      + '<span style="color:var(--text3);font-size:.72rem">' + fSize + '</span>'
    : '';
  const mHtml = mName
    ? '<span style="color:var(--female)">♀</span> <b>' + mName + '</b>'
      + '<span style="color:var(--text3);font-size:.72rem">' + mSize + '</span>'
    : '';
  const parentRow = (fHtml || mHtml)
    ? '<div style="font-size:.8rem;margin-bottom:3px">'
      + fHtml
      + ((fHtml && mHtml) ? '<span style="color:var(--text3);margin:0 4px">×</span>' : '')
      + mHtml
      + '</div>'
    : '';

  const bloodRow = bloodStr
    ? '<div style="font-size:.73rem;color:var(--text3);margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + bloodStr + '</div>'
    : '';

  const setStr = pair.set_start ? '<span>セット ' + pair.set_start + '</span>' : '';

  // SET番号・バッジ行（右カラム上部）
  const headerRow = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
    + badge
    + '<span style="font-size:.72rem;color:var(--text3);font-family:var(--font-mono)">' + (pair.display_id||'') + '</span>'
    + '</div>';

  // 右カラム
  const rightCol = '<div style="flex:1;min-width:0">'
    + headerRow
    + parentRow
    + bloodRow
    + '<div style="display:flex;gap:10px;font-size:.75rem;color:var(--text3);flex-wrap:wrap">'
    +   '<span>卵 <b style="color:var(--amber)">' + (pair.total_eggs||0) + '</b>個</span>'
    +   '<span>孵化 <b style="color:var(--green)">' + (pair.total_hatch||0) + '</b>頭</span>'
    +   '<span>孵化率 <b>' + rate + '</b></span>'
    +   setStr
    + '</div>'
    + '</div>';

  return '<div class="card" style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:12px"'
    + ' onclick="routeTo(\'pairing-detail\',{pairingId:\'' + pair.set_id + '\'})">'

    // 左カラム: ラインコード＋年（ライン一覧と同じレイアウト）
    + '<div style="min-width:48px;text-align:center;flex-shrink:0">'
    +   '<div style="font-family:var(--font-mono);font-size:1.35rem;font-weight:800;color:var(--gold);line-height:1">' + lineCode + '</div>'
    +   '<div style="font-size:.65rem;color:var(--text3);margin-top:3px">' + year + '</div>'
    + '</div>'

    // 右カラム
    + rightCol

    + '<div style="color:var(--text3);font-size:1.1rem;flex-shrink:0">›</div>'

    + '</div>';
}


function _calcExchangeDue(pair) {
  if (!pair.set_start || pair.status !== 'active') return null;
  const days  = parseInt(Store.getSetting('pairing_set_exchange_days') || '7', 10);
  const parts = String(pair.set_start).split(/[\/\-]/);
  if (parts.length < 3) return null;
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  d.setDate(d.getDate() + days);
  return d;
}

function _dayDiff(due) {
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.floor((due - today) / 86400000);
}

function _exchangeBadgeHtml(pair) {
  const due = _calcExchangeDue(pair);
  if (!due) return '';
  const diff = _dayDiff(due);
  if (diff < 0)  return `<span style="font-size:.63rem;background:rgba(231,76,60,.15);color:var(--red);padding:1px 7px;border-radius:10px;margin-left:4px">期限超過${Math.abs(diff)}日</span>`;
  if (diff === 0) return `<span style="font-size:.63rem;background:rgba(231,76,60,.15);color:var(--red);padding:1px 7px;border-radius:10px;margin-left:4px">今日交換</span>`;
  if (diff === 1) return `<span style="font-size:.63rem;background:rgba(224,144,64,.15);color:var(--amber);padding:1px 7px;border-radius:10px;margin-left:4px">明日交換</span>`;
  return '';
}


// ── 次アクションバナー ────────────────────────────────────────────
// 産卵セット詳細のセット情報カード直後に表示
function _nextActionBannerHtml(pair) {
  if (pair.status !== 'active') return '';

  var action      = pair.next_action       || '';
  var nextCollect = pair.next_collect_date || '';
  var restUntil   = pair.rest_until_date   || '';

  if (!action || !nextCollect) return '';

  // 今日からの日数を計算
  function dayDiff(dateStr) {
    if (!dateStr) return null;
    var parts = String(dateStr).split(/[\/\-]/);
    if (parts.length < 3) return null;
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.floor((d - today) / 86400000);
  }

  var diff    = dayDiff(nextCollect);
  var diffTxt = diff === null ? '' :
    diff < 0  ? '（' + Math.abs(diff) + '日超過）' :
    diff === 0 ? '（今日）' :
    diff === 1 ? '（明日）' :
    '（あと' + diff + '日）';

  var color   = diff !== null && diff <= 0  ? 'var(--red,#e05555)'   :
                diff !== null && diff <= 2  ? 'var(--amber,#e09040)' :
                'var(--green)';

  var actionLabel = action === 'continue' ? '継続投入中' :
                    action === 'rest'      ? '休養中'     : '';
  if (!actionLabel) return '';

  var lines = [
    '<div style="display:flex;align-items:flex-start;gap:10px">',
    '<div style="font-size:1.2rem;line-height:1.3">' + (action === 'rest' ? '😴' : '♻️') + '</div>',
    '<div style="flex:1">',
    '<div style="font-size:.75rem;font-weight:700;color:var(--text3);letter-spacing:.04em;margin-bottom:2px">' + actionLabel.toUpperCase() + '</div>',
  ];

  if (action === 'rest' && restUntil) {
    var restDiff = dayDiff(restUntil);
    var restTxt  = restDiff === null ? '' :
      restDiff < 0  ? '（投入待ち）' :
      restDiff === 0 ? '（今日再投入）' :
      restDiff === 1 ? '（明日再投入）' :
      '（あと' + restDiff + '日）';
    lines.push(
      '<div style="font-size:.83rem;color:var(--text2);margin-bottom:3px">',
      '再投入日: <strong>' + restUntil + '</strong>',
      '<span style="font-size:.72rem;color:var(--amber);margin-left:4px">' + restTxt + '</span>',
      '</div>'
    );
  }

  lines.push(
    '<div style="font-size:.88rem;font-weight:700;color:' + color + '">',
    '次回採卵予定: ' + nextCollect,
    '<span style="font-size:.75rem;font-weight:400;margin-left:4px">' + diffTxt + '</span>',
    '</div>',
    '</div>',
    '</div>'
  );

  return '<div style="background:rgba(76,175,120,.08);border:1px solid rgba(76,175,120,.25);'
    + 'border-radius:var(--radius);padding:12px 14px;margin-top:0">'
    + lines.join('') + '</div>';
}

// ── 産卵セット詳細 ───────────────────────────────────────────────
Pages.pairingDetail = async function (setId) {
  if (setId && typeof setId === 'object') setId = setId.id || setId.pairingId || setId.setId || '';
  const main = document.getElementById('main');

  // キャッシュがあれば即時表示（ちらつき防止）
  const cached = (Store.getDB('pairings') || []).find(p => p.set_id === setId);
  if (cached) _renderPairDetail(cached, null, main);
  else        main.innerHTML = UI.header('産卵セット', { back: true }) + UI.spinner();

  try {
    // getPairingWithEggs で1回のAPI呼び出しでセット情報＋採卵履歴を同時取得
    const res = await API.pairing.getWithEggs({ set_id: setId });
    if (Store.getPage() !== 'pairing-detail') return;
    _renderPairDetail(res.pairing, res.egg_records || [], main);
  } catch (e) {
    // getPairingWithEggs 未デプロイ時のフォールバック（旧2回呼び出し）
    try {
      const pairRes = await API.pairing.get(setId);
      if (Store.getPage() !== 'pairing-detail') return;
      const pair = pairRes.pairing;
      _renderPairDetail(pair, [], main);
      try {
        const eggRes = await API.pairing.getEggRecords({ set_id: setId });
        if (Store.getPage() !== 'pairing-detail') return;
        _renderPairDetail(pair, eggRes.egg_records || [], main);
      } catch (_) { /* 採卵履歴が取れなくても続行 */ }
    } catch (e2) {
      if (!cached) main.innerHTML = UI.header('エラー', { back: true }) +
        `<div class="page-body">${UI.empty('取得失敗: ' + e2.message)}</div>`;
    }
  }
};

function _renderPairDetail(pair, eggRecords, main) {
  const f   = Store.getParent(pair.father_par_id);
  const m   = Store.getParent(pair.mother_par_id);

  // KPI
  const totalEggs   = pair.total_eggs   || 0;
  const totalHatch  = pair.total_hatch  || 0;
  // 腐卵数: egg_recordsのfailed_countを合計（pair.total_failed優先）
  const totalRotten = pair.total_failed !== undefined && pair.total_failed !== null
    ? parseInt(pair.total_failed, 10) || 0
    : eggRecords ? eggRecords.reduce((s,r)=>s+(parseInt(r.failed_count,10)||0),0) : 0;
  const hatchRate   = totalEggs > 0 ? (Math.round(totalHatch/totalEggs*1000)/10)+'%' : '—';

  // セット回数: 採卵記録の件数（採卵した回数 = 何回目まで採卵したか）
  const _eggCount = eggRecords ? eggRecords.length : 0;
  const setCountStr = _eggCount > 0 ? `${_eggCount}回目` : '—';

  // 交換リマインドバナー
  const due = _calcExchangeDue(pair);
  const reminderBanner = _reminderBannerHtml(due);

  // 採卵履歴
  const eggHtml = _eggHistoryHtml(eggRecords, pair);

  main.innerHTML = `
    ${UI.header(pair.display_id, { back: true, action: { fn: `Pages._pairMenu('${pair.set_id}')`, icon: '…' } })}
    <div class="page-body">

      ${reminderBanner}

      <!-- KPI -->
      <div class="card card-gold">
        <div style="font-size:.95rem;font-weight:700;margin-bottom:10px">${pair.set_name || pair.display_id}</div>
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);gap:6px">
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:1.2rem">${totalEggs}</div>
            <div class="kpi-label">採卵数</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:1.2rem;color:${totalRotten>0?'var(--red,#e05050)':'var(--text2)'}">${totalRotten}</div>
            <div class="kpi-label">腐卵数</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:1.2rem">${totalHatch}</div>
            <div class="kpi-label">孵化数</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:1.2rem;color:var(--green)">${hatchRate}</div>
            <div class="kpi-label">孵化率</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:1.1rem;color:var(--gold)">${setCountStr}</div>
            <div class="kpi-label">採卵回数</div>
          </div>
        </div>
      </div>

      <!-- アクション -->
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1"
          onclick="Pages._pairAddEggModal('${pair.set_id}')">🥚 採卵記録</button>
        <button class="btn btn-gold" style="flex:1"
          onclick="Pages._pairGoLotNew('${pair.line_id||''}','${pair.mother_par_id||''}','${pair.father_par_id||''}','${pair.set_id||''}')">🐛 ロット作成</button>
      </div>

      <!-- セット情報 -->
      <div class="card">
        <div class="card-title">セット情報</div>
        <div class="info-list">
          ${_prow('<span style="color:var(--male)">♂親</span>', f ? (() => {
            // ★ parent_display_id（M25-A形式）を優先して表示
            const fLabel = f.parent_display_id || f.display_name || '';
            return `<span style="cursor:pointer;color:var(--male)" onclick="routeTo('parent-detail',{parId:'${f.par_id}'})">
              <strong>${fLabel}</strong>${f.size_mm?'<span style="color:var(--text2)">（'+f.size_mm+'mm）</span>':''}
            </span>`;
          })() : (pair.father_par_id||'—'))}
          ${_prow('<span style="color:var(--female)">♀親</span>', m ? (() => {
            // ★ parent_display_id（F25-02形式）を優先して表示
            const mLabel = m.parent_display_id || m.display_name || '';
            return `<span style="cursor:pointer;color:var(--female)" onclick="routeTo('parent-detail',{parId:'${m.par_id}'})">
              <strong>${mLabel}</strong>${m.size_mm?'<span style="color:var(--text2)">（'+m.size_mm+'mm）</span>':''}
            </span>`;
          })() : (pair.mother_par_id||'—'))}
          ${_prow('ペアリング日', pair.pairing_start || '—')}
          ${_prow('セット開始',   pair.set_start    || '—')}
          ${pair.set_end   ? _prow('セット終了', pair.set_end)      : ''}
          ${pair.temp_c    ? _prow('温度',       pair.temp_c+'℃')  : ''}
          ${pair.mat_info  ? _prow('マット',     pair.mat_info)    : ''}
          ${pair.note      ? _prow('メモ',       pair.note)        : ''}
        </div>
      </div>

      <!-- 次アクション表示 -->
      ${_nextActionBannerHtml(pair)}

      <!-- ③ QRラベルボタン -->
      <button class="btn btn-ghost btn-full" style="margin-top:0"
        onclick="Pages._pairShowLabel('${pair.set_id}')">🏷 QR/ラベル発行</button>

      <!-- 採卵履歴 -->
      ${eggHtml}

      <!-- ステータス変更 -->
      <div style="display:flex;gap:8px;margin-top:4px">
        ${pair.status!=='completed' ? `<button class="btn btn-ghost btn-sm" onclick="Pages._pairComplete('${pair.set_id}')">✅ 完了</button>` : ''}
        ${pair.status!=='failed'    ? `<button class="btn btn-ghost btn-sm" onclick="Pages._pairFail('${pair.set_id}')">❌ 失敗</button>`    : ''}
      </div>
    </div>`;
}

function _prow(k, v) {
  return `<div class="info-row"><span class="info-key">${k}</span><span class="info-val">${v}</span></div>`;
}

// 交換リマインドバナー
function _reminderBannerHtml(due) {
  if (!due) return '';
  const diff   = _dayDiff(due);
  const dueStr = `${due.getFullYear()}/${String(due.getMonth()+1).padStart(2,'0')}/${String(due.getDate()).padStart(2,'0')}`;
  if (diff < 0)  return `<div style="background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.35);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-bottom:2px"><span style="font-size:1.3rem">⚠️</span><div><div style="font-size:.85rem;font-weight:700;color:var(--red)">セット交換 期限超過 ${Math.abs(diff)}日</div><div style="font-size:.72rem;color:var(--text3)">交換予定日: ${dueStr}</div></div></div>`;
  if (diff===0) return `<div style="background:rgba(231,76,60,.08);border:1px solid rgba(231,76,60,.3);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-bottom:2px"><span style="font-size:1.3rem">🔔</span><div><div style="font-size:.85rem;font-weight:700;color:var(--red)">今日がセット交換日です</div><div style="font-size:.72rem;color:var(--text3)">交換予定日: ${dueStr}</div></div></div>`;
  if (diff===1) return `<div style="background:rgba(224,144,64,.08);border:1px solid rgba(224,144,64,.3);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-bottom:2px"><span style="font-size:1.3rem">🔔</span><div><div style="font-size:.85rem;font-weight:700;color:var(--amber)">明日がセット交換日です</div><div style="font-size:.72rem;color:var(--text3)">交換予定日: ${dueStr}</div></div></div>`;
  if (diff<=3)  return `<div style="background:rgba(224,144,64,.05);border:1px solid rgba(224,144,64,.2);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-bottom:2px"><span style="font-size:1.3rem">📅</span><div><div style="font-size:.85rem;color:var(--amber)">セット交換まで <strong>${diff}日</strong></div><div style="font-size:.72rem;color:var(--text3)">交換予定日: ${dueStr}</div></div></div>`;
  return '';
}

// 採卵履歴カード
function _eggHistoryHtml(eggRecords, pair) {
  const title = `<div class="card-title" style="display:flex;justify-content:space-between;align-items:center">`;

  // EGG_RECORDSデータがある場合
  if (eggRecords && eggRecords.length > 0) {
    const sorted = [...eggRecords].sort((a,b) => String(a.collect_date).localeCompare(String(b.collect_date)));
    const sumEggs  = sorted.reduce((s,r)=>s+(parseInt(r.egg_count, 10)||0), 0);
    const sumHatch = sorted.reduce((s,r)=>s+(parseInt(r.hatch_count,10)||0), 0);
    const cards = sorted.map((rec, i) => {
      const e  = parseInt(rec.egg_count,  10) || 0;
      const h  = parseInt(rec.hatch_count,10) || 0;
      const rr = e > 0 ? Math.round(h/e*1000)/10+'%' : '—';
      return `<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:.78rem;font-weight:700;color:var(--green);background:rgba(45,122,82,.12);padding:2px 10px;border-radius:20px">${i+1}回目</span>
          <span style="font-size:.72rem;color:var(--text3)">孵化率 <strong style="color:var(--green)">${rr}</strong></span>
        </div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 14px;font-size:.82rem">
          ${rec.round_set_date ? `<span style="color:var(--text3)">セット日</span><span style="font-weight:500">${rec.round_set_date}</span>` : ''}
          <span style="color:var(--text3)">採卵日</span><span style="font-weight:500">${rec.collect_date||'—'}</span>
          <span style="color:var(--text3)">卵数</span><span style="font-weight:500">${e}個</span>
          <span style="color:var(--text3)">孵化数</span><span style="font-weight:500">${h}頭</span>
          ${rec.note ? `<span style="color:var(--text3)">メモ</span><span style="color:var(--text2)">${rec.note}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn btn-ghost btn-sm" style="font-size:.75rem"
            onclick="Pages._pairEditOneEgg('${rec.egg_record_id}','${pair.set_id}')">✏️ 編集</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="card">${title}<span>採卵履歴</span><span style="font-size:.72rem;font-weight:400;color:var(--text3)">${sorted.length}回 / 計${sumEggs}個 / 孵化${sumHatch}頭</span></div>${cards}</div>`;
  }

  // eggRecordsがnull＝まだ読み込み中（初期キャッシュ表示時のみ）
  if (eggRecords === null) {
    return `<div class="card"><div class="card-title">採卵履歴</div><div style="text-align:center;padding:16px;color:var(--text3);font-size:.85rem">読み込み中…</div></div>`;
  }

  // 旧データ（collect_datesのみ）フォールバック
  if (pair.collect_dates) {
    const dates = pair.collect_dates.split(',').map(d=>d.trim()).filter(Boolean)
      .sort((a,b)=>a.localeCompare(b));
    return `<div class="card">${title}<span>採卵履歴</span><span style="font-size:.72rem;font-weight:400;color:var(--text3)">旧データ</span></div>
      ${dates.map((d,i)=>`<div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;gap:10px;font-size:.85rem"><span style="color:var(--text3);min-width:38px">${i+1}回目</span><span>${d}</span></div>`).join('')}
    </div>`;
  }

  return `<div class="card">${title}<span>採卵履歴</span><span></span></div>${UI.empty('採卵記録がありません','採卵記録ボタンから追加できます')}</div>`;
}

// … メニュー
// グローバル経由でclosure問題を完全回避
window._pairMenuEdit = function(sid) { routeTo('pairing-new', { editId: sid }); };
window._pairMenuEgg  = function(sid) { Pages._pairEditEggModal(sid); };
window._pairMenuLabel= function(sid) { Pages._pairShowLabel(sid); };

Pages._pairMenu = function (setId) {
  const sid = String(setId);
  UI.actionSheet([
    { label: '✏️ セット情報を編集', fn: function(){ _pairMenuEdit(sid); } },
    { label: '📝 採卵履歴を編集',   fn: function(){ _pairMenuEgg(sid); } },
    { label: '🏷 ラベル/QR発行',    fn: function(){ _pairMenuLabel(sid); } },
  ]);
};

// ③ QRラベル表示 → ラベル生成画面に遷移（Canvasプレビュー + ダウンロード）
Pages._pairShowLabel = function (setId) {
  routeTo('label-gen', { targetType: 'SET', targetId: setId });
};

// ════════════════════════════════════════════════════════════════
// 採卵記録 → 次アクション（2ステップモーダル）
// Step1: 採卵記録入力
// Step2: 次アクション選択（継続 / 休養 / その他）
// ════════════════════════════════════════════════════════════════

Pages._pairAddEggModal = function (setId) {
  const today        = new Date().toISOString().split('T')[0];
  const exchDays     = parseInt(Store.getSetting('pairing_set_exchange_days') || '7', 10);
  const defaultNext  = new Date();
  defaultNext.setDate(defaultNext.getDate() + exchDays);
  const defaultNextStr = defaultNext.toISOString().split('T')[0];

  _showModal('🥚 採卵記録', `
    <div class="form-section">
      <div style="font-size:.75rem;font-weight:700;color:var(--text3);
        letter-spacing:.06em;margin-bottom:10px">STEP 1 — 記録内容</div>

      ${UI.field('今回のセット日（投入日）',
        '<input type="date" id="egg-set-date" class="input" value="' + today + '">')}
      ${UI.field('採卵日',
        '<input type="date" id="egg-date" class="input" value="' + today + '">')}
      <div class="form-row-2">
        ${UI.field('採卵数',
          '<input type="number" id="egg-count" class="input" min="0" value="0">')}
        ${UI.field('孵化確認数',
          '<input type="number" id="hatch-count" class="input" min="0" value="0">')}
      </div>
      <div class="form-row-2">
        ${UI.field('腐卵数（無精卵・潰れ等）',
          '<input type="number" id="egg-failed" class="input" min="0" value="0">')}
        <div></div>
      </div>
      ${UI.field('メモ（任意）',
        '<input type="text" id="egg-note" class="input" placeholder="例: 材あり・26℃">')}
      <div style="font-size:.72rem;color:var(--text3);margin-bottom:12px">
        孵化確認がまだの場合は0でOK
      </div>

      <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
        <div style="font-size:.75rem;font-weight:700;color:var(--text3);
          letter-spacing:.06em;margin-bottom:12px">STEP 2 — 次のアクション</div>

        <!-- ── 主操作: 継続 / 休養 ────────────────────────────── -->
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">

          <!-- 継続して戻す -->
          <div id="act-continue-wrap">
            <button type="button" id="act-continue-btn"
              class="btn-pair-action btn-pair-action-green"
              onclick="Pages._pairActSelect('continue')">
              ♻️ そのまま継続して戻す
            </button>
            <div id="act-continue-opts" style="display:none;
              background:var(--surface2);border:1px solid var(--border);
              border-radius:0 0 10px 10px;padding:12px;margin-top:-4px">
              ${UI.field('次回採卵まで（日）',
                '<input type="number" id="continue-days" class="input" min="1" max="60" value="' + exchDays + '">')}
              <div style="font-size:.72rem;color:var(--text3)">
                次回採卵予定日が自動計算されます
              </div>
            </div>
          </div>

          <!-- 休養させて戻す -->
          <div id="act-rest-wrap">
            <button type="button" id="act-rest-btn"
              class="btn-pair-action btn-pair-action-blue"
              onclick="Pages._pairActSelect('rest')">
              😴 数日休養させてから戻す
            </button>
            <div id="act-rest-opts" style="display:none;
              background:var(--surface2);border:1px solid var(--border);
              border-radius:0 0 10px 10px;padding:12px;margin-top:-4px">
              <div class="form-row-2">
                ${UI.field('休養日数',
                  '<input type="number" id="rest-days" class="input" min="1" max="30" value="3">')}
                ${UI.field('再投入後 採卵まで（日）',
                  '<input type="number" id="rest-collect-days" class="input" min="1" max="60" value="' + exchDays + '">')}
              </div>
              <div style="font-size:.72rem;color:var(--text3)">
                休養終了日と次回採卵予定日が自動計算されます
              </div>
            </div>
          </div>
        </div>

        <!-- ── その他（折りたたみ）───────────────────────────── -->
        <details style="margin-top:2px">
          <summary style="
            font-size:.78rem;color:var(--text3);cursor:pointer;
            padding:8px 4px;list-style:none;display:flex;
            align-items:center;gap:4px;user-select:none">
            <span id="other-arrow" style="font-size:.7rem">▶</span>
            その他の操作（完了・失敗・死亡）
          </summary>
          <div style="display:flex;flex-direction:column;gap:8px;padding:10px 4px 4px">
            <button type="button" class="btn-pair-action btn-pair-action-gray"
              onclick="Pages._pairActSelect('completed')">
              ✅ 産卵セットを完了にする
            </button>
            <button type="button" class="btn-pair-action btn-pair-action-gray"
              onclick="Pages._pairActSelect('failed')">
              ❌ 失敗として記録する
            </button>
            <button type="button" class="btn-pair-action btn-pair-action-danger"
              onclick="Pages._pairActSelect('dead')">
              💀 ♀が死亡した（セット終了）
            </button>
          </div>
        </details>

        <!-- 選択状態の隠しフィールド -->
        <input type="hidden" id="egg-next-action" value="continue">
      </div>

      <div class="modal-footer" style="margin-top:14px">
        <button class="btn btn-ghost" style="flex:1" type="button"
          onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" type="button"
          onclick="Pages._pairSaveEgg('${setId}')">記録・保存</button>
      </div>
    </div>`);

  // 初期選択: 継続
  Pages._pairActSelect('continue');
};

// ── アクション選択の表示切り替え ────────────────────────────────
Pages._pairActSelect = function (action) {
  const actionEl = document.getElementById('egg-next-action');
  if (actionEl) actionEl.value = action;

  // ボタンをリセット
  ['continue','rest','completed','failed','dead'].forEach(function(a) {
    const btn = document.getElementById('act-' + a + '-btn');
    if (btn) {
      btn.style.opacity = (a === action) ? '1' : '0.55';
      btn.style.fontWeight = (a === action) ? '800' : '600';
    }
  });

  // 継続オプション開閉
  const contOpts = document.getElementById('act-continue-opts');
  if (contOpts) contOpts.style.display = (action === 'continue') ? 'block' : 'none';

  // 休養オプション開閉
  const restOpts = document.getElementById('act-rest-opts');
  if (restOpts) restOpts.style.display = (action === 'rest') ? 'block' : 'none';
};

// ── 採卵記録保存 + 次アクション実行 ─────────────────────────────
Pages._pairSaveEgg = async function (setId) {
  const setDate = (document.getElementById('egg-set-date')?.value || '').replace(/-/g,'/');
  const date    = (document.getElementById('egg-date')?.value     || '').replace(/-/g,'/');
  const eggs    = +document.getElementById('egg-count')?.value    || 0;
  const hatch   = +document.getElementById('hatch-count')?.value  || 0;
  const failed  = +document.getElementById('egg-failed')?.value   || 0;
  const note    = document.getElementById('egg-note')?.value      || '';
  const action  = document.getElementById('egg-next-action')?.value || 'continue';

  // ── 死亡の場合は事前確認 ─────────────────────────────────────
  if (action === 'dead') {
    if (!UI.confirm('♀が死亡したとして記録します。\n\n・産卵セットを完了にします\n・対象の♀個体ステータスを「死亡」にします\n\n後で編集から修正できます。続けますか？')) return;
  }

  // ── 次回予定日の計算 ─────────────────────────────────────────
  const today   = new Date();
  let nextCollect  = '';
  let restUntil    = '';
  const exchDays   = parseInt(Store.getSetting('pairing_set_exchange_days') || '7', 10);

  if (action === 'continue') {
    const contDays = parseInt(document.getElementById('continue-days')?.value || String(exchDays), 10);
    const d = new Date();
    d.setDate(d.getDate() + contDays);
    nextCollect = d.toISOString().split('T')[0].replace(/-/g,'/');
  } else if (action === 'rest') {
    const restDays    = parseInt(document.getElementById('rest-days')?.value         || '3',          10);
    const afterDays   = parseInt(document.getElementById('rest-collect-days')?.value || String(exchDays), 10);
    const restEnd = new Date();
    restEnd.setDate(restEnd.getDate() + restDays);
    restUntil = restEnd.toISOString().split('T')[0].replace(/-/g,'/');
    const nextD = new Date(restEnd);
    nextD.setDate(nextD.getDate() + afterDays);
    nextCollect = nextD.toISOString().split('T')[0].replace(/-/g,'/');
  }

  _closeModal();

  try {
    // ── 採卵記録を保存 ─────────────────────────────────────────
    await apiCall(
      () => API.pairing.addEgg({
        set_id:          setId,
        round_set_date:  setDate,
        collect_date:    date,
        egg_count:       eggs,
        hatch_count:     hatch,
        failed_count:    failed,
        note,
      }),
      '採卵' + eggs + '個を記録しました'
    );

    // ── パイアリングの次アクション情報を更新 ──────────────────
    const pairUpdates = {
      set_id:             setId,
      next_action:        action,
      next_collect_date:  nextCollect,
      rest_until_date:    restUntil,
    };

    // 終了系アクションの場合: ステータスを変更
    if (action === 'completed') {
      pairUpdates.status         = 'completed';
      pairUpdates.closing_reason = 'completed';
      pairUpdates.next_collect_date = '';
      pairUpdates.rest_until_date   = '';
    } else if (action === 'failed') {
      pairUpdates.status         = 'failed';
      pairUpdates.closing_reason = 'failed';
      pairUpdates.next_collect_date = '';
      pairUpdates.rest_until_date   = '';
    } else if (action === 'dead') {
      pairUpdates.status         = 'completed';
      pairUpdates.closing_reason = 'dead';
      pairUpdates.next_action    = 'dead';
      pairUpdates.next_collect_date = '';
      pairUpdates.rest_until_date   = '';
    }

    await API.pairing.update(pairUpdates).catch(function(e) {
      console.warn('pairing update failed:', e.message);
    });

    // ── 死亡の場合: ♀個体ステータスを dead に変更 ────────────
    if (action === 'dead') {
      const pair = (Store.getDB('pairings') || []).find(function(p) {
        return p.set_id === setId;
      });
      const motherParId = pair && pair.mother_par_id;
      if (motherParId) {
        // 種親台帳から個体IDを逆引き
        const parents = Store.getDB('parents') || [];
        const mother  = parents.find(function(p) { return p.par_id === motherParId; });
        const indId   = mother && mother.ind_id; // 種親昇格時に設定される ind_id
        if (indId) {
          await API.individual.update({
            ind_id:       indId,
            status:       'dead',
            note_private: '[自動] 産卵セット ' + setId + ' 終了時に死亡として記録',
          }).catch(function(e) {
            console.warn('individual dead update failed:', e.message);
          });
        }
      }
    }

    Pages.pairingDetail(setId);
  } catch(e) {}
};


// ── 採卵履歴 1件編集モーダル ────────────────────────────────────
Pages._pairEditOneEgg = async function (eggRecordId, setId) {
  // ① まず既存データを取得してからモーダルを開く
  let rec = null;
  try {
    UI.loading(true);
    const res = await API.pairing.getEggRecords({ set_id: setId });
    rec = (res.egg_records || []).find(r => r.egg_record_id === eggRecordId) || null;
  } catch(e) {
    UI.toast('記録の取得に失敗しました: ' + e.message, 'error');
    return;
  } finally {
    UI.loading(false);
  }

  if (!rec) { UI.toast('記録が見つかりません', 'error'); return; }

  // ② 取得したデータで初期値を設定してモーダルを開く
  const toInput = d => d ? String(d).replace(/\//g, '-') : '';
  const setDate  = toInput(rec.round_set_date);
  const eggDate  = toInput(rec.collect_date);
  const eggCount   = rec.egg_count    !== undefined ? rec.egg_count    : 0;
  const hatchCnt   = rec.hatch_count  !== undefined ? rec.hatch_count  : 0;
  const failedCnt  = rec.failed_count !== undefined ? rec.failed_count : 0;
  const note       = rec.note || '';

  _showModal('採卵履歴を編集', `
    <div class="form-section">
      ${UI.field('今回のセット日', `<input type="date" id="edit-egg-set-date" class="input" value="${setDate}">`)}
      ${UI.field('採卵日',         `<input type="date" id="edit-egg-date"     class="input" value="${eggDate}">`)}
      <div class="form-row-2">
        ${UI.field('採卵数',     `<input type="number" id="edit-egg-count"   class="input" min="0" value="${eggCount}">`)}
        ${UI.field('孵化確認数', `<input type="number" id="edit-hatch-count" class="input" min="0" value="${hatchCnt}">`)}
      </div>
      <div class="form-row-2">
        ${UI.field('腐卵数（無精卵・潰れ等）', `<input type="number" id="edit-egg-failed" class="input" min="0" value="${failedCnt}" placeholder="無精卵・潰れ等">`)}
        <div></div>
      </div>
      ${UI.field('メモ', `<input type="text" id="edit-egg-note" class="input" value="${note}">`)}
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2"
          onclick="Pages._pairSaveEditEgg('${eggRecordId}','${setId}')">保存</button>
      </div>
    </div>`);
};

Pages._pairSaveEditEgg = async function (eggRecordId, setId) {
  const setDate  = (document.getElementById('edit-egg-set-date')?.value || '').replace(/-/g,'/');
  const date     = (document.getElementById('edit-egg-date')?.value     || '').replace(/-/g,'/');
  const eggs     = +document.getElementById('edit-egg-count')?.value    || 0;
  const hatch    = +document.getElementById('edit-hatch-count')?.value  || 0;
  const failed   = +document.getElementById('edit-egg-failed')?.value   || 0;
  const note     = document.getElementById('edit-egg-note')?.value      || '';
  // 採卵日は任意（空でも登録可）
  _closeModal();
  try {
    await apiCall(
      () => API.pairing.updateEgg({
        egg_record_id:  eggRecordId,
        round_set_date: setDate,
        collect_date:   date,
        egg_count:      eggs,
        hatch_count:    hatch,
        failed_count:   failed,
        note,
      }),
      '採卵記録を更新しました'
    );
    Pages.pairingDetail(setId);
  } catch(e) {}
};

// 採卵記録削除は右上…メニューからのみ（カード直削除は廃止）

// ── 採卵履歴一覧編集モーダル（メニューから） ────────────────────
Pages._pairEditEggModal = async function (setId) {
  try {
    const res = await API.pairing.getEggRecords({ set_id: setId });
    const records = (res.egg_records || []).sort(
      (a,b) => String(a.collect_date).localeCompare(String(b.collect_date))
    );
    if (!records.length) { UI.toast('採卵記録がありません', 'error'); return; }
    const listHtml = records.map((rec, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:.85rem;font-weight:600">${i+1}回目: ${rec.collect_date||'—'}</div>
          <div style="font-size:.75rem;color:var(--text3)">採卵${rec.egg_count||0}個 / 孵化${rec.hatch_count||0}頭 / 腐卵${rec.failed_count||0}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-ghost btn-sm" style="font-size:.75rem"
            onclick="_closeModal();Pages._pairEditOneEgg('${rec.egg_record_id}','${setId}')">✏️</button>
          <button class="btn btn-ghost btn-sm" style="font-size:.75rem;color:var(--red,#e05555)"
            onclick="Pages._pairDeleteEgg('${rec.egg_record_id}','${setId}')">🗑</button>
        </div>
      </div>`).join('');
    _showModal('採卵履歴を編集', `
      <div style="max-height:60vh;overflow-y:auto">${listHtml}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="_closeModal()">閉じる</button>
      </div>`);
  } catch(e) { UI.toast('取得失敗: ' + e.message, 'error'); }
};

// _pairComplete / _pairFail はセット詳細下部のボタン（採卵記録なしで完了させる場合）
Pages._pairComplete = async function (id) {
  const pair = (Store.getDB('pairings')||[]).find(p=>p.set_id===id)||{};
  const motherDead = await new Promise(resolve => {
    UI.modal(`
      <div class="modal-title">産卵セット完了</div>
      <div style="font-size:.85rem;color:var(--text2);padding:8px 0 12px">
        ♀（${pair.mother_display_name||'母虫'}）の状態を選択してください
      </div>
      <div class="modal-footer" style="flex-direction:column;gap:8px">
        <button class="btn btn-primary" style="width:100%" onclick="UI.closeModal();window._pairCompleteResolve(false)">
          ♀は生存中（通常完了）
        </button>
        <button class="btn" style="width:100%;background:rgba(224,80,80,.15);border:2px solid var(--red,#e05050);color:var(--red,#e05050);font-weight:700"
          onclick="UI.closeModal();window._pairCompleteResolve(true)">
          💀 ♀は死亡した（死亡として記録）
        </button>
        <button class="btn btn-ghost" style="width:100%" onclick="UI.closeModal();window._pairCompleteResolve(null)">
          キャンセル
        </button>
      </div>
    `);
    window._pairCompleteResolve = resolve;
  });
  if (motherDead === null) return;
  try {
    await apiCall(() => API.pairing.update({
      set_id: id, status: 'completed',
      closing_reason: motherDead ? 'mother_dead' : 'completed',
      next_action: 'completed',
      next_collect_date: '', rest_until_date: '',
    }), motherDead ? '完了（♀死亡）として記録しました' : '完了にしました');
    // ♀死亡の場合は種親ステータスを自動更新
    if (motherDead && pair.mother_par_id) {
      try {
        await API.parent.update({ par_id: pair.mother_par_id, status: 'dead' });
        UI.toast('♀の種親ステータスを「死亡」に更新しました', 'info', 2500);
      } catch(_e) {
        UI.toast('種親ステータスの更新に失敗しました（手動で更新してください）', 'error', 4000);
      }
    }
    Pages.pairingDetail(id);
  } catch(e){}
};

Pages._pairFail = async function (id) {
  if (!UI.confirm('失敗として記録しますか？')) return;
  try {
    await apiCall(() => API.pairing.update({
      set_id: id, status: 'failed',
      closing_reason: 'failed', next_action: 'failed',
      next_collect_date: '', rest_until_date: '',
    }), '失敗として記録しました');
    Pages.pairingDetail(id);
  } catch(e){}
};

// ── 採卵記録を削除 ───────────────────────────────────────────────
// 削除後に産卵セットの集計（採卵数・孵化数・孵化率・最終採卵日）を再計算して更新する
Pages._pairDeleteEgg = async function (eggRecordId, setId) {
  if (!UI.confirm('この採卵記録を削除しますか？\n削除後は元に戻せません。')) return;

  _closeModal(); // 一覧モーダルを閉じる

  try {
    // ① 採卵記録を削除
    await apiCall(
      () => API.pairing.deleteEgg({ egg_record_id: eggRecordId }),
      '採卵記録を削除しました'
    );

    // ② 削除後の全記録を再取得して集計を再計算
    const res = await API.pairing.getEggRecords({ set_id: setId });
    const remaining = res.egg_records || [];

    const totalEggs  = remaining.reduce((s, r) => s + (parseInt(r.egg_count,  10) || 0), 0);
    const totalHatch = remaining.reduce((s, r) => s + (parseInt(r.hatch_count, 10) || 0), 0);
    const hatchRate  = totalEggs > 0
      ? Math.round(totalHatch / totalEggs * 100) : 0;

    // 最終採卵日（日付降順で最新）
    const lastCollect = remaining
      .map(r => r.collect_date || '')
      .filter(Boolean)
      .sort()
      .pop() || '';

    // ③ 産卵セットの集計フィールドを更新
    await API.pairing.update({
      set_id:       setId,
      total_eggs:   totalEggs,
      total_hatch:  totalHatch,
      hatch_rate:   hatchRate,
    }).catch(function(e) {
      console.warn('pairing集計更新失敗:', e.message);
    });

    // ④ ローカルキャッシュも更新
    Store.patchDBItem('pairings', 'set_id', setId, {
      total_eggs:  totalEggs,
      total_hatch: totalHatch,
      hatch_rate:  hatchRate,
    });

    // ⑤ セット詳細を再描画
    Pages.pairingDetail(setId);

  } catch(e) {
    // エラー時も詳細画面に戻る
    Pages.pairingDetail(setId);
  }
};

// ── 産卵セット登録・編集 ─────────────────────────────────────────
Pages.pairingNew = function (params = {}) {
  const main    = document.getElementById('main');
  const isEdit  = !!params.editId;
  const pair    = isEdit ? (Store.getDB('pairings')||[]).find(p=>p.set_id===params.editId) : null;
  const parents = Store.getDB('parents') || [];
  const males   = parents.filter(p => p.sex==='♂' && (!p.status||p.status==='active'));
  const females = parents.filter(p => p.sex==='♀' && (!p.status||p.status==='active'));
  const v       = (f, d='') => pair ? (pair[f]!==undefined ? pair[f] : d) : d;
  const today   = new Date().toISOString().split('T')[0];

  main.innerHTML = `
    ${UI.header(isEdit ? '産卵セット編集' : '産卵セット登録', { back: true })}
    <div class="page-body">
      <form id="pair-form" class="form-section">
        <div class="form-title">ペアリング情報</div>
        ${UI.field('♂親（父）', UI.select('father_par_id', males.map(p=>({code:p.par_id,label:`${p.parent_display_id||p.display_name}${p.size_mm?'（'+p.size_mm+'mm）':''}`})), v('father_par_id')), true)}
        ${UI.field('♀親（母）', UI.select('mother_par_id', females.map(p=>({code:p.par_id,label:`${p.parent_display_id||p.display_name}${p.size_mm?'（'+p.size_mm+'mm）':''}`})), v('mother_par_id')), true)}
        ${UI.field('セット名（任意）', UI.input('set_name','text',v('set_name'),'例: 2025-A1ライン'))}
        <div class="form-title">日付</div>
        <div class="form-row-2">
          ${/* ★ 修正①: 編集時は既存のpairing_startを使う。新規時のみtodayをデフォルトにする */ ''}
          ${UI.field('ペアリング日', UI.input('pairing_start','date', isEdit ? v('pairing_start') : (v('pairing_start')||today)), true)}
          ${UI.field('セット開始日', UI.input('set_start','date',v('set_start')))}
        </div>
        <div class="form-row-2">
          ${UI.field('セット終了日', UI.input('set_end','date',v('set_end')))}
          <div></div>
        </div>

        <div class="form-title">環境</div>
        <div class="form-row-2">
          ${UI.field('温度(℃)',  UI.input('temp_c','number',v('temp_c','24'),'例: 24'))}
          ${UI.field('湿度(%)',  UI.input('humidity_pct','number',v('humidity_pct'),'例: 70'))}
        </div>
        ${UI.field('マット情報', UI.input('mat_info','text',v('mat_info'),'例: T0マット'))}
        ${UI.field('メモ', UI.textarea('note',v('note'),2,''))}

        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="button" class="btn btn-ghost" style="flex:1" onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2" onclick="Pages._pairSave('${isEdit?params.editId:''}')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>`;
};

Pages._pairSave = async function (editId) {
  const form = document.getElementById('pair-form');
  if (!form) return;
  const data = UI.collectForm(form);
  if (!data.father_par_id || !data.mother_par_id) { UI.toast('♂親と♀親を選択してください','error'); return; }
  if (!data.pairing_start) { UI.toast('ペアリング日を入力してください','error'); return; }
  ['pairing_start','set_start','set_end'].forEach(k => { if (data[k]) data[k]=data[k].replace(/-/g,'/'); });
  try {
    if (editId) {
      data.set_id = editId;
      await apiCall(() => API.pairing.update(data), '更新しました');
      await syncAll(true);
      routeTo('pairing-detail', { pairingId: editId });
    } else {
      const res = await apiCall(() => API.pairing.create(data), '産卵セットを登録しました');
      await syncAll(true);
      // ライン自動生成の通知
      if (res.auto_line) {
        UI.toast('ライン ' + res.auto_line.display_id + ' を自動作成しました', 'success');
      }
      routeTo('pairing-detail', { pairingId: res.set_id });
    }
  } catch(e) {}
};

Pages._pairGoLotNew = function (directLineId, motherParId, fatherParId, setId) {
  let lineId = directLineId || '';
  const lines = Store.getDB('lines') || [];

  // 1. pair.line_id が直接渡された場合はそのまま使う
  // 2. 空なら母親IDで検索
  if (!lineId && motherParId) {
    const m = lines.find(l => l.mother_par_id === motherParId);
    if (m) lineId = m.line_id;
  }
  // 3. まだ空なら父親IDで検索（フォールバック）
  if (!lineId && fatherParId) {
    const f = lines.find(l => l.father_par_id === fatherParId);
    if (f) lineId = f.line_id;
  }
  // 4. 内部IDパターン確認（LINE- で始まるか）
  if (lineId && !lineId.startsWith('LINE-')) lineId = '';

  if (!lineId) {
    // ラインが特定できない場合: 選択肢を表示
    UI.modal(`
      <div class="modal-title">⚠️ ラインを選択してください</div>
      <div style="font-size:.82rem;color:var(--text2);padding:8px 0 12px">
        この産卵セットのラインが特定できません。<br>登録先ラインを選択してください。
      </div>
      <div class="form-section">
        ${UI.field('ライン', `<select id="plgn-line" class="input">
          <option value="">— 選択 —</option>
          ${lines.map(l => `<option value="${l.line_id}">${l.line_code||l.display_id}${l.line_name?' / '+l.line_name:''}</option>`).join('')}
        </select>`, true)}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:2" onclick="
          const v=document.getElementById('plgn-line')?.value;
          if(!v){UI.toast('ラインを選択してください','error');return;}
          UI.closeModal();routeTo('egg-lot-bulk',{lineId:v,setId:''})
        ">卵ロット作成へ</button>
      </div>
    `);
    return;
  }
  routeTo('egg-lot-bulk', { lineId, setId: setId || '' });
};

window.PAGES = window.PAGES || {};
window.PAGES['pairing-list']   = () => Pages.pairingList();
window.PAGES['pairing-detail'] = () => Pages.pairingDetail(Store.getParams().pairingId || Store.getParams().id);
window.PAGES['pairing-new']    = () => Pages.pairingNew(Store.getParams());
