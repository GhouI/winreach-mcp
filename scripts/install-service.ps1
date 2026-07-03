#requires -Version 5.1
<#
.SYNOPSIS
    Install WinBridge MCP as a Windows service that starts on boot.
.DESCRIPTION
    Registers `node dist/server.js` as a Windows service using NSSM (the
    Non-Sucking Service Manager), the standard way to run an arbitrary process
    under the Windows Service Control Manager. NSSM is located on PATH, at an
    explicit -NssmPath, or downloaded automatically from nssm.cc into
    ~/.winbridge/bin (mirroring how WinBridge fetches cloudflared).

    Security-relevant behaviour:
      * -ServiceAccount + -ServiceAccountPassword run the service as a dedicated,
        low-privilege Windows account (Windows credential login) instead of
        LocalSystem. This is the recommended hardening for production.
      * Configuration (token, TLS paths, audit log, etc.) is passed through an
        -EnvFile so no secret is embedded in the service definition on disk in
        plaintext beyond the file you control.

    Build the project first (`npm run build`) so dist/server.js exists.

    Run this script from an elevated (Administrator) PowerShell.
.PARAMETER ServiceName
    Windows service name. Default: WinBridgeMCP.
.PARAMETER ProjectDir
    WinBridge project directory. Default: the repo root (parent of this script).
.PARAMETER EnvFile
    Path to a KEY=VALUE env file (e.g. .env) whose entries become the service's
    environment (WINBRIDGE_TOKEN, WINBRIDGE_TLS_CERT, WINBRIDGE_AUDIT_LOG, ...).
.PARAMETER ServiceAccount
    Windows account to run the service as, e.g. ".\winbridge" or "DOMAIN\svc".
    Omit to run as LocalSystem (not recommended for production).
.PARAMETER ServiceAccountPassword
    SecureString password for -ServiceAccount.
.PARAMETER NodePath
    Path to node.exe. Default: resolved from PATH.
.PARAMETER NssmPath
    Explicit path to nssm.exe. Default: PATH, then auto-download.
.EXAMPLE
    $pw = Read-Host -AsSecureString "Service account password"
    ./scripts/install-service.ps1 -EnvFile .env -ServiceAccount ".\winbridge" -ServiceAccountPassword $pw
#>
[CmdletBinding()]
param(
    [string]$ServiceName = "WinBridgeMCP",
    [string]$ProjectDir = (Split-Path -Parent $PSScriptRoot),
    [string]$EnvFile,
    [string]$ServiceAccount,
    [System.Security.SecureString]$ServiceAccountPassword,
    [string]$NodePath,
    [string]$NssmPath
)

$ErrorActionPreference = "Stop"

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-Node {
    param([string]$Explicit)
    if ($Explicit) {
        if (-not (Test-Path $Explicit)) { throw "node.exe not found at -NodePath: $Explicit" }
        return (Resolve-Path $Explicit).Path
    }
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) { throw "node.exe is not on PATH. Install Node.js 24+ or pass -NodePath." }
    return $cmd.Source
}

function Resolve-Nssm {
    param([string]$Explicit)
    if ($Explicit) {
        if (-not (Test-Path $Explicit)) { throw "nssm.exe not found at -NssmPath: $Explicit" }
        return (Resolve-Path $Explicit).Path
    }
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $binDir = Join-Path $HOME ".winbridge\bin"
    $cached = Join-Path $binDir "nssm.exe"
    if (Test-Path $cached) { return $cached }

    Write-Host "NSSM not found; downloading nssm 2.24 from nssm.cc ..."
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    $zip = Join-Path $binDir "nssm.zip"
    $extract = Join-Path $binDir "nssm-extract"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip -UseBasicParsing
    if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    $arch = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
    $src = Join-Path $extract "nssm-2.24\$arch\nssm.exe"
    if (-not (Test-Path $src)) { throw "nssm.exe not found in the downloaded archive at $src" }
    Copy-Item $src $cached -Force
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Write-Host "nssm.exe saved to $cached"
    return $cached
}

function Read-EnvFile {
    param([string]$Path)
    $pairs = @{}
    if (-not $Path) { return $pairs }
    if (-not (Test-Path $Path)) { throw "-EnvFile not found: $Path" }
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        $idx = $trimmed.IndexOf("=")
        if ($idx -lt 1) { continue }
        $key = $trimmed.Substring(0, $idx).Trim()
        $value = $trimmed.Substring($idx + 1).Trim().Trim('"')
        $pairs[$key] = $value
    }
    return $pairs
}

if (-not (Test-Admin)) {
    throw "This script must run in an elevated (Administrator) PowerShell session."
}

$ProjectDir = (Resolve-Path $ProjectDir).Path
$entry = Join-Path $ProjectDir "dist\src\server.js"
if (-not (Test-Path $entry)) {
    throw "Built entrypoint not found: $entry. Run 'npm run build' first."
}

$node = Resolve-Node -Explicit $NodePath
$nssm = Resolve-Nssm -Explicit $NssmPath
$envPairs = Read-EnvFile -Path $EnvFile

if (-not $envPairs.ContainsKey("WINBRIDGE_TOKEN") -and -not $envPairs.ContainsKey("WINBRIDGE_PRINCIPALS") `
        -and -not $env:WINBRIDGE_TOKEN -and -not $env:WINBRIDGE_PRINCIPALS) {
    Write-Warning "No WINBRIDGE_TOKEN/WINBRIDGE_PRINCIPALS found in -EnvFile or environment; the service will fail to start until one is set."
}

# Remove any prior installation so re-running is idempotent.
& $nssm stop $ServiceName confirm 2>$null | Out-Null
& $nssm remove $ServiceName confirm 2>$null | Out-Null

Write-Host "Installing service '$ServiceName' -> $node $entry"
& $nssm install $ServiceName $node $entry
if ($LASTEXITCODE -ne 0) { throw "nssm install failed with exit code $LASTEXITCODE" }

& $nssm set $ServiceName AppDirectory $ProjectDir | Out-Null
& $nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null
& $nssm set $ServiceName AppStdout (Join-Path $ProjectDir "winbridge.out.log") | Out-Null
& $nssm set $ServiceName AppStderr (Join-Path $ProjectDir "winbridge.err.log") | Out-Null
& $nssm set $ServiceName AppRotateFiles 1 | Out-Null

if ($envPairs.Count -gt 0) {
    $envLines = $envPairs.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
    # NSSM expects environment entries separated by CRLF in a single argument.
    & $nssm set $ServiceName AppEnvironmentExtra ($envLines -join "`r`n") | Out-Null
}

if ($ServiceAccount) {
    if (-not $ServiceAccountPassword) {
        throw "-ServiceAccount requires -ServiceAccountPassword (a SecureString)."
    }
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ServiceAccountPassword))
    & $nssm set $ServiceName ObjectName $ServiceAccount $plain | Out-Null
    Write-Host "Service will run as dedicated account: $ServiceAccount"
} else {
    Write-Warning "Service will run as LocalSystem. For production, pass -ServiceAccount to run under a dedicated low-privilege Windows account."
}

Write-Host "Starting service '$ServiceName' ..."
& $nssm start $ServiceName
if ($LASTEXITCODE -ne 0) { throw "nssm start failed with exit code $LASTEXITCODE" }

Write-Host "WinBridge MCP is installed and running as service '$ServiceName'."
Write-Host "Manage it with: nssm restart/stop/status $ServiceName  (or Services.msc)"
