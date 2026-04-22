// FILE: js/pages/manage.js
// build: 20260422q
// 変更点:
//   - [20260422q] 販売管理のアイコンを 👑 → 💰 に変更（種親候補の 👑 と重複回避）
//   - [20260422p] 管理画面のアイコン・並び替え（ユーザー要望）
//     新しい並び順:
//       🔗 ライン管理 / 🥚 産卵セット / 🐛 飼育管理 /
//       ♂♀ 種親管理 / 👑 種親候補 / 🧬 血統管理 / 💰 販売管理
//     変更内容:
//       ① 「🥚🔗 ロット・ユニット管理」→「🐛 飼育管理」にリネーム
//          (既存 lot-list ページはロット/ユニットタブを持つので当面このままで OK。
//           将来は 飼育管理 ページで個体タブも追加予定)
//       ② 「🌿 産卵セット」のアイコンを 🥚 に変更
//       ③ 「📦 ユニット管理」エントリを削除 (lot-list のユニットタブと重複)
//       ④ 「飼育管理」の sub に個体件数も表示（ロット/ユニット/個体の統一ビュー準備）
//     既存リンク (line-list, pairing-list, lot-list, parent-list,
//       parent-candidate, bloodline-list, sale-list) はすべてそのまま維持。
//     既存のブックマーク・QRコード・各ページからのリンクはすべて動作継続。
//   - [20260420b] ページ先頭に未確定セッションバナー追加（UI.pendingBanner()）
//   - [20260416c] 管理画面クイック登録に「✨ ヤフオク出品文AIジェネレーター」ボタンを追加
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 管理メニュー ─────────────────────────────────────────────────
Pages.manage = function () {
  const main  = document.getElementById('main');
  const lines = Store.getDB('lines')     || [];
  const lots  = Store.getDB('lots')      || [];
  const pars  = Store.getDB('parents')   || [];
  const blds  = Store.getDB('bloodlines')|| [];
  const pairs = Store.getDB('pairings')  || [];

  const actLots  = lots.filter(l => l.status === 'active');
  const actPars  = pars.filter(p => !p.status || p.status === 'active');
  const actPairs = pairs.filter(p => p.status === 'active');
  // [20260422p] 飼育管理セクションの集計用に個体・ユニット件数も先に計算
  const activeUnits = (Store.getDB('breeding_units') || []).filter(u => u.status === 'active').length;
  const allInds     = Store.getDB('individuals') || [];
  const activeInds  = allInds.filter(i => {
    const s = i.status || 'alive';
    return s === 'alive' || s === 'larva' || s === 'prepupa' || s === 'pupa' || s === 'adult';
  }).length;

  // [20260422p] 並び順・アイコンをユーザー要望通りに変更:
  //   ① ライン管理   ② 産卵セット   ③ 飼育管理   ④ 種親管理
  //   ⑤ 種親候補     ⑥ 血統管理    ⑦ 販売管理
  const sections = [
    {
      icon: '🔗', label: 'ライン管理', count: lines.length, unit: 'ライン',
      page: 'line-list', newPage: 'line-new',
      sub: `${lines.filter(l=>l.status!=='closed').length}ライン進行中`,
      color: 'var(--gold)',
    },
    {
      icon: '🥚', label: '産卵セット', count: actPairs.length, unit: 'セット',
      page: 'pairing-list', newPage: 'pairing-new',
      sub: `完了 ${pairs.filter(p=>p.status==='completed').length}件`,
      color: '#a0c878',
    },
    {
      // [20260422p] 🐛 飼育管理 = 旧「ロット・ユニット管理」のリネーム
      //   lot-list ページは既にロット/ユニット2タブを持つ。
      //   将来的に「個体」タブも追加して完全統合予定。
      icon: '🐛', label: '飼育管理',
      count: actLots.length + activeUnits + activeInds,
      unit: '件',
      page: 'lot-list', newPage: 'lot-new',
      sub: `ロット${actLots.length} / ユニット${activeUnits} / 個体${activeInds}`,
      color: 'var(--green)',
    },
    {
      icon: '♂♀', label: '種親管理', count: actPars.length, unit: '頭',
      page: 'parent-list', newPage: 'parent-new',
      sub: `♂${actPars.filter(p=>p.sex==='♂').length} / ♀${actPars.filter(p=>p.sex==='♀').length}`,
      color: 'var(--blue)',
    },
    {
      icon: '👑', label: '種親候補',
      count: allInds.filter(i=>String(i.parent_flag||'').toLowerCase()==='true'||i.parent_flag===true).length,
      unit: '頭',
      page: 'parent-candidate', newPage: null,
      sub: '昇格候補個体',
      color: 'var(--gold)',
    },
    {
      icon: '🧬', label: '血統管理',
      count: blds.filter(b=>b.bloodline_id!=='BLD-UNKNOWN').length, unit: '血統',
      page: 'bloodline-list', newPage: 'bloodline-new',
      sub: `確定 ${blds.filter(b=>b.bloodline_status==='confirmed').length}件${blds.some(b=>b.bloodline_id==='BLD-UNKNOWN') ? ' / うち不明1件' : ''}`,
      color: 'var(--amber)',
    },
    {
      icon: '💰', label: '販売管理',
      count: allInds.filter(i => i.status === 'sold').length,
      unit: '頭販売済み',
      page: 'sale-list', newPage: null,
      sub: (() => {
        const selling = allInds.filter(i => i.status === 'for_sale' || i.status === 'listed').length;
        return selling ? `販売候補・出品中 ${selling}頭` : '販売候補なし';
      })(),
      color: 'var(--green)',
    },
  ];

  main.innerHTML = `
    ${UI.header('管理', {})}
    <div class="page-body">

      <!-- [20260420b] 未確定セッション通知バナー -->
      ${UI.pendingBanner ? UI.pendingBanner() : ''}

      <!-- 管理カード一覧 -->
      ${sections.map(s => `
        <div class="card" style="cursor:pointer" onclick="routeTo('${s.page}')">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:1.8rem;min-width:44px;text-align:center">${s.icon}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:.95rem">${s.label}</div>
              <div style="font-size:.75rem;color:var(--text3);margin-top:2px">${s.sub}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:1.5rem;font-weight:700;color:${s.color}">${s.count}</div>
              <div style="font-size:.65rem;color:var(--text3)">${s.unit}</div>
            </div>
            <div style="color:var(--text3);font-size:1.2rem;margin-left:4px">›</div>
          </div>
        </div>`).join('')}

      <!-- クイック登録 -->
      <div class="card">
        <div class="card-title">クイック登録</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-ghost" onclick="routeTo('line-new')">＋ ライン登録</button>
          <button class="btn btn-ghost" onclick="routeTo('lot-new')">＋ ロット登録</button>
          <button class="btn btn-ghost" onclick="routeTo('parent-new')">＋ 種親登録</button>
          <button class="btn btn-ghost" onclick="routeTo('bloodline-new')">＋ 血統登録</button>
          <button class="btn btn-ghost" onclick="routeTo('pairing-new')">＋ 産卵セット</button>
          <button class="btn btn-ghost" onclick="routeTo('ind-new')">＋ 個体登録</button>
          <button class="btn btn-ghost" onclick="Pages._quickAddPairing()"
            style="grid-column:span 2;border-color:rgba(80,200,120,.35);color:var(--green)">
            💕 ペアリング履歴を追加
          </button>
          <button class="btn btn-ghost" onclick="routeTo('label-gen')"
            style="grid-column:span 2;border-color:rgba(200,168,75,.4);color:var(--gold)">
            🏷️ ラベル発行・QRコード生成
          </button>
          <button class="btn btn-ghost" onclick="routeTo('egg-lot-bulk')"
            style="grid-column:span 2;border-color:rgba(155,89,182,.4);color:#c39bd3;font-weight:700">
            🥚 卵ロット一括作成
          </button>
          <button class="btn btn-ghost" onclick="routeTo('sale-listing')"
            style="grid-column:span 2;border-color:rgba(76,175,120,.4);color:var(--green);font-weight:700">
            ✨ ヤフオク出品文AIジェネレーター（Gemini 無料）
          </button>
        </div>
      </div>

    </div>`;

  // Phase2: 分析セクションをDOMに後追加
  const pb = main.querySelector('.page-body');
  if (pb) {
    pb.insertAdjacentHTML('beforeend', `
      <div class="card" style="margin-top:8px">
        <div class="card-title">📊 分析・ランキング</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-ghost" onclick="routeTo('parent-dashboard')">🌡️ 種親ダッシュボード</button>
          <button class="btn btn-ghost" onclick="routeTo('line-analysis')">📈 ライン分析</button>
          <button class="btn btn-ghost" onclick="routeTo('mother-ranking')">♀ 母系ランキング</button>
          <button class="btn btn-ghost" onclick="routeTo('heatmap')">🗺️ 血統ヒートマップ</button>
          <button class="btn btn-ghost" onclick="routeTo('bloodline-analysis')"
            style="grid-column:span 2;border-color:rgba(91,168,232,.35);color:var(--blue);font-weight:700">
            🧬 血統×成長 相関分析（父系・母系タグ別ランキング）
          </button>
          <button class="btn btn-ghost" onclick="routeTo('growth-charts')"
            style="grid-column:span 2;border-color:rgba(200,168,75,.4);color:var(--gold);font-weight:700">
            📊 成長分布グラフ（体重分布・ライン比較・成長曲線・還元率）
          </button>
        </div>
      </div>`);
  }
};


