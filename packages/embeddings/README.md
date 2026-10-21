# @heryjs/embeddings

Turn text into vectors behind one contract, so a resource can be searched by
meaning and not only by the words it contains.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/):

```bash
pnpm hery install embeddings
```

## What it does

A blueprint field `type: vector` (with `dimensions` and a `source` string
field) becomes a pgvector column. On every write that changes the source, the outbox
relay reads the current text, asks this module for its embedding and
stores it. The search route then accepts `search: { q, mode: 'similar' }`.

This module is the part that knows how to embed. The outbox handler, the SQL and the
tenant and capability scoping live in the kernel and do not depend on which
driver is active.

## Drivers

- `fake` ships with the module and is the default. It hashes words into a unit
  vector, so texts that share words land close together and the same text always
  gives the same vector. It reaches no network, which makes it the right driver
  for tests and development.
- `openai-compatible` posts to any `/embeddings` endpoint that speaks the OpenAI
  shape: OpenAI, Ollama, vLLM, LiteLLM. It uses the built-in `fetch`.

Another provider is a driver package binding `embeddingDriverToken('<name>')`.
