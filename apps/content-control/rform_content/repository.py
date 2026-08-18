"""Read-only data access and normalization for Content Control."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import pandas as pd
import requests

from .lifecycle import PUBLICATION_PRIORITY, derive_lifecycle_state, is_action_required, readiness_issues


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


def build_api_request_auth(
    secret: str,
    *,
    timestamp: int | None = None,
    nonce: str | None = None,
) -> dict[str, str | int]:
    """Build the short-lived HMAC envelope expected by the Apps Script API."""

    request_timestamp = int(time.time()) if timestamp is None else int(timestamp)
    request_nonce = secrets.token_hex(16) if nonce is None else str(nonce)
    if len(request_nonce) != 32 or any(char not in "0123456789abcdef" for char in request_nonce):
        raise ValueError("nonce must contain exactly 32 lowercase hexadecimal characters")
    message = f"{request_timestamp}.{request_nonce}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    signature = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return {
        "timestamp": request_timestamp,
        "nonce": request_nonce,
        "signature": signature,
    }


def _validate_apps_script_url(endpoint_url: str) -> None:
    parsed = urlparse(endpoint_url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "script.google.com"
        or not parsed.path.startswith("/macros/s/")
        or not parsed.path.endswith("/exec")
        or parsed.query
        or parsed.fragment
    ):
        raise DataSourceError("Apps Script URL должен быть HTTPS deployment URL вида /macros/s/.../exec")


def _parse_generated_at(value: Any) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return datetime.now(timezone.utc)


def _load_apps_script(endpoint_url: str, secret: str, timeout_seconds: int) -> DataBundle:
    _validate_apps_script_url(endpoint_url)
    try:
        response = requests.post(
            endpoint_url,
            json=build_api_request_auth(secret),
            headers={"Accept": "application/json"},
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise DataSourceError(f"Не удалось прочитать Apps Script API: {exc}") from exc

    if not isinstance(payload, dict) or payload.get("ok") is not True:
        message = payload.get("message", "API отклонил запрос") if isinstance(payload, dict) else "Некорректный ответ API"
        raise DataSourceError(f"Apps Script API: {message}")

    queue_records = payload.get("queue")
    event_records = payload.get("events")
    if not isinstance(queue_records, list) or not isinstance(event_records, list):
        raise DataSourceError("Apps Script API вернул некорректную структуру данных")

    queue_columns = payload.get("queue_fields") or None
    event_columns = payload.get("event_fields") or None
    queue = pd.DataFrame.from_records(queue_records, columns=queue_columns)
    events = pd.DataFrame.from_records(event_records, columns=event_columns)
    return DataBundle(
        queue=prepare_queue(queue),
        events=prepare_events(events),
        source="APPS SCRIPT / READ ONLY",
        loaded_at=_parse_generated_at(payload.get("generated_at")),
        note="Данные получены подписанным POST-запросом; запись в Google Sheets отсутствует.",
    )


def load_bundle(
    app_root: Path,
    app_config: dict[str, Any] | None = None,
    api_secrets: dict[str, Any] | None = None,
) -> DataBundle:
    """Load live data when fully configured; otherwise use explicit demo data."""

    config = app_config or {}
    secret_config = api_secrets or {}
    mode = str(config.get("data_mode", "fixture")).strip().lower()

    if mode == "fixture":
        return _load_fixtures(app_root)
    if mode != "apps_script":
        raise DataSourceError(f"Неизвестный data_mode: {mode}")

    endpoint_url = str(config.get("apps_script_url", "")).strip()
    secret = str(secret_config.get("secret", "")).strip()
    if not endpoint_url or not secret:
        return _load_fixtures(
            app_root,
            note="Режим Apps Script выбран, но URL или секрет ещё не заполнены. Показаны синтетические данные.",
        )

    try:
        timeout_seconds = int(config.get("request_timeout_seconds", 20))
    except (TypeError, ValueError):
        timeout_seconds = 20
    timeout_seconds = min(max(timeout_seconds, 5), 60)
    return _load_apps_script(endpoint_url, secret, timeout_seconds)


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
