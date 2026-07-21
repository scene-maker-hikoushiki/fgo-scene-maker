/* =====================================================================
   Scenario Console — コアロジック
   すべて1600x900の<canvas>に直接描画している。外部ライブラリを使っていないので
   オフラインでも問題なく動作し、将来的な動画書き出し（canvas.captureStream）や
   表情差分シートの切り出し（CHAR crop系フィールド、現状未使用）にも対応しやすい。
   ===================================================================== */

(() => {
  "use strict";

  // ---------------- 定数 ----------------
  const CANVAS_W = 1600;
  const CANVAS_H = 900;
  const MAX_CHARACTERS = 20;

  // キャラクター位置X/Yスライダーの範囲 — キャンバスより広めに取ってあり、
  // 画面外へ半分はみ出す位置までドラッグ/スライドできるようにしている
  const POS_X_MIN = -400;
  const POS_X_MAX = CANVAS_W + 400;
  const POS_Y_MIN = -300;
  const POS_Y_MAX = CANVAS_H + 300;

  // 「表示中のキャラを等間隔に並べる」ボタン（reflowVisibleCharacterSlotsX）
  // が使う、キャラクター同士の水平方向の間隔（キャンバス幅に対する割合）。
  const CHAR_SLOT_PITCH = 0.22;

  // 提供されたUI画像/参考スクリーンショットから実測した値
  const BOX_TOP = 664;             // ダイアログボックス内側の上端
  const NAME_X = 45;
  const NAME_Y = 670;              // ベースライン（NAME_FONT_SIZE基準）
  const NAME_FONT_SIZE = 45;       // 固定 — 本文のfontSizeスライダーとは独立
  const NAME_TEXT_COLOR = "#ffffff"; // 固定 — 文字色ピッカーは本文のみに影響する
  const BODY_X = 110;
  const BODY_MAX_WIDTH = 1350;

  // 名前欄タブ（assets.nameBox）を、名前欄ONのときにassets.textboxの上に
  // 重ねて描画する位置。もともとはtextbox.pngとtextbox_name.pngの差分を
  // 測って求め、そこから好みに合わせて拡大・左上に調整した。
  // 高さは画像自体のアスペクト比（drawScene参照）から算出し、
  // NAME_BOX_HEIGHT_SCALEを掛ける — 1なら画像本来の比率のまま、
  // 1より大きいと幅はそのままで縦に伸びる。さらに調整するには：
  // 大きくしたいならNAME_BOX_MIN_Wを上げる、左にずらすならNAME_BOX_Xを下げる、
  // 上にずらすならNAME_BOX_Yを下げる。
  const NAME_BOX_X = -55;
  const NAME_BOX_Y = 530;
  const NAME_BOX_MIN_W = 605; // 短い名前のときの幅 — これより縮まない
  const NAME_BOX_HEIGHT_SCALE = 1.06;

  // assets/name_box.png（実寸1098x400）は「左の矢印状ノッチ」「伸縮可能な
  // 平坦な帯」「右のフェードアウト」の3パーツで構成されている。以下は
  // それぞれの境界を*その元画像自身のピクセル座標で*表したもので、
  // 各列の不透明範囲の形が変化しなくなる位置を走査して求めた。
  // 画像全体を引き伸ばして長い名前に対応させるとノッチとフェードが
  // 歪んでしまうので、drawNameBoxでは中央の帯だけを伸縮させている
  // （横方向の9-patch/9-sliceのような仕組み）。
  const NAME_BOX_SRC_LEFT_CAP = 144;
  const NAME_BOX_SRC_RIGHT_CAP = 882;
  // scroll.png（150×350）内の、ダイヤモンド型の先端が終わる位置——概算値。
  // 見た目が合わなければここを調整する。
  const LOG_SCROLLBAR_SRC_TOP_CAP = 75;
  const LOG_SCROLLBAR_SRC_BOTTOM_CAP = 275;
  // scroll.pngは上下に余白（完全透明のピクセル）が入っており、実際に絵が
  // 描かれているのはY=40〜309の範囲だけ（Pillowでアルファ値を走査して実測）。
  // この余白を含めたまま描画すると、つまみを上下いっぱいまで動かしても
  // 見た目上は絵の先端がトラックの端まで届かず隙間が空いてしまうため、
  // 上下キャップの描画時はこの余白を切り捨てて詰める。
  const LOG_SCROLLBAR_SRC_CONTENT_TOP = 40;
  const LOG_SCROLLBAR_SRC_CONTENT_BOTTOM = 310;
  // 名前テキストと、右側のフェードアウトが平坦な帯を侵食し始める位置との間に
  // 保つ余白
  const NAME_BOX_TEXT_PADDING = 26;

  // 選択肢プロンプト（assets.linesBox） — 最大2つのボックスを縦に並べ、
  // 水平方向中央揃えで、セリフウインドウ/名前欄の後（＝手前）に描画する。
  // 幅は参考スクリーンショット（16:9より横長のキャプチャだったため、
  // 横方向のみ再スケール）から測ってこのキャンバスの1600x900空間に変換した値。
  // 高さは描画のたびに画像自身のアスペクト比から算出しており（drawScene参照）、
  // 2つ目の固定値を持たないことで、画像本来の比率を歪めることがないようにしている。
  const CHOICE_FONT_SIZE = 45; // 固定、本文のfontSizeスライダーとは独立
  const CHOICE_BOX_W = 1245;
  const CHOICE_BOX_GAP = 10; // 2つのボックスの間の縦の隙間
  const CHOICE_BOX_X = (CANVAS_W - CHOICE_BOX_W) / 2;
  const CHOICE_BOX_TOP_Y = 190; // 1つ目（上側）のボックスの上端
  // 選択肢クリック後のフェードアウト演出。選ばれなかった方が先に消え始め、
  // 選ばれた方はCHOICE_SELECTED_FADE_DELAY_MSだけ遅れて消え始める
  // （選ばれなかった方が完全に消え終わる=CHOICE_FADE_MSより後ろに設定する
  // ことで、2つの消えるタイミングがはっきり分かれるようにしている）。
  // 選ばれた方が消え終わってからCHOICE_POST_FADE_DELAY_MSだけ間を置いて
  // 次の行へ進む（消えた直後すぎると慌ただしいため）。
  const CHOICE_FADE_MS = 500;
  const CHOICE_SELECTED_FADE_DELAY_MS = 900;
  const CHOICE_POST_FADE_DELAY_MS = 1000;
  // 選ばれた選択肢「だけ」に追加で乗せる演出——本来の文字列は箱と同じ
  // （CHOICE_FADE_MS/CHOICE_SELECTED_FADE_DELAY_MSの通常フェードの）まま
  // 残し、その上に同じ文字列の「分身」をもう1つ重ねて描き、そちらだけを
  // クリックと同時（選ばれなかった方の消え始めと同タイミング）に
  // CHOICE_SELECTED_TEXT_ZOOM_TARGET_SIZEまで拡大させながら素早く
  // フェードアウトさせる。
  const CHOICE_SELECTED_TEXT_ZOOM_MS = 250;
  const CHOICE_SELECTED_TEXT_ZOOM_TARGET_SIZE = 75;
  // シナリオ終了時（自然終了・SKIP押下）の演出タイミング。
  // 画面が暗転→（画面が真っ黒になってからENDING_SKIP_FADE_DELAY_MSだけ
  // 間を置いて）→SKIPボタンがフェードアウト→何も無い真っ黒のまま少し
  // 静止、の順で経過し、その後に再生を終了する。
  // シナリオ開始時の導入演出（beginStartingFade）は、この4つの定数を
  // そのまま逆向きに使う「逆手順」として実装している。
  const ENDING_FADE_MS = 1400;
  const ENDING_SKIP_FADE_DELAY_MS = 600;
  const ENDING_SKIP_FADE_MS = 700;
  const ENDING_HOLD_MS = 1000;
  // 開始演出だけに必要な追加の間——暗転が完全に晴れてから実際に1行目
  // （実質的な最初の行）を開始するまでの間を置く
  const STARTING_LINE_DELAY_MS = 500;

  // テキストはベースラインではなく上端を基準にアンカーしているので、
  // 文字サイズを変えるとブロックが固定点から右下方向に成長し、
  // 見た目の中心が動いてしまうことがない。BODY_ASCENT_RATIOは
  // makeTextGradient自身の上端オフセットと対応しており、*_TOP_Y系の定数は
  // 参考画像から測った各ベースライン（測定時のフォントサイズにおける値）を
  // その固定の上端アンカーへ変換するためのもので、これにより今の画面上の
  // 位置は一切動かない。
  const BODY_ASCENT_RATIO = 0.82;
  const NAME_TOP_Y = NAME_Y - NAME_FONT_SIZE * BODY_ASCENT_RATIO;
  const BODY_ORIGINAL_BASELINE_Y = 753; // 参考ベースライン…
  const BODY_ORIGINAL_FONT_SIZE = 38;   // …の、このフォントサイズでの測定値
  const BODY_TOP_NUDGE = 12;            // 1行目を少し下に押し下げる（2行目との間隔を詰める）
  const BODY_DEFAULT_FONT_SIZE = 45;   // 本文文字サイズのデフォルト値（リセットボタン用）
  const BODY_TOP_Y =
    BODY_ORIGINAL_BASELINE_Y - BODY_ORIGINAL_FONT_SIZE * BODY_ASCENT_RATIO + BODY_TOP_NUDGE;

  const TEXT_SHADOW_COLOR = "rgba(0, 0, 0, 0.7)";
  const TEXT_SHADOW_BLUR = 4;
  const TEXT_SHADOW_OFFSET_X = 2;
  const TEXT_SHADOW_OFFSET_Y = 3;

  // 「ホログラム」キャラクターエフェクト（applyHologramEffect参照）—
  // グレースケール輝度（0-255）をチャンネルごとの2点グラデーションに変換する：
  // gray=0はHOLOGRAM_SHADOW_*に、gray=255はHOLOGRAM_HIGHLIGHT_*に対応し、
  // その間は線形補間する。以前の「掛け算+加算」方式では、gray=255でも
  // Rが255よりずっと低く抑えられてしまい、白く輝くべき明るい部分が
  // 常にくすんだ中間の青止まりになっていた —
  // 両端の実際の値をピン留めすることで、最も暗い影と最も明るいハイライトが
  // 必ず下記の色にぴったり収まるようにしている。
  // 「レベル補正」の黒点・白点、Photoshopのレベル補正と同じ考え方 —
  // HOLOGRAM_BLACK_POINT以下のグレーはすべて影の色に、
  // HOLOGRAM_WHITE_POINT以上のグレーはすべてハイライトの色に完全に振り切り、
  // その間の範囲だけを引き伸ばして埋める。最初はガンマカーブを試したが、
  // ガンマは範囲*全体*を掛け算的に暗くしてしまい（純粋なgray=255だけが
  // ハイライトに固定されたまま）、コントラストを上げようとすると
  // 本来明るいままであるべき中間調まで目に見えて暗くなってしまっていた。
  // カーブ全体を作り直す代わりに実際の閾値でクランプすることで、
  // 全体が暗くなるバイアスを生まずに、明暗のはっきりした分離を保てる。
  const HOLOGRAM_SHADOW_R = 30;
  const HOLOGRAM_SHADOW_G = 50;
  const HOLOGRAM_SHADOW_B = 60;
  const HOLOGRAM_HIGHLIGHT_R = 170;
  const HOLOGRAM_HIGHLIGHT_G = 200;
  const HOLOGRAM_HIGHLIGHT_B = 220;
  const HOLOGRAM_BLACK_POINT = 35;
  const HOLOGRAM_WHITE_POINT = 245;
  // SCANLINE_*は、上に重ねるかすかな横帯を描画する。
  const HOLOGRAM_SCANLINE_COLOR = "rgba(12, 15, 89, 0.18)";
  const HOLOGRAM_SCANLINE_SPACING = 4; // 各帯の開始位置の間隔（px、スプライトの元解像度基準）
  const HOLOGRAM_SCANLINE_THICKNESS = 2;

  const ICON_SIZE = 64;            // LOG / AUTO
  const NEXT_SIZE = 128;           // NEXT（フィードバックにより2倍サイズに）
  const TAP_EFFECT_SIZE = 240;     // 手動進行でタップした位置に出すエフェクトの高さ（px、キャンバス基準）
  const ICON_GAP = 0;              // gap between LOG and AUTO
  const ICON_NEXT_GAP = -22;         // AUTOとNEXTの間隔（詰め気味に）
  const ICON_OPACITY = 0.5;
  const ICON_RIGHT_MARGIN_TO_CENTER = 70; // 右端からアイコン中心までのpx
  const ICON_CENTER_X = CANVAS_W - ICON_RIGHT_MARGIN_TO_CENTER;
  const ICON_X = ICON_CENTER_X - ICON_SIZE / 2;
  const NEXT_X = ICON_CENTER_X - NEXT_SIZE / 2;
  // NEXTが以前よりずっと大きくなったので、下端（ボックス下部付近）を基準に
  // 上方向へ積み上げる
  const ICON_NEXT_Y = 775;
  const ICON_AUTO_Y = ICON_NEXT_Y - ICON_NEXT_GAP - ICON_SIZE;
  const ICON_LOG_Y = ICON_AUTO_Y - ICON_GAP - ICON_SIZE;

  // SKIPアイコン本体の当たり判定用の座標。skip_button.pngは1280x720の
  // フルキャンバスオーバーレイ画像で、実際に見えているボタンはその中の
  // 一部分だけ（PIL Image.getbbox()で調べた不透明領域: x[1124,1269]
  // y[15,72]、1280x720基準）。drawSceneではCANVAS_W/Hへ引き伸ばして
  // 描画している（1600/1280 = 900/720 = 1.25倍）ため、当たり判定も
  // 同じ倍率で実座標へ変換する——そうしないと「SKIPの当たり判定」が
  // キャンバス全体になってしまう（drawImageの描画先が画面全体のため）。
  const SKIP_ASSET_W = 1280;
  const SKIP_ICON_SCALE = CANVAS_W / SKIP_ASSET_W; // CANVAS_H / 720 も同じ値
  const SKIP_HIT_X = 1124 * SKIP_ICON_SCALE;
  const SKIP_HIT_Y = 15 * SKIP_ICON_SCALE;
  const SKIP_HIT_W = (1269 - 1124) * SKIP_ICON_SCALE;
  const SKIP_HIT_H = (72 - 15) * SKIP_ICON_SCALE;

  // NEXTアイコンの上下バウンド演出（本家UI同様、1秒に2往復＝2Hz）
  const NEXT_BOB_HZ = 2;
  const NEXT_BOB_AMPLITUDE_PX = 10;

  const RUBY_FONT_RATIO = 0.4;     // 本文フォントサイズに対するルビの読みのサイズ比
  const RUBY_FONT_MAX = 32;        // 本文が大きいときにルビがウインドウをはみ出す前に頭打ちにする上限
  const LETTER_SPACING = 0.6;        // 文字間の追加スペース（px）

  // シナリオ再生中のセリフ文字アニメーション（タイプライター表示＋退出
  // スライド）用の定数。通常の静止編集・PNG書き出し時は使わない。
  const TYPEWRITER_MS_PER_RUN = 40;      // ルビ単位含め、1「run」あたりの表示間隔(ms)
  const DIALOGUE_EXIT_MS = 350;          // 退出アニメーションの所要時間(ms)
  const DIALOGUE_EXIT_SLIDE_PX = 50;     // 退出時に上へスライドする距離(px)
  const DIALOGUE_EXIT_CLIP_MARGIN = 120; // 退出中だけクリップ領域を上に広げる余白(px)。最大文字サイズ+ルビでもはみ出さない値
  // グラデーションの下端の色は、選ばれた文字色を暗くしたもの。
  // 元々の白→#AEAEAEのグラデーションと同じ比率（174/255）にしているので、
  // 白を選んだときはこれまで通りぴったり#AEAEAEになり、他の色を選んでも
  // 常に単なるグレーへフェードするのではなく、その色自身の濃淡に応じて
  // 比例的に暗くなる。
  const GRADIENT_DARKEN_RATIO = 174 / 255;

  const HANDLE_SIZE = 16;
  const SNAP_THRESHOLD = 10; // ドラッグがガイドに吸着する範囲（キャンバスpx）
  const SNAP_GUIDE_COLOR = "#ff2fd0";

  // ---------------- 状態 ----------------
  const state = {
    backgrounds: [],       // { id, img, name, naturalW, naturalH, zoom }
    activeBackgroundId: null,
    characters: [],        // 奥 → 手前
    selectedId: null,
    dimInactive: true,
    sceneColorMode: "none", // "none" | "grayscale" | "sepia" — 背景とキャラクターだけに適用し、セリフウインドウ/選択肢/ボタンは元の色のまま
    nameplateOn: true,
    showWindow: true,   // ダイアログボックス画像＋名前＋本文
    showButtons: true,  // SKIP/LOG/AUTO/NEXTグループ全体のマスタートグル
    showSkip: true,
    showLog: true,
    showAuto: true,
    autoActive: false, // AUTOアイコンを不透明＋発光表示にし、あたかも現在作動中であるかのように見せる
    showNext: true,
    speaker: "",
    body: "",
    fontSize: NAME_FONT_SIZE,
    textColor: "#ffffff",
    speakerLinkToChar: true, // ONのとき、state.speakerは最前面の表示中キャラクターの名前に追従する
    showChoices: false, // プレイヤー選択肢プロンプト（lines_box.png）— セリフウインドウ/名前欄より手前に表示
    choiceCount: 2,
    choice1: "",
    choice2: "",
    choice3: "",
    choice1Color: "#ffffff",
    choice2Color: "#ffffff",
    choice3Color: "#ffffff",
    scenario: [],            // シナリオの行（スナップショット）の並び
    scenarioSelectedId: null, // シナリオパネルで現在選択/編集中の行id
    activeCharId: null,      // 再生中の「発話中キャラ」上書き。null時は通常のz順序ロジック（resolveFrontIndex参照）
    scenarioAdvanceMode: "auto", // シナリオ全体で共通の進行方式。"auto" | "manual"
    scenarioAutoDelaySec: 3,     // 自動進行時、全文表示完了後に次へ進むまでの待ち秒数（全行共通）
    // 再生開始位置（調整確認用、プロジェクト保存の対象外）。0なら通常通り
    // シナリオ開始（先頭の特殊行）から、N(>=1)ならN番目の実質的な行から
    // 直接開始する（それより前の開始演出・行はスキップする）。
    scenarioStartLineNumber: 0,
    // BGM。{ id, name, audio(<audio>), startLineId, endLineId }の並び。
    // startLineId/endLineIdは実質的なシナリオ行（開始/終了の特殊行を除く）
    // のidを指し、その2行の間（現在の並び順で）にある行の間だけ再生する。
    // 複数トラックを入れられるが、再生範囲が重なるトラックは同時には
    // 存在できない（追加直後は重なりうるが、その間は警告表示のみで
    // ブロックはしない——重ならないよう調整するのはユーザー側の操作）
    bgmTracks: [],
  };

  let nextCharId = 1;
  let nextScenarioLineId = 1;
  // シナリオの再生/録画の実行時状態。プロジェクトファイルには保存しない
  // （リロードのたびに必ずクリーンな状態から始まるようにするため）
  let playback = null;
  // GIFキャプチャ中の実行時状態。{ canvas, ctx, frames, lastSampleTime, ... }
  // モードが"gif"のときだけ使う（それ以外は常にnull）
  let gifCapture = null;

  // BGMの<audio>要素をWeb Audio APIのグラフに載せるための共有ノード。
  // 録画（MediaRecorder）にBGM音声を含めるには、<audio>要素をそのまま
  // 再生するだけでは足りず、MediaStreamAudioDestinationNodeへ接続して
  // そこから得られるMediaStreamのトラックをcanvas側の映像トラックと
  // 合成する必要がある。トラックが複数あっても実際に鳴るのは常に
  // 最大1つ（範囲が重ならない前提）なので、宛先は共通の1つで足りる。
  // 遅延生成（ensureBgmAudioRouting）にしているのは、AudioContextの生成に
  // ユーザー操作（ジェスチャー）が必要なブラウザがあるため——最初のBGM
  // 追加やシナリオ再生開始は必ず何らかのクリックの延長で起きるので、
  // そのタイミングで初めて生成すれば問題ない。
  let bgmAudioCtx = null;
  let bgmAudioDest = null;
  function ensureBgmAudioRouting() {
    if (bgmAudioCtx) return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return; // 対応していないブラウザではBGMの録画同梱だけ諦める（再生自体は<audio>のデフォルト出力で可能）
    bgmAudioCtx = new AudioContextCtor();
    bgmAudioDest = bgmAudioCtx.createMediaStreamDestination();
  }
  // BGMの<audio>要素を一度だけWeb Audioグラフに接続する。スピーカーへの
  // 出力（destination）と録画用の宛先（bgmAudioDest）の両方へ繋ぐことで、
  // 通常再生時にきちんと耳に聞こえつつ、録画中は同じ音声がWebMにも
  // 含まれるようにする。createMediaElementSourceは同じ要素に対して
  // 二度呼ぶと例外になるため、接続済みかどうかをaudio自身に印を付けて防ぐ。
  function connectBgmTrackForRouting(audio) {
    ensureBgmAudioRouting();
    if (!bgmAudioCtx || audio._bgmSourceConnected) return;
    const source = bgmAudioCtx.createMediaElementSource(audio);
    source.connect(bgmAudioCtx.destination);
    source.connect(bgmAudioDest);
    audio._bgmSourceConnected = true;
  }
  let nextBgId = 1;
  let nextBgmId = 1;

  // ---------------- DOM参照 ----------------
  const canvas = document.getElementById("sceneCanvas");
  const ctx = canvas.getContext("2d");
  const stage = document.querySelector(".stage");
  const previewToggleInput = document.getElementById("previewToggleInput");

  const bgInput = document.getElementById("bgInput");
  const bgAddLabel = document.getElementById("bgAddLabel");
  const bgList = document.getElementById("bgList");
  const bgCount = document.getElementById("bgCount");
  const bgEditor = document.getElementById("bgEditor");
  const bgItemTemplate = document.getElementById("bgItemTemplate");

  const bgmInput = document.getElementById("bgmInput");
  const bgmList = document.getElementById("bgmList");
  const bgmCount = document.getElementById("bgmCount");
  const bgmItemTemplate = document.getElementById("bgmItemTemplate");

  const charInput = document.getElementById("charInput");
  const charAddLabel = document.getElementById("charAddLabel");
  const charList = document.getElementById("charList");
  const charCount = document.getElementById("charCount");
  const charEditor = document.getElementById("charEditor");
  const charItemTemplate = document.getElementById("charItemTemplate");
  const reflowCharSlotsBtn = document.getElementById("reflowCharSlotsBtn");

  const scenarioList = document.getElementById("scenarioList");
  const scenarioCount = document.getElementById("scenarioCount");
  const scenarioEditor = document.getElementById("scenarioEditor");
  const scenarioAddLineBtn = document.getElementById("scenarioAddLineBtn");
  const scenarioAddBlankLineBtn = document.getElementById("scenarioAddBlankLineBtn");
  const scenarioAddTransitionBtn = document.getElementById("scenarioAddTransitionBtn");
  const scenarioItemTemplate = document.getElementById("scenarioItemTemplate");
  const scenarioSpecialItemTemplate = document.getElementById("scenarioSpecialItemTemplate");

  const dimToggle = document.getElementById("dimToggle");
  const sceneColorModeTabs = document.getElementById("sceneColorModeTabs");
  const nameplateToggle = document.getElementById("nameplateToggle");
  const windowToggle = document.getElementById("windowToggle");
  const buttonsToggle = document.getElementById("buttonsToggle");
  const showSkipToggle = document.getElementById("showSkipToggle");
  const showLogToggle = document.getElementById("showLogToggle");
  const showAutoToggle = document.getElementById("showAutoToggle");
  const autoActiveToggle = document.getElementById("autoActiveToggle");
  const showNextToggle = document.getElementById("showNextToggle");

  const choicesToggle = document.getElementById("choicesToggle");
  const choiceCountTabs = document.getElementById("choiceCountTabs");
  const choice1Input = document.getElementById("choice1Input");
  const choice1ColorInput = document.getElementById("choice1ColorInput");
  const choice2Input = document.getElementById("choice2Input");
  const choice2ColorInput = document.getElementById("choice2ColorInput");
  const choice2Row = document.getElementById("choice2Row");
  const choice3Input = document.getElementById("choice3Input");
  const choice3ColorInput = document.getElementById("choice3ColorInput");
  const choice3Row = document.getElementById("choice3Row");

  const speakerLinkToggle = document.getElementById("speakerLinkToggle");
  const speakerInput = document.getElementById("speakerInput");
  const bodyInput = document.getElementById("bodyInput");
  const fontSizeInput = document.getElementById("fontSizeInput");
  const fontSizeResetBtn = document.getElementById("fontSizeResetBtn");
  const textColorInput = document.getElementById("textColorInput");

  const exportBtn = document.getElementById("exportBtn");
  const exportNameInput = document.getElementById("exportNameInput");
  const projectSaveBtn = document.getElementById("projectSaveBtn");
  const projectOpenInput = document.getElementById("projectOpenInput");
  const projectNameInput = document.getElementById("projectNameInput");
  const consoleFooterDetails = document.getElementById("consoleFooterDetails");
  const footerTabExportBtn = document.getElementById("footerTabExportBtn");
  const footerTabProjectBtn = document.getElementById("footerTabProjectBtn");
  const footerTabVideoBtn = document.getElementById("footerTabVideoBtn");
  const footerPanelExport = document.getElementById("footerPanelExport");
  const footerPanelProject = document.getElementById("footerPanelProject");
  const footerPanelVideo = document.getElementById("footerPanelVideo");
  const videoNameInput = document.getElementById("videoNameInput");
  const scenarioStartLineInput = document.getElementById("scenarioStartLineInput");
  const videoFormatMenu = document.getElementById("videoFormatMenu");
  const videoFormatHint = document.getElementById("videoFormatHint");
  const VIDEO_HINT_DEFAULT = videoFormatHint ? videoFormatHint.textContent : "";
  const scenarioPlayBtn = document.getElementById("scenarioPlayBtn");
  const scenarioPreviewBtn = document.getElementById("scenarioPreviewBtn");
  const scenarioCancelBtn = document.getElementById("scenarioCancelBtn");
  const scenarioAdvanceModeTabs = document.getElementById("scenarioAdvanceModeTabs");
  const scenarioDelayField = document.getElementById("scenarioDelayField");
  const scenarioDelayInput = document.getElementById("scenarioDelayInput");
  const stageHint = document.getElementById("stageHint");
  // 通常時（何も選択していない時）の操作ヒント文言。何か選択中は
  // updateStageStatus()がこの代わりに選択状況を表示する。
  const STAGE_HINT_DEFAULT_TEXT = "立ち絵をドラッグで移動できます。選択すると角のハンドルで拡大縮小できます。";

  // ---------------- コンソール幅リサイズ ----------------
  // ステージ/コンソールの境界をドラッグする、VSCodeのパネルのような仕組み。
  // ステージ側は16:9の形を保つための特別な処理が不要 — .monitor__frameは
  // 可変幅のステージ列の中ですでに`width:100%; aspect-ratio:16/9`に
  // なっているので、コンソール幅（＝ステージ側の残り幅）が変わった瞬間、
  // フレームは自動的にスケールしてくれる。
  // 利用規約(.console__terms)の元の位置（.console__scroll直下、
  // .console__bodyの後ろの兄弟要素）を覚えておき、2列表示の間だけ
  // 左列の最後尾へ移す（別枠で表示すると場所を取るため、左列のスクロールと
  // 一緒に流れるようにする）。実際に2列になっているか（横幅のしきい値と
  // デスクトップ幅の両方を満たすか）に応じて、リサイズ操作中・ウインドウ
  // 幅が変わった時の両方でこの関数を呼び直す。
  function updateTermsPlacement() {
    const termsEl = document.querySelector(".console__terms");
    const scrollEl = document.querySelector(".console__scroll");
    const leftCol = document.querySelector(".console__col--left");
    if (!termsEl || !scrollEl || !leftCol) return;
    const isWide = window.innerWidth > 860 && document.body.classList.contains("console-wide");
    if (isWide) {
      if (termsEl.parentElement !== leftCol) leftCol.appendChild(termsEl);
    } else if (termsEl.parentElement !== scrollEl) {
      scrollEl.appendChild(termsEl); // .console__body直後という元の位置に戻す
    }
  }

  (function initConsoleResizer() {
    const resizer = document.getElementById("consoleResizer");
    const consoleEl = document.querySelector(".console");
    if (!resizer || !consoleEl) return;

    const MIN_CONSOLE = 300;
    const MIN_STAGE = 360; // キャンバス側に最低限残しておく幅
    // コンソール幅がこれ以上になったら2列レイアウトに切り替える
    // （@containerクエリで試したがうまく反映されなかったため、リサイズの
    // 度にJS側で直接クラスを切り替える確実な方式にしている）。
    // プレビュー：コンソールがおおよそ6:4になる程度の値（厳密な比率計算は
    // せず、一般的な画面幅を想定したざっくりした固定値でよい）。
    const CONSOLE_WIDE_THRESHOLD = 720;
    let dragging = false;

    function clampWidth(px) {
      const maxByViewport = window.innerWidth - MIN_STAGE;
      const max = Math.max(MIN_CONSOLE, Math.min(900, maxByViewport));
      return Math.min(max, Math.max(MIN_CONSOLE, px));
    }

    resizer.addEventListener("pointerdown", (evt) => {
      // レスポンシブのブレークポイントより狭い画面では縦積みレイアウトに
      // なるので、そこでは横方向にドラッグする境界自体が存在しない
      if (window.innerWidth <= 860) return;
      dragging = true;
      resizer.classList.add("is-dragging");
      document.body.classList.add("is-resizing-console");
      resizer.setPointerCapture(evt.pointerId);
    });

    resizer.addEventListener("pointermove", (evt) => {
      if (!dragging) return;
      const width = clampWidth(window.innerWidth - evt.clientX);
      document.documentElement.style.setProperty("--console-width", width + "px");
      document.body.classList.toggle("console-wide", width >= CONSOLE_WIDE_THRESHOLD);
      updateTermsPlacement();
    });

    function endDrag(evt) {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing-console");
      try {
        resizer.releasePointerCapture(evt.pointerId);
      } catch (e) {
        /* 何もしない */
      }
    }
    resizer.addEventListener("pointerup", endDrag);
    resizer.addEventListener("pointercancel", endDrag);

    // 境界のドラッグ以外（ウインドウ自体の幅変更）でconsole-wideの実効状態が
    // 変わることがあるため、リサイズの度にも配置を確認し直す
    window.addEventListener("resize", updateTermsPlacement);
    updateTermsPlacement();
  })();

  // ---------------- アセット読み込み ----------------
  const assets = {}; // name -> HTMLImageElement

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました: " + src));
      img.src = src;
    });
  }

  async function loadAllAssets() {
    const data = window.__ASSET_DATA__;
    if (!data) throw new Error("assets-data.js が読み込まれていません。");
    const keys = ["textbox", "nameBox", "linesBox", "skip", "log", "auto", "next", "scroll"];
    await Promise.all(
      keys.map(async (key) => {
        if (!data[key]) throw new Error("素材が見つかりません: " + key);
        assets[key] = await loadImage(data[key]);
      })
    );
    // 共有の<video>ではなく、データURI文字列のまま保持する — 退去エフェクトを
    // ONにしたキャラクターはそれぞれ自分専用の<video>を持つ
    // （getDepartureVideoEl参照）。<video>は一度に1つの時刻にしかシークできず、
    // 複数のキャラクターが同時に別々の進行度で退去している可能性があるため。
    if (data.departureVideo) assets.departureVideoSrc = data.departureVideo;
    // タップエフェクトも同様にデータURIのまま保持する——シナリオ再生開始時に
    // 読み込み済みの<video>を複数用意して使い回す（ensureTapEffectPool参照）
    if (data.tapVideo) assets.tapVideoSrc = data.tapVideo;
  }

  async function loadFont() {
    const dataUri = window.__FONT_DATA__;
    if (!dataUri) {
      console.warn("font-data.js が見つかりません。代替フォントで表示します。");
      return;
    }
    try {
      const font = new FontFace("GenEiLateMin", "url(" + dataUri + ")");
      const loaded = await font.load();
      document.fonts.add(loaded);
    } catch (err) {
      // 静かにsans-serifへフォールバックする — フォントファイルが直るまで
      // 独自書体は使えないが、ツール自体は問題なく動作する。
      console.warn("フォントの読み込みに失敗しました。代替フォントで表示します。", err);
    }
  }

  // ---------------- 背景まわりのヘルパー ----------------
  function addBackgroundFromFile(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const bg = {
        id: nextBgId++,
        img,
        name: file.name.replace(/\.[^.]+$/, ""),
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        zoom: 1,  // 自動「カバー」フィットに対する倍率 — 1が読み込み直後のちょうど良い位置
        panX: 0,  // 元画像ピクセル単位のクロップ窓オフセット、範囲内にクランプされる
        panY: 0,
        colorMode: "none", // "none" | "grayscale" | "sepia"
      };
      state.backgrounds.push(bg);
      state.activeBackgroundId = bg.id;
      renderBgList();
      renderBgEditor();
      renderAll();
    };
    img.src = url;
  }

  function getActiveBackground() {
    return state.activeBackgroundId != null
      ? state.backgrounds.find((b) => b.id === state.activeBackgroundId)
      : null;
  }

  function removeBackground(id) {
    state.backgrounds = state.backgrounds.filter((b) => b.id !== id);
    if (state.activeBackgroundId === id) {
      const last = state.backgrounds[state.backgrounds.length - 1];
      state.activeBackgroundId = last ? last.id : null;
    }
    renderBgList();
    renderBgEditor();
    renderAll();
  }

  // ---------------- キャラクターまわりのヘルパー ----------------
  function addCharacterFromFile(file) {
    if (state.characters.length >= MAX_CHARACTERS) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const targetH = CANVAS_H * 0.92;
      const scale = targetH / img.naturalHeight;
      const character = {
        id: nextCharId++,
        img,
        name: file.name.replace(/\.[^.]+$/, ""),
        x: CANVAS_W * 0.5, // 中央がデフォルト位置。並べたい場合は「表示中のキャラを等間隔に並べる」ボタンで調整する
        y: CANVAS_H * 0.5,
        scale,
        flipX: false,
        silhouette: false,
        hologram: false,
        grayscale: false,
        visible: true, // シーンへの登場/退場そのものを切り替えるON/OFF。透明度スライダーとは別物
        opacity: 100, // 0-100。表示中（visible）の間のフェード具合を決める
        edgeFadeAmount: 0, // 0-100。有効な各辺からどこまでフェードが届くか
        edgeFadeTop: false,
        edgeFadeBottom: false,
        edgeFadeLeft: false,
        edgeFadeRight: false,
        // サーヴァント退去エフェクト（drawDepartureEffect参照）— デフォルトはOFF。
        // departureProgressは、重ねる動画の再生位置と、キャラクターが上から
        // どれだけフェードしているかの両方を、1つのスクラブ可能な効果として
        // 同時に駆動する
        departureEnabled: false,
        departureProgress: 0, // 0-100
        departureOffsetX: 0, // デフォルトの中央位置からの微調整
        departureOffsetY: 0,
        departureScale: 1, // デフォルトの「立ち絵の高さに一致」サイズに対する倍率
        departureFadeStart: DEPARTURE_FADE_START_DEFAULT, // フェードが始まる進行度%
        departureFadeEnd: DEPARTURE_FADE_END_DEFAULT, // フェードが完了する進行度%
        departureHue: 0, // 動画への色相回転（度）。0が現在のデフォルトの色合い
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        // 本体＋差分表情のグリッドを1枚にまとめたFGO形式のシート用
        // （makeDefaultExprSheet参照）
        exprSheet: makeDefaultExprSheet(img.naturalWidth, img.naturalHeight),
        activeExpr: -1, // -1 = 本体に焼き込まれた顔をそのまま使う
      };
      // 別途の全身差分画像（exprSheetの単一画像・顔クロップのグリッドとは異なり、
      // 別ポーズ・別衣装などの画像丸ごとの差分）— このアップロードが
      // variants[0]になり、上のimg/naturalW/naturalH/exprSheet/activeExprは
      // 常に現在アクティブなバリアントを反映する（switchCharacterVariant参照）。
      // x/y/scaleはキャラクター自身で共有されたまま — 移動/リサイズすると
      // すべてのバリアントが一緒に動く — 一方offsetX/offsetY/scaleAdjustは
      // 各バリアント固有の小さな補正で、その共有された配置の上から、
      // 別々にアップロードされた差分同士のわずかなズレを吸収する
      // （getEffectiveX/Y/Scale参照）。
      character.variants = [
        {
          img: character.img,
          name: "オリジナル",
          naturalW: character.naturalW,
          naturalH: character.naturalH,
          exprSheet: character.exprSheet,
          activeExpr: character.activeExpr,
          offsetX: 0,
          offsetY: 0,
          scaleAdjust: 1,
        },
      ];
      character.activeVariantIndex = 0;
      state.characters.push(character);
      state.selectedId = character.id;
      renderCharList();
      renderCharEditor();
      syncSpeakerFromFrontChar();
      renderAll();
    };
    img.src = url;
  }

  // 「表示中のキャラを等間隔に並べる」ボタンの実体。自動では発動せず、
  // 明示的にボタンを押したときだけ、現在“表示”がONになっているキャラ
  // （非表示中のキャラは対象外）だけを対象に、各キャラの中心点Xを画面
  // 中央を軸に左右対称・等間隔に並べ直す。2人なら中央から左右対称に、
  // 3人なら真ん中の1人を挟んで等間隔に、というイメージ。Y座標や個別の
  // 調整（表情/差分/エフェクト等）、非表示中のキャラの位置には触れない。
  function reflowVisibleCharacterSlotsX() {
    const visibleChars = state.characters.filter((c) => c.visible !== false);
    const n = visibleChars.length;
    if (n === 0) return;
    const pitch = n > 1 ? Math.min(CHAR_SLOT_PITCH, 0.8 / (n - 1)) : 0;
    visibleChars.forEach((c, i) => {
      const offset = (i - (n - 1) / 2) * pitch;
      c.x = CANVAS_W * (0.5 + offset);
    });
    renderCharEditor();
    renderAll();
  }

  function getCharacter(id) {
    return state.characters.find((c) => c.id === id);
  }

  // 選択（＝操作対象）を切り替える。話者名連動がONのときは、選択＝
  // 「今喋っているキャラ」とみなし、z順序の最前面へ自動的に移動する
  // ——手動でレイヤー最前面ボタンを押さなくても、キャラを選ぶだけで
  // 前面に出て話者名にも反映されるようにするため（syncSpeakerFromFrontChar
  // 経由）。連動OFFのときはz順序に手を出さない。
  function setSelectedCharacter(id) {
    state.selectedId = id;
    if (id == null || !state.speakerLinkToChar) return;
    const idx = state.characters.findIndex((c) => c.id === id);
    if (idx === -1 || idx === state.characters.length - 1) return;
    const [c] = state.characters.splice(idx, 1);
    state.characters.push(c);
  }

  // シナリオ再生中、行が切り替わってキャラの表示状態（登場/退場）や
  // 不透明度が変わった瞬間に、瞬時に切り替えるのではなくこの時間で
  // 滑らかにフェードさせる——画面上でキャラが入れ替わるときに見た目が
  // カクつかないようにするため。通常編集中（再生していない間）は
  // アニメーションが一切開始されないため、この定数は影響しない。
  const CHARACTER_FADE_MS = 300;

  // c.opacity/c.visibleそのもの（＝行に保存される「目標値」）ではなく、
  // 実際に今描画すべき不透明度（0-100）を返す——シナリオ再生中に
  // applyScenarioLineが目標値を変えた直後は、_opacityAnimFrom/
  // _opacityAnimStartTimeを使って滑らかに追従する。アニメーションが
  // 開始されていないキャラ（通常編集中は常にこちら）は目標値をそのまま返す。
  function getCharacterDisplayOpacity(c) {
    const target = c.visible !== false ? c.opacity : 0;
    if (c._opacityAnimStartTime == null) return target;
    const t = Math.min(1, (performance.now() - c._opacityAnimStartTime) / CHARACTER_FADE_MS);
    return c._opacityAnimFrom + (target - c._opacityAnimFrom) * t;
  }

  // シナリオ再生中に背景（activeBackgroundId）が切り替わった瞬間、瞬時に
  // 切り替えるのではなくこの時間でクロスフェードさせる——立ち絵の
  // フェードと同じ考え方。通常編集中は開始されない。
  const BACKGROUND_FADE_MS = 400;
  // { fromBg, startTime } — fromBgは切り替わる直前に表示されていた背景
  // （「背景未設定」だった場合はnull）。applyScenarioLine側で背景の目標が
  // 変わった瞬間にセットする。
  let bgTransitionAnim = null;

  // 現在進行中の背景クロスフェードの進捗を返す（0=直前の背景、1=新しい
  // 背景）。完了済み、またはそもそもアニメ中でなければnull。
  function getBackgroundTransitionProgress() {
    if (!bgTransitionAnim) return null;
    const t = (performance.now() - bgTransitionAnim.startTime) / BACKGROUND_FADE_MS;
    if (t >= 1) {
      bgTransitionAnim = null;
      return null;
    }
    return { t, fromBg: bgTransitionAnim.fromBg };
  }

  // 「表示状態」ボタン（削除ボタンの隣）と透明度スライダーは別物——前者は
  // シーンへの登場/退場そのものを切り替えるON/OFF、後者はそのキャラが
  // 表示されている間のフェード具合を決める数値。どちらか一方でも満たさ
  // なければ、そのキャラは当たり判定・暗転判定（誰が最前面/話者か）から
  // 除外される。c.visibleが未定義（古い保存データ等）の場合は表示中扱い。
  //
  // ここは目標値（c.opacity/c.visible）基準のまま——フェード中の見た目上の
  // 不透明度（getCharacterDisplayOpacity）を基準にしてしまうと、フェード
  // インし始めたばかりの新しい最前面キャラがまだ「不透明度ほぼ0」の間
  // resolveFrontIndexに拾われず、話者名/暗転対象の判定が一瞬ずれてしまう
  // ため。実際の描画（drawScene）だけは、フェードアウトの尾を最後まで
  // 見せる必要があるので、こちらではなくgetCharacterDisplayOpacity()を
  // 直接使って描画の可否を決めている。
  function isCharacterVisible(c) {
    return c.visible !== false && c.opacity > 0;
  }

  // 「誰が最前面（＝発話中）か」の判定を1箇所にまとめたもの。通常はz順序で
  // 一番手前の表示中キャラだが、シナリオ再生中はstate.activeCharIdで
  // 明示的に上書きできる（該当キャラが削除済み/非表示なら通常のz順序に
  // フォールバックする）。drawSceneの暗転処理・renderCharListのアクティブ
  // 表示・getFrontmostCharacterの3箇所全てがこれを呼ぶことで、シナリオ
  // 再生中も常に一致した結果になる。
  function resolveFrontIndex() {
    if (state.activeCharId != null) {
      const idx = state.characters.findIndex((c) => c.id === state.activeCharId && isCharacterVisible(c));
      if (idx !== -1) return idx;
    }
    for (let i = state.characters.length - 1; i >= 0; i--) {
      if (isCharacterVisible(state.characters[i])) return i;
    }
    return -1;
  }

  // 最前面の「表示中」キャラクター — 非アクティブな話者を暗くするのと
  // 同じ考え方なので、「誰が手前にいるか」と「誰が話しているか」が
  // 常に一致するようになっている
  function getFrontmostCharacter() {
    const idx = resolveFrontIndex();
    return idx === -1 ? null : state.characters[idx];
  }

  // 連動がONのとき、state.speakerを最前面キャラクターの名前に追従させ続ける
  // — OFFのときは何もしない（呼び出しコストも低いので無条件に呼んでよい）。
  // これにより、最前面キャラクターが変わりうる箇所はすべて、条件を
  // 自前で追跡するのではなくこの関数を呼ぶだけで済む。
  function syncSpeakerFromFrontChar() {
    if (!state.speakerLinkToChar) return;
    const front = getFrontmostCharacter();
    state.speaker = front ? front.name || "" : "";
    speakerInput.value = state.speaker;
    renderAll();
  }

  function removeCharacter(id) {
    state.characters = state.characters.filter((c) => c.id !== id);
    if (state.selectedId === id) {
      // 新しい最前面キャラクターを自動選択することで、連続で削除しても
      // その都度リストから選び直す必要がないようにする
      const last = state.characters[state.characters.length - 1];
      state.selectedId = last ? last.id : null;
    }
    renderCharList();
    renderCharEditor();
    syncSpeakerFromFrontChar();
    renderAll();
  }

  function moveLayer(id, dir) {
    const i = state.characters.findIndex((c) => c.id === id);
    if (i === -1) return;
    const j = i + dir;
    if (j < 0 || j >= state.characters.length) return;
    const tmp = state.characters[i];
    state.characters[i] = state.characters[j];
    state.characters[j] = tmp;
    renderCharList();
    renderCharEditor();
    syncSpeakerFromFrontChar();
    renderAll();
  }

  // キャラクターの現在表示中の画像/exprSheetの状態を、c.variants内の
  // 自分自身のスロットへ書き戻す — アクティブでなくなる（切り替わる）前に
  // 呼ぶことで、アクティブだった間の編集内容（activeExpr、exprSheetの調整）が
  // 次にまた切り替えて戻ってきたときに失われないようにする。
  function syncActiveVariant(c) {
    const v = c.variants[c.activeVariantIndex];
    v.img = c.img;
    v.naturalW = c.naturalW;
    v.naturalH = c.naturalH;
    v.exprSheet = c.exprSheet;
    v.activeExpr = c.activeExpr;
  }

  // バリアント`index`をキャラクターの表示フィールドへ読み込む。x/y/scaleは
  // ここでは触らない — 全バリアントで共有されているので（getEffectiveX/Y/Scale
  // 参照）、どのポーズを表示するか切り替えてもキャラクターが動いたり
  // サイズが変わったりすることはない。
  function activateVariant(c, index) {
    const next = c.variants[index];
    c.activeVariantIndex = index;
    c.img = next.img;
    c.naturalW = next.naturalW;
    c.naturalH = next.naturalH;
    c.exprSheet = next.exprSheet;
    c.activeExpr = next.activeExpr;
  }

  function switchCharacterVariant(c, index) {
    if (index < 0 || index >= c.variants.length || index === c.activeVariantIndex) return;
    syncActiveVariant(c);
    activateVariant(c, index);
    renderCharList();
    renderCharEditor();
    renderAll();
  }

  // ---------------- シナリオの行（スナップショット） ----------------
  // 現在のライブ状態（話者・台詞・発話中キャラ・各キャラの表情/差分/表示
  // 状態）から、新しい行オブジェクトを作る。既存の行を上書きするときも
  // （updateScenarioLineFromLiveStateから）同じロジックを使い回す。
  function buildScenarioLineFromLiveState(id) {
    const chars = state.characters.map((c) => {
      syncActiveVariant(c); // その場の編集内容をアクティブな差分スロットへ反映してからスナップショットする
      return {
        charId: c.id,
        // 位置・拡縮も行ごとに保存する——以前は全シーン共通の1値しか
        // 持たなかったため、同じキャラが複数の場面に出る場合に位置を
        // 使い分けられなかった
        x: c.x,
        y: c.y,
        scale: c.scale,
        activeExpr: c.activeExpr,
        activeVariantIndex: c.activeVariantIndex,
        visible: c.visible !== false,
        opacity: c.opacity,
        // 退去エフェクトの状態も丸ごとスナップショットする——この行に
        // ONのキャラが1人でもいれば「退去エフェクト再生行」として扱う
        // （lineHasDeparture参照）
        departureEnabled: !!c.departureEnabled,
        departureProgress: c.departureProgress,
        departureOffsetX: c.departureOffsetX,
        departureOffsetY: c.departureOffsetY,
        departureScale: c.departureScale,
        departureFadeStart: c.departureFadeStart,
        departureFadeEnd: c.departureFadeEnd,
        departureHue: c.departureHue,
      };
    });
    const front = getFrontmostCharacter();
    // 背景のズーム/位置/色調も行ごとに保存する——以前は背景アセットその
    // ものに1組しか持たなかったため、同じ背景画像を複数の場面で使い回すと
    // 構図を使い分けられなかった（背景が「未設定」の行ではnullのまま）
    const activeBg = getActiveBackground();
    return {
      id,
      speaker: state.speaker,
      body: state.body,
      activeCharId: front ? front.id : null,
      nameplateOn: state.nameplateOn,
      fontSize: state.fontSize,
      textColor: state.textColor,
      activeBackgroundId: state.activeBackgroundId,
      backgroundZoom: activeBg ? activeBg.zoom : null,
      backgroundPanX: activeBg ? activeBg.panX : null,
      backgroundPanY: activeBg ? activeBg.panY : null,
      backgroundColorMode: activeBg ? activeBg.colorMode : null,
      sceneColorMode: state.sceneColorMode,
      chars,
      showChoices: state.showChoices,
      choiceCount: state.choiceCount,
      choice1: state.choice1,
      choice2: state.choice2,
      choice3: state.choice3,
      choice1Color: state.choice1Color,
      choice2Color: state.choice2Color,
      choice3Color: state.choice3Color,
    };
  }

  // ユーザーが自分で追加した「実質的な」行が1つでも残っているか
  // （「シナリオ開始」「シナリオ終了」の特殊行自体は数えない）。
  function hasRealScenarioLines() {
    return state.scenario.some((l) => !l.isStartingFade && !l.isEndingFade);
  }

  // 「シナリオ開始」「シナリオ終了」の特殊行を除いた、実質的な行だけの並び。
  // BGMの再生範囲（開始行〜終了行）や並び替えパネルの先頭/末尾判定など、
  // 「N行目」という数え方をする箇所はすべてこれを基準にする。
  function getRealScenarioLines() {
    return state.scenario.filter((l) => !l.isStartingFade && !l.isEndingFade);
  }

  // 行に登場するキャラのうち、退去エフェクトがONのキャラが1人でもいるか
  // ——このタイプの行は「退去エフェクト再生行」として特別に扱う
  // （goToScenarioLine・drawScene参照）。isStartingFade/isEndingFadeの
  // 特殊行にはchars自体が無いため、その場合は必ずfalseになる。
  function lineHasDeparture(line) {
    return !!(line && line.chars && line.chars.some((s) => s.departureEnabled));
  }

  // シナリオ一覧・ステータス表示の両方で使う「行の要約」を1箇所にまとめる
  // ——退去エフェクト再生行・選択肢を表示している行は、話者/本文の代わりに
  // それと分かる説明を返す（renderScenarioList参照）。isStartingFade/
  // isEndingFadeの特殊行は呼び出し側であらかじめ弾いておくこと。
  function summarizeScenarioLine(line) {
    if (line.isSceneTransition) {
      return { title: "場面転換", body: "暗転を挟んで次のシーンへ切り替えます" };
    }
    const isDeparture = lineHasDeparture(line);
    const departingNames = isDeparture
      ? line.chars
          .filter((s) => s.departureEnabled)
          .map((s) => {
            const c = getCharacter(s.charId);
            return (c && c.name) || "（削除済みキャラ）";
          })
      : [];
    const title = isDeparture
      ? departingNames.join("、")
      : line.showChoices
      ? "選択肢"
      : line.nameplateOn === false
      ? "表示なし"
      : line.speaker || "（話者なし）";
    const body = isDeparture
      ? "退去演出"
      : line.showChoices
      ? line.choice1 || "（選択肢1未入力）"
      : line.body || "（本文なし）";
    return { title, body };
  }

  // 「シナリオ開始」の特殊行。他の行と同じくstate.scenario配列で管理する
  // が、ライブ状態のスナップショットは持たない（isStartingFade:trueのみ）。
  // 呼ぶたびに、既存の物があれば一旦取り除いて（enabled設定とidは保持）、
  // 実質的な行が1つ以上残っていれば必ず先頭へ付け直す——無ければ追加しない。
  function ensureStartingFadeLine() {
    const idx = state.scenario.findIndex((l) => l.isStartingFade);
    let startingLine = idx !== -1 ? state.scenario.splice(idx, 1)[0] : null;
    if (!hasRealScenarioLines()) return;
    if (!startingLine) {
      startingLine = { id: nextScenarioLineId++, isStartingFade: true, enabled: true };
    }
    state.scenario.unshift(startingLine);
  }

  // 「シナリオ終了（暗転）」の特殊行。仕組みはensureStartingFadeLineと同じ
  // だが、末尾に付け直す点だけが異なる。
  function ensureEndingFadeLine() {
    const idx = state.scenario.findIndex((l) => l.isEndingFade);
    let endingLine = idx !== -1 ? state.scenario.splice(idx, 1)[0] : null;
    if (!hasRealScenarioLines()) return;
    if (!endingLine) {
      endingLine = { id: nextScenarioLineId++, isEndingFade: true, enabled: true };
    }
    state.scenario.push(endingLine);
  }

  // 並び替え・追加・削除・読み込みの後に必ず呼ぶことで、開始行が常に
  // 先頭に1つだけ、終了行が常に最後尾に1つだけあることを保証する。
  function ensureSpecialScenarioLines() {
    ensureStartingFadeLine();
    ensureEndingFadeLine();
  }

  // 選択中の行があれば、その直後に挿入する——無ければ（未選択なら）末尾に
  // 追加する。開始/終了の特殊行は選択され得ないので、ここでの
  // selectedIndexは常に実質的な行を指す。行を新規追加する全箇所
  // （captureScenarioLine・addBlankScenarioLine・addSceneTransitionLine）で
  // 共通の挿入ロジックとして使う。
  function insertScenarioLineAtSelection(line) {
    const selectedIndex = state.scenario.findIndex((l) => l.id === state.scenarioSelectedId);
    if (selectedIndex === -1) {
      state.scenario.push(line);
    } else {
      state.scenario.splice(selectedIndex + 1, 0, line);
    }
    state.scenarioSelectedId = line.id;
    ensureSpecialScenarioLines();
    renderScenarioList();
    renderScenarioEditor();
    renderBgmList(); // 実質的な行数が変わったので、BGMの範囲セレクトの選択肢も更新する
  }

  function captureScenarioLine() {
    const line = buildScenarioLineFromLiveState(nextScenarioLineId++);
    insertScenarioLineAtSelection(line);
  }

  // 「新規シーンを追加」——立ち絵・背景とも何も表示されていない、完全に
  // 空の状態の行を作る。buildScenarioLineFromLiveStateと違い現在の
  // ライブ状態を一切コピーしない——chars:[]（誰のスナップショットも
  // 持たない）にすることで、行の適用時に全キャラが自動的に非表示扱いに
  // なる（applyScenarioLine参照）。
  function buildBlankScenarioLine(id) {
    return {
      id,
      speaker: "",
      body: "",
      activeCharId: null,
      nameplateOn: true,
      fontSize: BODY_DEFAULT_FONT_SIZE,
      textColor: "#ffffff",
      activeBackgroundId: null,
      sceneColorMode: "none",
      chars: [],
      showChoices: false,
      choiceCount: 2,
      choice1: "",
      choice2: "",
      choice3: "",
      choice1Color: "#ffffff",
      choice2Color: "#ffffff",
      choice3Color: "#ffffff",
    };
  }

  function addBlankScenarioLine() {
    const line = buildBlankScenarioLine(nextScenarioLineId++);
    insertScenarioLineAtSelection(line);
    // 追加した空のシーンを即座にプレビューへ反映する——今の画面をそのまま
    // 使うcaptureScenarioLineと違い、これは今の画面と中身が違うため
    applyScenarioLine(line);
  }

  // 「場面転換」——暗転を挟んで次のシーンへ切り替える特殊行。シナリオ開始/
  // 終了と違い先頭/末尾には固定されず、通常の行と同じように途中への
  // 挿入・削除・並び替えができる（moveScenarioLine/removeScenarioLineの
  // ガードはisStartingFade/isEndingFadeだけを見ているので、この行は
  // そのまま対象になる）。ライブ状態のスナップショット（chars等）は
  // 持たない——再生時はgoToScenarioLineが暗転演出とともに特別に処理する
  // （applyScenarioLineは呼ばれない）ため、追加してもプレビューは変化しない。
  function addSceneTransitionLine() {
    const line = { id: nextScenarioLineId++, isSceneTransition: true };
    insertScenarioLineAtSelection(line);
  }

  function updateScenarioLineFromLiveState(line) {
    const fresh = buildScenarioLineFromLiveState(line.id);
    Object.assign(line, fresh);
    renderScenarioList();
    renderScenarioEditor();
    renderBgmList(); // 行のプレビュー文言（BGMセレクトの選択肢ラベル）が変わりうるため
  }

  // 保存済みの行を現在のライブ状態へ反映する（シナリオパネルで行をクリック
  // したとき、および再生中に各行へ進むときの両方から呼ばれる）。
  function applyScenarioLine(line) {
    state.activeCharId = line.activeCharId;
    line.chars.forEach((snap) => {
      const c = getCharacter(snap.charId);
      if (!c) return; // 削除済みキャラへの参照は黙って無視する
      if (snap.activeVariantIndex !== c.activeVariantIndex) {
        switchCharacterVariant(c, snap.activeVariantIndex);
      }
      // switchCharacterVariantは直前にその差分がアクティブだった時の表情を
      // 復元してしまうため、行が指定する表情で必ず上書きする
      c.activeExpr = snap.activeExpr;
      c.variants[c.activeVariantIndex].activeExpr = snap.activeExpr;
      // 位置・拡縮も行ごとに復元する。この機能追加より前に保存された行には
      // x/y/scaleが無いので、その場合は「これが正解」という値が無い以上
      // 現在の位置を変えずに保つ（背景のズーム/位置と同じ考え方）
      if (typeof snap.x === "number") c.x = snap.x;
      if (typeof snap.y === "number") c.y = snap.y;
      if (typeof snap.scale === "number") c.scale = snap.scale;
      // シナリオ再生中に限り、表示状態/不透明度の目標が変わった瞬間を
      // 検知してフェードを開始する——現在実際に見えている（アニメ中かも
      // しれない）不透明度を起点にすることで、フェードの途中でさらに
      // 別の行へ切り替わっても不自然にジャンプしない。通常編集中（行を
      // クリックして内容を読み込むだけの場合）は今まで通り即座に反映する。
      if (playback) {
        const newTarget = snap.visible !== false ? snap.opacity : 0;
        const currentDisplay = getCharacterDisplayOpacity(c);
        if (currentDisplay !== newTarget) {
          c._opacityAnimFrom = currentDisplay;
          c._opacityAnimStartTime = performance.now();
        }
      }
      c.visible = snap.visible !== false;
      c.opacity = snap.opacity;
      c.departureEnabled = !!snap.departureEnabled;
      c.departureProgress = snap.departureProgress;
      c.departureOffsetX = snap.departureOffsetX;
      c.departureOffsetY = snap.departureOffsetY;
      c.departureScale = snap.departureScale;
      c.departureFadeStart = snap.departureFadeStart;
      c.departureFadeEnd = snap.departureFadeEnd;
      c.departureHue = snap.departureHue;
    });
    // 行を作った後に追加されたキャラなど、この行のスナップショットに
    // 含まれていないキャラは「この場面には登場しない」ものとして非表示に
    // する——各行が完結した状態を持つようにするため。これをしないと、
    // 後から追加したキャラが常に「現在の生の表示状態」のまま出続けてしまい、
    // 古い行を見返しても意図通りに隠れない（さらに、その行を更新すると
    // その中途半端な状態がそのまま書き込まれてしまう）。
    const snapshotCharIds = new Set(line.chars.map((snap) => snap.charId));
    state.characters.forEach((c) => {
      if (snapshotCharIds.has(c.id)) return;
      if (playback) {
        const currentDisplay = getCharacterDisplayOpacity(c);
        if (currentDisplay !== 0) {
          c._opacityAnimFrom = currentDisplay;
          c._opacityAnimStartTime = performance.now();
        }
      }
      c.visible = false;
    });
    // line.charsの並び順＝キャプチャ時のz順序（buildScenarioLineFromLiveStateが
    // state.charactersをそのままmapして作っているため）。行を適用する際に
    // 表示順（重なり順）も一緒に復元する。行に存在しない現在のキャラ
    // （行を作った後で追加されたキャラ等）は、元の相対順を保ったまま
    // 末尾（＝最前面側）へ残す。
    const orderedIds = line.chars.map((snap) => snap.charId);
    state.characters.sort((a, b) => {
      const ai = orderedIds.indexOf(a.id);
      const bi = orderedIds.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    if (state.speakerLinkToChar) {
      syncSpeakerFromFrontChar(); // resolveFrontIndex経由で今設定したactiveCharIdを尊重する
    } else {
      state.speaker = line.speaker;
      speakerInput.value = state.speaker;
    }
    state.body = line.body;
    bodyInput.value = state.body;

    state.nameplateOn = line.nameplateOn !== false;
    nameplateToggle.checked = state.nameplateOn;

    // 他のフィールド（nameplateOn等）と同じく、古い保存データ（この機能追加
    // 前に作られた行）にはfontSize/textColorが無いので、その場合はデフォルト
    // 値にする——「今表示中の値を保つ」にすると、行を切り替えても数値上は
    // 変わったままになり「選択した行の設定に切り替わらない」ことになるため
    state.fontSize = typeof line.fontSize === "number" ? line.fontSize : BODY_DEFAULT_FONT_SIZE;
    fontSizeInput.value = state.fontSize;
    document.getElementById("fontSizeNumber").value = state.fontSize;
    state.textColor = typeof line.textColor === "string" ? line.textColor : "#ffffff";
    textColorInput.value = state.textColor;

    // 背景は他の項目と違い「これが正解」というデフォルト値が無いため、行に
    // 記録が無い（この機能追加前の行）、または該当背景が削除済みの場合は、
    // 現在表示中の背景を変えずに保つ——背景が1枚も登録されていなければ
    // 「未設定」だけが唯一あり得る状態なので、この場合も自然と一致する
    if (state.backgrounds.some((b) => b.id === line.activeBackgroundId)) {
      // シナリオ再生中に背景が実際に変わる場合だけ、切り替わる直前の背景を
      // 起点にクロスフェードを始める（通常編集中のクリックでは即座に切り替える）
      if (playback && line.activeBackgroundId !== state.activeBackgroundId) {
        bgTransitionAnim = { fromBg: getActiveBackground(), startTime: performance.now() };
      }
      state.activeBackgroundId = line.activeBackgroundId;
    }
    // ズーム/位置/色調も行ごとに復元する（背景アセット自身の共有プロパティを
    // 上書きする——キャラのopacity/departure等と同じ「共有オブジェクトを
    // 行ごとに書き換える」方式）。この機能追加より前に保存された行には
    // これらのフィールドが無いので、その場合は現在の値を変えずに保つ
    // （zoom/panには「これが正解」という値が無いため、activeBackgroundId
    // と同じ考え方）。
    const activeBg = getActiveBackground();
    if (activeBg) {
      if (typeof line.backgroundZoom === "number") activeBg.zoom = line.backgroundZoom;
      if (typeof line.backgroundPanX === "number") activeBg.panX = line.backgroundPanX;
      if (typeof line.backgroundPanY === "number") activeBg.panY = line.backgroundPanY;
      if (typeof line.backgroundColorMode === "string") activeBg.colorMode = line.backgroundColorMode;
    }
    renderBgList();
    renderBgEditor();

    // シーン全体の色調は行ごとに変わる演出（回想シーンのセピア化等）なので、
    // fontSize/textColorと同じくデフォルト値（"none"）へ確実に切り替える
    applySceneColorMode(typeof line.sceneColorMode === "string" ? line.sceneColorMode : "none");

    state.showChoices = line.showChoices;
    choicesToggle.checked = state.showChoices;
    applyChoiceCount(line.choiceCount);
    state.choice1 = line.choice1;
    state.choice2 = line.choice2;
    state.choice3 = line.choice3;
    choice1Input.value = state.choice1;
    choice2Input.value = state.choice2;
    choice3Input.value = state.choice3;
    state.choice1Color = line.choice1Color;
    state.choice2Color = line.choice2Color;
    state.choice3Color = line.choice3Color;
    choice1ColorInput.value = state.choice1Color;
    choice2ColorInput.value = state.choice2Color;
    choice3ColorInput.value = state.choice3Color;

    renderCharList();
    renderCharEditor();
    renderAll();
  }

  // BGMのフェードにかける時間（ms）。トラック間の切り替え・無音域への
  // 移行など、通常の途中乗り換え用。切り替わりの瞬間（次の行に進んだ
  // 瞬間、手動ならボタンを押した瞬間）に鳴らし始める設計なので、あまり
  // 長いと次の行の間まで尾を引いてしまう——短めにしている。シナリオ終了の
  // 暗転に合わせる場合だけ、呼び出し側でENDING_FADE_MSを渡す。
  const BGM_TRANSITION_FADE_MS = 350;

  // 指定した<audio>要素の音量を、現在値から0まで滑らかに下げてから一時停止
  // する。setIntervalベースなので、シナリオ再生のtickループ（rAF）とは
  // 独立して進む——一時停止・行送りで再生自体が止まっても後片付けは続く。
  // 既に別のフェードが進行中の同じ要素に対して呼ばれた場合は、その場の
  // 音量から仕切り直す（前のフェードを打ち切って重複させない）。
  // onComplete（省略可）は、フェードが最後まで完了した時にだけ呼ばれる
  // ——タイマーが別のフェード開始で打ち切られた場合は呼ばれない。
  function fadeOutBgmAudio(audio, durationMs, onComplete) {
    if (audio._bgmFadeTimer) {
      clearInterval(audio._bgmFadeTimer);
      audio._bgmFadeTimer = null;
    }
    const startVolume = audio.volume;
    const startTime = performance.now();
    audio._bgmFadeTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - startTime) / durationMs);
      audio.volume = startVolume * (1 - t);
      if (t >= 1) {
        clearInterval(audio._bgmFadeTimer);
        audio._bgmFadeTimer = null;
        audio.pause();
        audio.currentTime = 0;
        if (onComplete) onComplete();
      }
    }, 50);
  }

  // fadeOutBgmAudioと対になる、0からtargetVolumeまで滑らかに上げるフェードイン。
  // 何かが鳴っている状態から別のトラックへ切り替わる（クロスフェードする）
  // 場合にだけ使う——無音からの開始は今まで通り即座にtargetVolumeで鳴らす。
  function fadeInBgmAudio(audio, durationMs, targetVolume) {
    if (audio._bgmFadeTimer) {
      clearInterval(audio._bgmFadeTimer);
      audio._bgmFadeTimer = null;
    }
    const startTime = performance.now();
    audio._bgmFadeTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - startTime) / durationMs);
      audio.volume = targetVolume * t;
      if (t >= 1) {
        clearInterval(audio._bgmFadeTimer);
        audio._bgmFadeTimer = null;
      }
    }, 50);
  }

  // 現在の実質的な行に応じて、鳴らすべきBGMトラックへ切り替える。範囲が
  // 重ならない前提だったころの名残でfind()にしていた部分を、重なりを許す
  // 前提の選び方に変更している——同じ行を複数トラックが覆っている場合は、
  // 開始位置がより現在に近い（＝より新しく始まった）方を優先する。これに
  // より「1曲目の終わりと2曲目の始まりを同じ行に置く」＝切り替え演出、
  // という組み方ができる。
  //
  // 切り替えの検知は「今の行を覆うトラックが変わったかどうか」だけを見る
  // ——終了に設定した行そのものではまだ何もせず、次の行へ進んだ瞬間
  // （＝手動ならボタンを押した瞬間）に初めてフェードが始まる。終了行が
  // シナリオの最終行と一致する場合は、この仕組みでは変化が検知されない
  // （次の実質的な行が存在しない）ため、暗転（isEndingFade分岐）側で
  // 別途フェードさせている。
  //
  // 前のトラックが鳴っていた場合、フェードアウトが完全に終わる（無音＋
  // 一時停止まで完了する）のを待ってから次のトラックを鳴らし始める——
  // 同時にクロスフェードさせるのではなく、無音の一瞬を挟んで順番に
  // 入れ替える。次のトラックの開始自体はそのまま短くフェードインさせる。
  //
  // シナリオ再生中の行送り（goToScenarioLine）専用に呼ぶ——編集中に行を
  // クリックしただけで音が鳴り出すと驚かせてしまうため、applyScenarioLine
  // 本体からは呼ばない。
  function updateBgmPlaybackForLine(line) {
    const realLines = getRealScenarioLines();
    const idx = realLines.findIndex((l) => l.id === line.id);

    const candidates = idx === -1 ? [] : state.bgmTracks
      .map((t) => ({ t, range: resolveBgmRange(t, realLines) }))
      .filter((c) => c.range && idx >= c.range.start && idx <= c.range.end)
      .sort((a, b) => b.range.start - a.range.start);
    const track = candidates.length ? candidates[0].t : null;

    const prevTrack = playback.currentBgmTrack;
    if (track === prevTrack) return;
    playback.currentBgmTrack = track;

    const startTrack = (fadeIn) => {
      // その間にさらに別の行へ進んでいたら（この開始待ちが古くなって
      // いたら）、今さら鳴らし始めない——最新の切り替え処理に任せる
      if (playback.currentBgmTrack !== track || !track) return;
      if (track.audio._bgmFadeTimer) {
        clearInterval(track.audio._bgmFadeTimer);
        track.audio._bgmFadeTimer = null;
      }
      track.audio.currentTime = 0;
      if (fadeIn) {
        track.audio.volume = 0;
        track.audio.play().catch(() => {});
        fadeInBgmAudio(track.audio, BGM_TRANSITION_FADE_MS, track.volume);
      } else {
        track.audio.volume = track.volume;
        track.audio.play().catch(() => {}); // 自動再生ブロック等で失敗しても録画/再生自体は続行する
      }
    };

    if (prevTrack) {
      // 無音からの開始ではない（何かが鳴っていた）ので、次のトラックは
      // フェードアウト完了後にフェードインさせる
      fadeOutBgmAudio(prevTrack.audio, BGM_TRANSITION_FADE_MS, () => startTrack(true));
    } else if (track) {
      // 無音からの開始は今まで通り即座にフル音量で鳴らす
      startTrack(false);
    }
  }

  function moveScenarioLine(id, dir) {
    const i = state.scenario.findIndex((l) => l.id === id);
    // 開始行・終了行は常に先頭/最後尾に固定
    if (i === -1 || state.scenario[i].isEndingFade || state.scenario[i].isStartingFade) return;
    const j = i + dir;
    if (j < 0 || j >= state.scenario.length) return;
    [state.scenario[i], state.scenario[j]] = [state.scenario[j], state.scenario[i]];
    ensureSpecialScenarioLines(); // 特殊行と入れ替わってしまった場合に定位置へ戻す
    renderScenarioList();
    renderScenarioEditor();
    renderBgmList(); // 行の順序が変わるとBGMの範囲（開始/終了行の間）の意味も変わりうるため
  }

  function removeScenarioLine(id) {
    const target = state.scenario.find((l) => l.id === id);
    if (target && (target.isEndingFade || target.isStartingFade)) return; // 特殊行は削除できない（オンオフのみ）
    reconcileBgmRangesForLineRemoval(id); // 削除前に呼ぶ——前後の実質的な行がまだ参照できるうちに
    state.scenario = state.scenario.filter((l) => l.id !== id);
    if (state.scenarioSelectedId === id) state.scenarioSelectedId = null;
    ensureSpecialScenarioLines(); // 他の行が0になった場合は特殊行も取り除く
    renderScenarioList();
    renderScenarioEditor();
    renderBgmList();
  }

  // ---------------- BGM ----------------
  // トラックの開始/終了行idを、現在のシナリオ並び順における実質的な行の
  // インデックス（0始まり）に解決する。参照先の行が削除済みで見つからない
  // 場合は、開始側は先頭(0)、終了側は末尾へフォールバックする——「この行より
  // 前/後ろ全部」という意味に近く、範囲がいきなり消えてしまうよりは自然。
  // realLinesが空（実質的な行が1つも無い）ならnullを返す。
  function resolveBgmRange(track, realLines) {
    if (realLines.length === 0) return null;
    let startIdx = realLines.findIndex((l) => l.id === track.startLineId);
    let endIdx = realLines.findIndex((l) => l.id === track.endLineId);
    if (startIdx === -1) startIdx = 0;
    if (endIdx === -1) endIdx = realLines.length - 1;
    if (startIdx > endIdx) [startIdx, endIdx] = [endIdx, startIdx];
    return { start: startIdx, end: endIdx };
  }

  // track自身を除いた他のトラックの中に、指定した範囲（実質的な行の
  // インデックス、両端含む）と重なるものがあれば返す（無ければnull）。
  function findOverlappingBgmTrack(track, startIdx, endIdx) {
    const realLines = getRealScenarioLines();
    return (
      state.bgmTracks.find((other) => {
        if (other === track) return false;
        const range = resolveBgmRange(other, realLines);
        return range && startIdx <= range.end && range.start <= endIdx;
      }) || null
    );
  }

  function addBgmFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const audio = new Audio(reader.result);
      audio.loop = true;
      connectBgmTrackForRouting(audio);
      const realLines = getRealScenarioLines();
      const track = {
        id: nextBgmId++,
        name: file.name.replace(/\.[^.]+$/, ""),
        audio,
        volume: 1,
        // デフォルトは開始/終了の特殊行を除いた1〜n全体
        startLineId: realLines.length ? realLines[0].id : null,
        endLineId: realLines.length ? realLines[realLines.length - 1].id : null,
      };
      state.bgmTracks.push(track);
      renderBgmList();
    };
    reader.onerror = () => alert("BGMファイルの読み込みに失敗しました。");
    reader.readAsDataURL(file);
  }

  function removeBgmTrack(id) {
    const track = state.bgmTracks.find((t) => t.id === id);
    if (track) {
      track.audio.pause();
      if (playback && playback.currentBgmTrack === track) playback.currentBgmTrack = null;
    }
    state.bgmTracks = state.bgmTracks.filter((t) => t.id !== id);
    renderBgmList();
  }

  // 削除される行がいずれかのBGMトラックの開始/終了行として参照されている
  // 場合、その境界を隣の実質的な行へ詰める（開始側は次の行へ、終了側は
  // 前の行へ）——resolveBgmRangeのフォールバック（0/末尾）に落ちて範囲が
  // 突然全体に広がってしまうのを防ぐため。
  function reconcileBgmRangesForLineRemoval(id) {
    if (state.bgmTracks.length === 0) return;
    const realLines = getRealScenarioLines();
    const idx = realLines.findIndex((l) => l.id === id);
    if (idx === -1) return; // 特殊行、または既に実質的な行ではない
    const prevId = idx > 0 ? realLines[idx - 1].id : null;
    const nextId = idx < realLines.length - 1 ? realLines[idx + 1].id : null;
    state.bgmTracks.forEach((t) => {
      if (t.startLineId === id) t.startLineId = nextId;
      if (t.endLineId === id) t.endLineId = prevId;
    });
  }

  // ドラッグ中のBGMトラックid。wireCharDragHandle/wireScenarioDragHandleと
  // 同じ方式——並び順自体は再生ロジックに影響しない（優先順位は範囲の
  // 開始位置で決まる）が、一覧の見た目上の整理のために並び替えられる
  // ようにする。
  let bgmDragId = null;

  function wireBgmDragHandle(node, track) {
    const handle = node.querySelector(".charlist__drag-handle");
    handle.addEventListener("pointerdown", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      bgmDragId = track.id;
      node.classList.add("is-dragging");

      const onMove = (moveEvt) => {
        if (bgmDragId !== track.id) return;
        const items = Array.from(bgmList.children);
        for (const item of items) {
          if (item === node) continue;
          const rect = item.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (moveEvt.clientY < mid) {
            bgmList.insertBefore(node, item);
            return;
          }
        }
        bgmList.appendChild(node);
      };
      const onUp = () => {
        if (bgmDragId !== track.id) return;
        bgmDragId = null;
        node.classList.remove("is-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        const orderedIds = Array.from(bgmList.children).map((el) => Number(el.dataset.id));
        state.bgmTracks.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
        renderBgmList();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  }

  function renderBgmList() {
    bgmList.innerHTML = "";
    const realLines = getRealScenarioLines();
    state.bgmTracks.forEach((track) => {
      const node = bgmItemTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.id = String(track.id);
      node.querySelector(".charlist__name").textContent = track.name || "BGM";
      wireInlineRename(
        node,
        track.name || "BGM",
        (newName) => {
          track.name = newName;
          renderBgmList();
        },
        false
      );
      node.querySelector(".charlist__del").addEventListener("click", (e) => {
        e.stopPropagation();
        removeBgmTrack(track.id);
      });
      wireBgmDragHandle(node, track);

      const volumeRange = node.querySelector(".bgm-volume__range");
      const volumeValue = node.querySelector(".bgm-volume__value");
      const volumePct = Math.round((typeof track.volume === "number" ? track.volume : 1) * 100);
      volumeRange.value = String(volumePct);
      volumeValue.textContent = String(volumePct);
      volumeRange.addEventListener("input", (e) => {
        const pct = Number(e.target.value);
        track.volume = pct / 100;
        volumeValue.textContent = String(pct);
        // フェード中でなければ、鳴っていれば即座に反映する
        // （フェード中は完了時にtrack.volumeが改めて基準になる）
        if (!track.audio._bgmFadeTimer) track.audio.volume = track.volume;
      });

      const range = resolveBgmRange(track, realLines);
      const startSelect = node.querySelector('[data-role="start"]');
      const endSelect = node.querySelector('[data-role="end"]');
      realLines.forEach((line, i) => {
        const label = i + 1 + ". " + summarizeScenarioLine(line).title;
        const optStart = document.createElement("option");
        optStart.value = String(line.id);
        optStart.textContent = label;
        startSelect.appendChild(optStart);
        const optEnd = optStart.cloneNode(true);
        endSelect.appendChild(optEnd);
      });
      if (range) {
        startSelect.value = String(realLines[range.start].id);
        endSelect.value = String(realLines[range.end].id);
      }
      startSelect.disabled = endSelect.disabled = realLines.length === 0;

      // 範囲が他のBGMと重なっていてもブロックはしない——複数追加した際の
      // デフォルト（1〜n全体）同士は必ず重なるので、ブロックすると
      // どちらの範囲も動かせないデッドロックになってしまう。重なりは
      // has-overlap/警告表示で知らせるだけに留め、実際の重なり時の
      // 再生の扱いはupdateBgmPlaybackForLine側（開始が新しい方を優先）に任せる。
      const applyRangeChange = (which, newLineId) => {
        const newIdx = getRealScenarioLines().findIndex((l) => l.id === newLineId);
        if (newIdx === -1) return;
        if (which === "start") track.startLineId = newLineId;
        else track.endLineId = newLineId;
        renderBgmList();
      };
      startSelect.addEventListener("change", (e) => applyRangeChange("start", Number(e.target.value)));
      endSelect.addEventListener("change", (e) => applyRangeChange("end", Number(e.target.value)));

      const warning = node.querySelector(".bgm-range__warning");
      const overlapping = range && findOverlappingBgmTrack(track, range.start, range.end);
      node.classList.toggle("has-overlap", !!overlapping);
      warning.hidden = !overlapping;

      bgmList.appendChild(node);
    });
    bgmCount.textContent = String(state.bgmTracks.length);
  }

  function addVariantFromFile(c, file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      syncActiveVariant(c);
      const active = c.variants[c.activeVariantIndex];
      // オフセットは0（共有アンカーと同じ位置）から始まり、scaleAdjustは
      // 表示上の「高さ」が現在表示中のポーズと一致するように正規化する。
      // これにより、サイズの異なる画像を追加した瞬間に見た目が
      // 急に変わることがない — ズレが残っていればユーザーがそこから
      // 微調整すればよい。
      c.variants.push({
        img,
        name: file.name.replace(/\.[^.]+$/, ""),
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        exprSheet: makeDefaultExprSheet(img.naturalWidth, img.naturalHeight),
        activeExpr: -1,
        offsetX: 0,
        offsetY: 0,
        scaleAdjust: (active.scaleAdjust * c.naturalH) / img.naturalHeight,
      });
      activateVariant(c, c.variants.length - 1);
      renderCharList();
      renderCharEditor();
      renderAll();
    };
    img.src = url;
  }

  function removeVariant(c, index) {
    if (c.variants.length <= 1) return; // 画像は最低1枚は必ず残す
    const wasActive = index === c.activeVariantIndex;
    c.variants.splice(index, 1);
    if (wasActive) {
      activateVariant(c, Math.min(index, c.variants.length - 1));
    } else if (index < c.activeVariantIndex) {
      c.activeVariantIndex--;
    }
    renderCharList();
    renderCharEditor();
    renderAll();
  }

  // 典型的なFGO形式のシート（上に本体、下に差分の顔クロップのグリッド）に
  // 対する大まかな初期値の見積もり — enabled=falseがデフォルトなので、
  // 通常の単一ポーズのアップロードには影響しない。この数値は、
  // ユーザーが表情差分シートをONにしてプレビューを見ながら調整を
  // 始めて初めて意味を持つ。
  function makeDefaultExprSheet(naturalW, naturalH) {
    const rows = 3;
    const cols = 4;
    const gridY = Math.round(naturalH * 0.6);
    return {
      enabled: false,
      body: { x: 0, y: 0, w: naturalW, h: gridY },
      face: {
        x: Math.round(naturalW * 0.35),
        y: Math.round(naturalH * 0.05),
        w: Math.round(naturalW * 0.3),
        h: Math.round(naturalH * 0.15),
      },
      grid: {
        x: 0,
        y: gridY,
        // グリッド全体のサイズではなく、セル1個分のサイズ — 実際に
        // ユーザーが顔のサイズと合わせたいのはこちら
        cellW: Math.round((naturalW / cols) * 100) / 100,
        cellH: Math.round(((naturalH - gridY) / rows) * 100) / 100,
        rows,
        cols,
        count: 10,
      },
    };
  }

  // プロジェクトファイル（外部から読み込む任意のJSON）由来のexprSheetを
  // 安全な形に丸め込む。本体/顔/グリッドの各座標値はrenderCharEditor()の
  // テンプレートでvalue="${...}"のようにエスケープなしでinnerHTMLへ差し込む
  // ため、数値以外の値（文字列など）が紛れ込むとHTMLインジェクションに
  // つながる。信頼できない入力が入ってくる境界（プロジェクト読み込み時）で
  // 必ず有限の数値へ丸めることで、以降は数値であることを前提にできる。
  function sanitizeExprSheet(raw, naturalW, naturalH) {
    const def = makeDefaultExprSheet(naturalW, naturalH);
    const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
    const src = raw && typeof raw === "object" ? raw : {};
    const body = src.body && typeof src.body === "object" ? src.body : {};
    const face = src.face && typeof src.face === "object" ? src.face : {};
    const grid = src.grid && typeof src.grid === "object" ? src.grid : {};
    return {
      enabled: !!src.enabled,
      body: {
        x: num(body.x, def.body.x),
        y: num(body.y, def.body.y),
        w: num(body.w, def.body.w),
        h: num(body.h, def.body.h),
      },
      face: {
        x: num(face.x, def.face.x),
        y: num(face.y, def.face.y),
        w: num(face.w, def.face.w),
        h: num(face.h, def.face.h),
      },
      grid: {
        x: num(grid.x, def.grid.x),
        y: num(grid.y, def.grid.y),
        cellW: num(grid.cellW, def.grid.cellW),
        cellH: num(grid.cellH, def.grid.cellH),
        rows: num(grid.rows, def.grid.rows),
        cols: num(grid.cols, def.grid.cols),
        count: num(grid.count, def.grid.count),
      },
    };
  }

  // キャラクターの本体を描画する際の元画像上の矩形 — 表情差分シートが
  // 有効でなければ画像全体、有効な場合は立ち絵部分の範囲のみ
  // （下の差分の顔部分は除外される）。
  function spriteSourceRect(c) {
    if (c.exprSheet && c.exprSheet.enabled) return c.exprSheet.body;
    return { x: 0, y: 0, w: c.naturalW, h: c.naturalH };
  }

  function getExprCellRect(grid, index) {
    if (!grid || index < 0 || index >= grid.count || grid.rows < 1 || grid.cols < 1) return null;
    const cellW = grid.cellW;
    const cellH = grid.cellH;
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    return { x: grid.x + col * cellW, y: grid.y + row * cellH, w: cellW, h: cellH };
  }

  // キャラクターが実際に描画/当たり判定される位置：共有アンカー
  // （c.x/c.y/c.scale）に、現在アクティブなバリアント自身の小さな
  // offsetX/offsetY/scaleAdjust補正を加えたもの。共有アンカーを動かす/
  // リサイズする（ドラッグ、位置・拡大縮小パネル）と、補正値は一定のままなので
  // 全バリアントが一緒に動く — 補正自体を編集した場合（バリアントごとの
  // 微調整欄参照）だけ、そのバリアントだけが動く。
  function getEffectiveX(c) {
    return c.x + (c.variants[c.activeVariantIndex].offsetX || 0);
  }
  function getEffectiveY(c) {
    return c.y + (c.variants[c.activeVariantIndex].offsetY || 0);
  }
  function getEffectiveScale(c) {
    return c.scale * (c.variants[c.activeVariantIndex].scaleAdjust || 1);
  }

  function charBBox(c) {
    const src = spriteSourceRect(c);
    const scale = getEffectiveScale(c);
    const w = src.w * scale;
    const h = src.h * scale;
    return { left: getEffectiveX(c) - w / 2, top: getEffectiveY(c) - h / 2, w, h };
  }

  // ---------------- 描画 ----------------
  // 「カバー」フィット（中央クロップ）に、中央を保ったまま元画像をさらに
  // クロップする追加ズームと、ズーム後にクロップ窓をスライドさせるための
  // パンオフセット（元画像のピクセル単位）を組み合わせたもの —
  // zoom=1/pan=0が、画像を最初に読み込んだときに得られるちょうど良い
  // 自動フィット位置そのものなので、リセットすれば常にそこへ戻る。
  function getBackgroundFitRect(bg, w, h) {
    const scale = Math.max(w / bg.naturalW, h / bg.naturalH) * bg.zoom;
    const sw = w / scale;
    const sh = h / scale;
    const maxPanX = Math.max(0, (bg.naturalW - sw) / 2);
    const maxPanY = Math.max(0, (bg.naturalH - sh) / 2);
    return { scale, sw, sh, maxPanX, maxPanY };
  }

  function clampBackgroundPan(bg, w, h) {
    const { maxPanX, maxPanY } = getBackgroundFitRect(bg, w, h);
    bg.panX = Math.min(maxPanX, Math.max(-maxPanX, bg.panX));
    bg.panY = Math.min(maxPanY, Math.max(-maxPanY, bg.panY));
  }

  function drawBackgroundImage(context, bg, x, y, w, h) {
    const { sw, sh, maxPanX, maxPanY } = getBackgroundFitRect(bg, w, h);
    const panX = Math.min(maxPanX, Math.max(-maxPanX, bg.panX));
    const panY = Math.min(maxPanY, Math.max(-maxPanY, bg.panY));
    const sx = (bg.naturalW - sw) / 2 - panX;
    const sy = (bg.naturalH - sh) / 2 - panY;
    context.drawImage(bg.img, sx, sy, sw, sh, x, y, w, h);
  }

  // 元画像の一部領域を、同じサイズのキャンバスへ等倍（1:1、この段階では
  // 拡縮なし）でコピーする。共有シート画像の一部領域を*拡縮した*描画先へ
  // 直接描くと、ブラウザの縁のフィルタリングによって、その領域のすぐ外側
  // （隣のグリッドセルや背景など）がわずかに滲んで縁に混ざり込むことがある。
  // 先に領域だけを自前のキャンバスへ切り出しておけば（等倍・無補間の
  // コピーなので補間が発生しない）、後で拡縮して描画する際に、滲んでくる
  // 隣接スプライトの内容がそもそも存在しなくなる。
  function extractRegion(img, x, y, w, h) {
    const sw = Math.max(1, Math.round(w));
    const sh = Math.max(1, Math.round(h));
    const cv = document.createElement("canvas");
    cv.width = sw;
    cv.height = sh;
    cv.getContext("2d").drawImage(img, Math.round(x), Math.round(y), sw, sh, 0, 0, sw, sh);
    return cv;
  }

  // スプライトのキャンバスを青のデュオトーンに変換し、自身のアルファで
  // マスクしたかすかなスキャンラインを重ねる — 「ホログラム投影」風の見た目。
  // 単一のcompositeモードでは、画像の色相を変えつつ自身のアルファに
  // 制約するということが（下のシルエットのベタ塗り効果における
  // "source-atop"単体のようには）できないため、合成モードのトリックではなく
  // 生のピクセルデータを直接操作している。
  function applyHologramEffect(cv) {
    const ctx = cv.getContext("2d");
    const w = cv.width;
    const h = cv.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let p = 0; p < data.length; p += 4) {
      const gray = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      const t = Math.min(1, Math.max(0, (gray - HOLOGRAM_BLACK_POINT) / (HOLOGRAM_WHITE_POINT - HOLOGRAM_BLACK_POINT)));
      data[p] = HOLOGRAM_SHADOW_R + (HOLOGRAM_HIGHLIGHT_R - HOLOGRAM_SHADOW_R) * t;
      data[p + 1] = HOLOGRAM_SHADOW_G + (HOLOGRAM_HIGHLIGHT_G - HOLOGRAM_SHADOW_G) * t;
      data[p + 2] = HOLOGRAM_SHADOW_B + (HOLOGRAM_HIGHLIGHT_B - HOLOGRAM_SHADOW_B) * t;
    }
    ctx.putImageData(imageData, 0, 0);

    // スキャンライン — 細い横帯を、下のシルエット塗りと同じ方法で
    // スプライト自身の不透明ピクセルにマスクする
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = HOLOGRAM_SCANLINE_COLOR;
    for (let y = 0; y < h; y += HOLOGRAM_SCANLINE_SPACING) {
      ctx.fillRect(0, y, w, HOLOGRAM_SCANLINE_THICKNESS);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // キャンバス自身の不透明ピクセルだけを対象にした、ぴったりの境界ボックス。
  // 立ち絵は元画像に空白の余白が多く含まれていることが多く
  // （例：腕を広げた立ちポーズは四隅に大きな空白ができる）、
  // フェード幅をキャンバス全体基準で測っていたことが「わずかなフェードでも
  // 中央近くまで届いてしまう」バグの正体だった。つまり「わずか」なはずの
  // 割合の大半が、実際の絵に届く前の空白部分を横切るのに消費されてしまい、
  // 残りの分だけでも絵の奥深くまで食い込んでいた。
  function getOpaqueBBox(cv) {
    const ctx = cv.getContext("2d");
    const w = cv.width;
    const h = cv.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      const rowBase = y * w;
      for (let x = 0; x < w; x++) {
        if (data[(rowBase + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null; // 全て透明 — フェードする対象がない
    return { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 };
  }

  // ワイプが掃引していく際の、「まだ不透明」から「すでに透明」への
  // 柔らかい遷移帯の幅（掃引方向の長さに対する割合）。あくまで見た目の
  // 演出であり、ワイプの開始/終了位置には影響せず、動く境界線が
  // どれだけくっきり／柔らかく見えるかだけを左右する。
  const EDGE_FADE_RAMP_WIDTH = 0.15;

  // amountFracが0→1に進むにつれて、指定された各辺を透明にワイプしていく。
  // 0では何もフェードされておらず、1では（getOpaqueBBoxで求めた）
  // 見えている立ち絵全体が透明に掃引済みになる——その辺の近くだけの
  // 帯ではない。例えば「左」だけを選んで100%にすると、スライダーが
  // 上がるにつれて左から掃引が進み、絵全体がフェードする。
  // 有効な辺それぞれが独立したキャンバス全体への「destination-in」パスで
  // あり、どの辺も自分の100%で「全体が透明」に収束するため、
  // 複数の辺を掛け合わせてもやはりそこに収束する——組み合わせのための
  // 特別なブレンド処理は不要。
  function applyEdgeFade(cv, amountFrac, top, bottom, left, right) {
    if (amountFrac <= 0 || !(top || bottom || left || right)) return;
    const bbox = getOpaqueBBox(cv);
    if (!bbox) return;
    const ctx = cv.getContext("2d");
    const w = cv.width;
    const h = cv.height;
    ctx.globalCompositeOperation = "destination-in";

    // グラデーション位置0は常に「選択した辺そのもの」、1は反対側——
    // どの物理的な辺であっても同じ掃引ロジックが使えるようにしている
    const fadeAlong = (x0, y0, x1, y1) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      const rampStart = Math.min(1, amountFrac);
      const rampEnd = Math.min(1, amountFrac + EDGE_FADE_RAMP_WIDTH);
      g.addColorStop(rampStart, "rgba(0,0,0,0)");
      g.addColorStop(rampEnd, "rgba(0,0,0,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };
    if (top) fadeAlong(0, bbox.top, 0, bbox.bottom);
    if (bottom) fadeAlong(0, bbox.bottom, 0, bbox.top);
    if (left) fadeAlong(bbox.left, 0, bbox.right, 0);
    if (right) fadeAlong(bbox.right, 0, bbox.left, 0);

    ctx.globalCompositeOperation = "source-over";
  }

  // 新規追加キャラクターのフェード開始/終了デフォルト値（departureProgressに対する%）
  // — c.departureFadeStart/departureFadeEndとしてUIからキャラごとに調整可能。
  // キャラクターのフェードはdepartureProgressに1:1で連動するわけではなく、
  // アニメーション序盤（動画自体の立ち上がり）は完全不透明のままで、
  // 途中から徐々に消え始め、進行度が100に達する前にフェードを終える——
  // これにより、完全に消えた後もさらにスクラブする余地が残る。
  // あくまで「フェード」の側のタイミングの話であり、動画自体
  // （drawDepartureEffect参照）は0-100の全域を変わらず線形にスクラブする。
  const DEPARTURE_FADE_START_DEFAULT = 5;
  const DEPARTURE_FADE_END_DEFAULT = 50;

  function departureFadeFraction(progress, startPct, endPct) {
    if (progress <= startPct) return 0;
    if (endPct <= startPct) return 1; // 開始≧終了という特殊な範囲 — startPctで即座に切り替わる扱いにする
    if (progress >= endPct) return 1;
    return (progress - startPct) / (endPct - startPct);
  }

  // シルエットはスプライト自身の不透明ピクセルだけを黒くする必要がある——
  // メインキャンバスに直接合成すると、バウンディングボックス内にすでに
  // 描画されている背景や他のキャラクターまで黒くなってしまうため、
  // まず使い捨ての同サイズキャンバス上に描画する。
  function drawCharacterSprite(context, c, w, h) {
    const src = spriteSourceRect(c);
    const bodyCv = extractRegion(c.img, src.x, src.y, src.w, src.h);

    if (c.silhouette) {
      const bctx = bodyCv.getContext("2d");
      bctx.globalCompositeOperation = "source-atop";
      bctx.fillStyle = "#000000";
      bctx.fillRect(0, 0, bodyCv.width, bodyCv.height);
    }

    // 選択中の表情差分を本体の顔部分に貼り付ける——シルエット時はどうせ
    // 真っ黒になるためスキップ。（後から別レイヤーとしてメインcontextに
    // 描画するのではなく）bodyCv自体に合成することで、以降のhologram/
    // edgeFade/departureが本体+顔をひとつのスプライトとして扱えるように
    // している。別々にフェードさせると、顔側は自分自身の小さいクロップの
    // バウンディングボックスを基準に「上端/下端」を判断してしまい本体側と
    // ズレるため、顔だけ異なる速度でフェードしたり全くフェードしなかったり、
    // 本体がすでに透明なのに顔だけ不透明で浮いてしまう、といったことが
    // 起こり得た。
    if (!c.silhouette && c.exprSheet && c.exprSheet.enabled && c.activeExpr >= 0) {
      const cell = getExprCellRect(c.exprSheet.grid, c.activeExpr);
      if (cell) {
        const face = c.exprSheet.face;
        const faceCv = extractRegion(c.img, cell.x, cell.y, cell.w, cell.h);
        bodyCv.getContext("2d").drawImage(faceCv, face.x - src.x, face.y - src.y, face.w, face.h);
      }
    }

    if (c.hologram) applyHologramEffect(bodyCv);
    if (c.edgeFadeAmount > 0) {
      applyEdgeFade(bodyCv, c.edgeFadeAmount / 100, c.edgeFadeTop, c.edgeFadeBottom, c.edgeFadeLeft, c.edgeFadeRight);
    }
    // 退去エフェクトは、重ねて表示する動画（drawDepartureEffect参照）と
    // 同じ進行度の値を使ってキャラクターを上からフェードさせる——上の
    // ユーザー自身のedgeFade設定とは独立しているので、両者が矛盾なく
    // 両方とも機能する必要はない。この進行度の中でのフェード自体の
    // タイミングは、1:1ではなくdepartureFadeFractionで再マッピングされる。
    if (c.departureEnabled && c.departureProgress > c.departureFadeStart) {
      const fadeFrac = departureFadeFraction(c.departureProgress, c.departureFadeStart, c.departureFadeEnd);
      applyEdgeFade(bodyCv, fadeFrac, true, false, false, false);
    }
    context.drawImage(bodyCv, -w / 2, -h / 2, w, h);
  }

  // このキャラクター専用の退去エフェクト用<video>を遅延生成する。
  // （ひとつを使い回すのではなく）キャラクターごとに別要素を持たせるのは、
  // <video>は一度に1つの時刻にしかシークできず、複数のキャラクターが
  // 同時に異なる進行度で退去中になり得るため。DOMには一切追加しない——
  // <video>はdrawImageの有効なソースになるために1フレームをデコード
  // 済みであればよく、DOM添付は不要。
  function getDepartureVideoEl(c) {
    if (!c._departureVideoEl) {
      const v = document.createElement("video");
      v.src = assets.departureVideoSrc;
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      // シーク（と最初のメタデータ/フレーム読み込み）は非同期のため、
      // 進行度変更後の最初の描画は1フレーム古いことが多い——実際の
      // フレームが届いた時点で再描画することで、少し遅れて補正される
      v.addEventListener("loadedmetadata", () => renderAll());
      v.addEventListener("seeked", () => renderAll());
      c._departureVideoEl = v;
    }
    return c._departureVideoEl;
  }

  // c.departureProgressの位置における退去動画のフレームを、キャラクター
  // 自身の平行移動/反転済み座標空間の中で、既存の描画の上に加算的
  // （"screen"）に描画する——デフォルトではキャラクター自身の描画高さに
  // 合わせて中央揃えで表示され、departureOffsetX/YとdepartureScaleで
  // 調整可能。
  function drawDepartureEffect(context, c, h) {
    if (!assets.departureVideoSrc) return;
    const video = getDepartureVideoEl(c);
    if (video.readyState < 2 || !video.duration) return; // まだフレームがデコードされていない

    const targetTime = (c.departureProgress / 100) * video.duration;
    if (Math.abs(video.currentTime - targetTime) > 0.01) {
      try {
        video.currentTime = targetTime;
      } catch (e) {
        /* 動画の準備が完全に整う前にシークするとブラウザによっては例外を投げるが、無視して問題ない——次の描画時に再試行される */
      }
    }

    const effH = h * (c.departureScale || 1);
    const effW = effH * (video.videoWidth / video.videoHeight);
    // 中心ではなくキャラクター自身の下端（足元）を基準にする——
    // departureScaleを大きく/小さくした際、上下均等に膨らむのではなく
    // 地面から上方向にエフェクトが伸びるようにするため
    const bottomY = h / 2 + (c.departureOffsetY || 0);
    context.save();
    // 色相回転は動画自体のピクセルに適用されるため、加算合成（"screen"）の
    // 前に効いている必要がある——0（デフォルト）なら今までどおりの色合い
    context.filter = c.departureHue ? `hue-rotate(${c.departureHue}deg)` : "none";
    context.globalAlpha = 1;
    context.globalCompositeOperation = "screen";
    context.drawImage(video, (c.departureOffsetX || 0) - effW / 2, bottomY - effH, effW, effH);
    context.restore();
  }

  // ---- タップエフェクト（手動進行でクリック/タップした位置に出す演出） ----
  // タップのたびに<video>を新規生成してdata: URLをデコードさせると、
  // デコーダ起動のオーバーヘッドで表示が遅れ、連打すると同時に何個も
  // デコーダが立ち上がって重くなる。そのため、あらかじめ読み込み済みの
  // <video>を数個だけ使い回すプール方式にする——タップ時はcurrentTimeを
  // 0に戻して鳴らし直すだけで済み、体感の遅延も同時再生数も抑えられる。
  const TAP_EFFECT_POOL_SIZE = 4;
  let tapEffectPool = []; // { video, x, y, active, lastUsedAt }

  // プールを初回だけ生成する。シナリオ再生開始時（startScenarioPlayback）に
  // 呼んでおくことで、実際に最初のタップが起きる前に各<video>のデコード
  // 準備を済ませておける（暗転演出中はどのみちクリックを無視するので、
  // その間に十分読み込みが進む）。
  function ensureTapEffectPool() {
    if (tapEffectPool.length > 0 || !assets.tapVideoSrc) return;
    for (let i = 0; i < TAP_EFFECT_POOL_SIZE; i++) {
      const video = document.createElement("video");
      video.src = assets.tapVideoSrc;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      const slot = { video, x: 0, y: 0, active: false, lastUsedAt: 0 };
      video.addEventListener("ended", () => {
        slot.active = false;
      });
      tapEffectPool.push(slot);
    }
  }

  function spawnTapEffect(x, y) {
    if (!assets.tapVideoSrc) return;
    ensureTapEffectPool(); // 万が一再生開始時の予備読み込みが無かった場合の保険
    // 空いているスロットを使う。連打等で全スロットが使用中の場合は、
    // 新しい<video>を増やすのではなく、一番古くから使われているものを
    // 横取りして鳴らし直す——同時再生数を常にプールサイズ以内に抑える。
    let slot = tapEffectPool.find((s) => !s.active);
    if (!slot) {
      slot = tapEffectPool.reduce((oldest, s) => (s.lastUsedAt < oldest.lastUsedAt ? s : oldest), tapEffectPool[0]);
    }
    if (!slot) return; // アセット未読み込みでプールが1つも無い場合
    slot.x = x;
    slot.y = y;
    slot.active = true;
    slot.lastUsedAt = performance.now();
    slot.video.currentTime = 0;
    slot.video.play().catch(() => {
      slot.active = false;
    });
  }

  // 現在アクティブな全タップエフェクトを描く。drawScene側から毎フレーム
  // 呼ぶ——退去エフェクトと同じ加算合成（"screen"）で、UI（ボタン等）より
  // さらに手前、最後に描画する。
  function drawTapEffects(context) {
    tapEffectPool.forEach((slot) => {
      if (!slot.active) return;
      const video = slot.video;
      if (video.readyState < 2 || !video.videoWidth) return; // まだフレームがデコードされていない
      const h = TAP_EFFECT_SIZE;
      const w = h * (video.videoWidth / video.videoHeight);
      context.save();
      context.globalAlpha = 1;
      context.globalCompositeOperation = "screen";
      context.drawImage(video, slot.x - w / 2, slot.y - h / 2, w, h);
      context.restore();
    });
  }

  // ---- ルビ（ふりがな）対応 ----
  // 記法（青空文庫のテキストと同じ慣習）:
  //   漢字《かんじ》        → ベースは"《"の直前に連続する漢字の並びから
  //                          自動検出される
  //   〔強調したい範囲〕     → ルビとは別に、範囲内の各文字の上に圏点
  //                          （・）を打って強調する。中身はもう一度この
  //                          パーサーに通すので、ルビと組み合わせて
  //                          〔漢字《かんじ》〕のようにも書ける。
  //   ｜任意の範囲《よみ》   → "｜"でベーステキストの開始位置を明示的に
  //                          指定し、単語単位で細かく制御できる
  const CJK_RE = /[\u4E00-\u9FFF\u3400-\u4DBF々〆〤]/;

  function parseRubyParagraph(para) {
    const runs = [];
    let i = 0;
    while (i < para.length) {
      const ch = para[i];
      if (ch === "〔") {
        const emphasisEnd = para.indexOf("〕", i);
        if (emphasisEnd !== -1) {
          const inner = para.slice(i + 1, emphasisEnd);
          // ネストしたルビにも対応できるよう、中身をもう一度この関数で
          // パースしてから、出てきたrun全部に強調フラグを付け足す
          parseRubyParagraph(inner).forEach((r) => runs.push({ ...r, emphasis: true }));
          i = emphasisEnd + 1;
          continue;
        }
        runs.push({ type: "text", ch });
        i++;
        continue;
      }
      if (ch === "｜" || ch === "|") {
        const rubyStart = para.indexOf("《", i);
        if (rubyStart !== -1) {
          const rubyEnd = para.indexOf("》", rubyStart);
          if (rubyEnd !== -1) {
            const base = para.slice(i + 1, rubyStart);
            const reading = para.slice(rubyStart + 1, rubyEnd);
            if (base.length > 0) {
              runs.push({ type: "ruby", base, reading });
              i = rubyEnd + 1;
              continue;
            }
          }
        }
        runs.push({ type: "text", ch });
        i++;
        continue;
      }
      if (CJK_RE.test(ch)) {
        let j = i;
        while (j < para.length && CJK_RE.test(para[j])) j++;
        if (para[j] === "《") {
          const rubyEnd = para.indexOf("》", j);
          if (rubyEnd !== -1) {
            const base = para.slice(i, j);
            const reading = para.slice(j + 1, rubyEnd);
            runs.push({ type: "ruby", base, reading });
            i = rubyEnd + 1;
            continue;
          }
        }
        for (let k = i; k < j; k++) runs.push({ type: "text", ch: para[k] });
        i = j;
        continue;
      }
      runs.push({ type: "text", ch });
      i++;
    }
    return runs;
  }

  function parseRubyText(raw) {
    return raw.split("\n").map(parseRubyParagraph);
  }

  // 両方向にクランプ：読めないほど小さくならず、かつRUBY_FONT_MAXで
  // 頭打ちにすることで、本文フォントサイズ自体の最大値（100）に達する
  // よりずっと手前で成長を止め、ウインドウをはみ出すほど大きくならない
  // ようにしている。
  function rubyFontSize(fontSize) {
    return Math.min(RUBY_FONT_MAX, Math.max(10, Math.round(fontSize * RUBY_FONT_RATIO)));
  }

  function measureRun(context, run, fontSize, rubyFontPx) {
    if (run.type === "text") {
      context.font = fontSize + "px " + bodyFontStack();
      return context.measureText(run.ch).width;
    }
    context.font = fontSize + "px " + bodyFontStack();
    const baseW = context.measureText(run.base).width;
    context.font = rubyFontPx + "px " + bodyFontStack();
    const readingW = context.measureText(run.reading).width;
    return Math.max(baseW, readingW);
  }

  // runsの1行分の実際の描画幅 — renderBodyLinesが実際に描画する際の
  // cursorXの増分（各runの幅＋LETTER_SPACING1つ分）をそのまま再現して
  // いるので、単なる近似ではなく実際の画面上の幅と一致する。
  function measureLineWidth(context, runs, fontSize) {
    const rubyFontPx = rubyFontSize(fontSize);
    let width = 0;
    for (const run of runs) width += measureRun(context, run, fontSize, rubyFontPx) + LETTER_SPACING;
    return width;
  }

  function layoutBodyLines(context, paragraphs, maxWidth, fontSize) {
    const rubyFontPx = rubyFontSize(fontSize);
    const lines = [];
    for (const runs of paragraphs) {
      if (runs.length === 0) {
        lines.push([]);
        continue;
      }
      let current = [];
      let currentWidth = 0;
      for (const run of runs) {
        const w = measureRun(context, run, fontSize, rubyFontPx);
        if (currentWidth + w > maxWidth && current.length > 0) {
          lines.push(current);
          current = [];
          currentWidth = 0;
        }
        current.push(run);
        currentWidth += w;
      }
      lines.push(current);
    }
    return lines;
  }

  function shadeColor(hex, ratio) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(r * ratio)}, ${Math.round(g * ratio)}, ${Math.round(b * ratio)})`;
  }

  // 全てのテキスト行に適用する縦グラデーション。単なる塗りつぶしではなく
  // セリフに微妙な光沢/奥行きを与える——下端の色は固定のグレーではなく
  // 選択した文字色を暗くした色にしているので、色付きテキストは平坦な
  // グレーへ薄れるのではなく自分自身の陰へと暗くなっていく。
  function makeTextGradient(context, baselineY, fontSize, color) {
    const top = baselineY - fontSize * BODY_ASCENT_RATIO;
    const bottom = baselineY + fontSize * 0.22;
    const g = context.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, color);
    g.addColorStop(1, shadeColor(color, GRADIENT_DARKEN_RATIO));
    return g;
  }

  // topYは最初の行の固定された左上基準点——ベースラインはフォントの
  // アセントから逆算されるので、fontSizeを大きくするとブロックは
  // その点を中心に再配置されるのではなく右下方向に広がっていく。
  // どの行も、実際にルビが付いているかどうかに関わらずルビの読みに
  // 必要な縦方向のスペースを常に確保している——そのため、どこかに
  // ルビを追加/削除しても他の行の位置がずれることはない。
  // revealCountを指定すると、先頭から数えてその数の分だけrunを描画した
  // 時点で打ち切る（シナリオ再生中のタイプライター表示用）。省略時は
  // Infinityになり、これまで通り全文を描画する——既存の呼び出し箇所
  // （名前欄、静止時の本文描画）は挙動が変わらない。
  // 圏点（傍点）——ルビとは別に、文字の上に小さな点を打って強調する
  // （〔強調したい範囲〕記法、parseRubyParagraph参照）。フォントの
  // グリフに頼らず円を描くことで、フォント/サイズが変わっても見た目が
  // 一定になるようにしている。
  function drawEmphasisDot(context, centerX, baselineY, fontSize, fillStyle) {
    const dotY = baselineY - fontSize * 1.1;
    const dotR = Math.max(1.5, fontSize * 0.08);
    context.save();
    context.fillStyle = fillStyle;
    context.beginPath();
    context.arc(centerX, dotY, dotR, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function renderBodyLines(context, lines, x, topY, fontSize, color, revealCount = Infinity) {
    const rubyFontPx = rubyFontSize(fontSize);
    const lineHeight = Math.round(fontSize * 1.6 + fontSize * 0.0);
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.save();
    context.shadowColor = TEXT_SHADOW_COLOR;
    context.shadowBlur = TEXT_SHADOW_BLUR;
    context.shadowOffsetX = TEXT_SHADOW_OFFSET_X;
    context.shadowOffsetY = TEXT_SHADOW_OFFSET_Y;

    let revealed = 0;
    outer:
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const baselineY = topY + fontSize * BODY_ASCENT_RATIO + idx * lineHeight;
      let cursorX = x;
      const gradient = makeTextGradient(context, baselineY, fontSize, color);

      for (const run of line) {
        if (revealed >= revealCount) break outer;
        revealed++;
        if (run.type === "text") {
          context.font = fontSize + "px " + bodyFontStack();
          context.fillStyle = gradient;
          context.fillText(run.ch, cursorX, baselineY);
          const charW = context.measureText(run.ch).width;
          if (run.emphasis) drawEmphasisDot(context, cursorX + charW / 2, baselineY, fontSize, gradient);
          cursorX += charW + LETTER_SPACING;
        } else {
          context.font = fontSize + "px " + bodyFontStack();
          const baseW = context.measureText(run.base).width;
          context.font = rubyFontPx + "px " + bodyFontStack();
          const readingW = context.measureText(run.reading).width;
          const w = Math.max(baseW, readingW);

          context.font = fontSize + "px " + bodyFontStack();
          context.fillStyle = gradient;
          context.fillText(run.base, cursorX + (w - baseW) / 2, baselineY);
          if (run.emphasis) drawEmphasisDot(context, cursorX + w / 2, baselineY, fontSize, gradient);

          const rubyBaselineY = baselineY - fontSize * 0.95;
          context.font = rubyFontPx + "px " + bodyFontStack();
          context.fillStyle = makeTextGradient(context, rubyBaselineY, rubyFontPx, color);
          context.fillText(run.reading, cursorX + (w - readingW) / 2, rubyBaselineY);

          cursorX += w + LETTER_SPACING;
        }
      }
    }

    context.restore();
  }

  // シナリオ再生中のセリフ表示アニメーション本体。typing/holdingは
  // revealCountで打ち切ったrenderBodyLinesを、exitingは全文を上へ
  // スライドさせながらフェードアウトさせて描画する。
  function drawAnimatedBodyText(context, anim) {
    if (anim.phase === "exiting") {
      context.save();
      context.globalAlpha = 1 - anim.exitProgress;
      context.translate(0, -DIALOGUE_EXIT_SLIDE_PX * anim.exitProgress);
      renderBodyLines(context, anim.lines, BODY_X, BODY_TOP_Y, anim.fontSize, anim.color);
      context.restore();
    } else {
      const count = anim.phase === "holding" ? Infinity : anim.revealedRuns;
      renderBodyLines(context, anim.lines, BODY_X, BODY_TOP_Y, anim.fontSize, anim.color, count);
    }
  }

  // assets.nameBoxを`targetW`まで引き伸ばして描画する。左端の切り欠きと
  // 右端のフェードアウトは元の比率のまま保ち、平坦な中央帯だけを
  // 伸縮させる——横方向の9-patch/9-sliceであり、名前が長くなって
  // ボックスが大きくなっても両端が歪むことはない。
  function drawNameBox(context, img, x, y, targetW, targetH) {
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;
    const scale = targetH / srcH;
    const leftCapW = NAME_BOX_SRC_LEFT_CAP * scale;
    const rightCapSrcW = srcW - NAME_BOX_SRC_RIGHT_CAP;
    const rightCapW = rightCapSrcW * scale;
    const middleSrcW = NAME_BOX_SRC_RIGHT_CAP - NAME_BOX_SRC_LEFT_CAP;
    const middleDstW = Math.max(0, targetW - leftCapW - rightCapW);

    context.drawImage(img, 0, 0, NAME_BOX_SRC_LEFT_CAP, srcH, x, y, leftCapW, targetH);
    if (middleDstW > 0) {
      context.drawImage(img, NAME_BOX_SRC_LEFT_CAP, 0, middleSrcW, srcH, x + leftCapW, y, middleDstW, targetH);
    }
    context.drawImage(
      img,
      NAME_BOX_SRC_RIGHT_CAP,
      0,
      rightCapSrcW,
      srcH,
      x + leftCapW + middleDstW,
      y,
      rightCapW,
      targetH
    );
  }

  // assets.scroll（LOGログのスクロールバーのつまみ）を`targetH`まで
  // 引き伸ばして描画する。drawNameBoxの縦方向版——上下の先端（ダイヤモンド
  // 型の切り欠き）は元の比率のまま保ち、中央のまっすぐな帯だけを
  // 伸縮させる縦方向の9-patch/9-slice。ログが長くなるほどtargetHが
  // 小さくなり、逆に短ければ大きくなる（drawLogScrollbar参照）。
  function drawScrollHandle(context, img, x, y, targetW, targetH) {
    const srcW = img.naturalWidth;
    const scale = targetW / srcW;
    // 上下キャップは、透明な余白（LOG_SCROLLBAR_SRC_CONTENT_TOP/BOTTOM の
    // 外側）を含めずに絵の部分だけを詰めて描く——そうしないと、つまみを
    // 上下の限界まで動かしても絵の先端がトラック端に届かず隙間が空いて見える。
    const topCapSrcH = LOG_SCROLLBAR_SRC_TOP_CAP - LOG_SCROLLBAR_SRC_CONTENT_TOP;
    const topCapH = topCapSrcH * scale;
    const bottomCapSrcH = LOG_SCROLLBAR_SRC_CONTENT_BOTTOM - LOG_SCROLLBAR_SRC_BOTTOM_CAP;
    const bottomCapH = bottomCapSrcH * scale;
    const middleSrcH = LOG_SCROLLBAR_SRC_BOTTOM_CAP - LOG_SCROLLBAR_SRC_TOP_CAP;
    const middleDstH = Math.max(0, targetH - topCapH - bottomCapH);

    context.drawImage(img, 0, LOG_SCROLLBAR_SRC_CONTENT_TOP, srcW, topCapSrcH, x, y, targetW, topCapH);
    if (middleDstH > 0) {
      context.drawImage(img, 0, LOG_SCROLLBAR_SRC_TOP_CAP, srcW, middleSrcH, x, y + topCapH, targetW, middleDstH);
    }
    context.drawImage(
      img,
      0,
      LOG_SCROLLBAR_SRC_BOTTOM_CAP,
      srcW,
      bottomCapSrcH,
      x,
      y + topCapH + middleDstH,
      targetW,
      bottomCapH
    );
  }

  // 表示数に応じた各選択肢ボックスの縦方向の中心位置。2個表示のレイアウトが
  // 元々の固定位置で、1個の場合はその2つのボックスのちょうど中間に、
  // 3個の場合も同じ中間位置を真ん中のボックスとして使い、上下には
  // 2個表示時と同じボックス間隔を用いる——そのため表示数がいくつであっても
  // 一貫した中心線と間隔を共有する。
  function choiceSlotCenters(count, boxH) {
    const pitch = boxH + CHOICE_BOX_GAP;
    const midpointCenter = CHOICE_BOX_TOP_Y + boxH + CHOICE_BOX_GAP / 2;
    if (count === 1) return [midpointCenter];
    if (count === 3) return [midpointCenter - pitch, midpointCenter, midpointCenter + pitch];
    const firstCenter = CHOICE_BOX_TOP_Y + boxH / 2;
    return [firstCenter, firstCenter + pitch];
  }

  // "grayscale"/"sepia"をcontext.filterの文字列に変換する。"none"や
  // 未指定はフィルター無し。
  function colorModeFilter(mode) {
    if (mode === "grayscale") return "grayscale(1)";
    // sepia(1)の変換行列はR/Gチャンネルを1倍以上に増幅する
    // （白入力で約R×1.35, G×1.2）ため、明るい部分ほど1.0に張り付いて
    // 白飛びしやすい。sepiaを掛ける前に少し暗くしておくことで、
    // 増幅後もクリップしにくくしている。
    if (mode === "sepia") return "brightness(0.85) sepia(1)";
    return null;
  }

  // 個別（背景/キャラクター自身）の色調設定がある場合はそちらを優先し、
  // 未設定（"none"）ならシーン全体の色調設定にフォールバックする。
  function effectiveColorMode(localMode, sceneMode) {
    if (localMode && localMode !== "none") return localMode;
    return sceneMode || "none";
  }

  // 純粋なシーン描画 — ライブプレビューとPNG書き出しの両方で使われる。
  // 選択ハンドルなどのエディタ用の装飾はここでは描画しない。
  function drawScene(context) {
    context.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // 「シナリオ開始/終了/場面転換」の暗転演出中、および退去エフェクト
    // 再生行の間は、セリフウインドウ・選択肢・LOG/AUTO/NEXTを出さない
    // （退去エフェクト再生行ではSKIPだけは通常通り表示したままにする——
    // SKIP以外のボタン類を隠す、という仕様のため）。暗転演出中はSKIP自体も
    // 通常描画は隠す——drawStartingFadeOverlay/drawEndingFadeOverlay/
    // drawSceneTransitionOverlay側がそれぞれ独立して描き直す（場面転換は
    // SKIPごと隠したままにする）ので、ここで隠れても演出には影響しない。
    const isSpecialFadeLine =
      playback &&
      playback.currentLine &&
      (playback.currentLine.isStartingFade ||
        playback.currentLine.isEndingFade ||
        playback.currentLine.isSceneTransition);
    const isDepartureLine = playback && lineHasDeparture(playback.currentLine);
    const suppressLineUI = isSpecialFadeLine || isDepartureLine;
    const suppressSkip = isSpecialFadeLine;

    // 背景 — グレースケールはこのブロックだけに適用されるよう
    // save/restoreで範囲を限定し、後で描画するセリフウインドウ/選択肢/
    // ボタン類に漏れ出さないようにしている
    context.save();
    const activeBg = getActiveBackground();
    const bgMode = effectiveColorMode(activeBg && activeBg.colorMode, state.sceneColorMode);
    const bgFilter = colorModeFilter(bgMode);
    if (bgFilter) context.filter = bgFilter;
    const drawBgOrPlaceholder = (bg) => {
      if (bg) {
        drawBackgroundImage(context, bg, 0, 0, CANVAS_W, CANVAS_H);
      } else {
        context.fillStyle = "#9ED0E4";
        context.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }
    };
    const bgTransition = getBackgroundTransitionProgress();
    if (bgTransition) {
      // クロスフェード中——直前の背景をそのまま描き、その上に新しい背景を
      // 進捗に応じた不透明度で重ねて溶暗/溶明させる
      drawBgOrPlaceholder(bgTransition.fromBg);
      context.save();
      context.globalAlpha = bgTransition.t;
      drawBgOrPlaceholder(activeBg);
      context.restore();
    } else {
      drawBgOrPlaceholder(activeBg);
      if (!activeBg) {
        context.fillStyle = "#3a4562";
        context.font = "24px " + bodyFontStack();
        context.textAlign = "center";
        context.fillText("背景未設定", CANVAS_W / 2, CANVAS_H / 2);
      }
    }
    context.restore();

    // キャラクター、奥から手前へ
    // 暗くする処理の「アクティブ」判定は、表示されている中で最前面の
    // キャラクターが対象——配列末尾が完全透明なキャラクターだからといって
    // 他の全員が暗くなったままになってはいけない（resolveFrontIndex参照）
    let frontIndex = resolveFrontIndex();
    state.characters.forEach((c, i) => {
      // 描画の可否は目標値（isCharacterVisible）ではなく、フェード中の
      // 見た目上の不透明度で判定する——フェードアウトの目標が「非表示」に
      // なった瞬間に描画自体を打ち切ってしまうと、尾を引くフェードが
      // 表示されなくなってしまうため。
      const displayOpacity = getCharacterDisplayOpacity(c);
      if (displayOpacity <= 0) return;
      const { w, h } = charBBox(c);
      const dim = state.dimInactive && state.characters.length > 1 && i !== frontIndex;

      context.save();
      context.translate(getEffectiveX(c), getEffectiveY(c));
      if (c.flipX) context.scale(-1, 1);
      // 上書きではなく合成する — シーン全体または個別の色調設定も
      // 同時にONの状態で暗くする場合、該当する全てのフィルターを
      // まとめて適用する必要がある
      const filters = [];
      const charMode = effectiveColorMode(c.grayscale ? "grayscale" : "none", state.sceneColorMode);
      const charFilter = colorModeFilter(charMode);
      if (charFilter) filters.push(charFilter);
      if (dim) filters.push("brightness(55%) saturate(92%)");
      if (filters.length) context.filter = filters.join(" ");
      context.globalAlpha = displayOpacity / 100;
      drawCharacterSprite(context, c, w, h);
      if (c.departureEnabled) drawDepartureEffect(context, c, h);
      context.restore();
    });

    // セリフウインドウ — 枠画像 + 名前 + 本文テキスト
    if (state.showWindow && !suppressLineUI) {
      context.drawImage(assets.textbox, 0, 0, CANVAS_W, CANVAS_H);
      const nameRuns = state.speaker ? parseRubyParagraph(state.speaker) : null;
      if (state.nameplateOn) {
        // 高さは実際にボックスがどれだけ幅広になるかではなく、固定の
        // 基準幅から算出する——そうしないと、名前が長くなるとボックスの
        // 高さも幅と一緒に大きくなってしまい、中央帯だけが横に伸びるのでは
        // なくタブ全体が拡大しているように見えてしまう。
        const nameBoxH =
          NAME_BOX_MIN_W * (assets.nameBox.naturalHeight / assets.nameBox.naturalWidth) * NAME_BOX_HEIGHT_SCALE;
        // 高さが固定になったことで、キャップ（両端）のピクセル幅も固定に
        // なる（drawNameBoxはtargetH/srcHでスケーリングし、targetHは
        // もはやnameBoxWに依存しない）——そのため割合で割るのではなく、
        // 定数として加算すればよい。「全体幅に対するキャップの割合」で
        // 割っていたのが以前のバグで、キャップがnameBoxWに比例して
        // 大きくなることを暗黙に仮定してしまっていたため、名前が長くなる
        // ほど計算上の幅がどんどん過大になり、固定であるべき
        // NAME_BOX_TEXT_PADDING分の隙間が際限なく広がってしまっていた。
        const capScale = (NAME_BOX_MIN_W * NAME_BOX_HEIGHT_SCALE) / assets.nameBox.naturalWidth;
        const capW =
          (NAME_BOX_SRC_LEFT_CAP + (assets.nameBox.naturalWidth - NAME_BOX_SRC_RIGHT_CAP)) * capScale;
        const textWidth = nameRuns ? measureLineWidth(context, nameRuns, NAME_FONT_SIZE) : 0;
        const neededW = textWidth + NAME_BOX_TEXT_PADDING + capW;
        const nameBoxW = Math.max(NAME_BOX_MIN_W, neededW);
        drawNameBox(context, assets.nameBox, NAME_BOX_X, NAME_BOX_Y, nameBoxW, nameBoxH);
      }

      context.textAlign = "left";
      context.textBaseline = "alphabetic";

      // 名前のテキストは、下の本文用クリップ領域の外側に描画する——
      // 名前はボックス上部の名前欄タブの中にあるため、そこでクリップすると
      // 各文字のほとんどが欠けてしまう（descender部分しか見えない）。
      if (state.nameplateOn && nameRuns) {
        // 本文用のルビ対応レンダラーを再利用する——名前は単に1行の
        // テキストとして扱える
        renderBodyLines(context, [nameRuns], NAME_X, NAME_TOP_Y, NAME_FONT_SIZE, NAME_TEXT_COLOR);
      }

      if (state.body) {
        context.save();
        context.beginPath();
        // シナリオ再生中の退出アニメーション中だけ、上へスライドする文字が
        // 途中で切れないようクリップ領域を上に広げる
        const exiting = playback && dialogueAnim && dialogueAnim.phase === "exiting";
        const clipTop = exiting ? BOX_TOP - 4 - DIALOGUE_EXIT_CLIP_MARGIN : BOX_TOP - 4;
        context.rect(0, clipTop, CANVAS_W, CANVAS_H - clipTop);
        context.clip();

        if (playback && dialogueAnim) {
          drawAnimatedBodyText(context, dialogueAnim);
        } else {
          const paragraphs = parseRubyText(state.body);
          const lines = layoutBodyLines(context, paragraphs, BODY_MAX_WIDTH, state.fontSize);
          renderBodyLines(context, lines, BODY_X, BODY_TOP_Y, state.fontSize, state.textColor);
        }

        context.restore();
      }
    }

    // プレイヤー選択肢 — 上記のセリフウインドウ/名前欄より後に（つまり
    // 視覚的に手前に）描画する。ONの間は各スロットが常に表示される
    // （テキストが空でも）。choice1は常に一番上のスロット。
    if (state.showChoices && !suppressLineUI) {
      const choiceTexts = [state.choice1, state.choice2, state.choice3].slice(0, state.choiceCount);
      const choiceColors = [state.choice1Color, state.choice2Color, state.choice3Color];
      const choiceBoxH = CHOICE_BOX_W * (assets.linesBox.naturalHeight / assets.linesBox.naturalWidth);
      const centers = choiceSlotCenters(state.choiceCount, choiceBoxH);
      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      // 選択肢のテキストを1回分描く（本来の文字列・拡大する「分身」の
      // どちらの描画にも使い回す共通処理）
      const drawChoiceText = (text, centerY, color, opacity, fontSize) => {
        if (opacity <= 0) return;
        context.save();
        context.globalAlpha = opacity;
        context.shadowColor = TEXT_SHADOW_COLOR;
        context.shadowBlur = TEXT_SHADOW_BLUR;
        context.shadowOffsetX = TEXT_SHADOW_OFFSET_X;
        context.shadowOffsetY = TEXT_SHADOW_OFFSET_Y;
        context.font = fontSize + "px " + bodyFontStack();
        // "middle"ベースラインはmakeTextGradientのアセント/ディセント計算
        // （"alphabetic"前提で書かれている）と噛み合わないため、
        // グラデーション側のロジックを切り替えるのではなく、ボックスの
        // 縦方向中心を相当するalphabeticベースラインYに変換している——
        // BODY_TOP_Y/NAME_TOP_Yが逆方向に行っているのと同じ変換。
        const baselineY = centerY + fontSize * 0.3;
        context.fillStyle = makeTextGradient(context, baselineY, fontSize, color);
        context.fillText(text, CHOICE_BOX_X + CHOICE_BOX_W / 2, baselineY);
        context.restore();
      };

      choiceTexts.forEach((text, idx) => {
        // シナリオ再生中、選択肢がクリックされた後のフェードアウト演出。
        // 選ばれなかった方は即座に、選ばれた方は少し遅れて消えていく
        // （updateChoiceAnim参照）。完全に消えたスロットは描画自体をやめる。
        const boxOpacity = choiceOpacityFor(idx);
        if (boxOpacity <= 0) return;
        const centerY = centers[idx];
        context.save();
        context.globalAlpha = boxOpacity;
        context.drawImage(assets.linesBox, CHOICE_BOX_X, centerY - choiceBoxH / 2, CHOICE_BOX_W, choiceBoxH);
        context.restore();
        if (!text.trim()) return;

        // 本来の文字列は箱と同じ不透明度のまま、常にそこに残す
        drawChoiceText(text, centerY, choiceColors[idx], boxOpacity, CHOICE_FONT_SIZE);

        // 選ばれた選択肢だけ、同じ文字列の「分身」をもう1つ上に重ねて
        // 描き、そちらだけをクリックと同時に拡大させながら素早く
        // フェードアウトさせる（choiceSelectedTextProgress参照）。
        // 元の文字列（上の描画）はそのまま残る。
        const isSelectedExiting = choiceAnim && choiceAnim.phase === "exiting" && idx === choiceAnim.selectedIdx;
        if (isSelectedExiting) {
          const ghost = choiceSelectedTextProgress();
          drawChoiceText(text, centerY, choiceColors[idx], ghost.opacity, ghost.fontSize);
        }
      });
    }

    // SKIP / LOG / AUTO / NEXT — ウインドウとは独立しており、それぞれ
    // 「ボタン類を表示」というグループスイッチの下で個別にON/OFFできる
    if (state.showButtons) {
      if (state.showSkip && !suppressSkip) context.drawImage(assets.skip, 0, 0, CANVAS_W, CANVAS_H);

      if (!suppressLineUI) {
        if (state.showLog) {
          context.save();
          context.globalAlpha = ICON_OPACITY;
          context.drawImage(assets.log, ICON_X, ICON_LOG_Y, ICON_SIZE, ICON_SIZE);
          context.restore();
        }
        if (state.showAuto) {
          context.save();
          if (state.autoActive) {
            // AUTOがONの間は、通常のアイドル時の減光ではなくシアンの発光で
            // 完全に点灯しているように見せる——ぼかし半径を段階的に増やしながら
            // 影を何重にも重ねることで、1回の描画では出せないような、より明るく
            // 太いハローを作り出している（各パスの影が前のものに積み重なる）。
            context.shadowColor = "#00eaff";
            context.globalAlpha = 1;
            [14, 26, 40, 58].forEach((blur) => {
              context.shadowBlur = blur;
              context.drawImage(assets.auto, ICON_X, ICON_AUTO_Y, ICON_SIZE, ICON_SIZE);
            });
          } else {
            context.globalAlpha = ICON_OPACITY;
            context.drawImage(assets.auto, ICON_X, ICON_AUTO_Y, ICON_SIZE, ICON_SIZE);
          }
          context.restore();
        }
        // NEXTは常に完全不透明のまま — LOG/AUTOと違い、アクティブ/クリック可能に見せる意図。
        // シナリオ再生中は本家UIに合わせ、自動進行中・選択肢表示中は常に非表示、
        // 手動進行中は文字が全文表示し終わっている間だけ表示する
        // （タイプ中/退出中は隠す。選択肢は選択肢ボックス自体が入力先のためNEXTは出さない）。
        // 再生中でなければ（通常編集・PNG書き出し）showNextトグルのみに従う。
        if (state.showNext) {
          const onChoiceLine = playback && playback.currentLine && playback.currentLine.showChoices;
          const nextVisible =
            !playback ||
            (!endingFadeAnim &&
              !onChoiceLine &&
              state.scenarioAdvanceMode === "manual" &&
              (!dialogueAnim || dialogueAnim.phase === "holding"));
          if (nextVisible) {
            // 本家UI同様、1秒に2往復のペースで上下にバウンドさせる（再生中のみ——
            // 通常編集は毎フレーム再描画するループが無いため静止したままでよい）。
            // AUTO/LOGの描画位置（ICON_AUTO_Y/ICON_LOG_Y）はこのoffsetを一切
            // 参照していないので、このバウンドで動くことはない。
            let bobOffsetY = 0;
            if (playback) {
              const t = performance.now() / 1000;
              bobOffsetY = Math.sin(t * NEXT_BOB_HZ * 2 * Math.PI) * NEXT_BOB_AMPLITUDE_PX;
            }
            context.drawImage(assets.next, NEXT_X, ICON_NEXT_Y + bobOffsetY, NEXT_SIZE, NEXT_SIZE);
          }
        }
      }
    }

    drawTapEffects(context);
    drawWatermark(context);
  }

  // 非公式のファンメイドツールであることを示す透かし。UI要素のON/OFF設定に
  // 関わらず常に描画し、drawScene経由のプレビュー・PNG書き出し・動画録画の
  // どれにも必ず焼き込まれるようにする（切り替えスイッチは設けない）。
  // 名前欄（左側）とは反対の右側、LOGアイコンの少し上に配置している。
  function drawWatermark(context) {
    context.save();
    context.font = "32px " + bodyFontStack();
    context.textAlign = "right";
    context.textBaseline = "bottom";
    // ぼかしただけの影は明るい背景の上だとほとんど溶けて見えなくなるため、
    // 縁取り（strokeText）で背景の明暗によらず一定のコントラストを確保する
    context.lineJoin = "round";
    context.lineWidth = 6;
    context.strokeStyle = "rgba(0, 0, 0, 0.4)";
    context.fillStyle = "rgba(255, 255, 255, 0.6)";
    const x = CANVAS_W - 100;
    const y = ICON_LOG_Y + 12;
    context.strokeText("非公式シナリオ画面メーカー", x, y);
    context.fillText("非公式シナリオ画面メーカー", x, y);
    context.restore();
  }

  function bodyFontStack() {
    return '"GenEiLateMin", "Hiragino Mincho ProN", serif';
  }

  // 順序は下のHANDLE_MULTIPLIERSと対応: 左上, 右上, 左下, 右下
  function getResizeHandlePoints(c) {
    const { left, top, w, h } = charBBox(c);
    return [
      { x: left, y: top },
      { x: left + w, y: top },
      { x: left, y: top + h },
      { x: left + w, y: top + h },
    ];
  }

  // キャラクター中心に対する各ハンドル位置の軸ごとの符号 — 例えば右上は
  // 中心より右（+1）かつ上（-1）。リサイズは対角線上の反対側の角を
  // 基準点にする（両軸とも符号を反転）ので、実際に掴んでいるハンドルが
  // ポインタに直接追従する——キャラクターが自分自身の中心を軸に拡縮する
  // のではなく、一般的な画像編集ソフトのような挙動になる。
  const HANDLE_MULTIPLIERS = [
    [-1, -1], // 左上
    [1, -1],  // 右上
    [-1, 1],  // 左下
    [1, 1],   // 右下
  ];

  function hitHandleIndex(c, pos) {
    const points = getResizeHandlePoints(c);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (
        pos.x >= p.x - HANDLE_SIZE / 2 - 6 &&
        pos.x <= p.x + HANDLE_SIZE / 2 + 6 &&
        pos.y >= p.y - HANDLE_SIZE / 2 - 6 &&
        pos.y <= p.y + HANDLE_SIZE / 2 + 6
      ) {
        return i;
      }
    }
    return -1;
  }

  // エディタ専用の表示：選択ボックス + リサイズハンドル。書き出しには含まれない。
  function drawEditorOverlay(context) {
    if (state.selectedId == null) return;
    const c = getCharacter(state.selectedId);
    if (!c) return;
    const { left, top, w, h } = charBBox(c);

    context.save();
    context.strokeStyle = "#45d6ff";
    context.lineWidth = 2;
    context.setLineDash([8, 6]);
    context.strokeRect(left, top, w, h);
    context.setLineDash([]);

    context.fillStyle = "#45d6ff";
    context.strokeStyle = "#05070d";
    context.lineWidth = 1;
    getResizeHandlePoints(c).forEach((p) => {
      const hx = p.x - HANDLE_SIZE / 2;
      const hy = p.y - HANDLE_SIZE / 2;
      context.fillRect(hx, hy, HANDLE_SIZE, HANDLE_SIZE);
      context.strokeRect(hx, hy, HANDLE_SIZE, HANDLE_SIZE);
    });
    context.restore();

    // Figma/PowerPoint風のスマートガイド — 実際にドラッグ中のみ表示され
    // （下のpointermove参照）、ドラッグが終わり次第クリアされる。
    if (snapGuideX != null || snapGuideY != null) {
      context.save();
      context.strokeStyle = SNAP_GUIDE_COLOR;
      context.lineWidth = 1;
      context.setLineDash([4, 4]);
      if (snapGuideX != null) {
        context.beginPath();
        context.moveTo(snapGuideX, 0);
        context.lineTo(snapGuideX, CANVAS_H);
        context.stroke();
      }
      if (snapGuideY != null) {
        context.beginPath();
        context.moveTo(0, snapGuideY);
        context.lineTo(CANVAS_W, snapGuideY);
        context.stroke();
      }
      context.restore();
    }
  }

  // ---------------- 元に戻す/やり直し (Ctrl+Z / Ctrl+Y) ----------------
  // 個々の操作ごとにコマンドを記録する方式ではなく、renderAll()が呼ばれる
  // たびに「一定時間呼び出しが途切れたら1つのチェックポイントとして
  // 記録する」方式にしている——ドラッグ中やスライダー操作中は毎フレーム
  // renderAll()が呼ばれるため、そのままだと巻き戻り幅が細かすぎて
  // 使い物にならない。renderAll()はほぼ全てのstate変更後に呼ばれている
  // ため、これだけで大半の操作を横断的にカバーできる。
  const UNDO_LIMIT = 50;
  const UNDO_COMMIT_DELAY_MS = 500;
  let undoStack = [];
  let redoStack = [];
  let undoCommitTimer = null;
  let suppressUndoCommit = false; // undo/redoの適用自体を新規チェックポイントとして記録しないためのガード

  // state.backgrounds/state.charactersに乗っているimg（と退去エフェクト用
  // video）はDOM要素でありstructuredCloneできないため、いったん取り除いて
  // クローンしてから、元のオブジェクトとクローン結果の両方へ同じ参照を
  // 戻す——画像・動画データ自体は変化しないので参照を使い回して問題ない
  // （毎回re-encodeするとundo/redoのたびに重くなってしまう）。
  // digestは画像を含まないクローン直後のJSON文字列で、直前のチェック
  // ポイントと内容が変わっていないかの比較にだけ使う（img参照を含む
  // 状態はJSON化できない＝循環参照で例外になるため、必ずこの時点で作る）。
  function cloneStateData(source) {
    const bgImgs = source.backgrounds.map((b) => b.img);
    const charImgs = source.characters.map((c) => c.img);
    const charVariantImgs = source.characters.map((c) => c.variants.map((v) => v.img));
    const charVideos = source.characters.map((c) => c._departureVideoEl || null);
    const bgmAudios = source.bgmTracks.map((t) => t.audio);

    source.backgrounds.forEach((b) => {
      b.img = null;
    });
    source.characters.forEach((c) => {
      c.img = null;
      c.variants.forEach((v) => {
        v.img = null;
      });
      delete c._departureVideoEl;
    });
    source.bgmTracks.forEach((t) => {
      t.audio = null;
    });

    let cloned, digest;
    try {
      cloned = structuredClone(source);
      digest = JSON.stringify(cloned);
    } finally {
      source.backgrounds.forEach((b, i) => {
        b.img = bgImgs[i];
      });
      source.characters.forEach((c, i) => {
        c.img = charImgs[i];
        c.variants.forEach((v, j) => {
          v.img = charVariantImgs[i][j];
        });
        if (charVideos[i]) c._departureVideoEl = charVideos[i];
      });
      source.bgmTracks.forEach((t, i) => {
        t.audio = bgmAudios[i];
      });
    }

    cloned.backgrounds.forEach((b, i) => {
      b.img = bgImgs[i];
    });
    cloned.characters.forEach((c, i) => {
      c.img = charImgs[i];
      c.variants.forEach((v, j) => {
        v.img = charVariantImgs[i][j];
      });
      if (charVideos[i]) c._departureVideoEl = charVideos[i];
    });
    cloned.bgmTracks.forEach((t, i) => {
      t.audio = bgmAudios[i];
    });

    return { data: cloned, digest };
  }

  // 現在のstateを1チェックポイントとして積む。直前と内容が同じなら
  // 積み直さない。シナリオ再生中・undo/redo適用中は記録しない
  // （再生中は行のスナップショットが位置/拡縮を保持しないなど別物のため、
  // 巻き戻り対象として意味を持たない）。
  function commitUndoCheckpoint() {
    if (suppressUndoCommit || playback) return;
    const snapshot = cloneStateData(state);
    const last = undoStack[undoStack.length - 1];
    if (last && last.digest === snapshot.digest) return;
    undoStack.push(snapshot);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0; // 新しい変更が入った時点で、それより後のredo履歴は無効になる
  }

  function scheduleUndoCommit() {
    if (undoCommitTimer) clearTimeout(undoCommitTimer);
    undoCommitTimer = setTimeout(() => {
      undoCommitTimer = null;
      commitUndoCheckpoint();
    }, UNDO_COMMIT_DELAY_MS);
  }

  // スタックに積んであるチェックポイントをstateへ適用する。スタック側の
  // エントリとstateが同じオブジェクトを共有してしまわないよう、適用時にも
  // 独立したクローンを作る。
  function applyStateSnapshot(entry) {
    const restored = cloneStateData(entry.data);
    suppressUndoCommit = true;
    try {
      Object.assign(state, restored.data);
      // 選択中扱いのidが、復元後の一覧にもう存在しない場合は選択解除する
      if (!state.characters.some((c) => c.id === state.selectedId)) state.selectedId = null;
      if (!state.backgrounds.some((b) => b.id === state.activeBackgroundId)) state.activeBackgroundId = null;
      if (!state.scenario.some((l) => l.id === state.scenarioSelectedId)) state.scenarioSelectedId = null;
      syncUiFromState();
    } finally {
      suppressUndoCommit = false;
    }
  }

  function performUndo() {
    if (playback || undoStack.length <= 1) return; // 末尾＝現在なので、それより前が無ければ戻れない
    const current = undoStack.pop();
    redoStack.push(current);
    applyStateSnapshot(undoStack[undoStack.length - 1]);
  }

  function performRedo() {
    if (playback || redoStack.length === 0) return;
    const next = redoStack.pop();
    undoStack.push(next);
    applyStateSnapshot(next);
  }

  // プレビュー下の操作ヒント表示を差し替える——何か選択中/操作中の間は
  // 通常のヒント文言の代わりに「立ち絵：○○　/　シーンN: ○○」を表示し、
  // 何も選択していなければ通常のヒントに戻す。renderAll()から毎回呼んで
  // いるが、テキストを差し替えるだけの軽い処理なのでデバウンスは不要。
  function updateStageStatus() {
    const parts = [];
    if (state.selectedId != null) {
      const c = getCharacter(state.selectedId);
      if (c) parts.push("立ち絵：" + (c.name || "キャラクター"));
    }
    const line = state.scenario.find((l) => l.id === state.scenarioSelectedId);
    if (line && !line.isStartingFade && !line.isEndingFade) {
      let realLineNumber = 0;
      for (const l of state.scenario) {
        if (l.isStartingFade || l.isEndingFade) continue;
        realLineNumber++;
        if (l.id === line.id) break;
      }
      parts.push("シーン" + realLineNumber + ": " + summarizeScenarioLine(line).title);
    }
    stageHint.classList.toggle("is-status", parts.length > 0);
    stageHint.textContent = parts.length > 0 ? parts.join("　/　") : STAGE_HINT_DEFAULT_TEXT;
  }

  let renderQueued = false;
  function renderAll() {
    scheduleUndoCommit();
    updateStageStatus();
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      drawScene(ctx);
      drawEditorOverlay(ctx);
    });
  }

  // ---------------- キャンバスのポインタ操作 ----------------
  let dragMode = null; // 'move' | 'resize' | 'bg-pan' | 'log-scroll' | 'log-scrollbar' | null
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragStartDist = 0;
  let dragStartScale = 1;
  let dragAnchorX = 0; // 掴んでいるリサイズハンドルの反対側にある、キャンバス空間上の固定コーナー
  let dragAnchorY = 0;
  let dragGX = 1; // 掴んでいるハンドルの中心に対する符号（各軸±1）
  let dragGY = 1;
  let dragBg = null;
  let dragBgStartPanX = 0;
  let dragBgStartPanY = 0;
  let dragBgStartPos = null;
  let snapGuideX = null; // アクティブな縦ガイド線のキャンバス空間x座標、なければnull
  let snapGuideY = null; // アクティブな横ガイド線のキャンバス空間y座標、なければnull

  // 候補となる中心座標を、ある1軸上でのキャンバス中央/端揃えのターゲットと
  // 比較し、（SNAP_THRESHOLD以内で）最も近い候補についてスナップ後の値と
  // ガイド線の位置を返す。該当なしならnull。
  function snapAxis(centerPos, halfSize, canvasSize) {
    const candidates = [
      { value: canvasSize / 2, guide: canvasSize / 2 }, // 中心同士を揃える
      { value: halfSize, guide: 0 }, // 近い方の端に揃える
      { value: canvasSize - halfSize, guide: canvasSize }, // 遠い方の端に揃える
    ];
    let best = null;
    for (const cand of candidates) {
      const delta = Math.abs(centerPos - cand.value);
      if (delta <= SNAP_THRESHOLD && (!best || delta < best.delta)) {
        best = { value: cand.value, guide: cand.guide, delta };
      }
    }
    return best;
  }

  function getCanvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  function hitCharacter(c, pos) {
    const { left, top, w, h } = charBBox(c);
    return pos.x >= left && pos.x <= left + w && pos.y >= top && pos.y <= top + h;
  }

  // SKIP/LOG/AUTO/NEXTの当たり判定（キャンバス座標系）。
  function hitSkipIcon(pos) {
    return pos.x >= SKIP_HIT_X && pos.x <= SKIP_HIT_X + SKIP_HIT_W && pos.y >= SKIP_HIT_Y && pos.y <= SKIP_HIT_Y + SKIP_HIT_H;
  }
  function hitLogIcon(pos) {
    return pos.x >= ICON_X && pos.x <= ICON_X + ICON_SIZE && pos.y >= ICON_LOG_Y && pos.y <= ICON_LOG_Y + ICON_SIZE;
  }
  function hitAutoIcon(pos) {
    return pos.x >= ICON_X && pos.x <= ICON_X + ICON_SIZE && pos.y >= ICON_AUTO_Y && pos.y <= ICON_AUTO_Y + ICON_SIZE;
  }
  // 現在表示中の選択肢のうち、posが当たったスロットのインデックス（0始まり）。
  // どれにも当たらなければ-1。
  function hitChoiceIndex(pos) {
    if (!state.showChoices) return -1;
    if (pos.x < CHOICE_BOX_X || pos.x > CHOICE_BOX_X + CHOICE_BOX_W) return -1;
    const choiceBoxH = CHOICE_BOX_W * (assets.linesBox.naturalHeight / assets.linesBox.naturalWidth);
    const centers = choiceSlotCenters(state.choiceCount, choiceBoxH);
    for (let idx = 0; idx < centers.length; idx++) {
      const top = centers[idx] - choiceBoxH / 2;
      if (pos.y >= top && pos.y <= top + choiceBoxH) return idx;
    }
    return -1;
  }

  canvas.addEventListener("pointerdown", (evt) => {
    const pos = getCanvasPos(evt);

    if (playback) {
      // 暗転演出中（開始・終了・場面転換のいずれも）は一切のクリックを
      // 無視する（SKIPの連打による再トリガーも防ぐ）
      if (startingFadeAnim || endingFadeAnim || sceneTransitionAnim) return;

      // LOG画面が開いている間は、他の操作は一切せずスクロール操作専用に
      // する。スクロールバーのつまみを掴んだ場合はそれ専用のドラッグ
      // （dragMode="log-scrollbar"、動かしてもタップ扱いにはならず閉じない）、
      // それ以外の場所を掴んだ場合はログ全体のドラッグでスクロールし、
      // 動かさずタップしたら閉じる（dragMode="log-scroll"）。
      if (logOverlayOpen) {
        if (hitLogScrollbarHandle(pos)) {
          const geo = getLogScrollGeometry();
          logScrollbarDragStartClientY = evt.clientY;
          logScrollbarDragStartScrollTop = geo.scrollTop;
          logScrollbarDragGeo = geo;
          dragMode = "log-scrollbar";
          canvas.setPointerCapture(evt.pointerId);
          return;
        }
        logDragStartClientY = evt.clientY;
        logDragStartScroll = logScrollOffset;
        logDragMoved = false;
        dragMode = "log-scroll";
        canvas.setPointerCapture(evt.pointerId);
        return;
      }

      // 選択肢・SKIPなど、実際に何が起きるかに関わらず、再生中に受け付ける
      // クリック/タップには必ずその位置へ演出を出す（本家のタップ演出と
      // 同じ感覚——「押した場所が分かる」フィードバック自体が目的のため）
      spawnTapEffect(pos.x, pos.y);

      // SKIPは進行方式や選択肢の有無に関わらず、常に再生を中止する。
      // 「暗転して終了」行が有効な間はSKIPでも暗転を挟んでから終了する。
      if (state.showButtons && state.showSkip && hitSkipIcon(pos)) {
        const hasEndingFade = state.scenario.some((l) => l.isEndingFade && l.enabled);
        if (hasEndingFade) {
          beginEndingFade();
        } else {
          stopScenarioPlayback();
        }
        return;
      }

      // AUTOボタンは本家同様、再生中いつでもクリックしてAUTO/手動を
      // その場で切り替えられる（選択肢表示中も含む）
      if (state.showButtons && state.showAuto && hitAutoIcon(pos)) {
        setScenarioAdvanceMode(state.scenarioAdvanceMode === "auto" ? "manual" : "auto");
        return;
      }

      // LOGボタンは進行方式や選択肢の有無に関わらずいつでも開ける
      // （SKIP/AUTOと同じ優先度）。閉じるのは上のlogOverlayOpen分岐
      // （タップで閉じる）側で行う。
      if (state.showButtons && state.showLog && hitLogIcon(pos)) {
        logOverlayOpen = true;
        logScrollOffset = 0; // 開いた直後は必ず最新（一番下）から見せる
        pauseAutoAdvanceForLog();
        // renderAll()は呼ばない——再生中はtick()が既に毎フレーム
        // drawLogOverlay込みで描画し続けているので、ここで呼ぶと
        // drawLogOverlayを含まない別系統の描画がtick()と競合して
        // 一瞬ログが消えるちらつきの原因になる（下の関連箇所も同様）。
        return;
      }

      const line = playback.currentLine;
      if (line && (line.isStartingFade || line.isEndingFade || line.isSceneTransition)) return; // 通常は上のガードで既に弾かれる
      // 退去エフェクト再生行はSKIP/AUTO以外クリックしても何も起きない
      // ——対象キャラ全員の退去が完了するまで進行方式に関わらず進めない
      if (line && lineHasDeparture(line)) return;

      if (line && line.showChoices && choiceAnim) {
        // 選択肢表示中はSKIP以外、選択肢ボックス以外をクリックしても何も
        // 起きない（進行方式に関わらず選択されるまで一時停止する）
        if (choiceAnim.phase === "waiting" && (!dialogueAnim || dialogueAnim.phase === "holding")) {
          const idx = hitChoiceIndex(pos);
          if (idx !== -1) {
            choiceAnim.phase = "exiting";
            choiceAnim.selectedIdx = idx;
            choiceAnim.startTime = performance.now();
          }
        }
        return;
      }

      // 通常（選択肢でない）行では、手動進行の場合に限りSKIP/LOG/AUTO以外の
      // どこをクリックしても次へ進む（本家UIはNEXTボタンのみだが、
      // 押しやすさのため全体に拡張）。AUTOは上でクリックを既に処理済み
      // （ここに来る時点でhitAutoIcon(pos)は必ずfalse）、LOGは非機能の
      // まま——非表示（トグルOFF）ならその領域も含めてどこでも次へ進んでよい。
      // 文字が表示し終わるまでは無視する。
      if (line && state.scenarioAdvanceMode === "manual") {
        const onLog = state.showButtons && state.showLog && hitLogIcon(pos);
        if (!onLog) {
          if (!dialogueAnim || dialogueAnim.phase === "holding") {
            advanceScenarioPlayback();
          }
        }
      }
      // 再生中はここまでの判定以外のキャンバス操作を無効化する——行の
      // スナップショットは位置/拡縮を保持しないため、再生中にドラッグ/
      // リサイズされると以降の行がずっと誤った位置のまま録画され続けてしまう
      return;
    }

    if (state.selectedId != null) {
      const selected = getCharacter(state.selectedId);
      const handleIdx = selected ? hitHandleIndex(selected, pos) : -1;
      if (selected && handleIdx !== -1) {
        const [gx, gy] = HANDLE_MULTIPLIERS[handleIdx];
        const { left, top, w, h } = charBBox(selected);
        dragMode = "resize";
        dragGX = gx;
        dragGY = gy;
        // 今掴んだ角の対角線上の反対側 — ドラッグ中はずっと動かないまま
        dragAnchorX = gx > 0 ? left : left + w;
        dragAnchorY = gy > 0 ? top : top + h;
        dragStartDist = Math.hypot(pos.x - dragAnchorX, pos.y - dragAnchorY);
        dragStartScale = getEffectiveScale(selected);
        canvas.setPointerCapture(evt.pointerId);
        canvas.classList.add("is-dragging");
        return;
      }
    }

    let hit = null;
    for (let i = state.characters.length - 1; i >= 0; i--) {
      const cc = state.characters[i];
      if (isCharacterVisible(cc) && hitCharacter(cc, pos)) {
        hit = cc;
        break;
      }
    }

    if (hit) {
      setSelectedCharacter(hit.id);
      dragMode = "move";
      dragOffsetX = pos.x - getEffectiveX(hit);
      dragOffsetY = pos.y - getEffectiveY(hit);
      canvas.setPointerCapture(evt.pointerId);
      canvas.classList.add("is-dragging");
    } else {
      setSelectedCharacter(null);
      // 掴めるものが何もない — パンの余地がある背景があれば
      // （ズームしている、またはアスペクト比に余裕がある場合）、
      // 単に選択解除するのではなくこのドラッグで背景を動かせるようにする。
      const bg = getActiveBackground();
      if (bg) {
        const { maxPanX, maxPanY } = getBackgroundFitRect(bg, CANVAS_W, CANVAS_H);
        if (maxPanX > 0.5 || maxPanY > 0.5) {
          dragMode = "bg-pan";
          dragBg = bg;
          dragBgStartPanX = bg.panX;
          dragBgStartPanY = bg.panY;
          dragBgStartPos = pos;
          canvas.setPointerCapture(evt.pointerId);
          canvas.classList.add("is-dragging");
        }
      }
    }
    renderCharList();
    renderCharEditor();
    syncSpeakerFromFrontChar();
    renderAll();
  });

  canvas.addEventListener("pointermove", (evt) => {
    if (!dragMode) return;

    if (dragMode === "log-scrollbar") {
      const rect = canvas.getBoundingClientRect();
      const scaleY = canvas.height / rect.height;
      const dyCanvas = (evt.clientY - logScrollbarDragStartClientY) * scaleY;
      const geo = logScrollbarDragGeo;
      const trackRange = geo.viewHeight - geo.handleHeight; // つまみが実際に動ける範囲(px)
      // つまみを1px動かすとログの中身は(全体の高さ/動ける範囲)pxぶん動く——
      // 標準的なスクロールバーの比率換算
      const dScrollTop = trackRange > 0 ? (dyCanvas / trackRange) * geo.maxScroll : 0;
      const newScrollTop = Math.min(geo.maxScroll, Math.max(0, logScrollbarDragStartScrollTop + dScrollTop));
      logScrollOffset = geo.maxScroll - newScrollTop;
      // ここでもrenderAll()は呼ばない（理由は開閉部分のコメント参照）。
      // 再生中のtick()ループが次フレームで最新のlogScrollOffsetを
      // 自然に反映してくれる。
      return;
    }

    if (dragMode === "log-scroll") {
      const dy = evt.clientY - logDragStartClientY;
      if (Math.abs(dy) > LOG_TAP_THRESHOLD_PX) logDragMoved = true;
      // clientY（CSSピクセル）からキャンバス座標系への比率はgetCanvasPosと同じ
      const rect = canvas.getBoundingClientRect();
      const scaleY = canvas.height / rect.height;
      // 指/カーソルを下に動かす（dy>0）と、紙を引き下げるように過去の内容が
      // 下からせり出してくる（logScrollOffsetが増える＝上＝過去へ）のが
      // タッチスクロールの自然な感覚に合う
      logScrollOffset = clampLogScroll(logDragStartScroll + dy * scaleY);
      // renderAll()は呼ばない——tick()ループが毎フレーム描画済み
      return;
    }

    const pos = getCanvasPos(evt);

    if (dragMode === "bg-pan") {
      if (!dragBg) return;
      const { scale } = getBackgroundFitRect(dragBg, CANVAS_W, CANVAS_H);
      dragBg.panX = dragBgStartPanX + (pos.x - dragBgStartPos.x) / scale;
      dragBg.panY = dragBgStartPanY + (pos.y - dragBgStartPos.y) / scale;
      clampBackgroundPan(dragBg, CANVAS_W, CANVAS_H);
      renderAll();
      return;
    }

    if (state.selectedId == null) return;
    const c = getCharacter(state.selectedId);
    if (!c) return;

    if (dragMode === "move") {
      const { w, h } = charBBox(c); // サイズはscaleのみに依存し、位置には依存しない
      const rawX = pos.x - dragOffsetX;
      const rawY = pos.y - dragOffsetY;
      const snapX = snapAxis(rawX, w / 2, CANVAS_W);
      const snapY = snapAxis(rawY, h / 2, CANVAS_H);
      const newEffX = snapX ? snapX.value : rawX;
      const newEffY = snapY ? snapY.value : rawY;
      // ドラッグが動かすのはアクティブな差分自身の補正ではなく共有の基準点
      // なので、全ての差分が同じ量だけ一緒に動く——補正分を差し引いて
      // 戻すことで新しい共有のc.x/c.yを求める
      const variant = c.variants[c.activeVariantIndex];
      c.x = newEffX - (variant.offsetX || 0);
      c.y = newEffY - (variant.offsetY || 0);
      snapGuideX = snapX ? snapX.guide : null;
      snapGuideY = snapY ? snapY.guide : null;
    } else if (dragMode === "resize") {
      const dist = Math.hypot(pos.x - dragAnchorX, pos.y - dragAnchorY);
      const ratio = dragStartDist > 1 ? dist / dragStartDist : 1;
      let newScale = Math.min(6, Math.max(0.03, dragStartScale * ratio));

      // 基準点となる角（ドラッグしているハンドルの反対側）は固定されたまま
      // なので、各軸の反対側の端だけが実際に動く——その端がキャンバスの
      // 境界の近くに来たらスナップさせる。
      const src = spriteSourceRect(c);
      const w = src.w * newScale;
      const h = src.h * newScale;
      const curXEdge = dragAnchorX + dragGX * w;
      const curYEdge = dragAnchorY + dragGY * h;
      const edgeCandidates = [];
      [0, CANVAS_W].forEach((target) => {
        const scale = ((target - dragAnchorX) * dragGX) / src.w;
        if (scale > 0) edgeCandidates.push({ delta: Math.abs(curXEdge - target), scale, guideX: target });
      });
      [0, CANVAS_H].forEach((target) => {
        const scale = ((target - dragAnchorY) * dragGY) / src.h;
        if (scale > 0) edgeCandidates.push({ delta: Math.abs(curYEdge - target), scale, guideY: target });
      });
      let best = null;
      for (const cand of edgeCandidates) {
        if (cand.delta <= SNAP_THRESHOLD && (!best || cand.delta < best.delta)) best = cand;
      }
      if (best) {
        newScale = Math.min(6, Math.max(0.03, best.scale));
        snapGuideX = best.guideX !== undefined ? best.guideX : null;
        snapGuideY = best.guideY !== undefined ? best.guideY : null;
      } else {
        snapGuideX = null;
        snapGuideY = null;
      }
      const finalW = src.w * newScale;
      const finalH = src.h * newScale;
      const newEffX = dragAnchorX + (dragGX * finalW) / 2;
      const newEffY = dragAnchorY + (dragGY * finalH) / 2;
      // newScale/newEffX/newEffYはいずれもeffective空間の値
      // （このブロック全体がcharBBox/dragAnchorを基準に動いており、
      // それらはすでにアクティブな差分の補正を含んでいる）——move側の
      // 分岐と同じ方法で共有のc.x/c.y/c.scaleに変換し戻すことで、
      // リサイズも全ての差分に一緒に適用されるようにする。
      const variant = c.variants[c.activeVariantIndex];
      c.x = newEffX - (variant.offsetX || 0);
      c.y = newEffY - (variant.offsetY || 0);
      c.scale = newScale / (variant.scaleAdjust || 1);
    }
    renderAll();
  });

  function endDrag(evt) {
    if (!dragMode) return;
    if (dragMode === "log-scrollbar") {
      // つまみの明示的なドラッグ操作なので、動かした量に関わらずログを
      // 閉じたりはしない
      dragMode = null;
      logScrollbarDragGeo = null;
      try {
        canvas.releasePointerCapture(evt.pointerId);
      } catch (e) {
        /* 何もしない */
      }
      // renderAll()は呼ばない——再生中のtick()ループが毎フレーム
      // drawLogOverlay込みで描画しているので不要（呼ぶとtick()の描画と
      // 競合して一瞬ログが消えるちらつきの原因になる）
      return;
    }
    if (dragMode === "log-scroll") {
      // ほとんど動かさずに離した＝スクロールではなくタップ——LOG画面を閉じる
      if (!logDragMoved) {
        logOverlayOpen = false;
        resumeAutoAdvanceAfterLog();
      }
      dragMode = null;
      try {
        canvas.releasePointerCapture(evt.pointerId);
      } catch (e) {
        /* 何もしない */
      }
      // renderAll()は呼ばない（理由は直前の分岐のコメント参照）
      return;
    }
    dragMode = null;
    dragBg = null;
    snapGuideX = null;
    snapGuideY = null;
    canvas.classList.remove("is-dragging");
    try {
      canvas.releasePointerCapture(evt.pointerId);
    } catch (e) {
      /* 何もしない */
    }
    renderCharEditor(); // 拡縮率/位置の表示が変わっている可能性がある
    renderAll(); // 上でリセットしたガイド線を消す
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // LOG画面が開いている間だけ、マウスホイールでもスクロールできるように
  // する（タッチのドラッグスクロールはpointerdown/pointermove側で対応）
  canvas.addEventListener(
    "wheel",
    (evt) => {
      if (!playback || !logOverlayOpen) return;
      evt.preventDefault();
      logScrollOffset = clampLogScroll(logScrollOffset - evt.deltaY);
      // renderAll()は呼ばない——tick()ループが毎フレーム描画済み
      // （呼ぶとtick()の描画と競合して一瞬ログが消えるちらつきの原因になる）
    },
    { passive: false }
  );

  // ---------------- キャラクターリスト / エディタUI ----------------
  // エクスプローラー風のリネーム：単なるクリックは選択のみ（liの
  // クリックリスナー側で処理）。すでに選択済みの状態で名前を再度
  // クリックすると、その場でテキスト入力に切り替わる。
  function wireInlineRename(node, name, commit, requireSelected = true) {
    const nameSpan = node.querySelector(".charlist__name");
    nameSpan.addEventListener("click", (e) => {
      if (requireSelected && !node.classList.contains("is-selected")) return;
      e.stopPropagation();

      const input = document.createElement("input");
      input.type = "text";
      input.className = "charlist__name-input";
      input.maxLength = 20;
      input.value = name;
      nameSpan.replaceWith(input);
      input.focus();
      input.select();

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        const val = input.value.trim();
        commit(val || name);
      };
      input.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") input.blur();
        if (evt.key === "Escape") {
          input.value = name;
          input.blur();
        }
      });
      input.addEventListener("blur", finish);
    });
  }

  // ドラッグ中のキャラクターid。シナリオ行のドラッグ（wireScenarioDragHandle）
  // と同じ方式——ハンドルにsetPointerCaptureはせず、ドラッグ中だけwindowに
  // move/upリスナーを足し、実際のDOM要素をinsertBefore/appendChildで直接
  // 並べ替える。指を離した時点でstate.charactersへ反映して1回だけ再描画する。
  let charDragId = null;

  function wireCharDragHandle(node, c) {
    const handle = node.querySelector(".charlist__drag-handle");
    handle.addEventListener("pointerdown", (evt) => {
      evt.preventDefault();
      evt.stopPropagation(); // 行の選択（liクリック）を誘発しない
      charDragId = c.id;
      node.classList.add("is-dragging");

      const onMove = (moveEvt) => {
        if (charDragId !== c.id) return;
        const items = Array.from(charList.children);
        for (const item of items) {
          if (item === node) continue;
          const rect = item.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (moveEvt.clientY < mid) {
            charList.insertBefore(node, item);
            return;
          }
        }
        charList.appendChild(node); // どの項目より下 — 一覧の末尾（＝一番背面）へ
      };
      const onUp = () => {
        if (charDragId !== c.id) return;
        charDragId = null;
        node.classList.remove("is-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        // 実際に並び替わったDOM順序を読み取ってstate.charactersへ反映する。
        // 一覧は最前面が一番上に来る表示なので（renderCharList参照）、
        // DOM順とstate.characters順（奥→手前）は逆になる——比較を反転させる。
        const orderedIds = Array.from(charList.children).map((el) => Number(el.dataset.id));
        state.characters.sort((a, b) => orderedIds.indexOf(b.id) - orderedIds.indexOf(a.id));
        renderCharList();
        renderCharEditor();
        syncSpeakerFromFrontChar();
        renderAll();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  }

  function renderCharList() {
    charList.innerHTML = "";
    const frontIndex = resolveFrontIndex();
    // state.charactersは奥→手前の順だが、一覧は最前面が直感的に分かる
    // よう一番上に表示したいので、逆順（手前→奥）に辿ってappendする
    // （配列自体・indexの意味は変えない——見た目の並びだけを反転させる）
    for (let i = state.characters.length - 1; i >= 0; i--) {
      const c = state.characters[i];
      const node = charItemTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.id = String(c.id);
      node.querySelector("img").src = c.img.src;
      node.querySelector(".charlist__name").textContent = c.name || "キャラクター";
      if (c.id === state.selectedId) node.classList.add("is-selected");
      if (i === frontIndex) node.classList.add("is-active");
      if (!isCharacterVisible(c)) node.classList.add("is-hidden");
      node.addEventListener("click", () => {
        setSelectedCharacter(c.id);
        renderCharList();
        renderCharEditor();
        syncSpeakerFromFrontChar();
        renderAll();
      });
      const visBtn = node.querySelector(".charlist__visibility-btn");
      const isVisible = c.visible !== false;
      visBtn.textContent = isVisible ? "👁" : "🚫";
      visBtn.title = isVisible ? "非表示にする" : "表示する";
      visBtn.classList.toggle("is-off", !isVisible);
      visBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        c.visible = !isVisible;
        renderCharList();
        syncSpeakerFromFrontChar();
        renderAll();
      });
      node.querySelector(".charlist__del").addEventListener("click", (e) => {
        e.stopPropagation();
        removeCharacter(c.id);
      });
      wireInlineRename(node, c.name || "キャラクター", (newName) => {
        c.name = newName;
        renderCharList();
        syncSpeakerFromFrontChar();
      });
      wireCharDragHandle(node, c);
      charList.appendChild(node);
    }
    charCount.textContent = state.characters.length + "/" + MAX_CHARACTERS;
    charAddLabel.style.opacity = state.characters.length >= MAX_CHARACTERS ? "0.4" : "1";
    charInput.disabled = state.characters.length >= MAX_CHARACTERS;
  }

  // 現在選択中のキャラクターの、代替となる全身差分画像（ポーズ/衣装）の
  // 一覧 — char-editorパネルの中、メインのキャラクターリストより
  // 1階層下に存在する。
  function renderVariantList(c) {
    const list = charEditor.querySelector("#variantList");
    if (!list) return;
    list.innerHTML = "";
    c.variants.forEach((v, idx) => {
      const node = charItemTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.id = String(idx);
      node.querySelector("img").src = v.img.src;
      node.querySelector(".charlist__name").textContent = v.name || "差分";
      node.querySelector(".charlist__active-dot").title = "表示中の差分";
      node.querySelector(".charlist__visibility-btn").remove(); // 表示/非表示はキャラクター単位の概念であり差分ごとには無い
      if (idx === c.activeVariantIndex) {
        node.classList.add("is-selected");
        node.classList.add("is-active");
      }
      node.addEventListener("click", () => switchCharacterVariant(c, idx));
      const delBtn = node.querySelector(".charlist__del");
      if (c.variants.length <= 1) {
        delBtn.disabled = true;
        delBtn.style.opacity = "0.35";
        delBtn.style.cursor = "not-allowed";
      } else {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeVariant(c, idx);
        });
      }
      wireInlineRename(node, v.name || "差分", (newName) => {
        v.name = newName;
        renderVariantList(c);
      });
      list.appendChild(node);
    });
  }

  function renderCharEditor() {
    const c = state.selectedId != null ? getCharacter(state.selectedId) : null;
    if (!c) {
      charEditor.className = "char-editor char-editor--empty";
      charEditor.innerHTML =
        '<p class="char-editor__empty-msg">キャラクターを選択すると、ここで調整できます</p>';
      return;
    }
    charEditor.className = "char-editor";
    const scalePct = Math.round(c.scale * 100);
    const activeVariant = c.variants[c.activeVariantIndex];
    const i = state.characters.findIndex((x) => x.id === c.id);
    const isFront = i === state.characters.length - 1;
    const isBack = i === 0;

    charEditor.innerHTML = `
      <span class="char-editor__label" style="margin-top:0;">位置（ドラッグで移動。中心・端に近づくと吸着します）</span>
      <div class="char-editor__row" style="align-items: center;">
        <span class="field__label" style="margin:0; width:12px;">X</span>
        <input type="range" id="posXRange" min="${POS_X_MIN}" max="${POS_X_MAX}" value="${Math.round(c.x)}" style="flex: 1;">
        <input type="number" id="posXInput" value="${Math.round(c.x)}" step="1" class="field__input field__input--number field__input--number-small">
      </div>
      <div class="char-editor__row" style="align-items: center;">
        <span class="field__label" style="margin:0; width:12px;">Y</span>
        <input type="range" id="posYRange" min="${POS_Y_MIN}" max="${POS_Y_MAX}" value="${Math.round(c.y)}" style="flex: 1;">
        <input type="number" id="posYInput" value="${Math.round(c.y)}" step="1" class="field__input field__input--number field__input--number-small">
      </div>

      <span class="char-editor__label">拡大縮小（ドラッグでも調整可）</span>
      <div class="char-editor__row" style="align-items: center;">
        <input type="range" id="scaleRange" min="3" max="400" value="${scalePct}" style="flex: 1;">
        <input type="number" id="scaleNumInput" min="3" max="400" value="${scalePct}" class="field__input field__input--number field__input--number-small">
      </div>

      <div class="char-editor__row char-editor__row--toggles">
        <div class="mini-toggle">
          <span class="char-editor__label">反転</span>
          <button type="button" class="toggle-btn ${c.flipX ? "is-on" : ""}" id="flipBtn">${c.flipX ? "ON" : "OFF"}</button>
        </div>
        <div class="mini-toggle">
          <span class="char-editor__label">シルエット</span>
          <button type="button" class="toggle-btn ${c.silhouette ? "is-on" : ""}" id="silhouetteBtn">${c.silhouette ? "ON" : "OFF"}</button>
        </div>
        <div class="mini-toggle">
          <span class="char-editor__label">ホログラム</span>
          <button type="button" class="toggle-btn ${c.hologram ? "is-on" : ""}" id="hologramBtn">${c.hologram ? "ON" : "OFF"}</button>
        </div>
        <div class="mini-toggle">
          <span class="char-editor__label">グレースケール</span>
          <button type="button" class="toggle-btn ${c.grayscale ? "is-on" : ""}" id="grayscaleBtn">${c.grayscale ? "ON" : "OFF"}</button>
        </div>
      </div>

      <span class="char-editor__label">透明度</span>
      <div class="char-editor__row" style="align-items: center;">
        <input type="range" id="opacityRange" min="0" max="100" value="${Math.round(c.opacity)}" style="flex: 1;">
        <input type="number" id="opacityNumInput" min="0" max="100" value="${Math.round(c.opacity)}" class="field__input field__input--number field__input--number-small">
      </div>

      <div class="field-box">
        <span class="char-editor__label">端のフェード</span>
        <div class="char-editor__row" style="align-items: center;">
          <input type="range" id="edgeFadeRange" min="0" max="100" value="${Math.round(c.edgeFadeAmount)}" style="flex: 1;">
          <input type="number" id="edgeFadeNumInput" min="0" max="100" value="${Math.round(c.edgeFadeAmount)}" class="field__input field__input--number field__input--number-small">
        </div>
        <div class="char-editor__row char-editor__row--toggles">
          <div class="mini-toggle">
            <span class="char-editor__label">上</span>
            <button type="button" class="toggle-btn ${c.edgeFadeTop ? "is-on" : ""}" id="edgeFadeTopBtn">${c.edgeFadeTop ? "ON" : "OFF"}</button>
          </div>
          <div class="mini-toggle">
            <span class="char-editor__label">下</span>
            <button type="button" class="toggle-btn ${c.edgeFadeBottom ? "is-on" : ""}" id="edgeFadeBottomBtn">${c.edgeFadeBottom ? "ON" : "OFF"}</button>
          </div>
          <div class="mini-toggle">
            <span class="char-editor__label">左</span>
            <button type="button" class="toggle-btn ${c.edgeFadeLeft ? "is-on" : ""}" id="edgeFadeLeftBtn">${c.edgeFadeLeft ? "ON" : "OFF"}</button>
          </div>
          <div class="mini-toggle">
            <span class="char-editor__label">右</span>
            <button type="button" class="toggle-btn ${c.edgeFadeRight ? "is-on" : ""}" id="edgeFadeRightBtn">${c.edgeFadeRight ? "ON" : "OFF"}</button>
          </div>
        </div>
      </div>

      <div class="field-box">
        <div class="char-editor__row" style="align-items: center; margin-bottom: ${c.departureEnabled ? "10px" : "0"};">
          <span class="char-editor__label" style="margin: 0;">退去エフェクト</span>
          <button type="button" class="toggle-btn ${c.departureEnabled ? "is-on" : ""}" id="departureBtn" style="margin-left: auto;">${c.departureEnabled ? "ON" : "OFF"}</button>
        </div>
        ${c.departureEnabled ? `
          <span class="char-editor__label">進行度</span>
          <div class="char-editor__row" style="align-items: center;">
            <input type="range" id="departureProgressRange" min="0" max="100" value="${Math.round(c.departureProgress)}" style="flex: 1;">
            <input type="number" id="departureProgressNumInput" min="0" max="100" value="${Math.round(c.departureProgress)}" class="field__input field__input--number field__input--number-small">
          </div>

          <span class="char-editor__label">フェード開始/終了（進行度%）</span>
          <div class="char-editor__row">
            <label class="field">
              <span class="field__label">開始</span>
              <input type="number" class="field__input field__input--number-small" id="departureFadeStartInput" value="${Math.round(c.departureFadeStart)}" min="0" max="100" step="1">
            </label>
            <label class="field">
              <span class="field__label">終了</span>
              <input type="number" class="field__input field__input--number-small" id="departureFadeEndInput" value="${Math.round(c.departureFadeEnd)}" min="0" max="100" step="1">
            </label>
          </div>

          <span class="char-editor__label">位置・サイズ補正（デフォルトは立ち絵と縦幅を一致・中央揃え・底辺基準）</span>
          <div class="char-editor__row" style="align-items: flex-end;">
            <label class="field" style="flex: 1;">
              <span class="field__label">X補正</span>
              <input type="number" class="field__input" id="departureOffsetXInput" value="${Math.round(c.departureOffsetX)}" step="1">
            </label>
            <label class="field" style="flex: 1;">
              <span class="field__label">Y補正</span>
              <input type="number" class="field__input" id="departureOffsetYInput" value="${Math.round(c.departureOffsetY)}" step="1">
            </label>
            <label class="field" style="flex: 1;">
              <span class="field__label">サイズ%</span>
              <input type="number" class="field__input" id="departureScaleNumInput" value="${Math.round(c.departureScale * 100)}" step="1">
            </label>
          </div>

          <span class="char-editor__label">色相補正（0が現在のデフォルトの色合い）</span>
          <div class="char-editor__row" style="align-items: center;">
            <input type="range" id="departureHueRange" min="-180" max="180" value="${Math.round(c.departureHue || 0)}" style="flex: 1;">
            <input type="number" id="departureHueNumInput" min="-180" max="180" value="${Math.round(c.departureHue || 0)}" class="field__input field__input--number field__input--number-small">
          </div>
        ` : ""}
      </div>

      <span class="char-editor__label">重なり順</span>
      <div class="char-editor__row">
        <button type="button" class="btn btn--sm" id="layerBackBtn" ${isBack ? "disabled" : ""}>ひとつ背面へ</button>
        <button type="button" class="btn btn--sm" id="layerFrontBtn" ${isFront ? "disabled" : ""}>ひとつ前面へ</button>
      </div>

      <span class="char-editor__label" style="margin-top:16px;">差分画像（同キャラの別ポーズ・別ファイル）</span>
      <p class="char-editor__hint">ポーズごとに別ファイルを追加できます。上の位置・拡大縮小はどの差分にも共通で、1つを動かすと全部の差分が同じだけ動きます。差分ごとの微妙なズレは下の「この差分の微調整」で個別に直せます。</p>
      <label class="filebtn" id="variantAddLabel">
        <input type="file" id="variantInput" accept="image/*" hidden>
        <span>差分画像を追加</span>
      </label>
      <ul class="charlist" id="variantList"><!-- JS populates --></ul>

      <span class="char-editor__label" style="margin-top:10px;">この差分の微調整（共通の位置・サイズからのズレ補正）</span>
      <div class="field-grid">
        <label class="field">
          <span class="field__label">X補正</span>
          <input type="number" class="field__input" id="variantOffsetXInput" value="${Math.round(activeVariant.offsetX)}" step="1">
        </label>
        <label class="field">
          <span class="field__label">Y補正</span>
          <input type="number" class="field__input" id="variantOffsetYInput" value="${Math.round(activeVariant.offsetY)}" step="1">
        </label>
      </div>
      <div class="char-editor__row" style="align-items: center; margin-top: 10px;">
        <span class="field__label" style="margin:0; white-space:nowrap;">サイズ補正</span>
        <input type="number" class="field__input field__input--number field__input--number-small" id="variantScaleAdjustInput" value="${Math.round(activeVariant.scaleAdjust * 100)}" step="1">
        <span class="field__label" style="margin:0;">%</span>
        <button type="button" class="btn btn--sm" id="variantResetAdjustBtn" style="margin-left:auto;">補正をリセット</button>
      </div>

      <span class="char-editor__label" style="margin-top:16px;">表情差分シート（本体+差分グリッドの1枚絵）</span>
      <div class="char-editor__row">
        <button type="button" class="toggle-btn ${c.exprSheet.enabled ? "is-on" : ""}" id="exprEnableBtn">${c.exprSheet.enabled ? "ON" : "OFF"}</button>
      </div>

      ${c.exprSheet.enabled ? `
        <details class="collapsible-sub" id="exprDetailsToggle" ${c._exprDetailsOpen === false ? "" : "open"}>
        <summary>詳細設定（本体・顔位置・グリッド）</summary>
        <div class="expr-editor">
          <div class="expr-editor__preview-col">
            <p class="char-editor__hint">元画像サイズ: ${c.naturalW} × ${c.naturalH}px</p>
            <canvas class="expr-editor__preview" id="exprPreviewCanvas"></canvas>
          </div>

          <div class="expr-editor__fields-col">
            <div class="expr-editor__group expr-editor__group--body">
              <span class="char-editor__label">本体（水色）: 立ち絵として使う範囲</span>
              <div class="expr-editor__quad">
                <label class="field"><span class="field__label">X</span><input type="number" step="0.1" class="field__input" id="bodyXInput" value="${c.exprSheet.body.x}"></label>
                <label class="field"><span class="field__label">Y</span><input type="number" step="0.1" class="field__input" id="bodyYInput" value="${c.exprSheet.body.y}"></label>
                <label class="field"><span class="field__label">幅</span><input type="number" step="0.1" class="field__input" id="bodyWInput" value="${c.exprSheet.body.w}"></label>
                <label class="field"><span class="field__label">高さ</span><input type="number" step="0.1" class="field__input" id="bodyHInput" value="${c.exprSheet.body.h}"></label>
              </div>
            </div>

            <div class="expr-editor__group expr-editor__group--face">
              <span class="char-editor__label">顔位置（赤紫）: 本体上で差分を貼り付ける場所</span>
              <div class="char-editor__row">
                <button type="button" class="btn btn--sm" id="faceAutoBtn">自動調整（差分1枚目と見比べて検出）</button>
              </div>
              <div class="char-editor__row">
                <button type="button" class="btn btn--sm" id="faceMatchGridBtn">顔サイズをセルサイズに合わせる</button>
              </div>
              <div class="expr-editor__quad">
                <label class="field"><span class="field__label">X</span><input type="number" step="0.1" class="field__input" id="faceXInput" value="${c.exprSheet.face.x}"></label>
                <label class="field"><span class="field__label">Y</span><input type="number" step="0.1" class="field__input" id="faceYInput" value="${c.exprSheet.face.y}"></label>
                <label class="field"><span class="field__label">幅</span><input type="number" step="0.1" class="field__input" id="faceWInput" value="${c.exprSheet.face.w}"></label>
                <label class="field"><span class="field__label">高さ</span><input type="number" step="0.1" class="field__input" id="faceHInput" value="${c.exprSheet.face.h}"></label>
              </div>
            </div>

            <div class="expr-editor__group expr-editor__group--grid">
              <span class="char-editor__label">差分グリッド（黄色）: 起点とセル1個分のサイズ</span>
              <div class="expr-editor__quad">
                <label class="field"><span class="field__label">X</span><input type="number" step="0.1" class="field__input" id="gridXInput" value="${c.exprSheet.grid.x}"></label>
                <label class="field"><span class="field__label">Y</span><input type="number" step="0.1" class="field__input" id="gridYInput" value="${c.exprSheet.grid.y}"></label>
                <label class="field"><span class="field__label">セル幅</span><input type="number" step="0.1" class="field__input" id="gridCellWInput" value="${c.exprSheet.grid.cellW}"></label>
                <label class="field"><span class="field__label">セル高さ</span><input type="number" step="0.1" class="field__input" id="gridCellHInput" value="${c.exprSheet.grid.cellH}"></label>
              </div>
              <div class="expr-editor__triple">
                <label class="field"><span class="field__label">行数</span><input type="number" class="field__input" id="gridRowsInput" value="${c.exprSheet.grid.rows}" min="1" step="1"></label>
                <label class="field"><span class="field__label">列数</span><input type="number" class="field__input" id="gridColsInput" value="${c.exprSheet.grid.cols}" min="1" step="1"></label>
                <label class="field"><span class="field__label">使用枚数</span><input type="number" class="field__input" id="gridCountInput" value="${c.exprSheet.grid.count}" min="0" step="1"></label>
              </div>
            </div>
          </div>
        </div>
        </details>

        <span class="char-editor__label">表情を選択</span>
        <div class="expr-editor__thumbs" id="exprThumbs"><!-- JS populates --></div>
      ` : ""}

      <div class="char-editor__row" style="margin-top:14px;">
        <button type="button" class="btn btn--danger btn--sm" id="deleteCharBtn">このキャラクターを削除</button>
      </div>
    `;

    charEditor.querySelector("#flipBtn").addEventListener("click", () => {
      c.flipX = !c.flipX;
      renderCharEditor();
      renderAll();
    });
    charEditor.querySelector("#silhouetteBtn").addEventListener("click", () => {
      c.silhouette = !c.silhouette;
      renderCharEditor();
      renderAll();
    });
    charEditor.querySelector("#hologramBtn").addEventListener("click", () => {
      c.hologram = !c.hologram;
      renderCharEditor();
      renderAll();
    });
    charEditor.querySelector("#grayscaleBtn").addEventListener("click", () => {
      c.grayscale = !c.grayscale;
      renderCharEditor();
      renderAll();
    });
    const opacityRangeInput = charEditor.querySelector("#opacityRange");
    const opacityNumInput = charEditor.querySelector("#opacityNumInput");
    opacityRangeInput.addEventListener("input", (e) => {
      const pct = Number(e.target.value);
      c.opacity = pct;
      opacityNumInput.value = pct;
      renderCharList();
      syncSpeakerFromFrontChar();
      renderAll();
    });
    opacityNumInput.addEventListener("input", (e) => {
      const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
      c.opacity = pct;
      opacityRangeInput.value = pct;
      renderCharList();
      syncSpeakerFromFrontChar();
      renderAll();
    });
    const edgeFadeRangeInput = charEditor.querySelector("#edgeFadeRange");
    const edgeFadeNumInput = charEditor.querySelector("#edgeFadeNumInput");
    edgeFadeRangeInput.addEventListener("input", (e) => {
      const pct = Number(e.target.value);
      c.edgeFadeAmount = pct;
      edgeFadeNumInput.value = pct;
      renderAll();
    });
    edgeFadeNumInput.addEventListener("input", (e) => {
      const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
      c.edgeFadeAmount = pct;
      edgeFadeRangeInput.value = pct;
      renderAll();
    });
    charEditor.querySelector("#edgeFadeTopBtn").addEventListener("click", () => {
      c.edgeFadeTop = !c.edgeFadeTop;
      renderCharEditor();
      renderAll();
    });
    charEditor.querySelector("#edgeFadeBottomBtn").addEventListener("click", () => {
      c.edgeFadeBottom = !c.edgeFadeBottom;
      renderCharEditor();
      renderAll();
    });
    charEditor.querySelector("#edgeFadeLeftBtn").addEventListener("click", () => {
      c.edgeFadeLeft = !c.edgeFadeLeft;
      renderCharEditor();
      renderAll();
    });
    charEditor.querySelector("#edgeFadeRightBtn").addEventListener("click", () => {
      c.edgeFadeRight = !c.edgeFadeRight;
      renderCharEditor();
      renderAll();
    });
    charEditor.querySelector("#departureBtn").addEventListener("click", () => {
      c.departureEnabled = !c.departureEnabled;
      renderCharEditor(); // 単発のクリックなのでパネルを再構築し、進行度/補正の各欄を表示/非表示にする
      renderAll();
    });
    if (c.departureEnabled) {
      const departureProgressRangeInput = charEditor.querySelector("#departureProgressRange");
      const departureProgressNumInput = charEditor.querySelector("#departureProgressNumInput");
      departureProgressRangeInput.addEventListener("input", (e) => {
        const pct = Number(e.target.value);
        c.departureProgress = pct;
        departureProgressNumInput.value = pct;
        renderAll();
      });
      departureProgressNumInput.addEventListener("input", (e) => {
        const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
        c.departureProgress = pct;
        departureProgressRangeInput.value = pct;
        renderAll();
      });
      charEditor.querySelector("#departureFadeStartInput").addEventListener("input", (e) => {
        c.departureFadeStart = Math.min(100, Math.max(0, Number(e.target.value) || 0));
        renderAll();
      });
      charEditor.querySelector("#departureFadeEndInput").addEventListener("input", (e) => {
        c.departureFadeEnd = Math.min(100, Math.max(0, Number(e.target.value) || 0));
        renderAll();
      });
      charEditor.querySelector("#departureOffsetXInput").addEventListener("input", (e) => {
        c.departureOffsetX = Number(e.target.value) || 0;
        renderAll();
      });
      charEditor.querySelector("#departureOffsetYInput").addEventListener("input", (e) => {
        c.departureOffsetY = Number(e.target.value) || 0;
        renderAll();
      });
      charEditor.querySelector("#departureScaleNumInput").addEventListener("input", (e) => {
        const pct = Number(e.target.value);
        c.departureScale = (pct > 0 ? pct : 100) / 100;
        renderAll();
      });
      const departureHueRangeInput = charEditor.querySelector("#departureHueRange");
      const departureHueNumInput = charEditor.querySelector("#departureHueNumInput");
      departureHueRangeInput.addEventListener("input", (e) => {
        const deg = Number(e.target.value);
        c.departureHue = deg;
        departureHueNumInput.value = deg;
        renderAll();
      });
      departureHueNumInput.addEventListener("input", (e) => {
        const deg = Math.min(180, Math.max(-180, Number(e.target.value) || 0));
        c.departureHue = deg;
        departureHueRangeInput.value = deg;
        renderAll();
      });
    }
    const posXRangeInput = charEditor.querySelector("#posXRange");
    const posXNumInput = charEditor.querySelector("#posXInput");
    posXRangeInput.addEventListener("input", (e) => {
      const raw = Number(e.target.value);
      const { w } = charBBox(c);
      const snap = snapAxis(raw, w / 2, CANVAS_W);
      const val = snap ? snap.value : raw;
      c.x = val;
      posXNumInput.value = Math.round(val);
      posXRangeInput.value = Math.round(val);
      snapGuideX = snap ? snap.guide : null;
      renderAll();
    });
    // スライダーのドラッグはキャンバスと同様にスナップするが、
    // 数値を直接入力した場合は上書きされるべきではないため、
    // range側の入力だけがスナップする
    posXRangeInput.addEventListener("change", () => {
      snapGuideX = null;
      renderAll();
    });
    posXNumInput.addEventListener("input", (e) => {
      const val = Number(e.target.value) || 0;
      c.x = val;
      posXRangeInput.value = Math.min(POS_X_MAX, Math.max(POS_X_MIN, val));
      renderAll();
    });
    const posYRangeInput = charEditor.querySelector("#posYRange");
    const posYNumInput = charEditor.querySelector("#posYInput");
    posYRangeInput.addEventListener("input", (e) => {
      const raw = Number(e.target.value);
      const { h } = charBBox(c);
      const snap = snapAxis(raw, h / 2, CANVAS_H);
      const val = snap ? snap.value : raw;
      c.y = val;
      posYNumInput.value = Math.round(val);
      posYRangeInput.value = Math.round(val);
      snapGuideY = snap ? snap.guide : null;
      renderAll();
    });
    posYRangeInput.addEventListener("change", () => {
      snapGuideY = null;
      renderAll();
    });
    posYNumInput.addEventListener("input", (e) => {
      const val = Number(e.target.value) || 0;
      c.y = val;
      posYRangeInput.value = Math.min(POS_Y_MAX, Math.max(POS_Y_MIN, val));
      renderAll();
    });
    const scaleRangeInput = charEditor.querySelector("#scaleRange");
    const scaleNumInput = charEditor.querySelector("#scaleNumInput");
    scaleRangeInput.addEventListener("input", (e) => {
      const pct = Number(e.target.value);
      c.scale = pct / 100;
      scaleNumInput.value = pct;
      renderAll();
    });
    scaleNumInput.addEventListener("input", (e) => {
      const pct = Math.min(400, Math.max(3, Number(e.target.value) || 0));
      c.scale = pct / 100;
      scaleRangeInput.value = pct;
      renderAll();
    });
    charEditor.querySelector("#layerBackBtn").addEventListener("click", () => moveLayer(c.id, -1));
    charEditor.querySelector("#layerFrontBtn").addEventListener("click", () => moveLayer(c.id, 1));

    charEditor.querySelector("#variantInput").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) addVariantFromFile(c, file);
      e.target.value = "";
    });
    renderVariantList(c);

    charEditor.querySelector("#variantOffsetXInput").addEventListener("input", (e) => {
      activeVariant.offsetX = Number(e.target.value) || 0;
      renderAll();
    });
    charEditor.querySelector("#variantOffsetYInput").addEventListener("input", (e) => {
      activeVariant.offsetY = Number(e.target.value) || 0;
      renderAll();
    });
    charEditor.querySelector("#variantScaleAdjustInput").addEventListener("input", (e) => {
      const pct = Number(e.target.value);
      activeVariant.scaleAdjust = (pct > 0 ? pct : 100) / 100;
      renderAll();
    });
    charEditor.querySelector("#variantResetAdjustBtn").addEventListener("click", () => {
      activeVariant.offsetX = 0;
      activeVariant.offsetY = 0;
      activeVariant.scaleAdjust = 1;
      renderCharEditor(); // discrete click, not typing — safe to rebuild the whole panel
      renderAll();
    });

    charEditor.querySelector("#deleteCharBtn").addEventListener("click", () => removeCharacter(c.id));

    charEditor.querySelector("#exprEnableBtn").addEventListener("click", () => {
      c.exprSheet.enabled = !c.exprSheet.enabled;
      renderCharEditor();
      renderAll();
    });

    if (c.exprSheet.enabled) {
      // renderCharEditorは毎回テンプレートを丸ごと作り直すため、開閉状態を
      // 覚えておかないと再描画のたびに開いた状態にリセットされてしまう
      const exprDetails = charEditor.querySelector("#exprDetailsToggle");
      if (exprDetails) {
        exprDetails.addEventListener("toggle", () => {
          c._exprDetailsOpen = exprDetails.open;
        });
      }
      const bindRect = (prefix, rect) => {
        [
          ["X", "x"],
          ["Y", "y"],
          ["W", "w"],
          ["H", "h"],
        ].forEach(([axis, key]) => {
          charEditor.querySelector("#" + prefix + axis + "Input").addEventListener("input", (e) => {
            rect[key] = Number(e.target.value) || 0;
            refreshExprEditor(c);
          });
        });
      };
      bindRect("body", c.exprSheet.body);
      bindRect("face", c.exprSheet.face);
      charEditor.querySelector("#faceAutoBtn").addEventListener("click", () => {
        const rect = detectFaceRect(c);
        if (!rect) {
          alert(
            "顔位置を自動検出できませんでした。差分グリッド（セル幅・高さ・使用枚数1枚以上）が設定されているかご確認ください。"
          );
          return;
        }
        c.exprSheet.face = rect;
        renderCharEditor(); // discrete click, not typing — safe to rebuild the whole panel
        renderAll();
      });
      charEditor.querySelector("#gridXInput").addEventListener("input", (e) => {
        c.exprSheet.grid.x = Number(e.target.value) || 0;
        refreshExprEditor(c);
      });
      charEditor.querySelector("#gridYInput").addEventListener("input", (e) => {
        c.exprSheet.grid.y = Number(e.target.value) || 0;
        refreshExprEditor(c);
      });
      charEditor.querySelector("#gridCellWInput").addEventListener("input", (e) => {
        c.exprSheet.grid.cellW = Number(e.target.value) || 0;
        refreshExprEditor(c);
      });
      charEditor.querySelector("#gridCellHInput").addEventListener("input", (e) => {
        c.exprSheet.grid.cellH = Number(e.target.value) || 0;
        refreshExprEditor(c);
      });
      charEditor.querySelector("#faceMatchGridBtn").addEventListener("click", () => {
        c.exprSheet.face.w = c.exprSheet.grid.cellW;
        c.exprSheet.face.h = c.exprSheet.grid.cellH;
        renderCharEditor(); // discrete click, not typing — safe to rebuild the whole panel
        renderAll();
      });
      charEditor.querySelector("#gridRowsInput").addEventListener("input", (e) => {
        c.exprSheet.grid.rows = Number(e.target.value) || 1;
        refreshExprEditor(c);
      });
      charEditor.querySelector("#gridColsInput").addEventListener("input", (e) => {
        c.exprSheet.grid.cols = Number(e.target.value) || 1;
        refreshExprEditor(c);
      });
      charEditor.querySelector("#gridCountInput").addEventListener("input", (e) => {
        c.exprSheet.grid.count = Number(e.target.value) || 0;
        refreshExprEditor(c);
      });
      renderExprPreview(c);
      renderExprThumbs(c);
      wireFaceDrag(c);
    }
  }

  // ユーザーが小さいプレビューキャンバス上で顔の矩形（顔だけ——本体/
  // グリッドは数値入力のまま）を直接掴んでドラッグで配置できるようにする。
  // 入力でX/Yの正しい値を探る手間を省く。
  let faceDrag = null;
  function wireFaceDrag(c) {
    const cv = charEditor.querySelector("#exprPreviewCanvas");
    if (!cv) return;

    const previewPos = (evt) => {
      const rect = cv.getBoundingClientRect();
      const toCanvas = cv.width / rect.width;
      return {
        x: (evt.clientX - rect.left) * toCanvas,
        y: (evt.clientY - rect.top) * toCanvas,
      };
    };
    const previewScale = () => cv.width / c.naturalW;

    const overFace = (pos) => {
      const s = previewScale();
      const face = c.exprSheet.face;
      return (
        pos.x >= face.x * s &&
        pos.x <= (face.x + face.w) * s &&
        pos.y >= face.y * s &&
        pos.y <= (face.y + face.h) * s
      );
    };

    cv.addEventListener("pointerdown", (evt) => {
      const pos = previewPos(evt);
      if (!overFace(pos)) return;
      faceDrag = {
        startPos: pos,
        startX: c.exprSheet.face.x,
        startY: c.exprSheet.face.y,
        scale: previewScale(),
      };
      cv.setPointerCapture(evt.pointerId);
      cv.style.cursor = "grabbing";
    });
    cv.addEventListener("pointermove", (evt) => {
      const pos = previewPos(evt);
      if (!faceDrag) {
        cv.style.cursor = overFace(pos) ? "grab" : "default";
        return;
      }
      const dx = (pos.x - faceDrag.startPos.x) / faceDrag.scale;
      const dy = (pos.y - faceDrag.startPos.y) / faceDrag.scale;
      c.exprSheet.face.x = Math.round((faceDrag.startX + dx) * 100) / 100;
      c.exprSheet.face.y = Math.round((faceDrag.startY + dy) * 100) / 100;
      updateFacePosFields(c);
      renderExprPreview(c);
      renderAll();
    });
    const endFaceDrag = (evt) => {
      if (!faceDrag) return;
      faceDrag = null;
      cv.style.cursor = "default";
      try {
        cv.releasePointerCapture(evt.pointerId);
      } catch (e) {
        /* 何もしない */
      }
    };
    cv.addEventListener("pointerup", endFaceDrag);
    cv.addEventListener("pointercancel", endFaceDrag);
  }

  // ドラッグ中も顔のX/Y数値入力欄をリアルタイムに同期させる。パネルを
  // 再構築すると、ドラッグの途中でキャンバスが差し替えられてポインタ
  // キャプチャが壊れてしまうため、それは行わない。
  function updateFacePosFields(c) {
    const fx = charEditor.querySelector("#faceXInput");
    const fy = charEditor.querySelector("#faceYInput");
    if (fx) fx.value = c.exprSheet.face.x;
    if (fy) fy.value = c.exprSheet.face.y;
  }

  // 背景色は領域自身の左上隅からサンプリングする——ほぼ常にキャラクター
  // が描かれていない場所なので、シートが実際のアルファ透過を使っていても
  // 単色の不透明な背景色を使っていても内容検出が機能する。下の
  // テンプレートマッチング検出器が、グレースケール配列と「このピクセルは
  // 実際に絵の一部か」を表すマスク配列を作るために共有して使う。
  function buildGrayAndMask(data, w, h) {
    const bgR = data[0];
    const bgG = data[1];
    const bgB = data[2];
    const bgA = data[3];
    const COLOR_THRESHOLD = 24;
    const gray = new Float32Array(w * h);
    const mask = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      gray[p] = 0.299 * r + 0.587 * g + 0.114 * b;
      if (bgA < 16) {
        mask[p] = a >= 16 ? 1 : 0;
      } else if (a < 16) {
        mask[p] = 0;
      } else {
        const dr = r - bgR;
        const dg = g - bgG;
        const db = b - bgB;
        mask[p] = Math.sqrt(dr * dr + dg * dg + db * db) > COLOR_THRESHOLD ? 1 : 0;
      }
    }
    return { gray, mask };
  }

  // オフセット(dx, dy)におけるテンプレートと探索領域の、グレースケール差分の
  // 二乗和。テンプレート自身に実際の絵がある（そのマスクがある）ピクセルのみ
  // カウントする——そうしないと、テンプレート自身の透明な余白部分が、背景の
  // 同じくらい何もない部分と「一致」してしまい、意味がなくなる。
  function templateSSD(tGray, tMask, tw, th, sGray, sw, dx, dy) {
    let sum = 0;
    let count = 0;
    for (let ty = 0; ty < th; ty++) {
      const sRowBase = (dy + ty) * sw + dx;
      const tRowBase = ty * tw;
      for (let tx = 0; tx < tw; tx++) {
        const tp = tRowBase + tx;
        if (!tMask[tp]) continue;
        const diff = sGray[sRowBase + tx] - tGray[tp];
        sum += diff * diff;
        count++;
      }
    }
    return count > 0 ? sum / count : Infinity;
  }

  // 本体シルエットの形状から推測するのではなく、実際の表情差分クロップの
  // 1つと比較することで、顔スロットが本体上のどこに位置するかを見つける
  // ——個々の表情が違っていても、両者は多くの一致する詳細（生え際、
  // 輪郭、眼鏡など）を共有しているはず。まずダウンサンプルした画像で
  // 高速な粗探索を行い、その後、最良の粗い推定値の周辺の小さな範囲で
  // フル解像度による精緻化を行う。
  function detectFaceRect(c) {
    const body = c.exprSheet.body;
    const grid = c.exprSheet.grid;
    const cellW = grid.cellW;
    const cellH = grid.cellH;
    if (!(cellW > 0) || !(cellH > 0) || grid.count < 1) return null;

    const bw = Math.max(1, Math.round(body.w));
    const bh = Math.max(1, Math.round(body.h));
    if (bw < cellW || bh < cellH) return null;

    // 位置合わせのテンプレートとして、最初に設定されている表情差分を使う
    // ——慣例的にこの手のシートでは通常ニュートラル/デフォルトの顔になる
    const templateRect = getExprCellRect(grid, 0);
    if (!templateRect) return null;

    const bodyCv = extractRegion(c.img, body.x, body.y, body.w, body.h);
    const templateCv = extractRegion(c.img, templateRect.x, templateRect.y, templateRect.w, templateRect.h);
    const tw = templateCv.width;
    const th = templateCv.height;

    // 探索範囲を本体の上半分程度に制限する——立っているキャラクターの
    // 頭がそれより下に来ることはない——ので、探索空間を減らし、
    // もっと下の方にある偶然似た形（例えば似た形の手や小道具）に
    // 誤って一致してしまうのを避けられる
    const searchH = Math.max(th, Math.min(bh, Math.round(bh * 0.6)));

    // ---- ステージ1: ダウンサンプルしたグレースケール画像で粗探索 ----
    const COARSE_TARGET = 22; // テンプレートの長辺（粗い探索でのピクセル数）
    const scale = Math.min(1, COARSE_TARGET / Math.max(tw, th));
    const ctw = Math.max(2, Math.round(tw * scale));
    const cth = Math.max(2, Math.round(th * scale));
    const csw = Math.max(ctw, Math.round(bw * scale));
    const csh = Math.max(cth, Math.round(searchH * scale));

    const coarseTemplate = document.createElement("canvas");
    coarseTemplate.width = ctw;
    coarseTemplate.height = cth;
    coarseTemplate.getContext("2d").drawImage(templateCv, 0, 0, ctw, cth);
    const coarseTemplateData = coarseTemplate.getContext("2d").getImageData(0, 0, ctw, cth).data;
    const { gray: ctGray, mask: ctMask } = buildGrayAndMask(coarseTemplateData, ctw, cth);
    if (!ctMask.some(Boolean)) return null; // テンプレートが完全に空 — 位置合わせする対象がない

    const coarseSearch = document.createElement("canvas");
    coarseSearch.width = csw;
    coarseSearch.height = csh;
    coarseSearch.getContext("2d").drawImage(bodyCv, 0, 0, bw, searchH, 0, 0, csw, csh);
    const coarseSearchData = coarseSearch.getContext("2d").getImageData(0, 0, csw, csh).data;
    const { gray: csGray } = buildGrayAndMask(coarseSearchData, csw, csh);

    let bestCoarse = { dx: 0, dy: 0, score: Infinity };
    for (let dy = 0; dy <= csh - cth; dy++) {
      for (let dx = 0; dx <= csw - ctw; dx++) {
        const score = templateSSD(ctGray, ctMask, ctw, cth, csGray, csw, dx, dy);
        if (score < bestCoarse.score) bestCoarse = { dx, dy, score };
      }
    }

    // ---- ステージ2: 粗い推定値の周辺でフル解像度による精緻化 ----
    const bodyCtx = bodyCv.getContext("2d");
    const bodyData = bodyCtx.getImageData(0, 0, bw, searchH).data;
    const { gray: bGray } = buildGrayAndMask(bodyData, bw, searchH);
    const templateData = templateCv.getContext("2d").getImageData(0, 0, tw, th).data;
    const { gray: tGray, mask: tMask } = buildGrayAndMask(templateData, tw, th);

    const approxX = Math.round(bestCoarse.dx / scale);
    const approxY = Math.round(bestCoarse.dy / scale);
    const radius = Math.max(4, Math.ceil(2 / scale));
    const minX = Math.max(0, approxX - radius);
    const maxX = Math.min(bw - tw, approxX + radius);
    const minY = Math.max(0, approxY - radius);
    const maxY = Math.min(searchH - th, approxY + radius);

    let best = { x: Math.max(0, Math.min(approxX, bw - tw)), y: Math.max(0, Math.min(approxY, searchH - th)), score: Infinity };
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const score = templateSSD(tGray, tMask, tw, th, bGray, bw, x, y);
        if (score < best.score) best = { x, y, score };
      }
    }

    return {
      x: Math.round((body.x + best.x) * 100) / 100,
      y: Math.round((body.y + best.y) * 100) / 100,
      w: Math.round(cellW * 100) / 100,
      h: Math.round(cellH * 100) / 100,
    };
  }

  // 数値入力はstateを直接更新し、プレビューキャンバス/サムネイル一覧/
  // シーンのみを再描画する——renderCharEditor()は決して呼ばない。呼ぶと
  // パネル全体が再構築され、ユーザーが入力中のフォーカスが奪われて
  // しまう。
  function refreshExprEditor(c) {
    const grid = c.exprSheet.grid;
    grid.rows = Math.max(1, Math.round(grid.rows));
    grid.cols = Math.max(1, Math.round(grid.cols));
    grid.count = Math.min(grid.rows * grid.cols, Math.max(0, Math.round(grid.count)));
    if (c.activeExpr >= grid.count) c.activeExpr = -1;
    renderExprPreview(c);
    renderExprThumbs(c);
    renderAll();
  }

  function renderExprPreview(c) {
    const cv = charEditor.querySelector("#exprPreviewCanvas");
    if (!cv) return;
    const PREVIEW_RENDER_W = 360;
    const scale = PREVIEW_RENDER_W / c.naturalW;
    cv.width = PREVIEW_RENDER_W;
    cv.height = Math.max(1, Math.round(c.naturalH * scale));
    const pctx = cv.getContext("2d");
    pctx.clearRect(0, 0, cv.width, cv.height);
    pctx.drawImage(c.img, 0, 0, cv.width, cv.height);

    const s = c.exprSheet;
    const strokeRect = (r, color) => {
      pctx.strokeStyle = color;
      pctx.lineWidth = 2;
      pctx.strokeRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
    };
    strokeRect(s.body, "#45d6ff");
    strokeRect(s.face, "#ff45d6");
    strokeRect(
      { x: s.grid.x, y: s.grid.y, w: s.grid.cellW * s.grid.cols, h: s.grid.cellH * s.grid.rows },
      "#ffd645"
    );

    const cellW = s.grid.cellW;
    const cellH = s.grid.cellH;
    pctx.strokeStyle = "rgba(255, 214, 69, 0.6)";
    pctx.lineWidth = 1;
    for (let row = 0; row < s.grid.rows; row++) {
      for (let col = 0; col < s.grid.cols; col++) {
        const idx = row * s.grid.cols + col;
        const cx = (s.grid.x + col * cellW) * scale;
        const cy = (s.grid.y + row * cellH) * scale;
        const cw = cellW * scale;
        const ch = cellH * scale;
        if (idx >= s.grid.count) {
          pctx.fillStyle = "rgba(0, 0, 0, 0.5)";
          pctx.fillRect(cx, cy, cw, ch);
        }
        pctx.strokeRect(cx, cy, cw, ch);
      }
    }
  }

  function renderExprThumbs(c) {
    const wrap = charEditor.querySelector("#exprThumbs");
    if (!wrap) return;
    wrap.innerHTML = "";

    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "expr-editor__thumb-btn" + (c.activeExpr < 0 ? " is-selected" : "");
    noneBtn.textContent = "そのまま";
    noneBtn.addEventListener("click", () => {
      c.activeExpr = -1;
      renderExprThumbs(c);
      renderAll();
    });
    wrap.appendChild(noneBtn);

    const grid = c.exprSheet.grid;
    for (let i = 0; i < grid.count; i++) {
      const cell = getExprCellRect(grid, i);
      if (!cell) continue;
      const tW = 48;
      const tH = Math.max(1, Math.round((cell.h / cell.w) * tW));
      const cellCv = extractRegion(c.img, cell.x, cell.y, cell.w, cell.h);
      const thumbCanvas = document.createElement("canvas");
      thumbCanvas.width = tW;
      thumbCanvas.height = tH;
      thumbCanvas.className = "expr-editor__thumb-canvas";
      thumbCanvas.getContext("2d").drawImage(cellCv, 0, 0, tW, tH);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "expr-editor__thumb-btn" + (c.activeExpr === i ? " is-selected" : "");
      btn.appendChild(thumbCanvas);
      btn.addEventListener("click", () => {
        c.activeExpr = i;
        renderExprThumbs(c);
        renderAll();
      });
      wrap.appendChild(btn);
    }
  }

  // ---------------- シナリオの行リスト / エディタUI ----------------
  // 行のspeaker/bodyはプロジェクトファイル経由で外部から読み込まれる
  // 自由入力文字列なので、必ず.textContentで書き込む（innerHTMLへの
  // 文字列埋め込みは絶対に行わない——HTMLインジェクションの原因になる）。
  // ドラッグ中の行のid。掴んでいる間はrenderScenarioList()を呼ばず
  // （呼ぶとハンドル要素ごと作り直されポインタキャプチャが切れてしまう）
  // 実際のDOM要素を直接並べ替えるだけにとどめ、指を離した時点で初めて
  // state.scenarioへ反映して1回だけ再描画する。
  let scenarioDragId = null;

  function wireScenarioDragHandle(node, line) {
    const handle = node.querySelector(".charlist__drag-handle");
    // ドラッグ中はnode（掴んでいるli自身）をinsertBefore/appendChildで
    // 直接動かす。これはDOM上「一旦削除してから再挿入」する扱いになるため、
    // handle自体にsetPointerCapture()していると並び替えの瞬間にキャプチャが
    // 切れてpointercancelが飛んでしまい、「掴めるが動かない」状態になる。
    // そのためポインタキャプチャは使わず、ドラッグ中だけwindowにmove/up
    // リスナーを足す方式にする（要素の移動に影響されない）。
    handle.addEventListener("pointerdown", (evt) => {
      evt.preventDefault();
      evt.stopPropagation(); // 行の読み込み（liクリック）を誘発しない
      scenarioDragId = line.id;
      node.classList.add("is-dragging");

      const onMove = (moveEvt) => {
        if (scenarioDragId !== line.id) return;
        const items = Array.from(scenarioList.children);
        for (const item of items) {
          if (item === node) continue;
          const rect = item.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (moveEvt.clientY < mid) {
            scenarioList.insertBefore(node, item);
            return;
          }
        }
        scenarioList.appendChild(node); // どの項目より下 — 末尾へ
      };
      const onUp = () => {
        if (scenarioDragId !== line.id) return;
        scenarioDragId = null;
        node.classList.remove("is-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        // 実際に並び替わったDOM順序を読み取ってstate.scenarioへ反映する
        const orderedIds = Array.from(scenarioList.children).map((el) => Number(el.dataset.id));
        state.scenario.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
        ensureSpecialScenarioLines(); // 開始行/終了行の前後へドロップされた場合も定位置へ戻す
        renderScenarioList();
        renderScenarioEditor();
        renderBgmList(); // 行の順序が変わるとBGMの範囲（開始/終了行の間）の意味も変わりうるため
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  }

  function renderScenarioList() {
    scenarioList.innerHTML = "";
    let realLineNumber = 0; // 開始行・終了行を除いた実質的な行番号
    state.scenario.forEach((line) => {
      // 「シナリオ開始」「シナリオ終了」の特殊行は他の行と構造が大きく
      // 異なる（並び替え/削除/ライブ状態の反映が一切無く、有効/無効の
      // 切り替えのみ）ため、共通の専用テンプレートで別扱いにする
      if (line.isStartingFade || line.isEndingFade) {
        const specialNode = scenarioSpecialItemTemplate.content.firstElementChild.cloneNode(true);
        specialNode.dataset.id = String(line.id);
        specialNode.classList.toggle("is-hidden", !line.enabled);
        specialNode.querySelector(".charlist__scenario-speaker").textContent = line.isStartingFade
          ? "シナリオ開始"
          : "シナリオ終了";
        specialNode.querySelector(".charlist__scenario-body").textContent = line.isStartingFade
          ? "暗転から始まり、少ししてから最初の行を開始します"
          : "暗転してから再生を終了します";
        const toggleBtn = specialNode.querySelector(".charlist__visibility-btn");
        toggleBtn.classList.toggle("is-off", !line.enabled);
        toggleBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          line.enabled = !line.enabled;
          renderScenarioList();
        });
        scenarioList.appendChild(specialNode);
        return;
      }
      realLineNumber++;
      const node = scenarioItemTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.id = String(line.id);
      const summary = summarizeScenarioLine(line);
      node.querySelector(".charlist__scenario-speaker").textContent = realLineNumber + ". " + summary.title;
      node.querySelector(".charlist__scenario-body").textContent = summary.body;
      if (line.id === state.scenarioSelectedId) node.classList.add("is-selected");
      if (line.isSceneTransition) node.classList.add("charlist__item--scene-transition");
      node.addEventListener("click", () => {
        state.scenarioSelectedId = line.id;
        // 場面転換行はライブ状態のスナップショットを持たないため、選択する
        // （並び替え/削除のため）だけでプレビューには反映しない
        if (!line.isSceneTransition) applyScenarioLine(line);
        renderScenarioList();
        renderScenarioEditor();
      });
      const updateBtn = node.querySelector(".charlist__update-btn");
      if (line.isSceneTransition) {
        // 場面転換行には「現在の状態」という概念が無いため、更新ボタンは無意味——隠す
        updateBtn.hidden = true;
      } else {
        updateBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // 行のクリック（内容の読み込み）を誘発しない
          updateScenarioLineFromLiveState(line);
        });
      }
      node.querySelector(".charlist__del").addEventListener("click", (e) => {
        e.stopPropagation();
        removeScenarioLine(line.id);
      });
      wireScenarioDragHandle(node, line);
      scenarioList.appendChild(node);
    });
    scenarioCount.textContent = String(state.scenario.length);
  }

  function renderScenarioEditor() {
    const line = state.scenario.find((l) => l.id === state.scenarioSelectedId);
    if (!line) {
      scenarioEditor.className = "char-editor char-editor--empty";
      scenarioEditor.innerHTML = '<p class="char-editor__empty-msg">行を選択すると、ここで並び替えや削除ができます</p>';
      return;
    }
    scenarioEditor.className = "char-editor";
    // 先頭の「シナリオ開始」・末尾の「シナリオ終了」の特殊行は並び替え
    // 対象に含めない——実質的な先頭/最後尾はそれらを除いた行になる
    const realLines = getRealScenarioLines();
    const realIndex = realLines.findIndex((l) => l.id === line.id);
    const isFirst = realIndex === 0;
    const isLast = realIndex === realLines.length - 1;

    scenarioEditor.innerHTML = `
      <span class="char-editor__label">並び替え</span>
      <div class="char-editor__row">
        <button type="button" class="btn btn--sm" id="scenarioMoveUpBtn" ${isFirst ? "disabled" : ""}>ひとつ上へ</button>
        <button type="button" class="btn btn--sm" id="scenarioMoveDownBtn" ${isLast ? "disabled" : ""}>ひとつ下へ</button>
      </div>

      <div class="char-editor__row" style="margin-top:16px;">
        <button type="button" class="btn btn--danger btn--sm" id="scenarioDeleteLineBtn">この行を削除</button>
      </div>
    `;

    scenarioEditor.querySelector("#scenarioMoveUpBtn").addEventListener("click", () => moveScenarioLine(line.id, -1));
    scenarioEditor.querySelector("#scenarioMoveDownBtn").addEventListener("click", () => moveScenarioLine(line.id, 1));
    scenarioEditor.querySelector("#scenarioDeleteLineBtn").addEventListener("click", () => removeScenarioLine(line.id));
  }

  // ---------------- 背景リスト / エディタUI ----------------
  function renderBgList() {
    bgList.innerHTML = "";
    state.backgrounds.forEach((b) => {
      const node = bgItemTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.id = String(b.id);
      node.querySelector("img").src = b.img.src;
      node.querySelector(".charlist__name").textContent = b.name || "背景";
      if (b.id === state.activeBackgroundId) {
        node.classList.add("is-selected");
        node.classList.add("is-active");
      }
      node.addEventListener("click", () => {
        state.activeBackgroundId = b.id;
        renderBgList();
        renderBgEditor();
        renderAll();
      });
      node.querySelector(".charlist__del").addEventListener("click", (e) => {
        e.stopPropagation();
        removeBackground(b.id);
      });
      wireInlineRename(node, b.name || "背景", (newName) => {
        b.name = newName;
        renderBgList();
      });
      bgList.appendChild(node);
    });
    bgCount.textContent = String(state.backgrounds.length);
  }

  function renderBgEditor() {
    const b = getActiveBackground();
    if (!b) {
      bgEditor.className = "char-editor char-editor--empty";
      bgEditor.innerHTML =
        '<p class="char-editor__empty-msg">背景を選択すると、ここで調整できます</p>';
      return;
    }
    bgEditor.className = "char-editor";
    const zoomPct = Math.round(b.zoom * 100);

    bgEditor.innerHTML = `
      <span class="char-editor__label">色調</span>
      <div class="footer-tabs" id="bgColorModeTabs">
        <button type="button" class="footer-tab ${b.colorMode === "none" ? "is-active" : ""}" data-mode="none">なし</button>
        <button type="button" class="footer-tab ${b.colorMode === "grayscale" ? "is-active" : ""}" data-mode="grayscale">グレースケール</button>
        <button type="button" class="footer-tab ${b.colorMode === "sepia" ? "is-active" : ""}" data-mode="sepia">セピア</button>
      </div>

      <span class="char-editor__label">拡大（キャンバス上をドラッグで移動可）</span>
      <div class="char-editor__row">
        <input type="range" id="bgZoomRange" min="100" max="300" value="${zoomPct}">
        <button type="button" class="btn btn--sm" id="bgResetBtn">位置をリセット</button>
      </div>

      <div class="char-editor__row" style="margin-top:14px;">
        <button type="button" class="btn btn--danger btn--sm" id="bgDeleteBtn">この背景を削除</button>
      </div>
    `;

    bgEditor.querySelectorAll("#bgColorModeTabs .footer-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        b.colorMode = btn.dataset.mode;
        renderBgEditor();
        renderAll();
      });
    });
    bgEditor.querySelector("#bgZoomRange").addEventListener("input", (e) => {
      b.zoom = Number(e.target.value) / 100;
      clampBackgroundPan(b, CANVAS_W, CANVAS_H);
      renderAll();
    });
    bgEditor.querySelector("#bgResetBtn").addEventListener("click", () => {
      b.zoom = 1;
      b.panX = 0;
      b.panY = 0;
      renderBgEditor();
      renderAll();
    });
    bgEditor.querySelector("#bgDeleteBtn").addEventListener("click", () => removeBackground(b.id));
  }

  // ---------------- トップレベルUIの配線 ----------------
  bgInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) addBackgroundFromFile(file);
    e.target.value = "";
  });

  charInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) addCharacterFromFile(file);
    e.target.value = "";
  });

  bgmInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) addBgmFromFile(file);
    e.target.value = "";
  });

  reflowCharSlotsBtn.addEventListener("click", () => {
    reflowVisibleCharacterSlotsX();
  });

  // スマホ幅（@media max-width:860pxでプレビューが画面上部に追従表示になる）
  // 専用のトグル。コンソール操作や表情差分の調整をする間、プレビューを
  // 畳んで画面を広く使えるようにする。デスクトップ幅ではスイッチ自体が
  // CSSで非表示なので、この状態が意図せず効くことはない。
  previewToggleInput.addEventListener("change", (e) => {
    stage.classList.toggle("stage--collapsed", !e.target.checked);
  });

  dimToggle.addEventListener("change", (e) => {
    state.dimInactive = e.target.checked;
    renderAll();
  });
  function applySceneColorMode(mode) {
    state.sceneColorMode = mode;
    sceneColorModeTabs.querySelectorAll(".footer-tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.mode === mode);
    });
  }
  sceneColorModeTabs.querySelectorAll(".footer-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      applySceneColorMode(btn.dataset.mode);
      renderAll();
    });
  });
  nameplateToggle.addEventListener("change", (e) => {
    state.nameplateOn = e.target.checked;
    renderAll();
  });
  windowToggle.addEventListener("change", (e) => {
    state.showWindow = e.target.checked;
    renderAll();
  });
  buttonsToggle.addEventListener("change", (e) => {
    state.showButtons = e.target.checked;
    renderAll();
  });
  showSkipToggle.addEventListener("change", (e) => {
    state.showSkip = e.target.checked;
    renderAll();
  });
  showLogToggle.addEventListener("change", (e) => {
    state.showLog = e.target.checked;
    renderAll();
  });
  showAutoToggle.addEventListener("change", (e) => {
    state.showAuto = e.target.checked;
    renderAll();
  });
  autoActiveToggle.addEventListener("change", (e) => {
    state.autoActive = e.target.checked;
    renderAll();
  });
  showNextToggle.addEventListener("change", (e) => {
    state.showNext = e.target.checked;
    renderAll();
  });

  choicesToggle.addEventListener("change", (e) => {
    state.showChoices = e.target.checked;
    renderAll();
  });
  choice1Input.addEventListener("input", (e) => {
    state.choice1 = e.target.value;
    renderAll();
  });
  choice2Input.addEventListener("input", (e) => {
    state.choice2 = e.target.value;
    renderAll();
  });
  choice3Input.addEventListener("input", (e) => {
    state.choice3 = e.target.value;
    renderAll();
  });
  choice1ColorInput.addEventListener("input", (e) => {
    state.choice1Color = e.target.value;
    renderAll();
  });
  choice2ColorInput.addEventListener("input", (e) => {
    state.choice2Color = e.target.value;
    renderAll();
  });
  choice3ColorInput.addEventListener("input", (e) => {
    state.choice3Color = e.target.value;
    renderAll();
  });

  // 現在の個数に対応するchoice1/2/3の欄だけを表示し、セグメント
  // コントロールボタンのハイライト状態も同期させる
  function applyChoiceCount(count) {
    state.choiceCount = count;
    choice2Row.hidden = count < 2;
    choice3Row.hidden = count < 3;
    choiceCountTabs.querySelectorAll(".footer-tab").forEach((btn) => {
      btn.classList.toggle("is-active", Number(btn.dataset.count) === count);
    });
  }
  choiceCountTabs.querySelectorAll(".footer-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyChoiceCount(Number(btn.dataset.count));
      renderAll();
    });
  });

  speakerLinkToggle.addEventListener("change", (e) => {
    state.speakerLinkToChar = e.target.checked;
    speakerInput.disabled = state.speakerLinkToChar;
    syncSpeakerFromFrontChar();
  });
  speakerInput.addEventListener("input", (e) => {
    state.speaker = e.target.value;
    renderAll();
  });
  bodyInput.addEventListener("input", (e) => {
    state.body = e.target.value;
    renderAll();
  });
  fontSizeInput.addEventListener("input", (e) => {
    state.fontSize = Number(e.target.value);
    document.getElementById("fontSizeNumber").value = e.target.value;
    renderAll();
  });

  fontSizeResetBtn.addEventListener("click", () => {
    fontSizeInput.value = 45;  // デフォルト値
    document.getElementById("fontSizeNumber").value = 45;
    state.fontSize = 45;
    renderAll();
  });

  document.getElementById("fontSizeNumber").addEventListener("change", (e) => {
    let value = Number(e.target.value);
    value = Math.max(18, Math.min(100, value));
    state.fontSize = value;
    fontSizeInput.value = value;
    document.getElementById("fontSizeNumber").value = value;
    renderAll();
  });
  textColorInput.addEventListener("input", (e) => {
    state.textColor = e.target.value;
    renderAll();
  });

  // ---------------- フッタータブ（画像として保存 / プロジェクト / 動画保存） ----------------
  const footerTabs = [
    { btn: footerTabExportBtn, panel: footerPanelExport },
    { btn: footerTabProjectBtn, panel: footerPanelProject },
    { btn: footerTabVideoBtn, panel: footerPanelVideo },
  ];
  footerTabs.forEach(({ btn, panel }) => {
    btn.addEventListener("click", () => {
      footerTabs.forEach(({ btn: b, panel: p }) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        p.classList.toggle("is-hidden", !active);
      });
      hideVideoFormatMenu(); // タブを切り替えたら、開いたままの保存形式メニューを閉じておく
    });
  });

  // Windows/macOSのファイル名に使えない文字を除去し、貼り付けた名前が
  // 誤ってダウンロードを壊さないようにする（PNG/プロジェクト/動画の
  // 3つの書き出しで共通して使う）
  function sanitizeFilenameInput(raw) {
    return raw.trim().replace(/[\\/:*?"<>|]/g, "");
  }
  function timestampSuffix() {
    return new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  }

  // iOS（iPhone/iPad）のSafari・および同エンジンを使う全てのiOSブラウザは、
  // <a download>にdata:image/...のURIを指定しても、ダウンロードダイアログを
  // 出さずにその場で画像を開く/表示するだけになることが多い（download属性の
  // 挙動がPNG等Safariが自前で表示できる画像形式では長年不安定）。この場合
  // 「ダウンロードできない」ように見える。blob URLに変えても解決しないことが
  // 多いため、iOSでは新しいタブで開いて手動保存（長押し→「写真に保存」）して
  // もらう方式にフォールバックする。
  function isIOSDevice() {
    const ua = navigator.userAgent;
    // iPadOSはSafari上でMacとして名乗るため、UAだけでなくタッチ対応の
    // Macintoshかどうかも合わせて判定する
    return /iP(hone|od|ad)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function downloadCanvasAsPng(canvas, filename) {
    canvas.toBlob((blob) => {
      if (!blob) {
        alert("画像の書き出しに失敗しました。");
        return;
      }
      const url = URL.createObjectURL(blob);
      if (isIOSDevice()) {
        window.open(url, "_blank");
        alert("画像を新しいタブで開きました。表示された画像を長押しして「写真に保存」を選んでください。");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      // iOSの新規タブ側が読み込みを終えるまで多少猶予を持たせてから解放する
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, "image/png");
  }

  exportBtn.addEventListener("click", () => {
    const off = document.createElement("canvas");
    off.width = CANVAS_W;
    off.height = CANVAS_H;
    const octx = off.getContext("2d");
    drawScene(octx);
    try {
      const customName = sanitizeFilenameInput(exportNameInput.value);
      const stamp = timestampSuffix();
      downloadCanvasAsPng(off, (customName || "scenario_" + stamp) + ".png");
    } catch (err) {
      alert(
        "画像の書き出しに失敗しました。ブラウザがローカルファイルの読み込みを制限している可能性があります。README記載のローカルサーバー経由での起動をお試しください。"
      );
      console.error(err);
    }
  });

  // ---------------- プロジェクトの保存 / 読み込み ----------------
  // img.srcはblob: URL（あるいは以前の読み込み後であればdata: URL）——
  // どちらもdrawImageのソースとして問題なく使えるので、同サイズの
  // キャンバスを介して再ラスタライズすることで、srcの種類に依存せず、
  // タブ/blob URLがとっくに失効した後でも正しく開ける、持ち運び可能で
  // 自己完結したbase64コピーを得られる。
  function imageToDataURL(img) {
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    cv.getContext("2d").drawImage(img, 0, 0);
    return cv.toDataURL("image/png");
  }

  function buildProjectData() {
    return {
      formatVersion: 1,
      savedAt: new Date().toISOString(),
      projectName: projectNameInput.value.trim(),
      state: {
        dimInactive: state.dimInactive,
        sceneColorMode: state.sceneColorMode,
        nameplateOn: state.nameplateOn,
        showWindow: state.showWindow,
        showButtons: state.showButtons,
        showSkip: state.showSkip,
        showLog: state.showLog,
        showAuto: state.showAuto,
        autoActive: state.autoActive,
        showNext: state.showNext,
        showChoices: state.showChoices,
        choiceCount: state.choiceCount,
        choice1: state.choice1,
        choice2: state.choice2,
        choice3: state.choice3,
        choice1Color: state.choice1Color,
        choice2Color: state.choice2Color,
        choice3Color: state.choice3Color,
        speaker: state.speaker,
        body: state.body,
        fontSize: state.fontSize,
        textColor: state.textColor,
        speakerLinkToChar: state.speakerLinkToChar,
        activeBackgroundId: state.activeBackgroundId,
        selectedId: state.selectedId,
        scenarioAdvanceMode: state.scenarioAdvanceMode,
        scenarioAutoDelaySec: state.scenarioAutoDelaySec,
      },
      backgrounds: state.backgrounds.map((b) => ({
        id: b.id,
        name: b.name,
        naturalW: b.naturalW,
        naturalH: b.naturalH,
        zoom: b.zoom,
        panX: b.panX,
        panY: b.panY,
        colorMode: b.colorMode,
        image: imageToDataURL(b.img),
      })),
      characters: state.characters.map((c) => {
        syncActiveVariant(c); // シリアライズする前に、その場での編集内容がアクティブなスロットへ反映されているようにする
        return {
          id: c.id,
          name: c.name,
          x: c.x,
          y: c.y,
          scale: c.scale,
          flipX: c.flipX,
          silhouette: c.silhouette,
          hologram: c.hologram,
          grayscale: c.grayscale,
          visible: c.visible !== false,
          opacity: c.opacity,
          edgeFadeAmount: c.edgeFadeAmount,
          edgeFadeTop: c.edgeFadeTop,
          edgeFadeBottom: c.edgeFadeBottom,
          edgeFadeLeft: c.edgeFadeLeft,
          edgeFadeRight: c.edgeFadeRight,
          departureEnabled: c.departureEnabled,
          departureProgress: c.departureProgress,
          departureOffsetX: c.departureOffsetX,
          departureOffsetY: c.departureOffsetY,
          departureScale: c.departureScale,
          departureFadeStart: c.departureFadeStart,
          departureFadeEnd: c.departureFadeEnd,
          departureHue: c.departureHue,
          naturalW: c.naturalW,
          naturalH: c.naturalH,
          exprSheet: c.exprSheet,
          activeExpr: c.activeExpr,
          image: imageToDataURL(c.img),
          activeVariantIndex: c.activeVariantIndex,
          variants: c.variants.map((v) => ({
            name: v.name,
            naturalW: v.naturalW,
            naturalH: v.naturalH,
            exprSheet: v.exprSheet,
            activeExpr: v.activeExpr,
            offsetX: v.offsetX,
            offsetY: v.offsetY,
            scaleAdjust: v.scaleAdjust,
            image: imageToDataURL(v.img),
          })),
        };
      }),
      scenario: state.scenario.map((line) =>
        line.isStartingFade
          ? { id: line.id, isStartingFade: true, enabled: line.enabled }
          : line.isEndingFade
          ? { id: line.id, isEndingFade: true, enabled: line.enabled }
          : line.isSceneTransition
          ? { id: line.id, isSceneTransition: true }
          : {
              id: line.id,
              speaker: line.speaker,
              body: line.body,
              activeCharId: line.activeCharId,
              nameplateOn: line.nameplateOn,
              fontSize: line.fontSize,
              textColor: line.textColor,
              activeBackgroundId: line.activeBackgroundId,
              backgroundZoom: line.backgroundZoom,
              backgroundPanX: line.backgroundPanX,
              backgroundPanY: line.backgroundPanY,
              backgroundColorMode: line.backgroundColorMode,
              sceneColorMode: line.sceneColorMode,
              chars: line.chars.map((s) => ({
                charId: s.charId,
                x: s.x,
                y: s.y,
                scale: s.scale,
                activeExpr: s.activeExpr,
                activeVariantIndex: s.activeVariantIndex,
                visible: s.visible,
                opacity: s.opacity,
                departureEnabled: s.departureEnabled,
                departureProgress: s.departureProgress,
                departureOffsetX: s.departureOffsetX,
                departureOffsetY: s.departureOffsetY,
                departureScale: s.departureScale,
                departureFadeStart: s.departureFadeStart,
                departureFadeEnd: s.departureFadeEnd,
                departureHue: s.departureHue,
              })),
              showChoices: line.showChoices,
              choiceCount: line.choiceCount,
              choice1: line.choice1,
              choice2: line.choice2,
              choice3: line.choice3,
              choice1Color: line.choice1Color,
              choice2Color: line.choice2Color,
              choice3Color: line.choice3Color,
            }
      ),
      // audio.srcはaddBgmFromFileの時点でFileReaderにより既にdata: URL化
      // されているので、imageToDataURLのような再変換は不要でそのまま使える
      bgmTracks: state.bgmTracks.map((t) => ({
        id: t.id,
        name: t.name,
        volume: t.volume,
        startLineId: t.startLineId,
        endLineId: t.endLineId,
        audio: t.audio.src,
      })),
    };
  }

  // トグル類は全て、自身の"change"イベントでstateに一方向にしか反映
  // しない素のDOMコントロール上にあるため、state自体が（プロジェクト
  // 読み込み・undo/redoなどで）まとめて置き換わった後は、ここで逆方向に
  // 全コントロールへ反映してやらないと、復元したstateと知らないうちに
  // ズレてしまう。呼び出し元でstate.xxxが既にセット済みであることが前提。
  function syncUiFromState() {
    dimToggle.checked = state.dimInactive;
    applySceneColorMode(state.sceneColorMode);
    nameplateToggle.checked = state.nameplateOn;
    windowToggle.checked = state.showWindow;
    buttonsToggle.checked = state.showButtons;
    showSkipToggle.checked = state.showSkip;
    showLogToggle.checked = state.showLog;
    showAutoToggle.checked = state.showAuto;
    autoActiveToggle.checked = state.autoActive;
    showNextToggle.checked = state.showNext;
    choicesToggle.checked = state.showChoices;
    applyChoiceCount(state.choiceCount);
    choice1Input.value = state.choice1;
    choice2Input.value = state.choice2;
    choice3Input.value = state.choice3;
    choice1ColorInput.value = state.choice1Color;
    choice2ColorInput.value = state.choice2Color;
    choice3ColorInput.value = state.choice3Color;
    speakerLinkToggle.checked = state.speakerLinkToChar;
    speakerInput.value = state.speaker;
    speakerInput.disabled = state.speakerLinkToChar;
    bodyInput.value = state.body;
    fontSizeInput.value = state.fontSize;
    document.getElementById("fontSizeNumber").value = state.fontSize;
    textColorInput.value = state.textColor;
    setScenarioAdvanceMode(state.scenarioAdvanceMode);
    scenarioDelayInput.value = state.scenarioAutoDelaySec;

    renderBgList();
    renderBgEditor();
    renderCharList();
    renderCharEditor();
    renderScenarioList();
    renderScenarioEditor();
    renderBgmList();
    renderAll();
  }

  // パースしたプロジェクトファイルからstate.backgrounds/state.charactersを
  // 再構築し、埋め込まれたbase64画像をそれぞれ実際の<img>として読み込み
  // 直す（loadImageはdata: URLも含めどんなsrcでも受け付ける）。それ以外の
  // トップレベルのトグル類はsyncUiFromStateでまとめて反映する。
  async function loadProjectData(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.backgrounds) || !Array.isArray(data.characters)) {
      throw new Error("不正なプロジェクトファイルです。");
    }

    const loadedBackgrounds = await Promise.all(
      data.backgrounds.map(async (b) => {
        const img = await loadImage(b.image);
        return {
          id: b.id,
          img,
          name: b.name || "",
          naturalW: b.naturalW || img.naturalWidth,
          naturalH: b.naturalH || img.naturalHeight,
          zoom: typeof b.zoom === "number" ? b.zoom : 1,
          panX: typeof b.panX === "number" ? b.panX : 0,
          panY: typeof b.panY === "number" ? b.panY : 0,
          // 古い保存データではcolorModeではなくgrayscaleの真偽値を使っていた
          colorMode: b.colorMode || (b.grayscale ? "grayscale" : "none"),
        };
      })
    );

    const loadedCharacters = await Promise.all(
      data.characters.map(async (c) => {
        let variants;
        if (Array.isArray(c.variants) && c.variants.length > 0) {
          variants = await Promise.all(
            c.variants.map(async (v) => {
              const vImg = await loadImage(v.image);
              return {
                img: vImg,
                name: v.name || "差分",
                naturalW: v.naturalW || vImg.naturalWidth,
                naturalH: v.naturalH || vImg.naturalHeight,
                exprSheet: sanitizeExprSheet(v.exprSheet, vImg.naturalWidth, vImg.naturalHeight),
                activeExpr: typeof v.activeExpr === "number" ? v.activeExpr : -1,
                offsetX: typeof v.offsetX === "number" ? v.offsetX : 0,
                offsetY: typeof v.offsetY === "number" ? v.offsetY : 0,
                scaleAdjust: typeof v.scaleAdjust === "number" ? v.scaleAdjust : 1,
              };
            })
          );
        } else {
          // 差分画像対応より前に保存されたプロジェクトファイル——保存されて
          // いる単一の画像を唯一の差分として扱う
          const img = await loadImage(c.image);
          variants = [
            {
              img,
              name: "オリジナル",
              naturalW: c.naturalW || img.naturalWidth,
              naturalH: c.naturalH || img.naturalHeight,
              exprSheet: sanitizeExprSheet(c.exprSheet, img.naturalWidth, img.naturalHeight),
              activeExpr: typeof c.activeExpr === "number" ? c.activeExpr : -1,
              offsetX: 0,
              offsetY: 0,
              scaleAdjust: 1,
            },
          ];
        }
        const activeVariantIndex =
          typeof c.activeVariantIndex === "number" && c.activeVariantIndex >= 0 && c.activeVariantIndex < variants.length
            ? c.activeVariantIndex
            : 0;
        const active = variants[activeVariantIndex];
        return {
          id: c.id,
          name: c.name || "",
          x: c.x,
          y: c.y,
          scale: c.scale,
          flipX: !!c.flipX,
          silhouette: !!c.silhouette,
          hologram: !!c.hologram,
          grayscale: !!c.grayscale,
          // 表示ON/OFFボタンより前に保存されたデータには存在しないので、その場合は表示中扱い
          visible: typeof c.visible === "boolean" ? c.visible : true,
          // 古い保存データでは0-100の透明度スライダーではなくhiddenの真偽値を使っていた
          opacity: typeof c.opacity === "number" ? c.opacity : c.hidden ? 0 : 100,
          edgeFadeAmount: typeof c.edgeFadeAmount === "number" ? c.edgeFadeAmount : 0,
          edgeFadeTop: !!c.edgeFadeTop,
          edgeFadeBottom: !!c.edgeFadeBottom,
          edgeFadeLeft: !!c.edgeFadeLeft,
          edgeFadeRight: !!c.edgeFadeRight,
          departureEnabled: !!c.departureEnabled,
          departureProgress: typeof c.departureProgress === "number" ? c.departureProgress : 0,
          departureOffsetX: typeof c.departureOffsetX === "number" ? c.departureOffsetX : 0,
          departureOffsetY: typeof c.departureOffsetY === "number" ? c.departureOffsetY : 0,
          departureScale: typeof c.departureScale === "number" ? c.departureScale : 1,
          departureFadeStart: typeof c.departureFadeStart === "number" ? c.departureFadeStart : DEPARTURE_FADE_START_DEFAULT,
          departureFadeEnd: typeof c.departureFadeEnd === "number" ? c.departureFadeEnd : DEPARTURE_FADE_END_DEFAULT,
          departureHue: typeof c.departureHue === "number" ? c.departureHue : 0,
          img: active.img,
          naturalW: active.naturalW,
          naturalH: active.naturalH,
          exprSheet: active.exprSheet,
          activeExpr: active.activeExpr,
          variants,
          activeVariantIndex,
        };
      })
    );

    state.backgrounds = loadedBackgrounds;
    state.characters = loadedCharacters;

    // シナリオの行に含まれるキャラ参照は、読み込んだキャラクター一覧に
    // 実在するidだけを信用する（削除済み/存在しないidへの参照は落とす）。
    // speaker/bodyは自由入力文字列だが、描画側（renderScenarioList）が
    // 必ず.textContentで書き込むため、ここでは型の防御的コアーションのみ
    // 行えばよい（innerHTMLへの直接埋め込みはしない前提）。
    const validCharIds = new Set(loadedCharacters.map((c) => c.id));
    const validBgIds = new Set(loadedBackgrounds.map((b) => b.id));
    const rawScenario = Array.isArray(data.scenario) ? data.scenario : [];
    state.scenario = rawScenario.map((line) =>
      line && line.isStartingFade
        ? {
            id: typeof line.id === "number" ? line.id : nextScenarioLineId++,
            isStartingFade: true,
            enabled: line.enabled !== false,
          }
        : line && line.isEndingFade
        ? {
            id: typeof line.id === "number" ? line.id : nextScenarioLineId++,
            isEndingFade: true,
            enabled: line.enabled !== false,
          }
        : line && line.isSceneTransition
        ? {
            id: typeof line.id === "number" ? line.id : nextScenarioLineId++,
            isSceneTransition: true,
          }
        : {
            id: typeof line.id === "number" ? line.id : nextScenarioLineId++,
            speaker: typeof line.speaker === "string" ? line.speaker : "",
            body: typeof line.body === "string" ? line.body : "",
            activeCharId: validCharIds.has(line.activeCharId) ? line.activeCharId : null,
            nameplateOn: typeof line.nameplateOn === "boolean" ? line.nameplateOn : true,
            // この機能追加より前に保存された行にはfontSize/textColorが無いので、
            // その場合はデフォルト値にする
            fontSize: typeof line.fontSize === "number" ? line.fontSize : BODY_DEFAULT_FONT_SIZE,
            textColor: typeof line.textColor === "string" ? line.textColor : "#ffffff",
            // 背景は削除済み/この機能追加前で不明な場合、nullにしておく
            // （applyScenarioLine側が「現在表示中の背景を保つ」フォールバック
            // を持っているので、ここでnullにしても背景が消えたりはしない）
            activeBackgroundId: validBgIds.has(line.activeBackgroundId) ? line.activeBackgroundId : null,
            // 背景のズーム/位置/色調も、この機能追加より前に保存された行には
            // 無いので、その場合はundefinedのままにしておく——
            // applyScenarioLine側が数値/文字列でなければ現在の値を変えずに
            // 保つ仕組みになっている
            backgroundZoom: typeof line.backgroundZoom === "number" ? line.backgroundZoom : undefined,
            backgroundPanX: typeof line.backgroundPanX === "number" ? line.backgroundPanX : undefined,
            backgroundPanY: typeof line.backgroundPanY === "number" ? line.backgroundPanY : undefined,
            backgroundColorMode: typeof line.backgroundColorMode === "string" ? line.backgroundColorMode : undefined,
            sceneColorMode: typeof line.sceneColorMode === "string" ? line.sceneColorMode : "none",
            chars: Array.isArray(line.chars)
              ? line.chars
                  .filter((s) => s && validCharIds.has(s.charId))
                  .map((s) => ({
                    charId: s.charId,
                    // 位置・拡縮も同様に、無ければundefinedのままにする
                    x: typeof s.x === "number" ? s.x : undefined,
                    y: typeof s.y === "number" ? s.y : undefined,
                    scale: typeof s.scale === "number" ? s.scale : undefined,
                    activeExpr: typeof s.activeExpr === "number" ? s.activeExpr : -1,
                    activeVariantIndex: typeof s.activeVariantIndex === "number" ? s.activeVariantIndex : 0,
                    visible: typeof s.visible === "boolean" ? s.visible : true,
                    opacity: typeof s.opacity === "number" ? s.opacity : 100,
                    // 退去エフェクト対応より前に保存された行にはこれらの
                    // フィールドが無いので、その場合はキャラクター新規追加
                    // 時と同じデフォルト値にする
                    departureEnabled: !!s.departureEnabled,
                    departureProgress: typeof s.departureProgress === "number" ? s.departureProgress : 0,
                    departureOffsetX: typeof s.departureOffsetX === "number" ? s.departureOffsetX : 0,
                    departureOffsetY: typeof s.departureOffsetY === "number" ? s.departureOffsetY : 0,
                    departureScale: typeof s.departureScale === "number" ? s.departureScale : 1,
                    departureFadeStart:
                      typeof s.departureFadeStart === "number" ? s.departureFadeStart : DEPARTURE_FADE_START_DEFAULT,
                    departureFadeEnd:
                      typeof s.departureFadeEnd === "number" ? s.departureFadeEnd : DEPARTURE_FADE_END_DEFAULT,
                    departureHue: typeof s.departureHue === "number" ? s.departureHue : 0,
                  }))
              : [],
            // 選択肢対応より前に保存された行にはこれらのフィールドが無いので、
            // その場合は「選択肢なし」として扱う
            showChoices: !!line.showChoices,
            choiceCount: [1, 2, 3].includes(line.choiceCount) ? line.choiceCount : 2,
            choice1: typeof line.choice1 === "string" ? line.choice1 : "",
            choice2: typeof line.choice2 === "string" ? line.choice2 : "",
            choice3: typeof line.choice3 === "string" ? line.choice3 : "",
            choice1Color: typeof line.choice1Color === "string" ? line.choice1Color : "#ffffff",
            choice2Color: typeof line.choice2Color === "string" ? line.choice2Color : "#ffffff",
            choice3Color: typeof line.choice3Color === "string" ? line.choice3Color : "#ffffff",
          }
    );
    // 旧バージョンのファイル（開始行・終了行が存在しない）でも、実質的な
    // 行が1つ以上あれば新規に補完する。既にあれば定位置へ揃え直す。
    ensureSpecialScenarioLines();
    state.activeCharId = null; // 再生専用の上書き値なので、読み込み直後は必ずクリアする
    state.scenarioSelectedId = null;
    nextScenarioLineId = 1 + state.scenario.reduce((m, l) => Math.max(m, l.id), 0);

    const s = data.state || {};
    state.dimInactive = s.dimInactive ?? true;
    // 古い保存データではsceneColorModeではなくsceneGrayscaleの真偽値を使っていた
    state.sceneColorMode = s.sceneColorMode || (s.sceneGrayscale ? "grayscale" : "none");
    state.nameplateOn = s.nameplateOn ?? true;
    state.showWindow = s.showWindow ?? true;
    state.showButtons = s.showButtons ?? true;
    state.showSkip = s.showSkip ?? true;
    state.showLog = s.showLog ?? true;
    state.showAuto = s.showAuto ?? true;
    state.autoActive = s.autoActive ?? false;
    state.showNext = s.showNext ?? true;
    state.showChoices = s.showChoices ?? false;
    state.choiceCount = [1, 2, 3].includes(s.choiceCount) ? s.choiceCount : 2;
    state.choice1 = s.choice1 || "";
    state.choice2 = s.choice2 || "";
    state.choice3 = s.choice3 || "";
    state.choice1Color = s.choice1Color || "#ffffff";
    state.choice2Color = s.choice2Color || "#ffffff";
    state.choice3Color = s.choice3Color || "#ffffff";
    state.speaker = s.speaker || "";
    state.body = s.body || "";
    state.fontSize = typeof s.fontSize === "number" ? s.fontSize : BODY_DEFAULT_FONT_SIZE;
    state.textColor = s.textColor || "#ffffff";
    state.speakerLinkToChar = s.speakerLinkToChar ?? true;
    state.scenarioAdvanceMode = s.scenarioAdvanceMode === "manual" ? "manual" : "auto";
    state.scenarioAutoDelaySec =
      typeof s.scenarioAutoDelaySec === "number" && s.scenarioAutoDelaySec > 0 ? s.scenarioAutoDelaySec : 3;

    state.activeBackgroundId = state.backgrounds.some((b) => b.id === s.activeBackgroundId)
      ? s.activeBackgroundId
      : state.backgrounds.length
      ? state.backgrounds[state.backgrounds.length - 1].id
      : null;
    state.selectedId = state.characters.some((c) => c.id === s.selectedId)
      ? s.selectedId
      : state.characters.length
      ? state.characters[state.characters.length - 1].id
      : null;

    nextBgId = 1 + state.backgrounds.reduce((m, b) => Math.max(m, b.id), 0);
    nextCharId = 1 + state.characters.reduce((m, c) => Math.max(m, c.id), 0);

    // 差し替え前に、今読み込まれているBGMが鳴っていれば止めておく
    state.bgmTracks.forEach((t) => t.audio.pause());
    const validRealLineIds = new Set(getRealScenarioLines().map((l) => l.id));
    const rawBgmTracks = Array.isArray(data.bgmTracks) ? data.bgmTracks : [];
    state.bgmTracks = rawBgmTracks
      .filter((t) => t && typeof t.audio === "string")
      .map((t) => {
        const audio = new Audio(t.audio);
        audio.loop = true;
        connectBgmTrackForRouting(audio);
        return {
          id: typeof t.id === "number" ? t.id : nextBgmId++,
          name: t.name || "BGM",
          audio,
          volume: typeof t.volume === "number" ? Math.min(1, Math.max(0, t.volume)) : 1,
          // 削除済み/この機能追加前で不明な行を指している場合はnullにしておく
          // （resolveBgmRange側が「先頭/末尾」へのフォールバックを持っている）
          startLineId: validRealLineIds.has(t.startLineId) ? t.startLineId : null,
          endLineId: validRealLineIds.has(t.endLineId) ? t.endLineId : null,
        };
      });
    nextBgmId = 1 + state.bgmTracks.reduce((m, t) => Math.max(m, t.id), 0);

    projectNameInput.value = data.projectName || "";
    syncUiFromState();
  }

  projectSaveBtn.addEventListener("click", () => {
    try {
      const json = JSON.stringify(buildProjectData());
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const customName = sanitizeFilenameInput(projectNameInput.value);
      const stamp = timestampSuffix();
      a.href = url;
      a.download = (customName || "project_" + stamp) + ".fgoscene.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("プロジェクトの保存に失敗しました。");
      console.error(err);
    }
  });

  // ファイル選択（input）・ドラッグ&ドロップの両方から使う共通の
  // プロジェクト読み込み処理。
  async function loadProjectFile(file) {
    if (!file) return;
    const hasContent = state.characters.length > 0 || state.backgrounds.length > 0;
    if (hasContent && !confirm("現在の内容は失われます。プロジェクトを開きますか？")) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await loadProjectData(data);
      // 開いたファイル自体の名前をプロジェクト名欄に反映しておく——
      // loadProjectDataが内部のprojectName（保存時に入力していた名前）で
      // 上書きした直後にこちらで上書きし直す。そのまま「保存」を押せば
      // 同じ名前でダウンロードされる（実質的な上書き保存）。
      projectNameInput.value = file.name.replace(/\.fgoscene\.json$/i, "").replace(/\.json$/i, "");
    } catch (err) {
      alert("プロジェクトの読み込みに失敗しました。ファイル形式をご確認ください。");
      console.error(err);
    }
  }

  projectOpenInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    await loadProjectFile(file);
  });

  // ---------------- ドラッグ&ドロップでのファイル追加 ----------------
  // 背景パネルには画像を背景として、キャラクターパネルには画像を
  // キャラクターとして、保存欄（フッター）にはプロジェクトファイルを
  // ドラッグ&ドロップで追加できるようにする。
  function isFileDrag(evt) {
    return !!(evt.dataTransfer && Array.from(evt.dataTransfer.types || []).includes("Files"));
  }

  // dragenter/dragleaveは子要素をまたぐたびにも発火するため、深さを
  // カウントして0に戻った時だけハイライトを消す（子要素へ出入りする
  // たびにちらつくのを防ぐ）。
  function wireFileDropZone(el, { accept, onFiles }) {
    if (!el) return;
    let depth = 0;
    el.addEventListener("dragenter", (evt) => {
      if (!isFileDrag(evt)) return;
      evt.preventDefault();
      depth++;
      el.classList.add("is-drag-over");
    });
    el.addEventListener("dragover", (evt) => {
      if (!isFileDrag(evt)) return;
      evt.preventDefault(); // ドロップを許可するために必須
    });
    el.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) el.classList.remove("is-drag-over");
    });
    el.addEventListener("drop", (evt) => {
      if (!isFileDrag(evt)) return;
      evt.preventDefault();
      depth = 0;
      el.classList.remove("is-drag-over");
      const files = Array.from(evt.dataTransfer.files || []).filter(accept);
      if (files.length) onFiles(files);
    });
  }

  wireFileDropZone(document.getElementById("bgPanel"), {
    accept: (f) => f.type.startsWith("image/"),
    onFiles: (files) => files.forEach((f) => addBackgroundFromFile(f)),
  });
  wireFileDropZone(document.getElementById("charPanel"), {
    accept: (f) => f.type.startsWith("image/"),
    onFiles: (files) => files.forEach((f) => addCharacterFromFile(f)),
  });
  wireFileDropZone(consoleFooterDetails, {
    accept: (f) => /\.json$/i.test(f.name), // .fgoscene.jsonも.jsonで終わるので拾える
    onFiles: (files) => {
      footerTabProjectBtn.click(); // プロジェクトタブに切り替えてから読み込む
      loadProjectFile(files[0]); // 複数落とされても先頭の1つだけを読み込む
    },
  });

  scenarioAddLineBtn.addEventListener("click", () => {
    captureScenarioLine();
  });

  scenarioAddBlankLineBtn.addEventListener("click", () => {
    addBlankScenarioLine();
  });

  scenarioAddTransitionBtn.addEventListener("click", () => {
    addSceneTransitionLine();
  });

  // ---------------- GIF書き出し ----------------
  // 外部ライブラリを使わない自前実装（ビルドステップの無いプロジェクトの
  // ため、Web Worker用スクリプトを別途ホスティングするような構成の
  // ライブラリは組み込みにくい）。GIF89a・256色固定パレット・中央値分割法
  // (median cut)による減色・標準的なGIF用LZW圧縮だけを実装しており、
  // 透過やローカルカラーテーブルなどは使わない。
  const GIF_CAPTURE_FPS = 8; // 動画ほどの滑らかさは不要な代わりにファイルサイズを抑える
  const GIF_CAPTURE_W = 640;
  const GIF_CAPTURE_H = Math.round((GIF_CAPTURE_W * CANVAS_H) / CANVAS_W); // 元と同じ16:9比率
  const GIF_MAX_COLORS = 256;
  const GIF_MAX_FRAMES = 500; // 8fpsで約62秒分。長時間シナリオでのメモリ暴走を防ぐ安全弁

  // 与えられたRGBサンプル（[r,g,b, r,g,b, ...]の平坦配列）から、中央値分割法で
  // 最大maxColors色のパレットを作る。戻り値は[r,g,b, r,g,b, ...]のUint8Array。
  function medianCutQuantize(samples, maxColors) {
    const pixelCount = samples.length / 3;
    if (pixelCount === 0) return new Uint8Array([0, 0, 0]);

    const indices = new Uint32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) indices[i] = i;

    const boxStats = (start, end) => {
      let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
      for (let i = start; i < end; i++) {
        const p = indices[i] * 3;
        const r = samples[p], g = samples[p + 1], b = samples[p + 2];
        if (r < rMin) rMin = r;
        if (r > rMax) rMax = r;
        if (g < gMin) gMin = g;
        if (g > gMax) gMax = g;
        if (b < bMin) bMin = b;
        if (b > bMax) bMax = b;
      }
      return { rMin, rMax, gMin, gMax, bMin, bMax };
    };

    const boxes = [{ start: 0, end: pixelCount, stats: boxStats(0, pixelCount) }];

    while (boxes.length < maxColors) {
      // 「範囲の広さ×点数」が最大の箱を選んで分割する
      let bestIdx = -1;
      let bestScore = -1;
      boxes.forEach((box, i) => {
        if (box.end - box.start <= 1) return;
        const { rMin, rMax, gMin, gMax, bMin, bMax } = box.stats;
        const range = Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
        const score = range * (box.end - box.start);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      });
      if (bestIdx === -1) break; // これ以上分割できる箱が無い

      const box = boxes[bestIdx];
      const { rMin, rMax, gMin, gMax, bMin, bMax } = box.stats;
      const rRange = rMax - rMin, gRange = gMax - gMin, bRange = bMax - bMin;
      let channel = 0; // 0=r, 1=g, 2=b（最も範囲が広いチャンネルで分割する）
      if (gRange >= rRange && gRange >= bRange) channel = 1;
      else if (bRange >= rRange && bRange >= gRange) channel = 2;

      const sub = Array.from(indices.subarray(box.start, box.end));
      sub.sort((a, b2) => samples[a * 3 + channel] - samples[b2 * 3 + channel]);
      for (let i = 0; i < sub.length; i++) indices[box.start + i] = sub[i];

      const mid = box.start + Math.floor(sub.length / 2);
      boxes.splice(
        bestIdx,
        1,
        { start: box.start, end: mid, stats: boxStats(box.start, mid) },
        { start: mid, end: box.end, stats: boxStats(mid, box.end) }
      );
    }

    const palette = new Uint8Array(boxes.length * 3);
    boxes.forEach((box, i) => {
      let rSum = 0, gSum = 0, bSum = 0;
      const count = box.end - box.start;
      for (let j = box.start; j < box.end; j++) {
        const p = indices[j] * 3;
        rSum += samples[p];
        gSum += samples[p + 1];
        bSum += samples[p + 2];
      }
      palette[i * 3] = Math.round(rSum / count);
      palette[i * 3 + 1] = Math.round(gSum / count);
      palette[i * 3 + 2] = Math.round(bSum / count);
    });
    return palette;
  }

  // パレット中の各色を5bit刻み(32段階)に量子化した組み合わせ(32768通り)
  // ごとに、最も近いパレット色のインデックスを事前計算しておく。
  // フレームごと・ピクセルごとにパレット全色と総当たりで距離計算する
  // 必要が無くなり、量子化が実用的な速度で終わる。
  function buildPaletteLookup(palette) {
    const paletteSize = palette.length / 3;
    const lookup = new Uint8Array(32 * 32 * 32);
    for (let r5 = 0; r5 < 32; r5++) {
      const r = (r5 * 255) / 31;
      for (let g5 = 0; g5 < 32; g5++) {
        const g = (g5 * 255) / 31;
        for (let b5 = 0; b5 < 32; b5++) {
          const b = (b5 * 255) / 31;
          let best = 0;
          let bestDist = Infinity;
          for (let i = 0; i < paletteSize; i++) {
            const dr = r - palette[i * 3];
            const dg = g - palette[i * 3 + 1];
            const db = b - palette[i * 3 + 2];
            const dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) {
              bestDist = dist;
              best = i;
            }
          }
          lookup[(r5 << 10) | (g5 << 5) | b5] = best;
        }
      }
    }
    return lookup;
  }

  // キャプチャした1フレーム分のRGBA画素(Uint8ClampedArray)を、パレット
  // インデックス列(Uint8Array、1画素1バイト)に変換する。
  function quantizeFrameToIndices(rgba, lookup) {
    const pixelCount = rgba.length / 4;
    const indices = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const p = i * 4;
      const r5 = rgba[p] >> 3, g5 = rgba[p + 1] >> 3, b5 = rgba[p + 2] >> 3;
      indices[i] = lookup[(r5 << 10) | (g5 << 5) | b5];
    }
    return indices;
  }

  // GIF形式のLZW圧縮。クリアコードで始まり、コード幅は辞書が埋まるごとに
  // 1bitずつ広がっていく（最大12bit）。戻り値はデータサブブロック分割
  // 済みの生バイト列（各ブロックの先頭にサイズバイト、末尾に終端の
  // 長さ0ブロックを含む）。
  function lzwEncodeGif(indices, colorDepth) {
    const clearCode = 1 << colorDepth;
    const eoiCode = clearCode + 1;
    const maxCodeSize = 12;
    const maxDictSize = 1 << maxCodeSize;

    const output = [];
    let bitBuffer = 0;
    let bitCount = 0;
    const emitCode = (code, codeSize) => {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        output.push(bitBuffer & 0xff);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    };

    let codeSize, nextCode, dict;
    const resetDict = () => {
      dict = new Map();
      codeSize = colorDepth + 1;
      nextCode = eoiCode + 1;
    };
    resetDict();
    emitCode(clearCode, codeSize);

    // 現在の"w"（合成中の並び）を、既存コードの数値合成キーで表す
    // （w_code * 256 + 次の1バイト）——文字列連結より速い
    let prefixCode = -1;
    for (let i = 0; i < indices.length; i++) {
      const k = indices[i];
      if (prefixCode === -1) {
        prefixCode = k;
        continue;
      }
      const key = prefixCode * 256 + k;
      const existing = dict.get(key);
      if (existing !== undefined) {
        prefixCode = existing;
      } else {
        emitCode(prefixCode, codeSize);
        if (nextCode < maxDictSize) {
          dict.set(key, nextCode);
          if (nextCode === 1 << codeSize && codeSize < maxCodeSize) codeSize++;
          nextCode++;
        } else {
          // 辞書が満杯——クリアコードで一旦リセットする
          emitCode(clearCode, codeSize);
          resetDict();
        }
        prefixCode = k;
      }
    }
    if (prefixCode !== -1) emitCode(prefixCode, codeSize);
    emitCode(eoiCode, codeSize);
    if (bitCount > 0) output.push(bitBuffer & 0xff);

    const blocks = [];
    for (let i = 0; i < output.length; i += 255) {
      const chunk = output.slice(i, i + 255);
      blocks.push(chunk.length, ...chunk);
    }
    blocks.push(0);
    return new Uint8Array(blocks);
  }

  // フレーム列（各要素{indices}）とパレットからGIF89aのバイト列を組み立てる。
  function buildGifBlob(frames, palette, width, height, delayCs) {
    const paletteSize = palette.length / 3;
    const colorDepth = Math.max(2, Math.ceil(Math.log2(paletteSize)));
    const tableSize = 1 << colorDepth;

    const bytes = [];
    const pushStr = (s) => {
      for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
    };
    const pushU16 = (n) => {
      bytes.push(n & 0xff, (n >> 8) & 0xff);
    };

    pushStr("GIF89a");

    // Logical Screen Descriptor
    pushU16(width);
    pushU16(height);
    bytes.push(0x80 | ((colorDepth - 1) << 4) | (colorDepth - 1));
    bytes.push(0); // background color index
    bytes.push(0); // pixel aspect ratio

    // Global Color Table（2の冪サイズになるよう黒で埋める）
    for (let i = 0; i < tableSize; i++) {
      if (i < paletteSize) {
        bytes.push(palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]);
      } else {
        bytes.push(0, 0, 0);
      }
    }

    // Application Extension（NETSCAPE2.0 — ループ回数0=無限ループ）
    bytes.push(0x21, 0xff, 0x0b);
    pushStr("NETSCAPE2.0");
    bytes.push(0x03, 0x01);
    pushU16(0);
    bytes.push(0x00);

    frames.forEach((frame) => {
      // Graphic Control Extension
      bytes.push(0x21, 0xf9, 0x04);
      bytes.push(0x00); // disposal method未指定・透過なし
      pushU16(delayCs);
      bytes.push(0x00); // 透過色インデックス（未使用）
      bytes.push(0x00);

      // Image Descriptor
      bytes.push(0x2c);
      pushU16(0);
      pushU16(0);
      pushU16(width);
      pushU16(height);
      bytes.push(0x00); // ローカルカラーテーブルなし（グローバルを使う）

      // Image Data
      bytes.push(colorDepth); // LZW最小コードサイズ
      const lzwBytes = lzwEncodeGif(frame.indices, colorDepth);
      for (let i = 0; i < lzwBytes.length; i++) bytes.push(lzwBytes[i]);
    });

    bytes.push(0x3b); // trailer
    return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
  }

  function yieldToUi() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  // 再生中はキャプチャ専用の小さいcanvasにGIF_CAPTURE_FPSの間隔だけ
  // オフスクリーンcanvas（フルサイズ）を縮小コピーし、生RGBAのまま
  // 保持しておく（減色は全フレーム分そろってから一括で行う——パレットは
  // シナリオ全体の色分布から決めたいため）。
  function captureGifFrameIfDue() {
    if (!gifCapture || !playback || !playback.offscreenCanvas) return;
    const now = performance.now();
    const interval = 1000 / GIF_CAPTURE_FPS;
    if (gifCapture.frames.length > 0 && now - gifCapture.lastSampleTime < interval) return;
    if (gifCapture.frames.length >= GIF_MAX_FRAMES) return; // 安全弁：これ以上は記録しない
    gifCapture.lastSampleTime = now;
    gifCapture.ctx.drawImage(playback.offscreenCanvas, 0, 0, GIF_CAPTURE_W, GIF_CAPTURE_H);
    gifCapture.frames.push(gifCapture.ctx.getImageData(0, 0, GIF_CAPTURE_W, GIF_CAPTURE_H).data);
  }

  // 再生中/生成中に二重でGIFを生成しようとするのを防ぐガード
  let gifEncoding = false;

  // キャプチャした生フレーム群からパレットを作り、減色・LZW圧縮してGIFを
  // 組み立て、ダウンロードする。stopScenarioPlaybackから発火（await
  // しない）——再生セッション自体の後始末は先に完了させ、生成の完了は
  // 待たない。処理が長くなりうるフレーム数の多いシナリオでもUIが固まら
  // ないよう、要所でyieldToUiを挟んでいる。
  async function encodeAndDownloadGif(capture) {
    if (!capture || capture.frames.length === 0) return;
    gifEncoding = true;
    const totalFrames = capture.frames.length;
    const setStatus = (text) => {
      videoFormatHint.textContent = text;
    };

    try {
      setStatus("GIFを生成中…（パレットを作成しています）");
      await yieldToUi();

      // パレット用のサンプルは全フレーム・全画素だと重すぎるため、
      // フレーム・画素とも間引いて代表的な色分布だけを拾う
      const frameStep = Math.max(1, Math.floor(totalFrames / 40));
      const pixelStep = 4 * 7;
      const samples = [];
      for (let f = 0; f < totalFrames; f += frameStep) {
        const rgba = capture.frames[f];
        for (let i = 0; i < rgba.length; i += pixelStep) {
          samples.push(rgba[i], rgba[i + 1], rgba[i + 2]);
        }
      }
      const palette = medianCutQuantize(new Uint8Array(samples), GIF_MAX_COLORS);
      const lookup = buildPaletteLookup(palette);

      const encodedFrames = [];
      for (let i = 0; i < totalFrames; i++) {
        encodedFrames.push({ indices: quantizeFrameToIndices(capture.frames[i], lookup) });
        capture.frames[i] = null; // 使い終わった生ピクセルは早めに解放する
        if (i % 10 === 9) {
          setStatus(`GIFを生成中…（${i + 1}/${totalFrames}フレーム）`);
          await yieldToUi();
        }
      }

      setStatus("GIFを書き出しています…");
      await yieldToUi();

      const delayCs = Math.max(2, Math.round(100 / GIF_CAPTURE_FPS));
      const blob = buildGifBlob(encodedFrames, palette, GIF_CAPTURE_W, GIF_CAPTURE_H, delayCs);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const customName = sanitizeFilenameInput(videoNameInput.value);
      a.href = url;
      a.download = (customName || "scenario_" + timestampSuffix()) + ".gif";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("GIFの生成に失敗しました。");
      console.error(err);
    } finally {
      gifEncoding = false;
      videoFormatHint.textContent = VIDEO_HINT_DEFAULT; // ヒント文言を通常表示に戻す
    }
  }

  // ---------------- シナリオ再生・録画 ----------------
  const VIDEO_MIME_CANDIDATES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

  // ---- LOGボタンの履歴画面 ----
  // 再生セッション中に表示された台詞・選ばれた選択肢を、退去演出・特殊行を
  // 除いて順番に記録しておく（goToScenarioLine・updateChoiceAnim参照）。
  // プロジェクトには保存せず、再生を開始するたびに空にする。fontSize/
  // textColorは表示当時の値をそのまま保持し、ログでも実際の台詞と同じ
  // 見た目（文字サイズ・色のグラデーション・ルビ・強調の点）で再現する。
  let dialogueLog = [];
  // 台詞: { type: "dialogue", speaker: string|null, body: string, fontSize: number, textColor: string }
  // 選択肢: { type: "choice", body: string } — 選ばれた方だけを記録する（表示は赤固定）
  // 空行: { type: "blank" } — 台詞を伴わないシーン（退去演出・場面転換等）の目印
  let logOverlayOpen = false;
  let logScrollOffset = 0; // 0=一番下（最新）。増えるほど上（過去）へスクロールした状態
  let logDragStartClientY = 0;
  let logDragStartScroll = 0;
  let logDragMoved = false;
  // スクロールバーのつまみ自体をドラッグしている間の状態
  let logScrollbarDragStartClientY = 0;
  let logScrollbarDragStartScrollTop = 0;
  let logScrollbarDragGeo = null; // ドラッグ開始時点のgetLogScrollGeometry()結果（トラック寸法の基準に使う）

  // 左右非対称のマージン——文章側は左に寄せたいので狭く、右側はスクロール
  // バーをゆったり置けるだけの余白を確保する
  const LOG_MARGIN_LEFT = 55;
  const LOG_MARGIN_RIGHT = 100;
  const LOG_MARGIN_TOP = 70;
  const LOG_MARGIN_BOTTOM = 70;
  const LOG_ENTRY_GAP = 24;
  const LOG_INDENT = "　"; // 1段の字下げに使う全角スペース1つ
  const LOG_CHOICE_LABEL_COLOR = "#ff0000"; // 純粋な赤——makeTextGradient経由で他の文字と同じ手法の陰影が付く
  const LOG_TAP_THRESHOLD_PX = 6; // これ未満の移動量なら「ドラッグ」ではなく「タップ」扱い
  const LOG_BLANK_LINE_HEIGHT = Math.round(NAME_FONT_SIZE * 1.6); // 台詞を挟まない行の代わりに入れる空行1つ分の高さ
  // スクロールバーは、細いトラック（レール）の上に、それより幅の広い
  // つまみ（scroll.png）を中心線を揃えて重ねる——つまみがトラックから
  // 左右にはみ出す大きめのデザインにするため、幅を2種類持つ。
  const LOG_SCROLLBAR_TRACK_WIDTH = 18;
  const LOG_SCROLLBAR_WIDTH = 84; // つまみの幅（トラックより広く、はみ出す）
  const LOG_SCROLLBAR_GAP_FROM_TEXT = 24; // 本文の右端からスクロールバー（トラック）までの間隔
  const LOG_SCROLLBAR_TRACK_X = CANVAS_W - LOG_MARGIN_RIGHT + LOG_SCROLLBAR_GAP_FROM_TEXT;
  // つまみはトラックと中心線が揃うように、左右均等にはみ出させて配置する
  const LOG_SCROLLBAR_X = LOG_SCROLLBAR_TRACK_X + LOG_SCROLLBAR_TRACK_WIDTH / 2 - LOG_SCROLLBAR_WIDTH / 2;
  const LOG_SCROLLBAR_MIN_HANDLE_HEIGHT = 110; // 掴みやすさのための最小の長さ（scroll.pngの先端2つ分は超える値にする）

  // 退去演出・場面転換など、台詞を伴わないシーンがあったことをログ上でも
  // 分かるように、空行を1つ挟む。連続しても積み上がらないよう、直前が
  // 既に空行ならもう追加しない（何行分の空白かは区別せず、まとめて1つ）。
  function pushBlankLogEntry() {
    if (dialogueLog.length > 0 && dialogueLog[dialogueLog.length - 1].type === "blank") return;
    dialogueLog.push({ type: "blank" });
  }

  // 折り返した2行目以降が、1行目の「（かぎ括弧）の直後にある本文の頭」と
  // 揃うように、hangingIndent（「の見た目の幅）分だけ2行目以降を追加で
  // 右へずらしてブロックを積む共通ヘルパー。
  function pushLogTextBlock(context, blocks, paragraphs, fontSize, color, x, wrapWidth, hangingIndent, y) {
    const lines = layoutBodyLines(context, paragraphs, wrapWidth, fontSize);
    const lineHeight = Math.round(fontSize * 1.6);
    const height = lines.length * lineHeight;
    blocks.push({ lines, x, hangingIndent: hangingIndent || 0, y, height, fontSize, color });
    return height;
  }

  // dialogueLogを、実際に描画するブロックの配列へ展開する。台詞テキストと
  // 全く同じlayoutBodyLines/renderBodyLines（ルビ・強調の点・文字色
  // グラデーションに対応）を使い回すことで見た目を完全に一致させる。
  //   ・名前欄あり: 名前（NAME_FONT_SIZE/NAME_TEXT_COLOR固定） →
  //     1段字下げ+「本文」（その行のfontSize/textColor、2行目以降は
  //     「の幅ぶん追加で字下げして本文の頭と揃える）
  //   ・名前欄なし: 本文をそのまま（括弧・名前・字下げ無し）
  //   ・選択肢: 1段字下げの赤字「Select」→2段字下げでその選択肢自身の
  //     色・CHOICE_FONT_SIZEの本文
  function buildLogLayout(context) {
    const maxWidth = CANVAS_W - LOG_MARGIN_LEFT - LOG_MARGIN_RIGHT;
    const blocks = [];
    let y = 0;
    dialogueLog.forEach((entry, entryIdx) => {
      if (entryIdx > 0) y += LOG_ENTRY_GAP;

      if (entry.type === "blank") {
        // 台詞を伴わないシーン（退去演出・場面転換等）があったことを示す
        // だけの空行——描画するブロックは無く、高さだけを積む
        y += LOG_BLANK_LINE_HEIGHT;
        return;
      }

      if (entry.type === "choice") {
        context.font = NAME_FONT_SIZE + "px " + bodyFontStack();
        const indent1 = context.measureText(LOG_INDENT).width;
        y += pushLogTextBlock(
          context,
          blocks,
          [parseRubyParagraph("Select")],
          NAME_FONT_SIZE,
          LOG_CHOICE_LABEL_COLOR,
          LOG_MARGIN_LEFT + indent1,
          maxWidth - indent1,
          0,
          y
        );

        context.font = CHOICE_FONT_SIZE + "px " + bodyFontStack();
        const indent2 = context.measureText(LOG_INDENT).width * 2;
        y += pushLogTextBlock(
          context,
          blocks,
          parseRubyText(entry.body),
          CHOICE_FONT_SIZE,
          LOG_CHOICE_LABEL_COLOR, // Selectラベルと同じ赤——選ばれた選択肢の文言もここでは赤で表示する
          LOG_MARGIN_LEFT + indent2,
          maxWidth - indent2,
          0,
          y
        );
        return;
      }

      if (entry.speaker) {
        y += pushLogTextBlock(
          context,
          blocks,
          [parseRubyParagraph(entry.speaker)],
          NAME_FONT_SIZE,
          NAME_TEXT_COLOR,
          LOG_MARGIN_LEFT,
          maxWidth,
          0,
          y
        );

        // 自前で追加した括弧はルビ記法ではないので、ただのtext runとして
        // 前後に足すだけで、既存のレイアウト/描画にそのまま乗る
        const paragraphs = parseRubyText(entry.body);
        paragraphs[0] = [{ type: "text", ch: "「" }, ...paragraphs[0]];
        const lastIdx = paragraphs.length - 1;
        paragraphs[lastIdx] = [...paragraphs[lastIdx], { type: "text", ch: "」" }];

        context.font = entry.fontSize + "px " + bodyFontStack();
        const indentWidth = context.measureText(LOG_INDENT).width;
        const bracketWidth = context.measureText("「").width;
        y += pushLogTextBlock(
          context,
          blocks,
          paragraphs,
          entry.fontSize,
          entry.textColor,
          LOG_MARGIN_LEFT + indentWidth,
          maxWidth - indentWidth,
          bracketWidth,
          y
        );
      } else {
        y += pushLogTextBlock(
          context,
          blocks,
          parseRubyText(entry.body),
          entry.fontSize,
          entry.textColor,
          LOG_MARGIN_LEFT,
          maxWidth,
          0,
          y
        );
      }
    });
    return { blocks, totalHeight: y };
  }

  // buildLogLayoutは全エントリぶんのルビ解析/折り返し計算をやり直す
  // ため、スクロール中（pointermove・wheelのたびに何度も呼ばれる）に
  // 毎回丸ごと計算し直すとログが長いほど重くなり、操作がガタつく原因に
  // なる。ログの中身（dialogueLog）は再生中に行が進んだ時だけ増える
  // ものなので、その時だけ作り直せば十分——件数が変わっていなければ
  // 前回の結果をそのまま使い回す。
  let logLayoutCache = null; // { forCount, blocks, totalHeight }
  function getLogLayout() {
    if (!logLayoutCache || logLayoutCache.forCount !== dialogueLog.length) {
      const { blocks, totalHeight } = buildLogLayout(ctx);
      logLayoutCache = { forCount: dialogueLog.length, blocks, totalHeight };
    }
    return logLayoutCache;
  }

  // logScrollOffset（0=一番下）を、実際にスクロールできる範囲にクランプする
  function clampLogScroll(offset) {
    const viewHeight = CANVAS_H - LOG_MARGIN_TOP - LOG_MARGIN_BOTTOM;
    const { totalHeight } = getLogLayout();
    const maxScroll = Math.max(0, totalHeight - viewHeight);
    return Math.min(maxScroll, Math.max(0, offset));
  }

  // LOGのスクロール量・スクロールバーの寸法をまとめて計算する（描画・
  // つまみの当たり判定・ドラッグ操作のすべてから参照する共通の基準）。
  // 呼ぶたびにlogScrollOffset自体も有効範囲へクランプする。
  // つまみの長さは表示割合（viewHeight/totalHeight）に比例させ、掴みやすい
  // 最小長は下回らないようにする——ログが一画面に収まる場合はトラック
  // 全体を覆う長さになる。
  function getLogScrollGeometry() {
    const viewTop = LOG_MARGIN_TOP;
    const viewHeight = CANVAS_H - LOG_MARGIN_TOP - LOG_MARGIN_BOTTOM;
    const { totalHeight } = getLogLayout();
    const maxScroll = Math.max(0, totalHeight - viewHeight);
    logScrollOffset = Math.min(maxScroll, Math.max(0, logScrollOffset));
    const rawHandleHeight = totalHeight > viewHeight ? viewHeight * (viewHeight / totalHeight) : viewHeight;
    const handleHeight = Math.min(viewHeight, Math.max(LOG_SCROLLBAR_MIN_HANDLE_HEIGHT, rawHandleHeight));
    const scrollTop = maxScroll - logScrollOffset; // 0=先頭（最古）が見える位置
    const handleY = maxScroll > 0 ? viewTop + (scrollTop / maxScroll) * (viewHeight - handleHeight) : viewTop;
    return { viewTop, viewHeight, totalHeight, maxScroll, handleHeight, handleY, scrollTop };
  }

  // pos（キャンバス座標）がスクロールバーのつまみの上かどうか
  function hitLogScrollbarHandle(pos) {
    if (!logOverlayOpen) return false;
    const geo = getLogScrollGeometry();
    if (geo.maxScroll <= 0) return false; // 1画面に収まりスクロールバー自体を表示していない
    return (
      pos.x >= LOG_SCROLLBAR_X &&
      pos.x <= LOG_SCROLLBAR_X + LOG_SCROLLBAR_WIDTH &&
      pos.y >= geo.handleY &&
      pos.y <= geo.handleY + geo.handleHeight
    );
  }

  // LOGボタンで開く履歴画面——SKIPボタンを含むUI全体より手前（最後）に
  // 描画する。drawScene本体には含めず、ライブプレビュー専用（録画・GIF
  // 書き出しには焼き込まない——drawEditorOverlayと同じ扱い）。
  function drawLogOverlay(context) {
    if (!logOverlayOpen) return;
    context.save();
    context.fillStyle = "rgba(0, 0, 0, 0.82)";
    context.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const { blocks } = getLogLayout();

    if (blocks.length === 0) {
      context.fillStyle = "rgba(255, 255, 255, 0.6)";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "28px " + bodyFontStack();
      context.fillText("まだ記録がありません", CANVAS_W / 2, CANVAS_H / 2);
      context.restore();
      return;
    }

    const geo = getLogScrollGeometry();
    const viewTop = geo.viewTop;

    // クリップ領域は表示枠（viewTop〜viewTop+viewHeight）ではなく、キャンバス
    // 全体の縦幅にする——こうすると文字は上下の余白の途中で唐突に切れず、
    // 画面（キャンバス）の外に完全に出た時だけ見えなくなる。
    context.save();
    context.beginPath();
    context.rect(LOG_MARGIN_LEFT, 0, CANVAS_W - LOG_MARGIN_LEFT - LOG_MARGIN_RIGHT, CANVAS_H);
    context.clip();
    blocks.forEach((block) => {
      const blockTop = viewTop + (block.y - geo.scrollTop);
      if (blockTop + block.height < 0 || blockTop > CANVAS_H) return; // キャンバス外は描かない
      if (block.hangingIndent > 0 && block.lines.length > 1) {
        // 2行目以降だけ、かぎ括弧の幅ぶん追加でずらして本文の頭と揃える
        const lineHeight = Math.round(block.fontSize * 1.6);
        block.lines.forEach((line, i) => {
          const lineX = i === 0 ? block.x : block.x + block.hangingIndent;
          renderBodyLines(context, [line], lineX, blockTop + i * lineHeight, block.fontSize, block.color);
        });
      } else {
        renderBodyLines(context, block.lines, block.x, blockTop, block.fontSize, block.color);
      }
    });
    context.restore();

    // スクロールバー——黒背景＋白縁取りの半透明トラックの上に、scroll.pngを
    // 縦方向に伸縮させたつまみを重ねる。ログの長さに応じてつまみの長さ・
    // 位置が変わる（getLogScrollGeometry参照）。1画面に収まりスクロールの
    // 必要が無いとき（maxScroll===0）は、操作しようがないスクロールバー
    // 自体を表示しない。
    if (assets.scroll && geo.maxScroll > 0) {
      context.save();
      context.fillStyle = "rgba(0, 0, 0, 0.1)";
      context.fillRect(LOG_SCROLLBAR_TRACK_X, viewTop, LOG_SCROLLBAR_TRACK_WIDTH, geo.viewHeight);
      context.strokeStyle = "rgba(255, 255, 255, 0.5)";
      context.lineWidth = 2;
      context.strokeRect(LOG_SCROLLBAR_TRACK_X, viewTop, LOG_SCROLLBAR_TRACK_WIDTH, geo.viewHeight);
      drawScrollHandle(context, assets.scroll, LOG_SCROLLBAR_X, geo.handleY, LOG_SCROLLBAR_WIDTH, geo.handleHeight);
      context.restore();
    }

    context.restore();
  }

  // LOG画面を開いている間、裏でAUTO進行のタイマーが動いたまま次の行へ
  // 進んでしまうと、閉じたときに読んでいた場面が飛んでしまう。開く瞬間に
  // 保留中のタイマーを止め、閉じる瞬間に（読み終えていれば）フルの待ち
  // 秒数からタイマーを張り直す——厳密な残り時間の復元はしない、単純な仕様。
  function pauseAutoAdvanceForLog() {
    if (!playback) return;
    if (playback.timerId) {
      clearTimeout(playback.timerId);
      playback.timerId = null;
      playback.logResumeAutoAdvance = true;
    }
  }

  function resumeAutoAdvanceAfterLog() {
    if (!playback || !playback.logResumeAutoAdvance) return;
    playback.logResumeAutoAdvance = false;
    if (
      state.scenarioAdvanceMode === "auto" &&
      playback.currentLine &&
      !playback.currentLine.showChoices &&
      (!dialogueAnim || dialogueAnim.phase === "holding")
    ) {
      playback.timerId = setTimeout(() => advanceScenarioPlayback(), Math.max(0.1, state.scenarioAutoDelaySec) * 1000);
    }
  }

  // セリフのタイプライター表示＋退出スライドの状態機械。シナリオ再生中
  // だけ使う実行時オブジェクト（プロジェクトには保存しない）。
  // { phase: "typing"|"holding"|"exiting", lines, totalRuns, revealedRuns,
  //   fontSize, color, phaseStartTime, exitProgress, nextBody, nextFontSize, nextColor }
  let dialogueAnim = null;

  function startDialogueTyping(text, fontSize, color, speakerCharId) {
    const paragraphs = parseRubyText(text);
    const lines = layoutBodyLines(ctx, paragraphs, BODY_MAX_WIDTH, fontSize);
    const totalRuns = lines.reduce((n, line) => n + line.length, 0);
    dialogueAnim = {
      phase: "typing",
      lines,
      totalRuns,
      revealedRuns: 0,
      fontSize,
      color,
      speakerCharId,
      phaseStartTime: performance.now(),
      exitProgress: 0,
      nextBody: null,
      nextFontSize: null,
      nextColor: null,
      nextSpeakerCharId: null,
    };
  }

  // 同じキャラクターが続けて喋る場合にのみ呼ばれる（呼び出し元の
  // goToScenarioLineで話者の同一性を判定済み）。直前に何か表示中ならまず
  // 退出フェーズへ、何も無ければ（シナリオ最初の行など）そのままタイプ
  // 表示を開始する。
  function beginDialogueExit(nextBody, nextFontSize, nextColor, nextSpeakerCharId) {
    if (!dialogueAnim) {
      startDialogueTyping(nextBody, nextFontSize, nextColor, nextSpeakerCharId);
      return;
    }
    dialogueAnim = {
      ...dialogueAnim,
      phase: "exiting",
      phaseStartTime: performance.now(),
      exitProgress: 0,
      nextBody,
      nextFontSize,
      nextColor,
      nextSpeakerCharId,
    };
  }

  // 全文表示が完了した瞬間に呼ばれる。自動進行の場合はここで初めて
  // 待機タイマーを張ることで、タイプライター表示中の時間が自動進行の
  // 待ち秒数を食ってしまわないようにする。
  function onDialogueFullyRevealed() {
    if (playback && playback.pendingAutoAdvance != null) {
      playback.timerId = setTimeout(() => advanceScenarioPlayback(), Math.max(0.1, playback.pendingAutoAdvance) * 1000);
      playback.pendingAutoAdvance = null;
      state.autoActive = true;
      autoActiveToggle.checked = true;
    }
  }

  // 再生中は毎フレーム呼ぶ。経過時間から表示進捗を計算するだけで、
  // フレームレート依存の固定歩数は使わない。
  function updateDialogueAnim() {
    if (!dialogueAnim) return;
    const now = performance.now();
    if (dialogueAnim.phase === "typing") {
      const elapsed = now - dialogueAnim.phaseStartTime;
      const revealed = Math.min(dialogueAnim.totalRuns, Math.floor(elapsed / TYPEWRITER_MS_PER_RUN));
      dialogueAnim.revealedRuns = revealed;
      if (revealed >= dialogueAnim.totalRuns) {
        dialogueAnim.phase = "holding";
        onDialogueFullyRevealed();
      }
    } else if (dialogueAnim.phase === "exiting") {
      const elapsed = now - dialogueAnim.phaseStartTime;
      dialogueAnim.exitProgress = Math.min(1, elapsed / DIALOGUE_EXIT_MS);
      if (dialogueAnim.exitProgress >= 1) {
        const { nextBody, nextFontSize, nextColor, nextSpeakerCharId } = dialogueAnim;
        if (nextBody != null) {
          startDialogueTyping(nextBody, nextFontSize, nextColor, nextSpeakerCharId);
        } else {
          dialogueAnim = null;
        }
      }
    }
  }

  // 選択肢クリック後の演出。選ばれなかった選択肢は即座にフェードアウトを
  // 始め、選ばれた方は少し遅れてフェードアウトを始める。両方消え終わったら
  // 次の行へ進む（内容による分岐は現状無視し、どれを選んでも同じ次の行へ）。
  // { phase: "waiting"|"exiting", selectedIdx, startTime }
  let choiceAnim = null;

  // 指定した選択肢スロットの現在の不透明度（0〜1）。choiceAnimが無い
  // （選択肢待機中、またはそもそも再生中でない）場合は常に1。
  function choiceOpacityFor(idx) {
    if (!choiceAnim || choiceAnim.phase !== "exiting") return 1;
    const elapsed = performance.now() - choiceAnim.startTime;
    if (idx === choiceAnim.selectedIdx) {
      const p = Math.max(0, Math.min(1, (elapsed - CHOICE_SELECTED_FADE_DELAY_MS) / CHOICE_FADE_MS));
      return 1 - p;
    }
    const p = Math.max(0, Math.min(1, elapsed / CHOICE_FADE_MS));
    return 1 - p;
  }

  // 選ばれた選択肢の文字列だけに乗せる拡大＋フェードアウト演出の現在値。
  // 箱自体（choiceOpacityFor）とは別に、文字列だけ独立して進む。
  function choiceSelectedTextProgress() {
    if (!choiceAnim || choiceAnim.phase !== "exiting") return { opacity: 1, fontSize: CHOICE_FONT_SIZE };
    const elapsed = performance.now() - choiceAnim.startTime;
    const p = Math.max(0, Math.min(1, elapsed / CHOICE_SELECTED_TEXT_ZOOM_MS));
    return {
      opacity: 1 - p,
      fontSize: CHOICE_FONT_SIZE + (CHOICE_SELECTED_TEXT_ZOOM_TARGET_SIZE - CHOICE_FONT_SIZE) * p,
    };
  }

  // 再生中は毎フレーム呼ぶ。選ばれた選択肢のフェードが完了し、さらに
  // CHOICE_POST_FADE_DELAY_MSだけ間を置いてから次の行へ進む。
  function updateChoiceAnim() {
    if (!choiceAnim || choiceAnim.phase !== "exiting") return;
    const elapsed = performance.now() - choiceAnim.startTime;
    if (elapsed - CHOICE_SELECTED_FADE_DELAY_MS >= CHOICE_FADE_MS + CHOICE_POST_FADE_DELAY_MS) {
      // LOGボタンの履歴には、選ばれた方の選択肢だけを記録する
      // （表示は常に赤固定——buildLogLayout参照）
      const line = playback && playback.currentLine;
      if (line && line.showChoices && typeof choiceAnim.selectedIdx === "number") {
        const texts = [line.choice1, line.choice2, line.choice3];
        const text = texts[choiceAnim.selectedIdx];
        if (text && text.trim()) {
          dialogueLog.push({ type: "choice", body: text });
        }
      }
      choiceAnim = null;
      advanceScenarioPlayback();
    }
  }

  // シナリオ終了時（自然終了・SKIP押下のどちらも）の画面暗転演出。
  // 4段階を経過時間だけで管理する（{ startTime }のみ、直前の画面は
  // そのまま残しその上に重ねるだけなので他の状態は不要）:
  //   1. 0〜ENDING_FADE_MS: 画面全体が黒くフェードインする。SKIPボタンは
  //      黒幕の上に完全不透明のまま描き直し、暗転に巻き込まれず残す。
  //   2. その後ENDING_SKIP_FADE_DELAY_MSの間、画面は完全に黒いままSKIPは
  //      まだ不透明のまま（暗転とSKIPが消え始めるまでの間を置く）。
  //   3. その後ENDING_SKIP_FADE_MSかけて、SKIPボタン自体がフェードアウトする。
  //   4. その後ENDING_HOLD_MSの間、SKIPも消えた真っ黒画面のまま静止する。
  // 上記すべてが終わったら再生を終了する。
  let endingFadeAnim = null;

  function beginEndingFade() {
    endingFadeAnim = { startTime: performance.now() };
  }

  // 現在の経過時間から、画面の暗転具合とSKIPボタンの不透明度を算出する。
  // endingFadeAnimが無ければnull。
  function endingFadeProgress() {
    if (!endingFadeAnim) return null;
    const elapsed = performance.now() - endingFadeAnim.startTime;
    const screenAlpha = Math.min(1, elapsed / ENDING_FADE_MS);
    const skipElapsed = elapsed - ENDING_FADE_MS - ENDING_SKIP_FADE_DELAY_MS;
    const skipAlpha = skipElapsed <= 0 ? 1 : Math.max(0, 1 - skipElapsed / ENDING_SKIP_FADE_MS);
    return { elapsed, screenAlpha, skipAlpha };
  }

  // 再生中は毎フレーム呼ぶ。全段階が完了したら再生そのものを終了する。
  function updateEndingFadeAnim() {
    const progress = endingFadeProgress();
    if (!progress) return;
    const totalMs = ENDING_FADE_MS + ENDING_SKIP_FADE_DELAY_MS + ENDING_SKIP_FADE_MS + ENDING_HOLD_MS;
    if (progress.elapsed >= totalMs) {
      endingFadeAnim = null;
      stopScenarioPlayback();
    }
  }

  // 暗転のオーバーレイ（＋その上のSKIPボタン）をcontextへ直接描く
  // （drawScene本体には含めない——通常編集やPNG書き出しには一切関係しない、
  // 再生時だけの演出のため）。
  function drawEndingFadeOverlay(context) {
    const progress = endingFadeProgress();
    if (!progress) return;
    context.save();
    context.globalAlpha = progress.screenAlpha;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, CANVAS_W, CANVAS_H);
    context.restore();

    if (progress.skipAlpha > 0 && state.showButtons && state.showSkip) {
      context.save();
      context.globalAlpha = progress.skipAlpha;
      context.drawImage(assets.skip, 0, 0, CANVAS_W, CANVAS_H);
      context.restore();
    }
  }

  // シナリオ再生開始時の導入演出——終了演出のちょうど逆手順。
  // 「シナリオ開始」の特殊行が有効な場合、goToScenarioLineから呼ばれる。
  //   1. まずENDING_HOLD_MSの間、画面は真っ黒でSKIPも見えない
  //      （終了演出の最後の静止と鏡合わせ）。
  //   2. その後ENDING_SKIP_FADE_MSかけてSKIPボタンがフェードインする。
  //   3. その後ENDING_SKIP_FADE_DELAY_MSの間、真っ黒＋SKIP不透明のまま
  //      （終了演出の「暗転後・SKIPフェード開始前の間」と鏡合わせ）。
  //   4. その後ENDING_FADE_MSかけて暗転が晴れていく。
  //   5. 完全に晴れてからSTARTING_LINE_DELAY_MSだけ間を置いて、1行目
  //      （＝実質的な最初の行、advanceScenarioPlayback経由）を開始する。
  // { startTime }
  let startingFadeAnim = null;

  function beginStartingFade() {
    startingFadeAnim = { startTime: performance.now() };
  }

  function startingFadeProgress() {
    if (!startingFadeAnim) return null;
    const elapsed = performance.now() - startingFadeAnim.startTime;
    const skipElapsed = elapsed - ENDING_HOLD_MS;
    const skipAlpha = skipElapsed <= 0 ? 0 : Math.min(1, skipElapsed / ENDING_SKIP_FADE_MS);
    const clearElapsed = elapsed - ENDING_HOLD_MS - ENDING_SKIP_FADE_MS - ENDING_SKIP_FADE_DELAY_MS;
    const screenAlpha = clearElapsed <= 0 ? 1 : Math.max(0, 1 - clearElapsed / ENDING_FADE_MS);
    return { elapsed, screenAlpha, skipAlpha };
  }

  // 再生中は毎フレーム呼ぶ。導入演出が完全に終わったら、実質的な1行目へ進む。
  function updateStartingFadeAnim() {
    const progress = startingFadeProgress();
    if (!progress) return;
    const totalMs =
      ENDING_HOLD_MS + ENDING_SKIP_FADE_MS + ENDING_SKIP_FADE_DELAY_MS + ENDING_FADE_MS + STARTING_LINE_DELAY_MS;
    if (progress.elapsed >= totalMs) {
      startingFadeAnim = null;
      advanceScenarioPlayback();
    }
  }

  function drawStartingFadeOverlay(context) {
    const progress = startingFadeProgress();
    if (!progress) return;
    context.save();
    context.globalAlpha = progress.screenAlpha;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, CANVAS_W, CANVAS_H);
    context.restore();

    if (progress.skipAlpha > 0 && state.showButtons && state.showSkip) {
      context.save();
      context.globalAlpha = progress.skipAlpha;
      context.drawImage(assets.skip, 0, 0, CANVAS_W, CANVAS_H);
      context.restore();
    }
  }

  // 「場面転換」特殊行の暗転演出——開始/終了の暗転と違い、SKIPボタンの
  // フェード演出は挟まず単純に「暗転→少し静止→復帰」の山型で進む。
  //   1. 0〜SCENE_TRANSITION_FADE_MS: 画面が黒くフェードインする
  //      （この間はまだ前のシーンを表示したまま——切り替えはまだ行わない）
  //   2. 完全に暗転した瞬間、次の行の状態を初めて反映する（真っ黒の裏で
  //      切り替えるため、画面上では一切見えない）
  //   3. そのままSCENE_TRANSITION_HOLD_MSの間、真っ黒のまま静止する
  //   4. その後SCENE_TRANSITION_FADE_MSかけて暗転が晴れていく（既に
  //      次の行の状態になっている画面が現れる）
  // 晴れ切ったら実際に次の行へ進む（advanceScenarioPlayback）。
  // { startTime, nextLine, appliedNextLine }
  const SCENE_TRANSITION_FADE_MS = 1500;
  const SCENE_TRANSITION_HOLD_MS = 600;
  let sceneTransitionAnim = null;

  // nextLineは、暗転が完全に終わった瞬間に反映する行（無ければnull——
  // 例えば次が「シナリオ終了」の特殊行の場合など、goToScenarioLine側で
  // あらかじめ弾いてから渡される）。
  function beginSceneTransitionAnim(nextLine) {
    sceneTransitionAnim = { startTime: performance.now(), nextLine, appliedNextLine: false };
  }

  function sceneTransitionProgress() {
    if (!sceneTransitionAnim) return null;
    const elapsed = performance.now() - sceneTransitionAnim.startTime;
    const clearElapsed = elapsed - SCENE_TRANSITION_FADE_MS - SCENE_TRANSITION_HOLD_MS;
    const screenAlpha =
      clearElapsed <= 0 ? Math.min(1, elapsed / SCENE_TRANSITION_FADE_MS) : Math.max(0, 1 - clearElapsed / SCENE_TRANSITION_FADE_MS);
    return { elapsed, screenAlpha };
  }

  // 再生中は毎フレーム呼ぶ。画面が完全に暗転した瞬間に次の行の状態を
  // 反映し、完全に晴れ切ったら実際に次の行へ進む。
  function updateSceneTransitionAnim() {
    const progress = sceneTransitionProgress();
    if (!progress) return;
    if (!sceneTransitionAnim.appliedNextLine && progress.elapsed >= SCENE_TRANSITION_FADE_MS) {
      sceneTransitionAnim.appliedNextLine = true;
      if (sceneTransitionAnim.nextLine) applyScenarioLine(sceneTransitionAnim.nextLine);
    }
    const totalMs = SCENE_TRANSITION_FADE_MS * 2 + SCENE_TRANSITION_HOLD_MS;
    if (progress.elapsed >= totalMs) {
      sceneTransitionAnim = null;
      advanceScenarioPlayback();
    }
  }

  function drawSceneTransitionOverlay(context) {
    const progress = sceneTransitionProgress();
    if (!progress) return;
    context.save();
    context.globalAlpha = progress.screenAlpha;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, CANVAS_W, CANVAS_H);
    context.restore();
  }

  // シナリオ再生中の退去エフェクトは、静止編集でのスクラブ用の等倍速より
  // テンポよく見えるよう、この倍率で再生する
  const DEPARTURE_PLAYBACK_RATE = 2.3;

  // 退去エフェクト再生行の状態。行に登場する退去ON済みキャラ全員の退去
  // 動画を実際にvideo.play()で再生させ、ブラウザ本来の滑らかな再生
  // パイプラインに任せる——シークを毎フレーム繰り返す方式だと、シーク
  // 自体が非同期でフレームが間に合わずコマ送りのようにガタつくため。
  // departureProgress（キャラ自身のフェード等、他の描画箇所が参照する）は
  // 動画自身のcurrentTime/durationから毎フレーム逆算するだけにする。
  // 全員の動画が最後まで再生し終わったら自動で次の行へ進む（進行方式に
  // 関わらず強制的に進む——開始/終了の暗転行と同じ扱い）。
  // { entries: [{ charId, video }] }
  let departureLineAnim = null;

  function beginDepartureLineAnim(line) {
    const entries = [];
    line.chars.forEach((snap) => {
      if (!snap.departureEnabled) return;
      const c = getCharacter(snap.charId);
      if (!c) return;
      const video = getDepartureVideoEl(c);
      if (video.duration && !Number.isNaN(video.duration)) {
        try {
          video.currentTime = (c.departureProgress / 100) * video.duration;
        } catch (e) {
          // 動画の準備が完全に整う前にシークすると例外を投げるブラウザが
          // あるが、無視して問題ない——再生開始位置が0に近い程度のズレで済む
        }
      }
      // シナリオ再生中（動画/GIF書き出し・プレビュー含む）は、静止編集での
      // スクラブ操作用の等倍速とは別に、テンポよく見えるようDEPARTURE_
      // PLAYBACK_RATE倍速で再生する
      video.playbackRate = DEPARTURE_PLAYBACK_RATE;
      video.play().catch(() => {}); // muted+playsInlineのため通常はブロックされない
      entries.push({ charId: c.id, video });
    });
    if (entries.length === 0) return false;
    departureLineAnim = { entries };
    return true;
  }

  // 再生中は毎フレーム呼ぶ。各キャラの退去動画自身のcurrentTime/duration
  // からdepartureProgressを算出するだけ——再生自体はブラウザに任せている。
  // 全員が最後まで再生し終わったら次の行へ進む。
  function updateDepartureLineAnim() {
    if (!departureLineAnim) return;
    let allDone = true;
    departureLineAnim.entries.forEach((entry) => {
      const c = getCharacter(entry.charId);
      const video = entry.video;
      if (!c) return;
      if (!video.duration || Number.isNaN(video.duration)) {
        allDone = false; // メタデータ待ち——読み込み次第、次のフレームから再開する
        return;
      }
      c.departureProgress = Math.min(100, (video.currentTime / video.duration) * 100);
      if (video.ended || c.departureProgress >= 100) {
        video.pause();
        video.playbackRate = 1; // 静止編集でのスクラブに影響を残さない
      } else {
        allDone = false;
      }
    });
    if (allDone) {
      departureLineAnim = null;
      advanceScenarioPlayback();
    }
  }

  function advanceScenarioPlayback() {
    if (!playback) return;
    if (playback.timerId) {
      clearTimeout(playback.timerId);
      playback.timerId = null;
    }
    const nextIndex = playback.index + 1;
    if (nextIndex >= state.scenario.length) {
      stopScenarioPlayback();
      return;
    }
    goToScenarioLine(nextIndex);
  }

  function goToScenarioLine(index) {
    const line = state.scenario[index];
    playback.index = index;
    playback.currentLine = line;

    // 「シナリオ開始」「シナリオ終了」の特殊行はライブ状態を持たないため、
    // 他の行と違ってapplyScenarioLineを呼ばない——無効化されている場合は
    // 演出を挟まずすぐ次（開始なら実質的な1行目、終了ならそのまま終了）へ。
    if (line.isStartingFade) {
      if (line.enabled) {
        // 暗転が晴れた瞬間に「まだ再生前の状態」が一瞬見えてしまわない
        // よう、実質的な1行目のキャラクター配置（表情/差分/表示状態/
        // 最前面キャラ）だけを先に反映しておく。ウインドウ本文・選択肢・
        // SKIP以外のボタン類はdrawScene側でこの行の間ずっと非表示にして
        // おき、実際に1行目へ移った瞬間（下のelse以外の通常分岐）に
        // あらためてapplyScenarioLineが呼ばれ、そちらの設定に従って表示される。
        const nextLine = state.scenario[index + 1];
        if (nextLine && !nextLine.isEndingFade && !nextLine.isSceneTransition) applyScenarioLine(nextLine);
        beginStartingFade();
      } else {
        advanceScenarioPlayback();
      }
      renderAll();
      return;
    }
    if (line.isEndingFade) {
      // 直前の画面をそのまま残し、その上に暗転をかぶせるだけ
      if (line.enabled) {
        beginEndingFade();
        // 画面の暗転（ENDING_FADE_MS）に合わせて、鳴っていたBGMも一緒に
        // フェードアウトさせる——真っ暗になった後も鳴り続けたり、
        // 停止時にいきなり切れたりしないようにするため
        if (playback.currentBgmTrack) {
          fadeOutBgmAudio(playback.currentBgmTrack.audio, ENDING_FADE_MS);
          playback.currentBgmTrack = null;
        }
      } else {
        stopScenarioPlayback();
      }
      renderAll();
      return;
    }
    if (line.isSceneTransition) {
      // 暗転前のフェード中は前のシーンを表示したままにしたいので、次の
      // 行の状態はここでは反映しない——完全に暗転した瞬間（画面が真っ黒に
      // なった裏側）で初めてbeginSceneTransitionAnim内部から反映される
      // （updateSceneTransitionAnim参照）。ウインドウ・選択肢・SKIP以外の
      // ボタン類はdrawScene側でこの行の間ずっと非表示にしておき、実際に
      // 次の行へ移った瞬間（advanceScenarioPlayback経由）にあらためて
      // applyScenarioLineが呼ばれ、そちらの設定に従って表示される。
      const nextLine = state.scenario[index + 1];
      const preloadableNextLine =
        nextLine && !nextLine.isStartingFade && !nextLine.isEndingFade && !nextLine.isSceneTransition ? nextLine : null;
      beginSceneTransitionAnim(preloadableNextLine);
      pushBlankLogEntry(); // 台詞を挟まない場面転換があったことをログ上でも分かるようにする
      renderAll();
      return;
    }

    applyScenarioLine(line);
    // BGMの切り替えはシナリオ再生中の実際の行送りでのみ行う——導入演出中に
    // 次の行を先読みしてapplyScenarioLineを呼ぶ箇所（isStartingFade分岐）
    // では呼ばないため、暗転が開く前にBGMが鳴り出すことはない
    updateBgmPlaybackForLine(line);
    // AUTOアイコンの既存の発光演出をそのまま流用し、自動進行中であることを示す
    state.autoActive = state.scenarioAdvanceMode === "auto";
    autoActiveToggle.checked = state.autoActive;

    choiceAnim = null; // 前の行の選択肢アニメーションが残らないようにする

    if (lineHasDeparture(line)) {
      // 退去エフェクト再生行——ウインドウ・選択肢・SKIP以外のボタン類は
      // 出さず（drawScene参照）、対象キャラ全員の退去が完了するまでは
      // 進行方式に関わらず自動では進めない。セリフ表示は行わない。
      dialogueAnim = null;
      playback.pendingAutoAdvance = null;
      if (!beginDepartureLineAnim(line)) {
        // 対象キャラが1人も見つからなかった（保存データの不整合等）場合の
        // フォールバック——通常行と同様すぐ次へ進める
        advanceScenarioPlayback();
      }
      pushBlankLogEntry(); // 台詞を挟まない退去演出があったことをログ上でも分かるようにする
      renderAll();
      return;
    }

    if (line.showChoices) {
      // line.showChoicesだけで判定すると、シナリオの最初の行がいきなり
      // 選択肢表示だった場合（まだ凍結すべき前のテキストが無い）に本文が
      // 一切タイプ表示されなくなる。「今まさに何か表示中」なら凍結し
      // （前の台詞テキストはそのまま残す）、無ければこの行自身の本文を
      // タイプ表示する。
      if (!dialogueAnim) {
        startDialogueTyping(line.body, state.fontSize, state.textColor, line.activeCharId);
      }
      // 選択肢はAUTO/手動どちらの進行方式でも自動では進めない——選択肢が
      // クリックされるまで一時停止し、タイマーは一切張らない
      playback.pendingAutoAdvance = null;
      choiceAnim = { phase: "waiting", selectedIdx: null, startTime: null };
    } else {
      // 自動進行の待ちタイマーは、タイプライター表示が完了してから
      // onDialogueFullyRevealedが張る（表示中に秒数を消費させないため）
      playback.pendingAutoAdvance = state.scenarioAdvanceMode === "auto" ? state.scenarioAutoDelaySec : null;
      // LOGボタンの履歴にも記録する（選択肢・退去演出の行はここに来ないので
      // 自然に除外される）。本文が空の行（「新規シーンを追加」の空のシーン
      // 等）は台詞として記録する意味が無いので、代わりに空行を挟む。
      // fontSize/textColorはapplyScenarioLine(line)で既にstateへ反映済みの
      // 値を使う——これにより、この機能追加より前の古い行でも常にその時の
      // 実際の表示値（フォールバック込み）が記録される。
      if (line.body && line.body.trim()) {
        dialogueLog.push({
          type: "dialogue",
          speaker: line.nameplateOn !== false ? line.speaker : null,
          body: line.body,
          fontSize: state.fontSize,
          textColor: state.textColor,
        });
      } else {
        pushBlankLogEntry();
      }
      // 同じキャラクターが続けて喋る場合（間に選択肢行が挟まった場合を
      // 含む——選択肢行ではdialogueAnimに触れないため凍結前の話者のまま
      // 残る）のみ退出スライドを再生する。話者が変わる場合は前の文字列を
      // 即座に消して次のタイプ表示を始める（急な切り替え）。
      const sameSpeaker = dialogueAnim && dialogueAnim.speakerCharId === line.activeCharId;
      if (sameSpeaker) {
        beginDialogueExit(line.body, state.fontSize, state.textColor, line.activeCharId);
      } else {
        startDialogueTyping(line.body, state.fontSize, state.textColor, line.activeCharId);
      }
    }
    renderAll();
  }

  // 自然終了・「録画を中止」ボタンの共通の後始末
  function stopScenarioPlayback() {
    if (!playback) return;
    if (playback.timerId) clearTimeout(playback.timerId);
    if (playback.rafId) cancelAnimationFrame(playback.rafId);
    if (playback.mediaRecorder && playback.mediaRecorder.state !== "inactive") {
      playback.mediaRecorder.stop(); // onstopでBlob化してダウンロードされる
    }
    // 映像トラック（canvas.captureStream由来）だけ止める——音声トラックは
    // bgmAudioDestの使い回しの共有トラックなので、ここで止めてしまうと
    // 以後の録画セッションでずっとBGMが入らなくなる（stream合成部参照）
    if (playback.stream) playback.stream.getVideoTracks().forEach((t) => t.stop());
    // 終了演出（beginEndingFade）を経由した自然終了では、その時点で既に
    // フェードアウト済み・currentBgmTrackもnullになっている。ここに来る時点
    // でまだ何か鳴っている場合は、終了演出を挟まない即時終了（「中止」
    // ボタン、終了演出が無効なシナリオの自然終了）なので、ここでフェード
    // アウトさせる（録画停止と同時に呼ぶため、録画自体には収まらないが、
    // 少なくともブラウザ上でいきなり切れて聞こえることは無くなる）
    if (playback.currentBgmTrack) {
      fadeOutBgmAudio(playback.currentBgmTrack.audio, BGM_TRANSITION_FADE_MS);
      playback.currentBgmTrack = null;
    }
    // 再生中に出したタップエフェクトが残ったまま（通常編集に戻ってから
    // 古い1フレームが描かれ続ける等）にならないよう、後始末する。
    // プール自体（<video>要素）は次回の再生開始時にすぐ使えるよう破棄せず
    // 残しておき、activeフラグだけ倒す。
    tapEffectPool.forEach((slot) => {
      slot.video.pause();
      slot.active = false;
    });
    // 開いたままだったLOG画面も後片付けする
    logOverlayOpen = false;
    // フェードの途中で再生が終わった場合、通常編集に戻った時に中途半端な
    // 不透明度のまま固まって見えないよう、進行中のフェードを打ち切る
    // （c.opacity/c.visibleは既にそれぞれの行の目標値になっているので、
    // アニメの起点だけ消せば次の描画から即座にその値で表示される）
    state.characters.forEach((c) => {
      c._opacityAnimStartTime = null;
    });
    // 背景のクロスフェードも同様に、途中で止まったまま持ち越さないよう打ち切る
    bgTransitionAnim = null;
    if (gifCapture) {
      // GIFの生成・ダウンロードは非同期（数秒かかりうる）——再生セッション
      // 自体の後始末はここで先に終わらせ、完了は待たない
      const capture = gifCapture;
      gifCapture = null;
      encodeAndDownloadGif(capture);
    }
    document.body.classList.remove("is-scenario-playing");
    state.autoActive = playback.prevAutoActive;
    autoActiveToggle.checked = state.autoActive;
    state.selectedId = playback.prevSelectedId;
    state.activeCharId = null;
    scenarioCancelBtn.hidden = true;
    playback = null;
    dialogueAnim = null;
    choiceAnim = null;
    endingFadeAnim = null;
    startingFadeAnim = null;
    // 退去エフェクト再生の途中で終了（SKIP/中止/自然終了）した場合、
    // 動画を再生させたまま放置しない——止め忘れると通常編集に戻った後も
    // バックグラウンドで再生され続けてしまう
    if (departureLineAnim) {
      departureLineAnim.entries.forEach((entry) => {
        entry.video.pause();
        entry.video.playbackRate = 1; // 静止編集でのスクラブに影響を残さない
      });
      departureLineAnim = null;
    }
    renderCharList();
    renderCharEditor();
    renderAll();
  }

  // mode: "record"（動画保存タブの「再生開始（録画）」、WebM形式）、
  // "gif"（同ボタン、GIF形式）、"preview"（保存せずタイミングだけ確認する
  // 「プレビュー再生」）。どれもキャンバス上の再生自体は完全に同じ
  // ロジックを使い回す。
  function startScenarioPlayback(mode) {
    let offscreenCanvas = null;
    let offscreenCtx = null;
    let mimeType = "";
    let stream = null;
    let mediaRecorder = null;
    gifCapture = null;

    // 再生開始ボタンのクリック（ユーザー操作）の延長で呼ばれるここが、
    // ブラウザの自動再生制限に引っかからずAudioContextを再開できる
    // 最後のタイミング——BGM再生（updateBgmPlaybackForLine）はこの後
    // 非同期に始まるため、先に済ませておく
    if (bgmAudioCtx && bgmAudioCtx.state === "suspended") bgmAudioCtx.resume();
    // タップエフェクト用の<video>プールも、実際に最初のタップが起きる前に
    // ここで読み込みを始めておく——開始演出（暗転）が明けるまでの間に
    // デコードの準備が済むので、最初のタップから遅延なく表示できる
    ensureTapEffectPool();
    // LOGの履歴も、再生開始のたびにこのセッション分だけを新しく記録し直す
    dialogueLog = [];
    logOverlayOpen = false;
    logScrollOffset = 0;

    if (mode === "record" || mode === "gif") {
      // 録画・GIFキャプチャ専用のオフスクリーンcanvasにdrawSceneだけを
      // 毎フレーム描画する——drawEditorOverlay（選択枠/ハンドル）は絶対に
      // 呼ばない。PNG書き出しが別canvasを使って同じものを除外しているのと
      // 同じ理由。
      offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = CANVAS_W;
      offscreenCanvas.height = CANVAS_H;
      offscreenCtx = offscreenCanvas.getContext("2d");
    }

    if (mode === "record") {
      mimeType = VIDEO_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      try {
        stream = offscreenCanvas.captureStream(30);
        // BGMの音声トラックを合成する——bgmAudioDestは全セッション共通の
        // 単一のノードで、そのときどきに再生中のBGM（updateBgmPlaybackForLine
        // 参照）の音声がそのまま流れ込んでくる。この音声トラック自体は
        // ここで新規生成したものではなく使い回しなので、stopScenarioPlayback
        // 側では絶対に.stop()しない（呼ぶと以後ずっとBGMが録画に入らなく
        // なる）——video系トラックだけ止めるようにしてある
        ensureBgmAudioRouting();
        if (bgmAudioDest) {
          bgmAudioDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        }
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      } catch (err) {
        alert("録画の開始に失敗しました。");
        console.error(err);
        return;
      }

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const customName = sanitizeFilenameInput(videoNameInput.value);
        a.href = url;
        a.download = (customName || "scenario_" + timestampSuffix()) + ".webm";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      };
    } else if (mode === "gif") {
      const gifCanvas = document.createElement("canvas");
      gifCanvas.width = GIF_CAPTURE_W;
      gifCanvas.height = GIF_CAPTURE_H;
      gifCapture = {
        canvas: gifCanvas,
        ctx: gifCanvas.getContext("2d", { willReadFrequently: true }),
        frames: [],
        lastSampleTime: -Infinity,
      };
    }

    playback = {
      index: -1,
      currentLine: null,
      timerId: null,
      rafId: null,
      mediaRecorder,
      stream,
      offscreenCanvas,
      offscreenCtx,
      mimeType,
      prevAutoActive: state.autoActive,
      prevSelectedId: state.selectedId,
      pendingAutoAdvance: null,
      currentBgmTrack: null,
    };

    state.selectedId = null;
    // 再生中はNEXT以外のキャンバス操作とコンソールの他パネルを無効化する
    // （行のスナップショットは位置/拡縮を保持しないため、再生中に手が滑って
    // ドラッグ/リサイズされると以降の行が誤った位置のまま録画され続ける）
    document.body.classList.add("is-scenario-playing");
    consoleFooterDetails.open = true; // 畳んでいても中止ボタンに必ず手が届くようにする
    scenarioCancelBtn.hidden = false;
    scenarioCancelBtn.textContent = mode === "record" ? "録画を中止" : mode === "gif" ? "GIF書き出しを中止" : "再生を中止";
    renderCharList();
    renderCharEditor();

    dialogueAnim = null; // 念のため、前回の再生分が残っていないことを保証する
    choiceAnim = null;
    endingFadeAnim = null;
    startingFadeAnim = null;
    sceneTransitionAnim = null;
    departureLineAnim = null;
    const tick = () => {
      if (!playback) return;
      updateStartingFadeAnim();
      updateDialogueAnim();
      updateChoiceAnim();
      updateEndingFadeAnim();
      updateSceneTransitionAnim();
      updateDepartureLineAnim();
      // 上記のいずれかがstopScenarioPlayback()を呼んだ場合、playbackは
      // 既にnullになっている——以降の描画やoffscreenCtxへのアクセスをやめる
      if (!playback) return;
      drawScene(ctx);
      drawEditorOverlay(ctx); // state.selectedIdは再生中null固定なので実質no-op
      drawStartingFadeOverlay(ctx);
      drawEndingFadeOverlay(ctx);
      drawSceneTransitionOverlay(ctx);
      drawLogOverlay(ctx); // ライブプレビュー専用——録画/GIF書き出しには焼き込まない
      if (playback.offscreenCtx) {
        drawScene(playback.offscreenCtx);
        drawStartingFadeOverlay(playback.offscreenCtx);
        drawEndingFadeOverlay(playback.offscreenCtx);
        drawSceneTransitionOverlay(playback.offscreenCtx);
      }
      captureGifFrameIfDue();
      playback.rafId = requestAnimationFrame(tick);
    };
    playback.rafId = requestAnimationFrame(tick);

    if (mediaRecorder) mediaRecorder.start();
    // 再生開始位置がデフォルト(0)ならindex 0——「シナリオ開始」の特殊行が
    // 有効な限り必ずそれになる（ensureStartingFadeLine参照）——から始まり、
    // goToScenarioLine側でisStartingFadeを検知して導入演出を始め、実質的な
    // 1行目にはそこから進む。1以上を指定した場合はresolveScenarioStartIndex
    // が該当する実質的な行のインデックスを返し、開始演出等を飛ばして
    // そこから直接始める（調整確認用）。
    goToScenarioLine(resolveScenarioStartIndex());
  }

  // シナリオ全体に共通の進行方式（自動/手動）。設定パネルの進行方式タブ
  // から呼ばれる場合と、再生中に画面上のAUTOボタンをクリックして呼ばれる
  // 場合の両方が必ずこの1つの関数を通ることで、「画面のAUTOボタン」と
  // 「設定パネルの進行方式タブ」が常に連動する。
  function setScenarioAdvanceMode(mode) {
    const changed = state.scenarioAdvanceMode !== mode;
    state.scenarioAdvanceMode = mode;
    scenarioAdvanceModeTabs.querySelectorAll(".footer-tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.mode === mode);
    });
    scenarioDelayField.hidden = mode !== "auto";

    if (!playback) return;
    // 再生中はAUTOアイコンの発光もこの場で同期させる
    state.autoActive = mode === "auto";
    autoActiveToggle.checked = state.autoActive;
    if (!changed) return;

    const line = playback.currentLine;
    // 選択肢表示中・暗転行では進行方式に関わらず常に一時停止のまま
    // （選択されるまで進めない）——モード表示だけ切り替え、タイマー周りは
    // 一切触らない
    if (!line || line.isStartingFade || line.isEndingFade || line.isSceneTransition || line.showChoices) {
      renderAll();
      return;
    }

    if (mode === "manual") {
      // 自動進行の待ちを止め、以降はクリック待ちにする
      if (playback.timerId) {
        clearTimeout(playback.timerId);
        playback.timerId = null;
      }
      playback.pendingAutoAdvance = null;
    } else {
      // 自動進行に切り替え。文字が表示し終わっていれば今この瞬間から
      // 待ち秒数を数え始め、まだ表示中ならタイプ完了時に
      // onDialogueFullyRevealedが自動でタイマーを張ってくれる
      if (!dialogueAnim || dialogueAnim.phase === "holding") {
        playback.timerId = setTimeout(() => advanceScenarioPlayback(), Math.max(0.1, state.scenarioAutoDelaySec) * 1000);
        playback.pendingAutoAdvance = null;
      } else {
        playback.pendingAutoAdvance = state.scenarioAutoDelaySec;
      }
    }
    renderAll();
  }
  scenarioAdvanceModeTabs.querySelectorAll(".footer-tab").forEach((btn) => {
    btn.addEventListener("click", () => setScenarioAdvanceMode(btn.dataset.mode));
  });
  scenarioDelayInput.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    state.scenarioAutoDelaySec = v > 0 ? v : 0.1;
  });
  scenarioStartLineInput.addEventListener("input", (e) => {
    const v = Math.floor(Number(e.target.value));
    state.scenarioStartLineNumber = v > 0 ? v : 0;
  });

  // 再生開始位置の設定から、実際にgoToScenarioLineへ渡すstate.scenario内の
  // インデックスを求める。0（デフォルト）なら常に先頭（開始特殊行があれば
  // それ、無ければ実質的な1行目）から——挙動を一切変えない。N(>=1)なら
  // 開始演出やそれより前の行を飛ばして、実質的なN行目から直接始める
  // （調整確認用。Nがシナリオの行数を超える場合は最後の行に丸める）。
  function resolveScenarioStartIndex() {
    const n = state.scenarioStartLineNumber;
    if (!n || n <= 0) return 0;
    const realLines = getRealScenarioLines();
    if (realLines.length === 0) return 0;
    const target = realLines[Math.min(n, realLines.length) - 1];
    const idx = state.scenario.indexOf(target);
    return idx === -1 ? 0 : idx;
  }

  // 「再生開始」ボタンは保存形式をあらかじめ選ばせるのではなく、押した
  // その場でWebM/GIFを選ぶポップアップメニューを出す方式にしている
  // （常設のタブだと保存欄が縦に伸びるため）。
  function hideVideoFormatMenu() {
    videoFormatMenu.classList.remove("is-open");
  }
  function startScenarioSave(format) {
    if (playback) return; // 二重起動防止
    if (state.scenario.length === 0) {
      alert("シナリオに行が1つもありません。");
      return;
    }
    if (format === "gif") {
      if (gifEncoding) {
        alert("GIFを生成中です。完了までお待ちください。");
        return;
      }
      startScenarioPlayback("gif");
      return;
    }
    if (!("MediaRecorder" in window) || typeof canvas.captureStream !== "function") {
      alert("お使いのブラウザは動画の録画（MediaRecorder）に対応していません。");
      return;
    }
    startScenarioPlayback("record");
  }

  scenarioPlayBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // documentのクリックリスナーで即座に閉じないようにする
    if (playback) return; // 二重起動防止
    videoFormatMenu.classList.toggle("is-open");
  });
  videoFormatMenu.querySelectorAll(".video-format-menu__item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideVideoFormatMenu();
      startScenarioSave(btn.dataset.format);
    });
  });
  // メニュー外をクリックしたら閉じる
  document.addEventListener("click", () => hideVideoFormatMenu());

  scenarioPreviewBtn.addEventListener("click", () => {
    if (playback) return; // 二重起動防止
    if (state.scenario.length === 0) {
      alert("シナリオに行が1つもありません。");
      return;
    }
    startScenarioPlayback("preview");
  });

  scenarioCancelBtn.addEventListener("click", () => {
    stopScenarioPlayback();
  });

  // ---------------- boot ----------------
  async function boot() {
    stageHint.textContent = "素材を読み込み中…";
    exportBtn.disabled = true;
    try {
      await Promise.all([loadAllAssets(), loadFont()]);
    } catch (err) {
      console.error(err);
      stageHint.textContent =
        "UI画像の読み込みに失敗しました。assets フォルダの構成をご確認ください。";
      return;
    }
    exportBtn.disabled = false;
    stageHint.textContent = STAGE_HINT_DEFAULT_TEXT;
    speakerInput.disabled = state.speakerLinkToChar;
    renderBgList();
    renderBgEditor();
    renderCharList();
    renderCharEditor();
    renderScenarioList();
    renderScenarioEditor();
    renderBgmList();
    renderAll();
    commitUndoCheckpoint(); // 起動直後の状態を最初のチェックポイントとして記録しておく（これが無いと1手戻した時に空になる）
  }

  window.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    const isUndo = key === "z" && !e.shiftKey;
    const isRedo = key === "y" || (key === "z" && e.shiftKey);
    if (!isUndo && !isRedo) return;

    const target = document.activeElement;
    const isTextEditing =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);
    if (isTextEditing) return; // テキスト入力中はブラウザ標準のundo/redoに任せる

    e.preventDefault();
    if (isUndo) performUndo();
    else performRedo();
  });

  boot();
})();
