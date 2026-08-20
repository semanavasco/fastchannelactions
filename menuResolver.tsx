/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findByPropsLazy } from "@webpack";
import { ContextMenuApi, React } from "@webpack/common";

import { ActionDef } from "./actions";
import { settings } from "./settings";

/**
 * Discord's channel settings actions. `deleteChannel` issues the DELETE directly,
 * bypassing the confirmation modal that the context menu item shows first - which is
 * exactly what the "skip confirmation" setting is for.
 */
const ChannelSettingsActions = findByPropsLazy("deleteChannel", "updateChannel");

const logger = new Logger("FastChannelActions");

/**
 * Executing a channel action means running Discord's own context menu item, so that
 * permission checks, confirmation modals and side effects all behave exactly as they do
 * from a real right click.
 *
 * Rendering that menu ourselves is not possible: it is a normal React component built on
 * hooks, and calling it outside a render pass throws (React error #321). Instead we let
 * Discord open the menu for real - React renders it properly, hooks and all - and hook
 * into Vencord's context menu API to read the rendered items as they go by. We find the
 * item we want, fire its handler, and close the menu.
 *
 * The menu is opened at the click coordinates and closed in the same tick, so it never
 * becomes visible to the user.
 */

interface ResolveArgs {
    channel: any;
    guild: any;
}

/** Recursively walk rendered menu children, collecting every node that carries an id. */
function walk(node: any, out: Map<string, any>, depth = 0) {
    if (node == null || depth > 24) return;

    if (Array.isArray(node)) {
        for (const child of node) walk(child, out, depth + 1);
        return;
    }

    if (!React.isValidElement(node)) return;

    const props: any = (node as any).props ?? {};

    if (typeof props.id === "string" && !out.has(props.id)) out.set(props.id, node);

    if (props.children != null) walk(props.children, out, depth + 1);
}

function findItem(items: Map<string, any>, action: ActionDef) {
    for (const id of action.menuIds) {
        if (action.prefixMatch) {
            for (const [key, item] of items) {
                if (key.startsWith(id)) return item;
            }
        } else {
            const item = items.get(id);
            if (item) return item;
        }
    }
    return null;
}

/**
 * Open the channel's real context menu and capture its rendered items.
 *
 * Two details of Discord's implementation drive the shape of this:
 *
 *  - Its opener bails out unless `event.currentTarget.contains(event.target)`, and
 *    `currentTarget` is only populated by a genuine dispatch. So we dispatch a real
 *    event on the row rather than hand-rolling an event object.
 *  - The menu body lives in a lazily loaded chunk, so it renders a tick or more after
 *    the event. Capturing therefore has to be asynchronous.
 */
function captureMenu(row: Element, timeoutMs = 2000): Promise<Map<string, any> | null> {
    return new Promise(resolve => {
        const items = new Map<string, any>();
        let done = false;

        // The menu really is opened, so hide it for the moment it exists.
        document.body.classList.add("vc-fca-capturing");

        const finish = (ok: boolean) => {
            if (done) return;
            done = true;
            Vencord.Api.ContextMenu.removeGlobalContextMenuPatch(patch);
            clearTimeout(timer);
            // Close the menu we opened purely to read it.
            try {
                ContextMenuApi.closeContextMenu();
            } catch { /* already closed */ }
            document.body.classList.remove("vc-fca-capturing");
            resolve(ok ? items : null);
        };

        const patch = (navId: string, children: any) => {
            // Only the channel menu is of interest; other menus may be open.
            if (navId !== "channel-context") return;
            walk(children, items);
            // Let the menu finish rendering before tearing it down.
            setTimeout(() => finish(true), 0);
        };

        const timer = setTimeout(() => finish(false), timeoutMs);

        Vencord.Api.ContextMenu.addGlobalContextMenuPatch(patch);

        // Dispatch on the deepest element so `currentTarget.contains(target)` holds.
        const target = (row.querySelector("[class*='linkTop']") ?? row) as HTMLElement;
        const rect = target.getBoundingClientRect();

        target.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            buttons: 2,
            clientX: Math.round(rect.left + rect.width / 2),
            clientY: Math.round(rect.top + rect.height / 2)
        }));
    });
}

/**
 * Which menu ids exist for a channel, cached so that hovering a row costs at most one
 * menu open per channel rather than one per button.
 */
const availabilityCache = new Map<string, Set<string>>();

/**
 * Report the set of menu ids available for a channel, opening its menu once to find out.
 * Concurrent callers for the same channel share a single lookup.
 */
const inFlight = new Map<string, Promise<Set<string>>>();

