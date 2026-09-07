"""Automatic publication options from the latest closed training session."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

import pandas as pd


SESSION_HASH_FIELDS = (
    "Session_ID",
    "Date",
    "Session_Type",
    "Actual_Duration",
    "Readiness",
    "Pain_After",
    "Session_Goal",
    "Main_Result",
    "Plan_Status",
    "Technique_Status",
    "Session_Conclusion",
    "Session_Decision",
    "Session_Status",
)

TERMINAL_CONTENT_STATES = {"PUBLISHED", "CANCELLED", "SUPERSEDED"}
OWNER_PREVIEW_STAGES = {
    "OWNER_FINAL_PREVIEW",
    "OWNER_REVIEW",
    # The editorial workflow moves a material here after replacement cards are
    # approved.  It is still waiting only for the owner's publication decision.
    "CHANNEL_CONTROL_REVIEW",
}


@dataclass(frozen=True)
class PublicationProposal:
    proposal_id: str
    session_id: str
    source_hash: str
    mode: str
    target_content_id: str
    title: str
    angle: str
    telegram_text: str
    rationale: str
    recommended: bool = False


def _text(row: pd.Series, field: str, fallback: str = "") -> str:
    value = row.get(field, "")
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return fallback
    result = str(value).strip()
    return result or fallback


def _column(frame: pd.DataFrame, field: str) -> pd.Series:
    if field not in frame:
        return pd.Series("", index=frame.index, dtype="object")
    return frame[field].fillna("").astype(str).str.strip()


def session_source_hash(row: pd.Series) -> str:
    canonical = "\n".join(_text(row, field) for field in SESSION_HASH_FIELDS)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def covered_session_ids(queue: pd.DataFrame) -> set[str]:
    """Return sessions explicitly consolidated into a broader publication."""

    if queue.empty:
        return set()
    covered: set[str] = set()
    for _, row in queue.iterrows():
        source = " ".join(
            _text(row, field)
            for field in ("Proof_Source", "Editorial_Direction", "Blocking_Issue")
        )
        marker = re.search(r"\bCOVERS:([^\s]+)", source, flags=re.IGNORECASE)
        if not marker:
            continue
        covered.update(
            token.strip().upper()
            for token in marker.group(1).split(",")
            if token.strip().upper().startswith("S-")
        )
    return covered


def owner_ready_materials(queue: pd.DataFrame) -> pd.DataFrame:
    """Select finished queue items that are waiting only for the owner's decision."""

    if queue.empty:
        return queue.copy()
    working = queue.copy()
    stage = _column(working, "Current_Stage").str.upper()
    pipeline = _column(working, "Pipeline_Status").str.upper()
    publication = _column(working, "Publication_Status").str.upper()
    content_type = _column(working, "Content_Type").str.upper()
    telegram_text = _column(working, "Telegram_Text")
    public_allowed = _column(working, "Public_Data_Allowed").str.upper()
    rubric = _column(working, "Rubric").str.upper()
    visual_status = _column(working, "Visual_Status").str.upper()
    visual_url = _column(working, "Telegram_Visual_URL")
    blocking_issue = _column(working, "Blocking_Issue")
    informational_visual_note = blocking_issue.str.contains(
        r"^Visual\s+v\d+\s+approved\b", case=False, regex=True
    )
    weekly_bundle_ready = (
        rubric.eq("WEEKLY_CONTROL")
        & visual_status.isin({"READY", "REVIEW", "APPROVED"})
        & visual_url.ne("")
    )
    eligible = (
        (
            stage.isin(OWNER_PREVIEW_STAGES)
            | pipeline.str.contains("FINAL PREVIEW READY", regex=False)
            | weekly_bundle_ready
        )
        & ~publication.isin(TERMINAL_CONTENT_STATES | {"SCHEDULED"})
        & content_type.ne("TECH_TEST")
        & telegram_text.ne("")
        & public_allowed.isin({"YES", "ДА", "TRUE", "1"})
        & (blocking_issue.eq("") | informational_visual_note)
    )
    selected = working[eligible].copy()
    if selected.empty:
        return selected
    selected["Owner_Ready_Sort"] = pd.to_datetime(
        _column(selected, "Updated_At"), errors="coerce", dayfirst=True, utc=True
    )
    return selected.sort_values("Owner_Ready_Sort", ascending=False, na_position="last")


