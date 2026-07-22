# icons v2

A simple icon server based on express and sharp. It uses ioredis to cache the icon binaries. An S3 compatible service is used to store the icons which are fetched on-demand from external sources.

Exchange icons live in `assets/exchanges` and are addressed by canonical exchange slug:

```text
/icons/exchanges/binance?w=48&h=48
```
