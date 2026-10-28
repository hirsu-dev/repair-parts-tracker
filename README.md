# Benchbook: Repair Log and Parts Tracker

Keep builds, repairs, wiring notes and parts together. [Open the browser app](https://hirsu-dev.github.io/repair-parts-tracker/).

Create a build, add inventory, then record a repair, test or note. A part-use entry consumes stock and snapshots its name and integer-cent unit value. Later name/value edits and archived notes do not rewrite that history. Returns and restocks are explicit stock adjustments with a date and reason.

## Features

- Build descriptions and active/paused/complete status.
- Parts cabinet with stock, unit values, notes, retirement and restoration.
- Repair/test/note entries with outcomes, wiring notes and optional HTTPS reference links.
- Search and filters for project, text, outcome and archived records.
- Per-build assigned parts value, calculated from recorded usage snapshots.
- IndexedDB transactions, complete JSON backups and validated backup restoration.

All values are in USD; there is no currency conversion or receipt/accounting model. Assigned parts value is an estimate based on entered values, not proof of money spent. Each new entry can attach one inventory part type in this first release. Add another entry to record another part.

Archiving hides a note but does not put consumed parts back on a shelf. Record a positive adjustment when a physical part is returned. Retiring a part hides it from new usage selection while preserving its history. There is no automatic hardware connection or claim that a logged test actually happened.

## Data and backups

Records stay in IndexedDB on this browser and origin. Writes read the latest workspace and commit atomically; a failed stock validation rolls the transaction back. No account, upload, external service, telemetry or API key is required. Optional reference links contact their destination only when clicked.

Export a backup before clearing browser data or restoring a different workspace. Restore validates IDs, references, quantities and nonnegative stock before replacing this app's workspace. A temporary in-memory session is offered when storage cannot open, with an explicit export reminder. Do not treat browser storage as your only backup.

First-release limits: 100 builds, 500 part types, 2,000 entries, 10,000 stock adjustments, and 20 MB backup files. Images are not stored; use wiring text or a reference link. The app needs its static files to load; offline caching is not included here.

## Run and check

```powershell
npm ci
npm run check
python -m http.server 8147 --bind 127.0.0.1 --directory web
```

Open `http://127.0.0.1:8147`. Node.js 22+ is used for development checks only. The app has no runtime npm dependency.

Checks cover stock consumption, preserved snapshots, rejected overspending, concurrent IndexedDB transactions, rollback and the real project/part/log form workflow. Visual browser QA was unavailable for the release; inspect the responsive interface on your intended devices.

`web/model.js` contains ledger rules and validation. `web/store.js` owns transactional storage and the memory fallback. `web/app.js` renders and operates the workspace. GitHub Actions checks the code and publishes only `web` to free GitHub Pages.

Built by [hirsu](https://hirsu-dev.github.io/) from the Robo Telescope repair and custom-electronics projects. The app starts empty so that fictional records are never mistaken for actual build history.
