# Third-party notices and supplied artwork

TetherIn source code and original documentation are licensed under the root MIT
license unless a file says otherwise.

## oasdiff

- Project: <https://github.com/oasdiff/oasdiff>
- Pinned release: `v1.29.1`
- Release commit: `2bb87bada404d350cb56e5504e8bd5d76f6159bf`
- License: Apache License 2.0
- License text: <https://github.com/oasdiff/oasdiff/blob/v1.29.1/LICENSE>

TetherIn invokes the pinned executable as an external tool and stores its JSON
output. If the executable or source is redistributed, include the upstream
Apache-2.0 license and any upstream NOTICE file in that distribution.

## Official provider OpenAPI repositories

- OpenAI OpenAPI: <https://github.com/openai/openai-openapi> — MIT
- Stripe OpenAPI: <https://github.com/stripe/openapi> — MIT
- Twilio OpenAPI: <https://github.com/twilio/twilio-oai> — MIT

Provider specs are fetched from immutable commits and cached; they are not
vendored in this planning baseline. Cached or redistributed copies must retain
the source repository, commit, original license, and integrity hash.

## Supplied artwork

`docs/assets/teatherin-original.png` is a byte-for-byte copy of artwork supplied
by the project owner on 2026-08-23 (SHA-256
`c2e977cdd1227b7456400ca7dfdbc9898ad1b2ea9066b41ae87affa1b72d67ed`).
It is not automatically covered by the repository's MIT license. Confirm the
owner's rights and document an explicit artwork license before public launch.
The source image spells "TeatherIn". Derived icon and WebP assets preserve the
artwork and do not create a corrected wordmark.
