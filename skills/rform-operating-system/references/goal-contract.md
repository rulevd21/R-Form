# R/Form /goal Contract

`/goal` is the temporary control layer for one large bounded workstream. It does not replace North Star, a domain workflow, MASTER_DATA or AGENTS.md.

## Required structure

```text
/goal

OBJECTIVE
One final, verifiable result.

DEFINITION OF DONE
1. Observable condition.
2. Observable condition.
3. Required validation.

CONSTRAINTS
- source/architecture boundaries;
- cost/permission boundaries;
- compatibility requirements.

VALIDATION
- tests/readback/evidence required to call the goal complete.

STOP CONDITIONS
- irreversible decision requiring owner approval;
- unresolved canonical data conflict;
- external dependency unavailable;
- Definition of Done reached.
```

## Rules

- One active `/goal` per major workstream.
- A short user command remains the normal interface; the router maps it into the active goal context when relevant.
- `/goal` may narrow work but must not silently override North Star, standing policies or canonical source ownership.
- Do not store transient `/goal` content in AGENTS.md or MASTER_DATA unless the domain already has a canonical project/task object designed for it.
- A new goal may be used for Content & Operations, Training App, Data Architecture, Lead Magnet, Competition Preparation or another bounded project.
- Closing a goal requires its stated validation, not merely creation of files.
