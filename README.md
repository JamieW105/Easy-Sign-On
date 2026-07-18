# Easy Sign On

Easy Sign On is a self-hosted, touch-friendly race-day sign-on and sign-off kiosk for sailing clubs. It reads the season's Sailwave `.blw` file, records activity in a persistent host folder, and can be branded from **RO Manage** at `/ro-manage`.

## Prerequisites

The production instructions below are for Ubuntu 22.04 or newer (or another Linux server supported by Docker). Install:

- Docker Engine, including the `docker compose` plugin.
- A user allowed to run Docker commands (normally a member of the `docker` group).
- The season's Sailwave `.blw` file copied to an absolute location on the server.

For development, install Node.js 22 or newer and npm. Docker Desktop with Compose is needed to create a release image on Windows or macOS.

## Server setup

1. Download a release's `easy-sign-on-latest.tar` and `compose.yaml` into one empty folder on the server, for example `/opt/easy-sign-on`.
2. In that folder, create `.env` from the example below. All paths are absolute paths from the server root.

   ```env
   EASY_SIGN_ON_SEASON_SAILWAVE_FILE=/opt/easy-sign-on/seasonal.blw
   EASY_SIGN_ON_DATA_DIR=/opt/easy-sign-on/data
   EASY_SIGN_ON_PORT=9222
   EASY_SIGN_ON_TIMEZONE=Pacific/Auckland
   EASY_SIGN_ON_OPEN_TIME=11:00
   EASY_SIGN_ON_CLOSE_TIME=12:30
   ```

3. Load the release image, then start the sole Compose file:

   ```bash
   docker load --input easy-sign-on-latest.tar
   docker compose up -d
   ```

4. Open `http://SERVER_ADDRESS:9222`. Visit `/ro-manage` to set the club name, favicon, the mounted season Sailwave path, and language preference.

`compose.yaml` is the only deployment configuration file. It mounts the season file read-only and keeps records, club settings, and the uploaded icon in `EASY_SIGN_ON_DATA_DIR`.

To update later, replace the two release files, repeat `docker load --input easy-sign-on-latest.tar`, then run `docker compose up -d` again.

## Club settings

The **Club settings** panel in `/ro-manage` provides:

- Club name, used throughout the kiosk and page metadata.
- A PNG, JPEG, WebP, SVG, or ICO favicon up to 512 KB.
- The mounted season Sailwave `.blw` path used by the app. Set the host/server-root file location in `.env` and restart Compose after changing it; Docker mounts that file at `/seasonal/seasonal.blw` inside the app.
- Language selection: English (default), Spanish, French, German, Russian, Ukrainian, Chinese (Simplified Mandarin), and Chinese (Cantonese).

Settings are saved under the configured app-data folder, so they survive image upgrades.

## Development

Copy `.env.example` to `.env`, change the three required server-root paths for your machine, then run:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Checks and release bundle

```bash
npm run lint
npm run typecheck
npm run build
npm run build:d-img
```

`npm run build:d-img` produces these files in `docker-images/`:

- `easy-sign-on-latest.tar`
- `compose.yaml`

The GitHub workflow runs this release build when a pull request from `open-sourced` is merged into `open-sourced-l`. It creates a release in `JamieW105/Easy-Sign-On` with the pull request title and uploads those two files before pushing the merged source to that repository's `main` branch. Add an `EASY_SIGN_ON_DEPLOY_TOKEN` repository secret in this source repository: it must be a fine-grained GitHub token with **Contents: Read and write** access to `JamieW105/Easy-Sign-On`.

Create release pull requests with `open-sourced` as the source branch and `open-sourced-l` as the target branch.
