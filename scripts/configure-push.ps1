param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [Parameter(Mandatory=$true)][string]$TeamId,
  [Parameter(Mandatory=$true)][string]$Subject
)
$ErrorActionPreference = 'Stop'
$existing = npx --yes vercel@59.12.0 api "/v9/projects/$ProjectId/env?teamId=$TeamId" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify existing environment' }
if ($existing.envs | Where-Object { $_.key -in @('VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','CRON_SECRET') -and $_.target -contains 'production' }) {
  throw 'Push variables already exist. Inspect configuration; do not rotate keys automatically.'
}
$keys = node -e "process.stdout.write(JSON.stringify(require('web-push').generateVAPIDKeys()))" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'VAPID generation failed' }
$cronSecret = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
$entries = @(
  @{key='VAPID_PUBLIC_KEY';value=$keys.publicKey;type='plain';target=@('production')},
  @{key='VAPID_PRIVATE_KEY';value=$keys.privateKey;type='sensitive';target=@('production')},
  @{key='VAPID_SUBJECT';value=$Subject;type='plain';target=@('production')},
  @{key='CRON_SECRET';value=$cronSecret;type='sensitive';target=@('production')}
)
# No upsert: never rotate an existing key pair or invalidate subscribed devices.
foreach ($entry in $entries) {
  $type = if ($entry.type -eq 'sensitive') { 'secret' } else { 'config' }
  $entry.value | npx --yes vercel@59.12.0 env add $entry.key production --type $type --project $ProjectId --scope $TeamId --yes
  if ($LASTEXITCODE -ne 0) { throw "Could not create $($entry.key). Inspect existing names before retrying." }
}
Write-Output 'Push environment submitted. Verify the four variable names before deploying.'
