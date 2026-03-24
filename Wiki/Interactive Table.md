# Interactive Table

This note explains the shared `renderInteractiveTable` helper in `knack-functions`.

The helper renders an editable table into a Knack view, keeps an internal row state, and optionally provides a manual submit action.

## What the helper does

`renderInteractiveTable` is designed for cases where Spot or another app needs to:

- render rows from existing data
- allow inline editing in a table layout
- support mixed field types such as text, date, number, select, and checkbox
- react to changes without building a full custom grid from scratch
- optionally submit the edited rows through app-specific logic

The helper only handles table rendering and editing behaviour. It does not know how your app should save data unless you provide that in `onSubmit`.

## Basic usage

```javascript
const tableController = renderInteractiveTable({
    viewId: 'view_2214',
    rows: [
        { name: 'Alpha', startDate: '01/03/2027', active: true },
        { name: 'Bravo', startDate: '15/03/2027', active: false },
    ],
    columns: [
        {
            key: 'name',
            header: 'Name',
            type: 'text',
            editable: true,
        },
        {
            key: 'startDate',
            header: 'Start Date',
            type: 'date',
            editable: true,
            inputClassName: 'custom-date-input',
        },
        {
            key: 'active',
            header: 'Active',
            type: 'checkbox',
            editable: true,
            align: 'center',
        },
    ],
    onChange: function (change) {
        console.log('Cell changed:', change);
    },
});
```

## Configuration options

The main options are:

- `viewId`: target Knack view element id
- `containerSelector`: optional mount point inside the view
- `tableClassName`: extra classes added to the default table classes
- `dateLocale`: `'uk'` or `'us'` for date parsing and display
- `saveMode`: `'manual'`, `'none'`, or `'auto'`
- `saveButtonText`: label for the manual submit button
- `saveButtonClassName`: extra classes for the submit button
- `rows`: array of row objects or row arrays
- `columns`: column definitions
- `onChange`: callback after a cell value changes
- `onSubmit`: callback used when manual submit is triggered
- `onRenderComplete`: callback after the first render

## Column configuration

Each column can define:

- `key`: property name in the row object
- `header`: displayed column heading
- `type`: `text`, `date`, `number`, `select`, or `checkbox`
- `editable`: boolean or function
- `options`: for select columns, either an array, a function, or an async function
- `className`: extra classes for the cell
- `inputClassName`: extra classes for the editor input
- `align`: `left`, `center`, or `right`
- `maxWidth`: optional maximum width for header and cells
- `allowHtml`: allow `display` output to render as HTML
- `display`: custom display formatter
- `parse`: custom input parser
- `openDateHintKey`: row key used to tell the datepicker which month/year to open on
- `minDate` and `maxDate`: optional date bounds
- `dateFormat`: optional datepicker format override

## Editable rules

`editable` can be either a simple boolean or a function.

When it is a function, the helper calls it like this:

```javascript
editable: function (row, rowIndex, rowsData) {
    return row.status !== 'Locked';
}
```

This is useful when editability depends on the current row values.

Example:

```javascript
{
    key: 'engFrom',
    header: 'Eng From',
    type: 'date',
    editable: function (row) {
        return row.appliesTo === 'GB-ALL' || row.appliesTo === 'GB-ENG';
    },
}
```

## Date behaviour

Date columns support:

- UK locale by default
- optional US locale
- datepicker integration when jQuery UI datepicker is available
- native `input[type=date]` fallback when it is not
- optional open-date hints so the picker opens on a relevant month/year

If your app uses slash-formatted dates and you want US interpretation, set:

```javascript
dateLocale: 'us'
```

## Select columns

Select options can be provided in three ways:

- a static array
- a sync function
- an async function

Example with static options:

```javascript
{
    key: 'status',
    header: 'Status',
    type: 'select',
    editable: true,
    options: [
        { label: 'Draft', value: 'Draft' },
        { label: 'Live', value: 'Live' },
    ],
}
```

Example with async options:

```javascript
{
    key: 'category',
    header: 'Category',
    type: 'select',
    editable: true,
    options: async function () {
        const records = await someApiCall();
        return records.map(function (record) {
            return {
                label: record.name,
                value: record.id,
            };
        });
    },
}
```

Select options are fetched once per column and cached for the current table instance.

## Manual submit mode

The helper now defaults to manual save mode.

That means a submit button is rendered unless you explicitly turn it off.

Example:

```javascript
const tableController = renderInteractiveTable({
    viewId: 'view_2214',
    saveMode: 'manual',
    saveButtonText: 'Create Records',
    rows,
    columns,
    onSubmit: async function ({ data, controller, viewId, host }) {
        console.log('Rows to save:', data);
        await someAppSpecificSaveFunction(data);
    },
});
```

Important: the helper does not decide what to save or where to save it. That stays in the consuming app.

## Where app-specific logic should live

Keep app-specific rules outside the helper whenever possible.

Examples of app-specific logic that should stay in the consuming app:

- which rows are valid
- which fields are required
- how a save payload is built
- which defaults should be added during submit
- which API view or endpoint should be used
- what success or error message should be shown

This keeps `renderInteractiveTable` reusable across apps.

## Controller API

The helper returns a controller with these methods:

- `getData()`
- `setData(nextRows)`
- `updateCell(rowIndex, columnKeyOrIndex, value, options)`
- `submit()`
- `destroy()`

Example:

```javascript
const currentRows = tableController.getData();

tableController.updateCell(0, 'status', 'Live');

await tableController.submit();
```

## Data flow

Internally, the helper stores its editable row state in its own internal row array.

In practice, consumers usually work with that state through:

- `change.data` inside `onChange`
- `controller.getData()` when they need the full current table snapshot

This means validation and submit logic should usually work from row data, not by reading the DOM.

## Example: app-side validation before submit

```javascript
const getMissingRows = function (dataRows) {
    return dataRows.filter(function (row) {
        return !String(row.startDate || '').trim();
    });
};

renderInteractiveTable({
    viewId: 'view_2214',
    saveMode: 'manual',
    rows,
    columns,
    onSubmit: async function ({ data }) {
        const missingRows = getMissingRows(data);
        if (missingRows.length) {
            throw new Error('Please complete all required dates before saving.');
        }

        await saveRows(data);
    },
});
```

## Styling notes

The helper applies default table classes:

- `kn-table`
- `knTable`
- `is-bordered`
- `is-striped`

Editable cells also receive:

- `kfInteractiveTable__cell`
- `is-editable`
- `ktlInlineEditableCellsStyle`

Editor inputs receive inline width styles by default, so if you need a fixed width for a specific editor class, you may need a CSS rule using `!important`.

## In summary

- `renderInteractiveTable` is a shared helper for editable inline tables in Knack views.
- It handles rendering, editor types, and row state management.
- It supports manual submit, async select options, and locale-aware dates.
- Validation and persistence rules should usually stay in the consuming app.
- Use the returned controller when you need to inspect, update, submit, or destroy the table programmatically.