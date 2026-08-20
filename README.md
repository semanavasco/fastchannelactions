# FastChannelActions

Right-clicking a channel to delete it takes three moves: right-click, find the entry,
click. This makes it one — hover the channel, click the icon.

Hold **Shift** and hover any channel or category in your server list. The actions you
picked appear as icons, right where Discord's own invite and settings icons live. Click
one and it runs immediately.

![screenshot placeholder](docs/demo.gif)

- Works on **Windows, macOS and Linux**
- Works with both **Vencord** (Discord Desktop) and **Vesktop**
- Channels and categories are configured separately
- Actions you lack permission for never show up
- Optional: delete without the confirmation dialog

---

## Install

You need [git](https://git-scm.com/downloads),
[Node.js v22+](https://nodejs.org/en/download/) and [pnpm](https://pnpm.io/installation)
installed first. The installer checks for them and tells you what's missing.

Check all three at once:

```
git --version
node --version
pnpm --version
```

Each must print a version. **pnpm** is the one most people don't have — Node ships `npm`,
not `pnpm`. The quickest fix is `npm install -g pnpm`.

If `node --version` prints anything below `v22`, it needs updating:

```powershell
winget install OpenJS.NodeJS.LTS          # Windows
```

```bash
# macOS
brew install node
# Debian / Ubuntu — the apt version is usually too old
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
# Arch
sudo pacman -S nodejs npm
```

On Windows, if `winget install` reports that Node is already installed, use
`winget upgrade OpenJS.NodeJS.LTS`. If _that_ says there's no applicable upgrade, the
existing copy came from the `.msi` installer — uninstall it via Settings → Apps first,
then install again.

Updating Node can leave `pnpm` behind, since the global package location changes. Re-check
`pnpm --version` afterwards and run `npm install -g pnpm` again if it stopped working.

After installing anything, **open a new terminal** before running the installer.
A terminal that was already open won't see the newly added PATH entries.

### Windows

Download this repository (green **Code** button → **Download ZIP**), extract it, then
right-click `install.ps1` → **Run with PowerShell**.

Windows blocks unsigned scripts by default, so that will usually fail. Open PowerShell in
the extracted folder (Shift + right-click → _Open PowerShell window here_) and run:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

This applies to that single run only and changes nothing on the system. **Administrator
is not required** — the script only writes to the folder you choose. Running it elevated
can actually cause problems, since pnpm may then install to a different location.

<details>
<summary>Prefer to change the policy permanently instead?</summary>

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Unblock-File .\install.ps1
.\install.ps1
```

`RemoteSigned` allows local scripts but still requires signatures on downloaded ones —
hence `Unblock-File`, which clears the "downloaded from the internet" mark on the file.
`-Scope CurrentUser` needs no admin rights.

To undo it later:

```powershell
Set-ExecutionPolicy -ExecutionPolicy Undefined -Scope CurrentUser
```

Don't use `Unrestricted` or `-Scope LocalMachine`: those apply to the whole machine and
let any downloaded script run without warning.

</details>

### Linux / macOS

```bash
git clone https://github.com/svasco/FastChannelActions.git
cd FastChannelActions
./install.sh
```

### Already have a Vencord checkout?

The installer looks for one automatically. If yours lives somewhere unusual, point it
there so it doesn't create a second copy:

```bash
VENCORD_DIR=/path/to/Vencord ./install.sh          # Linux / macOS
```

```powershell
$env:VENCORD_DIR = "C:\path\to\Vencord"; .\install.ps1   # Windows
```

### Finishing up

The installer builds everything, then prints the last step for your client:

- **Discord Desktop** — run `pnpm inject` in the Vencord folder, then restart Discord.
- **Vesktop** — Settings → Vesktop Settings → **Vencord Location** → Change → select the
  `dist` folder it printed, then fully quit and reopen Vesktop.

Finally: **Settings → Plugins**, search **FastChannelActions**, enable it, and open its
cog to choose your actions.

---

## Usage

Hover a channel or category with **Shift** held. Buttons appear on that row only.

The modifier key is configurable (Shift / Ctrl / Alt / Super), and can be switched off
entirely if you'd rather have the buttons on plain hover.

### Available actions

| Action                  | Channels | Categories |
| ----------------------- | :------: | :--------: |
| Mark As Read            |    ✓     |     ✓      |
| Mute / Unmute           |    ✓     |     ✓      |
| Notification Settings   |    ✓     |     ✓      |
| Edit                    |    ✓     |     ✓      |
| Delete                  |    ✓     |     ✓      |
| Copy ID                 |    ✓     |     ✓      |
| Invite to Channel       |    ✓     |            |
| Pin Channel to Top      |    ✓     |            |
| Copy Link               |    ✓     |            |
| Duplicate Channel       |    ✓     |            |
| Create Text Channel     |    ✓     |            |
| Collapse Category       |          |     ✓      |
| Collapse All Categories |          |     ✓      |

Mute and Notification Settings are submenus, so they can't run in one click —
**right-click** their button to open the real menu and pick a value.

### Settings

| Setting                       | Default                         | What it does                                            |
| ----------------------------- | ------------------------------- | ------------------------------------------------------- |
| Channel Actions               | Mark As Read, Delete            | Which actions appear on channels                        |
| Category Actions              | Collapse Category, Mark As Read | Which actions appear on categories                      |
| Only show while modifier held | on                              | Require the modifier, not just hover                    |
| Modifier key                  | Shift                           | Shift / Ctrl / Alt / Super                              |
| Delete without confirmation   | **off**                         | Skips Discord's confirm dialog                          |
| Hide native buttons           | off                             | Hides Discord's invite/settings icons on the active row |

> **Delete without confirmation** does exactly what it says: the channel is deleted the
> moment you click, with no dialog and no undo. It is off by default. Turn it on only if
> you are confident you won't misclick.

---

## Updating

```bash
cd FastChannelActions
git pull
./install.sh          # or install.ps1 on Windows
```

Then restart your client. Discord updates can also break the plugin; pulling the latest
version is the first thing to try.

---

## Troubleshooting

**The plugin doesn't appear in the plugins list.**
The build didn't reach your client. For Vesktop, check that **Vencord Location** points
at the `dist` folder the installer printed. For Discord Desktop, re-run `pnpm inject`.

**Buttons don't appear when I hover.**
Check you're holding the modifier key (Shift by default), and that you've enabled at
least one action in the plugin's settings. Note that actions you lack permission for on
a given channel are hidden, so on a server where you're not an admin you may see none.

**It worked, then stopped after a Discord update.**
Likely a renamed menu id. Open DevTools (`Ctrl+Shift+I`) and run:

```js
Vencord.Plugins.plugins.FastChannelActions.diagnose();
```

That prints every menu id the plugin can see. Please open an issue with the output.

**Vesktop keeps reverting to stock Vencord.**
Vesktop validates the folder by checking for `package.json` next to the built files. The
installer creates it, but if it goes missing Vesktop silently redownloads stock Vencord
over your build. Recreate it with `echo '{}' > dist/package.json`, and avoid the
**Force Update Vencord** / **Repair Vencord** menu items, which overwrite the folder.

---

## How it works

The plugin doesn't reimplement any action. Every action is Discord's own: it opens the
channel's real context menu (hidden, for the instant it exists), finds the entry matching
your chosen action, invokes its handler, and closes the menu.

That's why permissions work for free — Discord omits entries you can't use, so those
buttons simply never render — and why the delete confirmation is the genuine one.

Buttons are mounted from the DOM rather than by patching Discord's minified code, keyed
on the `data-list-item-id` attribute that Discord itself builds and parses. That is far
more stable across Discord updates than a minified class name or code pattern.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development notes and the verified details
this relies on.

---

## Credits

Built by [svasco](https://github.com/semanavasco) with the help of [Claude Code](https://claude.com/). Not affiliated with Discord nor Vencord.

Licensed under [GPL-3.0-or-later](LICENSE), matching Vencord.
