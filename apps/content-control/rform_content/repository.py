"""Signed data access, allowlisted actions, and normalization for Content Control."""

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

from .lifecycle import OPERATIONAL_PRIORITY, derive_lifecycle_state, is_action_required, readiness_issues


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

EVENT_OWNER_COLUMNS = {
    "Owner_Fact",
    "Owner_Angle",
    "Owner_Note",
    "Owner_Media_URLs",
    "Owner_Media_Folder_URL",
    "Owner_Review_Status",
    "Owner_Updated_At",
}

REQUIRED_TRAINING_SESSION_COLUMNS = {
    "Session_ID",
    "Date",
    "Session_Type",
    "Main_Result",
    "Session_Status",
}

CONTENT_ACTIONS = {
    "APPROVE",
    "RETURN_FOR_REVISION",
    "HOLD",
    "READY_TO_PUBLISH",
}
EVENT_DECISIONS = {"TO_PUBLICATION", "TO_WEEKLY", "DISMISS"}
PUBLICATION_PROPOSAL_MODES = {"UPDATE_EXISTING", "CREATE_NEW"}
MAX_EVENT_MEDIA_BYTES = 30 * 1024 * 1024
MAX_PUBLICATION_VISUAL_BYTES = 5 * 1024 * 1024
PUBLICATION_VISUAL_TYPES = {"image/jpeg", "image/png", "image/webp"}


class DataSourceError(RuntimeError):
    """Raised when a configured live source cannot be read safely."""


@dataclass(frozen=True)
class DataBundle:
    queue: pd.DataFrame
    events: pd.DataFrame
    sessions: pd.DataFrame
    source: str
    loaded_at: datetime
    note: str = ""
    api_version: str = ""
    capabilities: tuple[str, ...] = ()


