import { redirect } from "next/navigation";

// Roles are the All roles list of Pursuits now.
export default function RolesPage() {
  redirect("/pursuits?status=all");
}
