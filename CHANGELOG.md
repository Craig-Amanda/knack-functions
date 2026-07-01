# Changelog

## 2026-07-01

<!-- pr:76 fix/bulk-form-replication-guards - CSWinnall -->
- Bulk form replication now only includes visible writable form controls.
- Create and update replication now share the submit-event payload path for safer no-data and blank-field handling.

## 2026-06-30

<!-- pr:75 feature/add-uk-postcode-normaliser - CSWinnall -->
- add a reusable UK postcode normaliser to the shared Knack helper library
- expand the helper output with outcode, inward, unit, sectorCompact, and isFullPostcode

## 2026-06-19

<!-- pr:74 fix/multi-form-coordinator-destroy-cleanup - CSWinnall -->
- Fix multi-form coordinator teardown so coordinated submit cleanup no longer throws when a stored cleanup callback is registered

<!-- pr:73 feature/knack-functions-escape-html-helper - CSWinnall -->
- Add a shared HTML escaping helper for safe text interpolation in generated markup

## 2026-06-18

<!-- pr:72 Fix-updateOptions - amandajane-mo -->
- Fix updateOptions so it no longer overwrites existing input values

## 2026-06-12

<!-- pr:71 knack-functions/use-format-options - CSWinnall -->
- improved shared Knack choice option resolution to use `fieldMeta.format.options`
- prevented empty cached choice option arrays from masking later-available metadata
- kept the change limited to `knackFunctions.js` without generated artifact updates, per repo instructions

## 2026-06-11

<!-- pr:69 normaliseViewMap - CSWinnall -->
- Add `normaliseViewMap` helper to `knackNavigator` to normalise configured view maps and return the first valid view id for each key.

<!-- pr:68 feat/knack-functions-changes-2026-06-11 - CSWinnall -->
- Added: `getFieldChoiceOptions(fieldKey)` helper that returns ordered, deduplicated choice labels from field metadata.
- Exposed: helper on public `api` and `KnackBulkActions` (bindings added in `knackFunctions.js`).
- Fix: `updateOptions` now sets `data-placeholder` on the `<select>`, updates any placeholder `<option>`, updates Chosen visible display (single and multi), and retries briefly to handle Chosen initialization.
- Refactor: enable listeners for add-option button now remove themselves after first interaction; one-time `mousedown` handler simplified; JSDoc added.

## 2026-06-05

<!-- pr:67 Fix-Update-Button-Colour - amandajane-mo -->
- Fix Update Button Colour

## 2026-06-04

<!-- pr:66 copilot/knack-functions-2026-06-03 - CSWinnall -->
- Bulk action form replication can now run a configured success callback after submitted or replicated records complete.
- Success callback failures are surfaced through the bulk action error reporting path without blocking the main replication flow.
- Connection reference resolution now uses the Knack record `id` value consistently for connection ids and metadata.

<!-- pr:65 Fix-hasValue-for-connection-selects-in-hide-required-fields - amandajane-mo -->
- fixed bug with initialiseConditionalRequiredFieldVisibility

## 2026-05-28

<!-- pr:64 copilot/refresh-hold-events - CSWinnall -->
- add shared refresh hold and release controls to the version refresh controller
- support global hold and release events so app code can defer forced reloads around async work
- keep the targeted event contract strict with detail.holdId, with detail.all available for release-all cleanup

<!-- pr:63 fix/multi-form-submit-coordinator-close - CSWinnall -->
- Improve `MultiFormSubmissionCoordinator` so it only auto-submits managed views that are active in the current rendered flow, allowing the same coordinator to handle standalone and coordinated submit paths.
- Wait for the manual form's confirmed submit outcome before settling and use the shared modal close helper so configured modal closes fire reliably after successful coordinated submits.

## 2026-05-25

<!-- pr:62 feat/scene-trail-navigation - CSWinnall -->
- Add scene trail helpers to Knack navigator

## 2026-05-18

<!-- pr:61 Fix/multi-form-submit-lifecycle-hooks - CSWinnall -->
- Added lifecycle callbacks to MultiFormSubmissionCoordinator so apps can hook into coordinated submit start, completion, failure, and settled states.

## 2026-05-15

<!-- pr:60 Update-updateDateFields - amandajane-mo -->
- Update updateDateFields

## 2026-05-14

<!-- pr:59 feature/gap-menu-button-filters - CSWinnall -->
- Added support for explicit rule keys and custom trigger-to-rule mapping.
- Enabled ^GpplyMenuLinkFilters for non-anchor controls while preserving active-state handling.
- Needed by GAP-Track Jobs Issued Works Status pills.

## 2026-05-07

<!-- pr:58 feature/shared-version-refresh-controller - CSWinnall -->
- Added a reusable version refresh controller to knack-functions for iframe-driven app version sync and safe deferred refresh.
- Added shared version indicator rendering and controller helpers for cached record handling, target-version lookup, and refresh-state management.
- Simplified Spot integration by moving generic version-control behaviour into shared library code.

## 2026-05-06

<!-- pr:57 fix/bulk-action-selectable-rows - CSWinnall -->
- add a reusable conditional required-field visibility helper for Knack forms in `knackFunctions.js`
- detect required fields from Knack view metadata, rendered required markers, and required form controls
- hide empty required fields while preserving restore state for display and disabled controls
- reapply visibility rules on delegated form input events and before submit
- support configuration hooks for enablement checks, value detection, visibility target resolution, excluded fields, and event wiring