def _drop_blank_rows(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame.copy()
    populated = frame.fillna("").astype(str).apply(lambda column: column.str.strip())
    return frame.loc[populated.ne("").any(axis=1)].reset_index(drop=True)


def prepare_queue(frame: pd.DataFrame) -> pd.DataFrame:
    """Add derived operational fields without changing source columns."""

    queue = _drop_blank_rows(frame)
    if queue.empty:
        for column in (
            "Lifecycle_State",
            "Readiness_Issues",
            "Is_Action_Required",
            "Publish_Sort",
            "Lifecycle_Priority",
        ):
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
    queue["Lifecycle_Priority"] = queue["Lifecycle_State"].map(OPERATIONAL_PRIORITY).fillna(89)
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


def prepare_sessions(frame: pd.DataFrame) -> pd.DataFrame:
    sessions = _drop_blank_rows(frame)
    if "Date" in sessions.columns:
        text = sessions["Date"].fillna("").astype(str).str.strip()
        is_iso = text.str.match(r"^\d{4}-\d{2}-\d{2}")
        parsed = pd.Series(pd.NaT, index=sessions.index, dtype="datetime64[ns, UTC]")
        if is_iso.any():
            parsed.loc[is_iso] = pd.to_datetime(text.loc[is_iso], errors="coerce", utc=True)
        if (~is_iso).any():
            parsed.loc[~is_iso] = pd.to_datetime(
                text.loc[~is_iso], errors="coerce", dayfirst=True, utc=True
            )
        sessions["Session_Date_Sort"] = parsed
    else:
        sessions["Session_Date_Sort"] = pd.Series(dtype="datetime64[ns, UTC]")
    return sessions


def _load_fixtures(app_root: Path, note: str = "") -> DataBundle:
    queue = pd.read_csv(app_root / "fixtures" / "content_queue.csv", keep_default_na=False)
    events = pd.read_csv(app_root / "fixtures" / "data_events.csv", keep_default_na=False)
    sessions_path = app_root / "fixtures" / "training_sessions.csv"
    sessions = (
        pd.read_csv(sessions_path, keep_default_na=False)
        if sessions_path.exists()
        else pd.DataFrame(columns=sorted(REQUIRED_TRAINING_SESSION_COLUMNS))
    )
    return DataBundle(
        queue=prepare_queue(queue),
        events=prepare_events(events),
        sessions=prepare_sessions(sessions),
        source="DEMO / FIXTURE",
        loaded_at=datetime.now(timezone.utc),
        note=note or "Используются синтетические данные. Производственные данные не загружены.",
    )


def _sha256_text(value: str) -> str:
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()


def _sign_message(secret: str, lines: list[str]) -> str:
    message = "\n".join(lines).encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _request_identity(
    *,
    timestamp: int | None = None,
    nonce: str | None = None,
    action_id: str | None = None,
) -> tuple[int, str, str]:
    request_timestamp = int(time.time()) if timestamp is None else int(timestamp)
    request_nonce = secrets.token_hex(16) if nonce is None else str(nonce)
    request_action_id = secrets.token_hex(16) if action_id is None else str(action_id)
    for name, value in (("nonce", request_nonce), ("action_id", request_action_id)):
        if len(value) != 32 or any(char not in "0123456789abcdef" for char in value):
            raise ValueError(f"{name} must contain exactly 32 lowercase hexadecimal characters")
    return request_timestamp, request_nonce, request_action_id


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


def build_content_action_request(
    secret: str,
    content_id: str,
    action: str,
    comment: str = "",
    *,
    timestamp: int | None = None,
    nonce: str | None = None,
    action_id: str | None = None,
) -> dict[str, str | int]:
    """Build a signed, idempotent request for one allowlisted content action."""

    normalized_action = str(action).strip().upper()
    normalized_content_id = str(content_id).strip()
    normalized_comment = str(comment).strip()
    if normalized_action not in CONTENT_ACTIONS:
        raise ValueError("action is not allowlisted")
    if not normalized_content_id:
        raise ValueError("content_id is required")
    request_timestamp, request_nonce, request_action_id = _request_identity(
        timestamp=timestamp, nonce=nonce, action_id=action_id
    )
    signature = _sign_message(
        secret,
        [
            str(request_timestamp),
            request_nonce,
            "content_action",
            request_action_id,
            normalized_content_id,
            normalized_action,
            _sha256_text(normalized_comment),
        ],
    )
    return {
        "timestamp": request_timestamp,
        "nonce": request_nonce,
        "signature": signature,
        "operation": "content_action",
        "action_id": request_action_id,
        "content_id": normalized_content_id,
        "action": normalized_action,
        "comment": normalized_comment,
    }


def build_event_review_request(
    secret: str,
    event_id: str,
    fact: str,
    angle: str,
    note: str = "",
    *,
    timestamp: int | None = None,
    nonce: str | None = None,
    action_id: str | None = None,
) -> dict[str, str | int]:
    """Build a signed request that saves the owner's publication-facing event edits."""

    normalized_event_id = str(event_id).strip()
    normalized_fact = str(fact).strip()
    normalized_angle = str(angle).strip()
    normalized_note = str(note).strip()
    if not normalized_event_id:
        raise ValueError("event_id is required")
    if not normalized_fact:
        raise ValueError("fact is required")
    if not normalized_angle:
        raise ValueError("angle is required")
    request_timestamp, request_nonce, request_action_id = _request_identity(
        timestamp=timestamp, nonce=nonce, action_id=action_id
    )
    signature = _sign_message(
        secret,
        [
            str(request_timestamp),
            request_nonce,
            "event_review",
            request_action_id,
            normalized_event_id,
            _sha256_text(normalized_fact),
            _sha256_text(normalized_angle),
            _sha256_text(normalized_note),
        ],
    )
    return {
        "timestamp": request_timestamp,
        "nonce": request_nonce,
        "signature": signature,
        "operation": "event_review",
        "action_id": request_action_id,
        "event_id": normalized_event_id,
        "fact": normalized_fact,
        "angle": normalized_angle,
        "note": normalized_note,
    }


def build_event_decision_request(
    secret: str,
    event_id: str,
    decision: str,
    fact: str,
    angle: str,
    note: str = "",
    *,
    timestamp: int | None = None,
    nonce: str | None = None,
    action_id: str | None = None,
) -> dict[str, str | int]:
    """Build a signed editorial decision request for one DATA_EVENTS row."""

    normalized_decision = str(decision).strip().upper()
    normalized_event_id = str(event_id).strip()
    normalized_fact = str(fact).strip()
    normalized_angle = str(angle).strip()
    normalized_note = str(note).strip()
    if normalized_decision not in EVENT_DECISIONS:
        raise ValueError("event decision is not allowlisted")
    if not normalized_event_id:
        raise ValueError("event_id is required")
    if not normalized_fact:
        raise ValueError("fact is required")
    if not normalized_angle:
        raise ValueError("angle is required")
    request_timestamp, request_nonce, request_action_id = _request_identity(
        timestamp=timestamp, nonce=nonce, action_id=action_id
    )
    signature = _sign_message(
        secret,
        [
            str(request_timestamp),
            request_nonce,
            "event_decision",
            request_action_id,
            normalized_event_id,
            normalized_decision,
            _sha256_text(normalized_fact),
            _sha256_text(normalized_angle),
            _sha256_text(normalized_note),
        ],
    )
    return {
        "timestamp": request_timestamp,
        "nonce": request_nonce,
        "signature": signature,
        "operation": "event_decision",
        "action_id": request_action_id,
        "event_id": normalized_event_id,
        "decision": normalized_decision,
        "fact": normalized_fact,
        "angle": normalized_angle,
        "note": normalized_note,
    }


def build_event_media_request(
    secret: str,
    event_id: str,
    filename: str,
    mime_type: str,
    data: bytes,
    *,
    timestamp: int | None = None,
    nonce: str | None = None,
    action_id: str | None = None,
) -> dict[str, str | int]:
    """Build a signed request for one private event media upload to Google Drive."""

    normalized_event_id = str(event_id).strip()
    normalized_filename = Path(str(filename)).name.strip()
    normalized_mime = str(mime_type).strip().lower()
    raw = bytes(data)
    if not normalized_event_id:
        raise ValueError("event_id is required")
    if not normalized_filename:
        raise ValueError("filename is required")
    if not normalized_mime:
        raise ValueError("mime_type is required")
    if not raw:
        raise ValueError("file is empty")
    if len(raw) > MAX_EVENT_MEDIA_BYTES:
        raise ValueError("file exceeds the 30 MB upload limit")
    digest_hex = hashlib.sha256(raw).hexdigest()
    request_timestamp, request_nonce, request_action_id = _request_identity(
        timestamp=timestamp, nonce=nonce, action_id=action_id
    )
    signature = _sign_message(
        secret,
        [
            str(request_timestamp),
            request_nonce,
            "event_media",
            request_action_id,
            normalized_event_id,
            normalized_filename,
            normalized_mime,
            str(len(raw)),
            digest_hex,
        ],
    )
    return {
        "timestamp": request_timestamp,
        "nonce": request_nonce,
        "signature": signature,
        "operation": "event_media",
        "action_id": request_action_id,
        "event_id": normalized_event_id,
        "filename": normalized_filename,
        "mime_type": normalized_mime,
        "size": len(raw),
        "sha256": digest_hex,
        "data_base64": base64.b64encode(raw).decode("ascii"),
    }


def build_publication_approval_request(
    secret: str,
    proposal_id: str,
    session_id: str,
    source_hash: str,
    mode: str,
    target_content_id: str,
    title: str,
    angle: str,
    telegram_text: str,
    visual_filename: str = "",
    visual_mime_type: str = "",
    visual_data: bytes | None = None,
    *,
    timestamp: int | None = None,
    nonce: str | None = None,
    action_id: str | None = None,
) -> dict[str, str | int]:
    """Build one signed approval that schedules the selected text and optional visual."""

    normalized_mode = str(mode).strip().upper()
    values = {
        "proposal_id": str(proposal_id).strip(),
        "session_id": str(session_id).strip(),
        "source_hash": str(source_hash).strip().lower(),
        "target_content_id": str(target_content_id).strip(),
        "title": str(title).strip(),
        "angle": str(angle).strip(),
        "telegram_text": str(telegram_text).strip(),
    }
    raw_visual = bytes(visual_data or b"")
    normalized_visual_filename = Path(str(visual_filename)).name.strip()
    normalized_visual_mime = str(visual_mime_type).strip().lower()
    if normalized_mode not in PUBLICATION_PROPOSAL_MODES:
        raise ValueError("proposal mode is not allowlisted")
    for name in ("proposal_id", "session_id", "source_hash", "title", "angle", "telegram_text"):
        if not values[name]:
            raise ValueError(f"{name} is required")
    if normalized_mode == "UPDATE_EXISTING" and not values["target_content_id"]:
        raise ValueError("target_content_id is required for an update")
    if len(values["source_hash"]) != 64 or any(
        char not in "0123456789abcdef" for char in values["source_hash"]
    ):
        raise ValueError("source_hash must be a SHA-256 hex digest")
    if len(values["telegram_text"]) > 4096:
        raise ValueError("telegram_text exceeds the Telegram limit")
    if raw_visual:
        if not normalized_visual_filename:
            raise ValueError("visual_filename is required when a visual is attached")
        if normalized_visual_mime not in PUBLICATION_VISUAL_TYPES:
            raise ValueError("visual_mime_type is not supported")
        if len(raw_visual) > MAX_PUBLICATION_VISUAL_BYTES:
            raise ValueError("publication visual exceeds the 5 MB upload limit")
    elif normalized_visual_filename or normalized_visual_mime:
        raise ValueError("visual_data is required for visual metadata")

    visual_sha256 = hashlib.sha256(raw_visual).hexdigest() if raw_visual else ""

    request_timestamp, request_nonce, request_action_id = _request_identity(
        timestamp=timestamp, nonce=nonce, action_id=action_id
    )
    signature_lines = [
        str(request_timestamp),
        request_nonce,
        "publication_approval",
        request_action_id,
        values["proposal_id"],
        values["session_id"],
        values["source_hash"],
        normalized_mode,
        values["target_content_id"],
        _sha256_text(values["title"]),
        _sha256_text(values["angle"]),
        _sha256_text(values["telegram_text"]),
    ]
    if raw_visual:
        signature_lines.extend([
            normalized_visual_filename,
            normalized_visual_mime,
            str(len(raw_visual)),
            visual_sha256,
        ])
    signature = _sign_message(secret, signature_lines)
    request: dict[str, str | int] = {
        "timestamp": request_timestamp,
        "nonce": request_nonce,
        "signature": signature,
        "operation": "publication_approval",
        "action_id": request_action_id,
        "proposal_id": values["proposal_id"],
        "session_id": values["session_id"],
        "source_hash": values["source_hash"],
        "mode": normalized_mode,
        "target_content_id": values["target_content_id"],
        "title": values["title"],
        "angle": values["angle"],
        "telegram_text": values["telegram_text"],
    }
    if raw_visual:
        request.update({
            "visual_filename": normalized_visual_filename,
            "visual_mime_type": normalized_visual_mime,
            "visual_size": len(raw_visual),
            "visual_sha256": visual_sha256,
            "visual_data_base64": base64.b64encode(raw_visual).decode("ascii"),
        })
    return request


def build_queue_publication_approval_request(
    secret: str,
    content_id: str,
    telegram_text: str,
    telegram_visual_url: str,
    telegram_post_mode: str,
    *,
    timestamp: int | None = None,
    nonce: str | None = None,
    action_id: str | None = None,
) -> dict[str, str | int]:
    """Build one signed approval for an existing owner-ready queue material."""

    normalized_content_id = str(content_id).strip()
    normalized_text = str(telegram_text).strip()
    normalized_visual_url = str(telegram_visual_url).strip()
    normalized_mode = str(telegram_post_mode).strip().upper() or "TEXT_ONLY"
    if not normalized_content_id:
        raise ValueError("content_id is required")
    if not normalized_text:
        raise ValueError("telegram_text is required")
    if len(normalized_text) > 4096:
        raise ValueError("telegram_text exceeds the Telegram limit")
    if normalized_mode not in {"TEXT_ONLY", "PHOTO_CAPTION", "ALBUM_CAPTION"}:
        raise ValueError("telegram_post_mode is not supported")
    if normalized_mode != "TEXT_ONLY" and not normalized_visual_url:
        raise ValueError("telegram_visual_url is required for a visual publication")

    request_timestamp, request_nonce, request_action_id = _request_identity(
        timestamp=timestamp, nonce=nonce, action_id=action_id
    )
    signature = _sign_message(
        secret,
        [
            str(request_timestamp),
            request_nonce,
            "queue_publication_approval",
            request_action_id,
            normalized_content_id,
            _sha256_text(normalized_text),
            _sha256_text(normalized_visual_url),
            normalized_mode,
        ],
    )
    return {
        "timestamp": request_timestamp,
        "nonce": request_nonce,
        "signature": signature,
        "operation": "queue_publication_approval",
        "action_id": request_action_id,
        "content_id": normalized_content_id,
        "telegram_text": normalized_text,
        "telegram_visual_url": normalized_visual_url,
        "telegram_post_mode": normalized_mode,
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


def _post_signed(endpoint_url: str, request: dict[str, Any], timeout_seconds: int, label: str) -> dict[str, Any]:
    _validate_apps_script_url(endpoint_url)
    try:
        response = requests.post(
            endpoint_url,
            json=request,
            headers={"Accept": "application/json"},
            timeout=min(max(int(timeout_seconds), 5), 90),
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise DataSourceError(f"Не удалось выполнить {label}: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("ok") is not True:
        message = payload.get("message", "API отклонил запрос") if isinstance(payload, dict) else "Некорректный ответ API"
        raise DataSourceError(f"{label.capitalize()} отклонено: {message}")
    return payload


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
    session_records = payload.get("training_sessions") or []
    if not isinstance(session_records, list):
        raise DataSourceError("Apps Script API вернул некорректные данные тренировок")
    session_columns = payload.get("training_session_fields") or None
    queue = pd.DataFrame.from_records(queue_records, columns=queue_columns)
    events = pd.DataFrame.from_records(event_records, columns=event_columns)
    sessions = pd.DataFrame.from_records(session_records, columns=session_columns)
    capabilities = tuple(
        str(value) for value in (payload.get("capabilities") or []) if str(value).strip()
    )
    has_write = any(
        capability in capabilities
        for capability in (
            "content.action", "event.review", "event.decision", "event.media",
            "publication.approve_schedule",
        )
    )
    return DataBundle(
        queue=prepare_queue(queue),
        events=prepare_events(events),
        sessions=prepare_sessions(sessions),
        source="APPS SCRIPT / CONTROLLED" if has_write else "APPS SCRIPT / READ ONLY",
        loaded_at=_parse_generated_at(payload.get("generated_at")),
        note=(
            "Данные получены подписанным запросом; изменения доступны только через подтверждённые операции."
            if has_write
            else "Данные получены подписанным запросом; изменения в Google Таблицы не вносятся."
        ),
        api_version=str(payload.get("version") or ""),
        capabilities=capabilities,
    )


def execute_content_action(
    endpoint_url: str,
    secret: str,
    content_id: str,
    action: str,
    comment: str = "",
    *,
    timeout_seconds: int = 20,
) -> dict[str, Any]:
    """Apply one signed allowlisted content action through Content Control API v0.3+."""

    request = build_content_action_request(secret, content_id, action, comment)
    return _post_signed(endpoint_url, request, timeout_seconds, "действие")


def execute_event_review(
    endpoint_url: str,
    secret: str,
    event_id: str,
    fact: str,
    angle: str,
    note: str = "",
    *,
    timeout_seconds: int = 20,
) -> dict[str, Any]:
    request = build_event_review_request(secret, event_id, fact, angle, note)
    return _post_signed(endpoint_url, request, timeout_seconds, "сохранение события")


def execute_event_decision(
    endpoint_url: str,
    secret: str,
    event_id: str,
    decision: str,
    fact: str,
    angle: str,
    note: str = "",
    *,
    timeout_seconds: int = 20,
) -> dict[str, Any]:
    request = build_event_decision_request(secret, event_id, decision, fact, angle, note)
    return _post_signed(endpoint_url, request, timeout_seconds, "редакционное решение")


def upload_event_media(
    endpoint_url: str,
    secret: str,
    event_id: str,
    filename: str,
    mime_type: str,
    data: bytes,
    *,
    timeout_seconds: int = 60,
) -> dict[str, Any]:
    request = build_event_media_request(secret, event_id, filename, mime_type, data)
    return _post_signed(endpoint_url, request, timeout_seconds, "загрузку файла")


def execute_publication_approval(
    endpoint_url: str,
    secret: str,
    proposal_id: str,
    session_id: str,
    source_hash: str,
    mode: str,
    target_content_id: str,
    title: str,
    angle: str,
    telegram_text: str,
    visual_filename: str = "",
    visual_mime_type: str = "",
    visual_data: bytes | None = None,
    *,
    timeout_seconds: int = 20,
) -> dict[str, Any]:
    request = build_publication_approval_request(
        secret,
        proposal_id,
        session_id,
        source_hash,
        mode,
        target_content_id,
        title,
        angle,
        telegram_text,
        visual_filename,
        visual_mime_type,
        visual_data,
    )
    return _post_signed(endpoint_url, request, timeout_seconds, "согласование публикации")


def execute_queue_publication_approval(
    endpoint_url: str,
    secret: str,
    content_id: str,
    telegram_text: str,
    telegram_visual_url: str,
    telegram_post_mode: str,
    *,
    timeout_seconds: int = 20,
) -> dict[str, Any]:
    request = build_queue_publication_approval_request(
        secret,
        content_id,
        telegram_text,
        telegram_visual_url,
        telegram_post_mode,
    )
    return _post_signed(endpoint_url, request, timeout_seconds, "согласование готового материала")


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
    event_owner_missing = sorted(EVENT_OWNER_COLUMNS - set(bundle.events.columns))
    session_missing = sorted(REQUIRED_TRAINING_SESSION_COLUMNS - set(bundle.sessions.columns))

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
        "event_owner_missing": event_owner_missing,
        "session_missing": session_missing,
        "queue_duplicates": queue_duplicates,
        "event_duplicates": event_duplicates,
        "queue_rows": len(bundle.queue),
        "event_rows": len(bundle.events),
        "session_rows": len(bundle.sessions),
    }
