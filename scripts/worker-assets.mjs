import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('swagger-ui-dist/package.json'));
const target = new URL('../.wrangler/assets/docs/', import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js']) {
  await copyFile(join(source, file), new URL(file, target));
}
await writeFile(new URL('index.html', target), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Odivon Main API</title><link rel="stylesheet" href="/docs/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="/docs/swagger-ui-bundle.js"></script>
<script src="/docs/init.js"></script></body></html>`);
await writeFile(new URL('init.js', target),
  'window.onload = () => SwaggerUIBundle({url:"/docs-json",dom_id:"#swagger-ui",deepLinking:true});\n');
await writeFile(new URL('../_headers', target),
  '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; frame-ancestors \'none\'\n');
