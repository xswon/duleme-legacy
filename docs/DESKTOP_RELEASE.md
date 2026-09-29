# Desktop release

## V1 release target

- Product: 读了么
- Version: 0.1.0-beta.2
- Desktop runtime: Electron 44.4.3
- Primary target: macOS DMG (arm64 + x64)
- Data: local IndexedDB
- Source repository: public `xswon/duleme`
- Binary distribution: GitHub Releases in `xswon/duleme`
- Apple signing/notarization: deferred

## Release permissions

The public repository publishes tagged Desktop releases with the workflow-scoped GitHub
token. No cross-repository personal access token is required. Only the publish job receives
`contents: write`; build and CI jobs remain read-only.

## Release flow

1. Merge the Desktop V1 changes to `main`.
2. Confirm CI is green, including storage/backup tests and the desktop main-process bundle.
3. Run the Desktop Release workflow manually once to verify the unsigned macOS build.
4. Test the generated arm64/x64 DMG artifact on a clean Mac.
5. Create and push a version tag, for example `v0.1.0-beta.2`.
6. The Desktop Release workflow builds both unsigned DMGs and publishes them to the
   same public `xswon/duleme` repository.

## Unsigned macOS behavior

Desktop V1 intentionally has no Apple Developer ID signature or notarization.

On first launch, macOS may block the app. The user should:

1. try opening 读了么 once;
2. open **System Settings → Privacy & Security**;
3. find the blocked app notice and choose **Open Anyway**;
4. confirm **Open**.

Do not instruct ordinary users to run Terminal commands such as `xattr`.

When the project later joins the paid Apple Developer Program, signing/notarization can
be re-enabled without changing the local-first application architecture.

## Backup/restore regression

The existing storage test suite is the V1 compatibility gate. It covers:

- checksummed version-1 backup export and restore;
- AI secret exclusion from backup files;
- same-endpoint secret preservation and different-endpoint secret clearing;
- dedicated audio progress backup and restore;
- legacy version-1 audio progress restoration.

Do not bump the backup format for Desktop V1 unless the stored schema actually changes.

## Release downloads

Tagged releases are published directly from the public source repository. This keeps source,
CI, issues, and versioned binaries in one place and removes the need for a cross-repository
release token.


## Clean-machine beta acceptance

Before publishing a new beta, validate both Apple Silicon and Intel builds on Macs that do not have the source checkout or development dependencies installed.

Automated CI mounts the native DMG on a fresh GitHub-hosted macOS runner and launches the packaged app with `--smoke-test`. The smoke test starts the packaged loopback server, loads `/api/health`, and exits successfully. CI also builds both arm64 and x64 DMGs so packaging regressions fail before merge.

The final human acceptance pass should cover each architecture at least once:

1. Download the DMG from the release artifact or public prerelease and verify its SHA-256 checksum.
2. Mount the DMG, drag 读了么 into Applications, and launch it without a source checkout.
3. Complete the unsigned-build **Privacy & Security → Open Anyway** flow.
4. Add one normal RSS feed and one podcast feed; refresh both and open article bodies.
5. Restart the app and confirm subscriptions, read/starred state, notes, and audio progress persist.
6. Configure an AI endpoint, test the connection, generate one article summary, and confirm failure states do not reveal the API key.
7. Configure transcription when credentials are available and generate one podcast transcript/summary.
8. Create a backup, remove or change local data, restore the backup, and confirm AI secrets are not imported from the backup.
9. Open external article links and confirm they leave the Electron window for the system browser.
10. Exercise a deliberately hostile RSS fixture and confirm scripts, iframes, forms, active URL schemes, inline styles, and SVG/MathML payloads do not execute or survive sanitization.

Record the tested DMG filename, checksum, Mac architecture, macOS version, and result in the release notes or release checklist.
