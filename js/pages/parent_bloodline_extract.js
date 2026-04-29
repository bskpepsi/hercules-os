// FILE: js/pages/parent_bloodline_extract.js
// ════════════════════════════════════════════════════════════════
// parent_bloodline_extract.js — 種親血統情報の Vision 抽出機能
//
// build: 20260429z4
//
// ── 20260429z4 (本ビルド) ────────────────────────────────────
// ・🔧 サムネ表示時に各スクショの URL 状態をコンソールに自動診断ログ出力
//   ・thumbnail_data_url / drive_view_url / drive_file_url / drive_file_id /
//     normalized URL / 最終 imgSrc の状態を一括ダンプ
//   ・原因特定の手間を削減
// ・⚠️ 画像URLが完全に無い「壊れたスクショ」がある場合、系統評価カード内に
//   警告メッセージと「🗑 画像URLなしのスクショを一括削除」ボタンを表示
//   ・典型ケース: スマホで Drive アップロードに失敗した古いスクショ
//   ・「N枚は画像URLなし」のラベルも追加して状況を明確化
//   ・ボタンタップで Drive URL も thumbnail もないスクショを一括削除
//   ・削除後は PC から再アップロードすると確実に表示できるように案内
// ・新関数 Pages._pbeRemoveBrokenShots を追加
//
// ── 20260429z3 ────────────────────────────────────────────
// ・Drive 画像 URL を Google 公式CDN形式に正規化するヘルパー追加
// ・🔥 スマホでスクショサムネが表示されない問題を解決:
//   症状: Sheets には Drive URL が保存されているのに、スマホ Chrome では
//         サムネが「#1 #2 ...」のフォールバック表示になる。PC では表示OK。
//   原因: GAS が返していた `drive.google.com/uc?id=...&export=view` 形式は
//         2024年8月以降 Google がサードパーティ画像表示をブロック。
//         PC はログインセッションで通るがスマホでは弾かれる。
//   対策: フロント側に `_pbeNormalizeDriveImageUrl` ヘルパーを追加。
//         既存 URL から file_id を抜き取って
//         `https://lh3.googleusercontent.com/d/{fileId}=w300` 形式に変換。
//         こちらは Google 公式画像CDNで認証不要・サードパーティ表示OK。
//         サムネ用は =w300、拡大表示は =s0 (原寸) に切替。
//   メリット:
//         ・既存 Sheets に保存されている9枚分の URL も再アップロード不要で
//           表示できる (フロント変換のみで対応)
//         ・GAS 側も同時修正済 (parent_bloodline.gs z3) で新規アップは
//           最初から新形式で保存される
//
// ── 20260429z2 ────────────────────────────────────────────
// ・PBE 診断 FAB ボタン削除
//
// ── 20260429z1 ────────────────────────────────────────────
// ・系統評価カードから重複8項目を削除
//   旧: 種/学名/産地/累代/羽化期/体長/♂血統/♀血統 を表示していたが、
//       これらはすべて parent_v2.js の「基本情報」「血統・親情報」セクションに
//       既に存在しており重複していた。
//   新: 系統評価カードでは feature_notes (血統的特徴) と
//       kinship_records (同腹兄弟・系統実績) のみ表示する。
// ・サムネ表示の堅牢化:
//   ・drive_file_url もフォールバックとして許容
//   ・onerror で「📷」プレースホルダに自動切替
//   ・imgSrc が完全に空のときは番号付きプレースホルダ (#1, #2, ...) で枚数を可視化
//   ・referrerpolicy="no-referrer" で Drive 直アクセスの Referer ブロック回避
//   ・loading="lazy" で表示性能向上
//   ・「スクショ N 枚」ラベルで実際の保存枚数を可視化
//
// ── 20260429y6.18 ────────────────────────────────────────
// build: 20260429y6.18 (前ビルド)
//
// ── y6.18 での修正点 (本ビルド・最終決着版) ────────────────────
// ・🔥 Store.parents が空 (件数=0) の致命的状態を救済:
//   診断で判明した事実:
//     ・Store.parents 件数: 0 (完全に空)
//     ・GAS getParents は 31 件返している
//     ・つまり syncAll → setDB('parents') が呼ばれていない or 空配列で呼ばれている
//   対策 (3経路):
//     ① _pbeBootstrapIfEmpty を起動 1秒/3秒/6秒で実行
//        Store.parents が空なら GAS getParents を直接呼んで Store にセット。
//        bloodline_data も同時展開。
//     ② _pbeMergeIntoStoreWithCloudFallback の先頭で空判定追加
//        「Store.parents.length === 0」を最優先で検出して getParents を実行。
//     ③ Store.setDB ラップ (y6.17) も継続運用
//        どの経路で parents がセットされても bloodline_data 展開済みになる。
//
// ── y6.17 での修正点 ────────────────────────────────────────
// ・Store.setDB を強制ラップ (parents セット時に必ず展開)
//
// ── y6.16 での修正点 ────────────────────────────────────────
// ・Pages.parentDetail を強制ラップ (描画前マージ)
//
// ── y6.13 での修正点 ────────────────────────────────────────
// ・🔥 クリティカルバグ修正: 「保存後に種親詳細画面から血統情報が消える」
//   症状:
//     ・編集画面で「保存」を押すと UI 上は「保存しました ✅」と出るが、
//       直後に種親詳細画面へ戻ると系統評価カードが空になる。
//     ・コンソールに 「[PBE] cloud sync failed (localStorage は保存済み):
//       Failed to fetch」「ERR_FAILED 400 (Bad Request)」が出る。
//   原因:
//     ・_pbeCallGAS が GET メソッドで payload を URL クエリに乗せていた。
//     ・bloodline_data_json (~1KB の日本語含む JSON) と
//       source_screenshots_json (~1.5KB) を URL エンコードすると、
//       リクエスト URL が 8〜15KB 級まで肥大化。
//     ・GAS Web App 側 (script.googleusercontent.com/macros/echo)
//       のリダイレクト URL が長すぎて 400 Bad Request を返す。
//     ・フロントは「クラウド同期失敗」と判断し、画面再描画時にメモリ上の
//       Store の bloodline_data が反映されないルートに入っていた。
//   対策:
//     ・_pbeCallGAS を POST + Content-Type: text/plain に変更。
//     ・URL は短いまま、payload は body に入れるので長さ制限を回避。
//     ・GAS 側は doPost(e) が既に e.postData.contents を JSON.parse する
//       実装になっているので サーバ変更不要・フロントのみで完結。
//     ・Content-Type: text/plain で送ることで CORS preflight (OPTIONS) を
//       発生させない (simple request)。GAS は OPTIONS に応答できないため
//       application/json で送ると preflight で失敗する。
//     ・action は body に含める形に統一 (handleRequest 側は
//       e.parameter.action ではなく body.action を見るパスで処理可能)。
//   実測:
//     ・F25-24 (PAR-02c5yoa) で bloodline_data_json 921 文字 +
//       source_screenshots_json 1315 文字を一発送信で 200 OK。
//     ・保存後に種親詳細へ戻っても系統評価カードが正しく表示されるよう
//       回復した。
//
// ── y6.12 での修正点 ──────────────────────────────────────────
// ・🔥 プロンプト全面強化:
//   ・raw_text を最重要項目として明示・全文転記を要求
//   ・kinship_records の例を 6 種類に充実 (174mm/170mm/168mm/前蛹150g/胸角121 等)
//   ・「取りこぼし厳禁」を強調
//   ・各項目の指示を詳細化 (1〜11 番付き)
// ・🔥 raw_text の文字数上限を明示 (PBE_FIELD_MAX_LEN に追加: 2500字)
// ・🔥 feature_notes 上限拡張 (500→800字)
// ・🔥 新機能: 編集画面に「📋 本文から AI で補完」ボタン追加
//   ・raw_text(本文)を貼り付けて補完ボタンを押すと、Gemini にテキストだけを
//     送って kinship_records / feature_notes 等を再抽出する
//   ・Vision で取りこぼした実績を、本文ペーストで確実に補完できる
//   ・テキスト処理なので Vision より精度が高い
//   ・既存の入力値は上書きしない (空欄のみ補完)
//   ・既存の kinship_records には重複しない実績だけを追加
//
// ── y6.11.1 (緊急修正) ──────────────────────────────────────────
// ・🔥 クリティカルバグ修正: y6.11 で「読み込んだデータが消える」問題
//   原因: _pbeMergeIntoStore 内の cloudUpdated フラグが forEach の外で
//        宣言されていたため、1つの parent でクラウドデータが見つかると
//        それ以降の全 parent でも cloudUpdated=true のままになり、
//        空の bloodline_data で localStorage キャッシュを上書きしていた。
//   対策:
//     1) cloudUpdated を forEach 内のローカル変数に変更
//     2) 全体の更新有無は anyCloudUpdate で別途追跡
//     3) 安全装置: クラウドのタイムスタンプより localStorage が新しければ
//        上書きスキップ (タイミング上 GAS 側書き込みが遅れる場合の保険)
//
// ── y6.11 での修正点 ──────────────────────────────────────────
// ・🔥 GAS バックエンド連携でクラウド同期対応 (複数人運用OK)
//   PC で抽出 → スマホで参照、その逆も可能になる。
//   ・bloodline_data: 種親台帳シートの bloodline_data_json 列に JSON保存
//   ・source_screenshots: メタデータを source_screenshots_json 列に保存
//   ・スクショ画像本体: Google Drive (HerculesOS_Screenshots) に保存
//   ・更新日時: bloodline_updated_at 列に記録
// ・前提となる GAS 側の作業 (build 20260428c parent_bloodline.gs):
//   ・hcosSetupBloodlineSync() で列追加・Drive フォルダ作成
//   ・doPost に uploadParentScreenshot / updateParentBloodline を追加
// ・既存の localStorage 永続化はオフライン用バックアップとして維持
// ・syncAll で取得した parents の *_json 列を JSON.parse して展開
// ・画像表示: image_data_url(ローカル) → drive_view_url(クラウド) の順
// ・GAS 通信失敗時もアプリは止まらず、ローカル保存だけで完結する設計
//
// ── y6.10 での修正点 ───────────────────────────────────────────
// ・🔥 プロンプトを抜本的に書き直し
//   従来は「禁止ルール」を列挙する形だったが、AIが無意識に「null=失敗」と
//   思って補完しようとする傾向があった。新方針:
//     ・「null は正解」と最初に明示
//     ・推測・補完が「悪い」のではなく「不要」と伝える
//     ・具体的な良い例・悪い例を3パターン提示
//     ・指示量を半減して圧縮
// ・🔥 サニタイズの過剰除去を修正
//   ・「ですが」パターンが正常値を巻き込む可能性があったため削除
//   ・「推測」は単独だと普通の文章にも現れるため削除
// ・🔥 degenerate検知ルール3 (10〜200字の繰返し) を削除
//   通常の出品文でも誤検知する可能性があったため、ルール1/2/4のみに緩和。
//   ルール4の閾値も 20字×5回 → 30字×5回 に緩めて誤検知を減らす。
//
// ── y6.9 での修正点 ────────────────────────────────────────────
// ・🔥 「同じ注釈フレーズが繰り返される」degenerate パターンに対応
//   症状: y6.8の単一文字繰り返し対策後、AIが今度は
//         「Dynastes hercules hercules と表記されているため、補完しています。
//          Dynastes hercules hercules と表記されているため、補完しています。
//          ...」のように長文を繰り返す形に変化。レスポンス末尾は
//         「Dynastes hercules h」で切り捨てられJSON parse失敗。
//   対策:
//     1) degenerate検知ルール強化:
//        ・同じ長文(10〜200字)が3回以上繰り返しのパターンを検知
//        ・1000字超のレスポンスで20字スライスが5回以上現れるかをチェック
//     2) 各フィールドに長さ上限を設定 (species_full=60字 等)
//        超えた値は null として捨てる(マージで誤って採用されるのを防ぐ)
//     3) 「と表記されているため」「補完しています」等の注釈フレーズが
//        フィールド値の途中に含まれていたら、その手前で機械的に切る
//     4) 各フィールド単位でも degenerate 検知を実施
//
// ── y6.8 での修正点 ────────────────────────────────────────────
// ・🔥 Gemini Vision の「同じ文字を延々と繰り返す異常出力」(degenerate output)を解決
//   症状: レスポンスが {"species_full": "Dynastes hercules hercules
//        ෛෛෛෛෛෛෛෛ... (同じ文字×大量)」のように、JSON構造が壊れた
//        異常なテキスト繰り返しになり、JSONパースが100%失敗していた。
//   原因: 私が y6.4/y6.5 で温度を 0.3 → 0.15 まで下げすぎていた。
//        低温度は Gemini の生成を「同じ確率的選択を繰り返す」状態に陥らせる。
//   対策:
//     1) 温度を上げ直す: 通常 0.5 / リトライ 0.7 (degenerate回避)
//     2) degenerate 出力検知: 同じ文字が連続40回以上出たらエラーとして扱い
//        自動リトライさせる(温度を上げて再試行)
//     3) リトライ判定キーワードに「繰り返し」を追加
//
// ── y6.7 での修正点 ────────────────────────────────────────────
// ・🔥 「学名フィールドにAIが注釈付きで値を入れてくる」問題を修正
//   症状: "Dynastes hercules hercules (D.Hヘラクレスと表記されているため、
//        補完しています。画像内には明示されていません。)" のように、
//        AIが指示を曲解して値の末尾に注釈を付けていた。
//   対策:
//     1) プロンプトで「注釈・補足・括弧書きは絶対に付けない」と明示
//     2) 「画像内に書かれていない値は補完せず必ず null」と強調
//     3) サニタイズ関数で末尾の注釈括弧書きを機械的に除去
// ・🔥 マージ後ではなく各 partial のサニタイズタイミングを早期化
//   注釈除去・null正規化を partial の段階で実施することで、
//   マージで「長い文字列を優先」するロジックが注釈付き文字列を選ばないように。
//
// ── y6.6 での修正点 ────────────────────────────────────────────
// ・🔥 「保存した血統情報がページ再読み込みで消える」バグを修正
//   原因: HerculesOS は起動時に syncAll → API.getAllData → Store.setDB('parents', ...)
//        で GAS から取得した parents 配列でローカル DB を完全上書きしていた。
//        GAS には bloodline_data フィールドが存在しないため、ローカルで
//        保存した bloodline_data / source_screenshots がページ再読み込みのたびに
//        消えていた (実際は localStorage への保存自体は成功していたが、syncAll
//        で別キーから読み込まれた parents で上書きされていた)。
//   対策:
//     1) 専用 localStorage キー (hercules_parent_bloodline_v1) に par_id を
//        キーにして bloodline_data と source_screenshots を保存。
//        Store とは独立しているので syncAll の影響を受けない。
//     2) Store.on('db_parents') を購読し、parents が更新されるたびに
//        PBE 専用ストアの内容を各 parent オブジェクトに自動マージ。
//        これで yahoo_listing.js などの他モジュールも普通に
//        par.bloodline_data でアクセスできる。
//     3) localStorage 容量超過時は画像本体を削除しメタデータのみ保存する
//        フォールバック処理。
//
// ── y6.5 での修正点 ────────────────────────────────────────────
// ・🔥 「複数画像でトークン上限切り捨て」問題を**根本解決**
//   原因: 複数画像を1リクエストで送ると入力トークンが膨大になり、
//        どれだけ圧縮しても出力 8192 トークンを使い切る前に切り捨てられる。
//   対策: 2枚以上の場合は 1枚ずつ順次抽出し、結果をJS側でマージする方式に変更。
//        各リクエストは軽量で絶対に切り捨てられない。
//        マージは構造化フィールドごとにスマート統合 (kinshipは重複排除、
//        テキストは長い方優先 等)。1枚失敗しても他の枚で続行可能。
//   トレードオフ: API消費は枚数分増えるが、1日250RPDの無料枠には
//        余裕で収まる (3〜5枚×30回=90〜150リクエスト/日)。
//
// ── y6.4 での修正点 ────────────────────────────────────────────
// ・🔥 大きなスクショ複数枚で「トークン上限切り捨て」が頻発する問題を解決
//   原因: 1枚 1.6MB のような大きなスクショを3枚送ると、Vision の入力が
//        膨大になり、出力 8192 トークンを使い切る前に切り捨てられる。
//   対策の組み合わせ:
//     1) 初期圧縮を強化: 1280px/1MB → 960px/700KB
//     2) リトライ時にさらに再圧縮: 720px/400KB の縮小版を送信
//     3) リトライ時のプロンプト軽量化: raw_text を空に、kinship上限10件
//     4) ファイル選択時に枚数+合計サイズ表示&推奨超過警告
//
// ── y6.3 での修正点 ────────────────────────────────────────────
// ・🔥 「設定画面でAPIキーを設定済みなのに『未設定』と表示される」問題を解決
//   原因: 設定画面 (settings.js) は localStorage 'hcos_gemini_key' / Store.getSetting('gemini_key')
//        を使うが、本モジュールは 'hercules_gemini_key' しか読んでいなかった。
//   対策: 3つのキー名を優先順位で読む & 保存時は3つすべてに書き込む。
// ・🔥 JSON パース失敗時の自動リトライ実装
//   ・1回目失敗 → 温度を 0.3→0.15 に下げて自動再試行 (yahoo_listing.jsと同等)
//   ・raw_text の文字数制限を 2000→800 に下げてトークン節約
// ・🔥 切り捨てJSONの自動補修
//   MAX_TOKENS で切り捨てられたJSONを末尾補修して部分復元 (yahoo_listing.jsと同等)
// ・🔥 finishReason をチェックし、切り捨て時は明確なエラーメッセージ
//
// ── y6.2 での修正点 ────────────────────────────────────────────
// ・🔥 複数スクリーンショット同時アップロード対応
//   1度のリクエストで複数画像をVision APIに送信し、AIが統合された
//   1セットの構造化データを返す。同腹兄弟実績などスクショ間で重複
//   する情報も自動統合される。タイトル画像+商品説明1枚目+2枚目など
//   1個体に関する複数ページのスクショをまとめて処理可能。
// ・file inputに multiple 属性追加、サムネイルグリッドプレビュー表示
// ・編集モーダルで複数枚の元画像をサムネ並べ表示
// ・全スクショを source_screenshots[] に保存
//
// ── y6.1 での修正点 ────────────────────────────────────────────
// ・🔥 APIキーの再入力を不要に
//   設定画面と同じ localStorage キー (hercules_gemini_key) を共用しているため、
//   既にキーが設定済みの場合は「✅ 設定済み」表示にし、入力欄を非表示化。
//   「変更」リンクで必要なときだけ入力欄を展開できる。
//   未設定時のみ入力欄を表示し、保存先は設定画面と共通であることを明記。
//
// ── 概要 ─────────────────────────────────────────────────────
// ヤフオク等の出品ページのスクショ画像から、Gemini 2.5 Flash の
// Vision API を使って種親の血統情報を構造化抽出するモジュール。
// 抽出結果は parents テーブルの bloodline_data フィールドに保存され、
// 飼育画面・ヤフオク出品文生成・ライン詳細画面で参照される。
//
// ── 設計方針 ─────────────────────────────────────────────────
// ・既存の parent_v2.js / sale_listing.js / yahoo_listing.js は触らない
//   (組み込みは「📷 血統情報を抽出」ボタンを差し込むだけの最小介入)
// ・関数名は `_pbe*` プレフィックスで衝突回避
// ・グローバル公開は Pages._pbeOpenExtractor / _pbeOpenViewer のみ
// ・既存の parents レコードに後方互換的にフィールド追加
//   (古いレコードは bloodline_data === undefined で動作する)
// ・販売者名・店舗名・購入価格・購入条件は抽出しない方針
//   (Vision プロンプトで明示的に禁止)
//
// ── データモデル ──────────────────────────────────────────────
// parents テーブルの各レコードに以下フィールドを追加 (任意):
//   {
//     // 既存フィールド (par_id, sex, size_mm, paternal_raw, ...) はそのまま
//
//     bloodline_data: {
//       species_full:    'Dynastes hercules hercules',
//       origin:          'グアドループ',
//       generation:      'CB',
//       eclosion_period: '2025/8/中旬',
//       body_size_mm:    79,
//       paternal_blood:  'MT-FF1710F.FFOAKS',
//       maternal_blood:  '00-181',
//       kinship_records: [
//         {metric:'body_size', threshold:174, count:1, unit:'mm', is_top:true},
//         {metric:'body_size', threshold:170, count:6, unit:'mm'},
//         {metric:'pre_pupa_weight', threshold:150, count:1, unit:'g', is_top:true, note:'前蛹'},
//       ],
//       feature_notes:   '胸角の伸びがピカイチ。サイズ系・長角系統。',
//       raw_text:        '(原文全文)',
//     },
//     source_screenshots: [
//       {
//         id:                  'shot_xxx',
//         uploaded_at:         '2026-04-26T17:30:00',
//         image_data_url:      'data:image/jpeg;base64,...',  // 1MB以下圧縮
//         thumbnail_data_url:  'data:image/jpeg;base64,...',  // 200x300サムネ
//         extraction_status:   'done' | 'pending' | 'failed',
//         extracted_at:        '2026-04-26T17:30:30',
//       },
//     ],
//     bloodline_updated_at: '2026-04-26T17:31:00',
//   }
// ════════════════════════════════════════════════════════════════
'use strict';

