"""Read-only data access and normalization for Content Control."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from .lifecycle import PUBLICATION_PRIORITY, derive_lifecycle_state, is_action_required, readiness_issues


READ_ONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"

REQUIRED_QUEUE_COLUMNS = {
    "Content_ID",
    "Date",
    "Rubric",
    "Public_Data_Allowed",
    "Text_Status",
    "Visual_Status",
    "Approval_Status",
    "Publication_Status",
    "Pipeline_Status",
    "Publish_At",
    "Distribution_Mode",
    "Telegram_Text",
    "Blocking_Issue",
    "Preview_Review_Status",
}

REQUIRED_EVENT_COLUMNS = {
    "Event_ID",
    "Date",
    "Event_Type",
    "Fact",
    "Content_Value_Score",
    "Editorial_Trigger",
    "Manual_Gate",
    "Status",
    "Owner_Action",
}


class DataSourceError(RuntimeError):
    """Raised when a configured live source cannot be read safely."""


@dataclass(frozen=True)
class DataBundle:
    queue: pd.DataFrame
    events: pd.DataFrame
    source: str
    loaded_at: datetime
    note: str = ""


def _drop_blank_rows(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame.copy()
    populated = frame.fillna("").astype(str).apply(lambda column: column.str.strip())
    return frame.loc[populated.ne("").any(axis=1)].reset_index(drop=True)


def _frame_from_values(values: list[list[Any]]) -> pd.DataFrame:
    if not values:
        return pd.DataFrame()
    headers = [str(value).strip() for value in values[0]]
    width = len(headers)
    rows = [list(row[:width]) + [""] * max(0, width - len(row)) for row in values[1:]]
    return _drop_blank_rows(pd.DataFrame(rows, columns=headers))


def prepare_queue(frame: pd.DataFrame) -> pd.DataFrame:
    """Add derived operational fields without changing source columns."""

    queue = _drop_blank_rows(frame)
    if queue.empty:
        for column in ("Lifecycle_State", "Readiness_Issues", "Is_Action_Required", "Publish_Sort"):
            queue[column] = pd.Series(dtype="object")
        return queue

    queue["Lifecycle_State"] = queue.apply(lambda row: derive_lifecycle_state(row), axis=1)
    queue["Readiness_Issues"] = queue.apply(
        lambda row: " · ".join(readiness_issues(row)), axis=1
    )
    queue["Is_Action_Required"] = queue.apply(lambda row: is_action_required(row), axis=1)

    publish_source = queue["Publish_At"] if "Publish_At" in queue else pd.Series("", index=queue.index)
    date_source = queue["Date"] if "Date" in queue else pd.Series("", index=queue.index)
    publish_at = pd.to_datetime(publish_source, errors="coerce", utc=True)
    date_only = pd.to_datetime(date_source, errors="coerce", utc=True)
    queue["Publish_Sort"] = publish_at.fillna(date_only)
    queue["Lifecycle_Priority"] = queue["Lifecycle_State"].map(PUBLICATION_PRIORITY).fillna(99)
    return queue


def prepare_events(frame: pd.DataFrame) -> pd.DataFrame:
    events = _drop_blank_rows(frame)
    if "Content_Value_Score" in events.columns:
        events["Content_Value_Score_Num"] = pd.to_numeric(
            events["Content_Value_Score"], errors="coerce"
        )
    else:
        events["Content_Value_Score_Num"] = pd.Series(dtype="float64")
    if "Date" in events.columns:
        events["Event_Date_Sort"] = pd.to_datetime(events["Date"], errors="coerce", utc=True)
    else:
        events["Event_Date_Sort"] = pd.Series(dtype="datetime64[ns, UTC]")
    return events


def _load_fixtures(app_root: Path, note: str = "") -> DataBundle:
    queue = pd.read_csv(app_root / "fixtures" / "content_queue.csv", keep_default_na=False)
    events = pd.read_csv(app_root / "fixtures" / "data_events.csv", keep_default_na=False)
    return DataBundle(
        queue=prepare_queue(queue),
        events=prepare_events(events),
        source="DEMO / FIXTURE",
        loaded_at=datetime.now(timezone.utc),
        note=note or "Используются синтетические данные. Производственные данные не загружены.",
    )


def _load_google(
    spreadsheet_id: str,
    queue_sheet: str,
    events_sheet: str,
    service_account_info: dict[str, Any],
) -> DataBundle:
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build

        credentials = Credentials.from_service_account_info(
            service_account_info,
            scopes=[READ_ONLY_SCOPE],
        )
        service = build("sheets", "v4", credentials=credentials, cache_discovery=False)
        ranges = [f"'{queue_sheet}'!A:ZZ", f"'{events_sheet}'!A:ZZ"]
        response = (
            service.spreadsheets()
            .values()
            .batchGet(spreadsheetId=spreadsheet_id, ranges=ranges, majorDimension="ROWS")
            .execute()
        )
        value_ranges = response.get("valueRanges", [])
        if len(value_ranges) != 2:
            raise DataSourceError("Google Sheets вернул неполный набор диапазонов")

        queue = _frame_from_values(value_ranges[0].get("values", []))
        events = _frame_from_values(value_ranges[1].get("values", []))
        return DataBundle(
            queue=prepare_queue(queue),
            events=prepare_events(events),
            source=f"GOOGLE SHEETS / {spreadsheet_id[-6:]}",
            loaded_at=datetime.now(timezone.utc),
            note="Подключение использует только scope spreadsheets.readonly.",
        )
    except DataSourceError:
        raise
    except Exception as exc:  # pragma: no cover - exercised only against Google APIs
        raise DataSourceError(f"Не удалось прочитать Google Sheets: {exc}") from exc


def load_bundle(
    app_root: Path,
    app_config: dict[str, Any] | None = None,
    service_account_info: dict[str, Any] | None = None,
) -> DataBundle:
    """Load live data when fully configured; otherwise use explicit demo data."""

    config = app_config or {}
    credentials = service_account_info or {}
    mode = str(config.get("data_mode", "fixture")).strip().lower()

    if mode != "google":
        return _load_fixtures(app_root)

    spreadsheet_id = str(config.get("spreadsheet_id", "")).strip()
    if not spreadsheet_id or not credentials.get("client_email") or not credentials.get("private_key"):
        return _load_fixtures(
            app_root,
            note="Режим Google выбран, но секреты ещё не заполнены. Показаны синтетические данные.",
        )

    return _load_google(
        spreadsheet_id=spreadsheet_id,
        queue_sheet=str(config.get("queue_sheet", "CONTENT_QUEUE")),
        events_sheet=str(config.get("events_sheet", "DATA_EVENTS")),
        service_account_info=credentials,
    )


def diagnostics(bundle: DataBundle) -> dict[str, Any]:
    queue_missing = sorted(REQUIRED_QUEUE_COLUMNS - set(bundle.queue.columns))
    event_missing = sorted(REQUIRED_EVENT_COLUMNS - set(bundle.events.columns))

    queue_duplicates = 0
    if "Content_ID" in bundle.queue.columns:
        ids = bundle.queue["Content_ID"].astype(str).str.strip()
        queue_duplicates = int(ids[ids.ne("")].duplicated(keep=False).sum())

    event_duplicates = 0
    if "Event_ID" in bundle.events.columns:
        ids = bundle.events["Event_ID"].astype(str).str.strip()
        event_duplicates = int(ids[ids.ne("")].duplicated(keep=False).sum())

    return {
        "queue_missing": queue_missing,
        "event_missing": event_missing,
        "queue_duplicates": queue_duplicates,
        "event_duplicates": event_duplicates,
        "queue_rows": len(bundle.queue),
        "event_rows": len(bundle.events),
    }
