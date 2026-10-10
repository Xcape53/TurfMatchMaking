# Turf Matchmaking 1.7

Player-aware matchmaking, configurable round protection and more reliable recovery after Krunker's UI changes. Includes the 1.6.7 update-popup timeout fix and previous matchmaking features.

## Player Count

- Force Player Count validates a matchmaker join against client-side total population minus yourself, including teammates in team modes. It is a one-shot check within five seconds of lobby readiness and does not apply to manual joins without a matchmaker marker.
- Low Player Count monitors population continuously and searches for a replacement after it remains below your threshold. FFA excludes yourself; TDM counts enemies rather than teammates. Configure 1-8 opponents and a 5-60 second wait.
- Total population can be read from the client's Player List generator without opening Alt. Populated Tab rows provide team membership and can be read while hidden. Closing Tab no longer resets the countdown.
- Unknown or incomplete data is not treated as zero. Lobby/round boundaries prevent reuse of an old roster. Rejection messages distinguish TOO FEW PLAYERS, TOO MANY PLAYERS and TOO FEW OPPONENTS.

## Stay if: round protection

The editor is directly below Low Player Count. One condition dropdown, one comparison dropdown and one numeric field share equal widths. Switching the dropdown edits another saved rule; it does not disable the other rules.

| Condition | Value | Initial comparison |
|---|---|---|
| Kills | 0-100 round kills | >= |
| KDR | 0-20, steps of 0.1 | >= |
| Time Left | 0-300 seconds | <= |
| Position | 0-2000 points behind TOP 1, not leaderboard rank | <= |

- Available comparisons are =, >, <, !=, >= and <=, displayed as mathematical symbols in the GUI.
- Zero disables a rule; a positive value enables it. Any satisfied rule prevents Low Player Count from changing your lobby.
- Each condition has its own saved 0-60 second grace period after protection is lost. KDR starts at 30 seconds but is fully configurable; other conditions start at 15 seconds or inherit the previous shared setting.
- Grace and the low-player wait run concurrently, not consecutively. Regaining protection cancels its pending departure; population recovery and round/lobby changes reset monitoring.
- KDR uses kills divided by max(1, deaths). Required but unavailable stats conservatively hold departure. Final automatic join checks re-evaluate protection.
- These rules protect Low Player Count actions, not every possible automatic action. Manual searches and visible connection-error recovery remain available.

## Player blacklist and whitelist

- Optional exact-IGN lists below Player Count, with independent enable switches. Matching is case-insensitive and excludes clan tags and badges.
- A blacklisted player triggers a filtered replacement search and a temporary exclusion of the current lobby.
- A whitelisted player pauses automated searching and lobby changes while present. Manual search still works. A confirmed complete roster is required before releasing the pause; uncertain data does not falsely report departure. Connection-error recovery is not blocked.
- Red B and green W rounded-square buttons appear beside native actions in the Alt Player List. Click once to add, again to remove; membership and the editor refresh immediately. List enable switches are unchanged by these shortcuts.
- Buttons survive native row/list rebuilds, copied HTML and chat-icon changes without duplicating listeners or continuously rewriting unchanged controls.
- Compact saved entries display observed game names, clan tags and supported Tab badges. Matching continues to use the clean IGN. Display metadata persists and is sanitized; arbitrary HTML and third-party image URLs are not copied.

## Connection recovery

- Recognize the visible native Lost Connection header, independently of the detailed full/disconnected/kicked/bad-server message. Recovery also works when a join marker was lost.
- Reuse and validate cached candidates. When a temporary game is needed, make a bounded quick check of recent candidates with relaxed map/player-count constraints while retaining the other eligibility checks.
- If that quick check fails, invoke the native Find Game action. That temporary game may fall outside all configured filters. Resume the original fully filtered search in the background afterward.
- Repeated failed destinations do not impose a fixed retry limit. Cancellation and search-generation checks prevent delayed joins from an abandoned search.
- Clear stale Connecting/Lobby Found notifications after failure. Waiting for a temporary join no longer creates a second premature full-size search panel.

## Notifications and interface

- Independent connection, searching and lobby-rejection notification customization, including X/Y position, colors, reset and matching test previews.
- Duration controls cover 0-5 seconds. Connection/rejection duration zero disables that notice. Searching remains visible while active; its duration controls how long the completion notice remains after a result, with zero hiding it immediately.
- Old dismissal timers do not remove newer notifications. The update notice still dismisses after five seconds without downloading anything.
- Player Count styling follows the compact nested controls used elsewhere, with a separator between Force Player Count and Low Player Count.
- Existing filters, hunting, presets, input guards, regional ping estimates, reward automation and saved preferences are retained. Protection settings migrate without activating previously disabled rules.

## Installation and current state

Install only TurfMatchMaking1.7.js and disable/remove the previous active copy to avoid duplicate injection. Public JavaScript is minified and obfuscated without source maps. Readable development sources are not included. No separate client CSS, ad helper or client executable changes are part of this release.

Release validation: 14 targeted offline browser suites passed, including 19 recovery scenarios, 25 input-safety cases, protection/settings, count sources and monitoring, player lists/buttons/badges, notifications, update-popup timeout and the obfuscated-build smoke test. Source and protected JavaScript passed syntax checks. The protected build initialized without uncaught page errors and preserved independent grace settings. This is not a claim that every live Kute scenario has been reproduced.

Known limitations:

- Hidden TDM rosters and round stats depend on what Krunker has populated locally. Opening Tab once may still be necessary; universally Tab-free team/stat detection is not guaranteed. Connected population can include spectators.
- Position protection requires complete, exact scores. Missing or abbreviated data can hold departure rather than risk losing a protected round.
- Native temporary matchmaking may ignore filters. Regional HTTP ping remains an estimate, not exact per-lobby latency.
- Reported intermittent Alt hover flicker and alt-tab/end-of-round auto-search behavior are not conclusively verified in live Kute. Demonstrated rebuild/listener issues are covered by tests.
- A prior recovery test had a timing-sensitive observation during navigation. Release test results are recorded separately; offline success does not guarantee server availability.
- Separate custom-CSS character-preview cropping is outside this release.
