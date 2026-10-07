// Settings, Your data's limits and the words for a file that can't be imported, shared by the server
// (exportFormat.ts, yourData.ts) and the screen (src/app/settings/YourData.tsx). Pure, with no imports.

// The largest ZIP an import takes, and the largest an export makes (a bigger one fails with EXPORT_TOO_LARGE), so every
// export goes in somewhere. It's uploaded in pieces of CHUNK_BYTES, under Convex's 20 MB limit on an HTTP action's body.
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
export const CHUNK_BYTES = 8 * 1024 * 1024;
// An export or import that hasn't shown a sign of life (its beat) for this long was cut off.
export const STALLED_MS = 3 * 60_000;

export const WRONG_FILE = "This isn’t a CareerBot export.";
export const TOO_LARGE = `This file is over ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`;
export const newer = (version: string, here: string) => `This file is from CareerBot ${version}, newer than this copy (${here}). Update this copy, then import it.`;
// A file in a newer export format than this copy reads, from a CareerBot that doesn't say it's newer (a build between
// releases).
export const NEWER_FORMAT = "This file is in a newer export format than this copy reads. Update this copy, then import it.";

// What an import reads out of a ZIP, whatever its packed size: careerbot-export.json unpacked, everything unpacked
// together, how many files it holds and how many rows. A file past any of them (a ZIP that unpacks to far more than it
// looks, say) is refused before more of it is read.
export const MAX_DATA_BYTES = 64 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 256 * 1024 * 1024;
export const MAX_ENTRIES = 10_000;
export const MAX_ROWS = 250_000;
export const TOO_MUCH_INSIDE = `This file unpacks to more than an import can take (over ${MAX_UNPACKED_BYTES / 1024 / 1024} MB, ${MAX_ENTRIES.toLocaleString("en-US")} files or ${MAX_ROWS.toLocaleString("en-US")} rows).`;
export const MISSING_FILES = "Some of the files this export stored aren’t in the ZIP. Export it again from the copy it came from.";
export const EXPORT_TOO_LARGE = `This workspace makes an export over ${MAX_IMPORT_BYTES / 1024 / 1024} MB, more than an import can take. Remove stored files you don’t need, then export again.`;
// An export holding more files than an import opens (MAX_ENTRIES, folders included), refused before the ZIP is written.
export const EXPORT_TOO_MANY_FILES = `This workspace makes an export of more than ${MAX_ENTRIES.toLocaleString("en-US")} files, more than an import can take. Remove documents or pursuits you don’t need, then export again.`;