// ════════════════════════════════════════════════════════════════
// ライン一覧・詳細・登録（manage.js に内包）
// ════════════════════════════════════════════════════════════════

Pages.lineList = function () {
  const main  = document.getElementById('main');
  const lines = Store.getDB('lines') || [];
  const open  = lines.filter(l => l.status !== 'closed');
  const closed= lines.filter(l => l.status === 'closed');

  main.innerHTML = `
    ${UI.header('ライン一覧', { action: { fn: "routeTo('line-new')", icon: '＋' } })}
    <div class="page-body">
      <div class="sec-hdr">
        <span class="sec-title">${open.length}ライン（進行中）</span>
        ${closed.length ? `<span class="sec-more" onclick="Pages._lineShowClosed()">終了済 ${closed.length}</span>` : ''}
      </div>
      <div id="line-list-body">
        ${open.length
          ? open.map(_lineCardHTML).join('')
          : UI.empty('ラインがありません', '右上の＋から登録できます')}
      </div>
    </div>`;
};

function _lineCardHTML(line) {
  try {
    var f = Store.getParent(line.father_par_id);
    var m = Store.getParent(line.mother_par_id);
    var lineCode = line.line_code || line.display_id || '?';
    var year     = line.hatch_year || '—';
    var fName = f ? (f.parent_display_id || f.display_name || '') : '';
    var mName = m ? (m.parent_display_id || m.display_name || '') : '';
    var fSize = f && f.size_mm ? f.size_mm + 'mm' : '';
    var mSize = m && m.size_mm ? m.size_mm + 'mm' : '';
    var _tags = function(t) { try { return (JSON.parse(t||'[]')||[]).slice(0,3).join(' '); } catch(e){ return ''; } };
    var fRaw  = f ? (f.bloodline_raw || '') : '';
    var mRaw  = m ? (m.bloodline_raw || '') : '';
    var fTag  = f ? _tags(f.bloodline_tags) : '';
    var mTag  = m ? _tags(m.maternal_tags || '') : '';
    var fBlood = (fRaw || fTag || '').slice(0, 28);
    var mBlood = (mRaw || mTag || '').slice(0, 28);
    var fPart = fName
      ? '<span style="color:var(--male,#5ba8e8)">♂</span>'
        + (fSize ? '<strong style="font-size:.88rem;margin-right:2px"> ' + fSize + '</strong>' : '')
        + '<span style="color:var(--text3);font-size:.72rem">' + fName + '</span>'
      : '';
    var mPart = mName
      ? '<span style="color:var(--female,#e87fa0)">♀</span>'
        + (mSize ? '<strong style="font-size:.88rem;margin-right:2px"> ' + mSize + '</strong>' : '')
        + '<span style="color:var(--text3);font-size:.72rem">' + mName + '</span>'
      : '';
    var parentRow = (fPart || mPart)
      ? '<div style="display:flex;gap:10px;flex-wrap:wrap;font-size:.8rem;margin-bottom:2px">'
        + (fPart ? '<span>' + fPart + '</span>' : '')
        + (mPart ? '<span>' + mPart + '</span>' : '')
        + '</div>'
      : '<div style="font-size:.8rem;color:var(--text3)">親情報なし</div>';
    var bloodRow = (fBlood || mBlood)
      ? '<div style="font-size:.72rem;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">'
        + [fBlood, mBlood].filter(Boolean).join(' × ') + '</div>'
      : '';
    var locRow = (line.locality || line.generation)
      ? '<div style="font-size:.7rem;color:var(--text3);margin-top:2px">'
        + [line.locality, line.generation].filter(Boolean).join(' / ') + '</div>'
      : '';
    return '<div class="card" style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;margin-bottom:8px"'
      + ' onclick="routeTo(\'line-detail\',{lineId:\'' + line.line_id + '\'})">'
      + '<div style="min-width:48px;text-align:center;flex-shrink:0">'
      +   '<div style="font-family:var(--font-mono);font-size:1.35rem;font-weight:800;color:var(--gold);line-height:1">' + lineCode + '</div>'
      +   '<div style="font-size:.65rem;color:var(--text3);margin-top:3px">' + year + '</div>'
      + '</div>'
      + '<div style="flex:1;min-width:0">'
      +   parentRow + bloodRow + locRow
      + '</div>'
      + '<div style="color:var(--text3);font-size:1.1rem">›</div>'
      + '</div>';
  } catch(e) {
    var code = line.line_code || line.display_id || '?';
    return '<div class="card" style="padding:12px 14px;cursor:pointer;margin-bottom:8px"'
      + ' onclick="routeTo(\'line-detail\',{lineId:\'' + (line.line_id||'') + '\'})">'
      + '<div style="font-size:1.1rem;font-weight:700;color:var(--gold)">' + code + '</div>'
      + '</div>';
  }
}

