# Content Operations — `_bulk_actions` Keyword Guide (Bulk/Basket Actions)

This guide explains how to add bulk action buttons to a Knack grid using the `_bulk_actions` view keyword.

The parsing/store/runner logic also exists as a standalone module in `knack-bulk-actions.js`.

That standalone file **can** be reused in another Knack app, but not as a zero-config drop-in by itself.
Another app still needs a small integration layer for:

- resolving `view_####` ids to Knack form metadata (`create` vs `update`)
- registering non-form bulk actions
- registering payload/data callbacks
- wiring the helper into that app's render / basket / form-submit flow (typically from that app's `processViewKeywords`)
- choosing app-specific storage keys when needed (`viewId`, optional `namespace`, optional `appId` override)

If you only copy `knack-bulk-actions.js` into another app without that wiring, the reusable helpers will load, but the full bulk workflow will not run end-to-end.

The bulk system works like this:

1. User selects rows in a table/grid.
2. User clicks a bulk button (e.g. “Assign Task”, “Edit Deal Memo”).
3. A Basket opens and stores the selected record ids.
4. The user runs the chosen action from the Basket.
5. For form-based actions:
   - The first record is done by the user via the form.
   - The rest of the basket is automatically replicated via the Knack API.

---

## 0) Using the standalone module in another Knack app

### Browser usage

Include the file so it exposes:

```js
window.KnackBulkActions
window.createKnackBulkActions
```

Then create an app-specific instance:

```js
const bulk = window.createKnackBulkActions({
  resolveView(viewId) {
    const view = Knack.views[viewId];
    return view ? { action: view.model?.get('action') || view.model?.attributes?.action } : null;
  },
  gridActionRegistry: {
    async myAction({ recordIds, action, context }) {
      // app-specific bulk logic
    }
  },
  dataCallbackRegistry: {
    async myCallback(data, ctx) {
      return {
        ...data
      };
    }
  }
});
```

In practice, the usual pattern in another app is:

1. include `knack-bulk-actions.js`
2. instantiate `createKnackBulkActions(...)`
3. have that app's `processViewKeywords(view, keywords, data)` detect `_bulk_actions`
4. call your app-specific bulk integration from there

That is the same pattern used in this repository: `processViewKeywords(view, keywords, data)` detects `_bulk_actions` and then hands off to the bulk-action integration.

Example shape:

```js
function processViewKeywords(view, keywords, data) {
  if (keywords?._bulk_actions) {
    const bulkConfig = bulk.parseKeywordGroups(keywords);
    mountBulkActionsForView(view, bulkConfig, data);
  }
}
```

`parseKeywordGroups(...)` now accepts either:

- the raw keyword param groups array, or
- the `keywords` object you already receive in `processViewKeywords(view, keywords, data)`

The standalone basket store defaults to:

- `appId`: `Knack.application_id` when available
- `namespace`: `KNACK_BULK` unless you override it

### What works cross-app already

- keyword parsing (`parseKeywordGroups`)
- record label generation (`getRecordLabel`)
- basket/session persistence (`createBasketStore`)
- action execution state/failure tracking (`createActionRunner`)

### What is still app-specific

- opening the correct Knack form/modal
- collecting selected grid rows
- submitting follow-up Knack API create/update requests
- refreshing the correct grid/view after completion
- registering actions/callbacks for that app

So the short answer is:

- **Yes** — you would typically add it to another app and call it from that app's `processViewKeywords`.
- **No** — not completely "as is" unless that app also provides the small integration layer above.

---

## 1) Where to put the keyword

Add `_bulk_actions=...` to the **view description** area of the **grid/table view** where you want the bulk buttons.

You can declare multiple action “groups” in a single `_bulk_actions` keyword.

---

## 2) Required: label configuration

Every view that uses `_bulk_actions` must include a label group.

### Single-field label

```text
_bulk_actions=[label, field_1808], [Assign Task, view_1316]
```

### Multi-field label (concatenation)

Use multiple fields after `label`:

```text
_bulk_actions=[label, field_1859, field_1855], [Assign Task, view_1316]
```

Basket labels render like:

```text
<field_1859 value> - <field_1855 value>
```

Rules:
- Blanks are skipped.
- Connection fields are supported via the Knack `*_raw` value and use `identifier` first, then `id`.

---

## 3) Optional: set a default record-picker field for CREATE forms

Some bulk actions are **create-mode** forms (Knack form action = create). In create mode, the system needs to know which field on the create form receives the selected record id.

You can set a global default for the grid using a `record` group:

```text
_bulk_actions=[label, field_1808], [record, field_1234], [Create Something, view_9999, field_1234]
```

Notes:
- The `record` group is only used for create-mode forms.
- If you include `field_####` on the action itself, that overrides the `record` group.

---

## 4) Action types

There are two kinds of bulk actions:

1) **Form-based actions** (target is `view_####`)
2) **Non-form actions** (target is `action:<name>`)

---

## 4A) Form-based actions (update forms)

Use this when the form is an **update** form (Knack form action = update).

### Basic update action

```text
_bulk_actions=[label, field_1859, field_1855], [Assign Task, view_1316]
```

Behavior:
- The Basket opens.
- When you run “Assign Task”, you submit the form once.
- The submission is then replicated to the remaining basket records via API updates.

### Update action with a callback

Update-mode supports this syntax:

```text
_bulk_actions=[label, field_1859, field_1855], [Assign Task, view_1316, addAvailabilityToTask]
```

