// FILE: js/pages/t2_session.js
// build: 20260424u
// 変更点:
//   - [20260424u] 🌟 Store の ID 正規化に伴い両キーマージハックを削除
//     _getT1GrowthBySLot / _fromInd ブランチの両キーマージを単一呼び出しに簡素化。
//   - [20260424t] 🔥 T2移行画面の前回体重 (T1:) が古い値の問題を修正 (T3 と同仕様)
//     _buildT2Members で GR を最優先、_getT1GrowthBySLot を両キー merge に改修。
//     _fromInd 個体起点ブランチでも両キー merge。
//   - [20260424n] 🎯 記録日 (session_date) を編集可能にする (ユーザー要望)
//     T3と同様: date picker を UI に追加、session_date フィールドを保持、
//     確定処理で s.session_date を送信、復元時に欠損を補完。
//   - [20260424m] 🐛 既存セッションの復元で初期値が反映されない問題を修正
//     症状: 20260424l で初期値を 'individualize' にしたが、実機では依然として
//           「未確定」状態で表示されていた。
//     原因: localStorage (T2は永続) に旧バージョンで保存されたセッションが残り、
//           復元時にそのまま使われて新初期値が反映されなかった。
//     修正: (1) _restoreT2SessionFromStorage で復元直後に
//               decision===null を 'individualize' に昇格させるマイグレーション
//               (2) _renderT2Session の冒頭でも保険として補完
//   - [20260424l] 判断の初期値を 'individualize' に変更 (ユーザー要望)
//       既に 20260420b で 2択化 (継続削除) 済みだったが、decision 初期値が null の
//       ままで「何も選択されていない状態」から始まっていた。実運用では大半が
//       個別化なので、初期値を 'individualize' に設定して手間を減らす。
//       (1頭目の固定メンバー / ユニット起点の各メンバー 両方とも)
//   - [20260420d] マット種別とモルトパウダーの連動実装
//       マット種別選択時に mat_molt を自動切り替え: T2=ON, それ以外(T1/T3/MD)=OFF
//       一括設定（_t2SetMatAll）と個別設定（_t2SetMemberMat）の両方で連動
//       ユーザーは手動でトグルすることも可能（連動は選択時のみ）
//   - [20260420c] T2移行セッション開始時に性別情報を引き継ぐバグ修正
//       _buildT2Members: sex を '不明' ハードコードしていたのを src.sex を読み取るよう修正
//       ユニット詳細で編集済みの ♂/♀/不明 が T2移行画面に反映されるようになる
//       同様に memo も引き継ぐよう修正（以前は空文字ハードコード）
//   - [20260420b] T2移行フローを「ユニット解体」モードに整理
//       判断選択肢から「継続」を削除 → 「個別化 / 販売候補」の2択（死亡は独立ボタン）
//       継続飼育 = 継続読取りモードで行う運用に分離
//       説明文を「ユニットを解体して個別化します」に変更
//       判断サマリから「継続」行を削除
//       確認ダイアログから「継続」行を削除、「ユニット解体」の注記追加
//       ユニット status を 'active' → 'individualized' に固定（常に解体される）
//       ラベル発行対象: 個別化 + 販売候補（死亡はスキップ、仕様通り）
//   - [20260420a] セッション保存を sessionStorage → localStorage に変更
//       タブを閉じても未確定セッションが保持されるようにし、
//       未確定セッション通知システム（バナー + 一覧ページ）の対象にする
//       キー名は '_t2SessionData' のまま変更なし（既存データ互換）
//   - [20260418b] 容器選択肢に「その他」ボタンを追加（Step2 🥉③ 4択統一）
//   - t2SessionStart: unit.line_id が空の場合に display_id から line_code を抽出してフォールバック解決
//   - _renderT2Session: lineDisp に同じフォールバック追加
'use strict';

console.log('[HerculesOS] t2_session.js v20260424n loaded');

window._t2Session = window._t2Session || null;

Pages.t2SessionStart = async function (unitDisplayId) {
  console.log('[T2] t2SessionStart - displayId:', unitDisplayId);

  const unit = Store.getUnitByDisplayId(unitDisplayId)
    || (Store.getDB('breeding_units') || []).find(u => u.display_id === unitDisplayId);

  if (!unit) { UI.toast('ユニットが見つかりません: ' + unitDisplayId, 'error'); return; }
  if (unit.status !== 'active') { UI.toast('このユニットは処理済みです（status: ' + unit.status + '）', 'error'); return; }
  if (unit.t2_done) { UI.toast('このユニットはT2移行済みです', 'error'); return; }
  if (unit.stage_phase === 'T2' || unit.stage_phase === 'T3') {
    UI.toast('このユニットはすでに' + unit.stage_phase + 'ステージです。T3移行ボタンを使ってください。', 'error'); return;
  }

  const members = _buildT2Members(unit);
  if (!members || members.length === 0) { UI.toast('ユニットのメンバー情報が取得できません', 'error'); return; }

  const originLotDisplayIds = _resolveOriginLotDisplayIds(unit);

  // ── line_id フォールバック解決 ───────────────────────────────
  // unit.line_id が空の場合は display_id から line_code を抽出してキャッシュ検索
  const _resolvedLineIdT2 = (() => {
    if (unit.line_id) return unit.line_id;
    const dm = (unit.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-/);
    if (!dm) return '';
    const lines = Store.getDB('lines') || [];
    const found = lines.find(l => (l.line_code || l.display_id) === dm[1]);
    return found ? found.line_id : '';
  })();

  window._t2Session = {
    unit_id:    unit.unit_id,
    display_id: unit.display_id,
    line_id:    _resolvedLineIdT2,
    stage_phase:unit.stage_phase || 'T1',
    hatch_date: unit.hatch_date  || '',
    head_count: unit.head_count  || members.length,
    origin_lots:originLotDisplayIds,
    mx_done:      false,
    mat_type:     'T2',
    exchange_type:'FULL',
    // [20260424n] 記録日をユーザーが編集可能に (初期値=今日)
    session_date: new Date().toISOString().split('T')[0].replace(/-/g,'/'),
    members:      members,
    saving:     false,
    _fromInd:   false,
  };

  _saveT2SessionToStorage();
  routeTo('t2-session');
};

