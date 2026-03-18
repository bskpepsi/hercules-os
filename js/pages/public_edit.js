// ════════════════════════════════════════════════════════════════
// public_edit.js — Phase5.5 公開設定（写真複数枚対応・圧縮転送版）
//
// 【画像アップロードの仕組み】
//   GASはGETリクエスト（URLパラメータ）で通信するため、
//   生の base64 をそのまま送ると URL 長さ制限で Failed to fetch になる。
//   → canvas でリサイズ（max600px・品質0.55）してから送信する。
//   → 典型的な写真が 15〜40KB に収まり、URLに乗る。
//
// 【複数枚対応】
//   最大3枚。index 0 がメイン写真。
// ════════════════════════════════════════════════════════════════
'use strict';

const PUBLIC_FIELD_DEFS = [
  { key: 'display_id',     label: '表示ID',       group: '基本' },
  { key: 'line',           label: 'ライン',        group: '基本' },
  { key: 'parents',        label: '親サイズ',      group: '血統' },
  { key: 'bloodline',      label: '血統名',        group: '血統' },
  { key: 'locality',       label: '産地',          group: '基本' },
  { key: 'weight',         label: '最新体重',      group: '体格' },
  { key: 'weight_history', label: '体重推移',      group: '体格' },
  { key: 'stage',          label: 'ステージ',      group: '体格' },
  { key: 'adult_size',     label: '成虫サイズ',    group: '体格' },
  { key: 'hatch_date',     label: '孵化日',        group: '日付' },
  { key: 'sale_status',    label: '販売状況',      group: '販売' },
  { key: 'note_public',    label: '個体コメント',  group: 'メモ' },
];

// 写真スロット（最大3枚）: { existingUrl, base64, mime, dataUrl, remove }
window.__pubPhotos = window.__pubPhotos || [null, null, null];
window.__pubCurrentSlot = 0;

Pages.publicEdit = async function (params) {
  params = params || Store.getParams() || {};
  const indId = params.indId || params.ind_id || '';
  const main  = document.getElementById('main');
  if (!indId) {
    main.innerHTML = UI.header('公開設定', { back: true }) + UI.empty('個体IDが指定されていません');
    return;
  }
  window.__pubPhotos = [null, null, null];
  const ind = Store.getIndividual(indId);
  main.innerHTML = UI.header('公開設定', { back: true }) + UI.spinner();
  try {
    const res = await API.publicPage.getByIndId(indId);
    if (Store.getPage() !== 'public-edit') return;
    _renderPublicEdit(main, ind, res, indId);
  } catch (e) {
    _renderPublicEdit(main, ind, { exists: false }, indId);
  }
};

function _photoSlotHtml(index, photo) {
  const label = index === 0 ? 'メイン' : (index + 1) + '枚目';
  if (photo && (photo.existingUrl || photo.dataUrl)) {
    const src = photo.dataUrl || photo.existingUrl;
    return '<div style="position:relative;aspect-ratio:1;overflow:hidden;border-radius:8px;background:#111">'
      + '<img src="' + src + '" style="width:100%;height:100%;object-fit:cover;display:block">'
      + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;'
      + 'justify-content:space-between;padding:4px">'
      + '<span style="font-size:.58rem;background:rgba(0,0,0,.55);color:#fff;'
      + 'padding:1px 5px;border-radius:4px;align-self:flex-start">' + label + '</span>'
      + '<button onclick="Pages._pubPhotoRemove(' + index + ')"'
      + ' style="background:rgba(0,0,0,.65);color:#fff;border:none;border-radius:50%;'
      + 'width:22px;height:22px;font-size:.7rem;cursor:pointer;align-self:flex-end;'
      + 'display:flex;align-items:center;justify-content:center">✕</button>'
      + '</div></div>';
  }
  return '<div onclick="Pages._pubPhotoPickSlot(' + index + ')"'
    + ' style="aspect-ratio:1;border:1.5px dashed var(--border);border-radius:8px;'
    + 'background:var(--surface2);display:flex;flex-direction:column;align-items:center;'
    + 'justify-content:center;cursor:pointer;gap:4px;color:var(--text3)">'
    + '<span style="font-size:1.3rem">📷</span>'
    + '<span style="font-size:.62rem">' + label + '</span>'
    + '</div>';
}

