// ════════════════════════════════════════════════════════════════
// public_view.js — Phase5.5 公開閲覧ページ（販売ページUI版）
//
// 購入希望者がスマホで見た時に
//   - 写真で一目でわかる
//   - 販売状況が明確
//   - 問い合わせしやすい
// を最優先したUI設計
// ════════════════════════════════════════════════════════════════
'use strict';

Pages.publicView = async function (params) {
  params = params || Store.getParams() || {};
  const token = params.token || '';
  const main  = document.getElementById('main');

  _pubHideNav();

  if (!token) { _pubRenderError(main, 'URLが正しくありません。'); return; }

  main.innerHTML = _pubLoadingHTML();

  try {
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

// ── Drive URL正規化 ──────────────────────────────────────────
// 保存済みの壊れたURLを <img src> で表示できる形式に変換する。
// 対応パターン:
//   uc?id=XXX               → uc?export=view&id=XXX
//   open?id=XXX             → uc?export=view&id=XXX
//   file/d/XXX/view         → uc?export=view&id=XXX
//   lh3.googleusercontent.com/d/XXX → そのまま（直接表示可能）
//   uc?export=view&id=XXX   → そのまま（正常）
function _normalizeDriveUrl(url) {
  if (!url) return '';
  // すでに正しい形式
  if (url.includes('export=view')) return url;
  if (url.includes('lh3.googleusercontent.com')) return url;

  // FILE_ID を抽出
  var fileId = null;

  // パターン1: uc?id=XXX または uc?id=XXX&...
  var m1 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m1) fileId = m1[1];

  // パターン2: /file/d/XXX/
  if (!fileId) {
    var m2 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m2) fileId = m2[1];
  }

  // パターン3: /d/XXX（lh3等）
  if (!fileId) {
    var m3 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m3) fileId = m3[1];
  }

  if (fileId) {
    return 'https://drive.google.com/uc?export=view&id=' + fileId;
  }
  return url; // 変換できなかった場合はそのまま
}

