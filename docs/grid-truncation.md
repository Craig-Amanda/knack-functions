# Expandable grid text

Spot's custom keyword handler supports `_trunk` in a table view's keyword configuration:

```text
_trunk=[field_1234]
_trunk=[field_1234,150]
_trunk=[field_1234],[field_5678,150]
```

Each bracket group contains one field ID and an optional positive whole-number character limit. The default is **75**. Repeated keyword entries are supported; the last valid setting for a field wins. Invalid groups are ignored, and KTL role options are honoured. Do not apply KTL `_trk` to these same columns, since its clipping styles can also clip expanded content.

The preview preserves basic formatting, including bold text, line breaks and clickable links. Link destinations and navigation attributes (including target and rel) are retained, so visible park names can be opened without expanding the cell. It counts Unicode graphemes (so emoji are not split) and separators between blocks; HTML tags are excluded. The ellipsis and toggle label are outside the limit. The cutoff is a character limit and can occur within a word or link label. Short and empty values are unchanged. Cells containing editing widgets or media are left alone.

The keyboard-accessible **View more / View less** button changes only the display. The original content nodes and their attached handlers are retained. Preview copies omit IDs, classes and Knack connection attributes to avoid duplicate identifiers or connection lookups.

## Direct calls

Existing calls keep their one-shot behaviour and support numeric IDs, individual fields and arrays:

```js
truncateColumnsInGrid(viewId, {150: [1234, 5678], 250: 9012});
```

Opt in to a scoped observer when later JavaScript changes should refresh the preview:

```js
const controller = truncateColumnsInGrid(viewId, {75: ['field_1234']}, {observe: true});
controller.refresh();    // Optional explicit refresh.
controller.disconnect(); // Stop observation, retaining the displayed content.
```

Repeated calls merge field settings for the same rendered view and do not nest controls. Once observation is enabled, further calls keep it enabled until disconnected. The observer handles text changes, HTML replacement, added rows and table replacement inside the view. It ignores toggle/preview mutations and disconnects on view or scene removal. A newly rendered view root needs the usual keyword hook again.

Other apps can enable the keyword in their existing `processViewKeywords` handler:

```js
keywords._trunk && truncateColumnsInGrid.fromKeywords(view, keywords);
```

## JavaScript content updates

Keep the existing Knack `.col-N` content wrapper and replace its contents as usual; the observer rebuilds the preview after that write. It also handles replacement of the entire cell content, or changes within `.trunk-full`. Updates to existing full content preserve expansion; replacing all content resets to collapsed.

When reading an enhanced cell, read `.trunk-full` if present, otherwise the original column wrapper. Reading the entire cell's `textContent` includes the preview and button. Selectors such as `[data-kn="connection-value"]` still match only original nodes. Do not edit `.trunk-preview`, which is disposable presentation content. Attributes alone (e.g. class or style changes) do not trigger a refresh; call `controller.refresh()` if needed.

Spot's availability formatter already replaces its column wrapper contents asynchronously, so the observer handles those writes without adding app-specific logic to the shared helper. Before the asynchronous formatter completes, the initial Knack content can briefly appear as a preview.

The source configuration currently maps Spot's availability display to `field_1276`. To enable the default on `view_1054`, add `_trunk=[field_1276]` to that view's keyword configuration after deploying both the shared library and Spot handler. This mapping comes from local source and has not been verified against the live Builder in this change.

Powderpigs Brain defines its own local `truncateColumnsInGrid`; changing the shared implementation does not replace that local copy.

## Validation

Run the focused browser tests from the workspace (requires Playwright and its Chromium browser):

```sh
node --test knack-functions/tests/truncateColumnsInGrid.test.cjs
```
