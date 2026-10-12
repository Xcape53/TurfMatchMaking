# Turf Matchmaking

Turf Matchmaking is a configurable Krunker lobby finder for userscript-compatible clients. It filters the public matchmaker feed, validates promising lobbies with live game information, and joins the best available server that matches your rules. In Kute it can also keep itself up to date.

## Features

- Region, map, game mode, player count, remaining time and ping filters, with reusable presets
- Fast server hunting between lobby snapshots and fresh `game-info` validation right before joining
- Automatic fallback to the next validated lobby when one becomes full, and join recovery through a temporary lobby while your full filters keep searching
- Ordered map preferences, players or ping priority, optional randomization among similar lobbies and recent-lobby avoidance
- Optional Target Map Hunting across selected Turf Wars maps
- Force Player Count and Low Player Count monitoring, with round protection by kills, KDR, time left and score gap to TOP 1
- Exact-IGN blacklist and whitelist, with toggle shortcuts in the Alt Player List
- Optional automatic search after a match, Double XP and Auto Claim Rewards
- Configurable search and cancel hotkeys, an optional two-press search guard and a compact search status with Cancel
- Connection, searching and rejection notifications with their own position, colors and duration
- Automatic 60-second pause after HTTP 429 or 5xx matchmaker responses
- Automatic updates in Kute, a first-run guide for new users and optional local CSS and JavaScript extensions

## Installation

Download the files from the [latest release](https://github.com/Xcape53/TurfMatchMaking/releases/latest). Pick the case that matches you:

### New to Turf Matchmaking

**Kute (recommended)**
1. Download `TurfMatchMaking.js`.
2. Put it in your Kute scripts folder (`Documents\kute\scripts`) or drop it into Kute's script manager.
3. Reload the game.
4. A short guide shows where the **M** menu is. Open it to choose your filters, then press **F3** or Find Game to search.

Future versions install themselves. See [Automatic updates](#automatic-updates).

**Other clients (Crankshaft, Glorp, KCC)**
Download `TurfMatchMaking<version>.js` and add it with your client's script system, then reload.

**Userscript manager (Tampermonkey, Violentmonkey)**
Open the [raw script](https://raw.githubusercontent.com/Xcape53/TurfMatchMaking/main/TurfMatchMaking.js) and confirm the installation.

### Updating from an older version in Kute

1. Download `TurfMatchMaking.js` and put it in `Documents\kute\scripts`.
2. In Kute's script manager, **disable your old Turf script** (for example `TurfMatchMaking1.7.js`). You do not need to delete it.
3. Reload the game.

Your settings, presets and player lists are kept. This is the last manual update: from now on, new versions install automatically.

### Updating from an older version in another client (Crankshaft, Glorp, KCC)

1. Download `TurfMatchMaking<version>.js` and install it the same way you installed the previous version.
2. Disable or remove the old Turf script so only one copy runs.
3. Reload the game.

Your settings are kept. New versions still appear as an in-game notice with a download button. Automatic updates for other clients are planned.

> Settings are stored separately in each client. If you move from another client to Kute, Turf starts there with default settings.

### First run of 1.7.1

The first time 1.7.1 runs, it sets a few options once: Server Hunting on, Target Map Hunting off, Double XP, Auto Claim Rewards, Auto Search After Match and Compact Search Status on, blacklist and whitelist on, and new notification positions. Your player lists, colors and other settings are kept, and you can change these options afterwards in **M > Settings**.

## Automatic updates

- **Settings > Script Updates > Automatic Updates** is on by default. If you turn it off, the choice is kept and you can still install deliberately from the update window or with **Check for Updates**.
- Turf checks for a new version when the game starts and once per hour.
- When an update installs, a window tells you it is installing and that automatic updates can be turned off in Settings. The new version starts on your **next reload**. A running match is never interrupted.
- Settings, presets, blacklist and whitelist are kept. Other scripts are not touched. Older Turf files are disabled, not deleted.
- Downloads come only from this repository's release tag and must match their SHA256 checksum and script identity before they are saved. If anything is wrong, or GitHub cannot be reached, nothing changes and the reason is shown under Script Updates.
- Automatic installation currently needs Kute's script manager; support for other clients is planned. Keep the file name `TurfMatchMaking.js`, and do not edit that file by hand because updates replace it.
- The checksum protects against damaged downloads, not against a compromised repository. Turn Automatic Updates off if you prefer to review every version yourself.

To go back to an older version, disable `TurfMatchMaking.js` in Kute's script manager, enable your older Turf file and reload.

## Usage

- Click the on-screen `M` button to open the settings.
- Choose your filters in the Match tab and press the search hotkey (F3 by default) or Find Game.
- Cancel an active search with the cancel hotkey or the on-screen Cancel button.
- Enable Double-Press Search Hotkey if your client can produce accidental key presses; two presses within 1.5 seconds are then required.
- Under Low Player Count, `Stay if:` keeps you in a round by kills, KDR, time left or points behind TOP 1, each with its own comparison, value and 0-60 second grace period. Zero disables a rule.

New installations start with 2-7 players, 90 seconds left, 120 ms maximum ping, Most Players priority, F3 to search, a blue/purple theme and two-second notifications. Existing saved settings are kept, apart from the [one-time setup](#first-run-of-171) on the first 1.7.1 run.

## Good to know

- The matchmaker reports connected players, which can include spectators. Force Player Count and Low Player Count read the in-game player list to compensate, and missing data is never treated as an empty lobby.
- Displayed ping is a regional estimate, not the exact latency of each lobby.
- A temporary recovery lobby is chosen by Krunker and may fall outside your filters; your filters still apply to the search for its replacement.

## What's new in 1.7.1

- Readable source under the MIT license, without obfuscation.
- Automatic updates in Kute with a visible install notice.
- Updated defaults for new users and a one-time setup on the first run.
- Consistent notification settings with two-second default durations.
- A first-run guide that shows new users where the menu is.

See [CHANGELOG.md](CHANGELOG.md) and the release notes for details and earlier versions.

## Network access

The script talks to Krunker's public matchmaker endpoints for lobby lists, live game information and regional latency. For updates it reads the `VERSION` file from this repository and, in Kute, downloads the matching release file and its checksum from the release tag on raw.githubusercontent.com. Matchmaker requests pause automatically after rate limits or backend failures.

## License

MIT. See [LICENSE](LICENSE).

Current release: `1.7.1`

Author: `xcape53`

This is an unofficial community project and is not affiliated with FRVR or Krunker.
