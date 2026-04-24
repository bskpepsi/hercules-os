// FILE: js/pages/t3_session.js
// build: 20260424m
// 変更点:
//   - [20260424m] 🐛 既存セッションの復元で初期値が反映されない問題を修正
//     症状: 20260424l で初期値を 'individualize' にしたが、実機では依然として
//           「未確定」状態で表示されていた。
//     原因: sessionStorage に旧バージョンで保存されたセッションデータ
//           (members[*].decision === null) が残っていると、復元時にそのまま
//           使われて新初期値が反映されない。
//     修正: (1) _restoreT3SessionFromStorage で復元直後に
//               decision===null を 'individualize' に昇格させるマイグレーション
//               (2) _renderT3Session の冒頭でも保険として補完
//           これにより既存の中断セッションも新仕様に揃う。
//   - [20260424l] 🎯 判断選択肢を「個別化/販売候補」の2択に変更 + 初期値=個別化
//     (ユーザー要望)
//       * decisionDefs から 'continue' (継続) を削除
//       * 新規メンバーの decision 初期値を null → 'individualize' に変更
//         (1頭目の固定メンバー / ユニット起点の各メンバー 両方とも)
//       * 判断サマリから「継続: N頭」行を削除
//       * 確定ダイアログから「継続: N頭 → T3マット継続」行を削除
//       * 案内文「※ 継続の場合も必ずここで確定してください」を
//         「※ 判断の既定は「個別化」です」に差し替え
//       * 'continue' を参照する集計・コミット処理は 0 件扱いで動作するため残置
//         (将来クリーンアップ予定)
//   - [20260424f] 🐛 ラベル画面からの「完了画面に戻る」導線を修正
//     症状: T3 完了画面から 1頭目のラベルを発行した後、ラベル画面の戻るボタン
//           が完了画面に戻らないため、2頭目のラベル発行に辿り着けない。
//     原因: _t3OpenLabel が routeTo('label-gen', { ..., _back: 't3-completion' })
//           で "_back" アンダースコア付きキーで渡していたが、label.js は
//           params.backRoute を参照するため認識されなかった (t2_session.js と
//           命名不一致)。
//     修正: _back → backRoute に改名。label.js 側は既に backRoute を尊重する
//           実装 (L521)。これで「← 詳細に戻る」→ 完了画面に戻り、次頭のラベル
//           を発行できる。
//   - [20260421d] T3移行確定後に完了画面 (_t3ShowCompletion) を表示するように変更
//       T2と同じ仕組みで、確定済み個体を一覧表示し各個体ごとにラベル発行ボタンを配置
//       販売候補の個体は 🏷️販売ラベル ボタンから自動で ind_sale (62×25mm) が発行される
//       新規ルート 't3-completion' を登録して label-gen から戻れるように対応
//       以前は即 qr-scan に戻るだけで、販売候補個体のラベル発行経路が実質無かった
//   - [20260418b] 容器選択肢に「その他」ボタンを追加（Step2 🥉③ 4択統一）
//   - [fix2] window.Pages → Pages に統一（6箇所）
//           window.Pages が undefined のため TypeError を起こしていたのを修正
//           このエラーが app.js:Pages is not defined 連鎖の元凶だった
//   - [fix1] t3SessionStart: unit.line_id が空の場合に display_id から line_code を抽出してフォールバック解決
//   - [fix1] _renderT3Session: lineDisp に同じフォールバック追加
'use strict';

console.log('[HerculesOS] t3_session.js v20260424m loaded');

window._t3Session = window._t3Session || null;

Pages.t3SessionStart = async function (unitDisplayId) {
  console.log('[T3] t3SessionStart - displayId:', unitDisplayId);

  const unit = (typeof Store.getUnitByDisplayId === 'function' ? Store.getUnitByDisplayId(unitDisplayId) : null)
    || (Store.getDB('breeding_units') || []).find(u => u.display_id === unitDisplayId);

  if (!unit) { UI.toast('ユニットが見つかりません: ' + unitDisplayId, 'error'); return; }
  if (unit.status !== 'active') { UI.toast('このユニットは処理済みです（status: ' + unit.status + '）', 'error'); return; }
  if (unit.stage_phase === 'T3') {
    if (!confirm('このユニットはすでにT3ステージです。\n再度T3移行を実行しますか？（Mx/体重更新として記録されます）')) return;
  }

  const members = _buildT3Members(unit);
  if (!members || members.length === 0) { UI.toast('ユニットのメンバー情報が取得できません', 'error'); return; }

  const originLotDisplayIds = _resolveT3OriginLotDisplayIds(unit);

  // ── line_id フォールバック解決 ───────────────────────────────
  // unit.line_id が空の場合は display_id から line_code を抽出してキャッシュ検索
  const _resolvedLineIdT3 = (() => {
    if (unit.line_id) return unit.line_id;
    const dm = (unit.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-/);
    if (!dm) return '';
    const lines = Store.getDB('lines') || [];
    const found = lines.find(l => (l.line_code || l.display_id) === dm[1]);
    return found ? found.line_id : '';
  })();

  window._t3Session = {
    unit_id:      unit.unit_id,
    display_id:   unit.display_id,
    line_id:      _resolvedLineIdT3,
    stage_phase:  unit.stage_phase || 'T2',
    hatch_date:   unit.hatch_date  || '',
    head_count:   unit.head_count  || members.length,
    origin_lots:  originLotDisplayIds,
    mx_done:      false,
    mat_type:     'T3',
    exchange_type:'FULL',
    members:      members,
    saving:       false,
    _fromInd:     false,
  };

  _saveT3SessionToStorage();
  routeTo('t3-session');
};

