# Changelog

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
