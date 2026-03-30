# Changelog

## 2026-03-30

<!-- pr:44 -->
- Added a pull request template with Summary, Changelog, and Testing sections, and updated the merge workflow to copy the reviewed Changelog text from merged PRs into CHANGELOG.md instead of relying on in-branch changelog edits. (by @amandajane-mo)

- MultiFormSubmissionCoordinator now treats Knack's `knack-form-submit` event as a successful auto-form outcome, which prevents false timeouts when a form submits without leaving a persistent success message in the DOM.
- Kept the existing DOM-based success, error, and invalid-input checks as fallback outcome detection.
- Added a console fallback for `errorHandler` so apps without a configured handler still log the original error context instead of throwing a `ReferenceError`.
