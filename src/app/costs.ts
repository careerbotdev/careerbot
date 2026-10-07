// About what an AI step costs, from what it has cost them so far (estimates.costs); null until they've run it once.
export const aboutUsd = (usd: number | null | undefined) => (usd == null ? null : usd < 0.01 ? "Under $0.01" : `About $${usd.toFixed(2)}`);