def _first_statement(value: str) -> str:
    return str(value).split(";", 1)[0].strip().rstrip(".")


def _find(pattern: str, value: str, fallback: str) -> str:
    match = re.search(pattern, str(value), flags=re.IGNORECASE)
    return match.group(1).strip() if match else fallback


def _session_metrics(row: pd.Series) -> dict[str, str]:
    result = _text(row, "Main_Result")
    conclusion = _text(row, "Session_Conclusion")
    first_result = _first_statement(result)
    rir = _find(r"\bRIR\s*([0-9/]+)", first_result, "не указан")
    technique = _find(r"техник[а-я ]*\s*(\d{1,2}/10)", conclusion, _text(row, "Technique_Status", "—"))
    pain = _find(r"боль после\s*(\d{1,2}/10)", conclusion, _text(row, "Pain_After", "—"))
    sets = _find(r"сохранено подходов\s*(\d+\s+из\s+\d+)", conclusion, "—")
    duration = _find(r"продолжительность\s*(\d+\s*мин)", conclusion, "")
    if not duration:
        raw_duration = _text(row, "Actual_Duration")
        duration = f"{raw_duration} мин" if raw_duration else "—"
    return {
        "plan": _first_statement(_text(row, "Session_Goal", "План не указан")),
        "fact": first_result or "Факт не указан",
        "rir": rir,
        "technique": technique,
        "pain": pain,
        "sets": sets,
        "duration": duration,
    }


def _status_conclusion(row: pd.Series) -> str:
    status = _text(row, "Plan_Status").upper()
    labels = {
        "ABOVE_PLAN": "Результат выше плана",
        "ON_PLAN": "План выполнен",
        "BELOW_PLAN": "Результат ниже плана",
    }
    return labels.get(status, "Результат зафиксирован")


def _diary_text(row: pd.Series) -> tuple[str, str, str]:
    session_type = _text(row, "Session_Type", "—")
    metrics = _session_metrics(row)
    title = "Дневник без перегруза: пять строк"
    angle = "Минимального набора проверяемых данных достаточно для следующего решения."
    text = f"""ДНЕВНИК НЕ ДОЛЖЕН СТАНОВИТЬСЯ ВТОРОЙ РАБОТОЙ

После тренировки {session_type} мне не нужен большой отчёт. Для следующего решения хватило пяти строк.

План: {metrics['plan']}.
Факт: {metrics['fact']}.
Запас: RIR {metrics['rir']}.
Техника: {metrics['technique']}.
Боль после: {metrics['pain']}.

Вся тренировка заняла {metrics['duration']}; выполнено {metrics['sets']} подходов.

{_status_conclusion(row)}, но следующая нагрузка не меняется автоматически. Изменение плана — отдельное решение после оценки восстановления.

Неидеальный дневник полезен, если он помогает отделить факт от ощущения и понять, что делать дальше.

ПЛАН → ФАКТ → РЕШЕНИЕ

#RForm_Training #RForm_System"""
    return title, angle, text


def _training_report_text(row: pd.Series) -> tuple[str, str, str]:
    session_type = _text(row, "Session_Type", "—")
    metrics = _session_metrics(row)
    title = f"Тренировка {session_type}: факт и решение"
    angle = "Сильный тренировочный сигнал фиксируется без автоматического ускорения плана."
    text = f"""ТРЕНИРОВКА {session_type}: ФАКТ СИЛЬНЕЕ ОЖИДАНИЙ

План: {metrics['plan']}.

Факт: {metrics['fact']}.

Техника — {metrics['technique']}. Боль после — {metrics['pain']}. Выполнено {metrics['sets']} подходов за {metrics['duration']}.

{_status_conclusion(row)}. Но хороший запас сам по себе не является командой немедленно повышать нагрузку.

РЕШЕНИЕ
Фиксирую результат как положительный сигнал. Следующий план изменяется только отдельным решением после проверки восстановления.

ПЛАН → ФАКТ → РЕШЕНИЕ

#RForm_Training"""
    return title, angle, text


def _content_state(row: pd.Series) -> str:
    for field in ("Publication_Status", "Pipeline_Status", "Text_Status"):
        value = _text(row, field).upper()
        if value in TERMINAL_CONTENT_STATES:
            return value
    return _text(row, "Publication_Status").upper()


