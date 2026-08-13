# R/Form Training v1

Structured training loop: onboarding → session slot → plan/fact → analysis → next analogous plan.

Storage uses `PARTICIPANTS`, `CHECKS`, `EXERCISE_CATALOG`, `SESSION_EXERCISES`, and `INGEST_LOG` in the isolated Training Check datastore.

The public client must authenticate with a participant-scoped token. Custom exercises remain session-local and do not automatically enter the shared exercise catalog.