<!-- pr:56 hasRecordValue - amandajane-mo -->
- Added recordHasValue(), a shared Knack record helper that checks whether a raw or formatted record field value contains meaningful data across strings, arrays, objects, dates, booleans, and numbers.

## 2026-05-05

<!-- pr:55 Fix/bulk-action-selectable-rows - CSWinnall -->
- Excluded summary, subtotal, aggregate, grouped, and no-data grid rows from bulk-action row selection helpers.
- Removed bulk-action checkboxes from non-record rows before syncing checkbox state and basket contents.
- Updated bulk-action selected-ID and master-checkbox calculations to operate only on selectable record rows.

<!-- pr:54 update-date-handling-on-RIT - amandajane-mo -->
- Update date handling on RIT

## 2026-04-28

<!-- pr:53 Fix/zero-field-bulk-update-payload - CSWinnall -->
- Fix zero-field bulk update replication

## 2026-04-23

<!-- pr:51 feat/add-raw-fiel-map - CSWinnall -->
- add `normalizeRawFieldMap(fieldMap)` to `KnackNavigator`
- return a field map with each field id converted to its `_raw` companion key using the existing raw-field normalisation logic
- support app code that wants to pre-normalise raw field maps once at the boundary instead of repeating per-field `_raw` conversion

## 2026-04-21

<!-- pr:50 Updates-to-Knack-Navigator-and-fix-for-bulk-actions-bug - CSWinnall -->
- Added shared view-column index and selector helpers so apps can target table columns reliably, including columns affected by runtime DOM changes. Fixed bulk actions for update forms that rely on Knack record rules instead of visible form inputs. Added automatic rule-driven payload generation for bulk action update forms, including support for record-copy, current user, current date, and literal rule values. Prevented bulk form replication from failing when an update form has no visible editable fields but can still be resolved from form metadata and record rules.

## 2026-04-20

<!-- pr:49 feat/viewCachesForHeaders&Widths - CSWinnall -->
- feat: add view column metadata resolution and caching methods

## 2026-04-15

<!-- pr:48 add-clear-button-to-irt - CSWinnall -->
- Added optional clear button support to `renderInteractiveTable`, with configurable button text and CSS classes, rendered in a right-aligned toolbar above the table.
- Added `onClear` and `controller.clear()` support so apps can clear interactive table rows from either the UI or code and run follow-up logic after the table is reset.
- Added configurable clear confirmation support with `confirmOnClear` and `clearConfirmMessage`, defaulting to a confirmation step before rows are cleared.
- Updated the clear confirmation flow to use the shared `showConfirmationDialog` helper instead of the browser confirm dialog.
- Improved `showConfirmationDialog` so unstyled calls render as a centred modal overlay by default instead of appearing as unstyled page content.
- Documented the interactive table clear-button and clear-confirmation configuration in the interactive table wiki.

## 2026-04-10

<!-- pr:47 Updates-to-Knack-API-and-and-confirmation-dialog-on-submit - CSWinnall -->
- Adds API usage tracking and rate-limit inspection tools

## 2026-04-02

<!-- pr:46 Updates-to-irt - CSWinnall -->
- Improves child record retrieval and connection ID extraction

## 2026-03-30

<!-- pr:45 fix-changelog - amandajane-mo -->
- Changelog Fixed the build-and-tag workflow so generated changelog and dist commits push cleanly to main, only falling back to a rebase with autostash if the branch moved underneath the workflow run.
- Updated the changelog workflow to prefer ## Changelog over ## Summary when reading merged PR descriptions.
- Fixed changelog parsing so paragraph-style text under ## Changelog is preserved as multiple entries instead of only keeping the first paragraph.
- Updated changelog markers to include the PR number, branch name, and author while keeping visible changelog bullets free of repeated author suffixes.
- Corrected the PR 44 changelog entry so it captures the full shipped changes from PRs 43 and 44.

<!-- pr:44 Fix-build-and-tag - amandajane-mo -->
- Added a pull request template with Summary, Changelog, and Testing sections, and updated the merge workflow to copy reviewed PR changelog text into `CHANGELOG.md` instead of relying on in-branch changelog edits.
- Fixed the build-and-tag workflow so generated changelog and dist commits push cleanly to `main`, only falling back to a rebase with autostash if the branch moved underneath the workflow run.
- Updated interactive tables so column headers can render trusted HTML for custom labels, tooltips, and directional indicators instead of forcing escaped plain text.
- Documented the shared interactive table helper with usage examples, configuration options, editable rules, date and select behaviour, and auto-append row support.
- Improved multi-form submission handling so `MultiFormSubmissionCoordinator` treats `knack-form-submit` as the primary success signal, which prevents false timeouts when a form submits successfully without leaving a persistent success message in the DOM.
- Kept the existing DOM-based success, error, and invalid-input checks as fallback outcome detection for multi-form submission monitoring.
- Added a fallback global `errorHandler` so apps that do not configure one still log the original error context instead of throwing a secondary `ReferenceError` during form submission failures.
- Added `fadeFormConfirmation`, which fades and removes Knack form confirmation messages after a configurable delay without requiring extra app-specific CSS.
- Improved `_rtp` popup redirect handling so modal views can redirect on submit or close, support `_rtp=false` to disable close redirects, and support `scene_1234` exclusions when a specific scene should suppress the redirect.