def latest_unprocessed_session(queue: pd.DataFrame, sessions: pd.DataFrame) -> pd.Series | None:
    if sessions.empty or "Session_ID" not in sessions:
        return None
    working = sessions.copy()
    if "Session_Status" in working:
        status = working["Session_Status"].fillna("").astype(str).str.strip().str.upper()
        working = working[status.eq("CLOSED")]
    if working.empty:
        return None
    if "Session_Date_Sort" not in working:
        working["Session_Date_Sort"] = pd.to_datetime(
            working.get("Date", ""), errors="coerce", dayfirst=True, utc=True
        )
    session = working.sort_values(
        "Session_Date_Sort", ascending=False, na_position="last"
    ).iloc[0]
    session_id = _text(session, "Session_ID")
    if session_id.upper() in covered_session_ids(queue):
        return None
    linked = queue.iloc[0:0]
    if not queue.empty and "Session_ID" in queue:
        linked = queue[
            queue["Session_ID"].fillna("").astype(str).str.strip().eq(session_id)
        ]
    already_committed = any(
        _content_state(item) in {"PUBLISHED", "SCHEDULED"}
        or _text(item, "Telegram_Message_ID")
        for _, item in linked.iterrows()
    )
    return None if already_committed else session


def _candidate_score(row: pd.Series, session: pd.Series) -> int:
    if _content_state(row) in TERMINAL_CONTENT_STATES | {"SCHEDULED"}:
        return -1000
    if _text(row, "Content_Type").upper() == "TECH_TEST":
        return -1000
    score = 0
    if _text(row, "Session_ID") == _text(session, "Session_ID"):
        score += 100
    if _text(row, "Date") == _text(session, "Date"):
        score += 50
    rubric = _text(row, "Rubric").upper()
    if rubric in {"TRAINING_LOG", "METHODOLOGY"}:
        score += 20
    haystack = " ".join(
        _text(row, field).lower()
        for field in ("Main_Training_Fact", "Decision", "Editorial_Direction", "Audience_Problem")
    )
    if any(token in haystack for token in ("дневник", "трениров", "training check", "послетрениров")):
        score += 30
    if _text(row, "Publication_Status").upper() == "PLANNED":
        score += 10
    if _text(row, "Telegram_Text"):
        score -= 20
    return score


def _best_existing_content(queue: pd.DataFrame, session: pd.Series) -> pd.Series | None:
    if queue.empty:
        return None
    scored = [(_candidate_score(row, session), row) for _, row in queue.iterrows()]
    score, row = max(scored, key=lambda item: item[0])
    return row if score >= 50 else None


def build_publication_proposals(
    queue: pd.DataFrame,
    sessions: pd.DataFrame,
) -> tuple[pd.Series | None, list[PublicationProposal]]:
    session = latest_unprocessed_session(queue, sessions)
    if session is None:
        return None, []
    session_id = _text(session, "Session_ID")
    source_hash = session_source_hash(session)
    existing = _best_existing_content(queue, session)
    proposals: list[PublicationProposal] = []

    if existing is not None:
        title, angle, telegram_text = _diary_text(session)
        target = _text(existing, "Content_ID")
        proposals.append(PublicationProposal(
            proposal_id=f"PROP-{session_id}-UPDATE-{hashlib.sha256(target.encode()).hexdigest()[:8].upper()}",
            session_id=session_id,
            source_hash=source_hash,
            mode="UPDATE_EXISTING",
            target_content_id=target,
            title=title,
            angle=angle,
            telegram_text=telegram_text,
            rationale="Совпадает с датой и темой ближайшего запланированного материала; отдельный лишний пост не создаётся.",
            recommended=True,
        ))

    title, angle, telegram_text = _training_report_text(session)
    proposals.append(PublicationProposal(
        proposal_id=f"PROP-{session_id}-CREATE-REPORT",
        session_id=session_id,
        source_hash=source_hash,
        mode="CREATE_NEW",
        target_content_id="",
        title=title,
        angle=angle,
        telegram_text=telegram_text,
        rationale="Самостоятельный отчёт по последней тренировке; запланированные материалы остаются без изменений.",
        recommended=existing is None,
    ))
    return session, proposals
