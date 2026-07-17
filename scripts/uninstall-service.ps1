#requires -Version 5.1
<#
.SYNOPSIS
    Stop and remove the WinReach MCP Windows service.
.DESCRIPTION
    Stops and removes the NSSM-managed WinReach service created by
    install-service.ps1. Run from an elevated (Administrator) PowerShell.
.PARAMETER ServiceName
    Windows service name. Default: WinReachMCP.
.PARAMETER NssmPath
    Explicit path to nssm.exe. Default: PATH, then ~/.winreach/bin/nssm.exe.
.EXAMPLE
    ./scripts/uninstall-service.ps1
#>
[CmdletBinding()]
param(
    [string]$ServiceName = "WinReachMCP",
    [string]$NssmPath
)

$ErrorActionPreference = "Stop"

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-Nssm {
    param([string]$Explicit)
    if ($Explicit) {
        if (-not (Test-Path $Explicit)) { throw "nssm.exe not found at -NssmPath: $Explicit" }
        return (Resolve-Path $Explicit).Path
    }
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $cached = Join-Path $HOME ".winreach\bin\nssm.exe"
    if (Test-Path $cached) { return $cached }
    throw "nssm.exe not found on PATH or in ~/.winreach/bin. Pass -NssmPath."
}

if (-not (Test-Admin)) {
    throw "This script must run in an elevated (Administrator) PowerShell session."
}

$nssm = Resolve-Nssm -Explicit $NssmPath

if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
    Write-Host "Service '$ServiceName' is not installed. Nothing to do."
    return
}

Write-Host "Stopping and removing service '$ServiceName' ..."
& $nssm stop $ServiceName confirm 2>$null | Out-Null
& $nssm remove $ServiceName confirm
if ($LASTEXITCODE -ne 0) { throw "nssm remove failed with exit code $LASTEXITCODE" }

Write-Host "Service '$ServiceName' removed."
