"""Gera os paineis ripados da LuxusWand em 3D, um arquivo por formato e acabamento, sem bibliotecas externas.

- public/models/panel-<formato>-<acabamento>.glb: a vista 3D da pagina e o "Im Raum ansehen" do Android (Scene Viewer).
- public/models/panel-<formato>-<acabamento>.usdz: o "Im Raum ansehen" do iPhone e do iPad (AR Quick Look).

Medidas tiradas de src/data/catalogue.ts: 600 mm de largura, 21 mm de espessura,
ripas de 27 mm com 13 mm de espaco, 2700 mm de altura. As cores (slat e felt) de cada
acabamento sao lidas de src/data/catalogue.ts e vao "assadas" na textura de cada arquivo,
porque o Scene Viewer e o Quick Look abrem o arquivo sozinhos, sem a pagina.
Rodar: python3 scripts/3d/generate-panels.py (precisa do macOS: sips, usdcat, usdzip e usdchecker).
Mudou medida, cor ou acabamento? Rodar de novo.
"""
import json, math, os, random, re, shutil, struct, subprocess, sys, tempfile, zlib

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "models")
os.makedirs(OUT, exist_ok=True)

W = 0.600          # largura do painel (m)
FELT = 0.009       # espessura do feltro
DEPTH = 0.021      # espessura total
SLAT = 0.027       # largura da ripa
GAP = 0.013        # espaco entre ripas
FORMATS = {"classic": 2.700}  # mesmos ids e alturas de formats em src/data/catalogue.ts
N_SLATS = 15

CATALOGUE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "data", "catalogue.ts")
FINISHES = re.findall(r'id: "([\w-]+)", name: "[^"]+", slat: "(#[0-9a-fA-F]{6})", felt: "(#[0-9a-fA-F]{6})"', open(CATALOGUE).read())
if not FINISHES:
    sys.exit("Nenhum acabamento encontrado em src/data/catalogue.ts (o formato das linhas mudou?)")

# Brilho medio da textura de madeira: a cor da ripa e dividida por ele, para a madeira
# pintada ficar perto da cor da amostra (o mesmo calculo que a pagina fazia no navegador).
TEXTURE_LEVEL = 0.62

def to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def to_srgb(c):
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

def linear(hex_color):
    return [to_linear(int(hex_color[i:i + 2], 16) / 255) for i in (1, 3, 5)]

# ---------- textura de madeira ----------
TW, TH = 256, 1024
random.seed(7)

def wood_texture():
    # frequencias inteiras: a textura se repete na vertical sem emenda visivel
    waves = [(random.uniform(0.004, 0.016), random.uniform(0, 6.28), random.randint(1, 4)) for _ in range(4)]
    rings = [(random.randint(6, 14), random.uniform(0, 6.28), random.uniform(0.5, 1.0)) for _ in range(3)]
    knots = [(random.uniform(40, TW - 40), random.uniform(0, TH), random.uniform(4, 7))]
    # veios finos: ruido por coluna, suavizado
    raw_noise = [random.uniform(-1, 1) for _ in range(TW)]
    col_noise = [(raw_noise[i - 1] + 2 * raw_noise[i] + raw_noise[(i + 1) % TW]) / 4 for i in range(TW)]
    rows = []
    for y in range(TH):
        row = bytearray([0])
        fy = y / TH
        wobble = sum(a * TW * math.sin(fy * 6.283 * f + p) for a, p, f in waves)
        for x in range(TW):
            xx = x + wobble
            for kx, ky, kr in knots:
                d = math.hypot(x - kx, (y - ky) * 0.35)
                if d < kr * 4:
                    xx += (kr * 4 - d) * 0.6 * (1 if x > kx else -1)
            g = 0.0
            for f, p, a in rings:
                g += a * math.sin(xx / TW * 6.283 * f + p)
            g = g / 2.2
            fine = col_noise[int(xx) % TW] + random.uniform(-0.3, 0.3)
            v = 0.84 + 0.06 * g + 0.07 * fine
            if g > 0.45:
                v -= 0.10 * (g - 0.45) * 2.5
            c = max(0, min(255, int(v * 255)))
            row += bytes((c, max(0, c - 6), max(0, c - 14)))
        rows.append(bytes(row))
    return rows

def tint(rows, hex_color):
    """Multiplica a textura cinza pela cor da ripa (em luz linear, como o material 3D faria)."""
    factor = [min(1.0, v / TEXTURE_LEVEL) for v in linear(hex_color)]
    luts = [bytes(max(0, min(255, round(to_srgb(to_linear(i / 255) * f) * 255))) for i in range(256)) for f in factor]
    out = []
    for row in rows:
        r = bytearray(row)
        r[1::3] = r[1::3].translate(luts[0])
        r[2::3] = r[2::3].translate(luts[1])
        r[3::3] = r[3::3].translate(luts[2])
        out.append(bytes(r))
    return out

