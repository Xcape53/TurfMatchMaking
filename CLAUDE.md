# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Turf Matchmaking is a Krunker lobby-finder **userscript** (runs in userscript-compatible clients such as Crankshaft, or a userscript manager). This repo is a **release/distribution repo only**: it contains no readable source, no `package.json`, no build, lint, or test tooling. There is nothing to build or run locally; the script only runs inside a Krunker page (`@match *://krunker.io/*`, `@run-at document.start`, `@grant none`).

Files:
- `TurfMatchMaking<version>.js`: one per released version, each a complete standalone userscript. Older versions are kept alongside the current one (1.5.5 was the only one removed).
- `VERSION`: the current release version string. The script's built-in update checker fetches this file from `main` (at most once per hour per browser session) and prompts to download the matching GitHub release asset.
- `README.md`: user-facing docs, feature list, Civilian Client comparison table, and the "Changes in X" notes.

## Working with the release scripts

- Each `.js` file is a plain-text `// ==UserScript==` metadata header followed by a single very long line of **minified, obfuscated** JavaScript (javascript-obfuscator style: string-array lookups, `_0x…` identifiers, hex arithmetic constants). The obfuscation is intentional (see README); do not add source maps or de-obfuscated copies.
- Meaningful behavior changes cannot practically be made by editing the obfuscated output. They require the author's private source and obfuscation step, which are not in this repo. Past in-place edits to a released file have been limited to tiny tweaks (e.g. a CSS color). Avoid rewriting these files wholesale; use `grep -o` or `cut -c` to inspect them, since the single line is hundreds of KB.
- The metadata header in each file is self-referential: `@version`, `@updateURL`, and `@downloadURL` must match that file's own name (`https://raw.githubusercontent.com/Xcape53/TurfMatchMaking/main/TurfMatchMaking<version>.js`).

## Release checklist (as done in git history)

A release commit ("Release Turf Matchmaking X.Y.Z") does all of the following together:
1. Adds the new `TurfMatchMaking<X.Y.Z>.js` with a matching userscript header.
2. Updates `VERSION` to `X.Y.Z` (no trailing text).
3. Updates every version reference in `README.md`: the comparison table header, the raw-script and release-asset filenames under Installation, the "Changes in X.Y.Z" section, and "Current release".

Minor fixes to an already-released version are sometimes committed directly to that version's file without bumping `VERSION`.