function _renderPublicEdit(main, ind, pub, indId) {
  const exists      = pub && pub.exists;
  const isPublic    = exists ? pub.is_public  : false;
  const token       = exists ? pub.token      : null;
  const fields      = exists ? (pub.public_fields || []) : ['display_id','line','parents','weight','stage','sale_status'];
  const comment     = exists ? (pub.custom_comment || '') : '';
  const growthCnt   = exists ? (pub.show_growth_count || 5) : 5;
  const viewCount   = exists ? (pub.view_count || 0) : 0;
  const lineUrl     = exists ? (pub.contact_line_url || '') : '';
  const formUrl     = exists ? (pub.contact_form_url || '') : '';
  const mainPhotoUrl   = exists ? (pub.main_photo_url || '') : '';
  const extraPhotoUrls = exists ? (pub.photo_urls || []) : [];

  window.__pubPhotos = [
    mainPhotoUrl        ? { existingUrl: mainPhotoUrl }        : null,
    extraPhotoUrls[0]   ? { existingUrl: extraPhotoUrls[0] }   : null,
    extraPhotoUrls[1]   ? { existingUrl: extraPhotoUrls[1] }   : null,
  ];

  const displayName = (ind && ind.display_id) || indId;
  const publicUrl   = token ? (location.origin + location.pathname + '#page=public-view&token=' + token) : null;

  const groups = {};
  PUBLIC_FIELD_DEFS.forEach(d => {
    if (!groups[d.group]) groups[d.group] = [];
    groups[d.group].push(d);
  });
  const fieldsHTML = Object.entries(groups).map(([grp, defs]) => `
    <div style="margin-bottom:12px">
      <div style="font-size:.68rem;font-weight:700;color:var(--text3);
        letter-spacing:.07em;text-transform:uppercase;margin-bottom:6px">${grp}</div>
      <div style="display:flex;flex-wrap:wrap;gap:7px">
        ${defs.map(d => `
          <label style="display:flex;align-items:center;gap:6px;
            background:var(--surface2);border:1px solid var(--border);
            border-radius:8px;padding:7px 10px;cursor:pointer;font-size:.82rem;color:var(--text2)">
            <input type="checkbox" data-field="${d.key}" ${fields.includes(d.key) ? 'checked' : ''}
              style="width:15px;height:15px;cursor:pointer;accent-color:var(--green)">
            ${d.label}
          </label>`).join('')}
      </div>
    </div>`).join('');

  main.innerHTML = `
    ${UI.header('公開設定 — ' + displayName, { back: true })}
    <div class="page-body">

      <div class="card" style="border-color:${isPublic ? 'rgba(76,175,120,.4)' : 'var(--border)'}">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="flex:1">
            <div style="font-weight:700;font-size:.95rem;margin-bottom:2px">${isPublic ? '🌐 公開中' : '🔒 非公開'}</div>
            <div style="font-size:.75rem;color:var(--text3)">${isPublic ? '公開URLからこの個体の情報を閲覧できます' : 'URLが発行済みですが非公開状態です'}</div>
            ${exists ? `<div style="font-size:.68rem;color:var(--text3);margin-top:3px">閲覧数: ${viewCount}回</div>` : ''}
          </div>
          <label style="position:relative;display:inline-block;width:52px;height:28px;flex-shrink:0;cursor:pointer">
            <input type="checkbox" id="pub-toggle" ${isPublic ? 'checked' : ''} style="opacity:0;width:0;height:0;position:absolute">
            <span id="pub-toggle-track" style="position:absolute;inset:0;border-radius:28px;background:${isPublic ? 'var(--green)' : 'var(--surface3,#555)'};transition:background .2s">
              <span id="pub-toggle-knob" style="position:absolute;top:3px;left:${isPublic ? '27px' : '3px'};width:22px;height:22px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.3)"></span>
            </span>
          </label>
        </div>
      </div>

      ${publicUrl ? `
      <div class="card">
        <div class="card-title" style="margin-bottom:8px">🔗 公開URL</div>
        <div style="font-size:.72rem;color:var(--blue);background:var(--surface2);border-radius:8px;padding:8px 10px;word-break:break-all;border:1px solid rgba(91,168,232,.3);margin-bottom:8px">${publicUrl}</div>
        <button class="btn btn-ghost btn-full" onclick="Pages._pubCopyUrl('${publicUrl}')">📋 URLをコピー</button>
      </div>` : `
      <div class="card" style="border-style:dashed">
        <div style="font-size:.82rem;color:var(--text3);text-align:center;padding:4px 0">保存すると公開URLが発行されます</div>
      </div>`}

      <div class="card">
        <div class="card-title" style="margin-bottom:4px">📷 公開写真（最大3枚）</div>
        <div style="font-size:.72rem;color:var(--text3);margin-bottom:12px">1枚目がメイン写真として大きく表示されます</div>
        <div id="pub-photos-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          ${[0,1,2].map(i => '<div id="pub-photo-slot-' + i + '">' + _photoSlotHtml(i, window.__pubPhotos[i]) + '</div>').join('')}
        </div>
        <div style="font-size:.7rem;color:var(--text3);margin-top:8px;text-align:center">自動圧縮（最大600px）して保存します</div>
      </div>

      <input type="file" id="pub-photo-input" accept="image/*" style="display:none" onchange="Pages._pubPhotoFileSelected(this)">

      <div class="card">
        <div class="card-title" style="margin-bottom:10px">📩 問い合わせ導線</div>
        ${UI.field('LINE URL', '<input type="url" id="pub-line-url" class="input" value="' + lineUrl + '" placeholder="https://line.me/R/ti/p/...">')}
        ${UI.field('フォームURL（任意）', '<input type="url" id="pub-form-url" class="input" value="' + formUrl + '" placeholder="https://forms.gle/...">')}
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:12px">📋 公開する項目</div>
        ${fieldsHTML}
        <div style="margin-top:10px">
          ${UI.field('体重推移の公開件数（0=非表示）', '<input type="number" id="pub-growth-cnt" class="input" min="0" max="20" value="' + growthCnt + '">')}
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:8px">💬 販売コメント</div>
        <textarea id="pub-comment" class="input" rows="4"
          placeholder="購入希望者へのコメント（例: 2026年3月孵化、状態良好です）"
          style="resize:vertical;line-height:1.7">${comment}</textarea>
      </div>

      <button class="btn btn-primary btn-full" style="margin-top:4px" onclick="Pages._pubSave('${indId}')">
        💾 公開設定を保存
      </button>
    </div>`;

  const toggle = document.getElementById('pub-toggle');
  const track  = document.getElementById('pub-toggle-track');
  const knob   = document.getElementById('pub-toggle-knob');
  if (toggle && track && knob) {
    toggle.addEventListener('change', () => {
      const on = toggle.checked;
      track.style.background = on ? 'var(--green)' : 'var(--surface3,#555)';
      knob.style.left        = on ? '27px' : '3px';
    });
  }
}

