// ════════════════════════════════════════════════════════════════
// sale.js — Phase5 販売履歴一覧
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
  // ── フィルタ状態 ──────────────────────────────────────────────
  let filterChannel = '';
  let filterKeyword = '';

  const CHANNELS = ['ヤフオク','イベント','直接','その他'];

  function filtered() {
    return hists.filter(h => {
      if (filterChannel && h.platform !== filterChannel) return false;
      if (filterKeyword) {
        const kw = filterKeyword.toLowerCase();
        if (!String(h.ind_display_id||'').toLowerCase().includes(kw) &&
            !String(h.buyer_name||'').toLowerCase().includes(kw)) return false;
      }
      return true;
    });
  }

  function render() {
    const list    = filtered();
    const subtotal = list.reduce((s, h) => s + (parseFloat(h.actual_price) || 0), 0);
    const count   = list.length;

    main.innerHTML = UI.header('販売履歴', {})
      + '<div class="page-body">'

      // ── KPIカード ──────────────────────────────────────────
      + '<div class="card card-gold">'
      + '<div class="kpi-grid" style="grid-template-columns:1fr 1fr">'
      + '<div class="kpi-card"><div class="kpi-value">' + hists.length + '</div><div class="kpi-label">総件数</div></div>'
      + '<div class="kpi-card"><div class="kpi-value" style="font-size:1.2rem">¥' + totalRevenue.toLocaleString() + '</div><div class="kpi-label">総売上</div></div>'
      + '</div>'
      + (filterChannel || filterKeyword
          ? '<div style="font-size:.72rem;color:var(--text3);margin-top:8px;text-align:center">'
            + 'フィルタ中: ' + count + '件 / ¥' + subtotal.toLocaleString() + '</div>'
          : '')
      + '</div>'

      // ── 検索・フィルタ ─────────────────────────────────────
      + '<div class="card">'
      + '<input type="text" id="sale-search" class="input" placeholder="🔍 個体ID / 購入者名で検索"'
      + ' value="' + filterKeyword + '"'
      + ' oninput="Pages._saleSearch(this.value)">'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">'
      + '<button class="pill ' + (!filterChannel?'active':'') + '" onclick="Pages._saleChan(\'\')">すべて</button>'
      + CHANNELS.map(c =>
          '<button class="pill ' + (filterChannel===c?'active':'') + '" onclick="Pages._saleChan(\'' + c + '\')">' + c + '</button>'
        ).join('')
      + '</div>'
      + '</div>'

      // ── 一覧 ───────────────────────────────────────────────
      + (list.length === 0
          ? '<div class="page-body">' + UI.empty('該当する販売履歴がありません') + '</div>'
          : list.map(h => _saleCard(h)).join('')
        )

      + '</div>';

    // イベント再バインド
    Pages._saleSearch = (v) => { filterKeyword = v; render(); };
    Pages._saleChan   = (v) => { filterChannel = v; render(); };
  }

  render();
}

function _saleCard(h) {
  const price    = h.actual_price ? '¥' + parseFloat(h.actual_price).toLocaleString() : '—';
  const platform = h.platform || '—';
  const buyer    = h.buyer_name || '—';
  const note     = h.buyer_note || '';
  const date     = h.sold_at || h.created_at || '';
  const dispId   = h.ind_display_id || h.ind_id || '—';

  const chanColor = {
    'ヤフオク': '#9c27b0', 'メルカリ': '#e91e63', 'イベント': '#ff9800',
    '直接': '#4caf50', 'その他': '#607d8b',
  };
  const cc = chanColor[platform] || '#607d8b';

  return '<div class="card" style="margin-bottom:8px">'
    + '<div style="display:flex;align-items:flex-start;gap:10px">'
    + '<div style="flex:1;min-width:0">'

    // 個体IDと日付
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">'
    + '<span style="font-family:var(--font-mono);font-size:.82rem;font-weight:700;color:var(--gold)">'
    + dispId + '</span>'
    + '<span style="font-size:.68rem;color:var(--text3)">' + date + '</span>'
    + '</div>'

    // 価格・経路バッジ
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
    + '<span style="font-size:1.1rem;font-weight:800;color:var(--green)">' + price + '</span>'
    + '<span style="font-size:.7rem;padding:2px 8px;border-radius:10px;font-weight:700;'
    + 'background:' + cc + '22;color:' + cc + ';border:1px solid ' + cc + '44">' + platform + '</span>'
    + '</div>'

    // 購入者・メモ
    + '<div style="font-size:.8rem;color:var(--text2)">購入者: ' + buyer + '</div>'
    + (note ? '<div style="font-size:.72rem;color:var(--text3);margin-top:2px">' + note + '</div>' : '')

    + '</div>'

    // 個体詳細リンク
    + (h.ind_id
        ? '<button class="btn btn-ghost btn-sm" style="flex-shrink:0;font-size:.75rem"'
          + ' onclick="routeTo(\'ind-detail\',{indId:\'' + h.ind_id + '\'})">'
          + '詳細→</button>'
        : '')

    + '</div></div>';
}

window.PAGES = window.PAGES || {};
window.PAGES['sale-list'] = () => Pages.saleList();
