# @sapdev.eu/sapi

A lightweight SAP API search for:

- **S/4HANA Private Cloud Edition** (PCE)
- **S/4HANA Public Cloud**

*Push the Sync button only after SAP released a new S/4HANA version, means in February and August for public and for private in December. Pushing that more is completely unnecessary. Do it just in case you want SAP Firewallls block You :D.*

## What you get

- Fast searchable and sortable API artifact table
- Filter by protocol
- Deprecated indicator
- Version
  Link to launch api.sap.com for more details (requires logon)
- API Package Assigment Name (SOD2)
- Dark / light theme toggle

# What you don't get

Versionining by S/4HANA Feature Pack

## Requirements

- Node.js `18+`

## Installation

1. Start directly from npm (recommended):
   - `npx @sapdev.eu/sapi`
2. Open:
   - `http://localhost:5000`

Alternative (global install):

1. Install globally:
   - `npm i -g @sapdev.eu/sapi`
2. Start app:
   - `sapi`
   - `sapdev-sapi`

### Custom port options

- `npx @sapdev.eu/sapi --port <port_number>`
- `npx @sapdev.eu/sapi -p <port_number>`
- `npx @sapdev.eu/sapi --port=<port_number>`
- `sapi --port <port_number>`
- `sapi -p <port_number>`
- `sapi --port=<port_number>`
- `sapdev-sapi --port <port_number>`
- `sapdev-sapi -p <port_number>`
- `sapdev-sapi --port=<port_number>`

Environment variable alternatives (not tested):

- Linux/macOS: `PORT=<port_number> npx @sapdev.eu/sapi`
- PowerShell: `$env:PORT=<port_number>; npx @sapdev.eu/sapi`
- Linux/macOS (global): `PORT=<port_number> sapi`
- PowerShell (global): `$env:PORT=<port_number>; sapi`
- Linux/macOS (global alias): `PORT=<port_number> sapdev-sapi`
- PowerShell (global alias): `$env:PORT=<port_number>; sapdev-sapi`

Note: with npm, globally installed package binaries cannot be named with `/`, so global install command is `sapi`. If you want to run with the scoped name, use `npx @sapdev.eu/sapi`.

This package also provides a global alias: `sapdev-sapi`.

## Troubleshooting

- **`EADDRINUSE` on port 5000**

  - Start on another port: `npx @sapdev.eu/sapi --port 8080`
