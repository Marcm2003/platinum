# Reference HFS tool using machfs, for cross-validation of src/lib/hfs.
#   python tests/hfs_ref.py make <out.img> <size_bytes> <nfiles>
#   python tests/hfs_ref.py dump <img>     -> JSON listing on stdout
import sys, json, hashlib
from machfs import Volume, Folder, File

def make(out, size, nfiles):
    v = Volume()
    v.name = 'Ref Disk'
    sysf = Folder(); v['System Folder'] = sysf
    f = File(); f.type = b'zsys'; f.creator = b'MACS'; f.data = b''; f.rsrc = bytes(range(256)) * 40
    sysf['System'] = f
    games = Folder(); v['Jocs'] = games
    for i in range(nfiles):
        g = File(); g.type = b'APPL'; g.creator = b'G%03d' % (i % 1000)
        g.data = (b'data-%d-' % i) * (i % 50 + 1)
        g.rsrc = (b'rsrc-%d-' % i) * (i % 7)
        games['Joc %04d' % i] = g
    t = File(); t.type = b'TEXT'; t.creator = b'ttxt'; t.data = 'Café à la crème\r'.encode('mac_roman')
    v['Llegeix-me àé'] = t
    open(out, 'wb').write(v.write(size))

def dump(path):
    v = Volume(); v.read(open(path, 'rb').read())
    out = {}
    def walk(folder, prefix):
        for name, obj in folder.items():
            key = ':'.join(prefix + [name])
            if isinstance(obj, Folder):
                out[key + ':'] = 'dir'
                walk(obj, prefix + [name])
            else:
                out[key] = [obj.type.decode('mac_roman'), obj.creator.decode('mac_roman'),
                            hashlib.sha1(obj.data).hexdigest(), hashlib.sha1(obj.rsrc).hexdigest()]
    walk(v, [])
    print(json.dumps({'name': v.name, 'items': out}, ensure_ascii=False))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if sys.argv[1] == 'make': make(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
    else: dump(sys.argv[2])
