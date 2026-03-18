// ════════════════════════════════════════════════════════════════
// public_view.js — Phase5.5 公開閲覧ページ
//
// 役割: tokenでアクセスする誰でも閲覧可能なページ。
//       スナップショットJSONを表示する。
//       ナビゲーションは非表示。スマホUI最優先。
//
// URL: #page=public-view&token=xxxx
// ════════════════════════════════════════════════════════════════
'use strict';

Pages.publicView = async function (params) {
  params = params || Store.getParams() || {};
  const token = params.token || '';
  const main  = document.getElementById('main');

  // ナビ非表示（公開ページ専用レイアウト）
  _pubHideNav();

  if (!token) {
    _pubRenderError(main, 'URLが正しくありません。');
    return;
  }

  main.innerHTML = _pubLoadingHTML();

  try {
    // 閲覧数カウント（エラーは無視）
    API.publicPage.incrementView(token).catch(() => {});

    const res = await API.publicPage.getByToken(token);
    if (Store.getPage() !== 'public-view') return;
    _pubRender(main, res);
  } catch (e) {
    if (e.message && e.message.includes('非公開')) {
      _pubRenderError(main, 'このページは現在非公開です。');
    } else if (e.message && e.message.includes('NOT_FOUND')) {
      _pubRenderError(main, '該当するページが見つかりません。');
    } else {
      _pubRenderError(main, '読み込みに失敗しました。しばらくしてから再度お試しください。');
    }
  }
};

