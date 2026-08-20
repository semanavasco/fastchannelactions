/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useRef, useState } from "@webpack/common";

/**
 * Tracks whether the modifier key is currently held.
 *
 * A single window-level listener set is shared by every channel row: mounting one pair
 * of listeners per visible channel would be hundreds of listeners in a large server.
 * Subscribers are notified through a small store instead.
 */

type Listener = (held: boolean) => void;

const listeners = new Set<Listener>();
let held = false;
let attached = false;
let modifier: string = "Shift";

function isModifierHeld(e: KeyboardEvent | MouseEvent): boolean {
    switch (modifier) {
        case "Control": return e.ctrlKey;
        case "Alt": return e.altKey;
        case "Meta": return e.metaKey;
        default: return e.shiftKey;
    }
}

function set(next: boolean) {
    if (next === held) return;
    held = next;
    for (const l of listeners) l(held);
}

function onKeyDown(e: KeyboardEvent) {
    set(isModifierHeld(e));
}

function onKeyUp(e: KeyboardEvent) {
    set(isModifierHeld(e));
}

// Alt-tabbing away while holding the key would otherwise leave it stuck on.
function onBlur() {
    set(false);
}

function attach() {
    if (attached) return;
    attached = true;
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
}

function detach() {
    if (!attached) return;
    attached = false;
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onBlur);
    set(false);
}

export function setModifier(key: string) {
    modifier = key;
}

/** Tear down listeners when the plugin stops. */
export function cleanupShiftKey() {
    listeners.clear();
    detach();
}

export function useModifierHeld(): boolean {
    const [value, setValue] = useState(held);

    useEffect(() => {
        attach();
        listeners.add(setValue);
        // Sync in case the key state changed between render and effect.
        setValue(held);

        return () => {
            listeners.delete(setValue);
            if (listeners.size === 0) detach();
        };
    }, []);

    return value;
}

/**
 * Whether the pointer is currently over the given row.
 *
 * The buttons live inside the row, so a naive mouseleave fires as soon as the pointer
 * moves onto one of our own buttons. Checking against the row element itself avoids
 * that flicker.
 */
export function useHovered(row: Element | null | undefined): boolean {
    const [hovered, setHovered] = useState(false);
    const rowRef = useRef(row);
    rowRef.current = row;

    useEffect(() => {
        if (!row) return;

        const onEnter = () => setHovered(true);
        const onLeave = (e: MouseEvent) => {
            // Ignore transitions into descendants (our own buttons included).
            const next = e.relatedTarget as Node | null;
            if (next && row.contains(next)) return;
            setHovered(false);
        };

        row.addEventListener("mouseenter", onEnter);
        row.addEventListener("mouseleave", onLeave as EventListener);

        // The pointer may already be over the row when we mount.
        if (row.matches(":hover")) setHovered(true);

        return () => {
            row.removeEventListener("mouseenter", onEnter);
            row.removeEventListener("mouseleave", onLeave as EventListener);
        };
    }, [row]);

    return hovered;
}
