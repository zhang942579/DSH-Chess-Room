/* dsh-pet v0.4.14 manifest parser, Apache-2.0. Source commit 9ed843bccee3d2604ce0ac31f55cbde9bda97c7f.
   Adaptation: TypeScript erased and local imports bundled by esbuild; validation logic unchanged.
   See LICENSE and UPSTREAM.json in this directory. Development verification only; not a business Service. */

// vendor/dsh-pet-manifest/source/src/manifest-v2.ts
import { isAbsolute } from "node:path";

// vendor/dsh-pet-manifest/source/src/gameplay.ts
var PET_ROAM_DIRECTIONS = ["up", "down", "left", "right"];
var KEBAB = /^[a-z0-9][a-z0-9-]*$/;
var MAX_STATS = 16;
var MAX_ZONES = 8;
var MAX_BRANCHES = 8;
var MAX_ACTS = 16;
var MAX_SHOP_ITEMS = 32;
var MAX_LOTTERY_TIERS = 16;
var MAX_PHRASES = 64;
var PHRASE_MAX_LENGTH = 120;
var MAX_MODES = 8;
var MODE_LABEL_MAX_LENGTH = 40;
var STAT_VALUE_MAX = 1e6;
var KNOWN_GAMEPLAY = /* @__PURE__ */ new Set(["idleDirector", "stats", "hitBox", "touch", "work", "sleep", "modes", "roam", "passiveIncome", "shop", "dragState", "dragEndState"]);
var KNOWN_STAT = /* @__PURE__ */ new Set(["max", "initial", "decayPerMinute", "workingDecayPerMinute", "idleDecayPerMinute"]);
var KNOWN_ZONE = /* @__PURE__ */ new Set(["name", "y0", "y1", "branches"]);
var KNOWN_TOUCH = /* @__PURE__ */ new Set(["zones", "clickBoost"]);
var KNOWN_BRANCH = /* @__PURE__ */ new Set(["probability", "effects", "state", "stateMs", "phrases"]);
var KNOWN_EFFECT = /* @__PURE__ */ new Set(["stat", "currency", "amount"]);
var KNOWN_WORK = /* @__PURE__ */ new Set(["state", "successState", "failState", "tickMs", "resultMs", "successProbability", "success", "fail"]);
var KNOWN_SLEEP = /* @__PURE__ */ new Set(["state", "wakeState", "restore"]);
var KNOWN_MODE = /* @__PURE__ */ new Set(["state", "label", "activeLabel", "restore"]);
var KNOWN_ROAM = /* @__PURE__ */ new Set(["state", "intervalMs", "probability", "distanceMin", "distanceMax", "speed", "directions"]);
var KNOWN_RESTORE = /* @__PURE__ */ new Set(["stat", "amount", "intervalMs"]);
var KNOWN_SHOP_ITEM = /* @__PURE__ */ new Set(["id", "label", "image", "price", "currency", "effects", "lottery"]);
var KNOWN_LOTTERY = /* @__PURE__ */ new Set(["effects", "currency", "tiers"]);
var KNOWN_IDLE_DIRECTOR = /* @__PURE__ */ new Set(["intervalMs", "maxMiss", "idleWeight", "acts"]);
var KNOWN_ACT = /* @__PURE__ */ new Set(["track", "weight", "phrases"]);
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function unknownKeys(source, known) {
  return Object.keys(source).filter((key) => !known.has(key));
}
function validName(name, max = 32) {
  return typeof name === "string" && name.length <= max && KEBAB.test(name);
}
function intIn(value, min, max) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
function numIn(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
function parseEffects(raw, field, stats, hooks) {
  if (raw === void 0) return void 0;
  if (!Array.isArray(raw) || raw.length === 0) {
    hooks.error(field + " must be a non-empty array of effects");
    return void 0;
  }
  const effects = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      hooks.error(field + ": every effect must be an object");
      continue;
    }
    const extra = unknownKeys(entry, KNOWN_EFFECT);
    if (extra.length > 0) hooks.error(field + ": unknown effect field(s) " + extra.map((k) => JSON.stringify(k)).join(", "));
    const hasStat = typeof entry.stat === "string";
    const hasCurrency = typeof entry.currency === "string";
    if (hasStat === hasCurrency) {
      hooks.error(field + ": an effect needs exactly one of stat or currency");
      continue;
    }
    if (!intIn(entry.amount, -STAT_VALUE_MAX, STAT_VALUE_MAX) || entry.amount === 0) {
      hooks.error(field + ": effect amount must be a non-zero integer within \xB1" + STAT_VALUE_MAX);
      continue;
    }
    if (hasStat && stats[entry.stat] === void 0) {
      hooks.error(field + ": effect references undeclared stat " + JSON.stringify(entry.stat));
      continue;
    }
    if (hasCurrency && !validName(entry.currency, 24)) {
      hooks.error(field + ": effect currency must be a kebab id");
      continue;
    }
    effects.push({
      ...hasStat ? { stat: entry.stat } : {},
      ...hasCurrency ? { currency: entry.currency } : {},
      amount: entry.amount
    });
  }
  return effects.length === 0 ? void 0 : effects;
}
function parsePhrases(raw, field, hooks) {
  if (raw === void 0) return void 0;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PHRASES || raw.some((line) => typeof line !== "string" || line.trim() === "" || line.length > PHRASE_MAX_LENGTH)) {
    hooks.error(field + " must be 1.." + MAX_PHRASES + " non-empty lines of at most " + PHRASE_MAX_LENGTH + " chars");
    return void 0;
  }
  return raw;
}
function parseStateRef(raw, field, hooks) {
  if (raw === void 0) return void 0;
  if (typeof raw !== "string" || !hooks.stateNames.has(raw)) {
    hooks.error(field + " must name a declared frames2d track");
    return void 0;
  }
  return raw;
}
function parseModeRestore(raw, field, stats, fail) {
  if (!isRecord(raw)) {
    fail(field + " must be an object { stat, amount, intervalMs }");
    return void 0;
  }
  const extra = unknownKeys(raw, KNOWN_RESTORE);
  if (extra.length > 0) fail(field + ": unknown field(s) " + extra.map((k) => JSON.stringify(k)).join(", "));
  const stat = typeof raw.stat === "string" && stats[raw.stat] !== void 0 ? raw.stat : void 0;
  if (stat === void 0) fail(field + ".stat must reference a declared stat");
  if (!intIn(raw.amount, 1, 1e3)) fail(field + ".amount must be an integer in [1, 1000]");
  if (!intIn(raw.intervalMs, 1e3, 6e5)) fail(field + ".intervalMs must be an integer in [1000, 600000]");
  if (stat === void 0 || !intIn(raw.amount, 1, 1e3) || !intIn(raw.intervalMs, 1e3, 6e5)) return void 0;
  return { stat, amount: raw.amount, intervalMs: raw.intervalMs };
}
function parseGameplayManifest(raw, hooks) {
  const error = (message) => hooks.error(message);
  if (!isRecord(raw)) {
    error("gameplay must be an object");
    return void 0;
  }
  const extra = unknownKeys(raw, KNOWN_GAMEPLAY);
  if (extra.length > 0) error("gameplay: unknown field(s) " + extra.map((k) => JSON.stringify(k)).join(", "));
  let failed = false;
  const fail = (message) => {
    failed = true;
    error(message);
  };
  const stats = {};
  if (raw.stats !== void 0) {
    if (!isRecord(raw.stats)) fail("gameplay.stats must be an object keyed by stat id");
    else {
      const entries = Object.entries(raw.stats);
      if (entries.length > MAX_STATS) fail("gameplay.stats declares too many stats (max " + MAX_STATS + ")");
      for (const [name, value] of entries) {
        if (!validName(name, 24)) {
          fail("gameplay.stats: invalid stat id " + JSON.stringify(name));
          continue;
        }
        if (!isRecord(value)) {
          fail("gameplay.stats." + name + " must be an object");
          continue;
        }
        const statExtra = unknownKeys(value, KNOWN_STAT);
        if (statExtra.length > 0) fail("gameplay.stats." + name + ": unknown field(s) " + statExtra.map((k) => JSON.stringify(k)).join(", "));
        if (!intIn(value.max, 1, STAT_VALUE_MAX)) {
          fail("gameplay.stats." + name + ".max must be an integer in [1, " + STAT_VALUE_MAX + "]");
          continue;
        }
        const def = { max: value.max };
        if (value.initial !== void 0) {
          if (!numIn(value.initial, 0, value.max)) fail("gameplay.stats." + name + ".initial must be within [0, max]");
          else def.initial = value.initial;
        }
        for (const key of ["decayPerMinute", "workingDecayPerMinute", "idleDecayPerMinute"]) {
          if (value[key] !== void 0) {
            if (!numIn(value[key], 0, 1e3)) fail("gameplay.stats." + name + "." + key + " must be a number in [0, 1000]");
            else def[key] = value[key];
          }
        }
        stats[name] = def;
      }
    }
  }
  const block = {};
  if (Object.keys(stats).length > 0) block.stats = stats;
  if (raw.idleDirector !== void 0) {
    if (!isRecord(raw.idleDirector) || !Array.isArray(raw.idleDirector.acts)) {
      fail("gameplay.idleDirector must be an object with an acts array");
    } else {
      const d = raw.idleDirector;
      const dExtra = unknownKeys(d, KNOWN_IDLE_DIRECTOR);
      if (dExtra.length > 0) fail("gameplay.idleDirector: unknown field(s) " + dExtra.map((k) => JSON.stringify(k)).join(", "));
      if (d.intervalMs !== void 0 && !intIn(d.intervalMs, 1e3, 6e4)) fail("gameplay.idleDirector.intervalMs must be an integer in [1000, 60000]");
      if (d.maxMiss !== void 0 && !intIn(d.maxMiss, 0, 10)) fail("gameplay.idleDirector.maxMiss must be an integer in [0, 10]");
      if (d.idleWeight !== void 0 && !intIn(d.idleWeight, 0, 1e4)) fail("gameplay.idleDirector.idleWeight must be an integer in [0, 10000]");
      if (d.acts.length === 0 || d.acts.length > MAX_ACTS) fail("gameplay.idleDirector.acts must declare 1.." + MAX_ACTS + " acts");
      const acts = [];
      for (const act of d.acts) {
        if (!isRecord(act) || !intIn(act.weight, 1, 1e4)) {
          fail("gameplay.idleDirector.acts entries need a weight integer in [1, 10000]");
          continue;
        }
        const aExtra = unknownKeys(act, KNOWN_ACT);
        if (aExtra.length > 0) fail("gameplay.idleDirector.acts: unknown field(s) " + aExtra.map((k) => JSON.stringify(k)).join(", "));
        const track = parseStateRef(act.track, "gameplay.idleDirector.acts.track", hooks);
        if (track === void 0) continue;
        const entry = { track, weight: act.weight };
        const phrases = parsePhrases(act.phrases, "gameplay.idleDirector.acts.phrases", hooks);
        if (phrases !== void 0) entry.phrases = phrases;
        acts.push(entry);
      }
      if (acts.length > 0) {
        block.idleDirector = {
          intervalMs: intIn(d.intervalMs, 1e3, 6e4) ? d.intervalMs : 5e3,
          maxMiss: intIn(d.maxMiss, 0, 10) ? d.maxMiss : 2,
          idleWeight: intIn(d.idleWeight, 0, 1e4) ? d.idleWeight : 0,
          acts
        };
      }
    }
  }
  if (raw.hitBox !== void 0) {
    const b = raw.hitBox;
    if (!isRecord(b) || !numIn(b.x0, 0, 1) || !numIn(b.x1, 0, 1) || !numIn(b.y0, 0, 1) || !numIn(b.y1, 0, 1) || !(b.x0 < b.x1) || !(b.y0 < b.y1)) {
      fail("gameplay.hitBox must be { x0, y0, x1, y1 } fractions with x0 < x1 and y0 < y1");
    } else {
      block.hitBox = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
    }
  }
  if (raw.touch !== void 0) {
    if (!isRecord(raw.touch) || !Array.isArray(raw.touch.zones)) {
      fail("gameplay.touch must be an object with a zones array");
    } else {
      const tExtra = unknownKeys(raw.touch, KNOWN_TOUCH);
      if (tExtra.length > 0) fail("gameplay.touch: unknown field(s) " + tExtra.map((k) => JSON.stringify(k)).join(", "));
      let clickBoost;
      if (raw.touch.clickBoost !== void 0) {
        const cb = raw.touch.clickBoost;
        if (!isRecord(cb) || typeof cb.stat !== "string" || stats[cb.stat] === void 0 || !intIn(cb.min, 0, 1e3) || !intIn(cb.max, 0, 1e3) || cb.min > cb.max) {
          fail("gameplay.touch.clickBoost must be { stat (declared), min, max } integers with 0 <= min <= max <= 1000");
        } else clickBoost = { stat: cb.stat, min: cb.min, max: cb.max };
      }
      const zones = [];
      if (raw.touch.zones.length === 0 || raw.touch.zones.length > MAX_ZONES) fail("gameplay.touch.zones must declare 1.." + MAX_ZONES + " zones");
      for (const zoneRaw of raw.touch.zones) {
        if (!isRecord(zoneRaw) || !validName(zoneRaw.name) || !numIn(zoneRaw.y0, 0, 1) || !numIn(zoneRaw.y1, 0, 1) || !(zoneRaw.y0 < zoneRaw.y1)) {
          fail("gameplay.touch.zones entries need a kebab name and 0 <= y0 < y1 <= 1");
          continue;
        }
        const zExtra = unknownKeys(zoneRaw, KNOWN_ZONE);
        if (zExtra.length > 0) fail("gameplay.touch." + zoneRaw.name + ": unknown field(s) " + zExtra.map((k) => JSON.stringify(k)).join(", "));
        if (!Array.isArray(zoneRaw.branches) || zoneRaw.branches.length === 0 || zoneRaw.branches.length > MAX_BRANCHES) {
          fail("gameplay.touch." + zoneRaw.name + ".branches must declare 1.." + MAX_BRANCHES + " branches");
          continue;
        }
        let probabilitySum = 0;
        const branches = [];
        for (const branchRaw of zoneRaw.branches) {
          if (!isRecord(branchRaw) || !numIn(branchRaw.probability, 0, 1) || branchRaw.probability === 0) {
            fail("gameplay.touch." + zoneRaw.name + ".branches entries need a probability in (0, 1]");
            continue;
          }
          const bExtra = unknownKeys(branchRaw, KNOWN_BRANCH);
          if (bExtra.length > 0) fail("gameplay.touch." + zoneRaw.name + ": unknown branch field(s) " + bExtra.map((k) => JSON.stringify(k)).join(", "));
          probabilitySum += branchRaw.probability;
          const branch = { probability: branchRaw.probability };
          const effects = parseEffects(branchRaw.effects, "gameplay.touch." + zoneRaw.name + ".effects", stats, hooks);
          if (effects !== void 0) branch.effects = effects;
          const state = parseStateRef(branchRaw.state, "gameplay.touch." + zoneRaw.name + ".state", hooks);
          if (state !== void 0) branch.state = state;
          if (branchRaw.stateMs !== void 0) {
            if (!intIn(branchRaw.stateMs, 200, 1e4)) fail("gameplay.touch." + zoneRaw.name + ".stateMs must be an integer in [200, 10000]");
            else branch.stateMs = branchRaw.stateMs;
          }
          const phrases = parsePhrases(branchRaw.phrases, "gameplay.touch." + zoneRaw.name + ".phrases", hooks);
          if (phrases !== void 0) branch.phrases = phrases;
          branches.push(branch);
        }
        if (probabilitySum > 1 + 1e-9) fail("gameplay.touch." + zoneRaw.name + ": branch probabilities must sum to at most 1");
        if (branches.length > 0) zones.push({ name: zoneRaw.name, y0: zoneRaw.y0, y1: zoneRaw.y1, branches });
      }
      if (zones.length > 0 || clickBoost !== void 0) block.touch = { zones, ...clickBoost === void 0 ? {} : { clickBoost } };
    }
  }
  if (raw.work !== void 0) {
    const w = raw.work;
    if (!isRecord(w)) fail("gameplay.work must be an object");
    else {
      const wExtra = unknownKeys(w, KNOWN_WORK);
      if (wExtra.length > 0) fail("gameplay.work: unknown field(s) " + wExtra.map((k) => JSON.stringify(k)).join(", "));
      const state = parseStateRef(w.state, "gameplay.work.state", hooks);
      const successState = parseStateRef(w.successState, "gameplay.work.successState", hooks);
      const failState = parseStateRef(w.failState, "gameplay.work.failState", hooks);
      if (!intIn(w.tickMs, 1e3, 6e4)) fail("gameplay.work.tickMs must be an integer in [1000, 60000]");
      if (!numIn(w.successProbability, 0, 1)) fail("gameplay.work.successProbability must be a number in [0, 1]");
      if (state !== void 0 && successState !== void 0 && failState !== void 0 && intIn(w.tickMs, 1e3, 6e4) && numIn(w.successProbability, 0, 1)) {
        const work = {
          state,
          successState,
          failState,
          tickMs: w.tickMs,
          successProbability: w.successProbability
        };
        if (w.resultMs !== void 0) {
          if (!isRecord(w.resultMs) || !intIn(w.resultMs.success, 200, 1e4) || !intIn(w.resultMs.fail, 200, 1e4)) {
            fail("gameplay.work.resultMs must be { success, fail } integers in [200, 10000]");
          } else work.resultMs = { success: w.resultMs.success, fail: w.resultMs.fail };
        }
        for (const key of ["success", "fail"]) {
          if (w[key] !== void 0) {
            if (!isRecord(w[key])) fail("gameplay.work." + key + " must be an object { effects }");
            else {
              const effects = parseEffects(w[key].effects, "gameplay.work." + key + ".effects", stats, hooks);
              if (effects !== void 0) work[key] = { effects };
            }
          }
        }
        block.work = work;
      }
    }
  }
  if (raw.sleep !== void 0) {
    const s = raw.sleep;
    if (!isRecord(s) || !isRecord(s.restore)) fail("gameplay.sleep must be an object with a restore block");
    else {
      const sExtra = unknownKeys(s, KNOWN_SLEEP);
      if (sExtra.length > 0) fail("gameplay.sleep: unknown field(s) " + sExtra.map((k) => JSON.stringify(k)).join(", "));
      const state = parseStateRef(s.state, "gameplay.sleep.state", hooks);
      const wakeState = parseStateRef(s.wakeState, "gameplay.sleep.wakeState", hooks);
      const restore = parseModeRestore(s.restore, "gameplay.sleep.restore", stats, fail);
      if (state !== void 0 && restore !== void 0) {
        block.sleep = {
          state,
          ...wakeState === void 0 ? {} : { wakeState },
          restore
        };
      }
    }
  }
  if (raw.modes !== void 0) {
    if (!isRecord(raw.modes)) fail("gameplay.modes must be an object keyed by mode id");
    else {
      const entries = Object.entries(raw.modes);
      if (entries.length > MAX_MODES) fail("gameplay.modes declares too many modes (max " + MAX_MODES + ")");
      const modes = {};
      for (const [name, value] of entries) {
        if (!validName(name, 24) || name === "work" || name === "sleep") {
          fail("gameplay.modes: invalid mode id " + JSON.stringify(name) + " (kebab, and not the reserved work/sleep)");
          continue;
        }
        if (!isRecord(value)) {
          fail("gameplay.modes." + name + " must be an object");
          continue;
        }
        const mExtra = unknownKeys(value, KNOWN_MODE);
        if (mExtra.length > 0) fail("gameplay.modes." + name + ": unknown field(s) " + mExtra.map((k) => JSON.stringify(k)).join(", "));
        const state = parseStateRef(value.state, "gameplay.modes." + name + ".state", hooks);
        let usable = state !== void 0;
        let label;
        if (value.label !== void 0) {
          if (typeof value.label !== "string" || value.label.trim() === "" || value.label.length > MODE_LABEL_MAX_LENGTH) {
            fail("gameplay.modes." + name + ".label must be a non-empty string of at most " + MODE_LABEL_MAX_LENGTH + " chars");
            usable = false;
          } else label = value.label.trim();
        }
        let activeLabel;
        if (value.activeLabel !== void 0) {
          if (typeof value.activeLabel !== "string" || value.activeLabel.trim() === "" || value.activeLabel.length > MODE_LABEL_MAX_LENGTH) {
            fail("gameplay.modes." + name + ".activeLabel must be a non-empty string of at most " + MODE_LABEL_MAX_LENGTH + " chars");
            usable = false;
          } else activeLabel = value.activeLabel.trim();
        }
        const restore = value.restore === void 0 ? void 0 : parseModeRestore(value.restore, "gameplay.modes." + name + ".restore", stats, fail);
        if (value.restore !== void 0 && restore === void 0) usable = false;
        if (usable && state !== void 0) {
          modes[name] = {
            state,
            ...label === void 0 ? {} : { label },
            ...activeLabel === void 0 ? {} : { activeLabel },
            ...restore === void 0 ? {} : { restore }
          };
        }
      }
      if (Object.keys(modes).length > 0) block.modes = modes;
    }
  }
  if (raw.roam !== void 0) {
    const rm = raw.roam;
    if (!isRecord(rm)) fail("gameplay.roam must be an object");
    else {
      const rExtra = unknownKeys(rm, KNOWN_ROAM);
      if (rExtra.length > 0) fail("gameplay.roam: unknown field(s) " + rExtra.map((k) => JSON.stringify(k)).join(", "));
      const state = parseStateRef(rm.state, "gameplay.roam.state", hooks);
      if (!intIn(rm.intervalMs, 1e3, 36e5)) fail("gameplay.roam.intervalMs must be an integer in [1000, 3600000]");
      if (!numIn(rm.probability, 0, 1) || rm.probability === 0) fail("gameplay.roam.probability must be a number in (0, 1]");
      if (!intIn(rm.distanceMin, 1, 2e3)) fail("gameplay.roam.distanceMin must be an integer in [1, 2000]");
      if (!intIn(rm.distanceMax, 1, 2e3)) fail("gameplay.roam.distanceMax must be an integer in [1, 2000]");
      if (intIn(rm.distanceMin, 1, 2e3) && intIn(rm.distanceMax, 1, 2e3) && rm.distanceMin > rm.distanceMax) {
        fail("gameplay.roam.distanceMin must not exceed distanceMax");
      }
      if (!intIn(rm.speed, 1, 2e3)) fail("gameplay.roam.speed must be an integer in [1, 2000] (px per second)");
      let directions;
      if (rm.directions !== void 0) {
        if (!Array.isArray(rm.directions) || rm.directions.length === 0) {
          fail("gameplay.roam.directions must be a non-empty array of up, down, left, right");
        } else {
          const picked = [];
          for (const entry of rm.directions) {
            if (typeof entry !== "string" || !PET_ROAM_DIRECTIONS.includes(entry)) {
              fail("gameplay.roam.directions entries must be up, down, left or right");
              picked.length = 0;
              break;
            }
            if (picked.includes(entry)) {
              fail("gameplay.roam.directions must not repeat " + entry);
              picked.length = 0;
              break;
            }
            picked.push(entry);
          }
          if (picked.length > 0) directions = picked;
        }
      }
      if (state !== void 0 && intIn(rm.intervalMs, 1e3, 36e5) && numIn(rm.probability, 0, 1) && rm.probability !== 0 && intIn(rm.distanceMin, 1, 2e3) && intIn(rm.distanceMax, 1, 2e3) && rm.distanceMin <= rm.distanceMax && intIn(rm.speed, 1, 2e3)) {
        block.roam = {
          state,
          intervalMs: rm.intervalMs,
          probability: rm.probability,
          distanceMin: rm.distanceMin,
          distanceMax: rm.distanceMax,
          speed: rm.speed,
          ...directions === void 0 ? {} : { directions }
        };
      }
    }
  }
  if (raw.passiveIncome !== void 0) {
    const p = raw.passiveIncome;
    if (!isRecord(p) || !validName(p.currency, 24) || !intIn(p.amount, 1, 1e4) || !intIn(p.intervalMs, 1e3, 864e5)) {
      fail("gameplay.passiveIncome must be { currency (kebab), amount 1..10000, intervalMs 1000..86400000 }");
    } else {
      block.passiveIncome = { currency: p.currency, amount: p.amount, intervalMs: p.intervalMs };
    }
  }
  if (raw.shop !== void 0) {
    const s = raw.shop;
    if (!isRecord(s) || !Array.isArray(s.items) || s.items.length === 0 || s.items.length > MAX_SHOP_ITEMS) {
      fail("gameplay.shop must be an object with 1.." + MAX_SHOP_ITEMS + " items");
    } else {
      const shopState = parseStateRef(s.state, "gameplay.shop.state", hooks);
      const items = [];
      const seen = /* @__PURE__ */ new Set();
      for (const itemRaw of s.items) {
        if (!isRecord(itemRaw) || !validName(itemRaw.id, 24)) {
          fail("gameplay.shop.items entries need a kebab id");
          continue;
        }
        if (seen.has(itemRaw.id)) {
          fail("gameplay.shop: duplicate item id " + JSON.stringify(itemRaw.id));
          continue;
        }
        seen.add(itemRaw.id);
        const iExtra = unknownKeys(itemRaw, KNOWN_SHOP_ITEM);
        if (iExtra.length > 0) fail("gameplay.shop." + itemRaw.id + ": unknown field(s) " + iExtra.map((k) => JSON.stringify(k)).join(", "));
        if (typeof itemRaw.label !== "string" || itemRaw.label.trim() === "" || itemRaw.label.length > 80) {
          fail("gameplay.shop." + itemRaw.id + ".label must be a non-empty string of at most 80 chars");
          continue;
        }
        if (!intIn(itemRaw.price, 1, 1e6)) {
          fail("gameplay.shop." + itemRaw.id + ".price must be an integer in [1, 1000000]");
          continue;
        }
        if (!validName(itemRaw.currency, 24)) {
          fail("gameplay.shop." + itemRaw.id + ".currency must be a kebab id");
          continue;
        }
        const item = {
          id: itemRaw.id,
          label: itemRaw.label.trim(),
          price: itemRaw.price,
          currency: itemRaw.currency
        };
        if (itemRaw.image !== void 0) {
          if (typeof itemRaw.image !== "string" || itemRaw.image.includes("..") || itemRaw.image.includes("\\") || itemRaw.image.startsWith("/")) {
            fail("gameplay.shop." + itemRaw.id + ".image must be a safe manifest-relative frame path");
          } else item.image = itemRaw.image;
        }
        const effects = parseEffects(itemRaw.effects, "gameplay.shop." + itemRaw.id + ".effects", stats, hooks);
        if (effects !== void 0) item.effects = effects;
        if (itemRaw.lottery !== void 0) {
          const l = itemRaw.lottery;
          if (!isRecord(l) || !Array.isArray(l.tiers) || l.tiers.length === 0 || l.tiers.length > MAX_LOTTERY_TIERS) {
            fail("gameplay.shop." + itemRaw.id + ".lottery needs 1.." + MAX_LOTTERY_TIERS + " tiers");
          } else {
            const lExtra = unknownKeys(l, KNOWN_LOTTERY);
            if (lExtra.length > 0) fail("gameplay.shop." + itemRaw.id + ".lottery: unknown field(s) " + lExtra.map((k) => JSON.stringify(k)).join(", "));
            if (l.currency !== void 0 && !validName(l.currency, 24)) fail("gameplay.shop." + itemRaw.id + ".lottery.currency must be a kebab id");
            let tierSum = 0;
            const tiers = [];
            for (const tierRaw of l.tiers) {
              if (!isRecord(tierRaw) || !numIn(tierRaw.probability, 0, 1) || tierRaw.probability === 0 || !intIn(tierRaw.prize, 0, 1e9)) {
                fail("gameplay.shop." + itemRaw.id + ".lottery.tiers entries need probability (0,1] and prize 0..1e9");
                continue;
              }
              tierSum += tierRaw.probability;
              const tier = {
                probability: tierRaw.probability,
                prize: tierRaw.prize
              };
              if (tierRaw.currency !== void 0) {
                if (!validName(tierRaw.currency, 24)) fail("gameplay.shop." + itemRaw.id + ".lottery tier currency must be a kebab id");
                else tier.currency = tierRaw.currency;
              }
              tiers.push(tier);
            }
            if (tierSum > 1 + 1e-9) fail("gameplay.shop." + itemRaw.id + ".lottery tier probabilities must sum to at most 1");
            if (tiers.length > 0) {
              const lotteryEffects = parseEffects(l.effects, "gameplay.shop." + itemRaw.id + ".lottery.effects", stats, hooks);
              item.lottery = {
                tiers,
                ...lotteryEffects === void 0 ? {} : { effects: lotteryEffects },
                ...validName(l.currency, 24) ? { currency: l.currency } : {}
              };
            }
          }
        }
        if (item.effects === void 0 && item.lottery === void 0) {
          fail("gameplay.shop." + itemRaw.id + " needs effects or a lottery");
          continue;
        }
        items.push(item);
      }
      if (items.length > 0) block.shop = { ...shopState === void 0 ? {} : { state: shopState }, items };
    }
  }
  if (raw.dragState !== void 0) {
    const state = parseStateRef(raw.dragState, "gameplay.dragState", hooks);
    if (state !== void 0) block.dragState = state;
  }
  if (raw.dragEndState !== void 0) {
    const state = parseStateRef(raw.dragEndState, "gameplay.dragEndState", hooks);
    if (state !== void 0) block.dragEndState = state;
  }
  return failed ? void 0 : block;
}