// ════════════════════════════════════════════════════════════════
// 定数
// ════════════════════════════════════════════════════════════════
const PBE_GEMINI_MODEL = 'gemini-2.5-flash';
const PBE_API_KEY_LS   = 'hercules_gemini_key';     // yahoo_listing.js と共用
// [y6.4] 画像サイズ定数: トークン消費削減のため積極的に圧縮
//   Vision API はピクセル数が多いほど入力トークンを多く消費する。
//   大きすぎる画像は出力 (8192トークン) を圧迫するため、解像度・ファイルサイズを抑制。
const PBE_MAX_IMAGE_SIZE_BYTES = 700 * 1024;        // [y6.4] 1MB → 700KB
const PBE_MAX_IMAGE_DIMENSION  = 960;               // [y6.4] 1280px → 960px (長辺)
const PBE_THUMB_DIMENSION      = 240;               // サムネ長辺 (表示用)
// [y6.4] Vision API送信前の追加圧縮 (リトライ時に使用)
const PBE_RETRY_MAX_DIMENSION  = 720;               // リトライ時の長辺
const PBE_RETRY_MAX_SIZE_BYTES = 400 * 1024;        // リトライ時 400KB
// [y6.4] 推奨枚数上限 (これを超えると警告)
const PBE_WARN_FILE_COUNT      = 3;

// 同腹兄弟実績の指標
const PBE_KINSHIP_METRICS = {
  body_size:        { label: '体長',     unit: 'mm' },
  pre_pupa_weight:  { label: '前蛹体重', unit: 'g'  },
  larva_weight:     { label: '幼虫体重', unit: 'g'  },
  thorax_horn:      { label: '胸角',     unit: 'mm' },
  head_horn:        { label: '頭角',     unit: 'mm' },
};

// ════════════════════════════════════════════════════════════════
// ユーティリティ
// ════════════════════════════════════════════════════════════════
function _pbeEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _pbeNowIso() {
  return new Date().toISOString();
}

function _pbeUid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ════════════════════════════════════════════════════════════════
// [20260429z3] Drive 画像 URL を `<img src>` で表示可能な形式に正規化
// ────────────────────────────────────────────────────────────────
// 背景:
//   ・Google Drive の `https://drive.google.com/uc?id={fileId}&export=view`
//     形式は 2024年8月以降、サードパーティサイトからの直接アクセスが
//     ブロックされるようになった。
//   ・PC では Drive ログイン済セッションを Cookie で持っているため通るが、
//     スマホ Chrome ではセッション共有がなく、画像が表示できない。
//   ・代替は `https://lh3.googleusercontent.com/d/{fileId}=w300` 形式。
//     Google 公式の画像CDNで、認証不要・サードパーティアクセスOK。
//
// 対応:
//   ・古い形式の URL を新形式に自動変換する。
//   ・既存 Sheets に保存されている URL も、フロント表示時に変換するので
//     再アップロードは不要。
//   ・新規アップロードは GAS 側 (parent_bloodline.gs) を z3 系で同時修正済。
// ════════════════════════════════════════════════════════════════
function _pbeNormalizeDriveImageUrl(url, fileId) {
  if (!url && !fileId) return '';
  // file_id が直接渡されていれば最優先で利用
  let id = fileId || '';
  if (!id && url) {
    // URL から file_id を抽出
    let m = url.match(/[?&]id=([^&]+)/);
    if (m) id = m[1];
    if (!id) {
      m = url.match(/\/d\/([^/?]+)/);   // /file/d/{id}/view, /d/{id}=... 両対応
      if (m) id = m[1];
    }
  }
  if (id) {
    // Google 公式画像CDN形式 (認証不要・サードパーティ表示可能)
    //   =w300 でリサイズ済み画像を取得 (転送量削減)
    return 'https://lh3.googleusercontent.com/d/' + id + '=w300';
  }
  // file_id が抽出できなければそのまま返す (image_data_url など)
  return url || '';
}

// 元画像表示用 (拡大時) — リサイズ無しの大きいサイズ
function _pbeNormalizeDriveFullUrl(url, fileId) {
  if (!url && !fileId) return '';
  let id = fileId || '';
  if (!id && url) {
    let m = url.match(/[?&]id=([^&]+)/);
    if (m) id = m[1];
    if (!id) {
      m = url.match(/\/d\/([^/?]+)/);
      if (m) id = m[1];
    }
  }
  if (id) {
    // =s0 で原寸サイズ
    return 'https://lh3.googleusercontent.com/d/' + id + '=s0';
  }
  return url || '';
}

// API キー取得 (yahoo_listing.js / sale_listing.js / settings.js 全てと共用)
// [y6.3] 設定画面と他モジュールで使用されている複数のキー名を順に確認:
//   1. Store.getSetting('gemini_key')  ← 設定画面が使う公式キー
//   2. localStorage 'hcos_gemini_key'  ← config.js 経由 (CONFIG.LS_KEYS.GEMINI_KEY)
//   3. localStorage 'hercules_gemini_key' ← sale_listing.js / yahoo_listing.js が使うキー
function _pbeGetApiKey() {
  try {
    // 1. 設定画面の保存先 (Store ヘルパー経由)
    if (window.Store && typeof Store.getSetting === 'function') {
      const k = Store.getSetting('gemini_key');
      if (k) return k;
    }
    // 2. config.js 経由のキー
    const k2 = localStorage.getItem('hcos_gemini_key');
    if (k2) return k2;
    // 3. yahoo_listing/sale_listing と同じキー
    return localStorage.getItem(PBE_API_KEY_LS) || '';
  } catch (_) { return ''; }
}

// API キー保存 (3つの保存先すべてに書き込んで確実に同期)
function _pbeSetApiKey(key) {
  try {
    if (window.Store && typeof Store.setSetting === 'function') {
      Store.setSetting('gemini_key', key);
    }
    localStorage.setItem('hcos_gemini_key', key);
    localStorage.setItem(PBE_API_KEY_LS, key);
    if (window.CONFIG) CONFIG.GEMINI_KEY = key;
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════
// [y6.6] 永続化レイヤー
// ────────────────────────────────────────────────────────────────
// 問題: HerculesOS は起動時に syncAll → API.getAllData → Store.setDB('parents', ...)
//   で GAS から取得した parents 配列でローカル DB を上書きする。
//   GAS には bloodline_data フィールドが存在しないため、ページ再読み込みするたびに
//   ローカルで保存した bloodline_data / source_screenshots が消えていた。
//
// 解決策: 専用の localStorage キー (PBE_LS_KEY) に par_id をキーにして保存する。
//   これは Store と無関係なので syncAll の影響を受けない。
//   _pbeGetParent() で読み出すときに、Store.getDB の parent と PBE データを
//   毎回マージして返す。
//
// データ構造 (localStorage):
//   PBE_LS_KEY: {
//     "PAR-xxx": { bloodline_data: {...}, source_screenshots: [...], updated_at: '...' },
//     "PAR-yyy": { ... },
//   }
// ════════════════════════════════════════════════════════════════
const PBE_LS_KEY = 'hercules_parent_bloodline_v1';

function _pbeLoadStore() {
  try {
    const raw = localStorage.getItem(PBE_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (_) { return {}; }
}

function _pbeSaveStore(store) {
  try {
    localStorage.setItem(PBE_LS_KEY, JSON.stringify(store));
    return true;
  } catch (e) {
    console.error('[PBE] localStorage write failed', e);
    // 容量超過の可能性: source_screenshots を削って再試行
    try {
      const slim = {};
      Object.entries(store).forEach(function (entry) {
        const k = entry[0], v = entry[1];
        slim[k] = {
          bloodline_data: v.bloodline_data,
          source_screenshots: (v.source_screenshots || []).map(function (s) {
            return { id: s.id, uploaded_at: s.uploaded_at, thumbnail_data_url: s.thumbnail_data_url, extraction_status: s.extraction_status };
          }),
          updated_at: v.updated_at,
        };
      });
      localStorage.setItem(PBE_LS_KEY, JSON.stringify(slim));
      console.warn('[PBE] saved slim version (full screenshots dropped)');
      return true;
    } catch (e2) {
      console.error('[PBE] slim save also failed', e2);
      return false;
    }
  }
}

// par_id を正規化 (display_id でも引けるようにする)
function _pbeResolveParId(parId) {
  if (!parId) return '';
  const parents = (Store.getDB && Store.getDB('parents')) || [];
  const found = parents.find(function (p) {
    return p.par_id === parId || p.parent_display_id === parId || p.display_name === parId;
  });
  return found ? (found.par_id || parId) : parId;
}

// 種親レコード取得 (Store の parent と PBE 永続レイヤーをマージして返す)
function _pbeGetParent(parId) {
  const parents = (Store.getDB && Store.getDB('parents')) || [];
  const par = parents.find(function (p) {
    return p.par_id === parId || p.parent_display_id === parId || p.display_name === parId;
  });
  if (!par) return null;
  // PBE 永続レイヤーから bloodline_data / source_screenshots をマージ
  const store = _pbeLoadStore();
  const pbeRec = store[par.par_id];
  if (pbeRec) {
    return Object.assign({}, par, {
      bloodline_data:       pbeRec.bloodline_data || par.bloodline_data,
      source_screenshots:   pbeRec.source_screenshots || par.source_screenshots || [],
      bloodline_updated_at: pbeRec.updated_at || par.bloodline_updated_at,
    });
  }
  return par;
}

// 種親レコード更新 (PBE 専用 localStorage に保存し、Store にもメモリ反映)
// [y6.11] クラウド同期対応: GAS API にも保存する
async function _pbePatchParent(parId, patch) {
  const realParId = _pbeResolveParId(parId);

  // [y6.6] PBE 専用 localStorage に永続化 (syncAll で消えない・オフライン用バックアップ)
  const store = _pbeLoadStore();
  const existing = store[realParId] || {};
  const next = {
    bloodline_data: (patch.bloodline_data !== undefined)
      ? patch.bloodline_data : existing.bloodline_data,
    source_screenshots: (patch.source_screenshots !== undefined)
      ? patch.source_screenshots : existing.source_screenshots,
    updated_at: patch.bloodline_updated_at || _pbeNowIso(),
  };
  store[realParId] = next;
  _pbeSaveStore(store);

  // [y6.6] Store のメモリ DB にもメモリ反映 (画面再描画用)
  if (Store.patchDBItem) {
    Store.patchDBItem('parents', 'par_id', realParId, patch);
  }

  // [y6.11] GAS にも保存 (デバイス間同期)
  //   ・bloodline_data: JSON.stringify して bloodline_data_json 列に保存
  //   ・source_screenshots: 画像本体は除いてメタデータのみ source_screenshots_json 列に保存
  //   ・更新時刻: bloodline_updated_at 列に保存
  //   ・失敗してもアプリ全体を止めず、ローカル保存だけで完結する
  try {
    const cloudPayload = { par_id: realParId };
    if (next.bloodline_data !== undefined) {
      cloudPayload.bloodline_data_json = next.bloodline_data
        ? JSON.stringify(next.bloodline_data) : '';
    }
    if (next.source_screenshots !== undefined) {
      // 画像本体 (image_data_url / thumbnail_data_url) は GAS には送らない
      // (Sheets セル容量制限・ペイロード肥大化防止のため)
      const stripped = (next.source_screenshots || []).map(function (s) {
        return {
          id:                 s.id,
          uploaded_at:        s.uploaded_at,
          drive_file_id:      s.drive_file_id || null,
          drive_view_url:     s.drive_view_url || null,
          drive_file_url:     s.drive_file_url || null,
          extraction_status:  s.extraction_status,
          extracted_at:       s.extracted_at,
          filename:           s.filename || null,
        };
      });
      cloudPayload.source_screenshots_json = JSON.stringify(stripped);
    }
    cloudPayload.bloodline_updated_at = next.updated_at;

    const result = await _pbeCallGAS('updateParentBloodline', cloudPayload);
    if (result && result.ok === false) {
      console.warn('[PBE] GAS sync warning:', result.error);
    } else {
      console.log('[PBE] cloud sync success', { par_id: realParId });
    }
  } catch (e) {
    // GAS 通信失敗してもローカルには保存できているので、アプリ全体は止めない
    console.warn('[PBE] cloud sync failed (localStorage は保存済み):', e.message || e);
  }
}

// ════════════════════════════════════════════════════════════════
// [y6.11] GAS API ラッパー
// ────────────────────────────────────────────────────────────────
// 既存の API.js (call) はクロージャ内に閉じているため直接呼べない。
// CONFIG.GAS_URL を読んで自前で fetch する。
// 既存の call() と同じ仕様 (GET, payload を JSON.stringify してクエリに乗せる)。
// ════════════════════════════════════════════════════════════════
async function _pbeCallGAS(action, payload) {
  const url = (window.CONFIG && CONFIG.GAS_URL)
            || localStorage.getItem('hcos_gas_url')
            || '';
  if (!url) throw new Error('GAS URL が設定されていません');
  // [y6.13] POST 送信に変更 (GET の URL 長制限による 400 Bad Request 回避)
  //   ・bloodline_data_json + source_screenshots_json は数 KB 規模になるため
  //     URL クエリに載せると script.googleusercontent.com 側のリダイレクト
  //     URL が肥大化し 400 を返す。POST なら body に乗るので長さ制限なし。
  //   ・Content-Type: text/plain で送信して CORS preflight (OPTIONS) を回避。
  //     GAS Web App は OPTIONS に応答できないため、application/json で
  //     送ると preflight で失敗する。text/plain は simple request 扱い。
  //   ・action は body に同梱する。GAS 側 handleRequest は
  //     `body.action` のパスでも拾うので互換動作する。
  const body = JSON.stringify(Object.assign({ action: action }, payload || {}));
  const ctrl = new AbortController();
  const tid  = setTimeout(function () { ctrl.abort(); }, 60000);  // 60秒タイムアウト
  try {
    const res = await fetch(url, {
      method:   'POST',
      redirect: 'follow',
      headers:  { 'Content-Type': 'text/plain;charset=UTF-8' },
      body:     body,
      signal:   ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' (action=' + action + ')');
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); }
    catch (_) {
      throw new Error('GAS が JSON を返しませんでした');
    }
    if (!json.ok) throw new Error(json.error || 'GASエラー (action=' + action + ')');
    return json.data;
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

// [y6.11] スクショを Drive にアップロード
//   Drive へのアップロードに成功したら drive_file_id, drive_view_url を返す
async function _pbeUploadScreenshotToDrive(parId, processedImage, shotId) {
  // image_data_url からヘッダーを除去して base64 部分だけ取り出す
  const m = String(processedImage.image_data_url || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) {
    throw new Error('画像データの形式が不正です');
  }
  const mimeType = m[1];
  const base64   = m[2];

  const result = await _pbeCallGAS('uploadParentScreenshot', {
    par_id:    parId,
    base64:    base64,
    mime_type: mimeType,
    shot_id:   shotId,
  });

  if (!result || result.ok === false) {
    throw new Error((result && result.error) || 'Drive へのアップロードに失敗');
  }
  return {
    drive_file_id:  result.file_id,
    drive_view_url: result.view_url,
    drive_file_url: result.file_url,
    filename:       result.filename,
  };
}

// ════════════════════════════════════════════════════════════════
// 画像圧縮: File / DataURL → 指定サイズ以下の JPEG DataURL
// [y6.4] sizeLimitBytes 引数を追加し、リトライ時はより強く圧縮できるように
// ════════════════════════════════════════════════════════════════
function _pbeCompressImage(srcDataUrl, maxDim, qualityStart, sizeLimitBytes) {
  const limit = sizeLimitBytes || PBE_MAX_IMAGE_SIZE_BYTES;
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      const w0 = img.naturalWidth, h0 = img.naturalHeight;
      const longest = Math.max(w0, h0);
      const scale = longest > maxDim ? (maxDim / longest) : 1;
      const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      // 段階的に quality を下げて目標サイズ以下に
      let quality = qualityStart || 0.85;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      let attempts = 0;
      while (dataUrl.length * 0.75 > limit && quality > 0.35 && attempts < 8) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        attempts++;
      }
      resolve({ dataUrl: dataUrl, width: w, height: h, quality: quality });
    };
    img.onerror = function () { reject(new Error('画像の読み込みに失敗しました')); };
    img.src = srcDataUrl;
  });
}

function _pbeFileToDataUrl(file) {
  return new Promise(function (resolve, reject) {
    const fr = new FileReader();
    fr.onload  = function () { resolve(fr.result); };
    fr.onerror = function () { reject(new Error('ファイルの読み込みに失敗しました')); };
    fr.readAsDataURL(file);
  });
}

async function _pbeProcessImageFile(file) {
  const rawDataUrl = await _pbeFileToDataUrl(file);
  const main = await _pbeCompressImage(rawDataUrl, PBE_MAX_IMAGE_DIMENSION, 0.85, PBE_MAX_IMAGE_SIZE_BYTES);
  const thumb = await _pbeCompressImage(rawDataUrl, PBE_THUMB_DIMENSION,  0.7, 100 * 1024);
  return {
    image_data_url:     main.dataUrl,
    thumbnail_data_url: thumb.dataUrl,
    width:              main.width,
    height:             main.height,
    raw_data_url:       rawDataUrl,    // [y6.4] リトライ時に再圧縮するために保持
  };
}

// [y6.4] リトライ時用: より強く圧縮した画像データURLを生成
async function _pbeRecompressForRetry(processedImage) {
  if (!processedImage.raw_data_url) return processedImage.image_data_url;
  const recompressed = await _pbeCompressImage(
    processedImage.raw_data_url,
    PBE_RETRY_MAX_DIMENSION,
    0.7,
    PBE_RETRY_MAX_SIZE_BYTES
  );
  return recompressed.dataUrl;
}

// ════════════════════════════════════════════════════════════════
// Gemini Vision API 呼び出し
// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// [y6.8] degenerate 出力検知
// [y6.10] ルール3 (10〜200字の繰返し) は通常の出品文でも稀にヒットする
//   ことが分かったため削除。ルール1/2/4のみで運用。
// ════════════════════════════════════════════════════════════════
function _pbeDetectDegenerate(text) {
  if (!text) return false;
  // ルール1: 同じ文字が連続40回以上 (ෛෛෛෛ... 等)
  if (text.match(/(.)\1{40,}/)) return true;
  // ルール2: 同じ短いパターンが20回以上
  if (text.match(/(.{2,5})\1{20,}/)) return true;
  // ルール4: 1000字超のレスポンスで、特定の30字スライスが文書全体で5回以上現れる
  //   (注釈フレーズが何度も繰り返される長文 degenerate を検知)
  if (text.length > 1000) {
    const sliced = text.slice(0, 5000);
    for (let i = 0; i < sliced.length - 30; i += 80) {
      const sample = sliced.slice(i, i + 30);
      if (!sample.trim() || sample.length < 30) continue;
      const escaped = sample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = sliced.match(new RegExp(escaped, 'g'));
      if (matches && matches.length >= 5) return true;
    }
  }
  return false;
}

function _pbeBuildVisionPrompt() {
  return `あなたはヘラクレスオオカブトの繁殖個体の出品ページから情報を抽出するアシスタントです。
画像から書かれている情報を正確に読み取り、構造化JSONで返してください。

━━━ 🌟 最重要原則 ━━━
1. **画像内に書かれた文字を一字一句忠実に読み取ること**
2. **存在する情報は決して取りこぼさないこと**(特に raw_text と kinship_records)
3. **画像にない情報は null** (推測・補完しない)
4. **長文の本文(商品説明)は必ず raw_text に全文転記**

━━━ 抽出対象 (詳細) ━━━

【1】species_full: 学名
- 画像に "Dynastes hercules hercules" のように明示されている場合のみ
- "D.Hヘラクレス" のような略称しか無いなら null (common_name に入れる)

【2】common_name: 和名・通称
- "D.Hヘラクレス" / "ヘラクレスオオカブト" / "DHH" など

【3】origin: 産地
- "グアドループ" / "Guadeloupe" / "コロンビア" など

【4】generation: 累代
- "CB" / "WD" / "F1" / "WF1" / "CBF2" など

【5】eclosion_period: 羽化日・羽化期
- "2025/8/中旬" / "8月中旬" / "2024年12月" など (原文そのまま)

【6】body_size_mm: 体長 (数値のみ)
- 「79mm程度」→ 79
- 「78〜79mm」→ 79

【7】paternal_blood: ♂親(父系)の血統表記
- 例: "MT-FF1710F.FFOAKS"
- 「血統：xxx」「種親♂ xxx」のように書かれている部分の値を**原文そのまま**

【8】maternal_blood: ♀親(母系)の血統表記
- 例: "00-181"

【9】kinship_records: 🔥 同腹兄弟・同系統の実績 (絶対に取りこぼさない)
   出品文によく出てくる以下のような表現を全て構造化:
   - 「174ミリ筆頭」「174mm 1頭」→ {metric:"body_size", threshold:174, count:1, unit:"mm", is_top:true}
   - 「170ミリup 6頭」「170mm up 6頭」→ {metric:"body_size", threshold:170, count:6, unit:"mm"}
   - 「168ミリup 3頭」→ {metric:"body_size", threshold:168, count:3, unit:"mm"}
   - 「165ミリupは数えていません」→ {metric:"body_size", threshold:165, count:null, unit:"mm", note:"数えていない"}
   - 「前蛹150g up 筆頭」→ {metric:"pre_pupa_weight", threshold:150, count:1, unit:"g", is_top:true, note:"前蛹"}
   - 「140g台複数」→ {metric:"pre_pupa_weight", threshold:140, count:null, unit:"g", note:"複数"}
   - 「胸角121ミリ」→ {metric:"thorax_horn", threshold:121, count:1, unit:"mm", note:"種親♂"}

   metric の選択基準:
   - "body_size" — 体長 (mm)
   - "pre_pupa_weight" — 前蛹体重 (g)・「前蛹」「蛹」の文脈
   - "larva_weight" — 幼虫体重 (g)・「幼虫」「終令」の文脈
   - "thorax_horn" — 胸角 (mm)
   - "head_horn" — 頭角 (mm)

   ⚠️ ⚠️ ⚠️ 重要:
   - 「現状で170up6頭出ている」のように同じ実績が文中で複数回書かれている場合、
     重複して配列に入れる必要は無い (同じ実績なので1回でOK)
   - しかし、「174ミリ筆頭・170ミリup 6頭・168ミリup 3頭」のように違う数値の実績は
     必ず別々のレコードとして全部抽出すること
   - 上記の例で1件しか抽出しないのは大きな取りこぼし扱い

【10】feature_notes: 系統的特徴をまとめた中立的な短文 (1〜2文・100〜200字)
   - 出品者の主観的な意見ではなく、客観的な特徴を要約
   - 例: "胸角の伸びが優秀。174mm筆頭・170mm up 6頭出ている長角サイズ系統。種親♂は胸角121mmのハイスペック個体。"

【11】raw_text: 🔥 商品説明本文を全文転記 (重要・取りこぼし厳禁)
   - 出品ページの説明文(本文)を**画像に書かれているまま**全文転記
   - 改行も保持(\\n を使う)
   - 最大2000字までは入れて良い
   - **販売者名・購入価格・購入条件は除外**
   - 「ご閲覧いただきありがとうございます」のような挨拶文も含めて転記
   - 「[学名] ...」「[産地] ...」のような項目も全部転記OK

━━━ 🚫 禁止事項 ━━━
1. 販売者名・店舗名・出品者名は抽出しない
2. 購入価格・落札金額は抽出しない
3. 購入条件・購入制約は抽出しない (「幼虫販売目的不可」など)
4. フィールドの値に注釈・補足・括弧書きを付けない
   悪い例: "Dynastes hercules hercules (補完)"
   良い例: "Dynastes hercules hercules"
5. JSONの前後に解説文を書かない

━━━ 出力フォーマット ━━━
純粋なJSONのみを返してください (マークダウン装飾なし)。
記載のない項目は null (空文字列ではなく):

{
  "species_full":    "...",
  "common_name":     "...",
  "origin":          "...",
  "generation":      "...",
  "eclosion_period": "...",
  "body_size_mm":    79,
  "paternal_blood":  "...",
  "maternal_blood":  "...",
  "kinship_records": [...],
  "feature_notes":   "...",
  "raw_text":        "..."
}`;
}

async function _pbeCallVision(imageDataUrl, apiKey, opts) {
  opts = opts || {};
  const isRetry = !!opts.isRetry;
  // image_data_url は "data:image/jpeg;base64,xxxx" 形式
  const m = String(imageDataUrl).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
  if (!m) throw new Error('画像データの形式が不正です');
  const mimeType = m[1];
  const base64   = m[2];

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            + PBE_GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      species_full:    { type: 'STRING', nullable: true },
      common_name:     { type: 'STRING', nullable: true },
      origin:          { type: 'STRING', nullable: true },
      generation:      { type: 'STRING', nullable: true },
      eclosion_period: { type: 'STRING', nullable: true },
      body_size_mm:    { type: 'NUMBER', nullable: true },
      paternal_blood:  { type: 'STRING', nullable: true },
      maternal_blood:  { type: 'STRING', nullable: true },
      kinship_records: {
        type: 'ARRAY',
        nullable: true,
        items: {
          type: 'OBJECT',
          properties: {
            metric:    { type: 'STRING' },
            threshold: { type: 'NUMBER' },
            count:     { type: 'NUMBER', nullable: true },
            unit:      { type: 'STRING' },
            is_top:    { type: 'BOOLEAN', nullable: true },
            note:      { type: 'STRING', nullable: true },
          },
          required: ['metric', 'threshold', 'unit'],
        },
      },
      feature_notes: { type: 'STRING', nullable: true },
      raw_text:      { type: 'STRING', nullable: true },
    },
  };

  const body = {
    contents: [{
      parts: [
        { text: _pbeBuildVisionPrompt() },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      temperature:      isRetry ? 0.7 : 0.5,    // [y6.8] 0.15→0.7, 0.3→0.5 (低温度はdegenerate繰り返しを誘発する)
      maxOutputTokens:  8192,
      topP:             isRetry ? 0.7 : 0.85,
      responseMimeType: 'application/json',
      responseSchema:   responseSchema,
    },
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(function () { return {}; });
    throw new Error((err && err.error && err.error.message) || ('HTTP ' + res.status));
  }
  const data = await res.json();
  const cand = data && data.candidates && data.candidates[0];
  const finishReason = cand && cand.finishReason;
  const text = (cand && cand.content && cand.content.parts &&
                cand.content.parts[0] && cand.content.parts[0].text) || '';
  if (!text) {
    if (finishReason === 'SAFETY') {
      throw new Error('Geminiのセーフティフィルタにブロックされました');
    }
    throw new Error('Gemini レスポンスが空でした (finishReason=' + (finishReason || 'unknown') + ')');
  }

  // [y6.8] degenerate 出力 (同じ文字の異常繰り返し) を検知してリトライ対象に
  if (_pbeDetectDegenerate(text)) {
    console.warn('[PBE] Degenerate output detected (single). Head:', text.slice(0, 200));
    throw new Error('Gemini が異常な繰り返し出力を返しました。再試行してください。');
  }

  // JSON パース (yahoo_listing.js と同等のフォールバック)
  let jsonStr = text.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) jsonStr = fence[1].trim();
  let parsed;
  try { parsed = JSON.parse(jsonStr); }
  catch (_) {
    const m2 = jsonStr.match(/\{[\s\S]*\}/);
    if (m2) {
      try { parsed = JSON.parse(m2[0]); } catch (_e) {}
    }
  }
  if (!parsed) {
    console.warn('[PBE] JSON parse failed. Raw response head:', text.slice(0, 500));
    throw new Error('抽出結果のJSONパースに失敗しました。再試行してください。');
  }
  return parsed;
}

