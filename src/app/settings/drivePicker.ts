"use client";

// Google's Picker, for choosing the folder the CareerBot folder lives in. The browser asks Google for its own
// short-lived Drive token (Google Identity Services), so CareerBot's stored tokens never reach the page; the Picker
// shows their folders, and only the chosen folder's id and name go back to CareerBot. Choosing a folder there is what
// lets CareerBot (drive.file) put files in it. Google's scripts load the first time it opens.

type PickerDoc = { id: string; name: string };
type PickerData = { action: string; docs?: PickerDoc[] };
type PickerBuilder = {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(fn: (data: PickerData) => void): PickerBuilder;
  build(): { setVisible(on: boolean): void };
};
type Google = {
  accounts: {
    oauth2: {
      initTokenClient(config: { client_id: string; scope: string; hint?: string; callback: (r: { access_token?: string }) => void; error_callback?: () => void }): { requestAccessToken(o?: { prompt?: string }): void };
    };
  };
  picker: {
    Action: { PICKED: string; CANCEL: string };
    ViewId: { FOLDERS: string };
    DocsView: new (id: string) => { setSelectFolderEnabled(on: boolean): unknown; setIncludeFolders(on: boolean): unknown; setMimeTypes(types: string): unknown };
    PickerBuilder: new () => PickerBuilder;
  };
};
declare global {
  interface Window {
    gapi?: { load(name: string, done: () => void): void };
    google?: Google;
  }
}

const NOT_OPENED = "Google didn’t open your Drive. Try again.";
const loaded = new Map<string, Promise<void>>();

function script(src: string) {
  const known = loaded.get(src);
  if (known) return known;
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const s = document.createElement("script");
  s.src = src;
  s.async = true;
  s.onload = () => resolve();
  s.onerror = () => {
    loaded.delete(src);
    reject(new Error("Google’s folder picker didn’t load. Try again."));
  };
  document.head.appendChild(s);
  loaded.set(src, promise);
  return promise;
}

export type PickerConfig = { clientId: string; apiKey: string; appId: string };

// The folder they chose, or null when they closed the Picker.
export async function pickFolder(config: PickerConfig, account: string): Promise<PickerDoc | null> {
  await Promise.all([script("https://apis.google.com/js/api.js"), script("https://accounts.google.com/gsi/client")]);
  const ready = Promise.withResolvers<void>();
  window.gapi!.load("picker", ready.resolve);
  await ready.promise;
  const google = window.google!;

  const granted = Promise.withResolvers<string>();
  google.accounts.oauth2
    .initTokenClient({
      client_id: config.clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      hint: account,
      callback: (r) => (r.access_token ? granted.resolve(r.access_token) : granted.reject(new Error(NOT_OPENED))),
      error_callback: () => granted.reject(new Error(NOT_OPENED)),
    })
    .requestAccessToken({ prompt: "" });
  const token = await granted.promise;

  const chosen = Promise.withResolvers<PickerDoc | null>();
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS);
  view.setSelectFolderEnabled(true);
  view.setIncludeFolders(true);
  view.setMimeTypes("application/vnd.google-apps.folder");
  new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(token)
    .setDeveloperKey(config.apiKey)
    .setAppId(config.appId)
    .setTitle("Choose where your CareerBot folder goes")
    .setCallback((data) => {
      if (data.action === google.picker.Action.PICKED && data.docs?.[0]) chosen.resolve({ id: data.docs[0].id, name: data.docs[0].name });
      else if (data.action === google.picker.Action.CANCEL) chosen.resolve(null);
    })
    .build()
    .setVisible(true);
  return chosen.promise;
}
