Tallyline. So this was the payments startup in Austin, and this is where I really figured out what I like doing. Honestly, I basically designed the whole payments platform there. That's how it felt, anyway.

I moved from Huntsville to Austin for it, summer of 2014, I think I started in June. Tallyline was a payment facilitator for small online merchants. So a merchant signs up, they can take cards in like ten minutes, and we handle the underwriting and the money movement and pay them out every day. When I joined it was maybe 30 people. When I left it was a couple hundred.

My first year or so I was just a backend engineer on the payouts team, Go and Postgres, which was new for me, I came from C++ and Java at Redstone. Go was a breath of fresh air, honestly. Then in 2016 they split out a ledger team and I ended up owning the ledger service. We were eight people on ledger, counting me and our manager. I was the senior engineer on it, I owned the service, the design, and on-call escalation for it.

The problem was the old system kept a balance column per merchant and just updated it. Payment comes in, bump the number. Refund, subtract. Chargeback, subtract, maybe. And then when anything went wrong nobody could tell you why a merchant's balance was what it was. Finance was reconciling in spreadsheets, like literally a guy named the spreadsheet after himself. So the ledger was double-entry. Every movement of money is two or more entries that sum to zero, there are accounts for the merchant's available balance, pending, reserve, fees, the bank, and balances are derived from the entries, never stored as the truth.

The migration was the big project. We had something like 900 million historical transactions that had to be backfilled into the new ledger. We ran dual writes for about three months, old system and new ledger side by side, with a reconciliation job every night comparing them, and every morning I'd look at the diff over coffee. Then we cut over with zero downtime, that was the part I was proudest of. The reconciliation found around $41,000 of old discrepancies that had just been sitting there for years, which finance was very happy about, and then a little less happy about.

The incident. Thanksgiving weekend 2017, I was on call. The payouts consumer group in Kafka had a rebalance storm, consumers kept getting kicked and rejoining, and messages were getting processed twice. Payouts were not idempotent at that layer, which, yeah. About 1,100 merchants got paid out twice. It was around $380,000 total. I got paged at like 2am, I think, and I was the incident lead. We stopped payouts within maybe forty minutes, then spent the whole weekend with finance and support working out who got what. We got all but about $12,000 back within two weeks. After that I pushed idempotency keys through the whole payout path, and the ledger checks every payout against an entry before it goes to the bank. Wrote the postmortem, and it became the one they showed new hires. We never had a double payout after that, as far as I know.

On-call was one week in six for the ledger team.

Scale, by the end we were moving something like $2 billion a year through it. Don't quote me on the exact number, it was around there in 2018.

I want to be careful, because I said I designed the whole payments platform. That's not really right. Card processing, underwriting, the merchant dashboard, those were other teams. Payouts existed before me. What was mine was the ledger. The ledger service, the data model, the migration. That I can talk about for hours.

Also the Kafka stuff, I got deep on that there. Partitioning by merchant ID so all the entries for one merchant stay ordered, exactly-once versus at-least-once and why you never really get exactly-once, consumer lag alerting. That's half of why I wrote tollgate later, honestly, thinking about backpressure.

Oh, and I gave a talk at a local Go meetup in Austin about the double-entry thing in 2018. Small crowd, like 40 people, pizza. That's where the idea for pgledger started, years before I actually wrote it.

I left in March of 2019, right after the last of the migration cleanup wrapped. I'd been there almost five years and I wanted to see a bigger, messier codebase, and Shiftwell came along at the right time.
