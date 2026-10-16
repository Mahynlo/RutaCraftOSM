"""
Lectura y escritura de los formatos binarios de grafo del motor C++.

RCO1 (histórico): nodos y, por cada nodo, sus aristas con el nombre de calle y el tipo de vía
repetidos en cada arista. El exportador agregaba cada arista también en sentido contrario.

RCO2 (actual), little-endian:

    encabezado (32 bytes)
        char[4]  "RCO2"
        uint32   versión (2)
        uint32   flags            bit 0: respeta los sentidos de las calles
        uint32   N                nodos
        uint32   E                aristas
        uint32   K                nombres de calle (el id 0 es "" = calle sin nombre)
        uint32   B                bytes de la tabla de nombres
        uint32   reservado (0)
    int64    osm_ids[N]
    float64  coords[2N]           lat, lon intercalados
    uint32   inicio_aristas[N+1]  aristas del nodo u: [inicio_aristas[u], inicio_aristas[u+1])
    uint32   destino[E]
    float32  peso[E]              metros
    uint32   nombre_id[E]
    uint32   inicio_nombres[K+1]
    uint8    nombres[B]           UTF-8 concatenado

Uso:
    python formato_rco.py info grafo.bin
    python formato_rco.py convertir entrada.bin salida.bin [--dirigido]
"""
import struct
import sys

MAGIC_RCO1 = b"RCO1"
MAGIC_RCO2 = b"RCO2"
VERSION_RCO2 = 2
FLAG_DIRIGIDO = 1
ENCABEZADO_RCO2 = struct.Struct("<4s7I")


class Grafo:
    """osm_ids[i], coords[i] = (lat, lon) y adyacencia[i] = [(destino, peso, nombre), ...]."""

    def __init__(self, osm_ids, coords, adyacencia, dirigido=False, formato=None):
        self.osm_ids = osm_ids
        self.coords = coords
        self.adyacencia = adyacencia
        self.dirigido = dirigido
        self.formato = formato

    @property
    def num_aristas(self):
        return sum(len(a) for a in self.adyacencia)


def leer(ruta):
    with open(ruta, "rb") as f:
        datos = f.read()
    magic = datos[:4]
    if magic == MAGIC_RCO2:
        return _leer_rco2(datos)
    if magic == MAGIC_RCO1:
        return _leer_rco1(datos)
    raise ValueError(f"{ruta}: formato desconocido ({magic!r})")


def _leer_rco1(d):
    o = 4
    n, = struct.unpack_from("<I", d, o)
    o += 4
    osm_ids, coords = [], []
    for _ in range(n):
        osm_id, lat, lon = struct.unpack_from("<qdd", d, o)
        o += 24
        osm_ids.append(osm_id)
        coords.append((lat, lon))
    adyacencia = []
    for _ in range(n):
        k, = struct.unpack_from("<I", d, o)
        o += 4
        aristas = []
        for _ in range(k):
            v, w = struct.unpack_from("<If", d, o)
            o += 8
            largo, = struct.unpack_from("<H", d, o)
            o += 2
            nombre = d[o:o + largo].decode("utf-8")
            o += largo
            largo, = struct.unpack_from("<H", d, o)
            o += 2 + largo  # tipo de vía: el motor no lo usa
            aristas.append((v, w, nombre))
        adyacencia.append(aristas)
    return Grafo(osm_ids, coords, adyacencia, dirigido=False, formato="RCO1")


def _leer_rco2(d):
    _, version, flags, n, e, k, b, _ = ENCABEZADO_RCO2.unpack_from(d, 0)
    if version != VERSION_RCO2:
        raise ValueError(f"versión RCO2 no soportada: {version}")
    o = ENCABEZADO_RCO2.size

    def arreglo(fmt, cantidad):
        nonlocal o
        valores = struct.unpack_from(f"<{cantidad}{fmt}", d, o)
        o += struct.calcsize(f"<{cantidad}{fmt}")
        return valores

    osm_ids = list(arreglo("q", n))
    planas = arreglo("d", 2 * n)
    coords = list(zip(planas[0::2], planas[1::2]))
    inicio = arreglo("I", n + 1)
    destino = arreglo("I", e)
    peso = arreglo("f", e)
    nombre_id = arreglo("I", e)
    inicio_nombres = arreglo("I", k + 1)
    tabla = d[o:o + b]
    nombres = [tabla[inicio_nombres[i]:inicio_nombres[i + 1]].decode("utf-8") for i in range(k)]
    adyacencia = [[(destino[j], peso[j], nombres[nombre_id[j]]) for j in range(inicio[u], inicio[u + 1])]
                  for u in range(n)]
    return Grafo(osm_ids, coords, adyacencia, dirigido=bool(flags & FLAG_DIRIGIDO), formato="RCO2")


