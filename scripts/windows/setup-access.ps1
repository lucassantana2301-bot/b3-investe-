#Requires -Version 5.1
<#
.SYNOPSIS
    Cria o banco Microsoft Access (.accdb) do b3-portfolio-tracker e aplica o schema.

.DESCRIPTION
    Usa ADOX para criar o arquivo e ADODB (ACE OLEDB, dialeto ANSI-92) para executar
    db/access/schema.sql. Ao final imprime a connection string ODBC para o .env da API.

    Pré-requisito: Microsoft Access Database Engine 2016 Redistributable com a MESMA
    arquitetura do Node.js (normalmente x64).

.EXAMPLE
    .\scripts\windows\setup-access.ps1 -DatabasePath C:\dados\portfolio.accdb
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('\.accdb$')]
    [string] $DatabasePath,

    [string] $SchemaPath = (Join-Path $PSScriptRoot '..\..\db\access\schema.sql'),

    [switch] $Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not [Environment]::Is64BitProcess) {
    Write-Warning 'PowerShell 32 bits: o driver ACE precisa ter a mesma arquitetura do Node.js que vai usar o banco.'
}

$DatabasePath = [System.IO.Path]::GetFullPath($DatabasePath)
$SchemaPath = [System.IO.Path]::GetFullPath($SchemaPath)

if (-not (Test-Path $SchemaPath)) {
    throw "Schema não encontrado: $SchemaPath"
}

if (Test-Path $DatabasePath) {
    if (-not $Force) {
        throw "Arquivo já existe: $DatabasePath. Use -Force para recriar (os dados serão apagados)."
    }
    if ($PSCmdlet.ShouldProcess($DatabasePath, 'Apagar banco existente')) {
        Remove-Item $DatabasePath
    }
}

$directory = Split-Path $DatabasePath -Parent
if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
}

$oledb = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$DatabasePath;"

try {
    $catalog = New-Object -ComObject ADOX.Catalog
} catch {
    throw 'ADOX indisponível. Instale o Microsoft Access Database Engine 2016 Redistributable.'
}

$connection = $null
try {
    $catalog.Create($oledb) | Out-Null
    Write-Host "Banco criado: $DatabasePath" -ForegroundColor Green

    $connection = New-Object -ComObject ADODB.Connection
    $connection.Open($oledb)

    # Remove comentários de linha e separa os comandos por ';'.
    $sql = (Get-Content $SchemaPath -Raw) -split "`n" |
        Where-Object { $_ -notmatch '^\s*--' } |
        Out-String
    $statements = $sql -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }

    foreach ($statement in $statements) {
        $preview = ($statement -split "`n")[0]
        Write-Host "  -> $preview"
        $connection.Execute($statement) | Out-Null
    }

    Write-Host "Schema aplicado ($($statements.Count) comandos)." -ForegroundColor Green
}
finally {
    if ($connection -and $connection.State -eq 1) { $connection.Close() }
    foreach ($com in @($connection, $catalog)) {
        if ($com) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($com) }
    }
}

$odbc = "Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=$DatabasePath;"
Write-Host ''
Write-Host 'Adicione ao apps/api/.env:' -ForegroundColor Cyan
Write-Host 'DB_DRIVER=access'
Write-Host "ACCESS_CONNECTION_STRING=$odbc"
