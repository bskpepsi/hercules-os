// FILE: js/pages/yahoo_listing.js
// ════════════════════════════════════════════════════════════════
// yahoo_listing.js — ヤフオク出品AIジェネレーター（手動入力モード）
//
// build: 20260426y3
// 要件定義書: HerculesOS_ヤフオク出品AIジェネレーター_要件定義書_v1.0
//
// ── y3 での修正点 ─────────────────────────────────────────────
// ・🔥 AI本文の【種親情報】セクションでサイズ右隣の産地表記を削除し、
//   代わりに血統原文(paternal_raw / maternal_raw)を括弧書きで完全記載
//   するようプロンプト指示を強化。
//   実例フォーマット完全準拠:
//     ♂:①164mm
//        ②165mm(U6SA-/GTR.RU01U6SAティーガー...)
//     ♀:①75mm(U71イン×165T-REX.T-115)
//        ②77mm(FFOFA2No113×T117R(2)MD)
// ・🔥 ラベルのタイトルを「DHヘラクレス グアドループ産」スタイルに正規化
//   ヘラクレス系 → 「DHヘラクレス」略称化
//   英語産地 → カタカナ自動変換 (Guadeloupe → グアドループ 等)
//   1行で収まるよう文字長に応じて自動フォント縮小は維持。
// ・複数ラインのセット出品で、種親♂①②③ ♀①②③ を正しくナンバリング
//   するため、ラインごとに親♂♀を集約して AI プロンプトに渡す形に改修。
// ── y2 での修正点 ─────────────────────────────────────────────
// ・🔥 ライン管理コード(A1, B2 等)を AI プロンプトから完全除外
//   ライン管理コードは社内識別子であり、購入者向け出品文に含めるべきでないため。
//   プロンプトに「ライン管理コードを出品文/タイトルに含めないこと」と明示禁止。
//   ラベル種名表示も "species + origin" のみに変更。
// ・🔥 ラベル印刷を既存 label.js (_buildLabelPNG) と同じ html2canvas + PNG +
//   Blob URL 方式に統一。これで Brother iPrint&Label が正しく60×30mmで印刷する。
//   y1 では <iframe srcdoc> 埋め込みで Brother アプリが認識できず縮小されていた。
// ・🔥 ラベル文字サイズを大幅アップ (タイトル9px→14px、種親4.5-6.5px→8.5px、
//   日付6.5px→11px、♂♀記号11px→18px、ロゴ9mm→11mm)。
// ・🔥 出品本文フォーマットを実例 (HERAKABU MARCHÉ 過去出品) に準拠
//   ・タイトル: 【血統訴求】ヘラクレス 〇令幼虫 〇頭セット スタイル
//   ・種親情報: ♂①②③ ♀①②③ ナンバリング表記 (複数親対応)
//   ・幼虫情報: 中点リスト + 体重を雌雄別に列記 + 測定日記載
//   ・注意事項: ◆マーク列記 (実例と完全同一フォーマット)
//   ・※項目で各種免責、最後に管理番号
// ・「管理番号」「体重測定日」の入力欄を追加 (任意)
// ── build 20260426y1 (初版): 全機能を新規実装 ─────────────────
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
// §3.5 ロゴ管理: /assets/logos/herakabu-marche-logo.png (ユーザー提供画像の背景透過処理版・y2)
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
const YL_LOGO_PATH     = 'assets/logos/herakabu-marche-logo.png?v=20260426y3';
const YL_GEMINI_MODEL  = 'gemini-2.5-flash';

// ────────────────────────────────────────────────────────────────
// [y3] 産地名の英語表記 → カタカナ表記 変換マップ
// ラベル/出品文で「DHヘラクレス グアドループ産」のように
// 日本語表記に統一するため、英語入力を自動変換する。
// 大小文字を無視し、末尾の「島」「Island」も除去する。
// ────────────────────────────────────────────────────────────────
const YL_ORIGIN_KATAKANA = {
  'guadeloupe':       'グアドループ',
  'guadalupe':        'グアドループ',
  'hispaniola':       'イスパニオラ',
  'trinidad':         'トリニダード',
  'ecuador':          'エクアドル',
  'colombia':         'コロンビア',
  'lita':             'リタ',
  'bolivia':          'ボリビア',
  'brazil':           'ブラジル',
  'mexico':           'メキシコ',
  'peru':             'ペルー',
  'venezuela':        'ベネズエラ',
  'panama':           'パナマ',
  'martinique':       'マルティニーク',
  'dominica':         'ドミニカ',
  'saint lucia':      'セントルシア',
  'st. lucia':        'セントルシア',
  'st lucia':         'セントルシア',
  'puerto rico':      'プエルトリコ',
  'french guiana':    'フランス領ギアナ',
  'guiana':           'ギアナ',
  'argentina':        'アルゼンチン',
  'paraguay':         'パラグアイ',
  'uruguay':          'ウルグアイ',
  'chile':            'チリ',
  'cuba':             'キューバ',
  'jamaica':          'ジャマイカ',
};

// [y3] 英語産地表記をカタカナに変換 (ヒットしなければ元のまま)
function _ylNormalizeOriginKatakana(origin) {
  if (!origin) return '';
  const trimmed = String(origin)
    .trim()
    .replace(/\s*(island|is\.?|島)\s*$/i, '');
  const key = trimmed.toLowerCase();
  return YL_ORIGIN_KATAKANA[key] || trimmed;
}

