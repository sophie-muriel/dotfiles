import St from "gi://St";
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import GdkPixbuf from "gi://GdkPixbuf";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageList from "resource:///org/gnome/shell/ui/messageList.js";
import { loadInterfaceXML } from "resource:///org/gnome/shell/misc/fileUtils.js";
import { Slider } from "resource:///org/gnome/shell/ui/slider.js";
import { PageIndicators } from "resource:///org/gnome/shell/ui/pageIndicators.js";
import { FeatureBase } from "../../libs/shell/feature.js";
import { getImageMeanColor } from "../../libs/shared/imageUtils.js";
import { lerp } from "../../libs/shared/jsUtils.js";
import { Drag, Scroll } from "../../libs/shell/gesture.js";
import { RoundClipEffect } from "../../libs/shell/effects.js";
import { StyledSlider } from "../../libs/shell/styler.js";
import Global from "../../global.js";
import Logger from "../../libs/shared/logger.js";
import { VerticalProp } from "../../libs/shell/compat.js";
// #region Player
class Player extends GObject.Object {
    constructor(busName) {
        super();
        this._busName = busName;
        this.source = new MessageList.Source();
        // Create properties proxy for Position
        const propertiesIface = Global.GetDbusInterface("media/dbus.xml", "org.freedesktop.DBus.Properties");
        const propertiesPromise = Gio.DBusProxy.new(Gio.DBus.session, Gio.DBusProxyFlags.NONE, propertiesIface, busName, "/org/mpris/MediaPlayer2", propertiesIface.name, null)
            // @ts-expect-error Missing promise type support
            .then((proxy) => this._propertiesProxy = proxy)
            .catch(Logger.error);
        // Create proxy for seeking
        const playerIface = Global.GetDbusInterface("media/dbus.xml", "org.mpris.MediaPlayer2.Player");
        const playerPromise = Gio.DBusProxy.new(Gio.DBus.session, Gio.DBusProxyFlags.NONE, playerIface, busName, "/org/mpris/MediaPlayer2", playerIface.name, null)
            // @ts-expect-error Missing promise type support
            .then((proxy) => this._playerProxy = proxy)
            .catch(Logger.error);
        // Create proxy for mpris
        const mprisIface = Global.GetDbusInterface("media/dbus.xml", "org.mpris.MediaPlayer2");
        const mprisPromise = Gio.DBusProxy.new(Gio.DBus.session, Gio.DBusProxyFlags.NONE, mprisIface, busName, "/org/mpris/MediaPlayer2", mprisIface.name, null)
            // @ts-expect-error Missing promise type support
            .then((proxy) => this._mprisProxy = proxy)
            .catch(Logger.error);
        // Waitting for proxies
        Promise.all([
            playerPromise,
            propertiesPromise,
            mprisPromise
        ])
            .then(this._ready.bind(this))
            .catch(Logger.error);
    }
    // Position
    get position() {
        return this._propertiesProxy.GetAsync("org.mpris.MediaPlayer2.Player", "Position").then((result) => {
            return result[0].get_int64();
        }).catch(() => null);
    }
    set position(value) {
        this._playerProxy.SetPositionAsync(this._trackId, Math.min(this._length, Math.max(1, value))).catch(Logger.error);
    }
    get busName() {
        return this._busName;
    }
    get trackId() {
        return this._trackId;
    }
    get length() {
        return this._length;
    }
    get trackArtists() {
        return this._trackArtists;
    }
    get trackTitle() {
        return this._trackTitle;
    }
    get trackCoverUrl() {
        return this._trackCoverUrl;
    }
    get app() {
        return this._app;
    }
    get canGoNext() {
        return this._playerProxy.CanGoNext;
    }
    get canGoPrevious() {
        return this._playerProxy.CanGoPrevious;
    }
    get status() {
        return this._playerProxy.PlaybackStatus;
    }
    // Update states
    _parseMetadata(metadata) {
        if (!metadata) {
            this._trackId = null;
            this._length = null;
            this._trackArtists = null;
            this._trackCoverUrl = null;
            return;
        }
        this._trackId = metadata["mpris:trackid"]?.get_string()[0] ?? null;
        this._length = metadata["mpris:length"]?.get_int64() ?? null;
        // Get trak artists
        this._trackArtists = metadata['xesam:artist']?.deepUnpack();
        if (typeof this._trackArtists === "string") {
            this._trackArtists = [this._trackArtists];
        }
        else if (!Array.isArray(this._trackArtists)
            || !this._trackArtists.every(artist => typeof artist === 'string')) {
            this._trackArtists = [(_)('Unknown artist')];
        }
        // Get track title
        this._trackTitle = metadata['xesam:title']?.deepUnpack();
        if (typeof this._trackTitle !== 'string') {
            this._trackTitle = _('Unknown title');
        }
        // Get track cover
        this._trackCoverUrl = metadata['mpris:artUrl']?.deepUnpack();
        if (typeof this._trackCoverUrl !== 'string') {
            this._trackCoverUrl = null;
        }
        // Update desktop entry
        if (this._mprisProxy.DesktopEntry) {
            this._app = Shell.AppSystem.get_default().lookup_app(this._mprisProxy.DesktopEntry + ".desktop");
        }
        else {
            this._app = null;
        }
        // Update source
        this.source.set({
            title: this._app?.get_name() ?? this._mprisProxy.Identity,
            icon: this._app?.get_icon() ?? null,
        });
        // Update can play
        this.canPlay = !!this._playerProxy.CanPlay;
        this.canSeek = this._playerProxy.CanSeek;
    }
    _update() {
        try {
            const metadata = this._playerProxy.Metadata;
            this._parseMetadata(metadata);
        }
        catch { }
        this.emit("changed");
    }
    // Methods
    previous() {
        this._playerProxy.PreviousAsync()
            .catch(Logger.error);
    }
    next() {
        this._playerProxy.NextAsync()
            .catch(Logger.error);
    }
    playPause() {
        this._playerProxy.PlayPauseAsync()
            .catch(Logger.error);
    }
    raise() {
        if (this._app) {
            this._app.activate();
        }
        else if (this._mprisProxy.CanRaise) {
            this._mprisProxy.RaiseAsync().catch(logError);
        }
    }
    isPlaying() {
        return this.status === "Playing";
    }
    // Proxy handling
    _ready() {
        // Connect mpris proxy
        this._mprisProxy.connectObject('notify::g-name-owner', () => {
            if (!this._mprisProxy.g_name_owner)
                this._close();
        }, this);
        if (!this._mprisProxy.g_name_owner)
            this._close();
        // Connect player proxy
        this._playerProxy.connectObject('g-properties-changed', this._update.bind(this), this);
        this._update();
    }
    _close() {
        this._mprisProxy.disconnectObject(this);
        this._playerProxy.disconnectObject(this);
        this._mprisProxy = null;
        this._playerProxy = null;
        this._propertiesProxy = null;
    }
}
GObject.registerClass({
    Properties: {
        "can-play": GObject.ParamSpec.boolean("can-play", null, null, GObject.ParamFlags.READWRITE, false),
        "can-seek": GObject.ParamSpec.boolean("can-seek", null, null, GObject.ParamFlags.READWRITE, false),
    },
    Signals: {
        "changed": {},
    },
}, Player);
// #endregion Player
// #region Source
// Copied from gnome source; for backward compatibility
// https://github.com/GNOME/gnome-shell/blob/ef4af961bfb39911ae09cb95e1e57d374c70fe1d/js/ui/mpris.js#L189
const DBusIface = loadInterfaceXML("org.freedesktop.DBus");
const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusIface);
const MPRIS_PLAYER_PREFIX = "org.mpris.MediaPlayer2.";
class Source extends GObject.Object {
    _init() {
        super._init();
        this._players = new Map();
    }
    start() {
        // @ts-expect-error Type error (DBusProxy is not a class)
        this._proxy = new DBusProxy(Gio.DBus.session, 'org.freedesktop.DBus', '/org/freedesktop/DBus', this._onProxyReady.bind(this));
    }
    get players() {
        return [...this._players.values()];
    }
    _addPlayer(busName) {
        if (this._players.has(busName))
            return;
        const player = new Player(busName);
        this._players.set(busName, player);
        player.connectObject("notify::can-play", () => {
            this.emit(player.canPlay ? "player-added" : "player-removed", player);
        }, this);
    }
    async _onProxyReady() {
        const [names] = await this._proxy.ListNamesAsync();
        for (const name of names) {
            if (!name.startsWith(MPRIS_PLAYER_PREFIX))
                continue;
            this._addPlayer(name);
        }
        // @ts-expect-error
        this._proxy.connectSignal('NameOwnerChanged', this._onNameOwnerChanged.bind(this));
    }
    _onNameOwnerChanged(proxy, sender, [name, oldOwner, newOwner]) {
        if (!name.startsWith(MPRIS_PLAYER_PREFIX))
            return;
        if (oldOwner) {
            const player = this._players.get(name);
            if (player) {
                this._players.delete(name);
                player.disconnectObject(this);
                this.emit('player-removed', player);
            }
        }
        if (newOwner)
            this._addPlayer(name);
    }
}
GObject.registerClass({
    Signals: {
        "player-added": { param_types: [Player] },
        "player-removed": { param_types: [Player] },
    },
}, Source);
// #endregion
// #region ProgressControl
class ProgressControl extends St.BoxLayout {
    constructor(player, options) {
        super(player, options);
    }
    _init(player, options) {
        this._player = player;
        this._positionTracker = null;
        this._dragging = false;
        this._shown = false;
        this._options = options;
        super._init({
            x_expand: true,
            style_class: "QSTWEAKS-progress-control",
        });
        this._createLabels();
        this._createSlider();
        this.add_child(this._positionLabel);
        this.add_child(this._slider);
        this.add_child(this._lengthLabel);
        this.connect("notify::mapped", this._updateTracker.bind(this));
        this.connect("destroy", this._dropTracker.bind(this));
        this._player.connectObject("changed", () => this._updateStatus(), this);
    }
    // Create position, length label
    _createLabels() {
        this._positionLabel = new St.Label({
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: "QSTWEAKS-position-label",
        });
        this._lengthLabel = new St.Label({
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: "QSTWEAKS-length-label",
        });
    }
    // Create slider and connect drag event
    _createSlider() {
        const oldSlider = this._slider;
        const slider = this._slider ??= new Slider(0);
        // Update style
        slider.style = StyledSlider.getStyle(this._options.sliderStyle);
        if (oldSlider)
            return;
        // Process Dragging
        slider.connectObject("drag-begin", () => {
            this._dragging = true;
            return Clutter.EVENT_PROPAGATE;
        }, this);
        slider.connectObject("drag-end", () => {
            this._player.position = (Math.floor(slider.value) * 1000000);
            this._dragging = false;
            return Clutter.EVENT_PROPAGATE;
        }, this);
        slider.connectObject("scroll-event", () => {
            return Clutter.EVENT_STOP;
        }, this);
        slider.connectObject("notify::value", () => {
            if (this._dragging)
                this._updatePosition(Math.floor(slider.value) * 1000000);
        }, this);
    }
    // Show / Hide by playing status
    _updateStatus(noAnimate) {
        if (!this.mapped)
            return;
        this._shown = this._player.isPlaying();
        if (this._shown)
            this._trackPosition();
        const previousHeight = this.height;
        this.height = -1;
        const height = this._shown ? this.get_preferred_height(-1)[0] : 0;
        this.height = previousHeight;
        const opacity = this._shown ? 255 : 0;
        if (noAnimate) {
            this.remove_all_transitions();
            this.height = height;
            this.opacity = opacity;
            return;
        }
        if (this._shown) {
            this.ease({
                height,
                duration: 150,
                onComplete: () => {
                    this.ease({
                        opacity,
                        duration: 150,
                    });
                }
            });
        }
        else {
            this.ease({
                opacity,
                duration: 200,
                onComplete: () => {
                    this.ease({
                        height,
                        duration: 150,
                    });
                }
            });
        }
    }
    // Update slider and label
    _updatePosition(current) {
        const currentSeconds = Math.floor(current / 1000000);
        const lengthSeconds = Math.floor(this._player.length / 1000000);
        this._positionLabel.text = this._formatSeconds(currentSeconds);
        this._lengthLabel.text = this._formatSeconds(lengthSeconds);
        this._slider.overdriveStart = this._slider.maximumValue = lengthSeconds;
        this._slider.value = currentSeconds;
    }
    // Use polling to update position when only shown
    _trackPosition() {
        this._slider.reactive = this._player.canSeek;
        if (this._shown && !this._dragging) {
            this._player.position
                .then(this._updatePosition.bind(this))
                .catch(Logger.error);
        }
        return GLib.SOURCE_CONTINUE;
    }
    _dropTracker() {
        if (this._positionTracker === null)
            return;
        GLib.source_remove(this._positionTracker);
        this._positionTracker = null;
    }
    _createTracker() {
        this._positionTracker = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, this._trackPosition.bind(this));
        GLib.source_set_name_by_id(this._positionTracker, "[quick-settings-tweaks] ProgressControl._createTracker: this._positionTracker");
    }
    _updateTracker() {
        if (this.mapped)
            this._createTracker();
        else
            this._dropTracker();
        this._updateStatus(true);
    }
    // Seconds => HH:MM:SS or MM:SS
    _formatSeconds(seconds) {
        const minutes = Math.floor(seconds / 60) % 60;
        const hours = Math.floor(seconds / 3600) % 60;
        seconds %= 60;
        const secondsPadded = seconds.toString().padStart(2, "0");
        const minutesPadded = minutes.toString().padStart(2, "0");
        if (hours > 0)
            return `${hours}:${minutesPadded}:${secondsPadded}`;
        return `${minutes}:${secondsPadded}`;
    }
}
GObject.registerClass(ProgressControl);
// #endregion ProgressControl
// #region MediaItem
class MediaItem extends MessageList.Message {
    constructor(player, options) {
        super(player.source);
        this.add_style_class_name('media-message');
        this._options = options;
        this._player = player;
        // Create controls
        if (options.progressEnabled) {
            this.child.add_child(this._progressControl = new ProgressControl(player, options));
        }
        this._createControlButtons();
        // Connect player
        this._player.connectObject('changed', this._update.bind(this), this);
        this._update();
    }
    // Create and update control buttons
    _createControlButtons() {
        const options = this._options;
        if (options.showPrevButton)
            this._prevButton ??= this.addMediaControl('media-skip-backward-symbolic', () => this._player.previous());
        if (options.showPauseButton)
            this._pauseButton ??= this.addMediaControl('', () => this._player.playPause());
        if (options.showNextButton)
            this._nextButton ??= this.addMediaControl('media-skip-forward-symbolic', () => this._player.next());
        const opacity = options.contorlOpacity;
        if (this._nextButton)
            this._nextButton.opacity = opacity;
        if (this._prevButton)
            this._prevButton.opacity = opacity;
        if (this._pauseButton)
            this._pauseButton.opacity = opacity;
    }
    // Sync to player
    _update() {
        // Get icon
        let icon;
        if (this._player.trackCoverUrl) {
            const file = Gio.File.new_for_uri(this._player.trackCoverUrl);
            icon = new Gio.FileIcon({ file });
        }
        else {
            icon = new Gio.ThemedIcon({ name: 'audio-x-generic-symbolic' });
        }
        // Get artist string
        const trackArtists = this._player.trackArtists?.join(",") ?? "";
        // Update base informations
        this.set({
            title: this._player.trackTitle,
            body: trackArtists,
            icon,
        });
        // Update control buttons
        if (this._pauseButton) {
            let isPlaying = this._player.status === 'Playing';
            let iconName = isPlaying
                ? 'media-playback-pause-symbolic'
                : 'media-playback-start-symbolic';
            this._pauseButton.child.icon_name = iconName;
        }
        if (this._prevButton)
            this._prevButton.reactive = this._player.canGoPrevious;
        if (this._nextButton)
            this._nextButton.reactive = this._player.canGoNext;
        this._updateGradient();
    }
    _updateGradient() {
        // If disabled
        if (!this._options?.gradientEnabled) {
            this.style = "";
            return;
        }
        // Push get color task, use cache if possible
        this._cachedColors ??= new Map();
        const coverUrl = this._player.trackCoverUrl;
        if (!coverUrl || coverUrl.endsWith(".svg"))
            return;
        const coverPath = coverUrl.replace(/^file:\/\//, "");
        let colorTask = this._cachedColors.get(coverPath);
        if (!colorTask) {
            const pixbuf = GdkPixbuf.Pixbuf.new_from_file(coverPath);
            if (!pixbuf)
                return;
            colorTask = getImageMeanColor(pixbuf);
            this._cachedColors.set(coverPath, colorTask);
        }
        // Update style
        colorTask.then(color => {
            if (!color)
                return;
            if (!this._cachedColors)
                return;
            const mixStart = this._options.gradientStartMix / 1000;
            const mixEnd = this._options.gradientEndMix / 1000;
            const [bgr, bgg, bgb] = this._options.gradientBackground;
            const [r, g, b] = color;
            this.style =
                `background-gradient-direction:horizontal;background-gradient-start:rgba(${lerp(bgr, r, mixStart)},${lerp(bgg, g, mixStart)},${lerp(bgb, b, mixStart)},${this._options.gradientStartOpaque / 1000});background-gradient-end:rgba(${lerp(bgr, r, mixEnd)},${lerp(bgg, g, mixEnd)},${lerp(bgb, b, mixEnd)},${this._options.gradientEndOpaque / 1000});`;
        });
    }
    // Pass all gesture actions to the parent
    vfunc_button_press_event(_event) {
        return Clutter.EVENT_PROPAGATE;
    }
    vfunc_button_release_event(_event) {
        return Clutter.EVENT_PROPAGATE;
    }
    vfunc_motion_event(_event) {
        return Clutter.EVENT_PROPAGATE;
    }
    vfunc_touch_event(_event) {
        return Clutter.EVENT_PROPAGATE;
    }
}
GObject.registerClass(MediaItem);
// #endregion MediaItem
// #region MediaList
class MediaList extends St.BoxLayout {
    get _messages() {
        return this.get_children();
    }
    constructor(options) {
        // @ts-ignore
        super(options);
    }
    // @ts-ignore
    _init(options) {
        super._init({
            can_focus: true,
            reactive: true,
            track_hover: true,
            hover: false,
            clip_to_allocation: true,
        });
        this._current = null;
        this._options = options;
        this._currentMaxPage = 0;
        this._currentPage = 0;
        this._drag = false;
        this._items = new Map();
        // Round clip effect
        this._initEffect();
        this.connect("notify::height", this._updateEffect.bind(this));
        this.connect("notify::width", this._updateEffect.bind(this));
        // Scroll Event
        this.connect("scroll-event", (_, event) => {
            if (this._drag)
                return;
            const direction = event.get_scroll_direction();
            if (direction === Clutter.ScrollDirection.UP) {
                this._seekPage(-1);
            }
            if (direction === Clutter.ScrollDirection.DOWN) {
                this._seekPage(1);
            }
        });
        // Connect source
        this._source = new Source();
        this._source.connectObject("player-removed", (_source, player) => {
            const item = this._items.get(player);
            if (!item)
                return;
            item.destroy();
            this._items.delete(player);
            this._sync();
        }, this);
        this._source.connectObject("player-added", (_source, player) => {
            if (this._items.has(player))
                return;
            const item = new MediaItem(player, this._options);
            this._items.set(player, item);
            this.add_child(item);
            this._sync();
        }, this);
        this._source.start();
    }
    // Round clip effect
    _initEffect() {
        // Disabled
        if (!this._options.roundClipEnabled) {
            if (this._effect) {
                this.remove_effect_by_name("round-clip");
            }
            this._effect = null;
            return;
        }
        // Enabled
        const effect = this._effect = new RoundClipEffect();
        effect.enabled = false;
        this.add_effect_with_name("round-clip", effect);
        effect.connectObject("notify::enabled", () => {
            if (effect !== this._effect)
                return;
            if (effect.enabled)
                this._updateEffect();
        }, this);
        this._updateEffect();
    }
    _updateEffect() {
        if (!this._effect)
            return;
        if (!this.get_stage())
            return;
        const themeNode = this.mapped ? this._current?.get_theme_node() : null;
        const padding = this._options.roundClipPadding;
        this._effect.updateUniforms(1, {
            border_radius: themeNode?.get_border_radius(null) ?? 16,
            smoothing: 0,
        }, {
            x1: padding?.[3] ?? 2,
            y1: padding?.[0] ?? 3,
            x2: this.width - (padding?.[1] ?? 2),
            y2: this.height - (padding?.[2] ?? 2)
        });
    }
    // Handle dragging
    _updateDragOffset(current, offset) {
        const sign = Math.sign(offset);
        const width = current.allocation.get_width();
        const ratio = Math.max(Math.min(offset / width, 1), -1);
        const halfRatio = Math.max(Math.min(offset * 0.5 / width, 1), -1);
        const expoRatio = (1 - Math.pow(1 - Math.abs(halfRatio), 4)) * sign;
        current.remove_all_transitions();
        this._dragTranslation = current.translationX = expoRatio * (width * 0.6);
        current.opacity = Math.floor(lerp(255, 80, Math.abs(ratio)));
    }
    _finalizeDragOffset(current, offset) {
        const width = current.allocation.get_width();
        const direction = -Math.sign(offset);
        if ((this._currentPage == this._currentMaxPage - 1 && direction == 1)
            || (this._currentPage == 0 && direction == -1)
            || (width / 4 > Math.abs(offset))) {
            current.ease({
                mode: Clutter.AnimationMode.EASE_OUT_EXPO,
                translationX: 0,
                duration: 360,
                opacity: 255,
                onComplete: () => {
                    if (this._effect)
                        this._effect.enabled = false;
                }
            });
            this._dragTranslation = null;
            return;
        }
        this._seekPage(direction);
        this._dragTranslation = null;
    }
    dfunc_drag_end(event) {
        this._drag = false;
        const current = this._current;
        if (!current || this._scroll) {
            this._dragTranslation = null;
            return;
        }
        if (event.isClick) {
            Main.overview.hide();
            Main.panel.closeQuickSettings();
            current._player?.raise();
        }
        const offset = event.coords[0] - (event.moveStartCoords || event.startCoords)[0];
        this._finalizeDragOffset(current, offset);
    }
    dfunc_drag_start(_event) {
        if (this._scroll)
            return;
        this._drag = true;
        this._dragTranslation = 0;
        if (this._effect)
            this._effect.enabled = true;
    }
    dfunc_drag_motion(event) {
        if (this._scroll)
            return;
        const current = this._current;
        if (event.isClick || !current)
            return;
        const offset = event.coords[0] - event.moveStartCoords[0];
        this._updateDragOffset(current, offset);
    }
    // Handle smooth scrolling
    dfunc_scroll_start(_event) {
        if (this._drag)
            return;
        this._scroll = true;
        this._dragTranslation = 0;
        if (this._effect)
            this._effect.enabled = true;
    }
    dfunc_scroll_motion(event) {
        if (this._drag)
            return;
        const current = this._current;
        if (!current)
            return;
        this._updateDragOffset(current, -event.scrollSumX * this._options.smoothScrollSpeed);
    }
    dfunc_scroll_end(event) {
        this._scroll = false;
        const current = this._current;
        if (!current || this._drag) {
            this._dragTranslation = null;
            return;
        }
        this._finalizeDragOffset(current, -event.scrollSumX * this._options.smoothScrollSpeed);
    }
    // Handle page action
    get page() {
        return this._currentPage;
    }
    set page(page) {
        this._setPage(this._messages[page]);
    }
    get maxPage() {
        return this._currentMaxPage;
    }
    _showFirstPlaying() {
        // Show first playing message
        const messages = this._messages;
        this._setPage(messages.find(message => message?._player.isPlaying())
            ?? messages[0]);
    }
    _setPage(to) {
        const current = this._current;
        const messages = this._messages;
        this._current = to;
        if (!to || to == current)
            return;
        for (const message of messages) {
            message.remove_all_transitions();
            if (message == current)
                continue;
            message.hide();
        }
        const toIndex = messages.findIndex(message => message == to);
        this._currentPage = toIndex;
        this.emit("page-updated", toIndex);
        if (!current) {
            to.show();
            return;
        }
        const currentIndex = messages.findIndex(message => message == current);
        if (this._effect)
            this._effect.enabled = true;
        current.ease({
            opacity: 0,
            translationX: (toIndex > currentIndex ? -120 : 120) + (this._dragTranslation ?? 0),
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                current.hide();
                to.opacity = 0;
                to.translationX = toIndex > currentIndex ? 120 : -120;
                to.show();
                to.ease({
                    mode: Clutter.AnimationMode.EASE_OUT_EXPO,
                    duration: 280,
                    translationX: 0,
                    opacity: 255,
                    onStopped: () => {
                        if (this._effect)
                            this._effect.enabled = false;
                        if (!this._messages.includes(to))
                            return;
                        to.opacity = 255;
                        to.translationX = 0;
                    }
                });
            },
            onStopped: () => {
                if (!this._messages.includes(current))
                    return;
                current.opacity = 255;
                current.translationX = 0;
            }
        });
    }
    _seekPage(offset) {
        const messages = this._messages;
        if (this._current === null)
            return;
        let currentIndex = messages.findIndex(message => message == this._current);
        if (currentIndex == -1)
            currentIndex = 0;
        const length = messages.length;
        this._setPage(messages[((currentIndex + offset + length) % length)]);
    }
    // New message / Remove message
    _sync() {
        const messages = this._messages;
        const empty = messages.length == 0;
        // Emit max page update
        if (this._currentMaxPage != messages.length) {
            this.emit("max-page-updated", this._currentMaxPage = messages.length);
        }
        // Current message destroyed
        if (this._current && (empty || !messages.includes(this._current))) {
            this._current = null;
        }
        // Hide new message
        for (const message of messages) {
            if (message == this._current)
                continue;
            message.hide();
        }
        // Show first playing message if nothing shown
        if (!this._current) {
            this._showFirstPlaying();
        }
        // Update empty state
        this.empty = empty;
    }
}
Drag.applyTo(MediaList);
Scroll.applyTo(MediaList);
GObject.registerClass({
    Signals: {
        "page-updated": { param_types: [GObject.TYPE_INT] },
        "max-page-updated": { param_types: [GObject.TYPE_INT] },
    },
    Properties: {
        "empty": GObject.ParamSpec.boolean("empty", null, null, GObject.ParamFlags.READWRITE, true),
    }
}, MediaList);
// #endregion MediaList
// #region Header
class Header extends St.BoxLayout {
    constructor(options) {
        super(options);
    }
    _init(_options) {
        super._init({
            style_class: "QSTWEAKS-header"
        });
        // Label
        this._headerLabel = new St.Label({
            text: _("Media"),
            style_class: "QSTWEAKS-header-label",
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
            x_expand: true
        });
        this.add_child(this._headerLabel);
        this._pageIndicator = new PageIndicators(Clutter.Orientation.HORIZONTAL);
        this._pageIndicator.x_align = Clutter.ActorAlign.END;
        this._pageIndicator.connectObject("page-activated", (_, page) => this.emit("page-activated", page), this);
        this._pageIndicator.y_align = Clutter.ActorAlign.CENTER;
        this.add_child(this._pageIndicator); // as unknown as St.BoxLayout)
    }
    set maxPage(maxPage) {
        this._pageIndicator.setNPages(maxPage);
    }
    get maxPage() {
        return this._pageIndicator.nPages;
    }
    set page(page) {
        this._pageIndicator.setCurrentPosition(page);
    }
    get page() {
        return this._pageIndicator._currentPosition;
    }
}
GObject.registerClass({
    Signals: {
        "page-activated": { param_types: [GObject.TYPE_INT] },
    }
}, Header);
// #endregion Header
// #region MediaWidget
class MediaWidget extends St.BoxLayout {
    constructor(options) {
        super(options);
    }
    _init(options) {
        super._init({
            ...VerticalProp,
            x_expand: true,
            y_expand: true,
            reactive: true,
        });
        this._options = options;
        this._updateStyleClass();
        // Create header
        this._header = new Header({});
        this.add_child(this._header);
        // Create list
        this._list = new MediaList(options);
        this.add_child(this._list);
        this._list.connectObject("notify::empty", this._syncEmpty.bind(this), this);
        this._syncEmpty();
        // Sync page update & page indicator
        this._header.page = this._list.page;
        this._header.maxPage = this._list.maxPage;
        this._list.connectObject("page-updated", (_, page) => {
            if (this._header.page == page)
                return;
            this._header.page = page;
        }, this);
        this._list.connectObject("max-page-updated", (_, maxPage) => {
            if (this._header.maxPage == maxPage)
                return;
            this._header.maxPage = maxPage;
        }, this);
        this._header.connectObject("page-activated", (_, page) => {
            this._list.page = page;
        }, this);
    }
    _syncEmpty() {
        this.visible = !this._list.empty;
    }
    _updateStyleClass() {
        const options = this._options;
        let style = "QSTWEAKS-media";
        if (options.compact)
            style += " QSTWEAKS-message-compact";
        if (options.removeShadow)
            style += " QSTWEAKS-message-remove-shadow";
        this.style_class = style;
    }
}
GObject.registerClass(MediaWidget);
// #endregion MediaWidget
// #region MediaWidgetFeature
export class MediaWidgetFeature extends FeatureBase {
    loadSettings(loader) {
        this.enabled = loader.loadBoolean("media-enabled");
        this.header = loader.loadBoolean("media-show-header");
        this.compact = loader.loadBoolean("media-compact");
        this.removeShadow = loader.loadBoolean("media-remove-shadow");
        this.smoothScrollSpeed = loader.loadInt("media-smooth-scroll-speed");
        // Control buttons
        this.contorlOpacity = loader.loadInt("media-contorl-opacity");
        this.showNextButton = loader.loadBoolean("media-contorl-show-next-button");
        this.showPrevButton = loader.loadBoolean("media-contorl-show-prev-button");
        this.showPauseButton = loader.loadBoolean("media-contorl-show-pause-button");
        // Gradient
        this.gradientBackground = loader.loadRgb("media-gradient-background-color");
        this.gradientEnabled = loader.loadBoolean("media-gradient-enabled");
        this.gradientStartOpaque = loader.loadInt("media-gradient-start-opaque");
        this.gradientStartMix = loader.loadInt("media-gradient-start-mix");
        this.gradientEndOpaque = loader.loadInt("media-gradient-end-opaque");
        this.gradientEndMix = loader.loadInt("media-gradient-end-mix");
        // Progress
        this.progressEnabled = loader.loadBoolean("media-progress-enabled");
        this.sliderStyle = StyledSlider.Options.fromLoader(loader, "media-progress");
        // Round clip
        this.roundClipEnabled = loader.loadBoolean("media-round-clip-enabled");
        const roundClipPaddingValue = loader.loadValue("media-round-clip-padding-adjustment-value");
        const roundClipPaddingEnabled = loader.loadBoolean("media-round-clip-padding-adjustment-enabled");
        this.roundClipPadding = (roundClipPaddingEnabled ? roundClipPaddingValue : null);
    }
    reload(key) {
        // Slider style
        if (StyledSlider.Options.isStyleKey("media-progress", key)) {
            if (!this.enabled)
                return;
            if (!this.progressEnabled)
                return;
            for (const message of this.mediaWidget._list._messages) {
                message._progressControl._createSlider();
            }
            return;
        }
        switch (key) {
            case "media-compact":
            case "media-remove-shadow":
                if (!this.enabled)
                    return;
                this.mediaWidget._updateStyleClass();
                break;
            // Round clip
            case "media-round-clip-enabled":
                if (!this.enabled)
                    return;
                this.mediaWidget._list._initEffect();
                break;
            // Scroll speed
            case "media-smooth-scroll-speed":
                break;
            // Round clip padding
            case "media-round-clip-padding-adjustment-value":
            case "media-round-clip-padding-adjustment-enabled":
                break;
            // Control opacity
            case "media-contorl-opacity":
                if (!this.enabled)
                    return;
                for (const message of this.mediaWidget._list._messages) {
                    message._createControlButtons();
                }
                break;
            // Gradient
            case "media-gradient-background-color":
            case "media-gradient-enabled":
            case "media-gradient-start-opaque":
            case "media-gradient-start-mix":
            case "media-gradient-end-opaque":
            case "media-gradient-end-mix":
                if (!this.enabled)
                    return;
                for (const message of this.mediaWidget._list._messages) {
                    message._updateGradient();
                }
                break;
            default:
                super.reload();
                break;
        }
    }
    onLoad() {
        if (!this.enabled)
            return;
        this.maid.destroyJob(this.mediaWidget = new MediaWidget(this));
        Global.QuickSettingsGrid.add_child(this.mediaWidget);
        Global.QuickSettingsGrid.layout_manager.child_set_property(Global.QuickSettingsGrid, this.mediaWidget, "column-span", 2);
    }
    onUnload() {
        this.mediaWidget = null;
    }
}
// #endregion MediaWidgetFeature
