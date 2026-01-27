tsc -p electron/tsconfig.json
if (Test-Path "dist-electron\main.js") { Rename-Item -Path "dist-electron\main.js" -NewName "main.cjs" -Force }
if (Test-Path "dist-electron\preload.js") { Rename-Item -Path "dist-electron\preload.js" -NewName "preload.cjs" -Force }
Get-ChildItem dist-electron
npm run electron:dev