// [y3] 種名を短縮表記化 (ラベル用)
//   ヘラクレス系: 「DHヘラクレス」(Dynastes Hercules の慣用略称)
//   ネプチューン系: 「DNネプチューン」
//   サタン系: 「DSサタン」
//   その他は原文のまま
function _ylNormalizeSpeciesShort(species) {
  if (!species) return 'DHヘラクレス';
  const sp = String(species).trim();
  if (/ヘラクレス|hercules/i.test(sp)) return 'DHヘラクレス';
  if (/ネプチューン|neptunus/i.test(sp)) return 'DNネプチューン';
  if (/サタン|satanas/i.test(sp))       return 'DSサタン';
  if (/ティティウス|tityus/i.test(sp))   return 'DTティティウス';
  return sp;
}

// [y3] ラベル用タイトル組み立て
//   例: ("ヘラクレスオオカブト", "Guadeloupe") → "DHヘラクレス グアドループ産"
function _ylBuildLabelTitle(species, origin) {
  const sp  = _ylNormalizeSpeciesShort(species);
  const ori = _ylNormalizeOriginKatakana(origin);
  return ori ? `${sp} ${ori}産` : sp;
}

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
    manageNo:      '',            // [y2] 管理番号 (任意・社内番号、出品文末尾に出す)
    weightDate:    '',            // [y2] 体重測定日 (任意・幼虫の体重表記の根拠日)
    appealHeadline: '',           // [y2] タイトル冒頭の血統訴求 (例:「大型血統」「太角血統」)
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
  // [y2] line_code は社内識別子なので画面上のセレクト項目にも出さない方針。
  //   ただし内部的に line_id でひもづけるため、ユーザーがどのラインかわかるよう
  //   line_name(と species) のみ表示する。
  function _lineOptions(selected) {
    const lines = (Store.getDB && Store.getDB('lines')) || [];
    const opts = lines.map(l => {
      const sp = l.species ? `[${l.species}] ` : '';
      const name = l.line_name || l.bloodline_name || l.line_code || '(無名ライン)';
      const lbl = `${sp}${name}`.trim();
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
            <label class="yl-lbl">タイトル冒頭の訴求 <span class="yl-opt">任意・例:「大型血統」「太角血統」「ワイドボディ」</span></label>
            <input class="yl-input" type="text"
              value="${_ylEsc(saleInfo.appealHeadline)}"
              oninput="Pages._ylSetSaleInfoField('appealHeadline', this.value)"
              placeholder="例: 大型血統">
          </div>
          <div class="yl-field">
            <label class="yl-lbl">アピールポイント・特記事項 <span class="yl-opt">任意・自由記述</span></label>
            <textarea class="yl-input" rows="3"
              oninput="Pages._ylSetSaleInfoField('extraAppeal', this.value)"
              placeholder="例: ♀親はワイドボディ系統、♂親は太角傾向。3令初期で順調な成長中。"
            >${_ylEsc(saleInfo.extraAppeal)}</textarea>
          </div>
          <div class="yl-row2">
            <div class="yl-field">
              <label class="yl-lbl">体重測定日 <span class="yl-opt">幼虫のみ・任意</span></label>
              <input class="yl-input" type="date"
                value="${_ylEsc(saleInfo.weightDate)}"
                onchange="Pages._ylSetSaleInfoField('weightDate', this.value)">
            </div>
            <div class="yl-field">
              <label class="yl-lbl">管理番号 <span class="yl-opt">任意・社内番号</span></label>
              <input class="yl-input" type="text"
                value="${_ylEsc(saleInfo.manageNo)}"
                oninput="Pages._ylSetSaleInfoField('manageNo', this.value)"
                placeholder="例: 40-1.2">
            </div>
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
          <div style="font-size:.74rem;color:var(--text3);margin-bottom:8px;line-height:1.5">
            ヘッドが各ラベルの「🖨️ #N を印刷」をタップするとBrother iPrint&Labelが起動します。<br>
            プリンタ側の用紙サイズは「29mm 連続テープ (DK-2205を30mmで自動カット)」または「60×30mm」を選択してください。
          </div>
          <div id="yl-labels-preview" class="yl-labels-preview"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button class="yl-ghost-btn yl-btn-sm" onclick="Pages._ylPreviewLabels()">🔄 プレビュー再生成</button>
            <button class="yl-primary-btn yl-btn-sm" style="margin-left:auto" onclick="Pages._ylSaveToHistory()">💾 履歴に保存</button>
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
      // ラベルプレビュー (PNG生成は時間がかかるので await; エラーは握り潰す)
      try { await _ylPreviewLabels(); } catch (_e) { console.warn('[YL] preview failed', _e); }
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
  // [y2] line_code は社内識別子のため絶対に AI に渡さない。
  //   line_name (例:「Line-A」「グアドループ大型血統」) のみ AI に渡せばよい。
  //   さらに line_name 自体も「LineA」「A1」など内部コード臭がする場合があるため、
  //   AI へは「血統名・系統名」として参考程度に渡し、出力には載せない指示も出す。
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
          // [y2] line_code は除外。line_name と種・産地のみ。
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
    const sf          = ctx.saleInfo || {};

    // 個体情報整形 (※AIには line_name は伝えるが、出力に出さない方針)
    const indLines = ctx.individuals.map(ic => {
      const ind = ic.ind;
      // [y2] AI に line_name は渡すが、出力に出さないよう後段で禁止指示。
      //   line_name は血統判断の参考程度に使ってもらう。
      const lineRef = ic.line.line_name ? `(社内ライン名:${ic.line.line_name})` : '';
      if (ind.kind === 'larva') {
        return `[幼虫#${ic.idx}] ${ic.line.species}${ic.line.origin?'('+ic.line.origin+'産)':''}${lineRef} / ${STAGE_LABEL[ind.stage]||ind.stage} / 体重${ind.weight_g}g / 孵化${ind.hatch_date}${ind.sex?' / '+ind.sex:'/性別未判別'}${ind.memo?' / メモ:'+ind.memo:''}`;
      }
      const cond = ind.condition === '完品' ? '完品' : `${ind.condition}${ind.condition_detail?'('+ind.condition_detail+')':''}`;
      const feeding = ind.no_feeding_yet ? '未後食' : (ind.feeding_date || '');
      const horn = ind.sex === '♂' ? `頭角${ind.horn_included?'含む':'除く'}` : '';
      const mate = ind.sex === '♀' && ind.mating_status ? `交尾:${MATE_LABEL[ind.mating_status]||ind.mating_status}` : '';
      return `[成虫#${ic.idx}] ${ic.line.species}${ic.line.origin?'('+ic.line.origin+'産)':''}${lineRef} / ${ind.sex} ${ind.body_mm}mm${horn?'('+horn+')':''} / 羽化${ind.eclosion_date}${feeding?' / 後食:'+feeding:''} / ${ACT_LABEL[ind.activity]||ind.activity} / ${cond}${mate?' / '+mate:''}${ind.memo?' / メモ:'+ind.memo:''}`;
    }).join('\n');

    // ライン情報整形 (重複排除・line_code除外)
    // [y3] さらに種親♂♀をラインごとに集約してナンバリング用リストを作成
    const seenLines = new Set();
    const parentBlocks = [];
    const fatherList = []; // [{size, blood, memo, lineRef}]
    const motherList = [];
    ctx.individuals.forEach(ic => {
      const key = ic.line.line_name || ic.line.species + '|' + ic.line.origin;
      if (seenLines.has(key)) return;
      seenLines.add(key);
      const f = ic.father, m = ic.mother;
      const lineMemo = ic.line.memo ? `\n  ライン背景: ${ic.line.memo}` : '';
      const fInfo = f ? `\n  ♂親情報: ${f.size_mm?f.size_mm+'mm':'(サイズ不明)'} ${f.paternal_raw?'(血統表記: '+f.paternal_raw+')':''}${f.memo?' メモ:'+f.memo:''}` : '';
      const mInfo = m ? `\n  ♀親情報: ${m.size_mm?m.size_mm+'mm':'(サイズ不明)'} ${m.maternal_raw?'(血統表記: '+m.maternal_raw+')':''}${m.memo?' メモ:'+m.memo:''}` : '';
      parentBlocks.push(`[${ic.line.species}${ic.line.origin?' '+ic.line.origin+'産':''}]${lineMemo}${fInfo}${mInfo}`);
      // [y3] ナンバリング用リスト
      if (f) fatherList.push({
        size:  f.size_mm  || '',
        blood: f.paternal_raw || '',
        memo:  f.memo || '',
      });
      if (m) motherList.push({
        size:  m.size_mm  || '',
        blood: m.maternal_raw || '',
        memo:  m.memo || '',
      });
    });

    // [y3] AIへ渡す「種親リスト (♂①②③ ♀①②③)」のテキスト整形
    //   血統原文(blood)を必ずカッコ書きで全文記載させる狙い
    const fatherListText = fatherList.length
      ? fatherList.map((p, i) => {
          const num = '①②③④⑤⑥⑦⑧⑨'[i] || `(${i+1})`;
          const blood = p.blood ? `(血統原文: ${p.blood})` : '(血統原文: なし)';
          return `  ♂${num} ${p.size?p.size+'mm':'サイズ不明'} ${blood}`;
        }).join('\n')
      : '  (♂親情報なし)';
    const motherListText = motherList.length
      ? motherList.map((p, i) => {
          const num = '①②③④⑤⑥⑦⑧⑨'[i] || `(${i+1})`;
          const blood = p.blood ? `(血統原文: ${p.blood})` : '(血統原文: なし)';
          return `  ♀${num} ${p.size?p.size+'mm':'サイズ不明'} ${blood}`;
        }).join('\n')
      : '  (♀親情報なし)';

    // 参考出品文 (line別最大1件、テキストの先頭500文字まで)
    const refBlocks = [];
    const usedLines = new Set();
    ctx.individuals.forEach(ic => {
      if (usedLines.has(ic.line.line_name)) return;
      const ref = (ic.refs || [])[0];
      if (ref) {
        usedLines.add(ic.line.line_name);
        const txt = String(ref.raw_text || ref.notes || '').slice(0, 500);
        if (txt) refBlocks.push(`[${ic.line.species}用 参考: ${txt}]`);
      }
    });

    // 販売形態ラベル
    let pattern = '';
    if (sf.salePattern === 'single_male')   pattern = '単体販売 (♂)';
    if (sf.salePattern === 'single_female') pattern = '単体販売 (♀)';
    if (sf.salePattern === 'pair')          pattern = 'ペア販売';
    if (sf.salePattern === 'trio')          pattern = 'トリオ販売';
    if (sf.salePattern === 'larva_n')       pattern = `${ctx.individuals.length}頭セット`;

    // 集計用 (♂♀別の体重・サイズ・頭数)
    const males   = ctx.individuals.filter(ic => ic.ind.sex === '♂');
    const females = ctx.individuals.filter(ic => ic.ind.sex === '♀');
    const unknownSex = ctx.individuals.filter(ic => !ic.ind.sex);

    const sexBreakdown = isLarva
      ? `♂${males.length}頭/♀${females.length}頭${unknownSex.length?'/性別未判別'+unknownSex.length+'頭':''}`
      : `♂${males.length}頭/♀${females.length}頭`;

    // 幼虫体重まとめ (♂体重列, ♀体重列, 未判別体重列)
    const maleWeights    = males.map(ic => ic.ind.weight_g + 'g').filter(Boolean);
    const femaleWeights  = females.map(ic => ic.ind.weight_g + 'g').filter(Boolean);
    const unknownWeights = unknownSex.map(ic => ic.ind.weight_g + 'g').filter(Boolean);

    // 孵化日まとめ (重複排除、最も古い日付の月)
    const hatchDates = isLarva
      ? Array.from(new Set(ctx.individuals.map(ic => ic.ind.hatch_date).filter(Boolean)))
      : [];
    let hatchSummary = '';
    if (hatchDates.length === 1) {
      hatchSummary = _ylJunMonthLabel(hatchDates[0]);
    } else if (hatchDates.length > 1) {
      const sorted = hatchDates.slice().sort();
      hatchSummary = `${_ylJunMonthLabel(sorted[0])}〜${_ylJunMonthLabel(sorted[sorted.length-1])}`;
    }

    // ステージまとめ
    const stages = isLarva
      ? Array.from(new Set(ctx.individuals.map(ic => STAGE_LABEL[ic.ind.stage] || ic.ind.stage)))
      : [];

    // 注意事項テンプレート (実例HERAKABU MARCHÉ準拠)
    const t = ctx.templates || YL_DEFAULT_TEMPLATES;
    const customTermsBlock = t.terms || '';
    const customShippingBlock = t.shipping || '';
    const customSellerBlock = t.seller || '';

    // NGワード整形
    const ngLine = (ctx.ngWords || []).map(w =>
      `「${w.ng}」→「${w.reword || '使用しない'}」 (${w.reason||''})`
    ).join(', ');

    // タイトル冒頭訴求
    const headlineHint = sf.appealHeadline
      ? `タイトル冒頭は【${sf.appealHeadline}】の訴求を入れること`
      : `タイトル冒頭に血統訴求を【】で入れる(例:【大型血統】【太角血統】【ワイドボディ】等。種親情報から判断)`;

    return `あなたはヘラクレスオオカブトの繁殖個体をヤフオクで販売するプロ出品者(出品者名: HERAKABU MARCHÉ)です。
過去の HERAKABU MARCHÉ 出品文と同じスタイルで、誠実かつ訴求力のある出品文を作成してください。

━━━ 🚫 厳守ルール ━━━
1. 「社内ライン名」(例: Line-A, A1, B-2 等の管理コード)は出品文・タイトルに**絶対に含めない**こと。
   これは社内識別子であり、購入者には意味のない情報のため、完全に除外する。
2. NGワード厳守: ${ngLine || '(なし)'}
3. ヤフオクガイドラインに違反する誇大表現は避ける。
4. 体長・体重・孵化日・羽化日の数字は与えられた値を改変しない。

━━━ 出品情報 ━━━
販売形態: ${pattern}
セット種別: ${isLarva ? '幼虫セット' : '成虫セット'}
雌雄内訳: ${sexBreakdown}
${isLarva && hatchSummary ? `孵化日: ${hatchSummary}\nステージ: ${stages.join('・')}\n` : ''}${isLarva ? `現在の体重${sf.weightDate ? '('+sf.weightDate+'時点)' : ''}: ${maleWeights.length?'♂'+maleWeights.join('、'):''}${maleWeights.length&&femaleWeights.length?' / ':''}${femaleWeights.length?'♀'+femaleWeights.join('、'):''}${unknownWeights.length?' / 性別未判別:'+unknownWeights.join('、'):''}\n` : ''}

【ライン背景情報】
${parentBlocks.join('\n\n')}

【種親リスト (この番号順で①②③として記載すること)】
${fatherListText}
${motherListText}

【出品個体】
${indLines}

${refBlocks.length ? '【参考出品文 (種親購入時の血統情報)】\n' + refBlocks.join('\n\n') + '\n' : ''}
${sf.extraAppeal ? '【出品者アピール (必ず本文に盛り込む)】\n' + sf.extraAppeal + '\n' : ''}

━━━ 出力フォーマット (必須) ━━━
以下の純粋なJSON形式のみで返してください。マークダウンのコードブロック(\\\`\\\`\\\`)などの装飾は付けないでください。

{
  "title": "(商品タイトル。65文字以内。${headlineHint}。種名・令・頭数・種親サイズ等の要点を簡潔に。社内ライン名は絶対に入れない。)",
  "body_html": "(HTML装飾付きの商品説明文。下記の<本文構造>に厳密に従うこと)",
  "body_plain": "(プレーンテキスト版の商品説明文。HTMLタグなしで同じ構造)",
  "appeal_summary": "(購買意欲を高める短い要約。50字以内。発送メッセージ転用用。)"
}

━━━ <本文構造> (HERAKABU MARCHÉ 過去出品スタイル) ━━━
1) リード文 (2〜3行): 何の出品か明示しつつ血統価値を訴求。例:
   「ヘラクレスオオカブトの3令幼虫5頭セットの出品です。\n大型血統を中心としたブリードラインで、将来サイズ狙いが可能な組み合わせになります。」

2) 【種親情報】セクション (🔥 重要・必ず以下のルールを厳守):
   ・♂と♀それぞれ、上記「種親リスト」の番号順に①②③形式で列挙する。
   ・サイズの右隣に**産地名(Guadeloupe産・グアドループ産 等)を絶対に書かない**。
     産地はリード文で既に触れているため、種親情報セクションでは記載しない。
   ・サイズの後には、与えられた**血統原文(paternal_raw / maternal_raw)を必ずカッコ書きで完全に転記**する。
     血統原文が「なし」の場合のみサイズだけ書く。
   ・血統原文は改変・要約せず、原文をそのまま括弧内に入れる。
   実例 (HERAKABU MARCHÉ 過去出品):
     【種親情報】
     ♂:①164mm
        ②165mm(U6SA-/GTR.RU01U6SAティーガー 168-165TREX-199MTREX・1660AKS × 0F136FOX-FOX.FF1710F)
     ♀:①75mm(U71イン×165T-REX.T-115)
        ②77mm(FFOFA2No113×T117R(2)MD)
        ③74.2mm(T-117FFOAKSvol3×00-181)
   末尾に「※発送時には雌雄・想定血統・サイズ等分かるよう個体ごとにラベリングして発送いたします。」と「いずれも大型血統由来です。」(該当する場合)を付記。

3) ${isLarva ? '【幼虫情報】' : '【成虫情報】'}セクション:
   ${isLarva ? `中点(・)リストで以下を列記:
     ・頭数:〇頭
     ・孵化日:YYYY年〇月〇旬
     ・ステージ:〇令
     ・雌雄内訳:♂〇頭/♀〇頭
     ・現在の体重 ${sf.weightDate?'('+sf.weightDate+'時点)':'(測定日記載なし)'}
     ♂:〇g、〇g
     ♀:〇g、〇g、〇g
   末尾に以下の※項目を列記(箇条書き):
     ※輸送時のストレスで一時的に体重減少の可能性あり
     ・状態:健康個体のみを選別
     ・温度管理約22℃前後
     ※雌雄判別は目視によるもので、誤判別の可能性がある点はご了承ください
     ※取引中に加令する場合がございます。
     ※細心の注意を払って梱包に努めますがダニ、コバエなどの雑虫がマットに混入している場合がございます。`
   : `成虫個体ごとに以下を列記:
     ・サイズ:〇mm(♂は頭角含む/除くを明記)
     ・羽化日:YYYY/MM/DD
     ・後食開始日:YYYY/MM/DD or 未後食
     ・状態:完品 / フセツ欠け等
     ・活動状況:成熟・活動中 / 未成熟 / 休眠中
     ♀がいる場合は・交尾状況:未交尾/交尾済み/不明
   末尾に以下の※項目:
     ※輸送時のストレスで一時的に体力消耗の可能性あり
     ※細心の注意を払って梱包に努めますがダニ、コバエなどの混入の可能性あり`}

4) 【おすすめポイント】セクション:
   中点(・)リストで3〜5項目。実際の血統情報・サイズ・成長状態から具体的な訴求を作る。
   ${sf.extraAppeal ? '※必ず出品者アピールの内容を反映させる。' : ''}

5) 【注意事項】セクション (◆マーク列記):
   以下のテンプレートを基本に、HERAKABU MARCHÉ の標準的な注意事項を列記する。
   ${customShippingBlock ? '発送関連:\n' + customShippingBlock + '\n' : ''}${customTermsBlock ? '免責関連:\n' + customTermsBlock + '\n' : ''}実例フォーマット:
   ◆雌雄誤判別の可能性がある点ご了承ください。
   ◆発送はゆうパック(100〜120サイズ)です。(梱包費別途${sf.shippingByBuyer?'落札者負担':'300円'})
   ◆季節に応じて発泡箱やダンボールに保冷剤やカイロを入れて梱包いたします。
   ◆包装資材は中古資材を使用する場合がありますのでご容赦ください。
   ◆大阪府からの発送になります。
   ◆海外への発送は致しません。
   ◆死着保証はございません。
   ※到着まで中1日以上かかる地域へお住まいの方については死着の可能性が高まる為、リスクを承知の上でご入札いただきますようお願いします。
   ◆輸送中のトラブルなどの補償もお受けすることができません。
   ◆落札後は48時間以内にご入金手続きが出来る方のみご入札下さい。
   ◆受取り希望日がある方は落札後の取引連絡より希望日をお知らせ下さい。
   ※可能な限り到着希望日で対応いたしますが、希望に添えない場合もございます。
   ◆ご不明な点がありましたら質問よりご連絡ください。

6) ${customSellerBlock ? `【出品者より】セクション:\n   ${customSellerBlock.replace(/\n/g, '\n   ')}\n\n` : ''}${sf.manageNo ? `7) 末尾に「管理番号:${sf.manageNo}」を1行で記載。` : '7) 管理番号は記載しない。'}

HTML版は <h3> でセクション見出し、<p> で本文、<ul><li> で箇条書きを使うこと。
プレーン版は実際の改行で構造を表現すること。`;
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
    // [y2] フッターは管理番号がある場合だけ。区切り装飾は付けない(本文の流れを断ち切らないため)
    const htmlFull  = html  + (ctxFooterHtml ? '\n' + ctxFooterHtml : '');
    const plainFull = plain + (ctxFooter     ? '\n\n' + ctxFooter   : '');

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
    // [y2] 注意事項・発送・出品者の文言は新プロンプトで AI 本文側に組み込まれるため、
    //   ここでは管理番号と最終調整だけを返す。重複防止。
    const sf = ctx.saleInfo || {};
    if (!sf.manageNo) return '';
    if (fmt === 'plain') {
      return `管理番号:${sf.manageNo}`;
    }
    return `<p style="margin-top:14px;color:#5a5a5a;font-size:.82rem">管理番号:${_ylEsc(sf.manageNo)}</p>`;
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
  // ────────────────────────────────────────────────────────────
  // y2: 文字サイズを全体的に拡大。レイアウトは:
  //   ・上段(高さ約8mm): タイトル(種名+産地) — 大きめ
  //   ・中段: ◆種親 ♂サイズ・♀サイズ (血統表記は控えめ)
  //   ・下段: ◆孵化日(or羽化日)
  //   ・右上: ♂♀記号 (判別済時のみ)
  //   ・右下: HERAKABU MARCHÉ ロゴ
  // フォントサイズは px で指定し html2canvas でラスタライズ → PNG生成。
  // 既存の label.js _buildLabelPNG / _lblBrotherPrint と同じ仕組みで
  // 生成・印刷するので Brother iPrint&Label で60×30mm として認識される。
  // ════════════════════════════════════════════════════════════

  // ラベル印刷用の物理寸法 / ピクセル寸法
  // 60mm × 30mm @ 300DPI → 709×354 px (Brotherの解像度に合わせる) だが
  // html2canvas の scale=3 を使うので 60×30 mm を 236×118 px ベースで
  // 計算し、scale=3 で 708×354 px として PNG 化する。既存ラベルは
  // 62×70mm を 234×265 px(scale=3) で扱っており、本ラベルもその系列に
  // 合わせ 1mm ≒ 3.93 px → 60mm = 236 px / 30mm = 118 px とした。
  const YL_LABEL_DIMS = { wMm: 60, hMm: 30, wPx: 236, hPx: 118, scale: 3 };

  function _ylBuildLabelHTML(ind, ctx) {
    const ic = ctx.individuals.find(c => c.ind.uid === ind.uid) || ctx.individuals[0];
    const line = ic.line || {};
    // [y3] タイトルを「DHヘラクレス グアドループ産」スタイルに正規化
    //   ヘラクレス系種名 → 「DHヘラクレス」略称化
    //   英語産地 → カタカナ自動変換 (Guadeloupe → グアドループ 等)
    const titleStr = _ylBuildLabelTitle(line.species, line.origin);

    // 種親 (サイズ + 血統表記 全文 — 複数行折り返しで表示)
    const f = ic.father, m = ic.mother;
    const fSize  = f && f.size_mm ? `${f.size_mm}mm` : '—mm';
    const mSize  = m && m.size_mm ? `${m.size_mm}mm` : '—mm';
    // 血統表記は60mm幅で複数行折り返しさせるため省略しない (が長すぎる場合は60字でカット)
    const fBlood = f && f.paternal_raw ? String(f.paternal_raw).slice(0, 80) : '';
    const mBlood = m && m.maternal_raw ? String(m.maternal_raw).slice(0, 60) : '';

    // 孵化日 / 羽化日
    const hatchDateRaw = ind.hatch_date || ind.eclosion_date || '';
    const dateLabel = ind.kind === 'larva' ? '孵化日' : '羽化日';
    const dateStr = _ylJunMonthLabel(hatchDateRaw);

    // タイトル長に応じて自動でフォント縮小
    const titleFs = titleStr.length > 22 ? '11px' : titleStr.length > 18 ? '12.5px' : '14px';
    // 血統の文字長に応じて血統行のフォント自動調整 (折り返し前提)
    const bloodMaxLen = Math.max(fBlood.length, mBlood.length);
    const bloodFs = bloodMaxLen > 50 ? '5.5px' : bloodMaxLen > 35 ? '6px' : bloodMaxLen > 22 ? '6.5px' : '7px';
    const bloodLh = bloodMaxLen > 35 ? '1.15' : '1.2';

    // ロゴパス (印刷時に確実に読み込めるよう絶対URL化)
    const logoUrl = (function(){
      try { return new URL(YL_LOGO_PATH, location.href).href; }
      catch (_) { return YL_LOGO_PATH; }
    })();

    return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>\n'
      + '  @page { size: 60mm 30mm; margin: 0; }\n'
      + '  * { margin:0; padding:0; box-sizing:border-box; }\n'
      + '  body { width:60mm; height:30mm; font-family: "Noto Serif JP","Yu Mincho","Hiragino Mincho ProN",serif; background:#fff; color:#000; overflow:hidden; }\n'
      + '  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }\n'
      + '</style></head><body>\n'
      // ラベル全体: padding は左右広め、上下狭め (画像1のレイアウトに準拠)
      + '<div style="width:60mm;height:30mm;position:relative;padding:1mm 1.8mm 0.8mm;box-sizing:border-box;overflow:hidden">\n'
      // ──── タイトル行 (種名+産地) — 中央寄せ・大きめ・セリフ ────
      + '  <div style="text-align:center;font-size:' + titleFs + ';font-weight:700;line-height:1.15;letter-spacing:-0.2px;padding:0 1mm">' + _ylEsc(titleStr) + '</div>\n'
      // ──── 本文領域 (左:情報 / 右下:ロゴ) ────
      + '  <div style="position:relative;margin-top:0.6mm;padding-right:18mm">\n'
      // ◆種親
      + '    <div style="font-size:7.5px;font-weight:700;line-height:1.2;margin-bottom:0.2mm">◆ 種親</div>\n'
      // ♂ サイズ + 血統表記 (改行込み)
      + '    <div style="padding-left:2mm;line-height:1.2">\n'
      + '      <div style="font-size:9.5px;font-weight:700">♂' + _ylEsc(fSize) + '</div>\n'
      + (fBlood
        ? '      <div style="font-size:' + bloodFs + ';line-height:' + bloodLh + ';color:#222;padding-left:0.5mm;word-break:break-all">(' + _ylEsc(fBlood) + ')</div>\n'
        : '')
      + '    </div>\n'
      // ♀ サイズ + 血統表記 (改行込み)
      + '    <div style="padding-left:2mm;line-height:1.2;margin-top:0.4mm">\n'
      + '      <div style="font-size:9.5px;font-weight:700">♀' + _ylEsc(mSize) + '</div>\n'
      + (mBlood
        ? '      <div style="font-size:' + bloodFs + ';line-height:' + bloodLh + ';color:#222;padding-left:0.5mm;word-break:break-all">(' + _ylEsc(mBlood) + ')</div>\n'
        : '')
      + '    </div>\n'
      // ◆孵化日
      + '    <div style="font-size:7.5px;font-weight:700;line-height:1.2;margin-top:0.6mm">◆ ' + _ylEsc(dateLabel) + '</div>\n'
      + '    <div style="font-size:10.5px;font-weight:700;padding-left:2mm;letter-spacing:0.2px;line-height:1.2">' + _ylEsc(dateStr || '____/__ /__') + '</div>\n'
      + '  </div>\n'
      // ──── 右下ロゴ (画像1のスタイルに合わせて大きめ配置) ────
      + '  <div style="position:absolute;right:1.2mm;bottom:0.5mm;width:17mm;height:13mm;line-height:0;display:flex;align-items:flex-end;justify-content:center">\n'
      + '    <img src="' + logoUrl + '" alt="HERAKABU MARCHÉ" style="max-width:17mm;max-height:13mm;width:auto;height:auto;object-fit:contain;display:block">\n'
      + '  </div>\n'
      + '</div>\n'
      + '</body></html>';
  }

  // ── ラベル PNG 生成 ────────────────────────────────────────
  // label.js のグローバル関数 _buildLabelPNG を再利用。なければ
  // フォールバックとして html2canvas を直接呼ぶ。
  async function _ylGenerateLabelPNG(ind, ctx) {
    const html = _ylBuildLabelHTML(ind, ctx);
    if (typeof _buildLabelPNG === 'function') {
      try {
        const png = await _buildLabelPNG(html, YL_LABEL_DIMS);
        if (png) return png;
      } catch (e) {
        console.warn('[YL] _buildLabelPNG failed', e);
      }
    }
    // フォールバック: html2canvas 直叩き
    if (typeof html2canvas === 'function') {
      try {
        const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
        const bodyMatch  = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const rawStyle   = styleMatch ? styleMatch[1].replace(/@page\s*\{[^}]*\}/g, '') : '';
        const bodyHtml   = bodyMatch  ? bodyMatch[1] : html;
        const host = document.createElement('div');
        host.style.cssText = `position:fixed;left:-99999px;top:0;width:${YL_LABEL_DIMS.wPx}px;height:${YL_LABEL_DIMS.hPx}px;overflow:hidden;background:#fff;box-sizing:border-box`;
        host.innerHTML = `<style>${rawStyle}</style>${bodyHtml}`;
        document.body.appendChild(host);
        // 画像読み込み待ち
        const imgs = Array.from(host.querySelectorAll('img'));
        await Promise.all(imgs.map(img => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 2000); });
        }));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const canvas = await html2canvas(host, {
          scale: YL_LABEL_DIMS.scale,
          width: YL_LABEL_DIMS.wPx,
          height: YL_LABEL_DIMS.hPx,
          useCORS: true, allowTaint: true, logging: false,
          backgroundColor: '#ffffff',
          windowWidth: YL_LABEL_DIMS.wPx,
          windowHeight: YL_LABEL_DIMS.hPx,
          imageTimeout: 5000,
        });
        try { document.body.removeChild(host); } catch (_) {}
        return canvas.toDataURL('image/png');
      } catch (e) {
        console.warn('[YL] html2canvas fallback failed', e);
      }
    }
    return null;
  }

  // ── プレビュー (PNG 表示) ──────────────────────────────────
  async function _ylPreviewLabels() {
    if (!individuals.length) return;
    const ctx = (window.__ylLastGenerated && window.__ylLastGenerated.ctx)
              ? window.__ylLastGenerated.ctx : _buildPromptContext();
    const wrap = document.getElementById('yl-labels-preview');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:14px;text-align:center;color:#888;font-size:.78rem">ラベル画像を生成中...</div>';

    // 各個体の PNG を生成し、キャッシュに保持 (印刷時に再利用)
    window.__ylLabelPngs = window.__ylLabelPngs || {};
    const blocks = [];
    for (let i = 0; i < individuals.length; i++) {
      const ind = individuals[i];
      let png;
      try { png = await _ylGenerateLabelPNG(ind, ctx); } catch (e) { png = null; }
      window.__ylLabelPngs[ind.uid] = png;
      blocks.push({ idx: i + 1, ind, png });
    }
    wrap.innerHTML = blocks.map(b => `
      <div class="yl-label-block">
        <div class="yl-label-block-title">ラベル #${b.idx}${b.ind.sex ? ' (' + _ylEsc(b.ind.sex) + ')' : ''}</div>
        ${b.png
          ? `<img class="yl-label-img" src="${b.png}" alt="ラベル #${b.idx}">`
          : '<div style="padding:14px;color:#c44;font-size:.74rem">PNG生成失敗</div>'}
        <button class="yl-primary-btn yl-btn-sm yl-label-print-btn"
          onclick="Pages._ylPrintSingleLabel('${b.ind.uid}')">
          🖨️ #${b.idx} を印刷
        </button>
      </div>
    `).join('');
  }

  // ── 1ラベル印刷 (Brother iPrint&Label 仕様準拠) ─────────────
  // 既存の Pages._lblBrotherPrint と同じ単一PNGの印刷ドキュメント方式。
  // <img width="236" height="118"> で固定すれば Brother 側で60×30mm用紙
  // として正しく認識される。
  async function _ylPrintSingleLabel(uid) {
    const ind = individuals.find(x => x.uid === uid);
    if (!ind) { UI.toast('対象が見つかりません', 'error'); return; }
    const ctx = (window.__ylLastGenerated && window.__ylLastGenerated.ctx)
              ? window.__ylLastGenerated.ctx : _buildPromptContext();
    let png = (window.__ylLabelPngs || {})[uid];
    if (!png) {
      UI.toast('ラベルPNGを生成中...', 'success');
      png = await _ylGenerateLabelPNG(ind, ctx);
      window.__ylLabelPngs = window.__ylLabelPngs || {};
      window.__ylLabelPngs[uid] = png;
    }
    if (!png) { UI.toast('ラベルPNGの生成に失敗しました', 'error'); return; }

    const wPx = YL_LABEL_DIMS.wPx, hPx = YL_LABEL_DIMS.hPx;
    const printDoc = '<!DOCTYPE html><html><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=' + wPx + '">'
      + '<title>HERAKABU MARCHÉ Label</title>'
      + '<style>@page{size:60mm 30mm;margin:0;}'
      + 'html{margin:0;padding:0;background:#fff;}'
      + 'body{margin:0;padding:0;background:#fff;width:' + wPx + 'px;}'
      + 'img{display:block;width:' + wPx + 'px;height:' + hPx + 'px;margin:0;padding:0;'
      + '-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
      + '</style></head><body><img src="' + png + '" width="' + wPx + '" height="' + hPx + '">'
      + '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},500);});<' + '/script>'
      + '</body></html>';
    const blob = new Blob([printDoc], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (!win) {
      UI.toast('ポップアップを許可してください (アドレスバー右端のアイコン)', 'error', 5000);
      return;
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
  }

  // ── 全ラベル一括印刷 (1枚目だけ印刷ダイアログ起動。続きは個別ボタンで) ──
  // Brother iPrint&Label は1枚毎の印刷が前提のため、複数頭セットは
  // プレビュー画面の各「#N を印刷」ボタンを順次タップする運用とする。
  async function _ylPrintLabels() {
    if (!individuals.length) {
      UI.toast('ラベル対象がありません', 'error');
      return;
    }
    // 全ラベルのPNGを再生成 (プレビュー描画と同じ)
    await _ylPreviewLabels();
    // 1枚目を印刷
    if (individuals[0]) {
      _ylPrintSingleLabel(individuals[0].uid);
    }
    if (individuals.length > 1) {
      UI.toast(`#1 を印刷します。残り ${individuals.length - 1} 枚は各「#N を印刷」ボタンから`, 'success', 4500);
    }
  }

  // 公開 (onclick から呼べるよう登録)
  Pages._ylPrintSingleLabel = _ylPrintSingleLabel;

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
    .yl-labels-preview { display:flex; flex-wrap:wrap; gap:14px; padding:14px;
      max-height:560px; overflow-y:auto; background:#f5f5f5; border-radius:6px; }
    .yl-label-block { display:flex; flex-direction:column; align-items:center; gap:6px;
      background:#fff; padding:10px; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
    .yl-label-block-title { font-size:.74rem; font-weight:700; color:#444; }
    .yl-label-img { display:block; width:240px; height:auto; max-width:100%;
      border:1px solid #d0d0d0; background:#fff; }
    .yl-label-print-btn { width:100%; max-width:240px; padding:9px 10px;
      font-size:.84rem; font-weight:700; }
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

console.log('[YL] yahoo_listing.js loaded build=20260426y3');