Pages.t3SessionStartFromInd = async function (indIdOrDisplayId) {
  console.log('[T3] t3SessionStartFromInd - id:', indIdOrDisplayId);

  const inds = Store.getDB('individuals') || [];
  const ind = inds.find(i => i.ind_id === indIdOrDisplayId || i.display_id === indIdOrDisplayId)
    || (typeof Store.getIndividual === 'function' ? Store.getIndividual(indIdOrDisplayId) : null);

  if (!ind) { UI.toast('個体が見つかりません: ' + indIdOrDisplayId, 'error'); return; }

  const records = (typeof Store.getGrowthRecords === 'function') ? Store.getGrowthRecords(ind.ind_id) : [];
  var t2Weight = null;
  if (records && records.length > 0) {
    const latest = records.filter(r => r.weight_g > 0)
      .sort((a, b) => String(b.record_date).localeCompare(String(a.record_date)))[0];
    if (latest) t2Weight = latest.weight_g;
  }

  const members = [{
    unit_slot_no:  1,
    lot_id:        ind.lot_id         || '',
    lot_item_no:   ind.lot_item_no    || '',
    lot_display_id:ind.lot_display_id || ind.lot_id || '',
    size_category: ind.size_category  || '',
    t2_weight_g:   t2Weight,
    weight_g:      null,
    sex:           ind.sex || '不明',
    mx_done:       false,
    status:        'normal',
    mat_molt:      false,
    container:     '2.7L',
    mat_type:      'T3',
    exchange_type: 'FULL',
    // [20260424l] 初期値を 'individualize' に (旧: null)
    //   ユーザー要望: T3移行編成では「個別化」が既定選択。手動で販売候補/死亡に
    //   切替える運用が主体。未確定のまま確定画面に進ませないために null 初期値
    //   だった経緯はあるが、2択化 (継続ボタン削除) に伴い「個別化」を既定化。
    decision:      'individualize',
    memo:          '',
  }];

  window._t3Session = {
    unit_id:      ind.ind_id,
    display_id:   ind.display_id || indIdOrDisplayId,
    line_id:      ind.line_id    || '',
    stage_phase:  ind.current_stage || 'T2',
    hatch_date:   ind.hatch_date    || '',
    head_count:   1,
    origin_lots:  ind.lot_id ? [ind.lot_id] : [],
    mx_done:      false,
    mat_type:     'T3',
    exchange_type:'FULL',
    members,
    saving:       false,
    _fromInd:     true,
    ind_id:       ind.ind_id,
  };

  _saveT3SessionToStorage();
  routeTo('t3-session');
};

function _buildT3Members(unit) {
  let parsedMembers = [];
  const raw = unit.members;
  if (Array.isArray(raw)) parsedMembers = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try { parsedMembers = JSON.parse(raw); } catch(e) { parsedMembers = []; }
  }

  const unitSizeCategory = unit.size_category || '';
  const growthBySlot = _getT2GrowthBySlot(unit.unit_id);
  const count = Math.max(parseInt(unit.head_count, 10) || 2, parsedMembers.length, 1);
  const result = [];

  for (let i = 0; i < count; i++) {
    const src = parsedMembers[i] || {};
    const slotNo = i + 1;
    const sizeCategory =
      src.size_category
      || (growthBySlot[slotNo] && growthBySlot[slotNo].size_category)
      || unitSizeCategory
      || '';

    result.push({
      unit_slot_no:  slotNo,
      lot_id:        src.lot_id         || '',
      lot_item_no:   src.lot_item_no    || '',
      lot_display_id:src.lot_display_id || src.lot_id || '',
      size_category: sizeCategory,
      t2_weight_g:   src.weight_g || (growthBySlot[slotNo] && growthBySlot[slotNo].weight_g) || null,
      weight_g:      null,
      sex:           src.sex || '不明',
      mx_done:       false,
      status:        'normal',
      mat_molt:      false,
      container:     '2.7L',
      mat_type:      'T3',
      exchange_type: 'FULL',
      // [20260424l] 初期値を 'individualize' に (ユニット起点の各メンバー)
      decision:      'individualize',
      memo:          '',
    });
  }
  return result;
}

function _getT2GrowthBySlot(unitId) {
  if (!unitId) return {};
  const records = (typeof Store.getGrowthRecords === 'function') ? Store.getGrowthRecords(unitId) : [];
  if (!records || records.length === 0) return {};
  const bySlot = {};
  records.forEach(r => {
    const slot = parseInt(r.unit_slot_no, 10);
    if (!slot) return;
    if (!bySlot[slot] || String(r.record_date) > String(bySlot[slot].record_date)) bySlot[slot] = r;
  });
  return bySlot;
}

function _resolveT3OriginLotDisplayIds(unit) {
  let srcLots = [];
  if (unit.source_lots) {
    try { srcLots = typeof unit.source_lots === 'string' ? JSON.parse(unit.source_lots) : (unit.source_lots || []); } catch(e) {}
  }
  if (srcLots.length > 0) {
    return srcLots.map(lid => { const lot = Store.getLot(lid); return lot ? (lot.display_id || lid) : lid; });
  }
  if (unit.origin_lot_id) {
    const lot = Store.getLot(unit.origin_lot_id);
    return [lot ? (lot.display_id || unit.origin_lot_id) : unit.origin_lot_id];
  }
  return [];
}

function _formatT3OriginLots(ids) {
  if (!ids || ids.length === 0) return '—';
  return ids.map(d => { const m = d.match(/[A-Z0-9]+-L\d+/); return m ? m[0] : d; }).join(' / ');
}

function _saveT3SessionToStorage() {
  try { sessionStorage.setItem('_t3SessionData', JSON.stringify(window._t3Session)); } catch(e) {}
}
function _restoreT3SessionFromStorage() {
  try {
    const raw = sessionStorage.getItem('_t3SessionData');
    if (raw) {
      window._t3Session = JSON.parse(raw);
      // [20260424m] 旧バージョンで保存された decision:null を
      //   新初期値 'individualize' に昇格させる (2択化対応)
      //   これをしないと、新バージョンで開いても画面が「未確定」状態で始まる。
      if (window._t3Session && Array.isArray(window._t3Session.members)) {
        let migrated = 0;
        window._t3Session.members.forEach(m => {
          if (m && m.decision === null) { m.decision = 'individualize'; migrated++; }
        });
        if (migrated > 0) {
          console.log('[T3] restored session: migrated ' + migrated + ' member(s) decision null → individualize');
          _saveT3SessionToStorage();
        }
      }
    }
  } catch(e) {}
}

Pages.t3Session = function (params = {}) {
  if (!window._t3Session) _restoreT3SessionFromStorage();
  if (!window._t3Session) { routeTo('qr-scan', { mode: 't3' }); return; }
  _renderT3Session(window._t3Session);
};

