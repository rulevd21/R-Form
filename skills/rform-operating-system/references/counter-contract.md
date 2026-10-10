# Response Counter Contract

Response numbering is a presentation concern, not R/Form domain state.

- Never allocate a global response counter in `RFORM_MASTER_DATA_v1`.
- Never mutate Google Sheets solely to number chat responses.
- Never use response IDs as Day_ID, Session_ID, Content_ID, Task_ID or audit identifiers.
- Canonical object identifiers and verified writeback are the R/Form audit trail.
- If the active ChatGPT/user interface requires response numbering, follow that interface instruction locally without persisting it as operational data.
