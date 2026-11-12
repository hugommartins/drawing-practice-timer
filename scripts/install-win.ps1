# Install Hatchmark on Windows without a browser download, so there is no SmartScreen prompt.
#
#   In a clone of the repo (needs Node):   npm run install:win     builds on this machine, then installs
#   From anywhere (needs a GitHub Release): irm https://raw.githubusercontent.com/hugommartins/drawing-practice-timer/main/scripts/install-win.ps1 | iex
#
# Windows shows its warning for files that carry a "downloaded from the internet" mark (added by browsers).
# Files built here, or fetched by PowerShell, don't carry it.
$ErrorActionPreference = 'Stop'
$repo = 'hugommartins/drawing-practice-timer'

if ($env:OS -ne 'Windows_NT') { throw 'This script is for Windows.' }

function Install-Exe([string]$exe) {
  Unblock-File -Path $exe   # clears the download mark if there is one
  Write-Host "Installing $exe"
  Start-Process -FilePath $exe -ArgumentList '/S' -Wait   # silent, per user, no admin prompt
  Write-Host 'Installed. Start it from the Start menu (Hatchmark).'
  Write-Host "Your data lives in: $env:APPDATA\Hatchmark\data"
}

if (Test-Path -Path 'package.json') {
  # Inside the repo: build locally.
  if (-not (Test-Path -Path 'node_modules')) { npm install; if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' } }
  npm run package:win
  if ($LASTEXITCODE -ne 0) { throw 'The build failed.' }
  $exe = Get-ChildItem -Path 'release' -Filter '*-Setup-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $exe) { throw 'Build finished but no installer was found in release\.' }
  Install-Exe $exe.FullName
} else {
  # Anywhere else: fetch the installer from the latest GitHub Release.
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'hatchmark-installer' }
  $asset = $release.assets | Where-Object { $_.name -like '*-Setup-*.exe' } | Select-Object -First 1
  if (-not $asset) { throw "No installer found in the latest release of $repo." }
  $out = Join-Path $env:TEMP $asset.name
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $out -UseBasicParsing
  Install-Exe $out
}
