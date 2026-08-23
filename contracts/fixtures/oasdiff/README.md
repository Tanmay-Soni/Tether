# Real oasdiff output fixture

`openai-geography.breaking.json` is the pretty-printed, otherwise unmodified JSON
from oasdiff v1.29.1:

```bash
oasdiff breaking --format json \
  https://raw.githubusercontent.com/openai/openai-openapi/13c6a94fca988f8be3c5de09d73f012709985d10/openapi.yaml \
  https://raw.githubusercontent.com/openai/openai-openapi/f85dbe223d40e1a31cba812ab2d755c7e98a92a3/openapi.yaml
```

The release archive used for the retained run matched the upstream SHA-256
`759cc5703d9335c441ad84a7074c705486b2c493f79bcfdf251c7a9c788b1171`
for `oasdiff_1.29.1_darwin_all.tar.gz` from the official
[`checksums.txt`](https://github.com/oasdiff/oasdiff/releases/download/v1.29.1/checksums.txt).

This fixture proves the contract-diff shape and the OpenAI change. It does not
prove consumer impact, a Codex patch, Greptile analysis, test success, or a PR.
