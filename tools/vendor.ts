export {};
const { mkdirSync, copyFileSync } = require('node:fs');
import { join } from 'node:path';
const root = join(__dirname, '../..');
mkdirSync(join(root, 'vendor'), { recursive: true });
copyFileSync(join(root, 'node_modules/dompurify/dist/purify.min.js'), join(root, 'vendor/purify.min.js'));
copyFileSync(join(root, 'node_modules/dompurify/LICENSE'), join(root, 'vendor/DOMPurify-LICENSE'));
// Optional rich-preview libraries: loaded lazily by the browser only when a document uses math or diagrams.
const { readdirSync } = require('node:fs');
mkdirSync(join(root, 'vendor/katex/fonts'), { recursive: true });
mkdirSync(join(root, 'vendor/mermaid'), { recursive: true });
copyFileSync(join(root, 'node_modules/katex/dist/katex.min.js'), join(root, 'vendor/katex/katex.min.js'));
copyFileSync(join(root, 'node_modules/katex/dist/katex.min.css'), join(root, 'vendor/katex/katex.min.css'));
copyFileSync(join(root, 'node_modules/katex/LICENSE'), join(root, 'vendor/katex/KaTeX-LICENSE'));
for (const font of readdirSync(join(root, 'node_modules/katex/dist/fonts')).filter((name:string) => name.endsWith('.woff2')))
  copyFileSync(join(root, 'node_modules/katex/dist/fonts', font), join(root, 'vendor/katex/fonts', font));
copyFileSync(join(root, 'node_modules/mermaid/dist/mermaid.min.js'), join(root, 'vendor/mermaid/mermaid.min.js'));
copyFileSync(join(root, 'node_modules/mermaid/LICENSE'), join(root, 'vendor/mermaid/Mermaid-LICENSE'));
