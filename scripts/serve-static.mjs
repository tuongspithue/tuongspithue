// Máy chủ tĩnh nhỏ cho web app khách khi chạy thử (Codespaces / máy cá nhân). Không cần thư viện ngoài.
// node scripts/serve-static.mjs <thư mục> <cổng>
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const [root = '.', port = '8080'] = process.argv.slice(2);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.symbols': 'text/plain', '.webmanifest': 'application/manifest+json',
};

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    statSync(file);
  } catch {
    file = join(root, 'index.html'); // đường dẫn của app (VD /?order=12) đều trả về trang chính
  }
  const name = file.endsWith('index.html') || file.endsWith('sw.js') || file.endsWith('flutter_bootstrap.js');
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    // Không lưu đệm trang chính để luôn thấy bản mới sau khi build lại.
    'Cache-Control': name ? 'no-cache' : 'public, max-age=3600',
  });
  createReadStream(file).pipe(res);
}).listen(Number(port), () => console.log(`Web app: http://localhost:${port} (thư mục ${root})`));
