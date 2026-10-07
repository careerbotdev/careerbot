import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Avatar } from "./Avatar";
import { ListFold } from "./ListFold";
import { List, ListRow } from "./ListRow";

const meta = { title: "Components/ListFold" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const row = (name: string, line: string) => <ListRow key={name} title={name} line={line} lead={<Avatar name={name} company size={28} />} onOpen={() => {}} />;

// Rows kept apart from the main list, each group with what's in it. Closed, a group shows only its heading.
export const SetAside: Story = {
  render: () => (
    <div className="w-90">
      <List label="Set aside" className="px-2">
        <ListFold label="Doesn’t fit your goals" count={2} note="Outside what your goals ask for. Keep any you want.">
          {row("Copperline Robotics", "Mostly hardware engineering roles")}
          {row("Bramblewood Home", "Consumer furniture, not food or freight")}
        </ListFold>
        <ListFold label="Not for me" count={2} note="Ones you passed on, with your reasons.">
          {row("Tidewell Medical Supply", "Not the work")}
          {row("Larkspur Tobacco", "Company")}
        </ListFold>
        <ListFold label="Not a place to work" count={31} defaultOpen={false} note="Staffing agencies, job boards and others that don’t hire for themselves.">
          {row("Ridgeway Staffing", "Staffing agency")}
        </ListFold>
      </List>
    </div>
  ),
};

// The note at the right of the heading on medium screens and up.
export const NoteInline: Story = {
  render: () => (
    <div className="w-120">
      <List label="Roles" className="px-2">
        <ListFold label="Against your limits" count={14} note="Against a firm limit you set" noteInline defaultOpen={false}>
          {row("Freight Operations Manager, Europe", "Kestrel Freight · Rotterdam")}
        </ListFold>
      </List>
    </div>
  ),
};