Important:
- In update-mode, the callback can be supplied as **param 3**.

---

## 4B) Form-based actions (create forms)

Use this when the form is a **create** form (Knack form action = create).

Create-mode requires the record-picker field.

### Create action with explicit record-picker field

```text
_bulk_actions=[label, field_1808], [Create Task, view_1232, field_1234]
```

### Create action using a shared default record-picker field

```text
_bulk_actions=[label, field_1808], [record, field_1234], [Create Task, view_1232]
```

### Create action with callback

```text
_bulk_actions=[label, field_1808], [Create Task, view_1232, field_1234, addAvailabilityToTask]
```

Important:
- In create-mode, param 3 must be `field_####`.
- The callback (if any) is param 4.

---

## 4C) Non-form actions (`action:<name>`)

Use this when you want a bulk button that **does not** open or submit a form.

Example:

```text
_bulk_actions=[label, field_1808], [Create Tasks, action:createTasks]
```

How it works:
- In the standalone module, the action name (here `createTasks`) is usually supplied through `gridActionRegistry`.
- You can also expose a global function with the same name and let the helper resolve it from the configured `globalScope`.

To add your own action:

```js
const bulk = createKnackBulkActions({
  gridActionRegistry: {
    async myActionName({ recordIds, action, context }) {
      // do something with recordIds
    }
  }
});
```

---

## 5) Callbacks (payload mutation)

Callbacks let you add/override fields in the API payload when the system replicates the first submission to the rest of the basket.

### Where callbacks live

Register callbacks in the standalone module via:

```js
createKnackBulkActions({
  dataCallbackRegistry: {
    async myCallback(data, ctx) {
      return data;
    }
  }
});
```

Or expose a global function with the callback name and let the helper resolve it from `globalScope`:

```js
window.myCallback = async function (data, ctx) {
  return data;
};
```

Example:

```js
const bulk = createKnackBulkActions({
  dataCallbackRegistry: {
    async myCallback(data, ctx) {
      return { field_1234: 'some value' };
    }
  }
});
```

### Callback signature

```js
(data, ctx) => ({} | Promise<{}>)
```

- `data`: the payload that will be sent to the API for this record.
- `ctx`: information about the bulk run.

Common `ctx` fields you can use:
- `mode`: `'create'` or `'update'`
- `sourceViewId`: the grid view where the basket came from
- `sourceRecord`: the original record object for the *target* basket item (when available)
- `processedId`: the record id that was submitted first
- `targetId`: the record id currently being replicated
- `index` / `total`: progress counters
- `record`: the submitted Knack record from the form submission

### Important behavior (update-mode)

If your callback computes a derived field that isn’t on the form (or is blank on the form), update-mode will:

- Apply the callback to the *remaining* basket records during replication, and
- Also apply the callback to the **first submitted record** using a post-submit API update.

This is how `addAvailabilityToTask` can populate `weeklyAvailability` even if that form field is empty.

---

## 6) Example: Assign Task + Weekly Availability callback

Your keyword:

```text
_bulk_actions=[label, field_1859, field_1855], [Assign Task, view_1316, addAvailabilityToTask]
```

What `addAvailabilityToTask` does:
- Reads `assignedTo` from the submitted record/payload.
- Reads `deadline` from the original grid record for each basket item (`ctx.sourceRecord`).
- Converts deadline → week number.
- Looks up Weekly Availability (employee + week).
- Adds that Weekly Availability record id to the task payload.

Error Task assign uses the same pattern:

```text
_bulk_actions=[label, field_2379, field_2359], [Assign Error Task, view_1673, addAvailabilityToErrorTask]
```

What `addAvailabilityToErrorTask` does:
- Reads Error Task `assignedTo` from the submitted record/payload.
- Reuses Error Task `cnxweeknum` when already present, otherwise derives week from `errorDeadline`.
- Looks up Weekly Team Availability (employee + week).
- Adds Error Task `weeklyAvailability` to the payload.

---

## 7) Troubleshooting

### “Nothing happens” / no buttons
- Ensure the view has a label group: `[label, field_####]`.
- Ensure your action group has at least 2 params.

### “Create action is skipped”
- Create-mode actions need a record-picker field:
  - either `[Button, view_####, field_####]`
  - or a global `[record, field_####]`

### Callback not running
- Ensure the callback exists in `dataCallbackRegistry.<name>` or as a matching global function name.
- Update-mode callback placement:
  - `[Button, view_####, callbackName]` is valid.
- Create-mode callback placement:
  - `[Button, view_####, field_####, callbackName]`.

### Basket selection feels “stale”
- Persisted baskets expire after `VOD.config.basketTtlMs`.
- While the basket modal is open, TTL does not apply.

---

## 8) Quick copy/paste templates

### Update form (no callback)
```text
_bulk_actions=[label, field_1111], [Update Something, view_2222]
```

### Update form (with callback)
```text
_bulk_actions=[label, field_1111], [Update Something, view_2222, myCallback]
```

### Create form (explicit record-picker)
```text
_bulk_actions=[label, field_1111], [Create Something, view_2222, field_3333]
```

### Create form (global record-picker + callback)
```text
_bulk_actions=[label, field_1111], [record, field_3333], [Create Something, view_2222, field_3333, myCallback]
```

### Non-form action
```text
_bulk_actions=[label, field_1111], [Do Something, action:myActionName]
```
