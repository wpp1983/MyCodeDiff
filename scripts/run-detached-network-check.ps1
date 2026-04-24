param(
  [string]$OutputPath = "C:\work\github\MyCodeDiff\.tmp-network-check.txt",
  [string]$Workspace = "C:\work\wp_dev_1"
)

$script = @"
Set-Location '$Workspace'
'time=' + (Get-Date).ToString('s') | Out-File -LiteralPath '$OutputPath' -Encoding UTF8
'whoami=' + (whoami) | Out-File -LiteralPath '$OutputPath' -Append -Encoding UTF8
'p4=' + ((Get-Command p4 -ErrorAction SilentlyContinue).Source) | Out-File -LiteralPath '$OutputPath' -Append -Encoding UTF8
'--- p4 info ---' | Out-File -LiteralPath '$OutputPath' -Append -Encoding UTF8
try {
  p4 info 2>&1 | Out-File -LiteralPath '$OutputPath' -Append -Encoding UTF8
} catch {
  'p4 exception=' + `$_.Exception.Message | Out-File -LiteralPath '$OutputPath' -Append -Encoding UTF8
}
'--- tcp 1.1.1.1:80 ---' | Out-File -LiteralPath '$OutputPath' -Append -Encoding UTF8
try {
  `$c = [Net.Sockets.TcpClient]::new()
  `$c.Connect('1.1.1.1', 80)
  'tcp connected' | Out-File -LiteralPath '$OutputPath' -Append -Encoding UTF8
  `$c.Close()
} catch {
  'tcp exception=' + `$_.Exception.Message | Out-File -LiteralPath '$OutputPath' -Append -Encoding UTF8
}
"@

$tempScript = Join-Path $env:TEMP "codex-detached-network-check.ps1"
$script | Set-Content -LiteralPath $tempScript -Encoding UTF8

Remove-Item -LiteralPath $OutputPath -ErrorAction SilentlyContinue
$pwsh = (Get-Process -Id $PID).Path
Start-Process -FilePath $pwsh -ArgumentList @("-ExecutionPolicy", "Bypass", "-File", $tempScript) -Wait

if (Test-Path -LiteralPath $OutputPath) {
  Get-Content -LiteralPath $OutputPath
} else {
  Write-Error "Detached check did not write output: $OutputPath"
}
