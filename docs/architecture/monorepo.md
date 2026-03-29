# Monorepo Architecture

## Recommended structure

```text
xHarbor/
  apps/
    xbacklog-web/
    xgroup-web/
    xdashboard-web/
    xtalk-web/
    xtalk-macos/
  packages/
    contracts/
    auth/
    design-system/
    analytics/
  services/
    identity/
    messaging/
    work-management/
    reporting/
  docs/
  Package.swift
```

`Package.swift` exists only for the native `xtalk-macos` app and `XTalkDomain`.

## Architectural rules

### 1. xGroup is authoritative

`xGroup` owns identity and team structure.
Other apps may cache data for performance, but they do not own user or team truth.

### 2. Contracts first

Shared packages should define:

- IDs
- core enums
- event names
- permission scopes
- DTOs used between apps and services

### 3. App-specific domains stay isolated

`xBacklog` should not know internal chat details.
`xTalk` should not know backlog workflow rules.
Cross-app integration should happen through contracts and events.

### 4. Reporting is downstream

`xDashboard` should consume events and read models.
It should not become a hidden coupling point for operational writes.

## Suggested implementation order

1. `xGroup`
2. `xBacklog`
3. `xTalk`
4. `xDashboard`

That order reduces rework because identity and organization boundaries are established first.
