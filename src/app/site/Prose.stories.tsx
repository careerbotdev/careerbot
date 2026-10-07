import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ProseEmail, ProsePage, ProseSection } from "./Prose";

// A page of reading on the public site (the privacy page is one): its title, the date it was updated, the opening
// paragraph and sections, one of them with an email address; large and on a phone.

const meta = { title: "Site/Parts/Prose", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = (
  <ProsePage title="Privacy" updated="October 1, 2026" intro="CareerBot helps you with your own job search, and what you give it is used only for that.">
    <ProseSection title="The waitlist" paragraphs={["If you join the waitlist, CareerBot keeps your email, when you joined, and which sign-up form on the site you used. Ask and it’s all removed."]} />
    <ProseSection
      title="Getting a copy or deleting it"
      paragraphs={[
        <>
          Email <ProseEmail address="privacy@careerbot.dev" /> to have your account and everything in it deleted.
        </>,
        "A second paragraph in the same section.",
      ]}
    />
  </ProsePage>
);

export const Page: Story = { render: () => page };
export const Phone: Story = { globals: { viewport: { value: "mobile2" } }, render: () => page };
