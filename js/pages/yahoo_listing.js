// FILE: js/pages/yahoo_listing.js
// ════════════════════════════════════════════════════════════════
// yahoo_listing.js — ヤフオク出品AIジェネレーター（手動入力モード）
//
// build: 20260426y1
// 要件定義書: HerculesOS_ヤフオク出品AIジェネレーター_要件定義書_v1.0
//
// ── 設計方針 ──────────────────────────────────────────────────
// ・既存の sale_listing.js (build 20260416e) はそのまま残し、本機能は別ページとして実装。
// ・関数名・状態変数は `yahoo_*` / `_yl*` プレフィックスで衝突回避。
// ・キャッシュバスティングは独自レター系列 (`y1`, `y2`...) を使用。
// ・既存シート (lines/parents/lots/individuals 等) は読み取り専用で参照、列追加なし。
// ・GAS連携は v1 ではしない (localStorage にローカル保存のみ)。
//   将来 GAS 連携する際は `yahoo_*` API 関数を api.js に追加する想定。
//
// ── 機能範囲 (要件定義書 §3 準拠) ────────────────────────────
// §3.1 入力画面: セット種別選択(幼虫/成虫) → 個体動的追加 → セット全体情報
// §3.3 出品本文構造: AI生成パート + 固定テンプレート結合
// §3.4 発送ラベル: 60×30mm DK-2205 カット運用、HERAKABU MARCHÉ ブランド
// §3.5 ロゴ管理: /assets/logos/herakabu-marche-logo.svg (透過SVG暫定)
// §3.6 NGワード/言い換えマスタ: localStorage管理
// §3.7 出品文HTML/プレーン両対応: タブ切替、デフォルトHTML
// §4   データモデル: localStorageキー hercules_yahoo_listing_v1
// §5   Gemini プロンプト: gemini-2.5-flash, JSON 返却
// §7   推定価格機能: v1 非対応 (OFFのまま)
// ════════════════════════════════════════════════════════════════
'use strict';

window.PAGES = window.PAGES || {};
window.PAGES['yahoo-listing'] = () => Pages.yahooListing(Store.getParams());
window.PAGES['yahoo-listing-refs']  = () => Pages.yahooListingRefs(Store.getParams());
window.PAGES['yahoo-listing-ng']    = () => Pages.yahooListingNg(Store.getParams());
window.PAGES['yahoo-listing-history'] = () => Pages.yahooListingHistory(Store.getParams());

// ════════════════════════════════════════════════════════════════
// 定数 / ユーティリティ
// ════════════════════════════════════════════════════════════════
const YL_LS_KEY        = 'hercules_yahoo_listing_v1';      // メインデータ保存先
const YL_API_KEY_LS    = 'hercules_gemini_key';            // 既存sale_listing.jsと共用
const YL_DRAFT_KEY     = 'hercules_yahoo_listing_draft';   // 入力中の下書き
const YL_LOGO_PATH     = 'assets/logos/herakabu-marche-logo.svg?v=20260426y1';
const YL_GEMINI_MODEL  = 'gemini-2.5-flash';

// 既定NGワードと推奨言い換え (ユーザーがマスタ画面で編集可能)
const YL_DEFAULT_NG_WORDS = [
  { ng: '激レア',     reword: '希少', reason: '誇大表現' },
  { ng: '絶対',       reword: '',     reason: '断定回避' },
  { ng: '完璧',       reword: '美しい', reason: '誇大表現' },
  { ng: '世界一',     reword: '',     reason: '誇大表現' },
  { ng: '死着保証',   reword: '到着時事故補償なし', reason: '表現統一' },
];

const YL_DEFAULT_TEMPLATES = {
  shipping: '【発送について】\n・発送方法: ヤマト便 / ゆうパック\n・発送元: 大阪府\n・梱包: 保冷剤・カイロを季節に応じて使用\n・落札後48時間以内のご入金にご協力ください',
  terms:    '【ご注意ください】\n・生体のため到着時事故の補償はいたしかねます\n・中1日以上かかる地域はリスク承知の上で入札ください\n・雌雄判別は目視によるもので、誤判別の可能性があります\n・ダニ・コバエ等の混入の可能性があります',
  seller:   '【出品者より】\nHERAKABU MARCHÉ をご覧いただきありがとうございます。\nご質問は質問欄よりお気軽にどうぞ。',
};

function _ylLoadStorage() {
  try {
    const raw = localStorage.getItem(YL_LS_KEY);
    if (!raw) return _ylInitStorage();
    const obj = JSON.parse(raw);
    // 後方互換: 必要キーが欠落していたら埋める
    if (!obj.references)    obj.references = [];
    if (!obj.history)       obj.history    = [];
    if (!obj.ng_words)      obj.ng_words   = YL_DEFAULT_NG_WORDS.slice();
    if (!obj.templates)     obj.templates  = Object.assign({}, YL_DEFAULT_TEMPLATES);
    return obj;
  } catch (_) {
    return _ylInitStorage();
  }
}

function _ylInitStorage() {
  const init = {
    references: [],   // 参考出品文マスタ
    history:    [],   // 生成履歴
    ng_words:   YL_DEFAULT_NG_WORDS.slice(),
    templates:  Object.assign({}, YL_DEFAULT_TEMPLATES),
  };
  localStorage.setItem(YL_LS_KEY, JSON.stringify(init));
  return init;
}

