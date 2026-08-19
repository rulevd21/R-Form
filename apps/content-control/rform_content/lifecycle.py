"""Правила жизненного цикла и готовности публикаций для интерфейса и тестов."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


ACTIVE_PUBLICATION_STATES = ("SCHEDULED", "APPROVED", "REVIEW", "PLANNED")
TERMINAL_PUBLICATION_STATES = ("PUBLISHED", "SUPERSEDED", "CANCELLED")
OPERATIONAL_PRIORITY = {
    "ERROR": 0,
    "SCHEDULED": 1,
    "APPROVED": 2,
    "REVIEW": 3,
    "PLANNED": 4,
    "DRAFT": 5,
    "IDEA": 6,
    "HOLD": 7,
    "PUBLISHED": 90,
    "SUPERSEDED": 91,
    "CANCELLED": 92,
}


def normalize(value: Any) -> str:
    """Return an uppercase, whitespace-normalized value safe for comparisons."""

    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"nan", "none", "<na>"}:
        return ""
    return " ".join(text.upper().split())


def _contains_any(value: Any, tokens: tuple[str, ...]) -> bool:
    text = normalize(value)
    return any(token in text for token in tokens)


def derive_lifecycle_state(row: Mapping[str, Any]) -> str:
    """Derive the single operational state shown in Content Control."""

    publication = normalize(row.get("Publication_Status"))
    text_status = normalize(row.get("Text_Status"))
    approval = normalize(row.get("Approval_Status"))
    pipeline = normalize(row.get("Pipeline_Status"))
    publish_error = normalize(row.get("Publish_Error"))
    blocking_issue = normalize(row.get("Blocking_Issue"))

    # Финальные статусы важнее устаревших блокировок, которые могли остаться
    # в исторической строке после успешной публикации или закрытия материала.
    if publication == "SUPERSEDED" or text_status == "SUPERSEDED" or _contains_any(
        pipeline, ("SUPERSEDED", "ЗАМЕНЕНО")
    ):
        return "SUPERSEDED"
    if publication == "CANCELLED" or _contains_any(pipeline, ("CANCELLED", "ОТМЕНЕНО")):
        return "CANCELLED"
    if publication == "PUBLISHED" or _contains_any(pipeline, ("PUBLISHED", "ОПУБЛИКОВАНО")):
        return "PUBLISHED"
    if publish_error or blocking_issue or publication in {"ERROR", "PUBLISHING"}:
        return "ERROR"
    if publication == "HOLD" or _contains_any(pipeline, ("HOLD", "ПАУЗА")):
        return "HOLD"
    if publication == "SCHEDULED" or _contains_any(pipeline, ("SCHEDULED", "ЗАПЛАНИРОВАНО")):
        return "SCHEDULED"
    if approval == "APPROVED":
        return "APPROVED"
    if text_status in {"APPROVED", "READY"} or _contains_any(pipeline, ("READY", "ГОТОВО")):
        return "REVIEW"
    if pipeline == "PLANNED" or publication == "PLANNED":
        return "PLANNED"
    if normalize(row.get("Content_ID")):
        return "DRAFT"
    return "IDEA"


def visual_required(row: Mapping[str, Any]) -> bool:
    """Whether the selected Telegram distribution mode requires a visual."""

    mode = normalize(row.get("Distribution_Mode") or row.get("Telegram_Post_Mode"))
    return mode not in {"", "TEXT_ONLY", "TEXT", "ТЕКСТ"}


def readiness_issues(row: Mapping[str, Any]) -> list[str]:
    """Return the reasons why a row cannot be scheduled safely."""

    if derive_lifecycle_state(row) in TERMINAL_PUBLICATION_STATES:
        return []

    issues: list[str] = []
    if normalize(row.get("Public_Data_Allowed")) not in {"YES", "ДА", "TRUE", "1"}:
        issues.append("Публичные данные не разрешены")
    if normalize(row.get("Text_Status")) != "APPROVED":
        issues.append("Текст не утверждён")
    if normalize(row.get("Approval_Status")) != "APPROVED":
        issues.append("Материал не утверждён владельцем")
    if visual_required(row) and normalize(row.get("Visual_Status")) != "APPROVED":
        issues.append("Визуал не утверждён")
    if not str(row.get("Telegram_Text") or "").strip():
        issues.append("Нет текста для Telegram")
    return issues


def is_action_required(row: Mapping[str, Any]) -> bool:
    """Flag records that require an explicit owner or operator action."""

    state = normalize(row.get("Lifecycle_State")) or derive_lifecycle_state(row)
    duplicate = normalize(row.get("Duplicate_Flag"))
    review = normalize(row.get("Preview_Review_Status"))
    explicit_issue = bool(
        normalize(row.get("Blocking_Issue")) or normalize(row.get("Publish_Error"))
    )

    if state in TERMINAL_PUBLICATION_STATES:
        return False
    if state == "ERROR" or explicit_issue:
        return True
    if duplicate in {"YES", "ДА", "TRUE", "1", "DUPLICATE"}:
        return True
    if review == "RECHECK_REQUIRED":
        return True
    if state == "SCHEDULED" and readiness_issues(row):
        return True
    return False