Pages._lineShowClosed = function () {
  const closed = (Store.getDB('lines') || []).filter(l => l.status === 'closed');
  document.getElementById('line-list-body')?.insertAdjacentHTML(
    'beforeend', `<div style="opacity:.5">${closed.map(_lineCardHTML).join('')}</div>`
  );
};

Pages.lineDetail = async function (lineId) {
  if (lineId && typeof lineId === 'object') lineId = lineId.id || lineId.lineId || '';
  var main = document.getElementById('main');
  var line = Store.getLine(lineId);
  var hasCached = !!line;
  if (hasCached) {
    _renderLineDetail(line, main);
  } else {
    main.innerHTML = UI.header('ライン詳細', { back: true }) + UI.spinner();
  }
  try {
    var res = await API.line.get(lineId);
    if (Store.getPage() !== 'line-detail') return;
    line = res.line;
    if (Store.patchDBItem) Store.patchDBItem('lines', 'line_id', lineId, line);
    _renderLineDetail(line, main);
  } catch (e) {
    if (Store.getPage() !== 'line-detail') return;
    if (hasCached) {
      var pb = main.querySelector('.page-body');
      if (pb && !document.getElementById('line-warn-banner')) {
        var b = document.createElement('div');
        b.id = 'line-warn-banner';
        b.style.cssText = 'background:rgba(224,144,64,.1);border:1px solid rgba(224,144,64,.4);'
          + 'border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:.78rem';
        b.innerHTML = '<b style="color:var(--amber)">⚠️ 最新情報の取得に失敗しました</b>'
          + '<div style="color:var(--text2);margin-top:3px">表示中はキャッシュです。再読み込みをお試しください。</div>'
          + '<button class="btn btn-ghost btn-sm" style="margin-top:6px" id="line-retry-btn">🔄 再試行</button>';
        pb.insertBefore(b, pb.firstChild);
        var retryBtn = document.getElementById('line-retry-btn');
        if (retryBtn) retryBtn.addEventListener('click', function() { Pages.lineDetail(lineId); });
      }
    } else {
      main.innerHTML = UI.header('ライン詳細', { back: true })
        + '<div class="page-body">'
        + UI.empty('取得失敗: ' + e.message)
        + '<button class="btn btn-ghost btn-sm" style="margin-top:10px" id="line-err-retry">🔄 再試行</button>'
        + '</div>';
      var errRetry = document.getElementById('line-err-retry');
      if (errRetry) errRetry.addEventListener('click', function() { Pages.lineDetail(lineId); });
    }
  }
};

