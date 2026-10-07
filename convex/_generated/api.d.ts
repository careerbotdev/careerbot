/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as activity from "../activity.js";
import type * as admin from "../admin.js";
import type * as aiSettings from "../aiSettings.js";
import type * as aiTasks from "../aiTasks.js";
import type * as allowlist from "../allowlist.js";
import type * as apolloKey from "../apolloKey.js";
import type * as apolloPricing from "../apolloPricing.js";
import type * as ask from "../ask.js";
import type * as auth from "../auth.js";
import type * as boardProviders from "../boardProviders.js";
import type * as boilerplate from "../boilerplate.js";
import type * as braveKey from "../braveKey.js";
import type * as breaks from "../breaks.js";
import type * as budgets from "../budgets.js";
import type * as companySets from "../companySets.js";
import type * as compare from "../compare.js";
import type * as conflicts from "../conflicts.js";
import type * as contactGroups from "../contactGroups.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as demoRefusal from "../demoRefusal.js";
import type * as demoSeed from "../demoSeed.js";
import type * as directionPaths from "../directionPaths.js";
import type * as directionVocab from "../directionVocab.js";
import type * as directions from "../directions.js";
import type * as discovery from "../discovery.js";
import type * as docxFiles from "../docxFiles.js";
import type * as drive from "../drive.js";
import type * as drivePaths from "../drivePaths.js";
import type * as driveSoon from "../driveSoon.js";
import type * as duplicates from "../duplicates.js";
import type * as enrich from "../enrich.js";
import type * as estimates from "../estimates.js";
import type * as exportFormat from "../exportFormat.js";
import type * as exportRules from "../exportRules.js";
import type * as extract from "../extract.js";
import type * as factChanges from "../factChanges.js";
import type * as factPairs from "../factPairs.js";
import type * as followUpEmails from "../followUpEmails.js";
import type * as followups from "../followups.js";
import type * as functions from "../functions.js";
import type * as github from "../github.js";
import type * as githubApp from "../githubApp.js";
import type * as goals from "../goals.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as itemShapes from "../itemShapes.js";
import type * as jobs from "../jobs.js";
import type * as lens from "../lens.js";
import type * as letters from "../letters.js";
import type * as limitBuckets from "../limitBuckets.js";
import type * as lineCheck from "../lineCheck.js";
import type * as metering from "../metering.js";
import type * as modelPrices from "../modelPrices.js";
import type * as narratives from "../narratives.js";
import type * as notes from "../notes.js";
import type * as openrouterApp from "../openrouterApp.js";
import type * as openrouterKey from "../openrouterKey.js";
import type * as passwordRules from "../passwordRules.js";
import type * as people from "../people.js";
import type * as places from "../places.js";
import type * as profile from "../profile.js";
import type * as projects from "../projects.js";
import type * as pursuitSteps from "../pursuitSteps.js";
import type * as pursuits from "../pursuits.js";
import type * as readableExport from "../readableExport.js";
import type * as recordContext from "../recordContext.js";
import type * as releases from "../releases.js";
import type * as replyJson from "../replyJson.js";
import type * as repoReader from "../repoReader.js";
import type * as reports from "../reports.js";
import type * as resume from "../resume.js";
import type * as resumeBasis from "../resumeBasis.js";
import type * as resumeDoc from "../resumeDoc.js";
import type * as resumeHistory from "../resumeHistory.js";
import type * as review from "../review.js";
import type * as reviewKinds from "../reviewKinds.js";
import type * as roleDetails from "../roleDetails.js";
import type * as roleRubric from "../roleRubric.js";
import type * as roleSort from "../roleSort.js";
import type * as roles from "../roles.js";
import type * as sameWork from "../sameWork.js";
import type * as screening from "../screening.js";
import type * as secretBox from "../secretBox.js";
import type * as skills from "../skills.js";
import type * as sortFaceoff from "../sortFaceoff.js";
import type * as sources from "../sources.js";
import type * as tallies from "../tallies.js";
import type * as today from "../today.js";
import type * as tours from "../tours.js";
import type * as updates from "../updates.js";
import type * as users from "../users.js";
import type * as version from "../version.js";
import type * as waitlist from "../waitlist.js";
import type * as workspaceCopy from "../workspaceCopy.js";
import type * as workspaceRows from "../workspaceRows.js";
import type * as workspaces from "../workspaces.js";
import type * as writingGuides from "../writingGuides.js";
import type * as yourData from "../yourData.js";
import type * as yourDataRun from "../yourDataRun.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  activity: typeof activity;
  admin: typeof admin;
  aiSettings: typeof aiSettings;
  aiTasks: typeof aiTasks;
  allowlist: typeof allowlist;
  apolloKey: typeof apolloKey;
  apolloPricing: typeof apolloPricing;
  ask: typeof ask;
  auth: typeof auth;
  boardProviders: typeof boardProviders;
  boilerplate: typeof boilerplate;
  braveKey: typeof braveKey;
  breaks: typeof breaks;
  budgets: typeof budgets;
  companySets: typeof companySets;
  compare: typeof compare;
  conflicts: typeof conflicts;
  contactGroups: typeof contactGroups;
  crons: typeof crons;
  demo: typeof demo;
  demoRefusal: typeof demoRefusal;
  demoSeed: typeof demoSeed;
  directionPaths: typeof directionPaths;
  directionVocab: typeof directionVocab;
  directions: typeof directions;
  discovery: typeof discovery;
  docxFiles: typeof docxFiles;
  drive: typeof drive;
  drivePaths: typeof drivePaths;
  driveSoon: typeof driveSoon;
  duplicates: typeof duplicates;
  enrich: typeof enrich;
  estimates: typeof estimates;
  exportFormat: typeof exportFormat;
  exportRules: typeof exportRules;
  extract: typeof extract;
  factChanges: typeof factChanges;
  factPairs: typeof factPairs;
  followUpEmails: typeof followUpEmails;
  followups: typeof followups;
  functions: typeof functions;
  github: typeof github;
  githubApp: typeof githubApp;
  goals: typeof goals;
  http: typeof http;
  insights: typeof insights;
  itemShapes: typeof itemShapes;
  jobs: typeof jobs;
  lens: typeof lens;
  letters: typeof letters;
  limitBuckets: typeof limitBuckets;
  lineCheck: typeof lineCheck;
  metering: typeof metering;
  modelPrices: typeof modelPrices;
  narratives: typeof narratives;
  notes: typeof notes;
  openrouterApp: typeof openrouterApp;
  openrouterKey: typeof openrouterKey;
  passwordRules: typeof passwordRules;
  people: typeof people;
  places: typeof places;
  profile: typeof profile;
  projects: typeof projects;
  pursuitSteps: typeof pursuitSteps;
  pursuits: typeof pursuits;
  readableExport: typeof readableExport;
  recordContext: typeof recordContext;
  releases: typeof releases;
  replyJson: typeof replyJson;
  repoReader: typeof repoReader;
  reports: typeof reports;
  resume: typeof resume;
  resumeBasis: typeof resumeBasis;
  resumeDoc: typeof resumeDoc;
  resumeHistory: typeof resumeHistory;
  review: typeof review;
  reviewKinds: typeof reviewKinds;
  roleDetails: typeof roleDetails;
  roleRubric: typeof roleRubric;
  roleSort: typeof roleSort;
  roles: typeof roles;
  sameWork: typeof sameWork;
  screening: typeof screening;
  secretBox: typeof secretBox;
  skills: typeof skills;
  sortFaceoff: typeof sortFaceoff;
  sources: typeof sources;
  tallies: typeof tallies;
  today: typeof today;
  tours: typeof tours;
  updates: typeof updates;
  users: typeof users;
  version: typeof version;
  waitlist: typeof waitlist;
  workspaceCopy: typeof workspaceCopy;
  workspaceRows: typeof workspaceRows;
  workspaces: typeof workspaces;
  writingGuides: typeof writingGuides;
  yourData: typeof yourData;
  yourDataRun: typeof yourDataRun;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
