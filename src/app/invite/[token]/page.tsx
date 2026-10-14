import { OnToToday } from "../../shell/OnToToday";

// An invite's link (careerbot.dev/invite/<token>). Signed out, the frame (Shell) shows the invite there (SignIn,
// InviteScreen): what the beta is and the ways to sign in; once signed in, this goes on to Today and Getting started.
export default function InvitePage() {
  return <OnToToday />;
}
