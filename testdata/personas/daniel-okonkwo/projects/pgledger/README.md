# pgledger

A double-entry ledger for Go, built on PostgreSQL.

pgledger gives you accounts, transfers and balances with the guarantees you want when the numbers are money: every transaction balances to zero, every write is idempotent, and every balance can be explained by the entries behind it. The database enforces the rules, not just the Go code, so a bug in your service can't commit an unbalanced transaction.

```go
tx, err := ledger.Transfer(ctx, pgledger.TransferRequest{
    IdempotencyKey: "payout-2024-11-03-merchant-8812",
    Currency:       "USD",
    Entries: []pgledger.Entry{
        {Account: "merchant:8812:available", Amount: -125_00},
        {Account: "bank:operating",          Amount:  125_00},
    },
    Metadata: map[string]string{"payout_id": "po_19f2"},
})
```

## Why

Most systems start with a `balance` column and update it in place. It works until the first time someone asks why a balance is what it is. pgledger stores the movements (entries) as the source of truth and derives balances from them, the way accountants have done it for a few hundred years.

## Features

- Accounts with a fixed currency and a normal side (debit or credit)
- Transfers with two or more entries that must sum to zero, enforced by a deferred constraint trigger
- Idempotency keys on every transfer; retrying a request returns the original result instead of writing twice
- Amounts as `int64` minor units. No floats, anywhere
- Running balances per account, kept consistent with optimistic version checks so concurrent transfers on the same account serialize safely
- Point-in-time balances (`BalanceAt(ctx, account, time)`)
- Reversals as new transfers, never edits or deletes. Entries are append-only
- Reconciliation helpers to compare ledger balances against an external source (bank files, a legacy table) and report differences

## Install

```sh
go get example.com/dokonkwo-dev/pgledger
```

Requires Go 1.22+ and PostgreSQL 14+.

Apply the schema with the bundled migrations:

```sh
go run example.com/dokonkwo-dev/pgledger/cmd/pgledger-migrate -dsn "$DATABASE_URL"
```

Or embed `pgledger.Migrations` in your own migration tool.

## Usage

```go
pool, _ := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
ledger := pgledger.New(pool)

_ = ledger.CreateAccount(ctx, pgledger.Account{
    ID:         "merchant:8812:available",
    Currency:   "USD",
    NormalSide: pgledger.Credit,
})

bal, _ := ledger.Balance(ctx, "merchant:8812:available")
fmt.Println(bal.Amount, bal.Version)

// Explain a balance: every entry that touched the account, newest first.
entries, _ := ledger.Entries(ctx, "merchant:8812:available", pgledger.Page{Limit: 50})
```

Run a transfer inside your own database transaction when the ledger write has to commit together with your business data:

```go
err := pgx.BeginFunc(ctx, pool, func(dbtx pgx.Tx) error {
    if err := orders.MarkPaid(ctx, dbtx, orderID); err != nil {
        return err
    }
    _, err := ledger.WithTx(dbtx).Transfer(ctx, req)
    return err
})
```

## Design notes

**Schema.** Three core tables: `accounts`, `transfers` and `entries`. `entries` is append-only; an `UPDATE` or `DELETE` trigger raises an error. Each transfer's entries are checked at commit by a deferred constraint trigger that sums them per currency.

**Balances.** `account_balances` holds a running balance and a version per account. A transfer reads the versions of the accounts it touches and updates them with `WHERE version = $n`; on conflict it retries with backoff (configurable). For very hot accounts, see `pgledger.WithBatching`, which groups entries and settles them on an interval.

**Idempotency.** `transfers.idempotency_key` is unique. A retry with the same key and the same payload returns the stored transfer; the same key with a different payload returns `ErrIdempotencyConflict`, because that is almost always a bug in the caller.

**What it is not.** pgledger is not a payments processor, a general ledger for your accountants, or a currency converter. Multi-currency transfers are allowed, but each currency has to balance on its own; FX is modeled as two transfers through an FX account.

## Testing

```sh
docker compose up -d postgres
go test ./...
```

The test suite includes a property-based test that runs thousands of random concurrent transfers and checks that every account's running balance equals the sum of its entries.

## Status

v0.6. Running in production at two small companies that I know of. The API may still change before 1.0; breaking changes are listed in `CHANGELOG.md`. Issues and pull requests are welcome.

## License

MIT
