"""One-screen owner approval for automatically prepared publications."""

from __future__ import annotations

from html import escape
from typing import Any

import pandas as pd
import streamlit as st

from .daily_publications import PublicationProposal, build_publication_proposals
from .publication_visual import VARIANT_COUNT, PublicationVisual, render_publication_visual
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
    telegram_text: str,
    visual: PublicationVisual | None,
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
            telegram_text,
            visual.filename if visual else "",
            visual.mime_type if visual else "",
            visual.data if visual else None,
            timeout_seconds=timeout,
        )
    except (DataSourceError, ValueError) as exc:
        st.error(str(exc))
        return
    st.session_state["daily_publication_success"] = (
        f"Публикация «{proposal.title}» согласована"
        f"{' вместе с визуалом' if visual else ''} и передана в автопостинг. "
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

    state_suffix = f"{selected.proposal_id}::{selected.source_hash[:12]}"
    text_key = f"daily_publication_text::{state_suffix}"
    edit_key = f"daily_publication_edit::{state_suffix}"
    input_key = f"daily_publication_input::{state_suffix}"
    variant_key = f"daily_publication_visual_variant::{state_suffix}"
    include_key = f"daily_publication_include_visual::{state_suffix}"
    st.session_state.setdefault(text_key, selected.telegram_text)
    st.session_state.setdefault(edit_key, False)
    st.session_state.setdefault(variant_key, 0)

    telegram_text = str(st.session_state[text_key]).strip()
    visual = render_publication_visual(session, selected, st.session_state[variant_key])

    st.markdown("### Предпросмотр комплекта")
    if st.session_state[edit_key]:
        st.text_area(
            "Текст публикации",
            value=telegram_text,
            height=430,
            max_chars=4096,
            key=input_key,
        )
        save_col, cancel_col = st.columns(2)
        with save_col:
            if st.button("Сохранить изменения", width="stretch", key=f"save_text::{state_suffix}"):
                updated = str(st.session_state.get(input_key, "")).strip()
                if not updated:
                    st.error("Текст публикации не может быть пустым.")
                else:
                    st.session_state[text_key] = updated
                    st.session_state[edit_key] = False
                    st.rerun()
        with cancel_col:
            if st.button("Отменить", width="stretch", key=f"cancel_text::{state_suffix}"):
                st.session_state.pop(input_key, None)
                st.session_state[edit_key] = False
                st.rerun()
    else:
        safe_text = escape(telegram_text).replace("\n", "<br>")
        st.markdown(
            f'<div class="rf-card"><div class="rf-detail" style="font-size:.96rem;line-height:1.6">{safe_text}</div></div>',
            unsafe_allow_html=True,
        )

    visual_supported = "publication.visual" in set(bundle.capabilities)
    include_visual = st.checkbox(
        "Добавить визуал к публикации",
        value=visual_supported,
        disabled=not visual_supported,
        key=include_key,
    )
    st.image(
        visual.data,
        caption=f"Вариант {visual.variant + 1} из {VARIANT_COUNT} · {visual.label}",
        width="stretch",
    )

    edit_col, visual_col = st.columns(2)
    with edit_col:
        if st.button("Изменить текст", width="stretch", key=f"edit_text::{state_suffix}"):
            st.session_state[edit_key] = True
            st.rerun()
    with visual_col:
        if st.button(
            "Сформировать другое изображение",
            width="stretch",
            key=f"next_visual::{state_suffix}",
        ):
            st.session_state[variant_key] = (int(st.session_state[variant_key]) + 1) % VARIANT_COUNT
            st.rerun()

    if not visual_supported:
        st.caption(
            "Визуал уже можно проверить, но его передача станет доступна после обновления Apps Script до v0.5.2."
        )

    enabled = "publication.approve_schedule" in set(bundle.capabilities)
    if not enabled:
        st.warning(
            "Автоматическое согласование станет доступно после обновления Apps Script до v0.5.2. "
            "Пока варианты можно проверить без изменения данных."
        )
    final_enabled = enabled and bool(telegram_text) and (not include_visual or visual_supported)
    if st.button(
        "Согласовать и отправить",
        type="primary",
        width="stretch",
        disabled=not final_enabled or bool(st.session_state[edit_key]),
        key=f"approve_publication::{selected.proposal_id}",
    ):
        _apply(
            selected,
            telegram_text,
            visual if include_visual else None,
            app_config,
            api_secrets,
        )
    st.caption(
        "После нажатия выбранный комплект будет утверждён и передан существующему автопостингу. "
        "Второй вариант и другие материалы не изменятся."
    )
    return True
