/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Margins } from "@utils/margins";
import { OptionType } from "@utils/types";
import { useMemo } from "@webpack/common";

import { actionsFor, RowKind } from "./actions";
import { getIcon } from "./icons";

/**
 * The set of enabled actions is stored as a comma separated list of action keys.
 * A plain string keeps it trivially serialisable in Vencord's settings store while the
 * COMPONENT setting below renders it as a proper toggle list.
 */
function makePicker(kind: RowKind, heading: string, blurb: string) {
    const settingKey = kind === "category" ? "enabledCategoryActions" : "enabledActions";
    const available = actionsFor(kind);

    return function ActionPicker({ setValue }: { setValue: (v: string) => void; }) {
        const current = (settings.use([settingKey as any]) as any)[settingKey] ?? "";

        const selected = useMemo(
            () => new Set<string>(
                current.split(",").map((s: string) => s.trim()).filter(Boolean)
            ),
            [current]
        );

        // Persist in catalogue order so the buttons always render in a stable order,
        // regardless of the order the user toggled them in.
        const commit = (next: Set<string>) =>
            setValue(available.filter(a => next.has(a.key)).map(a => a.key).join(","));

        return (
            <section>
                <Heading tag="h3">{heading}</Heading>
                <Paragraph className={Margins.bottom8}>{blurb}</Paragraph>

                {available.map(action => {
                    const Icon = getIcon(action.icon);
                    return (
                        <FormSwitch
                            key={action.key}
                            value={selected.has(action.key)}
                            onChange={enabled => {
                                const next = new Set(selected);
                                enabled ? next.add(action.key) : next.delete(action.key);
                                commit(next);
                            }}
                            title={
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                    <Icon />
                                    {action.label}
                                </span>
                            }
                            description={
                                action.danger
                                    ? "Destructive - Discord will still ask you to confirm."
                                    : undefined
                            }
                        />
                    );
                })}
            </section>
        );
    };
}

export const settings = definePluginSettings({
    enabledActions: {
        type: OptionType.COMPONENT,
        description: "Actions to show on channel hover",
        default: "markAsRead,delete",
        component: makePicker(
            "channel",
            "Channel Actions",
            "Pick which actions appear as hover buttons on channels. Actions you lack " +
            "permission for are hidden automatically, per channel."
        )
    },

    enabledCategoryActions: {
        type: OptionType.COMPONENT,
        description: "Actions to show on category hover",
        default: "collapseCategory,markAsRead",
        component: makePicker(
            "category",
            "Category Actions",
            "Pick which actions appear as hover buttons on category headers."
        )
    },

    requireModifier: {
        type: OptionType.BOOLEAN,
        description: "Only show the buttons while the modifier key is held",
        default: true
    },

    skipConfirmation: {
        type: OptionType.BOOLEAN,
        description:
            "Delete channels immediately, without Discord's confirmation dialog (there is no undo)",
        default: false
    },

    modifierKey: {
        type: OptionType.SELECT,
        description: "Modifier key that reveals the buttons",
        options: [
            { label: "Shift", value: "Shift", default: true },
            { label: "Ctrl", value: "Control" },
            { label: "Alt", value: "Alt" },
            { label: "Super / Meta", value: "Meta" }
        ],
        onChange: (value: string) => {
            // Applied live so the user does not have to restart to try a different key.
            import("./useShiftKey").then(m => m.setModifier(value));
        }
    },

    hideNativeButtons: {
        type: OptionType.BOOLEAN,
        description:
            "Hide Discord's own invite/settings icons on a row while these buttons are showing",
        default: false
    }
});
