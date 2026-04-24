param(
  [string]$Workspace = "C:\work\wp_dev_1",
  [string]$P4Path = "p4",
  [int]$TimeoutSeconds = 15,
  [int]$HistoryLimit = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "==== $Title ===="
}

function Write-Ok {
  param([string]$Message)
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Message)
  Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Invoke-Process {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory,
    [int]$TimeoutSeconds = 15
  )

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $FilePath
  foreach ($arg in $Arguments) {
    [void]$psi.ArgumentList.Add($arg)
  }
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi

  try {
    [void]$process.Start()
  } catch {
    return [pscustomobject]@{
      ExitCode = -1
      Stdout = ""
      Stderr = $_.Exception.Message
      TimedOut = $false
    }
  }

  $completed = $process.WaitForExit($TimeoutSeconds * 1000)
  if (-not $completed) {
    try { $process.Kill() } catch {}
    return [pscustomobject]@{
      ExitCode = -2
      Stdout = $process.StandardOutput.ReadToEnd()
      Stderr = "Process timed out after $TimeoutSeconds seconds."
      TimedOut = $true
    }
  }

  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $process.StandardOutput.ReadToEnd()
    Stderr = $process.StandardError.ReadToEnd()
    TimedOut = $false
  }
}

function Invoke-P4 {
  param([string[]]$Arguments)
  Invoke-Process -FilePath $P4Path -Arguments $Arguments -WorkingDirectory $Workspace -TimeoutSeconds $TimeoutSeconds
}

function Parse-P4Set {
  param([string]$Text)
  $result = @{}
  foreach ($line in ($Text -split "`r?`n")) {
    if ($line -match "^([^=]+)=(.*?)(?:\s+\(|$)") {
      $result[$matches[1]] = $matches[2]
    }
  }
  return $result
}

function Test-Dns {
  param([string]$HostName)
  try {
    $addresses = [System.Net.Dns]::GetHostAddresses($HostName)
    if ($addresses.Count -gt 0) {
      Write-Ok "DNS resolved $HostName -> $($addresses -join ', ')"
      return $true
    }
    Write-Fail "DNS returned no addresses for $HostName"
    return $false
  } catch {
    Write-Fail "DNS failed for ${HostName}: $($_.Exception.Message)"
    return $false
  }
}

function Test-Tcp {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutSeconds = 10
  )
  $client = $null
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne($TimeoutSeconds * 1000)
    if (-not $ok) {
      Write-Fail "TCP connect timed out: ${HostName}:$Port"
      return $false
    }
    $client.EndConnect($async)
    Write-Ok "TCP connected: ${HostName}:$Port"
    return $true
  } catch {
    Write-Fail "TCP connect failed: ${HostName}:$Port - $($_.Exception.Message)"
    return $false
  } finally {
    if ($null -ne $client) {
      $client.Close()
    }
  }
}

function Print-CommandResult {
  param(
    [string]$Name,
    [object]$Result,
    [int]$MaxChars = 3000
  )
  if ($Result.ExitCode -eq 0) {
    Write-Ok "$Name succeeded"
  } elseif ($Result.TimedOut) {
    Write-Fail "$Name timed out"
  } else {
    Write-Fail "$Name failed with exit code $($Result.ExitCode)"
  }

  if ($Result.Stdout) {
    Write-Host "-- stdout --"
    Write-Host ($Result.Stdout.Substring(0, [Math]::Min($Result.Stdout.Length, $MaxChars)))
  }
  if ($Result.Stderr) {
    Write-Host "-- stderr --"
    Write-Host ($Result.Stderr.Substring(0, [Math]::Min($Result.Stderr.Length, $MaxChars)))
  }
}

$summary = [ordered]@{
  WorkspaceExists = $false
  P4Found = $false
  P4SetReadable = $false
  DnsOk = $false
  TcpOk = $false
  P4InfoOk = $false
  ClientViewOk = $false
  PendingListOk = $false
  HistoryListOk = $false
}

