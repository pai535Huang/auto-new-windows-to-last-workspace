import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function loadExtensionClass() {
    const source = fs.readFileSync(new URL('../extension.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '')
        .replace('export default class', 'class')
        + '\nreturn AutoNewWindowsToLastWorkspaceExtension;';

    const GLib = {
        PRIORITY_DEFAULT: 0,
        SOURCE_REMOVE: false,
        Source: {
            remove() {},
        },
        timeout_add() {
            throw new Error('timeout_add was not mocked');
        },
    };
    const Meta = {
        WindowType: {
            NORMAL: 0,
        },
    };
    class Extension {
        getSettings() {
            return null;
        }
    }

    const globalMock = {
        display: {},
        workspace_manager: {},
        get_current_time: () => 1,
        get_window_actors: () => [],
    };

    const ExtensionClass = Function('GLib', 'Meta', 'Extension', 'global', source)(
        GLib,
        Meta,
        Extension,
        globalMock
    );

    return {ExtensionClass, GLib, Meta, globalMock};
}

function createExtension() {
    const {ExtensionClass, GLib, globalMock} = loadExtensionClass();
    const extension = new ExtensionClass();

    extension._timeoutIds = new Set();
    extension._windowMoveTimeoutIds = new Map();
    extension._windowUnmanagedIds = new Map();
    extension._settings = {
        get_strv(name) {
            assert.equal(name, 'same-workspace-wm-classes');
            return [];
        },
        get_boolean() {
            return false;
        },
    };
    extension._rules = extension._loadRules();

    return {extension, GLib, globalMock};
}

function createWorkspace(index = 0) {
    return {
        activated: 0,
        index: () => index,
        list_windows: () => [],
        activate() {
            this.activated++;
        },
    };
}

function createWindow(overrides = {}) {
    return {
        activated: 0,
        workspace: createWorkspace(),
        is_on_all_workspaces: () => false,
        get_transient_for: () => null,
        is_attached_dialog: () => false,
        get_window_type: () => 0,
        get_workspace() {
            return this.workspace;
        },
        get_compositor_private: () => ({}),
        activate() {
            this.activated++;
        },
        connect() {
            return 1;
        },
        disconnect() {},
        ...overrides,
    };
}

test('auxiliary windows match Mutter role getter', () => {
    const {extension} = createExtension();
    const window = createWindow({
        get_role: () => 'dialog',
        get_title: () => 'Unmatched title',
    });

    assert.equal(extension._hasAuxiliaryDialogRoleOrTitle(window), true);
});

test('source-workspace exceptions restore focus when focus preservation is enabled', () => {
    const {extension, globalMock} = createExtension();
    const sourceWorkspace = createWorkspace(0);
    const focusWindow = createWindow({workspace: sourceWorkspace});
    const portalWindow = createWindow({
        get_wm_class: () => 'xdg-desktop-portal-gnome',
    });

    extension._settings = {
        get_boolean(name) {
            assert.equal(name, 'keep-focus-on-current-window');
            return true;
        },
    };
    globalMock.workspace_manager.get_active_workspace = () => sourceWorkspace;

    extension._moveWindow(portalWindow, {
        focusWindow,
        workspace: sourceWorkspace,
    });

    assert.equal(sourceWorkspace.activated, 1);
    assert.equal(focusWindow.activated, 1);
    assert.equal(portalWindow.activated, 0);
});

test('delayed move ignores windows that no longer have a compositor actor', () => {
    const {extension} = createExtension();
    const staleWindow = {
        get_compositor_private: () => null,
        is_on_all_workspaces() {
            throw new Error('stale windows should not be inspected');
        },
    };

    assert.doesNotThrow(() => extension._moveWindow(staleWindow, {}));
});

test('_recordFocus keeps the most-recently-focused order and skips non-normal windows', () => {
    const {extension} = createExtension();
    const a = createWindow();
    const b = createWindow();
    const c = createWindow();

    extension._recordFocus(a);
    extension._recordFocus(b);
    assert.deepEqual(extension._focusMru, [b, a]);

    extension._recordFocus(a);
    assert.deepEqual(extension._focusMru, [a, b]);

    extension._recordFocus(c);
    assert.deepEqual(extension._focusMru, [c, a, b]);

    const dialog = createWindow({get_transient_for: () => ({})});
    extension._recordFocus(dialog);
    assert.equal(extension._focusMru.includes(dialog), false);
});

test('_wasMostRecentlyFocused detects the head of the focus history', () => {
    const {extension} = createExtension();
    const first = createWindow();
    const second = createWindow();

    extension._recordFocus(first);
    extension._recordFocus(second);

    assert.equal(extension._wasMostRecentlyFocused(second), true);
    assert.equal(extension._wasMostRecentlyFocused(first), false);
});

test('_removeFromFocusMru drops a closed window from the focus history', () => {
    const {extension} = createExtension();
    const first = createWindow();
    const second = createWindow();

    extension._recordFocus(first);
    extension._recordFocus(second);
    extension._removeFromFocusMru(second);

    assert.deepEqual(extension._focusMru, [first]);
});

test('closing a focused window restores focus to the previous window and its workspace', () => {
    const {extension, globalMock} = createExtension();
    const leftWorkspace = createWorkspace(0);
    const closedWorkspace = createWorkspace(1);
    const focusWorkspace = createWorkspace(2);
    const otherWindow = createWindow({workspace: leftWorkspace});
    const previousFocusWindow = createWindow({workspace: focusWorkspace});
    let activatedWorkspace = null;
    let activatedWindow = null;
    let removedWorkspace = null;

    leftWorkspace.list_windows = () => [otherWindow];
    closedWorkspace.list_windows = () => [];
    focusWorkspace.list_windows = () => [previousFocusWindow];
    for (const [workspace, window] of [[leftWorkspace, otherWindow], [focusWorkspace, previousFocusWindow]]) {
        workspace.activate = () => {
            activatedWorkspace = workspace;
        };
        window.activate = () => {
            activatedWindow = window;
        };
    }
    globalMock.workspace_manager = {
        n_workspaces: 3,
        get_active_workspace: () => closedWorkspace,
        get_workspace_by_index(index) {
            return [leftWorkspace, closedWorkspace, focusWorkspace][index];
        },
        remove_workspace(workspace) {
            removedWorkspace = workspace;
        },
    };
    extension._focusMru = [previousFocusWindow];

    extension._moveLeftIfCurrentWorkspaceIsEmpty(closedWorkspace, true);

    assert.equal(activatedWindow, previousFocusWindow);
    assert.equal(activatedWorkspace, focusWorkspace);
    assert.equal(removedWorkspace, closedWorkspace);
    assert.equal(otherWindow.activated, 0);
});

test('empty-workspace cleanup falls back to the nearest workspace when no previous window exists', () => {
    const {extension, globalMock} = createExtension();
    const closedWorkspace = createWorkspace(1);
    const leftWorkspace = createWorkspace(0);
    const rightWorkspace = createWorkspace(2);
    let activatedWorkspace = null;

    leftWorkspace.list_windows = () => [createWindow({workspace: leftWorkspace})];
    rightWorkspace.list_windows = () => [createWindow({workspace: rightWorkspace})];
    closedWorkspace.list_windows = () => [];
    leftWorkspace.activate = () => {
        activatedWorkspace = leftWorkspace;
    };
    globalMock.workspace_manager = {
        n_workspaces: 3,
        get_active_workspace: () => closedWorkspace,
        get_workspace_by_index(index) {
            return [leftWorkspace, closedWorkspace, rightWorkspace][index];
        },
        remove_workspace() {},
    };
    extension._focusMru = [];

    extension._moveLeftIfCurrentWorkspaceIsEmpty(closedWorkspace, true);

    assert.equal(activatedWorkspace, leftWorkspace);
});

test('unmanaging a focused window schedules focus restoration to its predecessor', () => {
    const {extension, GLib, globalMock} = createExtension();
    const closedWorkspace = createWorkspace(1);
    const focusWorkspace = createWorkspace(2);
    const previousFocusWindow = createWindow({workspace: focusWorkspace});
    let unmanagedCallback = null;
    const closingWindow = createWindow({
        workspace: closedWorkspace,
        connect(signal, callback) {
            assert.equal(signal, 'unmanaged');
            unmanagedCallback = callback;
            return 7;
        },
    });

    let cleanupCallback = null;
    GLib.timeout_add = (_priority, delay, callback) => {
        assert.equal(delay, 150);
        cleanupCallback = callback;
        return 9;
    };
    globalMock.workspace_manager = {
        n_workspaces: 3,
        get_active_workspace: () => closedWorkspace,
        get_workspace_by_index(index) {
            return [createWorkspace(0), closedWorkspace, focusWorkspace][index];
        },
        remove_workspace() {},
    };
    closedWorkspace.list_windows = () => [];
    focusWorkspace.list_windows = () => [previousFocusWindow];
    extension._focusMru = [closingWindow, previousFocusWindow];

    extension._trackWindow(closingWindow);
    unmanagedCallback();

    assert.deepEqual(extension._focusMru, [previousFocusWindow]);

    cleanupCallback();
    assert.equal(previousFocusWindow.activated, 1);
    assert.equal(closingWindow.activated, 0);
});

test('unmanaging a window cancels its pending delayed move', () => {
    const {extension, GLib} = createExtension();
    const removedSources = [];
    GLib.timeout_add = (_priority, delay, callback) => {
        assert.equal(typeof callback, 'function');
        return delay === 500 ? 42 : 43;
    };
    GLib.Source.remove = sourceId => {
        removedSources.push(sourceId);
    };

    let unmanagedCallback = null;
    const window = createWindow({
        connect(signal, callback) {
            assert.equal(signal, 'unmanaged');
            unmanagedCallback = callback;
            return 7;
        },
    });

    extension._trackWindow(window);
    extension._scheduleMove(window, {});
    unmanagedCallback();

    assert.deepEqual(removedSources, [42]);
    assert.equal(extension._timeoutIds.has(42), false);
});

test('empty-workspace cleanup targets the active workspace that lost a window', () => {
    const {extension, GLib, globalMock} = createExtension();
    const closedWorkspace = createWorkspace(0);
    const rightWorkspace = createWorkspace(1);
    let activatedWorkspace = null;
    let removedWorkspace = null;

    closedWorkspace.list_windows = () => [];
    rightWorkspace.list_windows = () => [createWindow({workspace: rightWorkspace})];
    globalMock.workspace_manager = {
        n_workspaces: 2,
        get_active_workspace: () => closedWorkspace,
        get_workspace_by_index(index) {
            return [closedWorkspace, rightWorkspace][index];
        },
        remove_workspace(workspace) {
            removedWorkspace = workspace;
        },
    };
    rightWorkspace.activate = () => {
        activatedWorkspace = rightWorkspace;
    };

    let timeoutCallback = null;
    GLib.timeout_add = (_priority, _delay, callback) => {
        timeoutCallback = callback;
        return 9;
    };

    extension._scheduleEmptyWorkspaceCleanup(closedWorkspace);
    timeoutCallback();

    assert.equal(activatedWorkspace, rightWorkspace);
    assert.equal(removedWorkspace, closedWorkspace);
});

test('empty-workspace cleanup does not switch away when a different workspace is active', () => {
    const {extension, GLib, globalMock} = createExtension();
    const leftWorkspace = createWorkspace(0);
    const closedWorkspace = createWorkspace(1);
    const activeWorkspace = createWorkspace(2);
    let activatedWorkspace = null;
    let removedWorkspace = null;

    leftWorkspace.list_windows = () => [createWindow({workspace: leftWorkspace})];
    closedWorkspace.list_windows = () => [];
    activeWorkspace.list_windows = () => [createWindow({workspace: activeWorkspace})];
    for (const workspace of [leftWorkspace, activeWorkspace]) {
        workspace.activate = () => {
            activatedWorkspace = workspace;
        };
    }

    globalMock.workspace_manager = {
        n_workspaces: 3,
        get_active_workspace: () => activeWorkspace,
        get_workspace_by_index(index) {
            return [leftWorkspace, closedWorkspace, activeWorkspace][index];
        },
        remove_workspace(workspace) {
            removedWorkspace = workspace;
        },
    };

    let timeoutCallback = null;
    GLib.timeout_add = (_priority, _delay, callback) => {
        timeoutCallback = callback;
        return 9;
    };

    extension._scheduleEmptyWorkspaceCleanup(closedWorkspace);
    timeoutCallback();

    assert.equal(activatedWorkspace, null);
    assert.equal(removedWorkspace, closedWorkspace);
});
