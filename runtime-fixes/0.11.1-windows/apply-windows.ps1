[CmdletBinding()]
param(
    [string]$InstallDir = 'C:\Program Files\DSH Desktop',
    [string]$BackupDir,
    [string]$NodePath = 'node',
    [switch]$Apply
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-FullPath([string]$Path) { return [IO.Path]::GetFullPath($Path) }
function Get-Sha256([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Assert-Hash([string]$Path, [string]$Expected) {
    if (!(Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Sha256 $Path) -ne $Expected) { throw "Hash check failed: $Path" }
}
function Assert-AppClosed([string]$Root) {
    $prefix = $Root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    $running = @(Get-CimInstance Win32_Process | Where-Object {
        $_.ExecutablePath -and (Get-FullPath $_.ExecutablePath).StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
    })
    if ($running.Count -gt 0) { throw 'Close DSH Desktop normally before preparing or applying this overlay. No process was stopped.' }
}
function Assert-BackupLocation([string]$Backup, [string[]]$ExcludedRoots) {
    foreach ($root in $ExcludedRoots) {
        $full = (Get-FullPath $root).TrimEnd('\', '/')
        if ($Backup.Equals($full, [StringComparison]::OrdinalIgnoreCase) -or $Backup.StartsWith($full + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'BackupDir must be outside the installation and the source profile directories.'
        }
    }
}
function Get-TreeFiles([string]$Root) {
    $queue = [Collections.Generic.Queue[string]]::new()
    $queue.Enqueue($Root)
    $files = [Collections.Generic.List[IO.FileInfo]]::new()
    while ($queue.Count -gt 0) {
        $directory = $queue.Dequeue()
        foreach ($entry in @(Get-ChildItem -LiteralPath $directory -Force)) {
            if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'A profile contains a reparse point. Backup stopped without following it; select a complete ordinary-file backup first.' }
            if ($entry.PSIsContainer) { $queue.Enqueue($entry.FullName) }
            else { $files.Add($entry) }
        }
    }
    return @($files | Sort-Object FullName)
}
function Get-TreeDigest([string]$Root) {
    $sha = [Security.Cryptography.SHA256]::Create()
    $count = 0
    [long]$bytes = 0
    try {
        foreach ($file in @(Get-TreeFiles $Root)) {
            $relative = $file.FullName.Substring($Root.TrimEnd('\', '/').Length + 1).Replace('\', '/')
            $row = [Text.Encoding]::UTF8.GetBytes($relative + [char]0 + (Get-Sha256 $file.FullName) + "`n")
            [void]$sha.TransformBlock($row, 0, $row.Length, $row, 0)
            $count++; $bytes += $file.Length
        }
        [void]$sha.TransformFinalBlock([byte[]]@(), 0, 0)
        return [ordered]@{ sha256 = ([BitConverter]::ToString($sha.Hash)).Replace('-', '').ToLowerInvariant(); files = $count; bytes = $bytes }
    } finally { $sha.Dispose() }
}
function Copy-Profile([string]$Source, [string]$Destination) {
    $files = @(Get-TreeFiles $Source) # Reject traversal through reparse points before any copy.
    [void][IO.Directory]::CreateDirectory($Destination)
    # Keep empty directories, but never enumerate through a symbolic link or junction.
    $queue = [Collections.Generic.Queue[string]]::new(); $queue.Enqueue($Source)
    while ($queue.Count -gt 0) {
        $directory = $queue.Dequeue()
        foreach ($entry in @(Get-ChildItem -LiteralPath $directory -Force -Directory)) {
            if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Profile changed during backup: reparse point detected.' }
            $relative = $entry.FullName.Substring($Source.TrimEnd('\', '/').Length + 1)
            [void][IO.Directory]::CreateDirectory((Join-Path $Destination $relative))
            $queue.Enqueue($entry.FullName)
        }
    }
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($Source.TrimEnd('\', '/').Length + 1)
        $target = Join-Path $Destination $relative
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
        [IO.File]::Copy($file.FullName, $target, $false)
    }
    $before = Get-TreeDigest $Source
    $after = Get-TreeDigest $Destination
    if ($before.sha256 -ne $after.sha256 -or $before.files -ne $after.files -or $before.bytes -ne $after.bytes) { throw 'Profile backup verification failed. Installation has not been replaced.' }
    return $after
}
function Invoke-PatchTool([string]$Node, [string]$Tool, [string[]]$Arguments) {
    $saved = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $Node $Tool @Arguments 2>&1 | ForEach-Object { $_.ToString() })
        $status = $LASTEXITCODE
    } finally { $ErrorActionPreference = $saved }
    $result = [ordered]@{ executable = $Node; arguments = @($Tool) + $Arguments; output = ($output -join "`n"); exitStatus = $status }
    if ($status -ne 0) { throw "ASAR command failed with exit $status`: $($result.output)" }
    return $result
}
function Write-Json([string]$Path, $Value) {
    [IO.File]::WriteAllText($Path, (($Value | ConvertTo-Json -Depth 20) + "`n"), [Text.UTF8Encoding]::new($false))
}
function Replace-Asar([string]$Source, [string]$Target, [string]$Expected) {
    $stage = Join-Path ([IO.Path]::GetDirectoryName($Target)) ('.dsh-overlay-' + [guid]::NewGuid().ToString('N') + '.stage')
    try {
        [IO.File]::Copy($Source, $stage, $false)
        Assert-Hash $stage $Expected
        [IO.File]::Replace($stage, $Target, $null, $true)
        Assert-Hash $Target $Expected
    } finally {
        if (Test-Path -LiteralPath $stage -PathType Leaf) { Remove-Item -LiteralPath $stage -Force }
    }
}

$manifestPath = Join-Path $PSScriptRoot 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.desktopVersion -ne '0.11.1' -or $manifest.baselineAsarSha256 -ne 'c6ad1d6a90b2f52154be97210c0e32cbbedc471822d3fe2f3f74b21c619b1007' -or $manifest.baselineExeSha256 -ne '1cc3999dc6730e5e846631e9ae122bbcada1acf4b853677322bf30851dbcd419') { throw 'Manifest is not the pinned Windows 0.11.1 build.' }
$InstallDir = (Resolve-Path -LiteralPath $InstallDir).ProviderPath.TrimEnd('\', '/')
$exe = Join-Path $InstallDir 'DSH Desktop.exe'
$asar = Join-Path $InstallDir 'resources\app.asar'
Assert-Hash $exe $manifest.baselineExeSha256
Assert-AppClosed $InstallDir
$node = (Get-Command -Name $NodePath -CommandType Application -ErrorAction Stop).Source
$profileSources = @(
    [ordered]@{ name = 'dot-dsh'; path = (Join-Path $env:USERPROFILE '.dsh') },
    [ordered]@{ name = 'dsh-desktop'; path = (Join-Path $env:APPDATA 'dsh-desktop') }
)
if ([string]::IsNullOrWhiteSpace($BackupDir)) { $BackupDir = Join-Path $env:LOCALAPPDATA ('DSHDesktopOverlayBackups\0.11.1-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N')) }
$BackupDir = Get-FullPath $BackupDir
Assert-BackupLocation $BackupDir (@($InstallDir) + @($profileSources | ForEach-Object { $_.path }))
$recordPath = Join-Path $BackupDir 'prepare.json'
$payload = Join-Path $BackupDir 'payload'
$original = Join-Path $BackupDir 'original-app.asar'
$backupExe = Join-Path $BackupDir 'baseline-exe.bin'
$candidate = Join-Path $BackupDir 'candidate-app.asar'
$tool = Join-Path $payload 'patch-asar.cjs'

if (!(Test-Path -LiteralPath $recordPath -PathType Leaf)) {
    Assert-Hash $asar $manifest.baselineAsarSha256
    if ((Test-Path -LiteralPath $BackupDir) -and @(Get-ChildItem -LiteralPath $BackupDir -Force).Count -gt 0) { throw 'Choose a new empty BackupDir, or reuse a completed prepare.json directory.' }
    [void][IO.Directory]::CreateDirectory($payload)
    [IO.File]::Copy($asar, $original, $false)
    [IO.File]::Copy($exe, $backupExe, $false)
    Assert-Hash $original $manifest.baselineAsarSha256
    Assert-Hash $backupExe $manifest.baselineExeSha256
    [IO.File]::Copy($manifestPath, (Join-Path $payload 'manifest.json'), $false)
    [IO.File]::Copy((Join-Path $PSScriptRoot 'patch-asar.cjs'), $tool, $false)
    [IO.File]::Copy((Join-Path $PSScriptRoot 'rollback-windows.ps1'), (Join-Path $BackupDir 'rollback-windows.ps1'), $false)
    foreach ($item in $manifest.files) {
        if ([IO.Path]::GetFileName($item.file) -ne $item.file -or $item.file.Contains('/') -or $item.file.Contains('\')) { throw 'Manifest payload filenames must be flat local filenames.' }
        $source = Join-Path $PSScriptRoot $item.file
        Assert-Hash $source $item.modifiedSha256
        [IO.File]::Copy($source, (Join-Path $payload $item.file), $false)
    }
    $profiles = @()
    foreach ($profile in $profileSources) {
        if (Test-Path -LiteralPath $profile.path -PathType Container) {
            if ((Get-Item -LiteralPath $profile.path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'A source profile root is a reparse point. Installation has not been replaced.' }
            $destination = Join-Path (Join-Path $BackupDir 'profiles') $profile.name
            $digest = Copy-Profile $profile.path $destination
            $profiles += [ordered]@{ name = $profile.name; present = $true; sha256 = $digest.sha256; files = $digest.files; bytes = $digest.bytes }
        } else { $profiles += [ordered]@{ name = $profile.name; present = $false } }
    }
    $build = Invoke-PatchTool $node $tool @('build', '--asar', $original, '--output', $candidate, '--dir', $payload, '--exe', $backupExe)
    $verify = Invoke-PatchTool $node $tool @('verify', '--asar', $original, '--candidate', $candidate, '--dir', $payload, '--exe', $backupExe)
    $record = [ordered]@{
        format = 'dsh-windows-overlay-backup-v1'; preparedUtc = [DateTime]::UtcNow.ToString('o'); state = 'prepared'
        installDir = $InstallDir; desktopVersion = $manifest.desktopVersion; harnessVersion = $manifest.harnessVersion
        baselineAsarSha256 = $manifest.baselineAsarSha256; baselineExeSha256 = $manifest.baselineExeSha256
        candidateAsarSha256 = Get-Sha256 $candidate; manifestSha256 = Get-Sha256 (Join-Path $payload 'manifest.json')
        patchToolSha256 = Get-Sha256 $tool; rollbackScriptSha256 = Get-Sha256 (Join-Path $BackupDir 'rollback-windows.ps1')
        profileBackups = $profiles; commands = @($build, $verify)
    }
    Write-Json $recordPath $record
}
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
if ($record.format -ne 'dsh-windows-overlay-backup-v1' -or !$record.installDir.Equals($InstallDir, [StringComparison]::OrdinalIgnoreCase) -or $record.baselineAsarSha256 -ne $manifest.baselineAsarSha256 -or $record.baselineExeSha256 -ne $manifest.baselineExeSha256) { throw 'Prepared backup does not match this installation and manifest.' }
Assert-Hash $original $record.baselineAsarSha256
Assert-Hash $backupExe $record.baselineExeSha256
Assert-Hash $candidate $record.candidateAsarSha256
Assert-Hash (Join-Path $payload 'manifest.json') $record.manifestSha256
Assert-Hash $tool $record.patchToolSha256
Assert-Hash (Join-Path $BackupDir 'rollback-windows.ps1') $record.rollbackScriptSha256
$verify = Invoke-PatchTool $node $tool @('verify', '--asar', $original, '--candidate', $candidate, '--dir', $payload, '--exe', $exe)
Write-Json (Join-Path $BackupDir 'latest-verify.json') $verify
Assert-AppClosed $InstallDir
Assert-Hash $exe $record.baselineExeSha256
if ($Apply) {
    $current = Get-Sha256 $asar
    if ($current -eq $record.candidateAsarSha256) { $status = 'already-applied' }
    elseif ($current -eq $record.baselineAsarSha256) {
        Replace-Asar $candidate $asar $record.candidateAsarSha256
        $status = 'applied'
    } else { throw 'Installed ASAR differs from both pinned baseline and prepared candidate. No replacement was performed.' }
    Assert-Hash $exe $record.baselineExeSha256
    Write-Json (Join-Path $BackupDir 'apply.json') ([ordered]@{ status = $status; completedUtc = [DateTime]::UtcNow.ToString('o'); beforeAsarSha256 = $current; afterAsarSha256 = Get-Sha256 $asar; exeSha256 = Get-Sha256 $exe; profilesModified = $false; verification = $verify; exitStatus = 0 })
} else {
    Assert-Hash $asar $record.baselineAsarSha256
    $status = 'prepared-only'
}
[pscustomobject]@{ Status = $status; BackupDir = $BackupDir; Candidate = $candidate; Record = $recordPath; Rollback = (Join-Path $BackupDir 'rollback-windows.ps1'); UserProfilesModified = $false } | Format-List
