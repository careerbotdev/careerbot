import type { TourDef } from "@/components/Tour";

// Settings > Google Drive: connecting, the account, the CareerBot folder and syncing.
export const DRIVE_TOUR: TourDef = {
  id: "drive",
  name: "Google Drive",
  steps: [
    { title: "Google Drive", body: "Keeps a Google Doc of each resume in a CareerBot folder in your Drive. CareerBot can only see the files it makes and the folder you choose." },
    { target: "drive.connect", title: "Connect", body: "Connect Google Drive opens Google to give CareerBot access. You come back here once it’s done." },
    { target: "drive.account", title: "Account", body: "The Google account your Docs go to. Disconnect asks first, stops syncing and ends access; your folder and its Docs stay in Drive." },
    { target: "drive.folder", title: "CareerBot folder", body: "Where your Docs live. Open folder shows it in Google Drive; Choose a folder moves it, with everything in it, to a folder you pick." },
    { target: "drive.sync", title: "Sync", body: "How the last sync went. Sync now writes what changed and makes again any file deleted in Drive; after a failure it reads Try again." },
  ],
};