function _renderT3Session(s) {
  const main = document.getElementById('main');
  if (!main) return;

  // [20260424m] 保険: render 時にも decision===null があれば 'individualize' に補完
  //   古いセッションがどこかで混入した場合の最終防壁。restore 側で拾えなかった
  //   ケース (例: 別タブで保存した旧データ等) でも、描画時には個別化選択状態に揃う。
  if (Array.isArray(s.members)) {
    s.members.forEach(m => { if (m && m.decision === null) m.decision = 'individualize'; });
  }

  // ── line_id フォールバック表示 ────────────────────────────────
  const line     = s.line_id ? Store.getLine(s.line_id) : null;
  const lineDisp = (() => {
    if (line) return line.line_code || line.display_id || '';
    // フォールバック: "HM2025-A1-U06" → "A1" を抽出
    const dm = (s.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-/);
    return dm ? dm[1] : (s.line_id || '—');
  })();

  const originStr = _formatT3OriginLots(s.origin_lots);
  const allComplete = s.members.every(m => _isT3MemberComplete(m));
  const canSave = allComplete && !s.saving;

  if (s.saving) {
    main.innerHTML = `
      ${UI.header('T3（3齢後期）移行セッション', { back: false })}
      <div class="page-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:16px">
        <div class="spinner" style="width:44px;height:44px;border-width:4px"></div>
        <div style="font-size:.9rem;color:var(--text2);font-weight:600">T3移行を保存中...</div>
        <div style="font-size:.75rem;color:var(--text3)">${s.display_id}</div>
      </div>`;
    return;
  }

  main.innerHTML = `
    ${UI.header('T3（3齢後期）移行セッション', { back: true, backFn: "Pages._t3SessionBack()" })}
    <div class="page-body" style="padding-bottom:84px">

      <div style="background:linear-gradient(135deg,rgba(224,144,64,.12) 0%,rgba(224,144,64,.06) 100%);
        border:1.5px solid rgba(224,144,64,.4);border-radius:10px;padding:12px 14px;font-size:.8rem">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-weight:700;color:var(--gold);font-family:var(--font-mono);font-size:.9rem">${s.display_id}</span>
          <span style="background:rgba(224,144,64,.18);color:var(--amber);padding:2px 10px;border-radius:5px;font-size:.72rem;font-weight:700;letter-spacing:.05em">
            ${s.stage_phase} → T3（3齢後期）
          </span>
          <span style="color:var(--text3)">${lineDisp}　${s.head_count}頭</span>
        </div>
        ${s.hatch_date ? `<div style="font-size:.72rem;color:var(--text3)">孵化: ${s.hatch_date}</div>` : ''}
        <div style="font-size:.72rem;color:var(--text3)">由来ロット: ${originStr}</div>
      </div>

      <div style="background:rgba(224,144,64,.07);border:1px solid rgba(224,144,64,.3);border-radius:8px;
        padding:10px 12px;margin-top:8px;font-size:.76rem;color:var(--text2);line-height:1.6">
        <b style="color:var(--amber)">⭐ T3（3齢後期）は最も体重が乗る重要ステージです。</b><br>
        体重計測・マット交換の有無を記録し、最終的な成長管理を確定してください。<br>
        <span style="color:var(--text3)">※ 判断の既定は「個別化」です。必要に応じて「販売候補」に切り替えてください。</span>
      </div>

      <div style="margin-top:8px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface1,var(--surface));padding:12px 14px">
        <div style="font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:6px">
          🌿 マット種別 — 一括設定
          <span style="font-size:.62rem;font-weight:400;color:var(--text3);margin-left:4px">個体カードで個別変更可</span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px">
          ${['T1','T2','T3','MD'].map(v => {
            const active = s.members.length && s.members.every(m => m.mat_type === v || m.status === 'dead');
            return `<button type="button" onclick="Pages._t3SetMatAll('${v}')"
              style="flex:1;padding:10px 0;border-radius:8px;font-size:.9rem;font-weight:700;cursor:pointer;
                border:2px solid ${active ? 'var(--green)' : 'var(--border)'};
                background:${active ? 'rgba(76,175,120,.15)' : 'var(--bg2)'};
                color:${active ? 'var(--green)' : 'var(--text2)'}">
              ${v}
            </button>`;
          }).join('')}
        </div>

        <div style="font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:6px">
          🔄 交換種別 — 一括設定
          <span style="font-size:.62rem;font-weight:400;color:var(--text3);margin-left:4px">個体カードで個別変更可</span>
        </div>
        <div style="display:flex;gap:8px">
          ${[{v:'FULL',l:'全交換'},{v:'ADD',l:'追加のみ'},{v:'NONE',l:'なし'}].map(x => {
            const active = s.exchange_type === x.v;
            return `<button type="button" onclick="Pages._t3SetExchangeAll('${x.v}')"
              style="flex:1;padding:10px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
                border:2px solid ${active ? 'var(--green)' : 'var(--border)'};
                background:${active ? 'rgba(76,175,120,.15)' : 'var(--bg2)'};
                color:${active ? 'var(--green)' : 'var(--text2)'}">
              ${x.l}
            </button>`;
          }).join('')}
        </div>
      </div>

      ${s.members.map((m, i) => _renderT3MemberCard(m, i, s)).join('')}
      ${_renderT3Summary(s)}

      ${(!allComplete && s.members.some(m => m.decision !== null)) ? `
      <div style="background:rgba(224,144,64,.08);border:1px solid rgba(224,144,64,.3);border-radius:8px;padding:10px 12px;margin-top:8px;font-size:.78rem;color:var(--amber)">
        ⚠️ 全頭の判断が完了していません。体重・判断を確認してください。
      </div>` : ''}

    </div>

    <div class="quick-action-bar">
      <button class="btn btn-ghost" style="flex:1;padding:14px 0" onclick="Pages._t3SessionCancel()">破棄</button>
      <button class="btn btn-gold" style="flex:2;padding:14px 0;font-weight:700;font-size:.95rem"
        ${canSave ? '' : 'disabled'} onclick="Pages._t3SessionSave()">
        💾 T3移行を確定
      </button>
    </div>`;

  _saveT3SessionToStorage();
}

