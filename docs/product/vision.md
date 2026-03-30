# Product Vision

## Problem

Software delivery organizations usually run on separate tools for identity, planning, communication, documentation, and reporting. That creates duplicated data, unclear ownership boundaries, and reporting that depends on fragile cross-tool synchronization.

## Goal

xHarbor should provide one modular platform where team structure, delivery work, communication, documentation, and reporting operate on the same organizational model.

The platform is not intended to collapse everything into one giant application. Each module should stay focused on one domain while sharing contracts, identity, and runtime foundations with the rest of the system.

## Product applications

### xGroup

The authoritative directory and organizational backbone.

Responsibilities:
- users and teams
- memberships and roles
- invitations and sessions
- manager relationships and reporting structure
- organizational metadata used by the rest of the platform

### xBacklog

Work management for projects and tasks.

Responsibilities:
- projects
- tasks and workflow states
- assignments
- comments and change history
- delivery planning

Dependencies:
- users and teams from `xGroup`

### xTalk

Communication layer for the platform.

Responsibilities:
- rooms
- direct conversations
- unread state and read markers
- presence
- conversation history

Clients:
- web
- native macOS

Dependencies:
- users and teams from `xGroup`

### xDashboard

Reporting and analytics surface.

Responsibilities:
- cross-module reporting snapshots
- delivery activity views
- team load views
- operational risk views

Dependencies:
- operational data from `xGroup` and `xBacklog`

### xDoc

Documentation workspace for structured Markdown content.

Responsibilities:
- hierarchical page tree
- preview and edit flows
- revision history
- authorship and change traceability

Dependencies:
- authenticated users and organizational metadata from `xGroup`

## Non-functional priorities

- open source and self-hostable
- modular architecture
- strong team and permission model
- API-first integration boundaries
- auditable operational history
- clear path for production hardening without breaking the OSS core
