// ══════════════════════════════════════════════
// State
// ══════════════════════════════════════════════
let syncScroll = true;
let wordWrap = true;
let outlineOpen = false;
let debounceTimer:ReturnType<typeof setTimeout>|undefined;
let currentTheme = 'light';

const editor = UI.area('editor');
const preview = UI.html('preview');

function saveContent() { globalThis.EditorBridge.changed(globalThis.Workspace); }
