[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BackupDir,
    [string]$InstallDir,
    [string]$NodePath = 'node',
    [switch]$Execute,
    [switch]$TestFixture
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($Execute -and $TestFixture) { throw 'Choose either -Execute or -TestFixture, not both.' }
function Get-Sha256([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Resolve-NodeExecutable([string]$Name) { return (Get-Command -Name $Name -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source }
function Assert-Hash([string]$Path, [string]$Expected) {
    if (!(Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Sha256 $Path) -ne $Expected) { throw "Hash check failed: $Path" }
}
function Assert-AppClosed([string]$Root) {
    $prefix = $Root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    $running = @(Get-CimInstance Win32_Process | Where-Object {
        $_.ExecutablePath -and ([IO.Path]::GetFullPath($_.ExecutablePath)).StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
    })
    if ($running.Count -gt 0) { throw 'Close DSH Desktop normally before installation verification or rollback. No process was stopped.' }
}
function Invoke-PatchTool([string]$Node, [string]$Tool, [string[]]$Arguments) {
    $saved = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $Node $Tool @Arguments 2>&1 | ForEach-Object { $_.ToString() })
        $status = $LASTEXITCODE
    } finally { $ErrorActionPreference = $saved }
    $result = [ordered]@{ executable = $Node; arguments = @($Tool) + $Arguments; output = ($output -join "`n"); exitStatus = $status }
    if ($status -ne 0) { throw "ASAR verification failed with exit $status`: $($result.output)" }
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
        [IO.File]::Replace($stage, $Target, [NullString]::Value, $true)
        Assert-Hash $Target $Expected
    } finally {
        if (Test-Path -LiteralPath $stage -PathType Leaf) { Remove-Item -LiteralPath $stage -Force }
    }
}
$BackupDir = (Resolve-Path -LiteralPath $BackupDir).ProviderPath.TrimEnd('\', '/')
$recordPath = Join-Path $BackupDir 'prepare.json'
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
if ($record.format -ne 'dsh-windows-overlay-backup-v1' -or $record.desktopVersion -ne '0.11.1' -or $record.baselineAsarSha256 -ne 'c6ad1d6a90b2f52154be97210c0e32cbbedc471822d3fe2f3f74b21c619b1007' -or $record.baselineExeSha256 -ne '1cc3999dc6730e5e846631e9ae122bbcada1acf4b853677322bf30851dbcd419') { throw 'Backup record is not the pinned Windows 0.11.1 overlay.' }
$payload = Join-Path $BackupDir 'payload'
$original = Join-Path $BackupDir 'original-app.asar'
$backupExe = Join-Path $BackupDir 'baseline-exe.bin'
$candidate = Join-Path $BackupDir 'candidate-app.asar'
$tool = Join-Path $payload 'patch-asar.cjs'
Assert-Hash $original $record.baselineAsarSha256
Assert-Hash $backupExe $record.baselineExeSha256
Assert-Hash $candidate $record.candidateAsarSha256
Assert-Hash (Join-Path $payload 'manifest.json') $record.manifestSha256
Assert-Hash $tool $record.patchToolSha256
$node = Resolve-NodeExecutable $NodePath
# Always pass --exe: integrity-enabled or mismatched future builds stop here.
$verify = Invoke-PatchTool $node $tool @('verify', '--asar', $original, '--candidate', $candidate, '--dir', $payload, '--exe', $backupExe)

if ($TestFixture) {
    # Nothing in this branch reads or writes the installation or current user profiles.
    $fixture = Join-Path ([IO.Path]::GetTempPath()) ('dsh-overlay-rollback-fixture-' + [guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($fixture)
    $target = Join-Path $fixture 'app.asar'
    [IO.File]::Copy($original, $target, $false)
    $baselineHash = Get-Sha256 $target
    Replace-Asar $candidate $target $record.candidateAsarSha256
    $appliedHash = Get-Sha256 $target
    Replace-Asar $original $target $record.baselineAsarSha256
    $restoredHash = Get-Sha256 $target
    $result = [ordered]@{
        status = 'fixture-passed'; completedUtc = [DateTime]::UtcNow.ToString('o'); fixture = $fixture
        baselineSha256 = $baselineHash; appliedSha256 = $appliedHash; restoredSha256 = $restoredHash
        replacementPrimitive = 'System.IO.File.Replace'; installationModified = $false; profilesModified = $false
        verification = $verify; exitStatus = 0
    }
    Write-Json (Join-Path $fixture 'verification.json') $result
    $result | ConvertTo-Json -Depth 20
    return
}
if ([string]::IsNullOrWhiteSpace($InstallDir)) { $InstallDir = $record.installDir }
$InstallDir = (Resolve-Path -LiteralPath $InstallDir).ProviderPath.TrimEnd('\', '/')
if (!$InstallDir.Equals($record.installDir, [StringComparison]::OrdinalIgnoreCase)) { throw 'InstallDir differs from the installation recorded during Prepare.' }
$exe = Join-Path $InstallDir 'DSH Desktop.exe'
$asar = Join-Path $InstallDir 'resources\app.asar'
Assert-AppClosed $InstallDir
Assert-Hash $exe $record.baselineExeSha256
$verifyInstalledExe = Invoke-PatchTool $node $tool @('verify', '--asar', $original, '--candidate', $candidate, '--dir', $payload, '--exe', $exe)
$current = Get-Sha256 $asar
if ($current -ne $record.baselineAsarSha256 -and $current -ne $record.candidateAsarSha256) { throw 'Installed ASAR differs from both baseline and prepared candidate. No replacement was performed.' }
if ($Execute) {
    Assert-AppClosed $InstallDir
    Assert-Hash $exe $record.baselineExeSha256
    if ($current -eq $record.baselineAsarSha256) { $status = 'already-restored' }
    else { Replace-Asar $original $asar $record.baselineAsarSha256; $status = 'restored' }
    Assert-Hash $exe $record.baselineExeSha256
} else { $status = 'verified-only' }
$result = [ordered]@{
    status = $status; completedUtc = [DateTime]::UtcNow.ToString('o'); installDir = $InstallDir
    beforeAsarSha256 = $current; afterAsarSha256 = Get-Sha256 $asar; exeSha256 = Get-Sha256 $exe
    profilesModified = $false; userSessionsPreserved = $true; verification = $verifyInstalledExe; exitStatus = 0
}
Write-Json (Join-Path $BackupDir 'rollback-verification.json') $result
$result | ConvertTo-Json -Depth 20
