#!/usr/bin/env python3
"""
Regenerate assets-data.js and font-data.js by embedding the files in
assets/ and fonts/ as base64 data URIs.

Run this again whenever you replace a file in assets/ or fonts/ so the
app keeps working with a single double-click (file://) — without it,
the app would need to load those files over the network, which some
browsers block for local files.

Usage:
    python3 build_assets.py
"""
import base64
import json
import mimetypes
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(ROOT, "assets")
FONTS_DIR = os.path.join(ROOT, "fonts")

IMAGE_FILES = {
    "textbox": "textbox.png",
    "nameBox": "name_box.png",
    "linesBox": "lines_box.png",
    "skip": "skip_button.png",
    "log": "log_button.png",
    "auto": "auto_button.png",
    "next": "next.png",
    "scroll": "scroll.png",
    "svBackground": "sv_background.png",
    "svSideButton": "sv_sidebutton.png",
    "svSideButtonActive": "sv_sidebutton_active.png",
    "svClose": "sv_close.png",
    "svSideIcon1": "sv_side_icon1.png",
    "svSideIcon2": "sv_side_icon2.png",
    "svSideIcon3": "sv_side_icon3.png",
    "svSideIcon4": "sv_side_icon4.png",
    "svSideIcon1Active": "sv_side_icon1_active.png",
    "svSaintGraphFrameGold": "sv_saint_graph_gold.png",
    "svSaintGraphFrameSilver": "sv_saint_graph_silver.png",
    "svSaintGraphFrameBronze": "sv_saint_graph_bronze.png",
    "svSaintGraphFrameBlack": "sv_saint_graph_black.png",
    "svAtkHp": "sv_atk_hp.png",
    # レアリティ（星の数）——フレームと同じ885×1512の座標系に、星0〜5個
    # ぶんの行がそれぞれ描かれた画像（0個＝非表示は画像無しで対応）。
    "svRarityStar1": "stars/star_1.png",
    "svRarityStar2": "stars/star_2.png",
    "svRarityStar3": "stars/star_3.png",
    "svRarityStar4": "stars/star_4.png",
    "svRarityStar5": "stars/star_5.png",
    "svWindow": "sv_window.png",
    "svWindowName": "sv_window_name.png",
    "svButton": "sv_button.png",
    "svButtonActive": "sv_button_active.png",
    "svButtonHex": "sv_button_hex.png",
    "svButtonHexActive": "sv_button_hex_active.png",
    "svHeader": "sv_header.png",
    "svAscension": "sv_ascension.png",
    "svAscensionBlank": "sv_ascension_blank.png",
    # 霊基再臨4段階切り替えの左右矢印——デフォルトは右向き。
    "svArrow": "sv_arrow.png",
    "svBondBlank": "sv_bond_blank.png",
    "svBondTen": "sv_bond_ten.png",
    "svNobleIcon": "sv_noble_icon.png",
    "svNobleIconActive": "sv_noble_icon_active.png",
    "svSkillIcon": "sv_skill_icon.png",
    "svSkillIconActive": "sv_skill_icon_active.png",
    "svSkillFrame": "sv_skill_frame.png",
    "svSkillFrameNone": "sv_skill_frame_none.png",
    # スキル・宝具の「強化」表示——名称の横に付く記号(title)と、説明文の
    # 該当箇所に付く記号(text)。
    "svUpgradeTitle": "sv_upgrade_title.png",
    "svUpgradeText": "sv_upgrade_text.png",
    # パラメーターウインドウのランクゲージ——base(土台)+ E/D/C/B/A(各段階の
    # 塗り部分、累積して並べる想定)+ EX(規格外、ほぼ全体を塗る)。
    "svParameterBase": "parameters/sv_parameter_base.png",
    "svParameterE": "parameters/sv_parameter_e.png",
    "svParameterD": "parameters/sv_parameter_d.png",
    "svParameterC": "parameters/sv_parameter_c.png",
    "svParameterB": "parameters/sv_parameter_b.png",
    "svParameterA": "parameters/sv_parameter_a.png",
    "svParameterEx": "parameters/sv_parameter_ex.png",
    "svAppendSkillIcon1": "skill_icons/skill_001.png",
    "svAppendSkillIcon2": "skill_icons/skill_002.png",
    "svAppendSkillIcon3": "skill_icons/skill_003.png",
    "svAppendSkillIcon4": "skill_icons/skill_004.png",
    "svAppendSkillIcon5": "skill_icons/skill_005.png",
    # スキルアイコンの選択候補一覧（横スクロールピッカー）用——001〜005は
    # 上のsvAppendSkillIconNと同じファイルを指すため二重に埋め込まない。
    # 保有スキル/アペンドスキル用（class無し）。
    "skillIconPreset6": "skill_icons/skill_006.png",
    "skillIconPreset7": "skill_icons/skill_007.png",
    "skillIconPreset7a": "skill_icons/skill_007a.png",
    "skillIconPreset8": "skill_icons/skill_008.png",
    "skillIconPreset8a": "skill_icons/skill_008a.png",
    "skillIconPreset9": "skill_icons/skill_009.png",
    "skillIconPreset9a": "skill_icons/skill_009a.png",
    "skillIconPreset10": "skill_icons/skill_010.png",
    "skillIconPreset11": "skill_icons/skill_011.png",
    "skillIconPreset12": "skill_icons/skill_012.png",
    "skillIconPreset13": "skill_icons/skill_013.png",
    "skillIconPreset13a": "skill_icons/skill_013a.png",
    "skillIconPreset14": "skill_icons/skill_014.png",
    "skillIconPreset14a": "skill_icons/skill_014a.png",
    "skillIconPreset15": "skill_icons/skill_015.png",
    "skillIconPreset16": "skill_icons/skill_016.png",
    "skillIconPreset16a": "skill_icons/skill_016a.png",
    "skillIconPreset17": "skill_icons/skill_017.png",
    "skillIconPreset17a": "skill_icons/skill_017a.png",
    "skillIconPreset17b": "skill_icons/skill_017b.png",
    "skillIconPreset18": "skill_icons/skill_018.png",
    "skillIconPreset19": "skill_icons/skill_019.png",
    "skillIconPreset20": "skill_icons/skill_020.png",
    "skillIconPreset21": "skill_icons/skill_021.png",
    "skillIconPreset22": "skill_icons/skill_022.png",
    "skillIconPreset23": "skill_icons/skill_023.png",
    "skillIconPreset23a": "skill_icons/skill_023a.png",
    "skillIconPreset24": "skill_icons/skill_024.png",
    "skillIconPreset24a": "skill_icons/skill_024a.png",
    "skillIconPreset25": "skill_icons/skill_025.png",
    "skillIconPreset26": "skill_icons/skill_026.png",
    "skillIconPreset27": "skill_icons/skill_027.png",
    "skillIconPreset28": "skill_icons/skill_028.png",
    "skillIconPreset29": "skill_icons/skill_029.png",
    "skillIconPreset30": "skill_icons/skill_030.png",
    "skillIconPreset31": "skill_icons/skill_031.png",
    "skillIconPreset32": "skill_icons/skill_032.png",
    # クラススキル用（skill_class_番号）。
    "skillClassIconPreset1": "skill_icons/skill_class_001.png",
    "skillClassIconPreset2": "skill_icons/skill_class_002.png",
    "skillClassIconPreset3": "skill_icons/skill_class_003.png",
    "skillClassIconPreset4": "skill_icons/skill_class_004.png",
    "skillClassIconPreset5": "skill_icons/skill_class_005.png",
    "skillClassIconPreset6": "skill_icons/skill_class_006.png",
    "skillClassIconPreset7": "skill_icons/skill_class_007.png",
    "skillClassIconPreset8": "skill_icons/skill_class_008.png",
    "skillClassIconPreset9": "skill_icons/skill_class_009.png",
    "skillClassIconPreset10": "skill_icons/skill_class_010.png",
    "skillClassIconPreset11": "skill_icons/skill_class_011.png",
    "skillClassIconPreset12": "skill_icons/skill_class_012.png",
    "skillClassIconPreset13": "skill_icons/skill_class_013.png",
    "skillOverPreset1": "skill_icons/skill_over/skill_over_001.png",
    "skillOverPreset2": "skill_icons/skill_over/skill_over_002.png",
    "skillOverPreset3": "skill_icons/skill_over/skill_over_003.png",
    "skillOverPreset4": "skill_icons/skill_over/skill_over_004.png",
    "skillOverPreset5": "skill_icons/skill_over/skill_over_005.png",
    "skillOverPreset6": "skill_icons/skill_over/skill_over_006.png",
    "skillOverPreset7": "skill_icons/skill_over/skill_over_007.png",
    "skillOverPreset8": "skill_icons/skill_over/skill_over_008.png",
    "skillOverPreset9": "skill_icons/skill_over/skill_over_009.png",
    "skillOverPreset10": "skill_icons/skill_over/skill_over_010.png",
    "skillOverPreset11": "skill_icons/skill_over/skill_over_011.png",
    "skillOverPreset12": "skill_icons/skill_over/skill_over_012.png",
    "skillOverPreset13": "skill_icons/skill_over/skill_over_013.png",
    "classIcon1": "class_icons/01_saber.png",
    "classIcon2": "class_icons/02_archer.png",
    "classIcon3": "class_icons/03_lancer.png",
    "classIcon4": "class_icons/04_rider.png",
    "classIcon5": "class_icons/05_caster.png",
    "classIcon6": "class_icons/06_assassin.png",
    "classIcon7": "class_icons/07_berserker.png",
    "classIcon8": "class_icons/08_ruler.png",
    "classIcon9": "class_icons/09_avenger.png",
    "classIcon10": "class_icons/10_mooncancer.png",
    "classIcon11": "class_icons/11_alterego.png",
    "classIcon12": "class_icons/12_foreigner.png",
    "classIcon13": "class_icons/13_pretender.png",
    "classIcon14": "class_icons/14_shielder.png",
    "classIcon15": "class_icons/15_beast.png",
    "classIcon16": "class_icons/16_unbeast.png",
    "svBondFilled1": "bond_icons/bond_01.png",
    # 宝具アイコン——共通の土台(noble_base)の上に、宝具タイプ(バスター/
    # アーツ/クイック)ごとの枠(noble_frame_*)を重ねたものが背景。
    # マーク(noble_icon_*)はキャラ画像のさらに上に重ねる。
    "npBase": "noble_images/noble_base.png",
    "npFrameBuster": "noble_images/noble_frame_B.png",
    "npFrameArts": "noble_images/noble_frame_A.png",
    "npFrameQuick": "noble_images/noble_frame_Q.png",
    "npMarkBuster": "noble_images/noble_icon_B.png",
    "npMarkArts": "noble_images/noble_icon_A.png",
    "npMarkQuick": "noble_images/noble_icon_Q.png",
    # NPゲージ欄——Max%に応じて、左から何本目までを埋まった色(100/200/300)
    # にするかが変わる（左から順に100→200→300の色を割り当てる）。
    "npGaugeBarBlank": "noble_images/noble_bar_blank.png",
    "npGaugeBar100": "noble_images/noble_bar_100.png",
    "npGaugeBar200": "noble_images/noble_bar_200.png",
    "npGaugeBar300": "noble_images/noble_bar_300.png",
    # コマンドカード欄——5枚それぞれをバスター/アーツ/クイックから選べる。
    # _icon=背面（土台）、_over=前面（種別ロゴ、アップロード画像の上に重ねる）。
    "cardIconBuster": "noble_images/card_icon_B.png",
    "cardIconArts": "noble_images/card_icon_A.png",
    "cardIconQuick": "noble_images/card_icon_Q.png",
    "cardOverBuster": "noble_images/card_over_B.png",
    "cardOverArts": "noble_images/card_over_A.png",
    "cardOverQuick": "noble_images/card_over_Q.png",
}

