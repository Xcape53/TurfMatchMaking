# Turf Matchmaking

Turf Matchmaking is a configurable Krunker lobby finder for userscript-compatible clients. It filters the public matchmaker feed, validates promising lobbies with live game information, and joins the best available server that matches the selected rules.

## Features

- Region, map, game mode, player count, remaining time, and ping filters
- Reusable combined region, map, and game mode presets
- Fast server hunting between global lobby snapshots
- Fresh `game-info` validation immediately before joining
- Automatic fallback to the next validated candidate when a lobby becomes full
- Optional recent-lobby avoidance with a configurable cache size
- Optional Force Player Count validation through the Alt Player List during the first 10 seconds after joining
- Optional automatic filtered search after a completed match
- Optional Double XP end-screen action before the next search
- Configurable search and cancel hotkeys, including F2
- Configurable connection notification color and position
- Automatic 60-second cooldown after HTTP 429 or 5xx matchmaker responses
- Optional local CSS and JavaScript extensions
- Built-in GitHub update check with a download confirmation prompt

## Civilian Client comparison

| Area | Turf Matchmaking 1.6.2 | Civilian Client 1.2 |
|---|---|---|
| Package | Userscript | Desktop client |
| Filters | Region, map, mode, players, time, ping, presets | Region, map, mode, players, time |
| Discovery | Full snapshot every 8.5 s; live candidates rechecked every 1.25 s | One snapshot |
| Fresh data | Parallel + final `game-info` | `game-list` recheck only |
| Selection | Ping, priority, midpoint, freshness | Players/ping, randomized tier |
| No match | Keeps hunting | Stops / server browser |
| Full lobby | Saved queue + live revalidation | Fresh list + next non-full |
| Count guard | Optional Alt Player List | Backend count only |
| Backend errors | 60 s `429/5xx` cooldown | Stops search |

## Installation

### Compatible clients

1. Download `TurfMatchMaking1.6.2.js` from the [latest GitHub release](https://github.com/Xcape53/TurfMatchMaking/releases/latest).
2. Import or install it using the script system provided by your compatible client.
3. Enable the script and reload Krunker.

Tested on Crankshaft.

### Userscript manager

Open the [raw script](https://raw.githubusercontent.com/Xcape53/TurfMatchMaking/main/TurfMatchMaking1.6.2.js) and confirm installation in your userscript manager.

## Usage

- Press `F2` to open or close Turf Matchmaker settings while F2 is unassigned. The on-screen `M` button always remains available.
- Configure the search hotkey in the Match tab.
- When F2 is assigned as Search or active Cancel, it performs that action instead of opening the settings panel.
- Select filters and use the configured search hotkey or the Find Game button.
- Cancel an active search with the configured cancel hotkey or the on-screen Cancel button.

The matchmaker player count includes active players, spectators, and other connected sessions. It can differ from the visible in-game Player List. Force Player Count can reject an out-of-range lobby when the Alt Player List is opened within 10 seconds of joining.

Fresh installations default to the Turf Wars maps and game modes across all regions, automatic lowest-ping joining, a disabled server browser on cancel, and a green connection toast. Existing saved settings remain unchanged.

## Updates

The script checks the repository `VERSION` file at most once per hour per browser session. When a newer version is available, it asks whether to download the userscript asset from the matching GitHub release. The userscript metadata also points to this repository for clients that support native userscript updates.

Public release artifacts are minified and moderately obfuscated without source maps. This raises the cost of copying and reverse engineering but does not make browser-side JavaScript impossible to extract.

## Network access

The script communicates with Krunker's public matchmaker endpoints for lobby lists, live game information, and regional latency checks. It also reads the small `VERSION` file from this repository for update checks. Matchmaker requests pause automatically after rate limits or backend failures.

## Version

Current release: `1.6.2`

Author: `xcape53`

This is an unofficial community project and is not affiliated with FRVR or Krunker.
