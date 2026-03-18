// ════════════════════════════════════════════════════════════════
// public_edit.js — Phase5.5 公開設定
//   写真10枚対応 / 一括選択 / POST転送 / 黒画像修正版
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

const PUB_PHOTO_MAX = 10;
window.__pubPhotos      = window.__pubPhotos || Array(PUB_PHOTO_MAX).fill(null);
window.__pubCurrentSlot = 0;

// ────────────────────────────────────────────────────────────────
// 画像圧縮（黒画像修正版）
// ────────────────────────────────────────────────────────────────
// compressImageToBase64 は api.js に定義済みだが、
// Canvasのデフォルト背景が透明 → JPEG変換で黒になる問題を修正した版。
async function _compressPhoto(file, maxPx, quality) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function(ev) {
      var img = new Image();
      img.onerror = reject;
      img.onload = function() {
        var w = img.width, h = img.height;
        if (w === 0 || h === 0) { reject(new Error('画像サイズが0です')); return; }
        if (w > maxPx || h > maxPx) {
          var s = Math.min(maxPx / w, maxPx / h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        var c   = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        // ── 白背景を塗る（これがないとJPEG変換で黒くなる）──
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = c.toDataURL('image/jpeg', quality || 0.75);
        if (!dataUrl || dataUrl === 'data:,') {
          reject(new Error('canvas.toDataURL失敗'));
          return;
        }
        resolve({
          base64:   dataUrl.split(',')[1],
          mimeType: 'image/jpeg',
          dataUrl:  dataUrl,
        });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ────────────────────────────────────────────────────────────────
// ページエントリ
// ────────────────────────────────────────────────────────────────
Pages.publicEdit = async function(params) {
  params = params || Store.getParams() || {};
  var indId = params.indId || params.ind_id || '';
  var main  = document.getElementById('main');
  if (!indId) {
    main.innerHTML = UI.header('公開設定', { back: true }) + UI.empty('個体IDが指定されていません');
    return;
  }
  window.__pubPhotos = Array(PUB_PHOTO_MAX).fill(null);
  var ind = Store.getIndividual(indId);
  main.innerHTML = UI.header('公開設定', { back: true }) + UI.spinner();
  try {
    var res = await API.publicPage.getByIndId(indId);
    if (Store.getPage() !== 'public-edit') return;
    _renderPublicEdit(main, ind, res, indId);
  } catch (e) {
    _renderPublicEdit(main, ind, { exists: false }, indId);
  }
};

// ────────────────────────────────────────────────────────────────
// 写真スロットHTML
// ────────────────────────────────────────────────────────────────
function _photoSlotHtml(index, photo) {
  var label = index === 0 ? 'メイン' : (index + 1) + '枚目';
  // 表示できる画像があるか
  var src = photo && !photo.remove
    ? (photo.dataUrl || photo.existingUrl || null)
    : null;
  if (src) {
    return '<div style="position:relative;aspect-ratio:1;overflow:hidden;border-radius:8px;background:#111">'
      + '<img src="' + src + '" style="width:100%;height:100%;object-fit:cover;display:block"'
      + ' onerror="this.style.display=\'none\';this.parentNode.style.background=\'#333\'">'
      + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;'
      + 'justify-content:space-between;padding:3px">'
      + '<span style="font-size:.55rem;background:rgba(0,0,0,.6);color:#fff;'
      + 'padding:1px 4px;border-radius:3px;align-self:flex-start">' + label + '</span>'
      + '<button onclick="Pages._pubPhotoRemove(' + index + ')"'
      + ' style="background:rgba(0,0,0,.65);color:#fff;border:none;border-radius:50%;'
      + 'width:20px;height:20px;font-size:.65rem;cursor:pointer;align-self:flex-end;'
      + 'display:flex;align-items:center;justify-content:center">✕</button>'
      + '</div></div>';
  }
  return '<div onclick="Pages._pubPhotoPickSlot(' + index + ')"'
    + ' style="aspect-ratio:1;border:1.5px dashed var(--border);border-radius:8px;'
    + 'background:var(--surface2);display:flex;flex-direction:column;align-items:center;'
    + 'justify-content:center;cursor:pointer;gap:3px;color:var(--text3)">'
    + '<span style="font-size:' + (index === 0 ? '1.5rem' : '1.1rem') + '">📷</span>'
    + '<span style="font-size:.58rem">' + label + '</span>'
    + '</div>';
}

// ────────────────────────────────────────────────────────────────
// メイン描画
// ────────────────────────────────────────────────────────────────
function _renderPublicEdit(main, ind, pub, indId) {
  var exists    = pub && pub.exists;
  var isPublic  = exists ? pub.is_public  : false;
  var token     = exists ? pub.token      : null;
  var fields    = exists ? (pub.public_fields || []) : ['display_id','line','parents','weight','stage','sale_status'];
  var comment   = exists ? (pub.custom_comment || '') : '';
  var growthCnt = exists ? (pub.show_growth_count || 5) : 5;
  var viewCount = exists ? (pub.view_count || 0) : 0;
  var lineUrl   = exists ? (pub.contact_line_url || '') : '';
  var formUrl   = exists ? (pub.contact_form_url || '') : '';

  // 既存写真をスロットに設定
  var mainPhotoUrl   = exists ? (pub.main_photo_url || '') : '';
  // photo_urls は配列またはJSON文字列で来る可能性がある
  var rawExtra = exists ? (pub.photo_urls || []) : [];
  if (typeof rawExtra === 'string') {
    try { rawExtra = JSON.parse(rawExtra); } catch(e) { rawExtra = []; }
  }
  var extraPhotoUrls = Array.isArray(rawExtra) ? rawExtra : [];

  window.__pubPhotos = Array(PUB_PHOTO_MAX).fill(null);
  if (mainPhotoUrl) window.__pubPhotos[0] = { existingUrl: mainPhotoUrl };
  extraPhotoUrls.forEach(function(url, i) {
    if (url && i + 1 < PUB_PHOTO_MAX) window.__pubPhotos[i + 1] = { existingUrl: url };
  });

  var displayName = (ind && ind.display_id) || indId;
  var publicUrl   = token
    ? (location.origin + location.pathname + '#page=public-view&token=' + token)
    : null;

  // 公開項目チェックボックス
  var groups = {};
  PUBLIC_FIELD_DEFS.forEach(function(d) {
    if (!groups[d.group]) groups[d.group] = [];
    groups[d.group].push(d);
  });
  var fieldsHTML = Object.entries(groups).map(function(entry) {
    var grp = entry[0], defs = entry[1];
    return '<div style="margin-bottom:12px">'
      + '<div style="font-size:.68rem;font-weight:700;color:var(--text3);'
      + 'letter-spacing:.07em;text-transform:uppercase;margin-bottom:6px">' + grp + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:7px">'
      + defs.map(function(d) {
          return '<label style="display:flex;align-items:center;gap:6px;'
            + 'background:var(--surface2);border:1px solid var(--border);'
            + 'border-radius:8px;padding:7px 10px;cursor:pointer;font-size:.82rem;color:var(--text2)">'
            + '<input type="checkbox" data-field="' + d.key + '" '
            + (fields.includes(d.key) ? 'checked' : '')
            + ' style="width:15px;height:15px;cursor:pointer;accent-color:var(--green)">'
            + d.label + '</label>';
        }).join('')
      + '</div></div>';
  }).join('');

  // 写真グリッド (5列×2行)
  var photoGridHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">'
    + Array.from({length: PUB_PHOTO_MAX}, function(_, i) {
        return '<div id="pub-photo-slot-' + i + '">' + _photoSlotHtml(i, window.__pubPhotos[i]) + '</div>';
      }).join('')
    + '</div>';

  main.innerHTML =
    UI.header('公開設定 — ' + displayName, { back: true })
    + '<div class="page-body">'

    // 公開ON/OFF
    + '<div class="card" style="border-color:' + (isPublic ? 'rgba(76,175,120,.4)' : 'var(--border)') + '">'
    + '<div style="display:flex;align-items:center;gap:12px">'
    + '<div style="flex:1">'
    + '<div style="font-weight:700;font-size:.95rem;margin-bottom:2px">' + (isPublic ? '🌐 公開中' : '🔒 非公開') + '</div>'
    + '<div style="font-size:.75rem;color:var(--text3)">' + (isPublic ? '公開URLからこの個体の情報を閲覧できます' : 'URLが発行済みですが非公開状態です') + '</div>'
    + (exists ? '<div style="font-size:.68rem;color:var(--text3);margin-top:3px">閲覧数: ' + viewCount + '回</div>' : '')
    + '</div>'
    + '<label style="position:relative;display:inline-block;width:52px;height:28px;flex-shrink:0;cursor:pointer">'
    + '<input type="checkbox" id="pub-toggle" ' + (isPublic ? 'checked' : '') + ' style="opacity:0;width:0;height:0;position:absolute">'
    + '<span id="pub-toggle-track" style="position:absolute;inset:0;border-radius:28px;background:' + (isPublic ? 'var(--green)' : 'var(--surface3,#555)') + ';transition:background .2s">'
    + '<span id="pub-toggle-knob" style="position:absolute;top:3px;left:' + (isPublic ? '27px' : '3px') + ';width:22px;height:22px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.3)"></span>'
    + '</span></label>'
    + '</div></div>'

    // 公開URL
    + (publicUrl
      ? '<div class="card"><div class="card-title" style="margin-bottom:8px">🔗 公開URL</div>'
        + '<div style="font-size:.72rem;color:var(--blue);background:var(--surface2);border-radius:8px;padding:8px 10px;word-break:break-all;border:1px solid rgba(91,168,232,.3);margin-bottom:8px">' + publicUrl + '</div>'
        + '<button class="btn btn-ghost btn-full" onclick="Pages._pubCopyUrl(\'' + publicUrl + '\')">📋 URLをコピー</button>'
        + '</div>'
      : '<div class="card" style="border-style:dashed"><div style="font-size:.82rem;color:var(--text3);text-align:center;padding:4px 0">保存すると公開URLが発行されます</div></div>')

    // 写真エリア
    + '<div class="card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
    + '<div class="card-title" style="margin-bottom:0">📷 公開写真（最大' + PUB_PHOTO_MAX + '枚）</div>'
    + '<button class="btn btn-ghost btn-sm" style="font-size:.78rem" onclick="Pages._pubPickMultiple()">＋ まとめて追加</button>'
    + '</div>'
    + '<div style="font-size:.72rem;color:var(--text3);margin-bottom:10px">1枚目がメイン写真として大きく表示</div>'
    + photoGridHTML
    + '<div style="font-size:.7rem;color:var(--text3);margin-top:8px;text-align:center">自動圧縮（800px）してPOST送信</div>'
    + '</div>'

    // ファイル入力（個別・複数兼用）
    + '<input type="file" id="pub-photo-input-single" accept="image/*" style="display:none" onchange="Pages._pubPhotoFileSelected(this, false)">'
    + '<input type="file" id="pub-photo-input-multi"  accept="image/*" style="display:none" multiple onchange="Pages._pubPhotoFileSelected(this, true)">'

    // 問い合わせ
    + '<div class="card"><div class="card-title" style="margin-bottom:10px">📩 問い合わせ導線</div>'
    + UI.field('LINE URL', '<input type="url" id="pub-line-url" class="input" value="' + lineUrl + '" placeholder="https://line.me/R/ti/p/...">')
    + UI.field('フォームURL（任意）', '<input type="url" id="pub-form-url" class="input" value="' + formUrl + '" placeholder="https://forms.gle/...">')
    + '</div>'

    // 公開項目
    + '<div class="card"><div class="card-title" style="margin-bottom:12px">📋 公開する項目</div>'
    + fieldsHTML
    + '<div style="margin-top:10px">'
    + UI.field('体重推移の公開件数（0=非表示）', '<input type="number" id="pub-growth-cnt" class="input" min="0" max="20" value="' + growthCnt + '">')
    + '</div></div>'

    // 販売コメント
    + '<div class="card"><div class="card-title" style="margin-bottom:8px">💬 販売コメント</div>'
    + '<textarea id="pub-comment" class="input" rows="4" placeholder="購入希望者へのコメント（例: 2026年3月孵化、状態良好です）" style="resize:vertical;line-height:1.7">' + comment + '</textarea>'
    + '</div>'

    + '<button class="btn btn-primary btn-full" style="margin-top:4px" onclick="Pages._pubSave(\'' + indId + '\')">💾 公開設定を保存</button>'
    + '</div>';

  // トグル
  var toggle = document.getElementById('pub-toggle');
  var track  = document.getElementById('pub-toggle-track');
  var knob   = document.getElementById('pub-toggle-knob');
  if (toggle && track && knob) {
    toggle.addEventListener('change', function() {
      var on = toggle.checked;
      track.style.background = on ? 'var(--green)' : 'var(--surface3,#555)';
      knob.style.left        = on ? '27px' : '3px';
    });
  }
}

// ────────────────────────────────────────────────────────────────
// 個別スロット選択
// ────────────────────────────────────────────────────────────────
Pages._pubPhotoPickSlot = function(index) {
  window.__pubCurrentSlot = index;
  var input = document.getElementById('pub-photo-input-single');
  if (input) { input.value = ''; input.click(); }
};

// ────────────────────────────────────────────────────────────────
// まとめて追加（複数選択）
// ────────────────────────────────────────────────────────────────
Pages._pubPickMultiple = function() {
  var input = document.getElementById('pub-photo-input-multi');
  if (input) { input.value = ''; input.click(); }
};

// ────────────────────────────────────────────────────────────────
// ファイル選択共通処理（個別 / 複数両対応）
// ────────────────────────────────────────────────────────────────
Pages._pubPhotoFileSelected = async function(input, isMulti) {
  var files = Array.from(input.files || []);
  if (!files.length) return;

  if (!isMulti) {
    // ── 個別スロット ─────────────────────────────────────────
    var index = window.__pubCurrentSlot || 0;
    UI.toast('圧縮中...', 'info', 1500);
    try {
      var compressed = await _compressPhoto(files[0], 800, 0.75);
      window.__pubPhotos[index] = { base64: compressed.base64, mime: compressed.mimeType, dataUrl: compressed.dataUrl };
      _refreshSlot(index);
    } catch (e) {
      UI.toast('画像の読み込みに失敗しました: ' + e.message, 'error');
    }
    return;
  }

  // ── 一括追加 ───────────────────────────────────────────────
  // 空きスロット（null または remove済み）を順に埋める
  var emptySlots = [];
  for (var i = 0; i < PUB_PHOTO_MAX; i++) {
    var ph = window.__pubPhotos[i];
    if (!ph || ph.remove) emptySlots.push(i);
  }

  var toProcess = files.slice(0, emptySlots.length);
  var skipped   = files.length - toProcess.length;

  if (files.length > emptySlots.length) {
    UI.toast('空きスロットは ' + emptySlots.length + ' 枠です。' + skipped + '枚は追加されません。', 'error', 3000);
    if (!toProcess.length) return;
  }

  UI.toast(toProcess.length + '枚を圧縮中...', 'info', 2000);

  // 1枚ずつ順番に処理（スマホ負荷軽減）
  for (var j = 0; j < toProcess.length; j++) {
    var slotIdx = emptySlots[j];
    try {
      var c = await _compressPhoto(toProcess[j], 800, 0.75);
      window.__pubPhotos[slotIdx] = { base64: c.base64, mime: c.mimeType, dataUrl: c.dataUrl };
      _refreshSlot(slotIdx);
    } catch (err) {
      UI.toast((j + 1) + '枚目の処理に失敗: ' + err.message, 'error');
    }
  }

  UI.toast(toProcess.length + '枚を追加しました', 'success');
};

// スロットを再描画
function _refreshSlot(index) {
  var slot = document.getElementById('pub-photo-slot-' + index);
  if (slot) slot.innerHTML = _photoSlotHtml(index, window.__pubPhotos[index]);
}

// ────────────────────────────────────────────────────────────────
// 写真削除
// ────────────────────────────────────────────────────────────────
Pages._pubPhotoRemove = function(index) {
  window.__pubPhotos[index] = { remove: true };
  _refreshSlot(index);
};

// ────────────────────────────────────────────────────────────────
// 保存
// ────────────────────────────────────────────────────────────────
Pages._pubSave = async function(indId) {
  var safeId = (indId && String(indId).trim()) || '';
  if (!safeId) { UI.toast('個体IDが取得できませんでした', 'error'); return; }
  if (!API.publicPage || typeof API.publicPage.createOrUpdate !== 'function') {
    UI.toast('API未初期化です。ページをリロードしてください。', 'error'); return;
  }

  var isPublic  = document.getElementById('pub-toggle')?.checked || false;
  var comment   = document.getElementById('pub-comment')?.value?.trim() || '';
  var growthCnt = parseInt(document.getElementById('pub-growth-cnt')?.value || '5', 10);
  var lineUrl   = document.getElementById('pub-line-url')?.value?.trim() || '';
  var formUrl   = document.getElementById('pub-form-url')?.value?.trim() || '';
  var checked   = Array.from(document.querySelectorAll('[data-field]'))
    .filter(function(el) { return el.checked; })
    .map(function(el) { return el.dataset.field; });

  if (checked.length === 0 && isPublic) { UI.toast('公開する項目を1つ以上選んでください', 'error'); return; }

  try {
    UI.loading(true);
    var ind           = Store.getIndividual(safeId);
    var lineDisplayId = (ind && ind.display_id) ? ind.display_id.split('-').slice(0, 2).join('-') : 'UNKNOWN';
    var uploadedUrls  = Array(PUB_PHOTO_MAX).fill(undefined);

    for (var i = 0; i < PUB_PHOTO_MAX; i++) {
      var ph = window.__pubPhotos[i];
      if (ph && ph.base64 && ph.mime) {
        // 新規アップロード
        var ext      = ph.mime.split('/')[1] || 'jpg';
        var filename = 'pub_' + safeId + '_' + i + '_' + Date.now() + '.' + ext;
        try {
          var upRes = await API.publicPage.uploadPhoto({
            base64: ph.base64, mime_type: ph.mime,
            filename: filename, line_display_id: lineDisplayId, folder_type: 'SALE',
          });
          uploadedUrls[i] = (upRes && upRes.url) ? upRes.url : '';
        } catch (upErr) {
          UI.toast((i === 0 ? 'メイン' : (i+1) + '枚目') + '写真失敗: ' + upErr.message, 'error');
          uploadedUrls[i] = undefined;
        }
      } else if (ph && ph.remove) {
        uploadedUrls[i] = ''; // 削除
      }
      // undefined = 変更なし（既存URL保持）
    }

    var payload = {
      ind_id: safeId, is_public: isPublic, level: 'public',
      public_fields: JSON.stringify(checked), custom_comment: comment,
      show_growth_count: growthCnt, contact_line_url: lineUrl, contact_form_url: formUrl,
    };
    if (uploadedUrls[0] !== undefined) payload.main_photo_url = uploadedUrls[0];
    var extras = uploadedUrls.slice(1).filter(function(u) { return u !== undefined; });
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

// ────────────────────────────────────────────────────────────────
// URLコピー
// ────────────────────────────────────────────────────────────────
Pages._pubCopyUrl = function(url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(function() { UI.toast('URLをコピーしました', 'success'); })
      .catch(function() { _pubCopyFallback(url); });
  } else { _pubCopyFallback(url); }
};
function _pubCopyFallback(url) {
  var el = document.createElement('textarea');
  el.value = url; el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(el); el.select();
  try { document.execCommand('copy'); UI.toast('URLをコピーしました', 'success'); }
  catch(e) { UI.toast('コピー失敗。URLを手動でコピーしてください', 'error'); }
  document.body.removeChild(el);
}

window.PAGES = window.PAGES || {};
window.PAGES['public-edit'] = function() { Pages.publicEdit(Store.getParams()); };
