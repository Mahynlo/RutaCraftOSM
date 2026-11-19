// Formato binario RCO2 del motor (little-endian). Lo lee RutaCraftOSM_c/include/grafo.hpp.
//
//     encabezado (32 bytes)
//         char[4]  "RCO2"
//         uint32   versión (2)
//         uint32   flags            bit 0: respeta los sentidos de las calles
//         uint32   N                nodos
//         uint32   E                aristas
//         uint32   K                nombres de calle (el id 0 es "" = calle sin nombre)
//         uint32   B                bytes de la tabla de nombres
//         uint32   reservado (0)
//     int64    osm_ids[N]
//     float64  coords[2N]           lat, lon intercalados
//     uint32   inicio_aristas[N+1]  aristas del nodo u: [inicio_aristas[u], inicio_aristas[u+1])
//     uint32   destino[E]
//     float32  peso[E]              metros
//     uint32   nombre_id[E]
//     uint32   inicio_nombres[K+1]
//     uint8    nombres[B]           UTF-8 concatenado
import { indicesHilbert } from "./geometria.js";
const MAGIC = 844055378; // "RCO2" leído como uint32 little-endian
const VERSION = 2;
const FLAG_DIRIGIDO = 1;
const ENCABEZADO = 32;
export function numNodos(g) {
    return g.osmIds.length;
}
export function numAristas(g) {
    return g.destino.length;
}
/** Serializa el grafo en formato RCO2. */
export function escribirRCO2(g) {
    const n = numNodos(g);
    const e = numAristas(g);
    const codificador = new TextEncoder();
    const nombresBytes = g.nombres.map((s) => codificador.encode(s));
    const bytesNombres = nombresBytes.reduce((t, b) => t + b.length, 0);
    const k = g.nombres.length;
    const total = ENCABEZADO + n * 8 + n * 16 + (n + 1) * 4 + e * 12 + (k + 1) * 4 + bytesNombres;
    const salida = new Uint8Array(total);
    const vista = new DataView(salida.buffer);
    let o = 0;
    const u32 = (v) => { vista.setUint32(o, v, true); o += 4; };
    u32(MAGIC);
    u32(VERSION);
    u32(g.dirigido ? FLAG_DIRIGIDO : 0);
    u32(n);
    u32(e);
    u32(k);
    u32(bytesNombres);
    u32(0);
    for (let i = 0; i < n; i++) {
        vista.setBigInt64(o, BigInt(g.osmIds[i]), true);
        o += 8;
    }
    for (let i = 0; i < 2 * n; i++) {
        vista.setFloat64(o, g.coords[i], true);
        o += 8;
    }
    for (let i = 0; i <= n; i++)
        u32(g.inicio[i]);
    for (let i = 0; i < e; i++)
        u32(g.destino[i]);
    for (let i = 0; i < e; i++) {
        vista.setFloat32(o, g.peso[i], true);
        o += 4;
    }
    for (let i = 0; i < e; i++)
        u32(g.nombreId[i]);
    let acumulado = 0;
    u32(0);
    for (const b of nombresBytes) {
        acumulado += b.length;
        u32(acumulado);
    }
    for (const b of nombresBytes) {
        salida.set(b, o);
        o += b.length;
    }
    return salida;
}
/** Lee un grafo RCO2 y valida su estructura (lanza un Error si el archivo no es válido). */
export function leerRCO2(datos) {
    const invalido = (motivo) => new Error(`El grafo no es un archivo RCO2 válido: ${motivo}`);
    if (datos.length < ENCABEZADO)
        throw invalido("archivo demasiado corto");
    const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
    let o = 0;
    const u32 = () => { const v = vista.getUint32(o, true); o += 4; return v; };
    if (u32() !== MAGIC)
        throw invalido("encabezado distinto de RCO2");
    if (u32() !== VERSION)
        throw invalido("versión no soportada");
    const flags = u32(), n = u32(), e = u32(), k = u32(), bytesNombres = u32();
    u32();
    const esperado = ENCABEZADO + n * 8 + n * 16 + (n + 1) * 4 + e * 12 + (k + 1) * 4 + bytesNombres;
    if (datos.length !== esperado || k === 0)
        throw invalido("tamaño inconsistente con el encabezado");
    const osmIds = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        osmIds[i] = Number(vista.getBigInt64(o, true));
        o += 8;
    }
    const coords = new Float64Array(2 * n);
    for (let i = 0; i < 2 * n; i++) {
        coords[i] = vista.getFloat64(o, true);
        o += 8;
    }
    const inicio = new Uint32Array(n + 1);
    for (let i = 0; i <= n; i++)
        inicio[i] = u32();
    const destino = new Uint32Array(e);
    for (let i = 0; i < e; i++)
        destino[i] = u32();
    const peso = new Float32Array(e);
    for (let i = 0; i < e; i++) {
        peso[i] = vista.getFloat32(o, true);
        o += 4;
    }
    const nombreId = new Uint32Array(e);
    for (let i = 0; i < e; i++)
        nombreId[i] = u32();
    const inicioNombres = new Uint32Array(k + 1);
    for (let i = 0; i <= k; i++)
        inicioNombres[i] = u32();
    if (inicio[0] !== 0 || inicio[n] !== e)
        throw invalido("índice de aristas inconsistente");
    for (let i = 1; i <= n; i++)
        if (inicio[i] < inicio[i - 1])
            throw invalido("índice de aristas no creciente");
    for (let i = 0; i < e; i++) {
        if (destino[i] >= n || nombreId[i] >= k)
            throw invalido("arista con índice fuera de rango");
    }
    if (inicioNombres[0] !== 0 || inicioNombres[k] !== bytesNombres)
        throw invalido("tabla de nombres inconsistente");
    const decodificador = new TextDecoder("utf-8");
    const nombres = [];
    for (let i = 0; i < k; i++) {
        if (inicioNombres[i + 1] < inicioNombres[i])
            throw invalido("tabla de nombres no creciente");
        nombres.push(decodificador.decode(datos.subarray(o + inicioNombres[i], o + inicioNombres[i + 1])));
    }
    return { osmIds, coords, inicio, destino, peso, nombreId, nombres, dirigido: (flags & FLAG_DIRIGIDO) !== 0 };
}
/**
 * Reordena los nodos siguiendo la curva de Hilbert (los cercanos en el mapa quedan cercanos en
 * memoria). Solo se renumeran los nodos: las distancias de las rutas no cambian (entre dos caminos
 * de exactamente el mismo largo, el motor podría elegir el otro).
 */
