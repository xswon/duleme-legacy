# Backend architecture

Duleme is moving to a web-first application architecture with a lightweight
Tauri desktop shell. Electron beta.2 is retired and will not be published.

## Product targets

The same React/TypeScript product UI should support:

- the browser;
- macOS through Tauri;
- Windows through Tauri.

The UI must not depend directly on Electron, Node.js, Rust, or a particular
deployment topology.

## Frontend boundary

Feature code talks through `ReaderBackend`. The initial migration centralizes
the existing HTTP boundary without changing product behavior:

```text
React feature/service
        |
   ReaderBackend
      /       \
 Web adapter   Tauri adapter
     |             |
   HTTPS       Tauri commands
      \           /
        Rust core
```

The web adapter delegates to `fetch`. The first Tauri adapter maps RSS parsing to a Rust command and returns an explicit 501 for desktop operations that have not been migrated yet. This prevents accidental fallback to arbitrary browser networking inside the desktop shell.

Do not introduce new direct environment-specific network calls in components.
New backend capabilities should be added behind the backend boundary.

## Rust target

The long-term Rust workspace should separate reusable behavior from delivery:

```text
crates/
  duleme-core/       RSS, network policy, AI/transcription clients
  duleme-desktop/    Tauri commands
  duleme-server/     HTTP API for the web deployment
```

Desktop and web should share `duleme-core` instead of maintaining separate
implementations of RSS parsing, redirect policy, SSRF protection, or provider
clients.

## Data

IndexedDB remains the primary local data store during the desktop migration.
Changing the persistence model is not required to remove Electron and would
unnecessarily enlarge the migration surface.

If account-based sync is introduced later, it should be an additional sync
layer rather than a prerequisite for local reading.

## Migration order

1. Centralize the frontend backend boundary.
2. Add a minimal Tauri shell for macOS and Windows.
3. Move RSS fetch/parse and outbound-network policy into Rust first.
4. Move proxy, AI, and transcription operations behind Rust commands.
5. Add the web HTTP adapter backed by the same Rust core.
6. Remove the legacy Node/Express desktop runtime once no desktop feature uses it.

The first Tauri milestone is deliberately small: launch the existing React UI,
add one RSS feed through Rust, persist it locally, restart, and confirm the data
is still present. Measure the real macOS package size at that point before
migrating the remaining optional capabilities.


## First Tauri prototype

The first desktop prototype intentionally keeps the scope narrow:

- Tauri serves the existing Vite/React UI through the system WebView.
- `/api/rss/parse` is intercepted by the Tauri `ReaderBackend` adapter and invokes the Rust `fetch_rss` command.
- Rust validates public HTTP(S) URLs, rejects local/private/special IP ranges, pins validated DNS resolution for the request, re-validates redirects, enforces a response-size limit, and parses RSS/Atom into the existing frontend response shape.
- IndexedDB remains the persistence layer, so subscription state can survive an app restart without introducing a new database migration.
- Unmigrated desktop backend endpoints fail closed with HTTP 501 semantics.

The release profile uses LTO, size optimization, symbol stripping, and panic aborts so the measured package reflects the project's small-binary goal.
