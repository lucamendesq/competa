# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY-MAP.md`** at the repo root: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. Also check the context-scoped `docs/adr/` directories listed below.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a pnpm monorepo (`apps/*`, `libs/*`) with a multi-context layout. Contexts are the API's domain modules plus each app and shared lib:

```
/
├── GLOSSARY-MAP.md                      ← points at every GLOSSARY.md below
├── docs/adr/                            ← system-wide decisions
├── apps/
│   ├── api/src/modules/                 ← the domain contexts
│   │   ├── auth/        { GLOSSARY.md, docs/adr/ }
│   │   ├── billing/     { GLOSSARY.md, docs/adr/ }
│   │   ├── checklists/  { GLOSSARY.md, docs/adr/ }
│   │   ├── companies/   { GLOSSARY.md, docs/adr/ }
│   │   ├── contacts/    { GLOSSARY.md, docs/adr/ }
│   │   ├── messaging/   { GLOSSARY.md, docs/adr/ }
│   │   ├── periods/     { GLOSSARY.md, docs/adr/ }
│   │   ├── requests/    { GLOSSARY.md, docs/adr/ }
│   │   └── whatsapp/    { GLOSSARY.md, docs/adr/ }
│   ├── web/             { GLOSSARY.md, docs/adr/ }
│   └── landing/         { GLOSSARY.md, docs/adr/ }
└── libs/
    └── contracts/       { GLOSSARY.md, docs/adr/ }
```

A context gets a `GLOSSARY.md` only once it has terms worth pinning. Most won't, and that's fine.

`libs/contracts` is the shared API contract between `apps/api` and `apps/web`: terms defined there are workspace-wide and win over a single context's local naming.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
