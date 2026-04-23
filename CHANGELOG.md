# Changelog

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
