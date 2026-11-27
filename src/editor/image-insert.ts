/* Adds images to the current document from paste or the file picker. Images are resized, stored in IndexedDB,
   and referenced from the Markdown by id so the text stays small. */
const IMAGE_INPUT_LIMIT = 12 * 1024 * 1024;
function readAsDataUrl(blob:Blob):Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}
async function imageToData(file:File):Promise<string> {
  const limit = WorkspaceImages.MAX_DATA_URL;
  if (!WorkspaceImages.TYPES.includes(file.type)) throw new Error('unsupported');
  if (file.size > IMAGE_INPUT_LIMIT) throw new Error('tooLarge');
  if (file.type === 'image/gif') { const data = await readAsDataUrl(file); if (data.length > limit) throw new Error('tooLarge'); return data; }
  const bitmap = await createImageBitmap(file);
  try {
    for (const [maxSide, quality] of [[1600, 0.85], [1600, 0.7], [1200, 0.7], [900, 0.6]] as const) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('failed');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL('image/webp', quality);
      if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= limit) return data;
    }
  } finally { bitmap.close(); }
  throw new Error('tooLarge');
}
async function insertImageFiles(files:File[]) {
  const w = globalThis.Workspace;
  if (!w?.images || !w.active()) { showToast(Content.t('image.failed')); return; }
  for (const file of files) {
    try {
      const id = await w.images.put(await imageToData(file));
      const alt = (file.name || 'image').replace(/\.[^.]+$/, '').replace(/[\[\]()\\]/g, ' ').trim() || 'image';
      const at = editor.selectionStart;
      editor.setRangeText('![' + alt + '](#img-' + id + ')\n', at, editor.selectionEnd, 'end');
      render(); globalThis.EditorBridge.changed(w); showToast(Content.t('image.added'));
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      showToast(Content.t(code === 'unsupported' ? 'image.unsupported' : code === 'tooLarge' ? 'image.tooLarge' : code === 'imageLimit' ? 'image.limit' : 'image.failed'));
    }
  }
}
editor.addEventListener('paste', event => {
  const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
  if (!files.length) return;
  event.preventDefault(); void insertImageFiles(files);
});
UI.input('imageFile').addEventListener('change', () => {
  const input = UI.input('imageFile'); const files = [...(input.files || [])]; input.value = '';
  if (files.length) void insertImageFiles(files);
});
