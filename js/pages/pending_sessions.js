// FILE: js/pages/pending_sessions.js
// ════════════════════════════════════════════════════════════════
// pending_sessions.js — 未確定セッション一覧ページ
// build: 20260420a
//
// 役割:
//   localStorage に保持されている T1/T2/T3 移行セッションのうち、
//   確定まで進んだが最終保存できていないものを一覧表示する。
//   各行から「続きから再開」または「破棄」を選択可能。
//
// エントリ:
//   routeTo('pending-sessions') → Pages.pendingSessions()
//
// 関連:
//   UI.getPendingSessions() (app.js) - 検出ロジック
//   UI.pendingBanner()      (app.js) - バナー（ダッシュボード/管理画面）
// ════════════════════════════════════════════════════════════════

'use strict';

console.log('[HerculesOS] pending_sessions.js v20260420a loaded');

Pages.pendingSessions = function () {
  const main = document.getElementById('main');
  if (!main) return;
  _renderPendingSessions();
};

function _renderPendingSessions() {
  const main = document.getElementById('main');
  const list = (UI.getPendingSessions ? UI.getPendingSessions() : []);

  main.innerHTML = `
    ${UI.header('未確定セッション', { back: true })}
    <div class="page-body">

      ${list.length === 0 ? `
        <div class="card" style="padding:24px 16px;text-align:center">
          <div style="font-size:2rem;margin-bottom:8px">✅</div>
          <div style="font-size:.95rem;font-weight:700;color:var(--green);margin-bottom:4px">
            未確定のセッションはありません
          </div>
          <div style="font-size:.78rem;color:var(--text3)">
            全ての T1 / T2 / T3 移行セッションが完了しています。
          </div>
        </div>
      ` : `

        <div style="padding:4px 2px 10px;font-size:.78rem;color:var(--text3);line-height:1.5">
          以下のセッションは確定操作まで進んでいますが、GAS への最終保存が完了していません。
          「続きから再開」ボタンで処理を完結させてください。
        </div>

        ${list.map(_renderPendingCard).join('')}
      `}

    </div>`;
}

function _renderPendingCard(item) {
  // セッション種別別の色とアイコン
  const typeColor = item.type === 'T1' ? 'var(--green)'
                  : item.type === 'T2' ? 'var(--amber)'
                  : 'var(--blue)';
  const typeIcon  = item.type === 'T1' ? '🐛'
                  : item.type === 'T2' ? '🔄'
                  : '⭐';

  // 続きから再開の onclick
  //   T1: 最初のロットIDで t1SessionStart を呼ぶ（既存のリジューム検出で復元される）
  //   T2: 最初のソースユニットの display_id で t2SessionStart を呼ぶ
  //   T3: 同様
  let resumeFn = '';
  if (item.type === 'T1') {
    const firstLotId = (item.lotIds || [])[0] || '';
    resumeFn = firstLotId
      ? `Pages.t1SessionStart('${firstLotId}')`
      : `UI.toast('ロットIDが見つかりません', 'error')`;
  } else if (item.type === 'T2') {
    // T2 は localStorage から直接復元してセッション画面へ
    resumeFn = `routeTo('t2-session')`;
  } else if (item.type === 'T3') {
    resumeFn = `routeTo('t3-session')`;
  }

  const discardFn = `Pages._pendingDiscard('${item.type}')`;

  return `<div class="card" style="padding:14px;margin-bottom:10px;border-left:4px solid ${typeColor}">

    <!-- ヘッダー行 -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span style="font-size:1.3rem">${typeIcon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:.95rem;font-weight:700;color:${typeColor}">${item.label}</div>
        <div style="font-size:.72rem;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          対象: ${item.lotLabel || '—'}
        </div>
      </div>
    </div>

    <!-- 進捗情報 -->
    <div style="background:rgba(255,255,255,.03);border-radius:8px;padding:10px;margin-bottom:10px;font-size:.8rem">
      <div style="display:flex;justify-content:space-between;padding:2px 0">
        <span style="color:var(--text3)">確定済みユニット</span>
        <span style="font-weight:700">${item.unitCount || 0} 件</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:2px 0">
        <span style="color:var(--text3)">個別飼育</span>
        <span style="font-weight:700">${item.singleCount || 0} 頭</span>
      </div>
      ${item.totalHead ? `
      <div style="display:flex;justify-content:space-between;padding:2px 0">
        <span style="color:var(--text3)">ロット総頭数</span>
        <span style="font-weight:700">${item.totalHead} 頭</span>
      </div>` : ''}
      ${item.updatedAt ? `
      <div style="display:flex;justify-content:space-between;padding:2px 0">
        <span style="color:var(--text3)">最終更新</span>
        <span style="font-size:.74rem">${item.updatedAt}</span>
      </div>` : ''}
    </div>

    <!-- アクションボタン -->
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" style="flex:2;background:${typeColor}"
        onclick="${resumeFn}">
        🔄 続きから再開
      </button>
      <button class="btn btn-ghost" style="flex:1;color:var(--red);border-color:rgba(224,80,80,.4)"
        onclick="${discardFn}">
        🗑 破棄
      </button>
    </div>

  </div>`;
}

// ────────────────────────────────────────────────────────────────
// 破棄処理: localStorage のセッションデータを削除
// ────────────────────────────────────────────────────────────────
Pages._pendingDiscard = function (type) {
  if (!confirm('このセッションを破棄します。確定済みのユニット・個別飼育の記録も全て失われます。\n\n本当に破棄しますか？')) {
    return;
  }
  try {
    if (type === 'T1') {
      localStorage.removeItem('_t1SessionData');
      if (window._t1Session) window._t1Session = null;
    } else if (type === 'T2') {
      localStorage.removeItem('_t2SessionData');
      if (window._t2Session) window._t2Session = null;
    } else if (type === 'T3') {
      localStorage.removeItem('_t3SessionData');
      if (window._t3Session) window._t3Session = null;
    }
    UI.toast(type + 'セッションを破棄しました', 'success');
    _renderPendingSessions();
  } catch (e) {
    UI.toast('破棄失敗: ' + e.message, 'error');
  }
};
