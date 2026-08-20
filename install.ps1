# FastChannelActions installer for Windows (PowerShell).
#
# Installs the plugin into a Vencord source checkout, builds it, and tells you how to
# finish for either Discord Desktop or Vesktop.
#
# Usage (right-click -> Run with PowerShell, or from a terminal):
#     powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

$PluginName  = "fastChannelActions"
$RepoUrl     = "https://github.com/svasco/FastChannelActions.git"
$VencordRepo = "https://github.com/Vendicated/Vencord.git"

function Write-Info { param($m) Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Warn { param($m) Write-Host "!   $m" -ForegroundColor Yellow }
function Die        { param($m) Write-Host "x   $m" -ForegroundColor Red; exit 1 }

Write-Host "FastChannelActions installer" -ForegroundColor White
Write-Host ""

# --- Prerequisites --------------------------------------------------------------
$missing = @()
foreach ($cmd in @("git", "node", "pnpm")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { $missing += $cmd }
}

if ($missing.Count -gt 0) {
    Die @"
Missing required tools: $($missing -join ', ')
    git:  https://git-scm.com/downloads
    node: https://nodejs.org/en/download/  (v22 or newer)
    pnpm: https://pnpm.io/installation
Install them, reopen PowerShell so they are on your PATH, then run this script again.
"@
}

$nodeVersion = (node --version 2>$null | Select-Object -First 1)
if (-not $nodeVersion -or $nodeVersion -notmatch '^v(\d+)\.') {
    Die "Could not read the Node.js version (got '$nodeVersion'). Is Node installed correctly?"
}
if ([int]$Matches[1] -lt 22) {
    Die "Node.js v22+ is required (found $nodeVersion). Update from https://nodejs.org/en/download/"
}

# pnpm on Windows is often a shim that prints extra lines; take the first only.
$pnpmVersion = (pnpm --version 2>$null | Select-Object -First 1)
Write-Info "git, node $nodeVersion, pnpm $pnpmVersion found"

# Where this script lives. $PSScriptRoot is the reliable one; $MyInvocation.MyCommand.Path
# is empty in some invocation modes, which would leave paths below blank.
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }

# --- Locate or clone Vencord ----------------------------------------------------
#
# A *source checkout* is required, not an installed Vencord. The Vencord installer drops
# built files in %AppData%\Vencord, which has no src/ and no build script: there is
# nothing there to add a plugin to. Checking for package.json alone is not enough, since
# the built dist/ folder contains a stub one.
function Test-VencordCheckout {
    param([string]$Dir)

    if (-not $Dir) { return $false }

    $pkg = Join-Path $Dir "package.json"
    if (-not (Test-Path $pkg)) { return $false }

    $content = Get-Content $pkg -Raw -ErrorAction SilentlyContinue
    if ($content -notmatch '"name":\s*"vencord"') { return $false }

    # The real checkout has sources and a build script; a built output folder has neither.
    if (-not (Test-Path (Join-Path $Dir "src"))) { return $false }
    if ($content -notmatch '"build"\s*:') { return $false }

    return $true
}

function Find-Vencord {
    $dir = $ScriptDir
    while ($dir -and (Test-Path $dir)) {
        if (Test-VencordCheckout $dir) { return $dir }
        $parent = Split-Path $dir -Parent
        if (-not $parent -or $parent -eq $dir) { break }
        $dir = $parent
    }

    foreach ($guess in @(
        (Join-Path $ScriptDir "Vencord"),
        (Join-Path $HOME "Vencord"),
        (Join-Path $HOME "Documents\Vencord"),
        (Join-Path $HOME "source\repos\Vencord")
    )) {
        if (Test-VencordCheckout $guess) { return $guess }
    }
    return $null
}

if ($env:VENCORD_DIR) {
    # Explicit override, e.g. $env:VENCORD_DIR = "C:\src\Vencord"
    $VencordDir = $env:VENCORD_DIR
    if (-not (Test-VencordCheckout $VencordDir)) {
        Die @"
VENCORD_DIR is set to '$VencordDir', but that is not a Vencord source checkout.

A source checkout is a clone of https://github.com/Vendicated/Vencord — a folder
containing 'src' and 'package.json'. It is NOT the folder the Vencord installer
creates (%AppData%\Vencord), which only holds already-built files.

If you installed Vencord with the official installer, you do not have a checkout yet.
Unset the variable and let this script clone one for you:

    Remove-Item Env:\VENCORD_DIR
    .\install.ps1
"@
    }
    Write-Info "Using Vencord checkout from VENCORD_DIR: $VencordDir"
} else {
    $VencordDir = Find-Vencord
}