function _renderT3MemberCard(m, idx, s) {
  const isDead    = m.status === 'dead';
  const slotLabel = idx === 0 ? '1頭目' : idx === 1 ? '2頭目' : `${idx + 1}頭目`;
  const isComplete = _isT3MemberComplete(m);
  const cardBorder = isDead ? 'rgba(224,80,80,.35)' : (isComplete ? 'rgba(76,175,120,.35)' : 'var(--border)');
  const cardBg     = isDead ? 'rgba(224,80,80,.04)' : (isComplete ? 'rgba(76,175,120,.04)' : 'var(--surface1,var(--surface))');

  const sizeBtns = ['大', '中', '小'].map(sz => {
    const on = m.size_category === sz;
    return `<button type="button" onclick="Pages._t3SetSize(${idx},'${sz}')"
      style="min-width:48px;padding:8px 10px;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on?'var(--green)':'var(--border)'};background:${on?'var(--green)':'var(--bg2)'};color:${on?'#fff':'var(--text2)'};
        opacity:${isDead?'.3':'1'};pointer-events:${isDead?'none':'auto'}" ${isDead?'disabled':''}>${sz}</button>`;
  }).join('');

  const t2WeightRef = m.t2_weight_g
    ? `<span style="font-size:.65rem;color:var(--text3);margin-left:4px">T2: ${m.t2_weight_g}g</span>` : '';

  const sexBtns = ['不明', '♂', '♀'].map(sx => {
    const on = m.sex === sx;
    const col = sx === '♂' ? '#3366cc' : sx === '♀' ? '#cc3366' : 'var(--text3)';
    return `<button type="button" onclick="Pages._t3SetSex(${idx},'${sx}')"
      style="flex:1;padding:7px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on?col:'var(--border)'};
        background:${on?(sx==='♂'?'rgba(51,102,204,.15)':sx==='♀'?'rgba(204,51,102,.15)':'var(--surface2)'):'var(--bg2)'};
        color:${on?col:'var(--text2)'};opacity:${isDead?'.3':'1'};pointer-events:${isDead?'none':'auto'}"
      ${isDead?'disabled':''}>${sx}</button>`;
  }).join('');

  const statusBtns = [
    { key:'normal', lbl:'通常',    ac:'var(--green)',       abg:'var(--green)',          ton:'#fff' },
    { key:'dead',   lbl:'💀 死亡', ac:'var(--red,#e05050)', abg:'rgba(224,80,80,.18)',   ton:'var(--red,#e05050)' },
  ].map(({ key, lbl, ac, abg, ton }) => {
    const on = m.status === key;
    return `<button type="button" onclick="Pages._t3SetStatus(${idx},'${key}')"
      style="flex:1;padding:9px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on?ac:'var(--border)'};background:${on?abg:'var(--bg2)'};color:${on?ton:'var(--text2)'}">
      ${lbl}</button>`;
  }).join('');

  // [20260424l] 2択化: 'continue' (継続) を削除
  //   ユーザー要望: 「継続」は運用上ほぼ使われず、誤タップの原因になっていた。
  //   個別化 / 販売候補 / (死亡は別UI) の 2択に絞り、初期値は 'individualize'。
  //   'continue' を参照する既存ロジック (集計・コミット処理) は 0件扱いで動作する
  //   ため残置。不要になり次第クリーンアップ。
  const decisionDefs = [
    { key:'individualize', lbl:'個別化',   color:'var(--green)', bg:'rgba(76,175,120,.18)',  desc:'→ 個体台帳に登録して個別飼育へ' },
    { key:'sale',          lbl:'販売候補', color:'var(--amber)', bg:'rgba(224,144,64,.18)',  desc:'→ 販売候補として個体台帳に登録' },
  ];
  const decisionBtns = decisionDefs.map(({ key, lbl, color, bg }) => {
    const on = m.decision === key;
    return `<button type="button" onclick="Pages._t3SetDecision(${idx},'${key}')"
      style="flex:1;padding:9px 0;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;
        border:2px solid ${on?color:'var(--border)'};background:${on?bg:'var(--bg2)'};color:${on?color:'var(--text2)'}">
      ${lbl}</button>`;
  }).join('');
  const selectedDecision = decisionDefs.find(d => d.key === m.decision);

  const completeBadge = isComplete
    ? `<span style="font-size:.65rem;padding:2px 8px;border-radius:10px;font-weight:700;background:${isDead?'rgba(224,80,80,.12)':'rgba(76,175,120,.12)'};color:${isDead?'var(--red,#e05050)':'var(--green)'}">
        ${isDead ? '💀 死亡' : '✅ 確定'}</span>`
    : `<span style="font-size:.65rem;padding:2px 8px;border-radius:10px;font-weight:700;background:rgba(224,144,64,.12);color:var(--amber)">未確定</span>`;

  const lotInfo = (m.lot_display_id || m.lot_id)
    ? `<div style="font-size:.65rem;color:var(--text3);margin-bottom:6px">元ロット: ${m.lot_display_id || m.lot_id}${m.lot_item_no ? ' #' + m.lot_item_no : ''}</div>` : '';

  return `
  <div style="margin-top:10px;border-radius:12px;border:2px solid ${cardBorder};background:${cardBg};overflow:hidden">
    <div style="padding:10px 14px 8px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border2)">
      <span style="font-size:.95rem;font-weight:800;color:var(--text1)">${slotLabel}</span>
      ${completeBadge}
    </div>
    <div style="padding:10px 14px 10px;border-bottom:1px solid var(--border2)">
      ${lotInfo}
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;gap:6px">${sizeBtns}</div>
        <div style="display:flex;align-items:center;gap:4px;margin-left:auto">
          <input type="number" inputmode="numeric" min="1" max="999" step="1" placeholder="体重"
            value="${m.weight_g !== null ? m.weight_g : ''}"
            style="width:76px;padding:8px 6px;text-align:center;border-radius:8px;
              border:2px solid ${m.weight_g ? 'var(--green)' : 'var(--border)'};
              background:var(--bg2);font-size:1rem;font-weight:700;color:var(--text1);
              opacity:${isDead ? '.3' : '1'};pointer-events:${isDead ? 'none' : 'auto'}"
            ${isDead ? 'disabled' : ''}
            onblur="Pages._t3CommitWeight(${idx},this.value)"
            onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}">
          <span style="font-size:.8rem;color:var(--text3);font-weight:600">g</span>
          ${t2WeightRef}
        </div>
      </div>
    </div>
    ${!isDead ? `
    <div style="padding:8px 14px 10px;border-bottom:1px solid var(--border2)">
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:7px;text-transform:uppercase;letter-spacing:.05em">性別</div>
      <div style="display:flex;gap:6px">${sexBtns}</div>
    </div>` : ''}
    <div style="padding:10px 14px 10px;border-bottom:1px solid var(--border2)">
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:7px;text-transform:uppercase;letter-spacing:.05em">状態</div>
      <div style="display:flex;gap:8px">${statusBtns}</div>
      ${isDead ? `<div style="font-size:.72rem;color:var(--red,#e05050);margin-top:7px;opacity:.85">死亡として記録します（体重・判断の入力不要）</div>` : ''}
    </div>
    ${!isDead ? `
    <div style="padding:10px 14px 10px;border-bottom:1px solid var(--border2)">
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:7px;text-transform:uppercase;letter-spacing:.05em">判断</div>
      <div style="display:flex;gap:6px">${decisionBtns}</div>
      ${selectedDecision ? `<div style="font-size:.7rem;color:var(--text3);margin-top:6px">${selectedDecision.desc}</div>` : ''}
    </div>` : ''}
    ${!isDead ? `
    <div style="padding:8px 14px 10px;border-bottom:1px solid var(--border2)">
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:5px">📦 容器</div>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        ${['1.8L','2.7L','4.8L','その他'].map(v => `
          <button type="button" onclick="Pages._t3SetMemberContainer(${idx},'${v}')"
            style="flex:1;padding:7px 0;border-radius:7px;font-size:.82rem;font-weight:700;cursor:pointer;
              border:2px solid ${m.container===v?'var(--green)':'var(--border)'};
              background:${m.container===v?'rgba(76,175,120,.15)':'var(--bg2)'};
              color:${m.container===v?'var(--green)':'var(--text2)'}">${v}</button>
        `).join('')}
      </div>
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:5px">🌿 マット<span style="font-weight:400;margin-left:4px">（空=自動）</span></div>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        ${['T1','T2','T3','MD'].map(v => `
          <button type="button" onclick="Pages._t3SetMemberMat(${idx},'${v}')"
            style="flex:1;padding:7px 0;border-radius:7px;font-size:.82rem;font-weight:700;cursor:pointer;
              border:2px solid ${m.mat_type===v?'var(--green)':'var(--border)'};
              background:${m.mat_type===v?'rgba(76,175,120,.15)':'var(--bg2)'};
              color:${m.mat_type===v?'var(--green)':'var(--text2)'}">${v}</button>
        `).join('')}
      </div>
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:5px">🧪 モルトパウダー（記録）</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div onclick="Pages._t3SetMolt(${idx},${!m.mat_molt})"
          style="cursor:pointer;width:52px;height:28px;border-radius:14px;position:relative;flex-shrink:0;
            background:${m.mat_molt?'var(--green)':'rgba(128,128,128,.25)'};transition:background .2s">
          <div style="position:absolute;top:3px;left:${m.mat_molt?'27px':'3px'};
            width:22px;height:22px;border-radius:50%;background:#fff;
            box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .2s"></div>
        </div>
        <span style="font-size:.85rem;font-weight:700;color:${m.mat_molt?'var(--green)':'var(--text3)'}">
          ${m.mat_molt ? '🧪 使用する（記録ON）' : '使用しない（記録OFF）'}
        </span>
      </div>
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:5px">
        🔄 交換種別
        <span style="font-size:.62rem;font-weight:400;margin-left:3px">${m.exchange_type==='FULL'?'全交換':m.exchange_type==='ADD'?'追加のみ':'なし'}</span>
      </div>
      <div style="display:flex;gap:6px">
        ${[{v:'FULL',l:'全交換'},{v:'ADD',l:'追加のみ'},{v:'NONE',l:'なし'}].map(x => `
          <button type="button" onclick="Pages._t3SetMemberExchange(${idx},'${x.v}')"
            style="flex:1;padding:7px 0;border-radius:7px;font-size:.78rem;font-weight:700;cursor:pointer;
              border:2px solid ${m.exchange_type===x.v?'var(--green)':'var(--border)'};
              background:${m.exchange_type===x.v?'rgba(76,175,120,.15)':'var(--bg2)'};
              color:${m.exchange_type===x.v?'var(--green)':'var(--text2)'}">${x.l}</button>
        `).join('')}
      </div>
    </div>` : ''}
    <div style="padding:8px 14px 10px">
      <input type="text" placeholder="メモ（任意）" value="${m.memo || ''}"
        style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);
          background:var(--bg2);font-size:.82rem;color:var(--text1);box-sizing:border-box"
        oninput="Pages._t3SetMemo(${idx},this.value)">
    </div>
  </div>`;
}

function _renderT3Summary(s) {
  const cnt = {
    continue:     s.members.filter(m => m.decision === 'continue').length,
    individualize:s.members.filter(m => m.decision === 'individualize').length,
    sale:         s.members.filter(m => m.decision === 'sale').length,
    dead:         s.members.filter(m => m.decision === 'dead').length,
    undecided:    s.members.filter(m => m.decision === null).length,
  };
  const allDone = cnt.undecided === 0;
  const totalWeight = s.members.filter(m => m.weight_g > 0).reduce((sum, m) => sum + m.weight_g, 0);
  const avgWeight = cnt.continue + cnt.individualize + cnt.sale > 0
    ? (totalWeight / (cnt.continue + cnt.individualize + cnt.sale)).toFixed(1) : '—';

  return `
  <div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-top:12px">
    <div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:8px">判断サマリ</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.8rem">
      <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:var(--green);flex-shrink:0"></span><span>個別化</span><b style="margin-left:auto;color:var(--green)">${cnt.individualize}頭</b></div>
      <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:var(--amber);flex-shrink:0"></span><span>販売候補</span><b style="margin-left:auto;color:var(--amber)">${cnt.sale}頭</b></div>
      <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:var(--red,#e05050);flex-shrink:0"></span><span>死亡</span><b style="margin-left:auto;color:var(--red,#e05050)">${cnt.dead}頭</b></div>
    </div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;font-size:.75rem">
      <span style="color:${allDone?'var(--green)':'var(--amber)'}">
        ${allDone ? '✅ 全頭の判断が完了' : `⚠️ 未判断: ${cnt.undecided}頭`}
      </span>
      <span style="color:var(--text3)">平均体重: <b style="color:var(--gold)">${avgWeight}g</b></span>
    </div>
  </div>`;
}

function _isT3MemberComplete(m) {
  if (m.decision === 'dead') return true;
  if (m.decision === null)   return false;
  return m.weight_g !== null && m.weight_g > 0;
}

Pages._t3SetMx = function (done) {
  const s = window._t3Session; if (!s) return; s.mx_done = done; _renderT3Session(s);
};
Pages._t3SetSize = function (idx, size) {
  const s = window._t3Session; if (!s || s.members[idx].status === 'dead') return;
  s.members[idx].size_category = s.members[idx].size_category === size ? '' : size; _renderT3Session(s);
};
Pages._t3SetStatus = function (idx, status) {
  const s = window._t3Session; if (!s) return;
  s.members[idx].status = status;
  if (status === 'dead') {
    s.members[idx].decision = 'dead'; s.members[idx].weight_g = null; s.members[idx].size_category = '';
  } else {
    if (s.members[idx].decision === 'dead') s.members[idx].decision = null;
  }
  _renderT3Session(s);
};
Pages._t3SetDecision = function (idx, decision) {
  const s = window._t3Session; if (!s || s.members[idx].status === 'dead') return;
  s.members[idx].decision = decision; _renderT3Session(s);
};
Pages._t3CommitWeight = function (idx, val) {
  const s = window._t3Session; if (!s) return;
  const n = parseInt(val, 10);
  const newW = (!val || isNaN(n) || n <= 0) ? null : Math.min(999, n);
  if (s.members[idx].weight_g === newW) return;
  s.members[idx].weight_g = newW;
  _saveT3SessionToStorage();
  clearTimeout(Pages._t3RefreshTimer);
  Pages._t3RefreshTimer = setTimeout(() => _renderT3Session(window._t3Session), 200);
};
Pages._t3SetSex = function (idx, sex) {
  const s = window._t3Session; if (!s || s.members[idx].status === 'dead') return;
  s.members[idx].sex = sex; _renderT3Session(s);
};
Pages._t3SetMemo = function (idx, val) {
  const s = window._t3Session; if (s) { s.members[idx].memo = val; _saveT3SessionToStorage(); }
};
Pages._t3SetMatAll = function(v) {
  const s = window._t3Session; if (!s) return;
  s.mat_type = v; s.members.forEach(function(m) { if (m.status !== 'dead') m.mat_type = v; }); _renderT3Session(s);
};
Pages._t3SetExchangeAll = function(v) {
  const s = window._t3Session; if (!s) return;
  s.exchange_type = v; s.members.forEach(function(m) { if (m.status !== 'dead') m.exchange_type = v; }); _renderT3Session(s);
};
Pages._t3SetMemberContainer = function(idx, v) {
  const s = window._t3Session; if (!s) return;
  const m = s.members[idx]; if (m) { m.container = (m.container === v) ? '' : v; _renderT3Session(s); }
};
Pages._t3SetMemberMat = function(idx, v) {
  const s = window._t3Session; if (!s) return;
  const m = s.members[idx]; if (m) { m.mat_type = v; _renderT3Session(s); }
};
Pages._t3SetMolt = function(idx, val) {
  const s = window._t3Session; if (!s) return;
  const m = s.members[idx]; if (m) { m.mat_molt = val; _renderT3Session(s); }
};
Pages._t3SetMemberExchange = function(idx, v) {
  const s = window._t3Session; if (!s) return;
  const m = s.members[idx]; if (m) { m.exchange_type = v; _renderT3Session(s); }
};
Pages._t3SessionBack = function () {
  if (confirm('セッションを中断しますか？（入力内容は一時保存されます）')) routeTo('qr-scan', { mode: 't3' });
};
Pages._t3SessionCancel = function () {
  if (confirm('セッションを破棄しますか？（入力内容は消えます）')) {
    window._t3Session = null; sessionStorage.removeItem('_t3SessionData'); routeTo('qr-scan', { mode: 't3' });
  }
};

Pages._t3SessionSave = async function () {
  const s = window._t3Session;
  if (!s || s.saving) return;

  console.log('[T3_SAVE] ===== T3 save triggered =====');

  if (!s.members.every(m => _isT3MemberComplete(m))) {
    UI.toast('全頭の判断を完了してください（体重も入力してください）', 'error'); return;
  }

  const iCnt = s.members.filter(m => m.decision === 'individualize').length;
  const sCnt = s.members.filter(m => m.decision === 'sale').length;
  const dCnt = s.members.filter(m => m.decision === 'dead').length;

  const confirmMsg =
    `T3（3齢後期）移行を確定します（取り消せません）\n\n` +
    `ユニット: ${s.display_id}\n由来ロット: ${_formatT3OriginLots(s.origin_lots)}\n` +
    `Mx（マット交換）: ${s.mx_done ? '実施' : '未実施'}\n\n` +
    `個別化: ${iCnt}頭 → 個体台帳へ\n販売候補: ${sCnt}頭\n死亡: ${dCnt}頭`;
  if (!confirm(confirmMsg)) return;

  s.saving = true; _renderT3Session(s);

  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    const payload = {
      transaction_type:       'T3_SESSION',
      session_date:           today,
      source_unit_id:         s.unit_id,
      source_unit_display_id: s.display_id,
      mx_done:                s.mx_done || false,
      exchange_type:          s.exchange_type || 'FULL',
      from_individual:        s._fromInd || false,
      decisions: s.members.map(m => ({
        unit_slot_no:  m.unit_slot_no,
        decision:      m.decision,
        weight_g:      m.decision === 'dead' ? null : m.weight_g,
        size_category: m.decision === 'dead' ? null : (m.size_category || null),
        sex:           m.decision === 'dead' ? '不明' : (m.sex || '不明'),
        lot_id:        m.lot_id      || '',
        lot_item_no:   m.lot_item_no || '',
        memo:          m.memo        || '',
        mat_molt:      m.mat_molt      !== undefined ? m.mat_molt : false,
        container:     m.container     || '2.7L',
        mat_type:      m.mat_type       || 'T3',
        exchange_type: m.exchange_type  || s.exchange_type || 'FULL',
      })),
    };
    console.log('[T3] save payload', payload);
    const res = await API.t3.createSession(payload);
    console.log('[T3] save response', res);

    const _t3SessionMembers = s.members.filter(m => m.decision !== 'dead').map(m => ({
      unit_slot_no: m.unit_slot_no, lot_id: m.lot_id||'', lot_item_no: m.lot_item_no||'',
      lot_display_id: m.lot_display_id||'', size_category: m.size_category||'',
      weight_g: m.weight_g||null, sex: m.sex||'不明', memo: m.memo||'',
    }));
    const _t3UnitPatch = { stage_phase:'T3', status:'active', members:JSON.stringify(_t3SessionMembers) };

    if (res && res.updated_unit) {
      const _merged3 = Object.assign({}, _t3UnitPatch, res.updated_unit);
      if (!_merged3.members || _merged3.members === '[]' || _merged3.members === '') _merged3.members = JSON.stringify(_t3SessionMembers);
      if (typeof Store.patchDBItem === 'function') Store.patchDBItem('breeding_units', 'unit_id', s.unit_id, _merged3);
      else { const units=(Store.getDB('breeding_units')||[]).map(u=>u.unit_id===s.unit_id?Object.assign({},u,_merged3):u); Store.setDB('breeding_units',units); }
    } else {
      if (typeof Store.patchDBItem === 'function') Store.patchDBItem('breeding_units', 'unit_id', s.unit_id, _t3UnitPatch);
      else { const units=(Store.getDB('breeding_units')||[]).map(u=>u.unit_id===s.unit_id?Object.assign({},u,_t3UnitPatch):u); Store.setDB('breeding_units',units); }
    }
    if (res && Array.isArray(res.created_individuals)) {
      res.created_individuals.forEach(ind => { if (typeof Store.addDBItem === 'function') Store.addDBItem('individuals', ind); });
    }

    window._t3Session = null; sessionStorage.removeItem('_t3SessionData');
    UI.toast('T3（3齢後期）移行を完了しました ✅', 'success', 3000);

    _registerBacilusReminder(s.unit_id, s.display_id, today);

    // [20260421d] T2と同様に完了画面を表示し、各個体ごとにラベル発行できるようにする
    //   以前は即 qr-scan に戻っていたため、販売候補の個体ラベルを
    //   あとから個体一覧やスキャンで出すしかなく手間が大きかった
    const _indMembers = s.members.filter(function(m){ return m.decision === 'individualize' || m.decision === 'sale'; });
    const _createdInds = (res && Array.isArray(res.created_individuals)) ? res.created_individuals : [];
    if (_indMembers.length > 0 && _createdInds.length > 0) {
      window._t3CompletedInds    = _createdInds;
      window._t3CompletedMembers = _indMembers;
      window._t3CompletedUnitDisp= s.display_id || '';
      window._t3LabeledIds       = {};
      Pages._t3ShowCompletion();
    } else {
      routeTo('qr-scan', { mode: 't3' });
    }

  } catch (e) {
    console.error('[T3] save error:', e); s.saving = false; _renderT3Session(s);
    UI.toast('保存失敗: ' + (e.message || '通信エラー'), 'error', 5000);
  }
};


// ════════════════════════════════════════════════════════════════
// 腸内菌リセットリマインド管理
// ════════════════════════════════════════════════════════════════

var _BACILUS_LS = 'hcos_bacilus_reminders';

function _getBacilusReminders() {
  try { return JSON.parse(localStorage.getItem(_BACILUS_LS) || '[]'); } catch(e) { return []; }
}
function _setBacilusReminders(arr) {
  try { localStorage.setItem(_BACILUS_LS, JSON.stringify(arr)); } catch(e) {}
}

function _registerBacilusReminder(unitId, displayId, exchangeDate) {
  var reminders = _getBacilusReminders();
  reminders = reminders.filter(function(r){ return r.unit_id !== unitId || r.done; });
  var d = new Date(String(exchangeDate).replace(/\//g, '-'));
  d.setDate(d.getDate() + 30);
  var remindDate = d.getFullYear() + '/'
    + String(d.getMonth()+1).padStart(2,'0') + '/'
    + String(d.getDate()).padStart(2,'0');
  reminders.push({
    id:            'bacilus_' + unitId + '_' + Date.now(),
    unit_id:       unitId,
    display_id:    displayId,
    exchange_date: exchangeDate,
    remind_date:   remindDate,
    done:          false,
    done_date:     null,
  });
  _setBacilusReminders(reminders);
  console.log('[T3] バチルスリマインド登録:', displayId, '→', remindDate);
}

Pages._bacilusMarkDone = function(reminderId) {
  var reminders = _getBacilusReminders();
  var today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
  reminders = reminders.map(function(r){
    return r.id === reminderId ? Object.assign({}, r, {done:true, done_date:today}) : r;
  });
  _setBacilusReminders(reminders);
  UI.toast('✅ バチルスキング添加を記録しました', 'success', 2000);
  if (typeof Pages._refreshBacilusReminders === 'function') Pages._refreshBacilusReminders();
};

Pages._bacilusSnooze = function(reminderId) {
  var reminders = _getBacilusReminders();
  var snoozeDate = new Date(); snoozeDate.setDate(snoozeDate.getDate() + 3);
  var sd = snoozeDate.getFullYear() + '/'
    + String(snoozeDate.getMonth()+1).padStart(2,'0') + '/'
    + String(snoozeDate.getDate()).padStart(2,'0');
  reminders = reminders.map(function(r){
    return r.id === reminderId ? Object.assign({}, r, {remind_date: sd}) : r;
  });
  _setBacilusReminders(reminders);
  UI.toast('3日後に再通知します', 'info', 2000);
  if (typeof Pages._refreshBacilusReminders === 'function') Pages._refreshBacilusReminders();
};

window._getBacilusDueReminders = function() {
  var today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
  return _getBacilusReminders().filter(function(r){
    return !r.done && r.remind_date <= today;
  });
};

window._renderBacilusReminderBanner = function() {
  var due = window._getBacilusDueReminders();
  if (!due.length) return '';

  return '<div id="bacilus-remind-area">'
    + due.map(function(r){
        var daysOver = Math.round(
          (new Date() - new Date(r.remind_date.replace(/\//g,'-'))) / 86400000
        );
        var urgency = daysOver >= 7
          ? { color:'#e05050', bg:'rgba(224,80,80,.08)', border:'rgba(224,80,80,.3)', label:'⚠️ 超過 '+daysOver+'日' }
          : daysOver >= 3
          ? { color:'var(--amber)', bg:'rgba(224,144,64,.08)', border:'rgba(224,144,64,.3)', label:'🔔 '+daysOver+'日経過' }
          : { color:'var(--green)', bg:'rgba(76,175,120,.08)', border:'rgba(76,175,120,.3)', label:'🟢 本日' };

        return '<div style="background:'+urgency.bg+';border:1px solid '+urgency.border+';border-radius:10px;padding:12px 14px;margin-bottom:8px">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
          +   '<div>'
          +     '<div style="font-size:.82rem;font-weight:700;color:var(--text1)">🧫 腸内菌リセット</div>'
          +     '<div style="font-size:.75rem;color:var(--text3);margin-top:2px">バチルスキング添加のタイミングです</div>'
          +   '</div>'
          +   '<span style="font-size:.72rem;font-weight:700;color:'+urgency.color+'">'+urgency.label+'</span>'
          + '</div>'
          + '<div style="background:var(--surface2);border-radius:8px;padding:8px 10px;margin-bottom:10px">'
          +   '<div style="font-size:.82rem;font-weight:700;color:var(--gold)">'+r.display_id+'</div>'
          +   '<div style="display:flex;gap:16px;margin-top:4px;font-size:.74rem;color:var(--text3)">'
          +     '<span>T3交換日: <b style="color:var(--text2)">'+r.exchange_date+'</b></span>'
          +     '<span>リマインド日: <b style="color:'+urgency.color+'">'+r.remind_date+'</b></span>'
          +   '</div>'
          + '</div>'
          + '<div style="display:flex;gap:8px">'
          +   '<button class="btn btn-ghost btn-sm" style="flex:1" '
          +     'onclick="Pages._bacilusSnoozeIdx(' + due.indexOf(r) + ')">\u23f0 3日後</button>'
          +   '<button class="btn btn-primary" style="flex:2;padding:10px" '
          +     'onclick="Pages._bacilusDoneIdx(' + due.indexOf(r) + ')">✅ 添加完了</button>'
          + '</div>'
          + '</div>';
      }).join('')
    + '</div>';
};

Pages._bacilusDoneIdx = function(idx) {
  var due = window._getBacilusDueReminders();
  var r   = due[idx];
  if (r) Pages._bacilusMarkDone(r.id);
};
Pages._bacilusSnoozeIdx = function(idx) {
  var due = window._getBacilusDueReminders();
  var r   = due[idx];
  if (r) Pages._bacilusSnooze(r.id);
};

Pages._refreshBacilusReminders = function() {
  var area = document.getElementById('bacilus-remind-area');
  if (!area) return;
  var newHtml = window._renderBacilusReminderBanner();
  if (newHtml) {
    area.outerHTML = newHtml;
  } else {
    area.remove();
  }
};

window.PAGES = window.PAGES || {};
window.PAGES['t3-session'] = function () { Pages.t3Session(Store.getParams()); };

// ════════════════════════════════════════════════════════════════
// [20260421d] T3移行完了画面 — 確定済み個体一覧とラベル発行ボタン
// ════════════════════════════════════════════════════════════════
//
// フロー:
//   T3移行を確定 → 完了画面（この関数）を表示
//     → 各個体のラベル発行ボタンから label-gen に遷移
//     → label-gen から戻ったら再度この画面を表示（ルート登録済み）
//     → 「完了」ボタンでQRスキャンに戻る
//
// 販売候補は自動で ind_sale (62×25mm簡易ラベル) が発行される
//   （_t3OpenLabel が forSale フラグを見て labelType を切替）
// ════════════════════════════════════════════════════════════════

Pages._t3ShowCompletion = function () {
  const main = document.getElementById('main');
  if (!main) return;

  const inds    = window._t3CompletedInds    || [];
  const members = window._t3CompletedMembers || [];
  const unitDsp = window._t3CompletedUnitDisp|| '';
  const labeled = window._t3LabeledIds       || {};

  if (inds.length === 0) {
    routeTo('qr-scan', { mode: 't3' });
    return;
  }

  const unprintedCount = inds.filter(function(i){ return !labeled[i.ind_id]; }).length;

  main.innerHTML = `
    ${UI.header('T3移行完了', { back: false })}
    <div class="page-body">

      <!-- 成功サマリ -->
      <div class="card" style="padding:16px;margin-bottom:12px;
        background:rgba(76,175,120,.08);border:1px solid rgba(76,175,120,.3)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <span style="font-size:1.6rem">✅</span>
          <div>
            <div style="font-size:1rem;font-weight:700;color:var(--green)">T3（3齢後期）移行を完了しました</div>
            <div style="font-size:.75rem;color:var(--text3)">${unitDsp ? 'ユニット ' + unitDsp + ' を解体' : ''}</div>
          </div>
        </div>
        <div style="font-size:.78rem;color:var(--text2);line-height:1.6">
          ${inds.length}頭を個別飼育として登録しました。<br>
          ${unprintedCount > 0
            ? `<span style="color:var(--amber)">⚠️ ${unprintedCount}頭分のラベルが未発行です</span>`
            : '<span style="color:var(--green)">✅ 全頭のラベル発行ボタンを押下済み</span>'}
        </div>
      </div>

      <!-- 個体一覧（ラベル発行ボタン付き） -->
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">確定済み個体（${inds.length}頭）</div>
        ${inds.map(function(ind, i) {
          const m = members[i] || {};
          const sex = ind.sex || m.sex || '不明';
          const sexColor = sex === '♂' ? '#3366cc' : sex === '♀' ? '#cc3366' : 'var(--text3)';
          const weight = m.weight_g || ind.latest_weight_g || '';
          const sizeCat = m.size_category || ind.size_category || '';
          const isLabeled = !!labeled[ind.ind_id];
          const forSale = !!ind.for_sale || m.decision === 'sale';
          return `
          <div style="display:flex;align-items:center;gap:8px;padding:12px 0;border-bottom:1px solid var(--border2);flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:140px">
              <span style="font-weight:800;font-family:var(--font-mono);color:var(--gold);font-size:.92rem">${ind.display_id || ind.ind_id}</span>
              <span style="color:${sexColor};font-weight:700;font-size:.95rem">${sex}</span>
              ${sizeCat ? `<span style="font-size:.7rem;padding:1px 6px;border-radius:4px;background:rgba(76,175,120,.12);color:var(--green)">${sizeCat}</span>` : ''}
              ${weight ? `<span style="font-size:.8rem;font-weight:700">${weight}g</span>` : ''}
              ${forSale ? '<span style="font-size:.65rem;padding:1px 6px;border-radius:4px;background:rgba(224,144,64,.15);color:var(--amber)">販売候補</span>' : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              ${isLabeled ? '<span style="font-size:.7rem;color:var(--green)">✅印刷済</span>' : '<span style="font-size:.7rem;color:var(--amber)">未印刷</span>'}
              <button class="btn btn-sm" style="font-size:.78rem;padding:6px 12px;
                background:${isLabeled ? 'var(--bg2)' : (forSale ? 'var(--amber)' : 'var(--green)')};
                color:${isLabeled ? 'var(--text2)' : '#fff'};
                border:1px solid ${isLabeled ? 'var(--border)' : (forSale ? 'var(--amber)' : 'var(--green)')};
                border-radius:6px;cursor:pointer;font-weight:700"
                onclick="Pages._t3OpenLabel('${ind.ind_id}', ${forSale ? 'true' : 'false'})">
                🏷️ ${forSale ? (isLabeled ? '販売ラベル再発行' : '販売ラベル') : (isLabeled ? '再発行' : 'ラベル')}
              </button>
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- 完了ボタン -->
      <button class="btn btn-primary" style="width:100%;padding:14px;font-weight:700;font-size:.95rem"
        onclick="Pages._t3FinishCompletion()">
        ${unprintedCount > 0 ? `完了（${unprintedCount}頭未印刷のまま終了）` : '完了（QRスキャンに戻る）'}
      </button>
    </div>`;
};

// ラベル発行ボタン押下 → label-gen に遷移し、このボタンを押したことを印刷済みとして記録
// 販売候補は簡易ラベル（ind_sale, 62×25mm）を使用、通常個体は個別飼育ラベル（ind_fixed, 62×70mm）
// [20260424f] _back → backRoute に改名 (label.js 側の命名と統一)
//   label.js L521 は params.backRoute のみ参照するため _back では戻るボタンが
//   't3-completion' に遷移せず、2頭目のラベル発行に戻れなかった。
Pages._t3OpenLabel = function (indId, isForSale) {
  window._t3LabeledIds = window._t3LabeledIds || {};
  window._t3LabeledIds[indId] = true;
  const routeParams = {
    targetType: 'IND',
    targetId:   indId,
    labelType:  isForSale ? 'ind_sale' : 'ind_fixed',
    backRoute:  't3-completion',
    backParam:  {},
  };
  routeTo('label-gen', routeParams);
};

// 完了ボタン: 完了データをクリアして QRスキャンに戻る
Pages._t3FinishCompletion = function () {
  window._t3CompletedInds     = null;
  window._t3CompletedMembers  = null;
  window._t3CompletedUnitDisp = '';
  window._t3LabeledIds        = {};
  routeTo('qr-scan', { mode: 't3' });
};

// label-gen から戻ってこれるようルート登録
window.PAGES['t3-completion'] = function () { Pages._t3ShowCompletion(); };
