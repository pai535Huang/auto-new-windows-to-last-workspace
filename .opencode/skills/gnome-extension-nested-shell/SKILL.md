---
name: gnome-extension-nested-shell
description: Use when developing, debugging, or testing GNOME Shell extensions; prefer running an isolated nested/devkit Wayland GNOME Shell instead of restarting the user's live desktop session.
---

# GNOME Extension Nested Shell Testing

Use this skill when working on a GNOME Shell extension project, especially when the task involves testing extension behavior, reloading GNOME Shell, checking logs, or validating UI/window-management changes.

## Core Rule

Test changes in an isolated GNOME Shell session:

```bash
dbus-run-session -- gnome-shell --nested --wayland
```

GNOME Shell 50 and newer may not support `--nested`. Check `gnome-shell --help` first. If `--nested` is unavailable and `--devkit` is available, use:

```bash
dbus-run-session -- gnome-shell --devkit
```

Prefer this over restarting or reloading the user's active desktop session. A nested shell is safer because crashes, extension reloads, and experimental behavior are isolated from the current login session.

## Workflow

1. Install or sync the extension into the normal GNOME extension directory for the current user, unless the project has its own documented workflow:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/<extension-uuid>
cp -r . ~/.local/share/gnome-shell/extensions/<extension-uuid>
```

2. Check the supported GNOME Shell launch options:

```bash
gnome-shell --help
```

3. Start the isolated shell from a terminal. Use the first command if supported:

```bash
dbus-run-session -- gnome-shell --nested --wayland
```

If `--nested` prints `Unknown option --nested`, use the GNOME 50+ devkit mode instead:

```bash
dbus-run-session -- gnome-shell --devkit
```

Do not use plain `gnome-shell --wayland` as the fallback when the user is already in a graphical session; it may try to take control of the real session and fail with `Failed to take control of the session: ... EBUSY: Device or resource busy`.

4. Enable the extension inside the isolated session, using the extension UUID:

```bash
gnome-extensions enable <extension-uuid>
```

5. Confirm the extension loaded:

```bash
gnome-extensions info <extension-uuid>
```

Look for `Enabled: Yes` and `State: ACTIVE`.

6. After code changes, restart the isolated shell rather than the live desktop shell. Close the nested/devkit window or stop the command, then run it again.

7. Inspect logs from the terminal that launched the isolated shell first. If more context is needed, use journal logs for GNOME Shell:

```bash
journalctl --user -f -o cat /usr/bin/gnome-shell
```

## Notes

- Use the extension UUID from `metadata.json`; do not guess it from the folder name unless they match.
- For GNOME 45+ extensions, check `metadata.json`, `extension.js`, `prefs.js`, and `stylesheet.css` conventions before changing load/reload behavior.
- Avoid commands that restart the real GNOME Shell session, log out the user, or disrupt the active desktop unless the user explicitly asks.
- If testing window placement, workspace behavior, or Wayland-specific APIs, nested Wayland testing is the default verification path.
- On GNOME Shell 50, `--devkit` can start successfully even if it logs `Failed to launch devkit: Failed to execute child process "/usr/lib/mutter-devkit"`; treat extension `State: ACTIVE` and absence of extension JS errors as the load check.
- If `gnome-extensions enable` says `Failed to connect to GNOME Shell`, read the shell log first; the shell may have exited before extension loading. Common causes are unsupported `--nested` or using plain `--wayland` in an already busy session.