// ════════════════════════════════════════════════════════════════
// メイン描画
// ════════════════════════════════════════════════════════════════
function _pubRender(main, res) {
  const snap      = res.snapshot   || {};
  const fields    = res.public_fields || [];
  const has       = k => fields.includes(k);
  const comment   = res.custom_comment || '';
  const lineUrl   = res.contact_line_url || '';
  const formUrl   = res.contact_form_url || '';
  const mainPhoto = _normalizeDriveUrl(res.main_photo_url || snap.main_photo_url || '');
  const rawPhotoUrls = (res.photo_urls && res.photo_urls.length)
    ? res.photo_urls
    : (snap.photo_urls || []);
  const photoUrls = rawPhotoUrls.map(u => _normalizeDriveUrl(u));
  const updatedAt = (snap.updated_at || res.updated_at || '').slice(0, 10);
  const growthCnt = res.show_growth_count || 5;

  // ── 販売ステータス ────────────────────────────────────────────
  const STATUS_MAP = {
    for_sale: { label: '販売中',   color: '#9c27b0', bg: 'rgba(156,39,176,.18)', border: 'rgba(156,39,176,.45)' },
    reserved: { label: '予約済み', color: '#5ba8e8', bg: 'rgba(91,168,232,.18)', border: 'rgba(91,168,232,.45)' },
    listed:   { label: '出品中',   color: '#ff9800', bg: 'rgba(255,152,0,.18)',  border: 'rgba(255,152,0,.45)' },
    sold:     { label: '売約済み', color: '#c8a84b', bg: 'rgba(200,168,75,.18)', border: 'rgba(200,168,75,.45)' },
    dead:     { label: '取扱終了', color: '#888',    bg: 'rgba(128,128,128,.15)',border: 'rgba(128,128,128,.3)' },
  };
  const stInfo = has('sale_status') ? (STATUS_MAP[snap.status] || null) : null;

  const statusBadgeHtml = stInfo
    ? `<span style="display:inline-flex;align-items:center;padding:5px 16px;
        border-radius:20px;font-size:.82rem;font-weight:700;letter-spacing:.04em;
        color:${stInfo.color};background:${stInfo.bg};border:1px solid ${stInfo.border}">
        ${stInfo.label}</span>`
    : '';

  // ── 性別 ─────────────────────────────────────────────────────
  const sexColor = snap.sex === '♂' ? '#5ba8e8' : snap.sex === '♀' ? '#e87fa0' : '#aaa';

  // ── 問い合わせ文面 ────────────────────────────────────────────
  const inquiryText = encodeURIComponent((snap.display_id || '個体') + ' についてお問い合わせです');
  const lineHref    = lineUrl
    ? (lineUrl.includes('?') ? lineUrl + '&text=' + inquiryText : lineUrl + '?text=' + inquiryText)
    : '';

  // ── 問い合わせブロック ────────────────────────────────────────
  function contactHTML(size) {
    if (!lineUrl && !formUrl) return '';
    const isLarge = size === 'large';
    return `<div style="margin:${isLarge ? '20px 0 8px' : '12px 0 4px'};display:flex;flex-direction:column;gap:10px">
      ${lineUrl ? `<a href="${lineHref}" target="_blank" rel="noopener"
        style="display:flex;align-items:center;justify-content:center;gap:10px;
          background:#06c755;color:#fff;border-radius:14px;
          padding:${isLarge ? '15px' : '12px'};text-decoration:none;
          font-size:${isLarge ? '1rem' : '.9rem'};font-weight:800;
          box-shadow:0 4px 16px rgba(6,199,85,.35)">
        <span style="font-size:${isLarge ? '1.4rem' : '1.2rem'}">💬</span>
        LINEで問い合わせる
      </a>` : ''}
      ${formUrl ? `<a href="${formUrl}" target="_blank" rel="noopener"
        style="display:flex;align-items:center;justify-content:center;gap:8px;
          background:var(--surface2,rgba(255,255,255,.08));
          color:var(--text2,#c0c8c0);border:1px solid var(--border,rgba(255,255,255,.12));
          border-radius:14px;padding:11px;text-decoration:none;
          font-size:.84rem;font-weight:600">
        📝 お問い合わせフォーム
      </a>` : ''}
    </div>`;
  }

  // ── 体重推移 ──────────────────────────────────────────────────
  const wHistory = (snap.weight_history || []).slice(0, growthCnt);
  const weightHistHTML = (has('weight_history') && wHistory.length)
    ? `<div class="pub-card" style="padding:16px 18px">
        <div class="pub-section-label">📈 体重推移</div>
        ${wHistory.map((w, i) => `
          <div style="display:flex;align-items:center;gap:12px;
            padding:9px 0;${i < wHistory.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,.07)' : ''}">
            <span style="font-size:.72rem;color:var(--text3,#7a8a7a);min-width:74px">${w.date || ''}</span>
            <span style="font-size:1.1rem;font-weight:700;color:#4caf78">${w.weight_g}g</span>
            ${w.stage ? `<span class="pub-chip">${w.stage}</span>` : ''}
          </div>`).join('')}
      </div>`
    : '';

  // ── 親情報 ────────────────────────────────────────────────────
  const parentsHTML = has('parents') && (snap.father_name || snap.mother_name)
    ? `<div style="display:flex;gap:8px;margin-top:8px">
        ${snap.father_name ? `<div style="flex:1;background:rgba(91,168,232,.08);
          border:1px solid rgba(91,168,232,.2);border-radius:10px;padding:10px 12px">
          <div style="font-size:.62rem;color:#5ba8e8;font-weight:700;margin-bottom:3px">♂ 父親</div>
          <div style="font-size:.9rem;font-weight:700">${snap.father_name}</div>
          ${snap.father_size_mm ? `<div style="font-size:.75rem;color:var(--text3)">${snap.father_size_mm}mm</div>` : ''}
        </div>` : ''}
        ${snap.mother_name ? `<div style="flex:1;background:rgba(232,127,160,.08);
          border:1px solid rgba(232,127,160,.2);border-radius:10px;padding:10px 12px">
          <div style="font-size:.62rem;color:#e87fa0;font-weight:700;margin-bottom:3px">♀ 母親</div>
          <div style="font-size:.9rem;font-weight:700">${snap.mother_name}</div>
          ${snap.mother_size_mm ? `<div style="font-size:.75rem;color:var(--text3)">${snap.mother_size_mm}mm</div>` : ''}
        </div>` : ''}
      </div>`
    : '';

  // ── 基本情報行 ────────────────────────────────────────────────
  function infoRow(label, value) {
    if (!value) return '';
    return `<div class="pub-info-row">
      <span class="pub-info-key">${label}</span>
      <span class="pub-info-val">${value}</span>
    </div>`;
  }

  // ── HTML組み立て ─────────────────────────────────────────────
  main.innerHTML = `
    <div class="pub-page">

      <!-- ── ファーストビュー ──────────────────────────────── -->

      <!-- メイン写真 -->
      <div class="pub-hero-photo">
        ${mainPhoto
          ? `<img src="${mainPhoto}" alt="個体写真"
              style="width:100%;height:100%;object-fit:cover;display:block">`
          : `<div style="display:flex;flex-direction:column;align-items:center;
              justify-content:center;height:100%;color:rgba(255,255,255,.2)">
              <div style="font-size:3.5rem;margin-bottom:8px">🐛</div>
              <div style="font-size:.78rem;letter-spacing:.06em">NO PHOTO</div>
            </div>`}
      </div>

      <!-- サブ写真（2〜10枚目） -->
      ${photoUrls && photoUrls.length ? `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:3px 0;background:#000">
        ${photoUrls.slice(0,9).map(url =>
          '<div style="height:100px;overflow:hidden;background:#111">'
          + '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;display:block">'
          + '</div>'
        ).join('')}
      </div>` : ''}

            <!-- ファーストビュー情報 -->
      <div class="pub-first-view">

        <!-- ブランド -->
        <div style="font-size:.65rem;color:rgba(255,255,255,.4);letter-spacing:.1em;
          text-transform:uppercase;margin-bottom:6px">Hercules Breeding</div>

        <!-- 表示ID + ライン -->
        <div style="margin-bottom:8px">
          ${has('display_id') ? `<div style="font-family:var(--font-mono,monospace);
            font-size:1.45rem;font-weight:800;color:#c8a84b;line-height:1.2;
            margin-bottom:4px">${snap.display_id || ''}</div>` : ''}
          ${has('line') && snap.line_code ? `<div style="font-size:.82rem;color:rgba(255,255,255,.6)">
            ライン: <strong style="color:rgba(255,255,255,.85)">${snap.line_code}</strong>
          </div>` : ''}
        </div>

        <!-- ステータスバッジ -->
        ${statusBadgeHtml ? `<div style="margin-bottom:12px">${statusBadgeHtml}</div>` : ''}

        <!-- 体重 + ステージ グリッド -->
        ${(has('weight') && snap.latest_weight_g) || (has('stage') && snap.current_stage)
          || (has('bloodline') && snap.bloodline_abbr) ? `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
          ${has('weight') && snap.latest_weight_g ? `
          <div class="pub-kpi-card">
            <div class="pub-kpi-val">${snap.latest_weight_g}<span class="pub-kpi-unit">g</span></div>
            <div class="pub-kpi-label">体重</div>
          </div>` : ''}
          ${has('stage') && snap.current_stage ? `
          <div class="pub-kpi-card">
            <div class="pub-kpi-val" style="font-size:1.3rem">${snap.current_stage}</div>
            <div class="pub-kpi-label">ステージ</div>
          </div>` : ''}
          ${has('bloodline') && (snap.bloodline_abbr || snap.bloodline_name) ? `
          <div class="pub-kpi-card">
            <div class="pub-kpi-val" style="font-size:.95rem;word-break:break-all">
              ${snap.bloodline_abbr || snap.bloodline_name}
            </div>
            <div class="pub-kpi-label">血統</div>
          </div>` : ''}
        </div>` : ''}

        <!-- ファーストビュー直下の問い合わせ -->
        ${contactHTML('large')}

      </div>

      <!-- ── コンテンツエリア ───────────────────────────────── -->
      <div class="pub-content">

        <!-- 基本情報 -->
        ${(has('locality') || has('parents') || has('hatch_date') || has('adult_size')) ? `
        <div class="pub-card">
          <div class="pub-section-label">📋 基本情報</div>
          <div class="pub-info-list">
            ${has('locality')    && snap.locality        ? infoRow('産地',       snap.locality)       : ''}
            ${has('hatch_date')  && snap.hatch_date      ? infoRow('孵化日',     snap.hatch_date)     : ''}
            ${snap.generation                            ? infoRow('累代',       snap.generation)     : ''}
            ${has('adult_size')  && snap.adult_size_mm   ? infoRow('成虫サイズ', snap.adult_size_mm + 'mm') : ''}
          </div>
          ${parentsHTML}
        </div>` : ''}

        <!-- 体重推移 -->
        ${weightHistHTML}

        <!-- 販売コメント -->
        ${comment ? `
        <div class="pub-card pub-card-comment">
          <div style="font-size:.65rem;font-weight:700;color:#c8a84b;
            letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">
            🌿 ブリーダーより
          </div>
          <div style="font-size:.92rem;line-height:1.85;color:rgba(255,255,255,.88)">
            ${comment}
          </div>
        </div>` : ''}

        <!-- 個体コメント（note_public） -->
        ${has('note_public') && snap.note_public ? `
        <div class="pub-card">
          <div class="pub-section-label">📝 個体メモ</div>
          <div style="font-size:.88rem;line-height:1.7;color:var(--text2)">${snap.note_public}</div>
        </div>` : ''}

        <!-- ページ下部の問い合わせ -->
        ${(lineUrl || formUrl) ? `
        <div class="pub-card" style="background:rgba(6,199,85,.05);
          border-color:rgba(6,199,85,.2)">
          <div style="font-size:.78rem;font-weight:700;color:#06c755;
            letter-spacing:.04em;margin-bottom:4px">お問い合わせ</div>
          <div style="font-size:.75rem;color:var(--text3);margin-bottom:10px">
            気になる点はお気軽にどうぞ
          </div>
          ${contactHTML('small')}
        </div>` : ''}

        <!-- フッター -->
        <div style="text-align:center;padding:16px 0 8px;
          font-size:.62rem;color:rgba(255,255,255,.2);line-height:2.2">
          ${updatedAt ? '最終更新: ' + updatedAt + '<br>' : ''}
          Hercules OS — Individual Management
        </div>

      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
// エラー / ローディング
// ════════════════════════════════════════════════════════════════
function _pubRenderError(main, msg) {
  main.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;
      justify-content:center;min-height:70vh;padding:24px;text-align:center">
      <div style="font-size:3rem;margin-bottom:16px">🔒</div>
      <div style="font-size:.92rem;color:rgba(255,255,255,.6);line-height:1.8">${msg}</div>
    </div>`;
}

function _pubLoadingHTML() {
  return `<div style="display:flex;flex-direction:column;align-items:center;
      justify-content:center;min-height:60vh;gap:16px">
    <div class="spinner"></div>
    <div style="font-size:.8rem;color:rgba(255,255,255,.3)">読み込み中...</div>
  </div>`;
}

function _pubHideNav() {
  const nav = document.querySelector('.bottom-nav');
  if (nav) nav.style.display = 'none';
}

window.PAGES = window.PAGES || {};
window.PAGES['public-view'] = () => Pages.publicView(Store.getParams());
