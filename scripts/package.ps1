param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $project "config.json") -Raw | ConvertFrom-Json).version
}

$releaseDir = Join-Path $project "release-assets"
$archive = Join-Path $releaseDir ("MeshCentral-ScriptTask-" + $Version + ".zip")
$latestArchive = Join-Path $releaseDir "MeshCentral-ScriptTask.zip"
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

$resolvedProject = (Resolve-Path -LiteralPath $project).Path.TrimEnd([char[]]'\/')
$resolvedRelease = (Resolve-Path -LiteralPath $releaseDir).Path.TrimEnd([char[]]'\/')
if (-not $resolvedRelease.StartsWith($resolvedProject + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Release path is outside the project directory."
}
if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
}
if (Test-Path -LiteralPath $latestArchive) {
    Remove-Item -LiteralPath $latestArchive -Force
}

$rootFiles = @(
    "config.json", "scripttask.js", "db.js", "nemongo.js",
    "readme.md", "changelog.md", "LICENSE"
)
$sourceDirs = @("views", "modules_meshcore", "includes")

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [System.IO.File]::Open($archive, [System.IO.FileMode]::CreateNew)
try {
    $zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        $zip.CreateEntry("scripttask/") | Out-Null
        foreach ($dir in $sourceDirs) {
            $zip.CreateEntry("scripttask/$dir/") | Out-Null
            Get-ChildItem -LiteralPath (Join-Path $project $dir) -Recurse -Directory | Sort-Object FullName | ForEach-Object {
                $relative = $_.FullName.Substring($project.Length).TrimStart([char[]]'\/').Replace('\', '/')
                $zip.CreateEntry("scripttask/$relative/") | Out-Null
            }
        }
        foreach ($file in $rootFiles) {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, (Join-Path $project $file), "scripttask/$file", [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
        foreach ($dir in $sourceDirs) {
            Get-ChildItem -LiteralPath (Join-Path $project $dir) -Recurse -File | ForEach-Object {
                $relative = $_.FullName.Substring($project.Length).TrimStart([char[]]'\/').Replace('\', '/')
                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $zip, $_.FullName, "scripttask/$relative", [System.IO.Compression.CompressionLevel]::Optimal
                ) | Out-Null
            }
        }
    } finally {
        $zip.Dispose()
    }
} finally {
    $stream.Dispose()
}

Copy-Item -LiteralPath $archive -Destination $latestArchive
Write-Output "Created $archive and $latestArchive for ScriptTask $Version"
