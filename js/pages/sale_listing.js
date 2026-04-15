// FILE: js/pages/sale_listing.js
// ════════════════════════════════════════════════════════════════
// sale_listing.js — ヤフオク出品文AIジェネレーター
// HerculesOSのStore（ロット・個体・種親・ライン）から情報を自動取得し
// Google Gemini 2.0 Flash API（無料枠）でプロ品質の出品文を生成する
//
// build: 20260416e
// 変更点: Geminiモデルを gemini-2.5-flash に更新（無料枠対応・最新モデル）
// ════════════════════════════════════════════════════════════════
'use strict';

window.PAGES = window.PAGES || {};
window.PAGES['sale-listing'] = () => Pages.saleListing(Store.getParams());

Pages.saleListing = function (params = {}) {
  const main = document.getElementById('main');

  let targetType  = params.targetType || 'LOT';
  let targetId    = params.targetId   || '';
  let listingType = 'larva_lot';

  // ── Storeから個体リスト取得 ──────────────────────────────────
  function _getIndividuals() {
    if (targetType === 'LOT' && targetId) {
      return (Store.filterIndividuals && Store.filterIndividuals({ lot_id: targetId })) || [];
    }
    if (targetType === 'IND' && targetId) {
      const ind = Store.getIndividual(targetId);
      return ind ? [ind] : [];
    }
    return [];
  }

  // ── 個体体重フィールドを描画 ─────────────────────────────────
  function _renderWeightFields() {
    const container = document.getElementById('sl-weight-fields');
    if (!container) return;

    const inds = _getIndividuals();
    const count = inds.length > 0 ? inds.length
      : (targetType === 'LOT' ? parseInt((Store.getLot(targetId)||{}).count||0) || 1 : 1);

    if (!targetId) {
      container.innerHTML = '<span style="font-size:.8rem;color:var(--text3)">対象を選択すると個体欄が表示されます</span>';
      return;
    }

    let html = `<div style="margin-bottom:6px;font-size:.75rem;font-weight:700;color:var(--text2)">
      個体別　現在体重・性別
      <span style="font-weight:400;color:var(--text3)">（記録済みの値を自動入力。変更可）</span>
    </div>`;

    // ヘッダー行
    html += `<div style="display:grid;grid-template-columns:52px 90px 100px;gap:6px;
      margin-bottom:4px;font-size:.72rem;font-weight:700;color:var(--text3);padding:0 2px">
      <div></div><div>性別</div><div>現在体重</div>
    </div>`;

    for (let i = 0; i < count; i++) {
      const ind    = inds[i] || {};
      const sex    = ind.sex              || (i % 2 === 0 ? '♂' : '♀');
      const weight = ind.latest_weight_g  || '';
      html += `<div style="display:grid;grid-template-columns:52px 90px 100px;gap:6px;
        margin-bottom:6px;align-items:center">
        <div style="font-size:.78rem;font-weight:700;color:var(--text3)">個体 ${i + 1}</div>
        <select id="sl-ind-sex-${i}" class="input" style="padding:6px 4px;font-size:.82rem">
          <option value="♂" ${sex==='♂'?'selected':''}>♂ オス</option>
          <option value="♀" ${sex==='♀'?'selected':''}>♀ メス</option>
          <option value="不明" ${sex==='不明'?'selected':''}>不明</option>
        </select>
        <div style="position:relative">
          <input id="sl-ind-weight-${i}" class="input" type="number"
            step="0.1" min="0" max="500"
            style="padding:6px 28px 6px 8px;font-size:.82rem"
            value="${weight}" placeholder="—">
          <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);
            font-size:.72rem;color:var(--text3);pointer-events:none">g</span>
        </div>
      </div>`;
    }
    container.innerHTML = html;
  }

  // ── 種親情報取得 ─────────────────────────────────────────────
  function _getParents() {
    const pars = Store.getDB('parents') || [];
    if (targetType === 'PAR') {
      return { father: null, mother: null, self: pars.find(p => p.par_id === targetId) || {} };
    }
    let lineId = '';
    if (targetType === 'LOT') lineId = (Store.getLot(targetId)||{}).line_id;
    if (targetType === 'IND') lineId = (Store.getIndividual(targetId)||{}).line_id;
    if (!lineId) return { father: null, mother: null };
    const pairing = (Store.getDB('pairings')||[])
      .filter(p => p.line_id === lineId)
      .sort((a, b) => String(b.pairing_start||'').localeCompare(String(a.pairing_start||'')))[0];
    if (!pairing) return { father: null, mother: null };
    return {
      father: pars.find(p => p.par_id === pairing.father_par_id) || null,
      mother: pars.find(p => p.par_id === pairing.mother_par_id) || null,
    };
  }

  // ── フォーム値収集 ───────────────────────────────────────────
  function _getFormValues() {
    const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const c = id => { const el = document.getElementById(id); return el ? el.checked : true; };

    const inds  = _getIndividuals();
    const count = inds.length > 0 ? inds.length
      : (targetType === 'LOT' ? parseInt((Store.getLot(targetId)||{}).count||0)||1 : 1);
    const indData = [];
    for (let i = 0; i < count; i++) {
      indData.push({ sex: g(`sl-ind-sex-${i}`) || '不明', weight: g(`sl-ind-weight-${i}`) });
    }

    return {
      listing_type:    listingType,
      extra_appeal:    g('sl-extra-appeal'),
      price_range:     g('sl-price-range'),
      weight_date:     g('sl-weight-date'),
      shipping_method: g('sl-shipping-method') || 'ゆうパック（80サイズ）',
      shipping_fee:    g('sl-shipping-fee')    || '別途300円',
      shipping_from:   g('sl-shipping-from')   || '大阪府',
      chk_sexerr:  c('sl-chk-sexerr'),
      chk_cold:    c('sl-chk-cold'),
      chk_mite:    c('sl-chk-mite'),
      chk_dead:    c('sl-chk-dead'),
      chk_label:   c('sl-chk-label'),
      chk_payment: c('sl-chk-payment'),
      manage_no:   g('sl-manage-no'),
      tone:        g('sl-tone') || 'professional',
      ind_data:    indData,
    };
  }

  // ── プロンプト構築 ────────────────────────────────────────────
  function _buildPrompt(ex) {
    const SL = { T0:'卵', T1:'1令', L1L2:'1〜2令', L3:'3令', T2:'3令', T3:'3令',
      PREPUPA:'前蛹', PUPA:'蛹', ADULT:'成虫', ADULT_PRE:'成虫（未後食）' };

    let species = 'ヘラクレスオオカブト';
    let stageStr = '', hatchDate = '', lotCount = 0;
    let fatherInfo = '', motherInfo = '';

    // データ収集
    if (targetType === 'LOT' && targetId) {
      const lot  = Store.getLot(targetId) || {};
      const line = Store.getLine(lot.line_id) || {};
      species    = line.species || lot.species || species;
      lotCount   = parseInt(lot.count) || ex.ind_data.length;
      hatchDate  = lot.hatch_date || '';
      stageStr   = SL[lot.stage] || lot.stage || '';
    } else if (targetType === 'IND' && targetId) {
      const ind  = Store.getIndividual(targetId) || {};
      const line = Store.getLine(ind.line_id) || {};
      species    = line.species || ind.species || species;
      lotCount   = 1;
      hatchDate  = ind.hatch_date || '';
      stageStr   = SL[ind.current_stage] || ind.current_stage || '';
    }

    // 種親
    const parents = _getParents();
    function _parBlood(raw) {
      try { const a = JSON.parse(raw||''); if (Array.isArray(a)) return a.filter(Boolean).join(' '); } catch(_){}
      return raw || '';
    }
    if (parents.self) {
      const p = parents.self;
      species = p.species || species;
      fatherInfo = `${p.sex||''} ${p.size_mm?p.size_mm+'mm':''}${_parBlood(p.paternal_raw)?'（'+_parBlood(p.paternal_raw)+'）':''}`;
      fatherInfo += p.eclosion_date      ? ` 羽化:${p.eclosion_date}`         : '';
      fatherInfo += p.feeding_start_date ? ` 後食:${p.feeding_start_date}`    : '';
    } else {
      if (parents.father) {
        const f = parents.father;
        fatherInfo = `♂ ${f.size_mm?f.size_mm+'mm':''}${_parBlood(f.paternal_raw)?'（'+_parBlood(f.paternal_raw)+'）':''}`;
      }
      if (parents.mother) {
        const m = parents.mother;
        motherInfo = `♀ ${m.size_mm?m.size_mm+'mm':''}${_parBlood(m.paternal_raw)?'（'+_parBlood(m.paternal_raw)+'）':''}`;
      }
    }

    // 体重まとめ
    const indData = ex.ind_data || [];
    const males   = indData.filter(i => i.sex === '♂');
    const females = indData.filter(i => i.sex === '♀');
    const mWts    = males.filter(i   => i.weight).map(i => i.weight + 'g');
    const fWts    = females.filter(i => i.weight).map(i => i.weight + 'g');
    const hasWts  = indData.some(i => i.weight);

    let weightBlock = '';
    if (hasWts) {
      weightBlock = `現在体重${ex.weight_date?'（'+ex.weight_date+'時点）':''}:\n`;
      if (mWts.length > 0) weightBlock += `  ♂: ${mWts.join('、')}\n`;
      if (fWts.length > 0) weightBlock += `  ♀: ${fWts.join('、')}\n`;
      weightBlock += '※輸送ストレスで一時的に体重が落ちる可能性あり\n';
    }

    const sexSummary = (males.length > 0 || females.length > 0)
      ? `♂${males.length}頭 ♀${females.length}頭`
      : `${lotCount}頭`;

    const ltLabel = { larva_lot:'幼虫セット（'+sexSummary+'）', larva_single:'幼虫 単頭',
      adult:'成虫', set:'産卵セット' }[listingType] || '幼虫';

    // 注意事項リスト
    const notices = [];
    if (ex.chk_sexerr)  notices.push('雌雄誤判別の可能性あり（目視による）');
    notices.push(`発送: ${ex.shipping_method}（梱包費${ex.shipping_fee}）/ ${ex.shipping_from}発送`);
    if (ex.chk_cold)    notices.push('季節に応じて保冷剤・カイロ梱包対応');
    notices.push('包装資材に中古資材を使用する場合あり');
    notices.push('海外発送不可');
    if (ex.chk_dead)    notices.push('死着保証なし（中1日以上の地域はリスク承知の上で入札を）');
    notices.push('輸送中トラブルの補償不可');
    if (ex.chk_payment) notices.push('落札後48時間以内に入金できる方のみ入札してください');
    notices.push('受取希望日は落札後の取引連絡より');
    if (ex.chk_mite)    notices.push('ダニ・コバエ等の混入の可能性あり（細心の注意を払って梱包します）');
    if (ex.chk_label)   notices.push('発送時に個体ごと雌雄・血統・サイズ等をラベリングして発送');
    notices.push('ご不明な点は質問よりご連絡ください');

    const toneDesc = {
      professional: '専門ブリーダーとして信頼感・誠実さを前面に出した丁寧な文体',
      premium:      '大型血統の希少性・ブリード価値を強調したプレミアム感ある文体',
      casual:       '親しみやすく読みやすいカジュアルな文体',
    }[ex.tone] || '';

    return `あなたはヘラクレスオオカブトを中心とした外国産カブトムシの専門ブリーダーです。
以下の情報を元に、ヤフオク出品テキストを生成してください。

━━ 出品情報 ━━

【出品種別】${ltLabel}
【種】${species}
【種親】
${fatherInfo || '♂ 情報なし'}
${motherInfo || ''}

${(stageStr||hatchDate||lotCount) ? `【幼虫情報】
頭数: ${lotCount}頭（${sexSummary}）
ステージ: ${stageStr}
${hatchDate ? '孵化日: ' + hatchDate : ''}
${weightBlock}` : ''}

${ex.extra_appeal ? `【出品者コメント（必ず本文に盛り込むこと）】\n${ex.extra_appeal}\n` : ''}
${ex.price_range  ? `【価格帯】${ex.price_range}（この価格帯に見合った価値が伝わる文章に）\n` : ''}
${ex.manage_no    ? `【管理番号】${ex.manage_no}\n` : ''}

【注意事項（全項目を漏れなく記載すること）】
${notices.map((n,i)=>`${i+1}. ${n}`).join('\n')}

【文体】${toneDesc}

━━ 出力フォーマット（厳守） ━━

JSONやコードブロック記号などの装飾は不要です。以下の形式で出力してください。

TITLE:
（商品タイトル。最大65文字。種名・令・頭数・種親サイズ・血統の要点を簡潔に。絵文字・記号で視認性UP可）

DESCRIPTION:
（商品説明文。以下の順序で記述:
1. リード文（2〜3行。この商品の最大の魅力を端的に）
2. 【種親情報】
3. 【幼虫情報】または【成虫情報】（体重・孵化日・雌雄を含む）
4. 【おすすめポイント】（3〜5箇条。具体的かつ購買意欲が高まる内容）
5. 【注意事項】（上記の全項目を◆マークで列記。省略・まとめ不可）
6. 管理番号（あれば最後に「管理番号：」で記載）
実際の改行を使い読みやすく整形すること。)`;
  }

  // ── Gemini API呼び出し ───────────────────────────────────────
  async function _callGemini(prompt, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.82, maxOutputTokens: 2048, topP: 0.9 },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) throw new Error('Geminiからのレスポンスが空でした');
    return text;
  }

  // ── 生成実行 ────────────────────────────────────────────────
  async function _generate() {
    const keyEl  = document.getElementById('sl-api-key');
    const apiKey = (keyEl?.value || '').trim() || localStorage.getItem('hercules_gemini_key') || '';
    if (!apiKey) {
      UI.toast && UI.toast('Gemini APIキーを入力してください', 'error');
      keyEl?.focus();
      return;
    }
    localStorage.setItem('hercules_gemini_key', apiKey);

    const btn     = document.getElementById('sl-gen-btn');
    const spinner = document.getElementById('sl-spinner');
    const errEl   = document.getElementById('sl-error');
    if (btn)     btn.disabled         = true;
    if (spinner) spinner.style.display = 'flex';
    if (errEl)   errEl.style.display   = 'none';

    const titleEl = document.getElementById('sl-out-title');
    const descEl  = document.getElementById('sl-out-desc');
    if (titleEl) titleEl.value = '生成中...';
    if (descEl)  descEl.value  = '';

    try {
      const ex   = _getFormValues();
      const text = await _callGemini(_buildPrompt(ex), apiKey);

      const titleMatch = text.match(/TITLE:\s*\n?([\s\S]*?)(?=\nDESCRIPTION:|$)/i);
      const descMatch  = text.match(/DESCRIPTION:\s*\n?([\s\S]*)/i);
      if (titleEl) { titleEl.value = titleMatch ? titleMatch[1].trim() : ''; _charCount('sl-out-title','sl-count-title',65); }
      if (descEl)  { descEl.value  = descMatch  ? descMatch[1].trim()  : text.trim(); _charCount('sl-out-desc','sl-count-desc',99999); }

      _switchTab('title');
      UI.toast && UI.toast('出品文を生成しました ✅', 'success');
    } catch (err) {
      console.error('[SALE_LISTING]', err);
      if (titleEl) titleEl.value = '';
      if (errEl) {
        errEl.textContent = '⚠️ 生成失敗: ' + err.message
          + (err.message.includes('API_KEY') || err.message.includes('400') ? '\n→ APIキーを確認してください' : '');
        errEl.style.display = 'block';
      }
    } finally {
      if (btn)     btn.disabled         = false;
      if (spinner) spinner.style.display = 'none';
    }
  }

  // ── ユーティリティ ───────────────────────────────────────────
  function _switchTab(id) {
    document.querySelectorAll('.sl-tab').forEach(t => t.classList.remove('sl-tab-active'));
    document.querySelectorAll('.sl-tab-panel').forEach(p => p.classList.remove('sl-tab-panel-active'));
    const btn   = document.querySelector(`.sl-tab[data-tab="${id}"]`);
    const panel = document.getElementById('sl-tab-' + id);
    if (btn)   btn.classList.add('sl-tab-active');
    if (panel) panel.classList.add('sl-tab-panel-active');
  }

  function _copy(id) {
    const el = document.getElementById(id);
    if (!el?.value) { UI.toast && UI.toast('テキストがありません', 'error'); return; }
    navigator.clipboard.writeText(el.value)
      .then(()  => UI.toast && UI.toast('コピーしました 📋', 'success'))
      .catch(()  => { document.execCommand('copy'); UI.toast && UI.toast('コピーしました 📋', 'success'); });
  }

  function _charCount(taId, cntId, max) {
    const el  = document.getElementById(taId);
    const cnt = document.getElementById(cntId);
    if (!el || !cnt) return;
    const len = el.value.length;
    cnt.textContent = max === 65 ? `${len} / ${max}文字` : `${len.toLocaleString()}文字`;
    if (max === 65) cnt.style.color = len > 65 ? '#e05050' : len > 55 ? '#c8993a' : '#7a7672';
  }

  function _updateSummary() {
    const el = document.getElementById('sl-target-summary');
    if (!el) return;
    const SL = { T0:'卵', T1:'1令', L1L2:'1〜2令', L3:'3令', T2:'3令', T3:'3令',
      PREPUPA:'前蛹', PUPA:'蛹', ADULT:'成虫', ADULT_PRE:'成虫（未後食）' };
    let html = '';
    if (targetType === 'LOT') {
      const lot  = Store.getLot(targetId) || {};
      const line = Store.getLine(lot.line_id) || {};
      html = `<b>${lot.display_id||targetId}</b>　${line.line_code||''}　${SL[lot.stage]||lot.stage||''}　${lot.count||''}頭`;
      if (lot.hatch_date) html += `　孵化: ${lot.hatch_date}`;
    } else if (targetType === 'IND') {
      const ind = Store.getIndividual(targetId) || {};
      html = `<b>${ind.display_id||targetId}</b>　${ind.sex||''}　${ind.latest_weight_g?ind.latest_weight_g+'g':''}`;
    } else if (targetType === 'PAR') {
      const par = (Store.getDB('parents')||[]).find(p => p.par_id === targetId) || {};
      html = `<b>${par.parent_display_id||targetId}</b>　${par.sex||''}　${par.size_mm?par.size_mm+'mm':''}`;
    }
    el.innerHTML = html || '<span style="color:var(--text3)">情報なし</span>';
    _renderWeightFields();
    // 体重カード表示制御
    const wc = document.getElementById('sl-weight-card');
    if (wc) wc.style.display = (targetType === 'PAR') ? 'none' : '';
  }

  // ── データ ──────────────────────────────────────────────────
  const lots = Store.filterLots({ status: 'active' }) || [];
  const inds = Store.filterIndividuals({ status: 'alive' }) || [];
  const pars = (Store.getDB('parents')||[]).filter(p => !p.status || p.status === 'active');
  const SL   = { T0:'卵', T1:'1令', L1L2:'1〜2令', L3:'3令', T2:'3令', T3:'3令',
    PREPUPA:'前蛹', PUPA:'蛹', ADULT:'成虫', ADULT_PRE:'成虫（未後食）' };
  const savedKey = localStorage.getItem('hercules_gemini_key') || '';

  // ── レンダリング ─────────────────────────────────────────────
  main.innerHTML = `
    ${UI.header('出品文AIジェネレーター', { back: true })}
    <style>
      .sl-tab { flex:1;padding:10px 4px;font-size:.82rem;font-weight:700;
        color:var(--text3);background:transparent;border:none;cursor:pointer;
        border-bottom:2.5px solid transparent;font-family:inherit;transition:.15s; }
      .sl-tab-active { color:var(--green) !important; border-bottom-color:var(--green) !important; }
      .sl-tab-panel  { display:none; padding:14px; }
      .sl-tab-panel-active { display:block; }
      .sl-lbl { display:block;font-size:.75rem;font-weight:700;color:var(--text2);margin-bottom:4px; }
      .sl-lbl .o { font-weight:400;color:var(--text3); }
      .sl-r2 { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
      .sl-r3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px; }
      .sl-guide { background:rgba(45,122,82,.08);border:1px solid rgba(45,122,82,.2);
        border-radius:6px;padding:10px 12px;font-size:.77rem;color:var(--text2);
        line-height:1.75;margin-bottom:10px; }
      .sl-free { display:inline-block;background:rgba(45,122,82,.2);color:var(--green);
        border:1px solid rgba(45,122,82,.4);border-radius:4px;
        padding:1px 7px;font-size:.72rem;font-weight:700;margin-left:6px; }
      .sl-chks { display:grid;grid-template-columns:1fr 1fr;gap:4px 12px; }
      .sl-chklbl { display:flex;align-items:center;gap:7px;cursor:pointer;
        font-size:.82rem;color:var(--text2);padding:4px 0; }
    </style>

    <div style="max-width:860px;margin:0 auto;padding:0 12px 48px">

      <!-- ① APIキー -->
      <div class="card" style="margin-top:12px">
        <div class="card-title">🔑 Gemini APIキー<span class="sl-free">無料</span></div>
        <div class="sl-guide">
          <b>Google Gemini API</b>は無料で利用できます（1日1,500リクエストまで）。<br>
          <b>取得手順：</b>
          <a href="https://aistudio.google.com/app/apikey" target="_blank"
            style="color:var(--green);font-weight:700">aistudio.google.com/app/apikey</a>
          を開く → Googleアカウントでログイン → 「APIキーを作成」→ コピーして貼り付け。<br>
          入力後は端末に保存され次回から自動入力されます。
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="sl-api-key" class="input" type="password" style="flex:1"
            placeholder="AIzaSy..." value="${savedKey}"
            oninput="localStorage.setItem('hercules_gemini_key',this.value.trim())">
          <button class="btn btn-ghost btn-sm" style="white-space:nowrap;flex-shrink:0"
            onclick="(function(){const e=document.getElementById('sl-api-key');e.type=e.type==='password'?'text':'password';})()">
            👁 表示
          </button>
        </div>
      </div>

      <!-- ② 出品対象 -->
      <div class="card" style="margin-top:10px">
        <div class="card-title">🎯 出品対象</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${['LOT','IND','PAR'].map(t =>
            `<button class="pill ${targetType===t?'active':''}"
              onclick="Pages._slSetTargetType('${t}')">
              ${t==='LOT'?'ロット（複数頭）':t==='IND'?'個体（単頭）':'種親（成虫）'}
            </button>`).join('')}
        </div>

        ${targetType==='LOT' ? `
          <select class="input" id="sl-target-sel" onchange="Pages._slSetTargetId(this.value)">
            <option value="">ロットを選択...</option>
            ${lots.map(l=>`<option value="${l.lot_id}" ${l.lot_id===targetId?'selected':''}>
              ${l.display_id}　${SL[l.stage]||l.stage||''}　${l.count}頭${l.hatch_date?' 孵化:'+l.hatch_date:''}</option>`).join('')}
          </select>`
        : targetType==='IND' ? `
          <select class="input" id="sl-target-sel" onchange="Pages._slSetTargetId(this.value)">
            <option value="">個体を選択...</option>
            ${inds.map(i=>`<option value="${i.ind_id}" ${i.ind_id===targetId?'selected':''}>
              ${i.display_id}　${i.sex||''}　${i.latest_weight_g?i.latest_weight_g+'g':''}</option>`).join('')}
          </select>`
        : `
          <select class="input" id="sl-target-sel" onchange="Pages._slSetTargetId(this.value)">
            <option value="">種親を選択...</option>
            ${pars.map(p=>`<option value="${p.par_id}" ${p.par_id===targetId?'selected':''}>
              ${p.parent_display_id||p.par_id}　${p.sex||''}　${p.size_mm?p.size_mm+'mm':''}</option>`).join('')}
          </select>`}

        <div id="sl-target-summary" style="margin-top:8px;font-size:.82rem;padding:6px 10px;
          background:rgba(45,122,82,.07);border:1px solid rgba(45,122,82,.18);
          border-radius:6px;min-height:28px;color:var(--text2)">
          <span style="color:var(--text3)">対象を選択してください</span>
        </div>
      </div>

      <!-- ③ 出品種別 -->
      <div class="card" style="margin-top:10px">
        <div class="card-title">📋 出品種別</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${[['larva_lot','🐛 幼虫セット'],['larva_single','🐛 幼虫 単頭'],
             ['adult','🦋 成虫'],['set','🥚 産卵セット']].map(([v,l])=>
            `<button class="pill ${listingType===v?'active':''}"
              onclick="Pages._slSetListingType('${v}')">${l}</button>`).join('')}
        </div>
      </div>

      <!-- ④ 個体別 体重・性別 -->
      <div class="card" id="sl-weight-card" style="margin-top:10px;${targetType==='PAR'?'display:none':''}">
        <div class="card-title">⚖️ 個体別　現在体重・性別</div>
        <div style="margin-bottom:10px">
          <label class="sl-lbl">
            計測日 <span class="o">（体重を入力した場合に説明文へ記載）</span>
          </label>
          <input id="sl-weight-date" class="input" type="text"
            style="max-width:180px" placeholder="例: 2026/3/25">
        </div>
        <div id="sl-weight-fields">
          <span style="font-size:.8rem;color:var(--text3)">対象を選択すると個体欄が表示されます</span>
        </div>
      </div>

      <!-- ⑤ 補足・AIへの指示 -->
      <div class="card" style="margin-top:10px">
        <div class="card-title">✍️ AIへの追加指示・補足</div>
        <div style="margin-bottom:10px">
          <label class="sl-lbl">
            アピールポイント・特記事項
            <span class="o">（自由記述。AIへの指示として反映されます）</span>
          </label>
          <textarea id="sl-extra-appeal" class="input" rows="3" style="resize:vertical"
            placeholder="例: ♀親は3系統クロスで150mm以上を狙える配合。孵化日が揃っており一斉管理しやすい。"></textarea>
        </div>
        <div class="sl-r3" style="margin-bottom:0">
          <div>
            <label class="sl-lbl">価格帯イメージ <span class="o">任意</span></label>
            <input id="sl-price-range" class="input" type="text" placeholder="例: 5,000〜8,000円">
          </div>
          <div>
            <label class="sl-lbl">文体</label>
            <select id="sl-tone" class="input">
              <option value="professional">プロ・信頼感重視</option>
              <option value="premium">プレミアム・希少感重視</option>
              <option value="casual">親しみやすいカジュアル</option>
            </select>
          </div>
          <div>
            <label class="sl-lbl">管理番号 <span class="o">任意</span></label>
            <input id="sl-manage-no" class="input" type="text" placeholder="例: 34-1.2.3">
          </div>
        </div>
      </div>

      <!-- ⑥ 発送・注意事項 -->
      <div class="card" style="margin-top:10px">
        <div class="card-title">📦 発送・注意事項</div>
        <div class="sl-r3" style="margin-bottom:12px">
          <div>
            <label class="sl-lbl">発送方法</label>
            <input id="sl-shipping-method" class="input" type="text" value="ゆうパック（80サイズ）">
          </div>
          <div>
            <label class="sl-lbl">梱包費</label>
            <input id="sl-shipping-fee" class="input" type="text" value="別途300円">
          </div>
          <div>
            <label class="sl-lbl">発送元</label>
            <input id="sl-shipping-from" class="input" type="text" value="大阪府">
          </div>
        </div>
        <div class="sl-chks">
          ${[['sl-chk-sexerr',true,'雌雄誤判別の可能性あり'],
             ['sl-chk-cold',  true,'保冷剤・カイロ梱包対応'],
             ['sl-chk-mite',  true,'ダニ・コバエ混入の可能性'],
             ['sl-chk-dead',  true,'死着保証なし'],
             ['sl-chk-label', true,'個体ごとラベリング発送'],
             ['sl-chk-payment',true,'落札後48時間以内入金']].map(([id,def,lbl])=>
            `<label class="sl-chklbl">
              <input type="checkbox" id="${id}" ${def?'checked':''}> <span>${lbl}</span>
            </label>`).join('')}
        </div>
      </div>

      <!-- 生成ボタン -->
      <div style="margin-top:14px">
        <button id="sl-gen-btn" class="btn btn-primary btn-full"
          style="padding:15px;font-size:1rem;font-weight:700;letter-spacing:.5px"
          onclick="Pages._slGenerate()">
          ✨ AIで出品文を生成する（Gemini 無料）
        </button>
        <div id="sl-spinner" style="display:none;align-items:center;justify-content:center;
          gap:10px;padding:14px;font-size:.88rem;font-weight:700;color:var(--green)">
          <div class="spinner"></div> Gemini AIが出品文を作成中...（10〜20秒ほど）
        </div>
        <div id="sl-error" style="display:none;margin-top:8px;padding:10px 12px;
          background:rgba(192,48,64,.1);border:1px solid rgba(192,48,64,.3);
          border-radius:6px;font-size:.82rem;color:#e06070;white-space:pre-line"></div>
      </div>

      <!-- 出力 -->
      <div class="card" style="margin-top:14px">
        <div style="display:flex;border-bottom:1px solid var(--border)">
          <button class="sl-tab sl-tab-active" data-tab="title"
            onclick="Pages._slSwitchTab('title')">📌 商品タイトル</button>
          <button class="sl-tab" data-tab="desc"
            onclick="Pages._slSwitchTab('desc')">📝 商品説明文</button>
        </div>

        <div class="sl-tab-panel sl-tab-panel-active" id="sl-tab-title">
          <textarea id="sl-out-title"
            style="width:100%;min-height:88px;background:var(--bg3);
              border:1px solid var(--border);border-radius:6px;color:var(--text);
              font-family:inherit;font-size:.92rem;line-height:1.6;
              padding:10px 12px;resize:none;outline:none"
            oninput="Pages._slCharCount('sl-out-title','sl-count-title',65)"
            placeholder="生成ボタンを押すとここにタイトルが表示されます"></textarea>
          <div style="font-size:.72rem;text-align:right;margin-top:3px;color:var(--text3)"
            id="sl-count-title">0 / 65文字</div>
          <button class="btn btn-primary btn-full" style="margin-top:8px"
            onclick="Pages._slCopy('sl-out-title')">📋 タイトルをコピー</button>
        </div>

        <div class="sl-tab-panel" id="sl-tab-desc">
          <textarea id="sl-out-desc"
            style="width:100%;min-height:500px;background:var(--bg3);
              border:1px solid var(--border);border-radius:6px;color:var(--text);
              font-family:inherit;font-size:.82rem;line-height:1.85;
              padding:10px 12px;resize:vertical;outline:none"
            oninput="Pages._slCharCount('sl-out-desc','sl-count-desc',99999)"
            placeholder="生成ボタンを押すとここに説明文が表示されます"></textarea>
          <div style="font-size:.72rem;text-align:right;margin-top:3px;color:var(--text3)"
            id="sl-count-desc">0文字</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-primary" style="flex:2"
              onclick="Pages._slCopy('sl-out-desc')">📋 説明文をコピー</button>
            <button class="btn btn-ghost" style="flex:1"
              onclick="Pages._slGenerate()">🔄 再生成</button>
          </div>
        </div>
      </div>

    </div>`;

  // ── バインド ─────────────────────────────────────────────────
  Pages._slGenerate    = _generate;
  Pages._slSwitchTab   = _switchTab;
  Pages._slCopy        = _copy;
  Pages._slCharCount   = _charCount;

  Pages._slSetTargetType = (type) => {
    targetType = type;
    targetId   = '';
    Pages.saleListing({ targetType: type });
  };

  Pages._slSetTargetId = (id) => {
    targetId = id;
    if (targetType === 'LOT') {
      const lot = Store.getLot(id) || {};
      const s   = lot.stage || '';
      listingType = (s === 'ADULT' || s === 'ADULT_PRE') ? 'adult'
        : parseInt(lot.count) > 1 ? 'larva_lot' : 'larva_single';
    } else if (targetType === 'IND') {
      const ind = Store.getIndividual(id) || {};
      const s   = ind.current_stage || '';
      listingType = (s === 'ADULT' || s === 'ADULT_PRE') ? 'adult' : 'larva_single';
    } else if (targetType === 'PAR') {
      listingType = 'adult';
    }
    // ボタン見た目更新
    document.querySelectorAll('.pill').forEach(b => {
      const oc = b.getAttribute('onclick') || '';
      if (oc.includes('_slSetListingType')) b.classList.toggle('active', oc.includes(`'${listingType}'`));
    });
    _updateSummary();
  };

  Pages._slSetListingType = (type) => {
    listingType = type;
    document.querySelectorAll('.pill').forEach(b => {
      const oc = b.getAttribute('onclick') || '';
      if (oc.includes('_slSetListingType')) b.classList.toggle('active', oc.includes(`'${type}'`));
    });
    const wc = document.getElementById('sl-weight-card');
    if (wc) wc.style.display = (targetType === 'PAR') ? 'none' : '';
  };

  if (targetId) _updateSummary();
};
