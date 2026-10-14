import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { type Board, boardsIn, interleave, pageText, payFromText, publicHost, readBoard, readDescription, setSearchTitles } from "./boards";

test("job boards are found in a page's links", () => {
  const html = `<a href="https://boards.greenhouse.io/copperlinerobotics">Jobs</a> <a href="https://jobs.ashbyhq.com/loadstar/123">x</a> <script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script> <a href="https://jobs.lever.co/kestrelfreight">`;
  expect(boardsIn(html).map((b) => `${b.provider}:${b.slug}`)).toEqual(["greenhouse:copperlinerobotics", "lever:kestrelfreight", "ashby:loadstar"]);
});

test("page text drops scripts and markup and keeps the meta description", () => {
  const { description, text } = pageText(`<head><meta name="description" content="We build rockets."><script>var x=1</script></head><body><h1>Hi</h1><style>.a{}</style><p>Launch &amp; land</p></body>`);
  expect(description).toBe("We build rockets.");
  expect(text).toBe("Hi Launch & land");
});

test("only public hostnames are fetched", () => {
  for (const h of ["scale.com", "job-boards.greenhouse.io"]) expect(publicHost(h)).toBe(true);
  for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "169.254.169.254", "db.internal", "printer.local", "[::1]", "a"]) expect(publicHost(h)).toBe(false);
});

test("newer job boards are recognised in links", () => {
  const html = `https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite https://jobs.smartrecruiters.com/BoschGroup/123 https://acme.breezy.hr/p/x https://acme.jobs.personio.de/job/1 https://ats.rippling.com/rippling/jobs`;
  expect(boardsIn(html).map((b) => `${b.provider}:${b.slug}`)).toEqual(["workday:nvidia|wd5|NVIDIAExternalCareerSite", "smartrecruiters:BoschGroup", "breezy:acme", "personio:acme", "rippling:rippling"]);
});

const found = (html: string) => boardsIn(html).map((b) => `${b.provider}:${b.slug}`);

test("Gem boards are recognised in job links", () => {
  expect(found(`<a href="https://jobs.gem.com/the-boring-company/2b319704-7d85-4f10-9cf2-f60229e0992f">`)).toEqual(["gem:the-boring-company"]);
});

test("Workable boards are recognised, but not its short job links or its own sites", () => {
  expect(found(`https://apply.workable.com/usercentrics/j/1EE1C4AC64 https://apply.workable.com/j/5793CA0928 https://www.workable.com/ https://acme.workable.com`)).toEqual(["workable:usercentrics", "workable:acme"]);
});

test("Recruitee boards are recognised by subdomain", () => {
  expect(found(`https://channable.recruitee.com/o/customer-success-manager-benelux-dutch-speaking-3 https://www.recruitee.com`)).toEqual(["recruitee:channable"]);
});

test("BambooHR boards are recognised from careers links and the embed script", () => {
  expect(found(`https://scribd.bamboohr.com/careers/144 <script src="https://acme.bamboohr.com/js/embed.js"></script> https://www.bamboohr.com/careers/`)).toEqual(["bamboohr:scribd", "bamboohr:acme"]);
});

test("Pinpoint boards are recognised by subdomain", () => {
  expect(found(`https://workwithus.pinpointhq.com/en/postings/ce6c9e5c-a2d3-42b0-a01e-9edeae315b04 https://developers.pinpointhq.com/docs`)).toEqual(["pinpoint:workwithus"]);
});

test("Teamtailor boards are recognised by subdomain", () => {
  expect(found(`https://polestar.teamtailor.com/jobs/3528756-internship-retail-network https://app.teamtailor.com/login`)).toEqual(["teamtailor:polestar"]);
});

test("SmartRecruiters and Teamtailor boards are recognised but never read: nothing is fetched", async () => {
  const fetched = vi.fn(async () => Response.json({ content: [{ id: "1", name: "Engineer" }], totalFound: 1 }));
  vi.stubGlobal("fetch", fetched);
  for (const provider of ["smartrecruiters", "teamtailor"] as const) {
    expect(await readBoard({ provider, slug: "acme", url: "" })).toBeNull();
    expect(await readDescription({ provider, slug: "acme", url: "" }, { externalId: "1", url: "https://example.com/1" })).toBeNull();
  }
  expect(fetched).not.toHaveBeenCalled();
});

