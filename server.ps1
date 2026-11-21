# 预算看板·局域网分享服务（零安装、无需管理员权限）
# 用法：双击「启动分享.bat」即可，关闭窗口即停止。
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8734
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'
  '.xlsx' = 'application/octet-stream'; '.xls' = 'application/octet-stream'; '.csv' = 'text/csv; charset=utf-8'
}
$ip = $null
try { $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddressToString } catch { }
if (-not $ip) { $ip = '你的本机IP（ipconfig 查看）' }
Write-Host ''
Write-Host '  =============================================' -ForegroundColor Green
Write-Host "   分享地址:  http://$ip`:$port/" -ForegroundColor Green
Write-Host '   发给同事，浏览器打开即看（只读模式）' -ForegroundColor Green
Write-Host '   首次启动若弹出防火墙提示，请选「允许访问」' -ForegroundColor Yellow
Write-Host '   关闭本窗口即停止分享' -ForegroundColor Yellow
Write-Host '  =============================================' -ForegroundColor Green
Write-Host ''

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
$listener.Start()
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)
      $first = $reader.ReadLine()
      if (-not $first) { $client.Close(); continue }
      while ($true) { $l = $reader.ReadLine(); if ($null -eq $l -or $l -eq '') { break } }
      $rawPath = ($first -split ' ')[1]
      if (-not $rawPath) { $client.Close(); continue }
      $path = [System.Uri]::UnescapeDataString($rawPath.Split('?')[0])
      if ($path -eq '/') { $path = '/index.html' }
      $rel = $path.TrimStart('/') -replace '/', '\'
      $file = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      $head = $null; $body = $null
      if ($file.StartsWith($root) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
        $ct = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $body = [System.IO.File]::ReadAllBytes($file)
        $head = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      } else {
        $head = "HTTP/1.1 404 Not Found`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
      }
      $hb = [System.Text.Encoding]::UTF8.GetBytes($head)
      $stream.Write($hb, 0, $hb.Length)
      if ($body) { $stream.Write($body, 0, $body.Length) }
      $stream.Flush()
    } catch { }
    finally { $client.Close() }
  }
}
finally { $listener.Stop() }
