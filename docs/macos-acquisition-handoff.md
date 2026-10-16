# macOS acquisition handoff

<!-- doc-covers: none -->

The website companion saves the original, consented browser source and places
an opaque download grant in `com.apple.application-instance`. The app reads that
UUID, persists a verifier in Keychain, claims the grant, and binds it using the
verified Clerk session. This runs in a background task, independent of recording.

```text
signed app + xattr -> ZIP -> website personalizes UUID and ZIP checksums
  -> macOS extracts app -> Keychain proof -> claim -> authenticated bind
```

Retries reuse the same request and verifier. Saved proof survives app updates
that remove the xattr. Account switch/logout invalidates in-flight work and saves
a retirement marker before changing accounts. Same-account JWT refresh wakes the
worker without retiring the acquisition. Missing account provisioning is retried.
No token, source data or HTTP error body is logged.

Prepare artifacts locally from an already signed/notarized app:

```sh
python3 scripts/package-attribution-carrier.py \
  --app /path/to/screenpipe.app --platform macos-arm \
  --release VERSION --output /path/to/new-output-directory
```

The script checks app version, architecture, signature and metadata round-trip,
then writes `screenpipe-attribution.zip` and `screenpipe-attribution.json`.
It never uploads artifacts or changes publication pointers. The release owner
must place both files under the matching version/target artifact prefix through
the existing release process. Human publication remains required.

The signature-exempt xattr and ZIP extraction behavior are documented by
[Apple Developer Technical Support](https://developer.apple.com/forums/thread/796303).
This implementation omits Windows/Linux delivery and manual browser pairing.

Before enabling website carrier admission, verify the actual notarized download
through Gatekeeper, app startup, restart, login/logout, trial/purchase and provider
readback. An ad-hoc signed fixture and unit tests cannot prove that full path.
