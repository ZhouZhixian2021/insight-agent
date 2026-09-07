[CmdletBinding()]
param(
  [ValidateRange(0, 65535)]
  [int]$Port = 0,
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$env:DSH_HOME = Join-Path $repositoryRoot '.dsh-runtime'
$dshArguments = @('dsh', 'web', '--port', [string]$Port)
if ($NoOpen) {
  $dshArguments += '--no-open'
}

& pnpm @dshArguments
exit $LASTEXITCODE
