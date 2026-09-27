# image-size compatibility adapter

Expo SDK 54 uses Metro 0.83, which calls the legacy callable `image-size` API
and sometimes passes a file path. The patched `image-size` 2.0.4 release uses a
named byte-array API. This adapter preserves Metro's expected contract while
delegating all parsing to 2.0.4.

Remove this adapter and its npm override when the Expo/Metro dependency accepts
`image-size` 2.0.4 or newer directly.
