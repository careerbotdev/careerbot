import type { ReactNode } from "react";

// A band of the public pages: 20px sides on a phone, 40 on medium and 64 on large screens, around a column at most
// 1200 wide (the Calm boards' 120px margins at 1440). `id`: an address in the page (#features).
export function Section({ id, className = "", inner = "", children }: { id?: string; className?: string; inner?: string; children: ReactNode }) {
  return (
    <section id={id} className={`w-full px-5 md:px-10 lg:px-16 ${className}`}>
      <div className={`mx-auto w-full max-w-300 ${inner}`}>{children}</div>
    </section>
  );
}
