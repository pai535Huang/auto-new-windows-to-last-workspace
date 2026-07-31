import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const WINDOW_CREATED_DELAY_MS = 500;
const WINDOW_CLOSED_DELAY_MS = 150;
const DEFAULT_RULES = {
    auxiliaryDialogTitles: [
        'file chooser',
        'file picker',
        'choose (file|folder|directory)',
        'open (file|folder|directory)',
        'save (file|as)',
        'select (file|folder|directory)',
        '选择(文件|文件夹|目录)',
        '打开(文件|文件夹|目录)',
        '保存',
    ],
    auxiliaryRoles: [
        'dialog',
        'file.?chooser',
        'file.?picker',
        'viewer',
        'history',
    ],
    portalIdentifiers: [
        'xdg-desktop-portal',
    ],
};

export default class AutoNewWindowsToLastWorkspaceExtension extends Extension {
    enable() {
        this._timeoutIds = new Set();
        this._windowUnmanagedIds = new Map();
        this._settings = this.getSettings();
        this._rules = this._loadRules();
        this._settingsChangedId = this._settings.connect('changed::same-workspace-wm-classes', () => {
            this._rules = this._loadRules();
        });
        this._windowCreatedId = global.display.connect('window-created', (_display, window) => {
            this._trackWindow(window);
            this._scheduleMove(window, this._getWindowCreationContext());
        });

        for (const actor of global.get_window_actors())
            this._trackWindow(actor.meta_window);
    }

    disable() {
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        for (const timeoutId of this._timeoutIds)
            GLib.Source.remove(timeoutId);

        for (const [window, unmanagedId] of this._windowUnmanagedIds)
            window.disconnect(unmanagedId);

        this._timeoutIds.clear();
        this._windowUnmanagedIds.clear();
        this._settings = null;
        this._rules = null;
    }

    _loadRules() {
        const settingsRules = this._readSettingsRules();
        const rules = this._mergeRules(DEFAULT_RULES, settingsRules);

        return {
            auxiliaryDialogTitles: this._compilePatterns(rules.auxiliaryDialogTitles, 'auxiliaryDialogTitles'),
            auxiliaryRoles: this._compilePatterns(rules.auxiliaryRoles, 'auxiliaryRoles'),
            portalIdentifiers: this._compilePatterns(rules.portalIdentifiers, 'portalIdentifiers'),
            sameWorkspaceGroups: this._compilePatternGroups(rules.sameWorkspaceWmClasses, 'sameWorkspaceWmClasses'),
        };
    }

    _readSettingsRules() {
        if (!this._settings)
            return null;

        return {
            sameWorkspaceWmClasses: this._settings.get_strv('same-workspace-wm-classes'),
        };
    }

    _mergeRules(defaultRules, configuredRules) {
        if (!configuredRules || typeof configuredRules !== 'object')
            return defaultRules;

        return {
            auxiliaryDialogTitles: this._mergeStringArrays(defaultRules.auxiliaryDialogTitles, configuredRules.auxiliaryDialogTitles),
            auxiliaryRoles: this._mergeStringArrays(defaultRules.auxiliaryRoles, configuredRules.auxiliaryRoles),
            portalIdentifiers: this._mergeStringArrays(defaultRules.portalIdentifiers, configuredRules.portalIdentifiers),
            sameWorkspaceWmClasses: this._mergeStringArrays(defaultRules.sameWorkspaceWmClasses ?? [], configuredRules.sameWorkspaceWmClasses),
        };
    }

    _mergeStringArrays(defaultValues, configuredValues) {
        if (!Array.isArray(configuredValues))
            return defaultValues;

        return [...defaultValues, ...configuredValues.filter(value => typeof value === 'string')];
    }

    _compilePatterns(patterns, name) {
        return patterns.flatMap(pattern => {
            if (typeof pattern !== 'string')
                return [];

            try {
                return [new RegExp(pattern, 'i')];
            } catch (error) {
                console.warn(`Ignoring invalid ${name} pattern ${JSON.stringify(pattern)}: ${error.message}`);
                return [];
            }
        });
    }

    _compilePatternGroups(groups, name) {
        return groups.map((group, index) => {
            if (typeof group !== 'string')
                return [];

            return this._compilePatterns(group
                .split(',')
                .map(pattern => pattern.trim())
                .filter(Boolean), `${name}[${index}]`);
        }).filter(group => group.length > 0);
    }