function _ylSaveStorage(data) {
  try {
    localStorage.setItem(YL_LS_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('[YL] save failed', e);
    return false;
  }
}

function _ylUid(prefix) {
  return (prefix || 'YL') + '-' + Math.random().toString(36).slice(2, 9);
}

function _ylEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _ylDateLabel() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}/${mm}/${dd}`;
}

function _ylJunMonthLabel(dateStr) {
  // YYYY-MM-DD → "YYYY/MM /上旬|中旬|下旬"
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return String(dateStr);
  const yyyy = m[1];
  const mm = String(parseInt(m[2],10)).padStart(2,'0');
  const day = parseInt(m[3], 10);
  const jun = day <= 10 ? '上旬' : day <= 20 ? '中旬' : '下旬';
  return `${yyyy}/${mm} /${jun}`;
}

// ════════════════════════════════════════════════════════════════
// メインページ: 新規出品作成 (セット種別選択 + 入力フォーム)
// ════════════════════════════════════════════════════════════════
Pages.yahooListing = function (params = {}) {
  const main = document.getElementById('main');
  if (!main) return;

  // ── 状態 ──────────────────────────────────────────────────
  // セット種別: 'larva' or 'adult' or '' (未選択)
  let setType = params.setType || '';
  // セット内個体リスト (uid付きオブジェクト配列)
  let individuals = Array.isArray(params.individuals) && params.individuals.length
    ? params.individuals.slice()
    : [];
  // セット全体情報
  let saleInfo = params.saleInfo || {
    soldFormatNum: 1,             // 〇頭セット の数 / ペア・トリオの場合は使わない
    salePattern:   'larva_n',     // 'larva_n' | 'single_male' | 'single_female' | 'pair' | 'trio'
    startPrice:    '',
    buynowPrice:   '',
    shippingByBuyer: false,       // 落札者負担なら true
    shippingMethod: 'ヤマト便',
    extraAppeal:   '',
  };
  let outputFmt = 'html';   // 'html' | 'plain'

  // 下書き復元
  if (!params.fromHistory && !params.fresh) {
    try {
      const d = JSON.parse(localStorage.getItem(YL_DRAFT_KEY) || 'null');
      if (d && d.setType && !setType) {
        setType     = d.setType     || setType;
        individuals = (d.individuals || []).slice();
        saleInfo    = Object.assign(saleInfo, d.saleInfo || {});
        outputFmt   = d.outputFmt   || outputFmt;
      }
    } catch (_) {}
  }

  function _saveDraft() {
    try {
      localStorage.setItem(YL_DRAFT_KEY, JSON.stringify({
        setType, individuals, saleInfo, outputFmt,
      }));
    } catch (_) {}
  }

  function _clearDraft() {
    try { localStorage.removeItem(YL_DRAFT_KEY); } catch (_) {}
  }

  // ── ライン選択肢取得 ──────────────────────────────────────
  function _lineOptions(selected) {
    const lines = (Store.getDB && Store.getDB('lines')) || [];
    const opts = lines.map(l => {
      const sp = l.species ? `[${l.species}] ` : '';
      const code = l.line_code ? `${l.line_code} ` : '';
      const name = l.line_name || l.bloodline_name || '';
      const lbl = `${sp}${code}${name}`.trim() || l.line_id || '(無名ライン)';
      const sel = l.line_id === selected ? 'selected' : '';
      return `<option value="${_ylEsc(l.line_id)}" ${sel}>${_ylEsc(lbl)}</option>`;
    }).join('');
    return `<option value="">— ラインを選択 —</option>${opts}`;
  }

  function _addIndividual() {
    const u = _ylUid('IND');
    if (setType === 'larva') {
      individuals.push({
        uid: u, kind: 'larva',
        line_id: '', stage: 'L2', weight_g: '', hatch_date: '',
        sex: '', memo: '',
      });
    } else if (setType === 'adult') {
      individuals.push({
        uid: u, kind: 'adult',
        line_id: '', sex: '♂', body_mm: '',
        horn_included: true,
        eclosion_date: '', feeding_date: '', no_feeding_yet: false,
        activity: 'mature',
        condition: '完品', condition_detail: '',
        mating_status: '',
        memo: '',
      });
    }
    return u;
  }

  function _removeIndividual(uid) {
    individuals = individuals.filter(i => i.uid !== uid);
  }

  // ── 公開関数 (onclickから呼べるよう Pages._yl* に登録) ────
  Pages._ylSelectSetType = (type) => {
    setType = type;
    // 種別変更時は個体リストをリセット (種別違いの混在防止)
    individuals = [];
    _addIndividual();
    if (type === 'adult') {
      saleInfo.salePattern = 'pair';
    } else {
      saleInfo.salePattern = 'larva_n';
      saleInfo.soldFormatNum = 1;
    }
    _saveDraft();
    render();
  };

  Pages._ylAddIndividual = () => {
    if (!setType) return;
    // 成虫セットは最大3頭(トリオ)まで
    if (setType === 'adult' && individuals.length >= 3) {
      UI.toast('成虫セットは最大3頭(トリオ)までです', 'error');
      return;
    }
    _addIndividual();
    if (setType === 'larva') saleInfo.soldFormatNum = individuals.length;
    _saveDraft();
    render();
  };

  Pages._ylRemoveIndividual = (uid) => {
    if (individuals.length <= 1) {
      UI.toast('セットには最低1頭が必要です', 'error');
      return;
    }
    _removeIndividual(uid);
    if (setType === 'larva') saleInfo.soldFormatNum = individuals.length;
    _saveDraft();
    render();
  };

  Pages._ylSetIndField = (uid, field, value) => {
    const ind = individuals.find(i => i.uid === uid);
    if (!ind) return;
    ind[field] = value;
    _saveDraft();
  };

  Pages._ylToggleIndField = (uid, field, el) => {
    const ind = individuals.find(i => i.uid === uid);
    if (!ind) return;
    ind[field] = !!(el && el.checked);
    _saveDraft();
  };

  Pages._ylSetSaleInfoField = (field, value) => {
    saleInfo[field] = value;
    _saveDraft();
  };

  Pages._ylSetSalePattern = (p) => {
    saleInfo.salePattern = p;
    if (p === 'single_male' || p === 'single_female') {
      individuals = individuals.slice(0,1);
      if (individuals[0]) individuals[0].sex = (p === 'single_male') ? '♂' : '♀';
    } else if (p === 'pair') {
      while (individuals.length < 2) _addIndividual();
      individuals = individuals.slice(0,2);
      if (individuals[0]) individuals[0].sex = '♂';
      if (individuals[1]) individuals[1].sex = '♀';
    } else if (p === 'trio') {
      while (individuals.length < 3) _addIndividual();
      individuals = individuals.slice(0,3);
      if (individuals[0]) individuals[0].sex = '♂';
      if (individuals[1]) individuals[1].sex = '♀';
      if (individuals[2]) individuals[2].sex = '♀';
    }
    _saveDraft();
    render();
  };

  Pages._ylSetOutputFmt = (fmt) => {
    outputFmt = fmt;
    document.querySelectorAll('.yl-fmt-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.fmt === fmt);
    });
    const htmlPanel  = document.getElementById('yl-out-html');
    const plainPanel = document.getElementById('yl-out-plain');
    if (htmlPanel)  htmlPanel.style.display  = (fmt === 'html')  ? 'block' : 'none';
    if (plainPanel) plainPanel.style.display = (fmt === 'plain') ? 'block' : 'none';
    _saveDraft();
  };

  Pages._ylClearAll = () => {
    if (!confirm('入力中の内容をすべてクリアしますか?')) return;
    setType = '';
    individuals = [];
    saleInfo = {
      soldFormatNum: 1, salePattern: 'larva_n',
      startPrice: '', buynowPrice: '',
      shippingByBuyer: false, shippingMethod: 'ヤマト便',
      extraAppeal: '',
    };
    outputFmt = 'html';
    _clearDraft();
    render();
  };

  Pages._ylBackToTypeSelect = () => {
    if (individuals.length > 0 &&
        !confirm('入力中の内容を破棄してセット種別選択に戻りますか?')) return;
    setType = '';
    individuals = [];
    _clearDraft();
    render();
  };

  // 生成・印刷・コピー・履歴系は後方で定義
  Pages._ylGenerate          = _ylGenerate;
  Pages._ylCopyTitle         = () => _ylCopy('yl-out-title');
  Pages._ylCopyHtml          = () => _ylCopy('yl-out-html-text');
  Pages._ylCopyPlain         = () => _ylCopy('yl-out-plain-text');
  Pages._ylPreviewLabels     = _ylPreviewLabels;
  Pages._ylPrintLabels       = _ylPrintLabels;
  Pages._ylSaveToHistory     = _ylSaveToHistory;
  Pages._ylGoToRefs          = () => routeTo('yahoo-listing-refs');
  Pages._ylGoToNg            = () => routeTo('yahoo-listing-ng');
  Pages._ylGoToHistory       = () => routeTo('yahoo-listing-history');

  // ════════════════════════════════════════════════════════════
  // レンダー
  // ════════════════════════════════════════════════════════════
  function render() {
    if (!setType) {
      _renderTypeSelect();
    } else {
      _renderForm();
    }
  }

  function _renderTypeSelect() {
    const data = _ylLoadStorage();
    const recent = (data.history || []).slice(-5).reverse();

    main.innerHTML = `
      ${UI.header('ヤフオク出品ジェネレーター', { back: true })}
      <style>${_ylInjectCSS()}</style>
      <div class="yl-page">
        <div class="yl-brand">
          <img src="${YL_LOGO_PATH}" alt="HERAKABU MARCHÉ" class="yl-brand-logo" onerror="this.style.display='none'">
          <div class="yl-brand-sub">HERAKABU MARCHÉ — 出品文 AI ジェネレーター</div>
        </div>

        <div class="yl-section-title">◆ セット種別を選択</div>
        <div class="yl-type-grid">
          <button class="yl-type-card" onclick="Pages._ylSelectSetType('larva')">
            <div class="yl-type-icon">🐛</div>
            <div class="yl-type-name">幼虫セット</div>
            <div class="yl-type-desc">L1〜L3の幼虫を1〜複数頭でセット販売</div>
          </button>
          <button class="yl-type-card" onclick="Pages._ylSelectSetType('adult')">
            <div class="yl-type-icon">🪲</div>
            <div class="yl-type-name">成虫セット</div>
            <div class="yl-type-desc">単体(♂/♀)・ペア・トリオでの販売</div>
          </button>
        </div>

        <div class="yl-section-title" style="margin-top:18px">◆ マスタ管理</div>
        <div class="yl-master-grid">
          <button class="yl-master-card" onclick="Pages._ylGoToRefs()">
            📚 参考出品文マスタ
            <div class="yl-master-sub">種親購入時のスクショから血統情報を抽出して保存</div>
          </button>
          <button class="yl-master-card" onclick="Pages._ylGoToNg()">
            ⚠️ NGワード・言い換えマスタ
            <div class="yl-master-sub">ヤフオク規約・自社ルールに沿った表現統一</div>
          </button>
          <button class="yl-master-card" onclick="Pages._ylGoToHistory()">
            📋 生成履歴
            <div class="yl-master-sub">過去に生成した出品文の再利用・再印刷</div>
          </button>
        </div>

        ${recent.length > 0 ? `
          <div class="yl-section-title" style="margin-top:18px">◆ 最近の履歴</div>
          <div>
            ${recent.map(h => `
              <div class="yl-history-item" onclick="routeTo('yahoo-listing-history')">
                <div class="yl-history-title">${_ylEsc(h.title || '(無題)')}</div>
                <div class="yl-history-meta">${_ylEsc(h.created_at)} · ${_ylEsc(h.set_type === 'larva' ? '幼虫' : '成虫')}セット · ${(h.individuals||[]).length}頭</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div style="margin-top:24px;padding:12px;background:rgba(45,122,82,.06);border:1px solid rgba(45,122,82,.18);border-radius:8px;font-size:.78rem;color:var(--text2);line-height:1.6">
          <b>💡 このページについて</b><br>
          要件定義書 v1.0 に基づく手動入力モードです。個体登録未開始でも、ライン情報・親個体情報を参照して
          プロ品質の出品文を Gemini AI で生成できます。発送ラベル(60×30mm) も自動生成されます。
        </div>
      </div>
    `;
  }

  function _renderForm() {
    const data    = _ylLoadStorage();
    const apiKey  = localStorage.getItem(YL_API_KEY_LS) || '';
    const headerLabel = setType === 'larva' ? '🐛 幼虫セット入力' : '🪲 成虫セット入力';

    main.innerHTML = `
      ${UI.header(headerLabel, { back: true, backFn: 'Pages._ylBackToTypeSelect()' })}
      <style>${_ylInjectCSS()}</style>
      <div class="yl-page">

        <!-- セット情報 -->
        <div class="yl-card">
          <div class="yl-card-title">◆ セット情報</div>
          ${_renderSalePatternRow()}
          ${_renderIndividuals()}
          <button class="yl-add-btn" onclick="Pages._ylAddIndividual()"
            ${(setType==='adult' && individuals.length>=3) ? 'disabled' : ''}>
            ＋ ${setType === 'larva' ? '幼虫' : '成虫'}を追加
          </button>
        </div>

        <!-- セット全体情報 -->
        <div class="yl-card">
          <div class="yl-card-title">◆ 価格・発送</div>
          <div class="yl-row2">
            <div class="yl-field">
              <label class="yl-lbl">開始価格 <span class="yl-opt">円</span></label>
              <input class="yl-input" type="number" min="0" step="100"
                value="${_ylEsc(saleInfo.startPrice)}"
                oninput="Pages._ylSetSaleInfoField('startPrice', this.value)"
                placeholder="例: 3000">
            </div>
            <div class="yl-field">
              <label class="yl-lbl">即決価格 <span class="yl-opt">任意・円</span></label>
              <input class="yl-input" type="number" min="0" step="100"
                value="${_ylEsc(saleInfo.buynowPrice)}"
                oninput="Pages._ylSetSaleInfoField('buynowPrice', this.value)"
                placeholder="例: 8000">
            </div>
          </div>
          <div class="yl-row2">
            <div class="yl-field">
              <label class="yl-lbl">送料負担</label>
              <select class="yl-input"
                onchange="Pages._ylSetSaleInfoField('shippingByBuyer', this.value === 'true')">
                <option value="false" ${!saleInfo.shippingByBuyer ? 'selected' : ''}>出品者負担</option>
                <option value="true"  ${ saleInfo.shippingByBuyer ? 'selected' : ''}>落札者負担</option>
              </select>
            </div>
            <div class="yl-field">
              <label class="yl-lbl">発送方法</label>
              <select class="yl-input"
                onchange="Pages._ylSetSaleInfoField('shippingMethod', this.value)">
                ${['ゆうパック','ヤマト便','クロネコゆうパック','ネコポス'].map(m =>
                  `<option ${saleInfo.shippingMethod === m ? 'selected' : ''}>${m}</option>`
                ).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- AIへの追加指示 -->
        <div class="yl-card">
          <div class="yl-card-title">◆ AIへの追加指示</div>
          <div class="yl-field">
            <label class="yl-lbl">アピールポイント・特記事項 <span class="yl-opt">任意・自由記述</span></label>
            <textarea class="yl-input" rows="3"
              oninput="Pages._ylSetSaleInfoField('extraAppeal', this.value)"
              placeholder="例: ♀親はワイドボディ系統、♂親は太角傾向。3令初期で順調な成長中。"
            >${_ylEsc(saleInfo.extraAppeal)}</textarea>
          </div>
        </div>

        <!-- Gemini API キー -->
        <div class="yl-card">
          <div class="yl-card-title">◆ Gemini API キー</div>
          <div class="yl-guide">
            無料で利用可。<a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--green);font-weight:700">aistudio.google.com</a> から取得。<br>
            ※端末に保存され次回から自動入力されます。
          </div>
          <input id="yl-api-key" class="yl-input" type="password"
            placeholder="AIzaSy..."
            value="${_ylEsc(apiKey)}"
            oninput="localStorage.setItem('${YL_API_KEY_LS}', this.value.trim())">
        </div>

        <!-- 生成ボタン -->
        <div style="display:flex;gap:8px;margin-top:14px">
          <button id="yl-gen-btn" class="yl-primary-btn" onclick="Pages._ylGenerate()">
            ✨ AIで出品文を生成
          </button>
          <button class="yl-ghost-btn" onclick="Pages._ylClearAll()">クリア</button>
        </div>
        <div id="yl-spinner" class="yl-spinner" style="display:none">
          <div class="spinner"></div>
          <div>Gemini AIが出品文を作成中... (10〜20秒)</div>
        </div>
        <div id="yl-error" class="yl-error" style="display:none"></div>

        <!-- 出力エリア -->
        <div class="yl-card" id="yl-output-card" style="display:none;margin-top:14px">
          <div class="yl-card-title">📌 商品タイトル</div>
          <textarea id="yl-out-title" class="yl-input" rows="2" style="font-size:.95rem;font-weight:600"
            oninput="(function(el){const c=document.getElementById('yl-title-count');if(c){const l=el.value.length;c.textContent=l+' / 65文字';c.style.color=l>65?'#e05050':l>55?'#c8993a':'#7a7672';}})(this)"
          ></textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
            <span id="yl-title-count" style="font-size:.72rem;color:#7a7672">0 / 65文字</span>
            <button class="yl-ghost-btn yl-btn-sm" onclick="Pages._ylCopyTitle()">📋 コピー</button>
          </div>

          <div class="yl-card-title" style="margin-top:14px">📝 商品説明文</div>
          <div class="yl-fmt-tabs">
            <button class="yl-fmt-btn active" data-fmt="html" onclick="Pages._ylSetOutputFmt('html')">HTML(装飾あり)</button>
            <button class="yl-fmt-btn" data-fmt="plain" onclick="Pages._ylSetOutputFmt('plain')">プレーンテキスト</button>
          </div>
          <div id="yl-out-html" style="display:block">
            <div id="yl-out-html-preview" class="yl-html-preview"></div>
            <textarea id="yl-out-html-text" class="yl-input" rows="10" style="font-family:monospace;font-size:.78rem;margin-top:8px"
              oninput="document.getElementById('yl-out-html-preview').innerHTML=this.value"
            ></textarea>
            <button class="yl-ghost-btn yl-btn-sm" style="margin-top:6px"
              onclick="Pages._ylCopyHtml()">📋 HTMLをコピー</button>
          </div>
          <div id="yl-out-plain" style="display:none">
            <textarea id="yl-out-plain-text" class="yl-input" rows="14"
              style="font-family:inherit;font-size:.85rem;line-height:1.7;white-space:pre-wrap"
            ></textarea>
            <button class="yl-ghost-btn yl-btn-sm" style="margin-top:6px"
              onclick="Pages._ylCopyPlain()">📋 プレーンをコピー</button>
          </div>

          <!-- 発送ラベル -->
          <div class="yl-card-title" style="margin-top:14px">🏷️ 発送ラベル (60×30mm)</div>
          <div id="yl-labels-preview" class="yl-labels-preview"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button class="yl-ghost-btn yl-btn-sm" onclick="Pages._ylPreviewLabels()">👁 プレビュー再描画</button>
            <button class="yl-ghost-btn yl-btn-sm" onclick="Pages._ylPrintLabels()">🖨️ Brother印刷</button>
            <button class="yl-primary-btn yl-btn-sm" onclick="Pages._ylSaveToHistory()">💾 履歴に保存</button>
          </div>
        </div>

      </div>
    `;
  }

  function _renderSalePatternRow() {
    if (setType === 'adult') {
      const opts = [
        { v: 'single_male',   l: '単体 ♂' },
        { v: 'single_female', l: '単体 ♀' },
        { v: 'pair',          l: 'ペア' },
        { v: 'trio',          l: 'トリオ' },
      ];
      return `
        <div class="yl-pattern-row">
          ${opts.map(o => `
            <button class="yl-pattern-btn ${saleInfo.salePattern === o.v ? 'active' : ''}"
              onclick="Pages._ylSetSalePattern('${o.v}')">${o.l}</button>
          `).join('')}
        </div>
      `;
    }
    // 幼虫: N頭セット
    return `
      <div style="font-size:.82rem;color:var(--text2);margin-bottom:8px">
        現在 <b>${individuals.length}</b> 頭の幼虫セット
        <span style="color:var(--text3);font-size:.74rem">(右下「＋追加」で増やせます)</span>
      </div>
    `;
  }

  function _renderIndividuals() {
    if (individuals.length === 0) return '<div style="color:var(--text3);text-align:center;padding:14px">個体を追加してください</div>';
    return individuals.map((ind, idx) => {
      if (ind.kind === 'larva') return _renderLarva(ind, idx);
      if (ind.kind === 'adult') return _renderAdult(ind, idx);
      return '';
    }).join('');
  }

  function _renderLarva(ind, idx) {
    return `
      <div class="yl-ind-card">
        <div class="yl-ind-head">
          <div class="yl-ind-title">◆ 幼虫 #${idx + 1}</div>
          <button class="yl-remove-btn" onclick="Pages._ylRemoveIndividual('${ind.uid}')">✕ 削除</button>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">ライン <span class="yl-req">必須</span></label>
          <select class="yl-input" onchange="Pages._ylSetIndField('${ind.uid}','line_id',this.value)">
            ${_lineOptions(ind.line_id)}
          </select>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">ステージ <span class="yl-req">必須</span></label>
          <div class="yl-radio-group">
            ${['L1','L2','L3'].map(s => `
              <label class="yl-radio ${ind.stage === s ? 'checked' : ''}">
                <input type="radio" name="larva-stage-${ind.uid}" value="${s}"
                  ${ind.stage === s ? 'checked' : ''}
                  onchange="Pages._ylSetIndField('${ind.uid}','stage',this.value);this.parentElement.parentElement.querySelectorAll('.yl-radio').forEach(r=>r.classList.remove('checked'));this.parentElement.classList.add('checked')">
                <span>${s}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="yl-row2">
          <div class="yl-field">
            <label class="yl-lbl">体重 <span class="yl-req">必須</span></label>
            <div class="yl-input-unit">
              <input class="yl-input" type="number" min="0" step="0.1"
                value="${_ylEsc(ind.weight_g)}"
                oninput="Pages._ylSetIndField('${ind.uid}','weight_g',this.value)"
                placeholder="0">
              <span class="yl-unit">g</span>
            </div>
          </div>
          <div class="yl-field">
            <label class="yl-lbl">孵化日 <span class="yl-req">必須</span></label>
            <input class="yl-input" type="date"
              value="${_ylEsc(ind.hatch_date)}"
              onchange="Pages._ylSetIndField('${ind.uid}','hatch_date',this.value)">
          </div>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">性別 <span class="yl-opt">判明している場合のみ</span></label>
          <div class="yl-radio-group">
            ${[{v:'♂',l:'♂'},{v:'♀',l:'♀'},{v:'',l:'未判別'}].map(o => `
              <label class="yl-radio ${ind.sex === o.v ? 'checked' : ''}">
                <input type="radio" name="larva-sex-${ind.uid}" value="${o.v}"
                  ${ind.sex === o.v ? 'checked' : ''}
                  onchange="Pages._ylSetIndField('${ind.uid}','sex',this.value);this.parentElement.parentElement.querySelectorAll('.yl-radio').forEach(r=>r.classList.remove('checked'));this.parentElement.classList.add('checked')">
                <span>${o.l}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">個体アピールメモ <span class="yl-opt">任意</span></label>
          <textarea class="yl-input" rows="2"
            oninput="Pages._ylSetIndField('${ind.uid}','memo',this.value)"
            placeholder="例: 兄弟最大、太角傾向"
          >${_ylEsc(ind.memo)}</textarea>
        </div>
      </div>
    `;
  }

  function _renderAdult(ind, idx) {
    return `
      <div class="yl-ind-card">
        <div class="yl-ind-head">
          <div class="yl-ind-title">◆ 成虫 #${idx + 1}</div>
          <button class="yl-remove-btn" onclick="Pages._ylRemoveIndividual('${ind.uid}')">✕ 削除</button>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">ライン <span class="yl-req">必須</span></label>
          <select class="yl-input" onchange="Pages._ylSetIndField('${ind.uid}','line_id',this.value)">
            ${_lineOptions(ind.line_id)}
          </select>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">性別 <span class="yl-req">必須</span></label>
          <div class="yl-radio-group">
            ${[{v:'♂',l:'♂'},{v:'♀',l:'♀'}].map(o => `
              <label class="yl-radio ${ind.sex === o.v ? 'checked' : ''}">
                <input type="radio" name="adult-sex-${ind.uid}" value="${o.v}"
                  ${ind.sex === o.v ? 'checked' : ''}
                  onchange="Pages._ylSetIndField('${ind.uid}','sex',this.value);this.parentElement.parentElement.querySelectorAll('.yl-radio').forEach(r=>r.classList.remove('checked'));this.parentElement.classList.add('checked')">
                <span>${o.l}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="yl-row2">
          <div class="yl-field">
            <label class="yl-lbl">体長 <span class="yl-req">必須</span></label>
            <div class="yl-input-unit">
              <input class="yl-input" type="number" min="0" step="0.1"
                value="${_ylEsc(ind.body_mm)}"
                oninput="Pages._ylSetIndField('${ind.uid}','body_mm',this.value)"
                placeholder="0">
              <span class="yl-unit">mm</span>
            </div>
          </div>
          <div class="yl-field" ${ind.sex !== '♂' ? 'style="opacity:.4;pointer-events:none"' : ''}>
            <label class="yl-lbl">頭角</label>
            <div class="yl-radio-group">
              <label class="yl-radio ${ind.horn_included ? 'checked' : ''}">
                <input type="radio" name="adult-horn-${ind.uid}" ${ind.horn_included ? 'checked' : ''}
                  onchange="Pages._ylSetIndField('${ind.uid}','horn_included',true);this.parentElement.parentElement.querySelectorAll('.yl-radio').forEach(r=>r.classList.remove('checked'));this.parentElement.classList.add('checked')">
                <span>含む</span>
              </label>
              <label class="yl-radio ${!ind.horn_included ? 'checked' : ''}">
                <input type="radio" name="adult-horn-${ind.uid}" ${!ind.horn_included ? 'checked' : ''}
                  onchange="Pages._ylSetIndField('${ind.uid}','horn_included',false);this.parentElement.parentElement.querySelectorAll('.yl-radio').forEach(r=>r.classList.remove('checked'));this.parentElement.classList.add('checked')">
                <span>除く</span>
              </label>
            </div>
          </div>
        </div>
        <div class="yl-row2">
          <div class="yl-field">
            <label class="yl-lbl">羽化日 <span class="yl-req">必須</span></label>
            <input class="yl-input" type="date"
              value="${_ylEsc(ind.eclosion_date)}"
              onchange="Pages._ylSetIndField('${ind.uid}','eclosion_date',this.value)">
          </div>
          <div class="yl-field">
            <label class="yl-lbl">後食開始日 <span class="yl-opt">任意</span></label>
            <input class="yl-input" type="date"
              value="${_ylEsc(ind.feeding_date)}"
              ${ind.no_feeding_yet ? 'disabled' : ''}
              onchange="Pages._ylSetIndField('${ind.uid}','feeding_date',this.value)">
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:.82rem;color:var(--text2);margin-top:-4px;margin-bottom:10px;cursor:pointer">
          <input type="checkbox" ${ind.no_feeding_yet ? 'checked' : ''}
            onchange="Pages._ylToggleIndField('${ind.uid}','no_feeding_yet',this);if(this.checked){Pages._ylSetIndField('${ind.uid}','feeding_date','');}">
          まだ後食していない (未後食)
        </label>
        <div class="yl-field">
          <label class="yl-lbl">活動状況</label>
          <div class="yl-radio-group">
            ${[{v:'pre_mature',l:'未成熟'},{v:'mature',l:'成熟・活動中'},{v:'dormant',l:'休眠中'}].map(o => `
              <label class="yl-radio ${ind.activity === o.v ? 'checked' : ''}">
                <input type="radio" name="adult-act-${ind.uid}" value="${o.v}"
                  ${ind.activity === o.v ? 'checked' : ''}
                  onchange="Pages._ylSetIndField('${ind.uid}','activity',this.value);this.parentElement.parentElement.querySelectorAll('.yl-radio').forEach(r=>r.classList.remove('checked'));this.parentElement.classList.add('checked')">
                <span>${o.l}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">状態</label>
          <select class="yl-input"
            onchange="Pages._ylSetIndField('${ind.uid}','condition',this.value)">
            ${['完品','フセツ欠け','ディンプル有','その他'].map(c =>
              `<option ${ind.condition === c ? 'selected' : ''}>${c}</option>`
            ).join('')}
          </select>
          ${ind.condition !== '完品' ? `
            <input class="yl-input" type="text" style="margin-top:6px"
              value="${_ylEsc(ind.condition_detail)}"
              oninput="Pages._ylSetIndField('${ind.uid}','condition_detail',this.value)"
              placeholder="欠け箇所等の詳細">
          ` : ''}
        </div>
        ${ind.sex === '♀' ? `
          <div class="yl-field">
            <label class="yl-lbl">交尾状況 <span class="yl-opt">♀のみ</span></label>
            <div class="yl-radio-group">
              ${[{v:'unmated',l:'未交尾'},{v:'mated',l:'交尾済み'},{v:'unknown',l:'不明'}].map(o => `
                <label class="yl-radio ${ind.mating_status === o.v ? 'checked' : ''}">
                  <input type="radio" name="adult-mate-${ind.uid}" value="${o.v}"
                    ${ind.mating_status === o.v ? 'checked' : ''}
                    onchange="Pages._ylSetIndField('${ind.uid}','mating_status',this.value);this.parentElement.parentElement.querySelectorAll('.yl-radio').forEach(r=>r.classList.remove('checked'));this.parentElement.classList.add('checked')">
                  <span>${o.l}</span>
                </label>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div class="yl-field">
          <label class="yl-lbl">個体アピールメモ <span class="yl-opt">任意</span></label>
          <textarea class="yl-input" rows="2"
            oninput="Pages._ylSetIndField('${ind.uid}','memo',this.value)"
            placeholder="例: ボディの艶が良い、赤みが強い"
          >${_ylEsc(ind.memo)}</textarea>
        </div>
      </div>
    `;
  }

  // ════════════════════════════════════════════════════════════
  // 生成処理
  // ════════════════════════════════════════════════════════════
  async function _ylGenerate() {
    // バリデーション
    if (!individuals.length) {
      UI.toast('個体を追加してください', 'error');
      return;
    }
    for (let i = 0; i < individuals.length; i++) {
      const ind = individuals[i];
      if (!ind.line_id) {
        UI.toast(`#${i + 1} のラインを選択してください`, 'error');
        return;
      }
      if (ind.kind === 'larva') {
        if (!ind.weight_g || !ind.hatch_date) {
          UI.toast(`#${i + 1} の体重・孵化日を入力してください`, 'error');
          return;
        }
      } else if (ind.kind === 'adult') {
        if (!ind.body_mm || !ind.eclosion_date) {
          UI.toast(`#${i + 1} の体長・羽化日を入力してください`, 'error');
          return;
        }
      }
    }

    const apiKey = (localStorage.getItem(YL_API_KEY_LS) || '').trim();
    if (!apiKey) {
      UI.toast('Gemini API キーを入力してください', 'error');
      const k = document.getElementById('yl-api-key');
      if (k) k.focus();
      return;
    }

    const btn     = document.getElementById('yl-gen-btn');
    const spinner = document.getElementById('yl-spinner');
    const errBox  = document.getElementById('yl-error');
    const outCard = document.getElementById('yl-output-card');
    if (btn)     btn.disabled = true;
    if (spinner) spinner.style.display = 'flex';
    if (errBox)  errBox.style.display  = 'none';

    try {
      const ctx = _buildPromptContext();
      const prompt = _buildPrompt(ctx);
      const json = await _callGemini(prompt, apiKey);
      _renderGeneratedOutput(json, ctx);
      if (outCard) outCard.style.display = 'block';
      _ylPreviewLabels();
      UI.toast('生成完了 ✅', 'success');
      // 出力エリアまでスクロール
      setTimeout(() => {
        const el = document.getElementById('yl-output-card');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    } catch (e) {
      console.error('[YL] generate failed', e);
      if (errBox) {
        errBox.textContent = '⚠️ 生成失敗: ' + (e.message || String(e))
          + (String(e.message||'').includes('API_KEY') || String(e.message||'').includes('400')
              ? '\n→ API キーを確認してください' : '');
        errBox.style.display = 'block';
      }
    } finally {
      if (btn)     btn.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  }

  // ── プロンプト用コンテキスト構築 ──────────────────────────
  function _buildPromptContext() {
    const lines    = (Store.getDB && Store.getDB('lines'))    || [];
    const parents  = (Store.getDB && Store.getDB('parents'))  || [];
    const pairings = (Store.getDB && Store.getDB('pairings')) || [];
    const data     = _ylLoadStorage();
    const refsAll  = data.references || [];

    const indCtx = individuals.map((ind, idx) => {
      const line = lines.find(l => l.line_id === ind.line_id) || {};
      // ペアリングから親♂♀を引く (line_id一致のうち最新)
      const pair = pairings
        .filter(p => p.line_id === ind.line_id)
        .sort((a,b) => String(b.pairing_start||'').localeCompare(String(a.pairing_start||'')))[0];
      const father = pair ? parents.find(p => p.par_id === pair.father_par_id) : null;
      const mother = pair ? parents.find(p => p.par_id === pair.mother_par_id) : null;

      // 参考出品文 (line_id一致)
      const refs = refsAll.filter(r => r.line_id === ind.line_id);

      return {
        idx: idx + 1,
        kind: ind.kind,
        line: {
          line_code:    line.line_code   || '',
          line_name:    line.line_name   || line.bloodline_name || '',
          species:      line.species     || 'ヘラクレスオオカブト',
          origin:       line.origin      || line.locality || '',
          memo:         line.memo        || '',
        },
        father: father ? {
          size_mm:       father.size_mm  || '',
          paternal_raw:  father.paternal_raw || '',
          maternal_raw:  father.maternal_raw || '',
          memo:          father.memo     || '',
        } : null,
        mother: mother ? {
          size_mm:       mother.size_mm  || '',
          paternal_raw:  mother.paternal_raw || '',
          maternal_raw:  mother.maternal_raw || '',
          memo:          mother.memo     || '',
        } : null,
        refs,
        ind, // そのまま
      };
    });

    return {
      setType,
      individuals: indCtx,
      saleInfo,
      ngWords:   data.ng_words  || [],
      templates: data.templates || YL_DEFAULT_TEMPLATES,
    };
  }

  function _buildPrompt(ctx) {
    const STAGE_LABEL = { L1:'1令', L2:'2令', L3:'3令' };
    const ACT_LABEL   = { pre_mature:'未成熟', mature:'成熟・活動中', dormant:'休眠中' };
    const MATE_LABEL  = { unmated:'未交尾', mated:'交尾済み', unknown:'不明' };
    const isLarva     = ctx.setType === 'larva';

    // 個体情報整形
    const indLines = ctx.individuals.map(ic => {
      const ind = ic.ind;
      if (ind.kind === 'larva') {
        return `[幼虫#${ic.idx}] ライン:${ic.line.line_code} ${ic.line.line_name} / ${STAGE_LABEL[ind.stage]||ind.stage} / 体重${ind.weight_g}g / 孵化${ind.hatch_date}${ind.sex?' / '+ind.sex:''}${ind.memo?' / メモ:'+ind.memo:''}`;
      }
      const cond = ind.condition === '完品' ? '完品' : `${ind.condition}${ind.condition_detail?'('+ind.condition_detail+')':''}`;
      const feeding = ind.no_feeding_yet ? '未後食' : (ind.feeding_date || '');
      const horn = ind.sex === '♂' ? `頭角${ind.horn_included?'含む':'除く'}` : '';
      const mate = ind.sex === '♀' && ind.mating_status ? `交尾:${MATE_LABEL[ind.mating_status]||ind.mating_status}` : '';
      return `[成虫#${ic.idx}] ライン:${ic.line.line_code} ${ic.line.line_name} / ${ind.sex} ${ind.body_mm}mm${horn?'('+horn+')':''} / 羽化${ind.eclosion_date}${feeding?' / 後食:'+feeding:''} / ${ACT_LABEL[ind.activity]||ind.activity} / ${cond}${mate?' / '+mate:''}${ind.memo?' / メモ:'+ind.memo:''}`;
    }).join('\n');

    // 親情報整形 (重複ライン排除)
    const seenLines = new Set();
    const parentBlocks = [];
    ctx.individuals.forEach(ic => {
      if (seenLines.has(ic.line.line_code || ic.line.line_name)) return;
      seenLines.add(ic.line.line_code || ic.line.line_name);
      const f = ic.father, m = ic.mother;
      const lineMemo = ic.line.memo ? `\n  ライン背景: ${ic.line.memo}` : '';
      const fInfo = f ? `\n  ♂親: ${f.size_mm?f.size_mm+'mm':''} ${f.paternal_raw?'(父系: '+f.paternal_raw+')':''}${f.memo?' メモ:'+f.memo:''}` : '';
      const mInfo = m ? `\n  ♀親: ${m.size_mm?m.size_mm+'mm':''} ${m.maternal_raw?'(母系: '+m.maternal_raw+')':''}${m.memo?' メモ:'+m.memo:''}` : '';
      parentBlocks.push(`[ライン: ${ic.line.line_code} ${ic.line.line_name} / ${ic.line.species}${ic.line.origin?' / '+ic.line.origin:''}]${lineMemo}${fInfo}${mInfo}`);
    });

    // 参考出品文 (line別最大1件、テキストの先頭500文字まで)
    const refBlocks = [];
    const usedLines = new Set();
    ctx.individuals.forEach(ic => {
      if (usedLines.has(ic.line.line_code)) return;
      const ref = (ic.refs || [])[0];
      if (ref) {
        usedLines.add(ic.line.line_code);
        const txt = String(ref.raw_text || ref.notes || '').slice(0, 500);
        if (txt) refBlocks.push(`[参考(${ic.line.line_code}): ${txt}]`);
      }
    });

    // 販売形態ラベル
    let pattern = '';
    if (ctx.saleInfo.salePattern === 'single_male')   pattern = '単体販売 (♂)';
    if (ctx.saleInfo.salePattern === 'single_female') pattern = '単体販売 (♀)';
    if (ctx.saleInfo.salePattern === 'pair')          pattern = 'ペア販売';
    if (ctx.saleInfo.salePattern === 'trio')          pattern = 'トリオ販売';
    if (ctx.saleInfo.salePattern === 'larva_n')       pattern = `${ctx.individuals.length}頭セット`;

    // NGワード整形
    const ngLine = (ctx.ngWords || []).map(w =>
      `「${w.ng}」→「${w.reword || '使用しない'}」 (${w.reason||''})`
    ).join(', ');

    return `あなたはヘラクレスオオカブトの繁殖個体をヤフオクで販売するプロ出品者(HERAKABU MARCHÉ)です。
購入希望者の購買意欲を高める、誠実かつ魅力的な出品文を作成してください。
ヤフオクガイドラインに違反する表現は避けてください。

━━━ NGワード/言い換え (厳守) ━━━
${ngLine || '(なし)'}

━━━ 出品情報 ━━━
販売形態: ${pattern}
セット種別: ${isLarva ? '幼虫セット' : '成虫セット'}

【ライン情報】
${parentBlocks.join('\n\n')}

【出品個体】
${indLines}

${refBlocks.length ? '【参考出品文 (種親購入時)】\n' + refBlocks.join('\n\n') + '\n' : ''}
${ctx.saleInfo.extraAppeal ? '【出品者アピール (必ず本文に盛り込む)】\n' + ctx.saleInfo.extraAppeal + '\n' : ''}

━━━ 出力フォーマット (厳守) ━━━
以下の純粋なJSON形式のみで返してください。マークダウンのコードブロック(\\\`\\\`\\\`)などの装飾は付けないでください。

{
  "title": "(商品タイトル。ヤフオク制限65文字以内。種名・販売形態・サイズ要点・血統要点を簡潔に)",
  "body_html": "(HTML装飾付きの商品説明文。<h3><p><ul><li><b>等を使い読みやすく整形。出品個体の魅力・血統価値を強調。最後に注意事項と発送について。)",
  "body_plain": "(プレーンテキスト版の商品説明文。HTMLタグなし、改行と記号で読みやすく整形。)",
  "appeal_summary": "(購買意欲を高める短い要約。ラベル裏や発送メッセージに転用可。50字以内。)"
}`;
  }

  async function _callGemini(prompt, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${YL_GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:    0.85,
          maxOutputTokens: 4096,
          topP:            0.92,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err && err.error && err.error.message) || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const text = (data && data.candidates && data.candidates[0] &&
                  data.candidates[0].content && data.candidates[0].content.parts &&
                  data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
    if (!text) throw new Error('Gemini レスポンスが空でした');

    // JSON抽出 (Gemini が稀に ```json ``` に包んでくる対策)
    let jsonStr = text.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence) jsonStr = fence[1].trim();
    try {
      const obj = JSON.parse(jsonStr);
      return obj;
    } catch (e) {
      // 最終手段: 中括弧範囲だけを切り出して再試行
      const m = jsonStr.match(/\{[\s\S]*\}/);
      if (m) {
        try { return JSON.parse(m[0]); } catch (_) {}
      }
      throw new Error('Gemini レスポンスの JSON パースに失敗しました');
    }
  }

  // 出力描画
  function _renderGeneratedOutput(json, ctx) {
    const titleEl    = document.getElementById('yl-out-title');
    const htmlPrev   = document.getElementById('yl-out-html-preview');
    const htmlText   = document.getElementById('yl-out-html-text');
    const plainText  = document.getElementById('yl-out-plain-text');
    const titleCount = document.getElementById('yl-title-count');

    const title  = (json.title || '').trim();
    const html   = (json.body_html || '').trim();
    const plain  = (json.body_plain || '').trim();
    const ctxFooter = _buildFixedFooter(ctx, 'plain');
    const ctxFooterHtml = _buildFixedFooter(ctx, 'html');

    if (titleEl)   titleEl.value = title;
    if (titleCount) {
      const l = title.length;
      titleCount.textContent = l + ' / 65文字';
      titleCount.style.color = l > 65 ? '#e05050' : l > 55 ? '#c8993a' : '#7a7672';
    }
    const htmlFull  = html  + (html  ? '<hr style="border:none;border-top:1px dashed #aaa;margin:14px 0">' : '') + ctxFooterHtml;
    const plainFull = plain + (plain ? '\n\n────────\n' : '') + ctxFooter;

    if (htmlPrev)  htmlPrev.innerHTML  = htmlFull;
    if (htmlText)  htmlText.value      = htmlFull;
    if (plainText) plainText.value     = plainFull;

    // 履歴保存用にステート保持
    window.__ylLastGenerated = {
      title, body_html: htmlFull, body_plain: plainFull,
      appeal_summary: json.appeal_summary || '',
      ctx, generated_at: _ylDateLabel(),
    };
  }

  function _buildFixedFooter(ctx, fmt) {
    const t = ctx.templates || YL_DEFAULT_TEMPLATES;
    const sf = ctx.saleInfo || {};
    const shipping = `${t.shipping}\n・送料: ${sf.shippingByBuyer ? '落札者負担' : '出品者負担'} (${sf.shippingMethod})`;
    if (fmt === 'plain') {
      return [shipping, t.terms, t.seller].filter(Boolean).join('\n\n');
    }
    // html
    const escNl = (s) => _ylEsc(s).replace(/\n/g, '<br>');
    return `<h3 style="font-size:.95rem;margin-top:14px">📦 発送・お支払いについて</h3>
<p style="line-height:1.7">${escNl(shipping)}</p>
<h3 style="font-size:.95rem;margin-top:14px">⚠️ ご注意ください</h3>
<p style="line-height:1.7">${escNl(t.terms)}</p>
<p style="line-height:1.7;margin-top:10px;color:#5a5a5a">${escNl(t.seller)}</p>`;
  }

  // ── コピー処理 ────────────────────────────────────────
  function _ylCopy(elId) {
    const el = document.getElementById(elId);
    if (!el || !el.value) {
      UI.toast('テキストが空です', 'error');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(el.value).then(
        () => UI.toast('コピーしました 📋', 'success'),
        () => { el.select(); document.execCommand('copy'); UI.toast('コピーしました 📋', 'success'); }
      );
    } else {
      el.select();
      try { document.execCommand('copy'); UI.toast('コピーしました 📋', 'success'); }
      catch (_) { UI.toast('コピー失敗', 'error'); }
    }
  }

  // ════════════════════════════════════════════════════════════
  // 発送ラベル (60×30mm) — HERAKABU MARCHÉ ブランド準拠
  // ════════════════════════════════════════════════════════════
  function _ylBuildLabelHTML(ind, ctx) {
    const ic = ctx.individuals.find(c => c.ind.uid === ind.uid) || ctx.individuals[0];
    const line = ic.line || {};
    const sp   = line.species || 'ヘラクレスオオカブト';
    const origin = line.origin || '';
    const titleStr = `${sp}${origin ? ' ' + origin + '産' : ''}`;
    // 種親
    const f = ic.father, m = ic.mother;
    const fStr = f ? `${f.size_mm || '__'}mm${f.paternal_raw ? ' (' + String(f.paternal_raw).slice(0, 60) + ')' : ''}` : '__mm';
    const mStr = m ? `${m.size_mm || '__'}mm${m.maternal_raw ? ' (' + String(m.maternal_raw).slice(0, 60) + ')' : ''}` : '__mm';
    // 孵化日 / 羽化日
    const hatchDateRaw = ind.hatch_date || ind.eclosion_date || '';
    const dateLabel = ind.kind === 'larva' ? '◆孵化日' : '◆羽化日';
    const dateStr = _ylJunMonthLabel(hatchDateRaw);
    const sex = ind.sex || '';
    // 文字長に応じたフォントサイズ自動調整
    const fStrLen = fStr.length, mStrLen = mStr.length;
    const padFontSize = Math.max(fStrLen, mStrLen) > 50 ? '4px' : Math.max(fStrLen, mStrLen) > 35 ? '4.5px' : Math.max(fStrLen, mStrLen) > 25 ? '5.5px' : '6.5px';

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page { size: 60mm 30mm; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:60mm; height:30mm; font-family: 'Noto Sans JP','Hiragino Kaku Gothic ProN', sans-serif; background:#fff; color:#000; overflow:hidden; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  .yl-label { width:60mm; height:30mm; position:relative; padding:1.5mm 2mm 1mm; box-sizing:border-box; }
  .yl-l-title { font-size:9px; font-weight:700; line-height:1.1; padding-right:8mm; }
  .yl-l-sex { position:absolute; top:1.2mm; right:1.5mm; font-size:11px; font-weight:900; line-height:1; color:#000; }
  .yl-l-section { font-size:6px; font-weight:700; margin-top:1mm; line-height:1.2; }
  .yl-l-pair { font-size:${padFontSize}; line-height:1.25; padding-left:1mm; }
  .yl-l-pair .lbl { display:inline-block; width:3mm; font-weight:700; }
  .yl-l-date { font-size:6.5px; font-weight:700; padding-left:1mm; }
  .yl-l-logo { position:absolute; bottom:0.3mm; right:1.2mm; width:14mm; height:9mm; opacity:0.85; }
  .yl-l-logo img { width:100%; height:100%; object-fit:contain; }
</style></head><body>
<div class="yl-label">
  ${sex ? `<div class="yl-l-sex">${sex}</div>` : ''}
  <div class="yl-l-title">${_ylEsc(titleStr)}</div>
  <div class="yl-l-section">◆種親</div>
  <div class="yl-l-pair"><span class="lbl">♂</span>${_ylEsc(fStr)}</div>
  <div class="yl-l-pair"><span class="lbl">♀</span>${_ylEsc(mStr)}</div>
  <div class="yl-l-section" style="margin-top:0.8mm">${dateLabel}</div>
  <div class="yl-l-date">${_ylEsc(dateStr || '__/__ /__')}</div>
  <div class="yl-l-logo"><img src="${YL_LOGO_PATH}" alt="HERAKABU MARCHÉ"></div>
</div>
</body></html>`;
  }

  function _ylPreviewLabels() {
    const ctx = window.__ylLastGenerated && window.__ylLastGenerated.ctx
              ? window.__ylLastGenerated.ctx
              : _buildPromptContext();
    const wrap = document.getElementById('yl-labels-preview');
    if (!wrap) return;
    wrap.innerHTML = '';
    individuals.forEach((ind) => {
      const html = _ylBuildLabelHTML(ind, ctx);
      const iframe = document.createElement('iframe');
      iframe.className = 'yl-label-iframe';
      iframe.style.width  = '60mm';
      iframe.style.height = '30mm';
      iframe.style.border = '1px solid #ccc';
      iframe.style.background = '#fff';
      iframe.style.transform = 'scale(1.4)';
      iframe.style.transformOrigin = 'top left';
      iframe.style.marginRight = '8mm';
      iframe.style.marginBottom = '14mm';
      iframe.srcdoc = html;
      wrap.appendChild(iframe);
    });
  }

  function _ylPrintLabels() {
    if (!individuals.length) {
      UI.toast('ラベル対象がありません', 'error');
      return;
    }
    const ctx = window.__ylLastGenerated && window.__ylLastGenerated.ctx
              ? window.__ylLastGenerated.ctx
              : _buildPromptContext();
    // 印刷ウィンドウを開いて全ラベルを縦列で配置 (Brother QL-820NWB は連続印刷可)
    const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Yahoo Listing Labels</title>
<style>
  @page { size: 60mm 30mm; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#fff; }
  .label-page { width:60mm; height:30mm; page-break-after:always; }
  .label-page:last-child { page-break-after:auto; }
  iframe { width:60mm; height:30mm; border:none; display:block; }
</style></head><body>
${individuals.map((ind, i) => `
  <div class="label-page" id="lp-${i}"></div>
`).join('')}
<script>
  const labels = ${JSON.stringify(individuals.map(ind => _ylBuildLabelHTML(ind, ctx)))};
  labels.forEach((html, i) => {
    const host = document.getElementById('lp-' + i);
    host.innerHTML = html;
  });
  setTimeout(() => window.print(), 600);
<\/script>
</body></html>`;
    const w = window.open('', '_blank', 'width=400,height=400');
    if (!w) {
      UI.toast('ポップアップがブロックされました', 'error');
      return;
    }
    w.document.write(printHtml);
    w.document.close();
  }

  // ── 履歴保存 ────────────────────────────────────────────
  function _ylSaveToHistory() {
    if (!window.__ylLastGenerated) {
      UI.toast('まず出品文を生成してください', 'error');
      return;
    }
    const data = _ylLoadStorage();
    const entry = {
      id: _ylUid('YH'),
      created_at:    _ylDateLabel(),
      set_type:      setType,
      individuals:   individuals.slice(),
      sale_info:     Object.assign({}, saleInfo),
      title:         window.__ylLastGenerated.title,
      body_html:     window.__ylLastGenerated.body_html,
      body_plain:    window.__ylLastGenerated.body_plain,
      appeal_summary: window.__ylLastGenerated.appeal_summary,
    };
    data.history = data.history || [];
    data.history.push(entry);
    // 履歴は直近50件のみ保持
    if (data.history.length > 50) data.history = data.history.slice(-50);
    if (_ylSaveStorage(data)) {
      UI.toast('履歴に保存しました 💾', 'success');
    } else {
      UI.toast('履歴の保存に失敗しました', 'error');
    }
  }

  // 初回レンダー
  render();
};

// ════════════════════════════════════════════════════════════════
// CSS (共通)
// ════════════════════════════════════════════════════════════════
function _ylInjectCSS() {
  return `
    .yl-page { max-width:760px; margin:0 auto; padding:8px 12px 60px; }
    .yl-brand { text-align:center; padding:10px 0 16px; border-bottom:1px solid var(--border); }
    .yl-brand-logo { width:64px; height:64px; opacity:.92; }
    .yl-brand-sub { font-size:.78rem; letter-spacing:.1em; color:var(--text2); margin-top:4px; font-weight:500; }
    .yl-section-title { font-family:'Noto Serif JP',serif; font-weight:700; font-size:1rem;
      color:var(--text); margin:14px 0 8px; padding-left:2px; }
    .yl-type-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .yl-type-card { background:var(--bg2); border:1px solid var(--border); border-radius:8px;
      padding:18px 12px; cursor:pointer; transition:.15s; text-align:center; font-family:inherit; color:var(--text); }
    .yl-type-card:hover { background:var(--bg3); border-color:var(--green); transform:translateY(-1px); }
    .yl-type-icon { font-size:2.4rem; line-height:1; margin-bottom:6px; }
    .yl-type-name { font-family:'Noto Serif JP',serif; font-weight:700; font-size:1.05rem; margin-bottom:3px; }
    .yl-type-desc { font-size:.74rem; color:var(--text3); line-height:1.4; }
    .yl-master-grid { display:grid; grid-template-columns:1fr; gap:8px; }
    .yl-master-card { background:var(--bg2); border:1px solid var(--border); border-radius:6px;
      padding:10px 12px; cursor:pointer; text-align:left; font-family:inherit; color:var(--text); font-size:.88rem; font-weight:600; }
    .yl-master-card:hover { background:var(--bg3); }
    .yl-master-sub { font-size:.7rem; color:var(--text3); font-weight:400; margin-top:2px; line-height:1.4; }
    .yl-history-item { padding:8px 10px; border-bottom:1px solid var(--border); cursor:pointer; transition:.1s; }
    .yl-history-item:hover { background:var(--bg2); }
    .yl-history-title { font-size:.84rem; font-weight:600; color:var(--text); }
    .yl-history-meta { font-size:.7rem; color:var(--text3); margin-top:2px; }
    .yl-card { background:var(--bg2); border:1px solid var(--border); border-radius:8px;
      padding:12px 14px; margin-top:10px; }
    .yl-card-title { font-family:'Noto Serif JP',serif; font-weight:700; font-size:.92rem;
      color:var(--text); margin-bottom:10px; }
    .yl-pattern-row { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
    .yl-pattern-btn { flex:1; min-width:64px; padding:8px 6px; border:1px solid var(--border);
      background:var(--bg3); color:var(--text2); border-radius:6px; cursor:pointer;
      font-family:inherit; font-size:.82rem; font-weight:600; transition:.15s; }
    .yl-pattern-btn.active { background:var(--text); color:var(--bg2); border-color:var(--text); }
    .yl-ind-card { background:var(--bg3); border:1px solid var(--border); border-radius:6px;
      padding:10px 12px; margin-bottom:10px; }
    .yl-ind-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;
      padding-bottom:6px; border-bottom:1px dashed var(--border); }
    .yl-ind-title { font-family:'Noto Serif JP',serif; font-weight:600; font-size:.86rem; color:var(--gold,#c8993a); }
    .yl-remove-btn { background:transparent; border:none; color:#e06050; font-size:.74rem; cursor:pointer;
      padding:3px 8px; border-radius:4px; font-family:inherit; }
    .yl-remove-btn:hover { background:rgba(224,96,80,.12); }
    .yl-add-btn { width:100%; padding:10px; background:transparent; border:1px dashed var(--green);
      border-radius:6px; color:var(--green); font-family:inherit; font-size:.86rem; font-weight:600;
      cursor:pointer; transition:.15s; }
    .yl-add-btn:hover { background:rgba(45,122,82,.06); border-style:solid; }
    .yl-add-btn:disabled { opacity:.4; cursor:not-allowed; }
    .yl-field { margin-bottom:10px; }
    .yl-lbl { display:block; font-size:.74rem; font-weight:700; color:var(--text2); margin-bottom:3px; }
    .yl-req { display:inline-block; background:#e06060; color:#fff; font-size:.62rem;
      padding:1px 6px; border-radius:3px; margin-left:4px; font-weight:700; }
    .yl-opt { display:inline-block; color:var(--text3); font-size:.68rem; margin-left:4px; font-weight:400; }
    .yl-input { width:100%; padding:8px 10px; background:var(--bg3); border:1px solid var(--border);
      border-radius:5px; color:var(--text); font-family:inherit; font-size:.86rem; }
    .yl-input:focus { outline:none; border-color:var(--green); }
    .yl-row2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .yl-input-unit { position:relative; }
    .yl-input-unit .yl-input { padding-right:26px; }
    .yl-input-unit .yl-unit { position:absolute; right:10px; top:50%; transform:translateY(-50%);
      font-size:.7rem; color:var(--text3); pointer-events:none; }
    .yl-radio-group { display:flex; gap:0; border:1px solid var(--border); border-radius:5px; overflow:hidden; background:var(--bg3); }
    .yl-radio { flex:1; text-align:center; padding:7px 4px; font-size:.8rem; cursor:pointer;
      border-right:1px solid var(--border); color:var(--text2); transition:.15s; user-select:none; }
    .yl-radio:last-child { border-right:none; }
    .yl-radio.checked { background:var(--text); color:var(--bg2); font-weight:700; }
    .yl-radio input { display:none; }
    .yl-guide { background:rgba(45,122,82,.08); border:1px solid rgba(45,122,82,.18);
      border-radius:5px; padding:8px 10px; font-size:.74rem; color:var(--text2);
      line-height:1.6; margin-bottom:8px; }
    .yl-primary-btn { flex:1; padding:13px 16px; background:var(--text); color:var(--bg);
      border:none; border-radius:6px; font-family:'Noto Serif JP',serif; font-size:.95rem; font-weight:700;
      letter-spacing:.05em; cursor:pointer; transition:.15s; }
    .yl-primary-btn:hover { background:var(--gold,#c8993a); }
    .yl-primary-btn:disabled { opacity:.5; cursor:not-allowed; }
    .yl-ghost-btn { padding:11px 14px; background:transparent; border:1px solid var(--border);
      border-radius:6px; color:var(--text); font-family:inherit; font-size:.82rem; font-weight:600;
      cursor:pointer; transition:.15s; }
    .yl-ghost-btn:hover { background:var(--bg3); }
    .yl-btn-sm { padding:6px 10px; font-size:.74rem; }
    .yl-spinner { display:none; align-items:center; gap:10px; padding:12px;
      background:var(--bg2); border:1px solid var(--border); border-radius:6px;
      margin-top:10px; font-size:.84rem; font-weight:600; color:var(--green); }
    .yl-error { padding:10px 12px; background:rgba(192,48,64,.08); border:1px solid rgba(192,48,64,.3);
      border-radius:6px; color:#e06070; font-size:.8rem; margin-top:8px; white-space:pre-line; }
    .yl-fmt-tabs { display:flex; gap:0; border-bottom:1px solid var(--border); margin-bottom:8px; }
    .yl-fmt-btn { flex:1; padding:8px 10px; background:transparent; border:none; cursor:pointer;
      font-family:inherit; font-size:.78rem; font-weight:600; color:var(--text3);
      border-bottom:2px solid transparent; transition:.15s; }
    .yl-fmt-btn.active { color:var(--green); border-bottom-color:var(--green); }
    .yl-html-preview { background:var(--bg3); border:1px solid var(--border); border-radius:5px;
      padding:10px 14px; font-size:.82rem; line-height:1.7; max-height:300px; overflow-y:auto; }
    .yl-html-preview h3 { font-size:.95rem; font-weight:700; margin-top:10px; margin-bottom:4px; }
    .yl-html-preview p { margin-bottom:6px; }
    .yl-html-preview ul { padding-left:18px; margin:6px 0; }
    .yl-labels-preview { display:flex; flex-wrap:wrap; gap:4px; padding:8px 0;
      max-height:520px; overflow-y:auto; background:#f5f5f5; border-radius:6px; padding:14px; }
  `;
}

// ════════════════════════════════════════════════════════════════
// 参考出品文マスタページ
// ════════════════════════════════════════════════════════════════
Pages.yahooListingRefs = function () {
  const main = document.getElementById('main');
  const data = _ylLoadStorage();
  const lines = (Store.getDB && Store.getDB('lines')) || [];

  Pages._ylRefAdd = () => {
    const lineId = (document.getElementById('yl-ref-line') || {}).value;
    const text   = (document.getElementById('yl-ref-text') || {}).value;
    const notes  = (document.getElementById('yl-ref-notes') || {}).value;
    if (!text || !text.trim()) { UI.toast('参考テキストを入力してください', 'error'); return; }
    const d = _ylLoadStorage();
    d.references = d.references || [];
    d.references.push({
      id: _ylUid('REF'),
      line_id:    lineId,
      raw_text:   text.trim(),
      notes:      (notes || '').trim(),
      source:     'manual',
      created_at: _ylDateLabel(),
    });
    _ylSaveStorage(d);
    UI.toast('参考出品文を保存しました', 'success');
    Pages.yahooListingRefs();
  };

  Pages._ylRefDelete = (id) => {
    if (!confirm('この参考出品文を削除しますか?')) return;
    const d = _ylLoadStorage();
    d.references = (d.references || []).filter(r => r.id !== id);
    _ylSaveStorage(d);
    Pages.yahooListingRefs();
  };

  // Vision API 取り込みボタン (画像→自動抽出)
  Pages._ylRefVisionImport = () => {
    const fileEl = document.getElementById('yl-ref-image');
    const lineId = (document.getElementById('yl-ref-line') || {}).value;
    const apiKey = (localStorage.getItem(YL_API_KEY_LS) || '').trim();
    if (!apiKey) { UI.toast('Gemini API キーを設定してください', 'error'); return; }
    if (!fileEl || !fileEl.files || !fileEl.files[0]) { UI.toast('画像を選択してください', 'error'); return; }
    const file = fileEl.files[0];
    const fr = new FileReader();
    fr.onload = async (ev) => {
      const dataUrl = ev.target.result;
      const base64 = String(dataUrl).split(',')[1];
      const mimeType = String(dataUrl).split(';')[0].replace('data:', '');
      const btn = document.getElementById('yl-ref-vision-btn');
      if (btn) { btn.disabled = true; btn.textContent = '抽出中…'; }
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${YL_GEMINI_MODEL}:generateContent?key=${apiKey}`;
        const prompt = `この画像はカブトムシ・クワガタムシの種親販売(主にヤフオク)の出品文スクリーンショットです。
以下のJSON形式のみで返してください(マークダウン装飾なし):
{
  "raw_text": "(画像から読み取れる出品文の本文を全文書き起こし)",
  "extracted": {
    "line_name": "(ライン名/血統表記)",
    "parent_male_size_mm": null,
    "parent_female_size_mm": null,
    "appeal_points": ["(訴求ポイントの配列)"]
  }
}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } }
            ] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 2048, responseMimeType: 'application/json' },
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err && err.error && err.error.message) || `HTTP ${res.status}`);
        }
        const respData = await res.json();
        const text = (respData && respData.candidates && respData.candidates[0] &&
                      respData.candidates[0].content && respData.candidates[0].content.parts &&
                      respData.candidates[0].content.parts[0] && respData.candidates[0].content.parts[0].text) || '';
        let obj;
        try {
          let s = text.trim();
          const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (m) s = m[1].trim();
          obj = JSON.parse(s);
        } catch (e) {
          obj = { raw_text: text, extracted: {} };
        }
        // テキストエリアに反映
        const txEl = document.getElementById('yl-ref-text');
        const ntEl = document.getElementById('yl-ref-notes');
        if (txEl) txEl.value = obj.raw_text || '';
        if (ntEl) ntEl.value = obj.extracted ? `抽出: ${JSON.stringify(obj.extracted, null, 2)}` : '';
        UI.toast('Vision抽出が完了しました。確認後「保存」を押してください', 'success');
      } catch (e) {
        console.error('[YL Vision]', e);
        UI.toast('Vision抽出失敗: ' + (e.message || e), 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔍 画像から自動抽出 (Gemini Vision)'; }
      }
    };
    fr.readAsDataURL(file);
  };

  main.innerHTML = `
    ${UI.header('参考出品文マスタ', { back: true })}
    <style>${_ylInjectCSS()}</style>
    <div class="yl-page">
      <div class="yl-card">
        <div class="yl-card-title">＋ 新規登録</div>
        <div class="yl-field">
          <label class="yl-lbl">対応ライン</label>
          <select id="yl-ref-line" class="yl-input">
            <option value="">— ライン未指定 (汎用) —</option>
            ${lines.map(l => `<option value="${_ylEsc(l.line_id)}">${_ylEsc((l.line_code||'') + ' ' + (l.line_name||''))}</option>`).join('')}
          </select>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">画像から取り込み <span class="yl-opt">スクリーンショット → Gemini Vision で本文抽出</span></label>
          <input id="yl-ref-image" class="yl-input" type="file" accept="image/*">
          <button id="yl-ref-vision-btn" class="yl-ghost-btn yl-btn-sm" style="margin-top:6px"
            onclick="Pages._ylRefVisionImport()">🔍 画像から自動抽出 (Gemini Vision)</button>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">参考テキスト本文</label>
          <textarea id="yl-ref-text" class="yl-input" rows="6"
            placeholder="出品文の全文をここに貼り付け、または上の画像取り込みで自動入力"></textarea>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">メモ <span class="yl-opt">任意</span></label>
          <textarea id="yl-ref-notes" class="yl-input" rows="2" placeholder="補足メモ"></textarea>
        </div>
        <button class="yl-primary-btn" onclick="Pages._ylRefAdd()">💾 保存</button>
      </div>

      <div class="yl-section-title">登録済み (${(data.references||[]).length} 件)</div>
      ${(data.references || []).slice().reverse().map(r => {
        const lname = (lines.find(l => l.line_id === r.line_id) || {});
        const lineLabel = r.line_id
          ? `${lname.line_code||''} ${lname.line_name||''}`
          : '(汎用)';
        return `
          <div class="yl-card" style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div style="font-size:.8rem;font-weight:700;color:var(--green)">${_ylEsc(lineLabel)}</div>
              <button class="yl-remove-btn" onclick="Pages._ylRefDelete('${r.id}')">✕ 削除</button>
            </div>
            <div style="font-size:.7rem;color:var(--text3);margin-bottom:6px">${_ylEsc(r.created_at)}</div>
            <div style="font-size:.78rem;line-height:1.6;white-space:pre-wrap;color:var(--text2);max-height:200px;overflow-y:auto;background:var(--bg3);padding:8px 10px;border-radius:5px">
              ${_ylEsc(String(r.raw_text || '').slice(0, 1000))}${(r.raw_text||'').length > 1000 ? '...' : ''}
            </div>
            ${r.notes ? `<div style="font-size:.7rem;color:var(--text3);margin-top:6px">📝 ${_ylEsc(r.notes)}</div>` : ''}
          </div>
        `;
      }).join('') || '<div style="color:var(--text3);padding:20px;text-align:center">参考出品文はまだ登録されていません</div>'}
    </div>
  `;
};

