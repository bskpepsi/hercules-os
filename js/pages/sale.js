// ════════════════════════════════════════════════════════════════
// sale.js — 販売履歴一覧（Phase6 対応版）
//
// 対応内容:
//   - target_type: IND / LOT 両対応
//   - display_id / target_id / sold_count 正しく参照
//   - フリーワード検索: display_id / target_id / buyer_name 対象
//   - 詳細画面遷移: hist_id ベース（sold_at を使わない）
//   - GAS側に getSaleHist(hist_id) がない場合はローカル検索で対応
// ════════════════════════════════════════════════════════════════
'use strict';

Pages.saleList = async function () {
  const main = document.getElementById('main');
  main.innerHTML = UI.header('販売履歴', {}) + UI.spinner();

  try {
    const res = await API.sale.list({});
    if (Store.getPage() !== 'sale-list') return;
    _renderSaleList(main, res.hists || [], res.total_revenue || 0);
  } catch (e) {
    main.innerHTML = UI.header('販売履歴', {})
      + '<div class="page-body">' + UI.empty('取得失敗: ' + e.message) + '</div>';
  }
};

function _renderSaleList(main, hists, totalRevenue) {
  let filterChannel = '';
  let filterKeyword = '';
  let filterType    = ''; // '' / 'IND' / 'LOT'

  const CHANNELS = ['ヤフオク','イベント','直接','その他'];

  // ── ローカル検索用にキャッシュ ──────────────────────────────
  // 詳細遷移で hist_id → hist オブジェクトを引けるようにする
  window.__saleHistCache = {};
  hists.forEach(h => {
    if (h.hist_id) window.__saleHistCache[h.hist_id] = h;
  });

  function filtered() {
    return hists.filter(h => {
      if (filterChannel && h.platform !== filterChannel) return false;
      if (filterType    && (h.target_type || 'IND') !== filterType) return false;
      if (filterKeyword) {
        const kw = filterKeyword.toLowerCase();
        const searchTarget = [
          h.display_id, h.ind_display_id, h.target_id,
          h.ind_id, h.buyer_name, h.platform,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchTarget.includes(kw)) return false;
      }
      return true;
    });
  }

  function render() {
    const list     = filtered();
    const subtotal = list.reduce((s, h) => s + (parseFloat(h.actual_price) || 0), 0);

    main.innerHTML = UI.header('販売履歴', {})
      + '<div class="page-body">'

      // KPI
      + '<div class="card card-gold">'
      + '<div class="kpi-grid" style="grid-template-columns:1fr 1fr 1fr">'
      + '<div class="kpi-card"><div class="kpi-value">' + hists.length + '</div><div class="kpi-label">総件数</div></div>'
      + '<div class="kpi-card"><div class="kpi-value" style="font-size:1.1rem">¥' + totalRevenue.toLocaleString() + '</div><div class="kpi-label">総売上</div></div>'
      + '<div class="kpi-card"><div class="kpi-value">' + hists.filter(h => (h.target_type||'IND') === 'LOT').length + '</div><div class="kpi-label">ロット販売</div></div>'
      + '</div>'
      + (filterChannel || filterKeyword || filterType
          ? '<div style="font-size:.72rem;color:var(--text3);margin-top:8px;text-align:center">'
            + 'フィルタ中: ' + list.length + '件 / ¥' + subtotal.toLocaleString() + '</div>'
          : '')
      + '</div>'

      // 検索・フィルタ
      + '<div class="card">'
      + '<input type="text" id="sale-search" class="input" placeholder="🔍 ID / 購入者名で検索"'
      + ' value="' + filterKeyword + '"'
      + ' oninput="Pages._saleSearch(this.value)">'
      // 種別フィルタ
      + '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'
      + '<button class="pill ' + (!filterType?'active':'') + '" onclick="Pages._saleType(\'\')">すべて</button>'
      + '<button class="pill ' + (filterType==='IND'?'active':'') + '" onclick="Pages._saleType(\'IND\')">個体</button>'
      + '<button class="pill ' + (filterType==='LOT'?'active':'') + '" onclick="Pages._saleType(\'LOT\')">ロット</button>'
      + '</div>'
      // チャネルフィルタ
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">'
      + '<button class="pill ' + (!filterChannel?'active':'') + '" onclick="Pages._saleChan(\'\')">すべて</button>'
      + CHANNELS.map(c =>
          '<button class="pill ' + (filterChannel===c?'active':'') + '" onclick="Pages._saleChan(\'' + c + '\')">' + c + '</button>'
        ).join('')
      + '</div>'
      + '</div>'

      // 一覧
      + (list.length === 0
          ? UI.empty('該当する販売履歴がありません')
          : list.map(h => _saleCard(h)).join('')
        )

      + '</div>';

    // ハンドラ再バインド
    Pages._saleSearch = (v) => { filterKeyword = v; render(); };
    Pages._saleChan   = (v) => { filterChannel = v; render(); };
    Pages._saleType   = (v) => { filterType    = v; render(); };
  }

  render();
}