# 絆レベル1〜10で色違いの画像を用意する予定（bond_02.png〜bond_10.png）。
# まだ全部揃っていないので、無い分はビルド時にスキップする
# （script.js側はsvBondFilledNが無ければsvBondFilled1にフォールバックする）。
OPTIONAL_IMAGE_FILES = {
    "svBondFilled2": "bond_icons/bond_02.png",
    "svBondFilled3": "bond_icons/bond_03.png",
    "svBondFilled4": "bond_icons/bond_04.png",
    "svBondFilled5": "bond_icons/bond_05.png",
    "svBondFilled6": "bond_icons/bond_06.png",
    "svBondFilled7": "bond_icons/bond_07.png",
    "svBondFilled8": "bond_icons/bond_08.png",
    "svBondFilled9": "bond_icons/bond_09.png",
    "svBondFilled10": "bond_icons/bond_10.png",
}

VIDEO_FILES = {
    "departureVideo": "departure.mp4",
    "tapVideo": "tap.mp4",
}

FONT_FILES = {
    "GenEiLateMin": "GenEiLateMinN_v2.woff2",
    # 宝具名（漢字）専用の見出し向けフォント——Zen Antique（Google Fonts、
    # SIL OFLで無料・再配布可）。誰の環境でも同じ見た目になるよう埋め込む。
    "ZenAntique": "ZenAntique-Regular.ttf",
    # セイントグラフのクラス名（英語表記）専用——Dai Banna SIL（Google
    # Fonts、SIL OFLで無料・再配布可）。
    "DaiBannaSIL": "DaiBannaSIL-Regular.ttf",
    # セイントグラフのATK/HP数値専用——Noto Serif（Google Fonts、
    # OFLで無料・再配布可）。
    "NotoSerif": "NotoSerif-Regular.ttf",
}

