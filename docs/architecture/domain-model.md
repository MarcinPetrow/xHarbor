# Core Domain Model

## Platform entities

### Organization

Top-level workspace boundary for the platform.

### Team

A delivery group inside an organization.
Teams are reused across planning, communication, and reporting.

### User

A person authenticated in the platform.
User records also carry organizational metadata such as department, title, and manager relationship.

### Membership

The relation between a user and a team with a role.

### Role

A permission bundle such as:

- owner
- admin
- manager
- member
- guest

### Invitation

A pending or accepted request to provision a new user into the workspace.

### Session

An authenticated browser or client session with presence state.

## App-owned entities

### xBacklog

- project
- task
- task comment
- task status transition
- task change history

### xTalk

- room
- direct conversation
- message
- read state
- archived room

### xDashboard

- report snapshot
- risk view
- activity view
- workload view

### xDoc

- page
- page hierarchy
- Markdown content revision
- authorship metadata

## Cross-app integration examples

- When team structure changes in `xGroup`, `xBacklog`, `xTalk`, `xDashboard`, and `xDoc` can consume the updated organizational data.
- When task activity changes in `xBacklog`, `xDashboard` can use that for delivery reporting.
- When users authenticate or change presence, `xTalk` can reflect that state in communication flows.
- When documentation changes in `xDoc`, revision metadata remains tied to users owned by `xGroup`.
