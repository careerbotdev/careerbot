Redstone Ridge Systems, my first job out of school. Huntsville, Alabama. I graduated from Georgia Tech in 2008, computer science, and the job market was terrible, and Redstone was hiring, so in January 2009 I packed up the car and moved to Huntsville.

It's a defense contractor, mid-size, maybe 1,500 people. I was on a team that built ground station software for missile flight tests. I can't get into a lot of it, and honestly some of it I don't remember that well anymore, but the gist is: during a test the vehicle sends telemetry down, and our software received it, decoded it, displayed it for the people watching the test in real time, and archived all of it.

I held a Secret clearance there. Got it in 2009, my first few months were basically sitting in an unclassified room waiting for it. It's lapsed now. I left in 2014 and it went inactive after that, so I don't have an active clearance and I'm not going to go get one again. I don't want to do defense work again. Nothing dramatic, it's just not me. I couldn't talk about my work with anyone, everything moved really slowly, and I want to build things for regular people and businesses.

The technical stuff. The decoder side was C++, real-time, frame synchronization, decommutation, all that. The operator displays were Java, Swing, which, yeah, it was 2010. I was basically the lead on the whole telemetry system. Well, okay, there were twelve of us on the team, and a lead engineer who'd been there twenty years and knew everything. I owned the frame sync and decoder module from about 2011 on. That's the honest version.

The thing I did that I'm proud of: the decoder was dropping frames under load, around 2% on the high-rate streams, and during a flight test that's data you never get back, the test is over, you can't re-run it. I rewrote the buffering and the threading, moved it to a lock-free ring buffer, and got it under 0.1%. That took most of 2012. Basically it never dropped data after that.

The travel. Every test campaign we went out to the range in New Mexico, two or three weeks at a time, and it added up to something like six or seven weeks a year. In a motel. Eating at the same three places. I hated that part. That's a big reason I don't want a job with a lot of travel now.

I also learned a lot about process there. Requirements traceability, everything written down, formal code reviews before code reviews were cool. That part actually stuck with me, the discipline. I still write design docs like someone is going to audit them.

Oh, and I mentored the summer interns two summers, 2012 and 2013. That was fun, and one of them still emails me sometimes.

I left in May 2014 for Tallyline in Austin. Five-ish years at Redstone. I think I was ready about two years before I actually left, but it was a stable job and I was young and didn't know what else was out there.
