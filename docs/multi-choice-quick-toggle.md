# Multi-choice quick toggle bulk mode

The view-level `_mqt` keyword toggles two-option multiple choice cells with one click. The first bracket group is always the list of columns to enable, by header or field ID:

```text
_mqt=[On App, Bookable]
_mqt=[field_688, field_1514]
```

## Bulk mode

Add a `[bulk]` group after the target list to let users change several records at once:

```text
_mqt=[On App, Bookable], [bulk]
_mqt=[On App, Bookable], [bulk, On App]
_mqt=[field_688, field_1514], [bulk, field_688]
```

A bare `[bulk]` enables bulk mode on every `_mqt` column. Listing headers or field IDs after `bulk` limits it to those columns. Without a `[bulk]` group, `_mqt` behaves exactly as before.

When bulk mode is on, row checkboxes (and a master checkbox) are added to the table. If the table already has KTL row checkboxes, those are reused. Bulk mode does not enable the KTL bulk operations toolbar.

With rows ticked, clicking a bulk-enabled `_mqt` cell:

- sets the clicked column to the opposite of the clicked cell's current value;
- applies it to the ticked rows plus the clicked row;
- skips rows that already have that value, and says how many were skipped;
- asks for confirmation before saving, then shows progress as each record is updated.

With no rows ticked, or on a column without bulk mode, the click works as a normal single toggle.
