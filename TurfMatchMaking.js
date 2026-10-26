// ==UserScript==
// @name         Turf Matchmaking
// @version      1.7.3
// @description  Fast matchmaking optimized (Krunker Civilian model)
// @author       xcape53
// @license      MIT
// @match        *://krunker.io/*
// @match        *://*.krunker.io/*
// @homepageURL  https://github.com/Xcape53/TurfMatchMaking
// @supportURL   https://github.com/Xcape53/TurfMatchMaking/issues
// @updateURL    https://raw.githubusercontent.com/Xcape53/TurfMatchMaking/main/TurfMatchMaking.js
// @downloadURL  https://raw.githubusercontent.com/Xcape53/TurfMatchMaking/main/TurfMatchMaking.js
// @grant        none
// @run-at       document.start
// ==/UserScript==

/*
MIT License
Copyright (c) 2026 xcape53

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

(function () {
    // Prevent multiple userscript instances from handling the same input and requests.
    const SCRIPT_VERSION = "1.7.3";
    const INSTANCE_KEY = "__turfMatchmakingInstance";
    if (window[INSTANCE_KEY]) {
        console.warn("Turf Matchmaking skipped a duplicate injection.");
        return;
    }
    window[INSTANCE_KEY] = { version: SCRIPT_VERSION, loadedAt: Date.now() };

    // Keep a bounded, local per-tab history of activation causes, never typed text or account data.
    const ACTIVATION_LOG_KEY = "turf_mm_activation_log";
    let lastActivationLog = "";
    let lastActivationLogAt = 0;
    function recordRuntimeAction(action, reason, key = "") {
        const now = Date.now();
        const fingerprint = `${action}:${reason}:${key}`;
        if (action === "input-blocked" && fingerprint === lastActivationLog && now - lastActivationLogAt < 1000) return;
        lastActivationLog = fingerprint;
        lastActivationLogAt = now;
        try {
            let entries;
            try { entries = JSON.parse(sessionStorage.getItem(ACTIVATION_LOG_KEY) || "[]"); } catch { entries = []; }
            if (!Array.isArray(entries)) entries = [];
            entries = entries.slice(-59);
            entries.push({ at: now, version: SCRIPT_VERSION, revision: "input-2026-09-25", action, reason, key });
            sessionStorage.setItem(ACTIVATION_LOG_KEY, JSON.stringify(entries));
        } catch { /* Storage restrictions must not break controls or matchmaking. */ }
    }

    // Define the public project and update-check endpoints.
    const PROJECT_URL = "https://github.com/Xcape53/TurfMatchMaking";
    const VERSION_URL = "https://raw.githubusercontent.com/Xcape53/TurfMatchMaking/main/VERSION";
    const UPDATE_CHECK_KEY = "turf_mm_last_update_check";
    const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
    const UPDATE_RAW_BASE = "https://raw.githubusercontent.com/Xcape53/TurfMatchMaking";
    const UPDATE_FILE = "TurfMatchMaking.js";
    const UPDATE_BACKUP_KEY = "turf_mm_update_backup";
    const UPDATE_MAX_BYTES = 4 * 1024 * 1024;
    const UPDATE_MESSAGE_MAX_BYTES = 5 * 1024 * 1024;
    let updateCheckRunning = false;
    let updateInstallRunning = false;
    let updateHostAvailable = null;
    let updateStatus = "Checks hourly. Installed updates activate on the next game reload.";

    // Define the game metadata used by filters and server record parsing.
    const GAMEMODES = [
        "Free for All", "Team Deathmatch", "Hardpoint", "Capture the Flag", "Parkour",
        "Hide & Seek", "Infected", "Race", "Last Man Standing", "Simon Says",
        "Gun Game", "Prop Hunt", "Boss Hunt", "Classic FFA", "Deposit",
        "Stalker", "King of the Hill", "One in the Chamber", "Trade", "Kill Confirmed",
        "Defuse", "Sharp Shooter", "Traitor", "Raid", "Blitz",
        "Domination", "Squad Deathmatch", "Kranked FFA", "Team Defender", "Deposit FFA",
        "Chaos Snipers", "Bighead FFA"
    ];
    // Mode numbers past the list above, named only when the game list confirms them (official custom labels)
    // or for the current event. Other new numbers are shown as "Mode #N".
    const EXTRA_GAMEMODES = { 35: "Zombies", 37: "Trick or Treat" };
    const ALL_GAMEMODES = [...GAMEMODES, ...Object.values(EXTRA_GAMEMODES)];

    // Keep lobby rows compact without changing the full names used by filters.
    const GAMEMODE_LABELS = {
        "Free for All": "FFA",
        "Team Deathmatch": "TDM",
        "Hardpoint": "HP",
        "Capture the Flag": "CTF",
        "Hide & Seek": "H&S",
        Infected: "INF",
        "Last Man Standing": "LMS",
        "Gun Game": "GG",
        "Prop Hunt": "PH",
        "Classic FFA": "CFFA",
        "King of the Hill": "KOTH",
        "One in the Chamber": "OITC",
        "Kill Confirmed": "KC",
        Domination: "DOM",
        "Squad Deathmatch": "SDM",
        "Kranked FFA": "KFFA",
        "Team Defender": "TD",
        "Deposit FFA": "DFFA",
        "Chaos Snipers": "CS",
        "Bighead FFA": "BFFA",
        "Trick or Treat": "ToT"
    };

    function getGamemodeLabel(gamemode) {
        return GAMEMODE_LABELS[gamemode] || gamemode;
    }

    const REGIONS = ["SV", "TOK", "FRA", "MBI", "SYD", "SIN", "DAL", "BHN", "BRZ", "NY"];

    const REGION_NAMES = {
        SV: "Silicon Valley", TOK: "Tokyo", FRA: "Frankfurt", MBI: "Mumbai",
        SYD: "Sydney", SIN: "Singapore", DAL: "Dallas", BHN: "Bahrain",
        BRZ: "Brazil", NY: "New York"
    };

    const REGION_MAP = {
        "us-ca-sv": "SV", "us-ca": "SV", "us-ca-la": "SV", "us-ca-la-2": "SV",
        "jb-hnd": "TOK", "jp-tok": "TOK",
        "de-fra": "FRA",
        "as-mb": "MBI", "in-bom": "MBI",
        "au-syd": "SYD",
        "sgp": "SIN", "sgp-sin": "SIN",
        "us-tx": "DAL",
        "me-bhn": "BHN", "me-dub": "BHN",
        "brz": "BRZ", "br-gru": "BRZ",
        "us-nj": "NY"
    };

    const MAPS = [
        "Burg", "Littletown", "Sandstorm", "Subzero", "Undergrowth", "Freight",
        "Lostworld", "Citadel", "Oasis", "Kanji", "Industry", "Lumber",
        "Evacuation", "Site", "SkyTemple", "Lagoon", "Tropicano", "Habitat",
        "Atomic", "Old_Burg", "Throwback", "Clockwork", "Bazaar", "Erupt",
        "HQ", "Lush", "Vivo", "Slide Moonlight", "Eterno Sim", "Frontier", "Piazza",
        "Candy Heist", "Barnyard", "Arena", "Stockade"
    ];

    const MAP_NAMES = {
        SkyTemple: "Sky Temple", Old_Burg: "Old Burg",
        "Slide Moonlight": "Slide Moonlight", "Eterno Sim": "Eterno Sim"
    };

    const TURF_WARS_MAPS = ["Sandstorm", "Burg", "Subzero"];
    const TURF_WARS_MODES = ["Free for All", "Team Deathmatch"];

    // Load saved settings and safely migrate data from the legacy storage key.
    const SETTINGS_KEY = "turf_match_settings";
    const LEGACY_SETTINGS_KEY = "lombre_match_settings";
    const DEFAULTS_APPLIED_VERSION = "1.7.1";
    // Missing preferences use these defaults; saved choices are not migrated over.
    const NEW_USER_DEFAULTS = {
        minPlayers: 2, maxPlayers: 7, minTime: 90, maxPing: 120,
        notificationSeconds: 2, keybind: "F3",
        selectionPriority: "players",
        gradColor1: "#0040ff", gradColor2: "#7a00ff", gradientEnabled: true,
        searchToastColor: "#0040ff"
    };
    const INSTALL_DEFAULTS = {
        toastOffsetX: 24, toastOffsetY: 24,
        recoveryToastOffsetX: 24, recoveryToastOffsetY: 134,
        searchToastOffsetX: 24, searchToastOffsetY: 360,
        serverHunting: true, targetHuntMaps: [],
        doubleXPAfterMatch: true, autoClaimRewards: true,
        autoSearchAfterMatch: true, compactSearchStatus: true,
        playerBlacklistEnabled: true, playerWhitelistEnabled: true
    };

    function readSettings() {
        const current = localStorage.getItem(SETTINGS_KEY);
        const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
        const raw = current ?? legacy ?? "{}";
        try {
            const parsed = JSON.parse(raw);
            return {
                values: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {},
                migratedFromLegacy: current === null && legacy !== null
            };
        } catch (error) {
            console.warn("Turf Matchmaking ignored invalid saved settings.", error);
            return { values: {}, migratedFromLegacy: false };
        }
    }

    function normalizePresetName(value) {
        const name = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 28);
        if (["__proto__", "prototype", "constructor"].includes(name.toLowerCase())) return "";
        return name;
    }

    function sanitizeFilterPresets(value, allowedValues) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        const presets = {};
        for (const [rawName, rawSelection] of Object.entries(value).slice(0, 20)) {
            const name = normalizePresetName(rawName);
            if (!name || !Array.isArray(rawSelection)) continue;
            presets[name] = [...new Set(rawSelection.filter(item => allowedValues.includes(item)))];
        }
        return presets;
    }

    function sanitizeCombinedFilterPresets(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        const presets = {};
        for (const [rawName, rawPreset] of Object.entries(value).slice(0, 20)) {
            const name = normalizePresetName(rawName);
            if (!name || !rawPreset || typeof rawPreset !== "object" || Array.isArray(rawPreset)) continue;
            presets[name] = {
                regions: [...new Set(asArray(rawPreset.regions).filter(item => REGIONS.includes(item)))],
                modes: [...new Set(asArray(rawPreset.modes).filter(item => ALL_GAMEMODES.includes(item)))],
                maps: [...new Set(asArray(rawPreset.maps).filter(item => MAPS.includes(item)))]
            };
        }
        return presets;
    }

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function sanitizeTargetHuntMaps(value) {
        const normalized = new Set(asArray(value)
            .filter(map => typeof map === "string")
            .map(map => map.toLowerCase()));
        return TURF_WARS_MAPS.filter(map => normalized.has(map.toLowerCase()));
    }

    function clampInteger(value, fallback, min, max) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.round(numeric))) : fallback;
    }

    function sanitizeStoredHotkey(value, fallback, allowEmpty, allowEscape) {
        if (typeof value !== "string") return fallback;
        let code = value.trim();
        if (code === "KeyF6") code = "F6";
        if (!code) return allowEmpty ? "" : fallback;
        const modifierCodes = [
            "ControlLeft", "ControlRight", "AltLeft", "AltRight",
            "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"
        ];
        if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(code)) return fallback;
        if (!allowEscape && code === "Escape") return fallback;
        if (modifierCodes.includes(code)) return fallback;
        return code;
    }

    const loadedSettings = readSettings();
    const saved = loadedSettings.values;
    const isNewSettingsProfile = Object.keys(saved).length === 0;
    // Apply the requested setup once, then preserve later user edits across reloads.
    const needsDefaultMigration = saved.defaultsAppliedVersion !== DEFAULTS_APPLIED_VERSION;
    if (needsDefaultMigration) {
        Object.assign(saved, INSTALL_DEFAULTS, { defaultsAppliedVersion: DEFAULTS_APPLIED_VERSION });
    }
    const savedSearchKey = Object.prototype.hasOwnProperty.call(saved, "keybind") ? saved.keybind : NEW_USER_DEFAULTS.keybind;
    const loadedSearchKey = sanitizeStoredHotkey(savedSearchKey, NEW_USER_DEFAULTS.keybind, true, false);
    const loadedCancelKey = sanitizeStoredHotkey(saved.cancelKeybind, "Escape", false, true);
    const loadedRegions = asArray(saved.regions)
        .filter(region => typeof region === "string")
        .map(region => REGION_MAP[region.toLowerCase()] || region.toUpperCase());
    const defaultedMaps = Object.prototype.hasOwnProperty.call(saved, "maps") ? asArray(saved.maps) : TURF_WARS_MAPS;
    const loadedMaps = defaultedMaps
        .filter(map => typeof map === "string")
        .map(map => MAPS.find(item => item.toLowerCase() === map.toLowerCase()) || map);
    const defaultedModes = Object.prototype.hasOwnProperty.call(saved, "modes") ? asArray(saved.modes) : TURF_WARS_MODES;
    const loadedModes = defaultedModes
        .filter(mode => typeof mode === "string" || Number.isInteger(mode))
        .map(mode => {
            if (Number.isInteger(mode)) return GAMEMODES[mode] || EXTRA_GAMEMODES[mode] || mode;
            return ALL_GAMEMODES.find(item => item.toLowerCase() === mode.toLowerCase()) || mode;
        });
    const savedTargetHuntMaps = Array.isArray(saved.targetHuntMaps)
        ? saved.targetHuntMaps
        : (typeof saved.targetHuntMap === "string" ? [saved.targetHuntMap] : []);
    const loadedTargetHuntMaps = sanitizeTargetHuntMaps(savedTargetHuntMaps);
    const legacyMapPresets = sanitizeFilterPresets(saved.mapPresets, MAPS);
    const legacyModePresets = sanitizeFilterPresets(saved.modePresets, ALL_GAMEMODES);
    const savedCombinedPresets = sanitizeCombinedFilterPresets(saved.filterPresets);
    const migratedCombinedPresets = Object.keys(savedCombinedPresets).length
        ? savedCombinedPresets
        : [...new Set([...Object.keys(legacyMapPresets), ...Object.keys(legacyModePresets)])].reduce((presets, name) => {
            presets[name] = {
                regions: [...loadedRegions],
                modes: [...(legacyModePresets[name] || loadedModes)],
                maps: [...(legacyMapPresets[name] || loadedMaps)]
            };
            return presets;
        }, {});

    // Keep persistent preferences and temporary settings-panel state in one model.
    const STATE = {
        tab: "match",
        maps: loadedMaps,
        modes: loadedModes,
        filterPresets: migratedCombinedPresets,
        regions: loadedRegions,
        minPlayers: clampInteger(saved.minPlayers, NEW_USER_DEFAULTS.minPlayers, 0, 7),
        maxPlayers: clampInteger(saved.maxPlayers, NEW_USER_DEFAULTS.maxPlayers, 0, 7),
        minTime: clampInteger(saved.minTime, NEW_USER_DEFAULTS.minTime, 0, 480),
        maxPing: clampInteger(saved.maxPing, NEW_USER_DEFAULTS.maxPing, 20, 300),
        serverHunting: saved.serverHunting ?? true,
        targetHuntMaps: loadedTargetHuntMaps,
        autoSearchAfterMatch: saved.autoSearchAfterMatch ?? true,
        doubleXPAfterMatch: saved.doubleXPAfterMatch ?? true,
        autoClaimRewards: saved.autoClaimRewards ?? true,
        compactSearchStatus: saved.compactSearchStatus ?? true,
        doublePressSearchHotkey: saved.doublePressSearchHotkey ?? false,
        keybind: loadedSearchKey,
        cancelKeybind: loadedCancelKey,
        openServerBrowser: saved.openServerBrowser ?? false,
        filterAutoJoin: saved.filterAutoJoin ?? true,
        filterAvoidCloseToFull: saved.filterAvoidCloseToFull ?? false,
        filterAvoidPastLobbies: saved.filterAvoidPastLobbies ?? false,
        pastLobbyCount: clampInteger(saved.pastLobbyCount, 3, 1, 10),
        forcePlayerCount: saved.forcePlayerCount ?? false,
        lowPlayerCountEnabled: saved.lowPlayerCountEnabled === true,
        lowPlayerMinimum: clampInteger(saved.lowPlayerMinimum, 2, 1, 8),
        lowPlayerWaitSeconds: clampInteger(saved.lowPlayerWaitSeconds, 15, 5, 60),
        lowProtectKills: saved.lowProtectKills === true && Number(saved.lowProtectKillsMin) > 0,
        lowProtectKdr: saved.lowProtectKdr === true && Number(saved.lowProtectKdrMin) > 0,
        lowProtectTime: saved.lowProtectTime === true && Number(saved.lowProtectTimeMax) > 0,
        lowProtectPosition: saved.lowProtectPosition === true && Number(saved.lowProtectScoreGap) > 0,
        lowProtectKillsMin: saved.lowProtectKills === true ? clampInteger(saved.lowProtectKillsMin, 0, 0, 100) : 0,
        lowProtectKdrMin: saved.lowProtectKdr === true && Number.isFinite(Number(saved.lowProtectKdrMin)) ? Math.max(0, Math.min(20, Number(saved.lowProtectKdrMin))) : 0,
        lowProtectTimeMax: saved.lowProtectTime === true ? clampInteger(saved.lowProtectTimeMax, 0, 0, 300) : 0,
        lowProtectScoreGap: saved.lowProtectPosition === true ? clampInteger(saved.lowProtectScoreGap, 0, 0, 2000) : 0,
        lowProtectSelected: ['kills', 'kdr', 'time', 'position'].includes(saved.lowProtectSelected) ? saved.lowProtectSelected : 'kills',
        lowProtectOperators: Object.fromEntries(['kills', 'kdr', 'time', 'position'].map(key => [key,
            ['eq', 'ne', 'gt', 'lt', 'ge', 'le'].includes(saved.lowProtectOperators?.[key]) ? saved.lowProtectOperators[key]
                : (key === 'kills' || key === 'kdr' ? 'ge' : 'le')])),
        lowProtectGraces: Object.fromEntries(['kills', 'kdr', 'time', 'position'].map(key => [key,
            clampInteger(saved.lowProtectGraces?.[key], key === 'kdr' ? 30 : clampInteger(saved.lowProtectGrace, 15, 0, 60), 0, 60)])),
        playerBlacklistEnabled: saved.playerBlacklistEnabled ?? true,
        playerWhitelistEnabled: saved.playerWhitelistEnabled ?? true,
        playerBlacklist: sanitizePlayerNames(saved.playerBlacklist),
        playerWhitelist: sanitizePlayerNames(saved.playerWhitelist),
        playerDisplay: Array.isArray(saved.playerDisplay) ? saved.playerDisplay.filter(item =>
            item && typeof item.ign === "string" && typeof item.clan === "string")
            .slice(0, 200).map(item => ({ ign: item.ign.slice(0, 64), clan: item.clan.slice(0, 32),
                ...(Array.isArray(item.badges) ? { badges: sanitizePlayerBadges(item.badges) } : {}) })) : [],
        priorityMode: saved.priorityMode || "",
        selectionPriority: ["players", "ping"].includes(saved.selectionPriority) ? saved.selectionPriority : NEW_USER_DEFAULTS.selectionPriority,
        randomizeSimilar: saved.randomizeSimilar === true,
        preferredMaps: Array.isArray(saved.preferredMaps) ? [...new Set(saved.preferredMaps.filter(map => MAPS.includes(map)))] : [],
        gradColor1: isValidHex(saved.gradColor1) ? normalizeHexColor(saved.gradColor1) : NEW_USER_DEFAULTS.gradColor1,
        gradColor2: isValidHex(saved.gradColor2) ? normalizeHexColor(saved.gradColor2) : NEW_USER_DEFAULTS.gradColor2,
        gradientEnabled: saved.gradientEnabled ?? NEW_USER_DEFAULTS.gradientEnabled,
        automaticUpdates: saved.automaticUpdates !== false,
        toastColor: /^#[0-9a-f]{6}$/i.test(saved.toastColor || "") ? saved.toastColor : "#0cb800",
        toastOffsetX: clampInteger(saved.toastOffsetX, 24, 0, 2000),
        toastOffsetY: clampInteger(saved.toastOffsetY, 24, 0, 2000),
        toastSeconds: clampInteger(saved.toastSeconds, NEW_USER_DEFAULTS.notificationSeconds, 0, 5),
        recoveryToastSeconds: clampInteger(saved.recoveryToastSeconds, NEW_USER_DEFAULTS.notificationSeconds, 0, 5),
        searchToastSeconds: clampInteger(saved.searchToastSeconds, NEW_USER_DEFAULTS.notificationSeconds, 0, 5),
        recoveryToastColor: /^#[0-9a-f]{6}$/i.test(saved.recoveryToastColor || "") ? saved.recoveryToastColor : "#ff3030",
        recoveryToastGap: clampInteger(saved.recoveryToastGap, 24, 0, 500),
        recoveryToastOffsetX: clampInteger(saved.recoveryToastOffsetX, INSTALL_DEFAULTS.recoveryToastOffsetX, 0, 2000),
        recoveryToastOffsetY: clampInteger(saved.recoveryToastOffsetY, INSTALL_DEFAULTS.recoveryToastOffsetY, 0, 2000),
        searchToastColor: isValidHex(saved.searchToastColor) ? normalizeHexColor(saved.searchToastColor) : NEW_USER_DEFAULTS.searchToastColor,
        searchToastOffsetX: clampInteger(saved.searchToastOffsetX, clampInteger(saved.toastOffsetX, 24, 0, 2000), 0, 2000),
        searchToastOffsetY: clampInteger(saved.searchToastOffsetY, INSTALL_DEFAULTS.searchToastOffsetY, 0, 2000),
        css: saved.css || "",
        script: saved.script || "",
        tutorialDismissed: typeof saved.tutorialDismissed === "boolean" ? saved.tutorialDismissed : !isNewSettingsProfile,
        binding: false,
        bindingCancel: false,
        visible: false,
        scrollPos: 0
    };

    const DEFAULT_GRAD = { c1: NEW_USER_DEFAULTS.gradColor1, c2: NEW_USER_DEFAULTS.gradColor2 };
    const GRAD_PRESETS = [
        [DEFAULT_GRAD.c1, DEFAULT_GRAD.c2],
        ["#7a00ff", "#00d4ff"],
        ["#cc1111", "#ff7700"],
        ["#00c853", "#b2ff00"],
        ["#ff0080", "#ffb300"],
        ["#0066ff", "#00e5ff"],
        ["#ff1744", "#ff616f"],
        ["#111111", "#888888"],
        ["#00e0b0", "#ff00aa"]
    ];

    // An inverted player range would never match; widen it to the saved minimum.
    if (STATE.minPlayers > STATE.maxPlayers) STATE.maxPlayers = STATE.minPlayers;

    if (!["match", "extensions", "settings"].includes(STATE.tab)) {
        STATE.tab = "match";
    }

    // Persist preferences without restoring transient UI and key-binding states.
    function saveState() {
        STATE.targetHuntMaps = sanitizeTargetHuntMaps(STATE.targetHuntMaps);
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({
                ...saved,
                ...STATE,
                defaultsAppliedVersion: DEFAULTS_APPLIED_VERSION,
                binding: false,
                bindingCancel: false,
                visible: false
            }));
            return true;
        } catch (error) {
            // A full or blocked storage must not break the control that changed the setting.
            console.warn("Turf Matchmaking could not save settings.", error);
            return false;
        }
    }

    // Session writes carry retry state across navigation; failures degrade to a fresh search.
    function writeSessionJSON(key, value) {
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn(`Turf Matchmaking could not store ${key}.`, error);
            return false;
        }
    }

    if (loadedSettings.migratedFromLegacy || needsDefaultMigration) saveState();

    // Convert and combine colors used by the configurable interface theme.
    function hexToRgb(hex) {
        hex = String(hex).replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const n = parseInt(hex, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function rgbToHex(r, g, b) {
        return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    }

    function mix(h1, h2, t) {
        const a = hexToRgb(h1), b = hexToRgb(h2);
        return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
    }

    function shade(hex, p) {
        const { r, g, b } = hexToRgb(hex);
        const t = p < 0 ? 0 : 255, k = Math.abs(p) / 100;
        return rgbToHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k);
    }

    function isValidHex(c) { return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(c).trim()); }
    function normalizeHexColor(color) {
        const value = String(color).trim();
        return value[0] === "#" ? value : `#${value}`;
    }

    function applyTheme(c1, c2) {
        if (!isValidHex(c1) || !isValidHex(c2)) return false;
        c1 = normalizeHexColor(c1);
        c2 = normalizeHexColor(c2);
        STATE.gradColor1 = c1; STATE.gradColor2 = c2;

        const useGrad = STATE.gradientEnabled !== false;
        const mid = useGrad ? mix(c1, c2, 0.5) : c1;
        const accent = mid;
        const { r, g, b } = hexToRgb(accent);
        const root = document.documentElement.style;
        root.setProperty('--g1', c1);
        root.setProperty('--gm', mid);
        root.setProperty('--g2', useGrad ? c2 : c1);
        root.setProperty('--popup-border-color', c1);
        if (useGrad) {
            root.setProperty('--grad', `linear-gradient(135deg, ${c1} 0%, ${mid} 50%, ${c2} 100%)`);
            root.setProperty('--grad-bright', `linear-gradient(135deg, ${shade(c1, 18)} 0%, ${shade(mid, 18)} 50%, ${shade(c2, 18)} 100%)`);
            root.setProperty('--grad-v', `linear-gradient(to bottom, ${c1}, ${mid}, ${c2})`);
        } else {
            root.setProperty('--grad', c1);
            root.setProperty('--grad-bright', shade(c1, 18));
            root.setProperty('--grad-v', c1);
        }
        root.setProperty('--accent', accent);
        root.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
        root.setProperty('--accent-dark', shade(c1, -55));
        root.setProperty('--scrollbar-thumb', `rgba(${r}, ${g}, ${b}, 0.42)`);
        root.setProperty('--scrollbar-thumb-hover', `rgba(${r}, ${g}, ${b}, 0.68)`);

        if (ui) ui.style.borderColor = accent;
        if (mBtn) mBtn.style.borderColor = accent;
        overlay.style.setProperty('border-color', overlay.classList.contains('compact-search') ? STATE.searchToastColor : c1, 'important');
        return true;
    }

    // Escape user-defined preset names before inserting them into settings HTML.
    function escapeHtml(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, m => {
            switch (m) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#039;';
                default: return m;
            }
        });
    }

    // Apply optional user extensions stored in the Extensions panel.
    function applyCSS(css) {
        let el = document.getElementById("lombre_custom_css");
        if (!el) { el = document.createElement("style"); el.id = "lombre_custom_css"; document.head.appendChild(el); }
        el.textContent = css;
    }

    function applyScript(code) {
        if (!code) return;
        try {
            new Function(code)();
        } catch (error) {
            console.error("The saved JavaScript extension failed to run.", error);
        }
    }

    // Manage settings-panel visibility and temporary key-capture modes.
    function cancelBindingModes() {
        const changed = STATE.binding || STATE.bindingCancel;
        STATE.binding = false;
        STATE.bindingCancel = false;
        return changed;
    }

    // Restore script-owned UI after the game or client rebuilds its document body.
    function mountRuntimeUI() {
        if (!document.body) return false;
        if (!ui.isConnected) document.body.appendChild(ui);
        if (!mBtn.isConnected) document.body.appendChild(mBtn);
        if (firstRunTutorial && !firstRunTutorial.isConnected) {
            document.body.appendChild(firstRunTutorial);
            updateFirstRunTutorialPosition();
        }
        mountMatchmakerStyles();
        return true;
    }

    function toggleUI(force, reason = "internal", key = "") {
        clearPendingSearchHotkey();
        const wasVisible = STATE.visible;
        STATE.visible = force !== undefined ? force : !STATE.visible;
        if (!STATE.visible) cancelBindingModes();
        if (STATE.visible && !mountRuntimeUI()) {
            STATE.visible = false;
            return;
        }
        ui.style.display = STATE.visible ? "block" : "none";
        if (STATE.visible) {
            dismissFirstRunTutorial();
            if (!wasVisible) recordRuntimeAction("panel-open", reason, key);
            render();
        }
    }

    // Define the shared settings, search overlay, and connection toast styles.
    const matchmakerStyles = document.createElement("style");
    matchmakerStyles.id = "civilian_matchmaker_styles";
    matchmakerStyles.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Aldrich&display=swap');

        :root {
          --g1: #7a00ff;
          --gm: #3d6aff;
          --g2: #00d4ff;
          --popup-border-color: #7a00ff;
          --grad: linear-gradient(135deg, #7a00ff 0%, #3d6aff 50%, #00d4ff 100%);
          --grad-bright: linear-gradient(135deg, #922eff 0%, #6085ff 50%, #2edcff 100%);
          --grad-v: linear-gradient(to bottom, #7a00ff, #3d6aff, #00d4ff);
          --accent: #3d6aff;
          --accent-rgb: 61, 106, 255;
          --accent-dark: #370073;
          --scrollbar-thumb: rgba(61, 106, 255, 0.42);
          --scrollbar-thumb-hover: rgba(61, 106, 255, 0.68);
        }

        #lombre_ui, #lombre_ui *, #matchmakerPopupContainer, #matchmakerPopupContainer *, #turfConnectionToast, #turfConnectionToast *, #turfMatchmakerRecoveryToast, #turfMatchmakerRecoveryToast * {
          font-family: 'Aldrich', 'GameFont', 'Segoe UI', sans-serif !important;
        }

        #lombre_ui, #lombre_ui *, #matchmakerPopupContainer, #matchmakerPopupContainer * {
          scrollbar-width: thin;
          scrollbar-color: var(--scrollbar-thumb) transparent;
        }
        #lombre_ui ::-webkit-scrollbar-track,
        #matchmakerPopupContainer ::-webkit-scrollbar-track {
          box-shadow: none !important;
          border-radius: 999px !important;
          background: transparent !important;
        }
        #lombre_ui ::-webkit-scrollbar,
        #matchmakerPopupContainer ::-webkit-scrollbar {
          width: 5px !important;
          height: 5px !important;
          background: transparent !important;
        }
        #lombre_ui ::-webkit-scrollbar-thumb,
        #matchmakerPopupContainer ::-webkit-scrollbar-thumb {
          min-height: 28px;
          border: 0 !important;
          border-radius: 999px !important;
          background: var(--scrollbar-thumb) !important;
          box-shadow: none !important;
        }
        #lombre_ui ::-webkit-scrollbar-thumb:hover,
        #matchmakerPopupContainer ::-webkit-scrollbar-thumb:hover {
          background: var(--scrollbar-thumb-hover) !important;
          box-shadow: none !important;
        }
        #lombre_ui ::-webkit-scrollbar-button,
        #matchmakerPopupContainer ::-webkit-scrollbar-button {
          display: none !important;
          -webkit-appearance: none !important;
          width: 0 !important;
          height: 0 !important;
          min-width: 0 !important;
          min-height: 0 !important;
        }
        #lombre_ui ::-webkit-scrollbar-corner,
        #matchmakerPopupContainer ::-webkit-scrollbar-corner {
          background: transparent !important;
        }
        #matchmakerSearchFeed::-webkit-scrollbar-button:vertical:start:decrement,
        #matchmakerSearchFeed::-webkit-scrollbar-button:vertical:end:increment {
          display: none !important;
          -webkit-appearance: none !important;
          width: 0 !important;
          height: 0 !important;
        }

        @keyframes turfMatchmakerGlow163 {
          0% {
            box-shadow: 0 10px 45px rgba(0,0,0,0.95), 0 0 20px rgba(var(--accent-rgb), 0.35), inset 0 0 15px rgba(var(--accent-rgb), 0.05);
          }
          50% {
            box-shadow: 0 10px 45px rgba(0,0,0,0.95), 0 0 35px rgba(var(--accent-rgb), 0.6), inset 0 0 25px rgba(var(--accent-rgb), 0.15);
          }
          100% {
            box-shadow: 0 10px 45px rgba(0,0,0,0.95), 0 0 20px rgba(var(--accent-rgb), 0.35), inset 0 0 15px rgba(var(--accent-rgb), 0.05);
          }
        }

        .tab-btn:hover {
          color: #fff !important;
          border-color: var(--accent) !important;
          background: rgba(var(--accent-rgb), 0.15) !important;
          box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.2);
        }
        .m-select:hover {
          color: #fff !important;
          border-color: var(--accent) !important;
          background: rgba(var(--accent-rgb), 0.15) !important;
          transform: translateY(-1px);
          box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.2);
        }
        .filter-tool-btn:hover, .filter-preset-select:hover {
          color: #fff !important;
          border-color: #555 !important;
          background: #242424 !important;
        }
        #toggle_browser_cancel:hover, #toggle_filter_autojoin:hover, #toggle_filter_avoid_full:hover, #priority_mode_sel:hover, #target_map_hunt_dropdown:hover {
          border-color: var(--g2) !important;
          box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.3);
        }
        #target_map_hunt_dropdown > summary {
          list-style: none;
        }
        #target_map_hunt_dropdown > summary::-webkit-details-marker {
          display: none;
        }
        .target-map-hunt-option:hover {
          color: #fff !important;
          background: rgba(var(--accent-rgb), 0.18) !important;
        }
        #find_btn:hover, #load_css_btn:hover, #load_script_btn:hover {
          background: var(--grad-bright) !important;
          box-shadow: 0 0 25px rgba(var(--accent-rgb), 0.65) !important;
          transform: translateY(-2px);
        }
        #find_btn:active, #load_css_btn:active, #load_script_btn:active {
          transform: translateY(0) scale(0.98);
        }
        #kb_btn:hover, #cancel_kb_btn:hover {
          border-color: var(--accent) !important;
          color: #fff !important;
          background: rgba(var(--accent-rgb), 0.1) !important;
        }
        #close_btn:hover {
          color: var(--accent) !important;
          transform: scale(1.2);
          text-shadow: 0 0 8px rgba(var(--accent-rgb), 0.6);
        }

        @keyframes matchmakerPopupSlideDown {
          0% { transform: translate(-50%, -100%); opacity: 0; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes connectionToastSlideIn {
          0% { transform: translateY(-28px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        #turfConnectionToast {
          position: fixed;
          left: 24px;
          bottom: 24px;
          z-index: 999999999;
          box-sizing: border-box;
          min-width: 300px;
          max-width: min(420px, calc(100vw - 48px));
          padding: 14px 18px;
          color: white;
          background: rgba(13, 13, 13, 0.97);
          border: 2px solid var(--toast-color, var(--accent));
          border-radius: 4px;
          box-shadow: 0 12px 35px rgba(0,0,0,0.8), 0 0 18px rgba(var(--toast-rgb, var(--accent-rgb)),0.45);
          pointer-events: none;
          animation: connectionToastSlideIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
          transition: transform 0.25s ease, opacity 0.25s ease;
        }
        #turfConnectionToast.hiding {
          transform: translateY(18px);
          opacity: 0;
        }
        #turfConnectionToastTitle {
          color: white;
          font-size: 14px;
          font-weight: bold;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          text-shadow: 0 0 8px rgba(var(--toast-rgb, var(--accent-rgb)),0.55);
        }
        #turfConnectionToastDetails {
          margin-top: 6px;
          color: #bdbdbd;
          font-size: 11px;
          line-height: 1.45;
          letter-spacing: 0.5px;
        }
        #turfConnectionToastSummary {
          margin-top: 7px;
          color: var(--toast-color, var(--accent));
          font-size: 13px;
          font-weight: bold;
          letter-spacing: 0.8px;
        }
        #turfMatchmakerRecoveryToast {
          position: fixed;
          left: 348px;
          bottom: 24px;
          z-index: 999999999;
          box-sizing: border-box;
          min-width: 240px;
          max-width: min(280px, calc(100vw - 48px));
          padding: 12px 15px;
          color: white;
          background: rgba(13, 13, 13, 0.97);
          border: 2px solid var(--recovery-toast-color, #ff3030);
          border-radius: 4px;
          box-shadow: 0 12px 35px rgba(0,0,0,0.8), 0 0 16px rgba(var(--recovery-toast-rgb, 255, 48, 48),0.42);
          pointer-events: none;
          animation: connectionToastSlideIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
          transition: transform 0.25s ease, opacity 0.25s ease;
        }
        #turfMatchmakerRecoveryToast.hiding {
          transform: translateY(18px);
          opacity: 0;
        }
        #turfMatchmakerRecoveryToastTitle {
          color: white;
          font-size: 12px;
          font-weight: bold;
          line-height: 1.4;
          letter-spacing: 1px;
          text-transform: uppercase;
          text-shadow: 0 0 8px rgba(var(--recovery-toast-rgb, 255, 48, 48),0.5);
        }
        #matchmakerPopupContainer {
          position: fixed;
          top: 10em;
          left: 50%;
          transform: translate(-50%, 0);
          z-index: 200000000;
          box-sizing: border-box;
          width: 35em;
          aspect-ratio: 2.5/1;
          border-radius: 4px;
          overflow: hidden;
          pointer-events: all;
          background-color: rgba(13, 13, 13, 0.98);
          border: 2px solid var(--popup-border-color);
          animation: matchmakerPopupSlideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards, turfMatchmakerGlow163 5s infinite ease-in-out;
        }
        #matchmakerPopupContainer.searching {
          background-image: none !important;
          background: rgba(13, 13, 13, 0.99);
          width: 24em;
          top: 25%;
          bottom: auto;
          transform: translate(-50%, -50%);
          aspect-ratio: auto;
          height: auto;
          padding: 1.1em 1.4em;
          border: 2px solid var(--popup-border-color);
          animation: turfMatchmakerGlow163 5s infinite ease-in-out;
        }
        #matchmakerSearchContainer {
          display: flex;
          flex-direction: column;
          height: auto;
        }
        #matchmakerSearchStatus {
          font-size: 1.6em;
          color: white;
          font-weight: bold;
          margin-bottom: 0.7em;
          text-align: center;
          letter-spacing: 3px;
          text-transform: uppercase;
          text-shadow: 0 0 8px rgba(var(--accent-rgb), 0.5);
          white-space: nowrap;
        }
        #matchmakerSearchContainer.scanning #matchmakerSearchStatus {
          font-size: calc(1.6em - 2px);
        }
        #matchmakerSearchFeedShell {
          position: relative;
          min-height: 0;
        }
        #matchmakerSearchFeed {
          display: flex;
          flex-direction: column;
          gap: 0.5em;
          margin-bottom: 0.8em;
          min-height: 0;
          max-height: 240px;
          overflow-y: auto;
          padding-right: 8px;
          scrollbar-width: none !important;
          -ms-overflow-style: none;
        }
        #matchmakerSearchFeed::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        #matchmakerSearchScrollbar {
          position: absolute;
          top: 2px;
          right: 1px;
          display: none;
          width: 5px;
          border-radius: 999px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.16s ease;
        }
        #matchmakerSearchScrollbar.scrollable {
          display: block;
          opacity: 1;
          pointer-events: auto;
        }
        #matchmakerSearchScrollbarThumb {
          position: absolute;
          top: 0;
          right: 1px;
          width: 3px;
          min-height: 24px;
          border-radius: 999px;
          background: var(--scrollbar-thumb);
          cursor: grab;
          transition: width 0.12s ease, background 0.12s ease;
        }
        #matchmakerSearchScrollbar:hover #matchmakerSearchScrollbarThumb,
        #matchmakerSearchScrollbar.dragging #matchmakerSearchScrollbarThumb {
          right: 0;
          width: 4px;
          background: var(--scrollbar-thumb-hover);
        }
        #matchmakerSearchScrollbar.dragging #matchmakerSearchScrollbarThumb {
          cursor: grabbing;
        }
        #matchmakerSearchFeed:empty { margin-bottom: 0; }
        #matchmakerSearchContainer.hunting #matchmakerSearchFeed {
          max-height: none !important;
          overflow-y: hidden !important;
          padding-right: 0;
        }
        #matchmakerSearchContainer.hunting .mm-feed-entry {
          padding: 0.38em 0.6em;
          font-size: 0.82em;
        }
        #matchmakerSearchCounter:empty { margin-bottom: 0; }
        #matchmakerSearchCounter {
          font-size: 1.1em;
          color: #989898;
          text-align: center;
          margin-bottom: 0.8em;
          font-weight: bold;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        #matchmakerSearchCancel {
          text-align: center;
          border: 2px solid var(--accent);
          box-shadow: inset 0 -4px 0 var(--accent-dark), 0 0 10px rgba(var(--accent-rgb), 0.2);
          border-radius: 4px;
          padding: 0.6em;
          color: white;
          cursor: pointer;
          background: rgba(13, 13, 13, 0.7);
          transition: all 0.15s ease;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-size: 1.1em;
        }
        #matchmakerSearchCancel:hover {
          background: var(--grad) !important;
          box-shadow: inset 0 0 0 var(--accent), 0 0 15px rgba(var(--accent-rgb), 0.5) !important;
          transform: translateY(-2px);
          border-color: white !important;
        }
        #matchmakerSearchCancel:active {
          transform: translateY(0) scale(0.98);
        }

        #matchmakerPopupContainer.searching.compact-search {
          top: auto;
          left: 24px;
          bottom: 134px;
          transform: none;
          z-index: 999999998;
          width: min(300px, calc(100vw - 48px));
          min-height: 0;
          padding: 11px 15px;
          pointer-events: auto;
          animation: connectionToastSlideIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
          box-shadow: 0 12px 35px rgba(0,0,0,0.8), 0 0 16px rgba(var(--accent-rgb),0.42);
        }
        #matchmakerPopupContainer.searching.compact-search #matchmakerSearchStatus {
          margin: 0;
          flex: 1 1 auto;
          min-width: 0;
          font-size: 12px;
          line-height: 1.4;
          text-align: left;
          letter-spacing: 1.2px;
        }
        #matchmakerPopupContainer.searching.compact-search #matchmakerSearchFeedShell,
        #matchmakerPopupContainer.searching.compact-search #matchmakerSearchFeed,
        #matchmakerPopupContainer.searching.compact-search #matchmakerSearchCounter {
          display: none;
        }
        #matchmakerPopupContainer.searching.compact-search #matchmakerSearchContainer {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        #matchmakerPopupContainer.searching.compact-search #matchmakerSearchCancel {
          display: block;
          flex: 0 0 auto;
          padding: 5px 9px;
          border-width: 1px;
          border-color: #3a3a3a;
          box-shadow: none;
          background: #171717;
          color: #bdbdbd;
          font-size: 9px;
          line-height: 1.2;
          pointer-events: auto;
        }
        #matchmakerPopupContainer.searching.compact-search #matchmakerSearchCancel:hover {
          border-color: #666 !important;
          background: #242424 !important;
          box-shadow: none !important;
        }

        .mm-feed-entry {
          display: flex;
          justify-content: space-between;
          padding: 0.5em 0.8em;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.4);
          font-size: 1em;
          line-height: 1.25;
          align-items: center;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .mm-feed-entry.mm-pass {
          border-left: 5px solid #00c853;
          color: #00c853;
          background: rgba(0, 200, 83, 0.08);
          text-shadow: 0 0 5px rgba(0, 200, 83, 0.3);
        }
        .mm-feed-entry.mm-fail {
          border-left: 5px solid var(--accent);
          color: var(--accent);
          background: rgba(var(--accent-rgb), 0.08);
          opacity: 0.7;
          text-shadow: 0 0 5px rgba(var(--accent-rgb), 0.3);
        }
        .mm-feed-region {
          font-weight: bold;
          text-transform: uppercase;
        }
        .mm-feed-map {
          flex-grow: 1;
          margin-left: 1em;
          text-align: left;
        }
        .mm-feed-players {
          font-weight: bold;
        }
    `;
    // Share the exact search rules with isolated preview nodes, without duplicate IDs.
    matchmakerStyles.textContent = matchmakerStyles.textContent.replace(
        /#(matchmaker(?:PopupContainer|Search[A-Za-z]*))/g,
        (_, id) => `:is(#${id}, [data-search-preview-id="${id}"])`
    );
    // Mount styles as soon as a document host exists at document-start.
    const mountMatchmakerStyles = () => {
        const styleHost = document.head || document.documentElement;
        if (!styleHost) return false;
        if (!matchmakerStyles.isConnected) styleHost.appendChild(matchmakerStyles);
        return true;
    };
    if (!mountMatchmakerStyles()) {
        const styleObserver = new MutationObserver(() => {
            if (mountMatchmakerStyles()) styleObserver.disconnect();
        });
        styleObserver.observe(document, { childList: true, subtree: true });
    }

    // Track the active search lifecycle, network work, and backend cooldown state.
    let searchCanceled = false;
    let searchRunId = 0;
    let liveRefreshTimer = null;
    const activeRequestControllers = new Set();
    const regionalPingCache = new Map();
    let matchmakerBackoffUntil = 0;
    let matchmakerBackoffStatus = 0;
    let matchmakerBackoffLoggedAt = 0;
    let activeSearchOptions = { purpose: "normal", targetMaps: [], background: false };

    const MATCHMAKER_CONFIG = {
        requestTimeoutMs: 5000,
        gameInfoTimeoutMs: 2500,
        pingRequestTimeoutMs: 2200,
        pingCacheMs: 45000,
        globalRefreshMs: 8500,
        candidateRefreshMs: 1250,
        hydrationBatchSize: 16,
        hydrationConcurrency: 8,
        finalValidationCount: 5,
        liveCandidateCount: 3,
        candidateListRefreshLimitMs: 120000,
        huntingWatchCount: 6,
        matchmakerCooldownMs: 60000
    };
    const CONNECTION_TOAST_KEY = "lombre_mm_connection_toast";
    const RECOVERY_TOAST_KEY = "turf_mm_recovery_toast";
    const JOIN_MARKER_KEY = "turf_mm_join_marker";
    const JOIN_MARKER_TTL_MS = 5 * 60 * 1000;
    const JOIN_QUEUE_KEY = "turf_mm_candidate_queue";
    const JOIN_QUEUE_TTL_MS = 5 * 60 * 1000;
    const QUICK_FALLBACK_KEY = "turf_mm_quick_fallback";
    const JOIN_RECOVERY_KEY = "turf_mm_join_recovery";
    const REJECTED_LOBBY_MS = 60000;
    const JOIN_RECOVERY_TTL_MS = 30 * 60 * 1000;
    const RECENT_LOBBIES_KEY = "turf_mm_recent_lobbies";
    const TARGET_HUNT_SESSION_KEY = "turf_mm_target_hunt_session";
    const TARGET_HUNT_SESSION_TTL_MS = 4 * 60 * 60 * 1000;

    // Keep target-map searches limited to the dedicated Turf Wars map selection.
    function getTargetHuntMaps() {
        if (!STATE.serverHunting) return [];
        return sanitizeTargetHuntMaps(STATE.targetHuntMaps);
    }

    function getTargetHuntStatusLabel(prefix, maps = activeSearchOptions.targetMaps) {
        const targetMaps = sanitizeTargetHuntMaps(maps);
        if (targetMaps.length === 1) return `${prefix} ${targetMaps[0].toUpperCase()}`;
        return `${prefix} ${targetMaps.length} TARGET MAPS`;
    }

    function normalizeSearchOptions(options = {}) {
        const requestedPurpose = options?.purpose;
        const selectedTargetMaps = getTargetHuntMaps();
        const requestedTargetMaps = Array.isArray(options?.targetMaps)
            ? sanitizeTargetHuntMaps(options.targetMaps).filter(map => selectedTargetMaps.includes(map))
            : selectedTargetMaps;
        const targetMaps = requestedPurpose === "target" ? requestedTargetMaps : [];
        if (requestedPurpose === "target" && targetMaps.length) {
            return { purpose: "target", targetMaps, background: options.background !== false, ...(options.manual ? { manual: true } : {}),
                ...(options.recovery ? { recovery: true } : {}) };
        }
        return {
            purpose: requestedPurpose === "fallback" ? "fallback" : "normal",
            targetMaps: [],
            ...(options.manual ? { manual: true } : {}),
            ...(options.recovery ? { recovery: true } : {}),
            ...(options.lowPlayerGuard ? { lowPlayerGuard: true } : {}),
            background: options.background === true
        };
    }

    function storeTargetHuntSession(game, purpose) {
        const targetMaps = getTargetHuntMaps();
        if (!targetMaps.length || !game?.gameID || !game?.map) {
            sessionStorage.removeItem(TARGET_HUNT_SESSION_KEY);
            return null;
        }
        const session = {
            gameID: game.gameID,
            map: game.map,
            targetMaps,
            purpose: purpose === "target" ? "target" : "fallback",
            createdAt: Date.now()
        };
        writeSessionJSON(TARGET_HUNT_SESSION_KEY, session);
        return session;
    }

    function getValidTargetHuntSession() {
        const currentGameID = new URLSearchParams(window.location.search).get("game");
        const targetMaps = getTargetHuntMaps();
        try {
            const session = JSON.parse(sessionStorage.getItem(TARGET_HUNT_SESSION_KEY) || "null");
            const age = Date.now() - Number(session?.createdAt);
            const sessionTargetMaps = sanitizeTargetHuntMaps(session?.targetMaps);
            const selectionMatches = targetMaps.length === sessionTargetMaps.length
                && targetMaps.every((map, index) => map === sessionTargetMaps[index]);
            // Lobbies rotate maps between rounds; a session that names another map would keep hunting paused.
            let liveMap = "";
            try { liveMap = String(window.getGameActivity?.()?.map || ""); } catch (_) { /* unavailable */ }
            if (!targetMaps.length || !currentGameID || session?.gameID !== currentGameID
                || !selectionMatches || !MAPS.includes(session?.map)
                || (liveMap && normalizeMapName(liveMap) !== normalizeMapName(session.map))
                || !Number.isFinite(age) || age < 0 || age > TARGET_HUNT_SESSION_TTL_MS) {
                sessionStorage.removeItem(TARGET_HUNT_SESSION_KEY);
                return null;
            }
            return session;
        } catch (error) {
            sessionStorage.removeItem(TARGET_HUNT_SESSION_KEY);
            return null;
        }
    }

    // Hunt only selected maps other than the map already running in the current lobby.
    function getPendingTargetHuntMaps(session = getValidTargetHuntSession()) {
        const currentMap = normalizeMapName(session?.map);
        if (!currentMap) return [];
        return getTargetHuntMaps().filter(map => normalizeMapName(map) !== currentMap);
    }

    function getRetrySearchOptions() {
        const session = getValidTargetHuntSession();
        return normalizeSearchOptions(session?.purpose === "target"
            ? { purpose: "target", targetMaps: getPendingTargetHuntMaps(session), background: true }
            : { purpose: "fallback" });
    }

    // Maintain a newest-first cache of recently joined lobby IDs.
    function readRecentLobbies() {
        try {
            const value = JSON.parse(localStorage.getItem(RECENT_LOBBIES_KEY) || "[]");
            if (!Array.isArray(value)) return [];
            return [...new Set(value.filter(gameID => typeof gameID === "string" && gameID.includes(":")))];
        } catch (error) {
            return [];
        }
    }

    function trimRecentLobbies() {
        const limit = Math.min(10, Math.max(1, Number(STATE.pastLobbyCount) || 3));
        const recent = readRecentLobbies().slice(0, limit);
        localStorage.setItem(RECENT_LOBBIES_KEY, JSON.stringify(recent));
        return recent;
    }

    function rememberRecentLobby(gameID) {
        if (typeof gameID !== "string" || !gameID.includes(":")) return readRecentLobbies();
        const recent = [gameID, ...readRecentLobbies().filter(id => id !== gameID)];
        localStorage.setItem(RECENT_LOBBIES_KEY, JSON.stringify(recent));
        return trimRecentLobbies();
    }

    // Build the single search overlay used by scanning and hunting states.
    const overlay = document.createElement("div");
    overlay.id = "matchmakerPopupContainer";

    const searchContainer = document.createElement("div");
    searchContainer.id = "matchmakerSearchContainer";

    const searchStatus = document.createElement("div");
    searchStatus.id = "matchmakerSearchStatus";
    searchContainer.appendChild(searchStatus);

    const searchFeedShell = document.createElement("div");
    searchFeedShell.id = "matchmakerSearchFeedShell";

    const searchFeed = document.createElement("div");
    searchFeed.id = "matchmakerSearchFeed";
    searchFeedShell.appendChild(searchFeed);

    const searchScrollRail = document.createElement("div");
    searchScrollRail.id = "matchmakerSearchScrollbar";
    const searchScrollThumb = document.createElement("div");
    searchScrollThumb.id = "matchmakerSearchScrollbarThumb";
    searchScrollRail.appendChild(searchScrollThumb);
    searchFeedShell.appendChild(searchScrollRail);
    searchContainer.appendChild(searchFeedShell);

    // Replace the embedded browser scrollbar with a fading, draggable GUI indicator.
    let searchScrollbarFrame = 0;
    let searchScrollbarDrag = null;

    function updateSearchScrollbar() {
        searchScrollbarFrame = 0;
        const viewportHeight = searchFeed.clientHeight;
        const contentHeight = searchFeed.scrollHeight;
        const overflowHidden = getComputedStyle(searchFeed).overflowY === "hidden";
        const scrollable = !overflowHidden && viewportHeight > 0 && contentHeight > viewportHeight + 1;
        searchScrollRail.classList.toggle("scrollable", scrollable);
        if (!scrollable) {
            searchScrollRail.classList.remove("dragging");
            searchScrollThumb.style.removeProperty("height");
            searchScrollThumb.style.removeProperty("transform");
            return false;
        }
        const trackHeight = Math.max(24, viewportHeight - 4);
        const thumbHeight = Math.max(24, Math.round(trackHeight * viewportHeight / contentHeight));
        const scrollRange = Math.max(1, contentHeight - viewportHeight);
        const travel = Math.max(0, trackHeight - thumbHeight);
        const thumbTop = Math.round(travel * searchFeed.scrollTop / scrollRange);
        searchScrollRail.style.height = `${trackHeight}px`;
        searchScrollThumb.style.height = `${thumbHeight}px`;
        searchScrollThumb.style.transform = `translateY(${thumbTop}px)`;
        return true;
    }

    function scheduleSearchScrollbarUpdate() {
        if (searchScrollbarFrame) return;
        searchScrollbarFrame = requestAnimationFrame(updateSearchScrollbar);
    }

    searchFeed.addEventListener("scroll", scheduleSearchScrollbarUpdate, { passive: true });
    searchScrollRail.addEventListener("pointerdown", event => {
        if (!searchScrollRail.classList.contains("scrollable")) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.target !== searchScrollThumb) {
            const railRect = searchScrollRail.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (event.clientY - railRect.top) / railRect.height));
            searchFeed.scrollTop = ratio * Math.max(0, searchFeed.scrollHeight - searchFeed.clientHeight);
        }
        searchScrollbarDrag = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startScrollTop: searchFeed.scrollTop
        };
        searchScrollRail.classList.add("dragging");
        searchScrollThumb.setPointerCapture?.(event.pointerId);
    });
    document.addEventListener("pointermove", event => {
        if (!searchScrollbarDrag || event.pointerId !== searchScrollbarDrag.pointerId) return;
        event.preventDefault();
        const scrollRange = Math.max(0, searchFeed.scrollHeight - searchFeed.clientHeight);
        const travel = Math.max(1, searchScrollRail.clientHeight - searchScrollThumb.offsetHeight);
        searchFeed.scrollTop = searchScrollbarDrag.startScrollTop
            + (event.clientY - searchScrollbarDrag.startY) * scrollRange / travel;
    }, true);
    document.addEventListener("pointerup", event => {
        if (!searchScrollbarDrag || event.pointerId !== searchScrollbarDrag.pointerId) return;
        searchScrollbarDrag = null;
        searchScrollRail.classList.remove("dragging");
        updateSearchScrollbar();
    }, true);
    new MutationObserver(scheduleSearchScrollbarUpdate).observe(searchFeed, { childList: true });
    if (typeof ResizeObserver === "function") {
        new ResizeObserver(scheduleSearchScrollbarUpdate).observe(searchFeed);
    }

    const searchCounter = document.createElement("div");
    searchCounter.id = "matchmakerSearchCounter";
    searchContainer.appendChild(searchCounter);

    const searchCancelBtn = document.createElement("div");
    searchCancelBtn.id = "matchmakerSearchCancel";
    searchCancelBtn.textContent = "Cancel";
    searchCancelBtn.addEventListener("click", () => cancelMatchmaking());
    searchContainer.appendChild(searchCancelBtn);

    overlay.appendChild(searchContainer);

    // Close or cancel search work without leaving active requests behind.
    function closeMatchmakerHUD() {
        searchScrollbarDrag = null;
        searchScrollRail.classList.remove("dragging");
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay.classList.remove("searching");
    }

    function stopMatchmakerWork() {
        if (liveRefreshTimer) {
            clearTimeout(liveRefreshTimer);
            liveRefreshTimer = null;
        }
        for (const controller of activeRequestControllers) {
            controller.abort();
        }
        activeRequestControllers.clear();
    }

    function isSearchActive(runId) {
        return !searchCanceled && runId === searchRunId;
    }

    // Cancellation shares the global input guard; no second keyboard listener races with Search.
    function handleHUDKeys(e, eventCode) {
        if (document.pointerLockElement || !overlay.isConnected) return;
        const isCancelKey = eventCode === STATE.cancelKeybind || eventCode === "Escape";
        if (isCancelKey) {
            stopHandledKey(e);
            recordRuntimeAction("search-cancel", "cancel-hotkey", eventCode);
            cancelMatchmaking();
        }
    }

    function cancelMatchmaking() {
        playerPolicy.suspended = null;
        clearPendingSearchHotkey();
        sessionStorage.removeItem(JOIN_RECOVERY_KEY);
        clearJoinMarker();
        clearTimeout(pendingRelaunchTimer);
        pendingRelaunchTimer = null;
        searchCanceled = true;
        searchRunId += 1;
        stopMatchmakerWork();
        window.playSelect?.();
        closeMatchmakerHUD();
        if (STATE.openServerBrowser && typeof window.openServerWindow === "function") {
            window.openServerWindow(0);
        }
    }

    // Stop a background target hunt without opening the server browser or playing cancel feedback.
    function replaceActiveSearch() {
        searchCanceled = true;
        searchRunId += 1;
        stopMatchmakerWork();
        closeMatchmakerHUD();
    }

    // Position compact search state above the configured connection notification.
    function applySearchHUDPresentation(compact = STATE.compactSearchStatus || activeSearchOptions.background) {
        const compactEligible = Boolean(compact)
            && (searchContainer.classList.contains("scanning") || searchContainer.classList.contains("hunting"));
        overlay.classList.toggle("compact-search", compactEligible);
        if (!compactEligible) {
            overlay.style.removeProperty("left");
            overlay.style.removeProperty("bottom");
            overlay.style.setProperty("border-color", STATE.gradColor1, "important");
            overlay.style.removeProperty("box-shadow");
            return;
        }
        applySearchNotificationAppearance(overlay);
    }

    function applySearchNotificationAppearance(element) {
        const rgb = hexToRgb(STATE.searchToastColor);
        const width = element.getBoundingClientRect().width || 300;
        const height = element.getBoundingClientRect().height || 44;
        element.style.left = `${Math.min(Math.max(0, window.innerWidth - width - 24), STATE.searchToastOffsetX)}px`;
        element.style.bottom = `${Math.min(Math.max(0, window.innerHeight - height), STATE.searchToastOffsetY)}px`;
        element.style.setProperty("border-color", STATE.searchToastColor, "important");
        element.style.boxShadow = `0 12px 35px rgba(0,0,0,0.8), 0 0 16px rgba(${rgb.r},${rgb.g},${rgb.b},0.42)`;
    }

    function refreshSearchNotification() {
        if (overlay.classList.contains("compact-search")) applySearchHUDPresentation(true);
        for (const id of ["turfSearchNotificationPreview", "turfSearchFinishedNotification"]) {
            const preview = document.getElementById(id);
            if (preview) applySearchNotificationAppearance(preview);
        }
    }

    function previewSearchNotification(id = "turfSearchNotificationPreview", text = "HUNTING", durationMs = STATE.searchToastSeconds * 1000) {
        document.getElementById(id)?.remove();
        if (durationMs <= 0) return;
        const preview = overlay.cloneNode(false);
        preview.id = id;
        preview.dataset.searchPreviewId = "matchmakerPopupContainer";
        preview.className = "searching compact-search";
        preview.style.cssText = "z-index:2147483647";
        const content = searchContainer.cloneNode(true);
        content.className = "hunting";
        const label = content.querySelector('#matchmakerSearchStatus');
        label.textContent = text;
        const cancel = content.querySelector('#matchmakerSearchCancel');
        // cloneNode does not copy event listeners from the live Cancel control.
        cancel.onclick = () => preview.remove();
        if (id === "turfSearchFinishedNotification") cancel.style.display = "none";
        for (const node of [content, ...content.querySelectorAll('[id]')]) {
            node.dataset.searchPreviewId = node.id;
            node.removeAttribute('id');
        }
        preview.append(content);
        (document.getElementById('uiBase') || document.body).append(preview);
        applySearchNotificationAppearance(preview);
        setTimeout(() => preview.remove(), durationMs);
    }

    function showSearchFinishedNotification(until) {
        document.getElementById("turfSearchFinishedNotification")?.remove();
        const remaining = Number(until) - Date.now();
        if (!Number.isFinite(remaining) || remaining <= 0 || STATE.searchToastSeconds === 0) return;
        previewSearchNotification("turfSearchFinishedNotification", "LOBBY FOUND", Math.min(remaining, STATE.searchToastSeconds * 1000));
    }

    function showSearchHUD(searchOptions = activeSearchOptions) {
        document.getElementById("turfSearchFinishedNotification")?.remove();
        searchCanceled = false;
        overlay.classList.add("searching");
        searchContainer.classList.remove("hunting");
        searchContainer.classList.add("scanning");
        const backgroundTargetHunt = searchOptions.purpose === "target" && searchOptions.background;
        searchStatus.textContent = backgroundTargetHunt
            ? `${getTargetHuntStatusLabel("SCANNING")}...`
            : "SCANNING LOBBIES...";
        searchFeed.innerHTML = "";
        searchFeed.style.maxHeight = "";
        searchCounter.textContent = "";
        // Early recovery can run before Krunker builds #uiBase; the fixed overlay also works from body.
        const base = document.getElementById("uiBase") || document.body;
        const shouldMount = !searchOptions.background || STATE.compactSearchStatus;
        if (!shouldMount) {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            applySearchHUDPresentation(false);
            return;
        }
        if (base) base.appendChild(overlay);
        applySearchHUDPresentation(searchOptions.background ? true : STATE.compactSearchStatus);
    }

    window.addEventListener("resize", () => {
        scheduleSearchScrollbarUpdate();
        if (overlay.classList.contains("searching") && overlay.classList.contains("compact-search")) {
            applySearchHUDPresentation(true);
        }
    });

    // Carry the selected lobby summary across navigation for the connection toast.
    function queueConnectionToast(game, pings) {
        const ping = Number.isFinite(pings[game.region]) ? `${pings[game.region]}ms` : null;
        const payload = {
            createdAt: Date.now(),
            searchFinishedUntil: overlay.classList.contains("compact-search") ? Date.now() + STATE.searchToastSeconds * 1000 : 0,
            region: REGION_NAMES[game.region] ?? game.region,
            map: game.map,
            gamemode: game.gamemode,
            players: `${game.playerCount}/${game.playerLimit}`,
            ping
        };
        try {
            sessionStorage.setItem(CONNECTION_TOAST_KEY, JSON.stringify(payload));
        } catch (error) {
            console.warn("Could not queue the connection notification.", error);
        }
        return payload;
    }

    // Persist retry progress across document navigation without storing it as a user preference.
    function readJoinRecovery() {
        try {
            const state = JSON.parse(sessionStorage.getItem(JOIN_RECOVERY_KEY) || "null");
            const age = Date.now() - Number(state?.updatedAt);
            if (!state || !Number.isFinite(age) || age < 0 || age > JOIN_RECOVERY_TTL_MS) return null;
            return {
                updatedAt: state.updatedAt,
                fullCount: clampInteger(state.fullCount, 0, 0, 5),
                temporary: state.temporary === true,
                options: normalizeSearchOptions(state.options || {}),
                rejected: Array.isArray(state.rejected) ? state.rejected.filter(item =>
                    typeof item?.id === "string" && Number.isFinite(item.until) && item.until > Date.now()
                ).slice(-32) : []
            };
        } catch { return null; }
    }

    function saveJoinRecovery(state) {
        return writeSessionJSON(JOIN_RECOVERY_KEY, { ...state, updatedAt: Date.now() });
    }

    // Keep the outgoing document from consuming the destination's join marker.
    let pendingJoinGameID = "";
    function setJoinMarker(gameID) {
        pendingJoinGameID = gameID;
        const recovery = readJoinRecovery() || { fullCount: 0, rejected: [] };
        saveJoinRecovery({ ...recovery, temporary: false, options: activeSearchOptions });
        writeSessionJSON(JOIN_MARKER_KEY, {
            gameID,
            createdAt: Date.now(),
            searchOptions: activeSearchOptions
        });
        sessionStorage.removeItem("lombre_joined_via_mm");
    }

    function clearJoinMarker() {
        pendingJoinGameID = "";
        sessionStorage.removeItem(JOIN_MARKER_KEY);
        sessionStorage.removeItem(JOIN_QUEUE_KEY);
        sessionStorage.removeItem("lombre_joined_via_mm");
    }

    // Optional, test-only diagnostics. The separate TurfMatchMakingDiagnostics.js userscript defines
    // window.__turfDiagnostics; without it these calls do nothing. Only events that Turf alone knows are sent here.
    function emitDiagnostic(event, details = {}) {
        const sink = window.__turfDiagnostics;
        if (typeof sink !== "function") return;
        try { sink(event, { version: SCRIPT_VERSION, ...details }); } catch (_) { /* Diagnostics never affect matchmaking. */ }
    }

    function describeMapFilter(options = activeSearchOptions) {
        return { selectedMaps: [...STATE.maps], purpose: options?.purpose || "manual",
            targetMaps: Array.isArray(options?.targetMaps) ? [...options.targetMaps] : [] };
    }

    function storeCandidateQueue(candidates, pings) {
        const remaining = Array.isArray(candidates) ? candidates.filter(candidate => candidate?.gameID).slice(0, 4) : [];
        try {
            if (!remaining.length) {
                sessionStorage.removeItem(JOIN_QUEUE_KEY);
                return;
            }
            sessionStorage.setItem(JOIN_QUEUE_KEY, JSON.stringify({
                createdAt: Date.now(),
                candidates: remaining,
                pings: pings && typeof pings === "object" ? pings : {},
                searchOptions: activeSearchOptions
            }));
        } catch (error) {
            console.warn("Could not store fallback lobby candidates.", error);
        }
    }

    function takeValidCandidateQueue() {
        try {
            const raw = sessionStorage.getItem(JOIN_QUEUE_KEY);
            sessionStorage.removeItem(JOIN_QUEUE_KEY);
            if (!raw) return null;
            const queue = JSON.parse(raw);
            const age = Date.now() - Number(queue?.createdAt);
            if (!Number.isFinite(age) || age < 0 || age > JOIN_QUEUE_TTL_MS || !Array.isArray(queue?.candidates) || !queue.candidates.length) {
                return null;
            }
            const candidates = queue.candidates.filter(candidate => candidate?.gameID).slice(0, 4);
            if (!candidates.length) return null;
            return {
                candidates,
                pings: queue.pings && typeof queue.pings === "object" ? queue.pings : {},
                searchOptions: normalizeSearchOptions(queue.searchOptions || getRetrySearchOptions())
            };
        } catch (error) {
            sessionStorage.removeItem(JOIN_QUEUE_KEY);
            return null;
        }
    }

    function getValidJoinMarker() {
        const currentGameID = new URLSearchParams(window.location.search).get("game");
        try {
            const raw = sessionStorage.getItem(JOIN_MARKER_KEY);
            if (!raw) {
                sessionStorage.removeItem("lombre_joined_via_mm");
                return null;
            }
            const marker = JSON.parse(raw);
            if (marker?.gameID === pendingJoinGameID && marker.gameID !== currentGameID) return null;
            const age = Date.now() - Number(marker?.createdAt);
            if (!currentGameID || marker?.gameID !== currentGameID || !Number.isFinite(age) || age < 0 || age > JOIN_MARKER_TTL_MS) {
                clearJoinMarker();
                return null;
            }
            return marker;
        } catch (error) {
            clearJoinMarker();
            return null;
        }
    }

    // Render the configurable connection toast after the target page is ready.
    function applyConnectionToastAppearance(toast) {
        const color = isValidHex(STATE.toastColor) ? normalizeHexColor(STATE.toastColor) : "#0cb800";
        const rgb = hexToRgb(color);
        const maxX = Math.max(0, window.innerWidth - 320);
        const maxY = Math.max(0, window.innerHeight - 90);
        const x = Math.min(maxX, Math.max(0, Math.round(Number(STATE.toastOffsetX) || 0)));
        const y = Math.min(maxY, Math.max(0, Math.round(Number(STATE.toastOffsetY) || 0)));
        toast.style.left = `${x}px`;
        toast.style.right = "auto";
        toast.style.bottom = `${y}px`;
        toast.style.setProperty("--toast-color", color);
        toast.style.setProperty("--toast-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }

    function showConnectionToast(payload) {
        document.getElementById("turfConnectionToast")?.remove();
        if (STATE.toastSeconds === 0) return;
        const toast = document.createElement("div");
        toast.id = "turfConnectionToast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        applyConnectionToastAppearance(toast);

        const title = document.createElement("div");
        title.id = "turfConnectionToastTitle";
        title.textContent = "CONNECTING TO SERVER";

        const summary = document.createElement("div");
        summary.id = "turfConnectionToastSummary";
        summary.textContent = [payload.region, payload.ping]
            .filter(Boolean)
            .join(" · ");

        const details = document.createElement("div");
        details.id = "turfConnectionToastDetails";
        details.textContent = [payload.map, payload.gamemode, payload.players]
            .filter(Boolean)
            .join(" · ");

        toast.append(title, summary, details);
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add("hiding"), Math.max(0, STATE.toastSeconds * 1000 - 300));
        setTimeout(() => toast.remove(), STATE.toastSeconds * 1000);
        return toast;
    }

    // Render a smaller red lobby-rejection toast beside the connection toast.
    function applyRecoveryToastAppearance(toast) {
        const color = isValidHex(STATE.recoveryToastColor) ? normalizeHexColor(STATE.recoveryToastColor) : "#ff3030";
        const rgb = hexToRgb(color);
        const toastWidth = toast.getBoundingClientRect().width || 240;
        const maxX = Math.max(0, window.innerWidth - toastWidth - 24);
        const maxY = Math.max(0, window.innerHeight - 70);
        const y = Math.min(maxY, STATE.recoveryToastOffsetY);
        toast.style.left = `${Math.min(maxX, STATE.recoveryToastOffsetX)}px`;
        toast.style.right = "auto";
        toast.style.bottom = `${y}px`;
        toast.style.setProperty("--recovery-toast-color", color);
        toast.style.setProperty("--recovery-toast-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }

    function showRecoveryToast(message) {
        document.getElementById("turfMatchmakerRecoveryToast")?.remove();
        if (STATE.recoveryToastSeconds === 0) return;
        const toast = document.createElement("div");
        toast.id = "turfMatchmakerRecoveryToast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        toast.style.visibility = "hidden";

        const title = document.createElement("div");
        title.id = "turfMatchmakerRecoveryToastTitle";
        title.textContent = String(message || "LOBBY REJECTED");
        toast.appendChild(title);
        document.body.appendChild(toast);
        applyRecoveryToastAppearance(toast);
        toast.style.visibility = "";
        setTimeout(() => toast.classList.add("hiding"), Math.max(0, STATE.recoveryToastSeconds * 1000 - 300));
        setTimeout(() => toast.remove(), STATE.recoveryToastSeconds * 1000);
        return toast;
    }

    function queueRecoveryToast(message) {
        try {
            sessionStorage.setItem(RECOVERY_TOAST_KEY, JSON.stringify({
                createdAt: Date.now(),
                message: String(message || "LOBBY REJECTED")
            }));
        } catch (error) {
            console.warn("Could not queue the lobby rejection notification.", error);
        }
    }

    // Read a visible client roster once during Force Player Count validation.
    function isElementActuallyVisible(element) {
        if (!element || !element.isConnected) return false;
        for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.display === "none" || style.visibility === "hidden") return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function readVisibleForcedPlayerCount() {
        const playerHeader = document.getElementById("playerSearchH");
        if (isElementActuallyVisible(playerHeader)) {
            const match = (playerHeader.textContent || "").match(/Player\s*List\s*\[(\d+)\]/i);
            if (match) return Number(match[1]);
        }
        const scoreboard = document.getElementById("centerLeaderDisplay");
        if (!isElementActuallyVisible(scoreboard)) return null;
        let count = 0;
        // Team modes reuse ingameTable for each team. Count rows across all tables.
        for (const table of scoreboard.querySelectorAll('[id="ingameTable"]')) {
            if (!isElementActuallyVisible(table)) continue;
            for (const row of table.querySelectorAll("tr")) {
                if (row.querySelector('.newLeaderName, .newLeaderNameM, .newLeaderNameF')) count++;
            }
        }
        // An empty/uninitialized table is not proof that a lobby has zero players.
        return count > 0 ? count : null;
    }

    // Read the same local roster header as Alt without opening or mounting its UI.
    // Identify the window by its methods, not a translated name or fixed index.
    function readLocalForcedPlayerCount() {
        try {
            if (!Array.isArray(window.windows)) return null;
            const candidates = window.windows.filter(item => item
                && typeof item.gen === "function" && typeof item.genList === "function"
                && typeof item.searchPlayers === "function" && typeof item.searchMatches === "function");
            if (candidates.length !== 1) return null;
            const probe = Object.create(candidates[0]);
            let skippedListCalls = 0;
            Object.defineProperty(probe, "genList", { value: () => { skippedListCalls++; return ""; } });
            const result = probe.gen();
            if (skippedListCalls !== 1) return null;
            const html = typeof result === "string" ? result : result?.html;
            if (typeof html !== "string") return null;
            const template = document.createElement("template");
            template.innerHTML = html;
            const header = template.content.querySelector("#playerSearchH");
            const match = (header?.textContent || "").match(/\[(\d+)\]\s*$/);
            const count = match ? Number(match[1]) : NaN;
            return Number.isSafeInteger(count) && count >= 0 ? count : null;
        } catch (_) {
            // A changed game build must not interrupt matchmaking or mean zero players.
            return null;
        }
    }

    function sanitizePlayerNames(value) {
        const seen = new Set();
        return (Array.isArray(value) ? value : []).filter(name => typeof name === "string")
            .map(name => name.trim().slice(0, 64)).filter(name => {
                const key = name.toLowerCase();
                if (!name || seen.has(key)) return false;
                seen.add(key); return true;
            }).slice(0, 100);
    }

    function readAltRowName(row) {
        const cell = row.querySelector('.pListName');
        const label = cell?.querySelector('a[onclick*="openPlayerProfile"]') || cell;
        return label ? [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent).join('').trim() : "";
    }

    function capturePlayerDisplay(row, name) {
        const listed = new Set([...STATE.playerBlacklist, ...STATE.playerWhitelist].map(value => value.toLowerCase()));
        if (!listed.has(name.toLowerCase())) return false;
        const cell = row.querySelector('.pListName');
        const label = cell?.querySelector('a[onclick*="openPlayerProfile"]') || cell;
        const clanNode = label?.querySelector('[data-kute-clan]');
        const clanText = clanNode?.getAttribute('data-kute-clan')
            ?? [...(label?.querySelectorAll('span') || [])].map(node => node.textContent.trim()).find(text => /^\[[^\[\]]+\]$/.test(text));
        const clan = String(clanText || '').replace(/^\[|\]$/g, '').trim().slice(0, 32);
        const old = STATE.playerDisplay.find(item => item.ign.toLowerCase() === name.toLowerCase());
        if (old?.ign === name && old.clan === clan) return false;
        STATE.playerDisplay = STATE.playerDisplay.filter(item => listed.has(item.ign.toLowerCase()) && item.ign.toLowerCase() !== name.toLowerCase());
        STATE.playerDisplay.push({ ign: name, clan, ...(old?.badges ? { badges: old.badges } : {}) });
        return true;
    }

    function sanitizePlayerBadges(badges) {
        if (!Array.isArray(badges)) return [];
        return badges.slice(0, 6).flatMap(badge => {
            if (!badge || typeof badge !== 'object') return [];
            if (badge.icon === 'check_circle') return [{ icon: 'check_circle', color: '#40C4FF' }];
            if (typeof badge.src !== 'string') return [];
            // Never persist arbitrary markup, remote tracking URLs or executable SVG data.
            if (/^data:image\/(?:png|webp);base64,[a-zA-Z0-9+/=]+$/.test(badge.src)
                && badge.src.length <= 16384 && badge.kute === true) {
                return [{ src: badge.src, kute: true }];
            }
            try {
                const url = new URL(badge.src, 'https://assets.krunker.io/');
                if (url.origin !== 'https://assets.krunker.io' ||
                    !/^\/(?:textures\/badges\/badge_\d+\.png|img\/ranked\/ranks\/rank_[a-z_]+\.svg)$/.test(url.pathname)) return [];
                return [{ src: url.origin + url.pathname }];
            } catch { return []; }
        });
    }

    let lastPlayerBadgeRead = 0;
    function syncTabPlayerBadges() {
        const now = Date.now();
        if (now - lastPlayerBadgeRead < 1000) return;
        lastPlayerBadgeRead = now;
        const listed = new Set([...STATE.playerBlacklist, ...STATE.playerWhitelist].map(name => name.toLowerCase()));
        if (!listed.size) return;
        let changed = false;
        for (const label of document.querySelectorAll('#centerLeaderDisplay .newLeaderName, #centerLeaderDisplay .newLeaderNameM, #centerLeaderDisplay .newLeaderNameF')) {
            const name = [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent).join('').trim();
            if (!listed.has(name.toLowerCase())) continue;
            const row = label.closest('.newLeaderItem');
            if (!row) continue;
            const badges = sanitizePlayerBadges([...row.querySelectorAll('i.material-icons, img')].map(node =>
                node.tagName === 'IMG' ? { src: node.getAttribute('src'), kute: node.getAttribute('data-kute-badge') === 'kute' }
                    : { icon: node.textContent.trim() }));
            const old = STATE.playerDisplay.find(item => item.ign.toLowerCase() === name.toLowerCase());
            if (old && JSON.stringify(old.badges) === JSON.stringify(badges)) continue;
            const clan = [...label.querySelectorAll('span')].map(node => node.textContent.trim())
                .find(text => /^\[[^\[\]]+\]$/.test(text))?.slice(1, -1).trim().slice(0, 32) || '';
            STATE.playerDisplay = STATE.playerDisplay.filter(item => listed.has(item.ign.toLowerCase()) && item.ign.toLowerCase() !== name.toLowerCase());
            STATE.playerDisplay.push({ ign: old?.ign || name, clan: old?.clan ?? clan, badges });
            changed = true;
        }
        // Missing Tab rows are not evidence that saved badges disappeared.
        if (changed) { saveState(); render(); }
    }

    function renderPlayerDisplay(name) {
        const display = STATE.playerDisplay.find(item => item.ign.toLowerCase() === name.toLowerCase());
        const badges = sanitizePlayerBadges(display?.badges).map(badge => badge.icon
            ? `<i class="material-icons turf-player-badge" style="font-size:16px;vertical-align:middle;margin-right:4px;color:${badge.color};">${badge.icon}</i>`
            : `<img class="turf-player-badge" src="${escapeHtml(badge.src)}" alt="" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:4px;">`).join('');
        return `${badges}${escapeHtml(display?.ign || name)}${display?.clan ? `<span class="turf-player-clan" style="font-size:inherit;font-weight:inherit;color:#787878;"> [${escapeHtml(display.clan)}]</span>` : ''}`;
    }

    let playerListObserver = null;
    let playerListObserverRoot = null;
    const wiredPlayerListButtons = new WeakSet();

    function handlePlayerListButtonClick(event) {
        event.preventDefault(); event.stopPropagation();
        const button = event.currentTarget;
        const key = button.dataset.list;
        if (!['playerBlacklist', 'playerWhitelist'].includes(key)) return;
        const row = button.closest('tr');
        if (!row) return;
        const name = readAltRowName(row);
        if (!name) return;
        const selected = STATE[key].some(item => item.toLowerCase() === name.toLowerCase());
        STATE[key] = selected ? STATE[key].filter(item => item.toLowerCase() !== name.toLowerCase())
            : sanitizePlayerNames([...STATE[key], name]);
        capturePlayerDisplay(row, name);
        playerPolicy.blackFired = false;
        saveState(); render(); syncPlayerListButtons(); updatePlayerPolicy(true);
    }

    // Observe the popup, not the replaceable table. Native rebuilds must be enhanced
    // in the mutation microtask, before painting a frame without the shortcuts.
    function syncPlayerListButtons() {
        const root = getEl("windowHolder") || getEl("playerListH")?.parentElement;
        if (!playerListObserver && root) {
            playerListObserver = new MutationObserver(records => {
                const relevant = records.some(record => {
                    const target = record.target.nodeType === Node.ELEMENT_NODE
                        ? record.target : record.target.parentElement;
                    if (target?.closest('#playerListH')) return true;
                    return [...record.addedNodes, ...record.removedNodes].some(node =>
                        node.nodeType === Node.ELEMENT_NODE &&
                        (node.matches('#playerListH, #playerSearchH') || node.querySelector('#playerListH, #playerSearchH')));
                });
                if (relevant) syncPlayerListButtons();
            });
        }
        // Do not observe our own insertions or create a mutation feedback loop.
        playerListObserver?.disconnect();
        playerListObserverRoot = root;
        try {
            updatePlayerListButtons();
        } finally {
            if (playerListObserverRoot) playerListObserver.observe(playerListObserverRoot, {
                childList: true, subtree: true, characterData: true
            });
        }
    }

    // Enhance only the native Alt player list; preserve its chat/voice/moderation handlers.
    function updatePlayerListButtons() {
        const list = getEl("playerListH");
        if (!list || !getEl("playerSearchH") || !isElementActuallyVisible(list)) return;
        if (!getEl("turfPlayerListButtonStyles")) {
            const style = document.createElement('style');
            style.id = "turfPlayerListButtonStyles";
            style.textContent = `
                #playerListH .turf-player-list-controls {display:inline-flex;vertical-align:middle;gap:5px;margin-right:8px;}
                #playerListH .turf-player-list-action {box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;margin:0;border:1px solid currentColor;border-radius:5px;background:#171717;font:700 14px Arial,sans-serif;line-height:1;cursor:pointer;}
                #playerListH .turf-player-list-action[data-list="playerBlacklist"] {color:#ff7979;}
                #playerListH .turf-player-list-action[data-list="playerWhitelist"] {color:#7de3a9;}
                #playerListH .turf-player-list-action:hover,#playerListH .turf-player-list-action:focus-visible {filter:brightness(1.2);}
                #playerListH .turf-player-list-action[data-list="playerBlacklist"][aria-pressed="true"] {background:#542222;box-shadow:inset 0 0 0 1px currentColor;}
                #playerListH .turf-player-list-action[data-list="playerWhitelist"][aria-pressed="true"] {background:#224a32;box-shadow:inset 0 0 0 1px currentColor;}
            `;
            document.head.appendChild(style);
        }
        let displayChanged = false;
        for (const row of list.querySelectorAll('tr')) {
            const actions = row.querySelector('.pListActions');
            const chat = actions && [...actions.querySelectorAll('.muteUserBtn')]
                .find(element => element.title === 'Chat mute/unmute' || element.textContent.trim() === 'chat');
            const name = readAltRowName(row);
            // Own row has no chat action; do not add meaningless self-list controls.
            if (!chat || !name) { actions?.querySelector('.turf-player-list-controls')?.remove(); continue; }
            displayChanged = capturePlayerDisplay(row, name) || displayChanged;
            let group = actions.querySelector('.turf-player-list-controls');
            if (!group) {
                group = document.createElement('span');
                group.className = 'turf-player-list-controls';
                for (const [key, letter] of [['playerBlacklist','B'],['playerWhitelist','W']]) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'turf-player-list-action';
                    button.dataset.list = key;
                    button.textContent = letter;
                    group.appendChild(button);
                }
            }
            if (group.nextSibling !== chat) actions.insertBefore(group, chat);
            for (const button of group.children) {
                // Native HTML copies preserve our markup, but not JavaScript listeners.
                if (!wiredPlayerListButtons.has(button)) {
                    button.addEventListener('click', handlePlayerListButtonClick);
                    wiredPlayerListButtons.add(button);
                }
                const key = button.dataset.list;
                const selected = STATE[key].some(item => item.toLowerCase() === name.toLowerCase());
                const pressed = String(selected);
                const title = `${selected ? 'Remove from' : 'Add to'} ${key === 'playerBlacklist' ? 'blacklist' : 'whitelist'}: ${name}`;
                if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
                if (button.title !== title) { button.title = title; button.setAttribute('aria-label', title); }
            }
        }
        if (displayChanged) { saveState(); render(); }
    }

    // Confirm complete client rows against the local total; never infer departure from missing UI.
    function readPlayerNames() {
        const alt = getEl('playerListH');
        if (alt && isElementActuallyVisible(alt)) {
            const rows = [...alt.querySelectorAll('tr')].filter(row => row.querySelector('.pListName'));
            const headerCount = Number(getEl('playerSearchH')?.textContent.match(/\[(\d+)\]/)?.[1]);
            const self = rows.filter(row => row.querySelector('.pListActions') && !row.querySelector('.pListActions')?.children.length);
            const names = rows.map(readAltRowName);
            // A filtered or partial Alt list cannot prove that a whitelist player left.
            const search = getEl('plySearch');
            if (!search?.value?.trim() && rows.length === headerCount && self.length === 1 && names.every(Boolean)) {
                return rows.filter(row => row !== self[0]).map(readAltRowName);
            }
        }
        const root = getEl("centerLeaderDisplay");
        if (!root || root.querySelectorAll('.newLeaderNameM').length !== 1) return null;
        const rows = [...root.querySelectorAll('[id="ingameTable"] .newLeaderName, [id="ingameTable"] .newLeaderNameM, [id="ingameTable"] .newLeaderNameF')];
        const count = readLocalForcedPlayerCount();
        if (!rows.length || count === null || rows.length !== count) return null;
        const names = [];
        for (const row of rows) {
            // Captured game markup keeps the IGN in direct text nodes; clan/title are child spans.
            const name = [...row.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent).join('').trim();
            if (!name) return null;
            if (!row.classList.contains('newLeaderNameM')) names.push(name);
        }
        return names;
    }

    let playerPolicy = { game: null, checkedAt: 0, held: false, known: false, absentSince: null, blackFired: false, suspended: null, boundary: null, signature: null, root: null };

    // An unknown roster holds automation conservatively, except the search that returns from a temporary lobby
    // Turf itself chose: only a confirmed whitelisted player holds that one.
    function playerPolicyBlocks(options = {}) {
        return STATE.playerWhitelistEnabled && STATE.playerWhitelist.length > 0
            && (playerPolicy.held || (!playerPolicy.known && !options.recovery)) && !options.manual;
    }

    function suspendPlayerPolicySearch() {
        if (overlay.classList.contains("searching") && playerPolicyBlocks(activeSearchOptions)) {
            playerPolicy.suspended = { ...activeSearchOptions };
            replaceActiveSearch();
            showRecoveryToast(playerPolicy.held ? "WHITELIST PLAYER PRESENT" : "WAITING FOR PLAYER LIST");
        }
    }

    function updatePlayerPolicy(force = false) {
        const game = new URLSearchParams(window.location.search).get("game");
        if (game !== playerPolicy.game) {
            playerPolicy = { game, checkedAt: 0, held: false, known: false, absentSince: null, blackFired: false, suspended: null,
                boundary: playerPolicy.root ? { root: playerPolicy.root, signature: playerPolicy.signature } : null, signature: null, root: null };
        }
        if (!STATE.playerWhitelistEnabled || !STATE.playerWhitelist.length) {
            playerPolicy.held = false;
            if (playerPolicy.suspended) {
                const options = playerPolicy.suspended;
                playerPolicy.suspended = null;
                void triggerMatchmaker("whitelist-released", options);
            }
        }
        if (!game || (!STATE.playerWhitelistEnabled && !STATE.playerBlacklistEnabled)) return false;
        if (getVisibleConnectionError()) return false;
        const now = Date.now();
        if (!force && now - playerPolicy.checkedAt < 1000) return playerPolicyBlocks();
        playerPolicy.checkedAt = now;
        const names = readPlayerNames();
        const root = getEl("centerLeaderDisplay");
        const signature = names === null ? null : JSON.stringify(names);
        if (signature === null || (playerPolicy.boundary && root === playerPolicy.boundary.root && signature === playerPolicy.boundary.signature)) {
            playerPolicy.known = false;
            playerPolicy.absentSince = null;
            if (playerPolicyBlocks()) suspendPlayerPolicySearch();
            return playerPolicyBlocks();
        }
        playerPolicy.boundary = null;
        playerPolicy.signature = signature;
        playerPolicy.root = root;
        playerPolicy.known = true;
        const normalized = new Set(names.map(name => name.toLowerCase()));
        const white = STATE.playerWhitelistEnabled && STATE.playerWhitelist.some(name => normalized.has(name.toLowerCase()));
        if (white) {
            playerPolicy.held = true; playerPolicy.absentSince = null;
        } else if (playerPolicy.held) {
            if (playerPolicy.absentSince === null) playerPolicy.absentSince = now;
            else if (now - playerPolicy.absentSince >= 750) { playerPolicy.held = false; playerPolicy.absentSince = null; }
        }
        if (playerPolicyBlocks()) {
            suspendPlayerPolicySearch();
            return true;
        }
        if (overlay.classList.contains("searching")) return false;
        const black = STATE.playerBlacklistEnabled && STATE.playerBlacklist.some(name => normalized.has(name.toLowerCase()));
        if (black && !playerPolicy.blackFired) {
            playerPolicy.blackFired = true;
            playerPolicy.suspended = null;
            const recovery = readJoinRecovery() || { fullCount: 0, rejected: [], options: {} };
            saveJoinRecovery({ ...recovery, rejected: [...recovery.rejected.filter(item => item.id !== game),
                { id: game, until: Date.now() + REJECTED_LOBBY_MS }] });
            showRecoveryToast("BLACKLIST PLAYER PRESENT");
            void triggerMatchmaker("player-blacklist", { background: true });
        } else if (playerPolicy.suspended) {
            const options = playerPolicy.suspended;
            playerPolicy.suspended = null;
            void triggerMatchmaker("whitelist-released", options);
        }
        return false;
    }

    let forcedLocalCountSample = null;

    function readOpponentPlayerCount() {
        let mode;
        try { mode = String(window.getGameActivity?.()?.mode || "").trim().toLowerCase(); }
        catch (_) { return null; }
        if (mode === "free for all" || mode === "ffa") {
            const total = readLocalForcedPlayerCount() ?? readVisibleForcedPlayerCount();
            return total === null ? null : Math.max(0, total - 1);
        }
        if (mode !== "team deathmatch" && mode !== "tdm") return null;
        // A total header contains no team information. Never subtract allies by guessing.
        const root = document.getElementById("centerLeaderDisplay");
        if (!root) return null;
        // Kute runtime probe confirmed this roster updates while Tab is hidden.
        const teams = [...root.querySelectorAll('[id="ingameTable"]')];
        if (teams.length !== 2) return null;
        const ownRows = root.querySelectorAll('.newLeaderNameM');
        if (ownRows.length !== 1) return null;
        const ownTeam = ownRows[0].closest('[id="ingameTable"]');
        if (!teams.includes(ownTeam)) return null;
        const enemy = teams.find(table => table !== ownTeam);
        // Require a built table, not an empty container still awaiting game data.
        if (!enemy.querySelector('th')) return null;
        return [...enemy.querySelectorAll('tr')].filter(row =>
            row.querySelector('.newLeaderName, .newLeaderNameM, .newLeaderNameF')).length;
    }

    // Display a queued toast once after the target page creates document.body.
    function showPendingConnectionToast() {
        let payload;
        try {
            const raw = sessionStorage.getItem(CONNECTION_TOAST_KEY);
            sessionStorage.removeItem(CONNECTION_TOAST_KEY);
            if (!raw) return;
            payload = JSON.parse(raw);
        } catch (error) {
            console.warn("Could not read the connection notification.", error);
            return;
        }
        if (!payload || Date.now() - Number(payload.createdAt) > 15000) return;
        if (getVisibleConnectionError() || readJoinRecovery()?.temporary) return;
        showConnectionToast(payload);
        showSearchFinishedNotification(payload.searchFinishedUntil);
    }

    // Restore a recent rejection message after the fallback lobby navigation.
    function showPendingRecoveryToast() {
        let payload;
        try {
            const raw = sessionStorage.getItem(RECOVERY_TOAST_KEY);
            sessionStorage.removeItem(RECOVERY_TOAST_KEY);
            if (!raw) return;
            payload = JSON.parse(raw);
        } catch (error) {
            console.warn("Could not read the lobby rejection notification.", error);
            return;
        }
        if (!payload || Date.now() - Number(payload.createdAt) > 15000) return;
        showRecoveryToast(payload.message);
    }

    // Wrap matchmaker requests with cancellation, timeouts, and structured HTTP errors.
    function parseRetryAfterMs(value) {
        if (!value) return null;
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
        const date = Date.parse(value);
        if (!Number.isFinite(date)) return null;
        return Math.max(0, date - Date.now());
    }

    function createHttpError(message, status, payload, retryAfterMs = null) {
        const error = new Error(message);
        error.status = status;
        error.payload = payload;
        error.retryAfterMs = retryAfterMs;
        return error;
    }

    // A null runId marks a request that is not tied to an active search.
    async function fetchJson(url, timeoutMs, runId) {
        if (runId !== null && !isSearchActive(runId)) throw new DOMException("Search canceled", "AbortError");
        const controller = new AbortController();
        activeRequestControllers.add(controller);
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                cache: "no-store"
            });
            let payload = null;
            try {
                payload = await response.json();
            } catch (error) {
                if (response.ok) throw createHttpError("Invalid JSON response", response.status, null);
            }
            if (!response.ok) {
                throw createHttpError(
                    `HTTP ${response.status}`,
                    response.status,
                    payload,
                    parseRetryAfterMs(response.headers.get("Retry-After"))
                );
            }
            return payload;
        } finally {
            clearTimeout(timeout);
            activeRequestControllers.delete(controller);
        }
    }

    async function timedNoCorsFetch(url, timeoutMs, runId) {
        if (!isSearchActive(runId)) throw new DOMException("Search canceled", "AbortError");
        const controller = new AbortController();
        activeRequestControllers.add(controller);
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const started = performance.now();
        try {
            await fetch(url, {
                mode: "no-cors",
                signal: controller.signal,
                cache: "no-store"
            });
            return performance.now() - started;
        } finally {
            clearTimeout(timeout);
            activeRequestControllers.delete(controller);
        }
    }

    function waitForSearch(ms, runId) {
        return new Promise(resolve => {
            setTimeout(() => resolve(isSearchActive(runId)), ms);
        });
    }

    // Warm the connection once, then use one HTTP round trip as the regional estimate.
    async function measurePing(hostname, runId) {
        const host = String(hostname || "").replace(/:\d+$/, "");
        if (!host) return null;
        const url = `https://${host}/ping`;
        try {
            await timedNoCorsFetch(url, MATCHMAKER_CONFIG.pingRequestTimeoutMs, runId);
            const elapsed = await timedNoCorsFetch(url, MATCHMAKER_CONFIG.pingRequestTimeoutMs, runId);
            return Math.round(elapsed);
        } catch {
            return null;
        }
    }

    async function getRegionalPings(wantedRegions, runId, preparedList = null) {
        const pings = {};
        const now = Date.now();
        const missing = new Set();
        for (const region of wantedRegions) {
            const cached = regionalPingCache.get(region);
            if (cached && cached.expiresAt > now) {
                pings[region] = cached.value;
            } else {
                missing.add(region);
            }
        }
        if (!missing.size || !isSearchActive(runId)) return pings;

        try {
            const prepared = preparedList ? await preparedList : null;
            if (prepared?.error) throw prepared.error;
            const data = prepared ? prepared.data : await fetchJson(
                "https://matchmaker.krunker.io/ping-list?hostname=krunker.io",
                MATCHMAKER_CONFIG.requestTimeoutMs,
                runId
            );
            if (!data || typeof data !== "object" || Array.isArray(data)) return pings;
            const jobs = Object.entries(data)
                .map(([infrastructureRegion, host]) => ({
                    shortCode: REGION_MAP[infrastructureRegion] ?? infrastructureRegion.toUpperCase(),
                    host
                }))
                .filter(item => missing.has(item.shortCode));

            const results = await mapWithConcurrency(jobs, 4, async item => ({
                shortCode: item.shortCode,
                value: await measurePing(item.host, runId)
            }));
            for (const result of results) {
                if (!result || !Number.isFinite(result.value)) continue;
                pings[result.shortCode] = result.value;
                regionalPingCache.set(result.shortCode, {
                    value: result.value,
                    expiresAt: Date.now() + MATCHMAKER_CONFIG.pingCacheMs
                });
            }
        } catch (error) {
            if (error?.name !== "AbortError") {
                registerMatchmakerBackoff(error);
                console.error("Matchmaker ping failed:", error);
            }
        }
        return pings;
    }

    // Normalize user filters and convert backend tuples into validated lobby objects.
    function normalizeFilterText(value) {
        return String(value ?? "")
            .toLowerCase()
            .replace(/[_\s]+/g, " ")
            .trim();
    }

    function normalizeMapName(value) {
        const normalized = String(value ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
        if (normalized === "eterno sim") return "eterno simulator";
        return normalized;
    }

    function buildFilterContext(searchOptions = activeSearchOptions) {
        const targetMaps = searchOptions?.purpose === "target"
            ? sanitizeTargetHuntMaps(searchOptions.targetMaps)
            : [];
        return {
            regions: STATE.regions.length ? new Set(STATE.regions) : null,
            modes: STATE.modes.length
                ? new Set(STATE.modes.map(mode => typeof mode === "number" ? `#${mode}` : normalizeFilterText(mode)))
                : null,
            maps: targetMaps.length
                ? new Set(targetMaps.map(normalizeMapName))
                : (STATE.maps.length ? new Set(STATE.maps.map(normalizeMapName)) : null),
            minPlayers: Number(STATE.minPlayers),
            maxPlayers: Number(STATE.maxPlayers),
            minTime: Number(STATE.minTime),
            maxPing: Number(STATE.maxPing),
            avoidCloseToFull: Boolean(STATE.filterAvoidCloseToFull),
            recentLobbyIds: STATE.filterAvoidPastLobbies
                ? new Set(readRecentLobbies().slice(0, Number(STATE.pastLobbyCount)))
                : null,
            priorityMode: normalizeFilterText(STATE.priorityMode),
            preferredMaps: (STATE.preferredMaps || []).map(normalizeMapName),
            selectionPriority: STATE.selectionPriority,
            rejectedLobbies: new Map((readJoinRecovery()?.rejected || []).map(item => [item.id, item.until])),
            currentGameId: new URLSearchParams(window.location.search).get("game")
        };
    }

    function parseGameRecord(record, source = "game-list") {
        if (!Array.isArray(record) || record.length < 6) return null;
        const [gameID, infrastructureRegion, playerCount, playerLimit, rawDetails, remainingTime] = record;
        // The ID is placed in the join URL, so reject characters that could change its query.
        if (typeof gameID !== "string" || !gameID.includes(":") || /[\s&#?/%\\]/.test(gameID)) return null;
        if (typeof infrastructureRegion !== "string") return null;
        if (!Number.isInteger(playerCount) || !Number.isInteger(playerLimit) || playerLimit <= 0) return null;
        if (!rawDetails || typeof rawDetails !== "object" || Array.isArray(rawDetails)) return null;
        if (!Number.isFinite(remainingTime)) return null;
        const details = { ...rawDetails };
        const modeIndex = Number.isInteger(details.g) ? details.g : null;
        const region = gameID.split(":", 1)[0];
        return {
            gameID,
            region,
            playerCount,
            playerLimit,
            details,
            map: typeof details.i === "string" ? details.i : "",
            modeIndex,
            gamemode: modeIndex === null ? "Unknown mode" : (GAMEMODES[modeIndex] ?? EXTRA_GAMEMODES[modeIndex] ?? `Mode #${modeIndex}`),
            remainingTime,
            source,
            validationUnavailable: false
        };
    }

    function passesHardFilters(game, filters) {
        const isPublic = game?.details.c === 0;
        const isOfficialCustom = game?.details.c === 1 && game?.details.oc === 1;
        if (!game || (!isPublic && !isOfficialCustom)) return false;
        if (filters.currentGameId && game.gameID === filters.currentGameId) return false;
        if ((filters.rejectedLobbies?.get(game.gameID) || 0) > Date.now()) return false;
        if (filters.recentLobbyIds?.has(game.gameID)) return false;
        if (filters.regions && !filters.regions.has(game.region)) return false;
        if (filters.maps && !filters.maps.has(normalizeMapName(game.map))) return false;
        if (filters.modes) {
            const modeName = normalizeFilterText(game.gamemode);
            const modeIndex = game.modeIndex === null ? "" : `#${game.modeIndex}`;
            if (!filters.modes.has(modeName) && !filters.modes.has(modeIndex)) return false;
        }
        return true;
    }

    function softFilterFailures(game, pings, filters) {
        const failures = [];
        // Min Players 0 deliberately allows empty lobbies.
        if (game.playerCount <= 0 && filters.minPlayers > 0) failures.push("empty");
        if (game.playerCount < filters.minPlayers) failures.push("minPlayers");
        if (game.playerCount > filters.maxPlayers) failures.push("maxPlayers");
        if (game.playerCount >= game.playerLimit) failures.push("full");
        if (filters.avoidCloseToFull && game.playerLimit - game.playerCount <= 1) failures.push("lastSlot");
        const hasComparableTimer = game.details.c === 0 || game.remainingTime > 0;
        if (hasComparableTimer && game.remainingTime < filters.minTime) failures.push("time");
        const ping = pings[game.region];
        if (!Number.isFinite(ping)) failures.push("pingUnknown");
        else if (ping > filters.maxPing) failures.push("ping");
        return failures;
    }

    function preliminaryCandidateScore(game, filters) {
        let score = 0;
        if (game.playerCount <= 0 && filters.minPlayers > 0) score += 80;
        if (game.playerCount < filters.minPlayers) score += (filters.minPlayers - game.playerCount) * 12;
        if (game.playerCount > filters.maxPlayers) score += (game.playerCount - filters.maxPlayers) * 12;
        if (game.playerCount >= game.playerLimit) score += 100;
        if (filters.avoidCloseToFull && game.playerLimit - game.playerCount <= 1) score += 40;
        if (game.remainingTime < filters.minTime) score += Math.min(80, filters.minTime - game.remainingTime);
        score -= Math.min(game.playerCount, 20) * 2;
        return score;
    }

    function sortLobbies(lobbies, pings, filters) {
        return lobbies.sort((a, b) => {
            const preferred = filters.preferredMaps || [];
            const rank = game => {
                const index = preferred.indexOf(normalizeMapName(game.map));
                return index < 0 ? preferred.length : index;
            };
            if (rank(a) !== rank(b)) return rank(a) - rank(b);
            if (filters.priorityMode) {
                const aPriority = normalizeFilterText(a.gamemode) === filters.priorityMode ? 0 : 1;
                const bPriority = normalizeFilterText(b.gamemode) === filters.priorityMode ? 0 : 1;
                if (aPriority !== bPriority) return aPriority - bPriority;
            }
            const pingA = Number.isFinite(pings[a.region]) ? pings[a.region] : Number.POSITIVE_INFINITY;
            const pingB = Number.isFinite(pings[b.region]) ? pings[b.region] : Number.POSITIVE_INFINITY;
            if (a.validationUnavailable !== b.validationUnavailable) return a.validationUnavailable ? 1 : -1;
            if (filters.selectionPriority === "players" && a.playerCount !== b.playerCount) return b.playerCount - a.playerCount;
            if (pingA !== pingB) return pingA - pingB;
            if (a.playerCount !== b.playerCount) return b.playerCount - a.playerCount;
            if (a.remainingTime !== b.remainingTime) return b.remainingTime - a.remainingTime;
            return a.gameID.localeCompare(b.gameID);
        });
    }

    // Spread automatic joins only within a filtered, comparable quality tier.
    function selectSimilarCandidate(candidates, pings, filters, random = Math.random) {
        const valid = sortLobbies(candidates.filter(game => isFreshCandidateMatch(game, pings, filters)), pings, filters);
        const best = valid[0];
        if (!best || !STATE.randomizeSimilar) return best;
        const preferred = filters.preferredMaps || [];
        const tier = game => preferred.indexOf(normalizeMapName(game.map));
        const modeTier = game => Boolean(filters.priorityMode && normalizeFilterText(game.gamemode) === filters.priorityMode);
        const similar = valid.filter(game => tier(game) === tier(best) && modeTier(game) === modeTier(best)
            && Math.abs(pings[game.region] - pings[best.region]) <= 20
            && Math.abs(game.playerCount - best.playerCount) <= 2);
        return similar[Math.min(similar.length - 1, Math.max(0, Math.floor(random() * similar.length)))];
    }

    // Limit parallel backend calls while preserving the input ranking order.
    async function mapWithConcurrency(items, concurrency, mapper) {
        const results = new Array(items.length);
        let nextIndex = 0;
        async function worker() {
            while (nextIndex < items.length) {
                const index = nextIndex;
                nextIndex += 1;
                try {
                    results[index] = await mapper(items[index], index);
                } catch (error) {
                    results[index] = null;
                }
            }
        }
        const workers = Array.from(
            { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
            () => worker()
        );
        await Promise.all(workers);
        return results;
    }

    // Pause all matchmaker traffic after rate limits or server-side failures.
    function registerMatchmakerBackoff(error) {
        const status = Number(error?.status);
        if (!Number.isInteger(status)) return;
        if (status !== 429 && (status < 500 || status >= 600)) return;
        const serverDelay = Number(error?.retryAfterMs);
        const delay = Number.isFinite(serverDelay) && serverDelay >= 0
            ? Math.max(MATCHMAKER_CONFIG.matchmakerCooldownMs, serverDelay)
            : MATCHMAKER_CONFIG.matchmakerCooldownMs;
        matchmakerBackoffUntil = Math.max(matchmakerBackoffUntil, Date.now() + delay);
        matchmakerBackoffStatus = status;
        if (Date.now() - matchmakerBackoffLoggedAt > 1000) {
            matchmakerBackoffLoggedAt = Date.now();
            console.warn(`Matchmaker HTTP ${status}; pausing requests for ${Math.ceil(delay / 1000)}s`);
        }
    }

    function showMatchmakerBackoff() {
        const remainingSeconds = Math.max(1, Math.ceil((matchmakerBackoffUntil - Date.now()) / 1000));
        searchContainer.classList.remove("scanning");
        searchContainer.classList.remove("hunting");
        searchStatus.textContent = matchmakerBackoffStatus === 429
            ? "MATCHMAKER RATE LIMIT REACHED"
            : "MATCHMAKER SERVER ERROR";
        searchFeed.innerHTML = "";
        searchCounter.textContent = `Waiting ${remainingSeconds}s before retrying automatically`;
    }

    function unavailableCandidate(game) {
        return {
            ...game,
            source: "game-list",
            validationUnavailable: true
        };
    }

    async function hydrateCandidate(game, runId) {
        if (Date.now() < matchmakerBackoffUntil) return unavailableCandidate(game);
        try {
            const payload = await fetchJson(
                `https://matchmaker.krunker.io/game-info?game=${encodeURIComponent(game.gameID)}`,
                MATCHMAKER_CONFIG.gameInfoTimeoutMs,
                runId
            );
            const fresh = parseGameRecord(payload, "game-info");
            return fresh?.gameID === game.gameID ? fresh : null;
        } catch (error) {
            if (error?.status === 400) return null;
            if (error?.name === "AbortError" && !isSearchActive(runId)) return null;
            registerMatchmakerBackoff(error);
            return unavailableCandidate(game);
        }
    }

    async function hydrateCandidates(candidates, runId) {
        return mapWithConcurrency(
            candidates,
            MATCHMAKER_CONFIG.hydrationConcurrency,
            candidate => hydrateCandidate(candidate, runId)
        );
    }

    function isFreshCandidateMatch(game, pings, filters) {
        return Boolean(
            game &&
            !game.validationUnavailable &&
            passesHardFilters(game, filters) &&
            softFilterFailures(game, pings, filters).length === 0
        );
    }

    async function hydrateUntilMatch(candidates, pings, filters, runId) {
        const hydrated = [];
        for (let offset = 0; offset < candidates.length; offset += MATCHMAKER_CONFIG.hydrationBatchSize) {
            if (!isSearchActive(runId)) return { hydrated, matching: [] };
            const batch = candidates.slice(offset, offset + MATCHMAKER_CONFIG.hydrationBatchSize);
            const refreshed = (await hydrateCandidates(batch, runId)).filter(Boolean);
            hydrated.push(...refreshed);
            const matching = refreshed.filter(game => isFreshCandidateMatch(game, pings, filters));
            if (matching.length) return { hydrated, matching };
        }
        return { hydrated, matching: [] };
    }

    // Render search feed rows and rank the closest live hunting candidates.
    function renderFeedEntry(region, mapName, playersText, passes) {
        const entry = document.createElement("div");
        entry.className = `mm-feed-entry ${passes ? "mm-pass" : "mm-fail"}`;
        const rEl = document.createElement("span");
        rEl.className = "mm-feed-region";
        rEl.textContent = region;
        const mEl = document.createElement("span");
        mEl.className = "mm-feed-map";
        mEl.textContent = mapName;
        const pEl = document.createElement("span");
        pEl.className = "mm-feed-players";
        pEl.textContent = playersText;
        entry.appendChild(rEl);
        entry.appendChild(mEl);
        entry.appendChild(pEl);
        return entry;
    }

    const HUNTING_FAILURE_LABELS = {
        empty: "EMPTY",
        minPlayers: "MIN PLAYERS",
        maxPlayers: "MAX PLAYERS",
        full: "FULL",
        lastSlot: "LAST SLOT",
        time: "MIN TIME",
        ping: "MAX PING",
        pingUnknown: "PING UNKNOWN"
    };

    const HUNTING_FAILURE_PRIORITY = [
        "maxPlayers",
        "minPlayers",
        "full",
        "lastSlot",
        "ping",
        "pingUnknown",
        "time",
        "empty"
    ];

    function huntingCandidateScore(game, pings, filters, dominantFailure) {
        const failures = softFilterFailures(game, pings, filters);
        const midpoint = (filters.minPlayers + filters.maxPlayers) / 2;
        const playerDistance = Math.abs(game.playerCount - midpoint);
        const ping = pings[game.region];
        let score = playerDistance * 12;

        if (game.playerCount < filters.minPlayers) score += (filters.minPlayers - game.playerCount) * 45;
        if (game.playerCount > filters.maxPlayers) score += (game.playerCount - filters.maxPlayers) * 45;
        if (failures.includes("empty")) score += 90;
        if (failures.includes("full")) score += 90;
        if (failures.includes("lastSlot")) score += 45;
        if (failures.includes("time")) score += 160 + Math.max(0, filters.minTime - game.remainingTime) * 0.5;
        if (failures.includes("pingUnknown")) score += 180;
        if (failures.includes("ping")) score += 80 + Math.max(0, ping - filters.maxPing);
        if (game.validationUnavailable) score += 120;
        if (failures.length > 1) score += (failures.length - 1) * 60;

        if (dominantFailure === "minPlayers" || dominantFailure === "maxPlayers") {
            score += playerDistance * 14;
        } else if (dominantFailure === "time" && failures.includes("time")) {
            score += Math.max(0, filters.minTime - game.remainingTime);
        } else if (dominantFailure === "ping" && failures.includes("ping")) {
            score += Math.max(0, ping - filters.maxPing);
        }
        return score;
    }

    function analyzeHuntingCandidates(candidates, pings, filters) {
        const pool = [...new Map(candidates
            .filter(game => passesHardFilters(game, filters))
            .map(game => [game.gameID, game])).values()];
        const failureCounts = {};
        for (const game of pool) {
            for (const failure of softFilterFailures(game, pings, filters)) {
                failureCounts[failure] = (failureCounts[failure] || 0) + 1;
            }
        }
        const dominantFailure = Object.keys(failureCounts).sort((a, b) => {
            const countDifference = failureCounts[b] - failureCounts[a];
            if (countDifference) return countDifference;
            return HUNTING_FAILURE_PRIORITY.indexOf(a) - HUNTING_FAILURE_PRIORITY.indexOf(b);
        })[0] || null;
        const midpoint = (filters.minPlayers + filters.maxPlayers) / 2;
        pool.sort((a, b) => {
            const scoreDifference = huntingCandidateScore(a, pings, filters, dominantFailure)
                - huntingCandidateScore(b, pings, filters, dominantFailure);
            if (scoreDifference) return scoreDifference;
            const midpointDifference = Math.abs(a.playerCount - midpoint) - Math.abs(b.playerCount - midpoint);
            if (midpointDifference) return midpointDifference;
            const pingA = Number.isFinite(pings[a.region]) ? pings[a.region] : Number.POSITIVE_INFINITY;
            const pingB = Number.isFinite(pings[b.region]) ? pings[b.region] : Number.POSITIVE_INFINITY;
            if (pingA !== pingB) return pingA - pingB;
            return a.gameID.localeCompare(b.gameID);
        });
        return {
            dominantFailure,
            failureCounts,
            candidates: pool.slice(0, MATCHMAKER_CONFIG.huntingWatchCount)
        };
    }

    function renderHuntingCandidates(candidates, pings, filters) {
        searchContainer.classList.remove("scanning");
        searchContainer.classList.add("hunting");
        applySearchHUDPresentation();
        searchStatus.textContent = activeSearchOptions.purpose === "target"
            ? getTargetHuntStatusLabel("HUNTING")
            : "HUNTING";
        searchCounter.textContent = "";
        searchFeed.innerHTML = "";
        for (const game of candidates.slice(0, MATCHMAKER_CONFIG.liveCandidateCount)) {
            const failures = softFilterFailures(game, pings, filters);
            const failure = failures.includes("minPlayers")
                ? "minPlayers"
                : (failures.includes("maxPlayers") ? "maxPlayers" : failures[0]);
            const label = HUNTING_FAILURE_LABELS[failure] || "REFRESHING";
            searchFeed.appendChild(renderFeedEntry(
                game.region,
                game.map,
                `${game.playerCount}/${game.playerLimit} - ${label}`,
                false
            ));
        }
    }

    function renderInteractiveEntry(game, candidates, pings, filters, runId) {
        const entry = document.createElement("div");
        entry.className = "mm-feed-entry mm-pass";
        entry.style.cssText = "cursor:pointer; transition:all 0.15s; margin-bottom: 4px; background: rgba(0, 184, 0, 0.08); border-left: 5px solid #00b800;";
        const latency = Number.isFinite(pings[game.region]) ? `${pings[game.region]}ms` : "?ms";
        const rEl = document.createElement("span");
        rEl.className = "mm-feed-region";
        rEl.textContent = `${game.region} (${latency})`;
        const mEl = document.createElement("span");
        mEl.className = "mm-feed-map";
        mEl.textContent = `${game.map} · ${getGamemodeLabel(game.gamemode)}`;
        mEl.style.marginLeft = "1em";
        const pEl = document.createElement("span");
        pEl.className = "mm-feed-players";
        pEl.textContent = `${game.playerCount}/${game.playerLimit}`;
        entry.appendChild(rEl);
        entry.appendChild(mEl);
        entry.appendChild(pEl);

        entry.onmouseover = () => {
            entry.style.background = "rgba(0, 184, 0, 0.2)";
            entry.style.borderLeftWidth = "8px";
            entry.style.transform = "translateX(2px)";
            entry.style.borderColor = "white";
        };
        entry.onmouseout = () => {
            entry.style.background = "rgba(0, 184, 0, 0.08)";
            entry.style.borderLeftWidth = "5px";
            entry.style.transform = "none";
            entry.style.borderColor = "rgba(255,255,255,0.05)";
        };
        entry.onclick = async () => {
            window.playSelect?.();
            const ordered = [game, ...candidates.filter(candidate => candidate.gameID !== game.gameID)];
            await joinFirstValidCandidate(ordered, pings, filters, runId);
        };
        return entry;
    }

    // Fetch one global snapshot, hydrate likely matches, and seed the live hunter.
    async function searchOneSnapshot(filters, runId) {
        const retrievedAt = Date.now();
        // Start known-region probes with discovery; otherwise prefetch only the address directory.
        const earlyPings = filters.regions ? getRegionalPings(filters.regions, runId) : null;
        const needsDirectory = !filters.regions && REGIONS.some(region =>
            (regionalPingCache.get(region)?.expiresAt || 0) <= Date.now());
        const preparedList = needsDirectory ? fetchJson(
            "https://matchmaker.krunker.io/ping-list?hostname=krunker.io", MATCHMAKER_CONFIG.requestTimeoutMs, runId
        ).then(data => ({ data }), error => { registerMatchmakerBackoff(error); return { error }; }) : null;
        const gameData = await fetchJson(
            "https://matchmaker.krunker.io/game-list?hostname=krunker.io",
            MATCHMAKER_CONFIG.requestTimeoutMs,
            runId
        );
        if (!gameData || !Array.isArray(gameData.games)) {
            throw new Error("Unexpected game-list schema");
        }

        const parsed = gameData.games.map(record => parseGameRecord(record)).filter(Boolean);
        const hardCandidates = parsed.filter(game => passesHardFilters(game, filters));
        const wantedRegions = new Set(hardCandidates.map(game => game.region));
        const pings = earlyPings ? await earlyPings : await getRegionalPings(wantedRegions, runId, preparedList);
        if (isSearchActive(runId)) storeQuickFallbackPool(parsed, pings, filters);
        hardCandidates.sort((a, b) => {
            const pingA = Number.isFinite(pings[a.region]) ? pings[a.region] : Number.POSITIVE_INFINITY;
            const pingB = Number.isFinite(pings[b.region]) ? pings[b.region] : Number.POSITIVE_INFINITY;
            const withinLimitA = pingA <= filters.maxPing ? 0 : 1;
            const withinLimitB = pingB <= filters.maxPing ? 0 : 1;
            if (withinLimitA !== withinLimitB) return withinLimitA - withinLimitB;
            if (pingA !== pingB) return pingA - pingB;
            return preliminaryCandidateScore(a, filters) - preliminaryCandidateScore(b, filters);
        });

        // Hydrate snapshot matches in parallel batches until a fresh match appears.
        const snapshotMatches = hardCandidates.filter(game =>
            softFilterFailures(game, pings, filters).length === 0
        );
        sortLobbies(snapshotMatches, pings, filters);
        const initialResult = await hydrateUntilMatch(snapshotMatches, pings, filters, runId);
        let hydrated = initialResult.hydrated;
        let matching = initialResult.matching;

        // Seed hunting immediately when the global snapshot is stale.
        if (!matching.length && isSearchActive(runId)) {
            const hydratedIds = new Set(hydrated.map(game => game.gameID));
            const seedPool = hardCandidates.filter(game => !hydratedIds.has(game.gameID));
            const seedCandidates = analyzeHuntingCandidates(seedPool, pings, filters).candidates;
            const seedHydrated = (await hydrateCandidates(seedCandidates, runId)).filter(Boolean);
            hydrated = hydrated.concat(seedHydrated);
            matching = seedHydrated.filter(game => isFreshCandidateMatch(game, pings, filters));
        }

        sortLobbies(matching, pings, filters);
        const hydratedById = new Map(hydrated.map(game => [game.gameID, game]));
        const nearCandidates = hardCandidates.map(game => hydratedById.get(game.gameID) || game);
        return {
            retrievedAt,
            nearCandidates,
            matching,
            pings
        };
    }

    // Revalidate candidates immediately before navigation and preserve fallbacks.
    async function validateCandidateForJoin(game, pings, filters, runId) {
        const fresh = await hydrateCandidate(game, runId);
        if (!fresh || fresh.validationUnavailable) return null;
        if (!passesHardFilters(fresh, filters)) return null;
        if (softFilterFailures(fresh, pings, filters).length) return null;
        return fresh;
    }

    async function joinFirstValidCandidate(candidates, pings, filters, runId, rescanOnExhaustion = true) {
        if (cancelProtectedLowPlayerSearch()) return false;
        updatePlayerPolicy(true);
        if (playerPolicyBlocks(activeSearchOptions)) return false;
        if (!isSearchActive(runId)) return false;
        // Stop background refreshes before final join validation.
        stopMatchmakerWork();
        const unique = [...new Map(candidates.map(game => [game.gameID, game])).values()]
            .filter(game => passesHardFilters(game, filters))
            .slice(0, MATCHMAKER_CONFIG.finalValidationCount);
        // Start final checks together while preserving ranked selection order.
        const validations = unique.map(candidate =>
            validateCandidateForJoin(candidate, pings, filters, runId)
        );
        for (let index = 0; index < unique.length; index += 1) {
            if (!isSearchActive(runId)) return false;
            const fresh = await validations[index];
            if (cancelProtectedLowPlayerSearch()) return false;
            updatePlayerPolicy(true);
            if (playerPolicyBlocks(activeSearchOptions)) return false;
            if (!isSearchActive(runId)) return false;
            if (!fresh) continue;
            storeCandidateQueue(unique.slice(index + 1), pings);
            const notification = queueConnectionToast(fresh, pings);
            rememberRecentLobby(fresh.gameID);
            storeTargetHuntSession(fresh, activeSearchOptions.purpose);
            setJoinMarker(fresh.gameID);
            emitDiagnostic("join", { path: "search", gameID: fresh.gameID, map: fresh.map, listMap: unique[index].map,
                mode: fresh.gamemode, players: fresh.playerCount, timeLeft: fresh.remainingTime, ...describeMapFilter() });
            searchCanceled = true;
            searchRunId += 1;
            stopMatchmakerWork();
            closeMatchmakerHUD();
            showSearchFinishedNotification(notification.searchFinishedUntil);
            window.location.assign(`https://krunker.io/?game=${fresh.gameID}`);
            return true;
        }

        if (rescanOnExhaustion && isSearchActive(runId)) {
            searchStatus.textContent = "LOBBY CHANGED - CONTINUING HUNT";
            searchCounter.textContent = "The selected lobby no longer matches your filters";
            triggerMatchmaker("candidate-changed", activeSearchOptions);
        }
        return false;
    }

    // Keep manually selectable candidates fresh until the user chooses one.
    function renderCandidateList(candidates, pings, filters, runId, refreshStartedAt = Date.now()) {
        if (!isSearchActive(runId)) return;
        sortLobbies(candidates, pings, filters);
        applySearchHUDPresentation(false);
        searchContainer.classList.remove("scanning");
        searchContainer.classList.remove("hunting");
        searchStatus.textContent = "SELECT A LOBBY";
        searchFeed.innerHTML = "";
        searchFeed.style.maxHeight = "240px";
        for (const game of candidates) {
            searchFeed.appendChild(renderInteractiveEntry(game, candidates, pings, filters, runId));
        }
        searchCounter.textContent = `Found ${candidates.length} matching lobbies`;
        // An unattended list stops polling; a click still revalidates the lobby before joining.
        if (Date.now() - refreshStartedAt >= MATCHMAKER_CONFIG.candidateListRefreshLimitMs) {
            searchCounter.textContent += " · live refresh paused";
            return;
        }

        const refreshTimer = setTimeout(async () => {
            if (liveRefreshTimer !== refreshTimer || !isSearchActive(runId)) return;
            const refreshTargets = candidates.slice(0, MATCHMAKER_CONFIG.liveCandidateCount);
            const refreshed = await hydrateCandidates(refreshTargets, runId);
            if (liveRefreshTimer !== refreshTimer || !isSearchActive(runId)) return;
            const refreshedById = new Map(refreshed.filter(Boolean).map(game => [game.gameID, game]));
            const refreshedIds = new Set(refreshTargets.map(game => game.gameID));
            const combined = candidates
                .map(game => refreshedIds.has(game.gameID) ? refreshedById.get(game.gameID) : game)
                .filter(Boolean)
                .filter(game => isFreshCandidateMatch(game, pings, filters));
            if (combined.length) {
                renderCandidateList(combined, pings, filters, runId, refreshStartedAt);
            } else {
                searchStatus.textContent = "LOBBIES CHANGED - RESCANNING";
                searchCounter.textContent = "Continuing until a matching server is available";
                triggerMatchmaker("live-refresh-invalidated", activeSearchOptions);
            }
        }, MATCHMAKER_CONFIG.candidateRefreshMs);
        liveRefreshTimer = refreshTimer;
    }

    // Poll the closest mismatches between full global snapshots during hunting.
    async function monitorNearCandidates(snapshot, filters, runId) {
        let pool = snapshot.nearCandidates.filter(game => passesHardFilters(game, filters));
        let near = analyzeHuntingCandidates(pool, snapshot.pings, filters).candidates;
        const deadline = snapshot.retrievedAt + MATCHMAKER_CONFIG.globalRefreshMs;
        while (near.length && Date.now() + MATCHMAKER_CONFIG.candidateRefreshMs < deadline) {
            if (!await waitForSearch(MATCHMAKER_CONFIG.candidateRefreshMs, runId)) return [];
            const refreshed = (await hydrateCandidates(near, runId)).filter(Boolean);
            const matching = refreshed.filter(game =>
                isFreshCandidateMatch(game, snapshot.pings, filters)
            );
            if (matching.length) {
                sortLobbies(matching, snapshot.pings, filters);
                return matching;
            }
            const refreshedIds = new Set(near.map(game => game.gameID));
            const refreshedById = new Map(refreshed.map(game => [game.gameID, game]));
            pool = pool
                .map(game => refreshedIds.has(game.gameID) ? refreshedById.get(game.gameID) : game)
                .filter(Boolean)
                .filter(game => passesHardFilters(game, filters));
            near = analyzeHuntingCandidates(pool, snapshot.pings, filters).candidates;
            renderHuntingCandidates(near, snapshot.pings, filters);
        }
        const remaining = Math.max(250, deadline - Date.now());
        await waitForSearch(remaining, runId);
        return [];
    }

    async function handleMatches(matches, pings, filters, runId) {
        if (!matches.length || !isSearchActive(runId)) return false;
        sortLobbies(matches, pings, filters);
        if (matches.length === 1 || STATE.filterAutoJoin || activeSearchOptions.background || activeSearchOptions.purpose !== "normal") {
            searchFeed.innerHTML = "";
            const selected = selectSimilarCandidate(matches, pings, filters);
            const ordered = selected ? [selected, ...matches.filter(game => game.gameID !== selected.gameID)] : matches;
            return joinFirstValidCandidate(ordered, pings, filters, runId);
        }
        renderCandidateList(matches, pings, filters, runId);
        return true;
    }

    // Run the complete scan, hunt, retry, and backend-cooldown workflow.
    async function triggerMatchmaker(reason = "direct", searchOptions = null) {
        const manual = ["direct", "find-button", "hotkey"].includes(reason) || String(reason).startsWith("hotkey-");
        const requestedOptions = manual ? { ...(searchOptions || {}), manual: true } : (searchOptions || {});
        if (!manual && playerPolicyBlocks(requestedOptions)) return;
        clearPendingSearchHotkey();
        recordRuntimeAction("search-start", reason);
        // Explicit searches supersede any pending recovery navigation.
        if (["direct", "find-button", "hotkey", "match-ended", "low-player-count"].includes(reason) || String(reason).startsWith("hotkey-")) {
            const previous = readJoinRecovery();
            if (previous) saveJoinRecovery({ ...previous, temporary: false, fullCount: 0 });
            clearJoinMarker();
            // This page now owns a new search, so its own errors must be handled again.
            temporaryLobbyNavigationAt = 0;
        }
        sessionStorage.removeItem(JOIN_QUEUE_KEY);
        stopMatchmakerWork();
        activeSearchOptions = normalizeSearchOptions(requestedOptions);
        searchCanceled = false;
        searchRunId += 1;
        const runId = searchRunId;
        showSearchHUD(activeSearchOptions);
        const filters = buildFilterContext(activeSearchOptions);
        let retryDelay = 2000;

        while (isSearchActive(runId)) {
            if (Date.now() < matchmakerBackoffUntil) {
                showMatchmakerBackoff();
                const cooldownRemaining = Math.max(250, matchmakerBackoffUntil - Date.now());
                if (!await waitForSearch(cooldownRemaining, runId)) return;
                continue;
            }
            try {
                searchContainer.classList.remove("hunting");
                searchContainer.classList.add("scanning");
                searchStatus.textContent = activeSearchOptions.purpose === "target"
                    ? `${getTargetHuntStatusLabel("SCANNING")}...`
                    : "SCANNING LOBBIES...";
                searchFeed.innerHTML = "";
                searchFeed.style.maxHeight = "";
                searchCounter.textContent = "";
                const snapshot = await searchOneSnapshot(filters, runId);
                if (!isSearchActive(runId)) return;
                if (Date.now() < matchmakerBackoffUntil) continue;

                if (snapshot.matching.length) {
                    await handleMatches(snapshot.matching, snapshot.pings, filters, runId);
                    return;
                }

                let liveMatches = [];
                if (STATE.serverHunting) {
                    const hunting = analyzeHuntingCandidates(snapshot.nearCandidates, snapshot.pings, filters);
                    renderHuntingCandidates(hunting.candidates, snapshot.pings, filters);
                    liveMatches = await monitorNearCandidates(snapshot, filters, runId);
                } else {
                    searchContainer.classList.remove("scanning");
                    searchContainer.classList.remove("hunting");
                    searchStatus.textContent = "WAITING FOR NEXT SEARCH";
                    searchFeed.innerHTML = "";
                    searchCounter.textContent = "";
                    const remaining = Math.max(250, snapshot.retrievedAt + MATCHMAKER_CONFIG.globalRefreshMs - Date.now());
                    if (!await waitForSearch(remaining, runId)) return;
                }
                if (!isSearchActive(runId)) return;
                if (liveMatches.length) {
                    await handleMatches(liveMatches, snapshot.pings, filters, runId);
                    return;
                }
                retryDelay = 2000;
            } catch (error) {
                // A request timeout is recoverable; only an obsolete/cancelled run must stop.
                if (!isSearchActive(runId)) return;
                registerMatchmakerBackoff(error);
                if (Date.now() < matchmakerBackoffUntil) continue;
                console.error("Matchmaker search error:", error);
                searchContainer.classList.remove("scanning");
                searchStatus.textContent = "MATCHMAKER TEMPORARILY UNAVAILABLE";
                searchCounter.textContent = `Retrying in ${Math.round(retryDelay / 1000)}s · press Cancel to stop`;
                if (!await waitForSearch(retryDelay, runId)) return;
                retryDelay = Math.min(30000, Math.round(retryDelay * 1.8));
            }
        }
    }

    // Shared ON/OFF control; its id maps to a setting in TOGGLE_SETTINGS.
    function toggleButton(id, enabled, { labels = ["ON", "OFF"], fixed = false } = {}) {
        return `<button id="${id}" style="${fixed ? 'flex:0 0 auto; ' : ''}padding:6px 12px; background:${enabled ? 'var(--grad)' : '#171717'}; color:${enabled ? '#fff' : '#6c6c6c'}; border:1px solid ${enabled ? 'var(--accent)' : '#2d2d2d'}; border-radius:4px; font-weight:bold; font-size:10px; cursor:pointer; text-transform:uppercase; letter-spacing:0.5px; transition:0.2s; box-shadow:${enabled ? '0 2px 6px rgba(var(--accent-rgb),0.25)' : 'none'};">${enabled ? labels[0] : labels[1]}</button>`;
    }

    // Keep ranking controls separate from hard map and mode filters.
    function renderSelectionOptions() {
        const control = "background:#171717;color:#fff;border:1px solid #383838;border-radius:4px;padding:6px 8px;font:11px Aldrich;cursor:pointer;";
        const row = "display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:11px;color:#b1b1b1;font-weight:bold;";
        const available = (STATE.maps.length ? STATE.maps : MAPS).filter(map => !STATE.preferredMaps.includes(map));
        return `<div id="filter_row_selection_priority" style="${row}">
            <span>SELECTION PRIORITY</span><select id="selection_priority" style="${control}">
                <option value="ping" ${STATE.selectionPriority === 'ping' ? 'selected' : ''}>LOWEST PING</option>
                <option value="players" ${STATE.selectionPriority === 'players' ? 'selected' : ''}>MOST PLAYERS</option>
            </select></div>
            <div id="filter_row_randomize" style="${row}"><div>RANDOMIZE SIMILAR LOBBIES
                <div style="font-size:10px;color:#787878;font-weight:normal;margin-top:5px;">Allows up to 20ms and 2 players difference. Filters still apply.</div></div>
                <button id="toggle_randomize_similar" style="${control}${STATE.randomizeSimilar ? 'background:var(--grad);' : ''}">${STATE.randomizeSimilar ? 'ON' : 'OFF'}</button></div>
            <div id="filter_group_preferred_maps" style="font-size:11px;color:#b1b1b1;">
                <div style="${row}"><span>PREFERRED MAP ORDER</span><div style="display:flex;gap:6px;">
                    <select id="preferred_map_select" style="${control}max-width:155px;">
                        ${available.map(map => `<option value="${escapeHtml(map)}">${escapeHtml(MAP_NAMES[map] || map)}</option>`).join('')}
                    </select><button id="add_preferred_map" ${available.length ? '' : 'disabled'} style="${control}">ADD</button></div></div>
                <div style="font-size:10px;color:#787878;margin:5px 0;">Map order comes first, then game type and selection priority. Unselected maps stay excluded.</div>
                ${STATE.preferredMaps.map((map, index) => `<div style="${row}margin-top:6px;">
                    <span>${index + 1}. ${escapeHtml(MAP_NAMES[map] || map)}</span><div style="display:flex;gap:6px;">
                    <button data-preferred-up="${index}" ${index ? '' : 'disabled'} style="${control}" title="Move up">UP</button>
                    <button data-preferred-remove="${index}" style="${control}">REMOVE</button></div></div>`).join('')}
            </div>`;
    }

    // Build the settings panel and route its controls through delegated events.
    const ui = document.createElement("div");
    ui.id = "lombre_ui";
    ui.style.cssText = `position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background: #0d0d0d; border: 2px solid var(--accent); padding: 25px; z-index: 100000000; color: #fff; display: none; width: 560px; border-radius: 4px; animation: turfMatchmakerGlow163 5s infinite ease-in-out;`;

    // Save filter presets through an in-panel dialog supported by embedded clients.
    function openPresetSaveDialog() {
        ui.querySelector("#turfPresetSaveDialog")?.remove();
        const currentPreset = ui.querySelector("#filter_preset_select")?.value || "";
        const dialog = document.createElement("div");
        dialog.id = "turfPresetSaveDialog";
        dialog.style.cssText = "position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.76); z-index:100000001;";
        dialog.innerHTML = `
            <div style="width:310px; padding:20px; background:#0d0d0d; border:2px solid var(--accent); border-radius:4px; box-shadow:0 12px 35px rgba(0,0,0,0.9);">
                <div style="font-size:13px; color:#fff; font-weight:bold; letter-spacing:1px; margin-bottom:12px;">SAVE FILTER PRESET</div>
                <input id="turfPresetNameInput" type="text" maxlength="28" value="${escapeHtml(currentPreset)}" placeholder="PRESET NAME" autocomplete="off" style="box-sizing:border-box; width:100%; padding:10px; background:#171717; color:#fff; border:1px solid #383838; border-radius:3px; outline:none; font-family:'Aldrich'; font-size:11px;">
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
                    <button id="turfPresetCancel" type="button" style="padding:7px 12px; background:#171717; color:#aaa; border:1px solid #383838; border-radius:3px; font-family:'Aldrich'; font-size:10px; font-weight:bold; cursor:pointer;">CANCEL</button>
                    <button id="turfPresetConfirm" type="button" style="padding:7px 12px; background:var(--grad); color:#fff; border:1px solid var(--accent); border-radius:3px; font-family:'Aldrich'; font-size:10px; font-weight:bold; cursor:pointer;">SAVE</button>
                </div>
            </div>
        `;
        const input = dialog.querySelector("#turfPresetNameInput");
        const closeDialog = () => dialog.remove();
        const savePreset = () => {
            const name = normalizePresetName(input.value);
            if (!name) {
                input.style.borderColor = "#ff3b3b";
                input.focus();
                return;
            }
            const presets = { ...STATE.filterPresets };
            if (!Object.prototype.hasOwnProperty.call(presets, name) && Object.keys(presets).length >= 20) {
                delete presets[Object.keys(presets)[0]];
            }
            presets[name] = {
                regions: [...new Set(STATE.regions.filter(item => REGIONS.includes(item)))],
                modes: [...new Set(STATE.modes.filter(item => ALL_GAMEMODES.includes(item)))],
                maps: [...new Set(STATE.maps.filter(item => MAPS.includes(item)))]
            };
            STATE.filterPresets = presets;
            saveState();
            closeDialog();
            render();
        };
        dialog.onclick = event => event.stopPropagation();
        dialog.querySelector("#turfPresetCancel").onclick = closeDialog;
        dialog.querySelector("#turfPresetConfirm").onclick = savePreset;
        input.onkeydown = event => {
            if (event.key === "Enter") {
                event.preventDefault();
                savePreset();
            } else if (event.key === "Escape") {
                event.preventDefault();
                closeDialog();
            }
        };
        ui.appendChild(dialog);
        input.focus();
        input.select();
    }

    // Boolean settings flipped by panel buttons, with any side effect the change needs.
    const TOGGLE_SETTINGS = {
        toggle_randomize_similar: "randomizeSimilar",
        toggle_browser_cancel: "openServerBrowser",
        toggle_filter_autojoin: "filterAutoJoin",
        toggle_filter_avoid_full: "filterAvoidCloseToFull",
        toggle_filter_avoid_past: "filterAvoidPastLobbies",
        toggle_server_hunting: "serverHunting",
        toggle_auto_search_after_match: "autoSearchAfterMatch",
        toggle_double_xp_after_match: "doubleXPAfterMatch",
        toggle_auto_claim_rewards: "autoClaimRewards",
        toggle_compact_search_status: "compactSearchStatus",
        toggle_double_press_search: "doublePressSearchHotkey",
        toggle_force_player_count: "forcePlayerCount",
        toggle_low_player_count: "lowPlayerCountEnabled",
        toggle_player_blacklist: "playerBlacklistEnabled",
        toggle_player_whitelist: "playerWhitelistEnabled",
        toggle_gradient: "gradientEnabled",
        toggle_automatic_updates: "automaticUpdates"
    };
    const TOGGLE_EFFECTS = {
        playerWhitelistEnabled: () => { updatePlayerPolicy(true); },
        playerBlacklistEnabled: () => { playerPolicy.blackFired = false; updatePlayerPolicy(true); },
        lowPlayerCountEnabled: () => { lowPlayerMonitor = null; },
        compactSearchStatus: () => applySearchHUDPresentation(),
        doublePressSearchHotkey: () => clearPendingSearchHotkey(),
        gradientEnabled: () => applyTheme(STATE.gradColor1, STATE.gradColor2)
    };

    ui.onclick = (e) => {
        const target = e.target;
        if (target.id === "check_updates_btn") {
            if (acceptActivationClick(e, "check-updates")) void checkForUpdates({ force: true });
            return;
        }
        const listKey = target.dataset.playerAdd || target.dataset.playerRemove;
        if (["playerBlacklist", "playerWhitelist"].includes(listKey)) {
            if (target.dataset.playerAdd) {
                STATE[listKey] = sanitizePlayerNames([...STATE[listKey], ui.querySelector(`#${listKey}Input`).value]);
            } else {
                STATE[listKey].splice(Number(target.dataset.index), 1);
            }
            playerPolicy.blackFired = false;
            saveState(); render(); updatePlayerPolicy(true); return;
        }
        if (target.id === "close_btn") { toggleUI(false); return; }
        const toggledSetting = TOGGLE_SETTINGS[target.id];
        if (toggledSetting) {
            STATE[toggledSetting] = !STATE[toggledSetting];
            TOGGLE_EFFECTS[toggledSetting]?.();
            saveState();
            render();
            return;
        }
        if (target.id === "add_preferred_map") {
            const map = ui.querySelector("#preferred_map_select")?.value;
            if (MAPS.includes(map) && !STATE.preferredMaps.includes(map)) STATE.preferredMaps.push(map);
            saveState(); render(); return;
        }
        if (target.hasAttribute("data-preferred-up") || target.hasAttribute("data-preferred-remove")) {
            const moving = target.hasAttribute("data-preferred-up");
            const index = Number(moving ? target.dataset.preferredUp : target.dataset.preferredRemove);
            if (Number.isInteger(index) && index >= 0 && index < STATE.preferredMaps.length) {
                if (moving && index > 0) [STATE.preferredMaps[index - 1], STATE.preferredMaps[index]] = [STATE.preferredMaps[index], STATE.preferredMaps[index - 1]];
                else if (!moving) STATE.preferredMaps.splice(index, 1);
                saveState(); render();
            }
            return;
        }

        const tabBtn = target.closest('.tab-btn');
        if (tabBtn) { cancelBindingModes(); STATE.tab = tabBtn.dataset.t; render(); return; }

        const filterTool = target.closest('.filter-tool-btn');
        if (filterTool) {
            const action = filterTool.dataset.action;
            if (action === "turf-wars") {
                STATE.maps = [...TURF_WARS_MAPS];
                STATE.modes = [...TURF_WARS_MODES];
            } else if (action === "none") {
                STATE.regions = [];
                STATE.maps = [];
                STATE.modes = [];
            } else if (action === "all") {
                STATE.regions = [...REGIONS];
                STATE.maps = [...MAPS];
                STATE.modes = [...ALL_GAMEMODES];
            } else if (action === "save") {
                openPresetSaveDialog();
                return;
            } else if (action === "load") {
                const presetName = ui.querySelector("#filter_preset_select")?.value;
                const preset = STATE.filterPresets?.[presetName];
                if (!preset) return;
                STATE.regions = [...preset.regions];
                STATE.maps = [...preset.maps];
                STATE.modes = [...preset.modes];
            } else if (action === "delete") {
                const presetName = ui.querySelector("#filter_preset_select")?.value;
                if (!presetName || !Object.prototype.hasOwnProperty.call(STATE.filterPresets, presetName)) return;
                const presets = { ...STATE.filterPresets };
                delete presets[presetName];
                STATE.filterPresets = presets;
            } else {
                return;
            }
            saveState();
            render();
            return;
        }

        const targetMapOption = target.closest('.target-map-hunt-option');
        if (targetMapOption) {
            if (!STATE.serverHunting) return;
            const map = targetMapOption.dataset.map;
            if (!TURF_WARS_MAPS.includes(map)) return;
            const selected = sanitizeTargetHuntMaps(STATE.targetHuntMaps);
            const nextSelection = selected.includes(map)
                ? selected.filter(item => item !== map)
                : [...selected, map];
            STATE.targetHuntMaps = sanitizeTargetHuntMaps(nextSelection);
            saveState();

            const isSelected = STATE.targetHuntMaps.includes(map);
            targetMapOption.dataset.selected = String(isSelected);
            targetMapOption.style.background = isSelected ? 'rgba(var(--accent-rgb),0.16)' : '#111';
            targetMapOption.style.color = isSelected ? '#fff' : '#777';
            targetMapOption.style.borderColor = isSelected ? 'var(--accent)' : '#222';
            const check = targetMapOption.querySelector('.target-map-hunt-check');
            if (check) check.textContent = isSelected ? '[X]' : '[ ]';
            const summary = ui.querySelector('#target_map_hunt_summary');
            if (summary) {
                summary.textContent = STATE.targetHuntMaps.length === 0
                    ? 'OFF'
                    : (STATE.targetHuntMaps.length === 1 ? STATE.targetHuntMaps[0].toUpperCase() : `${STATE.targetHuntMaps.length} MAPS`);
            }
            const dropdown = ui.querySelector('#target_map_hunt_dropdown');
            if (dropdown) dropdown.style.borderColor = STATE.targetHuntMaps.length ? 'var(--accent)' : '#2d2d2d';
            return;
        }

        const mSelect = target.closest('.m-select');
        if (mSelect) {
            const k = mSelect.dataset.key;
            const v = isNaN(mSelect.dataset.val) ? mSelect.dataset.val : parseInt(mSelect.dataset.val);
            const exists = STATE[k].includes(v);
            if (exists) {
                STATE[k] = STATE[k].filter(x => x !== v);
                mSelect.style.background = '#0a0a0a';
                mSelect.style.color = '#606060';
                mSelect.style.borderColor = '#191919';
                mSelect.style.boxShadow = 'none';
            } else {
                STATE[k] = [...STATE[k], v];
                mSelect.style.background = 'var(--grad)';
                mSelect.style.color = '#fff';
                mSelect.style.borderColor = 'var(--accent)';
                mSelect.style.boxShadow = '0 2px 6px rgba(var(--accent-rgb),0.25)';
            }
            saveState();
            return;
        }

        if (target.id === "find_btn") {
            if (!acceptActivationClick(e, "find-button")) return;
            toggleUI(false);
            triggerMatchmaker("find-button");
            return;
        }
        if (target.id === "load_css_btn") { loadCSSFile(); return; }
        if (target.id === "load_script_btn") { loadScriptFile(); return; }
        if (target.id === "clear_css_btn") { STATE.css = ""; saveState(); applyCSS(""); render(); return; }
        if (target.id === "clear_script_btn") { STATE.script = ""; saveState(); render(); return; }
        if (target.id === "kb_btn") { clearPendingSearchHotkey(); STATE.bindingCancel = false; STATE.binding = true; target.textContent = "WAITING..."; return; }
        if (target.id === "cancel_kb_btn") { clearPendingSearchHotkey(); STATE.binding = false; STATE.bindingCancel = true; target.textContent = "WAITING..."; return; }
        if (target.id === "clear_kb_btn") { clearPendingSearchHotkey(); cancelBindingModes(); STATE.keybind = ""; saveState(); render(); return; }
        if (target.id === "reset_grad_btn") { applyTheme(DEFAULT_GRAD.c1, DEFAULT_GRAD.c2); saveState(); render(); return; }
        if (target.id === "preview_search_toast_btn") { previewSearchNotification(); return; }
        if (target.id === "reset_search_toast_btn") {
            STATE.searchToastSeconds = NEW_USER_DEFAULTS.notificationSeconds;
            STATE.searchToastColor = NEW_USER_DEFAULTS.searchToastColor;
            STATE.searchToastOffsetX = 24;
            STATE.searchToastOffsetY = INSTALL_DEFAULTS.searchToastOffsetY;
            refreshSearchNotification();
            saveState(); render(); return;
        }
        if (target.id === "reset_toast_btn") {
            STATE.toastSeconds = NEW_USER_DEFAULTS.notificationSeconds;
            STATE.toastColor = "#0cb800";
            STATE.toastOffsetX = 24;
            STATE.toastOffsetY = 24;
            const activeConnectionToast = document.getElementById("turfConnectionToast");
            if (activeConnectionToast) applyConnectionToastAppearance(activeConnectionToast);
            const activeRecoveryToast = document.getElementById("turfMatchmakerRecoveryToast");
            if (activeRecoveryToast) applyRecoveryToastAppearance(activeRecoveryToast);
            saveState();
            render();
            return;
        }
        if (target.id === "reset_recovery_toast_btn") {
            STATE.recoveryToastSeconds = NEW_USER_DEFAULTS.notificationSeconds;
            STATE.recoveryToastColor = "#ff3030";
            STATE.recoveryToastOffsetX = INSTALL_DEFAULTS.recoveryToastOffsetX;
            STATE.recoveryToastOffsetY = INSTALL_DEFAULTS.recoveryToastOffsetY;
            const activeToast = document.getElementById("turfMatchmakerRecoveryToast");
            if (activeToast) applyRecoveryToastAppearance(activeToast);
            saveState();
            render();
            return;
        }
        if (target.id === "preview_toast_btn") {
            showConnectionToast({
                region: "Frankfurt",
                map: "Sandstorm",
                gamemode: "Free for All",
                players: "6/8",
                ping: "36ms"
            });
            return;
        }
        if (target.id === "preview_recovery_toast_btn") {
            showRecoveryToast("TOO FEW PLAYERS");
            return;
        }
        const preset = target.closest('.grad-preset');
        if (preset) {
            const pr = GRAD_PRESETS[parseInt(preset.dataset.i)];
            applyTheme(pr[0], pr[1]);
            saveState();
            render();
            return;
        }
    };

    ui.oninput = (e) => {
        const target = e.target;
        if (target.classList.contains('low-protect-value')) {
            const condition = LOW_PROTECTION_FIELDS.find(item => item.value === target.dataset.k);
            if (!condition) return;
            const number = Number(target.value);
            const bounded = Number.isFinite(number) ? Math.max(0, Math.min(condition.max, number)) : 0;
            const value = condition.step === 0.1 ? Math.round(bounded * 10) / 10 : Math.floor(bounded);
            STATE[condition.value] = value;
            STATE[condition.enabled] = value > 0;
            lowPlayerMonitor = null;
            saveState();
            return;
        }
        const slider = target.closest('.s-input');
        if (slider) {
            const key = slider.dataset.k;
            if (key === 'lowProtectGrace') {
                const value = clampInteger(target.value, 15, 0, 60);
                STATE.lowProtectGraces[STATE.lowProtectSelected] = value;
                lowPlayerMonitor = null;
                ui.querySelector('#l_lowProtectGrace').textContent = value;
                return;
            }
            const val = key === "lowProtectKdrMin" ? Math.max(0.1, Math.min(20, Number(target.value) || 0.1))
                : key === "lowPlayerWaitSeconds" ? clampInteger(target.value, 15, 5, 60) : parseInt(target.value);
            STATE[key] = val;
            if (key === "lowPlayerMinimum" || key === "lowPlayerWaitSeconds" || key.startsWith('lowProtect')) lowPlayerMonitor = null;
            const label = ui.querySelector(`#l_${key}`);
            if (label) label.textContent = val;
            // Dragging one end of the player range past the other moves both ends together.
            const partner = { minPlayers: "maxPlayers", maxPlayers: "minPlayers" }[key];
            if (partner && (key === "minPlayers" ? val > STATE[partner] : val < STATE[partner])) {
                STATE[partner] = val;
                const partnerInput = ui.querySelector(`.s-input[data-k="${partner}"]`);
                if (partnerInput) partnerInput.value = val;
                const partnerLabel = ui.querySelector(`#l_${partner}`);
                if (partnerLabel) partnerLabel.textContent = val;
            }
            return;
        }

        const liveTheme = () => applyTheme(STATE.gradColor1, STATE.gradColor2);
        if (target.id === "grad1_picker") {
            STATE.gradColor1 = target.value;
            const hexInput = ui.querySelector("#grad1_hex");
            if (hexInput) hexInput.value = target.value.toUpperCase();
            liveTheme();
            return;
        }
        if (target.id === "grad2_picker") {
            STATE.gradColor2 = target.value;
            const hexInput = ui.querySelector("#grad2_hex");
            if (hexInput) hexInput.value = target.value.toUpperCase();
            liveTheme();
            return;
        }
        if (target.id === "grad1_hex") {
            if (isValidHex(target.value)) {
                STATE.gradColor1 = normalizeHexColor(target.value);
                const picker = ui.querySelector("#grad1_picker");
                if (picker) picker.value = STATE.gradColor1;
                liveTheme();
            }
            return;
        }
        if (target.id === "grad2_hex") {
            if (isValidHex(target.value)) {
                STATE.gradColor2 = normalizeHexColor(target.value);
                const picker = ui.querySelector("#grad2_picker");
                if (picker) picker.value = STATE.gradColor2;
                liveTheme();
            }
            return;
        }
        if (target.id === "toast_color_picker") {
            STATE.toastColor = target.value;
            updateNotificationSectionColor("", STATE.toastColor);
            const hexInput = ui.querySelector("#toast_color_hex");
            if (hexInput) hexInput.value = target.value.toUpperCase();
            const activeToast = document.getElementById("turfConnectionToast");
            if (activeToast) applyConnectionToastAppearance(activeToast);
            return;
        }
        if (target.id === "toast_color_hex") {
            if (isValidHex(target.value)) {
                STATE.toastColor = normalizeHexColor(target.value);
                updateNotificationSectionColor("", STATE.toastColor);
                const picker = ui.querySelector("#toast_color_picker");
                if (picker) picker.value = STATE.toastColor;
                const activeToast = document.getElementById("turfConnectionToast");
                if (activeToast) applyConnectionToastAppearance(activeToast);
            }
            return;
        }
        if (target.classList.contains("notification-duration")) {
            STATE[target.dataset.k] = clampInteger(target.value, 0, 0, 5);
            return;
        }
        if (target.id === "search_toast_color_picker" || target.id === "search_toast_color_hex") {
            if (isValidHex(target.value)) {
                STATE.searchToastColor = normalizeHexColor(target.value);
                updateNotificationSectionColor("search", STATE.searchToastColor);
                const other = ui.querySelector(target.id.endsWith("picker") ? "#search_toast_color_hex" : "#search_toast_color_picker");
                if (other) other.value = STATE.searchToastColor;
                refreshSearchNotification();
            }
            return;
        }
        if (target.classList.contains("search-toast-coordinate")) {
            STATE[target.dataset.k] = clampInteger(target.value, 0, 0, 2000);
            refreshSearchNotification();
            return;
        }
        if (target.id === "recovery_toast_color_picker") {
            STATE.recoveryToastColor = target.value;
            updateNotificationSectionColor("recovery", STATE.recoveryToastColor);
            const hexInput = ui.querySelector("#recovery_toast_color_hex");
            if (hexInput) hexInput.value = target.value.toUpperCase();
            const activeToast = document.getElementById("turfMatchmakerRecoveryToast");
            if (activeToast) applyRecoveryToastAppearance(activeToast);
            return;
        }
        if (target.id === "recovery_toast_color_hex") {
            if (isValidHex(target.value)) {
                STATE.recoveryToastColor = normalizeHexColor(target.value);
                updateNotificationSectionColor("recovery", STATE.recoveryToastColor);
                const picker = ui.querySelector("#recovery_toast_color_picker");
                if (picker) picker.value = STATE.recoveryToastColor;
                const activeToast = document.getElementById("turfMatchmakerRecoveryToast");
                if (activeToast) applyRecoveryToastAppearance(activeToast);
            }
            return;
        }
        if (target.classList.contains("toast-coordinate")) {
            const value = Math.max(0, Math.min(2000, Math.round(Number(target.value) || 0)));
            STATE[target.dataset.k] = value;
            const activeToast = document.getElementById("turfConnectionToast");
            if (activeToast) applyConnectionToastAppearance(activeToast);
            return;
        }
        if (target.classList.contains("recovery-toast-coordinate")) {
            const value = Math.max(0, Math.min(2000, Math.round(Number(target.value) || 0)));
            STATE[target.dataset.k] = value;
            const activeToast = document.getElementById("turfMatchmakerRecoveryToast");
            if (activeToast) applyRecoveryToastAppearance(activeToast);
            return;
        }
    };

    ui.onchange = (e) => {
        const target = e.target;
        if (target.classList.contains('low-protect-operator')) {
            if (['eq', 'ne', 'gt', 'lt', 'ge', 'le'].includes(target.value)) {
                STATE.lowProtectOperators[STATE.lowProtectSelected] = target.value;
                lowPlayerMonitor = null;
                saveState();
            }
            return;
        }
        if (target.classList.contains('low-protect-select')) {
            if (LOW_PROTECTION_FIELDS.some(field => field.id === target.value)) {
                STATE.lowProtectSelected = target.value;
                saveState(); render();
            }
            return;
        }
        if (target.classList.contains('low-protect-value')) {
            ui.oninput(e);
            target.value = STATE[target.dataset.k];
            return;
        }
        if (target.id === "selection_priority") {
            STATE.selectionPriority = target.value === "players" ? "players" : "ping";
            saveState(); render(); return;
        }
        const slider = target.closest('.s-input');
        if (slider) {
            if (slider.dataset.k === "pastLobbyCount") trimRecentLobbies();
            saveState();
            return;
        }
        if (target.id === "priority_mode_sel") {
            STATE.priorityMode = target.value;
            saveState();
            render();
            return;
        }
        if (target.id === "grad1_hex" || target.id === "grad2_hex" || target.id === "grad1_picker" || target.id === "grad2_picker") {
            saveState();
            render();
            return;
        }
        if (target.classList.contains("notification-duration") || target.id === "search_toast_color_hex" || target.id === "search_toast_color_picker" || target.classList.contains("search-toast-coordinate")
            || target.id === "toast_color_hex" || target.id === "toast_color_picker" || target.classList.contains("toast-coordinate")
            || target.id === "recovery_toast_color_hex" || target.id === "recovery_toast_color_picker" || target.classList.contains("recovery-toast-coordinate")) {
            saveState();
            if (target.classList.contains("toast-coordinate")) applySearchHUDPresentation();
            render();
            return;
        }
    };

    const mBtn = document.createElement("div");
    mBtn.id = "lombre_m_btn";
    mBtn.className = "onMenu";
    mBtn.textContent = "M";
    mBtn.style.cssText = `position:fixed; top:20px; right:20px; width:35px; height:35px; background: #0d0d0d; border: 2px solid var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: pointer; border-radius: 4px; z-index: 10000000; transition: 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.5), 0 0 10px rgba(var(--accent-rgb),0.3); font-weight: bold;`;
    mBtn.onmouseover = () => { mBtn.style.background = "var(--grad)"; mBtn.style.borderColor = "#ffffff"; mBtn.style.boxShadow = "0 4px 15px rgba(var(--accent-rgb),0.6)"; };
    mBtn.onmouseout = () => { mBtn.style.background = "#0d0d0d"; mBtn.style.borderColor = "var(--accent)"; mBtn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5), 0 0 10px rgba(var(--accent-rgb),0.3)"; };
    mBtn.onclick = event => {
        if (acceptActivationClick(event, "menu-button")) toggleUI(undefined, "menu-button");
    };

    // User-supplied artwork is embedded so the tutorial needs no separate download.
    const FIRST_RUN_TUTORIAL_IMAGE = "data:image/png;base64,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";

    // One short introduction for fresh profiles; M keeps its normal corner placement.
    let firstRunTutorial = null;
    let firstRunTutorialObserver = null;

    function dismissFirstRunTutorial() {
        if (STATE.tutorialDismissed && !firstRunTutorial) return;
        STATE.tutorialDismissed = true;
        firstRunTutorialObserver?.disconnect();
        firstRunTutorialObserver = null;
        window.removeEventListener("resize", updateFirstRunTutorialPosition);
        document.removeEventListener("pointerlockchange", updateFirstRunTutorialPosition);
        firstRunTutorial?.remove();
        firstRunTutorial = null;
        saveState();
    }

    function updateFirstRunTutorialPosition() {
        if (!firstRunTutorial) return;
        const target = mBtn.getBoundingClientRect();
        if (document.pointerLockElement || target.width === 0 || target.height === 0) {
            firstRunTutorial.style.display = "none";
            return;
        }
        firstRunTutorial.style.display = "block";
        const picture = firstRunTutorial.querySelector("#turfFirstRunTutorialImage");
        const bounds = picture.getBoundingClientRect();
        // Align the artwork's red circle to the existing button without changing M.
        picture.style.left = `${target.left + target.width / 2 - bounds.width * 708 / 750}px`;
        picture.style.top = `${target.top + target.height / 2 - bounds.height * 63 / 636}px`;
    }

    function showFirstRunTutorial() {
        if (STATE.tutorialDismissed || firstRunTutorial || !document.body || STATE.visible) return;
        const layer = document.createElement("div");
        layer.id = "turfFirstRunTutorial";
        // Stay below M's normal z-index so the image and dimmer never cover it.
        layer.style.cssText = "position:fixed;inset:0;z-index:9999999;overflow:hidden;pointer-events:none;";
        const backdrop = document.createElement("div");
        backdrop.id = "turfFirstRunTutorialBackdrop";
        backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.25);pointer-events:none;";
        const picture = document.createElement("img");
        picture.id = "turfFirstRunTutorialImage";
        picture.alt = "Tutorial artwork with a red arrow pointing at the M button";
        picture.style.cssText = "position:fixed;width:750px;height:636px;max-width:none;z-index:1;pointer-events:none;";
        picture.src = FIRST_RUN_TUTORIAL_IMAGE;
        picture.addEventListener("load", updateFirstRunTutorialPosition);
        const card = document.createElement("div");
        card.id = "turfFirstRunTutorialCard";
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-labelledby", "turfFirstRunTutorialTitle");
        card.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;padding:24px;background:#0d0d0d;border:2px solid var(--accent);border-radius:6px;box-shadow:0 12px 50px #0009;color:#fff;font-family:Aldrich,sans-serif;pointer-events:auto;z-index:2;";
        card.innerHTML = `<div id="turfFirstRunTutorialTitle" style="font-size:14px;font-weight:bold;letter-spacing:1px;">WELCOME TO TURF MATCHMAKER</div>
            <p style="font-size:13px;line-height:1.6;color:#c4c4c4;margin:15px 0 10px;">Click <strong style="color:#fff;">M</strong> in the top-right corner to open the menu. All filters, player lists and notification settings are there.</p>
            <p id="turfFirstRunTutorialHotkey" style="font-size:12px;line-height:1.6;color:#c4c4c4;margin:0 0 18px;"></p>
            <button id="turfFirstRunTutorialGotIt" type="button" style="width:100%;padding:10px;background:var(--grad);color:#fff;border:1px solid var(--accent);border-radius:4px;font: bold 12px Aldrich,sans-serif;cursor:pointer;">GOT IT</button>`;
        card.querySelector("#turfFirstRunTutorialHotkey").textContent = STATE.keybind
            ? `Choose your filters, then press ${STATE.keybind.replace(/^Key|^Digit/, "")} to search.`
            : "Choose your filters, then click Find Game to search.";
        // Keep acknowledgement clicks from reaching the game's click-to-play handler.
        for (const type of ["pointerdown", "pointerup", "click"]) card.addEventListener(type, event => event.stopPropagation());
        card.querySelector("#turfFirstRunTutorialGotIt").onclick = event => {
            if (acceptActivationClick(event, "tutorial-acknowledgement")) dismissFirstRunTutorial();
        };

        layer.append(backdrop, picture, card);
        firstRunTutorial = layer;
        document.body.appendChild(layer);
        window.addEventListener("resize", updateFirstRunTutorialPosition);
        document.addEventListener("pointerlockchange", updateFirstRunTutorialPosition);
        if (typeof ResizeObserver === "function") {
            firstRunTutorialObserver = new ResizeObserver(updateFirstRunTutorialPosition);
            firstRunTutorialObserver.observe(mBtn);
            firstRunTutorialObserver.observe(card);
        }
        updateFirstRunTutorialPosition();
    }

    // Merge and group frequently used matchmaking controls in one Filters card above the selectors.
    function mergeMatchFilterBoxes() {
        const options = ui.querySelector("#filter_options_box");
        const tools = ui.querySelector("#shared_filter_tools");
        const timing = ui.querySelector("#filter_timing_automation");
        const timingContent = timing?.firstElementChild;
        if (!options || !tools || !timing || !timingContent || !options.parentNode) return;

        while (timingContent.firstChild) options.appendChild(timingContent.firstChild);
        timing.remove();

        const categoryDefinitions = [
            ["requirements", "LOBBY REQUIREMENTS", ["filter_label_min_players", "filter_input_min_players", "filter_label_max_players", "filter_input_max_players", "filter_label_min_time", "filter_input_min_time", "filter_label_max_ping", "filter_input_max_ping"]],
            ["selection", "LOBBY SELECTION", ["filter_row_autojoin", "filter_row_selection_priority", "filter_row_randomize", "filter_group_preferred_maps", "filter_row_priority_mode", "filter_row_avoid_full", "filter_group_avoid_past"]],
            ["hunting", "HUNTING", ["filter_row_server_hunting", "filter_row_target_map_hunting"]],
            ["after_match", "AFTER MATCH", ["filter_row_double_xp", "filter_row_claim_rewards", "filter_row_auto_search"]],
            ["interface", "INTERFACE", ["filter_row_compact_status"]]
        ];
        const categories = categoryDefinitions.map(([key, title, ids]) => {
            const section = document.createElement("section");
            section.id = `filter_category_${key}`;
            section.style.cssText = "display:flex; flex-direction:column; gap:10px;";

            const heading = document.createElement("div");
            heading.className = "filter-category-heading";
            heading.textContent = title;
            heading.style.cssText = "font-size:9px; color:#666; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; border-bottom:1px solid #191919; padding-bottom:7px; margin-bottom:1px;";
            section.appendChild(heading);
            for (const id of ids) {
                const control = ui.querySelector(`#${id}`);
                if (control) section.appendChild(control);
            }
            return section;
        });

        options.replaceChildren(...categories);
        options.parentNode.insertBefore(options, tools);
        options.style.gap = "13px";
        options.style.padding = "20px";
    }

    function renderNotificationDuration(kind, key) {
        return `<label style="display:block;font-size:9px;color:#787878;font-weight:bold;letter-spacing:0.5px;">${kind === "search" ? "HIDE AFTER LOBBY FOUND (SECONDS)" : "DURATION (SECONDS)"}
        <input id="${kind ? kind + '_' : ''}toast_duration_input" type="number" class="notification-duration" data-k="${key}" min="0" max="5" step="1" value="${STATE[key]}" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;background:#171717;color:#fff;border:1px solid #2d2d2d;border-radius:4px;font:12px Aldrich;padding:8px;">
        <span style="display:block;font-weight:normal;margin-top:5px;line-height:1.45;">${kind === "search" ? "Search stays visible until a lobby is found. 0 hides the completion notice." : "0 disables this notification."}</span></label>`;
    }

    function updateNotificationSectionColor(kind, color) {
        const name = kind || "connection";
        const section = ui.querySelector(`#notification_${name}_settings`);
        const title = ui.querySelector(`#notification_${name}_title`);
        const button = ui.querySelector(`#preview_${kind ? kind + '_' : ''}toast_btn`);
        if (section) section.style.borderColor = color;
        if (title) title.style.borderLeftColor = color;
        if (button) button.style.borderColor = color;
    }

    function renderNotificationSettings(kind, title, color, x, y) {
        const fieldStyle = "width:100%;box-sizing:border-box;margin-top:5px;background:#171717;color:#fff;border:1px solid #2d2d2d;border-radius:4px;font-size:12px;padding:8px;font-family:Aldrich;outline:none";
        const prefix = kind === "search" ? "searchToast" : kind === "recovery" ? "recoveryToast" : "toast";
        const controlPrefix = kind ? kind + '_' : '';
        const name = kind || "connection";
        const coordinateClass = kind ? kind + '-toast-coordinate' : 'toast-coordinate';
        return `<div id="notification_${name}_title" style="font-size:11px;color:#b1b1b1;margin:18px 0 10px;font-weight:bold;letter-spacing:1.5px;border-left:3px solid ${color};padding-left:6px">${title}</div>
        <div id="notification_${name}_settings" style="background:#0a0a0a;padding:18px;border-radius:4px;border:1px solid ${color};display:flex;flex-direction:column;gap:14px">
            <div><div style="font-size:9px;color:#787878;font-weight:bold;margin-bottom:4px">NOTIFICATION COLOR</div>
            <div style="display:flex;gap:6px;align-items:center">
                <input type="color" id="${controlPrefix}toast_color_picker" aria-label="${title} color" value="${color}" style="width:42px;height:34px;background:none;border:1px solid #2d2d2d;border-radius:4px;padding:2px">
                <input type="text" id="${controlPrefix}toast_color_hex" aria-label="${title} hex color" value="${color}" maxlength="7" spellcheck="false" style="${fieldStyle};flex:1;min-width:0">
            </div></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            ${[["x", x], ["y", y]].map(([axis, value]) => `<label style="font-size:9px;color:#787878;font-weight:bold">${axis.toUpperCase()} - FROM ${axis === "x" ? "LEFT" : "BOTTOM"} (PX)
            <input type="number" id="${controlPrefix}toast_${axis}_input" class="${coordinateClass}" data-k="${prefix}Offset${axis.toUpperCase()}" min="0" max="2000" step="1" value="${value}" style="${fieldStyle}"></label>`).join("")}
            </div>
            <div style="font-size:9px;color:#787878;line-height:1.5">Independent position. X from the left, Y from the bottom. Kept inside the screen.</div>
            ${renderNotificationDuration(kind, prefix + "Seconds")}
            <div style="display:flex;gap:8px">
                <button id="preview_${controlPrefix}toast_btn" style="${fieldStyle};flex:1;cursor:pointer;font-weight:bold;border-color:${color}">TEST NOTIFICATION</button>
                <button id="reset_${controlPrefix}toast_btn" style="${fieldStyle};width:auto;cursor:pointer;font-weight:bold">RESET</button>
            </div>
        </div>`;
    }

    // Render the active Match, Extensions, or Settings view from STATE.
    function renderPlayerList(key, title, description) {
        const toggle = key === "playerBlacklist" ? "toggle_player_blacklist" : "toggle_player_whitelist";
        const control = "background:#171717;color:#fff;border:1px solid #383838;border-radius:4px;padding:6px 8px;font:11px Aldrich;cursor:pointer;";
        return `<div style="background:#0a0a0a;border:1px solid #191919;border-radius:4px;padding:14px;margin-top:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                <div><div style="font-size:12px;font-weight:bold;color:#b1b1b1;letter-spacing:0.5px;">${title}</div>
                <div style="font-size:9px;color:#787878;line-height:1.45;margin-top:4px;">${description}</div></div>
                ${toggleButton(toggle, STATE[key + "Enabled"], {fixed:true})}</div>
            <div style="display:flex;gap:8px;margin-top:12px;">
                <input id="${key}Input" aria-label="${title} IGN" placeholder="Exact IGN" maxlength="64" autocomplete="off" style="${control}box-sizing:border-box;min-width:0;flex:1;padding:10px;font-size:13px;cursor:text;">
                <button data-player-add="${key}" style="${control}flex:0 0 auto;">ADD</button></div>
            ${STATE[key].map((name,index)=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:6px;padding:5px 10px;background:#111;border:1px solid #222;border-radius:4px;font-size:12px;font-weight:bold;color:#ddd;"><span style="min-width:0;overflow-wrap:anywhere;">${renderPlayerDisplay(name)}</span><button data-player-remove="${key}" data-index="${index}" aria-label="Remove ${escapeHtml(name)}" style="${control}flex:0 0 auto;">REMOVE</button></div>`).join("")}
            <div style="font-size:9px;color:#787878;margin-top:8px;">Exact IGN, case-insensitive. Uses the populated client scoreboard, including when hidden. Open Tab once if names are unavailable.</div>
        </div>`;
    }

    const LOW_PROTECTION_FIELDS = [
        { id: 'kills', label: 'Kills', enabled: 'lowProtectKills', value: 'lowProtectKillsMin', max: 100, step: 1, hint: 'Minimum kills' },
        { id: 'kdr', label: 'KDR', enabled: 'lowProtectKdr', value: 'lowProtectKdrMin', max: 20, step: 0.1, hint: 'Minimum KDR' },
        { id: 'time', label: 'Time Left', enabled: 'lowProtectTime', value: 'lowProtectTimeMax', max: 300, step: 1, hint: 'Maximum seconds left' },
        { id: 'position', label: 'Position', enabled: 'lowProtectPosition', value: 'lowProtectScoreGap', max: 2000, step: 1, hint: 'Maximum score gap to TOP 1' }
    ];

    function renderLowPlayerProtection() {
        const control = 'box-sizing:border-box;min-width:0;background:#171717;color:#ddd;border:1px solid #383838;border-radius:4px;padding:6px 8px;font:11px Aldrich;';
        const field = LOW_PROTECTION_FIELDS.find(item => item.id === STATE.lowProtectSelected) || LOW_PROTECTION_FIELDS[0];
        return `<div id="lowPlayerProtectionEditor" style="margin-top:12px;">
            <div id="lowPlayerProtectionLabel" style="font-size:12px;font-weight:bold;color:#b1b1b1;letter-spacing:0.5px;">Stay if:</div>
                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:center;gap:8px;margin-top:6px;">
                    <select class="low-protect-select" aria-label="Protection condition" style="${control}width:100%;cursor:pointer;">${LOW_PROTECTION_FIELDS.map(option => `<option value="${option.id}" ${field.id === option.id ? 'selected' : ''}>${option.label}</option>`).join('')}</select>
                    <select class="low-protect-operator" aria-label="Comparison operator" style="${control}width:100%;cursor:pointer;">${[['eq','='],['gt','>'],['lt','<'],['ne','≠'],['ge','≥'],['le','≤']].map(([value, label]) => `<option value="${value}" ${STATE.lowProtectOperators[field.id] === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
                    <input type="number" class="low-protect-value" data-k="${field.value}" aria-label="${field.label} value" title="${field.label} value; 0 = off" min="0" max="${field.max}" step="${field.step}" value="${STATE[field.value]}" style="${control}width:100%;">
                </div>
            <label style="display:flex;justify-content:space-between;font-size:10px;font-weight:bold;color:#787878;letter-spacing:0.5px;margin-top:10px;"><span>GRACE PERIOD - <span id="l_lowProtectGrace" style="color:var(--accent);">${STATE.lowProtectGraces[field.id]}</span> s</span></label>
            <input aria-label="Protection grace period" type="range" class="s-input" data-k="lowProtectGrace" min="0" max="60" step="1" value="${STATE.lowProtectGraces[field.id]}" style="width:100%;accent-color:var(--accent);cursor:pointer;margin-top:5px;">
            <div style="font-size:9px;color:#787878;margin-top:5px;">Value 0 = off. Grace is saved per condition. Position = score gap to TOP 1.</div>
        </div>`;
    }

    function render() {
        const contentArea = ui.querySelector('#scroll_area');
        if (contentArea) STATE.scrollPos = contentArea.scrollTop;
        let html = `
            <div id="close_btn" style="position:absolute; top:15px; right:20px; font-size:20px; color:#4b4b4b; cursor:pointer; font-weight:900; transition:0.2s;">X</div>
            <div style="font-size: 22px; font-weight: bold; text-align: center; margin-bottom: 20px; color: #fff; letter-spacing: 3px; text-transform: uppercase; text-shadow: 0 0 8px rgba(var(--accent-rgb), 0.45);">TURF MATCHMAKER</div>
            <div style="display:flex; gap:8px; margin-bottom:20px;">
                ${['match', 'extensions', 'settings'].map(t => `<div class="tab-btn" data-t="${t}" style="flex:1; padding:12px; text-align:center; cursor:pointer; background:${STATE.tab === t ? 'var(--grad)' : '#0a0a0a'}; color:${STATE.tab === t ? '#fff' : '#787878'}; border:1px solid ${STATE.tab === t ? 'var(--accent)' : '#212121'}; border-radius:4px; font-weight:bold; font-size:11px; transition:0.2s; letter-spacing:1px; text-transform:uppercase; box-shadow:${STATE.tab === t ? '0 2px 8px rgba(var(--accent-rgb), 0.35)' : 'none'};">${t.toUpperCase()}</div>`).join('')}
            </div>
            <div id="scroll_area" style="max-height:450px; overflow-y:auto; padding-right:8px;">
        `;

        if (STATE.tab === "match") {
            const filterToolStyle = "padding:5px 8px; background:#171717; color:#818181; border:1px solid #2d2d2d; border-radius:3px; font-family:'Aldrich'; font-size:9px; font-weight:bold; cursor:pointer; letter-spacing:0.3px; white-space:nowrap; transition:0.15s;";
            const selectedTargetMaps = sanitizeTargetHuntMaps(STATE.targetHuntMaps);
            const targetMapHuntSummary = selectedTargetMaps.length === 0
                ? "OFF"
                : (selectedTargetMaps.length === 1 ? selectedTargetMaps[0].toUpperCase() : `${selectedTargetMaps.length} MAPS`);
            const drawFilterTools = () => {
                const presetNames = Object.keys(STATE.filterPresets).sort((a, bValue) => a.localeCompare(bValue));
                return `
                    <div id="shared_filter_tools" style="display:flex; justify-content:flex-end; align-items:center; gap:4px; flex-wrap:wrap; margin:15px 0 4px;">
                        <button type="button" class="filter-tool-btn" data-action="turf-wars" style="${filterToolStyle}">TURF WARS</button>
                        <button type="button" class="filter-tool-btn" data-action="none" style="${filterToolStyle}">NONE</button>
                        <button type="button" class="filter-tool-btn" data-action="all" style="${filterToolStyle}">ALL</button>
                        <select id="filter_preset_select" class="filter-preset-select" style="${filterToolStyle} max-width:92px; outline:none;">
                            <option value="">SELECT</option>
                            ${presetNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}
                        </select>
                        <button type="button" class="filter-tool-btn" data-action="load" style="${filterToolStyle}">LOAD</button>
                        <button type="button" class="filter-tool-btn" data-action="save" style="${filterToolStyle}">SAVE</button>
                        <button type="button" class="filter-tool-btn" data-action="delete" style="${filterToolStyle}">DELETE</button>
                    </div>
                `;
            };
            const drawGrid = (title, list, key, fullNamesMap, cols = 4) => {
                html += `<div id="filter_group_${key}" style="position:relative;"><div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin:15px 0 8px; border-left:3px solid var(--accent); padding-left:6px;"><span style="font-size:11px; color:#b1b1b1; font-weight:bold; text-transform:uppercase; letter-spacing:1.5px; text-shadow:0 0 5px rgba(var(--accent-rgb),0.2); white-space:nowrap;">${title}</span></div><div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:6px;">`;
                for (let i = 0; i < list.length; i++) {
                    const val = list[i];
                    const active = STATE[key].includes(val);
                    const displayName = fullNamesMap && fullNamesMap[val] ? fullNamesMap[val] : val;
                    html += `<div class="m-select" data-key="${key}" data-val="${val}" style="padding:10px 2px; cursor:pointer; background:${active ? 'var(--grad)' : '#0a0a0a'}; color:${active ? '#fff' : '#606060'}; border: 1px solid ${active ? 'var(--accent)' : '#191919'}; border-radius:4px; font-size:10px; font-weight:bold; text-align:center; transition:0.1s; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; box-shadow:${active ? '0 2px 6px rgba(var(--accent-rgb),0.25)' : 'none'};" title="${displayName}">${displayName}</div>`;
                }
                html += `</div></div>`;
            };
            html += `
                <div style="background:#0a0a0a; padding:15px; border-radius:4px; border:1px solid #191919; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; font-weight:bold; color:#b1b1b1; letter-spacing: 0.5px;">SERVER BROWSER ON CANCEL</span>
                        ${toggleButton("toggle_browser_cancel", STATE.openServerBrowser, { labels: ["ENABLED", "DISABLED"] })}
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px; padding:10px; background:#0a0a0a; border:1px solid #191919; border-radius:4px;">
                    <div style="display:grid; grid-template-columns:1fr 1.12fr 1.18fr; gap:8px; width:100%;">
                        <button id="kb_btn" style="min-width:0; padding:8px 7px; white-space:nowrap; background:#171717; color:#fff; border:1px solid #2d2d2d; border-radius:4px; font-weight:bold; font-size:11px; cursor:pointer; transition:0.2s; font-family:'Aldrich';">SEARCH HOTKEY: ${STATE.keybind ? STATE.keybind.replace('Key', '').replace('Digit', '').toUpperCase() : 'NONE'}</button>
                        <button id="cancel_kb_btn" style="min-width:0; padding:8px 7px; white-space:nowrap; background:#171717; color:#fff; border:1px solid #2d2d2d; border-radius:4px; font-weight:bold; font-size:11px; cursor:pointer; transition:0.2s; font-family:'Aldrich';">CANCEL HOTKEY: ${STATE.cancelKeybind ? STATE.cancelKeybind.replace('Key', '').replace('Digit', '').toUpperCase() : 'NONE'}</button>
                        <button id="clear_kb_btn" style="min-width:0; padding:8px 7px; white-space:nowrap; background:#171717; color:#fff; border:1px solid #2d2d2d; border-radius:4px; font-weight:bold; font-size:11px; cursor:pointer; transition:0.2s; font-family:'Aldrich';">DISABLE SEARCH HOTKEY</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; border-top:1px solid #191919; padding-top:10px;">
                        <div>
                            <div style="font-size:11px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">DOUBLE-PRESS SEARCH HOTKEY</div>
                            <div style="font-size:9px; color:#787878; line-height:1.45; margin-top:5px;">Requires two presses within 1.5 seconds to prevent accidental client-triggered searches.</div>
                        </div>
                        ${toggleButton("toggle_double_press_search", STATE.doublePressSearchHotkey, { fixed: true })}
                    </div>
                </div>

                <div style="font-size:11px; color:#b1b1b1; margin:15px 0 8px; font-weight:bold; text-transform:uppercase; letter-spacing:1.5px; border-left:3px solid var(--accent); padding-left:6px; text-shadow: 0 0 5px rgba(var(--accent-rgb),0.2);">FILTERS</div>
                <div id="filter_options_box" style="background:#0a0a0a; padding:15px; border-radius:4px; border:1px solid #191919; display: flex; flex-direction: column; gap: 8px;">
                    <div id="filter_row_autojoin" style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; font-weight:bold; color:#b1b1b1; letter-spacing: 0.5px;">AUTO-JOIN BEST MATCH</span>
                        ${toggleButton("toggle_filter_autojoin", STATE.filterAutoJoin)}
                    </div>
                    ${renderSelectionOptions()}
                    <div id="filter_row_avoid_full" style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; font-weight:bold; color:#b1b1b1; letter-spacing: 0.5px;">AVOID LOBBIES WITH 1 SLOT LEFT</span>
                        ${toggleButton("toggle_filter_avoid_full", STATE.filterAvoidCloseToFull)}
                    </div>
                    <div id="filter_group_avoid_past">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:11px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">AVOID PAST LOBBIES</span>
                            ${toggleButton("toggle_filter_avoid_past", STATE.filterAvoidPastLobbies)}
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:10px; font-weight:bold; color:#787878; letter-spacing:0.5px; margin-top:10px;">
                            <span>LOBBIES TO REMEMBER - <span id="l_pastLobbyCount" style="color:var(--accent);">${STATE.pastLobbyCount}</span></span>
                        </div>
                        <input type="range" class="s-input" data-k="pastLobbyCount" min="1" max="10" step="1" value="${STATE.pastLobbyCount}" style="width:100%; accent-color:var(--accent); cursor:pointer; margin-top:5px;">
                    </div>
                    <div id="filter_row_priority_mode" style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; font-weight:bold; color:#b1b1b1; letter-spacing: 0.5px;">PRIORITIZE GAME TYPE</span>
                        <select id="priority_mode_sel" style="background:#171717; color:#fff; border:1px solid ${STATE.priorityMode ? 'var(--accent)' : '#2d2d2d'}; border-radius:4px; font-size:10px; font-weight:bold; padding:6px 8px; cursor:pointer; outline:none; font-family:'Aldrich'; text-transform:uppercase; max-width:170px;">
                            <option value="" ${STATE.priorityMode === '' ? 'selected' : ''}>NONE</option>
                            ${ALL_GAMEMODES.map(mode => `<option value="${escapeHtml(mode)}" ${STATE.priorityMode === mode ? 'selected' : ''}>${escapeHtml(mode)}</option>`).join('')}
                        </select>
                    </div>
                </div>
            `;

            html += drawFilterTools();
            drawGrid("REGIONS (NONE = ALL)", REGIONS, "regions", REGION_NAMES, 5);
            drawGrid("GAME MODES", ALL_GAMEMODES, "modes", null, 3);
            drawGrid("MAPS", MAPS, "maps", MAP_NAMES, 4);

            html += `
                <div id="filter_timing_automation" style="background:#0a0a0a; padding:20px; border-radius:4px; margin-top:25px; border:1px solid #191919;">
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div id="filter_label_min_players" style="display:flex; justify-content:space-between; font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">
                            <span>MIN PLAYERS - <span id="l_minPlayers" style="color:var(--accent); text-shadow:0 0 4px rgba(var(--accent-rgb),0.3);">${STATE.minPlayers}</span></span>
                        </div>
                        <input id="filter_input_min_players" type="range" class="s-input" data-k="minPlayers" min="0" max="7" value="${STATE.minPlayers}" style="width:100%; accent-color:var(--accent); cursor:pointer; margin-bottom: 4px;">

                        <div id="filter_label_max_players" style="display:flex; justify-content:space-between; font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">
                            <span>MAX PLAYERS - <span id="l_maxPlayers" style="color:var(--accent); text-shadow:0 0 4px rgba(var(--accent-rgb),0.3);">${STATE.maxPlayers}</span></span>
                        </div>
                        <input id="filter_input_max_players" type="range" class="s-input" data-k="maxPlayers" min="0" max="7" value="${STATE.maxPlayers}" style="width:100%; accent-color:var(--accent); cursor:pointer; margin-bottom: 4px;">

                        <div id="filter_label_min_time" style="display:flex; justify-content:space-between; font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">
                            <span>MIN MATCH REMAINING - <span id="l_minTime" style="color:var(--accent); text-shadow:0 0 4px rgba(var(--accent-rgb),0.3);">${STATE.minTime}</span>s</span>
                        </div>
                        <input id="filter_input_min_time" type="range" class="s-input" data-k="minTime" min="0" max="480" step="10" value="${STATE.minTime}" style="width:100%; accent-color:var(--accent); cursor:pointer; margin-bottom: 4px;">

                        <div id="filter_label_max_ping" style="display:flex; justify-content:space-between; font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">
                            <span>MAX SERVER PING - <span id="l_maxPing" style="color:var(--accent); text-shadow:0 0 4px rgba(var(--accent-rgb),0.3);">${STATE.maxPing}</span>ms</span>
                        </div>
                        <input id="filter_input_max_ping" type="range" class="s-input" data-k="maxPing" min="20" max="300" step="5" value="${STATE.maxPing}" style="width:100%; accent-color:var(--accent); cursor:pointer; margin-bottom: 4px;">

                        <div id="filter_row_server_hunting" style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                            <span style="font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">SERVER HUNTING</span>
                            ${toggleButton("toggle_server_hunting", STATE.serverHunting)}
                        </div>
                        <div id="filter_row_target_map_hunting" style="display:flex; justify-content:space-between; align-items:center; gap:16px;">
                            <div>
                                <div style="font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">TARGET MAP HUNTING</div>
                                <div style="font-size:9px; color:#787878; line-height:1.45; margin-top:5px;">Plays filler maps while hunting any selected Turf Wars map.</div>
                            </div>
                            <details id="target_map_hunt_dropdown" style="position:relative; flex:0 0 126px; background:#171717; border:1px solid ${selectedTargetMaps.length ? 'var(--accent)' : '#2d2d2d'}; border-radius:4px; font-family:'Aldrich'; opacity:${STATE.serverHunting ? '1' : '0.45'}; pointer-events:${STATE.serverHunting ? 'auto' : 'none'}; transition:0.15s;">
                                <summary id="target_map_hunt_summary" style="padding:7px 9px; color:${STATE.serverHunting ? '#fff' : '#656565'}; font-size:10px; font-weight:bold; text-align:center; cursor:${STATE.serverHunting ? 'pointer' : 'not-allowed'}; text-transform:uppercase; user-select:none;">${escapeHtml(targetMapHuntSummary)}</summary>
                                <div style="position:absolute; right:0; top:calc(100% + 5px); z-index:1002; width:168px; padding:5px; display:flex; flex-direction:column; gap:4px; background:#0b0b0b; border:1px solid #2d2d2d; border-radius:4px; box-shadow:0 10px 24px rgba(0,0,0,0.72);">
                                    ${TURF_WARS_MAPS.map(map => {
                                        const selected = selectedTargetMaps.includes(map);
                                        return `<button type="button" class="target-map-hunt-option" data-map="${escapeHtml(map)}" data-selected="${selected}" style="width:100%; padding:7px 8px; display:flex; align-items:center; gap:7px; background:${selected ? 'rgba(var(--accent-rgb),0.16)' : '#111'}; color:${selected ? '#fff' : '#777'}; border:1px solid ${selected ? 'var(--accent)' : '#222'}; border-radius:3px; font-family:'Aldrich'; font-size:9px; font-weight:bold; text-align:left; cursor:pointer; text-transform:uppercase; transition:0.12s;"><span class="target-map-hunt-check" style="color:var(--accent);">${selected ? '[X]' : '[ ]'}</span>${escapeHtml(MAP_NAMES[map] || map)}</button>`;
                                    }).join('')}
                                </div>
                            </details>
                        </div>
                        <div id="filter_row_auto_search" style="display:flex; justify-content:space-between; align-items:center; gap:16px;">
                            <div>
                                <div style="font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">AUTO SEARCH AFTER MATCH</div>
                                <div style="font-size:9px; color:#787878; line-height:1.45; margin-top:5px;">Starts a new filtered lobby search when the end-of-match screen appears after active play.</div>
                            </div>
                            ${toggleButton("toggle_auto_search_after_match", STATE.autoSearchAfterMatch, { fixed: true })}
                        </div>
                        <div id="filter_row_double_xp" style="display:flex; justify-content:space-between; align-items:center; gap:16px;">
                            <div>
                                <div style="font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">DOUBLE XP</div>
                                <div style="font-size:9px; color:#787878; line-height:1.45; margin-top:5px;">Claims Double XP, closes Nice after 1 second, then continues safely.</div>
                            </div>
                            ${toggleButton("toggle_double_xp_after_match", STATE.doubleXPAfterMatch, { fixed: true })}
                        </div>
                        <div id="filter_row_claim_rewards" style="display:flex; justify-content:space-between; align-items:center; gap:16px;">
                            <div>
                                <div style="font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">AUTO CLAIM REWARDS</div>
                                <div style="font-size:9px; color:#787878; line-height:1.45; margin-top:5px;">Collects match rewards and waits 3 seconds before continuing.</div>
                            </div>
                            ${toggleButton("toggle_auto_claim_rewards", STATE.autoClaimRewards, { fixed: true })}
                        </div>
                        <div id="filter_row_compact_status" style="display:flex; justify-content:space-between; align-items:center; gap:16px;">
                            <div>
                                <div style="font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">COMPACT SEARCH STATUS</div>
                                <div style="font-size:9px; color:#787878; line-height:1.45; margin-top:5px;">Shows Scanning Lobbies and Hunting above the connection notification.</div>
                            </div>
                            ${toggleButton("toggle_compact_search_status", STATE.compactSearchStatus, { fixed: true })}
                        </div>
                    </div>
                </div>

                <div style="font-size:11px; color:#b1b1b1; margin:18px 0 10px; font-weight:bold; text-transform:uppercase; letter-spacing:1.5px; border-left:3px solid var(--accent); padding-left:6px; text-shadow:0 0 5px rgba(var(--accent-rgb),0.2);">PLAYER COUNT</div>
                <div style="background:#0a0a0a; padding:20px; border-radius:4px; border:1px solid #191919; display:flex; flex-direction:column; gap:12px;">
                    <div style="font-size:12px; color:#ff3b3b; font-weight:bold; letter-spacing:0.5px; line-height:1.55;">! MATCHMAKER PLAYER COUNT INCLUDES ACTIVE PLAYERS, SPECTATORS, AND OTHER CONNECTED SESSIONS. IT MAY DIFFER FROM THE LIVE PLAYER LIST !</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; ">
                        <div>
                            <div style="font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">FORCE PLAYER COUNT</div>
                            <div style="font-size:9px; color:#787878; line-height:1.45; margin-top:5px;">Checks Min/Max once after a matchmaker join. Excludes you.</div>
                        </div>
                        ${toggleButton("toggle_force_player_count", STATE.forcePlayerCount, { fixed: true })}
                    </div>
                    <div role="separator" style="width:100%;border-top:1px solid #191919;"></div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; ">
                        <div>
                            <div style="font-size:12px; font-weight:bold; color:#b1b1b1; letter-spacing:0.5px;">LOW PLAYER COUNT</div>
                            <div style="font-size:9px; color:#787878; line-height:1.45; margin-top:5px;">Finds another lobby if the count stays below your limit for the set time. FFA: other players. TDM: enemies only.</div>
                        </div>
                        ${toggleButton("toggle_low_player_count", STATE.lowPlayerCountEnabled, { fixed: true })}
                    </div>
                    <div style="opacity:${STATE.lowPlayerCountEnabled ? 1 : 0.5};">
                        <label style="display:flex; justify-content:space-between; font-size:10px; font-weight:bold; color:#787878; letter-spacing:0.5px; margin-top:10px;"><span>MINIMUM OPPONENTS - <span id="l_lowPlayerMinimum" style="color:var(--accent);">${STATE.lowPlayerMinimum}</span></span></label>
                        <input aria-label="Low player minimum" type="range" class="s-input" data-k="lowPlayerMinimum" min="1" max="8" step="1" value="${STATE.lowPlayerMinimum}" style="width:100%; accent-color:var(--accent); cursor:pointer; margin-top:5px;">
                        <label style="display:flex; justify-content:space-between; font-size:10px; font-weight:bold; color:#787878; letter-spacing:0.5px; margin-top:10px;"><span>WAIT TIME - <span id="l_lowPlayerWaitSeconds" style="color:var(--accent);">${STATE.lowPlayerWaitSeconds}</span> s</span></label>
                        <input aria-label="Low player wait time" type="range" class="s-input" data-k="lowPlayerWaitSeconds" min="5" max="60" step="1" value="${STATE.lowPlayerWaitSeconds}" style="width:100%; accent-color:var(--accent); cursor:pointer; margin-top:5px;">
                        ${renderLowPlayerProtection()}
                    </div>
                </div>
                ${renderPlayerList("playerBlacklist", "PLAYER BLACKLIST", "Finds another lobby when a listed player is present.")}
                ${renderPlayerList("playerWhitelist", "PLAYER WHITELIST", "Pauses automatic lobby changes while a listed player is present. Manual search wins.")}
                <button id="find_btn" style="width:100%; padding:18px; margin-top:20px; background:var(--grad); color:#fff; border:none; border-radius:4px; font-weight:bold; font-size:17px; cursor:pointer; transition:0.2s; font-family:'Aldrich'; text-transform:uppercase; letter-spacing:2px; box-shadow: inset 0 -4px 0 var(--accent-dark), 0 4px 15px rgba(var(--accent-rgb),0.35);">FIND GAME</button>
            `;
        } else if (STATE.tab === "extensions") {
            html += `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; padding:10px 0;">
                    <div style="background:#0a0a0a; border:1px solid #191919; border-radius:4px; padding:22px 16px; text-align:center;">
                        <div style="font-size:12px; color:#b1b1b1; font-weight:bold; letter-spacing:1px; margin-bottom:16px;">CSS</div>
                        <button id="load_css_btn" style="width:100%; padding:16px 10px; background:var(--grad); color:#fff; border:none; border-radius:4px; font-weight:bold; font-size:13px; cursor:pointer; font-family:'Aldrich'; text-transform:uppercase; letter-spacing:1px; box-shadow:inset 0 -4px 0 var(--accent-dark), 0 4px 15px rgba(var(--accent-rgb),0.35); transition:0.2s;">SELECT CSS FILE</button>
                        <div style="margin-top:18px; font-size:11px; color:#6c6c6c; text-transform:uppercase;">Status: ${STATE.css ? '<span style="color:#00c853;">Active</span>' : 'Not Loaded'}</div>
                        ${STATE.css ? `<div style="margin-top:12px;"><button id="clear_css_btn" style="background:transparent; color:#ff4444; border:none; cursor:pointer; font-size:11px; font-weight:bold; text-decoration:underline;">CLEAR SAVED CSS</button></div>` : ''}
                    </div>
                    <div style="background:#0a0a0a; border:1px solid #191919; border-radius:4px; padding:22px 16px; text-align:center;">
                        <div style="font-size:12px; color:#b1b1b1; font-weight:bold; letter-spacing:1px; margin-bottom:16px;">JAVASCRIPT</div>
                        <button id="load_script_btn" style="width:100%; padding:16px 10px; background:var(--grad); color:#fff; border:none; border-radius:4px; font-weight:bold; font-size:13px; cursor:pointer; font-family:'Aldrich'; text-transform:uppercase; letter-spacing:1px; box-shadow:inset 0 -4px 0 var(--accent-dark), 0 4px 15px rgba(var(--accent-rgb),0.35); transition:0.2s;">SELECT JS FILE</button>
                        <div style="margin-top:18px; font-size:11px; color:#6c6c6c; text-transform:uppercase;">Status: ${STATE.script ? '<span style="color:#00c853;">Active</span>' : 'Not Loaded'}</div>
                        ${STATE.script ? `<div style="margin-top:12px;"><button id="clear_script_btn" style="background:transparent; color:#ff4444; border:none; cursor:pointer; font-size:11px; font-weight:bold; text-decoration:underline;">CLEAR SAVED JS</button></div>` : ''}
                        <div style="margin-top:12px; font-size:9px; color:#787878; line-height:1.45;">Runs with full page access every time Krunker loads. Only load files you trust. Clearing takes effect after a reload.</div>
                    </div>
                </div>
            `;
        } else if (STATE.tab === "settings") {
            const c1 = STATE.gradColor1, c2 = STATE.gradColor2;
            const colorField = (id, label, rawValue) => {
                const val = escapeHtml(String(rawValue));
                return `
                <div style="flex:1;">
                    <div style="font-size:9px; color:#787878; font-weight:bold; margin-bottom:4px; letter-spacing:0.5px;">${label}</div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <input type="color" id="${id}_picker" value="${val}" style="width:42px; height:34px; background:none; border:1px solid #2d2d2d; border-radius:4px; cursor:pointer; padding:2px;">
                        <input type="text" id="${id}_hex" value="${val}" maxlength="7" spellcheck="false" style="flex:1; min-width:0; box-sizing:border-box; background:#171717; color:#fff; border:1px solid #2d2d2d; border-radius:4px; font-size:12px; padding:8px; font-family:'Aldrich'; letter-spacing:1px; text-transform:uppercase; outline:none;">
                    </div>
                </div>
            `;
            };
            html += `
                <div style="font-size:11px;color:#b1b1b1;margin:5px 0 10px;font-weight:bold;letter-spacing:1.5px;border-left:3px solid var(--accent);padding-left:6px;">SCRIPT UPDATES</div>
                <div style="background:#0a0a0a;padding:18px;border-radius:4px;border:1px solid #191919;margin-bottom:18px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;">
                        <div><div style="font-size:12px;font-weight:bold;color:#b1b1b1;letter-spacing:0.5px;">AUTOMATIC UPDATES</div>
                        <div style="font-size:9px;color:#787878;line-height:1.45;margin-top:5px;">Kute script-manager support required. Downloads only from this project's release tags. Never reloads a match.</div></div>
                        ${toggleButton("toggle_automatic_updates", STATE.automaticUpdates, {fixed:true})}
                    </div>
                    <div id="turf_update_status" role="status" style="font-size:10px;color:#999;line-height:1.5;margin-top:12px;">${escapeHtml(updateStatus)}</div>
                    <button id="check_updates_btn" type="button" style="width:100%;margin-top:12px;padding:8px;background:#171717;color:#fff;border:1px solid var(--accent);border-radius:4px;font:bold 11px Aldrich;cursor:pointer;">CHECK FOR UPDATES</button>
                </div>
                <div style="font-size:11px; color:#b1b1b1; margin:5px 0 10px; font-weight:bold; text-transform:uppercase; letter-spacing:1.5px; border-left:3px solid var(--accent); padding-left:6px; text-shadow: 0 0 5px rgba(var(--accent-rgb),0.2);">GUI GRADIENT</div>
                <div style="background:#0a0a0a; padding:18px; border-radius:4px; border:1px solid #191919; display:flex; flex-direction:column; gap:16px;">
                    <div style="height:34px; border-radius:4px; background:var(--grad); border:1px solid #2d2d2d;"></div>
                    <div style="display:flex; gap:12px;">
                        ${colorField('grad1', 'COLOR 1 (START)', c1)}
                        ${colorField('grad2', 'COLOR 2 (END)', c2)}
                    </div>
                    <div style="font-size:9px; color:#4b4b4b; letter-spacing:0.5px;">Middle stop is auto-interpolated between the two colours.</div>
                    <div>
                        <div style="font-size:9px; color:#787878; font-weight:bold; margin-bottom:8px; letter-spacing:0.5px;">PRESETS</div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            ${GRAD_PRESETS.map((p, idx) => `<div class="grad-preset" data-i="${idx}" title="${p[0]} → ${p[1]}" style="width:46px; height:28px; border-radius:4px; cursor:pointer; background:linear-gradient(135deg, ${p[0]} 0%, ${p[1]} 100%); border:2px solid ${p[0].toLowerCase() === c1.toLowerCase() && p[1].toLowerCase() === c2.toLowerCase() ? '#fff' : 'rgba(255,255,255,0.15)'}; transition:0.15s;"></div>`).join('')}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid #191919; padding-top:14px;">
                        <span style="font-size:10px; color:#4b4b4b;">Live preview applies instantly.</span>
                        <button id="reset_grad_btn" style="padding:8px 16px; background:transparent; color:#787878; border:1px solid #2d2d2d; border-radius:4px; font-weight:bold; font-size:10px; cursor:pointer; text-transform:uppercase; letter-spacing:0.5px; font-family:'Aldrich';">RESET TO DEFAULT</button>
                    </div>
                </div>

                <div style="font-size:11px; color:#b1b1b1; margin:18px 0 10px; font-weight:bold; text-transform:uppercase; letter-spacing:1.5px; border-left:3px solid var(--accent); padding-left:6px; text-shadow: 0 0 5px rgba(var(--accent-rgb),0.2);">DISPLAY</div>
                <div style="background:#0a0a0a; padding:15px; border-radius:4px; border:1px solid #191919; display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; font-weight:bold; color:#b1b1b1; letter-spacing: 0.5px;">GRADIENT (OFF = COLOR 1 ONLY)</span>
                        ${toggleButton("toggle_gradient", STATE.gradientEnabled)}
                    </div>
                </div>

                ${renderNotificationSettings("", "CONNECTION NOTIFICATION", STATE.toastColor, STATE.toastOffsetX, STATE.toastOffsetY)}

                ${renderNotificationSettings("search", "SEARCHING NOTIFICATION", STATE.searchToastColor, STATE.searchToastOffsetX, STATE.searchToastOffsetY)}
                ${renderNotificationSettings("recovery", "LOBBY REJECTION NOTIFICATION", STATE.recoveryToastColor, STATE.recoveryToastOffsetX, STATE.recoveryToastOffsetY)}
            `;
        }

        html += `</div>`;
        ui.innerHTML = html;
        if (STATE.tab === "match") mergeMatchFilterBoxes();
        const nextContentArea = ui.querySelector("#scroll_area");
        if (nextContentArea) nextContentArea.scrollTop = STATE.scrollPos;
        ui.querySelector("#close_btn").onclick = () => toggleUI(false);
    }

    // Read a local extension file and apply its text after persisting it.
    function loadExtensionFile(accept, stateKey, apply) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.onchange = event => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = loadEvent => {
                STATE[stateKey] = String(loadEvent.target?.result ?? "");
                saveState();
                apply(STATE[stateKey]);
                render();
            };
            reader.readAsText(file);
        };
        input.click();
    }

    function loadCSSFile() {
        loadExtensionFile(".css", "css", applyCSS);
    }

    function loadScriptFile() {
        loadExtensionFile(".js", "script", applyScript);
    }

    window.addEventListener("mousedown", (e) => {
        if (STATE.visible && !ui.contains(e.target) && !mBtn.contains(e.target)) toggleUI(false);
    });

    // Accept only trusted, unmodified hotkeys outside editable controls.
    function hasShortcutModifiers(e) {
        return e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
    }

    function isModifierCode(code) {
        return ["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"].includes(code);
    }

    function isEditableTarget(target, event) {
        const elements = [target, document.activeElement, ...(event?.composedPath?.() || [])];
        let active = document.activeElement;
        while (active?.shadowRoot?.activeElement) {
            active = active.shadowRoot.activeElement;
            elements.push(active);
        }
        return elements.some(element => element instanceof Element && (element.isContentEditable
            || element.closest('input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])')));
    }

    // Normalize function keys across Chromium and embedded-client keyboard events.
    function getHotkeyCode(event) {
        const code = typeof event.code === "string" ? event.code.trim() : "";
        const key = typeof event.key === "string" ? event.key.trim() : "";
        const legacyCode = Number(event.keyCode || event.which);
        const isFunctionKey = value => /^F(?:[1-9]|1[0-9]|2[0-4])$/i.test(value);
        const legacyFunctionKey = legacyCode >= 112 && legacyCode <= 135 ? `F${legacyCode - 111}` : "";
        const identities = [code, key, legacyFunctionKey]
            .filter(isFunctionKey).map(value => value.toUpperCase());
        if (new Set(identities).size > 1) return "";
        // KUTE sends in-game left clicks as F20 with a scan code taken from the cursor Y position,
        // so a named function key must agree with the physical code.
        const namedFunctionKey = isFunctionKey(key) ? key.toUpperCase() : legacyFunctionKey;
        if (namedFunctionKey && code && code !== "Unidentified" && code.toUpperCase() !== namedFunctionKey) return "";
        if (code && code !== "Unidentified") return code;
        if (/^F(?:[1-9]|1[0-2])$/i.test(key)) return key.toUpperCase();
        if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
        if (/^[0-9]$/.test(key)) return `Digit${key}`;
        if (legacyCode >= 112 && legacyCode <= 123) return `F${legacyCode - 111}`;
        return key;
    }

    function stopHandledKey(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    const DOUBLE_PRESS_SEARCH_WINDOW_MS = 1500;
    // Held keys refresh on every auto-repeat; a lost keyup expires instead of blocking the key forever.
    const HELD_HOTKEY_TIMEOUT_MS = 1500;
    const heldHotkeys = new Map();
    let inputComposing = false;
    let pendingSearchHotkeyCode = "";
    let pendingSearchHotkeyUntil = 0;
    let pendingSearchHotkeyTimer = null;

    function clearPendingSearchHotkey() {
        if (pendingSearchHotkeyTimer) clearTimeout(pendingSearchHotkeyTimer);
        pendingSearchHotkeyTimer = null;
        pendingSearchHotkeyCode = "";
        pendingSearchHotkeyUntil = 0;
    }

    // Focus loss invalidates armed actions, but a held key stays latched until a trusted release.
    function resetInputSequence() {
        clearPendingSearchHotkey();
        inputComposing = false;
        if (cancelBindingModes() && STATE.visible) render();
    }

    function isInputContextActive() {
        return document.visibilityState !== "hidden" && document.hasFocus();
    }

    function acceptActivationClick(event, reason) {
        if (!event.isTrusted || !isInputContextActive() || document.pointerLockElement) {
            recordRuntimeAction("input-blocked", `${reason}-untrusted-or-inactive`);
            return false;
        }
        return true;
    }

    // Require two intentional presses inside the configured safety window when enabled.
    function requestSearchFromHotkey(reason) {
        if (!STATE.doublePressSearchHotkey) {
            clearPendingSearchHotkey();
            triggerMatchmaker(reason);
            return true;
        }
        const now = Date.now();
        if (pendingSearchHotkeyCode === STATE.keybind && now <= pendingSearchHotkeyUntil) {
            clearPendingSearchHotkey();
            triggerMatchmaker(reason);
            return true;
        }
        clearPendingSearchHotkey();
        pendingSearchHotkeyCode = STATE.keybind;
        pendingSearchHotkeyUntil = now + DOUBLE_PRESS_SEARCH_WINDOW_MS;
        pendingSearchHotkeyTimer = setTimeout(clearPendingSearchHotkey, DOUBLE_PRESS_SEARCH_WINDOW_MS);
        return false;
    }

    // Leave native Glorp lobby shortcuts to the host instead of handling them twice.
    function isGlorpReservedHotkey(code) {
        const glorpDetected = Object.prototype.hasOwnProperty.call(window, "glorp");
        return glorpDetected && (code === "F4" || code === "F6");
    }

    function handleGlobalKeydown(e) {
        const eventCode = getHotkeyCode(e);
        const searchIsActive = overlay.classList.contains("searching");
        const binding = STATE.binding || STATE.bindingCancel;
        const relevant = binding || (STATE.keybind && eventCode === STATE.keybind)
            || (searchIsActive && (eventCode === STATE.cancelKeybind || eventCode === "Escape"));
        if (!e.isTrusted || !eventCode) return;
        if (!relevant) {
            clearPendingSearchHotkey();
            return;
        }
        // Do not trust the host's repeat flag alone: some embedded clients omit it.
        const now = Date.now();
        const heldSince = heldHotkeys.get(eventCode);
        if (e.repeat || (heldSince !== undefined && now - heldSince < HELD_HOTKEY_TIMEOUT_MS)) {
            heldHotkeys.set(eventCode, now);
            if (isInputContextActive() && !hasShortcutModifiers(e) && !isEditableTarget(e.target, e)) stopHandledKey(e);
            recordRuntimeAction("input-blocked", "held-key");
            return;
        }
        heldHotkeys.set(eventCode, now);
        if (!isInputContextActive() || e.isComposing || inputComposing || e.defaultPrevented
            || hasShortcutModifiers(e) || isModifierCode(eventCode) || isEditableTarget(e.target, e)) {
            clearPendingSearchHotkey();
            recordRuntimeAction("input-blocked", "inactive-or-editing");
            return;
        }
        if (isGlorpReservedHotkey(eventCode)) {
            clearPendingSearchHotkey();
            recordRuntimeAction("input-blocked", "glorp-native-shortcut");
            return;
        }

        if (STATE.binding) {
            if (eventCode === "Escape") {
                stopHandledKey(e);
                cancelBindingModes();
                render();
                return;
            }
            stopHandledKey(e);
            STATE.keybind = eventCode;
            STATE.binding = false;
            clearPendingSearchHotkey();
            saveState();
            render();
            return;
        }
        if (STATE.bindingCancel) {
            if (eventCode === "Escape") {
                stopHandledKey(e);
                cancelBindingModes();
                render();
                return;
            }
            stopHandledKey(e);
            STATE.cancelKeybind = eventCode;
            STATE.bindingCancel = false;
            clearPendingSearchHotkey();
            saveState();
            render();
            return;
        }

        const cancelingSearch = searchIsActive
            && (eventCode === STATE.cancelKeybind || eventCode === "Escape");
        if (cancelingSearch) {
            handleHUDKeys(e, eventCode);
            return;
        }

        if (STATE.keybind && eventCode === STATE.keybind) {
            stopHandledKey(e);
            if (searchIsActive && activeSearchOptions.purpose !== "target") return;
            if (searchIsActive) replaceActiveSearch();
            requestSearchFromHotkey("hotkey");
        }
    }

    window.addEventListener("keydown", handleGlobalKeydown, true);
    // Releases only clear the latch; orphan keyups never invoke any action.
    window.addEventListener("keyup", event => {
        if (event.isTrusted) heldHotkeys.delete(getHotkeyCode(event));
    }, true);
    window.addEventListener("blur", resetInputSequence);
    window.addEventListener("pagehide", resetInputSequence);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") resetInputSequence();
    });
    document.addEventListener("compositionstart", () => { inputComposing = true; clearPendingSearchHotkey(); }, true);
    document.addEventListener("compositionend", () => { inputComposing = false; }, true);

    // Reuse stable game elements while replacing stale references after UI rebuilds.
    let lastIsIngame = null;
    const elementCache = {};
    const getEl = id => {
        const cached = elementCache[id];
        if (cached?.isConnected) return cached;
        elementCache[id] = document.getElementById(id);
        return elementCache[id];
    };

    let pendingRelaunchTimer = null;
    let forcePlayerCountChecked = false;
    let forcePlayerCountGraceStartedAt = null;
    const FORCE_PLAYER_COUNT_GRACE_MS = 5000;
    let autoNextMatchArmed = false;
    let lastEndScreenVisible = false;
    let endOfMatchActionRunning = false;
    let targetHuntStartedForGameID = "";
    let targetHuntStartTimer = null;
    let targetHuntDiscoveryPromise = null;
    let targetHuntDiscoveryGameID = "";
    let targetHuntDiscoveryRetryAt = 0;
    const TARGET_HUNT_START_DELAY_MS = 500;
    const TARGET_HUNT_DISCOVERY_RETRY_MS = 10000;
    const DOUBLE_XP_BUTTON_WAIT_MS = 6000;
    const DOUBLE_XP_NICE_CLICK_DELAY_MS = 1000;
    const DOUBLE_XP_POST_CLICK_WAIT_MS = 3000;
    const CLAIM_REWARDS_BUTTON_WAIT_MS = 6000;
    const CLAIM_REWARDS_POST_CLICK_WAIT_MS = 3000;

    // Retry saved fallbacks before requesting another global lobby snapshot.
    async function resumeCandidateQueue(queue) {
        stopMatchmakerWork();
        activeSearchOptions = normalizeSearchOptions(queue?.searchOptions || getRetrySearchOptions());
        searchCanceled = false;
        searchRunId += 1;
        const runId = searchRunId;
        showSearchHUD(activeSearchOptions);
        const filters = buildFilterContext(activeSearchOptions);
        const joined = await joinFirstValidCandidate(queue.candidates, queue.pings, filters, runId, false);
        if (!joined && isSearchActive(runId)) {
            joinTemporaryLobby(readJoinRecovery() || { fullCount: 0, rejected: [], options: activeSearchOptions });
        }
    }

    // Continue matchmaking from saved candidates without rendering a transient notice.
    function relaunchMatchmaker(reason, queue = null) {
        if (queue?.candidates?.length) {
            void resumeCandidateQueue(queue);
        } else if (String(reason).startsWith("game-error-")) {
            joinTemporaryLobby(readJoinRecovery() || { fullCount: 0, rejected: [], options: getRetrySearchOptions() });
        } else {
            triggerMatchmaker(reason, readJoinRecovery()?.options || getRetrySearchOptions());
        }
    }

    function showRecoveryAndRelaunch(message, reason, queue = null) {
        if (pendingRelaunchTimer) return;
        queueRecoveryToast(message);
        showRecoveryToast(message);
        relaunchMatchmaker(reason, queue);
        pendingRelaunchTimer = setTimeout(() => {
            pendingRelaunchTimer = null;
        }, 1500);
    }

    // A joined lobby is ready once play has started or Krunker offers Click to Play.
    function isLobbyReady(isIngame) {
        if (isIngame) return true;
        const instructions = getEl("instructions");
        return document.readyState === "complete" && isElementActuallyVisible(instructions)
            && /click\s+to\s+play/i.test(instructions.textContent || "");
    }

    // Enforce the client roster once within 5 seconds of lobby readiness.
    function checkForcedPlayerCount(isIngame) {
        if (!STATE.forcePlayerCount || forcePlayerCountChecked || pendingRelaunchTimer || overlay.classList.contains("searching")) return false;
        const marker = getValidJoinMarker();
        if (!marker) return false;
        const ready = isLobbyReady(isIngame);
        if (forcePlayerCountGraceStartedAt === null) {
            if (!ready && readVisibleForcedPlayerCount() === null) return false;
            forcePlayerCountGraceStartedAt = Date.now();
            forcedLocalCountSample = null;
        }
        if (Date.now() - forcePlayerCountGraceStartedAt > FORCE_PLAYER_COUNT_GRACE_MS) {
            forcePlayerCountChecked = true;
            return false;
        }
        let playerCount = ready ? readLocalForcedPlayerCount() : null;
        if (playerCount !== null) {
            // Avoid accepting an initial partial roster immediately at connection time.
            if (!forcedLocalCountSample || forcedLocalCountSample.count !== playerCount) {
                forcedLocalCountSample = { count: playerCount, since: Date.now() };
                return false;
            }
            if (Date.now() - forcedLocalCountSample.since < 750) return false;
        } else {
            forcedLocalCountSample = null;
            playerCount = readVisibleForcedPlayerCount();
        }
        if (playerCount === null) return false;
        playerCount = Math.max(0, playerCount - 1);
        forcePlayerCountChecked = true;
        const minPlayers = Number(STATE.minPlayers);
        const maxPlayers = Number(STATE.maxPlayers);
        if (playerCount >= minPlayers && playerCount <= maxPlayers) return false;

        const queue = takeValidCandidateQueue();
        clearJoinMarker();
        const message = playerCount < minPlayers ? "TOO FEW PLAYERS" : "TOO MANY PLAYERS";
        showRecoveryAndRelaunch(message, "force-player-count", queue);
        return true;
    }

    // Continuous monitoring is opt-in and separate from the one-shot join check.
    let lowPlayerMonitor = null;
    let lowPlayerRosterBoundary = null;

    function readRoundProtectionStats() {
        const result = { kills: null, kdr: null, time: null, gap: null };
        try {
            const time = window.getGameActivity?.()?.time;
            if (typeof time === 'number' && Number.isFinite(time) && time >= 0) result.time = time;
        } catch { /* Unknown stats must not be interpreted as zero. */ }
        const root = getEl('centerLeaderDisplay');
        const own = root?.querySelectorAll('.newLeaderNameM');
        if (own?.length !== 1) return result;
        const number = cell => /^\d+$/.test(cell?.textContent.trim() || '') ? Number(cell.textContent.trim()) : null;
        const readRow = label => {
            const row = label.closest('tr');
            const table = row?.closest('table');
            const headers = [...(table?.querySelectorAll('th') || [])].map(cell => cell.textContent.trim().toLowerCase());
            const read = key => {
                const index = headers.indexOf(key);
                return index >= 0 ? number(row?.cells[index]) : null;
            };
            return { score: read('score'), kills: read('kills'), deaths: read('deaths') };
        };
        const stats = readRow(own[0]);
        result.kills = stats.kills;
        if (stats.kills !== null && stats.deaths !== null) result.kdr = stats.kills / Math.max(1, stats.deaths);
        const labels = [...root.querySelectorAll('.newLeaderName, .newLeaderNameM, .newLeaderNameF')];
        const scores = labels.map(label => readRow(label).score);
        if (stats.score !== null && labels.length === readLocalForcedPlayerCount() && scores.every(score => score !== null)) {
            result.gap = Math.max(0, Math.max(...scores) - stats.score);
        }
        return result;
    }

    function lowPlayerProtectionHolds(monitor, now, enoughPlayers) {
        const stats = readRoundProtectionStats();
        const compare = (key, value, threshold) => {
            switch (STATE.lowProtectOperators[key]) {
                case 'eq': return value === threshold;
                case 'ne': return value !== threshold;
                case 'gt': return value > threshold;
                case 'lt': return value < threshold;
                case 'ge': return value >= threshold;
                case 'le': return value <= threshold;
                default: return false;
            }
        };
        const conditions = [
            ['kills', STATE.lowProtectKills, stats.kills, value => compare('kills', value, STATE.lowProtectKillsMin), STATE.lowProtectGraces.kills],
            ['kdr', STATE.lowProtectKdr, stats.kdr, value => compare('kdr', value, STATE.lowProtectKdrMin), STATE.lowProtectGraces.kdr],
            ['time', STATE.lowProtectTime, stats.time, value => compare('time', value, STATE.lowProtectTimeMax), STATE.lowProtectGraces.time],
            ['position', STATE.lowProtectPosition, stats.gap, value => compare('position', value, STATE.lowProtectScoreGap), STATE.lowProtectGraces.position]
        ];
        monitor.protection ||= {};
        let held = false;
        for (const [key, enabled, value, meets, grace] of conditions) {
            if (!enabled) { delete monitor.protection[key]; continue; }
            const state = monitor.protection[key] ||= { active: false, lostAt: null };
            if (enoughPlayers) state.lostAt = null;
            if (value === null) {
                // Missing samples do not establish when a condition was lost.
                if (state.lostAt !== null) state.lostAt = now;
                held = true;
            } else if (meets(value)) {
                state.active = true; state.lostAt = null; held = true;
            } else {
                if (state.active) { state.active = false; state.lostAt = enoughPlayers ? null : now; }
                if (state.lostAt !== null && now - state.lostAt < grace * 1000) held = true;
            }
        }
        return held;
    }

    function cancelProtectedLowPlayerSearch() {
        if (!activeSearchOptions.lowPlayerGuard || activeSearchOptions.manual || getVisibleConnectionError()) return false;
        if (!lowPlayerMonitor) return false;
        const count = readOpponentPlayerCount();
        const enough = count !== null && count >= STATE.lowPlayerMinimum;
        if (!enough && !lowPlayerProtectionHolds(lowPlayerMonitor, Date.now(), enough)) return false;
        replaceActiveSearch();
        lowPlayerMonitor.fired = false;
        lowPlayerMonitor.since = null;
        return true;
    }

    function checkLowPlayerCount(isIngame, endScreenVisible) {
        const game = new URLSearchParams(window.location.search).get("game");
        if (!STATE.lowPlayerCountEnabled || !game) { lowPlayerMonitor = null; return false; }
        const scoreboard = document.getElementById("centerLeaderDisplay");
        const roster = scoreboard ? { root: scoreboard, self: scoreboard.querySelector('.newLeaderNameM'), text: scoreboard.textContent } : null;
        if (endScreenVisible || endOfMatchActionRunning) {
            lowPlayerRosterBoundary = roster;
            lowPlayerMonitor = null;
            return false;
        }
        let mode = "";
        try { mode = String(window.getGameActivity?.()?.mode || ""); } catch (_) { /* unavailable */ }
        const protectionSettings = [STATE.lowProtectKills, STATE.lowProtectKdr, STATE.lowProtectTime, STATE.lowProtectPosition,
            STATE.lowProtectKillsMin, STATE.lowProtectKdrMin, STATE.lowProtectTimeMax, STATE.lowProtectScoreGap, STATE.lowProtectGraces, STATE.lowProtectOperators];
        const key = `${game}|${mode}|${STATE.lowPlayerMinimum}|${STATE.lowPlayerWaitSeconds}|${JSON.stringify(protectionSettings)}`;
        if (lowPlayerMonitor?.key !== key) {
            lowPlayerRosterBoundary = lowPlayerMonitor?.roster ?? lowPlayerRosterBoundary;
            lowPlayerMonitor = { key, since: null, last: null, fired: false, roster: null };
        }
        const monitor = lowPlayerMonitor;
        monitor.roster = roster;
        if (monitor.fired) return false;
        if (endScreenVisible || endOfMatchActionRunning || pendingRelaunchTimer || pendingJoinGameID
            || overlay.classList.contains("searching") || readJoinRecovery()?.temporary || !isLobbyReady(isIngame)) {
            monitor.since = null; monitor.last = null;
            lowPlayerRosterBoundary = roster;
            return false;
        }
        const now = Date.now();
        if (monitor.last !== null && now - monitor.last < 1000) return false;
        // Missing observations during a background freeze do not prove continuous low population.
        if (monitor.last !== null && (now - monitor.last > 2500 || now < monitor.last)) monitor.since = null;
        monitor.last = now;
        let count = readOpponentPlayerCount();
        const normalizedMode = mode.trim().toLowerCase();
        if (normalizedMode === "team deathmatch" || normalizedMode === "tdm") {
            // Do not reuse the old round/lobby's hidden DOM until the game updates it.
            const unchanged = roster && lowPlayerRosterBoundary
                && roster.root === lowPlayerRosterBoundary.root
                && roster.self === lowPlayerRosterBoundary.self
                && roster.text === lowPlayerRosterBoundary.text;
            if (unchanged && !isElementActuallyVisible(scoreboard)) count = null;
            else lowPlayerRosterBoundary = null;
        }
        const protectedRound = protectionSettings.slice(0, 4).some(Boolean)
            && lowPlayerProtectionHolds(monitor, now, count !== null && count >= STATE.lowPlayerMinimum);
        if (count === null || count >= STATE.lowPlayerMinimum) { monitor.since = null; return false; }
        if (monitor.since === null) monitor.since = now;
        if (protectedRound) return false;
        if (now - monitor.since < STATE.lowPlayerWaitSeconds * 1000) return false;
        monitor.fired = true;
        showRecoveryToast(normalizedMode === "team deathmatch" || normalizedMode === "tdm"
            ? "TOO FEW OPPONENTS" : "TOO FEW PLAYERS");
        // Background mode keeps the game playable and automatically joins a filtered match.
        void triggerMatchmaker("low-player-count", { background: true, lowPlayerGuard: true });
        return true;
    }

    // Relax only map/count constraints for a playable temporary lobby.
    function quickFallbackFilters(filters) {
        return { ...filters, maps: null, minPlayers: 1, maxPlayers: Infinity, avoidCloseToFull: false };
    }

    function storeQuickFallbackPool(games, pings, filters) {
        const relaxed = quickFallbackFilters(filters);
        const candidates = games.filter(game => passesHardFilters(game, relaxed)
            && !softFilterFailures(game, pings, relaxed).length);
        candidates.sort((a, b) => Number(!passesHardFilters(a, filters)) - Number(!passesHardFilters(b, filters))
            || softFilterFailures(a, pings, filters).length - softFilterFailures(b, pings, filters).length);
        writeSessionJSON(QUICK_FALLBACK_KEY, { createdAt: Date.now(), candidates: candidates.slice(0, 8), pings });
    }

    async function findQuickFallback(options) {
        if (Date.now() < matchmakerBackoffUntil) return null;
        try {
            const pool = JSON.parse(sessionStorage.getItem(QUICK_FALLBACK_KEY) || "null");
            const age = Date.now() - Number(pool?.createdAt);
            if (!pool || !Number.isFinite(age) || age < 0 || age > 45000) return null;
            const filters = quickFallbackFilters(buildFilterContext(options));
            const candidates = pool.candidates.filter(game => passesHardFilters(game, filters)
                && !softFilterFailures(game, pool.pings, filters).length).slice(0, 2);
            if (!candidates.length) return null;
            let timer;
            try {
                return await Promise.race([
                    Promise.any(candidates.map(async game => {
                        const payload = await fetchJson(`https://matchmaker.krunker.io/game-info?game=${encodeURIComponent(game.gameID)}`, 950, null)
                            .catch(error => { registerMatchmakerBackoff(error); throw error; });
                        const fresh = parseGameRecord(payload, "game-info");
                        if (!fresh || fresh.gameID !== game.gameID || !passesHardFilters(fresh, filters)
                            || softFilterFailures(fresh, pool.pings, filters).length) throw new Error("Temporary lobby unavailable");
                        return fresh;
                    })).catch(() => null),
                    new Promise(resolve => { timer = setTimeout(() => resolve(null), 1000); })
                ]);
            } finally { clearTimeout(timer); }
        } catch { return null; }
    }

    // Set in the page that leaves for a temporary lobby. Navigation through Krunker's matchmaker can take a
    // second or two, and that page must not consume the recovery state meant for the next page.
    let temporaryLobbyNavigationAt = 0;
    const TEMPORARY_LOBBY_HANDOFF_MS = 15000;
    const TEMPORARY_LOBBY_TAKEN_OVER = -1;
    function temporaryLobbyHandoffPending() {
        return temporaryLobbyNavigationAt > 0 && Date.now() - temporaryLobbyNavigationAt < TEMPORARY_LOBBY_HANDOFF_MS;
    }

    // A short cached check precedes native matchmaking, never a second full scan.
    async function joinTemporaryLobby(recovery, nativeButton = null) {
        if (cancelProtectedLowPlayerSearch()) return;
        if (!getVisibleConnectionError() && playerPolicyBlocks(recovery.options)) return;
        // The previous destination failed. Its success/connecting notices are stale,
        // including any payload that could otherwise survive the fallback navigation.
        sessionStorage.removeItem(CONNECTION_TOAST_KEY);
        document.getElementById("turfConnectionToast")?.remove();
        document.getElementById("turfSearchFinishedNotification")?.remove();
        clearJoinMarker();
        replaceActiveSearch();
        const generation = searchRunId;
        const candidate = await findQuickFallback(recovery.options);
        if (generation !== searchRunId) return;
        if (cancelProtectedLowPlayerSearch()) return;
        updatePlayerPolicy(true);
        if (generation !== searchRunId) return;
        if (!getVisibleConnectionError() && playerPolicyBlocks(recovery.options)) return;
        stopMatchmakerWork();
        // Without stored recovery the next page could not restore the filters, so search with them here instead.
        if (!saveJoinRecovery({ ...recovery, fullCount: 0, temporary: true })) {
            triggerMatchmaker("temporary-lobby-unsaved", { ...recovery.options, background: true });
            return;
        }
        temporaryLobbyNavigationAt = Date.now();
        if (candidate) {
            // The temporary lobby ignores the map filter by design; the background search restores it.
            emitDiagnostic("join", { path: "temporary-lobby-candidate", gameID: candidate.gameID, map: candidate.map,
                mode: candidate.gamemode, players: candidate.playerCount, timeLeft: candidate.remainingTime, ...describeMapFilter(recovery.options) });
            window.location.assign(`https://krunker.io/?game=${candidate.gameID}`);
            return;
        }
        const current = new URLSearchParams(window.location.search).get("game");
        emitDiagnostic("join", { path: "krunker-matchmaker", gameID: "", map: "", excluded: current || "",
            ...describeMapFilter(recovery.options) });
        if (nativeButton?.isConnected && isElementActuallyVisible(nativeButton)) {
            try {
                nativeButton.click();
                // If the native handler is broken or navigation is blocked, avoid staying stuck.
                setTimeout(() => {
                    if (generation === searchRunId && getVisibleConnectionError()) {
                        window.location.assign(`https://krunker.io/${current ? `?exclude=${encodeURIComponent(current)}` : ""}`);
                    }
                }, 1500);
                return;
            } catch { /* Fall back to the game's origin route. */ }
        }
        window.location.assign(`https://krunker.io/${current ? `?exclude=${encodeURIComponent(current)}` : ""}`);
    }

    // Resume once the temporary lobby is ready, with a bounded wait for unfamiliar client UI.
    function resumeAfterTemporaryLobby(isIngame) {
        const recovery = readJoinRecovery();
        if (!recovery?.temporary) return false;
        // Only the next page resumes; if the navigation never happens, this page takes over after the timeout.
        if (temporaryLobbyHandoffPending()) return true;
        const current = new URLSearchParams(window.location.search).get("game");
        // No scan is running while native matchmaking is still joining the filler.
        // The actual background search below owns its HUD and visibility settings.
        const timedOut = Date.now() - recovery.updatedAt >= 15000;
        if ((!current || document.readyState !== "complete" || !isLobbyReady(isIngame)) && !timedOut) return true;
        // Keep the pending search while the whitelist blocks it; consuming it now would drop it for good.
        if (playerPolicyBlocks({ ...recovery.options, background: true, recovery: true })) return true;
        if (temporaryLobbyNavigationAt === TEMPORARY_LOBBY_TAKEN_OVER) return true;
        if (temporaryLobbyNavigationAt > 0) {
            // This page's navigation never committed. Search here, but keep the recovery so a late navigation
            // still resumes on the next page; a successful join replaces it anyway.
            temporaryLobbyNavigationAt = TEMPORARY_LOBBY_TAKEN_OVER;
            triggerMatchmaker("temporary-lobby-ready", { ...recovery.options, background: true, recovery: true });
            return true;
        }
        saveJoinRecovery({ ...recovery, temporary: false });
        triggerMatchmaker("temporary-lobby-ready", { ...recovery.options, background: true, recovery: true });
        return true;
    }

    // Consume only a specific rejection, not an intermediate Lost Connection heading.
    function handleGameStatusText(rawText) {
        const text = String(rawText || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (!text) return false;
        const isFull = /\b(?:game|room|server|lobby)\s+(?:is\s+)?full\b/.test(text);
        const isMissing = /\b(?:game|room|server|lobby)\s+(?:(?:was|is)\s+)?(?:not found|does not exist|no longer (?:exists|available)|unavailable)\b/.test(text);
        const isBadServer = /\bbad\s+(?:server|game|lobby)\b/.test(text);
        const isCancelled = text.includes("not enough players") || text.includes("match cancelled") || text.includes("match canceled") || text.includes("prep time ended");
        if ((!isFull && !isCancelled && !isMissing && !isBadServer) || pendingRelaunchTimer) return false;
        const recovery = readJoinRecovery();
        const marker = getValidJoinMarker() || (recovery?.temporary ? {
            gameID: new URLSearchParams(window.location.search).get("game"), searchOptions: recovery.options
        } : null);
        if (!marker) return false;
        const queue = takeValidCandidateQueue();
        clearJoinMarker();
        const next = recovery || { fullCount: 0, rejected: [], options: marker.searchOptions || getRetrySearchOptions() };
        next.options = marker.searchOptions || next.options;
        if (marker.gameID) next.rejected = [...next.rejected.filter(item => item.id !== marker.gameID),
            { id: marker.gameID, until: Date.now() + REJECTED_LOBBY_MS }];
        next.temporary = false;
        if (isFull) {
            next.fullCount += 1;
            saveJoinRecovery(next);
            showRecoveryAndRelaunch(
                "LOBBY IS FULL",
                "game-error-full",
                queue
            );
            return true;
        }

        if (isMissing || isBadServer) {
            saveJoinRecovery(next);
            showRecoveryAndRelaunch("LOBBY UNAVAILABLE", "game-error-missing", queue);
            return true;
        }

        if (isCancelled) {
            saveJoinRecovery(next);
            showRecoveryAndRelaunch(
                "MATCH CANCELLED",
                "game-error-cancelled",
                queue
            );
            return true;
        }

        return false;
    }

    const GAME_STATUS_SELECTORS = [
        "#instructionsUpdate",
        "#instructions",
        "#loadInfo",
        "#loadInfoLHolder",
        "#loadInfoRHolder",
        "#loadingInfo",
        "#connectionError",
        "#gameError",
        ".connectionError",
        ".gameError"
    ];

    let rejectionWatchActive = false;

    // Rejections only matter while a matchmaker join or temporary lobby is pending.
    function updateRejectionWatch() {
        rejectionWatchActive = Boolean(getValidJoinMarker() || readJoinRecovery()?.temporary);
        return rejectionWatchActive;
    }

    function checkGameEndOrErrorState() {
        // The page leaving for a temporary lobby must not react to its old lobby's messages.
        if (temporaryLobbyHandoffPending()) return false;
        const screen = getVisibleConnectionError();
        if (screen) {
            if (handledConnectionScreen !== screen) {
                handledConnectionScreen = screen;
                const previous = readJoinRecovery();
                const current = new URLSearchParams(window.location.search).get("game");
                const recovery = { ...(previous || { fullCount: 0, rejected: [] }), temporary: false,
                    options: previous?.options || getRetrySearchOptions() };
                if (current) recovery.rejected = [...recovery.rejected.filter(item => item.id !== current),
                    { id: current, until: Date.now() + REJECTED_LOBBY_MS }];
                saveJoinRecovery(recovery);
                const button = [...screen.querySelectorAll('.instructionsTab[onclick]')]
                    .find(element => /\bbackToOrigin\s*\(\s*\)/.test(element.getAttribute('onclick') || ''));
                void joinTemporaryLobby(recovery, button);
            }
            return true;
        }
        handledConnectionScreen = null;
        if (!rejectionWatchActive || pendingRelaunchTimer) return;
        const text = GAME_STATUS_SELECTORS
            .flatMap(selector => [...document.querySelectorAll(selector)])
            .filter(isElementActuallyVisible)
            .map(element => element.textContent || "")
            .join(" ");
        handleGameStatusText(text);
    }

    let gameStatusObserver = null;
    let gameStatusObserverTarget = null;
    let handledConnectionScreen = null;
    function getVisibleConnectionError() {
        if (document.pointerLockElement) return null;
        const screen = getEl("instructionsUpdate");
        const header = screen?.querySelector(".instructionsHeader");
        return isElementActuallyVisible(screen) && isElementActuallyVisible(header)
            && /^lost\s+connection$/i.test(header.textContent.trim()) ? screen : null;
    }
    // Observe fast error messages while a lightweight loop handles existing UI state.
    function observeGameStatus() {
        gameStatusObserver?.disconnect();
        gameStatusObserverTarget = document.body;
        gameStatusObserver = new MutationObserver(mutations => {
            // Avoid layout checks on every chat/gameplay mutation; polling covers visibility changes.
            const selector = GAME_STATUS_SELECTORS.join(',');
            const relevant = mutations.some(mutation => {
                const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
                return target?.closest(selector) || [...mutation.addedNodes].some(node =>
                    node.nodeType === Node.ELEMENT_NODE && (node.matches(selector) || node.querySelector(selector)));
            });
            if (relevant) checkGameEndOrErrorState();
        });
        gameStatusObserver.observe(gameStatusObserverTarget, { childList: true, subtree: true, characterData: true });
    }

    function waitForMilliseconds(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    async function waitForVisibleEndScreenElement(id, timeoutMs, isCurrent = () => true) {
        const deadline = Date.now() + timeoutMs;
        do {
            if (!isCurrent()) return null;
            const element = document.getElementById(id);
            if (isElementActuallyVisible(element)) return element;
            await waitForMilliseconds(100);
        } while (Date.now() < deadline);
        return null;
    }

    // Collect an available prize once; generated Svelte classes are intentionally ignored.
    async function claimEndOfMatchRewards(isCurrent) {
        const deadline = Date.now() + CLAIM_REWARDS_BUTTON_WAIT_MS;
        do {
            if (!STATE.autoClaimRewards || !isCurrent()) return;
            const button = document.querySelector("#collectRewardsButtonContainer button.collect-rewards-button");
            if (isElementActuallyVisible(button) && !button.disabled
                && button.getAttribute("aria-disabled") !== "true") {
                button.click();
                // This is a UI grace period, not confirmation of a server-side reward grant.
                await waitForMilliseconds(CLAIM_REWARDS_POST_CLICK_WAIT_MS);
                return;
            }
            await waitForMilliseconds(100);
        } while (Date.now() < deadline);
    }

    // Close Krunker's Double XP confirmation without matching unrelated buttons.
    function clickDoubleXPNiceConfirmation() {
        const button = [...document.querySelectorAll(".button.dxp-btn")].find(element => (
            element.textContent?.trim().toLowerCase() === "nice!"
            && isElementActuallyVisible(element)
        ));
        if (!button) return false;
        button.click();
        return true;
    }

    // Read the current lobby once when Turf was enabled after the navigation already happened.
    async function fetchCurrentLobbyForTargetHunt(gameID) {
        if (Date.now() < matchmakerBackoffUntil) return null;
        try {
            const payload = await fetchJson(
                `https://matchmaker.krunker.io/game-info?game=${encodeURIComponent(gameID)}`,
                MATCHMAKER_CONFIG.gameInfoTimeoutMs,
                null
            );
            const game = parseGameRecord(payload, "game-info");
            const canonicalMap = TURF_WARS_MAPS.find(map => normalizeMapName(map) === normalizeMapName(game?.map));
            if (!game || game.gameID !== gameID || !canonicalMap) return null;
            return { ...game, map: canonicalMap };
        } catch (error) {
            if (error?.status !== 400 && error?.name !== "AbortError") registerMatchmakerBackoff(error);
            return null;
        }
    }

    // Recover target-hunt state for a manually joined or reloaded Turf Wars lobby.
    function discoverCurrentTargetHuntSession(isIngame) {
        const currentGameID = new URLSearchParams(window.location.search).get("game");
        if (!isIngame || !currentGameID || !getTargetHuntMaps().length || targetHuntDiscoveryPromise) return false;
        if (targetHuntDiscoveryGameID === currentGameID && Date.now() < targetHuntDiscoveryRetryAt) return false;

        targetHuntDiscoveryGameID = currentGameID;
        targetHuntDiscoveryRetryAt = Date.now() + TARGET_HUNT_DISCOVERY_RETRY_MS;
        targetHuntDiscoveryPromise = fetchCurrentLobbyForTargetHunt(currentGameID)
            .then(game => {
                const activeGameID = new URLSearchParams(window.location.search).get("game");
                if (!game || activeGameID !== currentGameID || !getTargetHuntMaps().length) return null;
                targetHuntDiscoveryRetryAt = 0;
                return storeTargetHuntSession(game, "fallback");
            })
            .finally(() => {
                targetHuntDiscoveryPromise = null;
            });
        return true;
    }

    // Start a silent target-map hunt after the current Turf Wars lobby is identified.
    function scheduleTargetMapHunt(isIngame, endScreenVisible) {
        if (!isIngame || endOfMatchActionRunning || endScreenVisible) return false;
        const session = getValidTargetHuntSession();
        const selectedTargetMaps = getTargetHuntMaps();
        if (!selectedTargetMaps.length) return false;
        if (!session) {
            discoverCurrentTargetHuntSession(isIngame);
            return false;
        }
        const pendingTargetMaps = getPendingTargetHuntMaps(session);
        if (!pendingTargetMaps.length) return false;
        if (STATE.forcePlayerCount && getValidJoinMarker() && !forcePlayerCountChecked) return false;
        if (targetHuntStartedForGameID === session.gameID || targetHuntStartTimer) return false;
        if (overlay.classList.contains("searching")) return false;

        targetHuntStartedForGameID = session.gameID;
        targetHuntStartTimer = setTimeout(() => {
            targetHuntStartTimer = null;
            const freshSession = getValidTargetHuntSession();
            const freshTargetMaps = getPendingTargetHuntMaps(freshSession);
            if (!freshSession || freshSession.gameID !== session.gameID
                || !freshTargetMaps.length || isElementActuallyVisible(getEl("endUI"))
                || overlay.classList.contains("searching")) {
                targetHuntStartedForGameID = "";
                return;
            }
            triggerMatchmaker("target-map-background", {
                purpose: "target",
                targetMaps: freshTargetMaps,
                background: true
            });
        }, TARGET_HUNT_START_DELAY_MS);
        return true;
    }

    // Pause the background target hunter before rewards and the full-pool fallback search.
    function stopTargetMapHuntForFallback() {
        if (targetHuntStartTimer) {
            clearTimeout(targetHuntStartTimer);
            targetHuntStartTimer = null;
        }
        if (activeSearchOptions.purpose === "target" && overlay.classList.contains("searching")) {
            replaceActiveSearch();
            return true;
        }
        return false;
    }

    // Handle optional end-screen rewards before starting the next filtered search.
    async function runEndOfMatchActions() {
        const shouldClaimDoubleXP = STATE.doubleXPAfterMatch;
        const targetMaps = getTargetHuntMaps();
        const shouldSearch = STATE.autoSearchAfterMatch || targetMaps.length > 0;
        stopTargetMapHuntForFallback();
        const endScreen = getEl("endUI");
        const sessionURL = window.location.href;
        const endSearchRunId = searchRunId;
        // Do not let a delayed reward action affect a new session or a manual search.
        const isCurrent = () => window.location.href === sessionURL
            && searchRunId === endSearchRunId
            && endScreen === getEl("endUI") && isElementActuallyVisible(endScreen)
            && !overlay.classList.contains("searching");
        const stopReason = () => window.location.href !== sessionURL ? `url-changed:${window.location.search}`
            : searchRunId !== endSearchRunId ? "another-search"
                : endScreen !== getEl("endUI") || !isElementActuallyVisible(endScreen) ? "end-screen-closed"
                    : overlay.classList.contains("searching") ? "already-searching" : "";
        const stopped = step => emitDiagnostic("end-of-match-stopped", { step, reason: stopReason() });
        let endMap = "";
        try { endMap = String(window.getGameActivity?.()?.map || ""); } catch (_) { /* unavailable */ }
        emitDiagnostic("end-of-match", { map: endMap, claimRewards: Boolean(STATE.autoClaimRewards),
            doubleXP: Boolean(shouldClaimDoubleXP), autoSearch: Boolean(shouldSearch) });
        try {
            if (STATE.autoClaimRewards) {
                await claimEndOfMatchRewards(isCurrent);
            }
            if (!isCurrent()) return stopped("after-rewards");
            if (shouldClaimDoubleXP && STATE.doubleXPAfterMatch) {
                const doubleXPButton = await waitForVisibleEndScreenElement("doubleXPButton", DOUBLE_XP_BUTTON_WAIT_MS,
                    () => isCurrent() && STATE.doubleXPAfterMatch);
                if (doubleXPButton) {
                    doubleXPButton.click();
                    emitDiagnostic("double-xp-clicked", {});
                    await waitForMilliseconds(DOUBLE_XP_NICE_CLICK_DELAY_MS);
                    if (!isCurrent()) return stopped("after-double-xp");
                    clickDoubleXPNiceConfirmation();
                    await waitForMilliseconds(DOUBLE_XP_POST_CLICK_WAIT_MS - DOUBLE_XP_NICE_CLICK_DELAY_MS);
                }
            }
            if (shouldSearch && (STATE.autoSearchAfterMatch || getTargetHuntMaps().length) && isCurrent()) {
                emitDiagnostic("auto-search-started", {});
                clearJoinMarker();
                triggerMatchmaker("match-ended", targetMaps.length ? { purpose: "fallback" } : null);
            } else if (shouldSearch) stopped("before-search");
        } catch (error) {
            console.warn("Could not complete the end-of-match action.", error);
            if (shouldSearch && (STATE.autoSearchAfterMatch || getTargetHuntMaps().length) && isCurrent()) {
                clearJoinMarker();
                triggerMatchmaker("match-ended", targetMaps.length ? { purpose: "fallback" } : null);
            }
        } finally {
            endOfMatchActionRunning = false;
        }
    }

    // Run end-screen actions once after active play transitions to Krunker's end screen.
    function checkAutoSearchAfterMatch(isIngame, endScreenVisible) {
        if (!STATE.autoSearchAfterMatch && !STATE.doubleXPAfterMatch && !STATE.autoClaimRewards && !getTargetHuntMaps().length) {
            autoNextMatchArmed = false;
            lastEndScreenVisible = endScreenVisible;
            return false;
        }
        if (isIngame && !endScreenVisible) autoNextMatchArmed = true;
        const shouldSearch = autoNextMatchArmed
            && endScreenVisible
            && !lastEndScreenVisible
            && !endOfMatchActionRunning;
        lastEndScreenVisible = endScreenVisible;
        if (!shouldSearch) return false;

        autoNextMatchArmed = false;
        endOfMatchActionRunning = true;
        void runEndOfMatchActions();
        return true;
    }

    function runIngameChecks() {
        mountRuntimeUI();
        syncPlayerListButtons();
        syncTabPlayerBadges();
        if (document.body && gameStatusObserverTarget !== document.body) observeGameStatus();
        // While handing off to a temporary lobby this page only waits; the next page owns recovery.
        if (temporaryLobbyHandoffPending()) return;
        // A handoff whose navigation never committed takes over even behind a persistent error screen.
        if (temporaryLobbyNavigationAt && readJoinRecovery()?.temporary) {
            if (getVisibleConnectionError()) {
                // Retry through the connection-error handler, which (being disconnected) ignores the whitelist.
                temporaryLobbyNavigationAt = 0;
                handledConnectionScreen = null;
            } else resumeAfterTemporaryLobby(false);
        }
        if (checkGameEndOrErrorState()) return;
        const inst = getEl('instructions'), login = getEl('windowHolder'), mainUI = getEl('inGameUI');
        const isIngame = !!document.pointerLockElement || ((!inst || inst.offsetHeight === 0) && (!login || login.offsetHeight === 0) && (mainUI && mainUI.offsetHeight > 0));

        if (isIngame !== lastIsIngame) {
            if (mBtn) mBtn.style.display = isIngame ? "none" : "flex";
            lastIsIngame = isIngame;
        }
        const policyBlocked = updatePlayerPolicy();
        // Returning from a temporary lobby is held only by a confirmed whitelisted player (see playerPolicyBlocks).
        if (readJoinRecovery()?.temporary && !playerPolicy.held) resumeAfterTemporaryLobby(isIngame);
        if (policyBlocked) return;
        // Read end-screen visibility once per tick; each read can force a style and layout pass.
        const endScreenVisible = isElementActuallyVisible(getEl("endUI"));
        checkAutoSearchAfterMatch(isIngame, endScreenVisible);
        updateRejectionWatch();
        checkGameEndOrErrorState();
        checkForcedPlayerCount(isIngame);
        const recovering = resumeAfterTemporaryLobby(isIngame);
        const lowPlayerSearchStarted = checkLowPlayerCount(isIngame, endScreenVisible);
        if (!recovering && !lowPlayerSearchStarted) {
            // Actual play confirms a successful join; late rejections keep their marker.
            const recovery = readJoinRecovery();
            if (isIngame && recovery?.fullCount) saveJoinRecovery({ ...recovery, fullCount: 0 });
            scheduleTargetMapHunt(isIngame, endScreenVisible);
        }
    }

    // One failing check must not stop hotkeys, recovery, and end-of-match handling for the session.
    let lastLoopErrorAt = 0;
    function checkIngameLoop() {
        try {
            runIngameChecks();
        } catch (error) {
            if (Date.now() - lastLoopErrorAt > 10000) {
                lastLoopErrorAt = Date.now();
                console.error("Turf Matchmaking state check failed.", error);
            }
        } finally {
            setTimeout(checkIngameLoop, 250);
        }
    }

    // Compare dotted numeric versions without treating 1.10 as 1.1.
    function compareVersions(left, right) {
        const parse = value => String(value)
            .split(".")
            .map(part => Number(part.match(/^\d+/)?.[0] ?? 0));
        const leftParts = parse(left);
        const rightParts = parse(right);
        const length = Math.max(leftParts.length, rightParts.length);
        for (let index = 0; index < length; index += 1) {
            const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
            if (difference !== 0) return Math.sign(difference);
        }
        return 0;
    }

    function setUpdateStatus(message) {
        updateStatus = message;
        const status = ui.querySelector("#turf_update_status");
        if (status) status.textContent = message;
    }

    // Kute's manager replies carry no request IDs and reach every page listener, including Kute's own script
    // manager popup. Its manager thread handles commands in order, so a read of a unique missing script works as
    // a fence: the last matching reply before our fence describes the state after our command. Earlier, late,
    // duplicated or foreign replies can no longer confirm the wrong operation.
    let updateFenceCount = 0;
    function requestUpdateHost(command, payload, select) {
        const bridge = window.chrome?.webview;
        if (![bridge?.postMessage, bridge?.addEventListener, bridge?.removeEventListener].every(item => typeof item === "function")) {
            return Promise.reject(new Error("Native script manager unavailable."));
        }
        const managed = command.startsWith("scripts-");
        const fence = managed ? `turf-update-fence-${Date.now().toString(36)}-${++updateFenceCount}.js` : null;
        return new Promise((resolve, reject) => {
            let timer;
            let result;
            let managerError = "";
            const finish = (error, value) => {
                clearTimeout(timer);
                bridge.removeEventListener("message", receive);
                if (error) reject(error); else resolve(value);
            };
            const receive = event => {
                const data = event?.data;
                if (!data || typeof data !== "object") return;
                if (!managed) {
                    const value = select(data);
                    if (value !== undefined) finish(null, value);
                    return;
                }
                if (data.userscriptSource?.key === fence) {
                    // A manager error inside our window may be foreign; treating it as ours only fails safe.
                    if (managerError) return finish(new Error(managerError.slice(0, 200)));
                    if (result === undefined) return finish(new Error("Native script manager did not confirm the change."));
                    return finish(null, result);
                }
                if (typeof data.managerError === "string") managerError = data.managerError;
                const value = select(data);
                if (value !== undefined) result = value;
            };
            bridge.addEventListener("message", receive);
            timer = setTimeout(() => finish(new Error("Native script manager timed out.")), 4000);
            try {
                bridge.postMessage(payload === null ? command : `${command} ${JSON.stringify(payload)}`);
                if (managed) bridge.postMessage(`scripts-read ${JSON.stringify({ key: fence })}`);
            } catch (error) { finish(error); }
        });
    }

    // true or false once the client answered; null when it did not answer this time.
    async function hasNativeUpdater() {
        if (updateHostAvailable !== null) return updateHostAvailable;
        try {
            const info = await requestUpdateHost("get-info", null, data =>
                Array.isArray(data.hostFeatures) && typeof data.version === "string" ? data : undefined);
            updateHostAvailable = info.hostFeatures.includes("script-manager");
        } catch (_) {
            // A missing bridge is definitive. A lost reply is not, so the next check asks again.
            if (typeof window.chrome?.webview?.postMessage !== "function") updateHostAvailable = false;
        }
        return updateHostAvailable;
    }

    async function updateHostList(command = "scripts-list", payload = {}) {
        const result = await requestUpdateHost(command, payload, data =>
            Array.isArray(data.userscripts?.groups) ? data.userscripts : undefined);
        return result.groups.filter(group => group.id === "game")
            .flatMap(group => Array.isArray(group.scripts) ? group.scripts : []);
    }

    function isOwnedUpdateEntry(entry) {
        return entry?.group === "game" && entry.key === entry.file
            && /^TurfMatchMaking(?:\d+(?:\.\d+)*)?\.js$/.test(entry.file)
            && entry.meta?.name === "Turf Matchmaking" && entry.meta?.author === "xcape53"
            && /^\d+(?:\.\d+)*$/.test(entry.meta?.version || "");
    }

    async function readUpdateHostFile(key) {
        const result = await requestUpdateHost("scripts-read", { key }, data =>
            data.userscriptSource?.key === key ? data.userscriptSource : undefined);
        if (typeof result.content !== "string" || new TextEncoder().encode(result.content).length > UPDATE_MAX_BYTES) {
            throw new Error("Could not read the previous script safely.");
        }
        return result.content;
    }

    async function writeUpdateHostFile(source) {
        await updateHostList("scripts-write", { group: "game", file: UPDATE_FILE, content: source });
        if (await readUpdateHostFile(UPDATE_FILE) !== source) throw new Error("Saved script verification failed.");
    }

    async function toggleUpdateHostFile(key, enabled) {
        const list = await updateHostList("scripts-toggle", { key, enabled });
        if (list.find(entry => entry.key === key)?.enabled !== enabled) throw new Error("Script tracker verification failed.");
    }

    // Bound response size during streaming, not after a potentially unlimited allocation.
    async function fetchUpdateBytes(url, maximum) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal });
            if (!response.ok) throw new Error(`Update download failed (${response.status}).`);
            const declared = Number(response.headers.get("content-length"));
            if (Number.isFinite(declared) && declared > maximum) throw new Error("Update response is too large.");
            const reader = response.body.getReader();
            const chunks = [];
            let size = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.length;
                if (size > maximum) { await reader.cancel(); throw new Error("Update response is too large."); }
                chunks.push(value);
            }
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
            return bytes;
        } finally { clearTimeout(timer); }
    }

    async function downloadVerifiedUpdate(version) {
        const filename = `TurfMatchMaking${version}.js`;
        const url = `${UPDATE_RAW_BASE}/v${version}/${filename}`;
        const checksumBytes = await fetchUpdateBytes(`${url}.sha256`, 200);
        const checksum = new TextDecoder().decode(checksumBytes).trim();
        const checksumMatch = checksum.match(/^([a-f0-9]{64})(?:\s+\*?(\S+))?$/i);
        if (!checksumMatch || (checksumMatch[2] && checksumMatch[2] !== filename)) throw new Error("Release checksum is missing or invalid.");
        const bytes = await fetchUpdateBytes(url, UPDATE_MAX_BYTES);
        const actual = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
            .map(value => value.toString(16).padStart(2, "0")).join("");
        if (actual !== checksumMatch[1].toLowerCase()) throw new Error("Release checksum does not match.");
        const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        const header = source.slice(0, 65536).match(/^\/\/ ==UserScript==\r?\n([\s\S]*?)^\/\/ ==\/UserScript==/m);
        const metadata = {};
        if (!source.startsWith("// ==UserScript==") || !header) throw new Error("Downloaded file is not a userscript.");
        for (const line of header[1].split(/\r?\n/)) {
            const match = line.match(/^\/\/ @(name|author|version|license)\s+(.+?)\s*$/);
            if (match) metadata[match[1]] = match[2];
        }
        if (metadata.name !== "Turf Matchmaking" || metadata.author !== "xcape53" || metadata.license !== "MIT"
            || metadata.version !== version || source.match(/^\s*const SCRIPT_VERSION = "([\d.]+)";/m)?.[1] !== version) {
            throw new Error("Release identity, license or version does not match.");
        }
        return source;
    }

    // Save verified bytes through the client. Never evaluate them in the current document.
    async function installScriptUpdate(version, manual = false) {
        if (updateInstallRunning) return;
        if (!/^\d+(?:\.\d+)*$/.test(version) || compareVersions(version, SCRIPT_VERSION) <= 0) return;
        updateInstallRunning = true;
        let previousEntries = null;
        let previousTarget = null;
        let previousSource = null;
        let touchedFiles = false;
        let notice = null;
        const automaticTurnedOff = () => {
            if (manual || STATE.automaticUpdates) return false;
            setUpdateStatus("Automatic updates were turned off. No files changed.");
            return true;
        };
        try {
            const native = await hasNativeUpdater();
            if (native === null) throw new Error("Kute's script manager did not answer.");
            if (!native) throw new Error("This client needs a manual script installation.");
            const source = await downloadVerifiedUpdate(version);
            if (automaticTurnedOff()) return;
            const entries = await updateHostList();
            previousEntries = entries.filter(isOwnedUpdateEntry);
            previousTarget = entries.find(entry => entry.key === UPDATE_FILE) || null;
            if (previousTarget && !isOwnedUpdateEntry(previousTarget)) throw new Error("Stable filename belongs to another script.");
            const alreadyInstalled = previousEntries.find(entry => entry.enabled && compareVersions(entry.meta.version, version) >= 0);
            if (alreadyInstalled) {
                setUpdateStatus(`${alreadyInstalled.meta.version} is already on disk. Reload the game to activate it.`);
                return;
            }
            // Never overwrite an equal or newer copy, and never claim a disabled one activates on reload.
            if (previousTarget && compareVersions(previousTarget.meta.version, version) >= 0) {
                throw new Error(`${UPDATE_FILE} ${previousTarget.meta.version} is on disk but disabled in Kute's script manager. No files changed.`);
            }
            const current = previousEntries.find(entry => entry.enabled && entry.meta.version === SCRIPT_VERSION);
            if (!current) throw new Error("Could not identify the active Turf script. No files changed.");
            // Kute silently drops a scripts- message above 5 MB; JSON escaping can push a 4 MB script past it.
            const writePayload = JSON.stringify({ group: "game", file: UPDATE_FILE, content: source });
            if (new TextEncoder().encode(writePayload).length + "write ".length > UPDATE_MESSAGE_MAX_BYTES) {
                throw new Error("Release is too large for Kute's script manager. No files changed.");
            }
            previousSource = await readUpdateHostFile(previousTarget?.key || current.key);
            // One bounded previous copy. A full storage quota must abort before touching disk.
            localStorage.setItem(UPDATE_BACKUP_KEY, JSON.stringify({ version: previousTarget?.meta.version || SCRIPT_VERSION,
                source: previousSource, savedAt: Date.now(), entries: previousEntries.map(entry => ({ key: entry.key, enabled: entry.enabled })) }));
            if (automaticTurnedOff()) return;
            // Tell the player only when files are really about to change, not on every hourly check.
            if (!manual) notice = showUpdatePrompt(version, "automatic");
            touchedFiles = true;
            await writeUpdateHostFile(source);
            await toggleUpdateHostFile(UPDATE_FILE, true);
            for (const entry of previousEntries) {
                if (entry.key !== UPDATE_FILE && entry.enabled) await toggleUpdateHostFile(entry.key, false);
            }
            setUpdateStatus(`${version} installed. It activates on the next game reload; your current match continues.`);
        } catch (error) {
            let restored = !touchedFiles;
            if (touchedFiles && previousSource !== null) {
                // Re-enable the previous copies first, so a partial restoration never leaves Turf switched off.
                // Every step is attempted; the saved backup remains if the native host refuses any of them.
                restored = true;
                const attempt = async step => { try { await step(); } catch (_) { restored = false; } };
                for (const entry of previousEntries) {
                    if (entry.key !== UPDATE_FILE && entry.enabled) await attempt(() => toggleUpdateHostFile(entry.key, true));
                }
                await attempt(() => writeUpdateHostFile(previousSource));
                await attempt(() => toggleUpdateHostFile(UPDATE_FILE, previousTarget?.enabled === true));
            }
            setUpdateStatus(`Update not installed: ${error.message} ${restored ? 'Previous version retained.' : 'Native restoration failed; the previous source is saved in turf_mm_update_backup.'}`);
            throw error;
        } finally {
            notice?.finish(updateStatus);
            updateInstallRunning = false;
        }
    }

    // mode "download": unsupported clients keep the manual download. "native": Automatic Updates is off, so the
    // player can install deliberately. "automatic": installation is already running; returns {finish(text)}.
    function showUpdatePrompt(newVersion, mode = "download") {
        if (!document.body || document.getElementById("turfMatchmakerUpdatePrompt")) return null;
        const nativeInstall = mode === "native";
        const automatic = mode === "automatic";

        const popup = document.createElement("div");
        popup.id = "turfMatchmakerUpdatePrompt";
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-modal", "true");
        popup.style.cssText = "position:fixed; top:25%; left:50%; transform:translate(-50%,-50%); background:#0d0d0d; border:2px solid var(--accent); padding:24px; z-index:999999999; color:#fff; width:min(390px,calc(100vw - 48px)); box-sizing:border-box; border-radius:4px; text-align:center; font-family:'Aldrich',sans-serif; animation:turfMatchmakerGlow163 5s infinite ease-in-out; box-shadow:0 10px 40px rgba(0,0,0,0.9);";

        const title = document.createElement("div");
        title.textContent = "UPDATE AVAILABLE";
        title.style.cssText = "font-size:16px; font-weight:bold; margin-bottom:12px; letter-spacing:1px; color:#fff;";

        const message = document.createElement("div");
        message.textContent = automatic
            ? `Installing new update: Turf Matchmaking ${newVersion}. You can turn off automatic updates in Settings.`
            : `Turf Matchmaking ${newVersion} is available. ${nativeInstall ? 'Install it for the next reload?' : 'Download it now?'}`;
        message.style.cssText = "font-size:13px; margin-bottom:20px; color:#b1b1b1; line-height:1.5;";

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex; gap:10px;";

        const downloadButton = document.createElement("button");
        downloadButton.textContent = nativeInstall ? "INSTALL UPDATE" : "DOWNLOAD UPDATE";
        downloadButton.style.cssText = "flex:1; padding:11px; background:var(--grad); color:#fff; border:1px solid var(--accent); border-radius:4px; font-family:'Aldrich'; font-weight:bold; font-size:11px; cursor:pointer;";

        const laterButton = document.createElement("button");
        laterButton.textContent = "NOT NOW";
        laterButton.style.cssText = "padding:11px 15px; background:#171717; color:#8a8a8a; border:1px solid #2d2d2d; border-radius:4px; font-family:'Aldrich'; font-weight:bold; font-size:11px; cursor:pointer;";

        // Dismiss the notice after five seconds without accepting the download.
        let dismissTimer = null;
        let resultTimer = null;
        const shownAt = Date.now();
        const dismiss = () => {
            clearTimeout(dismissTimer);
            clearTimeout(resultTimer);
            popup.remove();
        };
        downloadButton.onclick = () => {
            if (nativeInstall) {
                clearTimeout(dismissTimer);
                downloadButton.disabled = true;
                void installScriptUpdate(newVersion, true).then(dismiss).catch(() => {
                    message.textContent = updateStatus;
                    downloadButton.disabled = false;
                });
                return;
            }
            const releaseAssetUrl = `${PROJECT_URL}/releases/download/v${newVersion}/TurfMatchMaking${newVersion}.js`;
            const updateTab = window.open(releaseAssetUrl, "_blank");
            if (updateTab) updateTab.opener = null;
            dismiss();
        };
        laterButton.onclick = dismiss;

        if (automatic) {
            // Nothing to decide: one button closes the window, which also closes itself after the result.
            laterButton.textContent = "OK";
            laterButton.style.flex = "1";
            actions.append(laterButton);
        } else actions.append(downloadButton, laterButton);
        popup.append(title, message, actions);
        document.body.appendChild(popup);
        if (!automatic) {
            dismissTimer = setTimeout(dismiss, 5000);
            return null;
        }
        // Keep "Installing" readable for five seconds even when the write finishes sooner, then show the result
        // for another five seconds. Only the window waits; the installation itself is already done.
        return {
            finish(text) {
                resultTimer = setTimeout(() => {
                    message.textContent = text;
                    dismissTimer = setTimeout(dismiss, 5000);
                }, Math.max(0, 5000 - (Date.now() - shownAt)));
            }
        };
    }

    // Automatic checks are throttled; a deliberate Settings check can bypass the interval.
    async function checkForUpdates({ force = false } = {}) {
        if (updateCheckRunning || updateInstallRunning) return;
        const now = Date.now();
        let previousCheck = 0;
        try { previousCheck = Number(sessionStorage.getItem(UPDATE_CHECK_KEY)); } catch (_) { /* Continue without session caching. */ }
        if (!force && previousCheck > 0 && now - previousCheck < UPDATE_CHECK_INTERVAL_MS) return;
        updateCheckRunning = true;
        try { sessionStorage.setItem(UPDATE_CHECK_KEY, String(now)); } catch (_) { /* Storage failure must not break matching. */ }
        try {
            setUpdateStatus("Checking for updates...");
            const native = await hasNativeUpdater();
            const remoteVersion = new TextDecoder().decode(await fetchUpdateBytes(VERSION_URL, 64)).trim();
            if (!/^\d+(?:\.\d+)*$/.test(remoteVersion)) throw new Error("Invalid published version.");
            if (remoteVersion && compareVersions(remoteVersion, SCRIPT_VERSION) > 0) {
                if (native === null) throw new Error("Kute's script manager did not answer; the next check retries.");
                if (native && STATE.automaticUpdates) await installScriptUpdate(remoteVersion);
                else {
                    setUpdateStatus(native ? "Automatic installation is off. You can install this update manually." : "This client does not expose the Kute script manager. Use the manual download.");
                    showUpdatePrompt(remoteVersion, native ? "native" : "download");
                }
            } else {
                const support = native ? "Kute automatic installation supported." : native === false
                    ? "Manual installation only on this client." : "Kute's script manager did not answer.";
                setUpdateStatus(`Running ${SCRIPT_VERSION}. ${support} No newer published version.`);
            }
        } catch (error) {
            if (!updateStatus.startsWith("Update not installed:")) setUpdateStatus(`Could not update: ${error.message} Current version continues.`);
            console.warn("Turf Matchmaking update check did not install a new version.");
        } finally { updateCheckRunning = false; }
    }

    // Remove storage left by the retired connection-audit subsystem.
    function removeObsoleteDiagnostics() {
        sessionStorage.removeItem("turf_mm_connection_audit");
        localStorage.removeItem("turf_mm_player_audit_history");
        Reflect.deleteProperty(window, "__turfMatchmakingAudit");
    }

    // Mount runtime UI and observers once document.body becomes available.
    let initialized = false;
    let initObserver = null;
    const init = () => {
        if (initialized || !document.body) return;
        initialized = true;
        initObserver?.disconnect();
        mountRuntimeUI();
        removeObsoleteDiagnostics();
        applyTheme(STATE.gradColor1, STATE.gradColor2);
        showPendingConnectionToast();
        showPendingRecoveryToast();
        if (STATE.css) applyCSS(STATE.css);
        if (STATE.script) applyScript(STATE.script);
        observeGameStatus();
        checkIngameLoop();
        showFirstRunTutorial();
        setTimeout(async () => {
            await checkForUpdates();
            setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
        }, 2000);
    };
    if (document.body) {
        init();
    } else {
        initObserver = new MutationObserver(init);
        initObserver.observe(document, { childList: true, subtree: true });
        document.addEventListener("DOMContentLoaded", init, { once: true });
    }
})();
