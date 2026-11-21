#!/bin/sh
# 组装单文件看板：head.html + Chart.js + app.js -> ../index.html
set -e
cd "$(dirname "$0")"
python3 - <<'PY'
head = open('head.html').read()
chart = open('chart.umd.min.js').read()
xlsx = open('xlsx.mini.min.js').read()
app = open('app.js').read()
out = (head
       + '\n<script>\n' + chart + '\n</script>\n'
       + '<script>\n' + xlsx + '\n</script>\n'
       + '<script>\n' + app + '\n</script>\n'
       + '</body>\n</html>\n')
open('../index.html', 'w').write(out)
print('built index.html, bytes =', len(out))
PY
