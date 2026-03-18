// ════════════════════════════════════════════════════════════════
// public_edit.js — Phase5.5 公開設定画面（写真アップロード対応版）
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

Pages.publicEdit = async function (params) {
  params = params || Store.getParams() || {};
  const indId = params.indId || params.ind_id || '';
  const main  = document.getElementById('main');

  if (!indId) {
    main.innerHTML = UI.header('公開設定', { back: true }) + UI.empty('個体IDが指定されていません');
    return;
  }

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

function _renderPublicEdit(main, ind, pub, indId) {
  const exists      = pub && pub.exists;
  const isPublic    = exists ? pub.is_public  : false;
  const token       = exists ? pub.token      : null;
  const fields      = exists ? (pub.public_fields || []) : ['display_id','line','parents','weight','stage','sale_status'];
  const comment     = exists ? (pub.custom_comment || '') : '';
  const growthCnt   = exists ? (pub.show_growth_count || 5) : 5;
  const viewCount   = exists ? (pub.view_count || 0) : 0;
  const mainPhoto   = exists ? (pub.main_photo_url || '') : '';
  const lineUrl     = exists ? (pub.contact_line_url || '') : '';
  const formUrl     = exists ? (pub.contact_form_url || '') : '';

  const displayName = (ind && ind.display_id) || indId;
  const publicUrl   = token ? (location.origin + location.pathname + '#page=public-view&token=' + token) : null;

  // グループ別フィールド
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
            border-radius:8px;padding:7px 10px;cursor:pointer;
            font-size:.82rem;color:var(--text2)">
            <input type="checkbox" data-field="${d.key}"
              ${fields.includes(d.key) ? 'checked' : ''}
              style="width:15px;height:15px;cursor:pointer;accent-color:var(--green)">
            ${d.label}
          </label>`).join('')}
      </div>
    </div>`).join('');

  main.innerHTML = `
    ${UI.header('公開設定 — ' + displayName, { back: true })}
    <div class="page-body">

      <!-- 公開ON/OFF -->
      <div class="card" style="border-color:${isPublic ? 'rgba(76,175,120,.4)' : 'var(--border)'}">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="flex:1">
            <div style="font-weight:700;font-size:.95rem;margin-bottom:2px">
              ${isPublic ? '🌐 公開中' : '🔒 非公開'}
            </div>
            <div style="font-size:.75rem;color:var(--text3)">
              ${isPublic ? '公開URLからこの個体の情報を閲覧できます' : 'URLが発行済みですが非公開状態です'}
            </div>
            ${exists ? `<div style="font-size:.68rem;color:var(--text3);margin-top:3px">閲覧数: ${viewCount}回</div>` : ''}
          </div>
          <label style="position:relative;display:inline-block;width:52px;height:28px;flex-shrink:0;cursor:pointer">
            <input type="checkbox" id="pub-toggle" ${isPublic ? 'checked' : ''}
              style="opacity:0;width:0;height:0;position:absolute">
            <span id="pub-toggle-track" style="position:absolute;inset:0;border-radius:28px;
              background:${isPublic ? 'var(--green)' : 'var(--surface3,#555)'};transition:background .2s">
              <span style="position:absolute;top:3px;left:${isPublic ? '27px' : '3px'};
                width:22px;height:22px;border-radius:50%;background:#fff;
                transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.3)"
                id="pub-toggle-knob"></span>
            </span>
          </label>
        </div>
      </div>

      <!-- 公開URL -->
      ${publicUrl ? `
      <div class="card">
        <div class="card-title" style="margin-bottom:8px">🔗 公開URL</div>
        <div style="font-size:.72rem;color:var(--blue);background:var(--surface2);
          border-radius:8px;padding:8px 10px;word-break:break-all;
          border:1px solid rgba(91,168,232,.3);margin-bottom:8px">${publicUrl}</div>
        <button class="btn btn-ghost btn-full" onclick="Pages._pubCopyUrl('${publicUrl}')">
          📋 URLをコピー
        </button>
      </div>` : `
      <div class="card" style="border-style:dashed">
        <div style="font-size:.82rem;color:var(--text3);text-align:center;padding:4px 0">
          保存すると公開URLが発行されます
        </div>
      </div>`}

      <!-- 写真アップロード -->
      <div class="card">
        <div class="card-title" style="margin-bottom:10px">📷 公開写真</div>

        <!-- 現在の写真プレビュー -->
        <div id="pub-photo-preview" style="margin-bottom:10px">
          ${mainPhoto
            ? `<div style="position:relative;display:inline-block;width:100%">
                <img src="${mainPhoto}" alt="公開写真"
                  style="width:100%;max-height:220px;object-fit:cover;
                    border-radius:10px;display:block">
                <button onclick="Pages._pubRemovePhoto()"
                  style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);
                    color:#fff;border:none;border-radius:50%;width:30px;height:30px;
                    font-size:.85rem;cursor:pointer;display:flex;align-items:center;
                    justify-content:center">✕</button>
              </div>`
            : `<div style="background:var(--surface2);border:2px dashed var(--border);
                border-radius:10px;padding:28px;text-align:center;color:var(--text3)">
                <div style="font-size:2rem;margin-bottom:6px">📷</div>
                <div style="font-size:.82rem">写真がありません</div>
              </div>`}
        </div>

        <!-- ファイル選択 -->
        <input type="file" id="pub-photo-input" accept="image/*"
          style="display:none" onchange="Pages._pubPhotoSelected(this)">
        <button class="btn btn-ghost btn-full"
          onclick="document.getElementById('pub-photo-input').click()">
          ${mainPhoto ? '📷 写真を変更' : '📷 写真を選択'}
        </button>
        <div style="font-size:.7rem;color:var(--text3);margin-top:6px;text-align:center">
          JPG / PNG / WEBP 対応。保存時にアップロードされます。
        </div>
      </div>

      <!-- 問い合わせ設定 -->
      <div class="card">
        <div class="card-title" style="margin-bottom:10px">📩 問い合わせ導線</div>
        ${UI.field('LINE URL（公式アカウントのURL）',
          '<input type="url" id="pub-line-url" class="input" value="' + lineUrl + '" placeholder="https://line.me/R/ti/p/...">')}
        ${UI.field('フォームURL（任意）',
          '<input type="url" id="pub-form-url" class="input" value="' + formUrl + '" placeholder="https://forms.gle/...">')}
        <div style="font-size:.72rem;color:var(--text3);margin-top:-4px">
          設定するとLINE問い合わせボタンが公開ページに表示されます
        </div>
      </div>

      <!-- 公開項目 -->
      <div class="card">
        <div class="card-title" style="margin-bottom:12px">📋 公開する項目</div>
        ${fieldsHTML}
        <div style="margin-top:10px">
          ${UI.field('体重推移の公開件数（0=非表示）',
            '<input type="number" id="pub-growth-cnt" class="input" min="0" max="20" value="' + growthCnt + '">')}
        </div>
      </div>

      <!-- カスタムコメント -->
      <div class="card">
        <div class="card-title" style="margin-bottom:8px">💬 販売コメント</div>
        <textarea id="pub-comment" class="input" rows="4"
          placeholder="購入希望者へのコメント（例: 2026年3月孵化、状態良好です）"
          style="resize:vertical;line-height:1.7">${comment}</textarea>
      </div>

      <!-- 保存ボタン -->
      <button class="btn btn-primary btn-full" style="margin-top:4px"
        onclick="Pages._pubSave('${indId}')">
        💾 公開設定を保存
      </button>

    </div>`;

  // トグルアニメーション
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

