[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Port = 3000
$AppUrl = "http://127.0.0.1:$Port"

# Use the folder containing this script as the project root.
# This avoids invalid-path errors caused by passing a trailing backslash from BAT.
$ProjectRoot = $PSScriptRoot

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host $Text -ForegroundColor Cyan
}

function Get-PortOwners {
    param([int]$TargetPort)

    return @(
        Get-NetTCPConnection `
            -LocalPort $TargetPort `
            -State Listen `
            -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess |
        Where-Object { $_ -and $_ -ne $PID } |
        Sort-Object -Unique
    )
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage (exit code $LASTEXITCODE)"
    }
}

try {
    Set-Location -LiteralPath $ProjectRoot

    Write-Step "[1/6] Checking project files..."
    if (-not (Test-Path -LiteralPath "package.json")) {
        throw "package.json was not found. Put both launcher files in the project root."
    }
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
        throw "Node.js was not found. Install Node.js LTS first."
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw "npm.cmd was not found. Reinstall Node.js LTS."
    }

    Write-Step "[2/6] Checking the current service on port 3000..."
    $currentOwners = @(Get-PortOwners -TargetPort $Port)
    if ($currentOwners.Count -gt 0) {
        Write-Host "[OK] The current service will stay online until the new build succeeds." -ForegroundColor Green
    }
    else {
        Write-Host "[OK] Port 3000 is currently free." -ForegroundColor Green
    }

    Write-Step "[3/6] Checking dependencies..."
    if (-not (Test-Path -LiteralPath "node_modules\.bin\next.cmd")) {
        Write-Host "Dependencies are missing. Running npm install..."
        Invoke-CheckedCommand `
            -FilePath "npm.cmd" `
            -Arguments @("install") `
            -FailureMessage "npm install failed"
    }
    else {
        Write-Host "[OK] Dependencies are present." -ForegroundColor Green
    }

    Write-Step "[4/6] Repairing and validating the master lexicon..."
    $package = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
    $scripts = $package.scripts

    # After local deletes, words.json count/hash change. The sync script now
    # rewrites master-lexicon-baseline.mjs when the cache itself is healthy so
    # a normal user delete no longer bricks this launcher.
    if (Test-Path -LiteralPath "scripts\sync-master-lexicon.mjs") {
        Write-Host "Syncing lexicon (auto-heals baseline after local deletes)..."
        Invoke-CheckedCommand `
            -FilePath "node.exe" `
            -Arguments @("scripts/sync-master-lexicon.mjs") `
            -FailureMessage "Lexicon sync failed"
        Write-Host "Checking lexicon baseline..."
        Invoke-CheckedCommand `
            -FilePath "node.exe" `
            -Arguments @("scripts/sync-master-lexicon.mjs", "--check") `
            -FailureMessage "Lexicon remains inconsistent after synchronization"
        Write-Host "[OK] Lexicon count and hash match the baseline." -ForegroundColor Green
    }
    elseif ($scripts -and $scripts.PSObject.Properties.Name -contains "lexicon:sync") {
        Write-Host "Running npm run lexicon:sync..."
        Invoke-CheckedCommand `
            -FilePath "npm.cmd" `
            -Arguments @("run", "lexicon:sync") `
            -FailureMessage "Lexicon sync failed"
        if ($scripts.PSObject.Properties.Name -contains "lexicon:check") {
            Invoke-CheckedCommand `
                -FilePath "npm.cmd" `
                -Arguments @("run", "lexicon:check") `
                -FailureMessage "Lexicon remains inconsistent after synchronization"
        }
        Write-Host "[OK] Lexicon count and hash match the baseline." -ForegroundColor Green
    }
    else {
        throw "No lexicon repair command was found. Expected scripts\sync-master-lexicon.mjs or lexicon:sync."
    }

    Write-Step "[5/6] Building the latest production version..."
    Invoke-CheckedCommand `
        -FilePath "npm.cmd" `
        -Arguments @("run", "build") `
        -FailureMessage "Production build failed"

    if (-not (Test-Path -LiteralPath ".next\BUILD_ID")) {
        throw "Build completed without .next\BUILD_ID."
    }

    Write-Step "[6/6] Starting the new service..."
    Invoke-CheckedCommand `
        -FilePath "node.exe" `
        -Arguments @("scripts/local-production-server.mjs", "--start") `
        -FailureMessage "The background production service could not be started"

    $ready = $false
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        Start-Sleep -Seconds 1
        try {
            $response = Invoke-WebRequest `
                -Uri $AppUrl `
                -UseBasicParsing `
                -TimeoutSec 2 `
                -ErrorAction Stop

            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                $ready = $true
                break
            }
        }
        catch {
            # Keep waiting while Next.js starts.
        }
    }

    if (-not $ready) {
        throw "The server did not respond at $AppUrl within 60 seconds. Check the IELTS Vocab Server window."
    }

    Write-Host "[OK] New frontend and API routes are running in the background on port 3000." -ForegroundColor Green
    Write-Host "Opening $AppUrl"
    Start-Process $AppUrl
    exit 0
}
catch {
    Write-Host ""
    Write-Host ("[ERROR] {0}" -f $_.Exception.Message) -ForegroundColor Red
    Write-Host ""
    Write-Host "The previous successful build was preserved. Attempting to keep it available..." -ForegroundColor Yellow
    if ((Test-Path -LiteralPath ".next\BUILD_ID") -and (Get-Command node.exe -ErrorAction SilentlyContinue)) {
        try {
            & node.exe "scripts/local-production-server.mjs" --start 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[OK] The previous build is still available on port 3000." -ForegroundColor Green
            }
        }
        catch {
            Write-Host "The previous build could not be restarted automatically; see outputs\ielts538-server.stderr.log." -ForegroundColor Yellow
        }
    }
    exit 1
}
