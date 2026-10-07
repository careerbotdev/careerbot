The Lumenrent contract. This was during the break, September through December of 2024, so four months, about 25 hours a week, remote from Atlanta. Lumenrent is a small startup, maybe 20 people, that does rent collection and accounting for small property managers. Like folks who own 40 units, not the giant apartment companies.

They found me through pgledger, actually. Their CTO had been evaluating it and opened an issue on GitHub, and we got talking in the comments, and then on a call, and he asked if I'd do a contract.

The problem was ACH. Tenants pay rent by ACH, and ACH payments can come back days later. Returns, insufficient funds, account closed, all of that. Their ops person was reconciling the bank's return files against their rent records by hand. It took her about two days every month, and stuff slipped through. Property managers would see rent as paid when it had actually bounced, and then a week later, surprise.

So I built them a reconciliation service. Go, Postgres, with pgledger underneath for the actual ledger. It parses the bank's return files, matches each return to the original payment, reverses the entries in the ledger, flags the tenant's account, and notifies the property manager. They were doing around 14,000 rent payments a month at that point. After it was live, her monthly reconciliation went from two days to like two hours, mostly just reviewing the exceptions it couldn't match on its own.

I basically saved their ops team. Ha. Well, I saved one person a lot of annoying work, which, it's a small company, that kind of is their ops team.

I also helped them with their on-call setup. They didn't really have one, so I set up alerting on the return-matching job and wrote a runbook so whoever got paged would know what to do at 2am without calling me.

It was really nice to be back working with a team, even part time. It reminded me I like this. They asked me to stay on, but my dad was having a rough stretch that winter, so I wrapped it up in December and handed it off to their one backend engineer.

It was also good proof for me that pgledger works for real money, not just for my test suite.
