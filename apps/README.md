# Apps

This directory contains the application entry points for xHarbor.

## Web and API modules

- `xgroup-api`: organization, people, memberships, invitations, sessions
- `xgroup-web`: administrative workspace for the `xGroup` domain
- `xbacklog-api`: project and task workflow backend
- `xbacklog-web`: planning and delivery UI for `xBacklog`
- `xdashboard-api`: reporting backend built from platform data
- `xdashboard-web`: reporting UI for `xDashboard`
- `xtalk-api`: chat backend for rooms and direct conversations
- `xtalk-web`: web client for `xTalk`
- `xtag-api`: cross-system tag indexing and search backend
- `xtag-web`: tag discovery UI for `xTag`
- `xdoc-api`: documentation backend for Markdown pages and revisions
- `xdoc-web`: documentation UI for `xDoc`

## Native client

- `xtalk-macos`: native macOS client for `xTalk`

## Shared frontend surface

- `_shared-web`: shared shell, branding, preferences, and common browser-side helpers used by the web apps

`_shared-web` is also where the web platform keeps:
- shared nav bar and bottom bar templates
- shared avatar rendering
- shared CRUD panel helpers
- delegated action and form wiring
- shared route/query state helpers
- shared drag/drop and pannable interaction helpers

The active implementation path for web modules is the Node monorepo workspace setup defined in the repository root `package.json`.
