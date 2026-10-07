import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Person } from "../../../convex/account";
import { answer, type Answers } from "../storyConvex";

// Settings, Account on a self-hosted copy, for its stories: sam, the owner, signed in with a password, and alex, added
// a few days ago. Adding, resetting and removing change the list as the deployment would. `oauth`: Google and GitHub
// are set up too. `owner: false`: alex's own view.
export function accountFixtures({ oauth = false, owner = true }: { oauth?: boolean; owner?: boolean } = {}): Answers {
  const DAY = 86_400_000;
  const now = Date.now();
  const person = (username: string, rest: Partial<Person>): Person => ({
    id: `user-${username}` as Id<"users">,
    username,
    name: username,
    email: null,
    provider: "password",
    owner: false,
    you: false,
    addedAt: now - 40 * DAY,
    lastSignInAt: now - DAY,
    temporaryPassword: false,
    ...rest,
  });
  let people: Person[] = [person("sam", { owner: true, you: owner, lastSignInAt: now }), person("alex", { addedAt: now - 3 * DAY, you: !owner })];
  const temporary = (username: string) => ({ username, temporaryPassword: "maple-tide-4182" });
  return {
    ...answer(api.users.me, () => (owner ? { name: "sam", email: null, provider: "password", username: "sam", owner: true } : { name: "alex", email: null, provider: "password", username: "alex", owner: false })),
    ...answer(api.workspaces.current, () => ({ id: "ws" as never, name: owner ? "sam" : "alex", demo: false, asOf: null })),
    ...answer(api.auth.signInMethods, () => (oauth ? ["password" as const, "google" as const, "github" as const] : ["password" as const])),
    ...answer(api.account.people, () => (owner ? people : null)),
    ...answer(api.account.addPerson, ({ username }) => {
      const name = username.trim().toLowerCase();
      people = [...people, person(name, { addedAt: Date.now(), lastSignInAt: null, temporaryPassword: true })];
      return temporary(name);
    }),
    ...answer(api.account.resetPersonPassword, ({ userId }) => {
      people = people.map((p) => (p.id === userId ? { ...p, temporaryPassword: true } : p));
      return temporary(people.find((p) => p.id === userId)?.username ?? "alex");
    }),
    ...answer(api.account.removePerson, ({ userId }) => {
      people = people.filter((p) => p.id !== userId);
    }),
  };
}
