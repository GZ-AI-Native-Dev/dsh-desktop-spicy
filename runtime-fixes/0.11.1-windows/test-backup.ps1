[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (![OperatingSystem]::IsWindows()) { throw 'Run these filesystem fixture tests on Windows.' }

# Load only named function AST extents. Neither installer nor rollback main runs.
function Get-HelperDefinitions([string]$Path, [string[]]$Names) {
    $tokens = $null; $parseErrors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) { throw "Source parsing failed: $Path" }
    $definitions = foreach ($name in $Names) {
        $matches = @($ast.FindAll({
            param($node)
            $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
        }, $true))
        if ($matches.Count -ne 1) { throw "Expected one helper definition: $name" }
        $matches[0].Extent.Text
    }
    return [ScriptBlock]::Create(($definitions -join "`n"))
}
function Assert-True($Condition, [string]$Message) {
    if (!$Condition) { throw "Assertion failed: $Message" }
}
function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -cne $Expected) { throw "Assertion failed: $Message (actual=$Actual, expected=$Expected)" }
}
function Expect-Failure([scriptblock]$Code, [string]$Pattern) {
    $failed = $false
    try { & $Code | Out-Null }
    catch {
        $failed = $true
        if ($_.Exception.Message -notmatch $Pattern) { throw "Unexpected failure: $($_.Exception.Message)" }
    }
    if (!$failed) { throw 'Expected this guard to reject the fixture operation.' }
}
$script:passed = 0
function Run-Test([string]$Name, [scriptblock]$Body) {
    & $Body
    $script:passed++
    Write-Output "PASS $Name"
}

