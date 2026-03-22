// ════════════════════════════════════════════════════════════════
// normalize.js — エンティティ表示用正規化 + 共通カード骨格
//
// 配置先: js/normalize.js
// 読み込み順: config.js の後、各画面JS より前
//
// 役割:
//   1. normalizeLineForView(line)      ライン表示用正規化
//   2. normalizeLotForView(lot)        ロット表示用正規化
//   3. normalizeIndForView(ind)        個体表示用正規化
//   4. renderEntityCard(vm, onClick)   共通カード骨格HTML生成
//   5. renderLineCard(vm)              ライン用カード
//   6. renderLotCard(vm)               ロット用カード
//   7. renderIndCard(vm)               個体用カード
//
// イベント委譲:
//   カードに data-entity-id + data-entity-type を付与。
//   app.js のグローバルハンドラで lot-detail / ind-detail へ遷移。
// ════════════════════════════════════════════════════════════════
'use strict';

// ════════════════════════════════════════════════════════════════
// 旧ステージコード → 新ステージコード変換マップ
// ════════════════════════════════════════════════════════════════
var _STAGE_OLD_TO_NEW = {
  // 旧T系 → 新6区分
  T0: 'L1L2', T1: 'L1L2',
  T2A: 'L3', T2B: 'L3', T3: 'L3',
  // 旧L細分 → 新6区分
  L1: 'L1L2', L2_EARLY: 'L1L2', L2_LATE: 'L1L2',
  L3_EARLY: 'L3', L3_MID: 'L3', L3_LATE: 'L3',
  // EGG
  EGG: 'L1L2',
};

// IND_STATUS 値（ステージコードではない）
var _IND_STATUS_VALS = new Set([
  'larva','prepupa','pupa','adult','alive','seed_candidate','seed_reserved',
  'for_sale','reserved','listed','sold','dead','excluded',
]);

// ────────────────────────────────────────────────────────────────
// _normalizeStage — ステージコードを新6区分に正規化
//   - 旧T系/旧L細分 → L1L2/L3/PREPUPA/PUPA/ADULT_PRE/ADULT
//   - IND_STATUS 値は '' を返す（ステージとして扱わない）
// ────────────────────────────────────────────────────────────────
function _normalizeStage(rawStage) {
  if (!rawStage) return '';
  if (_IND_STATUS_VALS.has(rawStage)) return '';
  return _STAGE_OLD_TO_NEW[rawStage] || rawStage;
}

// ────────────────────────────────────────────────────────────────
// _normalizeMat — マットコードを新設計に正規化
//   - T2A → T2 (mat_molt=true)
//   - T2B → T2 (mat_molt=false)
//   - その他はそのまま
// ────────────────────────────────────────────────────────────────
function _normalizeMat(rawMat, rawMolt) {
  var mat  = rawMat || '';
  var molt = rawMolt === true || rawMolt === 'true' || rawMolt === '1';
  if (mat === 'T2A') { mat = 'T2'; molt = true;  }
  if (mat === 'T2B') { mat = 'T2'; molt = false; }
  return { mat: mat, molt: molt };
}

// ────────────────────────────────────────────────────────────────
// _matLabel — マット表示ラベル（T2+molt → T2(M)）
// ────────────────────────────────────────────────────────────────
function _matLabel(mat, molt) {
  if (!mat) return '';
  if (mat === 'T2' && molt) return 'T2(M)';
  return mat;
}

// ────────────────────────────────────────────────────────────────
// _stageLbl — ステージ表示ラベル（stageLabel() のセーフラッパー）
// ────────────────────────────────────────────────────────────────
function _stageLbl(code) {
  if (!code) return '';
  if (typeof stageLabel === 'function') return stageLabel(code) || '';
  return code;
}

// ────────────────────────────────────────────────────────────────
// _stageClr — ステージカラー（stageColor() のセーフラッパー）
// ────────────────────────────────────────────────────────────────
function _stageClr(code) {
  if (!code) return 'var(--text3)';
  if (typeof stageColor === 'function') return stageColor(code) || 'var(--text3)';
  return 'var(--text3)';
}

