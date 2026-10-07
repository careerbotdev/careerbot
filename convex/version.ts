import pkg from "../package.json";

// The version of CareerBot these functions belong to: package.json's at deploy time (`pnpm release:prepare` sets it),
// bundled in when the functions are deployed.
export const VERSION: string = pkg.version;
