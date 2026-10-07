import { countryCode, countryName, countryNameList, type LimitLike, limitsFor, type Problem } from "./limitBuckets";
import { SETUP_LABELS, type Setup } from "./roleDetails";

// The Roles page's location filter: what a place someone types or picks means, and whether a role is there. A place is
// a US state (by name or code), a country (by name or code), or any other words (a city, a region), in any mix:
// "Texas", "TX", "Austin, TX", "United States", "London, UK". A role is there when it's in every state and country the
// place names, and one of its locations has the other words, in that state when both are named. Austin, TX is in Texas
// and in the United States; a well-known city named without its state is placed in it.

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const STATE_BY_NAME: Record<string, string> = Object.fromEntries(Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]));
// Well-known US cities often listed without their state.
const CITY_STATES: Record<string, string> = {
  "new york city": "NY", nyc: "NY", manhattan: "NY", brooklyn: "NY", "san francisco": "CA", "los angeles": "CA", "san diego": "CA", "san jose": "CA",
  "palo alto": "CA", "mountain view": "CA", "santa clara": "CA", sunnyvale: "CA", "menlo park": "CA", "el segundo": "CA", hawthorne: "CA", irvine: "CA",
  oakland: "CA", seattle: "WA", redmond: "WA", bellevue: "WA", austin: "TX", dallas: "TX", houston: "TX", "san antonio": "TX", boston: "MA", cambridge: "MA",
  chicago: "IL", denver: "CO", boulder: "CO", atlanta: "GA", miami: "FL", phoenix: "AZ", philadelphia: "PA", pittsburgh: "PA", raleigh: "NC",
  nashville: "TN", "salt lake city": "UT", minneapolis: "MN", detroit: "MI", huntsville: "AL", reston: "VA", mclean: "VA", "washington dc": "DC", "washington d.c.": "DC", "d.c.": "DC",
};

const lower = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
// A place's parts: "Austin, TX 78701" → austin, tx 78701; "US-TX-Austin" → us, tx, austin; "Winston-Salem" stays whole.
const partsOf = (place: string) =>
  lower(place)
    .split(/[,;/|()]|\s[-–]\s|(?<=(?:^|[^a-z])[a-z]{2})-|-(?=[a-z]{2}(?:[^a-z]|$))/)
    .map((s) => s.trim())
    .filter(Boolean);
// A part that names a US state: its code (with a ZIP code after it or not), its name, or a well-known city in it.
const stateOf = (part: string): string | undefined => {
  const code = part.match(/^([a-z]{2})(?: \d{5})?$/)?.[1]?.toUpperCase();
  if (code && US_STATES[code]) return code;
  return STATE_BY_NAME[part] ?? CITY_STATES[part];
};

// The states a place names. "Washington, DC" is DC, not the state.
function statesIn(place: string) {
  const parts = partsOf(place);
  const states = new Set(parts.flatMap((p) => stateOf(p) ?? []));
  if (states.has("DC")) states.delete("WA");
  return states;
}

// What a typed or picked place names: US states, countries, and other words (a city or region).
export function parsePlace(term: string) {
  const states: string[] = [];
  const countries: string[] = [];
  const words: string[] = [];
  for (const part of partsOf(term)) {
    // A city is words to find, never a state to require: Cambridge is also in England.
    const state = CITY_STATES[part] ? undefined : stateOf(part);
    const country = state ? undefined : countryCode(part);
    if (state) states.push(state);
    else if (country) countries.push(country);
    else words.push(part);
  }
  return { states, countries, words };
}