Write-Section "Workspace"
Write-Host "Workspace: $Workspace"
if (Test-Path -LiteralPath $Workspace) {
  $summary.WorkspaceExists = $true
  Write-Ok "Workspace exists"
  $config = Join-Path $Workspace ".p4config"
  if (Test-Path -LiteralPath $config) {
    Write-Ok ".p4config found: $config"
    Get-Content -LiteralPath $config | ForEach-Object { Write-Host "  $_" }
  } else {
    Write-Warn ".p4config not found in workspace root"
  }
} else {
  Write-Fail "Workspace does not exist"
}

Write-Section "P4 executable"
$p4Command = Get-Command $P4Path -ErrorAction SilentlyContinue
if ($p4Command) {
  $summary.P4Found = $true
  Write-Ok "p4 found: $($p4Command.Source)"
} else {
  Write-Fail "p4 executable not found: $P4Path"
}

Write-Section "p4 set"
$p4Set = Invoke-P4 @("set")
Print-CommandResult "p4 set" $p4Set
$p4Settings = @{}
if ($p4Set.ExitCode -eq 0) {
  $summary.P4SetReadable = $true
  $p4Settings = Parse-P4Set $p4Set.Stdout
}

$p4Port = $null
if ($p4Settings.ContainsKey("P4PORT")) {
  $p4Port = [string]$p4Settings["P4PORT"]
}

if ($p4Port) {
  Write-Section "Network"
  Write-Host "P4PORT: $p4Port"
  if ($p4Port -match "^(?:ssl:)?([^:]+):(\d+)$") {
    $hostName = $matches[1]
    $port = [int]$matches[2]
    $summary.DnsOk = Test-Dns $hostName
    $summary.TcpOk = Test-Tcp $hostName $port $TimeoutSeconds
  } else {
    Write-Warn "P4PORT is not host:port, skipping DNS/TCP checks"
  }
} else {
  Write-Warn "P4PORT not found from p4 set, skipping DNS/TCP checks"
}

Write-Section "p4 info"
$p4Info = Invoke-P4 @("info")
Print-CommandResult "p4 info" $p4Info
if ($p4Info.ExitCode -eq 0) {
  $summary.P4InfoOk = $true
}

Write-Section "p4 client -o"
$client = Invoke-P4 @("client", "-o")
Print-CommandResult "p4 client -o" $client
if ($client.ExitCode -eq 0) {
  $summary.ClientViewOk = $true
}

Write-Section "pending changes"
$clientName = $null
if ($p4Settings.ContainsKey("P4CLIENT")) {
  $clientName = [string]$p4Settings["P4CLIENT"]
}

if ($clientName) {
  $pending = Invoke-P4 @("changes", "-s", "pending", "-c", $clientName)
  Print-CommandResult "p4 changes -s pending -c $clientName" $pending
  if ($pending.ExitCode -eq 0) {
    $summary.PendingListOk = $true
  }
} else {
  Write-Warn "P4CLIENT not found, skipping pending changes check"
}

Write-Section "history changes"
$depotPath = $null
if ($client.ExitCode -eq 0) {
  foreach ($line in ($client.Stdout -split "`r?`n")) {
    if ($line -match "^\s*//([^/\s]+)/") {
      $depotPath = "//$($matches[1])/..."
      break
    }
  }
}

if ($depotPath) {
  $history = Invoke-P4 @("changes", "-s", "submitted", "-m", "$HistoryLimit", $depotPath)
  Print-CommandResult "p4 changes -s submitted -m $HistoryLimit $depotPath" $history
  if ($history.ExitCode -eq 0) {
    $summary.HistoryListOk = $true
  }
} else {
  Write-Warn "Could not infer depot path from client view, skipping history changes check"
}

Write-Section "Summary"
foreach ($key in $summary.Keys) {
  $value = $summary[$key]
  if ($value) {
    Write-Ok "$key = true"
  } else {
    Write-Fail "$key = false"
  }
}

if ($summary.P4InfoOk) {
  exit 0
}

exit 1