// ── メイン描画 ────────────────────────────────────────────────
function _pubRender(main, res) {
  const snap   = res.snapshot   || {};
  const fields = res.public_fields || [];
  const has    = (key) => fields.includes(key);

  const comment    = res.custom_comment || '';
  const updatedAt  = res.updated_at ? res.updated_at.slice(0, 10) : '';
  const growthCnt  = res.show_growth_count || 5;

  // ── ステータスバッジ ────────────────────────────────────────
  const STATUS_DISP = {
    for_sale: { label: '販売中',   color: '#9c27b0', bg: 'rgba(156,39,176,.15)' },
    reserved: { label: '予約済み', color: '#5ba8e8', bg: 'rgba(91,168,232,.15)' },
    listed:   { label: '出品中',   color: '#ff9800', bg: 'rgba(255,152,0,.15)'  },
    sold:     { label: '売約済み', color: '#c8a84b', bg: 'rgba(200,168,75,.15)' },
    dead:     { label: '取扱終了', color: '#888',    bg: 'rgba(128,128,128,.15)'},
  };
  const stInfo  = STATUS_DISP[snap.status] || null;
  const statusBadge = (has('sale_status') && stInfo)
    ? `<span style="
        display:inline-block;padding:4px 14px;border-radius:20px;
        font-size:.8rem;font-weight:700;
        color:${stInfo.color};background:${stInfo.bg};
        border:1px solid ${stInfo.color}">${stInfo.label}</span>`
    : '';

  // ── 性別色 ─────────────────────────────────────────────────
  const sexColor = snap.sex === '♂' ? '#5ba8e8' : snap.sex === '♀' ? '#e87fa0' : '#aaa';

  // ── 体重推移リスト ───────────────────────────────────────────
  const wHistory = (snap.weight_history || []).slice(0, growthCnt);
  const weightHistHTML = (has('weight_history') && wHistory.length)
    ? `<div class="card" style="margin-top:0">
        <div style="font-size:.78rem;font-weight:700;color:var(--text3);
          letter-spacing:.05em;margin-bottom:10px">📈 体重推移</div>
        <div style="display:flex;flex-direction:column;gap:0">
          ${wHistory.map((w, i) => `
            <div style="display:flex;align-items:center;gap:10px;
              padding:8px 0;${i < wHistory.length-1 ? 'border-bottom:1px solid var(--border)' : ''}">
              <span style="font-size:.7rem;color:var(--text3);min-width:72px">${w.date || ''}</span>
              <span style="font-size:1.05rem;font-weight:700;color:var(--green)">
                ${w.weight_g}g</span>
              ${w.stage ? `<span style="font-size:.72rem;color:var(--text3)">${w.stage}</span>` : ''}
              ${w.mat_type ? `<span style="font-size:.68rem;color:var(--text3)">${w.mat_type}</span>` : ''}
            </div>`).join('')}
        </div>
      </div>`
    : '';

  // ── 親情報 ──────────────────────────────────────────────────
  const parentsHTML = has('parents') && (snap.father_name || snap.mother_name)
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        ${snap.father_name ? `<div style="flex:1;min-width:120px;
          background:rgba(91,168,232,.08);border:1px solid rgba(91,168,232,.2);
          border-radius:8px;padding:8px 12px">
          <div style="font-size:.65rem;color:#5ba8e8;font-weight:700;margin-bottom:2px">♂ 父親</div>
          <div style="font-size:.88rem;font-weight:700">${snap.father_name}</div>
          ${snap.father_size_mm ? `<div style="font-size:.72rem;color:var(--text3)">${snap.father_size_mm}mm</div>` : ''}
        </div>` : ''}
        ${snap.mother_name ? `<div style="flex:1;min-width:120px;
          background:rgba(232,127,160,.08);border:1px solid rgba(232,127,160,.2);
          border-radius:8px;padding:8px 12px">
          <div style="font-size:.65rem;color:#e87fa0;font-weight:700;margin-bottom:2px">♀ 母親</div>
          <div style="font-size:.88rem;font-weight:700">${snap.mother_name}</div>
          ${snap.mother_size_mm ? `<div style="font-size:.72rem;color:var(--text3)">${snap.mother_size_mm}mm</div>` : ''}
        </div>` : ''}
      </div>`
    : '';

  main.innerHTML = `
    <div class="pub-page" style="
      max-width:480px;margin:0 auto;
      padding:16px 14px 40px;
      min-height:100vh;
      background:var(--bg,#0d1e0d)">

      <!-- ヘッダー -->
      <div style="text-align:center;padding:20px 0 16px">
        <div style="font-size:.72rem;color:var(--text3);letter-spacing:.08em;
          text-transform:uppercase;margin-bottom:6px">Hercules OS</div>
        ${has('display_id') ? `
        <div style="font-family:var(--font-mono);font-size:1.3rem;
          font-weight:800;color:var(--gold);margin-bottom:6px">
          ${snap.display_id || ''}
        </div>` : ''}
        ${has('line') && snap.line_code ? `
        <div style="font-size:.82rem;color:var(--text2);margin-bottom:8px">
          ライン: <span style="font-weight:700">${snap.line_code}</span>
        </div>` : ''}
        ${statusBadge}
      </div>

      <!-- メインカード：体重・ステージ -->
      <div class="card" style="padding:20px 18px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="font-size:2.4rem;color:${sexColor};line-height:1">${snap.sex || '?'}</div>
          <div style="flex:1">
            ${has('weight') && snap.latest_weight_g ? `
            <div style="font-size:2.6rem;font-weight:800;color:var(--green);line-height:1">
              ${snap.latest_weight_g}<span style="font-size:1rem;font-weight:400;color:var(--text3)">g</span>
            </div>` : ''}
            ${has('stage') && snap.current_stage ? `
            <div style="margin-top:4px">${UI.stageBadge(snap.current_stage)}</div>` : ''}
            ${has('adult_size') && snap.adult_size_mm ? `
            <div style="font-size:.85rem;color:var(--text2);margin-top:4px">
              成虫サイズ: <strong>${snap.adult_size_mm}mm</strong>
            </div>` : ''}
          </div>
        </div>
      </div>

      <!-- 基本情報 -->
      <div class="card" style="margin-bottom:10px">
        <div style="font-size:.78rem;font-weight:700;color:var(--text3);
          letter-spacing:.05em;margin-bottom:10px">📋 基本情報</div>
        <div style="display:flex;flex-direction:column;gap:0">
          ${has('locality') && snap.locality ? `
          <div style="display:flex;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="min-width:80px;font-size:.75rem;color:var(--text3)">産地</span>
            <span style="font-size:.85rem;font-weight:600">${snap.locality}</span>
          </div>` : ''}
          ${has('hatch_date') && snap.hatch_date ? `
          <div style="display:flex;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="min-width:80px;font-size:.75rem;color:var(--text3)">孵化日</span>
            <span style="font-size:.85rem">${snap.hatch_date}</span>
          </div>` : ''}
          ${snap.generation ? `
          <div style="display:flex;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="min-width:80px;font-size:.75rem;color:var(--text3)">累代</span>
            <span style="font-size:.85rem">${snap.generation}</span>
          </div>` : ''}
          ${has('bloodline') && (snap.bloodline_name || snap.bloodline_abbr) ? `
          <div style="display:flex;padding:8px 0">
            <span style="min-width:80px;font-size:.75rem;color:var(--text3)">血統</span>
            <span style="font-size:.85rem;font-weight:600">
              ${snap.bloodline_abbr || snap.bloodline_name}
            </span>
          </div>` : ''}
        </div>
        ${parentsHTML}
      </div>

      <!-- 体重推移 -->
      ${weightHistHTML}

      <!-- 公開コメント -->
      ${(has('note_public') && snap.note_public) ? `
      <div class="card" style="margin-bottom:10px">
        <div style="font-size:.78rem;font-weight:700;color:var(--text3);
          letter-spacing:.05em;margin-bottom:8px">📝 個体メモ</div>
        <div style="font-size:.88rem;color:var(--text2);line-height:1.7">
          ${snap.note_public}
        </div>
      </div>` : ''}

      <!-- カスタムコメント（ブリーダーより） -->
      ${comment ? `
      <div class="card" style="
        margin-bottom:10px;
        border-color:rgba(200,168,75,.3);
        background:rgba(200,168,75,.05)">
        <div style="font-size:.72rem;font-weight:700;color:var(--gold);
          letter-spacing:.05em;margin-bottom:8px">🌿 ブリーダーより</div>
        <div style="font-size:.9rem;color:var(--text1);line-height:1.8">
          ${comment}
        </div>
      </div>` : ''}

      <!-- フッター -->
      <div style="text-align:center;padding-top:16px;
        font-size:.65rem;color:var(--text3);line-height:2">
        ${(snap.updated_at || updatedAt) ? '最終更新: ' + (snap.updated_at || updatedAt).slice(0,10) + '<br>' : ''}
        管理: Hercules OS
      </div>

    </div>`;
}

// ── エラー表示 ───────────────────────────────────────────────
function _pubRenderError(main, msg) {
  main.innerHTML = `
    <div style="
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;min-height:60vh;padding:20px;text-align:center">
      <div style="font-size:3rem;margin-bottom:16px">🔒</div>
      <div style="font-size:.95rem;color:var(--text2);line-height:1.8">${msg}</div>
    </div>`;
}

// ── ローディング ─────────────────────────────────────────────
function _pubLoadingHTML() {
  return `
    <div style="
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;min-height:60vh;gap:16px">
      <div class="spinner"></div>
      <div style="font-size:.82rem;color:var(--text3)">読み込み中...</div>
    </div>`;
}

// ── ナビ非表示 ───────────────────────────────────────────────
function _pubHideNav() {
  const nav = document.querySelector('.bottom-nav');
  if (nav) nav.style.display = 'none';
}

window.PAGES = window.PAGES || {};
window.PAGES['public-view'] = () => {
  // ナビを非表示にしてから描画
  Pages.publicView(Store.getParams());
};