// Whether a role is in a place. `places`: its locations (any case); `countries`: the countries they name (ISO codes).
// A role outside the US doesn't count as in a state because of a code like "DE" (Berlin, DE is Germany).
export function inPlace(term: string, role: { places: string[]; countries: string[] }) {
  const want = parsePlace(term);
  if (!want.states.length && !want.countries.length && !want.words.length) return true;
  const places = role.places.map(lower);
  const us = !role.countries.length || role.countries.includes("US");
  const statesByPlace = places.map((p) => (us ? statesIn(p) : new Set<string>()));
  const roleStates = new Set(statesByPlace.flatMap((s) => [...s]));
  const roleCountries = new Set([...role.countries, ...(roleStates.size ? ["US"] : [])]);
  if (!want.countries.every((c) => roleCountries.has(c))) return false;
  if (!want.words.length) return want.states.every((s) => roleStates.has(s));
  // The words and the states in one location ("Austin, TX" isn't Austin in one place and Texas in another); a location
  // that names no state takes the role's.
  return places.some((p, i) => {
    const states = statesByPlace[i].size ? statesByPlace[i] : roleStates;
    return want.words.every((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(p)) && want.states.every((s) => states.has(s));
  });
}

// The states and countries a place is in. `countries`: those it names, when known (ISO codes).
function regionOf(place: string, countries: string[]) {
  const states = !countries.length || countries.includes("US") ? statesIn(place) : new Set<string>();
  return { states, countries: new Set([...countries, ...(states.size ? ["US"] : [])]) };
}
const disjoint = (a: Set<string>, b: Set<string>) => ![...a].some((x) => b.has(x));

// Whether a role's place is one they'll work in: "in" when it's there (a city named without its state counts when the
// role's place names no state), "out" when it's in another state or country, else "unknown" (another city in the same
// state: how far it is isn't known).
function placeVerdict(allowed: string, job: { place: string; countries: string[] }): "in" | "out" | "unknown" {
  const role = { places: [job.place], countries: job.countries };
  if (inPlace(allowed, role)) return "in";
  const want = parsePlace(allowed);
  const theirs = regionOf(allowed, want.countries);
  const its = regionOf(job.place, job.countries);
  if (want.words.length && !its.states.size && inPlace(want.words.join(", "), role)) return "in";
  if (theirs.states.size && its.states.size) return disjoint(theirs.states, its.states) ? "out" : "unknown";
  return theirs.countries.size && its.countries.size && disjoint(theirs.countries, its.countries) ? "out" : "unknown";
}

const COUNTRY_WORDS: Record<string, string> = { US: "the US", GB: "the UK" };
const countryWords = (codes: string[]) => codes.map((c) => COUNTRY_WORDS[c] ?? countryName(c)).join(" or ");
// A place by its first part: "San Francisco, CA" → San Francisco.
const short = (place: string) => {
  const first = place.split(",")[0].trim();
  return first.length > 2 ? first : place.trim();
};

// A role as its location limits read it: how it's done (unset when it doesn't say), and its places, each with the
// countries it names.
export type RoleWhere = { direction?: string; setup?: Setup; places: { place: string; countries: string[] }[] };

// Why a role is outside one location limit, in their words ("On-site in San Francisco; you work hybrid from Denver or
// remote"), or null when it isn't. A remote role is outside only when remote doesn't work for them or it names only
// other countries; a hybrid or on-site one when they don't work that way, or every place it names is outside every
// place they gave (else, with no places given, their countries). A role that doesn't say is never outside.
function outside(rule: Record<string, unknown>, job: RoleWhere): string | null {
  if (!job.setup) return null;
  const modes = Array.isArray(rule.modes) ? (rule.modes as Setup[]) : null;
  const countries = Array.isArray(rule.countries) ? (rule.countries as string[]) : [];
  const allowed = Array.isArray(rule.places) ? (rule.places as { place: string }[]).map((p) => p.place) : [];
  const jobCountries = [...new Set(job.places.flatMap((p) => p.countries))];
  const abroad = !!countries.length && !!jobCountries.length && disjoint(new Set(countries), new Set(jobCountries));
  const where = job.places.length ? ` in ${short(job.places[0].place)}${job.places.length > 1 ? ` +${job.places.length - 1}` : ""}` : "";
  let what: string | null = null;
  if (job.setup === "remote") {
    if (modes && !modes.includes("remote")) what = "Remote";
    else if (abroad) what = `Remote in ${countryWords(jobCountries)}`;
  } else if (modes && !modes.includes(job.setup)) what = SETUP_LABELS[job.setup] + where;
  else if (allowed.length ? job.places.length && job.places.every((p) => allowed.every((a) => placeVerdict(a, p) === "out")) : abroad) what = SETUP_LABELS[job.setup] + where;
  if (!what) return null;
  // What works for them: in person (the one way, if only one), near their places or in their countries; or remote.
  const local = (modes ?? ["hybrid", "onsite"]).filter((m) => m !== "remote");
  const near = allowed.length ? `from ${allowed.map(short).join(" or ")}` : countries.length ? `in ${countryWords(countries)}` : "";
  const how = modes && (local.length === 1 || !near) ? local.map((m) => SETUP_LABELS[m].toLowerCase()).join(" or ") : "";
  const ways = [local.length ? [how, near].filter(Boolean).join(" ") : "", !modes || modes.includes("remote") ? `remote${job.setup === "remote" && abroad ? ` in ${countryWords(countries)}` : ""}` : ""].filter(Boolean);
  return ways.length ? `${what}; you work ${ways.join(" or ")}` : what;
}

// What a role states that their firm location limits rule out, for its direction, as a problem with why. Preferences
// rule nothing out here (judging weighs them), and a conditional limit doesn't hold, since a role doesn't say whether
// it's a change of industry or kind of work.
export function locationProblems<L extends LimitLike>(limits: L[], job: RoleWhere): Problem[] {
  const held = limitsFor(limits.filter((l) => l.kind === "location"), { direction: job.direction }).filter((l) => l.firm === true && !l.when);
  for (const l of held) {
    const text = outside(l.rule ?? {}, job);
    if (text) return [{ what: "location", firm: true, text }];
  }
  return [];
}

export type PlaceOption = { value: string; label: string; keywords?: string[] };

// A place as it was read, in lower case, shown in title case: "austin, tx" → "Austin, TX".
export function showPlace(place: string) {
  return lower(place)
    .split(/(\s+|,|-|\/|\(|\))/)
    .map((w) => (/^[a-z]{2}$/.test(w) && (US_STATES[w.toUpperCase()] || countryName(w.toUpperCase()) !== w.toUpperCase()) ? w.toUpperCase() : w.replace(/^[a-zà-ÿ]/, (c) => c.toUpperCase())))
    .join("");
}

// What the location filter suggests: the places in their roles (most common first, not "Remote"), then the states and
// countries they're in, then every other US state and country. Each state and country can be found by its code.
export function placeOptions(rolePlaces: string[], roleCountries: string[], cap = 200): PlaceOption[] {
  const counts = new Map<string, number>();
  for (const p of rolePlaces) {
    const key = lower(p).replace(/^(hybrid|on-?site|in office)\s*[-–:]\s*/, "");
    if (key && !/remote|anywhere|multiple|various|locations?$/.test(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const seenStates = new Set([...counts.keys()].flatMap((p) => [...statesIn(p)]));
  const seenCountries = new Set([...roleCountries, ...(seenStates.size ? ["US"] : [])]);
  const state = (code: string): PlaceOption => ({ value: US_STATES[code], label: US_STATES[code], keywords: [code] });
  const country = (code: string): PlaceOption => ({ value: countryName(code), label: countryName(code), keywords: code === "US" ? ["US", "USA", "America"] : code === "GB" ? ["UK", "GB"] : [code] });
  const countries = [...new Set(countryNameList().map(([, code]) => code))];
  const out: PlaceOption[] = [
    ...[...seenCountries].map(country),
    ...[...seenStates].sort().map(state),
    ...[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, cap).map(([p]) => ({ value: showPlace(p), label: showPlace(p) })),
    ...Object.keys(US_STATES).filter((c) => !seenStates.has(c)).map(state),
    ...countries.filter((c) => !seenCountries.has(c)).map(country).sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const seen = new Set<string>();
  return out.filter((o) => !seen.has(o.label.toLowerCase()) && !!seen.add(o.label.toLowerCase()));
}
