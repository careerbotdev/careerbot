import { redirect } from "next/navigation";

// A role opens in the panel of Pursuits, for the direction it was opened from.
export default async function RolePage({ params, searchParams }: PageProps<"/roles/[id]">) {
  const { id } = await params;
  const { direction } = await searchParams;
  redirect(`/pursuits?role=${encodeURIComponent(id)}${typeof direction === "string" ? `&direction=${encodeURIComponent(direction)}` : ""}`);
}
