# Core Domain Model

## Platform entities

### Organization

The top-level workspace boundary for the platform.

### Team

A group of users inside an organization.
Teams can own projects, rooms, and dashboards.

### User

A person authenticated in the platform.

### Membership

The relation between a user and a team with a role.

### Role

A permission bundle such as:

- owner
- admin
- manager
- member
- guest

## App-owned entities

### xBacklog

- project
- board
- task
- sprint
- workflow state

### xTalk

- room
- direct conversation
- message
- thread

### xDashboard

- metric definition
- report
- widget
- snapshot

## Cross-app integration examples

- When a team is renamed in `xGroup`, `xBacklog`, `xTalk`, and `xDashboard` receive an event and update their read models.
- When a task is completed in `xBacklog`, `xDashboard` can use that event for delivery reporting.
- When a room is created in `xTalk`, membership defaults can be resolved from `xGroup`.