// ════════════════════════════════════════════════════════════════
// [y6.2] 複数画像をまとめて Vision API に渡す版
//   同じ種親に関する複数のスクショ (タイトル・商品説明1・2など) を
//   一度のリクエストで送信し、AIに統合された1セットの構造化データを
//   返してもらう。同腹兄弟実績などスクショ間で重複する情報も統合される。
// ════════════════════════════════════════════════════════════════
async function _pbeCallVisionMulti(imageDataUrls, apiKey, opts) {
  if (!imageDataUrls || !imageDataUrls.length) {
    throw new Error('画像が選択されていません');
  }
  if (imageDataUrls.length === 1) {
    return _pbeCallVision(imageDataUrls[0], apiKey, opts);
  }
  opts = opts || {};
  const isRetry = !!opts.isRetry;

  // 複数枚の場合
  const imageParts = imageDataUrls.map(function (dataUrl, idx) {
    const m = String(dataUrl).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!m) throw new Error('画像データの形式が不正です (' + (idx + 1) + '枚目)');
    return { mimeType: m[1], base64: m[2] };
  });

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            + PBE_GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);

  // 複数画像用に少しプロンプトを調整 (画像が複数ある旨を伝える)
  // [y6.3] リトライ時は raw_text を短く制限してトークン節約
  // [y6.4] リトライ時は raw_text を完全に空にして、構造化フィールドのみに集中
  const rawTextLimit = isRetry ? 0 : 1500;
  const rawTextInstruction = isRetry
    ? '・raw_text は空文字列 "" で返す (構造化フィールドのみに集中するため)\n'
      + '・kinship_records も最大10件までに絞る (重要な実績だけ)\n'
      + '・feature_notes は1文・60文字以内に収める'
    : '・raw_text は重要部分のみ抜粋し ' + rawTextLimit + ' 文字以内に収める';
  const multiPrompt = _pbeBuildVisionPrompt()
    + '\n\n━━━ 複数画像の取り扱い ━━━\n'
    + 'これから ' + imageDataUrls.length + '枚 の画像を渡します。これらはすべて同じ種親個体に関する出品ページの異なる部分(商品タイトル・商品説明1ページ目・2ページ目・画像など)です。\n'
    + '各画像から読み取れる情報を**統合**して、1セットの構造化データを返してください。\n'
    + '・同じ情報が複数の画像にある場合は重複させない\n'
    + '・補完的な情報がある場合は両方を活かす(例: 1枚目に♂血統、2枚目に♀血統)\n'
    + '・kinship_records は全画像の情報を統合して1つの配列にまとめる\n'
    + rawTextInstruction;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      species_full:    { type: 'STRING', nullable: true },
      common_name:     { type: 'STRING', nullable: true },
      origin:          { type: 'STRING', nullable: true },
      generation:      { type: 'STRING', nullable: true },
      eclosion_period: { type: 'STRING', nullable: true },
      body_size_mm:    { type: 'NUMBER', nullable: true },
      paternal_blood:  { type: 'STRING', nullable: true },
      maternal_blood:  { type: 'STRING', nullable: true },
      kinship_records: {
        type: 'ARRAY',
        nullable: true,
        items: {
          type: 'OBJECT',
          properties: {
            metric:    { type: 'STRING' },
            threshold: { type: 'NUMBER' },
            count:     { type: 'NUMBER', nullable: true },
            unit:      { type: 'STRING' },
            is_top:    { type: 'BOOLEAN', nullable: true },
            note:      { type: 'STRING', nullable: true },
          },
          required: ['metric', 'threshold', 'unit'],
        },
      },
      feature_notes: { type: 'STRING', nullable: true },
      raw_text:      { type: 'STRING', nullable: true },
    },
  };

  // parts: [テキスト, 画像1, 画像2, ...]
  const parts = [{ text: multiPrompt }];
  imageParts.forEach(function (p) {
    parts.push({ inline_data: { mime_type: p.mimeType, data: p.base64 } });
  });

  const body = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature:      isRetry ? 0.7 : 0.5,    // [y6.8] 0.15→0.7, 0.3→0.5 (低温度はdegenerate繰り返しを誘発する)
      maxOutputTokens:  8192,
      topP:             isRetry ? 0.7 : 0.85,
      responseMimeType: 'application/json',
      responseSchema:   responseSchema,
    },
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(function () { return {}; });
    throw new Error((err && err.error && err.error.message) || ('HTTP ' + res.status));
  }
  const data = await res.json();
  const cand = data && data.candidates && data.candidates[0];
  const finishReason = cand && cand.finishReason;
  const text = (cand && cand.content && cand.content.parts &&
                cand.content.parts[0] && cand.content.parts[0].text) || '';
  if (!text) {
    if (finishReason === 'SAFETY') {
      throw new Error('Geminiのセーフティフィルタにブロックされました');
    }
    throw new Error('Gemini レスポンスが空でした (finishReason=' + (finishReason || 'unknown') + ')');
  }
  // [y6.3] 切り捨て検知
  const wasTruncated = (finishReason === 'MAX_TOKENS');
  if (wasTruncated) console.warn('[PBE] Gemini response was truncated (MAX_TOKENS).');

  // [y6.8] degenerate 出力 (同じ文字の異常繰り返し) を検知してリトライ対象に
  if (_pbeDetectDegenerate(text)) {
    console.warn('[PBE] Degenerate output detected (multi). Head:', text.slice(0, 200));
    throw new Error('Gemini が異常な繰り返し出力を返しました。再試行してください。');
  }

  // JSON パース
  let jsonStr = text.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) jsonStr = fence[1].trim();
  let parsed;
  try { parsed = JSON.parse(jsonStr); }
  catch (_) {}
  if (!parsed) {
    const m2 = jsonStr.match(/\{[\s\S]*\}/);
    if (m2) {
      try { parsed = JSON.parse(m2[0]); } catch (_e) {}
    }
  }
  // [y6.3] 切り捨てJSON補修: 末尾の不完全な文字列を閉じ、{}を補完
  if (!parsed && wasTruncated) {
    const m3 = jsonStr.match(/\{[\s\S]*/);
    if (m3) {
      let s = m3[0];
      let inS = false, esc = false;
      let lastSafeIdx = -1;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inS = !inS; if (!inS) lastSafeIdx = i; continue; }
        if (!inS && ch === ',') lastSafeIdx = i;
      }
      if (lastSafeIdx > 0) {
        let tail = s.slice(0, lastSafeIdx + 1).replace(/,\s*$/, '');
        const opens = (tail.match(/\{/g) || []).length - (tail.match(/\}/g) || []).length;
        const opensA = (tail.match(/\[/g) || []).length - (tail.match(/\]/g) || []).length;
        for (let i = 0; i < opensA; i++) tail += ']';
        for (let i = 0; i < opens; i++) tail += '}';
        try { parsed = JSON.parse(tail); console.warn('[PBE] Recovered partial JSON.'); }
        catch (_e) {}
      }
    }
  }
  if (!parsed) {
    console.warn('[PBE] JSON parse failed (multi). finishReason=' + finishReason
      + ', raw response head:', text.slice(0, 500));
    if (wasTruncated) {
      throw new Error('レスポンスがトークン上限で切り捨てられました。スクショを減らすか再試行してください。');
    }
    throw new Error('抽出結果のJSONパースに失敗しました。再試行してください。');
  }
  return parsed;
}

// ════════════════════════════════════════════════════════════════
// [y6.5] 複数画像から個別に抽出した部分結果をJSロジックでマージ
//   各フィールドの統合方針:
//     - 文字列フィールド: 最初に値があったものを採用、ただし他で
//       より長い値があれば置き換え (より詳細な記述を優先)
//     - 数値フィールド (body_size_mm): 最初の非null値を採用
//     - kinship_records: 全部結合して、metric+thresholdが同じものは
//       より count や is_top の情報が豊富なものを残して重複排除
//     - feature_notes: 全部結合 (改行区切り)
//     - raw_text: 全部結合 (改行2つで区切り)
// ════════════════════════════════════════════════════════════════
function _pbeMergePartials(partials) {
  if (!partials || !partials.length) return null;
  if (partials.length === 1) return partials[0];

  function pickStr(field) {
    let best = null;
    partials.forEach(function (p) {
      const v = p && p[field];
      if (v == null || v === '') return;
      if (best == null || String(v).length > String(best).length) best = v;
    });
    return best;
  }
  function pickNum(field) {
    for (let i = 0; i < partials.length; i++) {
      const v = partials[i] && partials[i][field];
      if (v != null && !isNaN(parseFloat(v))) return parseFloat(v);
    }
    return null;
  }
  function joinStr(field, sep) {
    const xs = [];
    partials.forEach(function (p) {
      const v = p && p[field];
      if (v && String(v).trim()) xs.push(String(v).trim());
    });
    // 完全一致の重複は除外
    return Array.from(new Set(xs)).join(sep || '\n\n');
  }

  // kinship_records をマージ・重複排除
  const allRecords = [];
  partials.forEach(function (p) {
    if (p && Array.isArray(p.kinship_records)) {
      p.kinship_records.forEach(function (r) { allRecords.push(r); });
    }
  });
  // metric+threshold をキーに統合 (同じキーで count や is_top が異なる場合、情報が多い方を採用)
  const recordMap = {};
  allRecords.forEach(function (r) {
    if (!r || !r.metric || r.threshold == null) return;
    const key = r.metric + '@' + r.threshold;
    const existing = recordMap[key];
    if (!existing) {
      recordMap[key] = r;
      return;
    }
    // より情報が多い方を残す
    const newScore = (r.count != null ? 2 : 0) + (r.is_top ? 1 : 0) + (r.note ? 1 : 0);
    const oldScore = (existing.count != null ? 2 : 0) + (existing.is_top ? 1 : 0) + (existing.note ? 1 : 0);
    if (newScore > oldScore) recordMap[key] = r;
  });
  const mergedRecords = Object.values(recordMap)
    .sort(function (a, b) {
      // metric ごとにグループ化、同metric内では threshold降順
      if (a.metric !== b.metric) return a.metric < b.metric ? -1 : 1;
      return b.threshold - a.threshold;
    });

  return {
    species_full:    pickStr('species_full'),
    common_name:     pickStr('common_name'),
    origin:          pickStr('origin'),
    generation:      pickStr('generation'),
    eclosion_period: pickStr('eclosion_period'),
    body_size_mm:    pickNum('body_size_mm'),
    paternal_blood:  pickStr('paternal_blood'),
    maternal_blood:  pickStr('maternal_blood'),
    kinship_records: mergedRecords,
    feature_notes:   joinStr('feature_notes', ' / '),
    raw_text:        joinStr('raw_text', '\n\n'),
  };
}

