import type { TourDef } from "@/components/Tour";

// Settings, Connections, Google Drive: connecting, then the row with the account, the folder and syncing.
export const DRIVE_TOUR: TourDef = {
  id: "drive",
  name: "Google Drive",
  steps: [
    { title: "Google Drive", body: "Keeps a Google Doc of each resume in a CareerBot folder in your Drive. CareerBot can only see the files it makes and the folder you choose." },
    { target: "drive.connect", title: "Connect", body: "Connect Google Drive opens Google to give CareerBot access. You come back here once it’s done." },
    { target: "drive.row", title: "Connected", body: "The Google account your Docs go to, where the CareerBot folder is and how the last sync went. Sync now writes what changed and makes again any file deleted in Drive; after a failure it reads Try again." },
    { target: "drive.row", title: "More", body: "⋯ opens the folder in Google Drive, moves it with Choose a folder, or disconnects: that asks first, stops syncing and ends access; your folder and its Docs stay in Drive." },
  ],
};
