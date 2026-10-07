// CareerBot's identity on every OpenRouter call (openrouter.ai/docs/app-attribution): the deployment's address and the
// app's name, so usage counts toward CareerBot wherever it's hosted. Nothing about the person goes with them.
export function openrouterHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "HTTP-Referer": process.env.SITE_URL || "https://careerbot.dev", "X-OpenRouter-Title": "CareerBot", "X-Title": "CareerBot", ...extra };
}