Pages.t2SessionStartFromInd = async function (indIdOrDisplayId) {
  console.log('[T2] t2SessionStartFromInd - id:', indIdOrDisplayId);

  const inds = Store.getDB('individuals') || [];
  const ind = inds.find(i => i.ind_id === indIdOrDisplayId || i.display_id === indIdOrDisplayId)
    || Store.getIndividual(indIdOrDisplayId);

  if (!ind) { UI.toast('個体が見つかりません: ' + indIdOrDisplayId, 'error'); return; }

  const members = [{
    unit_slot_no:  1,
    lot_id:        ind.lot_id        || '',
    lot_item_no:   ind.lot_item_no   || '',
    lot_display_id:ind.lot_display_id || ind.lot_id || '',
    size_category: ind.size_category  || '',
    t1_weight_g:   null,
    weight_g:      null,
    sex:           ind.sex || '不明',
    status:        'normal',
    mat_molt:      true,
    container:     '2.7L',
    mat_type:      'T2',
    exchange_type: 'FULL',
    // [20260424l] 初期値を 'individualize' に (旧: null)
    //   ユーザー要望: 判断の既定は「個別化」。2択化 (継続削除) に合わせて既定化。
    decision:      'individualize',
    memo:          '',
  }];

  // [20260424u] Store の ID 正規化により単一呼び出しで十分。
  const records = (typeof Store.getGrowthRecords === 'function')
    ? (Store.getGrowthRecords(ind.ind_id || ind.display_id) || [])
    : [];
  if (records && records.length > 0) {
    const latest = records.filter(r => r.weight_g > 0)
      .sort((a, b) => String(b.record_date).localeCompare(String(a.record_date)))[0];
    if (latest) members[0].t1_weight_g = latest.weight_g;
  }

  window._t2Session = {
    unit_id:     ind.ind_id,
    display_id:  ind.display_id || indIdOrDisplayId,
    line_id:     ind.line_id    || '',
    stage_phase: ind.current_stage || 'T1',
    hatch_date:  ind.hatch_date   || '',
    head_count:  1,
    origin_lots: ind.lot_id ? [ind.lot_id] : [],
    mx_done:     false,
    mat_type:    'T2',
    exchange_type:'FULL',
    // [20260424n] 記録日をユーザーが編集可能に (初期値=今日)
    session_date: new Date().toISOString().split('T')[0].replace(/-/g,'/'),
    members,
    saving:      false,
    _fromInd:    true,
    ind_id:      ind.ind_id,
  };

  _saveT2SessionToStorage();
  routeTo('t2-session');
};

function _buildT2Members(unit) {
  let parsedMembers = [];
  const raw = unit.members;
  if (Array.isArray(raw)) {
    parsedMembers = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try { parsedMembers = JSON.parse(raw); } catch(e) { parsedMembers = []; }
  }

  const unitSizeCategory = unit.size_category || '';
  const count = Math.max(parseInt(unit.head_count, 10) || 2, parsedMembers.length, 1);
  // [20260424t] unit オブジェクトを渡して両キーから merge
  const growthBySLot = _getT1GrowthBySLot(unit);
  const result = [];

  for (let i = 0; i < count; i++) {
    const src = parsedMembers[i] || {};
    const slotNo = i + 1;
    // [20260424t] サイズ・体重とも GR 優先 (T3 と同仕様)
    //   症状: T2移行画面で前回体重が編成時の固定値のまま表示される。
    //   原因: src.weight_g (= unit.members[].weight_g) を最優先していた。
    //   対応: 最新 GR を優先、無ければ src.weight_g にフォールバック。
    const _grRow = growthBySLot[slotNo];
    const sizeCategory =
      (_grRow && _grRow.size_category)
      || src.size_category
      || unitSizeCategory
      || '';

    result.push({
      unit_slot_no:  slotNo,
      lot_id:        src.lot_id         || '',
      lot_item_no:   src.lot_item_no    || '',
      lot_display_id:src.lot_display_id || src.lot_id || '',
      size_category: sizeCategory,
      // [20260424t] GR の weight_g を最優先
      t1_weight_g:   (_grRow && _grRow.weight_g) || src.weight_g || null,
      weight_g:      null,
      // [20260420c] ユニットで設定済みの性別を引き継ぐ（以前は '不明' ハードコード）
      //   unit.members JSON に保存されている src.sex を優先、なければ「不明」
      sex:           (src.sex === '♂' || src.sex === '♀' || src.sex === '不明') ? src.sex : '不明',
      status:        'normal',
      // [20260420d] 初期マット種別 = T2 → モルトパウダー ON
      //   _t2SetMatAll / _t2SetMemberMat と同じロジックを使用
      mat_molt:      true,
      container:     '2.7L',
      mat_type:      'T2',
      exchange_type: 'FULL',
      // [20260424l] 初期値を 'individualize' に (ユニット起点の各メンバー)
      decision:      'individualize',
      memo:          src.memo || '',
    });
  }
  return result;
}

