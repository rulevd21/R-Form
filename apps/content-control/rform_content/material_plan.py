"""Owner-facing classification of the technical content queue."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pandas as pd


TERMINAL_STATUSES = {"PUBLISHED", "CANCELLED", "SUPERSEDED"}
ARCHIVE_MARKERS = ("ARCHIVED", "SUPERSEDED", "ЗАКРЫТО", "ЗАМЕНЕНО")


@dataclass(frozen=True)
class MaterialPlan:
    today: pd.DataFrame
    future: pd.DataFrame
    published: pd.DataFrame
    archived: pd.DataFrame
    stale: pd.DataFrame
    technical: pd.DataFrame


def _text(frame: pd.DataFrame, field: str) -> pd.Series:
    if field not in frame:
        return pd.Series("", index=frame.index, dtype="object")
    return frame[field].fillna("").astype(str).str.strip()


def _parse_date(value: object) -> date | None:
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d.%m.%Y %H:%M", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
    return None if pd.isna(parsed) else parsed.date()


def _effective_dates(queue: pd.DataFrame) -> pd.Series:
    publish_at = _text(queue, "Publish_At")
    source_date = _text(queue, "Date")
    values = publish_at.where(publish_at.ne(""), source_date)
    return values.map(_parse_date)


def _contains_marker(frame: pd.DataFrame) -> pd.Series:
    combined = (
        _text(frame, "Pipeline_Status") + " "
        + _text(frame, "Current_Stage") + " "
        + _text(frame, "Text_Status")
    ).str.upper()
    return combined.map(lambda value: any(marker in value for marker in ARCHIVE_MARKERS))


def classify_materials(queue: pd.DataFrame, today: date | None = None) -> MaterialPlan:
    """Split source rows into owner-facing plan buckets without changing source data."""

    working = queue.copy()
    if working.empty:
        empty = working.copy()
        return MaterialPlan(empty, empty, empty, empty, empty, empty)

    current_date = today or datetime.now(ZoneInfo("Europe/Riga")).date()
    effective_dates = _effective_dates(working)
    publication = _text(working, "Publication_Status").str.upper()
    rubric = _text(working, "Rubric").str.upper()
    content_type = _text(working, "Content_Type").str.upper()
    content_id = _text(working, "Content_ID").str.upper()

    technical_mask = (
        rubric.eq("TECH_TEST")
        | content_type.eq("TECH_TEST")
        | content_id.str.startswith("TEST-")
    )
    published_mask = publication.eq("PUBLISHED") & ~technical_mask
    archived_mask = (
        publication.isin(TERMINAL_STATUSES - {"PUBLISHED"}) | _contains_marker(working)
    ) & ~published_mask & ~technical_mask
    remaining = ~(technical_mask | published_mask | archived_mask)
    dated = effective_dates.notna()
    stale_mask = remaining & (~dated | effective_dates.map(
        lambda value: value is not None and value < current_date
    ))
    today_mask = remaining & dated & effective_dates.map(lambda value: value == current_date)
    future_mask = remaining & dated & effective_dates.map(
        lambda value: value is not None and value > current_date
    )

    working["Plan_Date"] = effective_dates

    def selected(mask: pd.Series) -> pd.DataFrame:
        return working[mask].sort_values("Plan_Date", na_position="last").copy()

    return MaterialPlan(
        today=selected(today_mask),
        future=selected(future_mask),
        published=selected(published_mask),
        archived=selected(archived_mask),
        stale=selected(stale_mask),
        technical=selected(technical_mask),
    )