$applyPath = Join-Path $PSScriptRoot 'apply-windows.ps1'
$rollbackPath = Join-Path $PSScriptRoot 'rollback-windows.ps1'
. (Get-HelperDefinitions $applyPath @(
    'Get-FullPath', 'Resolve-NodeExecutable', 'Get-Sha256', 'Assert-Hash', 'Assert-BackupLocation',
    'Get-TreeSnapshot', 'Get-TreeFiles', 'Get-TreeDigest', 'Copy-Profile', 'Write-Json', 'Replace-Asar'
))

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
$fixtureRoot = Get-FullPath (Join-Path $tempRoot ('dsh-profile-backup-test-' + [guid]::NewGuid().ToString('N')))
Assert-True ($fixtureRoot.StartsWith($tempRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) 'fixture stays under the system temp directory'
Assert-True ([IO.Path]::GetFileName($fixtureRoot).StartsWith('dsh-profile-backup-test-')) 'fixture has the dedicated prefix'
[void][IO.Directory]::CreateDirectory($fixtureRoot)
$source = Join-Path $fixtureRoot 'source profile'
$destination = Join-Path $fixtureRoot 'copied profile'
$metadataPath = Join-Path $fixtureRoot 'copied profile.links.json'
$outside = Join-Path $fixtureRoot 'outside target'
$sentinel = Join-Path $outside 'DO-NOT-COPY.bin'
$links = [Collections.Generic.List[object]]::new()
try {
    [void][IO.Directory]::CreateDirectory((Join-Path $source 'nested\empty'))
    [void][IO.Directory]::CreateDirectory((Join-Path $source 'empty'))
    [void][IO.Directory]::CreateDirectory($outside)
    [IO.File]::WriteAllBytes((Join-Path $source 'ordinary.bin'), [byte[]]@(0, 1, 128, 254, 255))
    [IO.File]::WriteAllText((Join-Path $source 'nested\中文 file.txt'), 'fixture Unicode and spaces', [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($sentinel, 'external-target-sentinel', [Text.UTF8Encoding]::new($false))
    $sentinelHash = Get-Sha256 $sentinel
    $junction = Join-Path $source 'junction to outside'
    New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
    $links.Add([pscustomobject]@{ path = $junction; directory = $true })
    $optionalSymlinks = 0
    foreach ($linkCase in @(
        [pscustomobject]@{ name = 'file symlink'; target = $sentinel; directory = $false },
        [pscustomobject]@{ name = 'directory symlink'; target = $outside; directory = $true }
    )) {
        $linkPath = Join-Path $source $linkCase.name
        try {
            New-Item -ItemType SymbolicLink -Path $linkPath -Target $linkCase.target | Out-Null
            $links.Add([pscustomobject]@{ path = $linkPath; directory = $linkCase.directory })
            $optionalSymlinks++
        } catch {
            if ($_.Exception.Message -notmatch 'privilege|permission|access|administrator|权限|拒绝|特权') { throw }
            Write-Output "SKIP $($linkCase.name): Windows symlink creation privilege is unavailable."
        }
    }
    $snapshot = Get-TreeSnapshot $source
    $before = Get-TreeDigest $source $snapshot

    Run-Test 'both scripts choose one Node executable without merging multiple spaced paths' {
        foreach ($scriptPath in @($applyPath, $rollbackPath)) {
            . (Get-HelperDefinitions $scriptPath @('Resolve-NodeExecutable'))
            $first = 'C:\Node Runtime One\node.exe'
            $second = 'C:\Node Runtime Two\node.exe'
            function Get-Command {
                param([string]$Name, [string]$CommandType, [string]$ErrorAction)
                Assert-Equal $CommandType 'Application' 'Node lookup remains application-only'
                Assert-Equal $ErrorAction 'Stop' 'Node lookup errors are terminating'
                if ($Name -eq 'missing-node-fixture') { throw 'Node lookup fixture failure' }
                Assert-Equal $Name 'node-fixture' 'caller Node name is preserved'
                return @([pscustomobject]@{ Source = $first }, [pscustomobject]@{ Source = $second })
            }
            $selected = @(Resolve-NodeExecutable 'node-fixture')
            Assert-Equal $selected.Count 1 'exactly one path is returned'
            Assert-Equal $selected[0] $first 'first application path remains a single string with spaces'
            Expect-Failure { Resolve-NodeExecutable 'missing-node-fixture' } 'Node lookup fixture failure'
            Assert-True ((Get-Content -LiteralPath $scriptPath -Raw) -match '\$node\s*=\s*Resolve-NodeExecutable\s+\$NodePath') 'main uses the tested helper without executing main'
        }
    }

    Run-Test 'snapshot records junction/symlink metadata without reading or walking targets' {
        Assert-Equal @($snapshot.files).Count 2 'only ordinary profile files are enumerated'
        Assert-Equal @($snapshot.directories).Count 3 'ordinary and empty directories are enumerated'
        Assert-Equal @($snapshot.reparsePoints).Count (1 + $optionalSymlinks) 'all links are recorded'
        Assert-Equal @(Get-TreeFiles $source).Count 2 'compatibility file listing excludes links'
        $junctionDescription = @($snapshot.reparsePoints | Where-Object relativePath -eq 'junction to outside')[0]
        Assert-Equal $junctionDescription.linkType 'Junction' 'junction link type is preserved'
        Assert-Equal @($junctionDescription.targets).Count 1 'junction target is recorded'
        Assert-True $junctionDescription.isDirectory 'junction is marked as a directory'
        Assert-True (($junctionDescription.attributes -band [int][IO.FileAttributes]::ReparsePoint) -ne 0) 'reparse attributes are preserved'
        Assert-True (!(@($snapshot.files | Where-Object Name -eq 'DO-NOT-COPY.bin').Count)) 'external sentinel is not in the regular snapshot'
        if ($optionalSymlinks -eq 2) {
            Assert-Equal @($snapshot.reparsePoints | Where-Object linkType -eq 'SymbolicLink').Count 2 'file and directory symlinks are recorded'
        }
    }

    $copy = Copy-Profile $source $destination $metadataPath
    $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
    $destinationSnapshot = Get-TreeSnapshot $destination
    $reconstructed = [pscustomobject]@{
        files = @($destinationSnapshot.files); directories = @($destinationSnapshot.directories)
        reparsePoints = @($metadata.reparsePoints)
    }
    $after = Get-TreeDigest $destination $reconstructed

    Run-Test 'copy preserves ordinary files and empty directories but creates no links' {
        Assert-Equal @($destinationSnapshot.files).Count 2 'copied file count'
        Assert-Equal @($destinationSnapshot.directories).Count 3 'copied directory count'
        Assert-Equal @($destinationSnapshot.reparsePoints).Count 0 'no live links are created in the backup'
        foreach ($file in $snapshot.files) {
            $relative = $file.FullName.Substring($source.Length + 1)
            Assert-Equal (Get-Sha256 (Join-Path $destination $relative)) (Get-Sha256 $file.FullName) 'regular file bytes'
        }
        Assert-True (Test-Path -LiteralPath (Join-Path $destination 'empty') -PathType Container) 'root empty directory'
        Assert-True (Test-Path -LiteralPath (Join-Path $destination 'nested\empty') -PathType Container) 'nested empty directory'
        foreach ($link in $links) {
            $relative = $link.path.Substring($source.Length + 1)
            Assert-True (!(Test-Path -LiteralPath (Join-Path $destination $relative))) 'link target is not copied or linked'
        }
        Assert-True (!(Test-Path -LiteralPath (Join-Path $destination 'DO-NOT-COPY.bin'))) 'external sentinel is not copied'
    }

    Run-Test 'saved link metadata round-trips and reconstructs the source digest' {
        Assert-Equal $metadata.format 'dsh-profile-links-v1' 'metadata schema'
        Assert-Equal (ConvertTo-Json -InputObject @($metadata.reparsePoints) -Depth 10 -Compress) (ConvertTo-Json -InputObject @($snapshot.reparsePoints) -Depth 10 -Compress) 'metadata fields and target spelling'
        Assert-Equal $copy.metadataSha256 (Get-Sha256 $metadataPath) 'saved metadata hash'
        foreach ($field in @('sha256', 'files', 'bytes', 'directories', 'reparsePointCount')) {
            Assert-Equal $copy[$field] $before[$field] "copy $field matches source"
            Assert-Equal $after[$field] $before[$field] "reconstructed $field matches source"
        }
        Assert-Equal (Get-TreeDigest $source).sha256 $before.sha256 'source remains unchanged'
    }

    Run-Test 'digest detects changed target metadata and missing empty directories' {
        $changedMetadata = ConvertFrom-Json (ConvertTo-Json -InputObject $metadata -Depth 10)
        $changedMetadata.reparsePoints[0].targets = @('CHANGED-TARGET')
        $changed = [pscustomobject]@{
            files = @($destinationSnapshot.files); directories = @($destinationSnapshot.directories)
            reparsePoints = @($changedMetadata.reparsePoints)
        }
        Assert-True ((Get-TreeDigest $destination $changed).sha256 -ne $before.sha256) 'target metadata affects digest'
        $withoutEmpty = [pscustomobject]@{
            files = @($destinationSnapshot.files)
            directories = @($destinationSnapshot.directories | Where-Object { $_ -ne 'empty' })
            reparsePoints = @($metadata.reparsePoints)
        }
        Assert-True ((Get-TreeDigest $destination $withoutEmpty).sha256 -ne $before.sha256) 'empty directories affect digest'
    }

    Run-Test 'backup path guards reject equality, descendants, dot-dot aliases and in-tree metadata' {
        $excluded = @($source, (Join-Path $fixtureRoot 'install'))
        Assert-BackupLocation (Join-Path $fixtureRoot 'allowed-backup') $excluded
        Assert-BackupLocation ($source + '-sibling\backup') $excluded
        foreach ($bad in @($source, (Join-Path $source 'backup'), (Join-Path $source 'child\..\backup'), $source.ToUpperInvariant())) {
            Expect-Failure { Assert-BackupLocation $bad $excluded } 'outside'
        }
        Expect-Failure { Copy-Profile $source $source } 'outside'
        Expect-Failure { Copy-Profile $source (Join-Path $source 'new-backup') } 'outside'
        Expect-Failure { Copy-Profile $source (Join-Path $fixtureRoot 'guard-new') (Join-Path $source 'links.json') } 'outside'
        Expect-Failure { Copy-Profile $source (Join-Path $fixtureRoot 'guard-new') (Join-Path $fixtureRoot 'guard-new\links.json') } 'outside'
        Expect-Failure { Copy-Profile $source $destination } 'must be new'
        Expect-Failure { Copy-Profile $source (Join-Path $fixtureRoot 'guard-new') $metadataPath } 'must be new'
        Assert-True (!(Test-Path -LiteralPath (Join-Path $fixtureRoot 'guard-new'))) 'guards reject before creating the destination'
    }

    Run-Test 'a profile root that is itself a junction is rejected before traversal' {
        Expect-Failure { Get-TreeSnapshot $junction } 'ordinary directory|reparse point'
        Expect-Failure { Copy-Profile $junction (Join-Path $fixtureRoot 'root-link-copy') } 'ordinary directory|reparse point'
        Assert-True (!(Test-Path -LiteralPath (Join-Path $fixtureRoot 'root-link-copy'))) 'root-link copy never starts'
    }

    Run-Test 'default metadata is stored adjacent to, not inside, the backup tree' {
        $defaultDestination = Join-Path $fixtureRoot 'default copy'
        $defaultCopy = Copy-Profile $source $defaultDestination
        Assert-True (Test-Path -LiteralPath ($defaultDestination + '.links.json') -PathType Leaf) 'adjacent default metadata exists'
        Assert-Equal $defaultCopy.metadataSha256 (Get-Sha256 ($defaultDestination + '.links.json')) 'default metadata verified'
        Assert-Equal @(Get-TreeFiles $defaultDestination).Count 2 'metadata is outside ordinary file tree'
    }

    Run-Test 'external sentinel and original source data remain unchanged' {
        Assert-Equal (Get-Sha256 $sentinel) $sentinelHash 'external sentinel bytes'
        Assert-Equal (Get-TreeDigest $source).sha256 $before.sha256 'source digest'
    }

    Run-Test 'actual Windows File.Replace supports apply and rollback without changing original files' {
        $original = Join-Path $fixtureRoot 'atomic-original.bin'
        $candidate = Join-Path $fixtureRoot 'atomic-candidate.bin'
        $target = Join-Path $fixtureRoot 'atomic-target.bin'
        [IO.File]::WriteAllBytes($original, [byte[]]@(0, 1, 2, 253, 254, 255))
        [IO.File]::WriteAllBytes($candidate, [byte[]]@(255, 128, 42, 0))
        [IO.File]::Copy($original, $target, $false)
        $originalHash = Get-Sha256 $original; $candidateHash = Get-Sha256 $candidate
        Replace-Asar $candidate $target $candidateHash
        Assert-Equal (Get-Sha256 $target) $candidateHash 'apply helper atomically replaces fixture bytes'
        . (Get-HelperDefinitions $rollbackPath @('Get-Sha256', 'Assert-Hash', 'Replace-Asar'))
        Replace-Asar $original $target $originalHash
        Assert-Equal (Get-Sha256 $target) $originalHash 'rollback helper atomically restores fixture bytes'
        Expect-Failure { Replace-Asar $candidate $target ('0' * 64) } 'Hash check failed'
        Assert-Equal (Get-Sha256 $target) $originalHash 'failed stage hash leaves target unchanged'
        Assert-Equal (Get-Sha256 $original) $originalHash 'original preserved'
        Assert-Equal (Get-Sha256 $candidate) $candidateHash 'candidate preserved'
        Assert-Equal @(Get-ChildItem -LiteralPath $fixtureRoot -Filter '.dsh-overlay-*.stage' -Force).Count 0 'temporary stages are removed'
    }
    Write-Output "RESULT passed=$script:passed failed=0 optionalSymlinks=$optionalSymlinks junctions=1"
} finally {
    # Remove only link entries first (nonrecursive), never their external targets.
    foreach ($link in $links) {
        if (Test-Path -LiteralPath $link.path) {
            if ($link.directory) { [IO.Directory]::Delete($link.path, $false) }
            else { [IO.File]::Delete($link.path) }
        }
    }
    $resolved = [IO.Path]::GetFullPath($fixtureRoot)
    if (!$resolved.StartsWith($tempRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or ![IO.Path]::GetFileName($resolved).StartsWith('dsh-profile-backup-test-')) { throw 'Fixture cleanup path guard failed.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
