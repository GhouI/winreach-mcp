#requires -Version 5.1
<#
.SYNOPSIS
    One-command launcher for WinReach MCP.
.DESCRIPTION
    Goes from nothing to a running WinReach server in a single command:

      1. Ensures WinReach is available (runs it via `npx winreach-mcp`, so there is
         no clone/build step) and checks that Node.js / npx are on PATH.
      2. Decides whether setup is complete. Setup is "complete" when either
         WINREACH_TOKEN / WINREACH_PRINCIPALS is already set in the environment, or
         the onboarding UI has written the config file ~/.winreach/winreach.env.
      3. First run (no config): opens the setup-web onboarding UI so the operator can
         generate keys/roles/policy, waits for onboarding to write the config file,
         then loads it and starts the server.
         Subsequent runs (config present): loads the saved config and starts the
         server directly, skipping onboarding.

    This is a launcher SCRIPT, not an installer or a binary: WinReach is a
    web-controlled MCP server, so the "package" is the script that boots the server
    plus onboarding. Re-running it pulls the newest published version.
.PARAMETER Version
    The winreach-mcp version passed to npx (default: the WINREACH_VERSION env var,
    else "latest"). Pin this to a release tag for reproducible runs.
.PARAMETER Tunnel
    Forward --tunnel to the server to publish a public Cloudflare URL.
.PARAMETER ForceSetup
    Re-open the onboarding UI even when a config file already exists.
.PARAMETER ServerArgs
    Any remaining arguments are forwarded verbatim to `winreach-mcp`.
.EXAMPLE
    ./start-winreach.ps1
.EXAMPLE
    ./start-winreach.ps1 -Tunnel
.EXAMPLE
    # Bootstrap (see README for the SHA-256 to verify first):
    irm https://github.com/GhouI/winreach-mcp/releases/latest/download/start-winreach.ps1 | iex
#>
[CmdletBinding()]
param(
    [string]$Version = $(if ($env:WINREACH_VERSION) { $env:WINREACH_VERSION } else { "latest" }),
    [switch]$Tunnel,
    [switch]$ForceSetup,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ServerArgs
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "[winreach] $msg" -ForegroundColor Cyan }
function Write-Note($msg) { Write-Host "           $msg" -ForegroundColor DarkGray }
function Write-Bad($msg)  { Write-Host "[winreach] $msg" -ForegroundColor Red }

$HomeDir    = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$ConfigDir  = Join-Path $HomeDir ".winreach"
$ConfigFile = Join-Path $ConfigDir "winreach.env"
$OnboardUrl = "http://localhost:3000"

# --- 1. Ensure a runnable WinReach (Node + npx) ---------------------------------
function Test-Cmd($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

if (-not (Test-Cmd "node") -or -not (Test-Cmd "npx")) {
    Write-Bad "Node.js (with npx) was not found on your PATH."
    Write-Host "           WinReach runs on Node.js 18 or newer. Install it, then re-run this script:"
    Write-Host "             https://nodejs.org/en/download" -ForegroundColor Yellow
    exit 1
}

# Load a dotenv-style file (KEY=VALUE lines) into this process's environment.
function Import-EnvFile($path) {
    foreach ($raw in Get-Content -LiteralPath $path) {
        $line = $raw.Trim()
        if (-not $line -or $line.StartsWith("#")) { continue }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { continue }
        $name  = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()
        Set-Item -Path ("Env:" + $name) -Value $value
    }
}

# --- 2. Determine setup state ---------------------------------------------------
$setupComplete = $false
if ($env:WINREACH_TOKEN -or $env:WINREACH_PRINCIPALS) {
    Write-Step "Found WINREACH_TOKEN/WINREACH_PRINCIPALS in the environment; setup is complete."
    $setupComplete = $true
}
elseif (Test-Path -LiteralPath $ConfigFile) {
    Write-Step "Loading saved configuration from $ConfigFile"
    Import-EnvFile $ConfigFile
    $setupComplete = $true
}

if ($ForceSetup) { $setupComplete = $false }

# --- 3. First run: open the onboarding UI ---------------------------------------
if (-not $setupComplete) {
    Write-Step "No WinReach configuration found - starting first-run onboarding."

    $scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
    $setupWeb   = Join-Path $scriptRoot "setup-web"

    if (-not (Test-Path -LiteralPath (Join-Path $setupWeb "package.json"))) {
        Write-Bad "First run needs the setup-web onboarding app, which is not present here."
        Write-Host "           Run this launcher from a WinReach checkout (it ships setup-web), or set"
        Write-Host "           WINREACH_TOKEN (or WINREACH_PRINCIPALS) yourself and re-run. See:"
        Write-Host "             https://github.com/GhouI/winreach-mcp#install--connect" -ForegroundColor Yellow
        exit 1
    }

    # The onboarding /api/apply endpoint is gated by WINREACH_SETUP_KEY; mint one
    # for this session so the operator can paste it into the UI to finish setup.
    if (-not $env:WINREACH_SETUP_KEY) {
        $bytes = New-Object 'System.Byte[]' 24
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $env:WINREACH_SETUP_KEY = [System.BitConverter]::ToString($bytes).Replace("-", "").ToLower()
    }

    if (-not (Test-Path -LiteralPath (Join-Path $setupWeb "node_modules"))) {
        Write-Step "Installing onboarding UI dependencies (first time only)..."
        npm install --prefix $setupWeb
        if ($LASTEXITCODE -ne 0) { Write-Bad "npm install failed in setup-web."; exit 1 }
    }

    Write-Step "Launching the onboarding UI at $OnboardUrl"
    Write-Host  ""
    Write-Host  "  Paste this setup key into the wizard's final 'Finish & apply' step:" -ForegroundColor Yellow
    Write-Host  "      $env:WINREACH_SETUP_KEY" -ForegroundColor Green
    Write-Host  ""

    $onboard = Start-Process -FilePath "npm" -ArgumentList @("run", "dev") `
        -WorkingDirectory $setupWeb -PassThru -WindowStyle Hidden

    try {
        Start-Sleep -Seconds 4
        Start-Process $OnboardUrl | Out-Null

        Write-Step "Waiting for you to finish onboarding (writing $ConfigFile)..."
        while (-not (Test-Path -LiteralPath $ConfigFile)) {
            if ($onboard.HasExited) {
                Write-Bad "The onboarding UI exited before setup was completed."
                exit 1
            }
            Start-Sleep -Seconds 2
        }
        Write-Step "Onboarding complete."
        Import-EnvFile $ConfigFile
    }
    finally {
        if ($onboard -and -not $onboard.HasExited) {
            Stop-Process -Id $onboard.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

# --- 4. Start the MCP server ----------------------------------------------------
$npxArgs = @("-y", "winreach-mcp@$Version")
if ($Tunnel)     { $npxArgs += "--tunnel" }
if ($ServerArgs) { $npxArgs += $ServerArgs }

Write-Step "Starting WinReach MCP server: npx $($npxArgs -join ' ')"
& npx @npxArgs
exit $LASTEXITCODE