if (-not $VencordDir) {
    # Cloning a second copy when the user already has one elsewhere would build a
    # plugin they never load, so confirm rather than assume.
    $defaultDir = Join-Path $ScriptDir "Vencord"

    Write-Warn "No Vencord source checkout found."
    Write-Host ""
    Write-Host "  Custom plugins need Vencord built from source. If you installed Vencord"
    Write-Host "  with the official installer, that is not enough on its own - a source"
    Write-Host "  checkout is also required, and this script can create one for you."
    Write-Host ""
    Write-Host "  If you already have one somewhere, cancel and set it first:"
    Write-Host "      `$env:VENCORD_DIR = 'C:\path\to\Vencord'"
    Write-Host ""
    Write-Host "  Otherwise a fresh copy will be cloned into:"
    Write-Host "      $defaultDir"
    Write-Host ""

    $reply = Read-Host "Clone Vencord there now? [y/N]"
    if ($reply -notmatch '^\s*[yY]') {
        Die "Aborted. Nothing was changed."
    }

    $VencordDir = $defaultDir
    Write-Info "Cloning Vencord into $VencordDir"
    git clone --depth 1 $VencordRepo $VencordDir
    if ($LASTEXITCODE -ne 0) { Die "git clone failed." }
} elseif (-not $env:VENCORD_DIR) {
    Write-Info "Using existing Vencord checkout: $VencordDir"
}

# --- Install the plugin ---------------------------------------------------------
$Target = Join-Path $VencordDir "src\userplugins\$PluginName"
New-Item -ItemType Directory -Force -Path (Join-Path $VencordDir "src\userplugins") | Out-Null

if ((Test-Path $Target) -and ((Resolve-Path $Target).Path -eq (Resolve-Path $ScriptDir).Path)) {
    Write-Info "Plugin already in place"
} elseif (Test-Path (Join-Path $ScriptDir "index.tsx")) {
    Write-Info "Copying plugin files into $Target"
    if (Test-Path $Target) { Remove-Item $Target -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $Target | Out-Null

    # Only the plugin sources; not the installer or repo metadata.
    #
    # -Filter rather than -Include: -Include silently returns nothing unless the path
    # ends in a wildcard, which would copy zero files and leave an empty plugin folder.
    $copied = 0
    foreach ($pattern in @("*.ts", "*.tsx", "*.css")) {
        foreach ($file in Get-ChildItem -Path $ScriptDir -Filter $pattern -File) {
            Copy-Item -LiteralPath $file.FullName -Destination $Target
            $copied++
        }
    }

    if ($copied -eq 0) { Die "No plugin sources found in $ScriptDir." }
    Write-Info "Copied $copied files"
} else {
    Write-Info "Cloning plugin into $Target"
    if (Test-Path $Target) { Remove-Item $Target -Recurse -Force }
    git clone --depth 1 $RepoUrl $Target
    if ($LASTEXITCODE -ne 0) { Die "git clone failed." }
}

# --- Build ----------------------------------------------------------------------
Push-Location $VencordDir
try {
    Write-Info "Installing dependencies (this can take a minute)"
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { Die "pnpm install failed." }

    Write-Info "Building Vencord with FastChannelActions"
    pnpm build
    if ($LASTEXITCODE -ne 0) { Die "Build failed." }

    # Vesktop validates the folder by checking for package.json alongside the built
    # files. pnpm build does not emit one, and without it Vesktop decides the install
    # is invalid and silently redownloads stock Vencord over this build.
    $distPkg = Join-Path $VencordDir "dist\package.json"
    if (-not (Test-Path $distPkg)) { "{}" | Out-File -Encoding ascii $distPkg }

    $renderer = Join-Path $VencordDir "dist\vencordDesktopRenderer.js"
    if (-not (Select-String -Path $renderer -Pattern "FastChannelActions" -Quiet)) {
        Die "Build finished but the plugin is not in the output. Please report this."
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Build complete." -ForegroundColor Green
Write-Host ""
Write-Host @"
Last step - pick the one that matches your client:

  Discord Desktop (Vencord)
      cd "$VencordDir"
      pnpm inject
    Then follow the prompts and restart Discord.

  Vesktop
      1. Open Vesktop
      2. Settings -> Vesktop Settings -> Vencord Location -> Change
      3. Select: $VencordDir\dist
      4. Fully quit and reopen Vesktop

Then open Settings -> Plugins, search "FastChannelActions", and enable it.
"@
