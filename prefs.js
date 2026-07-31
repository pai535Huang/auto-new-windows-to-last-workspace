import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const TEXT_RULES = [
    {
        key: 'auxiliary-dialog-titles',
        title: '总是留在当前工作区的窗口标题',
        description: '每行一个关键词或正则。例如：设置、偏好、选择文件。标题匹配的新窗口不会被移动。',
    },
    {
        key: 'same-application-auxiliary-titles',
        title: '同一应用内留在当前工作区的窗口标题',
        description: '每行一个关键词或正则。例如：聊天记录、图片查看。只在新窗口和当前窗口属于同一应用时生效。',
    },
    {
        key: 'auxiliary-roles',
        title: '窗口类型关键词',
        description: '通常不用改。每行一个关键词或正则。例如：dialog、viewer。匹配的窗口会留在当前工作区。',
    },
    {
        key: 'portal-identifiers',
        title: '应用或窗口标识关键词',
        description: '通常不用改。每行一个关键词或正则。例如：xdg-desktop-portal。匹配的窗口会留在当前工作区。',
    },
];

export default class AutoNewWindowsToLastWorkspacePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title: '窗口规则',
            icon_name: 'preferences-system-symbolic',
        });

        const helpGroup = new Adw.PreferencesGroup({
            title: '怎么用',
            description: '每行填一个关键词。匹配到的新窗口会留在当前工作区。修改后请重载扩展或重新登录。',
        });

        page.add(helpGroup);

        for (const rule of TEXT_RULES)
            page.add(this._createStringListGroup(settings, rule));

        page.add(this._createFocusGroup(settings));
        window.add(page);
    }

    _createStringListGroup(settings, rule) {
        const textView = this._createTextView(settings.get_strv(rule.key).join('\n'));
        const group = new Adw.PreferencesGroup({
            title: rule.title,
            description: rule.description,
        });

        textView.buffer.connect('changed', buffer => {
            settings.set_strv(rule.key, this._getBufferText(buffer)
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean));
        });

        group.add(this._wrapTextView(textView));
        return group;
    }

    _createFocusGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: '打开新窗口时保持当前焦点',
            description: '打开后，新窗口仍会被移动，但不会立刻切换过去。',
        });

        const row = new Adw.SwitchRow({
            title: '保持当前焦点',
            subtitle: '适合不想被新窗口打断的情况。',
        });

        settings.bind('keep-focus-on-current-window', row, 'active', 0);
        group.add(row);
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
