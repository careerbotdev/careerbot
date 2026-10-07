// Import rules for CareerBot. Run with `pnpm arch:check`. See docs/BUILD.md "System map".
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "client-imports-server-code",
      comment:
        "Pages and parts may import only Convex's generated client API and the shared pure modules (no server runtime). " +
        "Type-only imports are fine: they vanish at build time. Add a module to the allowed list only if it imports nothing from convex/_generated/server.",
      severity: "error",
      from: { path: "^src/" },
      to: {
        path: "^convex/",
        pathNot: ["^convex/_generated/(api|dataModel)", "^convex/(limitBuckets|directionPaths|directionVocab|resumeDoc|docxFiles|lens|roleDetails|pursuitSteps|contactGroups|reviewKinds|factPairs|companySets|aiTasks|passwordRules|demoRefusal|exportRules)\\.ts$"],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "shared-module-imports-server",
      comment: "Modules the browser loads must stay free of server code, or the client bundle pulls in Convex server runtime.",
      severity: "error",
      from: { path: "^convex/(limitBuckets|directionPaths|directionVocab|resumeDoc|lens|roleDetails|pursuitSteps|contactGroups|reviewKinds|factPairs|companySets|aiTasks|passwordRules|demoRefusal|exportRules)\\.ts$" },
      to: { path: "^convex/", pathNot: ["^convex/(limitBuckets|directionPaths|directionVocab|resumeDoc|lens|roleDetails|pursuitSteps|contactGroups|reviewKinds|factPairs|companySets|aiTasks|passwordRules|demoRefusal|exportRules)\\.ts$"], dependencyTypesNot: ["type-only"] },
    },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true, dependencyTypesNot: ["type-only"] } },
    {
      name: "components-stay-generic",
      comment: "Parts in src/components never import app screens or Convex; screens compose parts.",
      severity: "error",
      from: { path: "^src/components/" },
      to: { path: ["^src/app/", "^convex/"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: ["\\.test\\.ts$", "\\.stories\\.tsx$", "^convex/_generated/"] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default", "types"] },
  },
};
