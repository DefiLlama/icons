# icons v2

A simple icon server based on express and sharp. It uses ioredis to cache the icon binaries. An S3 compatible service is used to store the icons which are fetched on-demand from external sources.

Exchange icons live in `assets/exchanges` and are addressed by canonical exchange slug:

```text
/icons/exchanges/binance?w=48&h=48
```

Crypto card icons live in `assets/crypto-cards` and are addressed by card id:

```text
/icons/crypto-cards/coinbase-one?w=48&h=48
```

RWA platform icons are addressed by platform slug. A platform whose art is filed under another name gets an
entry in `RWA_PLATFORM_LOGOS` (`src/utils/image-resize.ts`):

```text
/icons/rwa/trade-xyz?w=48&h=48
```

The underlying asset of an RWA perp is addressed by the slug of its reference asset name (lowercase, every run of
non-word characters becomes one `-`, as the app's `rwaSlug`). `assets/rwa-assets.json` maps each slug to art that
already lives elsewhere (`equities/US/TSLA`, `stocks/meta`, `rwa/samsung`), so one company keeps one image. A new
reference asset is one line in that file; add art to its own folder first, never a copy. A slug with no entry
answers 404. Purge `/icons/rwa-assets/<slug>` after changing an entry, because responses are cached for a year.

```text
/icons/rwa-assets/tesla-inc?w=48&h=48
```

## Token catalog

Token icons read `tokenlist/coingecko-catalog-v2.json` through SDK cache. The
schema 2 catalog provides names, logo URLs, and contract/platform mappings keyed
by CoinGecko ID. Without R2 credentials the SDK reads the public dataset URL;
configure R2 credentials before startup for direct reads. No `logos.json` or
`all.json` fallback is used.
Local icons and existing image caches retain their current precedence.

Verify catalog mappings with `node --test tests/token-catalog.test.cjs`.
