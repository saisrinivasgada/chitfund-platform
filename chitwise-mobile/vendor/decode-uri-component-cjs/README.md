# decode-uri-component compatibility copy

This package copies the MIT-licensed `decode-uri-component` 0.5.1 decoder. Expo Router 6 uses CommonJS `query-string` 7, which calls its decoder with `require()`. The patched upstream decoder is ESM only, so this copy uses `module.exports` and retains the older `+` to space behavior expected by `query-string` 7.

Keep the dependency override and the compatibility test together. Remove this copy when Expo Router moves to a compatible patched query-string version. The upstream source is `https://github.com/SamVerschueren/decode-uri-component`.
