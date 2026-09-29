# DSH Desktop 0.10.0 workspace preview overlay

The tracked repository is a 0.9.0 snapshot. This overlay targets the exact installed 0.10.0 bundles; it does not replace the rest of the application.

- Changed-file cards: binary files open in the Sidebar viewer instead of a text diff; relative paths are resolved against the session workspace. Existing binary diff tabs expose an “open whole file” action. Text diffs remain unchanged.
- Existing Sidebar viewer: text, Markdown, images, PDF, Office documents, spreadsheets, and sandboxed local HTML remain handled by their original renderers. Web URLs remain handled by the existing browser tab.
- New: video files open in the Sidebar video player. `/api/file-stream` serves authenticated, sandbox-resolved GET/HEAD with bounded 1 MiB reads and HTTP byte ranges for seek/large files. MP4/WebM and other browser-supported codecs play inline; unsupported codecs show a message and can be opened with the existing system-app action.
- Model capacity: the local `bailian-dd44 / qwen3.8-max` profile now declares its official 1,000,000-token context window instead of inheriting DSH's 262,144-token default. The profile is backed up and restored together with the app.

`apply.sh` requires the app to be closed, verifies the 0.10.0 version, exact three plugin hashes, and exact model-profile hash; it backs up the full original signed app and profile, patches only three plugin files and the model field, checks syntax/hashes, then ad-hoc signs and verifies the bundle. Ad-hoc signing replaces the Developer ID seal; `rollback.sh` restores the full original signed backup and profile. Keep the backup until accepted.

Run `./apply.sh` after all running DSH sessions finish. Reopen DSH and verify a relative workspace image, document, HTML file, and video plus a web URL and text diff. The updater may replace this overlay; recheck the version and plugin hashes before any future reapplication.

Current local state: the model-capacity field is installed and live-verified at 1M. macOS App Management denied re-signing the patched app bundle, so the three file/video plugin patches were restored to their signed baseline and remain pending. The full-app installer should not be retried until that OS permission is available. Rollback reverses only the model field, retaining other profile edits made after installation.

For the currently installed model-only fix, run `./rollback-model-context.sh` to remove that one field without touching the app bundle or other model settings.
