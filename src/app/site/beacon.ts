// Cloudflare Web Analytics on the public website of careerbot.dev (the build whose SITE_URL is https://careerbot.dev;
// dev.careerbot.dev, local builds and copies run by others send nothing). Its beacon counts page views of the public
// pages: the page (without anything after ? or #), the site the visitor came from, their browser, operating system,
// type of device and country, and how fast the page loaded. It uses no cookies and stores nothing in the browser, and
// Cloudflare drops the IP address at its edge. It's never in the signed-in app, whose addresses and data are private:
// it's mounted only in the public site's frames (SiteFrame, and SignIn at /sign-in), never in the app's (Shell), and
// loads only once the visitor is known to be signed out. A browser that asks not to be tracked (Global Privacy
// Control or Do Not Track) isn't counted. The Cloudflare site (careerbot.dev, in the account's Web Analytics) is a
// manual install: Cloudflare's edge doesn't inject the beacon, which would put it on every page, the app's too. The
// token is public: it ships in the page.

const PRODUCTION_URL = "https://careerbot.dev";
const TOKEN = "d7c077a0ef4348288e19a3b44e0b42c0";
export const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

// Whether this build is careerbot.dev's.
export const measuredSite = (site: string | undefined) => site === PRODUCTION_URL;

// A browser asking not to be tracked: Global Privacy Control, or the older Do Not Track.
export const optedOut = (browser: { globalPrivacyControl?: boolean; doNotTrack?: string | null }) =>
  browser.globalPrivacyControl === true || browser.doNotTrack === "1";

// The beacon's settings for this visit (its data-cf-beacon), or null when this visit isn't counted. `spa: false`: the
// beacon doesn't count the page's own navigations as page views.
export function beaconConfig(visit: { site: string | undefined; signedOut: boolean; optedOut: boolean }) {
  if (!measuredSite(visit.site) || !visit.signedOut || visit.optedOut) return null;
  return JSON.stringify({ token: TOKEN, spa: false });
}