// [20260424u] Store の ID 正規化により単一キーで十分。
//   後方互換のため文字列 (unit_id) も受け付ける。
function _getT1GrowthBySLot(unit) {
  let _u = unit;
  if (typeof _u === 'string') _u = { unit_id: _u };
  if (!_u) return {};
  const recs = (typeof Store.getGrowthRecords === 'function')
    ? (Store.getGrowthRecords(_u.unit_id || _u.display_id) || [])
    : [];
  if (recs.length === 0) return {};
  const bySlot = {};
  recs.forEach(r => {
    const slot = parseInt(r.unit_slot_no, 10);
    if (!slot) return;
    if (!bySlot[slot] || String(r.record_date) > String(bySlot[slot].record_date)) bySlot[slot] = r;
  });
  return bySlot;
}

function _resolveOriginLotDisplayIds(unit) {
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

function _formatOriginLots(originLotDisplayIds) {
  if (!originLotDisplayIds || originLotDisplayIds.length === 0) return '—';
  const short = originLotDisplayIds.map(d => { const m = d.match(/[A-Z0-9]+-L\d+/); return m ? m[0] : d; });
  return short.join(' / ');
}

function _saveT2SessionToStorage() {
  try { localStorage.setItem('_t2SessionData', JSON.stringify(window._t2Session)); } catch(e) {}
}
function _restoreT2SessionFromStorage() {
  try {
    const raw = localStorage.getItem('_t2SessionData');
    if (raw) {
      window._t2Session = JSON.parse(raw);
      // [20260424m] 旧バージョンで保存された decision:null を
      //   新初期値 'individualize' に昇格させる (2択化対応)
      //   T2は localStorage 永続なので、ブラウザを閉じても古い状態が残り、
      //   新バージョンで開いても画面が「未確定」で始まる問題を解消する。
      if (window._t2Session && Array.isArray(window._t2Session.members)) {
        let migrated = 0;
        window._t2Session.members.forEach(m => {
          if (m && m.decision === null) { m.decision = 'individualize'; migrated++; }
        });
        if (migrated > 0) {
          console.log('[T2] restored session: migrated ' + migrated + ' member(s) decision null → individualize');
          _saveT2SessionToStorage();
        }
      }
      // [20260424n] 旧バージョンで保存された session_date 欠損を補完 (= 今日)
      if (window._t2Session && !window._t2Session.session_date) {
        window._t2Session.session_date = new Date().toISOString().split('T')[0].replace(/-/g,'/');
        _saveT2SessionToStorage();
      }
    }
  } catch(e) {}
}

Pages.t2Session = function (params = {}) {
  if (!window._t2Session) _restoreT2SessionFromStorage();
  if (!window._t2Session) { routeTo('qr-scan', { mode: 't2' }); return; }
  _renderT2Session(window._t2Session);
};

function _renderT2Session(s) {
  const main = document.getElementById('main');
  if (!main) return;

  // [20260424m] 保険: render 時にも decision===null があれば 'individualize' に補完
  //   古いセッションがどこかで混入した場合の最終防壁。
  if (Array.isArray(s.members)) {
    s.members.forEach(m => { if (m && m.decision === null) m.decision = 'individualize'; });
  }

  // ── line_id フォールバック表示 ────────────────────────────────
  const line      = s.line_id ? Store.getLine(s.line_id) : null;
  const lineDisp  = (() => {
    if (line) return line.line_code || line.display_id || '';
    // フォールバック: "HM2025-A1-U06" → "A1" を抽出
    const dm = (s.display_id || '').match(/^[A-Za-z0-9]+-([A-Za-z][0-9]+)-/);
    return dm ? dm[1] : (s.line_id || '—');
  })();

  const originStr = _formatOriginLots(s.origin_lots);
  const nextPhase = _nextStagePhase(s.stage_phase);
  const allInputComplete = s.members.every(m => _isT2MemberComplete(m));
  const canSave   = allInputComplete && !s.saving;

  if (s.saving) {
    main.innerHTML = `
      ${UI.header('T2移行編成セッション', { back: false })}
      <div class="page-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:16px">
        <div class="spinner" style="width:44px;height:44px;border-width:4px"></div>
        <div style="font-size:.9rem;color:var(--text2);font-weight:600">T2移行を保存中...</div>
        <div style="font-size:.75rem;color:var(--text3)">${s.display_id}</div>
      </div>`;
    return;
  }

  main.innerHTML = `
    ${UI.header('T2移行編成セッション', { back: true, backFn: "Pages._t2SessionBack()" })}
    <div class="page-body" style="padding-bottom:84px">

      <div style="background:var(--surface2);border-radius:10px;padding:12px 14px;font-size:.8rem">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-weight:700;color:var(--gold);font-family:var(--font-mono);font-size:.9rem">${s.display_id}</span>
          <span style="background:rgba(91,168,232,.15);color:var(--blue);padding:2px 8px;border-radius:5px;font-size:.72rem;font-weight:700">
            ${s.stage_phase} → ${nextPhase}
          </span>
          <span style="color:var(--text3)">${lineDisp}　${s.head_count}頭</span>
        </div>
        ${s.hatch_date ? `<div style="font-size:.72rem;color:var(--text3)">孵化: ${s.hatch_date}</div>` : ''}
        <div style="font-size:.72rem;color:var(--text3)">由来ロット: ${originStr}</div>
      </div>

      <!-- [20260424n] 記録日ピッカー (初期値=今日、変更可能) -->
      <div style="margin-top:8px;background:var(--surface1,var(--surface));border:1.5px solid var(--border);border-radius:10px;padding:10px 14px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label style="font-size:.82rem;font-weight:700;color:var(--text2);flex-shrink:0">
            🗓️ 記録日
          </label>
          <input type="date" id="t2-session-date"
            value="${(s.session_date||'').replace(/\//g,'-')}"
            onchange="Pages._t2SetSessionDate(this.value)"
            style="flex:1;min-width:150px;padding:7px 10px;border-radius:8px;border:1px solid var(--border);
              background:var(--bg2);color:var(--text1);font-size:.88rem;box-sizing:border-box">
          <button type="button" onclick="Pages._t2SetSessionDate('')"
            style="padding:6px 10px;border-radius:7px;border:1px solid var(--border);background:var(--bg2);
              color:var(--text3);font-size:.72rem;cursor:pointer;flex-shrink:0">
            今日
          </button>
        </div>
        <div style="font-size:.68rem;color:var(--text3);margin-top:4px">
          体重・成長記録・個体化日として使われます。過去日付も指定可能です。
        </div>
      </div>

      <div style="background:rgba(91,168,232,.07);border:1px solid rgba(91,168,232,.25);border-radius:8px;padding:10px 12px;margin-top:8px;font-size:.76rem;color:var(--text2);line-height:1.6">
        <b>T1→T2移行</b>を確定します。<br>
        ユニットを解体して、各個体を <b>個別化</b>・<b>販売候補</b>・<b>死亡</b> のいずれかに振り分けてください。<br>
        <span style="color:var(--text3)">※ 2頭そのまま継続飼育する場合はここには入らず、「継続読取りモード」で体重だけ記録します。</span>
      </div>

      <div style="margin-top:8px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface1,var(--surface));padding:12px 14px">
        <div style="font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:6px">
          🌿 マット種別 — 一括設定
          <span style="font-size:.62rem;font-weight:400;color:var(--text3);margin-left:4px">個体カードで個別変更可</span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px">
          ${['T1','T2','T3','MD'].map(v => {
            const active = s.members.length && s.members.every(m => m.mat_type === v || m.status === 'dead');
            return `<button type="button" onclick="Pages._t2SetMatAll('${v}')"
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
            return `<button type="button" onclick="Pages._t2SetExchangeAll('${x.v}')"
              style="flex:1;padding:10px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
                border:2px solid ${active ? 'var(--green)' : 'var(--border)'};
                background:${active ? 'rgba(76,175,120,.15)' : 'var(--bg2)'};
                color:${active ? 'var(--green)' : 'var(--text2)'}">
              ${x.l}
            </button>`;
          }).join('')}
        </div>
      </div>

      ${s.members.map((m, i) => _renderT2MemberCard(m, i, s)).join('')}
      ${_renderT2Summary(s)}

      ${(!allInputComplete && s.members.some(m => m.decision !== null)) ? `
      <div style="background:rgba(224,144,64,.08);border:1px solid rgba(224,144,64,.3);border-radius:8px;padding:10px 12px;margin-top:8px;font-size:.78rem;color:var(--amber)">
        ⚠️ 全頭の判断が完了していません。体重・判断を確認してください。
      </div>` : ''}

    </div>

    <div class="quick-action-bar">
      <button class="btn btn-ghost" style="flex:1;padding:14px 0" onclick="Pages._t2SessionCancel()">破棄</button>
      <button class="btn btn-gold" style="flex:2;padding:14px 0;font-weight:700;font-size:.95rem"
        ${canSave ? '' : 'disabled'} onclick="Pages._t2SessionSave()">
        💾 T2移行を確定
      </button>
    </div>`;

  _saveT2SessionToStorage();
}

function _renderT2MemberCard(m, idx, s) {
  const isDead    = m.status === 'dead';
  const slotLabel = idx === 0 ? '1頭目' : idx === 1 ? '2頭目' : `${idx + 1}頭目`;
  const isComplete  = _isT2MemberComplete(m);
  const cardBorder  = isDead ? 'rgba(224,80,80,.35)' : (isComplete ? 'rgba(76,175,120,.35)' : 'var(--border)');
  const cardBg      = isDead ? 'rgba(224,80,80,.04)' : (isComplete ? 'rgba(76,175,120,.04)' : 'var(--surface1,var(--surface))');

  const sizeBtns = ['大', '中', '小'].map(sz => {
    const on = m.size_category === sz;
    return `<button type="button" onclick="Pages._t2SetSize(${idx},'${sz}')"
      style="min-width:48px;padding:8px 10px;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? 'var(--green)' : 'var(--border)'};
        background:${on ? 'var(--green)' : 'var(--bg2)'};color:${on ? '#fff' : 'var(--text2)'};
        opacity:${isDead ? '.3' : '1'};pointer-events:${isDead ? 'none' : 'auto'}" ${isDead ? 'disabled' : ''}>${sz}</button>`;
  }).join('');

  let t1WeightRef = '';
  if (m.t1_weight_g) {
    const diff = (m.weight_g && m.t1_weight_g) ? (Number(m.weight_g) - Number(m.t1_weight_g)) : null;
    const diffStr = diff !== null
      ? (diff >= 0 ? `<span style="color:var(--green);font-weight:700"> +${diff}g</span>` : `<span style="color:var(--red,#e05050);font-weight:700"> ${diff}g</span>`)
      : '';
    t1WeightRef = `<div style="font-size:.65rem;color:var(--text3);margin-top:3px;text-align:right">前回: <b style="color:var(--text2)">${m.t1_weight_g}g</b>${diffStr}</div>`;
  }

  const sexBtns = ['不明', '♂', '♀'].map(sx => {
    const on = m.sex === sx;
    const col = sx === '♂' ? '#3366cc' : sx === '♀' ? '#cc3366' : 'var(--text3)';
    return `<button type="button" onclick="Pages._t2SetSex(${idx},'${sx}')"
      style="flex:1;padding:7px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? col : 'var(--border)'};
        background:${on ? (sx==='♂'?'rgba(51,102,204,.15)':sx==='♀'?'rgba(204,51,102,.15)':'var(--surface2)') : 'var(--bg2)'};
        color:${on ? col : 'var(--text2)'};
        opacity:${isDead ? '.3' : '1'};pointer-events:${isDead ? 'none' : 'auto'}" ${isDead ? 'disabled' : ''}>${sx}</button>`;
  }).join('');

  const statusBtns = [
    { key: 'normal', lbl: '通常',    ac: 'var(--green)',      abg: 'var(--green)',          ton: '#fff' },
    { key: 'dead',   lbl: '💀 死亡', ac: 'var(--red,#e05050)',abg: 'rgba(224,80,80,.18)',   ton: 'var(--red,#e05050)' },
  ].map(({ key, lbl, ac, abg, ton }) => {
    const on = m.status === key;
    return `<button type="button" onclick="Pages._t2SetStatus(${idx},'${key}')"
      style="flex:1;padding:9px 0;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? ac : 'var(--border)'};background:${on ? abg : 'var(--bg2)'};color:${on ? ton : 'var(--text2)'}">
      ${lbl}</button>`;
  }).join('');

  // [20260420b] T2移行では「継続」を削除（継続 = 継続読取りモードで行う）
  //             ユニットは必ず解体され、個別化/販売候補/死亡 のいずれかになる
  const decisionDefs = [
    { key: 'individualize', lbl: '個別化',   color: 'var(--green)', bg: 'rgba(76,175,120,.18)',  desc: '→ 個体台帳に登録して個別飼育へ' },
    { key: 'sale',          lbl: '販売候補', color: 'var(--amber)', bg: 'rgba(224,144,64,.18)',  desc: '→ 販売候補として個体台帳に登録' },
  ];
  const decisionBtns = decisionDefs.map(({ key, lbl, color, bg }) => {
    const on = m.decision === key;
    return `<button type="button" onclick="Pages._t2SetDecision(${idx},'${key}')"
      style="flex:1;padding:9px 0;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;
        border:2px solid ${on ? color : 'var(--border)'};background:${on ? bg : 'var(--bg2)'};color:${on ? color : 'var(--text2)'}">
      ${lbl}</button>`;
  }).join('');
  const selectedDecision = decisionDefs.find(d => d.key === m.decision);

  const completeBadge = isComplete
    ? `<span style="font-size:.65rem;padding:2px 8px;border-radius:10px;font-weight:700;background:${isDead?'rgba(224,80,80,.12)':'rgba(76,175,120,.12)'};color:${isDead?'var(--red,#e05050)':'var(--green)'}">
        ${isDead ? '💀 死亡' : '✅ 確定'}</span>`
    : `<span style="font-size:.65rem;padding:2px 8px;border-radius:10px;font-weight:700;background:rgba(224,144,64,.12);color:var(--amber)">未確定</span>`;

  const lotInfo = (m.lot_display_id || m.lot_id)
    ? `<div style="font-size:.65rem;color:var(--text3);margin-bottom:6px">元ロット: ${m.lot_display_id || m.lot_id}${m.lot_item_no ? ' #' + m.lot_item_no : ''}</div>`
    : '';

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
        <div style="display:flex;flex-direction:column;align-items:flex-end;margin-left:auto">
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" inputmode="numeric" min="1" max="999" step="1" placeholder="体重"
              value="${m.weight_g !== null ? m.weight_g : ''}"
              style="width:76px;padding:8px 6px;text-align:center;border-radius:8px;
                border:2px solid ${m.weight_g ? 'var(--green)' : 'var(--border)'};
                background:var(--bg2);font-size:1rem;font-weight:700;color:var(--text1);
                opacity:${isDead ? '.3' : '1'};pointer-events:${isDead ? 'none' : 'auto'}"
              ${isDead ? 'disabled' : ''}
              onblur="Pages._t2CommitWeight(${idx},this.value)"
              onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}">
            <span style="font-size:.8rem;color:var(--text3);font-weight:600">g</span>
          </div>
          ${t1WeightRef}
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
          <button type="button" onclick="Pages._t2SetMemberContainer(${idx},'${v}')"
            style="flex:1;padding:7px 0;border-radius:7px;font-size:.82rem;font-weight:700;cursor:pointer;
              border:2px solid ${m.container===v?'var(--green)':'var(--border)'};
              background:${m.container===v?'rgba(76,175,120,.15)':'var(--bg2)'};
              color:${m.container===v?'var(--green)':'var(--text2)'}">${v}</button>
        `).join('')}
      </div>
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:5px">🌿 マット<span style="font-weight:400;margin-left:4px">（空=自動）</span></div>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        ${['T1','T2','T3','MD'].map(v => `
          <button type="button" onclick="Pages._t2SetMemberMat(${idx},'${v}')"
            style="flex:1;padding:7px 0;border-radius:7px;font-size:.82rem;font-weight:700;cursor:pointer;
              border:2px solid ${m.mat_type===v?'var(--green)':'var(--border)'};
              background:${m.mat_type===v?'rgba(76,175,120,.15)':'var(--bg2)'};
              color:${m.mat_type===v?'var(--green)':'var(--text2)'}">${v}</button>
        `).join('')}
      </div>
      <div style="font-size:.72rem;font-weight:700;color:var(--text3);margin-bottom:5px">🧪 モルトパウダー（記録）</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div onclick="Pages._t2SetMolt(${idx},${!m.mat_molt})"
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
          <button type="button" onclick="Pages._t2SetMemberExchange(${idx},'${x.v}')"
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
        oninput="Pages._t2SetMemo(${idx},this.value)">
    </div>
  </div>`;
}