def jpeg(rows):
    raw = b"".join(rows)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", TW, TH, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with tempfile.TemporaryDirectory() as tmp:
        p = os.path.join(tmp, "madeira.png")
        j = os.path.join(tmp, "madeira.jpg")
        open(p, "wb").write(png)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", p, "--out", j], check=True, capture_output=True)
        return open(j, "rb").read()

# ---------- geometria ----------
def box(x0, x1, y0, y1, z0, z1, uvfn, faces):
    """Caixa com normais planas. faces: quais lados gerar."""
    P, N, U, I = [], [], [], []
    quads = {
        "front": ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
        "left": ([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], (-1, 0, 0)),
        "right": ([(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)], (1, 0, 0)),
        "top": ([(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], (0, 1, 0)),
        "bottom": ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
        "back": ([(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)], (0, 0, -1)),
    }
    for name in faces:
        pts, n = quads[name]
        base = len(P)
        for p in pts:
            P.append(p); N.append(n); U.append(uvfn(p, name))
        I += [base, base + 1, base + 2, base, base + 2, base + 3]
    return P, N, U, I

def merge(parts):
    P, N, U, I = [], [], [], []
    for p, n, u, i in parts:
        off = len(P)
        P += p; N += n; U += u; I += [k + off for k in i]
    return P, N, U, I

def panel(h):
    pitch = SLAT + GAP
    slats = []
    for k in range(N_SLATS):
        cx = (k - (N_SLATS - 1) / 2) * pitch
        x0, x1 = cx - SLAT / 2, cx + SLAT / 2
        uoff = random.uniform(0, 1)
        voff = random.uniform(0, 1)
        def uv(p, face, x0=x0, uoff=uoff, voff=voff):
            x, y, z = p
            if face in ("left", "right"):
                u = uoff + (z - FELT) / 0.15
            else:
                u = uoff + (x - x0) / 0.15
            return (u, voff + y / 1.25)
        slats.append(box(x0, x1, 0, h, FELT, DEPTH, uv, ["front", "left", "right", "top", "bottom"]))
    felt = box(-W / 2, W / 2, 0, h, 0, FELT, lambda p, f: (0, 0), ["front", "left", "right", "top", "bottom", "back"])
    return merge(slats), felt

# ---------- GLB ----------
def pad4(b, fill=b"\x00"):
    return b + fill * ((4 - len(b) % 4) % 4)

def write_glb(path, name, prims, image, felt):
    buf = bytearray(); views = []; accs = []; gl_prims = []
    def add_view(data, target=None):
        nonlocal buf
        off = len(buf); buf += pad4(data)
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target: v["target"] = target
        views.append(v); return len(views) - 1
    for (P, N, U, I), mat in prims:
        pos = b"".join(struct.pack("<3f", *p) for p in P)
        nor = b"".join(struct.pack("<3f", *n) for n in N)
        uvs = b"".join(struct.pack("<2f", *u) for u in U)
        idx = b"".join(struct.pack("<H", i) for i in I)
        mins = [min(p[k] for p in P) for k in range(3)]; maxs = [max(p[k] for p in P) for k in range(3)]
        a = len(accs)
        accs += [
            {"bufferView": add_view(pos, 34962), "componentType": 5126, "count": len(P), "type": "VEC3", "min": mins, "max": maxs},
            {"bufferView": add_view(nor, 34962), "componentType": 5126, "count": len(N), "type": "VEC3"},
            {"bufferView": add_view(uvs, 34962), "componentType": 5126, "count": len(U), "type": "VEC2"},
            {"bufferView": add_view(idx, 34963), "componentType": 5123, "count": len(I), "type": "SCALAR"},
        ]
        gl_prims.append({"attributes": {"POSITION": a, "NORMAL": a + 1, "TEXCOORD_0": a + 2}, "indices": a + 3, "material": mat})
    img_view = add_view(image)
    gltf = {
        "asset": {"version": "2.0", "generator": "LuxusWand Paneel-Generator"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"name": name, "mesh": 0}],
        "meshes": [{"name": name, "primitives": gl_prims}],
        "materials": [
            {"name": "Holz", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.0, "roughnessFactor": 0.58}},
            {"name": "Filz", "pbrMetallicRoughness": {"baseColorFactor": [*felt, 1], "metallicFactor": 0.0, "roughnessFactor": 1.0}},
        ],
        "textures": [{"sampler": 0, "source": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "images": [{"name": "holz_maserung", "mimeType": "image/jpeg", "bufferView": img_view}],
        "accessors": accs, "bufferViews": views, "buffers": [{"byteLength": len(buf)}],
    }
    js = pad4(json.dumps(gltf, separators=(",", ":")).encode(), b" ")
    total = 12 + 8 + len(js) + 8 + len(buf)
    out = struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(buf), b"BIN\x00") + bytes(buf)
    open(path, "wb").write(out)
    return total