// ── 販売履歴カード ────────────────────────────────────────────────
function _saleCard(h) {
  // ── 表示値の正規化 ─────────────────────────────────────────
  const targetType = h.target_type || 'IND';

  // 販売対象名: display_id / ind_display_id が readable ID（HM2026-B2-L03-A 等）
  // target_id / ind_id は内部ID（IND-xxx）なのでフォールバックのみ
  const dispName   = h.display_id || h.ind_display_id || '—';

  // 種別ラベル
  const typeLabel  = targetType === 'LOT' ? 'ロット' : '個体';
  const typeColor  = targetType === 'LOT' ? '#ff9800' : '#2196f3';

  // 販売頭数（ロット販売時）
  const soldCount  = parseInt(h.sold_count || '1', 10);
  const countLabel = targetType === 'LOT' && soldCount > 1 ? soldCount + '頭' : '';

  const price      = h.actual_price ? '¥' + parseFloat(h.actual_price).toLocaleString() : '—';
  const platform   = h.platform || '—';
  const buyer      = h.buyer_name || '—';
  const note       = h.buyer_note || '';
  const date       = h.sold_at || h.created_at || '—';

  const chanColor = {
    'ヤフオク':'#9c27b0','メルカリ':'#e91e63','イベント':'#ff9800',
    '直接':'#4caf50','その他':'#607d8b',
  };
  const cc = chanColor[platform] || '#607d8b';

  // 詳細遷移:
  //   IND: ind_id（内部ID IND-xxx）を優先 → display_id を渡すと NOT_FOUND になる
  //   LOT: target_id / lot_id を使用
  const rawTargetId = targetType === 'LOT'
    ? (h.target_id || h.lot_id || '')
    : (h.ind_id || '');  // IND は ind_id のみ
  const detailFn  = targetType === 'LOT' && rawTargetId
    ? "routeTo('lot-detail',{lotId:'" + rawTargetId + "'})"
    : rawTargetId
      ? "routeTo('ind-detail',{indId:'" + rawTargetId + "'})"
      : '';
  return '<div class="card" style="margin-bottom:8px">'
    + '<div style="display:flex;align-items:flex-start;gap:10px">'
    + '<div style="flex:1;min-width:0">'

    // 1行目: 販売対象名 + 種別バッジ + 日付
    + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap">'
    + '<span style="font-family:var(--font-mono);font-size:.85rem;font-weight:700;color:var(--gold)">'
    + dispName + '</span>'
    + (countLabel ? '<span style="font-size:.72rem;color:var(--amber)">' + countLabel + '</span>' : '')
    + '<span style="font-size:.68rem;padding:1px 7px;border-radius:8px;font-weight:700;'
    + 'background:' + typeColor + '22;color:' + typeColor + ';border:1px solid ' + typeColor + '44">'
    + typeLabel + '</span>'
    + '<span style="font-size:.68rem;color:var(--text3)">' + date + '</span>'
    + '</div>'

    // 2行目: 金額 + チャネルバッジ
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'
    + '<span style="font-size:1.1rem;font-weight:800;color:var(--green)">' + price + '</span>'
    + '<span style="font-size:.7rem;padding:2px 8px;border-radius:10px;font-weight:700;'
    + 'background:' + cc + '22;color:' + cc + ';border:1px solid ' + cc + '44">' + platform + '</span>'
    + '</div>'

    // 3行目: 購入者
    + '<div style="font-size:.8rem;color:var(--text2)">購入者: ' + buyer + '</div>'
    + (note ? '<div style="font-size:.72rem;color:var(--text3);margin-top:2px">' + note + '</div>' : '')

    + '</div>'

    // 右側: 詳細ボタン（target があれば）
    + (detailFn
        ? '<button class="btn btn-ghost btn-sm" style="flex-shrink:0;font-size:.75rem"'
          + ' onclick="' + detailFn + '">詳細→</button>'
        : '')

    + '</div></div>';
}

window.PAGES = window.PAGES || {};
window.PAGES['sale-list'] = () => Pages.saleList();
