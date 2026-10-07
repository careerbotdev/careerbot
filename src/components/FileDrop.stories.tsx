import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { FileDrop, type ChosenFile } from "./FileDrop";

const meta = { title: "Components/FileDrop", component: FileDrop, args: { onFile: () => {}, onRemove: () => {} } } satisfies Meta<typeof FileDrop>;
export default meta;
type Story = StoryObj<typeof meta>;

function Drop({ initial }: { initial: ChosenFile | null }) {
  const [file, setFile] = useState(initial);
  return <FileDrop file={file} onFile={(f) => setFile({ name: f.name, size: f.size, progress: 0.6 })} onRemove={() => setFile(null)} />;
}

// The picker is ours; the native file input stays hidden underneath. The chosen file shows its size, upload and remove.
export const File: Story = {
  render: () => (
    <div className="max-w-[540px]">
      <Drop initial={{ name: "Castellano resume 2026.pdf", size: 217_088, progress: 0.6 }} />
    </div>
  ),
};

// Uploaded: the bar goes and the row stays.
export const Uploaded: Story = {
  render: () => (
    <div className="max-w-[540px]">
      <Drop initial={{ name: "Castellano resume 2026.pdf", size: 217_088 }} />
    </div>
  ),
};

// Below 768px: a full-width button that opens the phone's file picker; there's nothing to drop onto.
export const OnAPhone: Story = {
  name: "On a phone",
  globals: { viewport: { value: "mobile2" }, theme: "light" },
  render: () => <Drop initial={{ name: "Castellano resume 2026.pdf", size: 217_088, progress: 0.6 }} />,
};