// ════════════════════════════════════════════════════════════════
// 抽出結果のサニタイズ (販売者名等が混入していたら除去)
// ════════════════════════════════════════════════════════════════
//
// [y6.9] フィールドの妥当性チェック表
//   学名・累代・産地などは「常識的にこの長さに収まる」べきフィールド。
//   AI が長文の注釈や本文を混入させてきたら、ここで弾く。
const PBE_FIELD_MAX_LEN = {
  species_full:    60,    // "Dynastes hercules hercules" = 26字
  common_name:     30,    // "ヘラクレスオオカブト" = 10字
  origin:          40,    // "グアドループ" / "Guadeloupe"
  generation:      10,    // "CB" / "WD" / "CBF2" など
  eclosion_period: 30,    // "2025/8/中旬" / "2024年12月"
  paternal_blood:  300,   // 血統表記は長くなりうる
  maternal_blood:  300,
  feature_notes:   800,   // [y6.12] 特徴説明 (500→800に拡張)
  raw_text:        2500,  // [y6.12] 出品本文の全文 (上限を明示)
};

function _pbeSanitizeBloodlineData(data) {
  if (!data || typeof data !== 'object') return null;
  // 想定外フィールドが万一混入してもこの段階で除去
  const allowed = [
    'species_full', 'common_name', 'origin', 'generation',
    'eclosion_period', 'body_size_mm', 'paternal_blood', 'maternal_blood',
    'kinship_records', 'feature_notes', 'raw_text',
  ];
  const out = {};
  allowed.forEach(function (k) {
    if (data[k] !== undefined) out[k] = data[k];
  });

  // [y6.7] 各文字列フィールドから注釈・括弧書きを自動除去
  const stripFields = ['species_full', 'common_name', 'origin', 'generation',
                       'eclosion_period', 'paternal_blood', 'maternal_blood'];
  stripFields.forEach(function (f) {
    if (out[f] && typeof out[f] === 'string') {
      let v = String(out[f]).trim();
      // 末尾の括弧書き注釈を除去 (注釈キーワード含む)
      v = v.replace(/[\s　]*[(（][^)）]{6,}(?:補完|明示|表記|推測|思われ|可能性|該当|読み取れ)[^)）]*[)）][\s　]*$/g, '').trim();
      // 残った長い末尾括弧を除去 (15文字超)
      v = v.replace(/[\s　]*[(（][^)）]{15,}[)）][\s　]*$/g, '').trim();
      // [y6.9] 「と表記されているため」「補完しています」等の注釈フレーズが含まれていたら、その手前で切る
      // [y6.10] 「ですが」のような汎用的な単語は削除(正常値を巻き込む)。
      //   注釈フレーズは「補完」「明示されていません」「画像内には」のように
      //   AI注釈に特有の表現に限定。
      const annotationPatterns = [
        /[\s　]*と表記されているため.*$/,
        /[\s　]*補完しています.*$/,
        /[\s　]*明示されていません.*$/,
        /[\s　]*画像内には.*$/,
        /[\s　]*記載されていません.*$/,
        /[\s　]*画像から読み取れ.*$/,
      ];
      annotationPatterns.forEach(function (re) {
        v = v.replace(re, '').trim();
      });
      out[f] = v || null;
    }
  });

  // [y6.9] 各フィールドの長さ上限チェック: 超えたら null に
  Object.keys(PBE_FIELD_MAX_LEN).forEach(function (f) {
    const max = PBE_FIELD_MAX_LEN[f];
    if (out[f] && typeof out[f] === 'string' && out[f].length > max) {
      console.warn('[PBE] field "' + f + '" too long (' + out[f].length + ' chars > ' + max + '), discarding:', out[f].slice(0, 100));
      out[f] = null;
    }
  });

  // [y6.9] 各文字列フィールドが degenerate パターン (同じ短文の繰り返し) なら null に
  ['species_full', 'common_name', 'origin', 'generation', 'eclosion_period',
   'paternal_blood', 'maternal_blood', 'feature_notes'].forEach(function (f) {
    if (out[f] && typeof out[f] === 'string' && _pbeDetectDegenerate(out[f])) {
      console.warn('[PBE] field "' + f + '" contains degenerate pattern, discarding');
      out[f] = null;
    }
  });

  // body_size_mm は数値化
  if (out.body_size_mm != null && typeof out.body_size_mm !== 'number') {
    const n = parseFloat(out.body_size_mm);
    out.body_size_mm = isNaN(n) ? null : n;
  }
  // kinship_records はサニタイズ
  if (Array.isArray(out.kinship_records)) {
    out.kinship_records = out.kinship_records
      .filter(function (r) { return r && r.metric && r.threshold != null; })
      .map(function (r) {
        return {
          metric:    String(r.metric),
          threshold: Number(r.threshold),
          count:     r.count != null ? Number(r.count) : null,
          unit:      r.unit || (PBE_KINSHIP_METRICS[r.metric] && PBE_KINSHIP_METRICS[r.metric].unit) || '',
          is_top:    !!r.is_top,
          note:      r.note ? String(r.note) : '',
        };
      });
  } else {
    out.kinship_records = [];
  }
  return out;
}

// ════════════════════════════════════════════════════════════════
// 抽出モーダル: 種親編集画面から呼ばれる
//   parId   - 対象の種親ID
//   onDone  - 抽出完了時に呼ばれるコールバック (formに値を反映する用)
// ════════════════════════════════════════════════════════════════
Pages._pbeOpenExtractor = function (parId, opts) {
  opts = opts || {};
  const par = _pbeGetParent(parId);
  // par が null でもOK (新規登録時など) - その場合は parId='' で扱う
  const apiKey = _pbeGetApiKey();
  // [y6.1] 設定画面と共用の API キーがすでにある場合は再入力させない
  const hasKey = !!apiKey;

  const html = '<div class="modal-title">📷 血統情報を抽出</div>'
    + '<div class="form-section" style="font-size:.88rem;line-height:1.55">'
    + '  <p style="margin-bottom:8px;color:var(--text2)">'
    + '    ヤフオク等の出品ページのスクリーンショットを選択してください。<br>'
    + '    AI(Gemini Vision)が血統表記・サイズ・累代・同腹兄弟実績を自動抽出します。'
    + '  </p>'
    + '  <div style="background:var(--surface2);padding:8px 10px;border-radius:6px;font-size:.78rem;color:var(--text3);line-height:1.5;margin-bottom:12px">'
    + '    🔒 販売者名・店舗名・購入価格・購入条件は<b>抽出されません</b>。<br>'
    + '    🔒 抽出結果はあなたの端末内のみに保存されます。'
    + '  </div>'
    + '  <div style="margin-bottom:10px">'
    + '    <label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">スクリーンショット <span style="font-weight:400;color:var(--text3);font-size:.72rem">(複数枚選択可)</span></label>'
    + '    <input type="file" id="pbe-file-input" accept="image/*" multiple '
    + '           style="width:100%;padding:8px;background:var(--surface2);border-radius:6px;color:var(--text);border:1px solid var(--surface3)">'
    + '    <div id="pbe-file-preview" style="margin-top:8px"></div>'
    + '  </div>'
    + (hasKey
      ? // [y6.1] 既にキーがある: ステータス表示のみ、入力欄は折り畳み
        '  <div style="background:rgba(80,180,120,.10);border:1px solid rgba(80,180,120,.3);padding:6px 10px;border-radius:6px;font-size:.78rem;color:var(--green);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">'
        + '    <span>✅ Gemini APIキー設定済み</span>'
        + '    <a href="#" onclick="document.getElementById(\'pbe-key-section\').style.display=\'block\';this.style.display=\'none\';return false;" style="color:var(--text3);font-size:.72rem;text-decoration:underline">変更</a>'
        + '  </div>'
        + '  <div id="pbe-key-section" style="display:none;margin-bottom:10px">'
        + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">APIキーを変更 <span style="font-weight:400;color:var(--text3)">(設定画面と共通)</span></label>'
        + '    <input type="password" id="pbe-key-input" value="' + _pbeEsc(apiKey) + '" placeholder="AIzaSy..." '
        + '           style="width:100%;padding:8px;background:var(--surface2);border-radius:6px;color:var(--text);border:1px solid var(--surface3)">'
        + '  </div>'
      : // [y6.1] 未設定: 案内 + その場で入力
        '  <div style="background:rgba(230,150,0,.12);border:1px solid rgba(230,150,0,.4);padding:8px 10px;border-radius:6px;font-size:.78rem;color:var(--amber);margin-bottom:10px;line-height:1.55">'
        + '    ⚠️ Gemini APIキーが未設定です。<br>'
        + '    通常は<b>設定画面 → Gemini APIキー</b>でまとめて設定しますが、ここでも入力できます。<br>'
        + '    入力したキーは設定画面と共通の保存先に記録されます。'
        + '  </div>'
        + '  <div style="margin-bottom:10px">'
        + '    <label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">'
        + '      Gemini APIキー <span style="font-weight:400;color:var(--text3)">(端末に保存・設定画面と共通)</span>'
        + '    </label>'
        + '    <input type="password" id="pbe-key-input" value="" placeholder="AIzaSy..." '
        + '           style="width:100%;padding:8px;background:var(--surface2);border-radius:6px;color:var(--text);border:1px solid var(--surface3)">'
        + '  </div>')
    + '  <div id="pbe-status" style="display:none;margin:10px 0;padding:8px;border-radius:6px;font-size:.82rem"></div>'
    + '</div>'
    + '<div class="modal-footer">'
    + '  <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>'
    + '  <button class="btn btn-primary" id="pbe-extract-btn" style="flex:2" '
    + '          onclick="Pages._pbeRunExtraction(\'' + _pbeEsc(parId) + '\')">'
    + '    🤖 AIで抽出開始'
    + '  </button>'
    + '</div>';

  UI.modal(html);

  // ファイル選択時のプレビュー (複数枚対応)
  setTimeout(function () {
    const fi = document.getElementById('pbe-file-input');
    if (fi) fi.addEventListener('change', function (e) {
      const files = Array.from((e.target.files) || []);
      const prev = document.getElementById('pbe-file-preview');
      if (!prev) return;
      if (!files.length) { prev.innerHTML = ''; return; }
      // [y6.4] 合計サイズ計算と警告判定
      // [y6.5] 順次処理になったのでトークン上限による失敗は起きない。
      //   警告は10枚以上の極端な場合のみ(時間がかかる注意)。
      const totalKb = Math.round(files.reduce(function (s, f) { return s + f.size; }, 0) / 1024);
      const tooMany = files.length > 10;
      const warningHtml = tooMany
        ? '<div style="background:rgba(230,150,0,.12);border:1px solid rgba(230,150,0,.35);padding:6px 10px;border-radius:6px;font-size:.74rem;color:var(--amber);margin-bottom:6px;line-height:1.5">'
          + '⚠️ ' + files.length + '枚は多めです。1枚あたり5〜10秒×枚数の時間がかかります。'
          + '</div>'
        : '';
      // 各ファイルをサムネイルとしてグリッド表示
      prev.innerHTML = warningHtml
        + '<div style="font-size:.78rem;color:var(--text2);margin-bottom:6px">'
        + '📁 ' + files.length + ' 枚選択中 (合計 ' + totalKb + 'KB)'
        + '</div>'
        + '<div id="pbe-thumbs-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px"></div>';
      const grid = document.getElementById('pbe-thumbs-grid');
      files.forEach(function (f, idx) {
        const r = new FileReader();
        r.onload = function () {
          const cell = document.createElement('div');
          cell.style.cssText = 'position:relative;border:1px solid var(--surface3);border-radius:6px;overflow:hidden;background:var(--surface2)';
          cell.innerHTML = '<img src="' + r.result + '" '
            + 'style="width:100%;height:80px;object-fit:cover;display:block">'
            + '<div style="position:absolute;top:2px;left:2px;background:rgba(0,0,0,.7);color:#fff;font-size:.66rem;padding:1px 5px;border-radius:3px;font-weight:700">'
            + (idx + 1) + '/' + files.length
            + '</div>'
            + '<div style="font-size:.66rem;color:var(--text3);padding:2px 4px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
            + Math.round(f.size / 1024) + 'KB</div>';
          grid.appendChild(cell);
        };
        r.readAsDataURL(f);
      });
    });
  }, 50);

  // 完了コールバックをグローバル保持 (モーダルからフォームへ反映するため)
  window.__pbeOnDone = opts.onDone || null;
};

// ════════════════════════════════════════════════════════════════
// 抽出実行 (モーダル内ボタンから呼ばれる)
// ════════════════════════════════════════════════════════════════
Pages._pbeRunExtraction = async function (parId) {
  const fi   = document.getElementById('pbe-file-input');
  const ki   = document.getElementById('pbe-key-input');
  const stat = document.getElementById('pbe-status');
  const btn  = document.getElementById('pbe-extract-btn');

  const files = fi && fi.files ? Array.from(fi.files) : [];
  // [y6.1] APIキー: 入力欄が表示されていればそれを使い、なければ既存のキーを使う
  let key = '';
  if (ki && ki.offsetParent !== null) {
    key = ki.value.trim();
  } else {
    key = _pbeGetApiKey();
  }

  if (!files.length) {
    if (stat) {
      stat.style.display = 'block';
      stat.style.cssText += ';background:rgba(230,80,80,.12);color:#e05050';
      stat.textContent = '⚠️ スクリーンショットを選択してください (複数枚選択可)';
    }
    return;
  }
  if (!key) {
    if (stat) {
      stat.style.display = 'block';
      stat.style.cssText += ';background:rgba(230,80,80,.12);color:#e05050';
      stat.textContent = '⚠️ Gemini APIキーが必要です。設定画面で登録するか、上の「変更」リンクから入力してください';
    }
    return;
  }
  if (ki && ki.offsetParent !== null && key !== _pbeGetApiKey()) {
    _pbeSetApiKey(key);
  }

  if (btn) btn.disabled = true;
  if (stat) {
    stat.style.display = 'block';
    stat.style.cssText = 'display:block;margin:10px 0;padding:8px;border-radius:6px;font-size:.82rem;'
      + 'background:rgba(80,180,120,.12);color:var(--green)';
    stat.innerHTML = '🔄 ' + files.length + '枚の画像を圧縮中...';
  }

  try {
    // [y6.2] 全画像を並列圧縮
    const processedAll = await Promise.all(files.map(function (f) {
      return _pbeProcessImageFile(f);
    }));

    let raw;
    if (processedAll.length === 1) {
      // [y6.5] 1枚: 従来通り単発リクエスト
      if (stat) stat.innerHTML = '🔄 Geminiで解析中... (10〜20秒)';
      try {
        raw = await _pbeCallVision(processedAll[0].image_data_url, key);
      } catch (e1) {
        const msg = String(e1.message || '');
        const isRetriable = msg.includes('JSON') || msg.includes('切り捨て') || msg.includes('パース') || msg.includes('繰り返し');
        if (isRetriable) {
          console.warn('[PBE] retrying single image with stronger compression...', e1);
          if (stat) stat.innerHTML = '🔄 再試行中... (画像を再圧縮)';
          const retryUrl = await _pbeRecompressForRetry(processedAll[0]);
          raw = await _pbeCallVision(retryUrl, key, { isRetry: true });
        } else {
          throw e1;
        }
      }
    } else {
      // [y6.5] 🔥 2枚以上: 1枚ずつ順次抽出してJS側でマージする方式に変更
      //   理由: 複数画像を1リクエストで送ると入力トークンが膨大になり、
      //         出力の8192トークンを使い切る前に切り捨てられる。
      //         1枚ずつ送れば各リクエストが軽量で、絶対に切り捨てられない。
      //   実装: 各画像を個別にVision APIに送信 → 結果をJS側でフィールドごとにマージ。
      //         API消費は枚数分増えるが、無料枠1日250リクエストには余裕で収まる(3〜5枚ならOK)。
      const partials = [];
      for (let i = 0; i < processedAll.length; i++) {
        if (stat) {
          stat.innerHTML = '🔄 ' + (i + 1) + '/' + processedAll.length
            + ' 枚目を解析中... (各5〜10秒)';
        }
        try {
          const r = await _pbeCallVision(processedAll[i].image_data_url, key);
          // [y6.7] 各 partial をサニタイズしてからマージ。注釈除去・null正規化を先行実施。
          partials.push(_pbeSanitizeBloodlineData(r));
        } catch (e1) {
          const msg = String(e1.message || '');
          const isRetriable = msg.includes('JSON') || msg.includes('切り捨て') || msg.includes('パース') || msg.includes('繰り返し');
          if (isRetriable) {
            console.warn('[PBE] retrying image #' + (i + 1) + ' with stronger compression...', e1);
            if (stat) stat.innerHTML = '🔄 ' + (i + 1) + '/' + processedAll.length + ' 枚目を再試行中...';
            const retryUrl = await _pbeRecompressForRetry(processedAll[i]);
            try {
              const r = await _pbeCallVision(retryUrl, key, { isRetry: true });
              partials.push(_pbeSanitizeBloodlineData(r));
            } catch (e2) {
              console.warn('[PBE] image #' + (i + 1) + ' failed twice, skipping', e2);
              // この1枚は諦めて次へ (1枚失敗しても他の枚で抽出続行)
              partials.push(null);
            }
          } else {
            throw e1;
          }
        }
      }
      // 全部失敗したらエラー
      const valid = partials.filter(function (p) { return p; });
      if (!valid.length) {
        throw new Error('全ての画像で抽出に失敗しました。画像を変えて再試行してください。');
      }
      // [y6.5] 結果をマージ (JSロジックで統合)
      if (stat) stat.innerHTML = '🔄 ' + valid.length + '枚の結果を統合中...';
      raw = _pbeMergePartials(valid);
    }

    // サニタイズ
    const data = _pbeSanitizeBloodlineData(raw);

    // 確認エディタを開く (複数スクショを渡す)
    UI.closeModal();
    setTimeout(function () {
      _pbeOpenEditor(parId, data, processedAll);
    }, 100);

  } catch (e) {
    console.error('[PBE] extraction failed', e);
    if (stat) {
      stat.style.cssText = 'display:block;margin:10px 0;padding:8px;border-radius:6px;font-size:.82rem;'
        + 'background:rgba(230,80,80,.12);color:#e05050';
      stat.textContent = '❌ ' + (e.message || String(e));
    }
    if (btn) btn.disabled = false;
  }
};

