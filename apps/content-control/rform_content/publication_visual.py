"""Deterministic mobile-first R/Form publication visuals."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import re
from typing import Callable

import pandas as pd
from PIL import Image, ImageDraw, ImageFont

from .daily_publications import PublicationProposal


WIDTH = 1080
HEIGHT = 1350
VARIANT_COUNT = 3

CARBON = "#0B1016"
SURFACE = "#111B24"
SURFACE_ALT = "#16232E"
CLEAR_WHITE = "#F2F5F7"
STEEL = "#7FA8BC"
STEEL_DARK = "#29404E"
BRASS = "#A88958"
GREEN = "#6F9B84"


@dataclass(frozen=True)
class PublicationVisual:
    data: bytes
    filename: str
    mime_type: str
    variant: int
    label: str


def _text(row: pd.Series, field: str, fallback: str = "") -> str:
    value = row.get(field, "")
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return fallback
    result = str(value).strip()
    return result or fallback


def _first_statement(value: str) -> str:
    return str(value).split(";", 1)[0].strip().rstrip(".")


def _find(pattern: str, value: str, fallback: str = "—") -> str:
    match = re.search(pattern, str(value), flags=re.IGNORECASE)
    return match.group(1).strip() if match else fallback


def _font(size: int, *, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    names = (
        ["DejaVuSansMono-Bold.ttf", "DejaVuSansMono.ttf"]
        if mono and bold
        else ["DejaVuSansMono.ttf"]
        if mono
        else ["DejaVuSans-Bold.ttf", "NimbusSans-Bold.otf"]
        if bold
        else ["DejaVuSans.ttf", "NimbusSans-Regular.otf"]
    )
    roots = (
        Path(__file__).resolve().parents[1] / "assets" / "fonts",
        Path("/usr/share/fonts/truetype/dejavu"),
        Path("/usr/share/fonts/opentype/urw-base35"),
    )
    for name in names:
        for root in roots:
            candidate = root / name
            if candidate.exists():
                return ImageFont.truetype(str(candidate), size=size)
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def _wrap(draw: ImageDraw.ImageDraw, value: str, font: ImageFont.ImageFont, width: int) -> list[str]:
    words = str(value).split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if draw.textlength(candidate, font=font) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    font: ImageFont.ImageFont,
    fill: str,
    width: int,
    *,
    spacing: int = 12,
    max_lines: int | None = None,
) -> int:
    lines = _wrap(draw, value, font, width)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        while lines[-1] and draw.textlength(lines[-1] + "…", font=font) > width:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "…"
    line_height = int(font.size * 1.22)
    x, y = xy
    for index, line in enumerate(lines):
        draw.text((x, y + index * (line_height + spacing)), line, font=font, fill=fill)
    return y + len(lines) * line_height + max(len(lines) - 1, 0) * spacing


def _rounded_card(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], *, accent: str | None = None) -> None:
    draw.rounded_rectangle(box, radius=24, fill=SURFACE, outline=STEEL_DARK, width=2)
    if accent:
        x1, y1, _, y2 = box
        draw.rounded_rectangle((x1, y1, x1 + 10, y2), radius=5, fill=accent)


def _header(draw: ImageDraw.ImageDraw, session: pd.Series, eyebrow: str) -> None:
    draw.text((72, 62), "R/FORM  ·  КОНТЕНТ-ОПЕРАЦИИ", font=_font(22, mono=True), fill=STEEL)
    draw.text((72, 108), eyebrow, font=_font(22, mono=True, bold=True), fill=BRASS)
    draw.text(
        (72, 160),
        f"ТРЕНИРОВКА {_text(session, 'Session_Type', '—')}",
        font=_font(64, bold=True),
        fill=CLEAR_WHITE,
    )
    draw.text((74, 242), _text(session, "Date", "—"), font=_font(27, mono=True), fill=STEEL)
    draw.line((72, 298, 1008, 298), fill=STEEL_DARK, width=2)


def _footer(draw: ImageDraw.ImageDraw) -> None:
    draw.line((72, 1260, 1008, 1260), fill=STEEL_DARK, width=2)
    draw.text((72, 1287), "R/Form  ·  ПЛАН → ФАКТ → РЕШЕНИЕ", font=_font(22, mono=True), fill=STEEL)


def _metrics(session: pd.Series) -> dict[str, str]:
    result = _text(session, "Main_Result")
    conclusion = _text(session, "Session_Conclusion")
    fact = _first_statement(result)
    return {
        "plan": _first_statement(_text(session, "Session_Goal", "План не указан")),
        "fact": fact or "Факт не указан",
        "rir": _find(r"\bRIR\s*([0-9/]+)", fact),
        "technique": _find(r"техник[а-я ]*\s*(\d{1,2}/10)", conclusion, _text(session, "Technique_Status", "—")),
        "pain": _find(r"боль после\s*(\d{1,2}/10)", conclusion, _text(session, "Pain_After", "—")),
        "sets": _find(r"сохранено подходов\s*(\d+\s+из\s+\d+)", conclusion),
        "duration": _find(r"продолжительность\s*(\d+\s*мин)", conclusion, f"{_text(session, 'Actual_Duration', '—')} мин"),
        "status": {
            "ABOVE_PLAN": "ВЫШЕ ПЛАНА",
            "ON_PLAN": "ПО ПЛАНУ",
            "BELOW_PLAN": "НИЖЕ ПЛАНА",
        }.get(_text(session, "Plan_Status").upper(), "РЕЗУЛЬТАТ ЗАФИКСИРОВАН"),
    }


def _variant_plan_fact(draw: ImageDraw.ImageDraw, session: pd.Series, proposal: PublicationProposal) -> None:
    metrics = _metrics(session)
    _header(draw, session, "ВАРИАНТ 01  /  ПЛАН И ФАКТ")
    _rounded_card(draw, (72, 340, 1008, 560), accent=STEEL)
    draw.text((102, 372), "ПЛАН", font=_font(21, mono=True, bold=True), fill=STEEL)
    _draw_wrapped(draw, (102, 416), metrics["plan"], _font(34, bold=True), CLEAR_WHITE, 850, max_lines=3)

    _rounded_card(draw, (72, 586, 1008, 825), accent=BRASS)
    draw.text((102, 618), "ФАКТ", font=_font(21, mono=True, bold=True), fill=BRASS)
    _draw_wrapped(draw, (102, 662), metrics["fact"], _font(48, bold=True), CLEAR_WHITE, 850, max_lines=3)

    labels = (("RIR", metrics["rir"]), ("ТЕХНИКА", metrics["technique"]), ("БОЛЬ", metrics["pain"]))
    for index, (label, value) in enumerate(labels):
        x1 = 72 + index * 316
        _rounded_card(draw, (x1, 852, x1 + 292, 1018))
        draw.text((x1 + 24, 882), label, font=_font(18, mono=True, bold=True), fill=STEEL)
        draw.text((x1 + 24, 928), value, font=_font(38, mono=True, bold=True), fill=CLEAR_WHITE)

    _rounded_card(draw, (72, 1045, 1008, 1225), accent=BRASS)
    draw.text((102, 1075), "РЕШЕНИЕ", font=_font(20, mono=True, bold=True), fill=BRASS)
    _draw_wrapped(draw, (102, 1117), proposal.angle, _font(29, bold=True), CLEAR_WHITE, 850, max_lines=3)


def _variant_signal(draw: ImageDraw.ImageDraw, session: pd.Series, proposal: PublicationProposal) -> None:
    metrics = _metrics(session)
    _header(draw, session, "ВАРИАНТ 02  /  КОНТРОЛЬНЫЙ СИГНАЛ")
    draw.text((72, 348), metrics["status"], font=_font(24, mono=True, bold=True), fill=GREEN)
    _draw_wrapped(draw, (72, 402), metrics["fact"], _font(62, bold=True), CLEAR_WHITE, 920, max_lines=4)
    draw.line((72, 690, 1008, 690), fill=BRASS, width=4)

    labels = (
        ("ЗАПАС", f"RIR {metrics['rir']}"),
        ("ОБЪЁМ", metrics["sets"]),
        ("ВРЕМЯ", metrics["duration"]),
    )
    for index, (label, value) in enumerate(labels):
        x1 = 72 + index * 316
        _rounded_card(draw, (x1, 738, x1 + 292, 925), accent=STEEL if index == 0 else None)
        draw.text((x1 + 24, 772), label, font=_font(18, mono=True, bold=True), fill=STEEL)
        _draw_wrapped(draw, (x1 + 24, 820), value, _font(35, mono=True, bold=True), CLEAR_WHITE, 240, max_lines=2)

    _rounded_card(draw, (72, 970, 1008, 1225), accent=BRASS)
    draw.text((102, 1005), "ЧТО ЭТО МЕНЯЕТ", font=_font(20, mono=True, bold=True), fill=BRASS)
    _draw_wrapped(draw, (102, 1055), proposal.angle, _font(32, bold=True), CLEAR_WHITE, 850, max_lines=4)


def _variant_five_lines(draw: ImageDraw.ImageDraw, session: pd.Series, proposal: PublicationProposal) -> None:
    metrics = _metrics(session)
    _header(draw, session, "ВАРИАНТ 03  /  ПЯТЬ СТРОК")
    draw.text((72, 346), "МИНИМУМ ДАННЫХ. ДОСТАТОЧНО ДЛЯ РЕШЕНИЯ.", font=_font(24, bold=True), fill=CLEAR_WHITE)

    items = (
        ("01", "ПЛАН", metrics["plan"]),
        ("02", "ФАКТ", metrics["fact"]),
        ("03", "ЗАПАС", f"RIR {metrics['rir']}"),
        ("04", "ТЕХНИКА", metrics["technique"]),
        ("05", "БОЛЬ ПОСЛЕ", metrics["pain"]),
    )
    y = 405
    for number, label, value in items:
        height = 145 if label in {"ПЛАН", "ФАКТ"} else 112
        _rounded_card(draw, (72, y, 1008, y + height), accent=BRASS if label == "ФАКТ" else None)
        draw.text((100, y + 24), number, font=_font(20, mono=True, bold=True), fill=BRASS if label == "ФАКТ" else STEEL)
        draw.text((158, y + 24), label, font=_font(19, mono=True, bold=True), fill=STEEL)
        _draw_wrapped(
            draw,
            (158, y + 59),
            value,
            _font(28, bold=True),
            CLEAR_WHITE,
            810,
            spacing=4,
            max_lines=2 if height > 120 else 1,
        )
        y += height + 16

    draw.text((72, 1183), "РЕШЕНИЕ: НЕ УСКОРЯТЬ ПЛАН АВТОМАТИЧЕСКИ", font=_font(24, mono=True, bold=True), fill=BRASS)


VARIANTS: tuple[tuple[str, Callable[[ImageDraw.ImageDraw, pd.Series, PublicationProposal], None]], ...] = (
    ("План → факт → решение", _variant_plan_fact),
    ("Контрольный сигнал", _variant_signal),
    ("Пять строк", _variant_five_lines),
)


def render_publication_visual(
    session: pd.Series,
    proposal: PublicationProposal,
    variant: int = 0,
) -> PublicationVisual:
    """Render one exact-data PNG variant for the selected proposal."""

    normalized_variant = int(variant) % VARIANT_COUNT
    image = Image.new("RGB", (WIDTH, HEIGHT), CARBON)
    draw = ImageDraw.Draw(image)
    label, renderer = VARIANTS[normalized_variant]
    renderer(draw, session, proposal)
    _footer(draw)
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    safe_session = re.sub(r"[^A-Za-z0-9._-]", "-", proposal.session_id).strip("-") or "training"
    return PublicationVisual(
        data=buffer.getvalue(),
        filename=f"rform-{safe_session}-v{normalized_variant + 1}.png",
        mime_type="image/png",
        variant=normalized_variant,
        label=label,
    )
