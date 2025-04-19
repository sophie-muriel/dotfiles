import GObject from "gi://GObject";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import { QuickToggle, SystemIndicator } from "resource:///org/gnome/shell/ui/quickSettings.js";
import { FeatureBase } from "../../libs/shell/feature.js";
import Global from "../../global.js";
// #region UnsafeQuickToggle
class UnsafeQuickToggle extends QuickToggle {
    constructor(onUpdate) { super(onUpdate); }
    _init(onUpdate) {
        super._init({
            title: _("Unsafe Mode"),
            iconName: "channel-insecure-symbolic",
        });
        this._onUpdate = onUpdate;
        // bind click
        this.connect("clicked", this._toggleMode.bind(this));
        // Fetch global context
        this._sync();
    }
    _updateIcon() {
        this.iconName = this.checked ? "channel-insecure-symbolic" : "channel-secure-symbolic";
    }
    // Toggle context
    _toggleMode() {
        this.checked = !global.context.unsafe_mode;
        global.context.unsafe_mode = this.checked;
        this._updateIcon();
        this._onUpdate(this.checked);
    }
    // Sync context
    _sync() {
        this.checked = global.context.unsafe_mode;
        this._updateIcon();
    }
}
GObject.registerClass(UnsafeQuickToggle);
// #endregion UnsafeQuickToggle
// #region UnsafeIndicator
class UnsafeIndicator extends SystemIndicator {
    constructor(onUpdate) { super(onUpdate); }
    // @ts-ignore
    _init(onUpdate) {
        super._init();
        this.quickSettingsItems.push(new UnsafeQuickToggle(onUpdate));
    }
    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
}
GObject.registerClass(UnsafeIndicator);
export { UnsafeIndicator };
// #endregion UnsafeIndicator
// #region UnsafeQuickToggleFeature
export class UnsafeQuickToggleFeature extends FeatureBase {
    loadSettings(loader) {
        this.enabled = loader.loadBoolean("unsafe-quick-toggle-enabled");
    }
    onLoad() {
        if (!this.enabled)
            return;
        // Load last state
        if (Global.Settings.get_boolean("unsafe-quick-toggle-save-last-state")) {
            global.context.unsafe_mode = Global.Settings.get_boolean("unsafe-quick-toggle-last-state");
        }
        // Add Unsafe Quick Toggle
        this.maid.destroyJob(this.indicator = new UnsafeIndicator((state) => Global.Settings.set_boolean("unsafe-quick-toggle-last-state", state)));
        // @ts-expect-error Missing addExternalIndicator method (QuickSettings is private class)
        Global.QuickSettings.addExternalIndicator(this.indicator);
    }
    onUnload() {
        global.context.unsafe_mode = false;
        this.indicator = null;
    }
}
// #endregion UnsafeQuickToggleFeature
