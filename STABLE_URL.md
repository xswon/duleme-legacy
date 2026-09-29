# Stable Local URL

Use this URL:

```text
http://127.0.0.1:4387
```

The stable setup runs WReader through Docker Compose with `restart: unless-stopped`, so the app restarts automatically if the container exits or Docker Desktop restarts.

## Start Once

```bash
./scripts/wreader-up.sh
```

## Check Status

```bash
./scripts/wreader-status.sh
```

## Stop

```bash
docker compose down
```

## Notes

- Keep Docker Desktop running.
- If another app already uses port `4387`, stop that app or change `PORT` and the `ports` entries in `compose.yaml`.
- Docker Compose publishes the app on host address `127.0.0.1`, so this documented setup is reachable from this Mac only.
- Directly running the Node server binds to `127.0.0.1` by default. Docker listens on its internal bridge, while Compose continues to publish both host ports on `127.0.0.1` only.
