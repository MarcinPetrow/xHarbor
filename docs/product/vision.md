# Product Vision

## Problem

Development teams usually combine separate tools for work tracking, chat, identity, and reporting.
That creates duplicate data, fragmented permissions, and unreliable reporting.

## Goal

xHarbor should provide one platform where team structure, delivery work, communication, and reporting all use the same organizational model.

## Product applications

### xGroup

Platform backbone and single source of truth.

Responsibilities:

- users
- teams
- membership
- roles and permissions
- organizational metadata used by the rest of the platform

### xBacklog

Work management for projects and teams.

Responsibilities:

- projects
- boards
- tasks
- workflow states
- assignments
- delivery planning

Dependencies:

- users and teams from `xGroup`

### xTalk

Communication layer for the platform.

Responsibilities:

- rooms
- room membership
- direct messages
- conversation history
- notification hooks

Clients:

- web
- native macOS

Dependencies:

- users and teams from `xGroup`

### xDashboard

Reporting and analytics hub.

Responsibilities:

- reusable metrics
- cross-app reports
- team and project health dashboards
- operational insights

Dependencies:

- event streams and operational data from all platform apps

## Non-functional priorities

- open source and self-hostable
- modular architecture
- strong team and permission model
- API-first integration boundaries
- auditable cross-app events
- clear path for enterprise features later without breaking OSS core