function _renderT2Summary(s) {
  // [20260420b] 継続オプション削除に伴い、サマリからも継続行を削除
  const cnt = {
    individualize:s.members.filter(m => m.decision === 'individualize').length,
    sale:         s.members.filter(m => m.decision === 'sale').length,
    dead:         s.members.filter(m => m.decision === 'dead').length,
    undecided:    s.members.filter(m => m.decision === null).length,
  };
  const allDone = cnt.undecided === 0;
  return `
  <div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-top:12px">
    <div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:8px">判断サマリ</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.8rem">
      <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:var(--green);flex-shrink:0"></span><span>個別化</span><b style="margin-left:auto;color:var(--green)">${cnt.individualize}頭</b></div>
      <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:var(--amber);flex-shrink:0"></span><span>販売候補</span><b style="margin-left:auto;color:var(--amber)">${cnt.sale}頭</b></div>
      <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:var(--red,#e05050);flex-shrink:0"></span><span>死亡</span><b style="margin-left:auto;color:var(--red,#e05050)">${cnt.dead}頭</b></div>
    </div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border2);font-size:.75rem;color:${allDone?'var(--green)':'var(--amber)'}">
      ${allDone ? '✅ 全頭の判断が完了しています' : `⚠️ 未判断: ${cnt.undecided}頭`}
    </div>
  </div>`;
}

