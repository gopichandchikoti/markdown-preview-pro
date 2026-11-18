/* One checked boundary for static HTML IDs. Callers choose the required tag, never assert nullable nodes. */
function requiredElement<T extends HTMLElement>(id:string, constructor:{ new():T }):T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error('Missing or invalid interface element: ' + id);
  return element;
}
const UI = {
  html: (id:string) => requiredElement(id, HTMLElement),
  button: (id:string) => requiredElement(id, HTMLButtonElement),
  input: (id:string) => requiredElement(id, HTMLInputElement),
  select: (id:string) => requiredElement(id, HTMLSelectElement),
  area: (id:string) => requiredElement(id, HTMLTextAreaElement),
  dialog: (id:string) => requiredElement(id, HTMLDialogElement),
};
