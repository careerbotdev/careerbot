import { OnToToday } from "../shell/OnToToday";

// Sign in, from the website's header and footer. Signed out, the frame (Shell) shows the sign-in here as it does at
// any address (the demo's entry on the demo's build); once signed in (back from Google or GitHub), this goes on to
// Today.
export default function SignInPage() {
  return <OnToToday />;
}
