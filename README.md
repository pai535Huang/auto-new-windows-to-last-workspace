# Auto New Windows to Last Workspace

Small GNOME Shell extension that moves newly-created normal top-level windows to the workspace after the highest-index non-empty workspace.

GNOME dynamic workspaces usually keep an empty placeholder workspace at the end. This extension uses that placeholder only after at least one normal window already exists, so the first window after login stays on the first workspace and later windows go to the newest workspace.

After moving a window, the extension switches to that window's workspace and focuses the new window.

When closing a window leaves the current workspace empty, the extension switches to the nearest non-empty workspace on the left, or the nearest non-empty workspace on the right if there is none on the left, and asks GNOME to remove the empty workspace.

It skips transient windows, attached dialogs, non-normal window types, windows hidden from taskbar/pager lists, and windows shown on all workspaces. It also keeps xdg-desktop-portal dialogs and file picker windows on the workspace where they were opened.

## Rules

Open the extension preferences from GNOME Extensions, or run:

```sh
gnome-extensions prefs auto-new-windows-to-last-workspace@hjk.local
```

Enable `Keep Current Focus` to move new windows without switching focus to them.

Add one window group per line. Each group can contain multiple aliases separated by English commas. Aliases are case-insensitive regular expressions that match `WM_CLASS`, app ID, or window title. Windows matching the same line are placed on the same workspace. Different lines are handled independently, so opening QQ and then WeChat can still create separate workspaces.

Examples:

```text
wechat, WeChat
qq
virt-manager
```

Duplicate aliases are harmless but unnecessary. Chinese commas are not separators. If no existing window matches the same line, the new window is handled like a normal new window. Rule changes apply immediately.

## Install

This source directory can be symlinked into:

```sh
~/.local/share/gnome-shell/extensions/auto-new-windows-to-last-workspace@hjk.local
```

Then enable it with:

```sh
gnome-extensions enable auto-new-windows-to-last-workspace@hjk.local
```

Compile the settings schema if the extension is installed from this source directory:

```sh
glib-compile-schemas ~/.local/share/gnome-shell/extensions/auto-new-windows-to-last-workspace@hjk.local/schemas
```

On Wayland, log out and log back in if GNOME does not load the new extension immediately.
