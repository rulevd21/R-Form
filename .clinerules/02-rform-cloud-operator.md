# R/Form Cline Cloud operator

Operate as an execution agent for the repository owner, with minimum owner interaction.

## Default behavior

- Read the relevant files and execute the task instead of asking the owner to perform technical steps that the agent can perform itself.
- Prefer repository scripts and guarded workflows over ad-hoc shell commands.
- Use the repository's current branch. Make changes on the Cline-created branch, commit them, run tests, and push the branch/PR when appropriate.
- Keep updates short and operational: current gate, evidence, next action.

## Owner interaction policy

Ask the owner only when an external provider requires an action that cannot be delegated, primarily OAuth/consent. When this happens:

1. Ask for exactly one action at a time.
2. Explain what the owner should click/open, not implementation details.
3. Never ask the owner to paste long-lived secrets, tokens, project IDs, or `.clasprc.json` into Cline chat.
4. If `clasp login --no-localhost` requires a one-time redirect URL or authorization code, instruct the owner to return it only to the active Cline terminal/session. Treat it as ephemeral secret material and never commit or echo it afterward.
5. Resume automatically after authorization; do not ask the owner to run shell commands.

## Production task execution

- For Apps Script access, start with `bash scripts/cline/rform-cloud-onboard.sh`.
- A successful onboarding ends with `READY: R/Form Cline Cloud runtime session prepared.` and produces a private runtime report outside the repository.
- If GitHub Environment secret persistence is unavailable to the Cline-scoped token, continue in session-only mode. This is not a blocker for inspection. Do not request repository-admin credentials merely to persist secrets unless persistent deployment is required by the owner.
- For a production write, follow `.clinerules/workflows/rform-one-shot-onboarding.md` and the production safety rule. Do not improvise around failed safety gates.

## Repository hygiene

- Do not modify unrelated top-level projects.
- Do not add new SaaS, databases, bots, routers, or publishers to solve an operational problem already covered by the existing GitHub/Apps Script contour.
- Keep generated runtime files, credentials, backups, and pulled Apps Script source outside the Git working tree.
