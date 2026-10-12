# Turf Matchmaking 1.7.1

Readable code, automatic Kute updates, updated defaults and a first-run guide.

## Installation

Download the files below. Pick the case that matches you:

**New to Turf Matchmaking (Kute, recommended)**
1. Download `TurfMatchMaking.js`.
2. Put it in your Kute scripts folder (`Documents\kute\scripts`) or drop it into Kute's script manager.
3. Reload the game. A short guide shows where the **M** menu is; press **F3** or Find Game to search.

**Updating from an older version in Kute**
1. Put `TurfMatchMaking.js` in `Documents\kute\scripts`.
2. In Kute's script manager, **disable your old Turf script** (for example `TurfMatchMaking1.7.js`). You do not need to delete it.
3. Reload the game. Your settings, presets and player lists are kept. This is the last manual update: new versions install automatically from now on.

**Other clients (Crankshaft, Glorp, KCC) and userscript managers**
Install `TurfMatchMaking1.7.1.js` the same way as the previous version and disable or remove the old one, then reload. Your settings are kept. New versions still appear as an in-game notice with a download button. Automatic updates for other clients are planned.

Settings are stored separately in each client. If you move from another client to Kute, Turf starts there with default settings.

## Automatic updates in Kute

- **Settings > Script Updates > Automatic Updates** is on by default. If you turn it off, the choice is kept and you can still install deliberately with **Install Update** or **Check for Updates**.
- Turf checks for a new version when the game starts and once per hour.
- When an update installs, a window says *Installing new update* and that automatic updates can be turned off in Settings, then shows the result. The new version starts on your **next reload**. A running match is never interrupted or reloaded.
- Settings, presets, blacklist and whitelist are kept. Other scripts are not touched. Older Turf files are disabled, not deleted.
- Downloads come only from this repository's release tag and must match their SHA256 checksum and script identity before they are saved. If anything is wrong, or GitHub cannot be reached, nothing changes and the reason is shown under Script Updates. If saving fails, the previous copy is restored and stays enabled.
- Keep the file name `TurfMatchMaking.js` and do not edit that file by hand; updates replace it. Put your own code in Turf's custom JavaScript setting or in a separate script.
- The checksum protects against damaged downloads, not against a compromised repository. Turn Automatic Updates off if you prefer to review every version yourself.

To go back to an older version, disable `TurfMatchMaking.js` in Kute's script manager, enable your older Turf file and reload.

## Readable code and MIT license

- Releases now use readable JavaScript with comments and descriptive names. Minification and obfuscation have been removed.
- The userscript carries the MIT license and author notice, with a separate LICENSE file.
- Earlier published releases remain unchanged.

## First-run guide

- New users get a short welcome message explaining the M menu and their current search hotkey, with an image pointing at the M button.
- The rest of the game is lightly dimmed while the guide is visible. M stays visible and clickable.
- Clicking Got it or M dismisses the guide for good. Users with an existing configuration do not see it on upgrade.

## Defaults for new users

| Setting | Default |
|---|---|
| Min Players | 2 |
| Max Players | 7 |
| Min Time Left | 90 seconds |
| Max Ping | 120 ms |
| Selection Priority | Most Players |
| Search Hotkey | F3 |
| GUI Gradient | Enabled, #0040ff to #7a00ff |
| Searching Notification Color | #0040ff |
| Connection, Searching and Rejection Duration | 2 seconds |

Existing saved requirements, selection priority, hotkeys, colors and durations are kept. Notification Reset buttons restore two seconds; Theme Reset uses the new gradient and Searching Reset restores blue. For Searching Notification, duration is the time before hiding the completion notice after a lobby is found; it does not hide an active search.

## One-time setup on the first 1.7.1 run

These options are set once, for new and existing users:

- Server Hunting: ON.
- Target Map Hunting: OFF, with no target maps selected.
- Double XP, Auto Claim Rewards and Auto Search After Match: ON.
- Compact Search Status: ON.
- Player Blacklist and Player Whitelist: ON. Saved names are kept.

| Notification | X from left | Y from bottom |
|---|---|---|
| Connection | 24 px | 24 px |
| Lobby Rejection | 24 px | 134 px |
| Searching | 24 px | 360 px |

This is not a permanent restriction: you can change everything afterwards in **M > Settings**, and later changes survive reloads. Other preferences, colors, durations, presets and list contents are kept.

## Notification settings

- Connection, Searching and Lobby Rejection share one consistent layout.
- Test Notification buttons use matching outlined styling.
- Each section's border, title marker and test button follow its own notification color, including live color changes.

## Notes

Automatic updates were tested in a real Kute client, including downloads from GitHub. Recovery after a failed installation has been tested offline only. The limitations listed under "Good to know" in the README still apply. Bugs and feedback: [issues](https://github.com/Xcape53/TurfMatchMaking/issues) or a Discord DM.
