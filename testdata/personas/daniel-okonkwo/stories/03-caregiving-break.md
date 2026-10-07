This is the gap, from spring 2023 through the end of 2025, basically. I want it in here because it's real and I'm not going to pretend it didn't happen.

My dad had a stroke in January 2023. My parents are in Atlanta, they've been in the same house in Decatur since I was a kid. It was his left side, he couldn't walk at first, and his speech was rough. My mom is 74 and couldn't do it alone, and my sister was up in Charlotte with three kids. So for a few months I was flying Austin to Atlanta every other week, working from my parents' kitchen table, and then in April I resigned from Shiftwell, and by June I'd sold the condo in Austin and moved back to Atlanta. I'm in Decatur now, about ten minutes from them.

The caregiving part. A lot of it is logistics, which, I'm an engineer, so I made a spreadsheet, obviously. Physical therapy three times a week, speech therapy, neurology appointments, a pill organizer that I'm still weirdly proud of. I fought with the insurance company over his inpatient rehab coverage for about four months and won the appeal, which is maybe my proudest non-engineering thing ever. I learned more about Medicare than I ever wanted to.

He's doing a lot better now. He walks with a cane, talks fine, a little slower. He goes to an adult day program three days a week, and my sister moved down to Atlanta last year, in 2025, so we split it now. That's why I can go back full time. I still want to be in Atlanta though, that part's not changing.

The open source stuff. Once things settled into a routine, maybe fall of 2023, I had a few hours most days, usually early morning before everyone was up, and I started writing pgledger. It's the double-entry ledger library I always wished we'd had at Tallyline, in Go, on top of Postgres. Accounts, transfers, balances derived from entries, idempotency keys built in, and it leans on Postgres constraints so you literally can't commit an unbalanced transaction. It's got around 640 stars on GitHub last I looked. It's used in production all over the place now. Well. I know of two small companies running it in production, one of them is Lumenrent, where I did the contract, and a few people have opened issues saying they're evaluating it. So "all over the place" is a stretch.

Then in 2024 I wrote tollgate, which is a distributed rate limiter. Go, Redis behind it, the GCRA algorithm, and it can run as a library or as a little gRPC sidecar. That one's smaller, more of a learning project. I wanted to really understand the tradeoffs of rate limiting across a lot of nodes without a Redis round trip on every single request. It has maybe 150 stars. I wrote a blog post about the design that did okay on Hacker News for about a day.

I also sent a few patches upstream to a Go Postgres driver. Small stuff, a bug fix around connection pool timeouts and some docs.

And there was the Lumenrent contract in late 2024, I'll write that one up separately.

What I kept up: I read a lot, I kept writing Go basically every week, I did code review for a couple of people who contribute to pgledger. What I didn't keep up with is the Kubernetes world, honestly. I used it at Shiftwell, but I'm sure things moved, so I've been catching up on that this year.

I don't regret any of it. If anything I'm more patient now, and I'm a lot better at explaining technical stuff to people who don't care about technical stuff, because I spent two years explaining my dad's care plan to insurance people. I'm ready to go back to a real team.
