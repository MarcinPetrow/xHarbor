# xTag

`xTag` is the cross-system tag search module for xHarbor. It indexes case-insensitive hashtag usage from other apps and exposes one search surface for results across the platform.

## Responsibilities

- normalize `#tags` across modules
- aggregate tag matches from source apps
- expose unified search and reindex flows
- keep tag discovery consistent across platform boundaries

## Current sources

- `xBacklog` task content
- `xTalk` conversation content
- `xDoc` page content

## Notes

`xTag` is intentionally built as an aggregator, not as an owner of domain data. Source modules remain responsible for their own entities and only expose tagged results through module APIs.
