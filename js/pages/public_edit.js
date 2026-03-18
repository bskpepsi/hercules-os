// ════════════════════════════════════════════════════════════════
// public_edit.js — Phase5.5 公開設定画面
//
// 役割: 個体ごとの公開ページ設定を管理する。
//       個体詳細画面の「公開設定」ボタンから遷移。
//       公開ON/OFF・項目選択・コメント・URLコピーを提供。
// ════════════════════════════════════════════════════════════════
'use strict';

// ── 公開可能な項目定義 ────────────────────────────────────────
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

  // キャッシュから個体取得
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
  const exists    = pub && pub.exists;
  const isPublic  = exists ? pub.is_public  : false;
  const token     = exists ? pub.token      : null;
  const fields    = exists ? (pub.public_fields || []) : ['display_id','line','parents','weight','stage','sale_status'];
  const comment   = exists ? (pub.custom_comment || '') : '';
  const growthCnt = exists ? (pub.show_growth_count || 5) : 5;
  const viewCount = exists ? (pub.view_count || 0) : 0;

  const displayName = (ind && ind.display_id) || indId;
  const publicUrl   = token
    ? (location.origin + location.pathname + '#page=public-view&token=' + token)
    : null;

  // グループ別にフィールドを整理
  const groups = {};
  PUBLIC_FIELD_DEFS.forEach(d => {
    if (!groups[d.group]) groups[d.group] = [];
    groups[d.group].push(d);
  });

  const fieldsHTML = Object.entries(groups).map(([grp, defs]) => `
    <div style="margin-bottom:12px">
      <div style="font-size:.7rem;font-weight:700;color:var(--text3);
        letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">${grp}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
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

      <!-- 公開状態カード -->
      <div class="card" style="border-color:${isPublic ? 'rgba(76,175,120,.4)' : 'var(--border)'}">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="flex:1">
            <div style="font-weight:700;font-size:.95rem;margin-bottom:3px">
              ${isPublic ? '🌐 公開中' : '🔒 非公開'}
            </div>
            <div style="font-size:.75rem;color:var(--text3)">
              ${isPublic
                ? '公開URLからこの個体の情報を閲覧できます'
                : '公開URLは発行済みですが誰も閲覧できません'}
            </div>
            ${exists ? `<div style="font-size:.68rem;color:var(--text3);margin-top:3px">閲覧数: ${viewCount}回</div>` : ''}
          </div>
          <!-- トグルスイッチ -->
          <label style="position:relative;display:inline-block;width:52px;height:28px;flex-shrink:0;cursor:pointer">
            <input type="checkbox" id="pub-toggle" ${isPublic ? 'checked' : ''}
              style="opacity:0;width:0;height:0;position:absolute">
            <span id="pub-toggle-track" style="
              position:absolute;inset:0;border-radius:28px;
              background:${isPublic ? 'var(--green)' : 'var(--surface3,#555)'};
              transition:background .2s">
              <span style="
                position:absolute;top:3px;
                left:${isPublic ? '27px' : '3px'};
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
        <div style="
          font-size:.72rem;color:var(--blue);
          background:var(--surface2);border-radius:8px;
          padding:8px 10px;word-break:break-all;
          border:1px solid rgba(91,168,232,.3);
          margin-bottom:8px">${publicUrl}</div>
        <button class="btn btn-ghost btn-full" onclick="Pages._pubCopyUrl('${publicUrl}')">
          📋 URLをコピー
        </button>
      </div>` : `
      <div class="card" style="border-style:dashed;border-color:var(--text3)">
        <div style="font-size:.82rem;color:var(--text3);text-align:center;padding:4px 0">
          保存すると公開URLが発行されます
        </div>
      </div>`}

      <!-- 公開項目 -->
      <div class="card">
        <div class="card-title" style="margin-bottom:12px">📋 公開する項目</div>
        ${fieldsHTML}
        <div style="margin-top:12px">
          ${UI.field('体重推移の公開件数（0=非表示）',
            `<input type="number" id="pub-growth-cnt" class="input"
               min="0" max="20" value="${growthCnt}" placeholder="例: 5">`)}</div>
      </div>

      <!-- カスタムコメント -->
      <div class="card">
        <div class="card-title" style="margin-bottom:8px">💬 公開ページのコメント</div>
        <textarea id="pub-comment" class="input"
          rows="3" placeholder="購入希望者へのコメント（任意）"
          style="resize:vertical;line-height:1.6">${comment}</textarea>
      </div>

      <!-- 保存ボタン -->
      <button class="btn btn-primary btn-full" style="margin-top:4px"
        onclick="Pages._pubSave('${indId}')">
        💾 公開設定を保存
      </button>

    </div>`;

  // トグルのインタラクション
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

// ── 保存 ─────────────────────────────────────────────────────
Pages._pubSave = async function (indId) {
  const isPublic = document.getElementById('pub-toggle')?.checked || false;
  const comment  = document.getElementById('pub-comment')?.value?.trim() || '';
  const growthCnt= parseInt(document.getElementById('pub-growth-cnt')?.value || '5', 10);

  // チェックされた項目を収集
  const checked = [];
  document.querySelectorAll('[data-field]').forEach(el => {
    if (el.checked) checked.push(el.dataset.field);
  });

  if (checked.length === 0 && isPublic) {
    UI.toast('公開する項目を1つ以上選んでください', 'error'); return;
  }

  try {
    UI.loading(true);
    // level は常に PUBLIC（buyer_only は今回未使用）
    const res = await API.publicPage.createOrUpdate({
      ind_id:            indId,
      is_public:         isPublic,
      level:             'public',
      public_fields:     JSON.stringify(checked),
      custom_comment:    comment,
      show_growth_count: growthCnt,
    });
    UI.toast(isPublic ? '公開設定を保存しました 🌐' : '非公開に設定しました 🔒', 'success');

    // 再ロードして最新状態を表示
    Pages.publicEdit({ indId });
  } catch (e) {
    UI.toast('保存失敗: ' + e.message, 'error');
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
  el.style.position = 'fixed';
  el.style.opacity  = '0';
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand('copy');
    UI.toast('URLをコピーしました', 'success');
  } catch(e) {
    UI.toast('コピー失敗。URLを手動でコピーしてください', 'error');
  }
  document.body.removeChild(el);
}

window.PAGES = window.PAGES || {};
window.PAGES['public-edit'] = () => Pages.publicEdit(Store.getParams());
