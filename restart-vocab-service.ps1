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

function Test-PortBindable {
    param([int]$TargetPort)

    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new(
            [System.Net.IPAddress]::Loopback,
            $TargetPort
        )
        $listener.Server.ExclusiveAddressUse = $true
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($listener) {
            try { $listener.Stop() } catch {}
        }
    }
}

function Stop-ProcessTreeQuietly {
    param([int]$TargetProcessId)

    if (-not $TargetProcessId -or $TargetProcessId -eq $PID) {
        return
    }

    $processInfo = Get-CimInstance Win32_Process `
        -Filter "ProcessId = $TargetProcessId" `
        -ErrorAction SilentlyContinue

    if (-not $processInfo) {
        Write-Host ("[STALE] PID {0} no longer exists." -f $TargetProcessId) -ForegroundColor DarkYellow
        return
    }

    Write-Host ("[STOP] PID {0}: {1}" -f $TargetProcessId, $processInfo.CommandLine) -ForegroundColor Yellow

    & cmd.exe /d /c "taskkill /PID $TargetProcessId /T /F >nul 2>&1" | Out-Null
    Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
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

    Write-Step "[2/6] Stopping the old service on port 3000..."
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        foreach ($ownerPid in (Get-PortOwners -TargetPort $Port)) {
            Stop-ProcessTreeQuietly -TargetProcessId ([int]$ownerPid)
        }

        Start-Sleep -Milliseconds 300

        if (Test-PortBindable -TargetPort $Port) {
            Write-Host "[OK] Port 3000 is free." -ForegroundColor Green
            break
        }

        if ($attempt -eq 20) {
            throw "Port 3000 is still occupied after 6 seconds."
        }
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

    Copy-Item -LiteralPath ".next\BUILD_ID" -Destination ".next\.running-build-id" -Force

    Write-Step "[6/6] Starting the new service..."
    $serverCommand = "title IELTS Vocab Server && cd /d ""$ProjectRoot"" && npm.cmd start"

    Start-Process `
        -FilePath "cmd.exe" `
        -ArgumentList @("/k", $serverCommand) `
        -WorkingDirectory $ProjectRoot | Out-Null

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

    Write-Host "[OK] New frontend and API routes are running on port 3000." -ForegroundColor Green
    Write-Host "Opening $AppUrl"
    Start-Process $AppUrl
    exit 0
}
catch {
    Write-Host ""
    Write-Host ("[ERROR] {0}" -f $_.Exception.Message) -ForegroundColor Red
    Write-Host ""
    Write-Host "The old service was stopped, but an incomplete new build was not started." -ForegroundColor Yellow
    exit 1
}
