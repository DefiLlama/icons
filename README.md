# icons v2

A simple icon server based on express and sharp. It uses ioredis to cache the icon binaries. An S3 compatible service is used to store the icons which are fetched on-demand from external sources.

Exchange icons live in `assets/exchanges` and are addressed by canonical exchange slug:

```text
/icons/exchanges/binance?w=48&h=48
```

## Token catalog

Token icons read CoinGecko catalog schema 2 through SDK cache. The catalog
provides names, logo URLs, and contract/platform mappings keyed by CoinGecko ID.
Provide R2 credentials to the icons process and populate schema 2 before
deploying this consumer. No `logos.json` or `all.json` fallback is used.
Local icons and existing image caches retain their current precedence.

Verify catalog mappings with `node --test tests/token-catalog.test.cjs`.