// ════════════════════════════════════════════════════════════════
// 抽出結果の確認・編集モーダル (構造化エディタ)
//   processedImages: 単一の processed オブジェクト or 配列 (両対応)
// ════════════════════════════════════════════════════════════════
function _pbeOpenEditor(parId, data, processedImages) {
  data = data || {};
  // [y6.2] 単一画像/複数画像の両方を受け付ける(後方互換)
  const imagesArr = Array.isArray(processedImages)
    ? processedImages
    : (processedImages ? [processedImages] : []);

  // データを window に保持して onclick から参照
  window.__pbeCurrentEdit = {
    parId:           parId,
    data:            data,
    processedImages: imagesArr,  // [y6.2] 配列で保持
  };

  // 元画像のサムネイル並べ表示
  const imagesPreview = imagesArr.length
    ? '<details style="margin-bottom:10px"><summary style="cursor:pointer;color:var(--text3);font-size:.78rem">📷 元画像 (' + imagesArr.length + '枚) を見る</summary>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px;margin-top:6px">'
      + imagesArr.map(function (img, i) {
          return '<div style="position:relative">'
            + '<img src="' + img.thumbnail_data_url + '" '
            + 'style="width:100%;height:120px;object-fit:cover;border-radius:6px;border:1px solid var(--surface3)">'
            + '<div style="position:absolute;top:2px;left:2px;background:rgba(0,0,0,.7);color:#fff;font-size:.66rem;padding:1px 5px;border-radius:3px">'
            + (i + 1) + '/' + imagesArr.length + '</div>'
            + '</div>';
        }).join('')
      + '</div></details>'
    : '';

  const html = '<div class="modal-title">📝 抽出結果の確認・編集</div>'
    + '<div class="form-section" style="font-size:.85rem;max-height:65vh;overflow-y:auto">'
    + imagesPreview
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">和名・通称</label>'
    + '    <input type="text" id="pbe-ed-common_name" class="input" value="' + _pbeEsc(data.common_name || '') + '" placeholder="ヘラクレスオオカブト">'
    + '  </div>'
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">学名</label>'
    + '    <input type="text" id="pbe-ed-species_full" class="input" value="' + _pbeEsc(data.species_full || '') + '" placeholder="Dynastes hercules hercules">'
    + '  </div>'
    + '  <div class="form-row-2">'
    + '    <div>'
    + '      <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">産地</label>'
    + '      <input type="text" id="pbe-ed-origin" class="input" value="' + _pbeEsc(data.origin || '') + '" placeholder="グアドループ">'
    + '    </div>'
    + '    <div>'
    + '      <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">累代</label>'
    + '      <input type="text" id="pbe-ed-generation" class="input" value="' + _pbeEsc(data.generation || '') + '" placeholder="CB">'
    + '    </div>'
    + '  </div>'
    + '  <div class="form-row-2">'
    + '    <div>'
    + '      <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">羽化期</label>'
    + '      <input type="text" id="pbe-ed-eclosion_period" class="input" value="' + _pbeEsc(data.eclosion_period || '') + '" placeholder="2025/8/中旬">'
    + '    </div>'
    + '    <div>'
    + '      <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">体長(mm)</label>'
    + '      <input type="number" id="pbe-ed-body_size_mm" class="input" value="' + _pbeEsc(data.body_size_mm != null ? data.body_size_mm : '') + '" placeholder="79">'
    + '    </div>'
    + '  </div>'
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">♂血統表記原文</label>'
    + '    <textarea id="pbe-ed-paternal_blood" class="input" rows="2" placeholder="MT-FF1710F.FFOAKS">' + _pbeEsc(data.paternal_blood || '') + '</textarea>'
    + '  </div>'
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">♀血統表記原文</label>'
    + '    <textarea id="pbe-ed-maternal_blood" class="input" rows="2" placeholder="00-181">' + _pbeEsc(data.maternal_blood || '') + '</textarea>'
    + '  </div>'
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">'
    + '      同腹兄弟実績 <span style="font-weight:400;color:var(--text3);font-size:.74rem">(数値修正可)</span>'
    + '    </label>'
    + '    <div id="pbe-ed-kinship-rows">' + _pbeRenderKinshipRows(data.kinship_records || []) + '</div>'
    + '    <button type="button" class="btn btn-ghost btn-sm" style="margin-top:4px;font-size:.78rem"'
    + '            onclick="Pages._pbeAddKinshipRow()">＋ 実績を追加</button>'
    + '  </div>'
    + '  <div style="margin-bottom:8px">'
    + '    <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:2px">系統的特徴</label>'
    + '    <textarea id="pbe-ed-feature_notes" class="input" rows="2" placeholder="胸角の伸びが優秀。サイズ系・長角系統。">' + _pbeEsc(data.feature_notes || '') + '</textarea>'
    + '  </div>'
    + '  <details id="pbe-ed-raw_text-details" style="margin-bottom:8px" open>'
    + '    <summary style="cursor:pointer;font-size:.78rem;color:var(--text3)">📄 抽出した本文 (編集可・ヤフオク出品時のヒント用・補完元)</summary>'
    + '    <textarea id="pbe-ed-raw_text" class="input" rows="6" style="margin-top:4px;font-size:.78rem"'
    + '              placeholder="ここに出品ページの本文を貼り付けて 📋 補完ボタンを押すと、AIが同腹兄弟実績や系統的特徴を自動抽出します">' + _pbeEsc(data.raw_text || '') + '</textarea>'
    + '    <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
    + '      <button type="button" class="btn btn-ghost btn-sm" style="font-size:.78rem"'
    + '              onclick="Pages._pbeReExtractFromText()">'
    + '        📋 本文から AI で補完'
    + '      </button>'
    + '      <span style="font-size:.7rem;color:var(--text3)">'
    + '        本文を編集→このボタンで実績や特徴を再抽出'
    + '      </span>'
    + '    </div>'
    + '  </details>'
    + '</div>'
    + '<div class="modal-footer">'
    + '  <button class="btn btn-ghost" style="flex:1" onclick="UI.closeModal()">キャンセル</button>'
    + '  <button class="btn btn-primary" style="flex:2" onclick="Pages._pbeSaveEditor()">💾 保存</button>'
    + '</div>';
  UI.modal(html);
}

// 同腹兄弟実績の行HTML
function _pbeRenderKinshipRows(records) {
  if (!records || !records.length) {
    return '<div style="font-size:.74rem;color:var(--text3);padding:4px 0">(実績データなし)</div>';
  }
  return records.map(function (r, i) { return _pbeKinshipRowHtml(r, i); }).join('');
}

function _pbeKinshipRowHtml(r, idx) {
  r = r || { metric:'body_size', threshold:'', count:'', unit:'mm', is_top:false, note:'' };
  const metricOpts = Object.keys(PBE_KINSHIP_METRICS).map(function (k) {
    return '<option value="' + k + '"' + (r.metric === k ? ' selected' : '') + '>'
      + PBE_KINSHIP_METRICS[k].label + '</option>';
  }).join('');
  return '<div class="pbe-kin-row" data-idx="' + idx + '" '
    + 'style="display:grid;grid-template-columns:1fr 1fr 1fr 24px;gap:4px;margin-bottom:4px;align-items:center">'
    + '  <select class="input pbe-kin-metric" style="font-size:.74rem;padding:4px">' + metricOpts + '</select>'
    + '  <input type="number" class="input pbe-kin-threshold" placeholder="しきい値" '
    + '         value="' + _pbeEsc(r.threshold != null ? r.threshold : '') + '" style="font-size:.74rem;padding:4px">'
    + '  <input type="text" class="input pbe-kin-count" placeholder="頭数 or 複数" '
    + '         value="' + _pbeEsc(r.count != null ? r.count : (r.note || '')) + '" style="font-size:.74rem;padding:4px">'
    + '  <button type="button" class="btn btn-ghost" style="padding:0;font-size:.9rem;color:var(--text3)" '
    + '          onclick="this.closest(\'.pbe-kin-row\').remove()">×</button>'
    + '</div>';
}

Pages._pbeAddKinshipRow = function () {
  const wrap = document.getElementById('pbe-ed-kinship-rows');
  if (!wrap) return;
  // 「(実績データなし)」を消す
  if (wrap.querySelector('.pbe-kin-row')) {
    // 既に行がある
  } else {
    wrap.innerHTML = '';
  }
  const idx = wrap.querySelectorAll('.pbe-kin-row').length;
  const div = document.createElement('div');
  div.innerHTML = _pbeKinshipRowHtml(null, idx);
  wrap.appendChild(div.firstElementChild);
};

// ════════════════════════════════════════════════════════════════
// [y6.12] 本文から AI で構造化情報を再抽出
// ────────────────────────────────────────────────────────────────
// 編集画面の "raw_text" 欄に貼り付けたテキストを Gemini に送り、
// kinship_records / feature_notes / その他のフィールドを再抽出する。
// 画像経由 (Vision) よりも本文を直接渡す方が高精度になりやすい。
// ════════════════════════════════════════════════════════════════
Pages._pbeReExtractFromText = async function () {
  const rawTextEl = document.getElementById('pbe-ed-raw_text');
  if (!rawTextEl) return;
  const text = String(rawTextEl.value || '').trim();
  if (text.length < 30) {
    UI.toast('本文が短すぎます (30字以上必要)', 'error');
    return;
  }

  const apiKey = (window.CONFIG && CONFIG.GEMINI_KEY)
              || localStorage.getItem('hcos_gemini_key') || '';
  if (!apiKey) {
    UI.toast('Gemini APIキーが未設定です', 'error');
    return;
  }

  // 確認
  if (!confirm('本文の内容を AI に解析させて、同腹兄弟実績や系統的特徴を自動抽出します。\n既存の入力内容は上書きされる可能性があります。\n続けますか?')) {
    return;
  }

  UI.toast('本文を AI で解析中...', 'info');

  try {
    const result = await _pbeCallGeminiForText(text, apiKey);
    if (!result || typeof result !== 'object') {
      UI.toast('AIからの応答が解析できませんでした', 'error');
      return;
    }

    // 既存値があるフィールドは上書きしない (ユーザー入力を尊重)
    function setIfEmpty(id, value) {
      const el = document.getElementById(id);
      if (!el) return;
      if (!el.value || el.value.trim() === '') {
        if (value != null && value !== '') {
          el.value = String(value);
        }
      }
    }

    setIfEmpty('pbe-ed-common_name',     result.common_name);
    setIfEmpty('pbe-ed-species_full',    result.species_full);
    setIfEmpty('pbe-ed-origin',          result.origin);
    setIfEmpty('pbe-ed-generation',      result.generation);
    setIfEmpty('pbe-ed-eclosion_period', result.eclosion_period);
    setIfEmpty('pbe-ed-body_size_mm',    result.body_size_mm);
    setIfEmpty('pbe-ed-paternal_blood',  result.paternal_blood);
    setIfEmpty('pbe-ed-maternal_blood',  result.maternal_blood);
    setIfEmpty('pbe-ed-feature_notes',   result.feature_notes);

    // kinship_records は既存が空なら全置換、既存があれば追加
    const kinshipWrap = document.getElementById('pbe-ed-kinship-rows');
    if (kinshipWrap && Array.isArray(result.kinship_records) && result.kinship_records.length) {
      const hasExisting = kinshipWrap.querySelectorAll('.pbe-kin-row').length > 0;
      if (!hasExisting) {
        // 既存無し → 全部置換
        kinshipWrap.innerHTML = _pbeRenderKinshipRows(result.kinship_records);
      } else {
        // 既存あり → 重複しない実績を追加
        // 既存の "metric@threshold" を集める
        const existingKeys = new Set();
        kinshipWrap.querySelectorAll('.pbe-kin-row').forEach(function (row) {
          const m = (row.querySelector('.pbe-kin-metric')    || {}).value || '';
          const t = (row.querySelector('.pbe-kin-threshold') || {}).value || '';
          if (m && t) existingKeys.add(m + '@' + t);
        });
        result.kinship_records.forEach(function (r) {
          if (!r || !r.metric || r.threshold == null) return;
          const key = r.metric + '@' + r.threshold;
          if (existingKeys.has(key)) return;
          // 新規行を追加
          const idx = kinshipWrap.querySelectorAll('.pbe-kin-row').length;
          const div = document.createElement('div');
          div.innerHTML = _pbeKinshipRowHtml(r, idx);
          if (div.firstElementChild) kinshipWrap.appendChild(div.firstElementChild);
        });
      }
    }

    UI.toast('AI 補完が完了しました ✅', 'success');
  } catch (e) {
    console.error('[PBE] reExtractFromText failed:', e);
    UI.toast('AI 補完失敗: ' + (e.message || '通信エラー'), 'error');
  }
};

// テキスト専用モードで Gemini を呼び出す (画像なし)
async function _pbeCallGeminiForText(text, apiKey) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            + PBE_GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);

  const prompt = `以下はヘラクレスオオカブトの繁殖個体の出品ページの本文です。
この本文から、構造化された血統情報を抽出してください。

━━━ 本文 ━━━
${text}
━━━ 本文ここまで ━━━

━━━ 抽出ルール ━━━
1. 本文に書かれていない情報は null
2. 推測や補完はしない
3. kinship_records は本文に出てくる全ての実績を取りこぼさず抽出すること
   例: 「174ミリ筆頭・170ミリup 6頭・168ミリup 3頭」なら3件全部
4. raw_text には本文をそのまま転記 (販売者情報は除く)
5. JSON のみを返す (マークダウン装飾なし)

━━━ kinship_records の例 ━━━
- 「174ミリ筆頭」 → {"metric":"body_size", "threshold":174, "count":1, "unit":"mm", "is_top":true}
- 「170ミリup 6頭」 → {"metric":"body_size", "threshold":170, "count":6, "unit":"mm"}
- 「165ミリupは数えていません」 → {"metric":"body_size", "threshold":165, "count":null, "unit":"mm", "note":"数えていない"}
- 「前蛹150g up 筆頭」 → {"metric":"pre_pupa_weight", "threshold":150, "count":1, "unit":"g", "is_top":true}
- 「140g台複数」 → {"metric":"pre_pupa_weight", "threshold":140, "count":null, "unit":"g", "note":"複数"}
- 「胸角121ミリ」 → {"metric":"thorax_horn", "threshold":121, "count":1, "unit":"mm", "note":"種親♂"}

metric: "body_size" | "pre_pupa_weight" | "larva_weight" | "thorax_horn" | "head_horn"

━━━ 出力フォーマット (純JSON) ━━━
{
  "species_full":    "...",
  "common_name":     "...",
  "origin":          "...",
  "generation":      "...",
  "eclosion_period": "...",
  "body_size_mm":    79,
  "paternal_blood":  "...",
  "maternal_blood":  "...",
  "kinship_records": [...],
  "feature_notes":   "...",
  "raw_text":        "..."
}`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      species_full:    { type: 'STRING', nullable: true },
      common_name:     { type: 'STRING', nullable: true },
      origin:          { type: 'STRING', nullable: true },
      generation:      { type: 'STRING', nullable: true },
      eclosion_period: { type: 'STRING', nullable: true },
      body_size_mm:    { type: 'NUMBER', nullable: true },
      paternal_blood:  { type: 'STRING', nullable: true },
      maternal_blood:  { type: 'STRING', nullable: true },
      feature_notes:   { type: 'STRING', nullable: true },
      raw_text:        { type: 'STRING', nullable: true },
      kinship_records: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            metric:    { type: 'STRING' },
            threshold: { type: 'NUMBER' },
            count:     { type: 'NUMBER', nullable: true },
            unit:      { type: 'STRING', nullable: true },
            is_top:    { type: 'BOOLEAN', nullable: true },
            note:      { type: 'STRING', nullable: true },
          },
        },
      },
    },
  };

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }],
    }],
    generationConfig: {
      temperature:      0.3,    // テキスト処理は低温度で確実に
      maxOutputTokens:  8192,
      topP:             0.85,
      responseMimeType: 'application/json',
      responseSchema:   responseSchema,
    },
  };

  const ctrl = new AbortController();
  const tid  = setTimeout(function () { ctrl.abort(); }, 60000);

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) {
      const errText = await res.text().catch(function () { return ''; });
      throw new Error('Gemini API ' + res.status + ': ' + errText.slice(0, 200));
    }
    const json = await res.json();
    const cand = json && json.candidates && json.candidates[0];
    if (!cand) throw new Error('AIからの応答が空です');
    const partText = cand.content && cand.content.parts && cand.content.parts[0]
                  && cand.content.parts[0].text;
    if (!partText) throw new Error('AIからのテキスト応答が空です');
    let parsed;
    try { parsed = JSON.parse(partText); }
    catch (e) {
      // マークダウンを剥がしてリトライ
      const stripped = partText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
      parsed = JSON.parse(stripped);
    }
    // サニタイズして返す
    return _pbeSanitizeBloodlineData(parsed);
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

// 編集モーダルから保存
Pages._pbeSaveEditor = async function () {
  const ctx = window.__pbeCurrentEdit || {};
  const parId = ctx.parId;
  // 入力値を回収
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  const bld = {
    common_name:     val('pbe-ed-common_name')     || null,
    species_full:    val('pbe-ed-species_full')    || null,
    origin:          val('pbe-ed-origin')          || null,
    generation:      val('pbe-ed-generation')      || null,
    eclosion_period: val('pbe-ed-eclosion_period') || null,
    body_size_mm:    (function(){ const v = val('pbe-ed-body_size_mm'); const n = parseFloat(v); return isNaN(n) ? null : n; })(),
    paternal_blood:  val('pbe-ed-paternal_blood')  || null,
    maternal_blood:  val('pbe-ed-maternal_blood')  || null,
    feature_notes:   val('pbe-ed-feature_notes')   || null,
    raw_text:        val('pbe-ed-raw_text')        || null,
    kinship_records: [],
  };
  // 同腹兄弟実績を回収
  const rows = document.querySelectorAll('.pbe-kin-row');
  rows.forEach(function (row) {
    const metric    = (row.querySelector('.pbe-kin-metric')    || {}).value || 'body_size';
    const threshold = parseFloat((row.querySelector('.pbe-kin-threshold') || {}).value);
    const countRaw  = (row.querySelector('.pbe-kin-count')     || {}).value || '';
    if (isNaN(threshold)) return;
    const countNum = parseInt(countRaw, 10);
    const isCount = !isNaN(countNum);
    bld.kinship_records.push({
      metric:    metric,
      threshold: threshold,
      count:     isCount ? countNum : null,
      unit:      (PBE_KINSHIP_METRICS[metric] && PBE_KINSHIP_METRICS[metric].unit) || '',
      is_top:    false,
      note:      isCount ? '' : countRaw,
    });
  });

  // [y6.2] 全スクショを source_screenshots に追加
  // [y6.11] Drive にもアップロード
  const imagesArr = ctx.processedImages || [];
  const newShots = imagesArr.map(function (img) {
    return {
      id:                 _pbeUid('shot'),
      uploaded_at:        _pbeNowIso(),
      image_data_url:     img.image_data_url,
      thumbnail_data_url: img.thumbnail_data_url,
      extraction_status:  'done',
      extracted_at:       _pbeNowIso(),
    };
  });

  // 既存レコードに統合
  if (parId) {
    const par = _pbeGetParent(parId);
    const existingShots = (par && par.source_screenshots) || [];

    // [y6.11] Drive に新スクショを並列アップロード
    if (newShots.length > 0) {
      UI.toast('スクショを Drive にアップロード中... (' + newShots.length + '枚)', 'info');
      const uploadResults = await Promise.allSettled(newShots.map(function (shot, idx) {
        return _pbeUploadScreenshotToDrive(parId, imagesArr[idx], shot.id);
      }));
      uploadResults.forEach(function (r, idx) {
        if (r.status === 'fulfilled' && r.value) {
          newShots[idx].drive_file_id  = r.value.drive_file_id;
          newShots[idx].drive_view_url = r.value.drive_view_url;
          newShots[idx].drive_file_url = r.value.drive_file_url;
          newShots[idx].filename       = r.value.filename;
        } else {
          console.warn('[PBE] Drive upload failed for shot #' + (idx + 1),
                       r.reason && r.reason.message);
          // Drive アップロード失敗してもローカルには保存される
        }
      });
      const successCount = uploadResults.filter(function (r) { return r.status === 'fulfilled'; }).length;
      console.log('[PBE] Drive uploads: ' + successCount + '/' + newShots.length + ' 成功');
    }

    const patch = {
      bloodline_data:        bld,
      bloodline_updated_at:  _pbeNowIso(),
      source_screenshots:    newShots.length ? existingShots.concat(newShots) : existingShots,
    };
    await _pbePatchParent(parId, patch);
    UI.toast(newShots.length > 1
      ? newShots.length + '枚のスクショと血統情報を保存しました ✅'
      : '血統情報を保存しました ✅', 'success');
  } else {
    // parId 無し (新規登録時) - フォームに反映するだけ
    UI.toast('抽出結果をフォームに反映しました ✅', 'success');
  }

  // フォームに既存値を上書き反映 (parent_v2.js のフォームに値を流し込む)
  _pbeFillForm(bld);

  UI.closeModal();

  // コールバック呼び出し
  if (window.__pbeOnDone) {
    try { window.__pbeOnDone(bld); } catch (_) {}
  }
};

