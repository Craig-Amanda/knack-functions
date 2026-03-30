# Changelog

## 2026-03-30

- MultiFormSubmissionCoordinator now treats Knack's `knack-form-submit` event as a successful auto-form outcome, which prevents false timeouts when a form submits without leaving a persistent success message in the DOM.
- Kept the existing DOM-based success, error, and invalid-input checks as fallback outcome detection.
- Added a console fallback for `errorHandler` so apps without a configured handler still log the original error context instead of throwing a `ReferenceError`.