    _trackWindow(window) {
        if (!this._isNormalTopLevelWindow(window) || this._windowUnmanagedIds.has(window))
            return;

        const unmanagedId = window.connect('unmanaged', () => {
            this._windowUnmanagedIds.delete(window);
            this._scheduleEmptyWorkspaceCleanup();
        });

        this._windowUnmanagedIds.set(window, unmanagedId);
    }

    _getWindowCreationContext() {
        return {
            focusWindow: global.display.get_focus_window?.() ?? null,
            workspace: global.workspace_manager.get_active_workspace(),
        };
    }

    _scheduleMove(window, context) {
        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WINDOW_CREATED_DELAY_MS, () => {
            this._timeoutIds.delete(timeoutId);
            this._moveWindow(window, context);
            return GLib.SOURCE_REMOVE;
        });

        this._timeoutIds.add(timeoutId);
    }

    _scheduleEmptyWorkspaceCleanup() {
        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WINDOW_CLOSED_DELAY_MS, () => {
            this._timeoutIds.delete(timeoutId);
            this._moveLeftIfCurrentWorkspaceIsEmpty();
            return GLib.SOURCE_REMOVE;
        });

        this._timeoutIds.add(timeoutId);
    }

    _moveWindow(window, context) {
        if (!this._isNormalTopLevelWindow(window))
            return;

        if (this._shouldStayOnSourceWorkspace(window, context))
            return;

        const targetWorkspace = this._getConfiguredWmClassWorkspace(window)
            ?? this._getNextWorkspaceAfterLastNonEmpty(window);

        if (!targetWorkspace) {
            if (this._settings?.get_boolean('keep-focus-on-current-window')) {
                this._restoreFocus(context);
                return;
            }

            this._focusWindow(window);
            return;
        }

        if (window.get_workspace() !== targetWorkspace)
            window.change_workspace(targetWorkspace);

        if (this._settings?.get_boolean('keep-focus-on-current-window')) {
            this._restoreFocus(context);
            return;
        }

        this._focusWindow(window);
    }

    _restoreFocus(context) {
        const time = global.get_current_time();

        if (context?.workspace)
            context.workspace.activate(time);

        const focusWindow = context?.focusWindow;
        if (focusWindow?.get_compositor_private?.())
            focusWindow.activate(time);
    }

    _focusWindow(window) {
        const workspace = window.get_workspace();
        const time = global.get_current_time();

        if (workspace)
            workspace.activate(time);

        window.activate(time);
    }

    _moveLeftIfCurrentWorkspaceIsEmpty() {
        const workspaceManager = global.workspace_manager;
        const emptyWorkspace = workspaceManager.get_active_workspace();

        if (!emptyWorkspace || this._workspaceHasNormalWindow(emptyWorkspace, null))
            return;

        const emptyWorkspaceIndex = emptyWorkspace.index();
        const targetWorkspace = this._getNearestNonEmptyWorkspaceToTheLeft(emptyWorkspaceIndex)
            ?? this._getNearestNonEmptyWorkspaceToTheRight(emptyWorkspaceIndex);

        if (!targetWorkspace)
            return;

        const time = global.get_current_time();
        targetWorkspace.activate(time);
        this._removeWorkspaceIfStillEmpty(emptyWorkspace, time);
    }

    _getNearestNonEmptyWorkspaceToTheLeft(startIndex) {
        const workspaceManager = global.workspace_manager;

        for (let index = startIndex - 1; index >= 0; index--) {
            const workspace = workspaceManager.get_workspace_by_index(index);

            if (this._workspaceHasNormalWindow(workspace, null))
                return workspace;
        }

        return null;
    }

    _getNearestNonEmptyWorkspaceToTheRight(startIndex) {
        const workspaceManager = global.workspace_manager;

        for (let index = startIndex + 1; index < workspaceManager.n_workspaces; index++) {
            const workspace = workspaceManager.get_workspace_by_index(index);

            if (this._workspaceHasNormalWindow(workspace, null))
                return workspace;
        }

        return null;
    }

    _removeWorkspaceIfStillEmpty(workspace, time) {
        const workspaceManager = global.workspace_manager;

        if (this._workspaceHasNormalWindow(workspace, null))
            return;

        if (typeof workspaceManager.remove_workspace === 'function')
            workspaceManager.remove_workspace(workspace, time);
    }

    _getNextWorkspaceAfterLastNonEmpty(windowToMove) {
        const workspaceManager = global.workspace_manager;
        let lastNonEmptyIndex = -1;

        for (let index = workspaceManager.n_workspaces - 1; index >= 0; index--) {
            const workspace = workspaceManager.get_workspace_by_index(index);

            if (this._workspaceHasNormalWindow(workspace, windowToMove)) {
                lastNonEmptyIndex = index;
                break;
            }
        }

        if (lastNonEmptyIndex < 0)
            return null;

        const targetIndex = Math.min(lastNonEmptyIndex + 1, workspaceManager.n_workspaces - 1);
        return workspaceManager.get_workspace_by_index(targetIndex);
    }

    _workspaceHasNormalWindow(workspace, ignoredWindow) {
        return workspace.list_windows().some(window => {
            if (ignoredWindow && window === ignoredWindow)
                return false;

            return this._isNormalTopLevelWindow(window);
        });
    }

    _isNormalTopLevelWindow(window) {
        if (!window || window.is_on_all_workspaces())
            return false;

        if (window.get_transient_for() || window.is_attached_dialog())
            return false;

        if (this._isSkippedByWindowLists(window))
            return false;

        return window.get_window_type() === Meta.WindowType.NORMAL;
    }

    _shouldStayOnSourceWorkspace(window, context) {
        if (!context?.workspace)
            return false;

        if (this._isPortalWindow(window))
            return true;

        if (this._hasAuxiliaryDialogRoleOrTitle(window))
            return true;

        return false;
    }

    _isPortalWindow(window) {
        return this._matchesPatterns(this._getWindowIdentifiers(window), this._rules.portalIdentifiers);
    }

    _getConfiguredWmClassWorkspace(window) {
        const matchingGroup = this._getMatchingWorkspaceGroup(window);
        if (!matchingGroup)
            return null;

        for (const actor of global.get_window_actors()) {
            const otherWindow = actor.meta_window;
            if (otherWindow === window || !this._isNormalTopLevelWindow(otherWindow))
                continue;

            if (this._matchesPatterns(this._getWorkspaceGroupingValues(otherWindow), matchingGroup))
                return otherWindow.get_workspace();
        }

        return null;
    }

    _getMatchingWorkspaceGroup(window) {
        const values = this._getWorkspaceGroupingValues(window);
        return this._rules.sameWorkspaceGroups.find(group => {
            return this._matchesPatterns(values, group);
        }) ?? null;
    }

    _getWorkspaceGroupingValues(window) {
        return [
            this._callStringGetter(window, 'get_gtk_application_id'),
            this._callStringGetter(window, 'get_sandboxed_app_id'),
            this._callStringGetter(window, 'get_wm_class'),
            this._callStringGetter(window, 'get_wm_class_instance'),
            window.get_title?.() ?? null,
        ].filter(Boolean);
    }

    _matchesPatterns(values, patterns) {
        return values.some(value => patterns.some(pattern => pattern.test(value)));
    }

    _hasAuxiliaryDialogRoleOrTitle(window) {
        const role = this._callStringGetter(window, 'get_wm_window_role');
        if (role && this._matchesPatterns([role], this._rules.auxiliaryRoles))
            return true;

        const title = window.get_title?.() ?? '';
        return this._matchesPatterns([title], this._rules.auxiliaryDialogTitles);
    }

    _getWindowIdentifiers(window) {
        return [
            this._callStringGetter(window, 'get_gtk_application_id'),
            this._callStringGetter(window, 'get_sandboxed_app_id'),
            this._callStringGetter(window, 'get_wm_class'),
            this._callStringGetter(window, 'get_wm_class_instance'),
        ].filter(Boolean);
    }

    _callStringGetter(window, name) {
        if (typeof window?.[name] !== 'function')
            return null;

        return window[name]() ?? null;
    }

    _isSkippedByWindowLists(window) {
        if (typeof window.is_skip_taskbar === 'function' && window.is_skip_taskbar())
            return true;

        if (typeof window.is_skip_pager === 'function' && window.is_skip_pager())
            return true;

        return Boolean(window.skip_taskbar || window.skip_pager);
    }
}