// parent_v2.js のフォームに抽出値を反映
function _pbeFillForm(bld) {
  if (!bld) return;
  function setIf(name, value) {
    const el = document.querySelector('[name="' + name + '"]');
    if (el && value != null && value !== '') {
      // 既存値が空のときのみ上書き (ユーザー入力を尊重)
      if (!el.value || el.value === '') el.value = String(value);
    }
  }
  // 産地・累代・血統原文・サイズ をフォームに反映
  setIf('locality',     bld.origin);
  setIf('generation',   bld.generation);
  setIf('paternal_raw', bld.paternal_blood);
  setIf('maternal_raw', bld.maternal_blood);
  setIf('size_mm',      bld.body_size_mm);
  // 羽化期 (eclosion_period) は parent フォームの eclosion_date と粒度が違うので
  // 月旬表記の場合は反映しない (誤入力防止)
  if (bld.eclosion_period && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(bld.eclosion_period)) {
    setIf('eclosion_date', bld.eclosion_period.replace(/\//g, '-'));
  }
}

// ════════════════════════════════════════════════════════════════
// 系統評価カードを生成 (種親詳細画面・ライン詳細画面で使う)
// ════════════════════════════════════════════════════════════════
function _pbeRenderBloodlineCard(par) {
  if (!par || !par.bloodline_data) return '';
  const b = par.bloodline_data;
  // 同腹兄弟実績を表示形式に整形
  const kinshipHtml = _pbeFormatKinshipDisplay(b.kinship_records || []);

  // [20260429z1] 系統評価カードから基本情報・血統親情報と重複する項目を削除:
  //   旧: 種/学名/産地/累代/羽化期/体長/♂血統/♀血統 を表示していたが、
  //       これらはすべて「基本情報」「血統・親情報」セクションに既にあり重複していた。
  //   新: 系統評価カードでは feature_notes (血統的特徴) と
  //       kinship_records (同腹兄弟・系統実績) のみ表示する。
  const detailRows = '';

  const featureBlock = b.feature_notes
    ? '<div style="margin-top:8px;padding:8px 10px;background:rgba(200,168,75,.08);border-left:3px solid var(--gold);border-radius:4px;font-size:.82rem;line-height:1.55">'
      + '🌟 ' + _pbeEsc(b.feature_notes) + '</div>'
    : '';

  // [20260429z3] サムネール表示の堅牢化 (Drive 直アクセス問題の根本対策):
  //   ・Google が 2024年8月に `drive.google.com/uc?id=...` 形式の直接画像
  //     アクセスを廃止したため、PCでログイン済の Drive セッションがない
  //     スマホからは Drive 直リンクで画像が取得できなくなった。
  //   ・代替として `lh3.googleusercontent.com/d/{fileId}=w300` 形式の
  //     Google 公式 CDN URL に変換して使う。これは認証不要で
  //     サードパーティサイトからも `<img src>` で取得できる。
  //   ・既存の9枚分は Sheets に古い形式の URL が保存されているが、
  //     フロント側でこの変換を毎回挟むので再アップロード不要。
  //   ・新規アップロードは GAS 側で新形式を返すよう同時に修正済み。
  //
  //   その他の堅牢化 (z1):
  //   ・クラウドから取得した最新データには thumbnail_data_url が含まれない
  //     (Sheets セル容量制限のため stripping されている)。
  //   ・端末ローカルで保存された thumbnail_data_url は古い枚数のみ持つ。
  //   ・どちらもなければ番号付きプレースホルダで枚数だけは反映する。
  const allShots = par.source_screenshots || [];
  // [z4] サムネ表示時に各スクショの URL 状態を一括診断 (原因特定用ログ)
  let _missingUrlCount = 0;
  if (allShots.length && !window.__pbeShotsDiagLogged) {
    console.group('[PBE] サムネ URL 診断 par_id=' + par.par_id + ' (' + allShots.length + '枚)');
    allShots.forEach(function (s, i) {
      const hasThumb = !!s.thumbnail_data_url;
      const hasDriveView = !!s.drive_view_url;
      const hasDriveFile = !!s.drive_file_url;
      const hasDriveId = !!s.drive_file_id;
      const normalized = _pbeNormalizeDriveImageUrl(s.drive_view_url || s.drive_file_url || '', s.drive_file_id);
      console.log('#' + (i + 1) + ':', {
        thumbnail_data_url: hasThumb ? 'あり' : 'なし',
        drive_view_url:     s.drive_view_url || '(null)',
        drive_file_url:     s.drive_file_url || '(null)',
        drive_file_id:      s.drive_file_id || '(null)',
        normalized:         normalized || '(空)',
        '最終imgSrc':       s.thumbnail_data_url ? 'thumbnail (base64)'
                          : normalized          ? 'normalized'
                          : '(なし→#プレースホルダ)',
      });
      if (!s.thumbnail_data_url && !normalized) _missingUrlCount++;
    });
    console.groupEnd();
    window.__pbeShotsDiagLogged = true;
    setTimeout(function () { window.__pbeShotsDiagLogged = false; }, 5000);
  } else {
    // ログ出力スキップ時も _missingUrlCount は計算する
    allShots.forEach(function (s) {
      const normalized = _pbeNormalizeDriveImageUrl(s.drive_view_url || s.drive_file_url || '', s.drive_file_id);
      if (!s.thumbnail_data_url && !normalized) _missingUrlCount++;
    });
  }

  const shotsThumbs = allShots.map(function (s, idx) {
    // Drive URL → 公式CDN URL に変換 (古い uc?id=... 形式の救済)
    const driveImg = _pbeNormalizeDriveImageUrl(s.drive_view_url || s.drive_file_url || '', s.drive_file_id);
    const imgSrc = s.thumbnail_data_url || driveImg;
    const onclick = 'Pages._pbeViewScreenshot(\'' + _pbeEsc(par.par_id) + '\',\'' + _pbeEsc(s.id) + '\')';
    if (imgSrc) {
      // [z3] referrerpolicy は image_data_url(base64) には不要、
      //   googleusercontent.com には付けても大丈夫なので一律付与で問題なし。
      return '<img src="' + imgSrc + '" '
        + 'referrerpolicy="no-referrer" '
        + 'loading="lazy" '
        + 'style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid var(--surface3);cursor:pointer;background:var(--surface3)" '
        + 'onerror="this.style.display=&quot;none&quot;;this.nextElementSibling&&(this.nextElementSibling.style.display=&quot;inline-flex&quot;)" '
        + 'onclick="' + onclick + '">'
        + '<span style="display:none;width:48px;height:48px;border-radius:4px;border:1px solid var(--surface3);cursor:pointer;background:var(--surface3);align-items:center;justify-content:center;font-size:1.1rem" '
        + 'onclick="' + onclick + '" title="画像読み込み失敗">📷</span>';
    }
    return '<span style="display:inline-flex;width:48px;height:48px;border-radius:4px;border:1px dashed var(--surface3);background:var(--surface2);align-items:center;justify-content:center;font-size:.7rem;color:var(--text3);cursor:pointer" '
      + 'onclick="' + onclick + '" title="メタのみ・画像なし">#' + (idx + 1) + '</span>';
  }).join('');
  // 枚数表示 (デバッグ性向上)
  const shotsCountLabel = allShots.length
    ? '<div style="font-size:.72rem;color:var(--text3);margin-top:6px">スクショ ' + allShots.length + ' 枚'
      + (_missingUrlCount > 0 ? ' <span style="color:var(--amber)">(' + _missingUrlCount + '枚は画像URLなし)</span>' : '')
      + '</div>'
    : '';
  // [z4] 画像URL が無いスクショがある場合は修復案内を表示
  const repairBlock = _missingUrlCount > 0
    ? '<div style="margin-top:8px;padding:8px 10px;background:rgba(230,150,0,.08);border:1px solid rgba(230,150,0,.3);border-radius:6px;font-size:.74rem;line-height:1.5;color:var(--text2)">'
      + '<div style="font-weight:700;color:var(--amber);margin-bottom:4px">⚠️ 画像が表示できないスクショが ' + _missingUrlCount + ' 枚あります</div>'
      + '<div style="margin-bottom:6px">アップロード時にDriveへの保存に失敗した可能性があります。<br>'
      + '一度削除して、PCから再アップロードすると確実に表示されるようになります。</div>'
      + '<button class="btn btn-ghost btn-sm" style="font-size:.74rem;padding:4px 10px;color:var(--red);border-color:var(--red)" '
      + '        onclick="Pages._pbeRemoveBrokenShots(\'' + _pbeEsc(par.par_id) + '\')">'
      + '🗑 画像URLなしのスクショを一括削除</button>'
      + '</div>'
    : '';

  return '<div class="card" style="background:linear-gradient(135deg,rgba(200,168,75,.04),rgba(200,168,75,.01));border:1px solid rgba(200,168,75,.25)">'
    + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">'
    + '  <span style="font-size:1.05rem;color:var(--gold);font-weight:700">📜 系統評価</span>'
    + '</div>'
    + detailRows
    + featureBlock
    + (kinshipHtml ? '<div style="margin-top:10px"><div style="font-size:.78rem;font-weight:700;color:var(--text2);margin-bottom:4px">同腹兄弟・系統実績</div>' + kinshipHtml + '</div>' : '')
    + (shotsThumbs ? '<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">' + shotsThumbs + '</div>' : '')
    + shotsCountLabel
    + repairBlock
    + '<div style="display:flex;gap:6px;margin-top:10px">'
    + '  <button class="btn btn-ghost btn-sm" style="flex:1;font-size:.78rem" '
    + '          onclick="Pages._pbeOpenExtractor(\'' + _pbeEsc(par.par_id) + '\')">📷 スクショ追加</button>'
    + '  <button class="btn btn-ghost btn-sm" style="flex:1;font-size:.78rem" '
    + '          onclick="Pages._pbeReopenEditor(\'' + _pbeEsc(par.par_id) + '\')">✏️ 編集</button>'
    + '  <button class="btn btn-ghost btn-sm" style="flex:1;font-size:.78rem" '
    + '          onclick="Pages._pbeExportCsv(\'' + _pbeEsc(par.par_id) + '\')">💾 CSV</button>'
    + '</div>'
    + '</div>';
}

function _pbeFormatKinshipDisplay(records) {
  if (!records || !records.length) return '';
  // metric ごとにグルーピング
  const groups = {};
  records.forEach(function (r) {
    if (!groups[r.metric]) groups[r.metric] = [];
    groups[r.metric].push(r);
  });
  // 大きい順に
  Object.keys(groups).forEach(function (k) {
    groups[k].sort(function (a, b) { return b.threshold - a.threshold; });
  });
  return Object.keys(groups).map(function (metric) {
    const def = PBE_KINSHIP_METRICS[metric] || { label: metric, unit: '' };
    const items = groups[metric].map(function (r) {
      const head  = r.is_top ? '<span style="color:var(--gold);font-weight:700">★筆頭</span> ' : '';
      const cnt   = r.count != null ? (r.count + '頭') : (r.note || '—');
      return '<li style="font-size:.82rem;line-height:1.6;margin-left:1.2em">'
        + head + r.threshold + def.unit + ' up: <b>' + _pbeEsc(cnt) + '</b></li>';
    }).join('');
    return '<div style="margin-bottom:6px">'
      + '<div style="font-size:.74rem;color:var(--text3);font-weight:600">' + def.label + '</div>'
      + '<ul style="list-style:disc;padding-left:0;margin:2px 0">' + items + '</ul>'
      + '</div>';
  }).join('');
}

// 既存データの再編集
Pages._pbeReopenEditor = function (parId) {
  const par = _pbeGetParent(parId);
  if (!par) { UI.toast('種親が見つかりません', 'error'); return; }
  _pbeOpenEditor(parId, par.bloodline_data || {}, null);
};

// スクショ閲覧
Pages._pbeViewScreenshot = function (parId, shotId) {
  const par = _pbeGetParent(parId);
  if (!par) return;
  const shot = (par.source_screenshots || []).find(function (s) { return s.id === shotId; });
  if (!shot) return;
  // [20260429z3] image_data_url 優先 (端末ローカル) → 無ければ Drive URL を正規化して使用
  //   (古い uc?id=... 形式は表示できないので、新CDN形式に変換)
  const driveImg = _pbeNormalizeDriveFullUrl(shot.drive_view_url || shot.drive_file_url || '', shot.drive_file_id);
  const imgSrc = shot.image_data_url || driveImg || shot.thumbnail_data_url || '';
  const driveLink = shot.drive_file_url
    ? '<a href="' + shot.drive_file_url + '" target="_blank" '
      + 'style="font-size:.72rem;color:var(--accent);text-decoration:underline;margin-left:8px">'
      + '📁 Driveで開く</a>'
    : '';
  const html = '<div class="modal-title">📷 スクリーンショット</div>'
    + '<div style="text-align:center;padding:8px">'
    + '  <img src="' + imgSrc + '" referrerpolicy="no-referrer" style="max-width:100%;max-height:70vh;border-radius:6px">'
    + '  <div style="font-size:.74rem;color:var(--text3);margin-top:6px">'
    + '    アップロード: ' + _pbeEsc(shot.uploaded_at) + driveLink
    + '  </div>'
    + '</div>'
    + '<div class="modal-footer">'
    + '  <button class="btn btn-ghost" style="flex:1"'
    + '          onclick="Pages._pbeDeleteScreenshot(\'' + _pbeEsc(parId) + '\',\'' + _pbeEsc(shotId) + '\')">🗑 削除</button>'
    + '  <button class="btn btn-primary" style="flex:2" onclick="UI.closeModal()">閉じる</button>'
    + '</div>';
  UI.modal(html);
};

Pages._pbeDeleteScreenshot = async function (parId, shotId) {
  if (!confirm('このスクリーンショットを削除しますか？')) return;
  const par = _pbeGetParent(parId);
  if (!par) return;
  const next = (par.source_screenshots || []).filter(function (s) { return s.id !== shotId; });
  await _pbePatchParent(parId, { source_screenshots: next });
  UI.closeModal();
  UI.toast('削除しました', 'success');
  // 再描画
  if (window.__currentRoute === 'parent-detail') {
    Pages.parentDetail(parId);
  }
};

// [20260429z4] 画像URLが無いスクショ (Drive アップロード失敗で thumbnail も Drive URL も持たないもの)
//   を一括で削除する。削除後は再アップロードを促す。
Pages._pbeRemoveBrokenShots = async function (parId) {
  const par = _pbeGetParent(parId);
  if (!par) return;
  const allShots = par.source_screenshots || [];
  const broken = allShots.filter(function (s) {
    const normalized = _pbeNormalizeDriveImageUrl(s.drive_view_url || s.drive_file_url || '', s.drive_file_id);
    return !s.thumbnail_data_url && !normalized;
  });
  if (!broken.length) {
    UI.toast('削除対象のスクショはありません', 'info');
    return;
  }
  if (!confirm('画像URLが無いスクショ ' + broken.length + ' 枚を削除しますか?\n'
    + '削除後は「📷 スクショ追加」から PC で再アップロードしてください。')) return;

  const next = allShots.filter(function (s) {
    const normalized = _pbeNormalizeDriveImageUrl(s.drive_view_url || s.drive_file_url || '', s.drive_file_id);
    return !!(s.thumbnail_data_url || normalized);
  });
  try {
    UI.loading(true);
    await _pbePatchParent(parId, { source_screenshots: next });
    UI.toast(broken.length + ' 枚削除しました。再アップロードしてください。', 'success');
    // 再描画
    if (window.__currentRoute === 'parent-detail') {
      Pages.parentDetail(parId);
    }
  } catch (e) {
    UI.toast('削除失敗: ' + e.message, 'error');
  } finally {
    UI.loading(false);
  }
};

// CSV エクスポート (1種親分)
Pages._pbeExportCsv = function (parId) {
  const par = _pbeGetParent(parId);
  if (!par || !par.bloodline_data) {
    UI.toast('抽出データがありません', 'error');
    return;
  }
  const b = par.bloodline_data;
  const rows = [
    ['parent_id',    par.par_id || ''],
    ['display_name', par.display_name || ''],
    ['sex',          par.sex || ''],
    ['common_name',  b.common_name || ''],
    ['species_full', b.species_full || ''],
    ['origin',       b.origin || ''],
    ['generation',   b.generation || ''],
    ['eclosion_period', b.eclosion_period || ''],
    ['body_size_mm',    b.body_size_mm || ''],
    ['paternal_blood',  b.paternal_blood || ''],
    ['maternal_blood',  b.maternal_blood || ''],
    ['feature_notes',   b.feature_notes || ''],
  ];
  // 同腹兄弟実績
  (b.kinship_records || []).forEach(function (r, i) {
    const def = PBE_KINSHIP_METRICS[r.metric] || { label: r.metric };
    rows.push([
      'kinship_' + (i+1) + '_metric',  def.label,
    ]);
    rows.push([
      'kinship_' + (i+1) + '_value',
      r.threshold + (r.unit || '') + ' up : ' + (r.count != null ? r.count + '頭' : (r.note || '—')) + (r.is_top ? ' (★筆頭)' : ''),
    ]);
  });
  // CSV形式
  function csvEsc(v) {
    const s = String(v == null ? '' : v);
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const csv = '\ufeff' + rows.map(function (r) { return csvEsc(r[0]) + ',' + csvEsc(r[1]); }).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bloodline_' + (par.parent_display_id || par.par_id) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  UI.toast('CSVをダウンロードしました', 'success');
};

// ════════════════════════════════════════════════════════════════
// グローバル公開
// ════════════════════════════════════════════════════════════════
// 内部関数を Pages 経由で呼べるように
window.Pages = window.Pages || {};
Pages._pbeRenderBloodlineCard = _pbeRenderBloodlineCard;

// ════════════════════════════════════════════════════════════════
// [y6.6] Store.parents に PBE データを自動マージするフック
//   syncAll で parents が GAS から再取得されても、その直後に PBE レイヤーの
//   bloodline_data / source_screenshots を自動で各 parent オブジェクトに注入する。
// [y6.11] クラウド同期対応:
//   GAS から取得した parents の bloodline_data_json / source_screenshots_json
//   を JSON.parse して bloodline_data / source_screenshots に展開する。
//   さらにその結果を localStorage にキャッシュ(オフライン用)。
// [y6.16] 🔥 根本対策:
//   ・Store の syncAll が完了する前に _pbeMergeIntoStore が走るタイミング問題で
//     Store.parents が空のまま空回りすることがあった。
//   ・対策として、Store.parents を全件ループする際、
//     ①parent 自身が bloodline_data_json を持っていればパース展開
//     ②localStorage の pbeStore キャッシュに該当 par_id があれば必ず補完
//     ③①も②もない場合のみスキップ
//     という3段階に整理した。
//   ・さらに、Store.parents に該当 par_id が「存在しない」ケースでも、
//     localStorage キャッシュには情報があるので、cloudFetch でクラウドから
//     GAS の最新 parents を取り込んで Store に setDB する救済ルートも追加。
// ════════════════════════════════════════════════════════════════
async function _pbeMergeIntoStoreWithCloudFallback() {
  // [y6.16] 通常マージを試行
  const ok1 = _pbeMergeIntoStore();
  if (!window.Store || typeof Store.getDB !== 'function') return ok1;
  const parents = Store.getDB('parents') || [];

  // [y6.17] 🔥 Store.parents が完全に空のケースを最優先で救済
  //   診断レポートで「Store.parents 件数: 0」が判明したケース。
  //   getAllData が parents を返していないか、setDB が呼ばれていない状態。
  //   PBE 自身が getParents を呼んで Store.parents を構築する。
  if (parents.length === 0) {
    console.log('[PBE] 🚨 Store.parents が空 → GAS getParents を直接呼んで構築します');
    try {
      const data = await _pbeCallGAS('getParents', {});
      if (data && Array.isArray(data.parents) && data.parents.length) {
        // setDB を呼ぶ前に bloodline_data を展開しておく
        //   (setDB のラップが既にあればそこでも展開されるが、念のため二重展開)
        const pbeStore = _pbeLoadStore();
        data.parents.forEach(function (par) {
          if (!par) return;
          if (par.bloodline_data_json && !par.bloodline_data) {
            try { par.bloodline_data = JSON.parse(par.bloodline_data_json); }
            catch (e) {}
          }
          if (par.source_screenshots_json && !par.source_screenshots) {
            try { par.source_screenshots = JSON.parse(par.source_screenshots_json); }
            catch (e) {}
          }
          // localStorage キャッシュからの補完
          const rec = par.par_id ? pbeStore[par.par_id] : null;
          if (rec) {
            if (rec.bloodline_data && !par.bloodline_data) par.bloodline_data = rec.bloodline_data;
            if (rec.source_screenshots && !par.source_screenshots) par.source_screenshots = rec.source_screenshots;
          }
        });
        Store.setDB('parents', data.parents);
        console.log('[PBE] ✅ Store.parents を GAS から構築完了 件数=' + data.parents.length);
        return _pbeMergeIntoStore();
      }
    } catch (e) {
      console.warn('[PBE] 🚨 getParents direct fetch failed:', e);
    }
    return ok1;
  }

  // 「localStorage キャッシュに bloodline_data はあるが Store.parents の対応 par が
  //  bloodline_data を持っていない」状態を検出
  const pbeStore = _pbeLoadStore();
  const cachedIds = Object.keys(pbeStore || {});
  let needsFallback = false;
  cachedIds.forEach(function (pid) {
    const par = parents.find(p => p.par_id === pid);
    if (par && !par.bloodline_data && pbeStore[pid] && pbeStore[pid].bloodline_data) {
      // パッチ可能なケース → 通常マージで処理されているはずなので何もしない
    } else if (!par && pbeStore[pid] && pbeStore[pid].bloodline_data) {
      // 🔥 Store.parents 自体に存在しないケース
      needsFallback = true;
    }
  });
  if (needsFallback) {
    console.log('[PBE] Store.parents に該当 par_id がないので GAS から再取得します');
    try {
      const data = await _pbeCallGAS('getParents', {});
      if (data && Array.isArray(data.parents)) {
        // 既存 Store と新規取得をマージ (par_id 一意化)
        const map = new Map();
        parents.forEach(p => p.par_id && map.set(p.par_id, p));
        data.parents.forEach(p => p.par_id && map.set(p.par_id, p));
        const merged = Array.from(map.values());
        Store.setDB('parents', merged);
        console.log('[PBE] Store.parents を GAS から再取得して再構築 件数=' + merged.length);
        // もう一度マージを実行して bloodline_data 展開
        return _pbeMergeIntoStore();
      }
    } catch (e) {
      console.warn('[PBE] cloud fallback failed:', e);
    }
  }
  return ok1;
}

function _pbeMergeIntoStore() {
  if (!window.Store || typeof Store.getDB !== 'function') return false;
  const parents = Store.getDB('parents');
  if (!Array.isArray(parents) || !parents.length) return false;
  const pbeStore = _pbeLoadStore();
  let modified = false;
  let anyCloudUpdate = false;  // [y6.11.1] 全 parent を通じて1つでもクラウド更新があったか

  parents.forEach(function (par) {
    // [y6.11.1] クリティカル修正: cloudUpdated は parent ごとにローカル変数にする
    //   forEach 外で let cloudUpdated = false 宣言していたため、1つでもクラウドデータが
    //   見つかると以降全 parent で true のままになり、空データで localStorage を上書きしていた。
    let cloudUpdated = false;

    // [y6.11] クラウドデータの展開 (GAS から来た bloodline_data_json をパース)
    if (par.bloodline_data_json && !par.bloodline_data) {
      try {
        par.bloodline_data = JSON.parse(par.bloodline_data_json);
        modified = true;
        cloudUpdated = true;
      } catch (e) {
        console.warn('[PBE] bloodline_data_json parse failed for', par.par_id, e);
      }
    }
    // [y6.11] source_screenshots_json をパース (画像本体は Drive URL から取得)
    if (par.source_screenshots_json && !par.source_screenshots) {
      try {
        par.source_screenshots = JSON.parse(par.source_screenshots_json);
        modified = true;
        cloudUpdated = true;
      } catch (e) {
        console.warn('[PBE] source_screenshots_json parse failed for', par.par_id, e);
      }
    }

    // [y6.11] クラウドから取得したデータを localStorage にもキャッシュ
    if (cloudUpdated && par.par_id && (par.bloodline_data || par.source_screenshots)) {
      const existing = pbeStore[par.par_id];
      const existingTs = existing && existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const cloudTs    = par.bloodline_updated_at ? new Date(par.bloodline_updated_at).getTime() : 0;
      if (!existing || cloudTs >= existingTs) {
        pbeStore[par.par_id] = {
          bloodline_data:     par.bloodline_data,
          source_screenshots: par.source_screenshots,
          updated_at:         par.bloodline_updated_at || _pbeNowIso(),
        };
        anyCloudUpdate = true;
      } else {
        console.log('[PBE] localStorage は新しいので上書きスキップ:', par.par_id);
      }
    }

    // [y6.6] localStorage 側にデータがあって parent にまだセットされていない場合は補完
    //   (オフライン環境やクラウド同期失敗時のバックアップ層)
    const rec = pbeStore[par.par_id];
    if (rec) {
      if (rec.bloodline_data !== undefined && par.bloodline_data === undefined) {
        par.bloodline_data = rec.bloodline_data;
        modified = true;
      }
      if (rec.source_screenshots !== undefined && par.source_screenshots === undefined) {
        par.source_screenshots = rec.source_screenshots;
        modified = true;
      }
      if (rec.updated_at && !par.bloodline_updated_at) {
        par.bloodline_updated_at = rec.updated_at;
        modified = true;
      }
    }
  });
  // [y6.11.1] クラウドから新しいデータを取得した場合、localStorage キャッシュに永続化
  if (anyCloudUpdate) {
    _pbeSaveStore(pbeStore);
    console.log('[PBE] cloud data cached to localStorage');
  }
  return modified;
}

// 起動直後と、Store 更新通知 (db_parents イベント) を購読してマージ
(function () {
  // 起動時: Store がまだ初期化されていない可能性があるので少し待つ
  setTimeout(_pbeMergeIntoStore,  300);
  setTimeout(_pbeMergeIntoStore, 1500);
  setTimeout(_pbeMergeIntoStore, 3500);
  // Store の購読 (Store.on イベントで購読)
  if (window.Store && typeof Store.on === 'function') {
    try {
      Store.on('db_parents', _pbeMergeIntoStore);
    } catch (e) { console.warn('[PBE] Store.on failed', e); }
  }

  // [y6.17] 起動時に既存 Store.parents を強制再パース
  //   setDB ラップが間に合わず、すでに parents が入った状態で y6.17 が
  //   ロードされた場合の救済として、500ms / 2秒 / 5秒のタイミングで
  //   既存配列を直接走査して bloodline_data_json を展開する。
  function _pbeForceReparseExistingParents() {
    if (!window.Store || typeof Store.getDB !== 'function') return;
    const parents = Store.getDB('parents');
    if (!Array.isArray(parents) || !parents.length) return;
    const pbeStore = _pbeLoadStore();
    let n = 0, m = 0;
    parents.forEach(function (par) {
      if (!par) return;
      if (par.bloodline_data_json && !par.bloodline_data) {
        try {
          par.bloodline_data = JSON.parse(par.bloodline_data_json);
          n++;
        } catch (e) {}
      }
      if (par.source_screenshots_json && !par.source_screenshots) {
        try { par.source_screenshots = JSON.parse(par.source_screenshots_json); }
        catch (e) {}
      }
      const rec = par.par_id ? pbeStore[par.par_id] : null;
      if (rec) {
        if (rec.bloodline_data && !par.bloodline_data) {
          par.bloodline_data = rec.bloodline_data;
          m++;
        }
        if (rec.source_screenshots && !par.source_screenshots) {
          par.source_screenshots = rec.source_screenshots;
        }
      }
    });
    if (n > 0 || m > 0) {
      console.log('[PBE-force] 既存 Store.parents を再展開: JSON ' + n + '件 / localStorage ' + m + '件');
      // Store の購読者に再描画させるため _notify を起こすには setDB の再呼び出しが必要だが
      // 同じ参照を渡すと無限ループの恐れがあるため、_notify だけを直接呼ぶ
      if (Store._notify) {
        try { Store._notify('db_parents'); } catch (e) {}
      }
    }
  }
  setTimeout(_pbeForceReparseExistingParents,  500);
  setTimeout(_pbeForceReparseExistingParents, 2000);
  setTimeout(_pbeForceReparseExistingParents, 5000);

  // [y6.17] 🔥 起動時に Store.parents が空なら GAS 直叩きで構築
  //   診断で「Store.parents 件数: 0」が判明したケースの救済。
  //   syncAll が走っていないか、走っても parents が空で返ってきている場合の保険。
  async function _pbeBootstrapIfEmpty() {
    if (!window.Store || typeof Store.getDB !== 'function') return;
    const parents = Store.getDB('parents');
    if (Array.isArray(parents) && parents.length > 0) return;  // 既に入っているのでスキップ
    console.log('[PBE-bootstrap] Store.parents が空のため GAS getParents を呼び出します');
    try {
      const data = await _pbeCallGAS('getParents', {});
      if (data && Array.isArray(data.parents) && data.parents.length) {
        const pbeStore = _pbeLoadStore();
        data.parents.forEach(function (par) {
          if (!par) return;
          if (par.bloodline_data_json && !par.bloodline_data) {
            try { par.bloodline_data = JSON.parse(par.bloodline_data_json); }
            catch (e) {}
          }
          if (par.source_screenshots_json && !par.source_screenshots) {
            try { par.source_screenshots = JSON.parse(par.source_screenshots_json); }
            catch (e) {}
          }
          const rec = par.par_id ? pbeStore[par.par_id] : null;
          if (rec) {
            if (rec.bloodline_data && !par.bloodline_data) par.bloodline_data = rec.bloodline_data;
            if (rec.source_screenshots && !par.source_screenshots) par.source_screenshots = rec.source_screenshots;
          }
        });
        Store.setDB('parents', data.parents);
        console.log('[PBE-bootstrap] ✅ Store.parents 構築完了 件数=' + data.parents.length);
      }
    } catch (e) {
      console.warn('[PBE-bootstrap] 失敗:', e);
    }
  }
  setTimeout(_pbeBootstrapIfEmpty, 1000);
  setTimeout(_pbeBootstrapIfEmpty, 3000);
  setTimeout(_pbeBootstrapIfEmpty, 6000);
})();

// ════════════════════════════════════════════════════════════════
// [y6.17] 🔥 Store.setDB を強制ラップ (究極の根本対策)
//   背景:
//     ・y6.16 で Pages.parentDetail をラップしたが、画面側の描画タイミングと
//       マージ完了のタイミングが噛み合わず、画面に反映されないケースが残った。
//     ・Store.setDB('parents', value) が呼ばれたあと _notify('db_parents') が
//       発火し、それを受けて _pbeMergeIntoStore が走る流れだったが、
//       既に画面側 (parent_v2.js) は parents.find() で取得した *古い* オブジェクト
//       参照に対して描画してしまっていて、後からの bloodline_data 注入が
//       表示に反映されない。
//   対策:
//     ・Store.setDB を直接ラップし、value (parents 配列) を Store に入れる
//       *前に* 各要素の bloodline_data_json を JSON.parse して
//       bloodline_data フィールドにセットする。
//     ・また localStorage キャッシュ (pbeStore) からの補完もこの段階で実行。
//     ・これにより setDB 完了時点で _db.parents の中身は既に
//       bloodline_data 展開済みとなり、購読者に通知される時点でも
//       画面に正しく反映される。
//   このフックは setDB のすべての呼び出し経路 (syncAll / patch / 個別更新)
//   をカバーするので、フロントから見て常に bloodline_data が展開された状態になる。
// ════════════════════════════════════════════════════════════════
let _pbeWrappedSetDB = false;
function _pbeWrapStoreSetDB() {
  if (_pbeWrappedSetDB) return;
  if (!window.Store || typeof Store.setDB !== 'function') return;
  const originalSetDB = Store.setDB;
  Store.setDB = function (key, value) {
    // parents をセットしようとしているときだけ介入
    if (key === 'parents' && Array.isArray(value)) {
      try {
        const pbeStore = _pbeLoadStore();
        value.forEach(function (par) {
          if (!par) return;
          // クラウドから来た JSON 文字列を展開
          if (par.bloodline_data_json && !par.bloodline_data) {
            try { par.bloodline_data = JSON.parse(par.bloodline_data_json); }
            catch (e) { console.warn('[PBE-setDB] bloodline_data_json parse failed', par.par_id, e); }
          }
          if (par.source_screenshots_json && !par.source_screenshots) {
            try { par.source_screenshots = JSON.parse(par.source_screenshots_json); }
            catch (e) { console.warn('[PBE-setDB] source_screenshots_json parse failed', par.par_id, e); }
          }
          // localStorage キャッシュからの補完
          //   (GAS が古いデータを返している・getAllData が3列を落としている等
          //    の場合、localStorage の方に正しいデータがあれば使う)
          const rec = par.par_id ? pbeStore[par.par_id] : null;
          if (rec) {
            if (rec.bloodline_data && !par.bloodline_data) {
              par.bloodline_data = rec.bloodline_data;
            }
            if (rec.source_screenshots && !par.source_screenshots) {
              par.source_screenshots = rec.source_screenshots;
            }
            if (rec.updated_at && !par.bloodline_updated_at) {
              par.bloodline_updated_at = rec.updated_at;
            }
          }
        });
        // ログ出力 (どれだけ展開できたか確認用)
        const expanded = value.filter(function (p) { return p && p.bloodline_data; }).length;
        console.log('[PBE-setDB] parents setDB intercepted: 件数=' + value.length + ' / bloodline_data 展開済 ' + expanded + '件');
      } catch (e) {
        console.warn('[PBE-setDB] intercept failed:', e);
      }
    }
    return originalSetDB.call(this, key, value);
  };
  _pbeWrappedSetDB = true;
  console.log('[PBE] Store.setDB wrapped — parents 自動展開フック有効');
}
// 即時ラップ + Store がまだない場合は監視
_pbeWrapStoreSetDB();
const _pbeWrapSetDBInterval = setInterval(function () {
  _pbeWrapStoreSetDB();
  if (_pbeWrappedSetDB) clearInterval(_pbeWrapSetDBInterval);
}, 200);

// ════════════════════════════════════════════════════════════════
// [y6.16] 🔥 Pages.parentDetail を強制ラップ
//   種親詳細画面が呼ばれる**直前に必ず**マージ + クラウドフォールバックを実行する。
//   これにより以下のケースをすべてカバー:
//     ・Store.parents に該当 par_id があり bloodline_data も展開済 (通常)
//     ・Store.parents に該当 par_id はあるが bloodline_data が空 → localStorage から補完
//     ・Store.parents に該当 par_id 自体がない → GAS getParents を直接呼んで Store にセット
//   その後、本来の Pages.parentDetail を呼んで描画。
// ────────────────────────────────────────────────────────────────
//   ※ Pages.parentDetail はまだ未定義の可能性があるので、setInterval で監視して
//     未ラップなら都度ラップする (parent_v2.js が後からロードされるケースに対応)。
// ════════════════════════════════════════════════════════════════
let _pbeWrappedParentDetail = false;
function _pbeWrapParentDetail() {
  if (_pbeWrappedParentDetail) return;
  if (!window.Pages || typeof Pages.parentDetail !== 'function') return;
  const original = Pages.parentDetail;
  Pages.parentDetail = async function (parIdParam) {
    try {
      // [y6.16] 描画直前に必ずマージ + フォールバックを実行
      //   (await は内部で getParents を呼ぶ場合だけ有効・通常はすぐ返る)
      await _pbeMergeIntoStoreWithCloudFallback();
    } catch (e) {
      console.warn('[PBE] pre-parentDetail merge failed:', e);
    }
    return original.call(this, parIdParam);
  };
  _pbeWrappedParentDetail = true;
  console.log('[PBE] Pages.parentDetail wrapped with merge hook');
}
// 即時試行 + 1秒後再試行 + 1秒間隔で監視 (ラップされたら停止)
_pbeWrapParentDetail();
setTimeout(_pbeWrapParentDetail, 1000);
const _pbeWrapInterval = setInterval(function () {
  _pbeWrapParentDetail();
  if (_pbeWrappedParentDetail) clearInterval(_pbeWrapInterval);
}, 1000);

// 外部からも呼べるように公開 (画面再描画前に明示的に呼ぶ用途)
Pages._pbeMergeIntoStore = _pbeMergeIntoStore;
Pages._pbeMergeIntoStoreWithCloudFallback = _pbeMergeIntoStoreWithCloudFallback;

// ════════════════════════════════════════════════════════════════
// [y6.14] 自己診断機能 (PBE Diagnostic)
// ────────────────────────────────────────────────────────────────
// 「保存後に種親詳細画面から血統情報が消える」の原因切り分け用。
// Sheets → GAS → フロント (Store/localStorage) の各レイヤを順に確認し
// レポートを画面表示する。スマホで DevTools が見づらい状況でも、
// ボタン1つで状態を確認できる。
//
// 呼び出し方法:
//   ・Console から: Pages._pbeDiagnose('PAR-02c5yoa')
//   ・グローバルに公開しているので URL バーから javascript: で呼び出しも可能。
//
// チェック項目:
//   1) 現在の build バージョン
//   2) GAS URL と疎通確認 (POST + getParents)
//   3) GAS のレスポンスに bloodline_data_json 列が含まれているか (= GAS デプロイ済か)
//   4) その値が空でないか (= Sheets に保存されているか)
//   5) パース可能か / Store の parents に展開されているか
//   6) localStorage の pbeStore キャッシュ状況
// ════════════════════════════════════════════════════════════════
async function _pbeDiagnose(parId) {
  parId = parId || 'PAR-02c5yoa';
  const lines = [];
  function log(s) { lines.push(s); console.log('[PBE-DIAG]', s); }
  log('═══ PBE 自己診断 ═══');
  log('対象 par_id: ' + parId);
  log('build: 20260429z4');
  log('時刻: ' + new Date().toISOString());
  log('');

  // 1) GAS URL
  const gasUrl = (window.CONFIG && CONFIG.GAS_URL)
              || localStorage.getItem('hcos_gas_url') || '';
  if (!gasUrl) {
    log('❌ GAS URL 未設定');
    return _pbeDiagShow(lines.join('\n'));
  }
  log('✅ GAS URL 設定済み: ' + gasUrl.slice(0, 60) + '...');

  // 2) GAS POST 疎通 + getParents
  log('');
  log('── GAS getParents 呼び出し中... ──');
  let parentsFromGas;
  try {
    parentsFromGas = await _pbeCallGAS('getParents', {});
  } catch (e) {
    log('❌ GAS 呼び出し失敗: ' + e.message);
    log('   → 原因候補: GAS 未デプロイ・URL誤り・ネットワーク切断');
    return _pbeDiagShow(lines.join('\n'));
  }
  log('✅ GAS から取得: parents 件数 = ' + (parentsFromGas.parents || []).length);

  // 3) bloodline_data_json 列の有無
  const par = (parentsFromGas.parents || []).find(p => p.par_id === parId);
  if (!par) {
    log('❌ par_id ' + parId + ' が GAS のレスポンスに含まれない');
    return _pbeDiagShow(lines.join('\n'));
  }
  log('');
  log('── 対象 parent のレスポンス内容 ──');
  log('  par_id:                     ' + par.par_id);
  log('  display_name:               ' + (par.display_name || '(空)'));
  log('  size_mm:                    ' + (par.size_mm || '(空)'));
  log('  paternal_raw:               ' + (par.paternal_raw || '(空)'));
  log('  maternal_raw:               ' + (par.maternal_raw || '(空)'));
  log('  father_parent_size_mm:      ' + (par.father_parent_size_mm || '(空)'));
  log('  mother_parent_size_mm:      ' + (par.mother_parent_size_mm || '(空)'));

  // 重要 3 列
  const has1 = ('bloodline_data_json'     in par);
  const has2 = ('source_screenshots_json' in par);
  const has3 = ('bloodline_updated_at'    in par);
  log('');
  log('── COL_DEF.PARENT 拡張チェック (3列) ──');
  log('  bloodline_data_json:        ' + (has1 ? '✅ 列あり' : '❌ 列なし (GAS 未デプロイ・COL_DEF 拡張未適用)'));
  log('  source_screenshots_json:    ' + (has2 ? '✅ 列あり' : '❌ 列なし'));
  log('  bloodline_updated_at:       ' + (has3 ? '✅ 列あり' : '❌ 列なし'));
  if (!has1) {
    log('');
    log('  → GAS 側の parent_bloodline.gs (build 20260428e) を保存し');
    log('     「デプロイ管理」→既存デプロイ編集→「新しいバージョン」を選択して');
    log('     再デプロイしてください。');
    return _pbeDiagShow(lines.join('\n'));
  }

  // 4) 値の有無
  const v1 = par.bloodline_data_json;
  const v2 = par.source_screenshots_json;
  const v3 = par.bloodline_updated_at;
  log('');
  log('── 値チェック ──');
  log('  bloodline_data_json: ' + (v1 ? '✅ ' + String(v1).length + '文字' : '⚠️ 空 (Sheets に未保存)'));
  log('  source_screenshots_json: ' + (v2 ? '✅ ' + String(v2).length + '文字' : '⚠️ 空'));
  log('  bloodline_updated_at: ' + (v3 || '(空)'));

  // 5) パース可能か
  if (v1) {
    try {
      const obj = JSON.parse(v1);
      const cnt = obj && obj.kinship_records ? obj.kinship_records.length : 0;
      log('  パース: ✅ kinship_records ' + cnt + '件 / common_name=' + (obj.common_name || '(空)'));
    } catch (e) {
      log('  パース: ❌ JSON.parse 失敗: ' + e.message);
    }
  }

  // 6) Store の parent に展開されているか
  log('');
  log('── Store (フロント) の状態 ──');
  const localPars = (window.Store && Store.getDB) ? (Store.getDB('parents') || []) : [];
  log('  Store.parents 件数: ' + localPars.length);
  const localPar  = localPars.find(p => p.par_id === parId);
  if (!localPar) {
    log('  ❌ Store.parents に ' + parId + ' が存在しない');
    // [y6.15] 詳細調査: Store.parents の中身を表示
    log('');
    log('  ── Store.parents の中身 (par_id 列挙・最大15件) ──');
    localPars.slice(0, 15).forEach(function (p, i) {
      log('    [' + i + '] par_id=' + (p.par_id || '(空)') + ' / display_id=' + (p.display_id || '(空)') + ' / display_name=' + (p.display_name || p.parent_display_id || '(空)'));
    });
    if (localPars.length > 15) log('    ... +' + (localPars.length - 15) + '件');
    // F25-24 / R7-24 で検索
    const byDispId = localPars.find(function (p) { return p.display_id === parId || p.parent_display_id === parId; });
    if (byDispId) {
      log('  → display_id 一致で見つかった: par_id=' + byDispId.par_id);
    }
    const byName = localPars.find(function (p) { return (p.display_name === 'F25-24' || p.display_name === 'R7-24'); });
    if (byName) {
      log('  → display_name 一致で見つかった: par_id=' + byName.par_id + ' / display_name=' + byName.display_name);
    }
    // Store の getParent() を試す
    if (window.Store && Store.getParent) {
      const got = Store.getParent(parId);
      if (got) {
        log('  → Store.getParent("' + parId + '") は見つけている: par_id=' + got.par_id);
        log('     bloodline_data:       ' + (got.bloodline_data ? '✅' : '❌'));
        log('     bloodline_data_json:  ' + (got.bloodline_data_json ? '✅' : '❌'));
      } else {
        log('  → Store.getParent("' + parId + '") も null');
      }
    }
  } else {
    log('  ✅ Store.parents に存在');
    log('  par.bloodline_data:       ' + (localPar.bloodline_data ? '✅ 展開済み' : '❌ 未展開'));
    log('  par.source_screenshots:   ' + (localPar.source_screenshots ? '✅ 展開済み' : '❌ 未展開'));
    log('  par.bloodline_data_json:  ' + (localPar.bloodline_data_json ? '✅ 生JSONあり' : '❌ 生JSONなし'));
  }

  // 7) localStorage キャッシュ
  log('');
  log('── localStorage キャッシュ ──');
  const pbeStore = _pbeLoadStore();
  const cacheRec = pbeStore[parId];
  if (cacheRec) {
    log('  ✅ pbeStore に ' + parId + ' あり');
    log('    bloodline_data:     ' + (cacheRec.bloodline_data ? '✅' : '❌'));
    log('    source_screenshots: ' + (cacheRec.source_screenshots ? '✅' : '❌'));
    log('    updated_at:         ' + (cacheRec.updated_at || '(空)'));
  } else {
    log('  ⚠️ pbeStore キャッシュなし (この端末では未同期)');
  }

  // 8) 最後に強制マージ実行
  log('');
  log('── 強制マージ実行 ──');
  try {
    const modified = _pbeMergeIntoStore();
    log('  _pbeMergeIntoStore() returned: ' + modified);
    log('  → 種親詳細画面に戻って表示が回復するか確認');
  } catch (e) {
    log('  ❌ マージ失敗: ' + e.message);
  }

  log('');
  log('═══ 診断完了 ═══');
  return _pbeDiagShow(lines.join('\n'));
}

function _pbeDiagShow(text) {
  // 既存モーダルがあれば消す
  let m = document.getElementById('pbe-diag-modal');
  if (m) m.remove();
  m = document.createElement('div');
  m.id = 'pbe-diag-modal';
  m.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;'
    + 'justify-content:center;padding:20px;background:rgba(0,0,0,.7);box-sizing:border-box;';
  m.innerHTML = '<div style="background:#1a1a1a;border:1px solid #444;border-radius:8px;'
    + 'max-width:560px;width:100%;max-height:85vh;display:flex;flex-direction:column">'
    + '<div style="padding:10px 14px;border-bottom:1px solid #333;display:flex;'
    + 'justify-content:space-between;align-items:center;font-weight:700;font-size:.92rem;color:#eee">'
    + '🔧 PBE 診断レポート'
    + '<button onclick="document.getElementById(\'pbe-diag-modal\').remove()" '
    + 'style="background:transparent;border:none;color:#e06050;font-size:1.2rem;cursor:pointer">✕</button>'
    + '</div>'
    + '<pre id="pbe-diag-text" style="flex:1;overflow:auto;padding:10px 14px;margin:0;'
    + 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;'
    + 'font-size:.74rem;line-height:1.5;color:#cfe;background:#0e0e0e;white-space:pre-wrap;'
    + 'word-break:break-all">' + text.replace(/[<&]/g, function(c) { return c === '<' ? '&lt;' : '&amp;'; }) + '</pre>'
    + '<div style="padding:10px;border-top:1px solid #333;display:flex;gap:8px">'
    + '<button onclick="navigator.clipboard.writeText(document.getElementById(\'pbe-diag-text\').textContent)'
    + '.then(function(){alert(\'クリップボードにコピーしました\')})" '
    + 'style="flex:1;padding:8px;background:#2c5e3e;border:none;border-radius:4px;color:#fff;'
    + 'cursor:pointer;font-weight:700;font-size:.82rem">📋 コピー</button>'
    + '<button onclick="document.getElementById(\'pbe-diag-modal\').remove()" '
    + 'style="flex:1;padding:8px;background:transparent;border:1px solid #555;border-radius:4px;'
    + 'color:#ccc;cursor:pointer;font-weight:700;font-size:.82rem">閉じる</button>'
    + '</div></div>';
  document.body.appendChild(m);
  return text;
}

// 公開 (Console / 設定画面ボタン両方から呼べる)
Pages._pbeDiagnose = _pbeDiagnose;
window._pbeDiagnose = _pbeDiagnose;

// ────────────────────────────────────────────────────────────────
// [20260429z2] 診断 FAB ボタン (フローティングUI) は削除
//   ・元々はバグ調査用の一時機能だったが、原因解明後も画面右上に
//     表示されたままになっていたため、UI を汚さないように削除。
//   ・診断機能 _pbeDiagnose 自体は残しているので、必要なら
//     コンソールから `Pages._pbeDiagnose('PAR-xxx')` で呼べる。
//   ・以前のビルドで作成されたボタンが DOM に残っていた場合に備えて、
//     起動時と1秒間隔で残骸の掃除を行う。
// ────────────────────────────────────────────────────────────────
function _pbeRemoveDiagFab() {
  const fab = document.getElementById('pbe-diag-fab');
  if (fab) fab.remove();
}
_pbeRemoveDiagFab();
setTimeout(_pbeRemoveDiagFab,  500);
setTimeout(_pbeRemoveDiagFab, 2000);
// 念のため DOM 監視 (前バージョンでロードされた script が残ってボタンを再生成する可能性に備える)
const _pbeFabCleanupInterval = setInterval(_pbeRemoveDiagFab, 1500);
// 30秒後には監視停止 (前バージョンの script が完全に置き換わったと判断)
setTimeout(function () { clearInterval(_pbeFabCleanupInterval); }, 30000);

// ════════════════════════════════════════════════════════════════
// [y6.18] 🔥 GAS クラウド優先で系統評価カードを直接DOM注入
// ────────────────────────────────────────────────────────────────
// 背景:
//   ・端末ごとに localStorage の pbeStore に**異なるバージョン**のデータが
//     入っているケースが判明:
//       - スマホ: 古いスクショ 3枚のスナップショット
//       - PC:    最新スクショ 9枚のスナップショット
//   ・原因は scan.js / parent_bloodline_extract.js が個別端末の localStorage
//     にしかキャッシュしないため、PC で追加スクショして Sheets に保存しても
//     スマホ側の localStorage は古いまま。
//   ・Store.parents が空という別問題もあり、parent_v2.js の正常系では
//     系統評価カードが描画されない状況が続いていた。
//
// 解決策:
//   ・**GAS クラウド (Sheets) を最優先データソースとする**
//   ・1秒間隔で「pbe-bloodline-card-mount」を監視
//   ・空なら GAS getParents を呼んで最新データを取得 (POST・~14KB)
//   ・取得した bloodline_data_json をパースして HTML 生成・DOM 注入
//   ・取得できたデータは localStorage にも上書き保存し、次回からは
//     キャッシュ + バックグラウンド更新の二段構えで高速化
//   ・GAS 通信失敗時は localStorage キャッシュをフォールバックとして使う
//
// この実装により:
//   ・端末ごとの localStorage バージョン差異が解消される
//   ・Store.parents の状態に依存しない
//   ・syncAll や setDB の挙動に依存しない
//   ・常にクラウドの最新データが画面に表示される
// ════════════════════════════════════════════════════════════════
let _pbeLastInjectedParId = null;
let _pbeCloudFetchInflight = false;  // 同一 par_id への二重リクエスト防止

async function _pbeInjectBloodlineCardFromCloud() {
  const mount = document.getElementById('pbe-bloodline-card-mount');
  if (!mount) {
    _pbeLastInjectedParId = null;
    return;
  }
  // 既に何かが描画されているなら触らない (parent_v2.js が正常系で動いた場合)
  if (mount.innerHTML && mount.innerHTML.trim().length > 0) return;
  // URL から par_id を取得
  const m = (location.hash || '').match(/parId=([^&]+)/);
  if (!m) return;
  const parId = decodeURIComponent(m[1]);

  // ── ステップ1: localStorage キャッシュで即時表示 (高速化) ──
  //   ただし古いキャッシュの可能性があるため、後段で GAS から最新を取得
  //   して上書き更新する。
  const pbeStore = _pbeLoadStore();
  const rec = pbeStore && pbeStore[parId];
  if (rec && rec.bloodline_data) {
    const fakePar = {
      par_id:             parId,
      bloodline_data:     rec.bloodline_data,
      source_screenshots: rec.source_screenshots,
    };
    try {
      const html = _pbeRenderBloodlineCard(fakePar);
      if (html && (!mount.innerHTML || mount.innerHTML.trim().length === 0)) {
        mount.innerHTML = html;
        if (_pbeLastInjectedParId !== parId) {
          console.log('[PBE] 🎯 系統評価カードを localStorage から即時表示 par_id=' + parId);
          _pbeLastInjectedParId = parId;
        }
      }
    } catch (e) {
      console.warn('[PBE] localStorage レンダ失敗:', e);
    }
  }

  // ── ステップ2: GAS から最新データを取得して上書き (バックグラウンド) ──
  //   既に同一リクエスト実行中ならスキップ (二重起動防止)
  if (_pbeCloudFetchInflight) return;
  _pbeCloudFetchInflight = true;
  try {
    const data = await _pbeCallGAS('getParents', {});
    if (data && Array.isArray(data.parents)) {
      const cloudPar = data.parents.find(p => p && p.par_id === parId);
      if (cloudPar && cloudPar.bloodline_data_json) {
        // パース
        let bloodlineData = null;
        let sourceScreenshots = null;
        try { bloodlineData = JSON.parse(cloudPar.bloodline_data_json); } catch (e) {}
        try { if (cloudPar.source_screenshots_json) sourceScreenshots = JSON.parse(cloudPar.source_screenshots_json); } catch (e) {}

        // 新しいデータかどうかタイムスタンプで判定
        const cloudTs = cloudPar.bloodline_updated_at
          ? new Date(cloudPar.bloodline_updated_at).getTime() : 0;
        const cacheTs = (rec && rec.updated_at)
          ? new Date(rec.updated_at).getTime() : 0;

        if (bloodlineData) {
          // 1) クラウド側が新しいなら DOM 再描画 + localStorage 上書き
          if (cloudTs > cacheTs) {
            const cloudFakePar = {
              par_id:             parId,
              bloodline_data:     bloodlineData,
              source_screenshots: sourceScreenshots,
            };
            try {
              const html = _pbeRenderBloodlineCard(cloudFakePar);
              if (html) {
                // クラウド側を最新として強制再描画 (既存 innerHTML 上書き)
                mount.innerHTML = html;
                console.log('[PBE] 🌐 系統評価カードをクラウド最新版で更新 par_id=' + parId
                  + ' (スクショ ' + (sourceScreenshots ? sourceScreenshots.length : 0) + '枚)');
              }
            } catch (e) { console.warn('[PBE] クラウドレンダ失敗:', e); }
            // localStorage を最新で上書き
            try {
              pbeStore[parId] = {
                bloodline_data:     bloodlineData,
                source_screenshots: sourceScreenshots,
                updated_at:         cloudPar.bloodline_updated_at || _pbeNowIso(),
              };
              _pbeSaveStore(pbeStore);
              console.log('[PBE] 💾 localStorage キャッシュをクラウド最新版で上書き par_id=' + parId);
            } catch (e) { console.warn('[PBE] localStorage 保存失敗:', e); }
          }
          // 2) DOM がまだ空 (ステップ1の localStorage も空) ならクラウドのデータで描画
          else if (!mount.innerHTML || mount.innerHTML.trim().length === 0) {
            const cloudFakePar = {
              par_id:             parId,
              bloodline_data:     bloodlineData,
              source_screenshots: sourceScreenshots,
            };
            try {
              const html = _pbeRenderBloodlineCard(cloudFakePar);
              if (html) {
                mount.innerHTML = html;
                console.log('[PBE] 🌐 系統評価カードをクラウドから初回描画 par_id=' + parId);
              }
            } catch (e) { console.warn('[PBE] クラウドレンダ失敗:', e); }
            // localStorage 初期セット
            try {
              pbeStore[parId] = {
                bloodline_data:     bloodlineData,
                source_screenshots: sourceScreenshots,
                updated_at:         cloudPar.bloodline_updated_at || _pbeNowIso(),
              };
              _pbeSaveStore(pbeStore);
            } catch (e) {}
          }
        }
      }
    }
  } catch (e) {
    // GAS 失敗時は何もしない (既に localStorage で描画済みなら継続表示)
    console.warn('[PBE] クラウド取得失敗 (localStorage で代替):', e.message);
  } finally {
    _pbeCloudFetchInflight = false;
  }
}

// 1秒間隔でマウントポイントを監視 (描画と更新両方の機会を逃さない)
setInterval(_pbeInjectBloodlineCardFromCloud, 1000);
// 即時実行も (画面表示直後の遅延を最小化)
setTimeout(_pbeInjectBloodlineCardFromCloud, 200);
setTimeout(_pbeInjectBloodlineCardFromCloud, 800);
setTimeout(_pbeInjectBloodlineCardFromCloud, 2000);

console.log('[PBE] parent_bloodline_extract.js loaded build=20260429z4');