// ────────────────────────────────────────────────────────────────
// _lineFromDisplayId — display_id から lineCode を抽出
//   例: "HM2026-B2-L01" → "B2"
// ────────────────────────────────────────────────────────────────
function _lineFromDisplayId(displayId) {
  if (!displayId) return '';
  var m = String(displayId).match(/[A-Za-z]{1,4}\d{4}-([A-Za-z][0-9]+)-/i);
  return m ? m[1].toUpperCase() : '';
}

// ════════════════════════════════════════════════════════════════
// 1. normalizeLineForView — ライン表示用正規化
// ════════════════════════════════════════════════════════════════
function normalizeLineForView(line) {
  if (!line) return null;
  var f = (typeof Store !== 'undefined' && Store.getParent)
    ? Store.getParent(line.father_par_id) : null;
  var m = (typeof Store !== 'undefined' && Store.getParent)
    ? Store.getParent(line.mother_par_id) : null;

  var _tags = function(t) {
    try { return (JSON.parse(t || '[]') || []).slice(0, 3).join(' '); } catch(e) { return ''; }
  };

  return {
    _type:     'LINE',
    _id:       line.line_id || '',
    lineCode:  line.line_code || line.display_id || '?',
    year:      line.hatch_year || '—',
    status:    line.status || 'active',
    locality:  line.locality || '',
    generation:line.generation || '',
    // 父親情報
    fName:     f ? (f.parent_display_id || f.display_name || '') : '',
    fSize:     f && f.size_mm ? String(f.size_mm) + 'mm' : '',
    fBlood:    f ? (f.bloodline_raw || _tags(f.bloodline_tags) || '') : '',
    // 母親情報
    mName:     m ? (m.parent_display_id || m.display_name || '') : '',
    mSize:     m && m.size_mm ? String(m.size_mm) + 'mm' : '',
    mBlood:    m ? (m.bloodline_raw || _tags(m.maternal_tags || m.bloodline_tags || '[]') || '') : '',
  };
}

// ════════════════════════════════════════════════════════════════
// 2. normalizeLotForView — ロット表示用正規化
// ════════════════════════════════════════════════════════════════
function normalizeLotForView(lot) {
  if (!lot) return null;

  // ステージ: stage_life 優先 → 旧 stage → 成長記録
  var rawStage  = lot.stage_life || lot.stage || '';
  var stageCode = _normalizeStage(rawStage);

  // マット: 成長記録 > ロット本体
  var recs = (typeof Store !== 'undefined' && Store.getGrowthRecords)
    ? (Store.getGrowthRecords(lot.lot_id) || []) : [];
  var latestRec = recs.length
    ? recs.slice().sort(function(a,b){ return String(b.record_date).localeCompare(String(a.record_date)); })[0]
    : null;

  var rawMat  = lot.mat_type || (latestRec && latestRec.mat_type) || '';
  var rawMolt = lot.mat_molt;
  var matNorm = _normalizeMat(rawMat, rawMolt);

  // ライン表示: display_id 優先
  var lineCode = _lineFromDisplayId(lot.display_id);
  if (!lineCode && typeof Store !== 'undefined' && Store.getLine) {
    var _ln = Store.getLine(lot.line_id);
    lineCode = _ln ? (_ln.line_code || _ln.display_id || '') : '';
  }

  // 日齢
  var ageObj = (typeof Store !== 'undefined' && Store.calcAge && lot.hatch_date)
    ? Store.calcAge(lot.hatch_date) : null;
  var ageDays = (ageObj && ageObj.days != null) ? ageObj.days : null;

  // 体重
  var weightG = latestRec && latestRec.weight_g ? latestRec.weight_g : (lot.latest_weight_g || null);

  return {
    _type:      'LOT',
    _id:        lot.lot_id || '',
    displayId:  lot.display_id || '',
    lineCode:   lineCode,
    count:      parseInt(lot.count, 10) || 0,
    status:     lot.status || 'active',
    stageCode:  stageCode,
    stageLbl:   _stageLbl(stageCode),
    stageColor: _stageClr(stageCode),
    mat:        matNorm.mat,
    molt:       matNorm.molt,
    matLbl:     _matLabel(matNorm.mat, matNorm.molt),
    container:  lot.container_size || (latestRec && latestRec.container) || '',
    weightG:    weightG ? String(weightG) + 'g' : '',
    ageDays:    ageDays != null ? String(ageDays) + '日' : '—',
    lastChange: lot.mat_changed_at || '',
    override:   lot.next_change_override_date || '',
  };
}

