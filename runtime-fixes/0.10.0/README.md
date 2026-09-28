# DSH Desktop 0.10.0 workspace preview overlay

The tracked repository is a 0.9.0 snapshot. This overlay targets the exact installed 0.10.0 bundles; it does not replace the rest of the application.

- Changed-file cards: binary files open in the Sidebar viewer instead of a text diff; relative paths are resolved against the session workspace. Existing binary diff tabs expose an “open whole file” action. Text diffs remain unchanged.
- Existing Sidebar viewer: text, Markdown, images, PDF, Office documents, spreadsheets, and sandboxed local HTML remain handled by their original renderers. Web URLs remain handled by the existing browser tab.
- New: video files open in the Sidebar video player. `/api/file-stream` serves authenticated, sandbox-resolved GET/HEAD with bounded 1 MiB reads and HTTP byte ranges for seek/large files. MP4/WebM and other browser-supported codecs play inline; unsupported codecs show a message and can be opened with the existing system-app action.

`apply.sh` requires the app to be closed, verifies the 0.10.0 version and exact three plugin hashes, backs up the full original signed app, patches only three plugin files, checks syntax/hashes, then ad-hoc signs and verifies the bundle. Ad-hoc signing replaces the Developer ID seal; `rollback.sh` restores the full original signed backup. Keep the backup until accepted.

Run `./apply.sh` after all running DSH sessions finish. Reopen DSH and verify a relative workspace image, document, HTML file, and video plus a web URL and text diff. The updater may replace this overlay; recheck the version and plugin hashes before any future reapplication.
