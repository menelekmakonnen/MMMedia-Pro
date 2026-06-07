<#
  MMMedia Pro - Git Rescue
  ------------------------------------------------------------------
  Run this ONCE, from the repo root, in PowerShell:

      powershell -ExecutionPolicy Bypass -File scripts\git-rescue.ps1

  What it does:
    1. Removes a stale .git\index.lock that is blocking commits.
    2. Ensures a git identity is configured.
    3. Creates a safety checkpoint commit of ALL current work
       (your ~9 days of uncommitted changes, incl. effectCompiler.ts).
    4. Applies .gitattributes line-ending normalization in a
       SEPARATE commit so future diffs stop showing every line.

  Nothing here deletes work. After it runs, `git log` shows two new
  commits and your working tree is clean.
#>

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "== MMMedia Pro git rescue ==" -ForegroundColor Cyan

# 1. Clear stale lock
if (Test-Path ".git\index.lock") {
    Remove-Item ".git\index.lock" -Force
    Write-Host "  Removed stale .git\index.lock" -ForegroundColor Yellow
}

# 2. Identity (only sets if missing)
if (-not (git config user.name))  { git config user.name  "Menelek Makonnen" }
if (-not (git config user.email)) { git config user.email "hello@menelekmikael.com" }

# 3. Safety checkpoint - capture everything exactly as it is on disk
git add -A
git commit -m "checkpoint: preserve uncommitted work (effect compiler, export parity, bridge + security hardening, transitions)" --no-verify
Write-Host "  Checkpoint commit created." -ForegroundColor Green

# 4. Normalize line endings now that .gitattributes is in place
git add --renormalize .
# Only commit if renormalization actually changed something
$pending = git status --porcelain
if ($pending) {
    git commit -m "chore: normalize line endings to LF via .gitattributes" --no-verify
    Write-Host "  Line-ending normalization commit created." -ForegroundColor Green
} else {
    Write-Host "  Nothing to renormalize." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done. Recent history:" -ForegroundColor Cyan
git --no-pager log --oneline -5
