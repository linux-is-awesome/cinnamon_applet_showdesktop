/*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* This code is based on Show desktop ++ applet by mohammad-sn.
*/

const Applet = imports.ui.applet;
const Settings = imports.ui.settings;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Tweener = imports.ui.tweener;
const Gtk = imports.gi.Gtk;
const Clutter = imports.gi.Clutter;
const SignalManager = imports.misc.signalManager;
const GLib = imports.gi.GLib;

function ShowDesktopApplet(metadata, orientation, panelHeight, instance_id) {
    this._init(metadata, orientation, panelHeight, instance_id);
}

function main(metadata, orientation, panelHeight, instance_id) {
    return new ShowDesktopApplet(metadata, orientation, panelHeight, instance_id);
}

ShowDesktopApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,

    // default methods
    
    _init: function(metadata, orientation, panelHeight, instance_id) {
        // initialize applet
        Applet.IconApplet.prototype._init.call(this, orientation, panelHeight, instance_id);
        Gtk.IconTheme.get_default().append_search_path(metadata.path);
        // create settings
        this.settings = new Settings.AppletSettings(this, metadata.uuid, this.instance_id);
        // call handler
        this.handleInit();
    },

    on_applet_clicked: function(event) {
        this.handleClick(event);
    },
    
    on_applet_removed_from_panel: function() {
        this.handleRemoveFromPanel();
    },
    
    // custom handlers
    
    handleInit: function() {
        // bind settings
        this.settings.bindProperty(Settings.BindingDirection.IN, "showIcon", "showIcon", this.handleSettings, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "iconName", "iconName", this.handleSettings, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "borderPlacement", "borderPlacement", this.handleSettings, null);
        this.settings.bindProperty(Settings.BindingDirection.TWO_WAY, "width", "width", this.handleSettings, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "enablePeek", "enablePeek", this.handleSettings, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "opacifyDesklets", "opacifyDesklets", null, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "peekOpacity", "peekOpacity", null, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "blur", "blur", this.handleSettings, null);
        // bind events and signals
        this.signals = new SignalManager.SignalManager(this);
        this.actor.connect("enter-event", Lang.bind(this, this.handleMouseEnter));
        this.actor.connect("leave-event", Lang.bind(this, this.handleMouseLeave));
        this.signals.connect(global.stage, "notify::key-focus", Lang.bind(this, this.handleMouseEnter));
        this.scroll_connector = this.actor.connect("scroll-event", Lang.bind(this, this.handleScroll));
        // set default values
        this.peekPerformed = false;
        this.peekTimeoutId = null;
        this.styleClassBackup = this.actor.styleClass;
        // apply settings
        this.handleSettings();
    },

    handleSettings: function() {
        // apply icon
        if (this.showIcon) {
            const icon_file = Gio.File.new_for_path(this.iconName);
            if (icon_file.query_exists(null)) {
               this.set_applet_icon_path(this.iconName);
            } else {
               this.set_applet_icon_name(this.iconName);
            }
        }
        // apply width
        this.actor.width = this.width;
        // apply styles
        this.updateStyles();
        // if blur or peek is disabled, check windows to remove blur effect
        if (!this.enablePeek || !this.blur) {
            this.clearWindowsBlur();
        }
    },

    handleClick: function(event) {
        global.screen.toggle_desktop(global.get_current_time());
        this.clearPeekTimeout();
        this.removeWindowsOpacity(0);
        this.peekPerformed = false;
    },

    handleScroll: function(actor, event) {
        this.clearPeekTimeout();
        //switch workspace
        const index = global.screen.get_active_workspace_index() + event.get_scroll_direction() * 2 - 1;
        if (global.screen.get_workspace_by_index(index) !== null) {
            global.screen.get_workspace_by_index(index).activate(global.get_current_time());
        }
    },

    handleMouseEnter: function(event) {
        if (this.enablePeek){
            this.clearPeekTimeout();
            this.peekTimeoutId = Mainloop.timeout_add(400, Lang.bind(this, function () {
                if (this.actor.hover &&
                        !this._applet_context_menu.isOpen &&
                            !global.settings.get_boolean("panel-edit-mode")) {
                    this.peekPerformed = true;
                    this.addWindowsOpacity(0.3);
                }
            }));
        }
    },

    handleMouseLeave: function(event) {
        if (this.peekPerformed) {
            this.removeWindowsOpacity(0.2);
            this.peekPerformed = false;
        }
        this.clearPeekTimeout();
    },

    handleRemoveFromPanel: function() {
        this.removeWindowsOpacity(0);
        this.clearWindowsBlur();
        this.settings.finalize();
        this.signals.disconnectAllSignals();
    },

    // custom methods

    addWindowsOpacity: function(time) {
        // add blur if enabled
        if (this.blur) {
            for (let window of global.get_window_actors()) {         
                if (!window.showDesktopBlurEffect) {
                    window.showDesktopBlurEffect = new Clutter.BlurEffect();
                }
                window.add_effect_with_name("blur", window.showDesktopBlurEffect);
            }
        }
        // set opacity         
        this.setWindowsOpacity({
            "opacity": 255 - (255/100 * this.peekOpacity),
            "time": time,
            "transition": "easeOutSine"
        });
    },

    removeWindowsOpacity: function(time) {
        // remove blur if enabled
        if (this.blur) {
            for (let window of global.get_window_actors()) {         
                if (window.showDesktopBlurEffect) {
                    window.remove_effect(window.showDesktopBlurEffect);
                }
            }
        }
        // set opacity
        this.setWindowsOpacity({
            "opacity": 255,
            "time": time,
            "transition": "easeOutSine"
        });
    },
    
    setWindowsOpacity: function(params) {
        Tweener.addTween(global.window_group, params);
        if (this.opacifyDesklets) {
            Tweener.addTween(Main.deskletContainer.actor, params);
        }
    },

    updateStyles: function() {
        this.actor.styleClass = this.styleClassBackup + " showdesktop-applet " + (
            this.borderPlacement && this.borderPlacement !== "none" ?
            "showdesktop-applet_border-" + this.borderPlacement:
            ""
        );
    },
    
    clearPeekTimeout: function() {
        if (this.peekTimeoutId && !this.peekPerformed) {
            Mainloop.source_remove(this.peekTimeoutId);
        }
        this.peekTimeoutId = null;
    },

    clearWindowsBlur: function() {
        for (let window of global.get_window_actors()) {         
            if (window.showDesktopBlurEffect) {
                window.showDesktopBlurEffect = null;
            }
        }
    }

};
