# xDoc

`xDoc` is the Markdown documentation workspace for xHarbor. It keeps hierarchical pages, rendered preview, edit mode, and revision history inside one module.

![xDoc preview](../../assets/screenshots/xdoc-preview.png)

## Responsibilities

- hierarchical page tree
- Markdown preview and editing
- page authorship and last editor traceability
- per-page revision history

## Main views

- document tree in the left sidebar
- `Preview` as the default reading mode
- `Edit` for Markdown updates
- `History` for page revision inspection

## Notes

The page tree is the primary navigation surface. Document preview stays separate from editing so reading, writing, and history inspection remain distinct flows. The current web implementation also uses the shared shell interaction layer for page selection, mode switching, and editor submit handling.
