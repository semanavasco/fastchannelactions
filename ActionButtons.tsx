/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { classes } from "@utils/misc";
import { React, useEffect, useMemo, useState } from "@webpack/common";

import { ActionDef,ACTIONS_BY_KEY, actionsFor,RowKind } from "./actions";
import { ActionTooltip } from "./ActionTooltip";
import { getIcon } from "./icons";
import { getAvailableIds, isAvailable, onRevisionChange, openRealContextMenu, runAction } from "./menuResolver";
import { settings } from "./settings";
import { useHovered, useModifierHeld } from "./useShiftKey";

interface Props {
    channel: any;
    guild?: any;
    /** The channel row the buttons live in; the context menu is opened against it. */
    row?: Element | null;
    /** Categories and channels expose different actions, so each has its own setting. */
    kind?: RowKind;
}

function ActionButton({ action, channel, guild, row }: {
    action: ActionDef; channel: any; guild: any; row?: Element | null;
}) {
    const Icon = getIcon(action.icon);

    const onClick = (e: React.MouseEvent) => {
        // Our buttons sit inside the row's <a>; stop it navigating.
        e.preventDefault();
        e.stopPropagation();
        runAction(action, { channel, guild }, row ?? null);
    };

    const onContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openRealContextMenu(e, row ?? null);
    };

    return (
        <ActionTooltip text={action.label}>
            {tooltipProps => (
                <div
                    {...tooltipProps}
                    className={classes("vc-fca-button", action.danger && "vc-fca-danger")}
                    role="button"
                    tabIndex={0}
                    aria-label={action.label}
                    onClick={e => {
                        // Dismiss the tooltip before the action opens a modal over it.
                        tooltipProps.onClick();
                        onClick(e);
                    }}
                    onContextMenu={onContextMenu}
                    onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") onClick(e as any);
                    }}
                >
                    <Icon />
                </div>
            )}
        </ActionTooltip>
    );
}

function ActionButtonsInner({ channel, guild, row, kind = "channel" }: Props) {
    const held = useModifierHeld();
    const hovered = useHovered(row);
    const enabled = settings.use([
        "enabledActions",
        "enabledCategoryActions",
        "requireModifier",
        "hideNativeButtons"
    ]);

    const configured = kind === "category"
        ? enabled.enabledCategoryActions
        : enabled.enabledActions;

    const actions = useMemo(() => {
        const keys: string[] = (configured ?? "")
            .split(",")
            .map(k => k.trim())
            .filter(Boolean);

        const allowed = new Set(actionsFor(kind).map(a => a.key));

        return keys
            .map(k => ACTIONS_BY_KEY.get(k))
            // A key saved for the other row type must not leak across.
            .filter((a): a is ActionDef => a != null && allowed.has(a.key));
    }, [configured, kind]);

    // Discord only renders menu entries the user is allowed to use, so the menu's item
    // ids tell us which actions apply to this channel. Looked up once per channel and
    // only while the bar is actually visible, so idle rows cost nothing.
    const [availableIds, setAvailableIds] = useState<Set<string> | null>(null);

    // A permission or channel change invalidates the cache; drop what we are holding so
    // the next hover re-reads the menu.
    useEffect(() => {
        const off = onRevisionChange(() => setAvailableIds(null));
        return () => { off(); };
    }, []);
    // Buttons belong to the row the pointer is on, so hover is always required. The
    // modifier is an additional gate on top of it.
    const visible =
        actions.length > 0 && hovered && (!enabled.requireModifier || held);

    useEffect(() => {
        if (!visible || !row || !channel?.id || availableIds) return;

        let cancelled = false;
        getAvailableIds(channel.id, row).then(ids => {
            if (!cancelled) setAvailableIds(ids);
        });

        return () => { cancelled = true; };
    }, [visible, row, channel?.id, availableIds]);

    // Discord's own invite/settings icons are the interactive elements inside the row's
    // top line, excluding our own mount. They are tagged by class so the stylesheet can
    // hide them, and untagged again as soon as our bar goes away.
    useEffect(() => {
        if (!row) return;

        const shouldHide = visible && enabled.hideNativeButtons;

        // Category headers have no `linkTop` wrapper, so fall back to the whole row.
        const scope = row.querySelector("[class*='linkTop']") ?? row;

        const natives = [...scope.querySelectorAll<HTMLElement>(
            "[role='button'], button"
        )].filter(el => !el.closest(".vc-fca-mount"));

        for (const el of natives) el.classList.toggle("vc-fca-native-hidden", shouldHide);

        return () => {
            for (const el of natives) el.classList.remove("vc-fca-native-hidden");
        };
    }, [row, visible, enabled.hideNativeButtons]);

    if (!visible) return null;

    // Until the lookup resolves, show nothing rather than buttons that may not apply.
    if (!availableIds) return null;

    const usable = actions.filter(a => isAvailable(a, availableIds));
    if (!usable.length) return null;

    return (
        <div className="vc-fca-container">
            {usable.map(action => (
                <ActionButton
                    key={action.key}
                    action={action}
                    channel={channel}
                    guild={guild}
                    row={row}
                />
            ))}
        </div>
    );
}

// A crash inside a channel row would take out the whole channel list, so the whole
// bar is wrapped and fails silently to nothing.
export const ActionButtons = ErrorBoundary.wrap(ActionButtonsInner, { noop: true });
