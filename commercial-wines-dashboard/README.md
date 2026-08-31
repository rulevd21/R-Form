# Commercial Wines 2026 Integrated Dashboard

This package versions the source contract and calculation model for the integrated sales + shelf-price dashboard.

Refresh flow:
1. Update the two files in the linked Google Drive folder.
2. Rebuild the dashboard snapshot through the connected Google Drive + Data Analytics workflow.
3. Validate against `calculation-spec.md`.
4. Commit source/config changes through a PR so formula and source changes are reviewable.

The delivered HTML is self-contained and Drive-backed at build time.