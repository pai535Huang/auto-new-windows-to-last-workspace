# Auto New Windows to Last Workspace

Small GNOME Shell extension that moves newly-created normal top-level windows to the workspace after the highest-index non-empty workspace.

GNOME dynamic workspaces usually keep an empty placeholder workspace at the end. This extension uses that placeholder only after at least one normal window already exists, so the first window after login stays on the first workspace and later windows go to the newest workspace.

After moving a window, the extension switches to that window's workspace and focuses the new window.

When closing a window leaves the current workspace empty, the extension switches to the nearest non-empty workspace on the left, or the nearest non-empty workspace on the right if there is none on the left, and asks GNOME to remove the empty workspace.

It skips transient windows, attached dialogs, non-normal window types, windows hidden from taskbar/pager lists, and windows shown on all workspaces. It also keeps xdg-desktop-portal dialogs and same-application auxiliary windows, such as file pickers, image viewers, and chat history windows, on the workspace where they were opened. Virtual machine viewer windows opened from Virtual Machine Manager are kept on the manager's workspace as well.

## Rules

Extra rules can be added without editing the extension code. Open the extension preferences from GNOME Extensions, or run:

```sh
gnome-extensions prefs auto-new-windows-to-last-workspace@hjk.local
```

Rules entered in the settings UI are appended to the built-in defaults. Restart or reload the extension after changing rules.

The settings UI also has a switch named "保持当前焦点". When enabled, newly opened windows are moved without immediately switching focus to them.

Advanced rules can also be added in:

```sh
~/.config/auto-new-windows-to-last-workspace/rules.json
```

Example:

```json
{
  "auxiliaryDialogTitles": [
    "preferences",
    "settings"
  ],
  "sameApplicationAuxiliaryTitles": [
    "logs",
    "preview"
  ],
  "auxiliaryRoles": [
    "utility"
  ],
  "portalIdentifiers": [
    "xdg-desktop-portal"
  ],
  "sourceTargetRules": [
    {
      "source": ["main-app-class"],
      "target": ["helper-app-class", "helper window title"]
    }
  ]
}
```

All strings are regular expressions matched case-insensitively. File rules are appended after the built-in defaults and settings UI rules.

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
