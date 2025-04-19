import Clutter from "gi://Clutter";
import Shell from "gi://Shell";
import { FeatureBase } from "../libs/shell/feature.js";
import { QuickSettingsMenuTracker } from "../libs/shell/quickSettingsUtils.js";
import Global from "../global.js";
export class MenuAnimation extends FeatureBase {
	loadSettings(loader) {
		this.enabled = loader.loadBoolean("menu-animation-enabled");
		this.backgroundBlurRadius = loader.loadInt("menu-animation-background-blur-radius");
		this.bakgroundBrightness = loader.loadInt("menu-animation-background-brightness") / 1000;
		this.backgroundOpacity = loader.loadInt("menu-animation-background-opacity");
		this.backgroundScaleX = loader.loadInt("menu-animation-background-scale-x") / 1000;
		this.backgroundScaleY = loader.loadInt("menu-animation-background-scale-y") / 1000;
		this.openDuration = loader.loadInt("menu-animation-open-duration");
		this.closeDuration = loader.loadInt("menu-animation-close-duration");
		this.gridContentOpacity = loader.loadInt("menu-animation-grid-content-opacity");
	}
	// #endregion settings
	onOpen(_maid, _menu, isOpen) {
		if (this.blur)
			this.blur.enabled = isOpen;
		if (isOpen) {
			Global.QuickSettingsBox.set_pivot_point(0.5, 0.5);
			Global.QuickSettingsBox.ease({
				duration: this.openDuration,
				mode: Clutter.AnimationMode.EASE_OUT_QUINT,
				scaleX: this.backgroundScaleX,
				scaleY: this.backgroundScaleY,
				opacity: this.backgroundOpacity,
			});
			Global.QuickSettingsGrid.ease({
				duration: this.openDuration,
				mode: Clutter.AnimationMode.EASE_OUT_QUINT,
				opacity: this.gridContentOpacity,
			});
		}
		else {
			Global.QuickSettingsBox.ease({
				duration: this.closeDuration,
				mode: Clutter.AnimationMode.EASE_OUT_QUINT,
				scaleX: 1,
				scaleY: 1,
				opacity: 255,
				onComplete: () => {
					Global.QuickSettingsBox.set_pivot_point(0, 0);
				}
			});
			Global.QuickSettingsGrid.ease({
				duration: this.openDuration,
				mode: Clutter.AnimationMode.EASE_OUT_QUINT,
				opacity: 255,
			});
		}
	}
	onLoad() {
		if (!this.enabled)
			return;
		if (this.backgroundBlurRadius) {
			this.blur = new Shell.BlurEffect({
				enabled: false,
				mode: Shell.BlurMode.ACTOR,
				radius: this.backgroundBlurRadius,
				brightness: this.bakgroundBrightness,
			});
			// @ts-ignore Box pointer is private
			Global.QuickSettingsMenu._boxPointer.add_effect_with_name("blur", this.blur);
		}
		this.tracker = new QuickSettingsMenuTracker();
		this.tracker.onMenuOpen = this.onOpen.bind(this);
		this.tracker.load();
	}
	onUnload() {
		const tracker = this.tracker;
		if (!tracker)
			return;
		this.tracker = null;
		tracker.unload();
		if (this.blur) {
			// @ts-ignore Box pointer is private
			Global.QuickSettingsMenu._boxPointer.remove_effect(this.blur);
			this.blur = null;
		}
		Global.QuickSettingsBox.remove_all_transitions();
		Global.QuickSettingsBox.scaleX = 1;
		Global.QuickSettingsBox.scaleY = 1;
		Global.QuickSettingsBox.opacity = 255;
		Global.QuickSettingsBox.set_pivot_point(0, 0);
	}
}
