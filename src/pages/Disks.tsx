import { useMemo, useRef, useState, type DragEvent } from "react";
import { useApp } from "@/state/store";
import {
  addFolder, addNode, countNodes, createImage, DISK_PRESETS, exportForHost, findPath, importHostFile, isInvisible,
  macToDate, openImage, removeNode, renameNode, saveImage, usedBytes, blessedFolderId, planLayout,
  type MacFile, type MacFolder, type MacNode, type OpenedImage,
} from "@/lib/hfs";
import { describeVolumeFormat, detectContainer } from "@/lib/hfs/container";
import { Empty, Field, Modal, PageHead, Toggle, fmtBytes } from "@/ui/components";
import { Icon, PixelIcon, type PixelName } from "@/ui/icons";
import { N_, t } from "@/i18n";

interface Doc { img: OpenedImage; path: number[]; dirty: boolean; key: number }

const KIND: Record<string, string> = {
  APPL: N_("Application"), TEXT: N_("Text document"), zsys: N_("System file"), FNDR: N_("Finder"), INIT: N_("Extension"), cdev: N_("Control panel"),
  "SIT!": N_("StuffIt archive"), PICT: N_("PICT picture"), ttro: N_("Read-only text"), FFIL: N_("Font suitcase"), tfil: N_("Font"),
  dfil: N_("Desk accessory"), dImg: N_("Disk image"), "PNTG": N_("MacPaint document"), WORD: N_("MacWrite document"), APPC: N_("Application (CFM)"),
  gpch: N_("System patch"), appe: N_("Background application"), rsrc: N_("Resource file"),
};
const kindOf = (n: MacNode) => (n.kind === "folder" ? t("Folder") : t(KIND[n.type] ?? N_("Document")));
const iconOf = (n: MacNode): PixelName => (n.kind === "folder" ? "folder" : n.type === "APPL" || n.type === "APPC" || n.type === "appe" ? "app" : n.type === "zsys" || n.type === "FNDR" ? "happyMac" : n.type === "dImg" ? "floppy" : "doc");
const sizeOf = (n: MacNode): number => (n.kind === "file" ? n.data.length + n.rsrc.length : n.children.reduce((s, c) => s + sizeOf(c), 0));

let docKey = 0;

