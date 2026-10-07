import Link from "next/link";
import { buttonLook } from "./Button";
import { Icons } from "./icons";

// The one way back from a detail page to its list, the same on every detail page: a ghost button with the back mark,
// naming where it goes.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={buttonLook("ghost", "-ml-2.5 self-start", "sm")}>
      <Icons.back aria-hidden />
      <span className="sr-only">Back to </span>
      {label}
    </Link>
  );
}
