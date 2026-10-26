# GitHub update channel

TheBarcode Lite checks its existing Beyond Raw Data release manifests first and then checks the public fallback manifest at:

`https://raw.githubusercontent.com/CarlvinJerry/TheBarCode/release/release/latest.json`

The `release` branch is the public update channel. Its `release/latest.json` file contains the current version, installer URL, SHA-256 checksum and a short change summary. The installer itself is published as a GitHub Release asset, not committed into the repository. The workflow in `.github/workflows/release-lite.yml` builds and publishes this automatically when release code is pushed to the `release` branch.

## Publishing an update

1. Bump `VERSION` to a new `MAJOR.MINOR.PATCH` value and update `release/summary.txt` with a brief user-facing description.
2. Push the code and version change to the `release` branch.
3. GitHub Actions validates the version, builds the Windows Lite installer, publishes a GitHub Release with the installer and checksum, and updates `release/latest.json` on the public branch.
4. Connected installations check after the Owner signs in and when internet returns. The Owner sees the summary and approves installation.

The repository and release assets must remain public for anonymous update checks and downloads. GitHub Actions uses its temporary repository-scoped `GITHUB_TOKEN` to publish. The installed app contains no GitHub token or other publishing credential. Before installation, the Windows desktop app verifies the SHA-256 checksum and backs up the local SQLite database.

The Google Drive folder remains a human-facing manual download option; the app does not try to parse a Drive folder page as update metadata.