test("Jobvite boards are recognised in job and list links", () => {
  expect(found(`https://jobs.jobvite.com/nutanix/job/oZPOAfwW https://jobs.jobvite.com/careers/egnyte/jobs`)).toEqual(["jobvite:nutanix", "jobvite:egnyte"]);
});

test("iCIMS boards keep the whole subdomain", () => {
  expect(found(`https://careers-gdms.icims.com/jobs/75167/embedded-software-engineer/job https://careers3-powerschool.icims.com/jobs/53020/x/job https://www.icims.com/jobs/`)).toEqual(["icims:careers-gdms", "icims:careers3-powerschool"]);
});

test("Oracle Recruiting Cloud boards keep host and career site, with the site's case", () => {
  expect(found(`https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210503426 https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_45001`)).toEqual(["oracle:jpmc.fa.oraclecloud.com|CX_1001", "oracle:eeho.fa.us2.oraclecloud.com|CX_45001"]);
});

test("JazzHR boards are recognised by their applytojob subdomain", () => {
  expect(found(`https://nro.applytojob.com/apply/oZyJp3ZEQh/2027-Dr-Chris-Scolese-Summer-Internship-Program https://search.applytojob.com/apply/jobs/`)).toEqual(["jazzhr:nro"]);
});

test("Dover boards are recognised by name or careers page id, not by a single job link", () => {
  expect(found(`https://app.dover.com/jobs/uplimit https://app.dover.com/Catena%20Labs/careers/be605dce-09fa-4719-8d0a-5dd6fb7ea9c0 https://app.dover.com/apply/Dover/aa378aa1-79f3-4995-8667-b78a61c12b11`)).toEqual(["dover:uplimit", "dover:be605dce-09fa-4719-8d0a-5dd6fb7ea9c0"]);
});

test("searched titles take turns across directions, so a later direction isn't cut off", () => {
  const sales = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"];
  const se = ["Sales Engineer", "Solutions Engineer", "B3", "B4", "B5", "B6", "B7", "Solutions Architect"];
  const picked = interleave([sales, se]).slice(0, 12);
  expect(picked.slice(0, 4)).toEqual(["A1", "Sales Engineer", "A2", "Solutions Engineer"]);
  expect(interleave([["X", "Y"], ["X", "Z"]])).toEqual(["X", "Y", "Z"]);
});

afterEach(() => vi.unstubAllGlobals());
// Each job's details as read from a board that answers with `body`.
const factsFrom = async (provider: Board["provider"], body: unknown) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
  return (await readBoard({ provider, slug: "acme", url: "" }))!.jobs.map((j) => j.facts);
};

test("Greenhouse pay comes in cents; it's hourly by the range's title or its size; several ranges span those alike", async () => {
  const range = (min_cents: number, max_cents: number, currency_type: string, title: string) => ({ min_cents, max_cents, currency_type, title });
  const job = (id: number, pay_input_ranges: unknown[], more = {}) => ({ id, title: "Engineer", absolute_url: `https://boards.greenhouse.io/acme/jobs/${id}`, pay_input_ranges, ...more });
  const facts = await factsFrom("greenhouse", {
    jobs: [
      job(1, [range(9000000, 11000000, "USD", "US Salary Range")], { metadata: [{ name: "Employment Type", value: "Intern" }], location: { name: "Hybrid - London" } }),
      job(2, [range(150000, 200000, "JPY", "JP Hourly Range")]),
      // Some companies list hourly pay under "US Salary Range".
      job(3, [range(3000, 4500, "USD", "US Salary Range")]),
      job(4, [range(12000000, 15000000, "USD", "US Salary Range"), range(4000, 5000, "USD", "US Hourly Range"), range(10000000, 18000000, "USD", "US Salary Range"), range(9000000, 9500000, "GBP", "UK Salary Range")]),
      job(5, [], { location: { name: "Remote or Hybrid" } }),
    ],
  });
  expect(facts).toEqual([
    { pay: { min: 90000, max: 110000, currency: "USD", period: "year" }, employmentType: "internship", setup: "hybrid" },
    { pay: { min: 1500, max: 2000, currency: "JPY", period: "hour" } },
    { pay: { min: 30, max: 45, currency: "USD", period: "hour" } },
    { pay: { min: 100000, max: 180000, currency: "USD", period: "year" } },
    undefined,
  ]);
});