export function Disks() {
  const { toast, bridge, agentOnline, set: setApp, go } = useApp();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState(0);
  const [sel, setSel] = useState<Set<MacNode>>(new Set());
  const [, force] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [info, setInfo] = useState<MacNode | null>(null);
  const [drag, setDrag] = useState(false);
  const [convertText, setConvertText] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [progress, setProgress] = useState<{ label: string; v: number } | null>(null);
  const lastClick = useRef<MacNode | null>(null);

  const doc = docs[active] as Doc | undefined;
  const folder = doc ? findPath(doc.img.volume.root, doc.path) : null;
  const touch = () => { if (doc) doc.dirty = true; force((x) => x + 1); };

  const openDoc = (img: OpenedImage) => {
    setDocs((d) => [...d, { img, path: [], dirty: false, key: ++docKey }]);
    setActive(docs.length);
    setSel(new Set());
  };

  const openFiles = async () => {
    for (const f of await window.platinum.openFiles({ multi: true, disks: true, title: t("Open a disk image") })) {
      try { openDoc(openImage(f.data, f.name, f.path)); }
      catch (e) {
        const c = detectContainer(f.data);
        const fmt = describeVolumeFormat(f.data.subarray(c.offset, c.offset + c.size));
        toast(fmt === "mfs" ? t("This disk is MFS (System 1–2) and can't be edited yet.") : (e as Error).message, "err");
      }
    }
  };

  const save = async (as = false) => {
    if (!doc) return;
    try {
      const bytes = saveImage(doc.img);
      let path = doc.img.path;
      if (as || !path) path = (await window.platinum.saveFile(doc.img.fileName, bytes)) ?? undefined;
      else await window.platinum.writeFile(path, bytes);
      if (!path) return;
      doc.img.path = path;
      doc.img.fileName = path.split(/[\\/]/).pop()!;
      doc.dirty = false;
      force((x) => x + 1);
      toast(t("Saved: {name}", { name: doc.img.fileName }), "ok");
    } catch (e) { toast((e as Error).message, "err"); }
  };

  const addHostFiles = async (files: { name: string; data: Uint8Array }[], target = folder) => {
    if (!target) return;
    let mb = 0, hqx = 0;
    for (const f of files) {
      try {
        const r = importHostFile(f.name, f.data, { convertText });
        if (r.detected === "macbinary") mb++;
        if (r.detected === "binhex") hqx++;
        addNode(target, r.file);
      } catch (e) { toast(`${f.name}: ${(e as Error).message}`, "err"); }
    }
    touch();
    toast(`${files.length === 1 ? t("1 file added") : t("{n} files added", { n: files.length })}${mb ? ` · ${mb} MacBinary` : ""}${hqx ? ` · ${hqx} BinHex` : ""}`, "ok");
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (!folder) {
      // No disk open: dropping disk images opens them.
      for (const f of Array.from(e.dataTransfer.files)) {
        try { openDoc(openImage(new Uint8Array(await f.arrayBuffer()), f.name)); } catch (err) { toast((err as Error).message, "err"); }
      }
      return;
    }
    const walk = async (entry: FileSystemEntry, into: MacFolder) => {
      if (entry.isFile) {
        const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
        await addHostFiles([{ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }], into);
      } else if (entry.isDirectory) {
        const sub = addFolder(into, entry.name);
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        for (;;) {
          const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const child of batch) await walk(child, sub);
        }
      }
    };
    for (const item of Array.from(e.dataTransfer.items)) {
      const entry = item.webkitGetAsEntry();
      if (entry) await walk(entry, folder);
    }
    touch();
  };

  const extract = async () => {
    const files: { name: string; data: Uint8Array }[] = [];
    const collect = (n: MacNode, prefix: string) => {
      if (n.kind === "file") files.push({ ...exportForHost(n, "auto"), name: prefix + exportForHost(n, "auto").name });
      else n.children.forEach((c) => collect(c, `${prefix}${n.name}_`));
    };
    sel.forEach((n) => collect(n, ""));
    if (!files.length) return;
    const dir = await window.platinum.saveMany(files);
    if (dir) toast(`${files.length === 1 ? t("1 file extracted.") : t("{n} files extracted.", { n: files.length })} ${t("Files with a resource fork are saved as MacBinary (.bin).")}`, "ok");
  };

  const remove = () => {
    if (!folder) return;
    sel.forEach((n) => removeNode(folder, n));
    setSel(new Set());
    touch();
  };

  const tryInEmulator = async () => {
    if (!doc) return;
    try {
      const bytes = saveImage(doc.img);
      const url = await window.platinum.serveDiskBuffer(doc.img.fileName, doc.img.container.kind === "dc42" ? bytes.subarray(84) : bytes);
      setApp({ pendingDiskUrl: { name: doc.img.volume.name, url } });
      go("emulator");
    } catch (e) { toast((e as Error).message, "err"); }
  };

  const sendToMac = async () => {
    if (!bridge || !agentOnline) return;
    const files = [...sel].filter((n): n is MacFile => n.kind === "file");
    try {
      for (const f of files) {
        setProgress({ label: f.name, v: 0 });
        await bridge.agent.sendFile(f, (s, t) => setProgress({ label: f.name, v: s / Math.max(1, t) }));
      }
      toast(files.length === 1 ? t("1 file sent to the Mac's “Platinum Inbox”") : t("{n} files sent to the Mac's “Platinum Inbox”", { n: files.length }), "ok");
    } catch (e) { toast((e as Error).message, "err"); }
    setProgress(null);
  };

  const closeDoc = (i: number) => {
    if (docs[i].dirty && !confirmClose()) return;
    setDocs((d) => d.filter((_, j) => j !== i));
    setActive((a) => Math.max(0, a >= i ? a - 1 : a));
    setSel(new Set());
  };

  const visible = folder ? folder.children.filter((c) => showHidden || !isInvisible(c)) : [];
  const stats = useMemo(() => {
    if (!doc) return null;
    const v = doc.img.volume;
    const L = planLayout(doc.img.container.size);
    const cap = L.allocBlocks * L.allocBlockSize;
    const used = usedBytes(v);
    return { cap, used, ...countNodes(v.root), blessed: blessedFolderId(v) };
  }, [doc, docs, sel, info, force]);

  const selArr = [...sel];
  const oneFile = selArr.length === 1 && selArr[0].kind === "file";

  return (
    <div style={{ maxWidth: 1320 }} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }} onDrop={onDrop}>
      <PageHead kicker="Macintosh" title="Disk Studio" desc={t("Open, create and edit HFS disk images: DiskCopy floppies, .dsk, and BlueSCSI or emulator hard disks (.hda). Drag files in from your computer; MacBinary and BinHex are decoded automatically.")}>
        <button className="btn" onClick={() => setNewOpen(true)}><Icon name="plus" /> {t("New disk")}</button>
        <button className="btn primary" onClick={openFiles}><Icon name="open" /> {t("Open…")}</button>
      </PageHead>

      {docs.length === 0 ? (
        <div className="card" style={{ position: "relative" }}>
          {drag && <div className="drop-hint">{t("Drop to open the image")}</div>}
          <Empty icon="floppy" title={t("No disk open")}>
            {t("Open an image (.dsk, .img, .image, .hda, .toast) or create a new one. You can also drag it here.")}
            <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
              <button className="btn" onClick={() => setNewOpen(true)}>{t("New disk…")}</button>
              <button className="btn primary" onClick={openFiles}>{t("Open…")}</button>
            </div>
          </Empty>
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {docs.map((d, i) => (
              <button key={d.key} className={`btn sm ${i === active ? "primary" : ""}`} onClick={() => { setActive(i); setSel(new Set()); }}>
                <PixelIcon name="disk" size={13} /> {d.img.volume.name}{d.dirty ? " •" : ""}
                <span onClick={(e) => { e.stopPropagation(); closeDoc(i); }} style={{ marginLeft: 4, opacity: 0.7 }}><Icon name="x" size={11} /></span>
              </button>
            ))}
          </div>

          {doc && folder && stats && (
            <div className="grid" style={{ gridTemplateColumns: "260px 1fr", alignItems: "start" }}>
              <div className="col" style={{ gap: 14 }}>
                <div className="win">
                  <div className="win-bar"><span className="win-close" /><span className="win-title">{t("Information")}</span></div>
                  <div className="win-body col" style={{ gap: 10 }}>
                    <div className="row"><PixelIcon name="disk" size={34} />
                      <div style={{ minWidth: 0 }}>
                        <input className="input strong" style={{ height: 26 }} value={doc.img.volume.name} maxLength={27} onChange={(e) => { doc.img.volume.name = e.target.value.replace(/:/g, "") || "untitled"; doc.img.volume.root.name = doc.img.volume.name; touch(); }} />
                        <div className="tiny muted" style={{ marginTop: 3 }}>{doc.img.container.label}</div>
                      </div>
                    </div>
                    <div className="meter-bar"><div style={{ width: `${Math.min(100, (stats.used / stats.cap) * 100)}%`, background: "var(--accent)" }} /></div>
                    <div className="row tiny"><span>{t("{size} used", { size: fmtBytes(stats.used) })}</span><span className="right muted">{t("{size} free", { size: fmtBytes(Math.max(0, stats.cap - stats.used)) })}</span></div>
                    <div className="tiny muted">{t("{files} files · {folders} folders", { files: stats.files, folders: stats.folders })} · {fmtBytes(doc.img.container.size)}</div>
                    {stats.blessed ? <span className="pill ok" style={{ alignSelf: "flex-start" }}><PixelIcon name="happyMac" size={11} /> {t("Startup disk")}</span> : <span className="pill" style={{ alignSelf: "flex-start" }}>{t("Not bootable")}</span>}
                    {doc.img.path && <a className="tiny" onClick={() => window.platinum.reveal(doc.img.path!)} style={{ wordBreak: "break-all" }}>{doc.img.path}</a>}
                  </div>
                </div>
                <div className="card" style={{ padding: "10px 6px" }}>
                  <FolderTree root={doc.img.volume.root} path={doc.path} onOpen={(p) => { doc.path = p; setSel(new Set()); force((x) => x + 1); }} />
                </div>
                <div className="card" style={{ padding: "4px 0" }}>
                  <label className="list-row small"><span className="grow">{t("Convert text (CR, MacRoman)")}</span><Toggle on={convertText} onChange={setConvertText} /></label>
                  <label className="list-row small"><span className="grow">{t("Show invisible files")}</span><Toggle on={showHidden} onChange={setShowHidden} /></label>
                </div>
              </div>

              <div className="card" style={{ position: "relative", minHeight: 460 }}>
                {drag && <div className="drop-hint">{t("Drop to copy into “{folder}”", { folder: folder.name })}</div>}
                <div className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn sm" onClick={async () => { const fs = await window.platinum.openFiles({ multi: true, title: t("Add files to the disk") }); if (fs.length) addHostFiles(fs); }}><Icon name="upload" size={13} /> {t("Add")}</button>
                  <button className="btn sm" onClick={() => { addFolder(folder, "untitled folder"); touch(); }}><Icon name="folderPlus" size={13} /> {t("Folder")}</button>
                  <button className="btn sm" disabled={!sel.size} onClick={extract}><Icon name="download" size={13} /> {t("Extract")}</button>
                  <button className="btn sm" disabled={selArr.length !== 1} onClick={() => setInfo(selArr[0])}><Icon name="info" size={13} /> {t("Info")}</button>
                  <button className="btn sm danger" disabled={!sel.size} onClick={remove}><Icon name="trash" size={13} /> {t("Delete")}</button>
                  <span className="spacer" />
                  <button className="btn sm" onClick={tryInEmulator} title={t("Boot or insert this disk in the embedded emulator")}><PixelIcon name="happyMac" size={13} /> {t("Try in the emulator")}</button>
                  <button className="btn sm" disabled={!agentOnline || !selArr.some((n) => n.kind === "file")} onClick={sendToMac} title={agentOnline ? t("Send over serial to the agent") : t("The agent must be online")}><Icon name="send" size={13} /> {t("Send to Mac")}</button>
                  <button className="btn sm" onClick={() => save(true)}>{t("Save as…")}</button>
                  <button className="btn sm primary" disabled={!doc.dirty && !!doc.img.path} onClick={() => save()}><Icon name="save" size={13} /> {t("Save")}</button>
                </div>
                <div className="row small" style={{ padding: "8px 14px", gap: 4, borderBottom: "1px solid var(--line)" }}>
                  {[{ name: doc.img.volume.name, path: [] as number[] }, ...doc.path.map((_, i) => ({ name: findPath(doc.img.volume.root, doc.path.slice(0, i + 1)).name, path: doc.path.slice(0, i + 1) }))].map((c, i, arr) => (
                    <span key={i} className="row" style={{ gap: 4 }}>
                      <a onClick={() => { doc.path = c.path; setSel(new Set()); force((x) => x + 1); }} style={{ color: i === arr.length - 1 ? "var(--text)" : undefined, fontWeight: i === arr.length - 1 ? 600 : 400 }}>{c.name}</a>
                      {i < arr.length - 1 && <Icon name="chevronRight" size={11} style={{ color: "var(--faint)" }} />}
                    </span>
                  ))}
                  <span className="right muted tiny">{t("{n} items", { n: visible.length })}</span>
                </div>
                {visible.length === 0 ? (
                  <Empty icon="folder" title={t("Empty folder")}>{t("Drag files or folders here from your computer.")}</Empty>
                ) : (
                  <div style={{ maxHeight: "calc(100vh - 330px)", overflow: "auto" }}>
                    <table className="tbl">
                      <thead><tr><th style={{ width: "42%" }}>{t("Name")}</th><th>{t("Kind")}</th><th style={{ textAlign: "right" }}>{t("Size")}</th><th>{t("Type/Creator")}</th><th>{t("Modified")}</th></tr></thead>
                      <tbody>
                        {visible.map((n) => (
                          <tr key={n.id + n.name} className={sel.has(n) ? "sel" : ""}
                            onClick={(e) => {
                              const next = new Set(e.metaKey || e.ctrlKey ? sel : []);
                              if (e.shiftKey && lastClick.current) {
                                const a = visible.indexOf(lastClick.current), b = visible.indexOf(n);
                                visible.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => next.add(x));
                              } else if (next.has(n) && (e.metaKey || e.ctrlKey)) next.delete(n);
                              else next.add(n);
                              lastClick.current = n;
                              setSel(next);
                            }}
                            onDoubleClick={() => { if (n.kind === "folder") { doc.path = [...doc.path, n.id]; setSel(new Set()); force((x) => x + 1); } else setInfo(n); }}
                            style={{ opacity: isInvisible(n) ? 0.5 : 1 }}>
                            <td><span className="row" style={{ gap: 8 }}><PixelIcon name={iconOf(n)} size={16} />{n.name}{n.kind === "folder" && n.id === stats.blessed && <PixelIcon name="happyMac" size={11} />}{n.kind === "file" && n.locked && <span className="pixel-tag">{t("locked")}</span>}</span></td>
                            <td className="muted">{kindOf(n)}</td>
                            <td className="mono" style={{ textAlign: "right" }}>{n.kind === "folder" ? t("{n} items", { n: n.children.length }) : fmtBytes(sizeOf(n))}</td>
                            <td className="mono muted">{n.kind === "file" ? `${n.type} / ${n.creator}` : "—"}</td>
                            <td className="muted small">{macToDate(n.modified).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {oneFile && <div className="small muted" style={{ padding: "8px 14px", borderTop: "1px solid var(--line)" }}>{t("Data {data} · Resources {rsrc}", { data: fmtBytes((selArr[0] as MacFile).data.length), rsrc: fmtBytes((selArr[0] as MacFile).rsrc.length) })}</div>}
              </div>
            </div>
          )}
        </>
      )}

      {newOpen && <NewDiskModal onClose={() => setNewOpen(false)} onCreate={(img) => { openDoc(img); setNewOpen(false); }} />}
      {info && folder && <InfoModal node={info} folder={folder} onClose={() => setInfo(null)} onChange={touch} />}
      {progress && (
        <Modal title={t("Sending to the Mac…")} desc={progress.label} onClose={() => {}}>
          <div className="progress"><div style={{ width: `${progress.v * 100}%` }} /></div>
          <div className="small muted" style={{ marginTop: 8 }}>{Math.round(progress.v * 100)}% · {t("over serial at ~5 KB/s at 57600 bps")}</div>
        </Modal>
      )}
    </div>
  );
}

const confirmClose = () => window.confirm(t("This disk has unsaved changes. Close it anyway?"));

function FolderTree({ root, path, onOpen }: { root: MacFolder; path: number[]; onOpen: (p: number[]) => void }) {
  const render = (f: MacFolder, p: number[], depth: number): React.ReactNode => {
    const isOpen = p.every((id, i) => path[i] === id);
    const current = p.length === path.length && isOpen;
    const subs = f.children.filter((c): c is MacFolder => c.kind === "folder");
    return (
      <div key={p.join("/") || "root"}>
        <button className={`nav-item ${current ? "active" : ""}`} style={{ paddingLeft: 8 + depth * 14, fontSize: 12.5 }} onClick={() => onOpen(p)}>
          <span className="nav-icon"><PixelIcon name={depth === 0 ? "disk" : "folder"} size={14} /></span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
        </button>
        {(isOpen || depth === 0) && subs.map((s) => render(s, [...p, s.id], depth + 1))}
      </div>
    );
  };
  return <>{render(root, [], 0)}</>;
}

function NewDiskModal({ onClose, onCreate }: { onClose: () => void; onCreate: (img: OpenedImage) => void }) {
  const { toast } = useApp();
  const [name, setName] = useState(() => t("New Disk"));
  const [preset, setPreset] = useState<string>("1440k");
  const p = DISK_PRESETS.find((x) => x.id === preset)!;
  return (
    <Modal title={t("New disk")} desc={t("Creates an empty HFS volume.")} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t("Cancel")}</button><button className="btn primary" onClick={() => { try { onCreate(createImage(name, p.bytes, p.dc42)); } catch (e) { toast((e as Error).message, "err"); } }}>{t("Create")}</button></>}>
      <div className="col" style={{ gap: 14 }}>
        <Field label={t("Volume name")}><input className="input" value={name} maxLength={27} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <div className="col" style={{ gap: 6 }}>
          {DISK_PRESETS.filter((x) => x.id !== "400k").map((x) => (
            <button key={x.id} className={`choice ${preset === x.id ? "on" : ""}`} style={{ padding: "8px 12px" }} onClick={() => setPreset(x.id)}>
              <PixelIcon name={x.dc42 ? "floppy" : "disk"} size={20} />
              <div style={{ flex: 1 }}><div className="t">{t(x.label)}</div><div className="d">{x.dc42 ? t("DiskCopy 4.2 (.image), for FloppyEmu and emulators") : t("Raw image (.dsk), for BlueSCSI / Basilisk II")}</div></div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function InfoModal({ node, folder, onClose, onChange }: { node: MacNode; folder: MacFolder; onClose: () => void; onChange: () => void }) {
  const [name, setName] = useState(node.name);
  const [type, setType] = useState(node.kind === "file" ? node.type : "");
  const [creator, setCreator] = useState(node.kind === "file" ? node.creator : "");
  const [locked, setLocked] = useState(node.kind === "file" && node.locked);
  const apply = () => {
    if (name !== node.name) renameNode(folder, node, name);
    if (node.kind === "file") {
      node.type = (type + "    ").slice(0, 4);
      node.creator = (creator + "    ").slice(0, 4);
      node.locked = locked;
    }
    onChange();
    onClose();
  };
  return (
    <Modal title={t("“{name}” Info", { name: node.name })} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t("Cancel")}</button><button className="btn primary" onClick={apply}>{t("Save")}</button></>}>
      <div className="col" style={{ gap: 14 }}>
        <div className="row"><PixelIcon name={iconOf(node)} size={40} /><div><div className="strong">{kindOf(node)}</div><div className="small muted">{fmtBytes(sizeOf(node))} · {t("created {date}", { date: macToDate(node.created).toLocaleString() })}</div></div></div>
        <Field label={t("Name")} hint={t("Up to 31 characters, no “:”")}><input className="input" value={name} maxLength={31} onChange={(e) => setName(e.target.value)} /></Field>
        {node.kind === "file" && (
          <>
            <div className="grid g2">
              <Field label={t("Type")}><input className="input mono" value={type} maxLength={4} onChange={(e) => setType(e.target.value)} /></Field>
              <Field label={t("Creator")}><input className="input mono" value={creator} maxLength={4} onChange={(e) => setCreator(e.target.value)} /></Field>
            </div>
            <label className="row small strong"><Toggle on={locked} onChange={setLocked} /> {t("Locked")}</label>
            <div className="small muted">{t("Data fork: {data} · Resource fork: {rsrc}", { data: fmtBytes(node.data.length), rsrc: fmtBytes(node.rsrc.length) })}</div>
          </>
        )}
      </div>
    </Modal>
  );
}