// ════════════════════════════════════════════════════════════════
// 3. normalizeIndForView — 個体表示用正規化
// ════════════════════════════════════════════════════════════════
function normalizeIndForView(ind) {
  if (!ind) return null;

  // ステージ
  var rawStage  = ind.stage_life || ind.current_stage || '';
  var stageCode = _normalizeStage(rawStage);

  // マット
  var matNorm = _normalizeMat(ind.current_mat || '', ind.mat_molt);

  // ライン
  var lineCode = _lineFromDisplayId(ind.display_id);
  if (!lineCode && typeof Store !== 'undefined' && Store.getLine) {
    var _ln = Store.getLine(ind.line_id);
    lineCode = _ln ? (_ln.line_code || _ln.display_id || '') : '';
  }

  // 年度
  var year = '';
  var _ym = String(ind.display_id || '').match(/\d{4}/);
  if (_ym) year = _ym[0];

  // 日齢
  var ageObj = (typeof Store !== 'undefined' && Store.calcAge && ind.hatch_date)
    ? Store.calcAge(ind.hatch_date) : null;
  var ageDays = (ageObj && ageObj.days != null) ? ageObj.days : null;

  // ステータスラベル
  var ST_LBL = {
    alive:'飼育中', larva:'飼育中', prepupa:'飼育中', pupa:'飼育中', adult:'飼育中',
    seed_candidate:'飼育中', seed_reserved:'飼育中',
    for_sale:'販売候補', listed:'出品中',
    sold:'販売済み', dead:'死亡',
  };
  var ST_CLR = {
    alive:'var(--green)', larva:'var(--green)', prepupa:'var(--green)',
    pupa:'var(--green)', adult:'var(--green)',
    seed_candidate:'var(--green)', seed_reserved:'var(--green)',
    for_sale:'#9c27b0', listed:'#ff9800',
    sold:'var(--amber)', dead:'var(--red,#e05050)',
  };

  return {
    _type:      'IND',
    _id:        ind.ind_id || '',
    displayId:  ind.display_id || '',
    lineCode:   lineCode,
    year:       year,
    sex:        ind.sex || '',
    sexColor:   ind.sex === '♂' ? 'var(--male,#5ba8e8)' : ind.sex === '♀' ? 'var(--female,#e87fa0)' : 'var(--text3)',
    status:     ind.status || '',
    statusLbl:  ST_LBL[ind.status] || ind.status || '—',
    statusClr:  ST_CLR[ind.status] || 'var(--text3)',
    stageCode:  stageCode,
    stageLbl:   _stageLbl(stageCode),
    stageColor: _stageClr(stageCode),
    mat:        matNorm.mat,
    molt:       matNorm.molt,
    matLbl:     _matLabel(matNorm.mat, matNorm.molt),
    container:  ind.current_container || '',
    weightG:    ind.latest_weight_g ? String(ind.latest_weight_g) + 'g' : '',
    sizeMm:     ind.adult_size_mm ? String(ind.adult_size_mm) + 'mm' : '',
    ageDays:    ageDays != null ? String(ageDays) + '日' : '—',
    icons: [
      String(ind.guinness_flag) === 'true' ? '🏆' : '',
      String(ind.parent_flag)   === 'true' ? '👑' : '',
      String(ind.g200_flag)     === 'true' ? '💪' : '',
    ].filter(Boolean).join(''),
  };
}

