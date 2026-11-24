type EntityKind = 'folders' | 'documents';
type SaveStatus = 'saved' | 'saving' | 'dirty' | 'failed' | 'conflict';
interface MarkdownImport { name:string; content:string }
type MarkdownFile = Pick<File,'name'|'size'|'stream'>;
interface WorkspaceFolder {
  id: string; parentId: string | null; name: string; createdAt: number; updatedAt: number; sortOrder: number;
}
interface WorkspaceDocument {
  id: string; folderId: string; name: string; titleMode: 'auto' | 'manual'; content: string; revision: string;
  createdAt: number; updatedAt: number; sortOrder: number;
}
interface InitializationMarker {
  schemaVersion: number; legacyImported: boolean; defaultFolderId: string | null; initialDocumentId: string | null;
}
type MetadataRecord = { key: 'initialized'; value: InitializationMarker } | { key: 'generation'; value: number };
interface WorkspaceSnapshot { folders: WorkspaceFolder[]; documents: WorkspaceDocument[]; meta: MetadataRecord[] }
interface WorkspaceView {
  tabs: string[]; active: string | null; selectedFolder: string | null; expanded: string[]; sidebar: boolean;
  layout: 'split' | 'editor' | 'preview'; split: number; sync: boolean; wrap: boolean; outline: boolean;
}
interface DocumentSession {
  document: WorkspaceDocument; content: string; start: number; end: number; direction: 'forward' | 'backward' | 'none';
  top: number; left: number; previewTop: number; dirty: boolean; timer: ReturnType<typeof setTimeout> | undefined;
  saving: Promise<boolean> | null; suggestion?: string | null; revertName?: string | null;
}
interface ContentModelShape { schemaVersion: number; defaultLocale: string; locales: Record<string, Record<string, string>> }
interface ContentAdapter { t(key: string, values?: Record<string, string | number>): string; locale: string }
interface ModelAPI {
  MAX_ITEMS: number; MAX_DEPTH: number; MAX_IMPORT_FILES:number; id(): string; fail(code: string): never;
  text(key: string, values?: Record<string, string | number>): string;
  normalizeName(value: string, file?: boolean): string;
  uniqueName<T extends {id:string;name:string}>(records: T[], parentKey: keyof T, parentId: string | null,
    desired: string, exclude?: string): string;
  untitled(documents: WorkspaceDocument[], folderId: string): string;
  validateTree(value: { folders: WorkspaceFolder[]; documents: WorkspaceDocument[]; meta?: MetadataRecord[] }): true;
  generation(state: WorkspaceSnapshot): number; marker(state: WorkspaceSnapshot): InitializationMarker;
  WorkspaceError: new(code: string) => Error & {code:string};
}
interface DatabaseAPI {
  openDatabase(factory?: IDBFactory | null, name?: string): Promise<IDBDatabase>;
  transact<T>(db: IDBDatabase, mode: IDBTransactionMode, transform: (state: WorkspaceSnapshot) => T): Promise<T>;
}
interface RepositoryAdapter {
  db: IDBDatabase;
  initialize(readLegacy: () => string | null, names?: {folder:string;file:string;welcome?:string}): Promise<WorkspaceSnapshot>;
  snapshot(): Promise<WorkspaceSnapshot>;
  change<T>(transform: (state: WorkspaceSnapshot) => T): Promise<T>;
  createFolder(parentId: string | null, name: string): Promise<WorkspaceFolder>;
  createDocument(folderId: string, content?: string, name?: string): Promise<WorkspaceDocument>;
  importDocuments(folderId:string|null, documents:ReadonlyArray<MarkdownImport>):Promise<WorkspaceDocument[]>;
  save(id: string, revision: string, content: string): Promise<WorkspaceDocument>;
  rename(kind: 'documents', id: string, name: string, revision: string): Promise<WorkspaceDocument>;
  rename(kind: 'folders', id: string, name: string, revision?: string): Promise<WorkspaceFolder>;
  rename(kind: EntityKind, id: string, name: string, revision?: string): Promise<WorkspaceFolder | WorkspaceDocument>;
  move(kind: 'documents', id: string, parentId: string, revision: string): Promise<WorkspaceDocument>;
  move(kind: EntityKind, id: string, parentId: string | null, revision?: string): Promise<WorkspaceFolder | WorkspaceDocument>;
  duplicate(id: string): Promise<WorkspaceDocument>;
  duplicateFolder(id:string):Promise<WorkspaceFolder>;
  remove(kind: EntityKind, id: string, generation: number): Promise<void>;
  removeMany(items: ReadonlyArray<{kind:EntityKind;id:string}>, generation: number): Promise<void>;
  close(): void;
}
interface SelectionRef { id: string | null; kind: EntityKind }
interface WorkspaceInstance {
  repository: RepositoryAdapter; snapshot: WorkspaceSnapshot; state: WorkspaceView; selected: SelectionRef;
  statuses: Map<string, SaveStatus>; sessions: Map<string, DocumentSession>; query: string; activity: number;
  pendingDocument:boolean;
  pendingLabel:string;
  multi:Set<string>; selectMode:boolean;
  kindOf(id:string):EntityKind; check(id:string, range?:boolean):void; checkAll(on:boolean):void; setSelectMode(on:boolean):void;
  active(): WorkspaceDocument | undefined; generation(): number; destination(tab?:boolean): string | null | undefined;
  persist(): void; notice(message:string): void; error(error:unknown): void;
  run(action:()=>Promise<unknown>|unknown): Promise<boolean>; refresh(): Promise<void>;
  activate(id:string, focus?:boolean): void; close(id:string): Promise<void>; newFile(tab?:boolean): Promise<void>;
  select(selection:SelectionRef): void; expand(id:string, force?:boolean): void; sidebar(visible?:boolean):void;
  render():void; broadcast?:()=>void; refreshExternal?:()=>Promise<void>;
  realSave?: RepositoryAdapter['save'];
}
interface DialogOptions {
  title:string; label?:string; value?:string; choices?:Array<{value:string;label:string}>; message?:string;
}
interface BackupData {
  format:'md-preview-pro'; version:1; metadata:{schemaVersion:1}; folders:WorkspaceFolder[]; documents:WorkspaceDocument[];
}
interface BackupAPI {
  MAX_BYTES:number; validate(value:unknown):BackupData; decode(bytes:Uint8Array):BackupData;
  readBackup(file:Pick<Blob,'size'|'stream'>):Promise<Uint8Array>;
  encode(snapshot:Pick<WorkspaceSnapshot,'folders'|'documents'>):BackupData;
  apply(state:WorkspaceSnapshot, backup:BackupData, mode:string, generation:number):void;
  bind():void; exportWorkspace():Promise<void>; download(value:string,name:string,type?:string):void;
}
declare var ContentModel: ContentModelShape;
declare var Content: ContentAdapter;
declare var WorkspaceModel: ModelAPI;
declare var WorkspaceDB: DatabaseAPI;
declare var WorkspaceMigration: {
  initialize(state:WorkspaceSnapshot, readLegacy:()=>string|null, names:{folder:string;file:string;welcome?:string}):
    {documentId:string;content:string}|undefined;
};
declare var WorkspaceRepository: { Repository: new(db:IDBDatabase)=>RepositoryAdapter };
declare var WorkspaceState: {
  read(storage?:Pick<Storage,'getItem'>):unknown;
  reconcile(value:unknown, snapshot:Pick<WorkspaceSnapshot,'folders'|'documents'>):WorkspaceView;
  write(value:WorkspaceView, storage?:Pick<Storage,'setItem'>):boolean;
};
declare var Workspace: WorkspaceInstance;
declare var WorkspaceController: {start():Promise<WorkspaceInstance|null>; Controller:new(r:RepositoryAdapter,s:WorkspaceSnapshot)=>WorkspaceInstance};
declare var EditorBridge: {
  session(w:WorkspaceInstance,id?:string|null):DocumentSession|null;
  capture(w:WorkspaceInstance):void; restore(w:WorkspaceInstance):void; changed(w:WorkspaceInstance|undefined):void;
  flush(w:WorkspaceInstance,id?:string|null):Promise<boolean>; flushAll(w:WorkspaceInstance):Promise<boolean>;
  start(w:WorkspaceInstance):void; status(w:WorkspaceInstance):void; unavailable():void;
};
declare var WorkspaceDialog: {ask(options:DialogOptions):Promise<string|true|null>};
declare var WorkspaceTitle: {bind(w:WorkspaceInstance):void; update(w:WorkspaceInstance):void; schedule(w:WorkspaceInstance):void};
declare var WorkspaceShortcuts: {bind(w:WorkspaceInstance):void};
declare var WorkspaceSync: {start(w:WorkspaceInstance):void};
declare var WorkspaceBackup: BackupAPI;
declare var FileBytes: {
  read(file:Pick<Blob,'size'|'stream'>, options:{maxBytes:number;overflowCode:string}):Promise<Uint8Array>;
};
declare var MarkdownFiles: {
  read(files:ReadonlyArray<MarkdownFile>):Promise<MarkdownImport[]>; MAX_FILE_BYTES:number; MAX_BATCH_BYTES:number;
};
declare var WorkspaceMarkdownImport: { bind():void; open(files:ReadonlyArray<MarkdownFile>):Promise<void> };
declare var WorkspaceActions: {bind(w:WorkspaceInstance):void; cycle(w:WorkspaceInstance,direction:number):boolean; path(w:WorkspaceInstance,id:string|null):string};
interface TabsOptions {
  container:HTMLElement;documents:WorkspaceDocument[];state:WorkspaceView;statuses:Map<string,SaveStatus>;
  activate(id:string,focus?:boolean):void;close(id:string):void;
}
declare var WorkspaceTabs: {renderTabs(options:TabsOptions):void};
interface ExplorerOptions {
  container:HTMLElement;snapshot:WorkspaceSnapshot;state:WorkspaceView;selected:SelectionRef;query:string;
  select(selection:SelectionRef):void;open(id:string):void;expand(id:string):void;
  mode:boolean;checked:ReadonlySet<string>;check(id:string,range:boolean):void;
}
declare var WorkspaceExplorer: {
  renderExplorer(options:ExplorerOptions):void;
  keyboard(container:HTMLElement,expand:(id:string)=>void,collapse:(id:string)=>void,select:(id:string)=>void):void;
};
declare var StrictJSON: {parseJSON(text:string):unknown};
interface SecurityAdapter {
  sanitize(html:string):DocumentFragment; validDocument(source:unknown):source is string;
  safeUrl(value:unknown,imagesOnly?:boolean):string|null; MAX_CHARACTERS:number;
}
declare var MarkdownSecurity:SecurityAdapter;
declare var DOMPurify:typeof import('dompurify');
declare var RawRecovery:WorkspaceSnapshot|null|undefined;
declare var Recovery:{original:string;legacy:string|null}|null|undefined;
interface Window {
  Workspace:WorkspaceInstance; copied:string[]; destination:string; hacked?:boolean;
  policyViolation(directive:string):void;reportCSP(directive:string):void;
  axe: typeof import('axe-core');
  releaseDocumentCreation:()=>void;
}
