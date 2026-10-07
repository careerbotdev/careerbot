import type { TourDef } from "@/components/Tour";

// Resumes: the list, the resume open, its page, details and notes.
export const RESUMES_TOUR: TourDef = {
  id: "resumes",
  name: "Resumes",
  steps: [
    { title: "Resumes", body: "Your base resume, one for each direction, and those tailored to a posting, all written from your approved record. Open one to read, adjust and export it." },
    { target: "resumes.tabs", title: "All and To update", body: "All lists every resume. To update shows those your record has changed under, or with a new version waiting, with Update all to write them again at once." },
    { target: "resumes.list", side: "right", title: "The list", body: "Base, then Directions, then Tailored. Each line shows how it stands and when it was written. J and K move through the list." },
    { target: "resumes.actions", title: "Export, Write again, Layout, History", body: "Export downloads it as a PDF or Word file, or copies it for Google Docs or as text. Write again writes a new version at the cost shown, to keep or discard beside this one. Layout (L) sets what shows and how; History (H) lists earlier versions to compare or restore." },
    { target: "resumes.summary", title: "The summary", body: "Click the words to put the summary in your own words on this resume. It shows Edited, and Use CareerBot’s puts the original back." },
    { target: "resumes.page", title: "The lines", body: "Point at a line to see what it’s built on, Edit it in your own words, Pin it so it always shows, or Hide it from this resume. Each one undoes with U." },
    { target: "resumes.details", side: "left", title: "Details", body: "When it was written, what it’s built on, its length and roles, and on a direction resume the resumes tailored from it and Tailor a resume." },
    { target: "resumes.notes", side: "left", title: "Notes", body: "Your own notes on this resume, dated. Nothing that writes a resume reads them." },
    { target: "resumes.more", side: "bottom", title: "More for Resumes", body: "Update all, Resumes to update, and this tour again." },
  ],
};
