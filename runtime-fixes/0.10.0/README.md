# DSH Desktop 0.10.0 binary-file preview fix

The tracked repository is a 0.9.0 snapshot. This narrowly scoped overlay targets the installed 0.10.0 `@deepseek-ai/dsh-client-ui-deliverables` 0.1.7-rc.2 bundle. It does not replace the rest of the application.

The changed-file card previously opened a text diff for PNG, PDF, and other binary files, producing “Binary file; changes cannot be shown”. The patch opens a binary file in the existing Sidebar document viewer, resolving a relative path against that session's workspace first. If a binary diff tab is already open, it exposes an explicit “Open the whole file in the sidebar” button. Text diff behavior stays unchanged.

`apply.sh` requires the app to be closed, checks the exact 0.10.0 plugin hash, backs up the full signed app, patches only the plugin, checks syntax and the modified hash, then ad-hoc signs and verifies the bundle. Ad-hoc signing replaces the original Developer ID seal; `rollback.sh` restores the full original signed backup. Keep the backup until the fix is accepted.

Run `./apply.sh` only after all running DSH sessions finish. It prints the backup path and runnable rollback command. Then reopen DSH and verify an image and a document from relative workspace paths, as well as a text diff. The app's automatic updater may replace this overlay; recheck its version and plugin hash before any future reapplication.
