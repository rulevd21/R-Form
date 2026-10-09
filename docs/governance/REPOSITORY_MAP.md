# R/Form Repository Map

Status: ACTIVE  
Updated: 2026-10-09

This file answers one question: **which repository lines may be used for current R/Form work?**

## Canonical long-lived refs

| Ref | Role | May deploy from it? |
|---|---|---|
| `main` | Integration trunk, governance and canonical repository history | Only after a component release has passed its defined deployment gate |
| `production` | Exact pointer to the latest verified cross-component production source baseline | Yes; this is the runtime evidence pointer, not a development branch |

Current `production`: `122c26290b7ddd3a096216cf47248aedd609d388`.

## Active R/Form temporary lines

| PR | Branch | Role | Status |
|---|---|---|---|
| #5 | `agent/content-control-streamlit-readonly` | Content-platform integration line | ACTIVE INTEGRATION; contains PR #25 candidate beyond current verified production |
| #13 | `agent/stage3-weekly-observability-20261006` | Detector runtime reconciliation / receipts | ACTIVE P0; runtime provenance must be reconciled before deploy |
| #8 | `agent/rform-skill-content-v1.1.3` | R/Form Operating System acceptance | ACTIVE P1; not canonical router until acceptance passes |

These branches are not production merely because they are open, tested or merged internally.

## Historical training lines — closed, code retained

| PR | Branch | Classification | Rule |
|---|---|---|---|
| #4 | `release/training-exercise-changes-v0.1-rc1` | SUPERSEDED LEGACY RC | Closed. Reconcile any unique requirement against current Training source; never deploy wholesale |
| #10 | `feature/training-free-session-v0.1` | ARCHIVED SANDBOX | Closed. If FREE behavior is still needed, port requirements onto the current production base |

Closing these PRs does not delete their branches or Git history. They are evidence/reference only.

## Superseded PRs closed during governance cleanup

- PR #1 — legacy Channel Control v0.3 architecture; superseded by Content Control + Owner Bot + Telegram Autopost.
- PR #4 — legacy Training exercise-change production RC; old base and deployment model.
- PR #6 — Owner Bot v1.0.5; superseded by verified Owner Bot v1.2.4. Historical Telegram Autopost v0.3.2 E2E evidence is retained in the PR discussion.
- PR #10 — FREE training sandbox; production promotion was explicitly not ready and current Training has since advanced.
- PR #11 — Completed_At integrity draft; superseded by installed Training CORE 2.1.9 / PR #23 runtime fix.

## Non-R/Form repository scope

PR #9 / `commercial-wines-dashboard-v17` and the `commercial-wines` area are unrelated to R/Form core architecture. They are marked as migration candidates and should ultimately live in a separate repository so R/Form release history, CI and branches represent one product boundary.

## Production release labels used in PR titles

- `[PRODUCTION VERIFIED]`
- `[MERGED — NOT PRODUCTION VERIFIED]`
- `[SOURCE MERGED — RUNTIME PROVENANCE UNVERIFIED]`
- `[ACTIVE P0]`
- `[ACTIVE P1]`
- `[ACTIVE INTEGRATION]`
- `[SUPERSEDED]`
- `[SUPERSEDED LEGACY RC]`
- `[ARCHIVED SANDBOX]`
- `[OUTSIDE R/FORM CORE — MIGRATION CANDIDATE]`

These labels are human navigation aids. The machine-readable authority for runtime state remains `RFORM_RUNTIME_MANIFEST.json`.

## New-work rule

New R/Form development should start from `main` unless a documented component runbook explicitly requires another verified base.

Production promotion is:

`feature branch -> PR -> tests -> merge/integration -> deploy -> readback -> acceptance -> manifest -> production ref`

Do not start new work from a legacy/sandbox branch just because it contains a useful old implementation. Port the required behavior onto the current base instead.
