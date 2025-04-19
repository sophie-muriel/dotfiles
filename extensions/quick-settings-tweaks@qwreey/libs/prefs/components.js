import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import Gdk from "gi://Gdk";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { deepEqual } from "../shared/jsUtils.js";
function addChildren(target, funcName, children) {
    if (!children)
        return;
    for (const item of children) {
        if (!item)
            continue;
        target[funcName](item);
    }
}
function setLinkCursor(target) {
    target.cursor = Gdk.Cursor.new_from_name("pointer", null);
}
export function setScrollToFocus(target, value) {
    const viewport = target
        .get_first_child() // GtkScrolledWindow
        .get_first_child(); // GtkViewport
    viewport.scrollToFocus = value;
}
export function delayedSetScrollToFocus(target, value) {
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
        setScrollToFocus(target, value);
        return GLib.SOURCE_REMOVE;
    });
    GLib.source_set_name_by_id(id, "[quick-settings-tweaks] delayedSetScrollToFocus: id");
}
// Fix adwaita scroll flicking issue
export function fixPageScrollIssue(page) {
    page.connect("unmap", () => {
        setScrollToFocus(page, false);
    });
    page.connect("map", () => {
        delayedSetScrollToFocus(page, true);
    });
}
export function pushButton(row_with_suffix, button) {
    const suffixes = row_with_suffix
        .get_first_child() // GtkBox header
        .get_last_child(); // GtkBox suffixes
    const first_suffix = suffixes.get_first_child();
    button
        .insert_before(suffixes, first_suffix);
    return first_suffix;
}
export function pushDetailedButton(row_with_suffix, onDetailed) {
    const buttonBox = Button({
        action: onDetailed,
        iconName: "emblem-system-symbolic",
        hasFrame: false,
        tooltip: _("Details"),
    });
    buttonBox.marginEnd = 2;
    const button = buttonBox.get_first_child();
    const image = button.get_first_child();
    image.pixel_size = 12;
    image.opacity = 0.75;
    row_with_suffix.activatable_widget = null;
    row_with_suffix.connect("activated", () => onDetailed());
    const switchWidget = pushButton(row_with_suffix, buttonBox);
    if (switchWidget)
        switchWidget.canFocus = true;
    return button;
}
export function removeRowBottomBorder(row) {
    const style = new Gtk.CssProvider();
    style.load_from_string("row{border-bottom-width:0px;}");
    row.get_style_context().add_provider(style, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
}
export function removeRowMinHeight(row) {
    const styleRow = new Gtk.CssProvider();
    styleRow.load_from_string("row{min-height:0px;}");
    row.get_style_context().add_provider(styleRow, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    const styleBox = new Gtk.CssProvider();
    styleBox.load_from_string(".header{min-height:0px; margin-bottom: 4px;}");
    row.get_first_child().get_style_context().add_provider(styleBox, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
}
// #region Dialog
export function Dialog({ window, title, minHeight, usePopup, childrenRequest, }) {
    const dialog = new Dialog.PrefDialog(title, childrenRequest, usePopup ?? false);
    if (minHeight)
        dialog.height_request = minHeight;
    dialog.present(window);
    return dialog;
}
(function (Dialog) {
    Dialog.PrefDialogPage = GObject.registerClass({
        GTypeName: "qwreey-pref-components-PrefDialogPage",
    }, class PrefDialogPage extends Adw.PreferencesPage {
        constructor(childrenRequest, dialog, title) {
            super({
                name: "PrefDialogPage",
            });
            if (title) {
                this.title = title;
            }
            addChildren(this, "add", childrenRequest(this, dialog));
        }
    });
    Dialog.PrefDialog = GObject.registerClass({
        GTypeName: "qwreey-pref-components-PrefDialog",
    }, class PrefDialog extends Adw.PreferencesDialog {
        constructor(title, childrenRequest, usePopup) {
            super({
                title: title ?? "",
                search_enabled: true,
                presentation_mode: usePopup
                    ? Adw.DialogPresentationMode.FLOATING
                    : Adw.DialogPresentationMode.BOTTOM_SHEET,
            });
            this.add(new Dialog.PrefDialogPage(childrenRequest, this));
        }
    });
    function StackedPage({ title, dialog, childrenRequest }) {
        const page = new Adw.NavigationPage({
            title: title,
            can_pop: true,
        });
        const view = page.child = new Adw.ToolbarView();
        view.add_top_bar(new Adw.HeaderBar());
        view.content = new Dialog.PrefDialogPage(childrenRequest, dialog);
        dialog.push_subpage(page);
        return page;
    }
    Dialog.StackedPage = StackedPage;
})(Dialog || (Dialog = {}));
// #endregion Dialog
// #region ExperimentalIcon
export function ExperimentalIcon(options) {
    return new Gtk.Image({
        css_classes: ["icon"],
        icon_name: "applications-science-symbolic",
        pixel_size: options?.pixelSize ?? 16,
        margin_end: options?.marginEnd ?? 4,
        margin_start: options?.marginStart ?? 2,
        opacity: 0.8,
        has_tooltip: true,
        tooltip_text: _("This feature marked as experimental"),
    });
}
(function (ExperimentalIcon) {
    function prependExperimentalIcon(holder, options) {
        ExperimentalIcon(options).insert_before(holder, holder.get_first_child());
    }
    ExperimentalIcon.prependExperimentalIcon = prependExperimentalIcon;
})(ExperimentalIcon || (ExperimentalIcon = {}));
// #endregion ExperimentalIcon
// #region Group
export function Group(options, children) {
    options.title ??= "";
    const { experimental, parent, onCreated, nesting } = options;
    delete options.parent;
    delete options.experimental;
    delete options.onCreated;
    delete options.nesting;
    const target = new Adw.PreferencesGroup(options);
    if (nesting)
        target.marginTop = 14;
    if (experimental)
        ExperimentalIcon.prependExperimentalIcon(target.get_first_child().get_first_child(), { marginEnd: 18, marginStart: 4, pixelSize: 20 });
    addChildren(target, "add", children);
    if (parent)
        parent.add(target);
    if (onCreated)
        onCreated(target);
    return target;
}
// #endregion Group
// #region Row
export function Row({ settings, parent, title, subtitle, uri, icon, sensitiveBind, suffix, prefix, experimental, noLinkIcon, action, onCreated, }) {
    const row = new Adw.ActionRow({
        title: title ?? null,
        subtitle: subtitle ?? null,
        activatable: (!!uri) || (!!action),
    });
    if (parent) {
        parent.add(row);
    }
    if (uri) {
        row.connect("activated", () => {
            Gio.AppInfo.launch_default_for_uri_async(uri, null, null, null);
        });
        setLinkCursor(row);
        if (!noLinkIcon)
            Row.addSuffixIcon(row, "adw-external-link-symbolic");
        row.tooltip_text = uri;
        row.has_tooltip = true;
    }
    if (action) {
        row.connect("activated", () => action());
        setLinkCursor(row);
        if (!noLinkIcon)
            Row.addSuffixIcon(row, "go-next-symbolic");
    }
    if (icon)
        Row.appendLinkIcon(row, icon);
    if (suffix) {
        row.add_suffix(suffix);
    }
    if (prefix) {
        row.add_prefix(prefix);
    }
    if (sensitiveBind) {
        settings.bind(sensitiveBind, row, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        row.sensitive = settings.get_boolean(sensitiveBind);
    }
    if (experimental)
        ExperimentalIcon.prependExperimentalIcon(row.child);
    if (onCreated)
        onCreated(row);
    return row;
}
(function (Row) {
    function appendLinkIcon(row, name) {
        const linkText = row.child.get_first_child();
        linkText.margin_start = 32;
        const image = new Gtk.Image({
            css_classes: ["icon"],
            icon_name: name,
            pixel_size: 20,
            margin_start: 2,
            margin_end: 2,
            halign: Gtk.Align.START,
        });
        image.insert_before(row.child, linkText);
    }
    Row.appendLinkIcon = appendLinkIcon;
    function addSuffixIcon(row, name) {
        row.add_suffix(new Gtk.Image({
            css_classes: ["icon"],
            icon_name: name,
            pixel_size: 16,
            margin_end: 4,
            valign: Gtk.Align.CENTER,
        }));
    }
    Row.addSuffixIcon = addSuffixIcon;
})(Row || (Row = {}));
// #endregion Row
// #region DialogRow
export function DialogRow(options) {
    return Row({
        ...options,
        action: () => {
            const dialog = Dialog({
                ...options,
                title: options.dialogTitle,
            });
            if (options.onDialogCreated) {
                options.onDialogCreated(dialog);
            }
        }
    });
}
// #endregion DialogRow
// #region ResetButton
export function ResetButton(options) {
    const { settings, bind } = options;
    options.iconName ??= "view-refresh-symbolic";
    const box = Button({
        ...options,
        onCreated: null,
    });
    box.halign = Gtk.Align.END;
    const button = box.get_first_child();
    button.valign = Gtk.Align.CENTER;
    button.has_frame = false;
    button.tooltip_text = _("Reset to default");
    button.connect("clicked", () => settings.reset(bind));
    const image = button.get_first_child();
    image.pixel_size = 12;
    image.opacity = 0.75;
    const setVisible = () => {
        const state = ResetButton.getOptionState(settings, bind);
        box.visible = options.dontHideWhenMatch ? state.isSet : (!state.isMatch);
    };
    const settingsConnection = settings.connect(`changed::${bind}`, setVisible);
    setVisible();
    box.connect("destroy", () => {
        settings.disconnect(settingsConnection);
    });
    return box;
}
(function (ResetButton) {
    function getOptionState(settings, key) {
        const userValue = settings.get_user_value(key);
        const defaultValue = settings.get_default_value(key);
        return {
            isSet: userValue != null,
            isMatch: (userValue == null)
                || (userValue && defaultValue && userValue.equal(defaultValue)),
        };
    }
    ResetButton.getOptionState = getOptionState;
    function pushResetButton(row_with_suffix, options) {
        pushButton(row_with_suffix, ResetButton(options));
    }
    ResetButton.pushResetButton = pushResetButton;
})(ResetButton || (ResetButton = {}));
// #endregion ResetButton
// #region SwitchRow
export function SwitchRow({ bind, parent, value, title, subtitle, action, sensitiveBind, settings, experimental, noResetButton, onCreated, onDetailed, }) {
    if (bind)
        value ??= settings.get_boolean(bind);
    const row = new Adw.SwitchRow({
        title: title ?? "",
        subtitle: subtitle ?? null,
        active: value,
    });
    setLinkCursor(row);
    if (action) {
        row.connect("notify::active", () => action(row.get_active()));
    }
    if (parent) {
        parent.add(row);
    }
    if (onDetailed)
        pushDetailedButton(row, onDetailed);
    if (bind) {
        settings.bind(bind, row, "active", Gio.SettingsBindFlags.DEFAULT);
        if (!noResetButton)
            ResetButton.pushResetButton(row, { settings, bind });
    }
    if (sensitiveBind) {
        settings.bind(sensitiveBind, row, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        row.sensitive = settings.get_boolean(sensitiveBind);
    }
    if (experimental)
        ExperimentalIcon.prependExperimentalIcon(row.child);
    if (onCreated)
        onCreated(row);
    return row;
}
// #endregion SwitchRow
// #region ToggleButtonRow
export function ToggleButtonRow({ bind, parent, value, title, subtitle, action, sensitiveBind, settings, experimental, text, noResetButton, onCreated, }) {
    if (bind)
        value ??= settings.get_boolean(bind);
    const row = new Adw.ActionRow({
        title: title ?? "",
        subtitle: subtitle ?? null,
    });
    const box = new Gtk.Box({
        margin_bottom: 8,
        margin_top: 8,
    });
    const toggle = new Gtk.ToggleButton({
        label: text,
        active: value,
    });
    box.insert_child_after(toggle, null);
    row.add_suffix(box);
    setLinkCursor(row);
    if (action) {
        toggle.connect("notify::active", () => action(toggle.get_active()));
    }
    if (parent) {
        parent.add(row);
    }
    if (bind) {
        settings.bind(bind, toggle, "active", Gio.SettingsBindFlags.DEFAULT);
        if (!noResetButton)
            ResetButton.pushResetButton(row, { settings, bind });
    }
    if (sensitiveBind) {
        settings.bind(sensitiveBind, row, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        row.sensitive = settings.get_boolean(sensitiveBind);
        settings.bind(sensitiveBind, toggle, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        toggle.sensitive = settings.get_boolean(sensitiveBind);
    }
    if (experimental)
        ExperimentalIcon.prependExperimentalIcon(row.child);
    if (onCreated)
        onCreated(row);
    return row;
}
// #endregion ToggleButtonRow
// #region Button
export function Button({ parent, action, sensitiveBind, settings, text, marginTop, marginBottom, iconName, hasFrame, tooltip, onCreated, }) {
    const box = new Gtk.Box({
        margin_bottom: marginBottom ?? 8,
        margin_top: marginTop ?? 8,
    });
    const button = new Gtk.Button({
        has_frame: hasFrame ?? true,
    });
    box.insert_child_after(button, null);
    setLinkCursor(button);
    if (iconName && !text) {
        button.icon_name = iconName;
    }
    if (text && !iconName) {
        button.label = text;
    }
    if (iconName && text) {
        const box = button.child = new Gtk.Box({});
        new Gtk.Image({
            icon_name: iconName,
            pixel_size: 12,
            margin_end: 6,
        }).insert_before(box, null);
        new Gtk.Label({
            label: text,
        }).insert_before(box, null);
    }
    if (tooltip) {
        button.tooltip_text = tooltip;
        button.has_tooltip = true;
    }
    if (action) {
        button.connect("clicked", () => action());
    }
    if (parent) {
        parent.add(box);
    }
    if (sensitiveBind) {
        settings.bind(sensitiveBind, button, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        button.sensitive = settings.get_boolean(sensitiveBind);
    }
    if (onCreated)
        onCreated(box);
    return box;
}
// #endregion Button
// #region ButtonRow
export function ButtonRow(options) {
    const { parent, title, subtitle, experimental, onCreated, } = options;
    const row = new Adw.ActionRow({
        title: title ?? "",
        subtitle: subtitle ?? null,
    });
    setLinkCursor(row);
    row.add_suffix(Button({
        ...options,
        onCreated: null,
    }));
    if (parent) {
        parent.add(row);
    }
    if (experimental)
        ExperimentalIcon.prependExperimentalIcon(row.child);
    if (onCreated)
        onCreated(row);
    return row;
}
// #endregion ButtonRow
// #region UpDownButton
export function UpDownButton({ parent, action, sensitiveBind, settings, marginTop, marginBottom, spacing, onCreated, }) {
    const box = new Gtk.Box({
        margin_bottom: marginTop ?? 8,
        margin_top: marginBottom ?? 8,
        spacing: spacing ?? 8
    });
    const down = new Gtk.Button({
        icon_name: "go-down-symbolic"
    });
    const up = new Gtk.Button({
        icon_name: "go-up-symbolic"
    });
    setLinkCursor(up);
    setLinkCursor(down);
    box.insert_child_after(up, null);
    box.insert_child_after(down, up);
    if (action) {
        down.connect("clicked", () => action(UpDownButton.Direction.Down));
        up.connect("clicked", () => action(UpDownButton.Direction.Up));
    }
    if (parent) {
        parent.add(box);
    }
    if (sensitiveBind) {
        settings.bind(sensitiveBind, up, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        up.sensitive = settings.get_boolean(sensitiveBind);
        settings.bind(sensitiveBind, down, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        down.sensitive = settings.get_boolean(sensitiveBind);
    }
    if (onCreated)
        onCreated(box);
    return box;
}
(function (UpDownButton) {
    let Direction;
    (function (Direction) {
        Direction[Direction["Up"] = 0] = "Up";
        Direction[Direction["Down"] = 1] = "Down";
    })(Direction = UpDownButton.Direction || (UpDownButton.Direction = {}));
})(UpDownButton || (UpDownButton = {}));
// #endregion UpDownButton
// #region RgbColorRow
export function RgbColorRow({ title, subtitle, action, sensitiveBind, settings, bind, experimental, noResetButton, onCreated, parent, value, useAlpha, }) {
    if (bind)
        value ??= settings.get_value(bind).recursiveUnpack();
    const row = new Adw.ActionRow({
        title: title ?? "",
        subtitle: subtitle ?? null,
        activatable: true,
    });
    const button = new Gtk.ColorButton({
        margin_start: 6,
        margin_top: 6,
        margin_bottom: 6,
        use_alpha: useAlpha ?? false,
    });
    row.add_suffix(button);
    const themeDefaultLabel = new Gtk.Label({
        label: _("Theme default"),
        margin_start: 12,
        margin_end: 12,
        visible: false,
    });
    const themeDefaultOverlay = new Gtk.Overlay();
    themeDefaultOverlay.child = themeDefaultLabel;
    themeDefaultOverlay.insert_before(button, null);
    row.connect("activated", () => button.activate());
    setLinkCursor(row);
    const updateColor = () => {
        themeDefaultLabel.visible = value.length == 0;
        const color = button.get_color().copy();
        color.red = (value[0] ?? 0) / 255;
        color.green = (value[1] ?? 0) / 255;
        color.blue = (value[2] ?? 0) / 255;
        if (useAlpha)
            color.alpha = (value[3] ?? 1000) / 1000;
        button.set_rgba(color);
    };
    updateColor();
    if (parent) {
        parent.add(row);
    }
    if (action || bind)
        button.connect("color-set", () => {
            const color = button.get_rgba();
            const arr = [
                Math.floor(color.red * 255 + .5),
                Math.floor(color.green * 255 + .5),
                Math.floor(color.blue * 255 + .5)
            ];
            if (useAlpha)
                arr.push(Math.floor(color.alpha * 1000 + .5));
            if (bind)
                settings.set_value(bind, new GLib.Variant("ai", arr));
            if (action)
                action(arr);
        });
    if (bind)
        settings.connect(`changed::${bind}`, () => {
            const newValue = settings.get_value(bind).recursiveUnpack();
            if (newValue[0] != value[0]
                || newValue[1] != value[1]
                || newValue[2] != value[2]
                || newValue[3] != value[3]) {
                value = newValue;
                updateColor();
            }
        });
    if (sensitiveBind) {
        settings.bind(sensitiveBind, row, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        settings.bind(sensitiveBind, button, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        button.sensitive = row.sensitive = settings.get_boolean(sensitiveBind);
    }
    if (bind && !noResetButton) {
        ResetButton.pushResetButton(row, { settings, bind });
    }
    if (experimental)
        ExperimentalIcon.prependExperimentalIcon(row.child);
    if (onCreated)
        onCreated(row);
    return row;
}
// #endregion RgbColorRow
// #region EntryRow
export function EntryRow({ bind, parent, value, title, action, sensitiveBind, settings, experimental, noResetButton, onCreated, }) {
    if (bind)
        value ??= settings.get_string(bind);
    const row = new Adw.EntryRow({
        title: title ?? "",
    });
    if (action) {
        row.connect("notify::text", () => {
            action(row.text);
        });
    }
    if (parent) {
        parent.add(row);
    }
    if (bind) {
        settings.bind(bind, row, "text", Gio.SettingsBindFlags.DEFAULT);
        if (!noResetButton)
            row.add_suffix(ResetButton({ settings, bind }));
    }
    if (sensitiveBind) {
        settings.bind(sensitiveBind, row, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        row.sensitive = settings.get_boolean(sensitiveBind);
    }
    if (experimental)
        ExperimentalIcon.prependExperimentalIcon(row.child);
    if (onCreated)
        onCreated(row);
    return row;
}
// #endregion EntryRow
// #region AdjustmentRow
export function AdjustmentRow({ max, min, stepIncrement, pageIncrement, bind, parent, value, title, subtitle, action, sensitiveBind, settings, experimental, noResetButton, onCreated, }) {
    if (bind)
        value ??= settings.get_int(bind);
    const row = new Adw.SpinRow({
        title: title ?? "",
        subtitle: subtitle ?? null,
        adjustment: new Gtk.Adjustment({
            upper: max ?? 100,
            lower: min ?? 0,
            stepIncrement: stepIncrement ?? 1,
            pageIncrement: pageIncrement ?? 10,
            value: value
        }),
    });
    setLinkCursor(row);
    const header = row
        .get_first_child(); // GtkBox header
    const suffixes = header
        .get_last_child(); // GtkBox suffixes
    const spin = suffixes
        .get_first_child(); // GtkSpinButton spin_button
    spin.hexpand = false;
    suffixes.hexpand = false;
    new Gtk.Box({ hexpand: true }).insert_before(header, suffixes);
    if (action) {
        row.connect("notify::value", () => {
            action(row.get_value());
        });
    }
    if (parent) {
        parent.add(row);
    }
    if (bind) {
        settings.bind(bind, row, "value", Gio.SettingsBindFlags.DEFAULT);
        if (!noResetButton)
            ResetButton.pushResetButton(row, { settings, bind });
    }
    if (sensitiveBind) {
        settings.bind(sensitiveBind, row, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        row.sensitive = settings.get_boolean(sensitiveBind);
    }
    if (experimental)
        ExperimentalIcon.prependExperimentalIcon(row.child);
    if (onCreated)
        onCreated(row);
    return row;
}
// #endregion AdjustmentRow
// #region ExpanderRow
export function ExpanderRow({ parent, title, subtitle, expanded, experimental, useMarkup, action, onCreated, }, children) {
    const row = new Adw.ExpanderRow({
        title: title ?? null,
        subtitle: subtitle ?? null,
        use_markup: useMarkup ?? false,
    });
    setLinkCursor(row);
    if (parent) {
        parent.add(row);
    }
    addChildren(row, "add_row", children);
    if (expanded === false || expanded === true) {
        row.expanded = expanded;
    }
    if (action)
        row.connect("notify::expanded", () => action(row.expanded));
    if (experimental)
        ExperimentalIcon.prependExperimentalIcon(row.child);
    if (onCreated)
        onCreated(row);
    return row;
}
// #endregion ExpanderRow
// #region DropdownRow
export function DropdownRow({ settings, items, bind, parent, value, title, subtitle, action, sensitiveBind, experimental, noResetButton, onCreated, }) {
    let filterModeModel = new Gio.ListStore({ item_type: DropdownRow.Items });
    let type;
    for (const item of items) {
        type ??= (typeof item.value);
        filterModeModel.append(new DropdownRow.Items(item.name, item.value));
    }
    const getIndex = (value) => {
        for (let i = 0; i < filterModeModel.get_n_items(); i++) {
            if (filterModeModel.get_item(i).value === value) {
                return i;
            }
        }
        return -1;
    };
    const getValueFromBind = () => {
        if (type == "string") {
            return settings.get_string(bind);
        }
        if (type == "number") {
            return settings.get_int(bind);
        }
    };
    const setValueFromBind = (value) => {
        if (type == "string") {
            settings.set_string(bind, value);
            return;
        }
        if (type == "number") {
            settings.set_int(bind, value);
            return;
        }
    };
    if (bind)
        value ??= getValueFromBind();
    let row = new Adw.ComboRow({
        title: title ?? "",
        subtitle: subtitle ?? null,
        model: filterModeModel,
        expression: new Gtk.PropertyExpression(DropdownRow.Items, null, "name"),
        selected: getIndex(value),
    });
    setLinkCursor(row);
    if (parent) {
        parent.add(row);
    }
    if (bind) {
        if (!noResetButton)
            ResetButton.pushResetButton(row, { settings, bind });
        const settingsConnection = settings.connect(`changed::${bind}`, () => {
            const selected = row.selectedItem.value;
            const changedTo = getValueFromBind();
            if (selected != changedTo) {
                row.selected = getIndex(changedTo);
            }
        });
        row.connect("destroy", () => settings.disconnect(settingsConnection));
    }
    if (bind || action)
        row.connect("notify::selected", () => {
            const selected = row.selectedItem.value;
            if (bind && (selected != getValueFromBind())) {
                setValueFromBind(selected);
            }
            if (action) {
                action(selected);
            }
        });
    if (sensitiveBind) {
        settings.bind(sensitiveBind, row, "sensitive", Gio.SettingsBindFlags.DEFAULT);
        row.sensitive = settings.get_boolean(sensitiveBind);
    }
    if (experimental)
        ExperimentalIcon.prependExperimentalIcon(row.child);
    if (onCreated)
        onCreated(row);
    return row;
}
(function (DropdownRow) {
    DropdownRow.Items = GObject.registerClass({
        Properties: {
            "name": GObject.ParamSpec.string("name", "name", "name", GObject.ParamFlags.READWRITE, null),
        },
    }, class DropdownItems extends GObject.Object {
        _init(name, value) {
            super._init({ name });
            this.value = value;
        }
    });
})(DropdownRow || (DropdownRow = {}));
// #endregion DropdownRow
// #region ContributorsRow
export function ContributorsRow(row) {
    const target = Row({});
    const box = new Gtk.Box({
        baseline_position: Gtk.BaselinePosition.CENTER,
        homogeneous: true,
        orientation: Gtk.Orientation.HORIZONTAL,
    });
    target.set_child(box);
    for (const item of row) {
        let itemButton = new Gtk.Button({
            has_frame: false,
        });
        let itemBox = new Gtk.Box({
            baseline_position: Gtk.BaselinePosition.CENTER,
            orientation: Gtk.Orientation.VERTICAL,
            cursor: Gdk.Cursor.new_from_name("pointer", null),
        });
        itemButton.child = itemBox;
        itemButton.connect("clicked", () => {
            Gio.AppInfo.launch_default_for_uri_async(item.link, null, null, null);
        });
        const itemImage = new Gtk.Image({
            margin_bottom: 2,
            margin_top: 2,
            icon_name: item.image,
            pixel_size: 38,
        });
        itemBox.append(itemImage);
        const nameText = new Gtk.Label({
            label: `<span size="small">${item.name}</span>`,
            useMarkup: true,
            hexpand: true,
        });
        itemBox.append(nameText);
        let labelBox = new Gtk.Box({
            baseline_position: Gtk.BaselinePosition.CENTER,
            orientation: Gtk.Orientation.VERTICAL,
            vexpand: true,
            hexpand: true,
            margin_bottom: 2,
            valign: Gtk.Align.CENTER
        });
        for (const label of item.label.split("\n")) {
            const labelText = new Gtk.Label({
                label: `<span size="small">${label}</span>`,
                useMarkup: true,
                hexpand: true,
                opacity: 0.7,
            });
            labelBox.append(labelText);
        }
        itemBox.append(labelBox);
        box.append(itemButton);
    }
    return target;
}
// #endregion ContributorsRow
// #region LicenseRow
export function LicenseRow(item) {
    let contentRow;
    let loaded = false;
    return ExpanderRow({
        title: item.name + (item.author ? ` <span alpha="70%"><small>by ${item.author}</small></span>` : ""),
        subtitle: item.description ?? "",
        expanded: false,
        useMarkup: true,
        action: (expanded) => {
            if (!expanded)
                return;
            if (loaded)
                return;
            if (item.content)
                item.content().then(subtitle => contentRow.subtitle = subtitle).catch(error => {
                    contentRow.subtitle = `ERROR: ${error}`;
                    log(error);
                });
        }
    }, [
        Row({
            title: _("Homepage"),
            subtitle: item.url,
            uri: item.url,
            icon: "go-home",
        }),
        item.content ? (contentRow = Row({
            title: _("License"),
            subtitle: _("Loading ..."),
        })) : null,
        item.licenseUri ? Row({
            title: _("License"),
            subtitle: item.licenseUri,
            icon: "emblem-documents-symbolic",
            uri: item.licenseUri
        }) : null,
        item.affectedFiles ? Row({
            title: _("Affected Files"),
            subtitle: item.affectedFiles.join("\n"),
            icon: "text-x-generic-symbolic",
        }) : null,
    ]);
}
// #endregion LicenseRow
// #region LogoBox
export function LogoBox({ icon, name, version, versionAction, }) {
    const logoBox = new Gtk.Box({
        baseline_position: Gtk.BaselinePosition.CENTER,
        margin_top: 6,
        spacing: 20,
        orientation: Gtk.Orientation.VERTICAL,
    });
    // Logo icon
    const logoImage = new Gtk.Image({
        icon_name: icon,
        pixel_size: 100,
    });
    logoBox.append(logoImage);
    // Extension name
    const logoText = new Gtk.Label({
        label: name,
        css_classes: ["title-2"],
        halign: Gtk.Align.CENTER,
    });
    logoBox.append(logoText);
    // Version
    const logoVersion = new Gtk.Button({
        css_classes: ["success"],
        label: version,
        halign: Gtk.Align.CENTER,
    });
    logoBox.append(logoVersion);
    if (versionAction) {
        logoVersion.connect("clicked", () => versionAction());
        setLinkCursor(logoVersion);
    }
    return logoBox;
}
// #endregion LogoBox
// #region LogoGroup
export function LogoGroup(options) {
    return Group({
        parent: options.parent,
    }, [
        LogoBox(options),
    ]);
}
// #endregion LogoGroup
// #region ChangelogDialog
export function ChangelogDialog({ content, window, currentBuildNumber, defaultPageBuildNumber, title, subtitle, }) {
    const dialog = Dialog({
        window,
        title: title ?? _("Changelog"),
        childrenRequest: () => [Group({
                title: title ?? "",
                description: subtitle ?? "",
                onCreated: (group) => {
                    content()
                        .then(ChangelogDialog.getReleases)
                        .then(releases => releases.map(release => Row({
                        title: release.version,
                        subtitle: release.Date ?? "",
                        action: () => ChangelogDialog.ChangelogPage(dialog, release),
                        onCreated: (row) => {
                            if (release.BuildNumber == currentBuildNumber) {
                                row.add_css_class("success");
                                row.title += " " + _("(Current)");
                            }
                            if (release.BuildNumber == defaultPageBuildNumber) {
                                ChangelogDialog.ChangelogPage(dialog, release);
                            }
                            group.add(row);
                        }
                    })))
                        .catch(log);
                },
            })]
    });
    dialog.height_request = 520;
    return dialog;
}
(function (ChangelogDialog) {
    const BOLD = (t) => `<span weight="bold">${t}</span>`;
    const LITEM = (t, lv) => `${"　 ".repeat(lv)}<span alpha="70%">  •　</span>${t}`;
    const TITLE = (t, lv) => `<span size="${100 + ((8 - lv) * 2.5)}%"><span alpha="50%">${"#".repeat(lv)} </span><span weight="bold">${t}</span></span>`;
    const QUOTE = (t) => `<span size="90%" alpha="70%">&gt;　</span><span size="90%" alpha="75%">${t}</span>`;
    function simpleMarked(mdlike) {
        return mdlike.split("\n").map(line => line
            .replaceAll(/^( *)\-  *(.*)/g, (_, indent, t) => LITEM(t, Math.floor(indent.length / 2)))
            .replaceAll(/^ *\>  *(.*)/g, (_, t) => QUOTE(t))
            .replaceAll(/^ *(\#*)  *(.*)/g, (_, head, t) => TITLE(t, head.length))
            .replaceAll(/\*\*(.*?)\*\*/g, (_, t) => BOLD(t))
            .replaceAll(/\<\!\-\-.*?\-\-\>/g, "")).join("\n");
    }
    ChangelogDialog.simpleMarked = simpleMarked;
    function createHeader(release) {
        return [
            _("> **Date:** %s").format(release.Date ?? ""),
            _("> **Git Hash:** %s").format(release.Git ?? ""),
            _("> **Build Number:** %d").format(release.BuildNumber ?? 0),
        ].join("\n");
    }
    ChangelogDialog.createHeader = createHeader;
    function getReleases(content) {
        const releases = [];
        let last;
        for (const line of content.split("\n")) {
            const version = line.match(/^#  *(.*) *$/);
            if (version) {
                releases.push(last = {
                    version: version[1],
                    buffer: [line],
                });
                continue;
            }
            const meta = line.match("\<\!\-\-  *\@([^ ]*) *: *(.*?) *\-\-\>");
            if (meta) {
                last[meta[1]] = JSON.parse(meta[2]);
                continue;
            }
            if (!last)
                continue;
            last.buffer.push(line.replaceAll(/\{\{HEADER\}\}/g, () => createHeader(last)));
        }
        for (const item of releases) {
            item.content = item.buffer.join("\n");
            delete item.buffer;
        }
        return releases;
    }
    ChangelogDialog.getReleases = getReleases;
    function ChangelogPage(dialog, release) {
        return Dialog.StackedPage({
            dialog,
            title: release.version,
            childrenRequest: () => [
                Group({}, [
                    new Gtk.Label({
                        use_markup: true,
                        label: ChangelogDialog.simpleMarked(release.content),
                        halign: Gtk.Align.START,
                        hexpand: true,
                    })
                ])
            ]
        });
    }
    ChangelogDialog.ChangelogPage = ChangelogPage;
})(ChangelogDialog || (ChangelogDialog = {}));
// #endregion ChangelogDialog
// #region PaddingDialog
export function PaddingDialog({ settings, sensitiveBind, bind, window, }) {
    const getValue = () => settings.get_value(bind).recursiveUnpack();
    let current = getValue();
    let top, right, bottom, left;
    const save = () => {
        if (deepEqual(current, getValue()))
            return;
        settings.set_value(bind, new GLib.Variant("ai", current));
    };
    const dialog = Dialog({
        window,
        title: _("Padding"),
        usePopup: true,
        childrenRequest: () => [Group({}, [
                top = AdjustmentRow({
                    title: _("Top"),
                    max: 2048,
                    value: current[0],
                    action: (value) => {
                        current[0] = value;
                        save();
                    },
                    settings,
                    sensitiveBind,
                }),
                bottom = AdjustmentRow({
                    title: _("Bottom"),
                    max: 2048,
                    value: current[2],
                    action: (value) => {
                        current[2] = value;
                        save();
                    },
                    settings,
                    sensitiveBind,
                }),
                left = AdjustmentRow({
                    title: _("Left"),
                    max: 2048,
                    value: current[3],
                    action: (value) => {
                        current[3] = value;
                        save();
                    },
                    settings,
                    sensitiveBind,
                }),
                right = AdjustmentRow({
                    title: _("Right"),
                    max: 2048,
                    value: current[1],
                    action: (value) => {
                        current[1] = value;
                        save();
                    },
                    settings,
                    sensitiveBind,
                }),
            ])],
    });
    const settingsConnection = settings.connect(`changed::${bind}`, () => {
        current = getValue();
        top.value = current[0];
        right.value = current[1];
        bottom.value = current[2];
        left.value = current[3];
    });
    dialog.connect("destroy", () => {
        settings.disconnect(settingsConnection);
    });
}
// #endregion PaddingDialog
