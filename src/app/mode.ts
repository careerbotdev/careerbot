// A copy someone runs themselves: CAREERBOT_MODE=self-hosted when it's built (the Docker image sets it; next.config.ts
// fixes it into the build). / is the app, with the sign-in when signed out (username and password; convex/account.ts),
// and careerbot.dev's website isn't there: no Home, How it works, Open source, Questions, waitlist, analytics or
// careerbot.dev privacy page. Unset: careerbot.dev.
export const SELF_HOSTED = process.env.CAREERBOT_MODE === "self-hosted";

// The demo at demo.careerbot.dev: CAREERBOT_MODE=demo, built from the same release against the demo's own Convex
// deployment, which holds only the read-only demo (convex/demo.ts). Signed out, / and every other address show the
// demo's entry (src/app/demo) instead of a sign-in, and careerbot.dev's website isn't there, as on a self-hosted copy;
// the docs stay.
export const DEMO = process.env.CAREERBOT_MODE === "demo";

// careerbot.dev's website (Home, How it works, Open source, Questions, the waitlist and the privacy page) is in this
// build: careerbot.dev and dev.careerbot.dev, not a self-hosted copy or the demo.
export const WEBSITE = !SELF_HOSTED && !DEMO;
