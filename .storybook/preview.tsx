import type { Preview } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import { IconDefaults } from "../src/components/icons";
import { Toaster } from "../src/components/Toast";
import "../src/app/globals.css";

// Theme: light, dark, or both (how the Paper boards show every part): side by side when the story fits in half the
// window, light above dark when it doesn't. A screen (Screens/…) fills the window as it does in the app, so its two
// are always stacked, each the window's width; sized to its content instead, a screen grows to its rows' untruncated
// width and runs past a phone's edge.
const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Light, dark, or both side by side",
      toolbar: { title: "Theme", icon: "mirror", items: ["light", "dark", "both"], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: "both" },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme as string;
      const screen = context.title.startsWith("Screens/");
      useEffect(() => {
        document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
      }, [theme]);
      const pane = (mode: "light" | "dark") => (
        <div data-theme={mode} className={`${screen ? "w-full min-w-0" : "min-w-fit grow basis-0"} bg-surface p-6 text-text`}>
          <Story />
        </div>
      );
      return (
        <IconDefaults>
          {theme === "both" ? (
            <div className="flex min-h-screen flex-wrap">
              {pane("light")}
              {pane("dark")}
            </div>
          ) : (
            <div className="min-h-screen bg-surface p-6 text-text">
              <Story />
            </div>
          )}
          <Toaster />
        </IconDefaults>
      );
    },
  ],
  parameters: { layout: "fullscreen" },
};

export default preview;