export function getAvailableIds(channelId: string, row: Element): Promise<Set<string>> {
    const cached = availabilityCache.get(channelId);
    if (cached) return Promise.resolve(cached);

    const existing = inFlight.get(channelId);
    if (existing) return existing;

    const promise = captureMenu(row).then(items => {
        const ids = new Set(items ? items.keys() : []);
        // Only cache a successful capture; a failed one should be retried later.
        if (items) availabilityCache.set(channelId, ids);
        inFlight.delete(channelId);
        return ids;
    });

    inFlight.set(channelId, promise);
    return promise;
}

/** Does this channel offer the given action? */
export function isAvailable(action: ActionDef, ids: Set<string>): boolean {
    for (const id of action.menuIds) {
        if (action.prefixMatch) {
            for (const key of ids) if (key.startsWith(id)) return true;
        } else if (ids.has(id)) {
            return true;
        }
    }
    return false;
}

/**
 * Bumped whenever the cache is invalidated. Mounted button bars watch this so they drop
 * the ids they are holding in state and look them up again on the next hover.
 */
let revision = 0;
const revisionListeners = new Set<(r: number) => void>();

export function getRevision() {
    return revision;
}

export function onRevisionChange(cb: (r: number) => void) {
    revisionListeners.add(cb);
    return () => revisionListeners.delete(cb);
}

/** Permissions can change at runtime; let the next hover re-check. */
export function clearAvailabilityCache(channelId?: string) {
    if (channelId) {
        availabilityCache.delete(channelId);
        inFlight.delete(channelId);
    } else {
        availabilityCache.clear();
        inFlight.clear();
    }

    revision++;
    for (const cb of revisionListeners) cb(revision);
}

/**
 * Fire the given action for a channel by opening its real context menu and invoking the
 * matching item's handler.
 */
export async function runAction(action: ActionDef, args: ResolveArgs, row: Element | null) {
    if (!row) {
        logger.error("No row element; cannot open channel context menu");
        return;
    }

    // Deleting through the menu item always raises Discord's confirmation modal. When
    // the user has opted out of it, call the underlying action creator instead - the
    // whole point of the plugin being to make this a single click.
    if (action.key === "delete" && settings.store.skipConfirmation) {
        const id = args.channel?.id;
        if (!id) {
            logger.error("No channel id; cannot delete");
            return;
        }

        try {
            await ChannelSettingsActions.deleteChannel(id);
        } catch (err) {
            logger.error("Failed to delete channel", err);
        }
        return;
    }

    const items = await captureMenu(row);

    if (!items) {
        logger.error("Context menu did not render - cannot run action", action.key);
        return;
    }

    const item = findItem(items, action);
    if (!item) {
        logger.warn(
            `No menu item for "${action.key}" on this channel. Available ids:`,
            [...items.keys()]
        );
        return;
    }

    const handler = item.props?.action ?? item.props?.onClick;

    if (typeof handler !== "function") {
        // Mute and Notification Settings are submenus: the entry itself has no handler,
        // it only reveals a list of durations or levels. There is nothing sensible to
        // fire in one click, so open the real menu and let the user pick a value.
        logger.info(`"${action.key}" is a submenu; opening the real context menu`);
        openMenuAt(row);
        return;
    }

    try {
        handler();
    } catch (err) {
        logger.error(`Action "${action.key}" threw`, err);
    }
}

/**
 * Dispatch a genuine contextmenu event on a row. Discord's opener ignores synthetic
 * events whose `currentTarget` does not contain their `target`, so this has to be a real
 * dispatch on an element inside the row.
 */
function openMenuAt(row: Element, at?: { x: number; y: number; }) {
    const target = (row.querySelector("[class*='linkTop']") ?? row) as HTMLElement;
    const rect = target.getBoundingClientRect();

    target.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: at?.x ?? Math.round(rect.left + rect.width / 2),
        clientY: at?.y ?? Math.round(rect.top + rect.height / 2)
    }));
}

/** Open the genuine context menu for the row, at the pointer. */
export function openRealContextMenu(event: React.MouseEvent, row: Element | null) {
    const base = row ?? (event.currentTarget as Element);
    openMenuAt(base, { x: event.clientX, y: event.clientY });
}

/**
 * Debug helper: list every menu item id available for a channel row.
 *
 *   Vencord.Plugins.plugins.FastChannelActions.diagnose()
 */
export async function debugDump(_channel: any, _guild: any, row?: Element | null) {
    const target = row ?? document.querySelector("a[data-list-item-id^='channels___']");
    if (!target) {
        console.log("[FCA] no channel row to inspect");
        return;
    }

    const items = await captureMenu(target);

    if (!items) {
        console.log("[FCA] no context menu rendered");
        return;
    }

    const rows = [...items].map(([id, item]) => ({
        id,
        label: typeof item.props?.label === "string" ? item.props.label : "(non-string)",
        hasAction: typeof item.props?.action === "function",
        hasOnClick: typeof item.props?.onClick === "function",
        disabled: !!item.props?.disabled
    }));

    console.table(rows);
    return rows;
}
