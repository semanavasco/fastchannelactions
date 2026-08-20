/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { ChannelStore, createRoot, GuildStore, React } from "@webpack/common";

import { ActionButtons } from "./ActionButtons";
import { clearAvailabilityCache, debugDump } from "./menuResolver";
import { settings } from "./settings";
import { cleanupShiftKey, setModifier } from "./useShiftKey";

const logger = new Logger("FastChannelActions");

/**
 * Rather than patching Discord's channel row - a lazily loaded, heavily minified
 * component whose shape changes often - we mount our button bar into the row's existing
 * icon container from the DOM side.
 *
 * The anchor we need is stable and observable: every channel row is an
 * `<a data-list-item-id="channels___<channelId>">`. That id gives us the channel
 * directly, with no reliance on minified internals.
 *
 * The row markup is:
 *
 *   li.containerDefault
 *     div.iconVisibility.wrapper
 *       div
 *         a.link            [data-list-item-id="channels___<id>"]
 *           div.linkTop     <- channel icon, name, and the native hover icons
 */

// The attribute sits on the row's own element, not on the wrapping <li>. Channels use an
// anchor (they navigate); categories use a div (they collapse), so match on the attribute
// rather than the tag.
const ROW_SELECTOR = "[data-list-item-id^='channels___']";
const MOUNT_CLASS = "vc-fca-mount";

const roots = new Map<Element, any>();
let observer: MutationObserver | null = null;

function channelIdOf(row: Element): string | null {
    const raw = row.getAttribute("data-list-item-id");
    if (!raw) return null;

    // Discord builds these as `${listId}___${itemId}` and parses them back with
    // split("___")[1], so mirror that exactly. Category/placeholder rows have a
    // non-numeric tail and are skipped.
    const id = raw.split("___")[1];
    return id && /^\d+$/.test(id) ? id : null;
}

/**
 * `linkTop` holds the channel icon, the name and Discord's own hover icons, so it is
 * where our buttons belong. Fall back to the anchor itself if the class ever changes -
 * the buttons then still render, just at the row's end.
 */
function mountPointFor(row: Element): Element | null {
    // Channels put the icons in `linkTop`; category headers have no such wrapper, so the
    // row element itself is the host.
    const host = row.querySelector("[class*='linkTop']") ?? row;

    let mount = host.querySelector(`:scope > .${MOUNT_CLASS}`);
    if (!mount) {
        mount = document.createElement("div");
        mount.className = MOUNT_CLASS;
        host.appendChild(mount);
    }
    return mount;
}

/** Discord's channel type for a category. */
const GUILD_CATEGORY = 4;

function mountRow(row: Element) {
    if (roots.has(row)) return;

    const channelId = channelIdOf(row);
    if (!channelId) return;

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return;

    const mount = mountPointFor(row);
    if (!mount) return;

    try {
        const root = createRoot(mount as HTMLElement);
        const guild = channel.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
        // Categories are just channels of type 4, so the store tells us which set of
        // actions applies without having to recognise the row's markup.
        const kind = channel.type === GUILD_CATEGORY ? "category" : "channel";
        root.render(React.createElement(ActionButtons, { channel, guild, row, kind }));
        roots.set(row, root);
    } catch (err) {
        logger.error("Failed to mount action buttons", err);
    }
}

function unmountRow(row: Element) {
    const root = roots.get(row);
    if (!root) return;
    roots.delete(row);
    // Unmounting synchronously during a React commit throws; defer it.
    setTimeout(() => {
        try {
            root.unmount();
        } catch { /* row already gone */ }
    }, 0);
}

function scan() {
    for (const row of document.querySelectorAll(ROW_SELECTOR)) mountRow(row);

    // Drop roots whose rows have been removed from the document (scrolling, server switch).
    for (const row of [...roots.keys()]) {
        if (!row.isConnected) unmountRow(row);
    }
}

export default definePlugin({
    name: "FastChannelActions",
    description:
        "Shift-hover a channel or category to reveal one-click buttons for the actions you pick (delete, mark as read, invite, collapse, ...), without opening the right click menu.",
    authors: [{ name: "svasco", id: 0n }],
    settings,

    /**
     * Debug helper. Run from DevTools with a server open:
     *
     *   Vencord.Plugins.plugins.FastChannelActions.diagnose()
     */
    diagnose() {
        const row = document.querySelector(ROW_SELECTOR);
        if (!row) return console.log("[FCA] no channel rows found");

        const id = channelIdOf(row);
        const channel = id ? ChannelStore.getChannel(id) : null;
        const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;

        console.log("[FCA] rows:", document.querySelectorAll(ROW_SELECTOR).length);
        console.log("[FCA] mounts:", document.querySelectorAll(`.${MOUNT_CLASS}`).length);
        console.log("[FCA] channel:", channel?.name, "guild:", (guild as any)?.name);
        console.log("[FCA] enabledActions:", settings.store.enabledActions);
        console.log("[FCA] requireModifier:", settings.store.requireModifier);

        // The important part: which menu items can we actually see for this row?
        return debugDump(channel, guild, row);
    },

    /**
     * Availability is derived from Discord's context menu, so it has to be re-read
     * whenever something could change which entries that menu offers: the channel
     * itself, the roles it grants, or this user's membership.
     */
    flux: {
        CHANNEL_UPDATES: ({ channels }: any) => {
            for (const c of channels ?? []) clearAvailabilityCache(c?.id);
        },
        CHANNEL_UPDATE: ({ channel }: any) => clearAvailabilityCache(channel?.id),
        CHANNEL_DELETE: ({ channel }: any) => clearAvailabilityCache(channel?.id),
        // Role and membership changes can affect every channel at once, so the whole
        // cache goes rather than trying to work out which rows are implicated.
        GUILD_ROLE_UPDATE: () => clearAvailabilityCache(),
        GUILD_ROLE_CREATE: () => clearAvailabilityCache(),
        GUILD_ROLE_DELETE: () => clearAvailabilityCache(),
        GUILD_MEMBER_UPDATE: () => clearAvailabilityCache(),
        GUILD_CREATE: () => clearAvailabilityCache()
    },

    start() {
        setModifier(settings.store.modifierKey ?? "Shift");

        scan();
        observer = new MutationObserver(() => scan());
        observer.observe(document.body, { childList: true, subtree: true });
    },

    stop() {
        observer?.disconnect();
        observer = null;

        for (const row of [...roots.keys()]) unmountRow(row);

        for (const mount of document.querySelectorAll(`.${MOUNT_CLASS}`)) mount.remove();

        cleanupShiftKey();
    }
});