# ---------- USDZ (AR Quick Look) ----------
def usd_list(values, fmt):
    return "[" + ", ".join(fmt(v) for v in values) + "]"

def usd_mesh(name, part, material):
    P, N, U, I = part
    f = lambda v: "%.5g" % v
    return f"""
        def Mesh "{name}" (
            prepend apiSchemas = ["MaterialBindingAPI"]
        )
        {{
            uniform bool doubleSided = 0
            int[] faceVertexCounts = {usd_list([3] * (len(I) // 3), str)}
            int[] faceVertexIndices = {usd_list(I, str)}
            rel material:binding = </Paneel/Materialien/{material}>
            point3f[] points = {usd_list(P, lambda p: "(" + ", ".join(map(f, p)) + ")")}
            normal3f[] normals = {usd_list(N, lambda n: "(" + ", ".join(map(f, n)) + ")")} (
                interpolation = "vertex"
            )
            texCoord2f[] primvars:st = {usd_list(U, lambda u: "(" + f(u[0]) + ", " + f(1 - u[1]) + ")")} (
                interpolation = "vertex"
            )
            uniform token subdivisionScheme = "none"
        }}"""

def write_usdz(path, slats, felt_part, image, felt):
    """Mesmo painel em USD, em pe com a base em y = 0 e a frente para +z, em metros."""
    h = max(p[1] for p in felt_part[0])
    usda = f"""#usda 1.0
(
    defaultPrim = "Paneel"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Paneel" (
    assetInfo = {{
        string name = "Paneel"
    }}
    kind = "component"
)
{{
    def Scope "Materialien"
    {{
        def Material "Holz"
        {{
            token outputs:surface.connect = </Paneel/Materialien/Holz/Oberflaeche.outputs:surface>

            def Shader "Oberflaeche"
            {{
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor.connect = </Paneel/Materialien/Holz/Maserung.outputs:rgb>
                float inputs:metallic = 0
                float inputs:roughness = 0.58
                token outputs:surface
            }}

            def Shader "Koordinaten"
            {{
                uniform token info:id = "UsdPrimvarReader_float2"
                string inputs:varname = "st"
                float2 outputs:result
            }}

            def Shader "Maserung"
            {{
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @holz.jpg@
                token inputs:sourceColorSpace = "sRGB"
                float2 inputs:st.connect = </Paneel/Materialien/Holz/Koordinaten.outputs:result>
                token inputs:wrapS = "repeat"
                token inputs:wrapT = "repeat"
                float3 outputs:rgb
            }}
        }}

        def Material "Filz"
        {{
            token outputs:surface.connect = </Paneel/Materialien/Filz/Oberflaeche.outputs:surface>

            def Shader "Oberflaeche"
            {{
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = ({", ".join("%.5f" % v for v in felt)})
                float inputs:metallic = 0
                float inputs:roughness = 1
                token outputs:surface
            }}
        }}
    }}

    def Xform "Geometrie"
    {{{usd_mesh("Lamellen", slats, "Holz")}
{usd_mesh("Filz", felt_part, "Filz")}
    }}
}}
"""
    with tempfile.TemporaryDirectory() as tmp:
        open(os.path.join(tmp, "paneel.usda"), "w").write(usda)
        open(os.path.join(tmp, "holz.jpg"), "wb").write(image)
        subprocess.run(["usdcat", "paneel.usda", "-o", "paneel.usdc"], cwd=tmp, check=True, capture_output=True)
        if os.path.exists(path):
            os.remove(path)
        subprocess.run(["usdzip", os.path.abspath(path), "paneel.usdc", "holz.jpg"], cwd=tmp, check=True, capture_output=True)
    check = subprocess.run(["usdchecker", "--arkit", path], capture_output=True, text=True)
    if check.returncode != 0:
        sys.exit(f"{path} nao passou no usdchecker --arkit:\n{check.stdout}{check.stderr}")
    return os.path.getsize(path), h

# ---------- saida ----------
grain = wood_texture()
for old in os.listdir(OUT):
    if old.startswith("panel-") and old.endswith((".glb", ".usdz")):
        os.remove(os.path.join(OUT, old))
for fid, h in FORMATS.items():
    slats, felt_part = panel(h)
    for finish_id, slat_color, felt_color in FINISHES:
        image = jpeg(tint(grain, slat_color))
        felt = linear(felt_color)
        base = os.path.join(OUT, f"panel-{fid}-{finish_id}")
        glb = write_glb(base + ".glb", f"Lamellen-Wandpaneel {fid} {finish_id}", [(slats, 0), (felt_part, 1)], image, felt)
        usdz, _ = write_usdz(base + ".usdz", slats, felt_part, image, felt)
        print(f"{fid} {finish_id}: {h} m, glb {glb // 1024} KB, usdz {usdz // 1024} KB")
