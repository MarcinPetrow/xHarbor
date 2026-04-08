# xGroup

`xGroup` is the organizational backbone of xHarbor. It owns people, teams, memberships, invitations, sessions, and reporting structure for the rest of the platform.

![xGroup structure](../../assets/screenshots/xgroup-structure.png)

## Responsibilities

- team and people directory
- memberships and role assignments
- invitations and account lifecycle
- session administration
- reporting tree and manager relationships

## Main views

- `Overview` for workspace state and recent events
- `Teams` for team list, create, edit, and delete flows
- `People` for account list, create, edit, and delete flows
- `Structure` for the reporting chart
- `Memberships` for list, create, edit, and delete role assignment
- `Invitations` for onboarding future users through list and create flows
- `Sessions` for active session inspection and revocation

## Notes

`xGroup` now follows the same CRM-style pattern across its management views: lists stay separate from create and edit screens, and destructive actions require confirmation. The `Structure` view remains the best place to validate seeded workspace data. It supports horizontal and vertical layouts, collapse and expand controls, drag navigation, and path highlighting through the reporting chain.
