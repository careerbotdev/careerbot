import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { callback as driveCallback, connectRedirect as driveConnect } from "./drive";
import { authorized, connectRedirect, setup, webhook } from "./github";
import { appCreated, newApp } from "./githubApp";
import { IMPORT_PATH, importUpload, importUploadOptions } from "./yourData";

const http = httpRouter();
auth.addHttpRoutes(http);

// GitHub: creating CareerBot's GitHub App (operator, once), connecting a workspace, and the app's webhook.
http.route({ path: "/github/app/new", method: "GET", handler: newApp });
http.route({ path: "/github/app/created", method: "GET", handler: appCreated });
http.route({ path: "/github/connect", method: "GET", handler: connectRedirect });
http.route({ path: "/github/setup", method: "GET", handler: setup });
http.route({ path: "/github/authorized", method: "GET", handler: authorized });
http.route({ path: "/github/webhook", method: "POST", handler: webhook });

// Google Drive: connecting a workspace (its own consent, drive.file only).
http.route({ path: "/google/drive/connect", method: "GET", handler: driveConnect });
http.route({ path: "/google/drive/callback", method: "GET", handler: driveCallback });

// Settings, Your data: the ZIP to import, stored as the signed-in sender's own import.
http.route({ path: IMPORT_PATH, method: "POST", handler: importUpload });
http.route({ path: IMPORT_PATH, method: "OPTIONS", handler: importUploadOptions });

export default http;