function _nextStagePhase(current) {
  const map = { T1: 'T2', T2: 'T3', T3: 'T3（最終）' };
  return map[current] || current + '→次';
}

function _isT2MemberComplete(m) {
  if (m.decision === 'dead') return true;
  if (m.decision === null)   return false;
  return m.weight_g !== null && m.weight_g > 0;
}

Pages._t2SetSize = function (idx, size) {
  const s = window._t2Session; if (!s) return;
  if (s.members[idx].status === 'dead') return;
  s.members[idx].size_category = s.members[idx].size_category === size ? '' : size;
  _renderT2Session(s);
};
Pages._t2SetStatus = function (idx, status) {
  const s = window._t2Session; if (!s) return;
  s.members[idx].status = status;
  if (status === 'dead') {
    s.members[idx].decision = 'dead'; s.members[idx].weight_g = null; s.members[idx].size_category = '';
  } else {
    if (s.members[idx].decision === 'dead') s.members[idx].decision = null;
  }
  _renderT2Session(s);
};
Pages._t2SetDecision = function (idx, decision) {
  const s = window._t2Session; if (!s || s.members[idx].status === 'dead') return;
  s.members[idx].decision = decision; _renderT2Session(s);
};
Pages._t2CommitWeight = function (idx, val) {
  const s = window._t2Session; if (!s) return;
  const n = parseInt(val, 10);
  const newW = (!val || isNaN(n) || n <= 0) ? null : Math.min(999, n);
  if (s.members[idx].weight_g === newW) return;
  s.members[idx].weight_g = newW;
  _saveT2SessionToStorage();
  clearTimeout(Pages._t2RefreshTimer);
  Pages._t2RefreshTimer = setTimeout(() => _renderT2Session(window._t2Session), 200);
};
Pages._t2SetSex = function (idx, sex) {
  const s = window._t2Session; if (!s || s.members[idx].status === 'dead') return;
  s.members[idx].sex = sex; _renderT2Session(s);
};
Pages._t2SetMemo = function (idx, val) {
  const s = window._t2Session; if (s) { s.members[idx].memo = val; _saveT2SessionToStorage(); }
};
Pages._t2SessionBack = function () {
  if (confirm('セッションを中断しますか？（入力内容は一時保存されます）')) routeTo('qr-scan', { mode: 't2' });
};
Pages._t2SessionCancel = function () {
  if (confirm('セッションを破棄しますか？（入力内容は消えます）')) {
    window._t2Session = null; localStorage.removeItem('_t2SessionData'); routeTo('qr-scan', { mode: 't2' });
  }
};
Pages._t2SetContainer = function(v) {
  const s = window._t2Session; if (!s) return; s.container = (s.container === v) ? '' : v; _renderT2Session(s);
};
Pages._t2GoQR = function() { window._t2PendingLabels = null; routeTo('qr-scan', { mode: 't2' }); };
Pages._t2LaunchAllLabels = function() {
  const pending = window._t2PendingLabels;
  if (!pending || !pending.indIds || pending.indIds.length === 0) { Pages._t2GoQR(); return; }
  window._t2PendingLabels = null;
  const indIds = pending.indIds; let idx = 0;
  function _next() {
    if (idx >= indIds.length) { UI.toast('全' + indIds.length + '枚のラベル発行が完了しました ✅', 'success'); routeTo('qr-scan', { mode: 't2' }); return; }
    const indId = indIds[idx++];
    const ind = typeof Store.getIndividual === 'function' ? Store.getIndividual(indId) : null;
    if (!ind) { _next(); return; }
    window._t2LabelNextFn = _next; window._t2LabelTotalCount = indIds.length; window._t2LabelCurrentIdx = idx - 1;
    routeTo('label-gen', { targetType:'IND', targetId:ind.ind_id, _t2LabelMode:true, _t2LabelIdx:idx-1, _t2LabelTotal:indIds.length });
  }
  _next();
};
Pages._t2SetMxAll = function(val) {
  const s = window._t2Session; if (!s) return;
  s.members.forEach(m => { if (m.status !== 'dead') m.mat_molt = val; }); _renderT2Session(s);
};
Pages._t2SetMemberContainer = function(idx, v) {
  const s = window._t2Session; if (!s) return;
  const m = s.members[idx]; if (m) { m.container = (m.container === v) ? '' : v; _renderT2Session(s); }
};
Pages._t2SetMemberMat = function(idx, v) {
  const s = window._t2Session; if (!s) return;
  const m = s.members[idx];
  if (m) {
    m.mat_type = v;
    // [20260420d] マット種別とモルトパウダーを連動
    //   T2 マット選択 → モルトパウダー ON、それ以外 → OFF
    m.mat_molt = (v === 'T2');
    _renderT2Session(s);
  }
};
Pages._t2SetMolt = function(idx, val) {
  const s = window._t2Session; if (!s) return;
  const m = s.members[idx]; if (m) { m.mat_molt = val; _renderT2Session(s); }
};
Pages._t2SetMatType = function(v) {
  const s = window._t2Session; if (!s) return; s.mat_type = v; _renderT2Session(s);
};
Pages._t2SetMatAll = function(v) {
  const s = window._t2Session; if (!s) return;
  s.mat_type = v;
  // [20260420d] マット一括設定時にモルトパウダーも連動
  //   T2 マット選択 → モルトパウダー ON、それ以外 → OFF
  const moltVal = (v === 'T2');
  s.members.forEach(function(m) {
    if (m.status !== 'dead') {
      m.mat_type = v;
      m.mat_molt = moltVal;
    }
  });
  _renderT2Session(s);
};
Pages._t2SetExchangeAll = function(v) {
  const s = window._t2Session; if (!s) return;
  s.exchange_type = v; s.members.forEach(function(m) { if (m.status !== 'dead') m.exchange_type = v; }); _renderT2Session(s);
};
Pages._t2SetExchange = function(v) { Pages._t2SetExchangeAll(v); };
Pages._t2SetMemberExchange = function(idx, v) {
  const s = window._t2Session; if (!s) return;
  const m = s.members[idx]; if (m) { m.exchange_type = v; _renderT2Session(s); }
};
Pages._t2ToggleDetail = function() {
  const s = window._t2Session; if (!s) return; s._showDetail = !s._showDetail; _renderT2Session(s);
};
Pages._t2SetMx = function (done) {
  const s = window._t2Session; if (!s) return; s.mx_done = done; _renderT2Session(s);
};
// [20260424n] T2 記録日セッター (引数空文字で今日にリセット)
Pages._t2SetSessionDate = function (val) {
  const s = window._t2Session; if (!s) return;
  const norm = v => String(v||'').trim().replace(/-/g,'/');
  s.session_date = val
    ? norm(val)
    : new Date().toISOString().split('T')[0].replace(/-/g,'/');
  _saveT2SessionToStorage();
  _renderT2Session(s);
};

