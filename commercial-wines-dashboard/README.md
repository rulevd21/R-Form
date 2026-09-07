# Commercial Wines 2026 Integrated Dashboard

This package versions the source contract and calculation model for the integrated sales + shelf-price dashboard.

## Latest agreed version

**v20 is the latest agreed dashboard version. August 2026 is treated as a closed period and is included by default.**

The exact agreed artifact and reconstruction instructions are stored in `agreed-v20/`.

**Freeze rule:** do not commit any further dashboard updates to GitHub without a separate explicit user command.

Refresh flow, when explicitly authorized:
1. Update the source files in the linked Google Drive folder.
2. Rebuild the dashboard snapshot through the connected Google Drive + Data Analytics workflow.
3. Validate against `calculation-spec.md`.
4. Commit source/config changes through a PR so formula and source changes are reviewable.

The delivered HTML is self-contained and Drive-backed at build time.
