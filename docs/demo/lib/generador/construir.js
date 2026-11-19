// Construcción del grafo vial a partir de los datos de Overpass. Replica lo que hacía el script de
// Python con OSMnx (graph_from_polygon, network_type="drive", simplify=False):
//   1. Cada par de nodos consecutivos de una vía es una arista, con su longitud de gran círculo.
//   2. Sentidos con las mismas reglas que OSMnx (oneway, oneway=-1, glorietas).
//   3. Solo los nodos dentro de la zona; se descartan las aristas que salen de ella.
//   4. Solo el componente conectado más grande (débilmente conectado, como OSMnx).
import { haversine, IndiceZona } from "./geometria.js";
import { reordenarGrafo } from "./rco2.js";
// Mismos valores que OSMnx (osmnx/_osm_xml + graph._is_path_one_way / _is_path_reversed)
const VALORES_SENTIDO_UNICO = new Set(["yes", "true", "1", "-1", "reverse", "T", "F"]);
const VALORES_SENTIDO_INVERSO = new Set(["-1", "reverse", "T"]);
// El filtro de Overpass (FILTRO_VIAS_AUTO) expresado como función, por si los datos vienen de otra
// fuente. Overpass evalúa "!~" como expresión regular sin anclar, igual que estas.
const EXCLUIR = [
    ["area", /yes/],
    ["highway", /abandoned|bridleway|bus_guideway|construction|corridor|cycleway|elevator|escalator|footway|no|path|pedestrian|planned|platform|proposed|raceway|razed|rest_area|service|services|steps|track/],
    ["motor_vehicle", /no/],
    ["motorcar", /no/],
    ["service", /alley|driveway|emergency_access|parking|parking_aisle|private/],
    ["access", /private/],
];
/** true si la vía pasa el filtro de vías para automóvil (FILTRO_VIAS_AUTO). */
export function esViaParaAuto(tags) {
    if (!tags || !tags.highway)
        return false;
    return EXCLUIR.every(([clave, patron]) => tags[clave] === undefined || !patron.test(tags[clave]));
}
/** Construye el grafo (ya reordenado para el motor) a partir de una respuesta de Overpass. */
export function construirGrafo(osm, opciones = {}) {
    const respetarSentido = opciones.respetarSentido ?? false;
    const usarRef = opciones.usarReferenciaComoNombre ?? true;
    const nodosOSM = new Map();
    const vias = [];
    for (const el of osm.elements) {
        if (el.type === "node")
            nodosOSM.set(el.id, el);
        else if (el.type === "way" && esViaParaAuto(el.tags))
            vias.push(el);
    }
    // Índice compacto de cada nodo usado por alguna vía, en orden de aparición
    const indice = new Map();
    const ids = [];
    const lats = [];
    const lons = [];
    const indiceDe = (id) => {
        let i = indice.get(id);
        if (i === undefined) {
            const nodo = nodosOSM.get(id);
            i = ids.length;
            indice.set(id, i);
            ids.push(id);
            lats.push(nodo.lat);
            lons.push(nodo.lon);
        }
        return i;
    };
    // Aristas sueltas (u, v, nombre) en el orden en que aparecen
    const nombres = [""];
    const idNombre = new Map([["", 0]]);
    const aristaU = [];
    const aristaV = [];
    const aristaNombre = [];
    const agregar = (u, v, nombre) => {
        aristaU.push(u);
        aristaV.push(v);
        aristaNombre.push(nombre);
    };
    for (const via of vias) {
        const tags = via.tags ?? {};
        const nombre = (tags.name || (usarRef ? tags.ref : "") || "").trim();
        let idN = idNombre.get(nombre);
        if (idN === undefined) {
            idN = nombres.length;
            idNombre.set(nombre, idN);
            nombres.push(nombre);
        }
        const sentidoUnico = respetarSentido &&
            ((tags.oneway !== undefined && VALORES_SENTIDO_UNICO.has(tags.oneway)) || tags.junction === "roundabout");
        const invertida = sentidoUnico && tags.oneway !== undefined && VALORES_SENTIDO_INVERSO.has(tags.oneway);
        const nodos = via.nodes.filter((id) => nodosOSM.has(id));
        for (let k = 1; k < nodos.length; k++) {
            if (nodos[k] === nodos[k - 1])
                continue;
            const a = indiceDe(nodos[k - 1]);
            const b = indiceDe(nodos[k]);
            if (!sentidoUnico) {
                agregar(a, b, idN);
                agregar(b, a, idN);
            }
            else if (invertida) {
                agregar(b, a, idN);
            }
            else {
                agregar(a, b, idN);
            }
        }
    }
    const total = ids.length;
    // 3. Recorte por la zona
    const dentro = new Uint8Array(total).fill(1);
    let nodosFueraDeZona = 0;
    if (opciones.poligonos && opciones.poligonos.length > 0) {
        const zona = new IndiceZona(opciones.poligonos);
        for (let i = 0; i < total; i++) {
            if (!zona.contiene(lons[i], lats[i])) {
                dentro[i] = 0;
                nodosFueraDeZona++;
            }
        }
    }
    // 4. Componente débilmente conectado más grande (unión-búsqueda)
    const conservar = dentro.slice();
    let nodosDesconectados = 0;
    if (!opciones.conservarDesconectados) {
        const padre = new Int32Array(total).map((_, i) => i);
        const raiz = (x) => {
            while (padre[x] !== x) {
                padre[x] = padre[padre[x]];
                x = padre[x];
            }
            return x;
        };
        for (let e = 0; e < aristaU.length; e++) {
            const u = aristaU[e], v = aristaV[e];
            if (dentro[u] && dentro[v]) {
                const ru = raiz(u), rv = raiz(v);
                if (ru !== rv)
                    padre[ru] = rv;
            }
        }
        const tamano = new Map();
        for (let i = 0; i < total; i++)
            if (dentro[i])
                tamano.set(raiz(i), (tamano.get(raiz(i)) ?? 0) + 1);
        let mayor = -1, mayorTam = 0;
        for (const [r, t] of tamano)
            if (t > mayorTam) {
                mayor = r;
                mayorTam = t;
            }
        for (let i = 0; i < total; i++) {
            if (dentro[i] && raiz(i) !== mayor) {
                conservar[i] = 0;
                nodosDesconectados++;
            }
        }
    }
    // Renumerar los nodos conservados y armar el CSR con una arista por par (u, v): peso mínimo y
    // el nombre de la primera aparición (lo mismo que hacía formato_rco.deduplicar en Python)
    const nuevo = new Int32Array(total).fill(-1);
    let n = 0;
    for (let i = 0; i < total; i++)
        if (conservar[i])
            nuevo[i] = n++;
    const porNodo = Array.from({ length: n }, () => []);
    for (let e = 0; e < aristaU.length; e++) {
        const u = nuevo[aristaU[e]], v = nuevo[aristaV[e]];
        if (u < 0 || v < 0)
            continue;
        const ou = aristaU[e], ov = aristaV[e];
        const peso = haversine(lats[ou], lons[ou], lats[ov], lons[ov]);
        const lista = porNodo[u];
        const previa = lista.find((a) => a.v === v);
        if (previa)
            previa.peso = Math.min(previa.peso, peso);
        else
            lista.push({ v, peso, nombre: aristaNombre[e] });
    }
    // Solo los nombres que siguen en uso, en orden de primera aparición
    const nombreNuevo = new Int32Array(nombres.length).fill(-1);
    const nombresUsados = [""];
    nombreNuevo[0] = 0;
    const numAristas = porNodo.reduce((t, l) => t + l.length, 0);
    const grafo = {
        osmIds: new Float64Array(n),
        coords: new Float64Array(2 * n),
        inicio: new Uint32Array(n + 1),
        destino: new Uint32Array(numAristas),
        peso: new Float32Array(numAristas),
        nombreId: new Uint32Array(numAristas),
        nombres: nombresUsados,
        dirigido: respetarSentido,
    };
    let e = 0;
    for (let i = 0; i < total; i++) {
        const u = nuevo[i];
        if (u < 0)
            continue;
        grafo.osmIds[u] = ids[i];
        grafo.coords[2 * u] = lats[i];
        grafo.coords[2 * u + 1] = lons[i];
    }
    for (let u = 0; u < n; u++) {
        for (const a of porNodo[u]) {
            if (nombreNuevo[a.nombre] < 0) {
                nombreNuevo[a.nombre] = nombresUsados.length;
                nombresUsados.push(nombres[a.nombre]);
            }
            grafo.destino[e] = a.v;
            grafo.peso[e] = a.peso;
            grafo.nombreId[e] = nombreNuevo[a.nombre];
            e++;
        }
        grafo.inicio[u + 1] = e;
    }
    return {
        grafo: reordenarGrafo(grafo),
        estadisticas: {
            nodos: n,
            aristas: numAristas,
            vias: vias.length,
            nombresDeCalle: nombresUsados.length - 1,
            nodosFueraDeZona,
            nodosDesconectados,
        },
    };
}
