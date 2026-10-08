import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { api } from "../../../convex/_generated/api";
import { answer, StoryConvex } from "../storyConvex";
import { Cards as CardsPart } from "./Cards";
import { Closing as ClosingPart } from "./Closing";
import { Compare as ComparePart } from "./Compare";
import { FeaturesTable as FeaturesTablePart } from "./FeaturesTable";
import { Horizons as HorizonsPart } from "./Horizons";
import { Licence as LicencePart } from "./Licence";
import { Method as MethodPart } from "./Method";
import { Needs as NeedsPart } from "./Needs";
import { PageHeader as PageHeaderPart } from "./PageHeader";
import { Pains as PainsPart } from "./Pains";
import { Paths as PathsPart } from "./Paths";
import { Portal as PortalPart } from "./Portal";
import { Questions as QuestionsPart } from "./Questions";
import { Start as StartPart } from "./Start";
import { Steps as StepsPart } from "./Steps";
import { Trust as TrustPart } from "./Trust";
import { FAQ, HOME_QUESTIONS, HOW_IT_WORKS, OPEN_SOURCE, TABLE } from "./words";

// The public pages' sections, each large (resize for medium) and on a phone. Home: Where job searches go wrong, Where
// it starts, How CareerBot fixes it, the two cards, a few questions (on a phone folded, the first open; and with
// another opened).
// How it works: the page's heading, the four steps, Two paths, See where else your experience fits, the whole search in
// one place, It writes boldly, Everything CareerBot does. Open source: the licence, what you need, how it differs.
// Questions as its own page. And the close: Home's, a page's own (Open source's words), and after joining.

const meta = { title: "Site/Parts/Sections", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: "mobile2" } };
const joins = answer(api.waitlist.join, () => ({ ok: true as const }));

export const Pains: Story = { name: "Where job searches go wrong", render: () => <PainsPart /> };
export const PainsPhone: Story = { name: "Where job searches go wrong, phone", globals: phone, render: () => <PainsPart /> };

export const Start: Story = { name: "Where it starts", render: () => <StartPart /> };
export const StartPhone: Story = { name: "Where it starts, phone", globals: phone, render: () => <StartPart /> };

export const Steps: Story = { name: "How CareerBot fixes it", render: () => <StepsPart /> };
export const StepsPhone: Story = { name: "How CareerBot fixes it, phone", globals: phone, render: () => <StepsPart /> };

export const Cards: Story = { render: () => <CardsPart /> };
export const CardsPhone: Story = { name: "Cards, phone", globals: phone, render: () => <CardsPart /> };

export const Questions: Story = { render: () => <QuestionsPart items={HOME_QUESTIONS} /> };
export const QuestionsPhone: Story = { name: "Questions, phone", globals: phone, render: () => <QuestionsPart items={HOME_QUESTIONS} /> };
export const QuestionsPhoneOpened: Story = {
  name: "Questions, phone, another opened",
  globals: phone,
  render: () => <QuestionsPart items={HOME_QUESTIONS} />,
  play: async ({ canvasElement }) => {
    const [cost] = await within(canvasElement).findAllByRole("button", { name: HOME_QUESTIONS[1].q });
    await userEvent.click(cost);
  },
};
export const QuestionsPage: Story = { name: "Questions, the page", render: () => <QuestionsPart page items={FAQ} /> };
export const QuestionsPagePhone: Story = { name: "Questions, the page, phone", globals: phone, render: () => <QuestionsPart page items={FAQ} /> };

export const PageHeader: Story = { name: "Page heading", render: () => <PageHeaderPart heading={HOW_IT_WORKS.heading} sub={HOW_IT_WORKS.sub} /> };
export const PageHeaderPhone: Story = {
  name: "Page heading, phone",
  globals: phone,
  render: () => <PageHeaderPart heading={HOW_IT_WORKS.heading} sub={HOW_IT_WORKS.sub} />,
};

export const Method: Story = { name: "Four steps", render: () => <MethodPart /> };
export const MethodPhone: Story = { name: "Four steps, phone", globals: phone, render: () => <MethodPart /> };

export const Paths: Story = { name: "Two paths", render: () => <PathsPart /> };
export const PathsPhone: Story = { name: "Two paths, phone", globals: phone, render: () => <PathsPart /> };

export const Horizons: Story = { name: "Where else your experience fits", render: () => <HorizonsPart /> };
export const HorizonsPhone: Story = { name: "Where else your experience fits, phone", globals: phone, render: () => <HorizonsPart /> };

export const Portal: Story = { name: "Your whole search", render: () => <PortalPart /> };
export const PortalPhone: Story = { name: "Your whole search, phone", globals: phone, render: () => <PortalPart /> };

export const Trust: Story = { name: "It writes boldly", render: () => <TrustPart /> };
export const TrustPhone: Story = { name: "It writes boldly, phone", globals: phone, render: () => <TrustPart /> };

export const FeaturesTable: Story = { name: "Everything CareerBot does", render: () => <FeaturesTablePart groups={TABLE} /> };
export const FeaturesTablePhone: Story = { name: "Everything CareerBot does, phone", globals: phone, render: () => <FeaturesTablePart groups={TABLE} /> };

export const Licence: Story = { name: "The licence", render: () => <LicencePart /> };
export const LicencePhone: Story = { name: "The licence, phone", globals: phone, render: () => <LicencePart /> };

export const Needs: Story = { name: "What you need to run it", render: () => <NeedsPart /> };
export const NeedsPhone: Story = { name: "What you need to run it, phone", globals: phone, render: () => <NeedsPart /> };

export const Compare: Story = { name: "How it differs", render: () => <ComparePart /> };
export const ComparePhone: Story = { name: "How it differs, phone", globals: phone, render: () => <ComparePart /> };

export const Closing: Story = {
  render: () => (
    <StoryConvex answers={joins}>
      <ClosingPart source="story" joined={false} onJoined={() => {}} />
    </StoryConvex>
  ),
};
export const ClosingPhone: Story = {
  name: "Closing, phone",
  globals: phone,
  render: () => (
    <StoryConvex answers={joins}>
      <ClosingPart source="story" joined={false} onJoined={() => {}} />
    </StoryConvex>
  ),
};
export const ClosingOwn: Story = {
  name: "Closing, a page's own",
  render: () => (
    <StoryConvex answers={joins}>
      <ClosingPart own source="story" heading={OPEN_SOURCE.closing.heading} cta={OPEN_SOURCE.closing.cta} joined={false} onJoined={() => {}} />
    </StoryConvex>
  ),
};
export const ClosingOwnPhone: Story = {
  name: "Closing, a page's own, phone",
  globals: phone,
  render: () => (
    <StoryConvex answers={joins}>
      <ClosingPart own source="story" heading={OPEN_SOURCE.closing.heading} cta={OPEN_SOURCE.closing.cta} joined={false} onJoined={() => {}} />
    </StoryConvex>
  ),
};
export const ClosingJoined: Story = {
  name: "Closing, joined",
  render: () => (
    <StoryConvex answers={joins}>
      <ClosingPart source="story" joined onJoined={() => {}} />
    </StoryConvex>
  ),
};
