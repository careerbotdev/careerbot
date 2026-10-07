import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Avatar } from "./Avatar";
import { Icons } from "./icons";

const meta = { title: "Components/Avatar", component: Avatar } satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;

const sizes = [40, 32, 24, 20] as const;

export const Avatars: Story = {
  name: "Avatar",
  args: { name: "Wren Castellano", you: true },
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        {sizes.map((s) => (
          <Avatar key={s} name="Wren Castellano" you size={s} />
        ))}
        <span className="text-body-sm leading-body-sm text-muted">You</span>
      </div>
      <div className="flex items-end gap-3">
        {sizes.map((s) => (
          <Avatar key={s} name="Loadstar Systems" company size={s} />
        ))}
        <span className="text-body-sm leading-body-sm text-muted">A company or person you found</span>
      </div>
      <div className="flex flex-col gap-2.5 border-t pt-3">
        <div className="flex items-center gap-2.5">
          <Avatar name="Rafael Duarte" />
          <div className="flex flex-col text-body-sm leading-body-sm">
            <span className="font-medium text-text">Rafael Duarte</span>
            <span className="text-muted">Head of Product · Loadstar Systems</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Avatar name="Wren Castellano" you size={24} />
          <span className="text-body-sm leading-body-sm font-medium text-text">Wren Castellano</span>
          <Icons.switch className="text-muted" aria-hidden="true" />
        </div>
      </div>
    </div>
  ),
};
