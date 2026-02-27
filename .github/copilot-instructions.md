# Copilot Instructions for knack-functions

## Project purpose
- This repository ships shared browser-side utility functions for Knack apps in `knackFunctions.js`.
- `assetLoader.js` controls local/CDN loading behavior and developer toggles.
- `server.js` and `simple-server.js` are local development servers.

## Preferred workflow
1. Keep changes focused and minimal.
2. Preserve browser compatibility for Knack runtime usage.
3. For local development, use:
   - `npm run dev` (Express server with watcher), or
   - `npm run simple` (minimal Node HTTP server).
4. For production artifact updates, run `npm run build` to regenerate:
   - `dist/knackFunctions.global.js`
   - `dist/knackFunctions.global.min.js`

## Coding style expectations
- Use plain JavaScript (ES modules where already used).
- Follow existing naming and function structure; avoid large refactors.
- Avoid introducing new dependencies unless required.
- Do not remove existing public utility functions without explicit request.

## Validation checklist for Copilot-generated changes
- Ensure local server endpoints still work (`/`, `/knackFunctions.js`, `/test`, `/test.html`).
- Keep no-cache behavior intact for local script serving.
- Confirm build command still produces minified bundle.
- Avoid changing production version pinning logic in `assetLoader.js` unless requested.
