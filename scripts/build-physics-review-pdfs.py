from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import fitz


TOPIC_ORDER = [
    "力学",
    "热学与气体动理论",
    "振动与波",
    "静电场与电路",
    "磁场与电磁感应",
    "光学",
    "近代物理",
    "待人工复核",
]
TOPIC_SLUG = {
    "力学": "01-力学",
    "热学与气体动理论": "02-热学与气体动理论",
    "振动与波": "03-振动与波",
    "静电场与电路": "04-静电场与电路",
    "磁场与电磁感应": "05-磁场与电磁感应",
    "光学": "06-光学",
    "近代物理": "07-近代物理",
    "待人工复核": "08-待人工复核",
}
KEY_POINT = {
    "力学": "质点运动、牛顿定律、功与能、动量、刚体转动等题目截图。",
    "热学与气体动理论": "理想气体、分子运动、热力学过程和循环等题目截图。",
    "振动与波": "简谐振动、机械波、驻波及相关波动问题截图。",
    "静电场与电路": "电荷、电场、电势、电容与稳恒电流等题目截图。",
    "磁场与电磁感应": "磁场、带电粒子运动、磁通和感应电动势等题目截图。",
    "光学": "干涉、衍射、偏振、光栅和成像相关题目截图。",
    "近代物理": "相对论、量子、光电效应与原子物理相关题目截图。",
    "待人工复核": "OCR 关键词不足，保留原图以便查看和后续补分类。",
}


def add_text(page: fitz.Page, point: tuple[float, float], text: str, font_file: str, size: float, color=(0, 0, 0)):
    page.insert_text(point, text, fontsize=size, fontfile=font_file, fontname="yahei", color=color)


def cover_page(doc: fitz.Document, topic: str, count: int, font_file: str):
    page = doc.new_page(width=fitz.paper_rect("a4").width, height=fitz.paper_rect("a4").height)
    add_text(page, (58, 95), "大学物理期末复习题库汇编", font_file, 24, (0.08, 0.20, 0.39))
    add_text(page, (58, 143), topic, font_file, 22)
    add_text(page, (58, 205), f"收录截图：{count} 张", font_file, 12, (0.35, 0.35, 0.35))
    rect = fitz.Rect(58, 245, 537, 335)
    page.draw_rect(rect, color=(0.82, 0.86, 0.92), fill=(0.96, 0.97, 0.99), width=1)
    page.insert_textbox(
        fitz.Rect(75, 265, 520, 319),
        KEY_POINT[topic],
        fontsize=11,
        fontfile=font_file,
        fontname="yahei",
        color=(0.15, 0.15, 0.15),
        lineheight=1.5,
    )
    note = "说明：本册由原始题库截图按 OCR 关键词整理；题目与页面截图均保留原貌，答案及题干准确性请以原平台或任课教师要求为准。"
    page.insert_textbox(
        fitz.Rect(58, 390, 537, 455),
        note,
        fontsize=10.5,
        fontfile=font_file,
        fontname="yahei",
        color=(0.28, 0.28, 0.28),
        lineheight=1.5,
    )


def image_page(doc: fitz.Document, entry: dict, topic: str, position: int, total: int, font_file: str):
    page_rect = fitz.paper_rect("a4")
    page = doc.new_page(width=page_rect.width, height=page_rect.height)
    add_text(page, (42, 31), f"大学物理期末复习 | {topic}", font_file, 9, (0.36, 0.36, 0.36))
    add_text(page, (485, 31), f"{position} / {total}", font_file, 9, (0.36, 0.36, 0.36))
    image_path = entry["path"]
    pix = fitz.Pixmap(image_path)
    available = fitz.Rect(38, 48, page_rect.width - 38, page_rect.height - 50)
    ratio = min(available.width / pix.width, available.height / pix.height)
    width = pix.width * ratio
    height = pix.height * ratio
    target = fitz.Rect(
        available.x0 + (available.width - width) / 2,
        available.y0,
        available.x0 + (available.width + width) / 2,
        available.y0 + height,
    )
    page.insert_image(target, pixmap=pix)
    add_text(page, (42, page_rect.height - 27), f"源图：{entry['file']}", font_file, 7.5, (0.45, 0.45, 0.45))


def build(index_path: Path, output_dir: Path, font_file: str):
    data = json.loads(index_path.read_text(encoding="utf-8-sig"))
    grouped: dict[str, list[dict]] = defaultdict(list)
    for entry in data["entries"]:
        grouped[entry["topic"]].append(entry)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for topic in TOPIC_ORDER:
        entries = grouped.get(topic, [])
        if not entries:
            continue
        doc = fitz.open()
        cover_page(doc, topic, len(entries), font_file)
        for idx, entry in enumerate(entries, start=1):
            image_page(doc, entry, topic, idx, len(entries), font_file)
        output_path = output_dir / f"大学物理期末复习题库汇编-{TOPIC_SLUG[topic]}.pdf"
        doc.save(output_path, garbage=4, deflate=True)
        doc.close()
        manifest.append({"topic": topic, "images": len(entries), "pdf": str(output_path)})
        print(f"{topic}: {len(entries)} images -> {output_path.name}")
    (output_dir / "physics-pdf-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("index", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--font", default=r"C:\Windows\Fonts\msyh.ttc")
    args = parser.parse_args()
    build(args.index, args.output_dir, args.font)


if __name__ == "__main__":
    main()
