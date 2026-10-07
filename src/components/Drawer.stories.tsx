import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "./Button";
import { Drawer } from "./Drawer";
import { Menu } from "./Menu";
import { StatusTag } from "./StatusTag";

const meta = { title: "Components/Drawer", component: Drawer } satisfies Meta<typeof Drawer>;
export default meta;
type Story = StoryObj<typeof meta>;

// At medium widths the third pane slides over the item as a drawer. The frame holds its own overlays
// (data-overlay-root) so the drawer opens inside it, over the resume it belongs to. Esc, a click outside, the close
// button or a swipe to the right closes it; the button opens it again. On a phone it is the sheet.
function TailoredResume() {
  const [open, setOpen] = useState(true);
  return (
    <div data-overlay-root className="relative h-104.5 w-141 max-w-full overflow-hidden border [transform:translateZ(0)]">
      <div className="flex flex-col gap-3 p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="text-title-md leading-title-md font-semibold">Supply Chain Product resume</span>
          <Button size="sm" icon="thirdPane" onClick={() => setOpen(true)}>
            Tailored resume
          </Button>
        </div>
        <p className="max-w-80 text-body-sm leading-body-sm text-muted">
          Network Operations Manager at Ironbridge Logistics, then Senior Supply Planning Manager at Brightwater Provisions: freight networks, plant
          schedules and the software behind them.
        </p>
      </div>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Tailored resume"
        width={360}
        actions={
          <>
            <StatusTag tone="good">Up to date</StatusTag>
            <Menu
              label="More for the tailored resume"
              items={[
                { label: "Export as PDF", icon: "export", keys: "E" },
                { label: "Copy link", icon: "link" },
                "separator",
                { label: "Write it again", icon: "tryAgain", hint: "About 1 credit" },
              ]}
            />
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <h3 className="text-body-sm leading-body-sm font-semibold">Network Operations Manager, Ironbridge Logistics</h3>
          {[
            "Opened the Ohio Valley cross-dock and planned its first 40 lanes.",
            "Led the move to a new transportation management system for about 180 dispatchers and planners at four terminals.",
          ].map((line) => (
            <p key={line} className="flex gap-2 text-body-sm leading-body-sm">
              <span aria-hidden="true" className="text-muted">
                –
              </span>
              {line}
            </p>
          ))}
        </div>
      </Drawer>
    </div>
  );
}

export const Open: Story = { args: { open: true, onOpenChange: () => {}, title: "", children: null }, render: () => <TailoredResume /> };