// ── 写真選択プレビュー ────────────────────────────────────────
Pages._pubPhotoSelected = function (input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    window.__pubPhotoFile   = file;
    window.__pubPhotoBase64 = e.target.result.split(',')[1];
    window.__pubPhotoMime   = file.type;
    const preview = document.getElementById('pub-photo-preview');
    if (preview) {
      preview.innerHTML = '<div style="position:relative;display:inline-block;width:100%">'
        + '<img src="' + e.target.result + '" alt="プレビュー"'
        + ' style="width:100%;max-height:220px;object-fit:cover;border-radius:10px;display:block">'
        + '<button onclick="Pages._pubRemovePhoto()"'
        + ' style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);'
        + 'color:#fff;border:none;border-radius:50%;width:30px;height:30px;'
        + 'font-size:.85rem;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>'
        + '</div>';
    }
  };
  reader.readAsDataURL(file);
};

// ── 写真削除 ─────────────────────────────────────────────────
Pages._pubRemovePhoto = function () {
  window.__pubPhotoFile   = null;
  window.__pubPhotoBase64 = null;
  window.__pubPhotoMime   = null;
  window.__pubRemovePhoto = true;
  const preview = document.getElementById('pub-photo-preview');
  if (preview) {
    preview.innerHTML = '<div style="background:var(--surface2);border:2px dashed var(--border);'
      + 'border-radius:10px;padding:28px;text-align:center;color:var(--text3)">'
      + '<div style="font-size:2rem;margin-bottom:6px">📷</div>'
      + '<div style="font-size:.82rem">写真がありません</div>'
      + '</div>';
  }
};