def deduplicar(adyacencia):
    """Una sola arista por par (u, v): peso mínimo y el nombre de la primera aparición.

    Conserva el orden de las aristas, así que el motor elige las mismas rutas y nombres de calle.
    """
    resultado = []
    for aristas in adyacencia:
        vistas = {}
        for v, w, nombre in aristas:
            if v in vistas:
                anterior = vistas[v]
                vistas[v] = (v, min(anterior[1], w), anterior[2])
            else:
                vistas[v] = (v, w, nombre)
        resultado.append(list(vistas.values()))
    return resultado


def escribir_rco2(ruta, grafo):
    nombres = [""]
    id_nombre = {"": 0}
    destino, peso, nombre_ids, inicio = [], [], [], [0]
    for aristas in deduplicar(grafo.adyacencia):
        for v, w, nombre in aristas:
            nombre = "" if nombre in ("", "desconocida") else nombre
            if nombre not in id_nombre:
                id_nombre[nombre] = len(nombres)
                nombres.append(nombre)
            destino.append(v)
            peso.append(w)
            nombre_ids.append(id_nombre[nombre])
        inicio.append(len(destino))

    tabla = bytearray()
    inicio_nombres = [0]
    for nombre in nombres:
        tabla += nombre.encode("utf-8")
        inicio_nombres.append(len(tabla))

    n, e = len(grafo.osm_ids), len(destino)
    with open(ruta, "wb") as f:
        f.write(ENCABEZADO_RCO2.pack(MAGIC_RCO2, VERSION_RCO2, FLAG_DIRIGIDO if grafo.dirigido else 0,
                                     n, e, len(nombres), len(tabla), 0))
        f.write(struct.pack(f"<{n}q", *grafo.osm_ids))
        f.write(struct.pack(f"<{2 * n}d", *[x for c in grafo.coords for x in c]))
        f.write(struct.pack(f"<{n + 1}I", *inicio))
        f.write(struct.pack(f"<{e}I", *destino))
        f.write(struct.pack(f"<{e}f", *peso))
        f.write(struct.pack(f"<{e}I", *nombre_ids))
        f.write(struct.pack(f"<{len(inicio_nombres)}I", *inicio_nombres))
        f.write(bytes(tabla))


def escribir_rco1(ruta, grafo):
    """Formato histórico; se mantiene para probar la compatibilidad del motor."""
    with open(ruta, "wb") as f:
        f.write(MAGIC_RCO1)
        f.write(struct.pack("<I", len(grafo.osm_ids)))
        for osm_id, (lat, lon) in zip(grafo.osm_ids, grafo.coords):
            f.write(struct.pack("<qdd", osm_id, lat, lon))
        for aristas in grafo.adyacencia:
            f.write(struct.pack("<I", len(aristas)))
            for v, w, nombre in aristas:
                nombre_b = (nombre or "desconocida").encode("utf-8")
                f.write(struct.pack("<If", v, w))
                f.write(struct.pack("<H", len(nombre_b)) + nombre_b)
                f.write(struct.pack("<H", 4) + b"road")


def _main(argv):
    if len(argv) >= 2 and argv[0] == "info":
        g = leer(argv[1])
        print(f"{argv[1]}: {g.formato}, {len(g.osm_ids):,} nodos, {g.num_aristas:,} aristas, "
              f"{'respeta' if g.dirigido else 'ignora'} sentidos")
    elif len(argv) >= 3 and argv[0] == "convertir":
        g = leer(argv[1])
        if "--dirigido" in argv:
            g.dirigido = True
        escribir_rco2(argv[2], g)
        nuevo = leer(argv[2])
        print(f"{g.formato} -> RCO2: {g.num_aristas:,} -> {nuevo.num_aristas:,} aristas ({argv[2]})")
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
