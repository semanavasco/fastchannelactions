/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * The catalogue of actions that can be surfaced as a hover button.
 *
 * `menuId` is the id Discord gives the corresponding item in the `channel-context`
 * context menu. We never reimplement the action ourselves; we locate the real menu
 * item by this id and invoke its onClick. That way we inherit Discord's own
 * permission checks, confirmation modals and behaviour for free, and the plugin
 * keeps working across Discord updates as long as the ids are stable.
 *
 * Ids are listed most-likely-first: Discord has renamed a few of these over time,
 * so several candidates are tried in order.
 */

export interface ActionDef {
    /** Stable key used in settings storage. */
    key: string;
    /** Human readable name shown in the plugin settings. */
    label: string;
    /** Candidate context menu item ids, tried in order. */
    menuIds: string[];
    /**
     * Match ids by prefix rather than equality. Discord suffixes some ids with the
     * channel id (e.g. `devmode-copy-id-123456`), so those need a prefix match.
     */
    prefixMatch?: boolean;
    /** Which icon to draw for this action. */
    icon: string;
    /** Tint the button red, like Discord does for destructive menu entries. */
    danger?: boolean;
    /**
     * Which row types this action applies to. Categories and channels share the same
     * `channel-context` menu and most of its item ids, but each has entries the other
     * does not (collapsing is category-only, invites are channel-only).
     */
    scope?: "channel" | "category" | "both";
}

/** Rows the buttons can be attached to. */
export type RowKind = "channel" | "category";

export function actionsFor(kind: RowKind): ActionDef[] {
    return ACTIONS.filter(a => (a.scope ?? "channel") === kind || a.scope === "both");
}

export const ACTIONS: ActionDef[] = [
    // --- Shared between channels and categories -----------------------------------
    {
        key: "markAsRead",
        label: "Mark As Read",
        menuIds: ["mark-channel-read", "mark-as-read"],
        icon: "markAsRead",
        scope: "both"
    },
    {
        key: "mute",
        label: "Mute / Unmute",
        // Categories reuse the channel ids, labelled "Mute Category". The timed options
        // ("For 15 Minutes", ...) are siblings of this entry rather than children, so
        // this one is directly clickable and mutes until turned back on.
        menuIds: ["mute-channel", "unmute-channel"],
        icon: "mute",
        scope: "both"
    },
    {
        key: "notifications",
        label: "Notification Settings",
        menuIds: ["channel-notifications", "notifications"],
        icon: "bell",
        scope: "both"
    },
    {
        key: "edit",
        label: "Edit",
        menuIds: ["edit-channel", "channel-settings"],
        icon: "cog",
        scope: "both"
    },
    {
        key: "delete",
        label: "Delete",
        menuIds: ["delete-channel"],
        icon: "delete",
        danger: true,
        scope: "both"
    },
    {
        key: "copyId",
        label: "Copy ID",
        // Discord renders this as `devmode-copy-id-<id>`.
        menuIds: ["devmode-copy-id", "copy-id"],
        prefixMatch: true,
        icon: "copyId",
        scope: "both"
    },

    // --- Channels only --------------------------------------------------------------
    {
        key: "invite",
        label: "Invite to Channel",
        menuIds: ["invite-people", "invite-to-channel", "create-instant-invite"],
        icon: "invite"
    },
    {
        key: "pin",
        label: "Pin Channel to Top",
        menuIds: ["pin-channel", "unpin-channel"],
        icon: "pin"
    },
    {
        key: "copyLink",
        label: "Copy Link",
        menuIds: ["channel-copy-link", "copy-link"],
        icon: "link"
    },
    {
        key: "duplicate",
        label: "Duplicate Channel",
        menuIds: ["clone-channel", "duplicate-channel"],
        icon: "duplicate"
    },
    {
        key: "createText",
        label: "Create Text Channel",
        menuIds: ["create-text-channel", "create-channel"],
        icon: "plus"
    },

    // --- Categories only ------------------------------------------------------------
    {
        key: "collapseCategory",
        label: "Collapse Category",
        menuIds: ["collapse-category"],
        icon: "collapse",
        scope: "category"
    },
    {
        key: "collapseAll",
        label: "Collapse All Categories",
        menuIds: ["collapse-all-categories"],
        icon: "collapseAll",
        scope: "category"
    }
];

export const ACTIONS_BY_KEY = new Map(ACTIONS.map(a => [a.key, a]));

/** Order in which the buttons are rendered, matching the context menu order. */
export const DEFAULT_ORDER = ACTIONS.map(a => a.key);