// ── 保存 ─────────────────────────────────────────────────────
Pages._pubSave = async function (indId) {
  const safeId = (indId && String(indId).trim()) || '';
  if (!safeId) { UI.toast('個体IDが取得できませんでした', 'error'); return; }

  if (!API.publicPage || typeof API.publicPage.createOrUpdate !== 'function') {
    UI.toast('API未初期化です。ページをリロードしてください。', 'error');
    return;
  }

  const isPublic  = document.getElementById('pub-toggle')?.checked || false;
  const comment   = document.getElementById('pub-comment')?.value?.trim() || '';
  const growthCnt = parseInt(document.getElementById('pub-growth-cnt')?.value || '5', 10);
  const lineUrl   = document.getElementById('pub-line-url')?.value?.trim() || '';
  const formUrl   = document.getElementById('pub-form-url')?.value?.trim() || '';

  const checked = Array.from(document.querySelectorAll('[data-field]'))
    .filter(function(el) { return el.checked; })
    .map(function(el) { return el.dataset.field; });

  if (checked.length === 0 && isPublic) {
    UI.toast('公開する項目を1つ以上選んでください', 'error'); return;
  }

  try {
    UI.loading(true);

    // ── 写真アップロード（選択されている場合）────────────────
    let mainPhotoUrl = '';
    const hasNewPhoto = window.__pubPhotoBase64 && window.__pubPhotoMime;
    const removePhoto = window.__pubRemovePhoto === true;

    if (hasNewPhoto) {
      const ind = Store.getIndividual(safeId);
      const lineDisplayId = (ind && ind.display_id)
        ? ind.display_id.split('-').slice(0, 2).join('-')
        : 'UNKNOWN';
      const ext      = window.__pubPhotoMime.split('/')[1] || 'jpg';
      const filename = 'pub_' + safeId + '_' + Date.now() + '.' + ext;
      const upRes    = await API.publicPage.uploadPhoto({
        base64:          window.__pubPhotoBase64,
        mime_type:       window.__pubPhotoMime,
        filename:        filename,
        line_display_id: lineDisplayId,
        folder_type:     'SALE',
      });
      mainPhotoUrl = (upRes && upRes.url) ? upRes.url : '';
      window.__pubPhotoBase64 = null;
      window.__pubPhotoFile   = null;
    } else if (removePhoto) {
      mainPhotoUrl = '';
      window.__pubRemovePhoto = false;
    } else {
      // 変更なし: 既存URLを保持するため undefined で送る（上書きしない）
      mainPhotoUrl = undefined;
    }

    const payload = {
      ind_id:            safeId,
      is_public:         isPublic,
      level:             'public',
      public_fields:     JSON.stringify(checked),
      custom_comment:    comment,
      show_growth_count: growthCnt,
      contact_line_url:  lineUrl,
      contact_form_url:  formUrl,
    };
    if (mainPhotoUrl !== undefined) payload.main_photo_url = mainPhotoUrl;

    await API.publicPage.createOrUpdate(payload);
    UI.toast(isPublic ? '公開設定を保存しました 🌐' : '非公開に設定しました 🔒', 'success');
    Pages.publicEdit({ indId: safeId });
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    UI.toast('保存失敗: ' + msg, 'error');
    console.error('[_pubSave] error:', e);
  } finally {
    UI.loading(false);
  }
};

// ── URLコピー ─────────────────────────────────────────────────
Pages._pubCopyUrl = function (url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => UI.toast('URLをコピーしました', 'success'))
      .catch(() => _pubCopyFallback(url));
  } else {
    _pubCopyFallback(url);
  }
};

function _pubCopyFallback(url) {
  const el = document.createElement('textarea');
  el.value = url;
  el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(el);
  el.select();
  try { document.execCommand('copy'); UI.toast('URLをコピーしました', 'success'); }
  catch(e) { UI.toast('コピー失敗。URLを手動でコピーしてください', 'error'); }
  document.body.removeChild(el);
}

window.PAGES = window.PAGES || {};
window.PAGES['public-edit'] = () => Pages.publicEdit(Store.getParams());
