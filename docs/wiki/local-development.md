# Local development

## Core commands

Start the Node stack:

```bash
npm run stack:start
```

Manage the stack:

```bash
npm run stack:status
npm run stack:logs
npm run stack:restart
npm run stack:stop
```

Start the full workspace, including the macOS client:

```bash
npm run workspace:start
npm run workspace:status
npm run workspace:logs
npm run workspace:restart
npm run workspace:stop
```

## Persistence

Local runtime state is stored in:

`data/sqlite/xharbor.db`

## Regenerating UI screenshots

The wiki uses screenshots taken from the running applications. Regenerate them with:

```bash
npx playwright install chromium
npm run docs:screenshots
```

Generated images are written to:

`docs/assets/screenshots/`

Screenshots are intentionally captured in a consistent `16:9` frame so the wiki gallery stays visually aligned across modules.

## Repository structure

- `apps/` contains all web apps, APIs, and the native `xtalk-macos` client
- `packages/` contains shared contracts, auth, sessions, and SQLite persistence
- `Sources/` and `Tests/` hold the Swift code for native `xTalk`
- `docs/` holds product docs, architecture docs, and this wiki
