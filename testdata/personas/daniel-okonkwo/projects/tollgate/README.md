# tollgate

A distributed rate limiter for Go services, backed by Redis.

tollgate uses GCRA (the generic cell rate algorithm) so each limit is a single timestamp in Redis instead of a counter per window. It runs as a Go library inside your service, or as a small gRPC sidecar for services written in anything else.

## Features

- GCRA limits with burst: `100 requests per minute, burst 20`
- One atomic Redis Lua script per decision; no read-modify-write races between nodes
- Optional local leases: a node borrows a slice of a key's budget and spends it locally, so hot keys don't cost a Redis round trip on every request
- Fails open or closed, your choice, when Redis is unavailable
- `Retry-After` and `RateLimit-*` header helpers for HTTP middleware
- Prometheus metrics for allowed, limited and Redis errors per limit

## Install

```sh
go get example.com/dokonkwo-dev/tollgate
```

Sidecar:

```sh
docker run -p 7420:7420 -e TOLLGATE_REDIS_URL=redis://redis:6379 example.com/dokonkwo-dev/tollgate:0.4
```

## Usage

```go
limiter := tollgate.New(redisClient, tollgate.Config{
    FailMode: tollgate.FailOpen,
})

apiLimit := tollgate.Limit{Rate: 100, Per: time.Minute, Burst: 20}

http.Handle("/api/", tollgate.Middleware(limiter, apiLimit, func(r *http.Request) string {
    return "api:" + r.Header.Get("X-Api-Key")
})(apiHandler))
```

Direct call:

```go
res, err := limiter.Allow(ctx, "login:"+email, tollgate.Limit{Rate: 5, Per: time.Minute})
if !res.Allowed {
    // res.RetryAfter tells the caller when to try again
}
```

Sidecar config (`tollgate.yaml`):

```yaml
redis_url: redis://localhost:6379
fail_mode: open
limits:
  api:
    rate: 100
    per: 1m
    burst: 20
  login:
    rate: 5
    per: 1m
leases:
  enabled: true
  max_share: 0.1   # a node may borrow at most 10% of a key's budget
  ttl: 2s
```

## Design notes

**Why GCRA.** Fixed windows allow double bursts at the window edge, and sliding logs store every request. GCRA stores one value per key, the "theoretical arrival time", and answers allow/deny with a little arithmetic. That keeps Redis memory flat no matter how busy a key is.

**Leases.** The expensive part of distributed rate limiting is the round trip. With leases on, a node that sees a hot key asks Redis for a small share of that key's remaining budget and spends it locally until the share or the TTL runs out. The tradeoff is precision: across N nodes, a key can briefly overshoot its limit by up to N times the lease share. For login throttling you want leases off; for API quotas a few percent of slack is usually fine.

**Failure modes.** If Redis is slow or down, tollgate returns the configured fail mode within a deadline (default 5ms) instead of blocking the request. Every fallback decision is counted in metrics so you notice.

**Clock skew.** Decisions use the Redis server's clock (`TIME` inside the script), not the caller's, so nodes with skewed clocks still agree.

## Benchmarks

On my laptop (M2, Redis 7 in Docker), single key, 32 concurrent callers:

| Mode | Decisions/sec | p99 latency |
|---|---|---|
| Redis every request | ~41,000 | 1.9 ms |
| Leases (10% share) | ~380,000 | 0.08 ms |

Take these as rough; run `go test -bench . ./bench` against your own setup.

## Status

Experimental, v0.4. I wrote it to understand the tradeoffs in distributed rate limiting, and I use it on a couple of side projects. The library API is fairly stable; the sidecar's gRPC API may change. Bug reports welcome.

## License

Apache 2.0
