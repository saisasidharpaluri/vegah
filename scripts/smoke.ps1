param(
  [string]$BaseUrl = 'http://localhost',
  [switch]$RestartServices
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')

Invoke-RestMethod -Uri "$BaseUrl/health/live" -TimeoutSec 8 | Out-Null
Invoke-RestMethod -Uri "$BaseUrl/health/ready" -TimeoutSec 8 | Out-Null

$payload = @{ text = 'VEGAH builds dependable cloud systems. This queued task checks the full workflow.' } | ConvertTo-Json -Compress
$created = Invoke-RestMethod -Uri "$BaseUrl/api/jobs" -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec 8
if (-not $created.id) { throw 'The API did not return a job ID.' }

$deadline = (Get-Date).AddSeconds(45)
do {
  Start-Sleep -Milliseconds 750
  $job = Invoke-RestMethod -Uri "$BaseUrl/api/jobs/$($created.id)" -TimeoutSec 8
} while ($job.status -in @('queued','running') -and (Get-Date) -lt $deadline)

if ($job.status -ne 'completed') { throw "Job ended in status '$($job.status)' instead of completed." }
if ($job.result.words -ne 12 -or $job.result.sentences -ne 2) { throw "Unexpected job result: $($job.result | ConvertTo-Json -Compress)" }

if ($RestartServices) {
  docker compose restart api worker
  if ($LASTEXITCODE -ne 0) { throw 'Could not restart API and worker containers.' }
  Start-Sleep -Seconds 5
  $persisted = Invoke-RestMethod -Uri "$BaseUrl/api/jobs/$($created.id)" -TimeoutSec 8
  if ($persisted.status -ne 'completed' -or $persisted.result.words -ne 12) {
    throw 'The job result did not persist across application container restarts.'
  }
}

Write-Output "Smoke check passed: $($created.id) completed with $($job.result.words) words."
