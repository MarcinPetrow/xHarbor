# xHarbor

xHarbor is an open source monorepo for managing software delivery teams.

## Target architecture

- `xGroup`: web + Node API
- `xBacklog`: web + Node API
- `xDashboard`: web + Node API
- `xTalk`: web + native macOS client

## Active runtime

The active implementation path is now Node-based monorepo workspaces.

Current active modules:

- `apps/xgroup-api`
- `apps/xbacklog-api`
- `apps/xdashboard-api`
- `apps/xtalk-api`
- `apps/xgroup-web`
- `apps/xbacklog-web`
- `apps/xdashboard-web`
- `apps/xtalk-web`
- `packages/contracts`
- `packages/platform-auth`
- `packages/platform-session`
- `packages/sqlite-store`

Web UI standard:

- shared top navigation bar across all web apps
- sign-in controls on the right side of the nav bar
- shared visual shell with module sidebar and multi-view layout
- shared UI preferences for accent palette and timezone

Run:

```bash
npm install
npm run dev:xgroup
npm run dev:xbacklog
npm run dev:xdashboard
npm run dev:xtalk
swift run xtalk-macos
```

Local stack management:

```bash
npm run stack:start
npm run stack:status
npm run stack:logs
npm run stack:stop
npm run stack:restart
```

The stack launcher manages all Node APIs and web apps together.

Full local workspace management, including native `xtalk-macos`:

```bash
npm run workspace:start
npm run workspace:status
npm run workspace:logs
npm run workspace:stop
npm run workspace:restart
```

## Swift Scope

Swift remains in the repository only for the native `xtalk-macos` client and its shared `XTalkDomain`.
Web and backend modules are implemented in the Node monorepo.

## Persistence

Primary persistence for active web services now targets SQLite at `data/sqlite/xharbor.db`.
Active runtime expects the current SQLite schema only.

## Docs

- [docs/product/vision.md](/Users/marcin/Projects/xCompany/xHarbor/docs/product/vision.md)
- [docs/architecture/monorepo.md](/Users/marcin/Projects/xCompany/xHarbor/docs/architecture/monorepo.md)
- [docs/architecture/domain-model.md](/Users/marcin/Projects/xCompany/xHarbor/docs/architecture/domain-model.md)
