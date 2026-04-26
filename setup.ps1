param(
  [ValidateSet("webstore", "local")]
  [string]$Mode = "webstore",

  [string]$Branch = "main",
  [string]$RepoUrl = "https://github.com/Dominic100/lkb.git",
  [string]$ExtensionBundleUrl = "https://github.com/Dominic100/lkb/releases/latest/download/lkb-extension.zip",
  [string]$NativeBundleUrl = "https://github.com/Dominic100/lkb/releases/latest/download/lkb-native.zip",
  [string]$Models = "qwen2.5:7b",
  [string]$ExtensionDir = "$env:USERPROFILE\.lkb-extension",
  [string]$NativeDir = "$env:USERPROFILE\.lkb-native"
)

$ErrorActionPreference = "Stop"

$DockerComposeFile = "native/docker-compose.yml"
$EnvFile = "native/.env"
$EnvExampleFile = "native/.env.example"
$ScriptRoot = if ($PSScriptRoot -and $PSScriptRoot.Trim().Length -gt 0) {
  $PSScriptRoot
} elseif ($MyInvocation.MyCommand.Path) {
  Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
  (Get-Location).Path
}
$DownloadDir = Join-Path $ScriptRoot ".downloaded-extension"
$OpenBrowserAfterSetup = $true

function Write-Log {
  param([string]$Message)
  Write-Host "[setup] $Message"
}

function Write-Warn {
  param([string]$Message)
  Write-Warning $Message
}

function Throw-SetupError {
  param([string]$Message)
  throw "[setup] ERROR: $Message"
}

function Ensure-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Throw-SetupError "Missing required command: $Name"
  }
}

function Ensure-Docker {
  Ensure-Command "docker"

  try {
    docker info | Out-Null
  } catch {
    Throw-SetupError "Docker is not running or not accessible"
  }

  try {
    docker compose version | Out-Null
  } catch {
    Throw-SetupError "Docker Compose v2 is required"
  }

  Ensure-Command "curl"
  Ensure-Command "Expand-Archive"
}

function Prepare-Bundles {
  if ($Mode -ne "local") {
    return
  }

  New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null

  if (Test-Path $ExtensionDir) {
    Remove-Item -Recurse -Force $ExtensionDir
  }

  if (Test-Path $NativeDir) {
    Remove-Item -Recurse -Force $NativeDir
  }

  $extensionBundlePath = Join-Path $DownloadDir "lkb-extension.zip"
  $nativeBundlePath = Join-Path $DownloadDir "lkb-native.zip"

  Write-Log "Downloading extension bundle from $ExtensionBundleUrl"
  Invoke-WebRequest -Uri $ExtensionBundleUrl -OutFile $extensionBundlePath

  Write-Log "Downloading native bundle from $NativeBundleUrl"
  Invoke-WebRequest -Uri $NativeBundleUrl -OutFile $nativeBundlePath

  $extensionExtractDir = Join-Path $DownloadDir "extension-extracted"
  $nativeExtractDir = Join-Path $DownloadDir "native-extracted"

  if (Test-Path $extensionExtractDir) {
    Remove-Item -Recurse -Force $extensionExtractDir
  }
  if (Test-Path $nativeExtractDir) {
    Remove-Item -Recurse -Force $nativeExtractDir
  }

  New-Item -ItemType Directory -Force -Path $extensionExtractDir | Out-Null
  New-Item -ItemType Directory -Force -Path $nativeExtractDir | Out-Null

  Write-Log "Extracting extension bundle to $extensionExtractDir"
  Expand-Archive -Path $extensionBundlePath -DestinationPath $extensionExtractDir -Force

  $extensionRoot = if (Test-Path (Join-Path $extensionExtractDir "extension")) {
    Join-Path $extensionExtractDir "extension"
  } else {
    $extensionExtractDir
  }

  New-Item -ItemType Directory -Force -Path $ExtensionDir | Out-Null
  Copy-Item -Path (Join-Path $extensionRoot "*") -Destination $ExtensionDir -Recurse -Force

  Write-Log "Extracting native bundle to $nativeExtractDir"
  Expand-Archive -Path $nativeBundlePath -DestinationPath $nativeExtractDir -Force

  $nativeRoot = if (Test-Path (Join-Path $nativeExtractDir "native")) {
    Join-Path $nativeExtractDir "native"
  } else {
    $nativeExtractDir
  }

  New-Item -ItemType Directory -Force -Path $NativeDir | Out-Null
  Copy-Item -Path (Join-Path $nativeRoot "*") -Destination $NativeDir -Recurse -Force

  $script:DockerComposeFile = Join-Path $NativeDir "docker-compose.yml"
  $script:EnvFile = Join-Path $NativeDir ".env"
  $script:EnvExampleFile = Join-Path $NativeDir ".env.example"
}