test("Ashby pay is the salary part of the compensation summary, per its interval; workplace, employment type and places carry over", async () => {
  const job = (id: string, more: object) => ({ id, title: "Engineer", jobUrl: `https://jobs.ashbyhq.com/acme/${id}`, isListed: true, ...more });
  const part = (compensationType: string, interval: string, currencyCode: string, minValue: number | null, maxValue: number | null) => ({ compensationType, interval, currencyCode, minValue, maxValue });
  const facts = await factsFrom("ashby", {
    jobs: [
      job("a", { location: "San Francisco", secondaryLocations: [{ location: "New York" }], employmentType: "FullTime", workplaceType: "Hybrid", compensation: { summaryComponents: [part("EquityCashValue", "1 YEAR", "USD", null, null), part("Salary", "1 YEAR", "USD", 257000, 335000)] } }),
      job("b", { location: "London", employmentType: "Intern", workplaceType: "OnSite", compensation: { summaryComponents: [part("Salary", "1 HOUR", "GBP", 30, 40)] } }),
      job("c", { location: "Remote", employmentType: "Contract", workplaceType: "Remote", compensation: { summaryComponents: [part("Commission", "1 YEAR", "USD", 10000, 20000)] } }),
      job("d", { location: "Berlin", employmentType: "FullTime", workplaceType: null, compensation: { summaryComponents: [part("Salary", "6 MONTH", "EUR", 30000, 40000)] } }),
    ],
  });
  expect(facts).toEqual([
    { pay: { min: 257000, max: 335000, currency: "USD", period: "year" }, locations: ["San Francisco", "New York"], employmentType: "full-time", setup: "hybrid" },
    { pay: { min: 30, max: 40, currency: "GBP", period: "hour" }, locations: ["London"], employmentType: "internship", setup: "onsite" },
    { locations: ["Remote"], employmentType: "contract", setup: "remote" },
    { locations: ["Berlin"], employmentType: "full-time" },
  ]);
});

test("Lever pay follows its interval, and a one-time amount isn't a rate; commitment and workplace carry over", async () => {
  const posting = (id: string, interval: string, workplaceType: string, commitment: string) => ({ id, text: "Engineer", hostedUrl: `https://jobs.lever.co/acme/${id}`, workplaceType, salaryRange: { min: 50, max: 60, currency: "USD", interval }, categories: { commitment, allLocations: ["Phoenix, AZ"] } });
  const facts = await factsFrom("lever", [posting("a", "per-year-salary", "onsite", "Full-time"), posting("b", "per-hour-wage", "remote", "Fixed-Term"), posting("c", "per-month-salary", "hybrid", "Contractor"), posting("d", "one-time", "unspecified", "Internship")]);
  const where = { locations: ["Phoenix, AZ"] };
  expect(facts).toEqual([
    { ...where, pay: { min: 50, max: 60, currency: "USD", period: "year" }, setup: "onsite", employmentType: "full-time" },
    { ...where, pay: { min: 50, max: 60, currency: "USD", period: "hour" }, setup: "remote", employmentType: "temporary" },
    { ...where, pay: { min: 50, max: 60, currency: "USD", period: "month" }, setup: "hybrid", employmentType: "contract" },
    { ...where, employmentType: "internship" },
  ]);
});

// ---- Each reader against a recorded copy of a real company's board (testdata/boards, recorded by scripts/board-canary.ts
// --record). Nothing goes online: a request the recording doesn't have fails the test. ----