// vendor/dsh-pet-manifest/source/src/manifest-v2.ts
var PET_MANIFEST_V2 = 2;
var PET_RENDERER_KINDS = ["sprite2d", "live2d", "frames2d"];
var PET_ACTIVITY_PHASES = [
  "idle",
  "waiting",
  "thinking",
  "tool",
  "review",
  "done",
  "failed"
];
var PET_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
var PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
var SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
var KNOWN_TOP_LEVEL = /* @__PURE__ */ new Set([
  "$schema",
  "petManifestVersion",
  "id",
  "displayName",
  "description",
  "version",
  "author",
  "license",
  "homepage",
  "renderer",
  "sprite2d",
  "live2d",
  "frames2d",
  "sequences",
  "remarks",
  "gameplay"
]);
var KNOWN_SPRITE2D = /* @__PURE__ */ new Set(["spritesheetPath", "cell", "columns", "atlasRows", "frames", "tracks"]);
var KNOWN_LIVE2D = /* @__PURE__ */ new Set(["model", "scale", "translate", "motions", "expressions", "hitAreas", "lipSync"]);
var KNOWN_FRAMES2D = /* @__PURE__ */ new Set(["dir", "defaultFrameMs", "tracks", "phases", "skins"]);
var KNOWN_FRAMES2D_TRACK = /* @__PURE__ */ new Set(["frames", "frameMs", "loop", "fallback"]);
var KNOWN_SKIN = /* @__PURE__ */ new Set(["id", "label", "idleTrack", "clickActions", "gameplayTracks"]);
var KNOWN_SKIN_CLICK = /* @__PURE__ */ new Set(["track", "probability", "phrases"]);
var FRAMES2D_MAX_SKINS = 16;
var FRAMES2D_MAX_SKIN_CLICKS = 8;
var FRAMES2D_MAX_SKIN_GAMEPLAY = 8;
var SKIN_CLICK_MAX_PHRASES = 5;
var SKIN_CLICK_PHRASE_MAX_LENGTH = 120;
function parseSkinPhrases(raw, field, diag) {
  if (raw === void 0) return void 0;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > SKIN_CLICK_MAX_PHRASES || raw.some((line) => typeof line !== "string" || line.trim() === "" || line.length > SKIN_CLICK_PHRASE_MAX_LENGTH)) {
    diag.error(field + " must be 1.." + SKIN_CLICK_MAX_PHRASES + " non-empty lines of at most " + SKIN_CLICK_PHRASE_MAX_LENGTH + " chars");
    return void 0;
  }
  return raw;
}
var Diagnostics = class {
  list = [];
  source;
  constructor(source) {
    this.source = source;
  }
  error(message) {
    this.list.push({ level: "error", message: this.source + ": " + message });
  }
  warn(message) {
    this.list.push({ level: "warning", message: this.source + ": " + message });
  }
  get hasErrors() {
    return this.list.some((d) => d.level === "error");
  }
};
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function unknownKeys2(source, known) {
  return Object.keys(source).filter((key) => !known.has(key));
}
function safeManifestPath(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return void 0;
  const value = raw.trim();
  if (isAbsolute(value) || value.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(value)) return void 0;
  const segments = value.split("/").filter((segment) => segment !== "");
  if (segments.length === 0) return void 0;
  if (segments.some((segment) => segment === "." || segment === ".." || !PATH_SEGMENT_PATTERN.test(segment))) return void 0;
  return segments.join("/");
}
function parseStringBlock(record, key, diag, required) {
  const value = record[key];
  if (value === void 0) {
    if (required) diag.error("missing required field " + JSON.stringify(key));
    return void 0;
  }
  if (typeof value !== "string" || value.trim() === "") {
    diag.error("field " + JSON.stringify(key) + " must be a non-empty string");
    return void 0;
  }
  return value.trim();
}
function parsePhaseStringMap(raw, field, diag) {
  if (raw === void 0) return void 0;
  if (!isRecord2(raw)) {
    diag.error("field " + JSON.stringify(field) + " must be an object keyed by activity phase");
    return void 0;
  }
  const result = {};
  for (const [phase, value] of Object.entries(raw)) {
    if (!PET_ACTIVITY_PHASES.includes(phase)) {
      diag.error(field + ": unknown activity phase " + JSON.stringify(phase));
      continue;
    }
    if (typeof value !== "string" || value.trim() === "") {
      diag.error(field + "." + phase + " must be a non-empty string");
      continue;
    }
    result[phase] = value.trim();
  }
  return result;
}
function parseSequences(raw, diag) {
  if (raw === void 0) return void 0;
  if (!isRecord2(raw)) {
    diag.warn("sequences must be an object keyed by activity phase; ignoring");
    return void 0;
  }
  const sequences = {};
  for (const [phase, value] of Object.entries(raw)) {
    if (!PET_ACTIVITY_PHASES.includes(phase)) {
      diag.warn("sequences: unknown activity phase " + JSON.stringify(phase) + "; entry dropped");
      continue;
    }
    if (!Array.isArray(value) || value.length < 5 || value.some((item) => typeof item !== "string")) {
      diag.warn("sequences." + phase + " must be an array of at least 5 animation names; entry dropped");
      continue;
    }
    sequences[phase] = value;
  }
  return Object.keys(sequences).length === 0 ? void 0 : sequences;
}
function parseSprite2dBlock(raw, diag) {
  if (!isRecord2(raw)) {
    diag.error('renderer sprite2d requires a "sprite2d" block object');
    return void 0;
  }
  const extra = unknownKeys2(raw, KNOWN_SPRITE2D);
  if (extra.length > 0) diag.error("sprite2d: unknown field(s) " + extra.map((k) => JSON.stringify(k)).join(", "));
  const spritesheetPath = safeManifestPath(raw.spritesheetPath);
  if (spritesheetPath === void 0) {
    diag.error("sprite2d.spritesheetPath must be a safe manifest-relative path");
  }
  const block = { spritesheetPath: spritesheetPath ?? "" };
  if (raw.cell !== void 0) {
    if (!isRecord2(raw.cell)) diag.error("sprite2d.cell must be an object { width?, height? }");
    else block.cell = raw.cell;
  }
  if (raw.columns !== void 0) {
    if (typeof raw.columns !== "number" || !Number.isInteger(raw.columns) || raw.columns < 1) diag.error("sprite2d.columns must be a positive integer");
    else block.columns = raw.columns;
  }
  if (raw.atlasRows !== void 0) {
    if (typeof raw.atlasRows !== "number" || !Number.isInteger(raw.atlasRows) || raw.atlasRows < 1) diag.error("sprite2d.atlasRows must be a positive integer");
    else block.atlasRows = raw.atlasRows;
  }
  if (raw.frames !== void 0) {
    if (!Array.isArray(raw.frames) || raw.frames.some((v) => typeof v !== "number" || !Number.isInteger(v) || v < 0)) {
      diag.error("sprite2d.frames must be an array of non-negative integers");
    } else block.frames = raw.frames;
  }
  if (raw.tracks !== void 0) {
    if (!isRecord2(raw.tracks)) diag.error("sprite2d.tracks must be an object keyed by animation");
    else block.tracks = raw.tracks;
  }
  return diag.hasErrors ? void 0 : block;
}
function parseLive2dBlock(raw, diag) {
  if (!isRecord2(raw)) {
    diag.error('renderer live2d requires a "live2d" block object');
    return void 0;
  }
  const extra = unknownKeys2(raw, KNOWN_LIVE2D);
  if (extra.length > 0) diag.error("live2d: unknown field(s) " + extra.map((k) => JSON.stringify(k)).join(", "));
  const model = safeManifestPath(raw.model);
  if (model === void 0) {
    diag.error("live2d.model must be a safe manifest-relative path to a .model3.json");
  } else if (!model.endsWith(".model3.json")) {
    diag.error("live2d.model must point at a .model3.json file");
  }
  const motions = parsePhaseStringMap(raw.motions, "live2d.motions", diag);
  if (raw.motions === void 0) diag.error('live2d.motions is required (at least an "idle" group)');
  else if (motions !== void 0 && motions.idle === void 0) diag.error("live2d.motions.idle is required (unmapped phases fall back to it)");
  const block = {
    model: model ?? "",
    motions: motions ?? { idle: "" }
  };
  if (raw.scale !== void 0) {
    if (typeof raw.scale !== "number" || !Number.isFinite(raw.scale) || raw.scale <= 0 || raw.scale > 10) {
      diag.error("live2d.scale must be a number in (0, 10]");
    } else block.scale = raw.scale;
  }
  if (raw.translate !== void 0) {
    if (!isRecord2(raw.translate) || raw.translate.x !== void 0 && typeof raw.translate.x !== "number" || raw.translate.y !== void 0 && typeof raw.translate.y !== "number") {
      diag.error("live2d.translate must be an object { x?: number, y?: number }");
    } else block.translate = raw.translate;
  }
  const expressions = parsePhaseStringMap(raw.expressions, "live2d.expressions", diag);
  if (expressions !== void 0) block.expressions = expressions;
  if (raw.hitAreas !== void 0) {
    if (!Array.isArray(raw.hitAreas) || raw.hitAreas.some((v) => typeof v !== "string" || v.trim() === "")) {
      diag.error("live2d.hitAreas must be an array of non-empty strings");
    } else block.hitAreas = raw.hitAreas;
  }
  if (raw.lipSync !== void 0) {
    if (typeof raw.lipSync !== "boolean") diag.error("live2d.lipSync must be a boolean");
    else block.lipSync = raw.lipSync;
  }
  return diag.hasErrors ? void 0 : block;
}
var FRAMES2D_TRACK_NAME = /^[a-z0-9][a-z0-9-]*$/;
var FRAMES2D_MAX_TRACKS = 64;
var FRAMES2D_MAX_FRAMES = 64;
var FRAMES2D_MIN_FRAME_MS = 16;
var FRAMES2D_MAX_FRAME_MS = 5e3;
var FRAMES2D_IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([".webp", ".png", ".gif", ".jpg", ".jpeg"]);
function validTrackName(name) {
  return name.length <= 32 && FRAMES2D_TRACK_NAME.test(name);
}
function safeFrameName(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return void 0;
  const value = raw.trim();
  if (value.includes("/") || value.includes("\\") || !PATH_SEGMENT_PATTERN.test(value)) return void 0;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return void 0;
  if (!FRAMES2D_IMAGE_EXTENSIONS.has(value.slice(dot).toLowerCase())) return void 0;
  return value;
}
function parseFrames2dTrack(raw, field, diag) {
  if (!isRecord2(raw)) {
    diag.error(field + " must be an object");
    return void 0;
  }
  const extra = unknownKeys2(raw, KNOWN_FRAMES2D_TRACK);
  if (extra.length > 0) diag.error(field + ": unknown field(s) " + extra.map((k) => JSON.stringify(k)).join(", "));
  const track = {};
  if (raw.frames !== void 0) {
    if (!Array.isArray(raw.frames) || raw.frames.length === 0) {
      diag.error(field + ".frames must be a non-empty array of frame file names");
    } else if (raw.frames.length > FRAMES2D_MAX_FRAMES) {
      diag.error(field + ".frames declares too many frames (" + raw.frames.length + ", max " + FRAMES2D_MAX_FRAMES + ")");
    } else {
      const frames = [];
      for (const entry of raw.frames) {
        const safe = safeFrameName(entry);
        if (safe === void 0) diag.error(field + ".frames entry " + JSON.stringify(String(entry)) + " is not a safe image file name");
        else frames.push(safe);
      }
      if (frames.length === raw.frames.length) track.frames = frames;
    }
  }
  if (raw.frameMs !== void 0) {
    if (!Array.isArray(raw.frameMs) || raw.frameMs.length === 0 || raw.frameMs.some((v) => typeof v !== "number" || !Number.isInteger(v) || v < FRAMES2D_MIN_FRAME_MS || v > FRAMES2D_MAX_FRAME_MS)) {
      diag.error(field + ".frameMs must be a non-empty array of integer ms in [" + FRAMES2D_MIN_FRAME_MS + ", " + FRAMES2D_MAX_FRAME_MS + "]");
    } else if (track.frames === void 0) {
      diag.error(field + ".frameMs requires a valid explicit frames list (directory tracks use filename-encoded ms or defaultFrameMs)");
    } else if (raw.frameMs.length !== track.frames.length) {
      diag.error(field + ".frameMs must have the same length as frames");
    } else {
      track.frameMs = raw.frameMs;
    }
  }
  if (raw.loop !== void 0) {
    if (typeof raw.loop !== "boolean") diag.error(field + ".loop must be a boolean");
    else track.loop = raw.loop;
  }
  if (raw.fallback !== void 0) {
    if (typeof raw.fallback !== "string" || !validTrackName(raw.fallback)) diag.error(field + ".fallback must be a track name");
    else track.fallback = raw.fallback;
  }
  return diag.hasErrors ? void 0 : track;
}
function parseFrames2dBlock(raw, diag) {
  if (!isRecord2(raw)) {
    diag.error('renderer frames2d requires a "frames2d" block object');
    return void 0;
  }
  const extra = unknownKeys2(raw, KNOWN_FRAMES2D);
  if (extra.length > 0) diag.error("frames2d: unknown field(s) " + extra.map((k) => JSON.stringify(k)).join(", "));
  const block = { tracks: {}, phases: { idle: "" } };
  if (raw.dir !== void 0) {
    const dir = safeManifestPath(raw.dir);
    if (dir === void 0) diag.error("frames2d.dir must be a safe manifest-relative directory");
    else block.dir = dir;
  }
  if (raw.defaultFrameMs !== void 0) {
    if (typeof raw.defaultFrameMs !== "number" || !Number.isInteger(raw.defaultFrameMs) || raw.defaultFrameMs < FRAMES2D_MIN_FRAME_MS || raw.defaultFrameMs > FRAMES2D_MAX_FRAME_MS) {
      diag.error("frames2d.defaultFrameMs must be an integer in [" + FRAMES2D_MIN_FRAME_MS + ", " + FRAMES2D_MAX_FRAME_MS + "]");
    } else block.defaultFrameMs = raw.defaultFrameMs;
  }
  const tracks = {};
  if (!isRecord2(raw.tracks)) {
    diag.error("frames2d.tracks is required and must be an object keyed by track name");
  } else {
    const entries = Object.entries(raw.tracks);
    if (entries.length === 0) diag.error("frames2d.tracks must declare at least one track");
    if (entries.length > FRAMES2D_MAX_TRACKS) diag.error("frames2d.tracks declares too many tracks (" + entries.length + ", max " + FRAMES2D_MAX_TRACKS + ")");
    for (const [name, value] of entries) {
      if (!validTrackName(name)) {
        diag.error("frames2d.tracks: invalid track name " + JSON.stringify(name) + " (lowercase kebab, at most 32 chars)");
        continue;
      }
      const track = parseFrames2dTrack(value, "frames2d.tracks." + name, diag);
      if (track !== void 0) tracks[name] = track;
    }
  }
  block.tracks = tracks;
  const phases = parsePhaseStringMap(raw.phases, "frames2d.phases", diag);
  if (raw.phases === void 0) diag.error('frames2d.phases is required (at least an "idle" mapping)');
  else if (phases !== void 0 && phases.idle === void 0) diag.error("frames2d.phases.idle is required (unmapped phases fall back to it)");
  const phasesValid = phases !== void 0 && phases.idle !== void 0;
  if (phasesValid) block.phases = phases;
  if (phasesValid) {
    for (const [phase, target] of Object.entries(block.phases)) {
      if (target !== void 0 && tracks[target] === void 0) diag.error("frames2d.phases." + phase + " references unknown track " + JSON.stringify(target));
    }
  }
  for (const [name, track] of Object.entries(tracks)) {
    if (track.fallback !== void 0 && tracks[track.fallback] === void 0) {
      diag.error("frames2d.tracks." + name + ".fallback references unknown track " + JSON.stringify(track.fallback));
    }
  }
  if (raw.skins !== void 0) {
    if (!Array.isArray(raw.skins) || raw.skins.length === 0 || raw.skins.length > FRAMES2D_MAX_SKINS) {
      diag.error("frames2d.skins must be an array of 1.." + FRAMES2D_MAX_SKINS + " skins");
    } else {
      const skins = [];
      const seen = /* @__PURE__ */ new Set();
      for (const [index, entry] of raw.skins.entries()) {
        const field = "frames2d.skins[" + index + "]";
        if (!isRecord2(entry)) {
          diag.error(field + " must be an object");
          continue;
        }
        const extra2 = unknownKeys2(entry, KNOWN_SKIN);
        if (extra2.length > 0) diag.error(field + ": unknown field(s) " + extra2.map((k) => JSON.stringify(k)).join(", "));
        const id = typeof entry.id === "string" ? entry.id.trim() : "";
        if (id === "" || id.length > 24 || !FRAMES2D_TRACK_NAME.test(id)) {
          diag.error(field + ".id must be a lowercase kebab id of at most 24 chars");
          continue;
        }
        if (seen.has(id)) {
          diag.error(field + ": duplicate skin id " + JSON.stringify(id));
          continue;
        }
        seen.add(id);
        const label = typeof entry.label === "string" ? entry.label.trim() : "";
        if (label === "" || label.length > 40) {
          diag.error(field + ".label must be a non-empty string of at most 40 chars");
          continue;
        }
        const idleTrack = typeof entry.idleTrack === "string" ? entry.idleTrack : "";
        if (!validTrackName(idleTrack) || tracks[idleTrack] === void 0) {
          diag.error(field + ".idleTrack must name a declared frames2d track");
          continue;
        }
        let clickActions;
        if (entry.clickActions !== void 0) {
          if (!Array.isArray(entry.clickActions) || entry.clickActions.length === 0 || entry.clickActions.length > FRAMES2D_MAX_SKIN_CLICKS) {
            diag.error(field + ".clickActions must be an array of 1.." + FRAMES2D_MAX_SKIN_CLICKS + " actions");
          } else {
            const resolved = [];
            for (const [cIndex, action] of entry.clickActions.entries()) {
              const cField = field + ".clickActions[" + cIndex + "]";
              if (!isRecord2(action)) {
                diag.error(cField + " must be an object");
                continue;
              }
              const cExtra = unknownKeys2(action, KNOWN_SKIN_CLICK);
              if (cExtra.length > 0) diag.error(cField + ": unknown field(s) " + cExtra.map((k) => JSON.stringify(k)).join(", "));
              const trackName = typeof action.track === "string" ? action.track : "";
              if (!validTrackName(trackName) || tracks[trackName] === void 0) {
                diag.error(cField + ".track must name a declared frames2d track");
                continue;
              }
              if (typeof action.probability !== "number" || !Number.isFinite(action.probability) || action.probability <= 0 || action.probability > 1) {
                diag.error(cField + ".probability must be a number in (0, 1]");
                continue;
              }
              const phrases = parseSkinPhrases(action.phrases, cField + ".phrases", diag);
              resolved.push({ track: trackName, probability: action.probability, ...phrases === void 0 ? {} : { phrases } });
            }
            if (resolved.length > 0) clickActions = resolved;
          }
        }
        let gameplayTracks;
        if (entry.gameplayTracks !== void 0) {
          if (!isRecord2(entry.gameplayTracks)) {
            diag.error(field + ".gameplayTracks must be an object mapping gameplay state names to tracks");
          } else {
            const states = Object.keys(entry.gameplayTracks);
            if (states.length === 0 || states.length > FRAMES2D_MAX_SKIN_GAMEPLAY) {
              diag.error(field + ".gameplayTracks must map 1.." + FRAMES2D_MAX_SKIN_GAMEPLAY + " gameplay states");
            } else {
              const resolvedTracks = {};
              for (const state of states) {
                if (!/^[a-z0-9][a-z0-9-]*$/.test(state)) {
                  diag.error(field + ".gameplayTracks key " + JSON.stringify(state) + " must be a lowercase kebab state name");
                  continue;
                }
                const gTrack = entry.gameplayTracks[state];
                if (typeof gTrack !== "string" || !validTrackName(gTrack) || tracks[gTrack] === void 0) {
                  diag.error(field + ".gameplayTracks[" + JSON.stringify(state) + "] must name a declared frames2d track");
                  continue;
                }
                resolvedTracks[state] = gTrack;
              }
              if (Object.keys(resolvedTracks).length > 0) gameplayTracks = resolvedTracks;
            }
          }
        }
        skins.push({ id, label, idleTrack, ...clickActions === void 0 ? {} : { clickActions }, ...gameplayTracks === void 0 ? {} : { gameplayTracks } });
      }
      if (skins.length > 0) block.skins = skins;
    }
  }
  return diag.hasErrors ? void 0 : block;
}
function compatV1(source, diag) {
  const id = parseStringBlock(source, "id", diag, true);
  if (id !== void 0 && !PET_ID_PATTERN.test(id)) {
    diag.error("id " + JSON.stringify(id) + " is not a lowercase kebab id");
  }
  const displayName = typeof source.displayName === "string" && source.displayName.trim() !== "" ? source.displayName.trim() : id;
  const spritesheetRaw = source.spritesheetPath === void 0 ? "spritesheet.webp" : source.spritesheetPath;
  const spritesheetPath = safeManifestPath(spritesheetRaw);
  if (spritesheetPath === void 0) {
    diag.error("spritesheetPath " + JSON.stringify(String(source.spritesheetPath)) + " is not a safe relative path");
  }
  if (source.license === void 0) {
    diag.warn("v1 compat read: no license field; run scripts/dsh-pet-migrate-v2 to migrate this pet");
  }
  const sprite2d = { spritesheetPath: spritesheetPath ?? "spritesheet.webp" };
  if (isRecord2(source.cell)) sprite2d.cell = source.cell;
  if (typeof source.columns === "number") sprite2d.columns = source.columns;
  if (Array.isArray(source.frames)) sprite2d.frames = source.frames;
  if (isRecord2(source.tracks)) sprite2d.tracks = source.tracks;
  if (source.spriteVersionNumber === 2) sprite2d.atlasRows = 11;
  const manifest = {
    petManifestVersion: PET_MANIFEST_V2,
    id: id ?? "",
    displayName: displayName ?? "",
    renderer: "sprite2d",
    sprite2d
  };
  if (typeof source.description === "string" && source.description.trim() !== "") manifest.description = source.description.trim();
  if (typeof source.license === "string" && source.license.trim() !== "") manifest.license = source.license.trim();
  const sequences = parseSequences(source.sequences, diag);
  if (sequences !== void 0) manifest.sequences = sequences;
  if (source.remarks !== void 0) manifest.remarks = source.remarks;
  return diag.hasErrors ? void 0 : manifest;
}
function parseV2(source, diag) {
  const extra = unknownKeys2(source, KNOWN_TOP_LEVEL);
  if (extra.length > 0) diag.error("unknown top-level field(s) " + extra.map((k) => JSON.stringify(k)).join(", "));
  if (source.petManifestVersion !== PET_MANIFEST_V2) {
    diag.error("petManifestVersion must be 2 (got " + JSON.stringify(source.petManifestVersion) + ")");
  }
  const id = parseStringBlock(source, "id", diag, true);
  if (id !== void 0 && (!PET_ID_PATTERN.test(id) || id.length > 64)) {
    diag.error("id " + JSON.stringify(id) + " must be a lowercase kebab id of at most 64 chars");
  }
  const displayName = parseStringBlock(source, "displayName", diag, true);
  const license = parseStringBlock(source, "license", diag, true);
  const rendererRaw = source.renderer === void 0 ? "sprite2d" : source.renderer;
  if (!PET_RENDERER_KINDS.includes(rendererRaw)) {
    diag.error("unknown renderer " + JSON.stringify(rendererRaw) + "; expected one of " + PET_RENDERER_KINDS.join(", "));
  }
  const renderer = rendererRaw;
  const manifest = {
    petManifestVersion: PET_MANIFEST_V2,
    id: id ?? "",
    displayName: displayName ?? "",
    renderer
  };
  if (license !== void 0) manifest.license = license;
  if (source.description !== void 0) {
    if (typeof source.description !== "string" || source.description.length > 500) diag.error("description must be a string of at most 500 chars");
    else manifest.description = source.description;
  }
  if (source.version !== void 0) {
    if (typeof source.version !== "string" || !SEMVER_PATTERN.test(source.version)) diag.error("version must be a semver string (x.y.z)");
    else manifest.version = source.version;
  }
  if (source.author !== void 0) {
    if (typeof source.author !== "string" || source.author.length > 128) diag.error("author must be a string of at most 128 chars");
    else manifest.author = source.author;
  }
  if (source.homepage !== void 0) {
    if (typeof source.homepage !== "string") diag.error("homepage must be a string URL");
    else manifest.homepage = source.homepage;
  }
  if (renderer === "sprite2d") {
    const block = parseSprite2dBlock(source.sprite2d, diag);
    if (block !== void 0) manifest.sprite2d = block;
    if (source.live2d !== void 0) diag.error("renderer sprite2d must not declare a live2d block");
    if (source.frames2d !== void 0) diag.error("renderer sprite2d must not declare a frames2d block");
  } else if (renderer === "live2d") {
    const block = parseLive2dBlock(source.live2d, diag);
    if (block !== void 0) manifest.live2d = block;
    if (source.sprite2d !== void 0) diag.error("renderer live2d must not declare a sprite2d block");
    if (source.frames2d !== void 0) diag.error("renderer live2d must not declare a frames2d block");
  } else if (renderer === "frames2d") {
    const block = parseFrames2dBlock(source.frames2d, diag);
    if (block !== void 0) manifest.frames2d = block;
    if (source.sprite2d !== void 0) diag.error("renderer frames2d must not declare a sprite2d block");
    if (source.live2d !== void 0) diag.error("renderer frames2d must not declare a live2d block");
  }
  if (source.gameplay !== void 0) {
    if (renderer !== "frames2d") {
      diag.error("gameplay currently requires renderer frames2d (its state references name frames2d tracks)");
    } else {
      const gameplay = parseGameplayManifest(source.gameplay, {
        stateNames: new Set(Object.keys(manifest.frames2d?.tracks ?? {})),
        error: (message) => diag.error("gameplay: " + message)
      });
      if (gameplay !== void 0) manifest.gameplay = gameplay;
    }
  }
  const sequences = parseSequences(source.sequences, diag);
  if (sequences !== void 0) manifest.sequences = sequences;
  if (source.remarks !== void 0 && !isRecord2(source.remarks)) diag.error("remarks must be an object of remark pools");
  else if (source.remarks !== void 0) manifest.remarks = source.remarks;
  return diag.hasErrors ? void 0 : manifest;
}
function parsePetManifest(raw, sourceLabel) {
  const diag = new Diagnostics(sourceLabel);
  if (!isRecord2(raw)) {
    diag.error("manifest is not an object");
    return { ok: false, diagnostics: diag.list };
  }
  if (raw.petManifestVersion === void 0) {
    const manifest2 = compatV1(raw, diag);
    if (manifest2 === void 0) return { ok: false, diagnostics: diag.list };
    diag.warn('v1 compat read: manifest treated as renderer "sprite2d"; run scripts/dsh-pet-migrate-v2 to migrate');
    return { ok: true, manifest: manifest2, migrated: "v1-compat", diagnostics: diag.list };
  }
  const manifest = parseV2(raw, diag);
  if (manifest === void 0) return { ok: false, diagnostics: diag.list };
  return { ok: true, manifest, migrated: void 0, diagnostics: diag.list };
}
export {
  FRAMES2D_MAX_SKINS,
  FRAMES2D_MAX_SKIN_CLICKS,
  FRAMES2D_MAX_SKIN_GAMEPLAY,
  KNOWN_FRAMES2D,
  KNOWN_FRAMES2D_TRACK,
  KNOWN_LIVE2D,
  KNOWN_SKIN,
  KNOWN_SKIN_CLICK,
  KNOWN_SPRITE2D,
  KNOWN_TOP_LEVEL,
  PET_ACTIVITY_PHASES,
  PET_MANIFEST_V2,
  PET_RENDERER_KINDS,
  parsePetManifest,
  safeManifestPath
};
