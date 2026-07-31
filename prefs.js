import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class AutoNewWindowsToLastWorkspacePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title: 'Window Rules',
            icon_name: 'preferences-system-symbolic',
        });

        page.add(this._createFocusGroup(settings));
        page.add(this._createWmClassGroup(settings));
        window.add(page);
    }

    _createFocusGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Focus',
            description: 'Keep focus where it is when new windows open.',
        });

        const row = new Adw.SwitchRow({
            title: 'Keep Current Focus',
            subtitle: 'New windows open without taking focus.',
        });

        settings.bind('keep-focus-on-current-window', row, 'active', 0);
        group.add(row);
        return group;
    }

    _createWmClassGroup(settings) {
        const textView = this._createTextView(settings.get_strv('same-workspace-wm-classes').join('\n'));
        const group = new Adw.PreferencesGroup({
            title: 'Workspace Grouping',
            description: 'One group per line. Use commas for aliases. Matches WM_CLASS, app ID, or title.',
        });

        textView.buffer.connect('changed', buffer => {
            settings.set_strv('same-workspace-wm-classes', this._getBufferText(buffer)
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean));
        });

        group.add(this._wrapTextView(textView));
        return group;
    }

    _createTextView(text) {
        const textView = new Gtk.TextView({
            monospace: true,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            top_margin: 8,
            bottom_margin: 8,
            left_margin: 8,
            right_margin: 8,
        });

        textView.buffer.text = text;
        return textView;
    }

    _wrapTextView(textView) {
        return new Gtk.ScrolledWindow({
            child: textView,
            min_content_height: 120,
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
    }

    _getBufferText(buffer) {
        return buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false);
    }

}