function Prepare-EnvFile {
  if (-not (Test-Path $EnvExampleFile)) {
    Throw-SetupError "Missing $EnvExampleFile"
  }

  if (-not (Test-Path $EnvFile)) {
    Write-Log "Creating $EnvFile from template"
    Copy-Item $EnvExampleFile $EnvFile
  }

  if ($Models -and $Models.Trim().Length -gt 0) {
    $content = Get-Content $EnvFile -Raw
    if ($content -match '(?m)^MODELS=') {
      $content = [regex]::Replace($content, '(?m)^MODELS=.*$', "MODELS=$Models")
    } else {
      if (-not $content.EndsWith("`n")) {
        $content += "`n"
      }
      $content += "MODELS=$Models`n"
    }
    Set-Content -Path $EnvFile -Value $content -NoNewline
  }
}

function Start-Services {
  Write-Log "Starting local Ollama/Qdrant services"
  docker compose -f $DockerComposeFile --env-file $EnvFile up -d
}

function Wait-For-Service {
  param(
    [string]$Url,
    [string]$Label,
    [int]$Retries = 300,
    [int]$SleepSeconds = 1
  )

  Write-Log "Waiting for $Label..."
  for ($i = 1; $i -le $Retries; $i++) {
    try {
      curl.exe -fsS $Url | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Log "$Label is reachable"
        return
      }
    } catch {
      # continue waiting
    }
    Start-Sleep -Seconds $SleepSeconds
  }

  Throw-SetupError "$Label did not become reachable"
}

function Print-Next-Steps {
  switch ($Mode) {
    "webstore" {
      Write-Host ""
      Write-Host "Next steps for Web Store flow:"
      Write-Host "1. Install the Chrome extension from the Chrome Web Store."
      Write-Host "2. Keep this window open until Ollama finishes pulling the model."
      Write-Host "3. If the extension cannot connect, verify Chrome is allowed to reach http://127.0.0.1:11434."
      Write-Host ""
    }
    "local" {
      Write-Host ""
      Write-Host "Next steps for local unpacked flow:"
      Write-Host "1. The extension bundle and native bundle have been downloaded and extracted locally."
      Write-Host "2. Open chrome://extensions in Chrome."
      Write-Host "3. Enable Developer Mode."
      Write-Host "4. Click Load unpacked."
      Write-Host "5. Select the extension directory: $ExtensionDir"
      Write-Host ""
    }
  }
}

function Open-Browser-Help {
  if (-not $OpenBrowserAfterSetup) {
    return
  }

  try {
    Start-Process "chrome.exe" "chrome://extensions"
    return
  } catch {}

  try {
    Start-Process "msedge.exe" "edge://extensions"
    return
  } catch {}

  Write-Warn "Chrome or Edge not found automatically. Open chrome://extensions manually."
}

Ensure-Docker
Prepare-Bundles
Prepare-EnvFile
Start-Services
Wait-For-Service -Url "http://127.0.0.1:11434/api/tags" -Label "Ollama" -Retries 600 -SleepSeconds 1
Wait-For-Service -Url "http://127.0.0.1:6333/collections" -Label "Qdrant" -Retries 120 -SleepSeconds 1
Print-Next-Steps
Open-Browser-Help
Write-Log "Setup complete"