type Recording = { board: { provider: Board["provider"]; slug: string }; replies: Record<string, { status: number; contentType: string; location?: string; body: string }> };
async function replay(provider: Board["provider"]) {
  const rec = JSON.parse(readFileSync(`testdata/boards/${provider}.json`, "utf8")) as Recording;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const r = rec.replies[String(input)];
      if (!r) throw new Error(`Not recorded: ${String(input)}`);
      return new Response(r.body, { status: r.status, headers: { "content-type": r.contentType, ...(r.location ? { location: r.location } : {}) } });
    }),
  );
  setSearchTitles(["Software Engineer"]);
  const read = (await readBoard({ ...rec.board, url: "" }))!;
  const description = (await readDescription(read.board, read.jobs[0]))!;
  return { read, first: read.jobs[0], description };
}

test.each(["workable", "bamboohr", "rippling", "jazzhr", "eightfold", "icims"] as const)("%s: every role has a title, an https link and its own id; one role's description is read", async (provider) => {
  const { read, description } = await replay(provider);
  expect(read.jobs.length).toBeGreaterThan(0);
  for (const j of read.jobs) {
    expect(j.title.trim()).not.toBe("");
    expect(j.url).toMatch(/^https:\/\//);
    expect(j.externalId).not.toBe("");
  }
  expect(description.text.length).toBeGreaterThan(200);
  expect(description.text.length).toBeLessThanOrEqual(8000);
});

test("Workable (CloudFactory): places and type from the listing, how it's worked from the job", async () => {
  const { first, description } = await replay("workable");
  expect(first).toMatchObject({ title: "Accountant", url: "https://apply.workable.com/j/3FA3B848FD", location: "Kathmandu, Bagmati Province, Nepal", postedAt: Date.UTC(2026, 8, 28), facts: { locations: ["Kathmandu, Bagmati Province, Nepal"], employmentType: "full-time" } });
  expect(description.facts).toEqual({ setup: "hybrid", employmentType: "full-time" });
});

test("BambooHR (EdgeCortix): setup and type from the listing, posted date from the job", async () => {
  const { read, first, description } = await replay("bamboohr");
  expect(read.total).toBe(19);
  expect(first).toMatchObject({ title: "[Japan] Design Verification Engineer", location: "Kawasaki, Kanagawa", facts: { setup: "onsite", employmentType: "full-time" } });
  expect(description.postedAt).toBe(Date.UTC(2025, 0, 27));
});

test("Rippling (Positron): a role in several places is one role with each place; type from the job", async () => {
  const { first, description } = await replay("rippling");
  expect(first).toMatchObject({ title: "Physical Design Engineer - Synth, Senior", location: "Canada; Remote (United States)", remote: true, facts: { setup: "remote", locations: ["Canada", "Remote (United States)"] } });
  expect(description.facts).toMatchObject({ employmentType: "full-time" });
});

test("JazzHR (Miso Robotics): the feed's description, type, and the day in the job's id as its posted date", async () => {
  const { first } = await replay("jazzhr");
  expect(first).toMatchObject({ title: "Robotics Controls Engineer", location: "Los Angeles, United States", postedAt: Date.UTC(2026, 8, 8), facts: { employmentType: "full-time" } });
  expect(first.description!.length).toBeGreaterThan(200);
});

test("Eightfold (Micron): a large board is searched by title; places, setup and posted date carry over", async () => {
  const { read, first, description } = await replay("eightfold");
  expect(read).toMatchObject({ total: 3048, searched: true, board: { slug: "micron|micron.com", url: "https://micron.eightfold.ai/careers?domain=micron.com" } });
  expect(first).toMatchObject({ title: "Equipment Maintenance Technician", url: "https://micron.eightfold.ai/careers/job/43301265?domain=micron.com", facts: { setup: "onsite" } });
  expect(description.postedAt).toBe(first.postedAt);
});

test("Eightfold boards are recognised by tenant, with the domain when the link names it; test copies aren't", () => {
  expect(found(`<a href="https://micron.eightfold.ai/careers/join?domain=micron.com&amp;jtn_form_id=MMC"> <a href="https://ngc.eightfold.ai/careerhub"> https://hp-sandbox.eightfold.ai/careers?domain=hp-sandbox.com https://app.eightfold.ai/x https://eightfold.ai/careers`)).toEqual(["eightfold:micron|micron.com", "eightfold:ngc"]);
});

test("an Eightfold link without a domain finds it on the career site", async () => {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string) => {
      urls.push(String(u));
      return String(u).endsWith("/careers") ? new Response(`<a href="/careers?domain=ngc.com">`) : Response.json({ data: { count: 1, positions: [{ id: 7, name: "Engineer", locations: ["Remote, US"], workLocationOption: "remote", postedTs: 1791936000 }] } });
    }),
  );
  const read = (await readBoard({ provider: "eightfold", slug: "ngc", url: "" }))!;
  expect(read.board.slug).toBe("ngc|ngc.com");
  expect(read.jobs).toEqual([{ title: "Engineer", url: "https://ngc.eightfold.ai/careers/job/7?domain=ngc.com", location: "Remote, US", remote: true, externalId: "7", postedAt: 1791936000000, facts: { setup: "remote", locations: ["Remote, US"] } }]);
  expect(urls[1]).toBe("https://ngc.eightfold.ai/api/pcsx/search?domain=ngc.com&query=&location=&start=0");
});