// ════════════════════════════════════════════════════════════════
// 4. renderEntityCard — 共通カード骨格HTML生成
//
// @param opts.entityType  'LINE' | 'LOT' | 'IND'
// @param opts.entityId    内部ID（line_id / lot_id / ind_id）
// @param opts.leftTop     左列上段HTML
// @param opts.leftBottom  左列下段HTML（任意）
// @param opts.mainTop     右メイン上段HTML
// @param opts.mainSub     右メイン下段HTML
// @param opts.extra       追加行HTML（任意）
// ════════════════════════════════════════════════════════════════
function renderEntityCard(opts) {
  var entityType = opts.entityType || '';
  var entityId   = opts.entityId   || '';
  var attrName   = {
    LINE: 'data-line-id',
    LOT:  'data-lot-id',
    IND:  'data-ind-id',
  }[entityType] || 'data-entity-id';

  return '<div class="entity-card card"'
    + ' ' + attrName + '="' + entityId + '"'
    + ' role="button" tabindex="0">'

    // 左列
    + '<div class="entity-card__left">'
    + (opts.leftTop    || '')
    + (opts.leftBottom || '')
    + '</div>'

    // 中央メイン
    + '<div class="entity-card__main">'
    + (opts.mainTop || '')
    + (opts.mainSub ? '<div class="entity-card__sub">' + opts.mainSub + '</div>' : '')
    + (opts.extra   ? '<div class="entity-card__extra">' + opts.extra + '</div>' : '')
    + '</div>'

    // 右矢印
    + '<div class="entity-card__arrow">›</div>'

    + '</div>';
}

// ════════════════════════════════════════════════════════════════
// 5. renderLineCard — ライン一覧カード
//   目的: 血統・親構成・ライン識別
//   主役: ♂♀サイズ + 血統
// ════════════════════════════════════════════════════════════════
function renderLineCard(vm) {
  if (!vm) return '';

  // 左列: ラインコード + 年度
  var leftTop = '<div class="entity-card__code">' + vm.lineCode + '</div>';
  var leftBot = '<div class="entity-card__year">' + vm.year + '</div>';

  // 右メイン上段: 親情報（サイズ先頭・強調）
  var parentRow = '';
  if (vm.fName || vm.mName) {
    var fPart = vm.fName
      ? '<span style="color:var(--male,#5ba8e8)">♂</span>'
        + (vm.fSize ? '<strong style="font-size:.88rem"> ' + vm.fSize + '</strong>' : '')
        + '<span style="color:var(--text3);font-size:.72rem"> ' + vm.fName + '</span>'
      : '';
    var mPart = vm.mName
      ? '<span style="color:var(--female,#e87fa0)">♀</span>'
        + (vm.mSize ? '<strong style="font-size:.88rem"> ' + vm.mSize + '</strong>' : '')
        + '<span style="color:var(--text3);font-size:.72rem"> ' + vm.mName + '</span>'
      : '';
    parentRow = '<div style="display:flex;gap:10px;flex-wrap:wrap">'
      + (fPart ? '<span>' + fPart + '</span>' : '')
      + (mPart ? '<span>' + mPart + '</span>' : '')
      + '</div>';
  } else {
    parentRow = '<div style="font-size:.8rem;color:var(--text3)">親情報なし</div>';
  }

  // 右メイン下段: 血統
  var bloodParts = [vm.fBlood, vm.mBlood].filter(Boolean);
  var bloodRow = bloodParts.length
    ? '<div class="entity-card__blood">'
      + bloodParts.map(function(b){ return b.slice(0, 28); }).join(' × ')
      + '</div>'
    : '';

  // 産地・累代
  var locRow = (vm.locality || vm.generation)
    ? '<div style="font-size:.7rem;color:var(--text3);margin-top:1px">'
      + [vm.locality, vm.generation].filter(Boolean).join(' / ')
      + '</div>'
    : '';

  return renderEntityCard({
    entityType:  'LINE',
    entityId:    vm._id,
    leftTop:     leftTop,
    leftBottom:  leftBot,
    mainTop:     parentRow,
    mainSub:     bloodRow + locRow,
  });
}

