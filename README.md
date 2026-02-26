# sapi

SAP Public API Search

Node.js app that serves a webpage and stores SAP API artifact metadata in a local file cache.

## Features

- Node.js backend endpoint:
  - `/api/artifacts`
- Node.js sync endpoint:
  - `POST /api/sync`
- Local data cache file:
  - `S4PCE.json`
- Backend proxy target:
  - `https://api.sap.com/api/1.0/container/SAPS4HANACloudPrivateEdition/artifacts?containerType=product&$filter=Type%20eq%20%27API%27%20or%20Type%20eq%20%27PolicyTemplate%27`
- Displays records in a table view
- Global search across all table columns
- Highlights matching text inside each cell
- Shows only matching rows while filtering
- Client-side sorting by clicking table headers
- `Sync` button refreshes data from `api.sap.com` and overwrites `S4PCE.json`
- If `S4PCE.json` is empty on startup, sync starts automatically in the background

## Run

1. Ensure Node.js 18+ is installed.
2. Start the app:
   - `npm start`
3. Open:
   - `http://localhost:5000`

The frontend reads from same-origin `/api/artifacts`, which serves data from `S4PCE.json`.