Pages._t2SessionSave = async function () {
  const s = window._t2Session;
  if (!s || s.saving) return;

  console.log('[T2_SAVE] ===== save triggered =====');
  console.log('[T2_SAVE] window.__API_BUILD :', window.__API_BUILD || '(not set - OLD api.js!)');
  console.log('[T2_SAVE] typeof API        :', typeof API);
  console.log('[T2_SAVE] typeof API.t2     :', typeof (window.API && window.API.t2));
  console.log('[T2_SAVE] typeof API.t2.createSession:', typeof (window.API && window.API.t2 && window.API.t2.createSession));
  console.log('[T2_SAVE] CONFIG.GAS_URL    :', (window.CONFIG && window.CONFIG.GAS_URL || '').slice(0,80) || '(unset)');
  console.log('[T2_SAVE] session            :', { unit_id: s.unit_id, display_id: s.display_id, membersCount: s.members.length });

  if (!s.members.every(m => _isT2MemberComplete(m))) {
    UI.toast('全頭の判断を完了してください（体重も入力してください）', 'error'); return;
  }

  // [20260420b] 継続削除 → ユニットは必ず解体される前提に
  const individualizeCount= s.members.filter(m => m.decision === 'individualize').length;
  const saleCount         = s.members.filter(m => m.decision === 'sale').length;
  const deadCount         = s.members.filter(m => m.decision === 'dead').length;
  const nextPhase         = _nextStagePhase(s.stage_phase);

  const confirmMsg =
    `T2移行を確定します（取り消せません）\n\nユニット: ${s.display_id}\n由来ロット: ${_formatOriginLots(s.origin_lots)}\n\n` +
    `個別化: ${individualizeCount}頭 → 個体台帳へ\n販売候補: ${saleCount}頭\n死亡: ${deadCount}頭\n\n` +
    `※ このユニットは解体され、status = individualized になります`;
  if (!confirm(confirmMsg)) return;

  s.saving = true; _renderT2Session(s);

  try {
    // [20260424n] session_date はユーザー選択の日付を使う (初期値=今日)
    const sessionDate = (s.session_date && String(s.session_date).trim())
      ? String(s.session_date).trim().replace(/-/g,'/')
      : new Date().toISOString().split('T')[0].replace(/-/g, '/');
    const payload = {
      transaction_type:       'T2_SESSION',
      session_date:           sessionDate,
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
        mat_molt:      m.mat_molt      !== undefined ? m.mat_molt  : true,
        container:     m.container     || '2.7L',
        mat_type:      m.mat_type       || 'T2',
        exchange_type: m.exchange_type  || s.exchange_type || 'FULL',
      })),
    };
    console.log('[T2] save payload', payload);
    const res = await API.t2.createSession(payload);
    console.log('[T2] save response', res);

    const _sessionMembers = s.members.filter(m => m.decision !== 'dead').map(m => ({
      unit_slot_no: m.unit_slot_no, lot_id: m.lot_id||'', lot_item_no: m.lot_item_no||'',
      lot_display_id: m.lot_display_id||'', size_category: m.size_category||'',
      weight_g: m.weight_g||null, sex: m.sex||'不明', memo: m.memo||'',
    }));
    // [20260420b] T2移行は必ずユニット解体 → status: 'individualized'
    //             （GAS レスポンスで上書きされるがフォールバック値として正しい状態に）
    const _unitPatch = { t2_done:true, stage_phase:'T2', status:'individualized', members:JSON.stringify(_sessionMembers) };

    if (res && res.updated_unit) {
      const _merged = Object.assign({}, _unitPatch, res.updated_unit);
      if (!_merged.members || _merged.members === '[]' || _merged.members === '') _merged.members = JSON.stringify(_sessionMembers);
      if (typeof Store.patchDBItem === 'function') Store.patchDBItem('breeding_units', 'unit_id', s.unit_id, _merged);
      else { const units=(Store.getDB('breeding_units')||[]).map(u=>u.unit_id===s.unit_id?Object.assign({},u,_merged):u); Store.setDB('breeding_units',units); }
    } else {
      if (typeof Store.patchDBItem === 'function') Store.patchDBItem('breeding_units', 'unit_id', s.unit_id, _unitPatch);
      else { const units=(Store.getDB('breeding_units')||[]).map(u=>u.unit_id===s.unit_id?Object.assign({},u,_unitPatch):u); Store.setDB('breeding_units',units); }
    }
    if (res && Array.isArray(res.created_individuals)) {
      res.created_individuals.forEach(ind => { if (typeof Store.addDBItem === 'function') Store.addDBItem('individuals', ind); });
    }

    window._t2Session = null; localStorage.removeItem('_t2SessionData');
    UI.toast('T2移行を完了しました ✅', 'success', 3000);

    // [20260420b] ラベル発行対象 = 個別化 + 販売候補（死亡はスキップ）
    const _indMembers = s.members.filter(function(m){ return m.decision === 'individualize' || m.decision === 'sale'; });
    const _createdInds = (res && Array.isArray(res.created_individuals)) ? res.created_individuals : [];
    if (_indMembers.length > 0 && _createdInds.length > 0) {
      const _indIds = _createdInds.map(function(i){ return i.ind_id; });
      window._t2PendingLabels = { indIds: _indIds, inds: _createdInds, members: _indMembers };
      Pages._t2LaunchAllLabels();
    } else {
      routeTo('qr-scan', { mode: 't2' });
    }
  } catch (e) {
    console.error('[T2] save error:', e); s.saving = false; _renderT2Session(s);
    UI.toast('保存失敗: ' + (e.message || '通信エラー'), 'error', 5000);
  }
};

window.PAGES = window.PAGES || {};
window.PAGES['t2-session'] = function () { Pages.t2Session(Store.getParams()); };
