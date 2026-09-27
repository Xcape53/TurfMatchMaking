# Turf Matchmaking

Turf Matchmaking is a configurable Krunker lobby finder for userscript-compatible clients. It filters the public matchmaker feed, validates promising lobbies with live game information, and joins the best available server that matches the selected rules.

## Features

- Region, map, game mode, player count, remaining time, and ping filters
- Reusable combined region, map, and game mode presets
- Fast server hunting between global lobby snapshots
- Fresh `game-info` validation immediately before joining
- Automatic fallback to the next validated candidate when a lobby becomes full
- Persistent full-lobby recovery: after five rejections, briefly join through normal matchmaking, then resume your filters
- Optional similar-lobby randomization, ordered map preferences, and ping/player selection priority
- Optional recent-lobby avoidance with a configurable cache size
- Optional Force Player Count validation through the Alt Player List during the first 5 seconds after the lobby loads
- Optional automatic filtered search after a completed match
- Optional Double XP end-screen action before the next search
- Optional Auto Claim Rewards, independently or before the next search
- Optional Target Map Hunting across selected Turf Wars maps
- Configurable search and cancel hotkeys, including F2
- Optional two-press Search Hotkey guard with a 1.5-second window
- Optional compact Scanning Lobbies and Hunting notification with Cancel
- Categorized Match filters with lobby, hunting, automation, and interface groups
- Configurable connection notification color and position
- Automatic 60-second cooldown after HTTP 429 or 5xx matchmaker responses
- Optional local CSS and JavaScript extensions
- Built-in GitHub update check with a download confirmation prompt

## Civilian Client comparison

| Area | Turf Matchmaking 1.6.6 | Civilian Client 1.2 |
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

1. Download `TurfMatchMaking1.6.6.js` from the [latest GitHub release](https://github.com/Xcape53/TurfMatchMaking/releases/latest).
2. Import or install it using the script system provided by your compatible client.
3. Enable the script and reload Krunker.

Tested on Crankshaft.

### Userscript manager

Open the [raw script](https://raw.githubusercontent.com/Xcape53/TurfMatchMaking/main/TurfMatchMaking1.6.6.js) and confirm installation in your userscript manager.

## Usage

- Open or close Turf Matchmaker settings with the on-screen `M` button.
- Configure the search hotkey in the Match tab.
- Enable Double-Press Search Hotkey if the client can emit accidental search input; two presses within 1.5 seconds will then be required.
- On KUTE, choose a search hotkey other than F4, F5, or F6. The client handles those keys itself.
- Select filters and use the configured search hotkey or the Find Game button.
- Cancel an active search with the configured cancel hotkey or the on-screen Cancel button.

The matchmaker player count includes active players, spectators, and other connected sessions. It can differ from the visible in-game Player List. Force Player Count can reject an out-of-range lobby when the Alt Player List is opened within 5 seconds after the lobby loads.

Fresh installations default to the Turf Wars maps and game modes across all regions, automatic lowest-ping joining, a disabled server browser on cancel, and a green connection toast. Existing saved settings remain unchanged.

## Updates

### Changes in 1.6.6

- F2 no longer opens the settings panel. Use the on-screen `M` button. F2 can still be assigned as the Search or Cancel hotkey.
- Fixed clients that report mouse clicks as function keys, such as KUTE, opening the panel, starting a search, or cancelling one by themselves.
- Chat and kill feed messages can no longer be mistaken for a full or cancelled lobby.
- Force Player Count's 5-second window now starts when the lobby is ready instead of while the page is still loading.
- A hotkey no longer stays blocked when the client loses its key release.
- Min Players and Max Players always form a valid range.
- On Glorp, F4 and F6 now reach the client untouched.
- The update notice appears once per version and closes after 5 seconds.
- A saved JavaScript extension can now be cleared from the Extensions tab.
- Stricter validation of saved settings and lobby IDs, lighter in-game checks, and the manual lobby list pauses live refresh after 2 minutes.

Regional ping is an estimate, not the exact latency of each lobby. Backend player counts still include spectators and other connected sessions. The temporary lobby after five full rejections may intentionally fall outside your filters.

The script checks the repository `VERSION` file at most once per hour per browser session. When a newer version is available, it offers the userscript asset from the matching GitHub release in a notice that appears once per version and closes after 5 seconds. The userscript metadata also points to this repository for clients that support native userscript updates.

Public release artifacts are minified and moderately obfuscated without source maps. This raises the cost of copying and reverse engineering but does not make browser-side JavaScript impossible to extract.

## Network access

The script communicates with Krunker's public matchmaker endpoints for lobby lists, live game information, and regional latency checks. It also reads the small `VERSION` file from this repository for update checks. Matchmaker requests pause automatically after rate limits or backend failures.

## Version

Current release: `1.6.6`

Author: `xcape53`

This is an unofficial community project and is not affiliated with FRVR or Krunker.
