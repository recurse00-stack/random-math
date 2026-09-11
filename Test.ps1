[CmdletBinding()]
param([switch]$SkipBuild)
$ErrorActionPreference='Stop'
$run=Join-Path $PSScriptRoot ('.ai-work\tasks\validation\'+(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$results=[Collections.Generic.List[object]]::new()
function Invoke-Check([string]$Name,[string]$Program,[string[]]$Arguments) {
    $log=Join-Path $run ($Name+'.log')
    $command=Get-Command $Program -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $previousPreference=$ErrorActionPreference
    try {
        # Windows PowerShell 5.1 converts native stderr to NativeCommandError.
        # Expected test warnings remain in the log; process exit decides success.
        $ErrorActionPreference='Continue'
        $global:LASTEXITCODE=$null
        & $command.Source @Arguments *> $log
        $code=$global:LASTEXITCODE
    } finally {$ErrorActionPreference=$previousPreference}
    if($null -eq $code){throw ($Name+' did not return a process exit code')}
    $results.Add([pscustomobject]@{name=$Name;exit_code=$code;log=$log})
    if($code -ne 0){throw ($Name+' failed; inspect '+$log)}
}
Push-Location -LiteralPath $PSScriptRoot
try {
    if(-not $SkipBuild){Invoke-Check 'build' 'npm.cmd' @('run','build')}
    Invoke-Check 'typecheck' 'node' @('node_modules/typescript/bin/tsc','--noEmit')
    Invoke-Check 'existing-logic' 'node' @('--import','./_test/register-sdk.mjs','_test/run-tests.mjs')
    Invoke-Check 'repair-regression' 'node' @('--import','./_test/register-sdk.mjs','_test/repair.test.mjs')
    Invoke-Check 'postbuild-regression' 'node' @('_test/postbuild.test.mjs')
    $js=(Get-FileHash -LiteralPath 'dist/index.js' -Algorithm SHA256).Hash
    $mjs=(Get-FileHash -LiteralPath 'dist/index.mjs' -Algorithm SHA256).Hash
    if($js -ne $mjs){throw 'Build entry hashes differ'}
    $result=[pscustomobject]@{status='PASS';root=$PSScriptRoot;run=$run;checks=@($results.ToArray());dist_sha256=$js;sdk_scope='local test shim, not real host integration'}
    $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $run 'result.json') -Encoding UTF8
    $result | ConvertTo-Json -Depth 6
} catch {
    [pscustomobject]@{status='FAIL';run=$run;checks=@($results.ToArray());error=$_.Exception.Message} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $run 'result.json') -Encoding UTF8
    throw
} finally {Pop-Location}
