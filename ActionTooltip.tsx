/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, ReactDOM, useEffect, useState } from "@webpack/common";

/**
 * A tooltip for the channel row buttons.
 *
 * Vencord's `Tooltip` renders its popup as a sibling within the current React tree. Our
 * buttons live in a `createRoot` of their own, mounted inside a channel row, so that
 * popup ends up clipped inside the row and never becomes visible. Instead we portal the
 * tooltip out to Discord's app root and position it ourselves, which also lets it escape
 * the row's overflow entirely.
 *
 * The markup mirrors Discord's own tooltip classes so it inherits the native styling
 * rather than approximating it.
 */

interface Props {
    text: string;
    children: (props: {
        onMouseEnter(e: React.MouseEvent): void;
        onMouseLeave(): void;
        onClick(): void;
    }) => React.ReactNode;
}

function findLayer(): HTMLElement {
    return (
        document.querySelector<HTMLElement>("#app-mount") ??
        document.body
    );
}

/** Enough room for the tooltip plus its arrow and a little breathing space. */
const TOOLTIP_HEIGHT = 44;
const EDGE_PADDING = 8;

interface Position {
    x: number;
    y: number;
    /** Rendered below the button instead of above, when there is no room above. */
    below: boolean;
}

export function ActionTooltip({ text, children }: Props) {
    const [pos, setPos] = useState<Position | null>(null);

    // A tooltip left open when the button disappears (unhover, modifier release) would
    // otherwise linger on screen.
    useEffect(() => () => setPos(null), []);

    const show = (e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

        // Channel rows near the top of the sidebar have no room above them, so the
        // tooltip flips underneath rather than being cut off by the window.
        const below = rect.top < TOOLTIP_HEIGHT + EDGE_PADDING;

        // Keep the tooltip inside the viewport horizontally too; a long label on a
        // narrow sidebar would otherwise overflow the left edge.
        const x = Math.max(
            EDGE_PADDING,
            Math.min(rect.left + rect.width / 2, window.innerWidth - EDGE_PADDING)
        );

        setPos({ x, y: below ? rect.bottom : rect.top, below });
    };

    const hide = () => setPos(null);

    return (
        <>
            {children({ onMouseEnter: show, onMouseLeave: hide, onClick: hide })}
            {pos && ReactDOM.createPortal(
                <div
                    className={pos.below ? "vc-fca-tooltip vc-fca-tooltip-below" : "vc-fca-tooltip"}
                    style={{ left: pos.x, top: pos.y }}
                    role="tooltip"
                >
                    <div className="vc-fca-tooltip-content">{text}</div>
                    <div className="vc-fca-tooltip-arrow" />
                </div>,
                findLayer()
            )}
        </>
    );
}
