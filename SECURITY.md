# Security Policy

WinBridge executes arbitrary PowerShell after bearer-token authentication. A compromised token is equivalent to command execution as the user running the server.

## Recommended Deployment

- Bind to `127.0.0.1` by default.
- Put remote access behind a trusted tunnel, VPN, or reverse proxy with TLS.
- Use a dedicated Windows account with the minimum permissions needed.
- Rotate `WINBRIDGE_TOKEN` regularly.
- Capture and retain command audit logs when deploying outside local development.

## Not Yet Implemented

- TLS termination inside the app
- mTLS
- per-user authorization
- command allowlists or denylists
- Windows credential login
- Windows service installer
