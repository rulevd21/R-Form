# R/Form Agentic Operating Architecture

Status: foundation migration in progress. This document is technical architecture documentation; live operational facts remain in the canonical Drive sources.

## Canonical hierarchy

```text
R/Form North Star
  -> existing RFORM_HANDBOOK_CURRENT (Project Passport + Brand Platform)
Goal Layer
  -> task-scoped /goal contract; never AGENTS.md or operational data
R/Form Operating System
  -> skills/rform-operating-system/SKILL.md
Domain Workflows
  -> Operating System references today; split into specialized Skills only after stable contracts/tests
Master Workflows / SOPs
  -> existing handbook/addendum, content workflow and component contracts
Agent Rules
  -> /AGENTS.md
Data Layer
  -> RFORM_MASTER_DATA_v1 + approved Drive documents
Applications
  -> Training Mobile, Input Automation, Content Control, Training Check
Integrations
  -> Google Drive/Sheets, GitHub, Telegram publication pipeline
Tests
  -> component regression tests + Operating System reference integrity
```

## Existing-first decisions

- No second command router.
- No second master datastore.
- No second publication queue/scheduler/sender.
- No standalone North Star document: the existing handbook already owns the required business content.
- No immediate seven-skill rewrite. Current domain workflow modules are hardened first; specialized Skills are Phase 3 only where they reduce overlap/maintenance.
- Backup/sandbox MASTER_DATA copies remain restore/test history, not competing SoR.

## Current critical gaps

### P0
1. Operating System `SKILL.md` referenced missing domain/source/state/permission contracts. Foundation fix restores those files and adds integrity CI.
2. Operating System source exists in GitHub but must be verified as installed/discoverable in the actual ChatGPT runtime before it can be called reliably as the sole router.

### P1
1. Weekly has no single canonical persisted state owner; current state is inferred from versioned artifacts and publication records.
2. Development branches are materially diverged from `main`; deployment status must be resolved before branch cleanup.
3. Some technical docs are stale versus production data/version (for example older Input Automation notes say FOOD_CATALOG/MEAL_TEMPLATES are absent although production now contains them; Content Control deployment notes still identify v0.5.3 while app README is v0.5.4).
4. Legacy functional-chat architecture remains documented in the Operating Addendum. Treat it as a callable expert-service/SOP model behind the Operating System, not as a competing user-facing router.

### P2
1. Decide whether stable workflow modules warrant extraction into specialized Skills.
2. Consolidate stale deployment docs after production version verification.
3. Perform branch cleanup only after unique-commit comparison and rollback tagging.

## Migration phases

### Phase 1 — Foundation
Restore router contracts, repository AGENTS rules and reference-integrity tests. No production changes.

### Phase 2 — Router
Verify the existing Operating System is installed/discoverable in the target ChatGPT environment. Add/validate command-registry acceptance tests. Preserve all short commands.

### Phase 3 — Domain Skills
Extract only stable, non-overlapping domains where a separate Skill provides measurable benefit. Operating System remains the sole router.

### Phase 4 — Data Contracts
Formalize ownership/mapping for DAY, MEAL, TRAINING, TRAINING PLAN, BODY METRICS, PREPARATION STATUS, WEEKLY REPORT, CONTENT ITEM and PUBLICATION without new datastores. Resolve Weekly state ownership.

### Phase 5 — Workflow Migration
Route old functional-chat SOPs/master prompts behind router/domain contracts. Preserve Content Control and Telegram Autopost boundaries.

### Phase 6 — End-to-End Validation
Run acceptance commands from day open through publication, verifying state before/after and exact writeback.

### Phase 7 — Cleanup
Only after E2E pass: mark stale prompts/docs/branches as superseded or archive them. Never delete unique history without owner approval.

## Rollback

All foundation changes are isolated to a development branch and documentation/tests. Roll back by reverting the commits. No production Sheet, Apps Script deployment, Telegram state, secrets or `main` branch is modified by Phase 1.
