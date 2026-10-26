# GitHub update channel

TheBarcode Lite checks its existing Beyond Raw Data release manifests first and then checks the public fallback manifest at:

`https://raw.githubusercontent.com/CarlvinJerry/TheBarCode/release/release/latest.json`

Work on `develop`. A push there starts the release workflow. After it successfully builds and publishes the installer, it merges that exact source revision into the public `release` branch and updates `release/latest.json` there. The `release` branch is the app's update channel and carries the current release source and manifest. The installer itself is published as a GitHub Release asset, not committed into the repository.

## Publishing an update

Push code to `develop`. No version or release-summary edit is needed. GitHub Actions increments the patch from the latest published version, builds the installer with that generated version, publishes a GitHub Release, and writes the generated version and update manifest to `release`. The summary is generated from the pushed commit messages. The `develop` branch remains your working branch; version generation does not push a commit back to it.

Connected installations check after the Owner signs in and when internet returns. The Owner sees the summary and approves installation.

The repository and release assets must remain public for anonymous update checks and downloads. GitHub Actions uses its temporary repository-scoped `GITHUB_TOKEN` to publish. The installed app contains no GitHub token or other publishing credential. Before installation, the Windows desktop app verifies the SHA-256 checksum and backs up the local SQLite database.

The Google Drive folder remains a human-facing manual download option; the app does not try to parse a Drive folder page as update metadata.
