# Contributing

Thanks for helping improve WinBridge MCP.

## Good First Contributions

- Improve Windows deployment docs.
- Add tested reverse-proxy examples.
- Add more deterministic tests around persistent sessions.
- Improve agent instructions and MCP tool descriptions.
- Add support for additional shells such as Git Bash.

## Development

```powershell
npm install
npm run typecheck
npm test
```

Use the diagnostic client for local smoke tests:

```powershell
$env:WINBRIDGE_TOKEN = "dev-token"
npm run dev

# In another terminal
$env:WINBRIDGE_TOKEN = "dev-token"
npm run client -- exec Write-Output hello
```

## Pull Requests

- Keep PRs focused.
- Include tests for behavior changes.
- Update README or docs when user-facing behavior changes.
- Do not include real tokens, IP allowlists, passwords, RDP credentials, or screenshots with secrets.

## Security

WinBridge executes PowerShell remotely after authentication. If you find a security issue, do not open a public issue with exploit details. See [SECURITY.md](SECURITY.md).
