import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ShareCard } from "./ShareCard";

// The card shown when a link to careerbot.dev is shared, as `pnpm share:card` draws it (1200 × 630). Light only: the
// card is an image, the same in every theme.

const meta = { title: "Site/Parts/Share card", parameters: { layout: "fullscreen" }, globals: { theme: "light" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Card: Story = { render: () => <ShareCard wordmark="/brand/wordmark-light.svg" /> };