export function reordenarGrafo(g) {
    const n = numNodos(g);
    const lats = new Float64Array(n);
    const lons = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        lats[i] = g.coords[2 * i];
        lons[i] = g.coords[2 * i + 1];
    }
    const clave = indicesHilbert(lats, lons);
    // Desempate por OSM ID para que el resultado no dependa del orden de entrada
    const orden = Array.from({ length: n }, (_, i) => i).sort((a, b) => clave[a] - clave[b] || g.osmIds[a] - g.osmIds[b]);
    const nuevoIndice = new Uint32Array(n);
    orden.forEach((viejo, nuevo) => { nuevoIndice[viejo] = nuevo; });
    const r = {
        osmIds: new Float64Array(n),
        coords: new Float64Array(2 * n),
        inicio: new Uint32Array(n + 1),
        destino: new Uint32Array(g.destino.length),
        peso: new Float32Array(g.peso.length),
        nombreId: new Uint32Array(g.nombreId.length),
        nombres: g.nombres.slice(),
        dirigido: g.dirigido,
    };
    let e = 0;
    orden.forEach((viejo, nuevo) => {
        r.osmIds[nuevo] = g.osmIds[viejo];
        r.coords[2 * nuevo] = g.coords[2 * viejo];
        r.coords[2 * nuevo + 1] = g.coords[2 * viejo + 1];
        for (let a = g.inicio[viejo]; a < g.inicio[viejo + 1]; a++) {
            r.destino[e] = nuevoIndice[g.destino[a]];
            r.peso[e] = g.peso[a];
            r.nombreId[e] = g.nombreId[a];
            e++;
        }
        r.inicio[nuevo + 1] = e;
    });
    return r;
}
/** Resumen legible de un grafo (lo usa `ruta-craft-osm info`). */
export function describirGrafo(g) {
    const n = numNodos(g);
    let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
    for (let i = 0; i < n; i++) {
        latMin = Math.min(latMin, g.coords[2 * i]);
        latMax = Math.max(latMax, g.coords[2 * i]);
        lonMin = Math.min(lonMin, g.coords[2 * i + 1]);
        lonMax = Math.max(lonMax, g.coords[2 * i + 1]);
    }
    // Largo de la red: una calle de doble sentido son dos aristas (u -> v y v -> u) y cuenta una vez
    const aristas = new Set();
    for (let u = 0; u < n; u++)
        for (let e = g.inicio[u]; e < g.inicio[u + 1]; e++)
            aristas.add(`${u}:${g.destino[e]}`);
    let km = 0;
    for (let u = 0; u < n; u++) {
        for (let e = g.inicio[u]; e < g.inicio[u + 1]; e++) {
            const v = g.destino[e];
            if (u < v || !aristas.has(`${v}:${u}`))
                km += g.peso[e];
        }
    }
    km /= 1000;
    const formato = (x) => x.toLocaleString("es-MX");
    return [
        `RCO2 · ${formato(n)} nodos · ${formato(numAristas(g))} aristas · ${formato(g.nombres.length - 1)} nombres de calle`,
        `${g.dirigido ? "Respeta" : "Ignora"} los sentidos de las calles · ~${formato(Math.round(km))} km de calles`,
        `Zona: lat ${latMin.toFixed(5)} a ${latMax.toFixed(5)}, lon ${lonMin.toFixed(5)} a ${lonMax.toFixed(5)}`,
    ].join("\n");
}
