# Development notes

## Layout

```
index.tsx           mounts the button bar into each channel/category row
actions.ts          catalogue of actions, their menu ids, and which rows they apply to
menuResolver.tsx    opens the real context menu, reads it, invokes handlers
ActionButtons.tsx   the hover button bar
ActionTooltip.tsx   portalled tooltip matching Discord's styling
settings.tsx        settings UI (per-action toggles, per row type)
useShiftKey.ts      shared modifier-key and hover tracking
icons.tsx           16px icons matching Discord's sizing
style.css
```

## Working on it

The plugin lives in a Vencord checkout at `src/userplugins/fastChannelActions`. The
installer puts it there; for development, symlink instead so edits apply directly:

```bash
ln -s "$PWD" /path/to/Vencord/src/userplugins/fastChannelActions
cd /path/to/Vencord
pnpm build --watch
```

Vencord only _loads_ `dist/`; it never compiles. Every source change needs a rebuild, and
the client needs a reload (`Ctrl+R`) to pick up a new bundle.

After building, sanity check:

```bash
grep -c FastChannelActions dist/vencordDesktopRenderer.js   # must be 1
```

## Design decisions

**Actions are never reimplemented.** Each one runs Discord's own context menu handler, so
permission checks, confirmation modals and side effects all behave natively and keep
working when Discord changes them. The only exception is _delete without confirmation_,
which calls the `deleteChannel` action creator directly to bypass the modal.

**Buttons are mounted from the DOM, not via a webpack patch.** The channel row lives in a
lazily loaded chunk whose minified shape could not be pinned down reliably; two attempts
at a patch anchor silently matched nothing. `data-list-item-id` is an attribute Discord
builds and parses itself, which makes it a far more stable anchor.

**The tooltip is custom.** Each row is mounted in its own React root, so Vencord's
`Tooltip` renders inside the row and gets clipped. Ours portals to `#app-mount`.

**Availability is read from the menu, not computed.** Discord omits menu entries the user
cannot use, so the set of ids present _is_ the permission answer. Results are cached per
channel and invalidated by Flux events (`CHANNEL_UPDATE`, `GUILD_ROLE_*`,
`GUILD_MEMBER_UPDATE`).

## Verified against Discord's own code

These were checked against the live bundle and DOM rather than assumed. If something
breaks after a Discord update, start here:

- Row ids are built as `` `${listId}___${itemId}` `` and parsed with `.split("___")[1]`.
  Channel rows are `<a>`, category rows are `<div>`, so the selector matches on the
  attribute, not the tag.
- Menu item handlers use the `action` prop; `onClick` is a legacy fallback.
- `devmode-copy-id` is suffixed with the channel id, so it needs a prefix match.
- Notification Settings is `channel-notifications`, not `notifications`.
- Categories are channels of type `4`. They use the same `channel-context` navId and
  reuse `mark-channel-read`, `mute-channel`, `edit-channel`, `delete-channel`.
- Discord's context menu opener bails unless the dispatched event's `currentTarget`
  contains its `target`, so the event must be dispatched on a real element inside the
  row. The menu body is lazily loaded, so capture has to be asynchronous.
- Theme variables have been renamed. Current names, with the old ones kept as fallbacks:

  | Old                     | Current                      |
  | ----------------------- | ---------------------------- |
  | `--background-floating` | `--background-surface-high`  |
  | `--text-normal`         | `--text-default`             |
  | `--interactive-normal`  | `--interactive-icon-default` |
  | `--interactive-hover`   | `--interactive-icon-hover`   |
  | `--interactive-active`  | `--interactive-icon-active`  |
  | `--focus-primary`       | `--border-focus`             |

## Re-checking menu ids

Ids are the most likely thing to break. To dump the real ones, paste this into DevTools,
right-click a channel or category, then remove the patch:

```js
const p = (navId, children) => {
  const out = [];
  (function w(n, d = 0) {
    if (!n || d > 20) return;
    if (Array.isArray(n)) return n.forEach((x) => w(x, d + 1));
    if (!n.props) return;
    if (typeof n.props.id === "string")
      out.push(n.props.id + " | " + n.props.label);
    if (n.props.children) w(n.props.children, d + 1);
  })(children);
  console.log(navId);
  console.table(out);
};
Vencord.Api.ContextMenu.addGlobalContextMenuPatch(p);
// ...right-click a row, then:
// Vencord.Api.ContextMenu.removeGlobalContextMenuPatch(p);
```

Update `menuIds` in `actions.ts` with what it prints. Ids are tried in order, so leaving
the old one as a second entry keeps older Discord builds working.

## Adding an action

1. Add an entry to `ACTIONS` in `actions.ts` with its verified `menuIds` and a `scope`
   (`"channel"`, `"category"` or `"both"`).
2. Add an icon to `icons.tsx` under the name you used.

Nothing else needs touching — the settings UI and the button bar are both generated from
the catalogue.

## Before opening a PR

```bash
cd /path/to/Vencord
npx tsc --noEmit -p tsconfig.json          # must be clean for this plugin
npx eslint src/userplugins/fastChannelActions --fix
pnpm build
```
