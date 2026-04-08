# Monorepo Architecture

## Current structure

```text
xHarbor/
  apps/
    _shared-web/
    xgroup-api/
    xgroup-web/
    xbacklog-api/
    xbacklog-web/
    xdashboard-api/
    xdashboard-web/
    xtalk-api/
    xtalk-web/
    xdoc-api/
    xdoc-web/
    xtalk-macos/
  packages/
    contracts/
    platform-auth/
    platform-session/
    sqlite-store/
  docs/
  Sources/
  Tests/
  Package.swift
```

`Package.swift` exists for the native `xtalk-macos` client and `XTalkDomain`. Web and backend modules run through the Node workspace defined in the repository root `package.json`.

## Architectural rules

### 1. xGroup is authoritative

`xGroup` owns users, teams, memberships, invitations, sessions, and reporting relationships.
Other modules may cache organizational data for performance, but they do not own that truth.

### 2. Contracts first

Shared packages define the cross-module shape of the platform:

- IDs
- roles and statuses
- permission scopes
- shared state conventions
- cross-module payload shapes

### 3. App-specific domains stay isolated

`xBacklog` owns planning state.
`xTalk` owns communication state.
`xDoc` owns documentation state.
`xDashboard` remains downstream from operational systems.

Cross-app integration should happen through contracts, read models, and explicit service boundaries.

### 4. Shared shell is a platform concern

Web apps share one shell and common browser-side helpers through `apps/_shared-web`.
That keeps branding, navigation patterns, settings, avatars, and common interaction layers aligned without merging domain logic.

The shared shell now owns:

- top bar and bottom bar templates
- accent and timezone preferences
- avatar rendering and user references
- delegated action and form binding
- route/query state helpers
- shared CRUD panel helpers
- shared drag/drop and pannable surface helpers

### 5. Local persistence stays simple

Local development persistence uses one SQLite database at `data/sqlite/xharbor.db`.
This keeps the stack easy to run while preserving state across the active modules.

## Runtime model

- each domain module has its own API app
- each web-facing domain has its own web app
- `xTalk` also has a native macOS client
- shared browser UI lives in `_shared-web`
- shared backend concerns live in `packages/*`

## Web interaction model

Across the web apps, common interaction patterns are intentionally centralized instead of reimplemented per module:

- CRUD-style list/create/edit flows use shared panel primitives
- route and query state flows use shared router helpers
- `data-action` handling uses shared delegated listeners
- form submission uses shared delegated submit helpers
- board and tree interaction helpers are shared where possible

Modules keep domain rules and payload shaping local, but shared UI behavior is expected to come from `_shared-web`.

## Suggested implementation order for future modules

1. `xGroup`
2. `xBacklog`
3. `xTalk`
4. `xDoc`
5. `xDashboard`

That order keeps identity and organization boundaries stable before more downstream modules are built on top of them.