// ════════════════════════════════════════════════════════════════
// 6. renderLotCard — ロット一覧カード
//   目的: 飼育管理・交換判断・分割状況
//   主役: display_id + ステージ/マット/容器/体重/日齢
// ════════════════════════════════════════════════════════════════
function renderLotCard(vm) {
  if (!vm) return '';

  // 左列: ラインコード + 頭数
  var leftTop = '<div class="entity-card__code">' + (vm.lineCode || '—') + '</div>';
  var leftBot = '<div style="font-size:.75rem;font-weight:700;color:var(--text2);margin-top:3px">'
    + vm.count + '<span style="font-size:.62rem;color:var(--text3)">頭</span></div>';

  // 右メイン上段: display_id
  var idRow = '<div style="font-family:var(--font-mono);font-size:.85rem;font-weight:700;'
    + 'color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
    + vm.displayId + '</div>';

  // 右メイン下段: ステージ / マット / 容器 / 体重 / 日齢
  var infoParts = [];
  if (vm.stageLbl) infoParts.push(
    '<span style="font-weight:700;color:' + vm.stageColor + '">' + vm.stageLbl + '</span>'
  );
  if (vm.matLbl)   infoParts.push('<span>' + vm.matLbl + '</span>');
  if (vm.container)infoParts.push('<span>' + vm.container + '</span>');
  if (vm.weightG)  infoParts.push('<span style="color:var(--green);font-weight:700">' + vm.weightG + '</span>');
  if (vm.ageDays && vm.ageDays !== '—') infoParts.push('<span>' + vm.ageDays + '</span>');

  var infoRow = infoParts.length
    ? '<div class="entity-card__info">'
      + infoParts.join('<span class="entity-card__sep">/</span>')
      + '</div>'
    : '';

  return renderEntityCard({
    entityType:  'LOT',
    entityId:    vm._id,
    leftTop:     leftTop,
    leftBottom:  leftBot,
    mainTop:     idRow,
    mainSub:     infoRow,
  });
}

// ════════════════════════════════════════════════════════════════
// 7. renderIndCard — 個体一覧カード
//   目的: 個体状態・性別・成長確認
//   主役: 性別 + ライン/年度 + ID + ステージ/マット/体重/日齢
// ════════════════════════════════════════════════════════════════
function renderIndCard(vm) {
  if (!vm) return '';

  // 左列: 性別記号 + ライン/年度
  var leftTop = '<div style="font-size:1.2rem;font-weight:800;color:' + vm.sexColor + ';line-height:1">'
    + (vm.sex || '?') + '</div>';
  var leftBot = (vm.lineCode || vm.year)
    ? '<div style="font-size:.65rem;color:var(--text3);margin-top:3px">'
      + [vm.lineCode, vm.year].filter(Boolean).join('<br>')
      + '</div>'
    : '';

  // 右メイン上段: 個体ID + アイコン
  var idRow = '<div style="display:flex;align-items:center;gap:6px">'
    + '<span style="font-family:var(--font-mono);font-size:.85rem;font-weight:700;'
    + 'color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">'
    + vm.displayId + '</span>'
    + (vm.icons ? '<span style="font-size:.78rem;flex-shrink:0">' + vm.icons + '</span>' : '')
    + '</div>';

  // 右メイン下段: ステージ / マット / 容器 / 体重 or サイズ / 日齢
  var infoParts = [];
  if (vm.stageLbl)  infoParts.push(
    '<span style="font-weight:700;color:' + vm.stageColor + '">' + vm.stageLbl + '</span>'
  );
  if (vm.matLbl)    infoParts.push('<span>' + vm.matLbl + '</span>');
  if (vm.container) infoParts.push('<span>' + vm.container + '</span>');
  var sizeW = vm.weightG || vm.sizeMm;
  if (sizeW) infoParts.push(
    '<span style="color:var(--green);font-weight:700">' + sizeW + '</span>'
  );
  if (vm.ageDays && vm.ageDays !== '—') infoParts.push('<span>' + vm.ageDays + '</span>');

  var infoRow = infoParts.length
    ? '<div class="entity-card__info">'
      + infoParts.join('<span class="entity-card__sep">/</span>')
      + '</div>'
    : '';

  // ステータス
  var stRow = '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px">'
    + '<span style="font-size:.72rem;font-weight:700;color:' + vm.statusClr + '">' + vm.statusLbl + '</span>'
    + '</div>';

  return renderEntityCard({
    entityType:  'IND',
    entityId:    vm._id,
    leftTop:     leftTop,
    leftBottom:  leftBot,
    mainTop:     idRow,
    mainSub:     infoRow,
    extra:       stRow,
  });
}