// ════════════════════════════════════════════════════════════════
// NGワード/言い換えマスタページ
// ════════════════════════════════════════════════════════════════
Pages.yahooListingNg = function () {
  const main = document.getElementById('main');

  Pages._ylNgAdd = () => {
    const ng     = (document.getElementById('yl-ng-word')   || {}).value;
    const reword = (document.getElementById('yl-ng-reword') || {}).value;
    const reason = (document.getElementById('yl-ng-reason') || {}).value;
    if (!ng || !ng.trim()) { UI.toast('NGワードを入力してください', 'error'); return; }
    const d = _ylLoadStorage();
    d.ng_words = d.ng_words || [];
    d.ng_words.push({
      ng:     ng.trim(),
      reword: (reword || '').trim(),
      reason: (reason || '').trim(),
    });
    _ylSaveStorage(d);
    UI.toast('NGワードを追加しました', 'success');
    Pages.yahooListingNg();
  };

  Pages._ylNgDelete = (idx) => {
    if (!confirm('このNGワードを削除しますか?')) return;
    const d = _ylLoadStorage();
    d.ng_words = (d.ng_words || []).filter((_, i) => i !== idx);
    _ylSaveStorage(d);
    Pages.yahooListingNg();
  };

  Pages._ylNgReset = () => {
    if (!confirm('既定のNGワードに戻しますか? (登録内容は失われます)')) return;
    const d = _ylLoadStorage();
    d.ng_words = YL_DEFAULT_NG_WORDS.slice();
    _ylSaveStorage(d);
    Pages.yahooListingNg();
  };

  Pages._ylTplSave = () => {
    const sh = (document.getElementById('yl-tpl-shipping') || {}).value;
    const tm = (document.getElementById('yl-tpl-terms')    || {}).value;
    const sl = (document.getElementById('yl-tpl-seller')   || {}).value;
    const d = _ylLoadStorage();
    d.templates = d.templates || {};
    if (typeof sh === 'string') d.templates.shipping = sh;
    if (typeof tm === 'string') d.templates.terms    = tm;
    if (typeof sl === 'string') d.templates.seller   = sl;
    _ylSaveStorage(d);
    UI.toast('テンプレートを保存しました', 'success');
  };

  const data = _ylLoadStorage();
  const ng   = data.ng_words  || [];
  const tpl  = data.templates || YL_DEFAULT_TEMPLATES;

  main.innerHTML = `
    ${UI.header('NGワード・テンプレート', { back: true })}
    <style>${_ylInjectCSS()}</style>
    <div class="yl-page">

      <div class="yl-card">
        <div class="yl-card-title">＋ NGワード追加</div>
        <div class="yl-field">
          <label class="yl-lbl">NGワード</label>
          <input id="yl-ng-word" class="yl-input" placeholder="例: 激レア">
        </div>
        <div class="yl-field">
          <label class="yl-lbl">推奨言い換え <span class="yl-opt">空なら使用しない</span></label>
          <input id="yl-ng-reword" class="yl-input" placeholder="例: 希少">
        </div>
        <div class="yl-field">
          <label class="yl-lbl">理由 <span class="yl-opt">任意</span></label>
          <input id="yl-ng-reason" class="yl-input" placeholder="例: 誇大表現">
        </div>
        <button class="yl-primary-btn" onclick="Pages._ylNgAdd()">追加</button>
      </div>

      <div class="yl-section-title">登録済みNGワード (${ng.length} 件)</div>
      <div class="yl-card">
        ${ng.length === 0
          ? '<div style="color:var(--text3);text-align:center;padding:14px">NGワードはまだ登録されていません</div>'
          : ng.map((w, i) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                <div>
                  <span style="font-weight:700;color:#e06060">${_ylEsc(w.ng)}</span>
                  <span style="color:var(--text3);margin:0 6px">→</span>
                  <span style="color:var(--green)">${_ylEsc(w.reword || '(使用しない)')}</span>
                  ${w.reason ? `<span style="color:var(--text3);font-size:.74rem;margin-left:6px">(${_ylEsc(w.reason)})</span>` : ''}
                </div>
                <button class="yl-remove-btn" onclick="Pages._ylNgDelete(${i})">✕</button>
              </div>
            `).join('')}
        <div style="margin-top:8px;text-align:right">
          <button class="yl-ghost-btn yl-btn-sm" onclick="Pages._ylNgReset()">既定に戻す</button>
        </div>
      </div>

      <div class="yl-section-title" style="margin-top:18px">📦 固定テンプレート (発送・注意事項・出品者)</div>
      <div class="yl-card">
        <div class="yl-field">
          <label class="yl-lbl">発送について</label>
          <textarea id="yl-tpl-shipping" class="yl-input" rows="4">${_ylEsc(tpl.shipping)}</textarea>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">ご注意ください</label>
          <textarea id="yl-tpl-terms" class="yl-input" rows="6">${_ylEsc(tpl.terms)}</textarea>
        </div>
        <div class="yl-field">
          <label class="yl-lbl">出品者より</label>
          <textarea id="yl-tpl-seller" class="yl-input" rows="3">${_ylEsc(tpl.seller)}</textarea>
        </div>
        <button class="yl-primary-btn" onclick="Pages._ylTplSave()">💾 テンプレートを保存</button>
      </div>

    </div>
  `;
};

// ════════════════════════════════════════════════════════════════
// 履歴ページ
// ════════════════════════════════════════════════════════════════
Pages.yahooListingHistory = function () {
  const main = document.getElementById('main');
  const data = _ylLoadStorage();
  const hist = (data.history || []).slice().reverse();

  Pages._ylHistDelete = (id) => {
    if (!confirm('この履歴を削除しますか?')) return;
    const d = _ylLoadStorage();
    d.history = (d.history || []).filter(h => h.id !== id);
    _ylSaveStorage(d);
    Pages.yahooListingHistory();
  };

  Pages._ylHistShow = (id) => {
    const d = _ylLoadStorage();
    const h = (d.history || []).find(x => x.id === id);
    if (!h) return;
    const w = window.open('', '_blank');
    if (!w) { UI.toast('ポップアップがブロックされました', 'error'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${_ylEsc(h.title)}</title>
<style>body{font-family:'Noto Sans JP',sans-serif;max-width:760px;margin:20px auto;padding:0 20px;line-height:1.7}</style></head><body>
<h2>${_ylEsc(h.title)}</h2>
<div style="color:#888;font-size:.8rem;margin-bottom:14px">${_ylEsc(h.created_at)} · ${_ylEsc(h.set_type === 'larva' ? '幼虫セット' : '成虫セット')}</div>
${h.body_html || '<pre>'+_ylEsc(h.body_plain)+'</pre>'}
</body></html>`);
    w.document.close();
  };

  Pages._ylHistCopyTitle = (id) => {
    const d = _ylLoadStorage();
    const h = (d.history || []).find(x => x.id === id);
    if (!h) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(h.title).then(
        () => UI.toast('タイトルをコピーしました 📋', 'success'),
        () => UI.toast('コピー失敗', 'error'));
    }
  };

  Pages._ylHistCopyHtml = (id) => {
    const d = _ylLoadStorage();
    const h = (d.history || []).find(x => x.id === id);
    if (!h) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(h.body_html || '').then(
        () => UI.toast('HTMLをコピーしました 📋', 'success'),
        () => UI.toast('コピー失敗', 'error'));
    }
  };

  Pages._ylHistCopyPlain = (id) => {
    const d = _ylLoadStorage();
    const h = (d.history || []).find(x => x.id === id);
    if (!h) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(h.body_plain || '').then(
        () => UI.toast('プレーンテキストをコピーしました 📋', 'success'),
        () => UI.toast('コピー失敗', 'error'));
    }
  };

  main.innerHTML = `
    ${UI.header('生成履歴', { back: true })}
    <style>${_ylInjectCSS()}</style>
    <div class="yl-page">
      ${hist.length === 0
        ? '<div style="color:var(--text3);text-align:center;padding:30px">履歴はまだありません</div>'
        : hist.map(h => `
            <div class="yl-card" style="margin-top:8px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
                <div style="flex:1;min-width:0">
                  <div style="font-size:.92rem;font-weight:700;color:var(--text);line-height:1.4">${_ylEsc(h.title || '(無題)')}</div>
                  <div style="font-size:.72rem;color:var(--text3);margin-top:2px">
                    ${_ylEsc(h.created_at)} · ${_ylEsc(h.set_type === 'larva' ? '🐛 幼虫' : '🪲 成虫')}セット · ${(h.individuals||[]).length}頭
                  </div>
                </div>
                <button class="yl-remove-btn" onclick="Pages._ylHistDelete('${h.id}')">✕</button>
              </div>
              ${h.appeal_summary ? `<div style="font-size:.78rem;color:var(--text2);margin:6px 0;padding:6px 10px;background:rgba(45,122,82,.06);border-left:3px solid var(--green);border-radius:3px">${_ylEsc(h.appeal_summary)}</div>` : ''}
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
                <button class="yl-ghost-btn yl-btn-sm" onclick="Pages._ylHistShow('${h.id}')">👁 開く</button>
                <button class="yl-ghost-btn yl-btn-sm" onclick="Pages._ylHistCopyTitle('${h.id}')">📋 タイトル</button>
                <button class="yl-ghost-btn yl-btn-sm" onclick="Pages._ylHistCopyHtml('${h.id}')">📋 HTML</button>
                <button class="yl-ghost-btn yl-btn-sm" onclick="Pages._ylHistCopyPlain('${h.id}')">📋 プレーン</button>
              </div>
            </div>
          `).join('')}
    </div>
  `;
};

console.log('[YL] yahoo_listing.js loaded build=20260426y1');
