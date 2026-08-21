"""One-screen owner approval for automatically prepared publications."""

from __future__ import annotations

from html import escape
from typing import Any

import pandas as pd
import streamlit as st

from .daily_publications import PublicationProposal, build_publication_proposals
from .repository import DataSourceError, execute_publication_approval


def _text(row: pd.Series, field: str, fallback: str = "—") -> str:
    value = row.get(field, "")
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return fallback
    result = str(value).strip()
    return result or fallback


def _api_args(app_config: dict[str, Any], api_secrets: dict[str, Any]) -> tuple[str, str, int]:
    endpoint_url = str(app_config.get("apps_script_url", "")).strip()
    secret = str(api_secrets.get("secret", "")).strip()
    try:
        timeout = int(app_config.get("request_timeout_seconds", 20))
    except (TypeError, ValueError):
        timeout = 20
    return endpoint_url, secret, min(max(timeout, 5), 60)


def _label(proposal: PublicationProposal) -> str:
    prefix = "Рекомендуется · " if proposal.recommended else "Альтернатива · "
    action = "обновить плановый материал" if proposal.mode == "UPDATE_EXISTING" else "создать новый материал"
    return f"{prefix}{proposal.title} — {action}"


def _status_label(value: str) -> str:
    return {
        "ABOVE_PLAN": "Результат выше плана",
        "ON_PLAN": "План выполнен",
        "BELOW_PLAN": "Результат ниже плана",
    }.get(str(value).strip().upper(), "Результат зафиксирован")


def _apply(
    proposal: PublicationProposal,
    app_config: dict[str, Any],
    api_secrets: dict[str, Any],
) -> None:
    endpoint_url, secret, timeout = _api_args(app_config, api_secrets)
    try:
        result = execute_publication_approval(
            endpoint_url,
            secret,
            proposal.proposal_id,
            proposal.session_id,
            proposal.source_hash,
            proposal.mode,
            proposal.target_content_id,
            proposal.title,
            proposal.angle,
            proposal.telegram_text,
            timeout_seconds=timeout,
        )
    except (DataSourceError, ValueError) as exc:
        st.error(str(exc))
        return
    st.session_state["daily_publication_success"] = (
        f"Публикация «{proposal.title}» согласована и передана в автопостинг. "
        "Ожидаемая отправка — в течение пяти минут."
    )
    st.cache_data.clear()
    st.rerun()


def render_daily_publication_review(
    bundle,
    app_config: dict[str, Any],
    api_secrets: dict[str, Any],
) -> bool:
    """Render the automatic training-to-publication decision when available."""

    success = st.session_state.pop("daily_publication_success", "")
    if success:
        st.success(success)
        st.caption("Дополнительных действий не требуется.")
        return True

    session, proposals = build_publication_proposals(bundle.queue, bundle.sessions)
    if session is None or not proposals:
        return False

    st.subheader("Готово к согласованию")
    st.caption(
        "Новая тренировка найдена автоматически. Система сопоставила её с очередью и подготовила готовые варианты."
    )
    st.markdown(
        '<div class="rf-card rf-card-decision">'
        '<div class="rf-label">Новые данные</div>'
        f'<div class="rf-value">{escape(_text(session, "Date"))} · Тренировка {escape(_text(session, "Session_Type"))}</div>'
        f'<div class="rf-detail">{escape(_status_label(_text(session, "Plan_Status")))} · '
        f'{escape(_text(session, "Actual_Duration"))} минут · данные закрыты</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    option_ids = [proposal.proposal_id for proposal in proposals]
    by_id = {proposal.proposal_id: proposal for proposal in proposals}
    selected_id = st.radio(
        "Выберите публикацию",
        option_ids,
        format_func=lambda value: _label(by_id[value]),
        key="daily_publication_selected",
    )
    selected = by_id[selected_id]
    if selected.recommended:
        st.info("Рекомендация системы: " + selected.rationale)
    else:
        st.caption(selected.rationale)

    st.markdown("### Предпросмотр")
    safe_text = escape(selected.telegram_text).replace("\n", "<br>")
    st.markdown(
        f'<div class="rf-card"><div class="rf-detail" style="font-size:.96rem;line-height:1.6">{safe_text}</div></div>',
        unsafe_allow_html=True,
    )

    enabled = "publication.approve_schedule" in set(bundle.capabilities)
    if not enabled:
        st.warning(
            "Автоматическое согласование станет доступно после обновления Apps Script до v0.5. "
            "Пока варианты можно проверить без изменения данных."
        )
    if st.button(
        "Согласовать и отправить",
        type="primary",
        width="stretch",
        disabled=not enabled,
        key=f"approve_publication::{selected.proposal_id}",
    ):
        _apply(selected, app_config, api_secrets)
    st.caption(
        "После нажатия выбранный текст будет утверждён и передан существующему автопостингу. "
        "Второй вариант и другие материалы не изменятся."
    )
    return True
