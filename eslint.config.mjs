import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "convex/_generated/**",
    ".open-next/**",
    "storybook-static/**",
    // fumadocs-mdx's generated docs index (source.config.ts).
    ".source/**",
  ]),
  // Screens use our themed controls from src/components, never native browser/OS controls.
  {
    files: ["src/**/*.tsx"],
    ignores: ["src/components/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name=/^(select|datalist|progress|meter)$/]",
          message: "Use a themed control from src/components instead of a native one.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value=/^(checkbox|radio|date|time|datetime-local|month|week|color|range|file)$/]",
          message: "Use a themed control from src/components instead of a native one.",
        },
        {
          // A title on a native element is the browser's tooltip; parts take `title` as their own prop (a row's name).
          selector: "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='title']",
          message: "Use the themed Tooltip part instead of a native title tooltip.",
        },
      ],
    },
  },
  // Public mutations and actions come from convex/functions.ts, which refuses them in the demo workspace before their
  // handler runs. Convex's own would skip that check.
  {
    files: ["convex/**/*.ts"],
    ignores: ["convex/functions.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "./_generated/server",
              importNames: ["mutation", "action"],
              message: "Import mutation and action from ./functions (convex/functions.ts), so the demo stays read-only.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
