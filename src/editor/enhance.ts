/* Rich preview pieces that need browser libraries: math (KaTeX), diagrams (Mermaid) and images stored in this browser.
   Libraries load lazily from our own origin, only when the document uses them. Source text stays plain until then. */
interface KatexLike { render(tex:string, element:HTMLElement, options:Record<string, unknown>):void }
interface MermaidLike {
  initialize(config:Record<string, unknown>):void;
  parse(text:string, options?:Record<string, unknown>):Promise<unknown>;
  render(id:string, text:string):Promise<{ svg:string }>;
}
const scriptLoads = new Map<string, Promise<void>>();
function loadScript(src:string):Promise<void> {
  let load = scriptLoads.get(src);
  if (!load) {
    load = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script'); script.src = src;
      script.onload = () => resolve(); script.onerror = () => { scriptLoads.delete(src); reject(new Error('load ' + src)); };
      document.head.append(script);
    });
    scriptLoads.set(src, load);
  }
  return load;
}
let katexReady:Promise<KatexLike>|null = null;
function loadKatex():Promise<KatexLike> {
  if (!katexReady) {
    if (!document.getElementById('katexStyles')) {
      const link = document.createElement('link'); link.id = 'katexStyles'; link.rel = 'stylesheet'; link.href = 'vendor/katex/katex.min.css'; document.head.append(link);
    }
    katexReady = loadScript('vendor/katex/katex.min.js').then(() => (globalThis as unknown as { katex:KatexLike }).katex);
    katexReady.catch(() => { katexReady = null; });
  }
  return katexReady;
}
let mermaidReady:Promise<MermaidLike>|null = null;
let mermaidTheme = '';
function loadMermaid():Promise<MermaidLike> {
  if (!mermaidReady) {
    mermaidReady = loadScript('vendor/mermaid/mermaid.min.js').then(() => (globalThis as unknown as { mermaid:MermaidLike }).mermaid);
    mermaidReady.catch(() => { mermaidReady = null; });
  }
  return mermaidReady;
}
const diagramCache = new Map<string, string>();
let diagramCounter = 0;
const localImageCache = new Map<string, string>();

function enhanceMath(root:HTMLElement) {
  const nodes = [...root.querySelectorAll<HTMLElement>('.math-inline, .math-block')];
  if (!nodes.length) return;
  loadKatex().then(katex => {
    for (const node of nodes) {
      if (!node.isConnected || node.dataset.rendered) continue;
      const tex = node.textContent || '';
      try { katex.render(tex, node, { displayMode: node.classList.contains('math-block'), throwOnError: false, trust: false, strict: 'ignore', maxSize: 20, maxExpand: 500 }); }
      catch { node.classList.add('math-error'); }
    }
  }).catch(() => nodes.forEach(node => node.classList.add('math-error')));
}

function diagramKey(source:string) { return (document.documentElement.getAttribute('data-theme') || 'light') + '\u0000' + source; }
function enhanceDiagrams(root:HTMLElement) {
  const nodes = [...root.querySelectorAll<HTMLElement>('.mermaid-block')];
  if (!nodes.length) return;
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
  for (const node of nodes) {
    const source = node.textContent || '';
    const cached = diagramCache.get(diagramKey(source));
    if (cached !== undefined) { node.innerHTML = cached; node.classList.add('diagram-ready'); continue; }
  }
  const pending = nodes.filter(node => !node.classList.contains('diagram-ready'));
  if (!pending.length) return;
  loadMermaid().then(async mermaid => {
    if (mermaidTheme !== theme) { mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, deterministicIds: false }); mermaidTheme = theme; }
    for (const node of pending) {
      if (!node.isConnected) continue;
      const source = node.textContent || '';
      try {
        await mermaid.parse(source);
        const { svg } = await mermaid.render('diagram-' + (++diagramCounter), source);
        diagramCache.set(diagramKey(source), svg);
        if (node.isConnected) { node.innerHTML = svg; node.classList.add('diagram-ready'); }
      } catch {
        if (node.isConnected) { node.classList.add('diagram-error'); node.setAttribute('role', 'note'); node.dataset.error = Content.t('enhance.diagramError'); }
      }
    }
  }).catch(() => pending.forEach(node => { node.classList.add('diagram-error'); node.dataset.error = Content.t('enhance.diagramError'); }));
}

function enhanceLocalImages(root:HTMLElement) {
  const images = [...root.querySelectorAll<HTMLImageElement>('img[data-local-image]')];
  const store = globalThis.Workspace?.images;
  for (const image of images) {
    const id = image.dataset.localImage || '';
    const cached = localImageCache.get(id);
    if (cached) { image.src = cached; continue; }
    if (!store) { image.classList.add('image-missing'); continue; }
    store.get(id).then(data => {
      if (!data) { if (image.isConnected) { image.classList.add('image-missing'); image.title = Content.t('enhance.imageMissing'); } return; }
      localImageCache.set(id, data); if (image.isConnected) image.src = data;
    }).catch(() => image.classList.add('image-missing'));
  }
}

function enhancePreview(root:HTMLElement) { enhanceMath(root); enhanceDiagrams(root); enhanceLocalImages(root); }
