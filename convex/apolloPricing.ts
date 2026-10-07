// Apollo credits each endpoint costs. Callers can't choose their own price.
// From Apollo's API pricing page (checked 2026-09-24): search is per page of up to 100; enrichment per company.
export const APOLLO_CREDITS = {
  "mixed_companies/search": 1,
  "organizations/enrich": 1,
  "mixed_people/api_search": 0,
  "people/match": 1,
  "organizations/job_postings": 1,
} as const;
