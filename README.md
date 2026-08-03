# Auto New Windows to Last Workspace

Small GNOME Shell extension that moves new normal app windows to the latest workspace, then switches focus to them.

It leaves the first window after login on the first workspace, keeps dialog-like windows on their source workspace, and returns focus to the previous window when closing the current window empties a workspace.

## Features

- Move new top-level app windows to the next workspace.
- Keep dialog-like windows, portal windows, and file pickers on the source workspace.
- Group related windows by configurable window aliases.
- Optionally keep focus on the current window when new windows open.
- Apply rule changes immediately from the preferences window.

## Rules

Open the extension preferences from GNOME Extensions, or run:

```sh
gnome-extensions prefs auto-new-windows-to-last-workspace@pai535Huang
```

Enable `Keep Current Focus` to move new windows without switching focus to them.

Add one window group per line. Each group can contain multiple aliases separated by English commas. Aliases match `WM_CLASS`, app ID, or window title. Matching is case-insensitive and uses the same wildcards as Blur My Shell's application list: `*` matches any sequence of characters (e.g., `code*` or `*code*`) and `?` matches a single one. Windows matching the same line are placed on the same workspace.

Examples:

```text
wechat, WeChat
qq
virt-manager
*preview*
```

Duplicate aliases are harmless but unnecessary. Chinese commas are not separators. If no existing window matches the same line, the new window is handled like a normal new window. Rule changes apply immediately.

## Install

This source directory can be symlinked into:

```sh
~/.local/share/gnome-shell/extensions/auto-new-windows-to-last-workspace@pai535Huang
```

Compile the settings schema if the extension is installed from this source directory:

```sh
glib-compile-schemas ~/.local/share/gnome-shell/extensions/auto-new-windows-to-last-workspace@pai535Huang/schemas
```

Then enable it with:

```sh
gnome-extensions enable auto-new-windows-to-last-workspace@pai535Huang
```

On Wayland, log out and log back in if GNOME does not load the new extension immediately.