function _parentInfo(p, pBld, sexColor) {
  if (!p) return '<span style="color:var(--text3)">—（未設定）</span>';
  const bldStr  = pBld ? (pBld.abbreviation || pBld.bloodline_name || '') : '';
  const sizeStr = p.size_mm ? ' <strong>' + p.size_mm + 'mm</strong>' : '';
  return '<span style="cursor:pointer;color:' + sexColor + '" onclick="routeTo(\x27parent-detail\x27,{parId:\x27' + p.par_id + '\x27})">'
    + (p.parent_display_id || p.display_name) + sizeStr
    + (bldStr ? '<span style="color:var(--text3);font-size:.78rem"> / ' + bldStr + '</span>' : '')
    + '</span>';
}

function _renderLineDetail(line, main) {
  try {
    const f    = Store.getParent(line.father_par_id);
    const m    = Store.getParent(line.mother_par_id);
    const bld  = Store.getBloodline(line.bloodline_id);
    const blds = Store.getDB('bloodlines') || [];
    const fBld = f && f.bloodline_id ? blds.find(b=>b.bloodline_id===f.bloodline_id) : null;
    const mBld = m && m.bloodline_id ? blds.find(b=>b.bloodline_id===m.bloodline_id) : null;
    const _lotsById  = Store.filterLots({ line_id: line.line_id, status: 'all' });
    const _pairingSetIds = new Set((Store.getDB('pairings') || []).map(p => p.set_id).filter(Boolean));
    const _lotsByPairing = (Store.getDB('lots') || []).filter(l =>
      l.pairing_set_id && _pairingSetIds.has(l.pairing_set_id) &&
      !_lotsById.some(x => x.lot_id === l.lot_id)
    );
    const allLots    = [..._lotsById, ..._lotsByPairing];
    const activeLots = allLots.filter(l => l.status === 'active');
    const allInds    = Store.getIndividualsByLine(line.line_id);
    const aliveInds  = allInds.filter(i => i.status !== 'dead');
    const allPairings = Store.getDB('pairings') || [];
    const pairings = allPairings.filter(p => {
      if (p.line_id === line.line_id) return true;
      if (!p.line_id && line.father_par_id && line.mother_par_id) {
        return (p.father_par_id === line.father_par_id && p.mother_par_id === line.mother_par_id);
      }
      return false;
    });
    const eggRecords  = Store.getDB('egg_records') || [];
    const lineEggRecs = eggRecords.filter(r => pairings.some(p => p.set_id === r.set_id));
    const totalEggs   = lineEggRecs.length > 0
      ? lineEggRecs.reduce((s, r) => s + (parseInt(r.egg_count, 10) || 0), 0)
      : pairings.reduce((s, p) => s + (parseInt(p.total_eggs, 10) || 0), 0);
    const rottenEggs  = lineEggRecs.reduce((s, r) => s + (parseInt(r.failed_count, 10) || 0), 0);
    const rootLots     = allLots.filter(l => !l.parent_lot_id || l.parent_lot_id === '');
    const lotInitTotal = rootLots.reduce((s, l) => s + (parseInt(l.initial_count, 10) || 0), 0);
    const allLotIds   = new Set(allLots.map(l => l.lot_id));
    const directInds  = allInds.filter(i => !i.lot_id || i.lot_id === '' || !allLotIds.has(i.lot_id));
    const unLotEggs   = Math.max(0, totalEggs - rottenEggs - lotInitTotal - directInds.length);
    const lotCurrentTotal = activeLots.reduce((s, l) => s + (parseInt(l.count, 10) || 0), 0);
    const attritionTotal  = allLots.reduce((s, l) => s + (parseInt(l.attrition_total, 10) || 0), 0);

    main.innerHTML = `
    ${UI.header(line.display_id + ' 詳細', { back: true, action: { fn: "routeTo('line-new',{editId:'" + line.line_id + "'})", icon: '✏️' } })}
    <div class="page-body">
      <div class="card card-gold" style="padding:14px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between">
          <div>
            <div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--gold)">${line.display_id}</div>
            <div style="font-size:.82rem;color:var(--text2);margin-top:2px">
              ${line.line_name || ''}
              ${line.locality ? '&nbsp;·&nbsp;' + line.locality : ''}
              ${line.generation ? '&nbsp;·&nbsp;' + line.generation : ''}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:.65rem;color:var(--text3)">孵化年</div>
            <div style="font-weight:700">${line.hatch_year || '—'}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:12px">
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">採卵数</div>
            <div style="font-weight:700;font-size:1rem;color:var(--amber)">${totalEggs}</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">未配分卵</div>
            <div style="font-weight:700;font-size:1rem;color:var(--text2)">${unLotEggs}</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">ロット</div>
            <div style="font-weight:700;font-size:1rem;color:var(--blue)">${activeLots.length}</div>
            <div style="font-size:.62rem;color:var(--text3);margin-top:1px">${lotCurrentTotal}頭</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:8px 2px">
            <div style="font-size:.6rem;color:var(--text3)">個体</div>
            <div style="font-weight:700;font-size:1rem;color:var(--green)">${aliveInds.length}</div>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button style="flex:1;padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.9rem;
          background:var(--blue);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px"
          onclick="routeTo('lot-list',{line_id:'${line.line_id}'})">
          📦 ロット一覧<br><span style="font-size:1.1rem">${activeLots.length}</span>
        </button>
        <button style="flex:1;padding:14px 8px;border-radius:var(--radius);font-weight:700;font-size:.9rem;
          background:var(--green);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px"
          onclick="routeTo('ind-list',{line_id:'${line.line_id}'})">
          🐛 個体一覧<br><span style="font-size:1.1rem">${aliveInds.length}</span>
        </button>
        <button style="grid-column:1/2;padding:12px 8px;border-radius:var(--radius);font-weight:700;font-size:.9rem;
          background:rgba(155,89,182,.85);color:#fff;border:none;cursor:pointer"
          onclick="routeTo('egg-lot-bulk',{lineId:'${line.line_id}'})">
          🥚 卵ロット一括作成
        </button>
        <button style="grid-column:2/3;padding:12px 8px;border-radius:var(--radius);font-weight:700;font-size:.88rem;
          background:var(--surface3,#3a3a4a);color:var(--text1);border:1px solid var(--border);cursor:pointer"
          onclick="routeTo('ind-new',{lineId:'${line.line_id}'})">
          ＋ 個体追加
        </button>
      </div>
      ${pairings.length ? `
      <div class="card">
        <div class="card-title">🥚 産卵セット (${pairings.length}件)</div>
        ${pairings.map(p => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="font-family:var(--font-mono);font-size:.82rem;color:var(--blue);cursor:pointer"
              onclick="routeTo('pairing-detail',{pairingId:'${p.set_id}'})">
              ${p.display_id}
            </span>
            <span style="font-size:.78rem;color:var(--text3)">${p.pairing_start || '—'}</span>
            <span style="font-size:.78rem">${p.total_eggs ? p.total_eggs + '卵' : ''}</span>
          </div>`).join('')}
      </div>` : ''}
      <div class="card">
        <div class="card-title">親情報</div>
        <div class="info-list">
          ${_lnRow('<span style="color:var(--male)">♂親</span>', _parentInfo(f, fBld, 'var(--male)'))}
          ${_lnRow('<span style="color:var(--female)">♀親</span>', _parentInfo(m, mBld, 'var(--female)'))}
        </div>
      </div>
      <div class="card">
        <div class="card-title">血統・ライン情報</div>
        <div class="info-list">
          ${line.locality   ? _lnRow('産地', line.locality)   : ''}
          ${line.generation ? _lnRow('累代', line.generation) : ''}
          ${(()=>{
            const _parseTags2 = t => { try { const a = JSON.parse(t||'[]'); return Array.isArray(a) ? a.join(' / ') : String(a); } catch(e) { return ''; } };
            const fTags = f ? _parseTags2(f.bloodline_tags) : '';
            const mTags = m ? _parseTags2(m.bloodline_tags) : '';
            const fRaw  = f ? (f.bloodline_raw || '') : '';
            const mRaw  = m ? (m.bloodline_raw || '') : '';
            let rows = '';
            if (fRaw)  rows += _lnRow('父系血統', '<span style="font-size:.8rem;color:var(--text2)">' + fRaw.slice(0,40) + (fRaw.length>40?'…':'') + '</span>');
            if (fTags) rows += _lnRow('父系タグ', fTags);
            if (mRaw)  rows += _lnRow('母系血統', '<span style="font-size:.8rem;color:var(--text2)">' + mRaw.slice(0,40) + (mRaw.length>40?'…':'') + '</span>');
            if (mTags) rows += _lnRow('母系タグ', mTags);
            if (!fRaw && !mRaw && !fTags && !mTags && bld) {
              rows += _lnRow('血統', '<span style="cursor:pointer;color:var(--blue)" onclick="routeTo(\'bloodline-detail\',{bloodlineId:\'' + bld.bloodline_id + '\'})">' + bld.bloodline_name + '</span>');
            }
            return rows;
          })()}
          ${line.characteristics ? _lnRow('特徴', line.characteristics) : ''}
          ${line.hypothesis_tags ? _lnRow('仮説タグ', line.hypothesis_tags) : ''}
          ${line.note_private    ? _lnRow('内部メモ', line.note_private)   : ''}
        </div>
      </div>
      <!-- 成長グラフ（遅延ロード） -->
      <div class="card" style="padding:12px 14px" id="line-chart-section-${line.line_id}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:.8rem;font-weight:700;color:var(--text2)">📊 成長グラフ</div>
          <button class="btn btn-ghost btn-sm" onclick="Pages._lineExpandCharts('${line.line_id}')">グラフを表示</button>
        </div>
        <div id="line-chart-body-${line.line_id}" style="font-size:.76rem;color:var(--text3)">
          ボタンを押すとこのラインの成長グラフを表示します
        </div>
      </div>

      <div class="card" style="padding:10px 14px">
        <div style="font-size:.72rem;font-weight:700;color:var(--text3);letter-spacing:.06em;margin-bottom:8px">詳細集計</div>
        <div style="font-size:.78rem">
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text3)">採卵数</span><span style="font-weight:600">${totalEggs}個</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text3)">腐卵数</span>
            <span style="color:${rottenEggs>0?'var(--red)':'var(--text3)'};font-weight:600">${rottenEggs > 0 ? rottenEggs+'個' : '—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text3)">ロット化累計</span><span style="font-weight:600">${lotInitTotal}個</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text3)">直接個体化</span>
            <span style="color:${directInds.length>0?'var(--blue)':'var(--text3)'};font-weight:600">${directInds.length > 0 ? directInds.length+'頭' : '—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text3)">現在ロット内頭数</span><span style="font-weight:600">${lotCurrentTotal}頭</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0">
            <span style="color:var(--text3)">ロット内減耗</span>
            <span style="color:${attritionTotal>0?'var(--amber)':'var(--text3)'};font-weight:600">${attritionTotal > 0 ? attritionTotal+'頭' : '—'}</span>
          </div>
        </div>
      </div>
    </div>`;
  } catch(e) {
    main.innerHTML = UI.header((line && line.display_id) || 'ライン詳細', {back:true})
      + '<div class="page-body">' + UI.empty('表示エラー: ' + e.message) + '</div>';
  }
}

function _lnRow(key, val) {
  return `<div class="info-row">
    <span class="info-key">${key}</span>
    <span class="info-val">${val}</span>
  </div>`;
}

Pages._lineExpandCharts = function(lineId) {
  var body = document.getElementById('line-chart-body-' + lineId);
  if (!body) return;
  if (typeof Pages.growthChartsForLine !== 'function') {
    body.innerHTML = '<div style="font-size:.76rem;color:var(--amber)">growth_charts.jsが読み込まれていません</div>';
    return;
  }
  Pages.growthChartsForLine(lineId, 'line-chart-body-' + lineId);
  var section = document.getElementById('line-chart-section-' + lineId);
  if (section) {
    var btn = section.querySelector('button');
    if (btn) btn.style.display = 'none';
  }
};

Pages.lineNew = function (params = {}) {
  const main   = document.getElementById('main');
  const isEdit = !!params.editId;
  const line   = isEdit ? Store.getLine(params.editId) : null;
  const pars   = Store.getDB('parents')    || [];
  const blds   = Store.getDB('bloodlines') || [];
  const v = (f, d = '') => line ? (line[f] !== undefined ? line[f] : d) : (params[f] || d);
  const curYear = new Date().getFullYear();

  main.innerHTML = `
    ${UI.header(isEdit ? 'ライン編集' : 'ライン登録', { back: true })}
    <div class="page-body">
      <form id="line-form" class="form-section">
        <div class="form-title">ライン識別</div>
        <div class="form-row-2">
          ${UI.field('孵化年', UI.input('hatch_year', 'number', v('hatch_year', curYear), '例: 2025'), true)}
          ${UI.field('ラインコード', UI.input('line_code', 'text', v('line_code'), '例: A1 / B2'), true)}
        </div>
        ${UI.field('ライン名（任意）', UI.input('line_name', 'text', v('line_name'), '例: GGB超大型ライン'))}
        <div class="form-title">産地・累代</div>
        <div class="form-row-2">
          ${UI.field('産地', UI.input('locality', 'text', v('locality', 'Guadeloupe')))}
          ${UI.field('累代', UI.input('generation', 'text', v('generation'), '例: WF1 / CBF2'))}
        </div>
        <div class="form-title">メモ</div>
        ${UI.field('特徴', UI.textarea('characteristics', v('characteristics'), 2, '例: 父175mm × 母大型系'))}
        ${UI.field('仮説タグ', UI.input('hypothesis_tags', 'text', v('hypothesis_tags'), '例: 高タンパク,pH6.2'))}
        ${UI.field('内部メモ', UI.textarea('note_private', v('note_private'), 2, ''))}
        ${isEdit ? UI.field('ステータス',
          UI.select('status', [
            { code:'active', label:'進行中' },
            { code:'closed', label:'終了' },
          ], v('status', 'active'))) : ''}
        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="button" class="btn btn-ghost" style="flex:1" onclick="Store.back()">戻る</button>
          <button type="button" class="btn btn-primary" style="flex:2"
            data-edit-id="${isEdit ? params.editId : ''}"
            onclick="Pages._lineSave(this.dataset.editId || '')">
            ${isEdit ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>`;
};

Pages._lineSave = async function (editId) {
  if (!editId || editId === 'undefined') editId = '';
  const form = document.getElementById('line-form');
  if (!form) return;
  const data = UI.collectForm(form);
  if (!data.hatch_year) { UI.toast('孵化年を入力してください', 'error'); return; }
  if (!data.line_code)  { UI.toast('ラインコードを入力してください', 'error'); return; }
  try {
    if (editId) {
      data.line_id = editId;
      await apiCall(() => API.line.update(data), '更新しました');
      await syncAll(true);
      routeTo('line-detail', { lineId: editId });
    } else {
      const res = await apiCall(() => API.line.create(data), 'ラインを登録しました');
      await syncAll(true);
      routeTo('line-detail', { lineId: res.line_id });
    }
  } catch (e) {
    UI.toast('エラー: ' + (e.message || '不明'), 'error');
  }
};

Pages._quickAddPairing = function () {
  const parents = Store.getDB('parents') || [];
  const males   = parents.filter(p => p.sex === '♂' && p.status !== 'dead');
  const females = parents.filter(p => p.sex === '♀' && p.status !== 'dead');
  const today   = new Date().toISOString().split('T')[0];

  UI.modal(`
    <div class="modal-title" style="font-size:1rem;font-weight:700;padding-bottom:10px">
      💕 ペアリング履歴を追加
    </div>
    <div class="form-section" style="max-height:60vh;overflow-y:auto">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        ${UI.field('♂（父）', `<select id="qp-male" class="input">
          <option value="">— 選択 —</option>
          ${males.map(p => `<option value="${p.par_id}">${p.parent_display_id||p.display_name}</option>`).join('')}
        </select>`, true)}
        ${UI.field('♀（母）', `<select id="qp-female" class="input">
          <option value="">— 選択 —</option>
          ${females.map(p => `<option value="${p.par_id}">${p.parent_display_id||p.display_name}</option>`).join('')}
        </select>`, true)}
      </div>
      ${UI.field('種別', `<select id="qp-type" class="input" onchange="Pages._qpTypeChange(this.value)">
        <option value="done_initial">初回ペアリング（実施済み）</option>
        <option value="done_repairing">再ペアリング（実施済み）</option>
        <option value="planned">再ペアリング（予定）</option>
      </select>`)}
      <div id="qp-date-row">
        ${UI.field('実施日', `<input type="date" id="qp-date" class="input" value="${today}">`)}
      </div>
      <div id="qp-planned-row" style="display:none">
        ${UI.field('予定日', `<input type="date" id="qp-planned" class="input" value="${today}">`)}
      </div>
      ${UI.field('メモ（任意）', `<input type="text" id="qp-memo" class="input" placeholder="例: 2回目交配">`)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>
      <button class="btn btn-primary" style="flex:2" onclick="Pages._saveQuickPairing()">保存</button>
    </div>
  `);
};

Pages._qpTypeChange = function (val) {
  const dateRow    = document.getElementById('qp-date-row');
  const plannedRow = document.getElementById('qp-planned-row');
  if (!dateRow || !plannedRow) return;
  if (val === 'planned') {
    dateRow.style.display    = 'none';
    plannedRow.style.display = '';
  } else {
    dateRow.style.display    = '';
    plannedRow.style.display = 'none';
  }
};

Pages._saveQuickPairing = async function () {
  const maleId   = document.getElementById('qp-male')?.value;
  const femaleId = document.getElementById('qp-female')?.value;
  const typeVal  = document.getElementById('qp-type')?.value || 'done_initial';
  const memo     = document.getElementById('qp-memo')?.value || '';
  if (!maleId)   { UI.toast('♂を選択してください', 'error'); return; }
  if (!femaleId) { UI.toast('♀を選択してください', 'error'); return; }
  const isPlanned = typeVal === 'planned';
  const type      = typeVal === 'done_initial' ? 'initial' : 'repairing';
  const status    = isPlanned ? 'planned' : 'done';
  let payload = { type, status, male_parent_id: maleId, female_parent_id: femaleId, memo };
  if (isPlanned) {
    const planned = document.getElementById('qp-planned')?.value;
    if (!planned) { UI.toast('予定日を選択してください', 'error'); return; }
    payload.planned_date = planned.replace(/-/g, '/');
  } else {
    const date = document.getElementById('qp-date')?.value;
    if (!date) { UI.toast('実施日を選択してください', 'error'); return; }
    payload.pairing_date = date.replace(/-/g, '/');
  }
  try {
    UI.loading(true);
    UI.closeModal();
    const res = await API.phase2.createPairingHistory(payload);
    Store.addDBItem('pairing_histories', {
      ...payload,
      pairing_id: res.pairing_id || ('tmp_' + Date.now()),
    });
    UI.toast(isPlanned ? '再ペアリング予定を登録しました' : 'ペアリング履歴を追加しました');
  } catch (e) {
    UI.toast('保存失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

window.PAGES = window.PAGES || {};
window.PAGES['manage']      = () => Pages.manage();
window.PAGES['line-list']   = () => Pages.lineList();
window.PAGES['line-detail'] = () => Pages.lineDetail(Store.getParams().lineId || Store.getParams().id);
window.PAGES['line-new']    = () => Pages.lineNew(Store.getParams());

// ════════════════════════════════════════════════════════════════
// ユニット一覧（unit-list）
// ════════════════════════════════════════════════════════════════
Pages._goUnitDetail = function(uid) { routeTo('unit-detail', { unitDisplayId: uid }); };

Pages.unitList = function (params) {
  params = params || {};
  const main  = document.getElementById('main');
  const units = Store.getDB('breeding_units') || [];
  const lines = Store.getDB('lines') || [];

  let filterPhase  = params._phase  || '';
  let filterStatus = params._status || 'active';

  function _lineCode(lineId) {
    const l = lines.find(x => x.line_id === lineId);
    return l ? (l.line_code || l.display_id || lineId) : lineId;
  }

  function _renderList() {
    let list = units.slice();
    if (filterPhase)  list = list.filter(u => u.stage_phase === filterPhase);
    if (filterStatus) list = list.filter(u => (u.status || 'active') === filterStatus);
    const el = document.getElementById('unit-list-body');
    if (!el) return;
    if (list.length === 0) { el.innerHTML = UI.empty('該当するユニットがありません'); return; }
    el.innerHTML = list.map(u => {
      const lc    = _lineCode(u.line_id);
      const phase = u.stage_phase || '—';
      const sc    = u.size_category || '—';
      const hc    = u.head_count || 2;
      const st    = u.status || 'active';
      const stBadge = st === 'individualized'
        ? `<span style="font-size:.62rem;color:var(--amber);background:rgba(224,144,64,.15);padding:1px 5px;border-radius:4px;margin-left:4px">個別化済</span>`
        : st === 'sold'
        ? `<span style="font-size:.62rem;color:var(--green);background:rgba(76,175,120,.15);padding:1px 5px;border-radius:4px;margin-left:4px">販売済</span>` : '';
      const phaseColor = phase === 'T2' ? 'var(--blue)' : phase === 'T3' ? 'var(--amber)' : 'var(--text3)';
      let srcLots = '';
      try {
        const sl = u.source_lots ? JSON.parse(u.source_lots) : [];
        if (sl.length > 0) {
          const names = sl.map(lid => { const lot = Store.getLot && Store.getLot(lid); return lot ? (lot.display_id || lid) : lid; });
          srcLots = `<div style="font-size:.68rem;color:var(--text3)">由来: ${names.join(' / ')}</div>`;
        }
      } catch(_e) {}
      const uid = (u.display_id || u.unit_id || '').replace(/['"]/g, '');
      return `<div class="card" style="cursor:pointer;padding:12px 14px" onclick="Pages._goUnitDetail('${uid}')">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:.88rem;font-weight:700;color:var(--gold)">${u.display_id||u.unit_id}${stBadge}</div>
            <div style="font-size:.72rem;color:var(--text3);margin-top:2px">L:${lc} / ${hc}頭 / 区分:${sc}</div>
            ${srcLots}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:.85rem;font-weight:700;color:${phaseColor}">${phase}</div>
            <div style="font-size:.62rem;color:var(--text3)">ステージ</div>
          </div>
          <div style="color:var(--text3);font-size:1.1rem">›</div>
        </div>
      </div>`;
    }).join('');
  }

  const phases = ['', 'T1', 'T2', 'T3'];
  const phaseLabels = { '': '全て', T1: 'T1', T2: 'T2', T3: 'T3' };
  const statuses = [{ v: 'active', label: '飼育中' }, { v: '', label: '全状態' }, { v: 'individualized', label: '個別化済' }];
  const activeCount = units.filter(u => (u.status || 'active') === 'active').length;

  main.innerHTML =
    UI.header('ユニット一覧', { back: true }) +
    `<div class="page-body">
      <div style="font-size:.78rem;color:var(--text3);margin-bottom:6px">計 ${units.length}件 / 飼育中 ${activeCount}件</div>
      <div class="filter-bar" style="margin-bottom:8px" id="phase-filter">
        ${phases.map(p => `<button class="pill ${filterPhase===p?'active':''}" onclick="Pages._unitPhaseFilter('${p}')">${phaseLabels[p]}</button>`).join('')}
      </div>
      <div class="filter-bar" style="margin-bottom:8px" id="status-filter">
        ${statuses.map(s => `<button class="pill ${filterStatus===s.v?'active':''}" onclick="Pages._unitStatusFilter('${s.v}')">${s.label}</button>`).join('')}
      </div>
      <div id="unit-list-body"></div>
    </div>`;

  Pages._unitPhaseFilter = function(p) {
    filterPhase = p;
    document.querySelectorAll('#phase-filter .pill').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.trim() === phaseLabels[p]);
    });
    _renderList();
  };
  Pages._unitStatusFilter = function(v) {
    filterStatus = v;
    document.querySelectorAll('#status-filter .pill').forEach(btn => {
      const s = statuses.find(x => x.label === btn.textContent.trim());
      btn.classList.toggle('active', s && s.v === v);
    });
    _renderList();
  };

  _renderList();
};

window.PAGES['unit-list'] = function() { Pages.unitList(Store.getParams()); };