test("an Eightfold career site without a domain link gives it in its own settings", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string) => (String(u).endsWith("/careers") ? new Response(`<div data-config="{&#34;domain&#34;: &#34;lockheedmartin.com&#34;}">`) : Response.json({ data: { count: 0, positions: [] } }))),
  );
  expect((await readBoard({ provider: "eightfold", slug: "lockheedmartin", url: "" }))!.board.slug).toBe("lockheedmartin|lockheedmartin.com");
});

test("iCIMS (GitHub): a search page that sends visitors to the company's iCIMS career site is read there, descriptions and all", async () => {
  const { read, first, description } = await replay("icims");
  expect(read).toMatchObject({ total: 72, board: { provider: "icims", slug: "careers-githubinc", url: "https://www.github.careers/jobs" } });
  expect(read.searched).toBeUndefined();
  expect(first).toMatchObject({ title: "Staff Software Engineer", url: "https://www.github.careers/jobs/5609", externalId: "5609", remote: true, postedAt: Date.parse("2026-10-14T00:16:00Z"), facts: { setup: "remote", locations: ["United States"], employmentType: "full-time" } });
  expect(first.description!.length).toBeGreaterThan(200);
  expect(description.postedAt).toBe(first.postedAt);
});

test("Rippling pay spans the ranges in the first's currency and period; the employment type is read past 'Salaried,'", async () => {
  const range = (currency: string, frequency: string, rangeStart: number, rangeEnd: number) => ({ currency, frequency, rangeStart, rangeEnd });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ description: { role: "<p>Build things.</p>" }, employmentType: { id: "Salaried, full-time" }, workLocations: ["New York, NY"], payRangeDetails: [range("USD", "YEAR", 170000, 230000), range("USD", "YEAR", 150000, 250000), range("CAD", "YEAR", 1, 2)] })));
  const d = (await readDescription({ provider: "rippling", slug: "acme", url: "" }, { externalId: "x", url: "" }))!;
  expect(d.facts).toEqual({ pay: { min: 150000, max: 250000, currency: "USD", period: "year" }, employmentType: "full-time", locations: ["New York, NY"] });
});

test("pay given only as words is kept only when its currency and period are certain", () => {
  expect(payFromText("$140,000 - $180,000", "United States")).toEqual({ min: 140000, max: 180000, currency: "USD", period: "year" });
  expect(payFromText("$140,000 - $180,000", "Canada")).toBeUndefined();
  expect(payFromText("USD 25-30 per hour")).toEqual({ min: 25, max: 30, currency: "USD", period: "hour" });
  expect(payFromText("€60k–€75k annually")).toEqual({ min: 60000, max: 75000, currency: "EUR", period: "year" });
  expect(payFromText("£450 a day")).toEqual({ min: 450, max: 450, currency: "GBP", period: "day" });
  expect(payFromText("£450")).toBeUndefined();
  expect(payFromText("Competitive")).toBeUndefined();
  expect(payFromText("USD 100,000 - 120,000 plus 10% bonus")).toBeUndefined();
});