Pages._pubPhotoPickSlot = function (index) {
  window.__pubCurrentSlot = index;
  const input = document.getElementById('pub-photo-input');
  if (input) { input.value = ''; input.click(); }
};

Pages._pubPhotoFileSelected = async function (input) {
  const file  = input.files && input.files[0];
  const index = window.__pubCurrentSlot || 0;
  if (!file) return;
  UI.toast('圧縮中...', 'info', 1500);
  try {
    const compressed = await compressImageToBase64(file, 600, 0.55);
    window.__pubPhotos[index] = { base64: compressed.base64, mime: compressed.mimeType, dataUrl: compressed.dataUrl };
    const slot = document.getElementById('pub-photo-slot-' + index);
    if (slot) slot.innerHTML = _photoSlotHtml(index, window.__pubPhotos[index]);
  } catch (e) {
    UI.toast('画像の読み込みに失敗しました', 'error');
  }
};

Pages._pubPhotoRemove = function (index) {
  window.__pubPhotos[index] = { remove: true };
  const slot = document.getElementById('pub-photo-slot-' + index);
  if (slot) slot.innerHTML = _photoSlotHtml(index, null);
};

Pages._pubSave = async function (indId) {
  const safeId = (indId && String(indId).trim()) || '';
  if (!safeId) { UI.toast('個体IDが取得できませんでした', 'error'); return; }
  if (!API.publicPage || typeof API.publicPage.createOrUpdate !== 'function') {
    UI.toast('API未初期化です。ページをリロードしてください。', 'error'); return;
  }

  const isPublic  = document.getElementById('pub-toggle')?.checked || false;
  const comment   = document.getElementById('pub-comment')?.value?.trim() || '';
  const growthCnt = parseInt(document.getElementById('pub-growth-cnt')?.value || '5', 10);
  const lineUrl   = document.getElementById('pub-line-url')?.value?.trim() || '';
  const formUrl   = document.getElementById('pub-form-url')?.value?.trim() || '';
  const checked   = Array.from(document.querySelectorAll('[data-field]'))
    .filter(el => el.checked).map(el => el.dataset.field);

  if (checked.length === 0 && isPublic) { UI.toast('公開する項目を1つ以上選んでください', 'error'); return; }

  try {
    UI.loading(true);
    const ind           = Store.getIndividual(safeId);
    const lineDisplayId = (ind && ind.display_id) ? ind.display_id.split('-').slice(0, 2).join('-') : 'UNKNOWN';
    const uploadedUrls  = [];

    for (let i = 0; i < 3; i++) {
      const ph = window.__pubPhotos[i];
      if (ph && ph.base64 && ph.mime) {
        const ext      = ph.mime.split('/')[1] || 'jpg';
        const filename = 'pub_' + safeId + '_' + i + '_' + Date.now() + '.' + ext;
        try {
          const upRes = await API.publicPage.uploadPhoto({
            base64: ph.base64, mime_type: ph.mime,
            filename, line_display_id: lineDisplayId, folder_type: 'SALE',
          });
          uploadedUrls[i] = (upRes && upRes.url) ? upRes.url : '';
        } catch (upErr) {
          UI.toast((i === 0 ? 'メイン' : (i+1) + '枚目') + '写真のアップロード失敗: ' + upErr.message, 'error');
          uploadedUrls[i] = undefined;
        }
      } else if (ph && ph.remove) {
        uploadedUrls[i] = '';
      } else {
        uploadedUrls[i] = undefined;
      }
    }

    const payload = {
      ind_id: safeId, is_public: isPublic, level: 'public',
      public_fields: JSON.stringify(checked), custom_comment: comment,
      show_growth_count: growthCnt, contact_line_url: lineUrl, contact_form_url: formUrl,
    };
    if (uploadedUrls[0] !== undefined) payload.main_photo_url = uploadedUrls[0];
    const extras = [uploadedUrls[1], uploadedUrls[2]].filter(u => u !== undefined);
    if (extras.length > 0) payload.photo_urls = JSON.stringify(extras);

    await API.publicPage.createOrUpdate(payload);
    UI.toast(isPublic ? '公開設定を保存しました 🌐' : '非公開に設定しました 🔒', 'success');
    Pages.publicEdit({ indId: safeId });
  } catch (e) {
    UI.toast('保存失敗: ' + ((e && e.message) ? e.message : String(e)), 'error');
    console.error('[_pubSave]', e);
  } finally {
    UI.loading(false);
  }
};

Pages._pubCopyUrl = function (url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => UI.toast('URLをコピーしました', 'success')).catch(() => _pubCopyFallback(url));
  } else { _pubCopyFallback(url); }
};
function _pubCopyFallback(url) {
  const el = document.createElement('textarea');
  el.value = url; el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(el); el.select();
  try { document.execCommand('copy'); UI.toast('URLをコピーしました', 'success'); }
  catch(e) { UI.toast('コピー失敗。URLを手動でコピーしてください', 'error'); }
  document.body.removeChild(el);
}

window.PAGES = window.PAGES || {};
window.PAGES['public-edit'] = () => Pages.publicEdit(Store.getParams());