FONT_MIME_BY_EXT = {
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
}


def to_data_uri(path, mime):
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return "data:%s;base64,%s" % (mime, b64)


def main():
    image_data = {}
    for key, filename in IMAGE_FILES.items():
        path = os.path.join(ASSETS_DIR, filename)
        image_data[key] = to_data_uri(path, "image/png")

    for key, filename in OPTIONAL_IMAGE_FILES.items():
        path = os.path.join(ASSETS_DIR, filename)
        if os.path.exists(path):
            image_data[key] = to_data_uri(path, "image/png")
        else:
            print("NOTE: optional image not found at", path, "- skipped", key)

    for key, filename in VIDEO_FILES.items():
        path = os.path.join(ASSETS_DIR, filename)
        if os.path.exists(path):
            image_data[key] = to_data_uri(path, "video/mp4")
        else:
            print("NOTE: video file not found at", path, "- skipped", key)

    out_assets = os.path.join(ROOT, "assets-data.js")
    with open(out_assets, "w", encoding="utf-8") as f:
        f.write("// AUTO-GENERATED by build_assets.py — do not edit by hand.\n")
        f.write("window.__ASSET_DATA__ = ")
        f.write(json.dumps(image_data, ensure_ascii=False))
        f.write(";\n")
    print("wrote", out_assets)

    font_data = {}
    for family, filename in FONT_FILES.items():
        font_path = os.path.join(FONTS_DIR, filename)
        if os.path.exists(font_path):
            ext = os.path.splitext(filename)[1].lower()
            mime = FONT_MIME_BY_EXT.get(ext, "font/ttf")
            font_data[family] = to_data_uri(font_path, mime)
        else:
            print("NOTE: font file not found at", font_path, "- skipped", family)

    out_font = os.path.join(ROOT, "font-data.js")
    with open(out_font, "w", encoding="utf-8") as f:
        f.write("// AUTO-GENERATED by build_assets.py — do not edit by hand.\n")
        f.write("window.__FONT_DATA__ = ")
        f.write(json.dumps(font_data, ensure_ascii=False))
        f.write(";\n")
    print("wrote", out_font)


if __name__ == "__main__":
    main()
